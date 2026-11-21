import {createHash,randomUUID} from 'node:crypto';
import {identitySource,identityChoices} from '../features/pipelines/identity-contract.mjs';
import {canonicalEntities} from './entities.mjs';
import {canonicalCardex} from './cardex.mjs';
import {guid,expected} from './canonical-ledger.mjs';
import {sqlRevision} from './reconcile.mjs';
import {encodeAuthoredValue,decodeAuthoredValue} from '../history/preplan-spike/authored-values.mjs';
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const association=(db,s)=>{const row=db.prepare('SELECT * FROM DocumentEntityAssociation WHERE sourceResourceGuid=? AND sourceEntityGuid=?').get(s.resourceId,s.entityId);if(!row)return null;const {id,...rest}=row;return {...rest,attributes:JSON.parse(row.attributes)};};
const entity=(db,id,check)=>{if(!id)return null;const e=canonicalEntities(db,{op:'get',id},check).entity;if(!e||e.deletedUtc)throw Error('Canonical Entity missing or deleted');return {...e,...canonicalCardex(db,null,{op:'get',id},check).entity};};
const aliasSignature=e=>fingerprint((e?.aliases??[]).map(a=>({id:a.id,name:a.name,revision:a.revision,origin:a.origin})).sort((a,b)=>a.id.localeCompare(b.id)));
/** Read-only preview and one audited commit. No arbitrary mutations accepted. */
export function resolveDocumentEntity(db,ledger,request,check=()=>{}){
 check();const source=identitySource(request.source),sourceFingerprint=fingerprint(source);
 if(request.op==='identity-preview')return db.transaction(()=>{
  const link=association(db,source),target=entity(db,request.targetId??link?.entityGuid,check);
  const relationships=target?['out','in'].map(direction=>canonicalEntities(db,{op:'relationships',id:target.id,direction},check)):[];
  const claims=target?db.prepare('SELECT DISTINCT c.guid,c.expression,c.typename,c.revision FROM Claim c JOIN ClaimParticipant p ON p.claimGuid=c.guid WHERE p.entityGuid=? ORDER BY c.guid LIMIT 51').all(target.id):[];
  return {sourceFingerprint,association:link,entity:target,aliasSignature:aliasSignature(target),relationships:relationships.flatMap(r=>r.relationships),claims:claims.slice(0,50),complete:relationships.every(r=>r.complete)&&claims.length<=50,revision:sqlRevision(db)};
 }).deferred();
 if(request.op!=='identity-commit'||request.confirmation!==true)throw Error('Explicit final identity confirmation required');
 const choices=identityChoices(request.choices);guid(request.targetId);guid(request.associationId);
 if(sourceFingerprint!==request.sourceFingerprint)throw Error('Source preview changed');
 return ledger.mutate(request,ctx=>{
  check();const link=association(db,source);
  if((link?.revision??null)!==request.expectedAssociationRevision)throw Error('Identity association changed; review again');
  if(link&&link.entityGuid!==request.targetId)throw Error('Document Entity already has an authentic identity; review that identity');
  const existing=db.prepare('SELECT guid FROM Entity WHERE guid=?').get(request.targetId),old=existing?entity(db,request.targetId,check):null;
  if((old?.revision??null)!==request.expectedTargetRevision)throw Error('Canonical Entity changed; review again');
  if(aliasSignature(old)!==request.aliasSignature)throw Error('Aliases changed; review again');
  if(old)expected(request.expectedTargetRevision);
  const nested={mutate:(_request,perform)=>perform(ctx)},base={operationId:request.operationId,actorGuid:request.actorGuid};
  // Preserve full Cardex fields when kept. Scalar replacement is explicit.
  const name=!old||choices.name==='import'?source.name:old.name;
  let descriptionDocument=old?.descriptionDocument??null;
  if(!old||choices.description==='import')descriptionDocument={type:'document-block',children:[{type:'standoff-editor-block',text:source.description}]};
  else if(choices.description==='both'&&source.description&&source.description!==old.description){descriptionDocument=descriptionDocument?JSON.parse(JSON.stringify(descriptionDocument)):{type:'document-block',children:[{type:'standoff-editor-block',text:old.description??''}]};descriptionDocument.children.push({type:'standoff-editor-block',text:source.description});}
  const aliases=(old?.aliases??[]).map(a=>({...a}));
  if(!old||choices.aliases==='merge')for(const alias of [...source.aliases,source.name,...(old?[old.name]:[])]){if(alias.normalize('NFKC').toLowerCase()!==name.normalize('NFKC').toLowerCase()&&!aliases.some(a=>a.name.normalize('NFKC').toLowerCase()===alias.normalize('NFKC').toLowerCase()))aliases.push({id:randomUUID(),name:alias,origin:'imported'});}
  const card={...base,op:'save',id:request.targetId,expected:old?.revision??null,name,nameStrata:old&&name===old.name?old.nameStrata:null,descriptionDocument,imageRef:old?.imageRef??null,aliases,aliasBaseline:(old?.aliases??[]).map(a=>({id:a.id,revision:a.revision}))};
  const cardChanged=!old||name!==old.name||JSON.stringify(descriptionDocument)!==JSON.stringify(old.descriptionDocument)||aliases.length!==old.aliases.length;
  if(cardChanged)canonicalCardex(db,nested,card,check);
  const current=entity(db,request.targetId,check),attributes=old?.attributes==null?{}:decodeAuthoredValue(old.attributes);
  const next=structuredClone(attributes);
  if(!old||['subtypes','dates','externalIds'].some(k=>choices[k]==='merge')){
   if(!next||typeof next!=='object'||Array.isArray(next))throw Error('Canonical attributes need separate review; keep the enrichment fields');
   const prior=next.enrichment??{};if(!prior||typeof prior!=='object'||Array.isArray(prior))throw Error('Canonical enrichment needs separate review');
   next.enrichment={...prior};for(const field of ['subtypes','dates','externalIds']){if(old&&choices[field]==='keep')continue;const values=prior[field]??[];if(!Array.isArray(values))throw Error('Canonical enrichment needs separate review');const merged=[...values];for(const v of source.enrichment[field]??[])if(!merged.some(x=>JSON.stringify(x)===JSON.stringify(v)))merged.push(v);if(merged.length>64)throw Error('Enrichment limit exceeded');next.enrichment[field]=merged;}
  }
  const typename=!old||choices.typename==='import'?(source.typename||null):current.typename;
  if(typename!==current.typename||JSON.stringify(next)!==JSON.stringify(attributes))canonicalEntities(db,{...base,op:'update',id:request.targetId,expected:current.revision,typename,attributes:encodeAuthoredValue(next)},check,nested);
  const id=link?.guid??request.associationId;guid(id);
  ctx.change('DocumentEntityAssociation',id,()=>{
   const provenance=JSON.stringify({version:1,method:'user-confirmed',source,choices,operationId:request.operationId});
   if(link)db.prepare('UPDATE DocumentEntityAssociation SET sourceFingerprint=?,attributes=?,revision=revision+1,lastUpdatedByActorGuid=?,modifiedUtc=? WHERE guid=?').run(sourceFingerprint,provenance,ctx.actorGuid,ctx.now,id);
   else db.prepare('INSERT INTO DocumentEntityAssociation(guid,sourceResourceGuid,sourceEntityGuid,entityGuid,sourceFingerprint,attributes,createdByActorGuid,createdUtc,lastUpdatedByActorGuid,modifiedUtc) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,source.resourceId,source.entityId,request.targetId,sourceFingerprint,provenance,ctx.actorGuid,ctx.now,ctx.actorGuid,ctx.now);
  });
  check();return {entity:entity(db,request.targetId,check),association:association(db,source)};
 },check);
}
