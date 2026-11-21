import type {CanonicalEntity} from './entities';
/** Scope is part of identity. A Document reference is never a Vault GUID lookup. */
export type ScopedEntityReference = {scope:'document';resourceId:string;entityId:string}|{scope:'vault';vaultId:string;entityId:string};
export interface ScopedEntityRecord {reference:ScopedEntityReference;entity:CanonicalEntity}
export const LOCAL_ENTITY='mutable/entity',LOCAL_ENTITY_RELATION='mutable/entity-relation',ENTITY_REFERENCE='mutable/entity-reference';
export const entityReference=(v:any):v is ScopedEntityReference=>!!v&&typeof v.entityId==='string'&&!!v.entityId&&((v.scope==='document'&&typeof v.resourceId==='string'&&!!v.resourceId)||(v.scope==='vault'&&typeof v.vaultId==='string'&&!!v.vaultId));
export const entityName=(v:any,max=1000)=>typeof v==='string'&&!!v.trim()&&v.length<=max;
export function localEntity(v:any):boolean {const e=v?.metadata?.scopedEntity;return v?.type===LOCAL_ENTITY&&typeof v.id==='string'&&e?.version===1&&typeof e.resourceId==='string'&&e.entity?.id===v.id&&entityName(e.entity.name)&&Number.isSafeInteger(e.entity.revision)&&e.entity.revision>=0&&Array.isArray(e.entity.aliases)&&e.entity.aliases.length<=32&&e.entity.aliases.every((a:any)=>typeof a.id==='string'&&entityName(a.name)&&Number.isSafeInteger(a.revision))&&(e.entity.typename==null||entityName(e.entity.typename,128))&&(e.entity.description==null||typeof e.entity.description==='string'&&e.entity.description.length<=8192);}
export function localEntityRelation(v:any):boolean {const r=v?.metadata?.scopedEntityRelation;return v?.type===LOCAL_ENTITY_RELATION&&typeof v.id==='string'&&r?.version===1&&typeof r.resourceId==='string'&&entityName(r.relation,128)&&entityReference(r.from)&&entityReference(r.to);}
