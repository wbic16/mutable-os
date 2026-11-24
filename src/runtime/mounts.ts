import { registerEditorInput, type EditorInputCapability } from './editor-input';
import type { NodeKey } from "../block-tree/types";

export interface NativeTextSelection {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
}

export interface MountHandle {
  /** Optional actions owned by this mounted occurrence. */
  contextActions?(): import("./block-menu-types").BlockMenuItem[];
  root: Element;
  focusElement: HTMLElement;
  inputPolicy: "native-text" | "standoff" | "control" | "container" | "opaque-widget";
  generation: number;
  editorInput?: EditorInputCapability;
  focusAtBoundary?(edge: "start" | "end"): void;
  /** Alternate native text presentation may consume input before DOM editing. */
  interceptInlineInput?(event: Event): boolean;
  /** Preserve a single owned text source when accepting native rich paragraphs. */
  prepareInlinePaste?(fragment: import("../interchange/fragment").MutableFragment): import("../interchange/fragment").MutableFragment;
  focus(): void;
  /** Invalidate the existing reading geometry after enclosing inline reflow. */
  invalidateInlineLayout?():void;
  captureSelection?(): NativeTextSelection;
  restoreSelection?(selection: NativeTextSelection): void;
  captureInlineSelection?(): { anchor: number; head: number } | undefined;
  restoreInlineSelection?(selection: { anchor: number; head: number }): void;
  inlinePoint?(node: Node, offset: number): number | undefined;
  inlineBoundary?(index: number): { node: Node; offset: number };
  /** Alternate native presentations expose their shared cached geometry. */
  inlineRangeRects?(start:number,end:number):DOMRectReadOnly[];
  inlineCaretRect?(index:number):DOMRectReadOnly|undefined;
  inlinePointAt?(x: number, y: number): number;
  captureText?(): string;
  /** Compact composition uses typed source coordinates in the existing gateway. */
  compactComposition?(phase:'start'|'end',text:string):void;
  /** The existing character owner renders an occurrence-local Scry sequence. */
  presentProvisional?(draft:import('../features/autocomplete/provisional-cells').ProvisionalCells|undefined):void;
  finishProvisionalComposition?():void;
  /** Native textarea normalization back to authoritative source; called only on input. */
  authoredNativeText?(value: string): string;
  composing?: boolean;
}

type MountSubscriber = (nodeKey: NodeKey, handle: MountHandle) => void;

export class MountRegistry {
  private inputDisposers = new Map<MountHandle, () => void>();
  private byNode = new Map<NodeKey, MountHandle>();
  private byElement = new WeakMap<Element, NodeKey>();
  private generations = new Map<NodeKey, number>();
  private subscribers = new Set<MountSubscriber>();
  private selections = new Map<NodeKey, NativeTextSelection>();
  private inlineSelections = new Map<NodeKey, { anchor: number; head: number }>();

  register(
    nodeKey: NodeKey,
    handle: Omit<MountHandle, "generation">,
  ): () => void {
    const previous = this.byNode.get(nodeKey);
    if (previous) this.detach(previous);
    const generation = (this.generations.get(nodeKey) ?? 0) + 1;
    this.generations.set(nodeKey, generation);
    const mounted: MountHandle = { ...handle, generation };
    this.byNode.set(nodeKey, mounted);
    this.byElement.set(mounted.root, nodeKey);
    this.byElement.set(mounted.focusElement, nodeKey);
    if (mounted.editorInput) this.inputDisposers.set(mounted, registerEditorInput(nodeKey, mounted, () => this.byNode.get(nodeKey) === mounted));
    for (const subscriber of this.subscribers) subscriber(nodeKey, mounted);

    return () => {
      if (this.byNode.get(nodeKey) !== mounted) return;
      const selection = mounted.captureSelection?.();
      if (selection) this.selections.set(nodeKey, selection);
      const inline = mounted.captureInlineSelection?.();
      if (inline) this.inlineSelections.set(nodeKey, inline);
      this.byNode.delete(nodeKey);
      this.detach(mounted);
    };
  }

  private detach(handle: MountHandle) {
    this.inputDisposers.get(handle)?.(); this.inputDisposers.delete(handle);
    this.byElement.delete(handle.root); this.byElement.delete(handle.focusElement);
  }

  dispose() {
    for (const handle of this.byNode.values()) this.detach(handle);
    this.byNode.clear(); this.generations.clear(); this.selections.clear(); this.inlineSelections.clear();
  }

  subscribe(subscriber: MountSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  get(nodeKey: NodeKey): MountHandle | undefined {
    return this.byNode.get(nodeKey);
  }

  rememberSelection(nodeKey: NodeKey, selection: NativeTextSelection): void {
    this.selections.set(nodeKey, selection);
  }

  selection(nodeKey: NodeKey): NativeTextSelection | undefined {
    return this.selections.get(nodeKey);
  }
  rememberInlineSelection(nodeKey:NodeKey,selection:{anchor:number;head:number}) { this.inlineSelections.set(nodeKey,selection); }
  inlineSelection(nodeKey: NodeKey) { return this.inlineSelections.get(nodeKey); }

  /** Final occurrence disposal, unlike an ordinary unmount/remount. */
  releaseOccurrence(nodeKey: NodeKey): void {
    const handle = this.byNode.get(nodeKey);
    if (handle) {
      this.detach(handle);
    }
    this.byNode.delete(nodeKey);
    this.generations.delete(nodeKey);
    this.selections.delete(nodeKey);
    this.inlineSelections.delete(nodeKey);
  }

  resolveEvent(event: Event): { nodeKey: NodeKey; handle: MountHandle } | undefined {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const candidate of path) {
      if (!(candidate instanceof Element)) continue;
      const nodeKey = this.byElement.get(candidate);
      if (nodeKey) return { nodeKey, handle: this.byNode.get(nodeKey)! };
    }
    let element = event.target instanceof Element ? event.target : null;
    while (element) {
      const nodeKey = this.byElement.get(element);
      if (nodeKey) return { nodeKey, handle: this.byNode.get(nodeKey)! };
      element = element.parentElement;
    }
    return undefined;
  }

  resolveElement(element: Element | null): { nodeKey: NodeKey; handle: MountHandle } | undefined {
    let current = element;
    while (current) {
      const nodeKey = this.byElement.get(current);
      if (nodeKey) return { nodeKey, handle: this.byNode.get(nodeKey)! };
      current = current.parentElement;
    }
    return undefined;
  }
}
