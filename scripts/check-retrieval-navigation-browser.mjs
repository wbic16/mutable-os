// Automated Chrome navigation qualification using copies of real saved Documents
// and their SQL source mappings. Hosted retrieval is refused; native Open/reveal is real.
// No user files are modified. Build the server before running.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {openRetrievalStore} from '../src/retrieval/store.mjs';
import {createNativeDocumentStoreRouter} from '../dist/server/native-document-store.mjs';
import {createServer} from 'vite';
const artifacts='artifacts/retrieval-navigation';await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vaultRoot=await mkdtemp(path.join(tmpdir(),'vault-cache-browser-'));
await mkdir(path.join(vaultRoot,'.mutable'));await mkdir(path.join(vaultRoot,'notes'));
const documents={small:'documents/luca-landucci_diary/1495-09-20-[b2cc0ed7].ink',large:'documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink'};
for(const file of Object.values(documents)){await mkdir(path.dirname(path.join(vaultRoot,file)),{recursive:true});await writeFile(path.join(vaultRoot,file),await readFile(path.join('vaults/imported',file)));}
// Unrelated malformed content must not block exact verified result activation.
await writeFile(path.join(vaultRoot,'unrelated-invalid.ink'),'{}');
const db=new Database('vaults/imported/.mutable/mutable.db',{readonly:true,fileMustExist:true});
const vaultGuid=db.prepare("SELECT value FROM SchemaInfo WHERE key='vaultGuid'").get().value;
await db.backup(path.join(vaultRoot,'.mutable/mutable.db'));db.close();
const retrieval=openRetrievalStore({vault:vaultRoot,vaultGuid});
const api=express();api.use(express.json());
api.post('/api/retrieval/query',(req,res)=>{if(req.body.strategy!=='lexical')return res.status(409).json({Success:false,Error:'Local navigation qualification: no hosted calls'});res.json({Success:true,Data:retrieval.lexical(req.body.query,{limit:20,resourceId:'5de5c3e7-983d-4467-829e-46cbdbe52b53'})});});
api.post('/api/retrieval/verify',(req,res)=>res.json({Success:true,Data:{currency:'verified-saved-projection'}}));

api.use('/api/native',createNativeDocumentStoreRouter({root:vaultRoot,defaultVault:'.',establishVault:async()=>({vault:'.'}),nativeDiscoveryWorker:false}));
const vite=await createServer({plugins:[{
 name:'flint-integration-proof',
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){if(id==='\0flint-proof')return `
 import {nativeDocumentSession} from '/src/persistence/native-session.ts';
 import {render} from 'solid-js/web';
 import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:true,sqliteKnowledge:false,sqliteEntities:false,flintProbe:false,flintSceneChrome:true}});
 const editor=session.editor;
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host,native:nativeDocumentSession(editor)};
 `;},
 configureServer(server){server.middlewares.use((req,res,next)=>req.url.startsWith('/api/')?api(req,res,next):next());server.middlewares.use(async(req,res,next)=>{if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);chrome.once('exit',code=>reject(Error(`Chrome exited (${code}): ${out}`)));setTimeout(()=>reject(Error('Chrome timeout: '+out)),30000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown'){errors.push(m.params.exceptionDetails);console.log('Browser error',JSON.stringify(m.params.exceptionDetails));}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},120000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails){console.log('Browser exceptions',JSON.stringify(errors));throw Error(JSON.stringify(result.exceptionDetails));}return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1200;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await send('Page.bringToFront',{},sessionId);
 console.log("Waiting for Flint");
 await wait("window.proof && document.querySelector('.flint-application')");



 await wait(`document.body.innerText.includes('0/2 loaded')`);
 const results=[];for(const query of ['Prince Prospero','dominion']){
 const result=await evaluate(`(async()=>{
 const {editor}=proof;const wait=async f=>{for(let i=0;i<600;i++){if(f())return;await new Promise(r=>setTimeout(r,50));}throw Error('Navigation fixture timeout')};
 const node=[...editor.projections.values()].flatMap(v=>Object.values(v.state.nodes)).find(n=>n.viewType==='standoff-editor-block'&&editor.mounts.get(n.key)?.root.isConnected&&!editor.mounts.get(n.key).root.closest('[hidden],[inert]'));
 editor.mounts.get(node.key).focus();editor.mounts.get(node.key).restoreInlineSelection?.({anchor:0,head:0});
 await editor.commandRegistry.execute('autocomplete.search',{targetKey:node.key,args:undefined});
 await wait(()=>!!document.querySelector('.autocomplete-workstation input'));
 const input=document.querySelector('.autocomplete-workstation input');input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input',{bubbles:true}));
 await wait(()=>document.querySelectorAll('.autocomplete-results [role=option]').length>0);
 const s=editor.overlays.overlays.find(x=>x.viewType==='autocomplete').data.session;
 const first=s.state.rows[0],start=performance.now();let navigationError='';const navigate=s.host.navigatePassage;s.host.navigatePassage=async(...args)=>{try{return await navigate(...args);}catch(e){navigationError=String(e);throw e;}};const choose=s.choose.bind(s);let done;s.choose=(...args)=>done=choose(...args);document.querySelector('.autocomplete-results [role=option]').click();await done;
 const targetNodes=[...editor.projections.values()].flatMap(v=>Object.values(v.state.nodes)).filter(n=>n.payload.id===first.data.source.spans[0].blockGuid);
 const mounted=targetNodes.find(n=>editor.mounts.get(n.key)?.root.isConnected&&!editor.mounts.get(n.key).root.closest('[hidden],[inert]'));
 const rect=mounted&&editor.mounts.get(mounted.key).root.getBoundingClientRect();return {query:${JSON.stringify(query)},navigationError,error:s.state.error,phase:s.state.phase,alive:s.alive,opened:!!proof.native.location(first.data.source.resourceId),mountedTarget:!!mounted,visible:!!rect&&rect.bottom>0&&rect.top<innerHeight,selection:mounted?editor.mounts.get(mounted.key).captureInlineSelection?.():null,expected:JSON.parse(JSON.stringify(first.data.source.spans[0])),ms:performance.now()-start};
 })()`);
 results.push(result);console.log(JSON.stringify(result,null,2));await writeFile(path.join(artifacts,'result.json'),JSON.stringify({results,errors},null,2));
 await writeFile(path.join(artifacts,'navigation.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 assert.equal(result.error,'');assert.equal(result.opened,true);assert.equal(result.mountedTarget,true);assert.equal(result.navigationError,'');assert.equal(result.visible,true);assert.deepEqual(result.selection,{anchor:result.expected.start,head:result.expected.end});
 }
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});retrieval.close();await rm(vaultRoot,{recursive:true,force:true});}
