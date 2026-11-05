// @vitest-environment node
import {it,expect,afterEach} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import express from 'express';import sharp from 'sharp';
import {CavernJobStorage} from './job-storage';
import {NodePreparationExecutor} from './executor';
import {createApplicationServiceHost} from './host';
import {createNativeDocumentStore} from '../native-document-store.mjs';
import {ManagedAssetStore} from '../managed-assets.mjs';
import {SqliteKnowledgeHost} from '../sqlite-knowledge-host';
import {ApplicationService} from '../../src/application-services/service';
import {HttpApplicationServices} from '../../src/runtime/application-services';
import {openPackage} from '../../src/interchange/package/format';
import {decodeNative,captureNative,nativeText} from '../../src/persistence/native-resource';
import {packageFragment,materializePackage} from '../../src/interchange/package/native';
import {closeFilesystemWorkers} from '../../scripts/stage-c-gates/filesystem.mjs';
import {promises as vfs} from '../phext-fs.mjs';
import {testCavern} from '../../src/knowledge-sqlite/phext-test-cavern.mjs';
const disposers:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of disposers.splice(0).reverse())await fn();await closeFilesystemWorkers();});
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
async function root(){const p=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'application-services-')));disposers.push(()=>fs.rm(p,{recursive:true,force:true}));const cavern=testCavern(p);disposers.push(()=>cavern.close());return p;}
async function fixture(){
 const dir=await root(),sql=new SqliteKnowledgeHost({root:dir,entitiesEnabled:true});disposers.push(()=>sql.close());
 const established=await sql.establish('.'),cavernId=established.vaultGuid;
 const assets=new ManagedAssetStore({root:dir,cavernId,session:'test'});disposers.push(()=>assets.close());
 const host=createApplicationServiceHost({root:dir,cavernId,nativeEnabled:true,assets:()=>assets,knowledge:(request,signal)=>sql.entityLookup({vault:'.',request},signal,true)});disposers.push(()=>host.close());
 const app=express();app.use('/services',host.router);app.use('/native',createNativeDocumentStore({root:dir}).router);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));disposers.push(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const call=async(action:string,body:unknown)=>{const r=await fetch(url+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();};
 const client=new HttpApplicationServices(()=>({cavernId,session:'test'}),((urlPart:any,options:any)=>fetch(url+String(urlPart).replace('/api',''),options)) as typeof fetch);
 return {dir,host,sql,assets,call,client,cavernId};
}
const conversion={kind:'convert' as const,format:'markdown' as const,source:'# Heading\n\nA **strong** word.'};
it('executes a durable semantic conversion through HTTP, retaining input and result across host replacement',async()=>{
 const f=await fixture(),id=randomUUID();const created=await f.client.call('jobs.create',{id,preparation:conversion});
 expect(created.state).toBe('ready');expect((await f.client.call('jobs.create',{id,preparation:conversion})).revision).toBe(0);
 const done=await f.client.call('jobs.run',{id,expectedRevision:created.revision});expect(done.state).toBe('completed');
 const result=await f.client.call('jobs.result',{id});expect(result.kind).toBe('convert');if(result.kind==='convert')expect(JSON.stringify(result.fragment)).toContain('style/bold');
 expect((await f.client.call('jobs.list',{})).jobs.map(j=>j.id)).toContain(id);
 const reopened=new CavernJobStorage(f.dir,f.cavernId);disposers.push(()=>reopened.close());expect((await reopened.load(id)).summary).toEqual(done);
 expect(await vfs.readdir(f.dir)).not.toContain('document.ink');expect(f.host.executor.status).toEqual({active:0,queued:0,bytes:0});
 await expect(f.client.call('jobs.create',{id,preparation:{...conversion,source:'different'}})).rejects.toThrow('different input');
});
it('reuses native writer bytes, original managed images and transactional package data in the package executor',async()=>{
 const f=await fixture(),native=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8'),resourceId=JSON.parse(native).resourceId,location={folder:'.',filename:'saved.ink'};
 const saved=await f.call('/native/save',{location,generation:{resourceId,generation:randomUUID(),native},baseline:{nativeHash:null,markdownHash:null,generation:null}});expect(saved.Data.result.phase).toBe('saved');
 const read=await f.client.call('native.read',{location});expect(read.native).toBe(native);expect(read.sha256).toBe(sha(native));
 const image=await sharp({create:{width:3,height:2,channels:4,background:'#b07080'}}).png().toBuffer();const lease=await f.assets.begin();
 const manifest=await f.assets.stage(lease,image,{mediaType:'image/png',width:3,height:2});await f.assets.publish(lease);await f.assets.finish(lease,'fixture');
 const original=await f.client.call('assets.original',{assetId:manifest.assetId});expect(Buffer.from(original.bytes)).toEqual(image);
 const knowledge=await f.client.call('knowledge.packageData',{entities:[],documentHash:read.sha256});expect(knowledge.data.encoding).toBe('sqlite-storage-class-v1');
 const id=randomUUID(),created=await f.client.call('jobs.create',{id,preparation:{kind:'package',document:{location,expectedHash:read.sha256},knowledge:{}}});
 const done=await f.client.call('jobs.run',{id,expectedRevision:created.revision});expect(done.state,done.error).toBe('completed');
 const result=await f.client.call('jobs.result',{id});expect(result.kind).toBe('package');if(result.kind==='package'){const opened=await openPackage(result.bytes);expect(opened.snapshot.resourceId).toBe(resourceId);expect(opened.data.encoding).toBe('sqlite-storage-class-v1');}
 expect(await vfs.readFile(path.join(f.dir,'saved.ink'),'utf8')).toBe(native);expect(await vfs.stat(path.join(f.dir,'saved.md')).catch(()=>null)).toBeNull();
 await expect(f.client.call('native.read',{location,expectedHash:'0'.repeat(64)})).rejects.toThrow('changed');
});
it('rejects filesystem, SQL, foreign operation fields, symlinks and oversized input before preparation',async()=>{
 const f=await fixture();for(const location of [{folder:'..',filename:'a.ink'},{folder:'.mutable',filename:'mutable.db'},{folder:'.',filename:'../a.ink'},{folder:'/tmp',filename:'a.ink'}])await expect(f.client.call('native.read',{location})).rejects.toThrow();
 await expect(f.client.call('knowledge.packageData',{entities:[],sql:'DROP TABLE Entity'} as any)).rejects.toThrow('fields');
 await expect(f.client.call('assets.original',{assetId:'../../private'})).rejects.toThrow('identity');
 await expect(f.client.call('jobs.create',{id:randomUUID(),preparation:{...conversion,source:'x'.repeat(200001)}})).rejects.toThrow('limits');
 await fs.symlink(await root(),path.join(f.dir,'outside'));await expect(f.client.call('native.read',{location:{folder:'outside',filename:'secret.ink'}})).rejects.toThrow();
 expect(f.host.executor.status.active).toBe(0);
});
for(const faultAt of ['staged','published'])it(`reconciles journal interruption at ${faultAt} without replay or duplicate identity`,async()=>{
 const dir=await root(),id=randomUUID();let fail=true;const store=new CavernJobStorage(dir,'cavern',async at=>{if(fail&&at===faultAt){fail=false;throw Error('crash');}});disposers.push(()=>store.close());
 await expect(store.create(id,conversion)).rejects.toThrow('crash');const next=new CavernJobStorage(dir,'cavern');disposers.push(()=>next.close());
 const created=await next.create(id,conversion);expect(created.summary.state).toBe('ready');expect((await next.load(id)).preparation).toEqual(conversion);
 const active=await next.checkpoint({...created,summary:{...created.summary,state:'running'}},0);
 const service=new ApplicationService({cavernId:'cavern',jobs:next,executor:new NodePreparationExecutor(),readNative:async()=>{throw Error('unused');},originalAsset:async()=>{throw Error('unused');},packageData:async()=>{throw Error('unused');}});disposers.push(()=>service.close());
 const inspected=await service.call('jobs.inspect',{id});expect(inspected.state).toBe('interrupted');expect(inspected.revision).toBe(active.summary.revision+1);
 await expect(service.call('jobs.run',{id,expectedRevision:0})).rejects.toThrow('revision');
 const done=await service.call('jobs.run',{id,expectedRevision:inspected.revision});expect(done.state).toBe('completed');
});
it('enforces filesystem execution locks, checkpoint CAS, Cavern identity and result integrity',async()=>{
 const dir=await root(),a=new CavernJobStorage(dir,'cavern'),b=new CavernJobStorage(dir,'cavern');disposers.push(()=>a.close(),()=>b.close());const id=randomUUID(),r=await a.create(id,conversion);
 const lease=await a.acquire(id);try{await expect(b.acquire(id)).rejects.toThrow('another host');}finally{await lease.close();}
 await a.checkpoint({...r,summary:{...r.summary,state:'cancelled'}},0);await expect(b.checkpoint(r,0)).rejects.toThrow('conflict');
 const other=new CavernJobStorage(dir,'foreign');disposers.push(()=>other.close());await expect(other.load(id)).rejects.toThrow('evidence');
 const result=await a.putResult(id,new Uint8Array([1,2,3]));await vfs.writeFile(path.join(dir,'.mutable/jobs',id,result.file),Buffer.from([3,2,1]));await expect(a.readResult(id,result)).rejects.toThrow('integrity');
});
it('bounds active/queued workers and cancels queued and running CPU work without leaks',async()=>{
 const dir=await root(),worker=path.join(dir,'spin.mjs');await fs.writeFile(worker,"import {parentPort} from 'node:worker_threads';parentPort.once('message',()=>{while(true){}})");
 const executor=new NodePreparationExecutor(30000,worker);disposers.push(()=>executor.close());const first=new AbortController(),queued=new AbortController();
 const a=executor.run(conversion,first.signal).catch(e=>e.message),b=executor.run(conversion,queued.signal).catch(e=>e.message),c=executor.run(conversion).catch(e=>e.message);
 await expect(executor.run(conversion)).rejects.toThrow('queue');expect(executor.status).toMatchObject({active:1,queued:2});
 queued.abort();expect(await b).toMatch(/cancelled/);first.abort();expect(await a).toMatch(/cancelled/);await executor.close();expect(await c).toMatch(/closed/);expect(executor.status).toEqual({active:0,queued:0,bytes:0});
 const deadline=new NodePreparationExecutor(30,worker);disposers.push(()=>deadline.close());await expect(deadline.run(conversion)).rejects.toThrow('deadline');expect(deadline.status.active).toBe(0);
});
it('cancels service work and retains a durable cancelled outcome without a completed artifact',async()=>{
 const f=await fixture(),id=randomUUID(),r=await f.client.call('jobs.create',{id,preparation:conversion});
 expect((await f.client.call('jobs.cancel',{id})).state).toBe('cancelled');await expect(f.client.call('jobs.run',{id,expectedRevision:r.revision+1})).rejects.toThrow('resumable');await expect(f.client.call('jobs.result',{id})).rejects.toThrow('completed');
});
it('packages referenced images once with original bytes and rejects stale saved input on resume',async()=>{
 const f=await fixture(),bytes=await sharp({create:{width:2,height:2,channels:3,background:'#307080'}}).jpeg().toBuffer(),lease=await f.assets.begin();
 const reference=await f.assets.stage(lease,bytes,{mediaType:'image/jpeg',width:2,height:2});await f.assets.publish(lease);await f.assets.finish(lease,'fixture');
 const fragment=packageFragment(decodeNative(await fs.readFile('artifacts/flint-b1.2/rich.mutable.json')));
 const inline=fragment.blocks.find(b=>b.inline)!.inline!;inline.atoms.push({kind:'embed',embed:'original'});inline.atoms.push({kind:'embed',embed:'original'});
 fragment.embeds.push({localId:'original',type:'image-cell',data:{asset:{kind:'managed',cavernId:f.cavernId,assetId:reference.assetId},alt:'Original'}});
 const context=await f.host.service.call('knowledge.packageData',{entities:[]});
 const materialized=materializePackage(fragment,f.cavernId,[[`${f.cavernId}/${reference.assetId}`,reference.assetId]],{...context,source:{}}),rootContent=materialized.state.contents[materialized.state.placements[materialized.roots[0]].contentKey];
 const native=nativeText(captureNative(materialized.state,String(rootContent.payload.id))),location={folder:'.',filename:'images.ink'};
 await vfs.writeFile(path.join(f.dir,location.filename),native);const input={kind:'package' as const,document:{location,expectedHash:sha(native)},knowledge:{}};
 const job=await f.host.service.call('jobs.create',{id:randomUUID(),preparation:input}),done=await f.host.service.call('jobs.run',{id:job.id,expectedRevision:job.revision});expect(done.state,done.error).toBe('completed');
 const result=await f.host.service.call('jobs.result',{id:job.id});if(result.kind!=='package')throw Error('Expected package');const opened=await openPackage(result.bytes);expect(opened.assets).toHaveLength(1);expect(Buffer.from(opened.assets[0].bytes)).toEqual(bytes);
 const stale=await f.host.service.call('jobs.create',{id:randomUUID(),preparation:input});await vfs.writeFile(path.join(f.dir,location.filename),Buffer.concat([await vfs.readFile(path.join(f.dir,location.filename)),Buffer.from(' ')]));
 const rejected=await f.host.service.call('jobs.run',{id:stale.id,expectedRevision:stale.revision});expect(rejected.state).toBe('failed');expect(rejected.error).toMatch(/changed/);
});
it('cancels an active service worker and preserves cancellation across reopening',async()=>{
 const dir=await root(),worker=path.join(dir,'spin.mjs');await fs.writeFile(worker,"import {parentPort} from 'node:worker_threads';parentPort.once('message',()=>{while(true){}})");
 const jobs=new CavernJobStorage(dir,'cavern'),executor=new NodePreparationExecutor(30000,worker),service=new ApplicationService({cavernId:'cavern',jobs,executor,readNative:async()=>{throw Error('unused');},originalAsset:async()=>{throw Error('unused');},packageData:async()=>{throw Error('unused');}});disposers.push(()=>service.close());
 const id=randomUUID(),created=await service.call('jobs.create',{id,preparation:conversion}),running=service.call('jobs.run',{id,expectedRevision:created.revision});
 for(let n=0;n<100&&!executor.status.active;n++)await new Promise(r=>setTimeout(r,10));expect(executor.status.active).toBe(1);
 expect((await service.call('jobs.cancel',{id})).state).toBe('cancelled');expect((await running).state).toBe('cancelled');expect(executor.status.active).toBe(0);
 const reopened=new CavernJobStorage(dir,'cavern');disposers.push(()=>reopened.close());expect((await reopened.load(id)).summary.state).toBe('cancelled');
});
it('recovers a lost completion checkpoint acknowledgement by reading the published outcome',async()=>{
 const dir=await root();let publications=0;
 const jobs=new CavernJobStorage(dir,'cavern',async at=>{if(at==='published'&&++publications===5)throw Error('lost acknowledgement');});
 const service=new ApplicationService({cavernId:'cavern',jobs,executor:new NodePreparationExecutor(),readNative:async()=>{throw Error('unused');},originalAsset:async()=>{throw Error('unused');},packageData:async()=>{throw Error('unused');}});disposers.push(()=>service.close());
 const created=await service.call('jobs.create',{id:randomUUID(),preparation:conversion});const done=await service.call('jobs.run',{id:created.id,expectedRevision:0});expect(publications).toBe(5);expect(done.state).toBe('completed');expect((await service.call('jobs.result',{id:created.id})).kind).toBe('convert');
});
it('refuses native reads while publication recovery is pending and leaves recovery to the existing writer',async()=>{
 const dir=await root(),native=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8'),resourceId=JSON.parse(native).resourceId;let fail=true;
 const store=createNativeDocumentStore({root:dir,fault:async at=>{if(fail&&at==='after-native')throw Error('interrupted native publication');}}),app=express();app.use(store.router);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));disposers.push(()=>new Promise<void>(r=>server.close(()=>r())));
 const location={folder:'.',filename:'pending.ink'},request={location,generation:{resourceId,generation:randomUUID(),native},baseline:{nativeHash:null,markdownHash:null,generation:null}},url=`http://127.0.0.1:${(server.address() as {port:number}).port}/save`;
 const save=()=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}).then(r=>r.json());
 expect((await save()).Data.result.phase).not.toBe('saved');await expect(store.readNative(location)).rejects.toThrow('pending');
 fail=false;expect((await save()).Data.result.phase).toBe('saved');expect((await store.readNative(location)).native).toBe(native);
});
it('reports corrupt checkpoint evidence without guessing a state or replaying work',async()=>{
 const dir=await root(),store=new CavernJobStorage(dir,'cavern');disposers.push(()=>store.close());const id=randomUUID();await store.create(id,conversion);
 const file=path.join(dir,'.mutable/jobs',id,'revision-0000.json'),value=JSON.parse(await vfs.readFile(file,'utf8'));value.summary.state='invented';await vfs.writeFile(file,JSON.stringify(value));
 await expect(store.load(id)).rejects.toThrow('recovery evidence');const page=await store.list();expect(page.jobs).toHaveLength(0);expect(page.diagnostics).toHaveLength(1);
});
