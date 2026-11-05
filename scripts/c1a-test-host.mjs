// Isolated process-death qualification host; not mounted by the application.
// Phext-only cutover: the proof root is a Cavern — the host opens
// its cavern.phext and registers the phext backends before serving
// the native routes, exactly as cavern-lifecycle does.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PhextVFS } from '../dist/src/phext/vfs.js';
import { registerPhextFs } from '../dist/server/phext-fs.mjs';
import { createNativeDocumentStoreRouter } from '../dist/server/native-document-store.mjs';

const root = process.env.PROOF_ROOT;
const phextPath = path.join(root, 'cavern.phext');
const fresh = !fs.existsSync(phextPath);
const vfs = PhextVFS.openOrCreate(phextPath);
registerPhextFs({ root, vfs });
const gates = await import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
gates.registerPhextBackend({ root, vfs });
if (fresh) {
  vfs.mkdir('/notes');
  vfs.mkdir('/other');
  vfs.flush();
}

const app = express();
app.use('/api/native', createNativeDocumentStoreRouter({
  root, readOnly: false, fault: async stage => {
    if (stage === process.env.PROOF_HOLD) { process.stdout.write(JSON.stringify({ held: stage }) + '\n'); await new Promise(() => {}); }
  },
}));
const server = app.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({ port: server.address().port }) + '\n'));
