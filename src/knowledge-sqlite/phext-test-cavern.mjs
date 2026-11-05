/**
 * Test helper (phext-only cutover): make a temp directory a real
 * Cavern for in-process consumers — open (or create) its
 * cavern.phext and register it with the phext-fs facade and the
 * knowledge registry, exactly as the Cavern lifecycle does in
 * production. Tests write Document files through the returned VFS
 * instance; the knowledge worker opens its own instance on the
 * same file (flush generations rebase, as in production).
 *
 * Uses the built VFS (dist) because node --test cannot load the
 * TypeScript source; the registries are globalThis-keyed, so this
 * registration reaches every copy of the facade.
 */
import path from 'node:path';
import { PhextVFS } from '../../dist/src/phext/vfs.js';
import { registerPhextFs, unregisterPhextFs } from '../../server/phext-fs.mjs';
import { registerPhextKnowledge, unregisterPhextKnowledge } from './phext-registry.mjs';

export function testCavern(root, { create = true } = {}) {
  const phextPath = path.join(root, 'cavern.phext');
  const vfs = create ? PhextVFS.openOrCreate(phextPath) : PhextVFS.open(phextPath);
  registerPhextFs({ root, vfs });
  registerPhextKnowledge({ root, phextPath, vfs });
  return {
    vfs,
    phextPath,
    writeFile(rel, text) { vfs.writeFile(`/${rel}`, text); },
    readFile(rel) { return vfs.readTextFile(`/${rel}`); },
    unlink(rel) { vfs.unlink(`/${rel}`); },
    rename(from, to) { vfs.rename(`/${from}`, `/${to}`); },
    flush() { vfs.flush(); },
    close() {
      try { vfs.flush(); } catch { /* already closed */ }
      unregisterPhextFs(root);
      unregisterPhextKnowledge(root);
    },
  };
}
