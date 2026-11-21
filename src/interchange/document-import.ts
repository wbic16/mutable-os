import {academicBlock} from '../academic/block';
import type {AcademicFormat} from '../academic/model';
import {structuredText} from '../structured/text';
import {STRUCTURED_BLOCK,presentation} from '../structured/model';
import { parse } from 'parse5';
import { parseClipboardHtml, type HtmlNode } from './html-ast';
import { importSemanticHtml } from './html-import';
import { importMarkdown } from './markdown-import';
import { plainFragment } from './serializer';
import { emptyFragment, validateFragment, type MutableFragment, type Reference } from './fragment';
import { diagnostic, type InterchangeDiagnostic } from './diagnostics';
import type { ImportFormat } from './formats';
import { imagesFragment } from './clipboard-images';
import { checkFiles, readSelectedFile, type SuppliedFile } from './file-input';

export function convertSource(source: string, format: 'html'|'markdown'|'text', fullDocument=false, baseUrl?:string) {
  const normalized=source.replace(/\r\n?/g,'\n');
  let result: {fragment?:MutableFragment;notice?:string}; let title: string|undefined;
  if (format==='markdown') result=importMarkdown(normalized,baseUrl);
  else if (format==='html') {
    // Apply the existing bounds before using parse5's full-document mode. Never
    // use a native carrier, DOMParser, <base>, or a charset tag as authority.
    const bounded=parseClipboardHtml(normalized);
    const tree=fullDocument ? parse(normalized) as HtmlNode : bounded.tree;
    if (fullDocument) {
      const html=tree.childNodes?.find(n=>n.tagName==='html'),head=html?.childNodes?.find(n=>n.tagName==='head');
      const node=head?.childNodes?.find(n=>n.tagName==='title');
      title=node?.childNodes?.filter(n=>n.nodeName==='#text').map(n=>n.value??'').join('').trim().slice(0,200);
      result=importSemanticHtml(html?.childNodes?.find(n=>n.tagName==='body')??tree,baseUrl);
    } else result=importSemanticHtml(tree,baseUrl);
  } else result={fragment:plainFragment(normalized)};
  const diagnostics:InterchangeDiagnostic[]=result.notice?[diagnostic('semantic-loss',result.notice)]:[];
  if (/\r/.test(source)) diagnostics.push(diagnostic('normalized-newlines','Source line endings become logical newlines in Ink.',false));
  // An empty file is a legitimate empty document; active-only HTML is not.
  if (!result.fragment && source.trim()) throw Error('The source contains no supported native content. Nothing was changed.');
  return {fragment:result.fragment??plainFragment(''),diagnostics,title};
}
export function joinFragments(inputs: MutableFragment[]): MutableFragment {
  const output=emptyFragment();
  inputs.forEach((input,index)=>{
    const f=structuredClone(input),id=(value:string)=>`part${index}-${value}`;
    const reference=(r?:Reference)=>{if(r?.kind==='local')r.id=id(r.id);};
    f.roots.forEach(r=>{r.placement=id(r.placement);r.openStart=false;r.openEnd=false;});
    f.blocks.forEach(b=>{b.localId=id(b.localId);b.children=b.children.map(id);b.relations=Object.fromEntries(Object.entries(b.relations).map(([k,v])=>[k,id(v)]));b.inline?.atoms.forEach(a=>{if(a.kind==='embed')a.embed=id(a.embed);});[...b.blockProperties,...b.inline?.properties??[]].forEach(p=>{p.localId=id(p.localId);reference(p.target);});});
    f.placements.forEach(p=>{p.localId=id(p.localId);reference(p.target);});
    f.definitions.forEach(d=>{d.localId=id(d.localId);reference(d.target);});
    f.embeds.forEach(e=>{e.localId=id(e.localId);reference(e.asset);});
    f.assets.forEach(a=>{a.localId=id(a.localId);});
    f.links.forEach(l=>{l.localId=id(l.localId);l.from.id=id(l.from.id);reference(l.to);});
    for(const table of ['roots','blocks','placements','definitions','embeds','assets','links'] as const)(output[table] as any[]).push(...f[table]);
  });
  return validateFragment(output);
}
export function documentFragment(fragment:MutableFragment,title:string,filename:string) {
  const f=structuredClone(fragment),id='document-'+crypto.randomUUID(),edge=id+'-edge';
  const page=id+'-page',pageEdge=page+'-edge';
  f.blocks.push({localId:page,type:'page-block',data:{},children:f.roots.map(r=>r.placement),relations:{},blockProperties:[]});
  f.placements.push({localId:pageEdge,kind:'owned',target:{kind:'local',object:'block',id:page}});
  f.blocks.push({localId:id,type:'document-block',data:{metadata:{title,interchange:{version:1,suggestedFilename:filename}}},children:[pageEdge],relations:{},blockProperties:[]});
  f.placements.push({localId:edge,kind:'owned',target:{kind:'local',object:'block',id}});
  f.roots=[{placement:edge,openStart:false,openEnd:false,clippedStart:false,clippedEnd:false}];return validateFragment(f);
}
export async function prepareFiles(files:SuppliedFile[],explicit?:ImportFormat) {
  checkFiles(files);
  const results=[];
  for(let index=0;index<files.length;index++) {
    const file=files[index],read=await readSelectedFile(file,explicit);
    const converted=read.format==='academic'?await academicFile(file,index,read.byteHash):read.format==='structured'?{fragment:structuredFragment(file.name,read.source,file.blob.type),diagnostics:[],title:undefined}:read.format==='png'||read.format==='jpeg'?{fragment:imagesFragment([file]),diagnostics:[],title:undefined}:convertSource(read.source,read.format,true);
    converted.fragment.assets.forEach(a=>{if(a.source.kind==='transfer')a.source.index=index;});
    if(read.format==='structured'){structuredText(new Uint8Array(await file.blob.arrayBuffer()));const b=converted.fragment.blocks[0];b.data.importFileIndex=index;Object.assign(b.data.structured as object,{encoding:read.encoding,bom:read.bom,byteHash:read.byteHash});}
    const title=read.title;
    results.push({fragment:converted.fragment,title,filename:read.filename,diagnostics:[...read.diagnostics,...converted.diagnostics].map(d=>({...d,sourceName:file.name})),provenance:{version:1,filename:file.name.split(/[\\/]/).at(-1)!,format:read.format,byteHash:read.byteHash,...('encoding' in read?{encoding:read.encoding,bom:read.bom}:{})}});
  }
  return results;
}

function structuredFragment(filename:string,text:string,mime:string){const f=emptyFragment();f.blocks=[{localId:'resource',type:STRUCTURED_BLOCK,data:{text,structured:{version:1,filename:filename.split(/[\\/]/).at(-1)!.slice(0,255),mime,presentation:presentation(filename)}},children:[],relations:{},blockProperties:[]}];f.placements=[{localId:'edge',kind:'owned',target:{kind:'local',object:'block',id:'resource'}}];f.roots=[{placement:'edge',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false}];return validateFragment(f);}

async function academicFile(file:SuppliedFile,index:number,byteHash:string){
 const bytes=new Uint8Array(await file.blob.arrayBuffer()),ext=file.name.split('.').at(-1)?.toLowerCase();let format:AcademicFormat|'ocr';
 if(ext==='epub')format='epub';else if(ext==='bib'||ext==='bibtex')format='bibtex';else if(ext==='ris')format='ris';else format='ocr';
 const {parseAcademic}=await import('../academic/parse');const projection=parseAcademic(bytes,format);if(projection.images)projection.images=projection.images.map(({bytes,...image})=>image) as any;const asset={kind:'managed' as const,cavernId:'pending',assetId:'sha256:'+byteHash};const capture={version:1 as const,kind:'deterministic' as const,snapshotId:crypto.randomUUID(),resourceId:asset.assetId,source:file.name.split(/[\\/]/).at(-1)!,endpoint:'local-file',retrievedAt:new Date().toISOString(),asset,format:projection.kind,projection};const {fragment}=academicBlock(capture);fragment.blocks[0].data.importFileIndex=index;
 return {fragment,title:projection.title,diagnostics:projection.diagnostics.map(d=>diagnostic('semantic-loss',d))};
}
