import type {ReactiveEditor} from '../reactive-editor/editor';
/** Browser provisional text belongs to the mounted occurrence. Commit exactly
 * one typed replacement through the existing command and history boundary. */
export function compactComposition(editor:ReactiveEditor,key:string,flow:HTMLElement,selection:()=>{anchor:number;head:number}|undefined,restore:(s:{anchor:number;head:number})=>void){
 let active:{start:number;end:number;revision:number;blocked:boolean;observer:MutationObserver;dirty:Set<HTMLElement>;loose:Set<Node>}|undefined;
 const collect=(records:MutationRecord[])=>{if(!active)return;for(const r of records){const e=r.target instanceof Element?r.target:r.target.parentElement,cell=e?.closest<HTMLElement>('[data-inline-key]');if(cell)active.dirty.add(cell);for(const n of [...r.addedNodes,...r.removedNodes])if(r.target===flow){if(n instanceof HTMLElement&&n.dataset.inlineKey)active.dirty.add(n);else active.loose.add(n);}}};
 const dispose=()=>{active?.observer.disconnect();active=undefined;};
 const phase=(phase:'start'|'end',text:string)=>{
  const node=editor.node(key);if(!node){dispose();return;}
  const c=editor.repository.readState().contents[node.contentKey];
  if(phase==='start'){
   dispose();const s=selection()??{anchor:0,head:0},start=Math.min(s.anchor,s.head),end=Math.max(s.anchor,s.head);
   const observer=new MutationObserver(collect);active={start,end,revision:c.inlineRevision,blocked:node.inlineContent.slice(start,end).some(k=>editor.node(k)?.viewType!=='text-cell'),observer,dirty:new Set(),loose:new Set()};observer.observe(flow,{subtree:true,characterData:true,childList:true});return;
  }
  const a=active;if(!a)return;collect(a.observer.takeRecords());dispose();
  for(const n of a.loose)if(n.parentNode===flow)flow.removeChild(n);
  const changed=[...a.dirty].map(e=>({e,index:node.inlineContent.indexOf(e.dataset.inlineKey!)})).filter(x=>x.index>=0).sort((a,b)=>b.index-a.index);
  for(const {e,index} of changed){
   const cell=editor.node(e.dataset.inlineKey!);
   if(e.parentNode!==flow){const nextKey=node.inlineContent[index+1],next=nextKey?flow.querySelector(`[data-inline-key="${nextKey}"]`):null;flow.insertBefore(e,next);}
   if(cell?.viewType==='text-cell'){const value=String(cell.payload.text??'');if(e.childNodes.length===1&&e.firstChild?.nodeType===Node.TEXT_NODE)e.firstChild.nodeValue=value;else e.textContent=value;}
  }
  if(a.blocked||c.inlineRevision!==a.revision){editor.crossText.notice('Composition was not applied because its range contains an image or its source changed. Composed text: '+text);restore({anchor:a.start,head:a.end});return;}
  if(!text){restore({anchor:a.start,head:a.end});return;}
  restore({anchor:a.start,head:a.end});editor.commands.replaceInlineRange(key,a.start,a.end,text,'Compose text');
  const end=a.start+[...text].length;editor.selections.mapContentEdit(node.contentKey,a.start,a.end,[...text].length);editor.selections.setPrimary(key,node.contentKey,node.viewId,end,end);restore({anchor:end,head:end});
 };
 return {phase,dispose};
}
