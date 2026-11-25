// Create portable evidence without native documents, local paths or screenshots.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const source=process.argv[2]??'artifacts/cell-qualification';
const target=path.dirname(fileURLToPath(import.meta.url));
const raw={history:{},trials:{}}, summary={};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const rounded=n=>Math.round(n*100)/100;
function stats(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return {median:rounded(sorted[Math.floor(sorted.length/2)]),p95:rounded(sorted[Math.floor(sorted.length*.95)]),max:rounded(sorted.at(-1))};
}
function stage(rows){
  const timings=field=>stats(rows.map(r=>r[field]));
  const medians=key=>Object.fromEntries([...new Set(rows.flatMap(r=>Object.keys(r[key]??{})))].map(k=>[k,stats(rows.map(r=>r[key]?.[k]??0)).median]));
  const calls={};
  for(const name of new Set(rows.flatMap(r=>Object.keys(r.calls)))){
    calls[name]={n:stats(rows.map(r=>r.calls[name]?.n??0)).median,ms:stats(rows.map(r=>r.calls[name]?.ms??0)).median};
  }
  return {n:rows.length,sync:timings('sync'),settled:timings('settled'),raf:timings('raf'),work:medians('work'),repositoryMs:medians('repositoryMs'),dom:medians('dom'),calls};
}
function traceTotals(rows, samples) {
  const main=rows.filter(r=>r.main), starts=main.filter(r=>r.name==='qualification-dispatch-start').sort((a,b)=>a.start-b.start);
  const ends=main.filter(r=>r.name==='qualification-dispatch-end').sort((a,b)=>a.start-b.start);
  const spans=starts.map((start,i)=>({start:start.start,end:ends[i]?.start,settled:start.start+1000*samples.settled[i]}));
  const from=starts[0].start,to=starts.at(-1).start+1000*samples.frames.at(-1);
  const contained=(r,a,b)=>r.start>=a&&r.start+r.us<=b;
  const result={};
  for(const name of ['Layout','UpdateLayoutTree','PrePaint','Paint','MinorGC','MajorGC','FireAnimationFrame','RunMicrotasks','RasterTask']){
    const events=(name==='RasterTask'?rows:main).filter(r=>r.name===name&&contained(r,from,to));
    const inside=events.filter(r=>spans.some(s=>contained(r,s.start,s.end)));
    const caret=events.filter(r=>spans.some(s=>contained(r,s.end,s.settled)));
    result[name]={queuedBeforeSettled:caret.length,queuedMs:rounded(caret.reduce((n,r)=>n+r.us,0)/1000),count:events.length,ms:rounded(events.reduce((n,r)=>n+r.us,0)/1000),
      synchronous:inside.length,synchronousMs:rounded(inside.reduce((n,r)=>n+r.us,0)/1000)};
  }
  return result;
}
function archive(dir,prefix=''){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.name==='combined-probes'){archive(file,'combined-probes/');continue;}
    if(item.name==='before-style-sweep'){archive(file,'before-style/');continue;}
    if(item.name.startsWith('history-')&&item.name.endsWith('.json')){raw.history[item.name]=read(file);continue;}
    if(!item.isDirectory()||item.name.endsWith('-before')||!fs.existsSync(path.join(file,'stages.json'))) continue;
    const {result,hottest}=read(path.join(file,'results.json'));
    const stages=read(path.join(file,'stages.json')), name=prefix+item.name;
    const fixtureSha256=createHash('sha256').update(fs.readFileSync(path.join(file,'fixture.ink'))).digest('hex');
    const entry=raw.trials[name]={fixtureSha256,result,stages,hottest:hottest.map(([label,ms])=>[label.replace(/127\.0\.0\.1:\d+/g,'localhost'),ms])};
    for(const optional of ['memory','trace'])if(result.options?.[optional]!==false&&fs.existsSync(path.join(file,optional+'.json')))entry[optional]=read(path.join(file,optional+'.json'));
    // Sampling profile stripped to function names, script-relative URLs and call tree.
    const profilePath=path.join(file,'typing.cpuprofile');
    const cpu=result.options?.sampleCpu!==false&&fs.existsSync(profilePath)?read(profilePath):{nodes:[],samples:[],timeDeltas:[]};
    for(const n of cpu.nodes){
      n.callFrame.url=n.callFrame.url.replace(/^https?:\/\/[^/]+/,'').replace(/\?.*$/,'');
      delete n.positionTicks;
    }
    entry.profile=cpu;
    summary[name]={typing:Object.fromEntries(Object.entries(result.rawSamples).map(([k,v])=>[k,stats(v)])),mountMs:result.boundary&&rounded(result.boundary.mountMs),boundary:result.boundary?.typing,browserCosts:result.browserCosts,idle:stats(stages.idle),stages:{}};
    if(entry.trace)summary[name].trace=traceTotals(entry.trace,result.rawSamples);
    for(const label of new Set(stages.samples.map(r=>r.label)))summary[name].stages[label]=stage(stages.samples.filter(r=>r.label===label));
  }
}
archive(source);
if(fs.existsSync(path.join(source,'validation.json')))raw.validation=read(path.join(source,'validation.json'));
fs.writeFileSync(path.join(target,'results.json.gz'),gzipSync(JSON.stringify(raw),{level:9}));
const lean=Object.fromEntries(Object.entries(summary).map(([name,{typing,mountMs,boundary,browserCosts,idle,trace,stages}])=>[name,{typing,mountMs,boundary,browserCosts,idle,trace,bulk:Object.fromEntries(['warmPaste','afterUndoPaste','largePaste','sustained'].map(k=>[k,stages[k].sync]))}]));
fs.writeFileSync(path.join(target,'summary.json'),JSON.stringify(lean,null,2)+'\n');
fs.writeFileSync(path.join(source,'stage-summary.json'),JSON.stringify(summary));
console.log(Object.keys(summary).length+' browser trials archived.');
