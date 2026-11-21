import type {FlowLayout,Glyph} from './layout';
import {classesAt,type ClassRun} from '../../rendering/range-rendering';
const ns='http://www.w3.org/2000/svg';
interface Run {glyphs:Glyph[];classes:string;font:string;color:string;opacity:number;offset:number;text:string;ascii:boolean}
interface Cell {element:SVGTSpanElement;attributes:Map<string,string>;font?:string;color?:string;opacity?:number;text?:string}
/** SVG coordinate lists paint equal-style ASCII runs without one DOM element per
 * character. Non-ASCII graphemes retain individual spans, so their cluster shape
 * is never split by SVG's character-positioning rules. Native hit/caret geometry
 * still comes from the shared layout, independently of these paint runs. */
export class SvgGlyphs {
 private lines:Array<{group:SVGTextElement;cells:Cell[];start?:number;paintKey?:object;classKey?:string}>=[];
 writes=0;
 constructor(private root:SVGGElement){}
 update(layout:FlowLayout,classes:readonly ClassRun[]){
  const doc=this.root.ownerDocument;
  for(let i=0;i<layout.fragments.length;i++){
   const fragment=layout.fragments[i];let line=this.lines[i];
   if(!line){const group=doc.createElementNS(ns,'text');group.style.whiteSpace='pre';this.lines.push(line={group,cells:[]});}
   if(line.start!==fragment.start){line.group.setAttribute('data-quill-fragment',String(fragment.start));line.start=fragment.start;}
   const classKey=classesAt(classes,fragment.start)+'|'+classes.filter(r=>r.start>fragment.start&&r.start<fragment.end).map(r=>`${r.start-fragment.start}:${r.classes}`).join('|');
   if(line.paintKey===fragment.paintKey&&fragment.paintKey&&line.classKey===classKey)continue;line.paintKey=fragment.paintKey;line.classKey=classKey;
   const runs:Run[]=[];
   for(const glyph of fragment.glyphs){
    const {cluster}=glyph,style=classesAt(classes,cluster.start),font=cluster.font??`${cluster.style} 20px Georgia`,color=glyph.paint?.color??'',opacity=glyph.paint?.opacity??1,ascii=/^[\x20-\x7e]$/.test(cluster.text),last=runs.at(-1);
    if(ascii&&last?.ascii&&last.classes===style&&last.font===font&&last.color===color&&last.opacity===opacity){last.glyphs.push(glyph);last.text+=cluster.text;}
    else runs.push({glyphs:[glyph],classes:style,font,color,opacity,offset:cluster.start-fragment.start,text:cluster.text==='\n'?'':cluster.text,ascii});
   }
   const parent=line.group.parentNode,next=line.group.nextSibling;if(parent)line.group.remove();
   try{
    for(let j=0;j<runs.length;j++){
     const run=runs[j];let cell=line.cells[j];
     if(!cell){const element=doc.createElementNS(ns,'tspan');element.setAttribute('text-anchor','middle');cell={element,attributes:new Map()};line.cells.push(cell);line.group.append(element);}
     const attr=(name:string,value:string)=>{if(cell!.attributes.get(name)!==value){cell!.attributes.set(name,value);cell!.element.setAttribute(name,value);this.writes++;}};
     const list=(field:'x'|'y'|'angle')=>run.glyphs.map(g=>Number(g.point[field].toFixed(3))).join(' ');
     attr('x',list('x'));attr('y',list('y'));attr('rotate',list('angle'));attr('class',run.classes);attr('data-quill-offset',String(run.offset));attr('data-quill-length',String(run.glyphs.at(-1)!.cluster.end-fragment.start-run.offset));
     if(cell.text!==run.text){cell.element.textContent=run.text;cell.text=run.text;this.writes++;}
     if(cell.font!==run.font){cell.element.style.font=run.font;cell.font=run.font;this.writes++;}
     if(cell.color!==run.color){cell.element.style.fill=run.color;cell.color=run.color;this.writes++;}
     if(cell.opacity!==run.opacity){cell.element.style.opacity=String(run.opacity);cell.opacity=run.opacity;this.writes++;}
    }
    while(line.cells.length>runs.length)line.cells.pop()!.element.remove();
   }finally{if(parent)parent.insertBefore(line.group,next);else this.root.append(line.group);}
  }
  while(this.lines.length>layout.fragments.length)this.lines.pop()!.group.remove();
 }
 dispose(){for(const line of this.lines)line.group.remove();this.lines=[];}
}
