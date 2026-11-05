// @vitest-environment node
/**
 * PhextVFS Phase 3a — store-level scenarios in phext mode.
 *
 * The existing native store suites build fixtures with raw node:fs
 * and probe disk-only semantics (symlinks, chmod, external writers
 * racing through real fds, a child flocking the on-disk lock path),
 * so they cannot run flag-on unmodified — their fixtures would be
 * invisible to a virtual store. This suite replays their central
 * behaviors through the stores' own APIs with a phext-fs registration
 * in place: discovery of a paired save, pair + directory relocation
 * through the VFS rename, scope fences, the listing cache, and
 * cold-reopen persistence. Flag-off parity is the existing suites'
 * baseline (unchanged); this suite is the flag-on counterpart.
 */
import { afterEach, expect, it } from 'vitest';
import { promises as realFs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PhextVFS } from '../src/phext/vfs';
import { createFlockAnchorRegistry } from '../scripts/stage-c-gates/phext-backend.mjs';
import { registerPhextFs, unregisterPhextFs } from './phext-fs.mjs';
import { NativeVaultStore } from './native-vault-store.mjs';
import { VaultListingCache } from './vault-listing-cache.mjs';
import { ManagedPair, hash } from '../src/persistence/managed-pair.mjs';
import { decodeNative } from '../src/persistence/native-resource';
import { exportMarkdown } from '../src/persistence/markdown';

const cleanup = [];
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f(); });

async function fixture() {
  const root = await realFs.mkdtemp(path.join(os.tmpdir(), 'phext-docs-'));
  const vfs = PhextVFS.openOrCreate(path.join(root, 'cavern.phext'));
  registerPhextFs({ root, vfs, anchors: createFlockAnchorRegistry(vfs) });
  const store = new NativeVaultStore({ root, nativeDiscoveryWorker: false });
  cleanup.push(async () => {
    unregisterPhextFs(root);
    try { vfs.close(); } catch { /* already closed */ }
    await realFs.rm(root, { recursive: true, force: true });
  });
  return { root, vfs, store };
}

async function generation() {
  const native = await realFs.readFile('artifacts/flint-b1.2/rich.mutable.json', 'utf8');
  const resource = decodeNative(new TextEncoder().encode(native));
  const projection = exportMarkdown(resource);
  return { resourceId: resource.resourceId, generation: crypto.randomUUID(), native, markdown: projection.text, profile: projection.profile, targets: [] };
}

async function savedPair(root, folder = 'notes') {
  const g = await generation();
  const pair = new ManagedPair({ root: path.join(root, folder), resourceId: g.resourceId, nativeName: 'paper.mutable.json', markdownName: 'paper.md' });
  expect(await pair.save(g)).toMatchObject({ phase: 'saved' });
  return { g, pair };
}

it('discovery sees a paired save in the phext and reports it paired and complete', async () => {
  const { root, store } = await fixture();
  const { g } = await savedPair(root);
  const scan = await store.discover('.');
  expect(scan.complete).toBe(true);
  expect(scan.folders).toContain('notes');
  expect(scan.documents).toHaveLength(1);
  expect(scan.documents[0]).toMatchObject({ resourceId: g.resourceId, state: 'paired' });
  expect(scan.documents[0].location).toEqual({ folder: 'notes', filename: 'paper.mutable.json' });
  // The disk holds only the phext, its backup and lock anchors.
  const disk = await realFs.readdir(root);
  expect(disk.every(name => name === 'cavern.phext' || name === 'cavern.phext.bak' || name.startsWith('cavern.phext.anchor-'))).toBe(true);
});

it('pair relocation moves document, projection and journal through the VFS rename', async () => {
  const { root, store } = await fixture();
  const { g } = await savedPair(root);
  await store.mkdir('.', 'other');
  const scan = await store.discover('.');
  const result = await store.relocate({
    operationId: crypto.randomUUID(), vault: '.', kind: 'pair',
    source: 'notes/paper.mutable.json', destination: 'other/new.mutable.json',
    baselines: scan.documents.map(d => ({ resourceId: d.resourceId, baseline: d.baseline })),
  });
  expect(result.phase).toBe('relocated');
  expect((await store.read('other/new.mutable.json')).toString()).toBe(g.native);
  expect((await store.read('other/new.md')).toString()).toBe(g.markdown);
  expect(await store.read('notes/paper.mutable.json', true)).toBeUndefined();
  const after = await store.discover('.');
  expect(after.complete).toBe(true);
  expect(after.documents).toHaveLength(1);
  expect(after.documents[0]).toMatchObject({ state: 'paired' });
  expect(after.documents[0].location).toEqual({ folder: 'other', filename: 'new.mutable.json' });
  expect(await store.records()).toMatchObject([{ done: true }]);
});

it('directory relocation moves a nonempty folder and its pair journal', async () => {
  const { root, store } = await fixture();
  const { g } = await savedPair(root);
  const scan = await store.discover('.');
  const result = await store.relocate({
    operationId: crypto.randomUUID(), vault: '.', kind: 'directory',
    source: 'notes', destination: 'moved',
    baselines: scan.documents.map(d => ({ resourceId: d.resourceId, baseline: d.baseline })),
  });
  expect(result.phase).toBe('relocated');
  const after = await store.discover('.');
  expect(after.folders).toContain('moved');
  expect(after.folders).not.toContain('notes');
  expect(after.documents[0].location).toEqual({ folder: 'moved', filename: 'paper.mutable.json' });
  expect(after.documents[0].state).toBe('paired');
  expect(hash(await store.read('moved/paper.mutable.json'))).toBe(hash(g.native));
});

it('scope fences are stable across reads and expire on any save', async () => {
  const { root, store } = await fixture();
  await savedPair(root);
  const fence1 = await store.readScopeFence('.');
  expect(await store.readScopeFence('.')).toBe(fence1);
  const { pair } = await savedPair(root, 'other');
  expect(pair).toBeDefined();
  expect(await store.readScopeFence('.')).not.toBe(fence1);
});

it('listing cache browses the virtual tree; its cache file stays on disk under .mutable', async () => {
  const { root, store } = await fixture();
  await realFs.mkdir(path.join(root, '.mutable')); // establishment-owned, as on disk
  await savedPair(root);
  const cache = new VaultListingCache(store);
  const listing = await cache.browse('.');
  expect(listing.complete).toBe(true);
  expect(listing.documents).toHaveLength(1);
  expect(listing.documents[0].resourceId).toBeDefined();
  const cacheFile = path.join(root, '.mutable', 'discovery-cache.json');
  await expect(realFs.stat(cacheFile)).resolves.toBeDefined();
  const warm = await new VaultListingCache(store).browse('.');
  expect(warm.cached).toBe(true);
  expect(warm.documents).toEqual(listing.documents);
});

it('cold reopen: a fresh VFS from the phext alone returns document, receipt and records', async () => {
  const { root, store, vfs } = await fixture();
  const { g } = await savedPair(root);
  await store.mkdir('.', 'other');
  const scan = await store.discover('.');
  const op = crypto.randomUUID();
  await store.relocate({
    operationId: op, vault: '.', kind: 'pair',
    source: 'notes/paper.mutable.json', destination: 'other/new.mutable.json',
    baselines: scan.documents.map(d => ({ resourceId: d.resourceId, baseline: d.baseline })),
  });
  unregisterPhextFs(root);
  vfs.close();
  // Reopen strictly from the phext file: new VFS (checksum-verified),
  // new registration, new store instance.
  const cold = PhextVFS.open(path.join(root, 'cavern.phext'));
  cleanup.push(async () => { unregisterPhextFs(root); try { cold.close(); } catch { /* closed */ } });
  registerPhextFs({ root, vfs: cold, anchors: createFlockAnchorRegistry(cold) });
  const reopened = new NativeVaultStore({ root, nativeDiscoveryWorker: false });
  expect((await reopened.read('other/new.mutable.json')).toString()).toBe(g.native);
  const baseline = await reopened.baseline('other/new.mutable.json', g.resourceId);
  expect(baseline.receipt.generation).toBe(g.generation);
  expect(baseline.pending).toBeUndefined();
  expect(await reopened.records()).toMatchObject([{ done: true, intent: { operationId: op } }]);
  const rescan = await reopened.discover('.');
  expect(rescan.complete).toBe(true);
  expect(rescan.documents[0].state).toBe('paired');
});
