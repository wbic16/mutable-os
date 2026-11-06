import { batch, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { ViewPosition } from "../block-tree/types";

export interface TextSegment { nodeKey: string; contentKey: string; start: number; end: number }
export interface CrossTextRange { anchor: ViewPosition; head: ViewPosition; viewId: string }
export const CROSS_TEXT_PREFERENCE_KEY = "speedy.cross-block-selection.enabled.v1";
/** The persisted preference (the constructor's own initial read).
 *  The settings-bundle capture reads through this. */
export function readCrossBlockSelectionPreference(): boolean {
  try { return localStorage.getItem(CROSS_TEXT_PREFERENCE_KEY) === "true"; }
  catch { return false; }
}

/** Experimental, ephemeral selection. Never pass these endpoints to local edit APIs. */
export class CrossBlockSelection {
  private readonly enabledSignal = createSignal(false);
  readonly enabled = this.enabledSignal[0];
  private readonly rangeSignal = createSignal<CrossTextRange>();
  readonly range = this.rangeSignal[0];
  private readonly messageSignal = createSignal("");
  readonly message = this.messageSignal[0];
  readonly segments: Record<string, TextSegment | undefined>;
  private setSegments: ReturnType<typeof createStore<Record<string, TextSegment | undefined>>>[1];
  private keys: string[] = [];
  private stream?: { revision: number; viewId: string; keys: string[]; indices: Map<string, number> };
  private formatting = false;
  private documentKeys?: string[];
  isDocumentSelection() { return !!this.documentKeys; }
  constructor(private editor: ReactiveEditor) {
    [this.segments, this.setSegments] = createStore<Record<string, TextSegment | undefined>>({});
    try { this.enabledSignal[1](localStorage.getItem(CROSS_TEXT_PREFERENCE_KEY) === "true"); }
    catch { /* Storage is optional; retain the safe default when unavailable. */ }
  }
  enable(value: boolean) {
    this.clear(); this.enabledSignal[1](value);
    try { localStorage.setItem(CROSS_TEXT_PREFERENCE_KEY, String(value)); }
    catch { this.notice("Browser storage is unavailable; this selection preference applies to this editor only."); }
  }
  notice(text = "Type or paste to replace the selected text; use the toolbar to format or create a linked annotation. Escape collapses the selection.") { this.messageSignal[1](text); }
  position(key: string, index: number): ViewPosition {
    const node = this.editor.node(key);
    if (!node || node.viewType !== "standoff-editor-block" || !Number.isInteger(index) || index < 0 || index > node.inlineContent.length) throw new Error("Invalid text endpoint");
    return { occurrenceKey: key, contentKey: node.contentKey, boundary: { index, affinity: "after" } };
  }
  private visible(key: string) {
    const root = this.editor.mounts.get(key)?.focusElement;
    return !!root?.isConnected && !root.closest('[hidden], [inert], [aria-hidden="true"]');
  }
  siblings(key: string): string[] {
    const node = this.editor.node(key); if (!node) return [];
    if (this.stream?.revision === this.editor.repository.state.revision && this.stream.viewId === node.viewId && this.stream.indices.has(key)) return this.stream.keys;
    const projection = this.editor.projections.get(node.viewId);
    const parent = Object.values(projection?.state.nodes ?? {}).find(n => n.children.includes(key));
    const keys = parent ? [...parent.children] : [];
    this.stream = { revision: this.editor.repository.state.revision, viewId: node.viewId, keys, indices: new Map(keys.map((key, index) => [key, index])) };
    return keys;
  }
  private resolveParagraphs(anchor: ViewPosition, head: ViewPosition): TextSegment[] {
    const a = this.editor.node(anchor.occurrenceKey), h = this.editor.node(head.occurrenceKey);
    if (!a || !h || a.viewId !== h.viewId || a.contentKey !== anchor.contentKey || h.contentKey !== head.contentKey) throw new Error("Text selection endpoints are stale or in different views");
    this.position(a.key, anchor.boundary.index); this.position(h.key, head.boundary.index);
    const siblings = this.siblings(a.key), ai = this.stream!.indices.get(a.key), hi = this.stream!.indices.get(h.key);
    if (ai === undefined || hi === undefined) throw new Error("Selection cannot cross list, page or tab boundaries");
    const forward = ai < hi || (ai === hi && anchor.boundary.index <= head.boundary.index);
    const start = forward ? anchor : head, end = forward ? head : anchor;
    return siblings.slice(Math.min(ai, hi), Math.max(ai, hi) + 1).map(key => {
      const node = this.editor.node(key)!;
      if (node.viewType !== "standoff-editor-block" || !this.visible(key)) throw new Error("Selection cannot cross media, hidden Blocks or structural barriers");
      return { nodeKey: key, contentKey: node.contentKey, start: key === start.occurrenceKey ? start.boundary.index : 0, end: key === end.occurrenceKey ? end.boundary.index : node.inlineContent.length };
    });
  }
  resolve(anchor: ViewPosition, head: ViewPosition): TextSegment[] {
    if (!this.documentKeys) return this.resolveParagraphs(anchor, head);
    const range = this.range();
    if (!range || anchor.occurrenceKey !== range.anchor.occurrenceKey || head.occurrenceKey !== range.head.occurrenceKey) throw new Error("Document selection changed");
    return this.documentKeys.map(key => {
      const node = this.editor.node(key), selected = this.segments[key];
      if (!node || node.viewId !== range.viewId || node.contentKey !== selected?.contentKey || !this.visible(key)) throw new Error("Document selection is no longer visible");
      return { nodeKey: key, contentKey: node.contentKey, start: 0, end: node.inlineContent.length };
    });
  }
  /** Explicit selection only: walk structural Blocks, never inline Cells or other Documents. */
  selectDocument(key: string): boolean {
    const origin = this.editor.node(key), projection = origin && this.editor.projections.get(origin.viewId);
    let scope = origin;
    while (scope && scope.viewType !== 'document-block') scope = projection?.parentOf(scope.key);
    if (!scope) return false;
    const segments: TextSegment[] = [], seen = new Set<string>();
    const visit = (key: string) => {
      if (seen.has(key)) return; seen.add(key);
      const node = this.editor.node(key); if (!node || node.viewType === 'document-block' && node.key !== scope!.key) return;
      if (node.viewType === 'standoff-editor-block' && this.visible(key)) segments.push({nodeKey:key,contentKey:node.contentKey,start:0,end:node.inlineContent.length});
      for (const child of [...node.children, ...Object.values(node.ownedRelations)]) visit(child);
    };
    visit(scope.key);
    if (!segments.length) return false;
    this.documentKeys = segments.map(segment => segment.nodeKey);
    return this.publish(this.position(segments[0].nodeKey,0),this.position(segments.at(-1)!.nodeKey,segments.at(-1)!.end),segments);
  }
  set(anchor: ViewPosition, head: ViewPosition): boolean {
    if (!this.enabled()) return false;
    const segments = this.resolveParagraphs(anchor, head);
    this.documentKeys = undefined;
    return this.publish(anchor, head, segments);
  }
  private publish(anchor: ViewPosition, head: ViewPosition, segments: TextSegment[]): boolean {
    this.editor.blockSelection.clear(); this.editor.blockClipboard.dismiss();
    batch(() => {
      const retained = new Set(segments.map(s => s.nodeKey));
      for (const key of this.keys) if (!retained.has(key)) this.setSegments(key, undefined);
      for (const segment of segments) {
        this.editor.selections.removeOccurrence(segment.nodeKey);
        this.setSegments(segment.nodeKey, segment);
      }
      this.keys = segments.map(s => s.nodeKey);
      this.rangeSignal[1]({ anchor: structuredClone(anchor), head: structuredClone(head), viewId: this.editor.node(anchor.occurrenceKey)!.viewId });
      this.notice();
    });
    return true;
  }
  clear() {
    this.documentKeys = undefined;
    batch(() => { for (const key of this.keys) this.setSegments(key, undefined); this.keys = []; this.rangeSignal[1](undefined); this.messageSignal[1](""); });
  }
  collapseToHead() {
    const head = this.range()?.head; if (!head) return;
    this.clear();
    const node = this.editor.node(head.occurrenceKey), mount = this.editor.mounts.get(head.occurrenceKey);
    mount?.focus(); mount?.restoreInlineSelection?.({ anchor: head.boundary.index, head: head.boundary.index });
    if (node) this.editor.selections.setPrimary(node.key, node.contentKey, node.viewId, head.boundary.index);
  }
  validate() {
    const range = this.range(); if (!range) return;
    try { this.resolve(range.anchor, range.head); } catch { this.clear(); }
  }
  selectedText(): string {
    const range = this.range(); if (!range) return "";
    return this.resolve(range.anchor, range.head).map(segment => this.editor.node(segment.nodeKey)!.inlineContent.slice(segment.start, segment.end).map(key => String(this.editor.node(key)?.payload.text ?? "\uFFFC")).join("")).join("\n");
  }
  replace(text: string) {
    const range = this.range(); if (!range) return false;
    const segments = this.resolve(range.anchor, range.head).map(segment => ({ placementKey: this.editor.node(segment.nodeKey)!.placementKey, start: segment.start, end: segment.end }));
    const result = this.editor.commands.replaceAcrossBlocks(segments, text);
    this.clear();
    const focus = () => {
      const node = this.editor.nodeForPlacementInView(result.placementKey, range.viewId); if (!node) return;
      const mount = this.editor.mounts.get(node.key); mount?.focus();
      mount?.restoreInlineSelection?.({ anchor: result.caret, head: result.caret });
      this.editor.selections.setPrimary(node.key, node.contentKey, node.viewId, result.caret);
    };
    focus(); queueMicrotask(focus);
    return true;
  }
  /** Until structural edit maps exist, external mutations invalidate, never mis-map. */
  beforeChange() { if (this.range() && !this.formatting) this.clear(); this.stream = undefined; }
  annotate(type: string, value?: string, attributes: Readonly<Record<string, number | string>> = {}) {
    const range = this.range(); if (!range) return false;
    if (!type.startsWith("style/") && !["amber-crt", "text/colour", "text/background-colour"].includes(type)) throw new Error("Only ordinary styles are supported across Blocks");
    const segments = this.resolve(range.anchor, range.head).filter(s => s.end > s.start);
    this.formatting = true;
    try {
      this.editor.rangeAnnotations.apply(segments.map(segment => {
        const node = this.editor.node(segment.nodeKey)!, content = this.editor.repository.readState().contents[node.contentKey];
        return { ...segment, placementKey: node.placementKey, version: content.inlineRevision, coordinate: "cell" as const };
      }), type, value, attributes);
    }
    finally { this.formatting = false; }
    this.notice(`Formatted ${segments.length} text segment(s). Escape returns to editing.`);
    return true;
  }
}
