/** Semantic resolver contract. No persistence rows, SQL or editor access. */
export interface CanonicalEntity {
  imageRef?: import('../interchange/managed-asset').ManagedAssetReference | null;
  deletedUtc?: string | null;
  displayName?: string; id:string; name:string; revision:number; typename?:string|null; description?:string|null; attributes?:unknown; aliases:Array<{id:string;name:string;origin:string;revision:number}> }
export type EntityStream = 'all'|'name'|'alias'|'mention';
export interface EntityResolutionQuery {query:string;stream:EntityStream;match:'exact'|'partial';scope:'document'|'vault';refresh?:boolean}
export interface EntityEvidence {kind:string;text:string;resourceId?:string;mentionId?:string;ranges?:readonly {blockId:string;start:number;end:number}[]}
export interface EntityCandidate {id:string;name:string;evidence:EntityEvidence[];localMentions?:number}
export interface EntityResolution {candidates:EntityCandidate[];complete:boolean;diagnostics:string[];current():void}
export interface AuthorityRecord { typeIds?:string[];classifications?:string[];dates?:import('./entity-enrichment').EntityDate[];thumbnail?:{url:string;source?:string;attribution?:string;license?:string;licenseUrl?:string};cache?:{vault?:string;key:string;stale:boolean;fetchedAt:string}; provider:'wikidata'|'gnd'; id:string; name:string; description:string; aliases:string[]; url:string; retrievedAt:string; wikidata?:string; revision?:number }
export interface DocumentEntityDatabaseLink {method:'user-confirmed';entityId:string;vaultId:string;vault?:string;sourceResourceId:string;sourceEntityId:string;associationId:string;revision:number}
export interface EntityService {
 /** Exact persistent identity association; independent of the Document's saved marker. */
 documentAssociation?(source:{resourceId:string;entityId:string},signal:AbortSignal):Promise<{link?:DocumentEntityDatabaseLink;entity?:CanonicalEntity}>;
 historyScope?():Promise<string>;
 /** Durable Vault identity for scope-qualified references; not a filesystem location. */
 scopeIdentity?(signal?:AbortSignal):Promise<string>;
 authorityLookup?(record:{provider:string;id:string},signal:AbortSignal):Promise<CanonicalEntity|undefined>;
 acquireIdentity?(input:{id:string;operationId:string;record:AuthorityRecord;targetId?:string;expected?:number}):Promise<CanonicalEntity>;
 names(ids:string[],signal?:AbortSignal):Promise<Array<{id:string;name:string}>>;
 dbMentions(ids:string[],signal?:AbortSignal):Promise<Array<{id:string;mentions:number}>>;
 /** Canonical matches may be published while slower mention evidence is prepared. */
 search(query:EntityResolutionQuery,signal:AbortSignal,onProgress?:(result:EntityResolution)=>void):Promise<EntityResolution>;
 summaries(ids:string[],signal?:AbortSignal):Promise<{rows:Array<{id:string;name:string;mentions?:number}>;complete:boolean;diagnostics:string[]}>;
 get(id:string,signal?:AbortSignal):Promise<CanonicalEntity|undefined>;
 /** A confirmed rejection before canonical worker dispatch carries entityCreationOutcome: 'not-created'. Other failures remain unconfirmed. */
 create(input:{id:string;operationId:string;name:string;typename?:string|null;description?:string|null;attributes?:unknown},signal?:AbortSignal):Promise<CanonicalEntity>;
 update?(input:{id:string;operationId:string;expected:number;name?:string;typename?:string|null;description?:string|null;attributes?:unknown},signal?:AbortSignal):Promise<CanonicalEntity>;
 rename(input:{id:string;name:string;expected:number;operationId:string}):Promise<CanonicalEntity>;
 alias(input:{op:'alias-add'|'alias-update'|'alias-remove';id:string;entityId:string;name?:string;expected?:number;operationId:string}):Promise<CanonicalEntity>;
 dispose():void;
}
