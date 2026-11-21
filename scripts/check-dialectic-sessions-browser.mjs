// Real Chrome qualification of Dialectic's shared retained Document tabs. No provider calls.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const directory=process.env.DCP_OUTPUT??'artifacts/dialectic-sessions';await mkdir(directory,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'dialectic-sessions-'));
let server,browser,socket,saved,saves=0;
try{
 server=await createServer({cacheDir:'node_modules/.cache/dialectic-sessions',server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-sessions',configureServer(s){
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
 await send('Page.navigate',{url:origin+'/__attachment-proof'},sessionId);await wait(`window.proof?.ready && document.querySelector('[aria-label="Choose attachments"]')`);console.log('Attachment fixture ready');

 await evaluate(`(()=>{proof.firstId=proof.root().payload.id;proof.firstSession=proof.port.session();proof.port.application.renameDocument(proof.firstId,'First session');proof.editor.commands.replaceInlineRange(proof.text().key,0,0,'First session unsaved draft');return true;})()`);
 await evaluate(`document.querySelector('.dialectic-canvas .dialectic-add-conversation').click();true`);
 await wait('proof.root().payload.id!==proof.firstId');
 await evaluate(`(()=>{proof.secondId=proof.root().payload.id;proof.port.application.renameDocument(proof.secondId,'Second session');proof.editor.commands.replaceInlineRange(proof.text().key,0,0,'Second session saved draft');return true;})()`);
 await evaluate(`proof.port.application.files.save({folder:'isolated',filename:'Second.ink'})`);assert.equal(saves,1);
 await evaluate(`(async()=>{const {nativeDocumentSession}=await import('/src/persistence/native-session.ts');const native=nativeDocumentSession(proof.editor);native.browseVault=native.discoverVault=async()=>({vault:'isolated',folders:['isolated'],documents:[{resourceId:proof.secondId,title:'Second session',location:{folder:'isolated',filename:'Second.ink'},state:'paired'}],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true});await proof.port.application.vault.refresh();})()`);
 await evaluate('proof.port.application.closeActiveTab();true');await wait('proof.root().payload.id===proof.firstId');
 await evaluate(`proof.port.application.files.open({folder:'isolated',filename:'Second.ink'})`);await wait('proof.root().payload.id===proof.secondId');
 const panels=()=>evaluate(`Array.from(document.querySelectorAll('.dialectic-canvas>.reactive-tabs>.reactive-tabs__panel')).map(p=>({hidden:p.hidden,inert:p.inert,display:getComputedStyle(p).display,height:p.getBoundingClientRect().height,text:p.innerText.slice(0,160)}))`);
 const opened=await panels();await writeFile(path.join(directory,'opened.json'),JSON.stringify(opened,null,2));await writeFile(path.join(directory,'opened.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 assert.equal(opened.length,2);assert.equal(opened.filter(p=>p.display!=='none').length,1,'Only the newly opened Document should be visible');
 assert(opened.filter(p=>p.hidden).every(p=>p.inert&&p.display==='none'&&p.height===0),'Inactive retained Documents must occupy no layout space');
 assert.equal(await evaluate('proof.firstSession===proof.editor.documentSessions.sessions().find(s=>s.id===proof.firstSession.id)'),true);
 await evaluate('proof.port.application.openDocument(proof.firstId);true');await wait('proof.root().payload.id===proof.firstId');
 assert.equal(await evaluate('proof.port.session()===proof.firstSession'),true);assert((await evaluate('proof.editor.mounts.get(proof.text().key).captureText()')).includes('First session unsaved draft'));
 assert.equal((await panels()).filter(p=>p.display!=='none').length,1);
 const bounded=await evaluate(`(async()=>{const old=proof.editor.repository.snapshot.bind(proof.editor.repository),revision=proof.editor.repository.state.revision;let snapshots=0;proof.editor.repository.snapshot=(...args)=>{snapshots++;return old(...args)};try{for(let i=0;i<10;i++){proof.port.application.openDocument(proof.secondId);proof.port.application.openDocument(proof.firstId);}await new Promise(requestAnimationFrame);return {snapshots,revisionUnchanged:revision===proof.editor.repository.state.revision};}finally{proof.editor.repository.snapshot=old;}})()`);
 assert.deepEqual(bounded,{snapshots:0,revisionUnchanged:true});assert.equal(saves,1);
 assert.deepEqual(await evaluate('proof.boundedTyping()'),{snapshots:0,scans:0,requests:0});
 const result={passed:true,nativeFileOpen:true,onlyActivePanelVisible:true,priorUnsavedDraftPreserved:true,retainedSessionReused:true,manualSaves:saves,switching:bounded,typing:{snapshots:0,scans:0,requests:0}};
 await writeFile(path.join(directory,'qualification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{socket?.close();browser?.kill('SIGTERM');server?.httpServer?.closeAllConnections();let timer;await Promise.race([server?.close(),new Promise(resolve=>timer=setTimeout(resolve,5000))]);clearTimeout(timer);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
process.exit(0);
