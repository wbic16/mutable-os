// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerApplicationViews} from './features';
import {ReactiveTreeView} from '../rendering/reactive-tree-view';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from './document-application-ports';
import {admitNative,captureNative,nativeBytes,nativeText} from '../persistence/native-resource';
import {nativeDocumentSession} from '../persistence/native-session';
import {QUILL_APP,QUILL_TYPE} from '../features/quill/model';
import {fixture} from '../qualification/quill/model';
import {convertQuill,invokeQuill} from './quill-operations';
import {appForAnchor} from '../persistence/managed-desktop';
import {desktopApplications} from './desktop-applications';
beforeEach(()=>{vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({font:'',measureText:(s:string)=>({width:s.length*10})} as any);});
const cleanups:Array<()=>void>=[];
afterEach(()=>{cleanups.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function setup(enabled=true,saved?:any){
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'isolated test'}),{status:503})));
 const editor=new ReactiveEditor(materializeLocalWorkspace(saved??{type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[fixture()]}]}),{features:{quill:enabled,nativeKnowledge:false,sqliteKnowledge:false,flintLogo:false}});
 registerApplicationViews(editor);const projection=editor.createView('workspace');cleanups.push(()=>editor.dispose());
 const host=document.body.appendChild(document.createElement('main'));cleanups.push(render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host));
 const launch=(id:string,args?:unknown)=>editor.commandRegistry.execute(id,{targetKey:projection.state.rootKey,args});
 const port=(id:string)=>documentApplicationPorts(editor).ports().find(p=>p.applicationId===id)!;
 const source=()=>[...editor.projections.values()].filter(p=>p!==projection).flatMap(p=>Object.values(p.state.nodes)).find(n=>n.payload.id==='quill-source')!;
 const button=(label:string)=>[...host.querySelectorAll<HTMLButtonElement>('.quill-application button')].find(b=>b.textContent===label)!;
 return {editor,projection,host,launch,port,source,button};
}
it('registers independent applications and opens existing mixed Ink in real tabs',async()=>{
 const f=setup();await f.launch('flint.open');await f.launch('quill.open',{documentId:'quill-document'});await tick();
 expect(f.host.querySelector('.flint-application')).not.toBeNull();expect(f.host.querySelector('.quill-application')).not.toBeNull();
 expect(f.editor.commandRegistry.owner('flint.open')).toBe('flint');expect(f.editor.commandRegistry.owner('quill.open')).toBe('quill');
 expect(f.port('flint').application.properties()?.id).toBe('quill-document');expect(f.port('quill').application.properties()?.id).toBe('quill-document');
 expect(f.host.querySelector('.quill-application')?.textContent).toContain('An ordinary native paragraph');
 expect(Object.values(f.editor.repository.state.contents).filter(c=>c.payload.id==='quill-source')).toHaveLength(1);
});
it('opens context without mutating source, confirms once, returns and reopens the same composition',async()=>{
 const f=setup();await f.launch('flint.open');await tick();const source=f.source();
 f.editor.focus.request(source.key);f.editor.mounts.get(source.key)?.restoreInlineSelection?.({anchor:4,head:4});f.editor.selections.setPrimary(source.key,source.contentKey,source.viewId,4,4);
 const before=nativeText(captureNative(f.editor.repository.readState(),'quill-document')),snapshot=vi.spyOn(f.editor.repository,'snapshot');
 await f.editor.commandRegistry.execute('quill.edit',{targetKey:source.key,args:undefined});await tick();
 expect(nativeText(captureNative(f.editor.repository.readState(),'quill-document'))).toBe(before);expect(snapshot).not.toHaveBeenCalled();
 expect(f.button('Convert paragraph')).toBeTruthy();f.button('Convert paragraph').click();await tick();
 expect(Object.values(f.editor.repository.state.contents).filter(c=>c.viewType===QUILL_TYPE)).toHaveLength(1);
 f.button('Return to editor').click();await tick();expect(f.editor.focus.state.focusedKey).toBe(source.key);
 expect(f.editor.mounts.get(source.key)?.captureInlineSelection?.()).toEqual({anchor:4,head:4});
 await f.editor.commandRegistry.execute('quill.edit',{targetKey:source.key,args:undefined});await tick();
 expect(f.host.querySelectorAll('.quill-confirm')).toHaveLength(0);
 f.editor.repository.undo();expect(Object.values(f.editor.repository.state.contents).filter(c=>c.viewType===QUILL_TYPE)).toHaveLength(1); // undo latest window opening only
});
it('creates an ordinary unsaved Document with native children and delegates manual Save only',async()=>{
 const f=setup();await f.launch('quill.open');await tick();
 const native=nativeDocumentSession(f.editor),save=vi.spyOn(native,'save');
 f.button('New Document').click();await tick();
 const app=f.port('quill').application,id=app.properties()!.id;
 expect(id).not.toBe('quill-document');expect(app.properties()?.unsaved).toBe(true);expect(save).not.toHaveBeenCalled();
 expect(f.host.querySelector('.quill-application [contenteditable=true]')).not.toBeNull();
 const appSave=vi.spyOn(app.files!,'save').mockResolvedValue();
 const editable=f.host.querySelector<HTMLElement>('.quill-application [contenteditable=true]')!;
 editable.dispatchEvent(new KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true}));await tick();expect(appSave).toHaveBeenCalledOnce();
});
it('disabled Quill preserves native contents and uses a readable child fallback',async()=>{
 const f=setup();const source=Object.values(f.projection.state.nodes).find(n=>n.payload.id==='quill-source')!;convertQuill(f.editor,invokeQuill(f.editor,source.key));
 const saved=nativeBytes(captureNative(f.editor.repository.readState(),'quill-document')),disabled=setup(false,{type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[]}]});
 const bank=Object.values(disabled.projection.state.nodes).find(n=>n.viewType==='workspace-object-bank-block')!;admitNative(disabled.editor.repository,saved,bank.contentKey);await disabled.launch('flint.open');await tick();
 expect(disabled.editor.commandRegistry.owner('quill.open')).toBeUndefined();expect(disabled.editor.registry.resolve(QUILL_TYPE)).toBeUndefined();
 expect(disabled.host.querySelector(`[data-block-type="${QUILL_TYPE}"]`)?.textContent).toContain('The raven crosses');
 expect(nativeText(captureNative(disabled.editor.repository.readState(),'quill-document'))).toBe(nativeText(captureNative(f.editor.repository.readState(),'quill-document')));
});
it('retains the Acetate placeholder identity separately from Quill',()=>{
 expect(appForAnchor({type:'window-block',children:[{type:QUILL_APP}]})).toBe('quill');
 expect(appForAnchor({type:'window-block',children:[{type:'desktop-application-placeholder-block',metadata:{application:'acetate'}}]})).toBe('viewer');
 expect(desktopApplications.find(a=>a.id==='acetate')).toEqual({id:'acetate',name:'Acetate'});
 expect(desktopApplications.find(a=>a.id==='quill')).toMatchObject({name:'Quill',command:'quill.open'});
});

it('uses the same contextual command from a generic native Document window',async()=>{
 const f=setup();f.editor.commands.insert({type:'document-window-block',metadata:{title:'Native editor'},children:[{id:'generic-document',type:'document-block',children:[{id:'generic-text',type:'standoff-editor-block',text:'Generic native editor text.'}]}]},{kind:'at',parentKey:f.projection.state.rootKey,index:0});await tick();
 const source=Object.values(f.projection.state.nodes).find(n=>n.payload.id==='generic-text')!,before=nativeText(captureNative(f.editor.repository.readState(),'generic-document'));
 f.editor.focus.request(source.key);await f.editor.commandRegistry.execute('quill.edit',{targetKey:source.key,args:undefined});await tick();
 expect(nativeText(captureNative(f.editor.repository.readState(),'generic-document'))).toBe(before);
 f.button('Convert paragraph').click();await tick();
 f.editor.installGateway(document);const quillSource=[...f.editor.projections.values()].flatMap(v=>Object.values(v.state.nodes)).find(n=>n.payload.id==='generic-text'&&f.editor.mounts.get(n.key)?.root.closest('.quill-application'))!,mount=f.editor.mounts.get(quillSource.key)!;
 expect(mount.root.querySelector('.quill-canvas')).not.toBeNull();mount.focus();mount.restoreInlineSelection!({anchor:0,head:0});mount.focusElement.dispatchEvent(new InputEvent('beforeinput',{data:'SVG ',inputType:'insertText',bubbles:true,cancelable:true}));
 f.button('Return to editor').click();await tick();expect(f.editor.mounts.get(source.key)?.captureText?.()).toBe('SVG Generic native editor text.');
 expect(f.editor.focus.state.focusedKey).toBe(source.key);expect(f.host.querySelector('[role=alert]')).toBeNull();
});

it('publishes a newly created Document to both application libraries',async()=>{
 const f=setup();await f.launch('flint.open');await f.launch('quill.open');await tick();
 const id=f.port('quill').application.createDocument!('Shared library entry');await tick();
 expect(f.port('quill').application.documents().some(d=>d.id===id)).toBe(true);
 expect(f.port('flint').application.documents().some(d=>d.id===id)).toBe(true);
});

it('copies and pastes a composition through the standard mounted clipboard event path',async()=>{
 const f=setup();await f.launch('quill.open');await tick();f.editor.installGateway(document);
 const source=f.source(),wrapper=convertQuill(f.editor,invokeQuill(f.editor,source.key));await tick();
 const view=f.editor.projections.get(source.viewId)!,composition=view.nodeForPlacement(wrapper)!;
 const values:Record<string,string>={};
 const dispatch=(type:string,target:Element)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{types:Object.keys(values),files:[],items:[],getData:(key:string)=>values[key]??'',setData:(key:string,value:string)=>values[key]=value}});target.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);};
 f.editor.blockSelection.replaceKeys([composition.key]);dispatch('copy',f.editor.mounts.get(composition.key)!.root.querySelector(':scope > [data-block-selection-handle]')!);
 expect(Object.keys(values).some(k=>k.includes('mutable'))).toBe(true);
 const id=f.port('quill').application.createDocument!('Clipboard destination');await tick();
 const destination=[...f.editor.projections.values()].flatMap(v=>Object.values(v.state.nodes)).find(n=>n.viewType==='standoff-editor-block' && f.editor.mounts.get(n.key) && f.editor.blockQueries.ancestors(n.key).some(a=>a.payload.id===id))!;
 f.editor.blockSelection.replaceKeys([destination.key]);dispatch('paste',f.editor.mounts.get(destination.key)!.root.querySelector(':scope > [data-block-selection-handle]')!);
 await vi.waitFor(()=>expect(Object.values(f.editor.repository.state.contents).filter(c=>c.viewType===QUILL_TYPE)).toHaveLength(2));
 const targetDocument=f.editor.repository.findDocumentResource(id)!;
 expect(targetDocument.children.some(k=>f.editor.repository.state.contents[f.editor.repository.state.placements[k].contentKey].viewType===QUILL_TYPE)).toBe(true);
});

it('hands off Textual invocation to the desktop and returns to the same native source',async()=>{
 vi.stubGlobal('ResizeObserver',class {observe(){}unobserve(){}disconnect(){}});
 const rect=HTMLElement.prototype.getBoundingClientRect;
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.classList.contains('textual-workspace') ? new DOMRect(0,0,1440,900) : this.classList.contains('tw-font-probe') ? new DOMRect(0,0,2560,20) : rect.call(this);});
 const {WorkspaceSession}=await import('./workspace-session');
 const {WorkspacePresentationView}=await import('./workspace-presentation-view');
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[fixture()]}]}),{features:{nativeKnowledge:false,sqliteKnowledge:false,nativeDocumentPersistence:false,flintLogo:false,desktopApplicationIcons:false}});
 const editor=session.editor;cleanups.push(()=>session.dispose());const host=document.body.appendChild(document.createElement('main'));cleanups.push(render(()=><WorkspacePresentationView session={session}/>,host));
 await editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});await tick();
 expect(session.selectPresentation('textual')).toBe(true);await vi.waitFor(()=>expect(document.querySelector('.tw-flint .reactive-standoff-flow'),document.querySelector('.textual-workspace')?.textContent?.slice(-1200)).not.toBeNull());
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='flint')!,source=Object.values(port.session()!.projection.state.nodes).find(n=>n.payload.id==='quill-source')!;
 editor.focus.request(source.key);const before=nativeText(captureNative(editor.repository.readState(),'quill-document')),snapshot=vi.spyOn(editor.repository,'snapshot');
 await editor.commandRegistry.execute('quill.edit',{targetKey:source.key,args:undefined});await tick();
 expect(session.presentation.active()).toBe('desktop');expect(host.querySelector('.quill-confirm')).not.toBeNull();
 [...host.querySelectorAll<HTMLButtonElement>('.quill-application button')].find(b=>b.textContent==='Cancel and return')!.click();await tick();
 expect(session.presentation.active()).toBe('textual');
 await vi.waitFor(()=>{expect(host.querySelector('.quill-application [role=alert]')?.textContent ?? '').toBe('');expect(editor.node(editor.focus.state.focusedKey!)?.payload.id).toBe('quill-source');expect(editor.focus.state.focusedKey).toBe(source.key);});
 expect(nativeText(captureNative(editor.repository.readState(),'quill-document'))).toBe(before);expect(snapshot).not.toHaveBeenCalled();
 expect(host.querySelector('.quill-application [role=alert]')).toBeNull();
});

it('persists studio appearance independently of documents and cached artwork geometry',async()=>{
 const f=setup();await f.launch('flint.open');await tick();const source=f.source();convertQuill(f.editor,invokeQuill(f.editor,source.key));await f.launch('quill.open',{documentId:'quill-document'});await tick();
 const app=f.host.querySelector<HTMLElement>('.quill-application')!,select=app.querySelector<HTMLSelectElement>('[aria-label="Quill appearance"]')!,surface=app.querySelector('.quill-text-surface') as HTMLElement&{quillDiagnostics():unknown},before=surface.quillDiagnostics(),revision=f.editor.repository.state.revision,snapshot=vi.spyOn(f.editor.repository,'snapshot');
 expect(app.dataset.quillTheme).toBe('midnight');for(const theme of ['parchment','mutable','midnight']){select.value=theme;select.dispatchEvent(new Event('change',{bubbles:true}));expect(app.dataset.quillTheme).toBe(theme);}
 expect(surface.quillDiagnostics()).toEqual(before);expect(f.editor.repository.state.revision).toBe(revision);expect(snapshot).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem('mutable.quill.preferences.v1')!).appearance).toBe('midnight');
 expect(app.querySelector('[aria-label="Quill tools"]')).not.toBeNull();expect(app.querySelector('[data-quill-inspector]')).not.toBeNull();
});
