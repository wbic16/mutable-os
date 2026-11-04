// @vitest-environment node
/**
 * PhextVFS Phase 2: the stage-C gates phext backend, exercised through
 * the same public filesystem.mjs surface the four gates consumers use
 * (pinDirectory / atDirectory / createDirectory / lockFile), with a
 * PhextVFS registered for the Cavern root — the wiring cavern-lifecycle
 * performs when the phextVfs flag is on.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { PhextVFS } from '../src/phext/vfs';

const run = promisify(execFile);
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const gates = () => import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);

type Fixture = { root: string; phextPath: string; vfs: PhextVFS; fs: any };
const fixtures: Fixture[] = [];
async function fixture(): Promise<Fixture> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'phext-gates-')));
  const phextPath = path.join(root, 'cavern.phext');
  const vfs = PhextVFS.openOrCreate(phextPath);
  const fs = await gates();
  fs.registerPhextBackend({ root, vfs });
  const value = { root, phextPath, vfs, fs };
  fixtures.push(value);
  return value;
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    await f.fs.unregisterPhextBackend(f.root).catch(() => {});
    if (!f.vfs.closed) f.vfs.close();
    await f.fs.closeFilesystemWorkers();
    await rm(f.root, { recursive: true, force: true });
  }
});

/** Descend root -> .mutable -> jobs the way job-storage's home() does:
 * stat the component, create it only when the stat reports ENOENT. */
async function descend(fs: any, parent: any, name: string) {
  try {
    const s = await fs.atDirectory(parent, { kind: 'stat', name });
    return { path: path.join(parent.path, name), identity: s.identity };
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
    return fs.createDirectory(parent, name);
  }
}
async function jobsHome(fs: any, root: string) {
  const rootPin = await fs.pinDirectory(root);
  const mutablePin = await descend(fs, rootPin, '.mutable');
  return descend(fs, mutablePin, 'jobs');
}

describe('phext gates backend', () => {
  it('runs the op vocabulary end-to-end and persists across a cold reopen', async () => {
    const { root, phextPath, vfs, fs } = await fixture();
    const rootPin = await fs.pinDirectory(root);
    expect(rootPin.identity.dev).not.toMatch(/^phext:/); // the Cavern root itself stays a disk pin

    const mutableStat = await fs.atDirectory(rootPin, { kind: 'stat', name: '.mutable' });
    expect(mutableStat.directory).toBe(true);
    expect(mutableStat.identity.dev).toMatch(/^phext:/); // descent crosses into the phext

    const jobs = await jobsHome(fs, root);
    const job = await fs.createDirectory(jobs, 'job-1');

    const created = await fs.atDirectory(job, { kind: 'create', name: 'record.json', data: Buffer.from('{"a":1}'), maxBytes: 1024 });
    expect(created.size).toBe(7);
    expect(created.hash).toBe(sha('{"a":1}'));
    await expect(fs.atDirectory(job, { kind: 'create', name: 'record.json', data: Buffer.alloc(0), maxBytes: 0 }))
      .rejects.toMatchObject({ code: 'EEXIST' });

    const read = await fs.atDirectory(job, { kind: 'read', name: 'record.json', maxBytes: 1024 });
    expect(read.data.toString()).toBe('{"a":1}');
    expect(read.identity).toEqual(created.identity);
    await expect(fs.atDirectory(job, { kind: 'read', name: 'record.json', maxBytes: 8, expectedIdentity: { dev: 'x', ino: 'y' } }))
      .rejects.toThrow('file identity changed');
    const part = await fs.atDirectory(job, { kind: 'read', name: 'record.json', maxBytes: 3, offset: 1, length: 3 });
    expect(part.data.toString()).toBe('"a"');

    const appended = await fs.atDirectory(job, { kind: 'append', name: 'record.json', data: Buffer.from('+'), maxBytes: 8, expectedSize: 7 });
    expect(appended.size).toBe(8);
    await expect(fs.atDirectory(job, { kind: 'append', name: 'record.json', data: Buffer.from('+'), maxBytes: 8, expectedSize: 7 }))
      .rejects.toThrow('append head changed');

    for (const name of ['b.txt', 'a.txt']) {
      await fs.atDirectory(job, { kind: 'create', name, data: Buffer.from(name), maxBytes: 16 });
    }
    const page1 = await fs.atDirectory(job, { kind: 'list', offset: 0, limit: 2 });
    expect(page1.entries.map((e: any) => e.name)).toEqual(['a.txt', 'b.txt']);
    expect(page1.next).toBe(2);
    const page2 = await fs.atDirectory(job, { kind: 'list', offset: page1.next, limit: 2 });
    expect(page2.entries.map((e: any) => e.name)).toEqual(['record.json']);
    expect(page2.next).toBeUndefined();

    const sub = await fs.atDirectory(job, { kind: 'mkdir', name: 'sub' });
    const subPin = { path: path.join(job.path, 'sub'), identity: sub.identity };
    await fs.atDirectory(subPin, { kind: 'create', name: 'x', data: Buffer.from('x'), maxBytes: 4 });
    await expect(fs.atDirectory(job, { kind: 'rmdir', name: 'sub', expectedIdentity: sub.identity }))
      .rejects.toMatchObject({ code: 'ENOTEMPTY' });
    const xStat = await fs.atDirectory(subPin, { kind: 'stat', name: 'x' });
    await fs.atDirectory(subPin, { kind: 'unlink', name: 'x', expectedIdentity: xStat.identity });
    await fs.atDirectory(job, { kind: 'rmdir', name: 'sub', expectedIdentity: sub.identity });

    const stage = await fs.atDirectory(job, { kind: 'create', name: 'stage-1', data: Buffer.from('final'), maxBytes: 64 });
    await fs.atDirectory(job, { kind: 'publish', source: 'stage-1', name: 'final.json', expectedIdentity: stage.identity });
    const finalStat = await fs.atDirectory(job, { kind: 'stat', name: 'final.json' });
    expect(finalStat.identity).toEqual(stage.identity); // publish inherits the source identity, like a hard link
    await expect(fs.atDirectory(job, { kind: 'publish', source: 'stage-1', name: 'final.json', expectedIdentity: stage.identity }))
      .rejects.toMatchObject({ code: 'EEXIST' });
    await fs.atDirectory(job, { kind: 'unlink', name: 'stage-1', expectedIdentity: stage.identity });

    const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x17, 0x00, 0xff]);
    await fs.atDirectory(job, { kind: 'create', name: 'blob.bin', data: bin, maxBytes: 64 });
    expect((await fs.atDirectory(job, { kind: 'read', name: 'blob.bin', maxBytes: 64 })).data).toEqual(bin);

    // The gates trees never touched the real disk.
    expect(existsSync(path.join(root, '.mutable'))).toBe(false);

    // Cold reopen: same bytes, same identities (tokens persist in the phext).
    await fs.unregisterPhextBackend(root);
    vfs.close();
    const cold = PhextVFS.open(phextPath);
    fixtures.push({ root, phextPath, vfs: cold, fs });
    expect(cold.readTextFile('/.mutable/jobs/job-1/record.json')).toBe('{"a":1}+');
    expect(cold.readFile('/.mutable/jobs/job-1/blob.bin')).toEqual(bin);
    fs.registerPhextBackend({ root, vfs: cold });
    const jobs2 = await jobsHome(fs, root);
    const job2 = await fs.atDirectory(jobs2, { kind: 'stat', name: 'job-1' });
    const final2 = await fs.atDirectory({ path: path.join(root, '.mutable', 'jobs', 'job-1'), identity: job2.identity }, { kind: 'stat', name: 'final.json' });
    expect(final2.identity).toEqual(finalStat.identity);
  });

  it('fails closed when a directory is deleted and recreated under a stale pin', async () => {
    const { root, fs } = await fixture();
    const jobs = await jobsHome(fs, root);
    const first = await fs.createDirectory(jobs, 'ephemeral');
    await fs.atDirectory(jobs, { kind: 'rmdir', name: 'ephemeral', expectedIdentity: first.identity });
    const second = await fs.createDirectory(jobs, 'ephemeral');
    expect(second.identity).not.toEqual(first.identity);
    await expect(fs.atDirectory(first, { kind: 'list', offset: 0, limit: 10 }))
      .rejects.toThrow('directory identity changed');
    await expect(fs.atDirectory(jobs, { kind: 'rmdir', name: 'ephemeral', expectedIdentity: first.identity }))
      .rejects.toThrow('directory identity changed');
    await fs.atDirectory(jobs, { kind: 'rmdir', name: 'ephemeral', expectedIdentity: second.identity });
  });

  it('keeps real flock semantics in-process: exclusive fences, shared coexists', async () => {
    const { root, fs } = await fixture();
    await mkdir(path.join(root, 'docs'));
    await writeFile(path.join(root, 'docs', 'doc.json'), '{}');
    const folderPin = await fs.pinDirectory(path.join(root, 'docs'));
    const memory = await fs.createDirectory(folderPin, '.memory');
    const memoir = await fs.createDirectory(memory, 'document-abc');
    await fs.atDirectory(memoir, { kind: 'create', name: 'writer.lock', data: Buffer.alloc(0), maxBytes: 0 });
    const lockInfo = await fs.atDirectory(memoir, { kind: 'stat', name: 'writer.lock' });

    await expect(fs.lockFile(memoir, 'writer.lock', { dev: 'x', ino: 'y' })).rejects.toThrow('lock identity changed');
    const exclusive = await fs.lockFile(memoir, 'writer.lock', lockInfo.identity);
    await expect(fs.lockFile(memoir, 'writer.lock', lockInfo.identity)).rejects.toMatchObject({ code: 'EWOULDBLOCK' });
    await expect(fs.lockFile(memoir, 'writer.lock', lockInfo.identity, true)).rejects.toMatchObject({ code: 'EWOULDBLOCK' });
    await exclusive.close();

    const shared1 = await fs.lockFile(memoir, 'writer.lock', lockInfo.identity, true);
    const shared2 = await fs.lockFile(memoir, 'writer.lock', lockInfo.identity, true);
    await expect(fs.lockFile(memoir, 'writer.lock', lockInfo.identity)).rejects.toMatchObject({ code: 'EWOULDBLOCK' });
    await shared1.close();
    await shared2.close();

    const again = await fs.lockFile(memoir, 'writer.lock', lockInfo.identity);
    await again.close();
    // The .memory tree lives only in the phext.
    expect(existsSync(path.join(root, 'docs', '.memory'))).toBe(false);
  });

  it('excludes a second process through the anchor flock and frees on release', async () => {
    const { root, vfs, fs } = await fixture();
    await mkdir(path.join(root, 'docs'));
    await writeFile(path.join(root, 'docs', 'doc.json'), '{}');
    const folderPin = await fs.pinDirectory(path.join(root, 'docs'));
    const memory = await fs.createDirectory(folderPin, '.memory');
    const memoir = await fs.createDirectory(memory, 'document-abc');
    await fs.atDirectory(memoir, { kind: 'create', name: 'writer.lock', data: Buffer.alloc(0), maxBytes: 0 });
    const lockInfo = await fs.atDirectory(memoir, { kind: 'stat', name: 'writer.lock' });
    const lock = await fs.lockFile(memoir, 'writer.lock', lockInfo.identity);
    vfs.flush(); // the child opens the phext from disk; make the lock file and its token visible

    const bundle = path.join(root, 'vfs.bundle.mjs');
    await build({ entryPoints: [path.resolve('src/phext/vfs.ts')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' });
    const childPath = path.join(root, 'lock-child.mjs');
    await writeFile(childPath, `
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, bundle, gatesPath, memoirPath] = process.argv.slice(2);
const { PhextVFS } = await import(pathToFileURL(bundle).href);
const gates = await import(pathToFileURL(gatesPath).href);
const vfs = PhextVFS.open(path.join(root, 'cavern.phext'));
gates.registerPhextBackend({ root, vfs });
try {
  const memoir = await gates.pinDirectory(memoirPath);
  const info = await gates.atDirectory(memoir, { kind: 'stat', name: 'writer.lock' });
  try {
    const lock = await gates.lockFile(memoir, 'writer.lock', info.identity);
    await lock.close();
    console.log('ACQUIRED');
  } catch (error) { console.log('REFUSED:' + error.code); }
} finally { await gates.unregisterPhextBackend(root); vfs.close(); }
`);
    const gatesPath = path.resolve('scripts/stage-c-gates/filesystem.mjs');
    const attempt = async () => (await run(process.execPath, [childPath, root, bundle, gatesPath, memoir.path])).stdout.trim();
    await expect(attempt()).resolves.toContain('REFUSED:EWOULDBLOCK');
    await lock.close();
    await expect(attempt()).resolves.toContain('ACQUIRED');
  }, 60_000);
});
