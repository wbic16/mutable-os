import { inlineUnits } from '../block-tree/inline-sequence';
/** Read-only SQL projection of validated saved state. Never an admission or authoring DTO. */
import { createHash } from 'node:crypto';
import { v5 as uuid } from 'uuid';
import { decodeNative } from '../persistence/native-resource';
import { decodeBlockTree } from '../block-tree/codecs';
import { validateRepository } from '../block-tree/repository';
import { decodeHistoryDocument, resourceToRepository } from '../history/durable-core';
import { parseWorkspaceManifest } from '../reactive-editor/workspace-manifest';
import { encodeAuthoredValue } from '../history/preplan-spike/wire';
import { linkedDefinitionOwner, resolveLinkedProperty } from '../block-tree/linked-annotations';
import { externalDefinitionLink } from '../block-tree/external-reference';
import { canonicalSearchSource } from '../runtime/canonical-search-source';
import { normalizePolicy, opaqueType, nativeTextTypes, sourceTextTypes, type ExtractionPolicy } from '../knowledge/policy';
import type { RepositoryState, ContentRecord } from '../block-tree/types';

const namespace='38e2b9ce-d3e7-5a14-b67d-b265437bcad8';
export const PROFILE='mutable-saved-sql-v4';
// Extraction changes invalidate evidence, not the stable identity of authored SQL objects.
const identityProfile='mutable-saved-sql-v1';
const digest=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const json=(v:unknown)=>JSON.stringify(encodeAuthoredValue(v));
const id=(v:unknown):v is string=>typeof v==='string'&&!!v.trim();
const scalar=(v:unknown)=>typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean'?String(v):null;
const bag=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
function requireValue(ok:unknown,message:string):asserts ok {if(!ok)throw Error(`Saved SQL: ${message}`);}
const cell=(c:ContentRecord)=>['text-cell','image-cell'].includes(c.viewType);
const attribution=(p:any)=>Object.fromEntries(['createdByActorGuid','createdUtc','lastUpdatedByActorGuid','modifiedUtc'].map(k=>[k,typeof p[k]==='string'?p[k]:null]));
export interface SavedProjection {resourceId:string;rootBlockId:string;format:string;formatVersion:number|null;contentHash:string;profile:string;title:string|null;tags:string[];rootPlacementId:string|null;diagnostics:string[];blocks:any[]}

/** Actual legacy codec validation, without inventing IDs or loading manifest Documents. */
function legacy(dto:any):RepositoryState {
  let count=0;
  const check=(b:any)=>{
    requireValue(b&&typeof b==='object'&&!Array.isArray(b)&&id(b.type),'invalid legacy Block');
    requireValue(++count<=100000,'Block budget exceeded');
    if(b.children!=null){requireValue(Array.isArray(b.children),'invalid legacy children');b.children.forEach(check);}
    if(b.relation!=null){requireValue(typeof b.relation==='object'&&!Array.isArray(b.relation),'invalid legacy relations');for(const [name,v]of Object.entries(b.relation))if(['leftMargin','rightMargin'].includes(name)||name.startsWith('superposition:'))if(v&&typeof v==='object'&&!Array.isArray(v))check(v);}
  };check(dto);return decodeBlockTree(dto).state;
}

export async function projectSaved(bytes:Uint8Array,vaultGuid:string,policy?:ExtractionPolicy,timings?:Record<string,number>,check:()=>void=()=>{}):Promise<SavedProjection> {
  check();const started=performance.now();
  requireValue(bytes.byteLength<=20*1024*1024,'saved file exceeds byte budget');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const extraction=normalizePolicy(policy);
  let state:RepositoryState,resourceId:string,format:string,version:number|null,manifest:any;
  if(value?.format==='mutable-document') {const r=decodeNative(bytes, undefined, true);state=resourceToRepository(r);resourceId=r.resourceId;format='mutable-document';version=value.version;}
  else if(value?.format==='codex-history-document') {const r=decodeHistoryDocument(value);state=r.state;resourceId=r.resourceId;format=value.format;version=value.version;}
  else if(value?.kind==='speedy-workspace') {manifest=parseWorkspaceManifest(value);state=legacy(manifest.root);resourceId=manifest.workspaceId;format=manifest.kind;version=manifest.schemaVersion;}
  else {
    requireValue(!value?.format&&!value?.kind,'unsupported saved format/version');
    state=legacy(value);const root=state.contents[state.placements[state.rootPlacementKey].contentKey];
    resourceId=(root.viewType==='workspace-block'?bag(root.payload.metadata).workspaceId:bag(root.payload.metadata).documentId)??root.payload.id;
    format='legacy-block-tree';version=null;
  }
  requireValue(id(resourceId),'missing Resource identity; explicit import required');
  check();validateRepository(state);check();
  const decoded=performance.now();if(timings)timings.decodeValidationMs=decoded-started;
  const root=state.contents[state.placements[state.rootPlacementKey].contentKey];
  const blocks=Object.values(state.contents).filter(c=>!cell(c)),ids=new Set<string>();
  requireValue(blocks.length<=100000,'Block budget exceeded');
  // Missing legacy Block IDs are recoverable. Use a stable resource-local GUID,
  // never a random per-refresh identity or a rewrite of the source file. Keep
  // provenance in the SQL attributes so these cannot masquerade as authored IDs.
  const key=(...parts:unknown[])=>uuid(JSON.stringify([identityProfile,vaultGuid,resourceId,...parts]),namespace);
  const generated=new Set<string>(),visited=new Set<string>();
  for(const c of blocks)if(id(c.payload.id)){requireValue(!ids.has(c.payload.id),'duplicate persistent Block identity');ids.add(c.payload.id);}
  const identify=(ck:string,route:unknown[])=>{
    if(visited.has(ck))return;visited.add(ck);const c=state.contents[ck];if(!c||cell(c))return;
    if(!id(c.payload.id)){const guid=key('missing-block',route);requireValue(!ids.has(guid),'generated Block identity collision');c.payload.id=guid;ids.add(guid);generated.add(guid);}
    const child=(pk:string,slot:string,ordinal:number)=>{const p=state.placements[pk];if(!p.externalReference&&!p.resolvedReference)identify(p.contentKey,[c.payload.id,slot,p.placementId??ordinal]);};
    c.children.forEach((pk,i)=>child(pk,'children',i));Object.keys(c.ownedRelations).sort().forEach(slot=>child(c.ownedRelations[slot],slot,0));
  };
  identify(root.key,['root']);
  // Retained native definitions have stable wire content keys, even unplaced.
  for(const c of blocks)identify(c.key,['retained',c.key]);
  const diagnostics:string[]=[],warn=(s:string)=>{if(!diagnostics.includes(s))diagnostics.push(s);};
  const suppressed=new Set<string>();
  const suppress=(ck:string)=>{if(suppressed.has(ck))return;suppressed.add(ck);const c=state.contents[ck];for(const pk of [...c.children,...Object.values(c.ownedRelations)]){const p=state.placements[pk];if(p.kind==='owned'&&!p.externalReference&&!p.resolvedReference)suppress(p.contentKey);}};
  for(const c of blocks)if(opaqueType(c.viewType,extraction))suppress(c.key);
  const result:SavedProjection={resourceId,rootBlockId:String(root.payload.id),format,formatVersion:version,contentHash:digest(bytes),profile:PROFILE+':'+JSON.stringify(extraction),
    title:typeof bag(root.payload.metadata).title==='string'?bag(root.payload.metadata).title:null,tags:[],rootPlacementId:state.placements[state.rootPlacementKey].placementId??null,diagnostics,blocks:[]};
  const tags=bag(root.payload.metadata).tags;
  if(tags!==undefined){requireValue(Array.isArray(tags)&&tags.every(t=>typeof t==='string'),'invalid native tags');result.tags=[...new Set<string>(tags)].sort();}
  for(const c of blocks) {
    check();
    const blockId=String(c.payload.id),p=c.payload as any;
    const coordinate=c.inlineKind==='standoff'?'cell':nativeTextTypes.includes(c.viewType)?'utf16':null;
    const units = c.compactInline ? [...inlineUnits(c.compactInline.spans)].map(a => ({ viewType: a.kind === 'text' ? 'text-cell' : a.kind === 'image' ? 'image-cell' : 'inline-alternative-cell', payload: a.kind === 'text' ? { text: a.text } : a.properties })) : c.inlineContent.map(pk=>state.contents[state.placements[pk].contentKey]);
    const text=coordinate==='cell'?units.map(c=>c.viewType==='text-cell'?c.payload.text:'\ufffc').join(''):coordinate==='utf16'?String(p.text??''):null;
    const attrs={payload:p,...(generated.has(blockId)?{indexIdentity:{origin:'generated-missing-block',resourceId}}:{}),opaqueRelations:c.opaqueRelations,wireChildren:c.wireChildren,wireRelation:c.wireRelation,
      ...(c.inlineKind==='standoff'?{inlineObjects:units.flatMap((c,index)=>c.viewType!=='text-cell'?[{index,kind:c.viewType,payload:c.payload}]:[])}:{}),
      ...(manifest&&c===root?{workspaceDocuments:manifest.documents}: {})};
    const row={guid:blockId,resourceGuid:resourceId,entityGuid:null,typename:c.viewType,authoredType:String(p.type??c.viewType),text,coordinate,cellCount:c.inlineKind==='standoff'?units.length:null,
      explicitlyRetained:c.definitionOwnerKey===undefined?0:1,attributes:json(attrs),...attribution(p)};
    // Exact source units are transient proof data, not canonical or derived SQL rows.
    const out={block:row,sourceUnits:coordinate==='cell'?units.map(c=>c.viewType==='text-cell'?String(c.payload.text):'\ufffc'):coordinate==='utf16'?text!.split(''):[],properties:[] as any[],relations:[] as any[],definitions:[] as any[],segments:[] as any[],runs:[] as any[]};
    const counts=(values:any)=>{const m=new Map<string,number>();for(const v of Array.isArray(values)?values:[])if(id(v?.id))m.set(v.id,(m.get(v.id)??0)+1);return m;};
    const propertyIds=counts(p.blockProperties),segmentIds=counts(p.standoffProperties);
    const propertyKey=(kind:string,raw:any,ordinal:number)=>{
      const duplicate=id(raw.id)&&(kind==='property'?propertyIds:segmentIds).get(raw.id)!>1;
      if(duplicate)warn('Duplicate scoped property identity retained with ordinal provenance');
      return key(blockId,kind,id(raw.id)?['authored',raw.id,...duplicate?[ordinal]:[]]:['derived',ordinal,digest(json(raw))]);
    };
    if(p.blockProperties!==undefined){requireValue(Array.isArray(p.blockProperties),'invalid BlockProperties');p.blockProperties.forEach((raw:any,ordinal:number)=>{
      requireValue(raw&&typeof raw==='object'&&!Array.isArray(raw)&&id(raw.type),'invalid BlockProperty');
      out.properties.push({guid:propertyKey('property',raw,ordinal),blockGuid:blockId,authoredId:id(raw.id)?raw.id:null,identityKind:id(raw.id)?'authored':'derived',ordinal,typename:raw.type,
        value:scalar(raw.value),valueJson:json(raw.value),isDeleted:raw.isDeleted?1:0,attributes:json(raw),...attribution(raw)});
    });}
    const addEdge=(pk:string,slot:string,ordinal:number)=>{
      const edge=state.placements[pk],external=edge.externalReference??edge.resolvedReference;
      const target=external?.targetId??state.contents[edge.contentKey]?.payload.id;
      requireValue(id(target),'structural relation lacks target Block identity');
      out.relations.push({guid:key(blockId,'placement',edge.placementId??[slot,ordinal]),resourceGuid:resourceId,sourceBlockGuid:blockId,
        authoredId:edge.placementId??null,identityKind:edge.placementId?'authored':'derived',typename:slot==='children'?'children':slot,targetBlockGuid:target,
        targetResourceGuid:external&&'resourceId'in external.source?external.source.resourceId:external?null:resourceId,targetScope:external?.source.scope??'local',kind:edge.kind,
        slot,ordinal,topology:null,targetDescriptor:external?json(external):null,attributes:null,...attribution({})});
    };
    c.children.forEach((pk,i)=>addEdge(pk,'children',i));Object.keys(c.ownedRelations).sort().forEach((slot,i)=>addEdge(c.ownedRelations[slot],slot,i));
    const anchor=bag(p.metadata).anchor;
    if(anchor!==undefined){requireValue(anchor&&anchor.version===1&&id(anchor.blockId),'invalid anchor assertion');out.relations.push({guid:key(blockId,'anchor'),resourceGuid:resourceId,sourceBlockGuid:blockId,authoredId:null,identityKind:'derived',typename:'anchor-to',targetBlockGuid:anchor.blockId,targetResourceGuid:resourceId,targetScope:'local',kind:'presentation',slot:null,ordinal:null,topology:null,targetDescriptor:null,attributes:json(anchor),...attribution({})});}
    if(p.linkedAnnotations!==undefined) {
      requireValue(p.linkedAnnotations&&typeof p.linkedAnnotations==='object'&&!Array.isArray(p.linkedAnnotations),'invalid annotation registry');
      for(const [annotationId,raw]of Object.entries<any>(p.linkedAnnotations)){
        requireValue(raw&&typeof raw==='object'&&!Array.isArray(raw),'invalid annotation definition');
        out.definitions.push({guid:key(blockId,'definition',annotationId),resourceGuid:resourceId,ownerBlockGuid:blockId,annotationId,typename:typeof raw.type==='string'?raw.type:null,
          value:scalar(raw.value),valueJson:json(raw.value),isDeleted:raw.isDeleted?1:0,attributes:json(raw)});
      }
    }
    if(!sourceTextTypes.includes(c.viewType)&&p.standoffProperties!==undefined){requireValue(Array.isArray(p.standoffProperties),'invalid StandoffProperties');p.standoffProperties.forEach((raw:any,ordinal:number)=>{
      requireValue(raw&&typeof raw==='object'&&!Array.isArray(raw),'invalid StandoffProperty');
      const a=resolveLinkedProperty(state,raw,c.key),owner=linkedDefinitionOwner(state,raw,c.key),external=externalDefinitionLink(raw);
      const definition=owner?.payload.linkedAnnotations?.[raw.annotationId];
      const resolved=!!definition&&!external;
      const zeroWidth=raw.isZeroWidth===true;
      const nativeCode=c.viewType==='standoff-code-mirror-block',codePoints=nativeCode?[...text!]:[];
      const length=nativeCode?codePoints.length:coordinate==='cell'?units.length:text?.length??0;
      requireValue(coordinate&&Number.isSafeInteger(raw.start)&&Number.isSafeInteger(raw.end)&&raw.start>=0&&
        (zeroWidth ? raw.start<=length&&(raw.end===raw.start||raw.end===raw.start-1) : raw.end+1>=raw.start&&raw.end+1<=length),'invalid or unrepresentable standoff range');
      const segmentCoordinate=zeroWidth?'utf16':coordinate;
      const startIndex=nativeCode?codePoints.slice(0,raw.start).join('').length:zeroWidth&&coordinate==='cell'?units.slice(0,raw.start).map(c=>c.viewType==='text-cell'?String(c.payload.text):'\ufffc').join('').length:raw.start;
      const endIndex=zeroWidth?startIndex:nativeCode?codePoints.slice(0,raw.end+1).join('').length:raw.end+1;
      if(raw.annotationId&&!resolved)warn('Unresolved external or missing annotation definition');
      const definitionResourceGuid=external&&'resourceId'in external.source?external.source.resourceId:owner?resourceId:null;
      out.segments.push({guid:propertyKey('segment',raw,ordinal),resourceGuid:resourceId,sourceBlockGuid:blockId,authoredId:id(raw.id)?raw.id:null,identityKind:id(raw.id)?'authored':'derived',
        logicalGuid:raw.annotationId?key('logical',definitionResourceGuid,owner?.payload.id??null,external??null,raw.annotationId):propertyKey('logical',raw,ordinal),
        typename:typeof a.type==='string'?a.type:null,startIndex,endIndex,coordinate:segmentCoordinate,
        text:zeroWidth?'':nativeCode?codePoints.slice(raw.start,raw.end+1).join(''):coordinate==='cell'?units.slice(raw.start,raw.end+1).map(c=>c.viewType==='text-cell'?c.payload.text:'\ufffc').join(''):text!.slice(raw.start,raw.end+1),
        value:scalar(a.value),valueJson:json(a.value),targetEntityGuid:a.type==='codex/entity-reference'&&id(a.value)?a.value:null,
        targetBlockGuid:a.type==='codex/block-reference'&&id(a.value)?a.value:null,targetResourceGuid:a.type==='codex/block-reference'&&id(bag(a.metadata).documentId)?bag(a.metadata).documentId:null,
        definitionResourceGuid:raw.annotationId?definitionResourceGuid:null,definitionBlockGuid:raw.annotationId?owner?.payload.id??null:null,definitionAnnotationId:raw.annotationId??null,
        definitionHash:resolved?digest(json(definition)):null,definitionTarget:external?json(external):null,resolution:raw.annotationId?(resolved?'resolved':'unresolved'):'direct',isDeleted:a.isDeleted?1:0,topology:null,attributes:json(raw),...attribution(a)});
    });}
    if(coordinate&&!suppressed.has(c.key)) {const source=await canonicalSearchSource(state,c.key,0,undefined,20*1024*1024);out.runs=source.runs.map((r,ordinal)=>({blockGuid:blockId,ordinal,text:r.text,boundaries:r.boundaries?JSON.stringify(r.boundaries):null}));}
    if(suppressed.has(c.key))warn('Opaque application text excluded from search; authored structure retained');
    result.blocks.push(out);
  }
  check();result.blocks.sort((a,b)=>a.block.guid.localeCompare(b.block.guid));
  if(timings)timings.projectionMs=performance.now()-decoded;
  return result;
}
