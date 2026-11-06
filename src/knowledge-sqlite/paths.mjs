import fs from 'node:fs';
import path from 'node:path';
import { isMainThread } from 'node:worker_threads';
import { flockExclusiveSync } from './advisory-lock.mjs';

/**
 * Filesystem shape guards for the knowledge layer, plus the disk
 * foundation's home preparation and writer lease (restored with
 * per-Cavern mode selection, 2026-11-06): a native-mode Cavern keeps
 * its canonical databases at `.mutable/mutable.db` / `audit.db`, so
 * `prepareHome` and `writerLock` live again beside the validators
 * the restore and converter paths use. In phext mode neither is
 * called — the writer lease there is a flock on the phext's anchor
 * file (client.mjs's phextWriterLease).
 */
export function regularFile(file, optional = false) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (e) { if (optional && e.code === 'ENOENT') return false; throw e; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw Error(`Expected a private regular file: ${file}`);
  return true;
}
export function directory(dir) {
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error(`Expected a real directory: ${dir}`);
  return fs.realpathSync(dir);
}
export function prepareHome({ vault, readOnly = false, initialize = false } = {}) {
  if (typeof vault !== 'string' || !path.isAbsolute(vault)) throw Error('Supply an absolute vault directory');
  if (readOnly && initialize) throw Error('Read-only mode cannot initialize databases');
  const root = directory(vault), home = path.join(root, '.mutable');
  if (!fs.existsSync(home) && initialize) fs.mkdirSync(home, { mode: 0o700 });
  directory(home);
  return { root, home };
}
export function writerLock(home) {
  // fs-ext 2.1.1 uses process-global native state and is not safe across worker isolates.
  if (!isMainThread) throw Error('The host thread must own the SQLite writer lease');
  directory(home);
  const file = path.join(home, 'writer.lock'); regularFile(file, true);
  const fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW, 0o600);
  // flockExclusiveSync prefers the native binding and falls back to a portable
  // token lock (writer.lock.holder) when fs-ext is unavailable; the rendezvous
  // inode itself is still never unlinked.
  let releaseLock;
  try { releaseLock = flockExclusiveSync(fd, `${file}.holder`); }
  catch (e) { fs.closeSync(fd); throw Error(`SQLite writer unavailable: ${e.message}`); }
  // Never unlink the lock inode: that would allow a second writer to lock a different inode.
  let closed = false;
  return () => { if (!closed) { closed = true; try { releaseLock(); } finally { fs.closeSync(fd); } } };
}
