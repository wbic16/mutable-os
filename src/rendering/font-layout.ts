/** Inherited font changes can alter glyph bounds without resizing a Block.
 * Notify existing measurement owners, scoped to the changed presentation. */
const eventName='mutable:font-layout';
export function notifyFontLayoutChange(scope:HTMLElement){scope.dispatchEvent(new CustomEvent(eventName,{bubbles:true}));}
export function observeFontLayout(element:Element,refresh:()=>void){
 const doc=element.ownerDocument;
 const changed=(event:Event)=>{if(event.target instanceof Element&&event.target.contains(element))refresh();};
 doc.addEventListener(eventName,changed);
 return ()=>doc.removeEventListener(eventName,changed);
}
