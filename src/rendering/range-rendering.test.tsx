// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { onCleanup } from 'solid-js';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import type { AnnotationHandlerContext } from '../runtime/visual-effect-registry';
const cleanups:(()=>void)[]=[];
afterEach(()=>{cleanups.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.replaceChildren();});
const tick=()=>new Promise(resolve=>setTimeout(resolve,35));
function setup(properties:Record<string,unknown>[] = [], direct=true, shared=true) {
  const rectangles=vi.fn(()=>[{left:0,top:0,width:80,height:20,x:0,y:0,right:80,bottom:20}]);
  const old=Object.getOwnPropertyDescriptor(Range.prototype,'getClientRects');
  Object.defineProperty(Range.prototype,'getClientRects',{configurable:true,value:rectangles});
  cleanups.push(()=>{if(old)Object.defineProperty(Range.prototype,'getClientRects',old);else Reflect.deleteProperty(Range.prototype,'getClientRects');});
  const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'abcdefghij',standoffProperties:properties}]},{features:{directDomCharacterCells:direct,standoffPropertyRendering:shared}});
  registerCoreViews(editor);
  const release=editor.visualEffects.registerType({type:'test',renderers:[{id:'underline',name:'svg-underline'},{id:'class',name:'css-class',params:{classes:['common']}}],states:{'caret-inside':{underline:{opacity:.7}}},events:{'caret-enter':['enter']}});
  const entered:AnnotationHandlerContext[]=[];
  editor.visualEffects.registerHandler('enter',ctx=>{entered.push(ctx);});
  const view=editor.createView('test'),key=view.node(view.state.rootKey)!.children[0];
  const host=document.body.appendChild(document.createElement('div'));
  const dispose=render(()=><ReactiveTreeView editor={editor} projection={view}/>,host);
  cleanups.push(()=>{dispose();editor.dispose();});
  const paths=()=>[...host.querySelectorAll<SVGPathElement>('path[data-property-type="test"]')];
  const cells=()=>[...host.querySelectorAll<HTMLElement>('.reactive-standoff-flow > span')];
  const replace=(properties:Record<string,unknown>[])=>editor.commands.setPayloadField(key,'standoffProperties',properties);
  const range=(start=0,end=4)=>editor.textRanges.snapshot(key,start,end);
  return {editor,view,key,host,dispose,release,paths,cells,replace,range,rectangles,entered};
}
const p=(id:string,start=0,end=3)=>({id,type:'test',start,end});
it('does not measure colour-only class publication, while preserving layout-changing classes', async () => {
  const f=setup(); await tick(); f.rectangles.mockClear();
  const collection=f.editor.temporaryRanges.createCollection('colour');
  collection.replace([{id:'colour',range:f.range(),renderers:[{id:'colour',name:'css-class',params:{classes:['syntax-keyword'],affectsLayout:false}}]}]);
  await tick(); expect(f.cells()[0].classList.contains('syntax-keyword')).toBe(true); expect(f.rectangles).not.toHaveBeenCalled();
  collection.dispose(); await tick(); expect(f.rectangles).not.toHaveBeenCalled();
});
it.each([true,false])('removes only an individual overlapping contribution, preserving text and the other owner (direct=%s)',async direct=>{
  const f=setup([p('a'),p('b')],direct);await tick();const nodes=f.cells(),paths=f.paths();
  expect(paths).toHaveLength(2);expect(nodes[0].classList.contains('common')).toBe(true);
  f.editor.annotationEvents.setCaret(f.key,1);expect(f.entered).toHaveLength(2);
  const cleanup=vi.fn();f.entered[0].own(cleanup);
  f.replace([{...p('a'),isDeleted:true},p('b')]);
  expect(cleanup).toHaveBeenCalledTimes(1);expect(f.entered[0].signal.aborted).toBe(true);
  expect(f.paths()).toEqual([paths[1]]);expect(f.cells()[0]).toBe(nodes[0]);expect(nodes[0].classList.contains('common')).toBe(true);
  f.editor.annotationEvents.setCaret(f.key,8);f.editor.annotationEvents.setCaret(f.key,1);expect(f.entered).toHaveLength(3);
  f.replace([]);expect(f.paths()).toHaveLength(0);expect(f.cells()[0].classList.contains('common')).toBe(false);
  expect(f.cells().map(c=>c.textContent).join('')).toBe('abcdefghij');
});
it('keeps owners and SVG paths through range updates, reorder and legacy typing; undo starts a fresh removed lifetime',async()=>{
  const f=setup([p('a'),{type:'test',start:4,end:6}]);await tick();const paths=f.paths();
  f.editor.commands.replaceInlineRange(f.key,0,0,'!');await tick();expect(f.paths()).toEqual(paths);
  const properties=JSON.parse(JSON.stringify(f.view.node(f.key)!.payload.standoffProperties));
  f.editor.commands.editStandoffProperty(f.key,1,properties[1],{start:5,end:8});await tick();expect(f.paths()).toEqual(paths);
  f.editor.annotationEvents.setCaret(f.key,6);const before=f.entered.at(-1)!;
  f.editor.commands.editStandoffProperty(f.key,1,JSON.parse(JSON.stringify((f.view.node(f.key)!.payload.standoffProperties as Record<string,unknown>[])[1])),'delete');
  expect(before.signal.aborted).toBe(true);expect(f.paths()).toHaveLength(1);
  f.editor.repository.undo();await tick();expect(f.paths()).toHaveLength(2);expect(f.paths()[1]).not.toBe(paths[1]);
  const late=vi.fn();before.own(late);expect(late).toHaveBeenCalledTimes(1);
  f.replace([p('b'),p('a')]);await tick();const ordered=f.paths();f.replace([p('a'),p('b')]);expect(f.paths()).toEqual([ordered[1],ordered[0]]);
});
it('shares renderer geometry and CSS with temporary ranges without writes, and disposes session effects independently',async()=>{
  const f=setup([p('a')]);await tick();const persisted=f.paths()[0];const revision=f.editor.repository.state.revision,encoded=f.editor.encodeDocument();
  f.rectangles.mockClear();
  const session=f.editor.temporaryRanges.createCollection('test-session');
  session.replace([{id:'word',type:'test',range:f.range()}]);await tick();
  expect(f.paths()).toHaveLength(2);expect(f.rectangles).toHaveBeenCalledTimes(1);
  const temporary=f.paths()[1];f.rectangles.mockClear();
  const ranges=vi.spyOn(f.editor.annotationEvents,'setRanges'),snapshot=vi.spyOn(f.editor.repository,'snapshot');
  f.editor.annotationEvents.setCaret(f.key,2);await tick();
  expect(f.entered.map(ctx=>ctx.source.kind)).toEqual(['annotation','temporary']);
  expect(f.rectangles).not.toHaveBeenCalled();expect(ranges).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();
  session.upsert({id:'word',type:'test',range:f.range(1,5)});await tick();expect(f.paths()[1]).toBe(temporary);
  session.dispose();expect(f.paths()).toEqual([persisted]);expect(f.cells()[1].classList.contains('common')).toBe(true);
  expect(f.editor.repository.state.revision).toBe(revision);expect(f.editor.repository.canUndo()).toBe(false);expect(f.editor.encodeDocument()).toEqual(encoded);
  expect(()=>session.upsert({id:'late',range:f.range()})).toThrow('disposed');
});
it('invalidates stale temporary matches, retains independent owners, and cannot revive them by visibility or partial updates',async()=>{
  const f=setup();const first=f.editor.temporaryRanges.createCollection('first'),second=f.editor.temporaryRanges.createCollection('second');
  first.replace([{id:'old',range:f.range(),renderers:[{id:'c',name:'css-class',params:{classes:['common']}}]}]);
  second.replace([{id:'other',range:f.range(),renderers:[{id:'c',name:'css-class',params:{classes:['common']}}]}]);
  first.dispose();expect(f.cells()[0].classList.contains('common')).toBe(true);
  f.editor.commands.replaceInlineRange(f.key,0,0,'!');expect(f.cells()[0].classList.contains('common')).toBe(false);
  f.editor.decorations.setHighlightsVisible('second',true);f.editor.decorations.setMatchVisible('second','other',true);expect(f.editor.decorations.nodes[f.key]).toHaveLength(0);
  second.upsert({id:'new',range:f.range(5,8)});expect(f.editor.decorations.nodes[f.key].map(d=>d.id)).toEqual(['new']);
  f.editor.disposeView(f.view);expect(f.editor.decorations.nodes[f.key]).toHaveLength(0);
});
it('releases renderer components on feature removal and terminal editor disposal, even with a pending frame',async()=>{
  const f=setup();const destroyed=vi.fn();
  const releaseRenderer=f.editor.visualEffects.registerRenderer({name:'probe',target:'range-overlay',defaults:{},validate(){},layoutParams:[],laneHeight:()=>0,View(){onCleanup(destroyed);return <path data-probe/>;}});
  const releaseType=f.editor.visualEffects.registerType({type:'probe',renderers:[{id:'probe',name:'probe'}]});
  f.replace([{id:'probe',type:'probe',start:0,end:2}]);await tick();expect(f.host.querySelector('[data-probe]')).not.toBeNull();
  const diagnostic=vi.spyOn(console,'error').mockImplementation(()=>{});
  releaseRenderer();expect(diagnostic).toHaveBeenCalledWith('Unknown renderer probe');expect(destroyed).toHaveBeenCalledTimes(1);expect(f.host.querySelector('[data-probe]')).toBeNull();releaseType();
  const session=f.editor.temporaryRanges.createCollection('late');session.replace([{id:'x',type:'test',range:f.range()}]);
  f.editor.dispose();await tick();expect(f.paths()).toHaveLength(0);expect(()=>session.replace([])).toThrow('disposed');
  f.editor.annotationEvents.setRanges(f.key,[{key:'late',index:0,type:'test',start:0,end:3}]);f.editor.annotationEvents.setCaret(f.key,1);expect(f.editor.annotationEvents.isActive(f.key,'late')).toBe(false);
});
it('supports point annotations without drawing characters or measuring their geometry',async()=>{
  const f=setup([{id:'point',type:'test',start:10,end:10,isZeroWidth:true}]);await tick();expect(f.paths()).toHaveLength(0);expect(f.cells().some(c=>c.classList.contains('common'))).toBe(false);
  f.rectangles.mockClear();f.editor.annotationEvents.setCaret(f.key,9);expect(f.entered).toHaveLength(0);
  f.editor.annotationEvents.setCaret(f.key,10);expect(f.entered).toHaveLength(1);expect(f.rectangles).not.toHaveBeenCalled();
});
it('retains the legacy renderer when the shared rendering flag is disabled',async()=>{
  const f=setup([{id:'claim',type:'codex/claim-reference',start:0,end:3}],true,false);await tick();
  expect(f.host.querySelector('path[data-property-type="codex/claim-reference"]')).not.toBeNull();
  expect(f.host.querySelector('[data-effect-owner]')).toBeNull();
});

it('removes all occurrences of a deleted linked definition, retaining independent overlapping annotations',async()=>{
  const f=setup([p('independent')]);
  const id=f.editor.linkedAnnotations.createForSegments([{nodeKey:f.key,start:0,end:4}],'test');await tick();
  f.editor.annotationEvents.setCaret(f.key,1);expect(f.entered).toHaveLength(2);
  const survivor=f.paths()[0],segment=(f.view.node(f.key)!.payload.standoffProperties as Record<string,unknown>[])[1];
  f.editor.linkedAnnotations.deleteAll(id,JSON.parse(JSON.stringify(segment)),f.view.node(f.key)!.contentKey);
  expect(f.paths()).toEqual([survivor]);expect(f.entered[1].signal.aborted).toBe(true);expect(f.cells()[0].classList.contains('common')).toBe(true);
  f.editor.repository.undo();await tick();expect(f.paths()).toHaveLength(2);expect(f.entered).toHaveLength(3);
});
it('retains legacy identities when appending annotations and rejects ambiguous replacement continuity',async()=>{
  const f=setup([{type:'test',start:0,end:3},{type:'test',start:0,end:3}]);await tick();const paths=f.paths();
  f.editor.rangeAnnotations.apply([f.range(5,8)],'test');await tick();expect(f.paths().slice(0,2)).toEqual(paths);
  f.replace([{type:'test',start:0,end:3}]);await tick();expect(f.paths()).toHaveLength(1);expect(paths).not.toContain(f.paths()[0]);
});
it('keeps class contributions through binding updates and releases named-handler effects on unregister',async()=>{
  const f=setup();const cleanup=vi.fn(),lateCleanup=vi.fn();let context:AnnotationHandlerContext|undefined;
  const stop=f.editor.visualEffects.registerHandler('owned',ctx=>{context=ctx;ctx.own(cleanup);});
  const collection=f.editor.temporaryRanges.createCollection('bindings');
  const range=f.range();
  collection.replace([{id:'x',range,renderers:[{id:'class',name:'css-class',params:{classes:['one','common']}},{id:'second',name:'css-class',params:{classes:['common']}}],events:{'caret-enter':['owned']}}]);
  f.editor.annotationEvents.setCaret(f.key,1);expect(context).toBeDefined();
  collection.upsert({id:'x',range,renderers:[{id:'second',name:'css-class',params:{classes:['common']}}],events:{'caret-enter':['owned']}});
  expect(f.cells()[1].classList.contains('one')).toBe(false);expect(f.cells()[1].classList.contains('common')).toBe(true);
  expect(cleanup).not.toHaveBeenCalled();stop();expect(cleanup).toHaveBeenCalledTimes(1);expect(context!.signal.aborted).toBe(true);
  await Promise.resolve();context!.own(lateCleanup);expect(lateCleanup).toHaveBeenCalledTimes(1);collection.dispose();expect(cleanup).toHaveBeenCalledTimes(1);
});
it('removes legacy SVG and region effects synchronously when an annotation is deleted',async()=>{
  const f=setup([{id:'a',type:'style/underline',start:0,end:2},{id:'b',type:'style/blur',start:0,end:2}]);await tick();
  expect(f.host.querySelector('[data-property-type="style/blur"]')).not.toBeNull();
  f.replace([]);expect(f.host.querySelector('[data-property-type="style/blur"]')).toBeNull();expect(f.host.querySelector('[data-property-type="style/underline"]')).toBeNull();
});

it('updates temporary paint parameters on the same SVG path without another layout pass',async()=>{
  const f=setup();const session=f.editor.temporaryRanges.createCollection('paint'),range=f.range();
  session.replace([{id:'x',range,renderers:[{id:'line',name:'svg-underline',params:{color:'red'}}]}]);await tick();
  const path=f.host.querySelector('.reactive-search-layer path')!;expect(path.getAttribute('stroke')).toBe('red');f.rectangles.mockClear();
  session.upsert({id:'x',range,renderers:[{id:'line',name:'svg-underline',params:{color:'blue',opacity:.5}}]});await tick();
  expect(f.host.querySelector('.reactive-search-layer path')).toBe(path);expect(path.getAttribute('stroke')).toBe('blue');expect(path.getAttribute('opacity')).toBe('0.5');expect(f.rectangles).not.toHaveBeenCalled();
});

it('can override temporary interaction behaviour while reusing a registered type renderer',async()=>{
  const f=setup(),entered=vi.fn();f.editor.visualEffects.registerHandler('temporary-only',entered);
  const collection=f.editor.temporaryRanges.createCollection('configured');
  collection.replace([{id:'x',type:'test',range:f.range(),states:{'caret-inside':{underline:{opacity:.25}}},events:{'caret-enter':['temporary-only']}}]);await tick();
  f.editor.annotationEvents.setCaret(f.key,1);expect(entered).toHaveBeenCalledTimes(1);expect(f.entered).toHaveLength(0);expect(f.paths()[0].getAttribute('opacity')).toBe('0.25');
});

it('does not revalidate or reevaluate unchanged paint parameters when typing rebases a range',async()=>{
  const f=setup(),validate=vi.fn(),paint=vi.fn();
  f.editor.visualEffects.registerRenderer({name:'paint-probe',target:'range-overlay',defaults:{color:'red'},validate,layoutParams:[],laneHeight:()=>0,
    View:props=><path stroke={(()=>{paint();return String(props.params().color);})()}/>,
  });
  f.editor.visualEffects.registerType({type:'paint-probe',renderers:[{id:'paint',name:'paint-probe'}]});
  f.replace([{id:'paint',type:'paint-probe',start:1,end:3}]);await tick();validate.mockClear();paint.mockClear();
  f.editor.commands.replaceInlineRange(f.key,0,0,'!');
  expect(validate).not.toHaveBeenCalled();expect(paint).not.toHaveBeenCalled();
});
