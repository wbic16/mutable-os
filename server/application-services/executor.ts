import {Worker} from 'node:worker_threads';
import {serialize} from 'node:v8';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {existsSync} from 'node:fs';
import type {Executor,ExecutionTask,Inventory} from '../../src/application-services/capabilities';
import type {PreparationResult} from '../../src/application-services/contracts';
import {SERVICE_LIMITS} from '../../src/application-services/validation';
type Result=Awaited<ReturnType<Executor['run']>>;
type Item={task:ExecutionTask;bytes:number;resolve:(v:Result)=>void;reject:(e:Error)=>void;signal?:AbortSignal;cancel:()=>void;timer:ReturnType<typeof setTimeout>;worker?:Worker;finished:boolean};
export class NodePreparationExecutor implements Executor {
 private queue:Item[]=[];private active?:Item;private bytes=0;private closed=false;private stopping=new Set<Promise<unknown>>();
 private readonly workerPath:string;
 constructor(private deadline:number=SERVICE_LIMITS.deadlineMs,workerPath?:string){
  if(deadline<1||deadline>SERVICE_LIMITS.deadlineMs)throw Error('Invalid executor deadline');
  const sibling=fileURLToPath(new URL('./preparation-worker.mjs',import.meta.url));
  this.workerPath=workerPath??(existsSync(sibling)?sibling:path.resolve('dist/server/application-services/preparation-worker.mjs'));
 }
 get status(){return {active:this.active?1:0,queued:this.queue.length,bytes:this.bytes};}
 run(task:ExecutionTask,signal?:AbortSignal):Promise<Result>{
  if(this.closed)return Promise.reject(Error('Preparation executor closed'));
  if(signal?.aborted)return Promise.reject(Error('Preparation cancelled'));
  if(this.queue.length>=SERVICE_LIMITS.queue)return Promise.reject(Error('Preparation queue is full'));
  const bytes=serialize(task).byteLength;
  if(bytes>64*1024*1024||this.bytes+bytes>96*1024*1024)return Promise.reject(Error('Preparation input byte budget exceeded'));
  const captured=structuredClone(task);this.bytes+=bytes;
  return new Promise((resolve,reject)=>{
   const item:Item={task:captured,bytes,resolve,reject,signal,cancel:()=>void this.finish(item,Error('Preparation cancelled')),timer:undefined!,finished:false};
   item.timer=setTimeout(()=>void this.finish(item,Error('Preparation deadline exceeded')),this.deadline);
   signal?.addEventListener('abort',item.cancel,{once:true});this.queue.push(item);this.pump();
  });
 }
 private pump(){
  if(this.closed||this.active||!this.queue.length)return;
  const item=this.active=this.queue.shift()!;
  try{
   const worker=item.worker=new Worker(this.workerPath,{execArgv:[],resourceLimits:{maxOldGenerationSizeMb:384,maxYoungGenerationSizeMb:32}});
   worker.once('message',message=>void this.finish(item,message.error?Error(message.error):undefined,message.value));
   worker.once('error',error=>void this.finish(item,error instanceof Error?error:Error(String(error))));
   worker.once('exit',()=>{if(!item.finished)void this.finish(item,Error('Preparation worker exited'));});
   worker.postMessage(item.task);
  }catch(error){void this.finish(item,error as Error);}
 }
 private async finish(item:Item,error?:Error,value?:Result){
  if(item.finished)return;item.finished=true;clearTimeout(item.timer);item.signal?.removeEventListener('abort',item.cancel);
  if(!error&&serialize(value).byteLength>SERVICE_LIMITS.resultBytes)error=Error('Preparation output byte budget exceeded');
  if(item.worker){const stop=item.worker.terminate();this.stopping.add(stop);try{await stop;}finally{this.stopping.delete(stop);}}
  this.queue=this.queue.filter(q=>q!==item);if(this.active===item)this.active=undefined;this.bytes-=item.bytes;
  error?item.reject(error):item.resolve(value!);this.pump();
 }
 async close(){this.closed=true;await Promise.all([...this.queue,...this.active?[this.active]:[]].map(i=>this.finish(i,Error('Preparation executor closed'))));await Promise.all(this.stopping);}
}
