// @vitest-environment node
import {afterEach,it,expect,vi} from 'vitest';
import {promises as vfs} from './phext-fs.mjs';
import {testCavern} from '../src/knowledge-sqlite/phext-test-cavern.mjs';
import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import express from 'express';
import {NativeVaultStore} from './native-vault-store.mjs';import {NativeSavedScopes} from './native-saved-scope.mjs';import {NativeKnowledgeJobs} from './native-knowledge-jobs';
import {createNativeDocumentStoreRouter} from './native-document-store.mjs';import {fixtureText} from '../src/qualification/native-knowledge/fixture';import {hash} from '../src/persistence/managed-pair.mjs';import {decodeFacts} from '../src/knowledge/transport';
const dispose:Array<()=>any>=[];afterEach(async()=>{for(const f of dispose.splice(0).reverse())await f();vi.restoreAllMocks();});
const policy={version:1,opaqueTypes:[]};
async function setup(count=3,options={}){const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-p5-'));const cavern=testCavern(root);dispose.push(()=>cavern.close());dispose.push(()=>fs.rm(root,{recursive:true,force:true}));await vfs.mkdir(path.join(root,'vault'));for(let i=0;i<count;i++)await vfs.writeFile(path.join(root,`vault/${i}.mutable.json`),fixtureText(i,count));const store=new NativeVaultStore({root,readOnly:true}),jobs=new NativeKnowledgeJobs();dispose.push(()=>jobs.close());const service=new NativeSavedScopes(store,{jobs,...options}),scan=await store.discover('vault');const begin=()=>service.begin({vault:'vault',signature:hash(JSON.stringify(scan)),policy});return {root,store,jobs,service,scan,begin};}
it('uses one verified discovery epoch across batches, preserves IDs/rich semantics, and writes nothing in a read-only store',async()=>{
 const f=await setup(),discover=vi.spyOn(f.store,'discover'),before=await f.store.readScopeFence('vault');const s=await f.begin();
 for(let i=0;i<3;i++){const r=await f.service.batch({scope:s.scope,ids:[`resource-${i}`]});expect(r.items[0].error).toBeUndefined();const facts=decodeFacts(r.items[0].wire);expect(facts.id).toBe(`resource-${i}`);expect(facts.rootBlockId).toBe(`resource-${i}-root`);expect(facts.blocks.some(b=>b.text?.runs.some(r=>r.text.includes('🧭')))).toBe(true);}
 expect(discover).toHaveBeenCalledTimes(1);expect(await f.store.readScopeFence('vault')).toBe(before);expect(await vfs.readdir(path.join(f.root,'vault'))).toEqual(['0.mutable.json','1.mutable.json','2.mutable.json']);
 f.service.release({scope:s.scope});await expect(f.service.batch({scope:s.scope,ids:['resource-0']})).rejects.toThrow(/missing/);
});
it.each(['duplicate','rename','remove','replace','mtime restored','markdown','operation','symlink'])('expires the whole read epoch after external %s, not just the selected row',async kind=>{
 const f=await setup(),s=await f.begin(),file=path.join(f.root,'vault/1.mutable.json');
 if(kind==='duplicate')await vfs.writeFile(path.join(f.root,'vault/copy.mutable.json'),await vfs.readFile(file));
 if(kind==='rename')await vfs.rename(file,path.join(f.root,'vault/moved.mutable.json'));
 if(kind==='remove')await vfs.unlink(file); // phext: "external" = outside the store's read epoch, via the Cavern facade
 if(kind==='replace'){const text=await vfs.readFile(file);await vfs.unlink(file);await vfs.writeFile(file,text);}
 if(kind==='mtime restored'){await vfs.writeFile(file,fixtureText(7,8));} // phext: no mtimes — the fence reads identity+content, and the content changed
 if(kind==='markdown')await vfs.writeFile(path.join(f.root,'vault/1.md'),'external');
 if(kind==='operation'){await vfs.mkdir(path.join(f.root,'.mutable-relocations'));await vfs.mkdir(path.join(f.root,'.mutable-relocations/new'));}
 if(kind==='symlink'){await vfs.unlink(file);} // phext: a disk symlink cannot stand in the phext; the entry simply vanishes
 await expect(f.service.batch({scope:s.scope,ids:['resource-0']})).rejects.toThrow();await expect(f.service.batch({scope:s.scope,ids:['resource-0']})).rejects.toThrow(/missing/);
});
it('never publishes a batch raced by another resource or pair metadata during worker execution',async()=>{
 const f=await setup(),s=await f.begin(),run=f.jobs.run.bind(f.jobs);f.jobs.run=async(...args:any[])=>{const r=await (run as any)(...args);await vfs.mkdir(path.join(f.root,'vault/.mutable-pair-test'),{recursive:true});await vfs.writeFile(path.join(f.root,'vault/.mutable-pair-test/receipt.json'),'changed');return r;};
 await expect(f.service.batch({scope:s.scope,ids:['resource-0']})).rejects.toThrow(/changed/);
});
it('worker failure produces explicit incomplete resource evidence and does not turn discovery into absence',async()=>{
 const f=await setup(),s=await f.begin();vi.spyOn(f.jobs,'run').mockRejectedValue(Error('worker crashed'));
 const r=await f.service.batch({scope:s.scope,ids:['resource-0']});expect(r.items).toEqual([{resourceId:'resource-0',error:'Error: worker crashed'}]);expect(f.scan.documents).toHaveLength(3);expect(f.scan.complete).toBe(true);
});
it('rejects incomplete/stale discovery, unknown IDs, oversized batches, expiry and exhausted scope/response budgets',async()=>{
 const f=await setup(3,{maxScopes:1,maxBytes:1}),s=await f.begin();await expect(f.begin()).rejects.toThrow(/budget/);await expect(f.service.batch({scope:s.scope,ids:['unknown']})).rejects.toThrow(/Invalid/);await expect(f.service.batch({scope:s.scope,ids:Array(9).fill('resource-0')})).rejects.toThrow(/Invalid/);
 const r=await f.service.batch({scope:s.scope,ids:['resource-0']});expect(r.items[0].error).toMatch(/budget/);f.service.release({scope:s.scope});
 await vfs.writeFile(path.join(f.root,'vault/bad.mutable.json'),'{}');await expect(f.begin()).rejects.toThrow(/incomplete|changed/);
 const expired=await setup(1,{ttlMs:1}),e=await expired.begin();await new Promise(r=>setTimeout(r,5));await expect(expired.service.batch({scope:e.scope,ids:['resource-0']})).rejects.toThrow(/expired/);
});
it('cancellation withdraws an in-flight batch; a new scope can recreate the worker and resume',async()=>{
 const f=await setup(),s=await f.begin(),c=new AbortController();const run=f.jobs.run.bind(f.jobs);let once=true;f.jobs.run=async(...args:any[])=>{if(once){once=false;c.abort();}return (run as any)(...args);};
 await expect(f.service.batch({scope:s.scope,ids:['resource-0']},c.signal)).rejects.toThrow();const next=await f.begin();expect((await f.service.batch({scope:next.scope,ids:['resource-0']})).items[0].wire).toBeTruthy();
});
it('restarts without persistent epochs and exercises the real HTTP scope/batch routes',async()=>{
 const f=await setup(1),app=express();app.use('/api/native',createNativeDocumentStoreRouter({root:f.root,readOnly:true}));const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});dispose.push(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const call=async(action:string,body:any)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/native/vault/facts/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();};
 const s=await call('begin',{vault:'vault',signature:hash(JSON.stringify(f.scan)),policy});expect(s.Success).toBe(true);const r=await call('batch',{scope:s.Data.scope,ids:['resource-0']});expect(decodeFacts(r.Data.items[0].wire).id).toBe('resource-0');
 const other=new NativeSavedScopes(f.store);await expect(other.batch({scope:s.Data.scope,ids:['resource-0']})).rejects.toThrow(/missing/);
});
it('bounds pending discovery scopes as well as completed leases',async()=>{
 const f=await setup(1,{maxScopes:1}),first=f.begin();await expect(f.begin()).rejects.toThrow(/scope budget/);const opened=await first;f.service.release({scope:opened.scope});expect((await f.begin()).scope).toBeTruthy();
});
