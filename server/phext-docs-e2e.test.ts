// @vitest-environment node
/**
 * PhextVFS Phase 3a — end-to-end: a Cavern whose documents and
 * journals live in cavern.phext, driven through the real native
 * document routes.
 *
 * Registration replicates cavern-lifecycle's flag-on sequence exactly
 * (gates backend, then phext-fs, then the L7 strata record) because
 * the flag itself is a compile-time constant; the router under test
 * is the same createNativeDocumentStoreRouter the lifecycle mounts.
 * Flow: save a document (paired generation + receipt), interrupt a
 * second save before its receipt and recover it through the real
 * /recover route, then cold-reopen the Cavern from the phext alone
 * and read document + receipt + pending state back — asserting no
 * document or journal files exist on disk at any point (the phext,
 * its .bak and the flock anchors excepted).
 *
 * The node test environment matters: under the default jsdom
 * environment vitest rewrites import.meta.url for dynamically
 * imported modules, which breaks the gates module's top-level
 * fileURLToPath (the Phase 2 suites declare the same environment).
 */
import { afterEach, expect, it } from 'vitest';
import express from 'express';
import { promises as realFs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PhextVFS } from '../src/phext/vfs';
import { registerPhextFs, unregisterPhextFs } from './phext-fs.mjs';
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
  return { resourceId: resource.resourceId, generation: crypto.randomUUID(), native, markdown: projection.text, profile: projection.profile, targets: [], diagnostics: projection.diagnostics };
}

/** The lifecycle's flag-on registration sequence, verbatim in effect. */
async function registerCavern(root: string, vfs: PhextVFS) {
  const gates = await import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
  gates.registerPhextBackend({ root, vfs });
  registerPhextFs({ root, vfs });
  vfs.writeFile('/.control/phext-strata.json', JSON.stringify({
    v: 1,
    phextBacked: { documents: 1, pairJournals: 2, history: 4, services: 5, assets: 6, control: 7 },
    onDisk: ['knowledge (.mutable, SQLite) — Phase 4'],
  }));
  vfs.flush();
  return gates;
}

async function startServer(root: string, options: Record<string, unknown> = {}) {
  const app = express();
  app.use('/api/native', createNativeDocumentStoreRouter({ root, coordinate: (action: any) => action(), defaultVault: '.', establishVault: async () => {}, ...options } as any));
  const server = await new Promise<any>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return async (name: string, body?: unknown): Promise<any> => {
    const response = await fetch(`${base}/${name}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return { status: response.status, ...await response.json() };
  };
}

async function diskEntries(root: string) {
  return (await realFs.readdir(root)).sort();
}

function expectOnlyPhextFiles(entries: string[]) {
  for (const name of entries) {
    expect(
      name === 'cavern.phext' || name === 'cavern.phext.bak' || name.startsWith('cavern.phext.anchor-'),
      `unexpected on-disk entry in a phext-mode Cavern: ${name}`,
    ).toBe(true);
  }
}

it('save, interrupted save + recover, and cold reopen — all inside one phext', async () => {
  const root = await realFs.mkdtemp(path.join(os.tmpdir(), 'phext-e2e-'));
  cleanup.push(async () => { await realFs.rm(root, { recursive: true, force: true }); });
  const phextPath = path.join(root, 'cavern.phext');
  let vfs = PhextVFS.openOrCreate(phextPath);
  let gates = await registerCavern(root, vfs);
  cleanup.push(async () => { await gates.unregisterPhextBackend(root); });

  // One-shot fault: the second save dies after publication, before
  // its receipt — the pending-generation shape /recover exists for.
  let armed = false;
  const fault = async (stage: string) => { if (armed && stage === 'before-receipt') { armed = false; throw new Error('injected interruption'); } };
  let call = await startServer(root, { fault });
  const location = { folder: 'notes', filename: 'paper.mutable.json' };

  // The folder comes into being through the real mkdir route, as a
  // client would create it (the store never creates folders implicitly).
  const made = await call('native/vault/mkdir', { vault: '.', directory: 'notes' });
  expect(made.Data).toEqual({ directory: 'notes' });
  expectOnlyPhextFiles(await diskEntries(root));

  // Establish-shaped first save through the real native route.
  const g1 = await generation();
  const saved = await call('native/save', { location, generation: g1, baseline: absent });
  expect(saved.Data.result.phase).toBe('saved');
  expect(saved.Data.baseline.generation).toBe(g1.generation);
  expectOnlyPhextFiles(await diskEntries(root));

  // Interrupted second save: publication lands, receipt does not.
  const g2 = { ...g1, generation: crypto.randomUUID() };
  armed = true;
  const interrupted = await call('native/save', { location, generation: g2, baseline: saved.Data.baseline });
  expect(interrupted.Data.result.phase).not.toBe('saved');
  expectOnlyPhextFiles(await diskEntries(root));

  // Recover through the real route; the generation completes.
  const recovered = await call('native/recover', { location, resourceId: g1.resourceId, generation: g2.generation, baseline: absent });
  expect(recovered.Data.result.phase).toBe('saved');
  expect(recovered.Data.baseline.generation).toBe(g2.generation);
  expectOnlyPhextFiles(await diskEntries(root));

  // Cold reopen from the phext alone: drop registrations, close the
  // VFS, and rebuild everything from the file on disk.
  unregisterPhextFs(root);
  await gates.unregisterPhextBackend(root);
  vfs.close();
  vfs = PhextVFS.open(phextPath); // checksum-verified open
  gates = await registerCavern(root, vfs);
  call = await startServer(root);

  const opened = await call('native/open', { location });
  expect(opened.Data.native).toBe(g1.native);
  expect(opened.Data.resourceId).toBe(g1.resourceId);
  expect(opened.Data.baseline.generation).toBe(g2.generation);
  expect(opened.Data.pending).toBeFalsy();
  const listed = await call('native/list?folder=notes');
  expect(listed.Data.files).toContain('paper.mutable.json');
  // The strata record rode along in the phext.
  const strata = JSON.parse(vfs.readTextFile('/.control/phext-strata.json'));
  expect(strata.phextBacked).toMatchObject({ documents: 1, pairJournals: 2 });
  expectOnlyPhextFiles(await diskEntries(root));

  unregisterPhextFs(root);
  await gates.unregisterPhextBackend(root);
  vfs.close();
}, 30000);
