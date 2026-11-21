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
const brokerFile=path.resolve('node_modules/.cache/dialectic-inventory-browser.mjs');
await build({stdin:{contents: "export {authoringExamples} from './src/features/dialectic/dcp/authoring.ts';export {createDialecticBroker} from './server/dialectic/broker.ts';export {plainContribution,streamFixture,sse} from './server/dialectic/fixtures.ts';",resolveDir:process.cwd()},outfile:brokerFile,bundle:true,platform:'node',format:'esm',packages:'external'});
const {authoringExamples,createDialecticBroker,plainContribution,streamFixture,sse}=await import(brokerFile);
const memoryRoot=await mkdtemp(path.join(tmpdir(),'dialectic-memory-'));
const remote=new Map(),requests=new Map(),wire=[];
const args={cursor:null,limit:20,contributionId:null,participantId:null,fromOrdinal:null};
const fake=async(url,init)=>{
 const pathname=new URL(url).pathname,body=init.body?JSON.parse(init.body):undefined;
 if(pathname==='/v1/conversations'){const id='conv_'+(remote.size+1);remote.set(id,[]);return Response.json({id});}
 if(pathname.startsWith('/v1/conversations/')){const id=pathname.split('/')[3];if(!remote.has(id))return new Response('',{status:404});if(body)remote.get(id).push(...body.items);return Response.json({id});}
 const control=body.input.find(i=>i.role==='user'&&i.content?.includes('"protocol":"dcp/1.0"'));if(control)requests.set(body.conversation,JSON.parse(control.content));
 const request=requests.get(body.conversation),remark=request.task.participantRequest.text.includes('Attach a remark'),output=body.input.find(i=>i.type==='function_call_output');
 if(!output)return sse(streamFixture('openai','',{id:'inventory',name:'list_text_blocks',arguments:{...args,limit:remark?1:20}}));
 const result=JSON.parse(output.output);
 if(remark&&result.items)return sse(streamFixture('openai','',{id:'read',name:'read_source',arguments:{handle:result.items[0].handle}}));
 const response=plainContribution(request.exchange,remark?'Attached the remark.':result.items.map(i=>i.preview+' — '+i.blockId).join('\n'));
 if(remark){response.replyTargets=[result.handle];response.anchors=[{id:'first',source:result.handle,revision:result.revision,selector:{exact:result.text,prefix:'',suffix:''}}];response.glosses=[{id:'remark',target:'first',type:'remark',text:'This is a test remark from OpenAI.'}];}
 return sse(streamFixture('openai',JSON.stringify(response)));
};
const tracked=async(url,init)=>{const body=init?.body?JSON.parse(init.body):null;wire.push({path:new URL(url).pathname,bytes:Buffer.byteLength(init?.body??''),...(body?.tools?{tools:body.tools.map(t=>t.name),inventoryInstructions:body.instructions?.includes('call list_text_blocks')}: {})});return (live?fetch:fake)(url,init);};
const broker=createDialecticBroker({currentCavern:()=>({path:memoryRoot,cavernGuid:'proof-cavern',session:'proof-session'}),fetcher:tracked,...(live?{}:{environment:{}})});
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
 editor.setAssetContext(()=>({cavernId:'proof-cavern',session:'proof-session'}));
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
 const key=async(key,code,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,modifiers,commands:modifiers===4?({a:['selectAll'],c:['copy'],v:['paste'],x:['cut']})[key]:undefined,windowsVirtualKeyCode:({c:67,a:65,v:86,x:88,Backspace:8,s:83,z:90,Enter:13,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,End:35,Home:36,' ':32,t:84,d:68,Escape:27})[key]??0},sessionId);};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/__dialectic`},sessionId);
 await wait('window.proof?.port()?.session() && document.querySelector("[data-dialectic-draft=true]")');
 const add=async text=>{await click('proof.editor.mounts.get(proof.text().key).focusElement');await send('Input.insertText',{text},sessionId);await click(button('Submit'));};
 const row=n=>`[...document.querySelectorAll('.dialectic-entry')].find(e=>e.querySelector('.dialectic-number')?.textContent==='${String(n).padStart(2,'0')}')`;
 const configure=async()=>{await click(`document.querySelector('.dialectic-provider-settings summary')`);if(!live){await click(`document.querySelector('[aria-label="Session API key"]')`);await send('Input.insertText',{text:'fixture-only-key'},sessionId);}await click(button('Use session settings'));await wait(`document.querySelector('[aria-label="Assistant mode"]')?.value==='live'`);await click(`document.querySelector('.dialectic-provider-settings summary')`);};
 const ask=async count=>{await click(button('Ask AI'));const end=Date.now()+125000;for(;;){const error=await evaluate(`document.querySelector('.dialectic-notice')?.textContent`);if(error)throw Error(error);if(await evaluate(`proof.committed().length===${count}&&!(${button('Ask AI')}).disabled`))break;if(Date.now()>end)throw Error('Provider timed out');await new Promise(r=>setTimeout(r,150));}};
 const ids=[];
 for(let i=0;i<11;i++){ids.push(await evaluate('proof.text().payload.id'));await add(i===0?'Our first sample concerns a garden.':`Sample ${i+1}: reading.`);}
 await add('Tell me what text blocks you can see. List the starting few words and block GUID.');await configure();await click(row(12));await ask(13);
 report.inventory=await evaluate(`(()=>{const d=proof.committed().at(-1).payload.metadata.dialectic.dcp;return {response:JSON.parse(d.response),tools:d.tools,receipt:d.provider.continuity,attempts:d.provider.attempts};})()`);
 assert(report.inventory.tools.some(t=>t.call.tool==='list_text_blocks'));
 const listed=report.inventory.tools.flatMap(t=>t.call.tool==='list_text_blocks'?t.result.items:[]);
 assert.equal(listed[0].preview,'Our first sample concerns a garden.');assert(ids.every(id=>listed.some(i=>i.blockId===id)));assert(ids.every(id=>JSON.stringify(report.inventory.response).includes(id)));
 report.correctEarlierBlockIds=ids.length;
 await add(`Attach a remark to the earlier TextBlock ${ids[0]}, beginning "Our first sample concerns a garden.": "This is a test remark from OpenAI." Obtain its fresh handle using list_text_blocks, then read_source. Use a Gloss of type remark and a discursive reference to that Block, not this instruction. Keep the response short.`);await click(row(14));await evaluate('proof.snapshots=0;proof.rebuilds=0;proof.started=performance.now()');await ask(15);
 report.remark=await evaluate(`(()=>{const d=proof.committed().at(-1).payload.metadata.dialectic.dcp,n=proof.port().session().projection.node(proof.committed()[0].children[0]),p=(n.payload.standoffProperties??[]).find(p=>p.type==='mutable/gloss');return {response:JSON.parse(d.response),tools:d.tools,receipt:d.provider.continuity,attempts:d.provider.attempts,sourceId:n.payload.id,sourceText:proof.editor.mounts.get(n.key).focusElement.textContent,sourceProtected:!proof.editor.canEditText(n.key),definition:p&&proof.root().payload.linkedAnnotations[p.annotationId],snapshots:proof.snapshots,rebuilds:proof.rebuilds,elapsedMs:performance.now()-proof.started,commitMs:proof.commitMs};})()`);
 assert(report.remark.tools.some(t=>t.call.tool==='read_source'));assert.equal(report.remark.sourceId,ids[0]);assert.equal(report.remark.sourceText,'Our first sample concerns a garden.');assert(report.remark.sourceProtected);assert.equal(report.remark.definition?.value,'remark: This is a test remark from OpenAI.');assert.equal(report.remark.snapshots+report.remark.rebuilds,0);assert.equal(report.remark.receipt.conversationId,report.inventory.receipt.conversationId);
 await click(row(15));await click(`[...document.querySelectorAll('.dialectic-annotation-link')].find(e=>e.textContent.includes('mutable/gloss'))`);await wait(`document.querySelector('[aria-label="Annotation inspection"]')`);
 report.inspection=await evaluate(`document.querySelector('[aria-label="Annotation inspection"]').textContent`);assert(report.inspection.includes('Our first sample concerns a garden.'));
 await writeFile(`docs/development/DIALECTIC_INVENTORY_${live?'LIVE':'FIXTURE'}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 report.live=live;report.wire=wire;report.outgoingBytes=live?wire.reduce((n,r)=>n+r.bytes,0):0;
 await writeFile(`docs/development/DIALECTIC_INVENTORY_${live?'LIVE':'FIXTURE'}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({live,correctEarlierBlockIds:report.correctEarlierBlockIds,remark:report.remark.definition?.value,outgoingBytes:report.outgoingBytes,commitMs:report.remark.commitMs}));
}catch(error){report.wire=wire;report.outgoingBytes=live?wire.reduce((n,r)=>n+r.bytes,0):0;report.failure=String(error);await writeFile(`docs/development/DIALECTIC_INVENTORY_${live?'LIVE':'FIXTURE'}.json`,JSON.stringify(report,null,2)+'\n');throw error;}finally{socket?.close();browser?.kill('SIGTERM');broker.dispose();server?.httpServer?.closeAllConnections?.();let cleanupTimer;await Promise.race([server?.close(),new Promise(resolve=>cleanupTimer=setTimeout(resolve,5000))]);clearTimeout(cleanupTimer);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});await rm(memoryRoot,{recursive:true,force:true,maxRetries:5,retryDelay:100});await rm(brokerFile,{force:true});stop?.();if(!report.failure)process.exit(0);}
