// Focused trusted-input qualification. Save transport is isolated in memory.
import {spawn} from 'node:child_process';
import express from 'express';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const stage4b=true;
const {build}=await import('esbuild');
const brokerFile=path.resolve('node_modules/.cache/dialectic-4c-browser.mjs');
await build({stdin:{contents: "export {createDialecticBroker} from './server/dialectic/broker.ts';export {plainContribution,streamFixture,sse} from './server/dialectic/fixtures.ts';",resolveDir:process.cwd()},outfile:brokerFile,bundle:true,platform:'node',format:'esm',packages:'external'});
const {createDialecticBroker,plainContribution,streamFixture,sse}=await import(brokerFile);
const wire=[];let aborted=0;
const broker=createDialecticBroker({environment:{},fetcher:async(url,init)=>{
 const body=JSON.parse(init.body),provider=url.includes('openai')?'openai':'anthropic';
 assert.equal(provider==='openai'?init.headers.authorization:init.headers['x-api-key'],provider==='openai'?'Bearer fixture-only-key':'fixture-only-key');
 wire.push({provider,model:body.model});
 if(body.model==='fixture-cancel')return new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>{aborted++;reject(Error('cancelled'));});});
 if(body.model==='fixture-rate-limit')return new Response('private upstream diagnostic',{status:429});
 const input=provider==='openai'?body.input:body.messages,request=JSON.parse(input[0].content);
 const corrected=input.some(i=>typeof i.content==='string'&&i.content.includes('host rejected'));
 if(body.model==='fixture-repair'&&!corrected)return sse(streamFixture(provider,JSON.stringify(plainContribution(request.exchange,'<bad>invalid</bad>'))));
 const read=provider==='openai'?input.some(i=>i.type==='function_call_output'):input.some(i=>Array.isArray(i.content)&&i.content.some(c=>c.type==='tool_result'));
 if(!read&&body.model!=='fixture-repair')return sse(streamFixture(provider,'',{id:'read-fixture',name:'read_source',arguments:{handle:request.primaryReply}}));
 return sse(streamFixture(provider,JSON.stringify(plainContribution(request.exchange,provider==='openai'?'Sounds lovely! Let’s bring a picnic on Saturday.':'I can bring fruit and a book to share.'))));
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
 });}}]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
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

 await click('proof.editor.mounts.get(proof.text().key).focusElement');
 await evaluate('proof.original=proof.text();proof.mount=proof.editor.mounts.get(proof.original.key);proof.retained=proof.port().session()');
 await send('Input.insertText',{text:'Shall we plan a family picnic and bring a book to discuss?'},sessionId);await click(button('Submit'));await wait('proof.committed().length===1');
 const settings=`document.querySelector('.dialectic-provider-settings')`;
 await click(settings+`.querySelector('summary')`);
 assert.equal(await evaluate(`document.querySelector('[aria-label="AI model"]').value`),'gpt-5.4-mini');report.defaultModel='gpt-5.4-mini';
 const fill=async(label,text)=>{await click(`document.querySelector('[aria-label="${label}"]')`);await key('a','KeyA',4);await send('Input.insertText',{text},sessionId);};
 const configure=async(model,provider)=>{
  // Native macOS select popups are outside CDP hit-testing; establish this one
  // control as fixture setup. Key/model typing and Apply/Ask use trusted input.
  if(provider)await evaluate(`(()=>{const e=document.querySelector('[aria-label="AI provider"]');e.value=${JSON.stringify(provider)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  if(provider==='anthropic')assert.equal(await evaluate(`document.querySelector('[aria-label="AI model"]').value`),'claude-sonnet-5-5');
  await evaluate(`(()=>{const e=document.querySelector('[aria-label="AI model"]');e.value='custom';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await fill('AI model ID',model);await fill('Session API key','fixture-only-key');await click(button('Use session settings'));await wait(`document.querySelector('[aria-label="Assistant mode"]').value==='live' && !document.querySelector('.dialectic-provider-settings fieldset').disabled`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Session API key"]').value`),'');
 };
 for(const provider of ['openai','anthropic']){
  await configure('fixture-'+provider,provider==='anthropic'?provider:undefined);
  await evaluate('proof.snapshots=0;proof.rebuilds=0;proof.started=performance.now()');await click(button('Ask AI'));await wait(`proof.committed().length===${provider==='openai'?2:3}`);
  report[provider]=await evaluate(`(()=>{const d=proof.committed().at(-1).payload.metadata.dialectic;return {observedMs:performance.now()-proof.started,commitMs:proof.commitMs,snapshots:proof.snapshots,rebuilds:proof.rebuilds,author:d.author,participant:d.participant.id,provider:d.dcp.provider.settings.provider,model:d.dcp.provider.attempts.at(-1).receipt.model,tools:d.dcp.tools.length,attempts:d.dcp.provider.attempts.length,definitions:Object.keys(proof.root().payload.linkedAnnotations??{}).length,sameMount:proof.editor.mounts.get(proof.original.key)===proof.mount,sameSession:proof.port().session()===proof.retained};})()`);
  assert.equal(report[provider].snapshots+report[provider].rebuilds,0);assert.equal(report[provider].definitions,0);assert.equal(report[provider].author,'ai');assert.equal(report[provider].provider,provider);assert(report[provider].sameMount&&report[provider].sameSession);assert.equal(report[provider].tools,1);
 }
 assert.equal(report.openai.participant,report.anthropic.participant);
 await click(button('Undo'));await wait('proof.committed().length===2');await click(button('Redo'));await wait('proof.committed().length===3');report.undoRedo=true;
 await configure('fixture-repair');await click(button('Ask AI'));await wait('proof.committed().length===4');report.repair=await evaluate('JSON.parse(JSON.stringify(proof.committed().at(-1).payload.metadata.dialectic.dcp.provider.attempts.map(a=>({repair:a.repair,usage:a.receipt.usage}))))');assert.equal(report.repair.length,2);assert.equal(report.repair[1].usage.output_tokens,20);
 await configure('fixture-cancel');await click(button('Ask AI'));await wait('document.querySelector(".dialectic-dcp-preview")');await new Promise(r=>setTimeout(r,80));const calls=wire.length;
 await click('proof.editor.mounts.get(proof.text().key).focusElement');await send('Input.insertText',{text:'I’ll bring sandwiches.'},sessionId);assert.equal(wire.length,calls);await click(button('Cancel response'));await new Promise(r=>setTimeout(r,150));assert.equal(await evaluate('proof.committed().length'),4);assert.equal(aborted,1);report.cancelWhileEditing={aborted,networkDuringTyping:wire.length-calls,snapshots:await evaluate('proof.snapshots'),rebuilds:await evaluate('proof.rebuilds')};
 await configure('fixture-rate-limit');const previous=wire.length;await click(button('Ask AI'));await wait(`document.querySelector('.dialectic-notice')?.textContent.includes('rate limit')`);assert.equal(wire.length-previous,1);assert.equal(await evaluate('proof.committed().length'),4);report.rateLimitNoRetry=true;
 await configure('fixture-anthropic');
 // Unrelated Documents stay outside provider capture/commit.
 await evaluate(`(()=>{const state=proof.editor.repository.readState(),root=state.contents[state.placements[state.rootPlacementKey].contentKey],bank=root.children.find(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block');for(let d=0;d<3;d++)proof.editor.commands.insert({id:'unrelated-'+d,type:'document-block',metadata:{documentId:'unrelated-'+d},children:Array.from({length:30},(_,i)=>({id:'unrelated-'+d+'-'+i,type:'standoff-editor-block',text:'Unrelated text. '.repeat(20),standoffProperties:[{id:'mark-'+i,type:'style/bold',start:0,end:8}]}))},{kind:'at',parentKey:bank,index:d+1});proof.otherRecords=Object.values(proof.editor.repository.readState().contents).filter(c=>String(c.payload.id).startsWith('unrelated-'));proof.snapshots=0;proof.rebuilds=0;proof.started=performance.now();})()`);
 await click(button('Submit & Ask'));await wait('proof.committed().length===6');report.submitAndAsk=await evaluate(`({observedMs:performance.now()-proof.started,commitMs:proof.commitMs,snapshots:proof.snapshots,rebuilds:proof.rebuilds,unrelatedUnchanged:proof.otherRecords.every(r=>proof.editor.repository.readState().contents[r.key]===r),repliedToSubmitted:proof.committed().at(-1).payload.metadata.dialectic.replies[0].blockId===proof.committed().at(-2).payload.id})`);assert(report.submitAndAsk.unrelatedUnchanged&&report.submitAndAsk.repliedToSubmitted);assert.equal(report.submitAndAsk.snapshots+report.submitAndAsk.rebuilds,0);
 await click(settings+`.querySelector('summary')`);
 await writeFile('docs/development/DIALECTIC_STAGE_4C_DESKTOP.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await click('[...document.querySelectorAll(".workspace-presentations button")].find(e=>e.textContent==="Textual")');await wait(`document.querySelector('.dialectic-textual')`);assert(await evaluate('proof.port().session()===proof.retained'));report.textual=true;
 await evaluate(`proof.editor.commandRegistry.execute('workspace.presentation.desktop',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);await wait(`proof.session.presentation.active()==='desktop' && document.querySelector('.dialectic-canvas').getBoundingClientRect().width>0`);report.desktopReturn=await evaluate('proof.port().session()===proof.retained');assert(report.desktopReturn);
 await click(button('Save'));await wait('!proof.native.isDirty(String(proof.root().payload.id))');assert(saved);assert(!JSON.stringify(saved).includes('fixture-only-key'));assert(!JSON.stringify(saved).includes('x-dialectic-session'));
 const ids=await evaluate('proof.committed().map(n=>n.payload.id)');await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic?reload`},sessionId);await wait(`window.proof?.committed().length===${ids.length}`);assert.deepEqual(await evaluate('proof.committed().map(n=>n.payload.id)'),ids);assert.equal(await evaluate(`document.querySelector('[aria-label="Assistant mode"]').value`),'mock');report.saveReload={contributions:ids.length,providerRecords:await evaluate('proof.committed().filter(n=>n.payload.metadata.dialectic.dcp?.provider).length'),keysForgotten:true};
 report.fixtureOnly=true;report.providerRequests=wire.length;await writeFile('docs/development/DIALECTIC_STAGE_4C_BROWSER.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{socket?.close();browser?.kill('SIGTERM');broker.dispose();await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});await rm(brokerFile,{force:true});}
