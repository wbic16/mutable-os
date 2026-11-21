// Focused, explicitly authorised live rendering probe. Never saves a user Document.
// Ledger survives reruns: at most eighteen inference requests across this investigation.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'vite';
import esbuild from 'esbuild';
const {build,stop}=esbuild;
const out=path.resolve('artifacts/dcp-render-live');await mkdir(out,{recursive:true});
const ledgerPath=path.join(out,'paid-budget.json');
let ledger;try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;ledger={limit:18,calls:[]};}
assert.equal(ledger.limit,18);if(!process.env.OPENAI_API_KEY)throw Error('Server environment key unavailable');
const label=process.env.DCP_LIVE_LABEL??'simple',prompt=process.env.DCP_LIVE_PROMPT??'In about 60 words, explain why a rainbow forms.';
const fixture=process.env.DCP_LIVE_FIXTURE?await readFile(process.env.DCP_LIVE_FIXTURE,'utf8'):null;
const wire=[],events=[];
const streamResponses=process.env.DCP_LIVE_STREAM!=='0',noTools=process.env.DCP_LIVE_NO_TOOLS==='1';
const tracked=async(url,init)=>{
 const pathname=new URL(url).pathname,inference=pathname==='/v1/responses';
 if(inference){if(ledger.calls.length>=ledger.limit)throw Error('Authorised eighteen-call ceiling reached');ledger.calls.push({label,utc:new Date().toISOString(),model:JSON.parse(init.body).model});await writeFile(ledgerPath,JSON.stringify(ledger,null,2));}
 const record={path:pathname,started:Date.now(),...(inference?{call:ledger.calls.length}:{})};wire.push(record);
 if(inference){const body=JSON.parse(init.body);body.stream=streamResponses;if(noTools)body.tool_choice='none';init={...init,body:JSON.stringify(body)};record.requestSettings={model:body.model,stream:body.stream,toolChoice:body.tool_choice??'auto',maxOutputTokens:body.max_output_tokens,reasoning:body.reasoning??'provider default',serviceTier:body.service_tier??'project default'};}
 const response=await fetch(url,init);record.headers=Date.now();record.status=response.status;
 if(inference&&!streamResponses&&response.ok){
  // The paid HTTP request genuinely uses stream:false. Adapt its completed
  // envelope only at the private test boundary so native admission is unchanged.
  const raw=await response.json();record.eof=record.completed=Date.now();record.usage=raw.usage;record.output=raw.output;record.serviceTier=raw.service_tier;record.text=(raw.output??[]).filter(i=>i.type==='message').flatMap(i=>i.content??[]).filter(i=>i.type==='output_text').map(i=>i.text).join('');
  record.stop='response.'+raw.status;
  const envelope=[{type:'response.created',response:{id:raw.id}},{type:record.stop,response:raw}];
  return new Response(envelope.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{status:response.status,headers:{'Content-Type':'text/event-stream'}});
 }
 if(!inference||!response.body)return response;
 let pending='',text='';const decoder=new TextDecoder();
 const stream=response.body.pipeThrough(new TransformStream({transform(chunk,c){
  pending+=decoder.decode(chunk,{stream:true}).replace(/\r\n/g,'\n');let end;
  while((end=pending.indexOf('\n\n'))>=0){const line=pending.slice(0,end).split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');pending=pending.slice(end+2);if(!line||line==='[DONE]')continue;
   const e=JSON.parse(line);if(e.type==='response.output_text.delta'){record.firstText??=Date.now();record.lastText=Date.now();text+=e.delta;(record.progress??=[]).push({at:Date.now(),length:text.length});if(text.includes('<definitions'))record.definitionsStart??=Date.now();if(text.trimEnd().endsWith('</response>'))record.xmlComplete??=Date.now();}
   if(['response.completed','response.incomplete','response.failed'].includes(e.type)){record.completed=Date.now();record.usage=e.response?.usage;record.stop=e.type;record.text=text;record.output=e.response?.output;record.serviceTier=e.response?.service_tier;}
  }c.enqueue(chunk);
 },flush(){record.eof=Date.now();}}));
 return new Response(stream,{status:response.status,headers:response.headers});
};
const brokerFile=path.resolve('node_modules/.cache/dcp-render-broker.mjs');
await build({stdin:{contents:"export {createDialecticBroker} from './server/dialectic/broker.ts';",resolveDir:process.cwd()},outfile:brokerFile,bundle:true,platform:'node',format:'esm',packages:'external'});
const {createDialecticBroker}=await import(brokerFile);
const memory=await mkdtemp(path.join(tmpdir(),'dcp-render-memory-')),profile=await mkdtemp(path.join(tmpdir(),'dcp-render-chrome-'));
const broker=createDialecticBroker({testLogging:false,currentCavern:()=>({path:memory,cavernGuid:'render-probe',session:'render-probe'}),fetcher:tracked});
let server,browser,socket;
try{
 server=await createServer({cacheDir:'node_modules/.cache/dcp-render-vite',server:{host:'127.0.0.1',port:0},plugins:[{name:'render-probe',resolveId:id=>id==='/__probe.js'?'\0render-probe':undefined,load(id){if(id!=='\0render-probe')return;return `
 import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspaceDemo} from '/src/demo/workspace-demo.tsx';
 import {nativeDocumentSession} from '/src/persistence/native-session.ts';
 import {decodeNative} from '/src/persistence/native-resource.ts';
 import {resourceToRepository} from '/src/history/durable-core.ts';
 import {encodeDocument} from '/src/block-tree/codecs.ts';
 import {createInitialWorkspace} from '/src/application/initial-workspace.ts';
 import {documentApplicationPorts} from '/src/application/document-application-ports.ts';
 import '/src/assets/reset.css';import '/src/index.css';
 window.proof={events:[],snapshots:0,commits:0,operations:[],scans:{}};const p=window.proof;p.mark=(kind,details={})=>p.events.push({kind,at:performance.timeOrigin+performance.now(),...details});
 const nativeFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await nativeFetch(...args);if(!String(args[0]).match(/\\/api\\/dialectic\\/exchange\\/[^/]+\\/turn$/)||!response.body)return response;
 p.mark('broker-headers');let pending='',length=0;const decoder=new TextDecoder();return new Response(response.body.pipeThrough(new TransformStream({transform(chunk,c){pending+=decoder.decode(chunk,{stream:true});let end;while((end=pending.indexOf('\\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line)continue;const event=JSON.parse(line);if(event.type==='delta'){length+=event.text.length;p.mark('broker-delta',{length});}else p.mark('broker-'+event.type);}c.enqueue(chunk);},flush(){p.mark('broker-eof');}})),{status:response.status,headers:response.headers});};
 const original=WorkspaceSession.prototype.installPresentationInput;WorkspaceSession.prototype.installPresentationInput=function(...args){p.session=this;p.editor=this.editor;return original.apply(this,args);};
 render(()=>createComponent(WorkspaceDemo,{initialWorkspace:createInitialWorkspace(),configuration:{features:{dialecticAutomaticTitles:false,dialecticAutosave:false,dcpTestPhaseLogging:false,flintProbe:false}}}),document.getElementById('root'));
 await new Promise(r=>setTimeout(r,0));const e=p.editor;e.setAssetContext(()=>({cavernId:'render-probe',session:'render-probe'}));
 await e.commandRegistry.execute('dialectic.open',{targetKey:p.session.projection.state.rootKey,args:undefined});await new Promise(r=>setTimeout(r,0));
 p.port=documentApplicationPorts(e).ports().find(v=>v.applicationId==='dialectic');
 if(${!!fixture}){const dto=encodeDocument(resourceToRepository(decodeNative(new TextEncoder().encode(${JSON.stringify(fixture)})))),state=e.repository.readState(),bank=Object.values(state.contents).find(c=>c.viewType==='workspace-object-bank-block'),bankNode=p.session.projection.nodeForPlacement([...e.repository.ownedPlacementKeys(bank.key)][0]);
  e.commands.insert(dto,{kind:'at',parentKey:bankNode.key,index:bank.children.length});
  const binding=nativeDocumentSession(e).bind(String(dto.id),{folder:'isolated',filename:'fixture.ink'},{nativeHash:'fixture',markdownHash:null,generation:null});binding.pair.acknowledgeOpen();await p.port.application.openDocument(String(dto.id));
 }
 p.view=p.port.session().projection;p.root=p.view.node(p.port.session().rootKey);
 p.rows=()=>p.root.children.map(k=>p.view.node(k)).filter(n=>n.payload.metadata?.dialectic?.kind==='contribution');p.committed=()=>p.rows().filter(n=>n.payload.metadata.dialectic.state==='committed');p.draft=()=>p.rows().find(n=>n.payload.metadata.dialectic.state==='draft');p.text=()=>p.view.node(p.draft().children[0]);
 const bound=e.commands.boundedStructuralTransaction.bind(e.commands);e.commands.boundedStructuralTransaction=(...a)=>{p.mark('admission-start',{name:a[0]});try{return bound(...a);}finally{p.mark('admission-end');}};
 const commit=e.repository.commit.bind(e.repository);e.repository.commit=(...a)=>{p.commits++;return commit(...a);};const snapshot=e.repository.snapshot.bind(e.repository);e.repository.snapshot=(...a)=>{p.snapshots++;return snapshot(...a);};
 for(const name of ['setPayloadField','insert']){const call=e.commands[name].bind(e.commands);e.commands[name]=(...args)=>{const t=performance.now();try{return call(...args);}finally{p.operations.push({name,field:name==='setPayloadField'?args[1]:undefined,at:performance.timeOrigin+t,ms:performance.now()-t});}};}
 const values=Object.values;Object.values=function(v){const state=e.repository.readState();if(v===state.contents||v===state.placements||v===e.repository.state.contents||v===e.repository.state.placements){const stack=new Error().stack.split('\\n').slice(2,6).join('\\n');p.scans[stack]=(p.scans[stack]??0)+1;}return values(v);};
 const io=new IntersectionObserver(entries=>{for(const x of entries)p.mark('intersection',{node:e.mounts.resolveElement(x.target)?.nodeKey,visible:x.isIntersecting,ratio:x.intersectionRatio});},{root:document.querySelector('.dialectic-canvas')});
 let last,panel,observed,preview='';new MutationObserver(()=>{const n=p.committed().at(-1);if(n?.payload.metadata.dialectic.author==='ai'&&n.key!==last){last=n.key;p.mark('native-mounted',{node:n.key});}if(n?.payload.metadata.dialectic.author==='ai'&&n.key!==observed){const el=e.mounts.get(n.key)?.root;if(el){observed=n.key;io.observe(el);}}
 const current=document.querySelector('.dialectic-dcp-preview pre')?.textContent??'';if(current!==preview){preview=current;p.mark('transient-preview',{length:current.length,definitions:current.includes('<definitions'),complete:current.trimEnd().endsWith('</response>')});}
 const s=[...document.querySelectorAll('summary')].find(s=>s.textContent==='Last provider attempt (session only)');if(s&&s!==panel){panel=s;s.parentElement.open=true;p.mark('provider-panel');}
 }).observe(document.querySelector('.dialectic-app'),{childList:true,subtree:true,characterData:true});
 const po=new PerformanceObserver(list=>{for(const v of list.getEntries())p.mark('long-frame',{start:performance.timeOrigin+v.startTime,duration:v.duration,blocking:v.blockingDuration,renderStart:v.renderStart,layoutStart:v.styleAndLayoutStart,scripts:v.scripts?.map(s=>({function:s.sourceFunctionName,duration:s.duration,layout:s.forcedStyleAndLayoutDuration,source:s.sourceURL}))});});if(PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'))po.observe({type:'long-animation-frame'});
 p.ready=true;
 `;},configureServer(s){const api=express();api.use(broker.router);s.middlewares.use('/api/dialectic',api);s.middlewares.use((req,res,next)=>{if(req.url==='/__probe'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="root"></div><script type="module" src="/__probe.js"></script></body></html>');return;}if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:false,Error:'Read-only isolated test'}));return;}next();});}}]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[...(process.env.DCP_HEADLESS==='1'?['--headless=new']:[]),'--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let text='';browser.stderr.on('data',chunk=>{text+=chunk;const m=text.match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1]);});browser.once('error',reject);setTimeout(()=>reject(Error('Chrome startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let nextId=0;const pending=new Map();
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Tracing.dataCollected')events.push(...m.params.value);if(m.method==='Runtime.exceptionThrown')console.error('Browser exception',JSON.stringify(m.params.exceptionDetails));});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),135000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.httpServer.address().port+'/__probe'},sessionId);await send('Page.bringToFront',{},sessionId);
 await evaluate(`(async()=>{for(let i=0;i<1200;i++){if(window.proof?.ready)return;await new Promise(r=>setTimeout(r,50));}throw Error('App startup timeout');})()`);
 await evaluate(`(()=>{const p=proof;p.editor.commands.replaceInlineRange(p.text().key,0,0,${JSON.stringify(prompt)});[...document.querySelectorAll('button')].find(b=>b.textContent==='Context & AI').click();})()`);
 await send('Profiler.enable',{},sessionId);await send('Profiler.start',{},sessionId);
 await send('Tracing.start',{categories:'devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.screenshot',transferMode:'ReportEvents'},sessionId);
 await evaluate(`proof.events=[];proof.snapshots=0;proof.commits=0;proof.operations=[];proof.scans={};proof.mark('submit');document.querySelector('[aria-label="Submit contribution"]').click();`);
 let exchangeFailure;try{await evaluate(`(async()=>{for(let i=0;i<2400;i++){const error=document.querySelector('.dialectic-notice')?.textContent;if(error)throw Error(error);if(proof.events.some(e=>e.kind==='provider-panel'))return;await new Promise(r=>setTimeout(r,50));}throw Error('Exchange timeout');})()`);}catch(error){exchangeFailure=String(error);}
 await new Promise(r=>setTimeout(r,16000));
 const result=await evaluate(`({lastProvider:JSON.parse([...document.querySelectorAll('summary')].find(s=>s.textContent==='Last provider attempt (session only)')?.parentElement.querySelector('pre')?.textContent??'null'),events:proof.events,operations:proof.operations,scans:proof.scans,activity:document.querySelector('.dialectic-native')?.innerText,snapshots:proof.snapshots,commits:proof.commits,contributions:proof.committed().length,response:JSON.parse(JSON.stringify(proof.committed().at(-1)?.payload.metadata.dialectic.dcp)),domNodes:document.querySelectorAll('*').length,features:{autosave:proof.editor.features.dialecticAutosave,logging:proof.editor.features.dcpTestPhaseLogging,nativeKnowledge:proof.editor.features.nativeKnowledge,sqliteKnowledge:proof.editor.features.sqliteKnowledge}})`);
 await writeFile(path.join(out,label+'.cpuprofile.json'),JSON.stringify((await send('Profiler.stop',{},sessionId)).profile));
 const traceDone=new Promise(r=>socket.addEventListener('message',e=>{if(JSON.parse(e.data).method==='Tracing.tracingComplete')r();}));await send('Tracing.end',{},sessionId);await traceDone;
 await writeFile(path.join(out,label+'.trace.json'),JSON.stringify({traceEvents:events}));await writeFile(path.join(out,label+'.json'),JSON.stringify({label,wire,result,exchangeFailure,paidCallsTotal:ledger.calls.length},null,2));
 const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(out,label+'.png'),Buffer.from(screenshot.data,'base64'));
 console.log(JSON.stringify({label,exchangeFailure,paidCallsTotal:ledger.calls.length,wire:wire.map(({text,output,progress,...r})=>r),events:result.events.filter(e=>!['long-frame','broker-delta','transient-preview'].includes(e.kind)),longFrames:result.events.filter(e=>e.kind==='long-frame').map(({scripts,...e})=>e),snapshots:result.snapshots,commits:result.commits,contributions:result.contributions,features:result.features},null,2));
}finally{await writeFile(path.join(out,label+'-wire.json'),JSON.stringify({wire,paidCallsTotal:ledger.calls.length},null,2));socket?.close();browser?.kill('SIGTERM');broker.dispose();await server?.close();stop?.();await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true});await rm(memory,{recursive:true,force:true});}
