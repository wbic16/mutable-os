import {Dynamic} from 'solid-js/web';
import {useInstrumentPresentations} from '../../rendering/instrument-presentations';
import {placeScry} from './placement';
import {retainSourceHighlight} from './source-highlight';
import {EntitySearch} from '../entity-references/search-view';
import type {EntitySearchData} from '../entity-references/entity-search';
import type {AnnotationCapabilities} from '../../feature-api';
import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import type { ReactiveEditor } from '../../reactive-editor/editor';
import type { PanelSession } from '../../feature-api';
import { useManagedViewActivity, useManagedWindowOwner } from '../../rendering/window-manager';
import type { CompletionSession } from './session';
import {WindowGeometry} from '../../application/window-geometry';
import {FloatingWindowResizeHandle} from '../../rendering/floating-window-resize';

function createCompletionModel(props:{editor:ReactiveEditor;panel:PanelSession;cancelled():void}) {
 const presentations=useInstrumentPresentations();
 const data=props.panel.data as {session:CompletionSession;api:AnnotationCapabilities;entityData():EntitySearchData;adjust(edge:'start'|'end',direction:-1|1,word:boolean):void;controls(value:{run(id:string):boolean;busy():boolean;canClose():boolean}|undefined):void},s=data.session;
 const activity=useManagedViewActivity(),owner=useManagedWindowOwner(),[position,setPosition]=createSignal({x:8,y:8},{equals:(a,b)=>a.x===b.x&&a.y===b.y});
 const preferredSize=()=>s.state.kind==='entity'?{width:Math.min(560,window.innerWidth-16),height:500}:{width:Math.max(400,window.innerWidth*.75),height:560};
 const [size,setSize]=createSignal(preferredSize(),{equals:(a,b)=>a.width===b.width&&a.height===b.height});
 let manual=false,preferred=preferredSize(),previousSurface:{x:number;y:number}|undefined;
 let root!:HTMLDivElement,input!:HTMLInputElement,frame=0,resize:ResizeObserver|undefined;
 const geometry=owner?.manager.geometry??new WindowGeometry();
 const floating=geometry.create(`scry:${props.panel.key}`,{element:()=>root,viewport:true,position,size,minimum:()=>({width:Math.min(400,size().width),height:Math.min(500,size().height)}),mode:()=> 'normal',allowed:()=>s.alive&&eligible(),commit:patch=>{manual=true;if(patch.position){preferred=size();setPosition(patch.position);}if(patch.size){preferred=patch.size;setSize(patch.size);}schedule();}});
 const close=()=>s.state.kind==='entity'?props.panel.close():s.close();
 if(!props.editor.features.scryProvisionalCells)retainSourceHighlight(props.editor,s);
 const id=`autocomplete-options-${props.panel.key.replaceAll(':','-')}`;
 const anchor=()=>{
  frame=0;if(!s.alive||floating.mode())return;
  const mount=props.editor.mounts.get(s.source.nodeKey),boundary=mount?.inlineBoundary?.(s.source.start);
  if(!mount?.root.isConnected||mount.root.closest('[hidden],[inert]')){close();return;}
  if(presentations?.()?.completion)return;
  // Measure only the selected range, once per invalidated frame. A wrapped
  // selection is protected in full, not just its opening caret. No cell sweep.
  let rect:DOMRect|undefined;
  if(boundary){const range=document.createRange();range.setStart(boundary.node,boundary.offset);const end=mount.inlineBoundary?.(s.source.end);if(end)range.setEnd(end.node,end.offset);else range.collapse(true);rect=range.getBoundingClientRect();if(!rect.height)rect=[...range.getClientRects()].find(r=>r.height>0);}
  rect??=mount.root.getBoundingClientRect();
  const area=geometry.bounds(true),viewport=window.visualViewport;
  const surface=mount.root.closest('.flint-application, [data-managed-window-id], .reactive-window')?.getBoundingClientRect();
  const current=position(),origin={x:surface?.left??area.x,y:surface?.top??area.y};
  const desired=manual?preferred:preferredSize();
  const placed=placeScry(area,{x:rect.left,y:rect.top,width:rect.width,height:rect.height},desired,manual?{x:current.x+(previousSurface?origin.x-previousSurface.x:0),y:current.y+(previousSurface?origin.y-previousSurface.y:0),...size()}:undefined);
  if(!placed){close();return;}
  previousSurface=origin;
  setSize({width:placed.width,height:placed.height});setPosition({x:placed.x,y:placed.y});

 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(anchor);};
 const eligible=()=>{const a=activity(),active=owner?owner.manager.registry.windows[owner.windowId]?.active:a?.active;return !a||a.mounted&&a.visible&&active;};
 createEffect(()=>{if(!eligible())queueMicrotask(()=>{if(s.alive&&!eligible())close();});});
 createEffect(()=>{if(owner)owner.manager.geometry.controllers.get(owner.windowId)?.rectangle();schedule();});
 createEffect(()=>{s.state.revision;s.state.expanded;schedule();});
 const expand=()=>{s.expand();queueMicrotask(()=>{input?.focus();input?.setSelectionRange(input.value.length,input.value.length);});};
 let pointerSelection=false;
 const selection=()=>{
  if(!s.alive||root?.contains(document.activeElement))return;
  const h=props.editor.mounts.get(s.source.nodeKey);if(h?.composing)return;const range=h?.captureInlineSelection?.();
  if(document.activeElement!==h?.focusElement)return;
  if(s.source.brackets){
   const lo=s.source.start,hi=s.source.end;
   if(!range||range.anchor<lo||range.anchor>hi||range.head<lo||range.head>hi){
    if(pointerSelection){close();return;}
    if(range)h?.restoreInlineSelection?.({anchor:Math.max(lo,Math.min(hi,range.anchor)),head:Math.max(lo,Math.min(hi,range.head))});
   }
  }else if(!s.state.expanded&&(!range||range.anchor!==range.head||range.head!==s.source.end))close();
  pointerSelection=false;
 };
 const outside=(event:Event)=>{const target=event.target as Node;if(props.editor.features.scryProvisionalCells&&target instanceof Element&&target.closest('[data-document-save],[data-document-history],[data-system-menu-trigger],[role="menu"],[role="menuitem"]'))return;if(root?.contains(target))return;const h=props.editor.mounts.get(s.source.nodeKey);if(!h?.root.contains(target))close();else if(event.type==='pointerdown'){pointerSelection=true;setTimeout(()=>{if(s.alive)selection();pointerSelection=false;},0);}};
 onMount(()=>{
  if(!owner)geometry.install(document.documentElement);
  if(typeof ResizeObserver!=='undefined'){resize=new ResizeObserver(schedule);const mount=props.editor.mounts.get(s.source.nodeKey);if(mount)resize.observe(mount.root);resize.observe(root);}
  if(s.state.kind!=='entity')onCleanup(props.panel.mountWidget(root,()=>input?.focus()));
  document.addEventListener('selectionchange',selection);document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside,true);window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);cancelAnimationFrame(frame);anchor();
  if(s.state.expanded)input?.focus();
 });
 onCleanup(()=>{if(!owner)geometry.dispose();resize?.disconnect();cancelAnimationFrame(frame);document.removeEventListener('selectionchange',selection);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside,true);window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);props.cancelled();});
 const Graphical=()=> <div ref={root} class="autocomplete-workstation" role="region" aria-label="Autocomplete workstation" style={{left:`${floating.rectangle().x}px`,top:`${floating.rectangle().y}px`,width:`${floating.rectangle().width}px`,height:`${floating.rectangle().height}px`}}>
  <header data-window-move data-scry-geometry tabIndex={0} title="Drag to move; arrow keys move, Enter commits, Escape cancels" onPointerDown={e=>{if(!(e.target as Element).closest('button'))floating.beginMove(e);}} onPointerMove={floating.movePointer} onPointerUp={floating.endPointer} onPointerCancel={floating.cancelPointer} onLostPointerCapture={floating.cancelPointer} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(!floating.mode()&&e.key.startsWith('Arrow'))floating.keyboard('move');floating.keyDown(e);}} onBlur={()=>floating.cancel()}><strong>{s.state.kind==='entity'?'Link Entity Reference':`Scry · ${s.state.kind}`}</strong><button aria-label="Close Autocomplete" onClick={close}>×</button></header>
  <Show when={s.state.kind==='entity'} fallback={
  <div class="autocomplete-body"><section class="autocomplete-controls" aria-label="Scry query and tools">
  <Show when={s.state.expanded} fallback={<button class="autocomplete-query" onPointerDown={e=>e.preventDefault()} onClick={expand}>Query: {s.parsed.query||'Show local candidates'} · Edit independently</button>}>
   <label>{s.source.brackets?'Search query':'Phrase : query'}<input ref={input} role="combobox" aria-expanded="true" aria-controls={id} aria-activedescendant={s.state.selected?`${id}-${s.state.rows.findIndex(r=>r.id===s.state.selected)}`:undefined} aria-autocomplete="list" value={s.state.input} disabled={s.state.pending} onInput={e=>{if(!e.isComposing)s.input(e.currentTarget.value);}} onCompositionEnd={e=>s.input(e.currentTarget.value)} /></label>
  </Show>
  <Show when={s.source.brackets}><p>Source: {s.state.sourceText||'(empty mention)'} · {s.state.queryMode}</p><Show when={s.state.queryMode==='independent'}><button onClick={()=>s.follow()}>Resume following source</button></Show></Show>
  <div class="autocomplete-actions"><button onClick={close}>Cancel</button><Show when={s.source.brackets&&!props.editor.features.scryProvisionalCells}><button onClick={()=>s.close(true)}>Keep literal brackets</button></Show></div>
  </section><section class="autocomplete-candidates" aria-label="Scry matches">
  <div role="status" aria-live="polite">{s.state.busy?'Searching…':`${s.state.rows.length} candidates`}</div>
  <div id={id} role="listbox" aria-label="Completion candidates" class="autocomplete-results"><For each={s.state.rows}>{(row,i)=><button id={`${id}-${i()}`} role="option" aria-selected={s.state.selected===row.id} aria-disabled={row.disabled} disabled={s.state.pending||row.disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>{s.select(row.id);void s.choose();}} onMouseMove={()=>s.select(row.id)}><strong>{row.name}</strong><small>{row.reason} · {row.id}</small></button>}</For></div>
  <Show when={s.state.error}><p role="alert">{s.state.error}</p></Show>
  </section></div>}>
   <EntitySearch api={data.api} panel={{...props.panel,data:data.entityData()}} completion={{session:s,target:data.entityData,adjust:data.adjust,controls:data.controls}}/>
  </Show>
  <Show when={s.state.error}><p role="alert">{s.state.error}</p></Show>
  <footer>↑ ↓ select · Enter link · Esc cancel · Ctrl+A review · Drag the header to move</footer>
  <span data-scry-geometry><FloatingWindowResizeHandle controller={floating.resize} label="Resize Scry window"/></span>
 </div>;
 return {Graphical,s,id,close,expand,props,refs:{root:(el:HTMLDivElement)=>root=el,input:(el:HTMLInputElement)=>input=el},
 Entity:()=> <EntitySearch api={data.api} panel={{...props.panel,data:data.entityData()}} completion={{session:s,target:data.entityData,adjust:data.adjust,controls:data.controls}}/>};
}
export type CompletionModel=ReturnType<typeof createCompletionModel>;
export function CompletionPopup(props:Parameters<typeof createCompletionModel>[0]) {
 const model=createCompletionModel(props),views=useInstrumentPresentations();
 return <Dynamic component={views?.()?.completion??model.Graphical} model={model}/>;
}
