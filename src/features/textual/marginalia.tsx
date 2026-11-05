import {For,Show,createSignal} from 'solid-js';
import type {GlossMarginCardProps,GlossViewModel} from '../gloss/presentation';
import {textualDocumentLayout} from './layout';

/** These are presentation glyph slots, never canonical editor Cells or Text nodes. */
function MarginText(props:{text:string}) {
 const pairs=(line:string)=>{const letters=Array.from(line);return Array.from({length:Math.ceil(letters.length/2)},(_,i)=>letters.slice(i*2,i*2+2));};
 return <For each={props.text.split('\n')}>{(line,index)=><><Show when={index()!==0}><br/></Show><For each={pairs(line)}>{pair=><span class="tw-margin-pair"><For each={pair}>{character=><span class="tw-margin-glyph">{character}</span>}</For></span>}</For></>}</For>;
}
export function TextualMarginalia(props:{model:GlossViewModel;inspect(entry:GlossMarginCardProps['entry']):void}) {
 const m=props.model,layout=textualDocumentLayout(m.props.session);
 const Card=(p:GlossMarginCardProps)=>{const [expanded,setExpanded]=createSignal(false);return <article ref={p.ref} class="gloss-margin-card tw-margin-card" data-gloss-id={p.entry.localId} aria-current={m.selected()===p.entry.localId?'true':undefined}>
  <button class="tw-margin-definition" onClick={()=>props.inspect(p.entry)} title="Show full Gloss in Explorer">
   <strong class="tw-margin-type">{p.entry.data().type||'Note'}</strong><span><MarginText text={(expanded()?p.entry.data().body:Array.from(p.entry.data().body).slice(0,72).join('')+(Array.from(p.entry.data().body).length>72?'…':''))||'(unfinished Gloss)'}/></span>
  </button><button class="tw-margin-passage" onClick={()=>void m.navigate(p.entry,p.occurrence)}>↖ Passage</button><Show when={p.entry.data().body.length>72}><button aria-expanded={expanded()} onClick={()=>setExpanded(v=>!v)}>{expanded()?'Less':'More'}</button></Show>
 </article>;};
 // Key the lease by the scrollport alone: zoom/reflow must retain cards and caches.
 return <Show when={layout()?.panes.left?layout()?.scrollport:undefined} keyed>{scrollport=><m.Margin scrollport={scrollport} card={Card} metrics={()=>({rowHeight:layout()!.grid.cellHeightPx/(layout()!.fullSize?1:2),gap:layout()!.grid.cellHeightPx/2})}/>}</Show>;
}
