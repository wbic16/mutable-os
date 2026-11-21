import {enrichEntityDefinition} from '../../../feature-api/entity-enrichment';
import {DcpValidationError,safeDiagnostic} from './diagnostics';
import {requireCapability,requireStandoff} from './vocabulary-contract';
import type {GeneratedIdentityKind} from './identities';
import {ARGUMENT,ARGUMENT_RELATION,argumentDefinition,argumentRelations} from '../arguments';
import {GLOSS} from '../../gloss/model';
import {ENTITY_REFERENCE,localEntity,type ScopedEntityReference} from '../../../feature-api/scoped-entities';
import {keys,list,type Provenance} from './markup';
import type {DcpSources} from './sources';
import type {ReplyTarget} from '../model';

/** Exchange-local preparation. No canonical writes, SQL writes or implicit arguments. */
export function semanticPreparation(sources:DcpSources,resourceId:string,definitions:Record<string,any>,aliases:Map<string,ReplyTarget>,claim:(id:string,kind:GeneratedIdentityKind)=>void,provenance:Provenance,requireMentions=false){
 const target=(handle:string)=>aliases.get(handle)??sources.target(handle);
 const record=(t:ReplyTarget)=>{const id=t.argumentId??t.entity?.entityId??t.anchorId??t.definitionId;return id&&definitions[id]||sources.definition(t);};
 const created:string[]=[],mentioned=new Set<string>();
 const vaultReferences=new Map<string,ScopedEntityReference>();
 const entities=(items:any[])=>{if(items.length)requireCapability(sources.vocabulary,'semantic.entity');for(const value of list(items,64)){const input={description:'',aliases:[],...value};
  keys({...input,ref:input.ref??null,enrichment:input.enrichment??null},['id','name','typename','description','aliases','ref','enrichment']);claim(input.id,'e');
  if((input.ref||input.enrichment)&&!sources.editor.features.dcpEntityEnrichment)throw Error('Entity enrichment disabled');
  let d:any=sources.entities.prepare(input,provenance);
  if(input.ref){const existing=target(input.ref);if(existing.kind!=='entity'||existing.entity.scope!=='document'||existing.entity.resourceId!==resourceId)throw Error('Enrichment requires a current owned Document Entity handle');d=record(existing);if(!localEntity(d)||d.isDeleted||d.metadata.scopedEntity.entity.deletedUtc)throw Error('Entity unavailable');d=enrichEntityDefinition(d,input,provenance);}
  else {created.push(d.id);if(input.enrichment)d=enrichEntityDefinition(d,input,provenance);}
  definitions[d.id]=d;
  aliases.set(input.id,{kind:'entity',resourceId,entity:{scope:'document',resourceId,entityId:d.id}});
 }};
 const entityRef=(handle:string):ScopedEntityReference=>{const t=target(handle);if(t.kind!=='entity')throw Error('Expected a scoped Entity handle');if(t.entity.scope==='document'&&(t.entity.resourceId!==resourceId||(!localEntity(record(t))||record(t).isDeleted||record(t).metadata.scopedEntity.entity.deletedUtc)))throw Error('Unavailable owned Entity');if(t.entity.scope==='vault'){if(vaultReferences.size>=32)throw Error('Vault reference budget');vaultReferences.set(JSON.stringify(t.entity),t.entity);}return t.entity;};
 const mark=(type:string,handle:string)=>{requireStandoff(sources.vocabulary,type,true);if(type!==ENTITY_REFERENCE)throw Error('Reference is not admitted for this annotation type');const ref=entityRef(handle);if(ref.scope==='document')mentioned.add(ref.entityId);return {type,metadata:{dcp:provenance,entityReference:ref}};};
 const argumentsAndRelations=async(args:any[],rels:any[])=>{
  if(args.length)requireCapability(sources.vocabulary,'semantic.argument');
  for(const a of list(args,64)){keys(a,['id','anchor']);claim(a.id,'arg');const anchor=target(a.anchor);if(anchor.kind!=='range'||anchor.resourceId!==resourceId)throw Error('Argument needs an owned passage anchor');if(!definitions[anchor.anchorId]){const d=sources.definition(anchor);if(!d||d.isDeleted)throw Error('Anchor unavailable');}
   const id=crypto.randomUUID();definitions[id]={id,type:ARGUMENT,metadata:{dialecticArgument:{version:1,anchor:{resourceId,anchorId:anchor.anchorId},provenance}}};aliases.set(a.id,{kind:'argument',resourceId,argumentId:id});
  }
  for(const r of list(rels,64)){keys(r,['id','kind','type','from','to']);claim(r.id,'rel');let d:any;
   if(r.kind==='argument'){requireCapability(sources.vocabulary,'semantic.argument-relation');
    if(!argumentRelations.includes(r.type))throw Error('Unsupported directed argument relation');
    const endpoints=[target(r.from),target(r.to)];for(const t of endpoints)if(t.kind!=='argument'||t.resourceId!==resourceId||!argumentDefinition(record(t))||record(t).isDeleted)throw Error('Argument relation endpoints must be owned arguments');
    const [from,to]=endpoints,id=crypto.randomUUID();d={id,type:ARGUMENT_RELATION,metadata:{dialecticArgumentRelation:{version:1,relation:r.type,from:{resourceId,argumentId:from.argumentId},to:{resourceId,argumentId:to.argumentId},provenance}}};
   }else if(r.kind==='entity'){requireCapability(sources.vocabulary,'semantic.entity-relation');
    const from=entityRef(r.from),to=entityRef(r.to);
    d=sources.entities.prepareRelation(r.type,from,to,provenance);
   }else throw Error('Unsupported relation family');
   definitions[d.id]=d;aliases.set(r.id,{kind:r.kind==='argument'?'argument-relation':'entity-relation',resourceId,definitionId:d.id});
  }
 };
 const gloss=(input:any)=>{requireCapability(sources.vocabulary,'semantic.gloss');keys(input,['id','target','type','text']);claim(input.id,'g');if(typeof input.type!=='string'||!input.type.trim()||input.type.includes(':')||input.type.length>128||typeof input.text!=='string'||!input.text.trim()||input.text.length>8192)throw Error('Invalid independent Gloss');
  const id=crypto.randomUUID();definitions[id]={id,type:GLOSS,value:input.type+': '+input.text,metadata:{gloss:{version:1,localId:crypto.randomUUID(),links:{}},dcp:provenance}};aliases.set(input.id,{kind:'gloss',resourceId,definitionId:id});return {id:crypto.randomUUID(),type:GLOSS,annotationId:id,metadata:{dcp:provenance}};
 };
 // A failed streaming semantic operation must not leak prepared identities or
 // grounding state into the next operation. Only exchange-local state is saved.
 const checkpoint=()=>{const length=created.length,marks=new Set(mentioned),vault=new Map(vaultReferences);return()=>{created.length=length;mentioned.clear();marks.forEach(id=>mentioned.add(id));vaultReferences.clear();vault.forEach((v,k)=>vaultReferences.set(k,v));};};
 return {entities,mark,argumentsAndRelations,gloss,target,checkpoint,verify:async()=>{if(requireMentions){const index=created.findIndex(id=>!mentioned.has(id));if(index>=0)throw new DcpValidationError(safeDiagnostic({code:'entity-mention',path:`$.entities[${index}]`}));}for(const ref of vaultReferences.values())await sources.verifyVaultEntity(ref);}};
}
