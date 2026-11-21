import {contentLength} from '../../../block-tree/inline-sequence';
import {lookupAuthority} from './authority-lookup';
import {entityService} from '../../../application/entity-service';
import {retrievalRequest} from '../../../application/retrieval-client';
import {nativeDocumentSession} from '../../../persistence/native-session';
import type {XmlContext} from './xml-context';
import {unwrap} from 'solid-js/store';
import {hasNativeSourceReader} from './reading';
import {resolveVocabulary,type VocabularySelection,type VocabularySnapshot} from './vocabulary';
import {inspectNative} from './inspection';
import {sourceScope,sourceIdentity} from './identities';
import {capabilityCatalogue} from './capabilities';
import {DcpInventory} from './inventory';
import {waitForQuery} from '../../../application/facts-query-provider';
import {ScopedEntities} from '../../../application/scoped-entities';
import {ENTITY_REFERENCE,entityReference,type ScopedEntityReference} from '../../../feature-api/scoped-entities';
import {argumentDefinition} from '../arguments';
import {canonicalSearchSource} from '../../../runtime/canonical-search-source';
import {keys} from './markup';
import type {ReactiveEditor} from '../../../reactive-editor/editor';
import type {BlockNode,ContentRecord} from '../../../block-tree/types';
import type {ReplyTarget} from '../model';
import {targetKey,contribution,onlyContributionNoticesChanged} from '../model';
import type {DialecticReferences,Resolution} from '../references';
function* edges(n:BlockNode){yield* n.children;for(const name in n.ownedRelations)yield n.ownedRelations[name];}
export type SourceStatus='complete'|'truncated'|'missing'|'ambiguous'|'unavailable'|'unauthorized';
export class DcpSources {
 xmlAuthoring?:XmlContext;
 readonly vocabulary:VocabularySnapshot|undefined;
 readonly capabilities:ReturnType<typeof capabilityCatalogue>|undefined;
 readonly handles=new Map<string,ReplyTarget>();
 private issued=new Map<string,string>();
 private readonly identityScope=sourceScope();
 readonly fences=new Map<string,ContentRecord>();
 readonly revisions=new Map<string,string>();
 readonly diagnostics={visited:0,characters:0,reads:0,searches:0,inventories:0,inventoryVisited:0,inventoryPreviewCells:0,entitySearches:0,entityCandidates:0,workspaceBytes:0};
 private inventory?:DcpInventory;
 private entityPages=new Map<string,{query:string;iterator:Iterator<ReplyTarget>}>();
 readonly trail:any[]=[];
 private callIds=new Set<string>();
 private glossValues=new Map<string,string>();
 private textCache=new Map<string,ReturnType<typeof canonicalSearchSource>>();
 private text(n:BlockNode){let pending=this.textCache.get(n.contentKey);if(!pending){pending=canonicalSearchSource(this.editor.repository.readState(),n.contentKey,0,this.signal,24000);this.textCache.set(n.contentKey,pending);}return pending;}
 private entityRevisions=new Map<string,number>();
 readonly entities:ScopedEntities;
 private ownAdmission=false;
 /** Refresh only fences touched by this exchange's validated native writes.
  * Unrelated edits still invalidate authority through the normal subscriber. */
 admitOwn<T>(operation:()=>T):T{this.check();this.ownAdmission=true;try{return operation();}finally{this.ownAdmission=false;}}
 private stale=false;private calls=0;private bytes=0;private deadline=Date.now()+30000;private stop:()=>void;
 constructor(readonly editor:ReactiveEditor,readonly owner:string,readonly roots:(fromOrdinal?:number)=>Iterable<BlockNode>,readonly node:(key:string)=>BlockNode|undefined,readonly parent:(key:string)=>BlockNode|undefined,readonly resolve:(t:ReplyTarget)=>Resolution,readonly signal:AbortSignal,readonly relations:(id:string)=>any[]=()=>[],deadlineMs=30000,readonly argumentsFor:(anchorId:string)=>string[]=()=>[],selection?:VocabularySelection,readonly references?:DialecticReferences){
  this.deadline=Date.now()+Math.min(300000,Math.max(1,deadlineMs));
  this.vocabulary=editor.features.dcpVocabularySelection?resolveVocabulary(editor,selection):undefined;
  if(editor.features.dcpCapabilityCatalogue)this.capabilities=capabilityCatalogue(editor,this.vocabulary);
  let rootNode=roots()[Symbol.iterator]().next().value as BlockNode|undefined;while(rootNode&&rootNode.viewType!=='document-block')rootNode=parent(rootNode.key);if(!rootNode)throw Error('Symposium placement unavailable');const rootKey=rootNode.key;
  this.entities=new ScopedEntities(editor,rootKey,owner);
  this.stop=editor.repository.subscribeChanges(change=>{for(const key of change.previousContents.keys())if(this.fences.has(key)){
   const current=editor.repository.readState().contents[key];
   if(this.ownAdmission){this.fences.set(key,current);this.textCache.delete(key);}
   else if(onlyContributionNoticesChanged(this.fences.get(key),current))this.fences.set(key,current);
   else this.stale=true;
  }});
 }
 check(){if(this.signal.aborted)throw Error('DCP cancelled');if(Date.now()>this.deadline)throw Error('DCP deadline exceeded');if(this.stale)throw Error('Selected context changed; request a fresh DCP response.');for(const [h,text]of this.glossValues)if(this.resolve(this.target(h)).text!==text)throw Error('Selected context changed');for(const [key,record]of this.fences)if(this.editor.repository.readState().contents[key]!==record)throw Error('Selected context changed; request a fresh DCP response.');}
 fence(key:string){const c=this.editor.repository.readState().contents[key];if(!c)throw Error('Source unavailable');if(!this.fences.has(key))this.fences.set(key,c);this.check();}
 issue(target:ReplyTarget){if(target.resourceId!==this.owner)throw Error('Outside Symposium');const key=targetKey(target);let handle=this.issued.get(key);if(!handle){handle=sourceIdentity(this.identityScope,target.kind,this.issued.size+1);this.issued.set(key,handle);this.handles.set(handle,structuredClone(unwrap(target)));}return handle;}
 target(handle:string){const target=this.handles.get(handle);if(!target)throw Error('Unauthorized source handle');return target;}
 committed(n:BlockNode){let cur:BlockNode|undefined=n;for(let depth=0;cur&&depth<128;depth++,cur=this.parent(cur.key)){const c=contribution((cur.payload.metadata as any)?.dialectic);if(c)return c.state==='committed';}return false;}
 definition(t:ReplyTarget){if(t.resourceId!==this.owner)throw Error('Definition belongs to another Document');this.fence(this.entities.root.contentKey);const id=t.anchorId??t.argumentId??t.definitionId??t.entity?.entityId;return id?this.entities.registry()[id]:undefined;}
 private async entityWork<T>(work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  this.check();const abort=new AbortController(),cancel=()=>abort.abort();this.signal.addEventListener('abort',cancel,{once:true});const timeout=setTimeout(cancel,Math.max(0,this.deadline-Date.now()));
  try{const result=await waitForQuery(work(abort.signal),abort.signal);this.check();return result;}
  finally{clearTimeout(timeout);this.signal.removeEventListener('abort',cancel);abort.abort();}
 }
 private async readEntity(ref:ScopedEntityReference){
  const e=await this.entityWork(signal=>this.entities.resolve(ref,signal));if(e&&ref.scope==='vault'){const key=JSON.stringify(ref),revision=this.entityRevisions.get(key);if(revision!==undefined&&revision!==e.revision)throw Error('Vault Entity changed; request fresh context');this.entityRevisions.set(key,e.revision);}return e;
 }
 async verifyVaultEntity(ref:ScopedEntityReference){const e=await this.readEntity(ref);if(!e)throw Error('Vault Entity unavailable');return e;}

 async source(handle:string):Promise<any> {
  this.check();const target=this.handles.get(handle);if(!target)return {status:'unauthorized',handle,reason:'This handle was not issued in the current exchange. Earlier committed Blocks remain discoverable; this is not a Document access denial. Discover the intended Block again, then read its new handle before authoring.',recovery:{tool:'list_text_blocks',arguments:{cursor:null,limit:20,contributionId:null,participantId:null,fromOrdinal:null}}};
  if(target.kind==='argument-relation'||target.kind==='entity-relation'){
   const d=this.definition(target),r=target.kind==='argument-relation'?d?.metadata?.dialecticArgumentRelation:d?.metadata?.scopedEntityRelation;if(!r||d.isDeleted)return {status:'missing',handle};
   const endpoint=(v:any)=>this.issue(target.kind==='argument-relation'?{kind:'argument',resourceId:this.owner,argumentId:v.argumentId}:{kind:'entity',resourceId:this.owner,entity:v});return {status:'complete',handle,kind:target.kind,definition:d,from:endpoint(r.from),to:endpoint(r.to)};
  }
  if(target.kind==='entity'){if(target.entity.scope==='document')this.fence(this.entities.root.contentKey);const entity=await this.readEntity(target.entity);this.check();return entity?{status:'complete',handle,kind:'entity',reference:target.entity,entity}:{status:'missing',handle,kind:'entity'};}
  if(target.kind==='argument'){const d=this.definition(target);if(!argumentDefinition(d)||d.isDeleted)return {status:'missing',handle};const anchor=this.issue({kind:'range',...d.metadata.dialecticArgument.anchor});const passage=await this.source(anchor);return {status:passage.status,handle,kind:'argument',identityExists:true,definition:d,relations:this.relations(target.argumentId).slice(0,64).map(d=>this.issue({kind:'argument-relation',resourceId:this.owner,definitionId:d.id})),anchor,passage,text:passage.text,historical:passage.historical};}
  const found=this.resolve(target);if(found.status!=='resolved')return {status:found.status==='ambiguous'?'ambiguous':found.status==='missing'?'missing':'unavailable',handle,reason:found.reason};
  const n=found.node;
  if(n&&!this.committed(n))return {status:'unauthorized',handle};
  let sourceAuthor='unknown',contributionInfo:any;
  if(n){this.fence(n.contentKey);let ancestor:BlockNode|undefined=n;for(let i=0;ancestor&&i<128;i++,ancestor=this.parent(ancestor.key)){const c=contribution((ancestor.payload.metadata as any)?.dialectic);if(c){this.fence(ancestor.contentKey);sourceAuthor=c.author;contributionInfo={handle:this.issue({kind:'contribution',resourceId:this.owner,blockId:String(ancestor.payload.id)}),blockId:String(ancestor.payload.id),author:c.author,participant:c.participant??null,ordinal:c.ordinal,createdUtc:c.createdUtc??null,replies:c.replies.slice(0,12).filter(t=>t.resourceId===this.owner).map(t=>this.issue(t)),discursiveReferences:(c.discursiveReferences??[]).slice(0,12).filter(t=>t.resourceId===this.owner).map(t=>this.issue(t))};break;}}}
  if(target.kind==='gloss')this.glossValues.set(handle,found.text??'');
  for(const s of found.segments??[])this.fence(s.contentKey);
  const revision=this.revisions.get(handle)??crypto.randomUUID();this.revisions.set(handle,revision);
  const base={handle,target,owner:this.owner,revision,kind:target.kind,sourceAuthor,contribution:contributionInfo};
  if(target.kind==='gloss'||target.kind==='range')return {status:'complete',...base,text:found.text??'',historical:found.historical};
  if(!n)return {status:'missing',...base};
  if(['mutable/markdown-source-block','mutable/html-source-block'].includes(n.viewType)&&typeof n.payload.text==='string'&&n.payload.text.length>24000)return {status:'truncated',...base,nativeType:n.viewType,reason:'Literal source exceeds the bounded UTF-16 read budget',omissions:['text']};
  if(contentLength(this.editor.repository.readState().contents[n.contentKey])>12000)return {status:'truncated',...base,reason:'Source Cell budget; select a smaller passage',omissions:['text']};
  const cached=await this.text(n);this.check();const objects=cached.runs.length>1,text=cached.runs.map(r=>r.text).join('\uFFFC');
  const children:string[]=[];let omitted=false;
  for(const key of edges(n)){if(children.length>=64){omitted=true;break;}const child=this.node(key);if(!child)continue;const t:ReplyTarget={kind:'block',resourceId:this.owner,blockId:String(child.payload.id)};const resolved=this.resolve(t);if(resolved.status!=='resolved'||resolved.node?.contentKey!==child.contentKey){omitted=true;continue;}children.push(this.issue(t));}
  const properties=n.payload.standoffProperties as any[]??[];
  const annotations:any[]=properties.slice(0,128).map(p=>({id:p.id,type:p.type,start:p.start,end:p.end,isDeleted:!!p.isDeleted,...(p.metadata?.dcp?{provenance:{actor:p.metadata.dcp.actor,exchangeId:p.metadata.dcp.exchangeId,protocol:p.metadata.dcp.protocol,sourceAuthor:p.metadata.dcp.sourceAuthor,appliedTo:p.metadata.dcp.appliedTo}}:{}),...(p.metadata?.unknownSemantic?{unknownSemantic:{type:String(p.metadata.unknownSemantic.type).slice(0,128),inert:true}}:{})}));
  const semanticReferences:string[]=[];
  for(let i=0;i<annotations.length;i++){
   const p=properties[i],a=annotations[i];if(p.isDeleted||p.externalDefinition||typeof p.annotationId!=='string')continue;
   if(p.type==='dialectic/range-anchor'){
    a.anchorHandle=this.issue({kind:'range',resourceId:this.owner,anchorId:p.annotationId});semanticReferences.push(a.anchorHandle);
    a.arguments=this.argumentsFor(p.annotationId).slice(0,16).map(argumentId=>this.issue({kind:'argument',resourceId:this.owner,argumentId}));semanticReferences.push(...a.arguments);
   }else if(p.type==='mutable/gloss'){a.glossHandle=this.issue({kind:'gloss',resourceId:this.owner,definitionId:p.annotationId});semanticReferences.push(a.glossHandle);}
  }
  {
   let vaultId:string|undefined,unavailable=false;
   for(let i=0;i<annotations.length;i++){const p=properties[i],a=annotations[i] as any;if(p.isDeleted)continue;
    let ref=p.type===ENTITY_REFERENCE&&entityReference(p.metadata?.entityReference)?p.metadata.entityReference:undefined;
    if(p.type==='codex/entity-reference'&&typeof p.value==='string'&&!p.externalDefinition){
     try{if(unavailable)throw Error('Vault unavailable');if(!vaultId){const r=await this.entityWork(signal=>this.entities.vaultReference(p.value,signal));if(r.scope==='vault')vaultId=r.vaultId;}ref={scope:'vault',vaultId,entityId:p.value};}
     catch{this.check();unavailable=true;a.omission='Vault identity unavailable; global Entity handle not issued';}
    }
    if(ref)a.entityHandle=this.issue({kind:'entity',resourceId:this.owner,entity:ref});
   }
  }
  const supported=hasNativeSourceReader(n.viewType);
  return {...base,status:omitted||properties.length>128?'truncated':supported?'complete':'unavailable',nativeType:n.viewType,text,children,annotations,semanticReferences:semanticReferences.slice(0,32),omissions:[...(!supported?['native view needs a DCP adapter']:[]),...(omitted?['children beyond budget or ownership']:[]),...(properties.length>128?['annotations beyond budget']:[]),...(objects?['inline objects: nontext placeholders; exact selectors unavailable']:[]),...(properties.some(p=>p.value||p.metadata?.unknownSemantic)?['additional annotation values/attributes are not exported by this profile']:[])],hasInlineObjects:objects};
 }
 /** Prepared once on explicit Ask. Never subscribed to typing or whole-history enumeration. */
 async manifest(handles:string[],byteBudget=64000,characterBudget=12000){
  const limits={sources:64,characters:Math.max(0,Math.min(24000,characterBudget)),bytes:Math.max(0,Math.min(64000,byteBudget)),depth:12};
  const queue=handles.map(handle=>({handle,depth:0})),seen=new Set<string>(),items:any[]=[];
  let characters=0,bytes=0,truncated=false;
  while(queue.length&&items.length<limits.sources){
   this.check();const {handle,depth}=queue.shift()!;if(seen.has(handle))continue;seen.add(handle);
   const source=await this.source(handle);this.check();
   const length=source.text?.length??0;
   const item={...source,exactAnchorEligible:source.status==='complete'&&source.kind==='block'&&source.nativeType==='standoff-editor-block'&&!source.hasInlineObjects};
   const size=new TextEncoder().encode(JSON.stringify(item)).length;
   if(characters+length>limits.characters||bytes+size>limits.bytes){truncated=true;break;}
   items.push(item);characters+=length;bytes+=size;
   if(depth<limits.depth){
    // Direct children and relevant definitions/relations only; queue is capped too.
    for(const child of [...source.children??[],...source.semanticReferences??[],...(source.relations??[]).slice(0,32)]){
     if(queue.length>=128){truncated=true;break;}if(!seen.has(child))queue.push({handle:child,depth:depth+1});
    }
   }else if(source.children?.length)truncated=true;
  }
  this.check();return {version:1,status:truncated||queue.length?'truncated':'complete',roots:handles,sources:items,limits,coverage:{sources:items.length,characters,bytes},omissions:truncated||queue.length?['Manifest budget reached; use issued handles for detailed retrieval.']:[]};
 }
 private record(call:any,result:any){const size=JSON.stringify(result).length;if((this.bytes+=size)>48000)throw Error('DCP retrieval result budget exceeded');this.trail.push({call,result});return result;}
 async tool(call:any){
  keys(call,['id','tool','arguments']);if(typeof call.id!=='string'||call.id.length>128||this.callIds.has(call.id))throw Error('Invalid/duplicate tool call');this.callIds.add(call.id);
  keys(call.arguments,call.tool==='lookup_authority'?['queries','limit']:call.tool==='search_entities'?['query','scope','limit',...(Object.hasOwn(call.arguments,'cursor')?['cursor']:[])]:call.tool==='describe_capabilities'?['ids']:call.tool==='read_source'?['handle']:call.tool==='list_text_blocks'?['cursor','limit','contributionId','participantId','fromOrdinal']:['query','limit']);
  this.check();if(++this.calls>6)throw Error('DCP tool-call budget exceeded');
  if(call.tool==='lookup_authority'){
   if(!this.editor.features.authorityCache)throw Error('Authority lookup disabled');
   const service=entityService(this.editor,this.entities.ownerKey);let vault='.';
   try{try{vault=await service.historyScope?.()??'.';}catch{this.check();}this.check();return this.record(call,await lookupAuthority(call.arguments,this.signal,vault,()=>this.check()));}finally{service.dispose();}
  }
  if(call.tool==='search_entities')return this.record(call,await this.searchEntities(call.arguments));
  if(call.tool==='describe_capabilities'){if(!this.capabilities)throw Error('Unavailable DCP tool');return this.record(call,this.capabilities.describe(call.arguments));}
  if(call.tool==='list_text_blocks'){this.diagnostics.inventories++;return this.record(call,(this.inventory??=new DcpInventory(this)).list(call.arguments));}
  if(call.tool==='read_source'){
   this.diagnostics.reads++;const result=await this.source(call.arguments.handle);
   if(result.kind&&['block','contribution'].includes(result.kind)&&!['unauthorized','missing','ambiguous'].includes(result.status))result.inspection=await inspectNative(this,result);
   // Never resolve a historical handle implicitly. Offer a small, freshly issued
   // inventory in the same Document so a failed read can recover explicitly.
   if(result.status==='unauthorized'&&result.recovery){this.diagnostics.inventories++;const arguments_={...result.recovery.arguments,limit:5};result.recovery={...result.recovery,arguments:arguments_,inventory:(this.inventory??=new DcpInventory(this)).list(arguments_)};result.reason+=' A fresh bounded inventory is attached under recovery.inventory; select the intended native blockId and call read_source with that new handle.';}
   return this.record(call,result);
  }
  if(call.tool!=='search_symposium')throw Error('Unavailable DCP tool');
  const {query,limit}=call.arguments;if(typeof query!=='string'||!query.length||query.length>512||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid search arguments');
  this.diagnostics.searches++;const items:any[]=[];let visited=0,characters=0,truncated=false;
  // A bounded lazy DFS, not a full scope enumeration before applying result limits.
  const stack:Iterator<BlockNode>[]=[this.roots()[Symbol.iterator]()],seen=new Set<string>();
  while(stack.length){this.check();const next=stack.at(-1)!.next();if(next.done){stack.pop();continue;}const n=next.value;
   if(++visited>512||this.diagnostics.visited>=512||this.diagnostics.characters>=100000){truncated=true;break;}this.diagnostics.visited++;
   if(seen.has(n.contentKey))continue;seen.add(n.contentKey);
   const t:ReplyTarget={kind:'block',resourceId:this.owner,blockId:String(n.payload.id)};const resolved=this.resolve(t);if(resolved.status!=='resolved'||resolved.node?.contentKey!==n.contentKey||!this.committed(n))continue;
   if(contentLength(this.editor.repository.readState().contents[n.contentKey])){if(contentLength(this.editor.repository.readState().contents[n.contentKey])>12000){truncated=true;continue;}const handle=this.issue(t),source=await this.source(handle);characters+=source.text?.length??0;this.diagnostics.characters+=source.text?.length??0;
    if(characters>100000){truncated=true;break;}if(source.text?.includes(query))items.push({...source,excerpt:source.text.slice(Math.max(0,source.text.indexOf(query)-50),source.text.indexOf(query)+query.length+100)});
    if(items.length>=limit){truncated=true;break;}}
   if(stack.length>=32){truncated=true;continue;}
   const self=this;stack.push((function*(){for(const key of edges(n)){const child=self.node(key);if(child)yield child;}})());
   if(visited%32===0)await new Promise(r=>setTimeout(r,0));
  }
  let semanticStatus='disabled';
  if(this.editor.features.semanticRetrieval&&items.length<limit){
   const native=nativeDocumentSession(this.editor),saved=native.knowledgeEvidence(this.owner);
   if(!saved.location||saved.pending||native.isDirty(this.owner))semanticStatus='Unsaved Symposium: live lexical discovery retained; saved semantic coverage is incomplete';
   else try{
    const result=await retrievalRequest('query',{query,strategy:'hybrid',resourceId:this.owner,limit,key:`dcp:${this.owner}`},AbortSignal.any([this.signal,AbortSignal.timeout(5000)]));this.check();
    const now=native.knowledgeEvidence(this.owner);if(native.isDirty(this.owner)||now.pending||now.byteHash!==saved.byteHash)throw Error('Symposium changed during retrieval');
    for(const hit of result.results){
     if(hit.source.resourceId!==this.owner||hit.source.sourceHash!==saved.byteHash)continue;
     for(const span of hit.source.spans??[]){if(items.length>=limit)break;if(span.resourceId!==this.owner)continue;
      const target:ReplyTarget={kind:'block',resourceId:this.owner,blockId:span.blockGuid},resolved=this.resolve(target);
      if(resolved.status!=='resolved'||!resolved.node||!this.committed(resolved.node)||items.some(i=>i.target?.blockId===span.blockGuid))continue;
      const source=await this.source(this.issue(target));this.check();const exact=hit.text.slice(span.chunkStart,span.chunkEnd);
      if(source.status!=='complete'||!exact||!source.text?.includes(exact))continue;
      if(this.diagnostics.characters+source.text.length>100000){truncated=true;break;}this.diagnostics.characters+=source.text.length;
      items.push({handle:source.handle,target:source.target,owner:source.owner,kind:source.kind,revision:source.revision,sourceAuthor:source.sourceAuthor,contribution:source.contribution,excerpt:exact.slice(0,500),readRequired:true,retrieval:'saved-semantic'});
     }
    }semanticStatus='Partial saved semantic coverage; native handles reissued in this exchange';
   }catch{this.check();semanticStatus='Semantic retrieval unavailable; live lexical discovery retained';}
  }
  return this.record(call,{status:truncated?'truncated':'complete',items,semanticStatus,coverage:{visited:Math.min(visited,512),characters},omissions:truncated?['Search result, traversal or character budget']:[]});
 }
 async searchEntities(input:any){
  if(!this.editor.features.dcpSemanticWorkspace||!this.editor.features.scopedSemantics||!this.references)throw Error('Entity discovery unavailable');
  keys(input,['query','scope','limit',...(Object.hasOwn(input,'cursor')?['cursor']:[])]);const {query,scope,limit}=input;const cursor=input.cursor??null;
  if(typeof query!=='string'||!query.trim()||query.length>256||!['document','vault'].includes(scope)||!Number.isInteger(limit)||limit<1||limit>12)throw Error('Invalid Entity discovery arguments');
  if(cursor!==null&&(typeof cursor!=='string'||scope!=='document'))throw Error('Invalid Entity cursor');
  this.diagnostics.entitySearches++;const items:any[]=[];let visited=0,partial=false,nextCursor:string|null=null;
  if(scope==='document'){
   this.fence(this.entities.root.contentKey);const needle=query.toLocaleLowerCase();
   const page=cursor?this.entityPages.get(cursor):{query,iterator:this.references.semanticEntityCandidates()};
   if(!page||page.query!==query)throw Error('Stale or mismatched Entity cursor');if(cursor)this.entityPages.delete(cursor);
   let done=false;
   while(visited<512&&items.length<limit){
    this.check();const next=page.iterator.next();if(next.done){done=true;break;}visited++;const t=next.value,e=this.entities.local(t.entity!);if(!e)continue;
    if(![e.name,...e.aliases.map((a:{name:string})=>a.name)].some(n=>n.toLocaleLowerCase().includes(needle)))continue;
    items.push(await this.semanticEntity(t));
   }
   if(!done){partial=true;nextCursor=crypto.randomUUID();this.entityPages.set(nextCursor,page);}
  }else{
   const {vaultId,result}=await this.entityWork(signal=>this.entities.searchVault(query,signal));partial=!result.complete||result.candidates.length>limit;
   for(const c of result.candidates.slice(0,limit)){visited++;const item=await this.semanticEntity({kind:'entity',resourceId:this.owner,entity:{scope:'vault',vaultId,entityId:c.id}});if(item)items.push(item);}
  }
  this.check();this.diagnostics.entityCandidates+=visited;
  return {status:partial?'partial':'complete',scope,nextCursor,items:items.filter(Boolean),coverage:{visited,limit,complete:!partial},omissions:partial?[scope==='document'?'Bounded candidate coverage; continue nextCursor with the same query. Absence is not proof of nonexistence.':'Bounded Vault coverage; refine the query. Absence is not proof of nonexistence.']:[]};
 }
 /** Workspace and discovery share current native resolution and handle issuance. */
 async semanticEntity(t:ReplyTarget){
  if(t.kind!=='entity')throw Error('Expected scoped Entity');
  if(t.entity.scope==='document')this.fence(this.entities.root.contentKey);
  const e=await this.readEntity(t.entity);if(!e)return;
  return {handle:this.issue(t),identity:structuredClone(unwrap(t.entity)),revision:e.revision,name:e.name,typename:e.typename??null,description:(e.description??'').slice(0,240),aliases:e.aliases.slice(0,8).map((a:{name:string})=>a.name),...(this.editor.features.dcpEntityEnrichment?{authority:(e.attributes as any)?.authorityMetadata?{...(e.attributes as any).authorityMetadata,canonical:(e.attributes as any)?.canonicalAssociation?{scope:'vault',vaultId:(e.attributes as any).canonicalAssociation.vaultId,entityId:(e.attributes as any).canonicalAssociation.entityId,status:'recorded association; discover and verify before canonical use'}:undefined}:undefined,enrichment:((e.attributes as any)?.enrichment?{subtypes:(e.attributes as any).enrichment.subtypes,dates:(e.attributes as any).enrichment.dates,externalIds:(e.attributes as any).enrichment.externalIds}:undefined)}:{}),omissions:[...((e.description?.length??0)>240?['description']:[]),...(e.aliases.length>8?['aliases']:[])]};
 }
 async exact(handle:string,revision:string,selector:{exact:string;prefix:string;suffix:string}){
  const source=await this.source(handle),target=this.target(handle),n=this.resolve(target).node;
  if(source.status!=='complete'||!n||n.viewType!=='standoff-editor-block'||source.hasInlineObjects||source.revision!==revision||target.kind!=='block')throw Error('Exact anchor source unavailable or stale');
  const {exact,prefix,suffix}=selector;if(typeof exact!=='string'||!exact.length||exact.length>8192||typeof prefix!=='string'||prefix.length>2048||typeof suffix!=='string'||suffix.length>2048)throw Error('Invalid exact selector');
  const matches:number[]=[];for(let at=source.text.indexOf(exact);at>=0;at=source.text.indexOf(exact,at+1))if(source.text.slice(0,at).endsWith(prefix)&&source.text.slice(at+exact.length).startsWith(suffix))matches.push(at);
  if(matches.length!==1)throw Error(matches.length?'Ambiguous exact anchor':'Missing exact anchor');
  const boundaries=(await this.text(n)).runs[0].boundaries!;
  const start=boundaries[matches[0]],end=boundaries[matches[0]+exact.length];if(start===undefined||end===undefined||start<0||end<0)throw Error('Selector splits a Cell');
  return {node:n,start,end,text:exact,sourceAuthor:source.sourceAuthor};
 }
 dispose(){this.entityPages.clear();this.inventory?.dispose();this.stop();this.entities.dispose();}
}
