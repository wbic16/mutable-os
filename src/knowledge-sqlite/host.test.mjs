import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {SqliteKnowledgeHost} from '../../dist/server/sqlite-knowledge-host.js';
import {createSavedIndexer} from '../../dist/server/sqlite-saved-indexer.js';
import {openSqliteFoundation} from './client.mjs';
import {testCavern} from './phext-test-cavern.mjs';
const doc={id:'root',type:'main-list-block',metadata:{documentId:'resource'},children:[{id:'text',type:'plain-text-block',text:'Original'}]};
// Phext-only: the host's root is a real Cavern — documents are
// written into the phext through the test VFS instance, exactly as
// the document stores write through the facade in production.
async function fixture(t,options={}){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'sqlite-p3a-')));const cavern=options.cavern===false?undefined:testCavern(root);const host=new SqliteKnowledgeHost({root,debounceMs:60000,...options});t.after(async()=>{await host.close();cavern?.close();await fs.rm(root,{force:true,recursive:true});});return {root,host,cavern};}
test('two leases share one worker; status uses current fence, release is independent and restart is unknown',async t=>{
 let opens=0;const f=await fixture(t,{open:async o=>{opens++;return openSqliteFoundation(o);}});f.cavern.writeFile('doc.json',JSON.stringify(doc));
 const [one,two]=await Promise.all([f.host.acquire('.'),f.host.acquire('.')]);assert.equal(opens,1);assert.equal(one.coverage.state,'unknown');await f.host.flush();assert.equal((await f.host.status(two.lease)).coverage.complete,true);
 await f.host.release(one.lease);assert.equal((await f.host.status(two.lease)).coverage.complete,true);
 f.cavern.writeFile('doc.json',JSON.stringify({...doc,metadata:{documentId:'resource',title:'external'}}));assert.equal((await f.host.status(two.lease)).coverage.state,'unknown');
 assert.equal((await f.host.refresh(two.lease)).coverage.complete,true);await f.host.close();
 const next=new SqliteKnowledgeHost({root:f.root,debounceMs:60000});try{const l=await next.acquire('.');assert.equal(l.coverage.state,'unknown');assert.notEqual(l.session,one.session);await assert.rejects(next.status(two.lease),/expired/);}finally{await next.close();}
});
test('unknown candidate cannot turn missing file into deletion; refresh recovers only after complete evidence',async t=>{
 const f=await fixture(t);f.cavern.writeFile('doc.json',JSON.stringify(doc));const l=await f.host.acquire('.');await f.host.flush();
 f.cavern.unlink('doc.json');f.cavern.writeFile('bad.json','bad');assert.equal((await f.host.refresh(l.lease)).coverage.complete,false);
 f.cavern.unlink('bad.json');const status=await f.host.refresh(l.lease);assert.equal(status.coverage.complete,true);assert.equal(status.coverage.resources,0);
});
test('foreground bypasses paused background staging, keeps publication successful and resumes from authoritative bytes',async t=>{
 let reached,proceed,once=true;const staged=new Promise(r=>reached=r),wait=new Promise(r=>proceed=r);
 const f=await fixture(t,{indexer:(c,o)=>createSavedIndexer(c,{...o,checkpoint:async phase=>{if(phase==='staged'&&once){once=false;reached();await wait;}}})});f.cavern.writeFile('doc.json',JSON.stringify(doc));const l=await f.host.acquire('.');const work=f.host.flush();await staged;
 let published=false;const save=f.host.foreground(()=>f.host.store.lock(async()=>{f.cavern.writeFile('doc.json',JSON.stringify({...doc,metadata:{documentId:'resource',title:'saved'}}));published=true;return 'saved';}));
 try{assert.equal(await save,'saved');assert.equal(published,true);}finally{proceed();}await work;await f.host.flush();assert.equal((await f.host.status(l.lease)).coverage.complete,true);assert.equal(f.host.metrics.cancellations,1);
});
test('storage still works after SQL worker failure; no automatic transaction replay',async t=>{
 let client;const f=await fixture(t,{open:async o=>client=await openSqliteFoundation(o)});f.cavern.writeFile('doc.json',JSON.stringify(doc));const l=await f.host.acquire('.');await f.host.flush();await client.terminate();
 assert.equal((await f.host.status(l.lease)).coverage.state,'unknown');
 assert.equal(await f.host.foreground(async()=>{f.cavern.writeFile('saved.txt','authoritative');return 'saved';}),'saved');await f.host.flush();assert.equal((await f.host.status(l.lease)).coverage.complete,false);
});
test('read-only missing/existing phext never initializes or reconciles and cannot claim coverage',async t=>{
 const f=await fixture(t,{readOnly:true,cavern:false});await assert.rejects(f.host.acquire('.'),/ENOENT|missing|unavailable|No Cavern phext/i);await assert.rejects(fs.stat(path.join(f.root,'.mutable')));await f.host.close();
 const writer=await openSqliteFoundation({vault:f.root,initialize:true});await writer.close();const phext=path.join(f.root,'cavern.phext'),before=await fs.readFile(phext);
 const cavern=testCavern(f.root);const reader=new SqliteKnowledgeHost({root:f.root,readOnly:true});try{const l=await reader.acquire('.');assert.equal(l.coverage.state,'unknown');await reader.flush();assert.equal((await reader.status(l.lease)).coverage.complete,false);}finally{await reader.close();}assert.deepEqual(await fs.readFile(phext),before);cavern.close();
});
test('confines roots, rejects overlaps and conflicting policy, and expires abandoned leases',async t=>{
 const f=await fixture(t,{leaseMs:50});f.cavern.vfs.mkdir('/nested');const l=await f.host.acquire('.');await assert.rejects(f.host.acquire('nested'),/Overlapping/);await assert.rejects(f.host.acquire('../'),/Invalid/);
 await assert.rejects(f.host.acquire('.',{version:1,opaqueTypes:['new-widget']}),/policy differs/);await new Promise(r=>setTimeout(r,100));await assert.rejects(f.host.status(l.lease),/expired/);
 await assert.rejects(f.host.acquire('nested'),/Overlapping Vault/); // Persisted ancestor ownership outlives a lease.
});
