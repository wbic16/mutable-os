import { canonicalCardex } from './cardex.mjs';
import { isMainThread } from 'node:worker_threads';
import { inspectVaultScope, lockVaultEstablishment } from './vault-scope.mjs';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrate, validateSchema, inspectDatabase, verifyDatabase, rebuildFts, clearDerived, hash } from './schema.mjs';
import { regularFile, directory, prepareHome, writerLock } from './paths.mjs';
import { canonicalPropositions, propositionMutation } from './propositions.mjs';
import { canonicalEntities, entityMutation } from './entities.mjs';
import { canonicalLedger } from './canonical-ledger.mjs';
import { canonicalSemantics, semanticMutation } from './semantics.mjs';
import { openPhextFoundation } from './phext-foundation.mjs';
import { phextKnowledgeFor } from './phext-registry.mjs';
import { PhextKnowledgeStore } from './phext-store.mjs';
import { convertDiskKnowledgeToPhext } from './phext-convert.mjs';
import * as indexing from './reconcile.mjs';

/**
 * The knowledge foundation — dual mode (mode selection, 2026-11-06).
 *
 * Canonical knowledge lives where the Cavern's recorded mode says:
 * in phext mode, in the Cavern phext (L3), with SQLite as an
 * ephemeral replica the phext foundation builds in temp
 * (phext-foundation.mjs); in native mode, in the disk foundation's
 * databases at `.mutable/mutable.db` / `audit.db`, exactly as
 * upstream Mutable has always worked.
 *
 * Mode resolution is signal-based and fail-closed, as it was before
 * the phext-only cutover: phext mode is entered only with a live
 * PhextVFS instance — injected by the knowledge worker
 * (context.phextVfs) or registered for the vault by the Cavern
 * lifecycle (phext-registry.mjs), which registers phext-mode Caverns
 * only. An explicit `options.phextKnowledge` request with no
 * instance available fails closed — knowledge mode is never silently
 * downgraded to disk. With no phext signal at all, the disk
 * foundation opens.
 *
 * The one guard that changed sides at the cutover: a vault holding
 * BOTH a phext and a disk knowledge home, with no native mode
 * recorded in `.mutable/cavern-state.json`, must not be opened on
 * the disk branch — after a non-destructive upgrade the disk home is
 * a frozen snapshot, and writing it would resurrect it as a fork.
 * The lifecycle resolves that state from the Cavern's marker first;
 * a direct disk open refuses and names the way in. On the phext
 * branch the coexistence is the normal post-upgrade state and is
 * not a refusal: the phext is canonical and the snapshot is never
 * touched.
 */
function resolvePhextKnowledge(options, context) {
  if (context?.phextVfs) return { vfs: context.phextVfs, phextPath: context.phextPath };
  const registered = options?.vault ? phextKnowledgeFor(options.vault) : undefined;
  if (registered?.vfs) return registered;
  if (registered || options?.phextKnowledge) throw Error('Phext knowledge mode requires a PhextVFS instance; open through the knowledge worker or register one');
  return undefined;
}

/** The recorded native marker, when the Cavern carries one. */
function recordedNativeMode(vault) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(vault, '.mutable', 'cavern-state.json'), 'utf8'));
    return state?.mode === 'native';
  } catch { return false; }
}

function refuseAmbiguousDiskOpen(vault) {
  if (typeof vault !== 'string') return;
  if (!fs.existsSync(path.join(vault, '.mutable', 'mutable.db'))) return;
  if (!fs.existsSync(path.join(vault, 'cavern.phext'))) return;
  if (recordedNativeMode(vault)) return;
  throw Error('This vault holds both a phext store and a disk knowledge home (.mutable/mutable.db), and no recorded mode says the disk copy is current; open the Cavern through the server so the recorded mode governs');
}

export function openFoundation(options = {}, context = {}) {
  const phext = resolvePhextKnowledge(options, context);
  if (phext) {
    if (!isMainThread) {
      if (!context.scopeValidated) throw Error('Vault scope was not verified by the host');
      return openPhextFoundation(options, { ...context, phext });
    }
    const release = lockVaultEstablishment();
    try {
      inspectVaultScope(options.vault);
      return openPhextFoundation(options, { ...context, phext });
    } finally { release(); }
  }
  refuseAmbiguousDiskOpen(options.vault);
  if (!isMainThread) {
    if (!context.scopeValidated) throw Error('Vault scope was not verified by the host');
    return openValidatedFoundation(options, context);
  }
  const release = lockVaultEstablishment();
  try {
    inspectVaultScope(options.vault);
    return openValidatedFoundation(options, context);
  } finally { release(); }
}

function checkFiles(home, kind = 'mutable') {
  for (const suffix of ['', '-wal', '-shm', '-journal']) regularFile(path.join(home, `${kind}.db${suffix}`), true);
}
function syncFile(file) { const fd = fs.openSync(file, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function syncDirectory(dir) { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function initialize(file, kind, vaultGuid) {
  const temporary = `${file}.init-${randomUUID()}`;
  const fd = fs.openSync(temporary, 'wx', 0o600); fs.closeSync(fd);
  let db;
  try {
    db = new Database(temporary, { fileMustExist: true });
    migrate(db, kind, { fresh: true, vaultGuid });
    db.close(); db = undefined; syncFile(temporary);
    // Publish without replacing anything that appeared at the destination.
    fs.linkSync(temporary, file); fs.unlinkSync(temporary); syncDirectory(path.dirname(file));
  } finally { db?.close(); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function openValidatedFoundation({ vault, readOnly = false, initialize: create = false, semanticServicesEnabled = true, thesisEnabled = true, entityReader = false } = {}, { hostLeaseHeld = false } = {}) {
  const { root, home } = prepareHome({ vault, readOnly, initialize: create }); checkFiles(home);
  let unlock, mutable, audit, closed = false, auditError;
  try {
    if (!readOnly && !hostLeaseHeld) unlock = writerLock(home);
    const currentFile = path.join(home, 'mutable.db');
    if (!fs.existsSync(currentFile) && create) {
      // An orphan audit cannot establish the lost current knowledge identity.
      if (fs.existsSync(path.join(home, 'audit.db'))) throw Error('Current database missing beside existing audit; restore current knowledge explicitly');
      initialize(currentFile, 'mutable');
    }
    mutable = new Database(currentFile, { readonly: readOnly, fileMustExist: true, timeout: 1000 });
    const identity = validateSchema(mutable, 'mutable');
    if (create) migrate(mutable, 'mutable');
    configure(mutable, readOnly);
    if (!entityReader) try {
      checkFiles(home, 'audit');
      const auditFile = path.join(home, 'audit.db');
      if (!fs.existsSync(auditFile) && create) initialize(auditFile, 'audit', identity.vaultGuid);
      audit = new Database(auditFile, { readonly: readOnly, fileMustExist: true, timeout: 1000 });
      validateSchema(audit, 'audit', identity.vaultGuid);
      if (create) migrate(audit, 'audit', { vaultGuid: identity.vaultGuid });
      configure(audit, readOnly);
    } catch (e) { audit?.close(); audit = undefined; auditError = e.message; }
    const writable = () => { if (readOnly) throw Error('SQLite foundation is read-only'); };
    const active = () => {
      if (closed) throw Error('SQLite foundation is closed'); directory(home); regularFile(currentFile); checkFiles(home);
      if (audit) try { regularFile(path.join(home, 'audit.db')); checkFiles(home, 'audit'); } catch (e) { audit.close(); audit = undefined; auditError = e.message; }
    };
    const ledger = canonicalLedger(mutable, () => audit);
    const semanticActive = () => {
      active(); if (!semanticServicesEnabled) throw Error('Semantic services are disabled');
      if (!mutable.prepare("SELECT 1 FROM sqlite_schema WHERE name='Claim'").get()) throw Error('Semantic schema upgrade required');
    };
    return {
      vaultGuid: identity.vaultGuid,
      entities(request, check) { active(); if (entityMutation(request.op)) writable(); return canonicalEntities(mutable, request, check, ledger); },
      cardex(request, check) { active(); if (request.op === 'semantic') semanticActive(); if (['save', 'delete', 'restore', 'bulk-state'].includes(request.op) || request.op === 'semantic' && request.command?.op !== 'get') writable(); return canonicalCardex(mutable, ledger, request, check); },
      propositions(request, check) { active(); if (!thesisEnabled) throw Error('Thesis is disabled'); if (propositionMutation(request.op)) writable(); return canonicalPropositions(mutable, ledger, request, check); },
      semantics(request, check) { semanticActive(); if (semanticMutation(request)) writable(); return canonicalSemantics(mutable, ledger, request, check); },
      auditStatus() { active(); return ledger.status(); },
      operationOutcome(id) { active(); return ledger.outcome(id); },
      deliverAudit(options, check) { active(); writable(); return ledger.deliver(options, check); },
      knowledgeRevision() { active(); return indexing.sqlRevision(mutable); },
      readKnowledge(reader) { active(); return reader(mutable); },
      inventory() { active(); return indexing.inventory(mutable); },
      indexStatus() {
        active(); return {
          resources: mutable.prepare('SELECT count(*) AS n FROM Resource').get().n,
          incompleteResources: mutable.prepare("SELECT count(*) AS n FROM Resource WHERE indexStatus!='complete'").get().n,
          issueCount: mutable.prepare('SELECT count(*) AS n FROM IndexIssue').get().n,
          issues: mutable.prepare('SELECT path,reason FROM IndexIssue ORDER BY path LIMIT 32').all(),
        };
      },
      indexingBaseline(id) { active(); return indexing.baseline(mutable, id); },
      resourceProjection(id) { active(); return indexing.readProjection(mutable, id); },
      prepareReconciliation(projection, evidence, expected, options) { active(); return indexing.prepareReconciliation(mutable, projection, evidence, expected, options); },
      commitReconciliation(plan, options) { active(); writable(); return indexing.commitReconciliation(mutable, plan, options); },
      reconcile(projection, evidence, expected, options) { active(); writable(); return indexing.reconcile(mutable, projection, evidence, expected, options); },
      removeConfirmed(id, expected) { active(); writable(); return indexing.removeConfirmed(mutable, id, expected); },
      recordIssue(path, reason) { active(); writable(); return indexing.recordIssue(mutable, path, reason); },
      finishReconciliation() { active(); writable(); mutable.prepare('DELETE FROM IndexIssue').run(); return { complete: true, revision: indexing.sqlRevision(mutable) }; },
      inspect() { active(); return { root, home, readOnly, mutable: inspectDatabase(mutable, 'mutable'), audit: audit ? inspectDatabase(audit, 'audit') : { available: false, error: auditError } }; },
      verify() { active(); const current = verifyDatabase(mutable, 'mutable'); return { ok: current.ok, mutable: current, audit: audit ? verifyDatabase(audit, 'audit') : { available: false, error: auditError } }; },
      rebuildFts() { active(); writable(); rebuildFts(mutable); return verifyDatabase(mutable, 'mutable'); },
      clearDerived() { active(); writable(); clearDerived(mutable); return { cleared: true, repopulated: false, message: 'File-derived rows invalidated; run reconciliation to repopulate from authoritative saved files.' }; },
      async backup(destination) {
        active();
        if (typeof destination !== 'string' || !path.isAbsolute(destination)) throw Error('Backup requires an absolute new directory');
        const parent = directory(path.dirname(destination)), name = path.basename(destination);
        const target = path.join(parent, name);
        if (target === home || target.startsWith(home + path.sep)) throw Error('Backup must be outside the live database directory');
        fs.mkdirSync(target, { mode: 0o700 }); // Explicitly no replacement/merging.
        const files = {};
        for (const [kind, db] of [['mutable', mutable], ['audit', audit]]) {
          if (!db) continue;
          const file = path.join(target, `${kind}.db`);
          await db.backup(file); fs.chmodSync(file, 0o600); syncFile(file);
          const check = new Database(file, { readonly: true, fileMustExist: true });
          try { validateSchema(check, kind, identity.vaultGuid); if (!verifyDatabase(check, kind).ok) throw Error('Backup integrity check failed'); }
          finally { check.close(); }
          files[kind] = { sha256: hash(fs.readFileSync(file)) };
        }
        const manifest = {
          format: 'mutable-sqlite-backup', version: 1, vaultGuid: identity.vaultGuid, createdUtc: new Date().toISOString(), files,
          scope: 'database-only', atomicAcrossDatabases: false, auditAvailable: !!audit,
          // Provenance: the mode of the foundation that produced
          // this snapshot. A restore into an unestablished
          // destination derives its mode from it (client.mjs);
          // established destinations never consult it.
          sourceMode: 'native',
        };
        const marker = path.join(target, 'snapshot.json'); fs.writeFileSync(marker, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); syncFile(marker); syncDirectory(target);
        return { directory: target, ...manifest };
      },
      close() { if (closed) return; closed = true; try { audit?.close(); } finally { try { mutable.close(); } finally { unlock?.(); } } },
    };
  } catch (e) { audit?.close(); mutable?.close(); unlock?.(); throw e; }
}
function configure(db, readOnly) {
  db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 1000');
  if (!readOnly) {
    if (db.pragma('journal_mode = WAL', { simple: true }) !== 'wal') throw Error('Local WAL mode unavailable');
    db.pragma('synchronous = FULL');
  }
  if (db.pragma('foreign_keys', { simple: true }) !== 1) throw Error('Foreign key enforcement unavailable');
}

/**
 * Restore a SQLite snapshot (the `mutable-sqlite-backup` format both
 * foundations' backup() produces). The destination's mode decides
 * the form: with a PhextVFS instance the snapshot is validated and
 * hash-verified from private staged copies, then CONVERTED into the
 * destination's phext by the same verified converter migration uses
 * (nothing is published as database files); without one, the
 * validated databases are published into the destination's
 * `.mutable` home, as before the cutover. Refusals: a malformed or
 * hash-mismatched snapshot, a non-empty disk destination, and a
 * destination phext that already has knowledge (the converter's own
 * refusal). Restore only into a knowledge-free Cavern, never over
 * live knowledge. No file-resource restore claim.
 */
export function restoreSnapshot(source, destination, scopeValidated = false, vfs = undefined) {
  if (!isMainThread) {
    if (!scopeValidated) throw Error('Vault restore scope was not verified');
    return vfs ? restoreIntoPhext(source, destination, vfs) : restoreValidatedSnapshot(source, destination);
  }
  const release = lockVaultEstablishment();
  try {
    inspectVaultScope(destination);
    return vfs ? restoreIntoPhext(source, destination, vfs) : restoreValidatedSnapshot(source, destination);
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
    if (!vfs) throw Error('Restoring a SQLite snapshot into a Cavern requires the destination’s PhextVFS instance');
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

/** Restore only into an empty destination, never over a live vault. No file-resource restore claim. */
function restoreValidatedSnapshot(source, destination) {
  if (typeof source !== 'string' || !path.isAbsolute(source) || typeof destination !== 'string' || !path.isAbsolute(destination)) throw Error('Restore requires absolute source and destination directories');
  const backup = directory(source), target = directory(destination);
  if (fs.readdirSync(target).length) throw Error('Restore requires an empty destination directory');
  regularFile(path.join(backup, 'snapshot.json'));
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'snapshot.json'), 'utf8'));
  if (manifest.format !== 'mutable-sqlite-backup' || manifest.version !== 1 || typeof manifest.vaultGuid !== 'string' ||
    manifest.scope !== 'database-only' || manifest.atomicAcrossDatabases !== false || !manifest.files?.mutable ||
    Object.keys(manifest.files).some(k => !['mutable', 'audit'].includes(k)) ||
    Object.values(manifest.files).some(f => !f || typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256))) throw Error('Unsupported backup manifest');
  const staged = path.join(target, `.mutable-restore-${randomUUID()}`); fs.mkdirSync(staged, { mode: 0o700 });
  try {
    for (const kind of Object.keys(manifest.files)) {
      const from = path.join(backup, `${kind}.db`), to = path.join(staged, `${kind}.db`); regularFile(from);
      // Copy then verify the private copy: do not trust a source that can change after hashing.
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); fs.chmodSync(to, 0o600);
      if (hash(fs.readFileSync(to)) !== manifest.files[kind].sha256) throw Error('Backup hash mismatch');
      const db = new Database(to, { fileMustExist: true });
      try {
        validateSchema(db, kind, manifest.vaultGuid); if (!verifyDatabase(db, kind).ok) throw Error('Invalid backup database');
        // This snapshot contains no authoritative resource files at the new location.
        if (kind === 'mutable') db.prepare("UPDATE Resource SET indexStatus='stale'").run();
      }
      finally { db.close(); }
      syncFile(to);
    }
    // mkdir provides no-replace semantics; publish each file only to this newly created private directory.
    const home = path.join(target, '.mutable'); fs.mkdirSync(home, { mode: 0o700 });
    for (const kind of Object.keys(manifest.files)) { const from = path.join(staged, `${kind}.db`); fs.linkSync(from, path.join(home, `${kind}.db`)); fs.unlinkSync(from); }
    syncDirectory(home); syncDirectory(target);
    return { restored: true, vaultGuid: manifest.vaultGuid, filesIncluded: false, reconciliationRequired: true };
  } finally { fs.rmSync(staged, { recursive: true, force: true }); }
}
