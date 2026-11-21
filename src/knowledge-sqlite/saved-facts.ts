/** Read-only SQL Facts. No RepositoryState, Cells, admission or serialized Resource reconstruction. */
import {decodeAuthoredValue,encodeAuthoredValue} from '../history/preplan-spike/wire';
import {annotationCollector} from '../knowledge/facts-annotations';
import {normalizePolicy,opaqueType,policyKey,nativeTextTypes,sourceTextTypes,type ExtractionPolicy} from '../knowledge/policy';
import {encodeFacts} from '../knowledge/transport';
import type {Facts} from '../knowledge/facts';
const unpack=(s:string)=>decodeAuthoredValue(JSON.parse(s)) as any;
const rawKey=(v:unknown)=>JSON.stringify(encodeAuthoredValue(v));
const PROFILE='mutable-saved-sql-v4:';
export interface SqlFactsRequest {resourceId:string;path:string;byteHash:string;policy:ExtractionPolicy}
/** Copy only one consistent bounded SQL snapshot; async semantic work starts after the read transaction. */
function snapshot(db:any,request:SqlFactsRequest,check:()=>void){
 return db.transaction(()=>{
  check();const resource=db.prepare('SELECT * FROM Resource WHERE guid=?').get(request.resourceId);
  if(!resource||!['complete','incomplete'].includes(resource.indexStatus)||resource.format!=='mutable-document'||resource.path!==request.path||resource.contentHash!==request.byteHash||resource.extractionProfile!==PROFILE+policyKey(request.policy))throw Error('Saved SQL evidence unavailable or mismatched');
  const block=db.prepare('SELECT guid,typename,coordinate,cellCount,attributes FROM Block WHERE resourceGuid=? AND guid=?');
  const edges=db.prepare("SELECT targetBlockGuid,targetScope,kind,slot,ordinal FROM BlockRelation WHERE sourceBlockGuid=? AND kind!='presentation' ORDER BY ordinal LIMIT 100002");
  const segments=db.prepare('SELECT attributes,definitionBlockGuid FROM StandoffProperty WHERE sourceBlockGuid=?');
  const definition=db.prepare('SELECT attributes FROM AnnotationDefinition WHERE resourceGuid=? AND ownerBlockGuid=? AND annotationId=?');
  const runs=db.prepare('SELECT text,boundaries FROM BlockTextRun WHERE blockGuid=? ORDER BY ordinal');
  let bytes=0;const decode=(s:string)=>{bytes+=Buffer.byteLength(s);if(bytes>64*1024*1024)throw Error('Saved SQL snapshot budget exceeded');return unpack(s);};
  const root=block.get(request.resourceId,resource.rootBlockGuid);if(!root)throw Error('Saved SQL root unavailable');
  const rootPayload=decode(root.attributes).payload,seen=new Set<string>(),queue:any[]=[{targetBlockGuid:root.guid,targetScope:'local',kind:'owned'}],visits:any[]=[];
  let ordinal=0;
  while(queue.length){
   check();if(++ordinal>10000){visits.push({warning:'Block budget reached'});break;}
   const edge=queue.pop();if(edge.targetScope!=='local'||edge.kind==='reference'){visits.push({warning:'External resource body not expanded'});continue;}
   if(seen.has(edge.targetBlockGuid))continue;seen.add(edge.targetBlockGuid);
   const b=block.get(resource.guid,edge.targetBlockGuid);if(!b)throw Error('Saved SQL local Block unavailable');
   const attrs=decode(b.attributes),payload=attrs.payload;
   const omitted=opaqueType(b.typename,request.policy)||b.coordinate!=='cell'&&!nativeTextTypes.includes(b.typename)&&typeof payload.text==='string'&&!!payload.text;
   const item:any={b,payload,ordinal,omitted};visits.push(item);if(omitted)continue;
   if(b.coordinate){item.runs=runs.all(b.guid).map((r:any)=>{bytes+=r.text.length*2+(r.boundaries?.length??0);if(bytes>64*1024*1024)throw Error('Saved SQL snapshot budget exceeded');return {text:r.text,...r.boundaries!==null?{boundaries:JSON.parse(r.boundaries)}:{}};});if(!item.runs.length)throw Error('Saved SQL text runs unavailable');}
   const links=new Map<string,any>();for(const s of segments.all(b.guid)){
    check();const raw=decode(s.attributes),owner=s.definitionBlockGuid;
    const shared=owner&&typeof raw.annotationId==='string'?definition.get(resource.guid,owner,raw.annotationId):undefined;
    links.set(rawKey(raw),{property:shared?{...raw,...decode(shared.attributes),id:raw.id,annotationId:raw.annotationId,start:raw.start,end:raw.end,isDeleted:!!raw.isDeleted||!!unpack(shared.attributes).isDeleted}:raw,owner:owner?{root:owner===resource.rootBlockGuid,blockId:owner}:undefined});
   }item.links=links;
   const outgoing=edges.all(b.guid);if(outgoing.length>100000)throw Error('Saved SQL relation budget exceeded');const children=outgoing.filter((e:any)=>e.slot==='children').sort((a:any,b:any)=>a.ordinal-b.ordinal),relations=outgoing.filter((e:any)=>e.slot!=='children').sort((a:any,b:any)=>a.slot.localeCompare(b.slot));
   for(const e of [...children,...relations].reverse())queue.push(e);
  }
  return {resource,rootPayload,visits};
 }).deferred();
}
export async function sqlSavedFacts(db:any,input:SqlFactsRequest,check:()=>void=()=>{}){
 const request={...input,policy:normalizePolicy(input.policy)},start=performance.now(),s=snapshot(db,request,check),readMs=performance.now()-start;
 const metadata=s.rootPayload.metadata,facts:Facts={id:s.resource.guid,rootBlockId:s.resource.rootBlockGuid,title:metadata?.title==null?'':String(metadata.title),hasTitle:metadata?.title!=null,tags:[],blocks:[],annotations:[],mentions:[],diagnostics:[],referenceDiagnostics:[]};
 if(metadata?.tags!==undefined){if(Array.isArray(metadata.tags)&&metadata.tags.every((t:any)=>typeof t==='string'))facts.tags=[...new Set<string>(metadata.tags)];else facts.diagnostics.push('Unsupported tags payload');}
 const warn=(message:string)=>{facts.diagnostics.push(message);facts.referenceDiagnostics!.push(message);};
 const annotations=annotationCollector(facts,undefined,{check,step:async()=>check()});
 for(const v of s.visits){
  check();if(v.warning){warn(v.warning);continue;}
  const {b,payload}=v,block:any={id:b.guid,type:b.typename,ordinal:v.ordinal,cellCount:0};facts.blocks.push(block);
  if(v.omitted){warn(`Unsupported hosted content (${b.typename}) omitted.`);continue;}
  block.cellCount=b.coordinate==='cell'?b.cellCount:0;
  if(v.runs){if(v.runs.reduce((n:number,r:any)=>n+r.text.length,0)>2000000)throw Error('Native text exceeds the bounded search budget');block.text={coordinate:b.coordinate,runs:v.runs};}
  // Native Cell boundaries are retained in runs; image gaps get the existing readable placeholder.
  const cells=new Map<number,string>();if(b.coordinate==='cell')for(const run of v.runs){for(let i=0;i<run.text.length;){check();const start=run.boundaries[i];let j=i+1;while(j<run.boundaries.length&&run.boundaries[j]===-1)j++;if(start<0||j>=run.boundaries.length)throw Error('Saved SQL Cell boundaries unavailable');cells.set(start,run.text.slice(i,j));i=j;}}
  const snippet=(from:number,to:number)=>{let text='';for(let i=from;i<to;i++)text+=cells.get(i)??'[inline object]';return text;};
  for(const raw of !sourceTextTypes.includes(b.typename)&&Array.isArray(payload.standoffProperties)?payload.standoffProperties:[]){
   await annotations.add({raw,blockId:b.guid,standoff:b.coordinate==='cell',length:b.cellCount??0,snippet,resolve:raw=>{const r=v.links.get(rawKey(raw));if(!r)throw Error('Saved annotation evidence unavailable');return r;}});
  }
 }
 annotations.finish();facts.diagnostics=[...new Set(facts.diagnostics)];facts.referenceDiagnostics=[...new Set(facts.referenceDiagnostics)];check();
 const wire=encodeFacts(facts);if(Buffer.byteLength(wire)>2*1024*1024)throw Error('Saved Facts response budget exceeded');
 return {facts,wire,resource:s.resource,timings:{readMs,factsMs:performance.now()-start-readMs}};
}
