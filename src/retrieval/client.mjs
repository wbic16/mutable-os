/** Internal per-Vault service. No HTTP/UI registration; one independent worker and lease. */
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {prepareHome,writerLock} from '../knowledge-sqlite/paths.mjs';
import {defaultProfile} from './profile.mjs';
export async function openRetrievalService(options){
 if(options.enabled===false)throw Error('Derived retrieval disabled');
 const {home}=prepareHome(options),unlock=writerLock(home,'retrieval.lock');
 const epoch=new Int32Array(new SharedArrayBuffer(16)),pending=new Map(),latest=new Map();let next=0,dead=false,closing=false,terminalError;
 Atomics.store(epoch,1,1);
 const {enabled,...config}=options;let worker;try{worker=new Worker(path.join(path.dirname(fileURLToPath(import.meta.url)),'worker.mjs'),{workerData:{...config,profile:{...defaultProfile,...options.profile},epoch}});}catch(e){unlock();throw e;}
 let readyResolve,readyReject;const ready=new Promise((a,b)=>{readyResolve=a;readyReject=b;});
 const fail=e=>{if(dead)return;dead=true;terminalError=e;readyReject(e);for(const task of pending.values()){clearTimeout(task.timer);task.reject(e);}pending.clear();};
 const startup=setTimeout(()=>{fail(Error('Retrieval worker startup timed out'));void worker.terminate();},30000);
 const exited=new Promise(resolve=>worker.once('exit',()=>{clearTimeout(startup);unlock();fail(Error('Retrieval worker stopped; no automatic paid replay'));resolve();}));
 worker.on('error',fail);worker.on('message',m=>{if(m.ready){clearTimeout(startup);readyResolve();return;}if(m.startupError){fail(Error(m.startupError));void worker.terminate();return;}const task=pending.get(m.id);if(!task)return;pending.delete(m.id);clearTimeout(task.timer);if(m.error)task.reject(Error(m.error));else if(task.operation!=='close'&&(Atomics.load(task.cancellation,0)||Atomics.load(epoch,0)!==task.expectedEpoch||(task.operation!=='status'&&!Atomics.load(epoch,1))))task.reject(Error('Retrieval superseded before delivery'));else task.resolve(m.value);});
 try{await ready;}catch(e){await worker.terminate();throw e;}
 const request=(operation,payload={},signal)=>{
  if(dead||closing)return Promise.reject(terminalError??Error('Retrieval service closed'));if(pending.size>=16)return Promise.reject(Error('Retrieval queue full'));if(signal?.aborted)return Promise.reject(signal.reason??Error('Retrieval cancelled'));
  const cancellation=new Int32Array(new SharedArrayBuffer(4)),id=++next,expectedEpoch=Atomics.load(epoch,0);const abort=()=>{Atomics.store(cancellation,0,1);worker.postMessage({cancel:id});};
  signal?.addEventListener('abort',abort,{once:true});
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{abort();fail(Error('Retrieval request timed out; no automatic paid replay'));void worker.terminate();},120000);pending.set(id,{resolve,reject,timer,operation,expectedEpoch,cancellation});worker.postMessage({id,operation,payload:{...payload,cancellation,expectedEpoch}});}).finally(()=>signal?.removeEventListener('abort',abort));
 };
 const supersede=(slot,operation,payload,signal)=>{latest.get(slot)?.abort(Error('Obsolete retrieval'));const c=new AbortController();latest.set(slot,c);return request(operation,payload,signal?AbortSignal.any([signal,c.signal]):c.signal).finally(()=>{if(latest.get(slot)===c)latest.delete(slot);});};
 const invalidate=()=>{Atomics.add(epoch,0,1);for(const c of latest.values())c.abort(Error('Saved scope changed'));};
 return {
  vault:options.vault,vaultGuid:options.vaultGuid,verifiesSavedSources:options.verifySavedSources===true,
  invalidate,
  isClosed:()=>dead||closing,
  pauseMaintenance(ms=5000){Atomics.store(new BigInt64Array(epoch.buffer,8,1),0,BigInt(ms>0?Date.now()+Math.min(10000,ms):0));},
  setAvailable(available){invalidate();Atomics.store(epoch,1,available?1:0);},
  index:(resourceId,{contentHash,consent,signal}={})=>supersede('index:'+resourceId,'index',{resourceId,contentHash,consent},signal),
  query:(query,{key='default',signal,liveState,...rest}={})=>supersede('query:'+key,'query',{query,...rest},signal).then(r=>({...r,results:r.results.map(hit=>({...hit,source:{...hit.source,liveCurrency:liveState?.(hit.source.resourceId)==='dirty'?'unsaved-changes': 'unknown'}}))})),
  verify:(reference,signal)=>request('verify',reference,signal),
  status:()=>request('status'),
  /** A host calls this after confirmed SQL publication, outside any save lock. */
  async reconcile({consent,signal,delayMs=0,onProgress,beforeDocument}={}){await request('reconcile',{},signal);const ids=await request('inventory',{},signal);if(ids.length>10000)throw Error('Retrieval resource budget exceeded');const results=[],issues=[];for(const id of ids){signal?.throwIfAborted();await beforeDocument?.(signal);if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));signal?.throwIfAborted();onProgress?.({total:ids.length,processed:results.length+issues.length,failed:issues.length});try{results.push(await this.index(id,{consent,signal}));}catch(e){if(signal?.aborted||dead||closing)throw e;issues.push({resourceId:id,error:e.message});}}onProgress?.({total:ids.length,processed:results.length+issues.length,failed:issues.length});return {results,issues,complete:issues.length===0};},
  async close(){if(dead){await exited;return;}invalidate();const done=request('close');closing=true;try{await done;}finally{await exited;}},
  async terminate(){invalidate();await worker.terminate();await exited;}
 };
}
