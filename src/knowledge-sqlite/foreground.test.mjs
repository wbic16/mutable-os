import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {SqliteKnowledgeHost} from '../../dist/server/sqlite-knowledge-host.js';
import {createSavedIndexer,ManagedPair} from '../../dist/server/sqlite-saved-indexer.js';
import {openSqliteFoundation} from './client.mjs';
import {testCavern} from './phext-test-cavern.mjs';
const body=p=>({blocks:p.blocks,tags:p.tags,resource:{...p.resource,indexedUtc:null,indexStatus:null}});
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'p3a-contention-')));
 // Phext-only: the contention root is a real Cavern; pair saves and
 // external edits all land in the phext through the facade.
 const cavern=testCavern(root);t.after(()=>{cavern.close();});cavern.vfs.mkdir('/other');
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const native=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8'),resourceId=JSON.parse(native).resourceId;
 const pair=new ManagedPair({root,resourceId,nativeName:'paper.mutable.json',markdownName:'paper.md'});
 const generation=title=>{const wire=JSON.parse(native),b=wire.document.blocks.find(b=>b.id===wire.document.root.target.blockId);b.properties.metadata={...b.properties.metadata,title};return {resourceId,generation:randomUUID(),native:JSON.stringify(wire),markdown:'# '+title,profile:'qualification',targets:[]};};
 assert.equal((await pair.save(generation('Initial'))).phase,'saved');
 let pause=false,reached,proceed,client,index;const ready=new Promise(r=>reached=r),wait=new Promise(r=>proceed=r);
 const host=new SqliteKnowledgeHost({root,debounceMs:60000,indexer:(c,o)=>{client=c;return index=createSavedIndexer(c,{...o,checkpoint:async phase=>{if(phase==='staged'&&pause){pause=false;reached();await wait;}}});}});
 t.after(async()=>{proceed();await host.close();});const lease=await host.acquire('.');await host.flush();
 return {root,host,client,pair,resourceId,generation,lease,cavern,ready,proceed,index,async stage(){pause=true;await pair.save(generation('Background'));const work=host.refresh(lease.lease);await ready;return {work};}};
}
for(const change of ['save','relocate','recovery','external','duplicate-resource','duplicate-block','worker-failure'])test(`${change} racing a prepared background stage never publishes the old candidate`,async t=>{
 const f=await fixture(t),before=await f.client.resourceProjection(f.resourceId),{work}=await f.stage();
 try{
  if(change==='save')await f.host.foreground(()=>f.host.store.lock(()=>f.pair.save(f.generation('Foreground'))));
  if(change==='relocate')await f.host.foreground(async()=>{const scan=await f.host.store.discover('.');await f.host.store.relocate({operationId:randomUUID(),vault:'.',kind:'pair',source:'paper.mutable.json',destination:'other/renamed.mutable.json',baselines:scan.documents.map(d=>({resourceId:d.resourceId,baseline:d.baseline}))});});
  if(change==='recovery')await f.host.foreground(()=>f.host.store.lock(async()=>{f.pair.fault=async phase=>{if(phase==='after-native')throw Error('interrupted');};const pending=await f.pair.save(f.generation('Recovered'));assert.equal(pending.phase,'canonical-saved-markdown-pending');f.pair.fault=async()=>{};assert.equal((await f.pair.recover()).phase,'saved');}));
  if(change==='external')f.cavern.writeFile('paper.mutable.json',f.generation('External').native);
  if(change==='duplicate-resource')f.cavern.writeFile('duplicate.mutable.json',f.generation('Duplicate').native);
  if(change==='duplicate-block'){const source=before.blocks[0].block.guid;f.cavern.writeFile('duplicate.json',JSON.stringify({id:'other-resource',type:'main-list-block',children:[{id:source,type:'plain-text-block',text:'duplicate'}]}));}
  if(change==='worker-failure')await f.client.terminate();
  // Foreground storage completed while the background callback is still paused.
  if(change!=='worker-failure')assert.deepEqual(body(await f.client.resourceProjection(f.resourceId)),body(before));
 }finally{f.proceed();}
 await work;
 if(['save','relocate','recovery'].includes(change)){
  await f.host.flush();assert.equal((await f.host.status(f.lease.lease)).coverage.complete,true);
  const after=await f.client.resourceProjection(f.resourceId);
  if(change==='relocate')assert.equal(after.resource.path,'other/renamed.mutable.json');
  else assert.equal(after.resource.title,change==='save'?'Foreground':'Recovered');
 }else{
  assert.equal((await f.host.status(f.lease.lease)).coverage.complete,false);
  if(change!=='worker-failure')assert.deepEqual(body(await f.client.resourceProjection(f.resourceId)),body(before));
  else assert.equal(await f.host.foreground(async()=>{f.cavern.writeFile('still-writable.txt','ok');return true;}),true);
 }
});
for(const failure of ['foreground','worker'])test(`${failure} racing guarded SQL publication releases the critical section safely`,async t=>{
 const f=await fixture(t),before=await f.client.resourceProjection(f.resourceId);let reached,proceed,once=true;
 const ready=new Promise(r=>reached=r),wait=new Promise(r=>proceed=r),commit=f.client.commitSaved;
 f.client.commitSaved=async(...args)=>{if(once){once=false;reached();await wait;}return commit(...args);};
 await f.pair.save(f.generation('Background'));const sweep=f.host.refresh(f.lease.lease);await ready;
 let saved=false;const foreground=f.host.foreground(()=>f.host.store.lock(async()=>{await f.pair.save(f.generation('Foreground'));saved=true;}));
 try{await new Promise(r=>setTimeout(r,10));assert.equal(saved,false);if(failure==='worker')await f.client.terminate();}finally{proceed();}
 await foreground;assert.equal(saved,true);await sweep;
 if(failure==='worker')assert.equal((await f.host.status(f.lease.lease)).coverage.complete,false);
 else{await f.host.flush();assert.equal((await f.client.resourceProjection(f.resourceId)).resource.title,'Foreground');}
});
test('prepared SQL comparison expires on an external connection change even with unchanged Resource baseline',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'p3a-sql-proof-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const c=await openSqliteFoundation({vault:root,initialize:true});t.after(()=>c.close());
 const bytes=Buffer.from(JSON.stringify({id:'r',type:'main-list-block',children:[]})),{createHash}=await import('node:crypto');
 const p=await c.stageSaved({bytes,vaultGuid:(await c.inspect()).mutable.vaultGuid,evidence:{path:'r.json',contentHash:createHash('sha256').update(bytes).digest('hex')}});
 // The disk fixture wrote through a second raw connection; the
 // phext analog is a canonical mutation through another operation
 // channel of the same foundation, which equally invalidates the
 // prepared comparison's baseline.
 await c.entities({op:'create',id:randomUUID(),operationId:randomUUID(),name:'Entity'});
 await assert.rejects(c.commitSaved(p.token),/Stale SQL/);assert.deepEqual(await c.inventory(),[]);
});

test('external change immediately after SQL commit invalidates publication and retains stale rows as non-current',async t=>{
 const f=await fixture(t);const commit=f.client.commitSaved;let once=true;
 f.client.commitSaved=async(...args)=>{const result=await commit(...args);if(once){once=false;f.cavern.writeFile('paper.mutable.json',f.generation('External after commit').native);}return result;};
 await f.pair.save(f.generation('Background'));
 const status=await f.host.refresh(f.lease.lease);assert.equal(status.coverage.complete,false);
 assert.equal((await f.client.resourceProjection(f.resourceId)).resource.indexStatus,'stale');
 assert.match(status.coverage.diagnostics.join(' '),/Stale saved-resource evidence/);
});

test('worker failure after a committed transaction gives unknown coverage without replay; reopen revalidates',async t=>{
 const f=await fixture(t);const commit=f.client.commitSaved;let once=true;
 f.client.commitSaved=async(...args)=>{const result=await commit(...args);if(once){once=false;await f.client.terminate();throw Error('lost publication acknowledgement');}return result;};
 await f.pair.save(f.generation('Saved before failure'));
 assert.equal((await f.host.refresh(f.lease.lease)).coverage.complete,false);
 await f.host.close();const next=new SqliteKnowledgeHost({root:f.root,debounceMs:60000});
 try{const l=await next.acquire('.');assert.equal(l.coverage.state,'unknown');await next.flush();assert.equal((await next.status(l.lease)).coverage.complete,true);}finally{await next.close();}
});
