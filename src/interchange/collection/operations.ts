import {rewriteCollectionSource} from './source-export';
import {hash,bytes,packZip,PACKAGE_LIMITS} from '../package/archive';
import {decodeNative} from '../../persistence/native-resource';
import {packageFragment} from '../package/native';
import {exportFragment} from '../export-plan';
import {managedAsset,assetKey,type AssetManifest} from '../managed-asset';
import {isSourceType} from '../source-block';
import {prepareCollectionDocument,collectionNative,type PreparedDocument} from './content';
import {relativePath,relativeLink,type Entry,type CollectionPlan,type DocumentPlan} from './plan';
export type CollectionRequest =
 | {action:'hash';blob:Blob}
 | {action:'prepare';blob:Blob;entry:Entry;plan:CollectionPlan}
 | {action:'native';prepared:PreparedDocument;plan:CollectionPlan;document:DocumentPlan;assets:Record<string,AssetManifest>}
 | {action:'inspect';native:string;cavernId:string}
 | {action:'project';native:string;cavernId:string;path:string;paths:Record<string,string>;assetPaths:Record<string,string>}
 | {action:'zip';members:Record<string,Uint8Array>};
export const collectionArchivePolicy={...PACKAGE_LIMITS,members:5001,path:relativePath};
export function inspectCollectionNative(native:string,cavernId:string){
 const snapshot=decodeNative(bytes(native)),fragment=packageFragment(snapshot,cavernId);
 const root=fragment.blocks.find(b=>b.type==='document-block')!;
 const sources=fragment.blocks.filter(b=>isSourceType(b.type));
 // Full-document conversion now inserts one Page; retain legacy source-only Documents too.
 const wrappers=fragment.blocks.filter(b=>b.type==='document-block'||b.type==='page-block');
 const source=sources.length===1&&wrappers.length<=2&&fragment.blocks.length===wrappers.length+1?sources[0]:undefined;
 const assets=new Map<string,AssetManifest>();
 for(const e of fragment.embeds){const a=managedAsset(e.data.asset);if(a)assets.set(assetKey(a),a as AssetManifest);}
 const collection=(root.data.metadata as any)?.collection;
 if(source)for(const a of Object.values(collection?.assets??{})){const ref=managedAsset(a);if(ref)assets.set(assetKey(ref),a as AssetManifest);}
 return {snapshot,fragment,source,collection,assets:[...assets.values()]};
}
export async function collectionOperation(request:CollectionRequest):Promise<any> {
 switch(request.action){
 case 'hash':return hash(new Uint8Array(await request.blob.arrayBuffer()));
 case 'prepare':return prepareCollectionDocument(request.blob,request.entry,request.plan);
 case 'native':return collectionNative(request.prepared,request.plan,request.document,request.assets);
 case 'inspect':{const {snapshot,source,assets}=inspectCollectionNative(request.native,request.cavernId);return {id:snapshot.resourceId,extension:source?.type==='mutable/html-source-block'?'html':'md',assets};}
 case 'project':{
  const {fragment,source,collection}=inspectCollectionNative(request.native,request.cavernId),images:Record<string,string>={},links:Record<string,string>={},diagnostics:string[]=[];
  for(const e of fragment.embeds){const a=managedAsset(e.data.asset),path=a&&request.assetPaths[assetKey(a)];if(path)images[e.localId]=relativeLink(request.path,path);}
  const definitions=new Map(fragment.definitions.map(d=>[d.localId,d]));
  for(const b of fragment.blocks)for(const p of b.inline?.properties??[]){const effective=p.target?.kind==='local'&&p.target.object==='definition'?definitions.get(p.target.id)??p:p;if(effective.type!=='codex/block-reference')continue;const id=(effective.attributes.metadata as any)?.documentId??(effective.target?.kind==='external'?effective.target.id:undefined),target=request.paths[id];if(target)links[p.localId]=relativeLink(request.path,target);else diagnostics.push('A document reference outside the selected export set was retained as text.');}
  if(source){
   // Source is authoritative. Its text is never replaced by a stale originalSource carrier.
   // Relative source links are reconciled in a sidecar and retained verbatim when safe rewriting cannot be established.
   const result=rewriteCollectionSource(String(source.data.text),source.type==='mutable/html-source-block'?'html':'markdown',collection,request.path,request.paths,request.assetPaths);
   return {text:result.text,diagnostics:[...diagnostics,...result.diagnostics]};
  }
  const result=exportFragment(fragment,'markdown','Document',false,{images,links,rootOnly:true});
  return {text:result.text,diagnostics:[...diagnostics,...result.diagnostics.map(d=>d.detail)]};
 }
 case 'zip':return packZip(request.members,collectionArchivePolicy);
 }
}
