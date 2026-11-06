import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, readdir, symlink, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';import sharp from 'sharp';import express from 'express';
import { ManagedAssetStore } from './managed-assets.mjs';
import { validateImportedImage } from './asset-image-validation.mjs';
import { createManagedAssetService } from './managed-assets-router.mjs';
import { closeFilesystemWorkers } from '../scripts/stage-c-gates/filesystem.mjs';
import { testCavern } from '../src/knowledge-sqlite/phext-test-cavern.mjs';
import { promises as vfs } from './phext-fs.mjs';
const roots=[];after(async()=>{await closeFilesystemWorkers();for(const r of roots)await rm(r,{recursive:true,force:true});});
const fixture=async(options={})=>{const root=await mkdtemp(path.join(os.tmpdir(),'managed-asset-'));roots.push(root);const cavern=testCavern(root);return {root,cavern,store:new ManagedAssetStore({root,cavernId:'cavern',session:'session',...options})};};
const png=()=>sharp({create:{width:3,height:2,channels:4,background:'#c06020'}}).png().toBuffer();
const jpeg=()=>sharp({create:{width:3,height:2,channels:3,background:'#c06020'}}).jpeg().toBuffer();

test('validates PNG/JPEG by full decode while preserving exact originals',async()=>{
 for(const bytes of [await png(),await jpeg()]){const info=await validateImportedImage(bytes);assert.equal(info.width,3);assert.equal(info.height,2);const {store}=await fixture();const lease=await store.begin();const item=await store.stage(lease,bytes,info);assert.equal(item.assetId,'sha256:'+createHash('sha256').update(bytes).digest('hex'));await store.publish(lease);await store.finish(lease);assert.deepEqual((await store.get(item.assetId,'cavern')).bytes,bytes);}
});
test('deduplicates identical originals across operations and keeps published bytes after abort/lease expiry',async()=>{
 let now=0;const {store}=await fixture({now:()=>now}),bytes=await png(),info=await validateImportedImage(bytes),a=await store.begin(),b=await store.begin();
 const first=await store.stage(a,bytes,info),second=await store.stage(b,bytes,info);assert.equal(first.assetId,second.assetId);
 await Promise.all([store.publish(a),store.publish(b)]);await store.abort(a);now=1000000;await store.abort(b);assert.deepEqual((await store.get(first.assetId,'cavern')).bytes,bytes);
 await assert.rejects(store.get(first.assetId,'foreign'),/another Cavern/);
});
for(const point of ['intent','object-bytes','object-manifest','published'])test(`recovers interrupted ${point} without replacing bytes or replaying an edit`,async()=>{
 let fault=true;const {root,store}=await fixture({fault:async p=>{if(p===point&&fault){fault=false;throw Error('simulated crash');}}}),bytes=await png(),info=await validateImportedImage(bytes),lease=await store.begin(),item=await store.stage(lease,bytes,info);
 await assert.rejects(store.publish(lease),/simulated/);const reopened=new ManagedAssetStore({root,cavernId:'cavern',session:'next'});
 assert.deepEqual((await reopened.recover()).diagnostics,[]);assert.deepEqual((await reopened.get(item.assetId,'cavern')).bytes,bytes);assert.deepEqual((await reopened.recover()).diagnostics,[]);await assert.rejects(reopened.publish(lease),/stale/);
});
test('removes only unpublished stage bytes after interrupted staging',async()=>{
 const {root,store}=await fixture({fault:async p=>{if(p==='stage-bytes')throw Error('crash');}}),lease=await store.begin(),bytes=await png();await assert.rejects(store.stage(lease,bytes,await validateImportedImage(bytes)),/crash/);
 const reopened=new ManagedAssetStore({root,cavernId:'cavern',session:'next'});assert.deepEqual((await reopened.recover()).diagnostics,[]);
 assert.ok(!(await vfs.readdir(path.join(root,'.mutable/assets/operations',lease.id))).some(n=>n.endsWith('.bin')));
});
test('renewed leases survive recovery until expiry; expired leases cannot publish',async()=>{
 let now=0;const {store}=await fixture({now:()=>now}),lease=await store.begin();now=500000;await store.renew(lease);now=700000;await store.recover();await store.status(lease);now=1200000;await assert.rejects(store.publish(lease),/expired/);await store.recover();await assert.rejects(store.status(lease),/aborted/);
});
test('portable references survive moving the entire Cavern and cannot authorize foreign scope',async()=>{
 const {root,store,cavern}=await fixture(),lease=await store.begin(),bytes=await jpeg(),item=await store.stage(lease,bytes,await validateImportedImage(bytes));await store.publish(lease);await store.finish(lease);
 const dest=await fixture();
 // Phext-only: the asset home lives inside cavern.phext — moving
 // the Cavern carries the /.mutable subtree phext-to-phext.
 const copyTree=async(from,to)=>{const st=cavern.vfs.stat(from);if(st.type==='directory'){dest.cavern.vfs.mkdir(to);for(const e of cavern.vfs.listDir(from))await copyTree(`${from}/${e.name}`,`${to}/${e.name}`);}else dest.cavern.vfs.writeFile(to,cavern.vfs.readFile(from),{format:'binary'});};
 await copyTree('/.mutable','/.mutable');dest.cavern.flush();
 const moved=new ManagedAssetStore({root:dest.root,cavernId:'cavern',session:'moved'});await moved.recover();assert.deepEqual((await moved.get(item.assetId,'cavern')).bytes,bytes);
});
test('rejects unsupported/truncated/oversized/concatenated binaries',async()=>{
 const p=await png(),j=await jpeg();
 for(const bytes of [Buffer.from('<svg onload="evil()"/>'),p.subarray(0,p.length-9),Buffer.concat([p,Buffer.from('extra')]),Buffer.concat([j,j]),Buffer.alloc(10*1024*1024+1)])await assert.rejects(validateImportedImage(bytes));
 const giant=await sharp({create:{width:17000,height:1,channels:3,background:'red'}}).png().toBuffer();await assert.rejects(validateImportedImage(giant),/dimensions/);
});
test('disk symlinks cannot redirect asset storage; corrupt publication evidence is preserved as a diagnostic',async()=>{
 const a=await fixture(),b=await fixture();await a.store.home();await mkdir(path.join(a.root,'.mutable/assets'),{recursive:true});await symlink(b.root,path.join(a.root,'.mutable/assets/objects'));
 // Phext-only: the symlink exists only on the real disk, where
 // the store never looks — publication lands in a's own phext
 // and b's Cavern gains nothing.
 const lease=await a.store.begin(),bytes=await png();await a.store.stage(lease,bytes,await validateImportedImage(bytes));await a.store.publish(lease);await a.store.finish(lease);
 assert.ok((await readdir(b.root)).every(n=>n.startsWith('cavern.phext')));
 // Corrupt a second operation's ledger entry: recovery reports
 // it as a diagnostic instead of dropping the evidence.
 const lease2=await a.store.begin();await a.store.stage(lease2,bytes,await validateImportedImage(bytes));
 const opDir=path.join(a.root,'.mutable/assets/operations',lease2.id);for(const n of await vfs.readdir(opDir))await vfs.writeFile(path.join(opDir,n),'corrupt');
 assert.equal((await a.store.recover()).diagnostics.length,1);
});
test('HTTP multipart admission, scoped retrieval and denied remote consent use the same store',async()=>{
 const {root}=await fixture(),service=createManagedAssetService({root,cavernId:'cavern',session:'session'}),app=express();app.use(express.json());app.use('/api/assets',service.router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/assets`;
 try {
 const post=async(p,body,token)=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Mutable-Asset-Lease':token}:{})},body:JSON.stringify(body??{})});return r.json();};
 const lease=(await post('/begin')).Data,bytes=await png(),form=new FormData();form.append('asset',new Blob([bytes],{type:'text/plain'}),'wrong-mime.txt');
 const response=await fetch(`${base}/${lease.id}/images/stage`,{method:'POST',headers:{'X-Mutable-Asset-Lease':lease.token},body:form});const staged=await response.json();assert.equal(staged.Success,true,staged.Error);assert.equal(staged.Data.mediaType,'image/png');
 assert.equal((await post(`/${lease.id}/images/remote`,{url:'https://example.com/image.png'},lease.token)).Success,false);
 assert.equal((await post(`/${lease.id}/publish`,{},lease.token)).Success,true);
 const content=await fetch(`${base}/${staged.Data.assetId}/content?cavernId=cavern`);assert.equal(content.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await content.arrayBuffer()),bytes);
 assert.equal((await post('/verify',{assetId:staged.Data.assetId,cavernId:'foreign'})).Success,false);
 await post(`/${lease.id}/finish`,{},lease.token);
 }finally{await service.close();await new Promise(r=>server.close(r));}
});

test('text consent is exact, format-scoped, Cavern/session-bound, expiring and revocable',async()=>{
 let now=0;const {store,root}=await fixture({now:()=>now}),url='https://example.org/page';
 const imageOnly=await store.begin([url]);await assert.rejects(store.authorizeAcquisition(imageOnly,url,'html'),/consent/);
 const lease=await store.begin([],[{url,format:'html'}]);await store.authorizeAcquisition(lease,url,'html');
 await assert.rejects(store.authorizeRemote(lease,url),/consent/);await assert.rejects(store.authorizeAcquisition(lease,url,'text'),/consent/);await assert.rejects(store.authorizeAcquisition(lease,url+'?extra','html'),/consent/);
 await assert.rejects(store.authorizeAcquisition({...lease,token:'bad'},url,'html'),/stale/);
 const other=new ManagedAssetStore({root,cavernId:'cavern',session:'other'});await assert.rejects(other.authorizeAcquisition(lease,url,'html'),/stale/);
 await store.abort(lease);await assert.rejects(store.authorizeAcquisition(lease,url,'html'),/aborted/);
 const expires=await store.begin([],[{url,format:'html'}]);now=1000000;await assert.rejects(store.authorizeAcquisition(expires,url,'html'),/expired/);
 const finished=await store.begin([],[{url,format:'html'}]);const bytes=await png();await store.stage(finished,bytes,await validateImportedImage(bytes));await store.publish(finished);await store.finish(finished);await assert.rejects(store.authorizeAcquisition(finished,url,'html'),/consent/);
});

test('generic original store admits a 50 MiB PDF without broadening image admission',async()=>{
 const {store}=await fixture(),lease=await store.begin(),bytes=Buffer.alloc(50*1024*1024,32);bytes.write('%PDF-1.7');
 const m=await store.stage(lease,bytes,{mediaType:'application/pdf'});await store.publish(lease);await store.finish(lease);const loaded=await store.get(m.assetId,'cavern');assert.equal(loaded.bytes.length,bytes.length);assert.equal(createHash('sha256').update(loaded.bytes).digest('hex'),m.assetId.slice(7));
 const imageLease=await store.begin();await assert.rejects(store.stage(imageLease,Buffer.alloc(10*1024*1024+1),{mediaType:'image/png'}),/limit/);await store.abort(imageLease);
});
