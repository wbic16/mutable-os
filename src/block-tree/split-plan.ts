import {contentLength} from "./inline-sequence";
import { isTextLeaf } from "./inline-plan";
import type { ContentRecord, RepositoryOperation, RepositoryState } from "./types";

export interface SplitChange { parent: string; left: string; right: string }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const inlineStructure = (record: ContentRecord) => {
  const { payload, inlineContent, inlineRevision, revision, ...rest } = record;
  return rest;
};
const parentStructure = (record: ContentRecord) => {
  const { children, wireChildren, revision, ...rest } = record;
  return rest;
};

export interface EmptyParagraphChange { parent: string; child: string; attached: boolean }

/** A single empty leaf attached/detached from a children slot. A retained
 * definition survives detachment; undo may reattach that same definition.
 * Shared placements and resource boundaries use full planning instead. */
export function emptyParagraphChangeFor(
  state: RepositoryState,
  operations: RepositoryOperation[],
  references: Pick<ReadonlyMap<string, number>, "get">,
): EmptyParagraphChange | undefined {
  if (operations.length !== 2 && operations.length !== 3) return;
  const edges = operations.filter(op => op.kind === "put-placement" || op.kind === "remove-placement");
  if (edges.length !== 1) return;
  const edge = edges[0];
  const inserting = edge.kind === "put-placement";
  const placement = edge.kind === "put-placement" ? edge.record : edge.kind === "remove-placement" ? state.placements[edge.key] : undefined;
  if (!placement || placement.kind !== "owned" || placement.externalReference || placement.resolvedReference ||
    placement.resourceRegistration || placement.key === state.rootPlacementKey) return;
  if (inserting ? !!state.placements[placement.key] : references.get(placement.contentKey) !== 1) return;
  const retaining = operations.length === 2;
  const put = operations.filter(op => op.kind === "put-content").map(op => op.record);
  if (put.length !== (inserting && !retaining ? 2 : 1) || new Set(put.map(c => c.key)).size !== put.length) return;
  const child = inserting && !retaining ? put.find(c => c.key === placement.contentKey) : state.contents[placement.contentKey];
  if (!child || child.inlineKind !== "standoff" || child.viewType !== "standoff-editor-block" ||
    child.children.length || contentLength(child) || Object.keys(child.ownedRelations).length) return;
  if (child.definitionOwnerKey !== undefined && state.contents[child.definitionOwnerKey]?.viewType !== "document-block") return;
  if (retaining) {
    if (!child.definitionOwnerKey || inserting && (references.get(child.key) ?? 0) !== 0) return;
  } else if (inserting ? !!state.contents[child.key] : !operations.some(op => op.kind === "remove-content" && op.key === child.key)) return;
  const parent = put.find(c => c.key !== child.key);
  const previous = parent && state.contents[parent.key];
  if (!parent || !previous || !same(parentStructure(previous), parentStructure(parent))) return;
  // Incremental membership is safe only within the declared Document owner.
  if (child.definitionOwnerKey && child.definitionOwnerKey !== (parent.viewType === "document-block" ? parent.key : parent.definitionOwnerKey)) return;
  const expanded = inserting ? parent.children : previous.children;
  const compact = inserting ? previous.children : parent.children;
  if (expanded.filter(key => key === placement.key).length !== 1 ||
    !same(expanded.filter(key => key !== placement.key), compact)) return;
  return { parent: parent.key, child: child.key, attached: inserting };
}

export function emptyParagraphParentFor(
  state: RepositoryState, operations: RepositoryOperation[], references: Pick<ReadonlyMap<string, number>, "get">,
): string | undefined {
  return emptyParagraphChangeFor(state, operations, references)?.parent;
}

/** Recognise a split or its exact structural inverse. Only existing leaf Cells
 * move, so freshness, adjacency and sequence conservation prove graph safety.
 * Complex blocks/atoms go through full planning instead.
 */
export function splitChangeFor(
  state: RepositoryState,
  operations: RepositoryOperation[],
  references: Pick<ReadonlyMap<string, number>, "get">,
): SplitChange | undefined {
  if (operations.length !== 4) return;
  const edge = operations.filter(op => op.kind === "put-placement" || op.kind === "remove-placement");
  if (edge.length !== 1) return;
  const operation = edge[0];
  const splitting = operation.kind === "put-placement";
  const placement = operation.kind === "put-placement" ? operation.record : operation.kind === "remove-placement" ? state.placements[operation.key] : undefined;
  if (!placement || placement.kind !== "owned") return;
  if (splitting ? !!state.placements[placement.key] : references.get(placement.contentKey) !== 1) return;
  const put = operations.filter(op => op.kind === "put-content").map(op => op.record);
  if (new Set(put.map(record => record.key)).size !== put.length) return;
  const right = splitting ? put.find(record => record.key === placement.contentKey) : state.contents[placement.contentKey];
  if (!right || right.inlineKind !== "standoff" || right.children.length || Object.keys(right.ownedRelations).length) return;
  if (right.definitionOwnerKey !== undefined && state.contents[right.definitionOwnerKey]?.viewType !== "document-block") return;
  if (splitting ? !!state.contents[right.key] : !operations.some(op => op.kind === "remove-content" && op.key === right.key)) return;
  if (put.length !== (splitting ? 3 : 2)) return;
  const existing = put.filter(record => record.key !== right.key);
  const parent = existing.find(record => {
    const previous = state.contents[record.key];
    return previous && same(parentStructure(previous), parentStructure(record)) && !same(previous.children, record.children);
  });
  const left = existing.find(record => record.key !== parent?.key);
  if (!parent || !left || left.inlineKind !== "standoff") return;
  const previousLeft = state.contents[left.key];
  if (!previousLeft || !same(inlineStructure(previousLeft), inlineStructure(left))) return;
  const previousParent = state.contents[parent.key];
  const expandedChildren = splitting ? parent.children : previousParent.children;
  const compactChildren = splitting ? previousParent.children : parent.children;
  const position = expandedChildren.indexOf(placement.key);
  if (position <= 0 || expandedChildren.lastIndexOf(placement.key) !== position ||
    state.placements[expandedChildren[position - 1]]?.contentKey !== left.key ||
    !same(expandedChildren.filter(key => key !== placement.key), compactChildren)) return;
  const combined = splitting ? previousLeft.inlineContent : left.inlineContent;
  const prefix = splitting ? left.inlineContent : previousLeft.inlineContent;
  if (!prefix.length || !right.inlineContent.length ||
    !same(combined, [...prefix, ...right.inlineContent]) || new Set(combined).size !== combined.length) return;
  for (const key of combined) {
    const cell = state.placements[key];
    if (!cell || !isTextLeaf(state.contents[cell.contentKey])) return;
  }
  return { parent: parent.key, left: left.key, right: right.key };
}
