import { createStore, type SetStoreFunction } from 'solid-js/store';
import type { CanonicalEntity, EntityService } from '../../feature-api/entities';
import { parseInput, rank, type CompletionCandidate, type CompletionKind, type CompletionScope } from './model';
import { usage, recordUsage, clearUsage } from './history';
// Entity query punctuation is not part of the slash-command argument grammar.
const inputParts = (kind: CompletionKind, input: string) => kind === 'command'
  ? { mention: input.trim(), query: input.trim(), scope: undefined, createName: undefined }
  : parseInput(input);
export interface CompletionSource { nodeKey: string; contentKey: string; placementKey: string; viewId: string; version: number; start: number; end: number; literal: string; inline: boolean; brackets?: 'mention'|'autocomplete' }
export interface CompletionHost {
  canDismiss?():boolean;
  service?: EntityService;
  historyScope(): Promise<string>;
  documentEntities(): CompletionCandidate[];
  documents(): Promise<CompletionCandidate[]>;
  passages?(query:string,strategy:'lexical'|'hybrid',signal:AbortSignal):Promise<{rows:CompletionCandidate[];status:string}>;
  navigatePassage?(row:CompletionCandidate,current:()=>boolean):Promise<void>;
  commands(query?: string): CompletionCandidate[];
  commandArguments?(query:string): {key:string;query:string;load(signal:AbortSignal):Promise<CompletionCandidate[]>}|undefined;
  valid(source: CompletionSource): boolean;
  commit(source: CompletionSource, entity: CanonicalEntity, text: string): void;
  reference(source: CompletionSource, candidate: CompletionCandidate, text: string): Promise<void>;
  command(source: CompletionSource, id: string, candidate:CompletionCandidate, current:()=>boolean): void|Promise<void>;
  dismiss(keepLiteral?: boolean): void|boolean;
}
/** One occurrence, one source bookmark, cancellable optional reads, no canonical state ownership. */
interface State {phase:'active'|'confirmed'|'cancelled';sourceText:string;searchQuery:string;queryMode:'following-source'|'independent';kind:CompletionKind;input:string;scope:CompletionScope;rows:CompletionCandidate[];selected:string;busy:boolean;pending:boolean;error:string;retrievalStatus:string;expanded:boolean;revision:number}
export class CompletionSession {
  readonly state:State; private set:SetStoreFunction<State>;
  source: CompletionSource;
  private controller?: AbortController;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private suspended = false;
  private local: CompletionCandidate[];
  private historyKey?: string;
  private documentPool?: Promise<CompletionCandidate[]>;
  private commandPools=new Map<string,Promise<CompletionCandidate[]>>();
  private lifetime=new AbortController();
  constructor(readonly host: CompletionHost, source: CompletionSource, kind: CompletionKind, input: string) {
    this.source = source;
    const parsed = inputParts(kind, input);
    [this.state,this.set] = createStore<State>({ phase:'active', sourceText:source.brackets?source.literal:source.inline?parsed.mention:source.literal, searchQuery:parsed.query, queryMode:kind!=='command'&&input.includes(' : ')?'independent':'following-source', kind, input, scope:'blend' as CompletionScope, rows:[] as CompletionCandidate[], selected:'', busy:false, pending:false, error:'', retrievalStatus:'', expanded:!source.inline, revision:0 });
    this.local = kind === 'entity' ? host.documentEntities() : [];
    this.refresh();
  }
  get alive() { return !this.disposed; }
  get parsed() { const parsed=inputParts(this.state.kind,this.state.input); return {...parsed,query:this.state.searchQuery,mention:this.state.sourceText}; }
  update(source: CompletionSource, input: string) { if(this.state.pending)return; this.source=source; const sourceText=source.brackets?source.literal:inputParts(this.state.kind,input).mention; this.set({sourceText,...(this.state.queryMode==='following-source'?{input,searchQuery:inputParts(this.state.kind,input).query}:{}),revision:this.state.revision+1}); this.refresh(); }
  input(input: string) { input=input.slice(0,1000);this.set({input,searchQuery:inputParts(this.state.kind,input).query,queryMode:'independent'}); this.refresh(); }
  follow() { this.set({queryMode:'following-source',input:this.state.sourceText,searchQuery:this.state.sourceText});this.refresh(); }
  scope(scope: CompletionScope) { this.set('scope',scope); this.refresh(); }
  expand() { this.set('expanded',true); }
  select(id: string) { this.set('selected',id); }
  move(delta: number) { const rows=this.state.rows.filter(r=>!r.disabled),i=rows.findIndex(r=>r.id===this.state.selected); if(rows.length)this.select(rows[(i+delta+rows.length)%rows.length].id); }
  inventoryChanged() { this.local=this.host.documentEntities(); this.refresh(); }
  clearHistory() { if(this.historyKey)clearUsage(this.historyKey); this.refresh(); }
  private publish(rows: CompletionCandidate[],query=this.parsed.query) {
    const parsed=this.parsed, scope=parsed.scope??this.state.scope, ranked=(this.state.kind==='block'?[...new Map(rows.map(r=>[r.id,r])).values()]:rank(rows,query,scope)).slice(0,100);
    this.set({rows:ranked,selected:ranked.some(r=>r.id===this.state.selected&&!r.disabled)?this.state.selected:ranked.find(r=>!r.disabled)?.id??''});
  }
  suspend() { this.suspended=true;clearTimeout(this.timer);this.controller?.abort();++this.generation;this.set('busy',false); }
  refresh() {
    if(this.suspended||this.disposed)return;
    clearTimeout(this.timer); this.controller?.abort(); const generation=++this.generation;
    if(this.state.kind==='command'){
      if(!this.host.commandArguments?.(this.parsed.query)){this.set({busy:false,error:'',selected:''});this.publish(this.host.commands(this.parsed.query));return;}
      this.publish([]);
    }
    if(this.state.kind==='block')this.publish([]);
    this.set({busy:true,error:'',retrievalStatus:''}); this.timer=setTimeout(()=>void this.resolve(generation),150);
  }
  private async resolve(generation: number) {
    const controller=this.controller=new AbortController(), signal=controller.signal;
    const current=()=>!this.disposed&&generation===this.generation&&!signal.aborted;
    try {
      const {query,scope:override}=this.parsed, scope=override??this.state.scope;
      const matches=(r: CompletionCandidate)=>!query||r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
      if(this.state.kind==='command') {
        const args=this.host.commandArguments?.(query);
        if(!args){this.publish(this.host.commands(query));return;}
        let pool=this.commandPools.get(args.key);
        if(!pool){pool=args.load(this.lifetime.signal);this.commandPools.set(args.key,pool);}
        const rows=await pool;
        if(current())this.publish(rows.filter(r=>!args.query||`${r.name} ${r.reason}`.toLocaleLowerCase().includes(args.query.toLocaleLowerCase())),args.query);
        return;
      }
      if(this.state.kind==='block') {
        if(!query||!this.host.passages){this.publish([]);return;}
        const lexical=await this.host.passages(query,'lexical',signal);if(!current())return;this.publish(lexical.rows);this.set('retrievalStatus',lexical.status);
        await new Promise<void>(resolve=>setTimeout(resolve,450));if(!current())return;
        try{const semantic=await this.host.passages(query,'hybrid',signal);if(current()){this.publish([...lexical.rows,...semantic.rows.filter(r=>!lexical.rows.some(l=>l.id===r.id))]);this.set('retrievalStatus',semantic.status);}}
        catch(e){if(current())this.set('retrievalStatus',`Lexical results retained. ${String(e)}`);}
        return;
      }
      if(this.state.kind==='document') { const rows=await (this.documentPool??=this.host.documents()); if(current())this.publish(rows.filter(matches)); return; }
      if(['blend','document'].includes(scope))this.publish(this.local.filter(matches));
      this.historyKey??=await this.host.historyScope(); if(!current())return;
      const rows: CompletionCandidate[]=[];
      if(['blend','document'].includes(scope))rows.push(...this.local.filter(matches));
      if(['blend','session','day','week'].includes(scope)) rows.push(...usage(this.historyKey,scope==='day'?1:scope==='week'?7:undefined).map(r=>({id:r.id,name:r.name,reason:scope==='day'?'Used in last 24 hours':scope==='week'?'Used in last 7 days':'Used this session',recent:r.at})).filter(matches));
      this.publish(rows);
      if(['blend','cavern'].includes(scope)&&query&&this.host.service) {
        const publish=(result: Awaited<ReturnType<EntityService['search']>>)=>{if(current())this.publish([...rows,...result.candidates.map(r=>({id:r.id,name:r.name,reason:r.evidence.map(e=>`${e.kind}: ${e.text}`).join(' · '),exact:r.evidence.some(e=>['name','alias'].includes(e.kind)&&e.text.toLocaleLowerCase()===query.toLocaleLowerCase())}))]);};
        const result=await this.host.service.search({query,scope:'vault',stream:'all',match:'partial'},signal,publish); publish(result);
        if(current()&&result.diagnostics.length)this.set('error',result.diagnostics.join(' '));
      }
    } catch(e) { if(current())this.set('error',String(e)); } finally { if(current())this.set('busy',false); }
  }
  async choose(replace = false) {
    const row=this.state.rows.find(r=>r.id===this.state.selected); if(!row||row.disabled||this.state.pending)return;
    this.set({pending:true,error:''}); const generation=++this.generation; this.controller?.abort(); clearTimeout(this.timer);
    const source=this.source;
    try {
      this.assertSource(source);
      if(this.state.kind==='block'){await this.host.navigatePassage?.(row,()=>this.alive&&generation===this.generation);if(this.alive)this.complete();return;}
      if(this.state.kind==='command') { const action=this.host.command(source,row.id,row,()=>this.alive&&generation===this.generation);if(action instanceof Promise)await action;if(this.alive)this.complete();return; }
      const label=replace||!this.parsed.mention?row.name:this.parsed.mention;
      if(this.state.kind==='document') { await this.host.reference(source,row,label); if(this.alive)this.complete(); return; }
      this.controller=new AbortController();
      const entity=await this.host.service?.get(row.id,this.controller.signal);
      if(!this.alive||generation!==this.generation)return;
      this.assertSource(source); if(!entity)throw Error('The canonical Entity is no longer available.');
      const text=source.brackets==='autocomplete'?entity.name:source.brackets==='mention'?this.state.sourceText:replace||!this.parsed.mention?entity.name:this.parsed.mention;
      if(!text.length)throw Error('Type mention text inside the brackets before linking.');
      this.host.commit(source,entity,text);
      if(this.historyKey)recordUsage(this.historyKey,entity);
      this.complete();
    } catch(e) { if(this.alive)this.set('error',String(e)); } finally { if(this.alive)this.set('pending',false); }
  }
  assertSource(source=this.source) { if(!this.alive||source!==this.source||!this.host.valid(source))throw Error('The source occurrence changed. Reopen Autocomplete.'); }
  fail(error: unknown) { if(this.alive)this.set({error:String(error),pending:false}); }
  complete() { this.set('phase','confirmed');this.close(); }
  close(keepLiteral=false) { if(this.disposed)return;if(this.host.dismiss(keepLiteral)===false)return;if(this.state.phase==='active')this.set('phase','cancelled');this.dispose(); }
  dispose() { if(this.disposed)return;if(this.state.phase==='active')this.set('phase','cancelled'); this.disposed=true; ++this.generation; clearTimeout(this.timer); this.controller?.abort(); this.lifetime.abort(); this.commandPools.clear(); this.host.service?.dispose(); }
}
