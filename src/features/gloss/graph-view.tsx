import {For,Show,createEffect,createMemo,createSignal,onCleanup,onMount,untrack} from 'solid-js';
import {diagramFrame} from '../../structured/mermaid-view';
import type {GlossSessionIndex} from './session-index';
import type {GlossRegisterState} from './relationship-authoring';
import {glossGraphToMermaid,type GlossMermaidResult} from './mermaid';
import './graph-view.css';
import {retainGlossGraphFrame} from './graph-frame';
export function createGlossGraphState(){return{tab:createSignal<'references'|'graph'|'argument'>('references'),scope:createSignal<'selected'|'document'>('selected'),root:createSignal(''),depth:createSignal(2),direction:createSignal<'TD'|'LR'>('TD'),predicate:createSignal(''),orphans:createSignal(true),limit:createSignal(60),natural:createSignal(false)};}
export type GlossGraphState=ReturnType<typeof createGlossGraphState>;
export function GlossGraphView(props:{hostPort?:()=>unknown;navigationEnabled?:boolean;active?:()=>boolean;definition?:(id:string,invoker:HTMLElement)=>void;index:GlossSessionIndex;state:GlossGraphState;registerState:GlossRegisterState;select:(id:string,reveal?:boolean)=>void;inspect:(id:string)=>void;diagnostics:{generations:number;renders:number;generationMs:number[];renderMs:number[]}}){
 const graph=props.index.relationships!,s=props.state,[result,setResult]=createSignal<GlossMermaidResult>(),[status,setStatus]=createSignal('Preparing graph…'),[pending,setPending]=createSignal(false),[copied,setCopied]=createSignal(''),[retry,setRetry]=createSignal(0),[control,setControl]=createSignal<{selectNode:(token?:string)=>void}>();
 let host!:HTMLDivElement,picker!:HTMLSelectElement,alive=true;onCleanup(()=>alive=false);
 const entries=createMemo(()=>props.index.rows[0]().filter(row=>graph.nodes(row.localId).length===1));
 if(!s.root[0]())s.root[1](untrack(()=>props.registerState.selected[0]()||entries()[0]?.localId||''));
 const root=()=>s.root[0]()||entries()[0]?.localId||'';
 const generated=createMemo(()=>{
  if(s.scope[0]()==='document')graph.revision();
  const anchored=s.orphans[0]()?undefined:new Set(entries().filter(row=>row.occurrences().length).map(row=>row.localId));
  const options={scope:s.scope[0](),rootGlossId:root(),direction:s.direction[0](),maxDepth:s.depth[0](),maxNodes:s.limit[0](),maxEdges:Math.min(160,s.limit[0]()*2),relationshipTypes:s.predicate[0]()?[s.predicate[0]()]:undefined,includeOrphans:s.orphans[0](),anchoredGlossIds:anchored};
  const start=performance.now(),value=glossGraphToMermaid(graph,options);props.diagnostics.generations++;props.diagnostics.generationMs.push(performance.now()-start);if(props.diagnostics.generationMs.length>100)props.diagnostics.generationMs.shift();return value;
 },undefined,{equals:(a,b)=>a?.source===b.source&&JSON.stringify(a?.warnings)===JSON.stringify(b.warnings)&&a?.excludedRelationships===b.excludedRelationships&&JSON.stringify([...a?.nodeToGlossId??[]])===JSON.stringify([...b.nodeToGlossId])});
 const renderSource=createMemo(()=>JSON.stringify([generated().source,[...generated().nodeToGlossId]]));
 const tokenForSelection=createMemo(()=>new Map([...result()?.nodeToGlossId??[]].map(([token,id])=>[id,token])));
 createEffect(()=>control()?.selectNode(tokenForSelection().get(props.registerState.selected[0]())));
 createEffect(()=>{if(!props.registerState.selected[0]()){const first=result()?.nodeToGlossId.values().next().value;if(first)props.registerState.selected[1](first);}});
 createEffect(()=>{setResult(generated());setCopied('');});
 onMount(()=>createEffect(()=>{
  props.hostPort?.(); // Moving an iframe restarts its browsing context; regenerate this disposable view.
  retry();renderSource();const next=untrack(generated),natural=s.natural[0]();
  const controller=new AbortController();let dispose:Awaited<ReturnType<typeof diagramFrame>>|undefined;
  // Bound burst coalescing. No scheduling occurs while this component is hidden.
  const timer=setTimeout(async()=>{if(controller.signal.aborted)return;if(!next.includedNodes){host.replaceChildren();setPending(false);setStatus('No Glosses match this graph. Choose another root or filter.');return;}
   setPending(true);setStatus('Rendering graph…');props.diagnostics.renders++;const start=performance.now();
   try{dispose=await diagramFrame(host,next.source,controller.signal,error=>{if(!alive||controller.signal.aborted)return;props.diagnostics.renderMs.push(performance.now()-start);if(props.diagnostics.renderMs.length>100)props.diagnostics.renderMs.shift();setPending(false);setStatus(error?'Diagram unavailable: '+error:'Graph ready');},{naturalSize:natural,numericLabelEntities:true,navigation:props.navigationEnabled?{nodes:Object.fromEntries([...next.nodeToGlossId].map(([token,id])=>[token,(graph.nodes(id)[0]?.raw??id).slice(0,1000)])),selected:tokenForSelection().get(props.registerState.selected[0]()),onSelect:token=>{if(!alive||controller.signal.aborted||props.active?.()===false)return;const id=next.nodeToGlossId.get(token);if(!id||result()?.nodeToGlossId.get(token)!==id)return;const nodes=graph.nodes(id);if(nodes.length!==1||nodes[0].deleted)return;props.registerState.selected[1](id);}}:undefined});setControl({selectNode:dispose.selectNode});if(controller.signal.aborted)dispose?.();else{const frame=host.querySelector('iframe');if(frame){const release=retainGlossGraphFrame(frame),remove=dispose;dispose=Object.assign(()=>{release();remove?.();},{selectNode:remove.selectNode,viewport:remove.viewport,thumbnail:remove.thumbnail});}}}
   catch(error){if(!alive||controller.signal.aborted)return;setPending(false);setStatus('Diagram unavailable: '+String(error));host.replaceChildren();}
  },60);
  onCleanup(()=>{clearTimeout(timer);controller.abort();dispose?.();setControl(undefined);});
 }));
 const selected=()=>props.registerState.selected[0]();
 // Dynamic options settle before the native select accepts its retained value.
 createEffect(()=>{result();const id=selected();queueMicrotask(()=>{if(alive&&selected()===id&&picker.value!==id)picker.value=id;});});
 const label=(id:string)=>{const nodes=graph.nodes(id);return nodes.length===1&&!nodes[0].deleted?nodes[0].raw:'Unavailable Gloss';};
 const currentEntry=()=>{const nodes=graph.nodes(selected());return nodes.length===1&&!nodes[0].deleted?entries().find(row=>row.localId===selected()):undefined;};
 const copy=async()=>{const text=result()?.source;if(!text)return;try{await navigator.clipboard.writeText(text);if(alive)setCopied('Mermaid copied.');}catch{if(alive)setCopied('Clipboard unavailable. Select and copy the source below.');}};
 return <section class="gloss-graph" aria-label="Gloss relationship graph" on:keydown={e=>{if((e.target as Element).closest('input,select,textarea'))e.stopPropagation();}}>
  <div class="gloss-graph-controls">
   <label>Scope<select aria-label="Graph scope" value={s.scope[0]()} onChange={e=>s.scope[1](e.currentTarget.value as 'selected'|'document')}><option value="selected">Selected Gloss</option><option value="document">Entire Document</option></select></label>
   <Show when={s.scope[0]()==='selected'}><label>Root<select aria-label="Graph root" value={root()} onChange={e=>{s.root[1](e.currentTarget.value);props.registerState.selected[1](e.currentTarget.value);}}><Show when={root()&&!entries().some(row=>row.localId===root())}><option value={root()}>Selected Gloss unavailable</option></Show><For each={entries()}>{row=><option value={row.localId}>{row.data().alias||row.data().raw.slice(0,90)}</option>}</For></select></label><label>Depth<select aria-label="Graph depth" value={s.depth[0]()} onChange={e=>s.depth[1](Number(e.currentTarget.value))}><For each={[1,2,3,4,6]}>{n=><option value={n}>{n}</option>}</For></select></label></Show>
   <label>Direction<select aria-label="Graph direction" value={s.direction[0]()} onChange={e=>s.direction[1](e.currentTarget.value as 'TD'|'LR')}><option value="TD">Top down</option><option value="LR">Left to right</option></select></label>
   <label>Relationships<select aria-label="Graph relationship filter" value={s.predicate[0]()} onChange={e=>s.predicate[1](e.currentTarget.value)}><option value="">All types</option><Show when={s.predicate[0]()&&!graph.types().includes(s.predicate[0]())}><option value={s.predicate[0]()}>{s.predicate[0]()} (unavailable)</option></Show><For each={graph.types()}>{type=><option value={type}>{type}</option>}</For></select></label>
   <label>Node limit<select aria-label="Graph node limit" value={s.limit[0]()} onChange={e=>s.limit[1](Number(e.currentTarget.value))}><For each={[30,60,100]}>{n=><option value={n}>{n}</option>}</For></select></label>
   <label><input type="checkbox" checked={s.orphans[0]()} onChange={e=>s.orphans[1](e.currentTarget.checked)}/>Include unanchored</label>
   <label><input type="checkbox" checked={s.natural[0]()} onChange={e=>s.natural[1](e.currentTarget.checked)}/>Actual size (scroll)</label>
  </div>
  <p class="gloss-graph-summary">{result()?.includedNodes??0} Glosses · {result()?.includedEdges??0} relationships <Show when={result()?.truncated}><strong>· Truncated</strong></Show></p>
  <For each={result()?.warnings??[]}>{warning=><p role="status" class="gloss-graph-warning">{warning}</p>}</For>
  <Show when={graph.issues().length}><p class="gloss-graph-warning">{graph.issues().length} problem relationship(s) in this Document are omitted. Repair them in References.</p></Show>
  <p role="status" data-graph-status aria-live="polite">{status()}</p>
  <Show when={status().startsWith("Diagram unavailable")}><button type="button" onClick={()=>setRetry(n=>n+1)}>Retry diagram</button></Show>
  <div ref={host} class="gloss-graph-canvas" aria-busy={pending()}/>
  <div class="gloss-graph-navigation"><label>Gloss<select ref={picker} aria-label="Diagram Gloss" onChange={e=>{props.registerState.selected[1](e.currentTarget.value);}}><Show when={!tokenForSelection().has(selected())}><option value={selected()}>{selected()?label(selected())+" (not in this graph)":"Select a Gloss"}</option></Show><For each={[...result()?.nodeToGlossId.values()??[]]}>{id=><option value={id}>{label(id).slice(0,100)}</option>}</For></select></label>
   <button type="button" disabled={!currentEntry()} onPointerDown={e=>e.preventDefault()} onClick={()=>props.inspect(selected())}>Show in References</button><button type="button" disabled={!currentEntry()?.occurrences().length} onPointerDown={e=>e.preventDefault()} onClick={()=>props.select(selected(),true)}>Reveal passage</button><Show when={currentEntry()&&!currentEntry()!.occurrences().length&&props.definition}><button type="button" onPointerDown={e=>e.preventDefault()} onClick={e=>props.definition?.(selected(),e.currentTarget)}>Open Definition</button></Show>
  </div>
  <div class="gloss-graph-export"><button type="button" disabled={!result()?.includedNodes} onClick={()=>void copy()}>Copy Mermaid</button><span role="status">{copied()}</span></div>
  <details><summary>Mermaid source</summary><textarea aria-label="Generated Mermaid source" readOnly value={result()?.source??''}/></details>
 </section>;
}
