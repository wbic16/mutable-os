// @vitest-environment node
/**
 * PhextVFS Phase 4 — end-to-end: a Cavern whose knowledge layer lives
 * in cavern.phext, driven through the real SqliteKnowledgeHost and
 * the real native document routes.
 *
 * Registration replicates cavern-lifecycle's flag-on sequence (gates
 * backend, phext-fs, knowledge registry, L7 strata record with
 * knowledge: 3) because the flag itself is a compile-time constant.
 * Flow: establish → entity mutate → audit deliver (status / outcome
 * from L3) → save a document → reconcile (the saved indexer stages
 * and commits against the ephemeral replica) → cold reopen from the
 * phext alone. A binary asset placed in L6 before the knowledge work
 * must round-trip byte-identically after it (the embedded-media
 * ruling: L6 keeps holding asset content). At no point may anything
 * but the phext, its .bak and the flock anchors exist on disk — in
 * particular no .mutable knowledge files.
 */
import { afterEach, expect, it } from 'vitest';
import express from 'express';
import { promises as realFs } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID as uuid } from 'node:crypto';
import { PhextVFS } from '../src/phext/vfs';
import { registerPhextFs, unregisterPhextFs } from './phext-fs.mjs';
import { registerPhextKnowledge, unregisterPhextKnowledge } from '../src/knowledge-sqlite/phext-registry.mjs';
import { openSqliteFoundation } from '../src/knowledge-sqlite/client.mjs';
import { SqliteKnowledgeHost } from './sqlite-knowledge-host';
import { createNativeDocumentStoreRouter } from './native-document-store.mjs';
import { decodeNative } from '../src/persistence/native-resource';
import { exportMarkdown } from '../src/persistence/markdown';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f(); });
const absent = { nativeHash: null, markdownHash: null, generation: null };

async function generation() {
  const native = await realFs.readFile('artifacts/flint-b1.2/rich.mutable.json', 'utf8');
  const resource = decodeNative(new TextEncoder().encode(native));
  const projection = exportMarkdown(resource);
  return { resourceId: resource.resourceId, generation: uuid(), native, markdown: projection.text, profile: projection.profile, targets: [], diagnostics: projection.diagnostics };
}

/** The lifecycle's flag-on registration sequence, with Phase 4 knowledge. */
async function registerCavern(root: string, vfs: PhextVFS) {
  const gates = await import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
  gates.registerPhextBackend({ root, vfs });
  registerPhextFs({ root, vfs });
  registerPhextKnowledge({ root, phextPath: path.join(root, 'cavern.phext'), vfs });
  vfs.writeFile('/.control/phext-strata.json', JSON.stringify({
    v: 1,
    phextBacked: { documents: 1, pairJournals: 2, knowledge: 3, history: 4, services: 5, assets: 6, control: 7 },
    onDisk: [],
  }));
  vfs.flush();
  return gates;
}

async function unregisterCavern(root: string, gates: any) {
  unregisterPhextFs(root);
  unregisterPhextKnowledge(root);
  await gates.unregisterPhextBackend(root);
}

function expectOnlyPhextFiles(entries: string[]) {
  for (const name of entries) {
    expect(
      name === 'cavern.phext' || name === 'cavern.phext.bak' || name.startsWith('cavern.phext.anchor-'),
      `unexpected on-disk entry in a phext-mode Cavern: ${name}`,
    ).toBe(true);
  }
}

async function startNativeServer(root: string, host: SqliteKnowledgeHost) {
  const app = express();
  app.use('/api/native', createNativeDocumentStoreRouter({
    root, coordinate: (action: any) => host.foreground(action), defaultVault: '.',
    establishVault: (vault: string) => host.establish(vault),
  } as any));
  const server = await new Promise<any>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return async (name: string, body?: unknown): Promise<any> => {
    const response = await fetch(`${base}/${name}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return { status: response.status, ...await response.json() };
  };
}

it('establish → mutate → audit deliver → save document → reconcile → cold reopen, assets byte-identical from L6', { timeout: 60000 }, async () => {
  const root = await realFs.mkdtemp(path.join(os.tmpdir(), 'mutable-phext-knowledge-e2e-'));
  cleanup.push(async () => { await realFs.rm(root, { recursive: true, force: true }); });
  const phextPath = path.join(root, 'cavern.phext');
  const assetBytes = Buffer.from(Array.from({ length: 8192 }, (_, i) => (i * 31 + 7) % 256));

  let vfs = PhextVFS.openOrCreate(phextPath);
  let gates = await registerCavern(root, vfs);
  // L6 asset content, placed before any knowledge work (embedded media).
  vfs.writeFile('/.mutable/assets/e2e-asset.bin', assetBytes, { format: 'binary' });
  vfs.flush();

  const host = new SqliteKnowledgeHost({ root });
  cleanup.push(async () => { await host.close().catch(() => {}); });
  const { vaultGuid } = await host.establish('.');
  expect(vaultGuid).toBeTruthy();

  // Mutate through the real host entity route.
  const entityId = uuid(), operationId = uuid();
  const created = await host.entityMutate({ vault: '.', request: { op: 'create', id: entityId, operationId, name: 'E2E Entity' } });
  expect(created.entity.name).toBe('E2E Entity');

  // Audit surfaces served from L3.
  const opened = await host.openSemantics('.');
  const lease = (opened as any).lease;
  expect((await host.semanticAudit({ lease, vaultGuid, op: 'status' })).pending).toBe(1);
  expect((await host.semanticAudit({ lease, vaultGuid, op: 'deliver' })).delivered).toBe(1);
  expect(await host.semanticAudit({ lease, vaultGuid, op: 'outcome', operationId }))
    .toMatchObject({ status: 'committed', delivery: 'delivered' });

  // Save a document through the real native routes, then reconcile:
  // the saved indexer stages and commits against the replica.
  const call = await startNativeServer(root, host);
  await call('native/vault/mkdir', { vault: '.', directory: 'notes' });
  const saved = await call('native/save', {
    location: { folder: 'notes', filename: 'paper.mutable.json' },
    generation: await generation(), baseline: absent,
  });
  expect(saved.Data.result.phase).toBe('saved');
  const acquired = await host.acquire('.');
  await host.refresh((acquired as any).lease);
  // The derived projection lives in the writer foundation's replica
  // (Tier 2 is a per-instance cache; the phext holds canonical data
  // only), so it is asserted through the host's own coverage — the
  // surface the lifecycle polls.
  const coverage = (await host.status((acquired as any).lease)).coverage as any;
  expect(coverage.resources).toBeGreaterThanOrEqual(1);
  expect(coverage.incompleteResources).toBe(0);
  expect(coverage.complete).toBe(true);
  const reader = await openSqliteFoundation({ vault: root, readOnly: true });
  cleanup.push(async () => { await reader.close().catch(() => {}); });
  expect((await reader.entities({ op: 'get', id: entityId })).entity.name).toBe('E2E Entity');
  await reader.close();

  expectOnlyPhextFiles((await realFs.readdir(root)).sort());
  expect(fs.existsSync(path.join(root, '.mutable'))).toBe(false);

  // Cold reopen from the phext alone.
  await host.close();
  await unregisterCavern(root, gates);
  vfs.close();
  const vfs2 = PhextVFS.open(phextPath);
  gates = await registerCavern(root, vfs2);
  cleanup.push(async () => { await unregisterCavern(root, gates).catch(() => {}); vfs2.close(); });
  const host2 = new SqliteKnowledgeHost({ root });
  cleanup.push(async () => { await host2.close().catch(() => {}); });
  expect((await host2.establish('.')).vaultGuid).toBe(vaultGuid);
  const reopened = await host2.openSemantics('.');
  expect(await host2.semanticAudit({ lease: (reopened as any).lease, vaultGuid, op: 'outcome', operationId }))
    .toMatchObject({ status: 'committed', delivery: 'delivered' });
  const reader2 = await openSqliteFoundation({ vault: root, readOnly: true });
  expect((await reader2.entities({ op: 'get', id: entityId })).entity.name).toBe('E2E Entity');
  await reader2.close();
  // The projection is rebuilt at Cavern open by the same pipeline:
  // a fresh acquire + refresh on the reopened host re-derives it
  // from the saved documents in the phext.
  const reacquired = await host2.acquire('.');
  await host2.refresh((reacquired as any).lease);
  const coverage2 = (await host2.status((reacquired as any).lease)).coverage as any;
  expect(coverage2.resources).toBeGreaterThanOrEqual(1);
  expect(coverage2.complete).toBe(true);
  await host2.close();

  // Asset continuity: L6 content survived the whole knowledge cycle.
  expect(vfs2.readFile('/.mutable/assets/e2e-asset.bin').equals(assetBytes)).toBe(true);
  expectOnlyPhextFiles((await realFs.readdir(root)).sort());
  expect(fs.existsSync(path.join(root, '.mutable'))).toBe(false);
});
