// @vitest-environment node
import {afterEach,expect,it} from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import os from 'node:os';
import {SqliteKnowledgeHost} from './sqlite-knowledge-host';
import {createNativeDocumentStoreRouter} from './native-document-store.mjs';
import {createDocumentStoreRouter} from './document-store';
import {decodeBlockTree} from '../src/block-tree/codecs';
import {captureNative,decodeNative,nativeText} from '../src/persistence/native-resource';
import {exportMarkdown} from '../src/persistence/markdown';
import {testCavern} from '../src/knowledge-sqlite/phext-test-cavern.mjs';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
async function fixture(options:any={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'p3a-http-')));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));const cavern=testCavern(root);cleanup.push(()=>cavern.close());
 const host=new SqliteKnowledgeHost({root,debounceMs:60000,readOnly:options.readOnly});cleanup.push(()=>host.close());
 const app=express();app.use('/knowledge',host.router());app.use('/native',createNativeDocumentStoreRouter({root,...options,coordinate:a=>host.foreground(a)}));app.use(express.json());app.use(createDocumentStoreRouter({root,coordinate:a=>host.foreground(a),readOnly:options.readOnly}));
 const server:any=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});cleanup.push(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(url:string,body:any)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
 const generation=async(file='rich',title='Original')=>{const r:any=structuredClone(decodeNative(await fs.readFile(`artifacts/flint-b1.2/${file}.mutable.json`)));const root=r.contents[r.placements[r.rootPlacementKey].target.contentKey];root.payload.metadata={...root.payload.metadata,title};const native=nativeText(r),md=exportMarkdown(r);return {resourceId:r.resourceId,generation:crypto.randomUUID(),native,markdown:md.text,profile:md.profile,targets:[]};};
 const location={folder:'.',filename:'paper.mutable.json'},absent={nativeHash:null,markdownHash:null,generation:null};
 return {root,host,call,generation,location,save:(generation:any,baseline=absent)=>call('/native/save',{location,generation,baseline})};
}
it('real native/legacy publication routes schedule saved indexing without altering receipts or providers',async()=>{
 const f=await fixture();const one=(await f.call('/knowledge/open',{vault:'.'})).Data,two=(await f.call('/knowledge/open',{vault:'.'})).Data;expect(one.vaultGuid).toBe(two.vaultGuid);
 const g=await f.generation(),saved=await f.save(g);expect(saved.Data.result.phase).toBe('saved');expect(saved.Data.baseline.nativeHash).toBeTruthy();await f.host.flush();expect((await f.call('/knowledge/status',{lease:one.lease})).Data.coverage.resources).toBe(1);
 expect((await f.save(await f.generation('rich','new'),saved.Data.baseline)).Data.result.phase).toBe('saved');expect((await f.save(await f.generation('rich','stale'),saved.Data.baseline)).Data.result.phase).toBe('failed');await f.host.flush();
 const opened=await f.call('/native/open',{location:f.location});expect(opened.Data.native).toContain('new');expect(opened.Data.native).not.toContain('stale');
 expect((await f.call('/saveDocumentJson',{folder:'.',filename:'legacy.json',document:{type:'main-list-block',id:'legacy',children:[]}})).Success).toBe(true);await f.host.flush();expect((await f.call('/knowledge/status',{lease:one.lease})).Data.coverage.resources).toBe(2);
 await f.call('/knowledge/release',{lease:one.lease});expect((await f.call('/knowledge/status',{lease:two.lease})).Success).toBe(true);
});
it('partial pair and missing dependency cannot become complete index evidence; recovery retains exact publication',async()=>{
 let fault=true;const f=await fixture({fault:async(stage:string)=>{if(fault&&stage==='after-native')throw Error('interrupt');}}),l=(await f.call('/knowledge/open',{vault:'.'})).Data,g=await f.generation();
 expect((await f.save(g)).Data.result.phase).toBe('canonical-saved-markdown-pending');await f.host.flush();expect((await f.host.status(l.lease)).coverage.complete).toBe(false);
 fault=false;expect((await f.save(g)).Data.result.phase).toBe('saved');await f.host.flush();expect((await f.host.status(l.lease)).coverage.resources).toBe(1);
 const owner=await f.generation('a');const failed=await f.call('/native/save',{location:{folder:'.',filename:'owner.mutable.json'},generation:owner,baseline:{nativeHash:null,markdownHash:null,generation:null}});expect(failed.Data.result.phase).toBe('failed');await f.host.flush();expect((await f.host.status(l.lease)).coverage.resources).toBe(1);
});
it('actual read-only routes preserve files and report unavailable saved coverage',async()=>{
 const f=await fixture({readOnly:true}),l=await f.call('/knowledge/open',{vault:'.'});
 expect(l.Success).toBe(false);expect(l.Data).toBeUndefined();expect((await f.save(await f.generation())).status).toBe(403);await expect(fs.stat(path.join(f.root,'.mutable'))).rejects.toThrow();
});
it('Vault establishment reuses a warm application policy without replacing it or losing its lease',async()=>{
 const f=await fixture(),policy={version:1 as const,opaqueTypes:['application-block','timer-block']};
 const open=await f.host.acquire('.',policy);
 expect((await f.host.establish('.')).vaultGuid).toBe(open.vaultGuid);
 expect((await f.host.status(open.lease)).vaultGuid).toBe(open.vaultGuid);
 await expect(f.host.acquire('.',{version:1,opaqueTypes:[]})).rejects.toThrow(/policy differs/);
 await f.host.release(open.lease);
 expect((await f.host.establish('.')).vaultGuid).toBe(open.vaultGuid);
});
it('retrieval receives only confirmed saved projections and never delays a foreground save',async()=>{
 const make=(text:string)=>{const r=captureNative(decodeBlockTree({id:'retrieval-doc',type:'document-block',children:[{id:'retrieval-text',type:'standoff-editor-block',text}]}).state,'retrieval-doc'),md=exportMarkdown(r);return {resourceId:r.resourceId,generation:crypto.randomUUID(),native:nativeText(r),markdown:md.text,profile:md.profile,targets:[]};};
 const f=await fixture(),lease=await f.host.acquire('.');const firstStart=performance.now();const saved=await f.save(make('first saved text'));const baselineSaveMs=performance.now()-firstStart;expect(saved.Data.result.phase).toBe('saved');await f.host.flush();
 const {openRetrievalService}=await import('../src/retrieval/client.mjs');
 const service=await openRetrievalService({vault:f.root,vaultGuid:lease.vaultGuid,profile:{provider:'test',model:'deterministic-test',dimensions:32},providerModule:pathToFileURL(path.resolve('src/retrieval/test-provider.mjs')).href,providerOptions:{delayMs:250}});
 await f.host.attachRetrieval(lease.lease,service);expect(await f.host.flushRetrieval(lease.lease)).toMatchObject({complete:true,issues:[]});expect((await service.status()).passages).toBeGreaterThan(0);
 const output=await service.query('first saved text');expect(output.results.length).toBeGreaterThan(0);expect(output.results[0].source.liveCurrency).toBe('unknown');
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const foreground=f.host.foreground(()=>gate);await expect(service.query('during unconfirmed save')).rejects.toThrow(/not currently confirmed/);release();await foreground;await f.host.flush();await f.host.flushRetrieval(lease.lease);
 const pending=service.query('superseded by a save');const cancelled=expect(pending).rejects.toThrow(/cancel|superseded|confirmed/i);await new Promise(r=>setTimeout(r,20));
 const start=performance.now();const next=await f.save(make('second saved text'),saved.Data.baseline);const concurrentSaveMs=performance.now()-start;await cancelled;console.log('retrieval-save-qualification',JSON.stringify({baselineSaveMs,concurrentSaveMs,providerDelayMs:250,maxForegroundWaitMs:f.host.metrics.maxForegroundWaitMs}));expect(next.Data.result.phase).toBe('saved');await f.host.flush();await f.host.flushRetrieval(lease.lease);expect((await service.query('second saved text')).results.some((r:any)=>r.text.includes('second saved text'))).toBe(true);
 const timings:{idle:number[],active:number[]}={idle:[],active:[]};let baseline=next.Data.baseline;
 for(let i=0;i<6;i++){
   const active=i%2===1,pending=active?service.query('obsolete timing query'):undefined;
   const cancelled=pending?expect(pending).rejects.toThrow(/cancel|superseded|confirmed/i):undefined;
   if(active)await new Promise(r=>setTimeout(r,20));
   const start=performance.now(),result=await f.save(make('timing text '+i),baseline);timings[active?'active':'idle'].push(performance.now()-start);expect(result.Data.result.phase).toBe('saved');baseline=result.Data.baseline;
   await cancelled;await f.host.flush();await f.host.flushRetrieval(lease.lease);
 }
 console.log('retrieval-warm-save-qualification',JSON.stringify(timings));
 await f.host.release(lease.lease);
});
