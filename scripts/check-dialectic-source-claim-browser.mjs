// Focused trusted-input qualification. Save transport is isolated in memory.
import {spawn} from 'node:child_process';
import express from 'express';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const stage4b=true,live=true;
if(process.env.DIALECTIC_UI_ONLY!=='1'&&!process.env.OPENAI_API_KEY)throw Error('Server environment key required');
const {build,stop}=await import('esbuild');
const brokerFile=path.resolve('node_modules/.cache/dialectic-inventory-browser.mjs');
await build({stdin:{contents: "export {createDialecticBroker} from './server/dialectic/broker.ts';",resolveDir:process.cwd()},outfile:brokerFile,bundle:true,platform:'node',format:'esm',packages:'external'});
const {createDialecticBroker}=await import(brokerFile);
const memoryRoot=await mkdtemp(path.join(tmpdir(),'dialectic-memory-'));
const wire=[];
const tracked=async(url,init)=>{const body=init?.body?JSON.parse(init.body):null;wire.push({path:new URL(url).pathname,bytes:Buffer.byteLength(init?.body??''),...(body?.tools?{tools:body.tools.map(t=>t.name),inventoryInstructions:body.instructions?.includes('call list_text_blocks')}: {})});return fetch(url,init);};
const broker=createDialecticBroker({testLogging:true,logRoot:path.resolve('artifacts/dcp-source-claim'),currentCavern:()=>({path:memoryRoot,cavernGuid:'proof-cavern',session:'proof-session'}),fetcher:tracked});
const profile=await mkdtemp(path.join(tmpdir(),'dialectic-'));let browser,socket,server,saved;
const report={};await (await import('node:fs/promises')).mkdir('artifacts/dcp-source-claim',{recursive:true});
try{
 server=await createServer({server:{port:0,strictPort:false},plugins:[{name:'dialectic-proof',resolveId:id=>id==='/__dialectic.js'?'\0dialectic-proof':undefined,load(id){if(id!=='\0dialectic-proof')return;return `
 import {draftContribution,defaultParticipant} from '/src/features/dialectic/model.ts';import {ScopedEntities} from '/src/application/scoped-entities.ts';import {DialecticReferences} from '/src/features/dialectic/references.ts';
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
 editor.setAssetContext(()=>({cavernId:'proof-cavern',session:'proof-session'}));
 native.defaultVault=async()=>'isolated';native.establishVault=async()=>({vault:'isolated'});native.list=async()=>['conversation.ink'];
 native.browseVault=native.discoverVault=async()=>({vault:'isolated',folders:['isolated'],documents:[],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true});
 let restoredId;if(location.search.includes('reload')){const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});const bytes=new Uint8Array(await(await fetch('/__saved')).arrayBuffer());restoredId=decodeNative(bytes).resourceId;admitNative(editor.repository,bytes,editor.repository.readState().placements[bank].contentKey);}
 await editor.commandRegistry.execute('dialectic.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const selector=document.body.appendChild(document.createElement('div'));selector.style.cssText='position:fixed;top:0;left:0;z-index:2147483646';render(()=>createComponent(WorkspacePresentations,{session}),selector);
 const host=document.body.appendChild(document.createElement('div'));host.className='workspace-demo';render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 const port=()=>documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic');
 if(restoredId)await port().application.openDocument(restoredId);
 window.proof={draftContribution,defaultParticipant,ScopedEntities,DialecticReferences,session,editor,native,port,captureNative,nativeBytes,decodeNative,snapshots:0,rebuilds:0,creates:0};
 proof.root=()=>port().session().projection.node(port().session().rootKey);proof.rows=()=>proof.root().children.map(k=>port().session().projection.node(k)).filter(n=>n.payload.metadata?.dialectic?.kind==='contribution');proof.committed=()=>proof.rows().filter(n=>n.payload.metadata.dialectic.state==='committed');
 proof.draft=()=>proof.rows().find(n=>n.payload.metadata.dialectic.state==='draft');proof.text=()=>port().session().projection.node(proof.draft().children[0]);
 const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=(...a)=>{proof.snapshots++;(proof.snapshotTraces??=[]).push(new Error().stack);return snapshot(...a)};
 const bounded=editor.commands.boundedStructuralTransaction.bind(editor.commands);editor.commands.boundedStructuralTransaction=(...a)=>{const start=performance.now();try{return bounded(...a);}finally{proof.commitMs=performance.now()-start;}};
 const create=editor.createView.bind(editor);editor.createView=(...a)=>{proof.creates++;return create(...a)};
 for(const p of editor.projections.values()){const build=p.build.bind(p);p.build=(...a)=>{proof.rebuilds++;return build(...a)}}
 native.bind(String(proof.root().payload.id),{folder:'isolated',filename:'conversation.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 `;},configureServer(s){const api=express();api.use(broker.router);s.middlewares.use('/api/dialectic',api);s.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/__dialectic')&&!req.url.startsWith('/__dialectic.js')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/__dialectic.js"></script></body></html>');return;}
  if(req.url==='/__saved'){res.end(saved.generation.native);return;}
  if(req.url==='/api/native/save'){let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:saved.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:saved.generation.generation}}}));return;}
  if(req.url?.startsWith('/api/listFolders')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:['isolated']}));return;}next();
 });}}]});await server.listen();await server.watcher.close();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',d=>{s+=d;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error('Browser exception:',JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},35000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{let r;try{r=await send('Runtime.evaluate',{expression:`(async()=>{const value=await eval(${JSON.stringify(expression)});return value===undefined?undefined:JSON.parse(JSON.stringify(value));})()`,awaitPromise:true,returnByValue:true},sessionId);}catch(e){console.error('Evaluation stalled:',expression.slice(0,220));throw e;}if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1000;i++){if(${condition})return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 const click=async expression=>{const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control: '+${JSON.stringify(expression)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 const button=label=>`[...document.querySelectorAll('.dialectic-app button')].find(e=>e.textContent===${JSON.stringify(label)}&&e.getBoundingClientRect().width)`;
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic`},sessionId);
 await wait('window.proof?.port()?.session() && document.querySelector("[data-dialectic-draft=true]")');
 const configure=async()=>{await click(`document.querySelector('.dialectic-provider-settings summary')`);if(!live){await click(`document.querySelector('[aria-label="Session API key"]')`);await send('Input.insertText',{text:'fixture-only-key'},sessionId);}await click(button('Use session settings'));await wait(`document.querySelector('[aria-label="Assistant mode"]')?.value==='live'`);await click(`document.querySelector('.dialectic-provider-settings summary')`);};

 const exact='A map is useful precisely because it omits information.';
 const original=exact+' A perfectly detailed map would be indistinguishable from the territory itself, and therefore practically useless.';
 // Seed ten committed human contributions locally; only the final request contacts OpenAI.
 await evaluate(`(()=>{for(let i=0;i<10;i++){
  const draft=proof.draft();const children=i===0?["I'd like to begin a discussion about maps and territories.","",${JSON.stringify(original)},"","Abstraction is necessary for understanding."]:['Short local contribution '+(i+1)];
  for(const [index,text]of children.entries()){if(!index)proof.editor.commands.replaceInlineRange(proof.text().key,0,0,text);else proof.editor.commands.insert({type:'standoff-editor-block',text},{kind:'at',parentKey:draft.key,index});}
  proof.editor.commands.setPayloadField(draft.key,'metadata',JSON.parse(JSON.stringify({...draft.payload.metadata,dialectic:{...draft.payload.metadata.dialectic,state:'committed',ordinal:i+1,createdUtc:new Date().toISOString(),participant:proof.defaultParticipant(String(proof.root().payload.id),'human')}})));
  proof.editor.commands.insert(proof.draftContribution(),{kind:'at',parentKey:proof.root().key,index:proof.root().children.length});
 }proof.original=proof.port().session().projection.node(proof.committed()[0].children[2]);proof.originalMount=proof.editor.mounts.get(proof.original.key);})()`);
 if(process.env.DIALECTIC_UI_ONLY==='1'){
  await wait('document.querySelectorAll(".dialectic-contribution-menu").length===11');
  const geometry=await evaluate(`(()=>{const draft=proof.editor.mounts.get(proof.draft().key).root,canvas=draft.closest('.dialectic-canvas'),bar=document.querySelector('.dialectic-compose-bar');return {draft:draft.getBoundingClientRect().toJSON(),canvas:canvas.getBoundingClientRect().toJSON(),bar:bar.getBoundingClientRect().toJSON(),scroll:canvas.scrollTop};})()`);console.log('geometry',JSON.stringify(geometry));
  assert(Math.abs(geometry.draft.bottom-geometry.canvas.bottom)<2,'Composer does not meet viewport bottom');
  await click('proof.editor.mounts.get(proof.text().key).focusElement');await send('Input.insertText',{text:'Keep my unfinished draft.'},sessionId);
  await evaluate(`(()=>{const select=document.querySelector('[aria-label="Assistant mode"]');select.value='mock';select.dispatchEvent(new Event('change',{bubbles:true}));proof.draftId=proof.draft().payload.id;proof.draftMount=proof.editor.mounts.get(proof.text().key);})()`);
  await click('proof.editor.mounts.get(proof.committed()[0].key).root.querySelector(".dialectic-contribution-menu summary")');
  await click('proof.editor.mounts.get(proof.committed()[0].key).root.querySelector(".dialectic-contribution-menu button")');await wait('proof.committed().length===12');
  const ui=await evaluate(`({newId:proof.committed()[10].payload.id,oldId:proof.committed()[0].payload.id,sameDraft:proof.draft().payload.id===proof.draftId,sameMount:proof.editor.mounts.get(proof.text().key)===proof.draftMount,text:proof.editor.mounts.get(proof.text().key).focusElement.textContent,menus:document.querySelectorAll('.dialectic-contribution-menu').length,hasDraftLabel:document.querySelector('.dialectic-app').textContent.includes('Your draft')})`);
  assert.notEqual(ui.newId,ui.oldId);assert(ui.sameDraft&&ui.sameMount);assert.equal(ui.text,'Keep my unfinished draft.');assert(!ui.hasDraftLabel);assert.equal(ui.menus,13);
  await writeFile('artifacts/dcp-source-claim/ui.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));await click('[...document.querySelectorAll(".workspace-presentations button")].find(e=>e.textContent==="Textual")');await wait(`document.querySelector('.dialectic-textual')`);
  await wait('document.querySelector(".dialectic-textual .dialectic-contribution-menu")');assert.equal(await evaluate('document.querySelectorAll(".dialectic-textual .dialectic-contribution-menu").length'),13);
  await evaluate(`proof.editor.commandRegistry.execute('workspace.presentation.desktop',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);await wait(`document.querySelector('.dialectic-app .dialectic-canvas [data-dialectic-draft="true"]')`);assert(await evaluate('proof.editor.mounts.get(proof.text().key)===proof.draftMount'));
  await click(button('Add Conversation'));await wait('proof.committed().length===0');await wait('document.querySelectorAll(".dialectic-contribution-menu").length===1');
  const empty=await evaluate(`(()=>{const e=proof.editor.mounts.get(proof.draft().key).root;return {bottom:e.getBoundingClientRect().bottom,viewportBottom:e.closest('.dialectic-canvas').getBoundingClientRect().bottom};})()`);assert(Math.abs(empty.bottom-empty.viewportBottom)<2,'Empty composer is not bottom aligned');
  await writeFile('artifacts/dcp-source-claim/ui.json',JSON.stringify({geometry,ui,empty,textualRoundTrip:true},null,2));console.log({ui,empty,textualRoundTrip:true});throw Error('UI_ONLY_DONE');
 }
 await configure();
 const request="Find the sentence in my opening contribution that begins 'A map is useful precisely because'.\nCreate a native exact-range anchor on that sentence and classify it as dialectic/claim.\nDo not annotate this instruction or create a new paragraph as a substitute. Leave the original text unchanged.";
 await click('proof.editor.mounts.get(proof.text().key).focusElement');await send('Input.insertText',{text:request},sessionId);
 await evaluate('proof.snapshots=0;proof.rebuilds=0;proof.started=performance.now()');await click(button('Submit'));
 const deadline=Date.now()+125000;while(!(await evaluate('proof.committed().length===12'))){const error=await evaluate(`document.querySelector('.dialectic-notice')?.textContent`);if(error)throw Error(error);if(Date.now()>deadline)throw Error('Provider timeout');await new Promise(r=>setTimeout(r,250));}
 report.exchange=await evaluate(`(()=>{const d=proof.committed().at(-1).payload.metadata.dialectic.dcp,n=proof.port().session().projection.node(proof.original.key);return {response:JSON.parse(d.response),tools:d.tools,attempts:d.provider.attempts,sourceId:n.payload.id,sourceText:proof.editor.mounts.get(n.key).focusElement.textContent,marks:n.payload.standoffProperties,sameMount:proof.editor.mounts.get(n.key)===proof.originalMount,snapshots:proof.snapshots,rebuilds:proof.rebuilds,commitMs:proof.commitMs};})()`);
 assert(report.exchange.tools.some(t=>['list_text_blocks','search_symposium'].includes(t.call.tool)),'Discovery was not invoked');assert(report.exchange.tools.some(t=>t.call.tool==='read_source'),'Source was not read');
 assert.equal(report.exchange.response.anchors.length,1);assert.equal(report.exchange.response.anchors[0].selector.exact,exact);assert.equal(report.exchange.response.interpretations.length,1);assert.equal(report.exchange.response.interpretations[0].type,'dialectic/claim');assert.equal(report.exchange.sourceText,original);assert(report.exchange.sameMount);
 const marks=report.exchange.marks;assert.equal(marks.filter(p=>p.type==='dialectic/claim').length,1);const anchor=marks.find(p=>p.type==='dialectic/range-anchor');assert.deepEqual([anchor.start,anchor.end],[0,54]);assert.equal(report.exchange.snapshots+report.exchange.rebuilds,0);
 await click(`[...document.querySelectorAll('.dialectic-annotation-link')].find(e=>e.textContent.includes('dialectic/claim'))`);await wait(`document.querySelector('[aria-label="Annotation inspection"]')`);report.inspection=await evaluate(`document.querySelector('[aria-label="Annotation inspection"]').textContent`);assert(report.inspection.includes(exact));
 await writeFile('artifacts/dcp-source-claim/browser.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 report.outgoingBytes=wire.reduce((n,r)=>n+r.bytes,0);await broker.testLog.flush();await writeFile('artifacts/dcp-source-claim/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({tools:report.exchange.tools.map(t=>t.call.tool),exactCells:55,sameMount:report.exchange.sameMount,commitMs:report.exchange.commitMs,outgoingBytes:report.outgoingBytes}));
}catch(error){if(error.message!=='UI_ONLY_DONE'){report.failure=String(error);await writeFile('artifacts/dcp-source-claim/report.json',JSON.stringify(report,null,2));throw error;}}finally{socket?.close();browser?.kill('SIGTERM');broker.dispose();await broker.testLog.flush();server?.httpServer?.closeAllConnections?.();let cleanupTimer;await Promise.race([server?.close(),new Promise(resolve=>cleanupTimer=setTimeout(resolve,5000))]);clearTimeout(cleanupTimer);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});await rm(memoryRoot,{recursive:true,force:true,maxRetries:5,retryDelay:100});await rm(brokerFile,{force:true});stop?.();if(!report.failure)process.exit(0);}
