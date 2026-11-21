import {createMemo,type Accessor} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {targetKey,type Contribution,type ContributionNotice,type ReplyTarget} from './model';
import type {DialecticReferences} from './references';
import type {LiveProvenance} from './dcp/provider-contract';
import {RANGE_ANCHOR} from './anchors';
import {GLOSS} from '../gloss/model';
import {ENTITY_REFERENCE} from '../../feature-api/scoped-entities';

export const activityCategories={references:{label:'references',singular:'reference',symbol:'↗',short:'R'},annotations:{label:'source annotations',singular:'source annotation',symbol:'✎',short:'A'},formatting:{label:'generated formatting marks',singular:'generated formatting mark',symbol:'Aa',short:'F'},glosses:{label:'Glosses created',singular:'Gloss created',symbol:'◇',short:'G'},arguments:{label:'Arguments created',singular:'Argument created',symbol:'◎',short:'Arg'},entities:{label:'Entities created',singular:'Entity created',symbol:'◈',short:'E'},relationships:{label:'relationships created',singular:'relationship created',symbol:'→',short:'L'},unavailable:{label:'unavailable effects or references',singular:'unavailable effect or reference',symbol:'!',short:'?'}} as const;
export type ActivityCategory=keyof typeof activityCategories;
export interface ActivityItem {key:string;category:ActivityCategory;label:string;active:boolean;reason?:string;target?:ReplyTarget;annotation?:{blockId:string;propertyId:string};sources?:{blockId:string;propertyId:string}[]}
export interface ActivitySummary {items:ActivityItem[];counts:Record<ActivityCategory,number>;notices:ContributionNotice[];limited:boolean}
export const activityLimits={references:512,annotations:1024,identities:512,notices:32,inspector:64};
const noticeCodes=new Set(['markdown-fallback','partial-conversion','unsupported-media','incomplete-operation','validation-repaired','image-load']);
export function repairedNotice(provider:LiveProvenance|undefined):ContributionNotice|undefined {
 if(provider?.attempts?.some(a=>a.repair&&a.rejectedResponse)&&!provider.failure&&!provider.attempts.at(-1)?.diagnostic)return {version:1,code:'validation-repaired',severity:'info',loss:false,detail:'The initial response failed native validation. A repaired response was validated and committed.'};
}
function target(value:any):value is ReplyTarget {
 if(!value||typeof value.resourceId!=='string')return false;
 return ['block','contribution'].includes(value.kind)?typeof value.blockId==='string':value.kind==='range'?typeof value.anchorId==='string':value.kind==='argument'?typeof value.argumentId==='string':['gloss','argument-relation','entity-relation'].includes(value.kind)?typeof value.definitionId==='string':value.kind==='entity'&&typeof value.entity?.entityId==='string'&&['document','vault'].includes(value.entity.scope);
}
const annotationLabel=(type:string)=>({'style/highlight':'Highlight','style/bold':'Bold','style/italics':'Italics','reference/url':'Hyperlink'}[type]??type);
const definitionId=(t:ReplyTarget)=>t.kind==='entity'?t.entity.entityId:t.kind==='argument'?t.argumentId:t.definitionId;
const definitionProvenance=(d:any)=>d?.metadata?.dcp??d?.metadata?.scopedEntity?.provenance??d?.metadata?.dialecticArgument?.provenance??d?.metadata?.dialecticArgumentRelation?.provenance??d?.metadata?.scopedEntityRelation?.provenance;
const createdCategory=(t:ReplyTarget):ActivityCategory|undefined=>(({gloss:'glosses',argument:'arguments',entity:'entities','argument-relation':'relationships','entity-relation':'relationships'} as Partial<Record<ReplyTarget['kind'],ActivityCategory>>)[t.kind]);

/** Cached per contribution. Native status uses membership/definition signals,
 * never source-text/offset signals or whole-Document revision subscriptions. */
export function createContributionActivity(data:Accessor<Contribution|undefined>,references:Accessor<DialecticReferences|undefined>,diagnostics:{candidates:number;resolutions:number}){
 const candidates=createMemo(()=>{
  diagnostics.candidates++;
  const row=data();if(!row||row.state!=='committed')return undefined;
  // Notices can arrive after submission. Track their fields before unwrapping
  // immutable authoring provenance; reconciliation retains the row identity.
  const refreshes=row.semanticRefreshes?.map(r=>({...r}))??[];
  const recordedNotices=Array.isArray(row.notices)?row.notices.map(n=>({...n})):[];
  const d=unwrap(row),replies=d.replies.filter(target),discursive=Array.isArray(d.discursiveReferences)?d.discursiveReferences:[],allRefs=d.author==='human'?[...replies,...discursive]:discursive.filter(t=>target(t)&&!replies.some(primary=>targetKey(primary)===targetKey(t)));
  const recordedAnnotations=[...(Array.isArray(d.dcp?.annotationRefs)?d.dcp.annotationRefs:[]),...refreshes.flatMap(r=>r.annotationRefs)];
  const refs=allRefs.slice(0,activityLimits.references).filter(target),annotations=recordedAnnotations.slice(0,activityLimits.annotations).filter(r=>r&&typeof r.blockId==='string'&&typeof r.propertyId==='string');
  const identities:ReplyTarget[]=[];let identityCount=0;
  for(const map of [d.dcp?.identityMap??{},...refreshes.map(r=>r.identityMap)])for(const t of Object.values(map) as any[]){if(++identityCount>activityLimits.identities)break;if(target(t)&&createdCategory(t))identities.push(t);}
  const notices=recordedNotices.slice(0,activityLimits.notices).filter(n=>n?.version===1&&noticeCodes.has(n.code)&&['info','warning'].includes(n.severity)&&typeof n.loss==='boolean'&&typeof n.detail==='string').map(n=>({...n,detail:n.detail.slice(0,2048),...(n.target&&!target(n.target)?{target:undefined}:{})}));
  const repaired=repairedNotice(d.dcp?.provider);if(repaired&&!notices.some(n=>n.code==='validation-repaired'))notices.push(repaired);
  return {refs,annotations,identities,notices,exchanges:[d.requestId??(d.dcp?.request as any)?.exchange,...refreshes.map(r=>r.exchangeId)],limited:!!d.dcp&&(!Array.isArray(d.dcp.annotationRefs)||!d.dcp.identityMap)||allRefs.length>activityLimits.references||recordedAnnotations.length>activityLimits.annotations||identityCount>activityLimits.identities||recordedNotices.length>activityLimits.notices};
 });
 return createMemo<ActivitySummary>(()=>{
  diagnostics.resolutions++;
  const c=candidates(),index=references(),items:ActivityItem[]=[],counts=Object.fromEntries(Object.keys(activityCategories).map(k=>[k,0])) as Record<ActivityCategory,number>;
  if(!c||!index)return {items,counts,notices:[],limited:false};
  const seen=new Map<string,number>(),created=new Set<string>(),glossSources=new Map<string,{blockId:string;propertyId:string}[]>();
  const add=(item:ActivityItem)=>{const old=seen.get(item.key);if(old!==undefined){if(items[old].active||!item.active)return;counts.unavailable--;items[old]=item;}else{seen.set(item.key,items.length);items.push(item);}counts[item.active?item.category:'unavailable']++;};
  const attributable=(p:any)=>typeof p?.exchangeId==='string'&&c.exchanges.includes(p.exchangeId)&&p?.sourceResourceId===index.resourceId;
  const properties=c.annotations.map(ref=>({ref,property:index.activityProperty(ref)}));
  for(const {ref,property:p}of properties)if(p?.type===GLOSS&&p.annotationId&&p.active&&attributable(p)){const refs=glossSources.get(p.annotationId)??[];refs.push(ref);glossSources.set(p.annotationId,refs);}
  for(const t of c.identities){
   const id=definitionId(t)!,d=index.activityDefinition(id),provenance=definitionProvenance(d),owned=attributable(provenance)&&t.resourceId===index.resourceId;
   if(owned)created.add(targetKey(t));
   const category=createdCategory(t)!;const sources=t.kind==='gloss'?glossSources.get(id):undefined;
   const active=owned&&index.activityTarget(t)&&(t.kind!=='gloss'||!!sources?.length);
   const name=t.kind==='entity'?d?.metadata?.scopedEntity?.entity?.name:t.kind==='gloss'?d?.value:t.kind==='argument-relation'?d?.metadata?.dialecticArgumentRelation?.relation:t.kind==='entity-relation'?d?.metadata?.scopedEntityRelation?.relation:undefined;
   add({key:'created:'+targetKey(t),category,label:name?String(name).slice(0,180):t.kind,active,target:t,sources,reason:active?undefined:!owned?'Creation provenance or ownership unavailable':'Native object, attachment or endpoint unavailable; Vault endpoints require scoped inspection'});
  }
  for(const {ref,property:p}of properties){
   if(p?.type===RANGE_ANCHOR||p?.type===GLOSS)continue;
   if(p?.type==='dialectic/unknown-semantic')continue;
   const attributed=!!p&&attributable(p);
   if(p?.type===ENTITY_REFERENCE&&p.entity){
    const t:ReplyTarget={kind:'entity',resourceId:index.resourceId,entity:p.entity};if(created.has(targetKey(t))&&p.active&&attributed)continue;
    const active=p.active&&attributed&&index.activityTarget(t);
    add({key:'reference:'+targetKey(t),category:'references',label:'Entity referenced',target:t,annotation:ref,active,reason:active?undefined:'Entity mention or identity unavailable; Vault identity may require scoped inspection'});continue;
   }
   const active=!!p?.active&&attributed;
   add({key:'annotation:'+ref.blockId+':'+ref.propertyId,category:p?.appliedTo==='generated'?'formatting':'annotations',label:p?annotationLabel(p.type):'Recorded annotation',annotation:ref,active,reason:active?undefined:'Annotation is missing, deleted, invalid or no longer attributable to this exchange'});
  }
  for(const t of c.refs){const active=index.activityTarget(t);add({key:'reference:'+targetKey(t),category:'references',label:t.kind==='entity'?'Entity referenced':t.kind==='range'?'Passage addressed':t.kind==='argument'?'Argument referenced':'Source addressed',target:t,active,reason:active?undefined:'Target is unavailable or requires scoped inspection'});}
  return {items,counts,notices:c.notices,limited:c.limited};
 });
}
