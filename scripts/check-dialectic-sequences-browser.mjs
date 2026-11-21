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
 if(restoredId)await port().application.openDocument(restoredId);
 window.proof={session,editor,native,port,captureNative,nativeBytes,decodeNative,snapshots:0,rebuilds:0,creates:0};
 proof.root=()=>port().session().projection.node(port().session().rootKey);proof.rows=()=>proof.root().children.map(k=>port().session().projection.node(k)).filter(n=>n.payload.metadata?.dialectic?.kind==='contribution');proof.committed=()=>proof.rows().filter(n=>n.payload.metadata.dialectic.state==='committed');
 proof.draft=()=>proof.rows().find(n=>n.payload.metadata.dialectic.state==='draft');proof.text=()=>port().session().projection.node(proof.draft().children[0]);
 const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=(...a)=>{proof.snapshots++;(proof.snapshotTraces??=[]).push(new Error().stack);return snapshot(...a)};
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
 await evaluate(`(()=>{const text=(id,text)=>({id,type:'standoff-editor-block',text,standoffProperties:[{id:'mark-'+id,type:'style/bold',start:0,end:3}]});
 proof.editor.commands.insert({id:'native-example',type:'container-block',children:[
 {id:'native-tabs',type:'tab-row-block',metadata:{orientation:'vertical'},children:[{id:'native-tab-a',type:'tab-block',metadata:{name:'Thesis'},children:[text('thesis','Form is evidence.')]},{id:'native-tab-b',type:'tab-block',metadata:{name:'Counterpoint'},children:[text('counterpoint','Context can change the reading.')]}]},
 {id:'native-table',type:'table-block',children:[{type:'table-row-block',children:[{type:'table-cell-block',children:[text('claim','Claim')]},{type:'table-cell-block',children:[text('support','Support')]}]}]},
 {id:'native-surface',type:'surface-block',metadata:{reversible:true},children:[{type:'side-block',children:[text('front','An interpretation has another side.')]},{type:'side-block',children:[text('back','Reverse: a competing source remains accessible.'),{id:'native-player',type:'youtube-video-block',metadata:{url:'https://youtu.be/dQw4w9WgXcQ'}}]}]},
 {id:'native-link',type:'standoff-editor-block',text:'Open reference',standoffProperties:[{id:'native-url',type:'reference/url',start:0,end:13,value:'https://example.test/reference'}]},
 {id:'native-unknown',type:'unqualified-widget',metadata:{name:'Unsupported explicitly'}}
 ]},{kind:'at',parentKey:proof.committed()[0].key,index:1});
 const create=proof.editor.createView.bind(proof.editor);proof.editor.createView=(...a)=>{const p=create(...a),build=p.build.bind(p),inline=p.updateInline.bind(p);p.build=(...b)=>{proof.rebuilds++;return build(...b)};p.updateInline=(...b)=>{if(p.nodesForContent(b[0]).length)proof.passiveUpdates=(proof.passiveUpdates??0)+1;return inline(...b)};return p;};
 })()`);
 await click('document.querySelector(".dialectic-sidebar .dialectic-entry")');
 await click(button('New Sequence'));await wait('document.querySelector("[aria-label=\\"Sequence title\\"]")');
 await click('document.querySelector("[aria-label=\\"Sequence title\\"]")');await key('a','KeyA',4);await send('Input.insertText',{text:'The form of an argument'},sessionId);
 await click(button('Add inspected source'));await click(button('Add inspected source'));
 assert.equal(await evaluate(`document.querySelector('[aria-label="Sequence title"]').value`),'The form of an argument');
 await evaluate('proof.snapshots=0;proof.snapshotTraces=[];proof.rebuilds=0;proof.started=performance.now()');await click(button('Apply Sequence'));
 await wait('Object.keys(proof.root().payload.metadata.dialectic.sequences??{}).length===1');
 report.authoring=await evaluate('({observedMs:performance.now()-proof.started,snapshots:proof.snapshots,rebuilds:proof.rebuilds,sameMount:proof.editor.mounts.get(proof.original.key)===proof.mount})');assert.equal(report.authoring.snapshots,0);assert.equal(report.authoring.rebuilds,0);
 await click(button('Undo'));await wait('!Object.keys(proof.root().payload.metadata.dialectic.sequences??{}).length');await click(button('Redo'));await wait('Object.keys(proof.root().payload.metadata.dialectic.sequences??{}).length===1');
 await evaluate('proof.started=performance.now();proof.before=proof.editor.repository.state.revision;proof.sessions=proof.editor.documentSessions.sessions().length;proof.snapshots=0;proof.rebuilds=0');await evaluate(`(${button('Present')}).addEventListener('click',()=>{proof.started=performance.now()},{once:true,capture:true})`);await click(button('Present'));
 await wait('document.querySelectorAll(".dialectic-sequence-reader [data-ready=true]").length===2');
 report.open=await evaluate(`({observedUntilUsableMs:performance.now()-proof.started,mountWorkMs:[...document.querySelectorAll('.dialectic-sequence-reader .native-passive-composition')].map(e=>Number(e.dataset.mountMs)),snapshots:proof.snapshots,rebuilds:proof.rebuilds,revisionUnchanged:proof.editor.repository.state.revision===proof.before,passiveViews:proof.editor.passiveViews.size,newSessions:proof.editor.documentSessions.sessions().length-proof.sessions,sameSession:proof.retained===proof.port().session(),sameMount:proof.editor.mounts.get(proof.original.key)===proof.mount})`);assert(report.open.revisionUnchanged&&report.open.sameSession&&report.open.sameMount);assert.equal(report.open.passiveViews,2);assert.equal(report.open.newSessions,0);assert.equal(report.open.snapshots,0);
 const panels=`[...document.querySelectorAll('.dialectic-sequence-reader .dialectic-perspective')]`;
 await click(`${panels}[0].querySelector('[role=tablist]').children[1]`);await wait(`${panels}[0].querySelector('[aria-selected=true]')?.textContent==='Counterpoint'`);
 assert.equal(await evaluate(`${panels}[1].querySelector('[aria-selected=true]').textContent`),'Thesis');report.open.observedFirstSuccessfulNativeInteractionMs=await evaluate('performance.now()-proof.started');
 await click(`${panels}[0].querySelector('.surface-fold')`);await wait(`${panels}[0].querySelector('.surface-fold').getAttribute('aria-label')==='Return to front side'`);
 assert.equal(await evaluate(`${panels}[1].querySelector('.surface-fold').getAttribute('aria-label')`),'Show reverse side');
 report.interactions={independentTabs:true,independentFaces:true,unavailable:await evaluate(`${panels}[0].querySelector('.native-passive-unavailable').textContent`)};
 // Isolated player document: actual browser media playback, without depending on a remote provider.
 const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
 const player=`<!doctype html><style>body{background:#eceee9;font:16px system-ui}video{width:100%;height:80px}</style><p>Native media player</p><video controls loop src="data:audio/wav;base64,${wav.toString('base64')}"></video><button onclick="document.querySelector('video').play()">Play fixture</button>`;
 const frame=`${panels}[0].querySelector('iframe')`;
 assert.match(await evaluate(`${frame}.src`),/youtube-nocookie.com/);
 await evaluate(`${frame}.srcdoc=${JSON.stringify(player)}`);await wait(`${frame}.contentDocument?.querySelector('button')`);
 const play=await evaluate(`(()=>{const f=${frame};f.scrollIntoView({block:'nearest'});const a=f.getBoundingClientRect(),b=f.contentDocument.querySelector('button').getBoundingClientRect();return {x:a.x+b.x+b.width/2,y:a.y+b.y+b.height/2};})()`);
 for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...play},sessionId);
 await wait(`${frame}.contentDocument.querySelector('video').currentTime>0`);report.interactions.mediaPlayback='HTMLMediaElement in isolated native iframe; external provider not exercised';
 await evaluate(`window.open=(...args)=>{proof.openedLink=args;return null;}`);await click(`${panels}[0].querySelector('[data-block-id=native-link] [data-inline-index]')`);assert.equal(await evaluate('proof.openedLink?.[0]'),'https://example.test/reference');report.interactions.links=true;
 await send('Browser.grantPermissions',{origin:`http://127.0.0.1:${server.httpServer.address().port}`,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 const word=await evaluate(`(()=>{const e=${panels}[0].querySelector('.reactive-standoff-flow');e.scrollIntoView({block:'nearest'});const r=e.firstElementChild.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,button:'left',clickCount:2,...word},sessionId);
 const copied=await evaluate('getSelection().toString()');assert(copied.length);await key('c','KeyC',4);assert.equal(await evaluate('navigator.clipboard.readText()'),copied);report.interactions.nativeSelectionAndCopy=true;

 await click(`${panels}[0].querySelector('.reactive-standoff-flow')`);await key('z','KeyZ',4);await key('x','KeyX',4);await key('v','KeyV',4);await key('Backspace','Backspace');await send('Input.insertText',{text:'MUST NOT AUTHOR'},sessionId);await send('Input.imeSetComposition',{text:'試',selectionStart:1,selectionEnd:1},sessionId);
 assert.equal(await evaluate('proof.editor.repository.state.revision'),await evaluate('proof.before'));report.passiveInput={undoCutPasteDeleteTypingAndIMEBlocked:true};
 await evaluate("proof.sourceStart=performance.now();proof.editor.commands.replaceInlineRange(proof.original.key,0,0,'Updated source: ');proof.sourceMutationMs=performance.now()-proof.sourceStart");await wait(`${panels}[0].textContent.includes('Updated source:')&&${panels}[1].textContent.includes('Updated source:')`);report.sourcePropagation={mutationMs:await evaluate('proof.sourceMutationMs'),bothOccurrencesUpdated:true,sameMount:await evaluate('proof.editor.mounts.get(proof.original.key)===proof.mount')};
 await click(button('Return to conversation'));await wait('proof.editor.passiveViews.size===0');
 // Fixture setup outside measured work: multiple independent annotated Documents.
 await evaluate(`(()=>{proof.editor.commands.insert({id:'unrelated-bank',type:'workspace-object-bank-block',children:Array.from({length:3},(_,d)=>({id:'unrelated-doc-'+d,type:'document-block',children:Array.from({length:100},(_,i)=>({id:'unrelated-'+d+'-'+i,type:'standoff-editor-block',text:'Unrelated annotated material '.repeat(4),standoffProperties:[{id:'annotation-'+i,type:'style/underline',start:0,end:8}]}))}))},{kind:'at',parentKey:proof.session.projection.state.rootKey,index:0});proof.unrelated=Object.values(proof.session.projection.state.nodes).find(n=>n.payload.id==='unrelated-0-0');})()`);
 await click(button('Present'));await wait('proof.editor.passiveViews.size===2');
 await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
 await evaluate(`proof.passiveLayoutReads=0;proof.rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){if(this.closest('[data-native-passive]'))proof.passiveLayoutReads++;return proof.rect.call(this)};proof.rebuilds=0;proof.snapshots=0;proof.passiveUpdates=0`);
 report.unrelated=await evaluate(`(()=>{const start=performance.now();for(let i=0;i<20;i++)proof.editor.commands.replaceInlineRange(proof.unrelated.key,0,0,'x');return {updates:proof.passiveUpdates,snapshots:proof.snapshots,rebuilds:proof.rebuilds,twentyEditsMs:performance.now()-start,documents:3,paragraphs:300};})()`);assert.equal(report.unrelated.updates,0);assert.equal(report.unrelated.snapshots,0);assert.equal(report.unrelated.rebuilds,0);
 await evaluate('new Promise(r=>setTimeout(r,150))');report.unrelated.passiveLayoutReads=await evaluate('proof.passiveLayoutReads');assert.equal(report.unrelated.passiveLayoutReads,0);await evaluate('Element.prototype.getBoundingClientRect=proof.rect');
 await evaluate(`${frame}.srcdoc=${JSON.stringify(player)}`);await wait(`${frame}.contentDocument?.querySelector('video')?.readyState>=2`);
 await writeFile('docs/development/DIALECTIC_INCREMENT_3_DESKTOP.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 console.log('Native groups, passive input, live source propagation and unrelated Documents passed');
 await click(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Textual')`);
 await wait('document.querySelectorAll(".dialectic-textual .native-passive-composition[data-ready=true]").length===2');
 assert.equal(await evaluate('proof.editor.passiveViews.size'),2);
 assert.equal(await evaluate(`document.querySelector('.dialectic-textual .dialectic-perspective [aria-selected=true]').textContent`),'Counterpoint');
 report.textual={sameSession:await evaluate('proof.port().session()===proof.retained'),sameMount:await evaluate('proof.editor.mounts.get(proof.original.key)===proof.mount'),independentStateRestored:true};
 await evaluate(`${frame}.srcdoc=${JSON.stringify(player)}`);await wait(`${frame}.contentDocument?.querySelector('video')?.readyState>=2`);
 await writeFile('docs/development/DIALECTIC_INCREMENT_3_TEXTUAL.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await evaluate(`proof.session.editor.commandRegistry.execute('workspace.presentation.desktop',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);
 await wait('!document.querySelector(".dialectic-textual")&&proof.editor.passiveViews.size===2');
 await click(`${panels}[0].querySelector('header button')`);await wait('proof.editor.passiveViews.size===0');
 await click('proof.mount.focusElement');await evaluate('proof.snapshots=0;proof.snapshotTraces=[];proof.rebuilds=0;proof.started=performance.now()');await send('Input.insertText',{text:'Source editing works. '},sessionId);await wait('proof.mount.captureText().includes("Source editing works.")');
 report.sourceEditing=await evaluate('({observedMs:performance.now()-proof.started,snapshots:proof.snapshots,rebuilds:proof.rebuilds,sameMount:proof.editor.mounts.get(proof.original.key)===proof.mount})');assert.equal(report.sourceEditing.snapshots,0);assert.equal(report.sourceEditing.rebuilds,0);
 await click(button('Save'));await wait('!proof.native.isDirty(String(proof.root().payload.id))');assert(saved);
 report.persistence=await evaluate(`(()=>{const source=proof.captureNative(proof.editor.repository.readState(),String(proof.root().payload.id));const loaded=proof.decodeNative(proof.nativeBytes(source));const doc=Object.values(loaded.contents).find(c=>c.viewType==='document-block');return {sequences:Object.keys(doc.payload.metadata.dialectic.sequences).length,members:Object.values(doc.payload.metadata.dialectic.sequences)[0].groups[0].members.length};})()`);assert.deepEqual(report.persistence,{sequences:1,members:2});
 const memberIds=await evaluate(`Object.values(proof.root().payload.metadata.dialectic.sequences)[0].groups[0].members.map(m=>m.id)`);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic?reload`},sessionId);
 await wait('window.proof?.root()?.payload.metadata.dialectic.sequences');
 assert.deepEqual(await evaluate(`Object.values(proof.root().payload.metadata.dialectic.sequences)[0].groups[0].members.map(m=>m.id)`),memberIds);
 await click(button('Present'));await wait('proof.editor.passiveViews.size===2');await wait(`${panels}[0].textContent.includes('Source editing works.')`);report.persistence.reloaded=true;

 await writeFile('docs/development/DIALECTIC_INCREMENT_3_BROWSER.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));


}finally{socket?.close();browser?.kill('SIGTERM');await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
