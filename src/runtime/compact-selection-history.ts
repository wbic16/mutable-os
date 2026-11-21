import {unwrap} from "solid-js/store";
import {clone} from '../block-tree/clone';
import type {SelectionSet,ViewPosition} from '../block-tree/types';
import type {ReactiveEditor} from '../reactive-editor/editor';
interface Bookmark {key:string;set?:SelectionSet;native?:{anchor:number;head:number};cross?:{anchor:ViewPosition;head:ViewPosition}}
/** Selection is session state. Retain small directional bookmarks beside the
 * repository's existing commit IDs; never capture a document or editing Cells. */
export function compactSelectionHistory(editor:ReactiveEditor):()=>void {
 const entries=new Map<string,{before?:Bookmark;after?:Bookmark}>();let before:Bookmark|undefined,alive=true;
 const capture=():Bookmark|undefined=>{
  const cross=editor.crossText.range(),key=cross?.anchor.occurrenceKey??editor.focus.state.focusedKey;
  if(!key)return;const node=editor.node(key);if(!node||!editor.repository.readState().contents[node.contentKey]?.compactInline)return;
  const native=editor.mounts.get(key)?.captureInlineSelection?.(),set=editor.selections.sets[key];
  const bookmark:Bookmark={key,native,set:set?clone(unwrap(set)):undefined,cross:cross?clone({anchor:unwrap(cross.anchor),head:unwrap(cross.head)}):undefined};
  if(bookmark.set&&native){const primary=bookmark.set.items.find(i=>i.id===bookmark.set!.primaryId)!;primary.anchor.boundary.index=native.anchor;primary.head.boundary.index=native.head;}
  return bookmark;
 };
 const restore=(b:Bookmark|undefined)=>{
  if(!b)return;const node=editor.node(b.key),mount=editor.mounts.get(b.key);if(!node||!mount)return;
  if(b.cross){
   // A view may close or restructure between publication and the caret task.
   try{editor.crossText.set(b.cross.anchor,b.cross.head);}catch{editor.crossText.clear();}
   return;
  }
  const valid=(n:number)=>Number.isInteger(n)&&n>=0&&n<=node.inlineContent.length;
  if(b.native&&(!valid(b.native.anchor)||!valid(b.native.head)))return;
  editor.crossText.clear();mount.focus();
  if(b.set)editor.selections.setSelectionSet(b.key,clone(b.set));
  else if(b.native)editor.selections.setPrimary(b.key,node.contentKey,node.viewId,b.native.anchor,b.native.head);
  if(b.native)mount.restoreInlineSelection?.(b.native);
 };
 const unbefore=editor.repository.subscribeBeforeChanges((_label,cause)=>{
  before=capture();if(cause?.kind==='undo'){const entry=entries.get(cause.sourceCommitId);if(entry&&!entry.after)entry.after=before;}
 });
 const unafter=editor.repository.subscribeChanges(change=>{
  if(!change.commit)return;
  const cause=change.commit.cause,revision=editor.repository.state.revision;
  if(cause?.kind==='undo'||cause?.kind==='redo'){
   const entry=entries.get(cause.sourceCommitId),bookmark=cause.kind==='undo'?entry?.before:entry?.after;
   queueMicrotask(()=>queueMicrotask(()=>{if(alive&&editor.repository.state.revision===revision)restore(bookmark);}));return;
  }
  if(!before)return;const entry={before,after:undefined as Bookmark|undefined};entries.set(change.commit.id,entry);before=undefined;
  queueMicrotask(()=>queueMicrotask(()=>{if(alive&&editor.repository.state.revision===revision)entry.after=capture();}));
 });
 return ()=>{alive=false;unbefore();unafter();entries.clear();};
}
