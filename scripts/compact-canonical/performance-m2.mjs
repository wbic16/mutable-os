import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir,cpus,platform,release} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'compact-proof-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disk-cache-size=1','--enable-precise-memory-info','--no-first-run','--no-default-browser-check','--disable-component-update','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
const nativePath=process.env.COMPACT_NATIVE_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink';
const nativeFixture=await readFile(nativePath);
const output=process.env.COMPACT_OUTPUT??'artifacts/compact-canonical-m2';await mkdir(output,{recursive:true});
try{
 const endpoint=await new Promise((resolve,reject)=>{let text='';chrome.stderr.on('data',chunk=>{text+=chunk;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',e=>{const result=JSON.parse(e.data),p=pending.get(result.id);if(result.method==='Runtime.exceptionThrown')errors.push(result.params.exceptionDetails);if(p){pending.delete(result.id);clearTimeout(p.timer);result.error?p.reject(Error(JSON.stringify(result.error))):p.resolve(result.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),120000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params,...sessionId?{sessionId}:{}}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const call=(method,params={})=>send(method,params,sessionId);
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await call('Runtime.enable');await call('Performance.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:(process.env.COMPACT_URL??'http://127.0.0.1:3112')+'/scripts/compact-canonical/index.html'});
 let ready=false;for(let i=0;i<200;i++){if(await evaluate('window.compactReady===true')){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ready);
 const frame=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const results=[];
 for(const mode of (process.env.COMPACT_MODES?.split(',')??['compact','cells']))for(const occurrences of [1,2]){
  await evaluate("delete window.compactProfileStop;delete window.poc;compactSetup('long')");await frame();await call('HeapProfiler.collectGarbage');const initialHeap=await call('Runtime.getHeapUsage');
  const admission=await evaluate(`compactStage('admit','${mode}')`),activation=await evaluate(`compactStage('activate','${mode}')`);
  if(occurrences===2)await evaluate('compactSecond()');await frame();await call('HeapProfiler.collectGarbage');const activeHeap=await call('Runtime.getHeapUsage');
  await evaluate('compactProfile()');const measures=[];
  await call('Profiler.enable');await call('Profiler.setSamplingInterval',{interval:1000});await call('Profiler.start');
  const pm=async()=>Object.fromEntries((await call('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));const before=await pm();
  for(const pos of ['begin','middle','end']){const m=await evaluate(`compactMeasure('${pos}',${Number(process.env.COMPACT_ROUNDS??6)})`);assert(m.restored&&m.sharedConsistent,'Long editing round must restore canonical/shared text');measures.push(m);}
  const after=await pm(),costs=await evaluate('compactProfileStop()'),profile=(await call('Profiler.stop')).profile;
  const counts={};for(const sample of profile.samples??[]){const n=profile.nodes.find(n=>n.id===sample),name=n.callFrame.functionName||'(anonymous)';counts[name]=(counts[name]??0)+1;}
  await call('HeapProfiler.collectGarbage');const afterHeap=await call('Runtime.getHeapUsage');const capture=await evaluate(`compactStage('capture','${mode}')`);
  results.push({mode,occurrences,admission,activation,capture,initialHeap,activeHeap,afterHeap,costs,measures,performance:Object.fromEntries(Object.keys(after).filter(k=>/Duration|Count/.test(k)).map(k=>[k,after[k]-before[k]])),cpuSamples:Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,30)});
  await writeFile(output+'/long-detail.json',JSON.stringify({browser:await send('Browser.getVersion'),results,errors},null,2)+'\n');console.log(JSON.stringify({mode,occurrences,costs}));
 }
 assert.equal(errors.length,0);
}finally{socket?.close();chrome.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
