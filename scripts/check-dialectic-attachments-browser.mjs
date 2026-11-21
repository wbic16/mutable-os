// Real browser + real local storage/broker; deterministic provider, no paid calls.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import {build} from 'esbuild';
import {createServer} from 'vite';
import {ManagedAssetStore} from '../server/managed-assets.mjs';
import {createDialecticBroker} from '../dist/server/dialectic/broker.js';
import {sse,streamFixture} from '../dist/server/dialectic/fixtures.js';
import {pdfFixture} from '../dist/src/pdf/fixtures.js';
const directory=process.env.DCP_OUTPUT??'artifacts/dialectic-attachments';await mkdir(directory,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'dialectic-files-')),vault=path.join(profile,'vault');await mkdir(vault);
await build({stdin:{contents:"export {NodePreparationExecutor} from './server/application-services/executor.ts';",resolveDir:process.cwd()},outfile:path.join(profile,'executor.mjs'),bundle:true,platform:'node',format:'esm',target:'node22'});
const {NodePreparationExecutor}=await import(pathToFileURL(path.join(profile,'executor.mjs')).href),executor=new NodePreparationExecutor(undefined,path.resolve('dist/server/application-services/preparation-worker.mjs'));
const cavernId=crypto.randomUUID(),session=crypto.randomUUID(),store=new ManagedAssetStore({root:vault,cavernId,session});
const generatedPng=await sharp({create:{width:512,height:384,channels:3,background:'#42786b'}}).png().toBuffer();
let server,browser,socket,broker,saved;const wires=[];let turn=0,saves=0,uploads=0,imageRequests=0;
try{
 broker=createDialecticBroker({environment:{OPENAI_API_KEY:'isolated-fixture-key'},continuity:false,attachmentsEnabled:true,artifactsEnabled:true,imageGenerationEnabled:true,attachmentContext:token=>{assert.equal(token,session);return {store,executor,cavernId,session,check(){}};},fetcher:async(_url,init)=>{
  if(String(_url)==='https://api.openai.com/v1/images/generations'){imageRequests++;await new Promise(resolve=>setTimeout(resolve,1000));return new Response(JSON.stringify({data:[{b64_json:generatedPng.toString('base64')}]}));}
  wires.push(JSON.parse(init.body));turn++;
  const tool=turn===1?{id:'pdf',name:'create_attachment',arguments:{filename:'Report.pdf',format:'pdf',content:'Attachment report\nThe supplied file contains source evidence.'}}:turn===2?{id:'csv',name:'create_attachment',arguments:{filename:'Result.csv',format:'csv',content:'result\n42\n'}}:turn===3?{id:'image',name:'generate_image',arguments:{filename:'Garden.png',prompt:'A sunlit garden',size:'1024x1024',quality:'medium'}}:undefined;
  return sse(streamFixture('openai',tool?'':'<response><p>The attached evidence has been read. Your Report.pdf, Result.csv and Garden.png are ready to download.</p></response>',tool));
 }});
 server=await createServer({cacheDir:'node_modules/.cache/dialectic-attachments',server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-attachments',configureServer(s){
  const app=express();app.use((req,_res,next)=>{if(req.path==='/attachments/upload')uploads++;next();});app.use(broker.router);s.middlewares.use('/api/dialectic',app);
  s.middlewares.use(async(req,res,next)=>{
   if(req.url?.startsWith('/__attachment-proof')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/src/features/dialectic/attachments.browser.tsx"></script></body></html>');return;}
   if(req.url==='/__configuration'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cavernId,session}));return;}
   if(req.url==='/__saved'){res.end(saved.generation.native);return;}
   if(req.url==='/api/native/save'){let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);saves++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:saved.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:saved.generation.generation}}}));return;}
   if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:false,Error:'Isolated fixture'}));return;}next();
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
 const textFile=path.join(profile,'Source.txt'),pdfFile=path.join(profile,'Paper.pdf');await writeFile(textFile,'source evidence');const paper=pdfFixture(2),footer=new TextDecoder().decode(paper).match(/startxref\n\d+\n%%EOF\n$/)[0],large=Buffer.alloc(12000000,32);large.set(paper);large.set(Buffer.from(footer),large.length-Buffer.byteLength(footer));await writeFile(pdfFile,large);
 await evaluate('proof.seedHistory();true');await wait('proof.editor.mounts.get(proof.protectedText().key)');
 assert.equal(await evaluate('proof.editor.canEditText(proof.protectedText().key)'),false);
 const point=await evaluate(`(()=>{const e=proof.editor.mounts.get(proof.protectedText().key).focusElement;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+40,y:r.y+r.height/2}})()`);
 for(const type of ['dragEnter','dragOver','drop'])await send('Input.dispatchDragEvent',{type,...point,data:{items:[],files:[textFile,pdfFile],dragOperationsMask:1}},sessionId);
 assert.equal(await evaluate(`!!document.querySelector('.dialectic-file-drop')`),false,'Dropping over protected history must clear the overlay');
 await wait(`document.querySelector('[aria-label="Confirm large upload"]')`);assert.equal(uploads,0);assert.equal(await evaluate('proof.attachments().length'),0);
 assert((await evaluate(`document.querySelector('[aria-label="Confirm large upload"]').textContent`)).includes('Paper.pdf'));
 await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel upload').click();true`);await wait(`!document.querySelector('[aria-label="Confirm large upload"]')`);assert.equal(uploads,0);
 for(const type of ['dragEnter','dragOver','drop'])await send('Input.dispatchDragEvent',{type,...point,data:{items:[],files:[textFile,pdfFile],dragOperationsMask:1}},sessionId);
 await wait(`document.querySelector('[aria-label="Confirm large upload"]')`);assert.equal(uploads,0);
 await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Proceed with large upload').click();true`);
 await wait('proof.attachments().length===2');assert.equal(uploads,2);assert((await evaluate(`document.querySelector('[aria-label="Draft attachment status"]').textContent`)).includes('2 attachments ready'));
 const pickerFile=path.join(profile,'Picker.txt');await writeFile(pickerFile,'picker evidence');
 const {root:dom}=await send('DOM.getDocument',{},sessionId),{nodeId}=await send('DOM.querySelector',{nodeId:dom.nodeId,selector:'[aria-label="Choose attachments"]'},sessionId);
 await send('DOM.setFileInputFiles',{nodeId,files:[pickerFile]},sessionId);await wait('proof.attachments().length===3');console.log('Drop confirmation and file picker passed');assert.equal(saves,0);
 await evaluate(`proof.type();document.querySelector('[aria-label="Submit contribution"]').click();true`);
 await wait(`document.querySelector('.dialectic-response-progress')?.textContent.includes('Generating image')`);
 await wait(`proof.attachments().length===6 && !document.querySelector('[aria-label="Cancel response"]')`);
 console.log('Agent files received');assert(wires[0].input[0].content.some(p=>p.type==='input_file'));assert(JSON.stringify(wires[0]).includes('source evidence'));assert.equal(turn,4);assert.equal(imageRequests,1);assert.equal(saves,0);
 await evaluate(`(()=>{[...document.querySelectorAll('.dialectic-attachment')].find(c=>c.querySelector('strong').textContent==='Garden.png').scrollIntoView({block:'center'});return true;})()`);
 await wait(`document.querySelector('img[alt="Garden.png"]')?.naturalWidth===512`);
 assert.deepEqual(await evaluate('proof.boundedTyping()'),{snapshots:0,scans:0,requests:0});assert.equal(await evaluate('proof.roundTrip()'),true);
 await evaluate(`(()=>{const card=[...document.querySelectorAll('.dialectic-attachment')].find(c=>c.querySelector('strong').textContent==='Report.pdf');[...card.querySelectorAll('button')].find(b=>b.textContent==='Preview').click();})()`);
 await wait(`document.querySelector('.dialectic-attachment-preview .textLayer')?.textContent.includes('Attachment report')`);await evaluate(`document.querySelector('.dialectic-attachment-preview').scrollIntoView({block:'center'});true`);console.log('PDF preview rendered');
 await writeFile(path.join(directory,'pdf-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await evaluate('proof.save()');assert.equal(saves,1);
 await send('Page.navigate',{url:origin+'/__attachment-proof?reload=1'},sessionId);await wait('window.proof?.ready && proof.restored && proof.attachments().length===6');
 const downloadDirectory=path.join(profile,'downloads');await mkdir(downloadDirectory);await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDirectory});
 await evaluate(`(()=>{const card=[...document.querySelectorAll('.dialectic-attachment')].find(c=>c.querySelector('strong').textContent==='Result.csv');[...card.querySelectorAll('button')].find(b=>b.textContent==='Download').click();})()`);
 const {readFile}=await import('node:fs/promises');let downloaded;for(let i=0;i<200;i++){try{downloaded=await readFile(path.join(downloadDirectory,'Result.csv'),'utf8');break;}catch{await new Promise(r=>setTimeout(r,50));}}assert.equal(downloaded,'result\n42\n');
 await evaluate(`(()=>{const card=[...document.querySelectorAll('.dialectic-attachment')].find(c=>c.querySelector('strong').textContent==='Garden.png');[...card.querySelectorAll('button')].find(b=>b.textContent==='Download').click();})()`);
 let downloadedImage;for(let i=0;i<200;i++){try{downloadedImage=await readFile(path.join(downloadDirectory,'Garden.png'));break;}catch{await new Promise(r=>setTimeout(r,50));}}assert.deepEqual(downloadedImage,generatedPng);assert.equal(imageRequests,1);
 await writeFile(path.join(directory,'reopened.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 const result={passed:true,realChromeDrop:true,dropOverProtectedHistory:true,largeUploadConfirmation:true,cancelBeforeUpload:true,pickerUpload:true,nativePdfInput:true,textInput:true,agentPdfAndCsv:true,pdfPreview:true,manualSaveCount:saves,reopenedAttachments:6,imageGeneration:true,automaticImagePreview:true,exactImageDownload:true,downloadedBytes:downloaded,boundedTyping:{snapshots:0,scans:0,requests:0},provider:'deterministic OpenAI wire fixture; no paid requests'};
 await writeFile(path.join(directory,'qualification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{socket?.close();browser?.kill('SIGTERM');broker?.dispose();await executor.close();await store.close();server?.httpServer?.closeAllConnections();let timer;await Promise.race([server?.close(),new Promise(resolve=>timer=setTimeout(resolve,5000))]);clearTimeout(timer);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
process.exit(0);
