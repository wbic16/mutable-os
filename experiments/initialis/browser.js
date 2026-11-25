// EXPERIMENTAL RESEARCH ONLY. No application imports, no framework registration.
// CSS backgrounds preserve existing Text nodes. This is NOT a completed standoff renderer.
const frame=()=>new Promise(r=>requestAnimationFrame(r));
const stats=xs=>{const s=[...xs].sort((a,b)=>a-b);return {n:s.length,median:s[Math.floor(s.length/2)]??null,p95:s[Math.min(s.length-1,Math.ceil(s.length*.95)-1)]??null,max:s.at(-1)??null}};
const workers=[],workerEvents=[],samples=[],cache=new Map();let lib,style,url,target,cellKey,sourceIndex,mode,queue,live=0,closed=0,generations=0,originalWorker,report={};
const base={text:'A',font:'cinzel-700',frame:'circle',seed:42};
const emit=s=>console.log('[initialis] '+s);
function instrumentWorkers(failure){
 window.Worker=new Proxy(originalWorker,{construct(Target,args){const start=performance.now();if(failure)args=[`/__research-worker.js?mode=${failure}`,{type:'module'}];const w=Reflect.construct(Target,args);workers.push(w);const record={created:start,messages:0};workerEvents.push(record);w.addEventListener('message',e=>{record.messages++;if(!record.firstMessageMs)record.firstMessageMs=performance.now()-start;if(e.data.stats)samples.push(e.data.stats);});return w;}});
}
async function generate(p,size=128){generations++;const start=performance.now();let service;const bitmap=await lib.render(p,{size,timed:ms=>service=ms});live++;return {bitmap,elapsed:performance.now()-start,service};}
function release(b){b.close();closed++;live--;}
function paint(bitmap,size=48){const c=document.createElement('canvas');c.width=c.height=bitmap.width;c.style.width=c.style.height=size+'px';c.setAttribute('aria-hidden','true');c.getContext('2d').drawImage(bitmap,0,0);return c;}
function key(p,size){return JSON.stringify([p,size]);}
async function cached(p,size){const k=key(p,size);if(cache.has(k))return cache.get(k);const result=await generate(p,size);cache.set(k,result);while(cache.size>16){const first=cache.keys().next().value;release(cache.get(first).bitmap);cache.delete(first);}return result;}
function attachCss(proof,layout='inline'){
 style??=document.head.appendChild(document.createElement('style'));
 const box=layout==='drop'?'float:left;width:64px;height:64px;margin-right:8px;line-height:64px;':layout==='display'?'display:block;width:96px;height:96px;line-height:96px;':'display:inline-block;width:48px;height:48px;line-height:48px;vertical-align:-.15em;';
 style.textContent=`[data-inline-key="${CSS.escape(cellKey)}"]{${box}color:transparent!important;background:url("${url}") center/contain no-repeat;caret-color:#111;}@media(forced-colors:active){[data-inline-key="${CSS.escape(cellKey)}"]{background:none;color:CanvasText!important}}`;
}
export async function attach(proof,selectedMode){
 mode=selectedMode;report.mode=mode;originalWorker=window.Worker;if(mode==='baseline')return;instrumentWorkers();
 const start=performance.now();lib=await import('/__initialis/lib/initialis.js');report.moduleLoadMs=performance.now()-start;
 target=[...proof.flow.querySelectorAll('[data-inline-key]')].find(c=>/^[A-Z]$/.test(c.textContent));cellKey=target.dataset.inlineKey;sourceIndex=proof.mount.inlinePoint(target.firstChild,0);
 const property={id:'experimental-character-renderer',type:'experimental/character-renderer',start:sourceIndex,end:sourceIndex,metadata:{renderer:'initialis',rendererVersion:'6cf93f7d3d2922efdbeb86cafa27f39758be9398',settings:{...base,text:undefined},layout:{mode:'inline'}}};
 const e=proof.editor,node=e.node(proof.text.key);e.commands.setPayloadField(node.key,'standoffProperties',JSON.parse(JSON.stringify([...(node.payload.standoffProperties??[]),property])));
 const rev=e.repository.state.revision;
 const first=await cached({...base,text:target.textContent},128);report.cold={renderMs:first.elapsed,serviceMs:first.service};
 const c=paint(first.bitmap);url=c.toDataURL();attachCss(proof);await frame();report.cold.visibleCallbackMs=performance.now()-start;report.generationNoCanonicalChanges=e.repository.state.revision===rev;
 report.textPreserved=target.textContent===e.node(cellKey).payload.text;report.target={text:target.textContent,index:sourceIndex};
 const before=generations,hits=[];for(let i=0;i<100;i++){const t=performance.now();await cached({...base,text:target.textContent},128);hits.push(performance.now()-t);}report.cache={lookupMs:stats(hits),avoidedGenerations:100,actualGenerations:generations-before};
 // Start all jobs before the unchanged Flint typing loop; no engine start is needed per key.
 if(mode==='contended'){queue=Promise.all(Array.from({length:100},(_,i)=>generate({...base,text:String.fromCharCode(65+i%26),seed:100+i},128).then(r=>{release(r.bitmap);return r.elapsed})));}
 proof.flow.addEventListener('compositionstart',()=>{if(style)style.disabled=true;});proof.flow.addEventListener('compositionend',()=>{if(style)style.disabled=false;});
 report.workersAfterAttach=workers.length;emit('attached '+mode);
}
export async function qualify(proof){
 if(mode==='baseline')return report;
 if(queue){report.concurrentQueueMs=stats(await queue);emit('concurrent queue finished');}
 if(mode==='contended')return {...report,typingExtraGenerations:generations-101,workerEngineTimes:stats(samples.map(s=>s.total))};
 const {editor:e,mount,flow}=proof;report.typingExtraGenerations=generations-(mode==='contended'?101:1);report.workerTimings=workerEvents;
 // All source instrumentation is local to this disposable browser session.
 const beforeText=mount.captureText(),originalNode=e.node(proof.text.key),originalCell=e.node(cellKey),currentProperty=()=>e.node(proof.text.key).payload.standoffProperties.find(p=>p.id==='experimental-character-renderer');
 const tests=[];function check(ok,name,details){tests.push({name,passed:!!ok,...details?{details}:{}});}
 check(target.firstChild?.nodeType===3&&target.childNodes.length===1,'Original Text node remains the cell child');
 for(const [name,a,b,inputType,data] of [['insert-before',sourceIndex,sourceIndex,'insertText','x'],['insert-after',sourceIndex+1,sourceIndex+1,'insertText','x'],['delete-character',sourceIndex,sourceIndex+1,'deleteContentBackward',null]]){
  mount.restoreInlineSelection({anchor:a,head:b});flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType,data}));await Promise.resolve();
  const property=JSON.parse(JSON.stringify(currentProperty()??null));check(mount.captureText()!==beforeText,name+' edits canonical text',{property,cellPresent:!!e.node(cellKey)});
  e.repository.undo();await Promise.resolve();check(mount.captureText()===beforeText,name+' Undo');e.repository.redo();await Promise.resolve();e.repository.undo();await Promise.resolve();
 }
 mount.restoreInlineSelection({anchor:Math.max(0,sourceIndex-1),head:sourceIndex+2});check(mount.captureInlineSelection().head===sourceIndex+2,'Selection crosses decorated cell');
 const data=new DataTransfer();flow.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));report.clipboard={types:data.types,plain:data.getData('text/plain'),html:data.getData('text/html'),mutable:data.types.filter(t=>t.includes('mutable')).map(t=>({type:t,length:data.getData(t).length}))};
 check(data.getData('text/plain')===[...beforeText].slice(Math.max(0,sourceIndex-1),sourceIndex+2).join(''),'Copy plain text retains source once');
 for(const kind of ['plain','rich']){
  const paste=kind==='rich'?data:new DataTransfer();if(kind==='plain')paste.setData('text/plain',data.getData('text/plain'));
  mount.restoreInlineSelection({anchor:[...beforeText].length,head:[...beforeText].length});flow.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:paste}));
  for(let i=0;i<100&&mount.captureText()===beforeText;i++)await new Promise(r=>setTimeout(r,10));
  check(mount.captureText()===beforeText+data.getData('text/plain'),kind+' paste preserves original text');
  if(mount.captureText()!==beforeText){e.repository.undo();await Promise.resolve();check(mount.captureText()===beforeText,kind+' paste Undo');}
 }
 // DTO reload qualification; native archive and publication handling remain future gates.
 let doc=originalNode;while(doc&&doc.viewType!=='document-block')doc=e.projections.get(doc.viewId).parentOf(doc.key);
 const native=await import('/src/persistence/native-resource.ts');
 const encoded=native.nativeText(native.captureNative(e.repository.readState(),String(doc.payload.id)));
 const decoded=native.decodeNative(new TextEncoder().encode(encoded));
 check(native.nativeText(decoded)===encoded,'Native document decode/encode preserves experimental property and text');
 const revision=e.repository.state.revision;style.remove();style=null;check(mount.captureText()===beforeText&&e.repository.state.revision===revision,'Removing presentation restores text without history');attachCss(proof);
 report.correctness=tests;
 // Geometry checks inspect this paragraph only; floats are measured rather than assumed.
 const geometry=()=>{const cells=[...flow.querySelectorAll('[data-inline-key]')];const boxes=cells.slice(sourceIndex,sourceIndex+160).map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}});return {flowWidth:flow.getBoundingClientRect().width,whiteSpace:getComputedStyle(flow).whiteSpace,target:boxes[0],lineStarts:boxes.slice(1).filter((r,i,a)=>i===0||Math.abs(r.y-a[i-1].y)>1).slice(0,8),lines:[...new Set(boxes.slice(1).map(r=>Math.round(r.y)))].slice(0,6),next:boxes.slice(1,12)};};
 const originalWidth=flow.style.width;flow.style.width='320px';
 report.layout={};for(const layout of ['inline','drop','display']){attachCss(proof,layout);await frame();report.layout[layout]=geometry();}flow.style.width=originalWidth;attachCss(proof);
 const longTasks=[],gaps=[];let previous=performance.now(),tracking=true;const tick=t=>{gaps.push(t-previous);previous=t;if(tracking)requestAnimationFrame(tick);};requestAnimationFrame(tick);const obs=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));obs.observe({type:'longtask'});
 report.warm=[];const styles=[{}, {orn:'none'}, {frame:'rect',fPattern:'hatch'}, {font:'cormorant-garamond-700',frame:'circle'}];
 for(let i=0;i<24;i++){const p={...base,...styles[i%4],text:'AMQWYZ'[i%6],seed:42+i};const r=await generate(p);report.warm.push({letter:p.text,style:i%4,elapsed:r.elapsed,service:r.service});release(r.bitmap);}report.warmSummary=stats(report.warm.map(r=>r.elapsed));emit('warm samples finished');
 report.many=[];const gallery=document.body.appendChild(document.createElement('div'));gallery.style.cssText='position:fixed;right:5px;bottom:5px;display:grid;grid-template-columns:repeat(10,48px);gap:2px;z-index:99999;background:white;pointer-events:none';
 for(const n of [1,10,50,100]){gallery.replaceChildren();const start=performance.now();const elapsed=await Promise.all(Array.from({length:n},(_,i)=>generate({...base,text:String.fromCharCode(65+i%26),seed:1000+n*100+i},128).then(r=>{gallery.append(paint(r.bitmap));release(r.bitmap);return r.elapsed})));await frame();report.many.push({n,totalMs:performance.now()-start,latency:stats(elapsed)});emit(n+' instances finished');}
 report.qualityImages=[];report.resolution=[];for(const size of [64,128,256,512,1024]){const times=[];for(let i=0;i<3;i++){const r=await generate(base,size);times.push(r.elapsed);if(i===0){const image=paint(r.bitmap,64);gallery.append(image);report.qualityImages.push({size,png:image.toDataURL()});}release(r.bitmap);}report.resolution.push({size,latency:stats(times),rgbaBytes:size*size*4});}
 report.reproducibility=[];for(let i=0;i<3;i++){const r=await generate(base,128),c=paint(r.bitmap),bytes=c.getContext('2d').getImageData(0,0,128,128).data;const hash=await crypto.subtle.digest('SHA-256',bytes);report.reproducibility.push([...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join(''));release(r.bitmap);}
 // Lower-case/non-Latin handling is checked against the actual shipped glyph table.
 const fm=await import('/__initialis/render/src/fonts.js');await fm.fontList();await fm.loadFont(base.font);report.coverage=['A','a','é','e\u0301','中','😀','AB','\u0301'].map(text=>({text,glyphs:fm.glyphs(fm.getFont(base.font),text).map(g=>({missing:g.missing,advance:g.adv}))}));
 report.invalidation=[];for(const [reason,size,settings] of [['resize',256,base],['zoom-DPR',512,base],['theme',128,{...base,inkA:'#eeeeee',paper:'#111111'}]]){const t=performance.now(),r=await cached(settings,size);report.invalidation.push({reason,ms:performance.now()-t,renderMs:r.elapsed});}
 // Scroll within the real editor; no generation is tied to visibility/scroll.
 const genBefore=generations,panel=flow.closest('.reactive-tabs__panel'),old=panel.style.cssText;panel.style.maxHeight='180px';panel.style.overflow='auto';const scroll=[];for(let i=0;i<20;i++){const t=performance.now();panel.scrollTop=i%2?0:100;await frame();scroll.push(performance.now()-t);}panel.style.cssText=old;report.scroll={rafMs:stats(scroll),extraGenerations:generations-genBefore};
 const removed=performance.now();gallery.remove();await frame();report.unmountMs=performance.now()-removed;
 // Actual completed outputs, delayed to force a stale settlement; the adapter gate discards it.
 let ticket=1,committed='',stale=0;const oldJob=generate({...base,text:'Q'},128).then(async r=>{await new Promise(r=>setTimeout(r,100));if(ticket!==1)stale++;else committed='Q';release(r.bitmap);});ticket=2;const newJob=generate({...base,text:'W'},128).then(r=>{committed='W';release(r.bitmap);});await Promise.all([oldJob,newJob]);report.stale={ignored:stale,committed};
 // Inject engine failures only after normal qualification; each module has its own worker pool.
 report.failures=[];for(const failure of ['worker','webgl','font']){const firstWorker=workers.length;instrumentWorkers(failure==='font'?undefined:failure);if(failure==='font')await fetch('/__research-failure?mode=font');const module=await import('/__initialis/lib/initialis.js?failure='+failure);const t=performance.now();let outcome;try{const b=await Promise.race([module.render(base,{size:64}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Research timeout after 10s')),10000))]);outcome='resolved bitmap (not necessarily valid glyph)';b.close();}catch(err){outcome=String(err).slice(0,200);}report.failures.push({failure,ms:performance.now()-t,outcome,workersCreated:workers.length-firstWorker});workers.slice(firstWorker).forEach(w=>w.terminate());await fetch('/__research-failure?mode=');}
 window.Worker=originalWorker;tracking=false;await frame();obs.disconnect();report.mainThread={longTasks,frameGapsMs:stats(gaps),framesOver33ms:gaps.filter(g=>g>33.34).length,note:'rAF gaps are missed-frame proxies, not compositor dropped-frame counts'};
 const closedBefore=closed;for(let i=0;i<20;i++)await cached({...base,orn:'none',seed:90000+i},128);report.eviction={limit:16,entries:cache.size,closedDuringFill:closed-closedBefore};
 report.memory={ownedBitmaps:live,closedBitmaps:closed,cacheEntries:cache.size,cacheRgbaBytes:[...cache.values()].reduce((n,r)=>n+r.bitmap.width*r.bitmap.height*4,0),workerObjects:workers.length,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,note:'RGBA is a lower bound; worker heaps, GPU textures and shared process memory are not measured'};
 for(const r of cache.values())release(r.bitmap);cache.clear();report.memory.afterCacheDispose={ownedBitmaps:live,closedBitmaps:closed};
 report.workerEngineTimes=stats(samples.map(s=>s.total));report.settingsKeys=Object.keys(await lib.settings(base)).length;report.generations=generations;emit('qualification finished');return report;
}
export function dispose(){style?.remove();workers.forEach(w=>w.terminate());window.Worker=originalWorker;for(const r of cache.values())release(r.bitmap);cache.clear();}
