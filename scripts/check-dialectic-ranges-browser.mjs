// Focused trusted-input qualification. Save transport is isolated in memory.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const profile=await mkdtemp(path.join(tmpdir(),'dialectic-'));let browser,socket,server,saved;
const report={};
try{
 server=await createServer({server:{port:0,strictPort:false},plugins:[{name:'dialectic-proof',resolveId:id=>id==='/__dialectic.js'?'\0dialectic-proof':undefined,load(id){if(id!=='\0dialectic-proof')return;return `
 import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {WorkspacePresentations} from '/src/demo/workspace-presentations.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import {documentApplicationPorts} from '/src/application/document-application-ports.ts';
 import {nativeDocumentSession} from '/src/persistence/native-session.ts';
 import {captureNative,nativeBytes,decodeNative,admitNative} from '/src/persistence/native-resource.ts';
 import '/src/index.css';import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}}),editor=session.editor,native=nativeDocumentSession(editor);
 native.defaultVault=async()=>'isolated';native.establishVault=async()=>({vault:'isolated'});native.list=async()=>['conversation.ink'];
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
 native.bind(String(proof.root().payload.id),{folder:'isolated',filename:'conversation.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 `;},configureServer(s){s.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/__dialectic')&&!req.url.startsWith('/__dialectic.js')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/__dialectic.js"></script></body></html>');return;}
  if(req.url==='/__saved'){res.end(saved.generation.native);return;}
  if(req.url==='/api/native/save'){let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:saved.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:saved.generation.generation}}}));return;}
  if(req.url?.startsWith('/api/listFolders')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:['isolated']}));return;}next();
 });}}]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',d=>{s+=d;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error('Browser exception:',JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},35000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{let r;try{r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);}catch(e){console.error('Evaluation stalled:',expression.slice(0,220));throw e;}if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<500;i++){if(${condition})return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 const click=async expression=>{const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control: '+${JSON.stringify(expression)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 const button=label=>`[...document.querySelectorAll('.dialectic-app button')].find(e=>e.textContent===${JSON.stringify(label)}&&e.getBoundingClientRect().width)`;
 const key=async(key,code,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,modifiers,windowsVirtualKeyCode:({s:83,z:90,Enter:13,ArrowLeft:37,ArrowRight:39,Escape:27})[key]??0},sessionId);};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic`},sessionId);
 await wait('window.proof?.port()?.session() && document.querySelector("[data-dialectic-draft=true]")');
 await click('proof.editor.mounts.get(proof.text().key).focusElement');
 await evaluate('proof.original=proof.text();proof.mount=proof.editor.mounts.get(proof.original.key);proof.snapshots=0;proof.rebuilds=0;proof.started=performance.now()');
 await send('Input.insertText',{text:'How can historical interpretations remain open to revision?'},sessionId);
 await wait('proof.mount.captureText().includes("historical")');report.typing=await evaluate('({observedMs:performance.now()-proof.started,snapshots:proof.snapshots,rebuilds:proof.rebuilds})');
 await evaluate('proof.started=performance.now()');await click(button('Submit'));await wait('proof.committed().length===1 && document.querySelectorAll("[data-dialectic-contribution]").length===2');
 report.submit=await evaluate('({observedMs:performance.now()-proof.started,snapshots:proof.snapshots,rebuilds:proof.rebuilds,mountRetained:proof.editor.mounts.get(proof.original.key)===proof.mount})');assert.equal(report.submit.snapshots,0);assert.equal(report.submit.rebuilds,0);assert.equal(report.submit.mountRetained,true);
 await click(button('Undo'));await wait('proof.committed().length===0');await click(button('Redo'));await wait('proof.committed().length===1');
 await click(button('Include in context'));await click(button('Ask mock assistant'));await wait('proof.committed().length===2');
 assert.equal(await evaluate('!!document.querySelector(".dialectic-canvas [data-block-type=table-block]")'),true);
 await click('document.querySelector(".dialectic-entry")');await click(button('Reply to this'));await click(button('Return to present'));
 assert.equal(await evaluate('document.querySelector(".dialectic-pins").children.length'),1);
 await click(button('Go to draft'));await send('Input.insertText',{text:'Revisit the original question with a different source.'},sessionId);await click(button('Submit'));await wait('proof.committed().length===3');
 assert.equal(await evaluate('proof.committed()[2].payload.metadata.dialectic.replies[0].blockId===proof.committed()[0].payload.id'),true);
 console.log('Native editing, history, mock and earlier reply passed');
 // Set only the initial caret; the actual range is extended through trusted key input.
 await evaluate('proof.mount.focus();proof.mount.restoreInlineSelection({anchor:0,head:0})');
 for(let i=0;i<7;i++)await key('ArrowRight','ArrowRight',8);
 assert.deepEqual(await evaluate('proof.mount.captureInlineSelection()'),{anchor:0,head:7});
 const beforeRange=await evaluate('proof.editor.repository.state.revision');
 await click(button('Reply to selection'));
 assert.equal(await evaluate('proof.editor.repository.state.revision'),beforeRange);
 await click(button('Go to draft'));await send('Input.insertText',{text:'A precise range reply.'},sessionId);
 await evaluate('proof.snapshots=0;proof.rebuilds=0;proof.started=performance.now()');
 await click(button('Submit'));await wait('proof.committed().length===4 && document.querySelectorAll("[data-dialectic-contribution]").length===5');
 report.range=await evaluate('({observedMs:performance.now()-proof.started,snapshots:proof.snapshots,rebuilds:proof.rebuilds,mountRetained:proof.editor.mounts.get(proof.original.key)===proof.mount,reply:{...proof.committed()[3].payload.metadata.dialectic.replies[0]},excerpt:proof.committed()[3].payload.metadata.dialectic.replyExcerpts[0].text})');
 assert.equal(report.range.excerpt,'How can');assert.equal(report.range.snapshots,0);assert.equal(report.range.rebuilds,0);assert(report.range.mountRetained);
 await click(button('Undo'));await wait('proof.committed().length===3');await click(button('Redo'));await wait('proof.committed().length===4');
 await click(`[...document.querySelectorAll('.dialectic-inspector button')].find(b=>b.textContent.startsWith('Passage '))`);
 await writeFile('docs/development/DIALECTIC_INCREMENT_2_PASSAGE.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));console.log('Passage screenshot saved');
 await click(button('Ask mock assistant'));await wait('proof.committed().length===5||document.querySelector(".dialectic-notice")?.textContent');assert.equal(await evaluate('proof.committed().length'),5,await evaluate('document.querySelector(".dialectic-notice")?.textContent')); 
 report.supplied=await evaluate('proof.committed()[4].payload.metadata.dialectic.consumedContext.items.map(i=>({text:i.text,origins:[...i.origins]}))');assert.equal(report.supplied[0].text,'How can');
 console.log('Trusted range selection, atomic reply, history and supplied-context manifest passed');

 await click(button('Go to draft'));await key('s','KeyS',4);await wait('!proof.native.isDirty(String(proof.root().payload.id))');assert(saved);report.save={nativeRequest:true,filename:saved.location?.filename??saved.generation?.location?.filename};console.log('Save passed');
 report.roundTrip=await evaluate(`(()=>{const source=proof.captureNative(proof.editor.repository.readState(),String(proof.root().payload.id));const loaded=proof.decodeNative(proof.nativeBytes(source));const rows=Object.values(loaded.contents).filter(c=>c.payload.metadata?.dialectic?.state==='committed');return {contributions:rows.length,ordinals:rows.map(c=>c.payload.metadata.dialectic.ordinal),sameIds:rows.every(c=>proof.committed().some(n=>n.payload.id===c.payload.id))};})()`);assert.equal(report.roundTrip.contributions,5);assert(report.roundTrip.sameIds);
 await click('proof.mount.focusElement');await key('ArrowLeft','ArrowLeft',8);await key('ArrowLeft','ArrowLeft',8);
 await evaluate('proof.selection=proof.mount.captureInlineSelection();proof.retained=proof.port().session();proof.parent=proof.retained.element.parentElement;proof.creates=0;proof.snapshots=0;proof.rebuilds=0');
 console.log('Switching to Textual');await click(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Textual')`);await wait('document.querySelector(".dialectic-textual .reactive-standoff-flow")');console.log('Textual ready');
 assert.deepEqual(await evaluate('proof.mount.captureInlineSelection()'),await evaluate('proof.selection'));
 await click(button('Go to draft'));
 await send('Input.insertText',{text:'Textual '},sessionId);
 await send('Input.imeSetComposition',{text:'é',selectionStart:1,selectionEnd:1},sessionId);await send('Input.insertText',{text:'é'},sessionId);
 await wait('proof.editor.mounts.get(proof.text().key).captureText().includes("é") && !proof.editor.mounts.get(proof.text().key).composing');
 await key('z','KeyZ',4);await wait('!proof.editor.mounts.get(proof.text().key).captureText().includes("é")');if(await evaluate('proof.editor.mounts.get(proof.text().key).captureText().includes("Textual")'))await key('z','KeyZ',4);report.textualEditing={selectionRetained:true,compositionCommitted:true,undo:true};
 await writeFile('docs/development/DIALECTIC_INCREMENT_2_TEXTUAL.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await evaluate(`proof.session.editor.commandRegistry.execute('workspace.presentation.desktop',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);await wait('!document.querySelector(".dialectic-textual")');
 report.presentation=await evaluate('({sameSession:proof.port().session()===proof.retained,sameMount:proof.editor.mounts.get(proof.original.key)===proof.mount,restored:proof.retained.element.parentElement===proof.parent,creates:proof.creates,snapshots:proof.snapshots,rebuilds:proof.rebuilds,contextRetained:document.querySelector(".dialectic-pins").children.length===1})');assert(report.presentation.sameSession&&report.presentation.sameMount&&report.presentation.restored&&report.presentation.contextRetained);assert.equal(report.presentation.creates,0);assert.equal(report.presentation.snapshots,0);
 await click('document.querySelector(".dialectic-entry")');
 await click(button('Save'));await wait('!proof.native.isDirty(String(proof.root().payload.id))');
 assert.equal(await evaluate('document.querySelector(".dialectic-compose-bar").getBoundingClientRect().bottom <= document.querySelector(".reactive-window").getBoundingClientRect().bottom'),true);
 await writeFile('docs/development/DIALECTIC_INCREMENT_2_DESKTOP.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 const before=await evaluate('performance.timeOrigin');await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic?reload`},sessionId);await wait(`performance.timeOrigin!==${before} && window.proof?.port()?.session() && proof.committed().length===5`);
 report.reopened=await evaluate('({count:proof.committed().length,text:proof.port().session().element.textContent.includes("historical interpretations"),replyPreserved:proof.committed()[2].payload.metadata.dialectic.replies[0].blockId===proof.committed()[0].payload.id})');assert(report.reopened.text&&report.reopened.replyPreserved);
 report.rangeReopened=await evaluate('proof.committed()[3].payload.metadata.dialectic.replyExcerpts[0].text');assert.equal(report.rangeReopened,'How can');
 report.result='passed';await writeFile('docs/development/DIALECTIC_INCREMENT_2_BROWSER.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{socket?.close();browser?.kill('SIGTERM');await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
