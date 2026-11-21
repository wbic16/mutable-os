import {visualStyle} from './effects';
import type {QuillTypography} from './model';
import type {Cluster,ShapeResult} from './measurement';
import type {PathGeometry,PathPoint} from './geometry';
export interface Glyph {cluster:Cluster;distance:number;point:PathPoint;paint?:{color:string;opacity:number}}
export interface LineFragment {start:number;end:number;geometry:PathGeometry;glyphs:Glyph[];width:number;paintKey?:object}
export interface FlowLayout {fragments:LineFragment[];overflow:number;length:number;boundaries?:number[];diagnostic?:string}
/** Identical source shaping and complete logical geometry keys share a layout
 * across mounted occurrences. Viewport transforms never enter these coordinates.
 * Derived flow only: line breaks consume canonical positions, never edit text.
 * Overlong words split at supported cluster boundaries. Final overflow is retained. */
export class FlowEngine {
 private static shared=new WeakMap<ShapeResult,Map<string,FlowLayout>>();
 private previous?:FlowLayout;private options='';fits=0;
 layout(shape:ShapeResult,paths:PathGeometry[],options:Pick<QuillTypography,'alignment'|'indent'>={}):FlowLayout {
  const signature=JSON.stringify(options),cacheKey=signature+'|'+paths.map(p=>p.key).join('|'),cached=FlowEngine.shared.get(shape)?.get(cacheKey);
  if(cached){this.previous=cached;this.options=signature;return cached;}
  const length=shape.length??shape.clusters.at(-1)?.end??0;
  if(shape.diagnostic){this.previous=undefined;return {fragments:[],overflow:0,length,diagnostic:shape.diagnostic};}
  const cs=shape.clusters,fragments:LineFragment[]=[],sameOptions=signature===this.options;this.options=signature;let index=0;
  const byStart=new Map(cs.map((c,i)=>[c.start,i]));byStart.set(length,cs.length);
  const change=shape.change,delta=this.previous?length-this.previous.length:0;
  let affected=change?.start??0,affectedIndex=byStart.get(affected)??cs.length;
  while(affectedIndex>0&&cs[affectedIndex-1].text!==' '&&cs[affectedIndex-1].text!=='\n')affectedIndex--;
  affected=cs[affectedIndex]?.start??length;
  for(let line=0;line<paths.length;line++){
   const geometry=paths[line],old=this.previous?.fragments[line],start=cs[index]?.start??length;
   if(index>=cs.length&&line>0)break;
   if(sameOptions&&old&&old.geometry===geometry&&change&&(
      old.start===start&&(old.end<affected||old.end===affected&&old.glyphs.at(-1)?.cluster.text==='\n') ||
      start>=change.newEnd&&old.start>=change.oldEnd&&start===old.start+delta)){
    const retained=delta&&start!==old.start?{...old,start,end:old.end+delta,glyphs:old.glyphs.map(g=>({...g,cluster:cs[byStart.get(g.cluster.start+delta)!]}))}:old;
    if(retained.glyphs.every(g=>g.cluster)){fragments.push(retained);index=byStart.get(retained.end)??cs.length;continue;}
   }
   this.fits++;const indent=index===0||cs[index-1]?.text==='\n'?options.indent??0:0,available=Math.max(0,geometry.length-indent);
   let end=index,width=0,lastBreak=-1;
   while(end<cs.length){const c=cs[end];if(c.text==='\n'){end++;break;}
    if(width+c.advance>available){if(lastBreak>index)end=lastBreak;break;}
    width+=c.advance;end++;if(c.text===' ')lastBreak=end;
   }
   const run=cs.slice(index,end);width=run.reduce((n,c)=>n+c.advance,0);const slack=Math.max(0,available-width),spaces=run.filter(c=>c.text===' ').length;
   const gap=options.alignment==='justify'&&end<cs.length&&run.at(-1)?.text!=='\n'&&spaces?slack/spaces:0;
   let cursor=indent+(options.alignment==='center'?slack/2:options.alignment==='end'?slack:0);
   const glyphs:Glyph[]=run.map(c=>{const glyph={cluster:c,distance:cursor,point:geometry.point(cursor+c.advance/2)};cursor+=c.advance+(c.text===' '?gap:0);return glyph;});
   fragments.push({start,end:run.at(-1)?.end??start,geometry,glyphs,width:cursor,paintKey:{}});index=end;
  }
  const result={fragments,overflow:cs[index]?.start??length,length,boundaries:[...cs.map(c=>c.start),length]};
  let cache=FlowEngine.shared.get(shape);if(!cache){cache=new Map();FlowEngine.shared.set(shape,cache);}cache.set(cacheKey,result);if(cache.size>16)cache.delete(cache.keys().next().value!);
  return this.previous=result;
 }
 clear(){this.previous=undefined;}
}
/** Visual effects derive presentation without rerunning the line fitter. */
export class VisualLayoutCache {
 private fragments=new WeakMap<object,{key:string;value:LineFragment}>();
 apply(layout:FlowLayout,typography?:QuillTypography):FlowLayout {
  if(!typography?.color&&!typography?.effects?.some(e=>e.enabled!==false&&['rotation','baseline','opacity','color'].includes(e.kind)))return layout;
  const effects={color:typography.color,effects:typography.effects?.filter(e=>e.enabled!==false&&['rotation','baseline','opacity','color'].includes(e.kind))},signature=JSON.stringify(effects);
  return {...layout,fragments:layout.fragments.map(f=>{const owner=f.paintKey??f,key=signature+':'+f.start+':'+layout.length,old=this.fragments.get(owner);if(old?.key===key)return old.value;
   const value={...f,paintKey:{},glyphs:f.glyphs.map(g=>{const v=visualStyle(effects,g.cluster.start,layout.length),r=g.point.angle*Math.PI/180;return {...g,point:{x:g.point.x-Math.sin(r)*v.baseline,y:g.point.y+Math.cos(r)*v.baseline,angle:g.point.angle+v.rotation},paint:{color:v.color,opacity:v.opacity}};})};this.fragments.set(owner,{key,value});return value;})};
 }
}
export interface CaretPoint extends PathPoint {index:number;affinity:'before'|'after';height:number}
const boundary=(g:Glyph,end=false)=>{const r=g.point.angle*Math.PI/180,d=g.cluster.advance/2*(end?1:-1);return {...g.point,x:g.point.x+Math.cos(r)*d,y:g.point.y+Math.sin(r)*d};};
export function caretAt(layout:FlowLayout,index:number,affinity:'before'|'after'='after'):CaretPoint|undefined {
 const f=(affinity==='before'?layout.fragments.find(f=>index>=f.start&&index<=f.end):layout.fragments.find(f=>index>=f.start&&index<f.end))??layout.fragments.at(-1);
 if(!f)return;const g=f.glyphs.find(g=>g.cluster.start>=index),last=g??f.glyphs.at(-1);
 return {...(last?boundary(last,!g):f.geometry.point(0)),index,affinity,height:(last?.cluster.size??20)*1.2};
}
export function hitCaret(layout:FlowLayout,x:number,y:number):CaretPoint|undefined {
 let best:CaretPoint|undefined,score=Infinity;
 for(const f of layout.fragments){const last=f.glyphs.at(-1),stops=[...f.glyphs.map(g=>({index:g.cluster.start,p:boundary(g),size:g.cluster.size??20})),{index:f.end,p:last?boundary(last,true):f.geometry.point(0),size:last?.cluster.size??20}];
  for(const s of stops){const d=(x-s.p.x)**2+(y-s.p.y+s.size*.35)**2;if(d<score){score=d;best={...s.p,index:s.index,affinity:s.index===f.end?'before':'after',height:s.size*1.2};}}
 }
 return best;
}
/** Shared range fragments for native annotation/temporary-range renderers. */
export function rangeBoxes(layout:FlowLayout,start:number,end:number){
 return layout.fragments.flatMap(f=>f.glyphs.filter(g=>g.cluster.end>start&&g.cluster.start<end&&g.cluster.text!=='\n').map(g=>{
  const r=g.point.angle*Math.PI/180,w=g.cluster.advance,size=g.cluster.size??20,c=Math.cos(r),s=Math.sin(r);
  const corners=[[-w/2,-size*.9],[w/2,-size*.9],[-w/2,size*.3],[w/2,size*.3]].map(([x,y])=>({x:g.point.x+x*c-y*s,y:g.point.y+x*s+y*c})),xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
  return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
 }));
}

/** Local range geometry shared by carets/popups/decorations. Unchanged fragments
 * retain boxes, even when another path in this source reflows. */
export class RangeGeometryCache {
 private cache=new Map<string,{fragments:LineFragment[];boxes:ReturnType<typeof rangeBoxes>;local:import('../../rendering/decorations').VisualFragment[]}>();
 builds=0;
 get(layout:FlowLayout,start:number,end:number){
  const key=`${start}:${end}`,fragments=layout.fragments.filter(f=>f.end>start&&f.start<end),old=this.cache.get(key);
  if(old&&old.fragments.length===fragments.length&&old.fragments.every((f,i)=>f===fragments[i]))return old.boxes;
  this.builds++;const boxes=rangeBoxes({...layout,fragments},start,end);const local=fragments.flatMap(f=>f.glyphs.filter(g=>g.cluster.end>start&&g.cluster.start<end&&g.cluster.text!=='\n').map(g=>({x:-g.cluster.advance/2,y:-(g.cluster.size??20)*.9,width:g.cluster.advance,height:(g.cluster.size??20)*1.2,matrix:[Math.cos(g.point.angle*Math.PI/180),Math.sin(g.point.angle*Math.PI/180),-Math.sin(g.point.angle*Math.PI/180),Math.cos(g.point.angle*Math.PI/180),g.point.x,g.point.y]})));this.cache.set(key,{fragments,boxes,local});if(this.cache.size>256)this.cache.delete(this.cache.keys().next().value!);return boxes;
 }
 local(layout:FlowLayout,start:number,end:number){this.get(layout,start,end);return this.cache.get(`${start}:${end}`)!.local;}
 clear(){this.cache.clear();}
}
