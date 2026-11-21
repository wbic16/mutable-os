import { prepareTeiDocument } from './tei/native';
import type { TeiLimits } from './tei/model';
import type {parseAcademic} from '../academic/parse';
import type {AcademicFormat} from '../academic/model';
import {parseStructured} from '../structured/parse';
import type {Presentation} from '../structured/model';
import {normalizeIIIF} from '../iiif/model';
import {collectionOperation,type CollectionRequest} from './collection/operations';
import type { AcquiredText } from './uri';
import { portableProjection } from './package/projection';
import { createPackage, openPackage, type PackageAsset, type PackageManifest } from './package/format';
import { packageFragment, materializePackage } from './package/native';
import type { PackageData } from './package/data';
import { compileSourcePreview } from './source-preview';
import { sourceFragment } from './source-block';
import { checkFiles, readSelectedFile } from './file-input';
import { prepareFiles, convertSource } from './document-import';
import { exportFragment } from './export-plan';
import { materializeFragment } from './materialize';
import type { SuppliedFile } from './file-input';
import type { ImportFormat, ExportFormat } from './formats';
import type { MutableFragment, InterchangeScope } from './fragment';
export type InterchangeRequest =
 | {kind:'tei-document';file:SuppliedFile;limits?:Partial<TeiLimits>;profile?:boolean;semanticSublimation?:boolean;operationalSemantics?:boolean;inlineAlternatives?:boolean}
 | {kind:'academic-parse';bytes:Uint8Array;format:AcademicFormat}
 | {kind:'structured-preview';source:string;format:Presentation}
 | {kind:'resource-iiif';bytes:Uint8Array}
 | {kind:'collection';request:CollectionRequest}
 | {kind:'linked-text';resource:AcquiredText;mode:'native'|'embed'|'link'}
 | {kind:'portable-export';fragment:MutableFragment;assets:PackageAsset[];format:'html'|'markdown';standalone?:boolean;title:string}
 | {kind:'package-create';native:Uint8Array;source:PackageManifest['source'];data:PackageData;schema:unknown;assets:PackageAsset[]}
 | {kind:'package-open';bytes:Uint8Array}
 | {kind:'package-materialize';fragment:MutableFragment;cavernId?:string;assets:[string,string][];context:{data:PackageData;schema:unknown;source:unknown;assetBindings?:Array<[string,import('./managed-asset').ManagedAssetReference]>}}
 | {kind:'files';files:SuppliedFile[];format?:ImportFormat}
 | {kind:'preview';source:string;format:'html'|'markdown'}
 | {kind:'embed';files:SuppliedFile[];format?:ImportFormat}
 | {kind:'convert';source:string;format:'html'|'markdown'}
 | {kind:'export';fragment:MutableFragment;format:ExportFormat;title?:string;document?:boolean}
 | {kind:'materialize';fragment:MutableFragment;scope:InterchangeScope;assets:[string,string][]};
export async function prepareInterchange(request:InterchangeRequest) {
 switch(request.kind){
  case 'tei-document':return prepareTeiDocument(request.file,request.limits,request.profile,request.semanticSublimation,request.operationalSemantics,request.inlineAlternatives);
  case 'academic-parse':return (await import('../academic/parse')).parseAcademic(request.bytes,request.format);
  case 'structured-preview':return parseStructured(request.source,request.format);
  case 'resource-iiif':return normalizeIIIF(request.bytes);
  case 'collection':return collectionOperation(request.request);
  case 'linked-text':return prepareLinkedText(request.resource,request.mode);
  case 'portable-export':return portableProjection(request.fragment,request.assets,request.format,request.standalone,request.title);
  case 'package-create':return createPackage(request.native,request.source,request.data,request.schema,request.assets);
  case 'package-open':{const result=await openPackage(request.bytes);return {...result,fragment:packageFragment(result.snapshot,result.manifest.source.cavernId)};}
  case 'package-materialize':return materializePackage(request.fragment,request.cavernId,request.assets,request.context);
  case 'preview':return compileSourcePreview(request.source,request.format);
  case 'embed':return prepareSourceFiles(request.files,request.format);
  case 'files':return prepareFiles(request.files,request.format);
  case 'convert':return convertSource(request.source,request.format);
  case 'export':return exportFragment(request.fragment,request.format,request.title,request.document);
  case 'materialize':return materializeFragment(request.fragment,request.scope,new Map(request.assets));
 }
}
export type Prepared<R extends InterchangeRequest> = R extends {kind:'tei-document'} ? Awaited<ReturnType<typeof prepareTeiDocument>> : R extends {kind:'academic-parse'} ? ReturnType<typeof parseAcademic> : R extends {kind:'structured-preview'} ? ReturnType<typeof parseStructured> : R extends {kind:'resource-iiif'} ? ReturnType<typeof normalizeIIIF> : R extends {kind:'collection'} ? Awaited<ReturnType<typeof collectionOperation>> : R extends {kind:'linked-text'} ? Awaited<ReturnType<typeof prepareLinkedText>> : R extends {kind:'portable-export'} ? Awaited<ReturnType<typeof portableProjection>> : R extends {kind:'package-create'} ? Uint8Array : R extends {kind:'package-open'} ? Awaited<ReturnType<typeof openPackage>>&{fragment:MutableFragment} : R extends {kind:'package-materialize'} ? ReturnType<typeof materializePackage> : R extends {kind:'preview'} ? ReturnType<typeof compileSourcePreview> : R extends {kind:'embed'} ? Awaited<ReturnType<typeof prepareSourceFiles>> : R extends {kind:'files'} ? Awaited<ReturnType<typeof prepareFiles>> : R extends {kind:'convert'} ? ReturnType<typeof convertSource> : R extends {kind:'export'} ? ReturnType<typeof exportFragment> : ReturnType<typeof materializeFragment>;

async function prepareSourceFiles(files:SuppliedFile[],format?:ImportFormat) {
 checkFiles(files);const fragments=[];
 for(const file of files){const read=await readSelectedFile(file,format);if(read.format!=='html'&&read.format!=='markdown')throw Error('Embed source accepts HTML or Markdown files only.');
 fragments.push(sourceFragment(read.format,read.source,{provenance:{version:1,filename:file.name.split(/[\\/]/).at(-1)!,encoding:read.encoding!,bom:read.bom!,byteHash:read.byteHash}}));}
 return fragments;
}

async function prepareLinkedText(resource:AcquiredText, mode:'native'|'embed'|'link') {
 const provenance={version:1,url:resource.url,format:resource.format,byteHash:resource.byteHash,encoding:'utf-8'};
 if(mode==='native') {const result=convertSource(resource.source,resource.format,true,resource.url);for(const b of result.fragment.blocks)b.data.metadata={...(b.data.metadata as Record<string,unknown>??{}),importedSource:provenance};return result;}
 if(resource.format==='text')throw Error('Source Blocks require HTML or Markdown.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(resource.source));
 const textHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 const sourceLink={...provenance,linkId:crypto.randomUUID(),textHash};
 return {fragment:sourceFragment(resource.format,resource.source,{provenance,...(mode==='link'?{sourceLink}:{})}),diagnostics:[]};
}
