import { Dynamic } from "solid-js/web";
import { immutable } from "../runtime/effect-contributions";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ApplicationSurfacePortal, useManagedWindowOwner, useManagedViewActivity } from "./window-manager";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { OverlayDescriptor } from "../runtime/overlays";
import type { AnnotationAction, AnnotationPatch } from "../block-tree/annotation-commands";
import { inlineSlice, inlineText, logicalInline } from "../block-tree/inline-sequence";
import { createFloatingWindowResize, FloatingWindowResizeHandle, type FloatingWindowSize } from "./floating-window-resize";
import "./annotation-monitor.css";

function Monitor(props: { editor: ReactiveEditor; overlay: OverlayDescriptor }) {
  const { editor, overlay } = props;
  const owner = useManagedWindowOwner(), activity = useManagedViewActivity();
  const node = () => editor.node(overlay.ownerKey);
  const source = node()?.payload.standoffProperties as Array<Record<string, unknown>> | undefined;
  const [items, setItems] = createSignal((overlay.annotationIndexes ?? []).filter(index => source?.[index]).map(index => ({ index, property: JSON.parse(JSON.stringify(source![index])) as Record<string, unknown> })));
  const visible = () => items().filter(item => !editor.linkedAnnotations.resolve(item.property, node()?.contentKey).isDeleted);
  const [active, setActive] = createSignal(0);
  const selected = () => visible()[Math.min(active(), visible().length - 1)];
  const resolvedProperty = () => { const property = selected()?.property; return property && editor.linkedAnnotations.resolve(property, node()?.contentKey); };
  const linkedDetails = createMemo(() => {
    const ids = new Set(visible().map(item => item.property.annotationId).filter((id): id is string => typeof id === "string"));
    return new Map([...ids].map(id => {
      const segments = editor.linkedAnnotations.segments(id, visible().find(item => item.property.annotationId === id)?.property, node()?.contentKey).map(segment => {
        const state = editor.repository.state, content = state.contents[segment.contentKey];
        const text = segment.property.isZeroWidth ? "" : inlineText(inlineSlice(logicalInline(state, content), Number(segment.property.start), Number(segment.property.end) + 1));
        return { ...segment, text, current: segment.contentKey === node()?.contentKey && segment.index === selected()?.index };
      });
      return [id, { segments, blocks: new Set(segments.map(segment => segment.contentKey)).size }] as const;
    }));
  });
  const linked = () => linkedDetails().get(String(selected()?.property.annotationId));
  const [start, setStart] = createSignal(""); const [end, setEnd] = createSignal("");
  const [value, setValue] = createSignal(""); const [metadata, setMetadata] = createSignal(""); const [attributes, setAttributes] = createSignal("");
  const [error, setError] = createSignal(""); const [position, setPosition] = createSignal(overlay.anchor);
  const [sessionSize, setSessionSize] = createSignal<FloatingWindowSize>();
  let root!: HTMLDivElement; let editing = false;
  let manualPosition = false;
  let gesture: { id: number; x: number; y: number; left: number; top: number } | undefined;
  const close = () => editor.overlays.close(overlay.key);
  const clamp = () => {
    if (!root?.isConnected || !activity()?.visible) return;
    const rect = root.getBoundingClientRect();
    const start = Number(selected()?.property.start);
    const flow = editor.mounts.get(overlay.ownerKey)?.root.querySelector(".reactive-standoff-flow");
    const cell = Number.isInteger(start) ? flow?.children[start] : undefined;
    // A Cell can have multiple visual fragments. Anchor to its first fragment,
    // not the annotation's overall rectangle or the current caret position.
    const fragment = cell?.getClientRects()[0];
    const anchor = manualPosition ? position() : fragment ? { x: fragment.left - 100, y: fragment.bottom + 21 } : overlay.anchor;
    setPosition({ x: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8)) });
  };
  let anchorFrame = 0;
  const scheduleAnchor = () => { if (!anchorFrame) anchorFrame = requestAnimationFrame(() => { anchorFrame = 0; clamp(); }); };
  createEffect(() => {
    activity()?.visible;
    if (owner) owner.manager.geometry.controllers.get(owner.windowId)?.rectangle();
    scheduleAnchor();
  });
  onCleanup(() => { if (anchorFrame) cancelAnimationFrame(anchorFrame); });
  const monitorResize = createFloatingWindowResize({
    element: () => root,
    size: () => sessionSize() ?? { width: root ? root.getBoundingClientRect().width : 960, height: root ? root.getBoundingClientRect().height : 600 },
    minimum: { width: 320, height: 180 },
    onCommit: setSessionSize,
  });
  const displaySize = () => monitorResize.preview() ?? sessionSize();
  const beginGesture = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    event.preventDefault(); manualPosition = true;
    const rect = root.getBoundingClientRect();
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const moveGesture = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture, dx = event.clientX - g.x, dy = event.clientY - g.y;
    setPosition({ x: g.left + dx, y: g.top + dy });
    clamp();
  };
  const endGesture = () => { gesture = undefined; };
  onMount(() => {
    // Modeless: app switching does not discard pending inspector fields.
    if (owner) editor.overlays.setDocumentInput(overlay.key, true);
    const custom = (event: Event) => { if (!(event instanceof CustomEvent)) return; if (editor.bindings.dispatchCustom(event.detail?.name, inputScopes(event.target as Element), id => runInput(id, event.target as Element), event.detail?.payload)) { event.preventDefault(); event.stopPropagation(); } };
    root.addEventListener("speedy-input", custom);
    onCleanup(() => root.removeEventListener("speedy-input", custom));
    const disposeMount = editor.mounts.register(overlay.key, { root, focusElement: root, inputPolicy: "opaque-widget", focus: () => root.focus({ preventScroll: true }) });
    // Window launches/geometry are not edits to the inspected annotation.
    // Keep the form alive; source edits still invalidate its captured ranges.
    const sourceKey = node()?.contentKey;
    const disposeChanges = owner ? editor.repository.subscribeChanges(change => {
      if (!editing && (!node() || sourceKey && (change.inlineOwner === sourceKey || change.previousContents.has(sourceKey))))
        editor.overlays.close(overlay.key, false);
    }) : editor.repository.subscribeBeforeChanges(() => { if (!editing) close(); });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(clamp) : undefined;
    observer?.observe(root); clamp(); window.addEventListener("resize", clamp);
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !root.contains(event.target)) clamp(); };
    document.addEventListener("scroll", scroll, true);
    onCleanup(() => { disposeMount(); disposeChanges(); observer?.disconnect(); window.removeEventListener("resize", clamp); document.removeEventListener("scroll", scroll, true); });
  });
  createEffect(() => {
    const p = resolvedProperty();
    setStart(String(p?.start ?? "")); setEnd(String(p?.end ?? "")); setValue(String(p?.value ?? ""));
    setMetadata(JSON.stringify(p?.metadata ?? {}, null, 2)); setAttributes(JSON.stringify(p?.attributes ?? {}, null, 2)); setError("");
    editor.overlays.previewAnnotation(overlay.key, p && !p.isZeroWidth ? { start: Number(p.start), end: Number(p.end) } : undefined);
    queueMicrotask(clamp);
  });
  const apply = (action: AnnotationAction | AnnotationPatch, item = selected()) => {
    if (!item) return false;
    const previous = selected()?.index;
    try {
      editing = true;
      const property = editor.linkedAnnotations.edit(overlay.ownerKey, item.index, item.property, action);
      setItems(items => items.map(row => row.index === item.index ? { ...row, property } : row));
      const retained = visible().findIndex(row => row.index === previous);
      setActive(index => retained >= 0 ? retained : Math.min(index, Math.max(0, visible().length - 1)));
      setError("");
      if (action === "delete") queueMicrotask(() => {
        if (!root.contains(document.activeElement)) focusAnnotation();
      });
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); return false; }
    finally { editing = false; }
  };
  const focusAnnotation = () => {
    const buttons = root.querySelectorAll<HTMLButtonElement>(".annotation-select");
    (buttons[Math.min(active(), buttons.length - 1)] ?? root).focus({ preventScroll: true });
  };
  const save = () => {
    try {
      const p = resolvedProperty()!;
      const object = (text: string) => {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Metadata and attributes must be JSON objects");
        return parsed;
      };
      const m = object(metadata()), a = object(attributes());
      if (!start().trim() || !end().trim()) throw new Error("Enter both range endpoints");
      const applied = apply({ start: Number(start()), end: Number(end()), ...(p.value !== undefined || value() ? { value: value() } : {}),
        ...(p.metadata !== undefined || Object.keys(m).length ? { metadata: m } : {}), ...(p.attributes !== undefined || Object.keys(a).length ? { attributes: a } : {}) });
      if (applied) close();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  };
  const runInput = (id: string, target: Element): boolean | void => {
    if (id === "monitor.close") { close(); return; }
    if (target.closest("input, textarea, select")) return false;
    if (id === "monitor.undo" || id === "monitor.redo") { close(); if (id === "monitor.redo") editor.repository.redo(); else editor.repository.undo(); return; }
    if (id.startsWith("annotation.")) { apply(id.slice(11) as AnnotationAction); return; }
    if (id.startsWith("monitor.control") && id !== "monitor.controls") {
      const buttons = [...root.querySelectorAll<HTMLButtonElement>(".annotation-actions button")];
      const index = buttons.indexOf(target as HTMLButtonElement);
      if (id === "monitor.controlLeft" && index === 0) focusAnnotation();
      else buttons[(index + (["monitor.controlLeft", "monitor.controlUp"].includes(id) ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      return;
    }
    if (["monitor.previous", "monitor.next"].includes(id) && visible().length) {
      setActive((active() + (id === "monitor.next" ? 1 : -1) + visible().length) % visible().length); focusAnnotation(); return;
    }
    if (id === "monitor.controls") { root.querySelector<HTMLButtonElement>(".annotation-actions button")?.focus(); return; }
    return false;
  };
  const inputScopes = (target: Element) => [
    ...(target.closest(".annotation-actions") ? ["monitor/actions"] : target === root || target.closest("nav") ? ["monitor/list"] : []), "monitor",
  ];
  const keys = (event: KeyboardEvent | MouseEvent) => {
    event.stopPropagation();
    editor.bindings.dispatch(event, inputScopes(event.target as Element), id => runInput(id, event.target as Element));
  };
  const excerpt = () => {
    const p = selected()?.property;
    return p && !p.isZeroWidth ? node()?.inlineContent.slice(Number(p.start), Number(p.end) + 1).map(key => String(editor.node(key)?.payload.text ?? "\uFFFC")).join("") : "";
  };
  return <div ref={root} class="reactive-annotation-monitor" role="dialog" aria-label="Annotations at caret" tabIndex={-1}
    data-session-overlay={overlay.key} data-native-context-menu onKeyDown={keys} onClick={keys} onDblClick={keys} onContextMenu={keys}
    style={{ left: `${position().x}px`, top: `${position().y}px`, ...(displaySize() ? { width: `${displaySize()!.width}px`, height: `${displaySize()!.height}px` } : {}) }}>
    <header onPointerDown={event => beginGesture(event)} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={endGesture}><strong>Annotations at caret</strong><button type="button" aria-label="Close annotation monitor" onClick={close}>×</button></header>
    <Show when={visible().length} fallback={<p>No active annotations at this caret.</p>}>
      <div class="annotation-layout">
      <nav aria-label="Annotations"><For each={visible()}>{(item, index) => <div class="annotation-row"><button class="annotation-select" type="button" aria-pressed={selected()?.index === item.index} onClick={() => setActive(index())}>{String(item.property.type ?? "Unknown annotation")} ({String(item.property.start)}–{String(item.property.end)})</button><button type="button" class="annotation-trash" aria-label={`Delete ${String(item.property.type)} annotation (${item.property.start}–${item.property.end})`} title="Delete this annotation" onClick={() => apply("delete", item)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg></button></div>}</For></nav>
      <form class="annotation-editor" onSubmit={event => { event.preventDefault(); save(); }}>
      <section class="annotation-main" aria-label="Annotation range and controls">
      <Show when={linked()}>{details => <div class="annotation-cross-block-summary" role="status">
        <strong>{details().blocks > 1 ? `Cross-Block annotation · ${details().blocks} Blocks` : "Linked annotation · 1 Block"}</strong>
        <div>{details().segments.length} linked ranges. The highlighted text and range controls below describe only the current range in this Block.</div>
      </div>}</Show>
      <Show when={selected()?.property.isZeroWidth}><p>Point annotation at boundary {start()}.</p></Show>
      <blockquote>{excerpt()}</blockquote>
      <label>Annotation ID<input readOnly value={String(selected()?.property.id ?? "Not supplied")} /></label>
      <Show when={selected()?.property.annotationId}>{id => <fieldset><legend>Linked annotation</legend>
        <label>Shared annotation ID<input readOnly value={String(id())} /></label>
        <small>Range controls/delete affect this segment. Value, Metadata and Attributes are shared by every segment.</small>
        <div class="annotation-segments"><table aria-label="Linked annotation ranges"><thead><tr><th>Block / range</th><th>Annotated text</th></tr></thead><tbody>
          <For each={linked()?.segments ?? []}>{segment => <tr aria-current={segment.current ? "true" : undefined}>
            <td><Show when={segment.current}><strong>Current range<br /></strong></Show><span>{String(segment.blockId ?? segment.contentKey)}</span><br />{String(segment.property.start)}–{String(segment.property.end)} (inclusive)</td>
            <td><blockquote>{segment.text}</blockquote></td>
          </tr>}</For>
        </tbody></table></div>
        <button type="button" onClick={() => {
          try { editing = true; editor.linkedAnnotations.deleteAll(String(id()), selected()?.property, node()?.contentKey); close(); }
          catch (error) { setError(error instanceof Error ? error.message : String(error)); }
          finally { editing = false; }
        }}>Delete whole linked annotation</button>
      </fieldset>}</Show>
      <div class="annotation-actions"><For each={[
        "left", "right", "previous-word", "next-word", "expand", "contract", "delete",
      ] as const}>{action => <span class="annotation-action"><kbd>{editor.bindings.label(`annotation.${action}`)}</kbd><button type="button" onClick={() => apply(action)}>{editor.bindings.get(`annotation.${action}`)!.name}</button></span>}</For></div>
        <div class="annotation-range"><label>{selected()?.property.isZeroWidth ? "Boundary" : "Start (inclusive)"}<input type="number" step="1" value={start()} onInput={event => setStart(event.currentTarget.value)} /></label><label>{selected()?.property.isZeroWidth ? "Stored endpoint" : "End (inclusive)"}<input type="number" step="1" value={end()} onInput={event => setEnd(event.currentTarget.value)} /></label></div>
        <small>Length: {selected()?.property.isZeroWidth ? 0 : Number(end()) - Number(start()) + 1} Cells. Previous/next annotation: {editor.bindings.label("monitor.previous")} / {editor.bindings.label("monitor.next")}. Controls: {editor.bindings.label("monitor.controls")}. Tab: next field; Enter/Space activates. Editing shortcuts apply outside text fields.</small>
        <label>Value<input value={value()} onInput={event => setValue(event.currentTarget.value)} /></label>
      </section>
      <section class="annotation-settings" aria-label="Annotation settings">
        <Show when={editor.annotationUI.get(String(resolvedProperty()?.type ?? ""))}>{definition => <Dynamic component={definition().details} property={() => { const property = resolvedProperty(); return property ? immutable(JSON.parse(JSON.stringify(property))) : undefined; }} />}</Show>
        <label>Metadata (JSON object)<textarea rows={3} value={metadata()} onInput={event => setMetadata(event.currentTarget.value)} /></label>
        <label>Attributes (JSON object)<textarea rows={3} value={attributes()} onInput={event => setAttributes(event.currentTarget.value)} /></label>
      </section>
        <footer><button type="submit">Apply changes</button></footer>
      </form>
      </div>
    </Show>
    <Show when={error()}><p role="alert">{error()}</p></Show>
    <FloatingWindowResizeHandle controller={monitorResize} class="annotation-resize" label="Resize annotation monitor" />
  </div>;
}

export function AnnotationMonitorLayer(props: { editor: ReactiveEditor; viewId: string }) {
  return <For each={props.editor.overlays.overlays.filter(overlay => overlay.viewType === "annotation-panel" && props.editor.node(overlay.ownerKey)?.viewId === props.viewId)}>{overlay =>
    <ApplicationSurfacePortal editor={props.editor} ownerKey={overlay.ownerKey} sourceViewId={props.viewId} id={overlay.key} kind="tool"><Monitor editor={props.editor} overlay={overlay} /></ApplicationSurfacePortal>
  }</For>;
}
