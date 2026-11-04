import { WindowLayoutChrome } from "./window-layout";
import { createContext, createEffect, onCleanup, onMount, useContext, type JSX, untrack } from "solid-js";
import { Portal } from "solid-js/web";
import { windowManagerForDocument } from "../application/window-lifecycle";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { WorkspaceWindowManager } from "../application/window-manager";
import type { SurfaceKind } from "../runtime/window-manager";
import { useDocumentSession } from "./document-session-context";
import "./window-manager.css";

interface OwnerContext { manager: WorkspaceWindowManager; windowId: string; surfaceId?: string; modal?: boolean }
const WindowOwner = createContext<OwnerContext>();
/** Stable context object: consumers read the committed host through getters. */
export function DocumentSessionWindowOwner(props: { session: import("../application/document-sessions").RetainedDocumentSession; manager?: WorkspaceWindowManager; children: JSX.Element }) {
  if (!props.manager) return props.children;
  const owner: OwnerContext = { manager: props.manager, get windowId() { return props.session.host.windowId; } };
  return <WindowOwner.Provider value={owner}>{props.children}</WindowOwner.Provider>;
}
export const useManagedWindowOwner = () => useContext(WindowOwner);
/** Reactive per-owner activity; consumers may suspend optional work without unmounting. */
export const useManagedViewActivity = () => {
  const owner=useContext(WindowOwner), session=useDocumentSession();
  return () => session ? session.host.activity() : owner ? owner.manager.registry.windows[owner.windowId] : {mounted:true,visible:true,active:true};
};

/** Own an existing inline app dialog without moving its DOM or changing its
 * content/dismissal contract. The lifecycle coordinator contains focus and input. */
export function ApplicationSurfaceBoundary(props: { children: JSX.Element }) {
  const owner = useContext(WindowOwner);
  if (!owner) return props.children;
  const id=owner.manager.nextSurfaceId();
  const release=owner.manager.registry.registerSurface({id,ownerWindowId:owner.windowId,sourceViewId:owner.manager.registry.windows[owner.windowId].sourceViewId,parentSurfaceId:owner.surfaceId,kind:"dialog",modality:"window"});
  onCleanup(release);
  let root!: HTMLDivElement;
  onMount(() => {
    root.querySelector('[role="dialog"]')?.setAttribute('aria-modal','false');
    onCleanup(owner.manager.lifecycle.modal(root, owner.windowId, owner.surfaceId,id));
  });
  return <WindowOwner.Provider value={{ ...owner, surfaceId:id, modal: true }}><div ref={root} style={{display:"contents"}}>{props.children}</div></WindowOwner.Provider>;
}

export function WindowManagerPlane(props: { manager?: WorkspaceWindowManager; suspended?: boolean; children: JSX.Element }) {
  if (!props.manager) return props.children;
  const plane = document.createElement("div");
  plane.className = "mwm-window-plane";
  createEffect(() => { plane.hidden = !!props.suspended; plane.inert = !!props.suspended; });
  props.manager.plane = plane;
  props.manager.lifecycle.install(document);
  onMount(()=>{props.manager!.geometry.install(plane);props.manager!.named.finishRestoration();});
  onCleanup(() => { if (props.manager?.plane === plane) { props.manager.geometry.dispose(); props.manager.lifecycle.uninstall(); props.manager.plane = undefined; } });
  return <>{plane}<Portal mount={plane}><WindowLayoutChrome manager={props.manager}/></Portal>{props.children}</>;
}

/** Stable parent for a frame and all its portalled children. No transform here:
 * fixed-position tools retain viewport coordinates while sharing the owner rank.
 */
export function ManagedWindowFrame(props: {
  manager: WorkspaceWindowManager; nodeKey: string;
  mounted: boolean; visible: boolean; viewport?: boolean; children: JSX.Element;
}) {
  const manager = props.manager, group = document.createElement("div");
  group.className = `mwm-window-group${props.viewport ? " mwm-window-group--viewport" : ""}`; group.dataset.mwmWindow = props.nodeKey; group.id=`mwm-panel-${props.nodeKey}`;
  const lease = manager.register(props.nodeKey, group);
  createEffect(() => { group.style.zIndex = String(manager.groupRank(props.nodeKey)); });
  createEffect(() => {const hidden=manager.layout.hidden(props.nodeKey);group.hidden=!!hidden;group.inert=!!hidden;lease.activity(props.mounted, props.visible&&!hidden);});
  onCleanup(() => {
    lease.release(); group.remove();
  });
  manager.plane!.append(group);
  onMount(()=>manager.lifecycle.refreshInert());
  return <WindowOwner.Provider value={{ manager, windowId: props.nodeKey }}><Portal mount={group}>{props.children}</Portal></WindowOwner.Provider>;
}

/** Shared ownership/layer adapter only. The existing overlay/component remains
 * responsible for content, placement, focus, dismissal and request cancellation.
 */
export function ApplicationSurfacePortal(props: {
  /** Opt in only after qualifying local state, anchoring and request lifetimes. */
  documentTransfer?: "retained";
  editor?: ReactiveEditor; ownerKey?: string; sourceViewId?: string;
  id?: string; kind?: SurfaceKind; legacyInline?: boolean; children: JSX.Element;
}) {
  const inherited = useContext(WindowOwner), documentSession = useDocumentSession() ?? (props.ownerKey ? props.editor?.documentSessions?.forNode(props.ownerKey) : undefined);
  const manager = props.editor?.windowManager ?? inherited?.manager;
  const initialWindowId = untrack(() => props.ownerKey ? manager?.ownerForNode(props.ownerKey) ?? inherited?.windowId : inherited?.windowId);
  const windowId = () => documentSession ? documentSession.host.windowId : initialWindowId;
  const group = windowId() ? manager?.groups.get(windowId()!) : manager?.plane;
  if (!manager || !group) return props.legacyInline ? props.children : <Portal>{props.children}</Portal>;
  const id = props.id ?? manager.nextSurfaceId(), kind = props.kind ?? "overlay";
  const host = document.createElement("div");
  host.className = `mwm-surface mwm-surface--${kind}`;
  if (inherited?.modal) { host.style.zIndex = "5"; host.dataset.mwmModal = inherited.surfaceId; }
  host.dataset.mwmSurface = id;
  const release = manager.registry.registerSurface({ id, ownerWindowId: windowId(), sourceNodeKey: props.ownerKey,
    sourceViewId: props.sourceViewId ?? (windowId() ? manager.registry.windows[windowId()!].sourceViewId : "workspace-shell"),
    parentSurfaceId: inherited?.windowId === windowId() ? inherited?.surfaceId : undefined, kind, modality: "none" });
  group.append(host);
  if (documentSession) { host.dataset.documentSession = documentSession.id; onCleanup(documentSession.ownSurface({ id, element: host, transferable: props.documentTransfer === "retained" })); }
  onMount(()=>manager.lifecycle.refreshInert());
  createEffect(() => {
    const target = documentSession?.host.port?.surfaceContainer ?? (windowId() ? manager.groups.get(windowId()!) : manager.plane);
    if(target && host.parentElement !== target)target.append(host);
    const visible = (windowId() ? manager.registry.windows[windowId()!]?.visible ?? false : true)
      && (!documentSession || documentSession.host.activity().visible);
    if (!windowId()) { manager.registry.revision(); host.style.zIndex = String(manager.count() * 2 + 2); }
    host.hidden = !visible;
    host.inert = !visible;
  });
  onCleanup(() => { release(); host.remove(); });
  return windowId() ? <WindowOwner.Provider value={{ manager, get windowId() { return windowId()!; }, surfaceId: id, modal: inherited?.modal }}><Portal mount={host}>{props.children}</Portal></WindowOwner.Provider>
    : <Portal mount={host}>{props.children}</Portal>;
}

/** Existing shell prompts keep their DOM and global scope; register only while open. */
export function WorkspaceModalBoundary(props:{children:JSX.Element}) {
  const manager=windowManagerForDocument(document);if(!manager)return props.children;
  let root!:HTMLDivElement;
  onMount(()=>onCleanup(manager.lifecycle.modal(root)));
  return <div ref={root} style={{display:"contents"}}>{props.children}</div>;
}

/** Hide the stable body only in the managed path; legacy DOM remains unchanged. */
export function RetainedWindowBody(props:{enabled:boolean;hidden:boolean;children:JSX.Element}) {
  if(!props.enabled)return props.children;
  let body!:HTMLDivElement;
  createEffect(()=>{body.inert=props.hidden;});
  return <div ref={body} class="mwm-retained-body" hidden={props.hidden}>{props.children}</div>;
}
