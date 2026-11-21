// Isolated Chrome profile; trusted input, in-memory manual Save, no user-file writes.
// TEI_QUALIFICATION_URL defaults to http://127.0.0.1:3108. Writes only QA evidence.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const origin=process.env.TEI_QUALIFICATION_URL??'http://127.0.0.1:3108';
const profile=await mkdtemp(path.join(tmpdir(),'tei-smoke-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';chrome.stderr.on('data',chunk=>{output+=chunk;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const result=JSON.parse(e.data),p=pending.get(result.id);if(p){pending.delete(result.id);clearTimeout(p.timer);result.error?p.reject(Error(JSON.stringify(result.error))):p.resolve(result.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>reject(Error('timeout '+method)),120000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params,...sessionId?{sessionId}:{}}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.navigate',{url:origin+'/scripts/tei-performance/index.html'},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 for(let i=0;i<200;i++){if(await evaluate('typeof window.teiOperationalSetup === "function"'))break;await new Promise(r=>setTimeout(r,100));}
 await send('Runtime.enable',{},sessionId);await send('Runtime.addBinding',{name:'teiClick'},sessionId);
 socket.addEventListener('message',async e=>{const event=JSON.parse(e.data);if(event.method!=='Runtime.bindingCalled'||event.params.name!=='teiClick')return;
  const {x,y}=JSON.parse(event.params.payload);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1},sessionId);
  await send('Runtime.evaluate',{expression:'window.teiClickDone()'},sessionId);
 });
 await evaluate('window.teiTrustedClick=(x,y)=>new Promise(resolve=>{window.teiClickDone=resolve;window.teiClick(JSON.stringify({x,y}));})');
 const results=[];
 for(const compact of [true,false]){
  await evaluate(`window.teiOperationalSetup(${compact})`);
  await send('Input.insertText',{text:'X'},sessionId);
  const result=await evaluate('window.teiOperationalFinish()');
  console.log(JSON.stringify(result));
  for(const key of ['definitionPopup','mentionVisibleInPane','definitionVisible','mentionVisible','navigationUnchanged','inserted','undone','redone','unchangedInventories','reloadEqual','sourceDetails'])assert.equal(result[key],true,key);
  assert.equal(result.relationships,1);assert.equal(result.points.length,4);assert.equal(result.typingSnapshots,0);assert.equal(result.savePhase,'saved');
  assert(result.points.every(p=>p.visible&&p.selection&&p.selection.anchor===p.selection.head));
  if(compact)assert.equal(result.canonicalCells,0);
  results.push(result);
  await send('Page.captureScreenshot',{format:'png'},sessionId).then(async r=>{await mkdir('artifacts/tei-m3',{recursive:true});await writeFile(`artifacts/tei-m3/operational-${compact?'compact':'legacy'}.png`,Buffer.from(r.data,'base64'));});
 }
 await mkdir('artifacts/tei-m3',{recursive:true});await writeFile('artifacts/tei-m3/operational-browser.json',JSON.stringify({browser:await send('Browser.getVersion'),results},null,2)+'\n');
}finally{socket?.close();chrome.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
