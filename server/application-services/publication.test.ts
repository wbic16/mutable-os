// @vitest-environment node
import {it,expect,afterEach,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';
import express from 'express';import {unzipSync} from 'fflate';
import sharp from 'sharp';
import {ManagedAssetStore} from '../managed-assets.mjs';
import {createApplicationServiceHost} from './host';
import {CavernPublicationStorage,sha} from './publication-storage';
import {PublicationService} from '../../src/application-services/publication-service';
import {PublicationPreview} from './publication-preview';
import {NodePreparationExecutor} from './executor';
import {HttpApplicationServices} from '../../src/runtime/application-services';
import type {Projection} from '../../src/publication/projection';
import {closeFilesystemWorkers} from '../../scripts/stage-c-gates/filesystem.mjs';
import {promises as vfs} from '../phext-fs.mjs';
import {testCavern} from '../../src/knowledge-sqlite/phext-test-cavern.mjs';
import type {PublicationJob,PublicationProfile} from '../../src/application-services/publication-contracts';
vi.setConfig({testTimeout:20000});
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();await closeFilesystemWorkers();});
const profile:PublicationProfile={title:'Public reading',route:'stable-page.html',images:false,outboundLinks:false,includeMargins:false};
async function fixture(enabled=true){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'publication-a-')));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));const cavern=testCavern(root);cleanup.push(()=>cavern.close());
 const native=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8');await vfs.writeFile(path.join(root,'saved.ink'),native);
 const options={root,cavernId:randomUUID(),nativeEnabled:true,publicationEnabled:enabled,assets:()=>undefined,knowledge:async()=>{throw Error('Reading publication must not query knowledge');}};
 const host=createApplicationServiceHost(options);cleanup.push(()=>host.close());const app=express();app.use('/services',host.router);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));cleanup.push(()=>new Promise<void>(r=>server.close(()=>r())));
 const base=`http://127.0.0.1:${(server.address() as any).port}`;
 const api=new HttpApplicationServices(()=>({cavernId:options.cavernId,session:'test'}),((u:any,o:any)=>fetch(base+String(u).replace('/api',''),o)) as typeof fetch);
 return {root,native,host,options,api,base};
}
async function done(api:any,j:PublicationJob){for(let i=0;i<200&&['reviewing','running'].includes(j.state);i++){await new Promise(r=>setTimeout(r,15));j=await api.call('publication.jobs.inspect',{id:j.id});}return j;}
async function site(f:Awaited<ReturnType<typeof fixture>>,p=profile){return f.api.call('publication.sites.write',{id:randomUUID(),expectedRevision:-1,location:{folder:'.',filename:'saved.ink'},profile:p,reviewedRoute:p.route});}
async function review(f:Awaited<ReturnType<typeof fixture>>,s:Awaited<ReturnType<typeof site>>){const j=await done(f.api,await f.api.call('publication.review.create',{id:randomUUID(),siteId:s.id,expectedRevision:s.revision}));expect(j.state,j.error).toBe('awaiting-approval');return j;}
async function build(f:Awaited<ReturnType<typeof fixture>>,j:PublicationJob){return done(f.api,await f.api.call('publication.build.start',{id:j.id,expectedRevision:j.revision,reviewDigest:j.review!.digest}));}
it('qualifies Select / Review / Build / isolated Preview / deterministic Export over HTTP',async()=>{
 const f=await fixture(),s=await site(f),r=await review(f,s);expect(r.review!.text.length).toBeGreaterThan(0);
 await expect(f.api.call('publication.build.start',{id:r.id,expectedRevision:r.revision,reviewDigest:'unapproved'})).rejects.toThrow('approval');
 const b=await build(f,r);expect(b.state,b.error).toBe('completed');expect((await f.api.call('publication.sites.list',{})).sites[0].active).toBe(b.release);
 const preview=await f.api.call('publication.releases.preview',{siteId:s.id,release:b.release!}),response=await fetch(preview.url),html=await response.text();expect(response.status).toBe(200);expect(html).toContain('Public reading');expect(html).not.toContain('data-ink-entity');expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");expect(new URL(preview.url).origin).not.toBe(f.base);
 for(const suffix of ['../request.json','%2e%2e/request.json','.mutable/jobs','manifest.json','api/services/native.read'])expect((await fetch(new URL(suffix,preview.url))).status).not.toBe(200);
 expect((await fetch(preview.url,{headers:{Origin:f.base}})).status).toBe(403);
 const a=await f.api.call('publication.releases.export',{siteId:s.id,release:b.release!}),c=await f.api.call('publication.releases.export',{siteId:s.id,release:b.release!});expect(a.bytes).toEqual(c.bytes);
 expect(Object.keys(unzipSync(a.bytes)).sort()).toEqual(['reader.css',profile.route].sort());
 await f.api.call('publication.preview.close',{grant:preview.grant});expect((await fetch(preview.url)).status).toBe(404);
 expect(await vfs.readFile(path.join(f.root,'saved.ink'),'utf8')).toBe(f.native);expect(await vfs.readdir(f.root)).not.toContain('saved.md');
});
it('keeps sites independent and routes stable through saved edits, titles and explicit rebinding after rename',async()=>{
 const f=await fixture(),a=await site(f),b=await site(f,{...profile,title:'Other policy',outboundLinks:true});
 const ra=await build(f,await review(f,a)),rb=await build(f,await review(f,b));expect(ra.state).toBe('completed');expect(rb.state).toBe('completed');expect(ra.release).not.toBe(rb.release);
 await vfs.rename(path.join(f.root,'saved.ink'),path.join(f.root,'renamed.ink'));await vfs.writeFile(path.join(f.root,'renamed.ink'),Buffer.concat([await vfs.readFile(path.join(f.root,'renamed.ink')),Buffer.from('\n')]));
 const current=(await f.api.call('publication.sites.list',{})).sites.find(s=>s.id===a.id)!;
 const changed=await f.api.call('publication.sites.write',{id:a.id,expectedRevision:current.revision,location:{folder:'.',filename:'renamed.ink'},profile:{...profile,title:'New public title'},reviewedRoute:profile.route});
 expect(changed.profile.route).toBe(profile.route);const next=await build(f,await review(f,changed));expect(next.state,next.error).toBe('completed');
 const sites=(await f.api.call('publication.sites.list',{})).sites;expect(sites.find(s=>s.id===a.id)!.releases).toHaveLength(2);expect(sites.find(s=>s.id===b.id)!.active).toBe(rb.release);
 await expect(f.api.call('publication.sites.write',{id:a.id,expectedRevision:changed.revision,location:changed.location,profile:{...profile,route:'different.html'},reviewedRoute:'stable-page.html'})).rejects.toThrow('route review');
});
it('rejects stale saved content and profile revisions without replacing the active release',async()=>{
 const f=await fixture(),s=await site(f),r=await review(f,s);await vfs.writeFile(path.join(f.root,'saved.ink'),Buffer.concat([await vfs.readFile(path.join(f.root,'saved.ink')),Buffer.from(' ')]));
 const b=await build(f,r);expect(b.state).toBe('review-required');expect((await f.api.call('publication.sites.list',{})).sites[0].active).toBeUndefined();
 const r2=await review(f,s);await f.api.call('publication.sites.write',{id:s.id,expectedRevision:s.revision,location:s.location,profile:{...profile,title:'Changed'},reviewedRoute:profile.route});expect((await build(f,r2)).state).toBe('review-required');
});
it('cancels reviews, rediscovers jobs and resumes after host replacement with explicit revalidation',async()=>{
 const f=await fixture(),s=await site(f),r=await review(f,s);await f.api.call('publication.jobs.cancel',{id:r.id});expect((await f.api.call('publication.jobs.inspect',{id:r.id})).state).toBe('cancelled');
 const r2=await review(f,s);await f.host.close();const reopened=createApplicationServiceHost(f.options);cleanup.push(()=>reopened.close());
 expect((await reopened.service.call('publication.jobs.list',{siteId:s.id})).jobs.map(j=>j.id)).toContain(r2.id);
 const b=await done(reopened.service,await reopened.service.call('publication.build.start',{id:r2.id,expectedRevision:r2.revision,reviewDigest:r2.review!.digest}));expect(b.state,b.error).toBe('completed');
});
it('keeps publication feature-off without creating publication storage',async()=>{
 const f=await fixture(false);await expect(f.api.call('publication.sites.list',{})).rejects.toThrow('Unknown');expect(await fs.stat(path.join(f.root,'.mutable/publications')).catch(()=>null)).toBeNull();
});
it('rejects authority escalation and unsafe public paths',async()=>{
 const f=await fixture();for(const route of ['../secret.html','/root.html','%2e.html','reader.css','CON.html','assets/secret.html'])await expect(site(f,{...profile,route})).rejects.toThrow();
 await expect(f.api.call('publication.sites.write',{id:randomUUID(),expectedRevision:-1,location:{folder:'..',filename:'saved.ink'},profile,reviewedRoute:profile.route})).rejects.toThrow();
 await expect(f.api.call('publication.sites.list',{sql:'select *'} as any)).rejects.toThrow('fields');
 await fs.symlink(os.tmpdir(),path.join(f.root,'.mutable'));expect((await f.api.call('publication.sites.list',{})).sites).toBeDefined(); // phext-only: the service's .mutable lives in cavern.phext; a disk symlink wearing its name is never consulted
});
it('does not publish annotation, retained native or unsupported authored metadata',async()=>{
 const f=await fixture();const project=()=>f.host.executor.run({kind:'publication-project',native:new TextEncoder().encode(f.native),profile,cavernId:f.options.cavernId}) as Promise<Projection>;const p=await project();
 expect(p.html).not.toContain(JSON.parse(f.native).resourceId);expect(p.html).not.toContain('standoffProperties');expect(p.html).not.toContain('data-ink-');expect(p.html).not.toContain('3d-object-block');expect(p.omittedAnnotations+p.omittedBlocks).toBeGreaterThan(0);
 expect(p.html).not.toMatch(/<script|<iframe|onload=/);expect(p.html).toBe((await project()).html);
});
it('retains and deduplicates managed PNG originals without publishing private metadata fields',async()=>{
 const f=await fixture(),assets=new ManagedAssetStore({root:f.root,cavernId:f.options.cavernId,session:'test'});cleanup.push(()=>assets.close());
 const image=await sharp({create:{width:3,height:2,channels:4,background:'#abcdef'}}).png().toBuffer(),lease=await assets.begin();
 const manifest=await assets.stage(lease,image,{mediaType:'image/png',width:3,height:2});await assets.publish(lease);await assets.finish(lease,'fixture');
 const input=JSON.parse(f.native),text=input.document.blocks.find((b:any)=>b.id==='text');
 text.inline.find((a:any)=>a.kind==='image').properties={asset:{kind:'managed',cavernId:f.options.cavernId,assetId:manifest.assetId},alt:'Original pixels',status:'ready'};
 text.properties.privateNote='PRIVATE_METADATA_CANARY';text.properties.standoffProperties.push({id:'PRIVATE_ANNOTATION_CANARY',type:'private/type',start:0,end:1,value:'PRIVATE_VALUE_CANARY'});
 await vfs.writeFile(path.join(f.root,'saved.ink'),JSON.stringify(input));
 const host=createApplicationServiceHost({...f.options,assets:()=>assets});cleanup.push(()=>host.close());const api=host.service;
 const s=await api.call('publication.sites.write',{id:randomUUID(),expectedRevision:-1,location:{folder:'.',filename:'saved.ink'},profile:{...profile,images:true},reviewedRoute:profile.route});
 const r=await done(api,await api.call('publication.review.create',{id:randomUUID(),siteId:s.id,expectedRevision:s.revision}));expect(r.state,r.error).toBe('awaiting-approval');
 const b=await done(api,await api.call('publication.build.start',{id:r.id,expectedRevision:r.revision,reviewDigest:r.review!.digest}));expect(b.state,b.error).toBe('completed');
 const out=unzipSync((await api.call('publication.releases.export',{siteId:s.id,release:b.release!})).bytes),images=Object.keys(out).filter(k=>k.startsWith('assets/'));expect(images).toHaveLength(1);expect(Buffer.from(out[images[0]])).toEqual(image);
 expect(Buffer.from(out[profile.route]).toString()).toContain(images[0]);expect(Object.values(out).map(b=>Buffer.from(b).toString()).join('')).not.toMatch(/PRIVATE_(METADATA|ANNOTATION|VALUE)_CANARY/);
});
it('rejects corrupt staged files and recovers a stale running journal without automatic replay',async()=>{
 const f=await fixture(),s=await site(f),r=await review(f,s),store=new CavernPublicationStorage(f.root,f.options.cavernId);cleanup.push(()=>store.close());
 const rec=await store.load(r.id);await store.checkpoint({...rec,approved:r.review!.digest,job:{...rec.job,state:'running'}},rec.job.revision);
 const inspected=await f.api.call('publication.jobs.inspect',{id:r.id});expect(inspected.state).toBe('interrupted');
 await vfs.writeFile(path.join(f.root,'.mutable/jobs',`publication-${r.id}`,`blob-${r.review!.files[0].hash}`),'CORRUPT');
 const resumed=await done(f.api,await f.api.call('publication.jobs.resume',{id:r.id,expectedRevision:inspected.revision}));expect(resumed.state).toBe('failed');expect(resumed.error).toMatch(/integrity/);expect((await store.site(s.id)).active).toBeUndefined();
});
it('semantically converts source Blocks without running or publishing authored scripts and CSS',async()=>{
 const f=await fixture(),input=JSON.parse(f.native),block=input.document.blocks.find((b:any)=>b.id==='text');
 block.type='mutable/html-source-block';delete block.inline;block.properties={text:'<style>body{background:url(https://private.invalid/secret)}</style><script>SECRET_SCRIPT_CANARY</script><p>Visible source <strong>strong</strong><a href="javascript:alert(1)">link</a></p>',sourceFormat:{version:1,format:'html',profile:'mutable-html-source-v1'}};
 const p=await f.host.executor.run({kind:'publication-project',native:new TextEncoder().encode(JSON.stringify(input)),profile,cavernId:f.options.cavernId}) as Projection;
 expect(p.html).toContain('Visible source');expect(p.html).toContain('<strong>strong</strong>');expect(p.html).not.toMatch(/SECRET_SCRIPT_CANARY|private\.invalid|javascript:|<script|<style/);
});
it('applies per-site disclosure to margins and URLs while removing retained definitions',async()=>{
 const f=await fixture(),input=JSON.parse(f.native),block=input.document.blocks.find((b:any)=>b.id==='text');
 block.properties.standoffProperties.push({id:'private-url-id',type:'reference/url',start:0,end:1,value:'https://example.test/reviewed?key=URL_DISCLOSURE'});
 block.relations={owned:{leftMargin:{placementId:'margin-edge',kind:'owned',target:{kind:'local',blockId:'margin'}}},opaque:{}};
 input.document.blocks.push({id:'margin',type:'left-margin-block',properties:{},children:[{placementId:'margin-text-edge',kind:'owned',target:{kind:'local',blockId:'margin-text'}}]},{id:'margin-text',type:'plain-text-block',properties:{text:'MARGIN_DISCLOSURE'}},{id:'retained',type:'plain-text-block',properties:{text:'RETAINED_PRIVATE_CANARY'}});
 input.definitionOwnerBlockIds.push('retained');
 const project=(p:PublicationProfile)=>f.host.executor.run({kind:'publication-project',native:new TextEncoder().encode(JSON.stringify(input)),profile:p,cavernId:f.options.cavernId}) as Promise<Projection>;
 const hidden=await project(profile),shown=await project({...profile,includeMargins:true,outboundLinks:true});
 expect(hidden.html).not.toMatch(/MARGIN_DISCLOSURE|URL_DISCLOSURE|RETAINED_PRIVATE_CANARY/);expect(shown.html).toContain('MARGIN_DISCLOSURE');expect(shown.html).toContain('URL_DISCLOSURE');expect(shown.html).not.toContain('RETAINED_PRIVATE_CANARY');expect(shown.diagnostics.join(' ')).toContain('URL_DISCLOSURE');
});
it('reuses exact source collection image bindings without acquiring unresolved resources',async()=>{
 const f=await fixture(),input=JSON.parse(f.native),block=input.document.blocks.find((b:any)=>b.id==='text'),root=input.document.blocks.find((b:any)=>b.id==='doc'),asset={kind:'managed',cavernId:f.options.cavernId,assetId:`sha256:${'a'.repeat(64)}`};
 root.properties.metadata={...root.properties.metadata,collection:{bindings:[{path:'picture.png',url:'picture.png',image:true,wiki:true}],assets:{'picture.png':asset}}};
 block.type='mutable/markdown-source-block';delete block.inline;block.properties={text:'Image ![[picture.png]] and ![missing](outside.png)',sourceFormat:{version:1,format:'markdown',profile:'mutable-markdown-source-v1'}};
 const p=await f.host.executor.run({kind:'publication-project',native:new TextEncoder().encode(JSON.stringify(input)),profile:{...profile,images:true},cavernId:f.options.cavernId}) as Projection;
 expect(p.assets.map(a=>a.reference)).toEqual([asset]);expect(p.html).not.toContain('src="outside.png"');
});
it('cancels admitted work and refuses unbounded projection and forged revisions',async()=>{
 const f=await fixture(),s=await site(f),j=await f.api.call('publication.review.create',{id:randomUUID(),siteId:s.id,expectedRevision:s.revision});
 const cancelled=await f.api.call('publication.jobs.cancel',{id:j.id});expect(cancelled.state).toBe('cancelled');
 await expect(f.api.call('publication.jobs.resume',{id:j.id,expectedRevision:cancelled.revision})).rejects.toThrow('cannot resume');
 await expect(f.host.executor.run({kind:'publication-project',native:new Uint8Array(8*1024*1024+1),profile,cavernId:f.options.cavernId})).rejects.toThrow('8 MiB');
 const r=await review(f,s);await expect(f.api.call('publication.build.start',{id:r.id,expectedRevision:0,reviewDigest:r.review!.digest})).rejects.toThrow('approval');
});
it('bounds revision records and retained job files before publication',async()=>{
 const f=await fixture(),s=await site(f),store=new CavernPublicationStorage(f.root,f.options.cavernId);cleanup.push(()=>store.close());
 const record=await store.create({site:s,files:[],job:{version:2,id:randomUUID(),siteId:s.id,revision:0,state:'reviewing',phase:'Saved input'}});
 await expect(store.checkpoint({...record,job:{...record.job,error:'x'.repeat(2*1024*1024)}},0)).rejects.toThrow('2 MiB');expect((await store.load(record.job.id)).job.revision).toBe(0);
 await vfs.writeFile(path.join(f.root,'.mutable/jobs',`publication-${record.job.id}`,'stage-budget-fixture'),Buffer.alloc(128*1024*1024));
 await expect(store.checkpoint({...record,job:{...record.job,state:'interrupted'}},0)).rejects.toThrow('budget');expect((await store.load(record.job.id)).job.revision).toBe(0);
});
it('cannot open a late preview grant after its Cavern closes',async()=>{
 let resolve!:(files:any[])=>void;const storage={release:()=>new Promise<any[]>(r=>{resolve=r;})} as any;
 const preview=new PublicationPreview(storage),pending=preview.open(randomUUID(),'a'.repeat(64));await preview.close();resolve([{path:'index.html',mediaType:'text/html'}]);await expect(pending).rejects.toThrow('closed');await expect(preview.open(randomUUID(),'a'.repeat(64))).rejects.toThrow('closed');
});
for(const boundary of ['staged','published'])it(`recovers publication journal creation at ${boundary}`,async()=>{
 const f=await fixture(),s=await site(f);let fail=true;const store=new CavernPublicationStorage(f.root,f.options.cavernId,async at=>{if(fail&&at===boundary){fail=false;throw Error('Interrupted record write');}});cleanup.push(()=>store.close());
 const record={site:s,files:[],job:{version:2 as const,id:randomUUID(),siteId:s.id,revision:0,state:'reviewing' as const,phase:'Saved input'}};
 await expect(store.create(record)).rejects.toThrow('Interrupted');const reopened=new CavernPublicationStorage(f.root,f.options.cavernId);cleanup.push(()=>reopened.close());
 expect((await reopened.create(record)).job).toEqual(record.job);expect((await reopened.load(record.job.id)).site).toEqual(s);
});
it('keeps the active release when publication encounters simulated disk exhaustion',async()=>{
 const f=await fixture(),s=await site(f),built=await build(f,await review(f,s));expect(built.state).toBe('completed');
 const current=(await f.api.call('publication.sites.list',{})).sites[0],changed=await f.api.call('publication.sites.write',{id:s.id,expectedRevision:current.revision,location:s.location,profile:{...profile,title:'Next release'},reviewedRoute:profile.route}),r=await review(f,changed);
 const store=new CavernPublicationStorage(f.root,f.options.cavernId,async at=>{if(at==='staged')throw Object.assign(Error('Simulated ENOSPC'),{code:'ENOSPC'});});cleanup.push(()=>store.close());
 await expect(store.commit(await store.load(r.id))).rejects.toThrow('ENOSPC');expect((await store.site(s.id)).active).toBe(built.release);expect(await store.release(s.id,built.release!)).toHaveLength(2);
});
for(const fault of ['sealed','committed'])it(`recovers a release interrupted at ${fault}`,async()=>{
 const f=await fixture(),s=await site(f),r=await review(f,s);let fail=true;const store=new CavernPublicationStorage(f.root,f.options.cavernId,async at=>{if(fail&&at===fault){fail=false;throw Error('simulated interruption');}}),executor=new NodePreparationExecutor();cleanup.push(()=>executor.close());
 const service=new PublicationService({cavernId:f.options.cavernId,storage:store,executor,hash:sha,native:(i,signal)=>f.host.service.call('native.read',i,signal),asset:async()=>{throw Error('unused');},preview:async()=>{throw Error('unused');},closePreview:async()=>{}});cleanup.push(()=>service.close());
 const b=await done(service,await service.call('publication.build.start',{id:r.id,expectedRevision:r.revision,reviewDigest:r.review!.digest}));
 if(fault==='committed')expect(b.state,b.error).toBe('completed');else {expect(b.state).toBe('failed');expect((await store.site(s.id)).active).toBeUndefined();const resumed=await done(service,await service.call('publication.jobs.resume',{id:b.id,expectedRevision:b.revision}));expect(resumed.state,resumed.error).toBe('completed');}
});
