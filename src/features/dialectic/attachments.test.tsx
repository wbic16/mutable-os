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
import {attachments,attachmentLimits,type Attachment} from './attachments-contract';
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
const file=(name='note.txt'):Attachment=>({version:1,id:crypto.randomUUID(),asset:{kind:'managed',cavernId:'vault',assetId:'sha256:'+'a'.repeat(64)},name,mediaType:'text/plain',byteLength:4,origin:'user',createdUtc:'2026-11-14T00:00:00Z'});
async function setup(enabled=true,streaming=true,imageGeneration=true){
 const controllers=vi.spyOn(controllerModule,'createDialecticController');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Isolated test'}))));
 const workspace=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{dialecticAttachments:enabled,dialecticArtifacts:enabled,dialecticImageGeneration:imageGeneration,dcpXmlStreaming:streaming,dialecticProviderContinuity:false,dialecticAutosave:false,dialecticAutomaticTitles:false,nativeKnowledge:false,sqliteKnowledge:false,dcpTestPhaseLogging:false,flintProbe:false}}),editor=workspace.editor;cleanup.push(()=>workspace.dispose());
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><WorkspacePresentationView session={workspace}/>,host));editor.installGateway(document);
 await editor.commandRegistry.execute('dialectic.open',{targetKey:workspace.projection.state.rootKey,args:undefined});await Promise.resolve();await Promise.resolve();
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!;
 editor.setAssetContext(()=>({cavernId:'vault',session:'session'}));
 const c=controllers.mock.results.find(r=>r.type==='return')!.value;
 const text=()=>port.session()!.projection.node(c.resolve(c.target(c.draft()!.id))!.children[0])!;
 return {workspace,editor,host,port,c,text};
}
it.each(['fragments','wrapped'])('continues native %s after a streamed preamble and PDF tool round',async framing=>{
 const {c,editor,text,port}=await setup(),output={...file('research.pdf'),origin:'agent' as const,mediaType:'application/pdf'};
 editor.commands.replaceInlineRange(text().key,0,0,'Compile the research into a PDF.');
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 const xml=(value:string)=>framing==='wrapped'?`<response>${value}</response>`:value;
 const first=xml('<p id="intro">I will compile the research.</p>'),last=xml('<p id="done">Your PDF is ready.</p>');
 const receipt={provider:'openai',model:'fixture',startedUtc:'',completedUtc:'',usage:null,stop:'completed',cost:{status:'unknown'}};
 let firstKey='',mount:Element|undefined,artifactCalls=0;
 const snapshots=vi.spyOn(editor.repository,'snapshot'),save=vi.spyOn(port.application.files!,'saveSubmitted');
 const values=Object.values;let scans=0;vi.spyOn(Object,'values').mockImplementation((v:any)=>{if(v===editor.repository.state.contents||v===editor.repository.state.placements)scans++;return values(v);});
 vi.mocked(fetch).mockImplementation(async(url:any,init:any)=>{
  if(String(url).endsWith('/session'))return Response.json({token:'fixture'});
  if(String(url).endsWith('/exchange'))return Response.json({id:'fixture-exchange',settings:c.providerSettings()});
  if(String(url).endsWith('/artifact')){artifactCalls++;return Response.json({attachment:output});}
  if(String(url).endsWith('/turn')){
   const round=JSON.parse(init.body).round;
   return new Response(new ReadableStream({async start(controller){
    const send=(value:unknown)=>controller.enqueue(new TextEncoder().encode(JSON.stringify(value)+'\n'));
    send({type:'delta',text:round===0?first:last});
    if(round===0){await vi.waitFor(()=>expect(c.rows().find((r:any)=>r.data.state==='receiving')).toBeTruthy());const row=c.rows().find((r:any)=>r.data.state==='receiving')!;firstKey=c.resolve(c.target(row.id))!.children[0];mount=editor.mounts.get(firstKey)?.root;}
    send({type:'result',text:round===0?first:last,calls:round===0?[{id:'pdf',tool:'create_attachment',arguments:{filename:'research.pdf',format:'pdf',content:'Research'}}]:[],receipt});controller.close();
   }}));
  }
  return Response.json({});
 });
 await c.submitAndAsk();
 expect(c.notice()).toBe('');expect(artifactCalls).toBe(1);expect(c.committed()).toHaveLength(2);
 const row=c.committed()[1],node=c.resolve(c.target(row.id))!;expect(node.children).toHaveLength(2);expect(node.children[0]).toBe(firstKey);expect(editor.mounts.get(firstKey)?.root).toBe(mount);
 expect(row.data.attachments).toEqual([output]);expect(row.data.dcp!.response).toContain(first);expect(row.data.dcp!.response).toContain(last);expect(row.data.notices).toEqual([]);
 expect(snapshots).not.toHaveBeenCalled();expect(scans).toBe(0);expect(save).not.toHaveBeenCalled();
 editor.repository.undo();expect(c.committed()).toHaveLength(1);editor.repository.redo();expect(c.committed()[1].data.attachments).toEqual([output]);
 expect(JSON.stringify(decodeNative(nativeBytes(captureNative(editor.repository.readState(),c.resourceId()))))).toContain(output.asset.assetId);
});
it('still rejects a genuine replacement after native insertion and retains the undoable original',async()=>{
 const {c,editor,text}=await setup();editor.commands.replaceInlineRange(text().key,0,0,'Create a report.');
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {
  details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},commit:async()=>{},cancel:async()=>{},
  run:async(_request,_sources,chunk)=>{chunk('','start');chunk('<p>Original received paragraph.</p>','text');await vi.waitFor(()=>expect(c.rows().some(row=>row.data.state==='receiving')).toBe(true));chunk('','start');return '<p>Replacement must not be inserted.</p>';}
 };});
 await c.submitAndAsk();expect(c.notice()).toContain('cannot be replaced after insertion');expect(c.committed()).toHaveLength(2);
 expect(c.committed()[1].data.dcp!.response).toContain('Original received paragraph');expect(c.committed()[1].data.dcp!.response).not.toContain('Replacement must not');
 editor.repository.undo();expect(c.committed()).toHaveLength(1);
});
it('attaches with bounded canonical work, supports Undo/Redo and native persistence, and never saves automatically',async()=>{
 const {editor,c,port}=await setup(),a=file(),upload=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockResolvedValue(a),save=vi.spyOn(port.application.files!,'save'),saveSubmitted=vi.spyOn(port.application.files!,'saveSubmitted');
 const snapshot=vi.spyOn(editor.repository,'snapshot'),values=Object.values;let scans=0;
 vi.spyOn(Object,'values').mockImplementation((value:any)=>{if(value===editor.repository.state.contents||value===editor.repository.state.placements)scans++;return values(value);});
 await c.files.attach([new File(['test'],a.name)]);expect(c.draft()!.data.attachments).toEqual([a]);expect(upload).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();expect(scans).toBe(0);
 editor.repository.undo();expect(c.draft()!.data.attachments).toBeUndefined();editor.repository.redo();expect(c.draft()!.data.attachments).toEqual([a]);
 const submitted=c.submit();expect(submitted).toBeTruthy();expect(c.committed()[0].data.attachments).toEqual([a]);expect(c.draft()!.data.attachments).toBeUndefined();
 const saved=decodeNative(nativeBytes(captureNative(editor.repository.readState(),c.resourceId())));expect(JSON.stringify(saved)).toContain(a.asset.assetId);expect(JSON.stringify(saved)).not.toContain('base64');
 expect(save).not.toHaveBeenCalled();expect(saveSubmitted).not.toHaveBeenCalled();
});
it('does no attachment work, scans, snapshots or attachment DOM updates on ordinary typing',async()=>{
 const {editor,c,text,host}=await setup(),a=file();vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockResolvedValue(a);await c.files.attach([new File(['test'],a.name)]);await Promise.resolve();await Promise.resolve();
 const snapshots=vi.spyOn(editor.repository,'snapshot'),values=Object.values;let scans=0;vi.spyOn(Object,'values').mockImplementation((v:any)=>{if(v===editor.repository.state.contents||v===editor.repository.state.placements)scans++;return values(v);});
 const transport=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment'),requests=vi.mocked(fetch).mock.calls.length,mutations:MutationRecord[]=[];
 const card=host.querySelector('.dialectic-attachment')!;expect(card).toBeTruthy();const observer=new MutationObserver(m=>mutations.push(...m));observer.observe(card,{subtree:true,childList:true,attributes:true,characterData:true});observer.observe(host.querySelector('[aria-label="Draft attachment status"]')!,{subtree:true,childList:true,attributes:true,characterData:true});
 for(let i=0;i<20;i++)editor.commands.replaceInlineRange(text().key,0,0,'x');await Promise.resolve();observer.disconnect();
 expect(snapshots).not.toHaveBeenCalled();expect(scans).toBe(0);expect(fetch).toHaveBeenCalledTimes(requests);expect(transport).not.toHaveBeenCalled();expect(mutations).toHaveLength(0);
});
it('accepts file drops into the actual application and removes attachments through its controls',async()=>{
 const {host,c}=await setup(),a=file();vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockResolvedValue(a);
 const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{types:['Files'],files:[new File(['test'],a.name)]}});host.querySelector('.dialectic-app')!.dispatchEvent(event);
 expect(event.defaultPrevented).toBe(true);await vi.waitFor(()=>expect(c.draft()!.data.attachments).toHaveLength(1));
 await vi.waitFor(()=>expect(host.querySelector('.dialectic-attachment')?.textContent).toContain(a.name));
 [...host.querySelectorAll<HTMLButtonElement>('.dialectic-attachment button')].find(b=>b.textContent==='Remove')!.click();expect(c.draft()!.data.attachments).toEqual([]);
});
const drag=(element:EventTarget,type:string,files:File[]=[],types=['Files'])=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{types,files,dropEffect:'none'}});element.dispatchEvent(event);return event;};
it('receives files on the overlay above protected history and attaches only to the current draft',async()=>{
 const {host,c,editor,text}=await setup(),submittedText=text();editor.commands.replaceInlineRange(submittedText.key,0,0,'Submitted evidence');c.submit();await Promise.resolve();
 const original=c.committed()[0],protectedElement=editor.mounts.get(submittedText.key)!.focusElement,originalMetadata=JSON.stringify(original.data),a={...file('Paper.pdf'),mediaType:'application/pdf'};
 expect(editor.canEditText(submittedText.key)).toBe(false);const upload=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockResolvedValue(a),snapshots=vi.spyOn(editor.repository,'snapshot');
 // The native protection boundary must still reject a direct drop into history.
 drag(protectedElement,'drop',[new File(['test'],'Paper.pdf')]);expect(upload).not.toHaveBeenCalled();
 const revision=editor.repository.state.revision;drag(protectedElement,'dragenter');drag(protectedElement,'dragover');
 const overlay=host.querySelector('.dialectic-file-drop')!;expect(overlay).toBeTruthy();expect(editor.repository.state.revision).toBe(revision);
 drag(overlay,'drop',[new File(['test'],'Paper.pdf')]);expect(host.querySelector('.dialectic-file-drop')).toBeNull();
 await vi.waitFor(()=>expect(c.draft()!.data.attachments).toEqual([a]));expect(upload).toHaveBeenCalledTimes(1);expect(JSON.stringify(original.data)).toBe(originalMetadata);expect(snapshots).not.toHaveBeenCalled();
});
it.each(['escape','dragend','blur','outside-drop','outside-over','leave'])('clears a file-drag overlay on %s without document or upload work',async action=>{
 const {host,editor,c}=await setup(),app=host.querySelector('.dialectic-app')!,upload=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment'),snapshot=vi.spyOn(editor.repository,'snapshot'),revision=editor.repository.state.revision;
 drag(app,'dragover',[],['text/plain']);expect(host.querySelector('.dialectic-file-drop')).toBeNull();
 drag(app,'dragenter');expect(host.querySelector('.dialectic-file-drop')).toBeTruthy();
 if(action==='escape')document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 else if(action==='outside-drop'||action==='outside-over')drag(document.body,action==='outside-drop'?'drop':'dragover');
 else if(action==='leave')drag(app,'dragleave');
 else window.dispatchEvent(new Event(action));
 expect(host.querySelector('.dialectic-file-drop')).toBeNull();expect(c.draft()!.data.attachments).toBeUndefined();expect(editor.repository.state.revision).toBe(revision);expect(upload).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();
});
it('keeps typing available during preparation, blocks premature submission and cancels without changing the draft',async()=>{
 const {c,editor,text}=await setup(),a=file();let release!:(a:Attachment)=>void;
 vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockImplementation(()=>new Promise(resolve=>release=resolve));
 const pending=c.files.attach([new File(['test'],a.name)]);expect(c.files.pending()).toContain(a.name);editor.commands.replaceInlineRange(text().key,0,0,'Typed during preparation');expect(c.submit()).toBeUndefined();expect(c.notice()).toContain('Wait');
 c.files.cancel();release(a);await pending;expect(c.draft()!.data.attachments).toBeUndefined();expect(c.files.pending()).toBe('');expect(text().inlineContent.length).toBeGreaterThan(0);
});
it('rejects stale Vault results and preserves prior attachments when one of multiple files fails',async()=>{
 const {c,editor}=await setup(),a=file();const upload=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockResolvedValue(a);await c.files.attach([new File(['test'],a.name)]);
 upload.mockResolvedValueOnce(file('second.txt')).mockRejectedValueOnce(Error('Invalid PDF'));
 await c.files.attach([new File(['test'],'second.txt'),new File(['test'],'bad.pdf')]);expect(c.draft()!.data.attachments).toEqual([a]);expect(c.notice()).toContain('Invalid PDF');
 upload.mockImplementationOnce(async()=>{editor.setAssetContext(()=>({cavernId:'other',session:'changed'}));return file();});await c.files.attach([new File(['test'],'third.txt')]);expect(c.draft()!.data.attachments).toEqual([a]);expect(c.notice()).toContain('changed');
});
it.each([[true,true],[false,true],[true,false],[false,false]])('carries files and artifacts through streaming=%s with image generation=%s, resend and Undo',async(streaming,imageGeneration)=>{
 const {c,editor}=await setup(true,streaming,imageGeneration),input=file('input.txt'),output={...file('answer.pdf'),origin:'agent' as const,mediaType:'application/pdf'};
 vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockResolvedValue(input);await c.files.attach([new File(['test'],input.name)]);
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 const requests:any[]=[];
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){const details={version:1 as const,adapterVersion:'4c-1' as const,settings:this.settings,attempts:[],cost:{status:'unknown' as const},attachments:[output]};return {details,run:async(request,_sources,_chunk,_signal,validate)=>{requests.push(request);const text='<response><p>Your file is ready.</p></response>';await validate?.(text);return text;},commit:async()=>{},cancel:async()=>{}};});
 await c.submitAndAsk();expect(c.notice()).toBe('');expect(requests[0].attachments).toEqual([input]);expect(requests[0].imageGeneration).toBe(imageGeneration?1:undefined);expect(c.committed().at(-1)!.data.attachments).toEqual([output]);
 editor.repository.undo();expect(c.committed()).toHaveLength(1);editor.repository.redo();expect(c.committed().at(-1)!.data.attachments).toEqual([output]);
 await c.resend(c.committed()[0].id);expect(c.notice()).toBe('');expect(requests[1].attachments[0].asset).toEqual(input.asset);expect(requests[1].attachments[0].id).not.toBe(input.id);
});
it.each([true,false])('persists exact artifact failures with streaming=%s and preserves them through Undo/Redo',async(streaming)=>{
 const {c,editor,text,port}=await setup(true,streaming),error='OpenAI image generation failed (HTTP 400, moderation_blocked).';
 editor.commands.replaceInlineRange(text().key,0,0,'Show historical portraits');
 const save=vi.spyOn(port.application.files!,'save'),saveSubmitted=vi.spyOn(port.application.files!,'saveSubmitted');
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){
  const details:import('./dcp/provider-contract').LiveProvenance={version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[{receipt:{provider:'openai',model:'fixture',startedUtc:'',completedUtc:'',usage:null,stop:'completed',cost:{status:'unknown'}},toolCalls:[],toolResultIds:['image'],artifactResults:[{id:'image',tool:'generate_image',status:'failed',error}]}],cost:{status:'unknown'}};
  return {details,run:async(request,_sources,_chunk,_signal,validate)=>{expect(request.authorityLookup).toBe(1);const response='<response><p>The image could not be produced.</p></response>';await validate?.(response);return response;},commit:async()=>{},cancel:async()=>{}};
 });
 await c.submitAndAsk();expect(c.notice()).toBe('');expect(c.committed().at(-1)!.data.notices?.[0].detail).toContain(error);
 editor.repository.undo();expect(c.committed()).toHaveLength(1);editor.repository.redo();expect(c.committed().at(-1)!.data.notices?.[0].detail).toContain(error);
 const saved=decodeNative(nativeBytes(captureNative(editor.repository.readState(),c.resourceId())));expect(JSON.stringify(saved)).toContain(error);expect(save).not.toHaveBeenCalled();expect(saveSubmitted).not.toHaveBeenCalled();
});
it('hides attachment controls and rejects attachment mutations when disabled',async()=>{
 const {c,host}=await setup(false),upload=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment');expect(host.querySelector('[aria-label="Choose attachments"]')).toBeNull();await c.files.attach([new File(['test'],'x.txt')]);expect(c.notice()).toContain('disabled');expect(upload).not.toHaveBeenCalled();
 expect(()=>attachments([file(),file(),...Array.from({length:7},()=>file())])).toThrow();
});
it('pins the original Vault header even if the active Vault changes while connecting to the broker',async()=>{
 let scope={cavernId:'original',session:'original-session'},connect!:(r:Response)=>void;
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}')).mockImplementationOnce(()=>new Promise(resolve=>connect=resolve)).mockResolvedValueOnce(new Response(JSON.stringify({error:'stale session'}),{status:400}));vi.stubGlobal('fetch',fetcher);
 const provider=new DialecticProviderSession(false,()=>scope);cleanup.push(()=>provider.dispose());
 const work=provider.uploadAttachment(new File(['test'],'note.txt'),new AbortController().signal);scope={cavernId:'other',session:'other-session'};connect(new Response(JSON.stringify({token:'local-session'})));
 await expect(work).rejects.toThrow('stale session');expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('X-Mutable-Cavern')).toBe('original-session');
});
const sizedFile=(name:string,size:number)=>{const f=new File(['fixture'],name);Object.defineProperty(f,'size',{value:size});return f;};
it('asks before a large upload, shows its name/size, and sends nothing until explicit confirmation',async()=>{
 const {c,host,editor,text}=await setup(),a={...file('Large paper.pdf'),byteLength:12000000,mediaType:'application/pdf'},upload=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockResolvedValue(a),revision=editor.repository.state.revision;
 const task=c.files.attach([sizedFile(a.name,a.byteLength)]);expect(upload).not.toHaveBeenCalled();expect(c.files.confirmation()?.bytes).toBe(12000000);
 const status=host.querySelector('[aria-label="Draft attachment status"]')!;expect(status.textContent).toContain('0 attachments ready');expect(status.textContent).toContain('Large paper.pdf');expect(status.textContent).toContain('12.00 MB');
 expect(editor.repository.state.revision).toBe(revision);expect(c.submit()).toBeUndefined();editor.commands.replaceInlineRange(text().key,0,0,'Please summarise');
 [...status.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Proceed with large upload')!.click();await task;
 expect(upload).toHaveBeenCalledTimes(1);expect(c.draft()!.data.attachments).toEqual([a]);expect(status.textContent).toContain('1 attachment ready');expect(c.files.confirmation()).toBeUndefined();
});
it('cancels large uploads without network or document changes and rejects stale confirmations',async()=>{
 const {c,editor}=await setup(),upload=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment'),revision=editor.repository.state.revision;
 const task=c.files.attach([sizedFile('Large.pdf',40000000)]);expect(c.files.confirmation()).toBeTruthy();c.files.cancel();await task;
 expect(upload).not.toHaveBeenCalled();expect(editor.repository.state.revision).toBe(revision);expect(c.files.pending()).toBe('');expect(c.files.failure()).toBeUndefined();
 const stale=c.files.attach([sizedFile('Large.pdf',12000000)]);editor.setAssetContext(()=>({cavernId:'other',session:'changed'}));c.files.confirm();await stale;expect(upload).not.toHaveBeenCalled();expect(c.draft()!.data.attachments).toBeUndefined();expect(c.files.failure()?.message).toContain('changed');
});
it('keeps rejected filenames visible and blocks accidental text-only submission until the failed selection is removed',async()=>{
 const {c,host,editor,text}=await setup(),upload=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment');editor.commands.replaceInlineRange(text().key,0,0,'Summarise this PDF');
 await c.files.attach([sizedFile('Too large.pdf',attachmentLimits.fileBytes+1)]);expect(upload).not.toHaveBeenCalled();expect(c.files.confirmation()).toBeUndefined();
 const status=host.querySelector('[aria-label="Draft attachment status"]')!;expect(status.textContent).toContain('Not attached');expect(status.textContent).toContain('Too large.pdf');expect(status.textContent).toContain('100 MB');expect(status.textContent).toContain('0 attachments ready');
 expect(host.querySelector<HTMLButtonElement>('[aria-label="Submit contribution"]')!.disabled).toBe(true);expect(c.submit()).toBeUndefined();expect(c.committed()).toHaveLength(0);
 [...status.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Remove failed selection')!.click();expect(c.submit()).toBeTruthy();
});
it('enforces the selected provider limit before upload and accepts a confirmed PDF below it',async()=>{
 const {c,host}=await setup(),a={...file('Large.pdf'),mediaType:'application/pdf',byteLength:40000000},upload=vi.spyOn(DialecticProviderSession.prototype,'uploadAttachment').mockResolvedValue(a);
 await c.files.attach([sizedFile('Too large for OpenAI.pdf',60000000)]);expect(upload).not.toHaveBeenCalled();expect(c.files.confirmation()).toBeUndefined();expect(c.files.failure()?.message).toContain('50 MB');expect(host.textContent).toContain('Not attached');
 const pending=c.files.attach([sizedFile(a.name,a.byteLength)]);c.files.confirm();await pending;expect(c.draft()!.data.attachments).toEqual([a]);expect(c.fileProblem()).toBeUndefined();expect(c.files.failure()).toBeUndefined();
});
