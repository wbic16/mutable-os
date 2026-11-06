import type {ReactiveEditor} from '../reactive-editor/editor';
import type {DocumentVaultLease} from './document-vault';
import {waitForQuery,type FactsQueryProvider} from './facts-query-provider';
import type {EntityService,EntityCandidate,CanonicalEntity} from '../feature-api/entities';
import {nativeDocumentSession} from '../persistence/native-session';
import {WorkSlice} from '../knowledge/scheduler';
import {encodeAuthoredValue,decodeAuthoredValue} from '../history/preplan-spike/wire';
type Context={accepts(key:string):boolean;vault():DocumentVaultLease;facts?:FactsQueryProvider;prepare?():Promise<void>;listingVault?():Promise<string>};
const overrides=new WeakMap<ReactiveEditor,(owner:string)=>EntityService>();
/** Explicit host capability for resource-independent native annotation editors. */
export function registerStandaloneEntityService(editor:ReactiveEditor,create:(owner:string)=>EntityService){overrides.set(editor,create);return()=>overrides.delete(editor);}
const contexts=new WeakMap<ReactiveEditor,Set<Context>>();
export function registerEntityContext(editor:ReactiveEditor,context:Context){let set=contexts.get(editor);if(!set)contexts.set(editor,set=new Set());set.add(context);return()=>set!.delete(context);}
async function request(action:string,body:unknown,signal?:AbortSignal){
 const response=await fetch('/api/sqlite/knowledge/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!response.body)throw Error('Entity service unavailable');const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
 try{for(;;){signal?.throwIfAborted();const c=await reader.read();if(c.done)break;if((length+=c.value.length)>1024*1024)throw Error('Entity response budget exceeded');parts.push(c.value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}const result=JSON.parse(new TextDecoder().decode(bytes));
 if(!response.ok||!result.Success)throw Object.assign(new Error(result.Error??'Entity operation unavailable'),result.entityCreationOutcome==='not-created'?{entityCreationOutcome:'not-created'}:{});return result.Data;
}
/** A resolver belongs to the invoking occurrence. Vault selection is never global focus. */
export function entityService(editor:ReactiveEditor,owner:string):EntityService {
 const override=overrides.get(editor);if(override)return override(owner);
 let alive=true,lease:string|undefined,opening:Promise<void>|undefined;
 const native=nativeDocumentSession(editor),policy=()=>({version:1 as const,opaqueTypes:editor.registry.typesWithCapability('opaque-widget')});
 const matches=[...(contexts.get(editor)??[])].filter(c=>c.accepts(owner));
 const context=matches.length===1?matches[0]:undefined;
 const root=editor.blockQueries.ancestorPath(owner).filter(n=>n.viewType==='document-block').at(-1);
 const id=String((root?.payload.metadata as any)?.documentId??root?.payload.id??'');
 let vault=context?.prepare?undefined:context?.vault(),preparing:Promise<void>|undefined;
 const ready=async(signal?:AbortSignal)=>{
  signal?.throwIfAborted();
  if(!alive)throw Error('Entity resolver closed');
  if(!editor.features.sqliteEntities||!context?.accepts(owner))throw Error('Open this Document in one verified Mutable Vault to resolve Entities.');
  if(context.prepare&&!vault){
   preparing??=context.prepare().then(()=>{if(!alive||!context.accepts(owner))throw Error('Entity resolver closed or Document unavailable');vault=context.vault();}).finally(()=>preparing=undefined);
   await waitForQuery(preparing,signal);
  }
  signal?.throwIfAborted();
 };
 const check=()=>{
  if(!alive||!editor.features.sqliteEntities||!context||!vault||context.vault()!==vault||!context.accepts(owner)||!vault.isAlive())throw Error('Open this Document in one verified Mutable Vault to resolve Entities.');
  const b=editor.repository.readCanonicalResourceBoundary(id);if(b.status!=='ready')throw Error('Entity source is missing or ambiguous');
  const proof=native.knowledgeEvidence(id);
  if(proof.pending)throw Error('Finish or recover this Document’s pending Save/relocation before resolving Entities.');
  if(!proof.location||!proof.byteHash)throw Error('Save this Document into the selected Mutable Vault first. Selecting a Vault does not save an unsaved tab.');
  if(!native.compatibleSource(id)){const row=vault.requireFile(proof.location);if(row.resourceId!==id||row.baseline?.nativeHash!==proof.byteHash)throw Error('Entity source location changed; Refresh first');}
  return {resourceId:id,location:proof.location,byteHash:proof.byteHash};
 };
 const call=async(input:any,signal?:AbortSignal,onDispatch?:()=>void)=>{
  await ready(signal);
  const source=check();signal?.throwIfAborted();
  if(!lease){opening??=request('open',{vault:vault!.root,policy:policy()}).then(async result=>{if(!alive){await request('release',{lease:result.lease});throw Error('Entity resolver closed');}lease=result.lease;}).finally(()=>opening=undefined);await opening;}
  check();signal?.throwIfAborted();onDispatch?.();
  const wireInput=Object.hasOwn(input,'attributes')?{...input,attributes:encodeAuthoredValue(input.attributes)}:input;
  const result=await request('entities',{lease,source,request:wireInput},signal);
  for(const entity of [result.entity,...(result.entities??[])])if(entity&&entity.attributes!==undefined)entity.attributes=decodeAuthoredValue(entity.attributes);
  return result;
 };
 // Listing reads need source authority, not discovery/extraction of the Vault.
 // The server verifies the bound file/hash on every request, including reads.
 let listingLease:string|undefined,listingRoot:string|undefined,listingOpening:Promise<void>|undefined;
 const listingSource=()=>{
  if(!alive||!editor.features.sqliteEntities||!context?.accepts(owner))throw Error('Open this Document in one verified Mutable Vault to resolve Entities.');
  if(listingRoot&&!context.listingVault){const selected=context.vault();if(!selected.isAlive()||selected.root!==listingRoot)throw Error('Entity listing Vault changed');}
  if(editor.repository.readCanonicalResourceBoundary(id).status!=='ready')throw Error('Entity source is missing or ambiguous');
  const proof=native.knowledgeEvidence(id);
  if(proof.pending||!proof.location||!proof.byteHash)throw Error('Save or recover this Document in the selected Vault before resolving Entities.');
  return {resourceId:id,location:proof.location,byteHash:proof.byteHash};
 };
 const listingCall=async(input:Record<string,unknown>,signal?:AbortSignal)=>{
  signal?.throwIfAborted();const source=listingSource();
  if(!listingLease){
   listingOpening??=(async()=>{
    const root=context!.listingVault?await context!.listingVault():context!.vault().root;
    listingRoot=root;
    listingSource();
    const opened=await request('open',{vault:root,policy:policy()});
    if(!alive){await request('release',{lease:opened.lease});throw Error('Entity resolver closed');}
    listingLease=opened.lease;
   })().finally(()=>listingOpening=undefined);
   await waitForQuery(listingOpening,signal);
  }
  signal?.throwIfAborted();listingSource();
  const result=await request('entities',{lease:listingLease,source,request:input},signal);
  signal?.throwIfAborted();
  if(JSON.stringify(listingSource())!==JSON.stringify(source))throw Error('Entity source changed');
  return result;
 };
 // Selection reads require only the invoking context and selected Vault. They
 // do not inspect source bytes, Save state, ownership boundaries or document Facts.
 const lookupCurrent=()=>{
  if(!alive||!editor.features.sqliteEntities||!context?.accepts(owner))throw Error('Open this Document in one verified Mutable Vault to resolve Entities.');
  if(vault&&(!vault.isAlive()||context.vault()!==vault))throw Error('Entity lookup Vault changed');
  if(!context.listingVault&&!context.vault()?.isAlive())throw Error('Entity lookup Vault is unavailable');
 };
 const lookupRoot=async(signal?:AbortSignal)=>{
  signal?.throwIfAborted();lookupCurrent();
  const root=context!.listingVault?await waitForQuery(context!.listingVault(),signal):context!.vault().root;
  signal?.throwIfAborted();lookupCurrent();
  if(!root)throw Error('Select a Vault to resolve Entities.');
  return root;
 };
 let mutationVault:string|undefined;
 const mutate=async(input:any,signal?:AbortSignal,onDispatch?:()=>void)=>{
  const root=await lookupRoot(signal);
  if(mutationVault&&mutationVault!==root)throw Error('Entity mutation Vault changed; reopen the selector');
  mutationVault=root;
  const wireInput=Object.hasOwn(input,'attributes')?{...input,attributes:encodeAuthoredValue(input.attributes)}:input;
  signal?.throwIfAborted();onDispatch?.();
  const result=await request('entity-mutate',{vault:root,policy:policy(),request:wireInput},signal);
  if(result.entity?.attributes!==undefined)result.entity.attributes=decodeAuthoredValue(result.entity.attributes);
  return result.entity;
 };
 // Usage history is scoped by the Cavern's own identity (its
 // knowledge vaultGuid), never by its absolute path on disk: a
 // Cavern that moves keeps its history, and two Caverns at the
 // same path over time never share it. (Audit item P3.)
 let scopeGuid:string|undefined,scopeRoot:string|undefined;
 return {
  historyScope:async()=>{
   const root=await lookupRoot();
   if(scopeGuid&&scopeRoot===root)return scopeGuid;
   const opened=await request('open',{vault:root,policy:policy()});
   try{
    const guid=opened.vaultGuid as string|undefined;
    if(!guid)throw Error('Entity history scope unavailable: the Vault did not report its identity');
    scopeRoot=root;scopeGuid=guid;return guid;
   }finally{await request('release',{lease:opened.lease}).catch(()=>{});}
  },
  async authorityLookup(record,signal){const vault=await lookupRoot(signal),result=await request('entity-lookup',{vault,request:{op:'authority-lookup',record}},signal);lookupCurrent();if(result.entity?.attributes!==undefined)result.entity.attributes=decodeAuthoredValue(result.entity.attributes);return result.entity;},
  async acquireIdentity(input){return mutate({op:'authority-import',...input});},
  names:async(ids,signal)=>(await listingCall({op:'names',ids},signal)).rows,
  dbMentions:async(ids,signal)=>(await listingCall({op:'db-mentions',ids},signal)).rows,
  async get(id,signal){const vault=await lookupRoot(signal),result=await request('entity-lookup',{vault,request:{op:'get',id}},signal);lookupCurrent();if(result.entity?.attributes!==undefined)result.entity.attributes=decodeAuthoredValue(result.entity.attributes);return result.entity;},
  async summaries(ids,signal){
   await ready(signal);
   const revision=editor.repository.state.revision,signature=vault?.signature();
   const current=()=>{signal?.throwIfAborted();check();if(editor.repository.state.revision!==revision||vault!.signature()!==signature)throw Error('Entity summary source changed');};
   const result=await call({op:'resolve',ids},signal);current();
   const diagnostics:string[]=[],counts=new Map<string,number>();
   try{
    if(!context?.facts)throw Error('Vault mention coverage unavailable');
    const scope=await context.facts.prepare(vault!,signal),work=new WorkSlice(()=>{current();scope.current();});
    diagnostics.push(...scope.diagnostics);const wanted=new Set(ids);let examined=0;
    outer:for(const source of scope.sources){diagnostics.push(...source.facts.diagnostics);for(const mention of source.facts.mentions){
     await work.step();if(++examined>20000){diagnostics.push('Vault count budget exceeded');break outer;}
     if(mention.kind==='entity'&&wanted.has(mention.targetId))counts.set(mention.targetId,(counts.get(mention.targetId)??0)+1);
    }}
    await scope.validate();
   }catch(error){diagnostics.push(String(error));}
   current();if((await call({op:'current'},signal)).revision!==result.revision)throw Error('Canonical Entity summaries changed');current();
   if(result.entities.length!==new Set(ids).size)diagnostics.push('Some Entity identities are unresolved in this vault');
   const complete=!diagnostics.length;
   return {rows:result.entities.map((e:CanonicalEntity)=>({id:e.id,name:e.displayName??e.name,...(complete?{mentions:counts.get(e.id)??0}:{})})),complete,diagnostics:[...new Set(diagnostics)].slice(0,32)};
  },
  async create(input,signal){let dispatched=false;try{return await mutate({op:'create',...input},signal,()=>{dispatched=true;});}catch(error){if(!dispatched)throw Object.assign(new Error(String(error)),{entityCreationOutcome:'not-created'});throw error;}},
  async rename(input){return mutate({op:'rename',...input});},
  async update(input,signal){return mutate({op:'update',...input},signal);},
  async alias(input){return mutate(input);},
  async search(query,signal,onProgress){
   const vaultRoot=await lookupRoot(signal);
   const current=()=>{signal.throwIfAborted();lookupCurrent();};
   const base={op:'search',query:query.query,match:query.match,...(query.scope==='document'?{resourceId:id}:{}),refresh:query.refresh};
   const candidates=new Map<string,EntityCandidate>();
   const diagnostics:string[]=[];
   const append=(result:any)=>{
    diagnostics.push(...result.diagnostics);
    for(const m of result.matches){
     let row=candidates.get(m.id);
     if(!row){if(candidates.size===100){diagnostics.push('Candidate limit reached; refine the query.');continue;}candidates.set(m.id,row={id:m.id,name:m.name,evidence:[]});}
     if(row.evidence.length<50)row.evidence.push({kind:m.kind,text:m.text,...(m.kind==='mention'?{resourceId:m.resourceId,mentionId:m.mentionId,ranges:[{blockId:m.blockId,start:m.start,end:m.end}]}:{})});
    }
   };
   const snapshot=()=>({candidates:[...candidates.values()].map(row=>({...row,evidence:[...row.evidence]})).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)),complete:!diagnostics.length,diagnostics:[...new Set(diagnostics)],current});
   append(await request('entity-lookup',{vault:vaultRoot,request:{...base,stream:query.stream}},signal));current();
   if(query.stream==='all'){
    onProgress?.({...snapshot(),complete:false,diagnostics:[...diagnostics,'Searching saved indexed mentions.']});
    try{append(await request('entity-lookup',{vault:vaultRoot,request:{...base,stream:'mention'}},signal));}
    catch(error){current();diagnostics.push('Saved mention lookup unavailable: '+String(error));}
   }
   current();return snapshot();
  },
  dispose(){alive=false;if(lease){void request('release',{lease}).catch(()=>{});lease=undefined;}if(listingLease){void request('release',{lease:listingLease}).catch(()=>{});listingLease=undefined;}},
 };
}
