import {createHash} from 'node:crypto';
import {inspectPdf} from './pdf-inspection';
import {PDF_LIMITS,type PdfExtraction,type PdfExtractionBlock,type PdfExtractionPage,type PdfExtractionRun} from '../../src/pdf/model';
import {blockAddress,cellAddress,formatAddress,fromTopLeftBox,type PageBox,type PageGeometry,type RegionGeometry} from '../../src/pdf/coordinate-space';
import type {LayoutBlock,ParsedPage,TextItem} from '@llamaindex/liteparse';
/**
 * The OCR backend for LiteParse extraction, named once here so the choice —
 * and its licensing consequence — is auditable in one place.
 *
 * LICENSE FLAG: the ocria-nano weights are NOT Apache-2.0 like the
 * LiteParse code. They ship under a modified OpenRAIL-M licence: commercial
 * use is permitted only below both a $2M revenue and a $2M funding ceiling,
 * and use in a document-parsing/OCR product that competes with LlamaParse /
 * LlamaCloud is restricted at any size. Provisioning the weights
 * (`npm run setup:liteparse-models`) prints the full notice. Switching this
 * constant to 'tesseract' avoids the restricted weights entirely.
 */
export const PDF_OCR_BACKEND:'tesseract'|'ocria-nano'='ocria-nano';
/** Runs only in the bounded preparation worker. No network, actions or forms.
 * The document identity for phext addressing is the SHA-256 of the original
 * bytes, which is exactly the retained asset id (`sha256:<hex>`) the managed
 * store assigns, so addresses computed here match the capture's identity. */
export async function extractPdf(bytes:Uint8Array):Promise<PdfExtraction>{
 // Validation and limits are inspection's, shared verbatim: magic, byte and
 // page limits and the encrypted-original rejection all fire before the
 // heavier engine loads, with the same messages pdf-inspect produces.
 await inspectPdf(bytes);
 const {LiteParse}=await import('@llamaindex/liteparse');
 const parser=new LiteParse({outputFormat:'json',extractBlocks:true,ocrEnabled:true,ocrBackend:PDF_OCR_BACKEND,maxPages:PDF_LIMITS.pages,includeComplexity:true,quiet:true});
 const result=await parser.parse(Buffer.from(bytes));
 if(result.totalPages<1||result.totalPages>PDF_LIMITS.pages)throw Error('PDF page limit exceeded');
 if(result.pageErrors.length)throw Error(`PDF page extraction failed on page ${result.pageErrors[0].pageNum}: ${result.pageErrors[0].message}`);
 const identity='sha256:'+createHash('sha256').update(bytes).digest('hex');
 let totalItems=0;const pages:PdfExtractionPage[]=[];
 for(const page of result.pages){
  totalItems+=page.textItems.length;if(totalItems>PDF_LIMITS.extractionItems)throw Error('PDF extraction item limit exceeded');
  pages.push(projectPage(identity,page));
 }
 const text=pages.map(p=>p.text).join('\n');
 if(text.length>PDF_LIMITS.extractionChars)throw Error('PDF extraction text limit exceeded');
 return {kind:'pdf-text-derivative',version:2,text,pages,provenance:{engine:'liteparse',ocrBackend:PDF_OCR_BACKEND,offsetUnit:'utf16',pages:pages.map(p=>({pageIndex:p.pageIndex,ocr:p.ocr}))}};
}
function projectPage(identity:string,page:ParsedPage):PdfExtractionPage{
 const pageIndex=page.pageNum-1,frame={viewBox:[0,0,page.width,page.height] as const,rotation:0};
 const itemBox=(item:TextItem):PageBox=>fromTopLeftBox(frame,item);
 const claimed=new Set<number>(),runs:PdfExtractionRun[]=[],itemRange=new Map<number,{start:number;end:number}>();
 let text='';
 const appendItem=(index:number)=>{
  const item=page.textItems[index];if(!item||claimed.has(index))return;
  claimed.add(index);if(text)text+='\n';const start=text.length;text+=item.text;const end=text.length;
  const box=itemBox(item),height=item.fontHeight??item.height;
  // LiteParse reports boxes, not text matrices: the transform is synthesized
  // from item geometry (font size, then the repository-frame origin).
  runs.push({start,end,transform:[item.fontSize??height,0,0,height,box[0],box[1]],width:item.width,height:item.height});
  itemRange.set(index,{start,end});
 };
 const appendRaw=(raw:string)=>{if(text)text+='\n';const start=text.length;text+=raw;return {start,end:text.length};};
 const blocks:PdfExtractionBlock[]=[],geometries:RegionGeometry[]=[];
 const layout:LayoutBlock[]=page.blocks??[];
 layout.forEach((block,ordinal)=>{
  const indices=[...new Set(block.textItemIndices)].sort((a,b)=>a-b).filter(i=>!claimed.has(i));
  let range:{start:number;end:number};
  if(indices.length){for(const i of indices)appendItem(i);range={start:itemRange.get(indices[0])!.start,end:itemRange.get(indices[indices.length-1])!.end};}
  else range=appendRaw(block.text??(block.lines??[]).join('\n'));
  const bbox=block.bbox?fromTopLeftBox(frame,block.bbox):unionBox(indices.map(i=>itemBox(page.textItems[i])));
  const geometry:RegionGeometry={ordinal,range,bbox};
  const cells=tableCells(block);
  if(cells){
   geometry.cells=cells.map(cell=>{
    const own=cell.textItemIndices.filter(i=>itemRange.has(i));
    const cellRange=own.length?{start:Math.min(...own.map(i=>itemRange.get(i)!.start)),end:Math.max(...own.map(i=>itemRange.get(i)!.end))}:{start:range.end,end:range.end};
    return {range:cellRange,bbox:cell.bbox?fromTopLeftBox(frame,cell.bbox):unionBox(own.map(i=>itemBox(page.textItems[i])))};
   });
  }
  geometries.push(geometry);
  const projected:PdfExtractionBlock={kind:block.kind,ordinal,range,bbox:[...bbox],address:''};
  if(cells)projected.cells=cells.map((cell,i)=>({text:cell.text,range:geometry.cells![i].range,bbox:[...geometry.cells![i].bbox],address:''}));
  blocks.push(projected);
 });
 // Items no layout block claimed keep their text (and runs) after the blocks,
 // in source order; they live in the whole-page space (region 0).
 for(let i=0;i<page.textItems.length;i++)appendItem(i);
 runs.sort((a,b)=>a.start-b.start);
 const geometry:PageGeometry={pageIndex,frame,text,blocks:geometries};
 blocks.forEach((block,i)=>{block.address=formatAddress(blockAddress(identity,geometry,geometries[i]));block.cells?.forEach((cell,j)=>cell.address=formatAddress(cellAddress(identity,geometry,geometries[i],j)));});
 const ocr=page.textItems.some(item=>item.confidence!==undefined)||page.complexity?.needsOcr===true;
 return {pageIndex,viewBox:[...frame.viewBox],rotation:frame.rotation,text,ocr,runs,blocks};
}
function tableCells(block:LayoutBlock):Array<{text:string;bbox?:{x:number;y:number;width:number;height:number};textItemIndices:number[]}>|undefined{
 if(block.kind!=='table'&&block.kind!=='grid_fallback')return undefined;
 const cells=[...(block.header??[]),...(block.rows??[]).flat()];
 return cells.length?cells:undefined;
}
function unionBox(boxes:PageBox[]):PageBox{
 if(!boxes.length)return [0,0,0,0];
 const x0=Math.min(...boxes.map(b=>b[0])),y0=Math.min(...boxes.map(b=>b[1])),x1=Math.max(...boxes.map(b=>b[0]+b[2])),y1=Math.max(...boxes.map(b=>b[1]+b[3]));
 return [x0,y0,x1-x0,y1-y0];
}
