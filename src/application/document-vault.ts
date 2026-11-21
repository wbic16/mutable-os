import { batch, createSignal } from 'solid-js';
import type { NativeDocumentSession, VaultRelocation } from '../persistence/native-session';
export type VaultLocation = {folder: string; filename: string};
type Baseline = VaultRelocation['baselines'][number]['baseline'];
export interface VaultDiscovery {
  vault: string; folders: string[];
  documents: Array<{location: VaultLocation; resourceId: string; title: string; state: string; baseline?: Baseline; byteHash?:string}>;
  markdown: string[]; diagnostics: Array<{path?: string; resourceId?: string; message: string}>;
  other?: string[];
  documentSaves?: Array<{resourceId:string;generation:string;path:string}>;
  operations: Array<{operationId: string; phase: string}>; readOnly: boolean; complete: boolean;
  /** Presentation hint only; listings never carry operation authority. */
  cached?: boolean;
}
export const vaultPath = (location: VaultLocation) => location.folder === '.' ? location.filename : `${location.folder}/${location.filename}`;
export const vaultContains = (root: string, value: string) => root === '.' || value === root || value.startsWith(root + '/');
export function vaultRoot(value: string) {
  const parts=value.trim().split('/').filter(p=>p!=='.'&&p!=='');
  if(value.trim().startsWith('/') || /[\\\0]/.test(value) || parts.includes('..'))throw new Error('Choose a relative directory inside the managed store');
  return parts.join('/')||'.';
}
export function vaultLeaf(value: string) {
  if(!value.trim()||value!==value.trim()||/[\/\\\0]/.test(value)||value.startsWith('.'))throw new Error('Choose a filename or directory name without separators');
  return value;
}
/** Application-facing, disposable tree read model of a Mutable Vault. No authored membership or persistent catalog. */
export function createDocumentVaults(native: NativeDocumentSession, indexLifecycle?: (root:string)=>{refresh(force?:boolean):Promise<void>;dispose():void}, cacheListings=false) {
  const entries=new Map<string,VaultLease>();
  let disposed=false;
  function check(root: string) {
    if(disposed)throw new Error('Document vault host disposed');
    for(const key of entries.keys())if(key!==root&&(vaultContains(key,root)||vaultContains(root,key)))throw new Error('An overlapping vault is already open. Choose the same root or a non-overlapping Vault. Closing a session does not remove an established Vault.');
  }
  class VaultLease {
    users=0;
    private snapshotSignal=createSignal<VaultDiscovery>();
    private listingSignal=createSignal<VaultDiscovery>();
    private listingWork?:Promise<void>;
    private listingController?:AbortController;
    private checkingSignal=createSignal(false);
    private verified=false;
    private busySignal=createSignal(false);
    private noticeSignal=createSignal('');
    private refreshWork?:Promise<void>;
    private controller?:AbortController;
    private alive=true;private listeners=new Set<()=>void>();
    subscribe(listener:()=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
    private notify(){for(const listener of this.listeners)listener();}
    private signatureSignal=createSignal('');
    private update(value:VaultDiscovery){const signature=JSON.stringify(value);if(signature===this.signature())return;batch(()=>{this.snapshotSignal[1](value);this.signatureSignal[1](signature);});this.notify();}
    private index?:ReturnType<NonNullable<typeof indexLifecycle>>;
    constructor(readonly root:string,initial:VaultDiscovery){
      this.listingSignal[1](initial);
      this.update(cacheListings?{vault:root,folders:[],documents:[],markdown:[],diagnostics:[],operations:[],readOnly:initial.readOnly,complete:false}:initial);
      this.verified=!cacheListings;
      this.index=indexLifecycle?.(root);void this.index?.refresh(true).then(()=>{if(this.alive)this.notify();});
    }
    snapshot=()=>this.snapshotSignal[0]()!;
    listing=()=>cacheListings?this.listingSignal[0]()!:this.snapshot();
    checking=()=>this.checkingSignal[0]();
    async ensureVerified(){if(!this.verified)await this.refresh();}
    private publishListing(value:VaultDiscovery) {
      const semantic=(scan:VaultDiscovery)=>JSON.stringify({folders:scan.folders,documents:scan.documents.map(({baseline,byteHash,...row})=>({...row,byteHash:byteHash??baseline?.nativeHash})),markdown:scan.markdown,other:scan.other??[],diagnostics:scan.diagnostics,operations:scan.operations,documentSaves:scan.documentSaves??[],complete:scan.complete});
      if(this.verified&&semantic(this.snapshot())!==semantic(value)){this.verified=false;this.update({...this.snapshot(),complete:false});}
      this.listingSignal[1](value);
    }
    async refreshListing(force=false,verify=false):Promise<void> {
      if(!cacheListings)return this.refresh(force);
      if(!this.alive)return;
      if(this.refreshWork)await this.refreshWork.catch(()=>{});
      if(!this.alive)return;
      if(this.listingWork){await this.listingWork;if((force||verify)&&this.alive)return this.refreshListing(force,verify);return;}
      this.listingController=new AbortController();this.checkingSignal[1](true);
      this.listingWork=(async()=>{try{
        const value:VaultDiscovery=await native.browseVault(this.root,verify?'verify':'reconcile',this.listingController!.signal);
        if(this.alive){this.publishListing(value);this.noticeSignal[1]('');}
        if(force)await this.index?.refresh(true);
      }catch(e){if(this.alive){this.noticeSignal[1]('Library refresh failed: '+String(e));this.verified=false;this.update({...this.snapshot(),complete:false});}throw e;}
      finally{this.listingWork=undefined;this.checkingSignal[1](false);}})();
      return this.listingWork;
    }
    signature=()=>this.signatureSignal[0]();
    busy=()=>this.busySignal[0]();
    notice=()=>this.noticeSignal[0]();
    operations=()=>{
      const rows=new Map(this.listing().operations.map(o=>[o.operationId,o]));
      for(const operationId of native.pendingVaultRelocations(this.root))rows.set(operationId,{operationId,phase:'pending'});
      return [...rows.values()];
    };
    async refresh(force=false) {
      if(!this.alive)return;
      if(this.listingWork)await this.listingWork.catch(()=>{});
      if(!this.alive)return;
      if(this.refreshWork)return this.refreshWork;
      this.controller=new AbortController();
      const indexWork=this.index?.refresh(force);
      this.refreshWork=(async()=>{try{const value:VaultDiscovery=await native.discoverVault(this.root,this.controller!.signal);if(force)await indexWork;if(this.alive){const unchanged=JSON.stringify(value)===this.signature();this.update(value);this.verified=true;this.listingSignal[1](value);if(force&&unchanged)this.notify();}}catch(e){if(this.alive){this.verified=false;this.noticeSignal[1](String(e));this.update({...this.snapshot(),complete:false,diagnostics:[...this.snapshot().diagnostics,{message:'Discovery refresh failed: '+String(e)}]});throw e;}}finally{this.refreshWork=undefined;}})();
      return this.refreshWork;
    }
    requireDirectory(folder:string) {
      if(!this.alive)throw new Error('Vault closed');
      if(folder!==this.root&&!this.listing().folders.includes(folder))throw new Error('Choose an existing directory in this vault');
    }
    requireListedFile(loc:VaultLocation) {
      const scan=this.listing();
      if(!scan.complete)throw new Error('Resolve incomplete vault discovery before opening a Document');
      this.requireDirectory(loc.folder);vaultLeaf(loc.filename);
      const rows=scan.documents.filter(d=>vaultPath(d.location)===vaultPath(loc));
      if(rows.length!==1||['ambiguous','unavailable','pending'].includes(rows[0].state))throw new Error('Document missing, pending or ambiguous; refresh the vault');
      return rows[0];
    }
    requireFile(loc:VaultLocation) {
      if(!this.snapshot().complete)throw new Error('Resolve incomplete vault discovery before opening a Document');
      this.requireDirectory(loc.folder);vaultLeaf(loc.filename);
      const rows=this.snapshot().documents.filter(d=>vaultPath(d.location)===vaultPath(loc));
      if(rows.length!==1||rows[0].state==='ambiguous')throw new Error('Document missing or ambiguous; refresh the vault');return rows[0];
    }
    /** Exact saved-result activation, followed by native byte/identity verification.
     * An unrelated unreadable file is not authority to reject this inspected file.
     * Cached listings and failed scans still cannot authorise admission. */
    requireSelectedFile(loc:VaultLocation) {
      if(!this.verified)throw new Error('Refresh discovery before opening a selected Document');
      this.requireDirectory(loc.folder);vaultLeaf(loc.filename);
      const scan=this.snapshot(),rows=scan.documents.filter(d=>vaultPath(d.location)===vaultPath(loc));
      if(rows.length!==1||!['paired','unenrolled'].includes(rows[0].state)||
        scan.documents.filter(d=>d.resourceId===rows[0].resourceId).length!==1||
        scan.operations.some(o=>o.phase==='pending')||
        scan.documentSaves?.some(s=>s.resourceId===rows[0].resourceId||s.path===vaultPath(loc)))
        throw new Error('Selected Document missing, pending or ambiguous; refresh the vault');
      return rows[0];
    }
    async mutate<T>(action:()=>Promise<T>, refreshTree=true) {
      if(!this.alive)throw new Error('Vault closed');
      if(this.busy())throw new Error('A vault operation is already active');
      if(this.snapshot().readOnly)throw new Error('This vault is read-only');
      this.busySignal[1](true);this.noticeSignal[1]('');
      try{if(this.snapshot().readOnly)throw new Error('This vault is read-only');const result=await action();return result;}catch(e){this.noticeSignal[1](String(e));throw e;}
      finally {try{if(this.alive&&(refreshTree||cacheListings)){await this.refreshWork?.catch(()=>{});await this.listingWork?.catch(()=>{});await this.refreshListing().catch(()=>{});}}finally{this.busySignal[1](false);}}
    }
    async relocate(kind:'pair'|'directory',source:string,destination:string) {
      await this.refresh(); // Relocation needs current baselines for every affected resource.
      return this.mutate(async()=>{
        const scan=this.snapshot();
        if(!scan.complete)throw new Error('Resolve incomplete or ambiguous vault discovery before relocation');
        if(!vaultContains(this.root,source)||!vaultContains(this.root,destination))throw new Error('Cross-vault moves are not supported');
        const resources=scan.documents.filter(d=>kind==='pair'?vaultPath(d.location)===source:vaultContains(source,vaultPath(d.location)));
        if(resources.some(d=>!d.baseline))throw new Error('Resource baseline unavailable');
        const result=await native.relocateVault({operationId:crypto.randomUUID(),vault:this.root,kind,source,destination,baselines:resources.map(d=>({resourceId:d.resourceId,baseline:d.baseline!}))});
        this.noticeSignal[1](result.phase==='relocated'?'Relocated. Existing Markdown links may retain the previous path.':`Relocation pending: ${result.error??'Recover the recorded operation'}`);
        return result;
      });
    }
    async recover(operationId:string) {
      return this.mutate(async()=>{const result=await native.recoverRelocation(operationId);this.noticeSignal[1](result.phase==='relocated'?'Recovery complete. Open the destination explicitly if it is not already bound.':`Recovery pending: ${result.error}`);return result;});
    }
    release(){if(--this.users===0){this.alive=false;this.controller?.abort();this.listingController?.abort();this.index?.dispose();this.notify();this.listeners.clear();entries.delete(this.root);}}
    isAlive=()=>this.alive;
    dispose(){this.alive=false;this.controller?.abort();this.listingController?.abort();this.index?.dispose();this.notify();this.listeners.clear();}
  }
  return {
    async acquire(input:string, signal?:AbortSignal):Promise<VaultLease> {
      signal?.throwIfAborted();
      const root=vaultRoot(input);check(root);
      let entry=entries.get(root);
      if(!entry){await native.establishVault(root,signal);const scan:VaultDiscovery=cacheListings?await native.browseVault(root,'cached',signal):await native.discoverVault(root,signal);signal?.throwIfAborted();check(scan.vault);entry=entries.get(scan.vault);if(!entry){entry=new VaultLease(scan.vault,scan);entries.set(scan.vault,entry);if(cacheListings&&scan.cached)void entry.refreshListing().catch(()=>{});}}
      entry.users++;return entry;
    },
    dispose(){disposed=true;for(const e of entries.values())e.dispose();entries.clear();},
  };
}
export type DocumentVaultLease = Awaited<ReturnType<ReturnType<typeof createDocumentVaults>['acquire']>>;
