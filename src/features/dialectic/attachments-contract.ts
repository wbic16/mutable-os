import {managedAsset,type ManagedAssetReference} from '../../interchange/managed-asset';

export const attachmentLimits={count:8,fileBytes:100000000,totalBytes:100000000,largeBytes:10000000,textBytes:200000,totalTextBytes:400000,pdfPages:100,artifactCharacters:60000} as const;
export const attachmentSize=(bytes:number)=>bytes>=1000000?`${(bytes/1000000).toFixed(2)} MB`:bytes>=1000?`${(bytes/1000).toFixed(1)} kB`:`${bytes} bytes`;
/** The local retention limit is separate from provider request limits. */
export function attachmentProviderProblem(provider:'openai'|'anthropic',files:readonly Pick<Attachment,'mediaType'|'byteLength'>[]):string|undefined {
 if(provider==='anthropic'&&files.some(f=>f.mediaType.startsWith('image/')&&f.byteLength>5*1024*1024))return 'Claude accepts images up to 5 MiB each. Choose a smaller image for this request; the original remains available to download.';
 const pdfBytes=files.filter(f=>f.mediaType==='application/pdf').reduce((n,f)=>n+f.byteLength,0);
 if(provider==='openai'&&pdfBytes>=50000000)return 'OpenAI accepts less than 50 MB of PDF inputs per request. Split or reduce the selected PDFs to use this provider.';
 // Base64 adds one third to the first-party Claude 128 MB request budget.
 const encoded=files.reduce((n,f)=>n+(['application/pdf','image/png','image/jpeg'].includes(f.mediaType)?4*Math.ceil(f.byteLength/3):f.byteLength),0);
 if(provider==='anthropic'&&encoded>126000000)return 'These attachments exceed Claude’s 128 MB request limit after encoding. Split or reduce the selected files to use this provider.';
}
export const attachmentExtensions=['pdf','png','jpg','jpeg','txt','md','markdown','csv','tsv','json','xml','html','htm','yaml','yml','js','ts','tsx','jsx','py','css','sql','log'] as const;
export const attachmentAccept=attachmentExtensions.map(ext=>'.'+ext).join(',');
export interface Attachment {
 version:1;id:string;asset:ManagedAssetReference;name:string;mediaType:string;byteLength:number;
 origin:'user'|'agent';createdUtc:string;
}
export function attachmentName(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||value.length>200||/[\u0000-\u001f\u007f/\\]/.test(value)||value==='.'||value==='..')throw Error('Invalid attachment filename');
 return value;
}
export function attachments(value:unknown):Attachment[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>attachmentLimits.count)throw Error('Attach at most eight files per contribution');
 let bytes=0;const ids=new Set<string>();
 return value.map(v=>{
  if(v?.version!==1||typeof v.id!=='string'||!/^[-a-zA-Z0-9]{1,128}$/.test(v.id)||ids.has(v.id)||!managedAsset(v.asset)||!['user','agent'].includes(v.origin)||typeof v.createdUtc!=='string'||!Number.isFinite(Date.parse(v.createdUtc))||!['application/pdf','image/png','image/jpeg','text/plain','application/json'].includes(v.mediaType)||!Number.isSafeInteger(v.byteLength)||v.byteLength<1||v.byteLength>attachmentLimits.fileBytes||(bytes+=v.byteLength)>attachmentLimits.totalBytes)throw Error('Invalid or oversized attachment manifest');
  ids.add(v.id);return {version:1,id:v.id,asset:{kind:'managed',cavernId:v.asset.cavernId,assetId:v.asset.assetId},name:attachmentName(v.name),mediaType:v.mediaType,byteLength:v.byteLength,origin:v.origin,createdUtc:v.createdUtc};
 });
}
export const createAttachmentTool={name:'create_attachment',description:'Create a real downloadable file for the current response. Use only when the user requests a file. Supply complete UTF-8 content for txt, md, csv, json, html, or plain text to render as pdf. PDF is a paginated text document, not HTML/Markdown rendering. The host retains exact output bytes and shows a download card. Do not invent download URLs or sandbox paths. Call before writing the final DCP response; mention the returned filename in ordinary prose.',parameters:{type:'object',properties:{filename:{type:'string',maxLength:200},format:{type:'string',enum:['txt','md','csv','json','html','pdf']},content:{type:'string',minLength:1,maxLength:attachmentLimits.artifactCharacters}},required:['filename','format','content'],additionalProperties:false}};
