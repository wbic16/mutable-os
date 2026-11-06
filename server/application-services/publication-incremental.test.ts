// @vitest-environment node
import {it,expect,afterEach,vi} from 'vitest';
import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {unzipSync} from 'fflate';import {createApplicationServiceHost} from './host';import {CavernPublicationStorage,sha} from './publication-storage';
import {decodeBlockTree} from '../../src/block-tree/codecs';import {captureNative,nativeText} from '../../src/persistence/native-resource';import {defaultReader} from '../../src/publication/reader';
import {closeFilesystemWorkers} from '../../scripts/stage-c-gates/filesystem.mjs';
import {promises as vfs} from '../phext-fs.mjs';
import {testCavern} from '../../src/knowledge-sqlite/phext-test-cavern.mjs';
vi.setConfig({testTimeout:180000});const clean:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const c of clean.splice(0).reverse())await c();await closeFilesystemWorkers();});
const profile={title:'Public site',route:'index.html',images:false,outboundLinks:false,includeMargins:false,reader:defaultReader()};
const native=(id:string,text:string)=>nativeText(captureNative(decodeBlockTree({id,type:'document-block',children:[{id:'text-'+id,type:'standoff-editor-block',text}]}).state,id));
async function fixture(){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'publication-d-')));clean.push(()=>fs.rm(root,{recursive:true,force:true}));const cavern=testCavern(root);clean.push(()=>cavern.close());await vfs.writeFile(path.join(root,'a.ink'),native('a','ALPHA_PUBLIC'));await vfs.writeFile(path.join(root,'b.ink'),native('b','REMOVAL_CANARY'));const options={root,cavernId:randomUUID(),nativeEnabled:true,publicationEnabled:true,assets:()=>undefined,knowledge:async()=>{throw Error('Unexpected knowledge');}},host=createApplicationServiceHost(options);clean.push(()=>host.close());const api=host.service,id=randomUUID(),scope={folder:'.',recursive:true,excluded:[]},inventory=await api.call('publication.directories.plan',{id,scope,home:'index.html'}),pages=inventory.documents.map(({resourceId,route,title})=>({resourceId,route,title}));await api.call('publication.directories.save',{id,expectedRevision:-1,scope,profile,pages,reviewedRoutes:pages});return {root,cavern,options,host,api,id};}
const site=async(f:any)=>(await f.api.call('publication.sites.list',{})).sites.find((s:any)=>s.id===f.id);
async function settled(f:any,j:any){for(let n=0;n<3000&&['reviewing','running'].includes(j.state);n++){await new Promise(r=>setTimeout(r,25));j=await f.api.call('publication.jobs.inspect',{id:j.id});}return j;}
async function build(f:any,buildMode='incremental'){const s=await site(f),r=await settled(f,await f.api.call('publication.review.create',{id:randomUUID(),siteId:f.id,expectedRevision:s.revision,buildMode}));expect(r.state,r.error).toBe('awaiting-approval');const b=await settled(f,await f.api.call('publication.build.start',{id:r.id,expectedRevision:r.revision,reviewDigest:r.review.digest}));expect(b.state,b.error).toBe('completed');return b;}
const zip=async(f:any,j:any)=>(await f.api.call('publication.releases.export',{siteId:f.id,release:j.release})).bytes;
async function save(f:any,patch:any){const s=await site(f),scope=patch.scope??s.directory.scope,pages=patch.pages??s.directory.pages;return f.api.call('publication.directories.save',{id:s.id,expectedRevision:s.revision,scope,profile:patch.profile??s.profile,pages,reviewedRoutes:pages});}
it('reuses unchanged projections, matches full bytes, and invalidates content, theme, routes and exclusions',async()=>{
 const f=await fixture(),first=await build(f,'full'),original=await zip(f,first),again=await build(f);expect(again.reuse).toEqual({reused:2,prepared:0});expect(again.release).toBe(first.release);expect(await zip(f,again)).toEqual(original);
 const full=await build(f,'full');expect(full.reuse).toEqual({reused:0,prepared:2});expect(await zip(f,full)).toEqual(original);
 await save(f,{profile:{...profile,reader:{...profile.reader,theme:{...profile.reader.theme,name:'compact'}}}});const themed=await build(f);expect(themed.reuse).toEqual({reused:2,prepared:0});const themedFiles=unzipSync(await zip(f,themed)),prior=unzipSync(original);for(const p of (await site(f)).directory.pages)expect(themedFiles[p.route]).toEqual(prior[p.route]);expect(themedFiles['reader.css']).not.toEqual(prior['reader.css']);
 await vfs.writeFile(path.join(f.root,'a.ink'),native('a','CHANGED_PUBLIC'));const changed=await build(f);expect(changed.reuse).toEqual({reused:1,prepared:1});
 let s=await site(f);await save(f,{scope:{...s.directory.scope,excluded:['b.ink']},pages:s.directory.pages.filter((p:any)=>p.resourceId==='a').map((p:any)=>({...p,route:'renamed.html'}))});const excluded=await build(f);expect(excluded.reuse).toEqual({reused:0,prepared:1});const files=unzipSync(await zip(f,excluded));expect(Object.keys(files)).toContain('renamed.html');expect(Object.values(files).map(b=>Buffer.from(b).toString()).join('')).not.toContain('REMOVAL_CANARY');expect(Object.keys(files)).not.toContain(s.directory.pages.find((p:any)=>p.resourceId==='b').route);expect(await zip(f,await build(f,'full'))).toEqual(await zip(f,excluded));
 expect((await site(f)).releases).toContain(first.release); // history is explicit, not silently rewritten
});
it('falls back on corrupt private cache without serving stale or damaged output',async()=>{
 const f=await fixture(),first=await build(f),receipt=JSON.parse(await vfs.readFile(path.join(f.root,'.mutable/jobs',`publication-${first.id}`,'units/doc-0000/receipt.json'),'utf8'));
 await vfs.writeFile(path.join(f.root,'.mutable/jobs',`publication-${first.id}`,'units/doc-0000',`blob-${receipt.value.projection.hash}`),'CORRUPT_PRIVATE_CACHE');const next=await build(f);expect(next.reuse).toEqual({reused:1,prepared:1});expect(await zip(f,next)).toEqual(await zip(f,first));
});
it('protects references and leases, revokes previews, resumes deletion, and preserves active output',async()=>{
 const f=await fixture(),old=await build(f);await vfs.writeFile(path.join(f.root,'a.ink'),native('a','NEW_RELEASE'));const current=await build(f);
 const inspect=(kind:string,id:string)=>f.api.call('publication.maintenance.inspect',{siteId:f.id,target:{kind,id}} as any);
 expect((await inspect('release',current.release)).blocked.join()).toContain('active');expect((await inspect('release',old.release)).blocked.join()).toContain('Retained job');
 const store=new CavernPublicationStorage(f.root,f.options.cavernId);clean.push(()=>store.close());const jobLease=await store.acquire(old.id);try{await expect(f.api.call('publication.maintenance.delete',{review:await inspect('job',old.id)})).rejects.toThrow('another host');}finally{await jobLease.close();}
 await f.api.call('publication.maintenance.delete',{review:await inspect('job',old.id)});await expect(f.api.call('publication.jobs.inspect',{id:old.id})).rejects.toThrow('removed');
 const preview=await f.api.call('publication.releases.preview',{siteId:f.id,release:old.release}),second=await f.api.call('publication.releases.preview',{siteId:f.id,release:old.release});expect((await fetch(second.url)).status).toBe(200);
 const external=await store.leaseRelease(f.id,old.release);try{await expect(f.api.call('publication.maintenance.delete',{review:await inspect('release',old.release)})).rejects.toThrow('another host');}finally{await external.close();}expect((await fetch(preview.url)).status).toBe(404);
 let crash=true;const faulty=new CavernPublicationStorage(f.root,f.options.cavernId,async at=>{if(crash&&at==='maintenance-detached'){crash=false;throw Error('simulated maintenance crash');}});clean.push(()=>faulty.close());await expect(faulty.maintenanceDelete(await inspect('release',old.release))).rejects.toThrow('crash');const pending=await inspect('release',old.release);expect(pending.pending).toBe(true);await f.api.call('publication.maintenance.delete',{review:pending});expect((await site(f)).releases).not.toContain(old.release);expect((await site(f)).active).toBe(current.release);expect((await zip(f,current)).length).toBeGreaterThan(0);
 const list=await f.api.call('publication.maintenance.list',{siteId:f.id});expect(list.targets.some(t=>t.id===old.id||t.id===old.release)).toBe(false);
});
it('rejects maintenance scope changes, unsafe trees and stale reviews without touching originals',async()=>{
 const f=await fixture(),j=await build(f),review=await f.api.call('publication.maintenance.inspect',{siteId:f.id,target:{kind:'job',id:j.id}});await vfs.writeFile(path.join(f.root,'.mutable/jobs',`publication-${j.id}`,'external-change'),'changed');await expect(f.api.call('publication.maintenance.delete',{review})).rejects.toThrow('changed');
 const outside=path.join(f.root,'original.bin');await fs.writeFile(outside,'ORIGINAL_ASSET_BYTES');const dir=path.join(f.root,'.mutable/jobs',`publication-${j.id}`);await fs.mkdir(dir,{recursive:true});await fs.symlink(outside,path.join(dir,'unsafe'));
 // Phext-only: the symlink exists only on disk — the maintenance
 // walk reads the phext tree, never follows the link, and the
 // outside file is untouched. (The disk-era form asserted an
 // /Unsafe|symlink/ rejection of a link the walk could see.)
 await f.api.call('publication.maintenance.inspect',{siteId:f.id,target:{kind:'job',id:j.id}});expect(await fs.readFile(outside,'utf8')).toBe('ORIGINAL_ASSET_BYTES');
});
it('requires fresh review rather than resuming units from an incompatible generator policy',async()=>{
 const f=await fixture(),s=await site(f),j=await settled(f,await f.api.call('publication.review.create',{id:randomUUID(),siteId:f.id,expectedRevision:s.revision}));expect(j.state).toBe('awaiting-approval');
 const file=path.join(f.root,'.mutable/jobs',`publication-${j.id}`,'units/doc-0000/receipt.json'),receipt=JSON.parse(await vfs.readFile(file,'utf8'));receipt.value.projection.fingerprint='0'.repeat(64);receipt.digest=sha(JSON.stringify(receipt.value));await vfs.writeFile(file,JSON.stringify(receipt));
 const store=new CavernPublicationStorage(f.root,f.options.cavernId);clean.push(()=>store.close());const r=await store.load(j.id);await store.checkpoint({...r,job:{...r.job,state:'reviewing',review:undefined}},r.job.revision);const stopped=await f.api.call('publication.jobs.inspect',{id:j.id});const resumed=await settled(f,await f.api.call('publication.jobs.resume',{id:j.id,expectedRevision:stopped.revision}));expect(resumed.state).toBe('review-required');expect(resumed.error).toContain('policy changed');
});
it('reconciles lost acknowledgements for historical manifests with private staging fields',async()=>{
 const f=await fixture(),j=await build(f),store=new CavernPublicationStorage(f.root,f.options.cavernId);clean.push(()=>store.close());const r=await store.load(j.id),s=await site(f);
 const files=r.files.map(({entry,...file})=>file),legacy=sha(JSON.stringify(files)),releaseRoot=path.join(f.root,'.mutable/publications',f.id,'releases');{const rel=x=>'/'+path.relative(f.root,x);const walk=(a,b)=>{const st=f.cavern.vfs.stat(rel(a));if(st.type==='directory'){f.cavern.vfs.mkdir(rel(b));for(const e of f.cavern.vfs.listDir(rel(a)))walk(path.join(a,e.name),path.join(b,e.name));}else f.cavern.vfs.writeFile(rel(b),f.cavern.vfs.readFile(rel(a)),{format:'binary'});};walk(path.join(releaseRoot,j.release),path.join(releaseRoot,legacy));f.cavern.flush();}
 await vfs.writeFile(path.join(releaseRoot,legacy,'manifest.json'),JSON.stringify(files));
 await store.writeSite({...s,active:legacy,releases:[...s.releases,legacy],committedJobs:{...s.committedJobs,[j.id]:legacy}},s.revision);
 await store.checkpoint({...r,files,job:{...r.job,state:'running',release:undefined}},r.job.revision);const stopped=await f.api.call('publication.jobs.inspect',{id:j.id});const resumed=await settled(f,await f.api.call('publication.jobs.resume',{id:j.id,expectedRevision:stopped.revision}));expect(resumed.state,resumed.error).toBe('completed');expect(resumed.release).toBe(legacy);expect((await zip(f,resumed)).length).toBeGreaterThan(0);
});
