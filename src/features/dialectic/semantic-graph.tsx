import {For,createEffect,createMemo,createSignal,onCleanup,onMount} from 'solid-js';
import {diagramFrame} from '../../structured/mermaid-view';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import {bindSemanticThumbnail,type SemanticThumbnail} from './semantic-thumbnail';
import {mermaidLabel} from '../gloss/mermaid';
export interface SemanticGraphNode {id:string;label:string}
export interface SemanticGraphEdge {id:string;from:string;to:string;label:string}
/** Relationship pills are selectable edge labels; only recorded endpoints produce arrows. */
export function semanticGraph(nodes:SemanticGraphNode[],edges:SemanticGraphEdge[],limit=60,withPortraits=false){
 const included=nodes.slice(0,limit),tokens=new Map(included.map((n,i)=>[n.id,'G'+i])),navigation:Record<string,string>={},identities:Record<string,string>={};
 const portraits:Record<string,string>={},lines=['flowchart TB'];
 for(const n of included){const token=tokens.get(n.id)!;if(withPortraits)portraits[token]=n.label;lines.push(`${token}["${withPortraits?'MMMMMM\nMMMMMM\nMMMMMM\n':''}${mermaidLabel(n.label,90)}"]`);navigation[token]=n.label;identities[token]=n.id;}
 const eligible=edges.filter(e=>tokens.has(e.from)&&tokens.has(e.to)),shown=eligible.slice(0,120);
 shown.forEach((e,i)=>{const token='G'+(included.length+i);lines.push(`${token}(["${mermaidLabel(e.label)}"])`,`${tokens.get(e.from)} --> ${token} --> ${tokens.get(e.to)}`);navigation[token]=e.label;identities[token]=e.id;});
 lines.push('classDef entity fill:#faf8ff,stroke:#b8a4ee,color:#262033,rx:12,ry:12','classDef relation fill:#eee8ff,stroke:#d8ccf7,color:#3c257d,font-size:12px');if(included.length)lines.push('class '+included.map(n=>tokens.get(n.id)).join(',')+' entity');if(shown.length)lines.push('class '+shown.map((_,i)=>'G'+(included.length+i)).join(',')+' relation');
 return {source:lines.join('\n'),navigation,identities,portraits,truncated:included.length<nodes.length||shown.length<edges.length};
}
export function SemanticGraph(props:{editor?:ReactiveEditor;portraits?:boolean;thumbnails?:Record<string,SemanticThumbnail>;nodes:SemanticGraphNode[];edges:SemanticGraphEdge[];active:boolean;selected?:string;select:(id:string)=>void}){
 let host!:HTMLDivElement;const [status,setStatus]=createSignal(''),[control,setControl]=createSignal<Awaited<ReturnType<typeof diagramFrame>>>();
 const graph=createMemo(()=>semanticGraph(props.nodes,props.edges,60,props.portraits));
 createEffect(()=>control()?.selectNode(Object.keys(graph().identities).find(token=>graph().identities[token]===props.selected)));
 onMount(()=>createEffect(()=>{if(!props.active)return;const g=graph(),abort=new AbortController();let dispose:Awaited<ReturnType<typeof diagramFrame>>|undefined;
  setStatus(g.truncated?'Showing up to 60 objects and 120 relationships. Use search to narrow the graph.':'');
  if(props.nodes.length)void diagramFrame(host,g.source,abort.signal,error=>{if(!abort.signal.aborted&&error)setStatus(error);},{fit:true,panZoom:true,portraits:g.portraits,title:'Interactive semantic relationship diagram',numericLabelEntities:true,navigation:{nodes:g.navigation,onSelect:token=>{if(!abort.signal.aborted&&props.active)props.select(g.identities[token]);}}}).then(d=>{dispose=d;if(abort.signal.aborted)d();else setControl(()=>d);}).catch(e=>{if(!abort.signal.aborted)setStatus(String(e));});
  else host.replaceChildren();
  onCleanup(()=>{abort.abort();dispose?.();setControl(undefined);});
 }));
 return <div class="semantics-graph"><For each={Object.keys(graph().portraits)}>{token=><GraphThumbnail editor={props.editor} control={control()} token={token} active={props.active} thumbnail={props.thumbnails?.[graph().identities[token]]}/>}</For><p role="status">{status()}</p><div class="semantics-graph-scroll"><div ref={host} class="semantics-graph-host"/></div><div class="semantics-zoom"><button aria-label="Zoom graph in" onClick={()=>control()?.viewport('in')}>+</button><button aria-label="Zoom graph out" onClick={()=>control()?.viewport('out')}>−</button><button onClick={()=>control()?.viewport('reset')}>Reset</button></div></div>;
}

function GraphThumbnail(props:{editor?:ReactiveEditor;control?:Awaited<ReturnType<typeof diagramFrame>>;token:string;active:boolean;thumbnail?:SemanticThumbnail}){
 const thumbnail=createMemo(()=>props.thumbnail??{},undefined,{equals:(a,b)=>a?.url===b.url&&a?.asset?.cavernId===b.asset?.cavernId&&a?.asset?.assetId===b.asset?.assetId});
 createEffect(()=>{const frame=props.control,value=thumbnail();if(!frame||!props.active)return;
  if(props.editor)onCleanup(bindSemanticThumbnail(props.editor,value,url=>frame.thumbnail(props.token,url)));
  else frame.thumbnail(props.token,value.url);
 });
 return null;
}
