import {contentUnits} from "../block-tree/inline-sequence";
import { batch } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { CanonicalRepository } from "../block-tree/repository";
import type { ContentRecord } from "../block-tree/types";
import { emptyCounts, type TextCounts } from "./text-counts";

/** Session-only cache. No snapshots, serialization, or segmentation in change listeners. */
export class DocumentCounts {
  readonly state;
  private setState;
  private dirty = new Set<string>();
  private memberships = new Map<string, string[]>();
  private timer?: ReturnType<typeof setTimeout>;
  private structure = true;
  private generation = 0;
  private disposed = false;
  private running = false;
  private suspended = false;
  private unsubscribe: () => void;
  constructor(private repository: CanonicalRepository, private root: string, private count: (text: string) => Promise<TextCounts>) {
    [this.state, this.setState] = createStore<{ blocks: Record<string, TextCounts>; totals: Record<string, TextCounts>; pages: Record<string, string>; pending: boolean; error: string }>({ blocks: {}, totals: {}, pages: {}, pending: true, error: "" });
    this.unsubscribe = repository.subscribeChanges(change => {
      if (change.taskStateOwner) return;
      this.generation++;
      if (change.inlineOwner) this.dirty.add(change.inlineOwner);
      else if (change.listWrap) {
        const { child, item, wrapper, wrapped, inlineChanged } = change.listWrap;
        if (inlineChanged) this.dirty.add(child);
        this.setState("pages", wrapper, wrapped ? this.state.pages[item] : undefined!);
      } else {
        this.structure = true;
        for (const [key, previous] of change.previousContents) {
          const current = repository.readState().contents[key];
          if (current && (!previous || current.inlineRevision !== previous.inlineRevision || current.payload.text !== previous.payload.text)) this.dirty.add(key);
        }
      }
      this.schedule();
    });
    this.schedule();
  }
  private textBlock(content: ContentRecord) { return content.inlineKind === "standoff" || ["text-block", "plain-text-block"].includes(content.viewType); }
  private schedule() {
    clearTimeout(this.timer); this.setState("pending", true);
    if (this.disposed || this.suspended) return;
    this.timer = setTimeout(() => { void this.flush(); }, 300);
  }
  /** Retain invalidation and cached totals without dispatching hidden UI work. */
  setSuspended(suspended: boolean) {
    if (this.disposed || suspended === this.suspended) return;
    this.suspended = suspended; this.generation++;
    clearTimeout(this.timer);
    if (!suspended && (this.dirty.size || this.structure)) this.schedule();
  }
  private rebuild() {
    const state = this.repository.readState(), memberships = new Map<string, string[]>(), pages: Record<string,string> = {};
    const visit = (placement: string, scopes: string[], page?: string, excluded = false, ancestors = new Set<string>()) => {
      const content = state.contents[state.placements[placement]?.contentKey]; if (!content || ancestors.has(content.key)) return;
      const path = new Set(ancestors); path.add(content.key);
      excluded ||= /^(left-margin|right-margin|sticky-tab)/.test(content.viewType);
      if (["page-block", "fixed-size-page-block"].includes(content.viewType)) { page = placement; if (!scopes.includes(placement)) scopes = [...scopes, placement]; }
      if (page) pages[placement] = page;
      if (this.textBlock(content)) {
        if (!this.state.blocks[content.key]) this.dirty.add(content.key);
        if (!excluded) memberships.set(content.key, [...(memberships.get(content.key) ?? []), ...scopes]);
      }
      for (const child of content.children) visit(child, scopes, page, excluded, path);
      for (const relation of Object.values(content.ownedRelations)) visit(relation, scopes, page, true, path);
    };
    visit(this.root, [this.root]); this.memberships = memberships;
    const totals: Record<string,TextCounts> = { [this.root]: emptyCounts() };
    for (const page of Object.values(pages)) totals[page] = emptyCounts();
    for (const [key, scopes] of memberships) for (const scope of scopes) {
      const total = totals[scope] ??= emptyCounts(), value = this.state.blocks[key] ?? emptyCounts();
      for (const field of ["words", "characters", "withoutWhitespace"] as const) total[field] += value[field];
    }
    this.setState("totals", reconcile(totals)); this.setState("pages", reconcile(pages)); this.structure = false;
  }
  async flush() {
    clearTimeout(this.timer); if (this.disposed || this.running || this.suspended) return;
    this.running = true;
    const generation = this.generation;
    if (this.structure) this.rebuild();
    const keys = [...this.dirty]; this.dirty.clear();
    try {
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index], state = this.repository.readState(), content = state.contents[key];
        if (!content || !this.textBlock(content)) continue;
        // Inline atoms separate words but contribute no characters themselves.
        const chunks: string[] = []; let text = "";
        if (content.inlineKind === "standoff") {
          let processed = 0;
          for (const cell of contentUnits(state,content)) {
            if (++processed % 2048 === 0) {
              await new Promise(resolve => setTimeout(resolve, 0));
              if (this.disposed) return;
              if (generation !== this.generation) { for (const pending of keys.slice(index)) this.dirty.add(pending); return; }
            }
            if (cell.kind === "text") text += cell.text;
            else { chunks.push(text); text = ""; }
          }
        } else text = String(content.payload.text ?? "");
        chunks.push(text);
        const value = emptyCounts();
        for (const chunk of chunks) {
          const result = await this.count(chunk);
          for (const field of ["words", "characters", "withoutWhitespace"] as const) value[field] += result[field];
        }
        if (this.disposed) return;
        if (generation !== this.generation) { for (const pending of keys.slice(index)) this.dirty.add(pending); this.schedule(); return; }
        const previous = this.state.blocks[key] ?? emptyCounts();
        batch(() => {
          for (const scope of this.memberships.get(key) ?? []) for (const field of ["words", "characters", "withoutWhitespace"] as const) this.setState("totals", scope, field, n => n + value[field] - previous[field]);
          this.setState("blocks", key, value);
        });
      }
      this.setState("pending", false); this.setState("error", "");
    } catch { if (!this.disposed) { this.setState("error", "Counts unavailable; document editing is unaffected."); this.setState("pending", false); } }
    finally { this.running = false; if (!this.disposed && (this.dirty.size || this.structure)) this.schedule(); }
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.unsubscribe(); }
}
