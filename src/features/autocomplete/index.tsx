import { codeSurface } from '../standoff-code-mirror/mounts';
import { scryCommands } from './commands';
import {retrievalRequest} from '../../application/retrieval-client';
import {nativeDocumentSession} from '../../persistence/native-session';
import { isTabCommandQuery, parseTabCommand, tabCommandCandidates, tabCommands } from '../../runtime/tab-commands';
import { parseTableCommand, tableCommandCandidates, tableCommands } from '../../runtime/table-commands';
import { taskPrefixOpening, cancelTaskPrefix } from '../../runtime/text-lists';
import { surfaceCommands } from '../../runtime/block-surfaces';
import {ProvisionalCells} from './provisional-cells';
import type { ReactiveEditor } from '../../reactive-editor/editor';
import type { CodexFeature } from '../../feature-api';
import { keyboard, chord } from '../../feature-api';
import { annotationCapabilities } from '../../application/annotation-capabilities';
import { activateCompletionPassage, completionDocuments, flintDocumentChoices, prepareFlintCommand, type FlintDocumentChoice } from '../../application/completion-documents';
import {flintCommand} from './flint-command';
import {graphemeBoundaries} from '../../input/graphemes';
import {moveBoundary,nextWordLength,boundaryNavigator} from './brackets';
import { invocation } from './model';
import { CompletionSession, type CompletionSource } from './session';
import { CompletionPopup } from './view';
import type { EntitySearchData } from '../entity-references/entity-search';
import type { DocumentTarget } from '../../feature-api/document-application';
import './style.css';

export function createAutocompleteFeature(editor: ReactiveEditor): CodexFeature {
 return { id:'autocomplete-workstation',activate(scope) {
  const api=annotationCapabilities(editor,scope);
  let draft:{cells:ProvisionalCells;source:CompletionSource;release:()=>void}|undefined;
  let finishing=false;
  let composition:{key:string;start:number;end:number}|undefined;
  let current:CompletionSession|undefined, overlay:string|undefined, stopInventory:(()=>void)|undefined;
  let firstOpen:{key:string;cell:string;char:string}|undefined;
  let selectedOpen:{key:string;char:string;end:number;version:number}|undefined;
  let releaseBindings:(()=>void)[]=[];
  let entityControls: {run(id:string):boolean;busy():boolean;canClose():boolean}|undefined;
  const text=(key:string,start:number,end:number)=>{if(draft?.source.nodeKey===key){if(draft.cells.cells.slice(start,end).some(c=>c.plain===false))throw Error('Completion requires plain text');return draft.cells.text(start,end);}const n=editor.node(key); if(!n)return '';let out='';for(let i=start;i<end;i++){const c=editor.node(n.inlineContent[i]);if(c?.viewType!=='text-cell')throw Error('Completion requires plain text');out+=String(c.payload.text??'');}return out;};
  const snapshot=(key:string,start:number,end:number,inline:boolean):CompletionSource=>{
   const n=editor.node(key);if(!n||n.viewType!=='standoff-editor-block')throw Error('Select a text occurrence first');
   return {nodeKey:key,contentKey:n.contentKey,placementKey:n.placementKey,viewId:n.viewId,version:editor.repository.state.contents[n.contentKey]?.inlineRevision??0,start,end,literal:text(key,start,end),inline};
  };
  const valid=(s:CompletionSource)=>{
   const n=editor.node(s.nodeKey),handle=editor.mounts.get(s.nodeKey);
   return !!n&&!!handle?.root.isConnected&&!handle.root.closest('[hidden],[inert]')&&!handle.composing&&n.viewId===s.viewId&&n.contentKey===s.contentKey&&n.placementKey===s.placementKey&&(editor.repository.state.contents[n.contentKey]?.inlineRevision??0)===s.version;
  };
  const canDismiss=()=>{
   if(!draft)return true;const d=draft,n=editor.node(d.source.nodeKey);
   if(n?.contentKey===d.source.contentKey&&(editor.repository.state.contents[n.contentKey]?.inlineRevision??0)===d.source.version)return true;
   if(d.cells.edits.length&&!window.confirm('The source changed in another view. Keep the newer Document text and discard this stale Scry draft? Choose Cancel to return and copy the source phrase first.'))return false;
   editor.mounts.get(d.source.nodeKey)?.presentProvisional?.(undefined);draft=undefined;d.release();return true;
  };
  const finishDraft=(entity?:{id:string;name:string},reviewed:import('../../block-tree/types').RepositoryOperation[]=[])=>{
   if(!draft||finishing)return;const d=draft,s=d.source;
   const node=editor.node(s.nodeKey);
   if(!node||node.contentKey!==s.contentKey||(editor.repository.state.contents[s.contentKey]?.inlineRevision??0)!==s.version)throw Error('The source changed in another view. Copy the draft text before closing; it cannot overwrite newer content.');
   finishing=true;
   try{
    if(entity&&d.cells.mode==='autocomplete')d.cells.replacePhrase(entity.name);
    editor.commands.completeProvisionalText(s.nodeKey,s.version,d.cells.edits,entity?{start:d.cells.start,end:d.cells.end,value:entity.id,name:entity.name}:undefined,reviewed);
    editor.mounts.get(s.nodeKey)?.presentProvisional?.(undefined);draft=undefined;d.release();
   }finally{finishing=false;}
  };
  const clearSession=()=>{
   const old=current;current=undefined;entityControls=undefined;selectedOpen=undefined;firstOpen=undefined;boundaryCache=undefined;composition=undefined;
   releaseBindings.splice(0).forEach(release=>release());old?.dispose();
   stopInventory?.();stopInventory=undefined;const key=overlay;overlay=undefined;if(key)editor.overlays.close(key,false,true);
  };
  const cancel=(keepLiteral=false)=>{
   if(finishing)return false;
   if(current?.alive&&entityControls&&!entityControls.canClose())return false;
   if(!canDismiss())return false;
   if(draft){try{if(draft.cells.pending)draft.cells.replace(draft.cells.start,draft.cells.end,draft.cells.mode==='mention'?'(':'[');finishDraft();}catch(e){current?.fail(e);return false;}}
   const s=current?.source;
   // The legacy fallback alone retains its explicit literal-punctuation action.
   // Provisional markers are never part of the completed Document action.
   if(!editor.features.scryProvisionalCells&&keepLiteral&&s?.brackets&&valid(s)){
    const opening=s.brackets==='mention'?'((':'[[',closing=s.brackets==='mention'?'))':']]';
    editor.commands.replaceInlineRange(s.nodeKey,s.start,s.end,opening+s.literal+closing,'Keep literal Scry brackets');
   }
   clearSession();
  };
  const restore=(s:CompletionSource,end:number)=>{queueMicrotask(()=>{const n=editor.node(s.nodeKey),h=editor.mounts.get(s.nodeKey);if(!h?.root.isConnected||h.root.closest('[hidden],[inert]')||n?.contentKey!==s.contentKey)return;editor.focus.request(s.nodeKey,{reason:'autocomplete-commit'});h.restoreInlineSelection?.({anchor:end,head:end});editor.selections.setPrimary(s.nodeKey,s.contentKey,s.viewId,end);});};
  const entityData=(session:CompletionSession,review=false,authority=false):EntitySearchData=>{
    session.assertSource(); const s=session.source, parsed=session.parsed;
    // Review annotations on the authored phrase; opening the tool never deletes syntax.
    let start=s.start,end=s.end;
    if(!s.brackets&&s.inline){start++;end=start+[...parsed.mention].length;}
    const ranges=!draft&&end>start?[{...editor.textRanges.snapshot(s.nodeKey,start,end),coordinate:'cell' as const}]:[];
    return {entityRanges:ranges,entityRevision:api.revision(),entityQuery:parsed.mention,workstation:{query:parsed.createName??parsed.query,review,entityId:session.state.selected,createName:parsed.createName,authority,...(s.brackets?{scry:{mode:s.brackets,valid:()=>session.alive&&valid(session.source),commit:(entity)=>{session.assertSource();const label=s.brackets==='autocomplete'?entity.name:session.state.sourceText;if(!label)throw Error('Type mention text before linking.');session.host.commit(session.source,entity,label);session.complete();},batch:(commit,entity)=>{session.assertSource();if(draft){if(!entity)throw Error('Select an Entity');const reviewed=editor.commands.captureAnnotationBatch(commit);finishDraft(entity,reviewed);}else commit();restore(session.source,session.source.end);session.complete();},cancel:()=>session.close(),keepLiteral:editor.features.scryProvisionalCells?undefined:()=>{if(!entityControls||entityControls.canClose())session.close(true);}}}:{}),...(s.inline&&!s.brackets?{invocation:editor.textRanges.snapshot(s.nodeKey,s.start,s.end)}:{})}};
  };
  const open=(source:CompletionSource,kind:CompletionSession['state']['kind'],input:string)=>{
   if(current)cancel();if(current)return;
   if(kind==='entity'){
    const documentScope=api.scope(source.nodeKey,'document');
    const existing=editor.overlays.overlays.find(o=>(o.viewType==='entity-search'||o.viewType==='autocomplete'&&(o.data as any)?.entitySearch)&&editor.node(o.ownerKey)?.viewId===source.viewId&&api.scope(o.ownerKey,'document').rootKey===documentScope.rootKey);
    if(existing){editor.overlays.close(existing.key,false);if(editor.overlays.overlays.some(o=>o.key===existing.key)){editor.focus.request(existing.key,{reason:'entity-tool-pending'});return;}}
   }
   let service:import("../../feature-api/entities").EntityService|undefined;try{if(kind==='document')service=api.entities?.(source.nodeKey);}catch{/* Non-Entity commands remain usable. */}
   const session=new CompletionSession({service,historyScope:()=>service?.historyScope?.()??Promise.resolve(`session:${source.viewId}`),
    canDismiss,
    passages:editor.features.semanticRetrieval?async(query,strategy,signal)=>{
     const result=await retrievalRequest('query',{query,strategy,key:`scry:${source.viewId}`,limit:20},signal);
     const native=nativeDocumentSession(editor);
     return {rows:result.results.filter((hit:any)=>{const evidence=native.knowledgeEvidence(hit.source.resourceId);return !evidence.location||!native.isDirty(hit.source.resourceId)&&evidence.byteHash===hit.source.sourceHash&&!evidence.pending;}).map((hit:any)=>({id:`${hit.source.resourceId}:${hit.source.spans[0]?.blockGuid}:${hit.source.spans[0]?.start}`,name:hit.text.slice(0,180),reason:`${strategy==='lexical'?'FTS5':'Semantic'} · ${hit.source.path} · ${hit.source.format&&hit.source.format!=='mutable-document'?'Open this legacy source manually to navigate':'saved passage'}`,disabled:!!hit.source.format&&hit.source.format!=='mutable-document',data:hit})),status:'Partial saved-source coverage; unsaved Documents remain outside this index. Indexing and permissions: Workspace → Index Cavern.'};
    }:undefined,
    navigatePassage:async(row,current)=>activateCompletionPassage(editor,source.nodeKey,row.data,current),
    documentEntities:()=>[], // Entity inventory and search belong to LER.
    documents:async()=>{const pool=await completionDocuments(editor,source.nodeKey).completionTargets();return pool.sources.map(t=>({id:t.documentId,name:t.title,reason:`Document · ${t.location}`,data:t}));},
    commandArguments:query=>{
     if(!editor.features.flintSlashCommands||!editor.features.flint)return;
     const parsed=flintCommand(query);if(parsed?.kind!=='document')return;
     return {key:'flint.documents',query:parsed.query,load:async signal=>(await flintDocumentChoices(editor,source.nodeKey,signal)).map(doc=>({id:`flint.document:${doc.documentId}`,name:doc.title,reason:doc.disabled?'Document unavailable or ambiguous':`Open in Flint · ${doc.location?`${doc.location.folder==='.'?'':doc.location.folder+'/'}${doc.location.filename}`:'Unsaved Document · '+doc.documentId}`,disabled:doc.disabled,data:doc}))};
    },
    commands:(query='')=>scryCommands(editor,source.nodeKey,query),
    valid,
    commit:(s,e,label)=>{
     if(!valid(s))throw Error('Stale source');
     if(draft){const end=draft.cells.start+[...label].length;finishDraft(e);restore(s,end);return;}
     const range=editor.textRanges.snapshot(s.nodeKey,s.start,s.end),metadata={entityId:e.id,entityName:e.name};
     // Linking unchanged prose adds a standoff annotation. Replacing identical
     // text would delete/rebase existing overlapping annotations and Cell IDs.
     if(label===s.literal)api.annotate([[range]],'codex/entity-reference',e.id,metadata,api.revision(),'Link Scry mention');
     else api.replaceAndAnnotate!(range,label,'codex/entity-reference',e.id,metadata,api.revision());
     restore(s,s.start+[...label].length);
    },
    reference:async(s,c,label)=>{const k=completionDocuments(editor,s.nodeKey),token=k.selection(editor.textRanges.snapshot(s.nodeKey,s.start,s.end));await k.createReference(token,c.data as DocumentTarget,label,()=>session.alive&&valid(s));restore(s,s.start+[...label].length);},
    command:(s,id,row,current)=>{
     if(editor.features.flintSlashCommands&&(id==='flint.open'||id.startsWith('flint.document:'))){
      return (async()=>{
       const show=await prepareFlintCommand(editor,s.nodeKey,()=>current()&&valid(s),id==='flint.open'?undefined:row.data as FlintDocumentChoice);
       session.assertSource(s);
       show(()=>{
        if(!valid(s))throw Error('The command source changed');
        if(s.inline)editor.commands.replaceInlineRange(s.nodeKey,s.start,s.end,'','Run Flint command');
        session.complete();
       });
      })();
     }
     if(id==='gloss.create'){
      if(!valid(s))throw Error('Stale Gloss source');
      const selection={anchor:s.start,head:s.end};
      if(s.inline)throw Error('Select text or place the caret inside a word before invoking /gloss.');
      queueMicrotask(()=>{if(valid(s))void editor.commandRegistry.execute('gloss.create',{targetKey:s.nodeKey,args:{selection}});});return;
     }
     if(tabCommands.some(c=>c.id===id)){
      if(!valid(s))throw Error('Stale command source');
      const parsed=parseTabCommand(session.state.input);
      editor.commandRegistry.execute(id,{targetKey:s.nodeKey,args:{...(parsed?.id===id?parsed.args:{}),invocation:s.inline?{nodeKey:s.nodeKey,contentKey:s.contentKey,placementKey:s.placementKey,version:s.version,start:s.start,end:s.end,coordinate:'cell'}:undefined}});return;
     }
     if(tableCommands.some(c=>c.id===id)){
      if(!valid(s))throw Error('Stale command source');
      editor.commandRegistry.execute(id,{targetKey:s.nodeKey,args:{invocation:s.inline?{nodeKey:s.nodeKey,contentKey:s.contentKey,placementKey:s.placementKey,version:s.version,start:s.start,end:s.end,coordinate:'cell'}:undefined}});return;
     }
     if(surfaceCommands.some(c=>c.id===id)){queueMicrotask(()=>{if(valid(s))editor.surfaces.run(id,s.nodeKey,{nodeKey:s.nodeKey,start:s.start,end:s.end,version:s.version});});return;}
     if(id==='search'){queueMicrotask(()=>open(s,'block',''));return;}
     if(id==='entity'||id==='link') {queueMicrotask(()=>open(s,id==='entity'?'entity':'document',''));return;}
     if(id==='date'){const now=new Date(),label=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;editor.commands.replaceInlineRange(s.nodeKey,s.start,s.end,label);restore(s,s.start+label.length);return;}
     if(!editor.commandRegistry.canExecute(id,{targetKey:s.nodeKey,args:undefined}))throw Error('Action unavailable');
     // Navigation/tool actions preserve the literal invocation; they do not rewrite prose.
     queueMicrotask(()=>{if(valid(s))void editor.commandRegistry.execute(id,{targetKey:s.nodeKey,args:undefined});});
    },dismiss:cancel,
   },source,kind,input);
   current=session;leaseBindings();
   if(kind==='entity')session.suspend(); // LER owns Entity resolution; no competing search stream.
   overlay=editor.overlays.open({ownerKey:source.nodeKey,viewType:'autocomplete',data:{session,entitySearch:kind==='entity',api,entityData:()=>entityData(session),adjust:(edge:'start'|'end',direction:-1|1,word:boolean)=>changeBoundary(session,edge,direction,word),controls:(value:typeof entityControls)=>entityControls=value},anchor:{x:0,y:0},allowDocumentInput:true,explicitDismissal:true,retainEditorFocus:source.inline});
  };
  api.register.panel({type:'autocomplete',view:props=><CompletionPopup editor={editor} panel={props.panel} cancelled={()=>{if(current===(props.panel.data as any).session)cancel();}}/>});
  const leaseBindings=()=>{
   const binding=(id:string,key:string,mods:('Ctrl'|'Shift'|'Meta'|'Alt')[]=[])=>{
    const action=`autocomplete.${id}`;
    const release=editor.bindings.register({id:action,name:`Scry ${id}`,description:'Only during this occurrence-scoped Scry interaction',category:'Autocomplete',tags:[],scope:'autocomplete',defaults:id.startsWith('end.word.')?[keyboard(key,'Alt'),keyboard(key,...mods)]:[keyboard(key,...mods)],handler:ctx=>ctx.run(action)},scope.owner);
    releaseBindings.push(release);
    const conflicts=editor.bindings.conflicts(action,editor.bindings.effective(action));
    if(conflicts.length){release();current?.fail(`Scry shortcut ${id} conflicts with ${conflicts.map(c=>c.name).join(', ')}. Change its binding to enable it.`);}
   };
   binding('next','ArrowDown');binding('previous','ArrowUp');binding('choose','Enter');binding('close','Escape');binding('review','a',['Ctrl']);
   for(const edge of ['start','end'])for(const unit of ['word','character'])for(const direction of [-1,1])binding(`${edge}.${unit}.${direction}`,direction<0?'ArrowLeft':'ArrowRight',['Ctrl',...(edge==='start'?['Alt' as const]:[]),...(unit==='character'?['Shift' as const]:[])]);
  };
  const bracketSnapshot=(key:string,start:number,end:number,mode:NonNullable<CompletionSource['brackets']>)=>({...snapshot(key,start,end,true),brackets:mode});
  let boundaryCache:{session:CompletionSession;key:string;version:number;move:ReturnType<typeof boundaryNavigator>}|undefined;
  const changeBoundary=(session:CompletionSession,edge:'start'|'end',direction:-1|1,word:boolean)=>{
   try{
    session.assertSource();const s=session.source;if(!s.brackets||entityControls?.busy())return;
    const n=editor.node(s.nodeKey)!;
    if(boundaryCache?.session!==session||boundaryCache.key!==s.nodeKey||boundaryCache.version!==(draft?.cells.generation??s.version)){
     boundaryCache={session,key:s.nodeKey,version:draft?.cells.generation??s.version,move:boundaryNavigator(draft?draft.cells.text():text(s.nodeKey,0,n.inlineContent.length))};
    }
    let {start,end}=s;const next=boundaryCache.move(edge==='start'?start:end,direction,word,edge);
    if(edge==='start')start=Math.min(next,end);else end=Math.max(next,start);
    if(start===s.start&&end===s.end)return;
    if(text(s.nodeKey,start,end).length>1000)throw Error('Scry phrases are limited to 1000 characters.');
    draft?.cells.boundaries(start,end);
    const updated=bracketSnapshot(s.nodeKey,start,end,s.brackets);
    session.update(updated,updated.literal);restore(updated,edge==='start'?start:end);
   }catch(e){session.fail(e);}
  };
  const run=(id:string)=>{const s=current;if(!s)return false;if(entityControls&&['autocomplete.next','autocomplete.previous','autocomplete.choose','autocomplete.review','autocomplete.close'].includes(id))return entityControls.run(id.slice(13));if(id==='autocomplete.next')s.move(1);else if(id==='autocomplete.previous')s.move(-1);else if(id==='autocomplete.choose')void s.choose();else if(id==='autocomplete.close'){const source=s.source;cancel();restore(source,source.end);}else if(id==='autocomplete.review'){return false;}else if(/^autocomplete\.(start|end)\.(word|character)\.-?1$/.test(id)){const [,edge,unit,dir]=id.split('.');changeBoundary(s,edge as 'start'|'end',Number(dir) as -1|1,unit==='word');}else return false;return true;};
  const intercept=(key:string,start:number,end:number,value:string,type:string):boolean=>{
   if (!current && !draft && type === 'insertText' && value === '[') {
    const task = taskPrefixOpening(editor, key, start, end);
    if (task === 'fresh') return false; // Let the gateway's task recognizer own this opener.
    if (task === 'restored') {
     // A second bracket is Scry, not a task. Transfer the already-authored first
     // bracket once, then use the ordinary two-character Scry trigger.
     cancelTaskPrefix(editor);
     const node=editor.node(key)!;
     editor.commands.replaceInlineRange(key, start - 1, start, '', 'Start Scry');
     editor.commands.wrapTextBlockInList(key, 2);
     const target=editor.nodeForPlacementInView(node.placementKey,node.viewId)!;
     return intercept(target.key, 0, 0, '[[', type);
    }
   }
   if(editor.features.scryProvisionalCells&&!current){
    if(draft?.cells.pending){
     if(type==='insertText'&&value===(draft.cells.mode==='mention'?'(':'[')&&key===draft.source.nodeKey){
      const d=draft;let finish=d.cells.end;
      if(finish===d.cells.start)finish+=nextWordLength(d.cells.text(finish,Math.min(d.cells.cells.length,finish+1000)));
      d.cells.activate(finish);const source=bracketSnapshot(key,d.cells.start,finish,d.cells.mode);
      open(source,'entity',source.literal);restore(source,source.end);return true;
     }
     const at=draft.cells.start,extent=draft.cells.end;
     if(type==='deleteContentBackward'){const d=draft;draft=undefined;editor.mounts.get(key)?.presentProvisional?.(undefined);d.release();restore(d.source,at);return true;}
     cancel();if(type==='insertText'&&value){const position=at+1;editor.commands.replaceInlineRange(key,position,position,value);restore(snapshot(key,position,position+[...value].length,true),position+[...value].length);return true;}return false;
    }
    if(type==='insertText'&&['[','(','[[','(('].includes(value)){
     const node=editor.node(key),mount=editor.mounts.get(key);if(!node||!mount||mount.composing||editor.selections.sets[key]?.items.length>1)return false;
     if((node.payload.standoffProperties as any[]??[]).some(p=>!p.isDeleted&&(/(?:^|[/:-])(?:code|literal)(?:$|[/:-])/.test(p.type??'')||p.type==='text/superposition')&&p.start<=end&&p.end>=start))return false;
     if(start>0&&text(key,start-1,start)==='\\')return false;
     const cells=node.inlineContent.map((cellKey,canonicalIndex)=>{const c=editor.node(cellKey)!;return {key:cellKey,text:String(c.payload.text??'\uFFFC'),canonicalIndex,plain:c.viewType==='text-cell'};});
     const source=snapshot(key,start,end,true),mode=value[0]==='('?'mention':'autocomplete';
     const provisional=new ProvisionalCells(cells,start,end,mode,value.length===1);
     draft={cells:provisional,source,release:editor.repository.suspendHistory()};mount.presentProvisional?.(provisional);
     if(value.length===2){let finish=end;if(start===end)finish+=nextWordLength(provisional.text(end,Math.min(cells.length,end+1000)));provisional.activate(finish);const s=bracketSnapshot(key,start,finish,mode);open(s,'entity',s.literal);restore(s,finish);}else restore(source,start);
     return true;
    }
   }
   const session=current,s=session?.source;
   if(s?.brackets){
    if(key!==s.nodeKey){cancel();return false;}
    if(!valid(s)){cancel();return true;}
    if(session!.state.pending||entityControls?.busy())return true;
    const lo=s.start,hi=s.end;
    if(start<lo||end>hi){restore(s,Math.max(lo,Math.min(hi,start)));return true;}
    if(type==='insertText'&&value===':'&&start!==end){session!.input('');session!.expand();queueMicrotask(()=>document.querySelector<HTMLInputElement>('.autocomplete-workstation input')?.focus());return true;}
    if(!['insertText','insertFromPaste','deleteByCut','deleteContentBackward','deleteContentForward','deleteWordBackward','deleteWordForward'].includes(type))return true;
    if(type.startsWith('delete')){
     value='';if(start===end&&type.startsWith('deleteWord')){const next=moveBoundary(session!.state.sourceText,start-lo,type.endsWith('Backward')?-1:1,true)+lo;if(type.endsWith('Backward'))start=next;else end=next;}else if(start===end){const boundaries=graphemeBoundaries(session!.state.sourceText).map(i=>i+lo);if(type==='deleteContentBackward')start=boundaries.filter(i=>i<start).at(-1)??lo;else end=boundaries.find(i=>i>end)??hi;}
    }
    value=value.replace(/[\r\n]/g,' ');if(value&&value.length+session!.state.sourceText.length-text(key,start,end).length>1000){session!.fail('Scry phrases are limited to 1000 characters.');return true;}
    if(start===end&&!value)return true;
    if(draft)draft.cells.replace(start,end,value);else editor.commands.replaceInlineRange(key,start,end,value);
    const updated=bracketSnapshot(key,s.start,s.end+[...value].length-(end-start),s.brackets);
    session!.update(updated,updated.literal);restore(updated,start+[...value].length);return true;
   }
   if(type!=='insertText'||!['[','(','[[','(('].includes(value)){selectedOpen=undefined;firstOpen=undefined;return false;}
   const n=editor.node(key);if(!n||editor.mounts.get(key)?.composing||editor.selections.sets[key]?.items.length>1)return false;
   if((n.payload.standoffProperties as any[]??[]).some(p=>!p.isDeleted&&/(?:^|[/:-])(?:code|literal)(?:$|[/:-])/.test(p.type??'')&&p.start<=end&&p.end>=start))return false;
   const char=value[0],prior=start>0?text(key,start-1,start):'',selected=selectedOpen;
   const ownsFirst=firstOpen?.key===key&&firstOpen.char===char&&n.inlineContent[start-1]===firstOpen.cell;
   if(value.length===1&&!ownsFirst){
    // Preserve the selection through the first keystroke of a two-character trigger.
    try{text(key,start,end);}catch{return false;}
    editor.commands.replaceInlineRange(key,start,start,char);firstOpen={key,char,cell:n.inlineContent[start]};selectedOpen=start!==end?{key,char,end:end+1,version:editor.repository.state.contents[n.contentKey]?.inlineRevision??0}:undefined;restore(snapshot(key,start,start+1,true),start+1);return true;
   }
   if(value.length===1&&(prior!==char||!ownsFirst))return false;
   const begin=value.length===2?start:start-1;
   const selectedEnd=selected?.key===key&&selected.char===char&&selected.version===(editor.repository.state.contents[n.contentKey]?.inlineRevision??0)?selected.end:undefined;
   if(selectedEnd===undefined&&start===end&&begin>0&&text(key,begin-1,begin)==='\\')return false;
   let finish=selectedEnd??end;
   if(finish===start){let suffix='';for(let i=start;i<Math.min(n.inlineContent.length,start+1000);i++){const c=editor.node(n.inlineContent[i]);if(c?.viewType!=='text-cell')break;suffix+=String(c.payload.text??'');if(/\s/u.test(String(c.payload.text??'')))break;}finish=start+nextWordLength(suffix);}
   try{text(key,start,finish);}catch{return false;}
   cancel();
   // The first typed opener is owned input; consume it once on recognition.
   // The second opener and both displayed brackets are interaction chrome.
   if(value.length===1){editor.commands.replaceInlineRange(key,begin,begin+1,'','Start Scry');finish--;}
   const source=bracketSnapshot(key,begin,finish,char==='('?'mention':'autocomplete');
   open(source,'entity',source.literal);restore(source,source.end);return true;
  };
  editor.completionInput={cancel,intercept,input:key=>draft?.source.nodeKey===key,beforeSave(){
   if(!draft)return true;
   if(draft.cells.pending){cancel();return !draft;}
   current?.fail('Finish linking, or cancel Scry to keep the phrase without a link, then Save again.');
   if(window.confirm('Scry contains provisional text. Cancel Scry and keep the phrase without linking? Choose Cancel to continue Scry. Save again after Scry finishes.'))cancel();
   return false;
  },composition(key,phase,value){
   if(!draft||draft.source.nodeKey!==key||draft.cells.pending)return false;
   if(phase==='start'){const range=editor.mounts.get(key)?.captureInlineSelection?.();if(!range)return false;composition={key,start:Math.min(range.anchor,range.head),end:Math.max(range.anchor,range.head)};return true;}
   const captured=composition;composition=undefined;if(!captured||!current)return false;
   editor.mounts.get(key)?.finishProvisionalComposition?.();
   intercept(key,captured.start,captured.end,value,'insertText');return true;
  },pointer(event){
   if(draft?.cells.pending){cancel();return false;}
   const s=current?.source;if(!s?.brackets)return false;
   const target=event.target as Element;
   if(draft&&target.closest?.('[data-document-save],[data-document-history],[data-system-menu-trigger],[role="menu"],[role="menuitem"]'))return false;
   if(target.closest?.('.autocomplete-workstation,.reactive-entity-search'))return false;
   const resolved=editor.mounts.resolveEvent(event),point=resolved?.handle.inlinePointAt?.(event.clientX,event.clientY);
   if(resolved?.nodeKey!==s.nodeKey||point===undefined||point<s.start||point>s.end){cancel();return false;}
   editor.selectionGestures.cancelGesture();return true;
  },clipboard(event){
   const s=current?.source,resolved=editor.mounts.resolveEvent(event);if(!s?.brackets||resolved?.nodeKey!==s.nodeKey)return false;
   const range=resolved.handle.captureInlineSelection?.();if(!range)return false;
   const start=Math.min(range.anchor,range.head),end=Math.max(range.anchor,range.head);
   if((event.type==='copy'||event.type==='cut')&&event.clipboardData)event.clipboardData.setData('text/plain',text(s.nodeKey,Math.max(s.start,start),Math.min(s.end,end)));
   if(event.type!=='copy')intercept(s.nodeKey,start,end,event.type==='paste'?event.clipboardData?.getData('text/plain')??'':'',event.type==='paste'?'insertFromPaste':'deleteByCut');event.preventDefault();event.stopPropagation();return true;
  },before(key,start,end,text,type){
   if(editor.features.glossMode&&type==='insertText'&&text==='/'&&!current){
    try{editor.gloss.target(key,{anchor:start,head:end});open(snapshot(key,start,end,false),'command','');return true;}catch{/* Other slash commands retain their existing literal path. */}
   }
   if(type!=='insertText'||text!==':'||end<=start||end-start>1000)return false;
   const n=editor.node(key);if((n?.payload.standoffProperties as any[]??[]).some(p=>!p.isDeleted&&/(?:^|[/:-])(?:code|literal)(?:$|[/:-])/.test(p.type??'')&&p.start<end&&p.end>=start))return false;
   try{const s=snapshot(key,start,end,false);open(s,'entity',s.literal+' : ');return true;}catch{return false;}
  },edited(key,caret,type){
   if(current?.source.brackets)return;
   if(type!=='insertText'){cancel();return;}
   const n=editor.node(key);if(!n||editor.mounts.get(key)?.composing){cancel();return;}
   // Ordinary typing cannot begin an invocation. Read one new cell, not the suffix.
   if(!current){const last=editor.node(n.inlineContent[caret-1]);if(!['@','[','(','/'].includes(String(last?.payload.text??'')))return;}
   if(!current){const last=editor.node(n.inlineContent[caret-1]);const char=String(last?.payload.text??'');if(['[','('].includes(char)){firstOpen={key,char,cell:n.inlineContent[caret-1]};return;}firstOpen=undefined;}
   const token=invocation(caret,i=>{const c=editor.node(n.inlineContent[i]);return c?.viewType==='text-cell'?String(c.payload.text??''):undefined;});
   if(!token){cancel();return;}
   if(token.kind==='command'&&(editor.crossText.range()||(editor.selections.sets[key]?.items.length??0)>1)){cancel();return;}
   if(!['@','/'].includes(text(key,token.start,token.start+1)))return;
   // Code/literal annotations are excluded; only this affected Block's metadata is read.
   if((n.payload.standoffProperties as any[]??[]).some(p=>!p.isDeleted&&/(?:^|[/:-])(?:code|literal)(?:$|[/:-])/.test(p.type??'')&&p.start<caret&&p.end>=token.start)){cancel();return;}
   const source=snapshot(key,token.start,token.end,true);
   if(current?.source.nodeKey===key&&current.source.start===token.start&&current.state.kind===token.kind&&!current.state.expanded)current.update(source,token.input);
   else open(source,token.kind,token.input);
  },key(event){
   const s=current;if(!s){if(draft?.cells.pending&&['Escape','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))cancel();return false;}
   if(event.defaultPrevented)return true;
   const target=event.target as Element,inside=!!target.closest?.('.autocomplete-workstation');
   if(inside&&target.closest('[data-scry-geometry]')&&(['Enter'].includes(event.key)||event.key.startsWith('Arrow')))return false;
   if(event.isComposing){if(!inside&&!draft)cancel();return false;}
   if(draft&&(event.metaKey||event.ctrlKey)&&['z','y','s'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();if(event.key.toLowerCase()==='s')editor.completionInput?.beforeSave?.();return true;}
   // History buttons activate via Enter/Space, then dispatch through the guarded source input.
   if(draft&&target.closest?.('[data-document-history]'))return false;
   const resolved=editor.mounts.resolveEvent(event);
   if(!inside&&resolved?.nodeKey!==s.source.nodeKey){cancel();return false;}
   // Native field editing, Save, history, copying and Tab are never completion shortcuts.
   if((event.metaKey||event.ctrlKey)&&['s','z','y'].includes(event.key.toLowerCase())){if(!inside)cancel();return false;}
   // LER owns its Command/Edit contexts, including native query select-all.
   if(inside&&target.closest('.ler-instrument'))return false;
   // LER shortcuts also work from Scry's source editing context, before
   // ordinary editor shortcuts such as Ctrl+. annotation inspection.
   if(!inside&&entityControls&&editor.bindings.dispatch(event,['entity-search/mode','entity-search/create'],id=>{
    const action=id==='entity.toggleMode'?'toggleMode':id==='entity.createFromQuery'?'createFromQuery':undefined;
    return !!action&&(event.repeat||entityControls!.run(action));
   }))return true;
   if(event.key==='Tab'){if(!inside)cancel();return false;}
   if(inside&&target.closest('button,select')&&['Enter','ArrowUp','ArrowDown'].includes(event.key))return false;
   if(!inside&&s.source.brackets&&event.metaKey&&event.key.toLowerCase()==='a'){
    event.preventDefault();event.stopPropagation();resolved?.handle.restoreInlineSelection?.({anchor:s.source.start,head:s.source.end});return true;
   }
   if(!inside&&event.ctrlKey&&event.key.toLowerCase()==='a'&&!s.source.brackets)return false;
   if(inside&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return false;
   // Source boundary shortcuts must precede ordinary caret confinement (Alt arrows
   // are the OS-safe word-boundary alternative on macOS). Query fields stay native.
   if(editor.bindings.dispatch(event,['autocomplete'],run))return true;
   if(!inside&&s.source.brackets&&(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)&&(!event.ctrlKey||['Home','End'].includes(event.key))||['ArrowUp','ArrowDown'].includes(event.key)&&(event.shiftKey||event.metaKey||event.altKey||event.ctrlKey))){
    const r=resolved?.handle.captureInlineSelection?.(),lo=s.source.start,hi=s.source.end;if(!r)return false;
    const forward=['ArrowRight','ArrowDown','End'].includes(event.key),position=event.key==='Home'?lo:event.key==='End'?hi:moveBoundary(s.state.sourceText,r.head-lo,forward?1:-1,false)+lo;
    event.preventDefault();event.stopPropagation();resolved?.handle.restoreInlineSelection?.({anchor:event.shiftKey?r.anchor:position,head:position});return true;
   }
   return false;
  }};
  const explicit=(key:string)=>{const h=editor.mounts.get(key),r=h?.captureInlineSelection?.();if(!r||r.anchor===r.head)throw Error('Select a phrase, or type @ to open Autocomplete');const s=snapshot(key,Math.min(r.anchor,r.head),Math.max(r.anchor,r.head),false);open(s,'entity',s.literal);};
  if(editor.features.semanticRetrieval)api.register.command({id:'autocomplete.search',label:'Scry: search passages',canExecute:({targetKey})=>editor.node(targetKey)?.viewType==='standoff-editor-block',execute:({targetKey})=>{const r=editor.mounts.get(targetKey)?.captureInlineSelection?.()??{anchor:0,head:0};const source=snapshot(targetKey,Math.min(r.anchor,r.head),Math.max(r.anchor,r.head),false);open(source,'block',source.literal);}});
  api.register.command({id:'autocomplete.open',label:'Autocomplete selected text',canExecute:({targetKey})=>!!codeSurface(editor,targetKey)||editor.node(targetKey)?.viewType==='standoff-editor-block',execute:({targetKey})=>{const native=codeSurface(editor,targetKey);if(native)native.run('autocomplete.open');else explicit(targetKey);}});
  api.register.binding({id:'autocomplete.open',name:'Autocomplete selected text',description:'Keep the selected phrase and edit an independent query',category:'Autocomplete',tags:[],scope:'editor/standoff',defaults:[chord(keyboard(';','Ctrl'),keyboard('a'))],handler:ctx=>ctx.run('autocomplete.open')});
  api.register.action({id:'autocomplete.open',slot:'document-actions',command:'autocomplete.open',label:'Autocomplete',title:'Autocomplete selected text',binding:'autocomplete.open'});
  const release=editor.repository.subscribeChanges(()=>{if(finishing)return;const s=current,source=s?.source;if(s)queueMicrotask(()=>{if(current===s&&s.source===source&&!valid(source!)){if(draft)s.fail('The source changed in another view. Copy the draft phrase if needed, then cancel; newer canonical text will not be overwritten.');else cancel();}});});
  scope.own(()=>{
   entityControls=undefined;
   try{cancel();}finally{
    // Forced feature/workspace teardown cannot leave the shared history locked,
    // even if a stale-source recovery dialog declined to close the draft.
    const d=draft;draft=undefined;editor.mounts.get(d?.source.nodeKey??'')?.presentProvisional?.(undefined);d?.release();
    clearSession();release();editor.completionInput=undefined;
   }
  });
 }};
}
