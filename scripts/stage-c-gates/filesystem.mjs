/**
 * Stage-C gates filesystem — dual backend, selected per Cavern.
 *
 * This module is the single seam the four gates consumers (history
 * store, job storage, publication storage, managed assets) call:
 * pinDirectory, atDirectory, createDirectory, lockFile. It dispatches
 * between two backends by REGISTRATION, which is the storage-mode
 * signal (mode selection, 2026-11-06):
 *
 * - A Cavern root the lifecycle registered (a phext-mode Cavern)
 *   routes every call to the phext backend in ./phext-backend.mjs,
 *   which serves every path under the root through the VFS — the
 *   gates-owned trees (`.mutable`, `.memory`) and the document
 *   folders history descends through alike — with the disk backend's
 *   exact identity, locking and error contracts.
 * - A path no registered Cavern covers is served by the DISK backend:
 *   real directories, serviced by the forked worker in
 *   ./filesystem-worker.mjs holding the pinned lock fd. That is a
 *   native-mode Cavern (the lifecycle registers nothing for it) and
 *   the standalone mounts, which are native by definition.
 *
 * History: until the phext-only cutover this dispatch keyed the
 * phext backend on its `owns()` tree test, because documents then
 * lived on disk beside the phext-held gates trees. The cutover
 * widened the backend to the whole root; the restored dispatch keeps
 * that widening — registration, not tree membership, is the mode.
 */
import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { flockDescriptor } from './flock.mjs';
import { createPhextBackend } from './phext-backend.mjs';

export const fileIdentity = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
// Resolved lazily at first disk-backend use: this module is also
// statically imported by vitest suites (through the test-Cavern
// helper), where import.meta.url is not a file URL — the phext
// backend must stay loadable there; only a real disk session needs
// the worker path, and disk sessions run under native loads.
let workerPath;
const worker = () => workerPath ??= fileURLToPath(new URL('./filesystem-worker.mjs', import.meta.url));
const sessions = new Map();
function sessionFor(lockFd) {
  if (sessions.has(lockFd)) return sessions.get(lockFd);
  const child = fork(worker(), [], { serialization: 'advanced', execArgv: [],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc', ...(lockFd === undefined ? [] : [lockFd])] });
  const pending = new Map(); let sequence = 0, stderr = '', stopped = false;
  child.stderr.on('data', bytes => { if (stderr.length < 4096) stderr += bytes; });
  const fail = error => { stopped = true; for (const p of pending.values()) p.reject(error); pending.clear(); sessions.delete(lockFd); };
  child.once('error', fail);
  const exited = new Promise(resolve => child.once('exit', () => { fail(new Error(`filesystem worker exited: ${stderr}`)); resolve(); }));
  child.on('message', message => {
    const p = pending.get(message.id); if (!p) return;
    pending.delete(message.id);
    if (message.error) p.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
    else p.resolve(message.result);
  });
  const session = {
    request(value) {
      if (stopped) return Promise.reject(new Error('filesystem worker stopped'));
      if (pending.size >= 128) return Promise.reject(new Error('filesystem worker queue capacity'));
      return new Promise((resolve, reject) => {
        const id = ++sequence; pending.set(id, { resolve, reject });
        child.send({ ...value, id }, error => { if (error) { pending.delete(id); reject(error); } });
      });
    },
    async close() {
      if (!stopped) { stopped = true; child.send({ shutdown: true }); }
      await exited;
    },
  };
  sessions.set(lockFd, session); return session;
}

const phextBackends = new Map();
export function registerPhextBackend({ root, vfs }) {
  const backend = createPhextBackend({ root, vfs });
  if (phextBackends.has(backend.root)) throw new Error(`PhextVFS backend already registered for ${backend.root}`);
  phextBackends.set(backend.root, backend);
  return backend;
}
export async function unregisterPhextBackend(root) {
  const backend = phextBackends.get(resolve(root));
  if (!backend) return;
  phextBackends.delete(backend.root);
  backend.flush();
}
function phextBackendFor(path) {
  const resolved = resolve(path);
  let best;
  for (const backend of phextBackends.values()) {
    if (resolved === backend.root || resolved.startsWith(backend.root + sep)) {
      if (!best || backend.root.length > best.root.length) best = backend;
    }
  }
  return best;
}

export async function closeFilesystemWorkers() {
  await Promise.all([...sessions.values()].map(session => session.close()));
  for (const backend of phextBackends.values()) backend.flush();
}

export async function pinDirectory(path) {
  const backend = phextBackendFor(path);
  if (backend) return backend.pinDirectory(path);
  const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { return { path, identity: fileIdentity(await fd.stat()) }; } finally { await fd.close(); }
}

/** Only single-component operations are exposed. Holding the writer's lock FD
 * in the child also keeps OS exclusion alive if its parent process dies mid-write. */
export async function atDirectory(directory, operation, lockFd, hooks = {}) {
  const backend = phextBackendFor(directory.path);
  if (backend) {
    await hooks.beforeSpawn?.();
    return backend.atDirectory(directory, operation);
  }
  if ((await lstat(directory.path)).isSymbolicLink()) throw new Error('symlink rejected');
  await hooks.beforeSpawn?.();
  return sessionFor(lockFd).request({ directory: directory.path, identity: directory.identity, operation });
}

export async function createDirectory(parent, name, lockFd) {
  const backend = phextBackendFor(parent.path);
  if (backend) return backend.createDirectory(parent, name);
  const result = await atDirectory(parent, { kind: 'mkdir', name }, lockFd);
  return { path: join(parent.path, name), identity: result.identity };
}

export async function lockFile(directory, name, expectedIdentity, shared = false) {
  const backend = phextBackendFor(directory.path);
  if (backend) return backend.lockFile(directory, name, expectedIdentity, shared);
  // The lock inode is created by the pinned worker, never by an unconfined open.
  const fd = await open(join(directory.path, name), constants.O_RDWR | constants.O_NOFOLLOW);
  try {
    const identity = fileIdentity(await fd.stat());
    if (!same(identity, expectedIdentity)) throw new Error('lock identity changed');
    const releaseLock = await flockDescriptor(fd.fd, identity, shared);
    return { fd: fd.fd, close: async () => { await sessions.get(fd.fd)?.close(); await releaseLock(); await fd.close(); } };
  } catch (error) { await fd.close(); throw error; }
}
