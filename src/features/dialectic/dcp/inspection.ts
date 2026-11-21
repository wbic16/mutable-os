import {permits} from './vocabulary-contract';
import {retainedPdfsEnabled} from './retained-pdfs';
import {passiveVideo} from '../../../interchange/uri';
import {managedAsset} from '../../../interchange/managed-asset';
import {managedImagesEnabled} from './managed-images';
import type {DcpSources} from './sources';
import type {BlockNode} from '../../../block-tree/types';
import {standoffStyleSchemas} from '../../../rendering/standoff-styles';

const limits={nodes:24,depth:4,properties:32,relations:12,bytes:16000,string:1024} as const;
const scalar=(value:unknown)=>typeof value==='string'?value.slice(0,limits.string):typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null?value:undefined;
const fields=(input:any,names:readonly string[])=>Object.fromEntries(names.filter(name=>input&&scalar(input[name])!==undefined).map(name=>[name,scalar(input[name])]));
const logical=(type:string)=>({'sticky-note-block':'sticky-note','timer-block':'timer','3d-object-block':'object3d','canvas-block':'canvas-preview','standoff-editor-block':'text','grid-block':'grid','grid-row-block':'row','grid-cell-block':'cell','table-block':'table','table-row-block':'row','table-cell-block':'cell','tab-row-block':'tabs','document-tab-row-block':'pages','tab-block':'panel','document-tab-block':'page-tab','page-block':'page','left-margin-block':'margin','right-margin-block':'margin','surface-block':'surface','side-block':'side','indented-list-block':'list','checkbox-block':'task','youtube-video-block':'youtube','standoff-code-block':'code','mutable/markdown-source-block':'source','mutable/html-source-block':'source'}[type]??'native');

/** Explicit read only. A bounded projection, never DTO export or clone input. */
export async function inspectNative(sources:DcpSources,initial:any){
 let count=0,bytes=0;const seen=new Set<string>(),omissions=new Set<string>();
 const result:any={version:1,lossless:false,limits,scalarPolicy:'Strings are bounded to 1024 characters; detailed source text remains in read_source.text. Unsupported metadata/attributes are omitted, not round-tripped.',root:null,omissions:[]};
 const visit=async(source:any,depth:number):Promise<any>=>{
  sources.check();if(++count>limits.nodes)return null;
  if(!source.handle||!['block','contribution'].includes(source.kind))return null;
  const target=sources.target(source.handle),resolved=sources.resolve(target);
  if(resolved.status!=='resolved'||!resolved.node||source.status==='unauthorized')return null;
  const node:BlockNode=resolved.node; sources.fence(node.contentKey);
  const meta=node.payload.metadata as any,properties=(node.payload.blockProperties??[]) as any[],marks=(node.payload.standoffProperties??[]) as any[];
  const entry:any={handle:source.handle,revision:source.revision??null,nativeId:node.payload.id,nativeType:node.viewType,kind:logical(node.viewType),text:typeof source.text==='string'?source.text.slice(0,limits.string):null,configuration:fields(meta,['orientation','name','text','surfaceRole','structuralContainer','height','width','listCollapsed','htmlHeadingLevel','htmlPreformatted']),properties:[],annotations:[],children:[],ownedRelations:[],omissions:[]};
  if(typeof source.text==='string'&&source.text.length>limits.string)entry.omissions.push('Text truncated; read this TextBlock directly for exact source authority');
  for(const [name,allowed]of Object.entries({htmlList:['ordered','start','reversed'],htmlListItem:['value'],htmlTableCell:['header','rowSpan','colSpan'],markdownCode:['language']}))if(meta?.[name])entry.configuration[name]=fields(meta[name],allowed);
  if(typeof node.payload.checked==='boolean')entry.configuration.checked=node.payload.checked;
  if(node.viewType==='checkbox-block')entry.configuration.checked=node.payload.checked===true;
  if(node.viewType==='container-block'&&meta?.htmlListItem)entry.kind='list-item';
  if(['table-block','grid-block'].includes(node.viewType)){
   entry.configuration.rowCount=node.children.length;
   if(meta?.tableColumns){entry.configuration.tableColumns={version:scalar(meta.tableColumns.version),weights:Array.isArray(meta.tableColumns.weights)?meta.tableColumns.weights.slice(0,16).map(scalar):null,rendered:false};if(meta.tableColumns.weights?.length>16)entry.omissions.push('Column weight count limit');}
  }
  if(meta?.htmlTableCell&&(meta.htmlTableCell.colSpan>1||meta.htmlTableCell.rowSpan>1))entry.omissions.push('Retained span metadata is not rendered as merged cells');
  if(node.viewType==='side-block'){const parent=sources.parent(node.key);if(parent?.viewType==='surface-block'){const index=parent.children.indexOf(node.key);entry.configuration.surfaceRole=index===0?'front':index===1?'back':'additional';}}
  if(node.viewType==='left-margin-block'||node.viewType==='right-margin-block')entry.configuration.side=node.viewType==='left-margin-block'?'left':'right';
  if(['tab-row-block','document-tab-row-block'].includes(node.viewType)||node.viewType==='surface-block'&&sources.editor.features.reversibleBlocks)entry.navigation={scope:'occurrence',persistent:false};
  if(node.viewType==='sticky-note-block'){
   entry.configuration.note={...fields(meta,['fontStep']),size:fields(meta?.size,['width','height'])};
   entry.stateSemantics={authored:'content and dimensions',presentation:'local scrolling',appearance:'fixed yellow paper; colour/material metadata does not select rendered variants'};
  }
  if(node.viewType==='timer-block'){
   entry.configuration.timer=fields(node.payload.timer,['durationSeconds','mode']);
   entry.stateSemantics={nativeFeatureEnabled:sources.editor.features.timer===true,authored:'duration and dimensions',operational:'Start/Pause/Reset are occurrence-local when protected; editable timers retain native persisted controls',resetOnUnmount:true};
  }
  if(node.viewType==='3d-object-block'){
   const object=node.payload.object3D as any;entry.configuration.object3d={...fields(object,['version','scene','lighting','autoRotate']),view:fields(object?.view,['azimuth','elevation']),settings:fields(object?.settings,['steam','coffeeStain'])};
   entry.stateSemantics={nativeFeatureEnabled:sources.editor.features.threeDObjects===true,authored:'scene, initial view, lighting, rotation, settings and dimensions',presentation:'protected orbit/presets/rotation are local to this occurrence',graphics:'WebGL 2 or native fallback'};
  }
  if(node.viewType==='canvas-block')entry.stateSemantics={authored:'native preview Block',presentation:'demonstration boxes are local and not persisted',limitation:'not an authored spatial canvas'};
  if(node.viewType==='standoff-code-block')entry.configuration.language=scalar(meta?.markdownCode?.language??'javascript');
  if(node.viewType==='mutable/markdown-source-block'||node.viewType==='mutable/html-source-block'){entry.configuration.sourceFormat=fields(node.payload.sourceFormat,['version','format','profile']);entry.literal=true;}
  for(const p of properties.slice(0,limits.properties)){
   const item:any=fields(p,['id','type','isDeleted']);
   if(typeof p.type==='string'&&p.type.startsWith('block/')){item.value=scalar(p.value);item.metadata=fields(p.metadata,['width','height','min-width','position','x','y','top','right','bottom','left']);}
   else item.omission='Property details require a native domain adapter';
   entry.properties.push(item);
  }
  for(const p of marks.slice(0,limits.properties)){
   const item:any=fields(p,['id','type','start','end','isDeleted']);
   const style=standoffStyleSchemas[p.type];
   if(style){Object.assign(item,fields(p,['value','amount','radius','intensity','offset','offsetX','offsetY','blur','opacity','x','y','contrast','brightness','frequency','octaves','seed','spread','roughness','bloom','halo','smear','noise','scanlines']));}
   else item.omission='Specialised attributes are not projected; identifier/range retained';
   // Semantic identity handles come from the authoritative source adapter.
   const admitted=source.annotations?.find((a:any)=>a.id===p.id);if(admitted)Object.assign(item,fields(admitted,['anchorHandle','glossHandle','entityHandle']));
   entry.annotations.push(item);
  }
  if(properties.length>limits.properties||marks.length>limits.properties)entry.omissions.push('Property count limit');
  if(node.viewType==='mutable/pdf-document-block')entry.resource={kind:'retained-capture',family:'pdf',label:scalar((node.payload.pdf as any)?.inspection?.label),pages:scalar((node.payload.pdf as any)?.inspection?.pages),binding:permits(sources.vocabulary,'media.retained-pdf')&&retainedPdfsEnabled(sources.editor)&&!node.payload.archive?'requires-active-session-and-original-verification':'unavailable',operation:'media.retained-pdf',availability:'unverified',textExtraction:false,state:'Viewing is local; submitted capture/configuration and annotation/extraction operations are protected'};
  else if(node.viewType==='image-block'&&!managedAsset(node.payload.asset))entry.resource={kind:'external-reference',mode:'image-embed',...fields(meta,['url','alt']),availability:'unknown',retained:false,requiresAcquisition:false,perception:false};
  else if(['mutable/video-block','youtube-player-block','vimeo-player-block'].includes(node.viewType)){
   const video=passiveVideo(node.payload.video);entry.resource={kind:'embedded-media',provider:video?.provider??null,url:video?.canonicalUrl??null,availability:'unknown',retained:false,descriptor:video?'valid':'unsupported',state:'Playback is local to the mounted occurrence; authored URL remains protected'};
  }
  else if(node.viewType==='iframe-block')entry.resource={kind:'embedded-media',mode:'website',...fields(meta,['url','title']),availability:'unknown',retained:false,policy:meta?.resourceEmbed===true?'sandboxed-native-resource':'legacy-iframe-not-an-authoring-route'};
  else if(['mutable/pdf-document-block','mutable/iiif-manifest-block','mutable/iiif-image-block','mutable/web-article-block','mutable/citation-block','mutable/web-resource-block','mutable/academic-resource-block'].includes(node.viewType))entry.resource={kind:'retained-capture',availability:'unknown',newUrlRequires:'Native acquisition/capture service; ordinary hyperlinks need no capture',details:'Trusted capture/resource identities are not exported'};
  else if(node.viewType==='youtube-video-block')entry.resource={kind:'external-reference',...fields(meta,['url']),requiresAcquisition:false,mode:'provider-embed',availability:'unknown',retained:false};
  else if(node.viewType==='image-block')entry.resource={kind:managedAsset(node.payload.asset)?'managed-image':'unmanaged-image',alt:scalar(meta?.alt)??'',binding:permits(sources.vocabulary,'media.image')&&managedImagesEnabled(sources.editor)&&!!managedAsset(node.payload.asset)?'requires-active-session-verification':'unavailable',operation:'media.image',requiresAcquisition:false,perception:false};
  else if(/image|video|resource|pdf|iiif|citation|article|player/.test(node.viewType))entry.resource={kind:'native-resource',details:'Requires native resource binding adapter; no trusted capture exported'};
  if(meta)entry.omissions.push('Only selected persistent configuration is projected; internal and unsupported metadata omitted');
  if(entry.kind==='native')entry.omissions.push('Unmapped native kind; original identity and structure retained');
  if(source.status==='truncated')entry.omissions.push('Source read truncated');
  const size=new TextEncoder().encode(JSON.stringify(entry)).length;
  if(bytes+size>limits.bytes-2048){omissions.add('Inspection byte limit; continue with child handles');return null;}bytes+=size;
  if(seen.has(node.contentKey)){entry.referenceOnly=true;return entry;}seen.add(node.contentKey);
  const descend=async(key:string)=>{
   const child=sources.node(key);if(!child)return null;
   const target={kind:'block' as const,resourceId:sources.owner,blockId:String(child.payload.id)},check=sources.resolve(target);
   if(check.status!=='resolved'||check.node?.contentKey!==child.contentKey)return null;
   const handle=sources.issue(target);
   if(depth>=limits.depth||count>=limits.nodes){omissions.add('Inspection depth/node limit; continue with child handles');return {handle,nativeType:child.viewType,omitted:true};}
   return await visit(await sources.source(handle),depth+1)??{handle,nativeType:child.viewType,omitted:true};
  };
  // Reserve bounded edge descriptors even when descendants are omitted.
  const append=async(key:string,relation?:string)=>{
   if(bytes>limits.bytes-2048){omissions.add('Inspection byte limit; continue with read_source.children');return false;}
   bytes+=256;const child=await descend(key);if(child)(relation?entry.ownedRelations:entry.children).push(relation?{name:relation,content:child}:child);return true;
  };
  for(const key of node.children.slice(0,32))if(!await append(key))break;
  if(node.children.length>32)entry.omissions.push('Child count limit');
  let relations=0;for(const name in node.ownedRelations){if(++relations>limits.relations){entry.omissions.push('Owned relation count limit');break;}if(!await append(node.ownedRelations[name],name))break;}
  return entry;
 };
 result.root=await visit(initial,0);result.omissions=[...omissions];
 if(new TextEncoder().encode(JSON.stringify(result)).length>limits.bytes)return {version:1,lossless:false,limits,root:{handle:initial.handle},omissions:['Inspection byte limit; read children separately']};
 return result;
}
