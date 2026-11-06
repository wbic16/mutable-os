// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';import express from 'express';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ReactiveEditor} from '../reactive-editor/editor';import {nativeDocumentSession} from '../persistence/native-session';import {createNativeDocumentStoreRouter} from '../../server/native-document-store.mjs';import {createDocumentVaults} from './document-vault';import {createNativeKnowledgeHost} from './native-knowledge-scope';import {DEFAULT_POLICY} from '../knowledge/policy';import {promises as vfs} from '../../server/phext-fs.mjs';import {testCavern} from '../knowledge-sqlite/phext-test-cavern.mjs';
it('real NativeSession/vault/worker HTTP composition: saved then live, two consumers, notification without capture, shutdown',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'p3-native-'));const cavern=testCavern(root);await vfs.writeFile(path.join(root,'source.mutable.json'),await fs.readFile('artifacts/flint-c3/browser/source.mutable.json')); // phext: the document Vault is the Cavern root
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root}));const server:any=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const actual=globalThis.fetch;
 vi.stubGlobal('fetch',(input:any,options:any)=>actual(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,options));
 const editor=new ReactiveEditor({id:'p3-workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]}),native=nativeDocumentSession(editor),vaults=createDocumentVaults(native),factory=createNativeKnowledgeHost(editor.repository,native,{read:()=>DEFAULT_POLICY,subscribe:()=>()=>{}},{debounceMs:60000,yieldControl:async()=>{}});
 try{
  const vault=await vaults.acquire('.'),id=vault.snapshot().documents[0].resourceId,a=factory.acquire(vault),b=factory.acquire(vault);
  a.requestSaved(id);await factory.host.flush();expect(a.coverage().resources[0].state).toBe('saved-ready');expect(editor.projections.size).toBe(0);
  const snapshot=vi.spyOn(editor.repository,'snapshot');native.knowledgeEvidence(id);expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
  const pending=native.open(vault.snapshot().documents[0].location);expect(native.knowledgeEvidence(id).admitting).toBe(true);expect((await a.prepare()).facts).toHaveLength(0);await pending;await factory.host.flush();expect(a.coverage().resources[0].state).toMatch(/live-/);expect(factory.host.metrics.savedReads).toBe(1);
  const revision=editor.repository.readState().revision;await a.prepare();await b.backlinks(id);expect(editor.repository.readState().revision).toBe(revision);expect(editor.projections.size).toBe(0);a.release();expect((await b.prepare()).facts).toHaveLength(1);
  await native.save(id);expect(native.knowledgeEvidence(id).pending).toBe(false);expect((await b.prepare()).facts).toHaveLength(0);await vault.refresh();await factory.host.flush();expect(b.coverage().resources[0].state).toMatch(/live-/);
  editor.dispose();await factory.dispose();expect(factory.host.index.retainedBytes).toBe(0);b.release();vault.release();
 }finally{await factory.dispose();vaults.dispose();editor.dispose();cavern.close();vi.unstubAllGlobals();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
},30000);
