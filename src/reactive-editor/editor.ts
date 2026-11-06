import { MarkdownInput } from '../runtime/markdown-input';
import { GlossRelationshipController } from "../features/gloss/relationship-controller";
import { GlossController } from "../features/gloss/controller";
import { InitialisController } from '../features/initialis/controller';
import { TabOperations } from '../runtime/tab-commands';
import { enterTask, toggleTask } from '../runtime/tasks';
import { upgradeLegacySurfaces } from '../interchange/legacy-surfaces';
import { BlockSurfaces } from '../runtime/block-surfaces';
import { TableOperations } from '../runtime/tables';
import { sourceTextTypes } from '../knowledge/policy';
import { ManagedAssets, type AssetContext } from '../runtime/managed-assets';
import { DocumentInterchange } from '../runtime/document-interchange';
import { installInterchangeStatus } from '../rendering/interchange-status';
import { PointerSpotlight } from '../runtime/pointer-spotlight';
import { MutableClipboard } from '../runtime/mutable-clipboard';
import { installClipboardStatus } from '../rendering/clipboard-status';
import { registerPointerSpotlight } from '../rendering/pointer-spotlight';
import { registerReadingSpotlight } from '../rendering/reading-spotlight';
import { CaretModes } from '../runtime/caret-modes';
import { registerFocusFade } from '../rendering/focus-fade';
import { AnnotationIdentities } from "../runtime/annotation-identities";
import { VisualEffectRegistry } from "../runtime/visual-effect-registry";
import { registerVisualEffectRenderers } from "../rendering/visual-effect-renderers";
import { ViewVisibility } from './view-visibility';
import { assertLegacySaveAllowed } from "../persistence/native-bindings";
import { WindowPresentation } from "../runtime/window-presentation";
import { BlockPresentation } from "../runtime/block-presentation";
import { PanelContributions } from "../runtime/panel-contributions";
import { AnnotationContributions } from "../runtime/annotation-contributions";
import { EffectContributions } from "../runtime/effect-contributions";
import { captureTextSelection } from "../runtime/selection-snapshot";
import { TextRanges } from "../runtime/text-ranges";
import { RangeAnnotations } from "../runtime/range-annotations";
import { BlockQueries } from "../runtime/block-queries";
import { CurrentTextOperations } from "../runtime/current-text-operation";
import { SelectionGestures } from "../input/selection-gestures";
import { selectionInputTarget } from "../input/selection-target";
import { unwrap } from "solid-js/store";
import { FeatureHost, FeatureActions } from "../runtime/features";
import type { WorkspaceWindowManager } from "../application/window-manager";
import { decodeBlockTree, encodeDocument, encodeWorkspace } from "../block-tree/codecs";
import { TreeCommands } from "../block-tree/commands";
import { createViewId } from "../block-tree/ids";
import { OccurrenceIndex } from "../block-tree/occurrences";
import { BlockTreeProjection } from "../block-tree/projection";
import { BlockRegistry, CommandRegistry } from "../block-tree/registry";
import { CanonicalRepository } from "../block-tree/repository";
import type { ExistingBlockDto, NodeKey, PlacementKey, ViewId } from "../block-tree/types";
import { InputGateway } from "../input/gateway";
import { FocusService } from "../runtime/focus";
import { MountRegistry } from "../runtime/mounts";
import { AnnotationRangeEvents } from "../runtime/annotation-range-events";
import { SelectionService } from "../runtime/selections";
import { PersistenceService } from "./persistence";
import { MultiSelectionEditor } from "../input/multi-selection-editor";
import { OverlayService } from "../runtime/overlays";
import { ModelEventBus } from "../runtime/model-events";
import { MeasurementService } from "../runtime/measurements";
import { BindingRegistry } from "../input/bindings";
import { registerInputActions } from "../input/binding-catalog";
import { createTextTab } from "../runtime/text-tabs";
import { changeTextList, convertTypedListPrefix, exitEmptyListItem, continueTaskPrefix, cancelTaskPrefix, checkTaskPrefixSelection } from '../runtime/text-lists';
import { BlockSelectionService } from "../runtime/block-selection";
import { BlockClipboardService } from "../runtime/block-clipboard";
import { CrossBlockSelection } from "../runtime/cross-block-selection";
import { LinkedAnnotations } from "../runtime/linked-annotations";
import { CrossBlockInput } from "../input/cross-block-input";
import { createStore } from "solid-js/store";
import { SessionDecorations } from "../runtime/session-decorations";
import { DocumentFind } from "../runtime/document-find";
import { MinimapService } from "../runtime/minimap";
import { ConcertinaService } from "../runtime/concertina";
import { StickyNoteService } from "../runtime/sticky-notes";
import type { LoadedWorkspace } from "./workspace-manifest";
import { decodeHistoryDocument, isHistoryDocument } from "../history/durable-core";
import { BlockHistorySession } from "../runtime/block-history";
import { resolveFeatureFlags, type FeatureFlags, type ReactiveEditorConfiguration } from "../configuration";
import { ShowHideProjection } from "../runtime/show-hide-projection";

export class ReactiveEditor {
  readonly surfaces = new BlockSurfaces(this);
  readonly tables = new TableOperations(this);
  readonly tabs = new TabOperations(this);
  completionInput?: import("../input/gateway").CompletionInput;
  /** WorkspaceSession owns this runtime-only store; absent in legacy/isolated editors. */
  documentSessions?: import("../application/document-sessions").DocumentSessionStore;
  readonly blockPresentation = new BlockPresentation();
  readonly windowPresentation = new WindowPresentation();
  readonly panels = new PanelContributions();
  readonly annotationUI = new AnnotationContributions();
  readonly effects = new EffectContributions();
  readonly visualEffects = new VisualEffectRegistry();
  readonly annotationIdentities: AnnotationIdentities;
  /** Compatibility name and new API share a single runtime store. */
  get temporaryRanges() { return this.decorations; }
  readonly caretModes: CaretModes;
  readonly pointerSpotlight: PointerSpotlight;
  setCaret = (nodeKey?: string, caret?: number) => {
    if (this.features.annotationRangeEvents) this.annotationEvents.setCaret(nodeKey, caret);
    if (!nodeKey) this.measurements.releaseCaret();
    this.caretModes.setCaret(nodeKey, caret);
  };
  readonly annotationEvents = new AnnotationRangeEvents();
  readonly features: FeatureFlags;
  readonly markdownInput: MarkdownInput;
  /** Injected/owned by WorkspaceSession only; absent in isolated/legacy hosts. */
  windowManager?: WorkspaceWindowManager;
  readonly decorations = new SessionDecorations();
  readonly minimap = new MinimapService();
  readonly find: DocumentFind;
  readonly blockHistory: BlockHistorySession;
  readonly viewChildren: Record<string, string | undefined>;
  readonly setViewChild: (key: string, child?: string) => void;
  private disposeFindInput?: () => void;
  readonly bindings = new BindingRegistry();
  readonly repository: CanonicalRepository;
  readonly occurrences = new OccurrenceIndex();
  readonly commands: TreeCommands;
  readonly registry = new BlockRegistry();
  readonly commandRegistry = new CommandRegistry();
  readonly featureHost = new FeatureHost();
  readonly featureActions = new FeatureActions();
  readonly events = new ModelEventBus();
  readonly mounts = new MountRegistry();
  readonly concertina = new ConcertinaService(this);
  readonly stickyNotes = new StickyNoteService(this);
  readonly measurements = new MeasurementService(this.mounts);
  readonly focus = new FocusService(this.mounts);
  readonly selections = new SelectionService();
  readonly blockSelection = new BlockSelectionService(this);
  readonly blockClipboard = new BlockClipboardService(this);
  private assetContext: () => AssetContext = () => ({});
  readonly assets = new ManagedAssets(() => this.assetContext(), () => this.features.managedAssetClipboard);
  setAssetContext(read: () => AssetContext) { this.assetContext = read; }
  readAssetContext() { return this.assetContext(); }
  readonly interchange = new DocumentInterchange(this);
  readonly clipboard = new MutableClipboard(this);
  readonly crossText = new CrossBlockSelection(this);
  readonly linkedAnnotations = new LinkedAnnotations(this);
  readonly currentTextOperation = new CurrentTextOperations();
  readonly blockQueries = new BlockQueries({ node: key => this.node(key), root: view => this.projections.get(view)?.state.rootKey });
  readonly textRanges: TextRanges;
  readonly rangeAnnotations: RangeAnnotations;
  readonly gloss: GlossController;
  readonly glossRelationships: GlossRelationshipController;
  readonly initialis: InitialisController;
  readonly selectionGestures = new SelectionGestures({
    operations: this.currentTextOperation,
    capture: () => captureTextSelection(document, this.mounts, this.crossText, this.textRanges),
    target: event => selectionInputTarget(event, this.mounts, target => this.crossInput?.ownsInput(target) ? this.crossText.range()?.head.occurrenceKey : undefined),
    point: event => { const cell = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-inline-index]") : null; return cell ? Number(cell.dataset.inlineIndex) : undefined; },
    releasePointer: () => this.crossInput?.releasePointer(),
    focusedKey: () => this.focus.state.focusedKey ?? this.focus.state.lastFocusedKey,
    clearSelection: key => { document.getSelection()?.removeAllRanges(); this.selections.removeOccurrence(key); this.crossText.clear(); },
  });
  readonly showHide = new ShowHideProjection(this);
  readonly overlays = new OverlayService(this.mounts, this.focus);
  readonly persistence: PersistenceService;
  readonly viewVisibility: ViewVisibility;
  readonly multiSelections: MultiSelectionEditor;
  readonly projections = new Map<ViewId, BlockTreeProjection>();
  private gateway?: InputGateway;
  private crossInput?: CrossBlockInput;
  private disposeInterchangeStatus?: () => void;
  private disposeClipboardStatus?: () => void;

  constructor(dto: ExistingBlockDto | LoadedWorkspace, configuration: ReactiveEditorConfiguration = {}) {
    this.features = resolveFeatureFlags(configuration);
    this.markdownInput = new MarkdownInput(this);
    this.commandRegistry.register({ id: 'markdown.toggleInput', label: 'Toggle Markdown Input Transformation', canExecute: () => true, execute: () => this.markdownInput.toggle() });
    registerInputActions(this.bindings);
    const loadedWorkspace = "state" in dto && "references" in dto ? dto as LoadedWorkspace : undefined;
    if ((loadedWorkspace?.localContainer || loadedWorkspace?.manifest?.schemaVersion === 2) && !this.features.mutableWindowManager) throw new Error("Enable the Mutable Window Manager to open a managed Workspace.");
    const decoded = loadedWorkspace ? { state: loadedWorkspace.state } : isHistoryDocument(dto) ? decodeHistoryDocument(dto) : decodeBlockTree(dto as ExistingBlockDto);
    this.repository = new CanonicalRepository(this.features.reversibleBlocks ? upgradeLegacySurfaces(decoded.state) : decoded.state);
    this.annotationIdentities = new AnnotationIdentities(this.repository);
    registerVisualEffectRenderers(this.visualEffects);
    registerFocusFade(this.visualEffects);
    registerReadingSpotlight(this.visualEffects);
    registerPointerSpotlight(this.visualEffects);
    this.caretModes = new CaretModes(this.visualEffects, (key, caret, frame) => {
      const node = this.node(key), content = node && this.repository.readState().contents[node.contentKey];
      if (!node || !content) return;
      const projection = this.projections.get(node.viewId);
      return { nodeKey: key, caret, revision: content.inlineRevision,
        caretRect: () => this.measurements.caretRect(key, caret, frame),
        cells: () => node.inlineContent.map(key => { const cell = projection?.state.nodes[key]; return cell?.viewType === 'image-cell' ? '\uFFFC' : String(cell?.payload.text ?? ''); }) };
    }, this.features.caretModes, this.features.readingSpotlight);
    this.pointerSpotlight = new PointerSpotlight(this.visualEffects, this.features.pointerSpotlight, () => this.caretModes.select('normal'), this.caretModes.active);
    this.viewVisibility = new ViewVisibility(this.repository);
    this.commands = new TreeCommands(this.repository, (key) => this.occurrences.resolve(key));
    this.textRanges = new TextRanges(key => {
      const node = this.node(key), content = node && this.repository.readState().contents[node.contentKey];
      if (!node || !content || !["standoff-editor-block", "plain-text-block", ...sourceTextTypes].includes(node.viewType)) return;
      const cell = node.viewType === "standoff-editor-block";
      return { nodeKey: node.key, contentKey: node.contentKey, placementKey: node.placementKey,
        version: cell ? content.inlineRevision : content.revision,
        length: cell ? node.inlineContent.length : String(node.payload.text ?? "").length, coordinate: cell ? "cell" : "utf16" };
    });
    this.decorations.configureValidation(ranges => this.textRanges.validate(ranges), range => this.visualEffects.validateType({
      type:range.type??'editor/temporary-range',renderers:range.renderers??this.visualEffects.type(range.type)?.renderers??[],
      ...(range.states?{states:range.states}:{}),...(range.stateOrder?{stateOrder:range.stateOrder}:{}),...(range.events?{events:range.events}:{})
    }));
    this.rangeAnnotations = new RangeAnnotations({ ranges: this.textRanges,
      properties: key => unwrap((this.node(key)?.payload.standoffProperties ?? []) as Record<string, unknown>[]),
      write: (key, properties, origins) => this.commands.setPayloadField(key, "standoffProperties", properties, undefined, origins),
      transaction: (label, apply) => this.commands.structuralTransaction(label, apply),
    }, result => this.showHide.annotationApplied(result));
    this.initialis = new InitialisController(this);
    this.gloss = new GlossController(this);
    this.glossRelationships = new GlossRelationshipController(this);
    this.persistence = new PersistenceService(this);
    if (loadedWorkspace) this.persistence.attachWorkspace(loadedWorkspace);
    const [viewChildren, setViewChildren] = createStore<Record<string, string | undefined>>({});
    this.viewChildren = viewChildren;
    this.setViewChild = (key, child) => setViewChildren(key, child);
    this.find = new DocumentFind(this);
    this.blockHistory = new BlockHistorySession(this);
    if (isHistoryDocument(dto)) this.blockHistory.attachIdentity({ resourceId: dto.resourceId, memoirId: dto.memoirId });
    this.multiSelections = new MultiSelectionEditor(
      this.commands,
      this.selections,
      (nodeKey) => this.node(nodeKey),
    );
    this.repository.subscribeBeforeChanges((label) => {
      this.selectionGestures.cancelGesture();
      this.crossText.beforeChange();
      if (this.events.hasSubscribers("beforeChange")) {
        this.events.publish("beforeChange", { label, state: this.repository.snapshot() });
      }
    });
    this.repository.subscribeChanges(({ label, previousContents }) => {
      const caretKey = this.caretModes.focusedNode(), caretNode = caretKey && this.node(caretKey);
      if (caretNode && previousContents.has(caretNode.contentKey)) { this.measurements.releaseCaret(); this.caretModes.invalidate(); }
      if (this.events.hasSubscribers("afterChange")) {
        this.events.publish("afterChange", { label, state: this.repository.snapshot() });
      }
      for (const [contentKey, previous] of previousContents) {
        const content = this.repository.state.contents[contentKey];
        if (
          previous && content &&
          (previous.inlineRevision !== content.inlineRevision ||
            previous.payload.text !== content.payload.text)
        ) {
          this.events.publish("textChanged", {
            label,
            contentKey,
            revision: content.revision,
          });
        }
      }
    });
    this.repository.subscribeChanges(() => {
      queueMicrotask(() => this.overlays.closeMissingOwners((nodeKey) => !!this.node(nodeKey)));
      if (this.blockSelection.state.items.length) queueMicrotask(() => this.blockSelection.prune());
    });
  }

  createView(
    viewId: ViewId = createViewId(),
    rootPlacementKey: PlacementKey = this.repository.state.rootPlacementKey,
  ): BlockTreeProjection {
    if (this.projections.has(viewId)) throw new Error(`View already exists: ${viewId}`);
    const projection = new BlockTreeProjection(
      this.repository,
      viewId,
      this.occurrences,
      rootPlacementKey,
      this.features.reversibleBlocks,
    );
    this.projections.set(viewId, projection);
    return projection;
  }

  /** End a transient view without changing its canonical placements/content. */
  disposeView(projection: BlockTreeProjection): void {
    if (this.projections.get(projection.viewId) !== projection) return;
    this.interchange.closeView(projection.viewId);
    const keys = new Set(projection.occurrenceKeys());
    if (this.find.state.scope && keys.has(this.find.state.scope.rootKey)) this.find.close(false);
    const operation = this.currentTextOperation.active();
    if (operation && [...keys].some(key => operation.owns(key))) operation.cancel();
    const cross = this.crossText.range();
    if (cross && (keys.has(cross.anchor.occurrenceKey) || keys.has(cross.head.occurrenceKey))) this.crossText.clear();
    for (const overlay of [...this.overlays.overlays]) if (keys.has(overlay.ownerKey)) this.overlays.close(overlay.key, false);
    if (this.blockSelection.state.viewId === projection.viewId) this.blockSelection.clear();
    for (const key of Object.keys(this.decorations.nodes)) if(keys.has(key))this.decorations.removeOccurrence(key);
    for (const key of keys) {
      this.focus.clearRemoved(key);
      this.selections.removeOccurrence(key);
      this.mounts.releaseOccurrence(key);
      this.setViewChild(key, undefined);
    }
    projection.dispose();
    this.projections.delete(projection.viewId);
  }

  readonly viewCloseGuards = new Map<NodeKey, (signal?: AbortSignal) => boolean | Promise<boolean>>();

  /** Close a presentation without deleting authored content or adding an Undo step. */
  closeView(key: NodeKey, signal?: AbortSignal): void | Promise<void> {
    if (signal?.aborted) return;
    const runtime = this.windowManager?.runtime.get(key);
    if (runtime) return this.windowManager!.lifecycle.close(key, () => runtime.close());
    if (this.windowManager?.registry.windows[key] && (this.node(key)?.payload.metadata as any)?.stickyNote) return this.stickyNotes.closeWindow(key);
    if (this.windowManager?.registry.windows[key]) return this.windowManager.lifecycle.close(key, () => this.commitCloseView(key));
    const guard = this.viewCloseGuards.get(key)?.(signal);
    if (guard instanceof Promise) return guard.then(ok => { if (ok && !signal?.aborted) this.commitCloseView(key); });
    if (guard !== false && !signal?.aborted) this.commitCloseView(key);
  }

  private commitCloseView(key: NodeKey): void {
    const node = this.node(key);
    if (!node || !['window-block', 'document-window-block', 'tab-block'].includes(node.viewType)) return;
    const inside = (candidate: string | undefined) => {
      if (!candidate) return false;
      const session = this.documentSessions?.forNode(candidate);
      if (session) return session.host.windowId === key;
      return candidate === key || this.windowManager?.ownerForNode(candidate) === key || this.blockQueries.ancestors(candidate).some(n => n.key === key);
    };
    this.selectionGestures.cancelGesture();
    const operation = this.currentTextOperation.active();
    if (operation) {
      const closingWindow = key;
      const owns = (key: string): boolean => { const session = this.documentSessions?.forNode(key); if (session && session.host.windowId !== closingWindow) return false; const node = this.node(key); return operation.owns(key) || !!node && [...node.children,...Object.values(node.ownedRelations)].some(owns); };
      if (owns(key)) operation.cancel();
    }
    if (this.blockSelection.state.items.some(item => inside(item.nodeKey))) this.blockSelection.clear();
    if (inside(this.find.state.scope?.rootKey)) this.find.close(false);
    const cross = this.crossText.range();
    if (cross && (inside(cross.anchor.occurrenceKey) || inside(cross.head.occurrenceKey))) this.crossText.clear();
    for (const overlay of [...this.overlays.overlays]) if (inside(overlay.ownerKey)) this.overlays.close(overlay.key, false, true);
    const focused = this.focus.state.focusedKey;
    if (inside(focused)) this.focus.clearRemoved(focused!);
    this.viewVisibility.set(node.placementKey, true);
  }

  installGateway(document: Document): () => void {
    this.disposeInterchangeStatus?.();
    this.disposeInterchangeStatus = this.features.documentInterchange ? installInterchangeStatus(document, this.interchange) : undefined;
    this.gateway?.dispose();
    this.crossInput?.dispose();
    this.disposeFindInput?.();
    this.disposeClipboardStatus?.();
    if (this.features.mutableClipboard || this.features.documentInterchange) this.disposeClipboardStatus = installClipboardStatus(document, this.clipboard);
    this.disposeFindInput = this.find.install(document);
    const disposeSelectionGestures = this.selectionGestures.install(document);
    this.crossInput = new CrossBlockInput(this, document);
    this.gateway = new InputGateway(
      document,
      this.mounts,
      this.focus,
      this.commands,
      this.multiSelections,
      this.selections,
      this.overlays,
      (nodeKey) => this.node(nodeKey),
      (placementKey, viewId) => this.nodeForPlacementInView(placementKey, viewId),
      (nodeKey, direction) => this.adjacentSibling(nodeKey, direction),
      (nodeKey, direction) => this.adjacentEditable(nodeKey, direction),
      (nodeKey) => this.focusFallback(nodeKey),
      this.bindings,
      key => createTextTab(this, key),
      (key, outdent) => changeTextList(this, key, outdent),
      { prefix: (key, caret) => convertTypedListPrefix(this, key, caret), exitEmpty: key => exitEmptyListItem(this, key), task: (key, start, end, text) => continueTaskPrefix(this, key, start, end, text), cancelTask: () => cancelTaskPrefix(this), taskSelection: (key, caret) => checkTaskPrefixSelection(this, key, caret), taskEnter: (key, start, end) => enterTask(this, key, start, end), toggleTask: key => toggleTask(this, key) },
      this.blockSelection,
      direction => { if (direction === "undo") this.repository.undo(); else this.repository.redo(); },
      (id, targetKey) => {
        const context = { targetKey, args: undefined };
        if (!this.commandRegistry.canExecute(id, context)) return false;
        void this.commandRegistry.execute(id, context);
        return true;
      },
      { setCaret: this.setCaret, setComposing: value => this.caretModes.setComposing(value) },
      this.clipboard,
      () => this.completionInput,
      key => { const target=this.surfaces.wholeBlockKey(key); return this.surfaces.confirmDelete([target])?target:undefined; },
      this.markdownInput,
    );
    const dispose = this.gateway.install();
    const crossInput = this.crossInput;
    const disposeFind = this.disposeFindInput;
    const disposeClipboardStatus = this.disposeClipboardStatus;
    const disposeInterchangeStatus = this.disposeInterchangeStatus;
    return () => { disposeInterchangeStatus?.(); disposeClipboardStatus?.(); disposeFind(); disposeSelectionGestures(); crossInput.dispose(); dispose(); };
  }

  node(nodeKey: NodeKey) {
    for (const projection of this.projections.values()) {
      const node = projection.state.nodes[nodeKey];
      if (node) return node;
    }
    return undefined;
  }

  nodeForPlacementInView(placementKey: PlacementKey, viewId: ViewId) {
    return this.projections.get(viewId)?.nodeForPlacement(placementKey);
  }

  adjacentSibling(nodeKey: NodeKey, direction: -1 | 1) {
    for (const projection of this.projections.values()) {
      if (!projection.state.nodes[nodeKey]) continue;
      for (const parent of Object.values(projection.state.nodes)) {
        const index = parent.children.indexOf(nodeKey);
        if (index >= 0) return projection.state.nodes[parent.children[index + direction]];
      }
    }
    return undefined;
  }

  adjacentEditable(nodeKey: NodeKey, direction: -1 | 1) {
    for (const projection of this.projections.values()) {
      const origin = projection.state.nodes[nodeKey];
      if (!origin) continue;
      const parent = new Map<NodeKey, NodeKey>();
      for (const candidate of Object.values(projection.state.nodes)) {
        candidate.children.forEach((child) => parent.set(child, candidate.key));
        Object.values(candidate.ownedRelations).forEach((child) => parent.set(child, candidate.key));
      }
      let scope = origin;
      let cursor: NodeKey | undefined = origin.key;
      while (cursor) {
        const candidate = projection.state.nodes[cursor];
        if (candidate && ["document-block", "left-margin-block", "right-margin-block"].includes(candidate.viewType)) {
          scope = candidate;
          break;
        }
        cursor = parent.get(cursor);
      }
      const ordered: typeof origin[] = [];
      const visit = (key: NodeKey) => {
        const candidate = projection.state.nodes[key];
        if (!candidate) return;
        const registration = this.registry.resolve(candidate.viewType);
        const mount = this.mounts.get(candidate.key);
        const hidden = mount?.root.closest('[hidden], [aria-hidden="true"]');
        if (
          mount &&
          !hidden &&
          (registration?.capabilities.includes("inline-editor") ||
            registration?.capabilities.includes("native-text"))
        ) {
          ordered.push(candidate);
        }
        candidate.children.forEach(visit);
      };
      visit(scope.key);
      const index = ordered.findIndex((candidate) => candidate.key === nodeKey);
      if (index >= 0) return ordered[index + direction];
    }
    return undefined;
  }

  focusFallback(nodeKey: NodeKey): NodeKey | undefined {
    for (const projection of this.projections.values()) {
      const node = projection.state.nodes[nodeKey];
      if (!node) continue;
      for (const parent of Object.values(projection.state.nodes)) {
        const index = parent.children.indexOf(nodeKey);
        if (index >= 0) {
          if (!this.concertina.state.owner) return parent.children[index + 1] ?? parent.children[index - 1] ?? parent.key;
          const visible = (key: NodeKey) => {
            const root = this.mounts.get(key)?.root;
            return root && !root.closest('[hidden], [aria-hidden="true"]');
          };
          return [parent.children[index + 1], parent.children[index - 1], parent.key].find(key => key && visible(key));
        }
        if (Object.values(parent.ownedRelations).includes(nodeKey)) return parent.key;
      }
    }
    return undefined;
  }

  encodeDocument(): ExistingBlockDto {
    assertLegacySaveAllowed(this.repository);
    return encodeDocument(this.repository.snapshot(), undefined, this.focusBookmarks());
  }

  encodeDocumentAt(rootPlacementKey: PlacementKey): ExistingBlockDto {
    assertLegacySaveAllowed(this.repository);
    return encodeDocument(this.repository.snapshot(), rootPlacementKey, this.focusBookmarks());
  }

  encodeWorkspace(snapshot = this.repository.snapshot()): ExistingBlockDto {
    assertLegacySaveAllowed(this.repository);
    // The caller may supply a read-only repository view; decorate a detached root.
    const rootKey = snapshot.placements[snapshot.rootPlacementKey].contentKey, root = snapshot.contents[rootKey];
    const captured = {...snapshot,contents:{...snapshot.contents,[rootKey]:{...root,payload:{...root.payload}}}};
    this.viewVisibility.captureInto(captured);
    return encodeWorkspace(captured, undefined, this.focusBookmarks());
  }

  private focusBookmarks() {
    const bookmarks: Record<string, { blockId: string; caret?: number }> = {};
    const focusKey = this.node(this.focus.state.focusedKey ?? "")
      ? this.focus.state.focusedKey
      : this.focus.state.lastFocusedKey;
    if (!focusKey) return bookmarks;
    for (const projection of this.projections.values()) {
      const target = projection.state.nodes[focusKey];
      if (!target) continue;
      let current = target;
      while (current && current.viewType !== "document-block") {
        current = Object.values(projection.state.nodes).find(
          (candidate) =>
            candidate.children.includes(current.key) ||
            Object.values(candidate.ownedRelations).includes(current.key),
        )!;
      }
      if (!current || current.viewType !== "document-block") continue;
      const blockId = target.payload.id;
      if (typeof blockId !== "string") continue;
      const selectionSet = this.selections.sets[target.key];
      const primary = selectionSet?.items.find((item) => item.id === selectionSet.primaryId);
      const nativeSelection = this.mounts.selection(target.key);
      const caret = primary?.head.boundary.index ?? nativeSelection?.end;
      bookmarks[current.contentKey] = {
        blockId,
        ...(typeof caret === "number" ? { caret } : {}),
      };
      break;
    }
    return bookmarks;
  }

  dispose(): void {
    this.tables.dispose();
    this.tabs.dispose();
    this.viewCloseGuards.clear();
    this.interchange.dispose(); this.disposeInterchangeStatus?.();
    this.clipboard.dispose(); this.assets.dispose(); this.disposeClipboardStatus?.();
    this.pointerSpotlight.dispose();
    this.caretModes.dispose();
    this.measurements.releaseCaret();
    this.visualEffects.dispose();
    this.gloss.dispose();
    this.glossRelationships.dispose();
    this.initialis.dispose();
    this.annotationIdentities.dispose();
    this.decorations.dispose();
    this.persistence.dispose();
    this.featureHost.dispose();
    this.disposeFindInput?.();
    this.stickyNotes.dispose();
    this.concertina.dispose();
    this.find.dispose();
    this.blockHistory.dispose();
    this.decorations.clearAll();
    this.minimap.clearAll();
    this.crossInput?.dispose();
    this.crossText.clear();
    this.selectionGestures.dispose();
    this.blockClipboard.dismiss();
    this.blockSelection.clear();
    this.bindings.dispose();
    this.gateway?.dispose();
    this.focus.dispose();
    this.annotationEvents.dispose();
    for (const projection of this.projections.values()) projection.dispose();
    this.projections.clear();
  }
}
