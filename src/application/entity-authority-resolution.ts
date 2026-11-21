import {createSignal,onCleanup,untrack} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {entityService} from './entity-service';
import {ScopedEntities} from './scoped-entities';
import {authorityDetails,searchAuthority} from '../features/autocomplete/authorities';
import type {AuthorityRecord,CanonicalEntity,DocumentEntityDatabaseLink,EntityService} from '../feature-api/entities';
import type {ReactiveEditor} from '../reactive-editor/editor';
import {localEntity} from '../feature-api/scoped-entities';
const normalized=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** Conservative corroboration, not a proof from identifier syntax or name alone. */
export function verifyAuthorityCandidate(entity:any,record:AuthorityRecord){
 const names=[entity.name,...(entity.aliases??[]).map((a:any)=>a.name)].map(normalized),labels=[record.name,...record.aliases].map(normalized),name=names.some((n:string)=>labels.includes(n));
 const type=normalized(entity.typename??''),types=(record.classifications??[]).map(normalized),person=['person','human','individual'].includes(type),typeMatch=person?(record.typeIds??[]).includes('Q5'):!!type&&types.includes(type);
 const words=new Set(normalized(record.description).split(' ').filter(w=>w.length>3)),context=normalized(entity.description??'').split(' ').filter((w:string)=>w.length>3&&words.has(w));
 const dates=entity.attributes?.enrichment?.dates??[],dateMatch=dates.some((d:any)=>record.dates?.some(t=>d.type===t.type&&d.startYear!=null&&d.startYear===t.startYear));
 const dateConflict=dates.some((d:any)=>record.dates?.some(t=>d.type===t.type&&d.startYear!=null&&t.startYear!=null&&d.startYear!==t.startYear));
 const reasons=[dateConflict?'Significant dates conflict':undefined,!name?'Name and aliases do not agree':undefined,!typeMatch?'Type needs review':undefined,!dateMatch&&new Set(context).size<2?'Description, dates or context need review':undefined].filter(Boolean) as string[];
 return {accepted:!dateConflict&&name&&typeMatch&&(dateMatch||new Set(context).size>=2),reasons};
}
const identitySignature=(entity:any)=>JSON.stringify([entity.name,entity.typename,entity.description,entity.aliases,entity.attributes?.enrichment]);
export interface EntityAuthorityState {status:'pending'|'unresolved'|'ambiguous'|'verified'|'linked'|'unavailable';record?:AuthorityRecord;canonical?:CanonicalEntity;message?:string;databaseLink?:DocumentEntityDatabaseLink;databaseChecked?:boolean}
/** Background resolution is invoked at semantic membership changes, never from text revisions. */
export function createEntityAuthorityResolution(editor:ReactiveEditor,owner:()=>string|undefined,resourceId:()=>string,canApply:()=>boolean=()=>true){
 const [states,setStates]=createSignal<Record<string,EntityAuthorityState>>({}),seen=new Map<string,string>(),pending=new Map<string,AbortController>();let alive=true,tail=Promise.resolve();
 const put=(id:string,state:EntityAuthorityState)=>setStates(v=>({...v,[id]:state}));
 onCleanup(()=>{alive=false;pending.forEach(c=>c.abort());});
 const resolve=async(definition:any)=>{
  const key=owner(),id=definition.id,resource=resourceId();if(!key||!canApply()){seen.delete(id);return;}
  pending.get(id)?.abort();const abort=new AbortController();pending.set(id,abort);const scoped=new ScopedEntities(editor,key,resource),snapshot=JSON.stringify([definition.metadata.scopedEntity.entity,definition.metadata.scopedEntity.identityAssociation]);
  const current=()=>alive&&!abort.signal.aborted&&canApply()&&owner()===key&&resourceId()===resource&&JSON.stringify([scoped.registry()[id]?.metadata?.scopedEntity?.entity,scoped.registry()[id]?.metadata?.scopedEntity?.identityAssociation])===snapshot;
  let service:EntityService|undefined;
  let databaseChecked=false,databaseLink:DocumentEntityDatabaseLink|undefined;
  const publish=(state:EntityAuthorityState)=>put(id,{...state,databaseChecked,databaseLink});
  publish({status:'pending'});
  try{
   service=entityService(editor,key);
   const entity=definition.metadata.scopedEntity.entity,qid=entity.attributes?.enrichment?.externalIds?.find((v:any)=>v.namespace==='wikidata')?.value??entity.attributes?.authorityMetadata?.id;
   let vault='.';try{vault=await service.historyScope?.()??'.';}catch{abort.signal.throwIfAborted();}
   const manual=definition.metadata.scopedEntity.identityAssociation;
   if(manual?.method==='user-confirmed'){
    const vaultId=await service.scopeIdentity?.(abort.signal);
    if(vaultId!==manual.vaultId)throw Error('The reviewed identity belongs to another Cavern');
    const canonical=await service.get(manual.entityId,abort.signal);
    if(!current())return;
    if(!canonical||canonical.deletedUtc)throw Error('The reviewed authentic Entity is unavailable');
    publish({status:'linked',canonical,message:'Identity explicitly confirmed in Mutable.'});return;
   }
   if(service.documentAssociation){
    const found=await service.documentAssociation({resourceId:resource,entityId:id},abort.signal);
    if(!current())return;databaseChecked=true;databaseLink=found.link;
    if(databaseLink){
     if(databaseLink.sourceResourceId!==resource||databaseLink.sourceEntityId!==id)throw Error('Database association source differs');
     if(!found.entity||found.entity.deletedUtc||found.entity.id!==databaseLink.entityId)throw Error('The linked database Entity is unavailable');
     publish({status:'linked',canonical:found.entity,message:'Recovered the committed database association.'});return;
    }
   }
   if(!editor.features.authorityCache){publish({status:'unresolved',message:'No reviewed authentic identity.'});return;}
   const association=entity.attributes?.canonicalAssociation;
   // A previously corroborated local identity can reuse its live mapping offline.
   // A changed local identity, Vault, deleted target or retargeted mapping is reverified.
   if(association?.verification===identitySignature(entity)){
    try{
     const vaultId=await service.scopeIdentity?.(abort.signal);
     if(vaultId===association.vaultId){
      const canonical=await service.authorityLookup?.({provider:association.provider,id:association.externalId},abort.signal);
      if(!current())return;
      if(canonical&&!canonical.deletedUtc&&canonical.id===association.entityId){
       const state:EntityAuthorityState={status:'linked',canonical,message:'Reused verified association with the current canonical Entity.'};publish(state);
       // Display cached external enrichment when available; it is not required for mapping reuse.
       try{const record=await authorityDetails({provider:association.provider,id:association.externalId,name:entity.name,description:'',aliases:[],url:'https://www.wikidata.org/wiki/'+association.externalId,retrievedAt:''},abort.signal,vault);if(current())publish({...state,record});}catch{abort.signal.throwIfAborted();}
       return;
      }
     }
    }catch{abort.signal.throwIfAborted();}
   }
   let candidates:AuthorityRecord[];
   if(qid)candidates=[{provider:'wikidata',id:qid,name:entity.name,description:'',aliases:[],url:'https://www.wikidata.org/wiki/'+qid,retrievedAt:new Date().toISOString()}];
   else candidates=await searchAuthority('wikidata',entity.name,abort.signal,vault);
   if(!qid&&candidates.length>1){const names=[entity.name,...entity.aliases.map((a:any)=>a.name)].map(normalized),exact=candidates.filter(r=>names.includes(normalized(r.name)));if(exact.length===1)candidates=exact;}
   if(!current())return;if(candidates.length!==1){publish({status:candidates.length?'ambiguous':'unresolved',message:candidates.length?'Several possible identities. Review them in Cardex.':'No authority match found.'});return;}
   const record=await authorityDetails(candidates[0],abort.signal,vault);if(!current())return;
   const verification=verifyAuthorityCandidate(entity,record);
   if(!verification.accepted){publish({status:'ambiguous',record,message:verification.reasons.join('. ')});return;}
   // Resolve the live ExternalIdentity target on every reuse; no cached canonical object wins.
   let canonical:CanonicalEntity|undefined;try{canonical=await service.authorityLookup?.(record,abort.signal);}catch{abort.signal.throwIfAborted();}
   if(!current())return;
   if(!canonical||canonical.deletedUtc){
    if(entity.attributes?.authorityMetadata?.id!==record.id){const copy=structuredClone(unwrap(definition));copy.metadata.scopedEntity.entity.attributes={...entity.attributes,authorityMetadata:{provider:record.provider,id:record.id,key:record.cache?.key,verifiedAt:new Date().toISOString()}};copy.metadata.scopedEntity.entity.revision++;scoped.commit({[id]:copy},'Record verified authority reference');}
    publish({status:'verified',record,message:'Authority metadata agrees. No current canonical mapping is available.'});return;}

   const vaultId=await service.scopeIdentity?.(abort.signal);vault=await service.historyScope?.()??vault;if(!current()||!vaultId)return;
   const copy=structuredClone(unwrap(definition)),e=copy.metadata.scopedEntity.entity;e.attributes={...e.attributes,authorityMetadata:{key:record.cache?.key,provider:record.provider,id:record.id,verifiedAt:new Date().toISOString()},canonicalAssociation:{entityId:canonical.id,vaultId,vault,provider:record.provider,externalId:record.id,verification:identitySignature(entity),verifiedAt:new Date().toISOString()}};e.revision++;
   // Recording a verified association uses native Undo/dirty tracking; saving stays manual.
   if(entity.attributes?.canonicalAssociation?.entityId!==canonical.id||entity.attributes?.canonicalAssociation?.vaultId!==vaultId||entity.attributes?.canonicalAssociation?.verification!==identitySignature(entity))scoped.commit({[id]:copy},'Associate Document Entity');
   if(alive&&!abort.signal.aborted)publish({status:'linked',record,canonical});
  }catch(e){if(alive&&!abort.signal.aborted)publish({status:'unavailable',message:String(e)});}finally{if(pending.get(id)===abort)pending.delete(id);service?.dispose();scoped.dispose();}
 };
 const observe=(definitions:any[])=>untrack(()=>{
  const live=new Set(definitions.map(d=>d.id));for(const [id,abort]of pending)if(!live.has(id)){abort.abort();pending.delete(id);}for(const id of seen.keys())if(!live.has(id))seen.delete(id);
  for(const d of definitions){if(!localEntity(d))continue;const e=d.metadata.scopedEntity.entity;if(!e.name||!e.typename)continue;
   const signature=JSON.stringify([identitySignature(e),d.metadata.scopedEntity.identityAssociation]);if(seen.get(d.id)===signature)continue;seen.set(d.id,signature);const copy=structuredClone(unwrap(d));tail=tail.then(()=>{if(alive&&seen.get(d.id)===signature)return resolve(copy);}).catch(()=>{});
  }
 });
 return {states,observe,suspend:()=>{for(const [id,a]of pending){a.abort();seen.delete(id);}pending.clear();},resolve:(definition:any)=>resolve(structuredClone(unwrap(definition)))};
}
