// Regression tests for the native vault store lock in an environment
// where the optional fs-ext binding is absent (the deployed host, this
// dev VM). Before the fix, nativeFlock rejected with ENOSYS and every
// NativeVaultStore.lock call failed 503 "Native store locking is
// unavailable"; ManagedPair.lock threw the same stub error. The lock now
// routes through the stage-C gates token fallback
// (scripts/stage-c-gates/flock.mjs) when fs-ext is missing.
//
// Phext-only cutover: the store operates only inside a registered
// Cavern (an unregistered root refuses ENOPHEXT), and its lock file
// is the virtual /.mutable-store.lock — flocked through the real
// anchor file beside the phext, cavern.phext.anchor-<sha256(path)>.
import { test, expect, beforeAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { NativeVaultStore } from './native-vault-store.mjs';
import { testCavern } from '../src/knowledge-sqlite/phext-test-cavern.mjs';

const makeStore = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'nvs-lock-'));
  const cavern = testCavern(root);
  return { root, cavern, store: new NativeVaultStore({ root, nativeDiscoveryWorker: false }) };
};
const cleanup = async ({ root, cavern }) => { try { cavern.close(); } catch { /* closed */ } await rm(root, { recursive: true, force: true }); };

// Child helper for the cross-process test: holds an exclusive fallback
// lock (via the same stage-C helper the store's lock routes through) on
// the anchor file named in argv[2], prints HELD, then exits WITHOUT
// releasing — the crash shape the token protocol must recover from.
// Generated into a temp file because a plain node child cannot import
// the store's TypeScript module chain.
let childHelper;
beforeAll(async () => {
  // Resolved from the working directory, like the application services'
  // own scripts/ imports: under Vitest's module pipeline import.meta.url
  // is not a file URL for this module.
  const flockPath = path.resolve('scripts/stage-c-gates/flock.mjs');
  childHelper = path.join(tmpdir(), `nvs-lock-child-${process.pid}.mjs`);
  await writeFile(childHelper, [
    `import { openSync, fstatSync } from 'node:fs';`,
    `import { flockDescriptor } from ${JSON.stringify(flockPath)};`,
    `const fd = openSync(process.argv[2], 'r+');`,
    `const st = fstatSync(fd);`,
    `await flockDescriptor(fd, { dev: String(st.dev), ino: String(st.ino) }, false);`,
    `console.log('HELD');`,
    `setTimeout(() => {}, 4000);`,
  ].join('\n'));
});

test('store.lock runs the action', async () => {
  const f = await makeStore();
  try {
    await expect(f.store.lock(async () => 'ACTION RAN')).resolves.toBe('ACTION RAN');
  } finally { await cleanup(f); }
}, 20000);

test('concurrent lock reports contention; lock succeeds again after release', async () => {
  const f = await makeStore();
  const store = f.store;
  try {
    let releaseFirst;
    const first = store.lock(() => new Promise(resolve => { releaseFirst = () => resolve('FIRST DONE'); }));
    // Let the first lock acquire before contending with it.
    await new Promise(r => setTimeout(r, 250));
    await expect(store.lock(async () => 'SECOND RAN')).rejects.toThrow('Another managed operation is active; retry');
    releaseFirst();
    await expect(first).resolves.toBe('FIRST DONE');
    await expect(store.lock(async () => 'THIRD RAN')).resolves.toBe('THIRD RAN');
  } finally { await cleanup(f); }
}, 20000);

test('cross-process holder via the stage-C flock helper contends, and its exit frees the lock', async () => {
  const f = await makeStore();
  const { root, store } = f;
  // The store lock's real anchor beside the phext (see header).
  const anchor = path.join(root, `cavern.phext.anchor-${createHash('sha256').update('/.mutable-store.lock').digest('hex').slice(0, 16)}`);
  try {
    await store.lock(async () => {}); // ensures the lock + its anchor exist
    const child = spawn(process.execPath, [childHelper, anchor], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve, reject) => {
      child.stdout.on('data', d => { if (String(d).includes('HELD')) resolve(); });
      child.on('exit', () => reject(new Error('child exited before holding')));
      setTimeout(() => reject(new Error('child never held')), 8000);
    });
    await expect(store.lock(async () => 'RAN')).rejects.toThrow('Another managed operation is active; retry');
    await new Promise(r => child.on('exit', r)); // child exits WITHOUT releasing (crash shape)
    await expect(store.lock(async () => 'AFTER CRASH')).resolves.toBe('AFTER CRASH');
  } finally { await cleanup(f); }
}, 30000);
