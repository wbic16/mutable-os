import {ConversationHistory} from './continuity';
import {createEffect,createMemo,createRoot,createSignal,onCleanup,untrack,type Accessor} from 'solid-js';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import {documentApplicationPorts,type DocumentApplicationPort} from '../../application/document-application-ports';
import type {RetainedDocumentSession} from '../../application/document-sessions';
import {DialecticProviderSession} from './dcp/live';
import {conversationalSelection,copyVocabularySelection} from './dcp/vocabulary';
import {conversationPreferences} from './preferences';
import type {createConversationRuntime,DialecticController} from './controller';

/** Operational state only: native Documents, tabs and editor ownership stay in
 * their existing services. The detached owner permits an in-flight operation to
 * finish if its application closes while another native view still owns the Document. */
export function createConversationCoordinator(editor:ReactiveEditor,port:Accessor<DocumentApplicationPort|undefined>,factory:typeof createConversationRuntime):DialecticController {
 return createRoot(disposeCoordinator=>{
  const history=new ConversationHistory(editor);
  const connection=new DialecticProviderSession(editor.features.dcpTestPhaseLogging,()=>editor.readAssetContext());
  const [defaultProvider,setDefaultProvider]=createSignal({...connection.settings});
  let vocabulary=conversationalSelection;try{const saved=localStorage.getItem('mutable.dialectic.vocabulary-default.v1');if(saved)vocabulary=copyVocabularySelection(JSON.parse(saved));}catch{}
  const [defaultVocabulary,setDefaultVocabulary]=createSignal(vocabulary);
  const defaults={get provider(){return defaultProvider();},get vocabulary(){return defaultVocabulary();}};
  const [revision,touch]=createSignal(0);
  type Runtime=ReturnType<typeof factory>;
  type Entry={runtime:Runtime;source:Accessor<RetainedDocumentSession>;bind:(s:RetainedDocumentSession)=>void;dispose:()=>void};
  const entries=new Map<string,Entry>();
  let detached=false,ended=false,fallback:Runtime|undefined,disposeFallback:(()=>void)|undefined;
  const sourceId=(s:RetainedDocumentSession|undefined)=>{const n=s?.projection.node(s.rootKey);return String((n?.payload.metadata as any)?.documentId??n?.payload.id??'');};
  const openTabs=(p:DocumentApplicationPort)=>p.documentTabs?.()??p.tabs();
  const memberships=createMemo(()=>documentApplicationPorts(editor).ports().flatMap(p=>openTabs(p).map(t=>({owner:p.key,...t}))));
  const pending=(r:Runtime)=>r.busy()||r.providerConfiguring()||!!r.files.pending()||r.titlePending();
  const remove=(id:string)=>{const e=entries.get(id);if(!e)return;entries.delete(id);e.dispose();touch(n=>n+1);};
  const shutdown=()=>{if(ended)return;ended=true;for(const id of [...entries.keys()])remove(id);fallback?.dispose();disposeFallback?.();connection.dispose();history.dispose();disposeCoordinator();};
  const forget=async()=>{for(const e of entries.values()){e.runtime.cancel();e.runtime.files.cancel();await e.runtime.forgetConnection();}await connection.forget();};
  const ensure=(source:RetainedDocumentSession):Entry=>{
   const id=sourceId(source),found=entries.get(id);if(found)return found;
   const entry=createRoot(dispose=>{
    const [bound,setBound]=createSignal(source);let release=editor.documentSessions!.retainOperation(source);
    const application=port()!;
    // Keep the source Document stable even when the application selects another tab.
    const owningApplication=()=>documentApplicationPorts(editor).ports().find(p=>openTabs(p).some(t=>t.documentId===id))?.application??application.application;
    const fixedPort={...application,session:bound,application:{...application.application,renameDocument:(documentId:string,title:string)=>owningApplication().renameDocument(documentId,title),files:application.application.files?{...application.application.files,saveSubmitted:(documentId:string,name:string)=>owningApplication().files?.saveSubmitted?.(documentId,name)??Promise.resolve(false)}:undefined}};
    const runtime=factory(editor,()=>fixedPort,{
     history,provider:new DialecticProviderSession(editor.features.dcpTestPhaseLogging,()=>editor.readAssetContext(),connection),
     preferences:conversationPreferences((source.projection.node(source.rootKey)?.payload.metadata as any)?.dialectic?.preferences),defaults,
     active:()=>!detached&&sourceId(port()?.session())===id&&!!port()?.session()?.host.activity().visible,
     forget,
    });
    return {runtime,source:bound,bind:(s:RetainedDocumentSession)=>{if(s===bound())return;const next=editor.documentSessions!.retainOperation(s),old=release;release=next;setBound(s);old();},dispose:()=>{runtime.dispose();release();dispose();}};
   });
   entries.set(id,entry);touch(n=>n+1);return entry;
  };
  // Membership is identity-only. Dirty flags and ordinary text revisions are not dependencies.
  createEffect(()=>{revision();const owners=memberships(),own=port()?.key;
   for(const [id,e]of entries){
    const present=!!e.source().projection.node(e.source().rootKey),hasOwn=!detached&&owners.some(t=>t.owner===own&&t.documentId===id);
    if(!present||!owners.some(t=>t.documentId===id)||!hasOwn&&!pending(e.runtime))untrack(()=>remove(id));
   }
   if(detached&&!entries.size)untrack(shutdown);
  });
  const active=createMemo(()=>{
   const s=port()?.session();if(!s||!sourceId(s)||detached)return;
   return untrack(()=>ensure(s));
  });
  createEffect(()=>{const e=active(),s=port()?.session();if(e&&s&&!pending(e.runtime)&&s!==e.source())untrack(()=>e.bind(s));});
  const current=():Runtime=>{
   const e=active();if(e)return e.runtime;
   if(!fallback)fallback=createRoot(dispose=>{disposeFallback=dispose;return factory(editor,()=>undefined);});
   return fallback;
  };
  const status=(id:string)=>{revision();const r=entries.get(id)?.runtime;if(!r)return '';if(r.files.failure())return 'Upload error';if(r.files.pending())return 'Uploading';if(r.titlePending())return 'Naming';return ({idle:'',running:'Responding',complete:'Complete',error:'Error',cancelled:'Cancelled'})[r.operationStatus()];};
  createEffect(()=>{const p=port();if(!p)return;
   const stopStatus=p.setTabActivity?.(status);
   const stopGuard=p.setCloseGuard?.((ids,signal,keys)=>{
    if(signal?.aborted)return false;
    const remaining=memberships().filter(t=>t.owner!==p.key||!keys?.includes(t.key));
    const interrupted=ids.filter(id=>!remaining.some(t=>t.documentId===id)&&entries.has(id)&&pending(entries.get(id)!.runtime));
    return !interrupted.length||window.confirm('Close this conversation and cancel its active operations? Authored content remains in the workspace; save the Document to retain it on disk.');
   });
   onCleanup(()=>{stopStatus?.();stopGuard?.();});
  });
  const lifetime=editor.documentSessions?.signal;lifetime?.addEventListener('abort',shutdown,{once:true});
  onCleanup(()=>lifetime?.removeEventListener('abort',shutdown));
  const controls={status,runtime:(id:string)=>entries.get(id)?.runtime,useAsDefaults:()=>{
   const r=current();setDefaultProvider({...r.providerSettings()});setDefaultVocabulary(r.vocabularySelection());try{localStorage.setItem('mutable.dialectic.vocabulary-default.v1',JSON.stringify(defaults.vocabulary));}catch{}
   void connection.configure(defaults.provider).catch(error=>r.run(()=>{throw error;}));
  }};
  // Stable forwarding lets mounted chrome follow the active runtime. Nested tool
  // controllers are forwarded too; event handlers must not capture yesterday's tab.
  const nested=new Map<PropertyKey,object>(),methods=new Map<PropertyKey,Function>();
  return new Proxy({} as DialecticController,{get(_target,key){
   if(key==='editor')return editor;if(key==='conversations')return controls;if(key==='port')return port;
   if(key==='dispose')return ()=>{detached=true;touch(n=>n+1);};
   const value=(current() as any)[key];
   if(typeof value==='function'){if(!methods.has(key))methods.set(key,(...args:unknown[])=>(current() as any)[key](...args));return methods.get(key);}
   if(['files','sequences'].includes(String(key))){if(!nested.has(key))nested.set(key,new Proxy({},{get(_t,child){const v=(current() as any)[key][child];return typeof v==='function'?(...args:unknown[])=>(current() as any)[key][child](...args):v;}}));return nested.get(key);}
   return value;
  }});
 },null);
}
