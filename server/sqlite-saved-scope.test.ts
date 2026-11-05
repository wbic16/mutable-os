import {afterEach,expect,it} from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import {SqliteKnowledgeHost} from './sqlite-knowledge-host';
import {ManagedPair,hash} from '../src/persistence/managed-pair.mjs';
import {openSqliteFoundation} from '../src/knowledge-sqlite/client.mjs';
import {decodeFacts,encodeFacts} from '../src/knowledge/transport';
import {lightweightFacts} from '../src/knowledge/saved-reader';
import {normalizePolicy} from '../src/knowledge/policy';
import {testCavern} from '../src/knowledge-sqlite/phext-test-cavern.mjs';import {promises as vfs} from './phext-fs.mjs';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
async function fixture(options:any={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'p3b-http-')));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));const cavern=testCavern(root);cleanup.push(()=>cavern.close());
 const native=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8'),resourceId=JSON.parse(native).resourceId;
 const pair=new ManagedPair({root,resourceId,nativeName:'paper.mutable.json',markdownName:'paper.md'});
 const generation=(title:string)=>{const wire=JSON.parse(native),b=wire.document.blocks.find((b:any)=>b.id===wire.document.root.target.blockId);b.properties.metadata={...b.properties.metadata,title};return {resourceId,generation:crypto.randomUUID(),native:JSON.stringify(wire),markdown:'# '+title,profile:'test',targets:[]};};
 const original=generation('Original');expect((await pair.save(original)).phase).toBe('saved');
 let client:any;const host=new SqliteKnowledgeHost({root,debounceMs:60000,...options,open:async(o:any)=>client=await openSqliteFoundation(o)});cleanup.push(()=>host.close());
 const app=express();app.use('/knowledge',host.router());const server:any=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});cleanup.push(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(action:string,body:any)=>{const r=await fetch(base+'/knowledge/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
 const lease=(await call('open',{vault:'.'})).Data;await host.flush();
 const begin=async()=>call('facts/begin',{lease:lease.lease,vault:'.',signature:hash(JSON.stringify(await host.store.discover('.'))),policy:normalizePolicy(undefined)});
 return {root,host,client,call,lease,begin,resourceId,original,pair,generation};
}
it('real SQL worker/HTTP saved Facts equal the file reader; scopes share the worker and reads never write native files',async()=>{
 const f=await fixture(),before=await vfs.readFile(path.join(f.root,'paper.mutable.json'));
 const [a,b]=await Promise.all([f.begin(),f.begin()]);expect(a.Success).toBe(true);expect(b.Success).toBe(true);
 const result=await f.call('facts/batch',{scope:a.Data.scope,ids:[f.resourceId]});expect(result.Success).toBe(true);expect(result.Data.items[0].error).toBeUndefined();
 const item=result.Data.items[0];expect(decodeFacts(item.wire)).toEqual(decodeFacts(encodeFacts((await lightweightFacts(before)).facts)));expect(item.evidence.byteHash).toBe(hash(before));
 expect((await f.call('facts/current',{scope:b.Data.scope})).Success).toBe(true);
 const mentions=await f.call('facts/mentions',{scope:a.Data.scope,ids:[f.resourceId],entityId:'entity-poe',limit:100});expect(mentions.Success).toBe(true);expect(mentions.Data.provenance).toBe('saved-native-assertions');
 const relationships=await f.call('facts/relationships',{scope:a.Data.scope,entityId:'entity-poe',direction:'both',limit:10});expect(relationships.Success).toBe(true);expect(relationships.Data.items).toEqual([]);
 await f.call('facts/release',{scope:a.Data.scope});expect((await f.call('facts/current',{scope:a.Data.scope})).Success).toBe(false);expect((await f.call('facts/current',{scope:b.Data.scope})).Success).toBe(true);expect(await vfs.readFile(path.join(f.root,'paper.mutable.json'))).toEqual(before);
});
for(const mutation of ['external','save','sql','worker','release','relocate','pending'])it(`${mutation} invalidates SQL reads without claiming absence`,async()=>{
 const f=await fixture(),a=await f.begin();expect(a.Success).toBe(true);
 if(mutation==='external')await vfs.writeFile(path.join(f.root,'paper.mutable.json'),f.generation('external').native);
 if(mutation==='save')await f.host.foreground(()=>f.host.store.lock(()=>f.pair.save(f.generation('saved'))));
 if(mutation==='sql')await f.client.entities({op:'create',id:crypto.randomUUID(),operationId:crypto.randomUUID(),name:'external SQL'}); // phext: no mutable.db file exists — an out-of-band knowledge mutation through the worker is the equivalent external write
 if(mutation==='worker')await f.client.terminate();
 if(mutation==='release')await f.call('release',{lease:f.lease.lease});
 if(mutation==='relocate'){await vfs.mkdir(path.join(f.root,'folder'));await f.host.foreground(async()=>{const scan=await f.host.store.discover('.');await f.host.store.relocate({operationId:crypto.randomUUID(),vault:'.',kind:'pair',source:'paper.mutable.json',destination:'folder/paper.mutable.json',baselines:scan.documents.map((d:any)=>({resourceId:d.resourceId,baseline:d.baseline}))});});}
 if(mutation==='pending'){f.pair.fault=async(stage:string)=>{if(stage==='after-native')throw Error('interrupted');};await f.pair.save(f.generation('partial'));}
 const result=await f.call('facts/batch',{scope:a.Data.scope,ids:[f.resourceId]});expect(result.Success).toBe(false);expect(result.coverage).toMatchObject({state:'unknown',complete:false});
});
it('restart and read-only hosts cannot trust durable rows without fresh validation',async()=>{
 const f=await fixture();expect((await f.begin()).Success).toBe(true);await f.host.close();
 const reader=new SqliteKnowledgeHost({root:f.root,readOnly:true});cleanup.push(()=>reader.close());const lease=await reader.acquire('.');expect(lease.coverage.complete).toBe(false);await expect(reader.knowledgeEvidence(lease.lease)).rejects.toThrow('unknown');
});
it('incomplete discovery, policy mismatch and request bounds fail explicitly',async()=>{
 const f=await fixture();const a=await f.begin();expect(a.Success).toBe(true);
 expect((await f.call('facts/batch',{scope:a.Data.scope,ids:Array.from({length:33},(_,i)=>String(i))})).Success).toBe(false);
 const mismatch=await f.call('facts/begin',{lease:f.lease.lease,vault:'.',signature:hash(JSON.stringify(await f.host.store.discover('.'))),policy:{version:1,opaqueTypes:['new']}});expect(mismatch.Success).toBe(false);
 await vfs.writeFile(path.join(f.root,'bad.mutable.json'),'malformed');expect((await f.begin()).Success).toBe(false);
});
it('cancelled worker queries leave SQL and another reader usable',async()=>{
 const f=await fixture(),proof=await f.host.knowledgeEvidence(f.lease.lease),scan=await f.host.store.discover('.'),row=scan.documents[0];
 const request={kind:'facts',revision:proof.revision,source:{resourceId:row.resourceId,path:row.location.filename,byteHash:row.baseline.nativeHash,policy:normalizePolicy(undefined)}};
 const c=new AbortController(),read=f.client.readKnowledge(request,c.signal);c.abort(Error('cancelled query'));await expect(read).rejects.toThrow(/cancel/);
 expect(await f.client.knowledgeRevision()).toBe(proof.revision);expect((await f.client.readKnowledge(request)).resourceId).toBe(row.resourceId);
 const a=await f.begin();expect((await f.call('facts/batch',{scope:a.Data.scope,ids:[f.resourceId]})).Success).toBe(true);
});
