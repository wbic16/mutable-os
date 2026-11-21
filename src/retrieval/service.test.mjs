import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openSqliteFoundation} from '../knowledge-sqlite/client.mjs';import {openRetrievalService} from './client.mjs';import {hash} from './passages.mjs';
const module=new URL('./test-provider.mjs',import.meta.url).href;
const profile={provider:'test',model:'deterministic-test',dimensions:32};
async function fixture(t,providerOptions={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mutable-retrieval-b-'));const writer=await openSqliteFoundation({vault:root,initialize:true});const vaultGuid=(await writer.inspect()).mutable.vaultGuid;let service;
 const open=async(opts={})=>{service=await openRetrievalService({vault:root,vaultGuid,profile,providerModule:module,providerOptions,...opts});return service;};
 const save=async(text='A ship changes through repairs. Its history matters.',extra={})=>{
  const dto={id:'resource',type:'document-block',metadata:{title:extra.title??'Identity'},children:[{id:'paragraph',type:'standoff-editor-block',text,...(extra.properties?{standoffProperties:extra.properties}:{})}]};
  const bytes=Buffer.from(JSON.stringify(dto));const payload={bytes,vaultGuid,evidence:{path:'doc.json',contentHash:hash(bytes)}};const staged=await writer.stageSaved(payload);await writer.commitSaved(staged.token);return {hash:hash(bytes),bytes};
 };
 t.after(async()=>{await service?.close();await writer.close();fs.rmSync(root,{recursive:true,force:true});});return {root,writer,vaultGuid,open,save,get service(){return service;}};
}
test('incremental saved indexing, metadata reuse, exact source references, edits, deletion and restoration',async t=>{
 const f=await fixture(t);const first=await f.save(),s=await f.open();const a=await s.index('resource',{contentHash:first.hash});assert.equal(a.embedded,1);
 const same=await s.index('resource');assert.equal(same.unchanged,true);assert.equal(same.projectionReads,0);
 await f.save(undefined,{title:'Renamed'});const renamed=await s.index('resource');assert.equal(renamed.embedded,0);assert.equal(renamed.reused,1);
 const r=await s.query('What makes a ship the same?',{liveState:()=> 'dirty'});assert.equal(r.results.length,1);assert.equal(r.results[0].source.liveCurrency,'unsaved-changes');assert.equal(r.answerability,'not-assessed');assert.equal(r.results[0].source.spans[0].blockGuid,'paragraph');
 const reference={vaultGuid:f.vaultGuid,resourceId:'resource',stamp:r.results[0].stamp};await s.verify(reference);
 await f.save('Repair preserves a ship; burning it destroys the organised whole.');await assert.rejects(s.verify(reference),/Stale/);const b=await s.index('resource');assert.equal(b.embedded,1);
 await f.writer.removeConfirmed('resource',await f.writer.deletionBaseline('resource'));await s.reconcile();assert.equal((await s.status()).passages,0);
 await f.save();const restored=await s.index('resource');assert.equal(restored.embedded,0);await s.close();await f.open();assert.equal((await f.service.query('ship')).results.length,1);
});
test('hosted consent is exact, durable, separate for queries, and never inferred from Document approval',async t=>{
 const f=await fixture(t,{external:true});const saved=await f.save(),s=await f.open();await assert.rejects(s.index('resource'),/consent required/);
 const consent={approved:true,indexId:(await s.status()).indexId,id:'consent-1',vaultGuid:f.vaultGuid,model:profile.model,maxTokens:2000,expiresAt:new Date(Date.now()+60000).toISOString(),documents:[{resourceId:'resource',contentHash:saved.hash}],queries:[hash('approved query')]};
 await s.index('resource',{consent});await assert.rejects(s.query('unapproved',{consent}),/not approved/);await s.query('approved query',{consent});assert.equal((await s.status()).receipts.length,2);
 await f.save('New words require new upload consent.');await assert.rejects(s.index('resource',{consent}),/not approved/);
 await s.close();await f.open();assert.equal((await f.service.status()).receipts.length,2);
 await assert.rejects(f.service.query('approved query',{consent:{...consent,maxTokens:4000}}),/identifier reused/);
});
test('superseded jobs and queries cannot publish; termination recovers without automatic paid replay',async t=>{
 const f=await fixture(t,{delayMs:120});await f.save();const s=await f.open();const job=s.index('resource');const rejected=assert.rejects(job,/superseded|cancelled|Superseded|Cancelled/);
 await new Promise(r=>setTimeout(r,40));s.invalidate();await rejected;assert.equal((await s.status()).passages,0);
 await s.index('resource');const q=s.query('old'),old=assert.rejects(q,/cancelled|Cancelled/);await new Promise(r=>setTimeout(r,20));const newer=s.query('new');await old;assert.equal((await newer).results.length,1);
 await f.save('A changed passage interrupted before publication.');const running=s.index('resource'),failed=assert.rejects(running,/stopped|cancelled|Cancelled/);await new Promise(r=>setTimeout(r,30));await s.terminate();await failed;
 await f.open();assert.equal((await f.service.query('old')).results.length,0);await f.service.index('resource');assert.equal((await f.service.status()).passages,1);
});
test('independent worker does not hold the canonical writer, disabled/profile/Vault restrictions and fixed-window rebuild',async t=>{
 const f=await fixture(t,{delayMs:150});await f.save();await assert.rejects(f.open({enabled:false}),/disabled/);const s=await f.open();
 const job=s.index('resource');await new Promise(r=>setTimeout(r,20));const start=performance.now();await f.save('Concurrent saved replacement.');const ms=performance.now()-start;await assert.rejects(job,/superseded/);assert(ms<150,'Writer blocked by provider latency');
 await s.index('resource');await s.close();await assert.rejects(f.open({vaultGuid:'foreign'}),/Foreign/);
 await assert.rejects(f.open({profile:{...profile,chunking:'fixed'}}),/incompatible/);await f.open({profile:{...profile,chunking:'fixed'},rebuild:true});await f.service.index('resource');assert.equal((await f.service.status()).profile.chunking,'fixed');
 const canonical=await f.writer.resourceProjection('resource');await f.service.close();fs.unlinkSync(path.join(f.root,'.mutable/retrieval.db'));await f.open();await f.service.index('resource');assert.equal((await f.service.status()).passages,1);assert.deepEqual(await f.writer.resourceProjection('resource'),canonical);
});
test('unknown external outcomes retain their reservation across worker interruption and cannot spend the cap again',async t=>{
 const f=await fixture(t,{external:true,delayMs:200}),saved=await f.save(),s=await f.open();
 const {tokens}=await import('./passages.mjs');const consent={approved:true,indexId:(await s.status()).indexId,id:'one-attempt',vaultGuid:f.vaultGuid,model:profile.model,maxTokens:tokens('A ship changes through repairs. Its history matters.'),expiresAt:new Date(Date.now()+60000).toISOString(),documents:[{resourceId:'resource',contentHash:saved.hash}]};
 const work=s.index('resource',{consent}),rejected=assert.rejects(work,/stopped|cancelled|Cancelled/);await new Promise(r=>setTimeout(r,50));await s.terminate();await rejected;
 await f.open();const state=await f.service.status();assert.equal(state.receipts.length,1);assert.equal(state.receipts[0].status,'unknown');await assert.rejects(f.service.index('resource',{consent}),/cap exhausted|outcome unknown/);
});
test('native Unicode mappings survive indexing; forged derived ranges are not returned as evidence',async t=>{
 const f=await fixture(t);await f.save('A😀e\u0301 — continuity and change.');const s=await f.open();await s.index('resource');const r=await s.query('continuity');assert.equal(r.results[0].text,'A😀e\u0301 — continuity and change.');
 const {default:Database}=await import('better-sqlite3');const db=new Database(path.join(f.root,'.mutable/retrieval.db'));const row=db.prepare('SELECT id,spans FROM Passage').get(),spans=JSON.parse(row.spans);spans[0].occurrence=['forged'];db.prepare('UPDATE Passage SET spans=? WHERE id=?').run(JSON.stringify(spans),row.id);db.close();
 const bad=await s.query('continuity');assert.equal(bad.results.length,0);assert.equal(bad.evidence,'no-established-evidence');assert(bad.coverage.staleCandidates>0);
});
test('interruption during actual passage/vector publication rolls the sidecar transaction back',async t=>{
 const f=await fixture(t);await f.save('The repaired vessel continues through an organised history. '.repeat(200));const s=await f.open();await s.index('resource');await s.close();
 const {openRetrievalStore,stamp}=await import('./store.mjs'),{planPassages}=await import('./passages.mjs');
 const store=openRetrievalStore({vault:f.root,vaultGuid:f.vaultGuid,profile:{...(await import('./profile.mjs')).defaultProfile,...profile}});
 try{const p=store.projection('resource'),chunks=planPassages(p,store.profile),vectors=new Map(chunks.map(c=>[c.inputHash,store.cached(c.inputHash)]));assert(chunks.length>1);
 const before=store.db.prepare('SELECT * FROM Passage ORDER BY id').all();let checks=0;
 assert.throws(()=>store.publish(p,chunks,vectors,stamp(p.resource),()=>{if(++checks===4)throw Error('injected mid-publication interruption');}),/injected/);
 assert.deepEqual(store.db.prepare('SELECT * FROM Passage ORDER BY id').all(),before);
 }finally{store.close();}
 await f.open();assert((await f.service.query('vessel')).results.length>0);
});
test('native FTS is immediate without embedding consent, with exact Unicode source and current-Symposium filtering',async t=>{
 const f=await fixture(t,{external:true});await f.save('A😀e\u0301 — continuity and ship repair.');const s=await f.open();
 const found=await s.query('ship',{strategy:'lexical'});assert.equal(found.results.length,1);assert.equal(found.usage,0);assert.equal((await s.status()).receipts.length,0);assert.equal(found.results[0].source.rootBlockId,'resource');assert.equal(found.results[0].source.spans[0].start,0);
 assert.equal((await s.query('ship',{strategy:'lexical',resourceId:'foreign'})).results.length,0);
 await f.save('Nothing nautical remains.');assert.equal((await s.query('ship',{strategy:'lexical'})).results.length,0);
});
test('explicit persistent scope authorises future saved revisions but never queries or foreign Vaults',async t=>{
 const f=await fixture(t,{external:true});await f.save();const s=await f.open();const grant={approved:true,id:'scope-documents',indexId:(await s.status()).indexId,vaultGuid:f.vaultGuid,model:profile.model,maxTokens:500,expiresAt:'9999-12-31T23:59:59Z',scope:{version:1,kind:'saved-vault-maintenance',vaultGuid:f.vaultGuid}};
 await s.index('resource',{consent:grant});await f.save('A new revision changes the source text.');await s.index('resource',{consent:grant});assert.equal((await s.status()).receipts.length,2);
 await assert.rejects(s.query('new query',{consent:grant}),/scope not approved/);
 await s.close();await f.open();await f.save('A third saved revision after restart.');await f.service.index('resource',{consent:grant});
 const queryGrant={...grant,id:'scope-queries',scope:{...grant.scope,kind:'interactive-queries'}};await f.service.query('third',{consent:queryGrant});await assert.rejects(f.service.query('fourth',{consent:{...queryGrant,vaultGuid:'foreign'}}));
 const result=await f.service.query('third',{strategy:'hybrid',resourceId:'foreign',consent:queryGrant});assert.equal(result.results.length,0);
});
test('bounded maintenance yields between Documents and reports progress without resetting receipts',async t=>{
 const f=await fixture(t);await f.save();const s=await f.open(),progress=[];let boundaries=0;const start=performance.now();const r=await s.reconcile({delayMs:40,beforeDocument:()=>{boundaries++;},onProgress:p=>progress.push(p)});
 assert(r.complete);assert.equal(boundaries,1);assert(performance.now()-start>=40);assert.equal(progress.at(-1).processed,1);
 const unchanged=await s.reconcile();assert.equal(unchanged.results[0].projectionReads,0);
});
test('foreground pause defers maintenance without blocking lexical queries or initiating uploads',async t=>{
 const f=await fixture(t,{external:true});const saved=await f.save(),s=await f.open();s.pauseMaintenance(250);
 const consent={approved:true,indexId:(await s.status()).indexId,id:'paused',vaultGuid:f.vaultGuid,model:profile.model,maxTokens:500,expiresAt:'9999-12-31T23:59:59Z',documents:[{resourceId:'resource',contentHash:saved.hash}]};
 const start=performance.now(),job=s.index('resource',{consent});const lexical=await s.query('ship',{strategy:'lexical'});assert.equal(lexical.results.length,1);assert.equal((await s.status()).receipts.length,0);await job;assert(performance.now()-start>=240);assert.equal((await s.status()).receipts.length,1);
});
test('maintenance stops on worker loss and subsequent requests retain the terminal failure',async t=>{
 const f=await fixture(t,{delayMs:300});await f.save();const s=await f.open();let entered;
 const started=new Promise(r=>entered=r),job=s.reconcile({onProgress:()=>entered()});
 const failed=assert.rejects(job,/worker stopped|cancelled|superseded/i);await started;await new Promise(r=>setTimeout(r,30));await s.terminate();await failed;
 assert.equal(s.isClosed(),true);await assert.rejects(s.status(),/worker stopped/i);
});
