/**
 * The /upload endpoint and /uploads static route, phext-backed
 * (Phase 3b; the only upload path since the phext-only cutover).
 *
 * Uploads were the last authored content living outside the phext:
 * multer wrote image files to a real `<cavern>/uploads/` directory
 * and express.static served them back from disk. Both halves now
 * live in the Cavern's phext, embedded — the settled media ruling:
 * binary content, base64-chunked per chunk exactly like Phase 2's
 * managed assets (stratum 6's encoding), stored at the file's
 * natural VFS path `/uploads/<name>` (the VFS assigns strata by
 * path, and the path is what export must restore).
 *
 * - `createPhextUploadStorage({ destinationFor })` is a multer
 *   storage engine with diskStorage's call contract: the caller
 *   resolves the destination per request (Cavern + session checks
 *   stay with the caller, exactly as the old destination callback
 *   had them), filenames keep the historical `Date.now() + ext`
 *   shape, and the file info multer reports — destination,
 *   filename, path, size — matches the disk engine's. Since the
 *   cutover there is no disk branch: a destination no Cavern phext
 *   covers is an explicit error, never a silent disk write.
 * - Upload size is capped in two places (H3): multer's `limits`
 *   in server/index.ts refuse oversize requests at the boundary,
 *   and this engine enforces MAX_UPLOAD_FILE_BYTES itself, since
 *   it is also reachable directly (tests, other callers). Past
 *   the cap the engine drops bytes instead of buffering them and
 *   refuses the file whole at end of stream — never a truncated
 *   write into the phext.
 * - `createPhextUploadsStatic({ currentRoot })` serves GET/HEAD
 *   /uploads/* from the registered Cavern's VFS and falls through
 *   to the next handler (which 404s) whenever anything is not a
 *   phext-resident file: no Cavern, no file.
 *
 * server/index.ts loads this module by URL, the house pattern for
 * phext modules.
 */
import path from 'node:path';
import { phextFsBackendFor } from './phext-fs.mjs';

const CONTENT_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

/**
 * H3 (bug hunt, 2026-11-05): the upload ceilings. The per-file cap
 * matches the native-document scale (20 MiB). The client's one
 * /upload call site posts a single image per request
 * (universe-block's saveImageToServer), so the files cap carries
 * generous headroom over real behaviour while a single request's
 * worst case stays small.
 */
export const MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 8;

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
      let size = 0, overflow = false, settled = false;
      const done = (error, info) => { if (settled) return; settled = true; cb(error, info); };
      file.stream.on('data', chunk => {
        size += chunk.length;
        // H3, defence in depth: past the cap, drop the bytes (the
        // stream still drains) and refuse the file whole at 'end'.
        if (size > MAX_UPLOAD_FILE_BYTES) { overflow = true; chunks.length = 0; return; }
        chunks.push(chunk);
      });
      file.stream.on('error', error => done(error));
      file.stream.on('end', () => {
        if (overflow) {
          done(new Error(`Upload exceeds the ${MAX_UPLOAD_FILE_BYTES}-byte (20 MiB) per-file limit.`));
          return;
        }
        const bytes = Buffer.concat(chunks);
        const backend = backendFor(destination);
        const info = {
          destination: destination.directory,
          filename,
          path: path.join(destination.directory, filename),
          size: bytes.length,
        };
        if (!backend) {
          done(new Error('Uploads are stored in the current Cavern\u2019s phext; no Cavern phext covers this destination.'));
          return;
        }
        try {
          backend.vfs.writeFile(`/uploads/${filename}`, bytes, { format: 'binary' });
          backend.flush(); // the upload is durable before it is reported
          done(null, info);
        } catch (error) { done(error); }
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
      cb(null);
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
    // through to the next handler (which 404s; nothing serves
    // uploads from disk any more).
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
