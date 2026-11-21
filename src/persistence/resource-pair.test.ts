// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {ResourcePair,type PairGeneration} from './resource-pair';
import * as native from './native-resource';
import {workspaceFixture} from '../features/dialectic/dcp/workspace.fixture';
import {XmlContext} from '../features/dialectic/dcp/xml-context';
import {normalizeDefinitionOwnership} from '../block-tree/definition-ownership';
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
function fixture(){
 const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[
  {id:'doc',type:'document-block',children:[{id:'p',type:'standoff-editor-block',text:'Hello world'}]},
  {id:'other',type:'document-block',children:[{id:'q',type:'standoff-editor-block',text:'Untouched'}]},
 ]});cleanup.push(()=>editor.dispose());const view=editor.createView();
 const node=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
 const saved:PairGeneration[]=[];
 const adapter={save:vi.fn(async(g:any)=>{saved.push(g);return {phase:'saved' as const,generation:g.generation};}),recover:vi.fn(async()=>({phase:'failed' as const}))};
 const pair=new ResourcePair(editor.repository,'doc',adapter,()=>[]);
 return {editor,node,pair,adapter,saved};
}
it('captures once, never serializes dirty reads, and isolates ordinary edits to their owning Document',async()=>{
 const f=fixture(),r=f.editor.repository;
 const capture=vi.spyOn(native,'captureNative'),encode=vi.spyOn(native,'nativeText'),snapshot=vi.spyOn(r,'snapshot');
 expect(await f.pair.save()).toMatchObject({phase:'saved',dirty:false});
 expect(capture).toHaveBeenCalledTimes(1);expect(encode).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();
 capture.mockClear();encode.mockClear();
 // Warm Solid dev-store lazy proxies before measuring steady typing.
 void r.state.contents;void r.state.placements;
 const state=r.readState(),originalValues=Object.values,originalKeys=Object.keys;
 const values=vi.spyOn(Object,'values').mockImplementation((v:any)=>{if(v===state.contents||v===state.placements)throw Error('Unexpected repository enumeration');return originalValues(v);}),keys=vi.spyOn(Object,'keys').mockImplementation((v:any)=>{if(v===state.contents||v===state.placements)throw Error('Unexpected repository keys');return originalKeys(v);}),generation=r.resourceGeneration('doc');
 f.editor.commands.replaceInlineRange(f.node('q').key,0,0,'Unrelated ');
 expect(r.resourceGeneration('doc')).toBe(generation);expect(f.pair.dirty).toBe(false);
 f.editor.commands.replaceInlineRange(f.node('p').key,0,0,'Changed ');
 for(let i=0;i<100;i++)expect(f.pair.dirty).toBe(true);
 expect(capture).not.toHaveBeenCalled();expect(encode).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();
 expect([...values.mock.calls,...keys.mock.calls].some(([v])=>v===state.contents||v===state.placements)).toBe(false);
});
it('tracks structure, standoff, programmatic record batches, placement-only changes and Undo/Redo',async()=>{
 const f=fixture(),r=f.editor.repository;
 const change=async(action:()=>void)=>{await f.pair.save();const before=r.resourceGeneration('doc');action();expect(r.resourceGeneration('doc')).toBeGreaterThan(before);expect(f.pair.dirty).toBe(true);};
 await change(()=>f.editor.commands.setPayloadField(f.node('p').key,'standoffProperties',[{id:'bold',type:'style/bold',start:0,end:4}]));
 await change(()=>f.editor.commands.insert({id:'added',type:'standoff-editor-block',text:'Added'},{kind:'at',parentKey:f.node('doc').key,index:1}));
 await change(()=>r.undo());await change(()=>r.redo());
 await change(()=>{const p=r.readState().placements[f.node('p').placementKey];r.commit('Placement identity',[{kind:'put-placement',record:{...p,placementId:'persisted-occurrence'}}]);});
 await change(()=>{const c=r.readState().contents[f.node('p').contentKey];r.commit('Programmatic batch',[{kind:'record-batch',contents:{[c.key]:{...c,payload:{...c.payload,metadata:{imported:true}}}},placements:{}}]);});
 expect(native.nativeText(native.decodeNative(new TextEncoder().encode((await f.pair.save(),f.saved.at(-1)!.native))))).toBe(f.saved.at(-1)!.native);
});
it('tracks detached retained content and rejects failed transactions without advancing the generation',async()=>{
 const f=fixture(),r=f.editor.repository,root=f.node('doc').contentKey,p=f.node('p'),members=Object.keys(native.captureNative(r.readState(),'doc').contents);
 const normalized=normalizeDefinitionOwnership(r.readState(),new Map(members.map(k=>[k,root])));
 r.commit('Normalize definition ownership',members.map(k=>({kind:'put-content' as const,record:normalized.contents[k]})));
 f.editor.commands.remove(p.key);expect(r.readState().contents[p.contentKey].definitionOwnerKey).toBe(root);
 await f.pair.save();const before=r.resourceGeneration('doc'),record=r.readState().contents[p.contentKey];
 r.commit('Edit retained definition',[{kind:'put-content',record:{...record,payload:{...record.payload,metadata:{note:'retained edit'}}}}]);
 expect(r.resourceGeneration('doc')).toBeGreaterThan(before);expect(f.pair.dirty).toBe(true);
 await f.pair.save();const saved=r.resourceGeneration('doc');
 expect(()=>f.editor.commands.boundedStructuralTransaction('Aborted',()=>{f.editor.commands.setPayloadField(f.node('doc').key,'metadata',{title:'Must not persist'});throw Error('Abort');})).toThrow('Abort');
 expect(r.resourceGeneration('doc')).toBe(saved);expect(f.pair.dirty).toBe(false);
 expect(f.saved.at(-1)!.native).toContain('retained edit');expect(f.saved.at(-1)!.native).not.toContain('Must not persist');
});
it('keeps the captured generation through failure/recovery and detects edits made while saving',async()=>{
 const f=fixture();let finish!:(r:any)=>void;
 f.adapter.save.mockImplementationOnce(g=>{f.saved.push(g);return new Promise(r=>finish=r);});
 const saving=f.pair.save();const frozen=f.saved[0];
 f.editor.commands.replaceInlineRange(f.node('p').key,0,0,'During save ');
 finish({phase:'failed',generation:frozen.generation,error:'Unknown outcome'});
 expect(await saving).toMatchObject({phase:'failed',dirty:true});
 expect((await f.pair.save()).error).toContain('pending generation');
 f.adapter.recover.mockImplementationOnce(async()=>({phase:'saved',generation:frozen.generation}) as any);
 expect(await f.pair.recover()).toMatchObject({phase:'saved',dirty:true});
 expect(frozen.native).not.toContain('During save');
 expect(await f.pair.save()).toMatchObject({phase:'saved',dirty:false});expect(f.saved.at(-1)!.native).toContain('During save');
});
it('tracks DCP Entities, Relationships, Glosses, interpretations and source annotations atomically',async()=>{
 const f=workspaceFixture();cleanup.push(()=>f.dispose());const h=f.addHuman('Leonardo served Ludovico.'),s=f.open(),r=await f.req(s,h,'agent-A',1),x=new XmlContext(s,r.exchange);r.dialect='xml/1';x.request(r);
 const pair=new ResourcePair(f.editor.repository,f.owner,{save:async g=>({phase:'saved',generation:g.generation}),recover:async()=>({phase:'failed'})},()=>[]);
 await pair.save();const before=f.editor.repository.resourceGeneration(f.owner);
 const block=r.structuralContext.sources.find((s:any)=>s.kind==='block');
 const xml=`<response><p><span id="claim"><e ref="leo">Leonardo</e> served <e ref="lud">Ludovico</e>.</span></p><definitions><entity id="leo" name="Leonardo" type="Person"/><entity id="lud" name="Ludovico" type="Person"/><relation id="employment" kind="entity" type="employed-by" from="leo" to="lud"/><mention target="${x.alias(block.handle)}" quote="Leonardo" ref="leo"/><classify target="claim" kind="claim"/><gloss target="claim" kind="evidence">An employment relationship.</gloss></definitions></response>`;
 await f.admit(s,x.lower(xml),'agent-A',r);
 expect(f.editor.repository.resourceGeneration(f.owner)).toBeGreaterThan(before);expect(pair.dirty).toBe(true);
 const text=native.nativeText(native.captureNative(f.editor.repository.readState(),f.owner));
 for(const type of ['mutable/entity','mutable/entity-relation','mutable/gloss','dialectic/claim','mutable/entity-reference'])expect(text).toContain(type);
 expect(native.nativeText(native.decodeNative(new TextEncoder().encode(text)))).toBe(text);
 await pair.save();f.editor.repository.undo();expect(pair.dirty).toBe(true);
 await pair.save();f.editor.repository.redo();expect(pair.dirty).toBe(true);
});
