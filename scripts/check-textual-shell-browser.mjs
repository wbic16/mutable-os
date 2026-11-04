// Focused in-memory Textual shell check. No vault reads, writes or app-wide benchmark.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const profile=await mkdtemp(path.join(tmpdir(),'textual-shell-'));
let browser,socket,server;
try {
 server=await createServer({server:{port:0,strictPort:false},plugins:[{
  name:'textual-shell-check',resolveId(id){if(id==='/__textual-proof.js')return '\0textual-proof';},
  load(id){if(id==='\0textual-proof')return `
   import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
   import {WorkspaceSession} from '/src/application/workspace-session.ts';
   import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
   import {WorkspacePresentations} from '/src/demo/workspace-presentations.tsx';
   import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
   import '/src/index.css';import '/src/demo/workspace-demo.css';
   const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{id:'window',type:'document-window-block',metadata:{position:{x:20,y:80},size:{w:900,h:600}},children:[{id:'doc',type:'document-block',metadata:{documentId:'doc'},children:[{id:'text',type:'standoff-editor-block',text:'Retained editor text.'}]}]}]}),{features:{nativeDocumentPersistence:false,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
   const selector=document.body.appendChild(document.createElement('div'));selector.style.cssText='position:fixed;top:0;left:0;z-index:2147483646';
   render(()=>createComponent(WorkspacePresentations,{session}),selector);
   const host=document.body.appendChild(document.createElement('div'));host.className='workspace-demo';
   render(()=>createComponent(WorkspacePresentationView,{session}),host);session.editor.installGateway(document);
   window.proof={session,editor:session.editor,snapshots:0};const snapshot=session.editor.repository.snapshot.bind(session.editor.repository);session.editor.repository.snapshot=(...args)=>{proof.snapshots++;return snapshot(...args);};
  `;},configureServer(s){s.middlewares.use('/__textual-shell',(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/__textual-proof.js"></script></body></html>');});}
 }]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);browser.stderr.on('data',d=>{s+=d;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error('Browser exception:',JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},35000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1000;i++){if(${condition})return;await new Promise(r=>setTimeout(r,25));}throw Error('Condition timed out: '+${JSON.stringify(condition)})})()`);
 const click=async expression=>{const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 await send('Runtime.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__textual-shell`},sessionId);
 await wait('window.proof && document.querySelector(".reactive-standoff-flow")').catch(async e=>{console.error(await evaluate('document.body.innerText'));throw e;});
 await evaluate(`proof.flow=document.querySelector('.reactive-standoff-flow');proof.text=proof.flow.querySelector('[data-cell-key]')?.firstChild;proof.revision=proof.editor.repository.state.revision;proof.font=getComputedStyle(proof.flow).font;proof.windows=document.querySelector('.mwm-window-plane');`);
 await click(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Textual')`);
 await wait('document.querySelector(".textual-workspace")?.dataset.columns > 0');
 const initial=await evaluate(`({columns:+document.querySelector('.textual-workspace').dataset.columns,rows:+document.querySelector('.textual-workspace').dataset.rows,hidden:proof.windows.hidden,connected:proof.flow.isConnected,revision:proof.editor.repository.state.revision,snapshots:proof.snapshots})`);
 assert(initial.hidden&&initial.connected);assert.equal(initial.snapshots,0);assert.equal(initial.revision,await evaluate('proof.revision'));
 await click(`document.querySelector('.textual-workspace [aria-label="Zoom in"]')`);
 await wait(`+document.querySelector('.textual-workspace').dataset.columns < ${initial.columns}`);
 const zoomed=await evaluate(`({columns:+document.querySelector('.textual-workspace').dataset.columns,rows:+document.querySelector('.textual-workspace').dataset.rows})`);
 await send('Emulation.setDeviceMetricsOverride',{width:480,height:320,deviceScaleFactor:1,mobile:false},sessionId);
 await wait(`+document.querySelector('.textual-workspace').dataset.columns < 80`);
 await click(`document.querySelector('.textual-workspace [aria-haspopup]')`);
 await wait('document.querySelector(".tw-popup")');
 await click(`[...document.querySelectorAll('.tw-popup button')].find(e=>e.textContent==='Return to Desktop')`);
 await wait('!document.querySelector(".textual-workspace")');
 assert(await evaluate(`proof.flow.isConnected && document.querySelector('.reactive-standoff-flow')===proof.flow && getComputedStyle(proof.flow).font===proof.font && !proof.windows.hidden`));
 assert.equal(await evaluate('proof.snapshots'),0);
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false},sessionId);
 await evaluate(`const n=Object.values(proof.session.projection.state.nodes).find(n=>n.payload.id==='text');proof.editor.focus.request(n.key);proof.editor.mounts.get(n.key).restoreInlineSelection({anchor:0,head:0});`);
 await send('Input.insertText',{text:'Z'},sessionId);await wait(`proof.flow.textContent.includes('ZRetained')`);
 const result={initial,zoomed,retainedEditor:true,restoredGraphicalFont:true,narrowMenuReturn:true,trustedTypingAfterReturn:true,snapshots:await evaluate('proof.snapshots')};
 await writeFile('/tmp/textual-shell-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
} catch(error) { console.error(error);process.exitCode=1; } finally {socket?.close();browser?.kill();server?.httpServer?.closeAllConnections();await Promise.race([server?.close(),new Promise(resolve=>setTimeout(resolve,1500))]);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
