import { createSignal, createEffect, For, Show, onMount, onCleanup, untrack, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { BlockViewProps } from '../block-tree/types';
import { useReactiveView } from '../reactive-editor/context';
import { BlockOutlet } from './block-outlet';
import './reversible-surface.css';

/** Resolve the current structural owner, not the original Solid parent context.
 * A retained viewer may acquire a surface after it was mounted. */
export function ReverseInformation(props:{nodeKey:string;children:JSX.Element}) {
 const {editor}=useReactiveView();
 const target=()=>{const surface=editor.surfaces.nearest(props.nodeKey);return surface&&editor.surfaces.informationTarget(surface.key);};
 return <Show when={editor.features.reversibleBlocks} fallback={props.children}><Show when={target()}>{mount=><Portal mount={mount()}>{props.children}</Portal>}</Show></Show>;
}
export function ResourceInformationView(props:BlockViewProps) {
 const {editor,projection,passive}=useReactiveView();let root!:HTMLDivElement;
 const surface=()=>editor.surfaces.nearest(props.nodeKey);
 const resource=()=>{const front=surface()?.children[0];const node=front?projection.state.nodes[front]:undefined;return node?.children[0]&&projection.state.nodes[node.children[0]];};
 const [resourceKey,setResourceKey]=createSignal<string>();
 const payload=()=>{const n=resource();return n?n.payload:resourceKey()?editor.repository.state.contents[resourceKey()!]?.payload:undefined;};
 const source=()=>{const p=payload() as any;const value=p?.sourceUrl??p?.metadata?.url??p?.pdf?.sourceUrl??p?.web?.source??p?.academic?.source??p?.src;try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:undefined;}catch{return undefined;}};
 // Resolve the explicit source once per information occurrence, including an
 // eventual unwrap. Do not build an inventory on document edits.
 onMount(()=>{const node=projection.state.nodes[props.nodeKey],ref=(node?.payload.blockProperties as any[]??[]).find(p=>p.type==='codex/block-reference'&&!p.isDeleted)?.value;
  if(ref&&!passive)untrack(()=>{const nativeResource=resource();setResourceKey(nativeResource&&nativeResource.payload.id===ref?nativeResource.contentKey:Object.values(editor.repository.readState().contents).find(c=>c.payload.id===ref)?.key);});
  const release=editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:passive?'opaque-widget':'container',focus:()=>root.focus()});onCleanup(release);});
 createEffect(()=>{const owner=surface();if(!owner)return;editor.surfaces.setInformationTarget(owner.key,root);onCleanup(()=>{if(editor.surfaces.informationTarget(owner.key)===root)editor.surfaces.setInformationTarget(owner.key,undefined);});});
 return <div ref={root} tabindex="-1" class="resource-reverse-information" data-runtime-key={props.nodeKey} data-client-id={props.nodeKey}>
  <Show when={source()}>{url=><p><a href={url()} target="_blank" rel="noopener noreferrer">Open original resource</a> <button onClick={()=>void navigator.clipboard.writeText(url()).catch(()=>editor.blockSelection.setMessage('Could not copy the URL.'))}>Copy URL</button></p>}</Show>
  <Show when={payload()}><details><summary>Stored resource attributes</summary><pre>{JSON.stringify(payload(),null,2)}</pre></details></Show>
 </div>;
}
export function ReversibleSurfaceView(props:BlockViewProps) {
 const {editor,projection,passive}=useReactiveView(),node=()=>projection.state.nodes[props.nodeKey],children=()=>node()?.children??[];
 const active=()=>{const key=editor.viewChildren[props.nodeKey];return key&&children().includes(key)?key:children()[0];};
 let root!:HTMLDivElement;
 const scrolled=new Map<HTMLElement,[number,number]>(),lastFocused=new Map<string,string>(),focusTargets=new Map<string,HTMLElement>();
 const memories=new Map<string,{key?:string;focusTarget?:HTMLElement;selection?:{anchor:number;head:number};scrolls:Array<[HTMLElement,number,number]>}>();
 const reveal=(next:string)=>{
  const current=active();if(next===current||!children().includes(next))return;
  const face=Array.from(root.children).find(el=>(el as HTMLElement).dataset.faceKey===current) as HTMLElement|undefined;
  const focused=editor.mounts.resolveElement(document.activeElement),saved=lastFocused.get(current),old=saved&&editor.mounts.get(saved);
  const mounted=focused&&face?.contains(focused.handle.root)?focused:old&&saved?{nodeKey:saved,handle:old}:undefined;
  const range=mounted&&editor.selections.sets[mounted.nodeKey]?.items.find(i=>i.id===editor.selections.sets[mounted.nodeKey]?.primaryId);
  memories.set(current,{key:mounted?.nodeKey,focusTarget:document.activeElement instanceof HTMLElement&&mounted?.handle.root.contains(document.activeElement)?document.activeElement:focusTargets.get(current),selection:mounted?.handle.captureInlineSelection?.()??(range?{anchor:range.anchor.boundary.index,head:range.head.boundary.index}:undefined),scrolls:[...scrolled].filter(([el])=>face?.contains(el)).map(([el,[top,left]])=>[el,top,left])});
  editor.setViewChild(props.nodeKey,next);
  queueMicrotask(()=>{
   if(!root.isConnected||active()!==next)return;
   if(passive)return;
   const memory=memories.get(next),face=Array.from(root.children).find(el=>(el as HTMLElement).dataset.faceKey===next) as HTMLElement|undefined;
   const mount=memory?.key&&editor.mounts.get(memory.key);
   if(mount&&face?.contains(mount.root)){if(memory?.focusTarget&&mount.root.contains(memory.focusTarget))memory.focusTarget.focus({preventScroll:true});else mount.focus();if(memory?.selection)mount.restoreInlineSelection?.(memory.selection);}
   else (face?.querySelector<HTMLElement>('[contenteditable="true"],textarea')??face?.querySelector<HTMLElement>('button,[tabindex="0"]'))?.focus({preventScroll:true});
   memory?.scrolls.forEach(([el,top,left])=>{el.scrollTop=top;el.scrollLeft=left;});
  });
 };
 onMount(()=>{
  const scroll=(event:Event)=>{const el=event.target;if(el instanceof HTMLElement)scrolled.set(el,[el.scrollTop,el.scrollLeft]);};
  const focus=(event:FocusEvent)=>{const mount=editor.mounts.resolveEvent(event);if(mount&&mount.nodeKey!==props.nodeKey){lastFocused.set(active(),mount.nodeKey);if(event.target instanceof HTMLElement)focusTargets.set(active(),event.target);}};
  root.addEventListener('scroll',scroll,true);root.addEventListener('focusin',focus);
  const unregister=editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:passive?'opaque-widget':'container',focus:()=>root.focus()});
  const release=editor.surfaces.register(props.nodeKey,{reveal,flip:()=>{const list=children();if(list.length>1)reveal(list[(list.indexOf(active())+1)%list.length]);}});
  onCleanup(()=>{root.removeEventListener('scroll',scroll,true);root.removeEventListener('focusin',focus);scrolled.clear();unregister();release();});
 });
 return <div ref={root} tabindex="-1" class="abstract-block reversible-surface" classList={{'reversible-surface--has-reverse':children().length>1}} data-runtime-key={props.nodeKey} data-client-id={props.nodeKey} data-block-type="surface-block">
  <For each={children()}>{key=><div class="reversible-face" classList={{'reversible-face--active':active()===key}} data-face-key={key} data-surface-face="" aria-hidden={active()!==key} inert={active()!==key}>
   <BlockOutlet nodeKey={key}/>
  </div>}</For>
  <Show when={children().length > 1}>
   <button type="button" class="surface-fold" classList={{'surface-fold--back':active()!==children()[0]}}
    contentEditable={false}
    aria-label={active()===children()[0]?'Show reverse side':'Return to front side'}
    title={active()===children()[0]?'Show reverse side':'Return to front side'}
    on:pointerdown={event=>event.stopPropagation()}
    on:mousedown={event=>{event.preventDefault();event.stopPropagation();}}
    on:keydown={event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();}}
    on:dblclick={event=>{event.preventDefault();event.stopPropagation();}}
    on:click={event=>{
     event.stopPropagation();
     if(editor.commandRegistry.permit?.(props.nodeKey,'surface.flip')===false||(!passive&&editor.completionInput?.beforeSave?.()===false))return;
     const button=event.currentTarget,keyboard=event.detail===0;
     // Use the same controller operation as menus, commands and navigation.
     // A corner always belongs to this surface, irrespective of Block selection.
     reveal(active()===children()[0]?children()[1]:children()[0]);
     if(keyboard)queueMicrotask(()=>{if(button.isConnected)button.focus({preventScroll:true});});
    }}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
     <path class="surface-fold__paper" d="M2 2h20L2 22Z"/>
     <path class="surface-fold__crease" d="M2 2l3 14-3 6V2Z"/>
    </svg>
   </button>
  </Show>
 </div>;
}
