// Compare original editor core, direct spans, minimal Solid spans and current editor.
// Read-only: actual native input is loaded into isolated Chrome tabs; nothing is saved.
// Usage: node scripts/compare-standoff-rendering.mjs <native-file> [output.json]
import {createServer} from 'vite';
import solid from 'vite-plugin-solid';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const input=process.argv[2];if(!input)throw Error('Supply a native Document');
const output=process.argv[3]??'/tmp/speedy-load-profile/render-comparison.json';
const bytes=await readFile(input),original=await readFile('src/library/original/modules/speedy/editor-new-2.js','utf8');
const fixtureId=path.resolve('scripts/__comparison-cells.tsx');
const vite=await createServer({configFile:false,plugins:[{name:'comparison',resolveId(id){if(id==='/__comparison-cells.tsx')return fixtureId;},load(id){if(id===fixtureId)return `import {For} from 'solid-js';export function Cells(props){return <For each={props.paragraphs}>{text=><div class="text-block"><For each={[...text]}>{(char,index)=><span data-inline-index={index()}>{char}</span>}</For></div>}</For>}`;},configureServer(server){
 server.middlewares.use('/__input',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(bytes);});
 server.middlewares.use('/__original',(_req,res)=>{res.setHeader('Content-Type','text/plain');res.end(original);});
 server.middlewares.use('/__comparison',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><head><style>body{margin:0}.benchmark{width:840px;height:620px;overflow:auto;font:16px/24px serif}.benchmark .text-block,.benchmark .reactive-standoff-flow{white-space:pre-wrap;font:16px/24px serif;min-height:24px}.benchmark .reactive-standoff-flow{margin:0;padding:0}.benchmark .carriage-return{display:inline}</style></head><body></body></html>');});
}},solid()],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const profile=await mkdtemp(path.join(tmpdir(),'standoff-comparison-'));
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
const results=[];
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Chrome startup timed out')),15000);chrome.once('error',reject);chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let sequence=0;const pending=new Map();
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data),p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},120000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params,sessionId}));});
 const modes=['original-text','original-bind','direct-text','solid-text','reactive-text','reactive-annotated','current-text','current-annotated'];
 for(let round=0;round<Number(process.env.COMPARE_ROUNDS??2);round++)for(const mode of round%2?[...modes].reverse():modes){
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__comparison`},sessionId);
 await evaluate(`(async()=>{
  const wire=await(await fetch('/__input')).json(),original=await(await fetch('/__original')).text();
  let Original;new Function('define',original)((name,deps,factory)=>{Original=factory({find:(object,predicate)=>Object.entries(object).find(([key,value])=>predicate(value,key))?.[1]});});
  const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
  const {registerApplicationViews}=await import('/src/application/features.ts');
  const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
  const native=await import('/src/persistence/native-resource.ts');
  const {Cells}=await import('/__comparison-cells.tsx');
  const source=await(await fetch('/src/rendering/standoff-editor-view.tsx')).text();
  const {DEV}=await import(source.split('"').find(p=>p.includes('/solid-js.js')));
  const treeSource=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();
  const {render,createComponent}=await import(treeSource.split('"').find(p=>p.includes('/solid-js_web.js')));
  const blocks=new Map(wire.document.blocks.map(b=>[b.id,b]));
  const root=blocks.get(wire.document.root.target.blockId),paragraphs=root.children.map(edge=>blocks.get(edge.target.blockId));
  if(paragraphs.some(p=>p.type!=='standoff-editor-block'||p.inline.some(a=>a.kind!=='text')))throw Error('Comparison expects text paragraphs');
  const texts=paragraphs.map(p=>p.inline.map(a=>a.text).join(''));let offset=0;
  const properties=paragraphs.flatMap((p,i)=>{const result=(p.properties.standoffProperties??[]).map((a,index)=>({...a,index,startIndex:offset+a.start,endIndex:offset+a.end}));offset += [...texts[i]].length;return result;});
  window.bench={wire,Original,ReactiveEditor,registerApplicationViews,ReactiveTreeView,native,Cells,DEV,render,createComponent,texts,properties};
 })()`);
 const result=await evaluate(`(async()=>{
  const mode=${JSON.stringify(mode)}, {wire,Original,ReactiveEditor,registerApplicationViews,ReactiveTreeView,native,Cells,DEV,render,createComponent,texts,properties}=bench;
  const host=document.body.appendChild(document.createElement('div'));host.className='benchmark';
  const stats={mode,characters:texts.reduce((n,t)=>n+[...t].length,0),paragraphs:texts.length,inputAnnotations:properties.length};
  let prepareMs=0,serializeMs=0,projectionMs=0,commitMs=0,owners=0,pure=0,effects=0,offsetMs=0;
  const count=owner=>{owners++;if(owner.fn){if(owner.pure)pure++;else effects++;}};
  let projection,editor;
  if(mode.startsWith('current') || mode.startsWith('reactive')){
   if(mode.endsWith('-text'))for(const b of wire.document.blocks)delete b.properties.standoffProperties;
   const bytes=new TextEncoder().encode(JSON.stringify(wire));const start=performance.now();
   editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]},{features:{directDomCharacterCells:!mode.startsWith('reactive')}});registerApplicationViews(editor);editor.createView('workspace');
   const bank=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block');
   const commit=editor.repository.commit.bind(editor.repository);editor.repository.commit=(...args)=>{const t=performance.now();try{return commit(...args);}finally{commitMs+=performance.now()-t;}};
   const admitted=native.admitNativeWithResource(editor.repository,bytes,bank.key);prepareMs=performance.now()-start;
   let t=performance.now();native.nativeText(admitted.resource);serializeMs=performance.now()-t;
   t=performance.now();projection=editor.createView('document',admitted.placementKey);projectionMs=performance.now()-t;
   stats.canonicalContents=Object.keys(editor.repository.readState().contents).length;
   stats.canonicalPlacements=Object.keys(editor.repository.readState().placements).length;
   stats.projectedNodes=[...editor.projections.values()].reduce((n,v)=>n+Object.keys(v.state.nodes).length,0);
  }
  if(DEV)DEV.hooks.afterCreateOwner=count;
  const start=performance.now();let legacy;
  if(mode.startsWith('original')){
   const offset=Original.prototype.calculateCellOffsets;Original.prototype.calculateCellOffsets=function(...args){const t=performance.now();try{return offset.apply(this,args);}finally{offsetMs+=performance.now()-t;}};
   const propertyType=Object.fromEntries(properties.map(p=>[p.type,{format:'decorate',className:''}]));
   legacy=new Original({container:host,blockClass:'text-block',propertyType});
   legacy.bind({text:texts.join(''),properties:mode==='original-bind'?properties:[]});
  }else if(mode==='direct-text'){
   const fragment=document.createDocumentFragment();for(const text of texts){const paragraph=document.createElement('div');paragraph.className='text-block';let i=0;for(const c of text){const span=document.createElement('span');span.textContent=c;span.dataset.inlineIndex=i++;paragraph.appendChild(span);}fragment.appendChild(paragraph);}host.appendChild(fragment);
  }else if(mode==='solid-text')render(()=>createComponent(Cells,{paragraphs:texts}),host);
  else render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);
  const synchronousMs=performance.now()-start;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const throughFramesMs=performance.now()-start;
  if(DEV)DEV.hooks.afterCreateOwner=null;
  Object.assign(stats,{prepareMs,commitMs,serializeMs,projectionMs,synchronousMs,throughFramesMs,offsetMs,solidOwners:owners,solidComputations:pure+effects,pureComputations:pure,effectComputations:effects,domElements:host.querySelectorAll('*').length});
  if(legacy){stats.boundAnnotations=legacy.data.properties.length;stats.cells=legacy.getCells().length;stats.textPreserved=legacy.getCells().map(c=>legacy.getTextContent(c)).join('')===texts.join('');}
  else{const flows=(mode.startsWith('current') || mode.startsWith('reactive'))?[...host.querySelectorAll('.reactive-standoff-flow')]:[host];stats.textPreserved=flows.map(f=>f.textContent).join('')===texts.join('');stats.cells=(mode.startsWith('current') || mode.startsWith('reactive'))?host.querySelectorAll('[data-inline-key],[data-inline-index]').length:host.querySelectorAll('span').length;}
  if(!stats.textPreserved)throw Error('Comparison changed text: '+JSON.stringify(stats));
  return stats;
 })()`);
 results.push({round:round+1,...result});console.log(JSON.stringify(results.at(-1)));
 await send('Target.closeTarget',{targetId});
 }
 await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify({input,notes:['Module imports/network excluded. Same text, font, viewport; fresh tab per case.','Original module runs unchanged with its offset measurement and debug timer.','Original-bind measures core annotation binding with decorate schemas; external tag renderers and surrounding app excluded.','Reactive cases disable directDomCharacterCells; current cases use its default-on path.','Solid-text is a minimal span list, not a complete editor. Current cases include the actual editor view and model.'],results},null,2));
}finally{
 socket?.close();const exited=new Promise(r=>chrome.once('exit',r));chrome.kill();await exited;
 await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
process.exit(0);
