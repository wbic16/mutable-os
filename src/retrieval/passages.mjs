/** Worker-only passage planning over confirmed native SQL projections. No editor/DOM imports. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getEncoding} from 'js-tiktoken';
import {decodeAuthoredValue} from '../history/preplan-spike/authored-values.mjs';
const enc=getEncoding('cl100k_base');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const tokens=text=>enc.encode(text,[],[]).length;
function largestEnd(text,bounds,start,max){
 let lo=start+1,hi=text.length,best=start;
 while(lo<=hi){const mid=(lo+hi)>>1;if(tokens(text.slice(start,mid))<=max){best=mid;lo=mid+1;}else hi=mid-1;}
 while(best>start&&(bounds[best]===false||tokens(text.slice(start,best))>max))best--;
 assert(best>start,'A single native source unit exceeds the chunk budget');return best;
}
function makeChunks(flows,variant,check){
 const chunks=[];
 for(const f of flows){
  check();
  const text=f.parts.map(p=>p.text).join('\n\n'), parts=[];let pos=0;
  const bounds=Array(text.length+1).fill(true);
  for(const p of f.parts){parts.push({...p,flowStart:pos,flowEnd:pos+p.text.length});p.boundaries.forEach((n,i)=>{if(n<0)bounds[pos+i]=false;});pos+=p.text.length+2;}
  const emit=(start,end)=>{
   check();const body=text.slice(start,end);if(!body.trim())return;
   const spans=parts.flatMap(p=>{const a=Math.max(start,p.flowStart),z=Math.min(end,p.flowEnd);if(z<=a)return[];
    const from=a-p.flowStart,to=z-p.flowStart;assert(p.boundaries[from]>=0&&p.boundaries[to]>=0);
    return[{runOrdinal:p.runOrdinal,blockGuid:p.blockGuid,resourceId:f.resourceId,coordinate:p.coordinate,occurrence:p.occurrence,contribution:p.contribution,
     start:p.boundaries[from],end:p.boundaries[to],runStart:from,runEnd:to,chunkStart:a-start,chunkEnd:z-start,textHash:hash(text.slice(a,z))}];});
   chunks.push({id:`${variant}-${chunks.length}`,variant,resourceId:f.resourceId,sourceHash:f.sourceHash,flow:f.key,text:body,tokens:tokens(body),inputHash:hash(body),spans});
  };
  if(variant==='fixed'){
   let start=0;while(start<text.length){const end=largestEnd(text,bounds,start,384);emit(start,end);if(end===text.length)break;
    let next=end;while(next>start&&tokens(text.slice(next-1,end))<=64)next--;
    while(next<end&&bounds[next]===false)next++;start=next>start?next:end;
   }
  }else{
   const units=[];
   for(const p of parts){let start=p.flowStart;while(start<p.flowEnd){let end=Math.min(p.flowEnd,largestEnd(text,bounds,start,384));
     if(end<p.flowEnd){const prefix=text.slice(start,end);const matches=[...prefix.matchAll(/[.!?][”"’']?\s+/gu)];const last=matches.at(-1);if(last&&last.index>80){let cut=start+last.index+last[0].length;while(cut>start&&bounds[cut]===false)cut--;end=cut;}}
     units.push([start,end]);start=end;
   }}
   let a=null,z=null;for(const [start,end]of units){if(a!==null&&tokens(text.slice(a,end))>384){emit(a,z);a=null;}a??=start;z=end;}if(a!==null)emit(a,z);
  }
 }
 return chunks;
}

export function planPassages(projection,{chunking='structure'}={},check=()=>{}){
 assert(['structure','fixed'].includes(chunking),'Unsupported chunker');
 const {resource,blocks:rows}=projection;assert.equal(resource.indexStatus,'complete');
 assert(rows.length<=100000,'Block budget exceeded');
 const blocks=new Map(rows.map(b=>[b.block.guid,b])),flows=[];let active=null,characters=0,occurrences=0;
 function walk(id,route,context,ancestors){
  check();assert(route.length<=128,'Occurrence depth budget exceeded');assert(++occurrences<=100000,'Occurrence budget exceeded');assert(!ancestors.has(id),'Cycle');
  const b=blocks.get(id);assert(b,'Missing owned Block');
  const metadata=decodeAuthoredValue(JSON.parse(b.block.attributes)).payload?.metadata??{},d=metadata.dialectic;
  if(d?.kind==='contribution'){if(d.state!=='committed')return;context={key:id,contribution:{blockGuid:id,ordinal:d.ordinal,author:d.author,participant:d.participant}};}
  if(/(?:tab|side|surface|grid-cell|table-cell|page)-block$/.test(b.block.typename))context={...context,key:route.join('/')+':'+id};
  if(b.properties.some(p=>!p.isDeleted&&/heading/.test(p.typename)))context={...context,key:context.key+':heading:'+id};
  for(const run of b.runs){if(!run.text.trim())continue;
   characters+=run.text.length;assert(characters<=4*1024*1024,'Text budget exceeded');
   const boundaries=run.boundaries?JSON.parse(run.boundaries):Array.from({length:run.text.length+1},(_,i)=>i);
   assert.equal(boundaries.length,run.text.length+1,'Missing native range map');
   for(let i=1;i<run.text.length;i++)if(/[\uD800-\uDBFF]/.test(run.text[i-1])&&/[\uDC00-\uDFFF]/.test(run.text[i]))boundaries[i]=-1;
   if(!active||active.key!==context.key||b.runs.length>1){active={key:context.key,resourceId:resource.guid,sourceHash:resource.contentHash,parts:[]};flows.push(active);}
   active.parts.push({blockGuid:id,runOrdinal:run.ordinal,text:run.text,boundaries,coordinate:b.block.coordinate,occurrence:route,contribution:context.contribution});if(b.runs.length>1)active=null;
  }
  const next=new Set(ancestors).add(id);
  for(const r of [...b.relations].sort((a,b)=>a.slot.localeCompare(b.slot)||a.ordinal-b.ordinal)){
   if(r.targetScope!=='local'||r.kind!=='owned')continue;
   walk(r.targetBlockGuid,[...route,r.authoredId??r.guid],r.slot==='children'?context:{...context,key:context.key+':'+r.slot+':'+r.guid},next);
  }
 }
 walk(resource.rootBlockGuid,[resource.rootPlacementId??resource.rootBlockGuid],{key:resource.rootBlockGuid,contribution:null},new Set());
 const chunks=makeChunks(flows,chunking,check);for(const c of chunks){assert(c.spans.length<=512&&Buffer.byteLength(JSON.stringify(c.spans))<=262144,'Source-map budget exceeded');}assert(chunks.length<=20000,'Passage budget exceeded');return chunks;
}
/** Re-resolve exact SQL-native ranges; this never issues DCP authority. */
export function verifyPassage(source,row){
 assert.equal(row.sourceHash,source.resource.contentHash,'Stale source');const blocks=new Map(source.blocks.map(b=>[b.block.guid,b]));
 for(const s of row.spans){assert.equal(s.resourceId,source.resource.guid,'Foreign Resource');const b=blocks.get(s.blockGuid);assert(b,'Missing Block');assert.equal(s.coordinate,b.block.coordinate);
  const run=b.runs.find(r=>r.ordinal===s.runOrdinal);assert(run,'Missing text run');
  const bounds=run.boundaries?JSON.parse(run.boundaries):Array.from({length:run.text.length+1},(_,i)=>i);
  assert.equal(bounds[s.runStart],s.start);assert.equal(bounds[s.runEnd],s.end);assert(s.start>=0&&s.end>=s.start&&s.runStart>=0&&s.runEnd<=run.text.length);
  const text=run.text.slice(s.runStart,s.runEnd);assert.equal(hash(text),s.textHash);assert.equal(row.text.slice(s.chunkStart,s.chunkEnd),text);
  let current=source.resource.rootBlockGuid;assert.equal(s.occurrence[0],source.resource.rootPlacementId??current);
  for(const placement of s.occurrence.slice(1)){const edge=blocks.get(current)?.relations.find(r=>(r.authoredId??r.guid)===placement&&r.kind==='owned'&&r.targetScope==='local');assert(edge,'Stale occurrence');current=edge.targetBlockGuid;}assert.equal(current,s.blockGuid);
 }
 return true;
}
