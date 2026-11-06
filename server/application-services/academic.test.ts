// @vitest-environment node
import {afterEach,describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';import {promises as vfs} from '../../server/phext-fs.mjs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {projectSaved} from '../../src/knowledge-sqlite/saved-projection';
import {decodeBlockTree} from '../../src/block-tree/codecs';
import {captureNative,nativeEnvelope} from '../../src/persistence/native-resource';
import {reconcile,baseline} from '../../src/knowledge-sqlite/reconcile.mjs';
import express from 'express';
import {SqliteKnowledgeHost} from '../sqlite-knowledge-host';
import {NodePreparationExecutor} from './executor';
import {applicationServiceRouter} from './http';
import {HttpApplicationServices} from '../../src/runtime/application-services';
import {AcademicService} from '../../src/application-services/academic-service';
import {normalizeScholarly} from '../../src/interchange/scholarly';
import {CavernJobStorage} from './job-storage';
import {createNativeDocumentStore} from '../native-document-store.mjs';
import {ManagedAssetStore} from '../managed-assets.mjs';import {testCavern} from '../../src/knowledge-sqlite/phext-test-cavern.mjs';
import {migrate,clearDerived,validateSchema,migrations} from '../../src/knowledge-sqlite/schema.mjs';
import {canonicalLedger} from '../../src/knowledge-sqlite/canonical-ledger.mjs';
import {canonicalEntities} from '../../src/knowledge-sqlite/entities.mjs';
import {extractPackageData} from '../../src/knowledge-sqlite/package-data.mjs';
const disposals:Array<()=>Promise<void>|void>=[];afterEach(async()=>{for(const f of disposals.splice(0).reverse())await f();});
async function fixture(realHost=false){
 const root=await mkdtemp(path.join(tmpdir(),'academic-'));let cavernId=randomUUID();disposals.push(()=>rm(root,{recursive:true,force:true}));const cavern=testCavern(root);disposals.push(()=>cavern.close());
 const host=realHost?new SqliteKnowledgeHost({root,entitiesEnabled:true}):undefined;const executor=realHost?new NodePreparationExecutor():undefined;
 if(host){disposals.push(()=>host.close());cavernId=(await host.establish('.')).vaultGuid;}if(executor)disposals.push(()=>executor.close());
 const db=new Database(path.join(root,'canonical.db'));migrate(db,'mutable',{fresh:true,vaultGuid:cavernId});const audit=new Database(':memory:');migrate(audit,'audit',{fresh:true,vaultGuid:cavernId});const ledger=canonicalLedger(db,()=>audit);disposals.push(()=>{db.close();audit.close();});
 const jobs=new CavernJobStorage(root,cavernId),assets=new ManagedAssetStore({root,cavernId,session:'test'});disposals.push(async()=>{await jobs.close();await assets.close();});
 let fetches=0,failAfterCommit=false;const original=new TextEncoder().encode(JSON.stringify({message:{DOI:'10.1234/test',type:'journal-article',title:['Fixture work'],author:[{family:'Smith'}]}}));
 const ports:any={cavernId,jobs,uuid:randomUUID,now:()=>new Date().toISOString(),executor:executor??{run:async (t:any)=>({kind:'academic-normalize',metadata:normalizeScholarly(t.provider,t.doi,t.bytes)})},
  acquire:async()=>{fetches++;return {provider:'crossref',endpoint:'https://api.crossref.org/works/10.1234%2Ftest',bytes:original};},
  retain:async bytes=>{const l=await assets.begin();const a=await assets.stage(l,Buffer.from(bytes),{mediaType:'application/json'});await assets.publish(l);await assets.finish(l,'fixture');return {kind:'managed',cavernId,assetId:a.assetId};},
  verify:async a=>{await assets.get(a.assetId,cavernId);},
  knowledge:async request=>{const r=host?await host.academic(request):canonicalEntities(db,request,()=>{},ledger);if(request.op==='scholarly-commit'&&failAfterCommit){failAfterCommit=false;throw Error('Lost commit acknowledgement');}return r;}
 };
 const service=new AcademicService(ports);disposals.push(()=>service.close());
 return {root,db,audit,ledger,jobs,assets,ports,service,original,host,get fetches(){return fetches;},fail:()=>{failAfterCommit=true;}};
}
describe('academic durable workflow and canonical identities',()=>{
 it('serializes repeated/concurrent imports into one canonical identity and reopens offline',async()=>{
  const f=await fixture(),ids=[randomUUID(),randomUUID()];const results=await Promise.all(ids.map(id=>f.service.call('academic.import',{id,source:'https://doi.org/10.1234/TEST'})));
  expect(results[0].citation).toEqual(results[1].citation);expect(f.fetches).toBe(1);expect(f.db.prepare('SELECT count(*) n FROM Entity').get().n).toBe(1);
  const stored=await f.assets.get(results[0].citation.asset.assetId,f.ports.cavernId);expect(new Uint8Array(stored.bytes)).toEqual(f.original);
  await f.service.close();const reopened=new AcademicService({...f.ports,acquire:async()=>{throw Error('offline');}});disposals.push(()=>reopened.close());
  const next=await reopened.call('academic.import',{id:randomUUID(),source:'10.1234/test'});expect(next.citation.entityId).toBe(results[0].citation.entityId);
 });
 it('crosses typed HTTP, real preparation worker and Vault SQLite host boundaries',async()=>{
  const f=await fixture(true),app=express();app.use('/api/services',applicationServiceRouter(f.service as any,f.ports.cavernId,false,true));app.use('/native',createNativeDocumentStore({root:f.root}).router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));disposals.push(()=>new Promise<void>(r=>server.close(()=>r())));
  const origin='http://127.0.0.1:'+(server.address() as any).port;
  const client=new HttpApplicationServices(()=>({cavernId:f.ports.cavernId,session:'fixture'}),((url:any,init:any)=>fetch(origin+url,init)) as any);
  const result=await client.call('academic.import',{id:randomUUID(),source:'https://doi.org/10.1234/TEST'});expect(result.citation.metadata.title).toBe('Fixture work');
  expect((await f.host!.academic({op:'scholarly-lookup',doi:'10.1234/test'})).citation.entityId).toBe(result.citation.entityId);
  expect(await vfs.stat(path.join(f.root,'citation.ink')).catch(()=>null)).toBeNull();
  const resourceId=randomUUID(),dto={id:resourceId,type:'document-block',children:[{id:randomUUID(),type:'mutable/citation-block',citation:result.citation,sourceUrl:'https://doi.org/10.1234/TEST',blockProperties:[{id:randomUUID(),type:'codex/entity-reference',value:result.citation.entityId}]}]};
  const native=JSON.stringify(nativeEnvelope(captureNative(decodeBlockTree(dto).state,resourceId)));
  const saved=await (await fetch(origin+'/native/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:{folder:'.',filename:'citation.ink'},generation:{resourceId,generation:randomUUID(),native},baseline:{nativeHash:null,markdownHash:null,generation:null}})})).json();
  expect(saved.Data?.result.phase,JSON.stringify(saved)).toBe('saved');expect(await vfs.readFile(path.join(f.root,'citation.ink'),'utf8')).toBe(native);expect(await vfs.stat(path.join(f.root,'citation.md')).catch(()=>null)).toBeNull();
  await expect(client.call('academic.import',{id:randomUUID(),source:'file:///etc/passwd'})).rejects.toThrow('DOI');
  await expect(client.call('academic.import',{id:randomUUID(),source:'10.1234/test',sql:'SELECT 1'} as any)).rejects.toThrow('fields');
  await expect(f.host!.entities({request:{op:'scholarly-commit'}})).rejects.toThrow('scoped academic');
 });
 it('converges concurrent independent service hosts through the unique DOI key',async()=>{
  const f=await fixture(),other=new AcademicService(f.ports);disposals.push(()=>other.close());
  const [a,b]=await Promise.all([f.service.call('academic.import',{id:randomUUID(),source:'10.1234/test'}),other.call('academic.import',{id:randomUUID(),source:'https://doi.org/10.1234/TEST'})]);
  expect(a.citation.entityId).toBe(b.citation.entityId);expect(f.db.prepare('SELECT count(*) n FROM ExternalIdentity').get().n).toBe(1);expect(f.db.prepare('SELECT count(*) n FROM SourceSnapshot').get().n).toBe(1);
 });
 it('rolls back identity, entity and snapshot together when a canonical transaction fails',async()=>{
  const f=await fixture();let captured:any;const knowledge=f.ports.knowledge;f.ports.knowledge=async request=>{if(request.op==='scholarly-commit'){captured=request;throw Error('before dispatch');}return knowledge(request);};
  await expect(f.service.call('academic.import',{id:randomUUID(),source:'10.1234/test'})).rejects.toThrow('before dispatch');
  let checks=0;expect(()=>canonicalEntities(f.db,captured,()=>{if(++checks===5)throw Error('interrupted transaction');},f.ledger)).toThrow('interrupted transaction');
  for(const table of ['Entity','ExternalIdentity','SourceSnapshot','PendingAuditMutation'])expect(f.db.prepare('SELECT count(*) n FROM '+table).get().n).toBe(0);
 });
 it('recovers an acknowledged-lost canonical commit without another fetch or entity',async()=>{
  const f=await fixture(),id=randomUUID();f.fail();await expect(f.service.call('academic.import',{id,source:'10.1234/test'})).rejects.toThrow('Lost commit');
  expect((await f.jobs.load(id)).summary.state).toBe('failed');expect((await f.service.call('academic.inspect',{id})).source).toBe('10.1234/test');await f.service.close();
  const resumed=new AcademicService(f.ports);disposals.push(()=>resumed.close());const r=await resumed.call('academic.resume',{id});expect(r.citation.metadata.title).toBe('Fixture work');expect(f.fetches).toBe(1);expect(f.db.prepare('SELECT count(*) n FROM Entity').get().n).toBe(1);
  await expect(resumed.call('academic.import',{id,source:'10.1234/other'})).rejects.toThrow('different input');
 });
 it('does not commit a cancelled acquisition and records a resumable job',async()=>{
  const f=await fixture(),controller=new AbortController(),id=randomUUID();f.ports.acquire=async()=>{controller.abort();return {provider:'crossref',endpoint:'fixture',bytes:f.original};};
  await expect(f.service.call('academic.import',{id,source:'10.1234/test'},controller.signal)).rejects.toThrow();expect(f.db.prepare('SELECT count(*) n FROM Entity').get().n).toBe(0);expect((await f.jobs.load(id)).summary.state).toBe('cancelled');
 });
 it('rebuilds derived data without losing identity, and archives the canonical slice',async()=>{
  const f=await fixture(),{citation:c}=await f.service.call('academic.import',{id:randomUUID(),source:'10.1234/test'});
  const documents=new Map<string,Uint8Array>();
  for(const doc of ['doc-a','doc-b']){
   const dto={id:doc,type:'document-block',children:[{id:doc+'-citation',type:'mutable/citation-block',citation:c,sourceUrl:'10.1234/test',blockProperties:[{id:randomUUID(),type:'codex/entity-reference',value:c.entityId}]}]};
   documents.set(doc,new TextEncoder().encode(JSON.stringify(nativeEnvelope(captureNative(decodeBlockTree(dto).state,doc)))));
  }
  const rebuild=async()=>{for(const [doc,bytes]of documents){const projection=await projectSaved(bytes,f.ports.cavernId);reconcile(f.db,projection,{path:doc+'.ink',contentHash:projection.contentHash},baseline(f.db,doc));}};
  await rebuild();expect((await f.service.call('academic.backlinks',{entityId:c.entityId})).rows).toHaveLength(2);
  clearDerived(f.db);expect((await f.service.call('academic.backlinks',{entityId:c.entityId})).rows).toHaveLength(0);
  await rebuild();expect((await f.service.call('academic.backlinks',{entityId:c.entityId})).rows).toHaveLength(2);
  expect(canonicalEntities(f.db,{op:'scholarly-lookup',doi:'10.1234/test'},()=>{},f.ledger).citation.entityId).toBe(c.entityId);
  const data=extractPackageData(f.db,{entities:[c.entityId]});for(const t of ['Entity','ExternalIdentity','SourceSnapshot'])expect(data.data.tables.find(r=>r.name===t).rows).toHaveLength(1);
  f.ledger.deliver();expect(f.audit.prepare("SELECT count(*) n FROM AuditEvent WHERE recordType IN ('ExternalIdentity','SourceSnapshot')").get().n).toBe(2);
 });
 it('upgrades schema 2 transactionally without changing existing Entity identities',()=>{
  const db=new Database(':memory:');try{migrate(db,'mutable',{fresh:true,steps:migrations.mutable.slice(0,2)});db.prepare('INSERT INTO Entity(guid,name,nameKey) VALUES(?,?,?)').run('existing','Name','name');migrate(db,'mutable');expect(validateSchema(db,'mutable').version).toBe(migrations.mutable.length);expect(db.prepare('SELECT guid FROM Entity').get().guid).toBe('existing');expect(db.pragma('foreign_key_check')).toEqual([]);}finally{db.close();}
 });
});
