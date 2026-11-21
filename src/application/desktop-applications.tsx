import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { CodexFeature } from "../feature-api";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { WorkspaceSession } from "./workspace-session";
import "./desktop-applications.css";

// Presentation metadata only. Working applications still own their launch commands.
export const desktopApplications = [
  { id: "flint", name: "Flint", command: "flint.open" },
  { id: "cavern", name: "Cavern" },
  { id: "workbench", name: "Workbench" },
  { id: "search", name: "Search" },
  { id: "library", name: "Library" },
  { id: "browse", name: "Browse" },
  { id: "annotate", name: "Annotate" },
  { id: "phosphor", name: "Phosphor", command: "phosphor.open" },
  { id: "view", name: "View" },
  { id: "graph", name: "Graph", command: "flint.open", view: "graph" },
  { id: "calendar", name: "Calendar" },
  { id: "tasks", name: "Tasks" },
  // Keep the saved Acetate placeholder identity; Quill is a separate application.
  { id: "acetate", name: "Acetate" },
  { id: "quill", name: "Quill", command: "quill.open" },
  { id: "cardex", name: "Cardex", command: "cardex.open" },
  { id: "thesis", name: "Thesis", command: "thesis.open" },
  { id: "dialectic", name: "Dialectic", command: "dialectic.open" },
  { id: "osmosis", name: "Osmosis" },
  { id: "settings", name: "Settings" },
  { id: "trash", name: "Trash" },
] as const;
export type DesktopApplication = (typeof desktopApplications)[number];
export type DesktopActions = { workbench?: () => void; cavern?: () => void };
export const desktopIcon = (id: string) => id === "quill" ? new URL("../assets/quill.svg", import.meta.url).href : new URL(`../assets/desktop-icons/${id}.png`, import.meta.url).href;

/** A normal canonical Window, using the existing renderer and Window Manager. */
export function createDesktopPlaceholderFeature(editor: ReactiveEditor): CodexFeature {
  return { id: "desktop-placeholders", activate(scope) {
    const Placeholder = (props: { nodeKey: string }) => {
      const application = () => desktopApplications.find(app => app.id === (editor.node(props.nodeKey)?.payload.metadata as any)?.application);
      const windowKey = editor.blockQueries.ancestors(props.nodeKey).find(node => node.viewType === "window-block")?.key;
      let root!: HTMLDivElement;
      onMount(() => onCleanup(editor.mounts.register(props.nodeKey, {
        root, focusElement: root, inputPolicy: "opaque-widget", focus: () => root.focus({ preventScroll: true }),
      })));
      return <div ref={root} tabIndex={-1} class="desktop-application-placeholder" data-desktop-placeholder={application()?.id}>
        <Show when={application()}>{app => <>
          <img src={desktopIcon(app().id)} width="80" height="80" alt="" draggable={false} />
          <h2>{app().name}</h2><p>{app().name} is not yet available in Mutable OS.</p>
        </>}</Show>
        <button type="button" onClick={() => { if (windowKey) editor.closeView(windowKey); }}>Close</button>
      </div>;
    };
    scope.own(editor.registry.register({ type: "desktop-application-placeholder-block", capabilities: ["opaque-widget"], view: Placeholder }, scope.owner));
  } };
}

export function openDesktopPlaceholder(session: WorkspaceSession, application: DesktopApplication) {
  const { editor, projection, windowManager: manager } = session;
  const state = editor.repository.readState(), root = state.rootPlacementKey;
  const host = state.contents[state.placements[root].contentKey];
  const desktop = host.children.find(key => ["image-background-block", "canvas-background-block", "video-background-block", "youtube-video-background-block"].includes(state.contents[state.placements[key].contentKey].viewType)) ?? root;
  // Inspect direct Desktop windows only, on an explicit launch. No Document scan.
  const existing = state.contents[state.placements[desktop].contentKey].children.find(key => {
    const content = state.contents[state.placements[key].contentKey];
    return content.viewType === "window-block" && (content.payload.metadata as any)?.desktopApplication === application.id;
  });
  if (existing) {
    const node = projection.nodeForPlacement(existing);
    // Close is presentation state in Mutable; reveal that same placement again.
    editor.viewVisibility.set(existing, false);
    if (node && manager) manager.lifecycle.reveal(node.key);
    else if (node) {
      editor.commands.setPayloadField(node.key, "metadata", { ...(node.payload.metadata as object), state: "normal" }, "Restore application placeholder");
      editor.focus.request(node.key, { reason: "desktop-application" });
    }
    return;
  }
  let placement!: string;
  editor.commands.structuralTransaction(`Open ${application.name} placeholder`, () => {
    placement = editor.commands.insert({ type: "window-block", metadata: {
      title: application.name, desktopApplication: application.id,
      position: { x: Math.max(16, Math.min(350, window.innerWidth - 456)), y: 80 },
      size: { w: Math.min(440, Math.max(280, window.innerWidth - 32)), h: 320 },
      zIndex: manager?.launchMetadata().zIndex ?? 102,
    }, children: [{ type: "desktop-application-placeholder-block", metadata: { application: application.id } }] }, { kind: "at", parentKey: desktop, index: 0 });
  });
  manager?.activatePlacement(placement);
}

export function DesktopApplicationIcons(props: { session: WorkspaceSession; actions?: DesktopActions; available?: () => boolean }) {
  const { editor, projection } = props.session;
  const [selected, setSelected] = createSignal<string>();
  const [notice, setNotice] = createSignal("");
  let launching = false, alive = true, root!: HTMLDivElement;
  onCleanup(() => { alive = false; });
  onMount(() => {
    const clear = (event: PointerEvent) => {
      const target = event.target;
      if (target === root) { setSelected(undefined); return; }
      if (!(target instanceof Element) || root.contains(target) || target.closest(".reactive-window")) return;
      if (target.closest("[data-workspace-background]") || target.matches('[data-window-work-area], [data-block-type="workspace-block"]')) setSelected(undefined);
    };
    document.addEventListener("pointerdown", clear, true);
    onCleanup(() => document.removeEventListener("pointerdown", clear, true));
  });
  const launch = async (application: DesktopApplication) => {
    if (launching || props.available?.() === false || !props.session.inputAvailable() || editor.windowManager?.lifecycle.workspaceBlocked) return;
    launching = true; setNotice("");
    try {
      if (application.id === "workbench" && props.actions?.workbench) props.actions.workbench();
      else if (application.id === "cavern" && props.actions?.cavern) props.actions.cavern();
      else if ("command" in application && editor.commandRegistry.owner(application.command) && (!("view" in application) || editor.features.flintSpatialGraph)) {
        await editor.commandRegistry.execute(application.command, { targetKey: projection.state.rootKey, args: "view" in application ? { view: application.view } : undefined });
      } else openDesktopPlaceholder(props.session, application);
    } catch (error) {
      if (alive) setNotice(`Could not open ${application.name}: ${error instanceof Error ? error.message : String(error)}`);
    } finally { launching = false; }
  };
  return <div ref={root} class="desktop-applications" role="group" aria-label="Desktop applications">
    <For each={desktopApplications}>{application => <button type="button" class="desktop-application" data-desktop-application={application.id}
      aria-label={application.name} aria-pressed={selected() === application.id} title={`Open ${application.name}`}
      onClick={event => { setSelected(application.id); if (event.detail === 0) void launch(application); }}
      onDblClick={event => { event.preventDefault(); void launch(application); }}>
      <img src={desktopIcon(application.id)} width="72" height="72" alt="" draggable={false} decoding="async" />
      <span>{application.name}</span>
    </button>}</For>
    <Show when={notice()}><p class="desktop-applications__notice" role="status">{notice()}</p></Show>
  </div>;
}
