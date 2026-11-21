import {retrievalForeground} from '../application/retrieval-client';
import {isNativeDocumentName,nativeDocumentStem,isDerivedMarkdownName} from './document-file-names.mjs';
import { batch, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { RepositoryChange } from '../block-tree/repository';
import type { ContentRecord } from '../block-tree/types';
import { resourceOwner, indexedResourceLookup } from '../block-tree/resource-identity';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { DocumentLocation } from '../reactive-editor/persistence';
import { admitNative, admitNativeWithResource, captureNative, nativeText } from './native-resource';
import { admitMarkdown, type LinkTarget } from './markdown';
import { enrollPair, type PairGeneration, type PairResult, type ResourcePair } from './resource-pair';
import { markNativeBinding, ownNativeSession } from './native-bindings';
import { recognizeCompatibleDocument } from './compatible-document';
import { browserSaveDiagnostics, diagnosticError } from './browser-save-diagnostics';
type Baseline = { nativeHash: string | null; markdownHash: string | null; generation: string | null; locationRevision?: string };
export type NativeOverwrite = {resourceId:string; nativeHash:string};
type Binding = { location: DocumentLocation; baseline: Baseline; pair: ResourcePair; pending?: PairGeneration; overwrite?:NativeOverwrite; message: string; comparedHash?: string; busy: boolean; relocation?: string; relocationWork?: Promise<unknown>; members: Set<string> };
const sessions = new WeakMap<ReactiveEditor, NativeDocumentSession>();
export const existingNativeDocumentSession = (editor: ReactiveEditor) => sessions.get(editor);
export function nativeDocumentSession(editor: ReactiveEditor) {
  let service = sessions.get(editor); if (!service) sessions.set(editor, service = new NativeDocumentSession(editor)); return service;
}
async function request(action: string, body?: unknown, signal?: AbortSignal) {
  const tracked = ['save', 'recover', 'save-recognized', 'recover-recognized'].includes(action);
  const input = body as any, started = performance.now();
  const diagnostic = tracked ? { action, requestId: crypto.randomUUID(), resourceId: input?.generation?.resourceId ?? input?.resourceId ?? input?.source?.resourceId, generation: typeof input?.generation === 'string' ? input.generation : input?.generation?.generation, filename: input?.location?.filename ?? input?.source?.location?.filename } : undefined;
  if (diagnostic) browserSaveDiagnostics.record('native.request', diagnostic);
  let response: Response;
  try { response = await fetch(`/api/native/${action}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { signal }); }
  catch (error) { if (diagnostic) { const failure = diagnosticError(error); browserSaveDiagnostics.record(failure === 'network-request-failed' ? 'native.network-failure' : 'native.request-failed', { ...diagnostic, error: failure, elapsedMs: performance.now() - started }); } throw error; }
  let json: any;
  try { json = await response.json(); }
  catch (error) {
    if (diagnostic) browserSaveDiagnostics.record('native.invalid-response', { ...diagnostic, status: response.status, elapsedMs: performance.now() - started });
    if (signal?.aborted) throw error;
    throw Object.assign(new Error('Native store returned an invalid response'), {status:response.status});
  }
  if (diagnostic) browserSaveDiagnostics.record('native.response', { ...diagnostic, status: response.status, accepted: response.ok && json?.Success === true, phase: json?.Data?.result?.phase ?? json?.Data?.phase, preflight: json?.PublicationStarted === false, elapsedMs: performance.now() - started });
  if (!response.ok || !json?.Success) throw Object.assign(new Error(json?.Error ?? 'Native store request failed'), {status:response.status,preflight:json?.PublicationStarted===false}); return json.Data;
}
const sameLocation = (a: DocumentLocation, b: DocumentLocation) => a.folder === b.folder && a.filename === b.filename;
/** C1a storage capability; no Flint UI or authored vault membership. */
export interface VaultRelocation {
  operationId: string; vault: string; kind: 'pair' | 'directory'; source: string; destination: string;
  baselines: Array<{resourceId: string; baseline: Baseline}>;
  dependencies?: Array<{resourceId: string; location: DocumentLocation}>;
}
export class NativeDocumentSession {
  private legacyVaultDiscovery = false;
  private bindings = new Map<string, Binding>();
  private compatibleSources = new Map<string,{location:DocumentLocation;byteHash:string;format:string;vault:string;canSave:boolean;message:string;dirty:boolean;busy:boolean;members:Set<string>;pending?:any;pendingRevision?:number;savedRevision:number|undefined}>();
  private changed = createSignal(0);
  private localStatusChanges = createStore<Record<string, number>>({});
  private dirtyState = createStore<Record<string, boolean>>({});
  /** Per-resource flags: reading a tab indicator must never capture a Document. */
  isDirty(id: string) {
    const dirty=this.dirtyState[0][id]??true,b=this.bindings.get(id),s=this.compatibleSources.get(id);
    return dirty || (b ? b.pair.dirty : s ? this.editor.repository.resourceGeneration(id)!==s.savedRevision : false);
  }
  hasPendingSave(id: string) { return !!(this.bindings.get(id)?.pending || this.compatibleSources.get(id)?.pending); }
  /** A failed first destination is not a saved binding. Pending generations keep their destination. */
  needsSaveDestination(id: string) {
    if (this.compatibleSources.has(id)) return false;
    const binding = this.bindings.get(id);
    return !binding || binding.baseline.nativeHash === null && !binding.pending && !binding.busy;
  }
  /** Read-only evidence for an explicit first-save confirmation. No admission. */
  async inspectOverwrite(location:DocumentLocation):Promise<NativeOverwrite> {
    const data=await request('open',{location});
    if(this.disposed)throw Error('Document session closed');
    if(data.readOnly)throw Error('This file is read-only.');
    if(data.kind!=='native'||data.pending||!data.baseline?.nativeHash)throw Error('Recover the existing file before overwriting it.');
    if(this.bindings.has(data.resourceId)||this.compatibleSources.has(data.resourceId))throw Error('This file is already open in this workspace. Save with a different name to preserve its editing session.');
    return {resourceId:data.resourceId,nativeHash:data.baseline.nativeHash};
  }
  private markDirty(id: string, dirty: boolean) { this.dirtyState[1](id, dirty); }
  // Tree observers must not rebuild for ordinary content/status changes.
  private storageChanged = createSignal(0);
  private disposed = false;private knowledgeEpoch=0;private opening=0;private knowledgeListeners=new Set<()=>void>();
  subscribeKnowledge(listener:()=>void){this.knowledgeListeners.add(listener);return ()=>{this.knowledgeListeners.delete(listener);};}
  private notifyKnowledge(){this.knowledgeEpoch++;for(const listener of this.knowledgeListeners)listener();}
  /** Read-only existing bindings, for scope coverage diagnostics. No capture or enrollment. */
  knowledgeBindings(){return Object.freeze([...this.bindings].map(([resourceId,b])=>Object.freeze({resourceId,location:Object.freeze({...b.location})})));}
  knowledgeEvidence(id:string){const b=this.bindings.get(id),s=this.compatibleSources.get(id);return Object.freeze({epoch:this.knowledgeEpoch,closed:this.disposed,admitting:this.opening>0,pending:!!(b?.busy||b?.pending||s?.busy||s?.pending||b?.relocation||this.relocations.size),location:b||s?Object.freeze({...((b??s)!.location)}):undefined,byteHash:b?.baseline.nativeHash??s?.byteHash});}
  private notice = '';
  private candidates = new Set<string>();
  private relocations = new Map<string, { request: VaultRelocation; work?: Promise<unknown>; bindings: Array<{ id: string; baseline: Baseline; location: DocumentLocation }> }>();
  constructor(private editor: ReactiveEditor) {
    const warn = (event: BeforeUnloadEvent) => { if (this.candidates.size || this.relocations.size || [...this.compatibleSources].some(([id,s])=>this.isDirty(id)||s.pending) || [...this.bindings].some(([id,b]) => b.pending || b.relocation || this.isDirty(id))) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    const stop = editor.repository.subscribeChanges(change => {
      // Canonical owner generations also cover placement-only changes and
      // foreign-provenance invalidation, which content membership alone misses.
      const affectedResource = (id:string) => change.resourceProvenanceChanged || !change.resourceIds || change.resourceIds.includes(id);
      const oriented = change.structural?.tabOrientationOwner ?? change.structural?.sequenceMetadataOwner ?? change.structural?.preferencesMetadataOwner;
      const tabMetadata = change.structural?.tabMetadata;
      const membership = change.structural?.membership;
      const gloss = change.structural?.gloss;
      const affected = gloss ? [gloss.owner,...gloss.texts] : oriented ? [oriented] : tabMetadata ? [...tabMetadata.owners,...(tabMetadata.inlineOwner?[tabMetadata.inlineOwner]:[])] : membership ? [...change.previousContents.keys()] : undefined;
      if (affected) {
        // Publish only each owning Document's
        // dirty flag and status, without recapture or the workspace-wide signal.
        const update = (members:Set<string>) => {
          for (const entry of membership ?? []) {
            if (entry.after && members.has(entry.after)) members.add(entry.key);
            else if (entry.before && members.has(entry.before)) members.delete(entry.key);
          }
        };
        batch(() => {
          for (const [id, b] of this.bindings) if (affectedResource(id)) {
            update(b.members);
            if (!b.pending && !b.busy && b.message !== 'Document changed — Save required') {
              b.message = 'Document changed — Save required';
              this.localStatusChanges[1](id, version => (version ?? 0) + 1);
            }
            this.markDirty(id, true);
          }
          for (const [id, s] of this.compatibleSources) if (affectedResource(id)) {
            update(s.members);
            s.dirty = true;
            if (!s.busy && !s.pending && s.message !== 'Document changed — Save required') {
              s.message = 'Document changed — Save required';
              this.localStatusChanges[1](id, version => (version ?? 0) + 1);
            }
            this.markDirty(id, true);
          }
        });
        return;
      }
      for (const [id,b] of this.bindings) {
        if (!affectedResource(id)) continue;
        this.markDirty(id, true);
        if (!b.pending && !b.busy) b.message = 'Document changed — Save required';
        if (!change.inlineOwner) { try { b.members = this.updateMembers(b.members, id, change); } catch { b.message = 'Canonical source unavailable or ambiguous'; } }
      }
      for(const [id,s] of this.compatibleSources){if(!affectedResource(id))continue;s.dirty=true;this.markDirty(id,true);if(!change.inlineOwner){try{s.members=this.updateMembers(s.members,id,change);}catch{s.message="Canonical source unavailable or ambiguous";}}if(!s.busy&&!s.pending)s.message="Document changed — Save required";}
      this.touch();
    });
    ownNativeSession(editor.repository, () => { this.disposed = true;this.notifyKnowledge();this.knowledgeListeners.clear(); stop(); window.removeEventListener('beforeunload', warn); });
  }
  private updateMembers(members: Set<string>, id: string, change: RepositoryChange): Set<string> {
    if (change.listWrap && members.has(change.listWrap.parent)) {
      const { wrapperContent, wrapped } = change.listWrap;
      if (wrapped) members.add(wrapperContent); else members.delete(wrapperContent);
      if (members.has(change.listWrap.child)) for (const [key, before] of change.previousContents) {
        const after = this.editor.repository.readState().contents[key];
        if (after?.viewType === 'text-cell') members.add(key);
        else if (!after && before?.viewType === 'text-cell') members.delete(key);
      }
      return members;
    }
    if (change.emptyParagraph && members.has(change.emptyParagraph.parent)) {
      const { child } = change.emptyParagraph;
      // Retained definitions remain members even without a visible placement.
      if (this.editor.repository.readState().contents[child]) members.add(child);
      else members.delete(child);
      return members;
    }
    const repository=this.editor.repository,state=repository.readState(),affected=new Set(change.previousContents.keys());
    const edges=(c:ContentRecord)=>[...c.children,...c.inlineContent,...Object.values(c.ownedRelations)];
    const visit=(key:string)=>{if(affected.has(key))return;affected.add(key);const c=state.contents[key];if(c)for(const pk of edges(c)){const p=state.placements[pk];if(p&&!p.externalReference&&p.kind!=='reference')visit(p.contentKey);}};
    for(const [key,before] of change.previousContents){const after=state.contents[key],old=new Set(before?edges(before):[]),next=new Set(after?edges(after):[]);for(const pk of new Set([...old,...next]))if(old.has(pk)!==next.has(pk)){const p=state.placements[pk];if(p&&!p.externalReference&&p.kind!=='reference')visit(p.contentKey);}}
    const lookup=indexedResourceLookup(repository);
    for(const key of affected){const c=state.contents[key];if(!c){members.delete(key);continue;}const owner=resourceOwner(state,key,lookup);if(owner?.viewType==='document-block'&&String((owner.payload.metadata as any)?.documentId??owner.payload.id)===id)members.add(key);else members.delete(key);}
    return members;
  }
  private touch() { this.changed[1](v => v + 1); }
  private touchStorage() { this.storageChanged[1](v => v + 1);this.notifyKnowledge(); }
  status(id?: string) { this.changed[0](); if (id) this.localStatusChanges[0][id]; const b = id && this.bindings.get(id); return b ? b.message : id&&this.compatibleSources.has(id) ? this.compatibleSources.get(id)!.message : this.notice || 'Save this Document to a native file before using canonical Entities.'; }
  location(id?: string) { this.storageChanged[0](); const b = id && (this.bindings.get(id)??this.compatibleSources.get(id)); return b ? { ...b.location } : undefined; }
  compatibleSource(id:string){const source=this.compatibleSources.get(id);return source?Object.freeze({...source,location:Object.freeze({...source.location})}):undefined;}
  trackCandidate(id: string) {
    // Capture is synchronous and copies its owned resource. Cloning the entire
    // workspace first adds no isolation, and includes unrelated open Documents.
    captureNative(this.editor.repository.readState(),id);
    markNativeBinding(this.editor.repository,id);this.candidates.add(id);this.markDirty(id,true);this.touch();
  }
  isCandidate(id: string) { this.changed[0]();return this.candidates.has(id); }
  private targets(): LinkTarget[] {
    return Object.values(this.editor.repository.readState().contents).filter(c => c.viewType === 'document-block').map(c => {
      const m = c.payload.metadata as any; const id = String(m?.documentId ?? c.payload.id), binding = this.bindings.get(id);
      return { documentId: id, blockId: String(c.payload.id), title: String(m?.title ?? ''), path: binding ? `${binding.location.folder}/${nativeDocumentStem(binding.location.filename)}` : '' };
    });
  }
  private dependencies(id: string) {
    const known = new Map<string, DocumentLocation>();
    for (const c of Object.values(this.editor.repository.readState().contents).filter(c => c.viewType === 'document-block')) {
      const resourceId = String((c.payload.metadata as any)?.documentId ?? c.payload.id), source = this.editor.persistence.workspaceReference(resourceId)?.source;
      if (source && isNativeDocumentName(source.filename)) known.set(resourceId, { folder: source.folder, filename: source.filename });
    }
    for (const [resourceId,binding] of this.bindings) known.set(resourceId,binding.location);
    return [...known].filter(([resourceId]) => resourceId !== id).map(([resourceId,location]) => ({ resourceId, location }));
  }
  async list(folder: string) { return (await request(`list?${new URLSearchParams({folder})}`)).files as string[]; }
  async defaultVault(signal?:AbortSignal){return (await request('vault/default',undefined,signal)).vault as string|undefined;}
  async establishVault(vault:string,signal?:AbortSignal){return request('vault/establish',{vault},signal);}
  async discoverVault(vault: string, signal?: AbortSignal) { return request('vault/discover', {vault}, signal); }
  async browseVault(vault: string, mode: 'cached'|'reconcile'|'verify', signal?: AbortSignal) {
    if (!this.legacyVaultDiscovery) {
      try { return await request('vault/browse', {vault,mode}, signal); }
      catch (error) {
        // A hot-reloaded client can outlive the backend version that serves it.
        // Fall back only when the endpoint is unsupported, never on storage failures.
        if (signal?.aborted || ![404,405,501].includes((error as any)?.status)) throw error;
        this.legacyVaultDiscovery = true;
      }
    }
    return this.discoverVault(vault, signal);
  }
  async createVaultDirectory(vault: string, directory: string) { return request('vault/mkdir', {vault, directory}); }
  async relocateVault(input: VaultRelocation) {
    if (this.relocations.has(input.operationId)) {
      if(JSON.stringify(this.relocations.get(input.operationId)!.request)!==JSON.stringify(input))throw new Error('Relocation retry differs from original request');
      return this.recoverRelocation(input.operationId);
    }
    const bindings: Array<{id: string; baseline: Baseline; location: DocumentLocation}> = [];
    for (const item of input.baselines) {
      const b = this.bindings.get(item.resourceId); if (!b) continue;
      if (b.busy || b.pending || b.relocation) throw new Error('Finish or recover the resource operation before relocation');
      const boundPath=b.location.folder && b.location.folder!=='.'?`${b.location.folder}/${b.location.filename}`:b.location.filename;
      if(input.kind==='pair'?boundPath!==input.source:!boundPath.startsWith(input.source+'/'))throw new Error('Relocation source differs from the live binding; explicit reconciliation required');
      if (JSON.stringify(b.baseline) !== JSON.stringify(item.baseline)) throw new Error('Vault scan cannot refresh a stale editor baseline');
      bindings.push({id: item.resourceId, baseline: {...b.baseline}, location: {...b.location}});
    }
    const captured = structuredClone(input);
    this.relocations.set(input.operationId, {request: captured, bindings});
    return this.runRelocation(input.operationId, false);
  }
  pendingVaultRelocations(vault: string) {
    this.storageChanged[0]();
    return [...this.relocations].filter(([,value]) => value.request.vault === vault).map(([operationId]) => operationId);
  }
  async recoverRelocation(operationId: string) {
    this.opening++;this.notifyKnowledge();try{return await this.recoverRelocationWork(operationId);}finally{this.opening--;this.notifyKnowledge();}
  }
  private async recoverRelocationWork(operationId:string){
    if (!this.relocations.has(operationId)) {
      const result=await request('vault/recover',{operationId});
      this.notice=result.phase==='relocated'?'Relocation recovered. Explicitly Open the destination; existing bindings were not adopted.':`Relocation pending: ${result.error??'Review required'}`;
      this.touch();return result;
    }
    return this.runRelocation(operationId, true);
  }
  private async runRelocation(operationId: string, recovery: boolean) {
    const record = this.relocations.get(operationId)!;
    if(record.work)return record.work;
    for (const x of record.bindings) {
      const b=this.bindings.get(x.id)!;
      if(b.relocationWork) return b.relocationWork;
      b.relocation=operationId; b.busy=true; b.message='Relocation pending';
    }
    this.touchStorage(); this.touch();
    const work=(async()=>{
      try {
        const result=await request(recovery?'vault/recover':'vault/relocate',recovery?{operationId}:record.request);
        if(this.disposed)return result;
        if(result.phase==='relocated') {
          for(const x of record.bindings) {
            const b=this.bindings.get(x.id)!;
            const moved=result.bindings.find((v:any)=>v.resourceId===x.id);
            if(!moved || JSON.stringify(b.baseline)!==JSON.stringify(x.baseline) || !sameLocation(b.location,x.location)) throw new Error('Relocation completion does not match the caller binding');
            if(moved.baseline.nativeHash!==x.baseline.nativeHash || moved.baseline.markdownHash!==x.baseline.markdownHash || moved.baseline.generation!==x.baseline.generation) throw new Error('Relocation changed the captured content baseline');
          }
          for(const x of record.bindings) {
            const b=this.bindings.get(x.id)!, moved=result.bindings.find((v:any)=>v.resourceId===x.id);
            b.location={...moved.location}; b.baseline={...moved.baseline}; b.relocation=undefined;
            b.message=b.pair.dirty?'Relocated — newer/unsaved edits remain':'Relocated Mutable JSON Document';
            const sources=Object.values(this.editor.repository.readState().contents).filter(c=>c.viewType==='document-block' && String((c.payload.metadata as any)?.documentId??c.payload.id)===x.id);
            if(sources.length===1)this.editor.persistence.registerWorkspaceDocument(sources[0].key,x.id,b.location.folder,b.location.filename);
          }
          this.relocations.delete(operationId);
        } else for(const x of record.bindings)this.bindings.get(x.id)!.message=`Relocation pending: ${result.error??'Recovery required'}`;
        return result;
      } catch(error) {
        if((error as any).preflight && !recovery) {
          // The route explicitly rejected preparation; no server relocation was started.
          for(const x of record.bindings)this.bindings.get(x.id)!.relocation=undefined;
          this.relocations.delete(operationId);
        }
        for(const x of record.bindings)this.bindings.get(x.id)!.message=`Relocation blocked or outcome unknown: ${String(error)}`;
        throw error;
      } finally {
        for(const x of record.bindings){const b=this.bindings.get(x.id)!;b.busy=false;b.relocationWork=undefined;}
        record.work=undefined;this.touchStorage();this.touch();
      }
    })();
    record.work=work;
    for(const x of record.bindings)this.bindings.get(x.id)!.relocationWork=work;
    return work;
  }
  private bank() {
    const state=this.editor.repository.readState(),root=state.contents[state.placements[state.rootPlacementKey].contentKey];
    const banks=root.children.map(k=>state.contents[state.placements[k].contentKey]).filter(c=>c.viewType==='workspace-object-bank-block');
    if(banks.length!==1)throw new Error('Native Open requires one existing workspace object bank');return banks[0].key;
  }
  async open(location: DocumentLocation, importText = false, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if(this.editor.features.semanticRetrieval)retrievalForeground();
    this.opening++;this.notifyKnowledge();try{return await this.openResource(location,importText,undefined,signal);}finally{this.opening--;this.notifyKnowledge();}
  }
  async openCompatible(location:DocumentLocation,vault:string,signal?:AbortSignal) {
    signal?.throwIfAborted();
    if(this.editor.features.semanticRetrieval)retrievalForeground();
    this.opening++;this.notifyKnowledge();
    try {
      const data=await request('recognize',{location},signal);signal?.throwIfAborted();if(this.disposed)throw Error('Document session closed');
      const bytes=new TextEncoder().encode(data.text),recognized=recognizeCompatibleDocument(bytes),id=recognized.resource.resourceId;
      if(id!==data.resourceId)throw Error('Recognition identity changed');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      if([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')!==data.byteHash)throw Error('Recognition bytes changed');
      signal?.throwIfAborted();if(this.disposed)throw Error('Document session closed');
      const old=this.compatibleSources.get(id);
      if(this.bindings.has(id)||old&&!sameLocation(old.location,location))throw Error('Identity already opened from another source; no automatic rebinding');
      if(old&&old.byteHash!==data.byteHash)throw Error('Source changed since Open; live edits were preserved');
      const boundary=this.editor.repository.readCanonicalResourceBoundary(id);
      if(!old&&boundary.status!=='missing')throw Error('Canonical identity is already loaded without this source proof; no implicit adoption');
      if(!old||boundary.status!=='ready')admitNative(this.editor.repository,new TextEncoder().encode(nativeText(recognized.resource)),this.bank());
      if(!old)this.compatibleSources.set(id,{location:{...location},byteHash:data.byteHash,format:recognized.format,vault,canSave:data.saveCapability==='in-place',message:data.saveCapability==='in-place'?'Opened Document — in-place Save available':data.saveReason,dirty:false,busy:false,savedRevision:this.editor.repository.resourceGeneration(id),members:new Set(Object.keys(captureNative(this.editor.repository.snapshot(),id).contents))});
      this.markDirty(id,this.compatibleSources.get(id)!.dirty);markNativeBinding(this.editor.repository,id);this.touchStorage();this.touch();return id;
    }finally{this.opening--;this.notifyKnowledge();}
  }
  /** Selected result only. The caller owns navigation; admission retains all native guards. */
  async openVerified(location: DocumentLocation, expected: {resourceId:string;byteHash:string}, guard:()=>void, signal?:AbortSignal, verify?:()=>Promise<void>) {
    guard(); signal?.throwIfAborted(); if(this.editor.features.semanticRetrieval)retrievalForeground();this.opening++;this.notifyKnowledge();const epoch=this.knowledgeEpoch;
    const check=()=>{guard();signal?.throwIfAborted();if(this.knowledgeEpoch!==epoch)throw Error('Native operation changed during selected Open');};
    let revision=this.editor.repository.state.revision;
    try{const id=await this.openResource(location,false,{...expected,check,signal,verify,completed:()=>{revision=this.editor.repository.state.revision;}});return {id,revision};}finally{this.opening--;this.notifyKnowledge();}
  }
  async verifySelected(location:DocumentLocation, expected:{resourceId:string;byteHash:string}, signal?:AbortSignal) {
    const data=await request('open',{location},signal);await this.checkSelected(data,expected);signal?.throwIfAborted();
  }
  private async checkSelected(data:any, expected:{resourceId:string;byteHash:string}) {
    if(this.disposed||data.kind!=='native'||data.pending||data.resourceId!==expected.resourceId||data.baseline?.nativeHash!==expected.byteHash)throw Error('Selected native evidence changed');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.native));
    if([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')!==expected.byteHash)throw Error('Selected native bytes changed');
  }
  private async openResource(location: DocumentLocation, importText: boolean, expected?:{resourceId:string;byteHash:string;check:()=>void;signal?:AbortSignal;verify?:()=>Promise<void>;completed:()=>void}, signal = expected?.signal) {
    if(isDerivedMarkdownName(location.filename))throw new Error('Open the native Document; this Markdown file is a derived projection');
    const data = await request('open',{location},signal); signal?.throwIfAborted(); if(expected){expected.check();await this.checkSelected(data,expected);expected.check();await expected.verify?.();expected.check();} if(this.disposed)throw new Error('Document session closed');
    if(data.kind === 'markdown') {
      if(!importText)throw new Error('Choose Import Markdown to create a new native candidate');
      const admitted=admitMarkdown(this.editor.repository,this.bank(),data.text,this.targets()); markNativeBinding(this.editor.repository,admitted.resourceId);this.candidates.add(admitted.resourceId);
      this.notice='Markdown imported into a new native Document; original file unchanged. Choose a native Save destination.';this.touch();return admitted.resourceId;
    }
    if(importText)throw new Error('Select a standalone .md file to import');
    if(data.pending)throw new Error('This file has a pending generation. Use Recover, then Open again.');
    const existing=this.bindings.get(data.resourceId);
    if(this.compatibleSources.has(data.resourceId))throw Error('Identity already opened from a compatibility source; no automatic rebinding');
    if(existing&&!sameLocation(existing.location,location))throw new Error('This identity is already bound to another location. Relocation requires separate review.');
    if(existing){
      if(JSON.stringify(existing.baseline)!==JSON.stringify(data.baseline))throw new Error('The server file changed since this Document was opened. Current edits and baseline were preserved.');
      const boundary=this.editor.repository.readCanonicalResourceBoundary(data.resourceId);
      if(boundary.status==='ready'){expected?.completed();return data.resourceId;}
      if(boundary.status!=='missing')throw Error('Bound canonical resource is '+boundary.status);
      // Explicit Open after disappearance may re-admit the verified native resource.
      // A retained binding alone is never evidence of a live canonical Document.

    }
    const bytes=new TextEncoder().encode(data.native);
    expected?.check();
    if(typeof data.resourceId!=='string'||!data.resourceId.trim())throw Error('Open response identity missing');
    // Publish admission and its file binding together so catalog observers do
    // not rebuild once for the Document and again for its storage status.
    return batch(()=>{
      const admitted=admitNativeWithResource(this.editor.repository,bytes,this.bank(),data.resourceId);
      const binding=existing??this.bind(data.resourceId,location,data.baseline,admitted.members);
      if(existing)binding.members=new Set(admitted.members);
      binding.pair.acknowledgeOpen();binding.message=data.readOnly?'Opened native Document (server is read-only)':'Opened native Document';
      const contentKey=this.editor.repository.state.placements[admitted.placementKey].contentKey;
      this.editor.persistence.registerWorkspaceDocument(contentKey,data.resourceId,location.folder,location.filename);
      this.touch();expected?.completed();return data.resourceId;
    });
  }
  private bind(id: string, location: DocumentLocation, baseline: Baseline, members?: readonly string[]): Binding {
    const binding = { location: {...location}, baseline, message:'Native destination selected', busy:false, members:new Set(members ?? Object.keys(captureNative(this.editor.repository.snapshot(),id).contents)) } as Binding;
    const complete = (data: any) => {
      const r: PairResult=data.result;
      if(r.phase==='saved'&&r.generation===binding.pending?.generation){binding.baseline=data.baseline;binding.pending=undefined;binding.overwrite=undefined;this.candidates.delete(id);}
      if(r.phase==='failed'&&!r.generation){binding.pending=undefined;binding.overwrite=undefined;}
      return r;
    };
    binding.pair=enrollPair(this.editor.repository,id,{
      save: async generation => {
        binding.pending=generation as PairGeneration;this.notifyKnowledge();
        try { const data=await request('save',{location:binding.location,generation,baseline:binding.baseline,dependencies:this.dependencies(id),acceptMarkdownHash:binding.comparedHash,overwrite:binding.overwrite});
          const r=complete(data);if(r.phase==='failed'&&!r.generation)binding.pending=undefined;return r;
        }catch(error){if((error as any).preflight){binding.pending=undefined;binding.overwrite=undefined;return {phase:'failed',error:String(error)};}return {phase:'failed',generation:generation.generation,error:`Save outcome unknown or rejected: ${String(error)}. Use Retry / Recover.`};}
      },
      recover: async () => {
        if(!binding.pending)return {phase:'failed',error:'No pending generation'};
        // Resend exactly the captured request. The server verifies retry bytes
        // and recovers its intent/receipt, or starts it if it never arrived.
        const data=await request('save',{location:binding.location,generation:binding.pending,baseline:binding.baseline,dependencies:this.dependencies(id),acceptMarkdownHash:binding.comparedHash,overwrite:binding.overwrite});return complete(data);
      }
    },()=>this.targets());
    this.bindings.set(id,binding);this.markDirty(id,baseline.nativeHash===null);markNativeBinding(this.editor.repository,id);this.touchStorage();return binding;
  }
  private async operate(id: string, recovery: boolean) {
    const b=this.bindings.get(id);if(!b)throw new Error('Choose a native Save destination first');
    if(b.relocationWork)await b.relocationWork;
    if(b.relocation)throw new Error('Recover pending relocation before Save');
    if(b.busy)return;b.busy=true;b.message=recovery?'Recovering captured generation…':'Saving Mutable JSON Document…';this.notifyKnowledge();this.touch();
    try {const completed=await (recovery?b.pair.recover():b.pair.save(b.comparedHash));
      // A programmatic edit can run between promise continuations. Never clear
      // a newer dirty notification using the coordinator's earlier result.
      const r={...completed,dirty:completed.phase==='saved'?b.pair.dirty:true};
      const labels={saved:'Saved Mutable JSON Document',failed:'Save blocked','canonical-saved-markdown-pending':'Canonical saved; Markdown pending','confirmation-pending':'Confirmation pending'};
      b.message=labels[r.phase]+(r.dirty?' — newer/unsaved edits remain':'')+(r.error?`: ${r.error}`:'');
      if(r.phase==='saved'){b.comparedHash=undefined;this.markDirty(id,!!r.dirty);}
      return r;
    }finally{b.busy=false;this.notifyKnowledge();this.touch();}
  }
  async save(id: string, location?: DocumentLocation, overwrite?:NativeOverwrite) {
    if(this.editor.completionInput?.beforeSave?.()===false)throw Error('Finish or cancel Scry, then Save again.');
    if(overwrite){
      if(!this.needsSaveDestination(id))throw Error('Overwrite confirmation is only valid for a first Save.');
      if(this.bindings.has(overwrite.resourceId)||this.compatibleSources.has(overwrite.resourceId))throw Error('The destination Document was opened while confirming. Save with a different name.');
    }
    if(this.compatibleSources.has(id)){if(location&&!sameLocation(location,this.compatibleSources.get(id)!.location))throw Error('Changing source format/location requires explicit Save As; no conversion was performed');return this.saveRecognized(id);}
    if(this.editor.blockHistory.state.storage==='persistent')throw new Error('Native pair integration does not migrate persistent History enrollment');
    let b=this.bindings.get(id);
    if(!b){if(!location||!isNativeDocumentName(location.filename))throw new Error('Choose a .ink, .phosphor or .mutable.json destination');captureNative(this.editor.repository.snapshot(),id);b=this.bind(id,location,{nativeHash:null,markdownHash:null,generation:null});}
    // A rejected first destination has no durable binding to relocate.
    if(location && !sameLocation(b.location,location) && b.baseline.nativeHash===null && !b.pending) {
      if(!isNativeDocumentName(location.filename))throw new Error('Choose a .ink, .phosphor or .mutable.json destination');
      b.location={...location};this.touchStorage();
    }
    if(!b.pending&&!b.busy)b.overwrite=overwrite;
    return this.operate(id,false);
  }
  /** Explicit Save into a different Vault. The outside source is never written. */
  async saveCopy(id:string,location:DocumentLocation,overwrite?:NativeOverwrite){
    if(this.editor.completionInput?.beforeSave?.()===false)throw Error('Finish or cancel Scry, then Save again.');
    const old=this.bindings.get(id),compatible=this.compatibleSources.get(id);
    if(old&&(old.busy||old.pending||old.relocation)||compatible&&(compatible.busy||compatible.pending))throw Error('Finish or recover the pending Save before saving a Vault copy.');
    if(old&&sameLocation(old.location,location)||compatible&&sameLocation(compatible.location,location))throw Error('Choose a new Vault location for this copy.');
    // Retain the same canonical editing session and coordinator. Only the
    // destination changes, after an explicit location choice.
    const previous=old&&{location:old.location,baseline:old.baseline,comparedHash:old.comparedHash};
    if(old){old.location={...location};old.baseline={nativeHash:null,markdownHash:null,generation:null};old.comparedHash=undefined;}
    if(compatible)this.compatibleSources.delete(id);
    this.markDirty(id,true);this.touchStorage();
    const result=await this.save(id,location,overwrite);
    // A confirmed preflight rejection did not move the saved resource. Keep its
    // original binding so later contribution saves cannot target the rejected name.
    if(result?.phase==='failed'&&!result.generation&&old&&previous&&!old.pending){Object.assign(old,previous);this.touchStorage();this.touch();}
    return result;
  }
  async recoverRecognized(vault:string,resourceId:string,generation:string){const result=await request('recover-recognized',{vault,resourceId,generation});if(result.phase!=='saved')throw Error(result.error??'Document recovery remains pending');this.notice='Recovery complete. Explicitly reopen the Document; live source baselines were not replaced.';this.touch();return result;}
  async verifySource(vault:string,id:string){const proof=this.knowledgeEvidence(id);if(proof.pending||!proof.location||!proof.byteHash)throw Error('Source unavailable or pending');return request('verify-source',{vault,source:{resourceId:id,location:proof.location,byteHash:proof.byteHash}});}
  private async saveRecognized(id:string){
    const s=this.compatibleSources.get(id)!;if(s.busy)throw Error('Document Save is already active');
    if(!s.canSave)throw Error(s.message);
    s.busy=true;s.message='Saving Document';this.notifyKnowledge();this.touch();
    try{
      if(!s.pending){
        s.pendingRevision=this.editor.repository.resourceGeneration(id);
        s.pending={vault:s.vault,source:{resourceId:id,location:s.location,byteHash:s.byteHash},format:s.format,dependencies:this.dependencies(id),generation:crypto.randomUUID(),native:nativeText(captureNative(this.editor.repository.readState(),id))};
      }
      const result=await request('save-recognized',s.pending);
      if(result.phase!=='saved'){s.message='Document Save pending: '+result.error;return result;}
      s.byteHash=result.byteHash;s.pending=undefined;
      s.savedRevision=s.pendingRevision;s.dirty=this.editor.repository.resourceGeneration(id)!==s.savedRevision;s.pendingRevision=undefined;this.markDirty(id,s.dirty);
      s.message='Saved Document in place'+(s.dirty?' — newer edits remain':'');this.touchStorage();return {...result,dirty:s.dirty};
    }catch(e){if((e as any).preflight)s.pending=undefined;s.message='Document Save blocked: '+String(e);throw e;}
    finally{s.busy=false;this.notifyKnowledge();this.touch();}
  }
  async recover(id: string | undefined, location: DocumentLocation) {
    this.opening++;this.notifyKnowledge();try{return await this.recoverWork(id,location);}finally{this.opening--;this.notifyKnowledge();}
  }
  private async recoverWork(id:string|undefined,location:DocumentLocation){
    if(id&&this.compatibleSources.has(id))return this.saveRecognized(id);
    if(id&&this.bindings.get(id)?.pending)return this.operate(id,true);
    const data=await request('open',{location});if(data.kind!=='native'||!data.pending)throw new Error('No pending generation at this location');
    const result=await request('recover',{location,resourceId:data.resourceId,generation:data.pending.generation,dependencies:this.dependencies(data.resourceId),baseline:data.baseline});
    this.notice=result.result.phase==='saved'?'Recovery complete. Open the native file again.':`Recovery blocked: ${result.result.error}`;this.touch();
  }
  async compare(id: string) {
    const b=this.bindings.get(id);if(!b)throw new Error('Open or save the native Document first');
    const data=await request('compare',{location:b.location,resourceId:id});b.comparedHash=data.externalHash??undefined;
    return {external:data.external??'',generated:(await import('./markdown')).exportMarkdown(captureNative(this.editor.repository.snapshot(),id),this.targets()).text};
  }
  async keepMutable(id: string) {
    const b=this.bindings.get(id);if(!b?.comparedHash)throw new Error('Compare the current Markdown before choosing Keep Mutable');if(b.pending)throw new Error('A partial generation is blocked. Its files remain preserved; in-place conflict resolution is not supported.');
    return this.operate(id,false);
  }
}
