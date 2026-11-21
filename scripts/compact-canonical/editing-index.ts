import type {CharacterCellPresentation as Cell} from '../../src/rendering/direct-character-cells';
import {graphemeBoundaries} from '../../src/input/graphemes';
type Group={start:number;cells:Cell[]};
/** Occurrence-local rank lookup. No canonical records, per-edit suffix Cell rewrite,
 * edit-log replay, DOM traversal or geometry. Group heads, not Cell presentations,
 * shift after a splice. This is deliberately not a canonical sequence framework. */
export class EditingIndex {
 private groups:Group[]=[];private locations=new Map<string,{group:Group;offset:number}>();
 readonly work={cellsIndexed:0,groupHeads:0,lookups:0};
 constructor(cells:Cell[]){this.insertGroups(0,0,cells);}
 private insertGroups(at:number,start:number,cells:Cell[]){const groups:Group[]=[];for(let i=0;i<cells.length;i+=256){const group={start:start+i,cells:cells.slice(i,i+256)};groups.push(group);group.cells.forEach((cell,offset)=>{this.locations.set(cell.key,{group,offset});this.work.cellsIndexed++;});}this.groups.splice(at,0,...groups);}
 position(key:string){this.work.lookups++;const p=this.locations.get(key);return p?p.group.start+p.offset:undefined;}
 private groupAt(index:number){let a=0,b=this.groups.length-1;while(a<b){const m=Math.ceil((a+b)/2);if(this.groups[m].start<=index)a=m;else b=m-1;}return a;}
 splice(start:number,removed:Cell[],added:Cell[]){
  if(!this.groups.length){this.insertGroups(0,0,added);return;}
  const first=this.groupAt(start),last=this.groupAt(start+removed.length),a=this.groups[first],b=this.groups[last];
  const retained=[...a.cells.slice(0,start-a.start),...added,...b.cells.slice(start+removed.length-b.start)];
  for(const c of removed)this.locations.delete(c.key);
  this.groups.splice(first,last-first+1);this.insertGroups(first,a.start,retained);
  let offset=first?this.groups[first-1].start+this.groups[first-1].cells.length:0;
  for(let i=first;i<this.groups.length;i++){this.groups[i].start=offset;offset+=this.groups[i].cells.length;this.work.groupHeads++;}
 }
}
export const graphemeWork={reads:0,segmented:0,fallbacks:0};
const ascii=(c:Cell|undefined)=>!!c&&!c.image&&/^[\x20-\x7e]$/.test(c.text);
/** Two consecutive printable ASCII characters provide a safe grapheme reset.
 * Complex Unicode falls back to a larger context, never to a guessed boundary. */
export function adjacentGrapheme(cells:readonly Cell[],at:number,direction:-1|1){
 const n=cells.length,get=(i:number)=>{graphemeWork.reads++;return cells[i];};
 if(direction<0&&at===0)return 0;if(direction>0&&at===n)return n;
 const p=direction<0?at-1:at;
 if(get(p)?.image)return direction<0?p:p+1;
 if(ascii(get(p))&&(p===0||ascii(get(p-1)))&&(p+1===n||ascii(get(p+1))))return direction<0?p:p+1;
 // Begin inside the text run: even a combining mark must not absorb an
 // adjacent typed object into a text grapheme.
 let start=p,end=p+1;
 while(start>0&&!get(start-1)?.image&&!(ascii(get(start-1))&&ascii(get(start))))start--;
 while(end<n&&!get(end)?.image&&!(ascii(get(end-1))&&ascii(get(end))))end++;
 if(end-start>256)graphemeWork.fallbacks++;graphemeWork.segmented+=end-start;
 const text=cells.slice(start,end).map(c=>c.text).join(''),bounds=graphemeBoundaries(text).map(i=>i+start);
 return direction<0?(bounds.filter(i=>i<at).at(-1)??0):(bounds.find(i=>i>at)??n);
}
