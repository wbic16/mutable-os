/**
 * Phext-backed stage-C gates filesystem (PhextVFS Phase 2).
 *
 * A second backend for the gates API in ./filesystem.mjs — pinDirectory,
 * atDirectory, createDirectory, lockFile — with identical call shapes and
 * error contract, but with the directory tree living inside one PhextVFS
 * file (src/phext/vfs.ts) instead of on disk: `<cavern>/cavern.phext`.
 * filesystem.mjs dispatches to this backend only for directories under a
 * Cavern root that cavern-lifecycle registered (feature flag
 * `phextVfs`, default off), and only for the gates-owned trees:
 *
 * - any path whose Cavern-relative first component is `.mutable`
 *   (jobs, publications, assets, and the knowledge home's gates view), or
 * - any path at or below a `.memory` component (history memoirs, which
 *   live beside documents at `<folder>/.memory/...`).
 *
 * Everything else under the Cavern — document folders and the documents
 * themselves included — stays on the disk backend in Phase 2; the
 * NativeVaultStore and SQLite knowledge phases are separate. A stat or
 * createDirectory of a tree-starting component (`.mutable`, `.memory`)
 * issued against a disk pin is answered here, so a consumer descending
 * component-by-component crosses from the disk tree into the phext at
 * exactly the boundary where the disk layout would have branched.
 *
 * ## Identity
 *
 * The disk backend's identities are { dev, ino } of real inodes. Here
 * every VFS path (file or directory) owns a random identity token,
 * assigned when the node is created through this backend (or first
 * observed, for nodes created implicitly by the VFS) and persisted in a
 * registry file inside the phext itself:
 * `/.control/gates-identities.json` (control stratum). The identity is
 * `{ dev: "phext:<phext-id>", ino: <token> }` — the same shape, and it
 * JSON-round-trips, which consumers rely on (the history store persists
 * directory identities in binding.json and compares them across
 * restarts; tokens are stable for the life of the node). Unlinking or
 * removing a node drops its token, so a deleted-and-recreated directory
 * has a new identity and a stale pin fails closed with
 * "directory identity changed", mirroring the worker's dev/ino checks.
 * Publish (the hard-link op) makes the target inherit the source's
 * token, as a hard link shares the inode.
 *
 * ## Locking stays real
 *
 * lockFile takes a REAL flock through ./flock.mjs (fs-ext when present,
 * the portable token fallback otherwise) — but not on the phext: a VFS
 * flush rewrites the phext by rename, so its inode cannot carry a lock.
 * Each virtual lock file gets a stable anchor file beside the phext,
 * `cavern.phext.anchor-<hash of the lock's VFS path>`, created once and
 * never renamed or unlinked — the same discipline as knowledge-sqlite's
 * writer.lock. Anchors are per lock file, not one per Cavern, so
 * distinct locks keep the disk backend's exact contention semantics:
 * locks on different files never exclude each other, and shared /
 * exclusive conflicts on the same file reject with EWOULDBLOCK. (One
 * shared anchor would have made every gates lock in the Cavern exclude
 * every other — e.g. history writers for different documents fencing
 * each other — which the disk backend does not do.) The returned handle
 * mirrors the disk one: { fd, close } where fd is an opaque
 * backend-scoped number (there is no worker session to key) and close()
 * flushes the VFS *before* releasing the flock, so the next acquirer —
 * in this process or another — opens a phext that already contains
 * everything the previous holder published.
 *
 * ## Worker isolation delta
 *
 * The disk backend runs ops in a forked worker that pins its cwd to an
 * inode-verified directory; a swapped ancestor cannot redirect a write,
 * and the worker holding the lock fd keeps OS exclusion alive if the
 * parent dies mid-write. This backend runs ops in-process against the
 * VFS: path confinement is structural (VFS paths are Cavern-relative and
 * the VFS rejects traversal), each op is a synchronous VFS transaction
 * that cannot interleave with another op on the event loop, and process
 * death is covered by the anchor flock's own semantics (native flock
 * dies with the holder's descriptors; the token fallback's tokens are
 * pruned once the holder's pid is dead — see flock.mjs). What replaces
 * the worker's serialization role is the stack the consumers already
 * have: their own lock files, plus the server-wide foreground
 * serializer in cavern-lifecycle.
 *
 * ## Durability / flush policy
 *
 * VFS mutations are overlay changes until PhextVFS.flush() writes the
 * phext (atomically, keeping the previous generation at
 * cavern.phext.bak). The disk backend fsyncs on every mutating op, so
 * its commit point is each op. This backend's commit points are the
 * points consumers already treat as commits:
 *
 * - **publish** ops flush before returning (stage-then-publish is the
 *   commit protocol of every gates consumer);
 * - **lock release** (lockFile's close) flushes before unlocking;
 * - **closeFilesystemWorkers()** and **unregister** flush every
 *   registered backend.
 *
 * Between those points, creates/appends are visible to every reader in
 * the process but not yet durable — history record appends, which are
 * create+publish pairs, land on the publish flush as on disk. One
 * supported topology note: a Cavern phext has one owning server process.
 * The anchor flock still excludes a second process's lock attempts, but
 * a second process opening the phext sees it as of the last flush, not
 * another process's unflushed overlay.
 */
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync } from 'node:fs';
import path from 'node:path';
import { flockDescriptor } from './flock.mjs';

const REGISTRY_PATH = '/.control/gates-identities.json';
const BREAK_BYTES = new Set([0x01, 0x17, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x1f]);

const coded = (code, message) => Object.assign(new Error(message), { code });
const sha256Hex = data => createHash('sha256').update(data).digest('hex');
const fileIdentity = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
const sameIdentity = (a, b) => !!a && !!b && a.dev === b.dev && a.ino === b.ino;
const leaf = name => {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\\0]/.test(name)) throw new Error('invalid leaf');
  return name;
};

/**
 * The per-lock flock anchor mechanism, exported so Phase 3a's phext-fs
 * shim (server/phext-fs.mjs) routes the native stores' virtual lock
 * files (`.mutable-store.lock`, pair `writer.lock`) through the SAME
 * anchors — a lock taken through either layer excludes the other, and
 * every process that opens the same phext. An anchor is a real file
 * beside the phext, `cavern.phext.anchor-<first 16 hex of the SHA-256
 * of the lock's VFS path>`, created once (O_RDWR|O_CREAT, 0600) and
 * never renamed or unlinked: a VFS flush rewrites the phext by rename,
 * so the phext's own inode cannot carry a lock.
 */
export function createFlockAnchorRegistry(vfs) {
  const anchorPathFor = vfsPath => path.join(
    path.dirname(vfs.path),
    `cavern.phext.anchor-${sha256Hex(Buffer.from(vfsPath)).slice(0, 16)}`,
  );
  return {
    anchorPathFor,
    /** Open the lock's real anchor file, creating it if needed. The caller closes the fd. */
    openAnchorFd(vfsPath) { return openSync(anchorPathFor(vfsPath), constants.O_RDWR | constants.O_CREAT, 0o600); },
  };
}

/** Mirrors PhextVFS's text rule: valid UTF-8 and no dimension break bytes. */
function isTextSafe(bytes) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return false; }
  for (const byte of bytes) if (BREAK_BYTES.has(byte)) return false;
  return true;
}

export function createPhextBackend({ root, vfs }) {
  const cavernRoot = path.resolve(root);
  const anchors = createFlockAnchorRegistry(vfs);
  const phextId = sha256Hex(Buffer.from(vfs.path)).slice(0, 12);
  let tokens = null; // Map<vfsPath, token>, loaded lazily from the registry
  let lockSequence = 0;

  const vfsPathFor = realPath => {
    const rel = path.relative(cavernRoot, path.resolve(realPath));
    return rel === '' ? '/' : `/${rel.split(path.sep).join('/')}`;
  };
  const childVfsPath = (parentRealPath, name) => {
    const parent = vfsPathFor(parentRealPath);
    return parent === '/' ? `/${name}` : `${parent}/${name}`;
  };

  // ------------------------------------------------------------ tokens

  function loadTokens() {
    if (tokens) return tokens;
    tokens = new Map();
    try {
      const parsed = JSON.parse(vfs.readTextFile(REGISTRY_PATH));
      if (parsed && parsed.v === 1 && parsed.entries && typeof parsed.entries === 'object') {
        for (const [key, value] of Object.entries(parsed.entries)) {
          if (typeof value === 'string') tokens.set(key, value);
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    return tokens;
  }
  function saveTokens() {
    vfs.writeFile(REGISTRY_PATH, JSON.stringify({ v: 1, entries: Object.fromEntries(loadTokens()) }));
  }
  function tokenFor(vfsPath, assign) {
    const map = loadTokens();
    let token = map.get(vfsPath);
    if (token === undefined && assign) {
      token = randomBytes(16).toString('hex');
      map.set(vfsPath, token);
      saveTokens();
    }
    return token;
  }
  const identityFor = (vfsPath, assign) => {
    const token = tokenFor(vfsPath, assign);
    return token === undefined ? undefined : { dev: `phext:${phextId}`, ino: token };
  };
  function dropToken(vfsPath) {
    if (loadTokens().delete(vfsPath)) saveTokens();
  }

  // ------------------------------------------------------------ helpers

  function statResult(vfsPath, stat) {
    return {
      identity: identityFor(vfsPath, true),
      size: stat.type === 'file' ? stat.size : 0,
      directory: stat.type === 'directory',
      file: stat.type === 'file',
      symlink: false,
    };
  }
  function statOrThrow(vfsPath, realPath) {
    const stat = vfs.stat(vfsPath);
    if (!stat) throw coded('ENOENT', `ENOENT: no such file or directory, lstat '${realPath}'`);
    return stat;
  }
  function verifyDirectoryPin(directory) {
    const vfsPath = vfsPathFor(directory.path);
    const stat = vfs.stat(vfsPath);
    if (!stat || stat.type !== 'directory') throw new Error('directory identity changed');
    if (!sameIdentity(directory.identity, identityFor(vfsPath, false))) {
      throw new Error('directory identity changed');
    }
  }
  function writeVirtual(vfsPath, bytes) {
    vfs.writeFile(vfsPath, bytes, { format: isTextSafe(bytes) ? 'text' : 'binary' });
  }

  const backend = {
    root: cavernRoot,

    /** True when this Cavern-relative path belongs to the gates trees. */
    owns(realPath) {
      const rel = path.relative(cavernRoot, path.resolve(realPath));
      if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
      const components = rel.split(path.sep);
      return components[0] === '.mutable' || components.includes('.memory');
    },

    /** True when a single component starts a gates-owned tree. */
    startsTree(name) {
      return name === '.mutable' || name === '.memory';
    },

    async pinDirectory(realPath) {
      const vfsPath = vfsPathFor(realPath);
      const stat = vfs.stat(vfsPath);
      if (!stat) throw coded('ENOENT', `ENOENT: no such file or directory, open '${realPath}'`);
      if (stat.type !== 'directory') throw coded('ENOTDIR', `ENOTDIR: not a directory, open '${realPath}'`);
      return { path: realPath, identity: identityFor(vfsPath, true) };
    },

    /** stat of a tree-starting component against a disk pin (descent). */
    async statChild(parentRealPath, name) {
      leaf(name);
      const vfsPath = childVfsPath(parentRealPath, name);
      return statResult(vfsPath, statOrThrow(vfsPath, path.join(parentRealPath, name)));
    },

    /** mkdir of a tree-starting component against a disk pin (descent). */
    async mkdirChild(parentRealPath, name) {
      leaf(name);
      const vfsPath = childVfsPath(parentRealPath, name);
      if (vfs.stat(vfsPath)) throw coded('EEXIST', `EEXIST: file already exists, mkdir '${path.join(parentRealPath, name)}'`);
      vfs.mkdir(vfsPath);
      return { path: path.join(parentRealPath, name), identity: identityFor(vfsPath, true) };
    },

    async createDirectory(parent, name) {
      leaf(name);
      if (backend.owns(parent.path)) verifyDirectoryPin(parent);
      const vfsPath = childVfsPath(parent.path, name);
      if (vfs.stat(vfsPath)) throw coded('EEXIST', `EEXIST: file already exists, mkdir '${path.join(parent.path, name)}'`);
      vfs.mkdir(vfsPath);
      return { path: path.join(parent.path, name), identity: identityFor(vfsPath, true) };
    },

    async atDirectory(directory, operation) {
      verifyDirectoryPin(directory);
      const dirVfsPath = vfsPathFor(directory.path);
      const op = operation;
      if (op.kind === 'list') {
        if (!Number.isSafeInteger(op.limit) || op.limit < 1 || op.limit > 100 || !Number.isSafeInteger(op.offset) || op.offset < 0 || op.offset > 10000) throw new Error('directory scan limit');
        const all = vfs.listDir(dirVfsPath).map(entry => ({
          name: entry.name,
          directory: entry.type === 'directory',
          symlink: false,
        }));
        const entries = all.slice(op.offset, op.offset + op.limit);
        const next = op.offset + entries.length < all.length ? op.offset + entries.length : undefined;
        return { entries, next };
      }
      const name = leaf(op.name);
      const vfsPath = dirVfsPath === '/' ? `/${name}` : `${dirVfsPath}/${name}`;
      const realChild = path.join(directory.path, name);
      switch (op.kind) {
        case 'mkdir': {
          if (vfs.stat(vfsPath)) throw coded('EEXIST', `EEXIST: file already exists, mkdir '${realChild}'`);
          vfs.mkdir(vfsPath);
          return { identity: identityFor(vfsPath, true) };
        }
        case 'stat': {
          return statResult(vfsPath, statOrThrow(vfsPath, realChild));
        }
        case 'rmdir': {
          if (!op.expectedIdentity) throw new Error('directory removal requires identity');
          const stat = statOrThrow(vfsPath, realChild);
          if (stat.type !== 'directory') throw coded('ENOTDIR', `ENOTDIR: not a directory, rmdir '${realChild}'`);
          if (!sameIdentity(op.expectedIdentity, identityFor(vfsPath, false))) throw new Error('directory identity changed');
          if (vfs.listDir(vfsPath).length > 0) throw coded('ENOTEMPTY', `ENOTEMPTY: directory not empty, rmdir '${realChild}'`);
          vfs.unlink(vfsPath);
          dropToken(vfsPath);
          return {};
        }
        case 'create': {
          if (!Number.isSafeInteger(op.maxBytes) || op.maxBytes < 0 || Buffer.byteLength(op.data) > op.maxBytes) throw new Error('write byte limit');
          if (vfs.stat(vfsPath)) throw coded('EEXIST', `EEXIST: file already exists, open '${realChild}'`);
          const data = Buffer.from(op.data);
          writeVirtual(vfsPath, data);
          return { identity: identityFor(vfsPath, true), size: data.length, hash: sha256Hex(data) };
        }
        case 'append': {
          if (!Number.isSafeInteger(op.maxBytes) || op.maxBytes < 0 || Buffer.byteLength(op.data) > op.maxBytes) throw new Error('write byte limit');
          const stat = statOrThrow(vfsPath, realChild);
          if (stat.type !== 'file') throw new Error('not a regular file');
          const current = vfs.readFile(vfsPath);
          if (current.length !== op.expectedSize) throw new Error('append head changed');
          const data = Buffer.from(op.data);
          writeVirtual(vfsPath, Buffer.concat([current, data]));
          return { identity: identityFor(vfsPath, true), size: current.length + data.length, hash: sha256Hex(data) };
        }
        case 'read': {
          const stat = statOrThrow(vfsPath, realChild);
          if (stat.type !== 'file') throw new Error('not a regular file');
          const offset = op.offset ?? 0, length = op.length ?? stat.size;
          if (!Number.isSafeInteger(op.maxBytes) || op.maxBytes < 0 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 || length > op.maxBytes || offset + length > stat.size) throw new Error('read byte limit');
          if (op.expectedIdentity && !sameIdentity(op.expectedIdentity, identityFor(vfsPath, false))) throw new Error('file identity changed');
          const data = vfs.readFile(vfsPath).subarray(offset, offset + length);
          return { data: Buffer.from(data), identity: identityFor(vfsPath, true), size: stat.size };
        }
        case 'publish': {
          const source = leaf(op.source);
          const sourcePath = dirVfsPath === '/' ? `/${source}` : `${dirVfsPath}/${source}`;
          const sourceStat = vfs.stat(sourcePath);
          if (!sourceStat) throw coded('ENOENT', `ENOENT: no such file or directory, open '${path.join(directory.path, source)}'`);
          if (sourceStat.type !== 'file') throw new Error('not a regular file');
          if (!sameIdentity(op.expectedIdentity, identityFor(sourcePath, false))) throw new Error('publication source changed');
          if (vfs.stat(vfsPath)) throw coded('EEXIST', `EEXIST: file already exists, link '${realChild}'`);
          vfs.writeFile(vfsPath, vfs.readFile(sourcePath), { format: sourceStat.format });
          const sourceToken = tokenFor(sourcePath, false);
          if (sourceToken !== undefined) { loadTokens().set(vfsPath, sourceToken); saveTokens(); }
          backend.flush();
          return {};
        }
        case 'unlink': {
          if (!op.expectedIdentity) throw new Error('removal requires identity');
          const stat = statOrThrow(vfsPath, realChild);
          if (stat.type !== 'file') throw new Error('not a regular file');
          if (!sameIdentity(op.expectedIdentity, identityFor(vfsPath, false))) throw new Error('file identity changed');
          vfs.unlink(vfsPath);
          dropToken(vfsPath);
          return {};
        }
        default:
          throw new Error('unknown operation');
      }
    },

    async lockFile(directory, name, expectedIdentity, shared = false) {
      leaf(name);
      const vfsPath = childVfsPath(directory.path, name);
      const stat = vfs.stat(vfsPath);
      if (!stat) throw coded('ENOENT', `ENOENT: no such file or directory, open '${path.join(directory.path, name)}'`);
      if (stat.type !== 'file') throw new Error('not a regular file');
      if (!sameIdentity(expectedIdentity, identityFor(vfsPath, false))) throw new Error('lock identity changed');
      // A real flock on a stable per-lock anchor beside the phext (see
      // the header: the phext's own inode is replaced by every flush).
      const fd = anchors.openAnchorFd(vfsPath);
      try {
        const releaseLock = await flockDescriptor(fd, fileIdentity(fstatSync(fd)), shared);
        let closed = false;
        return {
          fd: ++lockSequence,
          close: async () => {
            if (closed) return; closed = true;
            try { vfs.flush(); } finally { await releaseLock(); closeSync(fd); }
          },
        };
      } catch (error) { closeSync(fd); throw error; }
    },

    /** Persist every overlay change (see the flush policy in the header). */
    flush() { vfs.flush(); },
  };
  return backend;
}
