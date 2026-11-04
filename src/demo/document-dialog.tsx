import {applicationPresentationSurface} from '../rendering/application-presentation-surface';
import { createSignal, createUniqueId, onCleanup, onMount, type JSX } from "solid-js";
import { windowManagerForDocument } from "../application/window-lifecycle";
import { Portal } from "solid-js/web";
import { createFloatingWindowResize, FloatingWindowResizeHandle, type FloatingWindowSize } from "../rendering/floating-window-resize";

export interface DocumentDialogResizePolicy {
  initial: FloatingWindowSize;
  minimum: FloatingWindowSize;
}

export function DocumentDialog(props: { title: string; onClose: () => void; busy?: boolean; children: JSX.Element; compact?: boolean; resizable?: DocumentDialogResizePolicy }) {
  const manager = windowManagerForDocument(document);
  const titleId = createUniqueId();
  let dialog!: HTMLElement;
  let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
  const previous = document.activeElement as HTMLElement | null;
  const initialSize = () => {
    const preferred = props.resizable?.initial ?? { width: 0, height: 0 };
    return { width: Math.min(preferred.width, Math.max(1, window.innerWidth - 40)), height: Math.min(preferred.height, Math.max(1, window.innerHeight - 40)) };
  };
  const [size, setSize] = createSignal(initialSize());
  const [position, setPosition] = createSignal({ x: Math.max(8, (window.innerWidth - initialSize().width) / 2), y: Math.max(8, (window.innerHeight - initialSize().height) / 2) });
  const clampPosition = (x: number, y: number) => {
    const width = dialog?.offsetWidth || size().width, height = dialog?.offsetHeight || size().height;
    return { x: Math.max(8, Math.min(x, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8)), y: Math.max(8, Math.min(y, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8)) };
  };
  const windowResize = createFloatingWindowResize({
    element: () => dialog,
    size,
    minimum: () => props.resizable?.minimum ?? { width: 1, height: 1 },
    enabled: () => !!props.resizable && !props.busy,
    onCommit: next => { setSize(next); queueMicrotask(() => setPosition(current => clampPosition(current.x, current.y))); },
  });
  onMount(() => { if (manager) onCleanup(manager.lifecycle.modal(dialog)); });
  onMount(() => queueMicrotask(() => {
    if (dialog.isConnected && (!manager || manager.lifecycle.permits(dialog))) (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? dialog.querySelector<HTMLElement>("input, button:not([disabled])") ?? dialog).focus();
  }));
  onMount(() => {
    if (!props.resizable) return;
    const keepReachable = () => setPosition(current => clampPosition(current.x, current.y));
    window.addEventListener("resize", keepReachable);
    onCleanup(() => window.removeEventListener("resize", keepReachable));
  });
  onCleanup(() => { if (!manager && previous?.isConnected) previous.focus({ preventScroll: true }); });
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (!props.busy) props.onClose();
    }
    if (event.key === "Tab") {
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
        .filter((element) => element.tabIndex >= 0 && !element.closest("[inert]"));
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  return <Portal mount={applicationPresentationSurface(manager)}>
    <div class="document-dialog__backdrop">
      <section ref={dialog} class="document-dialog" classList={{ "document-dialog--compact": props.compact, "document-dialog--resizable": !!props.resizable }} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={props.busy} tabIndex={-1} onKeyDown={keyDown}
        style={props.resizable ? { left: `${position().x}px`, top: `${position().y}px`, width: `${windowResize.dimensions().width}px`, height: `${windowResize.dimensions().height}px` } : undefined}>
        <header class="document-dialog__header"
          onPointerDown={event => { if (!props.resizable || props.busy || event.button !== 0 || (event.target as Element).closest("button")) return; const current = position(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: current.x, top: current.y }; event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault(); }}
          onPointerMove={event => { if (drag?.id !== event.pointerId) return; setPosition(clampPosition(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)); }}
          onPointerUp={event => { if (drag?.id === event.pointerId) drag = undefined; }} onPointerCancel={() => { drag = undefined; }}>
          <h2 id={titleId}>{props.title}</h2><button type="button" aria-label="Close dialog" disabled={props.busy} onClick={props.onClose}>×</button>
        </header>
        {props.resizable && <FloatingWindowResizeHandle controller={windowResize} class="document-dialog__resize" label={`Resize ${props.title} dialog`} />}
        {props.children}
      </section>
    </div>
  </Portal>;
}
