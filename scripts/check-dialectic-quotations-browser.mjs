// Focused trusted-input qualification. Save transport is isolated in memory.
import {spawn} from 'node:child_process';
import express from 'express';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const stage4b=true,live=true;
const outputDir=path.resolve('artifacts/dcp-identity-quotation',new Date().toISOString().replaceAll(':','-'));
const {mkdir}=await import('node:fs/promises');await mkdir(outputDir,{recursive:true});
if(!process.env.OPENAI_API_KEY)throw Error('Server environment key required');
const {build,stop}=await import('esbuild');
const brokerFile=path.resolve('node_modules/.cache/dialectic-quotations-browser.mjs');
await build({stdin:{contents: "export {createDialecticBroker} from './server/dialectic/broker.ts';",resolveDir:process.cwd()},outfile:brokerFile,bundle:true,platform:'node',format:'esm',packages:'external'});
const {createDialecticBroker}=await import(brokerFile);
const memoryRoot=await mkdtemp(path.join(tmpdir(),'dialectic-memory-'));
const wire=[];
const tracked=async(url,init)=>{const body=init?.body?JSON.parse(init.body):null;wire.push({path:new URL(url).pathname,bytes:Buffer.byteLength(init?.body??''),...(body?.tools?{tools:body.tools.map(t=>t.name),inventoryInstructions:body.instructions?.includes('call list_text_blocks')}: {})});return fetch(url,init);};
const broker=createDialecticBroker({testLogging:true,logRoot:outputDir,currentCavern:()=>({path:memoryRoot,cavernGuid:'proof-cavern',session:'proof-session'}),fetcher:tracked});
const profile=await mkdtemp(path.join(tmpdir(),'dialectic-'));let browser,socket,server,saved;
const report={};
try{
 server=await createServer({server:{host:"127.0.0.1",port:0,strictPort:false},plugins:[{name:'dialectic-proof',resolveId:id=>id==='/__dialectic.js'?'\0dialectic-proof':undefined,load(id){if(id!=='\0dialectic-proof')return;return `
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
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Log.entryAdded'&&!m.params.entry.url?.endsWith('/favicon.ico'))console.error('Browser log:',JSON.stringify(m.params.entry));if(m.method==='Runtime.exceptionThrown')console.error('Browser exception:',JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},35000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{let r;try{r=await send('Runtime.evaluate',{expression:`(async()=>{const value=await eval(${JSON.stringify(expression)});return value===undefined?undefined:JSON.parse(JSON.stringify(value));})()`,awaitPromise:true,returnByValue:true},sessionId);}catch(e){console.error('Evaluation stalled:',expression.slice(0,220));throw e;}if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1000;i++){if(${condition})return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 const click=async expression=>{const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control: '+${JSON.stringify(expression)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 const button=label=>`[...document.querySelectorAll('.dialectic-app button')].find(e=>e.textContent===${JSON.stringify(label)}&&e.getBoundingClientRect().width)`;
 await send('Runtime.enable',{},sessionId);await send('Log.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic`},sessionId);
 try{await wait('window.proof?.port()?.session() && document.querySelector("[data-dialectic-draft=true]")');}catch(error){report.boot=await evaluate('({url:location.href,html:document.body.innerHTML.slice(0,4000),proof:!!window.proof})');console.error(JSON.stringify(report.boot));throw error;}
 const configure=async()=>{await click(`document.querySelector('.dialectic-provider-settings summary')`);if(!live){await click(`document.querySelector('[aria-label="Session API key"]')`);await send('Input.insertText',{text:'fixture-only-key'},sessionId);}await click(button('Use session settings'));await wait(`document.querySelector('[aria-label="Assistant mode"]')?.value==='live'`);await click(`document.querySelector('.dialectic-provider-settings summary')`);};

 const original='Historical objects acquire different meanings because each generation meets them with fresh concerns, memories, and moral questions. A coin, a uniform, or a ruin is never only what it once was; it is also what later people need it to signify. But meaning is not endlessly free: the object’s material traces resist whatever story we would like to tell. So the real question is not whether objects change, but how interpretation stays accountable to evidence while still remaining alive to the present.';
 // Synthetic native history: AI source at #26, request at #27; no source handle or retrieval recipe in the request.
 await evaluate(`(()=>{for(let i=0;i<26;i++){
  const draft=proof.draft(),kind=i%2?'ai':'human';
  proof.editor.commands.replaceInlineRange(proof.text().key,0,0,i===25?${JSON.stringify(original)}:'Earlier local '+kind+' contribution '+(i+1)+'.');
  proof.editor.commands.setPayloadField(draft.key,'metadata',JSON.parse(JSON.stringify({...draft.payload.metadata,dialectic:{...draft.payload.metadata.dialectic,state:'committed',author:kind,ordinal:i+1,createdUtc:new Date().toISOString(),participant:{...proof.defaultParticipant(String(proof.root().payload.id),kind),name:kind==='ai'?'AI participant':'Local author'}}})));
  proof.editor.commands.insert(proof.draftContribution(),{kind:'at',parentKey:proof.root().key,index:proof.root().children.length});
 }proof.original=proof.port().session().projection.node(proof.committed()[25].children[0]);proof.originalMount=proof.editor.mounts.get(proof.original.key);})()`);
 await configure();
 const request='Return to the passage you wrote about historical objects.\nChoose three short quotations from it and present an annotated commentary. Each quotation should be accurately reproduced and traceable to its original source range through native anchors or references.\nDistinguish the quoted source from your new commentary. Do not invent a transclusion capability if DCP only supports anchors and ordinary text.';
 await click('proof.editor.mounts.get(proof.text().key).focusElement');await send('Input.insertText',{text:request},sessionId);
 await evaluate('proof.snapshots=0;proof.rebuilds=0');await click(button('Submit'));
 const deadline=Date.now()+125000;while(!(await evaluate('proof.committed().length===28'))){const error=await evaluate(`document.querySelector('.dialectic-notice')?.textContent`);if(error)throw Error(error);if(Date.now()>deadline)throw Error('Provider timeout');await new Promise(r=>setTimeout(r,250));}
 report.exchange=await evaluate(`(()=>{const row=proof.committed().at(-1),d=row.payload.metadata.dialectic.dcp,n=proof.port().session().projection.node(proof.original.key);return {request:d.request,response:JSON.parse(d.response),tools:d.tools,attempts:d.provider.attempts,continuity:d.provider.continuity,sourceContribution:proof.committed()[25].payload.metadata.dialectic,sourceId:n.payload.id,sourceText:proof.editor.mounts.get(n.key).focusElement.textContent,marks:n.payload.standoffProperties,definitions:proof.root().payload.linkedAnnotations,references:row.payload.metadata.dialectic.discursiveReferences,identityMap:d.identityMap,annotationRefs:d.annotationRefs,compositionText:proof.editor.mounts.get(row.key).root.textContent,sameMount:proof.editor.mounts.get(n.key)===proof.originalMount,snapshots:proof.snapshots,rebuilds:proof.rebuilds,commitMs:proof.commitMs};})()`);
 const e=report.exchange;
 assert.equal(e.sourceContribution.author,'ai');assert.equal(e.sourceContribution.ordinal,26);
 assert(!e.request.structuralContext.sources.some(s=>s.target?.blockId===e.sourceId),'Source unexpectedly included in initial manifest');
 assert(e.tools.some(t=>['list_text_blocks','search_symposium'].includes(t.call.tool)),'Discovery was not invoked');assert(e.tools.some(t=>t.call.tool==='read_source'),'Source was not read');
 assert(e.response.composition.every(n=>/^new:b[1-9][0-9]*$/.test(n.id)));
 assert(e.response.anchors.every(a=>/^new:r[1-9][0-9]*$/.test(a.id)&&/^src:[A-Za-z0-9_-]{22}:b[1-9][0-9]*$/.test(a.source)));
 assert.equal(e.response.anchors.length,3);assert.equal(new Set(e.response.anchors.map(a=>a.selector.exact)).size,3);
 assert.equal(e.sourceText,original);assert(e.sameMount);assert.equal(e.snapshots+e.rebuilds,0);
 const marks=e.marks.filter(p=>p.type==='dialectic/range-anchor');assert.equal(marks.length,3);
 for(const a of e.response.anchors){
  assert(original.includes(a.selector.exact),'Quote is not literal source text');
  assert(e.compositionText.includes(a.selector.exact),'Requested quote absent from new composition');
  const mark=marks.find(p=>Array.from(original).slice(p.start,p.end+1).join('')===a.selector.exact);assert(mark,'Native range does not match quote');
  assert.equal(e.definitions[mark.annotationId].metadata.dialecticRange.source.blockId,e.sourceId);
  assert.equal(e.identityMap[a.id]?.anchorId,mark.annotationId,'Response alias is not mapped to the native source anchor');
 }
 report.resolutions=await evaluate(`(()=>{const session=proof.port().session(),refs=new proof.DialecticReferences(proof.editor,session.projection,session.rootKey),d=proof.committed().at(-1).payload.metadata.dialectic.dcp,response=JSON.parse(d.response);try{return response.anchors.map(a=>{const r=refs.resolve(d.identityMap[a.id]);return {status:r.status,text:r.text,rangePropertyIds:r.segments?.map(s=>s.id)};});}finally{refs.dispose();}})()`);
 assert.deepEqual(report.resolutions.map(r=>r.status),['resolved','resolved','resolved']);assert.deepEqual(report.resolutions.map(r=>r.text),e.response.anchors.map(a=>a.selector.exact));
 report.undoRedo=await evaluate(`(()=>{proof.editor.repository.undo();const undone=proof.committed().length===27&&(proof.original.payload.standoffProperties??[]).length===0;proof.editor.repository.redo();return {undone,restored:proof.committed().length===28&&(proof.original.payload.standoffProperties??[]).filter(p=>p.type==='dialectic/range-anchor').length===3};})()`);assert(report.undoRedo.undone&&report.undoRedo.restored);
 await writeFile(path.join(outputDir,'browser.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await click(button('Save'));await wait('!proof.native.isDirty(String(proof.root().payload.id))');assert(saved,'Manual Save did not reach isolated transport');
 const nativeIds=await evaluate('proof.committed().map(n=>n.payload.id)');
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic?reload`},sessionId);await wait('window.proof?.committed().length===28');
 report.reloaded=await evaluate(`(()=>{const session=proof.port().session(),refs=new proof.DialecticReferences(proof.editor,session.projection,session.rootKey),d=proof.committed().at(-1).payload.metadata.dialectic.dcp,response=JSON.parse(d.response),source=proof.port().session().projection.node(proof.committed()[25].children[0]);try{return {nativeIds:proof.committed().map(n=>n.payload.id),sourceId:source.payload.id,sourceText:proof.editor.mounts.get(source.key).focusElement.textContent,identityMap:d.identityMap,references:proof.committed().at(-1).payload.metadata.dialectic.discursiveReferences,marks:source.payload.standoffProperties,resolutions:response.anchors.map(a=>{const r=refs.resolve(d.identityMap[a.id]);return {status:r.status,text:r.text};})};}finally{refs.dispose();}})()`);
 assert.deepEqual(report.reloaded.nativeIds,nativeIds);assert.equal(report.reloaded.sourceId,e.sourceId);assert.equal(report.reloaded.sourceText,original);assert.deepEqual(report.reloaded.identityMap,e.identityMap);assert.deepEqual(report.reloaded.references,e.references);assert.deepEqual(report.reloaded.marks,e.marks);assert.deepEqual(report.reloaded.resolutions.map(r=>r.text),e.response.anchors.map(a=>a.selector.exact));assert(report.reloaded.resolutions.every(r=>r.status==='resolved'));
 report.saveReload=true;
 report.outgoingBytes=wire.reduce((n,r)=>n+r.bytes,0);await broker.testLog.flush();await writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({outputDir,tools:e.tools.map(t=>t.call),quotes:e.response.anchors.map(a=>a.selector.exact),attempts:e.attempts.length,sameMount:e.sameMount,snapshots:e.snapshots,rebuilds:e.rebuilds,undoRedo:report.undoRedo,saveReload:report.saveReload}));
}catch(error){report.failure=String(error);await writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));throw error;}finally{socket?.close();browser?.kill('SIGTERM');broker.dispose();await broker.testLog.flush();server?.httpServer?.closeAllConnections?.();let cleanupTimer;await Promise.race([server?.close(),new Promise(resolve=>cleanupTimer=setTimeout(resolve,5000))]);clearTimeout(cleanupTimer);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});await rm(memoryRoot,{recursive:true,force:true,maxRetries:5,retryDelay:100});await rm(brokerFile,{force:true});stop?.();if(!report.failure)process.exit(0);}
