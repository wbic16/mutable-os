import { createSignal, type Accessor, type Setter } from 'solid-js';
import type { CanonicalRepository } from '../block-tree/repository';

type Property = { id?: unknown };
type Entry = { keys: Accessor<readonly string[]>; set: Setter<readonly string[]>; users:number };
const properties = (value:unknown):Property[] => Array.isArray(value) ? value : [];
const counts = (items:Property[]) => { const result=new Map<string,number>(); for(const p of items) if(typeof p?.id==='string'&&p.id) result.set(p.id,(result.get(p.id)??0)+1); return result; };
/** Only mounted canonical content is tracked. Hints preserve idless legacy
 * instances through known edits; ambiguous raw replacement starts new owners. */
export class AnnotationIdentities {
  private entries=new Map<string,Entry>();
  private sequence=0;
  private unsubscribe:()=>void;
  private key=()=>`annotation-${++this.sequence}`;
  constructor(private repository:CanonicalRepository){
    this.unsubscribe=repository.subscribeChanges(change=>{
      for(const [content,before] of change.previousContents){
        const entry=this.entries.get(content);if(!entry)continue;
        if (change.residentPayload && !change.annotationOrigins?.has(content)) continue;
        const previous=properties(before?.payload.standoffProperties);
        const next=properties(repository.readState().contents[content]?.payload.standoffProperties);
        const oldCounts=counts(previous),newCounts=counts(next),oldKeys=entry.keys();
        const byId=new Map(previous.flatMap((p,i)=>typeof p?.id==='string'&&oldCounts.get(p.id)===1?[[p.id,oldKeys[i]] as const]:[]));
        const hints=change.annotationOrigins?.get(content),used=new Set<string>();
        // An unchanged property array is not a replacement, e.g. a block style edit.
        const unchanged=!hints&&JSON.stringify(previous)===JSON.stringify(next);
        entry.set(next.map((p,i)=>{
          const origin=hints?.[i];
          let key=typeof p?.id==='string'&&newCounts.get(p.id)===1?byId.get(p.id):undefined;
          if(!key&&typeof origin==='number'&&Number.isInteger(origin)&&origin>=0)key=oldKeys[origin];
          if(!key&&unchanged)key=oldKeys[i];
          if(!key||used.has(key))key=this.key();used.add(key);return key;
        }));
      }
    });
  }
  acquire(content:string){
    let entry=this.entries.get(content);
    if(!entry){const [keys,set]=createSignal<readonly string[]>(properties(this.repository.readState().contents[content]?.payload.standoffProperties).map(this.key));entry={keys,set,users:0};this.entries.set(content,entry);}
    entry.users++;let live=true;const owned=entry;
    return {keys:entry.keys,dispose:()=>{if(!live)return;live=false;if(--owned.users===0)this.entries.delete(content);}};
  }
  dispose(){this.unsubscribe();this.entries.clear();}
}
