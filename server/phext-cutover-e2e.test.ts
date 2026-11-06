// @vitest-environment node
/**
 * Mode selection — the headline receipts (formerly the phext-only
 * cutover suite).
 *
 * (a) Disk-silence: through the real lifecycle server, establish a
 * Cavern (no mode requested — the new-Cavern default is Phext) and
 * exercise a document save, a knowledge write, an upload and a
 * history append; afterwards the whole temp home must contain only
 * the installation state file and, inside the Cavern, cavern.phext
 * (+ .bak / anchor mechanism files). No .mutable, no uploads
 * directory, no loose data files anywhere.
 *
 * (b) Derivation, not conversion: a disk-born Cavern (Phase-5-era
 * layout: .mutable/mutable.db + audit.db, documents as plain files)
 * opens through the lifecycle in NATIVE mode — nothing is
 * converted on encounter, the disk knowledge home stays live, and
 * the open records the mode in `.mutable/cavern-state.json`.
 *
 * (c) The explicit upgrade: close → migrate → reopen. The verified
 * migration generates the phext and records mode phext inside it;
 * the native tree remains byte-for-byte identical as a frozen
 * snapshot (no fallback directory, `.mutable` still in place), and
 * after the flip, writes land in the phext while the snapshot's
 * hashes never move.
 *
 * (b2) A corrupt disk-born Cavern is refused explicitly with its
 * originals byte-identical and no phext created.
 */
import { afterEach, expect, it } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import { promises as realFs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHash, randomUUID as uuid } from 'node:crypto';
import Database from 'better-sqlite3';
import { createCavernLifecycle } from './cavern-lifecycle';
import { PhextVFS } from '../src/phext/vfs';
import { createPhextUploadStorage } from './phext-uploads.mjs';
import { createHistoryStore } from './history-store';
import { decodeNative } from '../src/persistence/native-resource';
import { exportMarkdown } from '../src/persistence/markdown';
import { migrate } from '../src/knowledge-sqlite/schema.mjs';
import { PhextKnowledgeStore } from '../src/knowledge-sqlite/phext-store.mjs';

const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f().catch(() => {}); });

async function boot(home: string) {
  const lifecycle = createCavernLifecycle({ stateFile: path.join(home, 'preferences.json') });
  cleanup.push(async () => { await lifecycle.close(); });
  const app = express();
  app.use(express.json({ limit: '16mb' }));
  app.use('/api/cavern', lifecycle.router);
  app.use('/api', lifecycle.middleware);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  cleanup.push(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  const port = (server.address() as { port: number }).port;
  const call = async (action: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cavern/${action}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) } as any;
  };
  const api = async (action: string, session: string, body: unknown = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mutable-Cavern': session }, body: JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) } as any;
  };
  return { lifecycle, call, api };
}

async function generation() {
  const native = await realFs.readFile('artifacts/flint-b1.2/rich.mutable.json', 'utf8');
  const resource = decodeNative(new TextEncoder().encode(native));
  const projection = exportMarkdown(resource);
  return { resourceId: resource.resourceId, generation: uuid(), native, markdown: projection.text, profile: projection.profile, targets: [], diagnostics: projection.diagnostics };
}

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

it('(a) disk-silence: save + knowledge + upload + history leave only the phext in the Cavern', { timeout: 180000 }, async () => {
  const home = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'cutover-silence-')));
  cleanup.push(async () => { await realFs.rm(home, { recursive: true, force: true }); });
  const cavern = path.join(home, 'cavern');
  const { call, api } = await boot(home);
  const opened = await call('establish', { path: cavern, intent: 'create' });
  expect(opened.Success, opened.Error).toBe(true);
  // New Caverns default to Phext (design §2.1): no mode was
  // requested, and the recorded mode says phext.
  expect(opened.Data.current.mode).toBe('phext');
  const session = opened.Data.current.session as string;

  // Document save (native routes, through the lifecycle middleware).
  expect((await api('native/vault/mkdir', session, { vault: '.', directory: 'notes' })).Success).toBe(true);
  const gen = await generation();
  const saved = await api('native/save', session, {
    location: { folder: 'notes', filename: 'paper.mutable.json' },
    generation: gen, baseline: { nativeHash: null, markdownHash: null, generation: null },
  });
  expect(saved.Success, saved.Error).toBe(true);
  expect(saved.Data.result.phase).toBe('saved');

  // Knowledge write: reconciliation of the saved document, plus a
  // direct entity mutation through the knowledge host routes.
  const policy = { version: 1, opaqueTypes: ['application-block', 'timer-block'] };
  expect((await call('index', { session, policy })).Success).toBe(true);
  const mutated = await api('sqlite/knowledge/entity-mutate', session, {
    vault: '.', policy, request: { op: 'create', id: uuid(), operationId: uuid(), name: 'Silence Entity' },
  });
  expect(mutated.Success, mutated.Error).toBe(true);
  expect(mutated.Data.entity.name).toBe('Silence Entity');

  // Upload through the production phext multer engine (the engine
  // server/index.ts mounts on /upload).
  const storage = createPhextUploadStorage({ destinationFor: () => ({ root: cavern, directory: path.join(cavern, 'uploads') }) });
  const uploaded = await new Promise<any>((resolve, reject) => {
    (storage as any)._handleFile({}, { originalname: 'pixel.png', stream: Readable.from([Buffer.from('PNG-BYTES')]) },
      (error: any, info: any) => error ? reject(error) : resolve(info));
  });
  expect(uploaded.size).toBe(9);
  expect(uploaded.path.startsWith(path.join(cavern, 'uploads'))).toBe(true);

  // History append through the production history store (the store
  // the history router wraps), resolved onto the Cavern's phext
  // through the lifecycle-registered gates backend.
  const store = createHistoryStore({ root: cavern });
  const location = { folder: 'notes', filename: 'paper.mutable.json', resourceId: gen.resourceId };
  const handle = await store.open(location);
  const writer = await handle.acquireWriter();
  const bytes = Buffer.from('{"state":"baseline"}');
  const descriptor = { hash: sha(bytes), byteLength: bytes.length, chunks: [{ hash: sha(bytes), byteLength: bytes.length }] };
  await writer.putChunk({ hash: sha(bytes), dataBase64: bytes.toString('base64') });
  await writer.beginSegment({ segmentId: 'segment-1', revisionId: 'revision-0', baseline: descriptor, metadata: { label: 'Opened Document' } });
  const ack = await writer.append({
    segmentId: 'segment-1', sequence: 1, recordId: 'revision-1', revisionId: 'revision-1', stateParent: 'revision-0',
    wire: JSON.stringify({ exact: 1 }), metadata: { affectedBlockIds: ['block-1'] },
  } as any);
  expect(ack.sequence).toBe(1);
  await writer.close();

  // Audit the whole temp home. Every write above flushed eagerly
  // (the VFS durability discipline), so the on-disk tree already
  // shows the final shape; lifecycle close (in cleanup) adds
  // nothing but the phext's own .bak generation.
  const files = walk(home);
  const allowed = (rel: string) => rel === 'preferences.json'
    || rel === 'cavern/cavern.phext' || rel === 'cavern/cavern.phext.bak'
    || /^cavern\/cavern\.phext\.anchor-.+$/.test(rel);
  expect(files.length).toBeGreaterThan(0);
  for (const rel of files) expect(allowed(rel), `unexpected file under the temp home: ${rel} (all: ${files.join(', ')})`).toBe(true);
  expect(files).toContain('cavern/cavern.phext');
  expect(fs.existsSync(path.join(cavern, '.mutable'))).toBe(false);
  expect(fs.existsSync(path.join(cavern, 'uploads'))).toBe(false);
  expect(fs.existsSync(path.join(cavern, 'notes'))).toBe(false);
  // The mode is recorded in the Cavern's own L7 state record.
  const vfs = PhextVFS.open(path.join(cavern, 'cavern.phext'));
  try { expect(JSON.parse(vfs.readTextFile('/.control/cavern-state.json')).mode).toBe('phext'); }
  finally { vfs.close(); }
});

function diskBornCavern(t: any, corrupt = false) {
  return (async () => {
    const home = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'cutover-upgrade-')));
    cleanup.push(async () => { await realFs.rm(home, { recursive: true, force: true }); });
    const cavern = path.join(home, 'legacy');
    await realFs.mkdir(path.join(cavern, '.mutable'), { recursive: true });
    await realFs.mkdir(path.join(cavern, 'notes'), { recursive: true });
    const vaultGuid = uuid();
    if (corrupt) {
      await realFs.writeFile(path.join(cavern, '.mutable', 'mutable.db'), Buffer.from('not a sqlite database at all'));
    } else {
      const mutable = new Database(path.join(cavern, '.mutable', 'mutable.db'));
      migrate(mutable, 'mutable', { fresh: true, vaultGuid });
      mutable.prepare('INSERT INTO Entity(guid,name,nameKey,description) VALUES(?,?,?,?)')
        .run('11111111-1111-4111-8111-111111111111', 'Legacy Entity', 'legacy entity', 'Born on disk');
      mutable.close();
      const audit = new Database(path.join(cavern, '.mutable', 'audit.db'));
      migrate(audit, 'audit', { fresh: true, vaultGuid });
      audit.close();
    }
    const docBytes = Buffer.from(JSON.stringify({ type: 'Document', title: 'Legacy Paper' }));
    const noteBytes = Buffer.from('field notes from the disk era');
    await realFs.writeFile(path.join(cavern, 'paper.mutable.json'), docBytes);
    await realFs.writeFile(path.join(cavern, 'notes', 'readme.txt'), noteBytes);
    return { home, cavern, vaultGuid, docBytes, noteBytes };
  })();
}

it('(b) a disk-born Cavern derives native and opens natively — no conversion on encounter', { timeout: 180000 }, async () => {
  const f = await diskBornCavern(undefined);
  const { call, api } = await boot(f.home);
  const inspected = await call('inspect', { path: f.cavern });
  expect(inspected.Success, inspected.Error).toBe(true);
  expect(inspected.Data.mode).toBe('native');
  expect(inspected.Data.modeSource).toBe('derived');
  const opened = await call('establish', { path: f.cavern, intent: 'open', confirmed: true });
  expect(opened.Success, opened.Error).toBe(true);
  expect(opened.Data.current.mode).toBe('native');
  const session = opened.Data.current.session as string;

  // Nothing was converted: no phext exists, and the disk tree is
  // exactly where it always was, byte-identical.
  expect(fs.existsSync(path.join(f.cavern, 'cavern.phext'))).toBe(false);
  expect(fs.existsSync(path.join(f.cavern, '.mutable', 'mutable.db'))).toBe(true);
  expect(fs.existsSync(path.join(f.cavern, '.mutable-disk-fallback'))).toBe(false);
  expect(await realFs.readFile(path.join(f.cavern, 'paper.mutable.json'))).toEqual(f.docBytes);
  expect(await realFs.readFile(path.join(f.cavern, 'notes', 'readme.txt'))).toEqual(f.noteBytes);

  // The open recorded the mode in the Cavern's own native record —
  // derivation happens at most once.
  const marker = JSON.parse(await realFs.readFile(path.join(f.cavern, '.mutable', 'cavern-state.json'), 'utf8'));
  expect(marker.mode).toBe('native');
  expect(marker.cavernGuid).toBe(f.vaultGuid);

  // The disk knowledge home is live: a mutation through the API
  // lands in .mutable/mutable.db beside the seeded legacy entity.
  const mutated = await api('sqlite/knowledge/entity-mutate', session, {
    vault: '.', request: { op: 'create', id: uuid(), operationId: uuid(), name: 'Native Era Entity' },
  });
  expect(mutated.Success, mutated.Error).toBe(true);
  const db = new Database(path.join(f.cavern, '.mutable', 'mutable.db'), { readonly: true });
  try {
    const names = db.prepare('SELECT name FROM Entity').all().map((r: any) => r.name);
    expect(names).toContain('Legacy Entity');
    expect(names).toContain('Native Era Entity');
  } finally { db.close(); }
});

it('(c) explicit upgrade: migration generates the phext, the native tree freezes byte-identical', { timeout: 180000 }, async () => {
  const f = await diskBornCavern(undefined);
  const { call, api } = await boot(f.home);
  const opened = await call('establish', { path: f.cavern, intent: 'open', confirmed: true });
  expect(opened.Success, opened.Error).toBe(true);
  expect(opened.Data.current.mode).toBe('native');
  expect((await call('close', {})).Success).toBe(true);

  // Hash the whole native tree as it stands after the native open
  // (the open itself wrote only the mode record inside it).
  const hashTree = async () => {
    const entries: Record<string, string> = {};
    for (const rel of walk(f.cavern)) entries[rel] = sha(await realFs.readFile(path.join(f.cavern, rel)));
    return entries;
  };
  const before = await hashTree();
  const migrated = await call('migrate', { path: f.cavern });
  expect(migrated.Success, migrated.Error).toBe(true);
  expect(migrated.Data.verified).toBe(true);
  expect(migrated.Data.fallback).toBe(null);
  expect(migrated.Data.fallbackPath).toBe(null);

  // Non-destructive: every pre-upgrade file is byte-identical, the
  // knowledge home is still in place, and there is no fallback dir.
  const after = await hashTree();
  for (const [rel, digest] of Object.entries(before)) expect(after[rel], rel).toBe(digest);
  expect(fs.existsSync(path.join(f.cavern, '.mutable', 'mutable.db'))).toBe(true);
  expect(fs.existsSync(path.join(f.cavern, '.mutable-disk-fallback'))).toBe(false);

  // The phext carries everything and records the mode; the
  // migration record names the whole native tree as on-disk.
  const vfs = PhextVFS.open(path.join(f.cavern, 'cavern.phext'));
  try {
    expect(vfs.readFile('/paper.mutable.json')).toEqual(f.docBytes);
    expect(vfs.readFile('/notes/readme.txt')).toEqual(f.noteBytes);
    const store = new PhextKnowledgeStore(vfs);
    const entities = store.listRecords('Entity').map((r: any) => r.record);
    expect(entities.some((e: any) => e.name === 'Legacy Entity')).toBe(true);
    const state = JSON.parse(vfs.readTextFile('/.control/cavern-state.json'));
    expect(state.mode).toBe('phext');
    expect(state.cavernGuid).toBe(f.vaultGuid);
    expect(typeof state.migratedUtc).toBe('string');
    const record = JSON.parse(vfs.readTextFile('/.control/phext-migration.json'));
    expect(record.fallback).toBe(null);
    expect(record.onDisk).toEqual(expect.arrayContaining(['.mutable/mutable.db', '.mutable/audit.db', 'paper.mutable.json', 'notes/readme.txt']));
  } finally { vfs.close(); }

  // Reopen: the recorded mode governs — phext, despite BOTH the
  // phext and the native era's marker being on disk.
  const reopened = await call('establish', { path: f.cavern, intent: 'open', confirmed: true });
  expect(reopened.Success, reopened.Error).toBe(true);
  expect(reopened.Data.current.mode).toBe('phext');
  const session = reopened.Data.current.session as string;

  // After the flip the snapshot is frozen: a knowledge write lands
  // in the phext and the native tree's hashes do not move.
  const mutated = await api('sqlite/knowledge/entity-mutate', session, {
    vault: '.', request: { op: 'create', id: uuid(), operationId: uuid(), name: 'Phext Era Entity' },
  });
  expect(mutated.Success, mutated.Error).toBe(true);
  const frozen = await hashTree();
  for (const [rel, digest] of Object.entries(before)) expect(frozen[rel], rel).toBe(digest);
  const vfs2 = PhextVFS.open(path.join(f.cavern, 'cavern.phext'));
  try {
    const store = new PhextKnowledgeStore(vfs2);
    const entities = store.listRecords('Entity').map((r: any) => r.record);
    expect(entities.some((e: any) => e.name === 'Phext Era Entity')).toBe(true);
  } finally { vfs2.close(); }
});

it('(b2) a corrupt disk-born Cavern is refused, originals untouched', { timeout: 180000 }, async () => {
  const f = await diskBornCavern(undefined, true);
  const dbBefore = await realFs.readFile(path.join(f.cavern, '.mutable', 'mutable.db'));
  const docBefore = await realFs.readFile(path.join(f.cavern, 'paper.mutable.json'));
  const { call } = await boot(f.home);
  const opened = await call('establish', { path: f.cavern, intent: 'open', confirmed: true });
  expect(opened.Success).toBe(false);
  expect(typeof opened.Error).toBe('string');
  expect(opened.Error.length).toBeGreaterThan(0);
  // No conversion was attempted and nothing was written into the
  // folder: the corrupt originals stand exactly as they were.
  expect(await realFs.readFile(path.join(f.cavern, '.mutable', 'mutable.db'))).toEqual(dbBefore);
  expect(await realFs.readFile(path.join(f.cavern, 'paper.mutable.json'))).toEqual(docBefore);
  expect(fs.existsSync(path.join(f.cavern, 'cavern.phext'))).toBe(false);
  expect(fs.existsSync(path.join(f.cavern, '.mutable-disk-fallback'))).toBe(false);
});
