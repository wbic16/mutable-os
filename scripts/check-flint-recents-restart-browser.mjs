// Desktop Recent history across a browser restart, using a temporary Vault.
// Run: node scripts/check-flint-recents-restart-browser.mjs
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import express from 'express';
const api=express();
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const store=await mkdtemp(path.join(tmpdir(),'recent-vault-'));await mkdir(path.join(store,'vault'));
const source=JSON.stringify({id:'restart-doc',type:'document-block',metadata:{documentId:'restart-doc',title:'Restart document'},children:[{id:'restart-text',type:'standoff-editor-block',text:'Saved source text'}]});
await writeFile(path.join(store,'vault','recent.json'),source);
const vite=await createServer({cacheDir:path.join(profile,'vite-cache'),plugins:[{
 name:'flint-integration-proof',
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){if(id==='\0flint-proof')return `
 import {render} from 'solid-js/web';
 import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:(location.search?[]:[0,1,2]).map(i=>({type:'document-block',id:'recent-'+i,metadata:{documentId:'recent-'+i,title:'Recent '+i},children:[{type:'standoff-editor-block',id:'text-'+i,text:'Text '+i}]}))}]}),{features:{nativeDocumentPersistence:true,sqliteKnowledge:false,sqliteEntities:false,nativeKnowledge:false,flintProbe:false,flintLogo:false}});
 const editor=session.editor;editor.setAssetContext(()=>({cavernId:'recent-test'}));
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host};
 `;},
 configureServer(server){server.middlewares.use(api);server.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/__flint-integration'))return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});
const {createNativeDocumentStoreRouter}=await vite.ssrLoadModule('/server/native-document-store.mjs');api.use('/api/native',createNativeDocumentStoreRouter({root:store,defaultVault:'vault',nativeDiscoveryWorker:false}));
await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout: '+out)),60000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},90000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1200;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 const check=(name,value)=>{assert.ok(value,name);console.log('Passed: '+name);checks.push(name);};const checks=[];
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");

 const click=async selector=>{
   const {x,y}=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing button');e.scrollIntoView();const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1},sessionId);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1},sessionId);
 };

 const connect=()=>evaluate(`(async()=>{proof.app=(await import('/src/application/document-application-ports.ts')).documentApplicationPorts(proof.editor).ports()[0].application;await proof.app.vault.open('vault');})()`);
 await connect();
 await evaluate(`proof.app.vault.openCandidate({folder:'vault',filename:'recent.json'})`);
 await wait(`document.querySelector('[role=tab][aria-selected=true]')?.textContent==='Restart document'`);
 check('opens an existing-format document from the file browser capability',true);
 check('recent history persists its identity and location',await evaluate(`JSON.parse(localStorage.getItem('mutable.flint.recent-documents.v1:recent-test')).some(d=>d.id==='restart-doc'&&d.location.filename==='recent.json')`));
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration?empty=1`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await connect();
 await evaluate(`[...document.querySelectorAll('.flint-segments button')].find(b=>b.textContent==='Recent').click()`);
 await click('[aria-label="Reopen Restart document"]');
 await wait(`document.querySelector('[role=tab][aria-selected=true]')?.textContent==='Restart document'`);
 check('real Desktop mouse click reopens persisted Recent after a fresh page load',await evaluate(`document.querySelector('[role=tabpanel]:not([hidden]) .reactive-standoff-flow')?.textContent==='Saved source text'`));
 check('the source file is unchanged',await readFile(path.join(store,'vault','recent.json'),'utf8')===source);
 check('no uncaught browser errors',errors.length===0);
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(store,{recursive:true,force:true});}
