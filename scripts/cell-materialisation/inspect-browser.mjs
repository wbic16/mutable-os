// Diagnostic production browser measurements; saves only QA evidence.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'cell-inspection-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disk-cache-size=1','--enable-precise-memory-info','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';chrome.stderr.on('data',chunk=>{output+=chunk;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const result=JSON.parse(e.data),p=pending.get(result.id);if(p){pending.delete(result.id);clearTimeout(p.timer);result.error?p.reject(Error(JSON.stringify(result.error))):p.resolve(result.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),120000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params,...sessionId?{sessionId}:{}}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.navigate',{url:(process.env.CELL_URL??'http://127.0.0.1:3110')+'/scripts/cell-materialisation/index.html'},sessionId);
 let ready=false;for(let i=0;i<200;i++){if(await evaluate('typeof cellInspection === "function"')){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ready);
 await evaluate('cellInspection("small","facts")');
 const results=[];
 for(let run=0;run<Number(process.env.CELL_RUNS??3);run++)for(const name of (process.env.CELL_FIXTURES??'small,large,anthology,extended').split(','))for(const mode of (process.env.CELL_FLINT?['flint']:['parse','decode','facts'])){
  await evaluate('window.cellRetained=null;window.teiCleanup?.()');await send('HeapProfiler.collectGarbage',{},sessionId);
  const before=await send('Runtime.getHeapUsage',{},sessionId);
  const result=await evaluate(mode==='flint'?`teiFlintPerformance(${JSON.stringify(name)},${process.env.CELL_COMPACT==='1'})`:`cellInspection(${JSON.stringify(name)},${JSON.stringify(mode)})`);
  await send('HeapProfiler.collectGarbage',{},sessionId);const after=await send('Runtime.getHeapUsage',{},sessionId);
  if(mode==='flint'&&process.env.CELL_COMPACT==='1'){assert.equal(result.cellProbe.cells,0);assert.equal(result.canonicalCells,0);}else if(['small','large','anthology','extended'].includes(name))assert.equal(result.cellProbe.cells,(mode==='decode'||mode==='flint')?{small:3271,large:17283,anthology:58614,extended:120624}[name]*(mode==='flint'?2:1):0);
  if(mode==='flint'){assert.equal(result.pageCount,1);assert.equal(result.truncated,false);assert.equal(result.notifications,1);assert.equal(result.admissionSnapshots,0);assert.equal(result.typing.snapshots,0);assert(result.typing.restored);}
  results.push({...result,mode,run,heapBefore:before.usedSize,heapRetained:after.usedSize,retainedDelta:after.usedSize-before.usedSize});console.log(JSON.stringify(results.at(-1)));
  const out=process.env.CELL_OUTPUT??'artifacts/cell-materialisation';await mkdir(out,{recursive:true});await writeFile(out+'/'+(process.env.CELL_FLINT?'flint':'inspection')+'.json',JSON.stringify({browser:await send('Browser.getVersion'),results},null,2)+'\n');
 }
}finally{socket?.close();chrome.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
