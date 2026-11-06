import {afterEach,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {SqliteKnowledgeHost} from './sqlite-knowledge-host';
import {testCavern} from '../src/knowledge-sqlite/phext-test-cavern.mjs';

const cleanup:Array<()=>any>=[];
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();vi.restoreAllMocks();});
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'entity-create-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));
 const cavern=testCavern(root);cleanup.push(()=>cavern.close());
 const host=new SqliteKnowledgeHost({root,debounceMs:60000});cleanup.push(()=>host.close());
 // A selected, established Vault may contain no saved Documents at all.
 await host.establish('.');
 return {root,host};
}
it('creates in an existing Vault without a Document, reuses an operation safely, and refreshes lookup results',async()=>{
 const {host}=await fixture();
 const lookup=()=>host.entityLookup({vault:'.',request:{op:'search',query:'1842',stream:'name',match:'exact'}});
 expect((await lookup()).matches).toEqual([]);
 const input={vault:'.',request:{op:'create',id:randomUUID(),operationId:randomUUID(),name:'1842'}};
 const scan=vi.spyOn(host.store,'discover').mockRejectedValue(Error('Must not scan source Documents'));
 const created=await host.entityMutate(input);expect(created.entity.name).toBe('1842');
 expect((await host.entityMutate(input)).entity.id).toBe(created.entity.id);
 expect((await lookup()).matches.map(m=>m.id)).toEqual([created.entity.id]);
 expect(scan).not.toHaveBeenCalled();expect(host.metrics.sweeps).toBe(0);
});
it('reports read-only, missing-Vault and cancelled creates as not dispatched',async()=>{
 const {root,host}=await fixture(),reader=new SqliteKnowledgeHost({root,readOnly:true});cleanup.push(()=>reader.close());
 const request={op:'create',id:randomUUID(),operationId:randomUUID(),name:'1842'};
 await expect(reader.entityMutate({vault:'.',request})).rejects.toMatchObject({entityCreationOutcome:'not-created',message:expect.stringContaining('read-only')});
 await fs.mkdir(path.join(root,'empty'));
 await expect(host.entityMutate({vault:'empty',request})).rejects.toMatchObject({entityCreationOutcome:'not-created'});
 await expect(fs.stat(path.join(root,'empty/.mutable'))).rejects.toThrow();
 const signal=new AbortController();signal.abort();
 await expect(host.entityMutate({vault:'.',request},signal.signal)).rejects.toMatchObject({entityCreationOutcome:'not-created'});
 expect((await host.entityLookup({vault:'.',request:{op:'get',id:request.id}})).entity).toBeUndefined();
});
it('interrupts background reconciliation before dispatching a foreground Entity write',async()=>{
 const {root}=await fixture();let started!:()=>void;
 const entered=new Promise<void>(r=>{started=r;});
 let cancelled=false;
 const host=new SqliteKnowledgeHost({root,debounceMs:60000,indexer:()=>({refresh:({signal}:any)=>new Promise((_resolve,reject)=>{
  signal.addEventListener('abort',()=>{cancelled=true;reject(signal.reason);},{once:true});started();
 })}) as any});cleanup.push(()=>host.close());
 const lease=await host.acquire('.');const indexing=host.flush();await entered;
 const result=await host.entityMutate({vault:'.',request:{op:'create',id:randomUUID(),operationId:randomUUID(),name:'1842'}});
 expect(cancelled).toBe(true);expect(result.entity.name).toBe('1842');await indexing;await host.release(lease.lease);
});
