/**
 * PhextVFS Phase 4 — the L3 knowledge store.
 *
 * Canonical knowledge records as files inside the Cavern phext,
 * under `/.mutable/` (the VFS dispatches that prefix to stratum 3).
 * Layout (design §2.1): one JSON file per record, kind-per-directory;
 * propositions are single aggregate documents (Block row + its
 * StandoffProperty rows); undelivered receipts live in `outbox/`,
 * delivered audit entries in `audit/`; vault identity and the
 * knowledge epoch live in the control record `knowledge.json` at the
 * L3 root.
 *
 * Placement note (deviation from the design's L7 `/.control/`
 * path, forced by a Phase 3a fact the design predates): phext-fs
 * keeps its own node table at `/.control/fs-nodes.json`, written by
 * the lifecycle's VFS instance, while the control record is written
 * by the knowledge worker's instance. Two instances allocating
 * slots in one directory from stale index views collide (both took
 * slot 3; the later flush's index orphaned the other's file —
 * reproduced in server/phext-knowledge-e2e.test.ts's history).
 * Stratum 3 has exactly one writer — the knowledge layer — so the
 * control record lives there; its content and semantics (format,
 * vaultGuid, knowledgeEpoch, canonicalMutationCount) are exactly
 * the design's L7 record.
 *
 * A record's content is exactly the shape `canonical-ledger.mjs`'s
 * `state()` produces — the row minus its integer `id`, with
 * `attributes`/`valueJson` parsed — so L3 records, audit payloads
 * and package exports all speak one form.
 *
 * Nothing here commits: callers batch writes in the VFS overlay and
 * flush once (flush = commit, design §2.3). Derived data never
 * enters this store.
 */
import { createHash } from 'node:crypto';

/** Canonical table → L3 directory. Actor is reserved (design D5). */
export const RECORD_KINDS = Object.freeze({
  SourceClaimReview: 'reviews',
  ExternalIdentity: 'identities',
  SourceSnapshot: 'snapshots',
  Actor: 'actors',
  Entity: 'entities',
  EntityAlias: 'aliases',
  Relationship: 'relationships',
  Time: 'times',
  Claim: 'claims',
  ClaimParticipant: 'claim-participants',
  ClaimQualifier: 'claim-qualifiers',
  ClaimEvidence: 'claim-evidence',
  DataSet: 'datasets',
  DataPoint: 'datapoints',
  DataPointDimension: 'datapoint-dimensions',
  DataSetMembership: 'dataset-memberships',
});

/** The SQL identity column per table (mirrors canonical-ledger). */
export const identityOf = table => (table === 'Time' ? 'entityGuid' : 'guid');

/** Alias origins that are authored; observed/recovered are derived (D4). */
export const AUTHORED_ALIAS_ORIGINS = Object.freeze(['curated', 'imported']);

export const KNOWLEDGE_FORMAT = 'phext-knowledge-v1';
export const CONTROL_PATH = '/.mutable/knowledge.json';
const L3_ROOT = '/.mutable';
const L3_ROOT_COORDINATE = [3, 1, 1, 1, 1, 1, 1, 1, 1];

export const sha256 = text => createHash('sha256').update(text).digest('hex');

/** SQL row → canonical record: the ledger state() transform. */
export function rowToRecord(row) {
  if (!row) return null;
  const record = { ...row };
  delete record.id;
  for (const field of ['attributes', 'valueJson']) {
    if (record[field] !== undefined && record[field] !== null) {
      record[field] = JSON.parse(record[field]);
    }
  }
  return record;
}

/** Canonical record → SQL row values (attributes/valueJson re-encoded). */
export function recordToRow(record) {
  const row = { ...record };
  for (const field of ['attributes', 'valueJson']) {
    if (row[field] !== undefined && row[field] !== null && typeof row[field] !== 'string') {
      row[field] = JSON.stringify(row[field]);
    }
  }
  return row;
}

/** The one serialization for a record file's bytes (hash-stable). */
export const recordText = record => JSON.stringify(record);

const dirOf = table => {
  const dir = RECORD_KINDS[table];
  if (!dir) throw Error(`Unsupported canonical table: ${table}`);
  return dir;
};

const missing = error => error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');

export class PhextKnowledgeStore {
  constructor(vfs) {
    if (!vfs) throw Error('PhextKnowledgeStore requires a PhextVFS instance');
    this.vfs = vfs;
  }

  flush() { this.vfs.flush(); }
  revert() { this.vfs.lattice.revert(); }

  // ---------------------------------------------------------- control

  readControl() {
    let text;
    try { text = this.vfs.readTextFile(CONTROL_PATH); } catch (e) { if (missing(e)) return undefined; throw e; }
    const control = JSON.parse(text);
    if (control?.format !== KNOWLEDGE_FORMAT || typeof control.vaultGuid !== 'string') {
      throw Error('Phext knowledge control record is invalid; restore current knowledge explicitly');
    }
    return control;
  }

  writeControl(control) {
    this.vfs.writeFile(CONTROL_PATH, JSON.stringify({ format: KNOWLEDGE_FORMAT, ...control }));
  }

  /** Mirror vaultGuid in the L3 root index scroll (one-lookup discovery). */
  mirrorVaultGuid(vaultGuid) {
    const raw = this.vfs.lattice.readScroll(L3_ROOT_COORDINATE);
    const index = raw ? JSON.parse(raw) : { v: 1, nextSlot: 2, entries: {} };
    if (index.vaultGuid === vaultGuid) return;
    index.vaultGuid = vaultGuid;
    this.vfs.lattice.writeScroll(L3_ROOT_COORDINATE, JSON.stringify(index));
  }

  readMirroredVaultGuid() {
    const raw = this.vfs.lattice.readScroll(L3_ROOT_COORDINATE);
    if (!raw) return undefined;
    try { return JSON.parse(raw).vaultGuid; } catch { return undefined; }
  }

  // ---------------------------------------------------------- records

  recordPath(table, id) { return `${L3_ROOT}/${dirOf(table)}/${id}.json`; }

  readRecord(table, id) {
    let text;
    try { text = this.vfs.readTextFile(this.recordPath(table, id)); }
    catch (e) { if (missing(e)) return undefined; throw e; }
    return JSON.parse(text);
  }

  writeRecord(table, record) {
    const id = record?.[identityOf(table)];
    if (typeof id !== 'string' || !id) throw Error(`Canonical ${table} record has no identity`);
    this.vfs.writeFile(this.recordPath(table, id), recordText(record));
  }

  deleteRecord(table, id) {
    try { this.vfs.unlink(this.recordPath(table, id)); }
    catch (e) { if (!missing(e)) throw e; }
  }

  /** All records of one kind: [{id, record}] sorted by id. */
  listRecords(table) {
    const dir = `${L3_ROOT}/${dirOf(table)}`;
    let entries;
    try { entries = this.vfs.listDir(dir); } catch (e) { if (missing(e)) return []; throw e; }
    const out = [];
    for (const entry of entries) {
      if (entry.type !== 'file' || !entry.name.endsWith('.json')) continue;
      const id = entry.name.slice(0, -'.json'.length);
      out.push({ id, record: JSON.parse(this.vfs.readTextFile(`${dir}/${entry.name}`)) });
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /** Just the ids present for one kind (membership sweeps). */
  recordIds(table) {
    let entries;
    try { entries = this.vfs.listDir(`${L3_ROOT}/${dirOf(table)}`); }
    catch (e) { if (missing(e)) return new Set(); throw e; }
    return new Set(entries.filter(e => e.type === 'file' && e.name.endsWith('.json')).map(e => e.name.slice(0, -5)));
  }

  // ------------------------------------------------------ propositions

  aggregatePath(entityGuid) { return `${L3_ROOT}/propositions/${entityGuid}.json`; }

  readAggregate(entityGuid) {
    let text;
    try { text = this.vfs.readTextFile(this.aggregatePath(entityGuid)); }
    catch (e) { if (missing(e)) return undefined; throw e; }
    return JSON.parse(text);
  }

  writeAggregate(entityGuid, aggregate) {
    this.vfs.writeFile(this.aggregatePath(entityGuid), JSON.stringify(aggregate));
  }

  deleteAggregate(entityGuid) {
    try { this.vfs.unlink(this.aggregatePath(entityGuid)); }
    catch (e) { if (!missing(e)) throw e; }
  }

  aggregateIds() {
    let entries;
    try { entries = this.vfs.listDir(`${L3_ROOT}/propositions`); }
    catch (e) { if (missing(e)) return new Set(); throw e; }
    return new Set(entries.filter(e => e.type === 'file' && e.name.endsWith('.json')).map(e => e.name.slice(0, -5)));
  }

  // ----------------------------------------------------------- outbox

  outboxPath(operationId) { return `${L3_ROOT}/outbox/${operationId}.json`; }

  /** The stored receipt payload string, byte-for-byte, or undefined. */
  readOutbox(operationId) {
    try { return this.vfs.readTextFile(this.outboxPath(operationId)); }
    catch (e) { if (missing(e)) return undefined; throw e; }
  }

  writeOutbox(operationId, payload) {
    this.vfs.writeFile(this.outboxPath(operationId), payload);
  }

  deleteOutbox(operationId) {
    try { this.vfs.unlink(this.outboxPath(operationId)); }
    catch (e) { if (!missing(e)) throw e; }
  }

  /** [{operationId, timestampUtc, payload}] in delivery order. */
  listOutbox() {
    let entries;
    try { entries = this.vfs.listDir(`${L3_ROOT}/outbox`); }
    catch (e) { if (missing(e)) return []; throw e; }
    const out = [];
    for (const entry of entries) {
      if (entry.type !== 'file' || !entry.name.endsWith('.json')) continue;
      const operationId = entry.name.slice(0, -5);
      const payload = this.vfs.readTextFile(`${L3_ROOT}/outbox/${entry.name}`);
      let timestampUtc = '';
      try { timestampUtc = JSON.parse(payload).timestampUtc ?? ''; } catch { /* corrupt payloads sort first and fail loudly at delivery, as on disk */ }
      out.push({ operationId, timestampUtc, payload });
    }
    return out.sort((a, b) => a.timestampUtc === b.timestampUtc
      ? (a.operationId < b.operationId ? -1 : 1)
      : (a.timestampUtc < b.timestampUtc ? -1 : 1));
  }

  outboxStats() {
    const rows = this.listOutbox();
    return {
      count: rows.length,
      bytes: rows.reduce((sum, row) => sum + Buffer.byteLength(row.payload), 0),
    };
  }

  // ------------------------------------------------------------ audit

  auditPath(operationId) { return `${L3_ROOT}/audit/${operationId}.json`; }

  /** {guid, actorGuid, timestampUtc, attributes, events} or undefined. */
  readAudit(operationId) {
    let text;
    try { text = this.vfs.readTextFile(this.auditPath(operationId)); }
    catch (e) { if (missing(e)) return undefined; throw e; }
    return JSON.parse(text);
  }

  writeAudit(operationId, entry) {
    this.vfs.writeFile(this.auditPath(operationId), JSON.stringify(entry));
  }

  listAudit() {
    let entries;
    try { entries = this.vfs.listDir(`${L3_ROOT}/audit`); }
    catch (e) { if (missing(e)) return []; throw e; }
    return entries
      .filter(e => e.type === 'file' && e.name.endsWith('.json'))
      .map(e => JSON.parse(this.vfs.readTextFile(`${L3_ROOT}/audit/${e.name}`)))
      .sort((a, b) => (a.guid < b.guid ? -1 : 1));
  }

  /** True when any knowledge content exists (corruption guard for open). */
  hasAnyContent() {
    for (const table of Object.keys(RECORD_KINDS)) {
      if (this.recordIds(table).size) return true;
    }
    return this.aggregateIds().size > 0 || this.listOutbox().length > 0 || this.listAudit().length > 0;
  }
}
