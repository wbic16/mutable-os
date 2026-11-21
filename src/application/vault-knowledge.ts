import {contentLength,contentSlice} from '../block-tree/inline-sequence';
import {policyKey} from '../knowledge/policy';
import {retrievalRequest} from './retrieval-client';
import {graphemeBoundaries} from '../input/graphemes';
import type { FactsQueryProvider, SavedSourceEvidence } from './facts-query-provider';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { NativeDocumentSession } from '../persistence/native-session';
import type { DocumentVaultLease } from './document-vault';
import { vaultPath, vaultContains } from './document-vault';
import { documentRootPlacements } from '../block-tree/resource-registration';
import { linkedDefinitionOwner, linkedRegistry, resolveLinkedProperty } from '../block-tree/linked-annotations';
import type { ContentRecord, JsonObject } from '../block-tree/types';
import type { BlockTreeProjection } from '../block-tree/projection';
import type { TextRangeSnapshot } from '../runtime/text-ranges';
import { canonicalSearchSource } from '../runtime/canonical-search-source';
import { runSearchWorker, type SearchRunner } from '../runtime/search-worker';
import type { SearchSource } from '../runtime/search-matching';
import type { ApplicationKnowledge, DocumentTarget, NativeReferenceItem, VaultSearchHit, VaultSearchResults } from '../feature-api/document-application';

type Source = DocumentTarget & {contentKey:string; placement:string};
type Stamp = {derivedCurrent?:()=>void; vault:DocumentVaultLease; signature:string; revision:number};
type Passage = {contentKey?:string; blockId:string; start:number; end:number; coordinate:'cell'|'utf16'};
type Selection = Stamp & {id:string; viewId:string; ranges:TextRangeSnapshot[]};
type Reference = Stamp & {source:Source; contentKey:string; property:JsonObject; index:number; target?:DocumentTarget; removable:boolean};
export interface KnowledgeHost {
  vault():DocumentVaultLease;
  active():{documentId:string; projection:BlockTreeProjection}|undefined;
  activateSaved?(target:DocumentTarget,passage:Passage|undefined,evidence:SavedSourceEvidence,current:()=>boolean,query:string):Promise<void>;
  navigate(target:DocumentTarget, passage:Passage|undefined, current:()=>boolean, verify?:()=>Promise<void>):Promise<void>;
  guard():void;
}
const pause=()=>new Promise<void>(r=>setTimeout(r,0));
/** A bounded query session, never an index or an owner of resources/occurrences. */
export class VaultKnowledge implements ApplicationKnowledge {
  private controller?:AbortController;
  private live=true;
  private searchToken?:string;
  private referenceToken?:string;
  private referenceDocument?:string;
  private batches=new Map<string,Stamp>();
  private hits=new Map<string,{stamp:Stamp; target:DocumentTarget; passage?:Passage;saved?:SavedSourceEvidence;query?:string}>();
  private selections=new Map<string,Selection>();
  private mentions=new Map<string,Reference>();
  constructor(private editor:ReactiveEditor,private native:NativeDocumentSession,private host:KnowledgeHost,private runner:SearchRunner=runSearchWorker, private derived?:FactsQueryProvider) {}
  private stamp(vault:DocumentVaultLease):Stamp {return {vault,signature:vault.signature(),revision:this.editor.repository.state.revision};}
  private valid(stamp:Stamp) {
    if (!(this.live && this.host.vault()===stamp.vault && stamp.signature===stamp.vault.signature() && stamp.revision===this.editor.repository.state.revision && !this.native.pendingVaultRelocations(stamp.vault.root).length)) return false;
    try {stamp.derivedCurrent?.();return true;} catch {return false;}
  }
  private require(stamp:Stamp) {this.host.guard();if(!this.valid(stamp))throw new Error('This query or selection is stale. Search or select again.');}
  current=(token:string)=>{try {const s=this.batches.get(token);return !!s&&this.valid(s)&&(token!==this.referenceToken||this.host.active()?.documentId===this.referenceDocument);}catch{return false;}};
  cancel=()=>{this.controller?.abort();this.controller=undefined;this.hits.clear();if(this.searchToken)this.batches.delete(this.searchToken);};
  dispose(){this.live=false;this.cancel();this.batches.clear();this.selections.clear();this.mentions.clear();}
  private scope(vault:DocumentVaultLease) {
    const scan=vault.snapshot(), state=this.editor.repository.readState(), diagnostics=scan.diagnostics.map(d=>`${d.path??d.resourceId??''}: ${d.message}`), sources:Source[]=[];
    const documents=Object.values(state.contents).filter(c=>c.viewType==='document-block');
    if(!scan.complete){diagnostics.push('Discovery is incomplete; unique vault identity cannot be established. Refresh after resolving diagnostics.');return {sources,diagnostics,discovered:scan.documents.length};}
    for(const c of documents){const id=String((c.payload.metadata as any)?.documentId??c.payload.id),bound=this.native.location(id);if(bound&&vaultContains(vault.root,vaultPath(bound))&&!scan.documents.some(d=>d.resourceId===id&&vaultPath(d.location)===vaultPath(bound)))diagnostics.push(`${vaultPath(bound)}: unsaved or missing loaded binding; not searched.`);}
    for(const row of scan.documents){
      const matches=documents.filter(c=>((c.payload.metadata as any)?.documentId??c.payload.id)===row.resourceId),bound=this.native.location(row.resourceId);
      const owners=matches.length===1?documentRootPlacements(state,matches[0].key):[];
      if(matches.length!==1||owners.length!==1||!bound||vaultPath(bound)!==vaultPath(row.location)||!['paired','unenrolled'].includes(row.state)) {
        diagnostics.push(`${vaultPath(row.location)}: ${matches.length>1||owners.length>1?'ambiguous':!matches.length?'unopened':'unavailable or conflicting binding'}; not searched.`);continue;
      }
      if(sources.length===200){diagnostics.push('Coverage limited to 200 available Documents.');break;}
      const c=matches[0];sources.push({documentId:row.resourceId,blockId:String(c.payload.id),title:String((c.payload.metadata as any)?.title??row.title??'Untitled'),location:vaultPath(row.location),contentKey:c.key,placement:owners[0].key});
    }
    return {sources,diagnostics,discovered:scan.documents.length};
  }
  private async blocks(source:Source,diagnostics:string[],signal?:AbortSignal) {
    const state=this.editor.repository.readState(),result:ContentRecord[]=[],seen=new Set<string>(),queue=[source.placement];let count=0;
    while(queue.length){
      if(++count>5000){diagnostics.push(`${source.title}: Block traversal limited to 5,000 entries.`);break;}
      if(count%64===0){await pause();signal?.throwIfAborted();}
      const key=queue.pop()!,p=state.placements[key],c=p&&state.contents[p.contentKey];
      if(!p||!c){diagnostics.push(`${source.title}: unresolved authored content omitted.`);continue;}
      if(key!==source.placement&&(p.kind==='reference'||p.externalReference||p.resolvedReference||c.viewType==='document-block')){diagnostics.push(`${source.title}: separate Document/reference body omitted.`);continue;}
      if(seen.has(c.key))continue;seen.add(c.key);
      const textual=['standoff-editor-block','plain-text-block','text-block'].includes(c.viewType);
      if(textual)result.push(c);
      else if(typeof c.payload.text==='string'&&c.payload.text || this.editor.registry.hasCapability(c.viewType,'opaque-widget') || c.viewType.endsWith('-application-block')){diagnostics.push(`${source.title}: unsupported hosted text (${c.viewType}) omitted.`);continue;}
      queue.push(...[...c.children,...Object.entries(c.ownedRelations).sort(([a],[b])=>a.localeCompare(b)).map(([,k])=>k)].reverse());
    }
    return result;
  }
  search=async(query:string):Promise<VaultSearchResults>=>{
    this.host.guard();this.cancel();const controller=new AbortController();this.controller=controller;
    const vault=this.host.vault();if(!this.derived?.progressive)await vault.refresh();else await vault.ensureVerified();controller.signal.throwIfAborted();
    const stamp=this.stamp(vault),token=crypto.randomUUID(),scope=this.derived?undefined:this.scope(vault),diagnostics=scope?.diagnostics??[];
    const stop=this.editor.repository.subscribeChanges(()=>controller.abort());
    const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      if(query.length>256)throw new Error('Search text is limited to 256 characters');
      if(this.derived){
        const result=await this.derived.search(vault,query,controller.signal,this.runner);this.require(stamp);controller.signal.throwIfAborted();
        stamp.derivedCurrent=result.current;
        const hits=result.hits.map(value=>{
          const id=crypto.randomUUID(),{target,coordinate,evidence, ...rest}=value;
          this.hits.set(id,{stamp,target,saved:evidence,query,passage:value.kind==='text'?{blockId:value.blockId,start:value.start,end:value.end,coordinate}:undefined});
          return Object.freeze({id,...target,...rest});
        });
        this.searchToken=token;this.batches.set(token,stamp);
        return Object.freeze({savedProvider:result.savedProvider,...(this.derived.progressive?{coverageMode:'saved-and-live' as const}:{}),token,hits:Object.freeze(hits),diagnostics:Object.freeze(result.diagnostics),available:result.sources.length,discovered:result.discovered,complete:!result.diagnostics.length});
      }

      const inputs:SearchSource[]=[],locators=new Map<string,{target:Source;content?:ContentRecord}>();let cells=0,units=0,blocks=0;
      if(query.trim())outer:for(const doc of scope!.sources){
        this.require(stamp);controller.signal.throwIfAborted();
        if(doc.title.length>10000)diagnostics.push(`${doc.title.slice(0,40)}: title truncated to 10,000 characters.`);
        const titleKey=`title:${doc.contentKey}`;inputs.push({contentKey:titleKey,version:stamp.revision,coordinate:'utf16',runs:[{text:doc.title.slice(0,10000)}]});locators.set(titleKey,{target:doc});
        for(const c of await this.blocks(doc,diagnostics,controller.signal)){
          cells+=contentLength(c);if(++blocks>5000||cells>250000){diagnostics.push('Search limited to 5,000 text Blocks / 250,000 Cells.');break outer;}
          let input:SearchSource;try{input=await canonicalSearchSource(this.editor.repository.readState(),c.key,stamp.revision,controller.signal,2_000_000-units);}catch(e){if((e as Error).message.includes('budget')){diagnostics.push('Native text exceeds the 2,000,000-character search budget.');break outer;}throw e;}
          units+=input.runs.reduce((n,r)=>n+r.text.length,0);inputs.push(input);locators.set(c.key,{target:doc,content:c});
        }
      }
      const matches=inputs.length?await this.runner(inputs,query,{},controller.signal):[];
      this.require(stamp);controller.signal.throwIfAborted();const hits:VaultSearchHit[]=[];
      outer:for(const source of matches){const locator=locators.get(source.contentKey)!;
        if(source.truncated)diagnostics.push('Matching was truncated; narrow the query.');
        for(const match of source.matches){
          if(!match.actionable){diagnostics.push('A match splitting a grapheme was omitted; search for the complete character.');continue;}
          if(hits.length===1000){diagnostics.push('Results limited to 1,000 passages.');break outer;}
          const id=crypto.randomUUID(),c=locator.content,hit:VaultSearchHit={id,...locator.target,blockId:c?String(c.payload.id):locator.target.blockId,kind:c?'text':'title',snippet:match.context,start:match.start,end:match.end};
          // Public results carry authored identities, never projection/DOM keys.
          const {contentKey:_c,placement:_p,...publicHit}=hit as VaultSearchHit & Source;hits.push(Object.freeze(publicHit));
          this.hits.set(id,{stamp,target:locator.target,passage:c?{contentKey:c.key,blockId:String(c.payload.id),start:match.start,end:match.end,coordinate:c.inlineKind==='standoff'?'cell':'utf16'}:undefined});
        }
      }
      this.searchToken=token;this.batches.set(token,stamp);return Object.freeze({token,hits:Object.freeze(hits),diagnostics:Object.freeze([...new Set(diagnostics)]),available:scope!.sources.length,discovered:scope!.discovered,complete:diagnostics.length===0});
    } finally {clearTimeout(timeout);stop();}
  };
  private async refresh(stamp:Stamp){this.require(stamp);await stamp.vault.refresh();this.require(stamp);}
  private target(value:DocumentTarget,vault:DocumentVaultLease) {
    const scope=this.scope(vault),found=scope.sources.filter(s=>s.documentId===value.documentId);
    if(found.length!==1)throw new Error('Target is unavailable in this vault. Explicitly Open it and try again.');
    return found[0];
  }
  prepareReferences=async()=>{
    this.host.guard();const vault=this.host.vault(),active=this.host.active(),revision=this.editor.repository.state.revision;
    await vault.ensureVerified();this.host.guard();
    if(!this.live||this.host.vault()!==vault||this.host.active()?.projection!==active?.projection||this.editor.repository.state.revision!==revision)throw Error('Source changed while preparing references; select the text again.');
  };
  activate=async(id:string)=>{
    const hit=this.hits.get(id);if(!hit)throw new Error('Search result expired');
    if(hit.saved){if(!this.host.activateSaved)throw Error('Saved result Open unavailable');return this.host.activateSaved(hit.target,hit.passage,hit.saved,()=>this.hits.get(id)===hit&&this.valid(hit.stamp),hit.query!);}
    await this.refresh(hit.stamp);if(this.hits.get(id)!==hit)throw new Error('Search result expired');
    const target=this.target(hit.target,hit.stamp.vault);if(target.blockId!==hit.target.blockId||target.location!==hit.target.location)throw new Error('Search target identity or location changed');
    await this.host.navigate(target,hit.passage,()=>{try{return this.hits.get(id)===hit&&this.valid(hit.stamp);}catch{return false;}});
  };
  /** Saved retrieval carries evidence only; reuse verified Open and native reveal. */
  activateRetrieval=async(hit:any,current:()=>boolean)=>{
    const selected=current;current=()=>selected()&&this.live&&(!this.native.knowledgeEvidence(hit?.source?.resourceId).location||!this.native.isDirty(hit.source.resourceId));
    this.host.guard();if(!this.live||!current()||!this.host.activateSaved)throw Error('Retrieval navigation unavailable');
    const source=hit?.source,span=source?.spans?.[0];if(!span||span.resourceId!==source.resourceId||!source.path||!source.rootBlockId)throw Error('Invalid retrieved passage');
    if(source.format&&source.format!=='mutable-document')throw Error('Open this legacy source manually before navigating');
    const native=this.native.knowledgeEvidence(source.resourceId);
    if(native.pending||native.location&&(this.native.isDirty(source.resourceId)||native.byteHash!==source.sourceHash))throw Error('Saved passage differs from the live Document; save or use live search');
    await retrievalRequest('verify',{vaultGuid:source.vaultGuid,resourceId:source.resourceId,stamp:hit.stamp});
    if(!current())throw Error('Retrieval navigation superseded');
    const parts=source.path.split('/'),filename=parts.pop(),location={folder:parts.join('/')||'.',filename};
    const target={documentId:source.resourceId,blockId:source.rootBlockId,title:filename,location:source.path};
    const prefix='mutable-saved-sql-v3:';if(typeof source.extractionProfile!=='string'||!source.extractionProfile.startsWith(prefix))throw Error('Unsupported saved extraction profile');
    const policy=policyKey(JSON.parse(source.extractionProfile.slice(prefix.length)));
    const evidence={resourceId:source.resourceId,rootBlockId:source.rootBlockId,location,byteHash:source.sourceHash,policy};
    const exact=hit.text.slice(span.chunkStart,span.chunkEnd);
    await this.host.activateSaved(target,{blockId:span.blockGuid,start:span.start,end:span.end,coordinate:span.coordinate},evidence,current,exact);
  };
  /** Explicit lookup pool; consumers filter this bounded pool without rescanning on typing. */
  completionTargets=async()=>{this.host.guard();const vault=this.host.vault();await vault.ensureVerified();this.host.guard();if(!this.live||this.host.vault()!==vault)throw Error("Document picker context changed");return this.scope(vault);};
  selection=(explicit?:TextRangeSnapshot)=>{
    this.host.guard();const active=this.host.active();if(!active)throw new Error('Select text in this Flint Window first');
    const key=explicit?.nodeKey??[this.editor.focus.state.focusedKey,this.editor.focus.state.lastFocusedKey].find(k=>k&&active.projection.node(k)?.viewType==='standoff-editor-block'),node=key&&active.projection.node(key);
    if(!node||node.viewType!=='standoff-editor-block'||this.editor.mounts.get(node.key)?.composing)throw new Error('Select nonempty text in this Window; finish composition first');
    let ranges:TextRangeSnapshot[]=[];const cross=this.editor.crossText.range();
    if(explicit){this.editor.textRanges.validate([explicit],'cell');if(!active.projection.node(explicit.nodeKey))throw Error('Source occurrence is outside the active Document');ranges=[explicit];}
    else if(cross){const segments=this.editor.crossText.resolve(cross.anchor,cross.head);if(segments.some(s=>!active.projection.node(s.nodeKey)))throw new Error('Selection must stay in this Document occurrence');ranges=segments.filter(s=>s.end>s.start).map(s=>this.editor.textRanges.snapshot(s.nodeKey,s.start,s.end));}
    else {const range=this.editor.mounts.get(node.key)?.captureInlineSelection?.()??this.editor.mounts.inlineSelection(node.key);if(range&&range.anchor!==range.head)ranges=[this.editor.textRanges.snapshot(node.key,Math.min(range.anchor,range.head),Math.max(range.anchor,range.head))];}
    if(!ranges.length)throw new Error('Select nonempty text before opening the Document picker');
    const vault=this.host.vault(),source=this.target({documentId:active.documentId} as DocumentTarget,vault),state=this.editor.repository.readState();
    // All selected text must belong to this resource, not a nested/transcluded body.
    for(const range of ranges){const path=this.editor.blockQueries.ancestorPath(range.nodeKey);if(path.filter(n=>n.viewType==='document-block').at(-1)?.contentKey!==source.contentKey)throw new Error('Nested Document selections are outside this picker');if(!state.contents[range.contentKey])throw new Error('Selection source disappeared');}
    const token=crypto.randomUUID();this.selections.clear();this.selections.set(token,{...this.stamp(vault),id:active.documentId,viewId:active.projection.viewId,ranges});return token;
  };
  cancelPicker=()=>{
    const saved=[...this.selections.values()][0];this.selections.clear();
    try {if(saved&&this.valid(saved)&&this.host.active()?.projection.viewId===saved.viewId){const first=saved.ranges[0];this.editor.focus.request(first.nodeKey,{reason:'cancel-document-reference'});this.editor.mounts.get(first.nodeKey)?.restoreInlineSelection?.({anchor:first.start,head:first.end});}}catch{/* A disposed source never regains focus. */}
  };
  picker=async(token:string)=>{const saved=this.selections.get(token);if(!saved)throw new Error('Selection expired');await this.refresh(saved);if(this.selections.get(token)!==saved)throw new Error('Selection cancelled');const scope=this.scope(saved.vault);return {targets:scope.sources.map(({contentKey,placement,...target})=>target),diagnostics:scope.diagnostics};};
  createReference=async(token:string,value:DocumentTarget,replacement?:string,current:()=>boolean=()=>true)=>{
    const saved=this.selections.get(token);if(!saved)throw new Error('Selection expired');await this.refresh(saved);
    if(this.selections.get(token)!==saved)throw new Error('Selection cancelled');
    const active=this.host.active();if(active?.documentId!==saved.id||active.projection.viewId!==saved.viewId)throw new Error('Source occurrence changed; select the text again');
    const target=this.target(value,saved.vault);if(target.blockId!==value.blockId)throw new Error('Target identity changed');
    this.editor.textRanges.validate(saved.ranges,'cell');
    if(!current())throw Error('Completion cancelled');
    if(replacement!==undefined){if(saved.ranges.length!==1)throw Error('Completion requires one range');const r=saved.ranges[0],node=this.editor.node(r.nodeKey)!,cells=node.inlineContent.map(k=>this.editor.node(k)),boundaries=graphemeBoundaries(cells.map(c=>String(c?.payload.text??'\uFFFC')).join(''));if(!boundaries.includes(r.start)||!boundaries.includes(r.end)||cells.slice(r.start,r.end).some(c=>c?.viewType!=='text-cell'))throw Error('Completion requires whole graphemes and plain text');this.editor.commands.replaceAndAnnotate(saved.ranges[0].nodeKey,saved.ranges[0].start,saved.ranges[0].end,replacement,'codex/block-reference',target.blockId,{documentId:target.documentId});}
    else this.editor.linkedAnnotations.createBatch([saved.ranges],'codex/block-reference',target.blockId,{documentId:target.documentId},saved.revision,'Create Document reference');
    this.selections.delete(token);const first=saved.ranges[0],end=replacement===undefined?first.end:first.start+[...replacement].length,start=replacement===undefined?first.start:end;this.editor.focus.request(first.nodeKey,{reason:'document-reference'});this.editor.mounts.get(first.nodeKey)?.restoreInlineSelection?.({anchor:start,head:end});this.editor.selections.setPrimary(first.nodeKey,first.contentKey,saved.viewId,start,end);
  };
  references=async()=>{
    this.host.guard();const active=this.host.active();if(!active)throw new Error('Open a Document in this Window first');
    const vault=this.host.vault();await vault.refresh();this.host.guard();if(this.host.active()?.documentId!==active.documentId)throw new Error('Active Document changed');
    const stamp=this.stamp(vault),scope=this.scope(vault),source=this.target({documentId:active.documentId} as DocumentTarget,vault),diagnostics:string[]=[],items:NativeReferenceItem[]=[],seen=new Set<string>();this.mentions.clear();
    let inspected=0;
    references:for(const c of await this.blocks(source,diagnostics))for(const [index,raw] of (Array.isArray(c.payload.standoffProperties)?c.payload.standoffProperties:[]).entries()){
      if(++inspected>10000||items.length>=1000){diagnostics.push('Reference inspection limited to 10,000 annotations / 1,000 mentions.');break references;}
      this.require(stamp);const state=this.editor.repository.readState(),p=resolveLinkedProperty(state,raw,c.key);if(typeof raw.annotationId==='string'&&!p.type)diagnostics.push('Unresolved linked annotation preserved; its reference semantics are unavailable.');if(p.type!=='codex/block-reference'||p.isDeleted)continue;
      const id=crypto.randomUUID();let target:DocumentTarget|undefined,diagnostic:string|undefined,removable=true;
      const owner=typeof raw.annotationId==='string'?linkedDefinitionOwner(state,raw,c.key):undefined;
      if(typeof raw.annotationId==='string'&&(!owner||owner.key!==source.contentKey||!linkedRegistry(state,owner.key)[raw.annotationId])){diagnostic='Unresolved or foreign linked reference preserved';removable=false;}
      else if(typeof p.value!=='string'||!p.value){diagnostic='Unsupported native reference target preserved';removable=false;}
      else {const docId=(p.metadata as any)?.documentId;const candidates=scope.sources.filter(s=>(docId===undefined||s.documentId===docId)&&s.blockId===p.value);if(candidates.length===1)target=candidates[0];else diagnostic='Target missing, unopened, ambiguous, or not a supported Document target';}
      const mentionKey=raw.annotationId?`${owner?.key}:${raw.annotationId}`:`${c.key}:${index}`;if(seen.has(mentionKey))continue;seen.add(mentionKey);
      this.mentions.set(id,{...stamp,source,contentKey:c.key,property:raw,index,target,removable});items.push({id,label:contentSlice(state,c,Number(p.start),Number(p.end)+1).map(a=>a.kind==='text'?a.text:'[inline object]').join('').slice(0,100),target,diagnostic,removable});
    }
    this.require(stamp);if(this.host.active()?.documentId!==source.documentId)throw new Error('Active Document changed');
    const token=crypto.randomUUID();if(this.referenceToken)this.batches.delete(this.referenceToken);this.referenceToken=token;this.referenceDocument=source.documentId;this.batches.set(token,stamp);return {token,items,diagnostics:[...new Set(diagnostics)]};
  };
  followReference=async(id:string)=>{const ref=this.mentions.get(id);if(!ref?.target)throw new Error('Reference target is unavailable or unsupported');await this.refresh(ref);if(this.mentions.get(id)!==ref||this.host.active()?.documentId!==ref.source.documentId)throw new Error('Source occurrence changed');this.target(ref.target,ref.vault);await this.host.navigate(ref.target,undefined,()=>{try{return this.mentions.get(id)===ref&&this.valid(ref);}catch{return false;}});};
  removeReference=(id:string)=>{
    const ref=this.mentions.get(id);if(!ref?.removable)throw new Error('This reference form is preserved and cannot be removed here');this.require(ref);
    const active=this.host.active();if(active?.documentId!==ref.source.documentId)throw new Error('Source occurrence changed');
    const node=Object.values(active.projection.state.nodes).find(n=>n.contentKey===ref.contentKey);if(!node)throw new Error('Source disappeared');
    if(typeof ref.property.annotationId==='string')this.editor.linkedAnnotations.deleteAll(ref.property.annotationId,ref.property,ref.contentKey);
    else this.editor.commands.editStandoffProperty(node.key,ref.index,ref.property,'delete');
  };
}
