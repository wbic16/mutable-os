import {createSignal} from 'solid-js';
import type {CanonicalRepository} from './repository';
import type {ContentRecord,RepositoryOperation,RepositoryState} from './types';

type Rule=(record:ContentRecord)=>boolean;
const equal=(a:unknown,b:unknown)=>a===b||JSON.stringify(a)===JSON.stringify(b);
/** Canonical base-content protection; annotations remain ordinary native edits.
 * Applications contribute root predicates, never mutation implementations. */
export class NativeTextProtection {
 private transientInputs=new WeakSet<Element>();
 /** Host-owned form fields inside protected Blocks are local UI. Canonical
  * protection still applies to every attempted Document mutation. */
 allowTransientInput(element:Element){this.transientInputs.add(element);return()=>this.transientInputs.delete(element);}
 isTransientInput(target:EventTarget|null){return target instanceof Element&&this.transientInputs.has(target);}
 private receiving=new Set<string>();
 /** Host-scoped append/finalisation of a receiving contribution. Existing
  * submitted contributions never qualify for this temporary authoring scope. */
 receivingInsertion<T>(key:string,operation:()=>T):T{
  if((this.repository.readState().contents[key]?.payload.metadata as any)?.dialectic?.state!=='receiving')throw Error('Contribution is not receiving');
  this.receiving.add(key);try{return operation();}finally{this.receiving.delete(key);if(this.roots.has(key))this.extend(key);}
 }
 private rules=new Set<Rule>();private roots=new Map<string,Set<string>>();private protected=new Map<string,Set<string>>();
 private version=createSignal(0);private stops:(()=>void)[];
 readonly diagnostics={admissions:0,checked:0,indexed:0};
 constructor(private repository:CanonicalRepository){
  this.stops=[repository.beforeCommit((ops,state,meta)=>this.check(ops,state,meta.cause?.kind==='undo'||meta.cause?.kind==='redo')),
   repository.subscribeChanges(change=>{
    if(!this.rules.size)return;let changed=false;
    for(const key of change.previousContents.keys()){
     const record=repository.readState().contents[key],was=this.roots.has(key),now=!!record&&this.matches(record);
     if(was&&!now){this.remove(key);changed=true;}else if(!was&&now){this.add(key);changed=true;}
    }
    if(changed)this.version[1](n=>n+1);
   })];
 }
 private matches(record:ContentRecord){for(const rule of this.rules)if(rule(record))return true;return false;}
 register(rule:Rule){
  this.rules.add(rule);
  // Activation/admission only, never typing. Existing canonical content is reused.
  for(const record of Object.values(this.repository.readState().contents))if(!this.roots.has(record.key)&&rule(record))this.add(record.key);
  this.version[1](n=>n+1);
  return()=>{this.rules.delete(rule);for(const key of this.roots.keys()){const r=this.repository.readState().contents[key];if(!r||!this.matches(r))this.remove(key);}this.version[1](n=>n+1);};
 }
 protect(key:string){return this.register(record=>record.key===key);}
 private add(root:string){
  this.roots.set(root,new Set());this.extend(root);
 }
 private extend(root:string){
  const state=this.repository.readState(),members=this.roots.get(root)!;
  const visit=(key:string)=>{if(members.has(key))return;const r=state.contents[key];if(!r)return;members.add(key);this.diagnostics.indexed++;
   let owners=this.protected.get(key);if(!owners)this.protected.set(key,owners=new Set());owners.add(root);
   for(const p of [...r.children,...Object.values(r.ownedRelations)]){const placement=state.placements[p];if(placement&&!placement.externalReference)visit(placement.contentKey);}
  };const r=state.contents[root];if(!members.has(root))visit(root);else if(r)for(const p of [...r.children,...Object.values(r.ownedRelations)]){const c=state.placements[p];if(c&&!c.externalReference)visit(c.contentKey);}
  this.version[1](n=>n+1);
 }
 private remove(root:string){for(const key of this.roots.get(root)??[]){const owners=this.protected.get(key)!;owners.delete(root);if(!owners.size)this.protected.delete(key);}this.roots.delete(root);}
 isProtected(key:string){this.version[0]();return this.protected.has(key);}
 private check(operations:readonly RepositoryOperation[],state:RepositoryState,history:boolean){
  if(!this.roots.size)return;this.diagnostics.admissions++;
  const contents=new Map<string,ContentRecord|null>(),placements=new Map<string,any>();
  for(const op of operations){
   if(op.kind==='record-batch'){for(const [k,v]of Object.entries(op.contents))contents.set(k,v);for(const [k,v]of Object.entries(op.placements))placements.set(k,v);}
   else if(op.kind==='put-content')contents.set(op.record.key,op.record);else if(op.kind==='remove-content')contents.set(op.key,null);
   else if(op.kind==='put-placement')placements.set(op.record.key,op.record);else if(op.kind==='remove-placement')placements.set(op.key,null);
  }
  // Undo Submit / whole AI commitment may release its own root. Other protected
  // roots remain enforced; history is not a blanket bypass.
  const released=new Set<string>();
  if(history)for(const [key,r]of contents)if(this.roots.has(key)&&(!r||!this.matches(r)))released.add(key);
  const protectedKey=(key:string)=>[...(this.protected.get(key)??[])].some(root=>!released.has(root)&&!this.receiving.has(root));
  const fail=()=>{throw Error('Base content is protected; annotations remain available.');};
  for(const [key,next]of contents){
   const old=state.contents[key];if(!old)continue;this.diagnostics.checked++;
   let protectedContent=protectedKey(key);
   if(!protectedContent)for(const pk of this.repository.ownedPlacementKeys(key)){const at=this.repository.locationOf(pk);if(at?.slot.kind==='inline-content'&&protectedKey(at.ownerContentKey)){protectedContent=true;break;}}
   if(protectedContent){
    if(!next)fail();
    const r=next!;
    if(this.roots.has(key)&&!this.matches(r))fail();
    const base=(c:ContentRecord)=>{
     const {standoffProperties,linkedAnnotations,...payload}=c.payload;
     // Host-observed contribution notices are provenance, like annotations;
     // updating them does not grant permission to rewrite authored content.
     if(this.roots.has(c.key)&&(payload.metadata as any)?.dialectic?.kind==='contribution'){
      const metadata=payload.metadata as any,{notices,semanticRefreshes,...dialectic}=metadata.dialectic;
      payload.metadata={...metadata,dialectic};
     }
     // Selected tabs and media load status are presentation, not authored text.
     if(c.viewType==='tab-block'&&payload.metadata){const {active,...m}=payload.metadata as any;payload.metadata=m;}
     if(c.viewType==='image-cell'){const {status,...p}=payload;return {...c,payload:p,revision:0};}
     if(c.compactInline)return {...c,payload,revision:0,inlineRevision:0,compactInline:{...c.compactInline,spans:c.compactInline.spans.map(atom=>{
      if(atom.kind!=='image')return atom;
      const {status,...properties}=atom.properties;return {...atom,properties};
     })}};
     return {...c,payload,revision:0};
    };
    if(!equal(base(old),base(r)))fail();
   }
   // Removing a protected child via an unprotected parent is also a mutation.
   if(next){for(const pk of [...old.children,...Object.values(old.ownedRelations)])if(!next.children.includes(pk)&&!Object.values(next.ownedRelations).includes(pk)&&protectedKey(state.placements[pk]?.contentKey))fail();}
  }
  for(const [key,next]of placements){const old=state.placements[key];if(!old||equal(old,next))continue;const at=this.repository.locationOf(key);
   if(protectedKey(old.contentKey)||at&&protectedKey(at.ownerContentKey))fail();
  }
 }
 dispose(){for(const stop of this.stops)stop();this.rules.clear();this.roots.clear();this.protected.clear();}
}
