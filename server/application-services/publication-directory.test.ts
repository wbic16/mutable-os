// @vitest-environment node
import {it,expect,afterEach,vi} from 'vitest';
import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';
import {unzipSync} from 'fflate';
import sharp from 'sharp';
import {ManagedAssetStore} from '../managed-assets.mjs';
import {decodeBlockTree} from '../../src/block-tree/codecs';
import {captureNative,nativeText} from '../../src/persistence/native-resource';
import {createApplicationServiceHost} from './host';
import {CavernPublicationStorage} from './publication-storage';
import {closeFilesystemWorkers} from '../../scripts/stage-c-gates/filesystem.mjs';
import {promises as vfs} from '../phext-fs.mjs';
import {testCavern} from '../../src/knowledge-sqlite/phext-test-cavern.mjs';
import {allocateRoutes,routeEntries} from '../../src/publication/directory';
vi.setConfig({testTimeout:120000});
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();await closeFilesystemWorkers();});
const profile={title:'Public collection',route:'index.html',images:false,outboundLinks:false,includeMargins:false};
const scope={folder:'.',recursive:true,excluded:['private']};
function native(id:string,text='Reading',properties:any[]=[],extra:any[]=[]){const state=decodeBlockTree({id,type:'document-block',metadata:{documentId:id,private:'PRIVATE_METADATA_CANARY'},children:[{id:id+'-text',type:'standoff-editor-block',text,standoffProperties:properties},...extra]}).state;return nativeText(captureNative(state,id));}
async function fixture(){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'publication-b-')));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));const cavern=testCavern(root);cleanup.push(()=>cavern.close());const options={root,cavernId:randomUUID(),nativeEnabled:true,publicationEnabled:true,assets:()=>undefined,knowledge:async()=>{throw Error('No knowledge query authorized');}};const host=createApplicationServiceHost(options);cleanup.push(()=>host.close());return {root,options,host,api:host.service,async write(file:string,id:string,text?:string,properties?:any[],extra?:any[]){await vfs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await vfs.writeFile(path.join(root,file),native(id,text,properties,extra));}};}
async function done(api:any,job:any){const deadline=Date.now()+90000;while(['reviewing','running'].includes(job.state)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,20));job=await api.call('publication.jobs.inspect',{id:job.id});}return job;}
async function site(f:Awaited<ReturnType<typeof fixture>>){const id=randomUUID(),inventory=await f.api.call('publication.directories.plan',{id,scope,home:'index.html'}),pages=inventory.documents.map(({resourceId,route,title})=>({resourceId,route,title}));return f.api.call('publication.directories.save',{id,expectedRevision:-1,scope,profile,pages,reviewedRoutes:pages});}
async function review(f:Awaited<ReturnType<typeof fixture>>,s:any,buildMode:'full'|'incremental'='incremental'){return done(f.api,await f.api.call('publication.review.create',{id:randomUUID(),siteId:s.id,expectedRevision:s.revision,buildMode}));}
async function build(f:Awaited<ReturnType<typeof fixture>>,r:any){return done(f.api,await f.api.call('publication.build.start',{id:r.id,expectedRevision:r.revision,reviewDigest:r.review.digest}));}
it('publishes nested scope, reconciles exact links, keeps private filenames out and delivers navigation/folder/ZIP/preview',async()=>{
 const f=await fixture();await f.write('sensitive-name.ink','a','Reading link',[{id:'ref',type:'codex/block-reference',value:'b',metadata:{documentId:'b'},start:8,end:11}]);await f.write('sub/sensitive-name.ink','b');await f.write('private/secret.ink','private','PRIVATE_TEXT_CANARY');await vfs.writeFile(path.join(f.root,'unsupported.md'),'PRIVATE_EXTERNAL_CANARY');
 let s=await site(f);const routes=s.directory!.pages.map(p=>({...p,route:p.resourceId==='a'?'nested/a.html':'elsewhere/deep/b.html'}));s=await f.api.call('publication.directories.save',{id:s.id,expectedRevision:s.revision,scope,profile,pages:routes,reviewedRoutes:routes});const r=await review(f,s);expect(r.state,r.error).toBe('awaiting-approval');expect(r.review.diagnostics.join(' ')).toContain('unsupported.md');const pages=await f.api.call('publication.review.documents',{id:r.id,offset:0});expect(pages.documents).toHaveLength(2);
 const b=await build(f,r);expect(b.state,b.error).toBe('completed');
 const zip=unzipSync((await f.api.call('publication.releases.export',{siteId:s.id,release:b.release})).bytes),a=s.directory!.pages.find(p=>p.resourceId==='a')!,target=s.directory!.pages.find(p=>p.resourceId==='b')!;
 expect(Buffer.from(zip[a.route]).toString()).toContain(`href="../${target.route}"`);expect(Buffer.from(zip[a.route]).toString()).toContain('../reader.css');
 const all=Object.values(zip).map(v=>Buffer.from(v).toString()).join('');expect(all).not.toMatch(/PRIVATE_|sensitive-name|unsupported.md|private\/secret/);expect(all).toContain('aria-label="Contents"');
 const folder=await f.api.call('publication.releases.folder',{siteId:s.id,release:b.release});expect(await vfs.readFile(path.join(f.root,folder.relativePath,'index.html'))).toEqual(Buffer.from(zip['index.html']));
 const preview=await f.api.call('publication.releases.preview',{siteId:s.id,release:b.release});expect(new URL(preview.url).pathname.endsWith('/index.html')).toBe(true);expect((await fetch(new URL(a.route,preview.url))).status).toBe(200);expect((await fetch(new URL('../manifest.json',preview.url))).status).not.toBe(200);
 const s2=(await f.api.call('publication.sites.list',{})).sites[0],r2=await review(f,s2),b2=await build(f,r2);expect(b2.release).toBe(b.release);
});
it('keeps routes through rename, rejects stale membership and refuses duplicate identities and unsafe scopes',async()=>{
 const f=await fixture();await f.write('first.ink','a');await f.write('second.ink','b');const s=await site(f);await vfs.rename(path.join(f.root,'first.ink'),path.join(f.root,'renamed.ink'));
 const inv=await f.api.call('publication.directories.plan',{id:s.id,scope,home:'index.html'});expect(inv.documents.find(d=>d.resourceId==='a')!.route).toBe(s.directory!.pages.find(d=>d.resourceId==='a')!.route);
 const r=await review(f,s);expect(r.state).toBe('awaiting-approval');await f.write('third.ink','c');const b=await build(f,r);expect(b.state).toBe('review-required');expect((await f.api.call('publication.sites.list',{})).sites[0].active).toBeUndefined();
 await f.write('duplicate.ink','b');await expect(f.api.call('publication.directories.plan',{id:s.id,scope,home:'index.html'})).rejects.toThrow('duplicate');
 await expect(f.api.call('publication.directories.plan',{id:s.id,scope:{...scope,folder:'../outside'},home:'index.html'})).rejects.toThrow();
});
it('requires explicit route review and handles route collisions deterministically',()=>{
 const doc=(resourceId:string)=>({resourceId,location:{folder:'.',filename:resourceId+'.ink'},hash:'f'.repeat(64),size:1,title:'',route:''});const inv={documents:[doc('a'),doc('b')],diagnostics:[],directories:[]};
 expect(allocateRoutes(inv,[],'index.html',()=> 'same').map(d=>d.route)).toEqual(['pages/same.html','pages/same-2.html']);
 for(const route of ['../private.html','%2e.html','assets/foo.html','Foo.html','con.html','pages/../x.html'])expect(()=>routeEntries([{resourceId:'a',route,title:'A'}],'index.html')).toThrow();
 expect(()=>routeEntries([{resourceId:'a',route:'index.html',title:'A'}],'index.html')).toThrow();
});
it('excludes symlinks, unsupported files and unselected subdirectories without opening them',async()=>{
 const f=await fixture();await f.write('ok.ink','a');await f.write('nested/ok.ink','b');await fs.symlink(os.tmpdir(),path.join(f.root,'outside'));await vfs.writeFile(path.join(f.root,'unrelated.txt'),'secret');
 const inv=await f.api.call('publication.directories.plan',{id:randomUUID(),scope:{...scope,recursive:false},home:'index.html'});expect(inv.documents).toHaveLength(1);expect(inv.diagnostics.join(' ')).toMatch(/Non-native entry omitted/); // phext-only: the disk symlink 'outside' is not in the phext at all — never seen, never opened
 await expect(f.api.call('publication.directories.plan',{id:randomUUID(),scope:{...scope,folder:'outside'},home:'index.html'})).rejects.toThrow();
});
it('resumes immutable units after interruption; revalidates receipts and saved inputs',async()=>{
 const f=await fixture();await f.write('a.ink','a');await f.write('b.ink','b');const s=await site(f),r=await review(f,s);expect(r.state,r.error).toBe('awaiting-approval');const store=new CavernPublicationStorage(f.root,f.options.cavernId);cleanup.push(()=>store.close());const record=await store.load(r.id);await store.checkpoint({...record,job:{...record.job,state:'reviewing',review:undefined}},record.job.revision);
 await f.host.close();const replacement=createApplicationServiceHost(f.options);cleanup.push(()=>replacement.close());const interrupted=await replacement.service.call('publication.jobs.inspect',{id:r.id});expect(interrupted.state).toBe('interrupted');
 const spy=vi.spyOn(replacement.executor,'run');const resumed=await done(replacement.service,await replacement.service.call('publication.jobs.resume',{id:r.id,expectedRevision:interrupted.revision}));expect(resumed.state,resumed.error).toBe('awaiting-approval');expect(spy).not.toHaveBeenCalled();
 const receipt=JSON.parse(await vfs.readFile(path.join(f.root,'.mutable/jobs',`publication-${r.id}`,'units/doc-0000/receipt.json'),'utf8'));receipt.value.text='corrupted';await vfs.writeFile(path.join(f.root,'.mutable/jobs',`publication-${r.id}`,'units/doc-0000/receipt.json'),JSON.stringify(receipt));
 await expect(replacement.service.call('publication.review.documents',{id:r.id,offset:0})).rejects.toThrow('integrity');
});
it('keeps the previous release on a partial worker failure and resumes only unfinished documents',async()=>{
 const f=await fixture();await f.write('a.ink','a');await f.write('b.ink','b');const s=await site(f),first=await build(f,await review(f,s));expect(first.state,first.error).toBe('completed');
 const current=(await f.api.call('publication.sites.list',{})).sites[0],run=f.host.executor.run.bind(f.host.executor);let projected=0;
 const spy=vi.spyOn(f.host.executor,'run').mockImplementation((task,signal)=>{if(task.kind==='publication-project'&&++projected===2)return Promise.reject(Error('Simulated worker failure'));return run(task,signal);});
 const failed=await review(f,current,'full');expect(failed.state,failed.error).toBe('failed');expect((await f.api.call('publication.sites.list',{})).sites[0].active).toBe(first.release);
 spy.mockRestore();const retry=vi.spyOn(f.host.executor,'run'),resumed=await done(f.api,await f.api.call('publication.jobs.resume',{id:failed.id,expectedRevision:failed.revision}));expect(resumed.state,resumed.error).toBe('awaiting-approval');expect(retry).toHaveBeenCalledTimes(1);expect((await build(f,resumed)).state).toBe('completed');
});
it('cancels a directory job and excludes a competing host from its execution lease',async()=>{
 const f=await fixture();await f.write('a.ink','a');await f.write('b.ink','b');const s=await site(f),run=f.host.executor.run.bind(f.host.executor);let entered!:()=>void;const active=new Promise<void>(r=>entered=r);
 vi.spyOn(f.host.executor,'run').mockImplementation(async(task,signal)=>{if(task.kind==='publication-project'){entered();await new Promise<void>((resolve,reject)=>{if(signal?.aborted)reject(Error('Cancelled'));else signal?.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});});}return run(task,signal);});
 const j=await f.api.call('publication.review.create',{id:randomUUID(),siteId:s.id,expectedRevision:s.revision});await active;
 const other=createApplicationServiceHost(f.options);cleanup.push(()=>other.close());expect((await other.service.call('publication.jobs.inspect',{id:j.id})).state).toBe('reviewing');
 await expect(other.service.call('publication.review.create',{id:j.id,siteId:s.id,expectedRevision:s.revision})).rejects.toThrow('another host');
 const started=performance.now(),cancelled=await f.api.call('publication.jobs.cancel',{id:j.id});expect(cancelled.state).toBe('cancelled');expect(performance.now()-started).toBeLessThan(5000);expect((await f.api.call('publication.sites.list',{})).sites[0].active).toBeUndefined();
});
it('deduplicates shared originals across document units and preserves exact PNG bytes',async()=>{
 const f=await fixture(),assets=new ManagedAssetStore({root:f.root,cavernId:f.options.cavernId,session:'fixture'});cleanup.push(()=>assets.close());
 const original=await sharp({create:{width:2,height:2,channels:4,background:'#cab'}}).png().toBuffer(),lease=await assets.begin(),manifest=await assets.stage(lease,original,{mediaType:'image/png',width:2,height:2});await assets.publish(lease);await assets.finish(lease,'fixture');
 const source=JSON.parse(await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8')),text=source.document.blocks.find((b:any)=>b.id==='text');text.inline.find((a:any)=>a.kind==='image').properties={asset:{kind:'managed',cavernId:f.options.cavernId,assetId:manifest.assetId},alt:'Original image',status:'ready'};
 for(const id of ['a','b'])await vfs.writeFile(path.join(f.root,id+'.ink'),JSON.stringify(source).replaceAll('"resource"',JSON.stringify(id)));
 const host=createApplicationServiceHost({...f.options,assets:()=>assets});cleanup.push(()=>host.close());const scoped={...f,api:host.service},s=await site(scoped),p={...profile,images:true},updated=await host.service.call('publication.directories.save',{id:s.id,expectedRevision:s.revision,scope,profile:p,pages:s.directory!.pages,reviewedRoutes:s.directory!.pages});
 const r=await review(scoped,updated);expect(r.state,r.error).toBe('awaiting-approval');const b=await build(scoped,r);expect(b.state,b.error).toBe('completed');const zip=unzipSync((await host.service.call('publication.releases.export',{siteId:s.id,release:b.release})).bytes),names=Object.keys(zip).filter(p=>p.startsWith('assets/'));expect(names).toHaveLength(1);expect(Buffer.from(zip[names[0]])).toEqual(original);for(const page of s.directory!.pages)expect(Buffer.from(zip[page.route]).toString()).toContain(`../${names[0]}`);
 const current=(await host.service.call('publication.sites.list',{})).sites[0],again=await review(scoped,current);expect(again.reuse).toEqual({reused:2,prepared:0});expect((await build(scoped,again)).release).toBe(b.release);
 await host.service.call('publication.maintenance.delete',{review:await host.service.call('publication.maintenance.inspect',{siteId:s.id,target:{kind:'job',id:b.id}})});expect(Buffer.from((await assets.get(manifest.assetId,f.options.cavernId)).bytes)).toEqual(original);
});
for(const boundary of ['sealed','committed'])it(`recovers a directory release interrupted at ${boundary}`,async()=>{
 const f=await fixture();await f.write('a.ink','a');await f.write('b.ink','b');const s=await site(f),old=await build(f,await review(f,s));expect(old.state,old.error).toBe('completed');
 await f.write('a.ink','a','Changed saved reading');const current=(await f.api.call('publication.sites.list',{})).sites[0],r=await review(f,current);expect(r.state,r.error).toBe('awaiting-approval');
 let crash=true;const store=new CavernPublicationStorage(f.root,f.options.cavernId,async phase=>{if(crash&&phase===boundary){crash=false;throw Error('Simulated interruption');}});cleanup.push(()=>store.close());
 const record=await store.load(r.id),running=await store.checkpoint({...record,approved:r.review.digest,job:{...record.job,state:'running'}},record.job.revision);
 await expect(store.commit(running)).rejects.toThrow('Simulated interruption');if(boundary==='sealed')expect((await store.site(s.id)).active).toBe(old.release);
 const stopped=await f.api.call('publication.jobs.inspect',{id:r.id});expect(stopped.state).toBe('interrupted');const resumed=await done(f.api,await f.api.call('publication.jobs.resume',{id:r.id,expectedRevision:stopped.revision}));expect(resumed.state,resumed.error).toBe('completed');expect(resumed.release).not.toBe(old.release);expect((await store.site(s.id)).active).toBe(resumed.release);
});
