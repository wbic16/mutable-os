/** Public first-party feature boundary. No editor, repository or DOM lookup API. */
import type { Component } from "solid-js";
import type { CommandDefinition, ExistingBlockDto, NodeKey, PlacementKey, ViewId } from "../block-tree/types";
import type { BindingAction } from "../input/bindings";
import type { FeatureAction, Disposer } from "../runtime/features";
export type { CodexFeature, FeatureScope, Disposer } from "../runtime/features";
export type { ExistingBlockDto, NodeKey, BlockViewProps } from "../block-tree/types";
export { keyboard, chord } from "../input/bindings";
// Existing editor-independent widget primitive, not a new layout abstraction.
export { createFloatingWindowResize, FloatingWindowResizeHandle } from "../rendering/floating-window-resize";
export { ApplicationSurfacePortal, ApplicationSurfaceBoundary } from "../rendering/window-manager";

export interface BlockSummary {
  readonly key: NodeKey;
  readonly viewId: ViewId;
  readonly type: string;
  readonly children: readonly NodeKey[];
  readonly isRoot: boolean;
}
export interface FeatureBlocks {
  get(key: NodeKey): BlockSummary | undefined;
  insert(dto: ExistingBlockDto, destination: { kind: "at"; parentKey: NodeKey; index: number } | { kind: "after"; anchorKey: NodeKey }): PlacementKey;
  focusPlacement(placement: PlacementKey, view: ViewId): void;
  bounds(key: NodeKey): { left: number; top: number } | undefined;
}
/** One mounted occurrence, not the module or the shared authored content. */
export type { BlockMenuItem } from "../runtime/block-menu-types";
export interface BlockRuntime {
  /** Cumulative client pixels per local CSS unit for this occurrence. */
  scale(): number;
  /** Canonical authored-content protection for this occurrence; no repository access. */
  authoredStateProtected(): boolean;
  openContextMenu(point?: { x: number; y: number }): void;
  contextMenuOpen(): boolean;
  readonly nodeKey: NodeKey;
  /** Detached reactive read of this Block's authored state. */
  field(name: string): unknown;
  setField(name: string, value: unknown, label: string): void;
  removeAndFocusFallback(): void;
  mountWidget(element: HTMLElement, options?: { contextActions(): import("../runtime/block-menu-types").BlockMenuItem[] }): Disposer;
  /** Uses the existing Solid instance owner; nothing here is serialized. */
  own(dispose: Disposer): Disposer;
}
export interface BlockApplicationDefinition {
  type: string;
  aliases?: string[];
  capabilities: string[];
  create(): ExistingBlockDto;
  view: Component<{ runtime: BlockRuntime }>;
}
export interface FeatureRegistrations {
  block(definition: BlockApplicationDefinition): void;
  command(definition: CommandDefinition<void>): void;
  binding(definition: BindingAction): void;
  action(definition: FeatureAction): void;
}
export interface BlockFeatureCapabilities {
  blocks: FeatureBlocks;
  register: FeatureRegistrations;
}

// Stage 2: editor-operation contracts are separate from hosted BlockRuntime.
export type { TextRangeSnapshot, TextRangeSource } from "../runtime/text-ranges";
export type { AnnotationApplication, AnnotationReference, RangeAnnotationPorts, SelectionVisibility } from "../runtime/range-annotations";
export type { CurrentTextOperation } from "../runtime/current-text-operation";
export type { SelectionGesturePolicy } from "../input/selection-gestures";
export type { TextSelectionSnapshot } from "../runtime/selection-snapshot";

export type { TextOperationCapabilities, TextCaret } from "./text-operation";
export type { FeatureToolbarContribution } from "../runtime/features";
export { exactTextRangeKey } from "../runtime/text-ranges";

// Stage 4: passive measured effects and bounded annotation/panel capabilities.
export type { AnnotationCapabilities, AnnotationText } from "./annotations";
export type { AnnotationTarget, AnnotationContribution } from "../runtime/annotation-contributions";
export type { PanelSession, PanelDefinition } from "../runtime/panel-contributions";
export type { EffectDefinition, MeasuredEffect } from "../runtime/effect-contributions";
export type { SearchMatch, SearchMatchSet, SearchRange, SearchScope, ScopeKind } from "../runtime/text-search";
export type { SearchOptions } from "../runtime/search-matching";
export type { SearchRunner } from "../runtime/search-worker";
export type { JsonObject } from "../block-tree/types";
export type { FloatingWindowSize } from "../rendering/floating-window-resize";
export { graphemeBoundaries } from "../input/graphemes";
export { rangesToPositionMarkers } from "../runtime/document-position-markers";

// Stage 5: one optional per-window presentation contribution.
export type { PresentationCapabilities } from "./presentation";
export type { AnchorCapabilities, AnchorRecord } from "./anchors";
export type { WindowPresentationPort, WindowPresentationInstance, WindowPresentationContribution } from "../runtime/window-presentation";
export type { SemanticVaultServices, SemanticRecordType, SemanticCommand, SemanticQuery, CanonicalSemanticRecord } from './semantics';

export type { TemporaryRange, TemporaryRangeCollection } from "../runtime/session-decorations";
export type { VisualRenderer, VisualEffectProps, VisualEffectOwner, EffectParams, RendererBinding, PropertyTypeDefinition, AnnotationHandler, AnnotationHandlerContext } from "../runtime/visual-effect-registry";

export type { CaretModeDefinition } from '../runtime/caret-modes';
export type { FocusRegion, FocusContext, FocusProvider } from '../runtime/focus-region';
