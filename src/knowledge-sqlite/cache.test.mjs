import {test} from 'node:test';import assert from 'node:assert/strict';import Database from 'better-sqlite3';
import {migrate,migrations} from './schema.mjs';import {sharedCache} from './cache.mjs';
test('additive cache migration, versioned values, expiry, replacement and invalidation leave canonical facts alone',t=>{
 const db=new Database(':memory:');t.after(()=>db.close());migrate(db,'mutable',{fresh:true,steps:migrations.mutable.slice(0,10)});migrate(db,'mutable');
 const key='authority/wikidata/Q762',value={schemaVersion:1,name:'Leonardo'};assert.equal(sharedCache(db,{op:'get',key}),null);sharedCache(db,{op:'set',key,value,ttl:1000},1000);assert.equal(sharedCache(db,{op:'get',key},1500).stale,false);assert.equal(sharedCache(db,{op:'get',key},2000).stale,true);
 sharedCache(db,{op:'set',key,value:{...value,name:'Updated'},ttl:2000},2000);const row=sharedCache(db,{op:'get',key},2200);assert.equal(row.createdAt,new Date(1000).toISOString());assert.equal(row.value.name,'Updated');assert.throws(()=>sharedCache(db,{op:'set',key,value:{name:'unversioned'}}));sharedCache(db,{op:'invalidate',key});assert.equal(sharedCache(db,{op:'get',key}),null);assert.equal(db.prepare('SELECT count(*) n FROM Entity').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM PendingAuditMutation').get().n,0);
});
