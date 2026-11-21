import type {ExistingBlockDto} from './types';
import {prepareLayout} from './layout-authoring';
import {youtubeId} from '../interchange/youtube-reference';

/** Native preparations shared by editor commands and transport projections.
 * These return host-owned fragments, not permission to admit arbitrary DTOs. */
export const headingOperation={purpose:'Introduce a section with a native heading.',parameters:{level:{type:'integer',minimum:1,maximum:6}},nativeEffects:['standoff-editor-block','block/font/size']} as const;
export function headingProperty(type:string,level:number){
 if(type!=='standoff-editor-block'||!Number.isInteger(level)||level<1||level>6)throw Error('Heading requires a TextBlock and level 1–6');
 return {type:'block/font/size',value:'h'+level};
}
export function prepareHeading(text:ExistingBlockDto,level:number):ExistingBlockDto {
 const property=headingProperty(text.type!,level);
 return {...text,blockProperties:[...(Array.isArray(text.blockProperties)?text.blockProperties:[]).filter((p:any)=>p.type!=='block/font/size'),property]};
}
export const textAppearanceOperation={
 purpose:'Configure the alignment, indentation and named size of native text.',
 parameters:{alignment:{type:'string',enum:['left','center','right','justify']},indent:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},size:{type:'string',enum:['normal','half','three-quarters']}},
 nativeEffects:['block/alignment','block/indent','block/font/size'],
} as const;
export function textAppearanceProperty(targetType:string,type:string,value:unknown){
 if(targetType!=='standoff-editor-block')throw Error('Text appearance requires a TextBlock');
 if(type==='block/alignment'&&textAppearanceOperation.parameters.alignment.enum.includes(value as any))return {type,value:value as string};
 if(type==='block/indent'&&typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return {type,value:String(value)};
 if(type==='block/font/size'){
  if(typeof value==='string'&&/^h[1-6]$/.test(value))return headingProperty(targetType,Number(value.slice(1)));
  if(textAppearanceOperation.parameters.size.enum.includes(value as any))return {type,value:value as string};
 }
 throw Error('Invalid native text appearance');
}
export function prepareTextAppearance(block:ExistingBlockDto,input:unknown,heading=false):ExistingBlockDto {
 if(input==null)return block;
 if(typeof input!=='object'||Array.isArray(input))throw Error('Invalid textStyle');
 const style=input as Record<string,unknown>,names=['alignment','indent','size'];
 if(Object.keys(style).some(k=>!names.includes(k))||names.some(k=>!Object.hasOwn(style,k)))throw Error('Invalid textStyle fields');
 if(heading&&style.size!==null)throw Error('Heading level determines text size');
 const properties=(Array.isArray(block.blockProperties)?block.blockProperties:[]) as Record<string,unknown>[];
 const added=names.filter(name=>style[name]!==null).map(name=>textAppearanceProperty(block.type!,name==='size'?'block/font/size':'block/'+name,style[name]));
 return {...block,blockProperties:[...properties.filter(p=>!added.some(a=>a.type===p.type)),...added]};
}
export const gridOperation={purpose:'Arrange related content in a native grid.',constraints:{maxRows:64,maxColumns:16,maxCellChildren:32,rectangular:true},nativeEffects:['grid-block','grid-row-block','grid-cell-block']} as const;
export function prepareGrid(rows:ExistingBlockDto[][][]):ExistingBlockDto {
 const {maxRows,maxColumns,maxCellChildren}=gridOperation.constraints;
 if(!Array.isArray(rows)||!rows.length||rows.length>maxRows)throw Error('Invalid native grid rows');
 const width=Array.isArray(rows[0])?rows[0].length:0;
 if(!width||width>maxColumns||rows.some(row=>!Array.isArray(row)||row.length!==width||row.some(cell=>!Array.isArray(cell)||cell.length>maxCellChildren)))throw Error('Invalid native grid cells');
 return prepareLayout('grid',rows);
}
export const youtubeOperation={purpose:'Present an existing external YouTube video; no acquisition or generation.',parameters:{url:{type:'string',minLength:1,maxLength:4096}},nativeEffects:['youtube-video-block','metadata.url'],prerequisites:['A URL or video ID accepted by the native YouTube validator']} as const;
export function prepareYouTube(url:string):ExistingBlockDto {
 if(typeof url!=='string'||url.length>4096||!youtubeId(url))throw Error('Enter a valid YouTube URL or video ID');
 return {id:crypto.randomUUID(),type:'youtube-video-block',metadata:{url},children:[]};
}
