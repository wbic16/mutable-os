// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerCoreViews} from './register-core-views';
import {ReactiveTreeView} from './reactive-tree-view';
import {decodeBlockTree} from '../block-tree/codecs';
import {admitNative,captureNative,nativeText,decodeNative} from '../persistence/native-resource';
const clean:(()=>void)[]=[];afterEach(()=>{while(clean.length)clean.pop()!();document.body.replaceChildren();vi.restoreAllMocks();});
function fixture(features = {}, extraParagraphs = 0, firstText = 'A😀éBCD'){
 const editor=new ReactiveEditor({type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block'}]},{features:{autocompleteWorkstation:false,...features}});registerCoreViews(editor);
 const source=decodeBlockTree({id:'doc',type:'document-block',children:[{id:'a',type:'standoff-editor-block',text:'A😀éBCD',standoffProperties:[{type:'style/bold',start:1,end:4}]},{id:'b',type:'standoff-editor-block',text:'Other'},...Array.from({length:extraParagraphs},(_,i)=>({id:'other-'+i,type:'standoff-editor-block',text:'Plain'}))]}).state;
 const bank=Object.values(editor.repository.readState().contents).find(c=>c.payload.id==='bank')!;const file=JSON.parse(nativeText(captureNative(source,'doc')));
 file.document.blocks.find((b:{id:string})=>b.id==='a').inline=[{kind:'text',text:firstText}];
 admitNative(editor.repository,new TextEncoder().encode(JSON.stringify(file)),bank.key);
 const doc=Object.values(editor.repository.readState().contents).find(c=>c.payload.id==='doc')!,pk=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===doc.key)!.key;
 const projection=editor.createView('first',pk);expect(Object.values(projection.state.nodes).some(n=>n.viewType==='text-cell')).toBe(false);
 const unmounts=new WeakMap<HTMLElement,()=>void>();
 const mount=(p=projection)=>{
   const host=document.body.appendChild(document.createElement('div'));
   const dispose=render(()=><ReactiveTreeView editor={editor} projection={p}/>,host);
   unmounts.set(host,dispose); clean.push(()=>unmounts.get(host)?.()); return host;
 };
 const unmount=(host:HTMLElement)=>{unmounts.get(host)?.();unmounts.delete(host);host.remove();};
 clean.push(()=>editor.dispose());const host=mount();clean.push(editor.installGateway(document));
 const node=()=>Object.values(projection.state.nodes).find(n=>n.payload.id==='a')!;
 return {editor,projection,host,node,mount,unmount,pk,flow:()=>host.querySelector<HTMLElement>('.reactive-standoff-flow')!};
}
it('real renderer uses occurrence-local Cells, broadcasts edits, preserves unaffected identity and native reopen',()=>{
 const f=fixture(),{editor,projection}=f;const second=editor.createView('second',f.pk),other=f.mount(second);const before=f.flow().firstChild,otherBefore=other.querySelector('.reactive-standoff-flow')!.firstChild;
 const unrelated=f.host.querySelectorAll('.reactive-standoff-flow')[1];const observer=new MutationObserver(()=>{});observer.observe(unrelated,{subtree:true,childList:true,attributes:true,characterData:true});
 const snapshot=vi.spyOn(editor.repository,'snapshot').mockImplementation(()=>{throw Error('global snapshot');});
 editor.commands.replaceInlineRange(f.node().key,1,2,'XY');expect(f.flow().textContent).toBe('AXYéBCD');expect(other.querySelector('.reactive-standoff-flow')!.textContent).toBe('AXYéBCD');expect(f.flow().firstChild).toBe(before);expect(other.querySelector('.reactive-standoff-flow')!.firstChild).toBe(otherBefore);
 editor.repository.undo();expect(f.flow().textContent).toBe('A😀éBCD');editor.repository.redo();expect(f.flow().textContent).toBe('AXYéBCD');expect(snapshot).not.toHaveBeenCalled();expect(observer.takeRecords()).toHaveLength(0);observer.disconnect();snapshot.mockRestore();
 expect(Object.values(editor.repository.readState().contents).filter(c=>c.viewType.endsWith('-cell'))).toHaveLength(0);
 const saved=nativeText(captureNative(editor.repository.readState(),'doc'));expect(nativeText(decodeNative(new TextEncoder().encode(saved)))).toBe(saved);
 expect(new Set(f.node().inlineContent).size).toBe(8);expect(projection.state.nodes[f.node().inlineContent[0]].editingInlineOwner).toBe(f.node().key);
});
it('retains mounted compact editing atoms when an authored metadata change rebuilds the projection',()=>{
 const f=fixture(),before=[...f.node().inlineContent],first=f.flow().firstChild;
 expect(()=>f.editor.commands.setPayloadField(f.projection.state.rootKey,'metadata',{reviewed:true})).not.toThrow();
 expect(f.node().inlineContent).toEqual(before);expect(f.flow().firstChild).toBe(first);expect(f.flow().textContent).toBe('A😀éBCD');
 f.editor.repository.undo();expect(f.node().inlineContent).toEqual(before);expect(f.flow().textContent).toBe('A😀éBCD');
 expect(Object.values(f.editor.repository.readState().contents).some(c=>c.viewType==='text-cell')).toBe(false);
});
it('compact Enter split, join and cross-block replacement preserve text and history',()=>{
 const f=fixture(),{editor}=f;const snapshot=vi.spyOn(editor.repository,'snapshot').mockImplementation(()=>{throw Error('structural snapshot');});const right=editor.commands.splitStandoff(f.node().key,4);
 expect([...f.host.querySelectorAll('.reactive-standoff-flow')].map(e=>e.textContent)).toEqual(['A😀é','BCD','Other']);
 editor.commands.joinStandoff(f.node().key,right);expect(f.flow().textContent).toBe('A😀éBCD');editor.repository.undo();expect(f.host.querySelectorAll('.reactive-standoff-flow')).toHaveLength(3);editor.repository.redo();
 const b=Object.values(f.projection.state.nodes).find(n=>n.payload.id==='b')!;
 editor.commands.replaceAcrossBlocks([{placementKey:f.node().key,start:2,end:7},{placementKey:b.key,start:0,end:2}],'Z');expect(f.flow().textContent).toBe('A😀Zher');editor.repository.undo();expect(f.flow().textContent).toBe('A😀éBCD');
 expect(Object.values(editor.repository.readState().contents).some(c=>c.viewType==='text-cell')).toBe(false);expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
});

it('typed images survive edits and mixed-object composition through the production gateway',()=>{
 const f=fixture(),{editor}=f;editor.commands.insertInlineImage(f.node().key,2,{assetId:'image',src:'',alt:'picture',status:'failed'});
 expect(f.flow().querySelector('img')).not.toBeNull();const imageKey=f.node().inlineContent[2];editor.commands.updateInlineImage(imageKey,{alt:'updated'});expect(f.flow().querySelector('img')!.alt).toBe('updated');
 const mount=editor.mounts.get(f.node().key)!;mount.focus();mount.restoreInlineSelection!({anchor:3,head:3});
 f.flow().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
 const loose=document.createTextNode('漢');f.flow().insertBefore(loose,f.flow().children[3]);
 f.flow().dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'漢'}));
 expect(f.flow().textContent).toBe('A😀漢éBCD');expect(f.flow().querySelectorAll('img')).toHaveLength(1);expect(editor.repository.readState().contents[f.node().contentKey].compactInline!.spans.filter(a=>a.kind==='image')).toHaveLength(1);
 editor.repository.undo();expect(f.flow().textContent).toBe('A😀éBCD');editor.repository.redo();expect(f.flow().textContent).toBe('A😀漢éBCD');
 const saved=nativeText(captureNative(editor.repository.readState(),'doc'));expect(nativeText(decodeNative(new TextEncoder().encode(saved)))).toBe(saved);
});
it('Undo/Redo restores backward selections, affinities and the original occurrence',async()=>{
 const f=fixture(),{editor}=f,m=editor.mounts.get(f.node().key)!;m.focus();editor.selections.setPrimary(f.node().key,f.node().contentKey,f.node().viewId,4,1);
 const set=JSON.parse(JSON.stringify(editor.selections.sets[f.node().key]));set.items[0].anchor.boundary.affinity='before';editor.selections.setSelectionSet(f.node().key,set);m.restoreInlineSelection!({anchor:4,head:1});
 f.flow().dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'X'}));await Promise.resolve();await Promise.resolve();await Promise.resolve();
 expect(f.flow().textContent).toBe('AXBCD');editor.repository.undo();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(f.flow().textContent).toBe('A😀éBCD');expect(m.captureInlineSelection!()).toEqual({anchor:4,head:1});expect(editor.selections.sets[f.node().key].items[0].anchor.boundary.affinity).toBe('before');
 editor.repository.redo();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(m.captureInlineSelection!()).toEqual({anchor:2,head:2});
});
it('Backspace deletes a whole grapheme and composition over an image is rejected without DOM or canonical loss',()=>{
 const f=fixture(),{editor}=f,m=editor.mounts.get(f.node().key)!;m.focus();m.restoreInlineSelection!({anchor:4,head:4});f.flow().dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));expect(f.flow().textContent).toBe('A😀BCD');editor.repository.undo();
 editor.commands.insertInlineImage(f.node().key,1,{assetId:'image',src:'',alt:'picture',status:'failed'});m.restoreInlineSelection!({anchor:1,head:2});const before=nativeText(captureNative(editor.repository.readState(),'doc')),image=f.flow().children[1];
 f.flow().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));image.remove();f.flow().dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'draft'}));
 expect(f.flow().children[1]).toBe(image);expect(nativeText(captureNative(editor.repository.readState(),'doc'))).toBe(before);
});

it.each([true, false])('retains safe cut rejection with interoperability disabled (Mutable clipboard=%s)', async mutableClipboard => {
 const f=fixture({mutableClipboard,inlineAlternativeInteroperability:false}),e=f.editor;
 e.commands.insertInlineAlternative(f.node().key,1,[{type:'standoff-editor-block',text:'first'},{type:'standoff-editor-block',text:''}]);
 const mount=e.mounts.get(f.node().key)!;mount.focus();mount.restoreInlineSelection!({anchor:1,head:2});e.selections.setPrimary(f.node().key,f.node().contentKey,f.node().viewId,1,2);
 const before=nativeText(captureNative(e.repository.readState(),'doc')),changed=vi.fn();e.repository.subscribeChanges(changed);
 const event=new Event('cut',{bubbles:true,cancelable:true}),data=new Map<string,string>();
 Object.defineProperty(event,'clipboardData',{value:{types:[],getData:()=>'',setData:(type:string,value:string)=>data.set(type,value)}});f.flow().dispatchEvent(event);
 await new Promise(r=>setTimeout(r,0));expect(event.defaultPrevented).toBe(true);expect(data.size).toBe(0);expect(changed).not.toHaveBeenCalled();expect(nativeText(captureNative(e.repository.readState(),'doc'))).toBe(before);
});

it.each(['copy','cut','failed-cut','malformed'])('native slot clipboard through the input gateway: %s',async action=>{
 const f=fixture({managedAssetClipboard:false}),e=f.editor;
 e.commands.insertInlineAlternative(f.node().key,1,[{type:'standoff-editor-block',text:'first'},{type:'standoff-editor-block',text:''}]);
 const mount=e.mounts.get(f.node().key)!;mount.focus();mount.restoreInlineSelection!({anchor:1,head:2});e.selections.setPrimary(f.node().key,f.node().contentKey,f.node().viewId,1,2);
 const before=nativeText(captureNative(e.repository.readState(),'doc')),snapshot=vi.spyOn(e.repository,'snapshot'),changed=vi.fn();e.repository.subscribeChanges(changed);
 const dispatch=(type:string,data:Record<string,string>,fail=false)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{types:Object.keys(data),getData:(t:string)=>data[t]??'',setData:(t:string,v:string)=>{if(fail)throw Error('denied');data[t]=v;}}});mount.focusElement.dispatchEvent(event);return event;};
 const data:Record<string,string>={};dispatch(action==='copy'||action==='malformed'?'copy':'cut',data,action==='failed-cut');
 await Promise.resolve();
 if(action==='failed-cut'){expect(e.clipboard.message()).toContain('denied');expect(changed).not.toHaveBeenCalled();expect(nativeText(captureNative(e.repository.readState(),'doc'))).toBe(before);return;}
 expect(data['text/plain']).toBe('first');expect(data['application/x-mutable-fragment+json']).toContain('alternative');
 if(action==='cut'){expect(changed).toHaveBeenCalledTimes(1);e.repository.undo();expect(nativeText(captureNative(e.repository.readState(),'doc'))).toBe(before);}
 if(action==='malformed'){data['application/x-mutable-fragment+json']='{"kind":"alternative","version":999}';dispatch('paste',data);expect(e.clipboard.message()).toContain('No lossy fallback');expect(nativeText(captureNative(e.repository.readState(),'doc'))).toBe(before);return;}
 mount.focus();mount.restoreInlineSelection!({anchor:0,head:0});e.selections.setPrimary(f.node().key,f.node().contentKey,f.node().viewId,0,0);dispatch('paste',data);
 await vi.waitFor(()=>expect((e.repository.readState().contents[f.node().contentKey].compactInline!.spans.filter(a=>a.kind==='alternative'))).toHaveLength(2));
 expect(snapshot).not.toHaveBeenCalled();const after=nativeText(captureNative(e.repository.readState(),'doc'));e.repository.undo();expect(nativeText(captureNative(e.repository.readState(),'doc'))).toBe(before);e.repository.redo();expect(nativeText(captureNative(e.repository.readState(),'doc'))).toBe(after);
 expect(Object.values(e.repository.readState().contents).some(c=>c.viewType==='text-cell')).toBe(false);
});

it('limits slot paste/history to affected occurrences and updates native dirty membership without recapture',async()=>{
 const f=fixture(),e=f.editor; e.commands.insertInlineAlternative(f.node().key,1,[{type:'standoff-editor-block',text:'first'},{type:'standoff-editor-block',text:''}]);
 const second=e.createView('slot-second',f.pk),other=f.mount(second),unrelated=Object.values(f.projection.state.nodes).find(n=>n.payload.id==='b')!;
 const observer=new MutationObserver(()=>{});observer.observe(e.mounts.get(unrelated.key)!.root,{subtree:true,childList:true,attributes:true,characterData:true});
 const {nativeDocumentSession}=await import('../persistence/native-session'),{serializeSelection}=await import('../interchange/serializer'),{materializeFragment}=await import('../interchange/materialize');
 const native=nativeDocumentSession(e),binding=(native as any).bind('doc',{folder:'qualification',filename:'test.mutable.json'},{nativeHash:'baseline',markdownHash:null,generation:null},Object.keys(captureNative(e.repository.readState(),'doc').contents));binding.pair.acknowledgeOpen(nativeText(captureNative(e.repository.readState(),'doc')));binding.pair.adapter.save=async(g:any)=>({phase:'saved',generation:g.generation});
 const builds=[vi.spyOn(f.projection as any,'build'),vi.spyOn(second as any,'build')],snapshot=vi.spyOn(e.repository,'snapshot'),before=nativeText(captureNative(e.repository.readState(),'doc'));
 const fragment=serializeSelection(e.repository.readState(),[{placementKey:f.node().placementKey,start:1,end:2}]);e.commands.insertMutableText([{segments:[{placementKey:f.node().placementKey,start:0,end:0}],fragment:materializeFragment(fragment),slices:fragment.roots}]);
 expect(f.host.querySelectorAll('.native-inline-alternative')).toHaveLength(2);expect(other.querySelectorAll('.native-inline-alternative')).toHaveLength(2);expect(native.isDirty('doc')).toBe(true);
 e.repository.undo();expect(nativeText(captureNative(e.repository.readState(),'doc'))).toBe(before);e.repository.redo();builds.forEach(spy=>expect(spy).not.toHaveBeenCalled());expect(snapshot).not.toHaveBeenCalled();expect(observer.takeRecords()).toHaveLength(0);observer.disconnect();snapshot.mockRestore();
 await native.save('doc');expect(native.isDirty('doc')).toBe(false);
 const host=e.repository.readState().contents[f.node().contentKey],slot=host.compactInline!.spans.find(a=>a.kind==='alternative')!;if(slot.kind!=='alternative')throw Error('slot');e.commands.replaceInlineRange(host.ownedRelations[slot.properties.readings[0]],0,0,'new');expect(native.isDirty('doc')).toBe(true);
});

it('keeps both rendered occurrences styled through resident splices, annotation authoring and Undo', () => {
  const f = fixture(), {editor} = f;
  const other = f.mount(editor.createView('shared', f.pk));
  const owner = f.node();
  const expectBold = (expected: string) => {
    for (const host of [f.host, other]) {
      const flow = host.querySelector<HTMLElement>('.reactive-standoff-flow')!;
      const styled = [...flow.children].filter(el => (el as HTMLElement).style.fontWeight === "600");
      expect(styled.map(el => el.textContent).join("")).toBe(expected);
    }
  };
  expectBold("😀éB");
  editor.commands.replaceInlineRange(owner.key, 0, 0, "ab");
  expectBold("😀éB");
  editor.commands.replaceInlineRange(owner.key, 4, 5, "🍎🍎");
  expectBold("😀🍎🍎́B");
  editor.commands.setPayloadField(owner.key, "standoffProperties", [{type: "style/bold", start: 0, end: 1}]);
  expectBold("ab");
  editor.commands.replaceInlineRange(owner.key, 0, 1, "X");
  expectBold("b");
  editor.repository.undo();
  expectBold("ab");
  editor.repository.undo();
  expectBold("😀🍎🍎́B");
});

it("crosses a graph edit and resident typing in both history directions, saves resident bounds, and reopens cold",async()=>{
  const {editor,projection,node,host}=fixture();
  const repo=editor.repository,a=node(),b=Object.values(projection.state.nodes).find(n=>n.payload.id==="b")!;
  const save=()=>nativeText(captureNative(repo.readState(),"doc"));
  const paths:boolean[]=[];
  repo.subscribeChanges(c=>paths.push(!!c.residentPayload));
  editor.commands.setPayloadField(a.key,"standoffProperties",[
    {id:"repeat",start:0,end:2,type:"style/bold",extension:{future:["🌿",17]}},
    {id:"repeat",start:1,end:2,type:"style/italics"},{isZeroWidth:true,start:1,end:0,affinity:"before"},
    {id:"mention",type:"codex/entity-reference",value:"Rabbit",start:1,end:2}]);
  const {watchDocumentEntities}=await import("../application/document-entity-changes");
  const refresh=vi.fn(), watch=watchDocumentEntities(editor,a.key,refresh);
  clean.push(watch.dispose);
  const states=[save()];
  editor.commands.replaceInlineRange(a.key,0,0,"x");states.push(save());
  await Promise.resolve();expect(refresh).not.toHaveBeenCalled();
  editor.commands.replaceAcrossBlocks([{placementKey:a.key,start:6,end:8},{placementKey:b.key,start:0,end:1}],"Q");
  await Promise.resolve();refresh.mockClear(); // Cross-block removal changes document membership.
  states.push(save());editor.commands.replaceInlineRange(a.key,2,2,"🌿");states.push(save());
  await Promise.resolve();expect(refresh).not.toHaveBeenCalled();
  expect(paths.slice(-3)).toEqual([true,false,true]);
  const {canonicalSearchSource}=await import("../runtime/canonical-search-source");
  const record=repo.readState().contents[a.contentKey];
  const search=await canonicalSearchSource(repo.readState(),a.contentKey,record.inlineRevision);
  expect(search.runs[0].text).toBe(host.querySelector(".reactive-standoff-flow")!.textContent);
  const {clipCompactProperties,contentLength}=await import("../block-tree/inline-sequence");
  const clipped=clipCompactProperties(record.payload.standoffProperties,0,4,contentLength(record));
  expect(clipped[0]).toMatchObject({id:"repeat",extension:{future:["🌿",17]}});
  expect(repo.residentAnnotations(a.contentKey)).toBeDefined();
  const {observeLive}=await import("../knowledge/live-observer");
  const {DEFAULT_POLICY}=await import("../knowledge/policy");
  const {facts}=await observeLive(repo,"doc",DEFAULT_POLICY);
  expect(facts.annotations.find(p=>p.type==="codex/entity-reference")).toMatchObject({start:3,end:5,value:"Rabbit"});
  const {annotationCapabilities}=await import("../application/annotation-capabilities");
  const navigation=annotationCapabilities(editor,{owner:"qualification",active:()=>true,
    own(dispose){clean.push(dispose);return dispose;},defer(fn){queueMicrotask(fn);}});
  const occurrence=navigation.documentAnnotations(a.key).texts.find(t=>t.key===a.key)!;
  const mention=occurrence.properties.find(p=>p.id==="mention")!;
  const range=editor.textRanges.snapshot(a.key,Number(mention.start),Number(mention.end)+1);
  navigation.focusRange!(range,repo.state.revision);
  expect(editor.mounts.get(a.key)!.captureInlineSelection!()).toEqual({anchor:3,head:5});
  const {packageFragment}=await import("../interchange/package/native");
  const exportBlocks=(e:ReactiveEditor)=>packageFragment(captureNative(e.repository.readState(),"doc")).blocks
    .filter(b=>b.inline).map(b=>({atoms:b.inline!.atoms,properties:b.inline!.properties.map(({localId,...p})=>p)}));
  const exported=exportBlocks(editor);
  expect(JSON.stringify(exported)).toContain("Rabbit");
  for(let i=2;i>=0;i--){repo.undo();expect(save()).toBe(states[i]);}
  for(let i=1;i<=3;i++){repo.redo();expect(save()).toBe(states[i]);}
  const fresh=new ReactiveEditor({type:"workspace-block",children:[{id:"bank",type:"workspace-object-bank-block"}]});
  try {
    const bank=Object.values(fresh.repository.readState().contents).find(c=>c.payload.id==="bank")!;
    admitNative(fresh.repository,new TextEncoder().encode(states[3]),bank.key);
    const reopened=Object.values(fresh.repository.readState().contents).find(c=>c.payload.id==="a")!;
    expect((await observeLive(fresh.repository,"doc",DEFAULT_POLICY)).facts).toEqual(facts);
    expect(exportBlocks(fresh)).toEqual(exported);
    expect(fresh.repository.residentAnnotations(reopened.key)).toBeUndefined();
    expect(nativeText(captureNative(fresh.repository.readState(),"doc"))).toBe(states[3]);
  }finally{fresh.dispose();}
});

it("cancels stale IME and pending clipboard input after another occurrence commits",async()=>{
  const f=fixture(),{editor}=f, key=f.node().key;
  const m=editor.mounts.get(key)!;
  editor.commands.replaceInlineRange(key,0,0,"X");
  const other=editor.createView("concurrent",f.pk);f.mount(other);
  const twin=Object.values(other.state.nodes).find(n=>n.contentKey===f.node().contentKey)!;
  m.focus();m.restoreInlineSelection!({anchor:1,head:2});
  f.flow().dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));
  editor.commands.replaceInlineRange(twin.key,0,0,"Y");
  const original=nativeText(captureNative(editor.repository.readState(),"doc"));
  let revision=editor.repository.state.revision;
  f.flow().dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:"discard"}));
  expect(editor.repository.state.revision).toBe(revision);
  expect(nativeText(captureNative(editor.repository.readState(),"doc"))).toBe(original);
  let finish!:(items:unknown[])=>void;
  const old=Object.getOwnPropertyDescriptor(navigator,"clipboard");
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{read:()=>new Promise(r=>{finish=r;})}});
  try{
    m.focus();editor.selections.setPrimary(key,f.node().contentKey,f.node().viewId,0,1);
    m.restoreInlineSelection!({anchor:0,head:1});
    editor.clipboard.pasteMarkdown(key);
    await vi.waitFor(()=>expect(finish).toBeTypeOf("function"));
    editor.commands.replaceInlineRange(twin.key,0,0,"Z");
    revision=editor.repository.state.revision;
    finish([{types:["text/plain"],getType:async()=>({size:9,text:async()=>"**stale**"})}]);
    await new Promise(r=>setTimeout(r,30));
    expect(editor.repository.state.revision).toBe(revision);
    editor.repository.undo();
    expect(nativeText(captureNative(editor.repository.readState(),"doc"))).toBe(original);
  }finally{if(old)Object.defineProperty(navigator,"clipboard",old);else Reflect.deleteProperty(navigator,"clipboard");}
});

it("shares the annotation-surface origin per layout pass and preserves unchanged SVG paths",async()=>{
  const f=fixture({standoffPropertyRendering:false}), {editor}=f, key=f.node().key;
  const surface=f.flow().closest<HTMLElement>(".reactive-standoff-surface")!;
  const box=vi.spyOn(surface,"getBoundingClientRect");
  const original=Object.getOwnPropertyDescriptor(Range.prototype,"getClientRects");
  const rects=vi.fn(function(this:Range){return [{left:0,top:0,width:this.toString().length*10,height:12}];});
  Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:rects});
  try{
    const frame=()=>new Promise(r=>setTimeout(r,50));
    editor.commands.setPayloadField(key,"standoffProperties",[
      {id:"before",type:"style/rectangle",start:0,end:0},
      {id:"containing",type:"style/rectangle",start:1,end:5},
      {id:"coincident",type:"style/rectangle",start:1,end:5}]);
    await frame();
    const query=()=>[...surface.querySelectorAll('path[data-property-type="style/rectangle"]')];
    const initial=query();expect(initial.length).toBe(3);
    const path=initial[1].getAttribute("d");
    box.mockClear();rects.mockClear();
    editor.commands.replaceInlineRange(key,3,3,"abc");await frame();
    const next=query();
    expect(next[0]).toBe(initial[0]);
    expect(next[1].getAttribute("d")).not.toBe(path);
    expect(rects.mock.calls.length).toBeGreaterThan(0);
    // Three annotations require two distinct ranges and one common origin per frame.
    expect(rects.mock.calls.length).toBe(2*box.mock.calls.length);
  }finally{if(original)Object.defineProperty(Range.prototype,"getClientRects",original);else Reflect.deleteProperty(Range.prototype,"getClientRects");}
});

it("resolves a Gloss selection after resident range movement and native capture",()=>{
  const f=fixture(), {editor}=f, key=f.node().key;
  editor.commands.replaceInlineRange(key,0,0,"X");
  editor.gloss.open(key,{anchor:1,head:3});
  editor.gloss.commit("note: character boundaries");
  editor.commands.replaceInlineRange(key,0,0,"Z");
  const current=editor.repository.readState().contents[f.node().contentKey];
  const gloss=(current.payload.standoffProperties as any[]).find(p=>p.type==="mutable/gloss");
  expect(gloss).toMatchObject({start:2,end:3});
  expect(editor.repository.residentAnnotations(current.key)).toBeDefined();
  const bytes=nativeText(captureNative(editor.repository.readState(),"doc"));
  expect(bytes).toContain("note: character boundaries");
  expect(bytes).toContain(gloss.annotationId);
});

it("updates only tracked mention wording while the live entity inventory is open",async()=>{
  const f=fixture(), {editor}=f, a=f.node();
  const {liveDocumentEntities}=await import("../application/live-document-entities");
  const {observeCellWork}=await import("../block-tree/cell-diagnostics");
  const props=Array.from({length:400},(_,i)=>({type:"unknown",id:String(i),start:0,end:3}));
  editor.commands.setPayloadField(a.key,"standoffProperties",[
    ...props,{id:"m",type:"codex/entity-reference",value:"e",start:1,end:3}]);
  const inv=liveDocumentEntities(editor,editor.node(f.projection.state.rootKey)!.contentKey);
  clean.push(inv.dispose);
  const notify=vi.fn();inv.subscribe(notify);
  const old=inv.read();
  const d=observeCellWork(), lookup=vi.spyOn(editor.repository,"residentRangeTextNearSplice");
  try{
    editor.commands.replaceInlineRange(a.key,6,6,"xyz");await Promise.resolve();
    expect(inv.read()).toBe(old);
    expect(notify).not.toHaveBeenCalled();
    editor.commands.replaceInlineRange(a.key,2,2,"🍏");await Promise.resolve();
    expect(inv.read().rows[0].forms).toEqual(["😀🍏é"]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(d.counts.entityInventoryReads).toBe(0);expect(d.counts.mentionSurfaceChecks).toBe(2);
    expect(d.counts.numericExports).toBe(0);
    editor.commands.replaceInlineRange(a.key,1,2,"");await Promise.resolve();
    expect(inv.read().rows[0].forms).toEqual(["🍏é"]);
    editor.repository.undo();await Promise.resolve();
    expect(inv.read().rows[0].forms).toEqual(["😀🍏é"]);
  }finally{d.stop();}
});

it("qualifies virtual text rows without enumerating numeric ranges or reevaluating sibling payloads on typing",async()=>{
  const f=fixture({},70), {editor}=f;
  const {unwrap}=await import("solid-js/store");
  const {observeCellWork}=await import("../block-tree/cell-diagnostics");
  const a=f.node(), siblings=Object.values(f.projection.state.nodes).filter(n=>String(n.payload.id).startsWith("other-"));
  expect(siblings.length).toBe(70);
  let reads=0;
  for(const sibling of siblings)Object.defineProperty(unwrap(sibling.payload),"checked",{
    configurable:true,get(){reads++;return undefined;}});
  const lease=editor.repository.acquireResidentCells(a.contentKey), d=observeCellWork();
  try{
    editor.commands.replaceInlineRange(a.key,2,2,"X");
    editor.commands.replaceInlineRange(a.key,2,2,"Y");
    expect(d.counts.splices).toBe(2);
    expect(d.counts.numericExports).toBe(0);
    expect(reads).toBe(0);
  }finally{d.stop();lease();}
});

it('inserts into 25,000 mounted characters with bounded DOM and presentation work',async()=>{
  const {observeCellWork}=await import('../block-tree/cell-diagnostics');
  const {addressesFor,characterIndex}=await import('./character-address');
  const f=fixture({},0,'x'.repeat(24999)+'א'), e=f.editor, key=f.node().key, flow=f.flow();
  const addresses=addressesFor(flow)!;
  const tail=addresses.elementAt(24999)!;
  expect(e.repository.residentAnnotations(f.node().contentKey)).toBeUndefined();
  e.commands.replaceInlineRange(key,1,1,'😀');
  expect(addresses.elementAt(25000)).toBe(tail);
  expect(addresses.utf16Offset(tail)).toBe(25001);
  const originals=Array.from(flow.querySelectorAll(':scope > [data-inline-key]'));
  const observer=new MutationObserver(()=>{});
  observer.observe(flow,{subtree:true,attributes:true,childList:true});
  const work=observeCellWork();
  try {
    e.commands.replaceInlineRange(key,3,3,'漢');
    expect(work.counts).toMatchObject({allocations:1,retargets:0,numericExports:0,characterDescriptors:1,characterUpdates:1,characterPasses:1});
    expect(work.counts.addressMembers).toBeLessThan(260);
  } finally {work.stop();}
  const records=observer.takeRecords();observer.disconnect();
  expect(records.filter(r=>r.attributeName==='data-inline-index')).toHaveLength(0);
  expect(records.flatMap(r=>Array.from(r.removedNodes))).toHaveLength(0);
  expect(records.flatMap(r=>Array.from(r.addedNodes))).toHaveLength(1);
  expect(originals.every((el,i)=>addresses.elementAt(i+(i>=3?1:0))===el)).toBe(true);
  expect(characterIndex(tail)).toBe(25001);
  e.commands.replaceInlineRange(key,2,198,'ב');
  expect(characterIndex(originals[100])).toBeUndefined();
  expect(addresses.elementAt(addresses.length-1)).toBe(tail);
  expect(addresses.utf16Offset(tail)).toBe(addresses.length);
},60000);

it.each([true,false])('addresses backward selections and astral, combining and RTL text with direct rendering %s', async directDomCharacterCells=>{
  const {characterIndex}=await import('./character-address');
  const f=fixture({directDomCharacterCells},0,'א😀éب'), e=f.editor, key=f.node().key;
  const handle=e.mounts.get(key)!, flow=f.flow();
  const emoji=flow.children[1], combining=flow.children[3];
  handle.focus();
  handle.restoreInlineSelection!({anchor:4,head:1});
  expect(handle.captureInlineSelection!()).toEqual({anchor:4,head:1});
  expect(handle.inlinePoint!(emoji.firstChild!,2)).toBe(2);
  e.commands.replaceInlineRange(key,0,0,'語');
  expect(characterIndex(emoji)).toBe(2);
  expect(characterIndex(combining)).toBe(4);
  expect(flow.querySelector('[data-inline-index]')).toBeNull();
  e.commands.insertInlineImage(key,2,{assetId:'image',alt:'image',src:'',status:'failed'});
  expect(characterIndex(emoji)).toBe(3);
  expect(handle.inlinePoint!(flow.children[2],1)).toBe(3);
  e.repository.undo();
  expect(characterIndex(emoji)).toBe(2);
  e.repository.redo();
  expect(characterIndex(emoji)).toBe(3);
});

it('looks up a shared resident identity across occurrences and releases the old address on unmount',async()=>{
  const {addressesFor}=await import('./character-address');
  const f=fixture(),e=f.editor,second=e.createView('address-peer',f.pk);
  const peerHost=f.mount(second);
  const peer=peerHost.querySelector<HTMLElement>('.reactive-standoff-flow')!;
  const a=addressesFor(f.flow())!, b=addressesFor(peer)!;
  const left=a.elementAt(1)!, right=b.elementAt(1)!;
  expect(a.residentCharacter(left)).toBeUndefined();
  expect(left).not.toBe(right);
  e.commands.replaceInlineRange(f.node().key,0,0,'!');
  const cell=a.residentCharacter(left);
  expect(cell).toMatchObject({index:2,value:'😀',utf16:2});
  expect(b.residentCharacter(right)).toBe(cell);
  e.repository.undo();
  expect(a.residentCharacter(left)).toBeUndefined();
  e.commands.replaceInlineRange(f.node().key,0,0,'字');
  expect(a.residentCharacter(left)).not.toBe(cell);
  f.unmount(peerHost);
  expect(addressesFor(peer)).toBeUndefined();
  expect(b.residentCharacter(right)).toBeUndefined();
  const rehydrated=a.residentCharacter(left);
  expect(rehydrated).toMatchObject({index:2});
  const contentKey=f.node().contentKey;
  f.unmount(f.host);
  expect(e.repository.residentCharacterAt(contentKey,2)).toBeUndefined();
  const reopened=f.mount().querySelector<HTMLElement>('.reactive-standoff-flow')!;
  const current=addressesFor(reopened)!, survivor=current.elementAt(2)!;
  expect(current.residentCharacter(survivor)).toBeUndefined();
  e.commands.replaceInlineRange(f.node().key,0,0,'x');
  expect(current.residentCharacter(survivor)).toMatchObject({value:'😀',index:3});
  expect(current.residentCharacter(survivor)).not.toBe(rehydrated);
});

it('deletes full graphemes using bounded character address lookups',async()=>{
  const {observeCellWork}=await import('../block-tree/cell-diagnostics');
  const f=fixture({},0,'A🇦🇺é👨‍👩‍👧‍👦ב'), e=f.editor, key=f.node().key, flow=f.flow();
  const mount=e.mounts.get(key)!;
  mount.focus();
  const command=(at:number,type:string)=>{
    mount.restoreInlineSelection!({anchor:at,head:at});
    flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:type}));
  };
  command(3,'deleteContentBackward');
  expect(flow.textContent).toBe('Aé👨‍👩‍👧‍👦ב');
  const reads=vi.spyOn(e,'node'),work=observeCellWork();
  try {
    command(3,'deleteContentForward');
    expect(flow.textContent).toBe('Aéב');
    expect(reads.mock.calls.filter(([k])=>f.node().inlineContent.includes(k))).toHaveLength(0);
    expect(work.counts.characterDescriptors).toBeLessThan(5);
  } finally {work.stop();}
  command(3,'deleteContentBackward');
  expect(flow.textContent).toBe('Aב');
});

it('preserves native affinity at an equivalent bidi boundary',()=>{
  const f=fixture({},0,'Aא😀B'), native=document.getSelection()!, mount=f.editor.mounts.get(f.node().key)!;
  mount.focus();
  const prior=f.flow().children[0].firstChild!;
  native.setBaseAndExtent(prior,1,prior,1);
  const writes=vi.spyOn(native,'setBaseAndExtent');
  mount.restoreInlineSelection!({anchor:1,head:1});
  expect(writes).not.toHaveBeenCalled();
  expect(native.anchorNode).toBe(prior);
  expect(native.anchorOffset).toBe(1);
});

it('resolves a pointer over a shifted span with one geometry read',()=>{
  const f=fixture(),flow=f.flow(),handle=f.editor.mounts.get(f.node().key)!;
  const target=flow.children[3];
  f.editor.commands.replaceInlineRange(f.node().key,0,0,'xy');
  const previous=Object.getOwnPropertyDescriptor(document,'elementFromPoint');
  Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>target});
  const reads=vi.spyOn(Element.prototype,'getClientRects').mockImplementation(function(this:Element) {
    expect(this).toBe(target);
    return [{left:100,right:110,top:10,bottom:20}] as unknown as DOMRectList;
  });
  try {
    expect(handle.inlinePointAt!(107,15)).toBe(6);
    expect(reads).toHaveBeenCalledTimes(1);
  } finally {
    if(previous)Object.defineProperty(document,'elementFromPoint',previous);
    else Reflect.deleteProperty(document,'elementFromPoint');
    reads.mockRestore();
  }
});
