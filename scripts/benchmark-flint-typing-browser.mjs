// Profile typing in the real Flint shell using an in-memory copy of a native Document.
// Reads the fixture only; never saves it. BENCHMARK_DOCUMENT_PATH selects another
// native resource; BENCHMARK_VAULT_SIZE adds unopened entries to an in-memory
// vault (e.g. 1000). BENCHMARK_OUTPUT selects the artifact directory.
// BENCHMARK_GLOSS_RELATIONSHIPS=false disables the relationship index for paired checks.
// BENCHMARK_GLOSS=false disables Gloss presentation for paired typing checks.
// BENCHMARK_CARET_MODE=normal|block-focus|sentence-focus|reading-spotlight selects session focus.
// BENCHMARK_CARET_MODES=false disables the feature for comparison.
// BENCHMARK_POINTER_SPOTLIGHT=1 enables and verifies the mouse-controlled lighting.
// BENCHMARK_NATIVE_GPU=1 uses Chrome's default GPU instead of software SwiftShader.
// BENCHMARK_STANDOFF_RENDERING=false selects the previous rendering path.
// BENCHMARK_ANNOTATION_RANGE_EVENTS=false disables caret emphasis for comparison.
// BENCHMARK_DETERMINISTIC_ACADEMIC=false disables the new academic handlers.
// BENCHMARK_WEB_RESOURCES=false disables G; BENCHMARK_WEB_SOURCE=1 mounts a captured web preview.
// BENCHMARK_ACADEMIC_SOURCE=1 mounts an OCR source beside the measured native paragraph.
// BENCHMARK_MUTABLE_CLIPBOARD=false selects legacy clipboard routing for comparison.
// BENCHMARK_FLINT_RECENTS=false disables recent-document navigation history for comparison.
// BENCHMARK_LIST_PREFIX=1 additionally measures matched conversion in the intact native Document.
// BENCHMARK_TASK_PREFIX=1 measures the full fresh task continuation and final conversion.
// BENCHMARK_LIST_PREFIX_TEXT selects the marker (default "-"); BENCHMARK_LIST_PREFIX_RICH=1 adds annotations and nested Blocks.
// BENCHMARK_AUTOCOMPLETE=false disables completion for paired input-cost checks.
// BENCHMARK_LER=live|review opens LER with an isolated resolver. BENCHMARK_LER_INSIDE=1 types inside a linked span.
// BENCHMARK_TAB_ORIENTATION=horizontal|vertical sets existing TabRows before measurement.
// Native binding/listing responses are local stubs: no user vault is opened.
// Reports handler and queued-caret costs separately; headless animation-frame
// timings are diagnostic, not an input-to-display latency guarantee.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/flint-typing';await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const proofPlugin={
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
 const openSession=async()=>{
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{identityDomCharacterAddressing:${process.env.BENCHMARK_DOM_PRODUCTION==='1'?'window.__identityDom':process.env.BENCHMARK_IDENTITY_DOM!=='false'},residentCellBoundaries:${process.env.BENCHMARK_RESIDENT_CELLS!=='false'},compactCanonicalText:${process.env.BENCHMARK_COMPACT==='1'},glossGraphNavigation:${process.env.BENCHMARK_GLOSS_NAVIGATION!=='false'},glossArgumentExplorer:${process.env.BENCHMARK_GLOSS_ARGUMENT!=='false'},glossMermaidGraph:${process.env.BENCHMARK_GLOSS_MERMAID!=='false'},glossRelationshipAuthoring:${process.env.BENCHMARK_GLOSS_RELATIONSHIP_AUTHORING!=='false'},glossRelationships:${process.env.BENCHMARK_GLOSS_RELATIONSHIPS!=='false'},glossMode:${process.env.BENCHMARK_GLOSS!=='false'},scryProvisionalCells:${process.env.BENCHMARK_PROVISIONAL_SCRY!=='false'},autocompleteWorkstation:${process.env.BENCHMARK_AUTOCOMPLETE!=='false'},everydayWebResources:${process.env.BENCHMARK_EVERYDAY_WEB!=='false'},webResourceViewers:${process.env.BENCHMARK_WEB_RESOURCES!=='false'},deterministicAcademicResources:${process.env.BENCHMARK_DETERMINISTIC_ACADEMIC!=='false'},flintRecentDocuments:${process.env.BENCHMARK_FLINT_RECENTS!=='false'},webPublishing:${process.env.BENCHMARK_WEB_PUBLISHING!=='false'},applicationServices:${process.env.BENCHMARK_APPLICATION_SERVICES!=='false'},documentInterchange:${process.env.BENCHMARK_DOCUMENT_INTERCHANGE!=='false'},mutableClipboard:${process.env.BENCHMARK_MUTABLE_CLIPBOARD!=='false'},nativeDocumentPersistence:${!!process.env.BENCHMARK_VAULT_SIZE},nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true,annotationRangeEvents:${process.env.BENCHMARK_ANNOTATION_RANGE_EVENTS!=='false'},caretModes:${process.env.BENCHMARK_CARET_MODES!=='false'},standoffPropertyRendering:${process.env.BENCHMARK_STANDOFF_RENDERING!=='false'}}});
 const editor=session.editor;
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const {admitNative}=await import('/src/persistence/native-resource.ts');
 admitNative(editor.repository,new Uint8Array(await (await fetch('/__letter')).arrayBuffer()),editor.repository.readState().placements[bank].contentKey);
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const native=(await import('/src/persistence/native-session.ts')).nativeDocumentSession(editor);
 if(${!!process.env.BENCHMARK_VAULT_SIZE}){
   const id=${JSON.stringify(JSON.parse(fixture).resourceId)},location={folder:'benchmark',filename:'letter.ink'};
   native.bind(id,location,{nativeHash:null,markdownHash:null,generation:null});
   const listing={vault:'benchmark',folders:['benchmark'],documents:[...Array.from({length:${Number(process.env.BENCHMARK_VAULT_SIZE)||0}},(_,i)=>({resourceId:'unopened-'+i,title:'Unopened letter '+i,location:{folder:'benchmark',filename:'letter-'+i+'.ink'},state:'paired'})),{resourceId:id,title:'Michelangelo letter',location,state:'paired'}],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true};
   native.defaultVault=async()=> 'benchmark';native.establishVault=async()=>({vault:'benchmark'});native.browseVault=async()=>listing;native.discoverVault=async()=>listing;
 }
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const mountWork=${process.env.BENCHMARK_CELL_QUALIFICATION==='1'}?(await import('/src/block-tree/cell-diagnostics.ts')).observeCellWork():undefined;
 const mountStart=performance.now();
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 if(${!!process.env.BENCHMARK_TAB_ORIENTATION})for(const row of Object.values(session.projection.state.nodes).filter(n=>n.viewType==='tab-row-block'))editor.commandRegistry.execute('tabs.orientation.'+${JSON.stringify(process.env.BENCHMARK_TAB_ORIENTATION??'horizontal')},{targetKey:row.key,args:undefined});
 window.proof={editor,session,dispose,host,native,mountMs:performance.now()-mountStart,mountWork:mountWork?.counts};mountWork?.stop();
 };
 if(${process.env.BENCHMARK_DOM_RETENTION==='1'}) window.openQualificationSession=openSession;
 await openSession();
 `;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url==='/__letter'){res.setHeader('Content-Type','application/json');res.end(fixture);return;}if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
};
const production=process.env.BENCHMARK_DOM_PRODUCTION==='1';
const vite=production
  ? await (await import('../experiments/dom-addressing/production.mjs')).serveProduction(proofPlugin,fixture,profile)
  : await createServer({plugins:[proofPlugin],server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:()=>true}}});
if(!production)await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[...(process.env.BENCHMARK_HEADED==='1'?[]:['--headless=new']),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.BENCHMARK_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket,serviceLoad;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},process.env.BENCHMARK_CELL_QUALIFICATION==='1'?180000:45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 const bind=`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)).sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`;
 await evaluate(bind);
 if(process.env.BENCHMARK_CELL_INVENTORY==='1')await evaluate(`(async()=>{
   const {liveDocumentEntities}=await import('/src/application/live-document-entities.ts');
   const root=proof.view.state.nodes[proof.view.state.rootKey];
   proof.inventory=liveDocumentEntities(proof.editor,root.contentKey);
   if(!proof.inventory.read().rows.length)throw Error('Missing fixture entity mentions');
   proof.formUpdates=0;proof.inventory.subscribe(()=>proof.formUpdates++);
 })()`);
 if(process.env.BENCHMARK_EVERYDAY_SOURCE==='1'){await evaluate(`proof.editor.commands.insert({id:crypto.randomUUID(),type:'mutable/web-resource-block',web:{version:1,snapshotId:crypto.randomUUID(),source:'mutable-file:Calendar.ics',capturedAt:'2026-10-19T00:00:00Z',asset:{kind:'managed',cavernId:'benchmark',assetId:'sha256:'+'a'.repeat(64)},projection:{provider:'calendar',status:'captured',title:'Retained event collection',diagnostics:[],everyday:{version:1,identity:{type:'local-file'},fields:[],items:Array.from({length:25},(_,i)=>({title:'Event '+i,fields:[{label:'Start',value:'2026-10-20T10:00:00 Australia/Brisbane',provenance:'VEVENT/DTSTART'}]}))}}}},{kind:'after',anchorKey:proof.text.key});`);await wait('document.querySelector(".web-resource-card")');}
 if(process.env.BENCHMARK_WEB_SOURCE==='1'){await evaluate(`proof.editor.commands.insert({id:crypto.randomUUID(),type:'mutable/web-resource-block',web:{version:1,snapshotId:crypto.randomUUID(),source:'https://example.org/benchmark',capturedAt:'2026-10-19T00:00:00Z',asset:{kind:'managed',cavernId:'benchmark',assetId:'sha256:'+'a'.repeat(64)},projection:{provider:'web',status:'captured',title:'Retained preview',description:'No remote work while typing.',diagnostics:[]}}},{kind:'after',anchorKey:proof.text.key});`);await wait('document.querySelector(".web-resource-card")');}
 if(process.env.BENCHMARK_ACADEMIC_SOURCE==='1'){await evaluate(`(async()=>{const {alto}=await import('/src/academic/fixtures.ts'),{parseOcr}=await import('/src/academic/ocr.ts');proof.editor.commands.insert({id:crypto.randomUUID(),type:'mutable/academic-resource-block',academicArchive:true,academic:{version:1,kind:'deterministic',snapshotId:crypto.randomUUID(),resourceId:'benchmark-source',source:'benchmark.alto',endpoint:'local-file',retrievedAt:'2026-10-19T00:00:00Z',asset:{kind:'managed',cavernId:'benchmark',assetId:'sha256:'+'a'.repeat(64)},format:'alto',projection:JSON.parse(JSON.stringify(parseOcr(alto)))}},{kind:'after',anchorKey:proof.text.key});})()`);await wait('document.querySelector(".mutable-academic-resource")');}
 if(process.env.BENCHMARK_VAULT_SIZE)await wait("proof.root.querySelectorAll('.flint-tree-document').length>0");
 await evaluate('new Promise(r=>setTimeout(r,300))');
 if(process.env.BENCHMARK_GLOSS_PRESENTATION==='1'){
  await evaluate(`document.querySelector('[aria-label="Gloss Mode"]').click()`);await wait('document.querySelector(".gloss-register-row")');
  await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 }
 if(process.env.BENCHMARK_GLOSS_ARGUMENT==='1'){await evaluate(`[...document.querySelectorAll('.gloss-view-tabs button')].find(b=>b.textContent==='Argument').click()`);await wait(`document.querySelector('.gloss-argument-row')`);}
 if(process.env.BENCHMARK_GLOSS_GRAPH==='1'){await evaluate(`[...document.querySelectorAll('.gloss-view-tabs button')].find(b=>b.textContent==='Graph').click()`);await wait(`document.querySelector('.gloss-graph iframe')?.dataset.rendered==='true'`);}
 await evaluate(`proof.flow.focus();proof.mount.restoreInlineSelection({anchor:100,head:100});proof.editor.caretModes.select(${JSON.stringify(process.env.BENCHMARK_CARET_MODE??'normal')})`);
 await wait("proof.editor.caretModes.active()==='normal' || proof.flow.dataset.readingSpotlight || (proof.flow.dataset.caretFocus && proof.root.querySelector('[data-caret-scope]'))");
 const presentation=await evaluate(`({mode:proof.editor.caretModes.active(),scoped:proof.root.querySelectorAll('[data-caret-scope]').length,opacities:[...new Set([...proof.flow.children].map(cell=>getComputedStyle(cell).opacity))],focus:!!proof.flow.dataset.caretFocus,otherFlows:[...proof.root.querySelectorAll('[data-caret-scope]:not([data-caret-focus])')].map(flow=>getComputedStyle(flow).opacity)})`);
 console.log('Caret presentation:',JSON.stringify(presentation));
 if(presentation.mode!=='normal' && presentation.mode!=='reading-spotlight'){
   assert.ok(presentation.scoped>0,'focus styling must reach visible text in the real Flint document');
   assert.ok(presentation.focus,'the native caret Block must be focused');
   assert.ok(presentation.otherFlows.includes(presentation.mode==='block-focus'?'0.35':'0.3'),'other visible text flows must fade');
   assert.ok(presentation.opacities.includes('1'),'focused text remains fully visible');
   if(presentation.mode==='sentence-focus')assert.ok(presentation.opacities.includes('0.3'),'other sentences in the same Block must fade');
 }
 if(presentation.mode==='reading-spotlight'){
   const spotlight=await evaluate(`(proof.spotlightGeometry=()=>{
     const css=getComputedStyle(proof.flow),box=proof.flow.getBoundingClientRect();
     const boundary=proof.mount.inlineBoundary(100),range=document.createRange();range.setStart(boundary.node,boundary.offset);range.collapse(true);const caret=[...range.getClientRects()].find(r=>r.height>0);
     const centre=css.maskImage.match(/at ([\\d.-]+)px ([\\d.-]+)px/);
     const x=Number(centre?.[1])+box.left;
     const y=Number(centre?.[2])+box.top;
     return {mask:css.maskImage,x,y,caretX:caret.x+caret.width/2,caretY:caret.y+caret.height/2,chrome:[...proof.root.querySelectorAll('.document-style-bar,.reactive-annotation-layer,.reactive-search-layer,button')].every(e=>getComputedStyle(e).maskImage==='none')};
   })()`);
   console.log('Spotlight presentation:',JSON.stringify(spotlight));
   assert.ok(spotlight.mask.includes('radial-gradient'));
   assert.ok(Math.abs(spotlight.x-spotlight.caretX)<1 && Math.abs(spotlight.y-spotlight.caretY)<1,'spotlight must centre on the native caret');
   assert.ok(spotlight.chrome,'controls and SVG layers must remain unmasked');
 }
 if(process.env.BENCHMARK_POINTER_SPOTLIGHT==='1'){
   await evaluate(`proof.root.querySelector('[aria-label="Pointer Spotlight"]').click();proof.pointerHost=proof.flow.closest('.reactive-document-occurrence__content')`);
   const point=await evaluate(`(()=>{const r=proof.flow.getBoundingClientRect();return {x:r.left+r.width*.65,y:r.top+15}})()`);
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point},sessionId);
   await wait("proof.pointerHost.querySelector('.pointer-spotlight:not([hidden])')");
   const overlay=await evaluate(`(()=>{const e=proof.pointerHost.querySelector('.pointer-spotlight'),r=e.getBoundingClientRect(),bar=proof.root.querySelector('.document-style-bar').getBoundingClientRect(),css=getComputedStyle(e),p=css.backgroundImage.match(/at ([\\d.-]+)px ([\\d.-]+)px/);return {top:r.top,barBottom:bar.bottom,background:css.backgroundImage,pointerEvents:css.pointerEvents,x:r.left+Number(p[1]),y:r.top+Number(p[2]),hit:document.elementFromPoint(${point.x},${point.y})===e}})()`);
   assert.ok(overlay.top>=overlay.barBottom,'toolbar must remain outside lighting');
   assert.equal(overlay.pointerEvents,'none');assert.equal(overlay.hit,false);
   assert.ok(overlay.background.includes('0.65'));assert.ok(Math.abs(overlay.x-point.x)<1&&Math.abs(overlay.y-point.y)<1);
   const movement=await evaluate(`(async()=>{let reads=0,changes=0,snapshots=0;const host=proof.pointerHost,read=host.getBoundingClientRect.bind(host),snapshot=proof.editor.repository.snapshot.bind(proof.editor.repository),release=proof.editor.repository.subscribeChanges(()=>changes++);host.getBoundingClientRect=()=>{reads++;return read()};proof.editor.repository.snapshot=()=>{snapshots++;return snapshot()};for(let i=0;i<100;i++)proof.flow.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:${point.x}+i/10,clientY:${point.y},pointerType:'mouse'}));await new Promise(r=>requestAnimationFrame(r));release();host.getBoundingClientRect=read;proof.editor.repository.snapshot=snapshot;return {reads,changes,snapshots}})()`);
   assert.deepEqual(movement,{reads:0,changes:0,snapshots:0});console.log('Pointer spotlight geometry, hit-testing and bounded movement: passed');
 }
 if(process.env.BENCHMARK_LER){
  await evaluate(`(async()=>{
   const {registerStandaloneEntityService}=await import('/src/application/entity-service.ts');
   const entity={id:'benchmark-entity',name:'Benchmark entity',revision:0,aliases:[]};proof.lerReads=0;proof.lerSearches=0;
   proof.stopLer=registerStandaloneEntityService(proof.editor,()=>({get:async()=>{proof.lerReads++;return entity;},search:async(q,signal)=>{proof.lerSearches++;return {candidates:[{...entity,evidence:[]}],complete:true,diagnostics:[],current(){signal.throwIfAborted();}};},dispose(){}}));
   proof.editor.linkedAnnotations.createBatch([[proof.editor.textRanges.snapshot(proof.text.key,0,5)]],'codex/entity-reference',entity.id,{entityName:entity.name},proof.editor.repository.state.revision,'Benchmark link');
   proof.mount.restoreInlineSelection({anchor:0,head:5});await proof.editor.commandRegistry.execute('entity.open',{targetKey:proof.text.key,args:undefined});
  })()`);
  await wait('document.querySelector(".ler-instrument [role=option]")');
  if(process.env.BENCHMARK_LER==='live')await evaluate(`(()=>{const scope=document.querySelector('[aria-label="Entity scope"]');scope.value='live';scope.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  else await evaluate(`(()=>{const panel=document.querySelector('.ler-instrument');panel.querySelector('[role=listbox]').dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}));})()`);
  await evaluate('new Promise(r=>setTimeout(r,350))');
  await evaluate(`proof.lerReads=0;proof.lerSearches=0;proof.editor.focus.request(proof.text.key);proof.flow.focus();proof.mount.restoreInlineSelection({anchor:${process.env.BENCHMARK_LER_INSIDE==='1'?2:100},head:${process.env.BENCHMARK_LER_INSIDE==='1'?2:100}})`);
 }
 if(process.env.BENCHMARK_SKIP_SCREENSHOT!=='1'){const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,'caret-mode.png'),Buffer.from(screenshot.data,'base64'));}else await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const sampleCpu=process.env.BENCHMARK_SKIP_CPU_PROFILE!=='1';
 if(sampleCpu){await send('Profiler.enable',{},sessionId);await send('Profiler.setSamplingInterval',{interval:200},sessionId);await send('Profiler.start',{},sessionId);}
 if(process.env.BENCHMARK_PUBLICATION_LOAD==='1')serviceLoad=await (await import('./publication-typing-load.mjs')).startPublicationTypingLoad();
 if(process.env.BENCHMARK_APPLICATION_SERVICE_LOAD==='1')serviceLoad=await (await import('./application-service-typing-load.mjs')).startServiceTypingLoad();
 const longProbe=process.env.BENCHMARK_CELL_LONG==='1';
 const samplesPerTrial=longProbe?8:40;
 const sampleTyping=()=>evaluate(`(async()=>{
   const {editor,flow,mount}=proof;const before=mount.captureText();
   let statusReads=0;const status=proof.native.status;proof.native.status=(...args)=>{statusReads++;return status.apply(proof.native,args)};
   let snapshots=0;const snapshot=editor.repository.snapshot;editor.repository.snapshot=()=>{snapshots++;return snapshot.call(editor.repository)};
   let workerStarts=0;const OriginalWorker=window.Worker;window.Worker=new Proxy(OriginalWorker,{construct(target,args){workerStarts++;return Reflect.construct(target,args)}});
   let serviceRequests=0;const request=window.fetch;window.fetch=(...args)=>{if(String(args[0]).includes('/api/services/'))serviceRequests++;return request(...args)};
   const graph=[...document.querySelectorAll('.gloss-presenting')].map(e=>e.glossIndex?.relationships).find(Boolean),graphBefore=graph?{...graph.diagnostics}:undefined;
   const graphUI=document.querySelector('.gloss-presenting')?.glossGraphDiagnostics,uiBefore=graphUI?{generations:graphUI.generations,renders:graphUI.renders}:undefined;
   const argUI=document.querySelector('.gloss-presenting')?.glossArgumentDiagnostics,argBefore=argUI?{branchReads:argUI.branchReads,edgesInspected:argUI.edgesInspected,rowMounts:argUI.rowMounts,rankPasses:argUI.rankPasses}:undefined;
   const sync=[],settled=[],frames=[];
   for(let i=0;i<${samplesPerTrial};i++){
     const start=performance.now();
     ${process.env.BENCHMARK_CELL_TRACE==='1'?"performance.mark('qualification-dispatch-start');":''}
     flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:i%2?'deleteContentBackward':'insertText',data:i%2?null:'a'}));sync.push(performance.now()-start);
     ${process.env.BENCHMARK_CELL_TRACE==='1'?"performance.mark('qualification-dispatch-end');":''}
     await Promise.resolve();settled.push(performance.now()-start);
     await new Promise(r=>requestAnimationFrame(r));frames.push(performance.now()-start);
   }
   const stats=values=>{const xs=[...values];xs.sort((a,b)=>a-b);return {median:xs[Math.floor(xs.length/2)],p95:xs[Math.floor(xs.length*.95)],max:xs.at(-1)}};
   window.fetch=request;window.Worker=OriginalWorker;proof.native.status=status;editor.repository.snapshot=snapshot;
   return {rawSamples:${process.env.BENCHMARK_CELL_QUALIFICATION==='1'}?{sync,settled,frames}:undefined,argumentWork:argUI?Object.fromEntries(Object.keys(argBefore).map(k=>[k,argUI[k]-argBefore[k]])):null,diagramWork:graphUI?{generations:graphUI.generations-uiBefore.generations,renders:graphUI.renders-uiBefore.renders}:null,graphWork:graph?Object.fromEntries(Object.entries(graph.diagnostics).map(([k,v])=>[k,v-graphBefore[k]])):null,lerOpen:!!document.querySelector('.ler-instrument'),lerReads:proof.lerReads??0,lerSearches:proof.lerSearches??0,webViews:document.querySelectorAll('.web-resource-card').length,workerStarts,academicViews:document.querySelectorAll('.mutable-academic-resource').length,serviceRequests,pointerSpotlight:editor.pointerSpotlight.active(),caretMode:editor.caretModes.active(),characters:before.length,paragraphs:proof.root.querySelectorAll('.reactive-standoff-flow').length,sync:stats(sync),settled:stats(settled),frame:stats(frames),snapshots,statusReads,vaultRows:proof.root.querySelectorAll('.flint-tree-document').length,restored:mount.captureText()===before};
 })()`);
 const cellMeasurements = process.env.BENCHMARK_CELL_MEASUREMENTS === '1';
 const collectedHeap = async () => {
   await send('HeapProfiler.collectGarbage',{},sessionId);
   return (await send('Runtime.getHeapUsage',{},sessionId)).usedSize;
 };
 if (cellMeasurements) await evaluate(`(() => {
   proof.residentSplices = 0;
   proof.stopSpliceCounter = proof.editor.repository.subscribeChanges(change => {
     if (change.residentPayload) proof.residentSplices++;
   });
 })()`);
 let scrolling;
 if(process.env.BENCHMARK_CELL_MEMORY==='1'){
   const heap=()=>collectedHeap();
   const before=await heap();
   scrolling=await evaluate(`(async()=>{
     const diag=(await import('/src/block-tree/cell-diagnostics.ts')).observeCellWork();
     const revision=proof.editor.repository.state.revision;
     const list=proof.flow.closest('[data-virtual-text-flow]');
     if(!list)throw Error('Multi-block fixture must mount a virtual text flow');
     const parentKey=list.getAttribute('data-virtual-text-flow');
     let panel=proof.editor.documentSessions?.forNode(parentKey)?.host.port?.scrollport;
     if(!panel){panel=list.parentElement;while(panel&&!/(auto|scroll)/.test(getComputedStyle(panel).overflowY))panel=panel.parentElement;}
     if(!panel)throw Error('Missing virtual scrollport');
     const original=panel.style.cssText,was=panel.scrollTop, indices=()=>Array.from(list.querySelectorAll(':scope > [data-index]'),e=>Number(e.dataset.index));
     const beforeIndices=indices();
     panel.style.cssText+=';height:240px!important;min-height:0!important;max-height:240px!important;overflow-y:auto!important;';
     panel.scrollTop=panel.scrollHeight;
     await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     const distance=Math.abs(panel.scrollTop-was),afterIndices=indices();
     panel.style.cssText=original;panel.scrollTop=was;
     await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     diag.stop();return {revisionDelta:proof.editor.repository.state.revision-revision,work:diag.counts,distance,scroller:panel.className,beforeIndices,afterIndices};
   })()`);
   scrolling.heapBefore=before;scrolling.heapAfter=await heap();
   assert.equal(scrolling.revisionDelta,0);assert.equal(scrolling.work.allocations,0);assert.ok(scrolling.distance>0);assert.ok(scrolling.afterIndices.some(i=>!scrolling.beforeIndices.includes(i)));
 }
 const heapBefore = cellMeasurements ? await collectedHeap() : undefined;
 const qualify=process.env.BENCHMARK_CELL_QUALIFICATION==='1';
 const metrics=async()=>Object.fromEntries((await send('Performance.getMetrics',{},sessionId)).metrics.map(m=>[m.name,m.value]));
 if(qualify)await send('Performance.enable',{},sessionId);
 if(qualify){
   await evaluate("(async()=>{proof.work=(await import('/src/block-tree/cell-diagnostics.ts')).observeCellWork()})()");
 }
 const metricsBefore=qualify?await metrics():undefined;
 const stopTrace=process.env.BENCHMARK_CELL_TRACE==='1' ? await (await import('../experiments/lightweight-cells/qualification/trace.mjs')).traceTyping(socket,send,samplesPerTrial) : undefined;
 const result=await sampleTyping();
 if(stopTrace)await writeFile(path.join(artifacts,'trace.json'),JSON.stringify(await stopTrace()));
 if(qualify){
   result.environment={browser:(await send('Browser.getVersion')).product,runtime:process.version,production};
   result.options={identityDom:process.env.BENCHMARK_IDENTITY_DOM!=='false',longProbe,sampleCpu,headless:process.env.BENCHMARK_HEADED!=='1',defaultGPU:process.env.BENCHMARK_NATIVE_GPU==='1',trace:!!stopTrace,
     memory:process.env.BENCHMARK_CELL_MEMORY==='1',inventory:process.env.BENCHMARK_CELL_INVENTORY==='1',samplesPerTrial};
   if(process.env.BENCHMARK_NATIVE_GPU==='1') {
     const {gpu}=await send('SystemInfo.getInfo');
     result.gpu={devices:gpu.devices.map(d=>({vendor:d.vendorString,device:d.deviceString})),
       renderer:gpu.auxAttributes?.glRenderer,compositing:gpu.featureStatus?.gpu_compositing};
   }
   result.boundary=await evaluate("proof.work.stop();({mountMs:proof.mountMs,mount:proof.mountWork,typing:proof.work.counts})");
   if(process.env.BENCHMARK_CELL_INVENTORY==='1')result.formUpdates=await evaluate('proof.formUpdates');
   const after=await metrics();
   result.browserCosts=Object.fromEntries(['LayoutCount','LayoutDuration','RecalcStyleCount','RecalcStyleDuration','ScriptDuration','TaskDuration'].map(k=>[k,after[k]-metricsBefore[k]]));
 }
 if (cellMeasurements) {
   result.heapGrowthBytes = await collectedHeap() - heapBefore;
   result.residentSplices = await evaluate('proof.stopSpliceCounter(); proof.residentSplices');
   assert.equal(result.residentSplices, process.env.BENCHMARK_RESIDENT_CELLS !== 'false' ? samplesPerTrial : 0);
   result.properties = await evaluate('proof.text.payload.standoffProperties.length');
   result.resident = await evaluate('!!proof.editor.repository.residentAnnotations(proof.text.contentKey)');
   assert.equal(result.resident, process.env.BENCHMARK_RESIDENT_CELLS !== 'false');
 }
 const cpu=sampleCpu?(await send('Profiler.stop',{},sessionId)).profile:{nodes:[],samples:[],timeDeltas:[]};
 if(sampleCpu)await writeFile(path.join(artifacts,'typing.cpuprofile'),JSON.stringify(cpu));
 const nodeById=new Map(cpu.nodes.map(n=>[n.id,n]));const totals=new Map();
 for(let i=0;i<cpu.samples.length;i++){const n=nodeById.get(cpu.samples[i]);const f=n.callFrame;const key=f.functionName+' '+f.url.replace(/^http[^/]+\/\//,'')+':'+f.lineNumber;totals.set(key,(totals.get(key)??0)+(cpu.timeDeltas[i]??0)/1000);}
 const hottest=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,35);console.log(JSON.stringify({result,hottest},null,2));
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({result,hottest},null,2));
 if(process.env.BENCHMARK_GLOSS_NAVIGATION_COMPARE==='1'){
  const comparison=[];
  for(const enabled of [false,true,false,true]){
   await evaluate(`(()=>{proof.editor.features.glossGraphNavigation=${enabled};const tabs=[...document.querySelectorAll('.gloss-view-tabs button')];tabs.find(b=>b.textContent==='References').click();tabs.find(b=>b.textContent==='Graph').click();})()`);
   await wait('document.querySelector(".gloss-graph iframe[data-rendered=true]")');
   await evaluate(`proof.editor.focus.request(proof.text.key);proof.flow.focus();proof.mount.restoreInlineSelection({anchor:100,head:100})`);
   const measured=await sampleTyping();assert.equal(measured.snapshots,0);assert.ok(Object.values(measured.diagramWork).every(n=>n===0));assert.ok(Object.values(measured.graphWork).every(n=>n===0));
   comparison.push({enabled,...measured});
  }
  await writeFile(path.join(artifacts,'navigation-comparison.json'),JSON.stringify(comparison,null,2));console.log('Same-browser navigation comparison:',JSON.stringify(comparison));
 }
 if(result.argumentWork)assert.ok(Object.values(result.argumentWork).every(n=>n===0),'Typing must perform zero Argument traversal, row mounting or ranking');
 if(result.diagramWork)assert.ok(Object.values(result.diagramWork).every(n=>n===0),'Typing must perform zero Mermaid generation/rendering');
 if(result.graphWork)assert.ok(Object.values(result.graphWork).every(n=>n===0),'Typing must perform zero relationship index work');
 assert.ok(result.restored);assert.equal(result.snapshots,0);assert.equal(result.serviceRequests,0);assert.equal(result.workerStarts,0);
 if(process.env.BENCHMARK_LER){assert.ok(result.lerOpen);assert.equal(result.lerReads,0);assert.equal(result.lerSearches,0);}
 if(serviceLoad){console.log('Concurrent application-service workload:',JSON.stringify(serviceLoad.status()));await serviceLoad.stop();serviceLoad=undefined;}
 if(process.env.BENCHMARK_VAULT_SIZE)assert.ok(result.statusReads<=80,'40 edits must not read status once per vault row');

 if(process.env.BENCHMARK_LIST_PREFIX==='1'){
  const prefix=await evaluate(`(async()=>{
   const {editor}=proof,viewId=proof.text.viewId,task=${process.env.BENCHMARK_TASK_PREFIX==='1'},token=${JSON.stringify(process.env.BENCHMARK_TASK_PREFIX==='1'?'- [x]':process.env.BENCHMARK_LIST_PREFIX_TEXT??'-')},initial=task?'-':token;
   const rich=${process.env.BENCHMARK_LIST_PREFIX_RICH==='1'},annotations=[{id:crypto.randomUUID(),type:'style/bold',start:0,end:initial.length-1}];
   const placement=editor.commands.insert({id:crypto.randomUUID(),type:'standoff-editor-block',text:initial,...rich?{standoffProperties:annotations,children:[{id:crypto.randomUUID(),type:'container-block',children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text:'Retained nested content. '.repeat(10)}]}],relation:{leftMargin:{id:crypto.randomUUID(),type:'left-margin-block',children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text:'Retained annotation note.'}]}}}:{}},{kind:'after',anchorKey:proof.text.key});
   const documentCharacters=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block').reduce((sum,n)=>sum+n.inlineContent.length,0);
   const node=()=>editor.nodeForPlacementInView(placement,viewId),mount=()=>editor.mounts.get(node().key);
   const sync=[],settled=[],frames=[],continuations=[];let snapshots=0,matchedSnapshots=0;
   const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=()=>{snapshots++;return snapshot()};
   for(let i=0;i<22;i++){
    if(i)editor.commands.replaceInlineRange(node().key,0,node().inlineContent.length,initial);
    if(rich)editor.commands.setPayloadField(node().key,'standoffProperties',annotations);
    await new Promise(r=>requestAnimationFrame(r));mount().focus();mount().restoreInlineSelection({anchor:initial.length,head:initial.length});
    const beforeSnapshots=snapshots;let continuation=0;
    if(task)for(const character of [' ','[','x',']']){
      const t=performance.now();mount().focusElement.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:character}));continuation+=performance.now()-t;
      await Promise.resolve();await Promise.resolve();
    }
    const start=performance.now();
    mount().focusElement.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:' '}));
    const handler=performance.now()-start;await Promise.resolve();const caret=performance.now()-start;
    await new Promise(r=>requestAnimationFrame(r));const frame=performance.now()-start;
    if(node().inlineContent.length||proof.view.parentOf(node().key)?.viewType!=='indented-list-block'||mount().captureInlineSelection().anchor!==0)throw Error('Prefix conversion/caret failed: '+JSON.stringify({iteration:i,text:mount().captureText(),parent:proof.view.parentOf(node().key)?.viewType,selection:mount().captureInlineSelection(),focused:document.activeElement===mount().focusElement}));
    if(i>=2){continuations.push(continuation+handler);sync.push(handler);settled.push(caret);frames.push(frame);matchedSnapshots+=snapshots-beforeSnapshots;}
    editor.repository.undo();await Promise.resolve();
    if(mount().captureText()!==token+' '||proof.view.parentOf(node().key)?.viewType==='indented-list-block')throw Error('Prefix Undo did not restore literal marker');
   }
   const stats=values=>{const xs=[...values];xs.sort((a,b)=>a-b);return {median:xs[Math.floor(xs.length/2)],p95:xs[Math.floor(xs.length*.95)],max:xs.at(-1)}};
   editor.repository.snapshot=snapshot;editor.commands.remove(node().key);proof.mount.focus();proof.mount.restoreInlineSelection({anchor:100,head:100});
   return {prefix:token,annotatedNestedContext:rich,samples:20,warmups:2,documentCharacters,sync:stats(sync),settled:stats(settled),frame:stats(frames),...(task?{fullContinuationHandlerSum:stats(continuations)}:{}),snapshots:matchedSnapshots,undoLiteralVerified:true};
  })()`);
  assert.equal(prefix.snapshots,0,'Prefix conversion must not snapshot the repository');
  console.log('Matched list prefix:',JSON.stringify(prefix));await writeFile(path.join(artifacts,'list-prefix.json'),JSON.stringify(prefix,null,2));
 }
 const before=await evaluate('proof.mount.captureText()');
 await evaluate('proof.mount.restoreInlineSelection({anchor:100,head:100})');
 const burst=longProbe?'XY':'Quick typing test';
 for(const character of burst)await send('Input.insertText',{text:character},sessionId);
 assert.equal(await evaluate('proof.mount.captureText()'),[...before].slice(0,100).join('')+burst+[...before].slice(100).join(''));
 await evaluate(`for(let i=0;i<${[...burst].length};i++)proof.editor.repository.undo()`);
 assert.equal(await evaluate('proof.mount.captureText()'),before);
 console.log('Real Chrome character input and undo: passed');
 if(presentation.mode==='reading-spotlight'){
   await evaluate(`proof.mount.restoreInlineSelection({anchor:100,head:100});proof.scrollPanel=proof.flow.closest('.reactive-tabs__panel');proof.scrollPanel.style.maxHeight='210px';proof.scrollPanel.style.overflow='auto';proof.scrollPanel.scrollTop=80;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
   const scrolled=await evaluate('proof.spotlightGeometry()');
   assert.ok(Math.abs(scrolled.x-scrolled.caretX)<1 && Math.abs(scrolled.y-scrolled.caretY)<1,'spotlight must follow scrolling/reflow');
   assert.ok(await evaluate('proof.scrollPanel.scrollTop>0'),'fixture must actually scroll');
   await evaluate(`proof.mount.restoreInlineSelection({anchor:0,head:4})`);
   assert.equal(await evaluate("proof.root.querySelectorAll('[data-reading-spotlight]').length"),0,'selection must remove the mask immediately');
   await evaluate(`proof.mount.restoreInlineSelection({anchor:100,head:100});new Promise(r=>requestAnimationFrame(r))`);
   await evaluate(`proof.editor.caretModes.select('normal')`);
   assert.equal(await evaluate("proof.root.querySelectorAll('[data-reading-spotlight]').length"),0,'Normal must remove all masks');
   console.log('Chrome spotlight scrolling, selection and teardown: passed');
 }

 if(process.env.BENCHMARK_POINTER_SPOTLIGHT==='1'){
   await evaluate(`proof.scrollPanel=proof.flow.closest('.reactive-tabs__panel');proof.scrollPanel.style.maxHeight='300px';proof.scrollPanel.style.overflow='auto';proof.scrollPanel.scrollTop=80;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
   const point=await evaluate(`(()=>{const r=proof.pointerHost.getBoundingClientRect(),p=proof.scrollPanel.getBoundingClientRect();return {x:r.left+250,y:Math.max(r.top,p.top)+90}})()`);
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point},sessionId);
   await wait("proof.pointerHost.querySelector('.pointer-spotlight:not([hidden])')");
   const clipped=await evaluate(`(()=>{const r=proof.pointerHost.querySelector('.pointer-spotlight').getBoundingClientRect(),p=proof.scrollPanel.getBoundingClientRect();return {top:r.top,bottom:r.bottom,parentTop:p.top,parentBottom:p.bottom,scrolled:proof.scrollPanel.scrollTop}})()`);
   assert.ok(clipped.scrolled>0);assert.ok(clipped.top>=clipped.parentTop&&clipped.bottom<=clipped.parentBottom,'overlay must clip to scrollport');
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:20},sessionId);
   assert.equal(await evaluate("proof.pointerHost.querySelector('.pointer-spotlight').hidden"),true,'leaving must hide lighting');
   await evaluate(`proof.root.querySelector('[aria-label="Pointer Spotlight"]').click()`);
   assert.equal(await evaluate("proof.root.querySelectorAll('.pointer-spotlight').length"),0,'toggle off must remove overlay');
   assert.equal(await evaluate('proof.editor.pointerSpotlight.active()'),false);
   console.log('Pointer spotlight scrolling, leave and toggle cleanup: passed');
 }
 if(qualify){
   const data=await evaluate(`(async()=> (await import('/experiments/lightweight-cells/qualification/browser.mjs')).measureBrowser(${longProbe}))()`);
   await writeFile(path.join(artifacts,'stages.json'),JSON.stringify(data));
 }
 if(process.env.BENCHMARK_DOM_RETENTION==='1'){
   const {retention}=await import('../experiments/dom-addressing/retention.mjs');
   await writeFile(path.join(artifacts,'retention.json'),JSON.stringify(await retention({evaluate,send,socket,sessionId,bind})));
 }else if(process.env.BENCHMARK_CELL_MEMORY==='1'){
   const {memoryBrowser}=await import('../experiments/lightweight-cells/qualification/memory-browser.mjs');
   const memory=await memoryBrowser({evaluate,send,sessionId});
   await evaluate('proof.editor.__qualificationEditor=true;proof.flow.__qualificationFlow=true;window.qualificationWeak={editor:new WeakRef(proof.editor),flow:new WeakRef(proof.flow)};proof.dispose();proof.session.dispose();delete window.proof');
   await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,250))))');
   await send('HeapProfiler.collectGarbage',{},sessionId);
   memory.scrolling=scrolling;
   memory.reclaimed=await evaluate('({editor:!qualificationWeak.editor.deref(),flow:!qualificationWeak.flow.deref(),mountedFlows:document.querySelectorAll(".reactive-standoff-flow").length})');
   memory.disposed={heap:(await send('Runtime.getHeapUsage',{},sessionId)).usedSize,...await send('Memory.getDOMCounters',{},sessionId)};
   if(process.env.BENCHMARK_CELL_RETAINERS==='1'){
     await evaluate('new Promise(r=>setTimeout(r,3000))');
     await send('HeapProfiler.collectGarbage',{},sessionId);
     memory.later=await evaluate('({editor:!qualificationWeak.editor.deref(),flow:!qualificationWeak.flow.deref()})');
     if(!memory.later.editor||!memory.later.flow)memory.roots=await (await import('../experiments/lightweight-cells/qualification/heap-roots.mjs')).heapRoots(socket,send,sessionId);
   }
   await writeFile(path.join(artifacts,'memory.json'),JSON.stringify(memory));
 }else await evaluate('proof.inventory?.dispose();proof.dispose();proof.session.dispose()');
}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
