// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {NativePropositionEditor,type DraftPort} from './view';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {watchDraftDirty} from './view';
import {registerCoreViews} from '../../rendering/register-core-views';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {createThesisFeature,captureThesisDraft} from '../../application/thesis';
const disposers:(()=>void)[]=[];
afterEach(()=>{while(disposers.length)disposers.pop()!();document.body.replaceChildren();vi.restoreAllMocks();});
it('native draft keeps multiline replacements, Unicode annotations and undo; no requests while typing',async()=>{
 const requests=vi.spyOn(globalThis,'fetch'),dirty=vi.fn();let port:DraftPort|undefined;
 const root=document.body.appendChild(document.createElement('div'));
 disposers.push(render(()=><NativePropositionEditor draft={{text:'A😀z',properties:[{id:crypto.randomUUID(),type:'style/bold',start:1,end:1}],warnings:[]}} vault="." changed={dirty} ready={p=>port=p} notice={()=>{}}/>,root));
 await Promise.resolve();const flow=root.querySelector<HTMLElement>('[contenteditable=true]')!;expect(flow).toBeTruthy();
 const cell=flow.querySelectorAll('[data-inline-key]')[1],range=document.createRange();range.setStart(cell.firstChild!,0);range.collapse(true);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range);flow.focus();
 flow.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await Promise.resolve();
 expect(port!.read().text).toBe('A\n😀z');expect(port!.read().annotations[0]).toMatchObject({start:2,end:4});expect(dirty).toHaveBeenCalledTimes(1);expect(requests).not.toHaveBeenCalled();
 [...root.querySelectorAll('button')].find(b=>b.textContent==='Undo')!.click();expect(port!.read().text).toBe('A😀z');expect(port!.read().annotations[0]).toMatchObject({start:1,end:3});
});
it('dirty tracking performs no snapshots or property reads beyond the native edit',()=>{
 const editor=new ReactiveEditor({type:'standoff-editor-block',text:'abc'});disposers.push(()=>editor.dispose());const view=editor.createView();
 const snapshot=vi.spyOn(editor.repository,'snapshot'),read=vi.spyOn(editor.repository,'readState');const changed=vi.fn();disposers.push(watchDraftDirty(editor,changed));
 // Delivery itself is constant work, independent of document size and payload shape.
 const publication=vi.spyOn(editor.repository,'subscribeChanges');const stop=watchDraftDirty(editor,changed);const callback=publication.mock.calls[0][0];snapshot.mockClear();read.mockClear();
 callback({} as any);expect(changed).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();stop();
 editor.commands.replaceInlineRange(view.state.rootKey,1,1,'q');expect(changed).toHaveBeenCalledTimes(2);
});
it('selection capture uses exact native ranges and creates no draft text at a caret',()=>{
 const resource=crypto.randomUUID(),editor=new ReactiveEditor({id:crypto.randomUUID(),type:'workspace-block',children:[{id:resource,type:'document-block',metadata:{documentId:resource},children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text:'before 😀 after',standoffProperties:[]}]}]});
 disposers.push(()=>editor.dispose());registerCoreViews(editor);const view=editor.createView(),root=document.body.appendChild(document.createElement('div'));disposers.push(render(()=><ReactiveTreeView editor={editor} projection={view}/>,root));
 const node=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block')!,handle=editor.mounts.get(node.key)!;editor.linkedAnnotations.createForSegments([{nodeKey:node.key,start:7,end:8}],'codex/entity-reference',crypto.randomUUID());handle.focus();handle.restoreInlineSelection!({anchor:7,head:8});const draft=captureThesisDraft(editor,node.key);expect(draft.text).toBe('😀');expect(draft.properties[0]).toMatchObject({type:'codex/entity-reference',start:0,end:0,thesisOrigin:{materialized:true}});expect(draft.properties[0].annotationId).toBeUndefined();handle.restoreInlineSelection!({anchor:7,head:7});expect(captureThesisDraft(editor,node.key).text).toBe('');
});
it('bindings expose both platform accelerators and the host-independent chord; flag registration is disposable',()=>{
 const editor=new ReactiveEditor({type:'workspace-block'});disposers.push(()=>editor.dispose());editor.featureHost.activate(createThesisFeature(editor));
 const triggers=editor.bindings.effective('thesis.createProposition');expect(triggers).toEqual(expect.arrayContaining([expect.objectContaining({kind:'keyboard',key:'p',modifiers:['Meta','Shift']}),expect.objectContaining({kind:'keyboard',key:'p',modifiers:['Ctrl','Shift']}),expect.objectContaining({kind:'chord'})]));
 expect(editor.bindings.conflicts('thesis.createProposition',triggers)).toEqual([]);
});
it('both platform accelerators and fallback dispatch through the gateway, while IME and modal input are excluded',()=>{
 const editor=new ReactiveEditor({type:'workspace-block',children:[{type:'standoff-editor-block',text:'abc'}]});disposers.push(()=>editor.dispose());registerCoreViews(editor);editor.featureHost.activate(createThesisFeature(editor));const view=editor.createView(),root=document.body.appendChild(document.createElement('div'));disposers.push(render(()=><ReactiveTreeView editor={editor} projection={view}/>,root));disposers.push(editor.installGateway(document));
 const flow=root.querySelector<HTMLElement>('[contenteditable=true]')!,execute=vi.spyOn(editor.commandRegistry,'execute').mockImplementation(()=>{});
 for(const modifier of [{ctrlKey:true},{metaKey:true}]){const event=new KeyboardEvent('keydown',{key:'P',shiftKey:true,...modifier,bubbles:true,cancelable:true});flow.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);}expect(execute).toHaveBeenCalledTimes(2);
 for(const modifier of [{ctrlKey:true},{metaKey:true}]){const old=new KeyboardEvent('keydown',{key:'T',shiftKey:true,...modifier,bubbles:true,cancelable:true});flow.dispatchEvent(old);expect(old.defaultPrevented).toBe(false);}expect(execute).toHaveBeenCalledTimes(2);
 const input=root.appendChild(document.createElement('input')),outside=new KeyboardEvent('keydown',{key:'P',metaKey:true,shiftKey:true,bubbles:true,cancelable:true});input.dispatchEvent(outside);expect(outside.defaultPrevented).toBe(false);expect(execute).toHaveBeenCalledTimes(2);
 flow.dispatchEvent(new KeyboardEvent('keydown',{key:';',ctrlKey:true,bubbles:true,cancelable:true}));flow.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true,cancelable:true}));expect(execute).toHaveBeenCalledTimes(3);
 const ime=new KeyboardEvent('keydown',{key:'P',ctrlKey:true,shiftKey:true,isComposing:true,bubbles:true,cancelable:true});flow.dispatchEvent(ime);expect(ime.defaultPrevented).toBe(false);
 root.setAttribute('role','dialog');const modal=new KeyboardEvent('keydown',{key:'P',metaKey:true,shiftKey:true,bubbles:true,cancelable:true});flow.dispatchEvent(modal);expect(modal.defaultPrevented).toBe(false);expect(execute).toHaveBeenCalledTimes(3);
});
it('standalone annotation tools use a direct Block scope and ignore automatic range rebasing for Entity inventory',async()=>{
 const {annotationCapabilities}=await import('../../application/annotation-capabilities');const editor=new ReactiveEditor({type:'standoff-editor-block',text:'abc'});disposers.push(()=>editor.dispose());const view=editor.createView(),key=view.state.rootKey;
 const owned:(()=>void)[]=[],scope={owner:'thesis-test',active:()=>true,own:(f:()=>void)=>{owned.push(f);return f;},defer:(f:()=>void)=>f()};disposers.push(()=>owned.reverse().forEach(f=>f()));
 const api=annotationCapabilities(editor,scope,key);expect(api.scope(key,'document').rootKey).toBe(key);
 api.annotate([[editor.textRanges.snapshot(key,0,2)]],'codex/entity-reference','existing-target',{entityName:'Target'},editor.repository.state.revision,'Annotate');
 const property=(editor.node(key)!.payload.standoffProperties as any[])[0];expect(property.value).toBe('existing-target');expect(property.annotationId).toBeUndefined();expect(editor.node(key)!.payload.linkedAnnotations).toBeUndefined();
 const changed=vi.fn(),watch=api.watchDocumentEntities(key,changed),signature=watch.signature;
 editor.commands.replaceInlineRange(key,0,0,'x');await Promise.resolve();expect(changed).not.toHaveBeenCalled();expect(watch.signature).toBe(signature);
 api.annotate([[editor.textRanges.snapshot(key,2,3)]],'codex/entity-reference','another-target',{},editor.repository.state.revision,'Annotate');await Promise.resolve();expect(changed).toHaveBeenCalledTimes(1);
});
it('keeps only one draft input router attached when several Thesis editors are mounted',async()=>{
 const install=ReactiveEditor.prototype.installGateway;let active=0,peak=0;
 vi.spyOn(ReactiveEditor.prototype,'installGateway').mockImplementation(function(this:ReactiveEditor,document:Document){const release=install.call(this,document);active++;peak=Math.max(peak,active);let live=true;return()=>{if(live){live=false;active--;release();}};});
 const root=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><><NativePropositionEditor draft={{text:'first',properties:[],warnings:[]}} vault="." changed={()=>{}} ready={()=>{}} notice={()=>{}}/><NativePropositionEditor draft={{text:'second',properties:[],warnings:[]}} vault="." changed={()=>{}} ready={()=>{}} notice={()=>{}}/></>,root);disposers.push(dispose);
 await Promise.resolve();expect(active).toBe(1);expect(peak).toBe(1);
 const flows=root.querySelectorAll<HTMLElement>('[contenteditable=true]');flows[0].focus();await Promise.resolve();expect(active).toBe(1);expect(peak).toBe(1);flows[1].focus();expect(active).toBe(1);expect(peak).toBe(1);
 disposers.pop()!();expect(active).toBe(0);
});

it.each([4, 250])('opens Thesis above a maximized source window with stored z-index %s', async zIndex=>{
 vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No Vault in this window-layout fixture'));
 const editor=new ReactiveEditor({type:'workspace-block',children:[{id:'flint-window',type:'window-block',metadata:{title:'Flint',state:'maximized',zIndex},children:[{type:'standoff-editor-block',text:'Source'}]}]});
 disposers.push(()=>editor.dispose());registerCoreViews(editor);editor.featureHost.activate(createThesisFeature(editor));
 const view=editor.createView(),root=document.body.appendChild(document.createElement('div'));disposers.push(render(()=><ReactiveTreeView editor={editor} projection={view}/>,root));
 editor.commandRegistry.execute('thesis.open',{targetKey:view.state.rootKey,args:undefined});await Promise.resolve();
 const source=root.querySelector<HTMLElement>('[data-block-id="flint-window"]')!,thesis=root.querySelector<HTMLElement>('.thesis-host')!.closest<HTMLElement>('.reactive-window')!;
 expect(source.classList.contains('reactive-window--maximized')).toBe(true);
 expect(Number(thesis.style.zIndex)).toBeGreaterThan(Number(source.style.zIndex));
 // Subsequent opens must also rise above the previous Thesis window.
 editor.commandRegistry.execute('thesis.open',{targetKey:view.state.rootKey,args:undefined});await Promise.resolve();
 const windows=[...root.querySelectorAll<HTMLElement>('.thesis-host')].map(host=>host.closest<HTMLElement>('.reactive-window')!);
 expect(windows.filter(window=>Number(window.style.zIndex)>Number(thesis.style.zIndex))).toHaveLength(1);
 expect(source.classList.contains('reactive-window--maximized')).toBe(true);
});
