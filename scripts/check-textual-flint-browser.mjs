// Focused real Flint/retained-session integration. Reads one fixture; saves only to an in-memory API stub.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile('vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
let saved;
const profile=await mkdtemp(path.join(tmpdir(),'textual-shell-'));
let browser,socket,server;
try {
 server=await createServer({server:{port:0,strictPort:false},plugins:[{
  name:'textual-shell-check',resolveId(id){if(id==='/__textual-proof.js')return '\0textual-proof';},
  load(id){if(id==='\0textual-proof')return `
   import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
   import {WorkspaceSession} from '/src/application/workspace-session.ts';
   import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
   import {WorkspacePresentations} from '/src/demo/workspace-presentations.tsx';
   import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
   import '/src/index.css';import '/src/demo/workspace-demo.css';
   const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:true,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
   const editor=session.editor;
   const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
   const {admitNative}=await import('/src/persistence/native-resource.ts');
   admitNative(editor.repository,new Uint8Array(await(await fetch('/__letter')).arrayBuffer()),editor.repository.readState().placements[bank].contentKey);
   editor.commands.insert({id:'second',type:'document-block',metadata:{documentId:'second',title:'Second Document'},children:[{id:'second-text',type:'standoff-editor-block',text:'Second document retained text.'},
    {type:'indented-list-block',children:[{type:'standoff-editor-block',text:'List item'}]},
    {type:'table-block',children:[{type:'table-row-block',children:[{type:'table-cell-block',children:[{type:'standoff-editor-block',text:'Table cell'}]},{type:'table-cell-block',children:[{type:'standoff-editor-block',text:'Other cell'}]}]}]},
    {type:'tab-row-block',children:[{type:'tab-block',metadata:{name:'Summary',active:true},children:[{type:'standoff-editor-block',text:'Tab summary'}]},{type:'tab-block',metadata:{name:'Details'},children:[{type:'standoff-editor-block',text:'Tab details'}]}]}
   ]},{kind:'at',parentKey:bank,index:1});
   const native=(await import('/src/persistence/native-session.ts')).nativeDocumentSession(editor);
   const resourceId=${JSON.stringify(JSON.parse(fixture).resourceId)},location={folder:'isolated',filename:'letter.ink'};
   native.bind(resourceId,location,{nativeHash:'original',markdownHash:null,generation:null});
   native.list=async()=>['letter.ink'];native.defaultVault=async()=>'isolated';native.establishVault=async()=>({vault:'isolated'});
   native.browseVault=native.discoverVault=async()=>({vault:'isolated',folders:['isolated'],documents:[{resourceId,title:'Letter',location,state:'paired'}],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true});
   await editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
   const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
   editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1100,h:720},position:{x:25,y:50}});
   const selector=document.body.appendChild(document.createElement('div'));selector.style.cssText='position:fixed;top:0;left:0;z-index:2147483646';
   render(()=>createComponent(WorkspacePresentations,{session}),selector);
   const host=document.body.appendChild(document.createElement('div'));host.className='workspace-demo';
   render(()=>createComponent(WorkspacePresentationView,{session}),host);session.editor.installGateway(document);
   window.proof={ports:(await import('/src/application/document-application-ports.ts')).documentApplicationPorts(editor),session,editor:session.editor,native,resourceId,snapshots:0,creates:0,rebuilds:0,referenceRebuilds:0};const create=editor.createView.bind(editor);editor.createView=(...args)=>{proof.creates++;return create(...args)};for(const view of editor.projections.values()){const build=view.build.bind(view);view.build=(...args)=>{proof.rebuilds++;return build(...args)}}const references=editor.repository.rebuildReferences.bind(editor.repository);editor.repository.rebuildReferences=(...args)=>{proof.referenceRebuilds++;return references(...args)};const snapshot=session.editor.repository.snapshot.bind(session.editor.repository);session.editor.repository.snapshot=(...args)=>{proof.snapshots++;proof.snapshotStacks??=[];proof.snapshotStacks.push(new Error().stack);return snapshot(...args);};
  `;},configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url==='/__letter'){res.end(fixture);return;}if(req.url?.startsWith('/api/listFolders')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:['isolated']}));return;}if(req.url==='/api/native/save'){let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:saved.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:saved.generation.generation}}}));return;}next();});s.middlewares.use('/__textual-shell',(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/__textual-proof.js"></script></body></html>');});}
 }]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);browser.stderr.on('data',d=>{s+=d;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error('Browser exception:',JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},35000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1000;i++){if(${condition})return;await new Promise(r=>setTimeout(r,25));}throw Error('Condition timed out: '+${JSON.stringify(condition)})})()`).catch(async error=>{console.error(await evaluate(`({status:document.querySelector('.tw-flint-status')?.textContent,dialog:document.querySelector('[role=dialog]')?.textContent,inputs:[...document.querySelectorAll('[role=dialog] input')].map(e=>e.value),location:window.proof?.native.location(window.proof.resourceId)})`));throw error;});
 const click=async expression=>{const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 await send('Runtime.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__textual-shell`},sessionId);
 const key=async(key,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,commands:key==='a'&&modifiers===4?['selectAll']:undefined,windowsVirtualKeyCode:({Home:36,ArrowLeft:37,ArrowRight:39,Escape:27,ArrowDown:40,ArrowUp:38,Enter:13,a:65,z:90,s:83})[key]??0},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode:({Home:36,ArrowLeft:37,ArrowRight:39,Escape:27,ArrowDown:40,ArrowUp:38,Enter:13,a:65,z:90,s:83})[key]??0},sessionId);};
 await wait('window.proof && document.querySelector(".flint-compact .reactive-standoff-flow")');
 await click(`[...document.querySelectorAll('.flint-document-tab [role=tab]')].find(e=>!e.textContent.includes('Second Document'))`);
 await evaluate(`proof.retained=proof.ports.ports()[0].session();proof.view=proof.retained.projection;proof.textNode=Object.values(proof.view.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.length>100);proof.mount=proof.editor.mounts.get(proof.textNode.key);proof.flow=proof.mount.focusElement;proof.cell=proof.flow.children[0];proof.originalTextNode=proof.cell.firstChild;proof.font=getComputedStyle(proof.flow).fontFamily+' '+getComputedStyle(proof.flow).fontSize;proof.originalParent=proof.retained.element.parentElement;proof.source=proof.retained.host.port;proof.text=()=>proof.textNode.inlineContent.map(key=>proof.view.node(key).payload.text??'').join('');proof.beforeText=proof.text();proof.baseCreates=proof.creates;proof.snapshots=0;proof.editor.focus.request(proof.textNode.key);proof.mount.restoreInlineSelection({anchor:20,head:25});`);
 await click(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Textual')`);
 await wait('document.querySelector(".tw-flint-slot .reactive-standoff-flow")');
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile('/tmp/textual-flint.png',Buffer.from(r.data,'base64')));
 console.log('Textual host mounted; screenshot /tmp/textual-flint.png');
 assert(await evaluate(`proof.retained.element.parentElement.classList.contains('tw-flint-slot') && proof.flow.isConnected && proof.flow.children[0]===proof.cell && proof.cell.firstChild===proof.originalTextNode`));
 assert.equal(await evaluate('proof.snapshots'),0);assert.equal(await evaluate('proof.creates'),await evaluate('proof.baseCreates'));
 const geometry=await evaluate(`(()=>{const root=document.querySelector('.textual-workspace'),r=proof.flow.getBoundingClientRect(),p=root.querySelector('.tw-font-probe').getBoundingClientRect(),cw=p.width/256;const chars=[...proof.flow.children].slice(5,10).map(c=>c.getBoundingClientRect());return {font:getComputedStyle(proof.flow).fontFamily,fontSize:getComputedStyle(proof.flow).fontSize,cellWidth:cw,lineHeight:p.height,width:r.width,columns:r.width/cw,x:r.x/cw,advances:chars.slice(1).map((c,i)=>c.x-chars[i].x),rows:[...proof.retained.element.querySelectorAll('.reactive-standoff-flow')].map(e=>e.getBoundingClientRect().top/p.height),selection:proof.mount.captureInlineSelection(),status:document.querySelector('.tw-flint-status').textContent};})()`);
 console.log('Geometry',geometry);assert(Math.abs(geometry.columns-Math.round(geometry.columns))<.01);assert(Math.abs(geometry.x-Math.round(geometry.x))<.01);assert(geometry.advances.every(w=>Math.abs(w-geometry.cellWidth)<.001));assert.deepEqual(geometry.selection,{anchor:20,head:25});assert(geometry.rows.every(row=>Math.abs(row-Math.round(row))<.01));
 // Trusted caret and selection changes followed by native text input.
 await click('proof.flow');await key('Home','Home',4);await key('ArrowRight','ArrowRight',2);await send('Input.insertText',{text:'Z'},sessionId);
 await wait('proof.flow.textContent.includes("Z") && proof.native.isDirty(proof.resourceId)');
 const edited=await evaluate('proof.text()');assert.notEqual(edited,await evaluate('proof.beforeText'));
 await key('z','KeyZ',4);await wait('proof.text()===proof.beforeText');await key('z','KeyZ',12);await wait('proof.text()==='+JSON.stringify(edited));
 await send('Input.imeSetComposition',{text:'é',selectionStart:1,selectionEnd:1},sessionId);await send('Input.insertText',{text:'é'},sessionId);await wait('proof.text().includes("é") && !proof.mount.composing');
 await click('proof.flow');for(let i=0;i<5;i++)await key('ArrowLeft','ArrowLeft',8);
 await wait('!window.getSelection().isCollapsed');
 const formatRange=await evaluate('proof.mount.captureInlineSelection()');assert.equal(Math.abs(formatRange.head-formatRange.anchor),5);
 await evaluate(`proof.boldBefore=(proof.textNode.payload.standoffProperties??[]).filter(p=>p.type==='style/bold').length`);
 await click(`[...document.querySelectorAll('.tw-flint-menu button')].find(e=>e.textContent==='Format')`);
 await click(`[...document.querySelectorAll('.tw-command-menu button')].find(e=>e.textContent.startsWith('Typography'))`);
 await click(`[...document.querySelectorAll('.tw-command-menu button')].find(e=>e.textContent==='Bold selection')`);
 await wait(`(proof.textNode.payload.standoffProperties??[]).filter(p=>p.type==='style/bold').length===proof.boldBefore+1`);
 assert.deepEqual(await evaluate('proof.mount.captureInlineSelection()'),formatRange);
 const typing={snapshots:await evaluate('proof.snapshots'),creates:await evaluate('proof.creates-proof.baseCreates'),projectionRebuilds:await evaluate('proof.rebuilds'),referenceRebuilds:await evaluate('proof.referenceRebuilds')};if(typing.snapshots)console.log('Snapshot callers',await evaluate('proof.snapshotStacks'));assert.equal(typing.snapshots,0);assert.equal(typing.creates,0);assert.equal(typing.projectionRebuilds,0);assert.equal(typing.referenceRebuilds,0);
 await key('s','KeyS',4);await wait('!proof.native.isDirty(proof.resourceId)');assert.equal(saved.location.filename,'letter.ink');assert.equal(JSON.parse(saved.generation.native).resourceId,await evaluate('proof.resourceId'));assert(saved.generation.native.includes('Z'));console.log('Trusted editing, Undo/Redo, Save passed');
 // The dedicated Save destination dialog uses the same service and supports cancellation.
 const menuButton=label=>`[...document.querySelectorAll('.tw-flint-menu button')].find(e=>e.textContent===${JSON.stringify(label)})`;
 const command=label=>`[...document.querySelectorAll('.tw-command-menu button')].find(e=>e.textContent.startsWith(${JSON.stringify(label)}))`;
 await click(menuButton('File'));await click(command('New Document…'));await wait('document.querySelector(".tw-save-dialog")');
 await send('Input.insertText',{text:'Draft title'},sessionId);await key('s','KeyS',4);assert(await evaluate('document.querySelectorAll("[role=dialog]").length===1'));
 await key('Escape','Escape');await wait('!document.querySelector(".tw-save-dialog")');
 await click(menuButton('File'));await click(command('Save as…'));await wait('document.querySelector(".tw-save-dialog")');
 await key('Escape','Escape');await wait('!document.querySelector(".tw-save-dialog")');assert.equal(await evaluate('proof.native.location(proof.resourceId).filename'),'letter.ink');
 await click(menuButton('File'));await click(command('Save as…'));await wait('document.querySelector(".tw-save-dialog")');
 await click(`document.querySelector('.tw-save-dialog label:last-of-type input')`);await key('a','KeyA',4);await send('Input.insertText',{text:'textual-copy.ink'},sessionId);
 await click(`document.querySelector('.tw-save-dialog button[type=submit]')`);await wait('!document.querySelector(".tw-save-dialog") && proof.native.location(proof.resourceId).filename==="textual-copy.ink" && !proof.native.isDirty(proof.resourceId)');assert.equal(saved.location.filename,'textual-copy.ink');
 // A pre-existing service dialog remains visible and cancellable in this presentation.
 await click(menuButton('File'));await click(command('Vault'));await click(command('Choose Vault…'));await wait('document.querySelector(".textual-workspace .document-dialog")');
 assert(await evaluate(`document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('.document-dialog')!==null`));
 await click(`document.querySelector('.textual-workspace .document-dialog [aria-label="Close dialog"]')`);await wait('!document.querySelector(".document-dialog")');
 // Existing slash completion must use the retained session's visible surface parent.
 await click('proof.flow');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'/',code:'Slash',text:'/',windowsVirtualKeyCode:191},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'/',code:'Slash',windowsVirtualKeyCode:191},sessionId);
 await wait('document.querySelector(".tw-flint-surfaces .autocomplete-workstation")');
 await key('Escape','Escape');await wait('!document.querySelector(".autocomplete-workstation")');
 await evaluate('proof.snapshots=0;proof.selection=proof.mount.captureInlineSelection()');
 await click(`document.querySelector('.textual-workspace [aria-label="Zoom in"]')`);await wait(`+document.querySelector('.textual-workspace').dataset.columns < 130`);
 const zoom=await evaluate(`({selection:proof.mount.captureInlineSelection(),font:getComputedStyle(proof.flow).fontFamily,fontSize:getComputedStyle(proof.flow).fontSize,columns:document.querySelector('.textual-workspace').dataset.columns})`);
 await click(`[...document.querySelectorAll('.tw-flint-tabs button')].find(e=>e.textContent.includes('Second Document'))`);await wait('document.querySelector(".tw-flint-slot")?.textContent.includes("Second document retained text.")');
 assert(await evaluate(`!!document.querySelector('.tw-flint-slot .reactive-list') && !!document.querySelector('.tw-flint-slot .reactive-table') && !!document.querySelector('.tw-flint-slot .reactive-tabs')`));
 await click(`document.querySelector('.tw-flint-slot .reactive-table .reactive-standoff-flow')`);await send('Input.insertText',{text:'!'},sessionId);await wait('document.querySelector(".tw-flint-slot .reactive-table").textContent.includes("!")');await key('z','KeyZ',4);await wait('!document.querySelector(".tw-flint-slot .reactive-table").textContent.includes("!")');
 await click(`[...document.querySelectorAll('.tw-flint-slot [role=tab]')].find(e=>e.textContent==='Details')`);await wait('document.querySelector(".tw-flint-slot").textContent.includes("Tab details")');

 await click(`[...document.querySelectorAll('.tw-flint-tabs button')].find(e=>!e.textContent.includes('Second Document'))`);await wait('document.querySelector(".tw-flint-slot")?.contains(proof.flow)');
 assert.equal(await evaluate('proof.creates-proof.baseCreates'),1);assert.equal(await evaluate('proof.snapshots'),0);
 // Use native scrolling in a short viewport, then switch Documents and retain its position.
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:360,deviceScaleFactor:1,mobile:false},sessionId);
 await wait('document.querySelector(".tw-flint-editor").clientHeight < 240');
 const wheelPoint=await evaluate(`(()=>{const r=document.querySelector('.tw-flint-editor').getBoundingClientRect();return {x:r.left+100,y:r.top+50};})()`);
 await send('Input.dispatchMouseEvent',{type:'mouseWheel',deltaY:120,deltaX:0,...wheelPoint},sessionId);await wait('document.querySelector(".tw-flint-editor").scrollTop>=100');
 const scrollTop=await evaluate('document.querySelector(".tw-flint-editor").scrollTop');
 await click(`[...document.querySelectorAll('.tw-flint-tabs button')].find(e=>e.textContent.includes('Second Document'))`);
 await click(`[...document.querySelectorAll('.tw-flint-tabs button')].find(e=>!e.textContent.includes('Second Document'))`);
 await wait('document.querySelector(".tw-flint-slot").contains(proof.flow)');
 assert(Math.abs(await evaluate('document.querySelector(".tw-flint-editor").scrollTop')-scrollTop)<2,'Document scroll position retained');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);await wait('document.querySelector(".tw-flint-editor").clientHeight>600');
 // Two application controllers share their existing canonical resource, but retain independent editor occurrences.
 await evaluate(`proof.editor.commandRegistry.execute('flint.open',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);
 await wait('document.querySelector(".tw-flint-menu select")');
 await evaluate('proof.snapshots=0;proof.switchCreates=proof.creates;proof.beforePeerSelection=proof.mount.captureInlineSelection()');
 await evaluate(`(()=>{const select=document.querySelector('.tw-flint-menu select');select.value=proof.ports.ports()[1].key;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait('!document.querySelector(".tw-flint-slot").contains(proof.flow)');
 await evaluate(`proof.peerSession=proof.ports.ports()[1].session();proof.peerNode=Object.values(proof.peerSession.projection.state.nodes).find(n=>n.payload.id===proof.textNode.payload.id);proof.peerMount=proof.editor.mounts.get(proof.peerNode.key);proof.peerMount.focus();proof.peerMount.restoreInlineSelection({anchor:0,head:0});`);
 await send('Input.insertText',{text:'X'},sessionId);await wait('proof.text().startsWith("X")');

 await evaluate(`(()=>{const select=document.querySelector('.tw-flint-menu select');select.value=proof.ports.ports()[0].key;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait('document.querySelector(".tw-flint-slot").contains(proof.flow)');assert.equal(await evaluate('proof.snapshots'),0);assert.equal(await evaluate('proof.creates-proof.switchCreates'),0);
 const peerSelection=await evaluate('({before:proof.beforePeerSelection,after:proof.mount.captureInlineSelection()})');assert.deepEqual(peerSelection.after,{anchor:peerSelection.before.anchor+1,head:peerSelection.before.head+1});
 await click(`document.querySelector('.textual-workspace [aria-haspopup]')`);await click(`[...document.querySelectorAll('.tw-popup button')].find(e=>e.textContent==='Return to Desktop')`);await wait('!document.querySelector(".textual-workspace")');
 assert(await evaluate('proof.flow.isConnected && proof.retained.element.parentElement===proof.originalParent && proof.retained.host.port===proof.source && getComputedStyle(proof.flow).fontFamily+" "+getComputedStyle(proof.flow).fontSize===proof.font'));
 await evaluate('proof.mount.focus()');await send('Input.insertText',{text:'Q'},sessionId);await wait('proof.text().includes("Q")');
 assert.equal(await evaluate('proof.snapshots'),0);
 const result={geometry,zoom,typing,trustedEditing:true,compositionSmoke:true,selectionPreservingFormatting:true,undoRedo:true,manualSave:true,newDocumentCancellation:true,saveAsAndCancel:true,serviceDialogVisible:true,slashPopupVisible:true,applicationSwitching:true,sharedOccurrenceSelection:true,scrollRetention:true,representativeListsTablesTabs:true,sameEditorCellAndTextNode:true,documentSwitching:true,desktopRoundTrip:true,snapshotsOutsideSave:0};
 await writeFile('/tmp/textual-flint-browser.json',JSON.stringify(result,null,2)+'\n');await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile('/tmp/textual-flint-desktop.png',Buffer.from(r.data,'base64')));console.log(JSON.stringify(result,null,2));
} catch(error) { console.error(error);process.exitCode=1; } finally {socket?.close();browser?.kill();server?.httpServer?.closeAllConnections();await Promise.race([server?.close(),new Promise(resolve=>setTimeout(resolve,1500))]);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
