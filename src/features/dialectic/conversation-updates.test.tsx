import {ContributionNavigation,createContentsPreference,contentsPreferenceKey} from './contents-view';
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {createDialecticController} from './controller';
import {ComposerProgress} from './view';
import {DialecticProviderSession} from './dcp/live';
import {nativeDocumentSession} from '../../persistence/native-session';
import {ConversationHistory} from './continuity';
import {plainFragment} from '../../interchange/serializer';
import {exportClipboard} from '../../interchange/transport';
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();localStorage.removeItem(contentsPreferenceKey);});
async function setup(titles=false,logging=false,autosave=true,mount=true,semanticContents=true,streaming=true){
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'No test Vault'}),{headers:{'Content-Type':'application/json'}})));
 const workspace=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{dcpXmlStreaming:streaming,dialecticSemanticContents:semanticContents,dialecticAutomaticTitles:titles,dialecticConversationUpdates:true,dialecticAutosave:autosave,nativeKnowledge:false,sqliteKnowledge:false,dcpTestPhaseLogging:logging,flintProbe:false}}),editor=workspace.editor;cleanup.push(()=>workspace.dispose());
 const host=document.body.appendChild(document.createElement('div'));if(mount)cleanup.push(render(()=><WorkspacePresentationView session={workspace}/>,host));
 editor.installGateway(document);await editor.commandRegistry.execute('dialectic.open',{targetKey:workspace.projection.state.rootKey,args:undefined});await Promise.resolve();await Promise.resolve();
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!;
 const save=vi.spyOn(port.application.files! as Required<NonNullable<typeof port.application.files>>,'saveSubmitted').mockResolvedValue(true);
 const c=createRoot(dispose=>{cleanup.push(dispose);return createDialecticController(editor,()=>port);});cleanup.push(()=>c.dispose());
 const text=()=>port.session()!.projection.node(c.resolve(c.target(c.draft()!.id))!.children[0])!;
 return {workspace,editor,host,port,save,c,text};
}
it('defaults to a collapsed numbered rail, toggles panels without remounting the editor, and removes Save',async()=>{
 const {editor,host,c,text}=await setup(),app=host.querySelector('.dialectic-app')!,mount=editor.mounts.get(text().key);
 expect(app.classList.contains('dialectic-chat')).toBe(true);expect(app.querySelector('[data-sidebar-open=false]')).toBeTruthy();
 expect([...app.querySelectorAll('button')].some(b=>b.textContent==='Save')).toBe(false);expect([...app.querySelectorAll('button')].some(b=>b.textContent==='Save as…')).toBe(true);
 const snapshots=vi.spyOn(editor.repository,'snapshot'),revision=editor.repository.state.revision;
 app.querySelector<HTMLButtonElement>('[aria-label="Expand Contributions"]')!.click();expect(app.querySelector('[data-sidebar-open=true]')).toBeTruthy();
 app.querySelector<HTMLButtonElement>('[aria-label="Collapse Contributions"]')!.click();expect(editor.mounts.get(text().key)).toBe(mount);expect(editor.repository.state.revision).toBe(revision);expect(snapshots).not.toHaveBeenCalled();
 editor.commands.replaceInlineRange(text().key,0,0,'A contribution');c.submit();await Promise.resolve();
 expect(app.querySelector('[aria-label="Contribution chronology"] button')?.getAttribute('aria-label')).toContain('Contribution 1:');
});
it('saves only at contribution boundaries, including responses, with captured Document identity',async()=>{
 const {editor,save,c,text}=await setup(),id=c.resourceId(),snapshots=vi.spyOn(editor.repository,'snapshot'),rowBuilds=c.diagnostics.rowBuilds;
 for(let i=0;i<8;i++)editor.commands.replaceInlineRange(text().key,0,0,'word ');
 expect(save).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();expect(c.diagnostics.rowBuilds).toBe(rowBuilds);
 c.submit();await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1));expect(save.mock.calls[0][0]).toBe(id);expect(save.mock.calls[0][1]).toMatch(/^Conversation on [A-Za-z]+ \d{1,2}, \d{4}\.ink$/);
 await c.askMock();await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(save.mock.calls[1][0]).toBe(id);
});
it('starts and admits the first AI response while its contribution save is pending, without allowing presentation transfer',async()=>{
 const {editor,save,c,text,port}=await setup(),native=nativeDocumentSession(editor);
 let releaseSave!:()=>void;const pendingSave=new Promise<void>(resolve=>releaseSave=resolve);
 const writes:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
  if(String(input)!=='/api/native/save')throw Error('Unexpected test request');
  const body=JSON.parse(String(init?.body));writes.push(body);if(writes.length===1)await pendingSave;
  return new Response(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:body.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:body.generation.generation}}}),{headers:{'Content-Type':'application/json'}});
 }));
 save.mockImplementation(async(id,filename)=>(await native.save(id,{folder:'isolated',filename}))?.phase==='saved');
 // First-use provider configuration yields while the newly submitted contribution starts saving.
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){await vi.waitFor(()=>expect(writes).toHaveLength(1));this.settings=settings;this.ready=true;return true;});
 const generated=vi.fn(async()=>'<response><p>A native response while saving.</p></response>');
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {run:generated,details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},commit:async()=>{},cancel:async()=>{}};});
 editor.commands.replaceInlineRange(text().key,0,0,'An ordinary first contribution');
 try{
  await c.submitAndAsk();
  expect(c.notice()).toBe('');expect(generated).toHaveBeenCalledTimes(1);expect(c.committed()).toHaveLength(2);
  expect(c.committed()[1].data.author).toBe('ai');expect(native.knowledgeEvidence(c.resourceId()).pending).toBe(true);
  expect(()=>editor.documentSessions!.presentations.check(port.session()!)).toThrow('Finish the Document Save or recovery');
  expect(writes).toHaveLength(1);
 }finally{releaseSave();}
 await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(2));
 await vi.waitFor(()=>expect(c.saveState()?.pending).toBe(false));
 expect(c.saveState()?.error).toBe('');expect(native.isDirty(c.resourceId())).toBe(false);
 expect(writes).toHaveLength(2);expect(writes[1].location).toEqual(writes[0].location);
});
it('reports paste activity only for the native draft and clears it after completion',async()=>{
 const {editor,c,text,host}=await setup(),node=text(),mount=editor.mounts.get(node.key)!;
 const destination=mount.focusElement;mount.focus();mount.restoreInlineSelection?.({anchor:0,head:0});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,0);
 let finish!:(value:any)=>void;vi.spyOn(editor.clipboard as any,'prepare').mockImplementationOnce(()=>new Promise(r=>finish=r));
 const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{types:['text/plain'],getData:(type:string)=>type==='text/plain'?'x'.repeat(10001):''}});destination.dispatchEvent(event);
 expect(c.pasting()).toBe(true);expect(host.querySelector('.dialectic-paste-progress')?.textContent).toContain('Pasting');expect(host.querySelector<HTMLButtonElement>('[aria-label="Submit contribution"]')?.disabled).toBe(true);
 c.submit();expect(c.committed()).toHaveLength(0);expect(c.notice()).toContain('paste');
 finish({fragment:plainFragment('Pasted text')});await vi.waitFor(()=>expect(c.pasting()).toBe(false));expect(host.querySelector('.dialectic-paste-progress')).toBeNull();expect(editor.node(node.key)?.inlineContent.length).toBe(11);
});
it.each(['html','native','html-only'])('pastes %s into the draft as plain text with native Undo/Redo and no save or resource lookup',async format=>{
 const {editor,c,text,save}=await setup(),node=text(),mount=editor.mounts.get(node.key)!;
 mount.focus();mount.restoreInlineSelection?.({anchor:0,head:0});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,0);
 const source='A bold passage\nhttps://example.com/image.png';
 const data:Record<string,string>=format==='native'?exportClipboard(plainFragment('Native structure')):{'text/html':'<p>A <b>bold</b> passage</p><p>https://example.com/image.png</p>'};
 if(format!=='html-only')data['text/plain']=source;
 const snapshots=vi.spyOn(editor.repository,'snapshot'),assets=vi.spyOn(editor.clipboard as any,'availableAssets'),blocks=vi.spyOn(editor.clipboard as any,'availableBlocks');
 vi.mocked(fetch).mockClear();
 const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{types:Object.keys(data),getData:(type:string)=>data[type]??''}});mount.focusElement.dispatchEvent(event);
 const children=()=>c.resolve(c.target(c.draft()!.id))!.children.map(key=>editor.node(key)!);
 const pasted=()=>children().map(child=>editor.mounts.get(child.key)?.captureText?.()).join('\n');
 await vi.waitFor(()=>expect(pasted()).toBe(source));
 expect(children()).toHaveLength(2);for(const child of children()){expect(child.viewType).toBe('standoff-editor-block');expect(child.payload.standoffProperties??[]).toEqual([]);}
 expect(snapshots).not.toHaveBeenCalled();expect(assets).not.toHaveBeenCalled();expect(blocks).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
 editor.repository.undo();expect(pasted()).toBe('');editor.repository.redo();await vi.waitFor(()=>expect(pasted()).toBe(source));
});
it('renders the three-dot status during a pending request and removes it on cancellation',async()=>{
 const {editor,c,text}=await setup();editor.commands.replaceInlineRange(text().key,0,0,'Hello');c.submit();
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><ComposerProgress c={c}/>,host));
 let finish!:(raw:string)=>void;
 const pending=c.askMock(async()=>new Promise<string>(r=>finish=r));await vi.waitFor(()=>expect(host.querySelector('[aria-label="Waiting for AI response"]')).toBeTruthy());
 expect(host.querySelectorAll('.dialectic-response-progress i')).toHaveLength(3);c.cancel();expect(host.querySelector('[aria-label="Waiting for AI response"]')).toBeNull();
 finish?.('{}');await pending;expect(c.committed()).toHaveLength(1);
});

it('applies a generated title only to Document metadata, preserving filename, contribution history and counts',async()=>{
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 let finish!:(title:string)=>void;const title=vi.spyOn(DialecticProviderSession.prototype,'title').mockImplementation(()=>new Promise(r=>finish=r));
 const {editor,c,text,port}=await setup(true);editor.setAssetContext(()=>({cavernId:'fixture',session:'fixture'}));
 await c.configureProvider(c.providerSettings());
 const native=nativeDocumentSession(editor),location={folder:'isolated',filename:'My selected filename.ink'};
 (native as any).bind(c.resourceId(),location,{nativeHash:'initial',markdownHash:null,generation:null});
 editor.commands.replaceInlineRange(text().key,0,0,'How can historical interpretations be revised?');c.submit();
 await vi.waitFor(()=>expect(title).toHaveBeenCalledTimes(1));const before=c.committed().map(row=>row.id),keys=c.committed().map(row=>c.resolve(c.target(row.id))!.contentKey);
 const history=new ConversationHistory(editor);cleanup.push(()=>history.dispose());
 const original=await history.build(c.resourceId(),'ai',keys);finish('Revising historical interpretations');
 await vi.waitFor(()=>expect((c.root()!.payload.metadata as any).title).toBe('Revising historical interpretations'));
 expect(c.committed().map(row=>row.id)).toEqual(before);expect(c.diagnostics.submissions).toBe(1);expect(native.location(c.resourceId())).toEqual(location);
 expect(await history.build(c.resourceId(),'ai',keys)).toEqual(original);expect(port.application.properties()?.title).toBe('Revising historical interpretations');
 expect(original.items[0].content).not.toContain('Generate a concise');
});

it.each(['exchange.materialised','contribution.committed'])('reveals admitted AI content while %s logging is pending',async kind=>{
 const {editor,c,text}=await setup(false,true,true,true,true,false);
 editor.setAssetContext(()=>({cavernId:'test',session:'test'}));
 let block=false,release!:()=>void;
 const pending=new Promise<void>(resolve=>release=resolve);
 const diagnostic=vi.spyOn(DialecticProviderSession.prototype,'diagnostic').mockImplementation(async(event:any)=>{
  if(block&&event.kind===kind)await pending;
  return true;
 });
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {
  details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},
  run:async()=>'<response><p>Visible before diagnostic uploads finish.</p></response>',commit:async()=>{},cancel:async()=>{},
 };});
 editor.commands.replaceInlineRange(text().key,0,0,'Hello');c.submit();
 await vi.waitFor(()=>expect(diagnostic).toHaveBeenCalled());
 diagnostic.mockClear();block=true;
 const ensure=vi.spyOn(editor.focus,'ensureRendered');
 const snapshot=vi.spyOn(editor.repository,'snapshot'),commit=vi.spyOn(editor.repository,'commit');
 const exchange=c.ask();
 try{
  await vi.waitFor(()=>expect(diagnostic.mock.calls.some(([event]:any)=>event.kind===kind)).toBe(true));
  const response=c.committed().at(-1)!;
  expect(response.data.author).toBe('ai');
  expect(c.inspection()).toEqual(c.target(response.id));
  expect(c.dcpPreview()).toBe('');
  await vi.waitFor(()=>expect(ensure).toHaveBeenCalledWith(response.key,expect.any(Function)));
  expect(editor.mounts.get(response.key)?.root.textContent).toContain('Visible before diagnostic uploads finish.');
  expect(snapshot).not.toHaveBeenCalled();expect(commit).toHaveBeenCalledTimes(1);
 }finally{release();await exchange;}
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const timings=c.lastProviderExchange()?.localTimings;expect(timings?.validationAttempts).toBe(1);
 for(const name of ['lowerMs','prepareMs','admissionMs','postAdmissionDiagnosticsMs','acknowledgementMs'] as const)expect(timings?.[name]).toBeGreaterThanOrEqual(0);
});

it('keeps the conversational layout and manual Save while autosave and diagnostic logging are off',async()=>{
 const {editor,c,text,save,port,host}=await setup(false,false,false);
 const manual=vi.spyOn(port.application.files!,'save').mockResolvedValue(undefined);
 const diagnostic=vi.spyOn(DialecticProviderSession.prototype,'diagnostic');
 const history=vi.spyOn(ConversationHistory.prototype,'build');
 editor.commands.replaceInlineRange(text().key,0,0,'Manual-save conversation');c.submit();await c.askMock();
 expect(c.committed()).toHaveLength(2);expect(save).not.toHaveBeenCalled();expect(c.saveState()).toBeUndefined();
 expect(diagnostic).not.toHaveBeenCalled();expect(history).not.toHaveBeenCalled();
 expect(host.querySelector('.dialectic-chat')).toBeTruthy();
 expect(host.textContent).toContain('Save with ⌘S / Ctrl+S');expect(host.textContent).not.toContain('Contributions save automatically');
 const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Save');expect(button).toBeTruthy();button!.click();
 expect(manual).toHaveBeenCalledTimes(1);
});


it('keeps semantic failures quiet and toggles a persisted contribution warning without document work',async()=>{
 const {editor,host,c,text}=await setup(false,false,false);
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 const xml='<p id="p">A readable answer.</p><gloss target="missing" kind="scope">Cannot resolve.</gloss><gloss target="p" whole="true" kind="scope">A valid Gloss after the unresolved one.</gloss>';
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {run:async(_r,_s,chunk,_signal,validate)=>{chunk(xml,'text');await validate?.(xml);return xml;},details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},commit:async()=>{},cancel:async()=>{}};});
 editor.commands.replaceInlineRange(text().key,0,0,'Please explain.');await c.submitAndAsk();
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const row=c.committed()[1];expect(row.data.notices).toMatchObject([{version:1,severity:'warning',loss:true,detail:expect.stringContaining('missing')}]);
 expect(c.contributionActivity(row.id)().counts.glosses).toBe(1);
 await vi.waitFor(()=>expect(host.querySelector('[aria-label="Contribution warnings"]')).toBeTruthy());
 const toggle=host.querySelector<HTMLElement>('[aria-label="Contribution warnings"]')!,details=toggle.parentElement as HTMLDetailsElement;
 expect(details.open).toBe(false);expect(toggle.textContent?.trim()).toBe('');expect(toggle.querySelector('svg')).toBeTruthy();
 const revision=editor.repository.state.revision,snapshots=vi.spyOn(editor.repository,'snapshot');
 toggle.click();expect(details.open).toBe(true);expect(details.textContent).toContain('missing');toggle.click();expect(details.open).toBe(false);
 expect(editor.repository.state.revision).toBe(revision);expect(snapshots).not.toHaveBeenCalled();
 const {captureNative,nativeBytes,decodeNative}=await import('../../persistence/native-resource');
 const restored=decodeNative(nativeBytes(captureNative(editor.repository.readState(),c.resourceId())));
 expect(JSON.stringify(restored)).toContain('1 semantic operation was skipped');
 editor.repository.undo();expect(c.committed()).toHaveLength(1);editor.repository.redo();expect(c.committed()[1].data.notices).toEqual(row.data.notices);
});


it('keeps Semantic Contents row updates bounded in a thousand-contribution Symposium',async()=>{
 const {editor,c,text,workspace}=await setup(false,false,false),root=c.root()!;
 const host=document.body.appendChild(document.createElement('div'));
 const start=performance.now(),ids:string[]=[];
 editor.commands.boundedStructuralTransaction('Large Contents fixture',()=>{
  for(let i=1;i<=1000;i++){const id=crypto.randomUUID();ids.push(id);editor.commands.insert({id,type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:i===1000?'receiving':'committed',author:'human',ordinal:i,replies:[]}},children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text:'Question about evidence '+i}]},{kind:'before',anchorKey:c.draft()!.key});}
 });
 const built=performance.now();cleanup.push(render(()=><ContributionNavigation c={c} expanded={true}/>,host));
 const mounted=performance.now(),references=c.references()!,before={...references.diagnostics},rows=c.diagnostics.rowBuilds,labels=c.diagnostics.contentsSynopsisReads,snapshot=vi.spyOn(editor.repository,'snapshot');
 const nodes=[...host.querySelectorAll('[data-contents-id]')],last=c.contentsRows().at(-1)!,n=c.session()!.projection.node(last.key)!;
 editor.textProtection.receivingInsertion(n.contentKey,()=>editor.commands.boundedStructuralTransaction('Receive title',()=>editor.commands.setPayloadField(n.key,'metadata',{dialectic:{...JSON.parse(JSON.stringify(last.data)),synopsis:{version:1,text:'A Revised Evidence Question',author:'ai',participantId:'test',exchangeId:'test'}}})));
 const updateMs=performance.now()-mounted;
 expect(c.diagnostics.contentsSynopsisReads-labels).toBe(1);
 expect(host.lastElementChild?.textContent).toContain('A Revised Evidence Question');expect([...host.querySelectorAll('[data-contents-id]')]).toEqual(nodes);
 expect(c.diagnostics.rowBuilds).toBe(rows);expect(references.diagnostics.contentsReads).toBe(before.contentsReads);expect(references.diagnostics.excerptReads).toBe(before.excerptReads);expect(snapshot).not.toHaveBeenCalled();
 const updated=performance.now(),updateWork={rowsRebuilt:c.diagnostics.rowBuilds-rows,coverageRecounts:references.diagnostics.contentsReads-before.contentsReads};for(let i=0;i<8;i++)editor.commands.replaceInlineRange(text().key,0,0,'x');
 expect(references.diagnostics.contentsReads).toBe(before.contentsReads);expect(c.diagnostics.rowBuilds).toBe(rows);
 const other=crypto.randomUUID(),otherText=crypto.randomUUID();editor.commands.insert({id:other,type:'document-block',children:[{id:otherText,type:'standoff-editor-block',text:'Unrelated'}]},{kind:'at',parentKey:workspace.projection.state.rootKey,index:0});
 const otherNode=Object.values(workspace.projection.state.nodes).find(v=>v.payload.id===otherText)!;const reads=references.diagnostics.contentsReads;editor.commands.replaceInlineRange(otherNode.key,0,0,'x');expect(references.diagnostics.contentsReads).toBe(reads);
 const first=host.querySelector<HTMLButtonElement>('[data-contents-link]')!,second=host.querySelectorAll<HTMLButtonElement>('[data-contents-link]')[1];first.focus();first.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));expect(document.activeElement).toBe(second);second.click();expect(c.inspection()?.blockId).toBe(ids[1]);
 expect(c.contentsSynopsis(ids[0])).toContain('Question about evidence');
 const preference=createRoot(dispose=>{cleanup.push(dispose);return createContentsPreference(true,false);});expect(preference.open()).toBe(false);preference.toggle();expect(localStorage.getItem(contentsPreferenceKey)).toBe('expanded');
 const reopened=createRoot(dispose=>{cleanup.push(dispose);return createContentsPreference(true,false);});expect(reopened.open()).toBe(true);
 console.info('Semantic Contents 1000-row deterministic timings',JSON.stringify({buildMs:built-start,expandedMountMs:mounted-built,oneSynopsisMs:updateMs,...updateWork}));
},30000);

it('retains Synopsis through native reopening and Desktop/Textual host transfer, with disabled-mode compatibility',async()=>{
 const {editor,c,workspace,host,text}=await setup(false,false,false);
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {run:async(request,_sources,chunk,_signal,validate)=>{expect(request.synopsisAuthoring).toBe(1);const xml='<response><p>A historically qualified explanation.</p><synopsis>Origins of Scholarly Research Institutions</synopsis></response>';chunk(xml,'text');await validate?.(xml);return xml;},details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},commit:async()=>{},cancel:async()=>{}};});
 editor.commands.replaceInlineRange(text().key,0,0,'Explain medieval scholarly institutions');await c.submitAndAsk();expect(c.notice()).toBe('');const row=c.frontier()!;
 expect(row.data.synopsis).toMatchObject({text:'Origins of Scholarly Research Institutions',author:'ai',exchangeId:row.data.requestId});
 host.querySelector<HTMLButtonElement>('[aria-label="Expand Contributions"]')!.click();expect(host.querySelector('.dialectic-contents-synopsis')).toBeTruthy();
 const {captureNative,nativeBytes,admitNative}=await import('../../persistence/native-resource'),{ReactiveEditor}=await import('../../reactive-editor/editor'),{DialecticReferences}=await import('./references');
 const saved=captureNative(editor.repository.readState(),c.resourceId()),loaded=new ReactiveEditor({id:crypto.randomUUID(),type:'workspace-object-bank-block',children:[]},{features:{nativeKnowledge:false,sqliteKnowledge:false}});cleanup.push(()=>loaded.dispose());const bank=loaded.repository.readState();admitNative(loaded.repository,nativeBytes(saved),bank.placements[bank.rootPlacementKey].contentKey);
 const view=loaded.createView('contents-reopen'),doc=Object.values(view.state.nodes).find(n=>n.payload.id===c.resourceId())!,reopened=Object.values(view.state.nodes).find(n=>n.payload.id===row.id)!;
 expect((reopened.payload.metadata as any).dialectic.synopsis).toEqual(row.data.synopsis);const refs=new DialecticReferences(loaded,view,doc.key);cleanup.push(()=>refs.dispose());expect(refs.contentsExcerpt(c.committed()[0].id)).toContain('Explain medieval');
 const box=HTMLElement.prototype.getBoundingClientRect;vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){if(this.classList.contains('textual-workspace'))return {x:0,y:0,left:0,top:0,right:1440,bottom:900,width:1440,height:900,toJSON(){}};if(this.classList.contains('tw-font-probe'))return {x:0,y:0,left:0,top:0,right:2560,bottom:20,width:2560,height:20,toJSON(){}};return box.call(this);});
 expect(workspace.selectPresentation('textual')).toBe(true);await new Promise(r=>setTimeout(r,50));
 const textual=document.querySelector('.dialectic-textual')!;expect(textual.querySelector('[data-sidebar-open=true]')).toBeTruthy();expect(textual.textContent).toContain('Origins of Scholarly Research Institutions');expect(workspace.selectPresentation('desktop')).toBe(true);
 // The rail resolves canonical identity even when there is no mounted target;
 // the existing focus/render service owns realization, not the Contents panel.
 const get=editor.mounts.get.bind(editor.mounts),missing=vi.spyOn(editor.mounts,'get').mockImplementation(key=>key===row.key?undefined:get(key));
 const ensure=vi.spyOn(editor.focus,'ensureRendered').mockResolvedValue(false);c.inspect(c.target(row.id));
 await vi.waitFor(()=>expect(ensure).toHaveBeenCalledWith(row.key,expect.any(Function)));expect(c.inspection()?.blockId).toBe(row.id);expect(c.notice()).toBe('');missing.mockRestore();ensure.mockRestore();
});

it('preserves the old rail and omits Synopsis instructions when Semantic Contents is disabled',async()=>{
 const {c,host,editor,text}=await setup(false,false,false,true,false);
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {run:async(request,_sources,chunk,_signal,validate)=>{expect(request.synopsisAuthoring).toBeUndefined();const xml='<synopsis>Optional unsolicited title</synopsis><p>Still valid content.</p>';chunk(xml,'text');await validate?.(xml);return xml;},details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},commit:async()=>{},cancel:async()=>{}};});
 editor.commands.replaceInlineRange(text().key,0,0,'Hello');await c.submitAndAsk();expect(c.notice()).toBe('');expect(c.frontier()!.data.synopsis).toBeUndefined();host.querySelector<HTMLButtonElement>('[aria-label="Expand Contributions"]')!.click();expect(host.querySelector('.dialectic-contents-counts')).toBeNull();expect(host.querySelector('.dialectic-contents-synopsis')).toBeNull();
});
