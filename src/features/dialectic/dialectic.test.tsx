import {pdfBlock} from '../../pdf/block';
import {pdfCaptureFixture} from '../../pdf/fixtures';
import {prepareImage,prepareVideoReference,prepareWebsiteEmbed} from '../../block-tree/media-authoring';
import {managedImageBlock} from '../../interchange/resource-url';
import {timerBlockDto} from '../timer/model';
import {objectDto} from '../three-d-object/model';
import {prepareStickyNote} from '../../block-tree/note-authoring';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {prepareList,prepareLayout} from '../../block-tree/layout-authoring';
import {toggleTask} from '../../runtime/tasks';
import {blockMenuItems} from '../../runtime/block-menu-actions';
import {headingProperty,prepareGrid,prepareHeading} from '../../block-tree/native-authoring';
import {registerStandaloneEntityService} from '../../application/entity-service';
import {documentContextInventory} from '../../interchange/package/document-context';
import {ScopedEntities} from '../../application/scoped-entities';
import {LOCAL_ENTITY,LOCAL_ENTITY_RELATION,ENTITY_REFERENCE} from '../../feature-api/scoped-entities';
import {ARGUMENT,ARGUMENT_RELATION} from './arguments';
import {emptySemanticFields} from './dcp/empty-fields';
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {applicationPresentations} from '../../application/application-presentations';
import {nativeDocumentSession} from '../../persistence/native-session';
import {watchDocumentEntities} from '../../application/document-entity-changes';
import {liveDocumentEntities} from '../../application/live-document-entities';
import * as resourceIdentity from '../../block-tree/resource-identity';
import {captureBlocks,cloneBlocks} from '../../block-tree/clipboard';
import {serializeSelection} from '../../interchange/serializer';
import {materializeFragment} from '../../interchange/materialize';
import {captureNative,nativeBytes,decodeNative,admitNative,nativeText} from '../../persistence/native-resource';
import {createDialecticController} from './controller';
import {dialecticApplication} from './index';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
async function setup(enabled=true,registry=true,dcp=true,semantics=false,protection=false,logging=false,catalogue=true,nativeAuthoring=false,textAuthoring=false,literalFeatures=true,layoutAuthoring=false,tasks=true,compoundAuthoring=false,compoundFeatures=true,widgetAuthoring=false,widgetFeatures=true,managedImageAuthoring=false,externalMediaAuthoring=false,externalNativeFeatures=true,retainedPdfAuthoring=false,pdfFeatures=true,vocabulary=true,activity=true,conversationUpdates=false,xmlAuthoring=false){
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Test has no vault'}),{headers:{'Content-Type':'application/json'}})));
 if(widgetAuthoring){vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}});vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));}
 const session=new WorkspaceSession(materializeLocalWorkspace({id:'workspace',type:'workspace-block',children:[]}),{features:{dcpXmlAuthoring:xmlAuthoring,dialecticAutomaticTitles:false,dialecticConversationUpdates:conversationUpdates,dialecticContributionActivity:activity,dcpVocabularySelection:vocabulary,dcpNativeAuthoringStage3RetainedPdf:retainedPdfAuthoring,crossResourceLoaders:pdfFeatures,resourceUrlPaste:externalNativeFeatures,dcpNativeAuthoringStage3ExternalMedia:externalMediaAuthoring,dcpNativeAuthoringStage3ManagedImages:managedImageAuthoring,dcpNativeAuthoringStage2Widgets:widgetAuthoring,timer:widgetFeatures,threeDObjects:widgetFeatures,dcpNativeAuthoringStage2Compounds:compoundAuthoring,reversibleBlocks:compoundFeatures,verticalTabs:compoundFeatures,taskLists:tasks,dcpNativeAuthoringStage2Layouts:layoutAuthoring,documentInterchange:literalFeatures&&externalNativeFeatures,standoffCodeHighlighting:literalFeatures,dcpNativeAuthoringStage2Text:textAuthoring,dcpNativeAuthoringStage1:nativeAuthoring,dcpCapabilityCatalogue:catalogue,dcpTestPhaseLogging:logging,dialecticProviderContinuity:false,nativeTextProtection:protection,dialectic:enabled,dialecticDcp:dcp,scopedSemantics:semantics,applicationPresentations:registry,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
 const editor=session.editor;cleanup.push(()=>session.dispose());
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><WorkspacePresentationView session={session}/>,host));
 if(!enabled)return {session,editor,host};
 await editor.commandRegistry.execute('dialectic.open',{targetKey:session.projection.state.rootKey,args:undefined});await tick();
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!;
 expect(port?.session()).toBeTruthy();
 const c=createRoot(dispose=>{cleanup.push(dispose);return createDialecticController(editor,()=>port);});cleanup.push(()=>c.dispose());
 // Stage qualification explicitly opts into the compatibility vocabulary.
 if(nativeAuthoring&&vocabulary)c.configureVocabulary({profile:'all-qualified'});
 const text=()=>port.session()!.projection.node(c.resolve(c.target(c.draft()!.id))!.children[0])!;
 const type=(s:string)=>editor.commands.replaceInlineRange(text().key,0,0,s);
 return {session,editor,host,port,c,text,type};
}
it('registers a real Desktop/Textual application and leaves Flint launch ownership intact',async()=>{
 const f=await setup();const r=applicationPresentations(f.editor);
 expect(r.resolve(dialecticApplication,'desktop',f.port!).status).toBe('ready');
 expect(r.resolve(dialecticApplication,'textual',f.port!).status).toBe('ready');
 expect(f.editor.commandRegistry.owner('flint.open')).not.toBe(f.editor.commandRegistry.owner('dialectic.open'));
 expect(f.host.querySelector('.dialectic-app')).toBeTruthy();expect(f.host.querySelector('.reactive-standoff-flow')).toBeTruthy();
});
it('is disabled by its feature flag, and works with the presentation-registry fallback',async()=>{
 const off=await setup(false);expect(off.editor.commandRegistry.owner('dialectic.open')).toBeUndefined();
 const f=await setup(true,false);expect(f.host.querySelector('.dialectic-app')).toBeTruthy();f.type!('Fallback');f.c!.submit();expect(f.c!.committed()).toHaveLength(1);
});
it('submits native compositions without snapshots, keeps identities, history and a cheap typing path',async()=>{
 const f=await setup(),c=f.c!,editor=f.editor,node=f.text!(),mount=editor.mounts.get(node.key);
 const native=nativeDocumentSession(editor);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'conversation.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const snapshots=vi.spyOn(editor.repository,'snapshot'),rebuild=vi.spyOn(c.session()!.projection as any,'build'),builds=c.diagnostics.rowBuilds;
 f.type!('A rich beginning');expect(c.diagnostics.rowBuilds).toBe(builds);expect(snapshots).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();
 const id=c.draft()!.id;c.submit();expect(c.notice()).toBe('');expect(c.committed().map(r=>[r.id,r.data.ordinal])).toEqual([[id,1]]);
 expect(editor.mounts.get(node.key)).toBe(mount);expect(native.isDirty(c.resourceId())).toBe(true);expect(snapshots).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();
 editor.repository.undo();expect(c.committed()).toHaveLength(0);expect(c.draft()!.id).toBe(id);
 editor.repository.redo();expect(c.committed()[0].id).toBe(id);expect(editor.mounts.get(node.key)).toBe(mount);
 const saved=captureNative(editor.repository.readState(),c.resourceId());expect(Object.values(saved.contents).filter(c=>c.viewType==='text-cell').map(c=>c.payload.text).join('')).toContain('A rich beginning');expect(JSON.stringify(saved)).toContain('"ordinal":1');
});
it('keeps chronology, inspection, reply target and selected context separate',async()=>{
 const f=await setup(),c=f.c!;f.type!('First');c.submit();const first=c.target(c.committed()[0].id);
 f.type!('Second');c.submit();c.inspect(first);c.pin(first);c.setReply(first);c.present();
 expect(c.inspection()?.blockId).toBe(c.frontier()!.id);expect(c.reply()).toEqual(first);expect(c.context()).toEqual([first]);
 f.type!('A later reply to the first');c.submit();expect(c.committed().map(r=>r.data.ordinal)).toEqual([1,2,3]);expect(c.frontier()!.data.replies).toEqual([first]);
 const n=c.resolve(first)!,text=c.session()!.projection.node(n.children[0])!;f.editor.commands.replaceInlineRange(text.key,0,0,'Edited ');
 expect(c.committed()[0].data.ordinal).toBe(1);expect(c.committed()[0].id).toBe(first.blockId);
 c.navigate(-1);expect(c.context()).toEqual([first]);
});
it('makes one undoable mock composition and rejects stale, cancelled and missing context',async()=>{
 const f=await setup(),c=f.c!;f.type!('One');c.submit();const first=c.target(c.frontier()!.id);c.pin(first);
 const snapshots=vi.spyOn(f.editor.repository,'snapshot');await c.askMock();expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const generated=c.resolve(c.target(c.frontier()!.id))!;expect(generated.children.some(k=>c.session()!.projection.node(k)?.viewType==='table-block')).toBe(true);expect(snapshots).not.toHaveBeenCalled();
 f.editor.repository.undo();expect(c.committed()).toHaveLength(1);f.editor.repository.redo();expect(c.committed()).toHaveLength(2);
 c.inspect(first);const stale=c.askMock();const t=c.session()!.projection.node(c.resolve(first)!.children[0])!;f.editor.commands.replaceInlineRange(t.key,0,0,'Changed');await stale;expect(c.notice()).toContain('context changed');expect(c.committed()).toHaveLength(2);
 const pending=c.askMock();c.cancel();await pending;expect(c.committed()).toHaveLength(2);expect(c.busy()).toBe(false);
 c.pin({kind:'block',resourceId:c.resourceId(),blockId:'missing'});await c.askMock();expect(c.notice()).toContain('unavailable');expect(c.context()).toHaveLength(2);
});
it('keeps context per conversation and rejects empty drafts and self-replies',async()=>{
 const f=await setup(),c=f.c!;c.submit();expect(c.notice()).toContain('Write a contribution');
 f.type!('First conversation');c.setReply(c.target(c.draft()!.id));c.submit();expect(c.notice()).toContain('before replying');c.setReply(undefined);c.submit();
 const firstId=c.resourceId(),target=c.target(c.frontier()!.id);c.pin(target);c.inspect(target);c.setReply(target);
 [...f.host.querySelectorAll<HTMLButtonElement>('.dialectic-app button')].find(b=>b.textContent==='Add Conversation')!.click();await tick();
 expect(c.resourceId()).not.toBe(firstId);expect(c.valid()).toBe(true);expect(c.context()).toHaveLength(0);expect(c.reply()).toBeUndefined();
 f.port!.application.openDocument(firstId);await tick();expect(c.context()).toEqual([target]);expect(c.reply()).toEqual(target);expect(c.inspection()).toEqual(target);
});
it('keeps unrelated annotated Documents outside typing and submission work',async()=>{
 const f=await setup(),c=f.c!,state=f.editor.repository.readState();
 const bank=state.contents[state.placements[state.rootPlacementKey].contentKey].children.find(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block')!;
 f.editor.commands.insert({id:'unrelated',type:'document-block',metadata:{documentId:'unrelated',title:'Unrelated'},children:[{id:'large-text',type:'standoff-editor-block',text:'annotated passage '.repeat(600),standoffProperties:[{id:'unrelated-bold',type:'style/bold',start:0,end:50}]}]},{kind:'at',parentKey:bank,index:1});
 const other=Object.values(f.editor.repository.readState().contents).find(c=>c.payload.id==='large-text')!;
 const revisions=other.revision,builds=c.diagnostics.rowBuilds,snapshots=vi.spyOn(f.editor.repository,'snapshot');
 f.type!('Independent typing');expect(c.diagnostics.rowBuilds).toBe(builds);c.submit();expect(c.committed()).toHaveLength(1);expect(snapshots).not.toHaveBeenCalled();
 expect(f.editor.repository.readState().contents[other.key]).toBe(other);expect(other.revision).toBe(revisions);
});

it('commits a range with its reply atomically, retains editor/Cell identity and incrementally rebases it',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();
 const mount=e.mounts.get(source.key),cells=[...source.inlineContent],revision=e.repository.state.revision;
 c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));const t=c.reply()!;
 expect(e.repository.state.revision).toBe(revision);expect(c.resolveReference(t).text).toBe('beta');
 f.type!('Reply to beta');const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');c.submit();
 expect(c.notice()).toBe('');expect(c.frontier()!.data.replyExcerpts?.[0].text).toBe('beta');expect(c.resolveReference(t).status).toBe('resolved');
 expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(e.mounts.get(source.key)).toBe(mount);expect(source.inlineContent).toEqual(cells);
 e.repository.undo();expect(c.resolveReference(t).status).toBe('missing');expect(c.committed()).toHaveLength(1);
 e.repository.redo();expect(c.resolveReference(t).text).toBe('beta');expect(c.committed()).toHaveLength(2);
 const notify=vi.fn(),watch=watchDocumentEntities(e,source.key,notify),inventory=liveDocumentEntities(e,c.root()!.contentKey);cleanup.push(watch.dispose,()=>inventory.dispose());await tick();notify.mockClear();
 const index=c.references()!,counts={...index.diagnostics},owners=vi.spyOn(resourceIdentity,'resourceOwner');
 e.commands.replaceInlineRange(source.key,7,7,'X');expect(c.resolveReference(t)).toMatchObject({text:'bXeta',historical:'beta',changed:true});
 await tick();expect(notify).not.toHaveBeenCalled();expect(inventory.read().rows).toHaveLength(0);expect(owners).not.toHaveBeenCalled();expect(index.diagnostics.treeVisits).toBe(counts.treeVisits);expect(index.diagnostics.propertyReads-counts.propertyReads).toBe(1);expect(index.diagnostics.recordUpdates-counts.recordUpdates).toBe(1);
 expect(c.frontier()!.data.replyExcerpts?.[0].text).toBe('beta');expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const saved=captureNative(e.repository.readState(),c.resourceId());expect(JSON.stringify(decodeNative(nativeBytes(saved)))).toContain('dialectic/range-anchor');
});

it('follows split/join, keeps an orphan excerpt, and explicitly reattaches with Undo',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));const t=c.reply()!;f.type!('Reply');c.submit();
 const right=e.commands.splitStandoff(source.key,8);expect(c.resolveReference(t).segments).toHaveLength(2);expect(c.resolveReference(t).text).toBe('be\nta');
 e.commands.joinStandoff(source.key,right);expect(c.resolveReference(t).text).toBe('beta');
 e.commands.replaceInlineRange(source.key,6,10,'');expect(c.resolveReference(t)).toMatchObject({status:'unanchored',historical:'beta'});
 e.repository.undo();expect(c.resolveReference(t).text).toBe('beta');e.repository.redo();
 c.reattach(t,e.textRanges.snapshot(source.key,0,5));expect(c.notice()).toBe('');expect(c.resolveReference(t)).toMatchObject({text:'Alpha',historical:'beta',changed:true});
 expect(c.frontier()!.data.replyExcerpts?.[0].text).toBe('beta');e.repository.undo();expect(c.resolveReference(t).status).toBe('unanchored');
 e.repository.redo();expect(c.resolveReference(t).text).toBe('Alpha');
});

it('does not author stale/cancelled selections and records precisely supplied range and Gloss context',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();
 c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));e.commands.replaceInlineRange(source.key,0,0,'!');f.type!('Reply');c.submit();expect(c.notice()).toContain('unavailable');expect(c.committed()).toHaveLength(1);
 c.selectRange('reply',e.textRanges.snapshot(source.key,7,11));const t=c.reply()!;c.pin(t);
 const revision=e.repository.state.revision,pending=c.askMock();c.cancel();await pending;expect(e.repository.state.revision).toBe(revision);
 expect(e.gloss.open(source.key,{anchor:7,head:11})).toBe(true);expect(e.gloss.commit('entity: Beta')).toBe(true);
 const id=Object.keys(c.root()!.payload.linkedAnnotations as any)[0];c.pinGloss(id);
 // Gloss authoring may change the snapshot revision; explicitly select again.
 c.selectRange('reply',e.textRanges.snapshot(source.key,7,11));c.unpin(t);c.pin(c.reply()!);
 await c.askMock();expect(c.notice()).toBe('');const manifest=c.frontier()!.data.consumedContext!;
 expect(manifest.items.map(i=>i.text)).toEqual(['beta','entity: Beta']);expect(manifest.items[0].origins).toEqual(['reply-target','selected']);
 e.commands.replaceInlineRange(source.key,8,8,'X');expect(manifest.items[0].text).toBe('beta');expect(c.frontier()!.data.replyExcerpts?.[0].text).toBe('beta');
});


it('copies ordinary anchored compositions through both paths and rejects wrappers before mutation',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));const t=c.reply()!;f.type!('Reply');c.submit();
 const revision=e.repository.state.revision,state=e.repository.readState();
 const native=cloneBlocks(captureBlocks(state,[source.placementKey]));
 const sliced=materializeFragment(serializeSelection(state,[{placementKey:source.placementKey,start:7,end:9}],{resourceId:c.resourceId()}),{resourceId:c.resourceId()});
 for(const fragment of [native,sliced]){
  const text=fragment.state.contents[fragment.state.placements[fragment.roots[0]].contentKey],p=(text.payload.standoffProperties as any[])[0];
  expect(p.type).toBe('dialectic/range-anchor');expect(p.annotationId).not.toBe(t.anchorId);expect(fragment.linkedAnnotations?.[p.annotationId].metadata).toBeTruthy();
  expect(text.payload.id).not.toBe(source.payload.id);
 }
 const wrapper=c.resolve(c.target(c.frontier()!.id))!;
 expect(()=>cloneBlocks(captureBlocks(state,[wrapper.placementKey]))).toThrow('content Blocks');
 expect(()=>materializeFragment(serializeSelection(state,[{placementKey:wrapper.placementKey}],{resourceId:c.resourceId()}))).toThrow('content Blocks');
 expect(()=>(e.clipboard as any).write({slices:[{placementKey:wrapper.placementKey}],scope:{}},true)).toThrow('content Blocks');
 expect(e.repository.state.revision).toBe(revision);
 const placement=e.commands.insertFragment(native,{kind:'at',parentKey:c.resolve(c.target(c.draft()!.id))!.key,index:1})[0];
 const copied=c.session()!.projection.nodeForPlacement(placement)!;
 const p=(copied.payload.standoffProperties as any[])[0];expect(c.resolveReference({kind:'range',resourceId:c.resourceId(),anchorId:p.annotationId}).text).toBe('beta');
 expect(c.resolveReference(t).text).toBe('beta');
});

it('rejects stale async range context and leaves cancelled anchors unauthored',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));
 const pending=c.askMock();e.commands.replaceInlineRange(source.key,7,7,'X');await pending;
 expect(c.notice()).toContain('context changed');expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 expect(c.resolveReference({...c.reply()!,resourceId:'foreign'}).status).not.toBe('resolved');
});

it('uses a persisted reactive reply descriptor after history replay without leaking proxies into authoring',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));f.type!('Reply');c.submit();e.repository.undo();e.repository.redo();
 c.inspect(c.frontier()!.data.replies[0]);await c.askMock();expect(c.notice()).toBe('');expect(c.frontier()!.data.consumedContext?.items[0].text).toBe('beta');
});

it('anchors nested table content with shared occurrences without rebuilding either editor',async()=>{
 const f=await setup(),c=f.c!,e=f.editor;
 const wrapper=c.resolve(c.target(c.draft()!.id))!;
 e.commands.insert({id:'nested-table',type:'table-block',children:[{type:'table-row-block',children:[{type:'table-cell-block',children:[{id:'nested-source',type:'standoff-editor-block',text:'Nested source',standoffProperties:[{id:'bold-source',type:'style/bold',start:0,end:5}]}]}]}]},{kind:'at',parentKey:wrapper.key,index:1});c.submit();
 let source=Object.values(c.session()!.projection.state.nodes).find(n=>n.payload.id==='nested-source')!;
 e.commands.transclude(source.key,{kind:'at',parentKey:wrapper.key,index:2});
 source=c.session()!.projection.nodesForContent(source.contentKey)[0];const occurrences=c.session()!.projection.nodesForContent(source.contentKey),mounts=occurrences.map(n=>e.mounts.get(n.key)),cells=occurrences.map(n=>[...n.inlineContent]);
 expect(occurrences).toHaveLength(2);c.selectRange('reply',e.textRanges.snapshot(source.key,0,6));const t=c.reply()!;f.type!('Nested reply');
 const build=vi.spyOn(c.session()!.projection as any,'build'),snapshots=vi.spyOn(e.repository,'snapshot');c.submit();expect(c.notice()).toBe('');
 expect(c.resolveReference(t).segments).toHaveLength(1);expect(c.resolveReference(t).text).toBe('Nested');expect(build).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();
 occurrences.forEach((n,i)=>{expect(e.mounts.get(n.key)).toBe(mounts[i]);expect(n.inlineContent).toEqual(cells[i]);expect((n.payload.standoffProperties as any[])[0]).toMatchObject({id:'bold-source',type:'style/bold'});});
 e.repository.undo();e.repository.redo();expect(c.resolveReference(t).segments).toHaveLength(1);expect(build).not.toHaveBeenCalled();
});

it('rejects oversized supplied context before reading its complete text',async()=>{
 const f=await setup(),c=f.c!;f.type!('x'.repeat(6000));c.submit();
 const read=vi.spyOn(c.references()!,'text'),revision=f.editor.repository.state.revision;
 await c.askMock();expect(c.notice()).toContain('6,000 characters');expect(read).not.toHaveBeenCalled();expect(f.editor.repository.state.revision).toBe(revision);
});
it('authors Sequence metadata locally with Undo, native persistence and unchanged chronology',async()=>{
 const f=await setup(),c=f.c!,editor=f.editor;f.type!('First perspective');c.submit();f.type!('Second perspective');c.submit();
 const order=c.committed().map(r=>r.id),s=c.sequences,source=c.committed()[0],mount=editor.mounts.get(source.key)!.root;
 const native=nativeDocumentSession(editor);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'sequence.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const snapshot=vi.spyOn(editor.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 const refs={...c.references()!.diagnostics};s.create();const g=s.draft()!.groups[0].id;s.add(g,c.target(order[0]));s.add(g,c.target(order[1]));s.save();
 expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(c.references()!.diagnostics).toEqual(refs);expect(s.saved()).toHaveLength(1);expect(native.isDirty(c.resourceId())).toBe(true);expect(c.committed().map(r=>r.id)).toEqual(order);expect(editor.mounts.get(source.key)!.root).toBe(mount);
 const saved=captureNative(editor.repository.readState(),c.resourceId());expect(JSON.stringify(saved)).toContain('New Sequence');
 editor.repository.undo();expect(s.saved()).toHaveLength(0);editor.repository.redo();expect(s.saved()).toHaveLength(1);expect(snapshot).not.toHaveBeenCalled();
});
it('keeps Sequence navigation/reveal and repeated-member state out of canonical history/context',async()=>{
 const f=await setup(),c=f.c!,editor=f.editor;f.type!('Evidence');c.submit();const s=c.sequences,t=c.target(c.committed()[0].id);s.create();const g=s.draft()!.groups[0].id;s.add(g,t);s.add(g,t);s.change(d=>{d.groups[0].presentation={reveal:'in-order'};d.groups.push({id:crypto.randomUUID(),title:'Alternative',members:[]});});s.save();
 const seq=s.saved()[0],members=seq.groups[0].members,before=editor.repository.state.revision;
 s.duplicate(seq.id);expect(s.draft()!.id).not.toBe(seq.id);expect(s.draft()!.groups[0].id).not.toBe(seq.groups[0].id);expect(s.draft()!.groups[0].members[0].id).not.toBe(members[0].id);expect(s.draft()!.groups[0].members[0].source).toEqual(members[0].source);s.cancel();
 s.present(seq.id);expect(s.visible(members[0].id)).toBe(true);expect(s.visible(members[1].id)).toBe(false);s.show(members[1].id);expect(s.visible(members[1].id)).toBe(true);s.reset();expect(s.visible(members[1].id)).toBe(false);s.reveal();expect(s.visible(members[1].id)).toBe(true);
 expect(s.memberState(members[0].id)).not.toBe(s.memberState(members[1].id));expect(c.context()).toEqual([]);expect(c.reply()).toBeUndefined();s.chooseGroup(seq.groups[1].id);expect(s.group()!.id).toBe(seq.groups[1].id);s.chooseGroup(seq.groups[0].id);expect(s.visible(members[1].id)).toBe(true);s.leave(false);expect(editor.repository.state.revision).toBe(before);
 editor.commands.remove(c.resolve(t)!.key);expect(c.resolve(t)).toBeUndefined();expect(s.saved()[0].groups[0].members).toHaveLength(2);editor.repository.undo();expect(c.resolve(t)).toBeTruthy();
});

function dcpResponse(exchange:string){return {protocol:'dcp/1.0',kind:'contribution',exchange,intent:'qualify',replyTargets:[] as string[],composition:[{id:'p',kind:'paragraph',markup:'<annotation type="dialectic/claim" id="generated">A😀</annotation>',ranges:[]}],anchors:[] as any[],entities:[],interpretations:[] as any[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]};}
it('catalogue discovery shares retrieval budgets and prepares native tables, groups, exact anchors and Glosses',async()=>{
 const f=await setup(true,true,true,true,false,false,true),c=f.c!,e=f.editor;
 f.type!('Historical objects preserve evidence.');c.submit();
 const snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(request,sources)=>{
  expect(request.capabilities.version).toBe(1);expect(request.legend.tools).toContain('describe_capabilities');
  expect(request.authoring.instructions).toContain('communicative purpose');expect(request.budgets.calls).toBe(6);
  const before={...sources.diagnostics},handles=sources.handles.size,fences=sources.fences.size,revision=e.repository.state.revision;
  const details=await sources.tool({id:'capabilities',tool:'describe_capabilities',arguments:{ids:['composition.table','composition.group','source.anchor','semantic.gloss']}});
  expect(details.status).toBe('complete');expect(details.items.every((i:any)=>i.authorable)).toBe(true);
  expect(sources.diagnostics).toEqual(before);expect(sources.handles.size).toBe(handles);expect(sources.fences.size).toBe(fences);expect(e.repository.state.revision).toBe(revision);
  const source=request.structuralContext.sources.find((s:any)=>s.nativeType==='standoff-editor-block');
  const v:any=dcpResponse(request.exchange);
  v.composition=[{id:'new:b1',kind:'group',children:[{id:'new:b2',kind:'table',rows:[[[{id:'new:b3',kind:'paragraph',markup:'Material evidence',ranges:[]}]],[[{id:'new:b4',kind:'paragraph',markup:'Historical interpretation',ranges:[]}]]]}]}];
  v.anchors=[{id:'new:r1',source:source.handle,revision:source.revision,selector:{exact:'Historical objects',prefix:'',suffix:''}}];
  v.glosses=[{id:'new:g1',target:'new:r1',type:'commentary',text:'The object provides evidence, while its interpretation depends on context.'}];
  v.replyTargets=['new:r1'];
  for(let i=0;i<5;i++)await sources.tool({id:'remaining-'+i,tool:i===0?'read_source':'describe_capabilities',arguments:i===0?{handle:source.handle}:{ids:['media.image','media.youtube','composition.card-grid','composition.markdown-fallback']}});
  await expect(sources.tool({id:'seventh',tool:'describe_capabilities',arguments:{ids:['composition.table']}})).rejects.toThrow('tool-call budget');
  return JSON.stringify(v);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const data=c.frontier()!.data,group=c.session()!.projection.node(c.resolve(c.target(c.frontier()!.id))!.children[0])!;
 expect(group.viewType).toBe('container-block');expect(c.session()!.projection.node(group.children[0])!.viewType).toBe('table-block');
 expect(c.resolveReference(data.discursiveReferences![0]).text).toBe('Historical objects');
 expect(Object.values(c.root()!.payload.linkedAnnotations??{}).filter((d:any)=>d.type==='mutable/gloss')).toHaveLength(1);
 expect(data.dcp!.tools).toHaveLength(6);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const lookups=vi.spyOn(e.registry,'resolve'),before={...c.dcpDiagnostics};f.type!('Draft typing');
 expect(c.dcpDiagnostics).toEqual(before);expect(lookups.mock.calls.some(([type])=>type==='table-cell-block'||type==='youtube-video-block')).toBe(false);
});
it('omits catalogue when disabled and rejects unsupported media even with discovery enabled',async()=>{
 const f=await setup(true,true,true,false,false,false,false),c=f.c!;f.type!('A request');c.submit();
 await c.askMock(async(request,sources)=>{
  expect(request.capabilities).toBeUndefined();expect(request.legend.tools).not.toContain('describe_capabilities');
  await expect(sources.tool({id:'disabled',tool:'describe_capabilities',arguments:{ids:['composition.table']}})).rejects.toThrow('Unavailable');
  return JSON.stringify(dcpResponse(request.exchange));
 });expect(c.notice()).toBe('');
 const enabled=await setup(true,true,true,true,false,false,true),d=enabled.c!;enabled.type!('Show an image');d.submit();
 const revision=enabled.editor.repository.state.revision;
 for(const kind of ['image','grid','markdown-fallback']){
  await d.askMock(async request=>JSON.stringify({...dcpResponse(request.exchange),composition:[{id:'new:b1',kind}]}));
  expect(d.notice()).toContain('Unsupported DCP Block');expect(enabled.editor.repository.state.revision).toBe(revision);
 }
});
it('admits negotiated empty-field omission with aliases and preserves raw diagnostics, Undo/Redo and native persistence',async()=>{
 const f=await setup(),c=f.c!,e=f.editor;f.type!('Discuss the evidence');c.submit();
 const snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');let raw='';
 await c.askMock(async request=>{
  expect(request.authoring.emptySemanticFields).toBe(1);expect(request.protocolKey.text).toBeTruthy();expect(request.authoring.instructions).toContain('INLINE ALIASES');
  const value:any=dcpResponse(request.exchange);value.composition=[{id:'new:b1',kind:'paragraph',markup:'<b>Evidence</b> needs <i>context</i>.',ranges:[]}];
  for(const field of emptySemanticFields(request.vocabulary))delete value[field];raw=JSON.stringify(value);return raw;
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const data=c.frontier()!.data,root=c.resolve(c.target(c.frontier()!.id))!,text=c.session()!.projection.node(root.children[0])!;
 expect((text.payload.standoffProperties as any[]).map(p=>[p.type,p.start,p.end])).toEqual([['style/bold',0,7],['style/italics',15,21]]);
 expect(data.dcp!.response).toBe(raw);expect(JSON.parse(raw)).not.toHaveProperty('suggestions');expect(data.dcp!.request).toMatchObject({authoring:{emptySemanticFields:1,examples:expect.arrayContaining([expect.objectContaining({name:'rich-text'})])}});
 e.repository.undo();expect(c.committed()).toHaveLength(1);e.repository.redo();expect(c.committed()).toHaveLength(2);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const saved=decodeNative(nativeBytes(captureNative(e.repository.readState(),c.resourceId()))),serialized=JSON.stringify(saved);expect(serialized).toContain('style/bold');expect(serialized).toContain('emptySemanticFields');expect(serialized).toContain('INLINE ALIASES');
 const revision=e.repository.state.revision;
 await c.askMock(async request=>{const value:any=dcpResponse(request.exchange);value.composition[0].markup='<b>valid</b><e ref="src:foreign:e1">invalid</e>';for(const field of emptySemanticFields(request.vocabulary))delete value[field];return JSON.stringify(value)});
 expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);expect(c.committed()).toHaveLength(2);
});
it('materialises DCP atomically with independent reply/discursive references and AI provenance',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,n=f.text!();f.type!('Alpha beta gamma');c.submit();const primary=c.target(c.frontier()!.id),mount=e.mounts.get(n.key),cells=[...n.inlineContent];
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(request,sources,chunk)=>{
  const parent=await sources.tool({id:'one',tool:'read_source',arguments:{handle:request.primaryReply}});
  const source=await sources.tool({id:'two',tool:'read_source',arguments:{handle:parent.children[0]}});
  const search=await sources.tool({id:'three',tool:'search_symposium',arguments:{query:'beta',limit:5}});expect(search.status).toBe('complete');expect(search.items).toHaveLength(1);
  const value=dcpResponse(request.exchange);value.composition.push({id:'group',kind:'group',children:[{id:'list',kind:'list',style:'ordered',items:[[{id:'item',kind:'paragraph',markup:'Item',ranges:[]}]]}]} as any);value.replyTargets=['human'];value.anchors=[{id:'human',source:source.handle,revision:source.revision,selector:{exact:'beta',prefix:'Alpha ',suffix:' gamma'}}];value.interpretations=[{id:'interpretation',target:'human',type:'dialectic/qualification',ref:null,attributes:[]}];
  chunk(JSON.stringify(value));expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);return JSON.stringify(value);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);const data=c.frontier()!.data;
 expect(c.resolve(c.target(c.frontier()!.id))!.children.map(k=>c.session()!.projection.node(k)!.viewType)).toEqual(['standoff-editor-block','container-block']);expect(data.replies).toEqual([primary]);expect(data.discursiveReferences).toHaveLength(1);expect(c.resolveReference(data.discursiveReferences![0]).text).toBe('beta');
 expect(data.dcp?.tools).toHaveLength(3);expect(data.dcp?.request).toMatchObject({protocolKey:{version:'4a-1'}});
 const properties=n.payload.standoffProperties as any[];expect(properties.find(p=>p.type==='dialectic/qualification')).toMatchObject({start:6,end:9,metadata:{dcp:{actor:'mock',exchangeId:data.requestId,sourceAuthor:'human',appliedTo:'existing-source'}}});
 expect(Object.values(c.root()!.payload.linkedAnnotations as any).every((d:any)=>d.type==='dialectic/range-anchor')).toBe(true);
 expect(e.mounts.get(n.key)).toBe(mount);expect(n.inlineContent).toEqual(cells);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(c.committed()).toHaveLength(1);expect((n.payload.standoffProperties??[])).toHaveLength(0);e.repository.redo();expect(c.committed()).toHaveLength(2);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const saved=JSON.stringify(decodeNative(nativeBytes(captureNative(e.repository.readState(),c.resourceId()))));expect(saved).toContain('discursiveReferences');expect(saved).toContain('existing-source');expect(saved).not.toContain('dialectic/argument');
});
it('rejects ambiguous selectors, unavailable Stage 4B and malformed output without orphan content',async()=>{
 const f=await setup(),c=f.c!,e=f.editor;f.type!('same same');c.submit();const before=e.repository.state.revision,snapshots=vi.spyOn(e.repository,'snapshot');
 await c.askMock(async(request,sources)=>{const parent=await sources.tool({id:'p',tool:'read_source',arguments:{handle:request.primaryReply}}),source=await sources.tool({id:'b',tool:'read_source',arguments:{handle:parent.children[0]}});const v=dcpResponse(request.exchange);v.anchors=[{id:'ambiguous',source:source.handle,revision:source.revision,selector:{exact:'same',prefix:'',suffix:''}}];return JSON.stringify(v);});
 expect(c.notice()).toContain('Ambiguous');expect(e.repository.state.revision).toBe(before);
 await c.askMock(async request=>JSON.stringify({...dcpResponse(request.exchange),arguments:[{id:'arg',anchor:'generated'}]}));expect(c.notice()).toContain('Stage 4B');
 await c.askMock(async()=>'<p>not DCP</p>');expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(before);expect(()=>e.commands.boundedStructuralTransaction('Reject broad edit',()=>e.commands.setPayloadField(c.root()!.key,'metadata',{...JSON.parse(JSON.stringify(c.root()!.payload.metadata)),title:'Must not commit'}))).toThrow(/bounded|broad/);expect(e.repository.state.revision).toBe(before);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);expect(snapshots).not.toHaveBeenCalled();
});
it('rejects edit/Undo ABA and releases a cancelled transport that never settles',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,n=f.text!();f.type!('Original');c.submit();
 let release!:()=>void;const waiting=new Promise<void>(r=>release=r);
 const pending=c.askMock(async request=>{await waiting;return JSON.stringify(dcpResponse(request.exchange));});
 e.commands.replaceInlineRange(n.key,0,0,'change');e.repository.undo();release();await pending;expect(c.notice()).toContain('context changed');expect(c.committed()).toHaveLength(1);
 const cancelled=c.askMock(async()=>new Promise<string>(()=>{}));c.cancel();await cancelled;expect(c.busy()).toBe(false);expect(c.committed()).toHaveLength(1);expect(c.dcpPreview()).toBe('');
});
it('keeps retrieval authorized, bounded, cancellable and absent from typing',async()=>{
 const f=await setup(),c=f.c!,e=f.editor;f.type!('Visible source');c.submit();f.type!('Private draft');
 const state=e.repository.readState(),bank=state.contents[state.placements[state.rootPlacementKey].contentKey].children.find(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block')!;
 e.commands.insert({id:'dcp-unrelated',type:'document-block',metadata:{documentId:'dcp-unrelated'},children:[{id:'foreign-text',type:'standoff-editor-block',text:'SECRET '.repeat(2000)}]},{kind:'at',parentKey:bank,index:1});
 const other=Object.values(e.repository.readState().contents).find(n=>n.payload.id==='foreign-text')!;const snapshots=vi.spyOn(e.repository,'snapshot');
 const before={...c.dcpDiagnostics};f.type!('typing');expect(c.dcpDiagnostics).toEqual(before);
 await c.askMock(async(request,sources)=>{
  expect((await sources.tool({id:'unauthorized',tool:'read_source',arguments:{handle:'foreign-text'}})).status).toBe('unauthorized');
  const found=await sources.tool({id:'search',tool:'search_symposium',arguments:{query:'Private',limit:1}});expect(found.items).toHaveLength(0);expect(sources.diagnostics.visited).toBeLessThan(5);
  const limited=await sources.tool({id:'limit',tool:'search_symposium',arguments:{query:'Visible',limit:1}});expect(limited.status).toBe('truncated');expect(limited.items).toHaveLength(1);
  expect(JSON.stringify(sources.trail)).not.toContain('SECRET');return JSON.stringify(dcpResponse(request.exchange));
 });
 expect(c.notice()).toBe('');expect(e.repository.readState().contents[other.key]).toBe(other);expect(snapshots).not.toHaveBeenCalled();expect(c.dcpDiagnostics.searches).toBe(2);
});
it('retains the accepted mock fallback when DCP is disabled',async()=>{
 const f=await setup(true,true,false),c=f.c!;f.type!('Legacy mock');c.submit();await c.askMock();expect(c.notice()).toBe('');expect(c.frontier()!.data.dcp).toBeUndefined();expect(c.committed()).toHaveLength(2);
});
it('captures selected-context provenance at request time and rejects draft context',async()=>{
 const f=await setup(),c=f.c!;f.type!('Committed');c.submit();const target=c.target(c.frontier()!.id);c.pin(target);
 await c.askMock(async request=>{c.unpin(target);return JSON.stringify(dcpResponse(request.exchange));});
 expect(c.notice()).toBe('');expect(c.frontier()!.data.consumedContext!.items[0].origins).toEqual(['reply-target','selected']);expect(c.context()).toHaveLength(0);
 c.pin(c.target(c.draft()!.id));const revision=f.editor.repository.state.revision;await c.askMock();expect(c.notice()).toContain('before replying');expect(f.editor.repository.state.revision).toBe(revision);
});

it('4B commits distinct semantic identities atomically and resolves live/unresolved passages without rebuilding inventories',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('Human evidence');c.submit();const original=c.committed()[0],source=c.session()!.projection.node(c.resolve(c.target(original.id))!.children[0])!,mount=e.mounts.get(source.key)!.root;
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(request,sources)=>{
  const p=await sources.tool({id:'p',tool:'read_source',arguments:{handle:request.primaryReply}}),source=await sources.tool({id:'s',tool:'read_source',arguments:{handle:p.children[0]}});
  const v:any=dcpResponse(request.exchange);v.anchors=[{id:'human',source:source.handle,revision:source.revision,selector:{exact:'Human evidence',prefix:'',suffix:''}}];
  v.interpretations=[{id:'classification',target:'human',type:'dialectic/claim',ref:null,attributes:[]}];
  v.arguments=[{id:'human-argument',anchor:'human'},{id:'answer-argument',anchor:'generated'}];v.relations=[{id:'edge',kind:'argument',type:'supports',from:'answer-argument',to:'human-argument'},{id:'entity-edge',kind:'entity',type:'related-to',from:'e1',to:'e2'}];
  v.entities=[{id:'e1',name:'Evidence',typename:'Concept',description:'',aliases:['Support']},{id:'e2',name:'Inference',typename:'Concept',description:'',aliases:[]}];
  v.glosses=[{id:'gloss',target:'human',type:'clarification',text:'An independent clarification'}];v.composition.push({id:'entity-text',kind:'paragraph',markup:'<annotation type="mutable/entity-reference" ref="e1">Evidence</annotation> supports <e ref="e2">Inference</e>',ranges:[]});v.replyTargets=['human-argument','e1'];return JSON.stringify(v);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(e.mounts.get(source.key)!.root).toBe(mount);
 const definitions:any=c.root()!.payload.linkedAnnotations,values:any[]=Object.values(definitions),data=c.frontier()!.data,aliases:any=data.dcp!.identityMap,arg=aliases['human-argument'];
 expect(values.filter(d=>d.type===ARGUMENT)).toHaveLength(2);expect(values.filter(d=>d.type===LOCAL_ENTITY)).toHaveLength(2);expect(values.filter(d=>d.type==='mutable/gloss')).toHaveLength(1);
 expect(values.find(d=>d.type===ARGUMENT_RELATION).metadata.dialecticArgumentRelation).toMatchObject({relation:'supports',from:{argumentId:aliases['answer-argument'].argumentId},to:{argumentId:arg.argumentId}});
 expect(c.resolveReference(arg)).toMatchObject({status:'resolved',identityExists:true,text:'Human evidence'});expect(c.argumentRelations(arg.argumentId)).toHaveLength(1);expect(c.resolveReference(aliases.e1).text).toBe('Evidence');c.inspect(aliases.e1);expect(c.exchangeTarget()?.kind).toBe('contribution');
 const defsReads=c.references()!.diagnostics.definitionReads;e.commands.replaceInlineRange(source.key,5,5,'New ');await tick();expect(c.references()!.diagnostics.definitionReads).toBe(defsReads);expect(c.resolveReference(arg).changed).toBe(true);expect(c.committed()).toHaveLength(2);
 e.repository.undo();e.repository.undo();expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);e.repository.redo();expect(c.resolveReference(arg).status).toBe('resolved');
 expect(()=>captureBlocks(e.repository.readState(),[source.placementKey])).toThrow(/dependency remapping/);expect(()=>serializeSelection(e.repository.readState(),[{placementKey:source.placementKey}])).toThrow(/dependency remapping/);
 // Removing classifications and the independent Gloss never removes the argument.
 e.commands.setPayloadField(source.key,'standoffProperties',JSON.parse(JSON.stringify(source.payload.standoffProperties)).filter((p:any)=>p.type==='dialectic/range-anchor'));
 expect(c.resolveReference(arg).status).toBe('resolved');
 e.commands.remove(source.key);expect(c.resolveReference(arg)).toMatchObject({status:'unanchored',identityExists:true,historical:'Human evidence'});expect((c.root()!.payload.linkedAnnotations as any)[arg.argumentId].type).toBe(ARGUMENT);
 const snapshot=captureNative(e.repository.readState(),c.resourceId());const reloaded=decodeNative(nativeBytes(snapshot));expect(JSON.stringify(reloaded)).toContain(arg.argumentId);expect(JSON.stringify(reloaded)).toContain('entityReference');
});
it('4B Submit & Ask captures after a multi-Block human commit; Ask does not resubmit edits or force alternation',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('First');const d=c.resolve(c.target(c.draft()!.id))!;e.commands.insert({type:'container-block',children:[{type:'standoff-editor-block',text:'Nested'}]},{kind:'at',parentKey:d.key,index:1});
 await c.submitAndAsk(async(req)=>{expect(c.committed()).toHaveLength(1);expect(req.context[0].plainTextExcerpt).toContain('Nested');return JSON.stringify(dcpResponse(req.exchange));});
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);expect(c.committed()[0].data.participant?.kind).toBe('human');expect(c.committed()[1].data.participant?.kind).toBe('ai');
 f.type!('Second human');c.submit();f.type!('Third human');c.submit();expect(c.committed()).toHaveLength(4);
 const first=c.resolve(c.target(c.committed()[0].id))!,a=c.session()!.projection.node(first.children[0])!,b=c.session()!.projection.node(c.session()!.projection.node(first.children[1])!.children[0])!;
 e.commands.replaceInlineRange(a.key,0,0,'Edit ');e.commands.replaceInlineRange(b.key,0,0,'Also ');c.setReply(c.target(c.committed()[0].id));
 await c.askMock(async(req)=>{expect(c.committed()).toHaveLength(4);expect(req.context[0].plainTextExcerpt).toContain('Edit First');expect(req.context[0].plainTextExcerpt).toContain('Also Nested');return JSON.stringify(dcpResponse(req.exchange));});
 expect(c.committed()).toHaveLength(5);expect(c.frontier()!.data.replies[0].blockId).toBe(c.committed()[0].id);
});
it('4B rejects wrong-kind/foreign semantic endpoints and cancellation without partial definitions',async()=>{
 const f=await setup(true,true,true,true),c=f.c!;f.type!('Source');c.submit();
 await c.askMock(async(req)=>{const v:any=dcpResponse(req.exchange);v.entities=[{id:'e',name:'Entity',typename:'Concept',description:'',aliases:[]}];v.arguments=[{id:'a',anchor:'generated'}];v.relations=[{id:'r',kind:'argument',type:'supports',from:'a',to:'e'}];return JSON.stringify(v);});
 expect(c.notice()).toMatch(/argument/);expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 const waiting=c.askMock(()=>new Promise(()=>{}));c.cancel();await waiting;expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 const service=new ScopedEntities(f.editor,c.root()!.key,c.resourceId());const e=service.prepare({name:'Local',typename:'Concept',description:'',aliases:[]},{actor:'human'});service.commit({[e.id]:e});expect(service.local({scope:'document',resourceId:c.resourceId(),entityId:e.id})?.name).toBe('Local');expect(()=>service.prepareRelation('supports',{scope:'document',resourceId:'foreign',entityId:e.id},{scope:'document',resourceId:c.resourceId(),entityId:e.id},{})).toThrow(/owned/);service.dispose();
});

it('4B shared Entity service admits local/Vault relationships through read-only scope-qualified resolution',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('Source');c.submit();const get=vi.fn(async()=>({id:'global',name:'Global concept',revision:3,aliases:[]})),write=vi.fn(()=>{throw Error('SQL mutation forbidden');});cleanup.push(registerStandaloneEntityService(e,()=>({get,historyScope:async()=>'directory-A',scopeIdentity:async()=>'vault-A',create:write,rename:write,alias:write,dispose(){}} as any)));
 const original=c.session()!.projection.node(c.resolve(c.target(c.committed()[0].id))!.children[0])!;e.commands.setPayloadField(original.key,'standoffProperties',[{id:'global-mention',type:'codex/entity-reference',value:'global',start:0,end:5}]);
 await c.askMock(async(req,sources)=>{const parent=await sources.tool({id:'parent',tool:'read_source',arguments:{handle:req.primaryReply}}),source=await sources.tool({id:'text',tool:'read_source',arguments:{handle:parent.children[0]}}),global=source.annotations[0].entityHandle;expect(global).toBeTruthy();expect(global.length).toBeLessThanOrEqual(128);expect((await sources.tool({id:'entity',tool:'read_source',arguments:{handle:global}})).entity.name).toBe('Global concept');const v:any=dcpResponse(req.exchange);v.entities=[{id:'local',name:'Local concept',typename:'Concept',description:'Document owned',aliases:[]}];v.relations=[{id:'r',kind:'entity',type:'related-to',from:'local',to:global}];v.composition.push({id:'local-mention',kind:'paragraph',markup:'<e ref="local">Local concept</e>',ranges:[]});return JSON.stringify(v);});
 expect(c.notice()).toBe('');expect(write).not.toHaveBeenCalled();expect(get).toHaveBeenCalled();const values:any[]=Object.values(c.root()!.payload.linkedAnnotations??{}),r=values.find(d=>d.type===LOCAL_ENTITY_RELATION).metadata.scopedEntityRelation;expect(r.to).toEqual({scope:'vault',vaultId:'vault-A',entityId:'global'});
 const inventory=documentContextInventory(captureNative(e.repository.readState(),c.resourceId()));expect(inventory.entities).not.toContain(r.from.entityId);expect(inventory.localEntities).toHaveLength(1);expect(JSON.stringify(inventory.unresolved)).toContain('vault-A');
 const service=new ScopedEntities(e,c.root()!.key,c.resourceId());const local=JSON.parse(JSON.stringify(values.find(d=>d.type===LOCAL_ENTITY)));service.commit({[local.id]:{...local,isDeleted:true}});expect(service.local(r.from)).toBeUndefined();expect((c.root()!.payload.linkedAnnotations as any)[values.find(d=>d.type===LOCAL_ENTITY_RELATION).id]).toBeTruthy();e.repository.undo();expect(service.local(r.from)?.name).toBe('Local concept');await expect(service.resolve({scope:'vault',vaultId:'another',entityId:'global'})).rejects.toThrow(/another Vault/);expect(await service.resolve({scope:'document',resourceId:'another',entityId:r.from.entityId})).toBeUndefined();service.dispose();
});
it('4B reuses older argument handles without conflating classifications, and preserves unresolved incident edges',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('Earlier source');c.submit();await c.askMock();expect(c.notice()).toBe('');
 const registry=()=>c.root()!.payload.linkedAnnotations as any,all:any[]=Object.values(registry()),a=all.find(d=>d.type===ARGUMENT),target:any={kind:'argument',resourceId:c.resourceId(),argumentId:a.id};c.setReply(target);
 await c.askMock(async(req,sources)=>{const result=await sources.tool({id:'old',tool:'read_source',arguments:{handle:req.primaryReply}});expect(result.kind).toBe('argument');expect(result.identityExists).toBe(true);const v:any=dcpResponse(req.exchange);v.arguments=[{id:'new',anchor:'generated'}];v.relations=[{id:'r',kind:'argument',type:'depends-on',from:'new',to:req.primaryReply}];return JSON.stringify(v);});
 expect(c.notice()).toBe('');expect(c.frontier()!.data.replies[0]).toEqual(target);expect(c.argumentRelations(a.id).length).toBeGreaterThan(0);
 const before=c.argumentRelations(a.id).map(d=>d.id);e.commands.boundedStructuralTransaction('Delete argument',()=>e.commands.setPayloadField(c.root()!.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(registry())),[a.id]:{...JSON.parse(JSON.stringify(registry()[a.id])),isDeleted:true}}));expect(c.resolveReference(target).status).toBe('missing');expect(c.argumentRelations(a.id).map(d=>d.id)).toEqual(before);e.repository.undo();expect(c.resolveReference(target).status).toBe('resolved');
});

it('4B cancellation during asynchronous global-reference validation leaves no local semantic records',async()=>{
 const f=await setup(true,true,true,true),c=f.c!;f.type!('Human source');c.submit();let entered=false;cleanup.push(registerStandaloneEntityService(f.editor,()=>({scopeIdentity:async()=>'vault',get:()=>{entered=true;return new Promise(()=>{});},dispose(){}} as any)));
 const task=c.askMock(async(req,sources)=>{const global=sources.issue({kind:'entity',resourceId:c.resourceId(),entity:{scope:'vault',vaultId:'vault',entityId:'global'}}),v:any=dcpResponse(req.exchange);v.entities=[{id:'local',name:'Never committed',typename:'Concept',description:'',aliases:[]}];v.arguments=[{id:'a',anchor:'generated'}];v.relations=[{id:'r',kind:'entity',type:'related-to',from:'local',to:global}];v.composition.push({id:'local-mention',kind:'paragraph',markup:'<e ref="local">Local concept</e>',ranges:[]});return JSON.stringify(v);});
 for(let i=0;i<20&&!entered;i++)await tick();expect(entered).toBe(true);c.cancel();await task;expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
});

it('commits ordinary live replies with no semantic records, distinct provider provenance and one Undo',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('Shall we have a family picnic?');c.submit();const source=f.text!(),mount=e.mounts.get(source.key),snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 let request:any,provider='openai',round=0;
 const receipt=()=>({provider,model:'fixture-'+provider,startedUtc:'start',completedUtc:'end',usage:{input_tokens:20,output_tokens:10},stop:'completed',cost:{status:'unknown'}});
 const fetcher=vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);if(url.endsWith('/session'))return new Response(JSON.stringify({token:'token'}));if(url.endsWith('/settings')){provider=body.settings.provider;return new Response(JSON.stringify({settings:body.settings,ready:true}));}if(url.endsWith('/exchange')){request=body.request;round=0;return new Response(JSON.stringify({id:'e',settings:c.providerSettings(),system:'fixture protocol'}));}if(url.endsWith('/turn')){round++;const text=JSON.stringify({protocol:'dcp/1.0',kind:'contribution',exchange:request.exchange,intent:'acknowledge',replyTargets:[],composition:[{id:'p',kind:'paragraph',markup:'Sounds lovely!',ranges:[]}],anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]});return new Response(JSON.stringify({type:'delta',text:text.slice(0,10)})+'\n'+JSON.stringify({type:'result',text,calls:[],receipt:receipt()})+'\n');}return new Response('{}');});vi.stubGlobal('fetch',fetcher);
 for(const provider of ['openai','anthropic'] as const){await c.configureProvider({provider,model:'configured-'+provider,maxOutputTokens:1024,repair:true,cadence:'conversational'},'test-secret');await c.ask();expect(c.notice()).toBe('');const row=c.committed().at(-1)!;expect(row.data.author).toBe('ai');expect(row.data.participant?.name).toBe('AI participant');expect(row.data.dcp?.provider?.settings.provider).toBe(provider);expect(row.data.dcp?.intent).toBe('acknowledge');expect(row.data.dcp?.provider?.attempts).toHaveLength(1);expect(row.data.dcp?.provider?.attempts[0].receipt.usage).toEqual({input_tokens:20,output_tokens:10});expect(row.data.discursiveReferences).toEqual([]);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);expect(JSON.stringify(captureNative(e.repository.readState(),c.resourceId()))).not.toContain('test-secret');expect(round).toBe(1);}
 expect(c.committed()).toHaveLength(3);const participant=c.committed()[1].data.participant!.id;expect(c.committed()[2].data.participant!.id).toBe(participant);e.repository.undo();expect(c.committed()).toHaveLength(2);e.repository.redo();expect(c.committed()).toHaveLength(3);expect(e.mounts.get(source.key)).toBe(mount);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();const calls=fetcher.mock.calls.length,reads=c.dcpDiagnostics.reads;f.type!('Typing remains local.');expect(fetcher.mock.calls).toHaveLength(calls);expect(c.dcpDiagnostics.reads).toBe(reads);
});

it('live validation repair stays transient, bounded and cancellable without duplicate commits',async()=>{
 const f=await setup(true,true,true,true),c=f.c!;f.type!('Share a story.');c.submit();let request:any,turn=0,mode='repair';
 const receipt={provider:'openai',model:'m',startedUtc:'start',completedUtc:'end',usage:null,stop:'completed',cost:{status:'unknown'}};
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);if(url.endsWith('/session'))return new Response(JSON.stringify({token:'token'}));if(url.endsWith('/settings'))return new Response(JSON.stringify({settings:body.settings,ready:true}));if(url.endsWith('/exchange')){request=body.request;turn=0;return new Response(JSON.stringify({id:'e',settings:c.providerSettings()}));}if(url.endsWith('/turn')){turn++;if(mode==='cancel'){queueMicrotask(c.cancel);throw Error('cancelled');}const text=turn===1||mode==='invalid'?'not JSON':JSON.stringify({protocol:'dcp/1.0',kind:'contribution',exchange:request.exchange,intent:'create',replyTargets:[],composition:[{id:'p',kind:'paragraph',markup:'Once upon a time…',ranges:[]}],anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]});expect(c.committed()).toHaveLength(mode==='repair'?1:2);return new Response(JSON.stringify({type:'result',text,calls:[],receipt})+'\n');}return new Response('{}');}));
 await c.configureProvider({provider:'openai',model:'m',maxOutputTokens:1024,repair:true,cadence:'conversational'},'test-secret');await c.ask();expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);expect(c.committed()[1].data.dcp?.provider?.attempts[0].rejectedResponse).toBe('not JSON');expect(turn).toBe(2);expect(c.committed()[1].data.notices?.[0].code).toBe('validation-repaired');expect(c.contributionActivity(c.committed()[1].id)().notices).toHaveLength(1);
 mode='invalid';await c.ask();expect(c.committed()).toHaveLength(2);expect(turn).toBe(2);expect(c.notice()).not.toBe('');mode='cancel';await c.ask();expect(c.committed()).toHaveLength(2);expect(c.busy()).toBe(false);
});

it('live source classifications retain human authorship and AI exchange provenance with bounded admission',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('We could share a picnic.');const original=f.text!();c.submit();let request:any;const snapshots=vi.spyOn(e.repository,'snapshot');
 const receipt={provider:'openai',model:'m',startedUtc:'start',completedUtc:'end',usage:null,stop:'completed',cost:{status:'unknown'}};
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);if(url.endsWith('/session'))return new Response(JSON.stringify({token:'token'}));if(url.endsWith('/settings'))return new Response(JSON.stringify({settings:body.settings,ready:true}));if(url.endsWith('/exchange')){request=body.request;return new Response(JSON.stringify({id:'e',settings:c.providerSettings()}));}if(url.endsWith('/turn')){
  let calls:any[]=[],text='';if(body.round===0)calls=[{id:'first',tool:'read_source',arguments:{handle:request.primaryReply}}];else if(body.round===1)calls=[{id:'second',tool:'read_source',arguments:{handle:body.results[0].result.children[0]}}];else{const source=body.results[0].result;text=JSON.stringify({protocol:'dcp/1.0',kind:'contribution',exchange:request.exchange,intent:'reply',replyTargets:[],composition:[{id:'p',kind:'paragraph',markup:'I’d like that.',ranges:[]}],anchors:[{id:'source',source:source.handle,revision:source.revision,selector:{exact:source.text,prefix:'',suffix:''}}],interpretations:[{id:'mark',target:'source',type:'dialectic/suggestion',ref:null,attributes:[]}],entities:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]});}return new Response(JSON.stringify({type:'result',text,calls,receipt})+'\n');}return new Response('{}');}));
 await c.configureProvider({provider:'openai',model:'m',maxOutputTokens:1024,repair:false,cadence:'conversational'},'test-secret');await c.ask();expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);const property=(original.payload.standoffProperties as any[]).find(p=>p.type==='dialectic/suggestion');expect(property.metadata.dcp).toMatchObject({actor:'ai',sourceAuthor:'human',appliedTo:'existing-source',exchangeId:c.committed()[1].data.requestId});expect(c.committed()[0].data.author).toBe('human');expect(Object.values(c.root()!.payload.linkedAnnotations??{}).map((d:any)=>d.type)).toEqual(['dialectic/range-anchor']);expect(snapshots).not.toHaveBeenCalled();e.repository.undo();expect((original.payload.standoffProperties as any[]??[]).filter(p=>p.type==='dialectic/suggestion')).toHaveLength(0);e.repository.redo();expect(c.committed()).toHaveLength(2);
});

it('native authoring sends selected hierarchy and participant context, materialises multiple addresses and inspected semantics with Undo and persistence',async()=>{
 const {authoringExamples}=await import('./dcp/authoring');
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;
 f.type!('Rain is forecast.');c.submit();const first=c.target(c.frontier()!.id),original=c.session()!.projection.node(c.resolve(first)!.children[0])!,mount=e.mounts.get(original.key);
 f.type!('We could meet at the library.');c.submit();const second=c.target(c.frontier()!.id);c.pin(first);c.pin(second);
 f.type!('Address both earlier contributions, annotate the forecast, and explicitly relate the forecast argument to an indoor proposal.');c.submit();const requestTarget=c.target(c.frontier()!.id);
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(req,sources)=>{
  expect(req.task.participantRequest.text).toContain('Address both');expect(req.task.focus).toBe(req.primaryReply);
  const manifest=req.structuralContext;expect(manifest.status).toBe('complete');expect(manifest.sources.length).toBe(6);
  const a=manifest.sources.find((s:any)=>s.target.blockId===first.blockId&&s.kind==='contribution');expect(a.contribution).toMatchObject({ordinal:1,author:'human',participant:{kind:'human'}});expect(a.contribution.createdUtc).toBeTruthy();
  const b=manifest.sources.find((s:any)=>s.target.blockId===second.blockId&&s.kind==='contribution');
  const text=manifest.sources.find((s:any)=>s.target.blockId===original.payload.id);expect(text.exactAnchorEligible).toBe(true);expect(a.children).toContain(text.handle);
  expect(sources.diagnostics.reads).toBe(0);expect(req.authoring.instructions).toContain('Discursive addressing does NOT require an argument');
  const response=JSON.parse(JSON.stringify(authoringExamples[1].response));response.exchange=req.exchange;response.replyTargets=[a.handle,b.handle];response.anchors[0].source=text.handle;response.anchors[0].revision=text.revision;
  const {prepare}=await import('./dcp/exchange'),{validationDiagnostic}=await import('./dcp/diagnostics');
  const invalid=structuredClone(response);invalid.anchors[0].selector.exact='Not in the source';
  let diagnostic;try{await prepare(JSON.stringify(invalid),req.exchange,c.resourceId(),e.visualEffects,sources,true);}catch(error){diagnostic=validationDiagnostic(error);}
  expect(diagnostic).toMatchObject({code:'source',path:'$.anchors[0]'});expect(JSON.stringify(diagnostic)).not.toContain('Not in the source');
  return JSON.stringify(response);
 });
 expect(c.notice()).toBe('');const result=c.frontier()!,dcp=result.data.dcp!;
 expect(result.data.replies).toEqual([requestTarget]);expect(result.data.discursiveReferences).toEqual([first,second]);expect(dcp.annotationRefs).toHaveLength(2);
 const definitions=Object.values(c.root()!.payload.linkedAnnotations??{}) as any[];expect(definitions.filter(d=>d.type===ARGUMENT)).toHaveLength(2);expect(definitions.filter(d=>d.type===ARGUMENT_RELATION)[0].metadata.dialecticArgumentRelation.relation).toBe('supports');
 const ref=dcp.annotationRefs!.find(r=>r.blockId===original.payload.id)!;c.inspectAnnotation(ref);expect(c.inspectedAnnotation()?.property.type).toBe('dialectic/claim');expect(c.inspectedAnnotation()?.text).toBe('Rain is forecast.');
 const rowButton=[...f.host.querySelectorAll<HTMLButtonElement>('.dialectic-entry')].find(b=>b.querySelector('.dialectic-number')?.textContent==='04')!;rowButton.click();await tick();
 const bar=f.host.querySelector<HTMLElement>('[data-contribution-activity="'+result.id+'"]')!;expect(bar.textContent).toContain('2 references');expect(bar.textContent).toContain('1 source annotation');expect(bar.textContent).toContain('1 generated formatting');expect(bar.textContent).toContain('1 relationship created');bar.querySelector<HTMLButtonElement>('[data-activity-category=annotations]')!.click();await tick();
 const annotationButton=[...f.host.querySelectorAll<HTMLButtonElement>('.dialectic-activity-item button')].find(b=>b.textContent?.includes('dialectic/claim'))!;annotationButton.click();await tick();expect(f.host.querySelector('[aria-label="Annotation inspection"]')?.textContent).toContain('Rain is forecast.');
 expect(e.mounts.get(original.key)).toBe(mount);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(c.committed()).toHaveLength(3);expect((original.payload.standoffProperties as any[]??[])).toHaveLength(0);e.repository.redo();expect(c.committed()).toHaveLength(4);expect(c.annotationDetails(ref)?.property.type).toBe('dialectic/claim');
 const saved=JSON.stringify(decodeNative(nativeBytes(captureNative(e.repository.readState(),c.resourceId()))));expect(saved).toContain(ref.propertyId);expect(saved).toContain('annotationRefs');expect(saved).toContain('structuralContext');expect(saved).toContain('dialectic/argument-relation');
 const reads={...c.dcpDiagnostics};f.type!('Ordinary typing');expect(c.dcpDiagnostics).toEqual(reads);
 c.setReply(c.target(result.id));await c.askMock(async req=>{const sources=req.structuralContext.sources;expect(sources.some((s:any)=>s.kind==='argument')).toBe(true);expect(sources.some((s:any)=>s.kind==='argument-relation'&&s.definition.metadata.dialecticArgumentRelation.relation==='supports')).toBe(true);return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toBe('');
});

it('bounds the selected structural manifest without fetching unselected history or unrelated Documents',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;
 f.type!('Unselected private history');c.submit();f.type!('Selected content');
 const draft=c.resolve(c.target(c.draft()!.id))!;
 for(let i=0;i<75;i++)e.commands.insert({type:'standoff-editor-block',text:'Small '+i},{kind:'at',parentKey:draft.key,index:i+1});c.submit();
 await c.askMock(async req=>{expect(req.structuralContext.status).toBe('truncated');expect(req.structuralContext.sources).toHaveLength(64);expect(JSON.stringify(req.structuralContext)).not.toContain('Unselected private history');return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toBe('');
});

it('protects submitted base text canonically while retaining annotations, drafts and history',async()=>{
 const f=await setup(true,true,true,true,true),e=f.editor,c=f.c!,n=f.text!();f.type!('Protected evidence');c.submit();await tick();
 const native=nativeDocumentSession(e);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'protected.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const before=e.repository.state.revision,mount=e.mounts.get(n.key)!,snapshots=vi.spyOn(e.repository,'snapshot'),rebuild=vi.spyOn(c.session()!.projection as any,'build'),changes=vi.fn(),stop=e.repository.subscribeChanges(changes);cleanup.push(stop);
 expect(mount.focusElement?.getAttribute('contenteditable')).toBe('false');
 expect(()=>e.commands.replaceInlineRange(n.key,0,1,'X')).toThrow(/protected/);
 expect(()=>e.commands.completeProvisionalText(n.key,e.repository.readState().contents[n.contentKey].inlineRevision,[{start:0,end:1,text:'X'}])).toThrow(/protected/);
 expect(()=>e.commands.remove(n.key)).toThrow(/protected/);
 const cell=e.repository.readState().contents[e.repository.readState().placements[e.repository.readState().contents[n.contentKey].inlineContent[0]].contentKey];
 expect(()=>e.repository.commit('Direct cell edit',[{kind:'put-content',record:{...cell,payload:{text:'X'}}}])).toThrow(/protected/);
 expect(e.repository.state.revision).toBe(before);expect(changes).not.toHaveBeenCalled();expect(native.isDirty(c.resourceId())).toBe(false);
 const input=new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'X'});mount.focusElement!.dispatchEvent(input);expect(input.defaultPrevented).toBe(true);
 e.rangeAnnotations.apply([e.textRanges.snapshot(n.key,0,9)],'style/bold');expect(n.payload.standoffProperties).toHaveLength(1);e.repository.undo();expect(n.payload.standoffProperties??[]).toHaveLength(0);e.repository.redo();expect(n.payload.standoffProperties).toHaveLength(1);
 f.type!('Draft remains editable');expect(f.text!().inlineContent.length).toBeGreaterThan(0);expect(e.mounts.get(n.key)).toBe(mount);expect(snapshots).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();
 e.repository.undo();e.repository.undo();e.repository.undo();expect(c.draft()!.id).toBe(c.rows()[0].id);expect(e.textProtection.isProtected(n.contentKey)).toBe(false);e.repository.redo();expect(e.textProtection.isProtected(n.contentKey)).toBe(true);
});

const inventoryArgs={cursor:null,limit:20,contributionId:null,participantId:null,fromOrdinal:null};
it('discovers earlier native TextBlocks after twelve contributions, pages and resolves a protected source for a remark',async()=>{
 const f=await setup(true,true,true,true,true),c=f.c!,e=f.editor,ids:string[]=[];
 for(let i=0;i<12;i++){ids.push(String(f.text!().payload.id));f.type!(i===0?'First garden sample.':`Sample ${i+1}.`);if(i===4){const n=c.resolve(c.target(c.draft()!.id))!;e.commands.setPayloadField(n.key,'metadata',{dialectic:{...JSON.parse(JSON.stringify(n.payload.metadata)).dialectic,participant:{id:'guest',kind:'human',name:'Guest'}}});}c.submit();expect(c.notice(), 'submit '+i).toBe('');}
 const original=c.resolve(c.target(ids[0],'block'))!,mount=e.mounts.get(original.key),cells=[...original.inlineContent],before=e.repository.state.revision,snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(req,sources)=>{
  expect(req.legend.tools).toContain('list_text_blocks');expect(req.structuralContext.sources.some((s:any)=>s.target.blockId===ids[0])).toBe(false);
  const a=await sources.tool({id:'page1',tool:'list_text_blocks',arguments:{...inventoryArgs,limit:5}});expect(a.items.map((i:any)=>i.blockId)).toEqual(ids.slice(0,5));const expired=await sources.tool({id:'expired-read',tool:'read_source',arguments:{handle:'source-from-an-earlier-exchange'}});expect(expired).toMatchObject({status:'unauthorized',recovery:{tool:'list_text_blocks'}});expect(expired.text).toBeUndefined();expect(expired.revision).toBeUndefined();expect(expired.recovery.inventory.items).toHaveLength(5);expect(expired.recovery.inventory.items[0].blockId).toBe(ids[0]);
  expect(a.items[0]).toMatchObject({position:1,preview:'First garden sample.',readRequired:true,contribution:{ordinal:1,author:'human'}});expect(a.items[0].revision).toBeUndefined();
  const b=await sources.tool({id:'page2',tool:'list_text_blocks',arguments:{...inventoryArgs,limit:20,cursor:a.nextCursor}});expect(b.items.map((i:any)=>i.blockId)).toEqual(ids.slice(5));expect(b.status).toBe('complete');
  const guest=await sources.tool({id:'guest',tool:'list_text_blocks',arguments:{...inventoryArgs,participantId:'guest'}});expect(guest.items.map((i:any)=>i.blockId)).toEqual([ids[4]]);
  const later=await sources.tool({id:'position',tool:'list_text_blocks',arguments:{...inventoryArgs,fromOrdinal:11}});expect(later.items.map((i:any)=>i.blockId)).toEqual(ids.slice(10));expect(later.coverage.visited).toBe(4);
  const source=await sources.tool({id:'read',tool:'read_source',arguments:{handle:a.items[0].handle}});expect(source.target.blockId).toBe(ids[0]);expect(e.repository.state.revision).toBe(before);
  const v:any=dcpResponse(req.exchange);v.replyTargets=[source.handle];v.anchors=[{id:'first',source:source.handle,revision:source.revision,selector:{exact:source.text,prefix:'',suffix:''}}];v.glosses=[{id:'remark',target:'first',type:'remark',text:'This is a test remark.'}];return JSON.stringify(v);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(13);const mark=(original.payload.standoffProperties as any[]).find(p=>p.type==='mutable/gloss');expect(mark).toBeTruthy();expect((c.root()!.payload.linkedAnnotations as any)[mark.annotationId].value).toBe('remark: This is a test remark.');expect(original.inlineContent).toEqual(cells);expect(e.mounts.get(original.key)).toBe(mount);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(original.payload.standoffProperties??[]).toHaveLength(0);e.repository.redo();expect((original.payload.standoffProperties as any[]).some(p=>p.type==='mutable/gloss')).toBe(true);
});
it('bounds inventory previews and layout traversal, excludes drafts and foreign Documents, and rejects stale/foreign cursors',async()=>{
 const f=await setup(),c=f.c!,e=f.editor;f.type!('First '+ 'x'.repeat(200));const draft=c.resolve(c.target(c.draft()!.id))!;
 for(let i=0;i<135;i++)e.commands.insert({type:'container-block',children:[]},{kind:'at',parentKey:draft.key,index:i+1});c.submit();f.type!('Private draft');
 const root=e.repository.readState(),bank=root.contents[root.placements[root.rootPlacementKey].contentKey].children.find(k=>root.contents[root.placements[k].contentKey].viewType==='workspace-object-bank-block')!;
 e.commands.insert({id:'inventory-other',type:'document-block',metadata:{documentId:'inventory-other'},children:[{id:'inventory-secret',type:'standoff-editor-block',text:'Other Document text'}]},{kind:'at',parentKey:bank,index:0});
 let cursor:string;
 await c.askMock(async(req,sources)=>{
  const p=await sources.tool({id:'bounded',tool:'list_text_blocks',arguments:inventoryArgs});cursor=p.nextCursor;expect(p.coverage.visited).toBe(128);expect(p.coverage.previewCells).toBe(160);expect(p.items).toHaveLength(1);expect(p.items[0].previewTruncated).toBe(true);expect(JSON.stringify(p)).not.toMatch(/Private draft|Other Document text/);expect(sources.diagnostics.reads).toBe(0);
  await expect(sources.tool({id:'changed-filter',tool:'list_text_blocks',arguments:{...inventoryArgs,cursor,participantId:'different'}})).rejects.toThrow(/cursor/);
  const scoped=await sources.tool({id:'scope',tool:'list_text_blocks',arguments:{...inventoryArgs,contributionId:'inventory-other'}});expect(scoped.items).toEqual([]);
  const end=await sources.tool({id:'resume',tool:'list_text_blocks',arguments:{...inventoryArgs,cursor}});expect(end.status).toBe('complete');expect(end.items).toEqual([]);
  await expect(sources.tool({id:'repeat',tool:'list_text_blocks',arguments:{...inventoryArgs,cursor}})).rejects.toThrow(/cursor/);
  return JSON.stringify(dcpResponse(req.exchange));
 });expect(c.notice()).toBe('');
 await c.askMock(async(req,sources)=>{await expect(sources.tool({id:'foreign',tool:'list_text_blocks',arguments:{...inventoryArgs,cursor}})).rejects.toThrow(/cursor/);const p=await sources.tool({id:'new',tool:'list_text_blocks',arguments:{...inventoryArgs,limit:1}});const n=c.resolve(c.target(p.items[0].blockId,'block'))!;e.commands.replaceInlineRange(n.key,0,0,'changed');await expect(sources.tool({id:'stale',tool:'read_source',arguments:{handle:p.items[0].handle}})).rejects.toThrow(/changed/);return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toMatch(/changed/);
});

it('Submit defaults to the live assistant and sends the newly committed contribution once',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;
 const selector=f.host.querySelector('[aria-label="Assistant mode"]') as HTMLSelectElement;
 expect(selector.value).toBe('live');expect(c.providerMode()).toBe('live');
 expect([...f.host.querySelectorAll('button')].some(b=>b.textContent==='Submit & Ask')).toBe(false);
 let request:any,settings:any;
 const fetcher=vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);
  if(url.endsWith('/session'))return Response.json({token:'fixture'});
  if(url.endsWith('/settings')){settings=body.settings;expect(body.key).toBeUndefined();return Response.json({settings,ready:true});}
  if(url.endsWith('/exchange')){request=body.request;expect(c.committed()).toHaveLength(1);return Response.json({id:'submit-fixture',settings});}
  if(url.endsWith('/turn'))return new Response(JSON.stringify({type:'result',text:JSON.stringify(dcpResponse(request.exchange)),calls:[],receipt:{provider:'openai',model:settings.model,usage:null,cost:{status:'unknown'}}})+'\n');
  return Response.json({});
 });vi.stubGlobal('fetch',fetcher);
 const snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 f.type!('Hello from Submit');expect(fetcher).not.toHaveBeenCalled();
 const submit=[...f.host.querySelectorAll('button')].find(b=>b.textContent==='Submit')!;submit.click();submit.click();
 await vi.waitFor(()=>expect(c.committed()).toHaveLength(2));
 expect(c.committed().map(r=>r.data.author)).toEqual(['human','ai']);expect(request.task.participantRequest.text).toContain('Hello from Submit');
 expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/exchange'))).toHaveLength(1);
 expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
});
it('missing credentials keep the AI choice and human contribution without silently using the mock',async()=>{
 const f=await setup(),c=f.c!;
 const fetcher=vi.fn(async(url:any,init:any)=>url.endsWith('/session')?Response.json({token:'fixture'}):url.endsWith('/settings')?Response.json({settings:JSON.parse(init.body).settings,ready:false}):Response.json({}));vi.stubGlobal('fetch',fetcher);
 f.type!('Keep this contribution');await c.submitAndAsk();
 expect(c.committed()).toHaveLength(1);expect(c.committed()[0].data.author).toBe('human');expect(c.providerMode()).toBe('live');expect(c.notice()).toContain('session key');
 expect(fetcher.mock.calls.some(([url])=>url.endsWith('/exchange'))).toBe(false);
 await c.forgetProvider();expect(c.providerMode()).toBe('live');
 c.setProviderMode('mock');await c.ask();expect(c.committed()).toHaveLength(2);expect(c.frontier()!.data.author).toBe('mock');
});

it('repairs Test5 expired capabilities through bounded discovery and an exact 55-Cell annotation; retains terminal diagnostics',async()=>{
 const f=await setup(true,true,true,true,true),c=f.c!,e=f.editor;
 const exact='A map is useful precisely because it omits information.';
 const text=exact+' A perfectly detailed map would be indistinguishable from the territory itself, and therefore practically useless.';
 f.type!(text);const original=f.text!(),mount=e.mounts.get(original.key);c.submit();
 for(let i=2;i<=10;i++){f.type!(i===10?'Classify the first sentence of my opening passage as dialectic/claim.':'Small contribution '+i);c.submit();}
 let historical:any;await c.askMock(async(_request,sources)=>{historical=await sources.source(sources.issue({kind:'block',resourceId:c.resourceId(),blockId:String(original.payload.id)}));throw Error('Synthetic earlier exchange ended without authoring');});expect(c.committed()).toHaveLength(10);
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 let request:any,rounds=0,fail=false,fresh:any;
 const receipt={provider:'openai',model:'fixture',startedUtc:'start',completedUtc:'end',usage:null,stop:'completed',cost:{status:'unknown'}};
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{
  const body=init?.body&&JSON.parse(init.body);
  if(url.endsWith('/session'))return new Response(JSON.stringify({token:'token'}));
  if(url.endsWith('/settings'))return new Response(JSON.stringify({settings:body.settings,ready:true}));
  if(url.endsWith('/exchange')){request=body.request;rounds=0;return new Response(JSON.stringify({id:'e',settings:c.providerSettings()}));}
  if(!url.endsWith('/turn'))return new Response('{}');
  rounds++;let calls:any[]=[],output='';
  if(body.round===1){expect(body.repair).toBe(true);expect(body.diagnostic).toMatchObject({code:'source-identity',path:'$.anchors[0]'});expect(JSON.stringify(body.diagnostic).length).toBeLessThan(400);calls=[{id:'discover',tool:'list_text_blocks',arguments:{cursor:null,limit:3,contributionId:null,participantId:null,fromOrdinal:1}}];}
  else if(body.round===2){const item=body.results[0].result.items.find((i:any)=>i.blockId===original.payload.id);expect(item).toBeTruthy();expect(item.handle).not.toBe(historical.handle);calls=[{id:'read',tool:'read_source',arguments:{handle:item.handle}}];}
  else{
   if(body.round===3){fresh=body.results[0].result;expect(fresh.text).toBe(text);expect(fresh.target.blockId).toBe(original.payload.id);expect(fresh.revision).not.toBe(historical.revision);}
   const v:any=dcpResponse(request.exchange);v.anchors=[{id:'a1',source:body.round===0||fail?historical.handle:fresh.handle,revision:body.round===0||fail?historical.revision:fresh.revision,selector:{exact:body.round===0?text:exact,prefix:'',suffix:''}}];v.interpretations=[{id:'i1',target:'a1',type:'dialectic/claim',ref:null,attributes:[]}];output=JSON.stringify(v);
  }
  expect(c.committed()).toHaveLength(fail?11:10);
  return new Response(JSON.stringify({type:'result',text:output,calls,receipt})+'\n');
 }));
 await c.configureProvider({provider:'openai',model:'fixture',maxOutputTokens:1024,repair:true,cadence:'conversational'},'fixture-only');await c.ask();
 expect(c.notice()).toBe('');expect(rounds).toBe(4);expect(c.committed()).toHaveLength(11);
 const marks=original.payload.standoffProperties as any[];expect(marks.filter(p=>p.type==='dialectic/claim')).toHaveLength(1);
 const anchor=marks.find(p=>p.type==='dialectic/range-anchor');expect(anchor).toMatchObject({start:0,end:54});expect(exact.length).toBe(55);
 const {canonicalSearchSource}=await import('../../runtime/canonical-search-source');expect((await canonicalSearchSource(e.repository.readState(),original.contentKey,0)).runs[0].text).toBe(text);expect(e.mounts.get(original.key)).toBe(mount);
 expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 fail=true;await c.ask();expect(rounds).toBe(4);expect(c.committed()).toHaveLength(11);expect((original.payload.standoffProperties as any[]).filter(p=>p.type==='dialectic/claim')).toHaveLength(1);
 const failure=c.lastProviderExchange()!;expect(failure.failure?.diagnostic?.code).toBe('source-identity');expect(failure.attempts.at(-1)?.rejectedResponse).toContain(historical.handle);expect(failure.tools).toHaveLength(2);
 c.selectRange('reply');expect(c.notice()).toContain('Select one nonempty range');expect(c.lastProviderExchange()).toBe(failure);expect(failure.failure?.message).toContain('Unauthorized source handle');
 e.repository.undo();expect(c.committed()).toHaveLength(10);expect((original.payload.standoffProperties as any[]??[]).filter(p=>p.type==='dialectic/claim')).toHaveLength(0);e.repository.redo();expect(c.committed()).toHaveLength(11);
});

it('keeps the exchange failure visible in its existing inspector after a manual selection error',async()=>{
 const f=await setup(true,true,true,true);f.type!('A small UI diagnosis fixture.');let request:any;
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);
  if(url.endsWith('/session'))return Response.json({token:'token'});
  if(url.endsWith('/settings'))return Response.json({settings:body.settings,ready:true});
  if(url.endsWith('/exchange')){request=body.request;return Response.json({id:'e',settings:{provider:'openai',model:'fixture',maxOutputTokens:1024,repair:true,cadence:'conversational'}});}
  if(url.endsWith('/turn')){const v:any=dcpResponse(request.exchange);v.replyTargets=['source-expired'];return new Response(JSON.stringify({type:'result',text:JSON.stringify(v),calls:[],receipt:{provider:'openai',model:'fixture',startedUtc:'start',completedUtc:'end',usage:null,stop:'completed',cost:{status:'unknown'}}})+'\n');}
  return Response.json({});
 }));
 const button=(label:string)=>[...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 button('Submit').click();await vi.waitFor(()=>expect(f.host.querySelector('[aria-label="Exchange failure"]')?.textContent).toContain('Unauthorized source handle'));
 const inspector=f.host.querySelector('[aria-label="Exchange failure"]')!;expect(inspector.closest('details')?.open).toBe(true);
 button('Reply to selection').click();await tick();expect(f.host.textContent).toContain('Select one nonempty range');expect(inspector.textContent).toContain('source-identity at $.replyTargets');expect(f.host.querySelector('.dialectic-dcp-record')?.textContent).toContain('source-expired');
});

it('opens a saved conversation from the modal chooser, retaining the previous unsaved editor and reopening without remounts',async()=>{
 const saved=await setup(true,true,true,true,true);saved.type!('A saved conversation to reopen.');saved.c!.submit();
 const resource=captureNative(saved.editor.repository.readState(),saved.c!.resourceId()),native=new TextDecoder().decode(nativeBytes(resource));
 const f=await setup(true,true,true,true,true),c=f.c!,e=f.editor,before=c.resourceId(),oldSession=c.session(),oldText=f.text!(),oldMount=e.mounts.get(oldText.key);f.type!('Keep my unsaved draft.');cleanup.push(e.installGateway(document));
 const fetcher=vi.fn(async(url:any)=>Response.json(String(url).endsWith('/api/native/open')?{Success:true,Data:{kind:'native',resourceId:resource.resourceId,native,baseline:{nativeHash:'fixture',markdownHash:null,generation:null}}}:String(url).includes('listDocuments')?{files:['conversation.ink']}:String(url).includes('listFolders')?{folders:[]}:{Success:false,Error:'No auxiliary services in fixture'}));vi.stubGlobal('fetch',fetcher);
 const open=async()=>{
  [...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Open…')!.click();
  await vi.waitFor(()=>expect(document.querySelector('[role="option"]')).toBeTruthy());
  (document.querySelector('[role="option"]') as HTMLButtonElement).click();
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b=>b.textContent==='Open')!.click();
  await vi.waitFor(()=>expect(c.resourceId()).toBe(resource.resourceId));
  await vi.waitFor(()=>expect([...f.host.querySelectorAll('button')].find(b=>b.textContent==='Open…')?.hasAttribute('disabled')).toBe(false));
 };
 await open();expect(c.committed()).toHaveLength(1);expect(f.host.textContent).toContain('A saved conversation to reopen.');expect(document.querySelector('[role="dialog"]')).toBeNull();
 expect(e.mounts.get(oldText.key)).toBe(oldMount);expect(oldSession?.projection.node(oldText.key)).toBeTruthy();expect(nativeDocumentSession(e).isDirty(before)).toBe(true);
 const retained=c.session(),snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(retained!.projection as any,'build');await open();expect(c.session()).toBe(retained);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const calls=fetcher.mock.calls.length;f.type!('A local new draft');expect(fetcher.mock.calls).toHaveLength(calls);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(fetcher.mock.calls.some(([url])=>String(url).includes('/api/native/save'))).toBe(false);
});
it('reopens the Dialectic chooser with a loading error and preserves the active conversation',async()=>{
 const f=await setup(true,true,true,true,true),c=f.c!,session=c.session(),id=c.resourceId();cleanup.push(f.editor.installGateway(document));f.type!('Retain this draft.');
 vi.stubGlobal('fetch',vi.fn(async(url:any)=>Response.json(String(url).endsWith('/api/native/open')?{Success:false,Error:'Fixture file unavailable'}:String(url).includes('listDocuments')?{files:['missing.ink']}:String(url).includes('listFolders')?{folders:[]}:{Success:false,Error:'No auxiliary services in fixture'})));
 [...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Open…')!.click();
 await vi.waitFor(()=>expect(document.querySelector('[role="option"]')).toBeTruthy());(document.querySelector('[role="option"]') as HTMLButtonElement).click();
 [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b=>b.textContent==='Open')!.click();
 await vi.waitFor(()=>expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Fixture file unavailable'));
 expect(c.resourceId()).toBe(id);expect(c.session()).toBe(session);expect(f.host.textContent).toContain('Retain this draft.');expect(document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Close dialog"]')?.disabled).toBe(false);
});

it('test-phase logging records committed native contributions but does no logging or projection work while typing',async()=>{
 const f=await setup(true,true,true,true,true,true),c=f.c!,e=f.editor;
 e.setAssetContext(()=>({cavernId:'fixture-cavern',session:'fixture-session'}));
 const messages:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{if(String(url).endsWith('/session'))return Response.json({token:'fixture-session-token'});if(String(url).endsWith('/diagnostics')){messages.push(JSON.parse(init.body));return Response.json({logged:true});}return Response.json({});}));
 const projected=c.historyDiagnostics.projected,snapshots=vi.spyOn(e.repository,'snapshot');f.type!('Small human contribution.');await tick();expect(messages).toEqual([]);expect(c.historyDiagnostics.projected).toBe(projected);expect(snapshots).not.toHaveBeenCalled();
 c.submit();await vi.waitFor(()=>expect(messages.some(m=>m.kind==='contribution.committed')).toBe(true));
 const record=messages.find(m=>m.kind==='contribution.committed'),content=JSON.parse(record.items[0].content);expect(content.participant.kind).toBe('human');expect(content.composition.children[0].text).toBe('Small human contribution.');
 const count=messages.length,after=c.historyDiagnostics.projected;f.type!('Unsubmitted typing.');await tick();expect(messages).toHaveLength(count);expect(c.historyDiagnostics.projected).toBe(after);
});

it('resends text as new native identities, preserving the original and an unfinished draft',async()=>{
 const f=await setup(true,true,true,true,true),c=f.c!,e=f.editor;c.setProviderMode('mock');
 f.type!('Repeat this request.');const source=f.text!(),sourceId=source.payload.id,mount=e.mounts.get(source.key);c.submit();const original=c.committed()[0];f.type!('Keep this unfinished draft.');const draftId=c.draft()!.id,draftText=f.text!();
 const snapshots=vi.spyOn(e.repository,'snapshot');await Promise.all([c.resend(original.id),c.resend(original.id)]);
 expect(c.committed()).toHaveLength(3);const resent=c.committed()[1],node=c.resolve(c.target(resent.id))!,text=c.session()!.projection.node(node.children[0])!;
 expect(resent.id).not.toBe(original.id);expect(text.payload.id).not.toBe(sourceId);expect(c.references()!.text(text.contentKey)).toBe('Repeat this request.');expect(resent.data.author).toBe('human');expect(c.committed()[2].data.replies[0].blockId).toBe(resent.id);
 expect(c.draft()!.id).toBe(draftId);expect(c.references()!.text(draftText.contentKey)).toBe('Keep this unfinished draft.');expect(e.mounts.get(source.key)).toBe(mount);expect(c.references()!.text(source.contentKey)).toBe('Repeat this request.');expect(snapshots).not.toHaveBeenCalled();
 e.repository.undo();expect(c.committed()).toHaveLength(2);e.repository.undo();expect(c.committed()).toHaveLength(1);expect(c.draft()!.id).toBe(draftId);
});

it('retrieves an unselected AI-authored passage and anchors three quoted commentaries without replacing the source',async()=>{
 const f=await setup(true,true,true,true,true),c=f.c!,e=f.editor;
 const original='Historical objects acquire different meanings because each generation meets them with fresh concerns, memories, and moral questions. A coin, a uniform, or a ruin is never only what it once was; it is also what later people need it to signify. But meaning is not endlessly free: the object’s material traces resist whatever story we would like to tell. So the real question is not whether objects change, but how interpretation stays accountable to evidence while still remaining alive to the present.';
 const quotes=['each generation meets them with fresh concerns, memories, and moral questions','A coin, a uniform, or a ruin is never only what it once was','the object’s material traces resist whatever story we would like to tell'];
 const comments=['Generational concerns change which questions are asked of the evidence.','Later uses add meanings without erasing the object’s earlier history.','Material evidence constrains interpretations even when present concerns motivate them.'];
 const sourceId=String(f.text!().payload.id),participant={id:c.resourceId()+':ai',kind:'ai',name:'AI participant'};
 f.type!(original);
 const draft=c.resolve(c.target(c.draft()!.id))!;
 e.commands.setPayloadField(draft.key,'metadata',{dialectic:{...JSON.parse(JSON.stringify(draft.payload.metadata)).dialectic,author:'ai',participant}});c.submit();
 f.type!('Return to the passage you wrote about historical objects. Choose three short quotations and present an annotated commentary with native source anchors.');c.submit();
 const source=c.resolve(c.target(sourceId,'block'))!,cells=[...source.inlineContent],mount=e.mounts.get(source.key),snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(req,sources)=>{
  expect(req.structuralContext.sources.some((s:any)=>s.target.blockId===sourceId)).toBe(false);
  const inventory=await sources.tool({id:'discover',tool:'list_text_blocks',arguments:{...inventoryArgs,participantId:participant.id,fromOrdinal:1}});
  expect(inventory.items).toHaveLength(1);expect(inventory.items[0]).toMatchObject({blockId:sourceId,readRequired:true,contribution:{author:'ai',ordinal:1,participant}});
  const read=await sources.tool({id:'read',tool:'read_source',arguments:{handle:inventory.items[0].handle}});
  expect(read).toMatchObject({status:'complete',sourceAuthor:'ai',text:original});
  expect(read.handle).toMatch(/^src:[A-Za-z0-9_-]{22}:b[1-9][0-9]*$/);
  const repeated=await sources.tool({id:'rediscover',tool:'list_text_blocks',arguments:{...inventoryArgs,participantId:participant.id,fromOrdinal:1}});
  expect(repeated.items[0].handle).toBe(read.handle);expect(repeated.items[0].contribution.handle).toBe(inventory.items[0].contribution.handle);
  const search=await sources.tool({id:'search',tool:'search_symposium',arguments:{query:'Historical objects acquire',limit:5}});
  expect(search.items[0].handle).toBe(read.handle);expect(search.items[0].revision).toBe(read.revision);
  const v:any=dcpResponse(req.exchange);v.anchors=quotes.map((exact,i)=>({id:'new:r'+(i+1),source:read.handle,revision:read.revision,selector:{exact,prefix:'',suffix:''}}));
  v.replyTargets=v.anchors.map((a:any)=>a.id);v.glosses=comments.map((text,i)=>({id:'new:g'+(i+1),target:'new:r'+(i+1),type:'commentary',text}));
  v.composition=quotes.flatMap((quote,i)=>[{id:'new:b'+(i*2+1),kind:'paragraph',markup:'“'+quote+'”',ranges:[]},{id:'new:b'+(i*2+2),kind:'paragraph',markup:comments[i],ranges:[]}]);return JSON.stringify(v);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(3);expect(source.inlineContent).toEqual(cells);expect(e.mounts.get(source.key)).toBe(mount);
 const marks=source.payload.standoffProperties as any[],anchors=marks.filter(p=>p.type==='dialectic/range-anchor');expect(anchors).toHaveLength(3);
 expect(anchors.map(a=>Array.from(original).slice(a.start,a.end+1).join(''))).toEqual(quotes);
 expect(c.frontier()!.data.discursiveReferences?.map(r=>r.kind)).toEqual(['range','range','range']);
 for(const mark of marks.filter(p=>p.type==='mutable/gloss'))expect(mark.metadata.dcp).toMatchObject({sourceAuthor:'ai',appliedTo:'existing-source'});
 expect(marks.filter(p=>p.type==='mutable/gloss')).toHaveLength(3);
 expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(source.payload.standoffProperties??[]).toHaveLength(0);e.repository.redo();expect((source.payload.standoffProperties as any[]).filter(p=>p.type==='dialectic/range-anchor')).toHaveLength(3);
});

it('keeps typed handles stable within an exchange and rejects stale, unknown, wrong-kind and native-GUID authority',async()=>{
 const f=await setup(true,true,true,true,true),c=f.c!,e=f.editor;f.type!('Rain is forecast.');c.submit();
 const {prepare}=await import('./dcp/exchange');let historical:any;
 for(let exchange=0;exchange<2;exchange++)await c.askMock(async(req,sources)=>{
  const page=await sources.tool({id:'inventory',tool:'list_text_blocks',arguments:{...inventoryArgs,fromOrdinal:1}}),item=page.items[0];
  const source=await sources.tool({id:'read',tool:'read_source',arguments:{handle:item.handle}});
  expect(sources.issue(source.target)).toBe(item.handle);expect(item.contribution.handle).toMatch(/^src:[A-Za-z0-9_-]{22}:c[1-9][0-9]*$/);
  expect(source.target.blockId).toBe(item.blockId);expect(source.owner).toBe(c.resourceId());
  if(historical){expect(source.handle).not.toBe(historical.handle);expect(source.revision).not.toBe(historical.revision);expect(await sources.source(historical.handle)).toMatchObject({status:'unauthorized'});}
  const valid:any=dcpResponse(req.exchange);valid.composition=[{id:'new:b1',kind:'paragraph',markup:'A source quotation.',ranges:[]}];valid.anchors=[{id:'new:r1',source:source.handle,revision:source.revision,selector:{exact:'Rain',prefix:'',suffix:''}}];valid.replyTargets=['new:r1'];
  const revision=e.repository.state.revision;
  for(const handle of ['new:b1','new:r1',item.blockId,source.handle.replace(/b[0-9]+$/,'b99999'),item.contribution.handle,...historical?[historical.handle]:[]]){
   const bad=structuredClone(valid);bad.anchors[0].source=handle;await expect(prepare(JSON.stringify(bad),req.exchange,c.resourceId(),e.visualEffects,sources,true)).rejects.toThrow();
  }
  for(const mutate of [
   (v:any)=>v.anchors[0].revision=historical?.revision??'unissued-revision',
   (v:any)=>v.anchors[0].selector.exact='Not the source',
   (v:any)=>v.replyTargets=['new:b1'],
   (v:any)=>v.replyTargets=['new:r999'],
   (v:any)=>v.arguments=[{id:'new:arg1',anchor:source.handle}],
   (v:any)=>v.relations=[{id:'new:rel1',kind:'argument',type:'supports',from:'new:r1',to:'new:r1'}],
   (v:any)=>v.entities=[{id:'new:b1',name:'Rain',typename:'Concept',description:'',aliases:[]}]
  ]){const bad=structuredClone(valid);mutate(bad);await expect(prepare(JSON.stringify(bad),req.exchange,c.resourceId(),e.visualEffects,sources,true)).rejects.toThrow();}
  expect(()=>sources.issue({...source.target,resourceId:'foreign-document'})).toThrow('Outside Symposium');
  expect(e.repository.state.revision).toBe(revision);historical=source;return JSON.stringify(valid);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(3);
});

it('repairs a typed alias collision once with stable source authority and all dependent references updated',async()=>{
 const f=await setup(true,true,true,true,true),c=f.c!,e=f.editor;f.type!('Rain is forecast.');const original=f.text!();c.submit();
 let request:any,source:any,turns=0;
 const receipt={provider:'openai',model:'fixture',startedUtc:'start',completedUtc:'end',usage:null,stop:'completed',cost:{status:'unknown'}};
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{
  const body=init?.body&&JSON.parse(init.body);
  if(url.endsWith('/session'))return Response.json({token:'fixture-token'});
  if(url.endsWith('/settings'))return Response.json({settings:body.settings,ready:true});
  if(url.endsWith('/exchange')){request=body.request;return Response.json({id:'fixture-exchange',settings:c.providerSettings()});}
  if(url.endsWith('/turn')){
   turns++;let calls:any[]=[],text='';
   if(body.round===0)calls=[{id:'discover',tool:'list_text_blocks',arguments:inventoryArgs}];
   else if(body.round===1)calls=[{id:'read',tool:'read_source',arguments:{handle:body.results[0].result.items[0].handle}}];
   else {
    if(body.round===2)source=body.results[0].result;
    else {expect(body.round).toBe(3);expect(body.repair).toBe(true);expect(body.diagnostic).toMatchObject({code:'identity',path:'$.composition[0]'});expect(c.committed()).toHaveLength(1);}
    const anchor=body.round===2?'new:r1':'new:r2',v:any=dcpResponse(request.exchange);
    v.composition=[{id:body.round===2?'new:r1':'new:b1',kind:'paragraph',markup:'<annotation type="dialectic/suggestion" id="new:s1">Plan indoors.</annotation>',ranges:[]}];
    v.anchors=[{id:anchor,source:source.handle,revision:source.revision,selector:{exact:'Rain is forecast.',prefix:'',suffix:''}}];v.replyTargets=[anchor];
    v.interpretations=[{id:'new:m1',target:anchor,type:'dialectic/claim',ref:null,attributes:[]}];v.glosses=[{id:'new:g1',target:anchor,type:'commentary',text:'Weather informs the plan.'}];
    v.arguments=[{id:'new:arg1',anchor},{id:'new:arg2',anchor:'new:s1'}];v.relations=[{id:'new:rel1',kind:'argument',type:'supports',from:'new:arg1',to:'new:arg2'}];text=JSON.stringify(v);
   }
   return new Response(JSON.stringify({type:'result',text,calls,receipt})+'\n');
  }return Response.json({});
 }));
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.configureProvider({provider:'openai',model:'fixture',maxOutputTokens:2048,repair:true,cadence:'conversational'},'fixture-key');await c.ask();
 expect(c.notice()).toBe('');expect(turns).toBe(4);expect(c.committed()).toHaveLength(2);
 const d=c.frontier()!.data.dcp!,ids=d.identityMap as any;expect(d.provider?.attempts.filter(a=>a.repair)).toHaveLength(1);expect(d.tools).toHaveLength(2);
 expect(ids['new:r1']).toBeUndefined();expect(c.resolveReference(ids['new:r2']).text).toBe('Rain is forecast.');expect(ids['new:arg1'].kind).toBe('argument');expect(ids['new:rel1'].kind).toBe('argument-relation');
 expect((original.payload.standoffProperties as any[]).filter(p=>p.type==='dialectic/range-anchor')).toHaveLength(1);
 expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
});


it('qualifies native authoring Stage 1 with shared human operations, immutable annotations, history and persistence',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true),c=f.c!,e=f.editor;
 f.type!('The worn cup preserves ordinary life.');const original=f.text!(),originalCells=[...original.inlineContent];c.submit();
 const sourceText=()=>original.inlineContent.map(key=>c.session()!.projection.node(key)!.payload.text).join('');
 const paragraph=(id:number,markup:string)=>({id:'new:b'+id,kind:'paragraph',markup,ranges:[]});
 const native=nativeDocumentSession(e);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'stage1.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 let inspected:any;
 await c.askMock(async(request,sources)=>{
  expect(request.nativeAuthoring).toBe(1);expect(request.legend.blocks).toEqual(expect.arrayContaining(['heading','grid','youtube']));
  expect(request.legend.types.find((t:any)=>t.type==='text/colour').attributes).toEqual(['value']);
  const detail=await sources.tool({id:'cap',tool:'describe_capabilities',arguments:{ids:['composition.heading','media.youtube']}});
  expect(detail.items.every((x:any)=>x.authorable)).toBe(true);expect(detail.items[1].capabilityState).toBe('authorable-with-prerequisites');
  const inventory=await sources.tool({id:'inventory',tool:'list_text_blocks',arguments:{cursor:null,limit:10,contributionId:null,participantId:null,fromOrdinal:1}});
  const source=await sources.tool({id:'read',tool:'read_source',arguments:{handle:inventory.items[0].handle}});inspected=source.inspection;
  const value:any=dcpResponse(request.exchange);
  value.composition=[{...paragraph(1,'Objects'),kind:'heading',level:2},{id:'new:b2',kind:'grid',rows:[[[paragraph(3,'<annotation type="text/colour" value="#336699">Wear</annotation>')],[{...paragraph(4,'<boundary id="new:pos1"/>Use<boundary id="new:pos2"/>'),ranges:[{id:'new:s1',type:'text/colour',from:'new:pos1',to:'new:pos2',ref:null,attributes:[{name:'value',value:'#336699'}]}]}]]]},{id:'new:b5',kind:'youtube',url:'Zsqep7_9_mw'}];
  value.anchors=[{id:'new:r1',source:source.handle,revision:source.revision,selector:{exact:'worn cup',prefix:'',suffix:''}}];
  value.interpretations=[{id:'new:m1',target:'new:r1',type:'text/colour',ref:null,attributes:[{name:'value',value:'#336699'}]}];
  return JSON.stringify(value);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);expect(inspected.root.nativeId).toBe(original.payload.id);
 const generated=c.resolve(c.target(c.frontier()!.id))!,nodes=generated.children.map(k=>c.session()!.projection.node(k)!);
 expect(nodes.map(n=>n.viewType)).toEqual(['standoff-editor-block','grid-block','youtube-video-block']);
 expect(nodes[0].payload.blockProperties).toEqual([headingProperty('standoff-editor-block',2)]);
 const grid=nodes[1],row=c.session()!.projection.node(grid.children[0])!,cells=row.children.map(k=>c.session()!.projection.node(k)!);
 expect(row.viewType).toBe('grid-row-block');expect(cells.map(n=>n.viewType)).toEqual(['grid-cell-block','grid-cell-block']);
 const texts=cells.map(cell=>c.session()!.projection.node(cell.children[0])!);
 for(const text of texts)expect((text.payload.standoffProperties as any[]).find(p=>p.type==='text/colour')).toMatchObject({value:'#336699',start:0,end:text.inlineContent.length-1});
 expect(nodes[2].payload.metadata).toMatchObject({url:'Zsqep7_9_mw'});
 expect(sourceText()).toBe('The worn cup preserves ordinary life.');expect(original.inlineContent).toEqual(originalCells);
 expect((original.payload.standoffProperties as any[]).find(p=>p.type==='text/colour')).toMatchObject({start:4,end:11,value:'#336699',metadata:{dcp:{appliedTo:'existing-source',sourceAuthor:'human'}}});
 expect(()=>e.commands.replaceInlineRange(original.key,0,1,'X')).toThrow(/protected/);
 expect(native.isDirty(c.resourceId())).toBe(true);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(c.committed()).toHaveLength(1);expect(original.payload.standoffProperties??[]).toHaveLength(0);expect(sourceText()).toBe('The worn cup preserves ordinary life.');
 e.repository.redo();expect(c.committed()).toHaveLength(2);expect(sourceText()).toBe('The worn cup preserves ordinary life.');
 const saved=captureNative(e.repository.readState(),c.resourceId()),loaded=decodeNative(nativeBytes(saved));
 expect(JSON.stringify(loaded)).toContain('grid-cell-block');expect(JSON.stringify(loaded)).toContain('#336699');expect(JSON.stringify(loaded)).toContain('youtube-video-block');
 // Real human menu paths, in the editable draft, use the same native preparations.
 const draftText=f.text!(),menu=blockMenuItems(e,draftText.key),add=menu.find(i=>i.label==='Add Block')!.children!;
 await add.find(i=>i.label==='Add Grid')!.children!.find(i=>i.label==='1 × 2')!.run!();
 const draft=c.resolve(c.target(c.draft()!.id))!,humanGrid=draft.children.map(k=>c.session()!.projection.node(k)!).find(n=>n.viewType==='grid-block')!;
 const shape=(n:any):any=>({type:n.viewType,children:n.children.map((k:string)=>shape(c.session()!.projection.node(k)!))});
 expect(shape(humanGrid)).toEqual(shape(grid));
 await add.find(i=>i.label==='YouTube video URL…')!.input!.submit('Zsqep7_9_mw');
 const humanMedia=draft.children.map(k=>c.session()!.projection.node(k)!).find(n=>n.viewType==='youtube-video-block')!;expect(humanMedia.payload.metadata).toEqual(nodes[2].payload.metadata);
 f.type!('Colour');e.rangeAnnotations.apply([e.textRanges.snapshot(draftText.key,0,6)],'text/colour','#336699');expect((draftText.payload.standoffProperties as any[]).find(p=>p.type==='text/colour').value).toBe('#336699');
 const reads={...c.dcpDiagnostics},fetches=(fetch as any).mock.calls.length;snapshots.mockClear();build.mockClear();f.type!('Typing');
 expect(c.dcpDiagnostics).toEqual(reads);expect((fetch as any).mock.calls.length).toBe(fetches);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
});

it('rejects Stage 1 invalid declarations and stale/foreign authority without partial source annotations',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true),c=f.c!,e=f.editor;f.type!('Original immutable text.');const original=f.text!();c.submit();
 const revision=e.repository.state.revision;
 const badNodes=[
  {id:'new:b1',kind:'heading',level:7,markup:'Invalid',ranges:[]},
  {id:'new:b1',kind:'grid',rows:[[[{id:'new:b2',kind:'paragraph',markup:'A',ranges:[]}]],[]]},
  {id:'new:b1',kind:'youtube',url:'javascript:alert(1)'},
  {id:'new:r1',kind:'heading',level:2,markup:'Wrong identity role',ranges:[]},
  {id:'new:b1',kind:'paragraph',markup:'<annotation type="text/colour" value="url(https://example.com)">X</annotation>',ranges:[]},
  {id:'new:b1',kind:'paragraph',markup:'<boundary id="new:pos1"/>X<boundary id="new:pos2"/>',ranges:[{id:'new:s1',type:'text/colour',from:'new:pos1',to:'new:pos2',ref:null,attributes:[{name:'value',value:'#123'},{name:'value',value:'#456'}]}]},
  {id:'new:b1',kind:'paragraph',markup:'<annotation type="style/glow">X</annotation>',ranges:[]},
 ];
 for(const bad of badNodes){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[bad]}));expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
 for(const invalid of ['stale','foreign','late-invalid']){
  await c.askMock(async(req,sources)=>{
   const inventory=await sources.tool({id:'i',tool:'list_text_blocks',arguments:{cursor:null,limit:10,contributionId:null,participantId:null,fromOrdinal:1}}),source=await sources.tool({id:'r',tool:'read_source',arguments:{handle:inventory.items[0].handle}});
   const v:any=dcpResponse(req.exchange);v.anchors=[{id:'new:r1',source:invalid==='foreign'?'src:other:b1':source.handle,revision:invalid==='stale'?'expired':source.revision,selector:{exact:'immutable',prefix:'',suffix:''}}];
   v.interpretations=[{id:'new:m1',target:'new:r1',type:'text/colour',ref:null,attributes:[{name:'value',value:invalid==='late-invalid'?'inherit':'#336699'}]}];return JSON.stringify(v);
  });expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);expect(original.payload.standoffProperties??[]).toHaveLength(0);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 }
 // Force failure during canonical insertion, after prepared source/definition writes.
 const insert=e.commands.insert.bind(e.commands),fail=vi.spyOn(e.commands,'insert').mockImplementation((dto,position)=>{if((dto.metadata as any)?.dialectic?.state==='committed')throw Error('Injected admission failure');return insert(dto,position);});
 await c.askMock(async(req,sources)=>{const p=await sources.tool({id:'p',tool:'read_source',arguments:{handle:req.primaryReply}}),r=await sources.tool({id:'r',tool:'read_source',arguments:{handle:p.children[0]}});const v:any=dcpResponse(req.exchange);v.anchors=[{id:'new:r1',source:r.handle,revision:r.revision,selector:{exact:'immutable',prefix:'',suffix:''}}];v.interpretations=[{id:'new:m1',target:'new:r1',type:'text/colour',ref:null,attributes:[{name:'value',value:'#336699'}]}];return JSON.stringify(v);});
 fail.mockRestore();expect(c.notice()).toContain('Injected admission failure');expect(e.repository.state.revision).toBe(revision);expect(original.payload.standoffProperties??[]).toHaveLength(0);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
});

it('inspects native compound structure, configuration and unfamiliar content with bounded current handles',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true),c=f.c!,e=f.editor;f.type!('Read these structures.');
 const heading=prepareHeading({id:'inspection-heading',type:'standoff-editor-block',text:'Evidence',standoffProperties:[{id:'colour',type:'text/colour',start:0,end:7,value:'#336699'}]},2);
 const grid=prepareGrid([[[heading],[{id:'unfamiliar',type:'future/example',metadata:{secret:'must not leak'},children:[{id:'nested',type:'standoff-editor-block',text:'Preserved child'}]}]]]);grid.id='inspection-grid';
 const draft=c.resolve(c.target(c.draft()!.id))!;
 e.commands.insert(grid,{kind:'at',parentKey:draft.key,index:draft.children.length});
 e.commands.insert({id:'inspection-tabs',type:'tab-row-block',metadata:{orientation:'vertical',secret:'must not leak'},children:[{id:'panel',type:'tab-block',metadata:{name:'Sources'},children:[{id:'panel-text',type:'standoff-editor-block',text:'A panel'}]}]},{kind:'at',parentKey:draft.key,index:draft.children.length});
 c.submit();
 await c.askMock(async(req,sources)=>{
  const source=await sources.tool({id:'inspect',tool:'read_source',arguments:{handle:req.primaryReply}});
  const tree=source.inspection;expect(tree.lossless).toBe(false);expect(JSON.stringify(tree)).not.toContain('must not leak');expect(new TextEncoder().encode(JSON.stringify(tree)).length).toBeLessThanOrEqual(tree.limits.bytes);
  const grid=tree.root.children.find((n:any)=>n.kind==='grid');expect(grid.nativeId).toBe('inspection-grid');expect(grid.children[0].kind).toBe('row');
  const cells=grid.children[0].children;expect(cells.map((n:any)=>n.kind)).toEqual(['cell','cell']);
  const text=cells[0].children[0];expect(text.properties).toContainEqual(expect.objectContaining({type:'block/font/size',value:'h2'}));expect(text.annotations).toContainEqual(expect.objectContaining({type:'text/colour',value:'#336699'}));
  const unknown=cells[1].children[0];expect(unknown).toMatchObject({nativeId:'unfamiliar',nativeType:'future/example',kind:'native'});expect(unknown.omissions.length).toBeGreaterThan(0);expect(unknown.children[0].handle).toMatch(/^src:/);
  const read=await sources.tool({id:'unknown',tool:'read_source',arguments:{handle:unknown.handle}});expect(read.inspection.root.children[0]).toMatchObject({nativeId:'nested',text:'Preserved child'});
  const tabs=tree.root.children.find((n:any)=>n.kind==='tabs');expect(tabs.configuration.orientation).toBe('vertical');expect(tabs.children[0].configuration.name).toBe('Sources');expect(tabs.children[0].children[0].text).toBe('A panel');
  return JSON.stringify(dcpResponse(req.exchange));
 });expect(c.notice()).toBe('');
});

it('bounds Stage 1 inspection work and generated grid descendants without increasing exchange budgets',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true),c=f.c!,e=f.editor;f.type!('Inspect the collection.');const draft=c.resolve(c.target(c.draft()!.id))!;
 e.commands.insert({id:'collection',type:'container-block',children:Array.from({length:40},(_,i)=>({id:'item-'+i,type:'standoff-editor-block',text:'Item '+i}))},{kind:'at',parentKey:draft.key,index:draft.children.length});c.submit();
 await c.askMock(async(req,sources)=>{
  const reads=vi.spyOn(sources,'source');
  const result=await sources.tool({id:'inspect',tool:'read_source',arguments:{handle:req.primaryReply}});
  expect(reads.mock.calls.length).toBeLessThanOrEqual(24);expect(result.inspection.omissions.join(' ')).toMatch(/limit/);
  expect(new TextEncoder().encode(JSON.stringify(result.inspection)).length).toBeLessThanOrEqual(16000);reads.mockRestore();
  for(let i=0;i<5;i++)await sources.tool({id:'cap-'+i,tool:'describe_capabilities',arguments:{ids:['inspection.native']}});
  await expect(sources.tool({id:'seventh',tool:'describe_capabilities',arguments:{ids:['inspection.native']}})).rejects.toThrow('tool-call budget');
  return JSON.stringify(dcpResponse(req.exchange));
 });expect(c.notice()).toBe('');
 const revision=e.repository.state.revision;
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'grid',rows:Array.from({length:16},(_,r)=>Array.from({length:16},(_,col)=>[{id:'new:b'+(2+r*16+col),kind:'paragraph',markup:'x',ranges:[]}]))}]}));
 expect(c.notice()).toContain('native Block budget');expect(e.repository.state.revision).toBe(revision);
});

it('qualifies Stage 2 text appearance, literal code/source and curated annotations through native admission',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true,true),c=f.c!,e=f.editor;
 f.type!('The worn cup preserves ordinary life.');const original=f.text!(),originalCells=[...original.inlineContent];c.submit();
 const literal='<tag a="&">😀</tag>\r\nnext\rfinal';
 const native=nativeDocumentSession(e);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'stage2a.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(req,sources)=>{
  expect(req.textAuthoring).toBe(1);expect(req.authoring.examples[0].response.composition[0].textStyle).toBeNull();
  expect(req.legend.types.map((t:any)=>t.type)).toEqual(expect.arrayContaining(['style/strikethrough','style/subscript','style/superscript','style/highlight','text/background-colour','reference/url']));
  const inventory=await sources.tool({id:'i',tool:'list_text_blocks',arguments:inventoryArgs});
  const source=await sources.tool({id:'r',tool:'read_source',arguments:{handle:inventory.items[0].handle}});
  const value:any=dcpResponse(req.exchange);
  value.composition=[
   {id:'new:b1',kind:'heading',level:2,textStyle:{alignment:'center',indent:1,size:null},markup:'Literal evidence',ranges:[]},
   {id:'new:b2',kind:'paragraph',textStyle:{alignment:'right',indent:2,size:'three-quarters'},markup:'<annotation type="style/strikethrough">old</annotation> <annotation type="style/subscript">2</annotation> <annotation type="style/superscript">3</annotation> <annotation type="style/highlight">key</annotation> <boundary id="new:pos1"/>link<boundary id="new:pos2"/>',ranges:[{id:'new:s1',type:'reference/url',from:'new:pos1',to:'new:pos2',ref:null,attributes:[{name:'value',value:'https://example.org/evidence'}]},{id:'new:s2',type:'text/background-colour',from:'new:pos1',to:'new:pos2',ref:null,attributes:[{name:'value',value:'#fff000'}]}]},
   {id:'new:b3',kind:'code',language:'typescript',text:literal},
   {id:'new:b4',kind:'source',format:'markdown',text:literal},
   {id:'new:b5',kind:'source',format:'html',text:literal}
  ];
  value.anchors=[{id:'new:r1',source:source.handle,revision:source.revision,selector:{exact:'worn cup',prefix:'',suffix:''}}];
  value.interpretations=[{id:'new:m1',target:'new:r1',type:'reference/url',ref:null,attributes:[{name:'value',value:'https://example.org/cup'}]}];
  return JSON.stringify(value);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const generated=c.resolve(c.target(c.frontier()!.id))!,nodes=generated.children.map(k=>c.session()!.projection.node(k)!);
 expect(nodes.map(n=>n.viewType)).toEqual(['standoff-editor-block','standoff-editor-block','standoff-code-block','mutable/markdown-source-block','mutable/html-source-block']);
 expect(nodes[0].payload.blockProperties).toEqual(expect.arrayContaining([{type:'block/font/size',value:'h2'},{type:'block/alignment',value:'center'},{type:'block/indent',value:'1'}]));
 expect(nodes[1].payload.blockProperties).toEqual([{type:'block/alignment',value:'right'},{type:'block/indent',value:'2'},{type:'block/font/size',value:'three-quarters'}]);
 const marks=nodes[1].payload.standoffProperties as any[];
 for(const type of ['style/strikethrough','style/subscript','style/superscript','style/highlight','text/background-colour','reference/url'])expect(marks.find(p=>p.type===type),type).toBeTruthy();
 expect(marks.find(p=>p.type==='reference/url')).toMatchObject({start:12,end:15,value:'https://example.org/evidence'});
 const codeText=c.session()!.projection.node(nodes[2].children[0])!;
 expect(codeText.inlineContent.map(k=>c.session()!.projection.node(k)!.payload.text).join('')).toBe(literal);
 expect(nodes[2].payload.metadata).toMatchObject({markdownCode:{language:'typescript'}});
 for(const n of nodes.slice(3)){expect(n.payload.text).toBe(literal);expect(n.payload.sourceFormat).toMatchObject({version:1});expect(e.canEditText(n.key)).toBe(false);expect(()=>e.commands.setPayloadField(n.key,'text','Changed')).toThrow(/protected/);}
 expect(original.inlineContent).toEqual(originalCells);expect((original.payload.standoffProperties as any[]).find(p=>p.type==='reference/url')).toMatchObject({start:4,end:11,value:'https://example.org/cup'});
 const select=f.host.querySelector<HTMLSelectElement>('.standoff-code select')!;expect(select).toBeTruthy();expect(select.disabled).toBe(true);
 const revision=e.repository.state.revision;select.value='markdown';select.dispatchEvent(new Event('change',{bubbles:true}));expect(e.repository.state.revision).toBe(revision);
 const convert=[...f.host.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent==='Convert to Mutable Ink…');expect(convert).toHaveLength(2);expect(convert.every(b=>b.disabled)).toBe(true);
 expect(native.isDirty(c.resourceId())).toBe(true);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(c.committed()).toHaveLength(1);expect(original.payload.standoffProperties??[]).toHaveLength(0);
 e.repository.redo();expect(c.committed()).toHaveLength(2);
 const saved=captureNative(e.repository.readState(),c.resourceId()),loaded=decodeNative(nativeBytes(saved));
 const savedSources=Object.values(loaded.contents).filter(n=>n.viewType.endsWith('-source-block'));expect(savedSources).toHaveLength(2);expect(savedSources.every(n=>n.payload.text===literal)).toBe(true);expect(JSON.stringify(loaded)).toContain('three-quarters');
 await c.askMock(async(req,sources)=>{
  const read=await sources.tool({id:'i',tool:'read_source',arguments:{handle:req.primaryReply}}),tree=read.inspection.root;
  const code=tree.children.find((n:any)=>n.kind==='code');expect(code.configuration.language).toBe('typescript');expect(code.nativeId).toBe(nodes[2].payload.id);expect(code.children[0].text).toBe(literal);
  const source=tree.children.find((n:any)=>n.nativeType==='mutable/html-source-block');expect(source).toMatchObject({kind:'source',literal:true,text:literal,configuration:{sourceFormat:{format:'html',version:1}}});
  const exact=await sources.tool({id:'s',tool:'read_source',arguments:{handle:source.handle}});expect(exact.status).toBe('complete');expect(exact.text).toBe(literal);
  return JSON.stringify(dcpResponse(req.exchange));
 });expect(c.notice()).toBe('');
 // Human menu factories create the same native ownership and configuration.
 const add=blockMenuItems(e,f.text!().key).find(i=>i.label==='Add Block')!.children!;
 await add.find(i=>i.label==='Standoff code')!.children!.find(i=>i.label==='TypeScript')!.run!();
 await add.find(i=>i.label==='HTML source')!.run!();
 const draft=c.resolve(c.target(c.draft()!.id))!,human=draft.children.map(k=>c.session()!.projection.node(k)!);
 expect(human.find(n=>n.viewType==='standoff-code-block')!.payload.metadata).toEqual(nodes[2].payload.metadata);
 expect(human.find(n=>n.viewType==='mutable/html-source-block')!.payload.sourceFormat).toEqual(nodes[4].payload.sourceFormat);
 f.type!('Native link');e.rangeAnnotations.apply([e.textRanges.snapshot(f.text!().key,0,6)],'reference/url','https://example.org/cup');
 expect((f.text!().payload.standoffProperties as any[]).find(p=>p.type==='reference/url').value).toBe('https://example.org/cup');
 snapshots.mockClear();build.mockClear();const reads={...c.dcpDiagnostics},fetches=(fetch as any).mock.calls.length;f.type!('Typing');
 expect(c.dcpDiagnostics).toEqual(reads);expect((fetch as any).mock.calls.length).toBe(fetches);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const humanCode=human.find(n=>n.viewType==='standoff-code-block')!,codeSelect=[...f.host.querySelectorAll<HTMLSelectElement>('.standoff-code select')].at(-1)!;
 expect(e.canEditText(humanCode.key)).toBe(true);expect(codeSelect.disabled).toBe(false);
 c.submit();expect(e.canEditText(humanCode.key)).toBe(false);expect(codeSelect.disabled).toBe(true);
 e.repository.undo();expect(e.canEditText(humanCode.key)).toBe(true);expect(codeSelect.disabled).toBe(false);
});

it('rejects invalid Stage 2 text declarations atomically and retains the existing source and output budgets',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true,true),c=f.c!,e=f.editor;f.type!('Original immutable passage.');const original=f.text!();c.submit();
 const revision=e.repository.state.revision,paragraph={id:'new:b1',kind:'paragraph',markup:'Text',ranges:[]};
 const invalid=[
  ...[{alignment:'diagonal',indent:null,size:null},{alignment:null,indent:-1,size:null},{alignment:null,indent:0.5,size:null},{alignment:null,indent:null,size:'giant'},{alignment:null,indent:null,size:null,metadata:{}},{}].map(textStyle=>({...paragraph,textStyle})),
  {...paragraph,kind:'heading',level:2,textStyle:{alignment:null,indent:null,size:'normal'}},
  {id:'new:b1',kind:'code',language:'\n',text:'x'}, {id:'new:b1',kind:'code',language:'plain',text:'\uD800'},
  {id:'new:b1',kind:'source',format:'javascript',text:'x'}, {id:'new:b1',kind:'source',format:'html',text:'x',metadata:{}},
  ...['javascript:alert(1)','https://','data:text/html,x'].map(value=>({...paragraph,markup:`<annotation type="reference/url" value="${value}">x</annotation>`})),
  {...paragraph,markup:'<annotation type="style/highlight" value="red">x</annotation>'},
  {...paragraph,markup:'<annotation type="text/background-colour" value="inherit">x</annotation>'},
  {id:'new:b1',kind:'source',format:'markdown',text:'x'.repeat(24001)}
 ];
 for(const bad of invalid){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[bad]}));expect(c.notice(),JSON.stringify(bad).slice(0,160)).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
 for(const mode of ['stale','foreign','invalid-style','insertion']){
  const insert=e.commands.insert.bind(e.commands),fail=mode==='insertion'?vi.spyOn(e.commands,'insert').mockImplementation((dto,pos)=>{if((dto.metadata as any)?.dialectic?.state==='committed')throw Error('Stage 2 injected admission failure');return insert(dto,pos);}):undefined;
  await c.askMock(async(req,sources)=>{
   const p=await sources.tool({id:'p',tool:'read_source',arguments:{handle:req.primaryReply}}),r=await sources.tool({id:'r',tool:'read_source',arguments:{handle:p.children[0]}});
   const v:any=dcpResponse(req.exchange);v.composition=[{id:'new:b1',kind:'code',language:'plain',text:'unchanged'}];
   v.anchors=[{id:'new:r1',source:mode==='foreign'?'src:other:b1':r.handle,revision:mode==='stale'?'expired':r.revision,selector:{exact:'immutable',prefix:'',suffix:''}}];
   v.interpretations=[{id:'new:m1',target:'new:r1',type:'reference/url',ref:null,attributes:[{name:'value',value:mode==='invalid-style'?'javascript:alert(1)':'https://example.org/'}]}];return JSON.stringify(v);
  });fail?.mockRestore();expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);expect(original.payload.standoffProperties??[]).toHaveLength(0);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 }
});

it('requires negotiated Stage 2 and native code/source features for authoring',async()=>{
 for(const [native,text] of [[true,false],[false,true],[true,true]]){
  const f=await setup(true,true,true,true,true,false,true,native,text,false),c=f.c!,e=f.editor;f.type!('Features');c.submit();
  for(const node of [{id:'new:b1',kind:'code',language:'plain',text:'x'},{id:'new:b1',kind:'source',format:'markdown',text:'x'}]){
   const revision=e.repository.state.revision;await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[node]}));expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);
  }
 }
});


it('reports oversized Stage 2 literal reads explicitly without expanding retrieval budgets',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true,true),c=f.c!;f.type!('Retain source');c.submit();
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'source',format:'markdown',text:'😀'.repeat(12001)}]}));expect(c.notice()).toBe('');
 await c.askMock(async(req,sources)=>{
  const parent=await sources.tool({id:'p',tool:'read_source',arguments:{handle:req.primaryReply}});
  const source=await sources.tool({id:'s',tool:'read_source',arguments:{handle:parent.children[0]}});
  expect(source.status).toBe('truncated');expect(source.text).toBeUndefined();expect(source.reason).toContain('UTF-16');expect(source.inspection.root).toMatchObject({kind:'source',literal:true});
  return JSON.stringify(dcpResponse(req.exchange));
 });expect(c.notice()).toBe('');
});

it('qualifies Stage 2B native lists/tasks/layouts with protected state, inspection and persistence',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true,true,true,true),c=f.c!,e=f.editor;
 f.type!('The original source remains unchanged.');const original=f.text!(),cells=[...original.inlineContent];c.submit();
 const p=(id:number,text:string)=>({id:'new:b'+id,kind:'paragraph',markup:text,ranges:[],textStyle:null});
 const native=nativeDocumentSession(e);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'stage2b.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(req,sources)=>{
  expect(req.layoutAuthoring).toBe(1);expect(req.authoring.instructions).toContain('Submitted checked state is immutable');
  const parent=await sources.tool({id:'p',tool:'read_source',arguments:{handle:req.primaryReply}}),source=await sources.tool({id:'r',tool:'read_source',arguments:{handle:parent.children[0]}});
  const v:any=dcpResponse(req.exchange);v.composition=[
   {id:'new:b1',kind:'list',style:'ordered',configuration:{start:5,reversed:true,items:[{value:9,checked:true},{value:null,checked:false}]},items:[[p(2,'First'),{id:'new:b3',kind:'list',style:'bullet',configuration:null,items:[[p(4,'Nested')]]}],[p(5,'Second')]]},
   {id:'new:b6',kind:'list',style:'task',configuration:null,items:[[p(7,'Open')],[p(8,'Also open')]]},
   {id:'new:b9',kind:'table',configuration:{headers:[[true,false]]},rows:[[[p(10,'Heading')],[p(11,'Value')]]]},
   {id:'new:b12',kind:'grid',rows:[[[p(13,'Merged A'),p(14,'Merged B')]],[[p(15,'C')],[p(16,'D')]]]}
  ];v.anchors=[{id:'new:r1',source:source.handle,revision:source.revision,selector:{exact:'original source',prefix:'',suffix:''}}];v.interpretations=[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}];return JSON.stringify(v);
 });expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const node=(key:string)=>c.session()!.projection.node(key)!,generated=c.resolve(c.target(c.frontier()!.id))!,[list,tasks,table,grid]=generated.children.map(node);
 expect(list.payload.metadata).toMatchObject({htmlList:{ordered:true,start:5,reversed:true}});
 const items=list.children.map(node);expect(items[0].payload).toMatchObject({checked:true,metadata:{htmlListItem:{value:9}}});expect(items[1].payload.checked).toBe(false);
 expect(tasks.children.map(k=>node(k).payload.checked)).toEqual([false,false]);
 const tableCells=node(table.children[0]).children.map(node);expect(tableCells[0].payload.metadata).toMatchObject({htmlTableCell:{header:true,colSpan:1,rowSpan:1}});expect(tableCells[1].payload.metadata).toMatchObject({htmlTableCell:{header:false}});
 expect(grid.children.map(k=>node(k).children.length)).toEqual([1,2]);expect(node(node(grid.children[0]).children[0]).children).toHaveLength(2);
 expect(original.inlineContent).toEqual(cells);expect((original.payload.standoffProperties as any[]).some(p=>p.type==='style/highlight')).toBe(true);
 const checkboxes=[...f.host.querySelectorAll<HTMLInputElement>('.reactive-task-checkbox')];expect(checkboxes).toHaveLength(4);expect(checkboxes.every(b=>b.disabled)).toBe(true);
 const revision=e.repository.state.revision;checkboxes[0].checked=false;checkboxes[0].dispatchEvent(new Event('change',{bubbles:true}));expect(checkboxes[0].checked).toBe(true);expect(toggleTask(e,items[0].key)).toBe(false);expect(e.repository.state.revision).toBe(revision);
 expect(()=>e.commands.setPayloadField(items[0].key,'checked',false)).toThrow(/protected/);
 expect(f.host.querySelector<HTMLButtonElement>('.reactive-list-toggle')!.disabled).toBe(true);
 expect(native.isDirty(c.resourceId())).toBe(true);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(c.committed()).toHaveLength(1);expect(original.payload.standoffProperties??[]).toHaveLength(0);e.repository.redo();expect(c.committed()).toHaveLength(2);
 const saved=decodeNative(nativeBytes(captureNative(e.repository.readState(),c.resourceId())));expect(Object.values(saved.contents).find(n=>n.payload.id===items[0].payload.id)!.payload).toMatchObject({checked:true,metadata:{htmlListItem:{value:9}}});
 expect(Object.values(saved.contents).find(n=>n.payload.id===grid.payload.id)!.children).toHaveLength(2);
 const loaded=new ReactiveEditor({id:'reload-bank',type:'workspace-object-bank-block',children:[]});cleanup.push(()=>loaded.dispose());
 const bank=loaded.repository.readState();admitNative(loaded.repository,nativeBytes(saved),bank.placements[bank.rootPlacementKey].contentKey);
 const restored=captureNative(loaded.repository.readState(),c.resourceId());expect(nativeText(restored)).toBe(nativeText(saved));

 await c.askMock(async(req,sources)=>{
  const parent=await sources.tool({id:'p',tool:'read_source',arguments:{handle:req.primaryReply}});
  const read=await sources.tool({id:'l',tool:'read_source',arguments:{handle:parent.children[0]}});
  expect(read.inspection.root.configuration.htmlList).toEqual({ordered:true,start:5,reversed:true});expect(read.inspection.root.children[0]).toMatchObject({kind:'list-item',nativeId:items[0].payload.id,configuration:{checked:true,htmlListItem:{value:9}}});
  const t=await sources.tool({id:'t',tool:'read_source',arguments:{handle:parent.children[2]}});expect(t.inspection.root.children[0].children[0].configuration.htmlTableCell.header).toBe(true);
  const g=await sources.tool({id:'g',tool:'read_source',arguments:{handle:parent.children[3]}});expect(g.inspection.root.children.map((r:any)=>r.children.length)).toEqual([1,2]);
  return JSON.stringify(dcpResponse(req.exchange));
 });expect(c.notice()).toBe('');
 // Same native preparations in a human draft, then actual controls and submission.
 const draft=c.resolve(c.target(c.draft()!.id))!,text=(s:string)=>({id:crypto.randomUUID(),type:'standoff-editor-block',text:s});
 e.commands.insert(prepareList([[text('Draft task')]],'task'),{kind:'at',parentKey:draft.key,index:draft.children.length});
 const draftTask=node(draft.children.at(-1)!),owner=node(draftTask.children[0]),check=[...f.host.querySelectorAll<HTMLInputElement>('.reactive-task-checkbox')].at(-1)!;
 expect(check.disabled).toBe(false);check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));expect(owner.payload.checked).toBe(true);
 e.repository.undo();expect(owner.payload.checked).toBe(false);e.repository.redo();expect(owner.payload.checked).toBe(true);
 const target=f.text!(),add=blockMenuItems(e,target.key).find(i=>i.label==='Add Block')!.children!;
 await add.find(i=>i.label==='Add Grid')!.children!.find(i=>i.label==='2 × 2')!.run!();
 const humanGrid=draft.children.map(node).find(n=>n.viewType==='grid-block')!,secondCell=node(node(humanGrid.children[0]).children[1]);
 await blockMenuItems(e,secondCell.children[0]).find(i=>i.label==='Grids')!.children!.find(i=>i.label==='Merge cell left')!.run!();
 const shape=(n:any):any=>({type:n.viewType,children:n.children.map((k:string)=>shape(node(k)))});expect(shape(humanGrid)).toEqual(shape(grid));
 e.tables.run({kind:'create',targets:[target.key],columns:2});
 const humanTable=draft.children.map(node).find(n=>n.viewType==='table-block')!;expect(node(humanTable.children[0]).children.map(k=>node(k).viewType)).toEqual(tableCells.map(n=>n.viewType));
 const reads={...c.dcpDiagnostics},requests=(fetch as any).mock.calls.length;snapshots.mockClear();build.mockClear();e.commands.replaceInlineRange(target.key,0,0,'Local typing');
 expect(c.dcpDiagnostics).toEqual(reads);expect((fetch as any).mock.calls.length).toBe(requests);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 c.submit();expect(check.disabled).toBe(true);e.repository.undo();expect(check.disabled).toBe(false);e.repository.redo();expect(check.disabled).toBe(true);
});

it('rejects malformed Stage 2B configuration, source authority and insertion failures atomically',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true,true,true,true),c=f.c!,e=f.editor;f.type!('An immutable original.');const source=f.text!();c.submit();
 const revision=e.repository.state.revision,p={id:'new:b2',kind:'paragraph',markup:'x',ranges:[]},list={id:'new:b1',kind:'list',style:'ordered',items:[[p]]};
 const configs=[{start:1.5,reversed:false,items:null},{start:1,reversed:'yes',items:null},{start:null,reversed:false,items:[]},{start:null,reversed:false,items:[{value:null,checked:1}]},{start:null,reversed:false,items:[{value:null,checked:null,collapsed:true}]},{start:null,reversed:false,items:null,width:10}];
 const bad=[...configs.map(configuration=>({...list,configuration})),{...list,style:'bullet',configuration:{start:4,reversed:false,items:null}},
  ...[{headers:[[true,true]]},{headers:[[1]]},{headers:null},{widths:[1]},{headers:[[true]],spans:[[2]]}].map(configuration=>({id:'new:b1',kind:'table',rows:[[[p]]],configuration})),
  {id:'new:b1',kind:'grid',rows:[[[p]]],configuration:{width:10}},
  {id:'new:b1',kind:'table',rows:[[[p]],[[{...p,id:'new:b3'}],[{...p,id:'new:b4'}]]]},
 ];
 for(const node of bad){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[node]}));expect(c.notice(),JSON.stringify(node)).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
 for(const mode of ['stale','foreign','insert']){
  const insert=e.commands.insert.bind(e.commands),fail=mode==='insert'?vi.spyOn(e.commands,'insert').mockImplementation((dto,pos)=>{if((dto.metadata as any)?.dialectic?.state==='committed')throw Error('Stage 2B insertion failure');return insert(dto,pos);}):undefined;
  await c.askMock(async(req,sources)=>{
   const parent=await sources.tool({id:'p',tool:'read_source',arguments:{handle:req.primaryReply}}),read=await sources.tool({id:'r',tool:'read_source',arguments:{handle:parent.children[0]}});
   const value:any=dcpResponse(req.exchange);value.composition=[{...list,style:'task'}];value.anchors=[{id:'new:r1',source:mode==='foreign'?'src:other:b1':read.handle,revision:mode==='stale'?'expired':read.revision,selector:{exact:'immutable',prefix:'',suffix:''}}];value.interpretations=[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}];return JSON.stringify(value);
  });fail?.mockRestore();expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);expect(source.payload.standoffProperties??[]).toHaveLength(0);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 }
});

it('preserves Stage 2B feature gates and counts all owned item and layout descendants',async()=>{
 const p=(id:number)=>({id:'new:b'+id,kind:'paragraph',markup:'x',ranges:[]});
 for(const [stage1,layouts,tasks] of [[true,false,true],[false,true,true],[true,true,false]]){
  const f=await setup(true,true,true,true,true,false,true,stage1,true,true,layouts,tasks),c=f.c!,e=f.editor;f.type!('Features');c.submit();const revision=e.repository.state.revision;
  await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'list',style:'task',items:[[p(2)]]}]}));expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);
  if(!layouts||!stage1){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'list',style:'ordered',configuration:{start:3,reversed:false,items:null},items:[[p(2)]]}]}));expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
 }
 const f=await setup(true,true,true,true,true,false,true,true,true,true,true),c=f.c!,e=f.editor;f.type!('Bounds');c.submit();const revision=e.repository.state.revision;
 for(const kind of ['list','table','grid']){
  const composition=kind==='list'?[{id:'new:b1',kind:'list',style:'task',items:Array.from({length:64},(_,i)=>[p(2+i*3),p(3+i*3),p(4+i*3)])}]:[{id:'new:b1',kind,rows:Array.from({length:16},(_,r)=>Array.from({length:16},(_,col)=>[p(2+r*16+col)]))}];
  await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition}));expect(c.notice()).toContain('native Block budget');expect(e.repository.state.revision).toBe(revision);
 }
});

it('qualifies Stage 2C compound ownership, read-only navigation, discovery, annotations and native reload',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true,true,true,true,true,true),c=f.c!,e=f.editor;
 f.type!('Compose native compound content.');c.submit();
 const p=(id:number,markup:string)=>({id:'new:b'+id,kind:'paragraph',markup,ranges:[],textStyle:null,margins:null});
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 const native=nativeDocumentSession(e);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'stage2c.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 await c.askMock(async req=>{
  expect(req.compoundAuthoring).toBe(1);expect(req.authoring.examples[0].response.composition[0].margins).toBeNull();
  return JSON.stringify({...dcpResponse(req.exchange),composition:[
   {id:'new:b1',kind:'surface',front:[p(2,'Front A'),p(3,'Front B')],back:[p(4,'Reverse note')]},
   {id:'new:b5',kind:'tabs',orientation:'vertical',tabs:[{label:'Evidence',content:[p(6,'First panel')]},{label:'Discussion',content:[p(7,'Second panel')]}]},
   {id:'new:b8',kind:'pages',orientation:'horizontal',pages:[{label:'Opening',content:[{...p(9,'Main page text'),margins:{left:[p(10,'Left note')],right:[p(11,'Right note')]}}]},{label:'Closing',content:[p(12,'Last page')]}]}
  ]});
 });expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const node=(key:string)=>c.session()!.projection.node(key)!,generated=c.resolve(c.target(c.frontier()!.id))!,[surface,tabs,pages]=generated.children.map(node);
 expect(surface.children.map(k=>node(k).viewType)).toEqual(['side-block','side-block']);expect(surface.children.map(k=>(node(k).payload.metadata as any).surfaceRole)).toEqual(['front','back']);
 expect(node(node(surface.children[0]).children[0]).payload.metadata).toMatchObject({structuralContainer:true});
 expect(tabs.payload.metadata).toMatchObject({orientation:'vertical'});expect(tabs.children.map(k=>(node(k).payload.metadata as any).name)).toEqual(['Evidence','Discussion']);
 const page=node(node(pages.children[0]).children[0]),main=node(page.children[0]);expect(page.viewType).toBe('page-block');expect(main.children).toHaveLength(0);
 expect(Object.keys(main.ownedRelations).sort()).toEqual(['leftMargin','rightMargin']);
 const left=node(main.ownedRelations.leftMargin),right=node(main.ownedRelations.rightMargin),leftText=node(left.children[0]);
 expect(left.viewType).toBe('left-margin-block');expect(right.viewType).toBe('right-margin-block');expect(leftText.payload.blockProperties).toEqual([{type:'block/alignment',value:'left'},{type:'block/font/size/three-quarters'}]);
 const state=e.repository.readState();for(const n of [page,main,left,right,leftText]){expect(state.placements[n.placementKey].kind).toBe('owned');expect(resourceIdentity.resourceOwner(state,n.contentKey)?.key).toBe(c.root()!.contentKey);}
 expect(()=>e.commands.replaceInlineRange(leftText.key,0,1,'X')).toThrow(/protected/);expect(()=>e.commands.setPayloadField(tabs.key,'metadata',{orientation:'horizontal'})).toThrow(/protected/);
 expect(()=>e.commands.setPayloadField(tabs.children[0],'metadata',{name:'Changed',active:true})).toThrow(/protected/);
 const persisted=nativeText(captureNative(e.repository.readState(),c.resourceId())),revision=e.repository.state.revision;
 snapshots.mockClear();build.mockClear();
 const tabButtons=[...f.host.querySelectorAll<HTMLButtonElement>('[role=tab]')];tabButtons.find(b=>b.textContent==='Discussion')!.click();await tick();expect(f.host.textContent).toContain('Second panel');
 tabButtons.find(b=>b.textContent==='Closing')!.click();await tick();expect(f.host.textContent).toContain('Last page');
 const flip=f.host.querySelector<HTMLButtonElement>('.surface-fold')!;flip.click();await tick();expect(flip.getAttribute('aria-label')).toBe('Return to front side');flip.click();await tick();
 expect(e.repository.state.revision).toBe(revision);expect(nativeText(captureNative(e.repository.readState(),c.resourceId()))).toBe(persisted);
 expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(native.isDirty(c.resourceId())).toBe(true);
 e.repository.undo();expect(c.committed()).toHaveLength(1);e.repository.redo();expect(c.committed()).toHaveLength(2);
 const saved=captureNative(e.repository.readState(),c.resourceId()),loaded=new ReactiveEditor({id:'compound-bank',type:'workspace-object-bank-block',children:[]});cleanup.push(()=>loaded.dispose());
 const bank=loaded.repository.readState();admitNative(loaded.repository,nativeBytes(saved),bank.placements[bank.rootPlacementKey].contentKey);expect(nativeText(captureNative(loaded.repository.readState(),c.resourceId()))).toBe(nativeText(saved));
 await c.askMock(async(req,sources)=>{
  const parent=await sources.tool({id:'p',tool:'read_source',arguments:{handle:req.primaryReply}});
  const s=await sources.tool({id:'s',tool:'read_source',arguments:{handle:parent.children[0]}});expect(s.inspection.root.children.map((n:any)=>n.configuration.surfaceRole)).toEqual(['front','back']);expect(s.inspection.root.navigation.persistent).toBe(false);
  const t=await sources.tool({id:'t',tool:'read_source',arguments:{handle:parent.children[1]}});expect(t.inspection.root.configuration.orientation).toBe('vertical');expect(t.inspection.root.children.map((n:any)=>n.configuration.name)).toEqual(['Evidence','Discussion']);
  const pagesRead=await sources.tool({id:'pages',tool:'read_source',arguments:{handle:parent.children[2]}});expect(pagesRead.inspection.root.kind).toBe('pages');const pageRead=pagesRead.inspection.root.children[0].children[0];expect(pageRead.kind).toBe('page');
  const relations=pageRead.children[0].ownedRelations;expect(relations.map((r:any)=>r.name).sort()).toEqual(['leftMargin','rightMargin']);
  const leftRead=await sources.tool({id:'m',tool:'read_source',arguments:{handle:relations.find((r:any)=>r.name==='leftMargin').content.children[0].handle}});expect(leftRead.text).toBe('Left note');expect(leftRead.target.blockId).toBe(leftText.payload.id);
  const inventory=await sources.tool({id:'i',tool:'list_text_blocks',arguments:{...inventoryArgs,limit:20}});expect(inventory.items.map((i:any)=>i.preview).join(' ')).toContain('Reverse note');expect(inventory.items.map((i:any)=>i.preview).join(' ')).toContain('Left note');
  const response:any=dcpResponse(req.exchange);response.anchors=[{id:'new:r1',source:leftRead.handle,revision:leftRead.revision,selector:{exact:'Left note',prefix:'',suffix:''}}];response.interpretations=[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}];return JSON.stringify(response);
 });expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(3);expect((node(leftText.key).payload.standoffProperties as any[]).some(p=>p.type==='style/highlight')).toBe(true);
 // Human operations consume the same builders; preserve native shape and margins.
 const draftText=f.text!();f.type!('Human draft');e.surfaces.run('surface.create',draftText.key);await tick();
 const humanSurface=e.surfaces.nearest(draftText.key)!;expect(humanSurface.children.map(k=>(node(k).payload.metadata as any).surfaceRole)).toEqual(['front','back']);
 const humanLeft=e.commands.ensureMargin(draftText.key,'left');expect(e.node(humanLeft)?.payload.blockProperties??node(e.nodeForPlacementInView(humanLeft,draftText.viewId)!.key).payload.blockProperties).toEqual(leftText.payload.blockProperties);
 const reads={...c.dcpDiagnostics},requests=(fetch as any).mock.calls.length;snapshots.mockClear();build.mockClear();e.commands.replaceInlineRange(draftText.key,0,0,'Typing');expect(c.dcpDiagnostics).toEqual(reads);expect((fetch as any).mock.calls.length).toBe(requests);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
});

it('rejects invalid Stage 2C nesting, host destinations, states and source authority without partial writes',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true,true,true,true,true,true),c=f.c!,e=f.editor;f.type!('Immutable original');const original=f.text!();c.submit();
 const p={id:'new:b2',kind:'paragraph',markup:'x',ranges:[]},pages={id:'new:b3',kind:'pages',orientation:'horizontal',pages:[{label:'Page',content:[{...p,id:'new:b4'}]}]},surface={id:'new:b1',kind:'surface',front:[p],back:[{...p,id:'new:b5'}]};
 const bad=[{...surface,active:1},{...surface,front:[]},{...surface,back:[],destination:'workspace'},
  {id:'new:b1',kind:'tabs',orientation:'diagonal',tabs:[{label:'Name',content:[p]}]},
  ...['','\n','x'.repeat(257)].map(label=>({id:'new:b1',kind:'tabs',orientation:'horizontal',tabs:[{label,content:[p]}]})),
  {id:'new:b1',kind:'tabs',orientation:'horizontal',tabs:[{label:'Host',content:[p],documentId:'foreign'}]},
  {id:'new:b1',kind:'group',children:[pages]}, {...p,margins:{left:[pages],right:[]}},
  {...p,margins:{left:[{...p,id:'new:b5',margins:{left:[{...p,id:'new:b6'}],right:[]}}],right:[]}},
  ...['document','side','tab','page','left-margin','window'].map(kind=>({id:'new:b1',kind,children:[p]})),
 ];
 const revision=e.repository.state.revision;
 for(const node of bad){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[node]}));expect(c.notice(),JSON.stringify(node)).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
 for(const mode of ['stale','foreign','insert']){
  const insert=e.commands.insert.bind(e.commands),fail=mode==='insert'?vi.spyOn(e.commands,'insert').mockImplementation((dto,pos)=>{if((dto.metadata as any)?.dialectic?.state==='committed')throw Error('Compound admission failure');return insert(dto,pos);}):undefined;
  await c.askMock(async(req,sources)=>{
   const parent=await sources.tool({id:'p',tool:'read_source',arguments:{handle:req.primaryReply}}),source=await sources.tool({id:'s',tool:'read_source',arguments:{handle:parent.children[0]}});const v:any=dcpResponse(req.exchange);v.composition=[surface];v.anchors=[{id:'new:r1',source:mode==='foreign'?'src:foreign:b1':source.handle,revision:mode==='stale'?'stale':source.revision,selector:{exact:'original',prefix:'',suffix:''}}];v.interpretations=[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}];return JSON.stringify(v);
  });fail?.mockRestore();expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);expect(original.payload.standoffProperties??[]).toHaveLength(0);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 }
});

it('gates Stage 2C features and counts compound shells and owned relations against existing budgets',async()=>{
 const p=(id:number)=>({id:'new:b'+id,kind:'paragraph',markup:'x',ranges:[]});
 for(const [native,compound,features] of [[true,false,true],[false,true,true],[true,true,false]]){
  const f=await setup(true,true,true,true,true,false,true,native,true,true,true,true,compound,features),c=f.c!,e=f.editor;f.type!('Features');c.submit();const revision=e.repository.state.revision;
  for(const node of [{id:'new:b1',kind:'surface',front:[p(2)],back:[p(3)]},{id:'new:b1',kind:'tabs',orientation:'vertical',tabs:[{label:'Tab',content:[p(2)]}]}]){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[node]}));expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
  if(!native||!compound){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{...p(1),margins:{left:[p(2)],right:[]}}]}));expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
 }
 const f=await setup(true,true,true,true,true,false,true,true,true,true,true,true,true),c=f.c!,e=f.editor;f.type!('Bounds');c.submit();const revision=e.repository.state.revision;
 const cases=[Array.from({length:43},(_,i)=>({id:'new:b'+(1+i*3),kind:'surface',front:[p(2+i*3)],back:[p(3+i*3)]})),Array.from({length:52},(_,i)=>({...p(1+i*3),margins:{left:[p(2+i*3)],right:[p(3+i*3)]}})),Array.from({length:8},(_,i)=>({id:'new:b'+(1+i*17),kind:'pages',orientation:'horizontal',pages:Array.from({length:16},(_,j)=>({label:'Page '+j,content:[p(2+i*17+j)]}))}))];
 for(const composition of cases){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition}));expect(c.notice()).toContain('native Block budget');expect(e.repository.state.revision).toBe(revision);}
});

it('negotiates Stage 2C independently of text/layout authoring and native vertical/reversible features',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true,false,true,false,true,true,false),c=f.c!;f.type!('Independent compound mode');c.submit();
 await c.askMock(async req=>{
  expect(req.compoundAuthoring).toBe(1);expect(req.textAuthoring).toBeUndefined();expect(req.layoutAuthoring).toBeUndefined();
  const p=(id:number)=>({id:'new:b'+id,kind:'paragraph',markup:'Content',ranges:[],margins:null});
  return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'tabs',orientation:'horizontal',tabs:[{label:'Tab',content:[p(2)]}]},{id:'new:b3',kind:'pages',orientation:'horizontal',pages:[{label:'Page',content:[{...p(4),margins:{left:[p(5)],right:[]}}]}]}]});
 });expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
});

it('retains prior native authoring families inside Stage 2C compounds',async()=>{
 const f=await setup(true,true,true,true,true,false,true,true,true,true,true,true,true),c=f.c!;f.type!('Compose mixed native content');c.submit();
 await c.askMock(async req=>{
  let id=0;const next=()=> 'new:b'+(++id),p=()=>({id:next(),kind:'paragraph',markup:'Text',ranges:[],textStyle:null,margins:null});
  return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:next(),kind:'tabs',orientation:'horizontal',tabs:[{label:'Native content',content:[
   {...p(),kind:'heading',level:2}, {id:next(),kind:'group',children:[p()]},
   {id:next(),kind:'list',style:'task',items:[[p()]],configuration:{start:null,reversed:false,items:[{value:null,checked:true}]}},
   {id:next(),kind:'table',rows:[[[p()]]],configuration:{headers:[[true]]}}, {id:next(),kind:'grid',rows:[[[p()]]]},
   {id:next(),kind:'code',language:'javascript',text:'const n = 1;'}, {id:next(),kind:'source',format:'markdown',text:'# Preserved source'},
   {id:next(),kind:'youtube',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}
  ]}]}]});
 });expect(c.notice()).toBe('');
 const projection=c.session()!.projection,root=c.resolve(c.target(c.frontier()!.id))!,tabs=projection.node(root.children[0])!,panel=projection.node(tabs.children[0])!;
 expect(panel.children.map(k=>projection.node(k)!.viewType)).toEqual(['standoff-editor-block','container-block','indented-list-block','table-block','grid-block','standoff-code-block','mutable/markdown-source-block','youtube-video-block']);
});

const widgetFixture=(native=true,widgets=true,features=true)=>setup(true,true,true,true,true,false,true,native,true,true,true,true,true,true,widgets,features);
const imageReference={kind:'managed' as const,cavernId:'image-cavern',assetId:'sha256:'+'a'.repeat(64)};
const externalFixture=(enabled=true,nativeFeatures=true)=>setup(true,true,true,true,true,false,true,true,true,true,true,true,true,true,false,true,true,enabled,nativeFeatures);
it('qualifies Stage 3B external media without native source handles, nested ownership, inspection and persistence',async()=>{
 const f=await externalFixture(),c=f.c!,e=f.editor;f.type!('Introduce external architecture examples');c.submit();vi.mocked(fetch).mockClear();
 const snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 const image=(id:string)=>({id,kind:'external-image',url:'https://images.example.org/building.jpg',alt:'Building facade'}),p=(id:string,markup:string)=>({id,kind:'paragraph',markup,ranges:[]});
 await c.askMock(async(req,sources)=>{
  expect(req.externalMediaAuthoring).toBe(1);expect(req.authoring.instructions).toContain('without a pre-existing source Block');expect(sources.trail).toHaveLength(0);
  return JSON.stringify({...dcpResponse(req.exchange),composition:[
   {id:'new:b1',kind:'grid',rows:[[[image('new:b2')]]] },
   {id:'new:b3',kind:'tabs',orientation:'horizontal',tabs:[{label:'Film',content:[{id:'new:b4',kind:'video',url:'https://vimeo.com/76979871'}]}]},
   {id:'new:b5',kind:'surface',front:[image('new:b6')],back:[{id:'new:b7',kind:'embed',url:'https://example.org/building'}]},
   {...p('new:b8','See the <annotation type="reference/url" value="https://example.org/paper.pdf">PDF</annotation> and <annotation type="reference/url" value="https://example.org/iiif/manifest.json">IIIF collection</annotation>.'),margins:{left:[image('new:b9')],right:[]}},
   {id:'new:b10',kind:'youtube',url:'M7lc1UVf-VE'}]});
 });expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);expect(fetch).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const state=e.repository.readState(),media=Object.values(state.contents).filter(n=>['image-block','mutable/video-block','iframe-block'].includes(n.viewType));expect(media).toHaveLength(5);
 const nativeImage=prepareImage('https://images.example.org/building.jpg','Building facade');
 for(const n of media){expect(resourceIdentity.resourceOwner(state,n.key)?.key).toBe(c.root()!.contentKey);expect(n.payload.asset).toBeUndefined();expect(n.payload.capture).toBeUndefined();if(n.viewType==='image-block')expect({...n.payload,id:null}).toEqual({...nativeImage,id:null,children:undefined});}
 const video=media.find(n=>n.viewType==='mutable/video-block')!,humanVideo=Object.values(prepareVideoReference('https://vimeo.com/76979871').state.contents)[0];expect({...video.payload,id:null}).toEqual({...humanVideo.payload,id:null});
 const embed=media.find(n=>n.viewType==='iframe-block')!,humanEmbed=Object.values(prepareWebsiteEmbed('https://example.org/building').state.contents)[0];expect({...embed.payload,id:null}).toEqual({...humanEmbed.payload,id:null});
 const root=c.resolve(c.target(c.frontier()!.id))!,node=(key:string)=>c.session()!.projection.node(key)!;expect(node(root.children[3]).ownedRelations.leftMargin).toBeDefined();expect((node(root.children[3]).payload.standoffProperties as any[]).filter(p=>p.type==='reference/url')).toHaveLength(2);
 const frames=[...f.host.querySelectorAll<HTMLIFrameElement>('iframe')];expect(frames.find(frame=>frame.src.includes('player.vimeo.com'))?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation');expect(frames.find(frame=>frame.src==='https://example.org/building')?.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-presentation');
 expect(frames.find(frame=>frame.src==='https://example.org/building')?.getAttribute('referrerpolicy')).toBe('no-referrer');
 const imageNode=Object.values(c.session()!.projection.state.nodes).find(n=>n.contentKey===media[0].key)!;expect(()=>e.commands.setPayloadField(imageNode.key,'metadata',{url:'https://example.org/changed'})).toThrow(/protected/);
 const revision=e.repository.state.revision;f.host.querySelector<HTMLImageElement>('.reactive-image img')!.dispatchEvent(new Event('error'));expect(e.repository.state.revision).toBe(revision);
 const saved=captureNative(state,c.resourceId());e.repository.undo();expect(c.committed()).toHaveLength(1);expect(f.host.querySelector('.mutable-video-block iframe')).toBeNull();e.repository.redo();expect(c.committed()).toHaveLength(2);
 const loaded=new ReactiveEditor({id:'external-bank',type:'workspace-object-bank-block',children:[]});cleanup.push(()=>loaded.dispose());const bank=loaded.repository.readState();admitNative(loaded.repository,nativeBytes(saved),bank.placements[bank.rootPlacementKey].contentKey);expect(nativeText(captureNative(loaded.repository.readState(),c.resourceId()))).toBe(nativeText(saved));
 await c.askMock(async(req,sources)=>{for(const record of [media[0],video,embed]){const read=await sources.tool({id:record.key,tool:'read_source',arguments:{handle:sources.issue({kind:'block',resourceId:c.resourceId(),blockId:String(record.payload.id)})}});expect(read.status).toBe('complete');expect(read.inspection.root.resource).toMatchObject({availability:'unknown',retained:false});}return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toBe('');
 snapshot.mockClear();build.mockClear();const reads={...c.dcpDiagnostics};vi.mocked(fetch).mockClear();f.type!('Local typing');expect(c.dcpDiagnostics).toEqual(reads);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it('rejects Stage 3B unsafe URLs, raw embed settings, forged resources and media budgets atomically',async()=>{
 const f=await externalFixture(),c=f.c!,e=f.editor;f.type!('External request');c.submit();const revision=e.repository.state.revision;vi.mocked(fetch).mockClear();
 const image={id:'new:b1',kind:'external-image',url:'https://example.org/image.png',alt:'Image'};
 for(const composition of [[{...image,url:'https://user:pass@example.org/image'}],[{...image,url:'http://127.0.0.1/image'}],[{...image,assetId:'forged'}],[{id:'new:b1',kind:'video',url:'https://example.org/video.mp4'}],[{id:'new:b1',kind:'embed',url:'https://example.org',sandbox:'allow-same-origin'}],[{...image,alt:'x'.repeat(1025)}],Array.from({length:9},(_,i)=>({...image,id:'new:b'+i}))]){
  await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition}));expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);
 }expect(fetch).not.toHaveBeenCalled();
 const insert=e.commands.insertFragment.bind(e.commands);vi.spyOn(e.commands,'insertFragment').mockImplementation((...args)=>{insert(...args);throw Error('Injected external admission failure');});
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[image,{id:'new:b2',kind:'video',url:'https://vimeo.com/76979871'}]}));expect(c.notice()).toContain('Injected external admission failure');expect(e.repository.state.revision).toBe(revision);expect(c.committed()).toHaveLength(1);
});
it('preserves Stage 3B disabled mode and native feature prerequisites',async()=>{
 const off=await externalFixture(false);off.type!('Disabled');off.c!.submit();await off.c!.askMock(async req=>{expect(req.externalMediaAuthoring).toBeUndefined();return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'external-image',url:'https://example.org/a',alt:'Image'}]});});expect(off.c!.notice()).toContain('Unsupported DCP Block');
 const f=await externalFixture(true,false),c=f.c!,e=f.editor;f.type!('Features');c.submit();const revision=e.repository.state.revision;
 for(const [kind,url] of [['video','https://vimeo.com/76979871'],['embed','https://example.org/page']]){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind,url}]}));expect(c.notice()).toMatch(/prerequisite disabled/);expect(e.repository.state.revision).toBe(revision);}
});
const imageManifest={...imageReference,mediaType:'image/png',byteLength:100,width:3,height:2};
async function imageFixture(enabled=true,sourceAsset:unknown=imageReference,external=false){
 const f=await setup(true,true,true,true,true,false,true,true,true,true,true,true,true,true,false,true,enabled,external),c=f.c!,e=f.editor;
 e.setAssetContext(()=>({cavernId:imageReference.cavernId,session:'image-session'}));
 // Runtime URL rendering is independently qualified by managed-assets.test.
 vi.spyOn(e.assets,'bind').mockImplementation(()=>()=>{});
 const verify=vi.mocked(fetch);verify.mockImplementation(async()=>new Response(JSON.stringify({Success:true,Data:imageManifest})));
 f.type!('Image source with green patina');
 const prepared=managedImageBlock(imageManifest,'Original image').native;Object.values(prepared.state.contents)[0].payload.asset=sourceAsset;
 e.commands.insertFragment(prepared,{kind:'at',parentKey:c.resolve(c.target(c.draft()!.id))!.key,index:1});c.submit();
 const sourceId=c.frontier()!.id;
 const read=async(sources:any)=>{
  const parent=await sources.tool({id:'image-parent',tool:'read_source',arguments:{handle:sources.issue(c.target(sourceId))}});
  return sources.tool({id:'image-source',tool:'read_source',arguments:{handle:parent.children[1]}});
 };
 verify.mockClear();return {...f,read,verify,sourceId};
}
const imageNode=(source:any,id='new:b1')=>({id,kind:'image',source:source.handle,revision:source.revision,alt:'Green patina'});
it('qualifies Stage 3A nested managed binding, native equivalence, immutable sources, history, persistence and bounded typing',async()=>{
 const f=await imageFixture(),c=f.c!,e=f.editor,snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 const native=nativeDocumentSession(e);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'stage3a.ink'},{nativeHash:'initial',markdownHash:null,generation:null});snapshot.mockClear();build.mockClear();
 await c.askMock(async(req,sources)=>{
  expect(req.managedImageAuthoring).toBe(1);expect(req.legend.blocks).toContain('image');expect(req.protocolKey.text).not.toContain(' or assets.');expect(req.legend.deferred).toContain('asset-acquisition');
  const source=await f.read(sources);expect(source.status).toBe('complete');expect(source.inspection.root.resource).toMatchObject({kind:'managed-image',binding:'requires-active-session-verification',perception:false});
  const wire=JSON.stringify(source);expect(wire).not.toContain(imageReference.assetId);expect(wire).not.toContain(imageReference.cavernId);
  return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b10',kind:'tabs',orientation:'horizontal',tabs:[{label:'Evidence',content:[imageNode(source)]}]},{id:'new:b11',kind:'paragraph',markup:'Commentary',ranges:[],margins:{left:[imageNode(source,'new:b2')],right:[]}}]});
 });expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const state=e.repository.readState(),images=Object.values(state.contents).filter(n=>n.viewType==='image-block');expect(images).toHaveLength(3);
 const original=images.find(n=>(n.payload.metadata as any).alt==='Original image')!,copies=images.filter(n=>n!==original);
 const human=managedImageBlock(imageManifest,'Green patina').native;const expected=Object.values(human.state.contents)[0];
 for(const copy of copies){expect({...copy.payload,id:undefined}).toEqual({...expected.payload,id:undefined});expect(copy.payload.id).not.toBe(original.payload.id);expect(resourceIdentity.resourceOwner(state,copy.key)?.key).toBe(c.root()!.contentKey);}
 expect(f.verify).toHaveBeenCalledTimes(1);expect(f.verify.mock.calls[0][0]).toBe('/api/assets/verify');expect(native.isDirty(c.resourceId())).toBe(true);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const generated=c.resolve(c.target(c.frontier()!.id))!,paragraph=c.session()!.projection.node(generated.children[1])!;expect(paragraph.ownedRelations.leftMargin).toBeDefined();
 expect(()=>e.commands.setPayloadField(c.session()!.projection.node(c.session()!.projection.node(generated.children[0])!.children[0])!.children[0],'asset',null)).toThrow(/protected/);
 e.repository.undo();expect(c.committed()).toHaveLength(1);expect(Object.values(e.repository.readState().contents).filter(n=>n.viewType==='image-block')).toHaveLength(1);e.repository.redo();expect(c.committed()).toHaveLength(2);
 const saved=captureNative(e.repository.readState(),c.resourceId()),loaded=new ReactiveEditor({id:'image-bank',type:'workspace-object-bank-block',children:[]});cleanup.push(()=>loaded.dispose());const bank=loaded.repository.readState();admitNative(loaded.repository,nativeBytes(saved),bank.placements[bank.rootPlacementKey].contentKey);expect(nativeText(captureNative(loaded.repository.readState(),c.resourceId()))).toBe(nativeText(saved));
 const reads={...c.dcpDiagnostics},requests=f.verify.mock.calls.length;snapshot.mockClear();build.mockClear();f.type!('Typing remains local');expect(c.dcpDiagnostics).toEqual(reads);expect(f.verify).toHaveBeenCalledTimes(requests);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
});
it('rejects Stage 3A forged authority, extra metadata, resource and descendant bounds before verification',async()=>{
 const f=await imageFixture(),c=f.c!,e=f.editor,revision=e.repository.state.revision;
 for(const variant of ['forged','stale-revision','foreign','asset-id','alt','bindings','descendants']){
  await c.askMock(async(req,sources)=>{const source=await f.read(sources),node:any=imageNode(source);let composition:any[]=[node];
   if(variant==='forged')node.source='src:invented:b1';if(variant==='stale-revision')node.revision='old';
   if(variant==='foreign')node.source=sources.issue({kind:'block',resourceId:'foreign-document',blockId:'other'});
   if(variant==='asset-id')node.assetId=imageReference.assetId;if(variant==='alt')node.alt='x'.repeat(1025);
   if(variant==='bindings')composition=Array.from({length:9},(_,i)=>imageNode(source,'new:b'+i));
   if(variant==='descendants')composition=[node,...Array.from({length:4},(_,i)=>({id:'new:b'+(i+10),kind:'group',children:Array.from({length:64},(_,j)=>({id:'new:b'+(100+i*64+j),kind:'paragraph',markup:'x',ranges:[]}))}))];
   return JSON.stringify({...dcpResponse(req.exchange),composition});
  });expect(c.notice(),variant).not.toBe('');expect(e.repository.state.revision,variant).toBe(revision);
 }expect(f.verify).not.toHaveBeenCalled();
});
it('rejects Stage 3A expired exchange handles, failed verification and session changes without admission',async()=>{
 const f=await imageFixture(),c=f.c!,e=f.editor;let expired:any;
 await c.askMock(async(req,sources)=>{expired=imageNode(await f.read(sources));return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toBe('');
 const revision=e.repository.state.revision;
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[expired]}));expect(c.notice()).toMatch(/current image source/);expect(e.repository.state.revision).toBe(revision);
 for(const error of ['Missing original','Corrupt original']){
  f.verify.mockImplementation(async()=>new Response(JSON.stringify({Success:false,Error:error}),{status:400}));
  await c.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[imageNode(await f.read(sources))]}));expect(c.notice()).toContain(error);expect(e.repository.state.revision).toBe(revision);
 }
 f.verify.mockImplementation(async()=>({ok:true,json:async()=>{e.setAssetContext(()=>({cavernId:imageReference.cavernId,session:'changed'}));return {Success:true,Data:imageManifest};}} as Response));
 await c.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[imageNode(await f.read(sources))]}));expect(c.notice()).toMatch(/session/);expect(e.repository.state.revision).toBe(revision);
});
it('rolls back Stage 3A mixed fragments and source annotations together after insertion fails',async()=>{
 const f=await imageFixture(),c=f.c!,e=f.editor,revision=e.repository.state.revision,before=nativeText(captureNative(e.repository.readState(),c.resourceId()));
 const insert=e.commands.insertFragment.bind(e.commands);vi.spyOn(e.commands,'insertFragment').mockImplementation((...args)=>{insert(...args);throw Error('Injected fragment admission failure');});
 await c.askMock(async(req,sources)=>{const image=await f.read(sources),parent=await sources.source(sources.issue(c.target(f.sourceId))),text=await sources.source(parent.children[0]);return JSON.stringify({...dcpResponse(req.exchange),composition:[imageNode(image)],anchors:[{id:'new:r1',source:text.handle,revision:text.revision,selector:{exact:'green patina',prefix:'',suffix:''}}],interpretations:[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}]});});
 expect(c.notice()).toContain('Injected fragment admission failure');expect(c.committed()).toHaveLength(1);expect(e.repository.state.revision).toBe(revision);expect(nativeText(captureNative(e.repository.readState(),c.resourceId()))).toBe(before);
});
it('keeps Stage 3A disabled mode',async()=>{
 const off=await imageFixture(false);await off.c!.askMock(async(req,sources)=>{expect(req.managedImageAuthoring).toBeUndefined();return JSON.stringify({...dcpResponse(req.exchange),composition:[imageNode(await off.read(sources))]});});expect(off.c!.notice()).toContain('Unsupported DCP Block');expect(off.verify).not.toHaveBeenCalled();
});
it('qualifies Stage 2D native widgets, ownership, protected operations, inspection and persistence',async()=>{
 const f=await widgetFixture(),c=f.c!,e=f.editor;f.type!('Native notes and widgets');c.submit();
 const p={id:'new:b2',kind:'paragraph',markup:'Note with emphasis',ranges:[],textStyle:null,margins:null};
 const config={scene:'coffee-cup',view:{azimuth:90,elevation:30},lighting:'warm',autoRotate:false,steam:false,coffeeStain:true,size:320};
 await c.askMock(async req=>{expect(req.widgetAuthoring).toBe(1);expect(req.legend.blocks).toContain('timer');return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'sticky-note',content:[p],size:{width:300,height:240}},{id:'new:b3',kind:'timer',durationSeconds:45,size:null},{id:'new:b4',kind:'object3d',configuration:config},{id:'new:b5',kind:'canvas-preview'}]});});
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const node=(key:string)=>c.session()!.projection.node(key)!,root=c.resolve(c.target(c.frontier()!.id))!,[note,timer,object,canvas]=root.children.map(node);
 expect(note.viewType).toBe('sticky-note-block');expect(note.payload.metadata).toEqual(prepareStickyNote([{type:'standoff-editor-block'}],{width:300,height:240}).metadata);expect(note.children).toHaveLength(1);
 expect(timer.payload.timer).toEqual(timerBlockDto(undefined,45).timer);expect(timer.payload.blockProperties).toEqual(timerBlockDto().blockProperties);expect(object.payload.object3D).toEqual(objectDto(config).object3D);expect(object.payload.blockProperties).toEqual(objectDto(config).blockProperties);expect(canvas.viewType).toBe('canvas-block');
 const state=e.repository.readState();for(const n of [note,node(note.children[0]),timer,object,canvas]){expect(state.placements[n.placementKey].kind).toBe('owned');expect(resourceIdentity.resourceOwner(state,n.contentKey)?.key).toBe(c.root()!.contentKey);}
 expect(()=>e.commands.replaceInlineRange(note.children[0],0,1,'X')).toThrow(/protected/);for(const n of [note,timer,object])expect(()=>e.commands.setPayloadField(n.key,'metadata',{x:1})).toThrow(/protected/);
 const timerRoot=document.querySelector<HTMLElement>(`.reactive-timer[data-client-id="${timer.key}"]`)!;expect(timerRoot.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);expect(f.host.querySelector('.reactive-sticky-note__resize')).toBeNull();
 const saved=captureNative(e.repository.readState(),c.resourceId()),revision=e.repository.state.revision,snapshot=vi.spyOn(e.repository,'snapshot');
 const canvasRoot=f.host.querySelector<HTMLElement>('.reactive-canvas-preview')!;
 canvasRoot.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown',{clientX:0,clientY:0,bubbles:true}));canvasRoot.dispatchEvent(new MouseEvent('pointermove',{clientX:30,clientY:20,bubbles:true}));canvasRoot.dispatchEvent(new MouseEvent('pointerup',{bubbles:true}));expect(canvasRoot.querySelector('button')!.style.left).toBe('175px');
 const button=(label:string)=>[...timerRoot.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;button('Start').click();button('Pause').click();button('Reset').click();expect(e.repository.state.revision).toBe(revision);expect(nativeText(captureNative(e.repository.readState(),c.resourceId()))).toBe(nativeText(saved));expect(snapshot).not.toHaveBeenCalled();
 e.repository.undo();expect(c.committed()).toHaveLength(1);e.repository.redo();expect(c.committed()).toHaveLength(2);
 const loaded=new ReactiveEditor({id:'widget-bank',type:'workspace-object-bank-block',children:[]});cleanup.push(()=>loaded.dispose());const bank=loaded.repository.readState();admitNative(loaded.repository,nativeBytes(saved),bank.placements[bank.rootPlacementKey].contentKey);expect(nativeText(captureNative(loaded.repository.readState(),c.resourceId()))).toBe(nativeText(saved));
 await c.askMock(async(req,sources)=>{
  const parent=await sources.tool({id:'parent',tool:'read_source',arguments:{handle:req.primaryReply}});
  let noteHandle='';const expected=['sticky-note','timer','object3d','canvas-preview'];
  for(let i=0;i<4;i++){const source=await sources.tool({id:'widget'+i,tool:'read_source',arguments:{handle:parent.children[i]}});expect(source.status).toBe('complete');expect(source.inspection.root.kind).toBe(expected[i]);if(i===0)noteHandle=source.children[0];expect(source.inspection.root.stateSemantics).toBeDefined();if(i===1){expect(source.inspection.root.configuration.timer.durationSeconds).toBe(45);expect(JSON.stringify(source.inspection)).not.toContain('runningUntil');}if(i===2)expect(source.inspection.root.configuration.object3d.settings).toEqual({steam:false,coffeeStain:true});}
  const noteText=await sources.tool({id:'note-text',tool:'read_source',arguments:{handle:noteHandle}});expect(noteText.text).toBe('Note with emphasis');
  const response:any=dcpResponse(req.exchange);response.anchors=[{id:'new:r1',source:noteText.handle,revision:noteText.revision,selector:{exact:'emphasis',prefix:'',suffix:''}}];response.interpretations=[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}];return JSON.stringify(response);
 });expect(c.notice()).toBe('');
 snapshot.mockClear();const builds=vi.spyOn(c.session()!.projection as any,'build'),reads={...c.dcpDiagnostics},requests=(fetch as any).mock.calls.length;f.type!('Typing');expect(c.dcpDiagnostics).toEqual(reads);expect((fetch as any).mock.calls.length).toBe(requests);expect(snapshot).not.toHaveBeenCalled();expect(builds).not.toHaveBeenCalled();
});
it('rejects Stage 2D invalid settings, destinations and source authority atomically',async()=>{
 const f=await widgetFixture(),c=f.c!,e=f.editor;f.type!('Original source');c.submit();const revision=e.repository.state.revision;
 const timer={id:'new:b1',kind:'timer',durationSeconds:60,size:null},object={id:'new:b1',kind:'object3d',configuration:null},note={id:'new:b1',kind:'sticky-note',size:null,content:[{id:'new:b2',kind:'paragraph',markup:'x',ranges:[]}]};
 const config={scene:'coffee-cup',view:{azimuth:45,elevation:25},lighting:'neutral',autoRotate:false,steam:true,coffeeStain:false,size:280};
 const bad=[...[-1,0,1.5,86401,'60'].map(durationSeconds=>({...timer,durationSeconds})),{...timer,size:{width:109,height:130}},{...timer,runningUntil:123},{...timer,destination:'workspace'}, {...object,configuration:{...config,scene:'mesh'}},{...object,configuration:{...config,assetId:'invented'}},{...object,configuration:{...config,view:{azimuth:12,elevation:90}}},{...object,configuration:{...config,size:641}},{...object,configuration:{...config,steam:'yes'}},{...note,content:[]},{...note,size:{width:100,height:100}},{...note,colour:'red'},{id:'new:b1',kind:'canvas-preview',boxes:[]},...['canvas-counter','phosphor','window'].map(kind=>({id:'new:b1',kind}))];
 for(const node of bad){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[node]}));expect(c.notice(),JSON.stringify(node)).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
 for(const mode of ['stale','foreign','insert']){
  const insert=e.commands.insert.bind(e.commands),fail=mode==='insert'?vi.spyOn(e.commands,'insert').mockImplementation((dto,pos)=>{if((dto.metadata as any)?.dialectic?.state==='committed')throw Error('Widget admission failure');return insert(dto,pos);}):undefined;
  await c.askMock(async(req,sources)=>{const parent=await sources.tool({id:'p',tool:'read_source',arguments:{handle:req.primaryReply}}),source=await sources.tool({id:'s',tool:'read_source',arguments:{handle:parent.children[0]}});const value:any=dcpResponse(req.exchange);value.composition=[timer];value.anchors=[{id:'new:r1',source:mode==='foreign'?'src:foreign:b1':source.handle,revision:mode==='stale'?'expired':source.revision,selector:{exact:'Original',prefix:'',suffix:''}}];value.interpretations=[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}];return JSON.stringify(value);});fail?.mockRestore();expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 }
});
it('gates Stage 2D widgets and bounds generated note descendants',async()=>{
 for(const [native,widgets,features] of [[true,false,true],[false,true,true],[true,true,false]]){
  const f=await widgetFixture(native,widgets,features),c=f.c!,e=f.editor;f.type!('Features');c.submit();const revision=e.repository.state.revision;
  for(const node of [{id:'new:b1',kind:'timer',durationSeconds:60,size:null},{id:'new:b1',kind:'object3d',configuration:null}]){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[node]}));expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
 }
 const f=await widgetFixture(),c=f.c!,e=f.editor;f.type!('Bounds');c.submit();const revision=e.repository.state.revision;
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:Array.from({length:4},(_,i)=>({id:'new:b'+(i*65+1),kind:'sticky-note',size:null,content:Array.from({length:64},(_,j)=>({id:'new:b'+(i*65+j+2),kind:'timer',durationSeconds:1,size:null}))}))}));expect(c.notice()).toContain('native Block budget');expect(e.repository.state.revision).toBe(revision);
});


it('rejects Stage 3A nonmanaged and foreign originals, changed sources and late session changes',async()=>{
 for(const asset of [null,{...imageReference,assetId:'forged'},{...imageReference,cavernId:'foreign'}]){
  const f=await imageFixture(true,asset),c=f.c!,revision=f.editor.repository.state.revision;
  await c.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[imageNode(await f.read(sources))]}));expect(c.notice()).not.toBe('');expect(f.editor.repository.state.revision).toBe(revision);expect(f.verify).not.toHaveBeenCalled();
 }
 const stale=await imageFixture(),c=stale.c!,e=stale.editor;
 stale.verify.mockImplementation(async()=>{e.repository.undo();return new Response(JSON.stringify({Success:true,Data:imageManifest}));});
 await c.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[imageNode(await stale.read(sources))]}));expect(c.notice()).toMatch(/changed/);expect(c.committed()).toHaveLength(0);
 const late=await imageFixture(),d=late.c!,editor=late.editor,revision=editor.repository.state.revision,transaction=editor.commands.boundedStructuralTransaction.bind(editor.commands);
 vi.spyOn(editor.commands,'boundedStructuralTransaction').mockImplementation((label,operation)=>{editor.setAssetContext(()=>({cavernId:imageReference.cavernId,session:'late-switch'}));return transaction(label,operation);});
 await d.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[imageNode(await late.read(sources))]}));expect(d.notice()).toMatch(/session/);expect(editor.repository.state.revision).toBe(revision);
});


it('qualifies Stage 3B human Add Image equivalence and mixed managed/external fragment admission',async()=>{
 const f=await imageFixture(true,imageReference,true),c=f.c!,e=f.editor;
 await c.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[imageNode(await f.read(sources)),{id:'new:b2',kind:'video',url:'https://vimeo.com/76979871'},{id:'new:b3',kind:'external-image',url:'https://example.org/photo.jpg',alt:'Photo'}]}));expect(c.notice()).toBe('');expect(f.verify).toHaveBeenCalledTimes(1);expect(f.verify.mock.calls[0][0]).toBe('/api/assets/verify');
 const external=Object.values(e.repository.readState().contents).find(n=>n.viewType==='image-block'&&(n.payload.metadata as any)?.alt==='Photo')!;
 const menu=blockMenuItems(e,f.text!().key).find(i=>i.label==='Add Block')!.children!;
 menu.find(i=>i.label==='Image URL…')!.input!.submit('https://example.org/photo.jpg');
 const human=Object.values(e.repository.readState().contents).find(n=>n.viewType==='image-block'&&(n.payload.metadata as any)?.url==='https://example.org/photo.jpg'&&!(n.payload.metadata as any)?.alt)!;
 expect(human.viewType).toBe(external.viewType);expect(human.children).toEqual(external.children);expect(human.payload.metadata).toMatchObject({url:(external.payload.metadata as any).url});expect(human.payload.asset).toBeUndefined();expect(human.payload.id).not.toBe(external.payload.id);
});

async function pdfFixture(enabled=true,native=true,sourceVariant=''){
 const f=await setup(true,true,true,true,true,false,true,true,true,true,true,true,true,true,false,true,false,true,true,enabled,native),c=f.c!,e=f.editor,capture=pdfCaptureFixture();
 e.setAssetContext(()=>({cavernId:capture.asset.cavernId,session:'pdf-session'}));f.type!('PDF source with green patina');
 const prepared=pdfBlock(capture).native,payload=Object.values(prepared.state.contents)[0].payload;if(sourceVariant==='archive')payload.archive={version:1,snapshots:[capture],bindings:[]};if(sourceVariant==='foreign')payload.pdf={...capture,asset:{...capture.asset,cavernId:'foreign'}};if(sourceVariant==='malformed')payload.pdf={...capture,snapshotId:'forged'};
 e.commands.insertFragment(prepared,{kind:'at',parentKey:c.resolve(c.target(c.draft()!.id))!.key,index:1});c.submit();const sourceId=c.frontier()!.id;
 const verify=vi.mocked(fetch);verify.mockImplementation(async()=>new Response(JSON.stringify({Success:true,Data:{snapshot:capture,byteLength:100}})));verify.mockClear();
 const read=async(sources:any)=>{const parent=await sources.tool({id:'pdf-parent',tool:'read_source',arguments:{handle:sources.issue(c.target(sourceId))}});return sources.tool({id:'pdf-source',tool:'read_source',arguments:{handle:parent.children[1]}});};
 return {...f,capture,verify,read,sourceId};
}
const pdfNode=(s:any,id='new:b1')=>({id,kind:'retained-pdf',source:s.handle,revision:s.revision});
it('qualifies Stage 3C retained PDF native equivalence, mixed admission, identity, history, persistence and bounded work',async()=>{
 const f=await pdfFixture(),c=f.c!,e=f.editor,snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(req,sources)=>{expect(req.retainedPdfAuthoring).toBe(1);const source=await f.read(sources);expect(source.status).toBe('complete');expect(source.inspection.root.resource).toMatchObject({kind:'retained-capture',family:'pdf',availability:'unverified'});
  for(const privateValue of [f.capture.snapshotId,f.capture.identityId,f.capture.entityId,f.capture.resourceId,f.capture.asset.assetId,f.capture.asset.cavernId])expect(JSON.stringify(source)).not.toContain(privateValue);
  return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b10',kind:'surface',front:[pdfNode(source)],back:[pdfNode(source,'new:b2')]},{id:'new:b3',kind:'external-image',url:'https://example.org/image.png',alt:'External'}]});
 });expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);expect(f.verify).toHaveBeenCalledTimes(1);expect(f.verify.mock.calls[0][0]).toBe('/api/services/pdf.verify');expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 expect(Object.values(e.repository.readState().contents).filter(n=>n.viewType==='resource-information-block')).toHaveLength(2);
 const state=e.repository.readState(),pdfs=Object.values(state.contents).filter(n=>n.viewType==='mutable/pdf-document-block');expect(pdfs).toHaveLength(3);expect(new Set(pdfs.map(n=>n.payload.id)).size).toBe(3);
 for(const pdf of pdfs){expect(pdf.payload.pdf).toEqual(f.capture);expect((pdf.payload.blockProperties as any[])[0]).toMatchObject({type:'codex/entity-reference',value:f.capture.entityId,metadata:{sourceSnapshotId:f.capture.snapshotId}});expect(resourceIdentity.resourceOwner(state,pdf.key)?.key).toBe(c.root()!.contentKey);const node=Object.values(c.session()!.projection.state.nodes).find(n=>n.contentKey===pdf.key)!;expect(()=>e.commands.setPayloadField(node.key,'pdf',null)).toThrow(/protected/);}
 e.repository.undo();expect(c.committed()).toHaveLength(1);e.repository.redo();expect(c.committed()).toHaveLength(2);
 const saved=captureNative(e.repository.readState(),c.resourceId()),loaded=new ReactiveEditor({id:'pdf-bank',type:'workspace-object-bank-block',children:[]});cleanup.push(()=>loaded.dispose());const bank=loaded.repository.readState();admitNative(loaded.repository,nativeBytes(saved),bank.placements[bank.rootPlacementKey].contentKey);expect(nativeText(captureNative(loaded.repository.readState(),c.resourceId()))).toBe(nativeText(saved));
 snapshot.mockClear();build.mockClear();const reads={...c.dcpDiagnostics},calls=f.verify.mock.calls.length;f.type!('Local typing');expect(c.dcpDiagnostics).toEqual(reads);expect(f.verify).toHaveBeenCalledTimes(calls);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
});
it('rejects Stage 3C forged/stale/foreign authority, wire metadata and generated budgets before verification',async()=>{
 const f=await pdfFixture(),c=f.c!,e=f.editor,revision=e.repository.state.revision;
 for(const variant of ['forged','revision','foreign','capture','bindings','descendants']){await c.askMock(async(req,sources)=>{const s=await f.read(sources),node:any=pdfNode(s);let composition:any[]=[node];
  if(variant==='forged')node.source='src:invented:b1';if(variant==='revision')node.revision='old';if(variant==='foreign')node.source=sources.issue({kind:'block',resourceId:'foreign-document',blockId:'other'});if(variant==='capture')node.capture=f.capture;
  if(variant==='bindings')composition=Array.from({length:5},(_,i)=>pdfNode(s,'new:b'+(i+1)));if(variant==='descendants')composition=[node,...Array.from({length:4},(_,i)=>({id:'new:b'+(i+10),kind:'group',children:Array.from({length:64},(_,j)=>({id:'new:b'+(100+i*64+j),kind:'paragraph',markup:'x',ranges:[]}))}))];return JSON.stringify({...dcpResponse(req.exchange),composition});});expect(c.notice(),variant).not.toBe('');expect(e.repository.state.revision).toBe(revision);}
 expect(f.verify).not.toHaveBeenCalled();let expired:any;await c.askMock(async(req,sources)=>{expired=pdfNode(await f.read(sources));return JSON.stringify(dcpResponse(req.exchange));});const after=e.repository.state.revision;await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[expired]}));expect(c.notice()).toMatch(/current PDF source/);expect(e.repository.state.revision).toBe(after);
});
it('rejects Stage 3C failed verification, capture mismatch and session changes without admission',async()=>{
 const f=await pdfFixture(),c=f.c!,e=f.editor,revision=e.repository.state.revision;
 for(const mode of ['missing','corrupt','mismatch','foreign','session']){f.verify.mockImplementation(async()=>{if(mode==='session')return {ok:true,json:async()=>{e.setAssetContext(()=>({cavernId:f.capture.asset.cavernId,session:'changed'}));return {Success:true,Data:{snapshot:f.capture,byteLength:100}};}} as Response;
  return new Response(JSON.stringify(mode==='missing'||mode==='corrupt'?{Success:false,Error:mode+' original'}:{Success:true,Data:{snapshot:{...f.capture,...(mode==='mismatch'?{entityId:crypto.randomUUID()}:{asset:{...f.capture.asset,cavernId:'foreign'}})},byteLength:100}}),{status:mode==='missing'||mode==='corrupt'?400:200});});
  await c.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[pdfNode(await f.read(sources))]}));expect(c.notice(),mode).not.toBe('');expect(e.repository.state.revision).toBe(revision);
 }
});
it('fences Stage 3C changed sources and late sessions, and rolls annotations and fragments back atomically',async()=>{
 const stale=await pdfFixture();stale.verify.mockImplementation(async()=>{stale.editor.repository.undo();return new Response(JSON.stringify({Success:true,Data:{snapshot:stale.capture,byteLength:100}}));});await stale.c!.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[pdfNode(await stale.read(sources))]}));expect(stale.c!.notice()).toMatch(/changed/);expect(stale.c!.committed()).toHaveLength(0);
 const late=await pdfFixture(),d=late.c!,editor=late.editor,revision=editor.repository.state.revision,transaction=editor.commands.boundedStructuralTransaction.bind(editor.commands);vi.spyOn(editor.commands,'boundedStructuralTransaction').mockImplementation((label,operation)=>{editor.setAssetContext(()=>({cavernId:late.capture.asset.cavernId,session:'late'}));return transaction(label,operation);});await d.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[pdfNode(await late.read(sources))]}));expect(d.notice()).toMatch(/session/);expect(editor.repository.state.revision).toBe(revision);
 const f=await pdfFixture(),c=f.c!,e=f.editor,before=nativeText(captureNative(e.repository.readState(),c.resourceId())),insert=e.commands.insertFragment.bind(e.commands);vi.spyOn(e.commands,'insertFragment').mockImplementation((...args)=>{insert(...args);throw Error('Injected PDF admission failure');});
 await c.askMock(async(req,sources)=>{const pdf=await f.read(sources),parent=await sources.source(sources.issue(c.target(f.sourceId))),text=await sources.source(parent.children[0]);return JSON.stringify({...dcpResponse(req.exchange),composition:[pdfNode(pdf)],anchors:[{id:'new:r1',source:text.handle,revision:text.revision,selector:{exact:'green patina',prefix:'',suffix:''}}],interpretations:[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}]});});expect(c.notice()).toContain('Injected PDF admission failure');expect(nativeText(captureNative(e.repository.readState(),c.resourceId()))).toBe(before);
});
it('preserves Stage 3C feature-disabled schemas and admission',async()=>{
 for(const [flag,native]of [[false,true],[true,false]]){const f=await pdfFixture(flag,native);await f.c!.askMock(async(req)=>{expect(req.retainedPdfAuthoring).toBeUndefined();return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'retained-pdf',source:'src:fake:b1',revision:'old'}]});});expect(f.c!.notice()).toContain('Unsupported DCP Block');expect(f.verify).not.toHaveBeenCalled();}
});
it('rejects Stage 3C foreign, archived or malformed source captures without I/O and counts generated resource wrappers',async()=>{
 for(const variant of ['foreign','archive','malformed']){const f=await pdfFixture(true,true,variant),c=f.c!,revision=f.editor.repository.state.revision;await c.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[pdfNode(await f.read(sources))]}));expect(c.notice(),variant).not.toBe('');expect(f.verify).not.toHaveBeenCalled();expect(f.editor.repository.state.revision).toBe(revision);}
 const f=await pdfFixture(),c=f.c!,revision=f.editor.repository.state.revision;await c.askMock(async(req,sources)=>{const source=await f.read(sources);return JSON.stringify({...dcpResponse(req.exchange),composition:[...Array.from({length:4},(_,i)=>pdfNode(source,'new:b'+(i+1))),...Array.from({length:4},(_,i)=>({id:'new:b'+(10+i),kind:'group',children:Array.from({length:60},(_,j)=>({id:'new:b'+(100+i*60+j),kind:'paragraph',markup:'x',ranges:[]}))}))]});});expect(c.notice()).toMatch(/descendant budget/);expect(f.editor.repository.state.revision).toBe(revision);expect(c.committed()).toHaveLength(1);
});

const vocabularyFixture=(vocabulary=true)=>setup(true,true,true,true,true,false,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,vocabulary);
it('rejects independently disabled semantic operations and Entity mentions without committing partial work',async()=>{
 const f=await vocabularyFixture(),c=f.c!,e=f.editor;f.type!('Semantic permissions');c.submit();let revision=e.repository.state.revision;
 const entity={id:'new:e1',name:'Entity',typename:'Concept',description:'',aliases:[]};
 for(const [capability,field,value]of [
  ['semantic.entity','entities',[entity]],['semantic.argument','arguments',[{id:'new:arg1',anchor:'new:s1'}]],
  ['semantic.argument-relation','relations',[{id:'new:rel1',kind:'argument',type:'supports',from:'new:arg1',to:'new:arg2'}]],
  ['semantic.entity-relation','relations',[{id:'new:rel1',kind:'entity',type:'related-to',from:'new:e1',to:'new:e2'}]],
  ['semantic.gloss','glosses',[{id:'new:g1',type:'Explanation',text:'Disabled',target:'new:s1'}]],
  ['source.anchor','anchors',[{id:'new:r1',source:'src:unissued:b1',revision:'old',selector:{exact:'Semantic',prefix:'',suffix:''}}]],
  ['source.classification','interpretations',[{id:'new:m1',target:'new:r1',type:'style/bold',ref:null,attributes:[]}]],
  ['reference.reply','replyTargets',['src:unissued:c1']]
 ] as const){
  c.configureVocabulary({profile:'all-qualified',disable:[capability]});revision=e.repository.state.revision;
  await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),[field]:value}));expect(c.notice()).toContain(capability);expect(e.repository.state.revision).toBe(revision);
 }
 c.configureVocabulary({profile:'all-qualified',disable:['standoff:mutable/entity-reference']});revision=e.repository.state.revision;
 for(const mode of ['inline','range','source'])await c.askMock(async(req,sources)=>{
  const response:any={...dcpResponse(req.exchange),entities:[entity],composition:[{id:'new:b1',kind:'paragraph',markup:mode==='inline'?'<annotation type="mutable/entity-reference" ref="new:e1">Mention</annotation>':'<boundary id="new:pos1"/>Mention<boundary id="new:pos2"/>',ranges:mode==='range'?[{id:'new:s1',type:'mutable/entity-reference',from:'new:pos1',to:'new:pos2',ref:'new:e1',attributes:[]}]:[]}]};
  if(mode==='source'){const parent=await sources.source(req.primaryReply),text=await sources.source(parent.children[0]);response.anchors=[{id:'new:r1',source:text.handle,revision:text.revision,selector:{exact:'Semantic',prefix:'',suffix:''}}];response.interpretations=[{id:'new:m1',target:'new:r1',type:'mutable/entity-reference',ref:'new:e1',attributes:[]}];}
  return JSON.stringify(response);
 }).then(()=>{expect(c.notice()).toContain('DCP capability disabled: semantic.entity');expect(e.repository.state.revision).toBe(revision);});
});
it('supports reduced-profile mock exchanges and the legacy selection-disabled path',async()=>{
 const f=await vocabularyFixture(),c=f.c!;f.type!('Mock');c.submit();c.configureVocabulary({profile:'core'});await c.askMock();expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const off=await vocabularyFixture(false),d=off.c!;off.type!('Legacy');d.submit();expect(()=>d.configureVocabulary({profile:'core'})).toThrow('selection disabled');
 await d.askMock(async(req,sources)=>{expect(req.vocabulary).toBeUndefined();expect(sources.vocabulary).toBeUndefined();return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'timer',durationSeconds:5,size:null}]});});expect(d.notice()).toBe('');
});
it('enforces vocabulary selection recursively and rejects disabled configuration before any commit',async()=>{
 const f=await vocabularyFixture(),c=f.c!,e=f.editor;f.type!('Vocabulary request');c.submit();c.configureVocabulary({profile:'core'});let revision=e.repository.state.revision;
 const p={id:'new:b1',kind:'paragraph',markup:'Text',ranges:[]},timer={id:'new:b2',kind:'timer',durationSeconds:30,size:null};
 for(const composition of [[timer],[{id:'new:b3',kind:'group',children:[timer]}],[{id:'new:b4',kind:'list',style:'bullet',configuration:null,items:[[timer]]}],[{...p,textStyle:{alignment:'center',indent:null,size:null}}],[{...p,margins:{left:[timer],right:[]}}],[{id:'new:b5',kind:'list',style:'task',configuration:null,items:[[p]]}],[{id:'new:b5',kind:'list',style:'ordered',configuration:{start:1,reversed:false,items:[{value:null,checked:true}]},items:[[p]]}],[{id:'new:b6',kind:'table',configuration:{headers:[[true]]},rows:[[[p]]]}]]){
  await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition}));expect(c.notice()).toMatch(/disabled/);expect(e.repository.state.revision).toBe(revision);
 }
 c.configureVocabulary({profile:'general',disable:['composition.surface']});revision=e.repository.state.revision;
 for(const composition of [[{id:'new:b7',kind:'tabs',orientation:'horizontal',tabs:[{label:'T',content:[{id:'new:b8',kind:'surface',front:[p],back:[{...p,id:'new:b9'}]}]}]}],[{id:'new:b7',kind:'sticky-note',size:null,content:[timer]}]]){await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition}));expect(c.notice()).toMatch(/disabled/);expect(e.repository.state.revision).toBe(revision);}
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b10',kind:'tabs',orientation:'horizontal',tabs:[{label:'T',content:[p]}]}]}));expect(c.notice()).toBe('');
});
it('rejects disabled standoff properties through inline, ranges and source interpretations; preserves inert unknown semantics',async()=>{
 const f=await vocabularyFixture(),c=f.c!,e=f.editor;f.type!('Original phrase');c.submit();c.configureVocabulary({profile:'all-qualified',disable:['standoff:style/bold']});const revision=e.repository.state.revision;
 for(const mode of ['inline','range','source']){await c.askMock(async(req,sources)=>{const response:any=dcpResponse(req.exchange);response.composition=[{id:'new:b1',kind:'paragraph',markup:mode==='inline'?'<annotation type="style/bold">Disabled</annotation>':mode==='range'?'<boundary id="new:pos1"/>Disabled<boundary id="new:pos2"/>':'Commentary',ranges:mode==='range'?[{id:'new:s1',type:'style/bold',from:'new:pos1',to:'new:pos2',ref:null,attributes:[]}]:[]}];
  if(mode==='source'){const parent=await sources.source(req.primaryReply),source=await sources.source(parent.children[0]);response.anchors=[{id:'new:r1',source:source.handle,revision:source.revision,selector:{exact:'Original',prefix:'',suffix:''}}];response.interpretations=[{id:'new:m1',target:'new:r1',type:'style/bold',ref:null,attributes:[]}];}return JSON.stringify(response);});expect(c.notice()).toContain('DCP standoff disabled');expect(e.repository.state.revision).toBe(revision);}
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'paragraph',markup:'<annotation type="custom/meaning">Inert</annotation>',ranges:[]}]}));expect(c.notice()).toBe('');const root=c.resolve(c.target(c.frontier()!.id))!,text=c.session()!.projection.node(root.children[0])!;expect((text.payload.standoffProperties as any[])[0].type).toBe('dialectic/unknown-semantic');
});
it('keeps an immutable vocabulary snapshot during settings changes and does not let response flags grant authority',async()=>{
 const f=await vocabularyFixture(),c=f.c!,e=f.editor;f.type!('Settings');c.submit();c.configureVocabulary({profile:'general'});
 await c.askMock(async(req,sources)=>{expect(req.vocabulary).toBe(sources.vocabulary);expect(Object.isFrozen(req.vocabulary.capabilities)).toBe(true);c.configureVocabulary({profile:'core'});expect(sources.capabilities!.describe({ids:['composition.surface']}).items[0].authorable).toBe(true);return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'surface',front:[{id:'new:b2',kind:'paragraph',markup:'Front',ranges:[]}],back:[{id:'new:b3',kind:'paragraph',markup:'Back',ranges:[]}]}]});});expect(c.notice()).toBe('');expect(c.vocabularySelection().profile).toBe('general');c.configureVocabulary({profile:'core'});const revision=e.repository.state.revision;
 await c.askMock(async req=>{expect(req.vocabulary.profile).toBe('core');c.configureVocabulary({profile:'all-qualified'});return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'timer',durationSeconds:1,size:null}]});});expect(c.notice()).toMatch(/disabled/);expect(e.repository.state.revision).toBe(revision);
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),vocabulary:{profile:'all-qualified'}}));expect(c.notice()).toMatch(/Invalid DCP object fields/);expect(e.repository.state.revision).toBe(revision);
 const snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build'),reads={...c.dcpDiagnostics},calls=vi.mocked(fetch).mock.calls.length;f.type!('Local typing');expect(c.dcpDiagnostics).toEqual(reads);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(calls);
});
it('reads committed native code, task and compound structure even when their authoring stages are disabled',async()=>{
 const f=await setup(true,true,true,true,true),c=f.c!,e=f.editor;f.type!('Read native content');
 const root=c.resolve(c.target(c.draft()!.id))!;e.commands.insert({id:'read-disabled-surface',type:'surface-block',children:[{id:'read-front',type:'side-block',children:[{id:'read-code',type:'standoff-code-block',metadata:{markdownCode:{language:'typescript'}},children:[{id:'read-code-text',type:'standoff-editor-block',text:'const evidence = 1;'}]}]},{id:'read-back',type:'side-block',children:[{id:'read-checkbox',type:'checkbox-block',checked:true}]}]},{kind:'at',parentKey:root.key,index:1});c.submit();
 await c.askMock(async(req,sources)=>{expect(req.vocabulary.kinds).not.toContain('code');for(const id of ['read-disabled-surface','read-code','read-checkbox']){const result=await sources.tool({id,tool:'read_source',arguments:{handle:sources.issue(c.target(id,'block'))}});expect(result.status).toBe('complete');expect(result.inspection.root.nativeId).toBe(id);}return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toBe('');
});
it('permits existing Entity mentions and formal relationships without permission to create endpoints',async()=>{
 const f=await vocabularyFixture(),c=f.c!,e=f.editor;f.type!('Entities');c.submit();
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'paragraph',markup:'<annotation type="style/bold" id="new:s1"><annotation type="mutable/entity-reference" ref="new:e1">Alpha</annotation> and <annotation type="mutable/entity-reference" ref="new:e2">Beta</annotation></annotation>',ranges:[]}],entities:[{id:'new:e1',name:'Alpha',typename:'Concept',description:'',aliases:[]},{id:'new:e2',name:'Beta',typename:'Concept',description:'',aliases:[]}],arguments:[{id:'new:arg1',anchor:'new:s1'},{id:'new:arg2',anchor:'new:s1'}]}));expect(c.notice()).toBe('');
 c.configureVocabulary({profile:'core',enable:['standoff:mutable/entity-reference','semantic.argument-relation','semantic.entity-relation']});
 await c.askMock(async(req,sources)=>{const parent=await sources.source(req.primaryReply),source=await sources.source(parent.children[0]),entities=source.annotations.filter((a:any)=>a.entityHandle).map((a:any)=>a.entityHandle),args=source.annotations.find((a:any)=>a.arguments?.length)?.arguments;expect(entities).toHaveLength(2);expect(args).toHaveLength(2);return JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'paragraph',markup:'<annotation type="mutable/entity-reference" ref="'+entities[0]+'">Existing Alpha</annotation>',ranges:[]}],relations:[{id:'new:rel1',kind:'entity',type:'related-to',from:entities[0],to:entities[1]},{id:'new:rel2',kind:'argument',type:'supports',from:args[0],to:args[1]}]});});expect(c.notice()).toBe('');expect(c.contributionActivity(c.frontier()!.id)().counts).toMatchObject({entities:0,references:1,relationships:2});const revision=e.repository.state.revision;
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),entities:[{id:'new:e1',name:'Forbidden',typename:'Concept',description:'',aliases:[]}]}));expect(c.notice()).toContain('semantic.entity');expect(e.repository.state.revision).toBe(revision);
});
it('selects retained PDF binding independently of general Surface authoring and preserves atomic rollback',async()=>{
 const f=await pdfFixture(),c=f.c!,e=f.editor;c.configureVocabulary({profile:'core',enable:['media.retained-pdf']});
 await c.askMock(async(req,sources)=>{expect(req.vocabulary.kinds).not.toContain('surface');return JSON.stringify({...dcpResponse(req.exchange),composition:[pdfNode(await f.read(sources))]});});expect(c.notice()).toBe('');expect(f.verify).toHaveBeenCalledTimes(1);expect(Object.values(e.repository.readState().contents).some(n=>n.viewType==='resource-information-block')).toBe(true);
 c.configureVocabulary({profile:'core'});f.verify.mockClear();let before=nativeText(captureNative(e.repository.readState(),c.resourceId()));await c.askMock(async(req,sources)=>JSON.stringify({...dcpResponse(req.exchange),composition:[pdfNode(await f.read(sources))]}));expect(c.notice()).toMatch(/disabled/);expect(f.verify).not.toHaveBeenCalled();expect(nativeText(captureNative(e.repository.readState(),c.resourceId()))).toBe(before);
 c.configureVocabulary({profile:'core',enable:['media.retained-pdf']});before=nativeText(captureNative(e.repository.readState(),c.resourceId()));const insert=e.commands.insertFragment.bind(e.commands);vi.spyOn(e.commands,'insertFragment').mockImplementation((...args)=>{insert(...args);throw Error('Vocabulary rollback');});
 await c.askMock(async(req,sources)=>{const pdf=await f.read(sources),parent=await sources.source(sources.issue(c.target(f.sourceId))),text=await sources.source(parent.children[0]);return JSON.stringify({...dcpResponse(req.exchange),composition:[pdfNode(pdf)],anchors:[{id:'new:r1',source:text.handle,revision:text.revision,selector:{exact:'green patina',prefix:'',suffix:''}}],interpretations:[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}]});});expect(c.notice()).toContain('Vocabulary rollback');expect(nativeText(captureNative(e.repository.readState(),c.resourceId()))).toBe(before);
});

const activityFixture=(enabled=true)=>setup(true,true,true,true,false,false,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,enabled);
async function activityExchange(f:Awaited<ReturnType<typeof activityFixture>>){
 const c=f.c!;f.type!('The green patina remains.');const source=f.text!();c.submit();
 await c.askMock(async(req,sources)=>{const parent=await sources.source(req.primaryReply),text=await sources.source(parent.children[0]);return JSON.stringify({...dcpResponse(req.exchange),
  composition:[{id:'new:b1',kind:'paragraph',markup:'<annotation type="style/bold" id="new:s1">Commentary</annotation> about <annotation type="mutable/entity-reference" ref="new:e1">Bronze</annotation>.',ranges:[]}],
  anchors:[{id:'new:r1',source:text.handle,revision:text.revision,selector:{exact:'green patina',prefix:'',suffix:''}}],interpretations:[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}],replyTargets:['new:r1'],
  entities:[{id:'new:e1',name:'Bronze',typename:'Concept',description:'Alloy',aliases:[]}],arguments:[{id:'new:arg1',anchor:'new:r1'},{id:'new:arg2',anchor:'new:s1'}],glosses:[{id:'new:g1',target:'new:r1',type:'Explanation',text:'Evidence of age.'}],relations:[{id:'new:rel1',kind:'argument',type:'supports',from:'new:arg1',to:'new:arg2'}]
 });});expect(c.notice()).toBe('');await tick();return {source,id:c.frontier()!.id};
}
it('routes semantic activity to the workspace while preserving source inspectors',async()=>{
 const f=await activityFixture(),c=f.c!,e=f.editor,{id,source}=await activityExchange(f),summary=c.contributionActivity(id);
 expect(summary().counts).toEqual({references:1,annotations:1,formatting:1,glosses:1,arguments:2,entities:1,relationships:1,unavailable:0});
 const bar=f.host.querySelector<HTMLElement>('[data-contribution-activity="'+id+'"]')!;expect(bar).toBeTruthy();expect(bar.closest('[data-dialectic-contribution]')).toBe(e.mounts.get(c.resolve(c.target(id))!.key)!.root);
 const button=bar.querySelector<HTMLButtonElement>('[data-activity-category=annotations]')!;expect(button.getAttribute('aria-label')).toBe('1 source annotation');expect(button.title).toBeTruthy();button.focus();button.click();await tick();
 const panel=f.host.querySelector<HTMLElement>('[aria-label="Contribution activity inspection"]')!;expect(document.activeElement).toBe(panel);expect(panel.textContent).toContain('Highlight');expect(panel.textContent).toContain('green patina');panel.querySelector<HTMLButtonElement>('.dialectic-activity-item button')!.click();await tick();expect(f.host.querySelector('[aria-label="Annotation inspection"]')!.textContent).toContain('green patina');
 bar.querySelector<HTMLButtonElement>('[data-activity-category=relationships]')!.click();await tick();expect(document.querySelector('.conversation-subtabs [aria-current]')?.textContent).toBe('Semantics');expect(f.host.querySelector('.semantics-detail')!.textContent).toContain('supports');
 const revision=e.repository.state.revision;c.inspectActivity(id,'glosses');const gloss=summary().items.find(i=>i.category==='glosses')!;c.inspectActivityItem({...gloss,target:undefined,annotation:gloss.sources![0]});expect(c.inspectedAnnotation()?.node.key).toBe(source.key);expect(e.repository.state.revision).toBe(revision);
 const snapshots=vi.spyOn(e.repository,'snapshot'),builds=vi.spyOn(c.session()!.projection as any,'build'),reads=vi.spyOn(c.references()!,'text');const counters={...c.activityDiagnostics};
 c.inspect(c.target(id));reads.mockClear();const afterInspect={...c.activityDiagnostics};f.type!('Typing locally');expect(c.activityDiagnostics).toEqual(afterInspect);expect(reads).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();expect(builds).not.toHaveBeenCalled();expect(counters.candidates).toBeGreaterThan(0);
});
it('updates activity after native deletion, restores it with Undo/Redo and reconstructs it from saved native provenance',async()=>{
 const f=await activityFixture(),c=f.c!,e=f.editor,{id,source}=await activityExchange(f),summary=c.contributionActivity(id),expected={...summary().counts};
 const original=structuredClone(e.repository.readState().contents[source.contentKey].payload.standoffProperties) as any[],highlight=original.find(p=>p.type==='style/highlight');
 e.commands.setPayloadField(source.key,'standoffProperties',original.map(p=>p.id===highlight.id?{...p,isDeleted:true}:p));expect(summary().counts.annotations).toBe(0);expect(summary().counts.unavailable).toBe(1);expect(summary().items.find(i=>i.annotation?.propertyId===highlight.id)?.active).toBe(false);
 e.repository.undo();expect(summary().counts).toEqual(expected);e.repository.redo();expect(summary().counts.annotations).toBe(0);e.repository.undo();
 const registry=structuredClone(e.repository.readState().contents[c.root()!.contentKey].payload.linkedAnnotations) as any,argument=Object.values(registry).find((d:any)=>d.type===ARGUMENT) as any;
 e.commands.setPayloadField(c.root()!.key,'linkedAnnotations',{...registry,[argument.id]:{...argument,isDeleted:true}});expect(summary().counts.arguments).toBe(1);expect(summary().counts.relationships).toBe(0);expect(summary().counts.unavailable).toBe(2);e.repository.undo();expect(summary().counts).toEqual(expected);
 const saved=captureNative(e.repository.readState(),c.resourceId()),loaded=new ReactiveEditor({id:'activity-bank',type:'workspace-object-bank-block',children:[]},{features:{nativeKnowledge:false,sqliteKnowledge:false}});cleanup.push(()=>loaded.dispose());const bank=loaded.repository.readState();admitNative(loaded.repository,nativeBytes(saved),bank.placements[bank.rootPlacementKey].contentKey);
 const projection=loaded.createView(),root=Object.values(projection.state.nodes).find(n=>n.viewType==='document-block')!,row=Object.values(projection.state.nodes).find(n=>n.payload.id===id)!;
 const {DialecticReferences}=await import('./references'),{createContributionActivity}=await import('./activity');const index=new DialecticReferences(loaded,projection,root.key);cleanup.push(()=>index.dispose());createRoot(dispose=>{cleanup.push(dispose);const restored=createContributionActivity(()=>(row.payload.metadata as any).dialectic,()=>index,{candidates:0,resolutions:0});expect(restored().counts).toEqual(expected);});
});
it('keeps activity summaries idle during source rebasing and unrelated work, with current ranges resolved on inspection',async()=>{
 const f=await activityFixture(),c=f.c!,e=f.editor,{id,source}=await activityExchange(f),summary=c.contributionActivity(id);summary();c.inspect(c.target(id));
 const before={...c.activityDiagnostics},reads=vi.spyOn(c.references()!,'text'),snapshots=vi.spyOn(e.repository,'snapshot'),treeVisits=c.references()!.diagnostics.treeVisits,build=vi.spyOn(c.session()!.projection as any,'build'),transaction=vi.spyOn(e.commands,'boundedStructuralTransaction'),fetches=vi.mocked(fetch).mock.calls.length;
 const bar=f.host.querySelector('[data-contribution-activity="'+id+'"]')!,mutations:MutationRecord[]=[];const observer=new MutationObserver(records=>mutations.push(...records));observer.observe(bar,{childList:true,subtree:true,characterData:true,attributes:true});cleanup.push(()=>observer.disconnect());
 for(let i=0;i<10;i++)e.commands.replaceInlineRange(source.key,0,0,'x');await tick();expect(c.activityDiagnostics).toEqual(before);expect(reads).not.toHaveBeenCalled();expect(c.references()!.diagnostics.treeVisits).toBe(treeVisits);expect(transaction).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(fetches);expect(mutations).toHaveLength(0);
 const annotation=summary().items.find(i=>i.category==='annotations')!;c.inspectActivityItem(annotation);expect(c.inspectedAnnotation()?.text).toBe('green patina');expect(c.inspectedAnnotation()?.property.start).toBe(14);
});
it('counts human references without fabricating annotation authorship and keeps historical notices separate',async()=>{
 const f=await activityFixture(),c=f.c!,e=f.editor;f.type!('First');c.submit();const first=c.target(c.frontier()!.id);f.type!('Human reply');const draft=c.resolve(c.target(c.draft()!.id))!;
 const notice={version:1,code:'incomplete-operation',severity:'warning',loss:true,detail:'A host-recorded limitation.',target:first};
 e.commands.setPayloadField(draft.key,'metadata',{...(e.repository.readState().contents[draft.contentKey].payload.metadata as any),dialectic:{...JSON.parse(JSON.stringify(c.draft()!.data)),notices:[notice]}});c.setReply(first);c.submit();await tick();const row=c.frontier()!,summary=c.contributionActivity(row.id);expect(summary().counts.references).toBe(1);expect(summary().counts.annotations).toBe(0);expect(summary().notices[0].detail).toBe(notice.detail);
 const bar=f.host.querySelector('[data-contribution-activity="'+row.id+'"]')!;bar.querySelector<HTMLElement>('[aria-label="Contribution warnings"]')!.click();expect(bar.querySelector('details')!.open).toBe(true);expect(bar.textContent).toContain(notice.detail);c.inspectActivity(row.id,'notices');expect(c.activityInspection()).toEqual({id:row.id,category:'notices'});
 const text=c.session()!.projection.node(c.resolve(first)!.children[0])!;e.commands.setPayloadField(text.key,'standoffProperties',[{id:'human-unattributed',type:'style/highlight',start:0,end:2}]);expect(summary().counts.annotations).toBe(0);expect(summary().notices).toHaveLength(1);
 const saved=nativeBytes(captureNative(e.repository.readState(),c.resourceId()));expect(JSON.stringify(decodeNative(saved))).toContain(notice.detail);
});
it('hides empty and disabled activity controls and rejects fabricated notification claims',async()=>{
 for(const enabled of [true,false]){const f=await activityFixture(enabled),c=f.c!;f.type!('Ordinary conversation');c.submit();await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'paragraph',markup:'A plain reply.',ranges:[]}]}));expect(c.notice()).toBe('');await tick();expect(f.host.querySelector('[data-contribution-activity]')).toBeNull();
  const revision=f.editor.repository.state.revision;await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),notices:[{code:'incomplete-operation',detail:'Model claim'}]}));expect(c.notice()).not.toBe('');expect(f.editor.repository.state.revision).toBe(revision);
  if(!enabled){await activityExchange(f);expect(f.host.querySelector('[data-contribution-activity]')).toBeNull();}
 }
});
it('reveals hidden native source faces from contribution activity without editing authored content',async()=>{
 const f=await activityFixture(),c=f.c!,e=f.editor;f.type!('Inspect the reverse');const draft=c.resolve(c.target(c.draft()!.id))!;
 e.commands.insert({id:'activity-surface',type:'surface-block',children:[{id:'activity-front',type:'side-block',children:[{id:'front-text',type:'standoff-editor-block',text:'Front'}]},{id:'activity-back',type:'side-block',children:[{id:'back-text',type:'standoff-editor-block',text:'Hidden green patina'}]}]},{kind:'at',parentKey:draft.key,index:1});c.submit();
 await c.askMock(async(req,sources)=>{const source=await sources.source(sources.issue(c.target('back-text','block')));return JSON.stringify({...dcpResponse(req.exchange),anchors:[{id:'new:r1',source:source.handle,revision:source.revision,selector:{exact:'green patina',prefix:'',suffix:''}}],interpretations:[{id:'new:m1',target:'new:r1',type:'style/highlight',ref:null,attributes:[]}]});});expect(c.notice()).toBe('');await tick();
 const surface=c.resolve(c.target('activity-surface','block'))!,revision=e.repository.state.revision,id=c.frontier()!.id;e.setViewChild(surface.key,surface.children[0]);const item=c.contributionActivity(id)().items.find(i=>i.category==='annotations')!;c.inspectActivity(id,'annotations');c.inspectActivityItem(item);await new Promise(resolve=>setTimeout(resolve,5));expect(e.viewChildren[surface.key]).toBe(surface.children[1]);expect(c.inspectedAnnotation()?.text).toBe('green patina');expect(e.repository.state.revision).toBe(revision);
});
it('retains one activity bar and actionable controls across Desktop and Textual hosting',async()=>{
 const f=await activityFixture(),c=f.c!,e=f.editor,{id}=await activityExchange(f),key=c.resolve(c.target(id))!.key,mount=e.mounts.get(key),snapshot=vi.spyOn(e.repository,'snapshot');
 const box=HTMLElement.prototype.getBoundingClientRect;vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){if(this.classList.contains('textual-workspace'))return {x:0,y:0,left:0,top:0,right:1440,bottom:900,width:1440,height:900,toJSON(){}};if(this.classList.contains('tw-font-probe'))return {x:0,y:0,left:0,top:0,right:2560,bottom:20,width:2560,height:20,toJSON(){}};return box.call(this);});
 expect(f.session.selectPresentation('textual')).toBe(true);await tick();await new Promise(resolve=>setTimeout(resolve,50));
 const textual=document.querySelector('.dialectic-textual')!;expect(textual).toBeTruthy();expect(document.querySelectorAll('[data-contribution-activity="'+id+'"]')).toHaveLength(1);const bar=textual.querySelector('[data-contribution-activity="'+id+'"]')!;expect(bar).toBeTruthy();expect(bar.querySelector('.dialectic-activity-compact')!.textContent).toBe('[R:1]');
 bar.querySelector<HTMLButtonElement>('[data-activity-category=entities]')!.click();await tick();expect(textual.querySelector('.semantics-detail')!.textContent).toContain('Bronze');expect(document.querySelector('.conversation-subtabs [aria-current]')?.textContent).toBe('Semantics');
 expect(f.session.selectPresentation('desktop')).toBe(true);await tick();expect(e.mounts.get(key)).toBe(mount);expect(document.querySelectorAll('[data-contribution-activity="'+id+'"]')).toHaveLength(1);expect(snapshot).not.toHaveBeenCalled();
});
it('records annotation and Gloss effects in native owned margins without counting their structural infrastructure',async()=>{
 const f=await activityFixture(),c=f.c!;f.type!('Write a marginal note');c.submit();
 await c.askMock(async req=>JSON.stringify({...dcpResponse(req.exchange),composition:[{id:'new:b1',kind:'paragraph',markup:'Main text',ranges:[],margins:{left:[{id:'new:b2',kind:'paragraph',markup:'<annotation type="style/highlight" id="new:s1">Marginal evidence</annotation>',ranges:[]}],right:[]}}],glosses:[{id:'new:g1',target:'new:s1',type:'Explanation',text:'A marginal Gloss.'}]}));expect(c.notice()).toBe('');
 const summary=c.contributionActivity(c.frontier()!.id)();expect(summary.counts.formatting).toBe(1);expect(summary.counts.glosses).toBe(1);expect(summary.counts.unavailable).toBe(0);expect(summary.items.filter(i=>i.category==='formatting')).toHaveLength(1);
});
it('does not turn forged effect receipts or historical prose into active native operations',async()=>{
 const f=await activityFixture(),c=f.c!,{id}=await activityExchange(f),row=c.rows().find(r=>r.id===id)!,actual=c.contributionActivity(id)().counts,{createContributionActivity}=await import('./activity');
 const copied=JSON.parse(JSON.stringify(row.data));copied.requestId='unrelated-exchange';copied.dcp.annotationRefs.push({blockId:'foreign-block',propertyId:'invented'});copied.discursiveReferences.push({kind:'block',resourceId:'another-document',blockId:row.id});
 createRoot(dispose=>{cleanup.push(dispose);const forged=createContributionActivity(()=>copied,()=>c.references(),{candidates:0,resolutions:0})();expect(forged.counts.annotations).toBe(0);expect(forged.counts.glosses).toBe(0);expect(forged.counts.entities).toBe(0);expect(forged.counts.relationships).toBe(0);expect(forged.counts.unavailable).toBeGreaterThan(0);});expect(c.contributionActivity(id)().counts).toEqual(actual);
 const old=JSON.parse(JSON.stringify(row.data));delete old.dcp.annotationRefs;createRoot(dispose=>{cleanup.push(dispose);const historical=createContributionActivity(()=>old,()=>c.references(),{candidates:0,resolutions:0})();expect(historical.limited).toBe(true);expect(historical.counts.annotations).toBe(0);expect(historical.counts.glosses).toBe(0);});
});

it('semantic workspace uses the selected AI participant in native provenance and retained request diagnostics',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('Discuss authenticity.');c.submit();
 e.commands.insert({id:'other-agent-contribution',type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'ai',participant:{id:'other-agent',kind:'ai',name:'Other agent'},ordinal:2,replies:[]}},children:[{type:'standoff-editor-block',text:'An earlier perspective.'}]},{kind:'before',anchorKey:c.draft()!.key});c.setSelectedAi('other-agent');
 await c.askMock(async req=>{expect(req.semanticWorkspace.forParticipant).toBe('other-agent');const v:any=dcpResponse(req.exchange);v.entities=[{id:'new:e1',name:'Authenticity',typename:'Concept',description:'Criteria of genuineness.',aliases:[]}];v.composition=[{id:'new:b1',kind:'paragraph',markup:'<annotation type="mutable/entity-reference" ref="new:e1">Authenticity</annotation> involves evidence.',ranges:[]}];v.glosses=[{id:'new:g1',target:{block:'new:b1',revision:null,whole:true},type:'qualification',text:'The relevant evidence depends on the criterion.'}];return JSON.stringify(v);});
 expect(c.notice()).toBe('');const definitions:any[]=Object.values(c.root()!.payload.linkedAnnotations??{});expect(definitions.find(d=>d.type==='mutable/entity').metadata.scopedEntity.provenance.participantId).toBe('other-agent');expect(definitions.find(d=>d.type==='mutable/gloss').metadata.dcp.participantId).toBe('other-agent');expect((c.committed().at(-1)!.data.dcp!.request as any).semanticWorkspace.forParticipant).toBe('other-agent');
 await c.askMock(async req=>{expect(req.semanticWorkspace.entities[0].name).toBe('Authenticity');expect(req.semanticWorkspace.glosses[0].author).toBe('other-agent');return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toBe('');
});

it('shows proactive Entity mentions and inspects them in place without canonical or per-keystroke background work',async()=>{
 const f=await activityFixture(),c=f.c!,e=f.editor;await activityExchange(f);
 const mention=f.host.querySelector<HTMLElement>('.dialectic-entity-mention[data-inline-index]');expect(mention).toBeTruthy();
 const renderer=e.visualEffects.type('mutable/entity-reference')!.renderers[0];expect(renderer.params).toMatchObject({affectsLayout:false});
 const scroll=vi.fn();Object.defineProperty(Element.prototype,'scrollIntoView',{configurable:true,value:scroll});cleanup.push(()=>delete (Element.prototype as any).scrollIntoView);
 const revision=e.repository.state.revision,snapshots=vi.spyOn(e.repository,'snapshot'),transaction=vi.spyOn(e.commands,'boundedStructuralTransaction'),build=vi.spyOn(c.session()!.projection as any,'build');
 window.getSelection()?.removeAllRanges();mention!.click();await tick();
 expect(f.host.textContent).toContain('Alloy');expect(f.host.textContent).toContain('Bronze');expect(scroll).not.toHaveBeenCalled();expect(e.repository.state.revision).toBe(revision);expect(transaction).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const visits=c.references()!.diagnostics.treeVisits,network=vi.mocked(fetch).mock.calls.length,reads=vi.spyOn(c.references()!,'text');
 for(let i=0;i<5;i++)f.type!('x');await tick();
 expect(c.references()!.diagnostics.treeVisits).toBe(visits);expect(fetch).toHaveBeenCalledTimes(network);expect(reads).not.toHaveBeenCalled();expect(transaction).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
});

it('repairs a missing new Entity mention once through the live admission path and commits only the grounded response',async()=>{
 const f=await setup(true,true,true,true),c=f.c!;f.type!('What counts as evidence?');c.submit();let request:any,turn=0;
 const receipt={provider:'openai',model:'fixture',responseId:'response',usage:{input_tokens:1,output_tokens:1}};
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);
  if(url.endsWith('/session'))return Response.json({token:'token'});
  if(url.endsWith('/settings'))return Response.json({settings:body.settings,ready:true});
  if(url.endsWith('/exchange')){request=body.request;expect(request.authoring.proactiveSemantics).toBe(1);return Response.json({id:'e',settings:c.providerSettings()});}
  if(url.endsWith('/turn')){turn++;expect(c.committed()).toHaveLength(1);if(turn===2)expect(body.diagnostic).toMatchObject({code:'entity-mention',path:'$.entities[0]'});
   const value={...dcpResponse(request.exchange),composition:[{id:'new:b1',kind:'paragraph',markup:turn===1?'Evidence can support an inference.':'<e ref="new:e1">Evidence</e> can support an inference.',ranges:[]}],entities:[{id:'new:e1',name:'Evidence',typename:'Concept',description:'Support for an inference.',aliases:[]}]};
   return new Response(JSON.stringify({type:'result',text:JSON.stringify(value),calls:[],receipt})+'\n');}
  return Response.json({});
 }));
 await c.configureProvider({provider:'openai',model:'fixture',maxOutputTokens:2048,repair:true,cadence:'conversational'},'fixture');await c.ask();
 expect(c.notice()).toBe('');expect(turn).toBe(2);expect(c.committed()).toHaveLength(2);expect(c.frontier()!.data.dcp!.provider!.attempts[0].diagnostic).toMatchObject({code:'entity-mention'});
 const node=c.session()!.projection.node(c.resolve(c.target(c.frontier()!.id))!.children[0])!;expect((node.payload.standoffProperties as any[]).filter(p=>p.type==='mutable/entity-reference')).toHaveLength(1);
});

it('uses feature-gated XML through the live controller and leaves typing local',async()=>{
 const f=await setup(true,true,true,true,false,false,true,false,false,true,false,true,false,true,false,true,false,false,true,false,true,true,true,false,true),c=f.c!,e=f.editor;f.type!('An exact source.');c.submit();
 let request:any,round=0;const fetcher=vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);
  if(url.endsWith('/session'))return Response.json({token:'token'});
  if(url.endsWith('/settings'))return Response.json({settings:body.settings,ready:true});
  if(url.endsWith('/exchange')){request=body.request;return Response.json({id:'xml',settings:c.providerSettings(),system:'fixture'});}
  if(url.endsWith('/turn')){round++;const text='<response><p><span id="p">A <b>native</b> reply.</span></p><definitions><gloss target="p" kind="commentary">A useful explanation.</gloss></definitions></response>';return new Response(JSON.stringify({type:'result',text,calls:[],receipt:{provider:'openai',model:'fixture',startedUtc:'start',completedUtc:'end',usage:null,stop:'completed',cost:{status:'unknown'}}})+'\n');}
  return Response.json({});});vi.stubGlobal('fetch',fetcher);
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.configureProvider({provider:'openai',model:'fixture',maxOutputTokens:1024,repair:false,cadence:'conversational'},'fixture');await c.ask();
 expect(c.notice()).toBe('');expect(round).toBe(1);expect(request.dialect).toBe('xml/1');expect(request.xmlContext.sources).toBeDefined();expect(c.committed()).toHaveLength(2);
 expect(c.frontier()!.data.dcp?.response).toContain('<response>');expect(Object.values(c.root()!.payload.linkedAnnotations??{}).some((d:any)=>d.type==='mutable/gloss')).toBe(true);
 e.repository.undo();expect(c.committed()).toHaveLength(1);e.repository.redo();expect(c.committed()).toHaveLength(2);
 const calls=fetcher.mock.calls.length,reads=c.dcpDiagnostics.reads;f.type!('Still local.');expect(fetcher.mock.calls).toHaveLength(calls);expect(c.dcpDiagnostics.reads).toBe(reads);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
});
