import {validateAlternativeReadings, validateReadingOwnership, isReadingRelation} from './inline-alternative';
import { compactInlineOwnerFor } from "./compact-inline-plan";
import { inlineLength, inlineSlice, normalizeInline, validateCompactInline } from "./inline-sequence";
import { glossChangeFor } from "./gloss-plan";
import { structuralChangeFor, type StructuralChange } from "./structural-plan";
import { taskStateChangeFor } from './task-state-plan';
import { listWrapChangeFor, type ListWrapChange } from "./list-wrap-plan";
import { recordOperations } from "./record-batch";
import {documentTabParentFor} from './document-tab-plan';
import { batch, createSignal } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { inlineOwnerFor } from "./inline-plan";
import { emptyParagraphChangeFor, splitChangeFor, type SplitChange, type EmptyParagraphChange } from "./split-plan";
import { clone } from "./clone";
import { UndoStorage, type StoredHistoryEntry } from "./undo-storage";
import { isOwnedResourceTarget, validateResourceRegistrations, resourceOwnership } from "./resource-registration";
import { ReferenceBookkeeping } from "./reference-bookkeeping";
import { ResourceBoundaryBookkeeping, preservesResourceOwnership, type BoundaryValidation, type CanonicalResourceBoundaryToken, type CanonicalResourceBoundaryResult, type CooperativeBoundaryOptions } from "./resource-boundary";
import { findResource, resourceSource } from "./resource-identity";
import { validateTarget } from "./external-reference";
import { createCommitId } from "./ids";
import { BlockIdentityIndex, PlacementIdentityIndex, type PlacementIdentityDelta } from "./identity";
import { prepareCommitCapture, finishCommitCapture, freeze, normalizeInputIntent, type CommitMetadata, type DeepReadonly, type PreparedCommitCapture, type RepositoryCommitResult, type RepositoryOptions } from "./commit-capture";
import { prepareHistoryChanges, finishHistoryChanges, type PreparedHistoryChanges, type HistoryChanges, type CommitEnvelope } from "./compact-changes";
import type {
  ContentKey,
  CommitId,
  ContentRecord,
  Location,
  PlacementKey,
  RepositoryOperation,
  RepositoryState,
} from "./types";

function compactEdits(operations: RepositoryOperation[]) {
  const result = new Map<string, import('./inline-sequence').InlineSplice>();
  for(const op of recordOperations(operations))if(op.kind==='put-content'&&op.inlineSplice)result.set(op.record.key,op.inlineSplice);
  return result;
}
function annotationOrigins(operations: RepositoryOperation[]) {
  const hints = new Map<ContentKey, readonly (number | null)[]>();
  const touched=new Set<string>();
  for (const op of recordOperations(operations)) if (op.kind === 'put-content') {
    const previous=hints.get(op.record.key);
    if(op.annotationOrigins)hints.set(op.record.key,op.annotationOrigins.map(i=>i===null?null:touched.has(op.record.key)?previous?.[i]??null:i));
    else hints.delete(op.record.key);
    touched.add(op.record.key);
  }
  return hints;
}

export class ModelInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelInvariantError";
  }
}

function applyOperation(state: RepositoryState, operation: RepositoryOperation) {
  switch (operation.kind) {
    case "record-batch": {
      const owned = clone(operation);
      for (const key in owned.contents) {
        const record = owned.contents[key];
        if (record && record.key !== key) throw new ModelInvariantError("Bulk content key mismatch");
        if (record) state.contents[key] = record; else delete state.contents[key];
      }
      for (const key in owned.placements) {
        const record = owned.placements[key];
        if (record && record.key !== key) throw new ModelInvariantError("Bulk placement key mismatch");
        if (record) state.placements[key] = record; else delete state.placements[key];
      }
      return;
    }
    case "put-content":
      state.contents[operation.record.key] = clone(operation.record);
      return;
    case "remove-content":
      delete state.contents[operation.key];
      return;
    case "put-placement":
      state.placements[operation.record.key] = clone(operation.record);
      return;
    case "remove-placement":
      delete state.placements[operation.key];
      return;
    case "set-root":
      state.rootPlacementKey = operation.key;
  }
}

function inverseFor(state: RepositoryState, operation: RepositoryOperation): RepositoryOperation {
  switch (operation.kind) {
    case "record-batch": {
      const inverse: Extract<RepositoryOperation, {kind: "record-batch"}> = { kind: "record-batch", contents: {}, placements: {} };
      for (const key in operation.contents) inverse.contents[key] = state.contents[key] ?? null;
      for (const key in operation.placements) inverse.placements[key] = state.placements[key] ?? null;
      return clone(inverse);
    }
    case "put-content": {
      const previous = state.contents[operation.record.key];
      return previous
        ? { kind: "put-content", record: clone(previous), ...(operation.inlineSplice && previous.compactInline ? {inlineSplice:{start:operation.inlineSplice.start,end:operation.inlineSplice.start+inlineLength(operation.inlineSplice.insert),insert:inlineSlice(previous.compactInline.spans,operation.inlineSplice.start,operation.inlineSplice.end)}} : {}), ...(operation.annotationOrigins ? { annotationOrigins: (Array.isArray(previous.payload.standoffProperties) ? previous.payload.standoffProperties : []).map((_, i) => { const n = operation.annotationOrigins!.indexOf(i); return n < 0 ? null : n; }) } : {}) }
        : { kind: "remove-content", key: operation.record.key };
    }
    case "remove-content": {
      const previous = state.contents[operation.key];
      if (!previous) throw new ModelInvariantError(`Unknown content ${operation.key}`);
      return { kind: "put-content", record: clone(previous) };
    }
    case "put-placement": {
      const previous = state.placements[operation.record.key];
      return previous
        ? { kind: "put-placement", record: clone(previous) }
        : { kind: "remove-placement", key: operation.record.key };
    }
    case "remove-placement": {
      const previous = state.placements[operation.key];
      if (!previous) throw new ModelInvariantError(`Unknown placement ${operation.key}`);
      return { kind: "put-placement", record: clone(previous) };
    }
    case "set-root":
      return { kind: "set-root", key: state.rootPlacementKey };
  }
}

export function deriveLocations(state: RepositoryState, observe?: (c: ContentRecord) => void): Map<PlacementKey, Location> {
  const locations = new Map<PlacementKey, Location>();
  const readingTargets = new Set<string>();

  for (const content of Object.values(state.contents)) {
    validateCompactInline(content);
    validateAlternativeReadings(content,key=>{const p=state.placements[key];return p&&{owned:p.kind==='owned'&&!p.resolvedReference&&!p.externalReference,content:state.contents[p.contentKey]};});
    observe?.(content);
    content.children.forEach((childKey, index) => {
      if (locations.has(childKey)) {
        throw new ModelInvariantError(`Placement ${childKey} has more than one owner`);
      }
      locations.set(childKey, {
        ownerContentKey: content.key,
        slot: { kind: "children" },
        index,
      });
    });

    content.inlineContent.forEach((inlineKey, index) => {
      if (locations.has(inlineKey)) {
        throw new ModelInvariantError(`Placement ${inlineKey} has more than one owner`);
      }
      locations.set(inlineKey, {
        ownerContentKey: content.key,
        slot: { kind: "inline-content" },
        index,
      });
    });

    for (const [name, relationKey] of Object.entries(content.ownedRelations)) {
      if (isReadingRelation(name)) readingTargets.add(state.placements[relationKey]?.contentKey);
      if (locations.has(relationKey)) {
        throw new ModelInvariantError(`Placement ${relationKey} has more than one owner`);
      }
      locations.set(relationKey, {
        ownerContentKey: content.key,
        slot: { kind: "relation", name },
      });
    }
  }

  if (readingTargets.size) validateReadingOwnership(readingTargets, Object.values(state.placements));
  return locations;
}

export function validateRepository(state: RepositoryState, boundary?: BoundaryValidation): void {
  new PlacementIdentityIndex(state);
  if (!state.placements[state.rootPlacementKey]) {
    throw new ModelInvariantError(`Missing root placement ${state.rootPlacementKey}`);
  }

  const locations = deriveLocations(state);
  for (const placementKey of Object.keys(state.placements)) {
    if (placementKey === state.rootPlacementKey) continue;
    if (!locations.has(placementKey)) {
      throw new ModelInvariantError(`Placement ${placementKey} is detached`);
    }
  }
  if (locations.has(state.rootPlacementKey)) {
    throw new ModelInvariantError("The root placement cannot have an owner");
  }

  if (Object.values(state.placements).some(p => p.resourceRegistration || p.kind === "owned" && (p.externalReference || p.resolvedReference))) {
    validateResourceRegistrations(state);
    if (boundary) delete boundary.error; // Reuse the existing ownership check, not a second pass.
  } else if (boundary) {
    try { resourceOwnership(state); delete boundary.error; } catch (e) { boundary.error = String(e); }
  }

  const reachable = new Set<PlacementKey>();
  const visit = (placementKey: PlacementKey, ancestors: Set<ContentKey>) => {
    const placement = state.placements[placementKey];
    if (!placement) throw new ModelInvariantError(`Missing placement ${placementKey}`);
    reachable.add(placementKey);
    if (placement.resolvedReference) {
      validateTarget(placement.resolvedReference);
      if ((placement.kind !== "reference" && !(placement.kind === "owned" && isOwnedResourceTarget(placement.resolvedReference))) || placement.externalReference || placement.resolvedReference.kind !== "block" ||
          placement.resolvedReference.version.kind !== "unpinned" || placement.resolvedReference.source.scope === "unknown" ||
          state.contents[placement.contentKey]?.payload.id !== placement.resolvedReference.targetId) {
        throw new ModelInvariantError("Invalid live external-reference binding");
      }
    }
    if (placement.kind === "owned" && placement.resolvedReference) {
      const target = state.contents[placement.contentKey];
      if (target?.viewType !== "document-block" || resourceSource(target)?.resourceId !== (placement.resolvedReference.source as { resourceId: string }).resourceId) throw new ModelInvariantError("Owned resource target is not its Document root");
    }
    if (placement.externalReference !== undefined) {
      if ((placement.kind !== "reference" && !(placement.kind === "owned" && isOwnedResourceTarget(placement.externalReference))) || placementKey === state.rootPlacementKey || state.contents[placement.contentKey]) {
        throw new ModelInvariantError("An external reference must have a distinct unresolved target and cannot be the root");
      }
      if (locations.get(placementKey)?.slot.kind === "inline-content") throw new ModelInvariantError("External references cannot impersonate inline Cells");
      validateTarget(placement.externalReference);
      return;
    }
    if (ancestors.has(placement.contentKey) && placement.kind !== "reference" && !placement.resolvedReference) {
      throw new ModelInvariantError(`Ownership cycle through ${placement.contentKey}`);
    }
    if (ancestors.has(placement.contentKey)) return;
    const content = state.contents[placement.contentKey];
    if (!content) throw new ModelInvariantError(`Missing content ${placement.contentKey}`);
    // All placement/target/cycle checks above still apply to leaves. A leaf has
    // no descendants needing an ancestry copy (the common per-Cell case).
    if (!content.children.length && !content.inlineContent.length && !Object.keys(content.ownedRelations).length) return;
    const next = new Set(ancestors).add(content.key);
    for (const childKey of content.children) visit(childKey, next);
    for (const inlineKey of content.inlineContent) visit(inlineKey, next);
    for (const relationKey of Object.values(content.ownedRelations)) visit(relationKey, next);
  };
  visit(state.rootPlacementKey, new Set());
  // Definition membership is a liveness root, not a fabricated occurrence.
  // Validate every retained component even when no placement targets its Block.
  for (const content of Object.values(state.contents)) {
    if (content.definitionOwnerKey === undefined) continue;
    const owner = state.contents[content.definitionOwnerKey];
    if (owner === content && content.viewType === "document-block") continue;
    if (!owner || owner.viewType !== "document-block" ||
      ["text-cell", "image-cell", "document-block", "workspace-block"].includes(content.viewType)) {
      throw new ModelInvariantError(`Invalid definition owner for ${content.key}`);
    }
    const ancestors = new Set([content.key]);
    for (const key of [...content.children, ...content.inlineContent, ...Object.values(content.ownedRelations)]) visit(key, ancestors);
  }
  for (const placementKey of Object.keys(state.placements)) {
    if (!reachable.has(placementKey)) {
      throw new ModelInvariantError(`Placement ${placementKey} is unreachable from the root`);
    }
  }
}

export function planOperations(
  source: RepositoryState,
  operations: RepositoryOperation[],
  boundary?: BoundaryValidation,
): { next: RepositoryState; inverse: RepositoryOperation[] } {
  return planChangedRecords(clone(source), operations, boundary);
}

/** Changed records are private; unchanged records remain read-only during validation. */
function planChangedRecords(source: RepositoryState, operations: RepositoryOperation[], boundary?: BoundaryValidation, timings?: Record<string, number>) {
  let started = timings ? performance.now() : 0;
  const next = {...source,contents:{...source.contents},placements:{...source.placements}};
  if (timings) { timings["plan.tableCopy"] = performance.now() - started; started = performance.now(); }
  const inverse: RepositoryOperation[] = [];
  for (const operation of operations) {
    inverse.push(inverseFor(next, operation));
    applyOperation(next, operation);
  }
  if (timings) { timings["plan.inverseAndApply"] = performance.now() - started; started = performance.now(); }
  validateRepository(next, boundary);
  if (timings) timings["plan.validation"] = performance.now() - started;
  return { next, inverse: inverse.reverse() };
}

type RepositorySubscriber = (state: RepositoryState, label: string) => void;
type CommitSubscriber = {
  listener: (result: DeepReadonly<RepositoryCommitResult>) => void;
  onError: (error: unknown, commitId: CommitId) => void;
};
type Attempt<T> = { capture: T } | { error: unknown };
type CaptureAttempt = {
  full?: Attempt<PreparedCommitCapture>; compact?: Attempt<PreparedHistoryChanges>;
  envelope: Attempt<Omit<CommitEnvelope, "commitId" | "label" | "timestamp" | "undoRecorded" | "afterRevision">>;
};
type HistorySubscriber = { listener: (event: DeepReadonly<HistoryChanges>) => void; onError: CommitSubscriber["onError"] };

export interface RepositoryChange {
  /** Persisted resource owners affected on either side of this commit. */
  resourceIds?: readonly string[];
  resourceProvenanceChanged?: boolean;
  /** General validated commits expose affected edges to occurrence consumers. */
  changedPlacements?: readonly string[];
  compactEdits?: ReadonlyMap<string, import("./inline-sequence").InlineSplice>;
  /** Lightweight identity/cause for occurrence-local history restoration.
   * Does not enable exact-record capture on ordinary typing. */
  commit?: { id: string; cause: CommitMetadata['cause'] };
  annotationOrigins?: ReadonlyMap<ContentKey, readonly (number | null)[]>;
  label: string;
  previousContents: Map<ContentKey, ContentRecord | undefined>;
  /** Present only for a validated, single-owner leaf-text edit. */
  inlineOwner?: ContentKey;
  split?: SplitChange;
  childrenOwner?: ContentKey;
  /** Validated empty-leaf membership delta, including undo/redo. */
  emptyParagraph?: EmptyParagraphChange;
  listWrap?: ListWrapChange;
  taskStateOwner?: ContentKey;
  structural?: StructuralChange;
  /** Fully validated append of fresh subtrees; existing records/edges are unchanged. */
  appendedChildrenOwner?: ContentKey;
}

export class CanonicalRepository {
  private activeUndoGroup?: {record:(operations:RepositoryOperation[],inverse:RepositoryOperation[])=>void};
  /** Native edits publish normally; only their Undo record is accumulated. The
   * caller explicitly scopes each synchronous insertion, never unrelated edits. */
  /** Background receiving may allow history on disjoint records; the admission
   * guard below still fences every record owned by this in-flight group. */
  beginUndoGroup(label:string,options:{allowUnrelatedHistory?:boolean}={}) {
    const forward=new Map<string,RepositoryOperation>(),backward=new Map<string,RepositoryOperation>();
    let closed=false,running=false;
    const release=options.allowUnrelatedHistory?()=>{}:this.suspendHistory();
    const key=(op:RepositoryOperation)=>{
      if(op.kind==='record-batch'||op.kind==='set-root')throw Error('Grouped insertion requires bounded record operations');
      return (op.kind.includes('content')?'c:':'p:')+('record' in op?op.record.key:op.key);
    };
    // Per-commit splice hints describe intermediate preimages, not the final
    // grouped Undo/Redo pair. Whole records remain the canonical authority.
    const grouped=(op:RepositoryOperation)=>{const copy=clone(op);if(copy.kind==='put-content')delete copy.inlineSplice;return copy;};
    const group={record:(operations:RepositoryOperation[],inverse:RepositoryOperation[])=>{
      for(const op of inverse){const k=key(op);if(!backward.has(k))backward.set(k,grouped(op));}
      for(const op of operations)forward.set(key(op),grouped(op));
    }};
    // Prevent an unrelated edit from changing records whose original values
    // belong to this open Undo group. Other Documents and the draft stay usable.
    const stop=this.beforeCommit(operations=>{if(running){operations.forEach(key);return;}for(const op of operations){if(op.kind==='record-batch'||op.kind==='set-root'){if(forward.size)throw Error('Finish the current native insertion first');}else if(forward.has(key(op)))throw Error('This content is still receiving an AI response');}});
    return {
      run:<T>(operation:()=>T):T=>{if(closed||this.activeUndoGroup)throw Error('Native insertion group unavailable');running=true;this.activeUndoGroup=group;try{return operation();}finally{this.activeUndoGroup=undefined;running=false;}},
      finish:()=>{if(closed)return;closed=true;stop();release();if(forward.size){this.undoStack.push(this.historyStorage.store(createCommitId(),label,[...forward.values()],[...backward.values()]));this.redoStack=[];}},
    };
  }
  private admission = new Set<(operations: readonly RepositoryOperation[], state: Readonly<RepositoryState>, metadata: CommitMetadata) => void>();
  /** Synchronous, read-only veto before validation/publication. No snapshots. */
  beforeCommit(guard: (operations: readonly RepositoryOperation[], state: Readonly<RepositoryState>, metadata: CommitMetadata) => void) {
    this.admission.add(guard); return () => { this.admission.delete(guard); };
  }
  readonly compactCanonicalText: boolean;
  private historyGuards=createSignal(0);
  /** Shared Document history lease; does not modify either stack. */
  suspendHistory(){this.historyGuards[1](n=>n+1);let live=true;return()=>{if(live){live=false;this.historyGuards[1](n=>n-1);}};}
  readonly state: RepositoryState;
  private readonly setState: (...args: any[]) => void;
  private subscribers = new Set<RepositorySubscriber>();
  private beforeSubscribers = new Set<RepositorySubscriber>();
  private changeSubscribers = new Set<(change: RepositoryChange) => void>();
  private beforeChangeSubscribers = new Set<(label: string, cause?: CommitMetadata['cause']) => void>();
  private references: ReferenceBookkeeping;
  private boundary?: ResourceBoundaryBookkeeping;
  private locations = new Map<PlacementKey, Location>();
  private undoStack: StoredHistoryEntry[] = [];
  private redoStack: StoredHistoryEntry[] = [];
  private readonly historyStorage = new UndoStorage();
  private readonly identity?: BlockIdentityIndex;
  private readonly placementIdentity: PlacementIdentityIndex;
  private readonly commitSubscribers = new Set<CommitSubscriber>();
  private readonly historySubscribers = new Set<HistorySubscriber>();
  private deliveringCommit = false;
  private resourceGenerations = new Map<string, number>();
  private resourceProvenanceGeneration = 0;

  /** Monotonic committed-content generation, independent of history position.
   * No traversal, snapshot, reactive subscription or serialization on reads. */
  resourceGeneration(id: string): number {
    // Legacy repositories without incoming ownership evidence fail closed.
    return this.references.enriched ? Math.max(this.resourceGenerations.get(id) ?? 0, this.resourceProvenanceGeneration) : this.readState().revision;
  }

  /** Follow existing incoming ownership/location evidence, not occurrences.
   * Both sides of a commit are inspected, including placement-only mutations,
   * retained definitions, named relations and record-batch imports/restores. */
  private changedResources(operations: readonly RepositoryOperation[], ids = new Set<string>()) {
    if (!this.references.enriched) return ids;
    const state = this.readState(), visited = new Set<string>();
    const visit = (key: string | undefined) => {
      if (!key || visited.has(key)) return; visited.add(key);
      const c = state.contents[key]; if (!c) return;
      if (c.viewType === 'document-block') {
        const id = (c.payload.metadata as any)?.documentId ?? c.payload.id;
        if (typeof id === 'string') ids.add(id);
        return; // Nested Documents persist independently.
      }
      visit(c.definitionOwnerKey);
      for (const pk of this.references.ownedKeys(key)) {
        const p = state.placements[pk];
        if (p && !p.externalReference && !p.resolvedReference) visit(this.locations.get(pk)?.ownerContentKey);
      }
    };
    const placement = (key: string) => {
      visit(this.locations.get(key)?.ownerContentKey);
      const p = state.placements[key];
      if (p && !p.externalReference && !p.resolvedReference && (p.kind !== 'reference' || p.resourceRegistration)) visit(p.contentKey);
    };
    for (const op of recordOperations(operations)) {
      if (op.kind === 'put-content' || op.kind === 'remove-content') visit(op.kind === 'put-content' ? op.record.key : op.key);
      else if (op.kind === 'put-placement' || op.kind === 'remove-placement') placement(op.kind === 'put-placement' ? op.record.key : op.key);
      else if (op.kind === 'set-root') { placement(state.rootPlacementKey); placement(op.key); }
    }
    return ids;
  }

  private changesResourceProvenance(operations: readonly RepositoryOperation[]) {
    // Identity/definition ownership can affect persisted foreign-reference
    // provenance without changing a referring record. These rare mutations
    // conservatively invalidate every save baseline; ordinary edits do not.
    const state = this.readState();
    for (const op of recordOperations(operations)) {
      if (op.kind !== 'put-content' && op.kind !== 'remove-content') continue;
      const before = state.contents[op.kind === 'put-content' ? op.record.key : op.key];
      const after = op.kind === 'put-content' ? op.record : undefined;
      if (!before || before.viewType === 'text-cell' || before.viewType === 'image-cell') continue;
      if (after && (before.payload.id !== after.payload.id || before.definitionOwnerKey !== after.definitionOwnerKey) ||
          before.viewType === 'document-block' && (!after || after.viewType !== before.viewType ||
          (before.payload.metadata as any)?.documentId !== (after.payload.metadata as any)?.documentId)) return true;
    }
    return false;
  }

  private advanceResourceGenerations(operations: readonly RepositoryOperation[], ids: Set<string>, provenance: boolean) {
    for (const id of this.changedResources(operations, ids)) this.resourceGenerations.set(id, this.readState().revision);
    if (provenance) this.resourceProvenanceGeneration = this.readState().revision;
  }

  constructor(initial: RepositoryState, options: RepositoryOptions = {}) {
    this.compactCanonicalText = options.compactCanonicalText === true;
    const validation: BoundaryValidation | undefined = options.resourceBoundaryEvidence !== false ? {} : undefined;
    validateRepository(initial, validation);
    this.references = new ReferenceBookkeeping(!!validation);
    if (validation) { this.boundary = new ResourceBoundaryBookkeeping(this.references); this.boundary.validation = validation; }
    this.placementIdentity = new PlacementIdentityIndex(initial);
    if (options.enforceBlockIdentity) this.identity = new BlockIdentityIndex(initial);
    const [state, setState] = createStore(clone(initial));
    this.state = state;
    this.setState = setState;
    this.rebuildReferences();
  }

  /** Internal read-only access. Never mutate these records; use commit. */
  readState(): RepositoryState { return unwrap(this.state); }
  hasSemanticPlacements(): boolean { return this.placementIdentity.enabled; }

  get hasValidStructuralEvidence(): boolean { return !!this.boundary && !this.boundary.validation.error; }
  /** Read-only identity lookup, reusing the existing boundary index. */
  findDocumentResource(id: string): ContentRecord | undefined {
    return this.boundary ? this.boundary.findDocument(this.readState(), id) : findResource(this.readState(), { scope: 'document', resourceId: id });
  }
  ownedPlacementKeys(key: string): Iterable<string> { return this.references.ownedKeys(key); }

  contentReferenceCount(key: ContentKey): number { return this.references.get(key) ?? 0; }

  locationOf(key: PlacementKey): Location | undefined { return this.locations.get(key); }

  /** Read-only repository semantics, independent of any consumer or persistence policy. */
  get hasResourceBoundaryEvidence(): boolean { return !!this.boundary; }
  readCanonicalResourceBoundary(id: string): CanonicalResourceBoundaryResult {
    return this.boundary?.read(this.readState(), id) ?? Object.freeze({status: 'unavailable', reason: 'Resource boundary evidence disabled'});
  }
  async readCanonicalResourceBoundaryCooperative(id: string, options: CooperativeBoundaryOptions = {}): Promise<CanonicalResourceBoundaryResult> {
    options.signal?.throwIfAborted();
    return this.boundary ? this.boundary.readCooperative(this.readState(), id, options) : this.readCanonicalResourceBoundary(id);
  }
  isBoundaryCurrent(token: CanonicalResourceBoundaryToken): boolean { return this.boundary?.isCurrent(this.readState(), token) ?? false; }
  incomingOwnedPlacements(token: CanonicalResourceBoundaryToken, key: string) {
    if (!this.boundary) throw Error('Resource boundary evidence disabled');
    return this.boundary.incoming(this.readState(), token, key, pk => this.locationOf(pk));
  }

  private rebuildReferences(): void {
    this.boundary?.clear();
    this.locations = deriveLocations(this.readState(), this.boundary && (c => this.boundary!.add(c)));
    this.references.clear();
    for (const placement of Object.values(this.readState().placements)) {
      this.references.add(placement);
    }
  }

  subscribeChanges(subscriber: (change: RepositoryChange) => void): () => void {
    this.changeSubscribers.add(subscriber);
    return () => this.changeSubscribers.delete(subscriber);
  }

  subscribeBeforeChanges(subscriber: (label: string, cause?: CommitMetadata['cause']) => void): () => void {
    this.beforeChangeSubscribers.add(subscriber);
    return () => this.beforeChangeSubscribers.delete(subscriber);
  }

  snapshot(): RepositoryState {
    return clone(unwrap(this.state));
  }

  subscribe(subscriber: RepositorySubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  subscribeBefore(subscriber: RepositorySubscriber): () => void {
    this.beforeSubscribers.add(subscriber);
    return () => this.beforeSubscribers.delete(subscriber);
  }

  subscribeCommits(listener: CommitSubscriber["listener"], onError: CommitSubscriber["onError"]): () => void {
    const subscriber = { listener, onError };
    this.commitSubscribers.add(subscriber);
    return () => { this.commitSubscribers.delete(subscriber); };
  }

  subscribeHistoryChanges(listener: HistorySubscriber["listener"], onError: HistorySubscriber["onError"]): () => void {
    const subscriber = { listener, onError };
    this.historySubscribers.add(subscriber);
    return () => { this.historySubscribers.delete(subscriber); };
  }

  private prepareCapture(state: RepositoryState, operations: RepositoryOperation[], metadata: CommitMetadata, final?: RepositoryState): CaptureAttempt | undefined {
    if (!this.commitSubscribers.size && !this.historySubscribers.size) return;
    metadata = { ...metadata, inputIntent: normalizeInputIntent(metadata.inputIntent) };
    const attempt = <T>(fn: () => T): Attempt<T> => { try { return { capture: fn() }; } catch (error) { return { error }; } };
    return {
      envelope: attempt(() => ({ beforeRevision: state.revision, root: { before: state.rootPlacementKey, after: final?.rootPlacementKey ?? state.rootPlacementKey },
        cause: clone(metadata.cause ?? { kind: "edit" }), commands: clone(metadata.commands ?? [{ commandId: "repository.commit", subjects: [] }]),
        ...(metadata.inputIntent ? { inputIntent: clone(metadata.inputIntent) } : {}) })),
      full: this.commitSubscribers.size ? attempt(() => prepareCommitCapture(state, operations, metadata)) : undefined,
      compact: this.historySubscribers.size ? attempt(() => prepareHistoryChanges(state, operations, final)) : undefined,
    };
  }

  private deliverCapture(attempt: CaptureAttempt | undefined, commitId: CommitId, label: string, recordHistory: boolean): void {
    if (!attempt) return;
    this.deliveringCommit = true;
    const report = (subscriber: { onError: CommitSubscriber["onError"] }, error: unknown) => {
      try { subscriber.onError(error, commitId); } catch { /* An observer cannot invalidate the edit. */ }
    };
    try {
      if ("error" in attempt.envelope) {
        [...this.commitSubscribers, ...this.historySubscribers].forEach(s => report(s, (attempt.envelope as { error: unknown }).error)); return;
      }
      const envelope = freeze({ ...attempt.envelope.capture, commitId, label, timestamp: new Date().toISOString(),
        undoRecorded: recordHistory, afterRevision: this.state.revision });
      const deliver = <T, E>(prepared: Attempt<T> | undefined, subscribers: Array<{ listener: (event: E) => void; onError: CommitSubscriber["onError"] }>, finish: (value: T) => E) => {
        if (!prepared) return;
        if ("error" in prepared) { subscribers.forEach(s => report(s, prepared.error)); return; }
        let event: E;
        try { event = finish(prepared.capture); } catch (error) { subscribers.forEach(s => report(s, error)); return; }
        for (const subscriber of subscribers) { try { subscriber.listener(event); } catch (error) { report(subscriber, error); } }
      };
      deliver(attempt.full, [...this.commitSubscribers], value => freeze({
        ...finishCommitCapture(value, this.readState(), commitId, label, recordHistory, envelope.timestamp), ...envelope,
      }));
      deliver(attempt.compact, [...this.historySubscribers], value => finishHistoryChanges(value, envelope));
    } finally { this.deliveringCommit = false; }
  }

  private assertNotCaptureCallback(): void {
    if (this.deliveringCommit) throw new ModelInvariantError("Commit observers cannot mutate the repository synchronously");
  }

  commit(label: string, operations: RepositoryOperation[], recordHistory = true, metadata: CommitMetadata = {}, timings?: Record<string, number>): void {
    let last = timings ? performance.now() : 0;
    const stage = (name: string) => { if (timings) { const now = performance.now(); timings[`commit.${name}`] = now - last; last = now; } };
    this.assertNotCaptureCallback();
    if (!operations.length) return;
    for (const guard of this.admission) guard(operations, this.readState(), metadata);
    for(const op of recordOperations(operations))if(op.kind==='put-content'){
      const before=this.readState().contents[op.record.key];
      if(before?.inlineKind==='standoff'&&op.record.inlineKind==='standoff'&&!!before.compactInline!==!!op.record.compactInline)throw new ModelInvariantError('Canonical representation is fixed at admission');
      if(op.record.compactInline)validateCompactInline(op.record);
    }
    for(const op of recordOperations(operations))if(op.kind==='put-content'&&op.inlineSplice){
      const before=this.readState().contents[op.record.key],d=op.inlineSplice;
      if(!before?.compactInline||!op.record.compactInline||!Number.isInteger(d.start)||!Number.isInteger(d.end)||d.start<0||d.end<d.start||d.end>inlineLength(before.compactInline.spans))throw new ModelInvariantError('Invalid compact splice preimage');
      const expected=normalizeInline([...inlineSlice(before.compactInline.spans,0,d.start),...d.insert,...inlineSlice(before.compactInline.spans,d.end,inlineLength(before.compactInline.spans))]);
      if(JSON.stringify(expected)!==JSON.stringify(op.record.compactInline.spans))throw new ModelInvariantError('Compact splice does not match committed content');
    }
    const placementDelta = this.placementIdentity.validateCommit(operations);
    const bulk = operations.some(op => op.kind === "record-batch");
    const gloss = !bulk && glossChangeFor(this.readState(), operations, {locationOf:key=>this.locationOf(key),ownedKeys:key=>this.ownedPlacementKeys(key)});
    if(gloss) {
      this.commitInline(label,operations,undefined,recordHistory,metadata,undefined,undefined,placementDelta,undefined,undefined,undefined,
        {gloss,contents:[gloss.owner,...gloss.texts],childrenOwners:[],inlineOwners:gloss.texts});return;
    }
    const taskStateOwner = !bulk && taskStateChangeFor(this.readState(), operations);
    if (taskStateOwner) {
      this.commitInline(label, operations, undefined, recordHistory, metadata, undefined, undefined, placementDelta, undefined, undefined, taskStateOwner);
      return;
    }
    const inlineOwner = !bulk && (compactInlineOwnerFor(this.readState(), operations) ?? inlineOwnerFor(this.readState(), operations, this.references));
    if (inlineOwner) {
      this.commitInline(label, operations, inlineOwner, recordHistory, metadata, undefined, undefined, placementDelta);
      return;
    }
    const split = bulk ? undefined : splitChangeFor(this.readState(), operations, this.references);
    if (split) {
      this.commitInline(label, operations, undefined, recordHistory, metadata, split, undefined, placementDelta);
      return;
    }
    const emptyParagraph = bulk ? undefined : emptyParagraphChangeFor(this.readState(), operations, this.references);
    const childrenOwner = emptyParagraph?.parent ?? (bulk ? undefined : documentTabParentFor(this.readState(), operations, this.references));
    if (childrenOwner) {
      this.commitInline(label, operations, undefined, recordHistory, metadata, undefined, childrenOwner, placementDelta, emptyParagraph);
      return;
    }
    const listWrap = bulk ? undefined : listWrapChangeFor(this.readState(), operations, this.references, key => this.locationOf(key));
    if (listWrap) {
      this.commitInline(label, operations, undefined, recordHistory, metadata, undefined, undefined, placementDelta, undefined, listWrap);
      return;
    }
    const structural = !bulk && this.hasValidStructuralEvidence && structuralChangeFor(this.readState(), operations, {
      locationOf: key => this.locationOf(key), referenceCount: key => this.contentReferenceCount(key), ownedKeys: key => this.ownedPlacementKeys(key),
    });
    if (structural) {
      this.commitInline(label, operations, undefined, recordHistory, metadata, undefined, undefined, placementDelta, undefined, undefined, undefined, structural);
      return;
    }
    if(metadata.requireBounded)throw Error('Operation cannot satisfy bounded canonical admission');
    stage("classification");
    const current = this.readState();
    for (const subscriber of this.beforeChangeSubscribers) subscriber(label, metadata.cause);
    for (const subscriber of this.beforeSubscribers) subscriber(this.snapshot(), label);
    const validation: BoundaryValidation | undefined = this.boundary ? {} : undefined;
    stage("beforeObservers");
    const { next, inverse } = planChangedRecords(current, operations, validation, timings);
    stage("planning");
    for (const [key, content] of Object.entries(next.contents)) {
      const previous = current.contents[key];
      if (!previous || content === previous) continue;
      if(content.compactInline&&previous.compactInline)content.inlineRevision=previous.inlineRevision+(JSON.stringify(content.compactInline)!==JSON.stringify(previous.compactInline)?1:0);
      const previousValue = { ...previous, revision: 0 };
      const nextValue = { ...content, revision: 0 };
      if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
        content.revision = previous.revision + 1;
      }
    }
    next.revision = current.revision + 1;
    stage("revisionComparison");
    const identityDelta = this.identity?.validateCommit(operations);
    stage("blockIdentity");
    const capture = this.prepareCapture(current, operations, metadata, next);
    const resources = this.changedResources(operations), provenance = this.changesResourceProvenance(operations);
    stage("prepareCapture");
    const commitId = createCommitId();
    const previousContents = new Map<ContentKey, ContentRecord | undefined>();
    for (const operation of recordOperations(operations)) {
      if (operation.kind === "put-content" || operation.kind === "remove-content") {
        const key = operation.kind === "put-content" ? operation.record.key : operation.key;
        previousContents.set(key, current.contents[key] ? clone(current.contents[key]) : undefined);
      }
    }
    // Native admission normally adds a fresh resource to the object bank.
    // The full graph validator above still checks ownership and all references;
    // this hint only avoids rebuilding projections of unchanged Documents.
    const existingChanges = [...previousContents].filter(([,before]) => !!before);
    const parent = existingChanges.length === 1 ? existingChanges[0][1] : undefined;
    const updated = parent && next.contents[parent.key];
    const structure = ({children,wireChildren,revision,...rest}: ContentRecord) => JSON.stringify(rest);
    const appendedChildrenOwner = parent?.viewType === 'workspace-object-bank-block' && updated &&
      structure(parent) === structure(updated) && updated.children.length > parent.children.length &&
      parent.children.every((key,i) => updated.children[i] === key) &&
      (() => { for (const op of recordOperations(operations)) if (!(op.kind === 'put-content' || op.kind === 'put-placement' && !current.placements[op.record.key])) return false; return true; })()
      ? parent.key : undefined;
    stage("changePreparation");
    if (timings) {
      timings["count.publications"] = 1;
      timings["count.changeObservers"] = this.changeSubscribers.size;
      timings["count.snapshotObservers"] = this.subscribers.size;
      timings["count.captureObservers"] = this.commitSubscribers.size + this.historySubscribers.size;
      timings["count.previousContents"] = previousContents.size;
      timings["count.repositoryContentsBefore"] = Object.keys(current.contents).length;
      timings["count.repositoryContentsAfter"] = Object.keys(next.contents).length;
      timings["count.repositoryPlacementsAfter"] = Object.keys(next.placements).length;
    }
    stage("diagnosticCounts");
    batch(() => {
      // Publish only changed records. Reconciling the entire graph recursively
      // unwraps every existing Cell even when opening a tiny new Document.
      const contents = new Set<string>(), placements = new Set<string>();
      for (const operation of recordOperations(operations)) {
        if (operation.kind === 'put-content' || operation.kind === 'remove-content') contents.add(operation.kind === 'put-content' ? operation.record.key : operation.key);
        if (operation.kind === 'put-placement' || operation.kind === 'remove-placement') placements.add(operation.kind === 'put-placement' ? operation.record.key : operation.key);
      }
      // Fresh records have nothing to reconcile. Passing them directly avoids
      // walking every new Cell twice through Solid's recursive unwrap.
      for (const key of contents) this.setState('contents',key,next.contents[key] && current.contents[key] ? reconcile(next.contents[key]) : next.contents[key]);
      for (const key of placements) this.setState('placements',key,next.placements[key] && current.placements[key] ? reconcile(next.placements[key]) : next.placements[key]);
      if (timings) timings['count.recordStoreWrites'] = contents.size + placements.size;
      this.setState('rootPlacementKey',next.rootPlacementKey);
      this.setState('revision',next.revision);
      stage('publishRecords');
      this.rebuildReferences();
      if (this.boundary) this.boundary.validation = validation!;
      if (identityDelta) this.identity!.acceptCommit(identityDelta);
      this.placementIdentity.acceptCommit(placementDelta);
      this.advanceResourceGenerations(operations, resources, provenance);
      stage("indexes");
      if (recordHistory) {
        if(this.activeUndoGroup)this.activeUndoGroup.record(operations,inverse);
        else this.undoStack.push(this.historyStorage.store(commitId, label, operations, inverse));
        this.redoStack = [];
      }
      stage("history");
      this.deliverCapture(capture, commitId, label, recordHistory);
      stage("captureDelivery");
      for (const subscriber of this.subscribers) subscriber(this.snapshot(), label);
      stage("snapshotObservers");
      const origins = annotationOrigins(operations);
      stage("annotationOrigins");
      let observer = 0;
      for (const subscriber of this.changeSubscribers) {
        const started = timings ? performance.now() : 0;
        subscriber({ resourceIds: this.references.enriched ? [...resources] : undefined, resourceProvenanceChanged: provenance, changedPlacements:[...placements], compactEdits:compactEdits(operations), commit: { id: commitId, cause: metadata.cause }, label, previousContents, appendedChildrenOwner, annotationOrigins: origins });
        if (timings) timings[`observer.${observer++}`] = performance.now() - started;
      }
      stage("changeObservers");
    });
    stage("reactiveFlush");
  }

  private commitInline(label: string, operations: RepositoryOperation[], inlineOwner: ContentKey | undefined, recordHistory: boolean, metadata: CommitMetadata, split?: SplitChange, childrenOwner?: ContentKey, placementDelta?: PlacementIdentityDelta, emptyParagraph?: EmptyParagraphChange, listWrap?: ListWrapChange, taskStateOwner?: ContentKey, structural?: StructuralChange): void {
    const current = this.readState();
    // Capture inverse data before changing any reactive records.
    const inverse = operations.map((operation) => inverseFor(current, operation)).reverse();
    const previousContents = new Map<ContentKey, ContentRecord | undefined>();
    const prepared = clone(operations);
    // Unknown fast-route semantics do not trigger a global scan on the input path.
    // They invalidate query eligibility until a later full admitted validation.
    let boundarySafe = true;
    if (this.boundary && !structural) { try {
      // The list proof establishes same-resource ownership for the fresh wrapper;
      // remaining inline changes still use the usual ownership check.
      const ownershipOps = listWrap ? prepared.filter(op => !(op.kind === "put-content" && op.record.key === listWrap.wrapperContent || op.kind === "remove-content" && op.key === listWrap.wrapperContent || op.kind === "put-placement" && op.record.key === listWrap.wrapper || op.kind === "remove-placement" && op.key === listWrap.wrapper)) : prepared;
      boundarySafe = preservesResourceOwnership(current, ownershipOps); } catch { boundarySafe = false; } }
    for (const operation of prepared) {
      if (operation.kind !== "put-content" && operation.kind !== "remove-content") continue;
      const key = operation.kind === "put-content" ? operation.record.key : operation.key;
      const previous = current.contents[key];
      previousContents.set(key, previous ? clone(previous) : undefined);
      if(operation.kind==='put-content'&&operation.record.compactInline&&previous?.compactInline)operation.record.inlineRevision=previous.inlineRevision+(JSON.stringify(operation.record.compactInline)!==JSON.stringify(previous.compactInline)?1:0);
      if (operation.kind === "put-content" && previous &&
        JSON.stringify({ ...previous, revision: 0 }) !== JSON.stringify({ ...operation.record, revision: 0 })) {
        operation.record.revision = previous.revision + 1;
      }
    }
    for (const subscriber of this.beforeChangeSubscribers) subscriber(label, metadata.cause);
    for (const subscriber of this.beforeSubscribers) subscriber(this.snapshot(), label);
    const identityDelta = this.identity?.validateCommit(prepared);
    const capture = this.prepareCapture(current, prepared, metadata);
    const resources = this.changedResources(prepared), provenance = this.changesResourceProvenance(prepared);
    const commitId = createCommitId();
    batch(() => {
      // Remove old locations before installing new ones: a split transfers Cells
      // between two owners, and operation ordering must not erase their new home.
      for (const previous of previousContents.values()) {
        if (!previous) continue;
        this.boundary?.remove(previous);
        for (const key of [...previous.children, ...previous.inlineContent, ...Object.values(previous.ownedRelations)]) this.locations.delete(key);
      }
      for (const operation of prepared) {
        switch (operation.kind) {
          case "put-content": this.setState("contents", operation.record.key, reconcile(operation.record)); break;
          case "remove-content": this.setState("contents", operation.key, undefined); break;
          case "put-placement": {
            if (current.placements[operation.record.key]) this.references.remove(current.placements[operation.record.key]);
            this.references.add(operation.record);
            this.setState("placements", operation.record.key, operation.record);
            break;
          }
          case "remove-placement": {
            this.references.remove(current.placements[operation.key]);
            this.setState("placements", operation.key, undefined);
            break;
          }
        }
      }
      for (const key of previousContents.keys()) {
        const content = current.contents[key];
        if (!content) continue;
        this.boundary?.add(content);
        content.children.forEach((key, index) => this.locations.set(key, { ownerContentKey: content.key, slot: { kind: "children" }, index }));
        content.inlineContent.forEach((key, index) => this.locations.set(key, { ownerContentKey: content.key, slot: { kind: "inline-content" }, index }));
        for (const [name, key] of Object.entries(content.ownedRelations)) this.locations.set(key, { ownerContentKey: content.key, slot: { kind: "relation", name } });
      }
      this.setState("revision", current.revision + 1);
      if (this.boundary && !boundarySafe) this.boundary.validation = {error: "Unclassified fast mutation: resource ownership requires full admitted validation"};
      if (identityDelta) this.identity!.acceptCommit(identityDelta);
      if (placementDelta) this.placementIdentity.acceptCommit(placementDelta);
      this.advanceResourceGenerations(prepared, resources, provenance);
      if (recordHistory) {
        if(this.activeUndoGroup)this.activeUndoGroup.record(operations,inverse);
        else this.undoStack.push(this.historyStorage.store(commitId, label, operations, inverse));
        this.redoStack = [];
      }
      this.deliverCapture(capture, commitId, label, recordHistory);
      for (const subscriber of this.subscribers) subscriber(this.snapshot(), label);
      const origins = annotationOrigins(operations);
      for (const subscriber of this.changeSubscribers) subscriber({ resourceIds: this.references.enriched ? [...resources] : undefined, resourceProvenanceChanged: provenance, compactEdits:compactEdits(operations), commit: { id: commitId, cause: metadata.cause }, label, previousContents, inlineOwner, split, childrenOwner, emptyParagraph, listWrap, taskStateOwner, structural, annotationOrigins: origins });
    });
  }

  canUndo(): boolean {
    return !this.historyGuards[0]() && this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return !this.historyGuards[0]() && this.redoStack.length > 0;
  }

  undo(): void {
    if(this.historyGuards[0]())return;
    this.assertNotCaptureCallback();
    const entry = this.undoStack.pop();
    if (!entry) return;
    batch(() => {
      const before = this.state.revision;
      try { this.commit(`Undo ${entry.label}`, this.historyStorage.materialize(entry.inverse), false, { cause: { kind: "undo", sourceCommitId: entry.commitId } }); }
      catch (error) {
        (this.state.revision === before ? this.undoStack : this.redoStack).push(entry);
        throw error;
      }
      this.redoStack.push(entry);
    });
  }

  redo(): void {
    if(this.historyGuards[0]())return;
    this.assertNotCaptureCallback();
    const entry = this.redoStack.pop();
    if (!entry) return;
    batch(() => {
      const before = this.state.revision;
      try { this.commit(`Redo ${entry.label}`, this.historyStorage.materialize(entry.forward), false, { cause: { kind: "redo", sourceCommitId: entry.commitId } }); }
      catch (error) {
        (this.state.revision === before ? this.redoStack : this.undoStack).push(entry);
        throw error;
      }
      this.undoStack.push(entry);
    });
  }
}
