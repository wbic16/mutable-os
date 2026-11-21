import {logicalInline,inlineText} from '../../block-tree/inline-sequence';
import {attachments} from './attachments-contract';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {ContentRecord} from '../../block-tree/types';
import {historyBaseJson,continuityLimits,type HistoryItem,type HistoryStamp,type ContinuityManifest,type ContinuityReceipt} from './dcp/continuity-contract';
const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
type Entry={stamp:HistoryStamp;item:HistoryItem;characters:number;bytes:number;members:Set<string>};
/** Cached native projection, not a text store. No activity on ordinary typing
 * beyond invalidating an affected cached contribution, if there is one. */
export class ConversationHistory {
 private cache=new Map<string,Entry>();private membership=new Map<string,Set<string>>();private stop:()=>void;
 readonly diagnostics={projected:0,characters:0};
 constructor(private editor:ReactiveEditor){this.stop=editor.repository.subscribeChanges(change=>{
  const touched=new Set(change.previousContents.keys());if(change.inlineOwner)touched.add(change.inlineOwner);
  for(const key of touched){
   if(!this.membership.has(key))continue;
   const old=change.previousContents.get(key),next=editor.repository.readState().contents[key];
   if(old&&next&&old.inlineRevision===next.inlineRevision&&old.payload.text===next.payload.text&&old.viewType===next.viewType&&old.payload.id===next.payload.id&&JSON.stringify(old.children)===JSON.stringify(next.children)&&JSON.stringify(old.ownedRelations)===JSON.stringify(next.ownedRelations)&&JSON.stringify(old.payload.metadata)===JSON.stringify(next.payload.metadata))continue;
   for(const id of [...(this.membership.get(key)??[])])this.remove(id);
  }
 });}
 private remove(id:string){const entry=this.cache.get(id);if(entry)for(const key of entry.members){const ids=this.membership.get(key)!;ids.delete(id);if(!ids.size)this.membership.delete(key);}this.cache.delete(id);}
 async build(documentId:string,participantId:string,keys:string[]):Promise<{manifest:ContinuityManifest;items:HistoryItem[]}>{
  const context=this.editor.readAssetContext();if(!context.cavernId||!context.session)throw Error('Open a Cavern to retain provider conversation memory.');
  if(keys.length>continuityLimits.contributions)throw Error('Conversation replay limit reached (128 contributions). No history was truncated.');
  const state=this.editor.repository.readState(),entries:Entry[]=[],receipts:ContinuityReceipt[]=[];let characters=0,bytes=0;
  for(const key of keys){const root=state.contents[key];if(!root)throw Error('Native conversation changed');const d=(root.payload.metadata as any)?.dialectic,id=String(root.payload.id),cacheId=documentId+'|'+key;
   if(d?.dcp?.provider?.continuity)receipts.push(d.dcp.provider.continuity);
   let entry=this.cache.get(cacheId);
   if(!entry){
    const members=new Set<string>();let count=0,chars=0;
    const project=(r:ContentRecord):any=>{
     if(members.has(r.key))return {blockId:r.payload.id,reference:true};if(++count>2048)throw Error('Contribution exceeds the native projection budget');members.add(r.key);
     let text=inlineText(logicalInline(state,r));
     if(!r.compactInline&&!r.inlineContent.length&&typeof r.payload.text==='string')text=r.payload.text;chars+=text.length;if(chars>continuityLimits.characters)throw Error('Contribution exceeds the text replay budget');
     const m=r.payload.metadata as any,annotations=(r.payload.standoffProperties as any[]??[]).filter(p=>!p.isDeleted).map(p=>({type:p.type,start:p.start,end:p.end,value:p.value,annotationId:p.annotationId}));
     const child=(pk:string)=>{const p=state.placements[pk];return p&&state.contents[p.contentKey]?project(state.contents[p.contentKey]):{unavailable:true};};
     return {blockId:r.payload.id,type:r.viewType,...(text?{text}:{}),...(m?.name?{name:m.name}:{}),...(annotations.length?{annotations}:{}),children:r.children.map(child),faces:Object.fromEntries(Object.entries(r.ownedRelations).map(([name,pk])=>[name,child(pk)]))};
    };
    const content=JSON.stringify({kind:'native-contribution',documentId,id,participant:d.participant??{kind:d.author},createdUtc:d.createdUtc,ordinal:d.ordinal,replies:d.replies??[],...(d.attachments?.length?{attachments:attachments(d.attachments),attachmentAvailability:'Descriptors only in history. Original contents are supplied separately when this contribution is selected as context.'}:{}),composition:project(root)});
    const revision=root.revision;
    // Annotation strata may accumulate without changing what was said. Fresh DCP
    // retrieval carries their current state; they do not invalidate base history.
    const base=historyBaseJson(JSON.parse(content));
    entry={stamp:{id,digest:await digest(base)},item:{role:d.participant?.id===participantId?'assistant':'user',content},characters:chars,bytes:new TextEncoder().encode(content).length,members};
    // Native state may have changed while hashing. Do not cache a stale projection.
    if(this.editor.repository.readState().contents[key]?.revision!==revision)throw Error('Native history changed while preparing memory');
    this.cache.set(cacheId,entry);for(const member of members){let ids=this.membership.get(member);if(!ids)this.membership.set(member,ids=new Set());ids.add(cacheId);}this.diagnostics.projected++;this.diagnostics.characters+=chars;
   }
   entries.push(entry);characters+=entry.characters;bytes+=entry.bytes;
  }
  if(characters>continuityLimits.characters||bytes>continuityLimits.bytes)throw Error('Conversation replay limit reached. No history was truncated.');
  return {manifest:{cavernId:context.cavernId,session:context.session,documentId,participantId,history:entries.map(e=>e.stamp),receipts},items:entries.map(e=>({...e.item,role:JSON.parse(e.item.content).participant?.id===participantId?'assistant':'user'}))};
 }
 dispose(){this.stop();this.cache.clear();this.membership.clear();}
}
