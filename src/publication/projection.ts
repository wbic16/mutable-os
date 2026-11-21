import {navigation,type DirectoryProjectionContext} from './directory';
import {relativeLink} from '../interchange/collection/plan';
/** Pure publication projection. All source/retained metadata is discarded before HTML export. */
import {decodeNative} from '../persistence/native-resource';
import {packageFragment} from '../interchange/package/native';
import {emptyFragment,type MutableFragment,type FragmentBlock} from '../interchange/fragment';
import {exportFragment,escapeHtml} from '../interchange/export-plan';
import {managedAsset,type ManagedAssetReference} from '../interchange/managed-asset';
import {isSourceType,sourceFormat} from '../interchange/source-block';
import {convertSource} from '../interchange/document-import';
import {rewriteCollectionSource} from '../interchange/collection/source-export';
import type {PublicationProfile} from '../application-services/publication-contracts';
import {PUBLICATION_CSP} from './policy';
import {readerPage,escapePublic} from './shell';
import {searchEntry,type SearchEntry} from './search';
import type {SemanticTarget,SemanticOccurrence,ResearchBundle} from './research';
export interface Projection {html:string;text:string;diagnostics:string[];assets:Array<{reference:ManagedAssetReference;path:string}>;omittedAnnotations:number;omittedBlocks:number;targets:SemanticTarget[];occurrences:SemanticOccurrence[];headings:string[];search?:SearchEntry}
const formats=new Set(['style/bold','style/italics','style/underline','style/strike','style/strikethrough','style/superscript','style/subscript']);
const containers=new Set(['side-block','document-block','container-block','book-block','page-block','left-margin-block','right-margin-block','indented-list-block','table-block','grid-block','table-row-block','grid-row-block','table-cell-block','grid-cell-block']);
export function publicProjection(native:Uint8Array,profile:PublicationProfile,cavernId:string,directory?:DirectoryProjectionContext,alias?:(id:string)=>string,research?:ResearchBundle,inspectFrozen=false):Projection {
 if(native.length>8*1024*1024)throw Error('Publication native input exceeds 8 MiB');
 const canonical=new Map<string,string>(),snapshot=decodeNative(native);
 const targets:SemanticTarget[]=[],occurrences:SemanticOccurrence[]=[],headings:string[]=[],semanticLinks=new Map<string,string>();
 const source=packageFragment(snapshot,cavernId,(local,original)=>canonical.set(local,original)),f=emptyFragment(),notes=new Set<string>(),assets:Projection['assets']=[];
 const rootTarget=source.placements.find(p=>p.localId===source.roots[0].placement)?.target;
 let collection=(source.blocks.find(b=>rootTarget?.kind==='local'&&b.localId===rootTarget.id)?.data.metadata as any)?.collection;
 const links:Record<string,string>={},anchors=new Map<string,string>(),pending:Array<{id:string;target:string}>=[],routes:Record<string,string>=Object.assign(Object.create(null),Object.fromEntries(directory?.pages.map(p=>[p.resourceId,p.route])??[])),markers=new Map<string,string>();
 if(collection&&Array.isArray(collection.bindings)){
  const bindings=collection.bindings;
  collection={...collection,bindings:bindings.filter((b:any)=>{const same=bindings.filter((v:any)=>v.url===b.url&&v.wiki===b.wiki&&v.image===b.image),ambiguous=same.some((v:any)=>v.id!==b.id||v.path!==b.path);if(ambiguous)notes.add('Ambiguous imported source binding retained as text.');return !ambiguous;})};
 }
 let serial=0,omittedAnnotations=0,omittedBlocks=0;const id=()=>`p${++serial}`;
 const append=(input:MutableFragment,edge:string,parent?:FragmentBlock,depth=0,stack=new Set<string>())=>{
  if(depth>64||serial>50000)throw Error('Publication traversal limit');
  const placement=input.placements.find(p=>p.localId===edge),targetId=placement?.target.kind==='local'?placement.target.id:undefined,original=input.blocks.find(b=>b.localId===targetId);
  if(!original||placement?.kind==='reference'||stack.has(original.localId)){notes.add('External, repeated or reference Blocks are omitted; no linked content was acquired.');omittedBlocks++;return;}
  if(original.type==='surface-block'){omittedBlocks++;notes.add('Reverse faces and their metadata are excluded from publication.');if(original.children[0])append(input,original.children[0],parent,depth+1,new Set([...stack,original.localId]));return;}
  if(original.type==='mutable/package-data-block'){omittedBlocks++;return;}
  if(isSourceType(original.type)){
   const text=String(original.data.text??'');if(text.length>200000)throw Error('Source Block exceeds conversion limit');
   const format=sourceFormat(original.type,original.data),paths:Record<string,string>={},references=new Map<string,ManagedAssetReference>();
   for(const binding of Array.isArray(collection?.bindings)?collection.bindings:[]){const ref=binding.image&&managedAsset(collection?.assets?.[binding.path]);if(ref){const url=`assets/${ref.assetId.slice(7)}`;paths[`${ref.cavernId}/${ref.assetId}`]=url;references.set(url,ref);}}
   if(format==='markdown'&&/^---\r?\n/.test(text))notes.add('Markdown frontmatter may appear as reading text; review its contents before publication.');
   const rewritten=collection?rewriteCollectionSource(text,format,collection,'document.md',routes,paths,directory?(route=>{const marker=`https://publication.invalid/${markers.size}`;markers.set(marker,route);return marker;}):undefined):undefined;
   rewritten?.diagnostics.forEach(d=>notes.add(d));
   const converted=convertSource(rewritten?.text??text,format);converted.diagnostics.forEach(d=>notes.add(d.detail));
   for(const embed of converted.fragment.embeds){const ref=references.get(String(embed.data.relativeSource??''));if(ref)embed.data.asset={...ref};}
   notes.add(directory?'Source Blocks use semantic conversion; authored source, CSS and inactive annotations are not published. Only exact imported document/image bindings are resolved.':'Source Blocks use semantic conversion; authored source, CSS and inactive annotations are not published. Only exact imported image bindings are resolved; other relative references remain inert.');
   converted.fragment.roots.forEach(r=>append(converted.fragment,r.placement,parent,depth+1));return;
  }
  const textBlock=['standoff-editor-block','plain-text-block'].includes(original.type);
  if(!textBlock&&!containers.has(original.type)){omittedBlocks++;notes.add('Unsupported Blocks (including legacy HTML and video) are omitted.');return;}
  const b:FragmentBlock={localId:id(),type:['page-block','left-margin-block','right-margin-block'].includes(original.type)?'container-block':original.type,data:{},blockProperties:[],children:[],relations:{}};
  if((directory||profile.reader)&&alias&&input===source&&canonical.has(original.localId)&&!['table-row-block','grid-row-block','table-cell-block','grid-cell-block'].includes(b.type)){b.localId=alias(snapshot.resourceId+'\0'+canonical.get(original.localId));if([...anchors.values()].includes(b.localId))throw Error('Public anchor collision');anchors.set(original.localId,b.localId);}
  const e=id();f.blocks.push(b);f.placements.push({localId:e,kind:'owned',target:{kind:'local',object:'block',id:b.localId}});
  if(parent)parent.children.push(e);else f.roots.push({placement:e,openStart:false,openEnd:false,clippedStart:false,clippedEnd:false});
  const meta=original.data.metadata as any??{},clean:any={};
  if(Number.isInteger(meta.htmlHeadingLevel)&&meta.htmlHeadingLevel>=1&&meta.htmlHeadingLevel<=6)clean.htmlHeadingLevel=meta.htmlHeadingLevel;
  if(meta.htmlPreformatted===true)clean.htmlPreformatted=true;
  for(const name of ['htmlList','htmlListItem','htmlTableCell'])if(meta[name]&&typeof meta[name]==='object'){
   clean[name]={};for(const key of ['ordered','reversed','header','start','value','colSpan','rowSpan'])if(typeof meta[name][key]==='boolean'||Number.isSafeInteger(meta[name][key]))clean[name][key]=meta[name][key];
  }
  b.data.metadata=clean;
  for(const p of original.blockProperties)if(p.type==='block/font/size'&&/^h[1-6]$/.test(String(p.attributes.value)))clean.htmlHeadingLevel=Number(String(p.attributes.value).slice(1));else if(/^block\/font\/size\/h[1-4]$/.test(p.type))b.blockProperties.push({localId:id(),type:p.type,attributes:{}});else omittedAnnotations++;
  if(textBlock){
   b.inline={atoms:[],properties:[]};const atoms=original.inline?.atoms??[{kind:'text' as const,text:String(original.data.text??'')}];
   for(const atom of atoms){
    if(atom.kind==='text'){b.inline.atoms.push({kind:'text',text:atom.text});continue;}
    if(atom.kind==='alternative')throw Error('Publishing native inline alternatives requires an explicit reading projection; nothing was published.');
    const embed=input.embeds.find(v=>v.localId===atom.embed),ref=managedAsset(embed?.data.asset);
    if(profile.images&&ref){
     if(ref.cavernId!==cavernId)throw Error('A published image belongs to another Cavern');
     const localId=id(),path=`assets/${ref.assetId.slice(7)}`;
     b.inline.atoms.push({kind:'embed',embed:localId});f.embeds.push({localId,type:'image-cell',data:{alt:typeof embed?.data.alt==='string'?embed.data.alt:'Image'}});
     assets.push({reference:ref,path});(f.embeds.at(-1)!.data as any).publicationPath=path;
    }else{const localId=id();b.inline.atoms.push({kind:'embed',embed:localId});f.embeds.push({localId,type:'image-cell',data:{alt:profile.images&&typeof embed?.data.alt==='string'?embed.data.alt:'omitted'}});notes.add('Unapproved or unavailable image descriptors remain inert placeholders; nothing is fetched.');}
   }
   if(clean.htmlHeadingLevel||b.blockProperties.some(p=>/^block\/font\/size\/h/.test(p.type)))headings.push(atoms.filter(a=>a.kind==='text').map(a=>(a as {text:string}).text).join(''));
   for(let p of original.inline?.properties??[]){
    if(p.target?.kind==='local'&&p.target.object==='definition'){const target=p.target.id,d=input.definitions.find(d=>d.localId===target);if(d)p={...p,type:d.type,attributes:d.attributes,target:d.target};}
    // A selected frozen archive may supply known semantic identities for explicit
    // publication review. Never activate its native annotations or unknown types.
    if(p.type==='mutable/opaque-property'&&(inspectFrozen||profile.reader?.research?.source.kind==='frozen')){
     const retained=p.attributes.original as any,definition=retained?.data?.mutableLinkedDefinition,authored=definition??retained;
     if(authored&&['codex/entity-reference','codex/time-reference','codex/claim-reference'].includes(authored.type)){
      const attrs=definition?authored.attributes:authored.data,target=authored.target;
      if(attrs&&typeof attrs==='object'&&(!target||target.kind==='external'&&target.object==='entity'&&typeof target.id==='string'&&target.source&&typeof target.source==='object')){
       p={...p,type:authored.type,attributes:attrs,target};notes.add('Known archival references are eligible only through the selected frozen context and individual disclosure review; native annotations remain inactive.');
      }
     }
    }
    if(['codex/entity-reference','codex/time-reference','codex/claim-reference'].includes(p.type)){
     const kind=p.type==='codex/claim-reference'?'claim':p.type==='codex/time-reference'?'time':'entity',target=p.target?.kind==='external'?p.target.id:typeof p.attributes.value==='string'?p.attributes.value:undefined;
     if(target){const anchor=anchors.get(original.localId),sourceVault=p.target?.kind==='external'?p.target.source.cavernId:undefined;targets.push({kind,id:target,...sourceVault?{sourceVault}:{},...anchor?{anchor}:{}});
      const binding=research?.bindings.find(b=>b.resourceId===snapshot.resourceId&&b.kind===kind&&b.id===target),entry=binding&&research?.entries.find(e=>e.key===binding.key);
      if(entry){occurrences.push({key:entry.key,...anchor?{anchor}:{}});const url=relativeLink(profile.route,`entities/${entry.key}.html`);semanticLinks.set(url,entry.name);
       if(!p.isZeroWidth){const localId=id();b.inline.properties.push({localId,type:'reference/url',startIndex:p.startIndex,endIndex:p.endIndex,isZeroWidth:false,attributes:{}});links[localId]=url;}else notes.add('Point semantics are listed as static document references; editor-only glyphs are not reproduced.');
       continue;
      }
     }
     omittedAnnotations++;continue;
    }
    if(!p.isZeroWidth&&formats.has(p.type))b.inline.properties.push({localId:id(),type:p.type,startIndex:p.startIndex,endIndex:p.endIndex,isZeroWidth:false,attributes:{}});
    else if(!p.isZeroWidth&&directory&&p.type==='codex/block-reference'){
     const localId=id(),documentId=(p.attributes.metadata as any)?.documentId??(p.target?.kind==='external'&&p.target.object==='block'?p.target.id:undefined);
     b.inline.properties.push({localId,type:p.type,startIndex:p.startIndex,endIndex:p.endIndex,isZeroWidth:false,attributes:{}});
     if(p.target?.kind==='local'&&p.target.object==='block')pending.push({id:localId,target:p.target.id});
     else if(typeof documentId==='string'&&routes[documentId]&&p.target?.kind==='external'&&p.target.id===documentId)links[localId]=relativeLink(directory.route,routes[documentId]);
     else {omittedAnnotations++;notes.add(typeof documentId==='string'&&routes[documentId]?'Cross-document Block target retained as text: an exact published anchor is not established.':'Document target is outside the approved route map; existence is not checked and no destination is inferred.');}
    }else if(!p.isZeroWidth&&directory&&p.type==='reference/url'&&p.target?.kind==='url'&&markers.has(p.target.url)){
     const localId=id();b.inline.properties.push({localId,type:'reference/url',startIndex:p.startIndex,endIndex:p.endIndex,isZeroWidth:false,attributes:{}});links[localId]=relativeLink(directory.route,markers.get(p.target.url)!);
    }else if(!p.isZeroWidth&&profile.outboundLinks&&p.type==='reference/url'&&p.target?.kind==='url'&&/^https?:\/\//i.test(p.target.url)&&!/[\u0000-\u0020]/.test(p.target.url)){
     let url:URL;try{url=new URL(p.target.url);}catch{omittedAnnotations++;notes.add('Malformed outbound URL omitted.');continue;}if(url.username||url.password){omittedAnnotations++;continue;}
     notes.add(`Public outbound URL: ${url.href}`);b.inline.properties.push({localId:id(),type:'reference/url',startIndex:p.startIndex,endIndex:p.endIndex,isZeroWidth:false,attributes:{},target:{kind:'url',url:url.href}});
    }else omittedAnnotations++;
   }
  }
  const next=new Set(stack).add(original.localId);original.children.forEach(c=>append(input,c,b,depth+1,next));
  const relations=Object.entries(original.relations);
  for(const [name,relation] of relations)if(profile.includeMargins&&/^(left|right)[-_/ ]?margin$/i.test(name))append(input,relation,b,depth+1,next);else {omittedBlocks++;notes.add('Non-reading owned relations and unapproved margins are omitted.');}
 };
 append(source,source.roots[0].placement);
 if(!f.roots.length)throw Error('No supported public reading content');
 for(const p of pending){const anchor=anchors.get(p.target);if(anchor)links[p.id]='#'+anchor;else{omittedAnnotations++;notes.add('Excluded or unsupported Block target retained as text.');}}
 if(research)for(const block of f.blocks)if(block.inline){const ranges:Array<[number,number]>=[];block.inline.properties=block.inline.properties.filter(p=>{
  if(!links[p.localId]&&p.target?.kind!=='url')return true;
  if(ranges.some(([start,end])=>p.startIndex<end&&p.endIndex>start)){omittedAnnotations++;notes.add('Overlapping links use one inline destination; all approved semantic targets remain in the reviewed-reference list.');return false;}
  ranges.push([p.startIndex,p.endIndex]);return true;
 });}
 const images=Object.fromEntries(f.embeds.filter(e=>typeof e.data.publicationPath==='string').map(e=>[e.localId,(directory?'../'.repeat(directory.route.split('/').length-1):'')+String(e.data.publicationPath)]));
 const body=exportFragment(f,'html',profile.title,false,{images,links}),plain=exportFragment(f,'text');body.diagnostics.forEach(d=>notes.add(d.code==='image-reference'?'Unavailable images remain alt-text placeholders; approved originals are included.':d.detail));
 notes.add('Retained definitions, annotation identities, PackageData, source metadata and native files are excluded.');
 if(assets.length)notes.add('Images retain original bytes, including any embedded private metadata.');
 if(profile.outboundLinks)notes.add('Reviewed outbound URLs may disclose their paths and query parameters when followed.');
 // Strip traversal counters; only publication-local identity-derived anchors survive.
 let content=body.text.replace(/ id="p\d+"/g,'');
 if(semanticLinks.size){notes.add('Reviewed semantic references use static links; editor SVG styling is approximated.');
  if(profile.reader?.popovers)for(const [url,name]of semanticLinks)content=content.split(`<a href="${escapePublic(url)}">`).join(`<a data-reader-detail="${escapePublic(name)}" href="${escapePublic(url)}">`);
  content+=`<section aria-label="Reviewed references"><h2>Reviewed references</h2><ul>${[...semanticLinks].map(([url,name])=>`<li><a href="${escapePublic(url)}"${profile.reader?.popovers?` data-reader-detail="${escapePublic(name)}"`:''}>${escapePublic(name)}</a></li>`).join('')}</ul></section>`;
 }

 const html=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PUBLICATION_CSP}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(profile.title)}</title><link rel="stylesheet" href="${directory?relativeLink(directory.route,'reader.css'):'reader.css'}"></head><body><main>${directory?navigation(directory):''}<h1>${escapeHtml(profile.title)}</h1>${content}</main></body></html>\n`;
 return {html:profile.reader?readerPage(profile,profile.route,profile.title,(directory?navigation(directory):'')+content):html,text:plain.text,diagnostics:[...notes].sort(),assets,omittedAnnotations,omittedBlocks,targets,occurrences,headings,...profile.reader?.search?{search:searchEntry(profile.route,profile.title,plain.text,headings)}:{}};
}
