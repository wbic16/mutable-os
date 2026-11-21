// Focused trusted-input qualification. Save transport is isolated in memory.
import {spawn} from 'node:child_process';
import express from 'express';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const stage4b=true,live=process.env.DIALECTIC_LIVE==='1';
const {build,stop}=await import('esbuild');
const brokerFile=path.resolve('node_modules/.cache/dialectic-native-browser.mjs');
await build({stdin:{contents: "export {authoringExamples} from './src/features/dialectic/dcp/authoring.ts';export {createDialecticBroker} from './server/dialectic/broker.ts';export {plainContribution,streamFixture,sse} from './server/dialectic/fixtures.ts';",resolveDir:process.cwd()},outfile:brokerFile,bundle:true,platform:'node',format:'esm',packages:'external'});
const {authoringExamples,createDialecticBroker,plainContribution,streamFixture,sse}=await import(brokerFile);
const wire=[];
const broker=createDialecticBroker(live?{}:{environment:{},fetcher:async(url,init)=>{
 const body=JSON.parse(init.body),request=JSON.parse(body.input[0].content);wire.push({model:body.model});
 const source=request.structuralContext.sources.find(s=>s.kind==='block'&&s.text==='Rain is forecast.');
 const selected=request.structuralContext.sources.filter(s=>request.selectedContext.includes(s.handle));
 const response=structuredClone(authoringExamples[1].response);response.exchange=request.exchange;
 response.replyTargets=selected.map(s=>s.handle);response.anchors[0].source=source.handle;response.anchors[0].revision=source.revision;
 return sse(streamFixture('openai',JSON.stringify(response)));
}});
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
 `;},configureServer(s){const api=express();api.use(broker.router);s.middlewares.use('/api/dialectic',api);s.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/__dialectic')&&!req.url.startsWith('/__dialectic.js')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/__dialectic.js"></script></body></html>');return;}
  if(req.url==='/__saved'){res.end(saved.generation.native);return;}
  if(req.url==='/api/native/save'){let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:saved.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:saved.generation.generation}}}));return;}
  if(req.url?.startsWith('/api/listFolders')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:['isolated']}));return;}next();
 });}}]});await server.listen();await server.watcher.close();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[...(live?[]:['--headless=new']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',d=>{s+=d;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error('Browser exception:',JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},35000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{let r;try{r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);}catch(e){console.error('Evaluation stalled:',expression.slice(0,220));throw e;}if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1000;i++){if(${condition})return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 const click=async expression=>{const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control: '+${JSON.stringify(expression)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 const button=label=>`[...document.querySelectorAll('.dialectic-app button')].find(e=>e.textContent===${JSON.stringify(label)}&&e.getBoundingClientRect().width)`;
 const key=async(key,code,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,modifiers,commands:modifiers===4?({a:['selectAll'],c:['copy']})[key]:undefined,windowsVirtualKeyCode:({c:67,a:65,v:86,x:88,Backspace:8,s:83,z:90,Enter:13,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,End:35,Home:36,' ':32,t:84,d:68,Escape:27})[key]??0},sessionId);};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic`},sessionId);
 await wait('window.proof?.port()?.session() && document.querySelector("[data-dialectic-draft=true]")');


 const add=async(text)=>{await click('proof.editor.mounts.get(proof.text().key).focusElement');await send('Input.insertText',{text},sessionId);await click(button('Submit'));};
 await evaluate('proof.original=proof.text();proof.mount=proof.editor.mounts.get(proof.original.key);proof.retained=proof.port().session()');
 await add('Rain is forecast.');
 const row=n=>`[...document.querySelectorAll('.dialectic-entry')].find(e=>e.querySelector('.dialectic-number')?.textContent==='${String(n).padStart(2,'0')}')`;
 await click(row(1));await click(button('Include in context'));
 await add('We could meet at the library.');await click(row(2));await click(button('Include in context'));
 const prompt='Please exercise native Dialectic structures: address both earlier contributions through discursive references without turning those contributions into arguments. Exactly annotate the earlier sentence "Rain is forecast." as dialectic/claim. Explicitly identify an argument on that passage and a second argument on a new suggestion "Let us meet indoors." in your response; create a directed supports relationship from the forecast argument to the suggestion argument. Produce the actual structures, not just a prose description. Keep the response concise.';
 await add(prompt);await click(row(3));
 const settings=`document.querySelector('.dialectic-provider-settings')`;await click(settings+`.querySelector('summary')`);
 if(live&&process.env.OPENAI_API_KEY){
  await click(button('Use session settings'));await wait(`document.querySelector('[aria-label="Assistant mode"]')?.value==='live'`);
 }else if(live){
  await send('Page.bringToFront',{},sessionId);
  console.log('LIVE_SETTINGS_READY: enter the OpenAI session key in the newly opened Chrome window, then click Use session settings. The authorised qualification request will start automatically. No keys are read by the driver.');
  const deadline=Date.now()+15*60*1000;
  while(!(await evaluate(`document.querySelector('[aria-label="Assistant mode"]')?.value==='live'`))){if(Date.now()>deadline)throw Error('Waiting for live session settings timed out');await new Promise(r=>setTimeout(r,1000));}
 }else{
  await click(`document.querySelector('[aria-label="Session API key"]')`);await send('Input.insertText',{text:'fixture-only-key'},sessionId);await click(button('Use session settings'));await wait(`document.querySelector('[aria-label="Assistant mode"]')?.value==='live'`);
 }
 await click(settings+`.querySelector('summary')`);
 // A bounded unrelated-content fixture, outside the conversation and provider context.
 await evaluate(`(()=>{const state=proof.editor.repository.readState(),root=state.contents[state.placements[state.rootPlacementKey].contentKey],bank=root.children.find(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block');for(let d=0;d<3;d++)proof.editor.commands.insert({id:'unrelated-'+d,type:'document-block',metadata:{documentId:'unrelated-'+d},children:Array.from({length:30},(_,i)=>({id:'unrelated-'+d+'-'+i,type:'standoff-editor-block',text:'Unrelated text. '.repeat(20),standoffProperties:[{id:'mark-'+i,type:'style/bold',start:0,end:8}]}))},{kind:'at',parentKey:bank,index:d+1});proof.otherRecords=Object.values(proof.editor.repository.readState().contents).filter(c=>String(c.payload.id).startsWith('unrelated-'));proof.snapshots=0;proof.rebuilds=0;proof.started=performance.now();})()`);
 await click(button('Ask AI'));
 const deadline=Date.now()+125000;
 while(await evaluate('proof.committed().length<4')){
  const error=await evaluate(`document.querySelector('.dialectic-notice')?.textContent`);if(error)throw Error(error);
  if(Date.now()>deadline)throw Error('Provider exchange timed out');await new Promise(r=>setTimeout(r,500));
 }
 report.exchange=await evaluate(`JSON.parse(JSON.stringify((()=>{const d=proof.committed().at(-1).payload.metadata.dialectic,raw=JSON.parse(d.dcp.response),defs=Object.values(proof.root().payload.linkedAnnotations??{});return {observedMs:performance.now()-proof.started,commitMs:proof.commitMs,snapshots:proof.snapshots,rebuilds:proof.rebuilds,sameMount:proof.editor.mounts.get(proof.original.key)===proof.mount,sameSession:proof.port().session()===proof.retained,unrelatedUnchanged:proof.otherRecords.every(r=>proof.editor.repository.readState().contents[r.key]===r),manifest:d.dcp.request.structuralContext.coverage,returned:{addresses:raw.replyTargets.length,anchors:raw.anchors.length,interpretations:raw.interpretations,arguments:raw.arguments.length,relations:raw.relations},materialised:{addresses:d.discursiveReferences,annotations:d.dcp.annotationRefs,arguments:defs.filter(x=>x.type==='dialectic/argument').length,relations:defs.filter(x=>x.type==='dialectic/argument-relation').map(x=>x.metadata.dialecticArgumentRelation)},receipts:d.dcp.provider.attempts.map(a=>a.receipt),repairs:d.dcp.provider.attempts.filter(a=>a.repair).length,tools:d.dcp.tools.length};})()))`);
 assert.equal(report.exchange.returned.addresses,2);assert.equal(report.exchange.materialised.arguments,2);assert.equal(report.exchange.materialised.relations.length,1);assert.equal(report.exchange.materialised.relations[0].relation,'supports');assert.equal(report.exchange.snapshots+report.exchange.rebuilds,0);assert(report.exchange.sameMount&&report.exchange.sameSession&&report.exchange.unrelatedUnchanged);
 await click(row(4));await wait(`document.querySelector('.dialectic-native-structures')`);
 report.visibleSummary=await evaluate(`document.querySelector('.dialectic-native-structures').textContent`);assert(report.visibleSummary.includes('2 discursive addresses'));
 await writeFile(`docs/development/DIALECTIC_NATIVE_AUTHORING_${live?'LIVE':'FIXTURE'}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await click(`[...document.querySelectorAll('.dialectic-annotation-link')].find(e=>e.textContent.includes('dialectic/claim'))`);await wait(`document.querySelector('[aria-label="Annotation inspection"]')`);
 report.annotationInspection=await evaluate(`document.querySelector('[aria-label="Annotation inspection"]').textContent`);assert(report.annotationInspection.includes('Rain is forecast.'));assert(report.annotationInspection.includes('Authored by ai'));
 await wait(`proof.editor.mounts.get(proof.original.key).root.querySelector('path[fill="#f3cf7c"]')?.getAttribute('d')`);
 report.nativeRangeHighlight=await evaluate(`proof.editor.decorations.nodes[proof.original.key].some(d=>d.owner.startsWith('dialectic:')&&d.range.start===0&&d.range.end===17)`);
 assert(report.nativeRangeHighlight);
 await writeFile(`docs/development/DIALECTIC_NATIVE_AUTHORING_${live?'LIVE':'FIXTURE'}_INSPECTION.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));

 await click(row(4));await click(`[...document.querySelectorAll('.dialectic-native-structures button')].find(e=>e.textContent.includes('supports'))`);await wait(`document.querySelector('[aria-label="Directed relationship"]')`);report.relationshipInspection=await evaluate(`document.querySelector('[aria-label="Directed relationship"]').textContent`);
 await click(button('Undo'));await wait('proof.committed().length===3');assert.equal(await evaluate('Object.keys(proof.root().payload.linkedAnnotations??{}).length'),0);
 await click(button('Redo'));await wait('proof.committed().length===4');report.undoRedo=true;
 await click(row(4));
 await click('[...document.querySelectorAll(".workspace-presentations button")].find(e=>e.textContent==="Textual")');await wait(`document.querySelector('.dialectic-textual .dialectic-native-structures')`);report.textual=true;
 await evaluate(`proof.editor.commandRegistry.execute('workspace.presentation.desktop',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);await wait(`proof.session.presentation.active()==='desktop'`);assert(await evaluate('proof.port().session()===proof.retained'));
 await click(button('Save'));await wait('!proof.native.isDirty(String(proof.root().payload.id))');assert(saved);
 const ids=await evaluate('proof.committed().map(n=>n.payload.id)');await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic?reload`},sessionId);await wait('window.proof?.committed().length===4');assert.deepEqual(await evaluate('proof.committed().map(n=>n.payload.id)'),ids);
 await click(row(4));await wait(`document.querySelector('.dialectic-native-structures')`);assert((await evaluate(`document.querySelector('.dialectic-native-structures').textContent`)).includes('2 annotations'));
 report.saveReload=true;report.liveProvider=live;report.requested=prompt;
 await writeFile(`docs/development/DIALECTIC_NATIVE_AUTHORING_${live?'LIVE':'FIXTURE'}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{socket?.close();browser?.kill('SIGTERM');broker.dispose();await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});await rm(brokerFile,{force:true});stop();}
