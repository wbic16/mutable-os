import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { flockDescriptor } from './flock.mjs';
import { createPhextBackend } from './phext-backend.mjs';

export const fileIdentity = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const worker = fileURLToPath(new URL('./filesystem-worker.mjs', import.meta.url));
const sessions = new Map();
function sessionFor(lockFd) {
  if (sessions.has(lockFd)) return sessions.get(lockFd);
  const child = fork(worker, [], { serialization: 'advanced', execArgv: [],
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
// PhextVFS Phase 2 dispatch: cavern-lifecycle registers one phext
// backend per Cavern root when the `phextVfs` flag is on. With nothing
// registered — the default — every function below is exactly the disk
// implementation. With a backend registered, the gates-owned trees
// (./phext-backend.mjs: `.mutable*` and any `.memory` subtree) route to
// the Cavern's phext; a stat/mkdir of a tree-starting component against
// a disk pin is answered by the backend so component-by-component
// descent crosses over at the boundary.
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

export async function closeFilesystemWorkers() { await Promise.all([...sessions.values()].map(session => session.close())); for (const backend of phextBackends.values()) backend.flush(); }
export async function pinDirectory(path) {
  const backend = phextBackendFor(path);
  if (backend?.owns(path)) return backend.pinDirectory(path);
  const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { return { path, identity: fileIdentity(await fd.stat()) }; } finally { await fd.close(); }
}

/** Only single-component operations are exposed. Holding the writer's lock FD
 * in the child also keeps OS exclusion alive if its parent process dies mid-write. */
export async function atDirectory(directory, operation, lockFd, hooks = {}) {
  const backend = phextBackendFor(directory.path);
  if (backend) {
    if (backend.owns(directory.path)) return backend.atDirectory(directory, operation);
    if ((operation.kind === 'stat' || operation.kind === 'mkdir') && backend.startsTree(operation.name)) {
      return operation.kind === 'stat'
        ? backend.statChild(directory.path, operation.name)
        : backend.mkdirChild(directory.path, operation.name);
    }
  }
  if ((await lstat(directory.path)).isSymbolicLink()) throw new Error('symlink rejected');
  await hooks.beforeSpawn?.();
  return sessionFor(lockFd).request({ directory: directory.path, identity: directory.identity, operation });
}

export async function createDirectory(parent, name, lockFd) {
  const backend = phextBackendFor(parent.path);
  if (backend && (backend.owns(parent.path) || backend.startsTree(name))) {
    return backend.createDirectory(parent, name);
  }
  const result = await atDirectory(parent, { kind: 'mkdir', name }, lockFd);
  return { path: join(parent.path, name), identity: result.identity };
}

export async function lockFile(directory, name, expectedIdentity, shared = false) {
  const backend = phextBackendFor(directory.path);
  if (backend?.owns(directory.path)) return backend.lockFile(directory, name, expectedIdentity, shared);
  // The lock inode is created by the pinned worker, never by an unconfined open.
  const fd = await open(join(directory.path, name), constants.O_RDWR | constants.O_NOFOLLOW);
  try {
    const identity = fileIdentity(await fd.stat());
    if (!same(identity, expectedIdentity)) throw new Error('lock identity changed');
    const releaseLock = await flockDescriptor(fd.fd, identity, shared);
    return { fd: fd.fd, close: async () => { await sessions.get(fd.fd)?.close(); await releaseLock(); await fd.close(); } };
  } catch (error) { await fd.close(); throw error; }
}
