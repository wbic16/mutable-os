import { sourceTextTypes } from '../knowledge/policy';
import { canonicalSearchSource } from "./canonical-search-source";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { BlockNode } from "../block-tree/types";
import type { SearchOptions, SearchSource, SourceMatches } from "./search-matching";
import { runSearchWorker, type SearchRunner } from "./search-worker";

export type ScopeKind = "container" | "page" | "document";
export interface SearchScope { kind: ScopeKind; viewId: string; rootKey: string; placementKey: string; region: "main" | "subtree"; label: string; fallback?: string }
import type { TextRangeSnapshot } from "./text-ranges";
/** Compatibility name for search consumers; coordinates live in the neutral range API. */
export type SearchRange = TextRangeSnapshot;
export interface SearchMatch { id: string; text: string; context: string; captures: (string | undefined)[]; groups?: Record<string, string>; ranges: SearchRange[]; path: string[]; breadcrumb: string; capabilities: { highlight: boolean; reveal: boolean; annotate: boolean; replace: boolean; reason?: string } }
export interface SearchMatchSet { sessionId: string; generation: number; signature: string; scope: SearchScope; revision: number; status: "complete" | "partial" | "cancelled" | "error"; diagnostics: string[]; matches: SearchMatch[]; exact: boolean; deduplication: Record<string, string[]> }
const pages = new Set(["page-block", "fixed-size-page-block"]);
const containers = /^(left-margin|right-margin|table-cell|grid-cell|tab|document-tab|sticky-tab|list|indented-list|text-container|main-list|container)-block$/;
const side = /^(left-margin|right-margin|sticky-tab)/;
export function nodeLabel(node: BlockNode) { const m = node.payload.metadata as Record<string, unknown> | undefined; return String(m?.name ?? m?.label ?? m?.title ?? `${node.viewType.replace(/-block$/, "").replaceAll("-", " ")} · ${String(node.payload.id ?? node.placementKey).slice(0,8)}`); }
export function ancestorPath(editor: ReactiveEditor, key: string): BlockNode[] {
  return editor.blockQueries.ancestorPath(key);
}
export function resolveSearchScope(editor: ReactiveEditor, key: string, kind: ScopeKind = "page"): SearchScope {
  const path = ancestorPath(editor, key), reversed = [...path].reverse();
  const document = reversed.find(n => n.viewType === "document-block");
  if (!document) throw new Error("Focus text inside a document to use Find.");
  const local = reversed.slice(0, reversed.indexOf(document) + 1);
  let root = document, region: SearchScope["region"] = "subtree", fallback: string | undefined;
  if (kind === "page") { root = local.find(n => pages.has(n.viewType)) ?? document; if (root === document) fallback = "No enclosing Page; searching this Document."; }
  if (kind === "container") {
    root = local.find(n => containers.test(n.viewType) || pages.has(n.viewType)) ?? document;
    if (pages.has(root.viewType) || root === document) region = "main";
  }
  return { kind, viewId: root.viewId, rootKey: root.key, placementKey: root.placementKey, region, label: `${nodeLabel(root)}${region === "main" ? " / main text" : ""}`, fallback };
}
export function scopeNodes(editor: ReactiveEditor, scope: SearchScope, extraTypes: readonly string[] = [], owns?: (contentKey:string)=>boolean) {
  const found: { node: BlockNode; path: string[]; breadcrumb: string }[] = [], unsupported = new Set<string>();
  const visit = (key: string, path: string[], labels: string[], seen: Set<string>) => {
    const node = editor.node(key); if (!node || seen.has(node.contentKey)) return;
    if (owns && !owns(node.contentKey)) return;
    if (key !== scope.rootKey && node.viewType === "document-block") return;
    if (scope.region === "main" && key !== scope.rootKey && side.test(node.viewType)) return;
    const route = [...path, key], names = [...labels, nodeLabel(node)], next = new Set(seen).add(node.contentKey);
    if (["standoff-editor-block", "standoff-code-mirror-block", "text-block", "plain-text-block", ...sourceTextTypes,...extraTypes].includes(node.viewType)) found.push({ node, path: route, breadcrumb: names.join(" / ") });
    else if (typeof node.payload.text === "string" && node.payload.text) unsupported.add(node.viewType);
    for (const child of node.children) visit(child, route, names, next);
    for (const [, child] of Object.entries(node.ownedRelations).sort(([a], [b]) => a.localeCompare(b))) visit(child, route, names, next);
  };
  const ancestors = ancestorPath(editor, scope.rootKey).slice(0, -1);
  visit(scope.rootKey, ancestors.map(n => n.key), ancestors.map(nodeLabel), new Set());
  return { found, unsupported: [...unsupported] };
}
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

/** Pure result producer: no decorations, focus changes, history, or repository writes. */
export class TextSearch {
  private sources = new Map<string, SearchSource>();
  private results = new Map<string, { signature: string; version: number; result: SourceMatches }>();
  private generation = 0;
  private epochs = new Map<string, number>();
  private clock = 0;
  private unsubscribe: () => void;
  constructor(private editor: ReactiveEditor, private runner: SearchRunner = runSearchWorker) {
    // Canonical inlineRevision can repeat after undo + a different edit branch.
    // Session-monotonic text epochs prevent reusing that branch's cached text.
    this.unsubscribe = editor.repository.subscribeChanges(change => {
      const invalidate = (key: string) => { this.epochs.set(key, ++this.clock); this.sources.delete(key); this.results.delete(key); };
      if (change.inlineOwner) invalidate(change.inlineOwner);
      else for (const [key, previous] of change.previousContents) {
        const current = editor.repository.readState().contents[key];
        if (!current || !previous || current.inlineRevision !== previous.inlineRevision || current.payload.text !== previous.payload.text) invalidate(key);
      }
    });
  }
  private async source(node: BlockNode, signal?: AbortSignal): Promise<SearchSource> {
    const state = this.editor.repository.readState(), content = state.contents[node.contentKey];
    const version = this.epochs.get(content.key) ?? 0;
    const cached = this.sources.get(content.key); if (cached?.version === version) return cached;
    const result = await canonicalSearchSource(state, content.key, version, signal);
    if(content.viewType==='standoff-code-mirror-block')result.runs=result.runs.map(run=>({...run,text:run.text.replace(/\r\n?/g,'\n')}));
    if ((this.epochs.get(content.key) ?? 0) !== version) throw new DOMException("Document changed; search again.", "AbortError");
    this.sources.set(content.key, result); return result;
  }
  async searchText(request: { query: string; options?: SearchOptions; scope: SearchScope; signal?: AbortSignal; owns?: (contentKey: string) => boolean }): Promise<SearchMatchSet> {
    const { query, scope, signal } = request, options = request.options ?? {}, generation = ++this.generation;
    const signature = JSON.stringify([query, options]);
    const set: SearchMatchSet = { sessionId: crypto.randomUUID(), generation, signature, scope: { ...scope }, revision: this.editor.repository.state.revision, status: "complete", diagnostics: [], matches: [], exact: true, deduplication: {} };
    try {
      if (!this.editor.node(scope.rootKey)) throw new Error("The search scope no longer exists.");
      if (!query) return freeze(set);
      const { found, unsupported } = scopeNodes(this.editor, scope, [], request.owns);
      if (unsupported.length) { set.status = "partial"; set.exact = false; set.diagnostics.push(`Not searched (adapter required): ${unsupported.join(", ")}.`); }
      const sources = new Map<string, SearchSource>();
      let visited = 0;
      for (const { node } of found) {
        if (++visited % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
        if (!sources.has(node.contentKey)) sources.set(node.contentKey, await this.source(node, signal));
      }
      const dirty = [...sources.values()].filter(s => { const c = this.results.get(s.contentKey); return !c || c.signature !== signature || c.version !== s.version; });
      const local = new Map<string, SourceMatches>();
      for (const s of sources.values()) { const cached = this.results.get(s.contentKey); if (cached?.signature === signature && cached.version === s.version) local.set(s.contentKey, cached.result); }
      if (dirty.length || !sources.size) for (const result of await this.runner(dirty, query, options, signal)) {
        local.set(result.contentKey, result); this.results.set(result.contentKey, { signature, version: sources.get(result.contentKey)!.version, result });
      }
      if (signal?.aborted || set.revision !== this.editor.repository.state.revision) throw new DOMException("Document changed; search again.", "AbortError");
      let zeroWidth = 0;
      for (const result of local.values()) { zeroWidth += result.zeroWidth; if (result.truncated) { set.status = "partial"; set.exact = false; } }
      if (zeroWidth) set.diagnostics.push(`${zeroWidth} zero-width regex matches skipped.`);
      outer: for (const { node, path, breadcrumb } of found) {
        const source = sources.get(node.contentKey)!;
        // Cache epochs distinguish undo branches; edit authority uses canonical range versions.
        const content = this.editor.repository.readState().contents[node.contentKey];
        const rangeVersion = source.coordinate === "cell" ? content.inlineRevision : content.revision;
        for (const raw of local.get(node.contentKey)?.matches ?? []) {
          if (set.matches.length >= 5000) { set.status = "partial"; set.exact = false; break outer; }
          const id = `${set.sessionId}:${set.matches.length}`;
          const range: SearchRange = { nodeKey: node.key, contentKey: node.contentKey, placementKey: node.placementKey, version: rangeVersion, start: raw.start, end: raw.end, coordinate: source.coordinate };
          set.matches.push({ id, text: raw.text, context: raw.context, captures: raw.captures, groups: raw.groups, ranges: [range], path, breadcrumb, capabilities: { highlight: source.coordinate === "cell" || node.viewType==='standoff-code-mirror-block', reveal: true, annotate: source.coordinate === "cell" && raw.actionable, replace: raw.actionable && node.viewType!=='standoff-code-mirror-block', reason: node.viewType==='standoff-code-mirror-block'?"Use the native CodeMirror search panel for source replacement.": !raw.actionable ? "Range splits a grapheme cluster." : source.coordinate === "utf16" ? "Plain-text results support reveal, not standoff highlights or annotations." : undefined } });
          (set.deduplication[`${node.contentKey}:${raw.start}:${raw.end}`] ??= []).push(id);
        }
      }
      if (!set.exact && set.matches.length >= 5000) set.diagnostics.push("Preview limited to 5,000 matches; narrow the scope or query.");
      const plain = set.matches.filter(match => !match.capabilities.highlight).length;
      if (plain) set.diagnostics.push(`${plain} plain-text matches support navigation but not SVG highlighting in native textareas.`);
    } catch (error) { set.matches = []; set.deduplication = {}; set.exact = false; set.status = (error as Error).name === "AbortError" ? "cancelled" : "error"; set.diagnostics.push((error as Error).message); }
    return freeze(set);
  }
  dispose() { this.unsubscribe(); this.sources.clear(); this.results.clear(); this.epochs.clear(); }
}
