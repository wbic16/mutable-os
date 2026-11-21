import {readFile,writeFile} from 'node:fs/promises';
const root=process.env.COMPACT_OUTPUT??'artifacts/compact-canonical-m2';
const stats=values=>{const a=[...values].sort((x,y)=>x-y),n=a.length;return {n,median:n%2?a[n>>1]:(a[n/2-1]+a[n/2])/2,p95:a[Math.ceil(n*.95)-1],max:a[n-1]};};
const source=JSON.parse(await readFile(root+'/long-detail.json','utf8'));
const result=source.results.map(r=>{
 const records=r.measures.flatMap(m=>m.records),operations=[...new Set(records.map(x=>x.operation))];
 return {mode:r.mode,occurrences:r.occurrences,admissionMs:r.admission.admissionMs,activationMs:r.activation.frameInclusiveMs,captureMs:r.capture.syncMs,
 operations:Object.fromEntries(operations.map(op=>[op,{sync:stats(records.filter(x=>x.operation===op).map(x=>x.syncMs)),settled:stats(records.filter(x=>x.operation===op).map(x=>x.settledMs))}])),
 positions:r.measures.map(m=>({position:m.position,operations:Object.fromEntries(operations.map(op=>[op,stats(m.records.filter(x=>x.operation===op).map(x=>x.syncMs))])),metrics:m.metrics,allocations:m.allocations})),
 retainedMiB:{js:(r.activeHeap.usedSize-r.initialHeap.usedSize)/2**20,embedder:(r.activeHeap.embedderHeapUsedSize-r.initialHeap.embedderHeapUsedSize)/2**20,afterEditingJS:(r.afterHeap.usedSize-r.activeHeap.usedSize)/2**20},costs:r.costs,performance:r.performance,cpuSamples:r.cpuSamples};
});
await writeFile(root+'/long-summary.json',JSON.stringify(result,null,2)+'\n');
console.log('| Model / occurrences | Insert | Backspace | Forward delete | Grapheme Backspace | Undo | Redo | Selection |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
for(const r of result)console.log('| '+r.mode+' / '+r.occurrences+' | '+['insert','backspace','delete','graphemeBackspace','undo','redo','selection'].map(k=>{const s=r.operations[k].sync;return [s.median,s.p95,s.max].map(n=>n.toFixed(1)).join(' / ');}).join(' | ')+' |');
try {
 const matrix=JSON.parse(await readFile(root+'/performance.json','utf8')),rows=[];
 for(const name of [...new Set(matrix.results.map(r=>r.name))])for(const mode of ['compact','cells']){
  const runs=matrix.results.filter(r=>r.name===name&&r.mode===mode),stage=(r,s)=>r.stages.find(v=>v.stage===s);
  const median=f=>stats(runs.map(f)).median,typed=stats(runs.flatMap(r=>stage(r,'type').dispatchMs));
  rows.push({name,mode,runs:runs.length,admission:median(r=>stage(r,'admit').admissionMs),activation:median(r=>stage(r,'activate').frameInclusiveMs),capture:median(r=>stage(r,'capture').syncMs),typing:typed,jsMiB:median(r=>(stage(r,'activate').heapAfterGC.usedSize-r.initialHeap.usedSize)/2**20),embedderMiB:median(r=>(stage(r,'activate').heapAfterGC.embedderHeapUsedSize-r.initialHeap.embedderHeapUsedSize)/2**20),...(mode==='compact'?{readonly:median(r=>stage(r,'readonly').frameInclusiveMs)}:{})});
 }
 await writeFile(root+'/matrix-summary.json',JSON.stringify(rows,null,2)+'\n');
 const lines=['| Fixture | Model | Admission | Activation | Capture | Typing median / p95 / max | Active JS + embedder MiB |','|---|---|---:|---:|---:|---:|---:|'];
 for(const r of rows)lines.push(`| ${r.name} | ${r.mode} | ${r.admission.toFixed(1)} | ${r.activation.toFixed(1)} | ${r.capture.toFixed(1)} | ${[r.typing.median,r.typing.p95,r.typing.max].map(x=>x.toFixed(1)).join(' / ')} | ${r.jsMiB.toFixed(2)} + ${r.embedderMiB.toFixed(2)} |`);
 await writeFile(root+'/matrix-table.md',lines.join('\n')+'\n');
} catch(error) { if(error.code!=='ENOENT')throw error; }
