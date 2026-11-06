/**
 * PhextVFS Phase 4 — converter and export (design §6).
 *
 * `convertDiskKnowledgeToPhext` moves a disk-mode Cavern's canonical
 * knowledge into L3: every canonical table (authored alias origins
 * only), the proposition aggregates, the pending outbox payloads
 * *verbatim* (receipts reference operationIds and must keep
 * resolving), and the delivered audit trail. The conversion proves
 * itself before it is trusted:
 *
 * - per-table row counts, SQL dump vs L3 readback, equal;
 * - per-record SHA-256 over the canonical record text, dump vs the
 *   exact bytes stored in L3;
 * - audit cross-checks: each delivered mutation's stored
 *   `payloadHash` must equal the SHA-256 of its receipt payload, and
 *   its `AuditEvent` rows must equal the events its receipt carries
 *   (the same equality `deliver()` verifies) — the two audit
 *   representations must agree before either is trusted;
 * - the vaultGuid is preserved, never re-minted.
 *
 * `exportPhextKnowledge` is the reverse path, doubling as the phext
 * foundation's `backup()`: it materializes a fresh disk foundation
 * (mutable.db + audit.db + the standard `snapshot.json` manifest)
 * from L3, so a converted Cavern can return to disk mode through the
 * existing `restoreSnapshot` unchanged. Rollback is a round trip,
 * not a cliff.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrate, validateSchema, verifyDatabase, hash } from './schema.mjs';
import { directory } from './paths.mjs';
import { canonicalTables } from './canonical-ledger.mjs';
import {
  PhextKnowledgeStore, AUTHORED_ALIAS_ORIGINS, identityOf,
  recordText, recordToRow, rowToRecord,
} from './phext-store.mjs';

const PROPOSITION_TYPE = 'mutable/proposition-block';
const TABLES = [...canonicalTables, 'Actor'];

/** Key-order-insensitive canonical form for dump comparisons. */
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canon(value[k])]));
  }
  return value;
}
const canonText = value => JSON.stringify(canon(value));

function syncFile(file) { const fd = fs.openSync(file, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function syncDirectory(dir) { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }

const eventShape = row => ({
  guid: row.guid, operation: row.operation, recordType: row.recordType, recordGuid: row.recordGuid,
  beforeJson: row.beforeJson ?? null, afterJson: row.afterJson ?? null,
});
const byGuid = (a, b) => (a.guid < b.guid ? -1 : 1);

/** The canonical dump of a disk foundation, in L3's shapes. */
export function dumpDiskKnowledge({ mutableFile, auditFile }) {
  const mutable = new Database(mutableFile, { readonly: true, fileMustExist: true });
  try {
    const identity = validateSchema(mutable, 'mutable');
    const tables = {};
    for (const table of TABLES) {
      const rows = table === 'EntityAlias'
        ? mutable.prepare(`SELECT * FROM EntityAlias WHERE origin IN ('curated','imported')`).all()
        : mutable.prepare(`SELECT * FROM ${table}`).all();
      const idColumn = identityOf(table);
      tables[table] = rows.map(rowToRecord).sort((a, b) => (a[idColumn] < b[idColumn] ? -1 : 1));
    }
    const propositions = {};
    for (const block of mutable.prepare('SELECT * FROM Block WHERE resourceGuid IS NULL AND typename=?').all(PROPOSITION_TYPE)) {
      const properties = mutable.prepare('SELECT * FROM StandoffProperty WHERE sourceBlockGuid=? ORDER BY guid').all(block.guid).map(rowToRecord);
      propositions[block.entityGuid] = { block: rowToRecord(block), properties };
    }
    const outbox = mutable.prepare('SELECT guid,timestampUtc,payload FROM PendingAuditMutation ORDER BY guid').all()
      .map(r => ({ guid: r.guid, timestampUtc: r.timestampUtc, payload: r.payload }));
    let audit = [];
    if (auditFile && fs.existsSync(auditFile)) {
      const auditDb = new Database(auditFile, { readonly: true, fileMustExist: true });
      try {
        validateSchema(auditDb, 'audit', identity.vaultGuid);
        audit = auditDb.prepare('SELECT guid,actorGuid,timestampUtc,attributes FROM AuditMutation ORDER BY guid').all()
          .map(m => ({
            guid: m.guid, actorGuid: m.actorGuid, timestampUtc: m.timestampUtc, attributes: m.attributes,
            events: auditDb.prepare('SELECT guid,operation,recordType,recordGuid,beforeJson,afterJson FROM AuditEvent WHERE mutationGuid=?').all(m.guid).map(eventShape).sort(byGuid),
          }));
      } finally { auditDb.close(); }
    }
    return { vaultGuid: identity.vaultGuid, tables, propositions, outbox, audit };
  } finally { mutable.close(); }
}

/** The same dump read back from L3 (post-conversion verification). */
export function dumpPhextKnowledge(store, { includeAudit = true } = {}) {
  const control = store.readControl();
  if (!control) throw Error('Phext knowledge is not established; nothing to dump');
  const tables = {};
  for (const table of TABLES) {
    const idColumn = identityOf(table);
    tables[table] = store.listRecords(table).map(({ record }) => record)
      .sort((a, b) => (a[idColumn] < b[idColumn] ? -1 : 1));
  }
  const propositions = {};
  for (const entityGuid of store.aggregateIds()) propositions[entityGuid] = store.readAggregate(entityGuid);
  const outbox = store.listOutbox().map(r => ({ guid: r.operationId, timestampUtc: r.timestampUtc, payload: r.payload }))
    .sort(byGuid);
  // includeAudit:false is the backup-with-unavailable-audit path: a
  // corrupt audit stratum degrades audit surfaces, never canonical
  // ones, so the dump must not parse the audit entries at all.
  const audit = includeAudit ? store.listAudit().map(e => ({
    guid: e.guid, actorGuid: e.actorGuid ?? null, timestampUtc: e.timestampUtc, attributes: e.attributes,
    events: [...(e.events ?? [])].map(eventShape).sort(byGuid),
  })).sort(byGuid) : [];
  return { vaultGuid: control.vaultGuid, tables, propositions, outbox, audit };
}

/** Design §6 step 3: the two audit representations must agree. */
function verifyAuditDump(dump) {
  for (const mutation of dump.audit) {
    const metadata = JSON.parse(mutation.attributes ?? 'null');
    if (!metadata?.receipt) throw Error(`Audit mutation ${mutation.guid} has no compatible operation receipt`);
    if (hash(JSON.stringify(metadata.receipt)) !== metadata.payloadHash) {
      throw Error(`Audit payload fingerprint mismatch for ${mutation.guid}`);
    }
    const legacy = metadata.receipt.version !== 2;
    const wanted = legacy
      ? [{
          guid: legacyEventId(mutation.guid), operation: 'preserve', recordType: 'LegacyOperationReceipt',
          recordGuid: mutation.guid, beforeJson: null,
          afterJson: JSON.stringify({ request: metadata.receipt.request, result: metadata.receipt.result }),
        }]
      : metadata.receipt.events.map(e => ({
          guid: e.guid, operation: e.operation, recordType: e.recordType, recordGuid: e.recordGuid,
          beforeJson: e.before === null ? null : JSON.stringify(e.before),
          afterJson: e.after === null ? null : JSON.stringify(e.after),
        })).sort(byGuid);
    if (JSON.stringify(mutation.events) !== JSON.stringify(wanted)) {
      throw Error(`Audit event cross-check failed for ${mutation.guid}`);
    }
  }
}

const legacyEventId = id => {
  const bytes = Buffer.from(hash('mutable-legacy-receipt:' + id), 'hex').subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/**
 * Convert a disk foundation into L3 in `store`'s phext. The store
 * must not already hold knowledge (conversion is one all-strata
 * event; the caller renames the old `.mutable` home aside and keeps
 * it as the fallback). Returns the verification report.
 */
export function convertDiskKnowledgeToPhext({ mutableFile, auditFile, store }) {
  if (!(store instanceof PhextKnowledgeStore)) throw Error('Convert requires a PhextKnowledgeStore');
  if (store.readControl() || store.hasAnyContent()) {
    throw Error('Phext knowledge already established; conversion requires an unconverted Cavern');
  }
  const checkDb = new Database(mutableFile, { readonly: true, fileMustExist: true });
  try {
    let verdict;
    try { verdict = verifyDatabase(checkDb, 'mutable'); }
    catch (error) { throw Error(`Source mutable.db could not be read (${error.message}); conversion refused`); }
    if (!verdict.ok) throw Error('Source mutable.db failed verification; conversion refused');
  }
  finally { checkDb.close(); }
  if (auditFile && fs.existsSync(auditFile)) {
    const checkAudit = new Database(auditFile, { readonly: true, fileMustExist: true });
    try {
      let verdict;
      try { verdict = verifyDatabase(checkAudit, 'audit'); }
      catch (error) { throw Error(`Source audit.db could not be read (${error.message}); conversion refused`); }
      if (!verdict.ok) throw Error('Source audit.db failed verification; conversion refused');
    }
    finally { checkAudit.close(); }
  }
  const dump = dumpDiskKnowledge({ mutableFile, auditFile });
  verifyAuditDump(dump);

  store.writeControl({
    vaultGuid: dump.vaultGuid,
    knowledgeEpoch: 0,
    canonicalMutationCount: dump.audit.length + dump.outbox.length,
    createdUtc: new Date().toISOString(),
    strata: { knowledge: 'phext' },
    convertedFrom: 'sqlite',
  });
  store.mirrorVaultGuid(dump.vaultGuid);
  const recordHashes = {};
  for (const table of TABLES) {
    recordHashes[table] = {};
    for (const record of dump.tables[table]) {
      store.writeRecord(table, record);
      recordHashes[table][record[identityOf(table)]] = hash(recordText(record));
    }
  }
  for (const [entityGuid, aggregate] of Object.entries(dump.propositions)) {
    store.writeAggregate(entityGuid, aggregate);
  }
  for (const row of dump.outbox) store.writeOutbox(row.guid, row.payload);
  for (const mutation of dump.audit) {
    store.writeAudit(mutation.guid, {
      guid: mutation.guid, actorGuid: mutation.actorGuid, timestampUtc: mutation.timestampUtc,
      attributes: mutation.attributes, events: mutation.events,
    });
  }
  store.flush();

  // Verify: read back and compare, per table and per record.
  const readback = dumpPhextKnowledge(store);
  const report = {
    vaultGuid: dump.vaultGuid,
    tables: {}, propositions: { count: 0 }, outbox: { count: 0, bytes: 0 }, audit: { mutations: 0, events: 0 },
    verified: false,
  };
  for (const table of TABLES) {
    if (canonText(readback.tables[table]) !== canonText(dump.tables[table])) {
      throw Error(`Conversion verification failed for ${table}: readback differs`);
    }
    for (const { id, record } of store.listRecords(table)) {
      if (hash(recordText(record)) !== recordHashes[table][id]) {
        throw Error(`Conversion hash verification failed for ${table}:${id}`);
      }
    }
    report.tables[table] = { count: dump.tables[table].length, recordHashes: recordHashes[table] };
  }
  if (canonText(readback.propositions) !== canonText(dump.propositions)) {
    throw Error('Conversion verification failed for propositions: readback differs');
  }
  report.propositions = {
    count: Object.keys(dump.propositions).length,
    hashes: Object.fromEntries(Object.entries(dump.propositions)
      .map(([id, aggregate]) => [id, hash(JSON.stringify(aggregate))])),
  };
  if (canonText(readback.outbox) !== canonText(dump.outbox)) {
    throw Error('Conversion verification failed for the audit outbox: readback differs');
  }
  report.outbox = {
    count: dump.outbox.length,
    bytes: dump.outbox.reduce((sum, r) => sum + Buffer.byteLength(r.payload), 0),
  };
  if (canonText(readback.audit) !== canonText(dump.audit)) {
    throw Error('Conversion verification failed for the audit trail: readback differs');
  }
  report.audit = {
    mutations: dump.audit.length,
    events: dump.audit.reduce((sum, m) => sum + m.events.length, 0),
    payloadHashesVerified: dump.audit.length,
  };
  report.verified = true;
  return report;
}

function buildDbFile(target, kind, vaultGuid, populate) {
  const temporary = `${target}.init-${randomUUID()}`;
  const fd = fs.openSync(temporary, 'wx', 0o600); fs.closeSync(fd);
  let db;
  try {
    db = new Database(temporary, { fileMustExist: true });
    migrate(db, kind, { fresh: true, vaultGuid });
    db.pragma('foreign_keys = OFF');
    try {
      populate(db);
      if (db.pragma('foreign_key_check').length) throw Error(`Exported ${kind} database failed its foreign key check`);
    } finally { db.pragma('foreign_keys = ON'); }
    db.close(); db = undefined;
    const syncFd = fs.openSync(temporary, 'r');
    try { fs.fsyncSync(syncFd); } finally { fs.closeSync(syncFd); }
    fs.linkSync(temporary, target); fs.unlinkSync(temporary);
  } finally {
    db?.close();
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

/**
 * Materialize L3 as a disk foundation + snapshot manifest at
 * `destination` (a new directory). The manifest is the standard
 * `mutable-sqlite-backup` shape, so `restoreSnapshot` consumes the
 * export unchanged.
 */
export function exportPhextKnowledge({ store, vaultGuid, destination, auditAvailable = true }) {
  if (typeof destination !== 'string' || !path.isAbsolute(destination)) {
    throw Error('Backup requires an absolute new directory');
  }
  const parent = directory(path.dirname(destination));
  const target = path.join(parent, path.basename(destination));
  fs.mkdirSync(target, { mode: 0o700 }); // Explicitly no replacement/merging.
  const dump = dumpPhextKnowledge(store, { includeAudit: auditAvailable });
  if (dump.vaultGuid !== vaultGuid) throw Error('Export vault identity mismatch');
  const insert = (db, table, record) => {
    const row = recordToRow(record);
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`)
      .run(...columns.map(c => row[c]));
  };
  buildDbFile(path.join(target, 'mutable.db'), 'mutable', vaultGuid, db => {
    db.transaction(() => {
      for (const table of TABLES) for (const record of dump.tables[table]) insert(db, table, record);
      for (const aggregate of Object.values(dump.propositions)) {
        insert(db, 'Block', aggregate.block);
        for (const property of aggregate.properties ?? []) insert(db, 'StandoffProperty', property);
        if (aggregate.block.text != null) {
          db.prepare('INSERT INTO BlockTextRun(blockGuid,ordinal,text) VALUES(?,0,?)')
            .run(aggregate.block.guid, aggregate.block.text);
        }
      }
      const pending = db.prepare('INSERT INTO PendingAuditMutation VALUES(?,?,?)');
      for (const row of dump.outbox) pending.run(row.guid, row.timestampUtc, row.payload);
    }).immediate();
  });
  if (auditAvailable) buildDbFile(path.join(target, 'audit.db'), 'audit', vaultGuid, db => {
    db.transaction(() => {
      const mutation = db.prepare('INSERT INTO AuditMutation(guid,actorGuid,timestampUtc,attributes) VALUES(?,?,?,?)');
      const event = db.prepare('INSERT INTO AuditEvent(guid,mutationGuid,actorGuid,operation,recordType,recordGuid,timestampUtc,beforeJson,afterJson) VALUES(?,?,?,?,?,?,?,?,?)');
      for (const m of dump.audit) {
        mutation.run(m.guid, m.actorGuid, m.timestampUtc, m.attributes);
        for (const e of m.events) {
          event.run(e.guid, m.guid, m.actorGuid, e.operation, e.recordType, e.recordGuid, m.timestampUtc, e.beforeJson, e.afterJson);
        }
      }
    }).immediate();
  });
  const files = {};
  for (const kind of auditAvailable ? ['mutable', 'audit'] : ['mutable']) {
    const file = path.join(target, `${kind}.db`);
    fs.chmodSync(file, 0o600); syncFile(file);
    const check = new Database(file, { readonly: true, fileMustExist: true });
    try {
      validateSchema(check, kind, vaultGuid);
      if (!verifyDatabase(check, kind).ok) throw Error('Export integrity check failed');
    } finally { check.close(); }
    files[kind] = { sha256: hash(fs.readFileSync(file)) };
  }
  const manifest = {
    format: 'mutable-sqlite-backup', version: 1, vaultGuid,
    createdUtc: new Date().toISOString(), files,
    scope: 'database-only', atomicAcrossDatabases: false, auditAvailable,
    // Provenance: this snapshot was materialized from a phext-mode
    // foundation. A restore into an unestablished destination
    // derives its mode from it (client.mjs); established
    // destinations never consult it.
    sourceMode: 'phext',
  };
  const marker = path.join(target, 'snapshot.json');
  fs.writeFileSync(marker, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  syncFile(marker); syncDirectory(target);
  return { directory: target, ...manifest };
}
