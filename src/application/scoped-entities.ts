import type {ReactiveEditor} from '../reactive-editor/editor';
import {entityService} from './entity-service';
import type {EntityService} from '../feature-api/entities';
import {LOCAL_ENTITY,LOCAL_ENTITY_RELATION,localEntity,localEntityRelation,entityName,entityReference,type ScopedEntityReference} from '../feature-api/scoped-entities';
/** Shared Document adapter. Preparation is pure; callers may include its records
 * in a larger canonical operation. Vault capability is strictly read-only. */
export class ScopedEntities {
 private vault?:EntityService;
 constructor(readonly editor:ReactiveEditor,readonly ownerKey:string,readonly resourceId:string){}
 get root(){const n=this.editor.node(this.ownerKey);if(!n||n.viewType!=='document-block'||String((n.payload.metadata as any)?.documentId??n.payload.id)!==this.resourceId)throw Error('Entity Document owner unavailable');return n;}
 registry():Record<string,any>{return this.editor.repository.readState().contents[this.root.contentKey].payload.linkedAnnotations as any??{};}
 prepare(input:{name:string;typename:string;description:string;aliases:string[]},provenance:unknown){
  if(!entityName(input.name)||!entityName(input.typename,128)||typeof input.description!=='string'||input.description.length>8192||!Array.isArray(input.aliases)||input.aliases.length>32||input.aliases.some(n=>!entityName(n)))throw Error('Invalid local Entity');
  const id=crypto.randomUUID(),entity={id,name:input.name,typename:input.typename,description:input.description,attributes:null,revision:0,aliases:input.aliases.map(name=>({id:crypto.randomUUID(),name,origin:'curated',revision:0}))};
  return {id,type:LOCAL_ENTITY,metadata:{scopedEntity:{version:1,resourceId:this.resourceId,entity,provenance}}};
 }
 prepareRelation(relation:string,from:ScopedEntityReference,to:ScopedEntityReference,provenance:unknown){
  if(!entityName(relation,128)||![from,to].every(entityReference)||[from,to].some(r=>r.scope==='document'&&r.resourceId!==this.resourceId)||![from,to].some(r=>r.scope==='document'))throw Error('Local Entity relation needs an owned endpoint');
  const id=crypto.randomUUID();return {id,type:LOCAL_ENTITY_RELATION,metadata:{scopedEntityRelation:{version:1,resourceId:this.resourceId,relation,from,to,provenance}}};
 }
 local(ref:ScopedEntityReference){if(ref.scope!=='document'||ref.resourceId!==this.resourceId)return;const d=this.registry()[ref.entityId];return localEntity(d)&&!d.isDeleted&&!d.metadata.scopedEntity.entity.deletedUtc?d.metadata.scopedEntity.entity:undefined;}
 async vaultReference(entityId:string,signal?:AbortSignal):Promise<ScopedEntityReference>{
  this.vault??=entityService(this.editor,this.ownerKey);if(!this.vault.scopeIdentity)throw Error('Durable Vault identity unavailable');
  return {scope:'vault',vaultId:await this.vault.scopeIdentity(signal),entityId};
 }
 async searchVault(query:string,signal:AbortSignal){
  this.vault??=entityService(this.editor,this.ownerKey);
  if(!this.vault.scopeIdentity)throw Error('Durable Vault identity unavailable');
  const vaultId=await this.vault.scopeIdentity(signal);
  const result=await this.vault.search({query,stream:'all',match:'partial',scope:'vault'},signal);
  result.current();if(await this.vault.scopeIdentity(signal)!==vaultId)throw Error('Vault identity changed during Entity discovery');
  return {vaultId,result};
 }
 async resolve(ref:ScopedEntityReference,signal?:AbortSignal){
  if(!entityReference(ref))throw Error('Invalid scoped Entity reference');
  if(ref.scope==='document')return this.local(ref);
  this.vault??=entityService(this.editor,this.ownerKey);
  if(!this.vault.scopeIdentity||await this.vault.scopeIdentity(signal)!==ref.vaultId)throw Error('Entity belongs to another Vault');
  const result=await this.vault.get(ref.entityId,signal);if(await this.vault.scopeIdentity(signal)!==ref.vaultId)throw Error('Vault identity changed during Entity lookup');return result&&!result.deletedUtc?result:undefined;
 }
 commit(records:Record<string,any>,label='Edit Document Entities'){
  if(!this.editor.features.scopedSemantics)throw Error('Scoped semantics disabled');
  for(const [id,d]of Object.entries(records))if(id!==d.id||!localEntity(d)&&!localEntityRelation(d))throw Error('Invalid scoped Entity definition');
  this.editor.commands.boundedStructuralTransaction(label,()=>this.editor.commands.setPayloadField(this.root.key,'linkedAnnotations',{...this.registry(),...records}));
 }
 dispose(){this.vault?.dispose();}
}
