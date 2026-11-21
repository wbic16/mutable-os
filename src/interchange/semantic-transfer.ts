import type { JsonObject } from '../block-tree/types';
import type { InterchangeScope } from './fragment';

/** Remap declared native semantic pointers, never raw XML IDs, witness strings,
 * arbitrary user strings or external URLs. Unknown targets remain explicit
 * source-scoped observations rather than becoming destination-local links. */
export function transferSemanticPointers(value:unknown, resolve:(kind:'block'|'definition',id:string)=>string|undefined, origin:InterchangeScope, tei=false):void {
 if(Array.isArray(value)){for(const v of value)transferSemanticPointers(v,resolve,origin,tei);return;}
 if(!value||typeof value!=='object')return;
 const v=value as JsonObject;
 tei ||= typeof v.role==='string'&&v.role.startsWith('tei/') || typeof v.type==='string'&&v.type.startsWith('tei/');
 if(v.type==='tei/reference'&&Array.isArray(v.tokens))for(const token of v.tokens){
  if(token?.state!=='resolved'||!token.target||!['block','definition'].includes(token.target.kind))continue;
  const target=token.target,next=resolve(target.kind,target.id);
  if(next)target.id=next;else {token.originTarget={...target,source:{...origin}};delete token.target;token.state='unresolved';}
 }
 if(tei)for(const name of ['annotationId','sourceAnnotationId','parentEditorialId','assertionId'])if(typeof v[name]==='string'){
  const id=v[name],next=resolve('definition',id);if(next)v[name]=next;else {v.unresolvedNativePointers={...(v.unresolvedNativePointers as JsonObject??{}),[name]:{id,source:{...origin}}};delete v[name];}
 }
 if(tei)for(const name of ['participantAnnotationIds','placeAnnotationIds','dateAnnotationIds','correspondenceAnnotationIds','actions'])if(Array.isArray(v[name])){
  const missing:string[]=[];v[name]=(v[name] as unknown[]).flatMap(id=>{if(typeof id!=='string')return [id];const next=resolve('definition',id);if(next)return[next];missing.push(id);return[];});
  if(missing.length)v.unresolvedNativePointers={...(v.unresolvedNativePointers as JsonObject??{}),[name]:{ids:missing,source:{...origin}}};
 }
 for(const [key,child]of Object.entries(v))if(!['fields','tokens','unresolvedNativePointers','originTarget'].includes(key))transferSemanticPointers(child,resolve,origin,tei||key==='tei');
}
