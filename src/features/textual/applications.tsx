import {ErrorBoundary,For,Show,createContext,createEffect,createMemo,createSignal,onCleanup,useContext,untrack,type Accessor} from 'solid-js';
import type {WorkspaceSession} from '../../application/workspace-session';
import {applicationPresentations,RegisteredApplicationView} from '../../application/application-presentations';
import type {ApplicationPresentationHost} from '../../feature-api/application-presentation';
import type {TextualGrid} from './grid';
const Context=createContext<{session:WorkspaceSession;grid:Accessor<TextualGrid>}>();
export const useTextualApplicationHost=()=>{const c=useContext(Context);if(!c)throw Error('Textual application host is unavailable');return c;};
/** Small application stack over existing windows. App adapters retain editor ownership and navigation semantics. */
export function TextualApplications(props:{session:WorkspaceSession;grid:TextualGrid}){
 const editor=props.session.editor,registry=applicationPresentations(editor),instances=createMemo(()=>registry.instances());
 type Instance=ReturnType<typeof instances>[number];
 const identity=(p:Instance)=>JSON.stringify([p.applicationId,p.key]);
 const [stack,setStack]=createSignal<string[]>([]),[notice,setNotice]=createSignal('');
 let alive=true,lastWorking:string[]=[];
 onCleanup(()=>{alive=false;});
 const item=(id:string)=>instances().find(p=>identity(p)===id);
 const current=()=>item(stack().at(-1)??'');
 const leave=()=>{
  const previous=current();if(!previous)return;
  const reason=previous.definition.checkTransition?.(previous.value,'textual','textual');
  if(reason)throw Error(reason);
  previous.definition.remember?.(previous.value);
 };
 const prepare=(next:Instance|undefined)=>{
  if(!next)throw Error('Application instance is unavailable');
  const r=registry.resolve({id:next.applicationId},'textual',next.value);
  if(r.status!=='ready')throw Error(r.reason);
  leave();return next;
 };
 const run=(action:()=>void)=>{try{setNotice('');action();}catch(e){setNotice(String(e));}};
 const resume=(id:string,navigation=false)=>queueMicrotask(()=>{
  if(alive&&stack().at(-1)===id){const p=item(id);p?.definition.resume?.(p.value,navigation);}
 });
 const select=(id:string)=>run(()=>{
  prepare(item(id));lastWorking=stack();setStack(s=>s.length?[...s.slice(0,-1),id]:[id]);resume(id);
 });
 const back:ApplicationPresentationHost['back']=destination=>run(()=>{
  const previous=stack().slice(0,-1);
  const target=destination&&typeof destination==='object'
   ? instances().find(p=>p.applicationId===destination.applicationId&&p.key===destination.instanceKey)
   : item(previous.at(-1)??'')??instances().find(p=>identity(p)!==stack().at(-1)&&registry.resolve({id:p.applicationId},'textual',p.value).status==='ready');
  if(!target){if(destination)throw Error('Navigation destination is unavailable');leave();setStack([]);return;}
  prepare(target);lastWorking=stack();const id=identity(target);
  setStack(previous.length?[...previous.slice(0,-1),id]:[id]);resume(id,!!destination);
 });
 const open=async(applicationId:string)=>{
  try{
   setNotice('');leave();let next=instances().find(p=>p.applicationId===applicationId);
   if(!next){
    const definition=registry.application({id:applicationId});if(!definition?.open)throw Error('Application cannot be opened');
    await definition.open();await Promise.resolve();if(!alive)return;
    next=instances().find(p=>p.applicationId===applicationId);
   }
   const target=prepare(next),id=identity(target);lastWorking=stack();
   const windowId=target.definition.windowId?.(target.value);if(windowId)editor.windowManager?.lifecycle.reveal(windowId);
   setStack(s=>s.includes(id)?s.slice(0,s.indexOf(id)+1):[...s,id]);resume(id);
  }catch(e){if(alive)setNotice(String(e));}
 };
 createEffect(()=>{
  const live=instances();untrack(()=>{
   setStack(s=>s.filter(id=>live.some(p=>identity(p)===id)));if(stack().length)return;
   const compatible=live.flatMap(p=>{const r=registry.resolve({id:p.applicationId},'textual',p.value,undefined,false);return r.status==='ready'?[{p,priority:r.presentation.entryPriority??0}]:[];});
   const highest=Math.max(...compatible.map(v=>v.priority)),preferred=compatible.filter(v=>v.priority===highest);
   const first=preferred.find(v=>v.p.definition.windowId?.(v.p.value)===editor.windowManager?.registry.activeWindowId)??preferred[0];
   if(first)select(identity(first.p));
  });
 });
 const failed=(error:unknown,id:string)=>{
  const previous=lastWorking.filter(k=>k!==id&&item(k));
  queueMicrotask(()=>{if(alive&&stack().includes(id)){setNotice(`Presentation failed: ${String(error)}`);setStack(previous);const target=previous.at(-1);if(target)resume(target);}});
  return <div class="tw-cell" role="alert" style={{top:'calc(3 * var(--tw-line-height))'}}>Presentation failed: {String(error)} <button onClick={()=>back()}>Return</button></div>;
 };
 return <Context.Provider value={{session:props.session,grid:()=>props.grid}}>
  <Show when={notice()}><p role="status" class="tw-cell" style={{left:'var(--tw-cell-width)',top:'calc(2 * var(--tw-line-height))','z-index':90}}>{notice()}</p></Show>
  <Show when={stack().length} fallback={<div class="tw-cell" style={{top:'calc(3 * var(--tw-line-height))',left:'var(--tw-cell-width)'}}>Open an application. <For each={registry.definitions()}>{app=><button onClick={()=>void open(app.id)}>Open {app.definition.name}</button>}</For></div>}>
   <For each={stack()}>{id=>{const entry=createMemo(()=>item(id));return <Show when={entry()}>{value=><ErrorBoundary fallback={error=>failed(error,id)}>
    <RegisteredApplicationView editor={editor} application={{id:value().applicationId}} instance={value().value} workspace="textual" host={{active:()=>stack().at(-1)===id,open,select:key=>select(JSON.stringify([value().applicationId,key])),back}}/>
   </ErrorBoundary>}</Show>;}}</For>
  </Show>
 </Context.Provider>;
}
