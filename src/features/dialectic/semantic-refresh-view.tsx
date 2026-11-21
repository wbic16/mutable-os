import {createSignal,onCleanup,Show} from 'solid-js';
import type {DialecticController} from './controller';

/** Local comment editing never enters the Document or its change tracking. */
export function SemanticRefreshControl(props:{c:DialecticController;id:string}){
 const [open,setOpen]=createSignal(false),[comment,setComment]=createSignal('');
 const state=()=>props.c.semanticRefreshState()?.id===props.id?props.c.semanticRefreshState():undefined;
 const pending=()=>state()?.status==='running';
 const committed=()=>props.c.rows().find(r=>r.id===props.id)?.data.state==='committed';
 return <Show when={props.c.editor.features.dialecticSemanticRefresh&&committed()}><div class="dialectic-semantic-refresh" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <Show when={!open()&&!pending()}><button type="button" disabled={props.c.busy()||props.c.providerConfiguring()||props.c.resending()} onClick={()=>setOpen(true)}>Refresh semantics</button></Show>
  <Show when={open()&&!pending()}><form onSubmit={e=>{e.preventDefault();const text=comment();setOpen(false);setComment('');void props.c.refreshSemantics(props.id,text);}}>
   <label>Additional instructions (optional)<textarea ref={element=>{onCleanup(props.c.editor.textProtection.allowTransientInput(element));queueMicrotask(()=>{if(element.isConnected)element.focus();});}} rows={3} maxLength={4000} value={comment()} onInput={e=>setComment(e.currentTarget.value)} placeholder="For example: identify more relationships between patrons and artists, and extract the claims supporting each argument."/></label>
   <div><button type="submit" disabled={props.c.busy()||props.c.providerConfiguring()}>Refresh</button><button type="button" onClick={()=>{setOpen(false);setComment('');}}>Cancel</button></div>
  </form></Show>
  <Show when={pending()}><div role="status" aria-live="polite"><span class="dialectic-spinner" aria-hidden="true"/> Refreshing semantics… <button type="button" onClick={()=>props.c.cancel()}>Stop</button></div></Show>
  <Show when={!pending()&&!open()&&state()}><p role={state()?.status==='error'?'alert':'status'}>{state()?.message}</p></Show>
 </div></Show>;
}
