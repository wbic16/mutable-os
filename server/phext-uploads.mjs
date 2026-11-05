/**
 * PhextVFS Phase 3b — the legacy /upload endpoint and /uploads
 * static route, phext-backed.
 *
 * Uploads were the last authored content living outside the phext:
 * multer wrote image files to a real `<cavern>/uploads/` directory
 * and express.static served them back from disk. In phext mode
 * (the `phextVfs` flag on and a Cavern registered with phext-fs)
 * both halves move into the Cavern's phext, embedded — the settled
 * media ruling: binary content, base64-chunked per chunk exactly
 * like Phase 2's managed assets (stratum 6's encoding), stored at
 * the file's natural VFS path `/uploads/<name>` (the VFS assigns
 * strata by path, and the path is what export must restore).
 *
 * - `createPhextUploadStorage({ destinationFor })` is a drop-in
 *   multer storage engine with diskStorage's contract: the caller
 *   resolves the destination per request (Cavern + session checks
 *   stay with the caller, exactly as the old destination callback
 *   had them), filenames keep the historical `Date.now() + ext`
 *   shape, and the file info multer reports — destination,
 *   filename, path, size — matches the disk engine's. When no
 *   phext backend covers the destination Cavern the engine writes
 *   to real disk itself, so a disk-mode Cavern under the flag
 *   behaves byte-identically to the old engine.
 * - `createPhextUploadsStatic({ currentRoot })` serves GET/HEAD
 *   /uploads/* from the registered Cavern's VFS and falls through
 *   to the next handler (the disk static route) whenever anything
 *   is not a phext-resident file: flag off, no Cavern, no file.
 *
 * server/index.ts loads this module by URL behind the flag, the
 * house pattern for phext modules; with the flag off neither export
 * is ever wired in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { phextFsBackendFor } from './phext-fs.mjs';

const CONTENT_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

/** The backend covering a destination, when it is phext-resident. */
function backendFor(destination) {
  if (!destination?.root) return undefined;
  return phextFsBackendFor(path.join(destination.root, 'uploads'));
}

export function createPhextUploadStorage({ destinationFor } = {}) {
  if (typeof destinationFor !== 'function') {
    throw new Error('createPhextUploadStorage requires { destinationFor }');
  }
  return {
    _handleFile(req, file, cb) {
      let destination;
      try { destination = destinationFor(req); } catch (error) { cb(error); return; }
      const filename = Date.now() + path.extname(file.originalname ?? '');
      const chunks = [];
      file.stream.on('data', chunk => chunks.push(chunk));
      file.stream.on('error', cb);
      file.stream.on('end', () => {
        const bytes = Buffer.concat(chunks);
        const backend = backendFor(destination);
        const info = {
          destination: destination.directory,
          filename,
          path: path.join(destination.directory, filename),
          size: bytes.length,
        };
        if (backend) {
          try {
            backend.vfs.writeFile(`/uploads/${filename}`, bytes, { format: 'binary' });
            backend.flush(); // the upload is durable before it is reported
            cb(null, info);
          } catch (error) { cb(error); }
          return;
        }
        fs.promises.mkdir(destination.directory, { recursive: true })
          .then(() => fs.promises.writeFile(info.path, bytes))
          .then(() => cb(null, info), cb);
      });
    },
    _removeFile(req, file, cb) {
      let destination;
      try { destination = destinationFor(req); } catch { cb(null); return; }
      const backend = backendFor(destination);
      if (backend && file.filename) {
        try { backend.vfs.unlink(`/uploads/${file.filename}`); backend.flush(); } catch { /* already gone */ }
        cb(null);
        return;
      }
      if (file.path) fs.promises.unlink(file.path).then(() => cb(null), () => cb(null));
      else cb(null);
    },
  };
}

export function createPhextUploadsStatic({ currentRoot } = {}) {
  if (typeof currentRoot !== 'function') {
    throw new Error('createPhextUploadsStatic requires { currentRoot }');
  }
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { next(); return; }
    const root = currentRoot();
    const backend = root ? phextFsBackendFor(path.join(root, 'uploads')) : undefined;
    if (!backend) { next(); return; }
    let name;
    try { name = decodeURIComponent(req.path); } catch { next(); return; }
    // Mirror express.static's refusals: traversal and dotfiles fall
    // through to the disk handler (which refuses them there too).
    if (!name || name === '/' || name.includes('\\') || name.includes('\0')
      || name.split('/').some(part => part === '..' || part.startsWith('.'))) { next(); return; }
    const vfsPath = `/uploads${name}`;
    let stat;
    try { stat = backend.vfs.stat(vfsPath); } catch { next(); return; }
    if (!stat || stat.type !== 'file') { next(); return; }
    const bytes = backend.vfs.readFile(vfsPath);
    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'public, max-age=0');
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(bytes);
  };
}
