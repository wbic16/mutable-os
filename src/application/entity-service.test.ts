// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {promises as vfs} from '../../server/phext-fs.mjs';
import {testCavern} from '../knowledge-sqlite/phext-test-cavern.mjs';
import express from 'express';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import {webcrypto,randomUUID} from 'node:crypto';
import {SqliteKnowledgeHost} from '../../dist/server/sqlite-knowledge-host.js';
import {createNativeDocumentStoreRouter} from '../../server/native-document-store.mjs';
import {ReactiveEditor} from '../reactive-editor/editor';import {nativeDocumentSession} from '../persistence/native-session';
import {createDocumentVaults} from './document-vault';import {createNativeKnowledgeHost} from './native-knowledge-scope';import {FactsQueryProvider} from './facts-query-provider';import {DEFAULT_POLICY} from '../knowledge/policy';
import {entityService,registerEntityContext} from './entity-service';
import {WorkspaceSession} from './workspace-session';
import {workspaceOpen} from './workspace-open';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
const cleanup:Array<()=>any>=[],realFetch=globalThis.fetch;
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();vi.unstubAllGlobals();});
function bytes(id:string,entity:string,text='the city') {return JSON.stringify({format:'mutable-document',version:1,valueEncoding:'codex-authored-value-v1',resourceId:id,definitionOwnerBlockIds:[],document:{format:'codex-portable-resource-gate',version:1,resourceId:id,root:{kind:'owned',placementId:id+'-root',target:{kind:'local',blockId:id+'-doc'}},blocks:[{id:id+'-doc',type:'document-block',properties:{metadata:{documentId:id}},children:[{kind:'owned',placementId:id+'-child',target:{kind:'local',blockId:id+'-text'}}]},{id:id+'-text',type:'standoff-editor-block',properties:{standoffProperties:[{id:id+'-mention',type:'codex/entity-reference',value:entity,start:0,end:[...text].length-1}]},children:[],inline:[{kind:'text',text}]}]}});}
async function fixture(standalone=false,savedKnowledge=true){
 vi.stubGlobal('crypto',webcrypto);const root=await fs.mkdtemp(path.join(os.tmpdir(),'p3d-service-'));const cavern=testCavern(root);cleanup.push(()=>cavern.close());cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));const entityId=randomUUID();
 for(const id of ['a','b'])await vfs.writeFile(path.join(root,`${id}.mutable.json`),bytes(id,entityId,id==='a'?'the city':'Firenze'));
 const workspace={id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]};
 const session=standalone?new WorkspaceSession(materializeLocalWorkspace(workspace),{features:{nativeKnowledgeSaved:savedKnowledge}}):undefined;
 const policy=session?{version:1 as const,opaqueTypes:session.editor.registry.typesWithCapability('opaque-widget')}:DEFAULT_POLICY;
 const sql=new SqliteKnowledgeHost({root,debounceMs:60000});cleanup.push(()=>sql.close());const lease=await sql.acquire('.',policy);await sql.flush();
 const app=express();app.use('/api/sqlite/knowledge',sql.router());app.use('/api/native',createNativeDocumentStoreRouter({root,defaultVault:'.',establishVault:v=>sql.establish(v),coordinate:(a:any)=>sql.foreground(a)}));const server:any=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});cleanup.push(()=>new Promise(r=>server.close(r)));vi.stubGlobal('fetch',(url:any,o:any)=>realFetch(typeof url==='string'&&url.startsWith('/')?`http://127.0.0.1:${server.address().port}${url}`:url,o));
 const editor=session?.editor??new ReactiveEditor(workspace),native=nativeDocumentSession(editor),vaults=createDocumentVaults(native),factory=createNativeKnowledgeHost(editor.repository,native,{read:()=>policy,subscribe:()=>()=>{}},{progressiveSaved:true,sqliteSaved:true,debounceMs:60000,yieldControl:async()=>{}});
 cleanup.push(async()=>{await factory.dispose();vaults.dispose();if(session)session.dispose();else editor.dispose();});const vault=await vaults.acquire('.');if(session)await workspaceOpen(session).serverDocument({folder:'.',filename:'a.mutable.json'},new AbortController().signal);else await native.open({folder:'.',filename:'a.mutable.json'});const view=session?.projection??editor.createView('entity-source'),node=Object.values(view.state.nodes).find(n=>n.payload.id==='a-text'&&(!session||editor.blockQueries.ancestors(n.key).some(a=>a.viewType==='document-window-block')))!;expect(node).toBeTruthy();const facts=new FactsQueryProvider(factory);facts.use(vault);cleanup.push(()=>facts.dispose());let selected=vault;
 if(!session)cleanup.push(registerEntityContext(editor,{accepts:key=>key===node.key,vault:()=>selected,facts}));const service=entityService(editor,node.key);cleanup.push(()=>service.dispose());const settle=async()=>{await cavern.flush();await vault.refresh(true);await factory.host.flush();}; // phext: flush so the knowledge worker process sees fixture writesawait settle();
 const query=(query:string,stream:'all'|'name'|'alias'|'mention'='all',scope:'document'|'vault'='vault',match:'exact'|'partial'='partial')=>service.search({query,stream,scope,match},new AbortController().signal);
 return {root,sql,lease,session,editor,native,vault,node,factory,facts,service,query,settle,entityId,cavern,select:(v:any)=>selected=v};
}
it('partial canonical searches bypass Vault discovery and saved Facts, including the first DocumentWindow search',async()=>{
 const f=await fixture(true,false),name='The abbey of Prince Prospero';
 const source={resourceId:'a',location:{folder:'.',filename:'a.mutable.json'},byteHash:f.native.knowledgeEvidence('a').byteHash};
 await f.sql.entities({lease:f.lease.lease,source,request:{op:'create',id:f.entityId,operationId:randomUUID(),name}});
 await f.sql.entities({lease:f.lease.lease,source,request:{op:'alias-add',entityId:f.entityId,id:randomUUID(),operationId:randomUUID(),name:'Prospero’s refuge'}});
 const discovery=vi.spyOn(f.native,'discoverVault').mockRejectedValue(Error('Vault discovery must not block name search'));
 const serverDiscovery=vi.spyOn(f.sql.store,'discover').mockRejectedValue(Error('Search must not discover the Vault'));
 const fence=vi.spyOn(f.sql.store,'readScopeFence').mockRejectedValue(Error('Search must not traverse the Vault'));
 try{
  expect(await f.query('abbey','name')).toMatchObject({complete:true,candidates:[{id:f.entityId,name,evidence:[{kind:'name',text:name}]}]});
  expect((await f.query('ABBEY','name')).candidates).toHaveLength(1);
  expect((await f.query('abbey','name','vault','exact')).candidates).toHaveLength(0);
  expect((await f.query('refuge','alias')).candidates[0]).toMatchObject({id:f.entityId,evidence:[{kind:'alias',text:'Prospero’s refuge'}]});
  expect(discovery).not.toHaveBeenCalled();expect(serverDiscovery).not.toHaveBeenCalled();expect(fence).not.toHaveBeenCalled();
  for(const op of ['search','current']){
   const request={op,query:'abbey',stream:'name',match:'partial'};
   await expect(f.sql.entities({lease:f.lease.lease,source:{...source,byteHash:'wrong'},request})).rejects.toThrow(/changed/);
   await expect(f.sql.entities({lease:f.lease.lease,source:{...source,resourceId:'forged'},request})).rejects.toThrow(/identity/);
  }
 }finally{discovery.mockRestore();serverDiscovery.mockRestore();fence.mockRestore();}
},30000);
it('name lookup and selection make no document reads or boundary audits, even without a saved source',async()=>{
 const f=await fixture(true,false),source={resourceId:'a',location:{folder:'.',filename:'a.mutable.json'},byteHash:f.native.knowledgeEvidence('a').byteHash};
 await f.sql.entities({lease:f.lease.lease,source,request:{op:'create',id:f.entityId,operationId:randomUUID(),name:'Rome'}});
 const spies=[
  vi.spyOn(f.editor.repository,'readCanonicalResourceBoundary').mockImplementation(()=>{throw Error('Unexpected boundary audit');}),
  vi.spyOn(f.editor.repository,'readCanonicalResourceBoundaryCooperative').mockRejectedValue(Error('Unexpected traversal')),
  vi.spyOn(f.native,'knowledgeEvidence').mockImplementation(()=>{throw Error('Unexpected source proof');}),
  vi.spyOn(f.native,'discoverVault').mockRejectedValue(Error('Unexpected discovery')),
  vi.spyOn(f.sql.store,'read').mockRejectedValue(Error('Unexpected document read')),
 ];
 const fetch=vi.spyOn(globalThis,'fetch');
 try{
  expect((await f.query('Rome','name')).candidates.map(c=>c.name)).toEqual(['Rome']);
  expect((await f.service.get(f.entityId))?.name).toBe('Rome');
  expect((await f.query('Rome','name')).candidates).toHaveLength(1);
  for(const spy of spies)expect(spy).not.toHaveBeenCalled();
  const requests=fetch.mock.calls.filter(([url])=>String(url).includes('/sqlite/')).map(([url])=>String(url));
  expect(requests).toEqual(Array(3).fill('/api/sqlite/knowledge/entity-lookup'));
 }finally{fetch.mockRestore();for(const spy of spies)spy.mockRestore();}
},30000);
it('All publishes canonical matches then merges indexed mentions without preparing document Facts',async()=>{
 const f=await fixture(),name='The abbey of Prince Prospero';
 await f.service.create({id:f.entityId,operationId:randomUUID(),name});
 await vfs.writeFile(path.join(f.root,'b.mutable.json'),bytes('b',f.entityId,'abbey'));await f.cavern.flush();await f.sql.refresh(f.lease.lease,true);await f.settle();
 const prepare=vi.spyOn(f.facts,'prepare').mockRejectedValue(Error('Selector must not extract Facts'));
 const progress=vi.fn(),controller=new AbortController();
 const search=f.service.search({query:'abbey',stream:'all',scope:'vault',match:'partial'},controller.signal,progress);
 try{
  const result=await search;expect(prepare).not.toHaveBeenCalled();
  expect(progress).toHaveBeenCalledOnce();
  const partial=progress.mock.calls[0][0];
  expect(partial).toMatchObject({complete:false,candidates:[{id:f.entityId,name,evidence:[{kind:'name',text:name}]}]});
  expect(()=>partial.current()).not.toThrow();

  expect(result.candidates[0].evidence).toEqual(expect.arrayContaining([{kind:'name',text:name},expect.objectContaining({kind:'mention',text:'abbey',resourceId:'b'})]));
  expect(partial.candidates[0].evidence).toHaveLength(1);
  controller.abort();expect(()=>partial.current()).toThrow();
 }finally{await search.catch(()=>{});prepare.mockRestore();}
},30000);
it('real HTTP/worker resolves canonical names, curated aliases and explicitly saved indexed mentions',async()=>{
 const f=await fixture(),before=await vfs.readFile(path.join(f.root,'a.mutable.json'));await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});await f.settle();
 expect((await f.query('Florence','name')).candidates[0].id).toBe(f.entityId);
 expect(await f.service.summaries([f.entityId])).toMatchObject({complete:true,rows:[{id:f.entityId,name:'Florence',mentions:2}]});
 expect((await f.query('Firenze','alias')).candidates).toHaveLength(0);
 const mention=await f.query('Firenze','mention');expect(mention.candidates[0]).toMatchObject({id:f.entityId,evidence:[{kind:'mention',resourceId:'b',text:'Firenze'}]});expect(mention.candidates[0].evidence[0].ranges).toEqual([{blockId:'b-text',start:0,end:7}]);
 expect(Object.values(f.editor.repository.readState().contents).some(c=>c.payload.id==='b-doc')).toBe(false);
 expect((await f.query('Firenze','mention','document')).candidates).toHaveLength(0);expect((await f.query('city','mention','document','exact')).candidates).toHaveLength(0);expect((await f.query('the city','mention','document','exact')).candidates).toHaveLength(1);
 const alias=randomUUID();await f.service.alias({op:'alias-add',entityId:f.entityId,id:alias,name:'Firenze',operationId:randomUUID()});await f.settle();expect((await f.query('Firenze','alias')).candidates[0].evidence[0].kind).toBe('alias');
 const saved=await f.query('city','mention');f.editor.commands.replaceInlineRange(f.node.key,4,8,'town');expect(()=>saved.current()).not.toThrow();
 const indexed=await f.query('city','mention','document');expect(indexed.candidates).toHaveLength(1);expect(indexed.diagnostics.join(' ')).toContain('unsaved or unindexed');
 expect((await f.service.get(f.entityId))!.aliases.map(a=>a.name)).toEqual(['Firenze']);expect(await vfs.readFile(path.join(f.root,'a.mutable.json'))).toEqual(before);
 f.editor.repository.undo();await f.factory.host.flush();expect((await f.query('the city','mention','document','exact')).candidates).toHaveLength(1);
 f.select(undefined);await expect(f.service.get(f.entityId)).rejects.toThrow(/Vault|vault/);
},30000);
it('selector reads ignore source-file changes while source-authorized operations still reject forged bindings',async()=>{
 const f=await fixture();await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});await f.settle();const result=await f.query('city','mention','document');
 const signal=new AbortController();signal.abort();await expect(f.service.search({query:'x',scope:'vault',stream:'name',match:'partial'},signal.signal)).rejects.toThrow();
 const source={resourceId:'a',location:{folder:'.',filename:'a.mutable.json'},byteHash:f.native.knowledgeEvidence('a').byteHash};
 await expect(f.sql.entities({lease:f.lease.lease,source:{...source,resourceId:'b'},request:{op:'get',id:f.entityId}})).rejects.toThrow(/evidence|identity|outside|changed/);
 await vfs.writeFile(path.join(f.root,'duplicate.mutable.json'),await vfs.readFile(path.join(f.root,'a.mutable.json')));expect((await f.service.get(f.entityId))?.name).toBe('Florence');await vfs.unlink(path.join(f.root,'duplicate.mutable.json'));
 await vfs.rename(path.join(f.root,'a.mutable.json'),path.join(f.root,'moved.mutable.json'));expect((await f.service.get(f.entityId))?.name).toBe('Florence');
 f.editor.commands.replaceInlineRange(f.node.key,0,0,'x');expect(()=>result.current()).not.toThrow();
 const root=Object.values(f.editor.repository.readState().contents).find(c=>c.payload.id==='a-doc')!;f.editor.repository.commit('Disappear',[{kind:'put-content',record:{...root,payload:{...root.payload,metadata:{documentId:'elsewhere'}}}}]);expect((await f.service.get(f.entityId))?.name).toBe('Florence');
},30000);
it('lost mutation response is explicitly unconfirmed and retrying the same attempt does not create another Entity',async()=>{
 const f=await fixture(),fetch=globalThis.fetch,input={id:randomUUID(),operationId:randomUUID(),name:'Leonardo da Vinci'};let lost=true;
 vi.stubGlobal('fetch',async(url:any,o:any)=>{const response=await fetch(url,o);if(lost&&String(url).endsWith('/entity-mutate')&&JSON.parse(o.body).request.op==='create'){lost=false;await response.arrayBuffer();throw Error('simulated response lost after commit');}return response;});
 await expect(f.service.create(input)).rejects.toThrow(/response lost/);expect((await f.service.get(input.id))?.name).toBe(input.name);
 const retry=await f.service.create(input);expect(retry.id).toBe(input.id);await f.settle();expect((await f.query('Leonardo da Vinci','name','vault','exact')).candidates.map(c=>c.id)).toEqual([input.id]);expect(f.editor.node(f.node.key)!.payload.standoffProperties).toHaveLength(1);
},30000);
it('read-only vault permits resolution but rejects canonical writes, and another vault cannot supply source authority',async()=>{
 const f=await fixture();await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});await f.settle();await f.sql.close();
 const reader=new SqliteKnowledgeHost({root:f.root,readOnly:true});cleanup.push(()=>reader.close());const lease=await reader.acquire('.'),source={resourceId:'a',location:{folder:'.',filename:'a.mutable.json'},byteHash:f.native.knowledgeEvidence('a').byteHash};
 expect((await reader.entities({lease:lease.lease,source,request:{op:'get',id:f.entityId}})).entity.name).toBe('Florence');await expect(reader.entities({lease:lease.lease,source,request:{op:'create',id:randomUUID(),operationId:randomUUID(),name:'No write'}})).rejects.toThrow(/read-only/);
 const otherRoot=await fs.mkdtemp(path.join(os.tmpdir(),'p3d-other-'));cleanup.push(()=>fs.rm(otherRoot,{recursive:true,force:true}));const otherCavern=testCavern(otherRoot);cleanup.push(()=>otherCavern.close());const other=new SqliteKnowledgeHost({root:otherRoot});cleanup.push(()=>other.close());const otherLease=await other.acquire('.'); // phext: a different vault is a different Cavern (sibling, never nested)await other.flush();await expect(other.entities({lease:otherLease.lease,source,request:{op:'create',id:f.entityId,operationId:randomUUID(),name:'Wrong vault'}})).rejects.toThrow(/evidence|identity|outside|changed/);
},30000);
it('unresolved saved definitions keep mention resolution and vault counts explicitly incomplete',async()=>{
 const f=await fixture();await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});await f.settle();
 const file=path.join(f.root,'b.mutable.json'),saved=JSON.parse(await vfs.readFile(file,'utf8'));
 saved.document.blocks[1].properties.standoffProperties.push({id:'unresolved',annotationId:'missing-definition',start:0,end:1});await vfs.writeFile(file,JSON.stringify(saved));await f.settle();
 expect((await f.query('Firenze','mention')).complete).toBe(false);
 await expect(f.service.summaries([f.entityId])).rejects.toThrow(/incomplete/i);
},30000);
it('creates 1842 without document preparation, source proofs, or traversal and invalidates cached absence',async()=>{
 const f=await fixture(true,false);
 expect((await f.query('1842','name')).candidates).toHaveLength(0);
 const spies=[
  vi.spyOn(f.native,'knowledgeEvidence').mockImplementation(()=>{throw Error('No source validation');}),
  vi.spyOn(f.native,'discoverVault').mockRejectedValue(Error('No vault discovery')),
  vi.spyOn(f.editor.repository,'readCanonicalResourceBoundary').mockImplementation(()=>{throw Error('No boundary audit');}),
  vi.spyOn(f.sql.store,'discover').mockRejectedValue(Error('No server discovery')),
  vi.spyOn(f.sql.store,'readScopeFence').mockRejectedValue(Error('No scope scan')),
 ];
 try{
  const input={id:randomUUID(),operationId:randomUUID(),name:'1842'};
  const created=await f.service.create(input);expect(created).toMatchObject({id:input.id,name:'1842'});
  expect((await f.service.create(input)).id).toBe(input.id);
  expect((await f.query('1842','name')).candidates.map(c=>c.id)).toEqual([input.id]);
  for(const spy of spies)expect(spy).not.toHaveBeenCalled();
 }finally{for(const spy of spies)spy.mockRestore();}
},30000);
it('rejects creation before dispatch when the invoking Vault context is unavailable',async()=>{
 const f=await fixture();f.select(undefined);const fetch=vi.spyOn(globalThis,'fetch');
 try{await expect(f.service.create({id:randomUUID(),operationId:randomUUID(),name:'1842'})).rejects.toMatchObject({entityCreationOutcome:'not-created'});expect(fetch).not.toHaveBeenCalled();}finally{fetch.mockRestore();}
},30000);

it('DocumentWindows resolve SQLite names and vault counts without Flint, and reject closed occurrences',async()=>{
 const f=await fixture(true);
 expect(Object.values(f.editor.repository.state.contents).some(c=>c.viewType==='flint-application-block')).toBe(false);
 await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});
 await f.settle();
 // The real progressive provider can finish its initial saved/live refresh
 // after the first query. A new listing query uses the same workspace host.
 await expect.poll(async()=>{
  const service=entityService(f.editor,f.node.key);
  try{return await service.summaries([f.entityId]);}finally{service.dispose();}
 },{timeout:10000}).toMatchObject({complete:true,rows:[{id:f.entityId,name:'Florence',mentions:2}]});
 const aborted=new AbortController();aborted.abort();
 await expect(f.service.summaries([f.entityId],aborted.signal)).rejects.toThrow();
 const win=f.editor.blockQueries.ancestors(f.node.key).find(n=>n.viewType==='document-window-block')!;
 f.editor.commands.remove(win.key);
 await expect(f.service.get(f.entityId)).rejects.toThrow(/unavailable|Vault|closed/);
 const service=entityService(f.editor,f.node.key);
 f.session!.dispose();
 await expect(service.get(f.entityId)).rejects.toThrow();service.dispose();
},30000);

it('DocumentWindows still resolve names when saved-vault counts are disabled, without claiming complete counts',async()=>{
 const f=await fixture(true,false);
 await f.service.create({id:f.entityId,operationId:randomUUID(),name:'Florence'});
 await f.settle();
 const result=await f.service.summaries([f.entityId]);
 expect(result.rows).toEqual([{id:f.entityId,name:'Florence'}]);
 expect(result.complete).toBe(false);
 expect(result.diagnostics.length).toBeGreaterThan(0);
 // Another projection of the canonical bank is not a DocumentWindow and
 // must not borrow the workspace's source authority.
 const other=f.editor.createView('unrelated');
 const owner=Object.values(other.state.nodes).find(n=>n.payload.id==='a-text'&&!f.editor.blockQueries.ancestors(n.key).some(a=>a.viewType==='document-window-block'))!;
 const service=entityService(f.editor,owner.key);
 await expect(service.get(f.entityId)).rejects.toThrow(/verified Mutable Vault/);
 service.dispose();
},30000);
it('listing reads only names and indexed segment counts without Vault discovery or Facts reconstruction',async()=>{
 const f=await fixture(true,false);
 const source={resourceId:'a',location:{folder:'.',filename:'a.mutable.json'},byteHash:f.native.knowledgeEvidence('a').byteHash};
 await f.sql.entities({lease:f.lease.lease,source,request:{op:'create',id:f.entityId,operationId:randomUUID(),name:'Florence',description:'Not needed in listing'}});
 // Two linked segments in b count as two DB rows, even though they describe
 // one logical mention. Deleted segments and unrelated types do not count.
 const file=path.join(f.root,'b.mutable.json'),saved=JSON.parse(await vfs.readFile(file,'utf8'));
 saved.document.blocks[0].properties.linkedAnnotations={city:{type:'codex/entity-reference',value:f.entityId}};
 saved.document.blocks[1].properties.standoffProperties=[
  {id:'one',annotationId:'city',start:0,end:2},
  {id:'two',annotationId:'city',start:3,end:6},
  {id:'deleted',type:'codex/entity-reference',value:f.entityId,start:0,end:0,isDeleted:true},
  {id:'other',type:'bold',value:f.entityId,start:0,end:0},
 ];
 saved.definitionOwnerBlockIds=['b-doc'];
 await vfs.writeFile(file,JSON.stringify(saved));await f.cavern.flush();await f.sql.refresh(f.lease.lease,true);await f.settle();
 const discovery=vi.spyOn(f.native,'discoverVault'),facts=vi.spyOn(f.factory.host,'flush'),fetch=vi.spyOn(globalThis,'fetch');
 const serverDiscovery=vi.spyOn(f.sql.store,'discover').mockImplementation(()=>{throw Error('Listing must not discover the Vault');});
 const serverFence=vi.spyOn(f.sql.store,'readScopeFence').mockImplementation(()=>{throw Error('Listing must not traverse the Vault');});
 const service=entityService(f.editor,f.node.key);
 try{
  expect(await service.names([f.entityId,randomUUID()])).toEqual([{id:f.entityId,name:'Florence'}]);
  expect(await service.dbMentions([f.entityId, 'unmentioned'])).toEqual([{id:f.entityId,mentions:3},{id:'unmentioned',mentions:0}]);
  expect(discovery).not.toHaveBeenCalled();expect(facts).not.toHaveBeenCalled();
  expect(serverDiscovery).not.toHaveBeenCalled();expect(serverFence).not.toHaveBeenCalled();
  for(const op of ['names','db-mentions']){
   await expect(f.sql.entities({lease:f.lease.lease,source:{...source,byteHash:'wrong'},request:{op,ids:[f.entityId]}})).rejects.toThrow(/changed/);
   await expect(f.sql.entities({lease:f.lease.lease,source:{...source,resourceId:'forged'},request:{op,ids:[f.entityId]}})).rejects.toThrow(/identity/);
  }
  const ops=fetch.mock.calls.filter(([url])=>String(url).endsWith('/entities')).map(([,o])=>JSON.parse(o!.body as string).request.op);
  expect(ops).toEqual(['names','db-mentions']);
  const aborted=new AbortController();aborted.abort();await expect(service.names([f.entityId],aborted.signal)).rejects.toThrow();
 }finally{service.dispose();discovery.mockRestore();facts.mockRestore();fetch.mockRestore();serverDiscovery.mockRestore();serverFence.mockRestore();}
},30000);
