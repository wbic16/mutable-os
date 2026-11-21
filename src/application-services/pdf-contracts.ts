import type {PdfCapture,PdfInspection} from '../pdf/model';
import type {JobStorage,Executor} from './capabilities';
import type {JobSummary} from './contracts';
export interface PdfOperations {
 'resources.original':{input:{assetId:string};output:{assetId:string;cavernId:string;mediaType:import('../interchange/package/resources').OriginalMedia;bytes:Uint8Array}};
 'resource.context':{input:{snapshotId:string};output:{snapshot:any;reviews:Array<{statementId:string;decision:string;claimGuid?:string;attributes:string}>}};
 'resource.review':{input:{operationId:string;snapshotId:string;targetId:string;relation:'representationOf'|'describes'|'heldBy'|'depicts'|'cites';note:string;decision:'accepted'|'rejected'};output:{statementId:string;decision:string;claimGuid?:string}};
 'pdf.import':{input:{id:string;source:string};output:{snapshot:PdfCapture}};
 'pdf.resume':{input:{id:string};output:{snapshot:PdfCapture}};
 'pdf.inspect':{input:{id:string};output:{job:JobSummary}};
 'pdf.read':{input:{snapshotId:string};output:{snapshot:PdfCapture;bytes:Uint8Array}};
 'pdf.verify':{input:{snapshotId:string};output:{snapshot:PdfCapture;byteLength:number}};
}
export const pdfOperations=['resources.original','resource.context','resource.review','pdf.import','pdf.resume','pdf.inspect','pdf.read','pdf.verify'] as const;
export interface PdfCapabilities {
 originalResource(assetId:string,signal:AbortSignal):Promise<PdfOperations['resources.original']['output']>;
 cavernId:string;jobs:JobStorage;executor:Executor;uuid():string;now():string;
 knowledge(request:any,signal?:AbortSignal):Promise<any>;
 acquire(source:string,signal:AbortSignal):Promise<{bytes:Uint8Array;endpoint:string}>;
 retain(bytes:Uint8Array,signal:AbortSignal):Promise<PdfCapture['asset']>;
 original(asset:PdfCapture['asset'],signal:AbortSignal):Promise<Uint8Array>;
}
