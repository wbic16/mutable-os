import { createStore } from "solid-js/store";
import type { NodeKey } from "../block-tree/types";
import type { MountRegistry, NativeTextSelection } from "./mounts";

export interface FocusRequest {
  caret?: "start" | "end" | NativeTextSelection;
  reveal?: boolean;
  raiseWindow?: boolean;
  reason?: string;
  /** Runtime readiness/activation lease. Rechecked when a late mount arrives. */
  valid?: () => boolean;
}

interface FocusState {
  focusedKey?: NodeKey;
  lastFocusedKey?: NodeKey;
  requestToken: number;
}

export class FocusService {
  private renderers = new Set<(key: NodeKey, current: () => boolean) => Promise<boolean> | undefined>();
  /** A native flow may materialise an already chosen destination. No navigation policy. */
  registerRenderer(render: (key: NodeKey, current: () => boolean) => Promise<boolean> | undefined) {
    this.renderers.add(render);
    return () => { this.renderers.delete(render); };
  }
  async ensureRendered(key: NodeKey, current: () => boolean = () => true): Promise<boolean> {
    if (!current()) return false;
    for (const render of this.renderers) {
      const result = render(key, current);
      if (result) return result;
    }
    return !!this.mounts.get(key);
  }
  readonly state: FocusState;
  permit?: (nodeKey: NodeKey) => boolean;
  cancelPending(): void { this.pending = undefined; }
  private readonly setState: (...args: any[]) => void;
  private pending?: { nodeKey: NodeKey; request: FocusRequest; token: number; rendering?: boolean };
  private readonly unsubscribe: () => void;

  constructor(private readonly mounts: MountRegistry) {
    const [state, setState] = createStore<FocusState>({ requestToken: 0 });
    this.state = state;
    this.setState = setState;
    this.unsubscribe = mounts.subscribe((nodeKey) => {
      if (this.pending?.nodeKey === nodeKey) {
        this.applyPending();
        // A retained outlet registers its view before attaching its host slot.
        if (this.pending) queueMicrotask(() => this.applyPending());
      }
    });
  }

  request(nodeKey: NodeKey, request: FocusRequest = {}): void {
    if (request.valid?.() === false || this.permit?.(nodeKey) === false) return;
    const token = this.state.requestToken + 1;
    const rendering = !this.mounts.get(nodeKey) && this.renderers.size > 0;
    this.pending = { nodeKey, request, token, rendering };
    this.setState({
      lastFocusedKey: this.state.focusedKey,
      focusedKey: nodeKey,
      requestToken: token,
    });
    this.applyPending();
    void this.ensureRendered(nodeKey, () => this.state.requestToken === token && request.valid?.() !== false).then(() => {
      if (this.pending?.token === token) { this.pending.rendering = false; this.applyPending(); }
    });
  }

  adopt(nodeKey: NodeKey): void {
    if (this.state.focusedKey === nodeKey) return;
    this.pending = undefined;
    this.setState({
      lastFocusedKey: this.state.focusedKey,
      focusedKey: nodeKey,
      requestToken: this.state.requestToken + 1,
    });
  }

  clearRemoved(nodeKey: NodeKey): void {
    if (this.pending?.nodeKey === nodeKey) this.pending = undefined;
    if (this.state.focusedKey === nodeKey) this.setState("focusedKey", undefined);
    if (this.state.lastFocusedKey === nodeKey) this.setState("lastFocusedKey", undefined);
  }

  private applyPending(): void {
    const pending = this.pending;
    if (!pending || pending.rendering || pending.token !== this.state.requestToken) return;
    const handle = this.mounts.get(pending.nodeKey);
    if (!handle?.root.isConnected) return;
    if (pending.request.valid?.() === false || this.permit?.(pending.nodeKey) === false) { this.pending = undefined; return; }
    handle.focus();
    const caret = pending.request.caret;
    if (handle.restoreSelection && caret) {
      const length =
        handle.focusElement instanceof HTMLTextAreaElement
          ? handle.focusElement.value.length
          : 0;
      const selection =
        caret === "start"
          ? { start: 0, end: 0, direction: "none" as const }
          : caret === "end"
            ? { start: length, end: length, direction: "none" as const }
            : caret;
      handle.restoreSelection(selection);
      this.mounts.rememberSelection(pending.nodeKey, selection);
    } else if (handle.restoreInlineSelection && caret) {
      const length = [...(handle.captureText?.() ?? "")].length;
      const position = caret === "start" ? 0 : caret === "end" ? length : caret.end;
      handle.restoreInlineSelection({ anchor: position, head: position });
    }
    this.pending = undefined;
  }

  dispose(): void {
    this.unsubscribe();
    this.renderers.clear();
    this.pending = undefined;
  }
}
