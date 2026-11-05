/**
 * PhextVFS Phase 4 — the foundation swap.
 *
 * `openPhextFoundation` returns the same store object shape as
 * `foundation.mjs`'s disk foundation, with the storage unraveled
 * (design §3.3):
 *
 * - Tier 1 — the phext is the only canonical store. Canonical
 *   records live in L3 (see phext-store.mjs) and every canonical
 *   write goes through the ported ledger (phext-ledger.mjs), whose
 *   commit is a VFS flush.
 * - Tier 2 — an ephemeral SQLite database in a fresh temp directory
 *   (mode 0700, deleted at close) is the query cache: today's
 *   migrations verbatim provide its schema, a replica of the
 *   canonical tables is copied in from L3 at open, and the derived
 *   projection is produced by the existing reconciliation pipeline
 *   (driven by the saved indexer, exactly as after a disk
 *   `clearDerived`). Every SQL consumer — entities, cardex,
 *   semantics, propositions, saved-facts, entity-lookup,
 *   package-data, the indexer — runs unchanged against it.
 *
 * The replica can be deleted mid-run without loss (worst case:
 * reopen cost); it is never inside the Cavern, never shipped.
 * Consistency-critical surfaces (audit status, operation outcome,
 * mutation idempotency) are served from L3 by the ledger itself.
 *
 * Establishment (design §2.2/§4): the vaultGuid is minted once at
 * first establishment into the control record (at the L3 root —
 * see the placement note in phext-store.mjs) and never re-minted;
 * detection is the phext + a valid control record; a phext holding
 * knowledge records but no control record is refused, never
 * auto-repaired — the fail-closed posture of `inspectVaultScope`.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  migrate, inspectDatabase, verifyDatabase, rebuildFts, clearDerived,
} from './schema.mjs';
import { directory } from './paths.mjs';
import { canonicalPropositions, propositionMutation } from './propositions.mjs';
import { canonicalEntities, entityMutation } from './entities.mjs';
import { canonicalSemantics, semanticMutation } from './semantics.mjs';
import { canonicalCardex } from './cardex.mjs';
import { canonicalTables } from './canonical-ledger.mjs';
import * as indexing from './reconcile.mjs';
import { PhextKnowledgeStore, recordToRow } from './phext-store.mjs';
import { phextLedger } from './phext-ledger.mjs';
import { exportPhextKnowledge } from './phext-convert.mjs';

function insertRecord(db, table, record) {
  const row = recordToRow(record);
  const columns = Object.keys(row);
  if (!columns.length) throw Error(`Canonical ${table} record is empty`);
  db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`)
    .run(...columns.map(c => row[c]));
}

/** Build the Tier 2 replica: migrations for schema, L3 for content. */
export function buildKnowledgeReplica(store, vaultGuid) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutable-knowledge-'));
  const file = path.join(dir, 'mutable.db');
  let db;
  try {
    fs.chmodSync(dir, 0o700);
    db = new Database(file);
    migrate(db, 'mutable', { fresh: true, vaultGuid });
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 1000');
    if (db.pragma('journal_mode = WAL', { simple: true }) !== 'wal') throw Error('Local WAL mode unavailable');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        for (const table of [...canonicalTables, 'Actor']) {
          for (const { record } of store.listRecords(table)) insertRecord(db, table, record);
        }
        for (const entityGuid of store.aggregateIds()) {
          const aggregate = store.readAggregate(entityGuid);
          if (!aggregate?.block) throw Error(`Proposition aggregate is malformed: ${entityGuid}`);
          insertRecord(db, 'Block', aggregate.block);
          for (const property of aggregate.properties ?? []) insertRecord(db, 'StandoffProperty', property);
          if (aggregate.block.text != null) {
            db.prepare('INSERT INTO BlockTextRun(blockGuid,ordinal,text) VALUES(?,0,?)')
              .run(aggregate.block.guid, aggregate.block.text);
          }
        }
      }).immediate();
      if (db.pragma('foreign_key_check').length) {
        throw Error('Phext knowledge replica failed its foreign key check');
      }
    } finally { db.pragma('foreign_keys = ON'); }
    return { db, dir, file };
  } catch (e) {
    try { db?.close(); } catch { /* already closed */ }
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

export function openPhextFoundation(options = {}, context = {}) {
  const {
    vault, readOnly = false, initialize: create = false,
    semanticServicesEnabled = true, thesisEnabled = true,
  } = options;
  const phext = context.phext;
  if (!phext?.vfs) throw Error('Phext knowledge mode requires a PhextVFS instance');
  if (readOnly && create) throw Error('Read-only mode cannot initialize databases');
  const root = directory(vault);
  const store = new PhextKnowledgeStore(phext.vfs);

  let control = store.readControl();
  if (!control) {
    if (store.hasAnyContent()) {
      throw Error('Phext knowledge control record is missing beside existing knowledge records; restore current knowledge explicitly');
    }
    if (!create) throw Error('Phext knowledge is not established for this Cavern');
    control = {
      vaultGuid: randomUUID(),
      knowledgeEpoch: 0,
      canonicalMutationCount: 0,
      createdUtc: new Date().toISOString(),
      strata: { knowledge: 'phext' },
    };
    store.writeControl(control);
    store.mirrorVaultGuid(control.vaultGuid);
    store.flush();
  } else {
    store.mirrorVaultGuid(control.vaultGuid);
  }
  const vaultGuid = control.vaultGuid;

  // The audit trail is data in L3; a parse-level corruption degrades
  // it to the disk foundation's auditError posture (mutations proceed,
  // delivery and delivered-outcome resolution refuse) rather than
  // taking the vault down. Byte-level corruption never reaches here:
  // the VFS verifies L9 checksums at open.
  let auditAvailable = true, auditError;
  try {
    for (const entry of store.listAudit()) JSON.parse(entry.attributes ?? 'null');
  } catch (e) { auditAvailable = false; auditError = e.message; }

  const { db: replica, dir: tempDir, file: replicaFile } = buildKnowledgeReplica(store, vaultGuid);
  let closed = false;
  const writable = () => { if (readOnly) throw Error('SQLite foundation is read-only'); };
  const active = () => { if (closed) throw Error('SQLite foundation is closed'); };
  const bumpEpoch = () => {
    control = {
      ...control,
      knowledgeEpoch: (control.knowledgeEpoch ?? 0) + 1,
      canonicalMutationCount: (control.canonicalMutationCount ?? 0) + 1,
    };
    store.writeControl(control);
  };
  const ledger = phextLedger({ store, replica, bumpEpoch, auditAvailable: () => auditAvailable });
  const semanticActive = () => {
    active();
    if (!semanticServicesEnabled) throw Error('Semantic services are disabled');
    if (!replica.prepare("SELECT 1 FROM sqlite_schema WHERE name='Claim'").get()) {
      throw Error('Semantic schema upgrade required');
    }
  };
  const auditCounts = () => {
    const entries = store.listAudit();
    return {
      AuditMutation: entries.length,
      AuditEvent: entries.reduce((sum, e) => sum + (e.events?.length ?? 0), 0),
    };
  };

  return {
    vaultGuid,
    entities(request, check) { active(); if (entityMutation(request.op)) writable(); return canonicalEntities(replica, request, check, ledger); },
    cardex(request, check) {
      active();
      if (request.op === 'semantic') semanticActive();
      if (['save', 'delete', 'restore', 'bulk-state'].includes(request.op) ||
          (request.op === 'semantic' && request.command?.op !== 'get')) writable();
      return canonicalCardex(replica, ledger, request, check);
    },
    propositions(request, check) {
      active();
      if (!thesisEnabled) throw Error('Thesis is disabled');
      if (propositionMutation(request.op)) writable();
      return canonicalPropositions(replica, ledger, request, check);
    },
    semantics(request, check) { semanticActive(); if (semanticMutation(request)) writable(); return canonicalSemantics(replica, ledger, request, check); },
    auditStatus() { active(); return ledger.status(); },
    operationOutcome(id) { active(); return ledger.outcome(id); },
    deliverAudit(deliverOptions, check) { active(); writable(); return ledger.deliver(deliverOptions, check); },
    knowledgeRevision() { active(); return indexing.sqlRevision(replica); },
    readKnowledge(reader) { active(); return reader(replica); },
    inventory() { active(); return indexing.inventory(replica); },
    indexStatus() {
      active();
      return {
        resources: replica.prepare('SELECT count(*) AS n FROM Resource').get().n,
        incompleteResources: replica.prepare("SELECT count(*) AS n FROM Resource WHERE indexStatus!='complete'").get().n,
        issueCount: replica.prepare('SELECT count(*) AS n FROM IndexIssue').get().n,
        issues: replica.prepare('SELECT path,reason FROM IndexIssue ORDER BY path LIMIT 32').all(),
      };
    },
    indexingBaseline(id) { active(); return indexing.baseline(replica, id); },
    resourceProjection(id) { active(); return indexing.readProjection(replica, id); },
    prepareReconciliation(projection, evidence, expected, prepareOptions) { active(); return indexing.prepareReconciliation(replica, projection, evidence, expected, prepareOptions); },
    commitReconciliation(plan, commitOptions) { active(); writable(); return indexing.commitReconciliation(replica, plan, commitOptions); },
    reconcile(projection, evidence, expected, reconcileOptions) { active(); writable(); return indexing.reconcile(replica, projection, evidence, expected, reconcileOptions); },
    removeConfirmed(id, expected) { active(); writable(); return indexing.removeConfirmed(replica, id, expected); },
    recordIssue(issuePath, reason) { active(); writable(); return indexing.recordIssue(replica, issuePath, reason); },
    finishReconciliation() { active(); writable(); replica.prepare('DELETE FROM IndexIssue').run(); return { complete: true, revision: indexing.sqlRevision(replica) }; },
    inspect() {
      active();
      return {
        root, home: path.dirname(phext.phextPath), readOnly, phext: phext.phextPath,
        mutable: inspectDatabase(replica, 'mutable'),
        audit: auditAvailable
          ? { kind: 'audit', vaultGuid, version: 1, counts: auditCounts() }
          : { available: false, error: auditError },
      };
    },
    verify() {
      active();
      const current = verifyDatabase(replica, 'mutable');
      return {
        ok: current.ok && auditAvailable,
        mutable: current,
        audit: auditAvailable
          ? { ok: true, integrity: ['ok'], foreignKeys: [], fts: 'not-applicable' }
          : { available: false, error: auditError },
      };
    },
    rebuildFts() { active(); writable(); rebuildFts(replica); return verifyDatabase(replica, 'mutable'); },
    clearDerived() {
      active(); writable(); clearDerived(replica);
      return { cleared: true, repopulated: false, message: 'File-derived rows invalidated; run reconciliation to repopulate from authoritative saved files.' };
    },
    /** The ephemeral replica's file (cardex regex worker input). */
    cacheFile() { active(); return replicaFile; },
    async backup(destination) {
      active();
      return exportPhextKnowledge({ store, vaultGuid, destination });
    },
    close() {
      if (closed) return;
      closed = true;
      try { replica.close(); } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
    },
  };
}
