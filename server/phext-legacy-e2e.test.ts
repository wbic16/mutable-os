// @vitest-environment node
/**
 * PhextVFS Phase 3b — the legacy stores and uploads, end to end.
 *
 * A phext-mode Cavern (registration replicates cavern-lifecycle's
 * flag-on sequence, as in the Phase 3a E2E) exercises, through the
 * real routes and stores:
 *
 * - the legacy document store (server/document-store.ts): save,
 *   list, load of a plain-JSON document — tmp+rename publish and
 *   all, with nothing on disk;
 * - the workspace store (server/workspace-store.ts): legacy save,
 *   list, load through its confined realpath discipline;
 * - the recognized-document store: a full journalled save of a
 *   legacy-block-tree document whose journal home
 *   (.mutable/document-saves) lives inside the phext, an idempotent
 *   retry after cold reopen, and operations() reading the journal
 *   back from the phext;
 * - the discovery cache, retired: browse() reconciles from the VFS
 *   index scrolls and no discovery-cache.json exists anywhere;
 * - uploads: a binary image posted through the real multer engine
 *   (server/phext-uploads.mjs) lands embedded in the phext and is
 *   served back byte-identical by the phext static handler.
 *
 * Then everything is dropped and cold-reopened from the phext
 * alone, and every surface reads its state back.
 */
import { afterEach, expect, it } from 'vitest';
import express from 'express';
import multer from 'multer';
import { promises as realFs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PhextVFS } from '../src/phext/vfs';
import { registerPhextFs, unregisterPhextFs, promises as phextFs } from './phext-fs.mjs';
import { createDocumentStoreRouter } from './document-store';
import { createWorkspaceStoreRouter } from './workspace-store';
import { NativeVaultStore } from './native-vault-store.mjs';
import { RecognizedDocumentStore } from './recognized-document-store.mjs';
import { VaultListingCache } from './vault-listing-cache.mjs';
import { createPhextUploadStorage, createPhextUploadsStatic } from './phext-uploads.mjs';
import { nativeText } from '../src/persistence/native-resource';
import { recognizeCompatibleDocument } from '../src/persistence/compatible-document';
import { hash } from '../src/persistence/managed-pair.mjs';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f(); });

/** The lifecycle's flag-on registration sequence, verbatim in effect. */
async function registerCavern(root: string, vfs: PhextVFS) {
  const gates = await import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
  gates.registerPhextBackend({ root, vfs });
  registerPhextFs({ root, vfs });
  vfs.writeFile('/.control/phext-strata.json', JSON.stringify({
    v: 1,
    phextBacked: {
      documents: 1, pairJournals: 2, knowledge: 3, history: 4, services: 5, assets: 6, control: 7,
      legacyDocumentStores: 1, documentSavesJournal: 3, uploads: 1,
    },
    onDisk: [],
  }));
  vfs.flush();
  return gates;
}

async function listen(app: express.Express) {
  const server = await new Promise<any>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

function expectOnlyPhextFiles(entries: string[]) {
  for (const name of entries) {
    expect(
      name === 'cavern.phext' || name === 'cavern.phext.bak' || name.startsWith('cavern.phext.anchor-'),
      `unexpected on-disk entry in a phext-mode Cavern: ${name}`,
    ).toBe(true);
  }
}

/** A minimal synthetic legacy-block-tree document with a stable identity. */
async function legacyDocument() {
  const legacy = {
    id: 'legacy-root', type: 'document-block',
    metadata: { documentId: 'legacy-doc-9', title: 'Legacy Fixture' },
    children: [{ id: 'legacy-p1', type: 'plain-text-block', text: 'hello legacy' }],
  };
  const bytes = Buffer.from(JSON.stringify(legacy, null, 2));
  const recognized = recognizeCompatibleDocument(bytes);
  expect(recognized.format).toBe('legacy-block-tree');
  const edited = JSON.parse(bytes.toString('utf8'));
  edited.metadata = { ...edited.metadata, title: 'Revised Legacy' };
  const editedNative = nativeText(recognizeCompatibleDocument(Buffer.from(JSON.stringify(edited))).resource);
  return { bytes, resourceId: recognized.resource.resourceId, editedNative };
}

it('legacy stores, recognized journal, retired cache and uploads — one phext, cold reopen', async () => {
  const root = await realFs.mkdtemp(path.join(os.tmpdir(), 'phext-legacy-'));
  cleanup.push(async () => { await realFs.rm(root, { recursive: true, force: true }); });
  const phextPath = path.join(root, 'cavern.phext');
  let vfs = PhextVFS.openOrCreate(phextPath);
  let gates = await registerCavern(root, vfs);
  cleanup.push(async () => { await gates.unregisterPhextBackend(root); });

  // ---- the legacy document + workspace stores, through their routers
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api', createDocumentStoreRouter({ root, coordinate: (action: any) => action() } as any));
  app.use('/api', createWorkspaceStoreRouter({ documentRoot: root, workspaceRoot: root, coordinate: (action: any) => action() } as any));
  const base = await listen(app);
  const call = async (name: string, body?: unknown): Promise<any> => {
    const response = await fetch(`${base}/api/${name}`, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
    return { status: response.status, ...await response.json() };
  };

  const legacyDoc = { type: 'document-block', id: 'legacy-doc-1', children: [{ type: 'text-block', id: 'legacy-text-1', text: 'hello legacy' }] };
  const savedDoc = await call('saveDocumentJson', { folder: '.', filename: 'legacy-doc.json', document: legacyDoc });
  expect(savedDoc.Success).toBe(true);
  expect((await call('listDocuments?folder=.')).files).toContain('legacy-doc.json');
  const loadedDoc = await call('loadDocumentJson?folder=.&filename=legacy-doc.json');
  expect(loadedDoc.Data.document.id).toBe('legacy-doc-1');
  expect(loadedDoc.Data.document.children[0].text).toBe('hello legacy');

  const workspace = { type: 'workspace-block', children: [] };
  const savedWs = await call('saveWorkspaceJson', { filename: 'ws.json', workspace });
  expect(savedWs.Success).toBe(true);
  expect((await call('listWorkspaces')).workspaces).toContain('ws.json');
  const loadedWs = await call('loadWorkspaceJson?filename=ws.json');
  expect(loadedWs.Data.workspace.type).toBe('workspace-block');
  expectOnlyPhextFiles(await realFs.readdir(root));

  // ---- the recognized-document journal, inside the phext
  const legacy = await legacyDocument();
  await phextFs.writeFile(path.join(root, 'legacy.json'), legacy.bytes);
  const store = new NativeVaultStore({ root });
  const writer = new RecognizedDocumentStore(store);
  const input = {
    vault: '.', generation: crypto.randomUUID(), format: 'legacy-block-tree',
    source: { resourceId: legacy.resourceId, location: { folder: '.', filename: 'legacy.json' }, byteHash: hash(legacy.bytes) },
    native: legacy.editedNative,
  };
  const saved = await writer.save(input as any);
  expect(saved.phase).toBe('saved');
  expect(await writer.operations('.')).toEqual([]);
  // The journal record lives in the phext; the document changed in place.
  const home = `/.mutable/document-saves/${hash(legacy.resourceId)}`;
  expect(vfs.stat(`${home}/${input.generation}/complete.json`)?.type).toBe('file');
  const republished = recognizeCompatibleDocument(vfs.readFile('/legacy.json'));
  expect(republished.resource.resourceId).toBe(legacy.resourceId);
  expectOnlyPhextFiles(await realFs.readdir(root));

  // ---- discovery cache: retired — browse reconciles, no cache file
  const cache = new VaultListingCache(store);
  const listing = await cache.browse('.');
  expect(listing.cached).toBe(false);
  expect(vfs.stat('/.mutable/discovery-cache.json')).toBeUndefined();

  // ---- uploads through the real multer engine + static handler
  const imageBytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(Array.from({ length: 8192 }, (_, i) => (i * 31 + 7) % 256)),
  ]);
  const uploadApp = express();
  const storage = createPhextUploadStorage({ destinationFor: () => ({ root, directory: path.join(root, 'uploads') }) });
  uploadApp.post('/upload', multer({ storage }).array('image'), (req, res) => { res.json((req as any).files); });
  uploadApp.use('/uploads', createPhextUploadsStatic({ currentRoot: () => root }));
  const uploadBase = await listen(uploadApp);
  const form = new FormData();
  form.append('image', new Blob([imageBytes], { type: 'image/png' }), 'pic.png');
  const posted = await fetch(`${uploadBase}/upload`, { method: 'POST', body: form });
  expect(posted.status).toBe(200);
  const files = await posted.json();
  expect(files).toHaveLength(1);
  expect(files[0].filename).toMatch(/^\d+\.png$/);
  expect(files[0].size).toBe(imageBytes.length);
  const fetched = await fetch(`${uploadBase}/uploads/${files[0].filename}`);
  expect(fetched.status).toBe(200);
  expect(fetched.headers.get('content-type')).toBe('image/png');
  expect(Buffer.from(await fetched.arrayBuffer()).equals(imageBytes)).toBe(true);
  // Embedded: binary format in the phext, nothing on disk.
  expect(vfs.stat(`/uploads/${files[0].filename}`)?.format).toBe('binary');
  expect(vfs.readFile(`/uploads/${files[0].filename}`).equals(imageBytes)).toBe(true);
  expectOnlyPhextFiles(await realFs.readdir(root));

  // ---- cold reopen from the phext alone
  unregisterPhextFs(root);
  await gates.unregisterPhextBackend(root);
  vfs.close();
  vfs = PhextVFS.open(phextPath); // checksum-verified open
  gates = await registerCavern(root, vfs);

  expect((await call('loadDocumentJson?folder=.&filename=legacy-doc.json')).Data.document.id).toBe('legacy-doc-1');
  expect((await call('loadWorkspaceJson?filename=ws.json')).Data.workspace.type).toBe('workspace-block');
  const restarted = new RecognizedDocumentStore(new NativeVaultStore({ root }));
  expect(await restarted.operations('.')).toEqual([]);
  expect((await restarted.save(input as any)).phase).toBe('saved'); // idempotent retry
  const refetched = await fetch(`${uploadBase}/uploads/${files[0].filename}`);
  expect(Buffer.from(await refetched.arrayBuffer()).equals(imageBytes)).toBe(true);
  const strata = JSON.parse(vfs.readTextFile('/.control/phext-strata.json'));
  expect(strata.phextBacked).toMatchObject({ legacyDocumentStores: 1, documentSavesJournal: 3, uploads: 1 });
  expect(strata.onDisk).toEqual([]);
  expectOnlyPhextFiles(await realFs.readdir(root));

  unregisterPhextFs(root);
  await gates.unregisterPhextBackend(root);
  vfs.close();
}, 90000);
