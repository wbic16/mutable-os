// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {captureNative,nativeBytes,decodeNative} from '../../persistence/native-resource';
import * as controllers from './controller';
import {DialecticProviderSession} from './dcp/live';
import {conversationPreferences} from './preferences';
import {conversationDocument} from './model';
import {defaultProviderSettings,type LiveProvenance} from './dcp/provider-contract';
import type {Attachment} from './attachments-contract';
const stops:Array<()=>void>=[];
afterEach(()=>{stops.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
async function setup(multi=true,titles=false,protection=true){
 const spy=vi.spyOn(controllers,'createDialecticController');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Isolated fixture'}))));
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings={...settings};this.ready=true;return true;});
 const workspace=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeTextProtection:protection,dialecticMultiSession:multi,dialecticAutomaticTitles:titles,dialecticProviderContinuity:false,dialecticAutosave:false,dcpTestPhaseLogging:false,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}}),editor=workspace.editor;
 stops.push(()=>workspace.dispose());const host=document.body.appendChild(document.createElement('div'));stops.push(render(()=><WorkspacePresentationView session={workspace}/>,host));editor.installGateway(document);
 await editor.commandRegistry.execute('dialectic.open',{targetKey:workspace.projection.state.rootKey,args:undefined});
 await Promise.resolve();await Promise.resolve();editor.setAssetContext(()=>({cavernId:'fixture',session:'fixture'}));
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!,c=spy.mock.results.find(r=>r.type==='return')!.value;
 const type=(text:string)=>{const r=c.resolve(c.target(c.draft()!.id))!;editor.commands.replaceInlineRange(r.children[0],0,0,text);};
 const next=()=>{const root=editor.repository.readState(),bank=root.contents[root.placements[root.rootPlacementKey].contentKey].children.find(k=>root.contents[root.placements[k].contentKey].viewType==='workspace-object-bank-block')!;const dto=conversationDocument();editor.commands.insert(dto,{kind:'at',parentKey:bank,index:editor.commands.childrenOf(bank).length});port.application.openDocument(String(dto.id));return String(dto.id);};
 return {workspace,editor,host,port,c,type,next};
}
function transport(){
 const jobs=new Map<string,{signal:AbortSignal;write(text:string):void;finish(text:string,files?:Attachment[]):void}>();
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){const details:LiveProvenance={version:1 as const,adapterVersion:'4c-1' as const,settings:{...this.settings},attempts:[],cost:{status:'unknown' as const}};return {details,run:async(_request,sources,chunk,signal,validate)=>{
  const text=await new Promise<string>(resolve=>{jobs.set(sources.owner,{signal,write:text=>chunk(text,'text'),finish:(text,files)=>{if(files)details.attachments=files;resolve(text);}});chunk('','start');});await validate?.(text);return text;
 },commit:async()=>{},cancel:async()=>{}};});return jobs;
}
it('streams two native Documents concurrently, completes in reverse order and retains independent Undo',async()=>{
 const f=await setup(),jobs=transport(),a=f.c.resourceId();f.type('A request');const pa=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(a)).toBe(true));const ra=f.c.conversations!.runtime(a)!;
 jobs.get(a)!.write('<response><p>A first fragment.</p>');await vi.waitFor(()=>expect(ra.rows().some(r=>r.data.state==='receiving')).toBe(true));
 const b=f.next();f.type('Undo while A receives');f.editor.repository.undo();expect(f.c.resolve(f.c.target(f.c.draft()!.id))!.children.map(k=>f.port.session()!.projection.node(k)!.inlineContent.length)).toEqual([0]);f.type('B request');const pb=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(b)).toBe(true));
 expect(jobs.get(a)!.signal.aborted).toBe(false);expect(ra.busy()).toBe(true);expect(f.c.conversations!.status(a)).toBe('Responding');
 jobs.get(b)!.finish('<response><p>B complete.</p></response>');await pb;expect(f.c.committed()).toHaveLength(2);expect(ra.busy()).toBe(true);
 jobs.get(a)!.finish('<response><p>A first fragment.</p><p>A last fragment.</p></response>');await pa;
 expect(ra.notice()).toBe('');expect(f.c.notice()).toBe('');expect(ra.committed()).toHaveLength(2);expect(f.c.conversations!.status(a)).toBe('Complete');
 const aBytes=new TextDecoder().decode(nativeBytes(captureNative(f.editor.repository.readState(),a))),bBytes=new TextDecoder().decode(nativeBytes(captureNative(f.editor.repository.readState(),b)));
 expect(aBytes).toContain('A first fragment');expect(aBytes).not.toContain('B complete');expect(bBytes).toContain('B complete');expect(bBytes).not.toContain('A last fragment');
 f.port.application.openDocument(a);expect(f.c.resourceId()).toBe(a);f.editor.repository.undo();expect(ra.committed()).toHaveLength(1);expect(f.c.conversations!.runtime(b)!.committed()).toHaveLength(2);f.editor.repository.redo();expect(ra.committed()).toHaveLength(2);
});
it('cancels only the chosen request and closing the last view requires confirmation',async()=>{
 const f=await setup(),jobs=transport(),a=f.c.resourceId();f.type('A');const pa=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(a)).toBe(true));const ra=f.c.conversations!.runtime(a)!;
 const b=f.next();f.type('B');const pb=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(b)).toBe(true));ra.cancel();await pa;expect(jobs.get(a)!.signal.aborted).toBe(true);expect(jobs.get(b)!.signal.aborted).toBe(false);
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);f.port.application.closeActiveTab();expect(confirm).toHaveBeenCalledOnce();expect(f.c.resourceId()).toBe(b);expect(jobs.get(b)!.signal.aborted).toBe(false);
 confirm.mockReturnValue(true);f.port.application.closeActiveTab();await pb;expect(jobs.get(b)!.signal.aborted).toBe(true);expect(f.c.conversations!.runtime(b)).toBeUndefined();
});
it('retains native receiving when the originating renderer is temporarily unmounted',async()=>{
 const f=await setup(),jobs=transport(),a=f.c.resourceId();f.type('Continue without DOM');const promise=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(a)).toBe(true));
 const source=f.port.session()!,runtime=f.c.conversations!.runtime(a)!;f.editor.documentSessions!.release(source);
 expect(source.current()).toBe(true);expect(source.element.isConnected).toBe(false);
 jobs.get(a)!.finish('<response><p>Received without a mounted editor.</p></response>');await promise;
 expect(runtime.notice()).toBe('');expect(runtime.committed()).toHaveLength(2);
});
it('keeps model/vocabulary overrides independent, persists them natively and rejects changes during a response',async()=>{
 const f=await setup(),jobs=transport(),a=f.c.resourceId();await f.c.configureProvider({...defaultProviderSettings,model:'model-a'});f.c.configureVocabulary({profile:'core'});
 const b=f.next();expect(f.c.providerSettings().model).not.toBe('model-a');await f.c.configureProvider({...defaultProviderSettings,model:'model-b'});
 f.port.application.openDocument(a);expect(f.c.providerSettings().model).toBe('model-a');expect(f.c.vocabularySelection().profile).toBe('core');f.type('Request');const pending=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(a)).toBe(true));
 await f.c.configureProvider({...defaultProviderSettings,model:'must-not-apply'});expect(f.c.providerSettings().model).toBe('model-a');jobs.get(a)!.finish('<response><p>Done.</p></response>');await pending;
 const native=decodeNative(nativeBytes(captureNative(f.editor.repository.readState(),a)));expect(JSON.stringify(native)).toContain('model-a');expect(JSON.stringify(native)).not.toContain('model-b');
 f.port.application.closeActiveTab();f.port.application.openDocument(a);expect(f.c.providerSettings().model).toBe('model-a');f.port.application.openDocument(b);expect(f.c.providerSettings().model).toBe('model-b');
});
it('keeps upload completion and title metadata on their source while another Document is active',async()=>{
 const f=await setup(true,true);let upload!:(a:any)=>void,title!:(text:string)=>void;
 vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockImplementation(()=>new Promise(r=>upload=r));vi.spyOn(DialecticProviderSession.prototype,'title').mockImplementation(()=>new Promise(r=>title=r));
 const a=f.c.resourceId();await f.c.configureProvider(defaultProviderSettings);f.type('Please title A');f.c.submit();await vi.waitFor(()=>expect(title).toBeTypeOf('function'));
 const r=f.c.conversations!.runtime(a)!,pending=f.c.files.attach([new File(['data'],'source.txt')]);await vi.waitFor(()=>expect(upload).toBeTypeOf('function'));const b=f.next();expect(f.c.files.pending()).toBe('');
 upload({version:1,id:crypto.randomUUID(),asset:{kind:'managed',cavernId:'fixture',assetId:'sha256:'+'a'.repeat(64)},name:'source.txt',mediaType:'text/plain',byteLength:4,origin:'user',createdUtc:'2026-11-15T00:00:00Z'});title('A title');await pending;
 await vi.waitFor(()=>expect((r.root()!.payload.metadata as any).title).toBe('A title'));expect(r.files.list(r.resolve(r.target(r.draft()!.id)))).toHaveLength(1);expect(f.c.files.list(f.c.resolve(f.c.target(f.c.draft()!.id)))).toHaveLength(0);expect(f.c.resourceId()).toBe(b);
});
it('does bounded typing with twelve open conversations and preserves the sequential fallback',async()=>{
 const f=await setup();for(let i=0;i<11;i++)f.next();const snapshots=vi.spyOn(f.editor.repository,'snapshot'),values=Object.values;let scans=0;
 vi.spyOn(Object,'values').mockImplementation((value:any)=>{if(value===f.editor.repository.state.contents||value===f.editor.repository.state.placements)scans++;return values(value);});const fetcher=vi.mocked(fetch);fetcher.mockClear();const rows=f.port.documentTabs!().map(t=>f.c.conversations!.runtime(t.documentId!)?.diagnostics.rowBuilds);
 for(let i=0;i<20;i++)f.type('x');expect(snapshots).not.toHaveBeenCalled();expect(scans).toBe(0);expect(fetcher).not.toHaveBeenCalled();expect(f.port.documentTabs!().map(t=>f.c.conversations!.runtime(t.documentId!)?.diagnostics.rowBuilds)).toEqual(rows);
});
it('flag-off restores switch cancellation without altering authored content',async()=>{
 const f=await setup(false),jobs=transport(),a=f.c.resourceId();f.type('Sequential request');const pending=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(a)).toBe(true));f.next();await pending;expect(jobs.get(a)!.signal.aborted).toBe(true);expect(f.c.conversations).toBeUndefined();
});
it('migrates absent/invalid preferences by inheritance and ignores unknown versions without persisting secrets',()=>{
 expect(conversationPreferences(undefined)).toEqual({version:1});expect(conversationPreferences({version:9,provider:defaultProviderSettings})).toEqual({version:1});expect(conversationPreferences({version:1,provider:{bad:true}})).toEqual({version:1});expect(conversationPreferences({version:1,provider:{...defaultProviderSettings,key:'secret'}})).toEqual({version:1,provider:defaultProviderSettings});
});
it('closing one of two owning views keeps the request, closing the last cancels it',async()=>{
 const f=await setup(),jobs=transport(),id=f.c.resourceId();f.type('Shared native Document');const pending=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(id)).toBe(true));
 const original=f.port.activeTab()!,tab=f.editor.node(original)!,row=f.workspace.projection.parentOf(tab.key)!;
 const duplicate=f.editor.commands.insert({id:crypto.randomUUID(),type:'tab-block',metadata:{name:'Another view',documentTarget:{version:1,documentId:id}},children:[]},{kind:'at',parentKey:row.key,index:row.children.length});
 f.port.selectTab(duplicate);const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);f.port.closeTab!(original);expect(confirm).not.toHaveBeenCalled();expect(jobs.get(id)!.signal.aborted).toBe(false);
 jobs.get(id)!.finish('<response><p>Retained through another view.</p></response>');await pending;expect(f.c.notice()).toBe('');expect(f.c.committed()).toHaveLength(2);
});
it('deleting the source invalidates pending native admission',async()=>{
 const f=await setup(true,false,false),jobs=transport(),id=f.c.resourceId();f.type('Remove source');const pending=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(id)).toBe(true));const r=f.c.conversations!.runtime(id)!;
 f.editor.commands.remove(r.root()!.key);await pending;expect(jobs.get(id)!.signal.aborted).toBe(true);jobs.get(id)!.finish('<response><p>Must not appear elsewhere.</p></response>');expect(f.c.conversations!.runtime(id)).toBeUndefined();
});
it('large-upload confirmation and Sequence drafts remain with the source conversation',async()=>{
 const f=await setup(),id=f.c.resourceId();f.type('Sequence source');f.c.submit();const r=f.c.conversations!.runtime(id)!;r.sequences.create();const draft=r.sequences.draft()!.id;
 const pending=f.c.files.attach([new File([new Uint8Array(11*1024*1024)],'large.txt',{type:'text/plain'})]);await vi.waitFor(()=>expect(r.files.confirmation()).toBeTruthy());f.next();expect(f.c.files.confirmation()).toBeUndefined();expect(f.c.sequences.draft()).toBeUndefined();
 f.port.application.openDocument(id);expect(f.c.files.confirmation()).toBeTruthy();expect(f.c.sequences.draft()!.id).toBe(draft);r.files.cancel();await pending;expect(r.files.pending()).toBe('');
});
it('preference changes use bounded admission and Undo restores the inherited model',async()=>{
 const f=await setup(),initial=f.c.providerSettings().model,snapshot=vi.spyOn(f.editor.repository,'snapshot');await f.c.configureProvider({...defaultProviderSettings,model:'override'});expect(f.c.providerNotice()).not.toContain('Error');expect(snapshot).not.toHaveBeenCalled();expect(f.c.providerSettings().model).toBe('override');f.editor.repository.undo();expect(f.c.providerSettings().model).toBe(initial);f.editor.repository.redo();expect(f.c.providerSettings().model).toBe('override');
});
it('separate application windows retain their own runtimes while sharing native Document ownership',async()=>{
 const f=await setup(),jobs=transport(),id=f.c.resourceId();f.type('Window A');const pending=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(id)).toBe(true));
 await f.editor.commandRegistry.execute('dialectic.open',{targetKey:f.workspace.projection.state.rootKey,args:undefined});const other=documentApplicationPorts(f.editor).ports().find(p=>p!==f.port)!;other.application.openDocument(id);
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);f.port.closeTab!(f.port.activeTab()!);expect(confirm).not.toHaveBeenCalled();expect(jobs.get(id)!.signal.aborted).toBe(false);
 jobs.get(id)!.finish('<response><p>Visible through the other native occurrence.</p></response>');await pending;
 const root=other.session()!.projection.node(other.session()!.rootKey)!;expect(root.children.map(k=>other.session()!.projection.node(k)!).filter(n=>(n.payload.metadata as any)?.dialectic?.state==='committed')).toHaveLength(2);
});
it('attributes generated PNG/PDF attachments and native semantic definitions to the originating conversations',async()=>{
 const f=await setup(),jobs=transport(),a=f.c.resourceId();f.type('Create A');const pa=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(a)).toBe(true));const ra=f.c.conversations!.runtime(a)!;
 const b=f.next();f.type('Create B');const pb=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(b)).toBe(true));
 const artifact=(name:string,mediaType:string):Attachment=>({version:1,id:crypto.randomUUID(),asset:{kind:'managed',cavernId:'fixture',assetId:'sha256:'+'b'.repeat(64)},name,mediaType,byteLength:4,origin:'agent',createdUtc:'2026-11-15T00:00:00Z'});
 const pdf=artifact('B.pdf','application/pdf'),png=artifact('A.png','image/png');
 jobs.get(b)!.finish('<response><p>B report.</p></response>',[pdf]);await pb;
 jobs.get(a)!.finish('<response><entity id="a" name="Concept A" type="Concept"/><p id="p"><e ref="a">Concept A</e> belongs here.</p><classify target="p" whole="true" kind="claim"/><gloss target="p" whole="true" kind="explanation">Local explanation.</gloss></response>',[png]);await pa;
 expect(ra.notice()).toBe('');expect(ra.committed().at(-1)!.data.attachments).toEqual([png]);expect(f.c.committed().at(-1)!.data.attachments).toEqual([pdf]);expect(JSON.stringify(ra.root()!.payload.linkedAnnotations)).toContain('Concept A');expect(JSON.stringify(f.c.root()!.payload.linkedAnnotations??{})).not.toContain('Concept A');
});
it('closing an application window preserves a response owned by a Document still open elsewhere',async()=>{
 const f=await setup(),jobs=transport(),id=f.c.resourceId();f.type('Window lifetime');const pending=f.c.submitAndAsk();await vi.waitFor(()=>expect(jobs.has(id)).toBe(true));
 await f.editor.commandRegistry.execute('dialectic.open',{targetKey:f.workspace.projection.state.rootKey,args:undefined});const other=documentApplicationPorts(f.editor).ports().find(p=>p!==f.port)!;other.application.openDocument(id);vi.spyOn(window,'confirm').mockReturnValue(true);
 await f.editor.closeView(f.port.windowId()!);expect(jobs.get(id)!.signal.aborted).toBe(false);jobs.get(id)!.finish('<response><p>Completed after closing the original window.</p></response>');await pending;
 const root=other.session()!.projection.node(other.session()!.rootKey)!;expect(root.children.map(k=>other.session()!.projection.node(k)!).filter(n=>(n.payload.metadata as any)?.dialectic?.state==='committed')).toHaveLength(2);
});

it('retains the editor, per-conversation semantic selection and native sub-tab configuration without typing work',async()=>{
 const f=await setup(),a=f.c.resourceId(),runtime=f.c.conversations!.runtime(a)!,draft=f.c.draft()!,node=f.c.resolve(f.c.target(draft.id))!,text=f.port.session()!.projection.node(node.children[0])!,mount=f.editor.mounts.get(text.key),revision=f.editor.repository.state.revision;
 const source=f.host.querySelector('.dialectic-canvas [role="tabpanel"]');
 runtime.setWorkspaceSelection('semantics');runtime.setWorkspaceUi(v=>({...v,search:'Leonardo'}));await Promise.resolve();expect(f.host.querySelector('.semantics-workspace')).toBeTruthy();expect(f.editor.mounts.get(text.key)).toBe(mount);expect(f.editor.repository.state.revision).toBe(revision);
 runtime.setWorkspaceSelection('conversation');await Promise.resolve();expect(f.host.querySelector('.dialectic-canvas [role="tabpanel"]')).toBe(source);expect(f.editor.mounts.get(text.key)).toBe(mount);
 const snapshot=vi.spyOn(f.editor.repository,'snapshot'),inventory=runtime.references()!.diagnostics.workspaceBuilds,network=vi.mocked(fetch).mock.calls.length;
 for(let i=0;i<6;i++)f.type('x');expect(snapshot).not.toHaveBeenCalled();expect(runtime.references()!.diagnostics.workspaceBuilds).toBe(inventory);expect(vi.mocked(fetch).mock.calls.length).toBe(network);
 const tabs=runtime.workspaceConfiguration();runtime.configureWorkspace({version:1,tabs:[...tabs.tabs,{id:'people',title:'People',type:'semantics'}]});const saved=nativeBytes(captureNative(f.editor.repository.readState(),a));expect(new TextDecoder().decode(saved)).toContain('People');expect(nativeBytes(decodeNative(saved))).toEqual(saved);f.editor.repository.undo();expect(runtime.workspaceConfiguration().tabs).toHaveLength(4);f.editor.repository.redo();expect(runtime.workspaceConfiguration().tabs).toHaveLength(5);
 f.next();expect(f.c.workspaceUi().search).toBe('');f.port.application.openDocument(a);expect(f.c.workspaceUi().search).toBe('Leonardo');expect(f.c.workspaceConfiguration().tabs.at(-1)!.title).toBe('People');
});
