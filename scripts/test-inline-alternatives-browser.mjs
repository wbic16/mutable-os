// Run against the production qualification build; isolated Chrome profile,
// in-memory documents, no document saves. Default origin: http://127.0.0.1:3108.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const origin=process.env.TEI_QUALIFICATION_URL??'http://127.0.0.1:3107';
const profile=await mkdtemp(path.join(tmpdir(),'tei-smoke-'));
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

 const report = { setup: await evaluate('window.inlineAlternativesSetup()') };
 console.log(JSON.stringify(report.setup));
 const initial = await evaluate('inlineTest.save()');
 report.switchMs = await evaluate('inlineTest.switchReading(0, 1)');
 let state = await evaluate('inlineTest.state()');
 assert.match(state.readings[0], /^longer /); assert.match(state.readings[1], /^first /);
 assert.equal(state.dirty,false); assert.equal(state.saves,0); assert.equal(state.commits, 0); assert.equal(state.snapshots, 0); assert.equal(await evaluate('inlineTest.save()'), initial);
 await evaluate("inlineTest.focus('reading', 0)");
 await send('Input.insertText', {text:'X'}, sessionId); await evaluate('inlineTest.frame()');
 state=await evaluate('inlineTest.state()'); assert.match(state.readings[0], /^Xlonger /); assert.match(state.readings[1], /^first /); assert.equal(state.commits,1);assert.equal(state.dirty,true);
 await evaluate('inlineTest.editor.repository.undo()'); assert.equal(await evaluate('inlineTest.save()'),initial);
 await evaluate('inlineTest.editor.repository.redo()'); assert.match((await evaluate('inlineTest.state()')).readings[0],/^X/);
 await evaluate('inlineTest.editor.repository.undo()');
 // Edit through the second occurrence while the first displays another reading.
 await evaluate("inlineTest.focus('reading',0,1)");await send('Input.insertText',{text:'Y'},sessionId);await evaluate('inlineTest.frame()');
 assert.match((await evaluate('inlineTest.state()')).readings[1],/^Yfirst/);assert.match((await evaluate('inlineTest.state()')).readings[0],/^longer/);await evaluate('inlineTest.editor.repository.undo()');
 await evaluate("inlineTest.focus('empty',0)"); await send('Input.insertText',{text:'empty edited'},sessionId); await evaluate('inlineTest.frame()');
 assert.match(await evaluate("inlineTest.editor.mounts.get(inlineTest.selected(0,1).key).captureText()"),/empty edited/);
 await evaluate('inlineTest.editor.repository.undo()');
 await evaluate('inlineTest.switchReading(0,0)'); await evaluate("inlineTest.focus('host',7)");
 const key=async (key,code,windowsVirtualKeyCode,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,modifiers},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode,modifiers},sessionId);await evaluate('inlineTest.frame()');};
 await key('ArrowRight','ArrowRight',39); assert.equal((await evaluate('inlineTest.state()')).active,await evaluate('inlineTest.selected().key'));
 await key('ArrowLeft','ArrowLeft',37); assert.equal((await evaluate('inlineTest.state()')).active,await evaluate('inlineTest.hostNode().key'));
 assert.equal((await evaluate('inlineTest.state()')).selection.head,7);
 // Nested reading uses the same input and boundary navigation.
 const innerKey=await evaluate(`(()=>{const t=inlineTest,n=t.selected(0,2),c=t.editor.repository.readState().contents[n.contentKey],a=c.compactInline.spans.find(a=>a.kind==='alternative'),key=n.ownedRelations[a.properties.readings[0]],m=t.editor.mounts.get(key);m.focus();m.restoreInlineSelection({anchor:0,head:0});return key})()`);
 await send('Input.insertText',{text:'N'},sessionId);await evaluate('inlineTest.frame()');assert.equal(await evaluate(`inlineTest.editor.mounts.get(${JSON.stringify(innerKey)}).captureText()`),'Nbad');await evaluate('inlineTest.editor.repository.undo()');
 await evaluate("inlineTest.focus('nested',7)");await key('ArrowRight','ArrowRight',39);assert.equal((await evaluate('inlineTest.state()')).active,innerKey);await key('ArrowLeft','ArrowLeft',37);assert.equal((await evaluate('inlineTest.state()')).active,await evaluate('inlineTest.selected(0,2).key'));
 // Real Chrome IME provisional DOM is cancelled before changing the mounted reading.
 await evaluate("inlineTest.focus('reading',0)"); const beforeIme=await evaluate('inlineTest.save()');
 await send('Input.imeSetComposition',{text:'仮',selectionStart:1,selectionEnd:1},sessionId);
 await evaluate('inlineTest.switchReading(0,1)'); assert.equal(await evaluate('inlineTest.save()'),beforeIme);
 await send('Input.insertText',{text:''},sessionId); assert.equal(await evaluate('inlineTest.save()'),beforeIme);
 await evaluate('inlineTest.switchReading(0,0)');

 // Grapheme deletion remains the existing input path in a reading.
 await evaluate("inlineTest.focus('reading',9)"); await key('Backspace','Backspace',8);
 assert.equal((await evaluate('inlineTest.state()')).readings[0], 'first 😀');
 await evaluate('inlineTest.editor.repository.undo()');
 // A native selection crossing the reading/host boundary becomes a whole slot selection.
 await evaluate(`(()=>{const t=inlineTest, h=t.editor.mounts.get(t.hostNode().key),r=t.editor.mounts.get(t.selected().key),a=h.inlineBoundary(3),b=r.inlineBoundary(2);document.getSelection().setBaseAndExtent(a.node,a.offset,b.node,b.offset)})()`);
 await evaluate('inlineTest.frame()');
 assert.deepEqual((await evaluate('inlineTest.state()')).selection,{anchor:3,head:8});
 const beforeReplace=await evaluate('inlineTest.save()');await send('Input.insertText',{text:'replacement'},sessionId);await evaluate('inlineTest.frame()');
 assert.equal((await evaluate('inlineTest.state()')).hostText,'Befreplacement middle \ufffc\ufffc after.');
 await evaluate('inlineTest.editor.repository.undo()');assert.equal(await evaluate('inlineTest.save()'),beforeReplace);
 // Host Enter transfers the slot closure; Undo restores its complete native bytes.
 const beforeSplit=await evaluate('inlineTest.save()');await evaluate("inlineTest.focus('host',7)");await key('Enter','Enter',13);
 assert.equal(await evaluate('inlineTest.editor.mounts.get(inlineTest.hostNode().key).captureText()'),'Before ');await evaluate('inlineTest.editor.repository.undo()');assert.equal(await evaluate('inlineTest.save()'),beforeSplit);
 // The M3 navigator reveals a point in an inactive reading and selects its live offset.
 const beforeNavigation=await evaluate('inlineTest.save()');const navigated=await evaluate('inlineTest.navigateAnnotation(inlineTest.milestones,inlineTest.milestones.rows[0]()[0].occurrences()[0])');
 assert.equal(navigated,true);assert.match((await evaluate('inlineTest.state()')).readings[0],/^longer /);assert.equal(await evaluate('inlineTest.save()'),beforeNavigation);
 // Local SVG annotations reuse the existing range owner across wrapping.
 await evaluate(`(()=>{const t=inlineTest,n=t.selected(),c=t.editor.repository.readState().contents[n.contentKey];t.editor.commands.setPayloadField(n.key,'standoffProperties',[...c.payload.standoffProperties,{id:'local-underline',type:'style/highlighter',start:0,end:42}]);})()`);await evaluate('(async()=>{for(let i=0;i<6;i++)await inlineTest.frame()})()');
 assert.equal(await evaluate("inlineTest.views[0].el.querySelectorAll('[data-property-type=\"style/highlighter\"]').length>0"),true);
 const wrappedShot=await send('Page.captureScreenshot',{format:'png'},sessionId);await mkdir('artifacts/tei-m4',{recursive:true});await writeFile('artifacts/tei-m4/wrapped-annotation.png',Buffer.from(wrappedShot.data,'base64'));
 await evaluate('inlineTest.editor.repository.undo()');
 await evaluate('inlineTest.switchReading(0,0)');
 report.final=await evaluate('inlineTest.state()'); assert.equal(report.final.canonicalCells,0); report.structuralSnapshots=report.final.snapshots;
 report.manualSave=await evaluate('inlineTest.manualSave()'); assert.equal(report.manualSave.equal,true); assert.equal(report.manualSave.dirty,false);assert.equal(report.manualSave.filename,'inline-alternatives.ink');
 const shot=await send('Page.captureScreenshot',{format:'png'},sessionId); await mkdir('artifacts/tei-m4',{recursive:true}); await writeFile('artifacts/tei-m4/inline.png',Buffer.from(shot.data,'base64'));
 report.performance=[];
 for(const mode of (process.env.INLINE_FUNCTIONAL_ONLY ? [] : ['single','combined','long'])) { await evaluate('inlineTest.cleanup()'); await send('HeapProfiler.collectGarbage',{},sessionId); const measured=await evaluate(`inlineAlternativesProfile(${JSON.stringify(mode)})`); await send('HeapProfiler.collectGarbage',{},sessionId); measured.retainedHeapBytes=await evaluate('performance.memory.usedJSHeapSize'); report.performance.push(measured); }
 await writeFile(`artifacts/tei-m4/${process.env.INLINE_FUNCTIONAL_ONLY?'inline-functional':'inline-browser'}.json`,JSON.stringify(report,null,2));
 console.log('Native inline alternatives: real Chrome input, two-view switching, empty input, Undo/Redo, boundary navigation, IME cancellation passed');
}finally{await mkdir('artifacts/tei-performance',{recursive:true});await writeFile(`artifacts/tei-performance/${process.env.TEI_LABEL??'run'}-stages.json`,JSON.stringify(checkpoints,null,2)+'\n');socket?.close();chrome.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
process.exit(0);
