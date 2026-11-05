// @vitest-environment node
/**
 * PhextVFS Phase 4 — the phext knowledge foundation, tested at the
 * foundation seam (the same direct-open pattern the disk suites use).
 *
 * Gates covered:
 * - 4.1 ledger semantics: atomic mutation+receipt, idempotent retry,
 *   differing-request refusal, flush-failure rollback, crash between
 *   the audit write and the outbox delete redelivering by
 *   verification, outbox budget back-pressure.
 * - 4.2 scenarios: entities / cardex (with the D4 rule — observed
 *   aliases are replica-only and never enter L3) / semantics /
 *   propositions behave as on disk; a Cavern reopens cold from the
 *   phext alone; the ephemeral replica can be deleted mid-run
 *   without loss.
 * - 4.3 audit surfaces (status, deliver, outcome) served from L3.
 * - 4.5 establishment: mint-once vaultGuid mirrored in the L3 root
 *   index scroll, missing-control refusal, corrupt-record refusal,
 *   and the establishment contention error byte-identical to disk.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID as uuid } from 'node:crypto';
import { PhextVFS } from '../phext/vfs';
import { openFoundation } from './foundation.mjs';
import { lockVaultEstablishment } from './vault-scope.mjs';
import { PhextKnowledgeStore } from './phext-store.mjs';

const cleanups: Array<() => void> = [];
afterEach(() => { for (const f of cleanups.splice(0).reverse()) { try { f(); } catch { /* best effort */ } } });

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutable-phext-knowledge-'));
  const vault = path.join(dir, 'vault');
  fs.mkdirSync(vault);
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, vault, phextPath: path.join(vault, 'cavern.phext') };
}

const openPhext = (vault: string, phextPath: string, vfs: PhextVFS, options: Record<string, unknown> = {}) =>
  openFoundation({ vault, ...options }, { phextVfs: vfs, phextPath, scopeValidated: true });

const entityCreate = (name = 'Ada') => ({ op: 'create', id: uuid(), operationId: uuid(), name });

describe('4.1 ledger semantics over L3', () => {
  it('commits mutation + receipt atomically; retry is idempotent; a differing retry is refused', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    const store = openPhext(vault, phextPath, vfs, { initialize: true });
    const request = entityCreate();
    const created = store.entities(request);
    expect(created.entity.name).toBe('Ada');
    expect(store.auditStatus()).toMatchObject({ pending: 1, auditAvailable: true });
    // Idempotent retry: same result, no second receipt.
    expect(store.entities(request).entity.id).toBe(created.entity.id);
    expect(store.auditStatus().pending).toBe(1);
    // Differing retry under the same operationId refuses.
    expect(() => store.entities({ ...request, name: 'Changed' })).toThrow(/differs/);
    expect(store.operationOutcome(request.operationId)).toMatchObject({ status: 'committed', delivery: 'pending' });
    expect(store.operationOutcome(uuid()).status).toBe('not-committed');
    store.close(); vfs.close();
  });

  it('a failed flush commits nothing anywhere; the same operationId then retries clean', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    const store = openPhext(vault, phextPath, vfs, { initialize: true });
    const realFlush = vfs.flush.bind(vfs);
    let armed = true;
    (vfs as any).flush = () => { if (armed) { armed = false; throw Error('simulated flush failure'); } return realFlush(); };
    const request = entityCreate();
    expect(() => store.entities(request)).toThrow(/simulated flush failure/);
    expect(store.auditStatus().pending).toBe(0);
    expect(store.entities({ op: 'get', id: request.id }).entity).toBeUndefined();
    expect(store.operationOutcome(request.operationId).status).toBe('not-committed');
    (vfs as any).flush = realFlush;
    expect(store.entities(request).entity.name).toBe('Ada');
    expect(store.operationOutcome(request.operationId)).toMatchObject({ status: 'committed', delivery: 'pending' });
    store.close(); vfs.close();
  });

  it('crash between the audit write and the outbox delete redelivers by verification', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    const store = openPhext(vault, phextPath, vfs, { initialize: true });
    const request = entityCreate();
    store.entities(request);
    const realFlush = vfs.flush.bind(vfs);
    let calls = 0;
    (vfs as any).flush = () => { calls++; if (calls === 2) throw Error('simulated crash'); return realFlush(); };
    expect(() => store.deliverAudit({})).toThrow(/simulated crash/);
    // Process death: the instance (and its uncommitted overlay) is
    // discarded without close; the file holds audit + outbox together.
    store.close();
    const vfs2 = PhextVFS.open(phextPath);
    const reopened = openPhext(vault, phextPath, vfs2);
    expect(reopened.auditStatus().pending).toBe(1);
    expect(reopened.operationOutcome(request.operationId)).toMatchObject({ status: 'committed', delivery: 'pending' });
    expect(reopened.deliverAudit({})).toMatchObject({ delivered: 1 });
    expect(reopened.auditStatus().pending).toBe(0);
    expect(reopened.operationOutcome(request.operationId)).toMatchObject({ status: 'committed', delivery: 'delivered' });
    reopened.close(); vfs2.close();
  });

  it('outbox budget back-pressure refuses new mutations and commits nothing', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    const store = openPhext(vault, phextPath, vfs, { initialize: true });
    const ks = new PhextKnowledgeStore(vfs);
    ks.writeOutbox(uuid(), 'x'.repeat(16 * 1024 * 1024));
    ks.flush();
    const request = entityCreate();
    expect(() => store.entities(request)).toThrow(/outbox full/);
    expect(store.operationOutcome(request.operationId).status).toBe('not-committed');
    store.close(); vfs.close();
  });
});

describe('4.2/4.3 foundation scenarios and audit surfaces', () => {
  it('entities, cardex, semantics and propositions round-trip; cold reopen from the phext alone', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    const store = openPhext(vault, phextPath, vfs, { initialize: true });
    const vaultGuid = store.vaultGuid;

    const ada = store.cardex({
      op: 'save', id: uuid(), operationId: uuid(), expected: null, aliasBaseline: [],
      name: 'Ada Lovelace', nameStrata: null, descriptionDocument: null, imageRef: null,
      aliases: [{ id: uuid(), name: 'Enchantress', origin: 'curated' }],
    }).entity;
    expect(ada.aliases).toHaveLength(1);
    const subject = store.entities({ op: 'create', id: uuid(), operationId: uuid(), name: 'Subject', typename: 'Person' }).entity;
    const claimGuid = uuid();
    store.semantics({
      recordType: 'Claim', op: 'create', operationId: uuid(), guid: claimGuid,
      expression: 'unreliable', kind: 'Trait',
      participants: [
        { guid: uuid(), entityGuid: subject.id, role: 'Subject', ordinal: 0 },
        { guid: uuid(), entityGuid: ada.id, role: 'AccordingTo', ordinal: 1 },
      ],
    });
    expect(store.semantics({ recordType: 'Claim', op: 'get', guid: claimGuid }).record.participants).toHaveLength(2);
    const proposition = store.propositions({
      op: 'create', operationId: uuid(), id: uuid(), blockId: uuid(),
      name: 'Training claim', text: 'A😀é', annotations: [],
    }).proposition;
    expect(store.propositions({ op: 'get', id: proposition.id }).proposition.text).toBe('A😀é');

    // D4: an observed alias written straight into the replica (the
    // indexer path — no ledger) exists in the replica now but never
    // enters L3. (Cardex's alias list shows authored origins only —
    // the replica row itself is the thing that must not persist.)
    const observedId = uuid();
    store.readKnowledge((db: any) => db.prepare(
      "INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES(?,?,?,'observed name','observed')",
    ).run(observedId, ada.id, 'Observed Name'));
    const aliasCount = (s: any, origin: string) => s.readKnowledge((db: any) =>
      db.prepare('SELECT count(*) AS n FROM EntityAlias WHERE origin=?').get(origin).n);
    expect(aliasCount(store, 'observed')).toBe(1);
    const ks = new PhextKnowledgeStore(vfs);
    expect(ks.recordIds('EntityAlias').has(observedId)).toBe(false);
    expect(ks.recordIds('EntityAlias').size).toBe(1);

    // 4.3: audit surfaces from L3.
    const pending = store.auditStatus();
    expect(pending.pending).toBe(4);
    expect(store.deliverAudit({}).delivered).toBe(4);
    expect(store.auditStatus().pending).toBe(0);
    expect(store.inspect().audit.counts.AuditMutation).toBe(4);
    expect(store.verify().ok).toBe(true);
    expect(store.knowledgeRevision()).toMatch(/^\d+:\d+$/);
    store.close(); vfs.close();

    // Cold reopen: no .mutable knowledge files exist — the phext
    // alone re-establishes the foundation, replica rebuilt in temp.
    expect(fs.existsSync(path.join(vault, '.mutable'))).toBe(false);
    const vfs2 = PhextVFS.open(phextPath);
    const reopened = openPhext(vault, phextPath, vfs2);
    expect(reopened.vaultGuid).toBe(vaultGuid);
    const reread = reopened.cardex({ op: 'get', id: ada.id }).entity;
    expect(reread.name).toBe('Ada Lovelace');
    expect(reread.aliases.map((a: any) => a.name)).toEqual(['Enchantress']);
    // The observed alias did not survive the reopen: it was never in
    // L3, and the rebuilt replica starts from L3 alone (a reconcile
    // would re-derive it from saved documents, as designed).
    expect(aliasCount(reopened, 'observed')).toBe(0);
    expect(aliasCount(reopened, 'curated')).toBe(1);
    expect(reopened.semantics({ recordType: 'Claim', op: 'get', guid: claimGuid }).record.participants).toHaveLength(2);
    expect(reopened.propositions({ op: 'get', id: proposition.id }).proposition.text).toBe('A😀é');
    reopened.close(); vfs2.close();
  });

  it('the ephemeral replica can be deleted mid-run without loss', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    const store = openPhext(vault, phextPath, vfs, { initialize: true });
    const request = entityCreate('Ephemeral');
    store.entities(request);
    const cache = store.cacheFile();
    expect(fs.existsSync(cache)).toBe(true);
    fs.rmSync(path.dirname(cache), { recursive: true, force: true });
    store.close();
    const vfs2 = PhextVFS.open(phextPath);
    const reopened = openPhext(vault, phextPath, vfs2);
    expect(reopened.entities({ op: 'get', id: request.id }).entity.name).toBe('Ephemeral');
    reopened.close(); vfs2.close();
  });
});

describe('4.5 establishment and scope in phext mode', () => {
  it('refuses a non-initializing open; establishment mints the vaultGuid once and mirrors it', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    expect(() => openPhext(vault, phextPath, vfs)).toThrow(/not established/);
    const store = openPhext(vault, phextPath, vfs, { initialize: true });
    const guid = store.vaultGuid;
    expect(new PhextKnowledgeStore(vfs).readMirroredVaultGuid()).toBe(guid);
    store.close(); vfs.close();
    const vfs2 = PhextVFS.open(phextPath);
    const reopened = openPhext(vault, phextPath, vfs2);
    expect(reopened.vaultGuid).toBe(guid);
    reopened.close(); vfs2.close();
  });

  it('knowledge content without a control record is refused, never auto-repaired', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    const ks = new PhextKnowledgeStore(vfs);
    ks.writeRecord('Entity', { guid: uuid(), name: 'Orphan', nameKey: 'orphan' });
    ks.flush(); vfs.close();
    const vfs2 = PhextVFS.open(phextPath);
    expect(() => openPhext(vault, phextPath, vfs2, { initialize: true })).toThrow(/control record is missing/);
    vfs2.close();
  });

  it('a corrupt knowledge record refuses the open', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    const store = openPhext(vault, phextPath, vfs, { initialize: true });
    store.entities(entityCreate());
    store.close();
    const ks = new PhextKnowledgeStore(vfs);
    const [first] = ks.listRecords('Entity');
    vfs.writeFile(ks.recordPath('Entity', first.id), 'not json');
    vfs.flush(); vfs.close();
    const vfs2 = PhextVFS.open(phextPath);
    expect(() => openPhext(vault, phextPath, vfs2)).toThrow();
    vfs2.close();
  });

  it('establishment contention reports the byte-identical disk error', () => {
    const { vault, phextPath } = fixture();
    const vfs = PhextVFS.openOrCreate(phextPath);
    const release = lockVaultEstablishment();
    try {
      let caught: any;
      try { openPhext(vault, phextPath, vfs, { initialize: true }); } catch (e) { caught = e; }
      expect(caught?.message).toBe('Another Vault establishment is in progress; retry');
      expect(caught?.code).toBe('EWOULDBLOCK');
    } finally { release(); vfs.close(); }
  });
});
