import { clone } from "../block-tree/clone";
import { equal, freeze, type DeepReadonly } from "../block-tree/commit-capture";
import type { RepositoryState, ContentRecord } from "../block-tree/types";
import type { HistorySource } from "./memory-store";
import { edges, indexHistoricalState } from "./index";
import { HistoryError } from "./replay";
import { groupTimeline, type GroupingRequest, type PlaybackGroup } from "./grouping";
import { readOnlyHistorySource } from "./source";
import type { SubtreeRequest, SubtreeResult, HistoricalFragment, HistoricalOccurrence, OccurrenceTree, TimelineRequest, TimelinePage, TimelineEntry, CompareRequest, SubtreeComparison } from "./types";

function matches(occurrence: HistoricalOccurrence, request: SubtreeRequest): boolean {
  return (!request.placementKey || request.placementKey === occurrence.placementKey) && (!request.route || equal(request.route, occurrence.route));
}

/** Validate the selected closure, not a fictitious full Document. Excluded edges
 * remain explicit and are allowed to target records outside the fragment. */
export function validateFragment(fragment: HistoricalFragment): void {
  const visit = (tree: OccurrenceTree) => {
    const placement = fragment.placements[tree.placementKey];
    if (!placement || placement.contentKey !== tree.contentKey || !tree.excludedReference && !fragment.contents[tree.contentKey]) throw new HistoryError("incomplete", "Historical closure missing graph record");
    tree.children.forEach(visit);
  };
  if (fragment.tree) visit(fragment.tree);
  for (const key of fragment.dependencyContentKeys) if (!fragment.contents[key]) throw new HistoryError("incomplete", "Historical dependency record missing");
}

function extract(state: DeepReadonly<RepositoryState>, request: SubtreeRequest, contentKey: string, occurrence?: HistoricalOccurrence): HistoricalFragment {
  const fragment: HistoricalFragment = { contents: {}, placements: {}, linkedAnnotations: {}, dependencyContentKeys: [], diagnostics: [] };
  const index = indexHistoricalState(state);
  const root = state.contents[state.placements[state.rootPlacementKey].contentKey];
  const registry = (root.payload.linkedAnnotations ?? {}) as Record<string, unknown>;
  const visit = (current: HistoricalOccurrence, ancestors: Set<string>, selected = false): OccurrenceTree => {
    const placement = state.placements[current.placementKey], content = state.contents[current.contentKey];
    fragment.placements[placement.key] = clone(placement);
    const tree: OccurrenceTree = { ...clone(current), children: [] };
    if (!selected && placement.kind === "reference" && !request.references) { tree.excludedReference = true; return tree; }
    fragment.contents[content.key] ??= clone(content) as ContentRecord;
    if (ancestors.has(content.key)) { tree.cycle = true; return tree; }
    const next = new Set(ancestors).add(content.key);
    for (const edge of edges(content)) {
      if (edge.slot.kind === "relation" && request.ownedRelations === false) continue;
      const target = state.placements[edge.key];
      tree.children.push(visit({ placementKey: edge.key, contentKey: target.contentKey, route: [...current.route, edge.key], parentContentKey: content.key, slot: edge.slot, index: edge.index }, next));
    }
    return tree;
  };
  if (occurrence) fragment.tree = visit(occurrence, new Set(), true);
  else fragment.contents[contentKey] = clone(state.contents[contentKey]) as ContentRecord;

  // Known reference forms mirror clipboard.ts; never interpret arbitrary IDs.
  const scanned = new Set<string>();
  const inspect = (value: unknown, owner: string) => {
    if (!value || typeof value !== "object") return;
    const property = value as Record<string, unknown>;
    if (property.type === "codex/block-reference" && typeof property.value === "string") {
      const target = index.byBlock.get(property.value);
      fragment.diagnostics.push({ kind: "block-reference", id: property.value, available: !!target, contentKey: owner });
      if (target && request.references && !fragment.contents[target]) {
        // Reference targets are dependency content, not invented owned children.
        const targetOccurrence = index.occurrences.get(target)?.[0];
        if (targetOccurrence) visit(targetOccurrence, new Set(), true);
        else fragment.contents[target] = clone(state.contents[target]) as ContentRecord;
        fragment.dependencyContentKeys.push(target);
      }
    }
    if (typeof property.annotationId === "string") {
      const definition = registry[property.annotationId];
      fragment.diagnostics.push({ kind: "linked-annotation", id: property.annotationId, available: !!definition, contentKey: owner });
      if (definition && !Object.prototype.hasOwnProperty.call(fragment.linkedAnnotations, property.annotationId)) {
        Object.defineProperty(fragment.linkedAnnotations, property.annotationId, { value: clone(definition), enumerable: true, writable: true });
        inspect(definition, owner);
      }
    }
  };
  while (Object.keys(fragment.contents).some(key => !scanned.has(key))) for (const content of Object.values(fragment.contents)) {
    if (scanned.has(content.key)) continue; scanned.add(content.key);
    inspect(content.payload, content.key);
    for (const field of ["standoffProperties", "blockProperties"]) if (Array.isArray(content.payload[field])) for (const property of content.payload[field]) inspect(property, content.key);
    if (typeof content.payload.src === "string") fragment.diagnostics.push({ kind: "asset", id: content.payload.src, available: false, contentKey: content.key });
  }
  validateFragment(fragment);
  return fragment;
}

export class HistoryQueries {
  private readonly source: HistorySource;
  constructor(source: HistorySource) { this.source = readOnlyHistorySource(source); }

  async getSubtreeAt(request: SubtreeRequest): Promise<DeepReadonly<SubtreeResult>> {
    const base = { revisionId: request.revisionId, blockId: request.blockId };
    try {
      if (request.branchHeadRevisionId && !(await this.source.ancestry(request.branchHeadRevisionId)).includes(request.revisionId)) throw new HistoryError("invalid", "Requested revision is not on selected branch");
      const state = await this.source.getStateAt(request.segmentId, request.revisionId);
      const index = indexHistoricalState(state), contentKey = index.byBlock.get(request.blockId);
      if (contentKey) {
        const all = index.occurrences.get(contentKey) ?? [], candidates = all.filter(value => matches(value, request));
        if (!all.length) return freeze({ ...base, status: "unplaced", fragment: extract(state, request, contentKey) });
        if (candidates.length > 1) return freeze({ ...base, status: "ambiguous-occurrence", candidates });
        if (candidates.length === 1) return freeze({ ...base, status: "available", occurrence: candidates[0], fragment: extract(state, request, contentKey, candidates[0]) });
        if (request.placementKey && !state.placements[request.placementKey]) {
          const previous = await this.lastAvailable(request);
          if (previous) return freeze({ ...base, status: "deleted", deletedKind: "placement", lastAvailableRevisionId: previous });
        }
        return freeze({ ...base, status: "absent-occurrence", candidates: all });
      }
      const previous = await this.lastAvailable(request);
      if (previous) return freeze({ ...base, status: "deleted", deletedKind: "content", lastAvailableRevisionId: previous });
      if (request.branchHeadRevisionId) {
        const ancestry = await this.source.ancestry(request.branchHeadRevisionId), position = ancestry.indexOf(request.revisionId);
        for (const id of ancestry.slice(position + 1)) {
          const future = indexHistoricalState(await this.source.getStateAt(request.segmentId, id));
          if (future.byBlock.has(request.blockId)) return freeze({ ...base, status: "not-yet-created" });
        }
      }
      return freeze({ ...base, status: "unknown-block" });
    } catch (error) {
      if (error instanceof HistoryError && (error.status === "incomplete" || error.status === "unsupported")) return freeze({ ...base, status: error.status, message: error.message });
      throw error;
    }
  }
  private async lastAvailable(request: SubtreeRequest): Promise<string | undefined> {
    const ancestry = await this.source.ancestry(request.revisionId);
    for (const id of [...ancestry.slice(0, -1)].reverse()) {
      const index = indexHistoricalState(await this.source.getStateAt(request.segmentId, id)), key = index.byBlock.get(request.blockId);
      if (key && (!request.placementKey && !request.route || index.occurrences.get(key)?.some(value => matches(value, request)))) return id;
    }
  }
  async getLocationAt(request: SubtreeRequest): Promise<DeepReadonly<Omit<SubtreeResult, "fragment">>> {
    const { fragment, ...result } = await this.getSubtreeAt(request); return freeze(result);
  }
  async getTimeline(request: TimelineRequest): Promise<DeepReadonly<TimelinePage>> {
    if (request.segmentId !== this.source.segmentId) throw new HistoryError("incomplete", "Unknown timeline segment");
    const ancestry = await this.source.ancestry(request.headRevisionId);
    if (request.afterRevisionId && !ancestry.includes(request.afterRevisionId)) throw new HistoryError("invalid", "Timeline cursor is not on selected branch");
    const limit = request.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new HistoryError("invalid", "Invalid timeline page size");
    const entries: TimelineEntry[] = [];
    const candidates = await this.source.candidateRevisions?.(request.blockId);
    const relevant = candidates && new Set(candidates);
    let nextCursor: string | undefined;
    const start = request.afterRevisionId ? ancestry.indexOf(request.afterRevisionId) + 1 : 1;
    for (let i = start; i < ancestry.length; i++) {
      if (relevant && !relevant.has(ancestry[i])) continue;
      const revision = (await this.source.getRevision(ancestry[i]))!;
      const before = await this.getSubtreeAt({ ...request, revisionId: ancestry[i - 1] });
      const after = await this.getSubtreeAt({ ...request, revisionId: ancestry[i] });
      for (const result of [before, after]) if (result.status === "incomplete" || result.status === "unsupported") throw new HistoryError(result.status, result.message ?? "Timeline reconstruction unavailable");
      if (before.status === "ambiguous-occurrence" || after.status === "ambiguous-occurrence") throw new HistoryError("invalid", "Timeline requires an unambiguous occurrence selector");
      const kinds: TimelineEntry["kinds"] = [];
      const a = before.fragment, b = after.fragment;
      const keys = new Set([...Object.keys(a?.contents ?? {}), ...Object.keys(b?.contents ?? {})]);
      if (revision.event.contents.some(c => keys.has(c.key))) kinds.push("content");
      if (!equal(before.occurrence, after.occurrence)) kinds.push("location");
      if (!equal(a?.tree, b?.tree)) kinds.push("membership");
      if (!equal(a?.linkedAnnotations, b?.linkedAnnotations) || !equal(a?.diagnostics, b?.diagnostics)) kinds.push("dependency");
      if (revision.event.commands.some(c => c.relation && c.subjects.some(s => s.blockId === request.blockId))) kinds.push("genealogy");
      if (!kinds.length) continue;
      entries.push({ revisionId: revision.revisionId, timestamp: revision.event.timestamp, label: revision.event.label, kinds });
      if (entries.length === limit) { if (i < ancestry.length - 1) nextCursor = ancestry[i]; break; }
    }
    return freeze({ entries, nextCursor, headRevisionId: request.headRevisionId });
  }
  async compareSubtree(request: CompareRequest): Promise<DeepReadonly<SubtreeComparison>> {
    if (!!request.before.references !== !!request.after.references || (request.before.ownedRelations !== false) !== (request.after.ownedRelations !== false)) throw new HistoryError("invalid", "Comparison requires matching traversal policies");
    const before = await this.getSubtreeAt(request.before), after = await this.getSubtreeAt(request.after);
    const changes: SubtreeComparison["changes"] = [];
    const known = (result: DeepReadonly<SubtreeResult>) => ["available", "unplaced", "not-yet-created"].includes(result.status) || result.status === "deleted" && result.deletedKind === "content";
    if (!known(before) || !known(after)) return freeze({ before, after, comparable: false, changes });
    const authored = (result: DeepReadonly<SubtreeResult>) => new Map(Object.values(result.fragment?.contents ?? {}).filter(c => typeof c.payload.id === "string").map(c => [String(c.payload.id), c]));
    const a = authored(before), b = authored(after);
    const visible = (content: DeepReadonly<ContentRecord>, result: DeepReadonly<SubtreeResult>) => ({ viewType: content.viewType, payload: content.payload, opaqueRelations: content.opaqueRelations,
      inline: content.compactInline ?? content.inlineContent.map(key => result.fragment?.contents[result.fragment.placements[key]?.contentKey]?.payload) });
    const children = (content: DeepReadonly<ContentRecord>, result: DeepReadonly<SubtreeResult>) => edges(content).filter(edge => edge.slot.kind !== "inline-content" &&
      (edge.slot.kind !== "relation" || request.before.ownedRelations !== false)).map(edge => {
      const placement = result.fragment?.placements[edge.key]; return [edge.slot, placement?.kind, placement && result.fragment?.contents[placement.contentKey]?.payload.id, edge.key];
    });
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const left = a.get(id), right = b.get(id);
      if (!left) changes.push({ kind: "created", blockId: id });
      else if (!right) changes.push({ kind: "deleted", blockId: id });
      else {
        if (!equal(visible(left, before), visible(right, after))) changes.push({ kind: "authored", blockId: id });
        if (!equal(children(left, before), children(right, after))) changes.push({ kind: "children", blockId: id });
      }
    }
    if (!equal(before.occurrence, after.occurrence)) changes.push({ kind: "location" });
    if (!equal(before.fragment?.linkedAnnotations, after.fragment?.linkedAnnotations) || !equal(before.fragment?.diagnostics, after.fragment?.diagnostics)) changes.push({ kind: "dependency" });
    return freeze({ before, after, comparable: true, changes });
  }

  async getGroupedTimeline(request: TimelineRequest & { afterGroupId?: string; groupLimit?: number; grouping?: Pick<GroupingRequest, "locale" | "idleMs" | "maxSpanMs" | "asOfTimestamp"> }): Promise<DeepReadonly<{ groups: PlaybackGroup[]; nextGroupCursor?: string }>> {
    // Resolve the complete selected timeline before grouping. Pagination never
    // creates a boundary or bridges edits omitted from this subtree's timeline.
    const timeline = await this.getTimeline({ ...request, afterRevisionId: undefined, limit: Number.MAX_SAFE_INTEGER });
    const groups = await groupTimeline(this.source, { ...request.grouping, segmentId: request.segmentId, headRevisionId: request.headRevisionId,
      scope: JSON.stringify([request.blockId, request.placementKey, request.route, request.references ?? false, request.ownedRelations !== false]),
      revisionIds: timeline.entries.map(entry => entry.revisionId) });
    const limit = request.groupLimit ?? 25;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new HistoryError("invalid", "Invalid grouped page size");
    const position = request.afterGroupId ? groups.findIndex(group => group.groupId === request.afterGroupId) : -1;
    if (request.afterGroupId && position < 0) throw new HistoryError("invalid", "Unknown grouped timeline cursor");
    const page = groups.slice(position + 1, position + 1 + limit);
    return freeze({ groups: page as PlaybackGroup[], nextGroupCursor: position + 1 + limit < groups.length ? page.at(-1)?.groupId : undefined });
  }
}
