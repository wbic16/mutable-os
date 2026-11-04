import { documentApplicationPorts } from "./document-application-ports";
import { createSpatialActions, supportsSpatial } from "./spatial-actions";
import type { ReactiveEditorConfiguration } from "../configuration";
import type { ContentKey, PlacementKey } from "../block-tree/types";
import { ReactiveEditor } from "../reactive-editor/editor";
import type { LoadedWorkspace } from "../reactive-editor/workspace-manifest";
import { WorkspacePresentationState, type WorkspaceObject, type PresentationName } from "../reactive-editor/workspace-presentation";
import { registerApplicationViews } from "./features";
import { batch, createSignal } from "solid-js";
import { deriveDesktop } from "./desktop-derivation";
import { deriveCanvas } from "./canvas-derivation";
import { registerWorkspaceEntities } from "./workspace-entities";
import { WorkspaceWindowManager } from "./window-manager";
import { DocumentDetachment } from "./document-detachment";
import { DocumentSessionStore } from "./document-sessions";

export interface WorkspaceObjectResolution {
  object: WorkspaceObject;
  status: "resolved" | "missing" | "ambiguous" | "replaced";
  contentKey?: ContentKey;
  placementKeys: PlacementKey[];
}

/** Application-owned canonical workspace lifetime. No presentation registry or
 * alternate content store. The split demo remains a separate, explicit host. */
export class WorkspaceSession {
  readonly editor: ReactiveEditor;
  readonly projection;
  readonly presentation: WorkspacePresentationState;
  readonly windowManager?: WorkspaceWindowManager;
  readonly documentSessions?: DocumentSessionStore;
  readonly spatial?: ReturnType<typeof createSpatialActions>;
  private readonly pins = new Map<string, ContentKey>();
  private disposed = false;
  private readonly noticeSignal = createSignal("");
  readonly notice = this.noticeSignal[0];
  private readonly resolutionSignal = createSignal(0);
  private readonly cleanup: Array<() => void> = [];
  private composing = false;
  private pending?: { name: PresentationName; deriveDesktop: boolean };
  private pendingHostedCompletion?: () => void;
  private compositionCompletion?: ReturnType<typeof setTimeout>;
  private readonly closedMedia = createSignal<ReadonlySet<string>>(new Set());
  setCanvasMediaClosed(id: string, closed: boolean) {
    this.closedMedia[1](previous => { const next = new Set(previous); if (closed) next.add(id); else next.delete(id); return next; });
  }

  private interaction?: { cancel(): void; finish(): void };

  constructor(loaded: LoadedWorkspace, configuration: ReactiveEditorConfiguration = {}) {
    const root = loaded.state.contents[loaded.state.placements[loaded.state.rootPlacementKey].contentKey];
    if (root.viewType !== "workspace-block") throw new Error("A workspace session requires a workspace-block root.");
    this.editor = new ReactiveEditor(loaded, configuration);
    if (this.editor.features.mutableWindowManager) this.editor.windowManager = this.windowManager = new WorkspaceWindowManager(this.editor);
    if (this.windowManager && this.editor.features.retainedDocumentSessions)
      this.editor.documentSessions = this.documentSessions = new DocumentSessionStore(this.editor);
    if(this.documentSessions && this.editor.features.documentSessionHostTransfer && this.editor.features.documentDetachment) this.documentSessions.detachment=new DocumentDetachment(this.documentSessions,this.editor);
    this.presentation = new WorkspacePresentationState(root.payload, { textual: this.editor.features.textualWorkspace, canvas: this.editor.features.canvasWorkspace, spatial: this.editor.features.spatialWorkspace ? { supports: supportsSpatial } : undefined });
    this.editor.persistence.attachWorkspacePresentation({ capture: () => { this.interaction?.finish(); return this.presentation.capture(); }, markSaved: snapshot => this.presentation.markSaved(snapshot) });
    registerApplicationViews(this.editor);
    this.projection = this.editor.createView("loaded-workspace");
    this.cleanup.push(registerWorkspaceEntities(this.editor, this.projection.viewId));
    this.resolveObjects();
    if (this.editor.features.spatialWorkspace) { this.spatial = createSpatialActions(this); this.cleanup.push(this.spatial.dispose); }
    if (this.presentation.enabled) {
      this.cleanup.push(this.editor.commandRegistry.register({ id: "workspace.presentation.createDesktop", label: "Create Desktop from Canvas", canExecute: () => this.canCreateDesktop(), execute: () => { this.createDesktop(); } }, "workspace-session"));
      for (const name of (["desktop", "canvas", "spatial", "textual"] as const).filter(name => this.presentation.available(name))) this.cleanup.push(this.editor.commandRegistry.register({
        id: `workspace.presentation.${name}`, label: name === "desktop" ? "Desktop" : name === "canvas" ? "Canvas" : name === "textual" ? "Textual" : "Spatial",
        canExecute: () => this.presentation.editable(), execute: () => { this.selectPresentation(name); },
      }, "workspace-session"));
      this.cleanup.push(this.editor.repository.subscribeChanges(change => {
        if (change.inlineOwner) return;
        // Structural/identity changes invalidate root resolution. Plain typing,
        // annotations and Window geometry do not enumerate the workspace.
        for (const [key, before] of change.previousContents) {
          const after = this.editor.repository.state.contents[key];
          const identity = (c: typeof before) => c && JSON.stringify([c.viewType, c.payload.id, (c.payload.metadata as any)?.documentId, c.children, c.ownedRelations]);
          if (identity(before) !== identity(after)) { this.resolutionSignal[1](n => n + 1); break; }
        }
      }));
    }
  }

  /** Observe composition completion only; ordinary input never dispatches here. */
  installPresentationInput(window: Window): () => void {
    if (!this.presentation.enabled) return () => {};
    const start = (event: Event) => {
      const target = event.target;
      if (this.editor.mounts.resolveEvent(event) || (target instanceof Element && target.matches("[data-cross-text-input]") && this.editor.crossText.range())) this.composing = true;
    };
    const end = () => {
      if (!this.composing) return;
      this.composing = false;
      // Browser microtask checkpoints can occur between Window and Document
      // listeners. Wait for core's compositionend reconciliation and final input.
      clearTimeout(this.compositionCompletion);
      this.compositionCompletion = setTimeout(() => {
        this.compositionCompletion = undefined;
        const pending = this.pending; this.pending = undefined;
        const hosted = this.pendingHostedCompletion; this.pendingHostedCompletion = undefined;
        if (!this.disposed) { if (pending) this.changePresentation(pending.name, pending.deriveDesktop); else hosted?.(); }
      }, 0);
    };
    window.addEventListener("compositionstart", start, true);
    window.addEventListener("compositionend", end, true);
    const stop = () => { window.removeEventListener("compositionstart", start, true); window.removeEventListener("compositionend", end, true); clearTimeout(this.compositionCompletion); this.pending = undefined; this.pendingHostedCompletion = undefined; this.composing = false; };
    this.cleanup.push(stop); return stop;
  }

  /** Explicit hosted-document return shares the established composition checkpoint.
   * This is never an ordinary typing dispatch path. Last explicit request wins. */
  deferHostedCompletion(action: () => void): boolean {
    if (!this.composing && !Object.keys(this.projection.state.nodes).some(key => this.editor.mounts.get(key)?.composing)) return false;
    this.pending = undefined; this.pendingHostedCompletion = action; return true;
  }

  canCreateDesktop() {
    const value = this.presentation.read();
    return this.presentation.editable() && !!value?.presentations.canvas && value.presentations.desktop === undefined;
  }
  createDesktop(): boolean { return this.changePresentation("desktop", true); }
  selectPresentation(name: PresentationName): boolean { return this.changePresentation(name, false); }

  private changePresentation(name: PresentationName, createDesktop: boolean): boolean {
    if (!this.presentation.editable() || !this.presentation.available(name)) return false;
    if (name !== "desktop" && this.documentSessions?.transfers.hasExperimentalHosts()) {
      this.noticeSignal[1]("Return experimental Document sessions to their original hosts before switching workspace presentations."); return false;
    }
    if (createDesktop && !this.canCreateDesktop()) return false;
    if (name === "desktop" && this.canCreateDesktop() && !createDesktop) {
      this.noticeSignal[1]("Desktop has not been created. Choose Create Desktop from Canvas in Presentations."); return false;
    }
    const editor = this.editor;
    if (this.composing || Object.keys(this.projection.state.nodes).some(key => editor.mounts.get(key)?.composing)) {
      this.pendingHostedCompletion = undefined; this.pending = { name, deriveDesktop: createDesktop }; this.noticeSignal[1]("Presentation will switch after composition finishes."); return false;
    }
    if (editor.overlays.overlays.length || editor.stickyNotes.state.drafts.length ||
        (typeof document !== "undefined" && document.querySelector('[role="dialog"]')) ||
        Object.values(this.projection.state.nodes).some(node => editor.mounts.get(node.key) &&
          !editor.registry.hasCapability(node.viewType, "spatial-document-compatible") && node.viewType !== "youtube-video-block" &&
          (editor.mounts.get(node.key)?.inputPolicy === "opaque-widget" || editor.registry.hasCapability(node.viewType, "opaque-widget")))) {
      this.noticeSignal[1]("Finish or close the open panel, draft or embedded application before switching presentations."); return false;
    }
    const key = editor.focus.state.focusedKey ?? editor.focus.state.lastFocusedKey;
    const focusedPlacement = key ? editor.node(key)?.placementKey : undefined;
    const focusAncestors = new Set(key ? editor.blockQueries.ancestors(key).map(n => n.placementKey) : []);
    const mount = key ? editor.mounts.get(key) : undefined;
    const logical = key ? editor.selections.sets[key] : undefined;
    const primary = logical?.items.find(item => item.id === logical.primaryId);
    const native = mount?.captureSelection?.(), inline = mount?.captureInlineSelection?.() ??
      (primary ? { anchor: primary.anchor.boundary.index, head: primary.head.boundary.index } : undefined);
    try {
      this.interaction?.cancel();
      const candidate = createDesktop ? deriveDesktop(editor.repository.snapshot(), this.presentation.read()!, this.resolveObjects(),
        typeof window === "undefined" ? undefined : { width: window.innerWidth, height: window.innerHeight }) : undefined;
      const retainedPresentation = name === "textual" || this.presentation.active() === "textual";
      if(retainedPresentation)for(const port of documentApplicationPorts(editor).ports()){const session=port.session();if(session){this.documentSessions?.presentations.check(session);this.documentSessions?.presentations.remember(session);}}
      batch(() => {
        if (name === "textual" && this.presentation.read()?.presentations.textual === undefined) this.presentation.initializeTextual();
        if (name === "spatial" && this.presentation.read()?.presentations.spatial === undefined) this.spatial?.create();
        if (name === "canvas" && !this.presentation.read()?.presentations.canvas) {
          const candidate = deriveCanvas(editor.repository.snapshot(), this.presentation.read());
          // Validation precedes both writes. No document content is reconstructed.
          if (candidate.identities.length) editor.repository.commit("Identify workspace objects", candidate.identities.map(record => ({ kind: "put-content", record })));
          this.presentation.initializeCanvas(candidate.objects, candidate.canvas);
        }
        if (candidate) {
          // All identity/layout validation precedes the single structural commit.
          // TreeCommands buffers wrapper insertion and moves; a failure publishes neither.
          editor.commands.transaction("Create Desktop from Canvas", () => {
            for (const entry of candidate.entries) {
              if (entry.wrapper) {
                const wrapper = editor.commands.insert(entry.wrapper, { kind: "at", parentKey: entry.destination, index: editor.commands.childrenOf(entry.destination).length });
                editor.commands.move(entry.placementKey, { kind: "at", parentKey: wrapper, index: 0 });
              } else {
                editor.commands.setPayloadField(entry.placementKey, "metadata", entry.metadata);
                if (entry.move) editor.commands.move(entry.placementKey, { kind: "at", parentKey: entry.destination, index: editor.commands.childrenOf(entry.destination).length });
              }
            }
          });
          this.presentation.initializeDesktop(candidate.objects);
        }
        editor.selectionGestures.cancelGesture();
        if(!retainedPresentation)editor.crossText.clear();
        this.presentation.select(name);
        this.noticeSignal[1](candidate ? `Desktop created with ${candidate.entries.length} object(s).${candidate.skipped.length ? " Retained without a Desktop conversion: " + candidate.skipped.map(item => `${item.label} (${item.reason})`).join("; ") + "." : ""}` : "");
      });
      queueMicrotask(() => {
        if (this.disposed || name === "textual") return;
        if(retainedPresentation)for(const port of documentApplicationPorts(editor).ports()){const session=port.session();if(session)this.documentSessions?.presentations.restorePosition(session);}
        if(!key)return;
        // Existing occurrences (including minimized ones) keep their bookmark.
        // A reparented occurrence has a new route: match its retained ancestor
        // placements so a shared Document does not steal focus into another Window.
        const matches = candidate && !this.projection.state.nodes[key] && focusedPlacement
          ? Object.values(this.projection.state.nodes).filter(n => n.placementKey === focusedPlacement)
            .map(n => ({ key: n.key, score: editor.blockQueries.ancestors(n.key).filter(a => focusAncestors.has(a.placementKey)).length }))
            .sort((a, b) => b.score - a.score) : [];
        const target = matches.length && (matches.length === 1 || matches[0].score > matches[1].score) ? matches[0].key : key;
        const owner=this.windowManager?.ownerForNode(target);
        if(owner&&!this.windowManager!.registry.windows[owner]?.visible) {
          editor.focus.request(owner,{reason:"presentation-switch-retained-hidden-target"});return;
        }
        if (!editor.mounts.get(target)) {
          const visible = editor.blockQueries.ancestors(target).find(node => editor.mounts.get(node.key));
          if (visible) editor.focus.request(visible.key, { reason: "presentation-switch-hidden-target" });
          return;
        }
        editor.focus.request(target, { reason: "presentation-switch", caret: native });
        if (inline) editor.mounts.get(target)?.restoreInlineSelection?.(inline);
      });
      return true;
    } catch (error) { this.noticeSignal[1](error instanceof Error ? error.message : String(error)); return false; }
  }

  ownPresentationInteraction(interaction: { cancel(): void; finish(): void }): () => void {
    if (this.interaction) throw new Error("A presentation already owns an interaction lifetime.");
    this.interaction = interaction;
    return () => { interaction.cancel(); if (this.interaction === interaction) this.interaction = undefined; };
  }

  inputAvailable() {
    return !this.disposed && !this.composing && !this.editor.overlays.overlays.length && !this.editor.stickyNotes.state.drafts.length && !document.querySelector('[role="dialog"]');
  }

  /** Resolve roots before mounting. Ambiguous occurrences and overlapping
   * ancestor/descendant roots retain placeholders instead of duplicate mounts. */
  canvasRoots() {
    this.resolutionSignal[0]();
    const resolutions = new Map(this.resolveObjects().map(item => [item.object.id, item]));
    const placed = [...(this.presentation.read()?.presentations.canvas?.placements ?? [])].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const mounted = new Set<string>();
    return placed.map(placement => {
      const resolved = resolutions.get(placement.objectId);
      let reason: string | undefined = !resolved || resolved.status !== "resolved" ? resolved?.status ?? "missing" : undefined;
      const node = resolved?.placementKeys.length === 1 ? this.projection.nodeForPlacement(resolved.placementKeys[0]) : undefined;
      if (!reason && !node) reason = "ambiguous occurrence";
      if (node && !["document-window-block", "window-block", "image-block", "youtube-video-block", "canvas-counter-block", "iframe-block", "pdf-block", "html-block", "html-editor-block"].includes(node.viewType)) reason ??= "unsupported in this presentation";
      if (node && (node.payload.metadata as any)?.stickyNote) reason ??= "Portal window is not supported";
      const descendants = new Set<string>();
      const visit = (key: string) => {
        if (descendants.has(key)) return; descendants.add(key);
        const child = this.projection.state.nodes[key];
        if (child) [...child.children, ...Object.values(child.ownedRelations)].forEach(visit);
      };
      if (node) visit(node.key);
      const embedded = !!node && ["iframe-block", "pdf-block", "html-block", "html-editor-block"].includes(node.viewType);
      if (embedded && this.closedMedia[0]().has(placement.id)) reason ??= "embedded media closed";
      if (!reason && [...descendants].some(key => !(embedded && key === node?.key) && !["canvas-counter-block", "youtube-video-block"].includes(this.projection.state.nodes[key]?.viewType) && this.editor.registry.hasCapability(this.projection.state.nodes[key]?.viewType ?? "", "opaque-widget") && !this.editor.registry.hasCapability(this.projection.state.nodes[key]?.viewType ?? "", "spatial-document-compatible"))) reason = "embedded application awaits qualification";
      if (!reason && [...descendants].some(key => mounted.has(key))) reason = "overlapping render root";
      if (!reason) descendants.forEach(key => mounted.add(key));
      return { placement, label: resolved?.object.label ?? placement.objectId, nodeKey: reason ? undefined : node?.key, reason, embedded };
    });
  }

  dirty() {
    return !!this.documentSessions?.transfers.hasTransferredSessions() || !!this.windowManager?.named.dirty() || !!this.windowManager?.layout.dirty() || !!this.editor.persistence.state.unsavedWorkspaceContent || this.editor.viewVisibility.dirty() || this.presentation.dirty() || this.editor.repository.state.revision !== (this.editor.persistence.state.lastSavedRevision ?? 0);
  }

  /** Resolve on demand, not on every keystroke. Runtime keys never enter the
   * persisted directory; document internals are not workspace Block anchors. */
  resolveObjects(): WorkspaceObjectResolution[] {
    this.resolutionSignal[0]();
    if (this.disposed) throw new Error("Workspace session is disposed.");
    const objects = this.presentation.read()?.objects ?? [];
    if (!objects.length) return [];
    const state = this.editor.repository.state;
    const blocks = new Map<string, PlacementKey[]>(), documents = new Map<string, PlacementKey[]>();
    const visited = new Set<PlacementKey>();
    const add = (index: Map<string, PlacementKey[]>, id: unknown, key: PlacementKey) => {
      if (typeof id === "string" && id.trim()) index.set(id, [...(index.get(id) ?? []), key]);
    };
    const walk = (key: PlacementKey) => {
      if (visited.has(key)) return;
      visited.add(key);
      const content = state.contents[state.placements[key]?.contentKey];
      if (!content) return;
      if (content.viewType === "document-block") {
        const metadata = content.payload.metadata as Record<string, unknown> | undefined;
        add(documents, metadata?.documentId ?? content.payload.id, key);
        return;
      }
      if (content.viewType !== "document-reference-block") add(blocks, content.payload.id, key);
      content.children.forEach(walk);
      Object.values(content.ownedRelations).forEach(walk);
    };
    walk(state.rootPlacementKey);
    return objects.map(object => {
      const placementKeys = (object.target.kind === "document" ? documents.get(object.target.documentId) : blocks.get(object.target.blockId)) ?? [];
      const contents = new Set(placementKeys.map(key => state.placements[key].contentKey));
      if (!contents.size) return { object, status: "missing", placementKeys: [] };
      if (contents.size > 1 || (object.target.kind === "block" && placementKeys.length > 1)) return { object, status: "ambiguous", placementKeys: [] };
      const contentKey = [...contents][0], pinned = this.pins.get(object.id);
      if (pinned && pinned !== contentKey) return { object, status: "replaced", placementKeys: [] };
      this.pins.set(object.id, contentKey);
      return { object, status: "resolved", contentKey, placementKeys };
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.interaction?.cancel(); this.interaction = undefined;
    this.pending = undefined; this.pendingHostedCompletion = undefined;
    this.cleanup.splice(0).reverse().forEach(stop => stop());
    this.documentSessions?.dispose(); this.editor.documentSessions = undefined;
    this.windowManager?.dispose(); this.editor.windowManager = undefined;
    this.presentation.dispose(); this.pins.clear(); this.editor.dispose();
  }
}
