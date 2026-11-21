// Automated Chrome navigation qualification using copies of real saved Documents
// and their SQL source mappings. Hosted retrieval is refused; native Open/reveal is real.
// No user files are modified. Build the server before running.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {openRetrievalService} from '../src/retrieval/client.mjs';
import {openSqliteFoundation} from '../src/knowledge-sqlite/client.mjs';
import {hash} from '../src/retrieval/passages.mjs';
import esbuild from 'esbuild';const {build,stop}=esbuild;
import {createNativeDocumentStoreRouter} from '../dist/server/native-document-store.mjs';
import {createServer} from 'vite';
const artifacts='artifacts/retrieval-final';await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const config=JSON.parse(await readFile(path.join(artifacts,'config.json'),'utf8'));
const vaultRoot=config.root,vaultGuid=config.vaultGuid;
const retrieval=await openRetrievalService({vault:vaultRoot,vaultGuid,verifySavedSources:true,providerModule:new URL('./retrieval-acceptance-provider.mjs',import.meta.url).href,providerOptions:{ledger:config.ledger}});
const writer=await openSqliteFoundation({vault:vaultRoot});
const brokerFile=path.resolve('node_modules/.cache/retrieval-acceptance-broker.mjs');await build({stdin:{contents:"export {createDialecticBroker} from './server/dialectic/broker.ts';",resolveDir:process.cwd()},outfile:brokerFile,bundle:true,platform:'node',format:'esm',packages:'external'});
const {createDialecticBroker}=await import(brokerFile);const wire=[],retrievalCalls=[];
const broker=createDialecticBroker({testLogging:false,currentCavern:()=>({path:vaultRoot,cavernGuid:vaultGuid,session:'acceptance'}),fetcher:async(url,init)=>{
 if(new URL(url).pathname!=='/v1/responses')return fetch(url,init);
 const body=JSON.parse(init.body),ledger=JSON.parse(await readFile(config.ledger,'utf8'));
 assert(ledger.generativeCalls<6,'Six-call ceiling');assert.equal(body.model,'gpt-6.1-sol');assert(!body.conversation&&!body.previous_response_id,'No unbounded hidden history');assert(Buffer.byteLength(init.body)<200000,'Input-byte budget');assert(body.max_output_tokens<=4096,'Output budget');body.service_tier='default';
 ledger.generativeCalls++;await writeFile(config.ledger,JSON.stringify(ledger,null,2));const record={call:ledger.generativeCalls,started:Date.now(),request:body};wire.push(record);await writeFile(path.join(artifacts,'provider-wire.json'),JSON.stringify(wire,null,2));
 const response=await fetch(url,{...init,body:JSON.stringify(body)});record.status=response.status;let pending='';const decoder=new TextDecoder();
 if(!response.body)return response;
 return new Response(response.body.pipeThrough(new TransformStream({transform(chunk,c){pending+=decoder.decode(chunk,{stream:true}).replace(/\r\n/g,'\n');let end;while((end=pending.indexOf('\n\n'))>=0){const line=pending.slice(0,end).split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');pending=pending.slice(end+2);if(!line||line==='[DONE]')continue;const e=JSON.parse(line);if(['response.completed','response.incomplete','response.failed'].includes(e.type)){record.completed=Date.now();record.response=e.response;}}c.enqueue(chunk);},async flush(){await writeFile(path.join(artifacts,'provider-wire.json'),JSON.stringify(wire,null,2));}})),{status:response.status,headers:response.headers});
}});
const api=express();api.use(express.json({limit:'32mb'}));api.use('/api/dialectic',broker.router);
api.post('/api/retrieval/foreground',(_req,res)=>res.json({Success:true,Data:{ok:true}}));
api.post('/api/retrieval/query',async(req,res)=>{const record={query:req.body.query,strategy:req.body.strategy,resourceId:req.body.resourceId,started:Date.now()};retrievalCalls.push(record);try{const data=await retrieval.query(req.body.query,{...req.body,requireIndex:req.body.strategy==='hybrid',resourceId:req.body.resourceId??'5de5c3e7-983d-4467-829e-46cbdbe52b53',consent:config.queryConsent});Object.assign(record,{completed:Date.now(),data});res.json({Success:true,Data:data});}catch(e){record.error=String(e);res.status(409).json({Success:false,Error:String(e)});}finally{await writeFile(path.join(artifacts,'browser-retrieval.json'),JSON.stringify(retrievalCalls,null,2));}});
api.post('/api/retrieval/verify',async(req,res)=>{try{res.json({Success:true,Data:await retrieval.verify(req.body)});}catch(e){res.status(409).json({Success:false,Error:String(e)});}});
api.post('/__acceptance-index',async(req,res)=>{try{const file=config.files[1],bytes=await readFile(path.join(vaultRoot,file)),staged=await writer.stageSaved({bytes,vaultGuid,evidence:{path:file,contentHash:hash(bytes)}});await writer.commitSaved(staged.token);res.json(await retrieval.index('f4ce69a1-bfae-4770-902e-8f344cce1409',{consent:config.documentConsent}));}catch(e){res.status(500).json({error:String(e)});}});
api.use('/api/native',createNativeDocumentStoreRouter({root:vaultRoot,defaultVault:'.',establishVault:async()=>({vault:'.'}),nativeDiscoveryWorker:false}));
const vite=await createServer({plugins:[{
 name:'flint-integration-proof',enforce:'pre',
 transform(code,id){if(id.endsWith('/features/dialectic/controller.ts'))return code.replace('return {smallerImage,contentsRows','return (window as any).acceptanceController={smallerImage,contentsRows');},
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){if(id==='\0flint-proof')return `
 import {nativeDocumentSession} from '/src/persistence/native-session.ts';
 import {render} from 'solid-js/web';
 import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:true,sqliteKnowledge:false,sqliteEntities:false,flintProbe:false,flintSceneChrome:true,dialecticAutosave:false,dialecticAutomaticTitles:false,dcpTestPhaseLogging:false,dialecticProviderContinuity:false}});
 const editor=session.editor;
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host,native:nativeDocumentSession(editor)};
 `;},
 configureServer(server){server.middlewares.use((req,res,next)=>(req.url.startsWith('/api/')||req.url==='/__acceptance-index')?api(req,res,next):next());server.middlewares.use(async(req,res,next)=>{if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);chrome.once('exit',code=>reject(Error(`Chrome exited (${code}): ${out}`)));setTimeout(()=>reject(Error('Chrome timeout: '+out)),30000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown'){errors.push(m.params.exceptionDetails);console.log('Browser error',JSON.stringify(m.params.exceptionDetails));}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},120000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails){console.log('Browser exceptions',JSON.stringify(errors));throw Error(JSON.stringify(result.exceptionDetails));}return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1200;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await send('Page.bringToFront',{},sessionId);
 console.log("Waiting for Flint");
 await wait("window.proof && document.querySelector('.flint-application')");



 await wait(`document.body.innerText.includes('0/3 loaded')`);
 const results=[];for(const query of (process.env.DCP_ONLY==='1'?[]:['Prospero','Where do the wealthy hide from the suffering of the outside world?'])){
 const result=await evaluate(`(async()=>{
 const {editor}=proof;const wait=async f=>{for(let i=0;i<600;i++){if(f())return;await new Promise(r=>setTimeout(r,50));}throw Error('Navigation fixture timeout')};
 const node=[...editor.projections.values()].flatMap(v=>Object.values(v.state.nodes)).find(n=>n.viewType==='standoff-editor-block'&&editor.mounts.get(n.key)?.root.isConnected&&!editor.mounts.get(n.key).root.closest('[hidden],[inert]'));
 editor.mounts.get(node.key).focus();editor.mounts.get(node.key).restoreInlineSelection?.({anchor:0,head:0});
 await editor.commandRegistry.execute('autocomplete.search',{targetKey:node.key,args:undefined});
 await wait(()=>!!document.querySelector('.autocomplete-workstation input'));
 const input=document.querySelector('.autocomplete-workstation input');input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input',{bubbles:true}));
 await wait(()=>document.querySelectorAll('.autocomplete-results [role=option]').length>0);
 const s=editor.overlays.overlays.find(x=>x.viewType==='autocomplete').data.session;
 const lexicalAt=performance.now();const firstRows=JSON.parse(JSON.stringify(s.state.rows.map(r=>({id:r.id,reason:r.reason}))));await wait(()=>!s.state.busy);await new Promise(r=>setTimeout(r,400));const finalRows=JSON.parse(JSON.stringify(s.state.rows.map(r=>({id:r.id,reason:r.reason}))));const first=s.state.rows[0],start=performance.now();let navigationError='';const navigate=s.host.navigatePassage;s.host.navigatePassage=async(...args)=>{try{return await navigate(...args);}catch(e){navigationError=String(e);throw e;}};const choose=s.choose.bind(s);let done;s.choose=(...args)=>done=choose(...args);document.querySelector('.autocomplete-results [role=option]').click();await done;
 const targetNodes=[...editor.projections.values()].flatMap(v=>Object.values(v.state.nodes)).filter(n=>n.payload.id===first.data.source.spans[0].blockGuid);
 const mounted=targetNodes.find(n=>editor.mounts.get(n.key)?.root.isConnected&&!editor.mounts.get(n.key).root.closest('[hidden],[inert]'));
 const rect=mounted&&editor.mounts.get(mounted.key).root.getBoundingClientRect();return {query:${JSON.stringify(query)},firstRows,finalRows,retrievalStatus:s.state.retrievalStatus,lexicalAt,navigationError,error:s.state.error,phase:s.state.phase,alive:s.alive,opened:!!proof.native.location(first.data.source.resourceId),mountedTarget:!!mounted,visible:!!rect&&rect.bottom>0&&rect.top<innerHeight,selection:mounted?editor.mounts.get(mounted.key).captureInlineSelection?.():null,expected:JSON.parse(JSON.stringify(first.data.source.spans[0])),ms:performance.now()-start};
 })()`);
 results.push(result);console.log(JSON.stringify(result,null,2));await writeFile(path.join(artifacts,'scry-live.json'),JSON.stringify({results,errors},null,2));
 await writeFile(path.join(artifacts,'navigation.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 assert.equal(result.error,'');assert.equal(result.opened,true);assert.equal(result.mountedTarget,true);assert.equal(result.navigationError,'');assert.equal(result.visible,true);assert.deepEqual(result.selection,{anchor:result.expected.start,head:result.expected.end});
 }

 console.log('Opening saved Symposium');
 await evaluate(`(async()=>{const {editor}=proof;await editor.commandRegistry.execute('dialectic.open',{targetKey:proof.session.projection.state.rootKey,args:undefined});const {documentApplicationPorts}=await import('/src/application/document-application-ports.ts');const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic');const id=await proof.native.open({folder:'.',filename:${JSON.stringify(config.files[1])}});await port.application.openDocument(id);})()`);
 await wait(`window.acceptanceController?.resourceId()==='f4ce69a1-bfae-4770-902e-8f344cce1409'`);
 const prepared=await evaluate(`(async()=>{const c=acceptanceController,d=c.draft(),node=c.session().projection.node(d.key).children[0];c.editor.commands.replaceInlineRange(node,0,c.session().projection.node(node).inlineContent.length,'Use search_symposium to find my earlier positions about physical composition and identity, including my later doubt and your objections or qualifications. Read the relevant returned sources, then briefly compare how the position changed, citing the earlier contributions. Two paragraphs are enough.');proof.target=c.submit();const savedResult=await proof.native.save(c.resourceId());if(savedResult?.phase!=='saved')throw Error(JSON.stringify(savedResult));const response=await fetch('/__acceptance-index',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const indexed=await response.json();if(!response.ok)throw Error(JSON.stringify(indexed));await c.configureProvider({provider:'openai',model:'gpt-6.1-sol',maxOutputTokens:4096,repair:false,cadence:'conversational'});return {indexed,dirty:proof.native.isDirty(c.resourceId()),saved:proof.native.knowledgeEvidence(c.resourceId())};})()`);
 console.log('Saved and indexed test request',JSON.stringify(prepared));assert.equal(prepared.dirty,false);
 const began=Date.now();await evaluate(`acceptanceController.ask(proof.target)`);
 const dcp=await evaluate(`(()=>{const c=acceptanceController,r=c.committed().at(-1);return {notice:c.notice(),lastProvider:c.lastProviderExchange(),contribution:JSON.parse(JSON.stringify(c.session().projection.node(r.key).payload.metadata.dialectic))};})()`);
 await writeFile(path.join(artifacts,'dialectic-live.json'),JSON.stringify({prepared,ms:Date.now()-began,...dcp},null,2));console.log('DCP complete',JSON.stringify({notice:dcp.notice,author:dcp.contribution.author,tools:dcp.contribution.dcp?.tools?.map(x=>({call:x.call,result:x.result}))}));
 await writeFile(path.join(artifacts,'dialectic-live.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});await writeFile(path.join(artifacts,'final-storage.json'),JSON.stringify(await retrieval.status(),null,2));await retrieval.close();await writer.close();broker.dispose();stop?.();}
