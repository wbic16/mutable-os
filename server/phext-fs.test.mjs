// @vitest-environment node
/**
 * PhextVFS Phase 3a — phext-fs shim unit suite.
 *
 * Exercises server/phext-fs.mjs against a real PhextVFS: create-
 * exclusive collision, publish atomicity across a flush boundary,
 * rename (POSIX + exclusive), listing, identity/stamp semantics,
 * lock routing to real flock anchors with byte-identical contention
 * contracts, fallthrough for unregistered / .mutable paths, and the
 * block-boundary slicing of a real native envelope (the
 * artifacts/flint-b1.2 rich document): hash before == hash after and
 * every block slice aligned to its block id.
 */
import { afterEach, expect, it } from 'vitest';
import { constants as C, fstatSync, promises as realFs } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { PhextVFS } from '../src/phext/vfs';
import { parseCoordinate } from '../src/phext/coordinate';
import { createFlockAnchorRegistry } from '../scripts/stage-c-gates/phext-backend.mjs';
import { promises as fs, registerPhextFs, unregisterPhextFs, sliceNativeEnvelope } from './phext-fs.mjs';
import { ManagedPair, hash, nativeFlock } from '../src/persistence/managed-pair.mjs';
import { NativeVaultStore } from './native-vault-store.mjs';
import { decodeNative } from '../src/persistence/native-resource';
import { exportMarkdown } from '../src/persistence/markdown';

const cleanup = [];
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f(); });

async function fixture() {
  const root = await realFs.mkdtemp(path.join(os.tmpdir(), 'phext-fs-'));
  const vfs = PhextVFS.openOrCreate(path.join(root, 'cavern.phext'));
  const anchors = createFlockAnchorRegistry(vfs);
  const backend = registerPhextFs({ root, vfs, anchors });
  cleanup.push(async () => {
    unregisterPhextFs(root);
    try { vfs.close(); } catch { /* already closed */ }
    await realFs.rm(root, { recursive: true, force: true });
  });
  return { root, vfs, anchors, backend };
}

const durableWrite = async (file, data, exclusive = true) => {
  const h = await fs.open(file, exclusive ? 'wx' : 'w');
  try { await h.writeFile(data); await h.sync(); } finally { await h.close(); }
};

it('create-exclusive writes collide with EEXIST (numeric and string flags)', async () => {
  const { root } = await fixture();
  const file = path.join(root, 'exclusive.txt');
  await durableWrite(file, 'first');
  await expect(fs.open(file, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o600))
    .rejects.toMatchObject({ code: 'EEXIST' });
  await expect(fs.open(file, 'wx')).rejects.toMatchObject({ code: 'EEXIST' });
  expect((await fs.readFile(file)).toString()).toBe('first');
});

it('publish by link is atomic: no partial file is ever visible, across a flush boundary', async () => {
  const { root, vfs } = await fixture();
  const temp = path.join(root, 'paper.publish-tmp');
  const file = path.join(root, 'paper.txt');
  await expect(fs.readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
  // A staged but unpublished temp is invisible at the destination.
  await durableWrite(temp, 'complete bytes');
  await expect(fs.readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
  await fs.link(temp, file);
  await fs.unlink(temp);
  expect((await fs.readFile(file)).toString()).toBe('complete bytes');
  // Re-publishing over an existing destination fails like a hard link.
  await durableWrite(temp, 'other bytes');
  await expect(fs.link(temp, file)).rejects.toMatchObject({ code: 'EEXIST' });
  await fs.unlink(temp);
  // Across the flush boundary: a cold VFS opened from the phext file
  // alone sees exactly the published bytes.
  vfs.flush();
  const cold = PhextVFS.open(path.join(root, 'cavern.phext'));
  try { expect(cold.readFile('/paper.txt').toString()).toBe('complete bytes'); } finally { cold.close(); }
});

it('rename replaces a file destination (POSIX) while the exclusive primitive refuses', async () => {
  const { root, backend } = await fixture();
  const a = path.join(root, 'a.txt'), b = path.join(root, 'b.txt'), c = path.join(root, 'c.txt');
  await durableWrite(a, 'A');
  await durableWrite(b, 'B');
  await fs.rename(a, b); // receipt-style publish over an existing file
  expect((await fs.readFile(b)).toString()).toBe('A');
  await expect(fs.lstat(a)).rejects.toMatchObject({ code: 'ENOENT' });
  backend.renameExclusive(b, c);
  await durableWrite(a, 'A2');
  expect(() => backend.renameExclusive(c, a)).toThrowError(/already exists|EEXIST/);
  // Directory rename carries the whole subtree.
  await fs.mkdir(path.join(root, 'd1', 'sub'), { recursive: true });
  await durableWrite(path.join(root, 'd1', 'sub', 'leaf.txt'), 'leaf');
  await fs.rename(path.join(root, 'd1'), path.join(root, 'd2'));
  expect((await fs.readFile(path.join(root, 'd2', 'sub', 'leaf.txt'))).toString()).toBe('leaf');
  await expect(fs.lstat(path.join(root, 'd1'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('readdir lists the virtual tree (Dirent shapes) and hides the control registry', async () => {
  const { root } = await fixture();
  await fs.mkdir(path.join(root, 'notes'), { recursive: true });
  await durableWrite(path.join(root, 'notes', 'paper.txt'), 'x');
  await durableWrite(path.join(root, 'top.txt'), 'y');
  const names = await fs.readdir(root);
  expect(names).toContain('notes');
  expect(names).toContain('top.txt');
  expect(names).not.toContain('.control'); // L7 fs-nodes registry is plumbing
  expect(names).not.toContain('cavern.phext'); // the phext itself is not a document
  const entries = await fs.readdir(path.join(root, 'notes'), { withFileTypes: true });
  expect(entries).toHaveLength(1);
  expect(entries[0].name).toBe('paper.txt');
  expect(entries[0].isFile()).toBe(true);
  expect(entries[0].isDirectory()).toBe(false);
  expect(entries[0].isSymbolicLink()).toBe(false);
});

it('native envelope round-trips byte-identically with block-aligned slices', async () => {
  const { root, vfs } = await fixture();
  const bytes = await realFs.readFile('artifacts/flint-b1.2/rich.mutable.json');
  const before = createHash('sha256').update(bytes).digest('hex');
  const envelope = JSON.parse(bytes.toString('utf8'));
  const blocks = envelope.document.blocks;
  expect(blocks.length).toBeGreaterThan(2);

  // The slicer partitions the raw bytes: head, one slice per block
  // (separators between blocks are their own slices), tail.
  const slices = sliceNativeEnvelope(bytes);
  expect(slices).toBeDefined();
  expect(Buffer.concat(slices.map(s => Buffer.from(s))).equals(bytes)).toBe(true);
  const blockSlices = slices.filter(s => { try { const v = JSON.parse(s.toString('utf8')); return v && typeof v === 'object' && typeof v.id === 'string'; } catch { return false; } });
  expect(blockSlices.map(s => JSON.parse(s.toString('utf8')).id)).toEqual(blocks.map(b => b.id));

  // Through the shim: byte-identical read-back, receipt-hash stable.
  const file = path.join(root, 'rich.mutable.json');
  await durableWrite(file, bytes, false);
  const back = await fs.readFile(file);
  expect(createHash('sha256').update(back).digest('hex')).toBe(before);
  expect(decodeNative(back).resourceId).toBe(decodeNative(bytes).resourceId);

  // The stored scrolls ARE the slices: chunk boundaries include every
  // slice boundary, and concatenating the chunk scrolls reproduces
  // the file byte-for-byte.
  const stat = vfs.stat('/rich.mutable.json');
  const first = parseCoordinate(stat.coordinate);
  const chunkBytes = [];
  for (let i = 1; i <= stat.chunks; i++) {
    const tuple = [...first];
    tuple[8] = i;
    chunkBytes.push(Buffer.from(vfs.lattice.readScroll(tuple), 'utf8'));
  }
  expect(Buffer.concat(chunkBytes).equals(bytes)).toBe(true);
  const chunkBoundaries = new Set([0]);
  let offset = 0;
  for (const chunk of chunkBytes) { offset += chunk.length; chunkBoundaries.add(offset); }
  offset = 0;
  for (const slice of slices) { offset += slice.length; expect(chunkBoundaries.has(offset)).toBe(true); }
  // One scroll per slice here (every slice is far below the 64K chunk size).
  expect(stat.chunks).toBe(slices.length);
  expect(stat.sha256).toBe(before);
});

it('opaque fallback: a native-named file that is not an envelope still round-trips', async () => {
  const { root } = await fixture();
  const file = path.join(root, 'broken.mutable.json');
  const bytes = Buffer.from('{"document": {"blocks": [not json');
  await durableWrite(file, bytes, false);
  expect((await fs.readFile(file)).equals(bytes)).toBe(true);
  expect(sliceNativeEnvelope(bytes)).toBeUndefined();
});

it('lock files route to real flock anchors; contention contracts stay byte-identical', async () => {
  const { root, anchors } = await fixture();
  const store = new NativeVaultStore({ root, nativeDiscoveryWorker: false });
  // The store lock takes the anchor beside the phext, not a disk file.
  let release;
  const held = store.lock(() => new Promise(resolve => { release = resolve; }));
  await new Promise(r => setTimeout(r, 100));
  await expect(store.lock(async () => 'x')).rejects.toThrow('Another managed operation is active; retry');
  release();
  await held;
  const anchorPath = anchors.anchorPathFor('/.mutable-store.lock');
  expect(anchorPath).toBe(path.join(root, `cavern.phext.anchor-${createHash('sha256').update('/.mutable-store.lock').digest('hex').slice(0, 16)}`));
  await expect(realFs.stat(anchorPath)).resolves.toBeDefined();
  await expect(realFs.stat(path.join(root, '.mutable-store.lock'))).rejects.toMatchObject({ code: 'ENOENT' });

  // ManagedPair's writer.lock: real fd, fs-ext/flock contention, and
  // the pair-level conflict result is the exact disk-mode sentence.
  const pair = new ManagedPair({ root, resourceId: 'res-1', nativeName: 'doc.mutable.json', markdownName: 'doc.md' });
  let releasePair;
  const pairHeld = pair.lock(() => new Promise(resolve => { releasePair = resolve; }));
  await new Promise(r => setTimeout(r, 100));
  const contended = await pair.lock(async () => ({ phase: 'saved' }));
  expect(contended).toEqual({ phase: 'failed', conflict: true, error: 'Another cooperating writer holds the resource lock' });
  releasePair();
  await pairHeld;
  // Direct handle check: the fd behind a virtual lock open is real.
  const h = await fs.open(path.join(root, '.mutable-store.lock'), C.O_RDWR | C.O_CREAT | C.O_NOFOLLOW, 0o600);
  expect(() => fstatSync(h.fd)).not.toThrow();
  await nativeFlock(h.fd, 'exnb');
  await nativeFlock(h.fd, 'un');
  await h.close();
});

it('stamps are stable, change on any rewrite, and identity survives rename', async () => {
  const { root } = await fixture();
  const file = path.join(root, 'stamped.txt');
  await durableWrite(file, 'same bytes');
  const s1 = await fs.lstat(file, { bigint: true });
  const s2 = await fs.lstat(file, { bigint: true });
  expect([s1.dev, s1.ino, s1.size, s1.mtimeNs, s1.ctimeNs]).toEqual([s2.dev, s2.ino, s2.size, s2.mtimeNs, s2.ctimeNs]);
  // A rewrite with identical bytes still moves the stamp (version bump).
  await durableWrite(file, 'same bytes', false);
  const s3 = await fs.lstat(file, { bigint: true });
  expect(s3.ino).toBe(s1.ino);
  expect(s3.mtimeNs).not.toBe(s1.mtimeNs);
  // Rename carries the identity (and therefore the stamp) to the new path.
  const moved = path.join(root, 'stamped-moved.txt');
  await fs.rename(file, moved);
  const s4 = await fs.lstat(moved, { bigint: true });
  expect([s4.dev, s4.ino, s4.mtimeNs]).toEqual([s3.dev, s3.ino, s3.mtimeNs]);
  await expect(fs.lstat(file)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('no fallthrough (cutover): .mutable paths are virtual, unregistered roots refuse with ENOPHEXT', async () => {
  const { root, vfs } = await fixture();
  // The .mutable carve-out is gone: the path resolves inside the
  // phext like everything else in the Cavern, and no real .mutable
  // directory appears on disk.
  await fs.writeFile(path.join(root, '.mutable', 'cache.json'), '{"on":"phext"}', { flag: 'wx', mode: 0o600 });
  expect(vfs.readFile('/.mutable/cache.json').toString('utf8')).toBe('{"on":"phext"}');
  await expect(realFs.stat(path.join(root, '.mutable'))).rejects.toMatchObject({ code: 'ENOENT' });
  // A path no registered Cavern covers is an explicit refusal —
  // never a silent write to real disk.
  const outside = await realFs.mkdtemp(path.join(os.tmpdir(), 'phext-fs-outside-'));
  cleanup.push(() => realFs.rm(outside, { recursive: true, force: true }));
  await expect(fs.writeFile(path.join(outside, 'plain.txt'), 'real')).rejects.toMatchObject({ code: 'ENOPHEXT' });
  await expect(realFs.stat(path.join(outside, 'plain.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('a paired save through ManagedPair lands entirely in the phext', async () => {
  const { root } = await fixture();
  const native = await realFs.readFile('artifacts/flint-b1.2/rich.mutable.json', 'utf8');
  const resource = decodeNative(new TextEncoder().encode(native));
  const projection = exportMarkdown(resource);
  const pair = new ManagedPair({ root, resourceId: resource.resourceId, nativeName: 'paper.mutable.json', markdownName: 'paper.md' });
  const generation = { resourceId: resource.resourceId, generation: crypto.randomUUID(), native, markdown: projection.text, profile: projection.profile, targets: [] };
  expect(await pair.save(generation)).toMatchObject({ phase: 'saved' });
  expect(hash(await fs.readFile(pair.file('native')))).toBe(hash(native));
  expect((await pair.receipt()).generation).toBe(generation.generation);
  expect(await pair.pending()).toBeUndefined();
  // Nothing document-shaped exists on the real disk.
  const disk = await realFs.readdir(root);
  expect(disk.some(name => name.endsWith('.mutable.json') || name.endsWith('.md') || name.startsWith('.mutable-pair-'))).toBe(false);
  expect(disk).toContain('cavern.phext');
  // Recover with no pending generation replays the receipt.
  expect(await pair.recover()).toMatchObject({ phase: 'saved', generation: generation.generation });
});
