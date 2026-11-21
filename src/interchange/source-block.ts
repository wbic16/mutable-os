import { emptyFragment, LIMITS, validateFragment } from './fragment';
import type { JsonObject,ExistingBlockDto } from '../block-tree/types';
import {validateLiteralText} from '../block-tree/literal-authoring';
export type SourceFormat = 'markdown' | 'html';
export const sourceTypes = ['mutable/markdown-source-block', 'mutable/html-source-block'] as const;
export const sourceType = (format: SourceFormat) => `mutable/${format}-source-block`;
export const isSourceType = (type: string) => (sourceTypes as readonly string[]).includes(type);
export function sourceFormat(type: string, payload: JsonObject): SourceFormat {
 const format = type === sourceTypes[0] ? 'markdown' : type === sourceTypes[1] ? 'html' : undefined;
 const schema = payload.sourceFormat as JsonObject | undefined;
 if (!format || typeof payload.text !== 'string' || schema?.version !== 1 || schema.format !== format || schema.profile !== `mutable-${format}-source-v1`) throw Error('Unsupported source Block schema. Source is retained without interpretation.');
 return format;
}
export function sourcePayload(format: SourceFormat, text = '', metadata: JsonObject = {}) {
 if(!['markdown','html'].includes(format))throw Error('Unsupported source format');
 validateLiteralText(text);
 return {text, sourceFormat: {version: 1, format, profile: `mutable-${format}-source-v1`}, metadata};
}
export const sourceOperation={purpose:'Retain exact Markdown or HTML as native source, not as composition fallback.',parameters:{format:{type:'string',enum:['markdown','html']},text:{type:'string'}},nativeEffects:sourceTypes} as const;
export function sourceBlockDto(format:SourceFormat,text=''):ExistingBlockDto {
 return {id:crypto.randomUUID(),type:sourceType(format),...sourcePayload(format,text),children:[]};
}
export function sourceFragment(format: SourceFormat, text: string, metadata: JsonObject = {}) {
 if (text.length > LIMITS.cells * 2 || new TextEncoder().encode(text).length > LIMITS.bytes) throw Error('Source exceeds the import limit.');
 const f = emptyFragment();
 f.blocks.push({localId:'source',type:sourceType(format),data:sourcePayload(format,text,metadata),blockProperties:[],children:[],relations:{}});
 f.placements.push({localId:'placement',kind:'owned',target:{kind:'local',object:'block',id:'source'}});
 f.roots.push({placement:'placement',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false});
 return validateFragment(f);
}
export const textareaText = (source: string) => source.replace(/\r\n?/g, '\n');
/** Map a native textarea edit back to authored UTF-16, preserving untouched CR/LF/CRLF.
 * Only this source string is inspected, never Blocks, Cells or annotation ranges.
 * A captured beforeinput range disambiguates insertions among repeated newlines.
 */
export function editSource(source: string, value: string, range?: {start:number;end:number;inputType?:string}) {
 const before = textareaText(source);
 if (before === value) return source;
 const removed=before.length-value.length;
 if(range&&range.start===range.end&&removed>0){
  if(range.inputType?.startsWith('delete')&&range.inputType.endsWith('Backward'))range={...range,start:Math.max(0,range.start-removed)};
  else if(range.inputType?.startsWith('delete')&&range.inputType.endsWith('Forward'))range={...range,end:Math.min(before.length,range.end+removed)};
 }
 let start = 0, end = before.length, nextEnd = value.length;
 if (range && value.startsWith(before.slice(0,range.start)) && value.endsWith(before.slice(range.end)) && value.length >= range.start + before.length - range.end) {
  start=range.start;end=range.end;nextEnd=value.length-(before.length-end);
 } else {
  while(start<end && start<nextEnd && before[start]===value[start])start++;
  while(end>start && nextEnd>start && before[end-1]===value[nextEnd-1]){end--;nextEnd--;}
 }
 const endings = new Map<string,number>();
 let offset=0,from=0,to=source.length;
 for(let i=0;i<=source.length;i++) {
  if(offset===start)from=i;
  if(offset===end)to=i;
  if(i===source.length)break;
  if(source[i]==='\r'||source[i]==='\n') {const ending=source[i]==='\r'&&source[i+1]==='\n'?'\r\n':source[i];endings.set(ending,(endings.get(ending)??0)+1);if(ending.length===2)i++;}
  offset++;
 }
 const dominant=[...endings].sort((a,b)=>b[1]-a[1])[0]?.[0]??'\n';
 return source.slice(0,from)+value.slice(start,nextEnd).replace(/\n/g,dominant)+source.slice(to);
}
