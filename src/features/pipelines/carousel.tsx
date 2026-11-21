import {For,Show,createEffect,createSignal,onCleanup,type Component} from 'solid-js';
import type {PipelineRun,PipeOccurrence} from './runtime';
import './carousel.css';
export interface PipePresentation {view:Component<{controller:any}>}
/** One retained element per occurrence. Navigation never replaces a panel. */
export function PipelineCarousel(props:{run:PipelineRun;presentations:Record<string,PipePresentation>;notice?:string;close():void}){
 const run=props.run,[expanded,setExpanded]=createSignal<string>();let scroller!:HTMLDivElement;const panels=new Map<string,HTMLElement>();let frame=0;
 createEffect(()=>{const id=run.active();setExpanded(undefined);cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const panel=panels.get(id);if(panel&&scroller){const left=panel.offsetLeft-(scroller.clientWidth-panel.offsetWidth)/2;scroller.scrollTo({left:Math.max(0,left),behavior:'smooth'});}});});onCleanup(()=>cancelAnimationFrame(frame));
 const close=()=>{if(run.state()!=='running'||run.cancel())props.close();};
 return <section class="pipeline-host" role="dialog" aria-label={run.definition.title} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(expanded())setExpanded(undefined);else close();}}}>
  <header class="pipeline-header"><div><small>PIPELINE</small><h2>{run.definition.title}</h2></div><span role="status">{run.state()==='completed'?'Completed':run.info(run.active()).status}</span><button aria-label="Close Pipeline" disabled={!!run.guard()} onClick={close}>×</button></header>
  <Show when={props.notice}><p class="pipeline-notice pipeline-source-error" role="alert">{props.notice}</p></Show>
  <Show when={run.guard()}><p class="pipeline-notice" role="status">{run.guard()}</p></Show>
  <div ref={scroller} class="pipeline-carousel" classList={{'pipeline-expanded':!!expanded()}}>
   <For each={run.definition.pipes}>{spec=>{
    const visible=()=>run.path().some(p=>p.id===spec.id),info=()=>run.info(spec.id),active=()=>run.active()===spec.id&&run.state()==='running';
    const View=props.presentations[spec.pipe.id].view;
    return <article ref={el=>panels.set(spec.id,el)} class="pipeline-pipe" style={{'--pipe-width':`${spec.width??440}px`}} hidden={!visible()||!!expanded()&&expanded()!==spec.id} classList={{'pipeline-pipe-active':active(),'pipeline-pipe-stale':info().stale}}>
     <div class="pipeline-process"><button disabled={!info().mounted||!!run.guard()||run.state()!=='running'} onClick={()=>run.navigate(spec.id)}>{spec.label}</button><Show when={run.path().at(-1)?.id!==spec.id}><span aria-hidden="true">→</span></Show></div>
     <div class="pipeline-window"><header><strong>{spec.pipe.title}</strong><span>{info().stale?'Needs review':info().complete?'Completed':info().status}</span><button aria-label={expanded()?'Restore Pipe size':'Expand Pipe'} disabled={!active()} onClick={()=>setExpanded(expanded()?undefined:spec.id)}>⤢</button></header>
      <div class="pipeline-body" inert={!active()||info().stale||info().executing}>
       <Show when={info().mounted} fallback={<p class="pipeline-waiting">Available after the preceding step.</p>}><View controller={run.controller(spec.id)}/></Show>
      </div>
      <Show when={info().error}><p role="alert" class="pipeline-error">{info().error}</p></Show>
      <footer><Show when={active()}>
       <Show when={spec.id!==run.definition.start}><button disabled={!!run.guard()} onClick={()=>{const path=run.path(),index=path.findIndex(p=>p.id===spec.id);run.navigate(path[index-1].id);}}>Back</button></Show>
       <Show when={info().stale}><button onClick={()=>run.navigate(spec.id)}>Review updated inputs</button></Show>
       <For each={run.actions(spec.id)}>{action=><button classList={{primary:!!action.primary}} disabled={!action.enabled||info().status==='busy'} onClick={()=>void run.execute(action.id)}>{action.label}</button>}</For>
       <button disabled={!!run.guard()} onClick={close}>Cancel</button>
      </Show><Show when={run.state()==='completed'&&run.active()===spec.id}><button onClick={close}>Done</button></Show></footer>
     </div>
    </article>;
   }}</For>
  </div>
 </section>;
}
