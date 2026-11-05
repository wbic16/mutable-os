import {TextualApplications} from '../features/textual/applications';
import {applicationPresentations} from './application-presentations';
import {InstrumentPresentationContext} from '../rendering/instrument-presentations';
import {TextualLer,TextualCompletion} from '../features/textual/entity-tools';
import {TextualGloss} from '../features/textual/gloss';
import {ownApplicationPresentationSurface} from '../rendering/application-presentation-surface';
import { TextualFlint } from '../features/textual/flint';
import { documentApplicationPorts } from './document-application-ports';
import { TextualWorkspace } from "../features/textual/view";
import { ErrorBoundary, Suspense, lazy, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ReactiveViewProvider } from "../reactive-editor/context";
import { BlockOutlet } from "../rendering/block-outlet";
import { ReactiveViewLayers } from "../rendering/reactive-tree-view";
import { BackgroundMedia } from "../rendering/background-media";
import type { WindowGeometryHost, WindowResizePort } from "../rendering/window-geometry";
import type { WorkspaceSession } from "./workspace-session";
import { CanvasView } from "../features/canvas/view";
import { createCanvasInteractions } from "../features/canvas/interactions";
import { canvasActions } from "./canvas-actions";
import "./workspace-presentation.css";
import { DetachedDocumentWindows } from "./document-detachment";
import { WindowManagerPlane } from "../rendering/window-manager";
import { DesktopApplicationIcons, type DesktopActions } from "./desktop-applications";

const SpatialView = lazy(() => import("../features/spatial/view"));

/** One provider and one overlay set survive switches; only active roots mount. */
export function WorkspacePresentationView(props: { session: WorkspaceSession; desktopActions?: DesktopActions; desktopAvailable?: () => boolean }) {
  const { editor, projection, presentation } = props.session;
  const TextualApplication = (p:{grid:import("../features/textual/grid").TextualGrid}) => editor.features.applicationPresentations?<TextualApplications session={props.session} grid={p.grid}/>:<TextualFlint session={props.session} grid={p.grid}/>;
  createEffect(()=>props.session.windowManager?.layout.setEnabled(presentation.active()==="desktop"));
  const canvas = createMemo(() => presentation.read()?.presentations.canvas);
  const roots = createMemo(() => presentation.active() === "canvas" ? props.session.canvasRoots() : []);
  const input = createCanvasInteractions({ layout: canvas, available: () => props.session.inputAvailable(), camera: value => presentation.setCamera(value), bounds: (id, value) => presentation.setBounds(id, value) });
  const resizePorts = new Map<string, WindowResizePort>();
  const [resizeRevision, setResizeRevision] = createSignal(0);
  const resizePort = (id: string) => { resizeRevision(); return resizePorts.get(id); };
  const geometry = (key: string): WindowGeometryHost | undefined => {
    const root = roots().find(item => item.nodeKey === key);
    if (!root) return;
    const id = root.placement.id;
    return { static: true, position: () => ({ x: 0, y: 0 }),
      expandedSize: () => { const b = input.bounds(id) ?? root.placement.bounds; return { width: b.width, height: b.height }; },
      move: () => {}, resize: () => {},
      bindResize: port => { resizePorts.set(id, port); setResizeRevision(n => n + 1); return () => { resizePorts.delete(id); setResizeRevision(n => n + 1); }; },
    };
  };
  const actions = canvasActions(props.session);
  onMount(() => onCleanup(props.session.installPresentationInput(window)));
  const CanvasLifetime = () => {
    onMount(() => onCleanup(props.session.ownPresentationInteraction(input)));
    return null;
  };
  const DesktopHost = () => <div style={{display: presentation.active() === "textual" ? "none" : "contents"}} inert={presentation.active() === "textual"}><BlockOutlet nodeKey={projection.state.rootKey} /></div>;
  const [spatialResize, setSpatialResize] = createSignal<WindowResizePort>();
  const spatialGeometry = (key: string): WindowGeometryHost | undefined => {
    const actions = props.session.spatial;
    if (!actions || actions.activeRoot()?.nodeKey !== key) return;
    return { static: true, position: () => ({ x: 0, y: 0 }), expandedSize: actions.document.size,
      move: () => {}, resize: () => {}, bindResize: port => { setSpatialResize(port); return () => setSpatialResize(undefined); } };
  };
  const SpatialHost = () => {
    const actions = props.session.spatial!;
    const DocumentSlot = () => {
      onMount(actions.documentReady);
      return <Show when={actions.activeRoot()} keyed>{root => <BlockOutlet nodeKey={root.nodeKey} />}</Show>;
    };
    return <SpatialView deskObjects={editor.features.spatialDeskObjects} probe={editor.features.presentationProbe} port={{ layout: actions.layout, objects: actions.objects, selected: actions.selected, select: actions.select,
      camera: actions.camera, arrange: actions.arrange, available: actions.available, ownInteraction: actions.ownInteraction, returnDesktop: actions.returnDesktop,
      document: actions.document, renderDocument: () => <DocumentSlot />, displayedSize: () => spatialResize()?.presentedSize() }} />;
  };
  return <InstrumentPresentationContext.Provider value={()=>presentation.active()==='textual'?{entityEntry:'query',ler:TextualLer,completion:TextualCompletion,gloss:TextualGloss}:undefined}><WindowManagerPlane manager={props.session.windowManager} suspended={presentation.active() === "textual"}><ReactiveViewProvider editor={editor} projection={projection}
    coordinates={{ scale: () => presentation.active() === "canvas" ? input.camera().zoom : 1 }}
    windowGeometry={key => presentation.active() === "canvas" ? geometry(key) : presentation.active() === "spatial" ? spatialGeometry(key) : undefined}>
    <Show when={editor.features.desktopApplicationIcons && presentation.active() === "desktop"}>
      <DesktopApplicationIcons session={props.session} actions={props.desktopActions} available={props.desktopAvailable} />
    </Show>
    <Show when={presentation.active() === "canvas"} fallback={<Show when={presentation.active() === "spatial" && props.session.spatial} fallback={<DesktopHost />}>
      <ErrorBoundary fallback={(error, reset) => <div role="alert">Spatial could not load: {String(error)} <button onClick={reset}>Retry</button><button onClick={() => props.session.selectPresentation("desktop")}>Return to Desktop</button></div>}>
        <Suspense fallback={<p role="status">Opening the study…</p>}><SpatialHost /></Suspense>
      </ErrorBoundary>
    </Show>}>
      <CanvasLifetime />
      <CanvasView probe={editor.features.presentationProbe} port={{ layout: canvas, roots, interactions: input, available: () => props.session.inputAvailable(), ...actions,
        setCamera: value => presentation.setCamera(value),
        displayedSize: id => resizePort(id)?.presentedSize(),
        resize: id => { const p = resizePort(id); return p && { size: p.presentedSize(), minimum: p.minimum(), expanded: p.toExpanded }; },
        render: key => roots().some(root => root.nodeKey === key) ? <BlockOutlet nodeKey={key} /> : null,
        background: () => <Show when={canvas()?.background}>{background => <BackgroundMedia type={background().type} metadata={background().metadata} />}</Show>,
      }} />
    </Show>
    <Show when={props.session.documentSessions?.detachment}>{controller=><DetachedDocumentWindows controller={controller()}/>}</Show>
    <ReactiveViewLayers editor={editor} projection={projection} />
    <Show when={presentation.active() === "textual"}><TextualWorkspace fontSettings={editor.features.textualFontSettings} ownSurface={element=>props.session.windowManager?ownApplicationPresentationSurface(props.session.windowManager,element):()=>{}} application={TextualApplication} beforeZoom={()=>{if(editor.features.applicationPresentations){applicationPresentations(editor).remember();return;}for(const port of documentApplicationPorts(editor).ports()){const session=port.session();if(session)editor.documentSessions?.presentations.remember(session);}}} returnDesktop={() => props.session.selectPresentation("desktop")} notice={props.session.notice()} /></Show>
  </ReactiveViewProvider></WindowManagerPlane></InstrumentPresentationContext.Provider>;
}
