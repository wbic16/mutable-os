/** Host-internal capability ports. Not an API granting frontend filesystem access. */
import type {NativeRead,NativeDocument,OriginalAsset,PackageDataRequest,PackageDataResult,Preparation,PreparationResult,JobSummary,JobPage} from './contracts';
import type {PackageAsset,PackageManifest} from '../interchange/package/format';
import type {ManagedAssetReference} from '../interchange/managed-asset';
import type {PublicationProfile} from './publication-contracts';
import type {Projection} from '../publication/projection';
export type ExecutionTask =
 | {kind:'attachment-pdf';text:string;title:string}
 | {kind:'attachment-pdf-inspect';bytes:Uint8Array}
 | import('./web-contracts').WebTask
 | import('./deterministic-contracts').DeterministicTask
 | {kind:'academic-original-inspect';bytes:Uint8Array;mediaType:string}
 | {kind:'json-inspect';bytes:Uint8Array}
 | {kind:'pdf-inspect';bytes:Uint8Array}
 | {kind:'iiif-normalize';bytes:Uint8Array}
 | import('./encyclopedia-contracts').EncyclopediaTask
 | {kind:'academic-normalize';doi:string;provider:import('../interchange/scholarly').ScholarlyProvider;bytes:Uint8Array}
 | {kind:'publication-project';native:Uint8Array;profile:PublicationProfile;cavernId:string;namespace?:string;directory?:import('../publication/directory').DirectoryProjectionContext;research?:import('../publication/research').ResearchBundle}
 | {kind:'publication-inspect';native:Uint8Array;profile:PublicationProfile;cavernId:string;blockId?:string}
 | {kind:'publication-zip';members:Record<string,Uint8Array>}
 | Extract<Preparation,{kind:'convert'}>
 | {kind:'inventory';native:Uint8Array;resources?:boolean}
 | {kind:'package';native:Uint8Array;source:PackageManifest['source'];context:PackageDataResult;assets:PackageAsset[]};
export interface Inventory {entities:string[];claims:string[];assets:ManagedAssetReference[]}
export interface Executor {
 run(task:ExecutionTask,signal?:AbortSignal):Promise<import('./web-contracts').WebResult|import('./deterministic-contracts').DeterministicResult|{kind:'json-inspection'}|import('../pdf/model').PdfInspection|import('../iiif/model').Projection|import('./encyclopedia-contracts').EncyclopediaProjection|import('./academic-contracts').AcademicNormalized|PreparationResult|Inventory|Projection|import('../publication/research').ResearchInspection|{bytes:Uint8Array}>;
 close():Promise<void>;
}
export interface JobRecord {summary:JobSummary;preparation:Preparation;result?:{file:string;sha256:string;bytes:number}}
export interface JobLease {close():Promise<void>}
export interface JobStorage {
 list(after?:string):Promise<JobPage>;
 create(id:string,preparation:Preparation):Promise<JobRecord>;
 load(id:string):Promise<JobRecord>;
 checkpoint(record:JobRecord,expectedRevision:number):Promise<JobRecord>;
 acquire(id:string):Promise<JobLease>;
 putResult(id:string,bytes:Uint8Array):Promise<NonNullable<JobRecord['result']>>;
 readResult(id:string,result:NonNullable<JobRecord['result']>):Promise<Uint8Array>;
 close():Promise<void>;
}
export interface ServiceCapabilities {
 cavernId:string;
 readNative(input:NativeRead,signal?:AbortSignal):Promise<NativeDocument>;
 resourceOriginal?(assetId:string,signal?:AbortSignal):Promise<import('./pdf-contracts').PdfOperations['resources.original']['output']>;
 originalAsset(assetId:string,signal?:AbortSignal):Promise<OriginalAsset>;
 packageData(input:PackageDataRequest,signal?:AbortSignal):Promise<PackageDataResult>;
 executor:Executor;
 jobs:JobStorage;
}
