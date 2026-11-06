import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { openSync, closeSync, fstatSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { pinDirectory, atDirectory, lockFile, closeFilesystemWorkers, fileIdentity } from './filesystem.mjs';
import { flockDescriptor } from './flock.mjs';
import { testCavern } from '../../src/knowledge-sqlite/phext-test-cavern.mjs';

// The import above is itself the first assertion: filesystem.mjs must load
// in an environment where the optional fs-ext binding is absent, and every
// behaviour below must hold with whichever lock layer is active.
after(closeFilesystemWorkers);

async function sandbox(run) {
  const directory = await mkdtemp(join(tmpdir(), 'mutable-gates-flock-'));
  const cavern = testCavern(directory); // phext-only: gates operate inside a registered Cavern
  try { await run(directory); } finally { cavern.close(); await rm(directory, { recursive: true, force: true }); }
}

// Mirror the application services' lock pattern (job-storage): the lock
// inode is created by the pinned worker, then stated, then locked.
async function prepareLockFile(directory, name = 'writer.lock') {
  const dir = await pinDirectory(directory);
  try { await atDirectory(dir, { kind: 'create', name, data: Buffer.alloc(0), maxBytes: 0 }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  const stat = await atDirectory(dir, { kind: 'stat', name });
  return { dir, name, identity: stat.identity };
}

test('exclusive lock contends with EWOULDBLOCK and frees on close', () => sandbox(async directory => {
  const { dir, name, identity } = await prepareLockFile(directory);
  const first = await lockFile(dir, name, identity);
  try {
    await assert.rejects(lockFile(dir, name, identity), { code: 'EWOULDBLOCK' });
  } finally { await first.close(); }
  const second = await lockFile(dir, name, identity);
  await second.close();
}));

test('shared locks coexist; exclusive waits for the last shared release', () => sandbox(async directory => {
  const { dir, name, identity } = await prepareLockFile(directory);
  const sharedA = await lockFile(dir, name, identity, true);
  const sharedB = await lockFile(dir, name, identity, true);
  try {
    await assert.rejects(lockFile(dir, name, identity), { code: 'EWOULDBLOCK' });
  } finally { await sharedA.close(); await sharedB.close(); }
  const exclusive = await lockFile(dir, name, identity);
  await exclusive.close();
}));

test('a crashed holder does not wedge the lock (cross-process)', { timeout: 30000 }, () => sandbox(async directory => {
  const target = join(directory, 'owner.lock');
  const fd = openSync(target, 'w');
  const identity = fileIdentity(fstatSync(fd));
  const flockUrl = new URL('./flock.mjs', import.meta.url).href;
  const childScript = `
    import { openSync, fstatSync } from 'node:fs';
    import { flockDescriptor } from ${JSON.stringify(flockUrl)};
    import { fileIdentity } from ${JSON.stringify(new URL('./filesystem.mjs', import.meta.url).href)};
    const fd = openSync(${JSON.stringify(target)}, 'r+');
    await flockDescriptor(fd, fileIdentity(fstatSync(fd)), false);
    console.log('held');
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', childScript],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', bytes => { if (String(bytes).includes('held')) resolve(); });
      child.once('exit', () => reject(new Error('lock holder exited early')));
    });
    await assert.rejects(flockDescriptor(fd, identity, false), { code: 'EWOULDBLOCK' });
    child.kill('SIGKILL');
    await new Promise(resolve => child.once('exit', resolve));
    const release = await flockDescriptor(fd, identity, false); // dead pid recovered, not wedged
    await release();
  } finally {
    child.kill('SIGKILL');
    closeSync(fd);
  }
}));
