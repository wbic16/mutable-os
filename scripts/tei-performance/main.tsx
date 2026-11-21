import './inline-interoperability';
import './inline-alternatives';
import {ResourcePair} from '../../src/persistence/resource-pair';
import { render } from 'solid-js/web';
import { createComputed, createRoot } from 'solid-js';
import { BlockTreeProjection } from '../../src/block-tree/projection';
import { ReactiveEditor } from '../../src/reactive-editor/editor';
import { registerApplicationViews } from '../../src/application/features';
import { ReactiveTreeView } from '../../src/rendering/reactive-tree-view';
import { runInterchange } from '../../src/runtime/interchange-worker';
import { captureNative, nativeText, decodeNative, admitNative } from '../../src/persistence/native-resource';
import small from '../../src/interchange/tei/fixtures/A040080.xml?raw';
import large from '../../src/interchange/tei/fixtures/A041209.xml?raw';
import operational from '../../src/interchange/tei/fixtures/operational-semantics.xml?raw';
import semantic from '../../src/interchange/tei/fixtures/semantic-sublimation.xml?raw';
import '../../src/assets/reset.css';
import '../../src/index.css';
import '../../src/features/flint/flint.css';

const frame = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const anthology = (sections: number) => large.replace('</body>', Array.from({length:sections},(_,i)=>`<div n="${i}"><head>Correspondence section ${i+1}</head>` + Array.from({length:20},()=>'<p>A letter records a place, a date, and a reading. <persName ref="#missing">The correspondent</persName> retained the original wording, including <del>deleted</del> and <add>added</add> passages, for later scholarly interpretation.</p>').join('') + '</div>').join('')+'</body>');
const paragraph=(n:number)=>'<TEI><text><body><p>'+('Prose text '.repeat(Math.ceil(n/11))).slice(0,n)+'</p></body></text></TEI>';
const sources = {ordinary:paragraph(500),long:paragraph(1500),verylong:paragraph(3000),exceptional:paragraph(10000),stress:paragraph(120624).replace('<p>','<p><hi rend="bold">').replace('</p>','</hi></p>'),small, large, semantic, anthology: anthology(12), populated: large, extended: anthology(30)};
let cleanup = () => {};
(window as any).teiCleanup = () => { cleanup(); cleanup = () => {}; };
(window as any).teiPerformance = async (name: keyof typeof sources) => {
 cleanup();
 const editor = new ReactiveEditor({id:'performance-workspace',type:'workspace-block',children:[{id:'performance-bank',type:'workspace-object-bank-block',children:[]}]});
 registerApplicationViews(editor);
 const bank = Object.values(editor.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block')!;
 const host = document.body.appendChild(document.createElement('div'));host.style.cssText='width:900px;margin:auto';
 const memory = () => (performance as any).memory?.usedJSHeapSize;
 const heapBefore = memory(), start=performance.now();
 const result = await runInterchange({kind:'tei-document',file:{name:name+'.tei',blob:new Blob([sources[name]])},profile:true},new AbortController().signal);
 const received=performance.now();
 console.debug('TEI_STAGE',JSON.stringify({name,stage:'worker',...result.stats,counts:result.counts,timings:result.timings,workerMs:(result as any).workerMs,workerRoundTripMs:received-start,transferAndDispatchMs:performance.timeOrigin+received-(result as any).sentAt}));
 const admissionTimings:Record<string,number>={};
 const admission=admitNative(editor.repository,result.bytes,bank.key,admissionTimings),admitted=performance.now();
 console.debug('TEI_STAGE',JSON.stringify({name,stage:'admission',ms:admitted-received,admissionTimings}));
 const projection=editor.createView(undefined,admission.placementKey),projected=performance.now();
 console.debug('TEI_STAGE',JSON.stringify({name,stage:'projection',ms:projected-admitted}));
 const stop=render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host);editor.installGateway(document);
 await frame();const usable=performance.now(),heapMounted=memory();
 const pageCount=host.querySelectorAll('.reactive-page').length;
 const node=Object.values(projection.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.length>10&&editor.mounts.get(n.key))!;
 const mount=editor.mounts.get(node.key)!;mount.focus();mount.restoreInlineSelection?.({anchor:0,head:0});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,0,0);
 const flow=document.activeElement as HTMLElement;
 const samples:number[]=[];const before=flow.textContent;let snapshots=0;const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=()=>{snapshots++;return snapshot();};
 for(let i=0;i<(name==='anthology'?0:3);i++) {let t=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'a'}));samples.push(performance.now()-t);await frame();t=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));samples.push(performance.now()-t);await frame();}
 samples.sort((a,b)=>a-b);
 const restored=flow.textContent===before;
 const metadataStart=performance.now();[...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(e=>e.textContent==='Metadata')!.click();await frame();const metadataMs=performance.now()-metadataStart;
 cleanup=()=>{stop();editor.dispose();host.remove();};
 return {name,sourceBytes:new TextEncoder().encode(sources[name]).length,...result.stats,counts:result.counts,nativeBytes:result.bytes.length,timings:result.timings,workerMs:(result as any).workerMs,workerRoundTripMs:received-start,transferAndDispatchMs:performance.timeOrigin+received-(result as any).sentAt,admissionMs:admitted-received,admissionTimings,projectionMs:projected-admitted,renderMs:usable-projected,usableMs:usable-start,metadataMs,pageCount,truncated:result.truncated,heapBefore,heapMounted,heapMetadata:memory(),typing:{samples:samples.length,medianMs:samples[3],p95Ms:samples[5],maxMs:samples[5],snapshots,restored,before:before?.slice(0,80),after:flow.textContent?.slice(0,80)}};
};
// Separate CPU-profile entry: same preparation code, on the main thread only
// so CDP can sample it. Never used for end-to-end browser timing claims.
(window as any).teiPreparationProfile = async (name: keyof typeof sources) => {
 const {prepareTeiDocument}=await import('../../src/interchange/tei/native');
 const result=await prepareTeiDocument({name:name+'.tei',blob:new Blob([sources[name]])},{},true);
 return {timings:result.timings,counts:result.counts};
};

/** Full Flint lifecycle companion to the isolated stage probe above. */
(window as any).teiFlintPerformance = async (name: keyof typeof sources, compactCanonicalText=false) => {
 cleanup();cleanup=()=>{};
 const {materializeLocalWorkspace}=await import('../../src/reactive-editor/workspace-manifest');
 const {documentApplicationPorts}=await import('../../src/application/document-application-ports');
 const {nativeDocumentSession}=await import('../../src/persistence/native-session');
 const editor=new ReactiveEditor(materializeLocalWorkspace({id:'flint-performance-workspace',type:'workspace-block',children:[]}),{features:{compactCanonicalText}});
 registerApplicationViews(editor);const workspace=editor.createView('performance-workspace');
 editor.commandRegistry.execute('flint.open',{targetKey:workspace.state.rootKey,args:undefined});
 const host=document.body.appendChild(document.createElement('div'));
 const stop=render(()=><ReactiveTreeView editor={editor} projection={workspace}/>,host);editor.installGateway(document);await frame();
 const app=documentApplicationPorts(editor).ports()[0]?.application;
 if(!app)throw Error('Flint application port was not mounted');
 const session=nativeDocumentSession(editor);
 const bank=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block')!;
 if (name === 'populated') {
  for (let i=0;i<3;i++) {
   const existing=await runInterchange({kind:'tei-document',file:{name:`existing-${i}.tei`,blob:new Blob(['<TEI><text><body>'+Array.from({length:80},()=>'<p>'+'x'.repeat(100)+'</p>').join('')+'</body></text></TEI>'])}},new AbortController().signal);
   admitNative(editor.repository,existing.bytes,bank.key);session.trackCandidate(existing.id);
   if(i<2)app.openDocument(existing.id);
  }
  await frame();
 }
 const existingViews = new Set(editor.projections.keys());
 const repositoryBefore={contents:Object.keys(editor.repository.readState().contents).length,placements:Object.keys(editor.repository.readState().placements).length,projections:existingViews.size};
 const work:Record<string,number>={}, projectionEvents:any[]=[];let phase='worker';
 const proto=BlockTreeProjection.prototype as any, originals:Record<string,any>={};
 for(const method of ['build','register','appendChildren']) {
  originals[method]=proto[method];proto[method]=function(...args:any[]){const t=performance.now(),value=originals[method].apply(this,args),ms=performance.now()-t;const key=`${phase}.${method}`;work[key]=(work[key]??0)+ms;work[key+'.calls']=(work[key+'.calls']??0)+1;
   if(method==='build')projectionEvents.push({phase,view:this.viewId,existing:existingViews.has(this.viewId),nodes:Object.keys(value.nodes).length,ms});return value;};
 }
 let reactiveRuns=0, notifications=0, snapshots=0;const snapshot=editor.repository.snapshot.bind(editor.repository);
 editor.repository.snapshot=()=>{snapshots++;return snapshot();};
 const beforeRevision=editor.repository.readState().revision, previousBankLength=bank.children.length;
 const stopChanges=editor.repository.subscribeChanges(()=>{work[`${phase}.changeNotifications`]=(work[`${phase}.changeNotifications`]??0)+1;if(phase!=='admission')return;notifications++;const state=editor.repository.readState();if(state.revision!==beforeRevision+1||state.contents[bank.key].children.length!==previousBankLength+1)throw Error('Observer saw an incomplete admission');});
 let stopReactive=()=>{};createRoot(dispose=>{stopReactive=dispose;createComputed(()=>{const revision=editor.repository.state.revision;if(revision>beforeRevision&&phase==='admission'){reactiveRuns++;if(editor.repository.state.contents[bank.key].children.length!==previousBankLength+1)throw Error('Reactive observer saw an incomplete admission');}});});
 const originalCommit=editor.repository.commit.bind(editor.repository);editor.repository.commit=(...args:Parameters<typeof originalCommit>)=>{const t=performance.now();originalCommit(...args);work[`${phase}.commitMs`]=(work[`${phase}.commitMs`]??0)+performance.now()-t;work[`${phase}.commitCalls`]=(work[`${phase}.commitCalls`]??0)+1;};
 const memory=()=>(performance as any).memory?.usedJSHeapSize;
 performance.clearMarks();performance.mark('admission-test.start');
 const heapBefore=memory(),start=performance.now();
 const result=await runInterchange({kind:'tei-document',file:{name:name+'.tei',blob:new Blob([sources[name]])},profile:true},new AbortController().signal);
 const received=performance.now();console.debug('TEI_STAGE',JSON.stringify({name,stage:'worker',timings:result.timings,counts:result.counts,...result.stats,workerMs:(result as any).workerMs,workerRoundTripMs:received-start}));
 performance.mark('admission-test.admit');phase='admission';const admissionTimings:Record<string,number>={};
 admitNative(editor.repository,result.bytes,bank.key,admissionTimings);const admitted=performance.now();
 console.debug('TEI_STAGE',JSON.stringify({name,stage:'admission',ms:admitted-received,admissionTimings}));
 performance.mark('admission-test.candidate');phase='candidate';session.trackCandidate(result.id);const candidate=performance.now();console.debug('TEI_STAGE',JSON.stringify({name,stage:'candidate',ms:candidate-admitted}));
 let projectionMs=0;const createView=editor.createView.bind(editor);
 editor.createView=(...args:Parameters<typeof createView>)=>{const t=performance.now(),p=createView(...args);projectionMs+=performance.now()-t;return p;};
 performance.mark('admission-test.open');phase='open';const openStarted=performance.now();app.openDocument(result.id);const openSynchronousMs=performance.now()-openStarted;performance.mark('admission-test.openSync');await frame();performance.mark('admission-test.usable');const usable=performance.now(),framesMs=performance.now()-openStarted-openSynchronousMs;
 stopChanges();stopReactive();for(const method in originals)proto[method]=originals[method];const admissionSnapshots=snapshots;editor.repository.snapshot=snapshot;editor.repository.commit=originalCommit;
 const view=[...editor.projections.values()].find(p=>p!==workspace&&p.state.nodes[p.state.rootKey]?.payload.id===result.id);
 if(!view)throw Error('Imported document did not open in Flint');
 const node=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.length>10&&editor.mounts.get(n.key))!;
 const mount=editor.mounts.get(node.key)!;mount.focus();mount.restoreInlineSelection?.({anchor:0,head:0});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,0,0);
 const flow=document.activeElement as HTMLElement,before=flow.textContent;snapshots=0;editor.repository.snapshot=()=>{snapshots++;return snapshot();};
 const nativeBefore=name==='stress'?nativeText(captureNative(editor.repository.readState(),result.id)):undefined;
 const samples:number[]=[],settled:number[]=[],display:number[]=[];
 for(let i=0;i<(name==='stress'?1:10);i++){let t=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'a'}));samples.push(performance.now()-t);await Promise.resolve();settled.push(performance.now()-t);await frame();display.push(performance.now()-t);t=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));samples.push(performance.now()-t);await Promise.resolve();settled.push(performance.now()-t);await frame();display.push(performance.now()-t);}
 samples.sort((a,b)=>a-b);settled.sort((a,b)=>a-b);display.sort((a,b)=>a-b);const restored=flow.textContent===before,heapMounted=memory();
 const typingSnapshots=snapshots;editor.repository.snapshot=snapshot;
 const metadataButton=[...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent==='Metadata'&&!b.closest('[hidden]'));
 const metadataStart=performance.now();let metadataSyncMs:number|null=null;
 performance.mark('admission-test.metadata');
 if(metadataButton){metadataButton.click();metadataSyncMs=performance.now()-metadataStart;await frame();}
 const metadataMs=metadataButton?performance.now()-metadataStart:null;
 performance.mark('admission-test.metadataReady');
 const pageCount=Object.values(view.state.nodes).filter(n=>n.viewType==='page-block').length;
 const canonicalWorkspaceCells=Object.values(editor.repository.readState().contents).filter(c=>c.viewType==='text-cell').length;
 const captureStart=performance.now(),captured=captureNative(editor.repository.readState(),result.id),saved=nativeText(captured),captureMs=performance.now()-captureStart;
 const canonicalCells=Object.values(captured.contents).filter(c=>c.viewType==='text-cell').length;
 const saveStart=performance.now();let saveBytes='';const pair=new ResourcePair(editor.repository,result.id,{save:async generation=>{saveBytes=generation.native;return {phase:'saved',generation:generation.generation};},recover:async()=>({phase:'failed'})},()=>[]);const saveResult=await pair.save(),saveMs=performance.now()-saveStart;if(saveResult.phase!=='saved'||saveResult.dirty||saveBytes!==saved)throw Error('Manual Save coordinator fidelity failed');
 const reopenStart=performance.now(),reopened=decodeNative(new TextEncoder().encode(saved),undefined,compactCanonicalText),reopenMs=performance.now()-reopenStart;
 if(nativeText(reopened)!==saved)throw Error('Native reopen fidelity failed');
 if(nativeBefore!==undefined&&nativeBefore!==saved)throw Error('Stress text or annotation restoration failed');
 const stats=(xs:number[])=>({median:xs[Math.floor(xs.length/2)],p95:xs[Math.min(xs.length-1,Math.floor(xs.length*.95))]});
 let t=performance.now();editor.repository.undo();const undoMs=performance.now()-t;t=performance.now();editor.repository.redo();const redoMs=performance.now()-t;

 cleanup=()=>{stop();editor.dispose();host.remove();};
 return {name,compactCanonicalText,canonicalCells,canonicalWorkspaceCells,captureMs,saveMs,reopenMs,undoMs,redoMs,settled:stats(settled),display:stats(display),sync:stats(samples),host:'Flint application',repositoryBefore,work,projectionEvents,notifications,reactiveRuns,admissionSnapshots,openSynchronousMs,framesMs,sourceBytes:new TextEncoder().encode(sources[name]).length,...result.stats,counts:result.counts,nativeBytes:result.bytes.length,timings:result.timings,workerMs:(result as any).workerMs,workerRoundTripMs:received-start,transferAndDispatchMs:performance.timeOrigin+received-(result as any).sentAt,admissionMs:admitted-received,admissionTimings,candidateMs:candidate-admitted,projectionMs,openAndRenderMs:usable-candidate,usableMs:usable-start,metadataMs,metadataSyncMs,pageCount,truncated:result.truncated,candidate:session.isCandidate(result.id),dirty:session.isDirty(result.id),heapBefore,heapMounted,heapMetadata:memory(),typing:{samples:samples.length,medianMs:stats(samples).median,p95Ms:stats(samples).p95,snapshots:typingSnapshots,restored}};
};

// Operational UI qualification in the real Flint host. Only isolated candidates
// and in-memory manual-save bytes are used; no user document is written.
(window as any).teiOperationalSetup = async (compactCanonicalText=true) => {
 cleanup();
 const {materializeLocalWorkspace}=await import('../../src/reactive-editor/workspace-manifest');
 const {documentApplicationPorts}=await import('../../src/application/document-application-ports');
 const {nativeDocumentSession}=await import('../../src/persistence/native-session');
 const {glossPresentationControls}=await import('../../src/features/gloss/presentation-context');
 const {WorkspaceSession}=await import('../../src/application/workspace-session');
 const {WorkspacePresentationView}=await import('../../src/application/workspace-presentation-view');
 const workspaceSession=new WorkspaceSession(materializeLocalWorkspace({id:'operational-workspace',type:'workspace-block',children:[]}),{features:{compactCanonicalText,nativeKnowledge:false,sqliteKnowledge:false,entityReferences:false,desktopApplicationIcons:false}});
 const editor=workspaceSession.editor,workspace=workspaceSession.projection;
 editor.commandRegistry.execute('flint.open',{targetKey:workspace.state.rootKey,args:undefined});
 const host=document.body.appendChild(document.createElement('div'));
 host.className='workspace-demo workspace-demo--canonical';host.dataset.windowWorkArea='';host.style.cssText='position:fixed;inset:0';
 const stop=render(()=><WorkspacePresentationView session={workspaceSession}/>,host);editor.installGateway(document);await frame();
 const app=documentApplicationPorts(editor).ports()[0].application;
 const prepared=await runInterchange({kind:'tei-document',file:{name:'operational.xml',blob:new Blob([operational])}},new AbortController().signal);
 const bank=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block')!;
 admitNative(editor.repository,prepared.bytes,bank.key);nativeDocumentSession(editor).trackCandidate(prepared.id);app.openDocument(prepared.id);await frame();
 const session=editor.documentSessions!.sessions().find(s=>s.projection.node(s.rootKey)?.payload.id===prepared.id)!;
 const controls=glossPresentationControls(session)!;controls.toggle();await frame();
 const index=(session.element as any).glossIndex, milestones=(session.element as any).teiMilestoneIndex;
 if(!index||!milestones)throw Error('Operational inventories did not mount in Flint');
 const root=editor.repository.readState().contents[session.projection.node(session.rootKey)!.contentKey];
 const ada=index.rows[0]().find((r:any)=>r.data().source?.sourceId==='ada');
 controls.inspectDefinition!(ada.definitionId);await frame();
 const clickElement=async(button:HTMLElement)=>{
  for(let parent=button.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
  button.scrollIntoView({block:'center'});await frame();const r=button.getBoundingClientRect();
  if(!r.width||!r.height||!button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('Navigation control is obscured: '+button.textContent+' '+JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}));
  await (window as any).teiTrustedClick(r.x+r.width/2,r.y+r.height/2);await frame();
 };
 const click=async(selector:string,label:string)=>{const button=[...host.querySelectorAll<HTMLButtonElement>(selector)].find(b=>b.textContent?.trim()===label);if(!button)throw Error('Missing UI: '+label);await clickElement(button);};
 const original=nativeText(captureNative(editor.repository.readState(),prepared.id));
 const initialMention=ada.occurrences().find((o:any)=>o.role==='tei/mention'),initialRange=index.range(initialMention);
 editor.gloss.open(initialMention.nodeKey,{anchor:initialRange.start,head:initialRange.end},ada.definitionId);await frame();
 const popupButton=[...document.querySelectorAll<HTMLButtonElement>('.gloss-input button')].find(b=>b.textContent==='Definition and mentions')!;
 if(!popupButton)throw Error('Mention popup lacks source-definition navigation');await clickElement(popupButton);
 const definitionPopup=!document.querySelector('.gloss-input')&&!!host.querySelector('.tei-definition-details');
 await click('.tei-definition-details button','Source definition 1');
 const definitionVisible=[...host.querySelectorAll('[role=tab][aria-selected=true]')].some(b=>b.textContent==='Metadata');
 await click('.tei-definition-details button','Mention 1');
 const mentionVisible=[...host.querySelectorAll('[role=tab][aria-selected=true]')].some(b=>b.textContent==='Text');
 const links=index.relationships.relations(ada.localId).activeOutgoing;
 const points=[];
 for(const li of host.querySelectorAll<HTMLElement>('.tei-milestones li')){
  await clickElement(li.querySelector<HTMLButtonElement>('button')!);
  const focused=editor.focus.state.focusedKey,selection=focused&&editor.mounts.get(focused)?.captureInlineSelection?.();
  const h=focused&&editor.mounts.get(focused),r=h&&h.focusElement.getBoundingClientRect(),p=h&&h.root.closest('.reactive-document-occurrence__content')!.getBoundingClientRect();
  points.push({label:li.querySelector('strong')!.textContent,selection,visible:!!r&&!!p&&r.bottom>p.top&&r.top<p.bottom});
 }
 const navigationUnchanged=nativeText(captureNative(editor.repository.readState(),prepared.id))===original;
 // Return to an ordinary mention for trusted CDP typing with both panels active.
 await click('.tei-definition-details button','Mention 1');
 const mention=ada.occurrences().find((o:any)=>o.role==='tei/mention'),mount=editor.mounts.get(mention.nodeKey)!;
 mount.focus();mount.restoreInlineSelection!({anchor:0,head:0});editor.selections.setPrimary(mention.nodeKey,editor.node(mention.nodeKey)!.contentKey,session.projection.viewId,0,0);
 const mentionRect=mount.focusElement.getBoundingClientRect();
 const pane=mount.root.closest('.reactive-document-occurrence__content')!.getBoundingClientRect();
 const mentionVisibleInPane=mentionRect.bottom>pane.top&&mentionRect.top<pane.bottom;
 const mentionSelection=mount.captureInlineSelection?.();
 const before=mount.focusElement.textContent,inventoryBefore={...milestones.diagnostics},glossBefore={...index.diagnostics},graphBefore={...index.relationships.diagnostics};
 let snapshots=0;const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=()=>{snapshots++;return snapshot();};
 (window as any).teiOperationalFinish=async()=>{
  const inserted=mount.focusElement.textContent==='X'+before;editor.repository.undo();const undone=mount.focusElement.textContent===before;editor.repository.redo();const redone=mount.focusElement.textContent==='X'+before;editor.repository.undo();
  const unchangedInventories=milestones.diagnostics.treeVisits===inventoryBefore.treeVisits&&milestones.diagnostics.definitionReads===inventoryBefore.definitionReads&&milestones.diagnostics.rowPublications===inventoryBefore.rowPublications&&index.diagnostics.treeVisits===glossBefore.treeVisits&&index.diagnostics.definitionReads===glossBefore.definitionReads&&JSON.stringify(index.relationships.diagnostics)===JSON.stringify(graphBefore);
  const typingSnapshots=snapshots;editor.repository.snapshot=snapshot;
  let saved='';const pair=new ResourcePair(editor.repository,prepared.id,{save:async generation=>{saved=generation.native;return {phase:'saved',generation:generation.generation};},recover:async()=>({phase:'failed'})},()=>[]);const save=await pair.save();
  const reloaded=decodeNative(new TextEncoder().encode(saved),undefined,compactCanonicalText);
  const result={compactCanonicalText,definitionPopup,mentionVisibleInPane,mentionSelection,definitionVisible,mentionVisible,relationships:links.length,points,navigationUnchanged,inserted,undone,redone,unchangedInventories,typingSnapshots,savePhase:save.phase,reloadEqual:nativeText(reloaded)===saved,canonicalCells:Object.values(reloaded.contents).filter(c=>c.viewType==='text-cell').length,sourceDetails:host.textContent?.includes('Source ID: ada')};
  return result;
 };
 cleanup=()=>{stop();workspaceSession.dispose();host.remove();};
 return {ready:true};
};
