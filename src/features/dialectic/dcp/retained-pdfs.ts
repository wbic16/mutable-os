import {resourceSurface} from '../../../interchange/resource-surface';
import {unwrap} from 'solid-js/store';
import {verifyRetainedPdf} from '../../../runtime/retained-pdf';
import {checkedPdfCapture} from '../../../pdf/capture';
import {pdfBlock} from '../../../pdf/block';
import {PDF_BLOCK} from '../../../pdf/model';
import type {BlockFragment} from '../../../block-tree/clipboard';
import type {ReactiveEditor} from '../../../reactive-editor/editor';
import type {DcpSources} from './sources';
export const retainedPdfLimits={bindings:4,bytesPerOriginal:50*1024*1024} as const;
export const retainedPdfTypes=(reversible:boolean)=>[PDF_BLOCK,...(reversible?['surface-block','side-block','container-block','resource-information-block','standoff-editor-block']:[])];
export const retainedPdfsEnabled=(editor:ReactiveEditor|undefined)=>!!editor&&editor.features.dcpNativeAuthoringStage1&&editor.features.dcpNativeAuthoringStage3RetainedPdf&&editor.features.crossResourceLoaders&&retainedPdfTypes(editor.features.reversibleBlocks).every(type=>!!editor.registry.resolve(type)?.view);
export interface PdfBinding {slot:string;source:string;revision:string}
/** Only issued native Block authority reaches the domain-specific verifier.
 * Captures returned by bounded inspection are never used to reconstruct data. */
export async function preparePdfBindings(sources:DcpSources,bindings:PdfBinding[]){
 const leaves=new Map<string,BlockFragment>(),checks:(()=>void)[]=[];
 const check=()=>{sources.check();if(bindings.length&&!retainedPdfsEnabled(sources.editor))throw Error('Retained PDF authoring disabled');checks.forEach(f=>f());};
 if(bindings.length>retainedPdfLimits.bindings)throw Error('DCP retained PDF binding budget exceeded');check();
 const inputs=bindings.map(input=>{
  if(typeof input.source!=='string'||typeof input.revision!=='string'||sources.revisions.get(input.source)!==input.revision)throw Error('Read a current PDF source handle and revision first');
  const target=sources.target(input.source),resolved=sources.resolve(target),node=resolved.node;
  if(target.kind!=='block'||target.resourceId!==sources.owner||resolved.status!=='resolved'||!node||!sources.committed(node)||node.viewType!==PDF_BLOCK||node.payload.archive)throw Error('Retained PDF requires a committed native PDF Block in this Document and active Vault, not an archived package');
  sources.fence(node.contentKey);const capture=structuredClone(unwrap(checkedPdfCapture(node.payload.pdf)));return {input,capture};
 });
 const verified=new Map<string,Awaited<ReturnType<typeof verifyRetainedPdf>>>();
 for(const {input,capture}of inputs){
  // Include all expected fields so conflicting occurrences cannot share a
  // verification result merely because they claim the same snapshot identity.
  const key=JSON.stringify(capture);let result=verified.get(key);
  if(!result){result=await verifyRetainedPdf(sources.editor,capture,sources.signal);verified.set(key,result);checks.push(result.check);}
  check();const native=pdfBlock(result.snapshot).native;leaves.set(input.slot,sources.editor.features.reversibleBlocks?resourceSurface(native):native);
 }
 return {leaves,check};
}
