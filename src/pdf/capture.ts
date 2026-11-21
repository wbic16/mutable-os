import {PDF_LIMITS,type PdfCapture} from './model';
import {managedAsset} from '../interchange/managed-asset';
const fields=(v:any,names:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
/** PDF-specific retained capture shape. This is not evidence of authority;
 * canonical snapshot lookup and original verification remain host operations. */
export function checkedPdfCapture(value:unknown):PdfCapture {
 const v=value as PdfCapture;
 if(!fields(v,['version','kind','snapshotId','identityId','entityId','resourceId','sourceUrl','endpoint','retrievedAt','asset','inspection'])||v.version!==1||v.kind!=='pdf')throw Error('Invalid retained PDF capture');
 for(const id of [v.snapshotId,v.identityId,v.entityId,v.resourceId])if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid PDF capture identity');
 if(!fields(v.asset,['kind','cavernId','assetId'])||!managedAsset(v.asset)||v.asset.cavernId.length>1024)throw Error('Invalid PDF original reference');
 for(const value of [v.sourceUrl,v.endpoint]){if(typeof value!=='string'||value.length>4096)throw Error('Invalid PDF provenance URL');const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)throw Error('Invalid PDF provenance URL');}
 if(typeof v.retrievedAt!=='string'||v.retrievedAt.length>40||!Number.isFinite(Date.parse(v.retrievedAt)))throw Error('Invalid PDF capture time');
 const i=v.inspection;if(!fields(i,['kind','pages','label','version'])||i.kind!=='pdf-inspection'||!Number.isInteger(i.pages)||i.pages<1||i.pages>PDF_LIMITS.pages||typeof i.label!=='string'||i.label.length>1000||typeof i.version!=='string'||!i.version.length||i.version.length>80)throw Error('Invalid PDF inspection');
 return v;
}
export function samePdfCapture(a:unknown,b:unknown){
 const key=(v:PdfCapture)=>JSON.stringify([v.version,v.kind,v.snapshotId,v.identityId,v.entityId,v.resourceId,v.sourceUrl,v.endpoint,v.retrievedAt,v.asset.kind,v.asset.cavernId,v.asset.assetId,v.inspection.kind,v.inspection.pages,v.inspection.label,v.inspection.version]);
 if(key(checkedPdfCapture(a))!==key(checkedPdfCapture(b)))throw Error('Retained PDF capture differs from the source occurrence');
}
