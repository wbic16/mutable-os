// Focused trusted-input qualification. Save transport is isolated in memory.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const stage4b=process.argv.includes('--stage4b');
const profile=await mkdtemp(path.join(tmpdir(),'dialectic-'));let browser,socket,server,saved;
const report={};
try{
 server=await createServer({server:{port:0,strictPort:false},plugins:[{name:'dialectic-proof',resolveId:id=>id==='/__dialectic.js'?'\0dialectic-proof':undefined,load(id){if(id!=='\0dialectic-proof')return;return `
 import {ScopedEntities} from '/src/application/scoped-entities.ts';import {DialecticReferences} from '/src/features/dialectic/references.ts';
 import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {WorkspacePresentations} from '/src/demo/workspace-presentations.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import {documentApplicationPorts} from '/src/application/document-application-ports.ts';
 import {nativeDocumentSession} from '/src/persistence/native-session.ts';
 import {captureNative,nativeBytes,decodeNative,admitNative} from '/src/persistence/native-resource.ts';
 import '/src/index.css';import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{scopedSemantics:${stage4b},nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}}),editor=session.editor,native=nativeDocumentSession(editor);
 native.defaultVault=async()=>'isolated';native.establishVault=async()=>({vault:'isolated'});native.list=async()=>['conversation.ink'];
 native.browseVault=native.discoverVault=async()=>({vault:'isolated',folders:['isolated'],documents:[],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true});
 let restoredId;if(location.search.includes('reload')){const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});const bytes=new Uint8Array(await(await fetch('/__saved')).arrayBuffer());restoredId=decodeNative(bytes).resourceId;admitNative(editor.repository,bytes,editor.repository.readState().placements[bank].contentKey);}
 await editor.commandRegistry.execute('dialectic.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const selector=document.body.appendChild(document.createElement('div'));selector.style.cssText='position:fixed;top:0;left:0;z-index:2147483646';render(()=>createComponent(WorkspacePresentations,{session}),selector);
 const host=document.body.appendChild(document.createElement('div'));host.className='workspace-demo';render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 const port=()=>documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic');
 if(restoredId)await port().application.openDocument(restoredId);
 window.proof={ScopedEntities,DialecticReferences,session,editor,native,port,captureNative,nativeBytes,decodeNative,snapshots:0,rebuilds:0,creates:0};
 proof.root=()=>port().session().projection.node(port().session().rootKey);proof.rows=()=>proof.root().children.map(k=>port().session().projection.node(k)).filter(n=>n.payload.metadata?.dialectic?.kind==='contribution');proof.committed=()=>proof.rows().filter(n=>n.payload.metadata.dialectic.state==='committed');
 proof.draft=()=>proof.rows().find(n=>n.payload.metadata.dialectic.state==='draft');proof.text=()=>port().session().projection.node(proof.draft().children[0]);
 const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=(...a)=>{proof.snapshots++;(proof.snapshotTraces??=[]).push(new Error().stack);return snapshot(...a)};
 const bounded=editor.commands.boundedStructuralTransaction.bind(editor.commands);editor.commands.boundedStructuralTransaction=(...a)=>{const start=performance.now();try{return bounded(...a);}finally{proof.commitMs=performance.now()-start;}};
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
 const key=async(key,code,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,modifiers,commands:modifiers===4?({a:['selectAll'],c:['copy']})[key]:undefined,windowsVirtualKeyCode:({c:67,a:65,v:86,x:88,Backspace:8,s:83,z:90,Enter:13,ArrowLeft:37,ArrowRight:39,Escape:27})[key]??0},sessionId);};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic`},sessionId);
 await wait('window.proof?.port()?.session() && document.querySelector("[data-dialectic-draft=true]")');

 await click('proof.editor.mounts.get(proof.text().key).focusElement');
 await evaluate('proof.original=proof.text();proof.mount=proof.editor.mounts.get(proof.original.key);proof.retained=proof.port().session()');
 await send('Input.insertText',{text:'Form can carry an argument, not merely decorate it.'},sessionId);
 await click(button('Submit'));await wait('proof.committed().length===1');

 await click(button('Ask mock assistant'));await wait('document.querySelector(".dialectic-dcp-preview")');
 assert.equal(await evaluate('proof.committed().length'),1);
 await click(button('Cancel response'));await new Promise(r=>setTimeout(r,220));assert.equal(await evaluate('proof.committed().length'),1);report.cancelledWithoutCommit=true;
 await evaluate('proof.snapshots=0;proof.rebuilds=0;proof.started=performance.now()');
 await click(button('Ask mock assistant'));await wait('proof.committed().length===2');
 report.exchange=await evaluate(`(()=>{const n=proof.committed()[1],d=n.payload.metadata.dialectic;return JSON.parse(JSON.stringify({observedMs:performance.now()-proof.started,commitMs:proof.commitMs,snapshots:proof.snapshots,rebuilds:proof.rebuilds,sameMount:proof.editor.mounts.get(proof.original.key)===proof.mount,sameSession:proof.port().session()===proof.retained,replies:d.replies,discursiveReferences:d.discursiveReferences,tools:d.dcp.tools.length,sourceAnnotations:proof.original.payload.standoffProperties,definitions:Object.values(proof.root().payload.linkedAnnotations).map(d=>d.type),dirty:proof.native.isDirty(String(proof.root().payload.id))}));})()`);
 assert.equal(report.exchange.snapshots,0);assert.equal(report.exchange.rebuilds,0);assert(report.exchange.sameMount&&report.exchange.sameSession&&report.exchange.dirty);
 assert.equal(report.exchange.replies.length,1);assert.equal(report.exchange.discursiveReferences.length,1);assert.equal(report.exchange.replies[0].kind,'contribution');assert.equal(report.exchange.discursiveReferences[0].kind,stage4b?'argument':'range');assert(report.exchange.sourceAnnotations.some(p=>p.metadata?.dcp?.sourceAuthor==='human'));
 await click('proof.editor.mounts.get(proof.port().session().projection.node(proof.committed()[1].children[0]).key).focusElement');report.firstNativeInteractionMs=await evaluate('performance.now()-proof.started');
 await click(button('Undo'));await wait('proof.committed().length===1');await click(button('Redo'));await wait('proof.committed().length===2');
 assert.equal(await evaluate('proof.snapshots+proof.rebuilds'),0);report.undoRedo=true;
 // Real native text selection and editing still operate in the retained editor.
 await click('proof.mount.focusElement');await key('ArrowLeft','ArrowLeft',2);await send('Input.insertText',{text:'Still editable. '},sessionId);
 report.editing=await evaluate(`({text:proof.mount.captureText(),sameMount:proof.editor.mounts.get(proof.original.key)===proof.mount,snapshots:proof.snapshots,rebuilds:proof.rebuilds})`);assert(report.editing.text.includes('Still editable.'));assert(report.editing.sameMount);assert.equal(report.editing.snapshots+report.editing.rebuilds,0);
 await evaluate(`(()=>{const state=proof.editor.repository.readState(),root=state.contents[state.placements[state.rootPlacementKey].contentKey],bank=root.children.find(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block');for(let d=0;d<3;d++)proof.editor.commands.insert({id:'unrelated-'+d,type:'document-block',metadata:{documentId:'unrelated-'+d},children:Array.from({length:100},(_,i)=>({id:'unrelated-'+d+'-'+i,type:'standoff-editor-block',text:'Unrelated annotated material. '.repeat(20),standoffProperties:[{id:'mark-'+i,type:'style/bold',start:0,end:8}]}))},{kind:'at',parentKey:bank,index:d+1});proof.otherRecords=Object.values(proof.editor.repository.readState().contents).filter(c=>String(c.payload.id).startsWith('unrelated-'));proof.snapshots=0;proof.rebuilds=0;})()`);
 await click('[...document.querySelectorAll(".dialectic-app .dialectic-entry")].find(e=>e.querySelector(".dialectic-number")?.textContent==="01")');
 await evaluate('proof.started=performance.now()');await click(button('Ask mock assistant'));await wait('proof.committed().length===3');
 report.unrelatedDocuments=await evaluate(`({observedMs:performance.now()-proof.started,commitMs:proof.commitMs,snapshots:proof.snapshots,rebuilds:proof.rebuilds,unchanged:proof.otherRecords.every(r=>proof.editor.repository.readState().contents[r.key]===r),paragraphs:300})`);assert.equal(report.unrelatedDocuments.snapshots+report.unrelatedDocuments.rebuilds,0);assert(report.unrelatedDocuments.unchanged);
 if(stage4b){
  report.registryScaling=[];
  for(const count of [100,1000]){
   await evaluate(`(()=>{const root=proof.root(),owner=String(root.payload.id),service=new proof.ScopedEntities(proof.editor,root.key,owner),registry=JSON.parse(JSON.stringify(root.payload.linkedAnnotations)),anchor=Object.values(registry).find(d=>d.type==='dialectic/range-anchor').id;for(let i=proof.seedCount??0;i<${count};i++){const e=service.prepare({name:'Registry Entity '+i,typename:'Concept',description:'',aliases:[]},{actor:'human'});registry[e.id]=e;const id=crypto.randomUUID();registry[id]={id,type:'dialectic/argument',metadata:{dialecticArgument:{version:1,anchor:{resourceId:owner,anchorId:anchor},provenance:{actor:'human'}}}};}proof.editor.commands.boundedStructuralTransaction('Seed qualification registry',()=>proof.editor.commands.setPayloadField(root.key,'linkedAnnotations',registry));proof.seedCount=${count};proof.refProbe?.dispose();proof.refProbe=new proof.DialecticReferences(proof.editor,proof.port().session().projection,root.key);proof.snapshots=0;proof.rebuilds=0;proof.beforeCount=proof.committed().length;proof.beforeReads=proof.refProbe.diagnostics.definitionReads;service.dispose();})()`);
   await click('[...document.querySelectorAll(".dialectic-app .dialectic-entry")].find(e=>e.querySelector(".dialectic-number")?.textContent==="01")');
   await evaluate('proof.started=performance.now()');await click(button('Ask mock assistant'));await wait('proof.committed().length===proof.beforeCount+1');
   const result=await evaluate(`({pairs:${count},definitions:Object.keys(proof.root().payload.linkedAnnotations).length,commitMs:proof.commitMs,observedMs:performance.now()-proof.started,snapshots:proof.snapshots,rebuilds:proof.rebuilds,definitionUpdates:proof.refProbe.diagnostics.definitionReads-proof.beforeReads,unrelatedUnchanged:proof.otherRecords.every(r=>proof.editor.repository.readState().contents[r.key]===r)})`);
   assert.equal(result.snapshots+result.rebuilds,0);assert(result.unrelatedUnchanged);assert(result.definitionUpdates<20);report.registryScaling.push(result);
  }
  await click(button('Go to draft'));await click('proof.editor.mounts.get(proof.text().key).focusElement');
  await evaluate('proof.beforeReads=proof.refProbe.diagnostics.definitionReads;proof.beforeCount=proof.committed().length');await send('Input.insertText',{text:'A later human contribution.'},sessionId);
  assert.equal(await evaluate('proof.refProbe.diagnostics.definitionReads-proof.beforeReads'),0);assert.equal(await evaluate('proof.committed().length-proof.beforeCount'),0);
  await click(button('Submit & Ask'));await wait('proof.committed().length===proof.beforeCount+2');
  report.submitAndAsk=await evaluate(`JSON.parse(JSON.stringify({human:proof.committed().at(-2).payload.metadata.dialectic,ai:proof.committed().at(-1).payload.metadata.dialectic.participant,reply:proof.committed().at(-1).payload.metadata.dialectic.replies[0],humanId:proof.committed().at(-2).payload.id}))`);assert.equal(report.submitAndAsk.reply.blockId,report.submitAndAsk.humanId);assert.equal(report.submitAndAsk.human.participant.kind,'human');
  const argumentButton=`[...document.querySelectorAll('.dialectic-inspector details')].find(e=>e.querySelector('summary')?.textContent==='Semantic identities')`;
  await click(argumentButton+`.querySelector('summary')`);await click(`[...${argumentButton}.querySelectorAll('button')].find(e=>e.textContent.startsWith('Argument '))`);
  report.argumentNavigation=await evaluate(`!![...document.querySelectorAll('.dialectic-inspector p')].find(e=>e.textContent.includes('qualifies'))`);assert(report.argumentNavigation);
 }
 await evaluate(`proof.session.editor.commandRegistry.execute('workspace.presentation.textual',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);await wait('document.querySelector(".dialectic-textual")');
 assert(await evaluate('proof.editor.mounts.get(proof.original.key)===proof.mount'));
 await evaluate(`proof.session.editor.commandRegistry.execute('workspace.presentation.desktop',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);await wait('!document.querySelector(".dialectic-textual")');
 report.presentationRoundTrip=await evaluate('proof.editor.mounts.get(proof.original.key)===proof.mount&&proof.port().session()===proof.retained');assert(report.presentationRoundTrip);
 await click(button('Save'));await wait('!proof.native.isDirty(String(proof.root().payload.id))');assert(saved);
 const ids=await evaluate('proof.committed().map(n=>n.payload.id)');
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic?reload`},sessionId);await wait(`window.proof?.committed().length===${ids.length}`);
 assert.deepEqual(await evaluate('proof.committed().map(n=>n.payload.id)'),ids);
 report.persistence=await evaluate(`({dcp:proof.committed().filter(n=>n.payload.metadata.dialectic.dcp).length,definitions:Object.values(proof.root().payload.linkedAnnotations).length,tools:proof.committed()[1].payload.metadata.dialectic.dcp.tools.length})`);assert.equal(report.persistence.dcp,stage4b?5:2);
 if(stage4b){
  await click(`[...document.querySelectorAll('.dialectic-app .dialectic-entry')].find(e=>e.querySelector('.dialectic-number')?.textContent===${JSON.stringify(String(ids.length).padStart(2,'0'))})`);
  const identities=`[...document.querySelectorAll('.dialectic-inspector details')].find(e=>e.querySelector('summary')?.textContent==='Semantic identities')`;
  await click(identities+`.querySelector('summary')`);await click(`[...${identities}.querySelectorAll('button')].find(e=>e.textContent.startsWith('Argument '))`);
  assert(await evaluate(`!![...document.querySelectorAll('.dialectic-inspector p')].find(e=>e.textContent.includes('qualifies'))`));report.reloadedArgumentNavigation=true;
 }
 await writeFile(`docs/development/DIALECTIC_STAGE_${stage4b?'4B':'4A'}_DESKTOP.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await writeFile(`docs/development/DIALECTIC_STAGE_${stage4b?'4B':'4A'}_BROWSER.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{socket?.close();browser?.kill('SIGTERM');await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
