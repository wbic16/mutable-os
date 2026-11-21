import {batch,createSignal,type Accessor} from 'solid-js';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {BlockTreeProjection} from '../../block-tree/projection';
import type {RepositoryChange} from '../../block-tree/repository';
import {glossOwner} from '../../block-tree/gloss-plan';
import {glossDefinition,parseGloss,GLOSS} from './model';

export interface GlossAnchor {contentKey:string;segmentId:string;definitionId:string;role?:string}
export interface GlossOccurrence extends GlossAnchor {nodeKey:string;order:number}
export interface GlossEntry {
 definitionId:string;localId:string;
 data:Accessor<{raw:string;type:string;body:string;alias:string;source?:Record<string,any>}>;
 occurrences:Accessor<GlossOccurrence[]>;
}
type Entry=GlossEntry&{setData:(v:ReturnType<GlossEntry['data']>)=>unknown;setOccurrences:(v:GlossOccurrence[])=>unknown;signature:string};
export interface AnnotationInventoryPolicy {
 type:string;
 accepts(definition:any):boolean;
 describe(definition:any):ReturnType<GlossEntry['data']>;
 order?(definition:any):number;
}
/** A derived inventory for one viewing session. Offsets remain in native segments;
 * offset rebasing neither replaces rows nor invalidates their text/filter signals. */
export class GlossSessionIndex {
 readonly rows=createSignal<GlossEntry[]>([]);
 readonly diagnostics={treeVisits:0,segmentReads:0,definitionReads:0,rowPublications:0};
 readonly owner:string;
 readonly relationships?:import("./relationship-index").GlossGraphIndex;
 private entries=new Map<string,Entry>();
 private members=new Set<string>();
 private nodes=new Set<string>();
 containsOccurrence(key:string){return this.nodes.has(key);}
 private occurrences=new Map<string,{nodeKey:string;order:number}[]>();
 private segments=new Map<string,GlossAnchor[]>();
 private listeners=new Set<(keys:Set<string>,structure:boolean)=>void>();
 private stop:()=>void;private alive=true;private queued=false;
 constructor(readonly editor:ReactiveEditor,readonly projection:BlockTreeProjection,readonly rootKey:string,private policy?:AnnotationInventoryPolicy){
  this.owner=projection.node(rootKey)!.contentKey;
  if(!policy&&editor.features.glossRelationships)this.relationships=editor.glossRelationships.document(this.owner);
  this.definitions();this.tree();this.publish();
  this.stop=editor.repository.subscribeChanges(change=>this.changed(change));
 }
 subscribe(fn:(keys:Set<string>,structure:boolean)=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private definitions(){
  const registry=this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations as Record<string,any>??{};
  const keep=new Set<string>();let membership=false;
  for(const [id,d]of Object.entries(registry)){
   this.diagnostics.definitionReads++;if(!(this.policy?this.policy.accepts(d):glossDefinition(d))||d.isDeleted)continue;keep.add(id);
   const signature=JSON.stringify(this.policy?d:[d.value,d.metadata.gloss.localId,d.metadata.gloss.alias,d.metadata.tei]);let entry=this.entries.get(id);
   if(entry?.signature===signature)continue;
   const parsed=parseGloss(d.value??''),data=this.policy?this.policy.describe(d):{raw:d.value,type:parsed.type,body:parsed.text,alias:String(d.metadata.gloss.alias??''),source:d.metadata.tei};
   if(!entry){const [read,setData]=createSignal(data),[occ,setOccurrences]=createSignal<GlossOccurrence[]>([]);entry={definitionId:id,localId:this.policy?id:d.metadata.gloss.localId,data:read,setData,occurrences:occ,setOccurrences,signature};this.entries.set(id,entry);membership=true;}
   else{entry.signature=signature;entry.localId=this.policy?id:d.metadata.gloss.localId;entry.setData(data);if(this.policy)membership=true;}
  }
  for(const id of this.entries.keys())if(!keep.has(id)){this.entries.delete(id);membership=true;}
  return membership;
 }
 private readSegments(contentKey:string){
  this.diagnostics.segmentReads++;
  const props=this.editor.repository.readState().contents[contentKey]?.payload.standoffProperties as any[]??[];
  const next=props.filter(p=>p.type===(this.policy?.type??GLOSS)&&!p.isDeleted&&typeof p.annotationId==='string').sort((a,b)=>Number(a.start)-Number(b.start)).map(p=>({contentKey,segmentId:String(p.id),definitionId:p.annotationId,...(p.metadata?.tei?.role?{role:p.metadata.tei.role}:{})}));
  const prior=this.segments.get(contentKey)??[];
  if(JSON.stringify(prior)===JSON.stringify(next))return false;
  this.segments.set(contentKey,next);return true;
 }
 private tree(){
  const state=this.editor.repository.readState(),members=new Set<string>(),occurrences=new Map<string,{nodeKey:string;order:number}[]>();let order=0;
  const evidence={ownedKeys:(k:string)=>this.editor.repository.ownedPlacementKeys(k),locationOf:(k:string)=>this.editor.repository.locationOf(k)};
  const visit=(key:string)=>{const n=this.projection.node(key);if(!n)return;this.diagnostics.treeVisits++;
   if(key!==this.rootKey&&n.viewType==='document-block')return;
   members.add(n.contentKey);
   if(n.viewType==='standoff-editor-block'&&glossOwner(state,n.contentKey,evidence)===this.owner){const list=occurrences.get(n.contentKey)??[];list.push({nodeKey:key,order:order++});occurrences.set(n.contentKey,list);}
   for(const k of [...n.children,...Object.values(n.ownedRelations)])visit(k);
  };visit(this.rootKey);this.members=members;this.occurrences=occurrences;this.nodes=new Set([...occurrences.values()].flatMap(list=>list.map(o=>o.nodeKey)));
  for(const k of this.segments.keys())if(!occurrences.has(k))this.segments.delete(k);
  for(const k of occurrences.keys())this.readSegments(k);
 }
 private publish(){
  const groups=new Map<string,GlossOccurrence[]>();
  for(const [key,segments]of this.segments)for(const segment of segments)for(const occurrence of this.occurrences.get(key)??[]){const a=groups.get(segment.definitionId)??[];a.push({...segment,...occurrence});groups.set(segment.definitionId,a);}
  for(const [id,entry]of this.entries){const next=(groups.get(id)??[]).sort((a,b)=>a.order-b.order||(this.range(a)?.start??0)-(this.range(b)?.start??0));if(JSON.stringify(entry.occurrences())!==JSON.stringify(next))entry.setOccurrences(next);}
  const registry=this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations as Record<string,any>??{};
  const next=[...this.entries.values()].sort((a,b)=>(this.policy?.order?.(registry[a.definitionId])??0)-(this.policy?.order?.(registry[b.definitionId])??0)||(a.occurrences()[0]?.order??Infinity)-(b.occurrences()[0]?.order??Infinity)||(this.range(a.occurrences()[0])?.start??Infinity)-(this.range(b.occurrences()[0])?.start??Infinity)||a.definitionId.localeCompare(b.definitionId));
  const old=this.rows[0]();if(next.length!==old.length||next.some((v,i)=>old[i]!==v)){this.diagnostics.rowPublications++;this.rows[1](next);}
 }
 range(anchor?:GlossAnchor){if(!anchor)return;const p=(this.editor.repository.readState().contents[anchor.contentKey]?.payload.standoffProperties as any[]??[]).find(p=>p.id===anchor.segmentId&&p.annotationId===anchor.definitionId&&!p.isDeleted);return p&&Number.isInteger(p.start)&&Number.isInteger(p.end)?{start:p.start as number,end:p.isZeroWidth?p.start as number:(p.end as number)+1}:undefined;}
 private changed(change:RepositoryChange){
  if(!this.alive||change.structural?.gloss?.linksOnly&&change.structural.gloss.owner===this.owner)return;const state=this.editor.repository.readState(),affected=new Set<string>();let structure=false,membership=false;
  batch(()=>{
   for(const [key,before]of change.previousContents){if(!this.members.has(key))continue;const after=state.contents[key];
    if(!before||!after||before.viewType!==after.viewType||JSON.stringify([before.children,before.ownedRelations])!==JSON.stringify([after.children,after.ownedRelations]))structure=true;
    if(key===this.owner&&JSON.stringify(before?.payload.linkedAnnotations)!==JSON.stringify(after?.payload.linkedAnnotations))membership=this.definitions()||membership;
    if(this.occurrences.has(key))membership=this.readSegments(key)||membership;affected.add(key);
   }
   if(membership)this.publish();
  });
  if(structure){if(this.queued)return;this.queued=true;queueMicrotask(()=>{this.queued=false;if(!this.alive)return;batch(()=>{this.tree();this.publish();});for(const listener of this.listeners)listener(affected,true);});}
  else if(affected.size||membership||change.previousContents.has(this.owner))for(const listener of this.listeners)listener(affected,false);
 }
 dispose(){this.alive=false;this.stop();this.listeners.clear();}
}
