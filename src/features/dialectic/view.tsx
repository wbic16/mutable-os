import {SemanticRefreshControl} from './semantic-refresh-view';
import {ConversationWorkspaceTabs,ConversationWorkspacePanels} from './workspace-view';
import {AttachFiles,AttachmentCards,AttachmentStatus} from './attachments-view';
import {smallerImageEvent,type SmallerImageRequest} from './smaller-image-contract';
import {ContributionNavigation,createContentsPreference} from './contents-view';
import {ContributionActivityBar,ContributionActivityInspector} from './activity-view';
import {render} from 'solid-js/web';
import {ProviderSettingsView} from './provider-settings';
import {participantLabel} from './model';
import {SequenceNavigation,SequenceAuthor,SequenceReader} from './sequence-view';
import {For,Show,createEffect,createMemo,createSignal,createRoot,onCleanup,onMount,untrack,type JSX} from 'solid-js';
import type {DocumentApplicationInstance} from '../../feature-api/document-application';
import type {DocumentApplicationPort} from '../../application/document-application-ports';
import {DocumentBrowser} from '../../demo/document-browser';
import {useTextualApplicationHost} from '../textual/applications';
import {TextualSavePrompt} from '../textual/flint';
import type {DialecticController} from './controller';

function Chrome(props:{c:DialecticController;children:JSX.Element;actions?:JSX.Element;textual?:boolean}){
 const c=props.c,modern=c.editor.features.dialecticConversationUpdates;
 const workspace=c.editor.features.dialecticSemanticsWorkspace,conversation=()=>!workspace||c.activeWorkspaceTab().type==='conversation';
 const conversationTitle=createMemo(()=>c.port()?.application.properties()?.title==='New conversation'?(c.port()?.application.files?.location()?.filename.replace(/\.ink$/,'')??'New conversation'):c.port()?.application.properties()?.title??'Conversation');
 const contentsPreference=createContentsPreference(c.editor.features.dialecticSemanticContents,!modern),sidebarOpen=contentsPreference.open;
 const [inspectorOpen,setInspectorOpen]=createSignal(!modern);
 const [formatting,setFormatting]=createSignal(!modern);
 createEffect(()=>{if(c.activityInspection()||c.inspectedAnnotation()||c.inspection()?.kind==='argument'||!workspace&&c.inspection()?.kind==='entity')setInspectorOpen(true);});
 const [fileDrag,setFileDrag]=createSignal(false);
 let root!:HTMLElement;const [mounted,setMounted]=createSignal(false);
 const hosting=()=>mounted()&&!!c.session()?.host.port&&root.contains(c.session()!.host.port!.container)&&c.session()!.host.activity().visible;
 const act=(fn:()=>unknown)=>()=>c.run(fn);
 const save=async()=>{try{await c.port()?.application.files?.save();}catch(e){c.run(()=>{throw e;});}};
 onMount(()=>{
  queueMicrotask(()=>setMounted(true));
  if(workspace)createEffect(()=>{c.resourceId();const inactive=!conversation();for(const panel of root.querySelectorAll<HTMLElement>('.dialectic-canvas [role=tabpanel],.tw-flint-editor'))panel.inert=inactive||panel.hidden;});
  const hasFiles=(event:DragEvent)=>!!event.dataTransfer?.files.length||Array.from(event.dataTransfer?.types??[]).includes('Files');
  const clear=()=>setFileDrag(false);
  const over=(event:DragEvent)=>{if(!c.editor.features.dialecticAttachments||!hasFiles(event))return;event.preventDefault();event.stopPropagation();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';setFileDrag(true);};
  const drop=(event:DragEvent)=>{clear();if(!c.editor.features.dialecticAttachments||!hasFiles(event))return;event.preventDefault();event.stopPropagation();void c.files.attach(Array.from(event.dataTransfer?.files??[]));};
  const leave=(event:DragEvent)=>{if(!(event.relatedTarget instanceof Node)||!root.contains(event.relatedTarget))clear();};
  const outside=(event:DragEvent)=>{if(fileDrag()&&(!(event.target instanceof Node)||!root.contains(event.target)))clear();};
  const escape=(event:KeyboardEvent)=>{if(fileDrag()&&event.key==='Escape'){event.preventDefault();event.stopPropagation();clear();}};
  root.addEventListener('dragenter',over,true);root.addEventListener('dragover',over,true);root.addEventListener('drop',drop,true);root.addEventListener('dragleave',leave);
  window.addEventListener('dragover',outside,true);window.addEventListener('drop',outside,true);window.addEventListener('dragend',clear,true);window.addEventListener('blur',clear);window.addEventListener('keydown',escape,true);
  onCleanup(()=>{root.removeEventListener('dragenter',over,true);root.removeEventListener('dragover',over,true);root.removeEventListener('drop',drop,true);root.removeEventListener('dragleave',leave);window.removeEventListener('dragover',outside,true);window.removeEventListener('drop',outside,true);window.removeEventListener('dragend',clear,true);window.removeEventListener('blur',clear);window.removeEventListener('keydown',escape,true);});

  const shortcut=(e:KeyboardEvent)=>{if(!root.contains(e.target as Node)||e.isComposing||e.altKey||e.shiftKey||!(e.metaKey||e.ctrlKey)||e.key.toLowerCase()!=='s'||(e.target as Element)?.closest('[role="dialog"]'))return;e.preventDefault();e.stopPropagation();void save();};
  const entityClick=(event:MouseEvent)=>{
   if(event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||window.getSelection()?.isCollapsed===false)return;
   const cell=(event.target as Element)?.closest<HTMLElement>('.dialectic-entity-mention[data-inline-index]');
   const block=cell?.closest<HTMLElement>('[data-runtime-key]');
   if(cell&&block&&root.contains(cell)&&c.inspectEntityMention(block.dataset.runtimeKey!,Number(cell.dataset.inlineIndex))){if(workspace){const tab=c.workspaceConfiguration().tabs.find(t=>t.type==='semantics');if(tab)c.setWorkspaceSelection(tab.id);}event.preventDefault();event.stopPropagation();}
  };
  const smallerImage=(event:Event)=>{const request=(event as CustomEvent<SmallerImageRequest>).detail;event.stopPropagation();request.accept(c.smallerImage(request.nodeKey,request.originalUrl,request.signal,request.reason));};
  root.addEventListener(smallerImageEvent,smallerImage);onCleanup(()=>root.removeEventListener(smallerImageEvent,smallerImage));
  root.addEventListener('click',entityClick,true);onCleanup(()=>root.removeEventListener('click',entityClick,true));
  window.addEventListener('keydown',shortcut,true);onCleanup(()=>window.removeEventListener('keydown',shortcut,true));
 });
 const selected=()=>c.inspection(),row=()=>c.rows().find(r=>r.id===selected()?.blockId);
 const resolved=()=>c.resolveReference(selected());
 const selectedTarget=c.exchangeTarget;
 return <section ref={root} class="dialectic-app" classList={{"dialectic-chat":modern}} data-semantics-workspace={workspace} data-formatting={formatting()} aria-label="Dialectic conversation">
  {/* Receive drops outside protected contribution mounts; their native guards stay intact. */}
  <Show when={fileDrag()}><div class="dialectic-file-drop" role="status" contentEditable={false} data-cross-text-controls>Drop files to attach to your draft</div></Show>
  <header class="dialectic-bar" data-cross-text-controls>
   <div><strong>Dialectic</strong><Show when={workspace}><span class="dialectic-current-title">{conversationTitle()}</span></Show><span class="dialectic-subtitle"> Compositions in conversation</span></div>
   <nav aria-label="Conversation actions" onPointerDown={e=>e.preventDefault()}>
    <Show when={modern} fallback={<>{props.actions}<button onClick={()=>void save()}>Save</button></>}>
     <Show when={!c.editor.features.dialecticAutosave}><button onClick={()=>void save()}>Save</button></Show>
     <button aria-label="Formatting" title="Formatting" aria-expanded={formatting()} onClick={()=>setFormatting(v=>!v)}>Aa</button>
     <button aria-expanded={inspectorOpen()} onClick={()=>setInspectorOpen(v=>!v)}>Context & AI</button>
    </Show>
    <details class="dialectic-options"><summary aria-label="Conversation options" title="Conversation options">···</summary><div>
     <Show when={modern}>{props.actions}</Show>
     <button onClick={()=>void c.port()?.saveAs?.().catch(e=>c.run(()=>{throw e;}))}>Save as…</button><button disabled={!!c.sequences.presenting()} onClick={act(()=>c.editor.repository.undo())}>Undo</button><button disabled={!!c.sequences.presenting()} onClick={act(()=>c.editor.repository.redo())}>Redo</button>
    </div></details>
   </nav>
  </header>
  <Show when={modern&&c.saveState()?.error}><div class="dialectic-notice" role="alert">{c.saveState()?.error} <button disabled={c.saveState()?.pending} onClick={c.retrySave}>Retry save</button></div></Show>
  <Show when={c.notice()}><div class="dialectic-notice" role="alert">{c.notice()}</div></Show>
  <Show when={c.root()&&!c.valid()}><p class="dialectic-notice">This Document is not a Dialectic conversation. Its content is unchanged. Open a conversation or choose New.</p></Show>
  <div class="dialectic-body" data-sidebar-open={sidebarOpen()} data-inspector-open={inspectorOpen()}>
   <aside class="dialectic-sidebar" aria-label="Contributions">
    <Show when={modern||c.editor.features.dialecticSemanticContents}><div class="dialectic-rail-actions">
     <button aria-label={sidebarOpen()?'Collapse Contributions':'Expand Contributions'} title={sidebarOpen()?'Collapse Contributions':'Expand Contributions'} aria-expanded={sidebarOpen()} onClick={()=>contentsPreference.toggle()}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg></button>
     <button aria-label="New contribution" title="New contribution" onClick={c.compose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15z"/></svg></button>
     <button aria-label="Return to present" title="Return to present" onClick={c.present}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v14m-6-6 6 6 6-6M4 21h16"/></svg></button>
    </div></Show>
    <Show when={sidebarOpen()}><div class="dialectic-eyebrow">{c.editor.features.dialecticSemanticContents?'Semantic Contents':'Contributions'}</div><p class="dialectic-muted">{c.committed().length} contributions · {c.frontier()?`Present #${c.frontier()!.data.ordinal}`:'Ready to begin'}</p></Show>
    <ContributionNavigation c={c} expanded={sidebarOpen()}/>
    <Show when={sidebarOpen()}><div class="dialectic-sidebar-details">
     <Show when={!modern}><button class="dialectic-entry" onClick={c.compose}>＋ New contribution</button></Show>
     <div class="dialectic-history"><button disabled={c.cursor()<=0} onClick={()=>c.navigate(-1)}>← Back</button><button disabled={c.cursor()>=c.trail().length-1} onClick={()=>c.navigate(1)}>Forward →</button></div>
     <button class="dialectic-present" onClick={c.present}>Return to present</button><SequenceNavigation c={c}/>
    </div></Show>
   </aside>
   <main class="dialectic-main" data-workspace-view={!conversation()}>
    <div class="dialectic-reading-header"><span>{conversationTitle()}</span><span class="dialectic-muted">{modern?(c.editor.features.dialecticAutosave?'Contributions save automatically':'Save with ⌘S / Ctrl+S'):'Native Mutable Document'}</span></div>
    <Show when={workspace}><ConversationWorkspaceTabs c={c}/></Show>
    <Show when={conversation()&&c.sequences.draft()&&hosting()}><SequenceAuthor c={c}/></Show>
    <Show when={conversation()&&c.sequences.presenting()&&hosting()}><SequenceReader c={c} textual={props.textual}/></Show>
    <div class="dialectic-retained-source" hidden={!!c.sequences.presenting()} inert={!!c.sequences.presenting()}>{props.children}</div>
    <Show when={workspace}><ConversationWorkspacePanels c={c}/></Show>
    <Show when={conversation()&&!c.sequences.presenting()}><AttachmentStatus c={c}/></Show>
    <div hidden={!conversation()||!!c.sequences.presenting()} class="dialectic-compose-bar" data-cross-text-controls onPointerDown={e=>e.preventDefault()}>
     <div><Show when={!modern}><strong>Your next contribution</strong></Show><small>{c.reply()?`Replying to ${c.label(c.reply()!)}`:modern?'Write a contribution':'New contribution at the chronological frontier'} <Show when={c.reply()}><button onClick={()=>c.setReply(undefined)}>Clear target</button></Show></small></div>
     <AttachFiles c={c}/>
     <Show when={!modern}><button onClick={c.compose}>Write</button></Show><Show when={modern&&c.busy()} fallback={<button class="dialectic-primary dialectic-send" aria-label="Submit contribution" title="Submit contribution" disabled={!c.valid()||c.busy()||c.providerConfiguring()||c.resending()||c.pasting()||!!c.files.pending()||!!c.files.failure()||!!c.fileProblem()} onClick={()=>void c.submitAndAsk()}>{modern?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6"/></svg>:'Submit'}</button>}><button class="dialectic-primary dialectic-send" aria-label="Cancel response" title="Cancel response" onClick={c.cancel}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/></svg></button></Show>
    </div>
   </main>
   <aside class="dialectic-inspector" hidden={modern&&!inspectorOpen()} inert={!!c.sequences.presenting()} aria-label="Conversation context">
    <div class="dialectic-eyebrow">INSPECTION</div>
    <Show when={c.editor.features.dialecticContributionActivity||c.editor.features.dialecticSemanticContents}><ContributionActivityInspector c={c}/></Show>
    <h3>{selected()?c.label(selected()!):'Explore a contribution'}</h3>
    <Show when={row()}>{r=><p class="dialectic-muted">{r().data.createdUtc?new Date(r().data.createdUtc!).toLocaleString():'Draft'} · {c.editor.features.nativeTextProtection&&r().data.state==='committed'?'Original content protected · annotations welcome':'Content stays editable'}</p>}</Show>
    <button disabled={!selected()||['gloss','entity','argument-relation','entity-relation'].includes(selected()!.kind)} onClick={act(()=>{if(selected())c.setReply(selected());})}>Reply to this</button>
    <button onPointerDown={e=>e.preventDefault()} onClick={act(()=>{const t=c.focusBlock();c.setReply(t);c.inspect(t);})}>Reply to caret Block</button>
    <button onPointerDown={e=>e.preventDefault()} onClick={()=>c.selectRange('reply')}>Reply to selection</button>
    <Show when={selected()?.kind==='range'||selected()?.kind==='argument'}>
     <p role="status">{resolved().status==='resolved'?(resolved().changed?'Source changed since anchoring':'Current passage'):`Unresolved: ${resolved().reason??resolved().status}`}</p>
     <blockquote>{resolved().text}</blockquote>
     <details><summary>Text when anchored</summary><blockquote>{resolved().historical}</blockquote></details>
     <button title="All references to this anchor will follow the selected passage" onPointerDown={e=>e.preventDefault()} onClick={()=>c.reattach(selected()!)}>Reattach to selection</button>
     <small>Reattachment changes the source for every reply sharing this anchor.</small>
     <button onPointerDown={e=>e.preventDefault()} onClick={c.createGloss}>Create Gloss on passage</button>
     <For each={c.glosses()}>{g=><div><button onClick={()=>c.editor.gloss.openDefinition(c.root()!.key,g.id)}>{g.value}</button><button onClick={act(()=>c.pinGloss(g.id))}>Include Gloss</button></div>}</For>
    </Show>
    <Show when={!workspace&&selected()?.kind==='entity'}><Show when={c.entityDetails(selected()!)} fallback={<p>Scoped Entity unavailable. Its qualified reference is retained.</p>}>{e=><dl><dt>Type</dt><dd>{e().typename}</dd><dt>Description</dt><dd>{e().description}</dd><dt>Aliases</dt><dd>{e().aliases.map((a:any)=>a.name).join(', ')}</dd></dl>}</Show></Show>
    <Show when={row()?.data.replies.length}><details open><summary>Reply sources</summary><For each={row()?.data.replies}>{t=><div><button onClick={act(()=>c.inspect(t))}>{c.label(t)}</button><For each={row()?.data.replyExcerpts?.filter(x=>JSON.stringify(x.target)===JSON.stringify(t))}>{x=><><small>Text captured for this reply{c.resolveReference(t).text!==x.text?' · Source changed or unavailable':''}</small><blockquote>{x.text}</blockquote></>}</For></div>}</For></details></Show>
    <Show when={row()?.data.discursiveReferences?.length}><details open><summary>Discursive references</summary><p>Additional passages; the primary reply remains unchanged.</p><For each={row()?.data.discursiveReferences}>{t=><button onClick={act(()=>c.inspect(t))}>{c.label(t)}</button>}</For></details></Show>
    <Show when={!workspace&&selected()?.kind==='argument'}><For each={c.argumentRelations(selected()!.argumentId!)}>{d=>{const r=d.metadata.dialecticArgumentRelation;return <p><button onClick={()=>c.inspect({kind:'argument',...r.from})}>{c.label({kind:'argument',...r.from})}</button> → {r.relation} → <button onClick={()=>c.inspect({kind:'argument',...r.to})}>{c.label({kind:'argument',...r.to})}</button></p>;}}</For></Show>
    <Show when={!workspace&&!c.editor.features.dialecticContributionActivity&&row()?.data.dcp}>{dcp=><details open class="dialectic-native-structures"><summary>Authored structures</summary>
     <p>{row()?.data.discursiveReferences?.length??0} discursive addresses · {dcp().annotationRefs?`${dcp().annotationRefs!.length} annotations`:'annotation details not listed for this earlier response'} · {(Object.values(dcp().identityMap??{}) as any[]).filter(t=>t.kind==='argument-relation'||t.kind==='entity-relation').length} relationships</p>
     <small>Addresses refer to sources without making them arguments. Select an annotation to inspect its current passage and authorship.</small>
     <For each={dcp().annotationRefs?.slice(0,128)}>{ref=>{const details=createMemo(()=>c.annotationDetails(ref));return <button class="dialectic-annotation-link" onClick={()=>c.inspectAnnotation(ref)}>{details()?.property.type??'Unavailable annotation'} · {details()?.text??ref.propertyId.slice(0,8)}</button>;}}</For>
     <Show when={(dcp().annotationRefs?.length??0)>128}><small>Showing the first 128 annotation references.</small></Show>
     <For each={(Object.values(dcp().identityMap??{}) as any[]).filter(t=>t.kind==='argument-relation'||t.kind==='entity-relation')}>{t=><button onClick={()=>c.inspect(t)}>{c.label(t)}</button>}</For>
    </details>}</Show>
    <Show when={c.inspectedAnnotation()}>{a=><section class="dialectic-annotation-inspection" aria-label="Annotation inspection"><strong>{a().property.type}</strong><blockquote>{a().text}</blockquote><p>Authored by {a().property.metadata?.dcp?.actor??'unknown'} · Source author: {a().property.metadata?.dcp?.sourceAuthor??'unknown'}</p><small>Exchange {a().property.metadata?.dcp?.exchangeId??'unavailable'}. Current native annotation; inspection does not edit it.</small></section>}</Show>
    <Show when={!workspace&&(selected()?.kind==='argument-relation'||selected()?.kind==='entity-relation')}><Show when={c.relationshipDetails(selected()!)} fallback={<p>{resolved().reason}</p>}>{r=><p aria-label="Directed relationship"><button onClick={()=>c.inspect(r().from)}>{c.label(r().from)}</button> → {r().relation} → <button onClick={()=>c.inspect(r().to)}>{c.label(r().to)}</button></p>}</Show></Show>
    <Show when={!workspace&&row()?.data.dcp}><details><summary>Semantic identities</summary><For each={Object.values(row()?.data.dcp?.identityMap??{}) as any[]}>{t=><button onClick={()=>c.inspect(t)}>{c.label(t)}</button>}</For></details></Show>
    <Show when={c.titleNotice()}><p class="dialectic-muted" role="status">{c.titleNotice()}</p></Show>
    <hr/><div class="dialectic-eyebrow">NEXT INTERACTION</div>
    <p class="dialectic-muted">Target: {selectedTarget()?c.label(selectedTarget()!):'Select a contribution'}. Selected context remains when you return to the present.</p>
    <button disabled={!selected()} onClick={act(()=>{if(selected())c.pin(selected()!);})}>Include in context</button>
    <button onPointerDown={e=>e.preventDefault()} onClick={act(()=>c.pin(c.focusBlock()))}>Include caret Block</button>
    <button onPointerDown={e=>e.preventDefault()} onClick={()=>c.selectRange('context')}>Include selection</button>
    <ul class="dialectic-pins"><For each={c.context()}>{t=><li><button onClick={act(()=>c.inspect(t))}>{c.label(t)}</button><button aria-label={`Remove context ${c.label(t)}`} onClick={()=>c.unpin(t)}>×</button></li>}</For></ul>
    <Show when={!c.context().length}><p class="dialectic-muted">No additional context selected.</p></Show>
    <Show when={c.editor.features.dialecticProviders&&c.editor.features.dialecticDcp}><ProviderSettingsView c={c}/><label>Assistant <select aria-label="Assistant mode" disabled={c.busy()||c.providerConfiguring()} value={c.providerMode()} onChange={e=>c.setProviderMode(e.currentTarget.value as 'mock'|'live')}><option value="live">AI assistant</option><option value="mock">Deterministic mock</option></select></label></Show><button class="dialectic-primary" disabled={!c.valid()||c.busy()||c.providerConfiguring()} onClick={()=>void c.ask()}>{c.providerMode()==='live'?'Ask AI':'Ask mock assistant'}</button><Show when={c.busy()}><button onClick={c.cancel}>Cancel response</button></Show>
    <Show when={c.dcpPreview()}><details open class="dialectic-dcp-preview"><summary>{c.busy()?'Transient DCP response — not committed':'Uncommitted DCP output'}</summary><pre>{c.dcpPreview()}</pre><Show when={!c.busy()}><button onClick={c.cancel}>Dismiss output</button></Show></details></Show>
    <Show when={c.lastProviderExchange()}><details open={!!c.lastProviderExchange()?.failure}><summary>Last provider attempt (session only)</summary><Show when={c.lastProviderExchange()?.failure}>{failure=><p role="status" aria-label="Exchange failure">Exchange failure: {failure().message}<Show when={failure().diagnostic}>{d=><span> ({d().code} at {d().path}): {d().message}</span>}</Show></p>}</Show><p>Reported usage when available; cost unknown. Failed or cancelled output is not authored content.</p><pre class="dialectic-dcp-record">{JSON.stringify(c.lastProviderExchange(),null,2)}</pre></details></Show>
    <p class="dialectic-footnote">{c.providerMode()==='live'?`${c.providerSettings().provider} · ${c.providerSettings().model}. ${c.editor.features.dialecticAutomaticTitles?'Replies and automatic conversation titles use this provider.':'Only explicit requests contact the provider.'}`:'Deterministic example. No AI service or network request.'} Target plus up to 12 selected items; 6,000 characters maximum.</p>
    <Show when={row()?.data.dcp}><details><summary>DCP exchange record</summary><p>{row()?.data.dcp?.provider?`${row()?.data.dcp?.provider?.settings.provider} · ${row()?.data.dcp?.provider?.settings.model}`:'Structured mock'} · {row()?.data.dcp?.profile} · {row()?.data.dcp?.tools?.length} retrieval calls. Interpretations of source passages are attributed to this exchange, not to the source author.</p><pre class="dialectic-dcp-record">{JSON.stringify(row()?.data.dcp,null,2)}</pre></details></Show>
    <Show when={row()?.data.context?.length}><details><summary>Response provenance</summary><For each={row()?.data.context}>{t=><p>{c.label(t)}</p>}</For></details></Show>
    <Show when={row()?.data.consumedContext}><details><summary>Material supplied to assistant</summary><p>Captured input, not evidence of internal model attention.</p><For each={row()?.data.consumedContext?.items}>{item=><div><button onClick={act(()=>c.inspect(item.target))}>{c.label(item.target)}</button><small>{item.origins.join(' + ')}</small><blockquote>{item.text}</blockquote></div>}</For></details></Show>
   </aside>
  </div>
  <footer class="dialectic-status"><span>{modern&&c.saveState()?.pending?'Saving conversation…':c.busy()?c.responseStatus():c.port()?.application.files?.status()??'Ready'}{c.port()?.application.properties()?.unsaved?' · Unsaved changes':''}</span><span>{modern?'Dialectic':'Chronology ≠ context ≠ presentation'}</span></footer>
 </section>;
}

/** Label existing container mounts without replacing children or creating a renderer fork. */
export function ComposerProgress(props:{c:DialecticController}){
 return <><Show when={props.c.pasting()}><div class="dialectic-paste-progress" role="status"><span class="dialectic-spinner" aria-hidden="true"/>Pasting…</div></Show>
  <Show when={(props.c.busy()||props.c.providerConfiguring())&&props.c.semanticRefreshState()?.status!=='running'}><div class="dialectic-response-progress" role="status" aria-label="Waiting for AI response"><span aria-hidden="true"><i>.</i><i>.</i><i>.</i></span><span class="dialectic-sr-only">{props.c.responseStatus()}</span><Show when={props.c.responseStatus()==='Generating image…'}><span>Generating image…</span></Show></div></Show></>;
}
const decorationOwners=new WeakMap<DialecticController,{users:number;dispose:()=>void}>();
function decorate(c:DialecticController){
 let entry=decorationOwners.get(c);if(!entry){entry=createRoot(dispose=>{decorateMounts(c);return {users:0,dispose};});decorationOwners.set(c,entry);}entry.users++;
 onCleanup(()=>{if(--entry!.users===0){entry!.dispose();decorationOwners.delete(c);}});
}
function decorateMounts(c:DialecticController){
 const documents=new Set<HTMLElement>();
 const decorated=new Map<HTMLElement,{dispose:()=>void;slot:HTMLElement;host:HTMLElement;feedback:HTMLElement}>();
 const clear=(element:HTMLElement)=>{const d=decorated.get(element);if(!d)return;d.dispose();d.host.remove();d.feedback.remove();delete element.dataset.dialecticContribution;delete element.dataset.dialecticDraft;delete element.dataset.dialecticAuthor;delete d.slot.dataset.dialecticDraftSlot;decorated.delete(element);};
 createEffect(()=>{
  const session=c.session(),rows=c.rows().map(r=>({entry:r,key:r.key,id:r.id,label:r.data.state==='draft'?'':`${participantLabel(r.data).toUpperCase()} · ${r.data.ordinal}${r.data.state==='receiving'?' · Receiving…':''}`,draft:r.data.state==='draft',author:r.data.author}));
  let alive=true;
  queueMicrotask(()=>{if(!alive||session!==c.session())return;const keep=new Set<HTMLElement>();for(const r of rows){
   const element=c.editor.mounts.get(r.key)?.root as HTMLElement|undefined;if(!element)continue;keep.add(element);const doc=element.closest<HTMLElement>('[data-block-type="document-block"]');if(doc){doc.dataset.dialecticDocument='true';documents.add(doc);}element.dataset.dialecticContribution=r.label;element.dataset.dialecticDraft=String(r.draft);
   element.dataset.dialecticAuthor=r.author;
   const slot=element.closest<HTMLElement>('.block-selectable')??element;slot.dataset.dialecticDraftSlot=String(r.draft);
   if(!decorated.has(element)){
    const host=document.createElement('div');host.className='dialectic-contribution-tools';host.contentEditable='false';host.setAttribute('data-cross-text-controls','');element.appendChild(host);
    const feedback=document.createElement('div');feedback.className='dialectic-composer-feedback';feedback.contentEditable='false';element.prepend(feedback);
    const stopFeedback=render(()=><><Show when={c.editor.features.dialecticConversationUpdates&&c.draft()?.id===r.id}><ComposerProgress c={c}/></Show><AttachmentCards c={c} items={r.entry.data?.attachments??[]} draft={r.entry.state()==='draft'}/></>,feedback);
    const dispose=render(()=>{let menu!:HTMLDetailsElement;return <><div class="dialectic-contribution-menu"><details ref={menu} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){menu.open=false;menu.querySelector('summary')?.focus();}}}><summary aria-label={`Contribution actions ${r.id}`} title="Contribution actions">···</summary><button disabled={c.busy()||c.providerConfiguring()||c.resending()} onClick={e=>{e.stopPropagation();menu.open=false;void c.resend(r.id);}}>Resend contribution</button></details></div><SemanticRefreshControl c={c} id={r.id}/><Show when={c.editor.features.dialecticContributionActivity}><ContributionActivityBar c={c} id={r.id}/></Show></>;},host);
    decorated.set(element,{dispose:()=>{dispose();stopFeedback();},slot,host,feedback});
   }
  }for(const element of decorated.keys())if(!keep.has(element))clear(element);});
  onCleanup(()=>{alive=false;});
 });
 onCleanup(()=>{for(const element of decorated.keys())clear(element);for(const doc of documents)delete doc.dataset.dialecticDocument;});
}

function AddConversationTab(props:{create:()=>void;disabled?:boolean}){
 return <button type="button" class="dialectic-add-conversation" aria-label="Add Conversation" title="Add Conversation" disabled={props.disabled} onClick={()=>props.create()}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>;
}

export function DialecticDesktop(props:{application:DocumentApplicationInstance;controller:DialecticController;create:()=>void}){
 const [open,setOpen]=createSignal(false),[opening,setOpening]=createSignal(false),[error,setError]=createSignal('');
 let alive=true;onCleanup(()=>{alive=false;});
 decorate(props.controller);
 return <><Chrome c={props.controller} actions={<><button disabled={opening()} onClick={()=>props.controller.run(props.create)}>Add Conversation</button><button disabled={opening()} onClick={()=>{setError('');setOpen(true);}}>Open…</button><button disabled={opening()} onClick={()=>void props.application.vault?.choose?.()}>Vault…</button><Show when={opening()}><span role="status">Opening Document…</span></Show></>}>
  <div class="dialectic-canvas"><props.application.tabs afterTabs={<AddConversationTab disabled={opening()} create={()=>props.controller.run(props.create)}/>}/></div>
 </Chrome><Show when={open()}><DocumentBrowser mode="open" initialLocation={props.application.files?.location()} busy={opening()} error={error()} onClose={()=>setOpen(false)} onChoose={async location=>{
   if(opening())return false;setOpening(true);setError('');
   // Release this chooser's modal before the retained host selects the loaded tab.
   // Its ordinary composition, close and other-modal guards remain authoritative.
   setOpen(false);
   try{await Promise.resolve();if(!alive)return false;if(!props.application.files)throw Error('Native Document opening is unavailable.');await props.application.files.open(location);return true;}
   catch(e){if(alive){setError(String(e));setOpen(true);}return false;}
   finally{if(alive)setOpening(false);}
  }}/></Show></>;
}
export function DialecticTextual(props:{controller:DialecticController;port:DocumentApplicationPort;active:()=>boolean;create:()=>void}){
 const host=useTextualApplicationHost(),c=props.controller,editor=c.editor;
 decorate(c);
 let slot!:HTMLDivElement,surface!:HTMLDivElement,viewport!:HTMLDivElement,root!:HTMLDivElement;
 const [mounted,setMounted]=createSignal(false);
 // Host rebinding changes the port, not the retained session identity. Match
 // Flint's identity memo so leasing cannot retrigger its own cleanup/release.
 const retained=createMemo(()=>props.port.session());
 onMount(()=>{props.port.presented(true);setMounted(true);onCleanup(()=>props.port.presented(false));});
 createEffect(()=>{if(!mounted())return;const s=retained();if(!s)return;untrack(()=>{
  const restore=editor.documentSessions!.presentations.present(s,{container:slot,scrollport:viewport,surfaceContainer:surface,activity:()=>({mounted:true,visible:props.active(),active:props.active()})});
  onCleanup(restore);queueMicrotask(()=>editor.documentSessions?.presentations.restorePosition(s,true));
 });});
 return <div ref={root} class="dialectic-textual" data-mwm-window={props.port.windowId()} inert={!props.active()} style={{'--tw-prose-width':`${Math.max(20,host.grid().columns-58)}ch`}}>
  <Chrome c={c} textual actions={<button onClick={()=>c.run(props.create)}>Add Conversation</button>}>
   <div class="reactive-tabs__labels" role="tablist" aria-label="Conversations"><For each={props.port.tabs()}>{t=><div role="presentation" class="flint-document-tab"><button role="tab" aria-selected={props.port.activeTab()===t.key} onClick={()=>props.port.selectTab(t.key)}>{t.title}<Show when={t.dirty}><span aria-label="Unsaved changes"> *</span></Show><Show when={c.conversations?.status(t.documentId??'')}>{s=><span role="status"> · {s()}</span>}</Show></button><button aria-label={`Close Document: ${t.title}`} onClick={()=>props.port.closeTab?.(t.key)}>×</button></div>}</For><AddConversationTab create={()=>c.run(props.create)}/></div>
   <div ref={viewport} class="dialectic-canvas tw-flint-editor"><div ref={slot} class="tw-flint-slot"/><div ref={surface}/></div>
  </Chrome><Show when={props.port.prompt()} keyed>{prompt=><TextualSavePrompt prompt={prompt} grid={host.grid()}/>}</Show>
 </div>;
}
