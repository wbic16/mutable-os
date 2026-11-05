import {createSignal} from 'solid-js';
import type {ApplicationKey,ApplicationDefinition,ApplicationPresentation,PresentationResolution} from '../feature-api/application-presentation';
import type {PresentationName} from '../reactive-editor/workspace-presentation';

/** Non-owning, per-editor catalogue. Features own contributions; existing owners own instances. */
export class ApplicationPresentations {
 private applications=new Map<string,ApplicationDefinition<any>>();
 private views=new Map<string,Map<PresentationName,Map<string,ApplicationPresentation<any>>>>();
 private revision=createSignal(0);
 private changed(){this.revision[1](n=>n+1);}
 registerApplication<I>(key:ApplicationKey<I>,definition:ApplicationDefinition<I>){
  if(this.applications.has(key.id))throw Error(`Application already registered: ${key.id}`);
  this.applications.set(key.id,definition);this.changed();
  let live=true;return ()=>{if(!live)return;live=false;if(this.applications.get(key.id)===definition){this.applications.delete(key.id);this.changed();}};
 }
 registerPresentation<I>(key:ApplicationKey<I>,presentation:ApplicationPresentation<I>){
  let workspaces=this.views.get(key.id);if(!workspaces)this.views.set(key.id,workspaces=new Map());
  let entries=workspaces.get(presentation.workspace);if(!entries)workspaces.set(presentation.workspace,entries=new Map());
  if(entries.has(presentation.id)||[...workspaces.values()].some(v=>v.has(presentation.id)))throw Error(`Presentation already registered: ${presentation.id}`);
  if(presentation.default&&[...entries.values()].some(p=>p.default))throw Error(`Default already registered: ${key.id}/${presentation.workspace}`);
  entries.set(presentation.id,presentation);this.changed();
  let live=true;return ()=>{if(!live)return;live=false;if(entries!.get(presentation.id)===presentation){entries!.delete(presentation.id);this.changed();}};
 }
 application<I>(key:ApplicationKey<I>):ApplicationDefinition<I>|undefined {this.revision[0]();return this.applications.get(key.id);}
 definitions(){this.revision[0]();return [...this.applications].map(([id,definition])=>({id,definition}));}
 instances(){return this.definitions().flatMap(({id,definition})=>definition.instances().map(value=>({applicationId:id,key:definition.key(value),definition,value})));}
 presentations<I>(key:ApplicationKey<I>,workspace:PresentationName):readonly ApplicationPresentation<I>[] {this.revision[0]();return [...this.views.get(key.id)?.get(workspace)?.values()??[]];}
 resolve<I>(key:ApplicationKey<I>,workspace:PresentationName,instance:I,id?:string,admission=true):PresentationResolution<I>{
  const application=this.application(key);
  if(!application)return {status:'unsupported',reason:`Application is not registered: ${key.id}`};
  if(!application.instances().includes(instance))return {status:'unsupported',reason:'Application instance is no longer available'};
  const entries=this.presentations(key,workspace);
  let selected:ApplicationPresentation<I>|undefined;
  if(id)selected=this.views.get(key.id)?.get(workspace)?.get(id);
  else {const available=entries.filter(p=>!p.available?.(instance));selected=available.find(p=>p.default)??(available.length===1?available[0]:undefined);}
  if(!selected)return {status:'unsupported',reason:id?`Presentation ${id} is unavailable in ${workspace}`:entries.length?`Choose an available ${key.id} presentation for ${workspace}`:`${key.id} has no ${workspace} presentation`};
  const unavailable=selected.available?.(instance);if(unavailable)return {status:'unsupported',reason:unavailable};
  const blocked=admission&&selected.admit?.(instance);return blocked?{status:'blocked',reason:blocked}:{status:'ready',presentation:selected};
 }
 checkTransition(from:PresentationName,to:PresentationName){
  for(const item of this.instances()){
   const result=this.resolve({id:item.applicationId},to,item.value);
   // Unadapted applications retain the workspace's original guards.
   if(result.status==='unsupported')continue;
   if(result.status==='blocked')throw Error(result.reason);
   const reason=item.definition.checkTransition?.(item.value,from,to);if(reason)throw Error(reason);
  }
 }
 allowsNode(nodeKey:string,from:PresentationName,to:PresentationName){
  return this.instances().some(item=>item.definition.ownsNode?.(item.value,nodeKey)&&
   this.resolve({id:item.applicationId},from,item.value,undefined,false).status==='ready'&&
   this.resolve({id:item.applicationId},to,item.value).status==='ready'&&
   !!item.definition.checkTransition&&!item.definition.checkTransition(item.value,from,to));
 }
 remember(){for(const item of this.instances())item.definition.remember?.(item.value);}
}
