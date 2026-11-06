// @vitest-environment node
/**
 * PhextVFS Phase 4, gate 4.6 — the converter and the reversibility
 * export. Fixture note (phext-only cutover): no disk-mode foundation
 * exists to seed with any more, so the "disk" source pair is built
 * by seeding a phext Cavern through the foundation and exporting a
 * snapshot — the exported mutable.db/audit.db pair IS the disk
 * format the converter consumes. The observed alias is inserted
 * into the exported file directly, as derived data never lives in
 * the phext.
 *
 * A real disk-format knowledge fixture (cardex save with a curated
 * alias, a direct-SQL observed alias, a second entity, a claim, a
 * proposition; one mutation delivered, three left pending) converts
 * into L3 with:
 * - per-table counts and per-record SHA-256 verified against an
 *   independent re-hash of the SQL dump;
 * - audit payloadHash fingerprints carried and cross-checked
 *   (inside convertDiskKnowledgeToPhext, against the AuditEvent
 *   rows — a mismatch would refuse the conversion);
 * - undelivered outbox receipts migrated verbatim (they still
 *   resolve and deliver after conversion);
 * - the vaultGuid preserved, never re-minted;
 * - the observed alias left behind (D4: derived, never canonical).
 *
 * Then the phext foundation exports back to a disk snapshot and
 * `restoreSnapshot` (unchanged) rebuilds a disk Cavern whose
 * canonical dump is diff-equal to the original — rollback is a
 * round trip, not a cliff.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID as uuid } from 'node:crypto';
import Database from 'better-sqlite3';
import { PhextVFS } from '../phext/vfs';
import { openFoundation, restoreSnapshot } from './foundation.mjs';
import { PhextKnowledgeStore, recordText, sha256 } from './phext-store.mjs';
import { convertDiskKnowledgeToPhext, dumpDiskKnowledge, dumpPhextKnowledge } from './phext-convert.mjs';

const cleanups: Array<() => void> = [];
afterEach(() => { for (const f of cleanups.splice(0).reverse()) { try { f(); } catch { /* best effort */ } } });

/** Key-order-insensitive canonical form for dump comparisons. */
function canon(value: any): any {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canon(value[k])]));
  }
  return value;
}

async function diskFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutable-phext-convert-'));
  const vault = path.join(dir, 'vault');
  fs.mkdirSync(vault);
  const seedVault = path.join(dir, 'seed-vault');
  fs.mkdirSync(seedVault);
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Seed through the phext foundation, then export the snapshot
  // pair that serves as the disk-format source.
  const seedPhext = path.join(seedVault, 'cavern.phext');
  const seedVfs = PhextVFS.openOrCreate(seedPhext);
  cleanups.push(() => { try { seedVfs.close(); } catch { /* closed */ } });
  const store = openFoundation({ vault: seedVault, initialize: true }, { phextVfs: seedVfs, phextPath: seedPhext, scopeValidated: true });
  const ops: Record<string, string> = {};
  const ada = store.cardex({
    op: 'save', id: uuid(), operationId: (ops.cardex = uuid()), expected: null, aliasBaseline: [],
    name: 'Ada Lovelace', nameStrata: null, descriptionDocument: null, imageRef: null,
    aliases: [{ id: uuid(), name: 'Enchantress', origin: 'curated' }],
  }).entity;
  const subject = store.entities({ op: 'create', id: uuid(), operationId: (ops.entity = uuid()), name: 'Subject', typename: 'Person' }).entity;
  const claimGuid = uuid();
  store.semantics({
    recordType: 'Claim', op: 'create', operationId: (ops.claim = uuid()), guid: claimGuid,
    expression: 'unreliable', kind: 'Trait',
    participants: [
      { guid: uuid(), entityGuid: subject.id, role: 'Subject', ordinal: 0 },
      { guid: uuid(), entityGuid: ada.id, role: 'AccordingTo', ordinal: 1 },
    ],
  });
  const proposition = store.propositions({
    op: 'create', operationId: (ops.proposition = uuid()), id: uuid(), blockId: uuid(),
    name: 'Training claim', text: 'A😀é', annotations: [],
  }).proposition;
  // Deliver exactly the oldest mutation; three receipts stay pending.
  expect(store.deliverAudit({ limit: 1 }).delivered).toBe(1);
  expect(store.auditStatus().pending).toBe(3);
  const vaultGuid = store.vaultGuid;
  const exported = await store.backup(path.join(dir, 'disk-source'));
  store.close();
  // The observed alias is derived data: it exists only in the disk
  // pair (inserted here by direct SQL, as the disk era's indexer
  // wrote it), and conversion must leave it behind (D4).
  const sourceDb = new Database(path.join(exported.directory, 'mutable.db'));
  sourceDb.prepare(
    "INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES(?,?,?,'observed name','observed')",
  ).run(uuid(), ada.id, 'Observed Name');
  sourceDb.close();
  return {
    dir, vault, vaultGuid, ops, ada, claimGuid, proposition,
    mutableFile: path.join(exported.directory, 'mutable.db'),
    auditFile: path.join(exported.directory, 'audit.db'),
  };
}

describe('4.6 converter and export', () => {
  it('converts with verified counts/hashes/fingerprints, preserves identity, and round-trips back to disk diff-equal', async () => {
    const f = await diskFixture();
    const dump = dumpDiskKnowledge({ mutableFile: f.mutableFile, auditFile: f.auditFile });
    expect(dump.vaultGuid).toBe(f.vaultGuid);
    expect(dump.tables.EntityAlias.map((r: any) => r.origin)).toEqual(['curated']);

    const phextPath = path.join(f.vault, 'cavern.phext');
    const vfs = PhextVFS.openOrCreate(phextPath);
    const ks = new PhextKnowledgeStore(vfs);
    const report = convertDiskKnowledgeToPhext({ mutableFile: f.mutableFile, auditFile: f.auditFile, store: ks });
    expect(report.verified).toBe(true);
    expect(report.vaultGuid).toBe(f.vaultGuid);
    expect(report.tables.Entity.count).toBe(3); // Ada, Subject, and the proposition's own Entity
    expect(report.tables.EntityAlias.count).toBe(1);
    expect(report.tables.Claim.count).toBe(1);
    expect(report.propositions.count).toBe(1);
    expect(report.outbox.count).toBe(3);
    expect(report.audit).toMatchObject({ mutations: 1, payloadHashesVerified: 1 });
    expect(report.audit.events).toBeGreaterThan(0);
    // Per-record SHA-256, independently recomputed from the SQL dump.
    for (const [table, records] of Object.entries(dump.tables)) {
      for (const record of records as any[]) {
        const id = record.guid ?? record.entityGuid;
        expect(report.tables[table].recordHashes[id]).toBe(sha256(recordText(record)));
      }
    }
    vfs.close();

    // The converted Cavern stands on the phext alone (the source
    // pair lives outside the vault, in the fixture's disk-source
    // directory — the operator's preserved originals).
    const vfs2 = PhextVFS.open(phextPath);
    const store = openFoundation({ vault: f.vault }, { phextVfs: vfs2, phextPath, scopeValidated: true });
    expect(store.vaultGuid).toBe(f.vaultGuid);
    expect(store.cardex({ op: 'get', id: f.ada.id }).entity.aliases.map((a: any) => a.name)).toEqual(['Enchantress']);
    expect(store.operationOutcome(f.ops.claim)).toMatchObject({ status: 'committed', delivery: 'pending' });
    expect(store.propositions({ op: 'get', id: f.proposition.id }).proposition.text).toBe('A😀é');

    // Export (the phext foundation's backup) → restoreSnapshot →
    // a restored Cavern (restore is a conversion into the
    // destination phext since the cutover) whose canonical dump
    // equals the original.
    const exported = await store.backup(path.join(f.dir, 'export'));
    expect(exported.vaultGuid).toBe(f.vaultGuid);
    expect(exported.files.mutable.sha256).toBe(sha256(fs.readFileSync(path.join(exported.directory, 'mutable.db'))));
    const restoredVault = path.join(f.dir, 'restored');
    fs.mkdirSync(restoredVault);
    const restoredPhext = path.join(restoredVault, 'cavern.phext');
    const restoredVfs = PhextVFS.openOrCreate(restoredPhext);
    cleanups.push(() => { try { restoredVfs.close(); } catch { /* closed */ } });
    restoreSnapshot(exported.directory, restoredVault, false, restoredVfs);
    const restoredDump = dumpPhextKnowledge(new PhextKnowledgeStore(restoredVfs));
    expect(canon(restoredDump)).toEqual(canon(dump));

    // The migrated outbox receipts still deliver after conversion.
    expect(store.deliverAudit({}).delivered).toBe(3);
    expect(store.auditStatus().pending).toBe(0);
    expect(store.operationOutcome(f.ops.claim)).toMatchObject({ status: 'committed', delivery: 'delivered' });
    store.close(); vfs2.close();
  });

  it('refuses to convert into a phext that already holds knowledge', async () => {
    const f = await diskFixture();
    const phextPath = path.join(f.vault, 'cavern.phext');
    const vfs = PhextVFS.openOrCreate(phextPath);
    const ks = new PhextKnowledgeStore(vfs);
    convertDiskKnowledgeToPhext({ mutableFile: f.mutableFile, auditFile: f.auditFile, store: ks });
    expect(() => convertDiskKnowledgeToPhext({ mutableFile: f.mutableFile, auditFile: f.auditFile, store: ks }))
      .toThrow(/already established/);
    vfs.close();
  });
});
