/** Shared annotation eligibility/grouping only; no repository, SQL or navigation authority. */
import type {Facts,Mention,AnnotationFact} from './facts';
import type {ObservationPolicy} from './collect-facts';
export function annotationCollector(facts:Facts,signal?:AbortSignal,policy?:ObservationPolicy){
 const resourceId=facts.id,groups=new Map<string,Mention>(),bad=new Set<string>(),localIds=new Set<string>();let properties=0;
 const warn=(message:string,reference=true)=>{facts.diagnostics.push(message);if(reference)facts.referenceDiagnostics!.push(message);};
 return {
 async add({raw,blockId,standoff,length,resolve,snippet,pointEndSame=false}:{raw:any;blockId:string;standoff:boolean;pointEndSame?:boolean;length:number;resolve:(raw:any)=>{property:any;owner?:{root:boolean;blockId:string}};snippet:(start:number,end:number,context:boolean)=>string|Promise<string>}){
   await policy?.step?.();
   if(++properties>10000)throw Error('Annotation budget exceeded');
   if(policy&&!policy.step&&properties%128===0){await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();policy.check?.();}
   if(!raw||typeof raw!=='object'){warn('Malformed annotation');return;}
   let owner,a;try{const resolved=resolve(raw);owner=resolved.owner;a=resolved.property;}catch{warn('Ambiguous linked definition');return;}
   if(a.isDeleted||a.clientOnly)return;
   const documentIssue=!a.type||a.type==='codex/block-reference';
   if(raw.annotationId&&(!owner||!owner.root)){warn('Foreign/unresolved linked definition',documentIssue);return;}
   const zeroWidth=raw.isZeroWidth===true;
   if(pointEndSame&&zeroWidth){warn('Point annotation retained but omitted from range-only Facts',documentIssue);return;}
   if(!standoff||typeof raw.id!=='string'||!raw.id||typeof a.type!=='string'||!a.type||typeof a.start!=='number'||typeof a.end!=='number'||!Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start<0||(zeroWidth?(a.end!==a.start-1&&(!pointEndSame||a.end!==a.start))||a.start>length:a.end<a.start||a.end>=length)){warn('Unsupported annotation identity/range',documentIssue);return;}
   const segmentId=JSON.stringify([resourceId,blockId,raw.id]);
   const logicalId=JSON.stringify([resourceId,raw.annotationId?'linked':blockId,raw.annotationId??raw.id]);
   if(localIds.has(segmentId)){bad.add(logicalId);groups.delete(logicalId);warn('Duplicate segment identity',documentIssue);return;}localIds.add(segmentId);
   const definition=raw.annotationId?{resourceId:resourceId,blockId:owner!.blockId,annotationId:String(raw.annotationId)}:undefined;
   const annotation:AnnotationFact={id:segmentId,logicalId,blockId,type:a.type,start:a.start,end:zeroWidth&&pointEndSame?a.start:a.end+1,value:policy?.cloneValue?await policy.cloneValue(a.value):structuredClone(a.value),definition};
   facts.annotations.push(annotation);
   if(!['codex/block-reference','codex/entity-reference'].includes(a.type))return;
   if(typeof a.value!=='string'||!a.value){warn('Unsupported reference value',documentIssue);return;}
   const kind=a.type==='codex/block-reference'?'document':'entity',docId=(a.metadata as any)?.documentId;
   if(kind==='document'&&docId!==undefined&&typeof docId!=='string'){warn('Unsupported target resource identity');return;}
   if(bad.has(logicalId))return;
   let mention=groups.get(logicalId);
   if(mention&&(mention.kind!==kind||mention.targetId!==a.value||mention.targetResourceId!==(kind==='document'?docId:undefined))){groups.delete(logicalId);bad.add(logicalId);warn('Conflicting linked mention');return;}
   if(kind==='document'){const from=Math.max(0,a.start-20),to=Math.min(length,a.end+1+35,a.start+120);annotation.contextCells=to-from;annotation.context=await snippet(from,to,true);}
   const text=await snippet(a.start,a.end+1,false);
   if(!mention){mention={id:logicalId,kind,targetId:a.value,targetResourceId:kind==='document'?docId:undefined,ranges:[],text:'',annotationIds:[],definition};groups.set(logicalId,mention);}
   mention.ranges.push({blockId,start:a.start,end:a.end+1});mention.annotationIds.push(segmentId);mention.text+=(mention.text?'\n':'')+text;

 },
 finish(){facts.annotations=facts.annotations.filter(a=>!bad.has(a.logicalId));facts.mentions=[...groups.values()];}
 };
}
