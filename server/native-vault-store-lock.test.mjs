// Regression tests for the native vault store lock in an environment
// where the optional fs-ext binding is absent (the deployed host, this
// dev VM). Before the fix, nativeFlock rejected with ENOSYS and every
// NativeVaultStore.lock call failed 503 "Native store locking is
// unavailable"; ManagedPair.lock threw the same stub error. The lock now
// routes through the stage-C gates token fallback
// (scripts/stage-c-gates/flock.mjs) when fs-ext is missing.
import { test, expect, beforeAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { NativeVaultStore } from './native-vault-store.mjs';

const makeStore = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'nvs-lock-'));
  return { root, store: new NativeVaultStore({ root, nativeDiscoveryWorker: false }) };
};

// Child helper for the cross-process test: holds an exclusive fallback
// lock (via the same stage-C helper the store's lock routes through) on
// the file named in argv[2], prints HELD, then exits WITHOUT releasing —
// the crash shape the token protocol must recover from. Generated into a
// temp file because a plain node child cannot import the store's
// TypeScript module chain.
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
  const { root, store } = await makeStore();
  try {
    await expect(store.lock(async () => 'ACTION RAN')).resolves.toBe('ACTION RAN');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20000);

test('concurrent lock reports contention; lock succeeds again after release', async () => {
  const { root, store } = await makeStore();
  try {
    let releaseFirst;
    const first = store.lock(() => new Promise(resolve => { releaseFirst = () => resolve('FIRST DONE'); }));
    // Let the first lock acquire before contending with it.
    await new Promise(r => setTimeout(r, 250));
    await expect(store.lock(async () => 'SECOND RAN')).rejects.toThrow('Another managed operation is active; retry');
    releaseFirst();
    await expect(first).resolves.toBe('FIRST DONE');
    await expect(store.lock(async () => 'THIRD RAN')).resolves.toBe('THIRD RAN');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20000);

test('cross-process holder via the stage-C flock helper contends, and its exit frees the lock', async () => {
  const { root, store } = await makeStore();
  const lockFile = path.join(root, '.mutable-store.lock');
  try {
    await store.lock(async () => {}); // ensures .mutable-store.lock exists
    const child = spawn(process.execPath, [childHelper, lockFile], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve, reject) => {
      child.stdout.on('data', d => { if (String(d).includes('HELD')) resolve(); });
      child.on('exit', () => reject(new Error('child exited before holding')));
      setTimeout(() => reject(new Error('child never held')), 8000);
    });
    await expect(store.lock(async () => 'RAN')).rejects.toThrow('Another managed operation is active; retry');
    await new Promise(r => child.on('exit', r)); // child exits WITHOUT releasing (crash shape)
    await expect(store.lock(async () => 'AFTER CRASH')).resolves.toBe('AFTER CRASH');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30000);
