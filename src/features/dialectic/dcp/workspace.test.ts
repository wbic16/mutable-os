import {registerApplicationViews} from '../../../application/features';
import {ReactiveEditor} from '../../../reactive-editor/editor';
import {DialecticReferences} from '../references';
import {DcpSources} from './sources';
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {workspaceFixture,workspaceResponse} from './workspace.fixture';
import {prepare} from './exchange';
import {semanticWorkspace} from './workspace';
import {schemaFor} from './provider-schema';
import {providerTools} from './provider-contract';
import {registerStandaloneEntityService} from '../../../application/entity-service';
import {captureNative,nativeBytes,decodeNative,admitNative} from '../../../persistence/native-resource';
const clean:(()=>void)[]=[];afterEach(()=>clean.splice(0).reverse().forEach(f=>f()));
function fixture(enabled=true){const f=workspaceFixture(enabled);clean.push(()=>f.dispose());return f;}
it('creates in N, reuses fresh authority in N+1 across agents, authors a Gloss and reconstructs in N+2',async()=>{
 const f=fixture(),id=f.addHuman('How should we judge authenticity?'),s=f.open(),r=await f.req(s,id),v=workspaceResponse(r.exchange);
 v.glosses=[{id:'new:g1',target:{block:'new:b1',revision:null,whole:true},type:'qualification',text:'Evidence establishes different kinds of genuineness.'}];
 const first=await f.admit(s,v,'agent-A',r),identity=first.aliases['new:e1'].entity!;
 expect(Object.values(first.definitions).find((d:any)=>d.type==='mutable/entity').metadata.scopedEntity.provenance.participantId).toBe('agent-A');
 const s2=f.open(),r2=await f.req(s2,id,'agent-B'),e=r2.semanticWorkspace.entities[0];expect(e.identity).toEqual(identity);expect(r2.semanticWorkspace.glosses[0].author).toBe('agent-A');
 expect(s2.diagnostics.entitySearches).toBe(0);expect(r2.semanticWorkspace.coverage.bytes).toBe(new TextEncoder().encode(JSON.stringify(r2.semanticWorkspace)).length);
 const reuse=workspaceResponse(r2.exchange,e.handle);reuse.glosses=[{id:'new:g1',target:{block:'new:b1',revision:null,quote:'Authenticity',prefix:'',suffix:''},type:'distinction',text:'Material and historical criteria need not agree.'}];await f.admit(s2,reuse,'agent-B',r2);
 const s3=f.open(),r3=await f.req(s3,id);expect(r3.semanticWorkspace.entities).toHaveLength(1);expect(r3.semanticWorkspace.entities[0].handle).not.toBe(e.handle);expect(r3.semanticWorkspace.glosses.map((g:any)=>g.author)).toEqual(expect.arrayContaining(['agent-A','agent-B']));
 await expect(prepare(JSON.stringify(workspaceResponse('stale',e.handle)),'stale',f.owner,f.editor.visualEffects,s3,true,'ai')).rejects.toThrow(/Unauthorized/);
 const bytes=nativeBytes(captureNative(f.editor.repository.readState(),f.owner));expect(JSON.stringify(decodeNative(bytes))).toContain('semanticWorkspace');expect(JSON.stringify(decodeNative(bytes))).toContain(identity.entityId);
 f.editor.repository.undo();const undone=await semanticWorkspace(f.open(),'agent-A');expect(undone.glosses).toHaveLength(1);f.editor.repository.redo();expect((await semanticWorkspace(f.open(),'agent-A')).glosses).toHaveLength(2);
 const loaded=new ReactiveEditor({id:'reload-bank',type:'workspace-object-bank-block',children:[]},{features:{nativeKnowledge:false,sqliteKnowledge:false}});clean.push(()=>loaded.dispose());registerApplicationViews(loaded);const bank=loaded.repository.readState();admitNative(loaded.repository,bytes,bank.placements[bank.rootPlacementKey].contentKey);
 const projection=loaded.createView('reloaded'),root=projection.node(projection.node(projection.state.rootKey)!.children[0])!,loadedRefs=new DialecticReferences(loaded,projection,root.key);clean.push(()=>loadedRefs.dispose());const ls=new DcpSources(loaded,f.owner,()=>root.children.map(k=>projection.node(k)!),k=>projection.node(k),k=>projection.parentOf(k),t=>loadedRefs.resolve(t),new AbortController().signal,()=>[],30000,()=>[],undefined,loadedRefs);clean.push(()=>ls.dispose());expect((await semanticWorkspace(ls,'agent-B')).entities[0].identity).toEqual(identity);
 const rebuilt=new DialecticReferences(f.editor,f.view,f.root.key);clean.push(()=>rebuilt.dispose());expect(rebuilt.semanticCandidates().targets.some(t=>t.entity?.entityId===identity.entityId)).toBe(true);
});
it('resolves whole/read and exact generated targets atomically, rejecting ambiguity, foreign/stale authority and disabled mode',async()=>{
 const f=fixture(),id=f.addHuman('Provenance provenance 😀'),s=f.open('research'),r=await f.req(s,id),read=r.structuralContext.sources.find((x:any)=>x.nativeType==='standoff-editor-block'),v=workspaceResponse(r.exchange);
 v.interpretations=[{id:'new:m1',target:{block:read.handle,revision:read.revision,whole:true},type:'dialectic/claim',ref:null,attributes:[]}];
 v.arguments=[{id:'new:arg1',anchor:{block:'new:b1',revision:null,whole:true}}];
 const prepared=await prepare(JSON.stringify(v),r.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent-B');expect([...prepared.annotations.values()].flat().find(x=>x.type==='dialectic/claim').metadata.dcp.participantId).toBe('agent-B');
 const before=f.editor.repository.state.revision;v.glosses=[{id:'new:g1',target:{block:'new:b1',revision:null,quote:'missing',prefix:'',suffix:''},type:'note',text:'Invalid'}];await expect(f.admit(s,v)).rejects.toThrow(/Missing/);expect(f.editor.repository.state.revision).toBe(before);expect(f.root.payload.linkedAnnotations??{}).toEqual({});
 const insert=vi.spyOn(f.editor.commands,'insert').mockImplementationOnce(()=>{throw Error('Injected native admission failure');});v.glosses=[];await expect(f.admit(s,v)).rejects.toThrow(/Injected/);insert.mockRestore();expect(f.editor.repository.state.revision).toBe(before);expect(f.root.payload.linkedAnnotations??{}).toEqual({});expect((await semanticWorkspace(f.open(),'agent-A')).entities).toHaveLength(0);
 v.interpretations[0].target.revision='invented';await expect(f.admit(s,v)).rejects.toThrow(/authority/);
 const off=fixture(false);off.addHuman('Test');const ss=off.open(),vv=workspaceResponse('off');vv.glosses=[{id:'new:g1',target:{block:'new:b1',revision:null,whole:true},type:'note',text:'Disabled'}];await expect(off.admit(ss,vv)).rejects.toThrow(/disabled/);
});
it('keeps central concepts through intervening turns, updates names/deletion and does no workspace work on ordinary typing',async()=>{
 const f=fixture(),id=f.addHuman('Authenticity'),s=f.open(),r=await f.req(s,id),first=await f.admit(s,workspaceResponse(r.exchange));
 const entity=first.aliases['new:e1'].entity!,s2=f.open(),w=await semanticWorkspace(s2,'agent-A');await f.admit(s2,workspaceResponse('reuse',w.entities[0].handle));
 for(let i=0;i<8;i++)f.addHuman('An intervening question '+i);
 const unrelated:Record<string,any>={};for(let i=0;i<70;i++){const d=s.entities.prepare({name:'Unrelated '+i,typename:'Concept',description:'',aliases:[]},{});unrelated[d.id]=d;}s.entities.commit(unrelated);
 expect((await semanticWorkspace(f.open(),'agent-A')).entities.some((e:any)=>e.identity.entityId===entity.entityId)).toBe(true);
 const d=JSON.parse(JSON.stringify((f.root.payload.linkedAnnotations as any)[entity.entityId]));d.metadata.scopedEntity.entity.name='Historical authenticity';d.metadata.scopedEntity.entity.revision++;
 f.editor.commands.setPayloadField(f.root.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(f.root.payload.linkedAnnotations??{})),[d.id]:d});expect((await semanticWorkspace(f.open(),'agent-A')).entities[0]).toMatchObject({name:'Historical authenticity',revision:1});
 f.editor.commands.insert({id:'draft-typing',type:'standoff-editor-block',text:'Draft text'},{kind:'at',parentKey:f.root.key,index:f.root.children.length});
 const text=f.view.node(f.root.children.at(-1)!)!,before={...f.refs.semanticDiagnostics},definitions=f.refs.diagnostics.definitionReads,trees=f.refs.diagnostics.treeVisits,properties=f.refs.diagnostics.propertyReads;const fetcher=vi.spyOn(globalThis,'fetch');
 f.editor.commands.replaceInlineRange(text.key,0,0,'More ');expect(f.refs.semanticDiagnostics).toEqual(before);expect(f.refs.diagnostics.definitionReads).toBe(definitions);expect(f.refs.diagnostics.treeVisits).toBe(trees);expect(f.refs.diagnostics.propertyReads-properties).toBeLessThanOrEqual(1);expect(fetcher).not.toHaveBeenCalled();fetcher.mockRestore();
 f.editor.commands.setPayloadField(f.root.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(f.root.payload.linkedAnnotations??{})),[d.id]:{...d,isDeleted:true}});expect((await semanticWorkspace(f.open(),'agent-A')).entities.some((e:any)=>e.identity.entityId===entity.entityId)).toBe(false);
});
it('discovers aliases locally and read-only Vault candidates with scope/revision checks',async()=>{
 const f=fixture(),id=f.addHuman('Authenticity'),s=f.open(),r=await f.req(s,id);await f.admit(s,workspaceResponse(r.exchange));const next=f.open();
 const local=await next.tool({id:'local',tool:'search_entities',arguments:{query:'Genuineness',scope:'document',limit:4}});expect(local.items[0].name).toBe('Authenticity');
 const paged=await next.tool({id:'page1',tool:'search_entities',arguments:{cursor:null,query:'Authenticity',scope:'document',limit:1}});expect(paged.nextCursor).toBeTruthy();const tail=await next.tool({id:'page2',tool:'search_entities',arguments:{cursor:paged.nextCursor,query:'Authenticity',scope:'document',limit:1}});expect(tail.items).toHaveLength(0);expect(tail.status).toBe('complete');
 let vault='vault-A',revision=2;const write=vi.fn(()=>{throw Error('No writes');}),get=vi.fn(async()=>({id:'v1',name:'Provenance',revision,aliases:[]}));clean.push(registerStandaloneEntityService(f.editor,()=>({scopeIdentity:async()=>vault,search:async()=>({candidates:[{id:'v1',name:'Provenance',evidence:[]}],complete:true,diagnostics:[],current(){}}),get,create:write,rename:write,alias:write,dispose(){}} as any)));
 const result=await next.tool({id:'vault',tool:'search_entities',arguments:{query:'Provenance',scope:'vault',limit:4}});expect(result.items[0]).toMatchObject({identity:{scope:'vault',vaultId:'vault-A',entityId:'v1'},revision:2});
 const v=workspaceResponse('vault-reuse',result.items[0].handle);await prepare(JSON.stringify(v),v.exchange,f.owner,f.editor.visualEffects,next,true,'ai');expect(write).not.toHaveBeenCalled();revision++;await expect(prepare(JSON.stringify(v),v.exchange,f.owner,f.editor.visualEffects,next,true,'ai')).rejects.toThrow(/changed/);vault='foreign';await expect(next.source(result.items[0].handle)).rejects.toThrow(/another Vault/);
});
it('negotiates bounded targets and tools in both providers without changing disabled schemas',()=>{
 for(const provider of ['openai','anthropic'] as const){const schema=schemaFor(provider,true,true,true,true,true,true,true,true,undefined,true);expect(schema.$defs.SemanticTarget.anyOf).toHaveLength(3);expect(schema.$defs.Gloss.properties.target.$ref).toContain('SemanticTarget');expect(schemaFor(provider).$defs.SemanticTarget).toBeUndefined();}
 expect(providerTools(true,true).some(t=>t.name==='search_entities')).toBe(true);expect(providerTools(true).some(t=>t.name==='search_entities')).toBe(false);
});

it('bounds projection bytes and candidate work for a larger semantic registry',async()=>{
 const f=fixture();f.addHuman('A new question');const s=f.open(),records:Record<string,any>={};
 for(let i=0;i<80;i++){const d=s.entities.prepare({name:'Concept '+i,typename:'Concept',description:'Long description '.repeat(60),aliases:['Alias '+i]},{actor:'human'});records[d.id]=d;}
 s.entities.commit(records);const workspace=await semanticWorkspace(f.open(),'agent-A');expect(workspace.coverage.bytes).toBeLessThanOrEqual(8192);expect(workspace.coverage.candidates).toBeLessThanOrEqual(48);expect(workspace.coverage.completeRegistry).toBe(false);expect(workspace.entities.length).toBeLessThan(80);expect(workspace.omissions.some((v:string)=>v.includes('byte budget'))).toBe(true);
});
