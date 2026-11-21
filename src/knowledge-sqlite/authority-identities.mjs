import {randomUUID} from 'node:crypto';
import {guid,expected} from './canonical-ledger.mjs';
/** Reuses ExternalIdentity's unique namespace/key and canonical mutation receipt. No schema changes. */
export function authorityIdentity(db,r,ledger,entity,check){
 const record=r.record;
 if(!record||record.provider!=='wikidata'||!/^Q[1-9]\d{0,14}$/.test(record.id))throw Error('Only the existing Wikidata identity namespace supports import');
 const mapping=()=>db.prepare('SELECT entityGuid FROM ExternalIdentity WHERE namespace=? AND externalKey=?').get('wikidata',record.id);
 if(r.op==='authority-lookup'){const found=mapping(),value=found?entity(db,found.entityGuid):undefined;return {entity:value&&!value.deletedUtc?value:undefined};}
 return ledger.mutate(r,ctx=>{
  guid(r.id);const old=mapping();
  if(old){if(entity(db,old.entityGuid)?.deletedUtc)throw Error('Authority identity belongs to a deleted Entity; restore it in Cardex first');if(r.targetId&&r.targetId!==old.entityGuid)throw Error('This authority ID belongs to another Entity; no merge was performed');return {entity:entity(db,old.entityGuid)};}
  if(typeof record.name!=='string'||!record.name.trim()||record.name.length>1000||typeof record.description!=='string'||record.description.length>4000||!Array.isArray(record.aliases)||record.aliases.length>20||record.aliases.some(a=>typeof a!=='string'||!a.trim()||a.length>1000)||!Number.isFinite(Date.parse(record.retrievedAt))||record.url!=='https://www.wikidata.org/wiki/'+record.id)throw Error('Invalid authority identity preview');
  const id=r.targetId?guid(r.targetId):r.id;
  if(r.targetId){const existing=entity(db,id);if(!existing||existing.revision!==expected(r.expected))throw Error('Reconciliation target changed');}
  else {
   if(entity(db,id))throw Error('Import GUID already exists');
   ctx.change('Entity',id,()=>db.prepare('INSERT INTO Entity(guid,name,nameKey,description,typename,attributes,createdUtc,modifiedUtc) VALUES(?,?,?,?,?,?,?,?)').run(id,record.name,record.name.normalize('NFKC').toLowerCase(),record.description,'KnowledgeObject',JSON.stringify({origin:'source-imported'}),ctx.now,ctx.now));
   for(const name of [...new Set(record.aliases)].filter(a=>a!==record.name)) {const alias=randomUUID();ctx.change('EntityAlias',alias,()=>db.prepare('INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin,createdUtc,modifiedUtc) VALUES(?,?,?,?,?,?,?)').run(alias,id,name,name.normalize('NFKC').toLowerCase(),'imported',ctx.now,ctx.now));}
  }
  const identity=randomUUID(),provenance={origin:'source-imported',acquisitionMethod:'explicit-user-identity-review',provider:'wikidata',recordId:record.id,retrievedAt:record.retrievedAt,source:record.url,revision:record.revision??null};
  ctx.change('ExternalIdentity',identity,()=>db.prepare('INSERT INTO ExternalIdentity(guid,entityGuid,resourceGuid,namespace,externalKey,attributes) VALUES(?,?,?,?,?,?)').run(identity,id,randomUUID(),'wikidata',record.id,JSON.stringify(provenance)));
  check();return {entity:entity(db,id)};
 },check);
}
