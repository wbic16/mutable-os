import { Worker } from 'node:worker_threads';
import { inspectVaultScope, lockVaultEstablishment } from './vault-scope.mjs';
import { flockExclusiveSync } from './advisory-lock.mjs';
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
 * lifetime; the disk writer lock it mirrors is deleted with the
 * phext-only cutover.
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
  // Phext-only (cutover): knowledge always lives in the vault's
  // cavern.phext. A registered lifecycle path wins; an explicit
  // path (or `true`) is honored; otherwise the default
  // <vault>/cavern.phext is used. The resolved absolute path rides
  // workerData into the worker.
  const phextPath = typeof configuration.phextKnowledge === 'string' ? configuration.phextKnowledge
    : (configuration.vault ? (phextKnowledgeFor(configuration.vault)?.phextPath ?? path.join(configuration.vault, 'cavern.phext')) : undefined);
  if (phextPath) configuration.phextKnowledge = phextPath;
  else throw Error('Phext knowledge mode requires a vault phext path');
  // Upgrade-on-encounter belongs to the Cavern lifecycle (it
  // converts the whole tree, not just knowledge). A vault that
  // still holds a disk knowledge home has not been converted;
  // refuse here rather than mint fresh phext knowledge beside it
  // and silently orphan the disk state.
  if (configuration.vault && fs.existsSync(path.join(configuration.vault, '.mutable', 'mutable.db'))) {
    throw Error('This vault still holds disk knowledge (.mutable/mutable.db); open the Cavern through the server once to convert it to phext');
  }
  let releaseScope;
  if(!configuration.entityReader){
   for(let attempt=0;;attempt++){try{releaseScope=lockVaultEstablishment();break;}catch(e){if(!['EAGAIN','EWOULDBLOCK'].includes(e.code)||attempt>=100)throw e;await new Promise(resolve=>setTimeout(resolve,20));}}
   try{inspectVaultScope(configuration.vault);}catch(e){releaseScope();throw e;}
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
      try { if (unlock) throw Error('Duplicate writer lease request'); unlock = phextWriterLease(message.phextKnowledge); worker.postMessage({ leaseGranted: true }); }
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
