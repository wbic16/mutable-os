// Compact the real Flint trial outputs without retaining authored fixture text.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
const root='artifacts/cell-qualification';
const trials=[];
for(const name of fs.readdirSync(root)) {
  const match=/^(.*)-(resident|numeric)-address-(identity|control)-(.+)$/.exec(name);
  if(!match)continue;
  const [,fixture,planner,mode,trial]=match;
  const read=name=>JSON.parse(fs.readFileSync(path.join(root,dir,name)));
  const dir=name;
  if(!fs.existsSync(path.join(root,dir,'stages.json')))continue;
  const result=read('results.json').result, stages=read('stages.json');
  const extras={};
  for(const [key,file] of [['memory','memory.json'],['retention','retention.json'],['trace','trace.json']])
    if(fs.existsSync(path.join(root,dir,file)))extras[key]=read(file);
  trials.push({fixture,planner,mode,trial,result,stages,...extras});
}
fs.writeFileSync('experiments/dom-addressing/results.json.gz',gzipSync(JSON.stringify(trials),{level:9}));
const stats=xs=>{const sorted=xs.toSorted((a,b)=>a-b);return Object.fromEntries([['median',0.5],['p95',0.95],['max',1]].map(([k,p])=>[k,Math.round(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]*100)/100]));};
const summary=trials.map(({fixture,planner,mode,trial,result:r,stages,...extra})=>{
  const warm=stages.samples.filter(s=>s.label==='sustained').slice(1);
  const med=fn=>stats(warm.map(fn)).median;
  return {fixture,planner,mode,trial,environment:r.environment,gpu:r.gpu?.renderer,first:r.rawSamples.sync[0],
    handler:r.sync,settled:r.settled,raf:r.frame,idle:stats(stages.idle),sustained:stats(warm.map(x=>x.sync)),
    sustainedRaf:stats(warm.map(x=>x.raf)),indexMutations:med(x=>x.dom.indexAttributes),
    characterUpdateMs:med(x=>x.calls.characterSplice?.ms??x.calls.characterDOM?.ms??0),
    caretWrites:med(x=>x.calls.setBaseAndExtent?.n??0),caretMs:med(x=>x.calls.setBaseAndExtent?.ms??0),
    flush:med(x=>x.repositoryMs.flush),notify:med(x=>x.repositoryMs.notify),heapGrowth:r.heapGrowthBytes,
    ...(extra.memory?{memory:extra.memory}:{}),...(extra.retention?{retention:extra.retention}:{})};
});
fs.writeFileSync('experiments/dom-addressing/summary.json',JSON.stringify(summary,null,2)+'\n');
console.log('Collected',trials.length,'trials');
