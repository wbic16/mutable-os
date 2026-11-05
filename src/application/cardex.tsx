import {registerCardexPresentations} from './cardex-presentation-registration';
import {Show,createSignal,onMount,onCleanup} from 'solid-js';
import type {CodexFeature} from '../feature-api';
import type {ReactiveEditor} from '../reactive-editor/editor';
import {CardexShell,EntityCardInstrument} from '../features/cardex/view';
/** A normal Window hosts either the navigation shell or the reusable Entity Instrument. */
export function createCardexFeature(editor:ReactiveEditor):CodexFeature{
 return {id:'cardex',activate(scope){
  if(editor.features.applicationPresentations)registerCardexPresentations(editor,scope);
  const open=(independent=false,id?:string,vault?:string)=>{
   const state=editor.repository.readState(),root=state.rootPlacementKey,host=state.contents[state.placements[root].contentKey];
   if(host.viewType!=='workspace-block')throw Error('Open Cardex from the Mutable workspace.');
   const desktop=host.children.find(k=>['image-background-block','canvas-background-block','video-background-block','youtube-video-background-block'].includes(state.contents[state.placements[k].contentKey].viewType))??root;
   let placement='';editor.commands.structuralTransaction('Open Cardex',()=>{placement=editor.commands.insert({id:crypto.randomUUID(),type:'window-block',metadata:{title:independent?'Entity Card':'Cardex',desktopApplication:'cardex',position:{x:85,y:65},size:{w:850,h:690},zIndex:editor.windowManager?.launchMetadata().zIndex??110},children:[{id:crypto.randomUUID(),type:'cardex-application-block',metadata:{independent,...id?{entityId:id}:{},...vault?{vault}:{}}}]},{kind:'at',parentKey:desktop,index:0});});
   editor.windowManager?.activatePlacement(placement);
  };
  const Instance=(props:{nodeKey:string})=>{
   const [blocked,setBlocked]=createSignal(false);const node=editor.node(props.nodeKey)!,metadata=node.payload.metadata as any,windowKey=editor.blockQueries.ancestors(node.key).find(n=>n.viewType==='window-block')?.key;let root!:HTMLDivElement;
   onMount(()=>{onCleanup(editor.mounts.register(node.key,{root,focusElement:root,inputPolicy:'opaque-widget',focus:()=>root.focus()}));if(windowKey){const release=editor.windowManager?.layout.persistable(windowKey,()=>!blocked());if(release)onCleanup(release);}});
   return <div class="cardex-host" ref={root} tabIndex={-1} style={{height:'100%',overflow:'hidden','container-type':'inline-size'}}><Show when={metadata?.independent} fallback={<CardexShell dirtyChanged={setBlocked} host={editor} windowKey={windowKey} openIndependent={(id,vault)=>open(true,id,vault)}/>}><EntityCardInstrument dirtyChanged={setBlocked} host={editor} windowKey={windowKey} initialId={metadata?.entityId} initialVault={metadata?.vault}/></Show></div>;
  };
  scope.own(editor.registry.register({type:'cardex-application-block',capabilities:['opaque-widget'],view:Instance},scope.owner));
  for(const independent of [false,true])scope.own(editor.commandRegistry.register<{id?:string;vault?:string}>({id:independent?'cardex.entity.open':'cardex.open',label:independent?'Open Entity Card':'Open Cardex',canExecute:({targetKey})=>!!editor.node(targetKey),execute:({args})=>open(independent,args?.id,args?.vault)},scope.owner));
 }};
}
