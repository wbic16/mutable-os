import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {randomUUID as uuid} from 'node:crypto';
import {openSqliteFoundation} from './client.mjs';
const mutate=(op,data)=>({op,operationId:uuid(),...data});
test('canonical Entity/alias/Relationship worker semantics, retries, restart, read-only and backup',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'entity-service-')),vault=path.join(dir,'vault');let c;
 try{
 await mkdir(vault);c=await openSqliteFoundation({vault,initialize:true});const a=uuid(),b=uuid(),alias=uuid(),input=mutate('create',{id:a,name:'Florence'});
 const first=await c.entities(input);assert.equal(first.entity.id,a);assert.deepEqual((await c.entities(input)).entity,first.entity);
 await assert.rejects(c.entities({...input,name:'Different'}),/differs/);
 await c.entities(mutate('create',{id:b,name:'Florence'}));assert.equal((await c.entities({op:'search',query:'Florence',stream:'name',match:'exact'})).matches.length,2);
 assert.equal((await c.entities({op:'search',query:'Firenze',stream:'alias',match:'exact'})).matches.length,0);
 await c.entities(mutate('alias-add',{id:alias,entityId:a,name:'Firenze'}));
 assert.equal((await c.entities({op:'search',query:'firen',stream:'alias',match:'partial'})).matches[0].id,a);
 assert.equal((await c.entities({op:'search',query:'firen',stream:'alias',match:'exact'})).matches.length,0);
 await c.entities(mutate('alias-update',{id:alias,entityId:a,name:'Florentia',expected:0}));
 await assert.rejects(c.entities(mutate('alias-remove',{id:alias,entityId:a,expected:0})),/revision/);
 await c.entities(mutate('rename',{id:a,name:'Florence, Italy',expected:0}));
 await assert.rejects(c.entities(mutate('rename',{id:a,name:'Other',expected:0})),/revision/);
 assert.deepEqual((await c.entities({op:'relationships',id:a,direction:'out'})).relationships,[]);
 await assert.rejects(c.entities(mutate('relationship-create',{id:uuid(),source:a,target:uuid(),type:'located-in'})),/endpoint/);
 const relationship=uuid();await c.entities(mutate('relationship-create',{id:relationship,source:a,target:b,type:'related-to'}));
 assert.equal((await c.entities({op:'relationships',id:b,direction:'in'})).relationships[0].id,relationship);
 await c.entities(mutate('relationship-update',{id:relationship,source:b,target:a,type:'renamed',expected:0}));
 await assert.rejects(c.entities(mutate('relationship-update',{id:relationship,source:a,target:b,type:'stale',expected:0})),/revision/);
 await c.backup(path.join(dir,'backup'));await c.close();c=await openSqliteFoundation({vault,readOnly:true});
 assert.equal((await c.entities({op:'get',id:a})).entity.name,'Florence, Italy');
 assert.equal((await c.entities({op:'get',id:a})).entity.aliases[0].name,'Florentia');
 await assert.rejects(c.entities(mutate('create',{id:uuid(),name:'Read only'})),/read-only/);
 assert.equal((await c.verify()).ok,true);
 await c.close();const restored=path.join(dir,'restored');await mkdir(restored);c=await openSqliteFoundation({vault:restored,restoreFrom:path.join(dir,'backup')});
 assert.equal((await c.entities({op:'get',id:a})).entity.name,'Florence, Italy');
 assert.equal((await c.entities({op:'relationships',id:a,direction:'in'})).relationships[0].type,'renamed');
 await c.clearDerived();assert.equal((await c.entities({op:'get',id:a})).entity.aliases[0].name,'Florentia');
 assert.equal((await c.entities(input)).entity.id,a); // durable retry after backup/restore, never a second identity
 
 }finally{await c?.close();await rm(dir,{recursive:true,force:true});}
});

test('canonical audit failure rolls back Entity mutation; bounded outbox never drops events',async()=>{
 const {default:Database}=await import('better-sqlite3'),{canonicalEntities}=await import('./entities.mjs');
 // Unit fixture: canonicalEntities/canonicalLedger operate on a
 // mutable+audit database pair. On disk that pair is the ephemeral
 // replica's shape (the phext is canonical), so build the pair
 // directly from the schema instead of through a vault.
 const {migrate}=await import('./schema.mjs');
 const dir=await mkdtemp(path.join(os.tmpdir(),'entity-audit-'));const vaultGuid=uuid();
 const db=new Database(path.join(dir,'mutable.db'));migrate(db,'mutable',{fresh:true,vaultGuid});db.pragma('foreign_keys=ON');
 const audit=new Database(path.join(dir,'audit.db'));migrate(audit,'audit',{fresh:true,vaultGuid});const {canonicalLedger}=await import('./canonical-ledger.mjs');const ledger=canonicalLedger(db,()=>audit);
 try{
 const input=mutate('create',{id:uuid(),name:'Atomic'});let checks=0;
 assert.throws(()=>canonicalEntities(db,input,()=>{if(++checks===3)throw Error('interrupted before commit');},ledger),/interrupted/);
 assert.equal(db.prepare('SELECT count(*) AS n FROM Entity').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM PendingAuditMutation').get().n,0);
 db.prepare('INSERT INTO PendingAuditMutation VALUES(?,?,?)').run(uuid(),'now',JSON.stringify('x'.repeat(16*1024*1024)));
 assert.throws(()=>canonicalEntities(db,input,undefined,ledger),/outbox full/);assert.equal(db.prepare('SELECT count(*) AS n FROM Entity').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM PendingAuditMutation').get().n,1);
 }finally{audit.close();db.close();await rm(dir,{recursive:true,force:true});}
});
