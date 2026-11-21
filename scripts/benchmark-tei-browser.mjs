// Run against the production qualification build; isolated Chrome profile,
// in-memory documents, no document saves. Default origin: http://127.0.0.1:3108.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const origin=process.env.TEI_QUALIFICATION_URL??'http://127.0.0.1:3108';
const profile=await mkdtemp(path.join(tmpdir(),'tei-smoke-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-extensions','--enable-precise-memory-info','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;const checkpoints=[];let finishTrace;
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';chrome.stderr.on('data',chunk=>{output+=chunk;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const result=JSON.parse(e.data);if(result.method==='Tracing.tracingComplete')finishTrace?.(result.params.stream);if(result.method==='Runtime.consoleAPICalled'&&result.params.args[0]?.value==='TEI_STAGE'){checkpoints.push(JSON.parse(result.params.args[1].value));}const p=pending.get(result.id);if(p){pending.delete(result.id);clearTimeout(p.timer);result.error?p.reject(Error(JSON.stringify(result.error))):p.resolve(result.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>reject(Error('timeout '+method)),120000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params,...sessionId?{sessionId}:{}}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Runtime.enable',{},sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.navigate',{url:origin+'/scripts/tei-performance/index.html'},sessionId);await new Promise(r=>setTimeout(r,1000));

 await send('Page.bringToFront',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 for(let i=0;i<200;i++){if(await evaluate('typeof window.teiPerformance === "function"'))break;await new Promise(r=>setTimeout(r,100));}
 const results=[];
 for(let run=0;run<Number(process.env.TEI_RUNS??3);run++)for(const name of (process.env.TEI_CASES??'small,large,anthology').split(',')){
  await evaluate('window.teiCleanup?.()');
  await send('HeapProfiler.collectGarbage',{},sessionId);
  if(process.env.TEI_CPU){await send('Profiler.enable',{},sessionId);await send('Profiler.start',{},sessionId);}
  if(process.env.TEI_TRACE)await send('Tracing.start',{categories:'devtools.timeline,blink.user_timing',transferMode:'ReturnAsStream'});
  const result=await evaluate(`window.${process.env.TEI_PREP ? "teiPreparationProfile" : process.env.TEI_FLINT ? "teiFlintPerformance" : "teiPerformance"}(${JSON.stringify(name)}${process.env.TEI_FLINT && !process.env.TEI_PREP ? ',' + (process.env.TEI_COMPACT !== '0') : ''})`);
  if(process.env.TEI_CPU){const cpu=await send('Profiler.stop',{},sessionId);await mkdir('artifacts/tei-performance',{recursive:true});await writeFile(`artifacts/tei-performance/${process.env.TEI_LABEL??'run'}-${name}.cpuprofile`,JSON.stringify(cpu.profile));}
  if(process.env.TEI_TRACE){const completed=new Promise(resolve=>{finishTrace=resolve;});await send('Tracing.end');const handle=await completed;let data='';for(;;){const chunk=await send('IO.read',{handle});data+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}await send('IO.close',{handle});await mkdir('artifacts/tei-performance',{recursive:true});await writeFile(`artifacts/tei-performance/${process.env.TEI_LABEL??'run'}-${name}-${run}.trace.json`,data);}
  console.log(JSON.stringify({...result,run}));
  if(process.env.TEI_EXPECT_BASELINE)assert(result.timings.canonicalConstruction!==undefined && result.counts.contents>0,'Baseline worker was not loaded');
  if(!process.env.TEI_PREP){assert.equal(result.pageCount,1);assert.equal(result.truncated,false);assert(result.typing.restored);assert.equal(result.typing.snapshots,0); }
  if(process.env.TEI_FLINT){
   if(process.env.TEI_COMPACT !== '0') {
    assert.equal(result.compactCanonicalText,true);
    assert.equal(result.canonicalCells,0);
    assert.equal(result.counts.contents,0);
    assert.equal(result.counts.placements,0);
   }
   assert.equal(result.notifications,1);assert.equal(result.reactiveRuns,1);assert.equal(result.admissionSnapshots,0);
   assert.equal(result.projectionEvents.filter(e=>e.phase==='admission'&&e.view!=='performance-workspace').length,0,'Admission rebuilt an unrelated Document projection');
  }
  results.push({...result,run});
  await mkdir('artifacts/tei-performance',{recursive:true});await writeFile(`artifacts/tei-performance/${process.env.TEI_LABEL??'run'}.json`,JSON.stringify({results},null,2)+'\n');
 }
 await mkdir('artifacts/tei-performance',{recursive:true});await writeFile(`artifacts/tei-performance/${process.env.TEI_LABEL??'run'}.json`,JSON.stringify({browser:await send('Browser.getVersion'),environment:'Production Vite build, Chrome headless, 1440x900, device scale 1, no CPU throttling; native bank admission; application views',results},null,2)+'\n');
}finally{await mkdir('artifacts/tei-performance',{recursive:true});await writeFile(`artifacts/tei-performance/${process.env.TEI_LABEL??'run'}-stages.json`,JSON.stringify(checkpoints,null,2)+'\n');socket?.close();chrome.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
process.exit(0);
