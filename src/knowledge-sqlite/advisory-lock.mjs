/**
 * Cross-process advisory locking for the SQLite knowledge store.
 *
 * Prefers the native fs-ext flock(2) binding when it is actually usable.
 * fs-ext is an optional dependency and its compiled binding is absent from
 * deployments installed without install scripts (and from hosts where the
 * node-gyp build failed), so requiring it can fail outright. In that case
 * this module falls back to a portable token-file lock: the holder creates
 * the token with O_EXCL (atomic on POSIX filesystems) and records its pid;
 * a later contender treats the token as live while that pid lives and
 * recovers it once the pid is dead. Only a genuine contention outcome —
 * EWOULDBLOCK/EAGAIN from flock, or a live holder's token — is reported as
 * contention (code 'EWOULDBLOCK'); every other failure propagates as-is.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let fsExtTried = false;
let fsExtFlockSync = null;
function nativeFlockSync() {
  if (!fsExtTried) {
    fsExtTried = true;
    try {
      const mod = require('fs-ext');
      if (typeof mod?.flockSync === 'function') fsExtFlockSync = mod.flockSync;
    } catch { fsExtFlockSync = null; /* optional native capability absent */ }
  }
  return fsExtFlockSync;
}

const contended = () => Object.assign(
  Error('EWOULDBLOCK: advisory lock is held by another process'),
  { code: 'EWOULDBLOCK' });

// A token whose pid field never landed (holder died between create and
// write) is only trusted as stale once it is clearly old; a fresh token is
// treated as held, matching the window a live creator needs to record its
// pid. Pid reuse can make a dead holder look alive; that fails safe (a
// contention report) rather than unsafe (two holders).
const TOKEN_WRITE_GRACE_MS = 60000;

function tokenHolderPid(tokenPath) {
  let raw;
  try { raw = fs.readFileSync(tokenPath, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return 'gone';
    throw e;
  }
  const pid = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function tokenIsStale(tokenPath) {
  let pid;
  try { pid = tokenHolderPid(tokenPath); } catch { return false; }
  if (pid === 'gone') return true;
  if (pid === null) {
    try { return Date.now() - fs.statSync(tokenPath).mtimeMs > TOKEN_WRITE_GRACE_MS; }
    catch (e) { return e.code === 'ENOENT'; }
  }
  if (pid === process.pid) return false; // a separate flock open description would contend too
  try { process.kill(pid, 0); return false; }        // alive (or owned by another user via EPERM below)
  catch (e) { return e.code === 'ESRCH'; }           // ESRCH: no such process — stale
}

function acquireTokenLock(tokenPath) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let fd;
    try {
      fd = fs.openSync(tokenPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (!tokenIsStale(tokenPath)) throw contended();
      try { fs.unlinkSync(tokenPath); } catch { /* a peer may recover it first; the retry decides */ }
      continue;
    }
    try { fs.writeSync(fd, `${process.pid}\n`); } finally { fs.closeSync(fd); }
    let released = false;
    return () => {
      if (released) return; released = true;
      try { if (tokenHolderPid(tokenPath) === process.pid) fs.unlinkSync(tokenPath); }
      catch { /* token already gone or replaced — leave the current holder's token alone */ }
    };
  }
  throw contended();
}

/**
 * Take an exclusive advisory lock associated with an already-open rendezvous
 * file descriptor (the caller owns the fd and closes it on release, which is
 * what drops a native flock). `tokenPath` names the fallback token file,
 * used only when the native binding is unavailable. Returns the release
 * function for the fallback layer; call it before closing the fd.
 */
export function flockExclusiveSync(fd, tokenPath) {
  const flockSync = nativeFlockSync();
  if (flockSync) {
    try { flockSync(fd, 'exnb'); }
    catch (e) {
      if (e.code === 'EWOULDBLOCK' || e.code === 'EAGAIN') throw contended();
      throw e;
    }
    return () => {};
  }
  return acquireTokenLock(tokenPath);
}
