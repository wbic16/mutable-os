// @vitest-environment node
/**
 * PhextVFS Phase 4, gate 4.6 — the converter and the reversibility
 * export.
 *
 * A real disk-mode Cavern fixture (cardex save with a curated alias,
 * a direct-SQL observed alias, a second entity, a claim, a
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
import { PhextVFS } from '../phext/vfs';
import { openFoundation, restoreSnapshot } from './foundation.mjs';
import { PhextKnowledgeStore, recordText, sha256 } from './phext-store.mjs';
import { convertDiskKnowledgeToPhext, dumpDiskKnowledge } from './phext-convert.mjs';

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

function diskFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutable-phext-convert-'));
  const vault = path.join(dir, 'vault');
  fs.mkdirSync(vault);
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = openFoundation({ vault, initialize: true });
  const ops: Record<string, string> = {};
  const ada = store.cardex({
    op: 'save', id: uuid(), operationId: (ops.cardex = uuid()), expected: null, aliasBaseline: [],
    name: 'Ada Lovelace', nameStrata: null, descriptionDocument: null, imageRef: null,
    aliases: [{ id: uuid(), name: 'Enchantress', origin: 'curated' }],
  }).entity;
  store.readKnowledge((db: any) => db.prepare(
    "INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES(?,?,?,'observed name','observed')",
  ).run(uuid(), ada.id, 'Observed Name'));
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
  store.close();
  return {
    dir, vault, vaultGuid, ops, ada, claimGuid, proposition,
    mutableFile: path.join(vault, '.mutable', 'mutable.db'),
    auditFile: path.join(vault, '.mutable', 'audit.db'),
  };
}

describe('4.6 converter and export', () => {
  it('converts with verified counts/hashes/fingerprints, preserves identity, and round-trips back to disk diff-equal', async () => {
    const f = diskFixture();
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

    // The operator keeps .mutable renamed as the fallback; the
    // phext-mode Cavern then stands on the phext alone.
    fs.renameSync(path.join(f.vault, '.mutable'), path.join(f.vault, '.mutable.disk-backup'));
    const vfs2 = PhextVFS.open(phextPath);
    const store = openFoundation({ vault: f.vault }, { phextVfs: vfs2, phextPath, scopeValidated: true });
    expect(store.vaultGuid).toBe(f.vaultGuid);
    expect(store.cardex({ op: 'get', id: f.ada.id }).entity.aliases.map((a: any) => a.name)).toEqual(['Enchantress']);
    expect(store.operationOutcome(f.ops.claim)).toMatchObject({ status: 'committed', delivery: 'pending' });
    expect(store.propositions({ op: 'get', id: f.proposition.id }).proposition.text).toBe('A😀é');

    // Export (the phext foundation's backup) → restoreSnapshot →
    // a disk Cavern whose canonical dump equals the original.
    const exported = await store.backup(path.join(f.dir, 'export'));
    expect(exported.vaultGuid).toBe(f.vaultGuid);
    expect(exported.files.mutable.sha256).toBe(sha256(fs.readFileSync(path.join(exported.directory, 'mutable.db'))));
    const restoredVault = path.join(f.dir, 'restored');
    fs.mkdirSync(restoredVault);
    restoreSnapshot(exported.directory, restoredVault);
    const restoredDump = dumpDiskKnowledge({
      mutableFile: path.join(restoredVault, '.mutable', 'mutable.db'),
      auditFile: path.join(restoredVault, '.mutable', 'audit.db'),
    });
    expect(canon(restoredDump)).toEqual(canon(dump));

    // The migrated outbox receipts still deliver after conversion.
    expect(store.deliverAudit({}).delivered).toBe(3);
    expect(store.auditStatus().pending).toBe(0);
    expect(store.operationOutcome(f.ops.claim)).toMatchObject({ status: 'committed', delivery: 'delivered' });
    store.close(); vfs2.close();
  });

  it('refuses to convert into a phext that already holds knowledge', () => {
    const f = diskFixture();
    const phextPath = path.join(f.vault, 'cavern.phext');
    const vfs = PhextVFS.openOrCreate(phextPath);
    const ks = new PhextKnowledgeStore(vfs);
    convertDiskKnowledgeToPhext({ mutableFile: f.mutableFile, auditFile: f.auditFile, store: ks });
    expect(() => convertDiskKnowledgeToPhext({ mutableFile: f.mutableFile, auditFile: f.auditFile, store: ks }))
      .toThrow(/already established/);
    vfs.close();
  });
});
