import {contentLength,contentSlice} from "../block-tree/inline-sequence";
import {annotationCollector} from './facts-annotations';
import {resolveLinkedProperty, linkedDefinitionOwner} from '../block-tree/linked-annotations';
import {canonicalSearchSource} from '../runtime/canonical-search-source';
import type {SearchSource} from '../runtime/search-matching';
import type {RepositoryState} from '../block-tree/types';
import type {Facts,BlockFact} from './facts';
import {normalizePolicy,opaqueType,nativeTextTypes,sourceTextTypes,type ExtractionPolicy} from './policy';
/** Inline text adapter; never used by native admission/save. */
export interface InlineFacts {
 length:number; text:Omit<SearchSource,'contentKey'|'version'>;
 snippet(start:number,end:number):string|Promise<string>;
}
export type InlineReader=(blockId:string,signal?:AbortSignal)=>Promise<InlineFacts>;
export interface ObservationPolicy {
 extraction?:ExtractionPolicy; check?:()=>void; step?:()=>Promise<void>; cloneValue?:(value:unknown)=>Promise<unknown>;
 timings?:{textMs:number;annotationsMs:number};
}
/** State may be borrowed; callers must reject changed revisions at every yield. */
export async function collectFacts(state:RepositoryState,resourceId:string,signal?:AbortSignal,inlineReader?:InlineReader,policy?:ObservationPolicy):Promise<Facts> {
 signal?.throwIfAborted();policy?.check?.();
 const extraction=normalizePolicy(policy?.extraction);
 const root=state.contents[state.placements[state.rootPlacementKey].contentKey];
 const metadata=root.payload.metadata as Record<string,unknown>|undefined;
 const facts:Facts={id:resourceId,rootBlockId:String(root.payload.id),title:metadata?.title==null?'':String(metadata.title),hasTitle:metadata?.title!=null,tags:[],blocks:[],annotations:[],mentions:[],diagnostics:[],referenceDiagnostics:[]};
 const warn=(message:string,reference=true)=>{facts.diagnostics.push(message);if(reference)facts.referenceDiagnostics!.push(message);};
 if(metadata?.tags!==undefined) {
  if(Array.isArray(metadata.tags)){const tags=new Set<string>();let valid=true;for(const tag of metadata.tags){await policy?.step?.();if(typeof tag!=='string'){valid=false;break;}tags.add(tag);}if(valid)facts.tags=[...tags];else facts.diagnostics.push('Unsupported tags payload');}
  else facts.diagnostics.push('Unsupported tags payload');
 }
 const seen=new Set<string>(),queue=[state.rootPlacementKey],annotations=annotationCollector(facts,signal,policy);
 let visits=0;
 while(queue.length) {
  await policy?.step?.();
  if(++visits>10000){warn('Block budget reached');break;}
  if(!policy?.step&&visits%64===0){await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();policy?.check?.();}
  const p=state.placements[queue.pop()!];if(!p){warn('Missing placement');continue;}
  if(p.externalReference||p.resolvedReference){warn('External resource body not expanded');continue;}
  if(p.kind==='reference'){warn('External resource body not expanded');continue;} // inspect canonical owned content once, never occurrence multiplicity
  const c=state.contents[p.contentKey];if(!c||seen.has(c.key))continue;seen.add(c.key);
  const blockId=String(c.payload.id),block:BlockFact={id:blockId,type:c.viewType,ordinal:visits,cellCount:0};facts.blocks.push(block);
  if(opaqueType(c.viewType,extraction)||c.inlineKind!=='standoff'&&!nativeTextTypes.includes(c.viewType)&&typeof c.payload.text==='string'&&!!c.payload.text){warn(`Unsupported hosted content (${c.viewType}) omitted.`);continue;}
  block.cellCount=contentLength(c);
  let inline:InlineFacts|undefined;const textStart=performance.now();
  if(c.inlineKind==='standoff') {
   if(inlineReader){inline=await inlineReader(blockId,signal);block.text=inline.text;block.cellCount=inline.length;}
   else {const {contentKey:_,version:__,...text}=await canonicalSearchSource(state,c.key,0,signal,2000000);block.text=text;}
  }
  else if(nativeTextTypes.includes(c.viewType)) {
   const {contentKey:_,version:__,...text}=await canonicalSearchSource(state,c.key,0,signal,2000000);block.text=text;
  }
  policy?.check?.();if(policy?.timings)policy.timings.textMs+=performance.now()-textStart;const annotationStart=performance.now();
  const nativeCode=c.viewType==='standoff-code-mirror-block',codePoints=nativeCode?[...String(c.payload.text??'')]:[];
  for(const raw of !sourceTextTypes.includes(c.viewType)&&Array.isArray(c.payload.standoffProperties)?c.payload.standoffProperties:[]) {
   await annotations.add({raw,blockId,standoff:c.inlineKind==='standoff'||nativeCode,pointEndSame:nativeCode,length:nativeCode?codePoints.length:inline?.length??contentLength(c),
    resolve:raw=>{const owner=linkedDefinitionOwner(state,raw,c.key);return {property:resolveLinkedProperty(state,raw,c.key),owner:owner?{root:owner.key===root.key,blockId:String(owner.payload.id)}:undefined};},
    snippet:(from,to,context)=>nativeCode?codePoints.slice(from,to).join(''):inline?inline.snippet(from,to):contentSlice(state,c,from,to).map(a=>a.kind==='text'?a.text:'[inline object]').join('')});
  }
  if(policy?.timings)policy.timings.annotationsMs+=performance.now()-annotationStart;
  const relations=Object.keys(c.ownedRelations).sort((a,b)=>a.localeCompare(b));
  for(let i=relations.length-1;i>=0;i--){await policy?.step?.();queue.push(c.ownedRelations[relations[i]]);}
  for(let i=c.children.length-1;i>=0;i--){await policy?.step?.();queue.push(c.children[i]);}
 }
 annotations.finish();facts.diagnostics=[...new Set(facts.diagnostics)];facts.referenceDiagnostics=[...new Set(facts.referenceDiagnostics)];signal?.throwIfAborted();policy?.check?.();return facts;
}
