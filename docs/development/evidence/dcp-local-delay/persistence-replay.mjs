// Isolated read-only fixture replay; uses the existing typing benchmark CDP harness.
// Requires running Vite on localhost:3000, Node 22+, and Chrome. No provider calls or user Document writes; durable saves use an isolated temporary store.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import {transform} from 'esbuild';
const phase=process.env.PERSISTENCE_PHASE??'after';
const baselineCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function moduleUrl(file){
 if(phase!=='before')return '/'+file;
 let source=execFileSync('git',['show',baselineCommit+':'+file],{encoding:'utf8'});
 source=source.replace(/from (["'])([^"']+)\1/g,(_,q,spec)=>'from '+q+(spec==='solid-js'?'http://localhost:3000/node_modules/.vite/deps/solid-js.js':new URL(spec,'http://localhost:3000/'+file).href)+q);
 const {code}=await transform(source,{loader:'ts',format:'esm'});return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
const submissionModule=await moduleUrl('src/features/dialectic/submission-save.ts'),pairModule=await moduleUrl('src/persistence/resource-pair.ts');
import {createNativeDocumentStoreRouter} from '../../../../dist/server/native-document-store.mjs';
const storeRoot=await mkdtemp(path.join(tmpdir(),'dcp-save-probe-'));
await mkdir(path.join(storeRoot,'mounted'));await mkdir(path.join(storeRoot,'unmounted'));
const app=express();app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS')return res.sendStatus(204);next();});app.use('/api/native',createNativeDocumentStoreRouter({root:storeRoot}));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const storeUrl='http://127.0.0.1:'+server.address().port+'/api/native/';
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

 await send('Fetch.enable',{patterns:[{resourceType:'Document',requestStage:'Request'},{urlPattern:'*/api/persistence-probe/*',requestStage:'Request'}]},sessionId);
 socket.addEventListener('message',event=>{const e=JSON.parse(event.data);if(e.method==='Fetch.requestPaused'&&e.params.request.url.includes('/api/persistence-probe/')){void (async()=>{const r=await fetch(storeUrl+e.params.request.url.split('/api/persistence-probe/')[1],{method:e.params.request.method,headers:{'Content-Type':'application/json'},body:e.params.request.postData});await send('Fetch.fulfillRequest',{requestId:e.params.requestId,responseCode:r.status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(await r.text()).toString('base64')},sessionId);})();return;}if(e.method==='Fetch.requestPaused')void send('Fetch.fulfillRequest',{requestId:e.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<!doctype html><html><body></body></html>').toString('base64')},sessionId);});
 await send('Page.navigate',{url:'http://localhost:3000/'},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.bringToFront',{},sessionId);
 const trace=[];let traceComplete;const tracingDone=new Promise(r=>traceComplete=r);socket.addEventListener('message',event=>{const e=JSON.parse(event.data);if(e.method==='Tracing.dataCollected')trace.push(...e.params.value.filter(x=>x.name==='Paint'||x.name.startsWith('dcp-')));if(e.method==='Tracing.tracingComplete')traceComplete();});await send('Tracing.start',{categories:'devtools.timeline,blink.user_timing',transferMode:'ReportEvents'});
 const raw=await readFile('vaults/imported/Conversation on November 11, 2026 (7).ink','utf8');
 const result=await evaluate(`(async()=>{
 const network=[];const realFetch=window.fetch.bind(window);window.fetch=async(url,init)=>{if(!String(url).startsWith('/api/persistence-probe/')&&(String(url).includes('/api/')||/^https?:/.test(String(url)))){network.push(String(url));throw Error('Probe blocks service calls');}return realFetch(url,init);};
 const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
 const {registerApplicationViews}=await import('/src/application/features.ts');
 const {createSubmissionSave}=await import(${JSON.stringify(submissionModule)});
 const {ResourcePair}=await import(${JSON.stringify(pairModule)});
 const {decodeNative,captureNative,nativeBytes}=await import('/src/persistence/native-resource.ts');
 const {resourceToRepository}=await import('/src/history/durable-core.ts');
 const {encodeDocument}=await import('/src/block-tree/codecs.ts');
 const {DcpSources}=await import('/src/features/dialectic/dcp/sources.ts');
 const {XmlContext}=await import('/src/features/dialectic/dcp/xml-context.ts');
 const {request,prepare}=await import('/src/features/dialectic/dcp/exchange.ts');
 const {DialecticReferences}=await import('/src/features/dialectic/references.ts');
 const {semanticWorkspace,enableSemanticWorkspace}=await import('/src/features/dialectic/dcp/workspace.ts');
 const {ConversationHistory}=await import('/src/features/dialectic/continuity.ts');
 const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
 const viewSource=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();const webPath=viewSource.split('"').find(p=>p.includes('/solid-js_web.js'));const {render,createComponent}=await import(webPath);
 const original=decodeNative(new TextEncoder().encode(${JSON.stringify(raw)})),dto=encodeDocument(resourceToRepository(original)),owner=dto.id;
 const all=[];
 for(const mounted of [false,true]){
  const timings={mounted},time=async(name,fn)=>{const start=performance.now();const r=await fn();timings[name]=performance.now()-start;return r;};
  const editor=await time('loadEditorMs',()=>new ReactiveEditor(structuredClone(dto),{features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,dialecticConversationUpdates:false,dialecticAutomaticTitles:false,dcpTestPhaseLogging:false}}));registerApplicationViews(editor);editor.setAssetContext(()=>({cavernId:'probe',session:'probe'}));
  const view=editor.createView('delay-probe'),root=view.node(view.state.rootKey),refs=new DialecticReferences(editor,view,root.key),history=new ConversationHistory(editor);
  const host=document.createElement('div');host.style.cssText='height:800px;overflow:auto';document.body.append(host);const dispose=mounted?await time('mountMs',()=>render(()=>createComponent(ReactiveTreeView,{editor,projection:view}),host)):()=>{};
  if(mounted)await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const contributions=root.children.map(k=>view.node(k)).filter(n=>n.payload.metadata?.dialectic?.state==='committed'),last=contributions.filter(n=>n.payload.metadata.dialectic.author==='ai').at(-1),data=last.payload.metadata.dialectic,record=data.dcp;
  timings.contributions=contributions.length;timings.cells=Object.values(editor.repository.readState().contents).filter(c=>c.viewType==='text-cell').length;timings.xmlBytes=record.response.length;
  const sources=new DcpSources(editor,owner,()=>contributions,k=>view.node(k),k=>view.parentOf(k),t=>refs.resolve(t),new AbortController().signal,id=>refs.relationsFor(id),120000,id=>refs.argumentsFor(id),{profile:'general'},refs);
  const marksById=new Map(Object.values(editor.repository.readState().contents).flatMap(c=>(c.payload.standoffProperties??[]).map(p=>[p.id,p])));
  const authority=new Map();const collect=v=>{if(!v||typeof v!=='object')return;if(v.anchorHandle){const mark=marksById.get(v.id);if(mark?.annotationId){authority.set(v.anchorHandle,{kind:'range',resourceId:owner,anchorId:mark.annotationId});const ids=refs.argumentsFor(mark.annotationId);if((v.arguments??[]).length===1&&ids.length===1)authority.set(v.arguments[0],{kind:'argument',resourceId:owner,argumentId:ids[0]});}}if(v.entityHandle){const mark=marksById.get(v.id);if(mark?.metadata?.entityReference)authority.set(v.entityHandle,{kind:'entity',resourceId:owner,entity:mark.metadata.entityReference});}if(v.handle){if(v.target)authority.set(v.handle,v.target);else if(v.identity)authority.set(v.handle,{kind:'entity',resourceId:owner,entity:v.identity});else if(v.nativeId&&!authority.has(v.handle))authority.set(v.handle,{kind:v.anchor?'argument':v.kind??'gloss',resourceId:owner,...(v.anchor?{argumentId:v.nativeId}:{definitionId:v.nativeId})});}for(const c of Object.values(v))if(typeof c==='object')collect(c);};collect(record.request);collect(record.tools);
  const primaryTarget=authority.get(record.request.primaryReply),primary=sources.issue(primaryTarget);
  const manifest=await time('manifestMs',()=>sources.manifest([primary],64000-8192));
  const exchange=crypto.randomUUID(),stages=sources.vocabulary.stages;
  const r=await time('requestBuildMs',()=>request(exchange,primary,[],[],editor.visualEffects,true,sources.capabilities,...stages,sources.vocabulary));
  enableSemanticWorkspace(r);r.authoring.emptySemanticFields=1;r.authoring.proactiveSemantics=1;r.structuralContext=manifest;
  r.semanticWorkspace=await time('workspaceMs',()=>semanticWorkspace(sources,'probe-agent',manifest.sources.map(s=>s.target).filter(Boolean)));
  const x=new XmlContext(sources,exchange);await time('xmlProjectionMs',()=>x.request(r));
  await time('historyColdMs',()=>history.build(owner,'probe-agent',contributions.map(n=>n.contentKey)));await time('historyWarmMs',()=>history.build(owner,'probe-agent',contributions.map(n=>n.contentKey)));
  const used=[...new Set(record.response.match(/@[a-zA-Z0-9_]+/g)||[])],replacement={};
  for(const alias of used){const h=record.xmlBindings[alias],t=authority.get(h);if(!t)throw Error('Missing historical target '+alias+' '+h);const fresh=sources.issue(t);const read=await sources.source(fresh);x.project(read);if(t.kind==='block'&&read.status!=='complete')throw Error(JSON.stringify({alias,readStatus:read.status,omissions:read.omissions,reason:read.reason}));replacement[alias]=x.alias(fresh);}
  const xml=record.response.replace(/@[a-zA-Z0-9_]+/g,a=>replacement[a]??a);
  const lowered=await time('xmlLowerMs',()=>{try{return x.lower(xml);}catch(error){throw Error(JSON.stringify({error:String(error),replacement,readRevisions:[...sources.revisions],bindings:x.bindings()}));}});
  const prepared=await time('nativePrepareMs',()=>prepare(JSON.stringify(lowered),exchange,owner,editor.visualEffects,sources,true,'ai','probe-agent',1,1,true));
  timings.definitions=Object.keys(prepared.definitions).length;timings.addedAnnotations=[...prepared.annotations.values()].flat().length;
  sources.dispose();
  const longTasks=[];const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({start:e.startTime,duration:e.duration});});observer.observe({type:'longtask',buffered:false});
  const priorKeys=new Set(root.children),payload={version:1,kind:'contribution',state:'committed',author:'ai',participant:data.participant,ordinal:99,replies:[],dcp:{...JSON.parse(JSON.stringify(record)),response:xml}};
  await time('admitMs',()=>editor.commands.boundedStructuralTransaction('Probe response',()=>{editor.commands.setPayloadField(root.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(root.payload.linkedAnnotations??{})),...prepared.definitions});for(const [key,marks] of prepared.annotations){const n=view.node(key);editor.commands.setPayloadField(key,'standoffProperties',[...JSON.parse(JSON.stringify(n.payload.standoffProperties??[])),...marks]);}editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:JSON.parse(JSON.stringify(payload))},children:prepared.children},{kind:'at',parentKey:root.key,index:root.children.length});}));
  const added=root.children.find(k=>!priorKeys.has(k));
  performance.mark('dcp-admitted-'+mounted);const admittedAt=performance.now();if(mounted)host.scrollTop=host.scrollHeight;let saveStarted,saveFinished,firstPaintOpportunity;
  const firstFrame=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{firstPaintOpportunity=performance.now();resolve();})));
  const durablePair=new ResourcePair(editor.repository,owner,{save:async generation=>{
   const response=await fetch('/api/persistence-probe/'+'save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:{folder:mounted?'mounted':'unmounted',filename:'probe.ink'},baseline:{nativeHash:null,markdownHash:null,generation:null},generation})});
   const result=await response.json();if(!result.Success)throw Error(JSON.stringify(result));return result.Data.result;
  },recover:async()=>({phase:'failed'})},()=>[]);
  let resolveSaved,rejectSaved;const saved=new Promise((r,j)=>{resolveSaved=r;rejectSaved=j;});
  const submission=createSubmissionSave(async()=>{performance.mark('dcp-save-start-'+mounted);saveStarted=performance.now();try{const result=await durablePair.save();if(result.phase!=='saved'||result.dirty)throw Error(JSON.stringify(result));saveFinished=performance.now();performance.mark('dcp-durable-'+mounted);resolveSaved();return true;}catch(e){rejectSaved(e);throw e;}},()=>true);
  submission.request(owner);await Promise.all([saved,firstFrame]);await new Promise(r=>setTimeout(r,40));
  timings.admissionToSaveStartMs=saveStarted-admittedAt;timings.admissionToPaintOpportunityMs=firstPaintOpportunity-admittedAt;timings.admissionToDurableCompletionMs=saveFinished-admittedAt;
  timings.saveCoordinatorWithFilesystemMs=saveFinished-saveStarted;timings.postAdmissionLongTasks=longTasks.filter(t=>t.start+t.duration>=admittedAt);observer.disconnect();submission.dispose();

  await time('historyAfterMs',()=>history.build(owner,'probe-agent',[view.node(added).contentKey]));
  const snap=await time('saveCaptureMs',()=>captureNative(editor.repository.readState(),owner));const bytes=await time('saveEncodeMs',()=>nativeBytes(snap));timings.saveBytes=bytes.length;await time('snapshotCloneMs',()=>structuredClone(snap));const pair=new ResourcePair(editor.repository,owner,{save:async generation=>({phase:'saved',generation:generation.generation}),recover:async()=>({phase:'failed'})});await time('fullSaveWithInMemoryAdapterMs',()=>pair.save());timings.domNodes=host.querySelectorAll('*').length;
  all.push(timings);dispose();history.dispose();refs.dispose();editor.dispose();host.remove();
 }
 return {all,blockedCalls:network};
})()`);
 await send('Tracing.end');await tracingDone;
 for(const item of result.all){const start=trace.find(e=>e.name==='dcp-admitted-'+item.mounted),capture=trace.find(e=>e.name==='dcp-save-start-'+item.mounted),end=trace.find(e=>e.name==='dcp-durable-'+item.mounted);const paints=trace.filter(e=>e.name==='Paint'&&e.ts>=start.ts&&e.ts<end.ts).sort((a,b)=>a.ts-b.ts);item.firstPaintTraceMs=paints.length?(paints[0].ts-start.ts)/1000:null;item.paintsBeforeCapture=paints.filter(e=>e.ts<capture.ts).length;}
 result.phase=phase;result.baselineCommit=baselineCommit;console.log(JSON.stringify(result,null,2));await writeFile('docs/development/evidence/dcp-local-delay/'+phase+'.json',JSON.stringify(result,null,2)+'\n');
}finally{socket?.close();chrome.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});await new Promise(r=>server.close(r));await rm(storeRoot,{recursive:true,force:true});}
