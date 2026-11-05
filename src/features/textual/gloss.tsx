import {For,Show} from 'solid-js';
import type {GlossViewModel} from '../gloss/presentation';
/** Index, occurrence identity, drafts and navigation remain owned by Gloss. */
export function TextualGloss(props:{model:GlossViewModel}) {
 const m=props.model,tab=m.props.graphState.tab;
 return <aside class="tw-gloss tw-instrument" aria-label="Textual Gloss Explorer" hidden={!m.props.references}>
  <header><strong>Gloss Explorer</strong><button onClick={m.props.closeReferences}>Close</button></header>
  <nav class="tw-tool-row"><button aria-pressed={tab[0]()==='references'} onClick={()=>tab[1]('references')}>Glosses</button><Show when={m.graphEnabled}><button disabled={!!m.relationships?.draft()} aria-pressed={tab[0]()==='graph'} onClick={()=>tab[1]('graph')}>Graph</button></Show><Show when={m.argumentEnabled}><button disabled={!!m.relationships?.draft()} aria-pressed={tab[0]()==='argument'} onClick={()=>tab[1]('argument')}>Argument</button></Show></nav>
  <Show when={tab[0]()==='graph'}><div class="tw-native-island"><m.Graph/></div></Show><Show when={tab[0]()==='argument'}><div class="tw-native-island"><m.Argument/></div></Show>
  <Show when={tab[0]()==='references'}>
   <label>Search <input aria-label="Search Glosses" value={m.query()} onInput={e=>m.setQuery(e.currentTarget.value)}/></label><label>Type <select aria-label="Filter Gloss type" value={m.type()} onChange={e=>m.setType(e.currentTarget.value)}><option value="">All</option><For each={m.types()}>{type=><option>{type}</option>}</For></select></label>
   <Show when={m.relationships}>{ui=>{const Panel=ui().Panel;return <Panel/>;}}</Show>
   <p>{m.filtered().length} Glosses</p>
   <div class="tw-instrument-body"><For each={m.filtered()}>{entry=><article class="gloss-register-row" tabIndex={-1} data-gloss-id={entry.localId} aria-current={m.selected()===entry.localId?'true':undefined}>
    <strong>{entry.data().type||'Note'}: {entry.data().body}</strong><small>{entry.occurrences().length} occurrence(s)</small>
    <button disabled={!entry.occurrences().length} onClick={()=>void m.navigate(entry)}>Passage</button><button onClick={e=>void m.navigate(entry,undefined,true,e.currentTarget)}>Edit</button><button onClick={e=>m.remove(entry,e.currentTarget)}>Delete</button>
    <Show when={m.relationships}>{ui=>{const Groups=ui().Groups;return <Groups entry={entry}/>;}}</Show>
   </article>}</For></div>
  </Show><p role="status">{m.message()}</p>
 </aside>;
}
