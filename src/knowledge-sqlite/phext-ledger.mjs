/**
 * PhextVFS Phase 4 — the canonical ledger, ported to L3.
 *
 * `canonical-ledger.mjs` is not a journal table; it is a transaction
 * discipline (design §1.2): operationId idempotency, before/after
 * capture, the receipt written in the same commit as the mutation,
 * outbox budgets as back-pressure, and delivery as a second,
 * verifying commit. This port keeps the discipline operation-for-
 * operation and changes only the storage:
 *
 * - `perform` runs against the ephemeral SQLite replica (Tier 2),
 *   inside a replica transaction, capturing before/after state from
 *   the replica exactly as the disk ledger captures it from
 *   `mutable.db`. All mutation modules (entities, semantics,
 *   cardex, propositions, scholarly, …) run unchanged — they only
 *   ever see `(db, ledger)`.
 * - Before the replica transaction commits, the mutation's record
 *   writes land in L3 and its receipt lands in `outbox/`, all in the
 *   VFS overlay, and one `flush()` commits them. Flush is the
 *   transaction boundary: a generation is fully durable or absent,
 *   so mutation + receipt are durable together (the property the
 *   disk ledger gets from WAL + `synchronous = FULL`). If the flush
 *   fails, the replica transaction rolls back and the overlay is
 *   reverted — nothing is durable anywhere. If the process dies
 *   after the flush but before the replica commits, the replica is
 *   ephemeral: it is rebuilt from L3 at open, so the mutation is
 *   present exactly once.
 * - L3 synchronization is event-driven for content (the captured
 *   after-states) plus a membership sweep per mutation: guid sets
 *   per canonical table are diffed between replica and L3, so rows
 *   removed by SQL cascade (which produce no events — the same is
 *   true of the disk ledger's audit) cannot linger in L3 and
 *   resurrect at replica rebuild.
 * - Delivery copies an outbox receipt into `audit/` with the disk
 *   protocol's fingerprint verification verbatim (payload hash,
 *   metadata equality, event equality), as its own flush, then
 *   deletes the outbox entry as a second flush: a crash between the
 *   two replays into the same conflict checks `deliver()` performs
 *   today.
 */
import { createHash, randomUUID } from 'node:crypto';
import { canonicalTables, guid } from './canonical-ledger.mjs';
import { sqlRevision } from './reconcile.mjs';
import {
  AUTHORED_ALIAS_ORIGINS,
  identityOf,
  recordToRow,
  rowToRecord,
} from './phext-store.mjs';

const fingerprint = s => createHash('sha256').update(s).digest('hex');
const legacyEventId = id => {
  const bytes = createHash('sha256').update('mutable-legacy-receipt:' + id).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const OUTBOX_LIMITS = Object.freeze({ mutations: 10000, bytes: 16 * 1024 * 1024 });
const PROPOSITION_TYPE = 'mutable/proposition-block';

/** The disk ledger's state(), over the replica. */
function state(db, table, id) {
  const aggregate = table === 'Block' || table === 'StandoffProperty';
  if (!aggregate && !canonicalTables.includes(table)) throw Error('Unsupported canonical table');
  const row = db.prepare(`SELECT * FROM ${table} WHERE ${identityOf(table)}=?`).get(id);
  if (!row) return null;
  if (aggregate && row.resourceGuid !== null) throw Error('File-derived rows are not canonical');
  return rowToRecord(row);
}

export function phextLedger({ store, replica, bumpEpoch, auditAvailable }) {
  const receipt = id => {
    const pending = store.readOutbox(id);
    if (pending !== undefined) return { payload: JSON.parse(pending), delivery: 'pending' };
    if (!auditAvailable()) throw Error('Audit unavailable; prior mutation outcome cannot be resolved');
    const row = store.readAudit(id);
    if (!row) return undefined;
    const metadata = JSON.parse(row.attributes ?? 'null');
    if (!metadata?.receipt) throw Error('Audit mutation has no compatible operation receipt');
    return { payload: metadata.receipt, delivery: 'delivered' };
  };

  const status = () => {
    const { count, bytes } = store.outboxStats();
    return { pending: count, bytes, auditAvailable: auditAvailable(), limits: { ...OUTBOX_LIMITS } };
  };

  /** Write one proposition aggregate from the replica, or remove it. */
  const syncAggregate = entityGuid => {
    const block = replica.prepare(
      'SELECT * FROM Block WHERE entityGuid=? AND resourceGuid IS NULL AND typename=?',
    ).get(entityGuid, PROPOSITION_TYPE);
    if (!block) { store.deleteAggregate(entityGuid); return; }
    const properties = replica.prepare(
      'SELECT * FROM StandoffProperty WHERE sourceBlockGuid=? ORDER BY guid',
    ).all(block.guid).map(rowToRecord);
    store.writeAggregate(entityGuid, { block: rowToRecord(block), properties });
  };

  /** Event-driven content writes + the cascade membership sweep. */
  const syncL3 = (events, blockEntityBefore) => {
    const aggregates = new Set();
    const blockEntity = new Map(blockEntityBefore);
    for (const e of events) {
      if (e.recordType === 'Block') {
        const entityGuid = e.after?.entityGuid ?? e.before?.entityGuid;
        if (entityGuid) { aggregates.add(entityGuid); blockEntity.set(e.recordGuid, entityGuid); }
      }
    }
    for (const e of events) {
      if (canonicalTables.includes(e.recordType)) {
        if (e.recordType === 'EntityAlias') {
          if (e.after && AUTHORED_ALIAS_ORIGINS.includes(e.after.origin)) store.writeRecord('EntityAlias', e.after);
          else store.deleteRecord('EntityAlias', e.recordGuid);
        } else if (e.after) store.writeRecord(e.recordType, e.after);
        else store.deleteRecord(e.recordType, e.recordGuid);
      } else if (e.recordType === 'StandoffProperty') {
        const blockGuid = e.after?.sourceBlockGuid ?? e.before?.sourceBlockGuid;
        let entityGuid = blockGuid ? blockEntity.get(blockGuid) : undefined;
        if (!entityGuid && blockGuid) {
          const row = replica.prepare('SELECT entityGuid FROM Block WHERE guid=?').get(blockGuid);
          if (row) entityGuid = row.entityGuid;
        }
        if (entityGuid) aggregates.add(entityGuid);
      }
    }
    for (const entityGuid of aggregates) syncAggregate(entityGuid);
    // Membership sweep: cascaded deletes (and any write that bypassed
    // ctx.change) must not leave L3 holding records the replica lost,
    // nor miss records the replica gained.
    for (const table of canonicalTables) {
      const idColumn = identityOf(table);
      const replicaIds = new Set(
        (table === 'EntityAlias'
          ? replica.prepare(`SELECT guid AS id FROM EntityAlias WHERE origin IN ('curated','imported')`).all()
          : replica.prepare(`SELECT ${idColumn} AS id FROM ${table}`).all()).map(r => r.id),
      );
      const l3Ids = store.recordIds(table);
      for (const id of l3Ids) if (!replicaIds.has(id)) store.deleteRecord(table, id);
      for (const id of replicaIds) {
        if (!l3Ids.has(id)) {
          const record = state(replica, table, id);
          if (record) store.writeRecord(table, record);
        }
      }
    }
    const replicaAggregates = new Set(
      replica.prepare('SELECT entityGuid FROM Block WHERE resourceGuid IS NULL AND typename=?')
        .all(PROPOSITION_TYPE).map(r => r.entityGuid),
    );
    for (const id of store.aggregateIds()) if (!replicaAggregates.has(id)) store.deleteAggregate(id);
    for (const id of replicaAggregates) if (!aggregates.has(id)) syncAggregate(id);
  };

  return {
    mutate(request, perform, check = () => {}) {
      const serialized = JSON.stringify(request);
      if (Buffer.byteLength(serialized) > 32768) throw Error('Canonical request budget exceeded');
      const operationId = guid(request.operationId);
      if (request.actorGuid != null) guid(request.actorGuid);
      const prior = receipt(operationId);
      if (prior) {
        if (prior.payload.request !== serialized) throw Error('Mutation retry differs from original');
        return { ...prior.payload.result, revision: sqlRevision(replica) };
      }
      const budget = store.outboxStats();
      if (budget.count >= OUTBOX_LIMITS.mutations || budget.bytes >= OUTBOX_LIMITS.bytes) {
        throw Error('Canonical audit outbox full; no mutation committed');
      }
      let result;
      try {
        result = replica.transaction(() => {
          check();
          const blockEntityBefore = new Map(
            replica.prepare('SELECT guid,entityGuid FROM Block WHERE resourceGuid IS NULL AND typename=?')
              .all(PROPOSITION_TYPE).map(r => [r.guid, r.entityGuid]),
          );
          const changes = new Map();
          const now = new Date().toISOString();
          const actorGuid = request.actorGuid ?? null;
          const context = {
            now,
            actorGuid,
            change(table, id, action) {
              check(); guid(id);
              const key = table + ':' + id;
              const old = changes.get(key);
              const before = old ? old.before : state(replica, table, id);
              const outcome = action();
              const after = state(replica, table, id);
              changes.set(key, { guid: old?.guid ?? randomUUID(), recordType: table, recordGuid: id, before, after });
              if (changes.size > 256) throw Error('Canonical event budget exceeded');
              return outcome;
            },
          };
          const performed = perform(context);
          check();
          const events = [...changes.values()]
            .filter(e => JSON.stringify(e.before) !== JSON.stringify(e.after))
            .map(e => ({ ...e, operation: e.before === null ? 'create' : e.after === null ? 'remove' : 'update' }));
          const payload = JSON.stringify({
            version: 2, kind: 'canonical-mutation', request: serialized,
            result: performed, timestampUtc: now, actorGuid, events,
          });
          if (budget.bytes + Buffer.byteLength(payload) > OUTBOX_LIMITS.bytes) {
            throw Error('Canonical audit outbox full; no mutation committed');
          }
          syncL3(events, blockEntityBefore);
          store.writeOutbox(operationId, payload);
          bumpEpoch();
          store.flush();
          return performed;
        }).immediate();
      } catch (error) {
        // A failed flush leaves the overlay uncommitted; a landed flush
        // cleared it. Either way there is nothing further to discard,
        // and the replica transaction has already rolled back.
        try { store.revert(); } catch { /* overlay already committed */ }
        throw error;
      }
      return { ...result, revision: sqlRevision(replica) };
    },

    outcome(id) {
      guid(id);
      try {
        const r = receipt(id);
        return r
          ? { status: 'committed', delivery: r.delivery, result: r.payload.result, revision: sqlRevision(replica) }
          : { status: 'not-committed', revision: sqlRevision(replica) };
      } catch (error) {
        return { status: 'unavailable', diagnostics: [error.message], revision: sqlRevision(replica) };
      }
    },

    status,

    deliver({ limit = 100, maxBytes = 1024 * 1024 } = {}, check = () => {}, afterAuditCommit = () => {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000 ||
          !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) {
        throw Error('Invalid audit delivery budget');
      }
      if (!auditAvailable()) throw Error('Audit unavailable; pending receipts retained');
      const rows = store.listOutbox().slice(0, limit);
      let delivered = 0, bytes = 0;
      for (const row of rows) {
        check();
        const size = Buffer.byteLength(row.payload);
        if (bytes + size > maxBytes) break;
        const payload = JSON.parse(row.payload);
        const digest = fingerprint(row.payload);
        const legacy = payload.version !== 2;
        const events = legacy
          ? [{ guid: legacyEventId(row.operationId), recordType: 'LegacyOperationReceipt', recordGuid: row.operationId, operation: 'preserve', before: null, after: { request: payload.request, result: payload.result } }]
          : payload.events;
        const metadata = JSON.stringify({
          receipt: payload, payloadHash: digest,
          coverage: legacy ? 'legacy-before-after-unavailable' : 'complete-record-events',
        });
        const wanted = events.map(e => ({
          guid: e.guid, operation: e.operation, recordType: e.recordType, recordGuid: e.recordGuid,
          beforeJson: e.before === null ? null : JSON.stringify(e.before),
          afterJson: e.after === null ? null : JSON.stringify(e.after),
        })).sort((a, b) => a.guid.localeCompare(b.guid));
        const existing = store.readAudit(row.operationId);
        if (existing) {
          if (existing.attributes !== metadata) throw Error('Audit delivery payload conflict');
          const stored = [...existing.events].sort((a, b) => a.guid.localeCompare(b.guid));
          if (JSON.stringify(stored) !== JSON.stringify(wanted)) throw Error('Audit event delivery conflict');
        } else {
          store.writeAudit(row.operationId, {
            guid: row.operationId,
            actorGuid: payload.actorGuid ?? null,
            timestampUtc: row.timestampUtc,
            attributes: metadata,
            events: wanted,
          });
        }
        store.flush();
        afterAuditCommit();
        check();
        const current = store.readOutbox(row.operationId);
        if (current && current !== row.payload) throw Error('Pending audit receipt changed');
        store.deleteOutbox(row.operationId);
        store.flush();
        delivered++;
        bytes += size;
      }
      return { delivered, bytes, ...status() };
    },
  };
}

/** Re-exported for the foundation's replica builder (row → record). */
export { recordToRow };
