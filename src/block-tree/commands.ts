import {prepareMargin,marginText} from './compound-authoring';
import {INLINE_READING, isReadingRelation} from './inline-alternative';
import { replaceCompact, contentLength, inlineSlice, normalizeInline, logicalInline, inlineText } from "./inline-sequence";
import { StructuralDraft } from "./structural-draft";
import { hasBlockMode, modeContinuationError, modeJoinError } from './mode-editing';
import { isAutomaticListMetadata, type AutomaticListMetadata } from "./list-wrap-plan";
import { diffRecordBatch, recordOperations } from "./record-batch";
import { conversionSource } from '../interchange/conversion';
import { mapStandoffPropertiesForReplacement, pointAffinity } from '../interchange/ranges';
import { planFragmentInsertion, planCompactFragmentInsertion } from '../interchange/insertion';
import { serializeSelection } from '../interchange/serializer';
import { materializeFragment } from '../interchange/materialize';
import type { MutableFragment } from '../interchange/fragment';
import { planBlockRestore, type BlockRestorePlan, type LeafAuthoredState } from "./block-restore";
import { type DeepReadonly } from "./commit-capture";
import { clone } from "./clone";
import { ownNewDefinitions } from "./definition-ownership";
import { planCrossTextEdit, type CrossTextSegment } from "./cross-text-edit";
import { linkedRegistry, linkedSourcesForMove } from "./linked-annotations";
import { resourceOwner, resourceSource, indexedResourceLookup } from "./resource-identity";
import { captureBlocks, cloneBlocks, remapKnownBlockReferences, type BlockFragment } from "./clipboard";
import type { BlockCommitSubject, CommandDescriptor } from "./commit-capture";
import { isAuthoredBlock, prepareNewBlockIdentities, readBlockId } from "./identity";
import { editAnnotation, type AnnotationAction, type AnnotationPatch } from "./annotation-commands";
import { emptyParagraphChangeFor } from "./split-plan";
import { isTextLeaf } from "./inline-plan";
import { decodeDetachedSubtree, encodeDocument } from "./codecs";
import { createBlockId, createContentKey, createPlacementKey } from "./ids";
import { deriveLocations, planOperations, type CanonicalRepository } from "./repository";
import type {
  ContentRecord,
  JsonObject,
  Destination,
  ExistingBlockDto,
  InlineImageDescriptor,
  CompactInlineAddress,
  NodeKey,
  PlacementKey,
  RepositoryOperation,
  RepositoryState,
} from "./types";

interface PendingTransaction {
  requireBounded?:boolean;
  label: string;
  operations: RepositoryOperation[];
  draft: RepositoryState;
  local?: StructuralDraft;
  commands: CommandDescriptor[];
}

export class TreeCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreeCommandError";
  }
}


export class TreeCommands {
  private annotationCapture?:RepositoryOperation[];
  captureAnnotationBatch(action:()=>void){if(this.annotationCapture||this.pending)throw new TreeCommandError('Finish the current operation first');const operations:RepositoryOperation[]=[];this.annotationCapture=operations;try{action();return operations;}finally{this.annotationCapture=undefined;}}
  /** Scry's local edit log becomes one bounded native history entry. No open
   * transaction, graph draft or whole-paragraph replacement is required. */
  completeProvisionalText(key:NodeKey,version:number,edits:readonly {start:number;end:number;text:string}[],annotation?:{start:number;end:number;value:string;name:string},reviewed:RepositoryOperation[]=[]) {
    if(this.pending)throw new TreeCommandError('Finish the current operation first');
    const state=this.repository.readState(),placement=this.placementKey(key,state),content=state.contents[state.placements[placement].contentKey];
    if(content.inlineKind!=='standoff'||content.inlineRevision!==version)throw new TreeCommandError('Scry source changed; draft was not committed');
    if(content.compactInline){
      const reviewedSource=reviewed.find(op=>op.kind==='put-content'&&op.record.key===content.key) as Extract<RepositoryOperation,{kind:'put-content'}>|undefined;
      let next=clone(reviewedSource?.record??content),origins:(number|null)[]=(next.payload.standoffProperties as unknown[]??[]).map((_,i)=>i);
      for(const edit of edits){if(inlineSlice(next.compactInline!.spans,edit.start,edit.end).some(a=>a.kind==='alternative'))throw new TreeCommandError('Finish provisional input before replacing an inline alternative slot');const mapped:(number|null)[]=[];next=replaceCompact(next,edit.start,edit.end,edit.text?[{kind:'text',text:edit.text}]:[],mapped);origins=mapped.map(i=>i===null?null:origins[i]??null);}
      if(JSON.stringify(next.compactInline)===JSON.stringify(content.compactInline)){next.payload.standoffProperties=clone(reviewedSource?.record.payload.standoffProperties??content.payload.standoffProperties??[]);origins=(next.payload.standoffProperties as unknown[]).map((_,i)=>i<(content.payload.standoffProperties as unknown[]??[]).length?i:null);}
      if(annotation){
        if(!annotation.value||!Number.isInteger(annotation.start)||!Number.isInteger(annotation.end)||annotation.start<0||annotation.end<=annotation.start||annotation.end>contentLength(next))throw new TreeCommandError('Invalid Scry annotation');
        const properties=next.payload.standoffProperties as Record<string,unknown>[]??[];
        if(!properties.some((p,i)=>i>=(content.payload.standoffProperties as unknown[]??[]).length&&p.type==='codex/entity-reference'&&p.value===annotation.value&&p.start===annotation.start&&p.end===annotation.end-1)){properties.push({id:crypto.randomUUID(),type:'codex/entity-reference',start:annotation.start,end:annotation.end-1,value:annotation.value,metadata:{entityId:annotation.value,entityName:annotation.name}});origins.push(null);}next.payload.standoffProperties=properties;
      }
      next.revision=content.revision+1;
      this.publish(annotation?'Link Scry Entity':'Finish Scry text',[...reviewed.filter(op=>op!==reviewedSource),{kind:'put-content',record:next,annotationOrigins:origins}],{commandId:'autocomplete.finish',subjects:[this.subject(state,placement)]});return;
    }
    const keys=[...content.inlineContent],fresh=new Map<string,{content:ContentRecord;placement:PlacementKey}>();
    const reviewedSource=reviewed.find(op=>op.kind==='put-content'&&op.record.key===content.key) as Extract<RepositoryOperation,{kind:'put-content'}>|undefined;
    const originalProperties=content.payload.standoffProperties as Record<string,unknown>[]??[];
    const initialProperties=reviewedSource?.record.payload.standoffProperties as Record<string,unknown>[]??originalProperties;
    let properties=clone(initialProperties),origins:(number|null)[]=properties.map((_,i)=>i<originalProperties.length?i:null);
    for(const edit of edits){
      if(!Number.isInteger(edit.start)||!Number.isInteger(edit.end)||edit.start<0||edit.end<edit.start||edit.end>keys.length)throw new TreeCommandError('Invalid provisional range');
      const added=[...edit.text].map(text=>{const ck=createContentKey(),pk=createPlacementKey();fresh.set(pk,{placement:pk,content:{key:ck,viewType:'text-cell',payload:{text},children:[],inlineContent:[],inlineRevision:0,ownedRelations:{},opaqueRelations:{},wireChildren:'omitted',wireRelation:'omitted',revision:0}});return pk;});
      for(const pk of keys.slice(edit.start,edit.end))if(!fresh.has(pk)&&!isTextLeaf(state.contents[state.placements[pk].contentKey]))throw new TreeCommandError('Scry only edits plain text cells');
      const nextOrigins:(number|null)[]=[];
      properties=mapStandoffPropertiesForReplacement(properties,edit.start,edit.end,added.length,nextOrigins,keys.length) as Record<string,unknown>[];
      origins=nextOrigins.map(i=>i===null?null:origins[i]);keys.splice(edit.start,edit.end-edit.start,...added);
    }
    const beforeText=content.inlineContent.map(pk=>String(state.contents[state.placements[pk].contentKey].payload.text??'')).join('');
    const afterText=keys.map(pk=>String(fresh.get(pk)?.content.payload.text??state.contents[state.placements[pk].contentKey].payload.text??'')).join('');
    const textChanged=beforeText!==afterText;
    if(!textChanged){keys.splice(0,keys.length,...content.inlineContent);properties=clone(initialProperties);origins=properties.map((_,i)=>i<originalProperties.length?i:null);}
    if(annotation){
      if(!annotation.value||!Number.isInteger(annotation.start)||!Number.isInteger(annotation.end)||annotation.start<0||annotation.end<=annotation.start||annotation.end>keys.length)throw new TreeCommandError('Invalid Scry annotation');
      if(!properties.some((p,i)=>i>=originalProperties.length&&p.type==='codex/entity-reference'&&p.value===annotation.value&&p.start===annotation.start&&p.end===annotation.end-1)){properties.push({id:crypto.randomUUID(),type:'codex/entity-reference',start:annotation.start,end:annotation.end-1,value:annotation.value,metadata:{entityId:annotation.value,entityName:annotation.name}});origins.push(null);}
    }
    if(!textChanged&&!annotation&&!reviewed.length)return;
    const operations:RepositoryOperation[]=reviewed.filter(op=>op!==reviewedSource),kept=new Set(keys),old=new Set(content.inlineContent),removed=new Map<string,number>();
    for(const pk of content.inlineContent)if(!kept.has(pk)){operations.push({kind:'remove-placement',key:pk});const ck=state.placements[pk].contentKey;removed.set(ck,(removed.get(ck)??0)+1);}
    for(const [ck,count] of removed)if(this.repository.contentReferenceCount(ck)===count)operations.push({kind:'remove-content',key:ck});
    for(const pk of keys)if(!old.has(pk)){const cell=fresh.get(pk)!;operations.push({kind:'put-content',record:cell.content},{kind:'put-placement',record:{key:pk,contentKey:cell.content.key,kind:'inline'}});}
    operations.push({kind:'put-content',annotationOrigins:origins,record:{...clone(content),payload:{...clone(content.payload),standoffProperties:properties},inlineContent:keys,inlineRevision:content.inlineRevision+(textChanged?1:0),revision:content.revision+1}});
    this.publish(annotation?'Link Scry Entity':'Finish Scry text',operations,{commandId:'autocomplete.finish',subjects:[this.subject(state,placement)]});
  }
  private pending?: PendingTransaction;
  private restorePlans = new WeakSet<object>();
  /** Prepared fragments only: one history entry and validation batch for the entire paste. */
  insertMutableText(edits: Array<{ segments: CrossTextSegment[]; fragment: BlockFragment; slices: MutableFragment['roots'] }>, cut = false, operation: 'paste' | 'import' | 'convert' = 'paste') {
    if (!edits.length) return [];
    const before = this.current();
    if(edits.some(e=>e.segments.some(s=>before.contents[before.placements[this.placementKey(s.placementKey,before)].contentKey].compactInline))){
      if(!this.inlineInteroperability())throw new TreeCommandError('Compact clipboard interoperability is disabled.');
      const draft=new StructuralDraft(before,k=>this.repository.locationOf(k),k=>this.repository.contentReferenceCount(k),k=>this.repository.ownedPlacementKeys(k));
      const results=[];
      for(const edit of edits){if(operation==='convert')throw new TreeCommandError('Compact source conversion is not supported by this clipboard operation.');const result=planCompactFragmentInsertion(draft.state,edit.segments,edit.fragment,edit.slices,{locationOf:k=>draft.locationOf(k),referenceCount:k=>draft.referenceCount(k),ownerOf:k=>resourceOwner(before,k,indexedResourceLookup(this.repository))});draft.apply(result.operations!);results.push({placementKey:result.placementKey,caret:result.caret});}
      this.publish(cut?'Cut selected text':'Paste Mutable content',draft.operations(),{commandId:cut?'selection.cut':'selection.paste',subjects:results.map(r=>this.subject(draft.state,r.placementKey)),clipboard:{token:crypto.randomUUID(),action:cut?'cut':'paste',preservedIds:false}});return results;
    }
    if(edits.some(e=>Object.values(e.fragment.state.contents).some(c=>c.compactInline?.spans.some(a=>a.kind==='alternative'))))throw new TreeCommandError('Inline alternatives require a compact destination; nothing was pasted.');
    let state = before;
    const results: Array<{ placementKey: string; caret: number }> = [];
    for (const edit of edits) {
      const source = operation === 'convert' ? conversionSource(state, edit.segments).state : state;
      const result = planFragmentInsertion(source, edit.segments, edit.fragment, edit.slices);
      state = result.state; results.push({ placementKey: result.placementKey, caret: result.caret });
    }
    this.pruneUnreachable(state);
    const changes = cut ? this.diff(before, state) : [diffRecordBatch(before, state)];
    if (!cut) {
      const bulk = changes[0] as Extract<RepositoryOperation, {kind: "record-batch"}>;
      const any = (records: object) => { for (const _ in records) return true; return false; };
      if (!any(bulk.contents) && !any(bulk.placements)) return results;
    }
    this.publish(cut ? 'Cut selected text' : operation === 'convert' ? 'Convert source to Mutable Ink' : operation === 'import' ? 'Insert external content' : 'Paste Mutable content', changes, {
      commandId: cut ? 'selection.cut' : operation === 'convert' ? 'interchange.convert' : operation === 'import' ? 'interchange.insert' : 'selection.paste',
      subjects: results.map(r => this.subject(state, r.placementKey)),
      ...(operation === "paste" ? {clipboard: { token: crypto.randomUUID(), action: cut ? 'cut' as const : 'paste' as const, preservedIds: false }} : {}),
    });
    return results;
  }
  prepareBlockRestore(placementKey: string, blockId: string, source: DeepReadonly<LeafAuthoredState>): DeepReadonly<BlockRestorePlan> {
    if (this.pending) throw new TreeCommandError("Finish the current transaction before preparing a restore");
    const plan = planBlockRestore(this.repository.readState(), placementKey, blockId, source);
    this.restorePlans.add(plan); return plan;
  }
  restoreBlock(plan: DeepReadonly<BlockRestorePlan>): void {
    if (!this.restorePlans.has(plan) || this.pending || this.repository.state.revision !== plan.expectedRevision) throw new TreeCommandError("The Document changed. Prepare and confirm the restore again.");
    this.restorePlans.delete(plan);
    this.publish("Restore this Block", clone(plan.operations) as RepositoryOperation[], clone(plan.descriptor) as CommandDescriptor);
  }


  replaceAcrossBlocks(segments: CrossTextSegment[], text: string) {
    for(const segment of segments)this.assertContentEdit?.(segment.placementKey);
    const state = this.current(true);
    const resolved = segments.map(segment => ({ ...segment, placementKey: this.placementKey(segment.placementKey, state) }));
    if(!this.inlineInteroperability()&&resolved.some(s=>state.contents[state.placements[s.placementKey].contentKey].compactInline?.spans.some(a=>a.kind==='alternative')))throw new TreeCommandError('Inline alternative structural interoperability is disabled.');
    const result = planCrossTextEdit(state, resolved, text,state.contents[state.placements[resolved[0]?.placementKey]?.contentKey]?.compactInline&&(!this.pending||this.pending.local)?{locationOf:k=>this.location(k,state),referenceCount:k=>this.pending?.local?.referenceCount(k)??this.repository.contentReferenceCount(k)}:undefined);
    if(!result.operations)this.pruneUnreachable(result.state);
    this.publish("Replace selected text", result.operations??this.diff(state, result.state), {
      commandId: "tree.replaceAcrossBlocks", subjects: [...result.inputs, ...result.outputs],
      relation: { kind: "cross-text-replace", inputs: result.inputs, outputs: result.outputs },
    });
    return { placementKey: result.placementKey, caret: result.caret };
  }

  editStandoffProperty(key: NodeKey | PlacementKey, index: number, expected: Record<string, unknown>, action: AnnotationAction | AnnotationPatch): Record<string, unknown> {
    const state = this.current();
    const content = state.contents[state.placements[this.placementKey(key, state)].contentKey];
    const properties = content.payload.standoffProperties;
    if (content.inlineKind !== "standoff" || !Array.isArray(properties) || !Number.isInteger(index) ||
      !properties[index] || JSON.stringify(properties[index]) !== JSON.stringify(expected)) throw new TreeCommandError("Annotation changed; reopen the monitor");
    const next = editAnnotation(properties[index], action, content, () => inlineText(logicalInline(state,content)));
    if (JSON.stringify(next) === JSON.stringify(properties[index])) return next;
    const updated = clone(properties); updated[index] = next;
    this.publish("Edit Standoff annotation", [{ kind: "put-content", annotationOrigins: properties.map((_, i) => i), record: {
      ...clone(content), payload: { ...clone(content.payload), standoffProperties: updated }, revision: content.revision + 1,
    } }], { commandId: "tree.editStandoffProperty", subjects: [this.subject(state, this.placementKey(key, state))] });
    return clone(next);
  }

  /** One ordinary replacement and local annotation, with the normal range remapping. */
  replaceAndAnnotate(key:NodeKey,start:number,end:number,text:string,type:string,value:string,metadata:Record<string,unknown>) {
    if(!text.length||text.length>1000||!type)throw new TreeCommandError('Invalid replacement annotation');
    this.transaction('Replace text and annotate',()=>{
      this.replaceInlineRange(key,start,end,text);
      const state=this.current(true),content=state.contents[state.placements[this.placementKey(key,state)].contentKey];
      const properties=clone(content.payload.standoffProperties as Record<string,unknown>[]??[]);
      properties.push({id:crypto.randomUUID(),type,value,metadata:clone(metadata),start,end:start+[...text].length-1});
      this.setPayloadField(key,'standoffProperties',properties,undefined,properties.map((_,i)=>i<properties.length-1?i:null));
    });
  }

  constructor(
    private readonly repository: CanonicalRepository,
    private readonly resolveOccurrence: (key: NodeKey | PlacementKey) => PlacementKey | undefined,
    private readonly assertContentEdit?: (key: NodeKey | PlacementKey) => void,
    private readonly resolveEditingAtom?: (key:NodeKey)=>{placementKey:string;index:number}|undefined,
    private readonly inlineInteroperability:()=>boolean=()=>true,
  ) {}

  private current(local = false): RepositoryState {
    if (this.pending?.local && !local) {
      if(this.pending.requireBounded)throw new TreeCommandError('Operation requires broad transaction planning');
      this.pending.draft = this.pending.local.materialize();
      this.pending.local = undefined;
    }
    return this.pending?.draft ?? this.repository.readState();
  }
  private state(): RepositoryState {
    return this.pending ? this.current() : this.repository.snapshot();
  }
  private location(key: string, state: RepositoryState) {
    return this.pending?.local ? this.pending.local.locationOf(key)
      : state === this.repository.readState() ? this.repository.locationOf(key) : deriveLocations(state).get(key);
  }
  /** Same-resource proof using existing incoming/location indexes. A doubtful
   * ownership context falls back to the original linked-annotation planner. */
  private localResource(key: string, state: RepositoryState): string | undefined {
    if (!this.repository.hasValidStructuralEvidence || this.pending && !this.pending.local) return;
    const seen = new Set<string>();
    while (!seen.has(key)) {
      seen.add(key);
      const c = state.contents[key]; if (!c) return;
      if (c.viewType === 'document-block' || c.viewType === 'workspace-block') return key;
      const incoming = [...(this.pending?.local?.ownedKeys(key) ?? this.repository.ownedPlacementKeys(key))];
      if (!incoming.length) return c.definitionOwnerKey;
      if (incoming.length !== 1) return;
      const p = state.placements[incoming[0]], at = this.location(incoming[0], state);
      if (!p || p.externalReference || p.resolvedReference || p.resourceRegistration || !at) return;
      key = at.ownerContentKey;
    }
  }

  isCompactText(key:NodeKey|PlacementKey):boolean {const state=this.current(true);return !!state.contents[state.placements[this.placementKey(key,state)].contentKey].compactInline;}

  /** Identity lookup inside an in-flight native structural transaction. */
  blockIdOf(key:NodeKey|PlacementKey):string|undefined {const state=this.current(true);return readBlockId(state.contents[state.placements[this.placementKey(key,state)].contentKey]);}

  /** Transaction-aware structural reads, including freshly inserted wrappers. */
  childrenOf(key: NodeKey | PlacementKey): PlacementKey[] {
    const state = this.current(true);
    return [...state.contents[state.placements[this.placementKey(key, state)].contentKey].children];
  }

  private placementKey(key: NodeKey | PlacementKey, state = this.state()): PlacementKey {
    const resolved = this.resolveOccurrence(key);
    if (!resolved || !state.placements[resolved]) {
      throw new TreeCommandError(`Unknown Block occurrence ${key}`);
    }
    return resolved;
  }

  private subject(state: RepositoryState, placementKey: PlacementKey): BlockCommitSubject {
    const placement = state.placements[placementKey];
    if (placement.externalReference) return { placementKey, contentKey: placement.contentKey };
    const content = state.contents[placement.contentKey];
    return { contentKey: content.key, placementKey, blockId: readBlockId(content) };
  }

  private publish(label: string, operations: RepositoryOperation[], descriptor?: CommandDescriptor): void {
    if (!operations.length) return;
    let draftLocations: ReturnType<typeof deriveLocations> | undefined;
    if (operations.some(op => op.kind === 'record-batch' || op.kind === 'set-root')) this.current();
    operations = ownNewDefinitions(this.current(true), operations,
      key => this.pending?.local ? this.pending.local.locationOf(key) : this.pending ? (draftLocations ??= deriveLocations(this.pending.draft)).get(key) : this.repository.locationOf(key));
    const current = this.current(true);
    if (this.repository.hasSemanticPlacements() || operations.some(op => op.kind === "record-batch" || op.kind === "put-placement" && op.record.placementId !== undefined)) {
      operations = operations.map(op => {
        if (op.kind === "record-batch") {
          const placements = { ...op.placements };
          for (const key in placements) {
            const p = placements[key];
            if (p && p.kind !== "inline" && !current.placements[key] && p.placementId === undefined) placements[key] = { ...p, placementId: createBlockId() };
          }
          return { ...op, placements };
        }
        return op.kind === "put-placement" && op.record.kind !== "inline" && !current.placements[op.record.key] && op.record.placementId === undefined
          ? { ...op, record: { ...op.record, placementId: createBlockId() } } : op;
      });
    }
    const description = descriptor ?? { commandId: "tree.command", subjects: [] };
    if (this.pending) {
      if (this.pending.local) this.pending.local.apply(operations);
      else this.pending.draft = planOperations(this.pending.draft, operations).next;
      // Legacy structural commands can still emit many record changes. Never
      // make transaction assembly depend on the engine's argument-count limit.
      for (const operation of operations) this.pending.operations.push(operation);
      this.pending.commands.push(clone(description));
      return;
    }
    this.repository.commit(label, operations, true, { commands: [description] });
  }

  /** Join a validated annotation batch to a surrounding native text transaction.
   * Prepared annotation records must precede text edits so they cannot overwrite
   * edits already staged in the transaction. Outside one, keep the usual path. */
  stageAnnotationBatch(label:string,operations:RepositoryOperation[],revision:number):boolean {
    if(this.annotationCapture){if(this.repository.state.revision!==revision)throw new TreeCommandError('Reviewed mentions changed');this.annotationCapture.push(...clone(operations));return true;}
    if(!this.pending)return false;
    if(this.pending.operations.length||this.repository.state.revision!==revision)throw new TreeCommandError('Annotation batch must precede text edits in a current transaction');
    this.publish(label,operations);return true;
  }

  /** Reusable bounded assembly. Unsupported commands materialize once; final
   * canonical admission still validates the complete batch before publication. */
  structuralTransaction(label: string, operation: () => void, descriptor?: CommandDescriptor): void {
    this.runTransaction(label, operation, descriptor, true);
  }
  boundedStructuralTransaction(label:string, operation:()=>void):void {
    this.runTransaction(label,operation,undefined,true,true);
  }
  transaction(label: string, operation: () => void, descriptor?: CommandDescriptor): void {
    this.runTransaction(label, operation, descriptor, this.repository.compactCanonicalText);
  }
  private runTransaction(label: string, operation: () => void, descriptor: CommandDescriptor | undefined, local: boolean, requireBounded=false): void {
    if (this.pending) {
      if(requireBounded&&!this.pending.requireBounded)throw new TreeCommandError('Bounded transaction cannot join a broader batch');
      const index = this.pending.commands.length;
      operation();
      if (descriptor) this.pending.commands.splice(index, 0, clone(descriptor));
      return;
    }
    const writeSet = local ? new StructuralDraft(this.repository.readState(), key => this.repository.locationOf(key),
      key => this.repository.contentReferenceCount(key), key => this.repository.ownedPlacementKeys(key)) : undefined;
    this.pending = { label, requireBounded, operations: [], local: writeSet, draft: writeSet?.state ?? this.repository.snapshot(), commands: descriptor ? [clone(descriptor)] : [] };
    try {
      operation();
      const operations = this.pending.local?.operations() ?? this.pending.operations;
      const commands = this.pending.commands;
      this.pending = undefined;
      this.repository.commit(label, operations, true, { commands, requireBounded });
    } catch (error) {
      this.pending = undefined;
      throw error;
    }
  }

  private updatedChildren(content: ContentRecord, children: PlacementKey[]): ContentRecord {
    return {
      ...clone(content),
      children,
      wireChildren: "present",
      revision: content.revision + 1,
    };
  }

  private pruneUnreachable(state: RepositoryState): void {
    const reachablePlacements = new Set<PlacementKey>();
    const visit = (placementKey: PlacementKey) => {
      if (reachablePlacements.has(placementKey)) return;
      reachablePlacements.add(placementKey);
      const placement = state.placements[placementKey];
      if (!placement) return;
      const content = state.contents[placement.contentKey];
      if (!content) return;
      content.children.forEach(visit);
      content.inlineContent.forEach(visit);
      Object.values(content.ownedRelations).forEach(visit);
    };
    visit(state.rootPlacementKey);
    // Retained definitions outlive their last visible placement. This applies
    // only to explicitly normalized Documents, leaving legacy pruning intact.
    const retained = new Set<string>();
    for (const content of Object.values(state.contents)) {
      if (content.definitionOwnerKey === undefined) continue;
      if (content.key === content.definitionOwnerKey) continue;
      retained.add(content.key);
      content.children.forEach(visit);
      content.inlineContent.forEach(visit);
      Object.values(content.ownedRelations).forEach(visit);
    }
    for (const placementKey of Object.keys(state.placements)) {
      if (!reachablePlacements.has(placementKey)) {
        if (state.placements[placementKey].resourceRegistration) throw new TreeCommandError("Resource registration removal requires an explicit lifetime decision");
        delete state.placements[placementKey];
      }
    }
    const usedContent = new Set(Object.values(state.placements).map((p) => p.contentKey));
    for (const contentKey of Object.keys(state.contents)) {
      if (!usedContent.has(contentKey) && !retained.has(contentKey)) delete state.contents[contentKey];
    }
  }

  /** Explicit definition deletion requires removing its local placements first.
   * Foreign consumers are not scanned and do not decide the owner's lifetime. */
  deleteUnplacedDefinition(contentKey: string): void {
    const before = this.state(), content = before.contents[contentKey];
    if (!content?.definitionOwnerKey) throw new TreeCommandError("Not a retained Document definition");
    if (Object.values(before.placements).some(p => !p.externalReference && p.contentKey === contentKey)) {
      throw new TreeCommandError("Remove the definition's local placements before deleting it");
    }
    const next = clone(before);
    delete next.contents[contentKey].definitionOwnerKey;
    this.pruneUnreachable(next);
    this.publish("Delete unplaced definition", this.diff(before, next), {
      commandId: "tree.deleteUnplacedDefinition", subjects: [{ contentKey, blockId: readBlockId(content) }],
    });
  }

  private diff(before: RepositoryState, after: RepositoryState): RepositoryOperation[] {
    const operations: RepositoryOperation[] = [];
    for (const key of Object.keys(before.placements)) {
      if (!after.placements[key]) operations.push({ kind: "remove-placement", key });
    }
    for (const [key, record] of Object.entries(after.placements)) {
      if (JSON.stringify(before.placements[key]) !== JSON.stringify(record)) {
        operations.push({ kind: "put-placement", record });
      }
    }
    for (const key of Object.keys(before.contents)) {
      if (!after.contents[key]) operations.push({ kind: "remove-content", key });
    }
    for (const [key, record] of Object.entries(after.contents)) {
      if (JSON.stringify(before.contents[key]) !== JSON.stringify(record)) {
        operations.push({ kind: "put-content", record });
      }
    }
    if (before.rootPlacementKey !== after.rootPlacementKey) {
      operations.push({ kind: "set-root", key: after.rootPlacementKey });
    }
    return operations;
  }

  private resolveInsertion(
    destination: Destination,
    sourceKey?: PlacementKey,
    state = this.state(),
  ): { owner: ContentRecord; children: PlacementKey[]; index: number } {
    if (destination.kind === "at") {
      const parentPlacementKey = this.placementKey(destination.parentKey, state);
      const parentPlacement = state.placements[parentPlacementKey];
      const owner = state.contents[parentPlacement.contentKey];
      const children = sourceKey
        ? owner.children.filter((key) => key !== sourceKey)
        : [...owner.children];
      if (destination.index < 0 || destination.index > children.length) {
        throw new TreeCommandError(
          `Insertion index ${destination.index} is outside 0..${children.length}`,
        );
      }
      return { owner, children, index: destination.index };
    }

    const anchorKey = this.placementKey(destination.anchorKey, state);
    if (sourceKey === anchorKey) {
      const location = this.location(anchorKey, state);
      if (!location || location.slot.kind !== "children") {
        throw new TreeCommandError("The anchor is not in an ordinary child slot");
      }
      const owner = state.contents[location.ownerContentKey];
      return { owner, children: [...owner.children], index: owner.children.indexOf(anchorKey) };
    }
    const location = this.location(anchorKey, state);
    if (!location || location.slot.kind !== "children") {
      throw new TreeCommandError("Before/after requires an ordinary child anchor");
    }
    const owner = state.contents[location.ownerContentKey];
    const children = sourceKey
      ? owner.children.filter((key) => key !== sourceKey)
      : [...owner.children];
    const anchorIndex = children.indexOf(anchorKey);
    if (anchorIndex < 0) throw new TreeCommandError("The insertion anchor is stale");
    return {
      owner,
      children,
      index: anchorIndex + (destination.kind === "after" ? 1 : 0),
    };
  }

  insertFragment(fragment: BlockFragment, destination: Destination, descriptor?: CommandDescriptor): PlacementKey[] {
    return this.insertPreparedFragment(fragment, destination, descriptor);
  }

  /** Replace an unshared source leaf and insert its native derivative in one
   * structural commit. Do not insert then clone/scan the expanded document to
   * remove the old source. Undo retains the exact source and prepared subtree. */
  replaceSourceWithFragment(fragment: BlockFragment, key: NodeKey | PlacementKey): PlacementKey[] {
    const state = this.current();
    const pk = this.placementKey(key, state), p = state.placements[pk], c = state.contents[p.contentKey];
    if (hasBlockMode(c.payload)) throw new TreeCommandError('Conversion would remove this Block Mode; clear it explicitly first');
    if (p.kind !== "owned" || p.externalReference || p.resolvedReference || p.resourceRegistration ||
      c.children.length || contentLength(c) || Object.keys(c.ownedRelations).length || Object.keys(c.opaqueRelations).length ||
      Object.values(state.placements).filter(edge => edge.contentKey === c.key).length !== 1) {
      throw new TreeCommandError("Conversion requires an unshared source leaf in an ordinary child slot");
    }
    return this.insertPreparedFragment(fragment, {kind: "before", anchorKey: pk}, {
      commandId: "interchange.convert-source-block", subjects: [this.subject(state, pk)],
    }, pk);
  }

  private insertPreparedFragment(fragment: BlockFragment, destination: Destination, descriptor?: CommandDescriptor, replaceKey?: PlacementKey): PlacementKey[] {
    fragment = clone(fragment);
    prepareNewBlockIdentities(Object.values(fragment.state.contents));
    // Whole-Document interchange owns its registry; do not attach it to the
    // destination workspace/Document as if it were a paragraph fragment.
    const copiedDocument=fragment.roots.length===1&&fragment.state.contents[fragment.state.placements[fragment.roots[0]]?.contentKey];
    if(copiedDocument&&copiedDocument.viewType==="document-block"&&Object.keys(fragment.linkedAnnotations??{}).length){
      copiedDocument.payload.linkedAnnotations={...(copiedDocument.payload.linkedAnnotations as JsonObject??{}),...fragment.linkedAnnotations};
      fragment.linkedAnnotations={};
    }
    // Newly prepared fragments without registry merges use the same local
    // record operations as insert(dto). Keep broader clipboard cases on their
    // existing path; canonical ownership/admission still checks the full batch.
    const bounded = !!this.pending?.requireBounded && !replaceKey && !Object.keys(fragment.linkedAnnotations ?? {}).length;
    const state = this.current(bounded);
    const target = this.resolveInsertion(destination, undefined, state);
    if (Object.keys(fragment.state.contents).some(key => state.contents[key]) || Object.keys(fragment.state.placements).some(key => state.placements[key])) throw new TreeCommandError("Clipboard keys collide with existing Blocks");
    const children = [...target.children];
    children.splice(target.index, replaceKey ? 1 : 0, ...fragment.roots);
    const owner = this.updatedChildren(target.owner, children);
    const extra: RepositoryOperation[] = [];
    if (Object.keys(fragment.linkedAnnotations ?? {}).length) {
      const resource = resourceOwner(state, target.owner.key);
      const rootKey = resource?.key ?? state.placements[state.rootPlacementKey].contentKey;
      const registry = clone(linkedRegistry(state, rootKey));
      for (const [id, definition] of Object.entries(fragment.linkedAnnotations!)) {
        if (registry[id] && JSON.stringify(registry[id]) !== JSON.stringify(definition)) throw new TreeCommandError("Conflicting linked annotation identity; copy the Blocks again");
        registry[id] = clone(definition);
      }
      if (owner.key === rootKey) owner.payload.linkedAnnotations = registry;
      else {
        const root = clone(state.contents[rootKey]); root.payload.linkedAnnotations = registry; root.revision++;
        extra.push({ kind: "put-content", record: root });
      }
    }
    const changes: Extract<RepositoryOperation, {kind: "record-batch"}> = {
      kind: "record-batch", contents: { ...fragment.state.contents, [owner.key]: owner }, placements: { ...fragment.state.placements },
    };
    if (replaceKey) {
      changes.placements[replaceKey] = null;
      const removed = state.contents[state.placements[replaceKey].contentKey];
      // Retained definitions keep their existing lifetime semantics.
      if (!removed.definitionOwnerKey) changes.contents[removed.key] = null;
    }
    for (const op of extra) if (op.kind === "put-content") changes.contents[op.record.key] = op.record;
    this.publish(replaceKey ? "Convert source Block to Mutable Ink" : "Paste Blocks", bounded ? [...recordOperations([changes])] : [changes], {
      commandId: "tree.insertFragment", subjects: fragment.roots.map(key => this.subject(fragment.state, key)),
      ...(fragment.copyIdentities?.length ? { relation: { kind: "copy" as const, pairs: fragment.copyIdentities } } : {}), ...descriptor });
    return [...fragment.roots];
  }

  insert(dto: ExistingBlockDto, destination: Destination): PlacementKey {
    const state = this.current(true);
    const decoded = decodeDetachedSubtree(dto);
    prepareNewBlockIdentities(Object.values(decoded.state.contents));
    const target = this.resolveInsertion(destination, undefined, state);
    const children = [...target.children];
    children.splice(target.index, 0, decoded.rootPlacementKey);
    const operations: RepositoryOperation[] = [
      ...Object.values(decoded.state.contents).map(
        (record): RepositoryOperation => ({ kind: "put-content", record }),
      ),
      ...Object.values(decoded.state.placements).map(
        (record): RepositoryOperation => ({ kind: "put-placement", record }),
      ),
      { kind: "put-content", record: this.updatedChildren(target.owner, children) },
    ];
    this.publish("Insert Block", operations, { commandId: "tree.insert", subjects: [this.subject(decoded.state, decoded.rootPlacementKey)] });
    return decoded.rootPlacementKey;
  }

  /** Wrap one existing TextBlock without intermediate insert/move transactions.
   * Its placement, owned subtree and definition owner stay intact in the same
   * resource. Optional prefix removal uses the ordinary native inline planner. */
  wrapTextBlockInList(key: NodeKey | PlacementKey, prefixLength = 0, list: AutomaticListMetadata = { ordered: false }, checked?: boolean): PlacementKey {
    if (!isAutomaticListMetadata(list)) throw new TreeCommandError("Invalid automatic list metadata");
    const state = this.current(true);
    const sourceKey = this.placementKey(key, state), source = state.placements[sourceKey];
    const content = state.contents[source.contentKey];
    const location = this.location(sourceKey, state);
    if (sourceKey === state.rootPlacementKey || !location || location.slot.kind !== "children" ||
      content.viewType !== "standoff-editor-block" || source.kind === "owned" && (source.externalReference || source.resolvedReference)) {
      throw new TreeCommandError("List wrapping requires an ordinary TextBlock child");
    }
    const parent = state.contents[location.ownerContentKey];
    const decoded = decodeDetachedSubtree({ id: createBlockId(), type: "indented-list-block", metadata: { htmlList: list }, children: [] });
    const wrapper = decoded.state.placements[decoded.rootPlacementKey];
    const children = [...parent.children];
    children[location.index!] = wrapper.key;
    const operations = prefixLength ? this.inlineReplacementOperations(state, sourceKey, 0, prefixLength, "") : [];
    if (checked !== undefined) {
      const owner = operations.find(op => op.kind === 'put-content' && op.record.key === content.key);
      if (!owner || owner.kind !== 'put-content') throw new TreeCommandError('Task conversion requires a native prefix edit');
      owner.record.payload.checked = checked;
    }
    operations.push(
      { kind: "put-content", record: this.updatedChildren(decoded.state.contents[wrapper.contentKey], [sourceKey]) },
      { kind: "put-placement", record: wrapper },
      { kind: "put-content", record: this.updatedChildren(parent, children) },
    );
    this.publish(prefixLength ? "Convert list prefix" : "Convert TextBlock to list", operations, {
      commandId: "tree.wrapTextBlockInList", subjects: [this.subject(state, sourceKey)],
    });
    return wrapper.key;
  }

  move(key: NodeKey | PlacementKey, destination: Destination): void {
    const state = this.current(true);
    const sourceKey = this.placementKey(key, state);
    const moving = state.placements[sourceKey];
    if (moving.kind === "owned" && (moving.externalReference || moving.resolvedReference)) throw new TreeCommandError("Owned resource transfer requires an explicit ownership operation");
    if (sourceKey === state.rootPlacementKey) {
      throw new TreeCommandError("The root Block cannot be moved");
    }
    if (
      (destination.kind === "before" || destination.kind === "after") &&
      this.placementKey(destination.anchorKey, state) === sourceKey
    ) {
      return;
    }
    const sourceLocation = this.location(sourceKey, state);
    if (!sourceLocation || sourceLocation.slot.kind !== "children") {
      throw new TreeCommandError("Only ordinary child placements can be moved");
    }
    const sourceOwner = state.contents[sourceLocation.ownerContentKey];
    const target = this.resolveInsertion(destination, sourceKey, state);
    const destinationChildren = [...target.children];
    destinationChildren.splice(target.index, 0, sourceKey);

    const operations: RepositoryOperation[] = [];
    if (sourceOwner.key === target.owner.key) {
      operations.push({
        kind: "put-content",
        record: this.updatedChildren(sourceOwner, destinationChildren),
      });
    } else {
      operations.push({
        kind: "put-content",
        record: this.updatedChildren(
          sourceOwner,
          sourceOwner.children.filter((childKey) => childKey !== sourceKey),
        ),
      });
      operations.push({
        kind: "put-content",
        record: this.updatedChildren(target.owner, destinationChildren),
      });
    }
    const sourceResource = this.localResource(moving.contentKey, state);
    if (!sourceResource || sourceResource !== this.localResource(target.owner.key, state)) {
      operations.push(...linkedSourcesForMove(this.current(), sourceKey, target.owner.key));
    }
    this.publish("Move Block", operations, { commandId: "tree.move", subjects: [this.subject(state, sourceKey)] });
  }

  /** Plan only the affected parent and empty leaf. Complex ownership retains
   * the general removal path; transactions already own a draft and use it. */
  private removeEmptyParagraph(key: NodeKey | PlacementKey): boolean {
    if (this.pending) return false;
    const state = this.repository.readState(), resolved = this.resolveOccurrence(key);
    const placement = resolved && state.placements[resolved];
    const location = resolved && this.repository.locationOf(resolved);
    if (!placement || !location || location.slot.kind !== "children") return false;
    const child = state.contents[placement.contentKey];
    if (!child || child.inlineKind !== "standoff" || contentLength(child) || child.children.length ||
      Object.keys(child.ownedRelations).length || this.repository.contentReferenceCount(child.key) !== 1) return false;
    const owner = state.contents[location.ownerContentKey];
    const operations: RepositoryOperation[] = [
      { kind: "put-content", record: this.updatedChildren(owner, owner.children.filter(k => k !== placement.key)) },
      { kind: "remove-placement", key: placement.key },
      ...(child.definitionOwnerKey ? [] : [{ kind: "remove-content" as const, key: child.key }]),
    ];
    if (!emptyParagraphChangeFor(state, operations, { get: k => this.repository.contentReferenceCount(k) })) return false;
    this.publish("Remove Block", operations, { commandId: "tree.remove", subjects: [this.subject(state, placement.key)] });
    return true;
  }

  private removeLocal(key: NodeKey | PlacementKey): boolean {
    const draft = this.pending?.local; if (!draft) return false;
    const state = draft.state, pk = this.resolveOccurrence(key), p = pk && state.placements[pk];
    if (!pk || !p) return true;
    const at = draft.locationOf(pk);
    if (pk === state.rootPlacementKey || !at || at.slot.kind !== 'children') return false;
    const operations: RepositoryOperation[] = [], counts = new Map<string, number>(), seen = new Set<string>();
    const remove = (key: string): boolean => {
      if (seen.has(key)) return false; seen.add(key);
      const p = state.placements[key];
      if (!p || p.kind === 'reference' || p.externalReference || p.resolvedReference || p.resourceRegistration) return false;
      const c = state.contents[p.contentKey];
      if (!c || ['document-block', 'workspace-block'].includes(c.viewType)) return false;
      operations.push({ kind: 'remove-placement', key });
      const count = (counts.get(c.key) ?? draft.referenceCount(c.key)) - 1; counts.set(c.key, count);
      if (count || c.definitionOwnerKey) return true;
      operations.push({ kind: 'remove-content', key: c.key });
      return [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)].every(remove);
    };
    if (!remove(pk)) return false;
    const owner = state.contents[at.ownerContentKey];
    operations.push({kind:'put-content',record:this.updatedChildren(owner,owner.children.filter(k=>k!==pk))});
    this.publish('Remove Block',operations,{commandId:'tree.remove',subjects:[this.subject(state,pk)]});
    return true;
  }
  remove(key: NodeKey | PlacementKey): void {
    this.assertContentEdit?.(key);
    if (this.removeLocal(key)) return;
    if (this.removeEmptyParagraph(key)) return;
    const state = this.state();
    const resolved = this.resolveOccurrence(key);
    if (!resolved || !state.placements[resolved]) return;
    if (resolved === state.rootPlacementKey) {
      throw new TreeCommandError("The root Block cannot be removed");
    }
    const removed = state.placements[resolved];
    if (removed.kind === "owned" && (removed.externalReference || removed.resolvedReference)) throw new TreeCommandError("Owned resource removal requires an explicit lifetime decision");
    const location = deriveLocations(state).get(resolved);
    if (!location) return;
    const owner = state.contents[location.ownerContentKey];
    let updatedOwner: ContentRecord;
    if (location.slot.kind === "children") {
      updatedOwner = this.updatedChildren(
        owner,
        owner.children.filter((childKey) => childKey !== resolved),
      );
    } else if (location.slot.kind === "relation") {
      updatedOwner = {
        ...clone(owner),
        ownedRelations: { ...owner.ownedRelations },
        wireRelation: "present",
        revision: owner.revision + 1,
      };
      delete updatedOwner.ownedRelations[location.slot.name];
    } else {
      throw new TreeCommandError("Inline Cells must be removed through an inline editing command");
    }

    const projected = clone(state);
    projected.contents[owner.key] = clone(updatedOwner);
    this.pruneUnreachable(projected);
    this.publish("Remove Block", this.diff(state, projected), { commandId: "tree.remove", subjects: [this.subject(state, resolved)] });
  }

  unwrap(key: NodeKey | PlacementKey): void {
    const current = this.current();
    if (hasBlockMode(current.contents[current.placements[this.placementKey(key, current)].contentKey].payload)) {
      throw new TreeCommandError('Unwrapping would remove this Block Mode; clear it explicitly first');
    }
    const state = this.state();
    const placementKey = this.placementKey(key, state);
    const unwrapped = state.placements[placementKey];
    if (unwrapped.resourceRegistration || unwrapped.kind === "owned" && (unwrapped.externalReference || unwrapped.resolvedReference)) throw new TreeCommandError("Cannot flatten a registered or owned resource");
    if (placementKey === state.rootPlacementKey) {
      throw new TreeCommandError("The root Block cannot be unwrapped");
    }
    const location = deriveLocations(state).get(placementKey);
    if (!location || location.slot.kind !== "children") {
      throw new TreeCommandError("Only an ordinary child can be unwrapped");
    }
    const placement = state.placements[placementKey];
    const content = state.contents[placement.contentKey];
    if (Object.keys(content.ownedRelations).length) {
      throw new TreeCommandError("Unwrap requires an explicit owned-relation policy");
    }
    const occurrences = Object.values(state.placements).filter(
      (candidate) => candidate.contentKey === content.key,
    );
    if (occurrences.length !== 1) {
      throw new TreeCommandError("Shared content must be detached before unwrapping");
    }
    const owner = state.contents[location.ownerContentKey];
    const index = owner.children.indexOf(placementKey);
    const children = [...owner.children];
    children.splice(index, 1, ...content.children);
    this.publish("Unwrap Block", [
      { kind: "put-content", record: this.updatedChildren(owner, children) },
      { kind: "remove-placement", key: placementKey },
      { kind: "remove-content", key: content.key },
    ], { commandId: "tree.unwrap", subjects: [this.subject(state, placementKey)] });
  }

  replace(
    key: NodeKey | PlacementKey,
    dto: ExistingBlockDto,
    childPolicy: "preserve" | "replace",
  ): PlacementKey {
    const current = this.current();
    const previous = current.contents[current.placements[this.placementKey(key, current)].contentKey];
    if (hasBlockMode(previous.payload) && (dto.mode !== previous.payload.mode || dto.type !== previous.payload.type)) {
      throw new TreeCommandError('Replacement would reinterpret this Block Mode; clear it explicitly first');
    }
    const state = this.state();
    const placementKey = this.placementKey(key, state);
    if (placementKey === state.rootPlacementKey) {
      throw new TreeCommandError("Use a root reload command to replace the root Block");
    }
    const previousPlacement = state.placements[placementKey];
    const previousContent = state.contents[previousPlacement.contentKey];
    const decoded = decodeDetachedSubtree(dto);
    prepareNewBlockIdentities(Object.values(decoded.state.contents));
    const decodedRootPlacement = decoded.state.placements[decoded.rootPlacementKey];
    const decodedRootContent = clone(decoded.state.contents[decodedRootPlacement.contentKey]);
    const next = clone(state);

    Object.assign(next.contents, clone(decoded.state.contents));
    Object.assign(next.placements, clone(decoded.state.placements));
    delete next.placements[decoded.rootPlacementKey];
    next.placements[placementKey] = {
      ...clone(previousPlacement),
      contentKey: decodedRootContent.key,
    };
    if (childPolicy === "preserve") {
      decodedRootContent.children = [...previousContent.children];
      decodedRootContent.wireChildren = previousContent.wireChildren;
      // Replacement transfers these placements; it consumes the old definition
      // when unshared, rather than leaving a second owner for the same slots.
      if (Object.values(state.placements).filter(p => p.contentKey === previousContent.key).length === 1) {
        delete next.contents[previousContent.key];
      }
    }
    next.contents[decodedRootContent.key] = decodedRootContent;
    this.pruneUnreachable(next);
    const previousSubject = this.subject(state, placementKey), nextSubject = this.subject(next, placementKey);
    this.publish("Replace Block", this.diff(state, next), {
      commandId: "tree.replace", subjects: [previousSubject, nextSubject],
      relation: { kind: "replace", previous: previousSubject, next: nextSubject },
    });
    return placementKey;
  }

  replaceRelation(
    ownerKey: NodeKey | PlacementKey,
    name: string,
    dto: ExistingBlockDto,
  ): PlacementKey {
    const state = this.state();
    const ownerPlacement = state.placements[this.placementKey(ownerKey, state)];
    const relationKey = state.contents[ownerPlacement.contentKey].ownedRelations[name];
    if (!relationKey) return this.setRelation(ownerKey, name, dto);
    return this.replace(relationKey, dto, "replace");
  }

  ensureMargin(ownerKey: NodeKey | PlacementKey, side: "left" | "right"): PlacementKey {
    const state = this.current();
    const owner = state.contents[state.placements[this.placementKey(ownerKey, state)].contentKey];
    if (owner.inlineKind !== "standoff") throw new TreeCommandError("Margins require a Standoff source block");
    const name = side === "left" ? "leftMargin" : "rightMargin";
    const text=marginText(side);
    const existing = owner.ownedRelations[name];
    if (existing) {
      const margin = state.contents[state.placements[existing].contentKey];
      if (margin.viewType !== `${side}-margin-block`) throw new TreeCommandError(`Incompatible ${name} relation`);
      const firstText = margin.children.find(key => state.contents[state.placements[key].contentKey].inlineKind === "standoff");
      if (firstText) return firstText;
      return this.insert(text, { kind: "at", parentKey: existing, index: margin.children.length });
    }
    const placement = this.setRelation(ownerKey, name, prepareMargin(side,[text]));
    const next = this.current();
    return next.contents[next.placements[placement].contentKey].children[0];
  }

  setRelation(
    ownerKey: NodeKey | PlacementKey,
    name: string,
    dto: ExistingBlockDto,
  ): PlacementKey {
    const state = this.state();
    const ownerPlacement = state.placements[this.placementKey(ownerKey, state)];
    const owner = state.contents[ownerPlacement.contentKey];
    if (owner.ownedRelations[name]) {
      throw new TreeCommandError(`Relation ${name} already exists; remove or replace it explicitly`);
    }
    if (Object.prototype.hasOwnProperty.call(owner.opaqueRelations, name)) {
      throw new TreeCommandError(`Relation ${name} is preserved as opaque wire data`);
    }
    const decoded = decodeDetachedSubtree(dto);
    prepareNewBlockIdentities(Object.values(decoded.state.contents));
    const updatedOwner: ContentRecord = {
      ...clone(owner),
      ownedRelations: { ...owner.ownedRelations, [name]: decoded.rootPlacementKey },
      wireRelation: "present",
      revision: owner.revision + 1,
    };
    this.publish("Set relation", [
      ...Object.values(decoded.state.contents).map(
        (record): RepositoryOperation => ({ kind: "put-content", record }),
      ),
      ...Object.values(decoded.state.placements).map(
        (record): RepositoryOperation => ({ kind: "put-placement", record }),
      ),
      { kind: "put-content", record: updatedOwner },
    ], { commandId: "tree.setRelation", subjects: [this.subject(state, ownerPlacement.key), this.subject(decoded.state, decoded.rootPlacementKey)] });
    return decoded.rootPlacementKey;
  }

  removeRelation(ownerKey: NodeKey | PlacementKey, name: string): void {
    const state = this.state();
    const ownerPlacement = state.placements[this.placementKey(ownerKey, state)];
    const relationKey = state.contents[ownerPlacement.contentKey].ownedRelations[name];
    if (relationKey) this.remove(relationKey);
  }

  setPayloadField(
    key: NodeKey | PlacementKey,
    field: string,
    value: unknown,
    label = "Update Block",
    annotationOrigins?: (number|null)[],
  ): void {
    if (field === "children" || field === "relation") {
      throw new TreeCommandError(`${field} must be changed through structural commands`);
    }
    const state = this.current(true);
    const placement = state.placements[this.placementKey(key, state)];
    const content = state.contents[placement.contentKey];
    if (Object.is(content.payload[field], value)) return;
    const payload = { ...clone(content.payload), [field]: clone(value) };
    if (field === 'mode' && value === undefined) delete payload.mode;
    this.publish(label, [
      {
        kind: "put-content",
        ...(field === "standoffProperties" && annotationOrigins ? { annotationOrigins } : {}),
        record: {
          ...clone(content),
          payload,
          revision: content.revision + 1,
        },
      },
    ], { commandId: "tree.setPayloadField", subjects: [this.subject(state, placement.key)] });
  }

  replaceInlineRange(
    key: NodeKey | PlacementKey,
    start: number,
    end: number,
    text: string,
    label = "Edit Standoff text",
  ): void {
    const state = this.current(true);
    const placement = this.placementKey(key, state);
    const command = {commandId: "tree.replaceInlineRange", subjects: [this.subject(state, placement)]};
    if (!this.pending && this.repository.commitResidentText(
      state.placements[placement].contentKey, start, end, text, label, {commands: [command]},
    )) return;
    this.publish(label, this.inlineReplacementOperations(state, placement, start, end, text), command);
  }

  /** Shared native text planner; composed edits retain the same annotation mapping. */
  private inlineReplacementOperations(state: RepositoryState, key: PlacementKey, start: number, end: number, text: string): RepositoryOperation[] {
    const placement = state.placements[key];
    const content = state.contents[placement.contentKey];
    if (content.inlineKind !== "standoff") {
      throw new TreeCommandError("Inline text operations require a Standoff content record");
    }
    if(content.compactInline){
      const annotationOrigins:(number|null)[]=[],insert=text?[{kind:'text' as const,text}]:[];
      const record=replaceCompact(content,start,end,insert,annotationOrigins);
      if(Object.keys(record.ownedRelations).length!==Object.keys(content.ownedRelations).length){
        // Deleting a slot is a structural edit: retain the established liveness,
        // reference and inverse-operation semantics for its owned closure.
        const next=clone(state);next.contents[content.key]=record;this.pruneUnreachable(next);
        return this.diff(state,next).map(op=>op.kind==='put-content'&&op.record.key===content.key?{...op,annotationOrigins,inlineSplice:{start,end,insert}}:op);
      }
      return [{kind:'put-content',record,annotationOrigins,inlineSplice:{start,end,insert}}];
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > content.inlineContent.length) {
      throw new TreeCommandError(`Invalid inline range ${start}..${end}`);
    }

    const removed = content.inlineContent.slice(start, end);
    let incremental = (!this.pending || !!this.pending.local) && removed.every((key) =>
      isTextLeaf(state.contents[state.placements[key].contentKey]));
    const operations: RepositoryOperation[] = [];
    const inserted: PlacementKey[] = [];
    for (const character of [...text]) {
      const contentKey = createContentKey();
      const placementKey = createPlacementKey();
      operations.push({ kind: "put-content", record: {
        key: contentKey,
        viewType: "text-cell",
        payload: { text: character },
        children: [],
        inlineContent: [],
        inlineRevision: 0,
        ownedRelations: {},
        opaqueRelations: {},
        wireChildren: "omitted",
        wireRelation: "omitted",
        revision: 0,
      } });
      operations.push({ kind: "put-placement", record: { key: placementKey, contentKey, kind: "inline" } });
      inserted.push(placementKey);
    }

    const nextInline = [...content.inlineContent];
    nextInline.splice(start, end - start, ...inserted);
    const payload = clone(content.payload);
    const removedSuperpositionRelations: string[] = [];
    const annotationOrigins: (number | null)[] = [];
    if (Array.isArray(payload.standoffProperties)) {
      const previous = payload.standoffProperties;
      const mapped = mapStandoffPropertiesForReplacement(
        payload.standoffProperties,
        start,
        end,
        inserted.length,
        annotationOrigins,
        content.inlineContent.length,
      );
      const surviving = new Set(mapped.flatMap(property => property && typeof property === "object" &&
        (property as Record<string, unknown>).type === "text/superposition"
        ? [String((property as Record<string, unknown>).id ?? "")] : []));
      for (const property of previous) if (property && typeof property === "object") {
        const candidate = property as Record<string, unknown>;
        if (candidate.type === "text/superposition" && !surviving.has(String(candidate.id ?? "")) && Array.isArray(candidate.alternatives)) {
          removedSuperpositionRelations.push(...candidate.alternatives.filter((name): name is string => typeof name === "string" && name.startsWith("superposition:")));
        }
      }
      payload.standoffProperties = mapped;
    }
    if (removedSuperpositionRelations.length) incremental = false;
    const ownedRelations = { ...content.ownedRelations };
    for (const relation of removedSuperpositionRelations) delete ownedRelations[relation];
    operations.push({ kind: "put-content", annotationOrigins, record: {
      ...clone(content),
      payload,
      inlineContent: nextInline,
      ownedRelations,
      inlineRevision: content.inlineRevision + 1,
      revision: content.revision + 1,
    } });
    if (incremental) {
      const removedReferences = new Map<string, number>();
      for (const key of removed) {
        operations.push({ kind: "remove-placement", key });
        const contentKey = state.placements[key].contentKey;
        removedReferences.set(contentKey, (removedReferences.get(contentKey) ?? 0) + 1);
      }
      for (const [key, count] of removedReferences) {
        if ((this.pending?.local?.referenceCount(key) ?? this.repository.contentReferenceCount(key)) === count) operations.push({ kind: "remove-content", key });
      }
      return operations;
    }
    // Structural inline atoms retain full graph planning. Materialize the private
    // write set before enumeration; never clone its inherited read-through view.
    if (this.pending?.local) state = this.current();
    const next = clone(state);
    for (const operation of operations) {
      if (operation.kind === "put-content") next.contents[operation.record.key] = operation.record;
      if (operation.kind === "put-placement") next.placements[operation.record.key] = operation.record;
    }
    this.pruneUnreachable(next);
    return this.diff(state, next);
  }

  transclude(
    sourceKey: NodeKey | PlacementKey,
    destination: Destination,
  ): PlacementKey {
    const state = this.state();
    const source = state.placements[this.placementKey(sourceKey, state)];
    const target = this.resolveInsertion(destination, undefined, state);
    const placementKey = createPlacementKey();
    let resolvedReference = source.resolvedReference;
    let retainedSource: ContentRecord | undefined;
    if (!source.externalReference) {
      const owner = resourceOwner(state, source.contentKey), destinationOwner = resourceOwner(state, target.owner.key);
      if (owner && destinationOwner && owner.key !== destinationOwner.key) {
        const id = readBlockId(state.contents[source.contentKey]);
        if (!id) throw new TreeCommandError("Foreign transclusion needs an authored target identity");
        resolvedReference = { kind: "block", targetId: id, source: resourceSource(owner)!, version: { kind: "unpinned" } };
        const content = state.contents[source.contentKey];
        // Resource membership must outlive the source's last owned placement.
        // Establish it in the authored reference command, never during Save.
        if (owner.viewType === "document-block" && content !== owner && content.definitionOwnerKey === undefined) {
          retainedSource = { ...clone(content), definitionOwnerKey: owner.key };
        }
      } else if (owner && destinationOwner) resolvedReference = undefined;
    }
    const children = [...target.children];
    children.splice(target.index, 0, placementKey);
    this.publish("Transclude Block", [
      ...(retainedSource ? [{ kind: "put-content" as const, record: retainedSource }] : []),
      {
        kind: "put-placement",
        record: { key: placementKey, contentKey: source.contentKey, kind: "reference",
          ...(resolvedReference ? { resolvedReference: clone(resolvedReference) } : {}),
          ...(source.externalReference ? { externalReference: clone(source.externalReference) } : {}) },
      },
      { kind: "put-content", record: this.updatedChildren(target.owner, children) },
    ], { commandId: "tree.transclude", subjects: [this.subject(state, source.key), { contentKey: source.contentKey, placementKey,
      ...(source.externalReference ? {} : { blockId: readBlockId(state.contents[source.contentKey]) }) }] });
    return placementKey;
  }

  unlink(key: NodeKey | PlacementKey): void {
    const state = this.state();
    const placement = state.placements[this.placementKey(key, state)];
    if (placement.kind !== "reference") {
      throw new TreeCommandError("Only a reference placement can be unlinked");
    }
    this.remove(placement.key);
  }

  detach(key: NodeKey | PlacementKey): void {
    const state = this.state();
    const placementKey = this.placementKey(key, state);
    const placement = state.placements[placementKey];
    if (placement.externalReference) throw new TreeCommandError("The external target is unavailable for an authored copy");
    if (placement.kind !== "reference") {
      throw new TreeCommandError("Only a reference placement can be detached");
    }
    const next = clone(state);
    const contentMap = new Map<string, string>();

    const copyContent = (sourceContentKey: string): string => {
      const mapped = contentMap.get(sourceContentKey);
      if (mapped) return mapped;
      const source = state.contents[sourceContentKey];
      const copiedKey = createContentKey();
      contentMap.set(sourceContentKey, copiedKey);
      const payload = clone(source.payload);
      if (isAuthoredBlock(source)) payload.id = createBlockId();
      const copied = {
        ...clone(source),
        key: copiedKey,
        payload,
        children: [] as PlacementKey[],
        inlineContent: [] as PlacementKey[],
        ownedRelations: {} as Record<string, PlacementKey>,
        revision: 0,
      };
      next.contents[copiedKey] = copied;
      copied.children = source.children.map(copyPlacement);
      copied.inlineContent = source.inlineContent.map(copyPlacement);
      copied.ownedRelations = Object.fromEntries(
        Object.entries(source.ownedRelations).map(([name, relationKey]) => [
          name,
          copyPlacement(relationKey),
        ]),
      );
      return copiedKey;
    };

    const copyPlacement = (sourcePlacementKey: PlacementKey): PlacementKey => {
      const source = state.placements[sourcePlacementKey];
      const copiedKey = createPlacementKey();
      const contentKey =
        source.kind === "reference" ? source.contentKey : copyContent(source.contentKey);
      next.placements[copiedKey] = {
        key: copiedKey,
        contentKey,
        kind: source.kind,
        ...(source.externalReference ? { externalReference: clone(source.externalReference) } : {}),
      };
      return copiedKey;
    };

    const copiedContentKey = copyContent(placement.contentKey);
    next.placements[placementKey] = {
      ...clone(placement),
      key: placementKey,
      contentKey: copiedContentKey,
      kind: "owned",
    };
    this.pruneUnreachable(next);
    const pairs = [...contentMap].filter(([key]) => isAuthoredBlock(state.contents[key])).map(([source, copy]) => ({
      source: { contentKey: source, blockId: readBlockId(state.contents[source]) },
      copy: { contentKey: copy, blockId: readBlockId(next.contents[copy]) },
    }));
    const ids = new Map(pairs.filter(pair => pair.source.blockId).map(pair => [pair.source.blockId!, pair.copy.blockId!]));
    for (const pair of pairs) remapKnownBlockReferences(next.contents[pair.copy.contentKey].payload, ids);
    this.publish("Detach transclusion", this.diff(state, next), { commandId: "tree.detach", subjects: [this.subject(state, placementKey), this.subject(next, placementKey)], relation: { kind: "copy", pairs } });
  }

  copy(key: NodeKey | PlacementKey, destination: Destination): PlacementKey {
    const state = this.current();
    const placementKey = this.placementKey(key, state);
    const content=state.contents[state.placements[placementKey].contentKey];
    if(content.compactInline?.spans.some(a=>a.kind==='alternative')){
      if(!this.inlineInteroperability())throw new TreeCommandError('Inline alternative clipboard interoperability is disabled.');
      const owner=resourceOwner(state,content.key,indexedResourceLookup(this.repository)),scope=owner?{resourceId:String(owner.payload.id)}:{};
      const serialized=serializeSelection(state,[{placementKey}],scope,false,undefined,undefined,indexedResourceLookup(this.repository));
      if(serialized.embeds.length)throw new TreeCommandError('Use native clipboard copy and paste for alternatives containing images so resource availability can be checked. Nothing was copied.');
      const fragment=materializeFragment(serialized,scope);
      return this.insertFragment(fragment,destination,{commandId:'tree.copy',subjects:[this.subject(state,placementKey),this.subject(fragment.state,fragment.roots[0])]})[0];
    }
    // Stage A retains the old command's explicit legacy-export limitations.
    // Copy the canonical graph itself so internal shared identity is preserved.
    encodeDocument(state, placementKey);
    const fragment = cloneBlocks(captureBlocks(state, [placementKey]));
    return this.insertFragment(fragment, destination, { commandId: "tree.copy",
      subjects: [this.subject(state, placementKey), this.subject(fragment.state, fragment.roots[0])],
    })[0];
  }

  insertEmptyStandoffSibling(key: NodeKey | PlacementKey, side: "before" | "after", checked?: boolean): PlacementKey {
    const state = this.current(true);
    const placementKey = this.placementKey(key, state);
    const content = state.contents[state.placements[placementKey].contentKey];
    const modeError = modeContinuationError(content.payload);
    if (modeError) throw new TreeCommandError(modeError);
    if (content.inlineKind !== "standoff") throw new TreeCommandError("Expected a Standoff paragraph");
    const location = this.location(placementKey,state);
    if (!location || location.slot.kind !== "children") throw new TreeCommandError("A Standoff relation/root needs an explicit insertion policy");
    const parent = state.contents[location.ownerContentKey];
    const decoded = decodeDetachedSubtree({
      ...clone(content.payload), id: createBlockId(), type: "standoff-editor-block",
      text: "", standoffProperties: [], children: [], ...(checked === undefined ? {} : { checked }),
    });
    if(content.compactInline)decoded.state.contents[decoded.state.placements[decoded.rootPlacementKey].contentKey].compactInline={version:1,spans:[]};
    const children = [...parent.children];
    children.splice(location.index! + (side === "after" ? 1 : 0), 0, decoded.rootPlacementKey);
    this.publish("Insert Standoff paragraph", [
      ...Object.values(decoded.state.contents).map(record => ({ kind: "put-content" as const, record })),
      ...Object.values(decoded.state.placements).map(record => ({ kind: "put-placement" as const, record })),
      { kind: "put-content", record: this.updatedChildren(parent, children) },
    ], { commandId: "tree.insertEmptyStandoffSibling", subjects: [this.subject(decoded.state, decoded.rootPlacementKey)] });
    return decoded.rootPlacementKey;
  }

  splitStandoff(key: NodeKey | PlacementKey, index: number, checked?: boolean): PlacementKey {
    const state = this.current(true);
    const placementKey = this.placementKey(key, state);
    const placement = state.placements[placementKey];
    const content = state.contents[placement.contentKey];
    const modeError = modeContinuationError(content.payload);
    if (modeError) throw new TreeCommandError(modeError);
    if (content.inlineKind !== "standoff") {
      throw new TreeCommandError("Only Standoff content can be split");
    }
    if(content.compactInline&&(this.pending?.local?.referenceCount(content.key)??this.repository.contentReferenceCount(content.key))>1)throw new TreeCommandError('Detach shared content before splitting its structure');
    if (!Number.isInteger(index) || index <= 0 || index >= contentLength(content)) {
      throw new TreeCommandError("Boundary splits use ordinary before/after insertion");
    }
    const location = this.location(placementKey,state);
    if (!location || location.slot.kind !== "children") {
      throw new TreeCommandError("A Standoff relation/root needs an explicit split policy");
    }
    const parent = state.contents[location.ownerContentKey];
    const operations: RepositoryOperation[] = [];
    const rightContentKey = createContentKey();
    const rightPlacementKey = createPlacementKey();
    const annotations = (content.payload.standoffProperties as Array<Record<string, unknown>> | undefined) ?? [];
    const leftAnnotations: Array<Record<string, unknown>> = [];
    const rightAnnotations: Array<Record<string, unknown>> = [];
    for (const annotation of annotations) {
      const start = Number(annotation.start);
      const end = Number(annotation.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        leftAnnotations.push(clone(annotation));
      } else if (annotation.isZeroWidth === true) {
        const affinity = pointAffinity(annotation, contentLength(content));
        if (start < index || start === index && affinity === "before") leftAnnotations.push({ ...clone(annotation), affinity });
        else rightAnnotations.push({ ...clone(annotation), start: start - index, end: (content.compactInline ? end : start) - index, affinity });
      } else if (end < index) {
        leftAnnotations.push(clone(annotation));
      } else if (start >= index) {
        rightAnnotations.push({ ...clone(annotation), start: start - index, end: end - index });
      } else {
        leftAnnotations.push({ ...clone(annotation), end: index - 1 });
        rightAnnotations.push({
          ...clone(annotation),
          id: typeof annotation.id === "string" ? globalThis.crypto.randomUUID() : annotation.id,
          start: 0,
          end: end - index,
        });
      }
    }
    const leftPayload: Record<string, unknown> = { ...clone(content.payload), standoffProperties: leftAnnotations };
    const rightPayload: Record<string, unknown> = { ...clone(content.payload), standoffProperties: rightAnnotations };
    rightPayload.id = createBlockId();
    if (checked !== undefined) rightPayload.checked = checked;
    const rightReadingNames=new Set(content.compactInline?inlineSlice(content.compactInline.spans,index,contentLength(content)).flatMap(a=>a.kind==='alternative'?a.properties.readings:[]):[]);
    const leftRelations=Object.fromEntries(Object.entries(content.ownedRelations).filter(([name])=>!rightReadingNames.has(name)));
    const rightRelations=Object.fromEntries(Object.entries(content.ownedRelations).filter(([name])=>rightReadingNames.has(name)));
    operations.push({ kind: "put-content", record: {
      ...clone(content),
      ownedRelations:leftRelations,
      payload: leftPayload,
      inlineContent: content.inlineContent.slice(0, index),
      ...(content.compactInline ? {compactInline:{version:1 as const,spans:inlineSlice(content.compactInline.spans,0,index)}}:{}),
      inlineRevision: content.inlineRevision + 1,
      revision: content.revision + 1,
    } });
    operations.push({ kind: "put-content", record: {
      ...clone(content),
      key: rightContentKey,
      payload: rightPayload,
      children: [],
      inlineContent: content.inlineContent.slice(index),
      ...(content.compactInline ? {compactInline:{version:1 as const,spans:inlineSlice(content.compactInline.spans,index,contentLength(content))}}:{}),
      inlineRevision: 0,
      ownedRelations: rightRelations,
      opaqueRelations: {},
      wireChildren: "present",
      wireRelation: Object.keys(rightRelations).length?"present":"omitted",
      revision: 0,
    } });
    operations.push({ kind: "put-placement", record: {
      key: rightPlacementKey,
      contentKey: rightContentKey,
      kind: "owned",
    } });
    const parentChildren = [...parent.children];
    parentChildren.splice((location.index ?? 0) + 1, 0, rightPlacementKey);
    operations.push({ kind: "put-content", record: this.updatedChildren(parent, parentChildren) });
    const source = this.subject(state, placementKey);
    const created = { contentKey: rightContentKey, placementKey: rightPlacementKey, blockId: String(rightPayload.id) };
    this.publish("Split Standoff Block", operations, { commandId: "tree.splitStandoff", subjects: [source, created], relation: { kind: "split", source, created, at: index } });
    return rightPlacementKey;
  }

  joinStandoff(
    leftKey: NodeKey | PlacementKey,
    rightKey: NodeKey | PlacementKey,
  ): number {
    const current = this.current(true);
    const modeError = modeJoinError(
      current.contents[current.placements[this.placementKey(leftKey, current)].contentKey].payload,
      current.contents[current.placements[this.placementKey(rightKey, current)].contentKey].payload,
    );
    if (modeError) throw new TreeCommandError(modeError);
    const compactLeft=current.contents[current.placements[this.placementKey(leftKey,current)].contentKey],compactRight=current.contents[current.placements[this.placementKey(rightKey,current)].contentKey];
    if(compactLeft.compactInline||compactRight.compactInline){
      if(!this.inlineInteroperability()&&[compactLeft,compactRight].some(c=>c.compactInline?.spans.some(a=>a.kind==='alternative')))throw new TreeCommandError('Inline alternative structural interoperability is disabled.');
      if(!compactLeft.compactInline||!compactRight.compactInline)throw new TreeCommandError('Joining different canonical representations is not supported');
      if(compactRight.children.length||Object.keys(compactRight.ownedRelations).some(name=>!isReadingRelation(name))||Object.keys(compactRight.opaqueRelations).length)throw new TreeCommandError('Move paragraph attachments before joining');
      const left=this.placementKey(leftKey,current),right=this.placementKey(rightKey,current),at=contentLength(compactLeft);
      const result=planCrossTextEdit(current,[{placementKey:left,start:at,end:at},{placementKey:right,start:0,end:0}],'',{locationOf:k=>this.location(k,current),referenceCount:k=>this.pending?.local?.referenceCount(k)??this.repository.contentReferenceCount(k)});
      this.publish('Join Standoff Blocks',result.operations!,{commandId:'tree.joinStandoff',subjects:result.inputs,relation:{kind:'join',survivor:result.inputs[0],absorbed:result.inputs[1],at}});return at;
    }
    const state = this.state();
    const leftPlacementKey = this.placementKey(leftKey, state);
    const rightPlacementKey = this.placementKey(rightKey, state);
    const locations = deriveLocations(state);
    const leftLocation = locations.get(leftPlacementKey);
    const rightLocation = locations.get(rightPlacementKey);
    if (
      !leftLocation ||
      !rightLocation ||
      leftLocation.slot.kind !== "children" ||
      rightLocation.slot.kind !== "children" ||
      leftLocation.ownerContentKey !== rightLocation.ownerContentKey ||
      (leftLocation.index ?? -1) + 1 !== rightLocation.index
    ) {
      throw new TreeCommandError("Join requires adjacent ordinary siblings");
    }
    const leftPlacement = state.placements[leftPlacementKey];
    const rightPlacement = state.placements[rightPlacementKey];
    const left = state.contents[leftPlacement.contentKey];
    const right = state.contents[rightPlacement.contentKey];
    if (left.inlineKind !== "standoff" || right.inlineKind !== "standoff") {
      throw new TreeCommandError("Join requires two Standoff Blocks");
    }
    if (right.children.length || Object.keys(right.ownedRelations).length) {
      throw new TreeCommandError("Joining a Standoff Block with attachments needs an explicit policy");
    }
    if (Object.values(state.placements).filter((candidate) => candidate.contentKey === right.key).length !== 1) {
      throw new TreeCommandError("Detach shared right-hand content before joining it");
    }
    if (!!left.compactInline !== !!right.compactInline) throw new TreeCommandError("Joining different canonical representations is not supported");
    const joinIndex = contentLength(left);
    const leftAnnotations = (left.payload.standoffProperties as Array<Record<string, unknown>> | undefined) ?? [];
    const rightAnnotations = ((right.payload.standoffProperties as Array<Record<string, unknown>> | undefined) ?? []).map((annotation) => ({
      ...clone(annotation),
      start: typeof annotation.start === "number" ? annotation.start + joinIndex : annotation.start,
      end: typeof annotation.end === "number" ? annotation.end + joinIndex : annotation.end,
    }));
    const next = clone(state);
    next.contents[left.key] = {
      ...clone(left),
      payload: { ...clone(left.payload), standoffProperties: [...clone(leftAnnotations), ...rightAnnotations] },
      inlineContent: [...left.inlineContent, ...right.inlineContent],
      ...(left.compactInline ? {compactInline:{version:1 as const,spans:normalizeInline([...left.compactInline.spans,...right.compactInline!.spans])}}:{}),
      inlineRevision: left.inlineRevision + 1,
      revision: left.revision + 1,
    };
    const parent = state.contents[leftLocation.ownerContentKey];
    next.contents[parent.key] = this.updatedChildren(
      parent,
      parent.children.filter((candidate) => candidate !== rightPlacementKey),
    );
    // Join explicitly consumes the right definition and transfers its Cells.
    // Membership retention applies to unlink, not to a recorded merge.
    delete next.contents[right.key];
    this.pruneUnreachable(next);
    const survivor = this.subject(state, leftPlacementKey), absorbed = this.subject(state, rightPlacementKey);
    this.publish("Join Standoff Blocks", this.diff(state, next), { commandId: "tree.joinStandoff", subjects: [survivor, absorbed], relation: { kind: "join", survivor, absorbed, at: joinIndex } });
    return joinIndex;
  }

  /** One native structural transaction. Reading coordinates are never inserted
   * into the host sequence, and no character records are materialised. */
  insertInlineAlternative(key:NodeKey|PlacementKey,index:number,readings:ExistingBlockDto[],metadata:JsonObject={}):string {
    const state=this.current(true),placement=this.placementKey(key,state),host=state.contents[state.placements[placement].contentKey];
    if(!host.compactInline||!readings.length)throw new TreeCommandError('Inline alternatives require compact text and at least one reading');
    const prepare=(dto:ExistingBlockDto):ExistingBlockDto=>{
      if(dto.type!=='standoff-editor-block'||dto.children?.length||Object.keys(dto.relation??{}).some(name=>!isReadingRelation(name)))throw new TreeCommandError('Inline readings must be rich inline TextBlocks');
      const {text, ...rest}=clone(dto);
      return {...rest,id:crypto.randomUUID(),inlineAtoms:dto.inlineAtoms??(text?[{kind:'text',text}]:[]),
        ...(dto.relation?{relation:Object.fromEntries(Object.entries(dto.relation).map(([name,d])=>[name,prepare(d as ExistingBlockDto)]))}:{})};
    };
    const decoded=readings.map(d=>decodeDetachedSubtree(prepare(d))),names=readings.map(()=>INLINE_READING+crypto.randomUUID());
    const id=crypto.randomUUID(),insert=[{kind:'alternative' as const,properties:{version:1 as const,id,readings:names,metadata:clone(metadata)}}];
    const staged={...clone(host),ownedRelations:{...host.ownedRelations,...Object.fromEntries(names.map((n,i)=>[n,decoded[i].rootPlacementKey]))},wireRelation:'present' as const};
    const origins:(number|null)[]=[],record=replaceCompact(staged,index,index,insert,origins);
    const operations:RepositoryOperation[]=decoded.flatMap(d=>[...Object.values(d.state.contents).map(record=>({kind:'put-content' as const,record})),...Object.values(d.state.placements).map(record=>({kind:'put-placement' as const,record}))]);
    operations.push({kind:'put-content',record,annotationOrigins:origins,inlineSplice:{start:index,end:index,insert}});
    this.publish('Insert inline alternative',operations,{commandId:'tree.insertInlineAlternative',subjects:[this.subject(state,placement)]});return id;
  }

  insertInlineImage(
    key: NodeKey | PlacementKey,
    index: number,
    descriptor: InlineImageDescriptor,
  ): PlacementKey | CompactInlineAddress {
    const state = this.current(true);
    const hostPlacement = state.placements[this.placementKey(key, state)];
    const host = state.contents[hostPlacement.contentKey];
    if (host.inlineKind !== "standoff") {
      throw new TreeCommandError("Inline images require a Standoff host");
    }
    if(host.compactInline){
      const insert=[{kind:'image' as const,properties:clone(descriptor) as unknown as JsonObject}],annotationOrigins:(number|null)[]=[];
      const record=replaceCompact(host,index,index,insert,annotationOrigins);
      this.publish('Insert inline image',[{kind:'put-content',record,annotationOrigins,inlineSplice:{start:index,end:index,insert}}],{commandId:'tree.insertInlineImage',subjects:[this.subject(state,hostPlacement.key)]});
      return {kind:'compact-inline',ownerPlacementKey:hostPlacement.key,index,inlineRevision:record.inlineRevision};
    }
    if (index < 0 || index > host.inlineContent.length) {
      throw new TreeCommandError(`Invalid inline insertion index ${index}`);
    }
    const imageContentKey = createContentKey();
    const imagePlacementKey = createPlacementKey();
    const inlineContent = [...host.inlineContent];
    inlineContent.splice(index, 0, imagePlacementKey);
    this.publish("Insert inline image", [
      {
        kind: "put-content",
        record: {
          key: imageContentKey,
          viewType: "image-cell",
          payload: clone(descriptor) as unknown as Record<string, unknown>,
          children: [],
          inlineContent: [],
          inlineRevision: 0,
          ownedRelations: {},
          opaqueRelations: {},
          wireChildren: "omitted",
          wireRelation: "omitted",
          revision: 0,
        },
      },
      {
        kind: "put-placement",
        record: { key: imagePlacementKey, contentKey: imageContentKey, kind: "inline" },
      },
      {
        kind: "put-content",
        record: {
          ...clone(host),
          inlineContent,
          inlineRevision: host.inlineRevision + 1,
          revision: host.revision + 1,
        },
      },
    ], { commandId: "tree.insertInlineImage", subjects: [this.subject(state, hostPlacement.key), { contentKey: imageContentKey, placementKey: imagePlacementKey }] });
    return imagePlacementKey;
  }

  moveInline(
    key: NodeKey | PlacementKey,
    fromIndex: number,
    toIndex: number,
  ): void {
    const state = this.state();
    const hostPlacement = state.placements[this.placementKey(key, state)];
    const host = state.contents[hostPlacement.contentKey];
    const sequence = [...host.inlineContent];
    if (fromIndex < 0 || fromIndex >= sequence.length) throw new TreeCommandError("Invalid inline source index");
    const [moving] = sequence.splice(fromIndex, 1);
    if (toIndex < 0 || toIndex > sequence.length) throw new TreeCommandError("Invalid inline destination index");
    sequence.splice(toIndex, 0, moving);
    this.publish("Move inline item", [
      {
        kind: "put-content",
        record: {
          ...clone(host),
          inlineContent: sequence,
          inlineRevision: host.inlineRevision + 1,
          revision: host.revision + 1,
        },
      },
    ], { commandId: "tree.moveInline", subjects: [this.subject(state, hostPlacement.key)] });
  }

  updateInlineImage(
    key: NodeKey | PlacementKey | CompactInlineAddress,
    patch: Partial<InlineImageDescriptor>,
  ): void {
    const state = this.current(true);
    let editing: {placementKey:string;index:number}|undefined;
    if(typeof key==='string')editing=this.resolveEditingAtom?.(key);
    else {const owner=state.contents[state.placements[key.ownerPlacementKey]?.contentKey];if(!owner?.compactInline||owner.inlineRevision!==key.inlineRevision)throw new TreeCommandError('The inline object address is stale');editing={placementKey:key.ownerPlacementKey,index:key.index};}
    if(editing){
      const host=state.contents[state.placements[editing.placementKey].contentKey],atom=inlineSlice(host.compactInline!.spans,editing.index,editing.index+1)[0];
      if(atom?.kind!=='image')throw new TreeCommandError('The inline item is not an image');
      const updated={kind:'image' as const,properties:{...clone(atom.properties),...clone(patch)}};
      if(JSON.stringify(updated)===JSON.stringify(atom))return;
      const record={...clone(host),compactInline:{version:1 as const,spans:normalizeInline([...inlineSlice(host.compactInline!.spans,0,editing.index),updated,...inlineSlice(host.compactInline!.spans,editing.index+1,contentLength(host))])},inlineRevision:host.inlineRevision+1,revision:host.revision+1};
      this.publish('Update inline image',[{kind:'put-content',record,inlineSplice:{start:editing.index,end:editing.index+1,insert:[updated]}}],{commandId:'tree.updateInlineImage',subjects:[this.subject(state,editing.placementKey)]});return;
    }
    const placement = state.placements[this.placementKey(key as string, state)];
    const content = state.contents[placement.contentKey];
    if (content.viewType !== "image-cell") throw new TreeCommandError("The inline item is not an image");
    this.publish("Update inline image", [
      {
        kind: "put-content",
        record: {
          ...clone(content),
          payload: { ...clone(content.payload), ...clone(patch) },
          revision: content.revision + 1,
        },
      },
    ], { commandId: "tree.updateInlineImage", subjects: [this.subject(state, placement.key)] });
  }

  setBackground(
    key: NodeKey | PlacementKey,
    descriptor: ExistingBlockDto,
  ): PlacementKey {
    const state = this.state();
    const currentPlacement = state.placements[this.placementKey(key, state)];
    const current = state.contents[currentPlacement.contentKey];
    const currentType = String(current.payload.type ?? current.viewType);
    const nextType = String(descriptor.type ?? "");
    if (hasBlockMode(current.payload) && (nextType !== currentType ||
      Object.prototype.hasOwnProperty.call(descriptor, 'mode') && descriptor.mode !== current.payload.mode)) {
      throw new TreeCommandError('Background conversion would reinterpret this Block Mode; clear it explicitly first');
    }
    const types = ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"];
    if (!types.includes(currentType) || !types.includes(nextType)) {
      throw new TreeCommandError("Background replacement requires two background descriptors");
    }
    // A background is a descriptor of a stable surface, including when it is
    // the root. Never replace the content identity or discard owned relations.
    const { children: _children, relation: _relation, ...payload } = clone(descriptor);
    if (payload.id !== undefined && payload.id !== current.payload.id) throw new TreeCommandError("A background descriptor cannot change the surface identity");
    if (payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)) {
      payload.metadata = { ...(current.payload.metadata as Record<string, unknown> ?? {}), ...payload.metadata };
    }
    this.publish("Change Background", [{ kind: "put-content", record: {
      ...clone(current), viewType: nextType,
      payload: { ...clone(current.payload), ...payload }, revision: current.revision + 1,
    } }], { commandId: "tree.setBackground", subjects: [this.subject(state, currentPlacement.key)] });
    return currentPlacement.key;
  }
}
