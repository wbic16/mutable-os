import {defaultInitialisMetadata} from '/src/features/initialis/settings.ts';
// Isolated, renderer-neutral single-Cell geometry experiment. No application registration.
let p,cell,key,text,style,naturalWidth,rule;
const frame=()=>new Promise(r=>requestAnimationFrame(r));
export async function setup(proof){p=proof;cell=p.flow.children[0];key=cell.dataset.inlineKey;text=cell.firstChild;style=document.head.appendChild(document.createElement('style'));style.textContent='.reactive-standoff-flow,.reactive-standoff-flow > [data-character-surface]{caret-color:#ff00ff!important;caret-animation:manual!important;}';}
export function apply(kind="initialis"){const properties=JSON.parse(JSON.stringify(p.editor.node(p.text.key).payload.standoffProperties??[])).filter(a=>a.id!=='character-proof');p.editor.commands.setPayloadField(p.text.key,'standoffProperties',[...properties,{id:'character-proof',type:'style/character-surface',start:0,end:0,metadata:kind==='static'?{renderer:'static-capital',width:48,height:48}:defaultInitialisMetadata()}]);}
export async function ready(){for(let i=0;i<1000;i++){if(cell.hasAttribute('data-character-surface'))return;await frame();}throw Error('Surface did not activate');}
const box=r=>r?{x:r.x,y:r.y,w:r.width,h:r.height}:null;
export function inspect(){const s=document.getSelection(),r=s?.rangeCount?s.getRangeAt(0):null;return {cell:box(cell.getBoundingClientRect()),native:box(r?.getBoundingClientRect()),nativeRects:r?[...r.getClientRects()].map(box):[],logical:p.mount.captureInlineSelection(),endpoints:s?{anchor:s.anchorNode===text?'original-text':s.anchorNode===p.flow?'flow':s.anchorNode?.nodeName,anchorOffset:s.anchorOffset,focus:s.focusNode===text?'original-text':s.focusNode===p.flow?'flow':s.focusNode?.nodeName,focusOffset:s.focusOffset}:null,sameText:cell.firstChild===text,sameCell:p.editor.node(key)?.payload.text===text.data};}
export function points(){const r=cell.getBoundingClientRect();return [.1,.25,.75,.9].map(f=>({x:r.left+r.width*f,y:r.top+r.height/2}));}
export function refresh(){cell=p.flow.querySelector(`[data-inline-key="${CSS.escape(key)}"]`);}
export function grid(){const r=cell.getBoundingClientRect();return [.1,.5,.9].flatMap(y=>[.1,.25,.75,.9].map(x=>({x:r.left+r.width*x,y:r.top+r.height*y,expected:x<.5?0:1})));}
export function clip(){const r=cell.getBoundingClientRect();return {x:Math.floor(r.x)-5,y:Math.floor(r.y)-5,width:70,height:65,scale:3};}
export function plain(){p.editor.commands.setPayloadField(p.text.key,'standoffProperties',JSON.parse(JSON.stringify(p.editor.node(p.text.key).payload.standoffProperties??[])).filter(a=>a.id!=='character-proof'));}
export async function activation(){const samples=[];for(let i=0;i<6;i++){plain();await frame();const t=performance.now();apply();await ready();samples.push({ms:performance.now()-t,width:cell.getBoundingClientRect().width});}return samples;}
export function original(){return {text:p.mount.captureText(),key,node:p.editor.node(key)?.payload.text,domRetained:cell.firstChild===text};}
export function guards(){}
export async function clipboard(){const before=p.mount.captureText(),checks=[];p.mount.restoreInlineSelection({anchor:0,head:3});const data=new DataTransfer();p.flow.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));checks.push({name:'copy source once',passed:data.getData('text/plain')===[...before].slice(0,3).join('')});for(const kind of ['plain','rich']){const payload=kind==='rich'?data:new DataTransfer();if(kind==='plain')payload.setData('text/plain',data.getData('text/plain'));p.mount.restoreInlineSelection({anchor:before.length,head:before.length});p.flow.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:payload}));for(let i=0;i<100&&p.mount.captureText()===before;i++)await new Promise(r=>setTimeout(r,10));checks.push({name:kind+' paste',passed:p.mount.captureText()===before+data.getData('text/plain')});if(p.mount.captureText()!==before){p.editor.repository.undo();await frame();}checks.push({name:kind+' paste undo',passed:p.mount.captureText()===before});}refresh();return {checks,types:data.types,plain:data.getData('text/plain')};}
// Alternate native presentations can observe at Window capture before their input guard.
// The default native probe remains on Document capture.
let restore=[],counts,marks,events,observer,listener;
export function startCounters(){counts=window.__characterProofCounters={paragraphTextWalks:0,fullValidation:0,broadPlanning:0,unrelatedGeometry:0,unrelatedMutations:0,workers:0,requests:0,snapshots:0,commits:0,inlineCommits:0,projectionBuilds:0,elementRects:0,rangeRects:0};const wrap=(obj,name,counter)=>{const original=obj[name];obj[name]=function(...args){counts[counter]++;return original.apply(this,args)};restore.push(()=>obj[name]=original);};wrap(p.editor.repository,'snapshot','snapshots');wrap(p.editor.repository,'commit','commits');wrap(p.editor.repository,'commitInline','inlineCommits');for(const view of p.editor.projections.values())wrap(view,'build','projectionBuilds');wrap(Element.prototype,'getBoundingClientRect','elementRects');wrap(Range.prototype,'getClientRects','rangeRects');const bound=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...args){if(p.extraRoots?.some(root=>root.contains(this)))counts.unrelatedGeometry++;return bound.apply(this,args)};const mutation=new MutationObserver(records=>counts.unrelatedMutations+=records.length);for(const root of p.extraRoots??[])mutation.observe(root,{subtree:true,attributes:true,childList:true,characterData:true});restore.push(()=>mutation.disconnect());const WorkerOriginal=window.Worker;window.Worker=new Proxy(WorkerOriginal,{construct(target,args){counts.workers++;return Reflect.construct(target,args)}});restore.push(()=>window.Worker=WorkerOriginal);const fetchOriginal=window.fetch;window.fetch=(...args)=>{counts.requests++;return fetchOriginal(...args)};restore.push(()=>window.fetch=fetchOriginal);const walk=document.createTreeWalker;document.createTreeWalker=function(root,...args){if(root===p.flow||p.extraRoots?.includes(root))counts.paragraphTextWalks++;return walk.call(this,root,...args)};restore.push(()=>document.createTreeWalker=walk);marks=[];events=[];observer=new PerformanceObserver(list=>events.push(...list.getEntries().filter(e=>e.name==='keydown').map(e=>({start:e.startTime,duration:e.duration,processing:e.processingEnd-e.processingStart}))));observer.observe({type:'event',durationThreshold:16});listener=event=>{if(!['x','Backspace'].includes(event.key))return;requestAnimationFrame(()=>marks.push({start:event.timeStamp,key:event.key,firstFrameMs:performance.now()-event.timeStamp,caret:p.mount.captureInlineSelection()}));};(p.keyEventTarget??document).addEventListener('keydown',listener,true);}
export async function stopCounters(){await frame();await new Promise(r=>setTimeout(r,50));observer.disconnect();(p.keyEventTarget??document).removeEventListener('keydown',listener,true);for(const f of restore)f();restore=[];delete window.__characterProofCounters;return {counts,marks,events,domRetained:cell.firstChild===text};}
export async function openUnrelated(){
 const {render}=await import('/node_modules/.vite/deps/solid-js_web.js');
 const {createComponent}=await import('/node_modules/.vite/deps/solid-js.js');
 const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
 p.extraRoots=[];p.extraDisposers=[];
 const bank=Object.values(p.session.projection.state.nodes).find(n=>n.viewType==='workspace-object-bank-block');
 const text='Other annotated Document content. '.repeat(150);
 for(let i=0;i<2;i++){
  const placement=p.editor.commands.insert({id:crypto.randomUUID(),type:'document-block',children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text,standoffProperties:[{id:crypto.randomUUID(),type:'style/character-surface',start:0,end:0},...Array.from({length:80},(_,j)=>({id:crypto.randomUUID(),type:'style/bold',start:j*40,end:j*40+10}))]}]},{kind:'at',parentKey:bank.key,index:0});
  const view=p.editor.createView('character-unrelated-'+i,placement),root=document.body.appendChild(document.createElement('div'));root.style.cssText='position:fixed;left:2000px;top:0;width:700px';
  p.extraDisposers.push(render(()=>createComponent(ReactiveTreeView,{editor:p.editor,projection:view}),root));p.extraRoots.push(root);
 }
 await new Promise(r=>setTimeout(r,200));return {documents:2,characters:text.length*2,annotations:162};
}
export async function handlers(){
 const before=p.mount.captureText(),samples=[];p.mount.focus();p.mount.restoreInlineSelection({anchor:100,head:100});await frame();
 const original=p.mount.restoreInlineSelection;let caretDuration=0;
 p.mount.restoreInlineSelection=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{caretDuration+=performance.now()-t;}};
 for(let i=0;i<20;i++){caretDuration=0;const t=performance.now();(p.inputElement??p.flow).dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:i%2?'deleteContentBackward':'insertText',data:i%2?null:'x'}));const handler=performance.now()-t;await Promise.resolve();const queued=performance.now()-t;await frame();samples.push({handlerMs:handler,afterQueuedCaretMs:queued,caretExecutionMs:caretDuration,firstFrameMs:performance.now()-t});}
 p.mount.restoreInlineSelection=original;return {samples,restored:p.mount.captureText()===before};
}
export async function extended(){
 const checks=[],check=(name,passed)=>checks.push({name,passed:!!passed});refresh();apply();await ready();
 const source=cell.firstChild,revision=p.editor.repository.state.revision;
 const trailing=()=>{const r=document.createRange();r.setStart(cell.firstChild,1);r.collapse(true);const native=r.getBoundingClientRect(),box=cell.getBoundingClientRect();return {native:native.x,right:box.right,delta:Math.abs(native.x-box.right)};};
 const geometries=[];
 for(const [name,css] of [['font','font:22px monospace'],['zoom','zoom:1.25'],['scale','transform:scale(1.2);transform-origin:left top'],['narrow','width:170px'],['hidden','display:none']]){
  p.flow.style.cssText=css;await frame();await frame();await frame();
  if(name==='hidden')check('hidden fallback',!cell.hasAttribute('data-character-surface'));
  else {await ready();const g=trailing();geometries.push({name,...g});check(name+' advance',g.delta<.15);}
  p.flow.style.cssText='';await frame();await frame();await ready();
 }
 // Explicitly asynchronous local FontFace loading, with no network request.
 const font=new FontFace('CharacterLateFont',"url('/__late-font')");document.fonts.add(font);p.flow.style.fontFamily='CharacterLateFont,serif';await font.load();await frame();await frame();await frame();check('late font advance',trailing().delta<.15);document.fonts.delete(font);p.flow.style.fontFamily='';await frame();await frame();
 check('font/layout work keeps original Text',cell.firstChild===source);check('font/layout work makes no canonical edit',p.editor.repository.state.revision===revision);
 const container=p.flow.parentElement,previousStyle=container.style.cssText;container.style.cssText+=';height:55px;overflow:auto';container.scrollTop=10;await frame();check('scrolling keeps native advance',container.scrollTop>0&&trailing().delta<.15);container.style.cssText=previousStyle;await frame();
 const properties=JSON.parse(JSON.stringify(p.editor.node(p.text.key).payload.standoffProperties));
 for(const mode of ['missing','conflict','rtl','rotation']){
  if(mode==='missing')p.editor.commands.setPayloadField(p.text.key,'standoffProperties',properties.map(a=>a.id==='character-proof'?{...a,metadata:{renderer:'not-installed',width:48,height:48}}:a));
  if(mode==='conflict')p.editor.commands.setPayloadField(p.text.key,'standoffProperties',[...properties,{id:'conflict',type:'style/character-surface',start:0,end:0}]);
  if(mode==='rtl')p.flow.style.direction='rtl';
  if(mode==='rotation')p.flow.style.transform='rotate(3deg)';
  await frame();await frame();await frame();check(mode+' ordinary-text fallback',!cell.hasAttribute('data-character-surface')&&cell.firstChild===source);
  p.flow.style.cssText='';p.editor.commands.setPayloadField(p.text.key,'standoffProperties',properties);await ready();
 }
 p.editor.commands.replaceInlineRange(p.text.key,100,100,'\u202e');await frame();check('mixed bidi fallback',!cell.hasAttribute('data-character-surface'));p.editor.repository.undo();await frame();await ready();check('mixed bidi removal restores surface',cell.hasAttribute('data-character-surface'));
 // Native persistence envelope round-trip; reopen in a fresh repository below.
 let doc=p.editor.node(p.text.key);while(doc&&doc.viewType!=='document-block')doc=p.editor.projections.get(doc.viewId).parentOf(doc.key);
 const native=await import('/src/persistence/native-resource.ts'),encoded=native.nativeText(native.captureNative(p.editor.repository.readState(),String(doc.payload.id))),decoded=native.decodeNative(new TextEncoder().encode(encoded));
 check('native envelope round-trip',native.nativeText(decoded)===encoded);
 const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');const {render}=await import('/node_modules/.vite/deps/solid-js_web.js');const {createComponent}=await import('/node_modules/.vite/deps/solid-js.js');
 const fresh=new ReactiveEditor({type:'workspace-block',children:[]},{features:{directDomCharacterCells:p.editor.features.directDomCharacterCells}});registerCoreViews(fresh);const v=fresh.createView('reopen');const bank=fresh.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:v.state.rootKey,index:0});native.admitNative(fresh.repository,new TextEncoder().encode(encoded),fresh.repository.readState().placements[bank].contentKey);
 const paragraph=Object.values(v.state.nodes).find(n=>n.payload.id===p.editor.node(p.text.key).payload.id);check('native reopen text and property',paragraph&&paragraph.inlineContent.map(k=>v.state.nodes[k].payload.text).join('')===p.mount.captureText()&&paragraph.payload.standoffProperties.some(a=>a.id==='character-proof'));
 const root=document.body.appendChild(document.createElement('div'));root.style.cssText='position:fixed;left:400px;top:100px;width:800px;z-index:1000';const pv=fresh.createView('reopened-paragraph',paragraph.placementKey);const dispose=render(()=>createComponent(ReactiveTreeView,{editor:fresh,projection:pv}),root);for(let i=0;i<1000&&!root.querySelector('[data-character-surface]');i++)await frame();check('native reopen surface mounted',!!root.querySelector('[data-character-surface]'));dispose();fresh.dispose();root.remove();
 // Same canonical paragraph transcluded inside a Table inside vertical Tabs.
 const cellId=crypto.randomUUID();
 const nestedPlacement=p.editor.commands.insert({type:'tab-row-block',metadata:{orientation:'vertical'},children:[{type:'tab-block',metadata:{name:'Nested',active:true},children:[{type:'table-block',children:[{type:'table-row-block',children:[{id:cellId,type:'table-cell-block',children:[]}]}]}]}]},{kind:'after',anchorKey:p.text.key});
 const nestedCell=Object.values(p.view.state.nodes).find(n=>n.payload.id===cellId);
 const sharedPlacement=p.editor.commands.transclude(p.text.key,{kind:'at',parentKey:nestedCell.key,index:0});
 const shared=p.editor.nodeForPlacementInView(sharedPlacement,p.text.viewId),sharedMount=p.editor.mounts.get(shared.key),sharedFlow=sharedMount.focusElement;
 for(let i=0;i<100&&!sharedFlow.querySelector('[data-character-surface]');i++)await frame();
 const sharedCell=sharedFlow.firstElementChild;
 check('nested shared surface and occurrence identity',sharedCell!==cell&&sharedCell.hasAttribute('data-character-surface')&&cell.hasAttribute('data-character-surface')&&sharedCell.dataset.characterSurface!==cell.dataset.characterSurface);
 const textBefore=p.mount.captureText(),originalCell=cell;
 p.editor.commands.replaceInlineRange(p.text.key,100,100,'x');await frame();check('shared canonical edit in both occurrences',p.mount.captureText()===sharedMount.captureText()&&p.mount.captureText().length===textBefore.length+1);check('shared edit retains both mounted cells',p.flow.firstElementChild===originalCell&&sharedFlow.firstElementChild===sharedCell);
 p.editor.repository.undo();await frame();check('shared edit Undo',p.mount.captureText()===textBefore&&sharedMount.captureText()===textBefore);
 const nested=p.editor.nodeForPlacementInView(nestedPlacement,p.text.viewId);p.editor.commands.remove(nested.key);await frame();check('nested disposal cleans its surface only',!sharedCell.hasAttribute('data-character-surface')&&originalCell.hasAttribute('data-character-surface'));
 p.editor.repository.undo();await new Promise(r=>setTimeout(r,100));const remounted=p.editor.nodeForPlacementInView(sharedPlacement,p.text.viewId);check('nested remount restores surface',!!p.editor.mounts.get(remounted.key)?.focusElement.querySelector('[data-character-surface]'));
 for(const stop of p.extraDisposers)stop();for(const root of p.extraRoots)root.remove();
 return {checks,geometries};
}
export async function boundaryFixture(mode){
 const placement=p.editor.commands.insert({id:crypto.randomUUID(),type:'standoff-editor-block',text:mode==='line-end'?'AB C':'AB',standoffProperties:[{id:crypto.randomUUID(),type:'style/character-surface',start:1,end:1}]},{kind:'after',anchorKey:p.text.key});
 const node=p.editor.nodeForPlacementInView(placement,p.text.viewId),mount=p.editor.mounts.get(node.key),flow=mount.focusElement;
 for(let i=0;i<100&&!flow.children[1]?.hasAttribute('data-character-surface');i++)await frame();
 if(mode==='line-end')flow.style.width=(flow.children[0].getBoundingClientRect().width+48+.1)+'px';await frame();
 p.boundary={node,mount,flow};p.editor.focus.request(node.key);mount.focus();mount.restoreInlineSelection({anchor:1,head:1});
}
export function boundaryState(){const {mount,flow}=p.boundary;const r=document.getSelection().getRangeAt(0).getBoundingClientRect(),cell=flow.children[1].getBoundingClientRect();return {logical:mount.captureInlineSelection(),rect:{x:r.x,y:r.y,w:r.width,h:r.height},cell:{left:cell.left,right:cell.right,top:cell.top,bottom:cell.bottom},next:flow.children[3]?.getBoundingClientRect().top};}

export function boundaryClip(){const r=p.boundary.flow.children[1].getBoundingClientRect();return {x:Math.floor(r.x)-5,y:Math.floor(r.y)-5,width:65,height:65,scale:3};}
let background=[];
export function startBackground(seed){
 background=[];for(let i=0;i<8;i++){const config=defaultInitialisMetadata();config.settings.seed=seed+i;let done;const promise=new Promise(r=>done=r);const lease=p.editor.initialis.service.acquire('A',config,{visibility:'visible',pixelRatio:1},surface=>{if(surface)done();});background.push({lease,promise});}
}
export async function stopBackground(){await Promise.all(background.map(item=>item.promise));for(const item of background)item.lease.dispose();background=[];}
export async function loadingStress(count,seed){
 const {render}=await import('/node_modules/.vite/deps/solid-js_web.js'),{createComponent}=await import('/node_modules/.vite/deps/solid-js.js'),{ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
 const bank=Object.values(p.session.projection.state.nodes).find(n=>n.viewType==='workspace-object-bank-block');
 const properties=Array.from({length:count},(_,i)=>{const metadata=defaultInitialisMetadata();metadata.settings.seed=seed+i;return {id:crypto.randomUUID(),type:'style/character-surface',start:i*2,end:i*2,metadata};});
 const place=p.editor.commands.insert({type:'document-block',children:[{type:'standoff-editor-block',text:'A '.repeat(count),standoffProperties:properties}]},{kind:'at',parentKey:bank.key,index:0});
 const view=p.editor.createView('initialis-stress-'+count,place),root=document.body.appendChild(document.createElement('div'));root.style.cssText='position:fixed;left:280px;top:200px;width:1100px;height:750px;overflow:auto;background:white;z-index:1000';
 const before={...p.editor.initialis.service.stats},started=performance.now();const dispose=render(()=>createComponent(ReactiveTreeView,{editor:p.editor,projection:view}),root);
 let first=0,peakQueued=0;for(let i=0;i<4000;i++){const ready=root.querySelectorAll('[data-character-surface]').length;if(ready&&!first)first=performance.now()-started;peakQueued=Math.max(peakQueued,p.editor.initialis.service.stats.queued);if(ready===count)break;await frame();}
 const ready=root.querySelectorAll('[data-character-surface]').length,elapsed=performance.now()-started,after={...p.editor.initialis.service.stats};dispose();root.remove();p.editor.disposeView(view);
 return {count,ready,elapsed,first,peakQueued,generated:after.generated-before.generated,bytes:after.bytes,peakBytes:after.peakBytes,workersStarted:after.workersStarted-before.workersStarted,failures:after.failures-before.failures};
}
