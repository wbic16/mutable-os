import {unwrap} from 'solid-js/store';
import {enrichEntityDefinition} from '../../../feature-api/entity-enrichment';
import {ENTITY_REFERENCE,localEntity} from '../../../feature-api/scoped-entities';
import {ARGUMENT} from '../arguments';
import {RANGE_ANCHOR} from '../anchors';
import {GLOSS} from '../../gloss/model';
import {classifications} from './markup';
import type {prepare} from './exchange';
import type {DcpSources} from './sources';
type Prepared=Awaited<ReturnType<typeof prepare>>;
const plain=(v:any)=>JSON.parse(JSON.stringify(unwrap(v)));
const normalized=(v:any)=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
const relationName=(v:any)=>normalized(v).replace(/[\s_]+/g,'-');
const live=(d:any)=>d&&!d.isDeleted&&!d.metadata?.scopedEntity?.entity?.deletedUtc;
const entity=(d:any)=>d.metadata.scopedEntity.entity;
const entityValue=(d:any)=>{const e=plain(entity(d));delete e.revision;const extra=e.attributes?.enrichment;if(extra){delete extra.assertions;if(!extra.subtypes?.length&&!extra.dates?.length&&!extra.externalIds?.length&&!extra.thumbnail&&!extra.conflicts?.length)delete e.attributes.enrichment;}if(!e.attributes||!Object.keys(e.attributes).length)delete e.attributes;return JSON.stringify(e);};

/** Explicit refresh admission only. Native preparation remains authoritative.
 * Reconcile against all live Document definitions, not the bounded AI preview.
 * No subscription, persistence, vault traversal or per-keystroke work. */
export function reconcileSemanticRefresh(result:Prepared,sources:DcpSources,contributionId:string,registry:Record<string,any>){
 sources.check();if(result.children.length)throw Error('Semantic refresh cannot create content Blocks');
 const current=Object.fromEntries(Object.entries(registry).filter(([,d])=>live(d))),definitions=result.definitions,remap=new Map<string,string>();
 let skipped=0,conflicts=0;
 const resolve=(id:string):string=>remap.has(id)?resolve(remap.get(id)!):id;
 const replace=(value:any):any=>Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['entityId','argumentId','anchorId','definitionId','annotationId'].includes(k)&&typeof v==='string'?resolve(v):replace(v)])):value;
 const reuse=(id:string,old:string)=>{if(id!==old){remap.set(id,resolve(old));delete definitions[id];skipped++;}};
 const belongs=(key:string)=>{for(let n=sources.node(key),depth=0;n&&depth<128;n=sources.parent(n.key),depth++)if(String(n.payload.id)===contributionId)return true;return false;};
 for(const [key,properties]of result.annotations){if(!belongs(key))throw Error('Semantic refresh annotations must target the selected Contribution');for(const p of properties)if(![RANGE_ANCHOR,ENTITY_REFERENCE,GLOSS,...classifications].includes(p.type))throw Error('Semantic refresh cannot change formatting');}
 const beforeConflicts=(d:any)=>entity(d).attributes?.enrichment?.conflicts?.length??0;
 const existingEntities=Object.values(current).filter(localEntity);
 for(const [id,d]of Object.entries(definitions))if(localEntity(d)){
  if(current[id]){conflicts+=Math.max(0,beforeConflicts(d)-beforeConflicts(current[id]));if(entityValue(d)===entityValue(current[id])){delete definitions[id];skipped++;}continue;}
  const e=entity(d),names=new Set([e.name,...e.aliases.map((a:any)=>a.name)].map(normalized));
  const matches=existingEntities.filter(old=>normalized(entity(old).typename)===normalized(e.typename)&&[entity(old).name,...entity(old).aliases.map((a:any)=>a.name)].some(n=>names.has(normalized(n))));
  if(matches.length>1)throw Error(`Ambiguous Entity "${e.name}": reuse its current Document handle.`);
  if(matches.length===1){const old=definitions[matches[0].id]??matches[0],prior=entity(old);
   if(prior.description&&e.description&&normalized(prior.description)!==normalized(e.description))throw Error(`Entity "${e.name}" already exists; use its current handle to enrich it without duplicating identity.`);
   const extra=e.attributes?.enrichment,{version,subtypes,dates,externalIds,thumbnail}=extra??{};
   const merged=enrichEntityDefinition(plain(old),{name:prior.name,typename:prior.typename,description:e.description,aliases:e.aliases.map((a:any)=>a.name),...(extra?{enrichment:{version,subtypes,dates,externalIds,thumbnail}}:{})},result.provenance);
   reuse(id,old.id);conflicts+=Math.max(0,beforeConflicts(merged)-beforeConflicts(old));if(entityValue(merged)!==entityValue(old))definitions[old.id]=merged;
  }else existingEntities.push(d);
 }
 // Passage identity is its current native source occurrence and range, not its
 // exchange-local alias or a coincidentally equal quotation elsewhere.
 const ranges=new Map<string,string>();
 const rangeKey=(segments:{blockId:string;start:number;end:number}[])=>JSON.stringify(segments);
 for(const d of Object.values(current))if(d.type===RANGE_ANCHOR){const r=sources.resolve({kind:'range',resourceId:sources.owner,anchorId:d.id});if(r.status==='resolved'&&r.segments?.length)ranges.set(rangeKey(r.segments.map(s=>({blockId:String(s.node.payload.id),start:s.start,end:s.end}))),d.id);}
 const addedRanges=new Map<string,{blockId:string;start:number;end:number}[]>();
 for(const [key,properties]of result.annotations)for(const p of properties)if(p.type===RANGE_ANCHOR){const list=addedRanges.get(p.annotationId)??[];list.push({blockId:String(sources.node(key)!.payload.id),start:p.start,end:p.end+1});addedRanges.set(p.annotationId,list);}
 for(const [id,segments]of addedRanges){const key=rangeKey(segments),old=ranges.get(key);if(old)reuse(id,old);else ranges.set(key,id);}
 const argumentKeys=new Map<string,string>();
 for(const d of Object.values(current))if(d.type===ARGUMENT)argumentKeys.set(d.metadata.dialecticArgument.anchor.anchorId,d.id);
 for(const [id,d]of Object.entries(definitions))if(d.type===ARGUMENT){const a=d.metadata.dialecticArgument;a.anchor.anchorId=resolve(a.anchor.anchorId);if(current[a.anchor.anchorId]){const r=sources.resolve({kind:'range',resourceId:sources.owner,anchorId:a.anchor.anchorId});if(r.status!=='resolved'||!r.segments?.length||r.segments.some(s=>!belongs(s.node.key)))throw Error('Refreshed Arguments must be anchored in the selected Contribution');}const old=argumentKeys.get(a.anchor.anchorId);if(old)reuse(id,old);else argumentKeys.set(a.anchor.anchorId,id);}
 const grounded=new Set<string>(),referenceKey=(r:any)=>JSON.stringify([r.scope,r.resourceId??r.vaultId,resolve(r.entityId)]);
 const primary=sources.resolve({kind:'contribution',resourceId:sources.owner,blockId:contributionId});
 const stack=primary.node?[primary.node]:[];let visited=0;
 while(stack.length){const n=stack.pop()!;if(++visited>512)throw Error('Semantic refresh source exceeds the Block budget');sources.fence(n.contentKey);for(const p of [...n.payload.standoffProperties as any[]??[],...result.annotations.get(n.key)??[]])if(!p.isDeleted&&p.type===ENTITY_REFERENCE&&p.metadata?.entityReference)grounded.add(referenceKey(p.metadata.entityReference));for(const key of [...n.children,...Object.values(n.ownedRelations)]){const child=sources.node(key);if(child)stack.push(child);}}
 for(const d of Object.values(definitions)){
  if(localEntity(d)&&!grounded.has(referenceKey({scope:'document',resourceId:sources.owner,entityId:d.id})))throw Error('Refreshed Entities must be mentioned in the selected Contribution');
  const r=d.metadata?.scopedEntityRelation;if(r&&(!grounded.has(referenceKey(r.from))||!grounded.has(referenceKey(r.to))))throw Error('Refreshed relationship endpoints must be mentioned in the selected Contribution');
 }
 const relationKey=(d:any)=>{const r=d.metadata?.scopedEntityRelation??d.metadata?.dialecticArgumentRelation;return r?JSON.stringify([d.type,relationName(r.relation),replace(r.from),replace(r.to)]):undefined;};
 const relations=new Map<string,string>();for(const d of Object.values(current)){const key=relationKey(d);if(key)relations.set(key,d.id);}
 for(const [id,d]of Object.entries(definitions)){const key=relationKey(d);if(key){const old=relations.get(key);if(old)reuse(id,old);else relations.set(key,id);}}
 const propertyKey=(p:any,defs:Record<string,any>)=>JSON.stringify([p.type,p.start,p.end,p.type===ENTITY_REFERENCE?replace(p.metadata?.entityReference):p.type===GLOSS?normalized(defs[resolve(p.annotationId)]?.value):p.type===RANGE_ANCHOR?resolve(p.annotationId):p.value??null]);
 for(const [key,properties]of result.annotations){const known=new Map<string,any>();for(const p of (sources.node(key)!.payload.standoffProperties??[]) as any[])if(!p.isDeleted)known.set(propertyKey(p,{...current,...definitions}),p);
  const keep:any[]=[];for(const original of properties){const p=replace(original),signature=propertyKey(p,{...current,...definitions}),old=known.get(signature);if(old){if(p.type===GLOSS)reuse(original.annotationId,old.annotationId);skipped++;}else{known.set(signature,p);keep.push(p);}}result.annotations.set(key,keep);
 }
 // Classification/mention selectors need no unused persistent passage shell.
 const neededAnchors=new Set(Object.values(definitions).filter(d=>d.type===ARGUMENT).map(d=>resolve(d.metadata.dialecticArgument.anchor.anchorId)));
 for(const [id,d]of Object.entries(definitions))if(d.type===RANGE_ANCHOR&&!neededAnchors.has(id))delete definitions[id];
 for(const [id,d]of Object.entries(definitions))definitions[id]=replace(d);
 for(const [key,properties]of result.annotations){const kept=properties.map(replace).filter(p=>p.type!==RANGE_ANCHOR||!!definitions[p.annotationId]);if(kept.length)result.annotations.set(key,kept);else result.annotations.delete(key);}
 for(const [alias,t]of Object.entries(result.aliases)){const next=replace(t);if(next.kind==='range'&&!current[next.anchorId]&&!definitions[next.anchorId])delete result.aliases[alias];else result.aliases[alias]=next;}
 result.annotationRefs=[...result.annotations].flatMap(([key,ps])=>ps.filter(p=>p.type!==RANGE_ANCHOR).map(p=>({blockId:String(sources.node(key)!.payload.id),propertyId:p.id})));
 const added=Object.keys(definitions).filter(id=>!current[id]&&definitions[id].type!==RANGE_ANCHOR).length+result.annotationRefs.length,updated=Object.keys(definitions).filter(id=>!!current[id]).length;
 sources.check();return {added,updated,skipped,conflicts,summary:`${added} added · ${updated} enriched · ${skipped} duplicates skipped${conflicts?` · ${conflicts} conflicts retained for review`:''}`};
}
