import { isMainThread } from 'node:worker_threads';
import { inspectVaultScope, lockVaultEstablishment } from './vault-scope.mjs';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateSchema, verifyDatabase, hash } from './schema.mjs';
import { regularFile, directory } from './paths.mjs';
import { openPhextFoundation } from './phext-foundation.mjs';
import { phextKnowledgeFor } from './phext-registry.mjs';
import { PhextKnowledgeStore } from './phext-store.mjs';
import { convertDiskKnowledgeToPhext } from './phext-convert.mjs';

/**
 * The knowledge foundation — PHEXT-ONLY (cutover, 2026-11-05).
 *
 * Canonical knowledge lives in the Cavern phext (L3); SQLite is an
 * ephemeral replica the phext foundation builds in temp
 * (phext-foundation.mjs). The disk foundation that kept canonical
 * databases at `.mutable/mutable.db` / `audit.db` is DELETED, along
 * with its open path. What remains here is the mode seam
 * (openFoundation) and snapshot restore, which now CONVERTS a
 * SQLite backup into the destination Cavern's phext instead of
 * publishing database files into it.
 *
 * Mode resolution is fail-closed: a PhextVFS instance must be
 * injected by the knowledge worker (context.phextVfs) or registered
 * for the vault by the Cavern lifecycle with an instance attached.
 * There is no disk fallback to downgrade to.
 */
function resolvePhextKnowledge(options, context) {
  if (context?.phextVfs) return { vfs: context.phextVfs, phextPath: context.phextPath };
  const registered = options?.vault ? phextKnowledgeFor(options.vault) : undefined;
  if (registered?.vfs) return registered;
  throw Error('Phext knowledge mode requires a PhextVFS instance; open through the knowledge worker or register one');
}

/**
 * A vault that still carries a disk knowledge home has not been
 * converted (conversion renames `.mutable` aside). Opening it here
 * would mint fresh phext knowledge beside the disk state and
 * silently orphan it — refuse, and name the way in.
 */
function refuseUnconvertedDiskKnowledge(vault) {
  if (typeof vault === 'string' && fs.existsSync(path.join(vault, '.mutable', 'mutable.db'))) {
    throw Error('This vault still holds disk knowledge (.mutable/mutable.db); open the Cavern through the server once to convert it to phext');
  }
}

export function openFoundation(options = {}, context = {}) {
  if (!isMainThread) {
    if (!context.scopeValidated) throw Error('Vault scope was not verified by the host');
    const phext = resolvePhextKnowledge(options, context);
    refuseUnconvertedDiskKnowledge(options.vault);
    return openPhextFoundation(options, { ...context, phext });
  }
  const release = lockVaultEstablishment();
  try {
    inspectVaultScope(options.vault);
    const phext = resolvePhextKnowledge(options, context);
    refuseUnconvertedDiskKnowledge(options.vault);
    return openPhextFoundation(options, { ...context, phext });
  } finally { release(); }
}

function syncFile(file) { const fd = fs.openSync(file, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }

/**
 * Restore a SQLite snapshot (the `mutable-sqlite-backup` format the
 * phext foundation's backup() produces) into a Cavern. The snapshot
 * is a transport format: its databases are validated and
 * hash-verified from private staged copies, then CONVERTED into
 * the destination's phext by the same verified converter migration
 * uses. Nothing is published as database files. Refusals: a
 * malformed or hash-mismatched snapshot, and a destination phext
 * that already has knowledge (the converter's own refusal).
 * Restore only into a knowledge-free Cavern, never over live
 * knowledge. No file-resource restore claim.
 */
export function restoreSnapshot(source, destination, scopeValidated = false, vfs = undefined) {
  if (!isMainThread) {
    if (!scopeValidated) throw Error('Vault restore scope was not verified');
    return restoreIntoPhext(source, destination, vfs);
  }
  const release = lockVaultEstablishment();
  try {
    inspectVaultScope(destination);
    return restoreIntoPhext(source, destination, vfs);
  } finally { release(); }
}

function restoreIntoPhext(source, destination, vfs) {
  if (typeof source !== 'string' || !path.isAbsolute(source) || typeof destination !== 'string' || !path.isAbsolute(destination)) throw Error('Restore requires absolute source and destination directories');
  const backup = directory(source), target = directory(destination);
  regularFile(path.join(backup, 'snapshot.json'));
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'snapshot.json'), 'utf8'));
  if (manifest.format !== 'mutable-sqlite-backup' || manifest.version !== 1 || typeof manifest.vaultGuid !== 'string' ||
    manifest.scope !== 'database-only' || manifest.atomicAcrossDatabases !== false || !manifest.files?.mutable ||
    Object.keys(manifest.files).some(k => !['mutable', 'audit'].includes(k)) ||
    Object.values(manifest.files).some(f => !f || typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256))) throw Error('Unsupported backup manifest');
  const staged = fs.mkdtempSync(path.join(os.tmpdir(), `mutable-restore-${randomUUID()}-`));
  try {
    for (const kind of Object.keys(manifest.files)) {
      const from = path.join(backup, `${kind}.db`), to = path.join(staged, `${kind}.db`); regularFile(from);
      // Copy then verify the private copy: do not trust a source that can change after hashing.
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); fs.chmodSync(to, 0o600);
      if (hash(fs.readFileSync(to)) !== manifest.files[kind].sha256) throw Error('Backup hash mismatch');
      const db = new Database(to, { fileMustExist: true });
      try {
        validateSchema(db, kind, manifest.vaultGuid); if (!verifyDatabase(db, kind).ok) throw Error('Invalid backup database');
        // Note: no stale-marking of Resource rows — the converter
        // carries canonical knowledge only; derived projections are
        // repopulated from the destination Cavern's own documents
        // by reconciliation, never from a database-only snapshot.
      }
      finally { db.close(); }
      syncFile(to);
    }
    // The snapshot is fully validated and hash-verified above; only
    // the conversion itself needs the destination's VFS.
    if (!vfs) throw Error('Restoring a SQLite snapshot into a Cavern requires the destination\u2019s PhextVFS instance');
    const store = new PhextKnowledgeStore(vfs);
    convertDiskKnowledgeToPhext({
      mutableFile: path.join(staged, 'mutable.db'),
      auditFile: manifest.files.audit ? path.join(staged, 'audit.db') : undefined,
      store,
    });
    vfs.flush();
    return { restored: true, vaultGuid: manifest.vaultGuid, filesIncluded: false, reconciliationRequired: true };
  } finally { fs.rmSync(staged, { recursive: true, force: true }); }
}
