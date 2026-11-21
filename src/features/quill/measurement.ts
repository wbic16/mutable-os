import {layoutStyle} from './effects';
import type {QuillTypography} from './model';
/** Canonical coordinates count Unicode scalars, independently of grapheme/glyph
 * count. Every drawable cluster explicitly retains its UTF-16 and caret spans. */
export interface Cluster {start:number;end:number;utf16Start:number;utf16End:number;text:string;advance:number;style:string;direction:'ltr'|'rtl';carets:readonly number[];font?:string;size?:number}
export interface ShapeResult {clusters:Cluster[];length?:number;generation?:number;change?:{start:number;oldEnd:number;newEnd:number};diagnostic?:string}
export const supportedLatin=(text:string)=>/^[\x20-\x7e\n]*$/.test(text);
/** Qualified browser grapheme scope. Joining/bidi scripts retain native fallback;
 * controls and inline objects must never be mistaken for drawable characters. */
export const supportedText=(text:string)=>/^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Common}\p{Script=Inherited}]*$/u.test(text)&&!/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufffc\ud800-\udfff]/u.test(text);
export const FONT='20px Georgia';
export class LatinMeasurer {
 private generation=0;private widths=new Map<string,number>();measurements=0;
 constructor(private measure:(text:string,font:string)=>number,private unicode=false){}
 shape(text:string,styleAt:(index:number)=>string=()=>'',previous?:ShapeResult,typography?:QuillTypography):ShapeResult {
  if(!(this.unicode?supportedText(text):supportedLatin(text)))return {clusters:[],length:[...text].length,diagnostic:'This source requires unsupported Unicode shaping, bidirectional editing or inline objects. Canonical content is preserved. Use Native text; full IME editing is available there.'};
  const clusters:Cluster[]=[],segments=this.unicode&&!supportedLatin(text)?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>({segment:s.segment,index:s.index})):Array.from(text,(segment,index)=>({segment,index}));
  const length=this.unicode?[...text].length:text.length;let canonical=0;
  for(let i=0;i<segments.length;i++){
   const segment=segments[i],part=segment.segment,start=canonical,end=canonical+[...part].length;canonical=end;
   const settings=layoutStyle(typography,start,length,styleAt(start)),style=settings.style,font=typography?settings.font:`${style.includes('italic')?'italic ':''}${style.includes('bold')?'bold ':''}${FONT}`;
   const old=previous?.generation===this.generation?previous.clusters[i]:undefined;
   if(old?.text===part&&old.style===style&&old.font===font&&old.start===start&&old.utf16Start===segment.index&&(!typography||!typography.effects?.length&&!(typography.tracking))){clusters.push(old);continue;}
   const key=font+'\0'+part;let width=this.widths.get(key);
   if(width===undefined){width=part==='\n'?0:this.measure(part,font);this.widths.set(key,width);this.measurements++;}
   const advance=part==='\n'?0:Math.max(.1,width+settings.tracking);
   clusters.push({start,end,utf16Start:segment.index,utf16End:segment.index+part.length,text:part,advance,style,font,size:settings.size,direction:'ltr',carets:[start,end]});
  }
  const before=previous?.clusters??[];let prefix=0,suffix=0;
  const equal=(a:Cluster,b:Cluster)=>a.text===b.text&&a.style===b.style&&a.advance===b.advance&&a.font===b.font;
  while(prefix<before.length&&prefix<clusters.length&&equal(before[prefix],clusters[prefix]))prefix++;
  while(suffix<before.length-prefix&&suffix<clusters.length-prefix&&equal(before[before.length-1-suffix],clusters[clusters.length-1-suffix]))suffix++;
  return {clusters,length,generation:this.generation,change:{start:clusters[prefix]?.start??length,oldEnd:before[before.length-suffix]?.start??(previous?.length??before.at(-1)?.end??0),newEnd:clusters[clusters.length-suffix]?.start??length}};
 }
 invalidate(){this.generation++;this.widths.clear();}
}
export class TextMeasurer extends LatinMeasurer {constructor(measure:(text:string,font:string)=>number){super(measure,true);}}

/** Mounted occurrences of one native source share identical shaping work. The
 * previous-result check keeps incremental change spans valid for each consumer. */
const sources=new WeakMap<object,Map<string,{users:number;measurer:TextMeasurer;key?:string;previous?:ShapeResult;result?:ShapeResult}>>();
export function acquireSourceMeasurer(owner:object,content:string,measure:(text:string,font:string)=>number){
 let map=sources.get(owner);if(!map){map=new Map();sources.set(owner,map);}let entry=map.get(content);if(!entry){entry={users:0,measurer:new TextMeasurer(measure)};map.set(content,entry);}entry.users++;
 const e=entry;
 return {get measurements(){return e.measurer.measurements;},shape(text:string,styleAt:(index:number)=>string,previous:ShapeResult|undefined,typography:QuillTypography|undefined,styleKey:string){const key=JSON.stringify([text,typography,styleKey]);if(e.key===key&&e.previous===previous&&e.result)return e.result;const result=e.measurer.shape(text,styleAt,previous,typography);e.key=key;e.previous=previous;e.result=result;return result;},invalidate(){e.key=undefined;e.measurer.invalidate();},release(){if(--e.users===0)map!.delete(content);}};
}
