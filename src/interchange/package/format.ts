import {WEB_BLOCK,webCapture,stableJson} from '../../web-resources/model';
import {imageType} from './image-validation';
export {imageType} from './image-validation';
import {ACADEMIC_BLOCK,academicCapture,storedProjection} from '../../academic/model';
import {STRUCTURED_BLOCK,structuredPayload} from '../../structured/model';
import {structuredText} from '../../structured/text';
import {captureAssets,resourceAssets,RESOURCE_TYPES,originalExtensions,validateOriginal,type OriginalMedia} from './resources';
import { bytes, hash, json, packZip, unpackZip, PACKAGE_LIMITS } from './archive';
import { decodeNative } from '../../persistence/native-resource';
import { managedAsset, assetKey, type ManagedAssetReference } from '../managed-asset';
import { validatePackageData, type PackageData } from './data';
export interface PackageAsset {reference:ManagedAssetReference;mediaType:OriginalMedia;bytes:Uint8Array}
export interface PackageMember {path:string;role:'document'|'original-asset'|'package-data'|'knowledge-schema';mediaType:string;bytes:number;sha256:string;reference?:ManagedAssetReference}
export interface PackageManifest {kind:'mutable-ink-package';version:1;profile:'mutable-inkpkg-passive-v1'|'mutable-inkpkg-resources-v1';entry:'resources/document.ink';source:{cavernId?:string;resourceId:string};members:PackageMember[];boundaries:string[]}
export function nativeInventory(snapshot:ReturnType<typeof decodeNative>,resources=true){
 const entities=new Set<string>(),claims=new Set<string>(),assets=new Map<string,ManagedAssetReference>();const unresolvedAssets:Array<{blockId:string;reason:string}>=[];let annotations=0,points=0;
 for(const c of Object.values(snapshot.contents)){
  if(resources&&c.viewType===WEB_BLOCK&&webCapture(c.payload.web)){assets.set(assetKey(c.payload.web.asset),c.payload.web.asset);const thumbnail=managedAsset(c.payload.webThumbnail);if(thumbnail)assets.set(assetKey(thumbnail),thumbnail);}
  if(resources&&c.viewType===ACADEMIC_BLOCK&&academicCapture(c.payload.academic))for(const a of captureAssets(c.payload.academic))assets.set(assetKey(a),a);
  if(resources&&RESOURCE_TYPES.includes(c.viewType)&&!c.payload.archive)for(const a of captureAssets(c.payload.citation??c.payload.article??c.payload.iiif??c.payload.pdf))assets.set(assetKey(a),a);
  const archive=(c.payload.archive??(c.payload.original as any)?.data?.archive) as any;if(resources&&archive?.version===1&&Array.isArray(archive.bindings))for(const pair of archive.bindings){const a=managedAsset(pair[1]);if(a)assets.set(assetKey(a),a);}
  const context=c.payload.packageContext as any;if(resources&&c.viewType==='mutable/package-data-block'&&Array.isArray(context?.assetBindings))for(const pair of context.assetBindings){const a=managedAsset(pair[1]);if(a)assets.set(assetKey(a),a);}
  const derivative=(c.payload.metadata as any)?.academicDerivative;if(resources&&managedAsset(derivative?.sourceAsset))assets.set(assetKey(derivative.sourceAsset),derivative.sourceAsset);for(const binding of (Array.isArray(c.payload.academicBindings)?c.payload.academicBindings:[]) as any[])if(resources&&managedAsset(binding.asset))assets.set(assetKey(binding.asset),binding.asset);
  const provenance=(c.payload.metadata as any)?.provenance;if(resources&&!archive&&provenance?.kind==='pdf-text-derivative'){const a=managedAsset(provenance.asset);if(a)assets.set(assetKey(a),a);}
  const collection=(c.payload.metadata as any)?.collection;
  const contribution=(c.payload.metadata as any)?.dialectic;if(contribution?.kind==='contribution'&&Array.isArray(contribution.attachments)&&contribution.attachments.length)unresolvedAssets.push({blockId:String(c.payload.id??c.key),reason:'Dialectic attachment references require the original Vault. This package preserves their descriptors but does not bundle or rebind their files; download attachments separately.'});
  if(c.viewType==='document-block'&&collection?.mode==='source'&&collection.assets&&Object.values(collection.assets).some(a=>!!managedAsset(a)))unresolvedAssets.push({blockId:String(c.payload.id??c.key),reason:'Collection source-bound attachments require Export collection. This package preserves their source/binding metadata but does not bundle or rebind those binaries.'});
  const a=managedAsset(c.payload.asset);if(a&&(resources||c.viewType!=='mutable/structured-resource-block'))assets.set(assetKey(a),a);else if(c.viewType==='image-cell')unresolvedAssets.push({blockId:String(c.payload.id??c.key),reason:'Unmanaged or unresolved image: original binary is not included; only its native descriptor is preserved.'});
  for(const p of [...(Array.isArray(c.payload.standoffProperties)?c.payload.standoffProperties:[]),...(Array.isArray(c.payload.blockProperties)?c.payload.blockProperties:[]),...Object.values((c.payload.linkedAnnotations??{}) as Record<string,any>)]){annotations++;if(p.isZeroWidth)points++;if(!p.isDeleted&&typeof p.value==='string'){if(['codex/entity-reference','codex/time-reference'].includes(p.type))entities.add(p.value);if(p.type==='codex/claim-reference')claims.add(p.value);}}
 }
 return {entities:[...entities],claims:[...claims],unresolvedAssets,assets:[...assets.values()],blocks:Object.values(snapshot.contents).filter(c=>!['text-cell','image-cell'].includes(c.viewType)).length,annotations,points};
}
export async function createPackage(native:Uint8Array,source:PackageManifest['source'],data:PackageData,schema:unknown,assets:PackageAsset[]){
 const snapshot=decodeNative(native);if(snapshot.resourceId!==source.resourceId||native.length>PACKAGE_LIMITS.native)throw Error('Native resource identity/size mismatch');validatePackageData(data);
 const members:Record<string,Uint8Array>={'resources/document.ink':native,'data/package-data.json':bytes(JSON.stringify(data)),'schemas/knowledge-schema.json':bytes(JSON.stringify(schema))};
 const manifest:PackageManifest={kind:'mutable-ink-package',version:1,profile:assets.some(a=>!['image/png','image/jpeg'].includes(a.mediaType))?'mutable-inkpkg-resources-v1':'mutable-inkpkg-passive-v1',entry:'resources/document.ink',source,members:[],boundaries:['Selected database slice only; see PackageDataBlock selection and exclusions.','Out-of-package references are unresolved. Source identities are archival evidence; imports allocate new identities.','Included IIIF information and retained tiles are a partial capture, not a complete offline manuscript. Rights and attribution remain in the exact originals; redistribution requires the exporter’s review.',...nativeInventory(snapshot).unresolvedAssets.map(v=>`${v.blockId}: ${v.reason}`)]};
 for(const [path,value]of Object.entries(members))manifest.members.push({path,role:path===manifest.entry?'document':path.startsWith('data/')?'package-data':'knowledge-schema',mediaType:'application/json',bytes:value.length,sha256:await hash(value)});
 for(const asset of assets){const digest=await hash(asset.bytes),path=`assets/sha256/${digest}.${originalExtensions[asset.mediaType]}`;await validateOriginal(asset.bytes,asset.mediaType,imageType);if(asset.reference.assetId!==`sha256:${digest}`)throw Error('Asset integrity/type mismatch');if(members[path])throw Error('Duplicate packaged binary');members[path]=asset.bytes;manifest.members.push({path,role:'original-asset',mediaType:asset.mediaType,bytes:asset.bytes.length,sha256:digest,reference:asset.reference});}
 for(const ref of resourceAssets(data))if(!assets.some(a=>assetKey(a.reference)===assetKey(ref)))manifest.boundaries.push('Missing retained original: '+assetKey(ref));
 members['manifest.json']=bytes(JSON.stringify(manifest));const result=packZip(members);await openPackage(result);return result;
}
export async function openPackage(input:Uint8Array){
 const members=unpackZip(input),manifestBytes=members.get('manifest.json');if(!manifestBytes||manifestBytes.length>PACKAGE_LIMITS.manifest)throw Error('Missing/oversized package manifest');
 const m=json(manifestBytes) as PackageManifest;if(m.kind!=='mutable-ink-package'||m.version!==1||!['mutable-inkpkg-passive-v1','mutable-inkpkg-resources-v1'].includes(m.profile)||m.entry!=='resources/document.ink'||!Array.isArray(m.boundaries)||m.boundaries.length>4096||m.boundaries.some(v=>typeof v!=='string'||v.length>16384)||!Array.isArray(m.members)||m.members.length!==members.size-1||typeof m.source?.resourceId!=='string')throw Error('Unsupported package manifest');
 const seen=new Set<string>(),roles=new Set<string>(),assets:PackageAsset[]=[];let assetBytes=0;
 for(const entry of m.members){const b=members.get(entry.path);if(!b||entry.path==='manifest.json'||seen.has(entry.path)||entry.bytes!==b.length||!/^[a-f0-9]{64}$/.test(entry.sha256)||await hash(b)!==entry.sha256)throw Error('Package member hash/length mismatch');seen.add(entry.path);
  if(entry.role==='original-asset'){
   const ref=managedAsset(entry.reference);if(!ref||ref.assetId!==`sha256:${entry.sha256}`||!(entry.mediaType in originalExtensions)||(m.profile==='mutable-inkpkg-passive-v1'&&!['image/png','image/jpeg'].includes(entry.mediaType))||entry.path!==`assets/sha256/${entry.sha256}.${originalExtensions[entry.mediaType as OriginalMedia]}`||b.length>50*1024*1024||(assetBytes+=b.length)>(m.profile==='mutable-inkpkg-passive-v1'?40*1024*1024:PACKAGE_LIMITS.assets)||assets.length>=(m.profile==='mutable-inkpkg-passive-v1'?20:PACKAGE_LIMITS.images))throw Error('Invalid package original asset');await validateOriginal(b,entry.mediaType,imageType);assets.push({reference:ref,mediaType:entry.mediaType as PackageAsset['mediaType'],bytes:b});
  }else{const expected={'document':'resources/document.ink','package-data':'data/package-data.json','knowledge-schema':'schemas/knowledge-schema.json'}[entry.role];if(!expected||entry.path!==expected||roles.has(entry.role)||b.length>PACKAGE_LIMITS.data||entry.mediaType!=='application/json')throw Error('Invalid/duplicate package role');roles.add(entry.role);}
 }
 if(roles.size!==3)throw Error('Incomplete package roles');
 const native=members.get(m.entry)!,snapshot=decodeNative(native),data=validatePackageData(json(members.get('data/package-data.json')!)),schema=json(members.get('schemas/knowledge-schema.json')!);
 if(snapshot.resourceId!==m.source.resourceId||schema?.kind!=='mutable-knowledge-schema'||schema.version!==1||!Array.isArray(schema.tables)||data.tables.some(t=>!schema.tables.some((s:any)=>s.name===t.name&&Array.isArray(s.columns)&&s.columns.map((c:any)=>c.name).join('\0')===t.columns.join('\0'))))throw Error('Package schema/native mismatch');
 for(const c of Object.values(snapshot.contents))if(c.viewType===WEB_BLOCK){const w=c.payload.web;if(!webCapture(w))throw Error('Invalid web capture');const original=assets.find(a=>assetKey(a.reference)===assetKey(w.asset));if(!original||original.mediaType!=='application/json')throw Error('Web original missing');const {parseWebBytes}=await import('../../web-resources/parse');const envelope=JSON.parse(new TextDecoder().decode(original.bytes));if(envelope.source!==w.source||envelope.capturedAt!==w.capturedAt||stableJson(parseWebBytes(original.bytes))!==stableJson(w.projection))throw Error('Web projection does not match retained source');}
 for(const c of Object.values(snapshot.contents))if(c.viewType===ACADEMIC_BLOCK){
  const capture=c.payload.academic;if(!academicCapture(capture))throw Error('Invalid academic capture');
  const original=assets.find(a=>assetKey(a.reference)===assetKey(capture.asset));if(!original)throw Error('Academic original missing');
  const associated=(capture.assets??[]).map(r=>assets.find(a=>assetKey(a.reference)===assetKey(r)));if(associated.some(a=>!a))throw Error('Academic associated source missing');
  const {parseAcademic}=await import('../../academic/parse');const rebuilt=storedProjection(parseAcademic(original.bytes,capture.format,capture.identity,associated.find(a=>a!.mediaType==='application/xml')?.bytes,associated.filter(a=>a!.mediaType==='application/json').map(a=>a!.bytes)));
  const canonical=(v:any)=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
  if(canonical(rebuilt)!==canonical(capture.projection))throw Error('Academic projection does not match immutable original');
 }
 for(const c of Object.values(snapshot.contents))if(c.viewType===STRUCTURED_BLOCK){const ref=managedAsset(c.payload.asset),a=ref&&assets.find(a=>assetKey(a.reference)===assetKey(ref));if(!structuredPayload(c.payload)||!a||structuredText(a.bytes).source!==c.payload.text)throw Error('Read-only resource source/original mismatch');}
 const inventory=nativeInventory(snapshot,m.profile==='mutable-inkpkg-resources-v1'),included=new Set(assets.map(a=>assetKey(a.reference)));for(const a of inventory.assets)if(!included.has(assetKey(a)))throw Error('Native asset missing from package');
 const dependencies=[...inventory.assets,...resourceAssets(data)];
 if(assets.some(a=>!dependencies.some(r=>assetKey(r)===assetKey(a.reference))))throw Error('Unreferenced package binary');
 const missing=resourceAssets(data).filter(a=>!included.has(assetKey(a)));if(m.profile==='mutable-inkpkg-resources-v1'&&missing.some(a=>!m.boundaries?.includes('Missing retained original: '+assetKey(a))))throw Error('Unreported missing resource original');
 return {manifest:m,snapshot,data,schema,assets,inventory};
}
