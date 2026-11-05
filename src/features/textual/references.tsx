import {For,Show,createSignal,onCleanup} from 'solid-js';
import type {ApplicationKnowledge,DocumentApplicationInstance,DocumentTarget,NativeReferenceItem,VaultSearchResults} from '../../feature-api/document-application';
/** Presentation state only. Tokens, cancellation, validation and navigation belong to application services. */
export function TextualReferences(props:{knowledge?:ApplicationKnowledge;entities?:DocumentApplicationInstance['entities'];restore():void;close(restoreSelection?:boolean):void}) {
 const api=props.knowledge;
 const [query,setQuery]=createSignal(''),[hits,setHits]=createSignal<VaultSearchResults>(),[refs,setRefs]=createSignal<{token:string;items:readonly NativeReferenceItem[];diagnostics:readonly string[]}>();
 const [picker,setPicker]=createSignal<{selection:string;targets:readonly DocumentTarget[];diagnostics:readonly string[]}>(),[entities,setEntities]=createSignal(false);
 const [busy,setBusy]=createSignal(false),[notice,setNotice]=createSignal('');
 let live=true,generation=0;
 const cancel=()=>{generation++;api?.cancel();api?.cancelPicker();setPicker(undefined);setBusy(false);};
 onCleanup(()=>{live=false;cancel();});
 const act=async(action:(current:()=>boolean)=>Promise<void>)=>{if(busy())return;const token=++generation;setBusy(true);setNotice('');try{await action(()=>live&&generation===token);}catch(e){if(live&&token===generation)setNotice(String(e));}finally{if(live&&token===generation)setBusy(false);}};
 const search=()=>act(async current=>{const result=await api!.search(query());if(current())setHits(result);});
 const references=()=>act(async current=>{const result=await api!.references();if(current())setRefs(result);});
 const link=()=>act(async current=>{props.restore();await api!.prepareReferences?.();if(!current())return;const selection=api!.selection(),result=await api!.picker(selection);if(current())setPicker({selection,...result});});

 return <section class="tw-instrument tw-references" role="region" aria-label="Textual References">
  <header><strong>References &amp; Search</strong><button onClick={()=>{cancel();props.close();}}>Close</button></header>
  <Show when={api} fallback={<p>Native Document knowledge is unavailable for this application.</p>}>
   <form onSubmit={e=>{e.preventDefault();void search();}}><label>Vault query <input aria-label="Search vault" value={query()} maxLength={256} onInput={e=>{cancel();setQuery(e.currentTarget.value);setHits(undefined);}}/></label><button disabled={busy()}>Search</button></form>
   <nav class="tw-tool-row"><button disabled={busy()} onPointerDown={e=>e.preventDefault()} onClick={()=>void link()}>Link selected text</button><button disabled={busy()} onClick={()=>void references()}>References in Document</button><button disabled={busy()||!props.entities} onClick={()=>setEntities(v=>!v)}>Entity references</button><Show when={busy()}><button onClick={cancel}>Cancel query</button></Show></nav>
   <div class="tw-instrument-body">
    <Show when={picker()}>{value=><section aria-label="Choose reference Document"><For each={value().diagnostics}>{d=><p>{d}</p>}</For><For each={value().targets}>{target=><button disabled={busy()} onClick={()=>void act(async current=>{await api!.createReference(value().selection,target);if(current()){setPicker(undefined);setNotice('Native Document reference created.');}})}>{target.title} · {target.location}</button>}</For><button onClick={()=>{api!.cancelPicker();setPicker(undefined);}}>Cancel reference</button></section>}</Show>
    <Show when={hits()}>{result=><section><p>{result().hits.length} matches · {result().available}/{result().discovered} Documents · {result().complete?'complete':'incomplete'} coverage</p><For each={result().diagnostics}>{d=><p>{d}</p>}</For><For each={result().hits}>{hit=><button disabled={busy()||!api!.current(result().token)} onClick={()=>void act(async current=>{await api!.activate(hit.id);if(current())props.close(false);})}>{hit.title} · {hit.snippet}</button>}</For></section>}</Show>
    <Show when={refs()}>{value=><section><p>{value().items.length} references{api!.current(value().token)?'':' · stale; refresh before acting'}</p><For each={value().diagnostics}>{d=><p>{d}</p>}</For><For each={value().items}>{item=><article><strong>{item.label} → {item.target?.title??'Unavailable target'}</strong><p>{item.diagnostic}</p><button disabled={busy()||!item.target||!api!.current(value().token)} onClick={()=>void act(async current=>{await api!.followReference(item.id);if(current())props.close(false);})}>Follow</button><button disabled={busy()||!item.removable||!api!.current(value().token)} onClick={()=>void act(async current=>{await api!.removeReference(item.id);const value=await api!.references();if(current())setRefs(value);})}>Remove</button></article>}</For></section>}</Show>
    <Show when={entities()&&props.entities}>{list=><section aria-label="Entity references"><p>{list().pending()?'Loading…':`${list().rows().length} Entities`}</p><button onClick={()=>list().refresh()}>Refresh Entity names</button><For each={list().rows()}>{row=><article><strong>{row.name}</strong> · {row.documentMentions} occurrence(s) <button onClick={()=>{list().focus(row.id);props.close(false);}}>Focus occurrences</button></article>}</For></section>}</Show>
   </div>
  </Show><p role="status">{notice()}</p>
 </section>;
}
