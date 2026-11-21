/** Offline corpus experiment. No application imports at runtime except the read-only saved projector. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const root=process.cwd(), out=path.resolve(process.env.MUTABLE_VECTOR_EXPERIMENT_OUT??'artifacts/vector-search-milestone-a');
const temp=process.env.MUTABLE_VECTOR_EXPERIMENT_DEPS??fs.readFileSync('/tmp/mutable-vector-investigation-path','utf8').trim();
const {getEncoding}=require(path.join(temp,'tokenizer/node_modules/js-tiktoken'));
const enc=getEncoding('cl100k_base');
const tokens=s=>enc.encode(s,[],[]).length;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const artifact=n=>path.join(out,n);
const fixtures=[
 ['poe','vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink','2b8f2d68e44165080060c27f8f1e6c5b886d2f450c3710dc2b6c6c6188d508bd'],
 ['symposium','vaults/imported/Conversation on November 11, 2026 (3).ink','3aecdd6abb3518838b2d47b37c522de3c74064baa7f60811c32374bd7e08ae3d']
];
const queryPath=new URL('./queries.json',import.meta.url);
fs.mkdirSync(out,{recursive:true});
function validBounds(run,sourceUnits,coordinate){
 const a=run.boundaries?(typeof run.boundaries==='string'?JSON.parse(run.boundaries):[...run.boundaries]):Array.from({length:run.text.length+1},(_,i)=>i);
 for(let i=1;i<run.text.length;i++) if(/[\uD800-\uDBFF]/.test(run.text[i-1])&&/[\uDC00-\uDFFF]/.test(run.text[i])) a[i]=-1;
 if(coordinate==='cell') for(let i=0;i<a.length;i++) if(a[i]>=0) assert(a[i]<=sourceUnits.length);
 return a;
}
// Endpoints always lie on real source boundaries, never inside a surrogate or native Cell.
function largestEnd(text,bounds,start,max){
 let lo=start+1,hi=text.length,best=start;
 while(lo<=hi){const mid=(lo+hi)>>1;if(tokens(text.slice(start,mid))<=max){best=mid;lo=mid+1;}else hi=mid-1;}
 while(best>start&&(bounds[best]===false||tokens(text.slice(start,best))>max))best--;
 assert(best>start,'A single native source unit exceeds the chunk budget');return best;
}
function makeChunks(flows,variant){
 const chunks=[];
 for(const f of flows){
  const text=f.parts.map(p=>p.text).join('\n\n'), parts=[];let pos=0;
  const bounds=Array(text.length+1).fill(true);
  for(const p of f.parts){parts.push({...p,flowStart:pos,flowEnd:pos+p.text.length});p.boundaries.forEach((n,i)=>{if(n<0)bounds[pos+i]=false;});pos+=p.text.length+2;}
  const emit=(start,end)=>{
   const body=text.slice(start,end);if(!body.trim())return;
   const spans=parts.flatMap(p=>{const a=Math.max(start,p.flowStart),z=Math.min(end,p.flowEnd);if(z<=a)return[];
    const from=a-p.flowStart,to=z-p.flowStart;assert(p.boundaries[from]>=0&&p.boundaries[to]>=0);
    return[{record:p.record,blockGuid:p.blockGuid,resourceId:f.resourceId,coordinate:p.coordinate,occurrence:p.occurrence,contribution:p.contribution,
     start:p.boundaries[from],end:p.boundaries[to],runStart:from,runEnd:to,chunkStart:a-start,chunkEnd:z-start,textHash:hash(text.slice(a,z))}];});
   chunks.push({id:`${variant}-${chunks.length}`,variant,fixture:f.fixture,resourceId:f.resourceId,sourceHash:f.sourceHash,flow:f.key,text:body,tokens:tokens(body),inputHash:hash(body),spans});
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
function resolveSpan(record,span,currentSourceHash){
 assert.equal(currentSourceHash,record.sourceHash,'Stale source revision');
 assert.equal(span.resourceId,record.resourceId,'Foreign resource');
 assert.equal(span.blockGuid,record.blockGuid,'Wrong Block');
 assert.deepEqual(span.occurrence,record.occurrence,'Wrong occurrence');
 assert.equal(span.coordinate,record.coordinate,'Wrong coordinate system');
 assert(Number.isInteger(span.start)&&Number.isInteger(span.end)&&span.start>=0&&span.end>=span.start&&span.end<=record.sourceUnits.length);
 const text=record.sourceUnits.slice(span.start,span.end).join('');
 assert.equal(hash(text),span.textHash,'Source excerpt changed');return text;
}
function verify(corpus){
 let spans=0;const records=new Map(corpus.records.map(r=>[r.id,r]));
 for(const c of corpus.chunks){assert(c.tokens<=384);const owners=new Set();for(const s of c.spans){const r=records.get(s.record);assert(r);assert.equal(c.sourceHash,r.sourceHash);assert.deepEqual(s.occurrence,r.occurrence);
  const expected=resolveSpan(r,s,c.sourceHash);assert.equal(c.text.slice(s.chunkStart,s.chunkEnd),expected);assert.equal(hash(expected),s.textHash);assert.equal(r.text.slice(s.runStart,s.runEnd),expected);owners.add(JSON.stringify(s.contribution));spans++;}
  assert(owners.size<=1,'Contribution boundary crossed');assert.equal(hash(c.text),c.inputHash);
 }
 return {chunks:corpus.chunks.length,spans,allExact:true,contributionBoundaries:true};
}
async function prepare(){
 assert(!fs.existsSync(artifact('provider-ledger.json')),'Paid attempt exists; preserve its manifest and evidence');
 const start=performance.now();
 await build({stdin:{contents:`export {projectSaved} from './src/knowledge-sqlite/saved-projection.ts'; export {decodeAuthoredValue} from './src/history/preplan-spike/wire.ts';`,resolveDir:root},outfile:artifact('projection.mjs'),bundle:true,platform:'node',format:'esm',target:'node22'});
 const {projectSaved,decodeAuthoredValue}=await import(artifact('projection.mjs'));
 const records=[],flows=[],sources=[],semanticInventory={};
 for(const [name,file,expectedHash]of fixtures){
  const bytes=fs.readFileSync(file);assert.equal(hash(bytes),expectedHash,'Original fixture changed: review before embedding');fs.writeFileSync(artifact(name+'.ink'),bytes);
  const timings={},t=performance.now();const p=await projectSaved(bytes,'00000000-0000-4000-8000-000000000001',undefined,timings);timings.totalMs=performance.now()-t;
  const blocks=new Map(p.blocks.map(b=>[b.block.guid,b]));
  sources.push({name,path:file,sha256:hash(bytes),bytes:bytes.length,resourceId:p.resourceId,timings,projectionDiagnostics:p.diagnostics});
  semanticInventory[name]={};for(const b of p.blocks)for(const d of b.definitions)semanticInventory[name][d.typename]=(semanticInventory[name][d.typename]??0)+1;
  let activeFlow=null,recordOrdinal=0;
  function walk(id,route=[],context={key:p.rootBlockId,contribution:null},ancestors=new Set()){
   assert(!ancestors.has(id),'Cycle');const b=blocks.get(id);if(!b)return;
   const a=decodeAuthoredValue(JSON.parse(b.block.attributes)),d=a.payload?.metadata?.dialectic;
   if(d?.kind==='contribution'){
    if(d.state!=='committed')return;
    context={key:id,contribution:{blockGuid:id,ordinal:d.ordinal,author:d.author,participant:d.participant}};
   }
   if(/(?:tab|side|surface|grid-cell|table-cell|page)-block$/.test(b.block.typename))context={...context,key:route.join('/')+':'+id};
   const heading=(a.payload?.blockProperties??[]).some(p=>/heading/.test(p.type??''));if(heading)context={...context,key:context.key+':heading:'+id};
   for(const run of b.runs){if(!run.text.trim())continue;
    const record={id:`${name}:${recordOrdinal++}`,fixture:name,sourceHash:expectedHash,resourceId:p.resourceId,blockGuid:id,type:b.block.typename,
     text:run.text,coordinate:b.block.coordinate,sourceUnits:b.sourceUnits,boundaries:validBounds(run,b.sourceUnits,b.block.coordinate),occurrence:route,contribution:context.contribution};
    records.push(record);
    // A run break (including an inline object) is a hard boundary. Never treat it as adjacent prose.
    if(!activeFlow||activeFlow.key!==context.key||activeFlow.fixture!==name||b.runs.length>1){activeFlow={key:context.key,fixture:name,resourceId:p.resourceId,sourceHash:expectedHash,parts:[]};flows.push(activeFlow);}
    activeFlow.parts.push({...record,record:record.id});if(b.runs.length>1)activeFlow=null;
   }
   const next=new Set(ancestors).add(id);
   for(const r of [...b.relations].sort((a,b)=>a.slot.localeCompare(b.slot)||a.ordinal-b.ordinal)){
    if(r.targetScope!=='local'||r.kind!=='owned')continue;
    walk(r.targetBlockGuid,[...route,r.authoredId??r.guid],r.slot==='children'?context:{...context,key:context.key+':'+r.slot+':'+r.guid},next);
   }
  }
  walk(p.rootBlockId,[p.rootPlacementId??p.rootBlockId]);
 }
 const chunkStart=performance.now();const chunks=[...makeChunks(flows,'fixed'),...makeChunks(flows,'structure')];
 const queries=read(queryPath).map(q=>({...q,facets:q.facets.map((alternatives,index)=>({index,alternatives:alternatives.flatMap(quote=>{
  const refs=records.flatMap(r=>{const from=r.text.indexOf(quote);return from<0?[]:[{record:r.id,start:from,end:from+quote.length,quote}];});assert(refs.length,`Missing gold excerpt: ${quote}`);return refs;
 })}))}));
 const corpus={profile:{model:'text-embedding-3-small',dimensions:1536,metric:'cosine',extension:'0.1.9',tokenizer:'js-tiktoken@1.0.21/cl100k_base',maxTokens:384,fixedOverlap:64,structureOverlap:0},sources,semanticInventory,records,chunks,queries};
 const unique=new Map([...chunks.map(c=>c.text),...queries.map(q=>q.query)].map(s=>[hash(s),s]));
 const inputs=[...unique].map(([inputHash,text])=>({inputHash,text,tokens:tokens(text)}));
 const manifest={createdUtc:new Date().toISOString(),sources,profile:corpus.profile,variants:Object.fromEntries(['fixed','structure'].map(v=>[v,{chunks:chunks.filter(c=>c.variant===v).length,tokens:chunks.filter(c=>c.variant===v).reduce((a,c)=>a+c.tokens,0)}])),queries:queries.length,uniqueInputs:inputs.length,plannedTokens:inputs.reduce((n,x)=>n+x.tokens,0),cap:50000,priceUsdPerMillion:0.02,upload:inputs,queryFileHash:hash(fs.readFileSync(queryPath)),corpusHash:hash(JSON.stringify(corpus))};
 assert(manifest.plannedTokens<=manifest.cap);manifest.estimatedUsd=manifest.plannedTokens*0.02/1e6;
 manifest.sourceChecks=verify(corpus);manifest.localTiming={chunkAndGoldMs:performance.now()-chunkStart,totalPrepareMs:performance.now()-start};
 write(artifact('corpus.json'),corpus);write(artifact('upload-manifest.json'),manifest);
 console.log(JSON.stringify({...manifest,upload:undefined},null,2));
}
if(process.argv[2]==='prepare')await prepare();
export {out,artifact,read,write,hash,tokens,verify,fixtures,temp,makeChunks,validBounds,resolveSpan};
