/** Presentation policy is occurrence-local. Never mark canonical content read-only. */
export function passiveElement(target: EventTarget | Node | null | undefined): Element | undefined {
 const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : undefined;
 return element?.closest('[data-native-passive]') ?? undefined;
}
export function passiveFocus(): boolean { return typeof document !== 'undefined' && !!passiveElement(document.activeElement); }

const boundaries = new WeakMap<Window, { count:number; dispose():void }>();
/** Runs before document-level editor gateways. Native selection, Copy, links,
 * buttons and media remain browser interactions; no authoring shortcuts escape. */
export function installPassiveInput(window: Window): () => void {
 const existing=boundaries.get(window); if(existing){existing.count++;return ()=>release();}
 const names=['keydown','beforeinput','input','compositionstart','compositionupdate','compositionend','cut','paste','drop','dragstart','copy','selectionchange'];
 const guard=(event:Event)=>{
  const selected=event.type==='selectionchange' ? window.document.getSelection()?.anchorNode : undefined;
  if(!passiveElement(selected??event.target))return;
  if(!['copy','selectionchange'].includes(event.type)) {
   if(event instanceof KeyboardEvent){
    // Keep browser Copy, selection and native control activation. Stop authoring
    // chords (including browser Cut/Paste/Undo) before any editor fallback.
    if((event.metaKey||event.ctrlKey)&&!['c','a','f','+','-','0'].includes(event.key.toLowerCase()))event.preventDefault();
   } else event.preventDefault();
  }
  event.stopImmediatePropagation();
 };
 names.forEach(name=>window.addEventListener(name,guard,true));
 boundaries.set(window,{count:1,dispose:()=>names.forEach(name=>window.removeEventListener(name,guard,true))});
 function release(){const value=boundaries.get(window);if(value&&!--value.count){value.dispose();boundaries.delete(window);}}
 return release;
}

/** Audited native families only. Application/Document hosts and arbitrary widgets
 * never inherit read-only admission just because their parent is supported. */
export const passiveNativeTypes = new Set([
 'container-block','page-block','fixed-size-page-block','standoff-editor-block',
 'horizontal-line-block','table-block','table-row-block','table-cell-block',
 'grid-block','grid-row-block','grid-cell-block','tab-row-block','tab-block',
 'surface-block','side-block','image-block','mutable/video-block','youtube-video-block',
 'resource-information-block','left-margin-block','right-margin-block','checkbox-block','indented-list-block',
]);
export function passiveLimitation(node:{viewType:string;payload:any}):string|undefined {
 if(!passiveNativeTypes.has(node.viewType))return 'This Block family is not available in native read-only presentation.';
 if(node.payload.metadata?.documentTarget)return 'Document session hosts must be opened at source.';
 if((node.payload.standoffProperties??[]).some((p:any)=>!p.isDeleted&&/superposition|show-hide/.test(p.type??'')))return 'This interactive text variant must be opened at source.';
 return undefined;
}
