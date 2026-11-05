import {Show,createMemo} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {ApplicationPresentations} from '../runtime/application-presentations';
import type {ReactiveEditor} from '../reactive-editor/editor';
import type {ApplicationKey,ApplicationPresentationHost} from '../feature-api/application-presentation';
import type {PresentationName} from '../reactive-editor/workspace-presentation';
const registries=new WeakMap<ReactiveEditor,ApplicationPresentations>();
export function applicationPresentations(editor:ReactiveEditor){let r=registries.get(editor);if(!r){r=new ApplicationPresentations();registries.set(editor,r);}return r;}
export const originPresentationHost:ApplicationPresentationHost={active:()=>true,open:async()=>{throw Error('Use the application launch command');},select:()=>{},back:()=>{}};
/** Live contribution removal unmounts only this view. Temporary barriers never unmount an active view. */
export function RegisteredApplicationView<I>(props:{editor:ReactiveEditor;application:ApplicationKey<I>;instance:I;workspace:PresentationName;host:ApplicationPresentationHost;presentationId?:string}){
 const registry=applicationPresentations(props.editor);
 let admitted:unknown,admittedInstance:unknown;
 const resolution=createMemo(()=>{
  const r=registry.resolve(props.application,props.workspace,props.instance,props.presentationId,false);
  if(r.status!=='ready'){admitted=undefined;return r;}
  if(admitted!==r.presentation||admittedInstance!==props.instance){
   const checked=registry.resolve(props.application,props.workspace,props.instance,props.presentationId);
   if(checked.status!=='ready')return checked;
   admitted=r.presentation;admittedInstance=props.instance;
  }
  return r;
 });
 const view=createMemo<{instance:I;component:import('solid-js').Component<{instance:I;host:ApplicationPresentationHost}>}|undefined>(previous=>{
  const r=resolution();if(r.status!=='ready')return;
  return previous?.instance===props.instance&&previous.component===r.presentation.view?previous:{instance:props.instance,component:r.presentation.view};
 });
 return <Show when={view()} keyed fallback={<p role="status">{(()=>{const r=resolution();return r.status==='ready'?'':r.reason;})()}</p>}>{value=><Dynamic component={value.component} instance={value.instance} host={props.host}/>}</Show>;
}
