import { Worker } from 'node:worker_threads';
import { inspectVaultScope, lockVaultEstablishment } from './vault-scope.mjs';
import { flockExclusiveSync } from './advisory-lock.mjs';
import { writerLock } from './paths.mjs';
import { phextKnowledgeFor } from './phext-registry.mjs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PhextVFS Phase 4 writer lease: a flock on the writer lock's anchor
 * file beside the phext — the same anchor the gates backend computes
 * for the VFS path '/.mutable/writer.lock' (see
 * scripts/stage-c-gates/phext-backend.mjs), so the knowledge writer
 * lock is the same logical lock across layers. Held for the worker's
 * lifetime, exactly like paths.writerLock on disk (the native-mode
 * lease, granted by the same message when the worker's lease request
 * carries no phext path).
 */
function phextWriterLease(phextPath) {
  const anchor = path.join(path.dirname(phextPath),
    `${path.basename(phextPath)}.anchor-${createHash('sha256').update('/.mutable/writer.lock').digest('hex').slice(0, 16)}`);
  let fd, releaseLock;
  try {
    fd = fs.openSync(anchor, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (process.getuid && stat.uid !== process.getuid())) throw Error('Writer lease anchor is not a private regular file');
    releaseLock = flockExclusiveSync(fd, `${anchor}.holder`);
  } catch (e) {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* already closed */ }
    throw Error(`SQLite writer unavailable: ${e.message}`);
  }
  let released = false;
  return () => { if (released) return; released = true; try { releaseLock(); } finally { fs.closeSync(fd); } };
}

/** One vault-owned worker, independent of editor occurrences. No raw SQL transport. */
export async function openSqliteFoundation(options) {
  const { timeoutMs = 30000, ...configuration } = options;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw Error('Invalid worker timeout');
  // Selector readers open an existing DB only. They neither establish a Vault
  // nor acquire a writer/indexing lease, so they must not scan its documents.
  if(configuration.entityReader && (!configuration.readOnly || configuration.initialize))throw Error('Entity readers must be read-only');
  // Mode selection: resolve the Cavern's knowledge mode before
  // scope inspection. A registered lifecycle instance wins (the
  // lifecycle registers phext-mode Caverns only); an explicit path
  // (or `true` for the default cavern.phext) is honored. With no
  // phext signal at all, the Cavern's own records decide — the
  // same derivation the lifecycle applies (design §2.4): a
  // phext-side record of phext mode governs (even beside a stale
  // native record left by an upgrade — §4.3's frozen snapshot
  // must never be written by a direct open); a recorded native
  // marker, or a plain disk layout, opens the disk foundation; a
  // phext-only layout opens the phext; both stores present with
  // no governing record refuses, because the disk copy may be a
  // frozen post-upgrade snapshot. The resolved absolute
  // path rides workerData into the worker; no path rides for a
  // native-mode Cavern, and the worker opens the disk foundation.
  const registered = configuration.vault ? phextKnowledgeFor(configuration.vault) : undefined;
  let phextPath = typeof configuration.phextKnowledge === 'string' ? configuration.phextKnowledge
    : registered?.phextPath ?? (configuration.phextKnowledge === true ? (configuration.vault ? path.join(configuration.vault, 'cavern.phext') : undefined) : undefined);
  if (configuration.phextKnowledge && !phextPath) throw Error('Phext knowledge mode requires a vault phext path');
  if (!phextPath && configuration.vault) {
    const vault = configuration.vault;
    let nativeRecorded = false;
    try { nativeRecorded = JSON.parse(fs.readFileSync(path.join(vault, '.mutable', 'cavern-state.json'), 'utf8'))?.mode === 'native'; } catch { /* no marker */ }
    const hasPhext = fs.existsSync(path.join(vault, 'cavern.phext'));
    const hasDiskKnowledge = fs.existsSync(path.join(vault, '.mutable', 'mutable.db'));
    // A `.mutable` home that exists but holds nothing at all is a
    // documents home, not knowledge infrastructure: the folder is
    // an app Cavern whose knowledge was never on disk. (A home
    // carrying ANY content is the opposite case — a partial disk
    // home — and the disk derivation below stands for it, so the
    // scope inspection refuses it fail-closed.)
    let emptyDocumentsHome = false;
    try { const homeStat = fs.lstatSync(path.join(vault, '.mutable')); emptyDocumentsHome = homeStat.isDirectory() && !homeStat.isSymbolicLink() && fs.readdirSync(path.join(vault, '.mutable')).length === 0; } catch { /* no documents home */ }
    // The recorded mode governs (§2.4/§4.3): a phext-side record
    // of phext mode decides even when a native record also
    // exists — the upgrade leaves the native era's marker beside
    // its own commit-point record, and a direct open must never
    // write the frozen snapshot DB. Reading the record takes a
    // brief read-only VFS open; an unreadable phext records
    // nothing and the layout rules below decide.
    let phextRecorded = false, phextEstablished = false;
    if (hasPhext) {
      try {
        const { PhextVFS } = await import(new URL('../../dist/src/phext/vfs.js', import.meta.url));
        const vfs = PhextVFS.open(path.join(vault, 'cavern.phext'));
        try {
          try { phextRecorded = JSON.parse(vfs.readTextFile('/.control/cavern-state.json'))?.mode === 'phext'; } catch { /* no phext-side mode record */ }
          // The phext's knowledge control record is its own
          // establishment record (the foundation's test: control
          // present ⇔ knowledge established) — distinct from the
          // lifecycle's mode marker read above.
          try { phextEstablished = typeof JSON.parse(vfs.readTextFile('/.mutable/knowledge.json'))?.vaultGuid === 'string'; } catch { /* no established phext knowledge */ }
        }
        finally { vfs.close(); }
      } catch { /* no readable phext record */ }
    }
    // A restore destination takes the mode its own record/layout
    // resolves to — a registered or phext-recorded destination
    // converts into the phext, a native-recorded one restores to
    // disk (the rollback round trip), and an ambiguous layout
    // refuses. The one case with nothing of its own to derive
    // from is a restore into an UNESTABLISHED destination (no
    // marker, neither layout): that restore is a setup, not an
    // open, so the snapshot's recorded provenance decides — a
    // phext-born snapshot converts into the phext (the cutover's
    // restore contract, and the §2.3 default for a new Cavern);
    // a disk-born snapshot restores to disk. A snapshot with no
    // recorded provenance predates mode selection; the backups
    // of the phext-only era are phext-born, so it converts too.
    // (The earlier step-3 fall-through sent this case to disk
    // unconditionally, minting a `.mutable` home for a phext-born
    // snapshot — the regression phext-worker.test.mjs caught.)
    if (phextRecorded) phextPath = path.join(vault, 'cavern.phext');
    else if (!nativeRecorded && hasPhext && hasDiskKnowledge && phextEstablished) {
      // The phext's knowledge is established (its control record
      // is present) and no marker governs, so the disk database
      // beside it is unconverted knowledge, not a frozen snapshot:
      // refuse it explicitly — conversion is the way in. (A
      // recorded phext mode, handled above, makes the same
      // coexistence the normal post-upgrade state instead.)
      throw Error('This vault holds an established phext knowledge store and an unconverted disk knowledge home (.mutable/mutable.db); the phext store is canonical — convert the disk home explicitly or remove it, do not open beside it');
    }
    else if (!nativeRecorded && hasPhext && hasDiskKnowledge) {
      throw Error('This vault holds both a phext store and a disk knowledge home (.mutable/mutable.db), and no recorded mode says the disk copy is current; open the Cavern through the server so the recorded mode governs');
    }
    else if (!nativeRecorded && hasPhext && !hasDiskKnowledge) phextPath = path.join(vault, 'cavern.phext');
    else if (configuration.restoreFrom && !nativeRecorded && !hasPhext && !hasDiskKnowledge) {
      let sourceMode;
      try { sourceMode = JSON.parse(fs.readFileSync(path.join(configuration.restoreFrom, 'snapshot.json'), 'utf8'))?.sourceMode; }
      catch { /* provenance unreadable; the worker's restore validation refuses a malformed snapshot itself */ }
      if (sourceMode !== 'native') phextPath = path.join(vault, 'cavern.phext');
    }
    else if (configuration.initialize && !nativeRecorded && !hasPhext && !hasDiskKnowledge && emptyDocumentsHome) {
      // §2.4's "neither" row for an app Cavern folder: a documents
      // home is present but no knowledge store exists in either
      // mode, so this Cavern's knowledge is unestablished and an
      // initializing open is a setup — it follows the new-Cavern
      // default (§2.3, phext). A bare folder with no home at all
      // keeps the disk fall-through (upstream vault semantics),
      // and a home carrying any content is a partial disk home:
      // the disk derivation stands and the scope inspection
      // refuses it fail-closed.
      phextPath = path.join(vault, 'cavern.phext');
    }
  }
  if (phextPath) configuration.phextKnowledge = phextPath;
  else delete configuration.phextKnowledge;
  let releaseScope;
  if(!configuration.entityReader){
   for(let attempt=0;;attempt++){try{releaseScope=lockVaultEstablishment();break;}catch(e){if(!['EAGAIN','EWOULDBLOCK'].includes(e.code)||attempt>=100)throw e;await new Promise(resolve=>setTimeout(resolve,20));}}
   try{inspectVaultScope(configuration.vault, phextPath ? {phextKnowledge:true} : undefined);}catch(e){releaseScope();throw e;}
  }
  let worker;try{worker = new Worker(path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker.mjs'), { workerData: {...configuration,scopeValidated:true} });}catch(e){releaseScope?.();throw e;}
  const pending = new Map(); let next = 0, pendingBytes = 0, dead = false, closing = false, startup, unlock;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const exited = new Promise(resolve => worker.once('exit', resolve));
  function fail(error) {
    if (dead) return; dead = true; clearTimeout(startup); readyReject(error);
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); pendingBytes = 0;
  }
  const terminate = async () => { fail(Error('SQLite worker terminated; in-flight mutation outcome may be unknown')); await worker.terminate(); };
  startup = setTimeout(() => { fail(Error('SQLite worker startup timed out')); void worker.terminate(); }, timeoutMs);
  worker.on('error', fail);
  worker.on('exit', code => { unlock?.(); fail(Error(`SQLite worker exited (${code}); no automatic replay`)); });
  worker.on('message', message => {
    if (message.leaseRequest) {
      if (dead) return;
      try { if (unlock) throw Error('Duplicate writer lease request'); unlock = message.phextKnowledge ? phextWriterLease(message.phextKnowledge) : writerLock(message.home); worker.postMessage({ leaseGranted: true }); }
      catch (e) { worker.postMessage({ leaseError: e.message }); }
      return;
    }
    if (message.ready) { clearTimeout(startup); readyResolve(message); return; }
    if (message.startupError) { fail(Error(message.startupError)); return; }
    const task = pending.get(message.id); if (!task) return;
    pending.delete(message.id); pendingBytes -= task.byteSize; clearTimeout(task.timer);
    if (message.error) task.reject(Error(message.error)); else task.resolve(message.value);
  });
  try { await ready; } catch (e) { await worker.terminate(); throw e; } finally { releaseScope?.(); }
  const request = (operation, directory, payload) => {
    if (dead || closing) return Promise.reject(Error('SQLite worker is closed'));
    if (pending.size >= 32) return Promise.reject(Error('SQLite worker queue is full'));
    const byteSize=payload?.bytes?.byteLength??0;
    if(byteSize>20*1024*1024||pendingBytes+byteSize>40*1024*1024)return Promise.reject(Error('Saved indexing byte budget exceeded'));
    return new Promise((resolve, reject) => {
      const id = ++next, timer = setTimeout(() => { fail(Error('SQLite operation timed out; outcome may be unknown, inspect before retrying')); void worker.terminate(); }, timeoutMs);
      pendingBytes+=byteSize;pending.set(id, { resolve, reject, timer, byteSize });
      try {worker.postMessage({ id, operation, directory, payload });}
      catch(e){pending.delete(id);pendingBytes-=byteSize;clearTimeout(timer);reject(e);}
    });
  };
  const cancellable=(operation,payload,signal)=>{
    if(!signal)return request(operation,undefined,payload);
    if(signal.aborted)return Promise.reject(signal.reason??Error('Saved indexing canceled'));
    const cancellation=new Int32Array(new SharedArrayBuffer(4));
    const cancel=()=>Atomics.store(cancellation,0,1);signal.addEventListener('abort',cancel,{once:true});
    return request(operation,undefined,{...payload,cancellation}).finally(()=>signal.removeEventListener('abort',cancel));
  };
  return {
    // Internal host capabilities; not exposed through a browser/request route.
    inventory:()=>request('inventory'),resourceProjection:resourceId=>request('resource-projection',undefined,{resourceId}),
    cardex:(payload,signal)=>cancellable('cardex',payload,signal),
    propositions:(payload,signal)=>cancellable('propositions',payload,signal),
    entities:(payload,signal)=>cancellable('entities',payload,signal),
    packageData:(payload,signal)=>cancellable('package-data',payload,signal),
    entityLookup:(payload,signal)=>cancellable('entity-lookup',payload,signal),
    semantics:(payload,signal)=>cancellable('semantics',payload,signal),
    auditStatus:()=>request('audit-status'),
    operationOutcome:operationId=>request('operation-outcome',undefined,{operationId}),
    deliverAudit:(payload={},signal)=>cancellable('audit-deliver',payload,signal),
    evidenceSource:(payload,signal)=>cancellable('evidence-source',payload,signal),
    knowledgeRevision:()=>request('knowledge-revision'),
    readKnowledge:(payload,signal)=>cancellable('knowledge-read',payload,signal),
    indexStatus:()=>request('index-status'),
    inspectSaved:(payload,signal)=>cancellable('inspect-saved',payload,signal),stageSaved:(payload,signal)=>cancellable('stage-saved',payload,signal),
    commitSaved:(token,signal)=>cancellable('commit-saved',{token},signal),discardSaved:token=>request('discard-saved',undefined,{token}),
    deletionBaseline:resourceId=>request('deletion-baseline',undefined,{resourceId}),removeConfirmed:(resourceId,expected)=>request('remove-confirmed',undefined,{resourceId,expected}),
    indexIssue:(path,reason)=>request('index-issue',undefined,{path,reason}),
    finishReconciliation:()=>request('finish-reconciliation'),
    inspect: () => request('inspect'), verify: () => request('verify'),
    knowledgeCacheFile: () => request('knowledge-cache-file'),
    rebuildFts: () => request('rebuild-fts'), clearDerived: () => request('clear-derived'),
    backup: directory => request('backup', directory), terminate,
    async close() { if (dead) { await exited; return; } if (closing) { await exited; return; } const done = request('close'); closing = true; try { await done; } finally { await exited; } },
  };
}

/** Termination affects only this read-only query; never terminates the canonical writer. */
export function runCardexRegex(file,request,signal,{timeoutMs=2000}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason??Error('Search cancelled'));return;}
  const worker=new Worker(path.join(path.dirname(fileURLToPath(import.meta.url)),'cardex-regex-worker.mjs'),{workerData:{file,request}});let finished=false;
  const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);void worker.terminate();error?reject(error):resolve(result);};
  const abort=()=>finish(signal.reason??Error('Search cancelled'));
  const timer=setTimeout(()=>finish(Error('Regex exceeded its two-second budget; simplify the pattern or narrow the filters')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});worker.on('message',m=>finish(m.error?Error(m.error):null,m.result));worker.on('error',e=>finish(e));worker.on('exit',code=>{if(!finished)finish(Error('Regex reader stopped ('+code+')'));});
 });
}
