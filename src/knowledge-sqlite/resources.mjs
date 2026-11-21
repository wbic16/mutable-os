import {randomUUID} from 'node:crypto';
import {guid} from './canonical-ledger.mjs';
import {canonicalSemantics} from './semantics.mjs';
import {encodeAuthoredValue} from '../history/preplan-spike/authored-values.mjs';
const snapshot=(db,id)=>{const row=db.prepare('SELECT attributes FROM SourceSnapshot WHERE guid=?').get(guid(id));if(!row)throw Error('Resource snapshot unavailable');return JSON.parse(row.attributes);};
export function resources(db,r,ledger,check=()=>{}){
 check();
 if(r.op==='pdf-snapshot'){
  const row=db.prepare('SELECT guid,identityGuid,captureKey,attributes FROM SourceSnapshot WHERE guid=?').get(guid(r.snapshotId));if(!row)throw Error('Resource snapshot unavailable');
  const s=JSON.parse(row.attributes),identity=db.prepare('SELECT * FROM ExternalIdentity WHERE guid=?').get(row.identityGuid);
  if(s.kind!=='pdf'||s.snapshotId!==row.guid||s.identityId!==row.identityGuid||!identity||identity.namespace!=='pdf-sha256'||identity.externalKey!==s.asset?.assetId||identity.entityGuid!==s.entityId||identity.resourceGuid!==s.resourceId||row.captureKey!==s.asset.assetId+'\n'+s.sourceUrl||!db.prepare('SELECT guid FROM Entity WHERE guid=?').get(s.entityId))throw Error('PDF snapshot identity or resource relationship mismatch');
  return {snapshot:s};
 }
 if(r.op==='resource-context'){
  const s=snapshot(db,r.snapshotId);return {snapshot:s,reviews:db.prepare('SELECT statementId,decision,claimGuid,attributes FROM SourceClaimReview WHERE snapshotGuid=? ORDER BY id LIMIT 101').all(s.snapshotId)};
 }
 if(r.op==='pdf-commit')return ledger.mutate(r,ctx=>{
  const s=r.snapshot;if(s?.version!==1||s.kind!=='pdf'||!/^sha256:[a-f0-9]{64}$/.test(s.asset?.assetId)||s.asset?.kind!=='managed'||s.inspection?.kind!=='pdf-inspection'||!Number.isInteger(s.inspection.pages)||s.inspection.pages<1||s.inspection.pages>1000||typeof s.inspection.label!=='string'||s.inspection.label.length>1000)throw Error('Invalid PDF capture');
  guid(s.snapshotId);for(const value of [s.sourceUrl,s.endpoint]){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||value.length>4096)throw Error('Invalid PDF source');}
  // Binary identity is independent of location and labels. Distinct acquisitions
  // retain their own source URL provenance even when the original is deduplicated.
  let identity=db.prepare("SELECT * FROM ExternalIdentity WHERE namespace='pdf-sha256' AND externalKey=?").get(s.asset.assetId);
  if(!identity){identity={guid:randomUUID(),entityGuid:randomUUID(),resourceGuid:randomUUID()};
   ctx.change('Entity',identity.entityGuid,()=>db.prepare('INSERT INTO Entity(guid,typename,name,nameKey,attributes,createdUtc,modifiedUtc) VALUES(?,?,?,?,?,?,?)').run(identity.entityGuid,'PDFResource',s.inspection.label,s.inspection.label.normalize('NFKC').toLowerCase(),JSON.stringify({origin:'source-imported'}),ctx.now,ctx.now));
   ctx.change('ExternalIdentity',identity.guid,()=>db.prepare('INSERT INTO ExternalIdentity(guid,entityGuid,resourceGuid,namespace,externalKey,attributes) VALUES(?,?,?,?,?,?)').run(identity.guid,identity.entityGuid,identity.resourceGuid,'pdf-sha256',s.asset.assetId,JSON.stringify({origin:'original-content-hash'})));
  }
  const key=s.asset.assetId+'\n'+s.sourceUrl,prior=db.prepare('SELECT attributes FROM SourceSnapshot WHERE identityGuid=? AND captureKey=?').get(identity.guid,key);if(prior)return {snapshot:JSON.parse(prior.attributes)};
  const result={...s,identityId:identity.guid,entityId:identity.entityGuid,resourceId:identity.resourceGuid};ctx.change('SourceSnapshot',s.snapshotId,()=>db.prepare('INSERT INTO SourceSnapshot(guid,identityGuid,attributes,captureKey) VALUES(?,?,?,?)').run(s.snapshotId,identity.guid,JSON.stringify(result),key));return {snapshot:result};
 },check);
 if(r.op==='resource-review')return ledger.mutate(r,ctx=>{
  const s=snapshot(db,r.snapshotId);guid(r.targetId);
  if(!['representationOf','describes','heldBy','depicts','cites'].includes(r.relation)||!['accepted','rejected'].includes(r.decision)||typeof r.note!=='string'||r.note.length>4000||!r.note.trim())throw Error('Invalid resource assertion review');
  const target=db.prepare('SELECT guid,name FROM Entity WHERE guid=?').get(r.targetId);if(!target||target.guid===s.entityId)throw Error('Choose a distinct existing entity');
  if(!db.prepare('SELECT guid FROM Entity WHERE guid=?').get(s.entityId))throw Error('Resource entity missing');
  const statementId=`resource:${r.relation}:${r.targetId}`,prior=db.prepare('SELECT statementId,decision,claimGuid FROM SourceClaimReview WHERE snapshotGuid=? AND statementId=?').get(s.snapshotId,statementId);if(prior){if(prior.decision!==r.decision)throw Error('Previous review decision preserved');return prior;}
  let claimGuid=null;
  if(r.decision==='accepted'){
   claimGuid=randomUUID();canonicalSemantics(db,{mutate:(_r,perform)=>perform(ctx)},{op:'create',recordType:'Claim',operationId:r.operationId,guid:claimGuid,expression:`${r.relation}: ${target.name}`,typename:'resource:'+r.relation,attributes:encodeAuthoredValue({version:1,origin:'authored',reviewStatus:'accepted',sourceSnapshotId:s.snapshotId,sourceResourceId:s.resourceId,relation:r.relation,note:r.note,reviewedAt:ctx.now}),participants:[{guid:randomUUID(),entityGuid:s.entityId,role:'subject',ordinal:0},{guid:randomUUID(),entityGuid:r.targetId,role:'object',ordinal:1}]},check);
  }
  const id=randomUUID();ctx.change('SourceClaimReview',id,()=>db.prepare('INSERT INTO SourceClaimReview(guid,snapshotGuid,statementId,decision,claimGuid,attributes) VALUES(?,?,?,?,?,?)').run(id,s.snapshotId,statementId,r.decision,claimGuid,JSON.stringify({origin:'explicit-user-review',note:r.note,relation:r.relation,targetId:r.targetId,reviewedAt:ctx.now})));check();return {statementId,decision:r.decision,claimGuid};
 },check);
 throw Error('Unknown resource operation');
}
