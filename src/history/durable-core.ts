import type { ReadMeasure } from "./read-timing";
/** Shared, versioned boundary for the first persistent single-Document path.
 * Exact records and checked replay remain the established resource model. */
import { clone } from "../block-tree/clone";
import { equal, freeze, type DeepReadonly } from "../block-tree/commit-capture";
import type { HistoryChanges } from "../block-tree/compact-changes";
import type { ContentRecord, PlacementRecord, RepositoryState, Slot } from "../block-tree/types";
import { encodeWire, decodeWire } from "./preplan-spike/wire";
import { encodeGateDocument, decodeGateDocument, type GateDocument } from "./stage-c-gates/portable";
import { replayResource, validateResource, type ResourcePlacement, type ResourceSnapshot, type ResourceTransition } from "./stage-c-gates/resource";
import type { HistoricalFragment, HistoricalOccurrence, OccurrenceTree, SubtreeComparison, SubtreeResult } from "./types";
import { applyExactRecords } from "./apply-records";

export const DURABLE_LIMITS = Object.freeze({ supportedStateBytes: 20 * 1024 * 1024, maxGraphRecords: 100_000,
  chunkBytes: 1024 * 1024, recordBytes: 128 * 1024, checkpointDistance: 12, maxReadPath: 12 });
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`Document history: ${message}`); }
const identifier = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const cell = (c: DeepReadonly<ContentRecord>) => ["text-cell", "image-cell"].includes(c.viewType);
const slots = (c: DeepReadonly<ContentRecord>) => [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)];

export function durablePlacementId(p: DeepReadonly<PlacementRecord>, resourceId: string): string {
  return p.kind === "inline" ? `private-cell:${p.key}` : p.placementId ?? `legacy:${resourceId}:${p.key}`;
}
function projectPlacement(p: DeepReadonly<PlacementRecord>, resourceId: string): ResourcePlacement {
  const base = { key: p.key, placementId: durablePlacementId(p, resourceId) };
  if (p.externalReference || p.resolvedReference) {
    check(p.kind === "reference", "external edge must be a reference");
    return { ...base, kind: "reference", target: { kind: "external", reference: clone((p.externalReference ?? p.resolvedReference)!) } };
  }
  return { ...base, kind: p.kind, target: { kind: "local", contentKey: p.contentKey } };
}
/** Authoritative only for a repository whose root is this ONE Document. Never
 * normalize the live repository: definition retention and undo stay unchanged. */
export function projectWholeDocument(state: DeepReadonly<RepositoryState>, resourceId: string, revision = 0): DeepReadonly<ResourceSnapshot> {
  check(identifier(resourceId), "missing resource identity");
  check(Object.keys(state.contents).length + Object.keys(state.placements).length <= DURABLE_LIMITS.maxGraphRecords, "Document graph exceeds admitted bounded reader size");
  const result: ResourceSnapshot = { format: "codex-resource-gate", version: 1, resourceId, revision,
    rootPlacementKey: state.rootPlacementKey, contents: clone(state.contents) as ResourceSnapshot["contents"],
    placements: Object.fromEntries(Object.entries(state.placements).map(([key, p]) => [key, projectPlacement(p, resourceId)])) };
  validateResource(result);
  return freeze(result);
}

/** No repository reads, graph traversal, serialization or snapshots in capture. */
export class WholeDocumentCapture {
  private sourceRevision: number;
  private revision: number;
  private failed = false;
  readonly resourceId: string;
  readonly rootKey: string;
  constructor(baseline: DeepReadonly<ResourceSnapshot>, sourceRevision: number) {
    this.resourceId = baseline.resourceId; this.rootKey = baseline.rootPlacementKey;
    this.revision = baseline.revision; this.sourceRevision = sourceRevision;
  }
  get localRevision() { return this.revision; }
  capture(source: DeepReadonly<HistoryChanges>): DeepReadonly<ResourceTransition> {
    check(!this.failed, "capture needs a new enrollment boundary");
    try {
      check(source.beforeRevision === this.sourceRevision && source.afterRevision === source.beforeRevision + 1, "noncontiguous source capture");
      check(source.root.before === this.rootKey && source.root.after === this.rootKey, "Document root changed");
      const event: ResourceTransition = { format: "codex-resource-transition-gate", version: 1, resourceId: this.resourceId,
        commitId: source.commitId, cause: source.cause, timestamp: source.timestamp, label: source.label, commands: source.commands,
        ...(source.inputIntent ? { inputIntent: source.inputIntent } : {}), sourceCounters: { before: source.beforeRevision, after: source.afterRevision },
        beforeRevision: this.revision, afterRevision: this.revision + 1, root: source.root,
        contents: source.contents, placements: source.placements.map(p => ({ key: p.key,
          before: p.before ? projectPlacement(p.before, this.resourceId) : null,
          after: p.after ? projectPlacement(p.after, this.resourceId) : null })) } as ResourceTransition;
      this.sourceRevision = source.afterRevision; this.revision++;
      return freeze(event);
    } catch (error) { this.failed = true; throw error; }
  }
}

// Reuse the proven lossless value grammar, with a released outer format name.
const oldPrefix = '{"format":"codex-history-value-spike","version":1,';
const prefix = '{"format":"codex-history-value","version":1,';
export function encodeDurableWire(value: unknown): string { return prefix + encodeWire(value).slice(oldPrefix.length); }
export function decodeDurableWire(text: string, measure?: ReadMeasure): unknown {
  check(text.startsWith(prefix), "unsupported wire envelope");
  return decodeWire(oldPrefix + text.slice(prefix.length), measure);
}
export function assertBoundedSnapshot(state: DeepReadonly<ResourceSnapshot>): number {
  check(Object.keys(state.contents).length + Object.keys(state.placements).length <= DURABLE_LIMITS.maxGraphRecords, "Document graph exceeds admitted bounded reader size");
  const bytes = new TextEncoder().encode(encodeDurableWire(state)).byteLength;
  check(bytes <= DURABLE_LIMITS.supportedStateBytes, "Document exceeds admitted 20 MiB checkpoint/read bound");
  return bytes;
}
export function replayDurablePath(baseline: DeepReadonly<ResourceSnapshot>, events: readonly DeepReadonly<ResourceTransition>[], measure: ReadMeasure = (_name, action) => action()): DeepReadonly<ResourceSnapshot> {
  check(events.length <= DURABLE_LIMITS.maxReadPath, "checkpoint path exceeds bounded reader distance");
  measure("verification", () => validateResource(baseline as ResourceSnapshot)); measure("serialization", () => assertBoundedSnapshot(baseline));
  let state = baseline;
  for (const event of events) { state = replayResource(state, event, measure); measure("serialization", () => assertBoundedSnapshot(state)); }
  return state;
}
/** Caller discards this private working state on any error. Never a live editor. */
export function applyDurableTransitionInPlace(state: ResourceSnapshot, event: DeepReadonly<ResourceTransition>, measure: ReadMeasure = (_name, action) => action()): void {
  check(event.format === "codex-resource-transition-gate" && event.version === 1 && event.resourceId === state.resourceId &&
    event.root.before === state.rootPlacementKey && event.beforeRevision === state.revision &&
    Number.isSafeInteger(event.afterRevision) && event.afterRevision === event.beforeRevision + 1 &&
    Number.isSafeInteger(event.sourceCounters.before) && event.sourceCounters.before >= 0 &&
    event.sourceCounters.after === event.sourceCounters.before + 1, "invalid exact transition parent/counters");
  measure("replayApply", () => applyExactRecords(state, event));
  state.rootPlacementKey = event.root.after; state.revision = event.afterRevision;
  measure("verification", () => validateResource(state));
  check(Object.keys(state.contents).length + Object.keys(state.placements).length <= DURABLE_LIMITS.maxGraphRecords, "Document graph exceeds admitted bounded reader size");
}

/** Shared browser/native admission: exact serialized byte accounting over only
 * changed records, with the SAME full preimage and graph verification. A failed
 * application invalidates this private working state; never enqueue its packet. */
export function applyDurableTransitionSized(state: ResourceSnapshot, event: DeepReadonly<ResourceTransition>, previousBytes: number, measure: ReadMeasure = (_name, action) => action()): number {
  check(Number.isSafeInteger(previousBytes) && previousBytes >= 0 && previousBytes <= DURABLE_LIMITS.supportedStateBytes, "invalid prior admitted state size");
  const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
  const valueBytes = (value: unknown) => bytes(encodeDurableWire(value));
  const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
  const fieldBytes = (key: string, value: unknown) => bytes(JSON.stringify(key)) + 1 + valueBytes(value);
  const mapPart = (map: Record<string, unknown>, keys: string[]) => ({
    total: keys.reduce((sum, key) => sum + (own(map, key) ? fieldBytes(key, map[key]) : 0), 0), count: Object.keys(map).length,
  });
  const contentKeys = [...new Set(event.contents.map(c => c.key))], placementKeys = [...new Set(event.placements.map(p => p.key))];
  const tag = "$codexHistoryValue";
  const escapedMap = own(state.contents, tag) || own(state.placements, tag) || contentKeys.includes(tag) || placementKeys.includes(tag);
  const before = measure("serialization", () => ({ contents: mapPart(state.contents, contentKeys), placements: mapPart(state.placements, placementKeys),
    scalar: valueBytes(state.revision) + valueBytes(state.rootPlacementKey) }));
  applyDurableTransitionInPlace(state, event, measure);
  return measure("serialization", () => {
    let result: number;
    if (escapedMap) result = valueBytes(state);
    else {
      const after = { contents: mapPart(state.contents, contentKeys), placements: mapPart(state.placements, placementKeys),
        scalar: valueBytes(state.revision) + valueBytes(state.rootPlacementKey) };
      // Value wrappers cancel for retained records. Added/removed members and
      // whole-map comma counts are accounted for explicitly.
      const wrapper = bytes(encodeDurableWire(null)) - 4;
      const difference = (a: { total: number; count: number }, b: { total: number; count: number }) =>
        b.total - a.total - wrapper * (b.count - a.count) + Math.max(0, b.count - 1) - Math.max(0, a.count - 1);
      result = previousBytes + difference(before.contents, after.contents) + difference(before.placements, after.placements) + after.scalar - before.scalar;
    }
    check(result <= DURABLE_LIMITS.supportedStateBytes, "state exceeds admitted 20 MiB bound");
    return result;
  });
}

export interface SavedHistoryRevision { segmentId: string; revisionId: string }
export interface HistoryDocumentEnvelope {
  type: "document-block"; id: string; metadata?: Record<string, unknown>; format: "codex-history-document"; version: 1;
  resourceId: string; memoirId: string; document: GateDocument;
  /** Explicit legacy retention semantics, separate from resource membership. */
  definitionOwnerBlockIds: string[];
  saved?: SavedHistoryRevision;
}
export function isHistoryDocument(value: unknown): value is HistoryDocumentEnvelope {
  return !!value && typeof value === "object" && (value as Record<string, unknown>).format === "codex-history-document";
}
export function encodeHistoryDocument(state: DeepReadonly<ResourceSnapshot>, memoirId: string, saved?: SavedHistoryRevision): HistoryDocumentEnvelope {
  check(identifier(memoirId), "missing memoir identity");
  if (saved) check(identifier(saved.segmentId) && identifier(saved.revisionId), "invalid saved revision receipt");
  const root = state.placements[state.rootPlacementKey]; check(root.target.kind === "local", "external Document root");
  return { type: "document-block", id: state.contents[root.target.contentKey].payload.id as string, format: "codex-history-document", version: 1, resourceId: state.resourceId, memoirId,
    document: encodeGateDocument(state), definitionOwnerBlockIds: Object.values(state.contents)
      .filter(c => c.definitionOwnerKey !== undefined).map(c => c.payload.id as string), ...(saved ? { saved: clone(saved) } : {}) };
}
export function decodeHistoryDocument(value: unknown): { state: RepositoryState; resourceId: string; memoirId: string; saved?: SavedHistoryRevision } {
  const e = value as HistoryDocumentEnvelope;
  check(e && e.type === "document-block" && e.format === "codex-history-document" && e.version === 1 && identifier(e.resourceId) && identifier(e.memoirId), "unsupported portable Document envelope");
  check(Object.keys(e).every(k => ["type", "id", "metadata", "format", "version", "resourceId", "memoirId", "document", "definitionOwnerBlockIds", "saved"].includes(k)), "unknown reserved Document field");
  check(e.document?.resourceId === e.resourceId && Array.isArray(e.definitionOwnerBlockIds) && e.definitionOwnerBlockIds.every(identifier) && new Set(e.definitionOwnerBlockIds).size === e.definitionOwnerBlockIds.length, "invalid Document membership");
  const fields = (v: unknown, allowed: readonly string[]) => check(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every(k => allowed.includes(k)), "unknown reserved portable field");
  fields(e.document, ["format", "version", "resourceId", "root", "blocks"]);
  const edge = (v: GateDocument["root"]) => {
    fields(v, ["placementId", "kind", "target"]); fields(v.target, v.target.kind === "local" ? ["kind", "blockId"] : ["kind", "reference"]);
  };
  edge(e.document.root); check(Array.isArray(e.document.blocks), "missing portable Block definitions");
  for (const b of e.document.blocks) {
    fields(b, ["id", "type", "properties", "children", "relations", "inline"]);
    if (b.children != null) { check(Array.isArray(b.children), "invalid portable children"); b.children.forEach(edge); }
    if (b.relations != null) { fields(b.relations, ["owned", "opaque"]); Object.values(b.relations.owned).forEach(edge); }
    if (b.inline !== undefined) { check(Array.isArray(b.inline), "invalid portable inline"); for (const atom of b.inline) fields(atom, atom.kind === "text" ? ["kind", "text"] : ["kind", "properties"]); }
  }
  if (e.saved) check(Object.keys(e.saved).length === 2 && identifier(e.saved.segmentId) && identifier(e.saved.revisionId), "invalid saved revision receipt");
  const resource = decodeGateDocument(e.document), root = resource.placements[resource.rootPlacementKey];
  check(root.target.kind === "local", "external Document root");
  check(e.id === resource.contents[root.target.contentKey].payload.id, "Document display identity conflicts with authored root");
  const owners = new Set(e.definitionOwnerBlockIds), found = new Set<string>();
  const state: RepositoryState = { rootPlacementKey: resource.rootPlacementKey, revision: 0,
    contents: clone(resource.contents) as RepositoryState["contents"], placements: Object.create(null) };
  for (const c of Object.values(state.contents)) if (owners.has(c.payload.id as string)) {
    check(!cell(c), "Cell cannot own a retained definition"); c.definitionOwnerKey = root.target.contentKey; found.add(c.payload.id as string);
  }
  check(found.size === owners.size, "unknown retained definition");
  for (const [key, p] of Object.entries(resource.placements)) state.placements[key] = canonicalPlacement(p);
  return { state, resourceId: e.resourceId, memoirId: e.memoirId, ...(e.saved ? { saved: clone(e.saved) } : {}) };
}
export function resourceToRepository(resource: DeepReadonly<ResourceSnapshot>): RepositoryState {
  return { rootPlacementKey: resource.rootPlacementKey, revision: resource.revision,
    contents: clone(resource.contents) as RepositoryState["contents"],
    placements: Object.fromEntries(Object.entries(resource.placements).map(([key, p]) => [key, canonicalPlacement(p)])) };
}
function canonicalPlacement(p: DeepReadonly<ResourcePlacement>): PlacementRecord {
  return { key: p.key, kind: p.kind, ...(p.kind === "inline" ? {} : { placementId: p.placementId }),
    ...(p.target.kind === "local" ? { contentKey: p.target.contentKey } : { contentKey: `unresolved:${p.key}`, externalReference: clone(p.target.reference) }) };
}

/** Read one already verified bounded state, never its whole archive ancestry.
 * Absence without ancestry evidence is explicitly unknown, never invented deletion. */
export function queryDurableSubtree(state: DeepReadonly<ResourceSnapshot>, request: { blockId: string; revisionId: string; placementId?: string; route?: readonly string[] }): DeepReadonly<SubtreeResult> {
  const base = { blockId: request.blockId, revisionId: request.revisionId };
  const content = Object.values(state.contents).find(c => !cell(c) && c.payload.id === request.blockId);
  if (!content) return freeze({ ...base, status: "unknown-block", message: "Block absent in this exact state; no unbounded ancestry search was performed." });
  const occurrences: HistoricalOccurrence[] = [];
  let work = 0;
  const budget = () => check(++work <= DURABLE_LIMITS.maxGraphRecords * 2, "subtree traversal exceeded bounded work");
  const edges = (c: DeepReadonly<ContentRecord>): Array<{ key: string; slot: Slot; index?: number }> => [
    ...c.children.map((key, index) => ({ key, slot: { kind: "children" as const }, index })),
    ...c.inlineContent.map((key, index) => ({ key, slot: { kind: "inline-content" as const }, index })),
    ...Object.entries(c.ownedRelations).map(([name, key]) => ({ key, slot: { kind: "relation" as const, name } }))];
  const locate = (key: string, route: string[], ancestors: Set<string>, parent?: string, slot?: Slot, index?: number) => {
    budget(); const p = state.placements[key]; if (p.target.kind === "external") return;
    const next = [...route, p.placementId], ck = p.target.contentKey;
    if (ck === content.key) occurrences.push({ placementKey: key, contentKey: ck, route: next, ...(parent ? { parentContentKey: parent, slot, index } : {}) });
    if (ancestors.has(ck)) return;
    const seen = new Set(ancestors).add(ck);
    for (const edge of edges(state.contents[ck])) if (edge.slot.kind !== "inline-content") locate(edge.key, next, seen, ck, edge.slot, edge.index);
  };
  try {
    locate(state.rootPlacementKey, [], new Set());
    const root = state.placements[state.rootPlacementKey];
    const registry = root.target.kind === "local" ? state.contents[root.target.contentKey].payload.linkedAnnotations as Record<string, unknown> | undefined : undefined;
    return queryDurableClosure(state, request, content, occurrences, registry, work);
  } catch (error) { return freeze({ ...base, status: "incomplete", message: String(error) }); }
}

/** Shared result construction, NOT a verifier. Callers must supply either a fully
 * verified state or an authenticated complete closure and occurrence evidence. */
export function queryDurableClosure(
  state: Pick<DeepReadonly<ResourceSnapshot>, "contents" | "placements">,
  request: { blockId: string; revisionId: string; placementId?: string; route?: readonly string[] },
  content: DeepReadonly<ContentRecord>, occurrences: HistoricalOccurrence[],
  registry: Record<string, unknown> | undefined, locationWork: number,
): DeepReadonly<SubtreeResult> {
  const base = { blockId: request.blockId, revisionId: request.revisionId };
  let work = locationWork;
  const budget = () => check(++work <= DURABLE_LIMITS.maxGraphRecords * 2, "subtree traversal exceeded bounded work");
  const edges = (c: DeepReadonly<ContentRecord>): Array<{ key: string; slot: Slot; index?: number }> => [
    ...c.children.map((key, index) => ({ key, slot: { kind: "children" as const }, index })),
    ...c.inlineContent.map((key, index) => ({ key, slot: { kind: "inline-content" as const }, index })),
    ...Object.entries(c.ownedRelations).map(([name, key]) => ({ key, slot: { kind: "relation" as const, name } }))];
  try {
    const candidates = occurrences.filter(o => (!request.placementId || state.placements[o.placementKey].placementId === request.placementId) && (!request.route || equal(request.route, o.route)));
    if (candidates.length > 1) return freeze({ ...base, status: "ambiguous-occurrence", candidates });
    if (occurrences.length && !candidates.length) return freeze({ ...base, status: "absent-occurrence", candidates: occurrences });
    const fragment: HistoricalFragment = { contents: Object.create(null), placements: Object.create(null), linkedAnnotations: {}, dependencyContentKeys: [], diagnostics: [] };
    const visit = (o: HistoricalOccurrence, ancestors: Set<string>): OccurrenceTree => {
      budget(); const p = state.placements[o.placementKey], node: OccurrenceTree = { ...o, children: [] };
      fragment.placements[p.key] = canonicalPlacement(p);
      if (p.target.kind === "external") { node.excludedReference = true; fragment.diagnostics.push({ kind: "block-reference", id: p.target.reference.targetId, available: false, contentKey: o.contentKey }); return node; }
      const c = state.contents[p.target.contentKey]; fragment.contents[c.key] ??= clone(c) as ContentRecord;
      if (ancestors.has(c.key)) { node.cycle = true; return node; }
      const seen = new Set(ancestors).add(c.key);
      node.children = edges(c).map(edge => {
        const child = state.placements[edge.key];
        return visit({ placementKey: edge.key, contentKey: child.target.kind === "local" ? child.target.contentKey : `unresolved:${child.key}`,
          route: [...o.route, child.placementId], parentContentKey: c.key, slot: edge.slot, index: edge.index }, seen);
      });
      return node;
    };
    if (candidates[0]) fragment.tree = visit(candidates[0], new Set());
    else {
      fragment.contents[content.key] = clone(content) as ContentRecord;
      // Unplaced definitions retain their complete owned subtree and Cells.
      const copy = (c: DeepReadonly<ContentRecord>) => { for (const key of slots(c)) {
        budget(); const p = state.placements[key]; fragment.placements[key] = canonicalPlacement(p);
        if (p.target.kind === "local" && !fragment.contents[p.target.contentKey]) { const next = state.contents[p.target.contentKey]; fragment.contents[next.key] = clone(next) as ContentRecord; copy(next); }
      } }; copy(content);
    }
    for (const c of Object.values(fragment.contents)) for (const value of [c.payload, ...(Array.isArray(c.payload.standoffProperties) ? c.payload.standoffProperties : []), ...(Array.isArray(c.payload.blockProperties) ? c.payload.blockProperties : [])]) {
      if (value && typeof value === "object" && typeof (value as Record<string, unknown>).annotationId === "string") {
        const id = (value as Record<string, unknown>).annotationId as string;
        if (registry && Object.hasOwn(registry, id) && !Object.hasOwn(fragment.linkedAnnotations, id)) Object.defineProperty(fragment.linkedAnnotations, id, { value: clone(registry[id]), enumerable: true });
      }
    }
    return freeze({ ...base, status: occurrences.length ? "available" : "unplaced", ...(candidates[0] ? { occurrence: candidates[0] } : {}), fragment });
  } catch (error) { return freeze({ ...base, status: "incomplete", message: String(error) }); }
}

export function compareDurableSubtrees(before: DeepReadonly<SubtreeResult>, after: DeepReadonly<SubtreeResult>): DeepReadonly<SubtreeComparison> {
  const changes: SubtreeComparison["changes"] = [];
  const authored = (r: DeepReadonly<SubtreeResult>) => Object.values(r.fragment?.contents ?? {}).filter(c => !cell(c)).map(c => ({
    id: c.payload.id, type: c.viewType, payload: c.payload,
    inline: c.compactInline ?? c.inlineContent.map(pk => r.fragment!.contents[r.fragment!.placements[pk].contentKey]?.payload),
    children: c.children.map(pk => r.fragment!.placements[pk].placementId),
    relations: Object.fromEntries(Object.entries(c.ownedRelations).map(([name, pk]) => [name, r.fragment!.placements[pk].placementId])),
    opaqueRelations: c.opaqueRelations, wireChildren: c.wireChildren, wireRelation: c.wireRelation,
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const comparable = !!before.fragment && !!after.fragment;
  if (comparable) {
    if (!equal(authored(before), authored(after))) changes.push({ kind: "authored", blockId: before.blockId });
    const location = (r: DeepReadonly<SubtreeResult>) => r.occurrence && ({ route: r.occurrence.route, slot: r.occurrence.slot, index: r.occurrence.index });
    if (!equal(location(before), location(after))) changes.push({ kind: "location", blockId: before.blockId });
    const external = (r: DeepReadonly<SubtreeResult>) => Object.values(r.fragment!.placements).filter(p => p.externalReference)
      .map(p => [p.placementId, p.externalReference]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (!equal(before.fragment!.linkedAnnotations, after.fragment!.linkedAnnotations) || !equal(external(before), external(after)) ||
      !equal(before.fragment!.diagnostics.map(d => [d.kind, d.id, d.available]), after.fragment!.diagnostics.map(d => [d.kind, d.id, d.available]))) changes.push({ kind: "dependency", blockId: before.blockId });
  }
  return freeze({ comparable, before, after, changes });
}

/** Exact touched-record and ancestor closure, computed off the main callback. */
export function affectedBlockIds(before: DeepReadonly<ResourceSnapshot>, after: DeepReadonly<ResourceSnapshot>, event: DeepReadonly<ResourceTransition>): string[] {
  const ids = new Set<string>();
  // A moved/reordered container changes every descendant's historical location,
  // even when neither its PlacementRecord nor those descendants were rewritten.
  const structuralPositions = (c: DeepReadonly<ContentRecord> | undefined) => new Map<string, string>(c ? [
    ...c.children.map((key, index) => [key, `child:${index}`] as [string, string]),
    ...Object.entries(c.ownedRelations).map(([name, key]) => [key, `relation:${name}`] as [string, string]),
  ] : []);
  const relocated = new Set<string>();
  for (const change of event.contents) {
    const old = structuralPositions(before.contents[change.key]), next = structuralPositions(after.contents[change.key]);
    for (const key of new Set([...old.keys(), ...next.keys()])) if (old.get(key) !== next.get(key)) relocated.add(key);
  }
  for (const change of event.placements) if (change.before?.kind !== "inline" || change.after?.kind !== "inline") relocated.add(change.key);
  const registry = (state: DeepReadonly<ResourceSnapshot>) => {
    const root = state.placements[state.rootPlacementKey];
    return root.target.kind === "local" ? state.contents[root.target.contentKey].payload.linkedAnnotations as Record<string, unknown> | undefined : undefined;
  };
  const a = registry(before), b = registry(after), changedDefinitions = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})].filter(id => !equal(a?.[id], b?.[id])));
  for (const state of [before, after]) {
    const parents = new Map<string, Set<string>>();
    for (const c of Object.values(state.contents)) for (const key of slots(c)) {
      const p = state.placements[key]; if (p?.target.kind !== "local") continue;
      const list = parents.get(p.target.contentKey) ?? new Set<string>(); list.add(c.key); parents.set(p.target.contentKey, list);
    }
    const seen = new Set<string>(), visit = (key: string) => {
      if (seen.has(key)) return; seen.add(key);
      const c = state.contents[key]; if (c && !cell(c) && identifier(c.payload.id)) ids.add(c.payload.id);
      for (const parent of parents.get(key) ?? []) visit(parent);
    };
    for (const c of event.contents) visit(c.key);
    for (const change of event.placements) { const p = state.placements[change.key]; if (p?.target.kind === "local") visit(p.target.contentKey); }
    const descendants = new Set<string>(), work: string[] = [];
    for (const key of relocated) { const p = state.placements[key]; if (p?.target.kind === "local") work.push(p.target.contentKey); }
    while (work.length) {
      const key = work.pop()!; if (descendants.has(key)) continue; descendants.add(key); visit(key);
      const c = state.contents[key]; if (!c) continue;
      for (const pk of [...c.children, ...Object.values(c.ownedRelations)]) {
        const p = state.placements[pk]; if (p?.target.kind === "local") work.push(p.target.contentKey);
      }
    }
    if (changedDefinitions.size) for (const c of Object.values(state.contents)) {
      const values = [c.payload, ...(Array.isArray(c.payload.standoffProperties) ? c.payload.standoffProperties : []), ...(Array.isArray(c.payload.blockProperties) ? c.payload.blockProperties : [])];
      if (values.some(value => value && typeof value === "object" && changedDefinitions.has((value as Record<string, unknown>).annotationId as string))) visit(c.key);
    }
  }
  return [...ids].sort();
}
