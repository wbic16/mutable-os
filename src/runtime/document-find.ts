import { editorInputBoundary } from './editor-input';
import { createStore } from "solid-js/store";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { resolveSearchScope, TextSearch, type ScopeKind, type SearchMatchSet, type SearchScope, type SearchMatch } from "./text-search";
import type { SearchOptions } from "./search-matching";
import { revealMatch } from "./reveal-match";
import { currentPageForScope, nodeKeysForPage } from "./minimap";
import { filterPositionMarkersToScope, searchMatchesToPositionMarkers } from "./document-position-markers";

export class DocumentFind {
  readonly state;
  private setState;
  readonly search: TextSearch;
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private generation = 0;
  private unsubscribe: () => void;
  private origin?: string;
  private selection?: { anchor: number; head: number };
  private native?: { start: number; end: number; direction: "forward" | "backward" | "none" };
  private navigated?: SearchMatch;
  readonly owner = "document-find";
  constructor(private editor: ReactiveEditor) {
    this.search = new TextSearch(editor);
    [this.state, this.setState] = createStore<{ open: boolean; query: string; options: SearchOptions; scope?: SearchScope; pageKey?: string; result?: SearchMatchSet; pending: boolean; active: number; visible: boolean; concertinaRequested: boolean; message: string; focusRequest: number }>({ open: false, query: "", options: {}, pending: false, active: -1, visible: true, concertinaRequested: false, message: "", focusRequest: 0 });
    this.unsubscribe = editor.repository.subscribeChanges(change => {
      if (change.taskStateOwner) return;
      // All decoration owners must lose stale ranges, even if Find is closed.
      if (change.inlineOwner) { editor.decorations.invalidateContent(change.inlineOwner); editor.minimap.invalidateContent(change.inlineOwner); }
      else for (const [key, previous] of change.previousContents) {
        const current = editor.repository.readState().contents[key];
        if (!current || !previous || previous.inlineRevision !== current.inlineRevision || previous.payload.text !== current.payload.text) { editor.decorations.invalidateContent(key); editor.minimap.invalidateContent(key); }
      }
      if (!this.state.open) return;
      this.navigated = undefined;
      this.schedule(!!change.inlineOwner);
    });
  }
  open(key: string) {
    if (this.state.open) { this.setState("focusRequest", n => n + 1); return; }
    try {
      if (this.editor.node(key)?.viewType === "document-window-block") {
        const document = this.editor.node(key)?.children.find(child => this.editor.node(child)?.viewType === "document-block");
        if (document) key = document;
      }
      const scope = resolveSearchScope(this.editor, key);
      const pageKey = currentPageForScope(this.editor, scope, [key, this.editor.focus.state.focusedKey, this.editor.focus.state.lastFocusedKey]);
      this.origin = key; this.selection = this.editor.mounts.get(key)?.captureInlineSelection?.(); this.native = this.editor.mounts.get(key)?.captureSelection?.(); this.navigated = undefined;
      let query = this.state.query;
      if (!this.editor.crossText.range() && this.selection) {
        const node = this.editor.node(key)!, start = Math.min(this.selection.anchor, this.selection.head), end = Math.max(this.selection.anchor, this.selection.head);
        if (end > start && end - start <= 200) query = node.inlineContent.slice(start,end).map(k => String(this.editor.node(k)?.payload.text ?? "")).join("");
      }
      this.setState({ open: true, scope, pageKey, query, message: "", active: -1, focusRequest: this.state.focusRequest + 1 }); this.schedule();
    } catch (error) { this.setState("message", (error as Error).message); }
  }
  setQuery(query: string) { this.setState("query", query); this.schedule(); }
  setOption(key: keyof SearchOptions, value: boolean) { this.setState("options", key, value); this.schedule(); }
  setScope(kind: ScopeKind) {
    try { this.setState("scope", resolveSearchScope(this.editor, this.origin!, kind)); this.schedule(); }
    catch (error) { this.setState("message", (error as Error).message); }
  }
  toggleHighlights() { this.setState("visible", v => !v); this.editor.decorations.setHighlightsVisible(this.owner, this.state.visible); this.editor.minimap.setLayerVisible(this.owner, this.state.visible && this.editor.concertina.state.owner !== this.owner); }
  toggleConcertina() {
    const requested = !this.state.concertinaRequested;
    this.setState("concertinaRequested", requested);
    if (!requested) { this.editor.concertina.deactivate(this.owner); this.editor.minimap.setLayerVisible(this.owner, this.state.visible); return; }
    this.editor.concertina.claim(this.owner, () => { if (this.state.concertinaRequested) this.toggleConcertina(); });
    this.applyConcertina();
  }
  private applyConcertina() {
    const result = this.state.result;
    const rootKey = this.state.pageKey ?? this.state.scope?.rootKey;
    if (!this.state.concertinaRequested || !result?.matches.length || !rootKey) return;
    const scope = resolveSearchScope(this.editor, rootKey, "page");
    const markers = filterPositionMarkersToScope(searchMatchesToPositionMarkers(result.matches), scope, nodeKeysForPage(this.editor, scope.rootKey));
    const applied = this.editor.concertina.activate({ owner: this.owner, viewId: scope.viewId, scope,
      markers, activeMarkerOrGroup: result.matches[this.state.active]?.id }, {}, () => { if (this.state.concertinaRequested) this.toggleConcertina(); });
    if (applied) this.editor.minimap.setLayerVisible(this.owner, false);
  }
  private schedule(keepUnchangedHighlights = false) {
    clearTimeout(this.timer); this.controller?.abort(); this.generation++;
    this.editor.concertina.deactivate(this.owner, this.state.concertinaRequested);
    this.setState({ pending: !!this.state.query, result: undefined, active: -1 });
    // Query/structure changes must never leave obsolete current-result navigation.
    if (!keepUnchangedHighlights) { this.editor.decorations.clearHighlights(this.owner); this.editor.minimap.dispose(this.owner); }
    this.timer = setTimeout(() => void this.flush(), 200);
  }
  async flush() {
    clearTimeout(this.timer); if (!this.state.open || !this.state.scope) return;
    if (!this.editor.node(this.state.scope.rootKey)) { this.close(false); return; }
    const generation = this.generation, controller = this.controller = new AbortController();
    const result = await this.search.searchText({ query: this.state.query, options: { ...this.state.options }, scope: { ...this.state.scope }, signal: controller.signal });
    if (generation !== this.generation || !this.state.open) return;
    this.setState({ result, pending: false, message: result.diagnostics.join(" ") });
    this.editor.decorations.attachMatches(this.owner, result); this.editor.decorations.setHighlightsVisible(this.owner, this.state.visible);
    if (this.state.pageKey) {
      const pageNodes = nodeKeysForPage(this.editor, this.state.pageKey);
      const markers = result.matches.flatMap(match => match.ranges
        .filter(range => pageNodes.has(range.nodeKey))
        .map((range, index) => ({ id: `${match.id}:${index}`, group: match.id, anchor: { kind: "text-range" as const, range }, colour: "#ffd34d", opacity: .55, label: match.context })));
      this.editor.minimap.attach(this.owner, { pageKey: this.state.pageKey, visible: this.state.visible, priority: 10, markers, onActivate: marker => this.navigateTo(marker.group ?? marker.id) });
    } else this.editor.minimap.dispose(this.owner);
    this.applyConcertina();
  }
  async navigate(direction: -1 | 1) {
    const result = this.state.result; if (!result?.matches.length || this.state.pending) return;
    const index = this.state.active < 0 ? (direction === 1 ? 0 : result.matches.length - 1) : (this.state.active + direction + result.matches.length) % result.matches.length;
    await this.activate(index, result);
  }
  async navigateTo(matchId: string) {
    const result = this.state.result; if (!result || this.state.pending) return;
    const index = result.matches.findIndex(match => match.id === matchId);
    if (index >= 0) await this.activate(index, result);
  }
  private async activate(index: number, result: SearchMatchSet) {
    this.setState("active", index); const match = result.matches[index]; this.navigated = match;
    this.editor.decorations.setActiveMatch(this.owner, match.id);
    this.editor.minimap.setActive(this.owner, match.id);
    const revealed = await revealMatch(this.editor, match, () => this.state.result === result && this.state.active === index && this.state.open);
    if (this.state.result !== result || this.state.active !== index || !this.state.open) return;
    if (this.state.concertinaRequested) {
      const rootKey = this.state.pageKey ?? this.state.scope?.rootKey;
      const pageNodes = rootKey ? nodeKeysForPage(this.editor, resolveSearchScope(this.editor, rootKey, "page").rootKey) : undefined;
      if (!match.ranges.some(range => pageNodes?.has(range.nodeKey))) this.toggleConcertina();
      else this.editor.concertina.setActiveMarker(match.id);
    }
    if (!revealed) { this.setState("message", "This result cannot be mounted by the current view adapter."); return; }
    if (!match.capabilities.highlight) this.setState("message", match.capabilities.reason ?? "");
  }
  close(restore = true) {
    clearTimeout(this.timer); this.controller?.abort(); this.generation++;
    this.editor.concertina.deactivate(this.owner);
    this.editor.decorations.disposeSession(this.owner); this.editor.minimap.dispose(this.owner); this.setState({ open: false, result: undefined, pending: false, concertinaRequested: false });
    if (!restore) return;
    const range = this.navigated?.ranges[0], key = range?.nodeKey ?? this.origin, mount = key && this.editor.mounts.get(key);
    if (mount) {
      this.editor.crossText.clear(); mount.focus();
      if (range?.coordinate === "cell") mount.restoreInlineSelection?.({ anchor: range.start, head: range.end });
      else if (range) mount.restoreSelection?.({ start: range.start, end: range.end, direction: "forward" });
      else if (this.selection) mount.restoreInlineSelection?.(this.selection);
      else if (this.native) mount.restoreSelection?.(this.native);
    }
  }
  install(document: Document) {
    const keydown = (event: KeyboardEvent) => {
      if (editorInputBoundary(event)) return;
      const target = event.target as Element;
      if (target?.closest?.('[data-document-find]')) return;
      const cross = this.editor.crossText.range();
      const crossInput = target?.matches?.('[data-cross-text-input]');
      const resolved = this.editor.mounts.resolveEvent(event) ?? (cross && crossInput ? { nodeKey: cross.anchor.occurrenceKey, handle: this.editor.mounts.get(cross.anchor.occurrenceKey)! } : undefined);
      if (!resolved || resolved.handle.inputPolicy === "opaque-widget" || target?.closest?.('[role="dialog"]')) return;
      const field = target?.closest?.('input, textarea, select');
      if (field && field !== resolved.handle.focusElement && !crossInput) return;
      if (this.editor.bindings.dispatch(event, ["document-find-open"], id => { if (id !== "find.open") return false; this.open(resolved.nodeKey); return this.state.open; })) event.stopImmediatePropagation();
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }
  dispose() { this.close(false); this.unsubscribe(); this.search.dispose(); }
}
