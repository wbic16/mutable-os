import {createMemo,createSignal} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {BlockNode} from '../../block-tree/types';
import type {RetainedDocumentSession} from '../../application/document-sessions';
import {revealPositionMarker} from '../../runtime/reveal-match';
import {newGroup,sequenceId,validSequence,type Sequence,type CompositionRef} from './sequences';
import type {ReplyTarget} from './model';
import type {PassiveMemberState} from '../../rendering/passive-composition';
interface Host {
 active?():boolean;
 root():BlockNode|undefined;resourceId():string;session():RetainedDocumentSession|undefined;
 resolve(t:ReplyTarget):BlockNode|undefined;inspect(t:ReplyTarget):void;
 requireCommittedTarget(t:ReplyTarget):void;guard():void;
}
interface Session {draft?:Sequence;presenting?:string;groups:Record<string,string>;revealed:Record<string,boolean>}
export function createSequenceController(editor:ReactiveEditor,host:Host){
 let alive=true;
 const stores=new Map<string,ReturnType<typeof createSignal<Session>>>(),members=new Map<string,Map<string,PassiveMemberState>>();
 const store=()=>{const id=host.resourceId();let s=stores.get(id);if(!s){s=createSignal<Session>({groups:{},revealed:{}});stores.set(id,s);}return s;};
 const state=()=>store()[0](),update=(fn:(s:Session)=>Session)=>store()[1](fn);
 const registry=()=>((host.root()?.payload.metadata as any)?.dialectic?.sequences??{}) as Record<string,unknown>;
 const saved=createMemo(()=>Object.values(registry()).filter(validSequence));
 const unsupported=createMemo(()=>Object.values(registry()).filter(s=>!validSequence(s)).length);
 const draft=()=>state().draft,presenting=()=>state().presenting;
 const sequence=()=>saved().find(s=>s.id===presenting());
 const group=()=>{const s=sequence();return s?.groups.find(g=>g.id===state().groups[s.id])??s?.groups[0];};
 const leave=(restore=true)=>{const session=host.session();update(s=>({...s,presenting:undefined}));if(restore&&session)queueMicrotask(()=>{if(alive&&host.active?.()!==false&&host.session()===session&&!presenting())editor.documentSessions?.presentations.restorePosition(session,true);});};
 const create=()=>{host.guard();leave(false);update(s=>({...s,draft:{version:1,id:sequenceId(),title:'New Sequence',groups:[newGroup()]}}));};
 const edit=(id:string)=>{host.guard();leave(false);const found=saved().find(s=>s.id===id);if(found)update(s=>({...s,draft:structuredClone(unwrap(found))}));};
 const duplicate=(id:string)=>{edit(id);const original=draft();if(!original)return;const next=structuredClone(unwrap(original));next.id=sequenceId();next.title=(next.title+' (copy)').slice(0,200);
  for(const group of next.groups){group.id=sequenceId();const remap=new Map<string,string>();for(const member of group.members){const old=member.id;member.id=sequenceId();remap.set(old,member.id);}if(group.presentation?.focusMemberId)group.presentation.focusMemberId=remap.get(group.presentation.focusMemberId);}
  update(s=>({...s,draft:next}));
 };
 const change=(fn:(draft:Sequence)=>void)=>{const d=draft();if(!d)return;const next=structuredClone(unwrap(d));fn(next);update(s=>({...s,draft:next}));};
 const commit=(entries:Record<string,unknown>,label:string)=>{
  host.guard();const root=host.root()!,metadata:any=unwrap(root.payload.metadata);
  editor.commands.structuralTransaction(label,()=>editor.commands.setPayloadField(root.key,'metadata',{...metadata,dialectic:{...metadata.dialectic,sequences:entries}},label));
 };
 const save=()=>{const d=draft();if(!validSequence(d))throw Error('Sequence is invalid or exceeds the limits (32 groups, 4 members per group, 200-character names).');if(!registry()[d.id]&&Object.keys(registry()).length>=64)throw Error('This Document already has 64 Sequences.');commit({...unwrap(registry()),[d.id]:structuredClone(unwrap(d))},'Save Sequence');update(s=>({...s,draft:undefined}));};
 const remove=(id:string)=>{const next={...unwrap(registry())};if(!validSequence(next[id]))throw Error('Unknown Sequence version retained.');delete next[id];commit(next,'Delete Sequence');if(presenting()===id)leave();};
 const add=(groupId:string,target:ReplyTarget)=>{
  if(target.kind!=='block'&&target.kind!=='contribution')throw Error('Choose a contribution or Block for Sequence membership.');host.requireCommittedTarget(target);
  change(d=>{const g=d.groups.find(g=>g.id===groupId);if(!g)return;if(g.members.length>=4)throw Error('Use up to four simultaneous perspectives per group.');g.members.push({id:sequenceId(),source:structuredClone(unwrap(target)) as CompositionRef});});
 };
 const present=(id:string)=>{
  host.guard();if(draft())throw Error('Apply or cancel Sequence changes first.');if(!saved().some(s=>s.id===id))throw Error('Sequence is unavailable.');
  const session=host.session()!;editor.documentSessions?.presentations.remember(session);
  editor.crossText.clear();editor.selections.clearExcept();editor.blockSelection.clear();
  const focused=editor.focus.state.focusedKey;if(focused)editor.focus.clearRemoved(focused);
  update(s=>({...s,presenting:id,draft:undefined}));
 };
 const chooseGroup=(id:string)=>{const s=sequence();if(s?.groups.some(g=>g.id===id))update(v=>({...v,groups:{...v.groups,[s.id]:id}}));};
 const visible=(id:string)=>group()?.presentation?.reveal!=='in-order'||!!state().revealed[id]||group()?.members[0]?.id===id;
 const reveal=(all=false)=>{const g=group();if(!g)return;const targets=all?g.members:g.members.filter(m=>!visible(m.id)).slice(0,1);update(s=>({...s,revealed:{...s.revealed,...Object.fromEntries(targets.map(m=>[m.id,true]))}}));};
 const reset=()=>{const ids=new Set(group()?.members.map(m=>m.id));update(s=>({...s,revealed:Object.fromEntries(Object.entries(s.revealed).filter(([id])=>!ids.has(id)))}));};
 const openSource=(t:CompositionRef)=>{leave(false);const session=host.session();queueMicrotask(()=>{if(!alive||host.active?.()===false||host.session()!==session)return;host.inspect(t);const node=host.resolve(t);if(node)void revealPositionMarker(editor,{id:'sequence-source',anchor:{kind:'block',nodeKey:node.key}});});};
 const memberState=(id:string)=>{const resource=host.resourceId();let map=members.get(resource);if(!map){map=new Map();members.set(resource,map);}let value=map.get(id);if(!value){value={children:{}};map.set(id,value);}return value;};
 return {saved,unsupported,draft,presenting,sequence,group,create,edit,duplicate,change,save,remove,add,present,leave,chooseGroup,visible,reveal,reset,openSource,memberState,
  show:(id:string)=>update(s=>({...s,revealed:{...s.revealed,[id]:true}})),
  replace:(g:string,id:string,t:ReplyTarget)=>{if(t.kind!=='block'&&t.kind!=='contribution')throw Error('Choose a Block or contribution.');host.requireCommittedTarget(t);change(d=>{const m=d.groups.find(x=>x.id===g)?.members.find(x=>x.id===id);if(m)m.source=structuredClone(unwrap(t));});},
  cancel:()=>update(s=>({...s,draft:undefined})),
  moveGroup:(id:string,delta:number)=>change(d=>{const i=d.groups.findIndex(g=>g.id===id),j=i+delta;if(i>=0&&j>=0&&j<d.groups.length)[d.groups[i],d.groups[j]]=[d.groups[j],d.groups[i]];}),
  moveMember:(g:string,id:string,delta:number)=>change(d=>{const a=d.groups.find(x=>x.id===g)?.members;if(!a)return;const i=a.findIndex(m=>m.id===id),j=i+delta;if(i>=0&&j>=0&&j<a.length)[a[i],a[j]]=[a[j],a[i]];}),
  dispose:()=>{alive=false;stores.clear();members.clear();},
 };
}
