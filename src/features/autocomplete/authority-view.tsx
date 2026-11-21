import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import type { CanonicalEntity, EntityService } from '../../feature-api/entities';
import { useManagedViewActivity } from '../../rendering/window-manager';
import { authorityDetails, searchAuthority, type Authority, type AuthorityRecord } from './authorities';

/** Staging lives in the existing managed Entity tool, including its guarded close/receipt lifetime. */
export function AuthorityPanel(props:{service:EntityService;query:string;guard(fn:()=>boolean):void;imported(e:CanonicalEntity):void}) {
 const [query,setQuery]=createSignal(props.query),[provider,setProvider]=createSignal<Authority>('wikidata');
 const [rows,setRows]=createSignal<AuthorityRecord[]>([]),[staged,setStaged]=createSignal<AuthorityRecord>(),[matches,setMatches]=createSignal<CanonicalEntity[]>([]);
 const [target,setTarget]=createSignal(''),[busy,setBusy]=createSignal(false),[writing,setWriting]=createSignal(false),[error,setError]=createSignal(''),[receipt,setReceipt]=createSignal('');
 const [attempt,setAttempt]=createSignal<Parameters<NonNullable<EntityService['acquireIdentity']>>[0]>();
 const activity=useManagedViewActivity();let alive=true,generation=0,controller:AbortController|undefined;
 const cancel=()=>{++generation;controller?.abort();setBusy(false);};
 createEffect(()=>{if(activity()?.visible===false)cancel();});
 onCleanup(()=>{alive=false;cancel();});
 props.guard(()=>!writing()&&(!attempt()||!!receipt()||window.confirm('Authority import outcome is unconfirmed. Close and discard the retry receipt?')));
 const run=async(fn:(signal:AbortSignal,current:()=>boolean)=>Promise<void>)=>{
  if(writing()||attempt()&&!receipt())return;
  cancel();const token=generation,c=controller=new AbortController(),current=()=>alive&&token===generation&&!c.signal.aborted;setBusy(true);setError('');
  try{await fn(c.signal,current);}catch(e){if(current())setError(String(e));}finally{if(current())setBusy(false);}
 };
 const search=()=>void run(async(signal,current)=>{const vault=await props.service.historyScope?.()??'.',found=await searchAuthority(provider(),query(),signal,vault);if(current()){setRows(found);setStaged(undefined);setReceipt('');setAttempt(undefined);}});
 const stage=(record:AuthorityRecord)=>void run(async(signal,current)=>{
  const vault=await props.service.historyScope?.()??'.',details=await authorityDetails(record,signal,vault);if(!current())return;setStaged(details);setTarget('');setMatches([]);setReceipt('');setAttempt(undefined);
  if(details.provider!=='wikidata')return;
  const existing=await props.service.authorityLookup?.(details,signal);if(!current())return;
  if(existing){setMatches([existing]);setTarget(existing.id);return;}
  const local=await props.service.search({query:details.name,stream:'all',match:'partial',scope:'vault'},signal);
  const found:CanonicalEntity[]=[];for(const candidate of local.candidates.slice(0,10)){const entity=await props.service.get(candidate.id,signal);if(entity)found.push(entity);}
  if(current())setMatches(found);
 });
 const acquire=async()=>{
  if(writing()||!props.service.acquireIdentity)return;
  const record=staged();if(!record||record.provider!=='wikidata')return;
  if(!attempt()){const e=matches().find(e=>e.id===target());setAttempt({id:crypto.randomUUID(),operationId:crypto.randomUUID(),record,...(e?{targetId:e.id,expected:e.revision}:{})});}
  setWriting(true);setError('');
  try{const entity=await props.service.acquireIdentity(attempt()!);if(!alive)return;setReceipt(`Confirmed Entity ${entity.id}. Identity saved; Document not linked or saved.`);props.imported(entity);}
  catch(e){if(alive)setError(`Outcome unconfirmed; retry uses the same receipt and cannot duplicate an identity. ${String(e)}`);}
  finally{if(alive)setWriting(false);}
 };
 return <section class="autocomplete-authority" aria-label="External authority staging">
  <h3>External authorities · explicit search</h3>
  <p>Search sends this query to Wikidata or lobid/GND. Identity import is a separate canonical write; Document Undo does not undo it.</p>
  <label>Authority <select disabled={writing()||!!attempt()&&!receipt()} value={provider()} onChange={e=>{cancel();setRows([]);setStaged(undefined);setProvider(e.currentTarget.value as Authority);}}><option value="wikidata">Wikidata · CC0</option><option value="gnd">GND via lobid · CC0</option></select></label>
  <input aria-label="Authority query" value={query()} onInput={e=>{cancel();setQuery(e.currentTarget.value);}} disabled={writing()||!!attempt()&&!receipt()}/>
  <button disabled={busy()||writing()||!!attempt()&&!receipt()} onClick={search}>Send query / Search</button><button disabled={writing()} onClick={cancel}>Cancel search</button>
  <Show when={busy()}><p role="status">Reading authority data…</p></Show>
  <For each={rows()}>{row=><button disabled={busy()||writing()||!!attempt()&&!receipt()} onClick={()=>stage(row)}>{row.name} · {row.provider}:{row.id} — {row.description}</button>}</For>
  <Show when={staged()}>{record=><div>
   <h4>{record().name} · {record().id}</h4><p>{record().description}</p><p>Aliases: {record().aliases.join('; ')||'None supplied'}</p>
   <a href={record().url} target="_blank" rel="noopener noreferrer">Review authority record</a>
   <Show when={record().provider==='wikidata'} fallback={<p>GND-only import is unavailable under the existing identity schema. <Show when={record().wikidata}><button disabled={busy()} onClick={()=>stage({...record(),provider:'wikidata',id:record().wikidata!,url:'https://www.wikidata.org/wiki/'+record().wikidata,aliases:[]})}>Review declared Wikidata identity {record().wikidata}</button></Show></p>}>
    <label>Reconcile with local Entity <select aria-label="Reconciliation target" disabled={writing()||!!attempt()} value={target()} onChange={e=>setTarget(e.currentTarget.value)}><option value="">Import new identity (reuse if this ID already exists)</option><For each={matches()}>{e=><option value={e.id}>{e.name} · {e.id}</option>}</For></select></label>
    <p>Reconciliation preserves the local name, aliases and description. A new import includes the reviewed name, description and listed aliases. Same-name Entities are never merged automatically.</p>
    <button disabled={busy()||writing()||!!receipt()||!props.service.acquireIdentity} onClick={()=>void acquire()}>{writing()?'Importing…':attempt()?'Retry same operation':target()?'Confirm identifier attachment':'Confirm identity-only import'}</button>
   </Show>
  </div>}</Show>
  <Show when={error()}><p role="alert">{error()}</p></Show><Show when={receipt()}><p role="status">{receipt()}</p></Show>
 </section>;
}
