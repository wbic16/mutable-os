// Focused trusted-input qualification. Save transport is isolated in memory.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const profile=await mkdtemp(path.join(tmpdir(),'dialectic-'));let browser,socket,server,saved,releaseSave;
const firstSavePending=new Promise(resolve=>releaseSave=resolve);
const report={};const saves=[];
try{
 server=await createServer({server:{host:"127.0.0.1",port:0,strictPort:false},plugins:[{name:'dialectic-proof',resolveId:id=>id==='/__dialectic.js'?'\0dialectic-proof':undefined,load(id){if(id!=='\0dialectic-proof')return;return `
 import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {WorkspacePresentations} from '/src/demo/workspace-presentations.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import {documentApplicationPorts} from '/src/application/document-application-ports.ts';
 import {nativeDocumentSession} from '/src/persistence/native-session.ts';
 import {captureNative,nativeBytes,decodeNative,admitNative} from '/src/persistence/native-resource.ts';
 import '/src/index.css';import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{dialecticConversationUpdates:true,dialecticAutosave:true,dialecticProviders:false,dialecticDcp:false,dcpTestPhaseLogging:false,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}}),editor=session.editor,native=nativeDocumentSession(editor);
 native.defaultVault=async()=>'isolated';native.establishVault=async()=>({vault:'isolated'});native.list=async()=>[];
 native.browseVault=native.discoverVault=async()=>({vault:'isolated',folders:['isolated'],documents:[],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true});
 let restoredId;if(location.search.includes('reload')){const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});const bytes=new Uint8Array(await(await fetch('/__saved')).arrayBuffer());restoredId=decodeNative(bytes).resourceId;admitNative(editor.repository,bytes,editor.repository.readState().placements[bank].contentKey);}
 await editor.commandRegistry.execute('dialectic.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const selector=document.body.appendChild(document.createElement('div'));selector.style.cssText='position:fixed;top:0;left:0;z-index:2147483646';render(()=>createComponent(WorkspacePresentations,{session}),selector);
 const host=document.body.appendChild(document.createElement('div'));host.className='workspace-demo';render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 const port=()=>documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic');
 if(restoredId)port().application.openDocument(restoredId);
 window.proof={session,editor,native,port,captureNative,nativeBytes,decodeNative,snapshots:0,rebuilds:0,creates:0};
 proof.root=()=>port().session().projection.node(port().session().rootKey);proof.rows=()=>proof.root().children.map(k=>port().session().projection.node(k)).filter(n=>n.payload.metadata?.dialectic?.kind==='contribution');proof.committed=()=>proof.rows().filter(n=>n.payload.metadata.dialectic.state==='committed');
 proof.draft=()=>proof.rows().find(n=>n.payload.metadata.dialectic.state==='draft');proof.text=()=>port().session().projection.node(proof.draft().children[0]);
 const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=(...a)=>{proof.snapshots++;return snapshot(...a)};
 const create=editor.createView.bind(editor);editor.createView=(...a)=>{proof.creates++;return create(...a)};
 for(const p of editor.projections.values()){const build=p.build.bind(p);p.build=(...a)=>{proof.rebuilds++;return build(...a)}}
 const timer=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>timer(fn,ms===80?1500:ms,...args);
 `;},configureServer(s){s.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/__dialectic')&&!req.url.startsWith('/__dialectic.js')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/__dialectic.js"></script></body></html>');return;}
  if(req.url==='/__saved'){res.end(saved.generation.native);return;}
  if(req.url==='/api/native/save'){let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);saves.push(saved);if(saves.length===1)await firstSavePending;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:saved.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:saved.generation.generation}}}));return;}
  if(req.url?.startsWith('/api/listFolders')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:['isolated']}));return;}next();
 });}}]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',d=>{s+=d;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled')console.error('Console:',m.params.args.map(a=>a.value??a.description).join(' '));if(m.method==='Runtime.exceptionThrown')console.error('Browser exception:',JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},35000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{let r;try{r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);}catch(e){console.error('Evaluation stalled:',expression.slice(0,220));throw e;}if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1200;i++){if(${condition})return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 const click=async expression=>{const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control: '+${JSON.stringify(expression)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 const button=label=>`[...document.querySelectorAll('.dialectic-app button')].find(e=>e.textContent===${JSON.stringify(label)}&&e.getBoundingClientRect().width)`;
 const key=async(key,code,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,modifiers,windowsVirtualKeyCode:({s:83,z:90,Enter:13,ArrowLeft:37,ArrowRight:39,Escape:27})[key]??0},sessionId);};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic`},sessionId);
 try{await wait('window.proof?.port()?.session() && document.querySelector("[data-dialectic-draft=true]")');}catch(e){console.error(await evaluate('({proof:!!window.proof,body:document.body.innerText.slice(0,5000),html:document.body.innerHTML.slice(0,1000)})'));throw e;}

 await wait('proof.port().application.vault.state()?.complete');
 assert.equal(await evaluate('document.querySelector(".dialectic-body").dataset.sidebarOpen'), 'false');
 assert.equal(await evaluate('[...document.querySelectorAll(".dialectic-app button")].some(b=>b.textContent==="Save")'),false);
 await click('proof.editor.mounts.get(proof.text().key).focusElement');
 await evaluate('proof.original=proof.text();proof.mount=proof.editor.mounts.get(proof.original.key);proof.snapshots=0;proof.rebuilds=0');
 await send('Input.insertText',{text:'How can historical interpretations remain open to revision?'},sessionId);
 assert.equal(await evaluate('proof.snapshots'),0);assert.equal(saves.length,0);
 await click('document.querySelector("[aria-label=\\\"Submit contribution\\\"]")');
 await wait('document.querySelector("[aria-label=\\\"Waiting for AI response\\\"]")');
 await writeFile('/tmp/dialectic-conversation-waiting.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await wait('proof.committed().length===2');
 assert.equal(await evaluate('proof.native.knowledgeEvidence(String(proof.root().payload.id)).pending'),true);
 assert.equal(await evaluate('document.querySelector(".dialectic-app").textContent.includes("Finish the Document Save or recovery")'),false);
 report.saveOverlap={responseAdmittedWhileSaving:true,noPresentationError:true};releaseSave();
 await wait('proof.committed().length===2 && !proof.native.isDirty(String(proof.root().payload.id))');
 assert.equal(saves.length,2);assert.match(saved.location.filename,/^Conversation on [A-Za-z]+ \d{1,2}, \d{4}\.ink$/);
 report.autosave={count:saves.length,filename:saved.location.filename,sameIdentity:saves.every(s=>s.generation.resourceId===saved.generation.resourceId)};
 assert(report.autosave.sameIdentity);
 assert.equal(await evaluate('proof.editor.mounts.get(proof.original.key)===proof.mount'),true);
 await click('document.querySelector("[aria-label=\\\"Expand Contributions\\\"]")');
 await click('document.querySelector("[aria-label=\\\"Collapse Contributions\\\"]")');
 assert.equal(await evaluate('proof.editor.mounts.get(proof.original.key)===proof.mount'),true);
 await writeFile('/tmp/dialectic-conversation-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 // Delay native worker preparation to verify the spinner precedes completion.
 await click('proof.editor.mounts.get(proof.text().key).focusElement');
 await evaluate(`(()=>{const prepare=proof.editor.clipboard.prepare.bind(proof.editor.clipboard);proof.editor.clipboard.prepare=input=>new Promise(resolve=>setTimeout(resolve,500)).then(()=>prepare(input));const e=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{types:['text/plain'],getData:t=>t==='text/plain'?'A longer pasted passage. '.repeat(450):''}});proof.editor.mounts.get(proof.text().key).focusElement.dispatchEvent(e);})()`);
 await wait('document.querySelector(".dialectic-paste-progress")');
 await writeFile('/tmp/dialectic-conversation-pasting.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await wait('!proof.editor.clipboard.pasting()');
 assert.equal(await evaluate('proof.editor.mounts.get(proof.text().key).captureText().includes("longer pasted passage")'),true);
 assert.equal(saves.length,2);report.paste={spinner:true,completed:true,noTypingSave:true};
 report.layout=await evaluate(`(()=>{const app=document.querySelector('.dialectic-app'),body=app.querySelector('.dialectic-body'),main=app.querySelector('.dialectic-main'),rail=app.querySelector('.dialectic-sidebar');return {railWidth:rail.getBoundingClientRect().width,mainWidth:main.getBoundingClientRect().width,appWidth:app.getBoundingClientRect().width,collapsed:body.dataset.sidebarOpen==='false',markers:app.querySelectorAll('.dialectic-contribution-list button').length}})()`);
 assert(report.layout.collapsed);assert.equal(report.layout.markers,2);
 await evaluate(`proof.editor.commands.structuralTransaction('Fixture chronology',()=>{for(let i=3;i<=35;i++)proof.editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'human',ordinal:i,replies:[]}},children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text:'Earlier contribution '+i}]},{kind:'before',anchorKey:proof.draft().key});})`);
 await wait('document.querySelectorAll(".dialectic-contribution-list button").length===35');
 report.chronology=await evaluate(`(()=>{const list=document.querySelector('.dialectic-contribution-list'),before=proof.editor.repository.state.revision;list.scrollTop=list.scrollHeight;return {scrollable:list.scrollHeight>list.clientHeight,scrolled:list.scrollTop>0,canonicalUnchanged:before===proof.editor.repository.state.revision}})()`);
 assert(report.chronology.scrollable&&report.chronology.scrolled&&report.chronology.canonicalUnchanged);
 report.result='passed';console.log(JSON.stringify(report,null,2));
}finally{releaseSave();socket?.close();browser?.kill('SIGTERM');await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
