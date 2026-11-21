import { Dynamic } from "solid-js/web";
import { definitionFor } from "./definition";
import { Show, createEffect, createMemo, createSignal, on, onMount } from "solid-js";
import { createFloatingWindowResize, FloatingWindowResizeHandle, type BlockRuntime } from "../../feature-api";
import { angles, objectSize, patchObject, presets, readObject, sizeProperties, type ObjectState, type ViewAngles } from "./model";
import { objectMenu } from "./menu";
import type { ObjectScene, SceneStatus } from "./scene-runtime";
import "./view.css";

export function ThreeDObjectView(props: { runtime: BlockRuntime }) {
  const runtime = props.runtime;
  const protectedState=createMemo(()=>runtime.authoredStateProtected());
  const authored = createMemo(() => readObject(runtime.field("object3D")));
  const [presentation,setPresentation]=createSignal<Partial<ObjectState>>({});
  createEffect(on(()=>[authored(),protectedState()] as const,()=>setPresentation({})));
  const state = createMemo(() => {const saved=authored();return saved?{...saved,...(protectedState()?presentation():{})}:undefined;});
  const size = createMemo(() => objectSize(runtime.field("blockProperties")));
  const [error, setError] = createSignal("");
  const [ready, setReady] = createSignal(false);
  const [canvasVersion, setCanvasVersion] = createSignal(1);
  let root!: HTMLDivElement, canvas!: HTMLCanvasElement, contact!: SVGGElement;
  let scene: ObjectScene | undefined, disposed = false, loading = false, generation = 0, visible = false;
  let width = 0, height = 0, reduced = false;
  let gesture: { id: number; x: number; y: number; start: ViewAngles; authored: string; moved: boolean } | undefined;
  let keys: { start: ViewAngles; authored: string } | undefined, keyTimer: ReturnType<typeof setTimeout> | undefined;
  const valid = () => !disposed && root?.isConnected && !root.closest("[hidden], [inert]");
  const change = (patch: Partial<ObjectState>, label: string) => {
    if (!valid() || !state()) return;
    if(protectedState()){
      if(Object.keys(patch).some(key=>!['view','autoRotate'].includes(key)))return;
      setPresentation(current=>({...current,...patch}));return;
    }
    if (patch.view) scene?.view(patch.view);
    const before = runtime.field("object3D"), next = patchObject(before, patch);
    if (JSON.stringify(before) !== JSON.stringify(next)) runtime.setField("object3D", next, label);
  };
  const resize = createFloatingWindowResize({ element: () => root, size, minimum: { width: 160, height: 160 }, maximum: { width: 640, height: 640 },
    aspectRatio: 1, scale: runtime.scale, constrainToViewport: false, enabled: () => !!valid() && !protectedState(),
    onCommit: next => {if(!protectedState())runtime.setField("blockProperties", sizeProperties(runtime.field("blockProperties"), next.width), "Resize 3D Object");},
  });
  createEffect(()=>{if(protectedState())resize.cancel();});
  const activity = () => scene?.activity(visible && !!valid(), reduced, !!gesture || !!keys || runtime.contextMenuOpen());
  const cancel = () => {
    const saved = gesture?.start ?? keys?.start, id = gesture?.id;
    gesture = undefined; keys = undefined; clearTimeout(keyTimer);
    if (id !== undefined && canvas?.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    if (saved) scene?.view(saved);
    activity();
  };
  const updateStatus = (status: SceneStatus) => {
    if (disposed) return;
    root.dataset.frames = String(status.frames); root.dataset.geometries = String(status.geometries);
    const p = status.contact; contact?.setAttribute("transform", `translate(${p.x} ${p.y}) scale(${p.rx} ${p.ry})`);
    if (!valid()) { cancel(); resize.cancel(); activity(); }
  };
  const destroy = () => { generation++; loading = false; cancel(); scene?.dispose(); scene = undefined; setReady(false); if (!disposed) setCanvasVersion(v => v + 1); };
  const start = async () => {
    if (disposed || scene || loading || !visible || !width || !height || !state() || error()) return;
    loading = true; const ticket = ++generation;
    try {
      const { createObjectScene } = await import("./scene-runtime");
      if (disposed || ticket !== generation) return;
      const content = await definitionFor(state()!.scene)!.create();
      if (disposed || ticket !== generation) { content.dispose(); return; }
      try { scene = createObjectScene(canvas, state()!, content, updateStatus, message => { cancel(); setError(message); setReady(false); }); }
      catch (error) { content.dispose(); throw error; }
      scene.size(width, height); setReady(true); activity();
    } catch { if (!disposed && ticket === generation) setError("This object needs WebGL 2. Graphics could not start; your saved object is unchanged."); }
    finally { if (ticket === generation) loading = false; }
  };
  const retry = () => { destroy(); setError(""); void start(); };
  const menu = (event: MouseEvent | KeyboardEvent) => {
    if ((event.target as Element)?.closest("input, textarea, select")) return;
    event.preventDefault(); event.stopPropagation(); cancel(); resize.cancel();
    runtime.openContextMenu(event instanceof MouseEvent && (event.type === "contextmenu" || event.detail !== 0) ? { x: event.clientX, y: event.clientY } : undefined);
  };
  const down = (event: PointerEvent) => {
    if (!scene || !valid() || gesture || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    canvas.focus({ preventScroll: true });
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, start: scene.view(), authored: JSON.stringify(runtime.field("object3D")), moved: false };
    canvas.setPointerCapture(event.pointerId); activity(); event.preventDefault(); event.stopPropagation();
  };
  const move = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!valid()) { cancel(); return; }
    const rect = canvas.getBoundingClientRect(), dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture.moved ||= Math.hypot(dx, dy) > 2;
    scene?.view(angles({ azimuth: gesture.start.azimuth - dx / Math.max(1, rect.width) * 180, elevation: gesture.start.elevation + dy / Math.max(1, rect.height) * 70 }));
    event.preventDefault(); event.stopPropagation();
  };
  const up = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const current = gesture, next = scene?.view(); gesture = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (current.moved && next && valid() && current.authored === JSON.stringify(runtime.field("object3D"))) change({ view: angles(next), autoRotate: false }, "Orbit 3D Object");
    activity(); event.stopPropagation();
  };
  const commitKeys = () => {
    const snapshot = keys, next = scene?.view(); keys = undefined; clearTimeout(keyTimer);
    if (snapshot && next && valid() && snapshot.authored === JSON.stringify(runtime.field("object3D"))) change({ view: angles(next), autoRotate: false }, "Orbit 3D Object");
    activity();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) { menu(event); return; }
    if (event.target !== canvas || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { cancel(); event.preventDefault(); event.stopPropagation(); return; }
    if (event.key === "Home") { cancel(); change({ view: presets["Three-quarter"], autoRotate: false }, "Reset 3D View"); event.preventDefault(); event.stopPropagation(); return; }
    if (!scene || !valid() || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    keys ??= { start: scene.view(), authored: JSON.stringify(runtime.field("object3D")) };
    const current = scene.view(), step = event.shiftKey ? 1 : 5;
    scene.view(angles({ azimuth: current.azimuth + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), elevation: current.elevation + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0) }));
    clearTimeout(keyTimer); keyTimer = setTimeout(commitKeys, 300); activity(); event.preventDefault(); event.stopPropagation();
  };
  createEffect(on(state, next => {
    if (gesture || keys) cancel();
    if (next) { scene?.update(next); void start(); } else if (scene || loading) destroy();
  }));
  createEffect(() => { runtime.contextMenuOpen(); activity(); });
  onMount(() => {
    runtime.mountWidget(root, { contextActions: () => objectMenu(state(), change, () => scene?.fit(), () => scene?.view() ?? state()!.view,protectedState()) });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)"); reduced = media.matches;
    const measure = () => { width = root.clientWidth; height = root.clientHeight; scene?.size(width, height); void start(); };
    const observer = new ResizeObserver(measure); observer.observe(root);
    const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; if (!visible) { cancel(); resize.cancel(); } activity(); void start(); }); intersection.observe(root);
    const preference = () => { reduced = media.matches; activity(); };
    const visibility = () => { if (document.hidden) { cancel(); resize.cancel(); } activity(); };
    const focus = () => { if (keys && document.activeElement !== canvas) cancel(); activity(); };
    media.addEventListener("change", preference); document.addEventListener("visibilitychange", visibility); document.addEventListener("focusin", focus);
    const blur = () => { cancel(); resize.cancel(); }; window.addEventListener("blur", blur);
    // Hosts can suspend interaction with the standard inert attribute. Watch
    // only this occurrence's ancestry, without depending on a presentation type.
    const handoff = new MutationObserver(() => { if (!valid()) { cancel(); resize.cancel(); } activity(); });
    for (let parent = root.parentElement; parent; parent = parent.parentElement) handoff.observe(parent, { attributes: true, attributeFilter: ["inert", "hidden"] });
    measure();
    runtime.own(() => { observer.disconnect(); intersection.disconnect(); handoff?.disconnect(); media.removeEventListener("change", preference); document.removeEventListener("visibilitychange", visibility); document.removeEventListener("focusin", focus); window.removeEventListener("blur", blur); });
  });
  runtime.own(() => { disposed = true; destroy(); resize.cancel(); });
  const gradient = `object-contact-${runtime.nodeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  return <div ref={root} class="abstract-block three-d-object" tabIndex={-1} role="group" aria-label={`3D Object — ${definitionFor(state()?.scene ?? "")?.label ?? "Unavailable"}`}
    data-block-id={String(runtime.field("id") ?? "")} data-runtime-key={runtime.nodeKey} data-client-id={runtime.nodeKey} data-block-type="3d-object-block" data-ready={ready()}
    style={{ "max-width": `${resize.dimensions().width}px` }} onContextMenu={menu} onClick={event => { if (event.ctrlKey && event.button === 0) menu(event); }} onKeyDown={keyDown}>
    <Show when={state()}>{value => <Dynamic component={definitionFor(value().scene)!.surface} id={gradient} settings={value().settings} contact={element => { contact = element; }} />}</Show>
    <Show when={canvasVersion()} keyed>{_version => <canvas ref={canvas} class="three-d-object__canvas" tabIndex={0} aria-label="3D object. Drag to orbit; arrows adjust the view; Home resets; Shift F10 opens the menu."
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture) cancel(); }} />}</Show>
    <button class="three-d-object__menu" type="button" aria-label="3D Object menu" onClick={menu}>•••</button>
    <Show when={!protectedState()}><FloatingWindowResizeHandle controller={resize} label="Resize 3D Object" class="three-d-object__resize" /></Show>
    <Show when={!state() || error()}><div class="three-d-object__fallback" role="status"><span>{!state() ? "This 3D object type or version is unavailable. Its saved data is preserved." : error()}</span><Show when={state()}><button type="button" onClick={retry}>Retry graphics</button></Show></div></Show>
  </div>;
}
