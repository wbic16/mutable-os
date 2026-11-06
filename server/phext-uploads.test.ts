// @vitest-environment node
/**
 * H3 regression (bug hunt, 2026-11-05): /upload had no size or
 * file-count limits anywhere, and the phext engine buffered every
 * file whole in memory. The caps now live in two places — multer's
 * `limits` at the route boundary (server/index.ts, using these
 * same constants) and inside the engine itself, since the engine
 * is also reachable directly. A refusal must surface as the app's
 * JSON envelope ({ Success: false, Error }), not an HTML error
 * page or a hang; a normal upload must still land in the phext.
 */
import { afterEach, expect, it } from 'vitest';
import express from 'express';
import multer from 'multer';
import { promises as realFs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { PhextVFS } from '../src/phext/vfs';
import { registerPhextFs, unregisterPhextFs } from './phext-fs.mjs';
import { createPhextUploadStorage, MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_FILES } from './phext-uploads.mjs';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f().catch(() => {}); });

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngOfSize = (size: number) => Buffer.concat([PNG_HEAD, Buffer.alloc(size - PNG_HEAD.length, 7)]);

it('upload caps: the engine refuses oversize whole, the route refuses with the JSON envelope, a normal upload lands (H3)', { timeout: 60000 }, async () => {
  expect(MAX_UPLOAD_FILE_BYTES).toBe(20 * 1024 * 1024);
  const root = await realFs.realpath(await realFs.mkdtemp(path.join(os.tmpdir(), 'phext-upload-caps-')));
  cleanup.push(async () => { await realFs.rm(root, { recursive: true, force: true }); });
  const vfs = PhextVFS.openOrCreate(path.join(root, 'cavern.phext'));
  cleanup.push(async () => { vfs.close(); });
  registerPhextFs({ root, vfs });
  cleanup.push(async () => { unregisterPhextFs(root); });

  const storage = createPhextUploadStorage({ destinationFor: () => ({ root, directory: path.join(root, 'uploads') }) });
  const handleFile = (bytes: Buffer, name = 'pic.png') => new Promise<any>((resolve, reject) => {
    (storage as any)._handleFile({}, { originalname: name, stream: Readable.from([bytes]) },
      (error: any, info: any) => error ? reject(error) : resolve(info));
  });

  // Engine, direct: one byte over the cap is refused whole and
  // nothing is written into the phext.
  await expect(handleFile(pngOfSize(MAX_UPLOAD_FILE_BYTES + 1), 'big.png'))
    .rejects.toThrow(/per-file limit/);
  expect(vfs.stat('/uploads')).toBeUndefined();

  // Engine, direct: a normal file lands and reads back identical.
  const small = pngOfSize(8192);
  const info = await handleFile(small);
  expect(info.size).toBe(small.length);
  expect(vfs.readFile(`/uploads/${info.filename}`).equals(small)).toBe(true);

  // Route wiring, shaped exactly as server/index.ts mounts it:
  // same limits constants, the array field, the envelope on error.
  const app = express();
  const uploadImages = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_FILE_BYTES, files: MAX_UPLOAD_FILES },
  }).array('image');
  app.post('/upload', (req, res) => {
    uploadImages(req, res, (err: any) => {
      if (err) { res.status(400).json({ Success: false, Error: err.message }); return; }
      res.json((req as any).files);
    });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  cleanup.push(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = async (form: FormData) => {
    const response = await fetch(`${base}/upload`, { method: 'POST', body: form });
    return { status: response.status, body: await response.json() as any };
  };

  // Oversize over HTTP: the JSON envelope, not a hang or a page.
  const bigForm = new FormData();
  bigForm.append('image', new Blob([pngOfSize(MAX_UPLOAD_FILE_BYTES + 1)], { type: 'image/png' }), 'big.png');
  const big = await post(bigForm);
  expect(big.status).toBe(400);
  expect(big.body.Success).toBe(false);
  expect(typeof big.body.Error).toBe('string');
  expect(big.body.Error.length).toBeGreaterThan(0);

  // Too many files in one request: also the envelope.
  const manyForm = new FormData();
  for (let i = 0; i < MAX_UPLOAD_FILES + 1; i++) {
    manyForm.append('image', new Blob([pngOfSize(64)], { type: 'image/png' }), `p${i}.png`);
  }
  const many = await post(manyForm);
  expect(many.status).toBe(400);
  expect(many.body.Success).toBe(false);

  // A normal upload over HTTP still lands in the phext.
  const okForm = new FormData();
  okForm.append('image', new Blob([small], { type: 'image/png' }), 'ok.png');
  const ok = await post(okForm);
  expect(ok.status).toBe(200);
  expect(ok.body).toHaveLength(1);
  expect(ok.body[0].size).toBe(small.length);
  expect(vfs.readFile(`/uploads/${ok.body[0].filename}`).equals(small)).toBe(true);
});
