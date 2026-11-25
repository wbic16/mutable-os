// Real-Flint two-stage Document Select All checks. Reads one native fixture into memory.
// No saves, load generation, or canonical service writes.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixturePath=process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink';
const fixture=await readFile(fixturePath);
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/select-all-proof';await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vite=await createServer({plugins:[{
 name:'flint-integration-proof',
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){if(id==='\0flint-proof')return `
 import {render} from 'solid-js/web';
 import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import '/src/assets/reset.css';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 localStorage.setItem('mutable.flint.compact-layout.v1',JSON.stringify({density:'reading'}));
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{directDomCharacterCells:${process.env.BENCHMARK_DIRECT_CELLS!=='false'},nativeDocumentPersistence:true,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true}});
 const editor=session.editor;
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const {admitNative}=await import('/src/persistence/native-resource.ts');
 admitNative(editor.repository,new Uint8Array(await (await fetch('/__letter')).arrayBuffer()),editor.repository.readState().placements[bank].contentKey);
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical workspace-demo--system-bar compact-document-workspace';host.setAttribute('data-window-work-area','');
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host};
 `;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url==='/__letter'){res.setHeader('Content-Type','application/json');res.end(fixture);return;}if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--window-size=1500,990','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.BENCHMARK_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},60000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{if(process.env.AUTOCOMPLETE_TRACE)console.log('EVAL '+expression.slice(0,180));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<900;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)).sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);
 const checks=[];
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};

 const click=async expression=>{const p=await evaluate(`(()=>{const el=${expression};if(!el)throw Error('Control missing');if(el.disabled)throw Error('Control disabled: '+el.textContent);el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(!el.contains(hit))throw Error('Control covered: '+el.textContent+' by '+hit?.outerHTML.slice(0,280));return{x,y}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(r))');};

 const chord=async(modifiers=4,key='a',code='KeyA',windowsVirtualKeyCode=65,commands=[])=>{
   await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,modifiers,commands},sessionId);
   await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode,modifiers},sessionId);
   await evaluate('new Promise(r=>requestAnimationFrame(r))');
 };
 await evaluate(`proof.counts={snapshots:0,commits:0,documentSelections:0};for(const [name,label] of [['snapshot','snapshots'],['commit','commits']]){const fn=proof.editor.repository[name].bind(proof.editor.repository);proof.editor.repository[name]=(...args)=>{proof.counts[label]++;return fn(...args)}}const all=proof.editor.crossText.selectDocument.bind(proof.editor.crossText);proof.editor.crossText.selectDocument=(...args)=>{proof.counts.documentSelections++;return all(...args)};proof.revision=proof.editor.repository.state.revision;proof.expected=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)?.focusElement.isConnected&&!proof.editor.mounts.get(n.key).focusElement.closest('[hidden],[inert],[aria-hidden="true"]')).map(n=>n.key)`);
 await chord();
 check('first Command-A selects only the active TextBlock',await evaluate(`(()=>{const r=proof.mount.captureInlineSelection();return r.anchor===0&&r.head===proof.text.inlineContent.length&&!proof.editor.crossText.range()&&proof.counts.documentSelections===0})()`));
 await chord();
 check('second Command-A selects every visible TextBlock, including nested containers',await evaluate(`proof.expected.length>1&&proof.editor.crossText.isDocumentSelection()&&proof.expected.length===Object.values(proof.editor.crossText.segments).filter(Boolean).length&&proof.expected.every(k=>proof.editor.crossText.segments[k])`));
 check('experimental pointer-selection preference remains disabled',await evaluate(`!proof.editor.crossText.enabled()`));
 check('browser input owns precisely the selected Document text',await evaluate(`document.activeElement.matches('[data-cross-text-input]')&&document.activeElement.value===proof.editor.crossText.selectedText().replace(/\\r\\n?/g,'\\n')&&document.activeElement.selectionStart===0&&document.activeElement.selectionEnd===document.activeElement.value.length`));
 await chord();check('further Command-A does not rescan the Document',await evaluate(`proof.counts.documentSelections===1`));
 check('selection creates no snapshots, commits, revisions or editor remounts',await evaluate(`proof.counts.snapshots===0&&proof.counts.commits===0&&proof.editor.repository.state.revision===proof.revision&&proof.editor.mounts.get(proof.text.key)===proof.mount`));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'document-selection.png'),Buffer.from(r.data,'base64')));
 await chord(0,'Escape','Escape',27);check('Escape returns to the source Document editor',await evaluate(`!proof.editor.crossText.range()&&!!document.activeElement.closest('.reactive-document-occurrence')`));
 await evaluate(`proof.mount.focus();proof.mount.restoreInlineSelection({anchor:1,head:1})`);await chord(2);await chord(2);
 check('Control-A provides the same two-stage selection',await evaluate(`proof.editor.crossText.isDocumentSelection()&&Object.values(proof.editor.crossText.segments).filter(Boolean).length===proof.expected.length`));
 await click(`proof.flow.querySelector('[data-inline-key]')`);
 check('clicking selected text restores ordinary caret input',await evaluate(`!proof.editor.crossText.range()&&document.activeElement===proof.mount.focusElement`));
 await evaluate(`proof.field=document.createElement('input');proof.field.value='Native field';proof.host.append(proof.field);proof.field.focus();proof.field.setSelectionRange(2,2)`);await chord(4,'a','KeyA',65,['selectAll']);
 check('native input retains browser Select All',await evaluate(`!proof.editor.crossText.range()&&proof.field.selectionStart===0&&proof.field.selectionEnd===proof.field.value.length`));
 await evaluate(`proof.field.remove();proof.mount.focus();proof.mount.restoreInlineSelection({anchor:100,head:100})`);
 await send('Input.insertText',{text:'(('},sessionId);await chord();await chord();
 check('Scry retains its phrase selection and suspended history',await evaluate(`!proof.editor.crossText.range()&&!proof.editor.repository.canUndo()&&!!document.querySelector('.autocomplete-workstation')`));
 await evaluate(`proof.editor.completionInput.cancel()`);
 check('no browser exceptions',errors.length===0);
 await writeFile(path.join(artifacts,'qualification.json'),JSON.stringify({browser:await send('Browser.getVersion'),checks,counts:await evaluate('proof.counts'),selectedBlocks:await evaluate('proof.expected.length'),errors},null,2));
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
