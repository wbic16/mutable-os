// Real Chrome qualification of Dialectic's shared retained Document tabs. No provider calls.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import express from 'express';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
const directory=process.env.DCP_OUTPUT??'artifacts/dialectic-concurrent-sessions';await mkdir(directory,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'dialectic-concurrent-sessions-'));
let server,browser,socket,saved,saves=0,broker;const jobs=[],requests=[];
const eventBytes=event=>new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n');
try{
 await build({stdin:{contents:"export {createDialecticBroker} from './server/dialectic/broker.ts';export {streamFixture} from './server/dialectic/fixtures.ts';",resolveDir:process.cwd()},outfile:path.resolve('node_modules/.cache/dialectic-concurrent-broker.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',target:'node22'});
 const {createDialecticBroker,streamFixture}=await import(pathToFileURL(path.resolve('node_modules/.cache/dialectic-concurrent-broker.mjs')).href);
 broker=createDialecticBroker({environment:{OPENAI_API_KEY:'isolated-test-key'},continuity:false,fetcher:async(_url,init)=>{
  const wire=JSON.parse(init.body);requests.push(wire);let stream;
  const body=new ReadableStream({start(c){stream=c;},cancel(){}});
  const job={signal:init.signal,model:wire.model,text:'',write(delta){this.text+=delta;stream.enqueue(eventBytes({type:'response.output_text.delta',delta}));},finish(delta){this.write(delta);stream.enqueue(eventBytes(streamFixture('openai',this.text).at(-1)));stream.close();}};
  jobs.push(job);return new Response(body,{headers:{'content-type':'text/event-stream'}});
 }});
 server=await createServer({cacheDir:'node_modules/.cache/dialectic-sessions',server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-sessions',enforce:'pre',transform(code,id){if(id.includes('/dialectic/attachments.browser.tsx'))return code.replace(/dialecticProviderContinuity\s*:\s*false/,'dialecticArtifacts:false,dialecticImageGeneration:false,dialecticProviderContinuity:false');},configureServer(s){
  const app=express();app.use('/api/dialectic',broker.router);s.middlewares.use(app);
  s.middlewares.use(async(req,res,next)=>{
   if(req.url==='/__attachment-proof'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/src/features/dialectic/attachments.browser.tsx"></script></body></html>');return;}
   if(req.url==='/__configuration'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cavernId:'fixture',session:'fixture'}));return;}
   if(req.url==='/api/native/save'){let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);saves++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:saved.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:saved.generation.generation}}}));return;}
   if(req.url==='/api/native/open'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{kind:'native',resourceId:saved.generation.resourceId,native:saved.generation.native,baseline:{nativeHash:'saved',markdownHash:null,generation:saved.generation.generation}}}));return;}
   if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:false,Error:'Isolated session fixture'}));return;}next();
  });
 }}]});await server.listen();
 browser=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[...(process.env.DCP_HEADED==='1'?[]:['--headless=new']),'--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let data='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',chunk=>{data+=chunk;const m=data.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.once('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled')console.error('Browser:',m.params.args.map(a=>a.value??a.description).join(' '));if(m.method==='Runtime.exceptionThrown')console.error(JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(expression.slice(0,200)+' '+JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Runtime.enable',{},sessionId);await send('Page.bringToFront',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 const origin='http://127.0.0.1:'+server.httpServer.address().port;
 const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,500));}const state=await evaluate(`({location:location.href,body:document.body.innerText.slice(-4000)})`);throw Error('Timed out: '+expression+' '+JSON.stringify(state));};
 await send('Page.navigate',{url:origin+'/__attachment-proof'},sessionId);await wait(`window.proof?.ready && document.querySelector('[aria-label="Choose attachments"]')`);console.log('Session fixture ready',await evaluate('({artifacts:proof.editor.features.dialecticArtifacts})'));

 const waitJobs=async count=>{for(let i=0;i<200&&jobs.length<count;i++)await new Promise(r=>setTimeout(r,50));assert.equal(jobs.length,count,await evaluate('document.body.innerText.slice(-5000)'));};
 const type=async text=>{await evaluate(`proof.editor.focus.request(proof.text().key,{reason:'qualification',caret:'end'});true`);await send('Input.insertText',{text},sessionId);};
 const submit=()=>evaluate(`document.querySelector('[aria-label="Submit contribution"]').click();true`);
 const next=()=>evaluate(`(()=>{const add=document.querySelector('.dialectic-canvas .dialectic-add-conversation');if(add.parentElement.lastElementChild!==add)throw Error('Add Conversation must follow the last tab');add.click();return true;})()`);
 await evaluate(`proof.firstId=proof.root().payload.id;proof.firstSession=proof.port.session();proof.port.application.renameDocument(proof.firstId,'First conversation');true`);
 await type('Question in A');await submit();await waitJobs(1);
 jobs[0].write('<response><p>A is streaming in its native Document.</p>');
 await wait(`proof.rows().some(n=>n.payload.metadata.dialectic.state==='receiving')`);
 await next();await wait('proof.root().payload.id!==proof.firstId');
 await evaluate(`proof.secondId=proof.root().payload.id;proof.port.application.renameDocument(proof.secondId,'Second conversation');true`);
 await type('Question in B');await submit();await waitJobs(2);assert.equal(jobs[0].signal.aborted,false);
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('.dialectic-canvas>.reactive-tabs>.reactive-tabs__panel')).filter(p=>getComputedStyle(p).display!=='none').length`),1);
 assert((await evaluate(`document.querySelector('.reactive-tabs__labels').innerText`)).includes('Responding'));
 await evaluate(`proof.textualSession=proof.port.session();proof.editor.commandRegistry.execute('workspace.presentation.textual',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);
 await wait(`document.querySelector('.dialectic-textual .reactive-standoff-flow')`);assert.equal(jobs[0].signal.aborted,false);assert.equal(jobs[1].signal.aborted,false);assert.equal(await evaluate('proof.port.session()===proof.textualSession'),true);
 assert.equal(await evaluate(`document.querySelectorAll('.dialectic-textual [role="tab"]').length`),2);
 await evaluate(`(()=>{const add=document.querySelector('.dialectic-textual .dialectic-add-conversation');if(add.parentElement.lastElementChild!==add)throw Error('Textual add control must follow the last tab');add.click();return true;})()`);
 await wait(`document.querySelectorAll('.dialectic-textual [role="tab"]').length===3`);assert.notEqual(await evaluate('proof.root().payload.id'),await evaluate('proof.secondId'));assert.equal(jobs[0].signal.aborted,false);assert.equal(jobs[1].signal.aborted,false);
 await evaluate(`proof.port.closeTab(proof.port.activeTab());true`);await wait('proof.port.session()===proof.textualSession');

 await evaluate(`proof.editor.commandRegistry.execute('workspace.presentation.desktop',{targetKey:proof.session.projection.state.rootKey,args:undefined})`);await wait(`!document.querySelector('.dialectic-textual')`);assert.equal(await evaluate('proof.port.session()===proof.textualSession'),true);

 jobs[1].finish('<response><p>B finished first.</p></response>');await wait(`proof.rows().filter(n=>n.payload.metadata.dialectic.state==='committed').length===2`);
 assert.equal(jobs[0].signal.aborted,false);jobs[0].finish('<p>A finished second.</p></response>');
 await wait(`document.querySelector('.reactive-tabs__labels').innerText.match(/Complete/g)?.length===2`);
 await evaluate(`proof.port.application.openDocument(proof.firstId);true`);await wait(`document.querySelector('.reactive-tabs__panel:not([hidden])').innerText.includes('A finished second')`);
 assert(!(await evaluate(`document.querySelector('.reactive-tabs__panel:not([hidden])').innerText`)).includes('B finished first'));
 assert.equal(await evaluate('proof.port.session()===proof.firstSession'),true);
 await type('Another A request');await submit();await waitJobs(3);
 await evaluate(`proof.port.application.openDocument(proof.secondId);true`);await type('Another B request');await submit();await waitJobs(4);
 await evaluate(`proof.port.application.openDocument(proof.firstId);document.querySelector('[aria-label="Cancel response"]').click();true`);
 for(let i=0;i<100&&!jobs[2].signal.aborted;i++)await new Promise(r=>setTimeout(r,20));assert.equal(jobs[2].signal.aborted,true);assert.equal(jobs[3].signal.aborted,false);
 jobs[3].finish('<response><p>B continued after cancelling A.</p></response>');
 await evaluate(`proof.port.application.openDocument(proof.secondId);true`);await wait(`document.querySelector('.reactive-tabs__panel:not([hidden])').innerText.includes('B continued')`);
 await evaluate(`proof.port.application.files.save({folder:'isolated',filename:'Second.ink'})`);assert.equal(saves,1);assert.equal(saved.generation.resourceId,await evaluate('proof.secondId'));
 const measurements=[];
 for(const count of [2,12]){
  for(let i=2;i<count;i++)await next();
  const counters=await evaluate('proof.boundedTyping()');assert.deepEqual(counters,{snapshots:0,scans:0,requests:0});
  const samples=[];for(let i=0;i<20;i++){await evaluate(`proof.editor.focus.request(proof.text().key,{reason:'qualification',caret:'end'});true`);const start=performance.now();await send('Input.insertText',{text:'x'},sessionId);samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);measurements.push({openConversations:count,counters,inputRoundTripMedianMs:samples[10],inputRoundTripP95Ms:samples[18]});
 }
 await writeFile(path.join(directory,'concurrent.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 const result={passed:true,realBroker:true,realNativeStreaming:true,presentationSwitching:true,reverseCompletion:true,isolatedCancellation:true,retainedSession:true,manualSaveTarget:true,providerRequests:requests.length,measurements};
 await writeFile(path.join(directory,'qualification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{broker?.dispose();socket?.close();browser?.kill('SIGTERM');server?.httpServer?.closeAllConnections();let timer;await Promise.race([server?.close(),new Promise(resolve=>timer=setTimeout(resolve,5000))]);clearTimeout(timer);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
process.exit(0);
