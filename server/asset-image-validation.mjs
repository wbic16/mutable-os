import {setTimeout as delay} from 'node:timers/promises';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const IMAGE_LIMITS = { bytes: 10 * 1024 * 1024, batchBytes: 40 * 1024 * 1024, count: 20, pixels: 40000000, dimension: 16384 };
let active = 0;
/** Decode in a disposable process. Its output is metadata, never replacement bytes. */
export function validateImportedImage(bytes, signal, profile) {
  const limits=profile==='iiif-tile'?{...IMAGE_LIMITS,bytes:2*1024*1024,pixels:512*512,dimension:512}:profile==='dialectic-generated'?{...IMAGE_LIMITS,bytes:20000000}:IMAGE_LIMITS;
  if (!bytes.length || bytes.length > limits.bytes) return Promise.reject(Error('Image exceeds the byte limit.'));
  if (active >= 2) return Promise.reject(Error('Image validation is busy; retry.'));
  signal?.throwIfAborted(); active++;
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./asset-image-worker.mjs', import.meta.url)), [], { serialization: 'advanced', execArgv: ['--max-old-space-size=128'], stdio: ['ignore','ignore','ignore','ipc'] });
    let settled = false, released = false;
    const release = () => { if (!released) { released = true; active--; } };
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); child.kill('SIGKILL'); error ? reject(error) : resolve(result); };
    const abort = () => finish(Error('Image import cancelled.'));
    const timer = setTimeout(() => finish(Error('Image validation timed out.')), 10000);
    signal?.addEventListener('abort', abort, { once: true });
    child.once('exit', () => { release(); finish(Error('Image validator exited.')); });
    child.once('error', error => { release(); finish(error); });
    child.once('message', result => result.error ? finish(Error(result.error)) : finish(undefined, result));
    child.send(profile==='iiif-tile'||profile==='dialectic-generated'?{bytes,limits}:bytes);
  });
}

let tilePending=0;
export async function validateIIIFTile(bytes,signal){
 if(tilePending>=8)throw Error('Tile validation queue is full');tilePending++;
 try{while(active>=2)await delay(10,undefined,{signal});return await validateImportedImage(bytes,signal,'iiif-tile');}finally{tilePending--;}
}
