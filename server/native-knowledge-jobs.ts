import {URL} from 'node:url';
import {existsSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {normalizePolicy,policyKey,type ExtractionPolicy} from '../src/knowledge/policy';
const workerFilename='native-knowledge-worker.js';
export interface NativeInspection {resourceId:string;rootBlockId:string;title:string}
export interface NativeKnowledgeResult {
 id:number;kind:'inspect'|'facts';ok:true;inspection:NativeInspection;byteHash:string;policy:string;wire?:string;
 timings:{hashMs:number;validationMs:number;factsMs:number;encodeMs:number;workerMs:number;queueMs?:number;roundTripMs?:number};memory:number;
}
type Job={id:number;kind:'inspect'|'facts';bytes:Uint8Array;policy:ExtractionPolicy;resolve:(r:NativeKnowledgeResult)=>void;reject:(e:Error)=>void;cleanup:()=>void;queued:number;started?:number};
/** One worker, bounded FIFO and byte budget. Cancellation retires the active worker;
 * no fallback synchronous decode and no cross-request partially validated output. */
export class NativeKnowledgeJobs {
 private worker?:Worker;private active?:Job;private queue:Job[]=[];private bytes=0;private serial=0;private closed=false;private retiring=false;private retirement?:Promise<void>;
 constructor(private options:{workerURL?:URL;timeoutMs?:number;maxQueue?:number;maxQueuedBytes?:number}={}){}
 run(kind:'inspect'|'facts',input:Uint8Array,{signal,policy}:{signal?:AbortSignal;policy?:ExtractionPolicy}={}):Promise<NativeKnowledgeResult>{
  try{signal?.throwIfAborted();if(this.closed)throw Error('Native inspection facility closed');
   if(!['inspect','facts'].includes(kind)||input.byteLength>20*1024*1024)throw Error('Native inspection input budget exceeded');
   if(this.queue.length+(this.active?1:0)>=(this.options.maxQueue??8)||this.bytes+input.byteLength>(this.options.maxQueuedBytes??40*1024*1024))throw Error('Native inspection queue full');
   if(kind==='facts'&&!policy)throw Error('Explicit Facts extraction policy required');
   policy=normalizePolicy(policy);
  }catch(error){return Promise.reject(error);}
  return new Promise((resolve,reject)=>{
   const id=++this.serial,bytes=Uint8Array.from(input),queued=performance.now();
   const abort=()=>this.cancel(id,new Error('Native inspection cancelled'));
   const timer=setTimeout(()=>this.cancel(id,new Error('Native inspection timed out')),this.options.timeoutMs??60000);
   const job:Job={id,kind,bytes,policy,resolve,reject,queued,cleanup:()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);}};
   signal?.addEventListener('abort',abort,{once:true});this.bytes+=bytes.byteLength;this.queue.push(job);this.pump();
  });
 }
 private cancel(id:number,error:Error){
  if(this.active?.id===id){this.finish(undefined,error);this.retire();return;}
  const index=this.queue.findIndex(j=>j.id===id);if(index<0)return;
  const [j]=this.queue.splice(index,1);this.bytes-=j.bytes.byteLength;j.cleanup();j.reject(error);
 }
 private finish(result?:NativeKnowledgeResult,error?:Error){
  const j=this.active;if(!j)return;this.active=undefined;j.cleanup();
  // Transferred input is detached: accounting was released on dispatch.
  if(error)j.reject(error);else j.resolve({...result!,timings:{...result!.timings,queueMs:j.started!-j.queued,roundTripMs:performance.now()-j.started!}});
 }
 private retire(){
  const w=this.worker;this.worker=undefined;if(!w){this.pump();return;}
  this.retiring=true;w.removeAllListeners();w.on('error',()=>{});
  this.retirement=w.terminate().then(()=>{}).finally(()=>{this.retiring=false;this.pump();});
 }
 private pump(){
  if(this.closed||this.active||this.retiring||!this.queue.length){if(!this.active)this.worker?.unref();return;}
  if(!this.worker){
   try{const w=this.worker=new Worker(this.options.workerURL??(existsSync(new URL(workerFilename,import.meta.url))?new URL(workerFilename,import.meta.url):new URL('../dist/server/'+workerFilename,import.meta.url)),{execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
    w.on('message',reply=>{
     if(this.worker!==w)return;const j=this.active;
     if(!j||reply?.id!==j.id){this.finish(undefined,new Error('Stale native inspection response'));this.retire();return;}
     if(!reply.ok){this.finish(undefined,new Error(String(reply.error??'Incomplete native inspection')));this.pump();return;}
     if(reply.kind!==j.kind||reply.policy!==policyKey(j.policy)||typeof reply.inspection?.resourceId!=='string'||!reply.inspection.resourceId||typeof reply.inspection?.rootBlockId!=='string'||!reply.inspection.rootBlockId||typeof reply.inspection.title!=='string'||! /^[0-9a-f]{64}$/.test(reply.byteHash)||!reply.timings||!Number.isFinite(reply.timings.workerMs)||j.kind==='facts'&&typeof reply.wire!=='string'){
      this.finish(undefined,new Error('Incomplete native inspection response'));this.retire();return;
     }
     this.finish(reply);this.pump();
    });
    w.on('error',e=>{if(this.worker===w){this.finish(undefined,e instanceof Error?e:Error(String(e)));this.retire();}});
    w.on('exit',()=>{if(this.worker===w){this.finish(undefined,new Error('Native inspection worker exited'));this.retire();}});
   }catch(error){const j=this.queue.shift()!;this.bytes-=j.bytes.byteLength;j.cleanup();j.reject(error as Error);this.pump();return;}
  }
  const j=this.active=this.queue.shift()!;j.started=performance.now();this.bytes-=j.bytes.byteLength;this.worker.ref();
  try{this.worker.postMessage({id:j.id,kind:j.kind,bytes:j.bytes,policy:j.policy},[j.bytes.buffer as ArrayBuffer]);}catch(error){this.finish(undefined,error as Error);this.retire();}
 }
 async close(){this.closed=true;for(const j of this.queue.splice(0)){j.cleanup();j.reject(Error('Native inspection facility closed'));}this.bytes=0;this.finish(undefined,Error('Native inspection facility closed'));const w=this.worker;this.worker=undefined;await w?.terminate();await this.retirement;}
}
/** One facility per Node process, not one worker per vault/request. Idle workers do not hold shutdown open. */
export const nativeKnowledgeJobs=new NativeKnowledgeJobs();
