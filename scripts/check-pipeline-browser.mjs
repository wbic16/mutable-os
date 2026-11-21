// Real managed Pipeline carousel and SQLite commits, using only a temporary Cavern.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import express from 'express';
import {SqliteKnowledgeHost} from '../dist/server/sqlite-knowledge-host.js';
const directory=process.env.PIPELINE_OUTPUT??'/tmp/mutable-pipeline-proof';await mkdir(directory,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'dcp-stream-proof-'));const vault=await mkdtemp(path.join(tmpdir(),'pipeline-vault-'));const knowledge=new SqliteKnowledgeHost({root:vault,debounceMs:60000});const app=express();app.use('/api/sqlite/knowledge',knowledge.router());let server,browser,socket;
try{
 server=await createServer({cacheDir:'node_modules/.cache/dcp-stream-proof',server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-stream-proof',configureServer(s){s.middlewares.use(app);s.middlewares.use((req,res,next)=>{
  if(req.url==='/__stream-proof'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body></body></html>');return;}
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:false,Error:'Isolated deterministic fixture'}));return;}next();
 });}}]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[...(process.env.DCP_HEADED==='1'?[]:['--headless=new']),'--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let data='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',chunk=>{data+=chunk;const m=data.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.once('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error(JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.httpServer.address().port+'/__stream-proof'},sessionId);

 const fixture=await evaluate("(async()=>{const m=await import('/src/features/pipelines/identity.browser-fixture.tsx');return m.identityPipelineFixture();})()");
 const waitFor=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+expression+'\n'+await evaluate("document.querySelector('.pipeline-host')?.innerText"));};
 const button=text=>`window.identityFixture.button(${JSON.stringify(text)})`;
 const clickElement=async expression=>{
  await evaluate(`${expression}.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})`);await new Promise(r=>setTimeout(r,100));
  const p=await evaluate(`(()=>{const e=${expression},r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y))};})()`);assert.equal(p.hit,true,'button is physically reachable: '+expression);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1},sessionId);
 };
 const click=async text=>{await waitFor(`${button(text)}&&!${button(text)}.disabled`);await clickElement(button(text));};
 await waitFor("document.querySelectorAll('.pipeline-search-results button').length>0");
 const layout=await evaluate("(()=>{const p=[...document.querySelectorAll('.pipeline-pipe:not([hidden])')];window.retainedSearch=document.querySelector('input[aria-label=\"Search authentic Entities\"]');return {count:p.length,widths:p.map(x=>x.getBoundingClientRect().width),inert:p.map(x=>x.querySelector('.pipeline-body').inert)};})()");
 assert.equal(await evaluate("(()=>{const e=document.querySelector('.pipeline-host'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+30));})()"),true,'Pipeline is visible above its owning window');
 assert.equal(await evaluate("(()=>{const host=document.querySelector('.pipeline-host'),surface=host.closest('.mwm-surface'),frame=document.querySelector('.reactive-window');return Number(getComputedStyle(surface).zIndex)>=Number(getComputedStyle(frame).zIndex);})()"),true,'modal surface paints above the inert owner frame');
 assert.equal(layout.count,3);assert.deepEqual(layout.inert,[false,true,true]);assert.ok(layout.widths[1]>layout.widths[0]);
 await clickElement("document.querySelector('.pipeline-search-results button')");await click('Use Selected Identity');await waitFor("!!window.identityFixture.button('Same Identity')&&!window.identityFixture.button('Same Identity').disabled");
 await evaluate("document.querySelector('.pipeline-pipe-active .pipeline-body').scrollTop=120;window.retainedCompare=document.querySelector('.pipeline-pipe-active .pipeline-body')");

 await send('Page.bringToFront',{},sessionId);
 await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,200))))");
 await writeFile(path.join(directory,'comparison.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await click('Back');assert.equal(await evaluate("document.querySelector('input[aria-label=\"Search authentic Entities\"]')===window.retainedSearch"),true);
 await click('Compare Identities');assert.equal(await evaluate("document.querySelector('.pipeline-pipe-active .pipeline-body')===window.retainedCompare&&window.retainedCompare.scrollTop===120"),true);
 await evaluate("document.querySelector('.pipeline-pipe-active [aria-label=\"Expand Pipe\"]').click()");await click('Same Identity');await waitFor("!!window.identityFixture.button('Confirm Reconciliation')&&!window.identityFixture.button('Confirm Reconciliation').disabled");
 assert.equal(await evaluate("!!document.querySelector('.pipeline-expanded')"),false,'advancing leaves expansion and reveals the next Pipe');

 await send('Page.bringToFront',{},sessionId);
 await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,200))))");
 await writeFile(path.join(directory,'reconciliation.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await click('Confirm Reconciliation');await waitFor("!!window.identityFixture.button('Done')");await click('Done');
 const association=await evaluate("(()=>{const f=window.identityFixture,r=f.port.session().projection.node(f.port.session().rootKey);return {...Object.values(r.payload.linkedAnnotations).find(d=>d.metadata?.scopedEntity?.entity.name==='Leonardo da Vinci').metadata.scopedEntity.identityAssociation};})()");assert.equal(association.entityId,fixture.canonicalId);
 // Bologna regression: no selected text, refine SQL search, review imports, and link the source identity.
 await evaluate("window.getSelection().removeAllRanges();[...document.querySelectorAll('.semantics-list-item')].find(b=>b.querySelector('strong')?.textContent==='Bologna').click()");
 assert.equal(await evaluate("!!window.identityFixture.button('Review authority identity…')"),false);
 await writeFile(path.join(directory,'bologna-details.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await click('Resolve Entity Identity…');
 await waitFor("document.querySelectorAll('.pipeline-pipe:not([hidden])').length===3");
 assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Link Entity Reference\"]')"),false);
 await evaluate("(()=>{const i=document.querySelector('[aria-label=\"Search authentic Entities\"]');i.value='Bolog';i.dispatchEvent(new Event('input',{bubbles:true}));i.value='Bologna';i.dispatchEvent(new Event('input',{bubbles:true}));const m=document.querySelector('[aria-label=\"Match mode\"]');m.value='exact';m.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await waitFor("document.querySelector('.pipeline-search-results button')?.textContent.includes('Bologna')");
 await writeFile(path.join(directory,'bologna-search.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await clickElement("document.querySelector('.pipeline-search-results button')");await click('Use Selected Identity');await click('Same Identity');
 await waitFor("!!window.identityFixture.button('Confirm Reconciliation')&&!window.identityFixture.button('Confirm Reconciliation').disabled");
 await evaluate("(()=>{for(const [field,value] of [['Description','import'],['Classifications','merge'],['External identifiers','merge']]){const s=[...document.querySelectorAll('.pipeline-pipe-active label')].find(l=>l.textContent.startsWith(field)).querySelector('select');s.value=value;s.dispatchEvent(new Event('change',{bubbles:true}));}})()");
 await click('Confirm Reconciliation');await click('Done');
 const bologna=await evaluate("(async()=>{const f=window.identityFixture,r=f.port.session().projection.node(f.port.session().rootKey),d=Object.values(r.payload.linkedAnnotations).find(d=>d.metadata?.scopedEntity?.entity.name==='Bologna'),result=await f.services.execute({recordType:'Entity',op:'get',id:f.bolognaId,operationId:crypto.randomUUID()});return JSON.parse(JSON.stringify({source:d.metadata.scopedEntity.entity,association:d.metadata.scopedEntity.identityAssociation,canonical:result.entity}));})()");
 assert.equal(bologna.association.entityId,bologna.canonical.id);assert.equal(bologna.canonical.description,bologna.source.description);
 await waitFor("document.querySelector('.semantics-identity-status')?.textContent.includes('Linked to database Entity')");
 assert.equal(await evaluate("document.querySelector('.semantics-identity-name')?.textContent"),'Bologna',await evaluate("document.querySelector('.semantics-identity-status')?.textContent"));
 assert.equal(await evaluate("document.querySelector('.semantics-identity-status')?.textContent.includes(window.identityFixture.bolognaId)"),true);
 assert.equal(await evaluate("!!window.identityFixture.button('Open linked Entity')&&!!window.identityFixture.button('Review linked identity…')"),true);
 assert.equal(await evaluate("document.querySelector('.semantics-list-item[aria-pressed=true] .semantics-identity-badge')?.textContent"),'Linked to database');
 await writeFile(path.join(directory,'bologna-linked.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 assert.ok(bologna.canonical.aliases.some(a=>a.name==='Bononia'));assert.deepEqual(bologna.canonical.attributes.enrichment.subtypes,['City']);assert.deepEqual(bologna.canonical.attributes.enrichment.externalIds,[{namespace:'wikidata',value:'Q1891'}]);
 // Reopening the older saved Document has no marker, but the audited database association survives.
 const markerRevision=await evaluate('window.identityFixture.removeBolognaMarker()');
 await waitFor("document.querySelector('.semantics-identity-status')?.textContent.includes('recovered from the database')");
 assert.equal(await evaluate("document.querySelector('.semantics-identity-name')?.textContent"),'Bologna');
 assert.equal(await evaluate('window.identityFixture.editor.repository.state.revision'),markerRevision,'recovery must not modify or save the Document');
 await writeFile(path.join(directory,'bologna-recovered.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 // The alternate route creates a new canonical Entity, retaining its local source.
 await evaluate("[...document.querySelectorAll('.semantics-list-item')].find(b=>b.textContent.includes('Beatrice')).click()");await click('Resolve Entity Identity…');await click('No Matching Identity');await waitFor("!!window.identityFixture.button('Confirm Import')&&!window.identityFixture.button('Confirm Import').disabled");
 assert.equal(await evaluate("document.querySelectorAll('.pipeline-pipe:not([hidden])').length"),2);
 await send('Emulation.setDeviceMetricsOverride',{width:760,height:950,deviceScaleFactor:1,mobile:false},sessionId);
 await evaluate("document.querySelector('.pipeline-pipe-active').scrollIntoView({inline:'end',behavior:'instant'})");

 await send('Page.bringToFront',{},sessionId);
 await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,200))))");
 await writeFile(path.join(directory,'import.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await click('Confirm Import');await waitFor("!!window.identityFixture.button('Done')");await click('Done');
 const imported=await evaluate("(()=>{const f=window.identityFixture,r=f.port.session().projection.node(f.port.session().rootKey),d=Object.values(r.payload.linkedAnnotations).find(d=>d.metadata?.scopedEntity?.entity.name.includes('Beatrice'));return {localId:d.id,entityId:d.metadata.scopedEntity.identityAssociation.entityId};})()");assert.notEqual(imported.entityId,imported.localId);
 await evaluate('window.identityFixture.dispose()');
 console.log(JSON.stringify({matched:true,bolognaLinkedWithMetadata:true,imported,layout,retainedDOM:true,retainedScroll:true,managedHost:true,physicalPointerActions:true,narrowViewport:true,directory},null,2));
}finally{socket?.close();browser?.kill('SIGTERM');await server?.close();await knowledge.close();await rm(vault,{recursive:true,force:true});await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
