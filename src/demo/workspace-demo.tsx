import { Dynamic } from "solid-js/web";
import { createWindowPresentation } from "../rendering/window-presentation";
import { ErrorBoundary, For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { createWorkspaceDemoEditor, createWorkspaceEditor, demoSourceCounts } from "./workspace-demo-model";
import { workspaceBuilderTypes } from "./workspace-document";
import type { ExistingBlockDto } from "../block-tree/types";
import { PersistenceService, type DocumentLocation } from "../reactive-editor/persistence";
import { DocumentBrowser } from "./document-browser";
import { DocumentDialog } from "./document-dialog";
import { createWorkspaceDocuments, type LocalDocumentFile } from "./workspace-documents";
import { ReactiveEditor as BackgroundEditor } from "../reactive-editor/editor";
import { registerApplicationViews } from "../application/features";
import { WorkspaceSession } from "../application/workspace-session";
import { WorkspacePresentationView } from "../application/workspace-presentation-view";
import { WorkspacePresentations } from "./workspace-presentations";
import "./workspace-demo.css";
import { DocumentStatusBar } from "../rendering/document-status-bar";
import type { Toolset } from "../rendering/compact-toolbar";
import { DocumentStyleBar } from "../rendering/document-style-bar";
import { WindowIcon } from "../rendering/window-icon";
import { WorkspaceBrowser } from "./workspace-browser";
import { materializeLocalWorkspace, type LoadedWorkspace } from "../reactive-editor/workspace-manifest";
import { DocumentMarginContext, type DocumentMarginEntry } from "../rendering/document-margins";
import { DocumentMarginDrawer } from "../rendering/document-margin-drawer";
import { ReactiveViewProvider } from "../reactive-editor/context";
import { createFloatingWindowResize, FloatingWindowResizeHandle } from "../rendering/floating-window-resize";
import { openJsonFile, saveJsonFile, type BrowserFileHandle } from "./browser-json-file";
import { resolveFeatureFlags, type ReactiveEditorConfiguration } from "../configuration";
import { backgroundImages } from "../rendering/backgrounds";
import { CodexSystemBar } from "./codex-system-bar";
import { createWorkspaceOpenControls } from "./workspace-open-controls";
import { documentToPhext, phextFilenameFor, phextToDocument } from "../phext/document";
import { openPhextFile, savePhextFile } from "../phext/file-io";
import { CavernControl, useCurrentCavern } from "../application/cavern-startup";

type DemoWindowState = "normal" | "minimized" | "maximized" | "closed";
interface DemoWindowSnapshot { state: DemoWindowState; position: { x: number; y: number }; size: { w: number; h: number } }
interface DemoEditorBridge {
  editor: ReactiveEditor;
  location: () => DocumentLocation | undefined;
  localFile: () => LocalDocumentFile | undefined;
  filename: () => string;
  window: () => DemoWindowSnapshot;
}
interface WorkspaceActionResult { success: boolean; error?: string; status?: number }
interface LocalWorkspaceFile { filename: string; handle?: BrowserFileHandle }



function DemoSession(props: { configuration: ReactiveEditorConfiguration; onEditor: (bridge: DemoEditorBridge) => () => void; stickyHost: ReactiveEditor; onBackground: (event: MouseEvent) => void; onReset: () => void; onWorkspaceOpen: () => void; onWorkspaceSave: () => void; onLocalWorkspaceOpen: () => void; onLocalWorkspaceSave: () => void; workspaceBusy: boolean; document?: ExistingBlockDto; location?: DocumentLocation; localFile?: LocalDocumentFile; closed?: boolean; window?: Partial<DemoWindowSnapshot>; onClose: (document?: ExistingBlockDto, location?: DocumentLocation, localFile?: LocalDocumentFile) => void; onOpen: (document: ExistingBlockDto, location: DocumentLocation) => void; onOpenLocal: (document: ExistingBlockDto, file: LocalDocumentFile) => void }) {
  const editor = props.document ? createWorkspaceEditor(props.document, props.configuration) : createWorkspaceDemoEditor(props.configuration);
  editor.stickyNotes.setHost(props.stickyHost);
  const projection = editor.createView("workspace-demo");
  const documents = createWorkspaceDocuments(editor, props);
  const glass = () => ((projection.state.nodes[projection.state.rootKey].payload.blockProperties ?? []) as Array<{ type?: string }>).some(property => property.type === "block/theme/glass");
  const headerMenu = (event: MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (!editor.overlays.overlays.some(overlay => overlay.viewType === "context-menu")) editor.overlays.open({ viewType: "context-menu", ownerKey: projection.state.rootKey, anchor: { x: event.clientX, y: event.clientY } });
  };
  const hasDocumentTabs = () => projection.state.nodes[projection.state.rootKey].children.some((key) => projection.state.nodes[key]?.viewType === "document-tab-row-block");
  const title = () => documents.localFile()?.filename ?? documents.location()?.filename ?? "Workspace sample document";
  const [loaded, setLoaded] = createSignal(false);
  const [showJson, setShowJson] = createSignal(false);
  const [debuggingPanelsVisible, setDebuggingPanelsVisible] = createSignal(false);
  const [windowState, setWindowState] = createSignal<DemoWindowState>(props.closed ? "closed" : props.window?.state ?? "normal");
  const [position, setPosition] = createSignal(props.window?.position ?? { x: 0, y: 0 });
  const [windowSize, setWindowSize] = createSignal<{ w: number; h: number } | undefined>(props.window?.size);
  const [marginEntries, setMarginEntries] = createSignal<DocumentMarginEntry[]>([]);
  const [narrowMarginsCollapsed, setNarrowMarginsCollapsed] = createSignal(false);
  const [marginDrawerOpen, setMarginDrawerOpen] = createSignal(false);
  const [toolset, setToolset] = createSignal<Toolset>("Typography");
  const [toolbarNotice, setToolbarNotice] = createSignal("");
  let windowElement!: HTMLElement;
  let drag: { pointerId: number; x: number; y: number; originX: number; originY: number; moved: boolean } | undefined;
  let windowObserver: ResizeObserver | undefined;
  let suppressIconClick = false;
  let suppressTimer: ReturnType<typeof setTimeout> | undefined;
  const marginsCollapsed = () => narrowMarginsCollapsed() || presentation.requested();
  const beginWindowDrag = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (event.ctrlKey || event.button !== 0 || !["normal", "minimized"].includes(windowState()) || (event.target as Element).closest("button") && windowState() !== "minimized") return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position().x, originY: position().y, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveWindow = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.moved ||= Math.abs(event.clientX - drag.x) > 2 || Math.abs(event.clientY - drag.y) > 2;
    const next = { x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y };
    if (windowState() !== "minimized") { setPosition(next); return; }
    const current = position(), rect = windowElement.getBoundingClientRect(), width = 96, height = 92;
    setPosition({
      x: next.x + Math.max(0, 8 - (rect.left + next.x - current.x)) - Math.max(0, rect.left + next.x - current.x + width + 8 - window.innerWidth),
      y: next.y + Math.max(0, 8 - (rect.top + next.y - current.y)) - Math.max(0, rect.top + next.y - current.y + height + 8 - window.innerHeight),
    });
  };
  const finishWindowDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (windowState() === "minimized" && drag.moved) {
      suppressIconClick = true; clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressIconClick = false; suppressTimer = undefined; }, 0);
    }
    drag = undefined;
  };
  const restoreWindow = () => {
    if (suppressIconClick) { suppressIconClick = false; return; }
    setWindowState("normal");
    queueMicrotask(observeWindow);
  };
  const registerMargin = (entry: DocumentMarginEntry) => {
    setMarginEntries(current => current.some(candidate => candidate.ownerKey === entry.ownerKey && candidate.relationKey === entry.relationKey && candidate.name === entry.name) ? current : [...current, entry]);
    return () => setMarginEntries(current => current.filter(candidate => candidate.ownerKey !== entry.ownerKey || candidate.relationKey !== entry.relationKey || candidate.name !== entry.name));
  };
  const marginPresentation = {
    collapsed: marginsCollapsed,
    drawerOpen: marginDrawerOpen,
    entries: marginEntries,
    indicators: () => true,
    open: (entry?: DocumentMarginEntry) => openMargins(entry),
    register: registerMargin,
  };
  const collapseMargins = (activate: () => void) => {
    if (marginsCollapsed()) { activate(); return; }
    const active = document.activeElement as HTMLElement | null;
    const relation = active?.closest<HTMLElement>(".reactive-relation[data-relation-name$='Margin']");
    const focusedKey = relation && windowElement.contains(relation) ? editor.focus.state.focusedKey : undefined;
    const mount = focusedKey ? editor.mounts.get(focusedKey) : undefined;
    const native = mount?.captureSelection?.(), inline = mount?.captureInlineSelection?.();
    activate();
    if (focusedKey) {
      setMarginDrawerOpen(true);
      queueMicrotask(() => {
        editor.focus.request(focusedKey, { reason: "show-collapsed-margin", ...(native ? { caret: native } : {}) });
        if (inline) queueMicrotask(() => editor.mounts.get(focusedKey)?.restoreInlineSelection?.(inline));
      });
    }
  };
  const updateMarginState = (width: number) => {
    if (windowState() === "minimized" || width <= 0) return;
    const collapsed = width <= 730;
    if (collapsed === narrowMarginsCollapsed()) return;
    if (collapsed) collapseMargins(() => setNarrowMarginsCollapsed(true));
    else {
      setNarrowMarginsCollapsed(false);
      if (!presentation.requested()) setMarginDrawerOpen(false);
    }
  };
  const resizeMinimum = () => ({ w: windowElement?.querySelector(".reactive-page--minimap-left, .reactive-page--minimap-right") ? 602 : 560, h: 240 });
  const expandedWindowSize = () => {
    const stored = windowSize(), rect = windowElement?.getBoundingClientRect();
    return { width: stored?.w ?? rect?.width ?? props.window?.size?.w ?? 1200, height: stored?.h ?? rect?.height ?? props.window?.size?.h ?? 760 };
  };
  const presentation = createWindowPresentation(editor.windowPresentation, {
    element: () => windowElement, enabled: () => true,
    expandedSize: expandedWindowSize, minimumWidth: () => resizeMinimum().w,
    marginsCollapsed, automaticCollapsed: narrowMarginsCollapsed,
    collapseWithFocus: collapseMargins, closeDrawer: () => setMarginDrawerOpen(false),
    captureExpandedSize: size => setWindowSize(value => value ?? { w: size.width, h: size.height }),
  });
  const windowResize = createFloatingWindowResize({
    element: () => windowElement,
    size: presentation.presentedSize,
    minimum: () => ({ width: resizeMinimum().w, height: resizeMinimum().h }),
    enabled: () => windowState() === "normal",
    onCommit: next => {
      const expanded = presentation.expandedFromPresented(next);
      setWindowSize({ w: expanded.width, h: expanded.height });
      updateMarginState(next.width);
    },
  });
  const displayWindowSize = () => windowResize.preview() ?? (windowSize() ? presentation.presentedSize() : undefined);
  const openMargins = (entry?: DocumentMarginEntry) => {
    if (!marginsCollapsed()) return;
    setMarginDrawerOpen(true);
    queueMicrotask(() => {
      windowElement.querySelector<HTMLElement>(".reactive-window__margin-drawer")?.focus({ preventScroll: true });
      if (!entry) return;
      const item = [...windowElement.querySelectorAll<HTMLElement>("[data-margin-relation-key]")].find(candidate => candidate.dataset.marginRelationKey === entry.relationKey);
      item?.scrollIntoView?.({ block: "nearest" });
    });
  };
  const toggleMargins = () => {
    if (!marginsCollapsed()) return;
    if (!marginDrawerOpen()) { openMargins(); return; }
    setMarginDrawerOpen(false);
    queueMicrotask(() => windowElement.querySelector<HTMLButtonElement>(".document-style-bar__margins")?.focus({ preventScroll: true }));
  };
  const observeWindow = () => {
    if (!windowElement?.isConnected) return;
    if (typeof ResizeObserver !== "undefined") {
      windowObserver ??= new ResizeObserver(entries => updateMarginState(entries.at(-1)?.contentRect.width ?? windowElement.getBoundingClientRect().width));
      windowObserver.observe(windowElement);
    }
    updateMarginState(windowElement.getBoundingClientRect().width);
  };
  const releaseEditor = props.onEditor({
    editor,
    location: documents.location,
    localFile: documents.localFile,
    filename: title,
    window: () => ({ state: windowState(), position: position(), size: windowSize() ?? (windowElement?.isConnected && windowState() === "normal" ? { w: windowElement.getBoundingClientRect().width, h: windowElement.getBoundingClientRect().height } : props.window?.size ?? { w: 1200, h: 760 }) }),
  });
  for (const [id, serverExecute, localExecute] of [["workspace.open", props.onWorkspaceOpen, props.onLocalWorkspaceOpen], ["workspace.save", props.onWorkspaceSave, props.onLocalWorkspaceSave]] as const) {
    editor.commandRegistry.register({ id, label: id, canExecute: () => !props.workspaceBusy, execute: serverExecute });
  }
  // Phext import/export are explicit Local file actions (feature-flagged);
  // they never run on the typing path and export never acknowledges a Save.
  const [phextError, setPhextError] = createSignal("");
  const openPhext = () => documents.guard("open a phext document", () => void (async () => {
    setPhextError("");
    try {
      const selected = await openPhextFile();
      if (!selected) return;
      props.onOpenLocal(phextToDocument(selected.text, selected.filename), { filename: selected.filename, handle: selected.handle });
    } catch (reason) {
      setPhextError(reason instanceof Error ? reason.message : String(reason));
    }
  })());
  const exportPhext = () => {
    setPhextError("");
    try {
      const document = editor.encodeDocument();
      void savePhextFile(documentToPhext(document), phextFilenameFor(document))
        .catch((reason) => setPhextError(reason instanceof Error ? reason.message : String(reason)));
    } catch (reason) {
      setPhextError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const encoded = createMemo(() => {
    editor.repository.state.revision;
    return showJson() ? JSON.stringify(editor.encodeDocument(), null, 2) : "";
  });
  const canUndo = () => { editor.repository.state.revision; return editor.repository.canUndo(); };
  const canRedo = () => { editor.repository.state.revision; return editor.repository.canRedo(); };
  const toggleDebuggingPanels = () => {
    const visible = !debuggingPanelsVisible();
    setDebuggingPanelsVisible(visible);
    if (!visible) setShowJson(false);
  };
  onCleanup(() => { if (suppressTimer) clearTimeout(suppressTimer); windowObserver?.disconnect(); releaseEditor(); editor.dispose(); });
  onMount(() => {
    editor.installGateway(document);
    setLoaded(true);
    observeWindow();
    if (props.document && !props.closed) queueMicrotask(() => {
      const bookmark = (props.document?.metadata as { focus?: { blockId?: string; caret?: number } } | undefined)?.focus;
      const editable = Object.values(projection.state.nodes).filter((node) => {
        const mount = editor.mounts.get(node.key);
        return mount && ["native-text", "standoff"].includes(mount.inputPolicy) && !mount.root.closest('[aria-hidden="true"]');
      });
      const target = editable.find((node) => node.payload.id === bookmark?.blockId) ?? editable[0];
      if (!target) return;
      const caret = target.payload.id === bookmark?.blockId && typeof bookmark?.caret === "number" && Number.isFinite(bookmark.caret) ? Math.max(0, bookmark.caret) : 0;
      editor.focus.request(target.key, { reason: "open-document", caret: { start: caret, end: caret, direction: "none" } });
      editor.mounts.get(target.key)?.root.scrollIntoView?.({ block: "nearest" });
    });
  });

  return (
    <main data-window-work-area class="workspace-demo" classList={{ [editor.windowPresentation.workspaceClass()]: true, "workspace-demo--system-bar": editor.features.codexSystemBar }} data-demo-state={loaded() ? "loaded" : "loading"}>
      <Show when={editor.features.codexSystemBar} fallback={<nav class="workspace-demo__toolbar" aria-label="Demo controls">
          <CavernControl />
        {<>
          <span class="workspace-demo__toolbar-group" aria-label="Server files">
            <strong>Server</strong>
            <button type="button" onPointerDown={event => event.preventDefault()} onClick={props.onBackground}>Background…</button>
            <button type="button" disabled={documents.busy()} onClick={() => documents.run("document.open", "server")}>Open…</button>
            <button data-document-save type="button" disabled={documents.busy()} onClick={() => documents.run("document.save", "server")}>Save</button>
            <button data-document-save type="button" disabled={documents.busy()} onClick={() => documents.run("document.saveAs", "server")}>Save as…</button>
            <button type="button" disabled={props.workspaceBusy} onClick={props.onWorkspaceOpen}>Open Workspace…</button>
            <button data-document-save type="button" disabled={props.workspaceBusy} onClick={props.onWorkspaceSave}>Save Workspace…</button>
          </span>
          <span class="workspace-demo__toolbar-group" aria-label="Local files">
            <strong>Local</strong>
            <button type="button" onPointerDown={event => event.preventDefault()} onClick={props.onBackground}>Background…</button>
            <button type="button" disabled={documents.busy()} onClick={() => documents.run("document.open", "local")}>Open…</button>
            <button data-document-save type="button" disabled={documents.busy()} onClick={() => documents.run("document.save", "local")}>Save</button>
            <button data-document-save type="button" disabled={documents.busy()} onClick={() => documents.run("document.saveAs", "local")}>Save as…</button>
            <button type="button" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceOpen}>Open Workspace…</button>
            <button data-document-save type="button" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceSave}>Save Workspace…</button>
            <Show when={editor.features.phextDocuments}><button type="button" disabled={documents.busy()} onClick={openPhext}>Open Phext…</button><button data-document-save type="button" disabled={documents.busy()} onClick={exportPhext}>Export Phext…</button></Show>
          </span>
        </>}
        <button type="button" title={editor.bindings.label("sticky.createFloating")} onClick={() => editor.stickyNotes.create()}>New Sticky Note</button>
        <For each={props.stickyHost.stickyNotes.closedWindows()}>{key => <button type="button" onClick={() => props.stickyHost.stickyNotes.reopen(key)}>Reopen sticky note</button>}</For>
        <button type="button" disabled={!canUndo()} onClick={() => editor.repository.undo()}>Undo</button>
        <button type="button" disabled={!canRedo()} onClick={() => editor.repository.redo()}>Redo</button>
        <button type="button" disabled={documents.busy()} onClick={() => documents.guard("reset to the sample document", props.onReset)}>Reset demo</button>
        <Show when={windowState() === "closed"}><button type="button" onClick={restoreWindow}>Reopen document</button></Show>
        <a href={`${import.meta.env.BASE_URL}pilot`}>Open two-pane pilot</a>
        <a href={`${import.meta.env.BASE_URL}superposition`}>Text superposition demo</a>
        <span>revision {editor.repository.state.revision}</span>
      </nav>}>
        <CodexSystemBar manager={editor.windowManager}>
          <button type="button" role="menuitem" onPointerDown={event => event.preventDefault()} onClick={props.onBackground}>Background…</button>
          <a role="menuitem" href={`${import.meta.env.BASE_URL}superposition`}>Text superposition demo</a>
          <hr role="separator" />
          {<>
            <fieldset class="codex-system-menu__group" aria-label="Server files">
              <legend>Server</legend>
              <button type="button" role="menuitem" disabled={documents.busy()} onClick={() => documents.run("document.open", "server")}>Open…</button>
              <button data-document-save type="button" role="menuitem" disabled={documents.busy()} onClick={() => documents.run("document.save", "server")}>Save</button>
              <button data-document-save type="button" role="menuitem" disabled={documents.busy()} onClick={() => documents.run("document.saveAs", "server")}>Save as…</button>
              <button type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onWorkspaceOpen}>Open Workspace…</button>
              <button data-document-save type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onWorkspaceSave}>Save Workspace…</button>
            </fieldset>
            <fieldset class="codex-system-menu__group" aria-label="Local files">
              <legend>Local</legend>
              <button type="button" role="menuitem" disabled={documents.busy()} onClick={() => documents.run("document.open", "local")}>Open…</button>
              <button data-document-save type="button" role="menuitem" disabled={documents.busy()} onClick={() => documents.run("document.save", "local")}>Save</button>
              <button data-document-save type="button" role="menuitem" disabled={documents.busy()} onClick={() => documents.run("document.saveAs", "local")}>Save as…</button>
              <button type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceOpen}>Open Workspace…</button>
              <button data-document-save type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceSave}>Save Workspace…</button>
              <Show when={editor.features.phextDocuments}><button type="button" role="menuitem" disabled={documents.busy()} onClick={openPhext}>Open Phext…</button><button data-document-save type="button" role="menuitem" disabled={documents.busy()} onClick={exportPhext}>Export Phext…</button></Show>
            </fieldset>
          </>}
          <hr role="separator" />
          <button type="button" role="menuitem" title={editor.bindings.label("sticky.createFloating")} onClick={() => editor.stickyNotes.create()}>New Sticky Note</button>
          <For each={props.stickyHost.stickyNotes.closedWindows()}>{key => <button type="button" role="menuitem" onClick={() => props.stickyHost.stickyNotes.reopen(key)}>Reopen sticky note</button>}</For>
          <hr role="separator" />
          <button type="button" role="menuitem" disabled={!canUndo()} onClick={() => editor.repository.undo()}>Undo</button>
          <button type="button" role="menuitem" disabled={!canRedo()} onClick={() => editor.repository.redo()}>Redo</button>
          <hr role="separator" />
          <button type="button" role="menuitem" disabled={documents.busy()} onClick={() => documents.guard("reset to the sample document", props.onReset)}>Reset demo</button>
          <Show when={windowState() === "closed"}><button type="button" role="menuitem" onClick={restoreWindow}>Reopen document</button></Show>
          <a role="menuitem" href={`${import.meta.env.BASE_URL}pilot`}>Open two-pane pilot</a>
          <hr role="separator" />
          <button type="button" role="menuitem" aria-controls="workspace-demo-help workspace-demo-coverage workspace-demo-json" onClick={toggleDebuggingPanels}>{debuggingPanelsVisible() ? "Hide debugging panels" : "Show debugging panels"}</button>
          <hr role="separator" />
          <span class="codex-system-menu__status">Revision: {editor.repository.state.revision}</span>
        </CodexSystemBar>
      </Show>

      <Show when={windowState() !== "closed"}>
        <section
          ref={windowElement}
          class="workspace-demo__window"
          classList={{ ...presentation.classes(),
            "workspace-demo__window--minimized": windowState() === "minimized",
            "workspace-demo__window--maximized": windowState() === "maximized",
            "workspace-demo__window--glass": glass(),
            "workspace-demo__window--margins-collapsed": marginsCollapsed(),
          }}
          style={{ transform: windowState() !== "maximized" ? `translate(${position().x}px, ${position().y}px)` : undefined, ...(windowState() === "normal" && displayWindowSize() ? { width: `${displayWindowSize()!.width}px`, height: `${displayWindowSize()!.height}px` } : {}) }}
        >
          <Show when={windowState() === "minimized"} fallback={<>
            <header
              class="workspace-demo__windowbar"
              onContextMenu={headerMenu}
              onClick={event => { if (event.ctrlKey) headerMenu(event); }}
              onPointerDown={beginWindowDrag}
              onPointerMove={moveWindow}
              onPointerUp={finishWindowDrag}
              onPointerCancel={event => { if (drag?.pointerId === event.pointerId) drag = undefined; }}
            >
              <span class="workspace-demo__window-title" title={documents.location() ? `${documents.location()!.folder}/${title()}` : title()}>{title()}<span class="workspace-demo__save-state" role="status" data-save-state={documents.busy() ? "saving" : documents.dirty() ? "unsaved" : "saved"}> · {documents.busy() ? "Working…" : documents.dirty() ? "Unsaved changes" : documents.location() || documents.localFile() ? "Saved" : "Sample"}</span></span>
              <span class="workspace-demo__window-controls">
                <Dynamic component={presentation.control()} />
                <button type="button" aria-label="Minimize document window" onClick={() => setWindowState("minimized")}>−</button>
                <button type="button" aria-label="Maximize document window" onClick={() => setWindowState((value) => value === "maximized" ? "normal" : "maximized")}>□</button>
                <button type="button" aria-label="Close document window" disabled={documents.busy()} onClick={() => documents.guard("close the document window", () => props.onClose(editor.persistence.savedDocument ?? props.document, documents.location(), documents.localFile()))}>×</button>
              </span>
            </header>
            <DocumentMarginContext.Provider value={marginPresentation}>
              <DocumentStyleBar toolset={toolset()} onToolset={setToolset} onNotice={setToolbarNotice} editor={editor} scopeKey={projection.state.rootKey} margins={{ collapsed: marginsCollapsed(), count: marginEntries().length, open: marginDrawerOpen(), controls: "demo-document-margin-drawer", toggle: toggleMargins }} />
              <Show when={documents.error() && !documents.browser() && !documents.pending()}><p class="workspace-demo__file-notice" role="alert">{documents.error()}</p></Show>
              <Show when={phextError()}><p class="workspace-demo__file-notice" role="alert">{phextError()}</p></Show>
              <Show when={editor.persistence.state.warning}><p class="workspace-demo__file-notice" role="status">{editor.persistence.state.warning}</p></Show>
              <section class="workspace-demo__document" classList={{ "workspace-demo__document--tabbed": hasDocumentTabs(), "workspace-demo__document--flow": !hasDocumentTabs() }} aria-label={title()}>
                <ReactiveTreeView editor={editor} projection={projection} />
              </section>
              <Show when={editor.features.compactEditorChrome}><DocumentStatusBar editor={editor} scopeKey={projection.state.rootKey} notice={toolbarNotice()} /></Show>
              <Show when={marginsCollapsed() && marginDrawerOpen()}>
                <ReactiveViewProvider editor={editor} projection={projection}>
                  <DocumentMarginDrawer id="demo-document-margin-drawer" entries={marginEntries()} onClose={toggleMargins} onSource={key => editor.focus.request(key, { reason: "margin-source" })} />
                </ReactiveViewProvider>
              </Show>
            </DocumentMarginContext.Provider>
            <Show when={windowState() === "normal"}><FloatingWindowResizeHandle controller={windowResize} class="reactive-window__resize" label={`Resize ${title()} window`} /></Show>
          </>}>
            <WindowIcon class="workspace-demo__window-icon" title={title()} kind="document" onRestore={restoreWindow}
              onPointerDown={beginWindowDrag} onPointerMove={moveWindow} onPointerUp={finishWindowDrag}
              onPointerCancel={event => { if (drag?.pointerId === event.pointerId) drag = undefined; }} />
          </Show>
        </section>
      </Show>

      <Show when={debuggingPanelsVisible()}>
        <details id="workspace-demo-help" class="workspace-demo__guide">
          <summary>Demo help</summary>
          <p><strong>Try it:</strong> edit a paragraph, use Enter and boundary arrows, switch
            Page 1 / Page 2, open a sticky tab, drag a canvas box, or open tab C and turn
            the image card over. Open browses the document store; Save writes changes
            to the current file, and Save as creates a copy. Ctrl/Cmd+O opens,
            Ctrl/Cmd+S saves, and Ctrl/Cmd+Shift+S opens Save as. Control-click or
            right-click a Block for its menu; Shift+F10 works from a focused Block.
            Control-click the desktop or choose Background… to switch backgrounds.</p>
          <Show when={!props.document}><p>{loaded() ? "Document loaded" : "Loading document…"} · {demoSourceCounts.blocks} Blocks · {demoSourceCounts.types} document types</p></Show>
        </details>
        <details id="workspace-demo-coverage" class="workspace-demo__coverage">
          <summary>Block coverage: {workspaceBuilderTypes.length} / {workspaceBuilderTypes.length} source builders registered</summary>
          <p>All builders referenced by the original workspace resolve to a view. Some use
            structural previews; registration does not mean their complete handler catalog
            is implemented. The Universe context is registered separately.</p>
          <ul><For each={workspaceBuilderTypes}>{(type) => <li>{type}</li>}</For></ul>
        </details>
        <details id="workspace-demo-json" class="workspace-demo__json" onToggle={(event) => setShowJson(event.currentTarget.open)}>
          <summary>Inspect the current document JSON</summary>
          <Show when={showJson()}><pre>{encoded()}</pre></Show>
        </details>
      </Show>
      <Show when={documents.browser()}>{(mode) => <DocumentBrowser mode={mode()} initialLocation={mode()==='save'?documents.browserLocation():documents.location()} busy={documents.busy()} error={documents.error()} conflict={documents.conflict()} onChoose={documents.choose} onClose={documents.closeBrowser} />}</Show>
      <Show when={documents.pending()}>{(next) => <DocumentDialog title="Save your changes?" compact busy={documents.busy()} onClose={documents.cancelPending}>
        <p class="document-dialog__body">Save changes to “{title()}” before you {next().label}?</p>
        <Show when={documents.error()}><p class="document-dialog__error" role="alert">{documents.error()}</p></Show>
        <div class="document-dialog__footer">
          <button type="button" disabled={documents.busy()} onClick={documents.cancelPending}>Cancel</button>
          <button type="button" disabled={documents.busy()} onClick={documents.discardPending}>Discard changes</button>
          <button type="button" class="document-dialog__primary" disabled={documents.busy()} onClick={documents.savePending}>Save changes</button>
        </div>
      </DocumentDialog>}</Show>
    </main>
  );
}

function CanonicalWorkspaceSession(props: { launchFlint?: boolean; configuration: ReactiveEditorConfiguration; loaded: LoadedWorkspace; filename: string; onWorkspaceOpen: () => void; onWorkspaceSave: () => void; onLocalWorkspaceOpen: () => void; onLocalWorkspaceSave: () => void; onLocalWorkspaceSaveAs: () => void; onUpgradeServer: () => void; onUpgradeLocal: () => void; workspaceBusy: boolean; onEditor: (editor: ReactiveEditor) => () => void }) {
  const cavern = useCurrentCavern();
  let workspaceLauncher: (() => void) | undefined;
  let workspaceToolbar: HTMLElement | undefined;
  const session = new WorkspaceSession(props.loaded, props.configuration);
  const { editor, projection } = session;
  editor.clipboard.setContext(() => ({ cavernId: cavern?.current()?.cavernGuid, session: cavern?.current()?.session }));
  const opening = createWorkspaceOpenControls(session, () => !props.workspaceBusy);
  const release = props.onEditor(editor);
  for (const [id, serverExecute, localExecute] of [["workspace.open", props.onWorkspaceOpen, props.onLocalWorkspaceOpen], ["workspace.save", props.onWorkspaceSave, props.onLocalWorkspaceSave], ["workspace.saveAs", props.onWorkspaceSave, props.onLocalWorkspaceSaveAs]] as const) {
    editor.commandRegistry.register({ id, label: id, canExecute: () => !props.workspaceBusy, execute: serverExecute });
  }
  onMount(() => {
    editor.installGateway(document);
    if (props.launchFlint && editor.features.flint) editor.commandRegistry.execute('flint.open', {targetKey:projection.state.rootKey,args:undefined});
    if (cavern) {
      const beforeUnload = (event: BeforeUnloadEvent) => {
        if (session.dirty() || props.workspaceBusy || editor.blockHistory.hasPendingCapture()) { event.preventDefault(); event.returnValue = ''; }
      };
      window.addEventListener('beforeunload', beforeUnload);
      onCleanup(() => window.removeEventListener('beforeunload', beforeUnload));
    }
  });
  onCleanup(() => { release(); session.dispose(); });
  const canUndo = () => { editor.repository.state.revision; return editor.repository.canUndo(); };
  const canRedo = () => { editor.repository.state.revision; return editor.repository.canRedo(); };
  return <main data-window-work-area class="workspace-demo workspace-demo--canonical" classList={{ [editor.windowPresentation.workspaceClass()]: true, "workspace-demo--system-bar": editor.features.codexSystemBar }}>
    <Show when={editor.features.codexSystemBar} fallback={<nav ref={workspaceToolbar} class="workspace-demo__toolbar" aria-label="Workspace controls">
      <CavernControl />
      <opening.Buttons />
      <Show when={editor.features.flint}><button type="button" disabled={props.workspaceBusy || session.presentation.active() !== "desktop"} title="Open Flint on Desktop" onClick={() => editor.commandRegistry.execute("flint.open", { targetKey: projection.state.rootKey, args: undefined })}>Open Flint</button></Show>
      <Show when={editor.features.thesis}><button type="button" disabled={props.workspaceBusy || session.presentation.active() !== "desktop"} onClick={() => editor.commandRegistry.execute("thesis.open", { targetKey: projection.state.rootKey, args: undefined })}>Open Thesis</button></Show>
      <Show when={editor.features.phosphor}><button type="button" disabled={props.workspaceBusy || session.presentation.active() !== "desktop"} title="Open Phosphor on Desktop" onClick={() => editor.commandRegistry.execute("phosphor.open", { targetKey: projection.state.rootKey, args: undefined })}>Open Phosphor</button></Show>
      {<>
        <span class="workspace-demo__toolbar-group" aria-label="Server files"><strong>Server</strong><button type="button" disabled={props.workspaceBusy} onClick={props.onWorkspaceOpen}>Open Workspace…</button><button data-document-save type="button" disabled={props.workspaceBusy} onClick={props.onWorkspaceSave}>Save Workspace</button></span>
        <span class="workspace-demo__toolbar-group" aria-label="Local files"><strong>Local</strong><button type="button" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceOpen}>Open Workspace…</button><button data-document-save type="button" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceSave}>Save Workspace</button><Show when={session.presentation.enabled}><button data-document-save type="button" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceSaveAs}>Save Workspace as…</button></Show></span>
      </>}
      <button type="button" title={editor.bindings.label("sticky.createFloating")} onClick={() => editor.stickyNotes.create()}>New Sticky Note</button>
      <For each={editor.stickyNotes.closedWindows()}>{key => <button type="button" onClick={() => editor.stickyNotes.reopen(key)}>Reopen sticky note</button>}</For>
      <button type="button" disabled={!canUndo()} onClick={() => editor.repository.undo()}>Undo</button>
      <button type="button" disabled={!canRedo()} onClick={() => editor.repository.redo()}>Redo</button>
      <a href={`${import.meta.env.BASE_URL}superposition`}>Text superposition demo</a>
      <Show when={session.presentation.enabled}><WorkspacePresentations session={session} busy={props.workspaceBusy} /></Show>
      <a href={`${import.meta.env.BASE_URL}?demo=1`} target="_blank" rel="noopener">Sample document demo</a>
      <span>{props.filename} · revision {editor.repository.state.revision}{session.dirty() ? " · Unsaved changes" : ""}</span>
    </nav>}>
      <CodexSystemBar manager={editor.windowManager} workspaceLauncher={open => { workspaceLauncher = open; }}>
        <Show when={session.presentation.enabled}><WorkspacePresentations session={session} menu busy={props.workspaceBusy} /></Show>
        <opening.Buttons menu />
        <Show when={editor.features.flint}><button type="button" role="menuitem" disabled={props.workspaceBusy || session.presentation.active() !== "desktop"} title="Open Flint on Desktop" onClick={() => editor.commandRegistry.execute("flint.open", { targetKey: projection.state.rootKey, args: undefined })}>Open Flint</button></Show>
        <Show when={editor.features.thesis}><button type="button" role="menuitem" disabled={props.workspaceBusy || session.presentation.active() !== "desktop"} onClick={() => editor.commandRegistry.execute("thesis.open", { targetKey: projection.state.rootKey, args: undefined })}>Open Thesis</button></Show>
        <Show when={editor.features.phosphor}><button type="button" role="menuitem" disabled={props.workspaceBusy || session.presentation.active() !== "desktop"} title="Open Phosphor on Desktop" onClick={() => editor.commandRegistry.execute("phosphor.open", { targetKey: projection.state.rootKey, args: undefined })}>Open Phosphor</button></Show>
        <a role="menuitem" href={`${import.meta.env.BASE_URL}?demo=1`} target="_blank" rel="noopener">Sample document demo</a>
        <a role="menuitem" href={`${import.meta.env.BASE_URL}superposition`}>Text superposition demo</a>
        <hr role="separator" />
        {<>
          <fieldset class="codex-system-menu__group" aria-label="Server files">
            <legend>Server</legend>
            <button type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onWorkspaceOpen}>Open Workspace…</button>
            <button data-document-save type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onWorkspaceSave}>Save Workspace</button>
            <Show when={editor.features.mutableWindowManager}><button type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onUpgradeServer}>Upgrade Workspace and Save as…</button></Show>
          </fieldset>
          <fieldset class="codex-system-menu__group" aria-label="Local files">
            <legend>Local</legend>
            <button type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceOpen}>Open Workspace…</button>
            <button data-document-save type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceSave}>Save Workspace</button>
            <Show when={session.presentation.enabled || editor.features.mutableWindowManager}><button data-document-save type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onLocalWorkspaceSaveAs}>Save Workspace as…</button></Show>
            <Show when={editor.features.mutableWindowManager}><button type="button" role="menuitem" disabled={props.workspaceBusy} onClick={props.onUpgradeLocal}>Upgrade Workspace and Save as…</button></Show>
          </fieldset>
        </>}
        <hr role="separator" />
        <button type="button" role="menuitem" title={editor.bindings.label("sticky.createFloating")} onClick={() => editor.stickyNotes.create()}>New Sticky Note</button>
        <For each={editor.stickyNotes.closedWindows()}>{key => <button type="button" role="menuitem" onClick={() => editor.stickyNotes.reopen(key)}>Reopen sticky note</button>}</For>
        <hr role="separator" />
        <button type="button" role="menuitem" disabled={!canUndo()} onClick={() => editor.repository.undo()}>Undo</button>
        <button type="button" role="menuitem" disabled={!canRedo()} onClick={() => editor.repository.redo()}>Redo</button>
        <hr role="separator" />
        <span class="codex-system-menu__status">{props.filename} · Revision: {editor.repository.state.revision}{session.dirty() ? " · Unsaved changes" : ""}</span>
      </CodexSystemBar>
    </Show>
    <Show when={editor.persistence.workspaceLoadIssues().length}><aside class="workspace-demo__workspace-notice" role="status">{editor.persistence.workspaceLoadIssues().map(issue => issue.message).join(" · ")}</aside></Show>
    <Show when={session.presentation.issue()}>{issue => <aside class="workspace-demo__workspace-notice" role="status">{issue()}</aside>}</Show>
    <Show when={session.notice()}>{notice => <aside class="workspace-demo__workspace-notice" role="status">{notice()}</aside>}</Show>
    <Show when={session.presentation.enabled || session.windowManager} fallback={<ReactiveTreeView editor={editor} projection={projection} />}>
      <WorkspacePresentationView session={session} desktopAvailable={() => !props.workspaceBusy} desktopActions={{
        workbench: () => {
          if (workspaceLauncher) workspaceLauncher();
          else workspaceToolbar?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
        },
        cavern: cavern ? () => cavern.choose("open") : undefined,
      }} />
    </Show>
    <opening.Dialogs />
  </main>;
}

export function WorkspaceDemo(props: { launchFlint?: boolean; configuration?: ReactiveEditorConfiguration; initialWorkspace?: ExistingBlockDto } = {}) {
  const cavern = useCurrentCavern();
  const features = resolveFeatureFlags(props.configuration);
  const configuration: ReactiveEditorConfiguration = { ...props.configuration, features };
  const [session, setSession] = createSignal<{ document?: ExistingBlockDto; location?: DocumentLocation; localFile?: LocalDocumentFile; closed?: boolean; window?: Partial<DemoWindowSnapshot> }>({});
  const [loadedWorkspace, setLoadedWorkspace] = createSignal<LoadedWorkspace | undefined>(props.initialWorkspace ? materializeLocalWorkspace(props.initialWorkspace) : undefined);
  const [workspaceBrowser, setWorkspaceBrowser] = createSignal<"open" | "save">();
  const [workspaceFilename, setWorkspaceFilename] = createSignal<string>();
  const [workspaceBusy, setWorkspaceBusy] = createSignal(false);
  const [workspaceError, setWorkspaceError] = createSignal("");
  const [workspaceConflict, setWorkspaceConflict] = createSignal(false);
  let localWorkspaceValue: unknown;
  const [upgradeWorkspace, setUpgradeWorkspace] = createSignal(false);
  const [localWorkspaceFile, setLocalWorkspaceFile] = createSignal<LocalWorkspaceFile>();
  const background = new BackgroundEditor({ id: "workspace-background", type: "image-background-block", metadata: { url: backgroundImages[0].url }, children: [] }, configuration);
  registerApplicationViews(background);
  const backgroundView = background.createView("workspace-background");
  let activeEditor: ReactiveEditor | undefined;
  let activeDemo: DemoEditorBridge | undefined;
  let activeWorkspaceEditor: ReactiveEditor | undefined;
  for (const id of ["document.open", "document.save", "document.saveAs"]) background.commandRegistry.register({ id, label: id,
    canExecute: () => !!activeEditor?.commandRegistry.canExecute(id, { targetKey: activeEditor.projections.values().next().value!.state.rootKey, args: undefined }),
    execute: () => activeEditor?.commandRegistry.execute(id, { targetKey: activeEditor.projections.values().next().value!.state.rootKey, args: undefined }),
  });
  onMount(() => {
    background.installGateway(document);
    cavern?.reconcile({ version: 1, opaqueTypes: background.registry.typesWithCapability('opaque-widget') });
  });
  onCleanup(() => background.dispose());
  const openBackground = (event: MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!background.overlays.overlays.some(overlay => overlay.viewType === "context-menu")) background.overlays.open({ viewType: "context-menu", ownerKey: backgroundView.state.rootKey, anchor: { x: rect.left, y: rect.bottom + 4 } });
  };
  const openWorkspace = () => { if (!workspaceBusy()) { setWorkspaceError(""); setWorkspaceConflict(false); setWorkspaceBrowser("open"); } };
  const saveWorkspace = () => { if (!workspaceBusy()) { setUpgradeWorkspace(false); setWorkspaceError(""); setWorkspaceConflict(false); setWorkspaceBrowser("save"); } };
  const splitWorkspaceDocument = (requireServerLocation: boolean): ExistingBlockDto => {
    if (!activeDemo) throw new Error("The current Workspace is not ready.");
    if (requireServerLocation && activeDemo.editor.blockHistory.state.storage === "persistent") {
      throw new Error("Save this enrolled Document with Save. Workspace saving for persistent-history Documents is not supported yet.");
    }
    const location = activeDemo.location();
    if (requireServerLocation && !location) throw new Error("Save the current Document with Save as… before saving its Workspace.");
    const document = activeDemo.editor.encodeDocument();
    const documentMetadata = (document.metadata as Record<string, unknown> | undefined) ?? {};
    const documentId = String(documentMetadata.documentId ?? document.id ?? globalThis.crypto.randomUUID());
    document.metadata = {
      ...documentMetadata,
      documentId,
      ...(location ? { folder: location.folder, filename: location.filename } : {}),
    };
    const backgroundDto = background.encodeDocument();
    const window = activeDemo.window();
    backgroundDto.children = [...(backgroundDto.children ?? []), {
      id: "workspace-document-window", type: "document-window-block",
      metadata: { title: activeDemo.filename(), position: window.position, size: window.size, state: window.state, zIndex: 1 },
      children: [document],
    }];
    return { id: "workspace", type: "workspace-block", children: [backgroundDto] };
  };
  const saveSplitWorkspace = async (filename: string, createOnly: boolean): Promise<WorkspaceActionResult> => {
    const demo = activeDemo;
    let workspace: ExistingBlockDto;
    try { workspace = splitWorkspaceDocument(true); }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
    const temporary = new BackgroundEditor(workspace, configuration);
    try {
      const success = await temporary.persistence.saveWorkspace(filename, { createOnly });
      if (success) {
        demo?.editor.persistence.markCurrentRevisionSaved(demo.editor.encodeDocument());
        background.persistence.markCurrentRevisionSaved();
      }
      return { success, error: temporary.persistence.state.error, status: temporary.persistence.state.status };
    } finally { temporary.dispose(); }
  };
  const chooseWorkspace = async (filename: string, overwrite: boolean) => {
    if (workspaceBusy()) return false;
    setWorkspaceBusy(true); setWorkspaceError(""); setWorkspaceConflict(false);
    try {
      if (workspaceBrowser() === "open") {
        const loaded = await PersistenceService.loadWorkspace(filename);
        if (loaded.manifest?.schemaVersion === 2 && !resolveFeatureFlags(configuration).mutableWindowManager) throw new Error("Enable the Mutable Window Manager to open this Workspace.");
        setLoadedWorkspace(loaded); setWorkspaceFilename(filename); setLocalWorkspaceFile(undefined); setWorkspaceBrowser(undefined);
        return true;
      }
      const result = activeWorkspaceEditor
        ? { success: await activeWorkspaceEditor.persistence.saveWorkspace(filename, { createOnly: upgradeWorkspace() || !overwrite, upgrade: upgradeWorkspace(), ...(upgradeWorkspace()?{managedVersion:4 as const}:{}) }), error: activeWorkspaceEditor.persistence.state.error, status: activeWorkspaceEditor.persistence.state.status }
        : await saveSplitWorkspace(filename, !overwrite);
      if (!result.success) {
        setWorkspaceError(result.error || "The Workspace could not be saved.");
        setWorkspaceConflict(!upgradeWorkspace() && result.status === 409);
        return false;
      }
      setWorkspaceFilename(filename); setWorkspaceBrowser(undefined); return true;
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error)); return false;
    } finally { setWorkspaceBusy(false); }
  };
  const openLocalWorkspace = async () => {
    if (workspaceBusy()) return;
    setWorkspaceBusy(true); setWorkspaceError("");
    try {
      const selected = await openJsonFile();
      if (!selected) return;
      const loaded = materializeLocalWorkspace(selected.value);
      if (loaded.localContainer && !resolveFeatureFlags(configuration).mutableWindowManager) throw new Error("Enable the Mutable Window Manager to open this Workspace.");
      setLoadedWorkspace(loaded);
      localWorkspaceValue = selected.value;
      setWorkspaceFilename(selected.filename);
      setLocalWorkspaceFile({ filename: selected.filename, handle: selected.handle });
      setWorkspaceBrowser(undefined);
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
    finally { setWorkspaceBusy(false); }
  };
  const saveLocalWorkspace = async (saveAs = false, upgrade = false) => {
    if (workspaceBusy()) return;
    setWorkspaceBusy(true); setWorkspaceError("");
    try {
      const owner = activeWorkspaceEditor;
      const captured = owner?.persistence.captureWorkspace({ upgrade, ...(upgrade?{managedVersion:4 as const}:{}) });
      const workspace = captured?.localValue ?? captured?.document ?? splitWorkspaceDocument(false);
      const current = localWorkspaceFile();
      const saved = await saveJsonFile(workspace, { suggestedName: upgrade ? "Workspace-managed.json" : current?.filename ?? workspaceFilename() ?? "Workspace.json", handle: current?.handle, saveAs: saveAs || upgrade, workspace: { expected: localWorkspaceValue, createOnly: upgrade } });
      if (!saved) return;
      localWorkspaceValue = structuredClone(workspace);
      setLocalWorkspaceFile(saved); setWorkspaceFilename(saved.filename);
      if (captured) owner!.persistence.acknowledgeWorkspaceSave(captured);
      if (activeDemo) activeDemo.editor.persistence.markCurrentRevisionSaved(activeDemo.editor.encodeDocument());
      background.persistence.markCurrentRevisionSaved();
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
    finally { setWorkspaceBusy(false); }
  };
  return (
    <ErrorBoundary fallback={(error, reset) => (
      <main data-window-work-area class="workspace-demo" data-demo-state="error">
        <h1>The workspace could not load.</h1>
        <p role="alert">{error instanceof Error ? error.message : String(error)}</p>
        <button type="button" onClick={reset}>Try again</button>
      </main>
    )}>
      <div class="workspace-stage">
        <Show when={loadedWorkspace()} fallback={<>
          <div class="workspace-stage__background"><ReactiveTreeView editor={background} projection={backgroundView} /></div>
          <For each={[session()]}>
            {(initial) => <DemoSession {...initial} configuration={configuration} stickyHost={background} workspaceBusy={workspaceBusy()} onWorkspaceOpen={openWorkspace} onWorkspaceSave={saveWorkspace} onLocalWorkspaceOpen={() => void openLocalWorkspace()} onLocalWorkspaceSave={() => void saveLocalWorkspace()} onEditor={bridge => { activeDemo = bridge; activeEditor = bridge.editor; return () => { if (activeDemo === bridge) activeDemo = undefined; if (activeEditor === bridge.editor) activeEditor = undefined; }; }} onBackground={openBackground} onReset={() => setSession({})} onClose={(document, location, localFile) => setSession({ document, location, localFile, closed: true })} onOpen={(document, location) => setSession({ document, location })} onOpenLocal={(document, localFile) => setSession({ document, localFile })} />}
          </For>
        </>}>
          {loaded => <For each={[loaded()]}>{workspace => <CanonicalWorkspaceSession launchFlint={props.launchFlint} configuration={configuration} loaded={workspace} filename={workspaceFilename() ?? "Workspace"} workspaceBusy={workspaceBusy()} onWorkspaceOpen={openWorkspace} onWorkspaceSave={saveWorkspace} onLocalWorkspaceOpen={() => void openLocalWorkspace()} onLocalWorkspaceSave={() => void saveLocalWorkspace()} onLocalWorkspaceSaveAs={() => void saveLocalWorkspace(true)} onUpgradeLocal={() => void saveLocalWorkspace(true, true)} onUpgradeServer={() => { if (!workspaceBusy()) { setUpgradeWorkspace(true); setWorkspaceError(""); setWorkspaceConflict(false); setWorkspaceBrowser("save"); } }} onEditor={editor => { activeWorkspaceEditor = editor; return () => { if (activeWorkspaceEditor === editor) activeWorkspaceEditor = undefined; }; }} />}</For>}
        </Show>
        <Show when={workspaceError() && !workspaceBrowser()}><aside class="workspace-demo__workspace-notice" role="alert">{workspaceError()}</aside></Show>
        <Show when={workspaceBrowser()}>{mode => <WorkspaceBrowser mode={mode()} initialFilename={upgradeWorkspace() ? "Workspace-managed.json" : workspaceFilename()} createOnly={upgradeWorkspace()} busy={workspaceBusy()} error={workspaceError()} conflict={workspaceConflict()} onChoose={chooseWorkspace} onClose={() => { if (!workspaceBusy()) { setWorkspaceBrowser(undefined); setWorkspaceError(""); } }} />}</Show>
      </div>
    </ErrorBoundary>
  );
}
