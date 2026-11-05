import {Dynamic} from 'solid-js/web';
import {useInstrumentPresentations} from '../../rendering/instrument-presentations';
import {GlossArgumentView} from './argument-view';
import {createArgumentState,createArgumentDiagnostics,type ArgumentState} from './argument';
import {GlossGraphView,createGlossGraphState,type GlossGraphState} from './graph-view';
import {createGlossRegisterState,createRelationshipAuthoring,type GlossRegisterState} from './relationship-authoring';
import {For,Show,createEffect,createMemo,createSignal,onCleanup,onMount,untrack,type JSX} from 'solid-js';
import {Portal} from 'solid-js/web';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {RetainedDocumentSession} from '../../application/document-sessions';
import {ancestorPath,type SearchMatch} from '../../runtime/text-search';
import {revealMatch} from '../../runtime/reveal-match';
import {GlossSessionIndex,type GlossEntry,type GlossOccurrence} from './session-index';
import {GlossPresentationContext,ownGlossPresentation} from './presentation-context';
import './presentation.css';

/** Presentation lives in the retained render root. Children are never conditional,
 * moved, or recreated when mode changes or this session transfers hosts. */
export function GlossPresentation(props:{editor:ReactiveEditor;session:RetainedDocumentSession;children:JSX.Element}){
 const {editor,session}=props,enabled=editor.features.glossMode&&editor.features.glossPresentation;
 const [active,setActive]=createSignal(false),[narrow,setNarrow]=createSignal(false),[drawer,setDrawer]=createSignal(false),[fallback,setFallback]=createSignal(false);
 const registerState=createGlossRegisterState(),graphState=createGlossGraphState(),argumentState=createArgumentState();
 const presenters=useInstrumentPresentations();
 const controls={active,narrow,references:()=>presenters?.()?.gloss?drawer():!narrow()||drawer(),toggle:()=>{setActive(v=>!v);if(active()&&presenters?.()?.gloss)setDrawer(true);},toggleReferences:()=>setDrawer(v=>!v)};
 if(enabled)onCleanup(ownGlossPresentation(session,controls));
 let alive=true;
 onMount(()=>{if(!enabled)return;setFallback(!session.element.querySelector('.reactive-document-occurrence'));
  const resize=()=>{if(!alive)return;let parent=session.element.parentElement;while(parent&&!parent.clientWidth)parent=parent.parentElement;const width=active()?session.element.clientWidth:parent?.clientWidth??0;if(!width)return;setNarrow(width<980||!!session.element.querySelector('.reactive-page'));};
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(resize);let sized=session.element.parentElement;while(sized&&!sized.clientWidth)sized=sized.parentElement;if(sized)observer?.observe(sized);observer?.observe(session.element);
  createEffect(()=>{session.host.port;session.host.coordinates.scale();untrack(resize);});resize();
  onCleanup(()=>{observer?.disconnect();});
 });
 createEffect(()=>{const on=enabled&&active();session.element.classList.toggle('gloss-presenting',on);session.element.classList.toggle('gloss-presentation-narrow',narrow());session.element.classList.toggle('gloss-references-open',controls.references());session.element.classList.toggle('gloss-presentation-ink',fallback());session.element.style.display=on?'grid':'contents';});
 onCleanup(()=>{alive=false;session.element.style.display='contents';session.element.classList.remove('gloss-presenting','gloss-presentation-narrow','gloss-references-open','gloss-presentation-ink');});
 return <GlossPresentationContext.Provider value={enabled?controls:undefined}>
  <Show when={enabled&&fallback()}><div class="gloss-mode-strip"><button type="button" data-gloss-toggle aria-pressed={active()} onPointerDown={e=>e.preventDefault()} onClick={controls.toggle}>Gloss Mode</button><Show when={active()&&narrow()}><button type="button" aria-expanded={drawer()} onClick={controls.toggleReferences}>Local References</button></Show></div></Show>
  {props.children}
  <Show when={enabled&&active()}><GlossViews argumentState={argumentState} graphState={graphState} registerState={registerState} editor={editor} session={session} narrow={narrow()} references={controls.references()} closeReferences={()=>setDrawer(false)}/></Show>
 </GlossPresentationContext.Provider>;
}

function createGlossViewModel(props:{argumentState:ArgumentState;graphState:GlossGraphState;registerState:GlossRegisterState;editor:ReactiveEditor;session:RetainedDocumentSession;narrow:boolean;references:boolean;closeReferences():void}){
 const views=useInstrumentPresentations();
 const {editor,session}=props,index=new GlossSessionIndex(editor,session.projection,session.rootKey);
 const graphEnabled=editor.features.glossMermaidGraph&&!!index.relationships,graphSelected=()=>graphEnabled&&props.graphState.tab[0]()==='graph'&&props.references,graphActive=()=>graphSelected()&&session.host.activity().visible;
 const argumentEnabled=editor.features.glossArgumentExplorer&&!!index.relationships,argumentSelected=()=>argumentEnabled&&props.graphState.tab[0]()==='argument'&&props.references,argumentActive=()=>argumentSelected()&&session.host.activity().visible,exploring=()=>graphSelected()||argumentSelected();
 const argumentDiagnostics=createArgumentDiagnostics();(session.element as any).glossArgumentDiagnostics=argumentDiagnostics;
 createEffect(()=>session.element.classList.toggle('gloss-showing-argument',argumentSelected()));
 onCleanup(()=>{session.element.classList.remove('gloss-showing-argument');delete (session.element as any).glossArgumentDiagnostics;});
 const graphDiagnostics={generations:0,renders:0,generationMs:[] as number[],renderMs:[] as number[]};(session.element as any).glossGraphDiagnostics=graphDiagnostics;
 createEffect(()=>session.element.classList.toggle('gloss-showing-graph',graphSelected()));
 onCleanup(()=>{session.element.classList.remove('gloss-showing-graph');delete (session.element as any).glossGraphDiagnostics;});
 const [selected,setSelected]=props.registerState.selected,[query,setQuery]=props.registerState.query,[type,setType]=props.registerState.type,[message,setMessage]=createSignal('');
 const [source,setSource]=createSignal<HTMLElement>(),[scrollport,setScrollport]=createSignal<HTMLElement>();let live=true;
 // Exposed only on this session's DOM for qualification/diagnostics, never persisted.
 (session.element as any).glossIndex=index;
 onMount(()=>{const root=editor.mounts.get(session.rootKey)?.root??session.element.querySelector<HTMLElement>('[data-block-type="document-block"]')!;if(!(root instanceof HTMLElement))return;
  setSource(root);const port=session.element.querySelector<HTMLElement>('.reactive-document-occurrence__content')??root;setScrollport(port);port.dataset.glossScrollport='';
  onCleanup(()=>{delete port.dataset.glossScrollport;root?.classList.remove('gloss-source-with-margin');});
 });
 createEffect(()=>source()?.classList.toggle('gloss-source-with-margin',!props.narrow&&!exploring()&&!views?.()?.gloss));
 onCleanup(()=>{live=false;index.dispose();delete (session.element as any).glossIndex;});
 const types=createMemo(()=>[...new Set(index.rows[0]().map(e=>e.data().type).filter(Boolean))].sort());
 const filtered=createMemo(()=>{const q=query().trim().toLocaleLowerCase(),t=type();return index.rows[0]().filter(e=>{const d=e.data();return (!t||d.type===t)&&(!q||`${d.type} ${d.body} ${d.alias}`.toLocaleLowerCase().includes(q));});});
 const navigate=async(entry:GlossEntry,occurrence?:GlossOccurrence,edit=false,invoker?:HTMLElement)=>{
  setSelected(entry.localId);const anchor=occurrence??entry.occurrences().find(a=>editor.mounts.get(a.nodeKey))??entry.occurrences()[0];
  if(!anchor){setMessage('Anchor removed. This Gloss can still be edited or deleted.');if(edit)editor.gloss.openDefinition(session.rootKey,entry.definitionId,invoker);return;}
  const range=index.range(anchor);if(!range){setMessage('This anchor changed. Choose the Gloss again.');return;}
  const path=ancestorPath(editor,anchor.nodeKey).map(n=>n.key);
  const revealed=await revealMatch(editor,{path,ranges:[{nodeKey:anchor.nodeKey,start:range.start,coordinate:'cell'}]} as SearchMatch,()=>live&&session.current());
  if(!revealed){setMessage('The source occurrence is not available in this view.');return;}
  const current=index.range(anchor),h=editor.mounts.get(anchor.nodeKey);if(!current||!h)return;
  h.focus();h.restoreInlineSelection?.({anchor:current.start,head:current.end});setMessage('');
  if(edit)editor.gloss.open(anchor.nodeKey,{anchor:current.start,head:current.end},entry.definitionId);
 };
 const selectRelated=(id:string,reveal=false)=>{setSelected(id);setQuery('');setType('');const entry=index.rows[0]().find(e=>e.localId===id);if(!entry)return;if(reveal&&entry.occurrences().length)void navigate(entry);else{if(!entry.occurrences().length)setMessage('Unanchored Gloss selected. Use Edit to open its definition.');queueMicrotask(()=>{const row=[...session.element.querySelectorAll<HTMLElement>('.gloss-register-row')].find(el=>el.dataset.glossId===id);row?.scrollIntoView({block:'nearest'});row?.focus({preventScroll:true});});}};
 const relationships=editor.features.glossRelationshipAuthoring&&index.relationships?createRelationshipAuthoring(index,props.registerState,selectRelated):undefined;
 const remove=(entry:GlossEntry,button:HTMLElement)=>{if(!editor.gloss.deleteDefinition(session.rootKey,entry.definitionId,button))setMessage(editor.gloss.notice());};
 const Card=(p:{entry:GlossEntry;occurrence:GlossOccurrence;ref?:(el:HTMLElement)=>void})=>{
  const [expanded,setExpanded]=createSignal(false);
  return <article ref={p.ref} class="gloss-margin-card" data-gloss-id={p.entry.localId} data-gloss-occurrence={p.occurrence.nodeKey} classList={{'gloss-selected':selected()===p.entry.localId,'gloss-expanded':expanded()}}>
   <button type="button" class="gloss-card-main" onClick={e=>void navigate(p.entry,p.occurrence,true,e.currentTarget)}><strong>{p.entry.data().type||'Note'}</strong><span class="gloss-card-body">{p.entry.data().body||'(unfinished Gloss)'}</span></button>
   <div class="gloss-card-actions"><button type="button" onClick={()=>void navigate(p.entry,p.occurrence)}>↖ Passage</button><button type="button" aria-expanded={expanded()} onClick={()=>setExpanded(v=>!v)}>{expanded()?'Less':'More'}</button></div>
  </article>;
 };
 const Graphical=()=> <>
  <Show when={!exploring()&&scrollport()}>{port=><Show when={props.narrow} fallback={<GlossMargin index={index} session={session} scrollport={port()} card={Card}/>}><GlossBelow index={index} session={session} card={Card}/></Show>}</Show>
  <aside tabindex="-1" class="gloss-register" aria-label="Local References" hidden={!props.references}>
   <header><h2>Local References</h2><Show when={props.narrow}><button type="button" aria-label="Close Local References" onClick={props.closeReferences}>×</button></Show></header>
   <Show when={graphEnabled||argumentEnabled}><div class="gloss-view-tabs" role="tablist" aria-label="Local References view"><button type="button" role="tab" aria-selected={props.graphState.tab[0]()==='references'} onPointerDown={e=>e.preventDefault()} onClick={()=>props.graphState.tab[1]('references')}>References</button><Show when={graphEnabled}><button type="button" role="tab" aria-selected={props.graphState.tab[0]()==='graph'} disabled={!!relationships?.draft()} onPointerDown={e=>e.preventDefault()} onClick={()=>props.graphState.tab[1]('graph')}>Graph</button></Show><Show when={argumentEnabled}><button type="button" role="tab" aria-selected={props.graphState.tab[0]()==="argument"} disabled={!!relationships?.draft()} onPointerDown={e=>e.preventDefault()} onClick={()=>props.graphState.tab[1]("argument")}>Argument</button></Show></div></Show>
   <Show when={graphActive()}><GlossGraphView navigationEnabled={editor.features.glossGraphNavigation} active={graphActive} definition={(id,invoker)=>{const entry=index.rows[0]().find(row=>row.localId===id);if(entry)void navigate(entry,undefined,true,invoker);}} hostPort={()=>session.host.port} index={index} state={props.graphState} registerState={props.registerState} diagnostics={graphDiagnostics} select={selectRelated} inspect={id=>{props.graphState.tab[1]('references');selectRelated(id);}}/></Show>
   <Show when={argumentActive()}><GlossArgumentView index={index} state={props.argumentState} registerState={props.registerState} diagnostics={argumentDiagnostics} inspect={id=>{props.graphState.tab[1]('references');selectRelated(id);}} reveal={id=>selectRelated(id,true)} definition={(id,invoker)=>{const entry=index.rows[0]().find(row=>row.localId===id);if(entry)void navigate(entry,undefined,true,invoker);}}/></Show>
   <div class="gloss-reference-content" hidden={exploring()}>
   <Show when={relationships}>{ui=>{const Panel=ui().Panel;return <Panel/>;}}</Show>
   <div class="gloss-register-filters"><input aria-label="Search Glosses" placeholder="Search Glosses" value={query()} onInput={e=>setQuery(e.currentTarget.value)}/><select aria-label="Filter Gloss type" value={type()} onChange={e=>setType(e.currentTarget.value)}><option value="">All types</option><For each={types()}>{t=><option value={t}>{t}</option>}</For></select></div>
   <p class="gloss-register-count">{filtered().length} Glosses</p><Show when={message()}><p role="status">{message()}</p></Show>
   <Show when={relationships}>{ui=>{const Diagnostics=ui().Diagnostics;return <Diagnostics/>;}}</Show>
   <div class="gloss-register-rows"><For each={filtered()}>{entry=><article tabindex="-1" class="gloss-register-row" data-gloss-id={entry.localId} classList={{'gloss-selected':selected()===entry.localId}}>
    <button type="button" class="gloss-card-main" onClick={e=>void navigate(entry,undefined,true,e.currentTarget)}><strong>{entry.data().type||'Note'}</strong><span class="gloss-card-body">{entry.data().body||'(unfinished Gloss)'}</span></button>
    <Show when={entry.data().alias}><small>{entry.data().alias}</small></Show><small>{entry.occurrences().length?`${entry.occurrences().length} occurrence(s)`:'anchor removed'}</small>
    <div class="gloss-register-actions"><button type="button" disabled={!entry.occurrences().length} onClick={()=>void navigate(entry)}>Navigate</button><button type="button" onClick={e=>void navigate(entry,undefined,true,e.currentTarget)}>Edit</button><button type="button" onClick={e=>remove(entry,e.currentTarget)}>Delete</button></div>
    <Show when={relationships}>{ui=>{const Groups=ui().Groups;return <Groups entry={entry}/>;}}</Show>
   </article>}</For><Show when={!filtered().length}><p>No matching Glosses.</p></Show></div>
   </div>
  </aside>
 </>;
 return {Graphical,props,index,selected,setSelected,query,setQuery,type,setType,types,filtered,message,navigate,remove,relationships,graphEnabled,argumentEnabled,
 Graph:()=> <GlossGraphView navigationEnabled={editor.features.glossGraphNavigation} active={graphActive} definition={(id,invoker)=>{const entry=index.rows[0]().find(row=>row.localId===id);if(entry)void navigate(entry,undefined,true,invoker);}} hostPort={()=>session.host.port} index={index} state={props.graphState} registerState={props.registerState} diagnostics={graphDiagnostics} select={selectRelated} inspect={id=>{props.graphState.tab[1]('references');selectRelated(id);}}/>,
 Argument:()=> <GlossArgumentView index={index} state={props.argumentState} registerState={props.registerState} diagnostics={argumentDiagnostics} inspect={id=>{props.graphState.tab[1]('references');selectRelated(id);}} reveal={id=>selectRelated(id,true)} definition={(id,invoker)=>{const entry=index.rows[0]().find(row=>row.localId===id);if(entry)void navigate(entry,undefined,true,invoker);}}/>};

}

type CardProps={entry:GlossEntry;occurrence:GlossOccurrence;ref?:(el:HTMLElement)=>void};
/** Underneath mode uses native flow, not measured offsets. Authored pages/tables
 * retain their internal layout: their notes follow the whole page/table. */
function GlossBelow(props:{index:GlossSessionIndex;session:RetainedDocumentSession;card:(p:CardProps)=>JSX.Element}){
 const [mounted,setMounted]=createSignal(0);const e=props.index.editor;
 onCleanup(e.mounts.subscribe(key=>{if(props.index.containsOccurrence(key))setMounted(n=>n+1);}));
 const groups=createMemo(()=>{mounted();const groups=new Map<Element,CardProps[]>();for(const entry of props.index.rows[0]())for(const occurrence of entry.occurrences()){
  const root=e.mounts.get(occurrence.nodeKey)?.root;if(!root)continue;
  const target=root.closest<HTMLElement>('.reactive-page,[data-block-type="table-block"]')??root;const list=groups.get(target)??[];list.push({entry,occurrence});groups.set(target,list);
 }return [...groups].map(([target,cards])=>({target,cards}));});
 return <For each={groups()}>{group=>{const slot=document.createElement('div');slot.className='gloss-below';slot.setAttribute('aria-label','Glosses for preceding passage');group.target.after(slot);onCleanup(()=>slot.remove());return <Portal mount={slot}><For each={group.cards}>{card=><props.card {...card}/>}</For></Portal>;}}</For>;
}

interface MarginItem extends CardProps {id:string}
function GlossMargin(props:{index:GlossSessionIndex;session:RetainedDocumentSession;scrollport:HTMLElement;card:(p:CardProps)=>JSX.Element}){
 const {index,session,scrollport}=props,e=index.editor,[visible,setVisible]=createSignal<MarginItem[]>([]);
 let records:MarginItem[]=[],frame=0,alive=true,layer!:HTMLDivElement;
 let byContent=new Map<string,MarginItem[]>(),byNode=new Map<string,MarginItem[]>();
 const targets=new Map<string,Element>(),byElement=new Map<Element,Set<string>>(),inView=new Set<string>(),cards=new Map<string,HTMLElement>(),heights=new Map<string,number>();
 const diagnostics={frames:0,blockReads:0,anchorReads:0,workMs:[] as number[]};(session.element as any).glossGeometry=diagnostics;
 const schedule=()=>{if(alive&&!frame&&session.host.activity().visible)frame=requestAnimationFrame(layout);};
 const refresh=()=>{const next=records.filter(r=>inView.has(r.id)),old=visible();if(next.length!==old.length||next.some((r,i)=>r!==old[i]))setVisible(next);schedule();};
 const intersection=typeof IntersectionObserver==='undefined'?undefined:new IntersectionObserver(entries=>{for(const entry of entries)for(const id of byElement.get(entry.target)??[]){if(entry.isIntersecting)inView.add(id);else inView.delete(id);}refresh();},{root:scrollport,rootMargin:'120px 0px'});
 const cardResize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(entries=>{for(const entry of entries){const id=(entry.target as HTMLElement).dataset.glossMarginKey;if(id)heights.set(id,entry.borderBoxSize?.[0]?.blockSize??entry.contentRect.height);}schedule();});
 const blockResize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(entries=>{for(const entry of entries){const k=e.mounts.resolveElement(entry.target)?.nodeKey;if(k)e.measurements.invalidateRanges(k);}schedule();});
 const blocks=new Set<Element>(),blockKeys=new Map<Element,string>();
 const bind=(subset=records)=>{
  const keep=subset===records?new Set(records.map(r=>r.id)):undefined;for(const r of subset){const h=e.mounts.get(r.occurrence.nodeKey),range=index.range(r.occurrence),boundary=range&&h?.inlineBoundary?.(range.start),target=boundary?.node.nodeType===Node.TEXT_NODE?boundary.node.parentElement:boundary?.node.childNodes[boundary.offset];
   const element=target instanceof Element?target:h?.focusElement;if(!element||targets.get(r.id)===element)continue;
   const old=targets.get(r.id);if(old){byElement.get(old)?.delete(r.id);if(!byElement.get(old)?.size){intersection?.unobserve(old);byElement.delete(old);}}
   targets.set(r.id,element);const ids=byElement.get(element)??new Set();ids.add(r.id);byElement.set(element,ids);intersection?.observe(element);if(!intersection)inView.add(r.id);
  }
  for(const [id,element]of targets)if(keep&&!keep.has(id)){targets.delete(id);inView.delete(id);byElement.get(element)?.delete(id);if(!byElement.get(element)?.size){intersection?.unobserve(element);byElement.delete(element);}}
  refresh();
 };
 createEffect(()=>{const next:MarginItem[]=[];for(const entry of index.rows[0]())for(const occurrence of entry.occurrences())next.push({id:`${occurrence.nodeKey}:${occurrence.segmentId}`,entry,occurrence});const old=new Map(records.map(r=>[r.id,r])),nextNodes=new Set(next.map(r=>r.occurrence.nodeKey));for(const r of records)if(!nextNodes.has(r.occurrence.nodeKey))e.measurements.invalidateRanges(r.occurrence.nodeKey);records=next.map(r=>{const prior=old.get(r.id);if(!prior)return r;prior.occurrence=r.occurrence;return prior;}).sort((a,b)=>a.occurrence.order-b.occurrence.order||(index.range(a.occurrence)?.start??0)-(index.range(b.occurrence)?.start??0));byContent=new Map();byNode=new Map();for(const r of records){const list=byContent.get(r.occurrence.contentKey)??[];list.push(r);byContent.set(r.occurrence.contentKey,list);const nodes=byNode.get(r.occurrence.nodeKey)??[];nodes.push(r);byNode.set(r.occurrence.nodeKey,nodes);}untrack(()=>bind());});
 createEffect(()=>{session.host.activity();session.host.coordinates.scale();untrack(()=>{for(const key of byNode.keys())e.measurements.invalidateRanges(key);schedule();});});
 function layout(stamp:number){frame=0;if(!alive||!session.host.activity().visible)return;diagnostics.frames++;const begun=performance.now();
  const origin=scrollport.getBoundingClientRect(),scale=session.host.coordinates.scale()||1,boxes=new Map<string,DOMRect>(),positions:{item:MarginItem;top:number;height:number}[]=[];let bottom=-Infinity;
  const roots=new Set<Element>();
  for(const item of visible()){
   const k=item.occurrence.nodeKey,h=e.mounts.get(k),range=index.range(item.occurrence);if(!h||!range||!h.root.isConnected)continue;roots.add(h.root);blockKeys.set(h.root,k);
   let box=boxes.get(k);if(!box){diagnostics.blockReads++;boxes.set(k,box=h.root.getBoundingClientRect());}
   const revision=e.repository.readState().contents[item.occurrence.contentKey]?.revision??0,previous=e.measurements.rangeDiagnostics.reads;
   const rect=e.measurements.retainedRangeRects(k,range.start,range.end,revision,box,scale,stamp)[0];diagnostics.anchorReads+=e.measurements.rangeDiagnostics.reads-previous;if(!rect)continue;
   const anchor=(rect.top-origin.top)/scale+scrollport.scrollTop,top=Math.max(anchor,bottom+8),height=heights.get(item.id)??92;positions.push({item,top,height});bottom=top+height;
  }
  // Writes after all reads. Keep previous positions when unchanged.
  for(const {item,top}of positions){const card=cards.get(item.id);if(card&&card.style.top!==`${top}px`)card.style.top=`${top}px`;}
  for(const root of blocks)if(!roots.has(root)){blockResize?.unobserve(root);blocks.delete(root);const key=blockKeys.get(root);if(key)e.measurements.invalidateRanges(key);blockKeys.delete(root);}
  for(const root of roots)if(!blocks.has(root)){blocks.add(root);blockResize?.observe(root);}
  if(diagnostics.workMs.length<200)diagnostics.workMs.push(performance.now()-begun);
 }
 const font=()=>{for(const item of visible())e.measurements.invalidateRanges(item.occurrence.nodeKey);schedule();};
 onMount(()=>{scrollport.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',font);document.fonts?.addEventListener('loadingdone',font);schedule();});
 const stop=index.subscribe((keys,structure)=>{if(structure)bind();else if(keys.size){const affected=[...keys].flatMap(k=>byContent.get(k)??[]);if([...keys].some(k=>{const c=e.repository.readState().contents[k];return c&&c.inlineKind!=='standoff';}))for(const item of visible())e.measurements.invalidateRanges(item.occurrence.nodeKey);for(const item of affected)e.measurements.invalidateRanges(item.occurrence.nodeKey);bind(affected);}schedule();});
 const mount=e.mounts.subscribe(key=>{const items=byNode.get(key);if(items)bind(items);});
 onCleanup(()=>{alive=false;if(frame)cancelAnimationFrame(frame);stop();mount();intersection?.disconnect();cardResize?.disconnect();blockResize?.disconnect();scrollport.removeEventListener('scroll',schedule);window.removeEventListener('resize',font);document.fonts?.removeEventListener('loadingdone',font);for(const item of records)e.measurements.invalidateRanges(item.occurrence.nodeKey);delete (session.element as any).glossGeometry;});
 return <Portal mount={scrollport}><div ref={layer} class="gloss-margin-layer" aria-label="Gloss margin"><For each={visible()}>{item=><props.card entry={item.entry} occurrence={item.occurrence} ref={element=>{element.dataset.glossMarginKey=item.id;cards.set(item.id,element);cardResize?.observe(element);onCleanup(()=>{cardResize?.unobserve(element);cards.delete(item.id);heights.delete(item.id);});schedule();}}/>}</For></div></Portal>;
}

export type GlossViewModel=ReturnType<typeof createGlossViewModel>;
function GlossViews(props:Parameters<typeof createGlossViewModel>[0]) {
 const model=createGlossViewModel(props),views=useInstrumentPresentations();
 return <Dynamic component={views?.()?.gloss??model.Graphical} model={model}/>;
}
