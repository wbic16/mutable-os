import type {ManagedAssetReference} from '../interchange/managed-asset';
export const PDF_BLOCK='mutable/pdf-document-block';
export const PDF_LIMITS={bytes:50*1024*1024,pages:1000,pixels:16*1024*1024,textItems:20000,textChars:200000,annotations:500,extractionChars:2000000,extractionItems:200000};
export interface PdfInspection {kind:'pdf-inspection';pages:number;label:string;version:string}
export interface PdfCapture {version:1;kind:'pdf';snapshotId:string;identityId:string;entityId:string;resourceId:string;sourceUrl:string;endpoint:string;retrievedAt:string;asset:ManagedAssetReference;inspection:PdfInspection}
export interface PdfAnchor {version:1;kind:'pdf-page';coordinateVersion:1;snapshotId:string;assetId:string;pageIndex:number;viewBox:number[];region:{x:number;y:number;width:number;height:number}}
export function validPdfAnchor(v:any):v is PdfAnchor {
 if(v?.version!==1||v.kind!=='pdf-page'||v.coordinateVersion!==1||typeof v.snapshotId!=='string'||!/^sha256:[a-f0-9]{64}$/.test(v.assetId)||!Number.isInteger(v.pageIndex)||v.pageIndex<0||v.pageIndex>=PDF_LIMITS.pages||!Array.isArray(v.viewBox)||v.viewBox.length!==4||!v.viewBox.every(Number.isFinite))return false;
 const [x,y,r,b]=v.viewBox,a=v.region;return r>x&&b>y&&a&&[a.x,a.y,a.width,a.height].every(Number.isFinite)&&a.width>0&&a.height>0&&a.x>=x&&a.y>=y&&a.x+a.width<=r+1e-6&&a.y+a.height<=b+1e-6;
}
export function pdfInput(value:unknown){try{if(typeof value!=='string'||value.length>4096)return;const u=new URL(value.trim());if(u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&/\.pdf$/i.test(u.pathname))return value.trim();}catch{} }
/** Text is an explicit derivative. Offsets refer to this immutable extraction,
 * not to future edits of the native text Block. Each run retains PDF coordinates. */
export function pdfText(items:any[],snapshot:PdfCapture,pageIndex:number,viewBox:number[]){
 if(items.length>PDF_LIMITS.textItems)throw Error('PDF page text item limit');
 let text='';const runs:Array<{start:number;end:number;transform:number[];width:number;height:number}>=[];
 for(const item of items){if(typeof item.str!=='string')continue;if(!Array.isArray(item.transform)||item.transform.length!==6||!item.transform.every(Number.isFinite)||!Number.isFinite(item.width)||!Number.isFinite(item.height))throw Error('Unsupported PDF text geometry');
  const start=text.length;text+=item.str;if(text.length>PDF_LIMITS.textChars)throw Error('PDF page text limit');runs.push({start,end:text.length,transform:[...item.transform],width:item.width,height:item.height});text+=item.hasEOL?'\n':'';
 }
 return {text,provenance:{kind:'pdf-text-derivative',version:1,snapshotId:snapshot.snapshotId,resourceId:snapshot.resourceId,entityId:snapshot.entityId,asset:{...snapshot.asset},offsetUnit:'utf16',pageIndex,viewBox:[...viewBox],extractedText:text,runs,alignment:'Offsets apply to extractedText only. Edited native text is not automatically realigned.'}};
}
/** Whole-document LiteParse extraction (version 2 of the text derivative).
 * Like the version 1 page extraction, offsets refer to this immutable
 * derivative only. Page text is assembled from layout blocks in reading
 * order; every run retains its source item's page geometry (a synthesized
 * transform, since LiteParse reports boxes rather than text matrices), and
 * every block and table cell carries its phext address in the page's
 * coordinate space (see coordinate-space.ts). Bounding boxes are
 * [x, y, width, height] in the repository frame (bottom-left origin, y up).
 * Page frames are the extraction viewport: LiteParse reports geometry
 * after the page's own rotation is applied, so rotation is 0 and the
 * viewBox is [0, 0, width, height] of the rotated page. */
export interface PdfExtractionRun {start:number;end:number;transform:number[];width:number;height:number}
export interface PdfExtractionCell {text:string;range:{start:number;end:number};bbox:number[];address:string}
export interface PdfExtractionBlock {kind:string;ordinal:number;range:{start:number;end:number};bbox:number[];address:string;cells?:PdfExtractionCell[]}
export interface PdfExtractionPage {pageIndex:number;viewBox:number[];rotation:number;text:string;ocr:boolean;runs:PdfExtractionRun[];blocks:PdfExtractionBlock[]}
export interface PdfExtraction {kind:'pdf-text-derivative';version:2;text:string;pages:PdfExtractionPage[];provenance:{engine:'liteparse';ocrBackend:string;offsetUnit:'utf16';pages:Array<{pageIndex:number;ocr:boolean}>}}
