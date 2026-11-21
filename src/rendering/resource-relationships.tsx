import {createSignal,createMemo,onCleanup,Show,For} from 'solid-js';
import {useReactiveView} from '../reactive-editor/context';
import {entityService} from '../application/entity-service';
import type {EntityCandidate} from '../feature-api/entities';
import {HttpApplicationServices} from '../runtime/application-services';
import type {PdfOperations} from '../application-services/pdf-contracts';
/** Explicit review only; no subscription, automatic discovery or entity merging. */
export function ResourceRelationships(props:{snapshotId?:string;ownerKey:string}){
 const {editor}=useReactiveView(),[query,setQuery]=createSignal(''),[matches,setMatches]=createSignal<EntityCandidate[]>([]),[target,setTarget]=createSignal<EntityCandidate>(),[note,setNote]=createSignal(''),[relation,setRelation]=createSignal<PdfOperations['resource.review']['input']['relation']>('representationOf'),[status,setStatus]=createSignal(''),[busy,setBusy]=createSignal(false),[reviews,setReviews]=createSignal<PdfOperations['resource.context']['output']['reviews']>([]);
 const protectedState=createMemo(()=>!editor.canEditText(props.ownerKey));
 const c=new AbortController();let entities:ReturnType<typeof entityService>|undefined;onCleanup(()=>{c.abort();entities?.dispose();});
 const api=new HttpApplicationServices(()=>{const s=editor.readAssetContext();if(!s.cavernId||!s.session)throw Error('Open the source Vault');return {cavernId:s.cavernId,session:s.session};});
 const run=async(fn:()=>Promise<void>)=>{if(busy())return;setBusy(true);try{await fn();}catch(e){if(!c.signal.aborted)setStatus(String(e));}finally{if(!c.signal.aborted)setBusy(false);}};
 const refresh=async()=>{if(!props.snapshotId)return;const r=await api.call('resource.context',{snapshotId:props.snapshotId},c.signal);setReviews(r.reviews);};
 return <Show when={editor.features.crossResourceLoaders&&props.snapshotId}><details><summary>Reviewed resource relationships</summary>
  <p>Resource, snapshot and document occurrence identities remain separate. Accepting a relationship adds an authored Claim to Vault knowledge; document Undo does not undo a canonical review. Existing facts remain unchanged.</p>
  <label>Find existing entity <input value={query()} maxlength={1000} onInput={e=>{setQuery(e.currentTarget.value);setTarget(undefined);}}/></label><button disabled={busy()||!query().trim()} onClick={()=>void run(async()=>{entities??=entityService(editor,props.ownerKey);const result=await entities.search({query:query(),stream:'name',match:'partial',scope:'vault'},c.signal);result.current();setMatches(result.candidates);setStatus(result.diagnostics.join(' '));})}>Find entity</button>
  <For each={matches()}>{m=><p><button onClick={()=>setTarget(m)}>{m.name}</button> <small>{m.id}</small></p>}</For>
  <Show when={target()}>{t=><p>Selected: {t().name} ({t().id})</p>}</Show>
  <label>Relationship <select value={relation()} onChange={e=>setRelation(e.currentTarget.value as any)}><option value="representationOf">Representation of Work / object</option><option value="describes">Describes subject</option><option value="heldBy">Held by institution</option><option value="depicts">Depicts entity</option><option value="cites">Cites Work (explicit evidence only)</option></select></label>
  <label>Evidence / review note <textarea value={note()} maxlength={4000} onInput={e=>setNote(e.currentTarget.value)}/></label>
  <button disabled={protectedState()||busy()||!target()||!note().trim()} onClick={()=>void run(async()=>{if(protectedState())return;await api.call('resource.review',{operationId:crypto.randomUUID(),snapshotId:props.snapshotId!,targetId:target()!.id,relation:relation(),note:note(),decision:'accepted'},c.signal);await refresh();setStatus('Reviewed Claim recorded; no existing fact was overwritten.');})}>Accept relationship as Claim</button>
  <button disabled={busy()} onClick={()=>void run(refresh)}>Show recorded reviews</button><p role="status">{status()}</p><For each={reviews()}>{r=><p>{r.statementId}: {r.decision} {r.claimGuid}</p>}</For>
 </details></Show>;
}
