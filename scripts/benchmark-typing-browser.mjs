// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Optional: CHROME_BIN, BENCHMARK_URL and BENCHMARK_DOCUMENT_URL (read-only API
// loadDocumentJson URL). A supplied document benchmarks its longest paragraph.
// BENCHMARK_PRESENTATION=desktop|spatial|flint optionally hosts the same fixture in a Window.
// BENCHMARK_BACKLINKS=1 adds the real C3 panel/service over an in-memory bound fixture.
// BENCHMARK_IIIF=off|idle|active qualifies IIIF isolation with a controlled tile service.
// BENCHMARK_ENCYCLOPEDIA=off|idle|pending uses the Wikipedia dispatcher instead.
// BENCHMARK_ACADEMIC=off|idle|pending qualifies DOI loader isolation (pending uses a controlled service response).
// BENCHMARK_CODE=5|50|200|embedded adds a standoff CodeBlock to the real editor fixture.
// BENCHMARK_DIALECTIC=1 adds linked range anchors and the incremental Dialectic index.
// BENCHMARK_CONTENTS=off disables Semantic Contents membership for comparison.
// BENCHMARK_SEMANTICS=off disables the Semantics Workspace index for comparison.
// BENCHMARK_ACTIVITY=off disables its contribution-activity membership projection for comparison.
// BENCHMARK_VIRTUAL=1 opts into native text-flow virtualisation; BENCHMARK_BLOCKS sets fixture size.
// Requires Node 22+ (WebSocket).
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-typing-bench-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
let socket;
try {
const endpoint = await new Promise((resolve, reject) => {
 let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match) resolve(match[1]); });
 chrome.once('error', reject); setTimeout(() => reject(new Error('Chrome startup timed out')), 15000).unref();
});
socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const result = JSON.parse(event.data); if(result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); clearTimeout(p.timer); result.error ? p.reject(new Error(JSON.stringify(result.error))) : p.resolve(result.result); }});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timed out: '+method));},30000); pending.set(requestId,{resolve,reject,timer}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };

 await send('Page.bringToFront',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.BENCHMARK_URL ?? 'http://localhost:3000/'},sessionId);
 await evaluate('new Promise(resolve => setTimeout(resolve, 1500))');
 const result = await evaluate(`(async () => {
   const {ReactiveEditor} = await import('/src/reactive-editor/editor.ts');
   const {registerApplicationViews} = await import('/src/application/features.ts');
   const {ReactiveTreeView} = await import('/src/rendering/reactive-tree-view.tsx');
   const source = await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const webPath = source.split('"').find(part => part.includes('/solid-js_web.js'));
   const {render, createComponent} = await import(webPath);
   const host = document.createElement('div'); document.body.append(host);
   host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:white;z-index:99999';
   const documentUrl = ${JSON.stringify(process.env.BENCHMARK_DOCUMENT_URL ?? "")};
   const retrievalUrl=${JSON.stringify(process.env.BENCHMARK_RETRIEVAL_URL??'')};
   if(retrievalUrl){
    const original=window.fetch.bind(window);window.fetch=(input,init)=>String(input).startsWith('/api/retrieval/')?original(retrievalUrl+String(input).slice('/api/retrieval'.length),init):original(input,init);
    const retrieval=await import('/src/application/retrieval-client.ts');await retrieval.retrievalRequest('status');retrieval.retrievalForeground();
   }
   const mountStarted = performance.now();
   const dto = documentUrl ? (await (await fetch(documentUrl)).json()).Data.document : {id:'typing-benchmark-document',type:'document-block',children:Array.from({length:${Number(process.env.BENCHMARK_BLOCKS ?? 250)}},(_,i)=>({id:'bench-'+i,type:'standoff-editor-block',text:'x'.repeat(100),standoffProperties:[{type:'style/bold',start:40,end:60}]}))};
   const codeMode=${JSON.stringify(process.env.BENCHMARK_CODE??'')}, codeEnabled=${JSON.stringify(process.env.BENCHMARK_CODE_HIGHLIGHT!=='off')};
   const dialecticRanges=${JSON.stringify(process.env.BENCHMARK_DIALECTIC === '1')};
   if(dialecticRanges){dto.linkedAnnotations={...(dto.linkedAnnotations??{})};for(const b of dto.children??[])if(b.type==='standoff-editor-block'&&b.text){const id='bench-range-'+b.id;dto.linkedAnnotations[id]={id,type:'dialectic/range-anchor',metadata:{dialecticRange:{version:1,excerpt:b.text,source:{resourceId:dto.id,blockId:b.id}}}};b.standoffProperties=[...(b.standoffProperties??[]),{id:id+'-segment',type:'dialectic/range-anchor',annotationId:id,start:0,end:[...b.text].length-1}];}}
   if(codeMode){const lines=Array.from({length:codeMode==='embedded'?200:Number(codeMode)},(_,i)=>'const value'+i+': number = '+i+'; // code with a stable trailing comment for trusted caret tests');dto.children.unshift({id:'syntax-code',type:'standoff-code-block',metadata:{markdownCode:{language:'typescript'}},children:(codeMode==='embedded'?[lines.join(String.fromCharCode(10))]:lines).map((text,i)=>({id:'code-line-'+i,type:'standoff-editor-block',text}))});}
   const structuredMode=${JSON.stringify(process.env.BENCHMARK_STRUCTURED??'')};let structuredWorkers=0;
   if(structuredMode){dto.children.push(...[{filename:'data.json',presentation:'json',text:JSON.stringify({values:Array.from({length:1000},(_,i)=>({id:i,name:'Example'}))})},{filename:'code.ts',presentation:'source',text:'const value: number = 42;'}, {filename:'flow.mmd',presentation:'mermaid',text:'flowchart TD; A-->B'}].map((r,i)=>({id:'structured-'+i,type:'mutable/structured-resource-block',structured:{version:1,filename:r.filename,presentation:r.presentation},text:r.text})));}
   const pdfMode=${JSON.stringify(process.env.BENCHMARK_PDF??'')};let pdfCalls=0,pdfNavigation;
   if(pdfMode){const {pdfFixture}=await import('/src/pdf/fixtures.ts'),bytes=pdfFixture(),snapshot={version:1,kind:'pdf',snapshotId:crypto.randomUUID(),identityId:crypto.randomUUID(),entityId:crypto.randomUUID(),resourceId:crypto.randomUUID(),sourceUrl:'https://papers.example/benchmark.pdf',endpoint:'https://papers.example/benchmark.pdf',retrievedAt:'2026-10-18T00:00:00Z',asset:{kind:'managed',cavernId:'fixture',assetId:'sha256:'+'a'.repeat(64)},inspection:{kind:'pdf-inspection',pages:2,label:'Typing PDF',version:'fixture'}};
    dto.children.push({id:'pdf-bench',type:'mutable/pdf-document-block',pdf:snapshot});const original=window.fetch.bind(window);window.fetch=async(input,init)=>{if(String(input).startsWith('/api/services/pdf.')){pdfCalls++;return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','X-Mutable-Cavern-Id':'fixture','X-Mutable-Result':JSON.stringify({snapshot})}});}return original(input,init);};
   }
   const iiifMode=${JSON.stringify(process.env.BENCHMARK_IIIF??'')};let iiifCalls=0;
   if(iiifMode){
    const {imageFixture,jsonBytes}=await import('/src/iiif/fixtures.ts'),{normalizeIIIF}=await import('/src/iiif/model.ts');
    const p=normalizeIIIF(jsonBytes(imageFixture())),snapshot={version:1,kind:'iiif-image',snapshotId:crypto.randomUUID(),identityId:crypto.randomUUID(),entityId:crypto.randomUUID(),resourceId:crypto.randomUUID(),sourceUrl:p.id+'/info.json',resourceUrl:p.id,retrievedAt:'2026-10-18T00:00:00Z',label:'IIIF benchmark',asset:{kind:'managed',cavernId:'fixture',assetId:'sha256:'+'a'.repeat(64)}};
    dto.children.push({id:'iiif-bench',type:'mutable/iiif-image-block',iiif:snapshot});
    const cv=document.createElement('canvas');cv.width=cv.height=512;const ctx=cv.getContext('2d');ctx.fillStyle='#abc';ctx.fillRect(0,0,512,512);const bytes=await new Promise(r=>cv.toBlob(r));
    const originalFetch=window.fetch.bind(window);window.fetch=async(input,init)=>{if(String(input).startsWith('/api/services/iiif.')){iiifCalls++;const op=String(input).split('.').at(-1);if(op==='tile')return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','X-Mutable-Cavern-Id':'fixture','X-Mutable-Result':'{"availability":"cached"}'}});return new Response(JSON.stringify({Success:true,Data:op==='read'?{snapshot,projection:p}:op==='open'?{grant:crypto.randomUUID(),info:p,retained:0,cached:0}:{closed:true}}));}return originalFetch(input,init);};
   }
   const presentation = ${JSON.stringify(process.env.BENCHMARK_PRESENTATION ?? "")};
   let editor, projection, dispose;
   if (presentation) {
     const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
     const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
     const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
     const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:presentation==='flint'?[{type:'workspace-object-bank-block',children:[dto]}]:[{id:'bench-window',type:'document-window-block',metadata:{size:{w:900,h:700}},children:[dto]}]}),{features:{...(presentation==='flint'?{nativeDocumentPersistence:false,nativeKnowledge:false,sqliteKnowledge:false}:{}),virtualTextFlows:${JSON.stringify(process.env.BENCHMARK_VIRTUAL === '1')},dialecticSemanticsWorkspace:${JSON.stringify(process.env.BENCHMARK_SEMANTICS !== 'off')},dialecticSemanticContents:${JSON.stringify(process.env.BENCHMARK_CONTENTS !== 'off')},dialecticContributionActivity:${JSON.stringify(process.env.BENCHMARK_ACTIVITY !== 'off')},spatialWorkspace:true,markdownInputTransformation:${JSON.stringify(process.env.BENCHMARK_MIT !== 'off')},standoffCodeHighlighting:codeEnabled}});
     editor=session.editor;projection=session.projection;
     if(presentation==='spatial')session.selectPresentation('spatial');
     const stop=render(()=>createComponent(WorkspacePresentationView,{session}),host);
     dispose=()=>{stop();session.dispose()};
     if(presentation==='flint') await editor.commandRegistry.execute('flint.open',{targetKey:projection.state.rootKey,args:undefined});
     if(presentation==='spatial') {
       for(let i=0;i<100&&!host.querySelector('.workspace-spatial canvas');i++)await new Promise(r=>setTimeout(r,50));
       if(!session.spatial.document.activate('block:bench-window'))throw new Error('Benchmark Document authorization failed');
     }
   } else {
     editor = new ReactiveEditor(dto,{features:{virtualTextFlows:${JSON.stringify(process.env.BENCHMARK_VIRTUAL === '1')},dialecticSemanticsWorkspace:${JSON.stringify(process.env.BENCHMARK_SEMANTICS !== 'off')},dialecticSemanticContents:${JSON.stringify(process.env.BENCHMARK_CONTENTS !== 'off')},dialecticContributionActivity:${JSON.stringify(process.env.BENCHMARK_ACTIVITY !== 'off')},markdownInputTransformation:${JSON.stringify(process.env.BENCHMARK_MIT !== 'off')},standoffCodeHighlighting:codeEnabled,structuredResources:structuredMode!=='off',crossResourceLoaders:pdfMode!=='off',iiifResourceLoaders:iiifMode!=='off',academicResourceLoaders:${JSON.stringify((process.env.BENCHMARK_ENCYCLOPEDIA??process.env.BENCHMARK_ACADEMIC) !== 'off')}}}); registerApplicationViews(editor);
     if(iiifMode||pdfMode)editor.clipboard.setContext(()=>({cavernId:'fixture',session:'fixture'}));
     projection = editor.createView('browser-performance');
     dispose = render(() => createComponent(ReactiveTreeView,{editor,projection}), host);
   }
   if(pdfMode==='active'){
    const block=host.querySelector('.mutable-pdf');block.style.cssText='position:fixed;right:0;top:0;width:500px;z-index:100000;background:white';[...block.querySelectorAll('button')].find(b=>b.textContent==='Open retained PDF').click();
    for(let i=0;i<300&&!block.querySelector('.textLayer span');i++)await new Promise(r=>setTimeout(r,20));if(!block.querySelector('.textLayer span'))throw Error('PDF did not render');
    pdfNavigation=()=>{const page=Number(block.querySelector('[aria-label="PDF page"]').value);const button=[...block.querySelectorAll('button')].find(b=>b.textContent===(page===1?'Next PDF page':'Previous PDF page'));if(!button.disabled)button.click();};
   }
   if(iiifMode==='active'){
    for(let i=0;i<200&&!host.querySelector('.mutable-iiif select option');i++)await new Promise(r=>setTimeout(r,20));
    const block=host.querySelector('.mutable-iiif');block.style.cssText='position:fixed;right:0;top:0;width:500px;z-index:100000;background:white';
    [...block.querySelectorAll('button')].find(b=>b.textContent==='Activate online viewer').click();
    for(let i=0;i<200&&!block.querySelector('canvas');i++)await new Promise(r=>setTimeout(r,20));
    if(!block.querySelector('canvas'))throw Error('IIIF viewer did not activate');await new Promise(r=>setTimeout(r,1000));
   }
   await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
   const mountMs=performance.now()-mountStarted, mountedElements=host.querySelectorAll('*').length, characterSpans=host.querySelectorAll('.reactive-standoff-flow > span').length;
   const sampleBlocks=[...host.querySelectorAll('.reactive-standoff-block')].slice(0,2).map(el=>el.getBoundingClientRect());
   const blockHeight=sampleBlocks[0]?.height, blockStep=sampleBlocks.length===2?sampleBlocks[1].top-sampleBlocks[0].top:undefined;
   editor.installGateway(document);
   let stopMarkdown = () => {};
   if (${JSON.stringify(process.env.BENCHMARK_MARKDOWN ?? "")} === '1') {
     const {installMarkdownExperiment}=await import('/src/qualification/native-b2/input.ts');
     stopMarkdown=installMarkdownExperiment(editor,document,()=>true,()=>[]);
   }
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   let stopBacklinks = () => {};
   if (${JSON.stringify(process.env.BENCHMARK_BACKLINKS === '1')}) {
     const {CanonicalBacklinks}=await import('/src/application/canonical-backlinks.ts');
     const {BacklinksPanel}=await import('/src/features/flint/backlinks-view.tsx');
     const root=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='document-block');
     const id=root.payload.metadata?.documentId??root.payload.id;
     const location={folder:'benchmark',filename:'document.mutable.json'};
     const scan={vault:'benchmark',folders:['benchmark'],documents:[{resourceId:id,title:'Benchmark',location,state:'paired'}],markdown:[],diagnostics:[],operations:[],readOnly:true,complete:true};
     const vault={root:'benchmark',snapshot:()=>scan,signature:()=>JSON.stringify(scan),refresh:async()=>{}};
     const service=new CanonicalBacklinks(editor.repository,{location:()=>location,pendingVaultRelocations:()=>[]},()=>vault);
     const query={vault:'benchmark',target:{documentId:id,blockId:root.payload.id}};
     const panel=document.createElement('aside');panel.style.cssText='position:fixed;right:0;top:0;width:200px;background:white';host.append(panel);
     const stop=render(()=>createComponent(BacklinksPanel,{backlinks:{service,target:()=>query,follow:async()=>{}}}),panel);
     await service.query(query);await new Promise(r=>setTimeout(r,200));
     stopBacklinks=()=>{stop();service.dispose();panel.remove()};
   }
   if(structuredMode==='active'){for(let i=0;i<200;i++){if(host.querySelector('.structured-resource .cm-content')&&host.querySelector('.structured-resource iframe')?.dataset.rendered==='true'&&host.querySelector('.structured-resource summary'))break;await new Promise(r=>setTimeout(r,50));}if(host.querySelector('.structured-resource iframe')?.dataset.rendered!=='true')throw Error('Structured benchmark did not settle');}
   const previousWorker=window.Worker;if(structuredMode)window.Worker=new Proxy(previousWorker,{construct(target,args){structuredWorkers++;return Reflect.construct(target,args);}});
   const codeModule=(await (await fetch('/src/rendering/standoff-code-view.tsx')).text()).split('"').find(part=>part.includes('/src/runtime/standoff-code.ts'));
   const {codeSyntaxDiagnostics}=await import(codeModule);
   if(codeMode&&codeEnabled)for(let i=0;i<100&&!codeSyntaxDiagnostics.get(editor)?.size;i++)await new Promise(r=>setTimeout(r,25));
   const codeInitial=codeMode&&codeEnabled?[...codeSyntaxDiagnostics.get(editor).values()][0]:undefined;
   const study=host.querySelector('.workspace-spatial');const sceneFramesBefore=Number(study?.dataset.frames??0);
   const flows = host.querySelectorAll('[contenteditable=true]');
   const flow=documentUrl ? [...flows].sort((a,b)=>b.textContent.length-a.textContent.length)[0] : flows[0];
   const unrelated=[...flows].find(f=>f!==flow), originalCell=unrelated.firstChild;
   flow.focus();
   const selection = document.getSelection();
   const caret = index => { const r=document.createRange(); r.setStart(flow,index);r.collapse(true);selection.removeAllRanges();selection.addRange(r); };
   const midpoint=documentUrl ? Math.floor(flow.childNodes.length/2) : 50;
   caret(midpoint);
   let academicRequests=0,finishAcademic;const academicMode=${JSON.stringify(process.env.BENCHMARK_ENCYCLOPEDIA??process.env.BENCHMARK_ACADEMIC ?? '')};
   if(academicMode==='pending'){
     editor.clipboard.setContext(()=>({cavernId:'fixture',session:'fixture'}));
     const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>{
       if(String(input).includes(${JSON.stringify(process.env.BENCHMARK_ENCYCLOPEDIA?'/api/services/encyclopedia.import':'/api/services/academic.import')})){academicRequests++;return new Promise((_resolve,reject)=>{finishAcademic=()=>reject(Error('Controlled acquisition ended'));init.signal?.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});});}
       return originalFetch(input,init);
     };
     flow.dispatchEvent(new KeyboardEvent('keydown',{key:'v',metaKey:true,shiftKey:true,bubbles:true}));
     const data=new DataTransfer();data.setData('text/plain',${JSON.stringify(process.env.BENCHMARK_ENCYCLOPEDIA?'https://en.wikipedia.org/wiki/Typing':'10.1234/typing')});flow.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
     await Promise.resolve();if(academicRequests!==1)throw Error('Academic preparation did not start');
   }
   let dialecticIndex,stopSemanticInventory=()=>{};if(dialecticRanges){const {DialecticReferences}=await import('/src/features/dialectic/references.ts');const owner=Object.values(projection.state.nodes).find(n=>n.viewType==='document-block'&&n.payload.id===dto.id);if(!owner)throw Error('Dialectic benchmark owner unavailable');dialecticIndex=new DialecticReferences(editor,projection,owner.key);if(editor.features.dialecticSemanticsWorkspace){const source=await (await fetch('/src/features/dialectic/references.ts')).text(),solidPath=source.split('"').find(p=>p.includes('/solid-js.js'));const {createRoot,createMemo}=await import(solidPath);createRoot(dispose=>{stopSemanticInventory=dispose;createMemo(()=>dialecticIndex.workspaceInventory());});}}
   const dialecticBefore={...dialecticIndex?.diagnostics};
   const pdfBefore=pdfCalls;const iiifBefore=iiifCalls;const samples=[];let snapshots=0; const snapshot=editor.repository.snapshot.bind(editor.repository);
   editor.repository.snapshot=()=>{snapshots++;return snapshot();};
   const {virtualTextFlowDiagnostics}=await import('/src/rendering/virtual-text-flow.tsx');
   const virtualDiagnostics=virtualTextFlowDiagnostics.get(host.querySelector('[data-virtual-text-flow]')), virtualBefore=virtualDiagnostics?.itemKeys??0;
   const before=flow.textContent;
   for(let i=0;i<20;i++){
     if(i%5===0)pdfNavigation?.();
     let start=performance.now();
     flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'a'}));
     samples.push(performance.now()-start);
     await Promise.resolve();
     start=performance.now();
     flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));
     samples.push(performance.now()-start);
     await new Promise(resolve=>requestAnimationFrame(resolve));
   }
   finishAcademic?.();await Promise.resolve();
   const restored=flow.textContent===before;
   window.typingBench={editor,projection,host,flow,dispose:()=>{stopSemanticInventory();dialecticIndex?.dispose();stopBacklinks();dispose();},stopMarkdown,caret,midpoint,before,originalCell,unrelated};
   samples.sort((a,b)=>a-b);
   window.Worker=previousWorker;return {virtualTextFlows:editor.features.virtualTextFlows,virtualItemKeysDuringTyping:(virtualDiagnostics?.itemKeys??0)-virtualBefore,blockHeight,blockStep,mountMs,mountedElements,characterSpans,dialecticRanges,dialecticIndex:dialecticIndex&&Object.fromEntries(Object.entries(dialecticIndex.diagnostics).map(([key,value])=>[key,value-dialecticBefore[key]])),codeMode,codeInitial,codeRefresh:codeMode&&codeEnabled?[...codeSyntaxDiagnostics.get(editor).values()][0]:undefined,structuredMode,structuredWorkersDuringTyping:structuredWorkers,pdfMode,pdfCallsDuringTyping:pdfCalls-pdfBefore,iiifMode,iiifCallsDuringTyping:iiifCalls-iiifBefore,academicMode,academicRequests,backlinks:${JSON.stringify(process.env.BENCHMARK_BACKLINKS === '1')},markdownExperiment:${JSON.stringify(process.env.BENCHMARK_MARKDOWN === '1')},presentation:presentation||"standalone",sceneFramesDuringTyping:Number(study?.dataset.frames??0)-sceneFramesBefore,characters:[...flows].reduce((n,f)=>n+[...f.textContent].length,0),paragraphCharacters:[...before].length,paragraphs:flows.length,edits:samples.length,meanMs:samples.reduce((a,b)=>a+b)/samples.length,medianMs:samples[20],p95Ms:samples[38],maxMs:samples[39],snapshots,restored,unrelatedCellStable:unrelated.firstChild===originalCell};
 })()`);
 console.log(JSON.stringify(result,null,2)); assert.equal(result.restored,true);if(result.pdfMode)assert.equal(result.pdfCallsDuringTyping,0);if(result.iiifMode)assert.equal(result.iiifCallsDuringTyping,0);assert.equal(result.snapshots,0);assert.equal(result.unrelatedCellStable,true);
 const before = await evaluate('window.typingBench.before');
 const midpoint = await evaluate('window.typingBench.midpoint');
 const inserted = [...before].slice(0,midpoint).join('')+'Q'+[...before].slice(midpoint).join('');
 await send('Input.insertText',{text:'Q'},sessionId);
 assert.equal(await evaluate('window.typingBench.flow.textContent'), inserted);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);
 assert.equal(await evaluate('window.typingBench.flow.textContent'), before);
 await evaluate('window.typingBench.editor.repository.undo()');
 assert.equal(await evaluate('window.typingBench.flow.textContent'), inserted);
 await evaluate('window.typingBench.editor.repository.redo()');
 assert.equal(await evaluate('window.typingBench.flow.textContent'), before);
 console.log('Real Chrome insertText, Backspace, undo and redo: passed');
 const split = await evaluate(`(async () => {
   const {editor,host,flow,caret,midpoint,before,unrelated,originalCell}=window.typingBench;
   caret(midpoint); let snapshots=0;
   const original=editor.repository.snapshot.bind(editor.repository);
   editor.repository.snapshot=()=>{snapshots++;return original();};
   const source=editor.node(editor.mounts.resolveElement(flow).nodeKey), parent=editor.projections.get(source.viewId).parentOf(source.key);
   const count=parent.children.length;
   const start=performance.now();
   flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertParagraph'}));
   const splitMs=performance.now()-start;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const frameMs=performance.now()-start;
   const splitSnapshots=snapshots;
   const added=parent.children.length===count+1;
   const focusedRight=document.activeElement?.textContent===[...before].slice(midpoint).join('');
   const undoStart=performance.now(); editor.repository.undo(); const undoMs=performance.now()-undoStart;
   const restored=flow.textContent===before;
   return {splitMs,frameMs,undoMs,splitSnapshots,added,focusedRight,restored,unrelatedCellStable:unrelated.firstChild===originalCell};
 })()`);
 console.log(JSON.stringify({split},null,2));
 assert.equal(split.added,true); assert.equal(split.focusedRight,true); assert.equal(split.restored,true); assert.equal(split.unrelatedCellStable,true);
 await evaluate('window.typingBench.flow.focus(); window.typingBench.caret(window.typingBench.midpoint)');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
 assert.equal(await evaluate('document.activeElement.textContent'), [...before].slice(midpoint).join(''));
 await evaluate('window.typingBench.editor.repository.undo()');
 assert.equal(await evaluate('window.typingBench.flow.textContent'), before);
 console.log('Real Chrome Enter and split undo: passed');
 const boundaries = await evaluate(`(async () => {
   const {editor,host,flow,caret,before,unrelated,originalCell}=window.typingBench;
   const results=[];
   for (const position of ['start','end','empty']) {
     flow.focus(); caret(position==='start' ? 0 : flow.childNodes.length);
     let target=flow;
     if(position==='empty') {
       flow.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
       await Promise.resolve(); target=document.activeElement;
     }
     const source=editor.node(editor.mounts.resolveElement(flow).nodeKey), parent=editor.projections.get(source.viewId).parentOf(source.key);
   const count=parent.children.length;
     let snapshots=0; const original=editor.repository.snapshot.bind(editor.repository);
     editor.repository.snapshot=()=>{snapshots++;return original();};
     const start=performance.now();
     target.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
     const handlerMs=performance.now()-start;
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     const frameMs=performance.now()-start;
     const added=parent.children.length===count+1;
     const focusCorrect=position==='end' ? document.activeElement!==flow && document.activeElement.textContent==='' : document.activeElement===target;
     const editSnapshots=snapshots;
     const undoStart=performance.now(); editor.repository.undo(); const undoMs=performance.now()-undoStart;
     editor.repository.snapshot=original;
     if(position==='empty') editor.repository.undo();
     results.push({position,handlerMs,frameMs,undoMs,snapshots:editSnapshots,added,focusCorrect,restored:flow.textContent===before,unrelatedCellStable:unrelated.firstChild===originalCell});
   }
   return results;
 })()`);
 console.log(JSON.stringify({boundaries},null,2));
 for (const result of boundaries) { assert.equal(result.added,true); assert.equal(result.focusCorrect,true); assert.equal(result.restored,true); assert.equal(result.unrelatedCellStable,true); }
 if (process.env.BENCHMARK_SCROLL === '1') {
   const scrolling=await evaluate(`(async()=>{
     const {editor,host,flow}=window.typingBench,key=editor.mounts.resolveElement(flow).nodeKey;
     const scroll=editor.documentSessions?.forNode(key)?.host.port?.scrollport??host;
     flow.focus();scroll.scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     const samples=[],revision=editor.repository.state.revision;
     let elementReads=0,rangeReads=0,maximumMounted=0;
     const element=Element.prototype.getBoundingClientRect,range=Range.prototype.getClientRects;
     Element.prototype.getBoundingClientRect=function(){elementReads++;return element.call(this)};
     Range.prototype.getClientRects=function(){rangeReads++;return range.call(this)};
     try {for(let i=0;i<5;i++){const start=performance.now();scroll.scrollTop+=600;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));samples.push(performance.now()-start);maximumMounted=Math.max(maximumMounted,host.querySelectorAll('.reactive-standoff-flow').length)}}
     finally {Element.prototype.getBoundingClientRect=element;Range.prototype.getClientRects=range}
     if(editor.repository.state.revision!==revision)throw Error('Scroll changed canonical content');
     return {twoFrameMs:samples,elementReads,rangeReads,maximumMounted};
   })()`);
   console.log(JSON.stringify({scrolling},null,2));
 }
 if (process.env.BENCHMARK_VIRTUAL_QUALIFY === '1') {
   const qualification = await evaluate(`(async()=>{const {qualifyTextFlow}=await import('/src/rendering/virtual-text-flow.browser.ts');return qualifyTextFlow(window.typingBench)})()`);
   console.log(JSON.stringify({qualification},null,2));
   const imeBefore = await evaluate(`(()=>{const b=window.typingBench,m=b.editor.mounts.get(${JSON.stringify(qualification.imeKey)});window.imeMount=m;window.imeScroll=b.editor.documentSessions?.forNode(${JSON.stringify(qualification.imeKey)})?.host.port?.scrollport??b.host;return m.captureText()})()`);
   await send('Input.imeSetComposition',{text:'あ',selectionStart:1,selectionEnd:1},sessionId);
   await evaluate(`(async()=>{const b=window.typingBench;window.imeScroll.scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(b.editor.mounts.get(${JSON.stringify(qualification.imeKey)})!==window.imeMount||!window.imeMount.composing)throw Error('IME occurrence was evicted');if(document.activeElement!==window.imeMount.focusElement)throw Error('IME focus was lost while scrolling: '+document.activeElement?.tagName)})()`);
   await send('Input.insertText',{text:'あ'},sessionId);
   assert.equal(await evaluate('window.imeMount.captureText()'), [...imeBefore].slice(0,17).join('')+'あ'+[...imeBefore].slice(17).join(''));
   assert.equal(await evaluate('window.imeMount.composing'),false);
   assert.equal(await evaluate(`(()=>{const e=window.typingBench.editor,n=e.node(${JSON.stringify(qualification.imeKey)});return n.inlineContent.map(k=>e.node(k).payload.text).join('')})()`), [...imeBefore].slice(0,17).join('')+'あ'+[...imeBefore].slice(17).join(''));
   await evaluate('window.typingBench.editor.repository.undo()');
   assert.equal(await evaluate('window.imeMount.captureText()'),imeBefore);
   console.log('Trusted Chrome IME retained across scrolling, committed and undone: passed');
 }
 await evaluate('window.typingBench.stopMarkdown();window.typingBench.dispose();window.typingBench.editor.dispose();window.typingBench.host.remove()');
} finally {
  // Finish the CDP close handshake before killing Chrome. Otherwise Node's
  // WebSocket can retain a closing socket after all assertions have finished.
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
    socket.close();
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))]);
  }
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

// CDP/undici may retain a closing socket after Chrome has exited. All assertions
// and artifact writes above are awaited; failures never reach this success exit.
process.exit(0);
