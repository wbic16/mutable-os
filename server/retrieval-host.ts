/** Cavern-scoped consent and orchestration. No canonical schema or document mutations. */
import {Router,json} from 'express';
import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openRetrievalService} from '../src/retrieval/client.mjs';
import type {SqliteKnowledgeHost} from './sqlite-knowledge-host';

type Preferences={version:1;vaultGuid:string;decision:'unasked'|'declined'|'enabled';documents?:any;queries?:any};
export class CavernRetrieval {
 private preferences:Preferences;private service:any;private lease?:string;private opening?:Promise<void>;private timer?:ReturnType<typeof setInterval>;private closed=false;private generation=0;private quietUntil=0;private tail=Promise.resolve();
 private file:string;
 constructor(private sql:SqliteKnowledgeHost,private root:string,private vaultGuid:string,private options:{open?:typeof openRetrievalService;providerModule?:string;providerOptions?:any;profile?:any;delayMs?:number;deferStartup?:boolean}={}){this.file=path.join(root,'.mutable','retrieval-preferences.json');this.preferences={version:1,vaultGuid,decision:'unasked'};}
 async start(){
  try{const h=await fs.open(this.file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const p=JSON.parse(await h.readFile('utf8'));if(p.version!==1||p.vaultGuid!==this.vaultGuid||!['unasked','declined','enabled'].includes(p.decision))throw Error('Invalid retrieval preference identity');this.preferences=p;}finally{await h.close();}}catch(e){if((e as any).code!=='ENOENT'){this.lastError='Retrieval preferences need review: '+String(e);this.preferences.decision='declined';}}
  if(this.preferences.decision==='enabled'&&!this.options.deferStartup)void this.ensure().catch(e=>{this.lastError=String(e);});
 }
 resume(){if(this.preferences.decision==='enabled')void this.ensure().catch(e=>{this.lastError=String(e);});}
 private providerAvailable(){return !!process.env.OPENAI_API_KEY||!!this.options.providerModule;}
 private lastError='';private serviceError='';
 private settings(){return {indexing:this.preferences.decision==='enabled'&&!!this.preferences.documents&&this.providerAvailable(),delayMs:this.options.delayMs??750,beforeDocument:async(signal:AbortSignal)=>{while(Date.now()<this.quietUntil){signal.throwIfAborted();await new Promise(r=>setTimeout(r,100));}}};}
 private async ensure(){
  if(this.closed)throw Error('Cavern retrieval closed');if(this.opening)return this.opening;if(this.service)return;
  this.opening=(async()=>{const lease=await this.sql.acquireRetrieval('.');this.lease=lease.lease;
   try{if(lease.vaultGuid!==this.vaultGuid)throw Error('Cavern retrieval identity changed');this.service=await (this.options.open??openRetrievalService)({vault:this.root,vaultGuid:this.vaultGuid,verifySavedSources:true,providerModule:this.options.providerModule,providerOptions:this.options.providerOptions,profile:this.options.profile});
    this.service.pauseMaintenance(this.options.delayMs===undefined?5000:0);
    await this.sql.attachRetrieval(this.lease,this.service,this.preferences.documents,this.settings());
    this.timer=setInterval(()=>{void this.sql.status(this.lease!).catch(e=>{this.lastError=String(e);});},60000);this.timer.unref?.();
   }catch(e){await this.service?.close().catch(()=>{});this.service=undefined;await this.sql.release(this.lease);this.lease=undefined;throw e;}
  })().finally(()=>{this.opening=undefined;});return this.opening;
 }
 private async persist(){const tmp=this.file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(this.preferences),{mode:0o600,flag:'wx'});await fs.rename(tmp,this.file);}finally{await fs.unlink(tmp).catch(()=>{});}}
 async configure(input:any){
  // Serialize approval/revocation; no grant objects, paths or identities are accepted from the browser.
  const work=this.tail.then(async()=>{
   if(!input||Object.keys(input).some(k=>!['indexDocuments','embedQueries','documentTokens','queryTokens','renew'].includes(k))||typeof input.indexDocuments!=='boolean'||typeof input.embedQueries!=='boolean')throw Error('Explicit indexing and query choices required');
   if(input.renew!==undefined&&typeof input.renew!=='boolean')throw Error('Invalid renewal choice');
   for(const cap of [input.documentTokens,input.queryTokens])if(!Number.isInteger(cap)||cap<1||cap>50000)throw Error('Token caps must be 1–50000');
   if(!input.indexDocuments&&!input.embedQueries){this.generation++;this.service?.invalidate();this.preferences={version:1,vaultGuid:this.vaultGuid,decision:'declined'};await this.persist();if(this.lease)this.sql.configureRetrieval(this.lease,undefined,this.settings());this.lastError='';return this.status();}
   await this.ensure();const status=await this.service.status();
   const grant=(kind:string,maxTokens:number,old:any)=>!input.renew&&old&&old.maxTokens===maxTokens&&old.indexId===status.indexId?old:{approved:true,id:randomUUID(),indexId:status.indexId,vaultGuid:this.vaultGuid,model:status.profile.model,maxTokens,expiresAt:'9999-12-31T23:59:59Z',scope:{version:1,kind,vaultGuid:this.vaultGuid}};
   const next:Preferences={version:1,vaultGuid:this.vaultGuid,decision:input.indexDocuments?'enabled':'declined',documents:input.indexDocuments?grant('saved-vault-maintenance',input.documentTokens,this.preferences.documents):undefined,queries:input.embedQueries?grant('interactive-queries',input.queryTokens,this.preferences.queries):undefined};
   this.generation++;this.service.invalidate();this.preferences=next;await this.persist();this.sql.configureRetrieval(this.lease!,next.documents,this.settings());this.lastError='';return this.status();
  });this.tail=work.then(()=>{},()=>{});return work;
 }
 async status(){
  let index:any,storage:any;try{if(this.service){index=await this.sql.retrievalStatus(this.lease!);storage=await this.service.status();this.serviceError='';}}catch(e){this.serviceError=String(e);index={...index,state:'unavailable',complete:false};}
  const spent=(grant:any)=>{if(!storage)return grant?null:0;const row=storage?.usage?.find((r:any)=>r.grantId===grant?.id);return Math.max(row?.reserved??0,row?.actual??0);};
  return {vaultGuid:this.vaultGuid,decision:this.preferences.decision,provider:{kind:'hosted',name:'OpenAI',model:'text-embedding-3-small',configured:!!process.env.OPENAI_API_KEY||!!this.options.providerModule,localAvailable:false},documents:!!this.preferences.documents,queries:!!this.preferences.queries,documentTokens:this.preferences.documents?.maxTokens??50000,queryTokens:this.preferences.queries?.maxTokens??5000,documentTokensUsed:spent(this.preferences.documents),queryTokensUsed:spent(this.preferences.queries),index:index??{complete:false,state:'not-indexed'},indexed:storage?.resources??null,known:storage?.knownResources??null,error:this.serviceError||this.lastError,coverage:'Saved Documents only; unsaved content is not covered',reauthorizationRequired:!!storage&&[this.preferences.documents,this.preferences.queries].some(g=>g&&g.indexId!==storage.indexId)};
 }
 async refresh(){const work=this.tail.then(async()=>{if(this.preferences.decision!=='enabled')throw Error('Indexing authorisation required');if(this.service?.isClosed()){clearInterval(this.timer);if(this.lease){await this.sql.detachRetrieval(this.lease);await this.sql.release(this.lease);}this.service=undefined;this.lease=undefined;}await this.ensure();void this.sql.refresh(this.lease!).catch(e=>{this.lastError=String(e);});return this.status();});this.tail=work.then(()=>{},()=>{});return work;}
 async query(input:any,signal?:AbortSignal){
  if(typeof input.query!=='string'||input.query.length>1000||!input.query.trim()||!['lexical','hybrid'].includes(input.strategy)||input.resourceId!==undefined&&typeof input.resourceId!=='string')throw Error('Invalid retrieval query');
  if(input.strategy==='hybrid'&&!this.preferences.queries)throw Error('Query embedding authorisation required — Workspace → Index Cavern');
  if(input.strategy==='hybrid'&&!this.providerAvailable())throw Error('Embedding provider credential unavailable');
  await this.ensure();const generation=this.generation;const result=await this.service.query(input.query,{signal,key:String(input.key??'interactive').slice(0,100),strategy:input.strategy,requireIndex:input.strategy==='hybrid',resourceId:input.resourceId,limit:Math.min(20,Math.max(1,Number(input.limit)||10)),consent:input.strategy==='hybrid'?this.preferences.queries:undefined});
  if(generation!==this.generation||this.closed)throw Error('Retrieval authorisation changed');return result;
 }
 async verify(reference:any){await this.ensure();return this.service.verify(reference);}
 foreground(){this.quietUntil=Date.now()+5000;this.service?.pauseMaintenance(5000);this.sql.pauseBackground(5000);}
 async close(){this.closed=true;this.generation++;clearInterval(this.timer);await this.opening?.catch(()=>{});await this.tail;if(this.lease){await this.sql.detachRetrieval(this.lease);await this.sql.release(this.lease);}this.service=undefined;}
 router(){const router=Router();router.use(json({limit:'8kb'}));for(const [name,action] of Object.entries({status:()=>this.status(),configure:(b:any)=>this.configure(b),refresh:()=>this.refresh(),query:(b:any,s:AbortSignal)=>this.query(b,s),verify:(b:any)=>this.verify(b),foreground:()=>{this.foreground();return {ok:true};}}))router.post('/'+name,async(req,res)=>{const c=new AbortController();const cancel=()=>{if(!res.writableEnded)c.abort();};res.on('close',cancel);try{const data=await action(req.body,c.signal);if(!c.signal.aborted)res.json({Success:true,Data:data});}catch(e){if(!c.signal.aborted)res.status(409).json({Success:false,Error:e instanceof Error?e.message:String(e)});}finally{res.off('close',cancel);}});return router;}
}
