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
const output=process.env.COMPACT_OUTPUT??'artifacts/compact-canonical';await mkdir(output,{recursive:true});
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
 const checks=[];
 const record=(name,value)=>{assert(value,name);checks.push({name,passed:true});};
 await evaluate('compactBrowserFixture()');
 await evaluate('poc.first=[...poc.editor.occurrences.keys()][0];poc.third=[...poc.editor.occurrences.keys()][2];poc.oldKey=poc.editor.occurrences.get(poc.first).cells[0].key;poc.editor.focusAt(poc.first,2)');
 await call('Input.insertText',{text:'Ω'});await frame();
 record('Trusted typing uses production InputGateway and updates both live occurrences',await evaluate(`(()=>{const a=[...poc.editor.occurrences.values()];return a[0].flow.textContent===a[1].flow.textContent&&a[0].cells[2].text==='Ω'&&a[0].cells[0].key===poc.oldKey&&poc.model.get('a').inline[0].text.includes('Ω')})()`));
 record('Caret after code-point insertion',await evaluate(`poc.editor.mounts.get(poc.first).captureInlineSelection().head===3`));
 await evaluate(`poc.model.replace('a',0,0,[{kind:'text',text:'E'}])`);await frame();
 record('External edit restores active caret and shared text immediately',await evaluate(`poc.editor.mounts.get(poc.first).captureInlineSelection().head===4 && [...poc.editor.occurrences.values()][0].flow.textContent===[...poc.editor.occurrences.values()][1].flow.textContent`));
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:4});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:4});await frame();
 record('Native undo shortcut reaches canonical experimental history',await evaluate(`!poc.model.get('a').inline[0].text.startsWith('E')`));
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:12});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:12});await frame();
 record('Native redo shortcut restores committed text',await evaluate(`poc.model.get('a').inline[0].text.startsWith('E')`));
 await evaluate(`poc.editor.focusAt(poc.third,3);poc.imeBefore=poc.model.get('b').inline[0].text;poc.imeRevision=poc.model.revision`);
 await call('Input.imeSetComposition',{text:'漢',selectionStart:1,selectionEnd:1});await frame();
 record('Browser composition remains provisional until commit',await evaluate(`poc.model.get('b').inline[0].text===poc.imeBefore&&poc.model.revision===poc.imeRevision`));
 await call('Input.insertText',{text:'漢'});await frame();
 record('Browser IME commit updates canonical text once',await evaluate(`poc.model.get('b').inline[0].text==='Sec漢ond text.'&&poc.model.revision===poc.imeRevision+1`));
 record('IME DOM matches canonical text after reconciliation',await evaluate(`poc.editor.occurrences.get(poc.third).flow.textContent===poc.model.get('b').inline[0].text`));
 await evaluate(`poc.editor.focusAt(poc.third,1);poc.provisionalBefore=poc.model.capture();poc.editor.provisional(poc.third,'draft',false)`);
 record('Existing ProvisionalCells cancel leaves canonical semantics intact',await evaluate(`poc.model.capture()===poc.provisionalBefore`));
 await evaluate(`poc.editor.provisional(poc.third,'draft',true)`);
 record('Existing ProvisionalCells commit reaches canonical authority immediately',await evaluate(`poc.model.get('b').inline[0].text.startsWith('Sdraft')`));
 record('Existing geometry cache reuses the same occurrence/revision',await evaluate(`(()=>{const e=poc.editor,m=e.measurements,h=e.mounts.get(poc.third),r=h.root.getBoundingClientRect(),v=poc.model.version('b');m.retainedRangeRects(poc.third,0,2,v,r,1,123);m.retainedRangeRects(poc.third,0,2,v,r,1,123);return m.rangeDiagnostics.reads===1&&m.rangeDiagnostics.hits===1})()`));
 await evaluate(`poc.model.annotations('a',[...poc.model.get('a').properties.standoffProperties,{type:'text/background-colour',value:'#00ff00',start:8,end:10}])`);
 record('Annotation editing updates both live occurrences',await evaluate(`[...poc.editor.occurrences.values()].filter(o=>o.id==='a').every(o=>getComputedStyle(o.flow.querySelector('[data-inline-index="9"]')).backgroundColor==='rgb(0, 255, 0)')`));
 const nativeBefore=await evaluate('poc.model.capture()');await evaluate('compactReadonlyFixture()');
 record('Read-only rendering creates no character spans',await evaluate(`poc.host.querySelectorAll('[data-inline-key]').length===0`));
 record('Read-only inline image has native alternative text',await evaluate(`poc.host.querySelector('img').alt==='blue square'`));
 record('Read-only CSS reflects overlapping rich styles',await evaluate(`(()=>{const spans=[...poc.host.querySelectorAll('[data-block="a"] span')];return spans.some(s=>getComputedStyle(s).fontWeight==='600'&&getComputedStyle(s).fontStyle==='italic')&&spans.some(s=>getComputedStyle(s).color==='rgb(192, 0, 0)')})()`));
 record('Read-only display preserves full canonical capture',await evaluate('poc.model.capture()')===nativeBefore);
 const screenshot=await call('Page.captureScreenshot',{format:'png'});await writeFile(output+'/readonly.png',Buffer.from(screenshot.data,'base64'));
 record('No browser exceptions during qualified editing routes',errors.length===0);
 await evaluate('compactBrowserFixture();poc.first=[...poc.editor.occurrences.keys()][0];poc.editor.focusAt(poc.first,4)');
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await frame();
 record('Trusted Backspace removes a combining grapheme without consuming the inline image',await evaluate(`poc.model.get('a').inline[0].text==='A😀漢 '&&poc.model.get('a').inline[1].kind==='image'`));
 const limitations={};
 await evaluate('compactBrowserFixture();poc.first=[...poc.editor.occurrences.keys()][0];poc.editor.focusAt(poc.first,1);poc.beforeIme=poc.model.capture()');
 await call('Input.imeSetComposition',{text:'字',selectionStart:1,selectionEnd:1});await call('Input.insertText',{text:'字'});await frame();
 limitations.mixedObjectIme=await evaluate(`({canonicalUnchanged:poc.model.capture()===poc.beforeIme,domContainsCommittedInput:poc.editor.occurrences.get(poc.first).flow.textContent.includes('字')})`);
 await evaluate(`compactBrowserFixture();poc.third=[...poc.editor.occurrences.keys()][2];poc.editor.focusAt(poc.third,1);poc.editor.mounts.get(poc.third).restoreInlineSelection({anchor:1,head:4})`);
 await call('Input.insertText',{text:'X'});await frame();await evaluate('poc.model.undo()');await frame();
 limitations.undoRangeSelection=await evaluate('poc.editor.mounts.get(poc.third).captureInlineSelection()');
 const metadata={limitations,nativeFixture:{path:nativePath,bytes:nativeFixture.length,sha256:createHash('sha256').update(nativeFixture).digest('hex')},browser:await send('Browser.getVersion'),system:{platform:platform(),release:release(),cpu:cpus()[0].model,logicalCpus:cpus().length},checks};
 await writeFile(output+'/browser-checks.json',JSON.stringify(metadata,null,2)+'\n');console.log('BROWSER CHECKS',checks.length);
 if(process.env.COMPACT_CHECKS_ONLY)process.exitCode=0;
 else{
 const results=[];const metrics=async()=>Object.fromEntries((await call('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 await evaluate(`compactSetup('small')`);await evaluate(`compactStage('admit','compact')`);await evaluate(`compactStage('readonly','compact')`);
 for(let run=0;run<Number(process.env.COMPACT_RUNS??3);run++)for(const name of (process.env.COMPACT_CASES?.split(',')??['small','large','anthology','extended','populated','native']))for(const mode of (run%2?['cells','compact']:['compact','cells'])){
  await evaluate(name==='native'?`compactSetupNative(${JSON.stringify(nativeFixture.toString('base64'))})`:`compactSetup(${JSON.stringify(name)})`);await frame();await call('HeapProfiler.collectGarbage');const initial=await call('Runtime.getHeapUsage');const stages=[];
  for(const stage of ['admit',...(mode==='compact'?['readonly','dispose']:[]),'activate','type','history','capture','dispose','reactivate','dispose']){
   await call('HeapProfiler.collectGarbage');const before=await call('Runtime.getHeapUsage'),mb=await metrics();
   const value=await evaluate(`compactStage(${JSON.stringify(stage)},${JSON.stringify(mode)})`),ma=await metrics();
   await call('HeapProfiler.collectGarbage');const after=await call('Runtime.getHeapUsage');
   if(stage==='admit'){assert.equal(value.atomsConstructed,mode==='compact'?0:value.textPositions);assert.equal(value.canonicalCells,mode==='compact'?0:value.textPositions);}
   if(stage==='readonly')assert.equal(value.allocations.editingCells,0);
   if(stage==='type')assert(value.restored,'typing failed to restore '+name+' '+mode);
   stages.push({...value,heapBefore:before,heapAfterGC:after,heapRetainedDelta:after.usedSize-initial.usedSize,performance:Object.fromEntries(['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration','LayoutCount','RecalcStyleCount'].map(k=>[k,(ma[k]??0)-(mb[k]??0)]))});
  }
  results.push({run,name,mode,initialHeap:initial,stages});console.log(JSON.stringify({run,name,mode,admissionMs:stages[0].admissionMs,activationMs:stages.find(s=>s.stage==='activate').frameInclusiveMs}));
  await writeFile(output+'/performance.json',JSON.stringify({...metadata,results},null,2)+'\n');
 }
 }
}finally{socket?.close();chrome.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
