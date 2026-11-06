import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {randomUUID as uuid} from 'node:crypto';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {migrate,migrations,verifyDatabase,clearDerived,rebuildFts,hash} from './schema.mjs';
import {canonicalLedger} from './canonical-ledger.mjs';
import {canonicalPropositions} from './propositions.mjs';
import {encodeAuthoredValue} from '../history/preplan-spike/authored-values.mjs';
import {openFoundation,restoreSnapshot} from './foundation.mjs';
const request=(more={})=>({op:'create',operationId:uuid(),id:uuid(),blockId:uuid(),name:'Training claim',text:'A😀é',annotations:[],...more});
function fixture(t){const db=new Database(':memory:'),audit=new Database(':memory:');migrate(db,'mutable',{fresh:true});migrate(audit,'audit',{fresh:true});t.after(()=>{db.close();audit.close();});const ledger=canonicalLedger(db,()=>audit);return {db,audit,ledger,run:r=>canonicalPropositions(db,ledger,r)};}
test('v7 rebuild retains children, shared definitions, FTS, metadata and ownership',t=>{
 const db=new Database(':memory:');t.after(()=>db.close());migrate(db,'mutable',{fresh:true,steps:migrations.mutable.slice(0,7)});
 db.exec(`INSERT INTO Resource(guid,path,typename,format,rootBlockGuid,contentHash,indexedUtc,extractionProfile,indexStatus) VALUES('r','a.ink','document-block','ink','b','h','now','p','complete');
 INSERT INTO Block(guid,resourceGuid,typename,authoredType,text) VALUES('b','r','standoff-editor-block','standoff-editor-block','abc');
 INSERT INTO BlockTextRun(blockGuid,ordinal,text) VALUES('b',0,'abc');
 INSERT INTO BlockProperty(guid,blockGuid,identityKind,ordinal,typename) VALUES('p','b','authored',0,'style');
 INSERT INTO BlockRelation(guid,resourceGuid,sourceBlockGuid,identityKind,typename,targetBlockGuid,targetScope,kind) VALUES('rel','r','b','authored','ref','b','local','reference');
 INSERT INTO AnnotationDefinition(guid,resourceGuid,ownerBlockGuid,annotationId,attributes) VALUES('d','r','b','a','{}');
 INSERT INTO StandoffProperty(guid,resourceGuid,sourceBlockGuid,identityKind,logicalGuid,startIndex,endIndex,coordinate,resolution,attributes,definitionAnnotationId) VALUES('s','r','b','authored','s',0,1,'cell','resolved','{}','a');`);
 const tables=['Resource','BlockProperty','BlockRelation','BlockTextRun','AnnotationDefinition','StandoffProperty'];const prior=tables.map(n=>db.prepare(`SELECT * FROM ${n}`).all());
 const definition=db.prepare("SELECT sql FROM sqlite_schema WHERE name='AnnotationDefinition'").get().sql;
 migrate(db,'mutable');assert.equal(db.pragma('foreign_keys',{simple:true}),1);assert.equal(db.prepare("SELECT sql FROM sqlite_schema WHERE name='AnnotationDefinition'").get().sql,definition);
 assert.deepEqual(tables.map(n=>db.prepare(`SELECT * FROM ${n}`).all()),prior);assert.equal(verifyDatabase(db,'mutable').ok,true);
 assert.throws(()=>db.exec("UPDATE StandoffProperty SET resourceGuid=NULL WHERE guid='s'"),/ownership/);
 assert.throws(()=>db.exec("UPDATE Block SET resourceGuid=NULL WHERE guid='b'"),/ownership/);
 db.exec("DELETE FROM Resource WHERE guid='r'");assert.equal(db.prepare('SELECT count(*) n FROM AnnotationDefinition').get().n,0);
});
test('aggregate saves, receipts, revisions, direct Unicode points, FTS, archive and rebuild',t=>{
 const {db,run,ledger,audit}=fixture(t),ann=uuid(),target=uuid();const r=request({annotations:[{id:ann,start:1,end:3,property:encodeAuthoredValue({id:ann,type:'codex/entity-reference',value:target,start:1,end:1,metadata:{uncertainty:NaN}})}]});
 const saved=run(r).proposition;assert.equal(saved.revision,0);assert.equal(db.prepare('SELECT count(*) n FROM Resource').get().n,0);assert.deepEqual(run(r).proposition,saved);
 assert.equal(run({op:'list',query:'Training'}).rows[0].labelMatch,1);assert.equal(run({op:'list',query:'A'}).rows[0].textMatch,1);
 assert.throws(()=>run({...r,op:'update',operationId:uuid(),expectedRevision:1}),/conflict/);
 assert.throws(()=>run({...r,op:'update',operationId:uuid(),expectedRevision:0,annotations:undefined}),/complete annotation/);
 const point=uuid(),updated=run({...r,op:'update',operationId:uuid(),expectedRevision:0,text:'😀',annotations:[{id:point,start:2,end:2,property:encodeAuthoredValue({id:point,type:'point',start:1,end:1,isZeroWidth:true})}]}).proposition;
 assert.equal(updated.id,saved.id);assert.equal(updated.blockId,saved.blockId);assert.equal(updated.revision,1);
 const bytes=JSON.stringify(run({op:'get',id:r.id}));clearDerived(db);rebuildFts(db);assert.equal(JSON.stringify(run({op:'get',id:r.id})),bytes);
 const archived=run({op:'archive',id:r.id,operationId:uuid(),expectedRevision:1}).proposition;
 assert.equal(run({op:'list'}).rows.length,0);assert.equal(run({op:'list',archived:true}).rows.length,1);
 run({op:'restore',id:r.id,operationId:uuid(),expectedRevision:archived.revision});assert.equal(run({op:'list'}).rows.length,1);
 assert.throws(()=>db.prepare('DELETE FROM Entity WHERE guid=?').run(r.id),/FOREIGN KEY/);
 assert.throws(()=>db.prepare("UPDATE Entity SET typename='Person' WHERE guid=?").run(r.id),/immutable/);
 assert.equal(verifyDatabase(db,'mutable').ok,true);ledger.deliver();assert.ok(audit.prepare("SELECT 1 FROM AuditEvent WHERE recordType='Block'").get());assert.ok(audit.prepare("SELECT 1 FROM AuditEvent WHERE recordType='StandoffProperty'").get());
});
test('invalid/colliding annotations rollback the entire aggregate and receipt',t=>{
 const {db,run}=fixture(t),r=request(),ann=uuid();run({...r,annotations:[{id:ann,start:0,end:1,property:{id:ann,type:'bold',start:0,end:0}}]});
 const next=request({annotations:[{id:ann,start:0,end:1,property:{id:ann,type:'bold',start:0,end:0}}]});assert.throws(()=>run(next),/UNIQUE/);
 assert.equal(db.prepare('SELECT count(*) n FROM Entity').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM PendingAuditMutation').get().n,1);
 assert.throws(()=>run(request({annotations:[{id:uuid(),start:0,end:1,property:{annotationId:'shared'}}]})),/direct/);
 assert.throws(()=>run(request({id:r.id})),/GUID already exists/);
});
test('foundation backup, restore, reopen, readonly and flag preserve canonical identity',async t=>{
 const {testCavern}=await import('./phext-test-cavern.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'thesis-functional-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const vault=path.join(root,'vault'),dest=path.join(root,'restored');fs.mkdirSync(vault);fs.mkdirSync(dest);
 const cavern=testCavern(vault);t.after(()=>cavern.close());
 let store=openFoundation({vault,initialize:true},{phextVfs:cavern.vfs,phextPath:cavern.phextPath});const point=uuid(),r=request({annotations:[{id:point,start:5,end:5,property:{id:point,type:'point',start:4,end:4,isZeroWidth:true}}]}),saved=store.propositions(r).proposition;await store.backup(path.join(root,'backup'));store.close();
 const destCavern=testCavern(dest);t.after(()=>destCavern.close());
 restoreSnapshot(path.join(root,'backup'),dest,false,destCavern.vfs);store=openFoundation({vault:dest,readOnly:true},{phextVfs:destCavern.vfs,phextPath:destCavern.phextPath});assert.deepEqual(store.propositions({op:'get',id:r.id}).proposition,saved);assert.throws(()=>store.propositions(request()),/read-only/);store.close();
 store=openFoundation({vault,thesisEnabled:false},{phextVfs:cavern.vfs,phextPath:cavern.phextPath});assert.throws(()=>store.propositions({op:'list'}),/disabled/);store.close();
});
test('canonical aggregate survives real saved projection, no-op reconcile, full rebuild, resource deletion and worker reopen',async t=>{
 const {openSqliteFoundation}=await import('../../dist/server/knowledge-sqlite/client.mjs');const {createSavedIndexer,NativeVaultStore}=await import('../../dist/server/sqlite-saved-indexer.js');const {testCavern}=await import('./phext-test-cavern.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'thesis-index-functional-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const cavern=testCavern(root);t.after(()=>cavern.close());let client=await openSqliteFoundation({vault:root,initialize:true});t.after(()=>client.close());
 const r=request(),ann=uuid();r.annotations=[{id:ann,start:1,end:3,property:{id:ann,type:'codex/entity-reference',value:uuid(),start:1,end:1}}];await client.propositions(r);const bytes=JSON.stringify(await client.propositions({op:'get',id:r.id}));
 const resource=uuid(),block=uuid();const doc={id:uuid(),type:'main-list-block',metadata:{documentId:resource},children:[{id:block,type:'standoff-editor-block',text:'saved source',standoffProperties:[{id:uuid(),type:'style/bold',start:0,end:4}]}]};cavern.writeFile('source.json',JSON.stringify(doc));
 const index=createSavedIndexer(client,{root,store:new NativeVaultStore({root})});assert.equal((await index.refresh({mode:'full'})).complete,true);assert.equal((await index.refresh()).reconciled[0].changedBlocks,0);
 assert.equal(JSON.stringify(await client.propositions({op:'get',id:r.id})),bytes);await client.clearDerived();await client.rebuildFts();await index.refresh({mode:'full'});cavern.unlink('source.json');await index.refresh();assert.equal(JSON.stringify(await client.propositions({op:'get',id:r.id})),bytes);
 // File indexing must not adopt a canonical Block even when all other bytes are valid.
 doc.children[0].id=r.blockId;cavern.writeFile('source.json',JSON.stringify(doc));const conflict=await index.refresh();assert.equal(conflict.complete,false);assert.equal(JSON.stringify(await client.propositions({op:'get',id:r.id})),bytes);
 await client.close();client=await openSqliteFoundation({vault:root});assert.equal(JSON.stringify(await client.propositions({op:'get',id:r.id})),bytes);assert.equal((await client.verify()).ok,true);
});
test('source provenance, NULL ownership, uniqueness and direct-only definition guards',t=>{
 const {db,run}=fixture(t),r=request(),vaultGuid=run({op:'context'}).vaultGuid;
 r.source={version:1,vault:'.',vaultGuid,resourceGuid:uuid(),blockGuid:uuid(),coordinate:'cell',start:1,end:2,text:'😀',blockHash:hash('A😀é'),capturedUtc:new Date().toISOString(),sourceRevision:3};const p=run(r).proposition;
 assert.deepEqual(p.attributes.thesis.source,r.source);assert.equal(run({op:'source',id:r.id}).status,'missing');
 assert.throws(()=>db.prepare("INSERT INTO Block(guid,resourceGuid,entityGuid,typename,authoredType,text) VALUES(?,NULL,?,'mutable/proposition-block','mutable/proposition-block','')").run(uuid(),r.id),/UNIQUE/);
 const statement="INSERT INTO StandoffProperty(guid,sourceBlockGuid,identityKind,logicalGuid,startIndex,endIndex,coordinate,resolution,attributes,definitionAnnotationId) VALUES(?,?,'authored',?,0,0,'utf16',?,'{}',?)";
 assert.throws(()=>db.prepare(statement).run(uuid(),uuid(),uuid(),'direct',null),/ownership/);
 assert.throws(()=>db.prepare(statement).run(uuid(),p.blockId,uuid(),'resolved','def'),/CHECK/);
 assert.throws(()=>run(request({source:{...r.source,vaultGuid:uuid()}})),/provenance/);
 assert.throws(()=>run(request({annotations:[{id:uuid(),start:1,end:2,property:{id:'bad',type:'style/bold',start:1,end:1}}]})),/direct/);
});
test('v8 FK validation failure rolls back the rebuild and restores FK enforcement',t=>{
 const db=new Database(':memory:');t.after(()=>db.close());migrate(db,'mutable',{fresh:true,steps:migrations.mutable.slice(0,7)});db.pragma('foreign_keys=OFF');
 db.exec("INSERT INTO Block(guid,resourceGuid,typename,authoredType) VALUES('orphan','missing','text-block','text-block')");const before=db.serialize();
 assert.throws(()=>migrate(db,'mutable'),/foreign key check/);assert.deepEqual(db.serialize(),before);assert.equal(db.pragma('foreign_keys',{simple:true}),1);assert.equal(db.pragma('user_version',{simple:true}),7);
});
test('authored annotation ordering survives save/reopen and overlap precedence changes',t=>{
 const {run}=fixture(t),ids=[uuid(),uuid()],r=request({annotations:ids.map((id,i)=>({id,start:0,end:1,property:{id,type:'style/color',value:i?'blue':'red',start:0,end:0}}))});
 assert.deepEqual(run(r).proposition.annotations.map(a=>a.id),ids);
 const next=run({...r,op:'update',operationId:uuid(),expectedRevision:0,annotations:[...r.annotations].reverse()}).proposition;assert.deepEqual(next.annotations.map(a=>a.id),[...ids].reverse());assert.deepEqual(run({op:'get',id:r.id}).proposition.annotations,next.annotations);
});
