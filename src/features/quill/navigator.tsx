import {For,Show,createMemo} from 'solid-js';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {RetainedDocumentSession} from '../../application/document-sessions';
import {QUILL_TYPE} from './model';
import type {QuillStudio} from './studio';
/** Per-branch structural subscriptions: labels never read text or save status. */
export function QuillNavigator(props:{editor:ReactiveEditor;session:RetainedDocumentSession;studio?:QuillStudio}){
 const Row=(p:{nodeKey:string;depth:number})=>{
  const node=()=>props.session.projection.node(p.nodeKey);
  const label=createMemo(()=>{const n=node();return n?.viewType===QUILL_TYPE?'Composition':n?.viewType==='standoff-editor-block'?'Text':n?.viewType.replace(/-block$/,'').replaceAll('-',' ')??'Unavailable';});
  const choose=()=>{const n=node();if(!n)return;const source=n.viewType===QUILL_TYPE?props.studio?.sources().find(s=>s.root.closest('.quill-composition')===props.editor.mounts.get(n.key)?.root):props.studio?.sources().find(s=>s.key===n.key);if(source)props.studio?.choose(source.key);else{props.studio?.setActive(undefined);const m=props.editor.mounts.get(n.key);m?.root.scrollIntoView?.({block:'nearest'});props.editor.focus.request(n.key,{reason:'quill-navigator'});}};
  return <Show when={node()}><li><button style={{'padding-left':`${8+p.depth*12}px`}} onClick={choose} title={String(node()?.payload.id??'')}>{label()}</button><Show when={node()?.children.length}><ul><For each={node()?.children??[]}>{key=><Row nodeKey={key} depth={p.depth+1}/>}</For></ul></Show></li></Show>;
 };
 return <ul class="quill-block-navigator" aria-label="Native document Blocks"><For each={props.session.projection.node(props.session.rootKey)?.children??[]}>{key=><Row nodeKey={key} depth={0}/>}</For></ul>;
}
