import {validSequence} from '../features/dialectic/sequences';
import type {ContentRecord,RepositoryOperation,RepositoryState} from './types';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Single Document field only, proved independently for forward and inverse. */
export function sequenceMetadataOwner(state:RepositoryState,ops:RepositoryOperation[]):string|undefined {
 if(ops.length!==1||ops[0].kind!=='put-content')return;
 const next=ops[0].record,old=state.contents[next.key];if(!old||old.viewType!=='document-block')return;
 const a:any=old.payload.metadata,b:any=next.payload.metadata;
 if(a?.dialectic?.kind!=='conversation'||b?.dialectic?.kind!=='conversation')return;
 const before=a.dialectic.sequences??{},after=b.dialectic.sequences??{};
 if(!before||!after||Array.isArray(before)||Array.isArray(after)||typeof before!=='object'||typeof after!=='object'||Object.keys(after).length>64)return;
 let changed=false;
 for(const id of new Set([...Object.keys(before),...Object.keys(after)]))if(!same(before[id],after[id])){
  changed=true;if(before[id]&&(!validSequence(before[id])||before[id].id!==id)||after[id]&&(!validSequence(after[id])||after[id].id!==id))return;
  if(after[id]?.groups.some((g:any)=>g.members.some((m:any)=>m.source.resourceId!==String(b.documentId??next.payload.id))))return;
 }
 if(!changed)return;
 const strip=(c:ContentRecord)=>{const m:any=c.payload.metadata;return {...c,revision:0,payload:{...c.payload,metadata:{...m,dialectic:{...m.dialectic,sequences:undefined}}}};};
 return same(strip(old),strip(next))?next.key:undefined;
}
