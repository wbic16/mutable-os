/** Vault worker lifetime, verified saved reads and source-scoped canonical Entity requests. */
import { verifyDocumentSource, verifyEntityListingSource } from './recognized-source.mjs';
import { RecognizedDocumentStore } from './recognized-document-store.mjs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {stat} from 'node:fs/promises';
import { Router, json } from 'express';
import { openSqliteFoundation, runCardexRegex } from '../src/knowledge-sqlite/client.mjs';
import { entityCommand } from '../src/knowledge-sqlite/entities.mjs';
import { NativeVaultStore } from './native-vault-store.mjs';
import { createSavedIndexer } from './sqlite-saved-indexer';
import {SqliteSavedScopes} from './sqlite-saved-scope';
import { normalizePolicy, policyKey } from '../src/knowledge/policy';

const inside = (a:string,b:string) => a===b || b.startsWith(a+path.sep);
const unknown = (message:string) => ({state:'unknown',complete:false,diagnostics:[message]});
export class SqliteKnowledgeHost {
  readonly session=randomUUID(); readonly store:any;
  private entries=new Map<string,any>(); private leases=new Map<string,any>();
  private control=Promise.resolve(); private running?:Promise<void>; private timer?:ReturnType<typeof setTimeout>;
  private foregrounds=0; private foregroundTail=Promise.resolve(); private closed=false;
  readonly metrics={sweeps:0,cancellations:0,foregroundWaitMs:0,maxForegroundWaitMs:0};
  private semanticLeases=new Set<string>();
  private readers=new Map<string,{opening:Promise<any>;identity:string;active:number;timer?:ReturnType<typeof setTimeout>}>();
  constructor(private options:{root:string;readOnly?:boolean;entitiesEnabled?:boolean;semanticServicesEnabled?:boolean;thesisEnabled?:boolean;cardexEnabled?:boolean;verifyCardexImage?:(reference:any)=>Promise<void>;store?:any;open?:typeof openSqliteFoundation;indexer?:typeof createSavedIndexer;debounceMs?:number;leaseMs?:number}) {
    this.store=options.store??new NativeVaultStore({root:options.root,readOnly:!!options.readOnly});
  }
  private serialize<T>(action:()=>Promise<T>):Promise<T> {
    const work=this.control.then(action);this.control=work.then(()=>{},()=>{});return work;
  }
  /** Existence probe for the vault's knowledge store (never establishes
   * anything): the store is the Cavern phext in phext mode and the
   * disk home (.mutable/mutable.db) in native mode — either proves
   * an established Vault. */
  private async knowledgeProbe(vaultPath:string){
    const root=await this.store.resolve(vaultPath);
    try{ await stat(path.join(root,'cavern.phext')); return; }catch{ /* not the phext store */ }
    await stat(path.join(root,'.mutable','mutable.db'));
  }
  async acquire(vault:string,policy=normalizePolicy()) {
    return this.acquireContext(vault,policy);
  }
  private async acquireContext(vault:string,policy:ReturnType<typeof normalizePolicy>,establishment=false) {
    return this.serialize(async()=>{
      if(this.closed)throw Error('SQLite knowledge host closed');
      if(this.leases.size>=64)throw Error('SQLite lease budget exceeded');
      const root=await this.store.resolve(vault);
      for(const other of this.entries.keys())if(other!==root&&(inside(other,root)||inside(root,other)))throw Error('Overlapping SQLite vault already open');
      let e=this.entries.get(root);
      // Establishing persistence is policy-neutral. Reuse a warm context without
      // asking it to replace an application's explicitly selected extraction policy.
      const normalized=normalizePolicy(establishment&&e?e.policy:policy),key=policyKey(normalized);
      if(e&&e.policyKey!==key)throw Error('SQLite vault extraction policy differs; no automatic profile replacement');
      if(!e){
        if(this.entries.size>=8)throw Error('SQLite vault budget exceeded');
        e={root,vault,policy:normalized,policyKey:key,users:0,epoch:0,coverage:unknown('Current saved scope has not been verified'),pending:false,full:false};
        // Failed/missing/corrupt/read-only databases remain unavailable, never repaired by replacement.
        try{e.client=await (this.options.open??openSqliteFoundation)({vault:root,initialize:!this.options.readOnly,readOnly:!!this.options.readOnly,semanticServicesEnabled:this.options.semanticServicesEnabled!==false,thesisEnabled:this.options.thesisEnabled!==false});
          e.vaultGuid=(await e.client.inspect()).mutable.vaultGuid;
          e.index=(this.options.indexer??createSavedIndexer)(e.client,{root:this.options.root,vault,store:this.store,policy:normalized,protect:this.protect});
        }catch(error){await e.client?.close().catch(()=>{});e.client=undefined;throw error;}
        this.entries.set(root,e);
        if(e.client&&!this.options.readOnly)this.enqueue(e,false);
      }
      const lease=randomUUID(),l={entry:e,timer:undefined};e.users++;this.leases.set(lease,l);this.renew(lease,l);
      return {lease,...this.snapshot(e)};
    });
  }
  async establish(vault:string){const opened=await this.acquireContext(vault,normalizePolicy(),true);try{if(!opened.vaultGuid)throw Error('Mutable Vault infrastructure unavailable');return {vault:opened.vault,vaultGuid:opened.vaultGuid};}finally{await this.release(opened.lease);}}
  private renew(token:string,l:any){clearTimeout(l.timer);l.timer=setTimeout(()=>{void this.release(token).catch(()=>{});},this.options.leaseMs??600000);l.timer.unref?.();}
  private entry(token:string){if(this.closed)throw Error('SQLite knowledge host closed');const l=this.leases.get(token);if(!l)throw Error('SQLite lease expired');this.renew(token,l);return l.entry;}
  private snapshot(e:any){return {session:this.session,vault:e.vault,vaultGuid:e.vaultGuid,epoch:e.epoch,readOnly:!!this.options.readOnly,pending:!!e.pending||this.active===e,coverage:structuredClone(e.coverage)};}
  private invalidate(e:any,message:string){e.epoch++;e.fence=undefined;e.coverage=unknown(message);}
  private enqueue(e:any,full:boolean){if(this.closed||!e.client||this.options.readOnly)return;this.invalidate(e,'Saved reconciliation pending');e.pending=true;e.full ||= full;this.schedule();}
  private schedule(){if(this.closed||this.foregrounds||this.timer||this.running)return;this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},this.options.debounceMs??100);this.timer.unref?.();}
  // Only this short section, never the background CPU operation, blocks foreground storage.
  private critical?:Promise<any>;
  private protect=(action:()=>Promise<any>,signal?:AbortSignal):Promise<any>=>{
    signal?.throwIfAborted();
    if(this.foregrounds||this.closed)throw Error('Background storage superseded');
    const work=this.store.lock(async()=>{signal?.throwIfAborted();return action();});
    this.critical=work;
    return work.finally(()=>{if(this.critical===work)this.critical=undefined;});
  };
  private active?:any; private controller?:AbortController;
  /** Internal drain used by explicit reconciliation and qualification, never by typing. */
  async flush():Promise<void>{
    clearTimeout(this.timer);this.timer=undefined;
    if(this.running)return this.running;
    if(this.closed)return;
    if(this.foregrounds){await this.foregroundTail;return this.flush();}
    const run=async()=>{
      while(!this.closed&&!this.foregrounds){
        const e=[...this.entries.values()].find(e=>e.pending&&e.users>0);if(!e)break;
        e.pending=false;const full=e.full;e.full=false;const epoch=e.epoch;
        this.active=e;const controller=this.controller=new AbortController();
        try{
          this.metrics.sweeps++;const r=await e.index.refresh({mode:full?'full':'incremental',signal:controller.signal});controller.signal.throwIfAborted();
          if(epoch!==e.epoch)throw Error('Reconciliation superseded');
          const status=await e.client.indexStatus();controller.signal.throwIfAborted();
          if(epoch!==e.epoch)throw Error('Reconciliation superseded');
          e.epoch++;e.fence=r.complete?r.scopeFence:undefined;e.sqlRevision=r.sqlRevision;
          e.coverage={state:r.complete&&!status.incompleteResources&&!status.issueCount?'complete':'incomplete',complete:!!r.complete&&!status.incompleteResources&&!status.issueCount,
            resources:status.resources,incompleteResources:status.incompleteResources,issueCount:status.issueCount,
            diagnostics:[...r.issues.map((x:any)=>x.message),...status.issues.map((x:any)=>x.reason)].slice(0,32)};
        }catch(error){this.invalidate(e,String(error));if(controller.signal.aborted){this.metrics.cancellations++;e.full ||= full;}}
        finally{this.active=undefined;this.controller=undefined;}
      }
    };
    this.running=run();try{await this.running;}finally{this.running=undefined;if([...this.entries.values()].some(e=>e.pending))this.schedule();}
  }
  async status(token:string){
    const e=this.entry(token),epoch=e.epoch;
    if(e.fence){try{await e.client.indexStatus();if(await this.store.readScopeFence(e.vault)!==e.fence&&epoch===e.epoch)this.invalidate(e,'Saved scope changed; Refresh required');}
      catch(error){if(epoch===e.epoch)this.invalidate(e,String(error));}}
    return this.snapshot(e);
  }
  private savedScopes?:SqliteSavedScopes;
  /** Read evidence only: never refreshes, enrolls or acknowledges a save. */
  async knowledgeEvidence(token:string,signal?:AbortSignal){
    signal?.throwIfAborted();const e=this.entry(token),epoch=e.epoch;
    await this.status(token);signal?.throwIfAborted();
    if(!e.client||!e.fence||epoch!==e.epoch||e.pending||this.active===e)throw Error('SQL saved scope unknown or incomplete; Refresh required');
    const revision=await e.client.knowledgeRevision();signal?.throwIfAborted();
    if(epoch!==e.epoch||!e.fence||revision!==e.sqlRevision)throw Error('SQL saved scope superseded');
    return {session:this.session,indexEpoch:epoch,revision,vault:e.vault,policy:e.policyKey,coverage:structuredClone(e.coverage)};
  }
  async readKnowledge(token:string,proof:any,request:any,signal?:AbortSignal){
    const validate=async()=>{const now=await this.knowledgeEvidence(token,signal);if(now.session!==proof.session||now.indexEpoch!==proof.indexEpoch||now.revision!==proof.revision||now.policy!==proof.policy)throw Error('SQL read evidence superseded');};
    await validate();const result=await this.entry(token).client.readKnowledge({...request,revision:proof.revision},signal);await validate();return result;
  }
  /** Canonical Entity authority is separate from saved-index coverage. Source context
   * must still name one currently verified native resource in this vault. */
  async entities(body:any,signal?:AbortSignal){
    if(typeof body.request?.op==='string'&&(body.request.op.startsWith('pdf-')||body.request.op.startsWith('resource-')||body.request.op.startsWith('scholarly-')||body.request.op.startsWith('iiif-')||body.request.op.startsWith('wiki-')))throw Error('Use the scoped academic application service');
    let dispatched=false;
    try {
    if(this.options.entitiesEnabled===false)throw Error('Canonical Entity service is disabled');
    const e=this.entry(body.lease), source=body.source;
    if(!e.client||!source||typeof source.resourceId!=='string'||!source.location||typeof source.byteHash!=='string')throw Error('Verified native source context required');
    const listing=['names','db-mentions','search','current'].includes(body.request?.op);
    if(listing)await verifyEntityListingSource(this.store,e.vault,source,signal);
    else await verifyDocumentSource(this.store,e.vault,source,signal);
    if(await new RecognizedDocumentStore(this.store).pending(e.vault,source.resourceId))throw Error('Document Save recovery is pending');
    signal?.throwIfAborted();
    const mutation=['create','rename','update','alias-add','alias-update','alias-remove','relationship-create','relationship-update'].includes(body.request?.op);
    if(mutation&&this.options.readOnly)throw Error('Canonical Entity storage is read-only');
    try{dispatched=true;return await e.client.entities(body.request,signal);}
    finally {if(mutation)this.enqueue(e,false);}
    }catch(error){if(!dispatched&&body.request?.op==='create')throw Object.assign(new Error(String(error)),{entityCreationOutcome:'not-created'});throw error;}
  }
  /** Explicit Entity edits belong to the selected Vault, not the source file.
   * Keep one audited writer and give the commit priority over saved indexing. */
  async entityMutate(body:any,signal?:AbortSignal){
    let dispatched=false;
    try{
      if(this.closed||this.options.entitiesEnabled===false)throw Error('Canonical Entity service is unavailable');
      if(this.options.readOnly)throw Error('Canonical Entity storage is read-only');
      if(typeof body.vault!=='string'||!['authority-import','create','rename','update','alias-add','alias-update','alias-remove'].includes(body.request?.op))throw Error('Invalid Entity mutation');
      signal?.throwIfAborted();
      // Do not establish a new Vault as a side effect of choosing a name.
      await this.knowledgeProbe(body.vault);
      return await this.foreground(async()=>{
        const opened=await this.acquireContext(body.vault,normalizePolicy(body.policy),true);
        try{
          signal?.throwIfAborted();
          const e=this.entry(opened.lease);if(!e.client)throw Error('Canonical Entity storage is unavailable');
          dispatched=true;
          return await e.client.entities(body.request,signal);
        }finally{await this.release(opened.lease);}
      });
    }catch(error){
      if(!dispatched&&body.request?.op==='create')throw Object.assign(new Error(String(error)),{entityCreationOutcome:'not-created'});
      throw error;
    }
  }
  async cardex(body:any,signal?:AbortSignal){
    if(this.closed||this.options.cardexEnabled===false||this.options.entitiesEnabled===false)throw Error('Cardex is unavailable');
    if(typeof body.vault!=='string')throw Error('Select a Vault');
    if((['save','delete','restore','bulk-state'].includes(body.request?.op)||body.request?.op==='semantic'&&body.request?.command?.op!=='get')&&this.options.readOnly)throw Error('Cardex is read-only');
    if(body.request?.op==='save'&&body.request.imageRef){if(!this.options.verifyCardexImage)throw Error('Managed image storage unavailable');await this.options.verifyCardexImage(body.request.imageRef);}
    await this.knowledgeProbe(body.vault);
    if(body.request?.op==='search'&&body.request.filters?.mode==='regex'){
      // Phext-only: there is no on-disk mutable.db. Run the regex
      // against the writer foundation's ephemeral replica, holding
      // the foreground lease so the replica outlives the search.
      return this.foreground(async()=>{const opened=await this.acquireContext(body.vault,normalizePolicy(body.policy),true);try{signal?.throwIfAborted();const file=await this.entry(opened.lease).client!.knowledgeCacheFile();if(!file)throw Error('Cardex regex search unavailable');return await runCardexRegex(file,body.request,signal);}finally{await this.release(opened.lease);}});
    }
    return this.foreground(async()=>{const opened=await this.acquireContext(body.vault,normalizePolicy(body.policy),true);try{signal?.throwIfAborted();return await this.entry(opened.lease).client!.cardex(body.request,signal);}finally{await this.release(opened.lease);}});
  }
  async propositions(body:any,signal?:AbortSignal){
    if(this.closed||this.options.thesisEnabled===false)throw Error('Thesis is unavailable');
    if(typeof body.vault!=='string')throw Error('Select a Vault');
    if(body.request?.op==='entities'&&this.options.entitiesEnabled===false)throw Error('Canonical Entity service is unavailable');
    if(body.request?.source&&body.request.source.vault!==body.vault)throw Error('Proposition source Vault differs from the selected Vault');
    const mutation=['create','update','archive','restore'].includes(body.request?.op);
    if(mutation&&this.options.readOnly)throw Error('Thesis is read-only');
    // Selecting Thesis does not establish another Vault implicitly.
    await this.knowledgeProbe(body.vault);
    return this.foreground(async()=>{
      const opened=await this.acquireContext(body.vault,normalizePolicy(body.policy),true);
      try{signal?.throwIfAborted();const e=this.entry(opened.lease);if(!e.client)throw Error('Thesis storage unavailable');return await e.client.propositions(body.request,signal);}
      finally{await this.release(opened.lease);}
    });
  }
  /** Host-internal scholarly operations; the authenticated application host binds the Vault. */
  async academic(request:any,signal?:AbortSignal){
    if(this.closed||this.options.entitiesEnabled===false||this.options.readOnly)throw Error('Scholarly storage unavailable');
    if(!['deterministic-review','pdf-snapshot','pdf-commit','resource-context','resource-review','iiif-snapshot','iiif-associated','iiif-commit','scholarly-lookup','scholarly-commit','scholarly-backlinks','wiki-snapshot','wiki-context','wiki-commit','wiki-review'].includes(request?.op))throw Error('Invalid scholarly operation');
    await this.knowledgeProbe('.');
    return this.foreground(async()=>{
      const opened=await this.acquireContext('.',normalizePolicy(undefined),true);
      try{signal?.throwIfAborted();return await this.entry(opened.lease).client!.entities(request,signal);}
      finally{await this.release(opened.lease);}
    });
  }
  /** Selector reads are vault-scoped, not Document/Save operations. A separate
   * read-only connection keeps them out of the writer's reconciliation queue. */
  async entityLookup(body:any,signal?:AbortSignal,archive=false){
    if(this.closed || this.options.entitiesEnabled===false)throw Error('Canonical Entity service is unavailable');
    if(typeof body.vault!=='string' || !(archive || ['search','get','authority-lookup'].includes(body.request?.op)))throw Error('Invalid Entity lookup');
    signal?.throwIfAborted();
    const root=await this.store.resolve(body.vault);
    // Phext mode: derived rows (document Blocks/StandoffProperties) are
    // ephemeral — they live only in the open Vault worker's replica,
    // rebuilt by reconciliation, and are never canonical store records.
    // A read-only reader replica therefore cannot see saved mentions at
    // all. When the Vault is open, its live worker is the only correct
    // lookup target; the reader path below serves unopened Vaults
    // (canonical names/aliases/get — mentions report as unindexed).
    if(!archive){const live=this.entries.get(root);if(live?.client)return await live.client.entityLookup(body.request,signal);}
    // Reader identity tracks the vault's knowledge store file —
    // the phext in phext mode, the disk database in native mode.
    let file=path.join(root,'cavern.phext');
    try{ await stat(file); }catch{ file=path.join(root,'.mutable','mutable.db'); }
    const stamp=await stat(file),identity=`${stamp.dev}:${stamp.ino}`;
    let reader=this.readers.get(root);
    if(reader && reader.identity!==identity){
      if(reader.active)throw Error('Entity database replaced; retry');
      clearTimeout(reader.timer);this.readers.delete(root);await reader.opening.then(c=>c.close(),()=>{});reader=undefined;
    }
    if(!reader){
      if(this.readers.size>=8)throw Error('Entity reader Vault limit reached');
      reader={identity,active:0,opening:openSqliteFoundation({vault:root,readOnly:true,entityReader:true,timeoutMs:5000})};
      this.readers.set(root,reader);
    }
    clearTimeout(reader.timer);reader.active++;
    try{
      const client=await reader.opening;
      signal?.throwIfAborted();if(this.closed)throw Error('Entity reader closed');
      return archive ? await client.packageData(body.request,signal) : await client.entityLookup(body.request,signal);
    }catch(error){
      // Failed opens/timeouts can be retried on a new reader. Never replay a write.
      if(!signal?.aborted&&this.readers.get(root)===reader){this.readers.delete(root);void reader.opening.then(c=>c.close(),()=>{}).catch(()=>{});}
      throw error;
    }finally{
      if(--reader.active===0 && this.readers.get(root)===reader){
        const idle=reader;
        reader.timer=setTimeout(()=>{if(this.readers.get(root)===idle){this.readers.delete(root);void idle.opening.then(c=>c.close(),()=>{}).catch(()=>{});}},300000);
        reader.timer.unref?.();
      }
    }
  }
  async refresh(token:string,full=false){
    const e=this.entry(token);if(this.options.readOnly)throw Error('SQLite reconciliation is read-only');
    if(!e.client)throw Error('SQLite unavailable; close and reopen the vault to retry');
    this.enqueue(e,full);await this.flush();return this.status(token);
  }
  /** Selected-vault semantic authoring capability, independent of a Document UI source. */
  async openSemantics(vault:string,policy=normalizePolicy()){
    if(this.options.semanticServicesEnabled===false)throw Error('Semantic services are disabled');
    const opened=await this.acquireContext(vault,policy);this.semanticLeases.add(opened.lease);return opened;
  }
  private semanticEntry(body:any){
    if(this.options.semanticServicesEnabled===false)throw Error('Semantic services are disabled');
    if(!this.semanticLeases.has(body.lease))throw Error('Semantic vault capability required');
    const e=this.entry(body.lease);if(!e.client||body.vaultGuid!==e.vaultGuid)throw Error('Semantic vault identity mismatch');return e;
  }
  async semantics(body:any,signal?:AbortSignal){
    const e=this.semanticEntry(body),request=body.request;
    if(request?.op==='resolve-evidence')return this.resolveEvidence(body,signal);
    const mutation=['create','add','update','remove','batch','rename','alias-add','alias-update','alias-remove','relationship-create','relationship-update'].includes(request?.op);
    if(mutation&&this.options.readOnly)throw Error('Canonical semantic storage is read-only');
    signal?.throwIfAborted();
    try{
      const result=request?.recordType==='Entity'||request?.recordType==='Relationship'?
        await e.client.entities(entityCommand(request),signal):await e.client.semantics(request,signal);
      return {...result,session:this.session,vaultGuid:e.vaultGuid};
    }finally{if(mutation)this.enqueue(e,false);}
  }
  async semanticAudit(body:any,signal?:AbortSignal){
    const e=this.semanticEntry(body);signal?.throwIfAborted();
    if(body.op==='status')return e.client.auditStatus();
    if(body.op==='outcome')return e.client.operationOutcome(body.operationId);
    if(body.op!=='deliver')throw Error('Unsupported semantic audit operation');
    if(this.options.readOnly)throw Error('Audit delivery is read-only');
    try{return await e.client.deliverAudit(body.options??{},signal);}finally{this.enqueue(e,false);}
  }
  private async resolveEvidence(body:any,signal?:AbortSignal){
    const e=this.semanticEntry(body),result=await e.client.semantics({op:'get',recordType:'ClaimEvidence',guid:body.request.guid},signal),record=result.record;
    if(!record)return {status:'missing',diagnostics:['Claim evidence missing'],revision:result.revision};
    if(!body.source?.location||typeof body.source.byteHash!=='string')return {status:'not-verified',record,diagnostics:['Current Document source proof required'],revision:result.revision};
    try{
      const verified=await verifyDocumentSource(this.store,e.vault,{...body.source,resourceId:record.resourceGuid},signal);
      const resolution=await e.client.evidenceSource({vaultGuid:e.vaultGuid,bytes:verified.bytes,evidence:record},signal);
      const now=await e.client.knowledgeRevision();if(now!==result.revision)throw Error('Evidence canonical snapshot changed');
      await verifyDocumentSource(this.store,e.vault,{...body.source,resourceId:record.resourceGuid},signal);
      return {...resolution,record,revision:result.revision};
    }catch(error){signal?.throwIfAborted();return {status:/ENOENT/.test(String(error))?'missing':'unresolved',record,diagnostics:[String(error)],revision:result.revision};}
  }
  /** Foreground routes retain all save/admission/locking authority. A notification is only a wakeup. */
  async foreground<T>(action:()=>Promise<T>):Promise<T>{
    this.foregrounds++;clearTimeout(this.timer);this.timer=undefined;this.controller?.abort(Error('Foreground storage operation'));
    for(const e of this.entries.values())this.invalidate(e,'Storage operation pending');
    const previous=this.foregroundTail;let done:()=>void;this.foregroundTail=new Promise<void>(r=>{done=r;});
    const start=performance.now();
    try{await previous;await this.critical?.catch(()=>{});const wait=performance.now()-start;this.metrics.foregroundWaitMs+=wait;this.metrics.maxForegroundWaitMs=Math.max(this.metrics.maxForegroundWaitMs,wait);return await action();}
    finally{done!();this.foregrounds--;for(const e of this.entries.values())this.enqueue(e,false);this.schedule();}
  }
  async release(token:string){
    this.semanticLeases.delete(token);
    return this.serialize(async()=>{const l=this.leases.get(token);if(!l)return {released:true};clearTimeout(l.timer);this.leases.delete(token);const e=l.entry;
      if(--e.users===0){e.pending=false;if(this.active===e){this.controller?.abort(Error('Vault lease closed'));await this.running;}this.entries.delete(e.root);await e.client?.close();}
      return {released:true};});
  }
  async close(){this.closed=true;this.savedScopes?.close();clearTimeout(this.timer);this.controller?.abort(Error('Host shutdown'));await this.control;await this.foregroundTail;await this.running;
    for(const r of this.readers.values()){clearTimeout(r.timer);await r.opening.then(c=>c.close(),()=>{});}this.readers.clear();
    for(const l of this.leases.values())clearTimeout(l.timer);this.leases.clear();for(const e of this.entries.values())await e.client?.close();this.entries.clear();}
  router(){
    const router=Router();router.use(json({limit:'32kb'}));
    this.savedScopes??=new SqliteSavedScopes(this);router.use('/facts',this.savedScopes.router());
    for(const [name,action]of Object.entries({
      'semantic-open':(b:any,_s?:AbortSignal)=>this.openSemantics(b.vault,b.policy),
      cardex:(b:any,s?:AbortSignal)=>this.cardex(b,s),
      propositions:(b:any,s?:AbortSignal)=>this.propositions(b,s),
      semantics:(b:any,s?:AbortSignal)=>this.semantics(b,s),
      'semantic-audit':(b:any,s?:AbortSignal)=>this.semanticAudit(b,s)
    }))router.post('/'+name,async(req,res)=>{
      const c=new AbortController(),cancel=()=>{if(!res.writableEnded)c.abort(Error('Semantic request disconnected'));};req.on('aborted',cancel);res.on('close',cancel);
      try{const data=await action(req.body??{},c.signal);if(!c.signal.aborted)res.json({Success:true,Data:data});}
      catch(error){if(!c.signal.aborted)res.status(409).json({Success:false,Error:String(error),outcome:'unknown-after-dispatch'});}
      finally{req.off('aborted',cancel);res.off('close',cancel);}
    });
    for(const route of ['entities','entity-lookup','entity-mutate','package-data'])router.post('/'+route,async(req,res)=>{const c=new AbortController();const cancel=()=>{if(!res.writableEnded)c.abort(Error('Entity request disconnected'));};req.on('aborted',cancel);res.on('close',cancel);
      try{const data=await (route==='entities'?this.entities(req.body??{},c.signal):route==='entity-mutate'?this.entityMutate(req.body??{},c.signal):this.entityLookup(req.body??{},c.signal,route==='package-data'));if(!c.signal.aborted)res.json({Success:true,Data:data});}
      catch(error){if(!c.signal.aborted)res.status(409).json({Success:false,Error:String(error),...((error as any)?.entityCreationOutcome==='not-created'?{entityCreationOutcome:'not-created'}:{})});}
      finally{req.off('aborted',cancel);res.off('close',cancel);}
    });
    for(const [name,action]of Object.entries({open:(b:any)=>this.acquire(b.vault,b.policy),status:(b:any)=>this.status(b.lease),refresh:(b:any)=>this.refresh(b.lease,b.full===true),release:(b:any)=>this.release(b.lease)}))
      router.post('/'+name,async(req,res)=>{try{res.json({Success:true,Data:await action(req.body??{})});}catch(error){res.status(409).json({Success:false,Error:String(error)});}});
    return router;
  }
}
