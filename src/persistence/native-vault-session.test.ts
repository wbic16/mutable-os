// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ReactiveEditor } from '../reactive-editor/editor';
import { nativeDocumentSession } from './native-session';
import { captureNative, nativeText } from './native-resource';
import { createNativeDocumentStoreRouter } from '../../server/native-document-store.mjs';
import { promises as vfs } from '../../server/phext-fs.mjs';
import { testCavern } from '../knowledge-sqlite/phext-test-cavern.mjs';
// Phext-only: relocation is a VFS rename; the native relocation helper and its build are deleted.
const cleanup:Array<()=>any>=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();vi.unstubAllGlobals();});
async function host(fault: (stage:string)=>Promise<void>=async()=>{}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'c1a-session-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));const cavern=testCavern(root);cleanup.push(()=>cavern.close());await vfs.writeFile(path.join(root,'rich.mutable.json'),await fs.readFile('artifacts/flint-b1.2/rich.mutable.json'));
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,fault}));const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});cleanup.push(()=>new Promise(r=>server.close(r)));
 const actual=globalThis.fetch;vi.stubGlobal('fetch',(input:any,options:any)=>actual(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,options));
 const make=()=>{const editor=new ReactiveEditor({id:crypto.randomUUID(),type:'workspace-block',children:[{id:crypto.randomUUID(),type:'workspace-object-bank-block',children:[]}]});cleanup.push(()=>editor.dispose());return {editor,service:nativeDocumentSession(editor)}};
 const one=make(),id=await one.service.open({folder:'.',filename:'rich.mutable.json'});await one.service.save(id);
 const request=async()=>({operationId:crypto.randomUUID(),vault:'.',kind:'pair' as const,source:'rich.mutable.json',destination:'renamed.mutable.json',baselines:(await one.service.discoverVault('.')).documents.map((d:any)=>({resourceId:d.resourceId,baseline:d.baseline}))});
 return {root,cavern,...one,id,make,request};
}
it('changes only the resource binding with zero occurrences and rejects automatic same-ID adoption by another session',async()=>{
 const f=await host(),two=f.make();await two.service.open({folder:'.',filename:'rich.mutable.json'});const before=nativeText(captureNative(f.editor.repository.snapshot(),f.id)),q=await f.request();
 expect(f.editor.projections.size).toBe(0);const result=await f.service.relocateVault(q);expect(result.phase).toBe('relocated');expect(f.service.location(f.id)?.filename).toBe('renamed.mutable.json');expect(nativeText(captureNative(f.editor.repository.snapshot(),f.id))).toBe(before);
 expect(f.editor.persistence.workspaceReference(f.id)?.source.filename).toBe('renamed.mutable.json');await expect(two.service.open({folder:'.',filename:'renamed.mutable.json'})).rejects.toThrow('another location');expect((await two.service.save(f.id))?.phase).toBe('failed');
 const fresh=f.make();expect(await fresh.service.open({folder:'.',filename:'renamed.mutable.json'})).toBe(f.id);
});
it('retains edits and shared identity across two occurrences and their disposal during relocation',async()=>{
 let enter!:()=>void,resume!:()=>void;const entered=new Promise<void>(r=>enter=r),held=new Promise<void>(r=>resume=r);
 const f=await host(async stage=>{if(stage==='relocation-after-0'){enter();await held;}}),q=await f.request();
 const root=Object.values(f.editor.repository.state.contents).find(c=>c.viewType==='document-block')!,p=Object.values(f.editor.repository.state.placements).find(p=>p.contentKey===root.key)!;
 const a=f.editor.createView('one',p.key),b=f.editor.createView('two',p.key),before=await vfs.readFile(path.join(f.root,'rich.mutable.json'),'utf8');
 const moving=f.service.relocateVault(q);await entered;f.editor.commands.setPayloadField(p.key,'metadata',{...root.payload.metadata as any,title:'Edited during relocation'});f.editor.disposeView(a);f.editor.disposeView(b);resume();expect((await moving).phase).toBe('relocated');
 expect(await vfs.readFile(path.join(f.root,'renamed.mutable.json'),'utf8')).toBe(before);expect(f.service.status(f.id)).toContain('unsaved edits');expect(nativeText(captureNative(f.editor.repository.snapshot(),f.id))).toContain('Edited during relocation');
 expect((await f.service.save(f.id))?.phase).toBe('saved');expect(await vfs.readFile(path.join(f.root,'renamed.mutable.json'),'utf8')).toContain('Edited during relocation');
});
it('queues Save behind relocation so it uses the confirmed new binding',async()=>{
 let enter!:()=>void,resume!:()=>void;const entered=new Promise<void>(r=>enter=r),held=new Promise<void>(r=>resume=r);
 const f=await host(async stage=>{if(stage==='relocation-after-0'){enter();await held;}}),moving=f.service.relocateVault(await f.request());await entered;const saved=f.service.save(f.id);resume();expect((await moving).phase).toBe('relocated');expect((await saved)?.phase).toBe('saved');expect(await fs.stat(path.join(f.root,'rich.mutable.json')).catch(()=>null)).toBeNull();
});
it('recovers an uncertain response through the same resource-owned operation',async()=>{
 const f=await host(),original=globalThis.fetch,q=await f.request();let lost=true;
 vi.stubGlobal('fetch',async(input:any,options:any)=>{const response=await original(input,options);if(lost&&String(input).endsWith('/vault/relocate')){lost=false;await response.text();throw Error('connection lost');}return response;});
 await expect(f.service.relocateVault(q)).rejects.toThrow('connection lost');await expect(f.service.save(f.id)).rejects.toThrow('pending relocation');expect((await f.service.recoverRelocation(q.operationId)).phase).toBe('relocated');expect(f.service.location(f.id)?.filename).toBe('renamed.mutable.json');
});
it('a newer discovery result cannot replace a stale live baseline to authorize relocation',async()=>{
 const f=await host(),two=f.make();await two.service.open({folder:'.',filename:'rich.mutable.json'});
 const root=Object.values(f.editor.repository.state.contents).find(c=>c.viewType==='document-block')!,p=Object.values(f.editor.repository.state.placements).find(p=>p.contentKey===root.key)!;f.editor.commands.setPayloadField(p.key,'metadata',{...root.payload.metadata as any,title:'new'});await f.service.save(f.id);
 await expect(two.service.relocateVault(await f.request())).rejects.toThrow('stale editor baseline');
});
it('a fresh session can recover a recorded operation without adopting any live binding',async()=>{
 const f=await host(),q=await f.request();expect((await f.service.relocateVault(q)).phase).toBe('relocated');const fresh=f.make();expect((await fresh.service.recoverRelocation(q.operationId)).phase).toBe('relocated');expect(fresh.service.location(f.id)).toBeUndefined();expect(fresh.editor.projections.size).toBe(0);expect(await fresh.service.open({folder:'.',filename:'renamed.mutable.json'})).toBe(f.id);
});
it('passes query cancellation through the real discovery transport',async()=>{const f=await host(),controller=new AbortController();controller.abort();await expect(f.service.discoverVault('.',controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(f.service.location(f.id)?.filename).toBe('rich.mutable.json');});
it('cannot use relocation to adopt an externally moved same-ID pair with unchanged hashes',async()=>{
 const f=await host();await vfs.mkdir(path.join(f.root,'outside-move'));for(const name of await vfs.readdir(f.root)){if(name==='rich.mutable.json'||name==='rich.md'||name.startsWith('.mutable-pair-'))await vfs.rename(path.join(f.root,name),path.join(f.root,'outside-move',name));}
 const scan=await f.service.discoverVault('outside-move');expect(scan.documents[0].state).toBe('paired');const q={operationId:crypto.randomUUID(),vault:'outside-move',kind:'pair' as const,source:'outside-move/rich.mutable.json',destination:'outside-move/renamed.mutable.json',baselines:scan.documents.map((d:any)=>({resourceId:d.resourceId,baseline:d.baseline}))};
 await expect(f.service.relocateVault(q)).rejects.toThrow('differs from the live binding');expect(f.service.location(f.id)?.filename).toBe('rich.mutable.json');expect(await vfs.stat(path.join(f.root,'outside-move/rich.mutable.json'))).toBeTruthy();
});


it('manually saves portable managed image references to the opened filename and reopens them without fetching or rewriting originals',async()=>{
 const {imagesFragment}=await import('../interchange/clipboard-images');
 const {materializeFragment}=await import('../interchange/materialize');
 const {assetKey}=await import('../interchange/managed-asset');
 const f=await host();
 // Run the actual Node service outside jsdom's transformed import.meta.url.
 const item=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
   import {ManagedAssetStore} from './server/managed-assets.mjs';
   import {validateImportedImage} from './server/asset-image-validation.mjs';
   import {closeFilesystemWorkers,registerPhextBackend} from './scripts/stage-c-gates/filesystem.mjs';
   import {PhextVFS} from './dist/src/phext/vfs.js';
   import {registerPhextFs} from './dist/server/phext-fs.mjs';
   import sharp from 'sharp';
   const childVfs=PhextVFS.openOrCreate(process.argv[1]+'/cavern.phext');registerPhextFs({root:process.argv[1],vfs:childVfs});registerPhextBackend({root:process.argv[1],vfs:childVfs});
   const store=new ManagedAssetStore({root:process.argv[1],cavernId:'saved-cavern',session:'save-session'});
   const bytes=await sharp({create:{width:3,height:2,channels:3,background:'blue'}}).jpeg().toBuffer();
   const lease=await store.begin(),item=await store.stage(lease,bytes,await validateImportedImage(bytes));
   await store.publish(lease);await store.finish(lease);await store.close();childVfs.flush();await closeFilesystemWorkers();
   console.log(JSON.stringify(item));
 `,f.root],{encoding:'utf8'}));
 f.cavern.flush(); // rebase this process's VFS instance onto the child's published generation
 const originalPath=path.join(f.root,'.mutable/assets/objects',item.assetId.slice(7,9),item.assetId.slice(7),'original');
 const bytes=await vfs.readFile(originalPath);
 const ref={kind:'managed' as const,cavernId:'saved-cavern',assetId:item.assetId};
 const fragment=imagesFragment([{name:'photo.jpg',blob:new Blob()}]);fragment.embeds[0].data.asset=ref;
 const materialized=materializeFragment(fragment,{cavernId:ref.cavernId},new Map([[assetKey(ref),ref.assetId]]));
 const root=Object.values(f.editor.repository.readState().contents).find(c=>c.viewType==='document-block')!;
 const placement=Object.values(f.editor.repository.readState().placements).find(p=>p.contentKey===root.key)!;
 const view=f.editor.createView('image-save',placement.key);
 const before=await vfs.readFile(path.join(f.root,'rich.mutable.json'),'utf8');
 f.editor.commands.insertFragment(materialized,{kind:'at',parentKey:view.state.rootKey,index:0});
 expect(await vfs.readFile(path.join(f.root,'rich.mutable.json'),'utf8')).toBe(before);
 expect((await f.service.save(f.id))?.phase).toBe('saved');
 expect(f.service.location(f.id)?.filename).toBe('rich.mutable.json');
 const saved=await vfs.readFile(path.join(f.root,'rich.mutable.json'),'utf8');expect(saved).toContain(ref.assetId);expect(saved).not.toContain('blob:');
 const fresh=f.make();await fresh.service.open({folder:'.',filename:'rich.mutable.json'});
 expect(Object.values(fresh.editor.repository.readState().contents).find(c=>c.viewType==='image-cell'&&(c.payload.asset as any)?.assetId===ref.assetId)?.payload.asset).toEqual(ref);
 f.editor.repository.undo();expect((await vfs.readFile(originalPath)).equals(bytes)).toBe(true);
 f.editor.repository.redo();expect(Object.values(f.editor.repository.readState().contents).some(c=>c.viewType==='image-cell'&&(c.payload.asset as any)?.assetId===ref.assetId)).toBe(true);
 expect(await vfs.readFile(path.join(f.root,'rich.mutable.json'),'utf8')).toBe(saved);
});
