/**
 * PhextVFS Phase 4 — the phext-knowledge registry.
 *
 * Records which Cavern roots keep their knowledge in `cavern.phext`
 * (L3 canonical records + the ephemeral query replica) instead of
 * `.mutable/mutable.db`. cavern-lifecycle registers a root when the
 * `phextVfs` flag is on; `client.mjs` consults the registry when a
 * foundation is opened so the choice reaches the knowledge worker's
 * `workerData` without the host needing to know about phext at all;
 * `foundation.mjs` consults it for direct in-process opens.
 *
 * The registry lives on globalThis under a Symbol.for key (the
 * phext-fs pattern): the lifecycle, the copied dist modules and the
 * esbuild bundles are separate module instances that must still see
 * ONE registry. Worker threads have their own globalThis — they
 * never consult this registry; the mode reaches them as an explicit
 * `phextKnowledge` option in workerData, resolved here in the host
 * process.
 *
 * An entry is `{ phextPath, vfs? }`: the path always (the worker
 * opens its own PhextVFS instance on it — instances over one file
 * are kept consistent by the VFS flush discipline), plus the
 * lifecycle's instance when the registrant has one to lend to
 * in-process consumers.
 */
import fs from 'node:fs';
import path from 'node:path';

const KEY = Symbol.for('mutable.phextKnowledgeRegistry.v1');

function state() {
  globalThis[KEY] ??= new Map();
  return globalThis[KEY];
}

function keyFor(root) {
  if (typeof root !== 'string' || !root) return undefined;
  try { return fs.realpathSync(root); } catch { return path.resolve(root); }
}

export function registerPhextKnowledge({ root, phextPath, vfs } = {}) {
  const key = keyFor(root);
  if (!key) throw Error('registerPhextKnowledge requires a Cavern root');
  if (typeof phextPath !== 'string' || !phextPath) throw Error('registerPhextKnowledge requires the phext path');
  state().set(key, { phextPath: path.resolve(phextPath), vfs });
}

export function phextKnowledgeFor(vault) {
  const key = keyFor(vault);
  return key ? state().get(key) : undefined;
}

export function unregisterPhextKnowledge(root) {
  const key = keyFor(root);
  if (key) state().delete(key);
}
