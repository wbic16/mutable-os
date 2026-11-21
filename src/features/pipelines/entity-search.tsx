import {For,Show,createEffect,createSignal,onCleanup} from 'solid-js';
import type {CanonicalEntity,EntityResolution,EntityResolutionQuery} from '../../feature-api/entities';
import {searchEntities,inspectEntity,type EntitySearchReader} from '../entity-references/read-only-search';
import type {PipeController,PipeDefinition,InteractionState} from './runtime';
export interface VaultEntityReference{vaultId:string;entityId:string;revision:number}
export interface SearchInput{query:string}
export interface SearchOutput{entity:VaultEntityReference}
export function createEntitySearchPipe(reader:EntitySearchReader,vaultId:string):PipeDefinition<SearchInput,SearchOutput,EntitySearchController>{return {id:'entity-search-select',title:'Scry',create:(input,context)=>new EntitySearchController(input,reader,vaultId,context.changed)};}
export class EntitySearchController implements PipeController<SearchInput,SearchOutput>{
 private queryState=createSignal('');readonly query=this.queryState[0];private streamState=createSignal<EntityResolutionQuery['stream']>('all');readonly stream=this.streamState[0];private matchState=createSignal<EntityResolutionQuery['match']>('partial');readonly match=this.matchState[0];
 private results=createSignal<EntityResolution>();readonly result=this.results[0];private selection=createSignal<CanonicalEntity>();readonly selected=this.selection[0];private loading=createSignal(false);private inspecting=createSignal(false);private failure=createSignal('');readonly error=this.failure[0];private inspectAbort?:AbortController;private initial:string;
 readonly status=():InteractionState=>(this.loading[0]()||this.inspecting[0]())?'busy':this.error()?'error':this.selected()?'ready':'idle';
 readonly actions=()=>[{id:'select',label:'Use Selected Identity',enabled:!!this.selected()&&this.status()!=='busy',primary:true},{id:'none',label:'No Matching Identity',enabled:this.status()!=='busy'}];
 constructor(input:Readonly<SearchInput>,private reader:EntitySearchReader,private vaultId:string,private changed:()=>void){
  this.initial=input.query;this.queryState[1](input.query);
  createEffect(()=>{const query={query:this.query(),stream:this.stream(),match:this.match(),scope:'vault' as const};const abort=new AbortController();this.loading[1](true);this.failure[1]('');this.results[1](undefined);
   const timer=setTimeout(async()=>{try{this.results[1](await searchEntities(reader,query,abort.signal,r=>this.results[1](r)));}catch(e){if(!abort.signal.aborted)this.failure[1](String(e));}finally{if(!abort.signal.aborted)this.loading[1](false);}},200);
   onCleanup(()=>{clearTimeout(timer);abort.abort();});
  });
 }
 input(query:string){this.clear();this.queryState[1](query);}
 setStream(value:EntityResolutionQuery['stream']){this.clear();this.streamState[1](value);}
 setMatch(value:EntityResolutionQuery['match']){this.clear();this.matchState[1](value);}
 private clear(){this.inspectAbort?.abort();this.inspecting[1](false);this.selection[1](undefined);this.failure[1]('');this.changed();}
 async select(id:string){this.clear();const abort=this.inspectAbort=new AbortController();this.inspecting[1](true);try{this.result()?.current();const entity=await inspectEntity(this.reader,id,abort.signal);if(!abort.signal.aborted)this.selection[1](entity);}catch(e){if(!abort.signal.aborted)this.failure[1](String(e));}finally{if(this.inspectAbort===abort)this.inspecting[1](false);}}
 update(input:Readonly<SearchInput>){if(input.query!==this.initial){this.initial=input.query;this.input(input.query);}}
 async execute(action:string,signal:AbortSignal){if(action==='none')return {outcome:'no-match'};const selected=this.selected();if(!selected)throw Error('Select an Entity');const entity=await inspectEntity(this.reader,selected.id,signal);if(entity.revision!==selected.revision)throw Error('Selected Entity changed. Select it again.');return {outcome:'selected',values:{entity:{vaultId:this.vaultId,entityId:entity.id,revision:entity.revision}}};}
 dispose(){this.inspectAbort?.abort();}
}
export function EntitySearchContent(props:{controller:EntitySearchController}){const c=props.controller;return <>
 <label>Search authentic Entities<input type="search" aria-label="Search authentic Entities" value={c.query()} onInput={e=>c.input(e.currentTarget.value)}/></label>
 <div style={{display:'flex',gap:'8px'}}><select aria-label="Search field" value={c.stream()} onChange={e=>c.setStream(e.currentTarget.value as EntityResolutionQuery['stream'])}><option value="all">All fields</option><option value="name">Name</option><option value="alias">Alias</option><option value="mention">Mention</option></select><select aria-label="Match mode" value={c.match()} onChange={e=>c.setMatch(e.currentTarget.value as EntityResolutionQuery['match'])}><option value="partial">Contains</option><option value="exact">Exact</option></select></div>
 <Show when={c.status()==='busy'}><p role="status">Searching…</p></Show><Show when={c.error()}><p role="alert">{c.error()}</p></Show>
 <div class="pipeline-search-results"><For each={c.result()?.candidates??[]}>{row=><button aria-pressed={c.selected()?.id===row.id} onClick={()=>void c.select(row.id)}>{row.name}<small>{row.evidence.map(e=>e.text).slice(0,2).join(' · ')}</small></button>}</For></div>
 <Show when={c.result()&&!c.result()!.candidates.length}><p>No matches. Try another name or choose No Matching Identity below.</p></Show>
 <For each={c.result()?.diagnostics??[]}>{message=><p class="pipeline-unavailable">{message}</p>}</For>
 <Show when={c.selected()}>{entity=><section><h3>{entity().name}</h3><p>{entity().typename}</p><p>{entity().description||'No description'}</p><small>{entity().aliases.map(a=>a.name).join(' · ')}</small></section>}</Show>
 </>;}
