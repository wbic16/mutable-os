/**
 * phext-fs: the node:fs/promises subset the native document stores
 * actually use, implemented over PhextVFS (PhextVFS Phase 3a).
 *
 * NativeVaultStore (server/native-vault-store.mjs), ManagedPair
 * (src/persistence/managed-pair.mjs) and the native document router
 * (server/native-document-store.mjs, vault-listing-cache.mjs,
 * collection-inventory.mjs, recognized-source.mjs) import their
 * `promises as fs` from here instead of node:fs. The facade dispatches
 * per path: a path under a registered Cavern root is served by the
 * Cavern's PhextVFS; everything else — including every path when
 * nothing is registered (the `phextVfs` flag off, the default) — falls
 * through to the real node:fs call, so flag-off behavior is
 * byte-for-byte the current disk behavior.
 *
 * Registration mirrors Phase 2: cavern-lifecycle registers the Cavern's
 * VFS when the flag is on (registerPhextFs), next to the gates backend
 * registration, and unregisters on close (which flushes). The registry
 * itself lives on globalThis under a Symbol.for key: the native stores
 * reach production inside the esbuild bundle of
 * dist/server/native-document-store.mjs while the lifecycle loads this
 * source file by URL (the house pattern for shared .mjs modules), and
 * the two module instances must still see ONE registry.
 *
 * ## Dispatch (Cavern-relative)
 *
 * The registration root itself is a real directory and always resolves
 * to real fs (except readdir/opendir of the root, which list the
 * virtual root — that is where the documents live — and read-only
 * opens of the root, whose sync() is the VFS flush). Below the root:
 *
 * - `.mutable/**` stays on real disk in this phase: the knowledge
 *   SQLite home, its establishment files and the listing cache are
 *   Phase 4 / establishment-owned. (Phase 3b carves out exactly two
 *   exceptions, below.)
 * - Phase 3b: `.mutable/document-saves/**` — the recognized-document
 *   journal, a legacy JSON store — is virtual, as is `.mutable`
 *   itself (the VFS home directory that merges strata 3/5/6), so the
 *   store's resolve() lstat-walk can enter it. The journal lands in
 *   the `.mutable` stratum at its natural path (the VFS dispatches
 *   by path; stratum 3's root *is* `.mutable`). No other `.mutable`
 *   path crosses: knowledge is phext-native since Phase 4 and never
 *   travels through this facade, and the discovery cache is retired
 *   in phext mode (vault-listing-cache.mjs), so its file is neither
 *   read nor written here.
 * - `cavern.phext`, `cavern.phext.bak` and `cavern.phext.anchor-*`
 *   are real files by construction.
 * - Everything else is virtual: the document tree (stratum 1),
 *   `.mutable-pair-*` journals (2), `.memory` (4), and
 *   `.mutable-relocations` / `.mutable-store.lock` (7 / 1) — the VFS
 *   dispatches by path as designed in Phase 1. The VFS-internal
 *   `/.control` registry directory is hidden from root listings.
 *
 * ## Locks stay real
 *
 * Both stores lock by flocking an fd from `fs.open` of a lock file
 * (`.mutable-store.lock`, pair `writer.lock`) through nativeFlock.
 * In phext mode those paths are virtual, so `open` of any `*.lock`
 * path returns a handle whose `fd` is a REAL fd on the Phase 2 anchor
 * for that VFS path — the shared mechanism exported from
 * scripts/stage-c-gates/phext-backend.mjs (createFlockAnchorRegistry),
 * not a copy. The stores' flock calls, and their contention error
 * contracts ("Another managed operation is active; retry", "Another
 * cooperating writer holds the resource lock"), are untouched and
 * byte-identical. The virtual lock file itself exists in the VFS
 * (empty), so stats and signatures see it exactly as on disk.
 *
 * ## Identity and stamps
 *
 * The disk stores compare {dev, ino, size, mtimeNs, ctimeNs} stamps
 * and dev/ino signatures to detect change. The VFS has no inodes, so
 * each virtual path owns a random identity token plus a mutation
 * version, persisted in the L7 control stratum at
 * `/.control/fs-nodes.json` (the fs sibling of the gates backend's
 * gates-identities.json): tokens are stable for the life of the node,
 * are carried across renames (a rename rewrites the registry key
 * prefix), are shared by a hard link's two names, and are dropped on
 * unlink. mtimeNs/ctimeNs are derived deterministically from the
 * node's content hash (the index entry's SHA-256 for files, the child
 * listing for directories) mixed with its version: unchanged content
 * stamps identically across calls and restarts, any mutation —
 * including a rewrite with identical bytes — changes the stamp.
 * Directory versions bump on any mutation beneath them, so a scope
 * fence taken over a tree expires when anything in it changes, as the
 * disk fence does. There are no symlinks in a VFS: isSymbolicLink()
 * is always false, and root confinement is structural (VFS paths are
 * Cavern-relative and reject traversal).
 *
 * ## Durability
 *
 * A handle `sync()` (and directory sync, the fsync-dir equivalent) is
 * a PhextVFS flush: the phext is rewritten atomically with the
 * previous generation kept at cavern.phext.bak — the same commit
 * points the stores already treat as commits (durableWrite, the
 * publish protocol, lock close). Rename is POSIX at this layer
 * (replace a file destination, as ManagedPair's receipt publish
 * requires); NativeVaultStore.move uses the backend's exclusive
 * rename, which maps to PhextVFS.rename (RENAME_NOREPLACE semantics,
 * chunk scrolls copied verbatim) instead of the native-path-move
 * helper binary.
 *
 * ## Block-boundary chunking
 *
 * Writes of native document files (.ink / .phosphor /
 * .mutable.json) slice the serialized envelope at block boundaries:
 * sliceNativeEnvelope scans the raw bytes (never re-serializes) for
 * the `document.blocks` array and returns the exact partition —
 * envelope-before-blocks, one slice per block element, remainder —
 * which writeVirtual passes to PhextVFS.writeFile's `slices` option.
 * Reads reassemble by concatenation, so receipt hashes see
 * byte-identical files. Any envelope shape the scanner cannot prove
 * (escapes in keys, no blocks array, malformed JSON) falls back to
 * opaque Phase 1 chunking for that file. Non-native files always
 * chunk opaquely.
 */
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, promises as realFs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isNativeDocumentName } from '../src/persistence/document-file-names.mjs';

const NODES_PATH = '/.control/fs-nodes.json';
const REGISTRY_KEY = Symbol.for('mutable.phext-fs.registry.v1');
const BREAK_BYTES = new Set([0x01, 0x17, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x1f]);

const coded = (code, message) => Object.assign(new Error(message), { code });
const sha256Hex = data => createHash('sha256').update(data).digest('hex');

/** Mirrors PhextVFS's text rule: valid UTF-8 and no dimension break bytes. */
function isTextSafe(bytes) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return false; }
  for (const byte of bytes) if (BREAK_BYTES.has(byte)) return false;
  return true;
}

// ---------------------------------------------------------- block slicing

const isWsByte = b => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;

/**
 * Find the [start, end) byte spans of the elements of the top-level
 * document's `blocks` array in a serialized native envelope, by
 * scanning raw JSON bytes (strings and escapes honored; nothing is
 * re-serialized). Returns undefined when the shape cannot be proven —
 * the caller then chunks opaquely.
 */
function scanEnvelopeBlocks(bytes) {
  const n = bytes.length;
  let pos = 0;
  const fail = () => { throw new Error('unrecognized envelope shape'); };
  const skipWs = () => { while (pos < n && isWsByte(bytes[pos])) pos++; };
  function scanString() {
    if (bytes[pos] !== 0x22) fail();
    pos++;
    const start = pos;
    let escaped = false;
    while (pos < n) {
      const b = bytes[pos];
      if (escaped) { escaped = false; pos++; continue; }
      if (b === 0x5c) { escaped = true; pos++; continue; }
      if (b === 0x22) { const inner = bytes.subarray(start, pos); pos++; return inner; }
      pos++;
    }
    fail();
  }
  function scanValue() {
    skipWs();
    if (pos >= n) fail();
    const b = bytes[pos];
    if (b === 0x7b) {
      pos++; skipWs();
      if (bytes[pos] === 0x7d) { pos++; return; }
      for (;;) {
        skipWs(); scanString(); skipWs();
        if (bytes[pos] !== 0x3a) fail();
        pos++; scanValue(); skipWs();
        if (bytes[pos] === 0x2c) { pos++; continue; }
        if (bytes[pos] === 0x7d) { pos++; return; }
        fail();
      }
    }
    if (b === 0x5b) {
      pos++; skipWs();
      if (bytes[pos] === 0x5d) { pos++; return; }
      for (;;) {
        scanValue(); skipWs();
        if (bytes[pos] === 0x2c) { pos++; continue; }
        if (bytes[pos] === 0x5d) { pos++; return; }
        fail();
      }
    }
    if (b === 0x22) { scanString(); return; }
    while (pos < n && !isWsByte(bytes[pos]) && bytes[pos] !== 0x2c && bytes[pos] !== 0x5d && bytes[pos] !== 0x7d) pos++;
    if (pos >= n) fail();
  }
  function scanObject(wanted) {
    // At (or just before, modulo whitespace) the '{' of an object;
    // scan members, delegating the member named by each wanted key
    // to its scanner. Returns their results.
    const found = {};
    skipWs();
    if (bytes[pos] !== 0x7b) fail();
    pos++; skipWs();
    if (bytes[pos] === 0x7d) { pos++; return found; }
    for (;;) {
      skipWs();
      const key = scanString().toString('utf8');
      skipWs();
      if (bytes[pos] !== 0x3a) fail();
      pos++;
      if (wanted[key]) found[key] = wanted[key]();
      else scanValue();
      skipWs();
      if (bytes[pos] === 0x2c) { pos++; continue; }
      if (bytes[pos] === 0x7d) { pos++; return found; }
      fail();
    }
  }
  function scanBlocksArray() {
    skipWs();
    if (bytes[pos] !== 0x5b) fail();
    pos++; skipWs();
    const spans = [];
    if (bytes[pos] === 0x5d) { pos++; return spans; }
    for (;;) {
      skipWs();
      const start = pos;
      scanValue();
      spans.push([start, pos]);
      skipWs();
      if (bytes[pos] === 0x2c) { pos++; continue; }
      if (bytes[pos] === 0x5d) { pos++; return spans; }
      fail();
    }
  }
  skipWs();
  if (bytes[pos] !== 0x7b) return undefined;
  const top = scanObject({
    document: () => scanObject({ blocks: scanBlocksArray }).blocks,
  });
  return top.document;
}

/**
 * Partition a serialized native envelope into raw slices at block
 * boundaries: everything before the first block element, one slice
 * per block element, and the remainder. The slices concatenate to
 * exactly the input bytes. Returns undefined when the envelope shape
 * cannot be proven (no document.blocks array, or an empty one).
 */
export function sliceNativeEnvelope(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (bytes.length === 0) return undefined;
  let spans;
  try { spans = scanEnvelopeBlocks(bytes); } catch { return undefined; }
  if (!spans || spans.length === 0) return undefined;
  const slices = [];
  let cursor = 0;
  for (const [start, end] of spans) {
    slices.push(bytes.subarray(cursor, start), bytes.subarray(start, end));
    cursor = end;
  }
  slices.push(bytes.subarray(cursor));
  const kept = slices.filter(slice => slice.length > 0);
  if (!Buffer.concat(kept.map(slice => Buffer.from(slice))).equals(bytes)) return undefined;
  return kept;
}

// ------------------------------------------------------------- registry

function registry() {
  let map = globalThis[REGISTRY_KEY];
  if (!map) {
    map = new Map();
    Object.defineProperty(globalThis, REGISTRY_KEY, { value: map, enumerable: false });
  }
  return map;
}

/** Register a Cavern's PhextVFS for the native document stores. */
export function registerPhextFs({ root, vfs, anchors } = {}) {
  if (!root || !vfs) throw new Error('registerPhextFs requires { root, vfs }');
  const backend = new PhextFsBackend(path.resolve(root), vfs, anchors);
  registry().set(backend.root, backend);
  return backend;
}

/** Flush and drop a Cavern's registration. Returns false when absent. */
export function unregisterPhextFs(root) {
  const key = path.resolve(root);
  const backend = registry().get(key);
  if (!backend) return false;
  try { backend.flush(); } finally { registry().delete(key); }
  return true;
}

/** The registered backend covering an absolute path, if any. */
export function phextFsBackendFor(absPath) {
  const resolved = path.resolve(absPath);
  let best;
  for (const backend of registry().values()) {
    if (resolved === backend.root || resolved.startsWith(backend.root + path.sep)) {
      if (!best || backend.root.length > best.root.length) best = backend;
    }
  }
  return best;
}

// ---------------------------------------------------------------- flags

function parseFlags(flags) {
  if (typeof flags === 'string') {
    switch (flags) {
      case 'r': return { read: true };
      case 'r+': return { read: true, write: true };
      case 'w': return { write: true, create: true, truncate: true };
      case 'wx': return { write: true, create: true, truncate: true, excl: true };
      case 'w+': return { read: true, write: true, create: true, truncate: true };
      case 'wx+': return { read: true, write: true, create: true, truncate: true, excl: true };
      case 'a': return { write: true, create: true, append: true };
      case 'ax': return { write: true, create: true, append: true, excl: true };
      case 'a+': return { read: true, write: true, create: true, append: true };
      case 'ax+': return { read: true, write: true, create: true, append: true, excl: true };
      default: throw coded('EINVAL', `Invalid open flag: ${flags}`);
    }
  }
  const f = Number(flags ?? 0);
  const access = f & (constants.O_ACCMODE ?? 3);
  return {
    read: access === constants.O_RDONLY || access === constants.O_RDWR,
    write: access === constants.O_WRONLY || access === constants.O_RDWR,
    create: !!(f & constants.O_CREAT),
    excl: !!(f & constants.O_EXCL),
    truncate: !!(f & constants.O_TRUNC),
    append: !!(f & constants.O_APPEND),
  };
}

const dirent = (name, type) => ({
  name,
  isFile: () => type === 'file',
  isDirectory: () => type === 'directory',
  isSymbolicLink: () => false,
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isFIFO: () => false,
  isSocket: () => false,
});

// -------------------------------------------------------------- backend

class PhextFsBackend {
  constructor(root, vfs, anchors) {
    this.root = root;
    this.vfs = vfs;
    this.devNumber = Number.parseInt(sha256Hex(Buffer.from(`phext-fs-dev:${vfs.path}`)).slice(0, 8), 16);
    this.anchors = anchors ?? null;
    this.anchorRegistryPromise = null;
    this.nodes = null; // Map<vfsPath, {token, version}> once loaded
    this.nodesDirty = false;
    this.handleSequence = 0;
  }

  /**
   * The Cavern-relative VFS path for an absolute path, or undefined
   * when the path stays on real disk (see the dispatch rules above).
   */
  vfsPathFor(absPath) {
    const rel = path.relative(this.root, path.resolve(absPath));
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
    const parts = rel.split(path.sep);
    const first = parts[0];
    if (first === '.mutable') {
      // Phase 3b: only the .mutable home itself (a directory in the
      // VFS) and the recognized-document journal beneath it cross
      // into the phext. Every other .mutable path stays on disk —
      // knowledge is phext-native (Phase 4), never fs-backed.
      if (parts.length === 1 || parts[1] === 'document-saves') return '/' + parts.join('/');
      return undefined;
    }
    if (first.startsWith('cavern.phext')) return undefined;
    return '/' + rel.split(path.sep).join('/');
  }

  // ------------------------------------------------ node registry (L7)

  loadNodes() {
    if (this.nodes) return this.nodes;
    this.nodes = new Map();
    try {
      const parsed = JSON.parse(this.vfs.readTextFile(NODES_PATH));
      if (parsed && parsed.v === 1 && parsed.entries && typeof parsed.entries === 'object') {
        for (const [key, value] of Object.entries(parsed.entries)) {
          if (value && typeof value.token === 'string' && Number.isSafeInteger(value.version)) {
            this.nodes.set(key, { token: value.token, version: value.version });
          }
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    return this.nodes;
  }

  saveNodes() {
    if (!this.nodes || !this.nodesDirty) return;
    this.vfs.writeFile(NODES_PATH, JSON.stringify({ v: 1, entries: Object.fromEntries(this.nodes) }));
    this.nodesDirty = false;
  }

  nodeFor(vfsPath, assign = true) {
    const map = this.loadNodes();
    let node = map.get(vfsPath);
    if (!node && assign) {
      node = { token: randomBytes(16).toString('hex'), version: 1 };
      map.set(vfsPath, node);
      this.nodesDirty = true;
    }
    return node;
  }

  /** Bump a node's version (and every ancestor directory's). */
  touch(vfsPath, self = true) {
    const map = this.loadNodes();
    const targets = new Set();
    if (self) targets.add(vfsPath);
    const parts = vfsPath.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) targets.add('/' + parts.slice(0, i).join('/'));
    if (parts.length > 0) targets.add('/');
    for (const target of targets) {
      const node = map.get(target);
      if (node) node.version++;
      else map.set(target, { token: randomBytes(16).toString('hex'), version: 1 });
    }
    this.nodesDirty = true;
  }

  dropNode(vfsPath) {
    if (this.loadNodes().delete(vfsPath)) this.nodesDirty = true;
  }

  /** Carry identity across a rename: rewrite the registry key prefix. */
  moveNodeKeys(from, to) {
    const map = this.loadNodes();
    for (const key of [...map.keys()]) {
      if (key === from || key.startsWith(from + '/')) {
        const node = map.get(key);
        map.delete(key);
        map.set(to + key.slice(from.length), node);
        this.nodesDirty = true;
      }
    }
  }

  // ------------------------------------------------------------ anchors

  async anchorFdFor(vfsPath) {
    if (!this.anchors) {
      this.anchorRegistryPromise ??= import(pathToFileURL(path.resolve('scripts/stage-c-gates/phext-backend.mjs')).href)
        .then(module => { this.anchors = module.createFlockAnchorRegistry(this.vfs); return this.anchors; });
      await this.anchorRegistryPromise;
    }
    return this.anchors.openAnchorFd(vfsPath);
  }

  // -------------------------------------------------------------- stats

  statFor(vfsPath, options) {
    const stat = this.vfs.stat(vfsPath);
    if (!stat) throw coded('ENOENT', `ENOENT: no such file or directory, lstat '${vfsPath}'`);
    // The `.mutable` home is a synthetic merged directory (strata
    // 3/5/6 roots): it gets a deterministic identity derived from
    // the phext path, never a registry assignment. Assigning here
    // would dirty the node registry on a pure read, and the next
    // flush would rewrite the phext inside a discovery fence —
    // operations() stats this directory from inside fence windows.
    let node;
    if (vfsPath === '/.mutable') {
      node = this.loadNodes().get(vfsPath) ?? {
        token: sha256Hex(Buffer.from(`phext-fs-mutable-home:${this.vfs.path}`)),
        version: 1,
      };
    } else {
      node = this.nodeFor(vfsPath);
    }
    const contentKey = stat.type === 'file'
      ? stat.sha256
      : sha256Hex(Buffer.from(JSON.stringify(this.vfs.listDir(vfsPath).map(e => [e.name, e.type]))));
    const ns = BigInt('0x' + sha256Hex(Buffer.from(`${contentKey}:${node.version}`)).slice(0, 15));
    const bigint = !!options?.bigint;
    const num = value => (bigint ? value : Number(value));
    const ms = Number(ns / 1000000n);
    return {
      dev: num(BigInt(this.devNumber)),
      ino: num(BigInt('0x' + node.token)),
      mode: stat.type === 'file' ? 0o100600 : 0o40700,
      nlink: 1,
      uid: 0,
      gid: 0,
      rdev: 0,
      size: num(BigInt(stat.type === 'file' ? stat.size : 0)),
      blksize: 4096,
      blocks: 0,
      atimeMs: ms,
      mtimeMs: ms,
      ctimeMs: ms,
      birthtimeMs: ms,
      atime: new Date(ms),
      mtime: new Date(ms),
      ctime: new Date(ms),
      birthtime: new Date(ms),
      atimeNs: ns,
      mtimeNs: ns,
      ctimeNs: ns,
      birthtimeNs: ns,
      isFile: () => stat.type === 'file',
      isDirectory: () => stat.type === 'directory',
      isSymbolicLink: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    };
  }

  // ------------------------------------------------------------- writes

  /** Write a whole virtual file (block-sliced when a native document). */
  writeVirtual(vfsPath, bytes) {
    const name = vfsPath.slice(vfsPath.lastIndexOf('/') + 1);
    const slices = isNativeDocumentName(name) ? sliceNativeEnvelope(bytes) : undefined;
    if (slices) this.vfs.writeFile(vfsPath, bytes, { format: 'text', slices });
    else this.vfs.writeFile(vfsPath, bytes, { format: isTextSafe(bytes) ? 'text' : 'binary' });
    this.nodeFor(vfsPath);
    this.touch(vfsPath);
  }

  /** Persist the node registry and the phext (the durable-write point). */
  flush() {
    this.saveNodes();
    this.vfs.flush();
  }

  // --------------------------------------------------------------- open

  async open(absPath, flags = 'r') {
    let vfsPath = this.vfsPathFor(absPath);
    const f = parseFlags(flags);
    if (vfsPath === undefined) {
      // A read-only open of the registered root itself: the directory
      // whose sync() must flush the VFS (NativeVaultStore.sync('.')).
      if (path.resolve(absPath) === this.root && !f.write) vfsPath = '/';
      else return realFs.open(absPath, flags);
    }
    const stat = this.vfs.stat(vfsPath);
    if (vfsPath.endsWith('.lock')) {
      if (stat && stat.type !== 'file') throw coded('EISDIR', `EISDIR: illegal operation on a directory, open '${absPath}'`);
      if (!stat && !f.create) throw coded('ENOENT', `ENOENT: no such file or directory, open '${absPath}'`);
      if (stat && f.create && f.excl) throw coded('EEXIST', `EEXIST: file already exists, open '${absPath}'`);
      if (!stat) this.writeVirtual(vfsPath, Buffer.alloc(0));
      const fd = await this.anchorFdFor(vfsPath);
      return new PhextFileHandle(this, vfsPath, { anchorFd: fd });
    }
    if (!stat) {
      if (!f.create) throw coded('ENOENT', `ENOENT: no such file or directory, open '${absPath}'`);
      this.writeVirtual(vfsPath, Buffer.alloc(0));
      return new PhextFileHandle(this, vfsPath, { append: !!f.append });
    }
    if (stat.type === 'directory') {
      if (f.write) throw coded('EISDIR', `EISDIR: illegal operation on a directory, open '${absPath}'`);
      return new PhextFileHandle(this, vfsPath, { directory: true });
    }
    if (f.create && f.excl) throw coded('EEXIST', `EEXIST: file already exists, open '${absPath}'`);
    if (f.truncate) this.writeVirtual(vfsPath, Buffer.alloc(0));
    return new PhextFileHandle(this, vfsPath, { append: !!f.append });
  }

  // --------------------------------------------------------- operations

  readFile(vfsPath, options) {
    const stat = this.vfs.stat(vfsPath);
    if (!stat) throw coded('ENOENT', `ENOENT: no such file or directory, open '${vfsPath}'`);
    if (stat.type === 'directory') throw coded('EISDIR', `EISDIR: illegal operation on a directory, read`);
    const bytes = this.vfs.readFile(vfsPath);
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? bytes.toString(encoding) : bytes;
  }

  writeFile(vfsPath, data, options) {
    const flag = typeof options === 'string' ? options : (options?.flag ?? 'w');
    const f = parseFlags(flag === 'w' || flag === 'a' || flag === 'wx' || flag === 'ax' ? flag : 'w');
    const stat = this.vfs.stat(vfsPath);
    if (stat?.type === 'directory') throw coded('EISDIR', `EISDIR: illegal operation on a directory, open '${vfsPath}'`);
    if (f.excl && stat) throw coded('EEXIST', `EEXIST: file already exists, open '${vfsPath}'`);
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (f.append && stat) this.writeVirtual(vfsPath, Buffer.concat([this.vfs.readFile(vfsPath), bytes]));
    else this.writeVirtual(vfsPath, bytes);
  }

  mkdir(vfsPath, options) {
    const recursive = !!options?.recursive;
    const existing = this.vfs.stat(vfsPath);
    if (existing) {
      if (recursive && existing.type === 'directory') return;
      throw coded('EEXIST', `EEXIST: file already exists, mkdir '${vfsPath}'`);
    }
    if (!recursive) {
      const parent = vfsPath.slice(0, vfsPath.lastIndexOf('/')) || '/';
      const parentStat = this.vfs.stat(parent);
      if (!parentStat) throw coded('ENOENT', `ENOENT: no such file or directory, mkdir '${vfsPath}'`);
      if (parentStat.type !== 'directory') throw coded('ENOTDIR', `ENOTDIR: not a directory, mkdir '${vfsPath}'`);
    }
    this.vfs.mkdir(vfsPath);
    this.nodeFor(vfsPath);
    this.touch(vfsPath);
  }

  readdir(vfsPath, options) {
    const stat = this.vfs.stat(vfsPath);
    if (!stat) throw coded('ENOENT', `ENOENT: no such file or directory, scandir '${vfsPath}'`);
    if (stat.type !== 'directory') throw coded('ENOTDIR', `ENOTDIR: not a directory, scandir '${vfsPath}'`);
    let entries = this.vfs.listDir(vfsPath);
    // The L7 registry home is VFS plumbing, not a document folder.
    if (vfsPath === '/') entries = entries.filter(entry => entry.name !== '.control');
    if (!options?.withFileTypes) return entries.map(entry => entry.name);
    return entries.map(entry => dirent(entry.name, entry.type));
  }

  async opendir(vfsPath) {
    const entries = this.readdir(vfsPath, { withFileTypes: true });
    let index = 0;
    let closed = false;
    return {
      read: async () => (closed || index >= entries.length ? null : entries[index++]),
      close: async () => { closed = true; },
      [Symbol.asyncIterator]: async function* () { while (!closed && index < entries.length) yield entries[index++]; },
    };
  }

  rename(absFrom, absTo) {
    const from = this.vfsPathFor(absFrom);
    const to = this.vfsPathFor(absTo);
    const source = this.vfs.stat(from);
    if (!source) throw coded('ENOENT', `ENOENT: no such file or directory, rename '${absFrom}'`);
    const dest = this.vfs.stat(to);
    if (dest) {
      // POSIX replace semantics (ManagedPair's receipt publish renames
      // over the previous receipt); the exclusive primitive is below.
      if (source.type === 'file' && dest.type === 'file') { this.vfs.unlink(to); this.dropNode(to); }
      else if (source.type === 'directory' && dest.type === 'directory') {
        if (this.vfs.listDir(to).length > 0) throw coded('ENOTEMPTY', `ENOTEMPTY: directory not empty, rename '${absTo}'`);
        this.vfs.unlink(to); this.dropNode(to);
      } else if (dest.type === 'directory') throw coded('EISDIR', `EISDIR: illegal operation on a directory, rename '${absTo}'`);
      else throw coded('ENOTDIR', `ENOTDIR: not a directory, rename '${absTo}'`);
    }
    this.vfs.rename(from, to);
    this.moveNodeKeys(from, to);
    // The moved node itself is unchanged (identity and version carry,
    // so its stamp survives the rename as on disk); only the two
    // parent chains observe a mutation.
    this.touch(to, false);
    this.touch(from, false);
  }

  /** The relocation primitive: exclusive rename, no replacement. */
  renameExclusive(absFrom, absTo) {
    const from = this.vfsPathFor(absFrom);
    const to = this.vfsPathFor(absTo);
    if (from === undefined || to === undefined) throw coded('EXDEV', 'Exclusive relocation crosses the phext boundary');
    this.vfs.rename(from, to);
    this.moveNodeKeys(from, to);
    this.touch(to, false);
    this.touch(from, false);
  }

  link(absFrom, absTo) {
    const from = this.vfsPathFor(absFrom);
    const to = this.vfsPathFor(absTo);
    const source = this.vfs.stat(from);
    if (!source) throw coded('ENOENT', `ENOENT: no such file or directory, link '${absFrom}'`);
    if (source.type !== 'file') throw coded('EPERM', `EPERM: operation not permitted, link '${absFrom}'`);
    if (this.vfs.stat(to)) throw coded('EEXIST', `EEXIST: file already exists, link '${absTo}'`);
    // A hard link shares the inode: copy the bytes and the identity.
    this.writeVirtual(to, this.vfs.readFile(from));
    const sourceNode = this.nodeFor(from);
    const destNode = this.nodeFor(to);
    destNode.token = sourceNode.token;
    destNode.version = sourceNode.version;
    this.nodesDirty = true;
  }

  unlink(vfsPath) {
    const stat = this.vfs.stat(vfsPath);
    if (!stat) throw coded('ENOENT', `ENOENT: no such file or directory, unlink '${vfsPath}'`);
    if (stat.type === 'directory') throw coded('EISDIR', `EISDIR: illegal operation on a directory, unlink '${vfsPath}'`);
    this.vfs.unlink(vfsPath);
    this.dropNode(vfsPath);
    this.touch(vfsPath, false);
  }

  realpath(absPath, vfsPath) {
    if (!this.vfs.stat(vfsPath)) throw coded('ENOENT', `ENOENT: no such file or directory, realpath '${absPath}'`);
    return absPath;
  }
}

// --------------------------------------------------------------- handle

class PhextFileHandle {
  constructor(backend, vfsPath, { anchorFd, directory = false, append = false } = {}) {
    this.backend = backend;
    this.vfsPath = vfsPath;
    this.anchorFd = anchorFd;
    // Lock handles expose the REAL anchor fd (the stores flock it);
    // other handles get a synthetic negative fd no real call can use.
    this.fd = anchorFd !== undefined ? anchorFd : -(++backend.handleSequence) - 2;
    this.directory = directory;
    this.append = append;
    this.closed = false;
  }

  async readFile() {
    if (this.directory) throw coded('EISDIR', 'EISDIR: illegal operation on a directory, read');
    return this.backend.vfs.readFile(this.vfsPath);
  }

  async writeFile(data) {
    if (this.directory) throw coded('EISDIR', 'EISDIR: illegal operation on a directory, write');
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (this.append) {
      const current = this.backend.vfs.readFile(this.vfsPath);
      this.backend.writeVirtual(this.vfsPath, Buffer.concat([current, bytes]));
    } else this.backend.writeVirtual(this.vfsPath, bytes);
  }

  /** Positional read, as recognized-source's identity probe uses. */
  async read(buffer, offset = 0, length, position = 0) {
    if (this.directory) throw coded('EISDIR', 'EISDIR: illegal operation on a directory, read');
    const content = this.backend.vfs.readFile(this.vfsPath);
    const wanted = length ?? (buffer.length - offset);
    const slice = content.subarray(position ?? 0, (position ?? 0) + wanted);
    slice.copy(buffer, offset);
    return { bytesRead: slice.length, buffer };
  }

  async stat(options) { return this.backend.statFor(this.vfsPath, options); }

  /** The durable-write point: flush the phext (see the header). */
  async sync() { this.backend.flush(); }
  async datasync() { this.backend.flush(); }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.anchorFd !== undefined) {
      // Mirror the gates backend's lock close: flush before the fd —
      // and with it any flock the caller still holds — goes away.
      try { this.backend.flush(); } finally { closeSync(this.anchorFd); }
    }
  }
}

// --------------------------------------------------------------- facade

/** node:fs constants, re-exported for facade consumers (Phase 3b). */
export { constants };

function dispatch(absPath) {
  const backend = phextFsBackendFor(absPath);
  if (!backend) return undefined;
  const vfsPath = backend.vfsPathFor(absPath);
  return vfsPath === undefined ? undefined : { backend, vfsPath };
}

/** readdir/opendir dispatch: the registered root lists the virtual root. */
function dispatchListing(absPath) {
  const backend = phextFsBackendFor(absPath);
  if (!backend) return undefined;
  if (path.resolve(absPath) === backend.root) return { backend, vfsPath: '/' };
  const vfsPath = backend.vfsPathFor(absPath);
  return vfsPath === undefined ? undefined : { backend, vfsPath };
}

export const promises = {
  async open(absPath, flags, mode) {
    const backend = phextFsBackendFor(absPath);
    if (backend && (backend.vfsPathFor(absPath) !== undefined || path.resolve(absPath) === backend.root)) {
      return backend.open(absPath, flags);
    }
    return realFs.open(absPath, flags, mode);
  },
  async readFile(absPath, options) {
    const hit = dispatch(absPath);
    return hit ? hit.backend.readFile(hit.vfsPath, options) : realFs.readFile(absPath, options);
  },
  async writeFile(absPath, data, options) {
    const hit = dispatch(absPath);
    return hit ? hit.backend.writeFile(hit.vfsPath, data, options) : realFs.writeFile(absPath, data, options);
  },
  async mkdir(absPath, options) {
    const hit = dispatch(absPath);
    return hit ? hit.backend.mkdir(hit.vfsPath, options) : realFs.mkdir(absPath, options);
  },
  async readdir(absPath, options) {
    const hit = dispatchListing(absPath);
    return hit ? hit.backend.readdir(hit.vfsPath, options) : realFs.readdir(absPath, options);
  },
  async opendir(absPath) {
    const hit = dispatchListing(absPath);
    return hit ? hit.backend.opendir(hit.vfsPath) : realFs.opendir(absPath);
  },
  async lstat(absPath, options) {
    const hit = dispatch(absPath);
    return hit ? hit.backend.statFor(hit.vfsPath, options) : realFs.lstat(absPath, options);
  },
  async stat(absPath, options) {
    const hit = dispatch(absPath);
    return hit ? hit.backend.statFor(hit.vfsPath, options) : realFs.stat(absPath, options);
  },
  async rename(absFrom, absTo) {
    const backend = phextFsBackendFor(absFrom);
    if (backend && backend.vfsPathFor(absFrom) !== undefined && backend.vfsPathFor(absTo) !== undefined) {
      return backend.rename(absFrom, absTo);
    }
    return realFs.rename(absFrom, absTo);
  },
  async link(absFrom, absTo) {
    const backend = phextFsBackendFor(absFrom);
    if (backend && backend.vfsPathFor(absFrom) !== undefined && backend.vfsPathFor(absTo) !== undefined) {
      return backend.link(absFrom, absTo);
    }
    return realFs.link(absFrom, absTo);
  },
  async unlink(absPath) {
    const hit = dispatch(absPath);
    return hit ? hit.backend.unlink(hit.vfsPath) : realFs.unlink(absPath);
  },
  async realpath(absPath, options) {
    const hit = dispatch(absPath);
    return hit ? hit.backend.realpath(absPath, hit.vfsPath) : realFs.realpath(absPath, options);
  },
};
