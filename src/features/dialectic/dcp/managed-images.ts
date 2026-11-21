import {managedAsset,assetKey} from '../../../interchange/managed-asset';
import {managedImageBlock} from '../../../interchange/resource-url';
import type {BlockFragment} from '../../../block-tree/clipboard';
import type {DcpSources} from './sources';
import type {ReactiveEditor} from '../../../reactive-editor/editor';

export const imageBindingLimits={bindings:8,bytesPerImage:10*1024*1024,alt:1024} as const;
export const managedImagesEnabled=(editor:ReactiveEditor|undefined)=>!!editor&&editor.features.dcpNativeAuthoringStage1&&editor.features.dcpNativeAuthoringStage3ManagedImages&&editor.features.managedAssetClipboard&&!!editor.registry.resolve('image-block')?.view;
export interface ImageBinding {slot:string;source:string;revision:string;alt:string}
/** Resolve only issued, read Block authority. Trusted native references never
 * cross the DCP wire. Verification is bounded and deduplicated per preparation. */
export async function prepareImageBindings(sources:DcpSources,bindings:ImageBinding[]){
 const leaves=new Map<string,BlockFragment>(),checks:(()=>void)[]=[];
 const check=()=>{sources.check();if(bindings.length&&!managedImagesEnabled(sources.editor))throw Error('Managed image authoring disabled');checks.forEach(f=>f());};
 if(bindings.length>imageBindingLimits.bindings)throw Error('DCP image binding budget exceeded');
 check();
 const inputs=bindings.map(input=>{
  if(typeof input.source!=='string'||typeof input.revision!=='string'||sources.revisions.get(input.source)!==input.revision)throw Error('Read a current image source handle and revision first');
  const target=sources.target(input.source),resolved=sources.resolve(target),node=resolved.node;
  if(target.kind!=='block'||target.resourceId!==sources.owner||resolved.status!=='resolved'||!node||!sources.committed(node)||node.viewType!=='image-block')throw Error('Managed image requires a committed image Block in this Document');
  sources.fence(node.contentKey);
  const asset=managedAsset(node.payload.asset);if(!asset)throw Error('Source has no managed image');
  if(typeof input.alt!=='string'||input.alt.length>imageBindingLimits.alt)throw Error('Invalid image alternative text');
  return {input,asset};
 });
 const verified=new Map<string,Awaited<ReturnType<ReactiveEditor['assets']['verifiedImage']>>>();
 for(const {input,asset} of inputs){
  const key=assetKey(asset);let result=verified.get(key);
  if(!result){result=await sources.editor.assets.verifiedImage(asset,sources.signal);verified.set(key,result);checks.push(result.check);}
  check();leaves.set(input.slot,managedImageBlock(result.manifest,input.alt).native);
 }
 return {leaves,check};
}
