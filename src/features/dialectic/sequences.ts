import type {ReplyTarget} from './model';
export type CompositionRef=Extract<ReplyTarget,{kind:'contribution'|'block'}>;
export interface SequenceMember {id:string;source:CompositionRef;label?:string}
export interface SequenceGroup {id:string;title:string;members:SequenceMember[];presentation?:{arrangement?:'parallel'|'stacked';reveal?:'together'|'in-order';focusMemberId?:string}}
export interface Sequence {version:1;id:string;title:string;groups:SequenceGroup[]}
export const sequenceId=()=>crypto.randomUUID();
export const newGroup=():SequenceGroup=>({id:sequenceId(),title:'Perspectives',members:[]});
/** Validate definitions, never resolve/scan source content while typing. */
export function validSequence(value:unknown):value is Sequence {
 const s=value as Sequence;if(!s||s.version!==1||typeof s.id!=='string'||!s.id||typeof s.title!=='string'||s.title.length>200||!Array.isArray(s.groups)||s.groups.length>32)return false;
 const ids=new Set<string>([s.id]);
 return s.groups.every(g=>{
  if(!g||typeof g.id!=='string'||!g.id||ids.has(g.id)||typeof g.title!=='string'||g.title.length>200||!Array.isArray(g.members)||g.members.length>4)return false;ids.add(g.id);
  const p=g.presentation;if(p&&(p.arrangement!==undefined&&!['parallel','stacked'].includes(p.arrangement)||p.reveal!==undefined&&!['together','in-order'].includes(p.reveal)))return false;
  if(!g.members.every(m=>{if(!m||typeof m.id!=='string'||!m.id||ids.has(m.id)||m.label!==undefined&&(typeof m.label!=='string'||m.label.length>200))return false;ids.add(m.id);const t=m.source;return t&&['block','contribution'].includes(t.kind)&&typeof t.blockId==='string'&&!!t.blockId&&typeof t.resourceId==='string'&&!!t.resourceId;}))return false;
  return !p?.focusMemberId||g.members.some(m=>m.id===p.focusMemberId);
 });
}
