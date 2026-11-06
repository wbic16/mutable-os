import {it,expect,afterEach,vi} from 'vitest';
import express from 'express';
import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import {randomUUID as uuid,createHash} from 'node:crypto';
import {SqliteKnowledgeHost} from './sqlite-knowledge-host';
import {openSemanticServices} from '../src/application/semantic-services';
import {decodeBlockTree} from '../src/block-tree/codecs';
import {captureNative,nativeText} from '../src/persistence/native-resource';
import {testCavern} from '../src/knowledge-sqlite/phext-test-cavern.mjs';import {promises as vfs} from './phext-fs.mjs';
const cleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{try{for(const cleanup of cleanups.splice(0).reverse())await cleanup();}finally{vi.unstubAllGlobals();}});
async function fixture(options:Record<string,unknown>={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'semantic-host-')));cleanups.push(()=>fs.rm(root,{force:true,recursive:true}));const cavern=testCavern(root);cleanups.push(()=>cavern.close());
 const host=new SqliteKnowledgeHost({root,debounceMs:60000,...options});cleanups.push(()=>host.close());
 const app=express();app.use('/api/sqlite/knowledge',host.router());const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));cleanups.push(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
 const base='http://127.0.0.1:'+(server.address() as any).port,nativeFetch=globalThis.fetch;
 vi.stubGlobal('fetch',(url:any,opts:any)=>nativeFetch(typeof url==='string'&&url.startsWith('/')?base+url:url,opts));
 return {root,host};
}
it('typed application services cross the real HTTP/host/worker boundary, preserve authored values and audit durable outcomes',async()=>{
 const f=await fixture(),services=await openSemanticServices({vault:'.'});cleanups.push(()=>services.dispose());
 const entity=uuid();await services.execute({recordType:'Entity',op:'create',id:entity,name:'Source',typename:'Person',attributes:{raw:undefined},operationId:uuid()});
 await expect(services.execute({recordType:'Relationship',op:'create',id:uuid(),name:'Wrong type',operationId:uuid()})).rejects.toThrow(/record type/);
 const claim=uuid();await services.claims.create({guid:claim,kind:'Trait',expression:'characterized',participants:[{guid:uuid(),entityGuid:entity,role:'AccordingTo',ordinal:0}],operationId:uuid()});
 await services.qualifiers.add({guid:uuid(),claimGuid:claim,entityGuid:entity,role:'context',ordinal:0,expectedParentRevision:0,operationId:uuid()});
 expect((await services.claims.query({qualifiers:[{entityGuid:entity,role:'context'}]})).items).toHaveLength(1);
 const set1=uuid(),set2=uuid(),point=uuid();await services.dataSets.create({guid:set1,name:'One',operationId:uuid()});await services.dataSets.create({guid:set2,name:'Two',operationId:uuid()});
 const operationId=uuid(),creation={guid:point,name:null,value:{missing:undefined,negativeZero:-0,sourceString:'16'},operationId};const created=await services.dataPoints.create(creation);expect(created.record?.value).toEqual(creation.value);
 const membership=uuid();await services.memberships.add({guid:membership,dataSetGuid:set1,dataPointGuid:point,expectedDataSetRevision:0,operationId:uuid()});await services.memberships.add({guid:uuid(),dataSetGuid:set2,dataPointGuid:point,expectedDataSetRevision:0,operationId:uuid()});
 expect((await services.memberships.collections(point)).items).toHaveLength(2);expect((await services.dataPoints.count({dataSetGuids:[set1,set2]})).count).toBe(1);
 await services.memberships.remove({guid:membership,expectedRevision:0,expectedDataSetRevision:1,operationId:uuid()});expect((await services.dataPoints.get(point)).record?.revision).toBe(0);expect((await services.memberships.collections(point)).items).toHaveLength(1);
 expect((await services.audit.deliver()).delivered).toBeGreaterThan(0);expect((await services.audit.outcome(operationId)).delivery).toBe('delivered');expect((await services.dataPoints.create(creation)).record?.value).toEqual(creation.value);
 await expect(services.dataPoints.create({...creation,value:'changed'})).rejects.toThrow(/differs/);
 const ordinary=await f.host.acquire('.');await expect(f.host.semantics({lease:ordinary.lease,vaultGuid:ordinary.vaultGuid,request:{op:'current'}})).rejects.toThrow(/capability/);
 const explicit=await f.host.openSemantics('.');await expect(f.host.semantics({lease:explicit.lease,vaultGuid:uuid(),request:{op:'current'}})).rejects.toThrow(/identity/);await f.host.release(explicit.lease);await f.host.release(ordinary.lease);
});
it('minimal evidence resolves an exact synthetic native span and reports stale/missing/unverified generations',async()=>{
 const f=await fixture(),s=await openSemanticServices({vault:'.'});cleanups.push(()=>s.dispose());const resource=uuid(),block=uuid(),claim=uuid(),evidence=uuid();
 const property=uuid(),doc={id:resource,type:'main-list-block',children:[{id:block,type:'standoff-editor-block',text:'A😀 B.',standoffProperties:[{id:property,type:'style/emphasis',start:1,end:1,value:null}],blockProperties:[]}]};
 const bytes=nativeText(captureNative(decodeBlockTree(doc).state,resource));await vfs.writeFile(path.join(f.root,'synthetic.mutable.json'),bytes);const hash=createHash('sha256').update(bytes).digest('hex'),source={location:{folder:'.',filename:'synthetic.mutable.json'},byteHash:hash};
 await s.claims.create({guid:claim,expression:'synthetic assertion',operationId:uuid()});await s.evidence.attach({guid:evidence,claimGuid:claim,expectedParentRevision:0,resourceGuid:resource,blockGuid:block,authoredPropertyId:property,sourceContentHash:hash,startIndex:1,endIndex:2,coordinate:'cell',evidenceKind:'synthetic',excerpt:'😀',operationId:uuid()});
 expect((await s.evidence.resolve(evidence)).status).toBe('not-verified');const resolved=await s.evidence.resolve(evidence,source);expect(resolved.status).toBe('resolved');expect(resolved.excerpt).toBe('😀');
 const missingProperty=uuid();await s.evidence.attach({guid:missingProperty,claimGuid:claim,expectedParentRevision:1,resourceGuid:resource,blockGuid:block,authoredPropertyId:uuid(),sourceContentHash:hash,startIndex:1,endIndex:2,coordinate:'cell',evidenceKind:'synthetic',operationId:uuid()});expect((await s.evidence.resolve(missingProperty,source)).status).toBe('missing');
 const next=nativeText(captureNative(decodeBlockTree({...doc,children:[{...doc.children[0],text:'A😀 C.'}]}).state,resource));await vfs.writeFile(path.join(f.root,'synthetic.mutable.json'),next);
 expect((await s.evidence.resolve(evidence,{...source,byteHash:createHash('sha256').update(next).digest('hex')})).status).toBe('stale');
 await vfs.unlink(path.join(f.root,'synthetic.mutable.json'));expect(['missing','unresolved']).toContain((await s.evidence.resolve(evidence,source)).status);
 expect((await s.evidence.list(claim)).items[0].sourceContentHash).toBe(hash);
});
it('feature disabling/read-only leases reject writes and expired capabilities cannot be reused',async()=>{
 const f=await fixture({semanticServicesEnabled:false});await expect(openSemanticServices({vault:'.'})).rejects.toThrow(/disabled/);await expect(openSemanticServices({vault:'.',enabled:false})).rejects.toThrow(/disabled/);
 const writer=new SqliteKnowledgeHost({root:f.root,debounceMs:60000}),opened=await writer.openSemantics('.');await writer.release(opened.lease);await writer.close();
 const reader=new SqliteKnowledgeHost({root:f.root,readOnly:true});cleanups.push(()=>reader.close());const lease=await reader.openSemantics('.');await expect(reader.semantics({lease:lease.lease,vaultGuid:lease.vaultGuid,request:{recordType:'DataSet',op:'create',guid:uuid(),operationId:uuid()}})).rejects.toThrow(/read-only/);await reader.release(lease.lease);await expect(reader.semantics({lease:lease.lease,vaultGuid:lease.vaultGuid,request:{op:'current'}})).rejects.toThrow(/capability/);
});
