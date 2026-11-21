import {conversationPreferences} from '../features/dialectic/preferences';
import type {ContentRecord,RepositoryOperation,RepositoryState} from './types';
const ordered=(v:any):any=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** A preference edit cannot change Document identity, topology or authored content. */
export function preferencesMetadataOwner(state:RepositoryState,ops:RepositoryOperation[]):string|undefined {
 if(ops.length!==1||ops[0].kind!=='put-content')return;
 const next=ops[0].record,old=state.contents[next.key];if(!old||old.viewType!=='document-block')return;
 const a=(old.payload.metadata as any)?.dialectic,b=(next.payload.metadata as any)?.dialectic;
 if(a?.kind!=='conversation'||b?.kind!=='conversation'||same(a.preferences,b.preferences))return;
 for(const value of [a.preferences,b.preferences])if(value!==undefined&&!same(ordered(value),ordered(conversationPreferences(value))))return;
 const strip=(c:ContentRecord)=>{const m=c.payload.metadata as any;return {...c,revision:0,payload:{...c.payload,metadata:{...m,dialectic:{...m.dialectic,preferences:undefined}}}};};
 return same(strip(old),strip(next))?next.key:undefined;
}
