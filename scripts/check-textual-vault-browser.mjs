// Textual Vault explorer: retained Flint, trusted input and isolated in-memory transport.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile('vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
let saved;let card={id:'9f99bfe3-20fa-4b4e-9f83-728a556e2771',name:'Michelangelo',revision:0,nameStrata:null,descriptionDocument:null,imageRef:null,aliases:[]};const requests=[];
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
   const entity={id:'9f99bfe3-20fa-4b4e-9f83-728a556e2771',name:'Michelangelo',revision:0,aliases:[]};
   (await import('/src/application/entity-service.ts')).registerStandaloneEntityService(editor,()=>({
    names:async ids=>ids.map(id=>({id,name:entity.name})),dbMentions:async ids=>ids.map(id=>({id,mentions:0})),summaries:async ids=>({rows:ids.map(id=>({...entity,id})),complete:true,diagnostics:[]}),
    search:async(q,signal)=>({candidates:entity.name.toLowerCase().includes(q.query.toLowerCase())?[{id:entity.id,name:entity.name,evidence:[{kind:'name',text:entity.name}]}]:[],complete:true,diagnostics:[],current(){signal?.throwIfAborted();}}),
    get:async id=>id===entity.id?entity:undefined,dispose(){}
   }));
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
  `;},configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url==='/api/native/open'){for await(const chunk of req){}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{kind:'native',resourceId:JSON.parse(fixture).resourceId,text:fixture.toString(),baseline:{nativeHash:'original',markdownHash:null,generation:null}}}));return;}if(req.url==='/api/sqlite/knowledge/cardex'){let body='';for await(const chunk of req)body+=chunk;const {request:r}=JSON.parse(body);requests.push(r.op);let data={};
 if(r.op==='search')data={rows:!r.query||card.name.toLowerCase().includes(r.query.toLowerCase())?[card]:[],offset:0,next:null,previous:null};
 else if(r.op==='get')data={entity:card};
 else if(r.op==='save'){card={...card,...r,revision:card.revision+1};data={entity:card};}
 else if(r.op==='documents')data={rows:[{id:JSON.parse(fixture).resourceId,resourceGuid:JSON.parse(fixture).resourceId,title:'Letter source',mentions:1}],next:null,previous:null,complete:true};
 else if(['mentions','claims','relationships'].includes(r.op))data={rows:[],next:null,previous:null,complete:true};
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:data}));return;}
 if(req.url==='/__letter'){res.end(fixture);return;}if(req.url?.startsWith('/api/listFolders')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:['isolated']}));return;}if(req.url==='/api/native/save'){let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:saved.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:saved.generation.generation}}}));return;}next();});s.middlewares.use('/__textual-shell',(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/__textual-proof.js"></script></body></html>');});}
 }]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);browser.stderr.on('data',d=>{s+=d;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error('Browser exception:',JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},35000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1000;i++){if(${condition})return;await new Promise(r=>setTimeout(r,25));}throw Error('Condition timed out: '+${JSON.stringify(condition)})})()`).catch(async error=>{console.error(await evaluate(`({active:document.activeElement?.outerHTML.slice(0,300),focused:proof?.editor.focus.state.focusedKey,focusHidden:proof?.editor.mounts.get(proof.editor.focus.state.focusedKey)?.root.closest("[hidden],[inert]")?.outerHTML.slice(0,200),windowActive:proof?.editor.windowManager.registry.activeWindowId,status:document.querySelector('.tw-flint-status')?.textContent,dialog:document.querySelector('[role=dialog]')?.textContent,inputs:[...document.querySelectorAll('[role=dialog] input')].map(e=>e.value),location:window.proof?.native.location(window.proof.resourceId)})`));throw error;});
 const click=async expression=>{const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control');e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);const viewport=e.matches('.reactive-standoff-flow')?e.closest('.reactive-concertina-viewport'):undefined;if(viewport){const b=viewport.getBoundingClientRect();left=Math.max(left,b.left);right=Math.min(right,b.right);top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}if(right<=left||bottom<=top)throw Error('Control is clipped');const x=(left+right)/2,y=(top+bottom)/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('Control is covered: '+e.textContent.slice(0,60));return {x,y};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 await send('Runtime.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1754,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__textual-shell`},sessionId);
 const key=async(key,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,commands:key==='a'&&modifiers===4?['selectAll']:undefined,windowsVirtualKeyCode:({Home:36,Backspace:8,Tab:9,ArrowLeft:37,ArrowRight:39,Escape:27,ArrowDown:40,ArrowUp:38,Enter:13,a:65,z:90,s:83})[key]??0},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode:({Home:36,Backspace:8,Tab:9,ArrowLeft:37,ArrowRight:39,Escape:27,ArrowDown:40,ArrowUp:38,Enter:13,a:65,z:90,s:83})[key]??0},sessionId);};
 await wait('window.proof && document.querySelector(".flint-compact .reactive-standoff-flow")');
 await click(`[...document.querySelectorAll('.flint-document-tab [role=tab]')].find(e=>!e.textContent.includes('Second Document'))`);
 await evaluate(`proof.retained=proof.ports.ports()[0].session();proof.view=proof.retained.projection;proof.textNode=Object.values(proof.view.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.length>100);proof.mount=proof.editor.mounts.get(proof.textNode.key);proof.flow=proof.mount.focusElement;proof.cell=proof.flow.children[0];proof.originalTextNode=proof.cell.firstChild;proof.font=getComputedStyle(proof.flow).fontFamily+' '+getComputedStyle(proof.flow).fontSize;proof.originalParent=proof.retained.element.parentElement;proof.source=proof.retained.host.port;proof.text=()=>proof.textNode.inlineContent.map(key=>proof.view.node(key).payload.text??'').join('');proof.beforeText=proof.text();proof.baseCreates=proof.creates;proof.snapshots=0;proof.editor.focus.request(proof.textNode.key);proof.mount.restoreInlineSelection({anchor:20,head:25});`);

 await click(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Textual')`);await wait('document.querySelector(".tw-vault-file") && getComputedStyle(proof.flow).fontFamily.includes("IBM Plex Mono")');
 await evaluate(`proof.vault=proof.ports.ports()[0].application.vault;proof.listings=0;for(const name of ['browseVault','discoverVault']){const original=proof.native[name].bind(proof.native);proof.native[name]=(...args)=>{proof.listings++;return original(...args)}}proof.tree=document.querySelector('.tw-vault-tree');proof.file=document.querySelector('.tw-vault-file');proof.frame=document.querySelector('.tw-flint-editor');proof.width=proof.frame.getBoundingClientRect().width;proof.revision=proof.editor.repository.state.revision;proof.mount.focus();proof.mount.restoreInlineSelection({anchor:20,head:25});proof.range=proof.mount.captureInlineSelection();`);
 assert(await evaluate('!document.querySelector(".tw-vault").hidden && document.querySelector(".tw-vault").getBoundingClientRect().right<=proof.frame.getBoundingClientRect().left+.1'));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile('/tmp/textual-vault.png',Buffer.from(r.data,'base64')));
 await click("document.querySelector('[aria-label=\"Collapse Vault explorer\"]')");await wait('document.querySelector(".tw-vault").hidden');assert(await evaluate('proof.frame.getBoundingClientRect().width>proof.width'));
 await click("document.querySelector('[aria-label=\"Toggle Vault explorer\"]')");await wait('!document.querySelector(".tw-vault").hidden');assert(await evaluate('document.querySelector(".tw-vault-tree")===proof.tree && document.querySelector(".tw-vault-file")===proof.file && proof.flow.children[0]===proof.cell'));
 assert.deepEqual(await evaluate('proof.mount.captureInlineSelection()'),await evaluate('proof.range'));assert.equal(await evaluate('proof.editor.repository.state.revision'),await evaluate('proof.revision'));assert.equal(await evaluate('proof.listings'),0);
 // Existing Vault openFile dispatch returns to an already retained document.
 await click(`[...document.querySelectorAll('.tw-flint-tabs button')].find(e=>e.textContent.includes('Second Document'))`);await click('document.querySelector(".tw-vault-file")');await wait('proof.ports.ports()[0].session()===proof.retained');assert.equal(await evaluate('document.querySelector(".tw-vault-file").getAttribute("aria-current")'),'page');
 await evaluate(`proof.rowMutations=0;proof.rowObserver=new MutationObserver(records=>proof.rowMutations+=records.length);proof.rowObserver.observe(proof.tree,{subtree:true,attributes:true,childList:true,characterData:true});proof.mount.focus();proof.mount.restoreInlineSelection({anchor:20,head:25});proof.beforeTyping=proof.text();proof.listings=0;`);
 await send('Input.insertText',{text:'X'},sessionId);await wait('proof.text()!==proof.beforeTyping');await key('z','KeyZ',4);await wait('proof.text()===proof.beforeTyping');assert.equal(await evaluate('proof.rowMutations'),0);assert.equal(await evaluate('proof.listings'),0);
 await click("document.querySelector('[aria-label=\"Collapse Vault explorer\"]')");await click('document.querySelector(".textual-workspace [aria-haspopup]")');await click(`[...document.querySelectorAll('.tw-command-menu button')].find(e=>e.textContent==='Return to Desktop')`);await wait('!document.querySelector(".textual-workspace")');assert(await evaluate('proof.retained.element.parentElement===proof.originalParent'));
 await click(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Textual')`);await wait('document.querySelector(".tw-vault")');assert(await evaluate('document.querySelector(".tw-vault").hidden'));
 await click("document.querySelector('[aria-label=\"Toggle Vault explorer\"]')");await send('Emulation.setDeviceMetricsOverride',{width:650,height:800,deviceScaleFactor:1,mobile:false},sessionId);await wait('document.querySelector(".tw-vault").hasAttribute("data-overlay")');
 const result=await evaluate('({defaultLeft:true,collapseReopen:true,retainedTree:true,selectionPreserved:true,openFile:true,typingUndo:true,typingRowMutations:proof.rowMutations,typingListings:proof.listings,snapshots:proof.snapshots,rebuilds:proof.rebuilds,desktopReturn:true,collapseRemembered:true,narrowOverlay:true})');console.log(result);await writeFile('/tmp/textual-vault-results.json',JSON.stringify(result,null,2));
} catch(error) { console.error(error);process.exitCode=1; } finally {socket?.close();browser?.kill();server?.httpServer?.closeAllConnections();await Promise.race([server?.close(),new Promise(resolve=>setTimeout(resolve,1500))]);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
