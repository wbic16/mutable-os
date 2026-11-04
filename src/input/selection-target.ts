import type { NodeKey } from "../block-tree/types";
import type { MountRegistry } from "../runtime/mounts";
import type { SelectionInputTarget } from "./selection-gestures";

// Toolbar commands may live outside a Block mount. Keep their editor ownership
// explicit, including when several editors install input on the same document.
const toolbarOwners = new WeakMap<Element, { mounts: Pick<MountRegistry, "resolveEvent"> }>();
export function ownSelectionToolbar(element: Element, mounts: Pick<MountRegistry, "resolveEvent">): () => void {
  const entry = { mounts };
  toolbarOwners.set(element, entry);
  return () => { if (toolbarOwners.get(element) === entry) toolbarOwners.delete(element); };
}

/** Existing native/modal exclusions shared by retained-selection input. */
export function selectionInputTarget(event: Event, mounts: Pick<MountRegistry, "resolveEvent">, crossHead: (target: Element) => NodeKey | undefined): SelectionInputTarget {
  const element = event.target instanceof Element ? event.target : undefined;
  const excluded = !!element?.closest('input, textarea:not([data-cross-text-input]), select, [role="dialog"]:not(.compact-toolbar__panel), [role="menu"], [data-bindings-window], [data-block-selection-handle], [data-block-selection-inspector]');
  if (excluded) return { excluded: true };
  if (element?.matches('[data-cross-text-input]')) return { key: crossHead(element), excluded: false };
  const resolved = mounts.resolveEvent(event);
  const toolbar = element?.closest(".document-style-bar, [data-selection-toolbar]");
  return { key: resolved?.handle.inputPolicy === "standoff" ? resolved.nodeKey : undefined, excluded: false,
    composing: resolved?.handle.composing, toolbar: !!toolbar && toolbarOwners.get(toolbar)?.mounts === mounts };
}
