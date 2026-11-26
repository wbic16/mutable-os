import {emptyFragment,validateFragment} from '../interchange/fragment';
import {materializeFragment} from '../interchange/materialize';
import {plainFragment} from '../interchange/serializer';
import {PDF_BLOCK,type PdfCapture,type PdfExtraction} from './model';
export function pdfBlock(snapshot:PdfCapture,sourceUrl=snapshot.sourceUrl){
 const f=emptyFragment(),data=JSON.parse(JSON.stringify({pdf:snapshot,sourceUrl}));f.blocks.push({localId:'pdf',type:PDF_BLOCK,data,children:[],relations:{},blockProperties:[]});f.placements.push({localId:'placement',kind:'owned',target:{kind:'local',object:'block',id:'pdf'}});f.roots.push({placement:'placement',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false});
 const fragment=validateFragment(f),native=materializeFragment(fragment),root=native.state.contents[native.state.placements[native.roots[0]].contentKey];root.viewType=PDF_BLOCK;root.payload={...data,id:root.payload.id,type:PDF_BLOCK,blockProperties:[{id:crypto.randomUUID(),type:'codex/entity-reference',value:snapshot.entityId,metadata:{entityName:snapshot.inspection.label,sourceSnapshotId:snapshot.snapshotId}}]};return {fragment,native};
}
/** The whole-document extraction as native text: one text Block carrying the
 * extraction text and its provenance (the viewer page-extraction idiom),
 * with the entity reference and one layout property per layout block —
 * each valued by its phext address — assigned after materialization, like
 * pdfBlock, so the properties survive materialization unchanged. Bounded
 * by the fragment limits: extractions past them stay available as
 * pdf.extract data but cannot materialize whole. */
export function pdfExtractionFragment(snapshot:PdfCapture,extraction:PdfExtraction){
 const f=plainFragment('');f.blocks[0].inline!.atoms=[{kind:'text',text:extraction.text}];f.blocks[0].data={metadata:{role:'PdfTextBlock',provenance:extraction.provenance}};for(const r of f.roots){r.openStart=false;r.openEnd=false;}
 const fragment=validateFragment(f),native=materializeFragment(fragment),root=native.state.contents[native.state.placements[native.roots[0]].contentKey];
 root.payload={...root.payload,...JSON.parse(JSON.stringify(f.blocks[0].data)),blockProperties:[{id:crypto.randomUUID(),type:'codex/entity-reference',value:snapshot.entityId,metadata:{entityName:snapshot.inspection.label,sourceSnapshotId:snapshot.snapshotId}},...extraction.pages.flatMap(page=>page.blocks.map(block=>({id:crypto.randomUUID(),type:'mutable/pdf-layout-block',value:block.address,metadata:{kind:block.kind,ordinal:block.ordinal,range:block.range,pageIndex:page.pageIndex}})))]};
 return {fragment,native};
}
