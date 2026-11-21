import type {SemanticVaultServices} from '../../feature-api/semantics';
import type {CanonicalEntity} from '../../feature-api/entities';
import type {IdentitySource,IdentityChoices} from './identity-contract.mjs';
export type {IdentitySource,IdentityChoices};
export interface IdentityAssociation{guid:string;entityGuid:string;revision:number;sourceFingerprint:string;sourceResourceGuid:string;sourceEntityGuid:string}
export interface IdentityPreview{sourceFingerprint:string;association:IdentityAssociation|null;entity:(CanonicalEntity&{nameStrata:unknown;descriptionDocument:unknown})|null;aliasSignature:string;relationships:unknown[];claims:unknown[];complete:boolean}
export interface IdentityCommit {op:'identity-commit';operationId:string;associationId:string;source:IdentitySource;sourceFingerprint:string;targetId:string;expectedTargetRevision:number|null;expectedAssociationRevision:number|null;aliasSignature:string;choices:IdentityChoices;confirmation:true}
export interface IdentityReceipt{entity:CanonicalEntity;association:IdentityAssociation}
export interface IdentityResolutionService{
 readonly vaultId:string;
 preview(source:IdentitySource,targetId?:string,signal?:AbortSignal):Promise<IdentityPreview>;
 commit(request:IdentityCommit,signal?:AbortSignal):Promise<IdentityReceipt>;
 outcome(operationId:string):Promise<{status:'committed'|'not-committed'|'unavailable';result?:IdentityReceipt}>;
}
/** Uses the existing selected-Vault lease, transaction ledger and outcome protocol. */
export function identityResolutionService(service:SemanticVaultServices):IdentityResolutionService{return {vaultId:service.vaultGuid,
 preview:async(source,targetId,signal)=>await service.execute({recordType:'Entity',op:'identity-preview',source,targetId,operationId:crypto.randomUUID()},signal) as unknown as IdentityPreview,
 commit:async(request,signal)=>await service.execute({...request,recordType:'Entity'},signal) as unknown as IdentityReceipt,
 outcome:async operationId=>await service.audit.outcome(operationId) as {status:'committed'|'not-committed'|'unavailable';result?:IdentityReceipt}
};}
