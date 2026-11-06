import fs from 'node:fs';

/**
 * Filesystem shape guards for the knowledge layer. The disk-era
 * exports that prepared a `.mutable` database home and took its
 * writer lease (prepareHome, writerLock) are deleted with the
 * phext-only cutover: canonical knowledge lives in the Cavern
 * phext, the writer lease is a flock on the phext's anchor file
 * (client.mjs's phextWriterLease), and no `.mutable` home is ever
 * prepared. What remains is the pair of validators the restore and
 * converter paths still use.
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
