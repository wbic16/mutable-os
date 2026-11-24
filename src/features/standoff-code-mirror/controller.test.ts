// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {encodeDocument} from '../../block-tree/codecs';
import {StandoffCodeMirror} from './controller';
import {annotationField} from './projection';
import {liveDocumentEntities} from '../../application/live-document-entities';
import {watchDocumentEntities} from '../../application/document-entity-changes';
// jsdom has no layout; browser qualification supplies the real geometry checks.
Object.defineProperty(Range.prototype,'getClientRects',{configurable:true,value:()=>[]});
Object.defineProperty(Range.prototype,'getBoundingClientRect',{configurable:true,value:()=>new DOMRect()});
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();});
function fixture(count=0,text='A😀bc',properties:any[]=[{id:'entity',type:'codex/entity-reference',start:1,end:2,value:'ada',metadata:{entityName:'Ada'},future:7}]){
  const editor=new ReactiveEditor({type:'document-block',id:'doc',children:[{id:'code',type:'standoff-code-mirror-block',text,standoffProperties:properties},...Array.from({length:count},(_,i)=>({id:'other'+i,type:'plain-text-block',text:'unrelated'}))]});cleanup.push(()=>editor.dispose());
  const projection=editor.createView('cm-test'),key=projection.state.nodes[projection.state.rootKey].children[0];
  const root=document.body.appendChild(document.createElement('div')),notice=vi.fn(),code=new StandoffCodeMirror(editor,key,root,notice);cleanup.push(()=>code.dispose());
  return {editor,projection,key,code,notice};
}
it('commits coherent UTF16 edits, publishes other occurrences, and restores history',async()=>{
  const f=fixture(),other=f.editor.createView('other'),key=other.state.nodes[other.state.rootKey].children[0],root=document.body.appendChild(document.createElement('div'));
  const second=new StandoffCodeMirror(f.editor,key,root,vi.fn());cleanup.push(()=>second.dispose());
  const seen:any[]=[];f.editor.repository.subscribeChanges(()=>seen.push(f.code.record().payload));
  f.code.view.dispatch({changes:{from:0,insert:'x'}});await Promise.resolve();
  expect(f.notice).not.toHaveBeenCalled();expect(seen).toHaveLength(1);expect(seen[0]).toMatchObject({text:'xA😀bc',standoffProperties:[{start:2,end:3,future:7}]});expect(second.view.state.doc.toString()).toBe('xA😀bc');
  f.editor.repository.undo();await Promise.resolve();expect(f.code.view.state.doc.toString()).toBe('A😀bc');expect(f.code.record().payload.standoffProperties).toMatchObject([{id:'entity',start:1,end:2}]);
  f.editor.repository.redo();await Promise.resolve();expect(second.view.state.doc.toString()).toBe('xA😀bc');
});
it('consumes annotations completely and restores IDs/unknown fields through undo',async()=>{
  const f=fixture();f.code.view.dispatch({changes:{from:1,to:4,insert:'ZZ'}});expect(f.code.record().payload.standoffProperties).toEqual([]);
  f.editor.repository.undo();await Promise.resolve();expect(f.code.record().payload.standoffProperties).toMatchObject([{id:'entity',future:7}]);
});
it('creates, edits, soft deletes, undoes annotations and preserves native JSON',async()=>{
  const f=fixture();f.code.view.dispatch({selection:{anchor:1,head:3}});const p=f.code.annotate(f.code.target(),'unknown',42,{label:'unicode'});expect(p).toMatchObject({start:1,end:1});
  f.code.edit(f.code.target(),1,{isDeleted:true});f.editor.repository.undo();await Promise.resolve();
  const wire=encodeDocument(f.editor.repository.readState());expect(wire.children?.[0].standoffProperties).toMatchObject([{id:'entity'},{id:p.id,value:42,metadata:{label:'unicode'}}]);expect(f.code.record().inlineContent).toEqual([]);
});
it('preserves imports until explicit atomic normalization, undo restores exact bytes',async()=>{
  const f=fixture(0,'A\r\n😀\rZ',[{id:'p',type:'note',start:3,end:3}]);expect(f.code.view.state.doc.toString()).toBe('A\n😀\nZ');f.code.view.dispatch({changes:{from:0,insert:'x'}});expect(f.code.record().payload.text).toBe('A\r\n😀\rZ');
  f.code.normalize();expect(f.code.record().payload).toMatchObject({text:'A\n😀\nZ',standoffProperties:[{start:2,end:2}]});f.editor.repository.undo();await Promise.resolve();expect(f.code.record().payload.text).toBe('A\r\n😀\rZ');
});
it('uses local selection/visibility state without projections, commits, or flattening',()=>{
  const f=fixture(),before=f.code.metrics.projections,revision=f.editor.repository.state.revision,flatten=vi.spyOn(f.code.view.state.doc,'toString');
  f.code.view.dispatch({selection:{anchor:1}});f.code.toggleAnnotations();expect(f.code.metrics.projections).toBe(before);expect(flatten).not.toHaveBeenCalled();expect(f.editor.repository.state.revision).toBe(revision);expect(f.code.view.state.field(annotationField).visible).toBe(false);
});
it.each([0,250])('bounds typing with %i unrelated blocks and live semantic observers',async count=>{
  const f=fixture(count),inventory=liveDocumentEntities(f.editor,f.editor.node(f.projection.state.rootKey)!.contentKey),notify=vi.fn();cleanup.push(inventory.dispose);inventory.subscribe(notify);
  const watcher=watchDocumentEntities(f.editor,f.key,notify);cleanup.push(watcher.dispose);
  expect(inventory.read().rows).toMatchObject([{id:'ada',forms:['😀b']}]);const initial=inventory.read();
  const snapshot=vi.spyOn(f.editor.repository,'snapshot');let reads=0;
  for(const c of Object.values(f.editor.repository.readState().contents))if(String(c.payload.id).startsWith('other')){const payload=c.payload;Object.defineProperty(c,'payload',{configurable:true,get(){reads++;return payload;}});}
  const network=vi.fn();vi.stubGlobal('fetch',network);
  f.code.view.dispatch({changes:{from:0,insert:'x'}});await Promise.resolve();
  expect(f.notice).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(reads).toBe(0);expect(network).not.toHaveBeenCalled();expect(inventory.read()).toBe(initial);expect(notify).not.toHaveBeenCalled();vi.unstubAllGlobals();
  f.code.view.dispatch({changes:{from:2,to:5,insert:''}});await Promise.resolve();expect(inventory.read().rows).toEqual([]);
});
it('revalidates permissions and stale asynchronous targets',()=>{
  const f=fixture(),target=f.code.target();f.code.view.dispatch({changes:{from:0,insert:'x'}});expect(()=>f.code.annotate(target,'note')).toThrow(/changed/);
  const release=f.editor.textProtection.protect(f.code.record().key);cleanup.push(release);f.code.input.syncPermissions();const text=f.code.view.state.doc.toString();f.code.view.dispatch({changes:{from:0,insert:'x'}});expect(f.code.view.state.doc.toString()).toBe(text);expect(()=>f.code.annotate(f.code.target(),'note')).toThrow();
});
it('creates shared Document Gloss definitions through the existing service',async()=>{
  const f=fixture();f.code.view.dispatch({selection:{anchor:1,head:3}});const c=f.code.record();const id=f.editor.gloss.nativeCode(f.key,c.revision,1,2,'note: emoji');await Promise.resolve();
  const p=(f.code.record().payload.standoffProperties as any[]).at(-1);expect(p).toMatchObject({type:'mutable/gloss',annotationId:id,start:1,end:1});expect(f.code.resolve(p)).toMatchObject({value:'note: emoji',metadata:{gloss:{version:1}}});f.editor.repository.undo();await Promise.resolve();expect((f.code.record().payload.standoffProperties as any[])).toHaveLength(1);
});
it('batches provisional composition, rejects stale composition and restores canonical source',async()=>{
 const f=fixture(),before=f.editor.repository.state.revision;
 f.code.view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
 f.code.view.dispatch({changes:{from:0,insert:'仮'}});f.code.view.dispatch({changes:{from:0,to:1,insert:'確定'}});
 expect(f.code.record().payload.text).toBe('A😀bc');expect(f.editor.repository.state.revision).toBe(before);
 f.code.view.contentDOM.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));await new Promise(r=>setTimeout(r,10));
 expect(f.code.record().payload.text).toBe('確定A😀bc');expect(f.editor.repository.state.revision).toBe(before+1);
 f.code.view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));f.code.view.dispatch({changes:{from:0,insert:'仮'}});
 f.editor.repository.undo();await Promise.resolve();expect(f.code.view.state.doc.toString()).toBe('A😀bc');
 f.code.view.contentDOM.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));await new Promise(r=>setTimeout(r,10));expect(f.code.record().payload.text).toBe('A😀bc');
});
it('rejects surrogate-splitting native transactions before canonical mutation',()=>{
 const f=fixture(),before=f.editor.repository.state.revision;f.code.view.dispatch({changes:{from:2,insert:'x'}});expect(f.editor.repository.state.revision).toBe(before);expect(f.code.view.state.doc.toString()).toBe('A😀bc');expect(f.notice).toHaveBeenCalledWith(expect.stringContaining('UTF-16'));
});
it('direct SDK destruction invalidates ownership and cancels subscriptions',async()=>{
 const f=fixture();f.code.view.destroy();expect(f.editor.mounts.get(f.key)).toBeUndefined();f.editor.commands.setPayloadField(f.key,'text','external');await Promise.resolve();expect(f.code.view.state.doc.toString()).toBe('A😀bc');
});
it('retains idless and duplicate-ID instance identities through range consumption',()=>{
 const f=fixture(0,'abcdef',[{type:'unknown',start:0,end:1},{id:'duplicate',type:'note',start:2,end:3},{id:'duplicate',type:'note',start:4,end:5}]);
 const ids=()=>{const r:string[]=[];f.code.view.state.field(annotationField).projection.index.between(0,f.code.view.state.doc.length,(_a,_b,p)=>{r.push(p.identity);});return r;};const before=ids();f.code.view.dispatch({changes:{from:0,to:2,insert:''}});expect(ids()).toEqual(before.slice(1));
});
it('passive occurrences cannot edit source or author annotations',()=>{
 const f=fixture();f.editor.passiveViews.add(f.projection.viewId);f.code.input.syncPermissions();expect(f.code.view.state.readOnly).toBe(true);const before=f.code.record().payload.text;f.code.view.dispatch({changes:{from:0,insert:'x'}});expect(f.code.record().payload.text).toBe(before);expect(()=>f.code.annotate(f.code.target(),'note')).toThrow();
});
it('restores native selection with local canonical undo/redo and maps external caret movement',async()=>{
 const f=fixture();f.code.view.dispatch({selection:{anchor:3}});f.code.view.dispatch({changes:{from:3,insert:'!'},selection:{anchor:4}});
 f.editor.repository.undo();await Promise.resolve();expect(f.code.view.state.selection.main.head).toBe(3);f.editor.repository.redo();await Promise.resolve();expect(f.code.view.state.selection.main.head).toBe(4);
 f.code.view.dispatch({selection:{anchor:1}});f.editor.commands.setPayloadField(f.key,'text',f.code.record().payload.text+'tail');await Promise.resolve();expect(f.code.view.state.selection.main.head).toBe(1);
});

it('point Entity mentions have empty source text rather than borrowing the next character',()=>{
 const f=fixture(0,'abc',[{id:'point',type:'codex/entity-reference',value:'ada',isZeroWidth:true,start:1,end:1,affinity:'after'}]);const inventory=liveDocumentEntities(f.editor,f.editor.node(f.projection.state.rootKey)!.contentKey);cleanup.push(inventory.dispose);expect(inventory.read().rows).toMatchObject([{id:'ada',forms:['']}]);
});
