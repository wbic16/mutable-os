import type { Component } from "solid-js";
import type { ExternalTarget } from "./external-reference";

export type NodeKey = string;
export type ContentKey = string;
export type PlacementKey = string;
export type ViewId = string;
export type BlockId = string;
export type CommitId = string;

export type JsonObject = Record<string, unknown>;

export interface ExistingBlockDto extends JsonObject {
  id?: string;
  type?: string;
  /** Optional authored semantic identity; implementation remains in type. */
  mode?: string;
  children?: ExistingBlockDto[] | null;
  relation?: Record<string, unknown> | null;
}

export type WireCollectionState = "omitted" | "null" | "present";

export interface ContentRecord {
  key: ContentKey;
  /** Private canonical membership in a Document definition table. Independent
   * of placements; portable files express this by definition-table membership. */
  definitionOwnerKey?: ContentKey;
  viewType: string;
  payload: JsonObject;
  children: PlacementKey[];
  inlineContent: PlacementKey[];
  inlineRevision: number;
  inlineKind?: "standoff";
  compactInline?: import("./inline-sequence").CompactInline;
  ownedRelations: Record<string, PlacementKey>;
  opaqueRelations: Record<string, unknown>;
  wireChildren: WireCollectionState;
  wireRelation: WireCollectionState;
  revision: number;
}

export interface PlacementRecord {
  key: PlacementKey;
  /** Persistent authored identity in normalized Documents; absent for Cells. */
  placementId?: string;
  contentKey: ContentKey;
  kind: "owned" | "reference" | "inline";
  /** Private object-bank retention of a native Document root. This reference
   * is not semantic resource ownership and is not a presentation occurrence. */
  resourceRegistration?: true;
  /** G1 candidate: explicit boundary. contentKey is a private unresolved symbol,
   * not a required local ContentRecord. Never synthesize a target Block. */
  externalReference?: ExternalTarget;
  /** Same external-target semantics with a currently loaded live binding.
   * contentKey is runtime-only; native capture writes the target descriptor.
   * Mutually exclusive with the terminal/unresolved externalReference. */
  resolvedReference?: ExternalTarget;
}

export interface RepositoryState {
  rootPlacementKey: PlacementKey;
  contents: Record<ContentKey, ContentRecord>;
  placements: Record<PlacementKey, PlacementRecord>;
  revision: number;
}

export type Slot =
  | { kind: "children" }
  | { kind: "inline-content" }
  | { kind: "relation"; name: string };

export interface Location {
  ownerContentKey: ContentKey;
  slot: Slot;
  index?: number;
}

export interface BlockNode {
  key: NodeKey;
  contentKey: ContentKey;
  placementKey: PlacementKey;
  viewId: ViewId;
  /** Derived editing atom; contentKey/placementKey identify its host, not a canonical Cell. */
  editingInlineOwner?: NodeKey;
  viewType: string;
  payload: JsonObject;
  children: NodeKey[];
  inlineContent: NodeKey[];
  ownedRelations: Record<string, NodeKey>;
}

export interface BlockTreeState {
  rootKey: NodeKey;
  nodes: Record<NodeKey, BlockNode>;
  revision: number;
}

export type Destination =
  | { kind: "at"; parentKey: NodeKey | PlacementKey; index: number }
  | { kind: "before"; anchorKey: NodeKey | PlacementKey }
  | { kind: "after"; anchorKey: NodeKey | PlacementKey };

/** One atomic structural edit; null removes a record. Never used for typing. */
export interface RecordBatch {
  kind: "record-batch";
  contents: Record<ContentKey, ContentRecord | null>;
  placements: Record<PlacementKey, PlacementRecord | null>;
}

export type RepositoryOperation =
  | RecordBatch
  | { kind: "put-content"; record: ContentRecord; inlineSplice?: import("./inline-sequence").InlineSplice; /** Runtime continuity hint: next property index -> previous index; never document data. */ annotationOrigins?: (number | null)[] }
  | { kind: "remove-content"; key: ContentKey }
  | { kind: "put-placement"; record: PlacementRecord }
  | { kind: "remove-placement"; key: PlacementKey }
  | { kind: "set-root"; key: PlacementKey };

export interface HistoryEntry {
  commitId: CommitId;
  label: string;
  forward: RepositoryOperation[];
  inverse: RepositoryOperation[];
}

export interface BlockViewProps {
  nodeKey: NodeKey;
}

export interface BlockTypeRegistration {
  type: string;
  view: Component<BlockViewProps>;
  /** Optional authored defaults, independent of mounted application state. */
  create?: () => ExistingBlockDto;
  capabilities: string[];
  aliases?: string[];
  slots?: SlotSpec[];
}

export interface ExportContext {
  kind: "document" | "workspace";
  allowLossyInline?: boolean;
  losses?: string[];
  focusBookmarks?: Record<ContentKey, { blockId: string; caret?: number }>;
}

export interface InlineImageDescriptor {
  assetId: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
  status?: "pending" | "ready" | "failed";
}

export interface InlineBoundary {
  index: number;
  affinity: "before" | "after";
}

export interface ViewPosition {
  contentKey: ContentKey;
  occurrenceKey: NodeKey;
  boundary: InlineBoundary;
}

export interface TextSelectionItem {
  id: string;
  kind: "text";
  anchor: ViewPosition;
  head: ViewPosition;
  preferredInlineCoordinate?: number;
}

export interface SelectionSet {
  viewId: ViewId;
  primaryId: string;
  items: TextSelectionItem[];
  revision: number;
}

export interface BlockSelection {
  kind: "blocks";
  viewId: ViewId;
  keys: NodeKey[];
  primaryKey: NodeKey;
}

export interface GridSelection {
  kind: "grid";
  viewId: ViewId;
  gridKey: NodeKey;
  anchor: { row: number; column: number };
  head: { row: number; column: number };
}

export type EditorSelection =
  | { kind: "text-set"; value: SelectionSet }
  | BlockSelection
  | GridSelection;

export interface PositionMap {
  map(index: number, affinity: "before" | "after"): number;
}

export interface BlockTypeDescriptor {
  type: string;
  capabilities: string[];
}

export interface InsertRequest {
  source: BlockTypeDescriptor;
  targetKey: NodeKey;
  preferredSlot?: string;
}

export interface InsertPlan {
  accepted: boolean;
  slot?: string;
  destination?: Destination;
  wrapperType?: string;
  reason?: string;
}

export interface SlotSpec {
  name: string;
  cardinality: "one" | "many";
  role: "content" | "inline" | "attachment" | "background" | "session";
  accepts: (type: BlockTypeDescriptor) => boolean;
  persistence: "children" | `relation:${string}` | "extended" | "session";
}

export interface CommandContext<TArgs = unknown> {
  targetKey: NodeKey;
  args: TArgs;
}

export interface CommandDefinition<TArgs = unknown> {
  id: string;
  label: string;
  canExecute(context: CommandContext<TArgs>): boolean;
  execute(context: CommandContext<TArgs>): void | Promise<void>;
}

/** An unmounted compact object has a logical address, never a Cell Placement. */
export interface CompactInlineAddress {kind:'compact-inline';ownerPlacementKey:PlacementKey;index:number;inlineRevision:number}
