// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {captureNative,nativeBytes,decodeNative} from '../../persistence/native-resource';
import * as controllerModule from './controller';
import {DialecticProviderSession} from './dcp/live';
import {workspaceResponse} from './dcp/workspace.fixture';
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
async function setup(refreshEnabled=true){
 const controllers=vi.spyOn(controllerModule,'createDialecticController');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Isolated test'}))));
 const workspace=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{dialecticSemanticRefresh:refreshEnabled,authorityCache:false,dialecticProviderContinuity:false,dialecticAutosave:false,dialecticAutomaticTitles:false,nativeKnowledge:false,sqliteKnowledge:false,dcpTestPhaseLogging:false,flintProbe:false}}),editor=workspace.editor;cleanup.push(()=>workspace.dispose());
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><WorkspacePresentationView session={workspace}/>,host));editor.installGateway(document);
 await editor.commandRegistry.execute('dialectic.open',{targetKey:workspace.projection.state.rootKey,args:undefined});await Promise.resolve();await Promise.resolve();
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!;
 editor.setAssetContext(()=>({cavernId:'vault',session:'session'}));
 const c=controllers.mock.results.find(r=>r.type==='return')!.value;
 const text=()=>port.session()!.projection.node(c.resolve(c.target(c.draft()!.id))!.children[0])!;
 return {workspace,editor,host,port,c,text};
}
const sourceText='Leonardo served Ludovico.';
async function committed(f:Awaited<ReturnType<typeof setup>>){f.editor.commands.replaceInlineRange(f.text().key,0,0,sourceText);const target=f.c.submit() as import('./model').ReplyTarget;await Promise.resolve();await Promise.resolve();return target.blockId!;}
it('refreshes the original Contribution, preserves prose, avoids duplicates, and persists with Undo and manual saving',async()=>{
 const f=await setup(),id=await committed(f),save=vi.spyOn(f.port.application.files!,'save'),saveSubmitted=vi.spyOn(f.port.application.files!,'saveSubmitted'),snapshot=vi.spyOn(f.editor.repository,'snapshot');
 const transport=vi.fn(async(request:any)=>{expect(request.semanticRefresh.comment).toBe('Add claims and connections');expect(request.artifacts).toBeUndefined();
  const source=request.structuralContext.sources.find((s:any)=>s.nativeType==='standoff-editor-block'),response=workspaceResponse(request.exchange);response.composition=[];response.entities=[{id:'new:e1',name:'Leonardo',typename:'Person',description:'',aliases:[]},{id:'new:e2',name:'Ludovico',typename:'Person',description:'',aliases:[]}];
  response.interpretations=[{id:'new:m1',target:{block:source.handle,revision:source.revision,quote:'Leonardo',prefix:'',suffix:''},type:'mutable/entity-reference',ref:'new:e1',attributes:[]},{id:'new:m2',target:{block:source.handle,revision:source.revision,quote:'Ludovico',prefix:'',suffix:''},type:'mutable/entity-reference',ref:'new:e2',attributes:[]},{id:'new:m3',target:{block:source.handle,revision:source.revision,whole:true},type:'dialectic/claim',ref:null,attributes:[]}];
  response.relations=[{id:'new:rel1',kind:'entity',type:'served',from:'new:e1',to:'new:e2'}];return JSON.stringify(response);
 });
 await f.c.refreshSemantics(id,'Add claims and connections',transport);expect(f.c.semanticRefreshState()?.status).toBe('complete');expect(f.c.committed()).toHaveLength(1);expect(f.c.committed()[0].data.semanticRefreshes).toHaveLength(1);expect(f.c.contributionActivity(id)().counts.entities).toBe(2);expect(f.c.contributionActivity(id)().counts.relationships).toBe(1);expect(snapshot).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();expect(saveSubmitted).not.toHaveBeenCalled();
 const definitions=JSON.stringify(f.c.root()!.payload.linkedAnnotations),row=f.port.session()!.projection.node(f.c.resolve(f.c.target(id))!.children[0])!;
 const count=(row.payload.standoffProperties as any[]).length;
 await f.c.refreshSemantics(id,'Add claims and connections',transport);expect(f.c.semanticRefreshState()?.message).toContain('0 added');expect(JSON.stringify(f.c.root()!.payload.linkedAnnotations)).toBe(definitions);expect(row.payload.standoffProperties).toHaveLength(count);expect(f.c.committed()[0].data.semanticRefreshes).toHaveLength(2);
 f.editor.repository.undo();expect(f.c.committed()[0].data.semanticRefreshes).toHaveLength(1);f.editor.repository.undo();expect(f.c.committed()[0].data.semanticRefreshes).toBeUndefined();expect(f.c.root()!.payload.linkedAnnotations??{}).toEqual({});f.editor.repository.redo();expect(f.c.contributionActivity(id)().counts.entities).toBe(2);
 expect(()=>f.editor.commands.replaceInlineRange(row.key,0,1,'X')).toThrow('protected');
 const saved=decodeNative(nativeBytes(captureNative(f.editor.repository.readState(),f.c.resourceId())));expect(JSON.stringify(saved)).toContain('Add claims and connections');expect(JSON.stringify(saved)).toContain(sourceText);
});
it('hides the comment on Cancel or Refresh, shows a pending spinner, and typing the comment performs no repository or network work',async()=>{
 const f=await setup(),id=await committed(f);await vi.waitFor(()=>expect(f.host.querySelector('.dialectic-semantic-refresh button')).toBeTruthy());
 const control=()=>f.host.querySelector('.dialectic-semantic-refresh')!,button=(text:string)=>[...control().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
 const snapshot=vi.spyOn(f.editor.repository,'snapshot'),revision=f.editor.repository.state.revision,requests=vi.mocked(fetch).mock.calls.length,values=Object.values;let scans=0;
 vi.spyOn(Object,'values').mockImplementation((v:any)=>{if(v===f.editor.repository.state.contents||v===f.editor.repository.state.placements)scans++;return values(v);});
 button('Refresh semantics').click();const input=control().querySelector('textarea')!;input.value='More claims please';input.dispatchEvent(new Event('input',{bubbles:true}));expect(f.editor.repository.state.revision).toBe(revision);expect(snapshot).not.toHaveBeenCalled();expect(scans).toBe(0);expect(fetch).toHaveBeenCalledTimes(requests);
 for(const name of ['beforeinput','compositionstart','compositionend']){const event=new Event(name,{bubbles:true,cancelable:true});input.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);}
 await Promise.resolve();expect(f.editor.repository.state.revision).toBe(revision);
 button('Cancel').click();expect(control().querySelector('textarea')).toBeNull();expect(control().querySelector('.dialectic-spinner')).toBeNull();expect(fetch).toHaveBeenCalledTimes(requests);
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),seen:any[]=[];
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {details:{version:1 as const,adapterVersion:'4c-1' as const,settings:this.settings,attempts:[],cost:{status:'unknown' as const}},run:async(request,_s,_chunk,_signal,validate)=>{seen.push(request);await gate;const b=request.xmlContext.sources.find((s:any)=>s.kind==='block'&&s.text===sourceText);const response=`<response><definitions><classify target="${b.handle}" whole="true" kind="claim"/></definitions></response>`;await validate?.(response);return response;},commit:async()=>{},cancel:async()=>{}};});
 f.c.setProviderMode('live');button('Refresh semantics').click();control().querySelector('textarea')!.value='Extract more claims';control().querySelector('textarea')!.dispatchEvent(new Event('input',{bubbles:true}));button('Refresh').click();expect(control().querySelector('textarea')).toBeNull();expect(f.c.semanticRefreshState()?.message).toBe('Refreshing semantics…');expect(control().querySelector('.dialectic-spinner')).toBeTruthy();
 await vi.waitFor(()=>expect(seen).toHaveLength(1));expect(seen[0].xmlContext.semanticRefresh.comment).toBe('Extract more claims');release();await vi.waitFor(()=>expect(f.c.semanticRefreshState()?.status).toBe('complete'));expect(control().querySelector('.dialectic-spinner')).toBeNull();expect(control().textContent).toContain('added');
});
it('shows errors, discards cancelled responses and rejects the disabled feature',async()=>{
 const f=await setup(),id=await committed(f);await f.c.refreshSemantics(id,'',async()=>{throw Error('Provider unavailable');});expect(f.c.semanticRefreshState()?.message).toContain('Provider unavailable');expect(f.c.committed()[0].data.semanticRefreshes).toBeUndefined();
 let finish!:(s:string)=>void;const delayed=vi.fn(()=>new Promise<string>(resolve=>finish=resolve)),pending=f.c.refreshSemantics(id,'',delayed);await vi.waitFor(()=>expect(delayed).toHaveBeenCalled());f.c.cancel();await pending;expect(f.c.semanticRefreshState()?.status).toBe('error');finish('{}');await Promise.resolve();expect(f.c.committed()[0].data.semanticRefreshes).toBeUndefined();
});
it('hides and rejects semantic refresh when its feature flag is disabled',async()=>{
 const f=await setup(false),id=await committed(f),transport=vi.fn();expect(f.host.querySelector('.dialectic-semantic-refresh')).toBeNull();await f.c.refreshSemantics(id,'',transport);expect(transport).not.toHaveBeenCalled();expect(f.c.semanticRefreshState()?.message).toContain('disabled');
});
it('refreshes Contributions beyond the normal reply excerpt limit and rejects a response when its source changes',async()=>{
 const f=await setup();f.editor.commands.replaceInlineRange(f.text().key,0,0,'A lengthy historical discussion. '.repeat(240));const id=await committed(f);
 const empty=(request:any)=>{const r=workspaceResponse(request.exchange);r.composition=[];r.entities=[];return JSON.stringify(r);};
 await f.c.refreshSemantics(id,'',async(request:any)=>{expect(request.structuralContext.sources.some((s:any)=>s.text?.length>6000)).toBe(true);return empty(request);});expect(f.c.semanticRefreshState()?.status).toBe('complete');
 let finish!:()=>void;const transport=vi.fn(async(request:any)=>{await new Promise<void>(r=>finish=r);return empty(request);}),pending=f.c.refreshSemantics(id,'',transport);await vi.waitFor(()=>expect(transport).toHaveBeenCalled());
 const row=f.port.session()!.projection.node(f.c.resolve(f.c.target(id))!.children[0])!;f.editor.commands.setPayloadField(row.key,'standoffProperties',[{id:crypto.randomUUID(),type:'style/bold',start:0,end:3}]);finish();await pending;expect(f.c.semanticRefreshState()?.status).toBe('error');expect(f.c.semanticRefreshState()?.message).toContain('context changed');expect(f.c.committed()[0].data.semanticRefreshes).toHaveLength(1);
});
