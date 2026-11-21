/** TEST ONLY. No production importer or repository registers this implementation. */
import {parseNativeEnvelope, decodeNative, type NativeDocument} from '../../src/persistence/native-resource';
import {validateNativeTextSpan} from '../../src/history/stage-c-gates/portable';
import {encodeAuthoredValue, decodeAuthoredValue} from '../../src/history/preplan-spike/wire';
import {externalDefinitionLink, externalAssetLink} from '../../src/block-tree/external-reference';
import {clone} from '../../src/block-tree/clone';
import {freeze} from '../../src/block-tree/commit-capture';
import {mapStandoffPropertiesForReplacement, pointAffinity, clipProperties, replacePoint} from '../../src/interchange/ranges';
import {modeContinuationError, modeJoinError} from '../../src/block-tree/mode-editing';
export type Bag = Record<string, any>;
export type Atom = {kind:'text';text:string}|{kind:'image';properties:Bag};
export type Block = Omit<NativeDocument['document']['blocks'][number], 'properties'|'inline'> & {properties:Bag;inline?:Atom[]};
export type Delta = {id:string;start:number;end:number;insert:Atom[]};
type Change = {id:string;structural:boolean;before:Map<string,Block|undefined>;after:Map<string,Block|undefined>;forward:Delta[];inverse:Delta[]};
export type Notice = {ids:string[];deltas:Delta[];revision:number;history?:'undo'|'redo';changeId?:string;structural?:boolean};
const check=(ok:unknown,why:string):void=>{if(!ok)throw Error('Compact experiment: '+why);};
export const length=(atoms:readonly Atom[])=>atoms.reduce((n,a)=>n+(a.kind==='text'?codepoints(a.text):1),0);
export function codepoints(text:string){let n=0;for(const _ of text)n++;return n;}
export function cpSlice(text:string,start:number,end:number){let n=0,a=text.length,b=text.length,offset=0;for(const ch of text){if(n===start)a=offset;if(n===end){b=offset;break;}offset+=ch.length;n++;}return text.slice(a,b);}
export function slice(atoms:readonly Atom[],start:number,end:number):Atom[]{
 const out:Atom[]=[];let offset=0;
 for(const a of atoms){const size=a.kind==='text'?codepoints(a.text):1,lo=Math.max(0,start-offset),hi=Math.min(size,end-offset);if(lo<hi)out.push(a.kind==='text'?{kind:'text',text:cpSlice(a.text,lo,hi)}:a);offset+=size;if(offset>=end)break;}return out;
}
export function normalize(atoms:readonly Atom[]):Atom[]{const out:Atom[]=[];for(const a of atoms){if(a.kind==='text'&&!a.text)continue;const prior=out.at(-1);if(a.kind==='text'&&prior?.kind==='text')prior.text+=a.text;else out.push(clone(a));}return out;}
export const plain=(atoms:readonly Atom[])=>atoms.map(a=>a.kind==='text'?a.text:'\uFFFC').join('');
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const bag=(value:any,encoded:boolean):Bag=>{const result=encoded?decodeAuthoredValue(value):clone(value);check(result&&typeof result==='object'&&!Array.isArray(result),'invalid authored bag');return result as Bag;};
/** Reuse the complete native structural/ownership validator, with no inline atoms.
 * The only predicates removed with image payloads are explicitly checked below.
 * No text/image ContentRecord or Placement is built, even transiently. */
export function validateCompact(envelope:NativeDocument):void{
 const encoded=!!envelope.valueEncoding;
 const stripped={...envelope,document:{...envelope.document,blocks:envelope.document.blocks.map(b=>({...b,...b.inline===undefined?{}:{inline:[]}}))}};
 const witness=decodeNative(bytes(stripped));
 check(Object.values(witness.contents).every(c=>!['text-cell','image-cell'].includes(c.viewType)),'unexpected Cell construction');
 const root=witness.placements[witness.rootPlacementKey].target;
 check(root.kind==='local','external root');
 const registry=root.kind==='local'?witness.contents[root.contentKey].payload.linkedAnnotations??{}:{};
 for(const b of envelope.document.blocks)for(const atom of b.inline??[]){
  if(atom.kind==='text'){validateNativeTextSpan(atom.text);continue;}
  check(atom.kind==='image','unsupported inline atom');
  const p=bag((atom as any).properties,encoded);
  for(const value of [p,...Array.isArray(p.standoffProperties)?p.standoffProperties:[],...Array.isArray(p.blockProperties)?p.blockProperties:[]]){
   if(!value||typeof value!=='object')continue;
   const link=externalDefinitionLink(value);externalAssetLink(value);
   check(!link||link.source.scope!=='document'||link.source.resourceId!==envelope.resourceId,'owned definition disguised as external');
  }
  for(const prop of Array.isArray(p.standoffProperties)?p.standoffProperties:[]){if(typeof prop.annotationId!=='string'||!prop.annotationId.trim()||externalDefinitionLink(prop))continue;check(Object.hasOwn(registry,prop.annotationId),'image annotation lacks owned definition');}
 }
}
function ordered(v:any):any {return Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,ordered(x)])):v;}
export class CompactDocument {
 private serial=0;
 private beforeListeners=new Set<(n:{ids:string[];changeId:string;history?:'undo'|'redo'})=>void>();
 private pending?:{after:Map<string,Block|undefined>;forward:Delta[];inverse:Delta[];structural:boolean;validate:boolean};
 private blocks=new Map<string,Block>();
 private versions=new Map<string,number>();
 private undoStack:Change[]=[];private redoStack:Change[]=[];
 private listeners=new Set<(n:Notice)=>void>();private byBlock=new Map<string,Set<(n:Notice)=>void>>();private publishing=false;
 revision=0;
 readonly metrics={canonicalCells:0,canonicalCellPlacements:0,fullValidation:0,captures:0,blockReads:0,changedBlocks:0,publications:0,subscriberCalls:0};
 private envelope:NativeDocument;
 constructor(source:Uint8Array,readonly pointPolicy:'equivalent'|'legacy'='equivalent'){
  this.envelope=parseNativeEnvelope(source);validateCompact(this.envelope);this.metrics.fullValidation++;
  for(const b of this.envelope.document.blocks){const x:Block={...b,properties:bag(b.properties,!!this.envelope.valueEncoding)};
   if(b.inline)x.inline=b.inline.map(a=>a.kind==='text'?{...a}:{kind:'image',properties:bag(a.properties,!!this.envelope.valueEncoding)});
   if(b.relations)x.relations={...b.relations,opaque:bag(b.relations.opaque,!!this.envelope.valueEncoding)};
   this.blocks.set(b.id,freeze(x) as Block);this.versions.set(b.id,0);
  }
  // Do not retain a second complete wire authority.
  this.envelope={...this.envelope,document:{...this.envelope.document,blocks:[]}};
 }
 get resourceId(){return this.envelope.resourceId;}
 get(id:string){this.metrics.blockReads++;const b=this.pending?.after.has(id)?this.pending.after.get(id):this.blocks.get(id);check(b,'unknown Block '+id);return b!;}
 has(id:string){return this.blocks.has(id);}
 all(){const all=new Map(this.blocks);if(this.pending)for(const [id,b]of this.pending.after)b?all.set(id,b):all.delete(id);return [...all.values()];}
 subscribeBefore(f:(n:{ids:string[];changeId:string;history?:'undo'|'redo'})=>void){this.beforeListeners.add(f);return()=>{this.beforeListeners.delete(f);};}
 transaction(action:()=>void){check(!this.pending,'nested experimental transaction');const p=this.pending={after:new Map<string,Block|undefined>(),forward:[] as Delta[],inverse:[] as Delta[],structural:false,validate:false};try{action();this.pending=undefined;if(p.after.size)this.commit(p.after,p.forward,p.inverse,p.structural,p.validate);}finally{this.pending=undefined;}}
 version(id:string){return this.versions.get(id)??-1;}
 subscribe(f:(n:Notice)=>void,id?:string){const set=id?(this.byBlock.get(id)??new Set<(n:Notice)=>void>()):this.listeners;if(id)this.byBlock.set(id,set);set.add(f);return()=>{set.delete(f);if(id&&!set.size)this.byBlock.delete(id);};}
 private wire(changes?:Map<string,Block|undefined>):NativeDocument{
  const current=new Map(this.blocks);if(this.pending)for(const [id,b]of this.pending.after)b?current.set(id,b):current.delete(id);if(changes)for(const [id,b]of changes)b?current.set(id,b):current.delete(id);
  const blocks=[...current.values()].map(b=>{
   const p=clone(b.properties),atoms=normalize(b.inline??[]);
   if(b.inline&&Array.isArray(p.standoffProperties))for(const prop of p.standoffProperties){
    if(!prop||typeof prop!=='object'||typeof prop.text!=='string'||prop.isDeleted)continue;
    const {start,end}=prop,n=length(atoms);if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>=n)continue;
    if(prop.isZeroWidth===true&&end===start-1&&start<=n)prop.text='';
    else if(end>=start&&!prop.isZeroWidth)prop.text=plain(slice(atoms,start,end+1));
   }
   return {...b,properties:encodeAuthoredValue(p) as Bag,...b.relations?{relations:{...b.relations,opaque:encodeAuthoredValue(b.relations.opaque) as Bag}}:{},...b.inline?{inline:atoms.map(a=>a.kind==='text'?a:{kind:'image' as const,properties:encodeAuthoredValue(a.properties) as Bag})}:{}};
  });
  return {...this.envelope,definitionOwnerBlockIds:[...this.envelope.definitionOwnerBlockIds].sort(),valueEncoding:'codex-authored-value-v1',document:{...this.envelope.document,blocks}};
 }
 capture(){this.metrics.captures++;const wire=this.wire();validateCompact(wire);this.metrics.fullValidation++;wire.document.blocks.sort((a,b)=>a.id.localeCompare(b.id));return JSON.stringify(ordered(wire),null,2)+'\n';}
 private commit(after:Map<string,Block|undefined>,forward:Delta[]=[],inverse:Delta[]=[],structural=false,validate=structural){
  check(!this.publishing,'reentrant mutation');
  if(this.pending){for(const [id,b]of after)this.pending.after.set(id,b);this.pending.forward.push(...forward);this.pending.inverse.unshift(...inverse);this.pending.structural ||= structural;this.pending.validate ||= validate;return;}
  if(validate){validateCompact(this.wire(after));this.metrics.fullValidation++;}
  const before=new Map<string,Block|undefined>();for(const id of after.keys())before.set(id,this.blocks.get(id));
  for(const [id,b]of after)if(b)after.set(id,freeze(clone(b)) as Block);
  const c={id:'compact-change:'+ ++this.serial,structural,before,after,forward,inverse};for(const f of this.beforeListeners)f({ids:[...after.keys()],changeId:c.id});this.undoStack.push(c);this.redoStack=[];this.publish(after,forward,undefined,c);
 }
 private publish(changes:Map<string,Block|undefined>,deltas:Delta[],history?:'undo'|'redo',change?:Change){
  for(const [id,b]of changes){b?this.blocks.set(id,b):this.blocks.delete(id);this.versions.set(id,this.version(id)+1);}
  this.revision++;this.metrics.changedBlocks+=changes.size;this.metrics.publications++;this.publishing=true;
  try{const notice={ids:[...changes.keys()],deltas,revision:this.revision,history,changeId:change?.id,structural:change?.structural};for(const id of notice.ids)for(const f of this.byBlock.get(id)??[]){this.metrics.subscriberCalls++;f(notice);}for(const f of this.listeners){this.metrics.subscriberCalls++;f(notice);}}finally{this.publishing=false;}
 }
 private mapProperties(properties:unknown[],start:number,end:number,inserted:number,n:number){
  if(this.pointPolicy==='legacy')return mapStandoffPropertiesForReplacement(properties,start,end,inserted,[],n);
  return properties.flatMap((p:any)=>{
   if(p?.isZeroWidth===true&&Number.isInteger(p.start)&&Number.isInteger(p.end)&&(p.end===p.start||p.end===p.start-1)){
    const point=replacePoint(p,start,end,inserted,n);return point?[{...point,end:Number(point.start)+(p.end-p.start)}]:[];
   }
   return mapStandoffPropertiesForReplacement([p],start,end,inserted,[],n);
  });
 }
 private clip(properties:unknown,start:number,end:number,n:number,offset:number){
  if(this.pointPolicy==='legacy')return clipProperties(properties,start,end,n,offset);
  return (Array.isArray(properties)?properties:[]).flatMap((p:any)=>clipProperties([p],start,end,n,offset).map(q=>p.isZeroWidth&&p.end===p.start-1?{...q,end:Number(q.start)-1}:q));
 }
 replace(id:string,start:number,end:number,insert:Atom[],expected=this.version(id)){
  check(expected===this.version(id),'stale text range');const b=this.get(id);check(b.inline,'not standoff');const n=length(b.inline!);
  check(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>=start&&end<=n,'invalid range');
  // Text input is proven locally. Object insertion needs the full native payload proof.
  for(const a of insert){check(a.kind==='text'||a.kind==='image','invalid atom');if(a.kind==='text')validateNativeTextSpan(a.text);}
  const inserted=length(insert),removed=slice(b.inline!,start,end),p={...b.properties};
  if(Array.isArray(p.standoffProperties))p.standoffProperties=this.mapProperties(p.standoffProperties,start,end,inserted,n);
  this.commit(new Map([[id,{...b,properties:p,inline:normalize([...slice(b.inline!,0,start),...insert,...slice(b.inline!,end,n)])}]]),
   [{id,start,end,insert:clone(insert)}],[{id,start,end:start+inserted,insert:removed}],false,insert.some(a=>a.kind==='image'));
 }
 annotations(id:string,properties:unknown[]){const b=this.get(id);this.commit(new Map([[id,{...b,properties:{...b.properties,standoffProperties:clone(properties)}}]]),[],[],false,true);}
 undo(){const c=this.undoStack.pop();if(!c)return false;for(const f of this.beforeListeners)f({ids:[...c.before.keys()],changeId:c.id,history:'undo'});this.redoStack.push(c);this.publish(c.before,c.inverse,'undo',c);return true;}
 redo(){const c=this.redoStack.pop();if(!c)return false;for(const f of this.beforeListeners)f({ids:[...c.after.keys()],changeId:c.id,history:'redo'});this.undoStack.push(c);this.publish(c.after,c.forward,'redo',c);return true;}
 private location(id:string,placementId?:string){const hits=this.all().flatMap(b=>(b.children??[]).flatMap((e,index)=>e.target.kind==='local'&&e.target.blockId===id&&(placementId?e.placementId===placementId:e.kind==='owned')?[{parent:b,index}]:[]));check(hits.length===1,'requires one owned child occurrence');return hits[0];}
 split(id:string,index:number,placementId?:string){
  const b=this.get(id),n=length(b.inline??[]),error=modeContinuationError(b.properties);check(!error,error??'');check(b.inline&&Number.isInteger(index)&&index>0&&index<n,'boundary split unsupported');
  const {parent,index:at}=this.location(id,placementId),rightId=crypto.randomUUID(),left:Bag[]=[],right:Bag[]=[];
  for(const a of b.properties.standoffProperties??[]){const start=Number(a.start),end=Number(a.end);
   if(!Number.isFinite(start)||!Number.isFinite(end))left.push(clone(a));
   else if(a.isZeroWidth===true){const affinity=pointAffinity(a,n);if(start<index||start===index&&affinity==='before')left.push({...a,affinity});else right.push({...a,start:start-index,end:start-index+(this.pointPolicy==='equivalent'&&a.end===a.start-1?-1:0),affinity});}
   else if(end<index)left.push(clone(a));else if(start>=index)right.push({...a,start:start-index,end:end-index});
   else{left.push({...a,end:index-1});right.push({...a,id:typeof a.id==='string'?crypto.randomUUID():a.id,start:0,end:end-index});}
  }
  const children=[...parent.children!];children.splice(at+1,0,{placementId:crypto.randomUUID(),kind:'owned',target:{kind:'local',blockId:rightId}});
  const rightBlock:Block={id:rightId,type:b.type,properties:{...b.properties,standoffProperties:right},children:[],inline:slice(b.inline!,index,n)};
  this.commit(new Map([[id,{...b,properties:{...b.properties,standoffProperties:left},inline:slice(b.inline!,0,index)}],[rightId,rightBlock],[parent.id,{...parent,children}]]),[{id,start:index,end:n,insert:[]}],[{id,start:index,end:index,insert:slice(b.inline!,index,n)}],true);return rightId;
 }
 insertEmpty(id:string,where:'before'|'after',placementId?:string){
  const b=this.get(id),error=modeContinuationError(b.properties);check(!error,error??'');const {parent,index}=this.location(id,placementId),created=crypto.randomUUID();
  const children=[...parent.children!];children.splice(index+(where==='after'?1:0),0,{placementId:crypto.randomUUID(),kind:'owned',target:{kind:'local',blockId:created}});
  this.commit(new Map([[created,{id:created,type:b.type,properties:{...b.properties,standoffProperties:[]},children:[],inline:[]}],[parent.id,{...parent,children}]]),[],[],true);return created;
 }
 removeEmpty(id:string,placementId?:string){
  const b=this.get(id);check(b.inline?.length===0&&!b.children?.length&&!Object.keys(b.relations?.owned??{}).length,'only empty unattached text removal qualified');
  const {parent,index}=this.location(id,placementId),children=parent.children!.filter((_,i)=>i!==index);
  const edges=this.all().flatMap(b=>[...b.children??[],...Object.values(b.relations?.owned??{})]);check(edges.filter(e=>e.target.kind==='local'&&e.target.blockId===id).length===1,'shared empty removal needs retention policy');
  this.commit(new Map<string,Block|undefined>([[id,undefined],[parent.id,{...parent,children}]]),[],[],true);
 }
 /** Restricted to two adjacent ordinary siblings, matching the production join guards. */
 join(leftId:string,rightId:string,selection?:{start:number;end:number;text:string},leftPlacement?:string,rightPlacement?:string){
  const l=this.get(leftId),r=this.get(rightId),a=this.location(leftId,leftPlacement),b=this.location(rightId,rightPlacement),error=modeJoinError(l.properties,r.properties);
  check(!error,error??'');check(l.inline&&r.inline&&a.parent.id===b.parent.id&&a.index+1===b.index,'adjacent standoff siblings required');
  check(!r.children?.length&&!Object.keys(r.relations?.owned??{}).length,'right attachments');
  const edges=this.all().flatMap(x=>[...x.children??[],...Object.values(x.relations?.owned??{})]);check(edges.filter(e=>e.target.kind==='local'&&e.target.blockId===rightId).length===1,'shared right content');
  if(selection){check(edges.filter(e=>e.target.kind==='local'&&e.target.blockId===leftId).length===1,'shared cross-Block content');check(!Object.keys(r.relations?.opaque??{}).length,'right opaque attachments');check(!/[\r\n]/.test(selection.text),'multiline cross-Block insertion not qualified');}
  const ln=length(l.inline!),rn=length(r.inline!);const start=selection?.start??ln,end=selection?.end??0,text=selection?.text??'';
  check(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&start<=ln&&end>=0&&end<=rn,'invalid cross Block range');
  const ins:Atom[]=text?[{kind:'text',text}]:[],kept=slice(r.inline!,end,rn),offset=start+length(ins);
  const lp=selection?this.clip(l.properties.standoffProperties,0,start,ln,0):clone(l.properties.standoffProperties??[]);
  const rp=selection?this.clip(r.properties.standoffProperties,end,rn,rn,-end):clone(r.properties.standoffProperties??[]);
  const shifted=rp.map((p:any)=>({...p,...typeof p.start==='number'?{start:p.start+offset}:{},...typeof p.end==='number'?{end:p.end+offset}:{}}));
  if(selection){const ids=new Set<string>();for(const p of [...lp,...shifted] as Bag[])if(typeof p.id==='string'){if(ids.has(p.id))p.id=crypto.randomUUID();ids.add(p.id);}}
  this.commit(new Map<string,Block|undefined>([[leftId,{...l,inline:normalize([...slice(l.inline!,0,start),...ins,...kept]),properties:{...l.properties,standoffProperties:[...lp,...shifted]}}],[rightId,undefined],[a.parent.id,{...a.parent,children:a.parent.children!.filter((_,i)=>i!==b.index)}]]),
   [{id:leftId,start,end:ln,insert:[...ins,...kept]}],[{id:leftId,start,end:offset+length(kept),insert:slice(l.inline!,start,ln)}],true);
 }
}
/** Deliberately small collision index, not the production Object Bank admission API. */
export class CompactWorkspace {
 readonly resources=new Map<string,CompactDocument>();private ids=new Set<string>();
 admit(bytes:Uint8Array){const d=new CompactDocument(bytes);check(!this.resources.has(d.resourceId),'resource collision');for(const b of d.all())check(!this.ids.has(b.id),'Block identity collision');for(const b of d.all())this.ids.add(b.id);this.resources.set(d.resourceId,d);return d;}
}
