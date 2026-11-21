import {CompactDocument,CompactWorkspace,length,plain} from './model';
import {fixtureBytes,fixture,edge} from './fixture';
import {mountEditor} from './editor';
import {allocations,mountReadonly} from './presentation';
import {cellOracle} from './cell-oracle';
import {prepareTeiDocument} from '../../src/interchange/tei/native';
import small from '../../src/interchange/tei/fixtures/A040080.xml?raw';
import large from '../../src/interchange/tei/fixtures/A041209.xml?raw';
const anthology=(sections:number)=>large.replace('</body>',Array.from({length:sections},(_,i)=>`<div n="${i}"><head>Correspondence section ${i+1}</head>`+Array.from({length:20},()=>'<p>A letter records a place, a date, and a reading. <persName ref="#missing">The correspondent</persName> retained the original wording, including <del>deleted</del> and <add>added</add> passages, for later scholarly interpretation.</p>').join('')+'</div>').join('')+'</body>');
const sources={small,large,anthology:anthology(12),extended:anthology(30),populated:large};
const win=window as any,frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
let source:Uint8Array,model:CompactDocument|undefined,editor:ReturnType<typeof mountEditor>|undefined,extras:any[]=[];
const host=document.createElement('main');host.style.cssText='width:900px;margin:20px auto;font:16px/1.5 Georgia';document.body.append(host);
win.compactSetup=async(name:keyof typeof sources|'native'|'long')=>{
 win.compactCleanup();
 const long=fixture();long.document.blocks=long.document.blocks.filter(b=>['doc','page','b'].includes(b.id));long.document.blocks[1].children=[edge('b','b')];long.document.blocks[2].inline=[{kind:'text',text:'x'.repeat(120624)}];long.document.blocks[2].properties.standoffProperties=[{type:'style/bold',start:40000,end:80000}];
 source=name==='long'?new TextEncoder().encode(JSON.stringify(long)):name==='native'?fixtureBytes():(await prepareTeiDocument({name:name+'.tei',blob:new Blob([sources[name]])},{},false)).bytes;
 if(name==='populated')for(let i=0;i<3;i++)extras.push((await prepareTeiDocument({name:`existing-${i}.tei`,blob:new Blob(['<TEI><text><body>'+Array.from({length:80},()=>'<p>'+'x'.repeat(100)+'</p>').join('')+'</body></text></TEI>'])},{},false)).bytes);
 return {bytes:source.length};
};
win.compactSetupNative=(base64:string)=>{win.compactCleanup();source=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));return {bytes:source.length};};
win.compactCleanup=()=>{editor?.dispose();editor=undefined;model=undefined;for(const x of extras){x.editor?.dispose();x.host?.remove();}extras=[];host.replaceChildren();win.__atomCount=0;};
win.compactStage=async(stage:string,mode:'compact'|'cells'='compact')=>{
 const t=performance.now(),before={...allocations};let detail:any={};
 if(stage==='admit'){
  const workspace=mode==='compact'?new CompactWorkspace():undefined;
  extras=extras.map((bytes,i)=>{const m=workspace?workspace.admit(bytes):cellOracle(bytes);let h:HTMLElement|undefined,e:any;if(i<2){h=document.createElement('section');document.body.prepend(h);e=mountEditor(m,h);}return {model:m,host:h,editor:e};});
  // Populated setup excluded from the timed admission below; remains retained.
  const admittedStart=performance.now();win.__atomCount=0;win.__forbidCells=mode==='compact';
  try{model=workspace?workspace.admit(source):cellOracle(source);}finally{win.__forbidCells=false;}
  const b=model.all();detail={admissionMs:performance.now()-admittedStart,canonicalRecords:b.length+model.metrics.canonicalCells,canonicalCells:model.metrics.canonicalCells,canonicalCellPlacements:model.metrics.canonicalCellPlacements,textPositions:b.reduce((n,b)=>n+length(b.inline??[]),0),blocks:b.length,atomsConstructed:win.__atomCount,workspaceDocuments:extras.length+1};
 }else if(stage==='readonly'){
  win.__forbidCells=true;try{detail=mountReadonly(model!,host);}finally{win.__forbidCells=false;}
 }else if(stage==='activate'||stage==='reactivate'){
  host.replaceChildren();editor=mountEditor(model!,host);detail={occurrences:editor.occurrences.size,editingCells:[...editor.occurrences.values()].reduce((n,o)=>n+o.cells.length,0)};
 }else if(stage==='dispose'){editor?.dispose();editor=undefined;host.replaceChildren();}
 else if(stage==='type'){
  const [key,o]=[...editor!.occurrences].find(([,o])=>o.cells.length>10&&!o.cells.some(c=>c.image))!;editor!.focusAt(key,1);const prior=plain(model!.get(o.id).inline!),times=[];
  for(let i=0;i<(o.cells.length>100000?2:10);i++){let now=performance.now();o.flow!.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'x'}));times.push(performance.now()-now);await frame();now=performance.now();o.flow!.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));times.push(performance.now()-now);await frame();}
  detail={dispatchMs:times,restored:plain(model!.get(o.id).inline!)===prior,affectedLength:o.cells.length,metrics:{...model!.metrics}};
 }else if(stage==='history'){let now=performance.now();model!.undo();const undoMs=performance.now()-now;now=performance.now();model!.redo();detail={undoMs,redoMs:performance.now()-now};}
 else if(stage==='capture'){const result=model!.capture();detail={bytes:new TextEncoder().encode(result).length};}
 const syncMs=performance.now()-t;await frame();
 return {stage,mode,syncMs,frameInclusiveMs:performance.now()-t,...detail,allocations:Object.fromEntries(Object.entries(allocations).map(([k,v])=>[k,v-(before as any)[k]])),domElements:host.querySelectorAll('*').length,domCharacterSpans:host.querySelectorAll('[data-inline-key]').length,heapObserved:(performance as any).memory?.usedJSHeapSize};
};
win.compactBrowserFixture=()=>{
 win.compactCleanup();model=new CompactDocument(fixtureBytes());editor=mountEditor(model,host,['a','a','b']);
 win.poc={model,editor,host};return {keys:[...editor.occurrences.keys()],native:model.capture()};
};
win.compactReadonlyFixture=()=>{editor?.dispose();editor=undefined;host.replaceChildren();return mountReadonly(model!,host);};
win.compactReady=true;

win.compactContext=()=>({model,editor,host,allocations});
win.compactM2Fixture=(kind='structural')=>{
 win.compactCleanup();const f=fixture();
 if(kind!=='mixed'){
  f.document.blocks=f.document.blocks.filter(b=>['doc','page','b','mode'].includes(b.id));
  f.document.blocks.find(b=>b.id==='page')!.children=[edge('b','b'),edge('mode','mode')];
  const b=f.document.blocks.find(b=>b.id==='b')!,m=f.document.blocks.find(b=>b.id==='mode')!;
  b.inline=[{kind:'text',text:'Alpha beta'}];m.inline=[{kind:'text',text:'Gamma delta'}];
  if(kind!=='modes')delete m.properties.mode;
  b.properties.standoffProperties=[{type:'style/bold',start:0,end:6},{type:'style/italics',start:2,end:8},{type:'point/a',start:4,end:4,isZeroWidth:true},{type:'point/b',start:4,end:3,isZeroWidth:true}];
  if(kind==='shared')f.document.blocks.find(b=>b.id==='page')!.children!.push(edge('shared-b','b','reference'));
 }
 model=new CompactDocument(new TextEncoder().encode(JSON.stringify(f)));editor=mountEditor(model,host,kind==='mixed'?['a','a','b']:kind==='shared'?['b','mode','b']:undefined);win.poc={model,editor,host};return {keys:[...editor.occurrences.keys()]};
};
win.compactSecond=()=>{const h=document.createElement('section');h.style.cssText=host.style.cssText;document.body.append(h);const e=mountEditor(model!,h);extras.push({host:h,editor:e});return e.occurrences.size;};
win.compactProfile=()=>{
 const totals:Record<string,{ms:number;calls:number}>={},stack:Array<{child:number}>=[],undo:Array<()=>void>=[];
 const wrap=(object:any,key:string,label:string)=>{const f=object[key];if(typeof f!=='function')return;object[key]=function(...args:any[]){const t=performance.now(),s={child:0};stack.push(s);try{return f.apply(this,args);}finally{const dt=performance.now()-t;stack.pop();if(stack.length)stack.at(-1)!.child+=dt;const v=totals[label]??={ms:0,calls:0};v.ms+=dt-s.child;v.calls++;}};undo.push(()=>object[key]=f);};
 for(const [key,label]of Object.entries({replace:'canonicalReplacement',commit:'historyConstruction',publish:'notifications',mapProperties:'standoffTransformation'}))wrap(model,key,label);
 for(const e of [editor,...extras.map(x=>x.editor)].filter(Boolean)){
  for(const [key,o]of e!.occurrences){for(const k of ['render','paint','paintChanges'])wrap(o,k,'presentation');wrap(o,'beforeRender','selectionCapture');wrap(o,'afterRender','occurrenceCommit');wrap(o.renderer,'update','keyedDOM');if(o.index)wrap(o.index,'splice','positionIndex');const mount=e!.mounts.get(key);for(const k of ['restoreInlineSelection','captureInlineSelection','inlineBoundary'])wrap(mount,k,'selectionDOM');wrap(mount,'adjacentGrapheme','graphemes');}
  for(const k of ['invalidateRanges','releaseCaret'])wrap(e!.measurements,k,'geometryInvalidation');for(const k of ['mapContentEdit','setPrimary'])wrap(e!.selections,k,'selectionMapping');
 }
 win.compactProfileStop=()=>{undo.reverse().forEach(f=>f());return totals;};return true;
};
win.compactMeasure=async(position:'begin'|'middle'|'end',rounds=6)=>{
 const [key,o]=[...editor!.occurrences].find(([,o])=>o.cells.length>100000)!,records:any[]=[],metrics={...model!.metrics},alloc={...allocations},prior=plain(model!.get(o.id).inline!);
 const measure=async(operation:string,action:()=>void)=>{const t=performance.now();action();const syncMs=performance.now()-t;await frame();records.push({operation,syncMs,settledMs:performance.now()-t});};
 const at=()=>position==='begin'?1:position==='middle'?Math.floor(o.cells.length/2):o.cells.length-1;
 const input=(inputType:string,data?:string)=>o.flow!.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType,data}));
 for(let i=0;i<rounds;i++){
  editor!.focusAt(key,at());await frame();
  await measure('insert',()=>input('insertText','x'));await measure('backspace',()=>input('deleteContentBackward'));
  await measure('delete',()=>input('deleteContentForward'));await measure('undoDelete',()=>model!.undo());
  await measure('unicodeInsert',()=>input('insertText','é'));await measure('graphemeBackspace',()=>input('deleteContentBackward'));
  await measure('undo',()=>model!.undo());await measure('redo',()=>model!.redo());
  await measure('selection',()=>editor!.focusAt(key,at()+1));
 }
 const restored=plain(model!.get(o.id).inline!)===prior,sharedConsistent=[editor,...extras.map(x=>x.editor)].filter(Boolean).every(e=>[...e!.occurrences.values()].filter((x:any)=>x.id===o.id).every((x:any)=>x.cells.map((c:any)=>c.text).join('')===prior));
 return {position,records,restored,sharedConsistent,metrics:Object.fromEntries(Object.entries(model!.metrics).map(([k,v])=>[k,v-(metrics as any)[k]])),allocations:Object.fromEntries(Object.entries(allocations).map(([k,v])=>[k,v-(alloc as any)[k]])),index:[...editor!.occurrences.values()].map(o=>o.index?.work)};
};
