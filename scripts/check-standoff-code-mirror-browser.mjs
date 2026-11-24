// Real Mutable/Flint route, isolated browser profile and temporary native store.
// No user document/vault writes. Run: node scripts/check-standoff-code-mirror-browser.mjs
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, rm, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'vite';
const profile=await mkdtemp(path.join(tmpdir(),'input-ownership-browser-'));
const store=await mkdtemp(path.join(tmpdir(),'input-ownership-vault-'));
// A live URL selects language-only checks: never run native-store/save tests against it.
const liveURL=process.env.CODE_LIVE_URL;
const output=process.env.CODE_OUTPUT??'/tmp/standoff-code-mirror-browser';
await mkdir(output,{recursive:true});await mkdir(path.join(store,'vault'));
const api=express(),errors=[],checks=[];
let vite,browser,socket;
try {
 if(!liveURL){
 // Each server owns its optimizer output. Sharing the live dev cache can
 // delete chunks still referenced by open editor tabs (504 Outdated Optimize Dep).
 vite=await createServer({cacheDir:path.join(profile,'vite-cache'),server:{host:'127.0.0.1',port:0,hmr:false},plugins:[{name:'ownership-native-store',configureServer(server){server.middlewares.use(api);}}]});
 const {createNativeDocumentStoreRouter}=await vite.ssrLoadModule('/server/native-document-store.mjs');
 api.use('/api/native',createNativeDocumentStoreRouter({root:store,defaultVault:'vault',nativeDiscoveryWorker:false}));
 await vite.listen();
 }
 browser=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--window-size=1500,1050','--disable-background-timer-throttling','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let out='';browser.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});browser.once('error',reject);setTimeout(()=>reject(Error('Chrome startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},60000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{if(process.env.OWNERSHIP_TRACE)console.log('EVAL '+expression.slice(0,160));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<600;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)}+' body='+document.body.innerText.slice(0,1200));})()`);
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 const key=async(key,code,modifiers=0,text)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,...(text?{text}:{} )},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers},sessionId);};
 const click=async(expression,button='left')=>{const pos=await evaluate(`(()=>{const e=${expression};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.left+Math.min(r.width/2,30),y:r.top+Math.min(r.height/2,12)}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...pos,button,clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...pos,button,clickCount:1},sessionId);};
 await send('Runtime.enable',{},sessionId);await send('Page.bringToFront',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1050,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:liveURL??`http://127.0.0.1:${vite.httpServer.address().port}/standoff-code-mirror`},sessionId);
 await wait('window.__standoffCodeMirror?.codes().length===2');
 await evaluate("window.p=window.__standoffCodeMirror;window.a=p.codes().find(c=>c.record().payload.id==='cm-code');window.b=p.codes().find(c=>c.record().payload.id==='cm-json');void 0");
 await wait("p.syntax().some(s=>s.key===a.nodeKey && s.language==='javascript' && s.tree.includes('VariableDeclaration')) && p.syntax().some(s=>s.key===b.nodeKey && s.language==='json' && s.tree.includes('Object'))");
 check('JavaScript and JSON parsers actually load',true);
 check('language loading shows no handled import failures',await evaluate("!document.querySelector('.flint-application').textContent.includes('Failed to fetch dynamically imported module')"));
 if(liveURL){
   // This browser owns a disposable in-memory fixture. No Save or Vault actions.
   const specs=[['javascript','const answer = 42;','VariableDeclaration'],['typescript','const answer: number = 42;','TypeAnnotation'],['json','{"answer":42}','Object'],['markdown','# Heading','ATXHeading1'],['xml','<answer>42</answer>','Element'],['sql','SELECT answer FROM example;','Statement']];
   for(const [name,source,node] of specs){
     await evaluate(`a.view.dispatch({changes:{from:0,to:a.view.state.doc.length,insert:${JSON.stringify(source)}}});a.changeLanguage(${JSON.stringify(name)});void 0`);
     await wait(`p.syntax().some(s=>s.key===a.nodeKey && s.language===${JSON.stringify(name)} && s.tree.includes(${JSON.stringify(node)}))`);
     check(name+' parses source on the live route',true);
   }
   await evaluate("a.changeLanguage('plain');void 0");
   check('plain text removes the parser',await evaluate('!p.syntax().find(s=>s.key===a.nodeKey).language'));
   await evaluate("a.changeLanguage('javascript');void 0");await wait("p.syntax().some(s=>s.key===a.nodeKey && s.language==='javascript')");
   check('no handled dynamic import failure on live route',await evaluate("!document.querySelector('.flint-application').textContent.includes('Failed to fetch dynamically imported module')"));
   check('no uncaught browser exceptions',errors.length===0);
   await writeFile(path.join(output,'live-languages.json'),JSON.stringify({url:liveURL,browser:await send('Browser.getVersion'),checks,errors},null,2));
   console.log('Artifacts: '+output);
 }else{
 check('ordinary production block mounted in real Flint mixed document',await evaluate("a.view.dom.closest('.flint-application')!==null && !!document.querySelector('.reactive-standoff-flow')"));
 await click('a.view.contentDOM');check('native ownership',await evaluate('p.owner()===a.nodeKey'));
 await evaluate("p.base=a.record().payload.text;a.view.dispatch({selection:{anchor:0}});p.revision=p.editor.repository.state.revision");
 await send('Input.insertText',{text:'// 😀\n'},sessionId);
 check('atomic Unicode typing and overlap rebasing',await evaluate("a.record().payload.text==='// 😀\\n'+p.base && a.record().payload.standoffProperties[0].start===11 && p.editor.repository.state.revision===p.revision+1"));
 await key('z','KeyZ',4);await wait('a.record().payload.text===p.base');check('canonical keyboard undo restores native caret',await evaluate('a.view.state.selection.main.head===0'));
 await key('z','KeyZ',12);await wait("a.record().payload.text.startsWith('// 😀')");check('canonical keyboard redo',true);
 await evaluate("a.view.dispatch({selection:{anchor:0}})");await key('Tab','Tab');check('native indentation',await evaluate('/^\\s/.test(a.record().payload.text)'));
 await evaluate("a.view.dispatch({selection:{anchor:a.view.state.doc.length}})");await key('(','Digit9',8,'(');check('native paired brackets',await evaluate("a.view.state.doc.toString().endsWith('()')"));
 await send('Input.insertText',{text:'one\ntwo'},sessionId);check('multiline insertion preserves canonical source',await evaluate('a.record().payload.text===a.view.state.doc.toString()'));
 await evaluate("a.view.dispatch({selection:{anchor:13,head:18}});p.count=a.record().payload.standoffProperties.length;p.editor.bindings.assign('code.annotate',[{kind:'keyboard',key:'F8',modifiers:[]}]);void 0");await key('F8','F8');await wait("a.view.dom.querySelector('[aria-label=\"Code annotations\"]')");
 check('configured annotation binding opens native panel once',await evaluate("a.view.dom.querySelectorAll('[aria-label=\"Code annotations\"]').length===1 && !p.owner()"));
 await evaluate(`a.view.dom.querySelector('[aria-label="Annotation type"]').value='note';a.view.dom.querySelector('[aria-label="Value (JSON)"]').value=JSON.stringify('Browser annotation');a.view.dom.querySelector('[aria-label="Metadata (JSON)"]').value='{"browser":true}';[...a.view.dom.querySelectorAll('button')].find(b=>b.textContent==='Apply').click();void 0`);
 check('native annotation authoring preserves ID and metadata',await evaluate("a.record().payload.standoffProperties.length===p.count+1 && a.record().payload.standoffProperties.at(-1).metadata.browser"));
 await evaluate("p.editor.commandRegistry.execute('code.inspect',{targetKey:a.nodeKey,args:undefined});void 0");await wait("a.view.dom.querySelector('[aria-label=\"Code annotations\"]')");
 check('overlap chooser uses independent property identities',await evaluate("[...a.view.dom.querySelectorAll('button')].filter(b=>b.textContent.includes('annotation-')).length>=2"));
 await evaluate("[...a.view.dom.querySelectorAll('button')].find(b=>b.textContent==='Delete annotation').click();void 0");
 check('explicit annotation delete keeps tombstone',await evaluate('a.record().payload.standoffProperties.some(p=>p.isDeleted)'));
 await key('z','KeyZ',4);await wait('!a.record().payload.standoffProperties.some(p=>p.isDeleted)');check('annotation-only undo restores identity',true);
 await evaluate("p.noHistory=p.editor.repository.state.revision;p.projections=a.metrics.projections;a.toggleAnnotations();a.view.dispatch({selection:{anchor:2}});void 0");
 check('selection and visibility do not commit or rebuild annotations',await evaluate('p.noHistory===p.editor.repository.state.revision && p.projections===a.metrics.projections'));
 await click('a.view.contentDOM','right');await wait("a.view.dom.querySelector('[aria-label=\"Code annotations\"]')");
 check('native context menu routed to annotation adapter',true);
 await evaluate("[...a.view.dom.querySelectorAll('button')].find(b=>b.textContent==='Close').click();a.view.dispatch({selection:{anchor:13,head:18}});p.stopEntities=p.mockEntities();p.editor.bindings.assign('entity.open',[{kind:'keyboard',key:'F9',modifiers:[]}]);void 0");
 await key('F9','F9');await wait("a.view.dom.querySelector('[aria-label=\"Find Entity\"]')");
 await evaluate("[...a.view.dom.querySelectorAll('button')].find(b=>b.textContent==='Search Entities').click();void 0");await wait("[...a.view.dom.querySelectorAll('button')].some(b=>b.textContent==='Ada Lovelace')");
 await evaluate("[...a.view.dom.querySelectorAll('button')].find(b=>b.textContent==='Ada Lovelace').click();[...a.view.dom.querySelectorAll('button')].find(b=>b.textContent==='Inspect Entity').click();void 0");await wait("a.view.dom.textContent.includes('Browser fixture')");
 await evaluate("[...a.view.dom.querySelectorAll('button')].find(b=>b.textContent==='Apply').click();p.inventorySource=p.inventory();void 0");
 check('entity service adapter links and inventory sees native mention (fixture service)',await evaluate("p.inventorySource.read().rows.some(r=>r.id==='ada')"));
 await evaluate("a.view.dispatch({selection:{anchor:13,head:18}});p.editor.bindings.assign('gloss.create',[{kind:'keyboard',key:'F10',modifiers:[]}]);void 0");await key('F10','F10');await wait("a.view.dom.querySelector('[aria-label=\"Value (JSON)\"]')");
 await evaluate(`a.view.dom.querySelector('[aria-label="Value (JSON)"]').value=JSON.stringify('note: native source');[...a.view.dom.querySelectorAll('button')].find(b=>b.textContent==='Apply').click();void 0`);await wait("a.record().payload.standoffProperties.some(p=>p.type==='mutable/gloss')");
 check('Gloss creates shared Document definition',await evaluate("a.resolve(a.record().payload.standoffProperties.find(p=>p.type==='mutable/gloss')).value==='note: native source'"));
 await evaluate("a.view.dispatch({selection:{anchor:a.view.state.doc.length}})");await send('Input.insertText',{text:'\n/date'},sessionId);await wait("document.querySelector('.cm-tooltip-autocomplete')");await evaluate('new Promise(r=>setTimeout(r,180))');await key('Enter','Enter');
 check('shared Scry date provider via native blank-line slash completion',await evaluate('/\\d{4}-\\d{2}-\\d{2}$/.test(a.view.state.doc.toString())'));
 await send('Input.insertText',{text:'\nconst quotient = a / b; // comment'},sessionId);await evaluate('new Promise(r=>setTimeout(r,200))');
 check('source slash operators remain ordinary source',await evaluate("a.view.state.doc.toString().endsWith('a / b; // comment') && !document.querySelector('.cm-tooltip-autocomplete')"));
 await key('f','KeyF',4);await wait("a.view.dom.querySelector('.cm-search input')");check('native search panel',true);await key('Escape','Escape');
 await evaluate("p.compositionText=a.record().payload.text;p.compositionRevision=p.editor.repository.state.revision;a.view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));a.view.dispatch({changes:{from:a.view.state.doc.length,insert:'仮'}});void 0");
 check('synthetic composition leaves canonical state untouched',await evaluate('a.record().payload.text===p.compositionText'));
 await evaluate("a.view.contentDOM.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'仮'}));void 0");await wait('a.record().payload.text===a.view.state.doc.toString()');check('synthetic composition commits one coherent revision',await evaluate('p.editor.repository.state.revision===p.compositionRevision+1'));
 await evaluate('p.protected=a.record().payload.text;p.release=p.editor.textProtection.protect(a.record().key);void 0');await send('Input.insertText',{text:'forbidden'},sessionId);
 check('live native read-only',await evaluate('a.view.state.readOnly && a.record().payload.text===p.protected'));await evaluate('p.release()');
 await evaluate("p.editor.focus.request(a.nodeKey,{caret:'start'})");await key('ArrowLeft','ArrowLeft');check('native boundary enters Flint paragraph',await evaluate("document.activeElement.classList.contains('reactive-standoff-flow')"));await key('ArrowRight','ArrowRight');check('Flint boundary returns to native CodeMirror',await evaluate('p.owner()===a.nodeKey'));
 await evaluate("p.multiRevision=p.editor.repository.state.revision;p.multiText=a.record().payload.text;const Selection=a.view.state.selection.constructor;a.view.dispatch({selection:Selection.create([Selection.cursor(0),Selection.cursor(a.view.state.doc.length)])});a.view.dispatch(a.view.state.replaceSelection('X'));void 0");
 check('native multiple cursors commit one coherent edit',await evaluate("a.record().payload.text==='X'+p.multiText+'X' && p.editor.repository.state.revision===p.multiRevision+1"));
 await evaluate('p.editor.repository.undo();void 0');await wait('a.record().payload.text===p.multiText');
 await evaluate("p.nativeDOM=a.view.dom;a.changeLanguage('typescript');new Promise(r=>setTimeout(r,200))");
 await wait("p.syntax().some(s=>s.key===a.nodeKey && s.language==='typescript' && s.tree.includes('VariableDeclaration'))");
 check('language reconfiguration retains the mounted native editor',await evaluate("a.view.dom===p.nativeDOM && a.record().payload.metadata.language==='typescript'"));
 await evaluate("p.copy=p.editor.commands.copy(a.nodeKey,{kind:'after',anchorKey:a.nodeKey});void 0");await wait('p.codes().length===3');check('ordinary block duplication mounts native copy',await evaluate("p.codes().some(c=>c.record().key!==a.record().key && c.record().payload.text===a.record().payload.text)"));
 await evaluate("p.editor.commands.remove(p.copy);void 0");await wait('p.codes().length===2');check('block deletion disposes native editor',true);
 await evaluate("p.ref=p.editor.commands.transclude(a.nodeKey,{kind:'after',anchorKey:a.nodeKey});void 0");await wait('p.codes().length===3');await evaluate("window.t=p.codes().find(c=>c!==a&&c.record().key===a.record().key);a.view.dispatch({changes:{from:0,insert:'// shared\\n'}});void 0");await wait('t.view.state.doc.toString()===a.view.state.doc.toString()');check('transcluded mounted occurrences synchronize canonical edits',true);
 await evaluate('p.editor.commands.remove(p.ref);void 0');await wait('p.codes().length===2');
 await evaluate('p.application().vault.open("vault")');await evaluate('p.application().files.save({folder:"vault",filename:"Code.mutable.json"})');
 const saved=JSON.parse(await readFile(path.join(store,'vault/Code.mutable.json'),'utf8'));check('manual Save uses existing native JSON envelope',JSON.stringify(saved).includes('standoff-code-mirror-block')&&JSON.stringify(saved).includes('cm-overlap'));
 await evaluate(`p.saves=0;const save=p.application().files.save.bind(p.application().files);p.application().files.save=async(...args)=>{try{return await save(...args)}finally{p.saves++}};a.view.focus();void 0`);await key('s','KeyS',4);await wait('p.saves===1');check('Command-S routes through active Document save',true);
 // Modest source measurement: native transaction -> canonical history -> decorations.
 const metrics=await evaluate(`(()=>{const baseline=structuredClone(a.metrics),samples=[];for(let i=0;i<40;i++){const start=performance.now();a.view.dispatch({changes:{from:a.view.state.doc.length,insert:'x'}});samples.push(performance.now()-start);}const delta={};for(const [k,v]of Object.entries(a.metrics))delta[k]=typeof v==='number'?v-baseline[k]:Object.fromEntries(Object.entries(v).map(([name,ms])=>[name,ms-(baseline[k][name]??0)]));return {samples,metrics:delta,textLength:a.view.state.doc.length,annotations:a.record().payload.standoffProperties.length};})()`);
 await writeFile(path.join(output,'performance.json'),JSON.stringify(metrics,null,2));
 // A separate modest source sample includes 10,000 characters and 100 ranges.
 await evaluate("b.changeLanguage('javascript');new Promise(r=>setTimeout(r,300))");
 const medium=await evaluate(`(()=>{const text='const variable = 123;\\n'.repeat(477).slice(0,10000);b.view.dispatch({changes:{from:0,to:b.view.state.doc.length,insert:text}});const target=b.target(),props=Array.from({length:100},(_,i)=>({id:'bench-'+i,type:'note',start:i*90,end:i*90+50}));b.commit(target.content,{...target.content,revision:target.content.revision+1,payload:{...target.content.payload,standoffProperties:props}},props.map(()=>null),'Benchmark fixture');b.sync();const baseline=structuredClone(b.metrics),samples=[];for(let i=0;i<40;i++){const start=performance.now();b.view.dispatch({changes:{from:b.view.state.doc.length,insert:'x'}});samples.push(performance.now()-start);}const delta={};for(const [k,v]of Object.entries(b.metrics))delta[k]=typeof v==='number'?v-baseline[k]:Object.fromEntries(Object.entries(v).map(([name,ms])=>[name,ms-(baseline[k][name]??0)]));return {samples,metrics:delta,textLength:b.view.state.doc.length,annotations:props.length};})()`);
 await writeFile(path.join(output,'performance-medium.json'),JSON.stringify(medium,null,2));
 const expected=await evaluate('({payload:a.record().payload,gloss:a.resolve(a.record().payload.standoffProperties.find(p=>p.type==="mutable/gloss"))})');
 await evaluate('p.application().files.save()');
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/standoff-code-mirror?empty=1`},sessionId);await wait('window.__standoffCodeMirror?.application()?.files');
 await evaluate('window.p=window.__standoffCodeMirror;p.application().files.open({folder:"vault",filename:"Code.mutable.json"})');
 await wait(`p.codes().some(c=>c.record().payload.text===${JSON.stringify(expected.payload.text)})`);
 await evaluate(`window.a=p.codes().find(c=>c.record().payload.text===${JSON.stringify(expected.payload.text)});void 0`);
 assert.deepEqual(await evaluate('a.record().payload'),expected.payload);check('actual page reload and native file open preserve complete payload',true);
 check('shared Gloss definition resolves after native reload',await evaluate(`a.resolve(a.record().payload.standoffProperties.find(p=>p.type==='mutable/gloss')).value===${JSON.stringify(expected.gloss.value)}`));
 const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(output,'mounted.png'),Buffer.from(screenshot.data,'base64'));
 check('no uncaught browser exceptions',errors.length===0);
 await writeFile(path.join(output,'results.json'),JSON.stringify({browser:await send('Browser.getVersion'),checks,errors,limits:['Real OS IME not automated','WebKit not installed','Entity browser UI uses explicit fixture service; no user Vault modified']},null,2));
 console.log('Artifacts: '+output);
 }
} catch(error){console.error(error);console.error(JSON.stringify(errors));process.exitCode=1;}
finally{socket?.close();browser?.kill();await vite?.close();await rm(profile,{recursive:true,force:true,maxRetries:5});await rm(store,{recursive:true,force:true,maxRetries:5});}
