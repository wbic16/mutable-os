// Run against the production qualification build; isolated Chrome profile,
// in-memory documents, no document saves. Default origin: http://127.0.0.1:3108.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const origin=process.env.TEI_QUALIFICATION_URL??'http://127.0.0.1:3108';
const output=process.env.TEI_OUTPUT??'artifacts/tei-m5';
const profile=await mkdtemp(path.join(tmpdir(),'tei-m5-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-extensions','--enable-precise-memory-info','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;const checkpoints=[];let finishTrace;
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';chrome.stderr.on('data',chunk=>{output+=chunk;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const result=JSON.parse(e.data);if(result.method==='Runtime.exceptionThrown')console.error(JSON.stringify(result.params.exceptionDetails));if(result.method==='Tracing.tracingComplete')finishTrace?.(result.params.stream);if(result.method==='Runtime.consoleAPICalled'&&result.params.args[0]?.value==='TEI_STAGE'){checkpoints.push(JSON.parse(result.params.args[1].value));}const p=pending.get(result.id);if(p){pending.delete(result.id);clearTimeout(p.timer);result.error?p.reject(Error(JSON.stringify(result.error))):p.resolve(result.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>reject(Error('timeout '+method)),120000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params,...sessionId?{sessionId}:{}}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Runtime.enable',{},sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.navigate',{url:origin+'/scripts/tei-performance/index.html'},sessionId);await new Promise(r=>setTimeout(r,1000));

 await send('Page.bringToFront',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 for(let i=0;i<200;i++){if(await evaluate('typeof window.teiPerformance === "function"'))break;await new Promise(r=>setTimeout(r,100));}


 await send('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 const key=async letter=>{const args={key:letter,code:'Key'+letter.toUpperCase(),windowsVirtualKeyCode:letter.toUpperCase().charCodeAt(0),modifiers:4};await send('Input.dispatchKeyEvent',{type:'keyDown',...args,commands:[letter==='c'?'copy':letter==='x'?'cut':'paste']},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',...args},sessionId);};
 const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Condition timed out: '+expression+' '+JSON.stringify(await evaluate('interop.state()')));};
 const report={setup:await evaluate('inlineInteropSetup()')};console.log('Flint ready');
 const initial=await evaluate('interop.save()');
 await evaluate("interop.choose();interop.select('source',1,2);interop.reset()");await key('c');await wait("interop.state().message.startsWith('Copied')");
 assert.equal(await evaluate('navigator.clipboard.readText()'),'second');assert.equal(await evaluate('interop.save()'),initial);assert.equal((await evaluate('interop.state()')).commits,0);
 await evaluate("interop.select('source',0)");await key('v');await wait('interop.state().sourceSlots===3');
 let state=await evaluate('interop.state()');assert.equal(state.snapshots,0);assert.equal(state.saves,0);assert.equal(state.canonicalCells,0);assert.equal(state.unrelatedBuilds,0);assert.equal(state.unrelatedMutations,0);
 assert.equal(await evaluate('interop.editor.selections.sets[interop.node("source").key].items[0].head.boundary.index'),1);
 await evaluate('interop.editor.repository.undo()');assert.equal(await evaluate('interop.save()'),initial);await evaluate('interop.editor.repository.redo()');await evaluate('interop.editor.repository.undo()');
 await evaluate("interop.select('source',1,2);interop.reset()");await key('x');await wait('interop.state().sourceSlots===1');
 assert.equal((await evaluate('interop.state()')).snapshots,0);await evaluate('interop.editor.repository.undo()');assert.equal(await evaluate('interop.save()'),initial);
 // Several slots including a nested and empty reading cross the real OS clipboard.
 await evaluate("interop.select('source',0,5)");await key('c');await wait("interop.state().message.startsWith('Copied')");
 await evaluate('interop.open(interop.destination)');const beforeDestination=await evaluate('interop.save(interop.destination)');
 await evaluate("interop.select('destination',0,0,interop.destination);interop.reset()");await key('v');await wait('interop.state().destinationSlots===2');
 report.paste=await evaluate('interop.state()');assert.equal(report.paste.snapshots,0);assert.equal(report.paste.saves,0);assert.equal(report.paste.unrelatedMutations,0);assert.equal(report.paste.canonicalCells,0);
 const pasted=await evaluate('interop.save(interop.destination)');assert.match(pasted,/second/);assert.match(pasted,/nested/);assert.match(pasted,/inline-alternatives/);
 await evaluate('interop.editor.repository.undo()');assert.equal(await evaluate('interop.save(interop.destination)'),beforeDestination);await evaluate('interop.editor.repository.redo()');assert.equal(await evaluate('interop.save(interop.destination)'),pasted);
 report.manualSave=await evaluate('interop.manualSave()');assert.equal(report.manualSave.equal,true);assert.equal(report.manualSave.saves,1);assert.equal(report.manualSave.dirty,false);
 await evaluate('interop.editor.repository.undo()');
 report.performance=await evaluate('interop.profile()');
 await send('HeapProfiler.collectGarbage',{},sessionId);report.performance.retainedHeap=await evaluate('performance.memory.usedJSHeapSize');
 for(const sample of report.performance.samples){assert.equal(sample.work.snapshots,0);assert.equal(sample.work.canonicalCells,0);if(sample.name!=='cross-document')assert.equal(sample.work.unrelatedBuilds,0);}
 // Larger unrelated content must not change the affected record count.
 await evaluate('inlineInteropSetup(150)');report.large=await evaluate('interop.profile()');await send('HeapProfiler.collectGarbage',{},sessionId);report.large.retainedHeap=await evaluate('performance.memory.usedJSHeapSize');
 for(const [i,sample] of report.large.samples.entries()){assert.equal(sample.timings[0]['count.previousContents'],report.performance.samples[i].timings[0]['count.previousContents']);assert.equal(sample.work.snapshots,0);assert.equal(sample.work.unrelatedBuilds,0);assert.equal(sample.work.unrelatedMutations,0);assert.equal(sample.work.canonicalCells,0);}
 await mkdir(output,{recursive:true});await writeFile(path.join(output,'browser.json'),JSON.stringify(report,null,2));
 console.log('M5 real Flint/OS clipboard, complete native closures, cut, Undo/Redo, manual Save and structural profiles passed');
}finally{socket?.close();chrome.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
process.exit(0);
