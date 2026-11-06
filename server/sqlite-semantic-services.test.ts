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
it('identity resolution crosses HTTP and worker boundaries with atomic associations and recoverable receipts',async()=>{
 const f=await fixture(),s=await openSemanticServices({vault:'.'});cleanups.push(()=>s.dispose());
 const {identityResolutionService}=await import('../src/features/pipelines/identity-service');const api=identityResolutionService(s);
 const source={resourceId:uuid(),entityId:uuid(),revision:0,name:'Leonardo',typename:'Person',description:'Document description',aliases:['Leo'],enrichment:{subtypes:['Artist'],dates:[{type:'birth',startYear:1452,precision:'year'}]},provenance:{actor:'ai'}};
 const p=await api.preview(source);expect(p.entity).toBeNull();expect(p.association).toBeNull();
 const request={op:'identity-commit' as const,operationId:uuid(),associationId:uuid(),source,sourceFingerprint:p.sourceFingerprint,targetId:uuid(),expectedTargetRevision:null,expectedAssociationRevision:null,aliasSignature:p.aliasSignature,choices:{name:'import' as const,description:'import' as const,aliases:'merge' as const,typename:'import' as const,subtypes:'merge' as const,dates:'merge' as const,externalIds:'merge' as const},confirmation:true as const};
 const receipt=await api.commit(request);expect(receipt.entity.id).not.toBe(source.entityId);expect((receipt.entity.attributes as any)?.enrichment.dates[0].startYear).toBe(1452);expect(receipt.association.sourceEntityGuid).toBe(source.entityId);
 const recovered=await api.outcome(request.operationId);expect(recovered.status).toBe('committed');expect(recovered.result?.entity.id).toBe(receipt.entity.id);expect((await api.commit(request)).entity.id).toBe(receipt.entity.id);
 const subsequent=await api.preview(source);expect(subsequent.association?.guid).toBe(receipt.association.guid);expect(subsequent.entity?.id).toBe(receipt.entity.id);
 // The selector can recover the association without any saved Document marker or source-file read.
 const lookup=async(resourceId:string,entityId:string)=>{const r=await fetch('/api/sqlite/knowledge/entity-lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vault:'.',request:{op:'document-association',resourceId,entityId}})});const result=await r.json();expect(result.Success).toBe(true);return result.Data;};
 const associationLookup=await lookup(source.resourceId,source.entityId);expect(associationLookup.association.entityGuid).toBe(request.targetId);expect(associationLookup.entity.id).toBe(request.targetId);expect(associationLookup.vaultId).toBe(s.vaultGuid);
 expect((await lookup(uuid(),source.entityId)).association).toBeNull();expect((await lookup(source.resourceId,uuid())).association).toBeNull();
 await s.dispose();await f.host.close();
 const reader=new SqliteKnowledgeHost({root:f.root,readOnly:true});cleanups.push(()=>reader.close());const lease=await reader.openSemantics('.');await expect(reader.semantics({lease:lease.lease,vaultGuid:lease.vaultGuid,request})).rejects.toThrow(/read-only/);await reader.release(lease.lease);await reader.close();
 const disabled=new SqliteKnowledgeHost({root:f.root,pipelineManagerEnabled:false});cleanups.push(()=>disabled.close());const off=await disabled.openSemantics('.');await expect(disabled.semantics({lease:off.lease,vaultGuid:off.vaultGuid,request:{op:'identity-preview',source}})).rejects.toThrow(/disabled/);await disabled.release(off.lease);
});
it('Pipeline semantic opening reuses a warm Document extraction policy without replacing it',async()=>{
 const f=await fixture(),policy={version:1 as const,opaqueTypes:['application-block','timer-block']};
 const document=await f.host.acquire('.',policy);cleanups.push(()=>f.host.release(document.lease));const before=await f.host.status(document.lease);
 // IdentityPipeline opens semantic services without selecting an extraction profile.
 const services=await openSemanticServices({vault:'.'});cleanups.push(()=>services.dispose());
 expect(services.vaultGuid).toBe(document.vaultGuid);expect(await f.host.status(document.lease)).toEqual(before);
 const entity=uuid();await services.execute({recordType:'Entity',op:'create',id:entity,name:'Bologna',typename:'Place',operationId:uuid()});
 const result=await services.execute({recordType:'Entity',op:'search',query:'Bologna',stream:'all',match:'exact',operationId:uuid()}) as any;
 expect(result.matches).toEqual([expect.objectContaining({id:entity,name:'Bologna'})]);
 const same=await f.host.acquire('.',policy);expect(same.vaultGuid).toBe(document.vaultGuid);await f.host.release(same.lease);
 const explicit=await f.host.openSemantics('.',policy);await f.host.release(explicit.lease);
 // Explicit conflicting extraction requests must still fail, including through semantic-open.
 await expect(f.host.acquire('.',{version:1,opaqueTypes:[]})).rejects.toThrow(/policy differs/);
 const rejected=await fetch('/api/sqlite/knowledge/semantic-open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vault:'.',policy:{version:1,opaqueTypes:[]}})});
 expect((await rejected.json()).Error).toMatch(/policy differs/);
 await services.dispose();expect((await f.host.status(document.lease)).vaultGuid).toBe(document.vaultGuid);
});
