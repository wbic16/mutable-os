import { ReverseInformation } from './reversible-surface';
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { BlockViewProps } from '../block-tree/types';
import { useReactiveView } from '../reactive-editor/context';
import { ChildBlocks } from './block-outlet';
import { sourceFormat, textareaText, editSource } from '../interchange/source-block';
import type { compileSourcePreview } from '../interchange/source-preview';
import { runInterchange } from '../runtime/interchange-worker';
import './source-block.css';
import { blockAppearance } from './appearance';

/** Preview state and its worker belong to this occurrence, never canonical data. */
export function SourceBlockView(props:BlockViewProps) {
 const {editor,projection}=useReactiveView(),node=()=>projection.state.nodes[props.nodeKey];
 const format=createMemo(()=>{try{return sourceFormat(node().viewType,node().payload);}catch{return undefined;}});
 const appearance=createMemo(()=>blockAppearance(node()));
 const text=()=>String(node()?.payload.text??'');
 const [mode,setMode]=createSignal<'source'|'preview'>('source'),[pending,setPending]=createSignal(false),[error,setError]=createSignal('');
 const [preview,setPreview]=createSignal<ReturnType<typeof compileSourcePreview>>(),[renderedSource,setRenderedSource]=createSignal<string>();
 let root!:HTMLDivElement,textarea!:HTMLTextAreaElement,unmount:(()=>void)|undefined,controller:AbortController|undefined;
 let before:{start:number;end:number;inputType?:string}|undefined,composition=false,compositionSource:string|undefined,alive=true;
 const selection=()=>({start:textarea.selectionStart,end:textarea.selectionEnd,direction:textarea.selectionDirection});
 const restore=(s:ReturnType<typeof selection>)=>textarea.setSelectionRange(Math.min(s.start,textarea.value.length),Math.min(s.end,textarea.value.length),s.direction);
 const capture=(event:InputEvent)=>{
  if(composition)return;
  if(event.cancelable&&(event.inputType==='historyUndo'||event.inputType==='historyRedo')){
   event.preventDefault();before=undefined;
   if(event.inputType==='historyUndo')editor.repository.undo();else editor.repository.redo();
   return;
  }
  before={...selection(),inputType:event.inputType};
 };
 function source(){controller?.abort();setPending(false);setMode('source');queueMicrotask(()=>{if(alive)textarea.focus({preventScroll:true});});}
 async function renderPreview(){
  if(composition||editor.mounts.get(props.nodeKey)?.composing)return;
  controller?.abort();const snapshot=text();
  if(preview()&&renderedSource()===snapshot){setMode('preview');return;}
  const job=controller=new AbortController();setPending(true);setError('');
  try {const format=sourceFormat(node().viewType,node().payload);const result=await runInterchange({kind:'preview',source:snapshot,format},job.signal);
   if(!alive||job.signal.aborted||snapshot!==text())return;
   setPreview(result);setRenderedSource(snapshot);setMode('preview');
  }catch(e){if(alive&&!job.signal.aborted)setError(e instanceof Error?e.message:String(e));}
  finally{if(alive&&controller===job)setPending(false);}
 }
 onMount(()=>{unmount=editor.mounts.register(props.nodeKey,{root,focusElement:textarea,inputPolicy:'native-text',focus:source,captureSelection:selection,restoreSelection:restore,
  authoredNativeText(value){
   const current=text();
   // A linked occurrence may change during an IME run. Never overwrite that edit.
   if(compositionSource!==undefined&&compositionSource!==current){textarea.value=textareaText(current);compositionSource=undefined;before=undefined;return current;}
   const next=editSource(current,value,before);before=undefined;compositionSource=undefined;return next;
  },contextActions:()=>[{label:'Convert whole source Block to Mutable Ink',disabled:!editor.canEditText(props.nodeKey),run:()=>{if(editor.canEditText(props.nodeKey))void editor.interchange.convertSourceBlock(props.nodeKey);}}]});
 });
 createEffect(()=>{const value=textareaText(text());if(!textarea||composition||textarea.value===value)return;const s=selection();textarea.value=value;restore(s);});
 onCleanup(()=>{alive=false;controller?.abort();unmount?.();});
 return <div ref={root} class={`abstract-block mutable-source-block ${appearance().classes.join(" ")}`} style={appearance().style} data-runtime-key={props.nodeKey} data-client-id={props.nodeKey} data-block-type={node()?.viewType}>
  <div class="mutable-source-toolbar" role="group" aria-label="Source Block modes">
   <strong>{node()?.viewType==='mutable/markdown-source-block'?'Markdown':'HTML'}</strong>
   <button aria-pressed={mode()==='source'} onClick={source}>Source</button>
   <button aria-pressed={mode()==='preview'} disabled={pending()||!format()} onClick={()=>void renderPreview()}>Preview</button>
   <Show when={mode()==='preview'}><button disabled={pending()} onClick={()=>void renderPreview()}>Refresh preview</button></Show>
   <button disabled={!format()||!editor.canEditText(props.nodeKey)} onClick={()=>{if(editor.canEditText(props.nodeKey))void editor.interchange.convertSourceBlock(props.nodeKey);}}>Convert to Mutable Ink…</button>
   <Show when={(node()?.payload.metadata as any)?.sourceLink}><button disabled={!editor.canEditText(props.nodeKey)} onClick={()=>{if(editor.canEditText(props.nodeKey))editor.interchange.refreshSource(props.nodeKey);}}>Reconnect / refresh source…</button></Show>
   <Show when={pending()}><span role="status">Preparing preview…</span></Show>
   <Show when={preview()&&renderedSource()!==text()}><span role="status">Preview is out of date.</span></Show>
  </div>
  <Show when={!format()}><p>Unsupported source schema. Authored data is retained without interpretation.</p></Show>
  <Show when={error()}><p role="status">{error()}</p></Show>
  <textarea ref={textarea} hidden={mode()!=='source'} aria-label="Authoritative source" spellcheck={false} readOnly={!format()||!editor.canEditText(props.nodeKey)}
   onBeforeInput={capture}
   onCompositionStart={()=>{before=selection();compositionSource=text();composition=true;}}
   onCompositionEnd={()=>{composition=false;}}
  />
  <Show when={mode()==='preview'&&preview()}>{value=><div class="mutable-source-preview">
   <div class="mutable-source-frame"><iframe title="Isolated source preview" sandbox="" referrerpolicy="no-referrer" srcdoc={value().srcdoc}/></div>
   <For each={value().warnings}>{warning=><p>{warning}</p>}</For>
   <ReverseInformation nodeKey={props.nodeKey}>   <Show when={value().resources.length}><details><summary>External resources (not loaded)</summary><ul><For each={value().resources}>{url=><li>{url}</li>}</For></ul></details></Show>
   <Show when={value().links.length}><details><summary>External links</summary><For each={value().links}>{url=><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>}</For></details></Show></ReverseInformation>
  </div>}</Show>
  <Show when={node()?.payload.inactiveSourceAnnotations||Array.isArray(node()?.payload.standoffProperties)&&(node()?.payload.standoffProperties as unknown[]).length}><p>Source annotations are retained as inactive data.</p></Show>
  <ChildBlocks parentKey={props.nodeKey}/>
 </div>;
}
