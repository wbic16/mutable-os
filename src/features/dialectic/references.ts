import {contentLength,contentSlice,inlineText} from '../../block-tree/inline-sequence';
import {argumentDefinition,argumentRelation} from './arguments';
import {localEntity,localEntityRelation,entityReference} from '../../feature-api/scoped-entities';
import {batch,createSignal,untrack,type Accessor} from 'solid-js';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {BlockTreeProjection} from '../../block-tree/projection';
import type {BlockNode,ContentRecord} from '../../block-tree/types';
import {glossOwner} from '../../block-tree/gloss-plan';
import {glossDefinition,GLOSS} from '../gloss/model';
import {RANGE_ANCHOR,rangeDefinition} from './anchors';
import {contribution,targetKey,type ReplyTarget} from './model';
export interface Segment {contentKey:string;id:string;start:number;end:number;node:BlockNode}
export interface Resolution {status:'resolved'|'unanchored'|'missing'|'ambiguous'|'invalid'|'outside-document';reason?:string;node?:BlockNode;segments?:Segment[];text?:string;historical?:string;changed?:boolean;identityExists?:boolean;argumentId?:string}
export interface ActivityProperty {id:string;type:string;annotationId?:string;active:boolean;exchangeId?:string;sourceResourceId?:string;appliedTo?:string;entity?:import('../../feature-api/scoped-entities').ScopedEntityReference}
type Entry={record:ContentRecord;edges:Map<string,string>;anchors:Set<string>;activity:Map<string,ActivityProperty>;contributionState?:string;contentsOwner?:string;coverage?:Map<string,ReplyTarget>};
const propertyKey=(p:ActivityProperty)=>JSON.stringify(p);
/** One derived index per retained Document session. Only affected canonical
 * records and inserted/removed subtrees are read after initialisation. */
export class DialecticReferences {
 readonly diagnostics={treeVisits:0,propertyReads:0,recordUpdates:0,definitionReads:0,contentsUpdates:0,contentsReads:0,excerptReads:0,workspaceBuilds:0};
 private contentsMembership=new Map<string,Map<string,{target:ReplyTarget;blocks:Set<string>}>>();
 private argumentAnchors=new Map<string,string>();private anchorArguments=new Map<string,Set<string>>();private edgeEndpoints=new Map<string,string[]>();private argumentEdges=new Map<string,Set<string>>();
 private entries=new Map<string,Entry>();private blocks=new Map<string,Set<string>>();private anchors=new Map<string,Set<string>>();
 // Identity-only semantic selection indexes. Native records remain authoritative.
 private semanticDefinitions=new Map<string,ReplyTarget>();
 private semanticEntityIds=new Set<string>();
 private semanticEdgeEndpoints=new Map<string,string[]>();private semanticEdges=new Map<string,Set<string>>();
 private semanticByBlock=new Map<string,Map<string,ReplyTarget>>();
 private semanticMentions=new Map<string,{target:ReplyTarget;blocks:Set<string>}>();
 private central:string[]=[];
 private semanticRecent=new Map<string,ReplyTarget>();
 readonly semanticDiagnostics={membershipUpdates:0,candidates:0};
 private rememberSemantic(t:ReplyTarget){const k=targetKey(t);this.semanticRecent.delete(k);this.semanticRecent.set(k,t);if(this.semanticRecent.size>64)this.semanticRecent.delete(this.semanticRecent.keys().next().value!);}
 private committedSemanticContent(key:string){let n:BlockNode|undefined=this.node(key);for(let depth=0;n&&depth<128;depth++,n=this.projection.parentOf(n.key)){const c=contribution((n.payload.metadata as any)?.dialectic);if(c)return c.state==='committed';}return false;}
 private indexMentions(key:string,items:Map<string,ReplyTarget>){
  const old=this.semanticByBlock.get(key)??new Map<string,ReplyTarget>();
  if(old.size===items.size&&[...items.keys()].every(id=>old.has(id)))return;
  this.semanticDiagnostics.membershipUpdates++;
  for(const id of new Set([...old.keys(),...items.keys()])){
   let entry=this.semanticMentions.get(id);if(!entry&&items.has(id)){entry={target:items.get(id)!,blocks:new Set()};this.semanticMentions.set(id,entry);}
   if(!entry)continue;
   if(items.has(id)){entry.blocks.add(key);if(!old.has(id))this.rememberSemantic(entry.target);}else entry.blocks.delete(key);
   this.central=this.central.filter(k=>k!==id);
   if(!entry.blocks.size){this.semanticMentions.delete(id);this.semanticRecent.delete(id);}else if(entry.target.kind==='entity')this.central.push(id);
   this.central.sort((a,b)=>(this.semanticMentions.get(b)?.blocks.size??0)-(this.semanticMentions.get(a)?.blocks.size??0));this.central.length=Math.min(16,this.central.length);
  }
  if(items.size)this.semanticByBlock.set(key,items);else this.semanticByBlock.delete(key);
 }
 /** Bounded tier selection, independent of conversation length and UI activity. */
 semanticCandidates(focus:ReplyTarget[]=[]){
  const out=new Map<string,ReplyTarget>(),add=(t:ReplyTarget)=>{if(out.size<48)out.set(targetKey(t),t);};
  for(const t of focus.slice(0,12)){
   if(!['block','contribution'].includes(t.kind)){add(t);const anchor=t.kind==='range'?t.anchorId:t.kind==='argument'?this.argumentAnchors.get(t.argumentId):undefined;if(anchor){let count=0;for(const key of this.anchors.get(anchor)??[]){if(count++===12)break;for(const v of this.semanticByBlock.get(key)?.values()??[])add(v);}for(const id of this.anchorArguments.get(anchor)??[])add({kind:'argument',resourceId:this.resourceId,argumentId:id});}}
   else {const keys=this.blocks.get(t.blockId!);for(const key of keys??[])for(const v of this.semanticByBlock.get(key)?.values()??[])add(v);}
  }
  // Reserve central concepts before filling with recent objects. The bounded
  // central list is changed only by genuine native reference membership edits.
  for(const k of this.central.slice(0,6)){const e=this.semanticMentions.get(k);if(e)add(e.target);}
  for(const t of [...this.semanticRecent.values()].reverse().slice(0,24))add(t);
  for(const t of [...out.values()]){const ids=t.kind==='entity'?this.semanticEdges.get(targetKey(t)):t.kind==='argument'?this.argumentEdges.get(t.argumentId):undefined;let count=0;for(const id of ids??[]){if(count++===3)break;add({kind:t.kind==='entity'?'entity-relation':'argument-relation',resourceId:this.resourceId,definitionId:id});}}
  this.semanticDiagnostics.candidates+=out.size;return {targets:[...out.values()],indexed:this.semanticDefinitions.size,partial:true};
 }
 *semanticEntityCandidates(){for(const id of this.semanticEntityIds)yield this.semanticDefinitions.get(id)!;}
 semanticLocations(t:ReplyTarget){const keys=this.semanticMentions.get(targetKey(t))?.blocks,out:ReplyTarget[]=[];for(const k of keys??[]){out.push({kind:'block',resourceId:this.resourceId,blockId:String(this.entries.get(k)?.record.payload.id)});if(out.length===3)break;}return out;}
 /** Current coverage uses retained native references, never inferred creation provenance. */
 private contentsOwner(key:string){let n:BlockNode|undefined=this.node(key);for(let depth=0;n&&depth<128;depth++,n=this.projection.parentOf(n.key)){const c=contribution((n.payload.metadata as any)?.dialectic);if(c)return c.state==='draft'?undefined:String(n.payload.id);}return undefined;}
 private indexContents(key:string,owner:string|undefined,items:Map<string,ReplyTarget>){
  const old=this.entries.get(key),previous=old?.coverage??new Map<string,ReplyTarget>();
  if(old?.contentsOwner===owner&&previous.size===items.size&&[...items.keys()].every(k=>previous.has(k)))return;
  this.diagnostics.contentsUpdates++;
  for(const [id,refs,add]of [[old?.contentsOwner,previous,false],[owner,items,true]] as const){
   if(!id)continue;let membership=this.contentsMembership.get(id);if(!membership)this.contentsMembership.set(id,membership=new Map());
   for(const [name,target]of refs){let entry=membership.get(name);if(add){if(!entry)membership.set(name,entry={target,blocks:new Set()});entry.blocks.add(key);}else if(entry){entry.blocks.delete(key);if(!entry.blocks.size)membership.delete(name);}}
   if(!membership.size)this.contentsMembership.delete(id);this.stamp('contents:'+id).bump();
  }
 }
 contentsTargets(id:string){
  this.stamp('contents:'+id).get();this.diagnostics.contentsReads++;
  const out=new Map<string,ReplyTarget>(),add=(t:ReplyTarget)=>{
   let active=t.kind==='entity'&&t.entity.scope==='vault';
   if(t.kind==='entity-relation'){const d=this.activityDefinition(t.definitionId),r=d?.metadata?.scopedEntityRelation;active=localEntityRelation(d)&&!d.isDeleted&&r.resourceId===this.resourceId&&[r.from,r.to].every(entity=>entity.scope==='vault'||this.activityTarget({kind:'entity',resourceId:this.resourceId,entity}));}
   else active ||= this.activityTarget(t);
   if(active)out.set(targetKey(t),t);
  };
  for(const {target:t}of this.contentsMembership.get(id)?.values()??[]){
   if(t.kind==='range'){if(this.activityTarget(t))for(const arg of this.argumentsFor(t.anchorId))add({kind:'argument',resourceId:this.resourceId,argumentId:arg});}
   else add(t);
  }
  for(const t of [...out.values()]){
   if(t.kind==='entity'){const key=targetKey(t);this.stamp('semantic-edges:'+key).get();for(const id of this.semanticEdges.get(key)??[])add({kind:'entity-relation',resourceId:this.resourceId,definitionId:id});}
   else if(t.kind==='argument'){for(const d of this.relationsFor(t.argumentId))add({kind:'argument-relation',resourceId:this.resourceId,definitionId:d.id});}
  }
  return [...out.values()];
 }
 contentsExcerpt(id:string){
  this.diagnostics.excerptReads++;const keys=this.blocks.get(id);if(keys?.size!==1)return '';
  const pending=[keys.values().next().value!];let visited=0;
  while(pending.length&&visited++<32){const key=pending.shift()!,entry=this.entries.get(key);if(!entry)continue;
   if(entry.record.inlineKind==='standoff'){const text=this.text(key,0,120).replace(/\s+/g,' ').trim();if(text)return text.split(' ').slice(0,8).join(' ').slice(0,96);}
   pending.unshift(...entry.edges.values());
  }return '';
 }
 private stamps=new Map<string,{get:Accessor<number>;bump:()=>void}>();private stop:()=>void;
 private evidence={locationOf:(k:string)=>this.editor.repository.locationOf(k),ownedKeys:(k:string)=>this.editor.repository.ownedPlacementKeys(k)};
 readonly owner:string;readonly resourceId:string;
 constructor(readonly editor:ReactiveEditor,readonly projection:BlockTreeProjection,readonly rootKey:string){
  const root=projection.node(rootKey)!;this.owner=root.contentKey;this.resourceId=String((root.payload.metadata as any)?.documentId??root.payload.id);
  this.visit(this.owner);
  this.stop=editor.repository.subscribeChanges(change=>batch(()=>untrack(()=>{
   if(change.structural?.sequenceMetadataOwner||change.structural?.preferencesMetadataOwner||change.inlineOwner&&!this.entries.has(change.inlineOwner))return;
   for(const [key,old]of change.previousContents){
    const next=editor.repository.readState().contents[key];
    if(next?.viewType==='text-cell'||next?.viewType==='image-cell'||!next&&['text-cell','image-cell'].includes(old?.viewType??''))continue;
    if(this.entries.has(key)||this.belongs(key))this.update(key,change.structural?.definitionChanges?.owner===key?change.structural.definitionChanges.ids:undefined,old);
   }
  })));
 }
 /** Semantic membership only. Offset rebasing never rebuilds this inventory. */
 workspaceInventory(){
  this.stamp('workspace').get();
  return untrack(()=>{
   this.diagnostics.workspaceBuilds++;
   const registry=this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations as Record<string,any>??{};
   const definitions=[...this.semanticDefinitions.keys()].map(id=>registry[id]).filter(d=>d&&!d.isDeleted);
   const properties:Array<{blockId:string;propertyId:string;type:string;excerpt?:string;entity?:import('../../feature-api/scoped-entities').ScopedEntityReference;contributionId?:string;annotationId?:string}>=[];
   for(const entry of this.entries.values())for(const p of entry.activity.values())if(p.active&&(p.entity||p.type.startsWith('dialectic/'))){const claim=p.type==='dialectic/claim'?(entry.record.payload.standoffProperties as any[]).find(v=>v.id===p.id):undefined;properties.push({blockId:String(entry.record.payload.id),propertyId:p.id,type:p.type,...claim?{excerpt:this.text(entry.record.key,claim.start,Math.min(claim.end+1,claim.start+160))}:{},entity:p.entity,contributionId:entry.contentsOwner,annotationId:p.annotationId});}
   const media=[...this.entries.values()].filter(e=>['image-block','video-block','audio-block','youtube-video-block'].includes(e.record.viewType)).map(e=>({blockId:String(e.record.payload.id),type:e.record.viewType,contributionId:e.contentsOwner,asset:e.record.payload.asset,filename:e.record.payload.filename,metadata:e.record.payload.metadata as Record<string,any>}));
   return {definitions,properties,media};
  });
 }
 private stamp(id:string){let s=this.stamps.get(id);if(!s){const [get,set]=createSignal(0);s={get,bump:()=>set(n=>n+1)};this.stamps.set(id,s);}return s;}
 private belongs(key:string){return !!this.projection.nodesForContent(key).length&&glossOwner(this.editor.repository.readState(),key,this.evidence)===this.owner;}
 private edgeMap(c:ContentRecord){const state=this.editor.repository.readState();return new Map([...c.children,...Object.values(c.ownedRelations)].flatMap(k=>{const p=state.placements[k];return p&&!p.externalReference?[[k,p.contentKey] as const]:[];}));}
 private visit(key:string){if(this.entries.has(key)||!this.belongs(key))return;this.diagnostics.treeVisits++;this.update(key);}
 private remove(key:string){const old=this.entries.get(key);if(!old)return;this.indexContents(key,undefined,new Map());this.indexMentions(key,new Map());this.entries.delete(key);if(this.editor.features.dialecticSemanticsWorkspace&&(key===this.owner||['image-block','video-block','audio-block','youtube-video-block'].includes(old.record.viewType)||[...old.activity.values()].some(p=>p.entity||p.type.startsWith('dialectic/'))))this.stamp('workspace').bump();this.blocks.get(String(old.record.payload.id))?.delete(key);this.stamp('b:'+String(old.record.payload.id)).bump();this.stamp('activity:b:'+String(old.record.payload.id)).bump();for(const id of old.anchors){this.anchors.get(id)?.delete(key);this.stamp('a:'+id).bump();this.stamp('activity:a:'+id).bump();}for(const child of old.edges.values())if(!this.belongs(child))this.remove(child);}
 private update(key:string,definitionIds?:string[],previousRecord?:ContentRecord){
  const old=this.entries.get(key),c=this.editor.repository.readState().contents[key];if(!c||!this.belongs(key)){this.remove(key);return;}
  this.diagnostics.recordUpdates++;
  if(this.editor.features.dialecticSemanticsWorkspace&&['image-block','video-block','audio-block','youtube-video-block'].includes(c.viewType)&&(!old||old.record.viewType!==c.viewType||JSON.stringify([(previousRecord??old.record).payload.metadata,(previousRecord??old.record).payload.asset,(previousRecord??old.record).payload.filename])!==JSON.stringify([c.payload.metadata,c.payload.asset,c.payload.filename])))this.stamp('workspace').bump();
  const edges=this.edgeMap(c),ids=new Set<string>(),activity=new Map<string,ActivityProperty>(),semantic=new Map<string,ReplyTarget>();let committed:boolean|undefined;
  if(c.inlineKind==='standoff'){this.diagnostics.propertyReads++;for(const p of (c.payload.standoffProperties??[]) as any[]){
   if(this.editor.features.dcpSemanticWorkspace&&!p.isDeleted&&!p.externalDefinition){
    const ref=p.metadata?.entityReference;
    let t:ReplyTarget|undefined;
    if(entityReference(ref))t={kind:'entity',resourceId:this.resourceId,entity:ref};
    else if(p.type===GLOSS&&typeof p.annotationId==='string')t={kind:'gloss',resourceId:this.resourceId,definitionId:p.annotationId};
    else if(p.type.startsWith('dialectic/')&&p.type!==RANGE_ANCHOR)t={kind:'block',resourceId:this.resourceId,blockId:String(c.payload.id)};
    if(t&&(committed??=this.committedSemanticContent(key)))semantic.set(targetKey(t),t);
   }
   if(p.type===RANGE_ANCHOR&&!p.isDeleted&&typeof p.annotationId==='string')ids.add(p.annotationId);
   // Reuse the affected-record property pass. Offsets are deliberately absent:
   // ordinary rebasing must not invalidate contribution activity or read text.
   if((this.editor.features.dialecticSemanticsWorkspace||this.editor.features.dialecticContributionActivity||this.editor.features.dialecticSemanticContents)&&typeof p.id==='string'){
    const d=p.metadata?.dcp,ref=p.metadata?.entityReference;
    activity.set(p.id,{id:p.id,type:p.type,annotationId:p.annotationId,active:!p.isDeleted&&!p.externalDefinition&&Number.isInteger(p.start)&&Number.isInteger(p.end)&&p.start>=0&&p.end>=p.start&&p.end<contentLength(c),exchangeId:d?.exchangeId,sourceResourceId:d?.sourceResourceId,appliedTo:d?.appliedTo,...(entityReference(ref)?{entity:{...ref}}:{})});
   }
  }}
  if(this.editor.features.dcpSemanticWorkspace)this.indexMentions(key,semantic);
  for(const id of new Set([...old?.anchors??[],...ids])){let keys=this.anchors.get(id);if(!keys)this.anchors.set(id,keys=new Set());ids.has(id)?keys.add(key):keys.delete(key);this.stamp('a:'+id).bump();}
  const id=String(c.payload.id);if(old&&old.record.payload.id!==id)this.blocks.get(String(old.record.payload.id))?.delete(key);
  let keys=this.blocks.get(id);if(!keys)this.blocks.set(id,keys=new Set());keys.add(key);
  const activityChanged=!old||old.record.payload.id!==c.payload.id||old.record.viewType!==c.viewType||old.contributionState!==contribution((c.payload.metadata as any)?.dialectic)?.state||old.activity.size!==activity.size||[...activity].some(([id,p])=>propertyKey(p)!==propertyKey(old.activity.get(id)!));
  if(this.editor.features.dialecticSemanticsWorkspace&&activityChanged){
   const relevant=(items:Map<string,ActivityProperty>)=>[...items.values()].filter(p=>p.entity||p.type.startsWith('dialectic/')).map(propertyKey).join('|');
   if(relevant(old?.activity??new Map())!==relevant(activity)||!!relevant(activity)&&old?.contributionState!==contribution((c.payload.metadata as any)?.dialectic)?.state)this.stamp('workspace').bump();
  }
  const contentsOwner=(this.editor.features.dialecticSemanticContents||this.editor.features.dialecticSemanticsWorkspace)?this.contentsOwner(key):undefined,coverage=new Map<string,ReplyTarget>();
  if(contentsOwner)for(const p of activity.values())if(p.active){let t:ReplyTarget|undefined;
   if(p.entity)t={kind:'entity',resourceId:this.resourceId,entity:p.entity};
   else if(p.type===GLOSS&&p.annotationId)t={kind:'gloss',resourceId:this.resourceId,definitionId:p.annotationId};
   else if(p.type===RANGE_ANCHOR&&p.annotationId)t={kind:'range',resourceId:this.resourceId,anchorId:p.annotationId};
   if(t)coverage.set(targetKey(t),t);
  }
  if(this.editor.features.dialecticSemanticContents)this.indexContents(key,contentsOwner,coverage);
  this.entries.set(key,{record:c,edges,anchors:ids,activity,contributionState:contribution((c.payload.metadata as any)?.dialectic)?.state,contentsOwner,coverage});this.stamp('b:'+id).bump();
  if((this.editor.features.dialecticSemanticsWorkspace||this.editor.features.dialecticContributionActivity||this.editor.features.dialecticSemanticContents)&&activityChanged){this.stamp('activity:b:'+id).bump();if(old&&old.record.payload.id!==id)this.stamp('activity:b:'+String(old.record.payload.id)).bump();for(const anchor of new Set([...old?.anchors??[],...ids]))this.stamp('activity:a:'+anchor).bump();}
  if(key===this.owner){const before:any=(previousRecord??old?.record)?.payload.linkedAnnotations??{},after:any=c.payload.linkedAnnotations??{};if(before!==after||definitionIds)for(const id of definitionIds??new Set([...Object.keys(before),...Object.keys(after)])){this.diagnostics.definitionReads++;if(definitionIds||JSON.stringify(before[id])!==JSON.stringify(after[id])){this.indexDefinition(id,after[id]);this.stamp('a:'+id).bump();this.stamp('activity:d:'+id).bump();}}}
  for(const [pk,child]of old?.edges??[])if(!edges.has(pk)&&!this.belongs(child))this.remove(child);
  for(const [pk,child]of edges)if(!old?.edges.has(pk))this.visit(child);
  if(old&&(this.editor.features.dialecticSemanticsWorkspace||this.editor.features.dcpSemanticWorkspace||this.editor.features.dialecticSemanticContents)&&old.contributionState!==contribution((c.payload.metadata as any)?.dialectic)?.state){
   // Submission changes eligibility without necessarily changing descendant text.
   // Refresh this affected contribution only, never other Documents or typing.
   const pending=[...edges.values()],seen=new Set<string>();while(pending.length){const child=pending.pop()!;if(seen.has(child))continue;seen.add(child);this.update(child);pending.push(...this.entries.get(child)?.edges.values()??[]);}
  }
 }
 private indexDefinition(id:string,d:any){
  if(this.editor.features.dialecticSemanticsWorkspace)this.stamp('workspace').bump();
  if(this.editor.features.dialecticSemanticsWorkspace||this.editor.features.dcpSemanticWorkspace||this.editor.features.dialecticSemanticContents){
   for(const endpoint of this.semanticEdgeEndpoints.get(id)??[]){this.semanticEdges.get(endpoint)?.delete(id);this.stamp('semantic-edges:'+endpoint).bump();}this.semanticEdgeEndpoints.delete(id);
   if(localEntityRelation(d)&&!d.isDeleted){const r=d.metadata.scopedEntityRelation,endpoints=[r.from,r.to].map(entity=>targetKey({kind:'entity',resourceId:this.resourceId,entity}));this.semanticEdgeEndpoints.set(id,endpoints);for(const endpoint of endpoints){let ids=this.semanticEdges.get(endpoint);if(!ids)this.semanticEdges.set(endpoint,ids=new Set());ids.add(id);this.stamp('semantic-edges:'+endpoint).bump();}}
   this.semanticEntityIds.delete(id);const prior=this.semanticDefinitions.get(id);if(prior){this.semanticRecent.delete(targetKey(prior));this.semanticDefinitions.delete(id);}
   let t:ReplyTarget|undefined;
   if(d&&!d.isDeleted){
    if(localEntity(d)&&!d.metadata.scopedEntity.entity.deletedUtc)t={kind:'entity',resourceId:this.resourceId,entity:{scope:'document',resourceId:this.resourceId,entityId:id}};
    else if(argumentDefinition(d))t={kind:'argument',resourceId:this.resourceId,argumentId:id};
    else if(argumentRelation(d))t={kind:'argument-relation',resourceId:this.resourceId,definitionId:id};
    else if(localEntityRelation(d))t={kind:'entity-relation',resourceId:this.resourceId,definitionId:id};
    else if(glossDefinition(d))t={kind:'gloss',resourceId:this.resourceId,definitionId:id};
   }
   if(t){this.semanticDefinitions.set(id,t);if(t.kind==='entity')this.semanticEntityIds.add(id);this.rememberSemantic(t);}
  }
  const old=this.argumentAnchors.get(id);if(old){this.anchorArguments.get(old)?.delete(id);this.stamp('a:'+old).bump();}this.argumentAnchors.delete(id);
  for(const endpoint of this.edgeEndpoints.get(id)??[]){this.argumentEdges.get(endpoint)?.delete(id);this.stamp('edges:'+endpoint).bump();}this.edgeEndpoints.delete(id);
  if(d?.isDeleted)return;
  if(argumentDefinition(d)){const anchor=d.metadata.dialecticArgument.anchor.anchorId;this.argumentAnchors.set(id,anchor);let set=this.anchorArguments.get(anchor);if(!set)this.anchorArguments.set(anchor,set=new Set());set.add(id);this.stamp('a:'+anchor).bump();}
  if(argumentRelation(d)){const r=d.metadata.dialecticArgumentRelation,endpoints=[r.from.argumentId,r.to.argumentId];this.edgeEndpoints.set(id,endpoints);for(const endpoint of endpoints){let set=this.argumentEdges.get(endpoint);if(!set)this.argumentEdges.set(endpoint,set=new Set());set.add(id);this.stamp('edges:'+endpoint).bump();}}
 }
 argumentsFor(anchorId:string){this.stamp('a:'+anchorId).get();return [...this.anchorArguments.get(anchorId)??[]];}
 relationsFor(argumentId:string){this.stamp('edges:'+argumentId).get();const registry:any=this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations??{};return [...this.argumentEdges.get(argumentId)??[]].map(id=>registry[id]).filter(Boolean);}
 /** Activity checks never resolve passage text or subscribe to offset stamps. */
 activityBlock(id:string){this.stamp('activity:b:'+id).get();const keys=this.blocks.get(id);return keys?.size===1?this.entries.get(keys.values().next().value!):undefined;}
 activityProperty(ref:{blockId:string;propertyId:string}){return this.activityBlock(ref.blockId)?.activity.get(ref.propertyId);}
 activityDefinition(id:string):any {this.stamp('activity:d:'+id).get();return (this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations as any)?.[id];}
 activityTarget(t:ReplyTarget,depth=0):boolean {
  if(!t||depth>3||t.resourceId!==this.resourceId)return false;
  if(t.kind==='block'||t.kind==='contribution'){const entry=this.activityBlock(t.blockId);return !!entry&&(t.kind==='block'||contribution((entry.record.payload.metadata as any)?.dialectic)?.state==='committed');}
  if(t.kind==='range'){
   const d=this.activityDefinition(t.anchorId);this.stamp('activity:a:'+t.anchorId).get();
   return rangeDefinition(d)&&!d.isDeleted&&d.metadata.dialecticRange.source.resourceId===this.resourceId&&[...this.anchors.get(t.anchorId)??[]].some(key=>[...this.entries.get(key)?.activity.values()??[]].some(p=>p.type===RANGE_ANCHOR&&p.annotationId===t.anchorId&&p.active));
  }
  const id=t.kind==='entity'?t.entity?.entityId:t.kind==='argument'?t.argumentId:t.definitionId;if(typeof id!=='string')return false;
  const d=this.activityDefinition(id);if(!d||d.id!==id||d.isDeleted)return false;
  if(t.kind==='entity')return t.entity.scope==='document'&&t.entity.resourceId===this.resourceId&&localEntity(d)&&d.metadata.scopedEntity.resourceId===this.resourceId&&!d.metadata.scopedEntity.entity.deletedUtc;
  if(t.kind==='gloss')return glossDefinition(d);
  if(t.kind==='argument')return argumentDefinition(d)&&this.activityTarget({kind:'range',...d.metadata.dialecticArgument.anchor},depth+1);
  if(t.kind==='argument-relation'){const r=d.metadata?.dialecticArgumentRelation;return argumentRelation(d)&&this.activityTarget({kind:'argument',...r.from},depth+1)&&this.activityTarget({kind:'argument',...r.to},depth+1);}
  if(t.kind==='entity-relation'){const r=d.metadata?.scopedEntityRelation;return localEntityRelation(d)&&r.resourceId===this.resourceId&&[r.from,r.to].every(entity=>this.activityTarget({kind:'entity',resourceId:this.resourceId,entity},depth+1));}
  return false;
 }
 node(contentKey:string,preferred?:string){const nodes=this.projection.nodesForContent(contentKey);return nodes.find(n=>n.key===preferred)??nodes[0];}
 text(contentKey:string,start=0,end?:number){const state=this.editor.repository.readState(),c=state.contents[contentKey];return c?inlineText(contentSlice(state,c,start,end??contentLength(c))):'';}
 resolve(t:ReplyTarget,preferred?:string):Resolution {
  if(!t||typeof t.resourceId!=='string'||!['range','gloss','block','contribution','argument','entity','argument-relation','entity-relation'].includes(t.kind)||
   typeof (t.kind==='range'?t.anchorId:['gloss','argument-relation','entity-relation'].includes(t.kind)?t.definitionId:t.kind==='argument'?t.argumentId:t.kind==='entity'?t.entity?.entityId:t.blockId)!=='string')return {status:'invalid',reason:'Unsupported reference descriptor.'};
  if(t.resourceId!==this.resourceId)return {status:'outside-document',reason:'Target belongs to another Document.'};
  if(t.kind==='argument-relation'||t.kind==='entity-relation'){
   this.stamp('a:'+t.definitionId).get();const d=(this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations as any)?.[t.definitionId];
   const r=t.kind==='argument-relation'?d?.metadata?.dialecticArgumentRelation:d?.metadata?.scopedEntityRelation;
   if(!r||d.isDeleted||d.type!==(t.kind==='argument-relation'?'dialectic/argument-relation':'mutable/entity-relation'))return {status:'missing',reason:'Relationship unavailable'};
   return {status:'resolved',identityExists:true,text:`${r.from.argumentId??r.from.entityId} → ${r.relation} → ${r.to.argumentId??r.to.entityId}`};
  }
  if(t.kind==='argument'||t.kind==='entity'){
   const id=t.kind==='argument'?t.argumentId:t.entity.entityId;this.stamp('a:'+id).get();
   const d=(this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations as any)?.[id];
   if(t.kind==='entity'){if(t.entity.scope!=='document'||t.entity.resourceId!==this.resourceId)return {status:'outside-document',reason:'Vault Entity needs the scoped reader.'};return localEntity(d)&&!d.isDeleted?{status:'resolved',identityExists:true,text:d.metadata.scopedEntity.entity.name}:{status:'missing',reason:'Entity unavailable'};}
   if(!argumentDefinition(d)||d.isDeleted)return {status:'missing',reason:'Argument unavailable'};
   return {...this.resolve({kind:'range',...d.metadata.dialecticArgument.anchor},preferred),identityExists:true,argumentId:id};
  }
  if(t.kind==='range'||t.kind==='gloss'){
   const id=t.kind==='range'?t.anchorId:t.definitionId;this.stamp('a:'+id).get();
   const registry=this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations as Record<string,any>|undefined;
   const d=registry?.[id];
   if(!d)return {status:'missing',reason:'Definition is unavailable.'};
   if(t.kind==='gloss')return glossDefinition(d)&&!d.isDeleted?{status:'resolved',text:String(d.value)}:{status:'invalid',reason:'Gloss is unavailable.'};
   if(!rangeDefinition(d))return {status:'invalid',reason:'Unsupported range anchor.'};
   const historical=d.metadata.dialecticRange.excerpt,segments:Segment[]=[];
   if(d.isDeleted)return {status:'unanchored',historical,reason:'The anchor definition is deleted.'};
   for(const key of this.anchors.get(id)??[]){const c=this.editor.repository.readState().contents[key],node=this.node(key,preferred);if(!c||!node)continue;
    for(const p of (c.payload.standoffProperties??[]) as any[])if(p.type===RANGE_ANCHOR&&p.annotationId===id&&!p.isDeleted){
     if(!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<p.start||p.end>=contentLength(c)||p.externalDefinition)return {status:'invalid',reason:'Range coordinates or ownership are invalid.',historical};
     segments.push({contentKey:key,id:String(p.id),start:p.start,end:p.end+1,node});
    }
   }
   // Document order from ancestry, without traversing text or unrelated Blocks.
   const path=(n:BlockNode)=>{const result:number[]=[];let child=n;for(let p=this.projection.parentOf(child.key);p;p=this.projection.parentOf(child.key)){result.unshift([...p.children,...Object.values(p.ownedRelations)].indexOf(child.key));child=p;}return result;};
   segments.sort((a,b)=>{const x=path(a.node),y=path(b.node);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length||a.start-b.start;});
   if(!segments.length)return {status:'unanchored',reason:'The source passage has no surviving segments.',historical};
   // A join can retain adjacent segments; their source text has no artificial separator.
   let text='';segments.forEach((s,i)=>{const prior=segments[i-1];if(prior&&(prior.contentKey!==s.contentKey||prior.end!==s.start))text+='\n';text+=this.text(s.contentKey,s.start,s.end);});
   return {status:'resolved',segments,node:segments[0].node,text,historical,changed:text!==historical};
  }
  if(typeof t.blockId!=='string')return {status:'invalid',reason:'Block identity unavailable'};
  this.stamp('b:'+t.blockId).get();const keys=[...this.blocks.get(t.blockId)??[]];if(keys.length!==1)return {status:keys.length?'ambiguous':'missing',reason:'Block identity is missing or ambiguous.'};
  const node=this.node(keys[0],preferred);if(!node)return {status:'missing'};
  if(t.kind==='contribution'&&!contribution((node.payload.metadata as any)?.dialectic))return {status:'invalid',reason:'Target is no longer a contribution.'};
  return {status:'resolved',node};
 }
 overlapping(segments:Segment[]){const definitions:any=this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations??{},ids=new Set<string>();for(const s of segments)for(const p of (this.editor.repository.readState().contents[s.contentKey]?.payload.standoffProperties??[]) as any[])if(p.type===GLOSS&&!p.isDeleted&&p.start<s.end&&p.end>=s.start&&glossDefinition(definitions[p.annotationId])&&!definitions[p.annotationId].isDeleted)ids.add(p.annotationId);return [...ids].map(id=>({id,value:String(definitions[id].value)}));}
 dispose(){this.stop();this.contentsMembership.clear();this.semanticDefinitions.clear();this.semanticEntityIds.clear();this.semanticEdges.clear();this.semanticEdgeEndpoints.clear();this.semanticByBlock.clear();this.semanticMentions.clear();this.semanticRecent.clear();this.central=[];this.entries.clear();this.blocks.clear();this.anchors.clear();this.stamps.clear();this.argumentAnchors.clear();this.anchorArguments.clear();this.edgeEndpoints.clear();this.argumentEdges.clear();}
}
