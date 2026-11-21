import {noteDimensions} from '../block-tree/note-authoring';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ApplicationSurfacePortal } from "./window-manager";
import { unwrap } from "solid-js/store";
import type { BlockViewProps } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { useReactiveView } from "../reactive-editor/context";
import { ChildBlocks } from "./block-outlet";
import { createFloatingWindowResize, FloatingWindowResizeHandle } from "./floating-window-resize";
import { WindowIcon } from "./window-icon";
import "./sticky-note.css";

export function StickyNoteBlockView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => node()?.payload.metadata as Record<string, unknown> | undefined;
  const editable=createMemo(()=>editor.canEditText(props.nodeKey));
  const fontScale = createMemo(() => Math.pow(1.125, Math.max(-3, Math.min(5, Number(metadata()?.fontStep) || 0))));
  const [floating, setFloating] = createSignal(false);
  let root!: HTMLDivElement;
  let dispose: (() => void) | undefined;
  const storedSize = () => {
    const size = metadata()?.size as { width?: number; height?: number } | undefined;
    return { width: Number(size?.width) || 280, height: Number(size?.height) || 280 };
  };
  const resize = createFloatingWindowResize({
    element: () => root,
    size: storedSize,
    minimum: { width: 200, height: 160 },
    enabled: () => !floating() && editable(),
    onCommit: size => {if(editable())editor.commands.setPayloadField(props.nodeKey, "metadata", { ...unwrap(metadata() ?? {}), size:noteDimensions(size) }, "Resize Sticky Note");},
  });
  createEffect(()=>{if(!editable())resize.cancel();});
  onMount(() => {
    setFloating(!!root.closest(".reactive-window--sticky"));
    dispose = editor.mounts.register(props.nodeKey, { root, focusElement: root, inputPolicy: "container", focus: () => root.focus({ preventScroll: true }) });
  });
  onCleanup(() => dispose?.());
  return <div ref={root} class="abstract-block reactive-sticky-note" data-client-id={props.nodeKey} data-block-id={String(node()?.payload.id ?? "")}
    data-block-type="sticky-note-block" data-sticky-colour={String(metadata()?.colour ?? "yellow")} data-sticky-material={String(metadata()?.material ?? "paper")}
    style={{ "font-size": `${fontScale()}em`, width: floating() ? "100%" : `min(${resize.dimensions().width}px, 100%)`, height: floating() ? "100%" : `${resize.dimensions().height}px` }} tabIndex={-1}>
    <div class="reactive-sticky-note__content"><ChildBlocks parentKey={props.nodeKey} /></div>
    <Show when={!floating() && editable()}><FloatingWindowResizeHandle controller={resize} class="reactive-sticky-note__resize" label="Resize sticky note" /></Show>
  </div>;
}

function StickyDraftWindow(props: { editor: ReactiveEditor; id: string }) {
  const draft = () => props.editor.stickyNotes.state.drafts.find(item => item.id === props.id);
  const [positionPreview, setPositionPreview] = createSignal<{ x: number; y: number }>();
  const [minimized, setMinimized] = createSignal(false);
  let root!: HTMLElement, input!: HTMLTextAreaElement;
  let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
  const position = () => positionPreview() ?? draft()!.position;
  const resize = createFloatingWindowResize({
    element: () => root,
    size: () => ({ width: draft()!.size.width, height: draft()!.size.height }),
    minimum: { width: 240, height: 160 },
    enabled: () => !minimized(),
    onCommit: size => props.editor.stickyNotes.update(props.id, { size }),
  });
  onMount(() => queueMicrotask(() => input?.focus({ preventScroll: true })));
  const promote = (event?: Event) => {
    if (event instanceof InputEvent && event.isComposing) return;
    if (input?.value.trim()) props.editor.stickyNotes.promote(props.id, input.value);
  };
  const beginDrag = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    const current = position(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: current.x, top: current.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    setPositionPreview({ x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y });
  };
  const finishDrag = (event: PointerEvent, cancelled = false) => {
    if (drag?.id !== event.pointerId) return;
    if (!cancelled && positionPreview()) props.editor.stickyNotes.update(props.id, { position: positionPreview()! });
    setPositionPreview(undefined); drag = undefined;
  };
  return <Show when={draft()}><section ref={root} class="reactive-sticky-draft" classList={{ "reactive-sticky-draft--minimized": minimized() }}
    role="dialog" aria-label="New Sticky Note" style={{ left: `${position().x}px`, top: `${position().y}px`, width: minimized() ? "96px" : `${resize.dimensions().width}px`, height: minimized() ? "auto" : `${resize.dimensions().height}px` }}>
    <Show when={minimized()} fallback={<>
      <header class="reactive-sticky-draft__header" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={event => finishDrag(event, true)}>
        <span>Sticky note</span><span><button type="button" aria-label="Minimize sticky note" onClick={() => setMinimized(true)}>−</button><button type="button" aria-label="Close sticky note" onClick={() => props.editor.stickyNotes.discard(props.id)}>×</button></span>
      </header>
      <textarea ref={input} aria-label="Sticky note text" placeholder="Write a note…" onInput={promote} onCompositionEnd={promote} />
      <FloatingWindowResizeHandle controller={resize} class="reactive-sticky-draft__resize" label="Resize sticky note" />
    </>}>
      <WindowIcon title="Sticky note" kind="window" onRestore={() => { setMinimized(false); queueMicrotask(() => input?.focus()); }} />
    </Show>
  </section></Show>;
}

export function StickyDraftLayer(props: { editor: ReactiveEditor; viewId: string }) {
  return <For each={props.editor.stickyNotes.state.drafts.filter(draft => draft.viewId === props.viewId).map(draft => draft.id)}>{id =>
    <ApplicationSurfacePortal editor={props.editor} sourceViewId={props.viewId} kind="tool"><StickyDraftWindow editor={props.editor} id={id} /></ApplicationSurfacePortal>
  }</For>;
}
