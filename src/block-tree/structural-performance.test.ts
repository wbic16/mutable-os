import {afterEach, expect, it, vi} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {validateRepository} from './repository';
import {applyHistoryChanges} from '../history/replay';
import {unwrap} from 'solid-js/store';
import {clone} from './clone';
import type {BlockNode, ExistingBlockDto, RepositoryOperation} from './types';
import {structuralChangeFor} from './structural-plan';
import {composePreparedLeaves} from './prepared-leaves';
import {managedImageBlock} from '../interchange/resource-url';
const editors: ReactiveEditor[] = [];
afterEach(()=>{editors.splice(0).forEach(e=>e.dispose());vi.restoreAllMocks();});
const p=(id:string):ExistingBlockDto=>({id,type:'standoff-editor-block',text:'α😀 annotated text',standoffProperties:[{id:'ann-'+id,type:'codex/entity-reference',value:'entity',start:4,end:10}],metadata:{unknown:{preserve:true}}});
function setup(extra=0){
 const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'left',type:'container-block',children:[p('a'),p('b')]},{id:'right',type:'container-block',children:[p('c')]},...Array.from({length:extra},(_,i)=>({...p('unrelated'+i),text:'z'.repeat(100)}))]});editors.push(editor);
 const view=editor.createView('test'),block=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
 return {editor,view,block};
}
it.each([0,300])('admits mixed prepared image leaves with bounded canonical work beside %i unrelated paragraphs',extra=>{
 const f=setup(extra),r=f.editor.repository,c=f.editor.commands;
 const native=managedImageBlock({cavernId:'fixture',assetId:'sha256:'+'a'.repeat(64),mediaType:'image/png',byteLength:100},'Image').native;
 const fragment=composePreparedLeaves({id:'mixed',type:'container-block',children:[{id:'slot',type:'image-block'},{id:'commentary',type:'standoff-editor-block',text:'Commentary '.repeat(50)}]},new Map([['slot',native]]),3);
 const untouched=r.readState().contents[f.block('c').contentKey],payload=vi.spyOn(untouched,'payload','get'),snapshot=vi.spyOn(r,'snapshot'),rebuild=vi.spyOn(r as any,'rebuildReferences'),build=vi.spyOn(f.view as any,'build');
 c.boundedStructuralTransaction('Admit prepared composition',()=>c.insertFragment(fragment,{kind:'before',anchorKey:f.block('a').key}));
 r.undo();r.redo();expect(snapshot).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(payload).not.toHaveBeenCalled();
 payload.mockRestore();validateRepository(r.readState());checkProjection(f);
});
function checkProjection(f:ReturnType<typeof setup>){
 const oracle=f.editor.createView('oracle');
 const shape=(node:BlockNode,view:typeof oracle):unknown=>({placement:node.placementKey,content:node.contentKey,type:node.viewType,payload:clone(unwrap(node.payload)),children:node.children.map(k=>shape(view.node(k)!,view)),inline:node.inlineContent.map(k=>shape(view.node(k)!,view)),relations:Object.fromEntries(Object.entries(node.ownedRelations).map(([name,k])=>[name,shape(view.node(k)!,view)]))});
 expect(shape(f.view.node(f.view.state.rootKey)!,f.view)).toEqual(shape(oracle.node(oracle.state.rootKey)!,oracle));
 for(const node of Object.values(f.view.state.nodes))for(const child of [...node.children,...node.inlineContent,...Object.values(node.ownedRelations)])expect(f.view.parentOf(child)?.key).toBe(node.key);
 f.editor.disposeView(oracle);
}
it('matches full validation, fresh projections and durable replay through composed moves, removals and history',()=>{
 const f=setup(),r=f.editor.repository,c=f.editor.commands;
 let replay=r.snapshot();const errors:unknown[]=[];
 r.subscribeHistoryChanges(e=>{replay=applyHistoryChanges(replay,e);},e=>errors.push(e));
 const original=f.editor.encodeDocument(), originalA=f.block('a').key;
 const check=()=>{validateRepository(r.readState());expect(replay).toEqual(r.snapshot());checkProjection(f);};
 c.structuralTransaction('wrap and move',()=>{
  const shell=c.insert({id:'wrapper',type:'container-block',children:[]},{kind:'before',anchorKey:f.block('a').key});
  c.move(f.block('a').key,{kind:'at',parentKey:shell,index:0});
  c.move(shell,{kind:'at',parentKey:f.block('right').key,index:1});
  c.move(f.block('b').key,{kind:'at',parentKey:shell,index:1});
 });check();expect(f.block('a').key).toBe(originalA);const wrapperKey=f.block('wrapper').key;r.undo();check();r.redo();check();expect(f.block('wrapper').key).toBe(wrapperKey);
 c.structuralTransaction('inline and metadata',()=>{
  c.replaceInlineRange(f.block('a').key,0,2,'hello');
  c.replaceInlineRange(f.block('a').key,1,2,'x');
  c.setPayloadField(f.block('wrapper').key,'future',{opaque:['keep']});
 });check();
 c.structuralTransaction('extract and dissolve',()=>{
  c.move(f.block('a').key,{kind:'at',parentKey:f.block('left').key,index:0});
  c.move(f.block('b').key,{kind:'after',anchorKey:f.block('a').key});
  c.remove(f.block('wrapper').key);
 });check();
 const after=f.editor.encodeDocument();
 for(let i=0;i<3;i++){r.undo();check();}expect(f.editor.encodeDocument()).toEqual(original);
 for(let i=0;i<3;i++){r.redo();check();}expect(f.editor.encodeDocument()).toEqual(after);expect(errors).toEqual([]);
});
it.each([0,300])('avoids snapshots, global indexing and unrelated record reads with %i unrelated paragraphs',extra=>{
 const f=setup(extra),r=f.editor.repository,c=f.editor.commands;
 const snapshot=vi.spyOn(r,'snapshot'),rebuild=vi.spyOn(r as any,'rebuildReferences'),build=vi.spyOn(f.view as any,'build');
 const source=r.readState(),original=source.contents[f.block('c').contentKey];
 const payload=vi.spyOn(original,'payload','get');
 c.structuralTransaction('small wrap',()=>{
  const wrapper=c.insert({id:'wrapper',type:'container-block',children:[]},{kind:'before',anchorKey:f.block('a').key});
  c.move(f.block('a').key,{kind:'at',parentKey:wrapper,index:0});
 });
 r.undo();r.redo();
 expect(snapshot).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(payload).not.toHaveBeenCalled();
});
it('rolls back failed assembly and invalid final topology without publishing',()=>{
 const f=setup(),r=f.editor.repository,c=f.editor.commands,before=r.snapshot(),notify=vi.fn();r.subscribeChanges(notify);
 expect(()=>c.structuralTransaction('failure',()=>{c.insert(p('fresh'),{kind:'at',parentKey:f.block('left').key,index:0});throw Error('abort');})).toThrow('abort');
 expect(r.snapshot()).toEqual(before);expect(notify).not.toHaveBeenCalled();
 expect(()=>c.structuralTransaction('cycle',()=>{c.move(f.block('left').key,{kind:'at',parentKey:f.block('a').key,index:0});})).toThrow();
 expect(r.snapshot()).toEqual(before);expect(notify).not.toHaveBeenCalled();
});
it('materializes unsupported commands once without losing borrowed records or earlier staged edits',()=>{
 const f=setup(4),r=f.editor.repository,c=f.editor.commands,before=f.editor.encodeDocument();
 c.structuralTransaction('mixed batch',()=>{
  c.insert(p('fresh'),{kind:'at',parentKey:f.block('left').key,index:0});
  c.setRelation(f.block('a').key,'leftMargin',{type:'left-margin-block',children:[p('margin')]});
  c.move(f.block('b').key,{kind:'at',parentKey:f.block('right').key,index:1});
 });validateRepository(r.readState());checkProjection(f);expect(f.block('fresh')).toBeTruthy();expect(f.block('unrelated3')).toBeTruthy();
 r.undo();expect(f.editor.encodeDocument()).toEqual(before);r.redo();checkProjection(f);
});
it('rejects local classification of root cycles, resource moves and detached children',()=>{
 const f=setup(),r=f.editor.repository,state=r.readState(),root=state.contents[state.placements[state.rootPlacementKey].contentKey];
 const evidence={locationOf:(k:string)=>r.locationOf(k),referenceCount:(k:string)=>r.contentReferenceCount(k),ownedKeys:(k:string)=>r.ownedPlacementKeys(k)};
 const attempts:RepositoryOperation[][]=[
  [{kind:'put-content',record:{...clone(root),children:[...root.children,state.rootPlacementKey]}}],
  [{kind:'put-content',record:{...clone(root),children:[]}}],
  [{kind:'put-content',record:{...clone(root),payload:{...root.payload,metadata:{documentId:'other'}}}}],
 ];
 for(const ops of attempts)expect(structuralChangeFor(state,ops,evidence)).toBeUndefined();
});

it('leaves unrelated Document projections and payloads untouched',()=>{
 const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'first',type:'document-block',children:[p('source')]},{id:'second',type:'document-block',children:[p('unrelated')]}]});editors.push(editor);
 const workspace=editor.createView('workspace'),[first,second]=workspace.node(workspace.state.rootKey)!.children.map(k=>workspace.node(k)!);
 const a=editor.createView('first',first.placementKey),b=editor.createView('second',second.placementKey);
 const publish=vi.spyOn(b as any,'setState'),rebuild=vi.spyOn(b as any,'build');
 const n=a.node(a.node(a.state.rootKey)!.children[0])!;
 editor.commands.structuralTransaction('local wrap',()=>{
  const shell=editor.commands.insert({id:'shell',type:'container-block',children:[]},{kind:'before',anchorKey:n.key});
  editor.commands.move(n.key,{kind:'at',parentKey:shell,index:0});
 });editor.repository.undo();editor.repository.redo();
 expect(publish).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();
});
it('keeps shared occurrence disambiguation and generic fallback correct',()=>{
 const f=setup(),c=f.editor.commands,r=f.editor.repository;
 c.transclude(f.block('left').key,{kind:'at',parentKey:f.block('right').key,index:1});
 const before=f.editor.encodeDocument();
 c.structuralTransaction('wrap a shared child',()=>{
  const shell=c.insert({id:'wrapper',type:'container-block',children:[]},{kind:'before',anchorKey:f.block('a').key});
  c.move(f.block('a').key,{kind:'at',parentKey:shell,index:0});
 });validateRepository(r.readState());checkProjection(f);
 r.undo();expect(f.editor.encodeDocument()).toEqual(before);checkProjection(f);r.redo();checkProjection(f);
});

it('does not admit a stranded legacy subtree when only its incoming placement is removed',()=>{
 const f=setup(),r=f.editor.repository,state=r.readState(),root=state.contents[state.placements[state.rootPlacementKey].contentKey],left=f.block('left'),before=r.snapshot();
 expect(()=>r.commit('invalid detach',[
  {kind:'put-content',record:{...clone(root),children:root.children.filter(k=>k!==left.placementKey)}},
  {kind:'remove-placement',key:left.placementKey},
 ])).toThrow(/unreachable/);
 expect(r.snapshot()).toEqual(before);
});

it('keeps Document root placement lifetime changes on full admission and catalogue notification',()=>{
 const e=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'document',type:'document-block',children:[]}]});editors.push(e);
 const r=e.repository,s=r.readState(),root=s.contents[s.placements[s.rootPlacementKey].contentKey],pk=root.children[0];
 const operations:RepositoryOperation[]=[{kind:'put-content',record:{...clone(root),children:[]}},{kind:'remove-placement',key:pk}];
 expect(structuralChangeFor(s,operations,{locationOf:k=>r.locationOf(k),referenceCount:k=>r.contentReferenceCount(k),ownedKeys:k=>r.ownedPlacementKeys(k)})).toBeUndefined();
 const changed=vi.fn();r.subscribeChanges(changed);r.commit('remove Document root',operations);expect(changed.mock.calls[0][0].structural).toBeUndefined();validateRepository(r.readState());
});
