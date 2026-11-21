// @vitest-environment node
import {it,expect,afterEach,vi} from 'vitest';
import {hash} from '../src/persistence/managed-pair.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {SqliteKnowledgeHost} from './sqlite-knowledge-host';import {CavernRetrieval} from './retrieval-host';
const clean:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const f of clean.splice(0).reverse())await f();});
async function fixture(){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'retrieval-c-')));clean.push(()=>fs.rm(root,{recursive:true,force:true}));
 const sql=new SqliteKnowledgeHost({root,debounceMs:60000});clean.push(()=>sql.close());const lease=await sql.acquire('.');
 const options={delayMs:5,profile:{provider:'test',model:'deterministic-test',dimensions:32},providerModule:pathToFileURL(path.resolve('src/retrieval/test-provider.mjs')).href,providerOptions:{external:true}};
 let host=new CavernRetrieval(sql,root,lease.vaultGuid,options);clean.push(()=>host.close());await host.start();
 const save=async(text:string)=>{await sql.foreground(()=>fs.writeFile(path.join(root,'doc.json'),JSON.stringify({id:'resource',type:'document-block',children:[{id:'p',type:'standoff-editor-block',text}]})));await sql.flush();};
 const settle=async()=>{for(let i=0;i<200;i++){const s=await host.status();if(s.index.complete||s.index.issues?.length||s.error) return s;await new Promise(r=>setTimeout(r,10));}throw Error('index did not settle');};
 return {root,sql,lease,options,save,settle,get host(){return host;},async restart(){await host.close();host=new CavernRetrieval(sql,root,lease.vaultGuid,options);await host.start();}};
}
it('persists refusal, explicit scope consent, automatic confirmed saves, reuse, revocation and restart',async()=>{
 const f=await fixture();await f.save('Ship continuity and repair.');expect((await f.host.status()).decision).toBe('unasked');
 await f.host.configure({indexDocuments:false,embedQueries:false,documentTokens:2000,queryTokens:500});await f.restart();expect((await f.host.status()).decision).toBe('declined');
 await expect(f.host.query({query:'ship',strategy:'hybrid'})).rejects.toThrow(/authorisation/);
 const lexical=await f.host.query({query:'ship',strategy:'lexical'});expect(lexical.results).toHaveLength(1);
 await f.host.configure({indexDocuments:true,embedQueries:false,documentTokens:2000,queryTokens:500});expect((await f.settle()).indexed).toBe(1);const cost=(await f.host.status()).documentTokensUsed;
 await f.host.refresh();await f.sql.flush();await f.settle();expect((await f.host.status()).documentTokensUsed).toBe(cost);
 await f.save('A revised ship retains an organised history.');await f.settle();expect((await f.host.status()).documentTokensUsed).toBeGreaterThan(cost);
 await f.restart();await f.settle();expect((await f.host.status()).documents).toBe(true);
 await f.host.configure({indexDocuments:true,embedQueries:true,documentTokens:2000,queryTokens:500});expect((await f.host.query({query:'history',strategy:'hybrid',resourceId:'resource'})).results).toHaveLength(1);
 await f.host.configure({indexDocuments:true,embedQueries:true,documentTokens:2000,queryTokens:500,renew:true});expect((await f.host.status()).queryTokensUsed).toBe(0);
 await f.host.configure({indexDocuments:false,embedQueries:false,documentTokens:2000,queryTokens:500});await f.restart();expect((await f.host.status()).queries).toBe(false);await expect(f.host.query({query:'history',strategy:'hybrid'})).rejects.toThrow(/authorisation/);
},20000);
it('distinct Caverns keep independent preferences, identity and upload scopes',async()=>{
 const a=await fixture(),b=await fixture();await a.save('A ship');await b.save('B clock');await a.host.configure({indexDocuments:true,embedQueries:true,documentTokens:1000,queryTokens:500});await a.settle();expect((await b.host.status()).decision).toBe('unasked');expect(a.lease.vaultGuid).not.toBe(b.lease.vaultGuid);await expect(b.host.query({query:'clock',strategy:'hybrid'})).rejects.toThrow(/authorisation/);
});
it('searches independently verified files while the Cavern scan is pending or incomplete, without scope scans or uploads',async()=>{
 const f=await fixture();await f.save('The wealthy hide in a fortified abbey.');
 await f.sql.foreground(()=>fs.writeFile(path.join(f.root,'broken.json'),'{"id":'));
 expect((await f.sql.status(f.lease.lease)).pending).toBe(true);
 const discover=vi.spyOn(f.sql.store,'discover'),fence=vi.spyOn(f.sql.store,'readScopeFence');
 const query=()=>f.host.query({query:'wealthy',strategy:'lexical'});
 const pending=await query();expect(pending.results).toHaveLength(1);expect(pending.coverage.sourceVerification).toBe('exact-saved-file');expect(pending.coverage.verifiedResources).toBe(1);
 expect(discover).not.toHaveBeenCalled();expect(fence).not.toHaveBeenCalled();
 await f.sql.flush();expect((await f.sql.status(f.lease.lease)).coverage.complete).toBe(false);
 expect((await query()).results).toHaveLength(1);expect((await f.host.status()).documentTokensUsed).toBe(0);
 // An unrelated corrupt file must also not prevent approved, per-source maintenance.
 await f.host.configure({indexDocuments:true,embedQueries:false,documentTokens:2000,queryTokens:500});
 const lease=(f.host as any).lease;await f.sql.flushRetrieval(lease);
 const status=await f.host.status();expect(status.indexed).toBe(1);expect(status.index.complete).toBe(false);expect(status.index.coverage.complete).toBe(false);
});
it('rejects externally changed, missing, pending-save and symlink sources before returning saved evidence',async()=>{
 const f=await fixture();await f.save('The wealthy hide in an abbey.');const file=path.join(f.root,'doc.json'),bytes=await fs.readFile(file);
 const query=()=>f.host.query({query:'wealthy',strategy:'lexical'});
 const hit=(await query()).results[0],reference={vaultGuid:f.lease.vaultGuid,resourceId:hit.source.resourceId,stamp:hit.stamp};
 await fs.writeFile(file,'Changed outside Mutable');expect((await query()).coverage.unverifiedCandidates).toBe(1);await expect(f.host.verify(reference)).rejects.toThrow(/changed/);
 await f.host.configure({indexDocuments:true,embedQueries:false,documentTokens:2000,queryTokens:500});await f.sql.flushRetrieval((f.host as any).lease);
 expect((await f.host.status()).documentTokensUsed).toBe(0);expect((await f.host.status()).index.issues[0].error).toMatch(/changed/);
 await f.host.configure({indexDocuments:false,embedQueries:false,documentTokens:2000,queryTokens:500});
 await fs.unlink(file);expect((await query()).results).toHaveLength(0);
 await fs.writeFile(file,bytes);expect((await query()).results).toHaveLength(1);
 for(const home of [path.join(f.root,'.mutable','document-saves',hash('resource')),path.join(f.root,'.mutable-pair-'+hash('resource'))]){
  await fs.mkdir(home,{recursive:true});await fs.writeFile(path.join(home,'pending.json'),'{}');
  expect((await query()).results).toHaveLength(0);await expect(f.host.verify(reference)).rejects.toThrow(/recovery/);
  await fs.unlink(path.join(home,'pending.json'));
 }
 await fs.rename(file,path.join(f.root,'real.json'));await fs.symlink('real.json',file);expect((await query()).results).toHaveLength(0);
 expect((await f.host.status()).documentTokensUsed).toBe(0);
});
it('reports unavailable accounting after worker failure and explicitly resumes without renewing consent',async()=>{
 const f=await fixture();await f.save('A distinctive saved passage.');
 await f.host.configure({indexDocuments:true,embedQueries:false,documentTokens:2000,queryTokens:500});await f.settle();
 const before=await f.host.status(),prefs=await fs.readFile(path.join(f.root,'.mutable/retrieval-preferences.json'),'utf8');
 await (f.host as any).service.terminate();
 const failed=await f.host.status();expect(failed.index.state).toBe('unavailable');expect(failed.documentTokensUsed).toBeNull();expect(failed.indexed).toBeNull();
 await f.host.refresh();await f.sql.flush();await f.settle();
 const resumed=await f.host.status();expect(resumed.indexed).toBe(1);expect(resumed.documentTokensUsed).toBe(before.documentTokensUsed);expect(resumed.error).toBe('');
 expect(await fs.readFile(path.join(f.root,'.mutable/retrieval-preferences.json'),'utf8')).toBe(prefs);
});
