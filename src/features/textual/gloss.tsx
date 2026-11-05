import {Portal} from 'solid-js/web';
import {TextualMarginalia} from './marginalia';
import {textualDocumentLayout,showFullDocument} from './layout';
import {For,Show,createMemo,createEffect} from 'solid-js';
import type {GlossViewModel} from '../gloss/presentation';
/** A compact presentation over the existing register, navigation and relationship controller. */
export function TextualGloss(props:{model:GlossViewModel}) {
 const m=props.model,tab=m.props.graphState.tab,layout=textualDocumentLayout(m.props.session);
 let list!:HTMLDivElement,detail!:HTMLDivElement;
 const active=createMemo(()=>m.filtered().find(entry=>entry.localId===m.selected())??m.filtered()[0]);
 const optionId=(id:string)=>`tw-gloss-${m.props.session.id}-${id}`;
 createEffect(()=>{const entry=active();if(entry&&entry.localId!==m.selected())m.setSelected(entry.localId);});
 const close=()=>{m.props.closeReferences();queueMicrotask(()=>{const e=m.props.editor,key=e.focus.state.focusedKey;if(key&&m.props.session.projection.node(key)){const h=e.mounts.get(key),range=h?.captureInlineSelection?.()??e.mounts.inlineSelection(key);h?.focus();if(range)h?.restoreInlineSelection?.(range);}});};
 const passage=(entry:Parameters<typeof m.navigate>[0])=>{showFullDocument(m.props.editor);void m.navigate(entry).then(()=>{if(layout()?.panes.fullscreen)close();});};
 const inspect=(entry:Parameters<typeof m.navigate>[0])=>{m.setQuery('');m.setType('');m.setSelected(entry.localId);tab[1]('references');layout()?.showGloss();queueMicrotask(()=>list?.focus());};
 const choose=(id:string)=>{m.setSelected(id);queueMicrotask(()=>list?.ownerDocument.getElementById(optionId(id))?.scrollIntoView({block:'nearest'}));};
 const keys=(e:KeyboardEvent)=>{if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
  const rows=m.filtered(),index=Math.max(0,rows.findIndex(row=>row.localId===active()?.localId));
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();const row=rows[Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowDown'?1:-1)))];if(row)choose(row.localId);}
  else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(active())detail?.focus();}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
 };
 return <><TextualMarginalia model={m} inspect={inspect}/><Show when={layout()?.secondary} keyed>{mount=><Portal mount={mount}><aside class="tw-gloss tw-instrument" data-native-context-menu data-cross-text-controls style={{'--tw-gloss-list-rows':String(Math.max(3,Math.min(8,Math.floor((layout()?.grid.rows??40)/5))))}} aria-label="Textual Gloss Explorer" hidden={!m.props.references}>
  <header><strong>Gloss Explorer</strong><button onPointerDown={e=>e.preventDefault()} onClick={close}>Close</button></header>
  <nav class="tw-tool-row"><button aria-pressed={tab[0]()==='references'} onClick={()=>tab[1]('references')}>Glosses</button><Show when={m.graphEnabled}><button disabled={!!m.relationships?.draft()} aria-pressed={tab[0]()==='graph'} onClick={()=>tab[1]('graph')}>Graph</button></Show><Show when={m.argumentEnabled}><button disabled={!!m.relationships?.draft()} aria-pressed={tab[0]()==='argument'} onClick={()=>tab[1]('argument')}>Argument</button></Show></nav>
  <Show when={tab[0]()==='graph'}><div class="tw-native-island"><m.Graph/></div></Show><Show when={tab[0]()==='argument'}><div class="tw-native-island"><m.Argument/></div></Show>
  <Show when={tab[0]()==='references'}>
   <div class="tw-gloss-filters"><label>Find <input aria-label="Search Glosses" value={m.query()} onInput={e=>m.setQuery(e.currentTarget.value)}/></label><label>Type <select aria-label="Filter Gloss type" value={m.type()} onChange={e=>m.setType(e.currentTarget.value)}><option value="">All</option><For each={m.types()}>{type=><option>{type}</option>}</For></select></label></div>
   <div ref={list} class="tw-gloss-list" role="listbox" aria-label="Glosses" tabindex={0} aria-activedescendant={active()?optionId(active()!.localId):undefined} onKeyDown={keys}>
    <For each={m.filtered()}>{entry=><button id={optionId(entry.localId)} role="option" tabindex={-1} aria-selected={active()===entry} title={`${entry.data().type}: ${entry.data().body}`} onClick={()=>{choose(entry.localId);list.focus();}}>
     <span aria-hidden="true">{active()===entry?'►':' '}</span><span class="tw-gloss-type">{entry.data().type||'Note'}</span><span class="tw-gloss-summary">{entry.data().body||'(unfinished)'}</span><span class="tw-gloss-count">{entry.occurrences().length}</span>
    </button>}</For><Show when={!m.filtered().length}><p>No matching Glosses.</p></Show>
   </div>
   <div class="tw-gloss-list-status">{m.filtered().length} Glosses · ↑↓ Select · Enter Details</div>
   <div ref={detail} class="tw-gloss-detail" role="region" aria-label="Gloss details" tabindex={-1} onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!(e.target as Element).closest('input,textarea,select,[role=dialog]')){e.preventDefault();e.stopPropagation();list.focus();}}}>
    <Show when={active()} keyed>{entry=><article class="gloss-register-row" data-gloss-id={entry.localId}>
     <strong class="tw-gloss-detail-type">{entry.data().type||'Note'}</strong><p class="tw-gloss-full-text">{entry.data().body||'(unfinished Gloss)'}</p><small>{entry.occurrences().length} occurrence(s)</small>
     <nav class="tw-tool-row"><button disabled={!entry.occurrences().length} onClick={()=>passage(entry)}>Passage</button><button onClick={e=>void m.navigate(entry,undefined,true,e.currentTarget)}>Edit</button><button onClick={e=>m.remove(entry,e.currentTarget)}>Delete</button></nav>
     <Show when={m.relationships}>{ui=>{const Groups=ui().Groups;return <Groups entry={entry}/>;}}</Show>
    </article>}</Show>
    <Show when={m.relationships}>{ui=>{const Panel=ui().Panel;return <Panel/>;}}</Show>
   </div>
  </Show><Show when={m.message()}><p role="status">{m.message()}</p></Show>
 </aside></Portal>}</Show></>;
}
