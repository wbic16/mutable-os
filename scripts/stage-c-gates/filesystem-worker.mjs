// G2 confined filesystem candidate. A child process pins its cwd before any
// mutation, then verifies its inode. Operations use single relative components;
// swapping an ancestor with a symlink cannot redirect a write to another tree.
import { constants } from 'node:fs';
import { open, mkdir, rmdir, lstat, opendir, link, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const identity = s => ({ dev: String(s.dev), ino: String(s.ino) });
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const leaf = name => {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\\0]/.test(name)) throw new Error('invalid leaf');
  return name;
};
async function handle(request) {
  process.chdir(request.directory);
  const dir = await open('.', constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    if (!same(identity(await dir.stat()), request.identity)) throw new Error('directory identity changed');
    const op = request.operation, name = op.kind === 'list' ? undefined : leaf(op.name);
    if (['create', 'append'].includes(op.kind) && (!Number.isSafeInteger(op.maxBytes) || op.maxBytes < 0 || Buffer.byteLength(op.data) > op.maxBytes)) throw new Error('write byte limit');
    if (op.kind === 'mkdir') {
      await mkdir(name, { mode: 0o700 });
      const child = await open(name, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await child.sync(); await dir.sync(); return { identity: identity(await child.stat()) }; } finally { await child.close(); }
    }
    if (op.kind === 'stat') {
      const s = await lstat(name);
      if (s.isSymbolicLink()) throw new Error('symlink rejected');
      return { identity: identity(s), size: s.size, directory: s.isDirectory(), file: s.isFile() };
    }
    if (op.kind === 'rmdir') {
      if (!op.expectedIdentity) throw new Error('directory removal requires identity');
      const child = await open(name, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try {
        if (!same(identity(await child.stat()), op.expectedIdentity)) throw new Error('directory identity changed');
        await rmdir(name); await dir.sync(); return {};
      } finally { await child.close(); }
    }
    if (op.kind === 'list') {
      if (!Number.isSafeInteger(op.limit) || op.limit < 1 || op.limit > 100 || !Number.isSafeInteger(op.offset) || op.offset < 0 || op.offset > 10000) throw new Error('directory scan limit');
      const entries = [], directory = await opendir('.'); let position = 0, next;
      try {
        for await (const entry of directory) {
          if (++position <= op.offset) continue;
          if (entries.length === op.limit) { next = position - 1; break; }
          entries.push({ name: entry.name, directory: entry.isDirectory(), symlink: entry.isSymbolicLink() });
        }
      } finally { /* for-await closes the directory, including early termination */ }
      return { entries, next };
    }
    if (op.kind === 'publish') {
      const source = await open(leaf(op.source), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!same(identity(await source.stat()), op.expectedIdentity)) throw new Error('publication source changed');
        await link(op.source, name); await dir.sync();
        const target = await open(name, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          if (!same(identity(await target.stat()), op.expectedIdentity)) throw new Error('publication target changed');
        } finally { await target.close(); }
      } finally { await source.close(); }
      return {};
    }
    const flags = op.kind === 'create' ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      : op.kind === 'append' ? constants.O_WRONLY | constants.O_APPEND : constants.O_RDONLY;
    const file = await open(name, flags | constants.O_NOFOLLOW, 0o600);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw new Error('not a regular file');
      if (op.expectedIdentity && !same(identity(stat), op.expectedIdentity)) throw new Error('file identity changed');
      if (op.kind === 'unlink') {
        if (!op.expectedIdentity) throw new Error('removal requires identity');
        await unlink(name); await dir.sync(); return {};
      }
      if (op.kind === 'read') {
        const offset = op.offset ?? 0, length = op.length ?? stat.size;
        if (!Number.isSafeInteger(op.maxBytes) || op.maxBytes < 0 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 || length > op.maxBytes || offset + length > stat.size) throw new Error('read byte limit');
        const data = Buffer.alloc(length); let position = 0;
        while (position < data.length) {
          const read = await file.read(data, position, data.length - position, offset + position);
          if (!read.bytesRead) throw new Error('read file changed'); position += read.bytesRead;
        }
        if ((await file.stat()).size !== stat.size) throw new Error('read file changed');
        return { data, identity: identity(stat), size: stat.size };
      }
      if (!['create', 'append'].includes(op.kind)) throw new Error('unknown operation');
      const data = Buffer.from(op.data);
      if (data.length > op.maxBytes) throw new Error('write byte limit');
      if (op.kind === 'append' && stat.size !== op.expectedSize) throw new Error('append head changed');
      await file.writeFile(data); await file.sync(); await dir.sync();
      return { identity: identity(stat), size: stat.size + data.length, hash: createHash('sha256').update(data).digest('hex') };
    } finally { await file.close(); }
  } finally { await dir.close(); }
}
let queue = Promise.resolve();
process.on('message', request => {
  queue = queue.then(async () => {
    if (request.shutdown) { process.exit(0); return; }
    try { process.send({ id: request.id, result: await handle(request) }); }
    catch (error) { process.send({ id: request.id, error: { message: error.message, code: error.code } }); }
  });
});
process.on('disconnect', () => process.exit(1));
