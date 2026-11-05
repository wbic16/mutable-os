import {For,Show} from 'solid-js';
import type {LerModel} from '../entity-references/ler-view';
import type {CompletionModel} from '../autocomplete/view';

/** Dedicated query/results presentation; every operation belongs to the existing LER controller. */
export function TextualLer(props:{model:LerModel}) {
 const m=props.model;
 return <div ref={m.refs.root} class="tw-instrument tw-ler reactive-entity-search" role="dialog" aria-label="Link Entity Reference" data-native-context-menu onKeyDown={m.keys}>
  <header><strong>Link Entity Reference</strong><button onClick={m.close}>Cancel</button></header>
  <p>Source: <strong data-entity-target>{m.session.origin.entityQuery||'(no selection)'}</strong> · {m.accepted()} accepted</p>
  <label>Query <input ref={m.refs.input} aria-label="Search entities" role="combobox" aria-expanded={m.session.state.view==='results'} aria-controls={`${m.panel.key}-results`} aria-activedescendant={m.pageRows()[m.current()]?`${m.panel.key}-result-${m.current()}`:undefined} value={m.query()} maxLength={1000} onFocus={()=>m.session.mode('edit')} onInput={e=>{m.setQuery(e.currentTarget.value);if(!e.isComposing&&m.searchScope()!=='live')m.completion?.session.input(e.currentTarget.value);}} onCompositionStart={()=>m.setComposing(true)} onCompositionEnd={e=>{m.setComposing(false);m.setQuery(e.currentTarget.value);if(m.searchScope()!=='live')m.completion?.session.input(e.currentTarget.value);}}/></label>
  <div class="tw-tool-row"><label>Scope <select aria-label="Entity scope" value={m.searchScope()} onChange={e=>m.setScope(e.currentTarget.value as typeof m.scopes[number])}><For each={m.scopes}>{scope=><option value={scope}>{scope}</option>}</For></select></label><label>Field <select aria-label="Entity stream" value={m.stream()} onChange={e=>m.setStream(e.currentTarget.value as 'all'|'name'|'alias'|'mention')}><For each={['all','name','alias','mention']}>{field=><option>{field}</option>}</For></select></label><label>Match <select aria-label="Entity match" value={m.match()} onChange={e=>m.setMatch(e.currentTarget.value as 'partial'|'exact')}><option>partial</option><option>exact</option></select></label><button onClick={m.refresh}>Refresh</button></div>
  <nav class="tw-tool-row"><button onClick={()=>m.session.view('results')}>Results</button><button onClick={m.createFormOpen}>Create Entity</button><button onClick={m.expand}>Review occurrences</button><button onClick={()=>m.session.view('source')}>Source controls</button><button onClick={()=>m.session.view('commands')}>More commands</button><button onClick={m.commandFocus}>Command mode</button><button onClick={m.editQuery}>Edit query</button></nav>
  <Show when={m.session.state.prepared}>{entity=><p>Prepared: {entity().name} <button onClick={m.review}>Review for prepared Entity</button></p>}</Show>
  <Show when={!m.valid()}><p>Source changed. <button onPointerDown={e=>e.preventDefault()} onClick={m.adoptSelection}>Use current selection</button></p></Show>
  <div ref={m.refs.body} class="tw-instrument-body">
   <Show when={m.session.state.view==='results'} fallback={<div class="tw-ler-advanced"><m.advanced/></div>}>
    <div ref={m.refs.list} id={`${m.panel.key}-results`} tabIndex={0} role="listbox" aria-label="Entity candidates"><For each={m.pageRows()}>{(row,i)=><div role="option" id={`${m.panel.key}-result-${i()}`} aria-selected={m.current()===i()} data-entity-id={row.id} onPointerMove={()=>m.navigate(i())}>
     <button disabled={m.working()} onPointerDown={e=>e.preventDefault()} onClick={()=>m.select(row.id)}>{row.name}</button><button disabled={m.working()} onClick={()=>m.select(row.id,false,true)}>Prepare</button><button disabled={m.working()} onClick={()=>m.showDetails(row.id)}>Inspect</button><small>{row.id}</small>
    </div>}</For></div>
   </Show>
  </div>
  <p role="status">{m.busy()?'Searching…':`${m.rows().length} candidates`}{m.result()&&!m.result()!.complete?' · incomplete coverage':''}</p><Show when={m.error()}><p role="alert">{m.error()}</p></Show>
  <footer><button disabled={!m.page()} onClick={()=>{m.setPage(n=>n-1);m.navigate(0);}}>Previous page</button> Page {m.page()+1} <button disabled={(m.page()+1)*10>=m.rows().length} onClick={()=>{m.setPage(n=>n+1);m.navigate(0);}}>Next page</button></footer>
 </div>;
}

export function TextualCompletion(props:{model:CompletionModel}) {
 const m=props.model,s=m.s;
 return <div ref={m.refs.root} class="tw-instrument tw-scry autocomplete-workstation" role="region" aria-label="Autocomplete workstation">
  <Show when={s.state.kind!=='entity'} fallback={<m.Entity/>}>
   <header><strong>Scry · {s.state.kind}</strong><button onClick={m.close}>Cancel</button></header>
   <Show when={s.state.expanded} fallback={<button onPointerDown={e=>e.preventDefault()} onClick={m.expand}>Query: {s.parsed.query||'Show candidates'} · Edit query</button>}>
    <label>Query <input ref={m.refs.input} aria-label="Scry query" role="combobox" aria-expanded="true" aria-controls={m.id} value={s.state.input} disabled={s.state.pending} onInput={e=>{if(!e.isComposing)s.input(e.currentTarget.value);}} onCompositionEnd={e=>s.input(e.currentTarget.value)}/></label>
   </Show>
   <Show when={s.source.brackets}><p>Source: {s.state.sourceText}</p><button onClick={()=>s.follow()}>Follow source</button></Show>
   <div id={m.id} class="tw-instrument-body" role="listbox" aria-label="Completion candidates"><For each={s.state.rows}>{row=><button role="option" aria-selected={s.state.selected===row.id} disabled={s.state.pending||row.disabled} onPointerDown={e=>e.preventDefault()} onMouseMove={()=>s.select(row.id)} onClick={()=>{s.select(row.id);void s.choose();}}>{row.name}<small>{row.reason}</small></button>}</For></div>
   <p role="status">{s.state.busy?'Searching…':`${s.state.rows.length} candidates`}</p>
  </Show><Show when={s.state.error}><p role="alert">{s.state.error}</p></Show>
 </div>;
}
