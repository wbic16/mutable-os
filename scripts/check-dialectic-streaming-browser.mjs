// No inference, keys, server persistence or user Documents. Actual native UI.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
const directory=process.env.DCP_OUTPUT??'artifacts/dcp-streaming';await mkdir(directory,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'dcp-stream-proof-'));let server,browser,socket;
try{
 server=await createServer({cacheDir:'node_modules/.cache/dcp-stream-proof',server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-stream-proof',configureServer(s){s.middlewares.use((req,res,next)=>{
  if(req.url==='/__stream-proof'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/src/features/dialectic/streaming.browser.tsx"></script></body></html>');return;}
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:false,Error:'Isolated deterministic fixture'}));return;}next();
 });}}]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[...(process.env.DCP_HEADED==='1'?[]:['--headless=new']),'--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let data='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',chunk=>{data+=chunk;const m=data.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.once('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error(JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.httpServer.address().port+'/__stream-proof'},sessionId);
 await evaluate(`(async()=>{for(let i=0;i<1600;i++){if(window.proof?.ready)return;await new Promise(r=>setTimeout(r,20));}throw Error('Fixture startup timeout')})()`);
 if(process.env.RETRIEVAL_PRIORITY_URL)await evaluate(`(async()=>{const original=window.fetch.bind(window);window.fetch=(input,init)=>String(input).startsWith('/api/retrieval/')?original(${JSON.stringify(process.env.RETRIEVAL_PRIORITY_URL)}+String(input).slice('/api/retrieval'.length),init):original(input,init);const r=await import('/src/application/retrieval-client.ts');await r.retrievalRequest('status');})()`);
 await evaluate('proof.run().catch(e=>{proof.failure=String(e);console.error(e)});true');
 await evaluate(`(async()=>{for(let i=0;i<1200;i++){if(proof.failure)throw Error(proof.failure);if(proof.firstScreenshot)return;await new Promise(r=>setTimeout(r,20));}throw Error('No first fragment')})()`);
 await writeFile(path.join(directory,'first-fragment.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await evaluate('proof.continueScreenshot();true');
 await evaluate(`(async()=>{for(let i=0;i<1600;i++){if(proof.failure)throw Error(proof.failure);if(proof.result)return;await new Promise(r=>setTimeout(r,20));}throw Error('Fixture completion timeout')})()`);
 await send('Browser.grantPermissions',{origin:'http://127.0.0.1:'+server.httpServer.address().port,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 const selectCopy=async across=>evaluate(`(()=>{
  const {editor,port}=proof, view=port.session().projection;
  const row=proof.committed().find(n=>n.payload.metadata.dialectic.author==='ai'&&n.children.length===2);
  const first=view.node(row.children[0]),last=view.node(row.children[1]);
  const draft=proof.text(),dm=editor.mounts.get(draft.key);dm.focus();dm.restoreInlineSelection({anchor:0,head:0});
  editor.selections.setPrimary(draft.key,draft.contentKey,draft.viewId,0);
  const a=editor.mounts.get(first.key),b=editor.mounts.get(last.key);
  a.restoreInlineSelection({anchor:0,head:17});
  if(${across}){const sel=document.getSelection(),range=sel.getRangeAt(0).cloneRange();b.restoreInlineSelection({anchor:0,head:8});const end=sel.getRangeAt(0);range.setEnd(end.endContainer,end.endOffset);sel.removeAllRanges();sel.addRange(range);}
  return {selected:document.getSelection().toString(),revision:editor.repository.state.revision};
 })()`);
 const clipboard=[];
 for(const across of [false,true]){
  const selected=await selectCopy(across);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'c',code:'KeyC',modifiers:4,windowsVirtualKeyCode:67,commands:['copy']},sessionId);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'c',code:'KeyC',modifiers:4,windowsVirtualKeyCode:67},sessionId);
  const copied=await evaluate('navigator.clipboard.readText()');
  const revision=await evaluate('proof.editor.repository.state.revision');
  if(copied.replace(/\s+/g,' ').trim()!==selected.selected.replace(/\s+/g,' ').trim()||revision!==selected.revision)throw Error('Clipboard mismatch '+JSON.stringify({across,selected,copied,revision}));
  clipboard.push({across,copied,unchanged:true});
 }
 console.log(JSON.stringify({clipboard},null,2));
 const result={...await evaluate('proof.result'),clipboard};await writeFile(path.join(directory,'qualification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 await writeFile(path.join(directory,'committed.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
}finally{socket?.close();browser?.kill('SIGTERM');await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
