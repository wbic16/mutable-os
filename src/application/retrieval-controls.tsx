import {createSignal,onMount,onCleanup,Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import {useCurrentCavern} from './cavern-startup';
import {retrievalRequest} from './retrieval-client';
import {featureFlags} from '../configuration';
import './retrieval-controls.css';
export function RetrievalControls(props:{launcher?:(open:()=>void)=>void}={}){
 const cavern=useCurrentCavern();const [open,setOpen]=createSignal(false),[status,setStatus]=createSignal<any>(),[error,setError]=createSignal(''),[busy,setBusy]=createSignal(false);
 const [documents,setDocuments]=createSignal(false),[queries,setQueries]=createSignal(false),[documentTokens,setDocumentTokens]=createSignal(50000),[queryTokens,setQueryTokens]=createSignal(5000);
 let alive=true,timer:ReturnType<typeof setInterval>|undefined,dialog:HTMLDialogElement|undefined,previous:HTMLElement|undefined;
 const refresh=async()=>{const next=await retrievalRequest('status');if(alive)setStatus(next);return next;};
 const show=async()=>{try{const s=await refresh();if(!alive)return;setDocuments(s.documents);setQueries(s.queries);setDocumentTokens(s.documentTokens);setQueryTokens(s.queryTokens);previous=document.activeElement as HTMLElement;setOpen(true);queueMicrotask(()=>dialog?.showModal());}catch(e){setError(String(e));}};
 const allowance=(kind:'document'|'query')=>{const s=status(),used=s?.[kind+'TokensUsed'],cap=s?.[kind+'Tokens'];return used==null?'usage and remaining allowance unavailable':`${used} used; ${Math.max(0,(cap??0)-used)} remaining of ${cap??0} tokens`;};
 const close=()=>{dialog?.close();setOpen(false);previous?.focus();};
 const save=async(decline=false,renew=false)=>{setBusy(true);setError('');try{const s=await retrievalRequest('configure',{indexDocuments:decline?false:documents(),embedQueries:decline?false:queries(),documentTokens:documentTokens(),queryTokens:queryTokens(),...(renew?{renew:true}:{})});if(alive){setStatus(s);if(decline)close();}}catch(e){if(alive)setError(String(e));}finally{if(alive)setBusy(false);}};
 onMount(()=>{props.launcher?.(()=>{void show();});if(!featureFlags.semanticRetrieval||!cavern)return;void refresh().then(s=>{if(s.decision==='unasked')void show();}).catch(()=>{});timer=setInterval(()=>{if(open())void refresh().catch(e=>setError(String(e)));},2500);});
 onCleanup(()=>{alive=false;clearInterval(timer);});
 return <Show when={featureFlags.semanticRetrieval&&cavern}>
  <Show when={!props.launcher}><button type="button" role="menuitem" onClick={()=>void show()}>Index Cavern…</button></Show>
  <Show when={error()&&!open()}><span role="status">{error()}</span></Show>
  <Show when={open()}><Portal><dialog ref={dialog} class="retrieval-controls" aria-labelledby="retrieval-heading" onCancel={e=>{e.preventDefault();if(status()?.decision==='unasked')void save(true);else close();}}>
   <h2 id="retrieval-heading">Index Cavern</h2><p>Semantic search finds related passages across saved Documents in {cavern?.current()?.name}. Initial indexing runs in the background; later saves update it automatically.</p>
   <p><strong>Hosted provider: OpenAI · text-embedding-3-small.</strong> Approved Document text and search queries are sent to OpenAI. Dialectic’s generative model settings are separate. No local embedding provider is installed; Mutable will not silently substitute a hosted provider.</p>
   <label><input type="checkbox" checked={documents()} onChange={e=>setDocuments(e.currentTarget.checked)}/> Authorise all saved Documents in this Cavern, including future Documents and saved revisions</label>
   <label>Document token cap <input type="number" min="1" max="50000" value={documentTokens()} onInput={e=>setDocumentTokens(+e.currentTarget.value)}/></label>
   <label><input type="checkbox" checked={queries()} onChange={e=>setQueries(e.currentTarget.checked)}/> Separately authorise query embeddings from Scry and same-Symposium DCP search</label>
   <label>Query token cap <input type="number" min="1" max="50000" value={queryTokens()} onInput={e=>setQueryTokens(+e.currentTarget.value)}/></label>
   <p>Caps are cumulative for each authorisation, not daily. Renewing explicitly permits another allowance at the caps shown, including retrying unknown upload outcomes. Uncheck a permission and apply to revoke it. Other Caverns retain separate choices.</p>
   <p role="status">{status()?.indexed??'unknown'} indexed / {status()?.known??'unknown'} known saved Documents. {status()?.index?.state==='indexing'?`Indexing: ${status()?.index?.processed??0} processed, ${status()?.index?.failed??0} failed.`:status()?.index?.state==='unavailable'?'Retrieval service unavailable; use Refresh / resume indexing.':status()?.index?.complete?'Indexing complete for the verified saved scope.':'Coverage incomplete or not yet verified.'} {status()?.provider?.configured?'':'Provider credential unavailable. '}{status()?.reauthorizationRequired?'Index lifetime changed; renew authorisation. ':''}Documents: {allowance('document')}; queries: {allowance('query')}.</p>
   <p>Unsaved content is outside the saved index. Missing results do not establish absent knowledge.</p>
   <Show when={status()?.error||status()?.index?.error||status()?.index?.issues?.length}><p role="status">{status()?.error||status()?.index?.error||status()?.index?.issues?.[0]?.error}</p></Show>
   <Show when={error()}><p role="alert">{error()}</p></Show>
   <footer><button disabled={busy()} onClick={()=>void save()}>Apply permissions</button><Show when={status()?.documents||status()?.queries}><button disabled={busy()} onClick={()=>void save(false,true)}>Authorise another allowance</button></Show><button disabled={busy()||!status()?.documents} onClick={()=>void retrievalRequest('refresh').then(setStatus).catch(e=>setError(String(e)))}>Refresh / resume indexing</button><button disabled={busy()} onClick={()=>status()?.decision==='unasked'?void save(true):close()}>{status()?.decision==='unasked'?'Not now':'Close'}</button></footer>
  </dialog></Portal></Show>
 </Show>;
}
