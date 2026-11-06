import express from 'express';
import {SqliteKnowledgeHost} from '../sqlite-knowledge-host';
import {applicationServiceRouter} from './http';
import {HttpApplicationServices} from '../../src/runtime/application-services';
import {entityCommand} from '../../src/knowledge-sqlite/entities.mjs';
// @vitest-environment node
import {afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {migrate,migrations,clearDerived,validateSchema} from '../../src/knowledge-sqlite/schema.mjs';
import {canonicalLedger} from '../../src/knowledge-sqlite/canonical-ledger.mjs';
import {canonicalEntities} from '../../src/knowledge-sqlite/entities.mjs';
import {canonicalSemantics} from '../../src/knowledge-sqlite/semantics.mjs';
import {extractPackageData} from '../../src/knowledge-sqlite/package-data.mjs';
import {EncyclopediaService} from '../../src/application-services/encyclopedia-service';
import {CavernJobStorage} from './job-storage';
import {NodePreparationExecutor} from './executor';
import {ManagedAssetStore} from '../managed-assets.mjs';import {testCavern} from '../../src/knowledge-sqlite/phext-test-cavern.mjs';
import {wikiFixture,wdFixture} from '../../src/interchange/encyclopedia-fixtures';
import type {ArticleCapture,EnrichmentCapture} from '../../src/interchange/encyclopedia';
vi.setConfig({testTimeout:20000});
const clean:Array<()=>any>=[];afterEach(async()=>{for(const f of clean.splice(0).reverse())await f();});
async function fixture(realHost=false){
 const root=await mkdtemp(path.join(tmpdir(),'encyclopedia-'));let cavernId=randomUUID();clean.push(()=>rm(root,{recursive:true,force:true}));const cavern=testCavern(root);clean.push(()=>cavern.close());
 const host=realHost?new SqliteKnowledgeHost({root,entitiesEnabled:true}):undefined;if(host){clean.push(()=>host.close());cavernId=(await host.establish('.')).vaultGuid;}
 const db=new Database(':memory:'),audit=new Database(':memory:');migrate(db,'mutable',{fresh:true,vaultGuid:cavernId});migrate(audit,'audit',{fresh:true,vaultGuid:cavernId});clean.push(()=>{db.close();audit.close();});const ledger=canonicalLedger(db,()=>audit);
 const jobs=new CavernJobStorage(root,cavernId),assets=new ManagedAssetStore({root,cavernId,session:'fixture'}),executor=new NodePreparationExecutor();clean.push(()=>jobs.close(),()=>assets.close(),()=>executor.close());let fetches=0,fail=false;
 const ports={cavernId,jobs,executor,uuid:randomUUID,now:()=>new Date().toISOString(),
  acquire:async(source:any)=>{fetches++;return typeof source==='string'?{endpoint:'https://www.wikidata.org/wiki/Special:EntityData/Q42.json',responses:[wdFixture()]}:{endpoint:`https://${source.site}/w/api.php`,responses:wikiFixture(source.site).responses};},
  retain:async(bytes:Uint8Array)=>{const l=await assets.begin(),a=await assets.stage(l,Buffer.from(bytes),{mediaType:'application/json'});await assets.publish(l);await assets.finish(l,'wiki-test');return {kind:'managed' as const,cavernId,assetId:a.assetId};},
  original:async(a:any)=>new Uint8Array((await assets.get(a.assetId,cavernId)).bytes),
  knowledge:async(r:any)=>{const result=host?await host.academic(r):canonicalEntities(db,r,()=>{},ledger);if(r.op==='wiki-commit'&&fail){fail=false;throw Error('lost acknowledgement');}return result;}
 };
 const service=new EncyclopediaService(ports);clean.push(()=>service.close());const article=()=>service.call('encyclopedia.import',{id:randomUUID(),source:'https://en.wikipedia.org/wiki/Redirect'});
 return {db,ledger,audit,service,ports,jobs,article,host,get fetches(){return fetches;},fail:()=>fail=true};
}
describe('encyclopedia durable capture and reviewed knowledge',()=>{
 it('deduplicates article revisions and shares only the subject across language editions',async()=>{
  const f=await fixture(),other=new EncyclopediaService(f.ports);clean.push(()=>other.close());const [a,b]=await Promise.all([f.article(),other.call('encyclopedia.import',{id:randomUUID(),source:'https://en.wikipedia.org/wiki/Redirect'})]);expect(a.snapshot.snapshotId).toBe(b.snapshot.snapshotId);expect(a.snapshot.entityId).not.toBe(a.snapshot.subjectId);
  const fr=await f.service.call('encyclopedia.import',{id:randomUUID(),source:'https://fr.wikipedia.org/wiki/Douglas_Adams'});expect(fr.snapshot.entityId).not.toBe(a.snapshot.entityId);expect(fr.snapshot.subjectId).toBe(a.snapshot.subjectId);
  expect(f.db.prepare("SELECT count(*) n FROM ExternalIdentity WHERE namespace='wikidata'").get().n).toBe(1);
  expect(await f.ports.original(a.snapshot.assets[1])).toEqual(wikiFixture().responses[1]);
 });
 it('offers claims without accepting, retains conflicting authored facts, and records explicit reviews',async()=>{
  const f=await fixture(),a=await f.article(),id=randomUUID();
  canonicalSemantics(f.db,f.ledger,{op:'create',recordType:'Claim',operationId:randomUUID(),guid:id,expression:'Authored contrary occupation',typename:'authored',participants:[{guid:randomUUID(),entityGuid:a.snapshot.subjectId,role:'subject',ordinal:0}]});
  const c=await f.service.call('encyclopedia.enrich',{id:randomUUID(),snapshotId:a.snapshot.snapshotId});expect(c.existingClaims[0].guid).toBe(id);expect(f.db.prepare('SELECT count(*) n FROM Claim').get().n).toBe(1);
  const input={operationId:randomUUID(),snapshotId:c.snapshot.snapshotId,statementId:'Q42$one',decision:'accepted' as const};const r=await f.service.call('encyclopedia.review',input);expect((await f.service.call('encyclopedia.review',input)).claimGuid).toBe(r.claimGuid);
  const claim=f.db.prepare('SELECT * FROM Claim WHERE guid=?').get(r.claimGuid);const attrs=JSON.parse(claim.attributes);expect(attrs).toMatchObject({origin:'source-imported',reviewStatus:'accepted',sourceSnapshotId:c.snapshot.snapshotId,revision:456,rank:'normal'});expect(attrs.qualifiers.P580).toHaveLength(1);expect(attrs.references).toHaveLength(1);
  await f.service.call('encyclopedia.review',{operationId:randomUUID(),snapshotId:c.snapshot.snapshotId,statementId:'Q42$two',decision:'rejected'});expect(f.db.prepare('SELECT count(*) n FROM Claim').get().n).toBe(2);expect(f.db.prepare('SELECT expression FROM Claim WHERE guid=?').get(id).expression).toBe('Authored contrary occupation');
  await expect(f.service.call('encyclopedia.review',{operationId:randomUUID(),snapshotId:c.snapshot.snapshotId,statementId:'Q42$unsupported',decision:'accepted'})).rejects.toThrow('cannot');
  expect(f.fetches).toBe(2);clearDerived(f.db);expect(f.db.prepare('SELECT count(*) n FROM SourceSnapshot').get().n).toBe(2);
  const pkg=extractPackageData(f.db,{entities:[c.snapshot.entityId],claims:true});expect(pkg.data.tables.find(t=>t.name==='SourceClaimReview').rows).toHaveLength(1);expect(pkg.data.tables.find(t=>t.name==='SourceSnapshot').rows.length).toBeGreaterThan(0);
  f.ledger.deliver();expect(f.audit.prepare("SELECT count(*) n FROM AuditEvent WHERE recordType='SourceClaimReview'").get().n).toBe(2);
 });
 it('resumes a lost canonical acknowledgement without reacquisition and can replay completed results offline',async()=>{
  const f=await fixture(),id=randomUUID();f.fail();await expect(f.service.call('encyclopedia.import',{id,source:'https://en.wikipedia.org/wiki/Redirect'})).rejects.toThrow('lost acknowledgement');await f.service.close();
  const observed=await f.jobs.load(id);await f.jobs.checkpoint({...observed,summary:{...observed.summary,state:'running'}},observed.summary.revision);
  const next=new EncyclopediaService({...f.ports,acquire:async()=>{throw Error('offline');}});clean.push(()=>next.close());expect((await next.call('encyclopedia.inspect',{id})).job.state).toBe('interrupted');const r=await next.call('encyclopedia.resume',{id}) as ArticleCapture;expect(r.projection.title).toBe('Douglas Adams');expect(f.fetches).toBe(1);expect((await next.call('encyclopedia.resume',{id}) as ArticleCapture).snapshot.snapshotId).toBe(r.snapshot.snapshotId);
 });
 it('cancels acquisition without a canonical publication',async()=>{
  const f=await fixture(),c=new AbortController(),id=randomUUID();f.ports.acquire=async()=>{c.abort();return {endpoint:'fixture',responses:wikiFixture().responses};};await expect(f.service.call('encyclopedia.import',{id,source:'https://en.wikipedia.org/wiki/A'},c.signal)).rejects.toThrow();expect(f.db.prepare('SELECT count(*) n FROM Entity').get().n).toBe(0);expect((await f.jobs.load(id)).summary.state).toBe('cancelled');
 });
 it('rolls back review and Claim creation together on an interrupted transaction',async()=>{
  const f=await fixture(),a=await f.article(),c=await f.service.call('encyclopedia.enrich',{id:randomUUID(),snapshotId:a.snapshot.snapshotId});let calls=0;
  expect(()=>canonicalEntities(f.db,{op:'wiki-review',operationId:randomUUID(),snapshotId:c.snapshot.snapshotId,decision:'accepted',statement:c.projection.statements.find(s=>s.id==='Q42$one')},()=>{if(++calls===6)throw Error('interrupted');},f.ledger)).toThrow('interrupted');expect(f.db.prepare('SELECT count(*) n FROM Claim').get().n).toBe(0);expect(f.db.prepare('SELECT count(*) n FROM SourceClaimReview').get().n).toBe(0);
 });
 it('uses typed HTTP and the real Vault host, and rejects ingestion through semantic authoring',async()=>{
  const f=await fixture(true),app=express();app.use('/api/services',applicationServiceRouter(f.service as any,f.ports.cavernId,false,true));const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));clean.push(()=>new Promise<void>(r=>server.close(()=>r())));const origin='http://127.0.0.1:'+(server.address() as any).port;
  const client=new HttpApplicationServices(()=>({cavernId:f.ports.cavernId,session:'fixture'}),((u:any,i:any)=>fetch(origin+u,i)) as any);
  const a=await client.call('encyclopedia.import',{id:randomUUID(),source:'https://en.wikipedia.org/wiki/Redirect'});expect(a.snapshot.subjectId).toBeTruthy();
  const c=await client.call('encyclopedia.enrich',{id:randomUUID(),snapshotId:a.snapshot.snapshotId});expect((await client.call('encyclopedia.review',{operationId:randomUUID(),snapshotId:c.snapshot.snapshotId,statementId:'Q42$one',decision:'accepted'})).claimGuid).toBeTruthy();
  await expect(client.call('encyclopedia.import',{id:randomUUID(),source:'file:///etc/passwd'})).rejects.toThrow('Wikipedia');await expect(client.call('encyclopedia.import',{id:randomUUID(),source:'https://en.wikipedia.org/wiki/A',sql:'SELECT 1'} as any)).rejects.toThrow('fields');
  for(const op of ['wiki-commit','wiki-review','scholarly-commit'])expect(()=>entityCommand({recordType:'Entity',op})).toThrow('scoped academic');
  await expect(f.host!.entities({request:{op:'wiki-review'}})).rejects.toThrow('scoped academic');
 });
 it('preserves DOI identities and original captures through schema 3 to 4',()=>{
  const db=new Database(':memory:');try{migrate(db,'mutable',{fresh:true,steps:migrations.mutable.slice(0,3)});const e=randomUUID(),i=randomUUID(),s=randomUUID();db.prepare('INSERT INTO Entity(guid,name,nameKey) VALUES(?,?,?)').run(e,'Old','old');db.prepare('INSERT INTO ExternalIdentity(guid,entityGuid,resourceGuid,namespace,externalKey,attributes) VALUES(?,?,?,?,?,?)').run(i,e,randomUUID(),'doi','10.1234/old','{}');db.prepare('INSERT INTO SourceSnapshot(guid,identityGuid,attributes) VALUES(?,?,?)').run(s,i,'{"original":true}');migrate(db,'mutable');expect(validateSchema(db,'mutable').version).toBe(7);expect(db.prepare('SELECT attributes FROM SourceSnapshot WHERE guid=?').get(s).attributes).toBe('{"original":true}');expect(db.pragma('foreign_key_check')).toEqual([]);}finally{db.close();}
 });
});
