import {contentLength} from './inline-sequence';
import type {ContentRecord, RepositoryOperation, RepositoryState} from './types';
import type {StructuralEvidence} from './structural-plan';
import {GLOSS,glossDefinition} from '../features/gloss/model';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Indexed ancestry only. Never resourceOwner(), whose legacy cache rebuilds over the repository. */
export function glossOwner(state:RepositoryState,key:string,e:Pick<StructuralEvidence,'ownedKeys'|'locationOf'>):string|undefined {
 const seen=new Set<string>();
 while(!seen.has(key)) {seen.add(key);const c=state.contents[key];if(!c)return;
  if(c.viewType==='document-block')return key;
  if(c.definitionOwnerKey)return state.contents[c.definitionOwnerKey]?.viewType==='document-block'?c.definitionOwnerKey:undefined;
  const owned=[...e.ownedKeys(key)];if(owned.length!==1)return;
  const at=e.locationOf(owned[0]);if(!at)return;key=at.ownerContentKey;
 }
}
export interface GlossChange {owner:string;texts:string[];definitions:string[];edges:{definitionId:string;id:string}[];linksOnly:boolean}
/** Proof from record contents, also used for inverse operations. No caller trust. */
export function glossChangeFor(state:RepositoryState,ops:RepositoryOperation[],e:Pick<StructuralEvidence,'ownedKeys'|'locationOf'>):GlossChange|undefined {
 if(!ops.length||ops.some(o=>o.kind!=='put-content'))return;
 const records=ops.map(o=>(o as Extract<RepositoryOperation,{kind:'put-content'}>).record);
 if(new Set(records.map(r=>r.key)).size!==records.length)return;
 const roots=records.filter(r=>r.viewType==='document-block');if(roots.length>1)return;
 // Attaching an existing Gloss changes only its local text occurrence. Resolve
 // the unchanged registry by indexed ancestry, without a dummy Document write.
 const owner=roots[0]?.key??glossOwner(state,records[0].key,e);if(!owner)return;
 const before=state.contents[owner],root=roots[0]??before;if(!before||root.viewType!=='document-block')return;
 const strip=(r:ContentRecord,field:string)=>{const payload={...r.payload};delete payload[field];return {...r,revision:0,payload};};
 if(!same(strip(before,'linkedAnnotations'),strip(root,'linkedAnnotations')))return;
 const a=before.payload.linkedAnnotations??{},b=root.payload.linkedAnnotations??{};
 if(!a||!b||Array.isArray(a)||Array.isArray(b)||typeof a!=='object'||typeof b!=='object')return;
 const old=a as Record<string,any>,next=b as Record<string,any>;
 const definitions:string[]=[],edges:{definitionId:string;id:string}[]=[];let linksOnly=true;
 const withoutLinks=(d:any)=>d?{...d,metadata:{...d.metadata,gloss:{...d.metadata.gloss,links:undefined}}}:d;
 for(const id of old===next?[]:new Set([...Object.keys(old),...Object.keys(next)]))if(!same(old[id],next[id])) {
  definitions.push(id);if(old[id]&&!glossDefinition(old[id])||next[id]&&!glossDefinition(next[id]))return;
  if(next[id]&&next[id].id!==id)return;
  if(!same(withoutLinks(old[id]),withoutLinks(next[id])))linksOnly=false;
  const a=old[id]?.metadata.gloss.links??{},b=next[id]?.metadata.gloss.links??{};
  for(const edgeId of new Set([...Object.keys(a),...Object.keys(b)]))if(!same(a[edgeId],b[edgeId]))edges.push({definitionId:id,id:edgeId});
 }
 const texts:string[]=[];
 for(const r of records)if(r!==root) {
  const prior=state.contents[r.key];if(!prior||r.inlineKind!=='standoff'||glossOwner(state,r.key,e)!==root.key||!same(strip(prior,'standoffProperties'),strip(r,'standoffProperties')))return;
  const p=prior.payload.standoffProperties??[],q=r.payload.standoffProperties??[];if(!Array.isArray(p)||!Array.isArray(q))return;
  if(!same(p.filter(x=>x.type!==GLOSS),q.filter(x=>x.type!==GLOSS)))return;
  for(const x of q.filter(x=>x.type===GLOSS))if(!glossDefinition(next[x.annotationId])||!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start<0||x.end<x.start||x.end>=contentLength(r))return;
  if(!same(p,q))texts.push(r.key);
 }
 if(!definitions.length&&!texts.length)return;
 return {owner:root.key,texts,definitions,edges,linksOnly:linksOnly&&!texts.length};
}
