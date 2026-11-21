import type {CompactDocument,Notice} from './model';
import type {EditingOccurrence} from './presentation';
import {ReplacePositionMap} from '../../src/block-tree/position-map';
/** Session-owned composition bridge, invoked through existing CompletionInput.
 * Browser owns provisional DOM; canonical state remains authoritative. No image
 * payload is inferred from textContent and no save-time flush is needed. */
export class CompositionSession {
 private active?:{key:string;o:EditingOccurrence;start:number;end:number;dirty:Set<string>;loose:Set<Node>;observer:MutationObserver;conflict:boolean;version:number;text:string;unwatch:()=>void};
 readonly conflicts:Array<{text:string;reason:string}>=[];
 constructor(private model:CompactDocument,private occurrence:(key:string)=>EditingOccurrence|undefined,private selection:(key:string)=>{anchor:number;head:number}|undefined,private restore:(key:string,at:number,head?:number)=>void,private notice:(s:string)=>void){}
 owns(key:string){return this.active?.key===key;}
 phase(key:string,phase:'start'|'end',text:string){
  const o=this.occurrence(key);if(!o?.flow){if(phase==='end'&&this.active?.key===key){this.conflicts.push({text,reason:'Composition source was removed'});this.cancel();return true;}return false;}
  if(phase==='start'){
   this.cancel();const s=this.selection(key)??o.selection,start=Math.min(s.anchor,s.head),end=Math.max(s.anchor,s.head),dirty=new Set<string>(),loose=new Set<Node>();
   const observe=(records:MutationRecord[])=>{for(const r of records){const e=r.target instanceof Element?r.target:r.target.parentElement;const owner=e?.closest<HTMLElement>('[data-inline-key]');if(owner)dirty.add(owner.dataset.inlineKey!);for(const n of [...r.addedNodes,...r.removedNodes])if(n.parentNode===o.flow||r.target===o.flow){if(n instanceof HTMLElement&&n.dataset.inlineKey)dirty.add(n.dataset.inlineKey);else loose.add(n);}}};
   const observer=new MutationObserver(observe);observer.observe(o.flow,{subtree:true,childList:true,characterData:true});
   const update=(e:CompositionEvent)=>{if(this.active?.key===key)this.active.text=e.data??'';};o.flow.addEventListener('compositionupdate',update);
   this.active={key,o,start,end,dirty,loose,observer,text,unwatch:()=>o.flow!.removeEventListener('compositionupdate',update),conflict:o.cells.slice(start,end).some(c=>!!c.image),version:this.model.version(o.id)};o.holdDOM=true;
   return true;
  }
  const a=this.active;if(!a||a.key!==key)return true;
  // takeRecords includes mutations delivered in the same compositionend task.
  for(const r of a.observer.takeRecords()){const e=r.target instanceof Element?r.target:r.target.parentElement;const owner=e?.closest<HTMLElement>('[data-inline-key]');if(owner)a.dirty.add(owner.dataset.inlineKey!);for(const n of r.addedNodes)if(r.target===o.flow&&!(n instanceof HTMLElement&&n.dataset.inlineKey))a.loose.add(n);}
  a.observer.disconnect();a.unwatch();this.active=undefined;o.holdDOM=false;
  for(const n of a.loose)if(n.parentNode===o.flow)o.flow.removeChild(n);
  // Restore browser-mutated cells through the existing character owner. This is
  // bounded by dirty keys and the original selection, not a paragraph sweep.
  for(const k of o.suppressedKeys)a.dirty.add(k);
  const positions=[...a.dirty].map(k=>o.index.position(k)).filter((i):i is number=>i!==undefined).sort((a,b)=>a-b);
  o.paint(a.start,a.start,[...o.suppressedRemoved]);o.suppressedKeys.clear();o.suppressedRemoved.clear();
  for(let j=0;j<positions.length;){const start=positions[j];let end=start+1;j++;while(j<positions.length&&positions[j]<=end){end=positions[j]+1;j++;}o.paint(start,end);}
  if(a.conflict){this.conflicts.push({text,reason:'Composition overlapped an external edit or selected an inline object'});this.notice('Composition was not applied: source changed. Draft retained for review.');this.restore(key,Math.min(a.start,o.cells.length));return true;}
  if(text){this.restore(key,a.start,a.end);this.model.replace(o.id,a.start,a.end,[{kind:'text',text}],a.version);this.restore(key,a.start+[...text].length);}
  else this.restore(key,a.start,a.end);
  return true;
 }
 changed(n:Notice){const a=this.active;if(!a||!n.ids.includes(a.o.id))return;
  if(!this.model.has(a.o.id)){this.conflicts.push({text:a.text,reason:'Composition source removed during draft'});this.notice('Composition source was removed; draft retained for review.');this.cancel();return;}
  if(n.structural)a.conflict=true;
  for(const d of n.deltas.filter(d=>d.id===a.o.id)){
   const overlaps=d.start<a.end&&d.end>a.start||d.start===d.end&&d.start>=a.start&&d.start<=a.end||a.start===a.end&&d.start<a.start&&d.end>a.start;
   if(overlaps)a.conflict=true;
   const p=new ReplacePositionMap(d.start,d.end,d.insert.reduce((n,x)=>n+(x.kind==='text'?[...x.text].length:1),0));a.start=p.map(a.start,'after');a.end=p.map(a.end,'after');
   // Only affected canonical ranges need repaint after native ownership ends.
   for(let i=Math.max(0,d.start-1);i<Math.min(a.o.cells.length,d.start+d.insert.reduce((n,x)=>n+(x.kind==='text'?[...x.text].length:1),0)+1);i++)a.dirty.add(a.o.cells[i].key);
  }
  a.version=this.model.version(a.o.id);
 }
 cancel(){const a=this.active;if(!a)return;a.observer.disconnect();a.unwatch();a.o.holdDOM=false;this.active=undefined;}
}
