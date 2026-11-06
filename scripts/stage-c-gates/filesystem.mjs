/**
 * Stage-C gates filesystem — PHEXT-ONLY (cutover, 2026-11-05).
 *
 * This module is the single seam the four gates consumers (history
 * store, job storage, publication storage, managed assets) call:
 * pinDirectory, atDirectory, createDirectory, lockFile. Until the
 * cutover it dispatched between a disk backend (a forked worker
 * pinning real directories) and the phext backend in
 * ./phext-backend.mjs. The disk backend is DELETED — code, worker
 * and all. Every call now routes to the phext backend registered
 * for the Cavern root containing the path (cavern-lifecycle
 * registers one per open Cavern), and a path no Cavern covers
 * fails explicitly: gates trees live inside a Cavern's phext or
 * nowhere.
 *
 * The backend serves every path under its Cavern root through the
 * VFS — the gates-owned trees (`.mutable`, `.memory`) and the
 * document folders history descends through alike — with the disk
 * backend's exact identity, locking and error contracts (see
 * phext-backend.mjs for the identity and anchor-flock discipline).
 */
import { resolve, sep } from 'node:path';
import { createPhextBackend } from './phext-backend.mjs';

export const fileIdentity = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });

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
function requireBackend(path) {
  const backend = phextBackendFor(path);
  if (!backend) {
    throw Object.assign(
      new Error(`No Cavern phext is registered for ${path}; gates storage only operates inside a Cavern phext`),
      { code: 'ENOPHEXT' },
    );
  }
  return backend;
}

export async function closeFilesystemWorkers() { for (const backend of phextBackends.values()) backend.flush(); }

export async function pinDirectory(path) {
  return requireBackend(path).pinDirectory(path);
}

export async function atDirectory(directory, operation, lockFd, hooks = {}) {
  const backend = requireBackend(directory.path);
  await hooks.beforeSpawn?.();
  return backend.atDirectory(directory, operation);
}

export async function createDirectory(parent, name, lockFd) {
  return requireBackend(parent.path).createDirectory(parent, name);
}

export async function lockFile(directory, name, expectedIdentity, shared = false) {
  return requireBackend(directory.path).lockFile(directory, name, expectedIdentity, shared);
}
