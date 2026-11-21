import {createRoot,createSignal,type Accessor} from 'solid-js';

export type InteractionState='idle'|'busy'|'ready'|'error';
export interface DataKey<T>{readonly id:string;readonly parse:(value:unknown)=>T;/** Invariant compile-time identity. */readonly type?:(value:T)=>T}
export const dataKey=<T>(id:string,parse:(value:unknown)=>T):DataKey<T>=>Object.freeze({id,parse});
export type Bindings<T>={[K in keyof T]-?:DataKey<Exclude<T[K],undefined>>};
export interface PipeAction {id:string;label:string;enabled:boolean;primary?:boolean}
export interface PipeResult<O>{outcome?:string;values?:Partial<O>}
export interface PipeController<I,O>{
 status:Accessor<InteractionState>;actions:Accessor<readonly PipeAction[]>;error?:Accessor<string>;
 update(input:Readonly<I>):void;
 execute(action:string,signal:AbortSignal):PipeResult<O>|Promise<PipeResult<O>>;
 /** Prevent leaving a commit with an unresolved outcome. */
 guard?():string|undefined;
 dispose?():void;
}
export interface PipeDefinition<I,O,C extends PipeController<I,O>>{
 id:string;title:string;optional?:readonly (keyof I)[];
 create(input:Readonly<I>,context:{changed():void}):C;
}
export interface Connector{from:string;outcome:string;to:string;default?:boolean}
// Type erasure is confined to the registry. Callers bind through occurrence().
export interface PipeOccurrence {id:string;label:string;width?:number;pipe:PipeDefinition<any,any,any>;requires:Record<string,DataKey<any>>;produces:Record<string,DataKey<any>>}
export function occurrence<I,O,C extends PipeController<I,O>>(pipe:PipeDefinition<I,O,C>,options:{id:string;label:string;width?:number;requires:Bindings<I>;produces:Bindings<O>}):PipeOccurrence{return {...options,pipe};}
export interface PipelineDefinition{readonly id:string;readonly version:number;readonly title:string;readonly start:string;readonly pipes:readonly PipeOccurrence[];readonly connectors:readonly Connector[]}
interface Entry{value:unknown;version:number;producer:string;dependencies:Readonly<Record<string,number>>}
interface Slot{spec:PipeOccurrence;controller?:PipeController<any,any>;dispose?:()=>void;generation:number;abort?:AbortController;outcome?:string;complete:boolean;stale:boolean;error:string;busy:boolean}
function snapshot<T>(value:T):T{
 const text=JSON.stringify(value);if(text===undefined||text.length>256*1024)throw Error('Pipeline value exceeds the data budget');
 const copy=JSON.parse(text);const freeze=(v:any):any=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};return freeze(copy);
}
/** Session-only orchestration. No editor, windows, persistence or implicit execution. */
export class PipelineRun{
 readonly id=crypto.randomUUID();readonly definition:PipelineDefinition;
 private keys=new Map<string,DataKey<any>>();private entries=new Map<string,Entry>();private producers=new Map<string,string>();private slots=new Map<string,Slot>();private version=0;private ended=false;
 private tick=createSignal(0);private activeState=createSignal('');private finalState=createSignal<'running'|'completed'|'cancelled'>('running');
 readonly active=this.activeState[0];readonly state=this.finalState[0];
 constructor(definition:PipelineDefinition,initial:readonly {key:DataKey<any>;value:unknown}[]){
  this.definition=Object.freeze({...definition,pipes:Object.freeze(definition.pipes.map(p=>Object.freeze({...p,pipe:Object.freeze({...p.pipe,optional:p.pipe.optional?Object.freeze([...p.pipe.optional]):undefined}),requires:Object.freeze({...p.requires}),produces:Object.freeze({...p.produces})}))),connectors:Object.freeze(definition.connectors.map(c=>Object.freeze({...c})))});
  if(!definition.id||!Number.isSafeInteger(definition.version)||definition.version<1||!definition.pipes.length||definition.pipes.length>32)throw Error('Invalid Pipeline definition');
  const register=(key:DataKey<any>)=>{if(!key.id||this.keys.has(key.id)&&this.keys.get(key.id)!==key)throw Error('Conflicting Pipeline data key');this.keys.set(key.id,key);};
  for(const spec of this.definition.pipes){if(this.slots.has(spec.id))throw Error('Duplicate Pipe occurrence');this.slots.set(spec.id,{spec,generation:0,complete:false,stale:false,error:'',busy:false});for(const key of Object.values(spec.requires))register(key);for(const key of Object.values(spec.produces)){register(key);if(this.producers.has(key.id))throw Error('Competing Pipeline output producers');this.producers.set(key.id,spec.id);}}
  if(!this.slots.has(definition.start))throw Error('Pipeline start missing');
  const routes=new Set<string>();for(const c of this.definition.connectors){const key=c.from+':'+c.outcome;if(!this.slots.has(c.from)||!this.slots.has(c.to)||routes.has(key))throw Error('Invalid or ambiguous Connector');routes.add(key);}
  for(const p of this.slots.keys())if(this.definition.connectors.filter(c=>c.from===p&&c.default).length>1)throw Error('Ambiguous default route');
  const visit=(id:string,path:Set<string>)=>{if(path.has(id))throw Error('Pipeline execution cycles are unsupported');for(const c of this.definition.connectors.filter(c=>c.from===id))visit(c.to,new Set([...path,id]));};visit(definition.start,new Set());
  for(const {key,value} of initial){register(key);if(this.entries.has(key.id)||this.producers.has(key.id))throw Error('Duplicate or producer-owned initial data');this.producers.set(key.id,'input');this.entries.set(key.id,{value:snapshot(key.parse(value)),version:++this.version,producer:'input',dependencies:{}});}
  for(const key of this.keys.keys())if(!this.producers.has(key))this.producers.set(key,'input');
  this.activeState[1](definition.start);this.ensure(definition.start);
 }
 private changed(){this.tick[1](n=>n+1);}
 private inputs(slot:Slot){const value:Record<string,unknown>={};for(const [name,key]of Object.entries(slot.spec.requires)){const entry=this.entries.get(key.id);if(!entry&&!slot.spec.pipe.optional?.includes(name))throw Error(`Missing required value: ${key.id}`);value[name]=entry?.value;}return Object.freeze(value);}
 private ensure(id:string){const slot=this.slots.get(id)!;if(slot.controller)return;const inputs=this.inputs(slot);createRoot(dispose=>{slot.dispose=dispose;try{slot.controller=slot.spec.pipe.create(inputs,{changed:()=>this.invalidate(id)});}catch(e){dispose();throw e;}});}
 controller<C>(id:string):C|undefined{this.tick[0]();return this.slots.get(id)?.controller as C|undefined;}
 info(id:string){this.tick[0]();const s=this.slots.get(id)!;return {executing:s.busy,status:s.busy?'busy' as const:s.error?'error' as const:s.controller?.status()??'idle',error:s.error||s.controller?.error?.()||'',complete:s.complete,stale:s.stale,mounted:!!s.controller};}
 actions(id=this.active()){this.tick[0]();const slot=this.slots.get(id);return slot?.stale?[]:slot?.controller?.actions()??[];}
 value<T>(key:DataKey<T>):Readonly<T>|undefined{this.tick[0]();if(this.keys.get(key.id)!==key)throw Error('Foreign data key');return this.entries.get(key.id)?.value as T|undefined;}
 provenance(key:DataKey<any>){this.tick[0]();const e=this.entries.get(key.id);return e?{version:e.version,producer:e.producer,dependencies:e.dependencies}:undefined;}
 path(){this.tick[0]();const path:PipeOccurrence[]=[];let id:string|undefined=this.definition.start;while(id){const slot:Slot=this.slots.get(id)!;path.push(slot.spec);const edges=this.definition.connectors.filter(c=>c.from===id);id=(slot.outcome?edges.find(c=>c.outcome===slot.outcome):edges.find(c=>c.default)??edges[0])?.to;}return path;}
 guard(){this.tick[0]();for(const s of this.slots.values()){if(s.busy)return 'Wait for the current action to finish.';const reason=s.controller?.guard?.();if(reason)return reason;}}
 private revoke(ids:Set<string>){
  // Invalidate both data consumers and control-flow descendants, even if they
  // consumed no output. Optional absent inputs are included by key identity.
  let grew=true;while(grew){grew=false;const keys=new Set([...ids].flatMap(id=>Object.values(this.slots.get(id)!.spec.produces).map(k=>k.id)));for(const s of this.slots.values())if(!ids.has(s.spec.id)&&(Object.values(s.spec.requires).some(k=>keys.has(k.id))||this.definition.connectors.some(c=>ids.has(c.from)&&c.to===s.spec.id))){ids.add(s.spec.id);grew=true;}}
  for(const id of ids){const s=this.slots.get(id)!;s.generation++;s.abort?.abort();s.abort=undefined;s.busy=false;s.stale=!!s.controller;s.complete=false;s.outcome=undefined;s.error='';for(const key of Object.values(s.spec.produces))this.entries.delete(key.id);}
  this.changed();
 }
 private assertInputsMutable(){for(const slot of this.slots.values()){const reason=slot.controller?.guard?.();if(reason)throw Error(reason);}}
 invalidate(id:string){if(this.ended)return;this.assertInputsMutable();this.revoke(new Set([id]));this.slots.get(id)!.stale=false;this.changed();}
 setInput<T>(key:DataKey<T>,value:T){if(this.ended)throw Error('Pipeline ended');this.assertInputsMutable();if(this.producers.get(key.id)!=='input'||this.keys.get(key.id)!==key)throw Error('Input is not owned by the caller');const copy=snapshot(key.parse(value));if(JSON.stringify(this.entries.get(key.id)?.value)===JSON.stringify(copy))return;
  this.entries.set(key.id,{value:copy,version:++this.version,producer:'input',dependencies:{}});this.revoke(new Set([...this.slots.values()].filter(s=>Object.values(s.spec.requires).some(k=>k.id===key.id)).map(s=>s.spec.id)));this.changed();
 }
 navigate(id:string){if(this.ended)return false;const reason=this.guard();if(reason)return false;const slot=this.slots.get(id);if(!slot||!this.path().some(p=>p.id===id))return false;
  try{const input=this.inputs(slot);this.ensure(id);slot.controller!.update(input);slot.stale=false;slot.error='';this.activeState[1](id);this.changed();return true;}catch(e){slot.error=String(e);this.changed();return false;}
 }
 async execute(action:string){
  if(this.ended||this.info(this.active()).status==='busy'||this.info(this.active()).stale)return;
  const slot=this.slots.get(this.active())!,controller=slot.controller!;
  if(!controller.actions().some(a=>a.id===action&&a.enabled))return;
  const input=this.inputs(slot),dependencies=Object.fromEntries(Object.values(slot.spec.requires).map(k=>[k.id,this.entries.get(k.id)?.version??0]));
  const abort=new AbortController(),generation=++slot.generation;slot.abort=abort;slot.busy=true;slot.error='';this.changed();
  try{
   const result=await controller.execute(action,abort.signal);if(this.ended||abort.signal.aborted||slot.generation!==generation)return;
   if(result.outcome===undefined)return;
   for(const [key,version]of Object.entries(dependencies))if((this.entries.get(key)?.version??0)!==version)throw Error('Pipe inputs changed');
   // Validate every output before withdrawing or publishing anything.
   const values=Object.entries(result.values??{}).map(([name,value])=>{const key=slot.spec.produces[name];if(!key)throw Error('Undeclared Pipe output');return {key,value:snapshot(key.parse(value))};});
   const routes=this.definition.connectors.filter(c=>c.from===slot.spec.id),next=routes.find(c=>c.outcome===result.outcome);
   if(routes.length&&!next)throw Error('Undeclared Pipe outcome');
   slot.abort=undefined;this.revoke(new Set([slot.spec.id]));for(const {key,value}of values)this.entries.set(key.id,{value,version:++this.version,producer:slot.spec.id,dependencies:Object.freeze(dependencies)});
   slot.outcome=result.outcome;slot.complete=true;slot.stale=false;slot.busy=false;slot.abort=undefined;this.changed();
   if(next){if(!this.navigate(next.to)){slot.error='Next Pipe is unavailable';this.changed();}}else{this.finalState[1]('completed');this.ended=true;}
  }catch(e){if(!this.ended&&!abort.signal.aborted&&slot.generation===generation){slot.error=e instanceof Error?e.message:String(e);}}
  finally{if(slot.abort===abort){slot.abort=undefined;slot.busy=false;}this.changed();}
 }
 cancel(){if(this.guard())return false;this.ended=true;this.finalState[1]('cancelled');for(const s of this.slots.values())s.abort?.abort();this.changed();return true;}
 dispose(){this.ended=true;for(const s of this.slots.values()){s.abort?.abort();s.controller?.dispose?.();s.dispose?.();}this.entries.clear();}
}
