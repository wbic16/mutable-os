// M5 closure only. Serve matched production builds on 3108 (M4) / 3109 (M5).
// Each batch gets the existing benchmark's fresh Chrome profile and all checks.
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='artifacts/tei-m5-closure';
await mkdir(directory,{recursive:true});
const builds=Object.fromEntries(await Promise.all(['m4','m5'].map(async variant=>[variant,JSON.parse(await readFile(`${directory}/build-${variant}.json`,'utf8'))])));
assert.equal(builds.m4.harnessSha256,builds.m5.harnessSha256);
assert.deepEqual(builds.m4.fixtures,builds.m5.fixtures);
const batches=[],results=[];
for(let round=1;round<=3;round++)for(const variant of round%2?['m4','m5']:['m5','m4']) {
  const label=`m5-closure-r${round}-${variant}`,log=await open(`${directory}/${label}.log`,'w');
  try {
    const child=spawn(process.execPath,['scripts/benchmark-tei-browser.mjs'],{env:{...process.env,TEI_FLINT:'1',TEI_COMPACT:'1',TEI_PREP:'',TEI_CPU:'',TEI_TRACE:'',TEI_EXPECT_BASELINE:'',TEI_RUNS:'1',TEI_CASES:'small,large,anthology',TEI_LABEL:label,TEI_QUALIFICATION_URL:`http://127.0.0.1:${variant==='m4'?3108:3109}`},stdio:['ignore',log.fd,log.fd]});
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    assert.equal(code,0,`${label} failed; inspect its log`);
  } finally {await log.close();}
  const batch=JSON.parse(await readFile(`artifacts/tei-performance/${label}.json`,'utf8'));
  if(batches.length)assert.deepEqual(batch.browser,batches[0].browser);
  batches.push({round,variant,label,browser:batch.browser});
  results.push(...batch.results.map(result=>({...result,round,variant})));
  await writeFile(`${directory}/matched.json`,JSON.stringify({builds,batches,results},null,2));
  console.log(label,JSON.stringify(batch.results.map(r=>({fixture:r.name,usable:r.usableMs,metadata:r.metadataMs}))));
}
assert.equal(results.length,18);
const summary={};
for(const name of ['small','large','anthology']) {
  summary[name]={};
  for(const field of ['timings.conversionTotal','workerMs','workerRoundTripMs','admissionMs','candidateMs','openAndRenderMs','usableMs','metadataMs','captureMs','saveMs']) {
    summary[name][field]={};
    for(const variant of ['m4','m5']) {
      const values=results.filter(r=>r.name===name&&r.variant===variant).map(r=>field.split('.').reduce((value,key)=>value[key],r)).sort((a,b)=>a-b);
      summary[name][field][variant]={median:values[1],min:values[0],max:values[2]};
    }
  }
}
await writeFile(`${directory}/summary.json`,JSON.stringify(summary,null,2));
console.log('Matched comparison complete: three samples per variant/fixture.');
