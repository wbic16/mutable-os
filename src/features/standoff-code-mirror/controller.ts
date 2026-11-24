import { clone } from '../../block-tree/clone';
import { ChangeSet, Compartment, EditorState, type EditorSelection, type Extension, type Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, drawSelection, keymap, lineNumbers, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap } from '@codemirror/search';
import { languages } from '@codemirror/language-data';
import { defaultHighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
import type { ReactiveEditor } from '../../reactive-editor/editor';
import type { ContentRecord, JsonObject, RepositoryOperation } from '../../block-tree/types';
import { mountCodeMirrorInput } from '../../input/code-mirror-input';
import { glossOwner } from '../../block-tree/gloss-plan';
import { indexedResourceLookup } from '../../block-tree/resource-identity';
import { resolveLinkedProperty } from '../../block-tree/linked-annotations';
import { CODE_MIRROR_STANDOFF, Coordinates, mapChanges, normalizeLineEndings, propertiesOf } from './model';
import { annotationField, annotationTheme, annotationVisibility, project, replaceProjection } from './projection';

export interface CodeMetrics {
  transactionMs:number; targetSnapshotsMs:number; edits:number; conversionsMs:number; mappingMs:number; commitMs:number; projectionMs:number;
  projections:number; nativeUpdatesMs:number; canonicalStages:Record<string,number>;
}
export type CodeTarget = {content:ContentRecord;from:number;to:number;mount:unknown};
/** One occurrence. Canonical records and history are the only persistent authority. */
export class StandoffCodeMirror {
  readonly view:EditorView;
  readonly input:ReturnType<typeof mountCodeMirrorInput>;
  readonly metrics:CodeMetrics={transactionMs:0,targetSnapshotsMs:0,edits:0,conversionsMs:0,mappingMs:0,commitMs:0,projectionMs:0,projections:0,nativeUpdatesMs:0,canonicalStages:{}};
  private language=new Compartment(); private importPermission=new Compartment();
  private identities:ReturnType<ReactiveEditor['annotationIdentities']['acquire']>;
  private stop:()=>void; private disposed=false; private writing=false; private queued=false;
  private languageEpoch=0; private languageName?:string;
  private shown:ContentRecord; private composing=false; private timer?:ReturnType<typeof setTimeout>;
  private pending?:{base:ContentRecord;changes:ChangeSet;before:EditorSelection};
  private readonly contentKey:string;
  private lastCommit?:string;private restoreSelection?:EditorSelection;
  private selections=new Map<string,{before:EditorSelection;after:EditorSelection}>();
  private epoch=0;private stamps=new WeakMap<ContentRecord,number>();
  private capture(){const t=performance.now(),c=clone(this.record());this.stamps.set(c,this.epoch);this.metrics.targetSnapshotsMs+=performance.now()-t;return c;}
  private fresh(c:ContentRecord){return this.stamps.get(c)===this.epoch&&c.revision===this.record().revision;}
  constructor(readonly editor:ReactiveEditor, readonly nodeKey:string, root:HTMLElement, readonly notice:(message:string)=>void,
    options:{extensions?:Extension;actions?:string[];run?:(id:string,event:Event)=>boolean;canRun?:(id:string)=>boolean}={}) {
    const node=editor.node(nodeKey); if(node?.viewType!==CODE_MIRROR_STANDOFF)throw Error('Code block is unavailable.');
    this.contentKey=node.contentKey; this.shown=this.capture();
    this.identities=editor.annotationIdentities.acquire(this.contentKey);
    this.view=new EditorView({parent:root,state:EditorState.create({doc:new Coordinates(String(this.shown.payload.text??'')).text,extensions:[
      lineNumbers(),drawSelection(),rectangularSelection(),EditorState.allowMultipleSelections.of(true),
      syntaxHighlighting(defaultHighlightStyle,{fallback:true}),bracketMatching(),indentOnInput(),closeBrackets(),search(),autocompletion(),
      keymap.of([...closeBracketsKeymap,...completionKeymap,...searchKeymap,indentWithTab,...defaultKeymap]),
      this.language.of([]),this.importPermission.of(this.needsNormalization()?EditorState.readOnly.of(true):[]),
      EditorState.transactionFilter.of(tr=>tr.docChanged&&this.needsNormalization()?[]:tr),
      annotationField,annotationTheme,options.extensions??[],
      ViewPlugin.define(()=>({destroy:()=>this.release()})),
      EditorView.domEventObservers({compositionstart:()=>{clearTimeout(this.timer);this.composing=true;},compositionend:()=>{
        this.timer=setTimeout(()=>{this.composing=false;this.finishComposition();},0);
      }}),
    ]}),dispatchTransactions:transactions=>this.dispatch(transactions)});
    this.input=mountCodeMirrorInput({editor,nodeKey,root,view:this.view,canEdit:()=>!editor.isPassiveOccurrence(nodeKey),actions:options.actions,run:options.run,canRun:options.canRun,error:e=>notice(String(e))});
    this.view.dispatch({effects:replaceProjection.of(this.projection(this.shown))});
    this.setLanguage();
    this.stop=editor.repository.subscribeChanges(change=>{
      const owner=this.owner();
      if(change.previousContents.has(this.contentKey)||owner&&change.previousContents.has(owner)){this.epoch++;
        if(this.writing)this.lastCommit=change.commit?.id;
        else {const cause=change.commit?.cause;
          if(cause&&(cause.kind==='undo'||cause.kind==='redo')){const saved=this.selections.get(cause.sourceCommitId);if(saved)this.restoreSelection=cause.kind==='undo'?saved.before:saved.after;}
          this.scheduleSync();
        }}
    });
  }
  canEdit(){return !this.editor.isPassiveOccurrence(this.nodeKey)&&this.editor.canEditText(this.nodeKey);}
  record() {const c=this.editor.repository.readState().contents[this.contentKey];if(!c)throw Error('Code block was removed.');return c;}
  needsNormalization(){return /\r/.test(String(this.record().payload.text??''));}
  owner(){return glossOwner(this.editor.repository.readState(),this.contentKey,{locationOf:k=>this.editor.repository.locationOf(k),ownedKeys:k=>this.editor.repository.ownedPlacementKeys(k)});}
  resolve(p:JsonObject){return p.type==='mutable/gloss'?this.editor.gloss.resolveContent(p,this.contentKey):resolveLinkedProperty(this.editor.repository.readState(),p,this.contentKey,indexedResourceLookup(this.editor.repository));}
  private projection(record:ContentRecord,identities=this.identities.keys()) {
    const start=performance.now();this.metrics.projections++;
    const result=project(String(record.payload.text??''),propertiesOf(record.payload.standoffProperties),identities,p=>this.resolve(p));
    this.metrics.projectionMs+=performance.now()-start;
    if(result.invalid)this.notice(`${result.invalid} imported annotation range(s) cannot be displayed; their records are preserved.`);
    return result;
  }
  private update(transactions:readonly Transaction[]){const t=performance.now();this.view.update(transactions);this.metrics.nativeUpdatesMs+=performance.now()-t;}
  private dispatch(transactions:readonly Transaction[]) {
    if(this.disposed)return;
    const changed=transactions.some(t=>t.docChanged);
    if(!changed){this.update(transactions);return;}
    try {
      if(!this.canEdit())throw Error('This code block is read-only.');
      const base=this.pending?.base??this.shown;
      if(!this.fresh(base))throw Error('The source changed in another occurrence. Retry the edit.');
      let changes=this.pending?.changes??ChangeSet.empty(transactions[0].startState.doc.length);
      for(const tr of transactions)changes=changes.compose(tr.changes);
      const t=performance.now(),state=transactions.at(-1)!.state;this.metrics.transactionMs+=performance.now()-t;
      const timing={coordinatesMs:0,mappingMs:0},mapped=mapChanges(String(base.payload.text??''),propertiesOf(base.payload.standoffProperties),changes,timing);this.metrics.mappingMs+=timing.mappingMs;this.metrics.conversionsMs+=timing.coordinatesMs;
      const t2=performance.now();const text=state.doc.toString();this.metrics.conversionsMs+=performance.now()-t2;
      const next={...base,payload:{...base.payload,text,standoffProperties:mapped.properties},revision:base.revision+1,inlineRevision:base.inlineRevision+1};
      if(this.composing){this.pending={base,changes,before:this.pending?.before??transactions[0].startState.selection};}
      else {this.commit(base,next,mapped.origins,'Edit annotated code',[],state.selection);this.shown=this.capture();this.metrics.edits++;}
      const final=state.update({effects:replaceProjection.of(this.projection(next,this.composing?mapped.origins.map(i=>i===null?'':this.identities.keys()[i]):undefined))});
      this.update([...transactions,final]);
    } catch(error){this.notice(String(error));this.pending=undefined;this.scheduleSync();}
  }
  finishComposition(){
    const pending=this.pending;this.pending=undefined;if(!pending)return;
    try{
      const mapped=mapChanges(String(pending.base.payload.text??''),propertiesOf(pending.base.payload.standoffProperties),pending.changes);
      const next={...pending.base,payload:{...pending.base.payload,text:this.view.state.doc.toString(),standoffProperties:mapped.properties},revision:pending.base.revision+1,inlineRevision:pending.base.inlineRevision+1};
      this.commit(pending.base,next,mapped.origins,'Compose annotated code',[],this.view.state.selection,pending.before);this.shown=this.capture();this.metrics.edits++;
      this.view.dispatch({effects:replaceProjection.of(this.projection(this.shown))});
    }catch(e){this.notice(String(e));this.scheduleSync();}
  }
  commit(base:ContentRecord,next:ContentRecord,origins:(number|null)[],label:string,extra:RepositoryOperation[]=[],selection=this.view.state.selection,beforeSelection=this.view.state.selection){
    if(this.disposed||!this.fresh(base)||!this.canEdit())throw Error('The annotation target changed or is read-only. Select it again.');
    const t=performance.now(),before=beforeSelection;this.lastCommit=undefined;this.writing=true;
    const stages:Record<string,number>={};
    try{this.editor.repository.commit(label,[...extra,{kind:'put-content',record:next,annotationOrigins:origins}],true,{requireBounded:true},stages);if(this.lastCommit){this.selections.set(this.lastCommit,{before,after:selection});if(this.selections.size>1000)this.selections.delete(this.selections.keys().next().value!);}}
    finally{for(const [name,ms]of Object.entries(stages))this.metrics.canonicalStages[name]=(this.metrics.canonicalStages[name]??0)+ms;this.writing=false;this.metrics.commitMs+=performance.now()-t;}
  }
  private scheduleSync(){if(this.queued)return;this.queued=true;queueMicrotask(()=>{this.queued=false;if(!this.disposed)this.sync();});}
  sync(){
    if(this.pending){if(this.fresh(this.pending.base))return;this.pending=undefined;this.composing=false;this.notice('Composition cancelled because the canonical source changed.');}
    const next=this.capture(),text=new Coordinates(String(next.payload.text??'')).text;
    const changes=sourceDifference(this.view.state.doc.toString(),text),selection=this.restoreSelection;this.restoreSelection=undefined;
    // Canonical history/external updates bypass the native mutation bridge/filter.
    this.update([this.view.state.update({changes,selection,effects:[replaceProjection.of(this.projection(next)),this.importPermission.reconfigure(this.needsNormalization()?EditorState.readOnly.of(true):[])],filter:false})]);
    this.shown=next;this.setLanguage();this.input.syncPermissions();
  }
  private setLanguage(){
    const name=String((this.record().payload.metadata as any)?.language??'plain');if(name===this.languageName)return;
    this.languageName=name;const epoch=++this.languageEpoch;
    const description=languages.find(d=>d.name.toLowerCase()===name.toLowerCase()||d.alias.includes(name.toLowerCase()));
    this.view.dispatch({effects:this.language.reconfigure([])});
    if(description)void description.load().then(extension=>{if(!this.disposed&&epoch===this.languageEpoch)this.view.dispatch({effects:this.language.reconfigure(extension)});},e=>{if(!this.disposed&&epoch===this.languageEpoch)this.notice(String(e));});
  }
  changeLanguage(language:string){const c=this.capture();this.commit(c,{...c,revision:c.revision+1,payload:{...c.payload,metadata:{...c.payload.metadata as object,language}}},propertiesOf(c.payload.standoffProperties).map((_,i)=>i),'Change code language');this.sync();}
  normalize(){const c=this.capture(),next=normalizeLineEndings(String(c.payload.text??''),propertiesOf(c.payload.standoffProperties));this.commit(c,{...c,revision:c.revision+1,inlineRevision:c.inlineRevision+1,payload:{...c.payload,text:next.text,standoffProperties:next.properties}},next.properties.map((_,i)=>i),'Convert code line endings to LF');this.sync();}
  toggleAnnotations(){this.view.dispatch({effects:annotationVisibility.of(!this.view.state.field(annotationField).visible)});}
  target():CodeTarget {
    if(this.pending||this.composing||this.view.state.selection.ranges.length!==1)throw Error('Finish composition and select one range first.');
    const content=this.capture();if(!this.fresh(this.shown))throw Error('The code source changed. Select it again.');
    const {from,to}=this.view.state.selection.main;
    return {content,from,to,mount:this.input.handle};
  }
  validate(target:CodeTarget){if(target.mount!==this.editor.mounts.get(this.nodeKey)||!this.input.handle.root.isConnected||!this.fresh(target.content)||this.pending||!this.canEdit())throw Error('The annotation target changed or is read-only. Select it again.');}
  annotate(target:CodeTarget,type:string,value:unknown='',metadata:unknown={},extra:JsonObject={}){
    this.validate(target);const coordinates=new Coordinates(String(target.content.payload.text??''));
    const start=coordinates.canonical(target.from),end=coordinates.canonical(target.to);
    const p={...extra,id:crypto.randomUUID(),type,start,end:end===start?start:end-1,value,metadata,...(start===end?{isZeroWidth:true,affinity:'after'}:{})};
    const props=propertiesOf(target.content.payload.standoffProperties);
    this.commit(target.content,{...target.content,revision:target.content.revision+1,payload:{...target.content.payload,standoffProperties:[...props,p]}},[...props.map((_,i)=>i),null],'Create code annotation');this.sync();return p;
  }
  edit(target:CodeTarget,index:number,patch:JsonObject){this.validate(target);const props=propertiesOf(target.content.payload.standoffProperties).map((p,i)=>i===index?{...p,...patch}:p);this.commit(target.content,{...target.content,revision:target.content.revision+1,payload:{...target.content.payload,standoffProperties:props}},props.map((_,i)=>i),'Edit code annotation');this.sync();}
  private release(){if(this.disposed)return;clearTimeout(this.timer);this.pending=undefined;this.selections.clear();this.disposed=true;this.stop?.();this.identities.dispose();}
  dispose(){if(this.disposed)return;this.input.dispose();this.view.destroy();this.release();}
}

/** Keep unaffected native selections on external edits. Never split a surrogate. */
function sourceDifference(before:string,after:string){
 if(before===after)return;
 let from=0,end=before.length,nextEnd=after.length;
 while(from<end&&from<nextEnd&&before.charCodeAt(from)===after.charCodeAt(from))from++;
 if(from>0&&/[\uDC00-\uDFFF]/.test(before[from]??'')&&/[\uD800-\uDBFF]/.test(before[from-1]))from--;
 while(end>from&&nextEnd>from&&before.charCodeAt(end-1)===after.charCodeAt(nextEnd-1)){end--;nextEnd--;}
 if(end<before.length&&/[\uDC00-\uDFFF]/.test(before[end])&&/[\uD800-\uDBFF]/.test(before[end-1]??'')){end++;nextEnd++;}
 return {from,to:end,insert:after.slice(from,nextEnd)};
}
