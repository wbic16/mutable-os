/** Test-only occurrence-local Cells and run presentation. No repository facade. */
import {DirectCharacterCells,type CharacterCellPresentation} from '../../src/rendering/direct-character-cells';
import {compileCellStyleRuns,cellStyleAt,standoffStyleSchema} from '../../src/rendering/standoff-styles';
import {ReplacePositionMap} from '../../src/block-tree/position-map';
import {CompactDocument,codepoints,length,type Atom,type Block,type Notice} from './model';
import {EditingIndex} from './editing-index';
export const allocations={editingCells:0,projections:0,renderVisits:0,readonlyRuns:0};
let serial=0;
const image=(p:Record<string,any>)=>({src:String(p.src??p.url??''),alt:String(p.alt??''),label:String(p.alt??'Image'),width:p.width,height:p.height});
export function cells(atoms:readonly Atom[]):CharacterCellPresentation[]{const out:CharacterCellPresentation[]=[];for(const a of atoms){if(a.kind==='image')out.push({key:`edit:${++serial}`,text:'\uFFFC',image:image(a.properties)});else for(const text of a.text)out.push({key:`edit:${++serial}`,text});}allocations.editingCells+=out.length;return out;}
export class EditingOccurrence {
 cells:CharacterCellPresentation[];keys:string[];index:EditingIndex;selection={anchor:0,head:0};updates=0;
 readonly renderer?:DirectCharacterCells;private unsubscribe:()=>void;
 beforeRender?:(notice:Notice)=>void;afterRender?:(notice:Notice,removed:CharacterCellPresentation[],added:CharacterCellPresentation[])=>void;
 holdDOM=false;suppressedKeys=new Set<string>();suppressedRemoved=new Set<string>();
 private styles:ReturnType<typeof compileCellStyleRuns>=[];
 constructor(readonly model:CompactDocument,readonly id:string,readonly flow?:HTMLElement){
  this.cells=cells(model.get(id).inline??[]);this.keys=this.cells.map(c=>c.key);this.index=new EditingIndex(this.cells);allocations.projections++;if(flow)this.renderer=new DirectCharacterCells(flow);
  this.render();this.unsubscribe=model.subscribe(n=>{
   if(!n.ids.includes(id))return;
   this.beforeRender?.(n);
   if(!model.has(id)){this.afterRender?.(n,this.cells,[]);this.dispose();return;}
   const removed:CharacterCellPresentation[]=[],added:CharacterCellPresentation[]=[];
   for(const d of n.deltas.filter(d=>d.id===id)){
    const fresh=cells(d.insert),gone=this.cells.slice(d.start,d.end),oldStyles=this.styles;
    this.index.splice(d.start,gone,fresh);this.cells.splice(d.start,d.end-d.start,...fresh);this.keys.splice(d.start,d.end-d.start,...fresh.map(c=>c.key));removed.push(...gone);added.push(...fresh);
    const map=new ReplacePositionMap(d.start,d.end,fresh.length);this.selection={anchor:map.map(this.selection.anchor,'after'),head:map.map(this.selection.head,'after')};
    this.styles=compileCellStyleRuns(model.get(id).properties.standoffProperties??[]);
    this.paintChanges(oldStyles,d.start,d.end,fresh.length,gone.map(c=>c.key));
   }
   if(!n.deltas.some(d=>d.id===id)){const old=this.styles;this.styles=compileCellStyleRuns(model.get(id).properties.standoffProperties??[]);this.paintChanges(old,0,0,0,[]);}
   this.updates++;this.afterRender?.(n,removed,added);
  },id);
 }
 private paintChanges(old:ReturnType<typeof compileCellStyleRuns>,start:number,end:number,inserted:number,removed:string[]){
  const shift=inserted-(end-start),n=this.cells.length,points=new Set<number>([0,n,start,start+inserted]);
  for(const run of this.styles)if(run.start<=n)points.add(run.start);
  for(const run of old){if(run.start<start)points.add(run.start);else if(run.start>=end)points.add(Math.min(n,run.start+shift));}
  const bounds=[...points].filter(i=>i>=0&&i<=n).sort((a,b)=>a-b);let removedPending=removed;
  for(let i=0;i<bounds.length-1;i++){
   const a=bounds[i],b=bounds[i+1],prior=a<start?a:a>=start+inserted?a-shift:undefined;
   if(prior!==undefined&&JSON.stringify(cellStyleAt(old,prior))===JSON.stringify(cellStyleAt(this.styles,a)))continue;
   this.paint(a,b,removedPending);removedPending=[];
  }
  if(removedPending.length)this.paint(start,start,removedPending);
 }
 paint(start:number,end:number,removed:string[]=[]){
  const changed=this.cells.slice(start,end);for(let i=0;i<changed.length;i++){changed[i].style=cellStyleAt(this.styles,start+i);allocations.renderVisits++;}
  if(this.holdDOM){changed.forEach(c=>this.suppressedKeys.add(c.key));removed.forEach(k=>this.suppressedRemoved.add(k));return;}
  if(!this.renderer)return;
  const r=this.renderer as DirectCharacterCells & {experimentalSplice?:boolean;update(c:readonly CharacterCellPresentation[],delta?:{removed:string[];before?:string}):void};
  if(!r.experimentalSplice)throw Error('M2 renderer port is absent: use the isolated experimental bundle');
  r.update(changed,{removed,before:this.cells[end]?.key});
 }
 render(){this.styles=compileCellStyleRuns(this.model.get(this.id).properties.standoffProperties??[]);this.updates++;
  for(let i=0;i<this.cells.length;i++){const c=this.cells[i];c.index=i;c.style=cellStyleAt(this.styles,i);allocations.renderVisits++;}
  this.renderer?.update(this.cells);
 }
 dispose(){this.unsubscribe?.();this.renderer?.dispose();this.cells=[];this.keys=[];}
}
export function readonlyRuns(block:Block){
 const annotations=block.properties.standoffProperties??[],unsupported=new Set<string>();
 const supported=annotations.filter((p:any)=>{
  if(!p||typeof p!=='object')return false;
  const schema=standoffStyleSchema(p.type);
  if(p.isZeroWidth){unsupported.add('zero-width presentation');return false;}
  if(schema&&(schema.cellEffect||schema.regionEffect||schema.noiseEffect||schema.projection||schema.svg||schema.deferred))unsupported.add(String(p.type));
  return schema?.cell||schema?.valueStyle;
 });
 if((block.properties.blockProperties??[]).length)unsupported.add('Block-level appearance / document theme');
 if(block.inline?.some(a=>a.kind==='image'&&!a.properties.src&&!a.properties.url))unsupported.add('managed asset binding / image source resolution');
 if(block.relations&&Object.keys(block.relations.owned).length)unsupported.add('owned relation presentation / active alternatives');
 const styles=compileCellStyleRuns(supported),out:Array<{text?:string;image?:ReturnType<typeof image>;style:Record<string,any>}> = [];let offset=0;
 for(const atom of block.inline??[]){
  if(atom.kind==='image'){out.push({image:image(atom.properties),style:cellStyleAt(styles,offset)});offset++;continue;}
  const n=codepoints(atom.text),ends=[0,...styles.map(r=>r.start-offset).filter(i=>i>0&&i<n),n];
  // One pass over a span, avoiding repeated code-point scans for every style run.
  let part=0,cp=0,utf16=0,begin=0;
  for(const ch of atom.text){cp++;utf16+=ch.length;if(cp===ends[part+1]){out.push({text:atom.text.slice(begin,utf16),style:cellStyleAt(styles,offset+ends[part])});begin=utf16;part++;}}
  offset+=n;
 }
 return {runs:out,unsupported:[...unsupported]};
}
export function mountReadonly(model:CompactDocument,host:HTMLElement){
 const limitations=new Set<string>();let runs=0;
 for(const block of model.all()){
  if(!block.inline)continue;const p=document.createElement('p');p.dataset.block=block.id;p.style.whiteSpace='pre-wrap';
  const result=readonlyRuns(block);result.unsupported.forEach(x=>limitations.add(x));
  for(const run of result.runs){const e=document.createElement('span');for(const [key,value]of Object.entries(run.style))e.style.setProperty(key,String(value));
   if(run.image){const img=document.createElement('img');img.src=run.image.src;img.alt=run.image.alt;if(run.image.width)img.width=run.image.width;if(run.image.height)img.height=run.image.height;e.append(img);}else e.textContent=run.text!;
   p.append(e);runs++;
  }host.append(p);
 }allocations.readonlyRuns+=runs;return {runs,limitations:[...limitations]};
}
