import {contentLength} from './inline-sequence';
import {argumentDefinition,argumentRelation} from '../features/dialectic/arguments';
import {localEntity,localEntityRelation,ENTITY_REFERENCE,entityReference} from '../feature-api/scoped-entities';
import {glossDefinition,GLOSS} from '../features/gloss/model';
import {RANGE_ANCHOR,rangeDefinition} from '../features/dialectic/anchors';
import {glossOwner} from './gloss-plan';
import type {StructuralEvidence} from './structural-plan';
import type {ContentRecord,RepositoryOperation,RepositoryState} from './types';
const dcpProperty=(p:any)=>(p?.type===ENTITY_REFERENCE&&entityReference(p.metadata?.entityReference)||p?.type===GLOSS&&p.metadata?.dcp?.protocol==='dcp/1.0')||typeof p?.type==='string'&&/^dialectic\/(claim|question|speculation|suggestion|objection|qualification|unknown-semantic)$/.test(p.type)&&p.metadata?.dcp?.protocol==='dcp/1.0'&&['mock','ai'].includes(p.metadata.dcp.actor)&&typeof p.metadata.dcp.exchangeId==='string';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function dialecticRangePayloadOnly(old:ContentRecord|undefined,next:ContentRecord):boolean {
 if(!old||next.inlineKind!=='standoff')return false;
 const strip=(r:ContentRecord)=>({...r,revision:0,payload:{...r.payload,standoffProperties:undefined}});
 if(!same(strip(old),strip(next)))return false;
 const p=old.payload.standoffProperties??[],q=next.payload.standoffProperties??[];
 return Array.isArray(p)&&Array.isArray(q)&&!same(p,q)&&same(p.filter(x=>x.type!==RANGE_ANCHOR&&!dcpProperty(x)),q.filter(x=>x.type!==RANGE_ANCHOR&&!dcpProperty(x)));
}
/** Permit only valid range-definition deltas on one existing Document. Remaining
 * structure is independently proved by structuralChangeFor, including inverses. */
export function dialecticRangeRoot(state:RepositoryState,ops:RepositoryOperation[],e:StructuralEvidence,definitionIds:string[]=[]):ContentRecord|undefined {
 const roots=ops.filter(o=>o.kind==='put-content'&&o.record.viewType==='document-block') as Extract<RepositoryOperation,{kind:'put-content'}>[];
 if(roots.length!==1)return;
 const root=roots[0].record,prior=state.contents[root.key];if(!prior)return;
 const a:any=prior.payload.linkedAnnotations??{},b:any=root.payload.linkedAnnotations??{};
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))return;
 const resourceId=String((root.payload.metadata as any)?.documentId??root.payload.id);
 const records=new Map(ops.flatMap(o=>o.kind==='put-content'?[[o.record.key,o.record] as const]:[]));
 const placements=new Map(ops.flatMap(o=>o.kind==='put-placement'?[[o.record.key,o.record] as const]:[]));
 const parents=new Map<string,string>();
 for(const c of records.values())for(const pk of [...c.children,...c.inlineContent,...Object.values(c.ownedRelations)]){const p=placements.get(pk)??state.placements[pk];if(p)parents.set(p.contentKey,c.key);}
 const owned=(key:string)=>{const seen=new Set<string>();while(key!==root.key){if(seen.has(key))return false;seen.add(key);const parent=parents.get(key);if(!parent)return !!state.contents[key]&&glossOwner(state,key,e)===root.key;if((records.get(parent)??state.contents[parent])?.viewType==='document-block'&&parent!==root.key)return false;key=parent;}return true;};
 const symposium=(root.payload.metadata as any)?.dialectic?.kind==='conversation';
 const valid=(d:any)=>rangeDefinition(d)&&d.metadata.dialecticRange.source.resourceId===resourceId||
  localEntity(d)&&d.metadata.scopedEntity.resourceId===resourceId||
  localEntityRelation(d)&&d.metadata.scopedEntityRelation.resourceId===resourceId||
  symposium&&(argumentDefinition(d)||argumentRelation(d))||glossDefinition(d);
 let changed=false;
 for(const id of new Set([...Object.keys(a),...Object.keys(b)]))if(a[id]!==b[id]&&!same(a[id],b[id])){
  changed=true;definitionIds.push(id);if(a[id]&&!valid(a[id])||b[id]&&(!valid(b[id])||b[id].id!==id))return;
  const d=b[id];if(!d||d.isDeleted)continue;
  const existing=a[id];
  const anchor=d.metadata?.dialecticArgument?.anchor;
  if(anchor&&(anchor.resourceId!==resourceId||(!rangeDefinition(b[anchor.anchorId])&&(!existing||!same(anchor,existing.metadata?.dialecticArgument?.anchor)))))return;
  const ar=d.metadata?.dialecticArgumentRelation;
  if(ar)for(const side of ['from','to'])if(ar[side].resourceId!==resourceId||(!argumentDefinition(b[ar[side].argumentId])&&(!existing||!same(ar[side],existing.metadata?.dialecticArgumentRelation?.[side]))))return;
  const er=d.metadata?.scopedEntityRelation;
  if(er){if(![er.from,er.to].some(r=>r.scope==='document'))return;for(const side of ['from','to']){const r=er[side];if(r.scope==='document'&&(r.resourceId!==resourceId||!localEntity(b[r.entityId])&&(!existing||!same(r,existing.metadata?.scopedEntityRelation?.[side]))))return;}}
 }
 if(!changed)return;
 for(const op of ops)if(op.kind==='put-content'&&op.record.inlineKind==='standoff'){
  const c=op.record,old=state.contents[c.key],length=contentLength(c);
  const p=c.payload.standoffProperties??[],q=old?.payload.standoffProperties??[];
  if(!Array.isArray(p)||!Array.isArray(q))return;
  for(const x of p.filter(dcpProperty))if(!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start<0||x.end<x.start||x.end>=length)return;
  for(const x of p)if(x.type===ENTITY_REFERENCE){const r=x.metadata?.entityReference;if(!entityReference(r)||r.scope==='document'&&(r.resourceId!==resourceId||!localEntity(b[r.entityId])))return;}else if(x.type===GLOSS&&x.metadata?.dcp&&!glossDefinition(b[x.annotationId]))return;
  const anchors=p.filter(x=>x.type===RANGE_ANCHOR);
  if(!anchors.length&&!q.some(x=>x.type===RANGE_ANCHOR)&&!p.some(dcpProperty))continue;
  if(!owned(c.key))return;
  for(const x of anchors)if(!rangeDefinition(b[x.annotationId])||!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start<0||x.end<x.start||x.end>=length||x.isZeroWidth)return;
 }
 // Strip only the independently validated registry change for structural proof.
 return {...root,payload:{...root.payload,linkedAnnotations:prior.payload.linkedAnnotations}};
}
