import {SqliteKnowledgeHost} from '../../dist/server/sqlite-knowledge-host.js';
import {promises as vfs} from '../../server/phext-fs.mjs';
import {testCavern} from '../knowledge-sqlite/phext-test-cavern.mjs';
import {FactsQueryProvider} from './facts-query-provider';
import {matchSources} from '../runtime/search-matching';
// @vitest-environment jsdom
import {webcrypto} from 'node:crypto';import {afterEach,it,expect,vi,describe} from 'vitest';import express from 'express';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ReactiveEditor} from '../reactive-editor/editor';import {nativeDocumentSession} from '../persistence/native-session';import {createNativeDocumentStoreRouter} from '../../server/native-document-store.mjs';import {createDocumentVaults} from './document-vault';import {createNativeKnowledgeHost} from './native-knowledge-scope';import {DEFAULT_POLICY} from '../knowledge/policy';import {fixtureText} from '../qualification/native-knowledge/fixture';
const cleanup:Array<()=>any>=[];const fetchReal=globalThis.fetch;afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();vi.unstubAllGlobals();});
describe.each([false,true])('saved provider sqlite=%s',sqlite=>{
async function fixture(count=3,options={}){
 vi.stubGlobal('crypto',webcrypto);const root=await fs.mkdtemp(path.join(os.tmpdir(),'p5-host-'));const cavern=testCavern(root);cleanup.push(()=>cavern.close());cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));for(let i=0;i<count;i++)await vfs.writeFile(path.join(root,`${i}.mutable.json`),fixtureText(i,count));
 const sql=sqlite?new SqliteKnowledgeHost({root,debounceMs:60000}):undefined;if(sql){cleanup.push(()=>sql.close());await sql.acquire('.');await sql.flush();}
 const app=express();if(sql)app.use('/api/sqlite/knowledge',sql.router());app.use('/api/native',createNativeDocumentStoreRouter({root,defaultVault:'.',establishVault:sql?v=>sql.establish(v):undefined,coordinate:sql?(a:any)=>sql.foreground(a):undefined}));const server:any=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});cleanup.push(()=>new Promise(r=>server.close(r)));
 const calls:string[]=[];let failBatch=false;vi.stubGlobal('fetch',(url:any,options:any)=>{calls.push(String(url));if(failBatch&&String(url).endsWith('/facts/batch'))return Promise.reject(Error('lost saved scope response'));return fetchReal(typeof url==='string'&&url.startsWith('/')?`http://127.0.0.1:${server.address().port}${url}`:url,options);});
 const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]}),native=nativeDocumentSession(editor),vaults=createDocumentVaults(native),factory=createNativeKnowledgeHost(editor.repository,native,{read:()=>DEFAULT_POLICY,subscribe:()=>()=>{}},{progressiveSaved:true,sqliteSaved:sqlite,debounceMs:60000,yieldControl:async()=>{},...options});
 cleanup.push(async()=>{await factory.dispose();vaults.dispose();editor.dispose();});const vault=await vaults.acquire('.'),a=factory.acquire(vault),b=factory.acquire(vault);
 return {root,editor,native,vault,sql,factory,a,b,calls,fail:(v:boolean)=>failBatch=v};
}
it('shares a bounded saved cohort without Open, binding, projection, History or per-resource conservative endpoints',async()=>{
 const f=await fixture(12),before=f.editor.repository.snapshot(),events=vi.fn();f.editor.repository.subscribeHistoryChanges(events,()=>{});await f.factory.host.flush();expect((await f.a.prepare()).facts).toHaveLength(12);expect(f.a.coverage().complete).toBe(true);if(sqlite)expect(f.a.coverage().savedProvider).toMatchObject({provider:'sqlite',state:'verified'});expect(f.native.knowledgeBindings()).toHaveLength(0);expect(f.editor.projections.size).toBe(0);expect(f.editor.repository.snapshot()).toEqual(before);expect(events).not.toHaveBeenCalled();
 expect(f.calls.filter(c=>c.endsWith('/facts'))).toHaveLength(0);expect(f.calls.filter(c=>c.endsWith('/facts/begin'))).toHaveLength(1);expect(f.calls.filter(c=>c.endsWith('/facts/batch'))).toHaveLength(1);
 const reads=f.factory.host.metrics.savedReads,bytes=f.factory.host.index.retainedBytes;expect((await f.b.prepare()).facts).toHaveLength(12);expect(f.factory.host.metrics.savedReads).toBe(reads);expect(f.factory.host.index.retainedBytes).toBe(bytes);f.a.release();expect((await f.b.prepare()).facts).toHaveLength(12);f.b.release();await f.factory.host.flush();expect(f.factory.host.index.retainedBytes).toBe(0);
},30000);
it('saved-to-opening suppresses immediately, dirty live never falls back, and disappearance requires verified hand-back',async()=>{
 const f=await fixture();await f.factory.host.flush();const old=await f.a.prepare(),opening=f.native.open({folder:'.',filename:'0.mutable.json'});expect((await f.a.prepare()).facts).toHaveLength(0);expect(()=>old.current()).toThrow();await opening;await f.factory.host.flush();expect(f.a.coverage().resources.find(r=>r.id==='resource-0')?.state).toBe('live-ready');
 const record=Object.values(f.editor.repository.readState().contents).find(c=>c.payload.id==='resource-0-p0')!;
 f.editor.repository.commit('Unresolved annotation',[{kind:'put-content',record:{...record,payload:{...record.payload,standoffProperties:[{id:'missing',annotationId:'absent',start:0,end:1}]}}}]);await f.factory.host.flush();expect(f.a.coverage().resources.find(r=>r.id==='resource-0')?.state).toBe('live-incomplete');expect((await f.a.prepare()).facts.find(f=>f.id==='resource-0')?.mentions).toHaveLength(6);
 const root=Object.values(f.editor.repository.readState().contents).find(c=>c.payload.id==='resource-0-root')!;f.editor.repository.commit('Source disappearance',[{kind:'put-content',record:{...root,payload:{...root.payload,metadata:{...(root.payload.metadata as any),documentId:'elsewhere'}}}}]);expect((await f.a.prepare()).facts).toHaveLength(0);await f.factory.host.flush();expect(f.a.coverage().resources.find(r=>r.id==='resource-0')?.state).toBe('saved-ready');
},30000);
it('a failed saved scope withdraws its old results, keeps loaded operation usable, and explicit Refresh retries',async()=>{
 const f=await fixture();await f.native.open({folder:'.',filename:'0.mutable.json'});await f.factory.host.flush();const old=await f.a.prepare();f.fail(true);await f.vault.refresh(true);await f.factory.host.flush();await f.factory.host.flush();if(sqlite)await f.factory.host.flush();expect(()=>old.current()).toThrow();const ready=await f.a.prepare();expect(ready.facts.map(f=>f.id)).toEqual(['resource-0']);expect(f.a.coverage().complete).toBe(false);
 f.fail(false);await f.vault.refresh(true);await f.factory.host.flush();expect((await f.a.prepare()).facts).toHaveLength(3);expect(f.a.coverage().complete).toBe(true);
},30000);
it('memory/resource budget remains explicit incomplete coverage, not complete zero results',async()=>{
 const f=await fixture(3,{factsBudget:120000,maxResources:2});await f.factory.host.flush();expect((await f.a.prepare()).facts).toHaveLength(1);expect(f.factory.host.index.retainedBytes).toBeLessThanOrEqual(120000);expect(f.a.coverage().complete).toBe(false);expect(f.a.coverage().diagnostic).toMatch(/queue budget/);expect(f.a.coverage().resources.some(r=>r.error?.includes('memory budget'))).toBe(true);
});
it('repository/session replacement expires result tokens and releases derived state only',async()=>{
 const f=await fixture();await f.factory.host.flush();const result=await f.a.prepare(),bytes=await vfs.readFile(path.join(f.root,'0.mutable.json'));f.editor.dispose();await f.factory.dispose();expect(()=>result.current()).toThrow();expect(f.factory.host.index.retainedBytes).toBe(0);expect(await vfs.readFile(path.join(f.root,'0.mutable.json'))).toEqual(bytes);
});
it('explicit selected Open can re-admit after admission Undo; retained binding is not mistaken for canonical presence',async()=>{
 const f=await fixture();await f.native.open({folder:'.',filename:'0.mutable.json'});await f.factory.host.flush();f.editor.repository.undo();expect(f.editor.repository.readCanonicalResourceBoundary('resource-0').status).toBe('missing');await f.factory.host.flush();expect(f.a.coverage().resources.find(r=>r.id==='resource-0')?.state).toBe('saved-ready');
 const row=f.vault.snapshot().documents.find(r=>r.resourceId==='resource-0')!;await f.native.openVerified(row.location,{resourceId:'resource-0',byteHash:row.baseline!.nativeHash!},()=>{});expect(f.editor.repository.readCanonicalResourceBoundary('resource-0').status).toBe('ready');expect(f.native.knowledgeBindings()).toHaveLength(1);
});
it('closing the last scope cancels staged saved work; reacquisition starts with fresh read evidence',async()=>{
 const f=await fixture(),request=globalThis.fetch;let entered!:()=>void;const started=new Promise<void>(r=>entered=r);let hold=true;
 vi.stubGlobal('fetch',async(url:any,options:any)=>{if(hold&&String(url).endsWith('/facts/batch')){entered();await new Promise((_,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});}return request(url,options);});
 const pending=f.factory.host.flush();await started;f.a.release();f.b.release();await pending;await f.factory.host.flush();expect(f.factory.host.index.retainedBytes).toBe(0);expect(f.native.knowledgeBindings()).toHaveLength(0);
 hold=false;const next=f.factory.acquire(f.vault);await f.factory.host.flush();expect((await next.prepare()).facts).toHaveLength(3);expect(next.coverage().complete).toBe(true);next.release();
},30000);

if(sqlite)it('SQL query expiry withdraws cached evidence and selects independently verified file fallback',async()=>{
 const f=await fixture();await f.factory.host.flush();const provider=new FactsQueryProvider(f.factory);provider.use(f.vault);cleanup.push(()=>provider.dispose());
 const runner=async(s:any,q:string,o:any)=>matchSources(s,q,o),before=await provider.search(f.vault,'Leonardo',undefined,runner);expect(before.savedProvider?.provider).toBe('sqlite');
 const request=globalThis.fetch;let unavailable=true;vi.stubGlobal('fetch',(url:any,options:any)=>unavailable&&String(url).includes('/sqlite/knowledge/facts/current')?Promise.reject(Error('SQL proof unavailable')):request(url,options));
 await expect(provider.search(f.vault,'Leonardo',undefined,runner)).rejects.toThrow();expect(()=>before.current()).toThrow();await f.factory.host.flush();
 const fallback=await provider.search(f.vault,'Leonardo',undefined,runner);expect(fallback.savedProvider).toMatchObject({provider:'file',state:'verified'});expect(fallback.sources.map(s=>s.facts.id).sort()).toEqual(['resource-0','resource-1','resource-2']);expect(fallback.hits).toHaveLength(before.hits.length);
 unavailable=false;await f.vault.refresh(true);await f.factory.host.flush();const restored=await provider.search(f.vault,'Leonardo',undefined,runner);expect(restored.savedProvider?.provider).toBe('sqlite');
 const c=new AbortController();c.abort();await expect(provider.search(f.vault,'Leonardo',c.signal,runner)).rejects.toThrow();expect(()=>restored.current()).not.toThrow();
},30000);
if(sqlite)it('changed files cannot escape through cached SQL or file fallback, while valid live state survives',async()=>{
 const f=await fixture();await f.native.open({folder:'.',filename:'0.mutable.json'});await f.factory.host.flush();const provider=new FactsQueryProvider(f.factory);provider.use(f.vault);cleanup.push(()=>provider.dispose());const runner=async(s:any,q:string,o:any)=>matchSources(s,q,o);
 const before=await provider.search(f.vault,'Leonardo',undefined,runner);await vfs.writeFile(path.join(f.root,'1.mutable.json'),fixtureText(1,3).replace('Leonardo','External'));
 await expect(provider.search(f.vault,'Leonardo',undefined,runner)).rejects.toThrow();expect(()=>before.current()).toThrow();await f.factory.host.flush();await f.factory.host.flush();
 const result=await provider.search(f.vault,'Leonardo',undefined,runner);expect(result.sources.map(s=>s.facts.id)).toEqual(['resource-0']);expect(result.savedProvider?.state).toBe('unknown');expect(result.diagnostics.join(' ')).toMatch(/incomplete/);
},30000);

});
