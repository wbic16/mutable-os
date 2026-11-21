import assert from 'node:assert/strict';
/** Host-created grants only. Revision grants remain compatible; scope grants are explicit. */
export function validateConsent(grant,{vaultGuid,indexId,model,scope,queryHash,now=Date.now()}){
 assert(grant?.approved===true&&typeof grant.id==='string'&&grant.id.length<=128,'Explicit embedding consent required');
 assert.equal(grant.vaultGuid,vaultGuid);assert.equal(grant.indexId,indexId,'Consent belongs to another index lifetime');assert.equal(grant.model,model);
 assert(Date.parse(grant.expiresAt)>now,'Embedding consent expired');assert(Number.isInteger(grant.maxTokens)&&grant.maxTokens>0&&grant.maxTokens<=50000,'Invalid consent cap');
 if(grant.scope?.version===1){
  assert.equal(grant.scope.kind,scope.kind==='document'?'saved-vault-maintenance':'interactive-queries','Embedding scope not approved');
  assert.equal(grant.scope.vaultGuid,vaultGuid,'Foreign scope');
 }else if(scope.kind==='document')assert(grant.documents?.some(x=>x.resourceId===scope.resourceId&&x.contentHash===scope.sourceHash),'Document revision not approved for upload');
 else assert(grant.queries?.includes(queryHash),'Query not approved for upload');
}
