import type {ReactiveEditor} from '../../reactive-editor/editor';
import {supportedText} from './measurement';
import type {FlowLayout} from './layout';
import {caretAt,hitCaret} from './layout';
/** Uses the native SelectionService as the sole selection authority. The empty
 * focus sink captures browser input only; no text is reconciled from its DOM. */
export function quillInput(editor:ReactiveEditor,key:string,layout:()=>FlowLayout,text:()=>string,notice:(s:string)=>void){
 const selection=()=>{const s=editor.selections.sets[key],p=s?.items.find(i=>i.id===s.primaryId);return {anchor:p?.anchor.boundary.index??0,head:p?.head.boundary.index??0};};
 const length=()=>layout().length;
 const boundary=(at:number,direction:number)=>{const b=layout().boundaries??Array.from({length:length()+1},(_,i)=>i);let lo=0,hi=b.length;while(lo<hi){const mid=(lo+hi)>>>1;if(b[mid]<at)lo=mid+1;else hi=mid;}return direction<0?b[Math.max(0,lo-1)]:b[Math.min(b.length-1,b[lo]===at?lo+1:lo)];};
 const select=(anchor:number,head=anchor)=>{const n=editor.node(key);if(!n)return;const clamp=(i:number)=>Math.max(0,Math.min(length(),i));editor.selections.clearSecondary(key);editor.selections.setPrimary(key,n.contentKey,n.viewId,clamp(anchor),clamp(head));editor.annotationEvents.setCaret(key,clamp(head));};
 const replace=(value:string,start=Math.min(selection().anchor,selection().head),end=Math.max(selection().anchor,selection().head))=>{
  if(!supportedText(value)||!supportedText(text())){notice('Unsupported input was not inserted. Use native text editing for unsupported scripts or IME.');return;}
  if(start===end&&!value)return;
  const n=editor.node(key)!;editor.commands.replaceInlineRange(key,start,end,value);
  editor.selections.mapContentEdit(n.contentKey,start,end,[...value].length);select(start+[...value].length);notice('');
 };
 const word=(at:number,direction:number)=>{const t=[...text()];if(direction<0){while(at>0&&/\s/.test(t[at-1]))at--;while(at>0&&!/\s/.test(t[at-1]))at--;}else{while(at<t.length&&!/\s/.test(t[at]))at++;while(at<t.length&&/\s/.test(t[at]))at++;}return at;};
 const consume=(event:Event)=>{if(event.cancelable)event.preventDefault();event.stopPropagation();return true;};
 const handle=(event:Event):boolean=>{
  if(event.type==='input'){(event.target as HTMLElement).textContent='';return consume(event);}
  if(layout().diagnostic){
   if(event instanceof KeyboardEvent&&(event.key==='Tab'||(event.metaKey||event.ctrlKey)&&['z','y','s'].includes(event.key.toLowerCase())))return false;
   notice('Use Native text to edit or copy this unsupported source. Its canonical content is unchanged.');return consume(event);
  }
  if(event.type==='compositionstart'||event.type==='compositionend'){notice('IME is not enabled on the SVG surface. Canonical text is unchanged; use native text editing.');return consume(event);}
  if(event.type==='beforeinput'){
   const e=event as InputEvent,s=selection(),start=Math.min(s.anchor,s.head),end=Math.max(s.anchor,s.head);
   if(e.isComposing||e.inputType.includes('Composition'))notice('IME input was not committed. Use native text editing.');
   else if(e.inputType==='insertText'||e.inputType==='insertReplacementText')replace(e.data??'');
   else if(e.inputType==='insertParagraph'||e.inputType==='insertLineBreak')replace('\n');
   else if(e.inputType==='deleteContentBackward')replace('',start===end?boundary(start,-1):start,end);
   else if(e.inputType==='deleteContentForward')replace('',start,start===end?boundary(end,1):end);
   else if(e.inputType==='historyUndo')editor.repository.undo();
   else if(e.inputType==='historyRedo')editor.repository.redo();
   else notice(`Input ${e.inputType} is not supported on this surface.`);
   return consume(e);
  }
  if(event.type==='paste'||event.type==='copy'||event.type==='cut'){
   if(editor.clipboard.enabled())return editor.clipboard.handleText(event as ClipboardEvent);
   const e=event as ClipboardEvent,s=selection(),start=Math.min(s.anchor,s.head),end=Math.max(s.anchor,s.head);
   if(e.type==='paste')replace(e.clipboardData?.getData('text/plain')??'');
   else {e.clipboardData?.setData('text/plain',[...text()].slice(start,end).join(''));if(e.type==='cut')replace('');}
   return consume(e);
  }
  if(event.type!=='keydown')return false;
  const e=event as KeyboardEvent,s=selection(),extend=e.shiftKey,modified=e.ctrlKey||e.altKey||e.metaKey;
  if(e.isComposing)return consume(e);
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'){select(0,length());return consume(e);}
  if(e.key==='Enter'){replace('\n');return consume(e);}
  if(e.key==='Backspace'||e.key==='Delete'){
   const start=Math.min(s.anchor,s.head),end=Math.max(s.anchor,s.head),back=e.key==='Backspace';
   replace('',start===end&&back?(modified?word(start,-1):boundary(start,-1)):start,start===end&&!back?(modified?word(end,1):boundary(end,1)):end);return consume(e);
  }
  let next:number|undefined;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
   const d=e.key==='ArrowLeft'?-1:1;next=!extend&&s.anchor!==s.head?(d<0?Math.min(s.anchor,s.head):Math.max(s.anchor,s.head)):modified?word(s.head,d):boundary(s.head,d);
  }else if(e.key==='Home'||e.key==='End'){
   const f=layout().fragments.find(f=>s.head>=f.start&&s.head<f.end)??layout().fragments.at(-1);next=modified?(e.key==='Home'?0:length()):(e.key==='Home'?f?.start:f?.end);
  }else if(e.key==='ArrowUp'||e.key==='ArrowDown'){
   const l=layout(),p=caretAt(l,s.head),i=l.fragments.findIndex(f=>s.head>=f.start&&s.head<f.end),f=l.fragments[Math.max(0,Math.min(l.fragments.length-1,(i<0?l.fragments.length-1:i)+(e.key==='ArrowUp'?-1:1)))];
   if(p&&f)next=hitCaret({...l,fragments:[f]},p.x,f.geometry.point(0).y)?.index;
  }
  if(next!==undefined){select(extend?s.anchor:next,next);return consume(e);}
  // Native history/annotation bindings and manual Save continue through the gateway.
  return false;
 };
 return {selection,select,replace,handle};
}
