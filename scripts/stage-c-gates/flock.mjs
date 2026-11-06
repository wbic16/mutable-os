/**
 * Nonblocking file locking for the stage-C gates, with a portable fallback.
 *
 * Prefers the native fs-ext flock(2) binding, loaded lazily at the lock
 * call site via createRequire so that neither Node nor a dev-server
 * module pipeline ever has to resolve the optional package for the
 * module to load: fs-ext's compiled binding is absent wherever install
 * scripts did not run (the deployed host, this repo's dev VM), and a
 * static import made the whole filesystem module — and every
 * application service importing it — fail with ERR_MODULE_NOT_FOUND in
 * those environments. When the binding is usable
 * the native path is exactly the historical one: a promisified
 * `flock(fd, 'shnb' | 'exnb')` whose errors propagate untouched, released
 * by closing the descriptor.
 *
 * When the binding is absent, locks are coordinated by token files in the
 * system temp directory, keyed by the target file's identity (dev+ino,
 * hashed) — the same identity lockFile has already verified — following
 * the protocol shape of src/knowledge-sqlite/advisory-lock.mjs:
 *
 * - A momentary per-identity mutex token (O_EXCL creation, holder pid in
 *   its content, recovered once that pid is dead) serializes the
 *   check-and-grant section. It is retried briefly and asynchronously so
 *   contention for the mutex itself never masquerades as lock contention;
 *   the section it guards is a few synchronous filesystem calls.
 * - Under the mutex, dead holders' tokens are pruned (pid no longer
 *   lives) and the request is granted or refused by the flock rules: an
 *   exclusive request is refused while any live holder exists, a shared
 *   request while any live exclusive holder exists. Refusal throws an
 *   error with code 'EWOULDBLOCK', matching what callers already handle
 *   from the native path. A granted holder leaves a token naming its pid
 *   and mode; release removes exactly that token, again under the mutex.
 * - A crashed holder cannot wedge the lock: its token's pid is dead, so
 *   the next contender prunes it. Pid reuse can make a dead holder look
 *   alive; that fails safe (a contention report), never unsafe.
 *
 * One semantic delta from native flock, inherent to any pid-keyed token
 * scheme: a native lock is a property of the open file description, so
 * the descriptor this module's caller passes to the forked filesystem
 * worker keeps OS exclusion alive even if the acquiring process dies
 * mid-write. A fallback token is a property of the acquiring process —
 * when it dies the token becomes recoverable even if a worker it forked
 * is still exiting. That window is bounded by the worker itself, which
 * exits on IPC disconnect as soon as its parent dies.
 */
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);

let fsExtTried = false;
let nativeFlock = null;
function loadNativeFlock() {
  if (!fsExtTried) {
    fsExtTried = true;
    try {
      const mod = require('fs-ext');
      if (typeof mod?.flock === 'function') nativeFlock = mod.flock;
    } catch { nativeFlock = null; /* optional native capability absent */ }
  }
  return nativeFlock;
}

const contended = () => Object.assign(
  Error('EWOULDBLOCK: file lock is held by another process'),
  { code: 'EWOULDBLOCK' });

const tokenDir = () => fs.realpathSync(os.tmpdir());
const tokenPrefix = identity =>
  `mutable-gates-${createHash('sha256').update(`${identity.dev}:${identity.ino}`).digest('hex')}-`;

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // ESRCH: no such process — dead; anything else fails safe
}

// A mutex token whose pid field never landed (holder died between create
// and write) is only trusted as stale once it is clearly old; a fresh one
// is treated as held, matching the window a live creator needs.
const TOKEN_WRITE_GRACE_MS = 60000;

function mutexIsStale(mutexPath) {
  let raw;
  try { raw = fs.readFileSync(mutexPath, 'utf8'); }
  catch (e) { return e.code === 'ENOENT'; }
  const pid = Number.parseInt(raw.trim(), 10);
  if (Number.isInteger(pid) && pid > 0) return pid !== process.pid && !pidAlive(pid);
  try { return Date.now() - fs.statSync(mutexPath).mtimeMs > TOKEN_WRITE_GRACE_MS; }
  catch (e) { return e.code === 'ENOENT'; }
}

async function acquireMutex(prefix) {
  const mutexPath = path.join(tokenDir(), `${prefix}mutex.lock`);
  for (let attempt = 0; attempt < 250; attempt++) {
    let fd;
    try {
      fd = fs.openSync(mutexPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (mutexIsStale(mutexPath)) {
        try { fs.unlinkSync(mutexPath); } catch { /* a peer may recover it first */ }
        continue;
      }
      await new Promise(resolve => setTimeout(resolve, 2));
      continue;
    }
    try { fs.writeSync(fd, `${process.pid}\n`); } finally { fs.closeSync(fd); }
    let released = false;
    return () => {
      if (released) return; released = true;
      try {
        if (Number.parseInt(fs.readFileSync(mutexPath, 'utf8').trim(), 10) === process.pid)
          fs.unlinkSync(mutexPath);
      } catch { /* token already gone or replaced — leave the current holder's alone */ }
    };
  }
  // The guarded section is microseconds long; exhausting the retry budget
  // means a live holder is wedged, and contention is the honest report.
  throw contended();
}

function listHolders(prefix) {
  const dir = tokenDir();
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const holders = [];
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.lock') || name === `${prefix}mutex.lock`) continue;
    const parts = name.slice(prefix.length, -'.lock'.length).split('-');
    if (parts.length !== 3) continue;
    const pid = Number.parseInt(parts[0], 10);
    if (!Number.isInteger(pid) || pid <= 0 || (parts[1] !== 'sh' && parts[1] !== 'ex')) continue;
    holders.push({ path: path.join(dir, name), pid, mode: parts[1] });
  }
  return holders;
}

async function acquireTokenLock(identity, shared) {
  const prefix = tokenPrefix(identity);
  const mode = shared ? 'sh' : 'ex';
  const myPath = path.join(tokenDir(),
    `${prefix}${process.pid}-${mode}-${randomBytes(8).toString('hex')}.lock`);
  const releaseMutex = await acquireMutex(prefix);
  try {
    const live = [];
    for (const holder of listHolders(prefix)) {
      if (pidAlive(holder.pid)) live.push(holder);
      else try { fs.unlinkSync(holder.path); } catch { /* a peer may prune it first */ }
    }
    if (live.some(holder => mode === 'ex' || holder.mode === 'ex')) throw contended();
    const fd = fs.openSync(myPath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    try { fs.writeSync(fd, `${process.pid}\n`); } finally { fs.closeSync(fd); }
  } finally { releaseMutex(); }
  let released = false;
  return async () => {
    if (released) return; released = true;
    try {
      const releaseMutex = await acquireMutex(prefix);
      try { fs.unlinkSync(myPath); } catch { /* already pruned or gone */ }
      finally { releaseMutex(); }
    } catch {
      // Best effort only: the uniquely named token can be removed without
      // the mutex, and a token left behind is pruned once this pid dies.
      try { fs.unlinkSync(myPath); } catch { /* already gone */ }
    }
  };
}

/**
 * Take a nonblocking lock on an already-open descriptor, mirroring
 * `flock(fd, shared ? 'shnb' : 'exnb')`. `identity` is the descriptor's
 * verified { dev, ino } (see fileIdentity in ./filesystem.mjs); it keys
 * the fallback token set and is unused on the native path. Resolves to
 * the release function: a no-op natively (closing the descriptor drops
 * the flock, as before), a token removal in fallback mode. Call it
 * before closing the descriptor.
 */
export async function flockDescriptor(fd, identity, shared = false) {
  const flock = loadNativeFlock();
  if (flock) {
    await new Promise((resolve, reject) =>
      flock(fd, shared ? 'shnb' : 'exnb', e => e ? reject(e) : resolve()));
    return async () => {};
  }
  return acquireTokenLock(identity, shared);
}
