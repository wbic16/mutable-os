// Isolated read-only fixture replay; uses the existing typing benchmark CDP harness.
// Requires running Vite on localhost:3005, Node 22+, and Chrome. No provider calls or Document writes.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-typing-bench-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [...(process.env.DCP_REPLAY_HEADED==='1'?[]:['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
const renderingTrace=process.env.DCP_RENDER_TRACE==='1';
const manual=process.env.DCP_REPLAY_MANUAL==='1',variant=process.env.DCP_REPLAY_VARIANT??'full';
let socket;
try {
const endpoint = await new Promise((resolve, reject) => {
 let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match) resolve(match[1]); });
 chrome.once('error', reject); setTimeout(() => reject(new Error('Chrome startup timed out')), 15000).unref();
});
socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const result = JSON.parse(event.data); if(result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); clearTimeout(p.timer); result.error ? p.reject(new Error(JSON.stringify(result.error))) : p.resolve(result.result); }});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timed out: '+method));},90000); pending.set(requestId,{resolve,reject,timer}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const profiles=[],traceEvents=[];let traceDone;
 socket.addEventListener('message',event=>{const e=JSON.parse(event.data);if(e.method==='Tracing.dataCollected')traceEvents.push(...e.params.value);if(e.method==='Tracing.tracingComplete')traceDone?.();});
 socket.addEventListener('message',event=>{const e=JSON.parse(event.data);if(process.env.DCP_REPLAY_VERBOSE&&e.method==='Runtime.consoleAPICalled'&&e.params.args[0]?.value==='DCP_PROBE')console.error(...e.params.args.map(a=>a.value));});
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };

 await send('Runtime.enable',{},sessionId);await send('Profiler.enable',{},sessionId);await send('Runtime.addBinding',{name:'profileGate'},sessionId);socket.addEventListener('message',event=>{const e=JSON.parse(event.data);if(e.method==='Runtime.bindingCalled'&&e.params.name==='profileGate')void(async()=>{if(e.params.payload==='start'){if(renderingTrace)await send('Tracing.start',{categories:'devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.screenshot',transferMode:'ReportEvents'},sessionId);await send('Profiler.start',{},sessionId);}else {profiles.push((await send('Profiler.stop',{},sessionId)).profile);if(renderingTrace){const done=new Promise(r=>traceDone=r);await send('Tracing.end',{},sessionId);await done;}}await send('Runtime.evaluate',{expression:'window.profileReady()'},sessionId);})();});
 await send('Fetch.enable',{patterns:[{resourceType:'Document',requestStage:'Request'}]},sessionId);
 socket.addEventListener('message',event=>{const e=JSON.parse(event.data);if(e.method==='Fetch.requestPaused')void send('Fetch.fulfillRequest',{requestId:e.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<!doctype html><html><body></body></html>').toString('base64')},sessionId);});
 await send('Page.navigate',{url:'http://localhost:3005/'},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 const raw=await readFile(process.env.DCP_REPLAY_FIXTURE??'vaults/imported/Conversation on November 12, 2026.ink','utf8');
 const label=process.env.DCP_REPLAY_LABEL??'modern-before',delay=Number(process.env.DCP_DIAGNOSTIC_DELAY??0),unrelated=Number(process.env.DCP_REPLAY_UNRELATED??0);
 const result=await evaluate(`(async()=>{
 const network=[];const realFetch=window.fetch.bind(window);window.fetch=async(url,init)=>{if(${renderingTrace}&&String(url)==='/api/native/save'){const body=JSON.parse(init.body);return new Response(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:body.generation.generation},baseline:{nativeHash:'probe-saved',markdownHash:null,generation:body.generation.generation}}}),{headers:{'Content-Type':'application/json'}});}if(String(url).includes('/api/')||/^https?:/.test(String(url))){network.push(String(url));throw Error('Probe blocks service calls');}return realFetch(url,init);};
 await import('/src/index.css');await import('/src/demo/workspace-demo.css');
 const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
 const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
 const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
 const {documentApplicationPorts}=await import('/src/application/document-application-ports.ts');
 const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
 const {registerApplicationViews}=await import('/src/application/features.ts');
 const {DialecticProviderSession}=await import('/src/features/dialectic/dcp/live.ts');
 const {nativeDocumentSession}=await import('/src/persistence/native-session.ts');
 const {ResourcePair}=await import('/src/persistence/resource-pair.ts');
 const {decodeNative,captureNative,nativeBytes}=await import('/src/persistence/native-resource.ts');
 const {resourceToRepository}=await import('/src/history/durable-core.ts');
 const {encodeDocument}=await import('/src/block-tree/codecs.ts');
 const {DcpSources}=await import('/src/features/dialectic/dcp/sources.ts');
 const {XmlContext}=await import('/src/features/dialectic/dcp/xml-context.ts');
 const {request,prepare}=await import('/src/features/dialectic/dcp/exchange.ts');
 const {DialecticReferences}=await import('/src/features/dialectic/references.ts');
 const {semanticWorkspace,enableSemanticWorkspace}=await import('/src/features/dialectic/dcp/workspace.ts');
 const {ConversationHistory}=await import('/src/features/dialectic/continuity.ts');
 const {NativeKnowledgeHost}=await import('/src/knowledge/session.ts');
 const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
 const viewSource=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();const webPath=viewSource.split('"').find(p=>p.includes('/solid-js_web.js'));const {render,createComponent}=await import(webPath);
 const original=decodeNative(new TextEncoder().encode(${JSON.stringify(raw)})),dto=encodeDocument(resourceToRepository(original)),owner=dto.id;
 const all=[];
 for(const mounted of (${renderingTrace}?[true]:[false,true])){
  const timings={mounted},time=async(name,fn)=>{const start=performance.now();const r=await fn();console.info('DCP_PROBE',name);timings[name]=performance.now()-start;return r;};
  const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='height:800px;overflow:auto';document.body.append(host);
  let workspace,port,stopView=()=>{};
  const options={features:{nativeKnowledge:true,sqliteKnowledge:true,flintProbe:false,dialecticConversationUpdates:true,dialecticAutosave:${!manual},dialecticAutomaticTitles:false,dcpTestPhaseLogging:${!manual}}};
  const editor=await time('loadEditorMs',()=>{if(mounted){workspace=new WorkspaceSession(materializeLocalWorkspace({id:'probe-workspace',type:'workspace-block',children:[{id:'probe-bank',type:'workspace-object-bank-block',children:[structuredClone(dto),...(${unrelated}?[{id:'probe-unrelated',type:'document-block',children:Array.from({length:${unrelated}},(_,i)=>({id:'probe-unrelated-'+i,type:'standoff-editor-block',text:'x'.repeat(100)}))}]:[])]}]}),options);return workspace.editor;}return new ReactiveEditor(structuredClone(dto),options);});if(!mounted)registerApplicationViews(editor);editor.setAssetContext(()=>({cavernId:'probe',session:'probe'}));
  const native=nativeDocumentSession(editor);const binding=native.bind(owner,{folder:'probe',filename:'probe.ink'},{nativeHash:'probe',markdownHash:null,generation:null});binding.pair.acknowledgeOpen();
  if(mounted)await time('mountMs',async()=>{stopView=render(()=>createComponent(WorkspacePresentationView,{session:workspace}),host);await editor.commandRegistry.execute('dialectic.open',{targetKey:workspace.projection.state.rootKey,args:undefined});await new Promise(r=>setTimeout(r,20));port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic');await port.application.openDocument(owner);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  const view=mounted?port.session().projection:editor.createView('delay-probe'),root=view.node(mounted?port.session().rootKey:view.state.rootKey),refs=new DialecticReferences(editor,view,root.key),history=new ConversationHistory(editor);
  const dispose=()=>{stopView();};
  const contributions=root.children.map(k=>view.node(k)).filter(n=>n.payload.metadata?.dialectic?.state==='committed'),last=contributions.filter(n=>n.payload.metadata.dialectic.author==='ai').at(-1),data=last.payload.metadata.dialectic,record=JSON.parse(JSON.stringify(data.dcp));
  const variant=${JSON.stringify(variant)};
  if(variant==='no-gloss')record.response=record.response.replace(/<gloss\\b[^>]*>[\\s\\S]*?<\\/gloss>/g,'');
  if(variant==='no-arguments')record.response=record.response.replace(/<argument\\b[^>]*\\/>/g,'').replace(/<relation\\b[^>]*kind="argument"[^>]*\\/>/g,'');
  if(variant==='no-source-marks')record.response=record.response.replace(/<classify\\b[^>]*\\/>/g,'');
  if(variant==='no-formatting')record.response=record.response.replace(/<\\/?(?:b|i)\\b[^>]*>/g,'');
  if(variant==='with-relationship')record.response=record.response.replace('</definitions>','<relation kind="argument" type="qualifies" from="evaluation" to="tradeoff"/></definitions>');

  timings.contributions=contributions.length;timings.cells=Object.values(editor.repository.readState().contents).filter(c=>c.viewType==='text-cell').length;timings.xmlBytes=record.response.length;
  if(mounted){const savePair=new ResourcePair(editor.repository,owner,{save:async generation=>({phase:'saved',generation:generation.generation}),recover:async()=>({phase:'failed'})});port.application.files.saveSubmitted=async()=>{await time('autosaveMs',()=>${renderingTrace}?native.save(owner):savePair.save());return true;};}
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
  const measured={snapshots:0,commits:0};const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=(...args)=>{measured.snapshots++;return snapshot(...args);};const commit=editor.repository.commit.bind(editor.repository);editor.repository.commit=(...args)=>{measured.commits++;return commit(...args);};
  let completed;const outcome=new Promise(resolve=>completed=resolve);
  if(mounted){
   DialecticProviderSession.prototype.configure=async function(settings){this.settings=settings;this.ready=true;return true;};
   DialecticProviderSession.prototype.diagnostic=async function(event){if(['exchange.materialised','contribution.committed'].includes(event.kind))await new Promise(r=>setTimeout(r,${delay}));if(event.kind==='exchange.outcome')completed();return true;};
   DialecticProviderSession.prototype.transport=function(){const details=JSON.parse(JSON.stringify(record.provider));return {details,commit:async()=>{if(${manual})completed();},cancel:async()=>{},run:async(request,sources,chunk,signal,validate)=>{
    details.exchangeId=request.exchange;const repl={};for(const alias of used){const fresh=sources.issue(authority.get(record.xmlBindings[alias]));sources.xmlAuthoring.project(await sources.source(fresh));repl[alias]=sources.xmlAuthoring.alias(fresh);}
    const response=record.response.replace(/@[a-zA-Z0-9_]+/g,a=>repl[a]??a);timings.responseReadyMs=performance.now()-exchangeStart;chunk(response);await time('controllerValidateMs',()=>validate(response));return response;
   }};};
   if(${renderingTrace})[...host.querySelectorAll('button')].find(b=>b.textContent==='Context & AI').click();
   const primaryRow=contributions.find(n=>String(n.payload.id)===primaryTarget.blockId);host.querySelector('[aria-label^="Contribution '+(primaryRow?.payload.metadata.dialectic.ordinal??1)+':"]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  }
  let knowledge,knowledgeLease;
  if(${process.env.DCP_REPLAY_KNOWLEDGE==='1'}){
   const ids=[owner,...(${unrelated}?['probe-unrelated']:[])],documents=ids.map(resourceId=>({resourceId,state:'paired',location:{folder:'probe',filename:resourceId===owner?'probe.ink':'unrelated.ink'}}));
   if(${unrelated})native.bind('probe-unrelated',documents[1].location,{nativeHash:'unrelated',markdownHash:null,generation:null}).pair.acknowledgeOpen();
   knowledge=new NativeKnowledgeHost(editor.repository,{loadedOnly:true});knowledgeLease=knowledge.acquire({root:'probe',snapshot:()=>({complete:true,documents,operations:[]}),native:id=>native.knowledgeEvidence(id),policy:()=>({version:1,opaqueTypes:editor.registry.typesWithCapability('opaque-widget')}),subscribe:()=>()=>{},verifySaved:async()=>{throw Error('No saved reads permitted');}});
   await knowledge.flush();timings.knowledgeBefore={...knowledge.metrics};
  }
  const profile=action=>new Promise(resolve=>{window.profileReady=resolve;window.profileGate(action);});await profile('start');
  const scans={},originalValues=Object.values;
  Object.values=function(value){const state=editor.repository.readState();if(value===state.contents||value===state.placements||value===editor.repository.state.contents||value===editor.repository.state.placements){const stack=new Error().stack.split('\\n').slice(2,6).join('\\n');scans[stack]=(scans[stack]??0)+1;}return originalValues(value);};
  const bounded=editor.commands.boundedStructuralTransaction.bind(editor.commands);editor.commands.boundedStructuralTransaction=(...args)=>{const start=performance.now();try{return bounded(...args);}finally{timings.admissionMs=performance.now()-start;}};
  const exchangeStart=performance.now(),scrolls=[];const originalScroll=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(...args){scrolls.push({ms:performance.now()-exchangeStart,key:editor.mounts.resolveElement(this)?.nodeKey});return originalScroll.apply(this,args);};
  const observed=[],longFrames=[],observer=new PerformanceObserver(list=>{longFrames.push(...list.getEntries().map(e=>({...e.toJSON(),scripts:e.scripts?.map(s=>({duration:s.duration,forcedStyleAndLayoutDuration:s.forcedStyleAndLayoutDuration,source:s.sourceURL?.split('?')[0],function:s.sourceFunctionName}))})));});
  if(${renderingTrace})observer.observe({type:'long-animation-frame'});
  const io=new IntersectionObserver(entries=>{for(const e of entries)observed.push({ms:performance.now()-exchangeStart,key:editor.mounts.resolveElement(e.target)?.nodeKey,intersecting:e.isIntersecting,ratio:e.intersectionRatio});},{root:host.querySelector('.dialectic-canvas')});
  let observedResponse=false;
  const mutations=new MutationObserver(()=>{if(!${renderingTrace})return;const added=root.children.find(k=>!priorKeys.has(k)),el=added&&editor.mounts.get(added)?.root;if(el&&!observedResponse){observedResponse=true;io.observe(el);performance.mark('dcp-native-mounted');}const summary=[...host.querySelectorAll('summary')].find(e=>e.textContent==='Last provider attempt (session only)');if(summary&&!summary.parentElement.open){summary.parentElement.open=true;timings.lastProviderPanelMs=performance.now()-exchangeStart;performance.mark('dcp-last-provider-panel');}});
  if(${renderingTrace})mutations.observe(host,{subtree:true,childList:true});
  const priorKeys=new Set(root.children),payload={version:1,kind:'contribution',state:'committed',author:'ai',participant:data.participant,ordinal:99,replies:[],dcp:{...JSON.parse(JSON.stringify(record)),response:xml}};
  if(mounted)await time('controllerExchangeMs',async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='Ask AI').click();await Promise.race([outcome,new Promise((_,reject)=>setTimeout(()=>reject(Error('Controller did not finish: '+host.querySelector('.dialectic-notice')?.textContent)),10000))]);});
  else await time('admitMs',()=>editor.commands.boundedStructuralTransaction('Probe response',()=>{editor.commands.setPayloadField(root.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(root.payload.linkedAnnotations??{})),...prepared.definitions});for(const [key,marks] of prepared.annotations){const n=view.node(key);editor.commands.setPayloadField(key,'standoffProperties',[...JSON.parse(JSON.stringify(n.payload.standoffProperties??[])),...marks]);}editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:JSON.parse(JSON.stringify(payload))},children:prepared.children},{kind:'at',parentKey:root.key,index:root.children.length});}));
  const added=root.children.find(k=>!priorKeys.has(k));
  if(mounted)await time('nextTwoFramesMs',()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  if(${renderingTrace})await new Promise(r=>setTimeout(r,8000));mutations.disconnect();io.disconnect();observer.disconnect();timings.visibility=observed;timings.longAnimationFrames=longFrames;
  if(knowledge){await knowledge.flush();timings.knowledgeAfter={...knowledge.metrics};knowledgeLease.release();await knowledge.dispose();}Object.values=originalValues;timings.scans=scans;await profile('stop');timings.work=measured;timings.reveals=scrolls;Element.prototype.scrollIntoView=originalScroll;const element=added&&editor.mounts.get(added)?.root;timings.responseRect=element?JSON.parse(JSON.stringify(element.getBoundingClientRect())):null;timings.viewport={w:innerWidth,h:innerHeight};
  await time('historyAfterMs',()=>history.build(owner,'probe-agent',[view.node(added).contentKey]));
  const snap=await time('saveCaptureMs',()=>captureNative(editor.repository.readState(),owner));const bytes=await time('saveEncodeMs',()=>nativeBytes(snap));timings.saveBytes=bytes.length;const pair=new ResourcePair(editor.repository,owner,{save:async generation=>({phase:'saved',generation:generation.generation}),recover:async()=>({phase:'failed'})});await time('fullSaveWithInMemoryAdapterMs',()=>pair.save());timings.domNodes=host.querySelectorAll('*').length;
  all.push(timings);dispose();history.dispose();refs.dispose();if(workspace)workspace.dispose();else editor.dispose();host.remove();
 }
 return {all,blockedCalls:network};
})()`);
 await writeFile(`docs/development/evidence/dcp-admission-delay/${label}.cpuprofile.json`,JSON.stringify(profiles));
 result.fixtureSha256=createHash('sha256').update(raw).digest('hex');result.diagnosticDelayMs=delay;result.unrelatedParagraphs=unrelated;assert.equal(result.all.at(-1).work.commits,1);assert.equal(result.all.at(-1).work.snapshots,0);
 if(renderingTrace)await writeFile('/tmp/'+label+'.trace.json',JSON.stringify({traceEvents}));
 console.log(JSON.stringify(result,null,2));await writeFile(`docs/development/evidence/dcp-admission-delay/${label}.json`,JSON.stringify(result,null,2)+'\n');
}finally{socket?.close();chrome.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});}
