import {applicationPresentationSurface} from '../../rendering/application-presentation-surface';
import {createSignal} from 'solid-js';
import {clone} from '../../block-tree/clone';
import {glossChangeFor,glossOwner} from '../../block-tree/gloss-plan';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {TextRangeSnapshot} from '../../runtime/text-ranges';
import type {RepositoryOperation,JsonObject} from '../../block-tree/types';
import {wordSelection} from '../../input/word-selection';
import {GLOSS,glossDefinition,parseGloss,starterTypes} from './model';
import './style.css';
interface Draft {key:string;owner:string;range?:TextRangeSnapshot;selection?:{anchor:number;head:number};anchorElement?:HTMLElement;id?:string;previous?:string;raw:string;viewId:string}
export class GlossController {
 readonly status=createSignal('');readonly notice=this.status[0];
 private clickEpoch=0;private draft?:Draft;private draftInput?:HTMLTextAreaElement;private closeUI?:()=>void;private releases:(()=>void)[]=[];
 private evidence={locationOf:(key:string)=>this.editor.repository.locationOf(key),ownedKeys:(key:string)=>this.editor.repository.ownedPlacementKeys(key)};
 constructor(private editor:ReactiveEditor){
  this.releases.push(editor.commandRegistry.register<{selection?:{anchor:number;head:number}}>({id:'gloss.create',label:'Create Gloss',canExecute:({targetKey})=>editor.features.glossMode&&editor.node(targetKey)?.viewType==='standoff-editor-block',execute:({targetKey,args})=>{this.open(targetKey,args?.selection);}},'gloss'));
  if(editor.features.glossMode)this.releases.push(editor.visualEffects.registerType({type:GLOSS,renderers:[{id:'gloss-marker',name:'css-class',params:{classes:['mutable-gloss-anchor']}}]}));
 }
 private owner(key:string){return glossOwner(this.editor.repository.readState(),key,this.evidence);}
 private documentFor(key:string){const seen=new Set<string>();let n=this.editor.node(key);while(n&&!seen.has(n.key)){seen.add(n.key);if(n.viewType==='document-block')return n.contentKey;n=this.editor.projections.get(n.viewId)?.parentOf(n.key);}return;}
 /** Bounded canonical definition lookup, also used by existing annotation consumers. */
 resolveContent(p:JsonObject,contentKey?:string):JsonObject {
  if(!this.editor.features.glossMode)return {...p,isDeleted:true};
  const owner=contentKey&&this.owner(contentKey);
  const d=owner&&(this.editor.repository.state.contents[owner]?.payload.linkedAnnotations as any)?.[String(p.annotationId)];
  return glossDefinition(d)?{...p,...d,id:p.id,annotationId:p.annotationId,start:p.start,end:p.end,isDeleted:!!p.isDeleted||!!d.isDeleted}:{...p,isDeleted:true};
 }
 resolve(p:JsonObject,key:string):JsonObject {
  const n=this.editor.node(key),owner=n&&this.owner(n.contentKey);
  if(!owner||this.documentFor(key)!==owner)return {...p,isDeleted:true};
  return this.resolveContent(p,n?.contentKey);
 }
 target(key:string,selection?:{anchor:number;head:number}) {
  const n=this.editor.node(key),h=this.editor.mounts.get(key);if(!n||!h||n.viewType!=='standoff-editor-block')throw Error('Select text in a Document first.');
  if(this.editor.crossText.range()||(this.editor.selections.sets[key]?.items.length??0)>1)throw Error('Gloss creation currently supports one range in one TextBlock.');
  const owner=this.owner(n.contentKey);if(!owner||this.documentFor(key)!==owner)throw Error('Glosses cannot annotate Blocks borrowed from another Document.');
  const saved=selection??h.captureInlineSelection?.();if(!saved)throw Error('Select text or place the caret inside a word.');
  let start=Math.min(saved.anchor,saved.head),end=Math.max(saved.anchor,saved.head);
  if(start===end){const text=n.inlineContent.map(k=>String(this.editor.node(k)?.payload.text??'')).join(''),word=wordSelection(text)(start);
   const chars=[...text];if(start<word.start||start>=word.end||!/[\p{L}\p{N}\p{Mark}]/u.test(chars[start]??'')||!/[\p{L}\p{N}]/u.test(chars.slice(word.start,word.end).join('')))throw Error('Place the caret inside a word, or select text.');
   start=word.start;end=word.end;
  }
  return {owner,selection:{...saved},range:this.editor.textRanges.snapshot(key,start,end),viewId:n.viewId};
 }
 open(key:string,selection?:{anchor:number;head:number},id?:string) {
  if(!this.editor.features.glossMode)return false;
  if(this.draft&&!id){this.status[1]('Commit or cancel the open Gloss first.');this.draftInput?.focus();return false;}
  try {const target=this.target(key,selection),def=id?(this.editor.repository.state.contents[target.owner].payload.linkedAnnotations as any)?.[id]:undefined;
   if(id&&(!glossDefinition(def)||def.isDeleted))throw Error('This Gloss is no longer available.');
   return this.activate({key,...target,id,previous:def?JSON.stringify(def):undefined,raw:def?.value??''});
  }catch(error){this.status[1](error instanceof Error?error.message:String(error));return false;}
 }
 click(key:string,event:MouseEvent){
  if(!this.editor.features.glossMode||event.defaultPrevented||event.detail>1)return;
  const epoch=++this.clickEpoch,mount=this.editor.mounts.get(key);if(!mount?.focusElement.contains(event.target as Node))return;
  const openAt=()=>{
   if(epoch!==this.clickEpoch||this.editor.mounts.get(key)!==mount||!mount.root.isConnected)return;
   const selection=mount.captureInlineSelection?.();if(!selection||selection.anchor!==selection.head)return;
   const at=mount.inlinePointAt?.(event.clientX,event.clientY)??selection.head;
   const p=(this.editor.node(key)?.payload.standoffProperties as any[]??[]).find(p=>p.type===GLOSS&&!this.resolve(p,key).isDeleted&&p.start<=at&&p.end>=at);
   if(p){event.stopPropagation();this.open(key,{anchor:p.start,head:p.end+1},p.annotationId);}
  };
  const selection=mount.captureInlineSelection?.();
  // Chrome collapses a previously selected range after dispatching click. Read
  // it after that default action; a real drag selection remains non-collapsed.
  if(selection&&selection.anchor!==selection.head)mount.root.ownerDocument.defaultView?.requestAnimationFrame(openAt);else openAt();
 }
 /** Existing unanchored definitions use the same draft UI and canonical commit. */
 openDefinition(rootKey:string,id:string,invoker?:HTMLElement,show=true){
  if(!this.editor.features.glossMode)return false;
  const root=this.editor.node(rootKey),def=root&&(this.editor.repository.readState().contents[root.contentKey]?.payload.linkedAnnotations as any)?.[id];
  if(root?.viewType!=='document-block'||!glossDefinition(def)||def.isDeleted)return false;
  return this.activate({key:rootKey,owner:root.contentKey,viewId:root.viewId,id,previous:JSON.stringify(def),raw:def.value,anchorElement:invoker},show);
 }
 deleteDefinition(rootKey:string,id:string,invoker?:HTMLElement){return this.openDefinition(rootKey,id,invoker,false)&&this.commit('',true);}
 /** Reuse a local entity definition; never rename it or copy its relationships. */
 private attachEntity(id:string,expected:string):boolean {
  const d=this.draft;if(!d?.range)return false;
  try {
   const e=this.editor;e.textRanges.validate([d.range],'cell');
   if(this.documentFor(d.key)!==d.owner||this.owner(d.range.contentKey)!==d.owner)throw Error('The anchor Document changed. Cancel and select it again.');
   const state=e.repository.readState(),registry=state.contents[d.owner].payload.linkedAnnotations as Record<string,any>,def=registry?.[id];
   if(!glossDefinition(def)||def.isDeleted||parseGloss(def.value).type.toLowerCase()!=='entity'||JSON.stringify(def)!==expected)throw Error('This entity changed. Select it again from the suggestions.');
   if(d.id&&JSON.stringify(registry[d.id])!==d.previous)throw Error('This Gloss changed in another view. Copy your draft before cancelling.');
   const c=state.contents[d.range.contentKey],props=clone(c.payload.standoffProperties as any[]??[]),origins=props.map((_,i):number|null=>i);
   if(d.id){
    const at=props.findIndex(p=>p.type===GLOSS&&p.annotationId===d.id&&p.start===d.range!.start&&p.end===d.range!.end-1);
    if(at<0)throw Error('The Gloss occurrence changed. Cancel and select it again.');
    props[at]={...props[at],annotationId:id};
   }else if(!props.some(p=>p.type===GLOSS&&!p.isDeleted&&p.annotationId===id&&p.start===d.range!.start&&p.end===d.range!.end-1)){
    props.push({id:crypto.randomUUID(),type:GLOSS,annotationId:id,start:d.range.start,end:d.range.end-1});origins.push(null);
   }else {this.cancel();return true;}
   if(d.id===id){this.cancel();return true;}
   const operations:RepositoryOperation[]=[{kind:'put-content',annotationOrigins:origins,record:{...clone(c),payload:{...clone(c.payload),standoffProperties:props}}}];
   if(!glossChangeFor(state,operations,this.evidence))throw Error('Gloss reference could not be safely admitted; no changes made.');
   e.repository.commit('Reference Gloss entity',operations);this.cancel();return true;
  }catch(error){this.status[1](error instanceof Error?error.message:String(error));return false;}
 }
 commit(raw:string,remove=false):boolean {
  const d=this.draft;if(!d)return false;
  try {
   const e=this.editor;if(d.range)e.textRanges.validate([d.range],'cell');if(this.documentFor(d.key)!==d.owner||d.range&&this.owner(d.range.contentKey)!==d.owner)throw Error('The anchor Document changed. Cancel and select it again.');
   const state=e.repository.readState(),root=state.contents[d.owner],registry=clone(root.payload.linkedAnnotations as Record<string,any>??{});
   if(d.id&&JSON.stringify(registry[d.id])!==d.previous)throw Error('This Gloss changed in another view. Copy your draft before cancelling.');
   const id=d.id??crypto.randomUUID();
   if(d.id){registry[id]={...registry[id],value:remove?registry[id].value:raw,...(remove?{isDeleted:true}:{})};
   } else registry[id]={id,type:GLOSS,value:raw,metadata:{gloss:{version:1,localId:crypto.randomUUID(),links:{}}}};
   const operations:RepositoryOperation[]=[{kind:'put-content',record:{...clone(root),payload:{...clone(root.payload),linkedAnnotations:registry}}}];
   if(!d.id&&d.range){const c=state.contents[d.range.contentKey],props=clone(c.payload.standoffProperties as any[]??[]);
    operations.push({kind:'put-content',annotationOrigins:[...props.map((_,i)=>i),null],record:{...clone(c),payload:{...clone(c.payload),standoffProperties:[...props,{id:crypto.randomUUID(),type:GLOSS,annotationId:id,start:d.range.start,end:d.range.end-1}]}}});
   }
   if(d.id&&!remove&&raw===registry[d.id].value&&d.previous===JSON.stringify(registry[d.id])){this.cancel();return true;}
   if(!glossChangeFor(state,operations,this.evidence))throw Error('Gloss edit could not be safely admitted; no changes made.');
   e.repository.commit(remove?'Delete Gloss':d.id?'Edit Gloss':'Create Gloss',operations);this.cancel();return true;
  }catch(error){this.status[1](error instanceof Error?error.message:String(error));return false;}
 }
 private activate(next:Draft,show=true){
  this.clickEpoch++;
  // Re-selecting the same Gloss keeps its current draft. A different Gloss
  // replaces it without authoring or restoring focus to the previous anchor.
  if(show&&next.id&&this.draft?.id===next.id&&this.draft.owner===next.owner){this.draftInput?.focus({preventScroll:true});return true;}
  this.close(false);this.draft=next;this.status[1]('');if(show)this.show();return true;
 }
 cancel(){this.close(true);}
 private close(restoreSelection:boolean){this.clickEpoch++;const d=this.draft;this.closeUI?.();this.closeUI=undefined;this.draftInput=undefined;this.draft=undefined;if(d&&restoreSelection){const h=this.editor.mounts.get(d.key);if(d.selection&&h?.root.isConnected){h.focus();h.restoreInlineSelection?.(d.selection);}else if(d.anchorElement?.isConnected)d.anchorElement.focus({preventScroll:true});}}
 releaseView(viewId:string){if(this.draft?.viewId===viewId)this.status[1]('The anchor view closed. Your draft is retained; copy it or cancel.');}
 private show(){
  const d=this.draft!,h=this.editor.mounts.get(d.key)!,doc=h.root.ownerDocument,win=doc.defaultView!;
  const box=doc.createElement('div');box.className='gloss-input';box.setAttribute('role','dialog');box.setAttribute('aria-label',d.id?'Edit Gloss':'Create Gloss');
  const input=doc.createElement('textarea');input.setAttribute('aria-label','Gloss');input.placeholder='type: your thought';input.value=d.raw;input.rows=2;this.draftInput=input;
  const suggestions=doc.createElement('div');suggestions.className='gloss-suggestions';suggestions.id='gloss-suggestions-'+crypto.randomUUID();suggestions.setAttribute('role','listbox');
  input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',suggestions.id);
  const status=doc.createElement('div');status.className='gloss-draft-status';status.setAttribute('role','status');
  const buttons=doc.createElement('div');buttons.className='gloss-buttons';
  const cancel=doc.createElement('button');cancel.textContent='Close / Cancel';cancel.onclick=()=>this.cancel();buttons.append(cancel);
  if(d.id){const del=doc.createElement('button');del.textContent='Delete Gloss';del.onclick=()=>{if(!this.commit(input.value,true))status.textContent=this.notice();};buttons.append(del);}
  if(d.id&&d.range){
   const activeRange=d.range;const props=(this.editor.node(d.key)?.payload.standoffProperties as any[]??[]).filter(p=>p.type===GLOSS&&!this.resolve(p,d.key).isDeleted&&p.start<activeRange.end&&p.end>=activeRange.start);
   const ids=[...new Set(props.map(p=>p.annotationId))];
   if(ids.length>1){const choose=doc.createElement('select');choose.setAttribute('aria-label','Gloss at this passage');for(const id of ids){const def=(this.editor.repository.readState().contents[d.owner].payload.linkedAnnotations as any)[id];const option=doc.createElement('option');option.value=id;option.textContent=def.value.slice(0,70)||'(empty Gloss)';choose.append(option);}choose.value=d.id;choose.onchange=()=>{const p=props.find(p=>p.annotationId===choose.value)!;this.open(d.key,{anchor:p.start,head:p.end+1},p.annotationId);};box.append(choose);}
  }
  box.append(input,suggestions,status,buttons);(this.editor.windowManager&&applicationPresentationSurface(this.editor.windowManager)||doc.body).append(box);
  // Session-only SVG geometry lives in the TextBlock's annotation layer.
  // Scrolling moves that layer natively; only the viewport popup is repositioned.
  const highlightOwner=d.range?'gloss-active-'+crypto.randomUUID():undefined;let highlightLive=!!highlightOwner;
  if(highlightOwner)this.editor.decorations.attachRanges(highlightOwner,[d.range!],{type:'editor/gloss-anchor-active',fill:'#d7aa43'});
  const releaseHighlight=()=>{if(highlightLive){highlightLive=false;this.editor.decorations.disposeSession(highlightOwner!);}};
  let frame=0,alive=true,scrolled=false;
  const position=()=>{frame=0;if(!alive)return;if(!h.root.isConnected){releaseHighlight();status.textContent='The anchor view closed. Your draft is retained; copy it or cancel.';return;}
   if(!d.range){const r=(d.anchorElement?.isConnected?d.anchorElement:h.root).getBoundingClientRect();box.style.left=`${Math.max(8,Math.min(r.left,win.innerWidth-340))}px`;box.style.top=`${Math.max(8,Math.min(r.bottom+7,win.innerHeight-190))}px`;return;}
   try{this.editor.textRanges.validate([d.range]);}catch{releaseHighlight();status.textContent='The anchor changed. Copy your draft before cancelling and selecting it again.';return;}
   const origin=h.root.getBoundingClientRect(),scale=origin.width/((h.root instanceof HTMLElement?h.root.offsetWidth:origin.width)||origin.width||1);const rects=this.editor.measurements.retainedRangeRects(d.key,d.range.start,d.range.end,this.editor.repository.readState().contents[d.range.contentKey].revision,origin,scale||1);const last=rects.at(-1);if(!last)return;
   if(!scrolled&&last.bottom>win.innerHeight-220){scrolled=true;const boundary=h.inlineBoundary?.(d.range.end);const cell=boundary?.node.childNodes[Math.max(0,(boundary?.offset??1)-1)];if(cell instanceof Element&&typeof cell.scrollIntoView==='function'){cell.scrollIntoView({block:'center'});schedule();return;}}
   box.style.left=`${Math.max(8,Math.min(rects.find(r=>Math.abs(r.top-last.top)<2)?.left??last.left,win.innerWidth-340))}px`;box.style.top=`${last.bottom+7}px`;
  };
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(position);};
  type Suggestion={label:string;search:string;id?:string;expected?:string};
  let types:Suggestion[]=[],entities:Suggestion[]=[],matches:Suggestion[]=[],active=0;
  // Build once on open, then only when definitions change. Draft keystrokes
  // filter these strings without reading canonical records or measuring Cells.
  const inventory=()=>{
   const found=new Map(starterTypes.map(t=>[t.toLowerCase(),t]));entities=[];
   for(const [id,p] of Object.entries(this.editor.repository.readState().contents[d.owner].payload.linkedAnnotations as Record<string,any>??{}))if(glossDefinition(p)&&!p.isDeleted){
    const parsed=parseGloss(p.value),type=parsed.type.toLowerCase();if(type)found.set(type,parsed.type);
    if(type==='entity'&&parsed.text.trim())entities.push({id,label:parsed.text.trim(),search:parsed.text.trim().toLowerCase(),expected:JSON.stringify(p)});
   }
   types=[...found].map(([search,label])=>({search,label}));
  };
  const highlight=()=>{[...suggestions.children].forEach((node,i)=>node.setAttribute('aria-selected',String(i===active)));const option=suggestions.children[active];if(option)input.setAttribute('aria-activedescendant',option.id);else input.removeAttribute('aria-activedescendant');};
  const accept=()=>{const choice=matches[active];if(!choice)return;
   if(choice.id){if(!this.attachEntity(choice.id,choice.expected!))status.textContent=this.notice();}
   else {input.value=choice.label+': ';suggest();input.focus({preventScroll:true});}
  };
  const suggest=()=>{
   d.raw=input.value;suggestions.replaceChildren();input.rows=Math.min(5,Math.max(2,input.value.split('\n').length));active=0;
   const colon=input.value.indexOf(':'),parsed=parseGloss(input.value),q=(colon<0?input.value:parsed.text).trim().toLowerCase();
   const source=colon<0?types:parsed.type.toLowerCase()==='entity'&&d.range?entities:[];
   matches=source.filter(s=>s.search.startsWith(q)).sort((a,b)=>Number(b.search===q)-Number(a.search===q)).slice(0,6);
   suggestions.hidden=!matches.length;suggestions.setAttribute('aria-label',colon<0?'Gloss types':'Gloss entities');
   for(const [i,choice] of matches.entries()){
    const option=doc.createElement('div');option.id=suggestions.id+'-'+i;option.setAttribute('role','option');option.textContent=choice.label;
    option.onpointerdown=e=>e.preventDefault();option.onpointermove=()=>{active=i;highlight();};option.onclick=()=>{active=i;accept();};suggestions.append(option);
   }
   highlight();
  };
  inventory();input.oninput=suggest;let composing=false;input.addEventListener('compositionstart',()=>composing=true);input.addEventListener('compositionend',()=>{composing=false;suggest();});
  box.onkeydown=e=>{if(e.isComposing||composing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.cancel();}else if(e.target===input){
   if((e.key==='ArrowDown'||e.key==='ArrowUp')&&matches.length&&!e.shiftKey){e.preventDefault();e.stopPropagation();active=(active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;highlight();}
   else if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.stopPropagation();if(matches[active])accept();else if(!this.commit(input.value))status.textContent=this.notice();}
  }};
  const save=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s')status.textContent='Gloss draft is not saved. Press Enter to commit, or cancel.';};
  win.addEventListener('keydown',save,true);win.addEventListener('scroll',schedule,true);win.addEventListener('resize',schedule);const fontChanged=()=>{this.editor.measurements.invalidateRanges(d.key);schedule();};doc.fonts?.addEventListener('loadingdone',fontChanged);
  const resize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(()=>{this.editor.measurements.invalidateRanges(d.key);schedule();});resize?.observe(h.root);
  const stopChanges=this.editor.repository.subscribeChanges(change=>{
   const previous=change.previousContents.get(d.owner);
   if(previous&&(change.structural?.gloss?change.structural.gloss.definitions.length>0:JSON.stringify(previous.payload.linkedAnnotations)!==JSON.stringify(this.editor.repository.readState().contents[d.owner].payload.linkedAnnotations))){inventory();suggest();}
   if(d.range&&change.previousContents.has(d.range.contentKey))schedule();
  });
  this.closeUI=()=>{stopChanges();alive=false;if(frame)win.cancelAnimationFrame(frame);resize?.disconnect();win.removeEventListener('keydown',save,true);win.removeEventListener('scroll',schedule,true);win.removeEventListener('resize',schedule);doc.fonts?.removeEventListener('loadingdone',fontChanged);box.remove();releaseHighlight();};
  suggest();position();input.focus({preventScroll:true});
 }
 dispose(){this.cancel();this.releases.splice(0).forEach(f=>f());}
}
