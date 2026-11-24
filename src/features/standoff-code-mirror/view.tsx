import './style.css';
import { createEffect, createSignal, onCleanup, onMount, untrack, Show } from 'solid-js';
import type { BlockViewProps } from '../../block-tree/types';
import type { ReactiveEditor } from '../../reactive-editor/editor';
import { useReactiveView } from '../../reactive-editor/context';
import { keyboard } from '../../input/bindings';
import { CODE_MIRROR_STANDOFF } from './model';
import { StandoffCodeMirror } from './controller';
import { CodeAnnotationUI, nativeActions } from './ui';
import { codeSurfaces as surfaces } from './mounts';
import { previewRanges } from './projection';
import { Decoration } from '@codemirror/view';
export function mountedCodeMirrors(editor:ReactiveEditor){return [...(surfaces.get(editor)?.values()??[])].map(ui=>ui.code);}
export function mountedCodeMirror(editor:ReactiveEditor,key:string){return surfaces.get(editor)?.get(key)?.code;}
export function StandoffCodeMirrorView(props:BlockViewProps){
  const {editor,projection}=useReactiveView();let root!:HTMLDivElement,code:StandoffCodeMirror|undefined;
  const [notice,setNotice]=createSignal('');const ui=new CodeAnnotationUI(setNotice);
  const node=()=>projection.state.nodes[props.nodeKey];
  const run=(action:string)=>{try{ui.run(action);}catch(e){setNotice(String(e));}};
  onMount(()=>{
    code=new StandoffCodeMirror(editor,props.nodeKey,root,setNotice,{extensions:ui.extensions(),actions:nativeActions,run:ui.run,canRun:ui.supported});ui.install(code);
    let pool=surfaces.get(editor);if(!pool)surfaces.set(editor,pool=new Map());pool.set(props.nodeKey,ui);
    let previewQueued=false,alive=true;onCleanup(()=>{alive=false;});
    createEffect(()=>{
      editor.decorations.nodes[props.nodeKey];if(previewQueued)return;previewQueued=true;
      queueMicrotask(()=>{previewQueued=false;if(!alive||!code)return;
        const ranges=(editor.decorations.nodes[props.nodeKey]??[]).filter(d=>d.range.coordinate==='utf16'&&d.range.version===code!.record().revision);
        code.view.dispatch({effects:previewRanges.of(Decoration.set(ranges.map(d=>Decoration.mark({class:d.active?'cm-mutable-preview-active':'cm-mutable-preview',attributes:{title:d.type}}).range(d.range.start,d.range.end)),true))});
      });
    });
    createEffect(()=>{editor.canEditText(props.nodeKey);untrack(()=>code?.input.syncPermissions());});
  });
  onCleanup(()=>{surfaces.get(editor)?.delete(props.nodeKey);ui.dispose();code?.dispose();});
  return <section class="standoff-code-mirror" data-runtime-key={props.nodeKey} data-code-block={String(node()?.payload.id)} style={{border:'1px solid #aab5c2',margin:'8px 0'}}>
    <div class="standoff-code-mirror-tools" style={{display:'flex',gap:'6px','flex-wrap':'wrap',padding:'5px'}}>
      <label>Language <select aria-label="CodeMirror language" value={String((node()?.payload.metadata as any)?.language??'plain')} disabled={!editor.canEditText(props.nodeKey)} onChange={event=>{try{code?.changeLanguage(event.currentTarget.value);}catch(e){setNotice(String(e));}}}>
        <option value="plain">Plain text</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="json">JSON</option><option value="markdown">Markdown</option><option value="xml">XML</option><option value="sql">SQL</option>
      </select></label>
      <button onPointerDown={e=>e.preventDefault()} onClick={()=>run('code.annotate')}>Annotate</button>
      <button onPointerDown={e=>e.preventDefault()} onClick={()=>run('code.inspect')}>Inspect overlaps</button>
      <button onPointerDown={e=>e.preventDefault()} onClick={()=>run('code.visibility')}>Show / hide annotations</button>
      <button onPointerDown={e=>e.preventDefault()} onClick={()=>run('autocomplete.open')}>Commands</button>
      <Show when={/\r/.test(String(node()?.payload.text??''))}><button onClick={()=>{try{code?.normalize();setNotice('Line endings converted to LF. Undo restores the import.');}catch(e){setNotice(String(e));}}}>Convert imported line endings to LF</button></Show>
    </div>
    <div ref={root}/><Show when={notice()}><p role="status">{notice()}</p></Show>
  </section>;
}
export function registerStandoffCodeMirror(editor:ReactiveEditor){
  if(!editor.features.standoffCodeMirror||!editor.features.editorInputOwnership)return;
  editor.registry.register({type:CODE_MIRROR_STANDOFF,view:StandoffCodeMirrorView,capabilities:['self-managed-editor','selectable','annotations']});
  editor.commandRegistry.register({id:'code.standoff.create',label:'Annotated CodeMirror block',canExecute:({targetKey})=>!!editor.node(targetKey)&&editor.canEditText(targetKey),execute:({targetKey})=>{
    const n=editor.node(targetKey)!;
    const pk=editor.commands.insert({type:CODE_MIRROR_STANDOFF,text:'',metadata:{language:'javascript'},standoffProperties:[]},n.viewType==='document-block'?{kind:'at',parentKey:targetKey,index:n.children.length}:{kind:'after',anchorKey:targetKey});
    queueMicrotask(()=>{const key=editor.projections.get(n.viewId)?.nodeForPlacement(pk)?.key;if(key)editor.focus.request(key,{caret:'start',reason:'create-code'});});
  }});
  for(const slot of ['document-actions','add-block-menu'] as const)editor.featureActions.register({id:'code.standoff.'+slot,slot,command:'code.standoff.create',label:'CodeMirror',title:'New annotated CodeMirror block'},'standoff-code-mirror');
  for(const [id,label] of [['code.annotate','Annotate code'],['code.inspect','Inspect code annotations'],['code.visibility','Toggle code annotations']]){
    editor.commandRegistry.register({id,label,canExecute:({targetKey})=>!!surfaces.get(editor)?.has(targetKey),execute:({targetKey})=>{surfaces.get(editor)?.get(targetKey)?.run(id);}});
    editor.bindings.register({id,name:label,description:label,category:'Code',tags:[],scope:'editor',defaults:id==='code.annotate'?[keyboard('a','Ctrl','Alt')]:[],handler:context=>context.run(id)});
  }
}
