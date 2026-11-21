import {stickyNoteDto} from '../block-tree/note-authoring';
export {stickyNoteDto} from '../block-tree/note-authoring';
import { createStore, unwrap } from "solid-js/store";
import type { ExistingBlockDto, NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";

export const STICKY_NOTE_SIZE = { width: 280, height: 280 } as const;

export interface StickyNoteDraft {
  id: string;
  viewId: string;
  parentKey: NodeKey;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export function stickyWindowDto(text: string, position: StickyNoteDraft["position"], size: StickyNoteDraft["size"]): ExistingBlockDto {
  return {
    id: crypto.randomUUID(), type: "window-block",
    metadata: { title: "Sticky note", stickyNote: true, state: "normal", position, size: { w: size.width, h: size.height }, zIndex: 10 },
    children: [stickyNoteDto(text)],
  };
}

function workspaceParent(editor: ReactiveEditor): { viewId: string; parentKey: NodeKey } | undefined {
  for (const projection of editor.projections.values()) {
    const root = projection.state.nodes[projection.state.rootKey];
    if (!root) continue;
    if (root.viewType.endsWith("-background-block")) return { viewId: projection.viewId, parentKey: root.key };
    if (root.viewType !== "workspace-block") continue;
    const background = root.children.map(key => projection.state.nodes[key]).find(node => node?.viewType.endsWith("-background-block"));
    if (background) return { viewId: projection.viewId, parentKey: background.key };
    return { viewId: projection.viewId, parentKey: root.key };
  }
}

function meaningful(editor: ReactiveEditor, key: NodeKey): boolean {
  const node = editor.node(key);
  if (!node) return false;
  const metadata = node.payload.metadata as Record<string, unknown> | undefined;
  if (metadata?.userTitle && String(metadata.userTitle).trim()) return true;
  if (node.viewType === "standoff-editor-block") {
    const text = node.inlineContent.map(cellKey => {
      const cell = editor.node(cellKey);
      return cell?.viewType === "text-cell" ? String(cell.payload.text ?? "") : "\uFFFC";
    }).join("");
    if (text.trim()) return true;
    const properties = node.payload.standoffProperties;
    return Array.isArray(properties) && properties.some(property => property && !property.isDeleted && !String(property.type ?? "").startsWith("style/"));
  }
  if (node.viewType === "plain-text-block") return !!String(node.payload.text ?? "").trim();
  if (node.viewType === "sticky-note-block") return node.children.some(child => meaningful(editor, child));
  return true;
}

export function stickyNoteIsEmpty(editor: ReactiveEditor, noteKey: NodeKey): boolean {
  return !meaningful(editor, noteKey);
}

/** Empty new notes stay session-only until their first meaningful input. */
export class StickyNoteService {
  readonly state;
  private readonly setState;
  private host?: ReactiveEditor;
  constructor(private readonly editor: ReactiveEditor) {
    [this.state, this.setState] = createStore<{ drafts: StickyNoteDraft[] }>({ drafts: [] });
  }

  setHost(host?: ReactiveEditor) { this.host = host; }
  canCreate() { return !!workspaceParent(this.host ?? this.editor); }

  closedWindows(): NodeKey[] {
    return [...this.editor.projections.values()].flatMap(projection => Object.values(projection.state.nodes)
      .filter(node => node.viewType === "window-block" && (node.payload.metadata as Record<string, unknown> | undefined)?.stickyNote === true && (node.payload.metadata as Record<string, unknown>).state === "closed")
      .map(node => node.key));
  }

  create(anchor?: { x: number; y: number }): string | undefined {
    if (!anchor) {
      const focused = this.editor.focus.state.focusedKey ?? this.editor.focus.state.lastFocusedKey;
      const rect = focused && this.editor.mounts.get(focused)?.root.getBoundingClientRect();
      if (rect) anchor = { x: rect.right + 10, y: rect.top };
    }
    if (this.host && this.host !== this.editor) return this.host.stickyNotes.create(anchor);
    const parent = workspaceParent(this.editor);
    if (!parent) return;
    const x = Math.max(8, Math.min(anchor?.x ?? 36, (typeof window === "undefined" ? 1024 : window.innerWidth) - STICKY_NOTE_SIZE.width - 8));
    const y = Math.max(8, Math.min(anchor?.y ?? 64, (typeof window === "undefined" ? 768 : window.innerHeight) - STICKY_NOTE_SIZE.height - 8));
    const draft: StickyNoteDraft = { id: crypto.randomUUID(), ...parent, position: { x, y }, size: { ...STICKY_NOTE_SIZE } };
    this.setState("drafts", drafts => [...drafts, draft]);
    return draft.id;
  }

  update(id: string, patch: Partial<Pick<StickyNoteDraft, "position" | "size">>) {
    this.setState("drafts", drafts => drafts.map(draft => draft.id === id ? { ...draft, ...patch } : draft));
  }

  discard(id: string) { this.setState("drafts", drafts => drafts.filter(draft => draft.id !== id)); }

  promote(id: string, text: string): NodeKey | undefined {
    if (!text.trim()) return;
    const draft = this.state.drafts.find(item => item.id === id);
    if (!draft || !this.editor.node(draft.parentKey)) return;
    const parent = this.editor.node(draft.parentKey)!;
    const placement = this.editor.commands.insert(stickyWindowDto(text, { ...draft.position }, { ...draft.size }), { kind: "at", parentKey: parent.key, index: parent.children.length });
    this.editor.windowManager?.activatePlacement(placement);
    this.discard(id);
    const key=this.editor.nodeForPlacementInView(placement,draft.viewId)?.key;
    const valid=key && this.editor.windowManager?.registry.windows[key] ? this.editor.windowManager.lifecycle.readyTicket(key) : undefined;
    queueMicrotask(() => {
      if(valid?.()===false)return;
      const window = this.editor.nodeForPlacementInView(placement, draft.viewId);
      const textNode = window && this.editor.node(this.editor.node(window.children[0])?.children[0] ?? "");
      if (textNode) this.editor.focus.request(textNode.key, { reason: "create-sticky-note", caret: "end" });
    });
    return this.editor.nodeForPlacementInView(placement, draft.viewId)?.key;
  }

  closeWindow(windowKey: NodeKey):void|Promise<void> {
    const manager=this.editor.windowManager;
    if(manager?.registry.windows[windowKey])return manager.lifecycle.close(windowKey,()=>this.commitCloseWindow(windowKey));
    this.commitCloseWindow(windowKey);
  }
  private commitCloseWindow(windowKey: NodeKey) {
    const window = this.editor.node(windowKey);
    if (!window || window.viewType !== "window-block" || !(window.payload.metadata as Record<string, unknown> | undefined)?.stickyNote) return;
    const focusWasInside = this.editor.mounts.get(windowKey)?.root.contains(document.activeElement);
    const parent = [...this.editor.projections.values()].flatMap(projection => Object.values(projection.state.nodes))
      .find(candidate => candidate.children.includes(windowKey));
    const restoreFocus = () => { if (!this.editor.windowManager && focusWasInside && parent) queueMicrotask(() => this.editor.focus.request(parent.key, { reason: "close-sticky-note" })); };
    const note = window.children.map(key => this.editor.node(key)).find(node => node?.viewType === "sticky-note-block");
    if (!note || stickyNoteIsEmpty(this.editor, note.key)) {
      this.editor.focus.clearRemoved(windowKey);
      this.editor.commands.remove(windowKey);
      restoreFocus();
      return;
    }
    this.editor.commands.setPayloadField(windowKey, "metadata", { ...unwrap(window.payload.metadata as Record<string, unknown>), state: "closed" }, "Close Sticky Note");
    restoreFocus();
  }

  reopen(windowKey: NodeKey) {
    const window = this.editor.node(windowKey);
    if (!window || !(window.payload.metadata as Record<string, unknown> | undefined)?.stickyNote) return;
    this.editor.commands.setPayloadField(windowKey, "metadata", { ...unwrap(window.payload.metadata as Record<string, unknown>), state: "normal" }, "Reopen Sticky Note");
    this.editor.windowManager?.activatePlacement(window.placementKey);
  }

  dispose() { this.setState("drafts", []); this.host = undefined; }
}
