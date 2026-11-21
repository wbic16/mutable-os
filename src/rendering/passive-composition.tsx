import {contentLength} from '../block-tree/inline-sequence';
import {Show,onCleanup,onMount,untrack,createSignal,createEffect} from 'solid-js';
import type {ReactiveEditor} from '../reactive-editor/editor';
import type {BlockTreeProjection} from '../block-tree/projection';
import {ReactiveViewProvider} from '../reactive-editor/context';
import {BlockOutlet} from './block-outlet';
import {installPassiveInput} from '../runtime/passive-presentation';

export interface PassiveMemberState { children:Record<string,string> }
/** Preflight only the requested closure, including hidden faces and Cells. */
export function admitPassiveComposition(editor:ReactiveEditor,placement:string) {
 const state=editor.repository.readState(),queue=[{key:placement,ancestors:new Set<string>()}];let cells=0,blocks=0;
 while(queue.length){const item=queue.pop()!,p=state.placements[item.key];if(!p||p.externalReference)continue;const c=state.contents[p.contentKey];if(!c||item.ancestors.has(c.key))continue;
  if(c.viewType==='text-cell'||c.viewType==='image-cell'){if(++cells>30000)throw Error('This composition exceeds the 30,000 Cell presentation budget. Open source for its complete native view.');continue;}
  if(++blocks>240)throw Error('This composition exceeds the 240 Block presentation budget. Open source for its complete native view.');
  if(cells+contentLength(c)>30000)throw Error('This composition exceeds the 30,000 Cell presentation budget. Open source for its complete native view.');
  if(c.compactInline)cells+=contentLength(c);
  const ancestors=new Set(item.ancestors).add(c.key);queue.push(...[...c.children,...c.inlineContent,...Object.values(c.ownedRelations)].map(key=>({key,ancestors})));
 }
 return {cells,blocks};
}
/** New DOM occurrences, same repository and canonical identities. Never a session. */
export function PassiveComposition(props:{editor:ReactiveEditor;placement:string;state:PassiveMemberState;openSource:()=>void;memberId:string;textual?:boolean}) {
 let projection:BlockTreeProjection|undefined,error='';const start=performance.now(),editor=props.editor;
 try {untrack(()=>{admitPassiveComposition(editor,props.placement);projection=editor.createView('passive:'+crypto.randomUUID(),props.placement);editor.passiveViews.add(projection.viewId);
  for(const [parent,child] of Object.entries(props.state.children)){const state=editor.repository.readState(),p=state.placements[parent];if(!p)continue;for(const node of projection.nodesForContent(p.contentKey)){const selected=node.children.find(k=>projection!.node(k)?.placementKey===child);if(selected)editor.setViewChild(node.key,selected);}}
 });}catch(e){error=String(e);}
 createEffect(()=>{if(!projection)return;const queue=[projection.state.rootKey];while(queue.length){const n=projection.node(queue.pop()!);if(!n)continue;const child=editor.viewChildren[n.key];if(child&&projection.node(child))props.state.children[n.placementKey]=projection.node(child)!.placementKey;queue.push(...n.children,...Object.values(n.ownedRelations));}});
 let root!:HTMLDivElement;const [ready,setReady]=createSignal(false);
 onMount(()=>{const release=installPassiveInput(root.ownerDocument.defaultView!);onCleanup(release);setReady(true);root.dataset.mountMs=String(performance.now()-start);});
 onCleanup(()=>{if(!projection)return;untrack(()=>{const queue=[projection!.state.rootKey];while(queue.length){const n=projection!.node(queue.pop()!);if(!n)continue;const child=editor.viewChildren[n.key];if(child&&projection!.node(child))props.state.children[n.placementKey]=projection!.node(child)!.placementKey;queue.push(...n.children,...Object.values(n.ownedRelations));}editor.disposeView(projection!);});});
 return <div ref={root} class="native-passive-composition" classList={{'tw-flint-editor':!!props.textual}} data-native-passive={props.memberId} data-ready={ready()} tabindex="0" onPointerDown={event=>{if(!(event.target as Element).closest('button,a,input,select,video,audio,[tabindex]')?.matches(':not(.native-passive-composition)'))root.focus({preventScroll:true});}}>
  <Show when={projection} fallback={<aside role="status"><p>{error}</p><button onClick={props.openSource}>Open source</button></aside>}>{p=><ReactiveViewProvider editor={editor} projection={p()} passive openSource={props.openSource}><BlockOutlet nodeKey={p().state.rootKey}/></ReactiveViewProvider>}</Show>
 </div>;
}
