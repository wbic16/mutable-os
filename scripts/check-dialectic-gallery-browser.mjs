// Real Media gallery qualification with local fixture images and an isolated server.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
const directory=process.env.GALLERY_OUTPUT??'/tmp/dialectic-media-gallery';await mkdir(directory,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'dcp-stream-proof-'));let server,browser,socket;
try{
 server=await createServer({cacheDir:'node_modules/.cache/dcp-stream-proof',server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-stream-proof',configureServer(s){s.middlewares.use((req,res,next)=>{
  if(req.url==='/__stream-proof'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body></body></html>');return;}
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

 const fixture=await evaluate("(async()=>{const m=await import('/src/features/dialectic/media-gallery.browser-fixture.tsx');return m.mediaGalleryFixture();})()");
 const wait=()=>evaluate("new Promise(r=>setTimeout(r,150))");
 const loaded=await evaluate("(async()=>{for(let i=0;i<100;i++){const imgs=[...document.querySelectorAll('.media-gallery-picture img')];if(imgs.length===5&&imgs.every(i=>i.complete&&i.naturalWidth))return true;await new Promise(r=>setTimeout(r,100));}return [...document.querySelectorAll('.media-gallery-picture img')].map(i=>({src:i.src,width:i.naturalWidth}));})()");
 assert.equal(loaded,true,'all native fetched images appear');
 const gallery=await evaluate("(()=>{const g=document.querySelector('.media-gallery-grid'),frames=[...document.querySelectorAll('.media-gallery-frame')];return {columns:getComputedStyle(g).gridTemplateColumns.split(' ').length,frames:frames.map(f=>{const r=f.getBoundingClientRect();return {w:r.width,h:r.height}})};})()");
 assert.ok(gallery.columns>=3);for(const frame of gallery.frames)assert.ok(Math.abs(frame.w/frame.h-4/3)<.02,'consistent tile aspect ratio');
 await writeFile(path.join(directory,'gallery-desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await evaluate("document.querySelector('.media-gallery-picture').click()");await wait();assert.equal(await evaluate("!!document.querySelector('.media-gallery-dialog[open] img')"),true);
 await writeFile(path.join(directory,'gallery-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await wait();assert.equal(await evaluate("!!document.querySelector('.media-gallery-dialog')"),false);
 await evaluate("document.querySelector('.media-gallery-caption button').click()");await wait();assert.equal(await evaluate("document.querySelector('.conversation-subtabs [aria-current]')?.textContent"),'Conversation');
 await evaluate("window.semanticsFixture.tab('Media').click()");await wait();
 await send('Emulation.setDeviceMetricsOverride',{width:760,height:950,deviceScaleFactor:1,mobile:false},sessionId);await wait();
 const narrow=await evaluate("(()=>{const g=document.querySelector('.media-gallery'),p=g.closest('.conversation-workspace-panel');return {width:g.getBoundingClientRect().width,overflow:g.scrollWidth-g.clientWidth,columns:getComputedStyle(document.querySelector('.media-gallery-grid')).gridTemplateColumns.split(' ').length};})()");assert.ok(narrow.columns<gallery.columns);assert.ok(narrow.overflow<2);
 await writeFile(path.join(directory,'gallery-narrow.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 assert.equal(await evaluate('window.semanticsFixture.editor.repository.state.revision'),fixture.revision,'gallery controls do not change the Document');
 console.log(JSON.stringify({loaded,gallery,narrow,preview:true,escape:true,sourceNavigation:true,unchangedDocument:true,directory},null,2));
}finally{socket?.close();browser?.kill('SIGTERM');await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
