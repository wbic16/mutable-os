import {createHash,randomUUID} from 'node:crypto';
import {ContinuityStore} from './continuity-store.js';
import {historyBaseJson,continuityLimits,type ContinuityManifest,type ContinuityPlan,type ContinuityReceipt,type HistoryStamp,type HistoryItem} from '../../src/features/dialectic/dcp/continuity-contract.js';
export type CavernScope={path:string;cavernGuid:string;session:string};
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const same=(a:unknown,b:unknown)=>historyBaseJson(a)===historyBaseJson(b);
interface RecordState {contractDigest?:string;version:string;generation:number;conversationId?:string;accepted:HistoryStamp[];phase:'ready'|'pending'|'prepared'|'uncertain';exchangeId?:string;deadline?:number;receipt?:ContinuityReceipt;input?:HistoryStamp[];responses?:string[];seen?:string[];repair?:boolean;abandoned?:string[]}
export class OpenAIConversations {
 private stores=new Map<string,ContinuityStore>();
 constructor(private current:()=>CavernScope|undefined,private fetcher:typeof fetch=fetch){}
 private scope(m:ContinuityManifest,key:string){
  const c=this.current();if(!c||c.cavernGuid!==m.cavernId||c.session!==m.session)throw Error('Provider continuity Cavern changed. Reopen the Document.');
  for(const id of [m.documentId,m.participantId])if(typeof id!=='string'||!id.length||id.length>200)throw Error('Invalid continuity identity');
  if(!Array.isArray(m.history)||m.history.length>continuityLimits.contributions||m.history.some(h=>!h||Object.keys(h).some(k=>k!=='id'&&k!=='digest')||typeof h.id!=='string'||h.id.length>128||!h.id||!/^[a-f0-9]{64}$/.test(h.digest))||new Set(m.history.map(h=>h.id)).size!==m.history.length)throw Error('Invalid or excessive native history manifest');
  if(!Array.isArray(m.receipts)||m.receipts.length>128)throw Error('Invalid native continuity receipts');
  const connection=hash('openai:'+key),binding=hash(JSON.stringify([c.cavernGuid,m.documentId,m.participantId,connection]));
  let store=this.stores.get(c.path);if(!store)this.stores.set(c.path,store=new ContinuityStore(c.path));
  return {store,binding,connection};
 }
 private initial():RecordState{return {version:randomUUID(),generation:1,accepted:[],phase:'ready',seen:[]};}
 async plan(m:ContinuityManifest,key:string,instructions?:string):Promise<ContinuityPlan>{
  const {store,binding,connection}=this.scope(m,key);
  return store.update(binding,(old:RecordState|undefined)=>{
   const contractDigest=instructions===undefined?undefined:hash(instructions);let r=old??{...this.initial(),contractDigest},recovery=false;
   if(r.phase==='prepared'&&r.receipt&&m.receipts.some(x=>same(x,r.receipt))&&same(m.history.slice(0,r.input?.length),r.input)&&m.history.length>(r.input?.length??0)){
    r={...r,phase:r.repair?'uncertain':'ready',accepted:m.history.slice(0,r.input!.length+1),version:randomUUID()};
   }
   if((r.phase==='pending'||r.phase==='prepared')&&(r.deadline??0)>Date.now())throw Error('Provider continuity has an unfinished exchange. Finish or cancel it before asking again.');
   if(r.phase!=='ready'||!same(m.history.slice(0,r.accepted.length),r.accepted)||r.contractDigest!==contractDigest){
    r={...this.initial(),contractDigest,generation:r.generation+1,seen:r.seen,abandoned:[...(r.abandoned??[]),...(r.conversationId?[r.conversationId]:[])].slice(-16)};recovery=true;
   }
   return {value:old&&r===old?undefined:r,result:{...(contractDigest?{contractDigest}:{}),binding,connection,generation:r.generation,start:r.accepted.length,recovery,version:r.version}};
  });
 }
 private async api(key:string,path:string,signal:AbortSignal,body?:unknown){
  let response:Response;try{response=await this.fetcher('https://api.openai.com/v1/conversations'+path,{method:body===undefined?'GET':'POST',redirect:'error',signal,headers:{authorization:'Bearer '+key,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}catch{throw Error('Provider continuity connection failed; state is uncertain. No automatic retry.');}
  if(!response.ok)throw Error(`Provider continuity request failed (OpenAI HTTP ${response.status}). No automatic retry.`);
  const text=await response.text();if(text.length>2*continuityLimits.bytes)throw Error('Provider continuity response exceeded its budget');return JSON.parse(text);
 }
 async begin(m:ContinuityManifest,plan:ContinuityPlan,items:HistoryItem[],exchangeId:string,key:string,signal:AbortSignal,instructions?:string){
  if(plan.contractDigest!==(instructions===undefined?undefined:hash(instructions)))throw Error('Provider contract changed; prepare again.');
  const {store,binding,connection}=this.scope(m,key);if(plan.binding!==binding||plan.connection!==connection)throw Error('Provider connection changed; prepare again.');
  if(!Array.isArray(items)||items.length!==m.history.length-plan.start||new TextEncoder().encode(JSON.stringify(items)).length>continuityLimits.bytes||items.some(i=>!['user','assistant'].includes(i.role)||typeof i.content!=='string'))throw Error('Invalid history delta');
  for(const [i,item]of items.entries()){const content=JSON.parse(item.content),stamp=m.history[plan.start+i];if(content.id!==stamp.id||hash(historyBaseJson(content))!==stamp.digest)throw Error('Native history projection does not match its manifest');}
  await store.update(binding,(r:RecordState)=>{
   if(!r||r.version!==plan.version||r.phase!=='ready'||r.generation!==plan.generation||r.accepted.length!==plan.start||!same(m.history.slice(0,plan.start),r.accepted))throw Error('Provider continuity changed; prepare again.');
   if(r.seen?.includes(exchangeId))throw Error('Provider exchange was already submitted. No duplicate request was sent.');
   return {value:{...r,phase:'pending',exchangeId,input:m.history,deadline:Date.now()+120000,seen:[...(r.seen??[]),exchangeId].slice(-128),responses:[],repair:false},result:undefined};
  });
  try{
   let id=await store.update(binding,(r:RecordState)=>({value:undefined,result:r.conversationId}));const initialise=!id&&instructions!==undefined;
   if(id){try{await this.api(key,'/'+encodeURIComponent(id),signal);}catch(e){if(!String(e).includes('HTTP 404'))throw e;throw Error('Provider conversation is missing. Retry explicitly to rebuild from native history.');}}
   if(!id){const created=await this.api(key,'',signal,{metadata:{application:'mutable',binding}});if(typeof created.id!=='string'||!/^conv_[a-zA-Z0-9_-]+$/.test(created.id))throw Error('Invalid provider conversation identifier');id=created.id;await store.update(binding,(r:RecordState)=>({value:{...r,conversationId:id},result:undefined}));}
   const pending=[...(initialise?[{type:'message',role:'developer',content:instructions}]:[]),...items.map(item=>({type:'message',role:item.role,content:item.content}))];
   for(let i=0;i<pending.length;i+=20)await this.api(key,'/'+id+'/items',signal,{items:pending.slice(i,i+20)});
   signal.throwIfAborted();
   const receipt:ContinuityReceipt={version:1,binding,connection,generation:plan.generation,conversationId:id,exchangeId};
   await store.update(binding,(r:RecordState)=>({value:{...r,receipt},result:undefined}));return receipt;
  }catch(e){await this.abandon(m,key,exchangeId);throw e;}
 }
 async response(m:ContinuityManifest,key:string,exchangeId:string,id:string){const {store,binding}=this.scope(m,key);await store.update(binding,(r:RecordState)=>{if(r.exchangeId!==exchangeId||r.phase==='uncertain')throw Error('Provider exchange is no longer current');return {value:{...r,responses:[...(r.responses??[]),id].slice(-8)},result:undefined};});}
 async prepared(m:ContinuityManifest,key:string,exchangeId:string,repaired:boolean){const {store,binding}=this.scope(m,key);await store.update(binding,(r:RecordState)=>{if(r.exchangeId!==exchangeId||r.phase==='uncertain')throw Error('Provider exchange is no longer current');return {value:{...r,phase:'prepared',repair:repaired},result:undefined};});}
 async acknowledge(m:ContinuityManifest,key:string,receipt:ContinuityReceipt){
  const {store,binding}=this.scope(m,key);return store.update(binding,(r:RecordState)=>{
   if(!r||!same(r.receipt,receipt)||r.phase!=='prepared'&&r.phase!=='ready')throw Error('Provider commit acknowledgement does not match the pending exchange');
   if(!same(m.history.slice(0,r.input?.length),r.input)||m.history.length!==(r.input?.length??0)+1)throw Error('Native history changed before acknowledgement');
   // A repaired response can leave rejected candidates in remote memory. Rebuild
   // on the next explicit Ask rather than pretending deletion is atomic.
   return {value:{...r,accepted:m.history,phase:r.repair?'uncertain':'ready',deadline:0,version:randomUUID()},result:{recoveryRequired:!!r.repair}};
  });
 }
 async abandon(m:ContinuityManifest,key:string,exchangeId:string){const {store,binding}=this.scope(m,key);await store.update(binding,(r:RecordState|undefined)=>({value:r&&r.exchangeId===exchangeId&&r.phase!=='ready'?{...r,phase:'uncertain',deadline:0,version:randomUUID()}:undefined,result:undefined}));}
}
