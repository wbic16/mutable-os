import {For,Show,createEffect,onCleanup,onMount} from 'solid-js';
import {cardexPresentationPorts,type CardexPresentationPort} from '../../application/cardex-presentation-ports';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import {detailTabs} from '../cardex/details';
/** Retain native field editors and semantic forms; presentation switching never serializes drafts. */
export function RetainedInstrumentSlot(props:{element:HTMLElement|undefined}) {
 let slot!:HTMLDivElement;
 onMount(()=>createEffect(()=>{const element=props.element;if(!element)return;const parent=element.parentNode,next=element.nextSibling;if(!parent)return;slot.append(element);onCleanup(()=>{if(element.parentNode===slot&&parent.isConnected&&props.element===element)parent.insertBefore(element,next?.parentNode===parent?next:null);else if(element.parentNode===slot)element.remove();});}));
 return <div ref={slot} class="tw-retained-instrument"/>;
}
const presented=new WeakSet<CardexPresentationPort>();
export function TextualCardex(props:{editor:ReactiveEditor;port:CardexPresentationPort;choose(key:string):void;close(navigation?:string|true):void}) {
 const p=props.port;
 if(presented.has(p))throw Error('Cardex Instrument already has an interactive presentation');
 presented.add(p);onCleanup(()=>presented.delete(p));
 const registry=cardexPresentationPorts(props.editor);
 const navigation=p.navigation();
 createEffect(()=>{const next=p.navigation();if(next&&next!==navigation)props.close(next.applicationKey??true);});
 return <><div class="tw-cardex-caption">Cardex · Entities</div><section class="tw-instrument tw-cardex" aria-label="Textual Cardex" data-mwm-window={p.windowKey?props.editor.windowManager?.ownerForNode(p.windowKey):undefined} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'&&!e.isComposing){e.preventDefault();e.stopPropagation();void p.save();}}}>
  <header><strong>Cardex · Entities</strong><Show when={registry.ports().length>1}><select aria-label="Cardex Instrument" disabled={!p.canPresent()} value={p.key} onChange={e=>props.choose(e.currentTarget.value)}><For each={registry.ports()}>{(item,i)=><option value={item.key}>{item.saved()?.name??`Cardex ${i()+1}`}</option>}</For></select></Show><button disabled={!p.canPresent()} onClick={()=>props.close()}>Return to Flint</button></header>
  <p>{p.vault()}{p.dirty()?' · Unsaved changes':''}</p><p role="status">{p.notice()}</p>
  <Show when={p.ready()} fallback={<p>Opening Entity service…</p>}>
   <Show when={p.draft()} fallback={<><button disabled={p.busy()} onClick={p.add}>Add Entity</button><RetainedInstrumentSlot element={p.search()??p.legacy()}/></>}>
    <nav class="tw-tool-row"><button disabled={p.busy()} onClick={p.back}>Back to search</button><For each={props.editor.features.cardexIncrement2?detailTabs:['Identity']}>{tab=><button aria-pressed={p.activeTab()===tab} onClick={()=>p.selectTab(tab)}>{tab}</button>}</For></nav>
    <div class="tw-instrument-body"><RetainedInstrumentSlot element={p.identity()}/><RetainedInstrumentSlot element={p.details()}/></div>
    <footer><button disabled={p.busy()} onClick={()=>void p.save()}>{p.pending()?'Retry operation':'Save Entity'}</button><button disabled={p.busy()} onClick={p.back}>Cancel</button><Show when={p.saved()}><button disabled={p.busy()||p.dirty()||!!p.pending()} onClick={()=>void p.deletion()}>{p.saved()?.deletedUtc?'Restore…':'Delete…'}</button></Show></footer>
   </Show>
  </Show>
 </section></>;
}
