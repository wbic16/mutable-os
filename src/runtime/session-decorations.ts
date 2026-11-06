import type { EffectParams, RendererBinding, PropertyTypeDefinition } from "./visual-effect-registry";
import { immutable } from "./effect-contributions";
import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import type { SearchMatchSet } from "./text-search";
import type { TextRangeSnapshot } from "./text-ranges";
export interface TemporaryRange {
  id: string;
  range: TextRangeSnapshot;
  type?: string;
  attributes?: EffectParams;
  renderers?: readonly RendererBinding[];
  states?: PropertyTypeDefinition['states'];
  stateOrder?: readonly string[];
  events?: PropertyTypeDefinition['events'];
}
export interface TemporaryRangeCollection {
  replace(ranges: readonly TemporaryRange[]): void;
  upsert(range: TemporaryRange): void;
  remove(id: string): void;
  dispose(): void;
}
export interface SessionDecoration {
  runtimeKey: string;
  temporary?: TemporaryRange;
  renderers: readonly RendererBinding[]; type: string; owner: string; id: string; range: TextRangeSnapshot; fill: string; active: boolean; priority: number; excludable: boolean; excludeLabel?: string; excludeTitle?: string }
interface DecorationMatch { temporary?: TemporaryRange; id: string; ranges: TextRangeSnapshot[]; capabilities: { highlight: boolean } }
interface Layer { matches: DecorationMatch[]; visible: boolean; hidden: Set<string>; invalid: Set<string>; active?: string; type: string; fill: string; priority: number; excludeLabel?: string; excludeTitle?: string; exclude?: (id: string, context: { keyboard: boolean }) => void }
/** Entirely outside canonical state. Indexed by occurrence so editing one Block does not wake every view. */
export class SessionDecorations {
  readonly nodes: Record<string, SessionDecoration[]>;
  private setNodes;
  private disposed = false;
  private claims = new Set<string>();
  private validate?: (ranges: readonly TextRangeSnapshot[]) => void;
  private validateEffects?: (range:TemporaryRange) => void;
  configureValidation(validate: (ranges: readonly TextRangeSnapshot[]) => void, effects?: (range:TemporaryRange)=>void) { this.validate = validate; this.validateEffects=effects; }
  private assertLive() { if (this.disposed) throw Error("Temporary ranges are disposed"); }
  private owners = new Map<string, Layer>();
  private contentIndex = new Map<string, { nodes: Set<string>; matches: { layer: Layer; owner:string; match: DecorationMatch }[] }>();
  private ownerIndex = new Map<string, { nodes: Set<string>; contents: Set<string> }>();
  private nodeOwners = new Map<string, Map<string, SessionDecoration[]>>();
  private ownerOrder = new Map<string, number>();
  private nextOrder = 0;
  constructor() { [this.nodes, this.setNodes] = createStore<Record<string, SessionDecoration[]>>({}); }
  attachMatches(owner: string, set: SearchMatchSet, style: { type?: string; fill?: string; priority?: number; excludeLabel?: string; excludeTitle?: string; exclude?: (id: string, context: { keyboard: boolean }) => void } = {}) {
    this.assertLive();
    const previous = this.owners.get(owner);
    this.owners.set(owner, { matches: set.matches, visible: previous?.visible ?? true, hidden: new Set(), invalid:new Set(), type: style.type ?? "editor/search-match", fill: style.fill ?? "#ffd34d", priority: style.priority ?? 0, exclude: style.exclude, excludeLabel: style.excludeLabel, excludeTitle: style.excludeTitle });
    this.refreshOwner(owner);
  }
  attachRanges(owner: string, ranges: TextRangeSnapshot[], style: { type?: string; fill?: string; priority?: number } = {}) {
    this.assertLive();
    this.owners.set(owner, { matches: [{ id: owner, ranges, capabilities: { highlight: true } }], visible: true, hidden: new Set(), invalid:new Set(), type: style.type ?? "editor/range-preview", fill: style.fill ?? "#ffd34d", priority: style.priority ?? 0 });
    this.refreshOwner(owner);
  }
  /** One collection per feature/interaction. Callers bind dispose to their Solid/feature owner. */
  createCollection(owner: string): TemporaryRangeCollection {
    this.assertLive();
    if (!owner || this.claims.has(owner) || this.owners.has(owner)) throw Error('Temporary range owner already in use');
    this.claims.add(owner);
    let live = true;
    const items = new Map<string, TemporaryRange>();
    const check = () => { this.assertLive(); if (!live) throw Error('Temporary range collection is disposed'); };
    const admit = (ranges: readonly TemporaryRange[]) => {
      const ids = new Set<string>();
      for (const item of ranges) {
        if (!item.id || ids.has(item.id)) throw Error('Temporary range IDs must be unique'); ids.add(item.id);
        const r = item.range;
        if (!r || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end <= r.start) throw Error('Invalid temporary range');
      }
      this.validate?.(ranges.map(item => item.range));
      for(const item of ranges)this.validateEffects?.(item);
      return ranges.map(item => immutable(structuredClone(item)) as TemporaryRange);
    };
    const publish = () => {
      // Invalidation is terminal for an old snapshot even if a provider updates
      // a different item or toggles visibility later.
      for(const [id,item] of items)try{this.validate?.([item.range]);}catch{items.delete(id);}
      this.owners.set(owner, { matches: [...items.values()].map(temporary => ({ id: temporary.id, ranges: [temporary.range], temporary, capabilities: {highlight:true} })), visible:true, hidden:new Set(), invalid:new Set(), type:'editor/temporary-range', fill:'#ffd34d', priority:0 });
      this.refreshOwner(owner);
    };
    return {
      replace: ranges => { check(); const next=admit(ranges); items.clear(); for(const r of next) items.set(r.id,r); publish(); },
      upsert: range => { check(); const [next]=admit([range]); items.set(next.id,next); publish(); },
      remove: id => { check(); items.delete(id); publish(); },
      dispose: () => { if(!live)return;live=false;items.clear();this.claims.delete(owner);this.disposeSession(owner); },
    };
  }
  /** Release only this mounted occurrence; other views of shared content survive. */
  removeOccurrence(nodeKey: string) {
    const owners = [...(this.nodeOwners.get(nodeKey)?.keys() ?? [])];
    batch(() => { for (const owner of owners) {
      const layer = this.owners.get(owner); if (!layer) continue;
      layer.matches = layer.matches.map(match => ({ ...match, ranges: match.ranges.filter(range => range.nodeKey !== nodeKey) }));
      this.refreshOwner(owner);
    } });
  }

  dispose() { if(this.disposed)return; this.disposed=true; this.clearAll(); this.claims.clear(); }
  setHighlightsVisible(owner: string, visible: boolean) { const layer = this.owners.get(owner); if (layer) { layer.visible = visible; this.refreshOwner(owner); } }
  setMatchVisible(owner: string, id: string, visible: boolean) { const layer = this.owners.get(owner); if (layer) { visible ? layer.hidden.delete(id) : layer.hidden.add(id); this.refreshOwner(owner); } }
  setActiveMatch(owner: string, id?: string) { const layer = this.owners.get(owner); if (layer) { layer.active = id; this.refreshOwner(owner); } }
  clearHighlights(owner: string) { this.owners.delete(owner); this.refreshOwner(owner); }
  disposeSession(owner: string) { this.clearHighlights(owner); }
  exclude(owner: string, id: string, keyboard = false) { this.owners.get(owner)?.exclude?.(id, { keyboard }); }
  /** Called only for changed content; does not scan text or measure geometry. */
  invalidateContent(contentKey: string) {
    const affected = this.contentIndex.get(contentKey); if (!affected) return;
    const removals=new Map<string,Set<string>>();
    for(const {layer,owner,match} of affected.matches){
      layer.invalid.add(match.id);
      for(const range of match.ranges){const keys=removals.get(range.nodeKey)??new Set();keys.add(JSON.stringify([owner,match.id]));removals.set(range.nodeKey,keys);}
    }
    batch(()=>{for(const [node,keys] of removals) {
      const keep = (d:SessionDecoration) => !keys.has(JSON.stringify([d.owner,d.id]));
      const owners = this.nodeOwners.get(node);
      if (owners) for (const [owner, decorations] of owners) owners.set(owner, decorations.filter(keep));
      this.setNodes(node,(current:SessionDecoration[]|undefined)=>(current??[]).filter(keep));
    }});
    this.contentIndex.delete(contentKey);
  }

  clearAll() { const owners = [...this.ownerIndex.keys()]; this.owners.clear(); batch(() => owners.forEach(owner => this.refreshOwner(owner))); }
  /** Rebuild only this owner's indexes and the nodes its old/new ranges touch. */
  private refreshOwner(owner: string) {
    if (this.owners.has(owner) && !this.ownerOrder.has(owner)) this.ownerOrder.set(owner, this.nextOrder++);
    const previous = this.ownerIndex.get(owner), affected = new Set(previous?.nodes);
    for (const key of previous?.contents ?? []) {
      const entry = this.contentIndex.get(key); if (!entry) continue;
      entry.matches = entry.matches.filter(item => item.owner !== owner);
      if (!entry.matches.length) this.contentIndex.delete(key);
    }
    for (const node of affected) this.nodeOwners.get(node)?.delete(owner);
    const index = { nodes: new Set<string>(), contents: new Set<string>() };
    const next = new Map<string, SessionDecoration[]>(), layer = this.owners.get(owner);
    if (layer) for (const match of layer.matches) {
      if (layer.invalid.has(match.id)) continue;
      for (const range of match.ranges) {
        index.nodes.add(range.nodeKey); index.contents.add(range.contentKey); affected.add(range.nodeKey);
        let entry = this.contentIndex.get(range.contentKey);
        if (!entry) this.contentIndex.set(range.contentKey, entry = { nodes: new Set(), matches: [] });
        entry.nodes.add(range.nodeKey); entry.matches.push({ layer, owner, match });
      }
      if (!layer.visible || layer.hidden.has(match.id) || !match.capabilities.highlight) continue;
      for (const [i, range] of match.ranges.entries()) {
        const values = next.get(range.nodeKey) ?? []; next.set(range.nodeKey, values);
        values.push({
          runtimeKey: JSON.stringify([owner,match.id,range.nodeKey,i]), temporary: match.temporary,
          renderers: match.temporary ? match.temporary.renderers ?? [] : [{id:'highlight',name:'svg-highlight',params:{color:layer.fill}}, ...(layer.active===match.id?[{id:'active',name:'svg-outline',params:{color:'#8a5100'}}]:[])],
          owner, type: match.temporary?.type ?? layer.type, id: match.id, range, fill: layer.fill, active: layer.active === match.id, priority: layer.priority, excludeLabel: layer.excludeLabel, excludeTitle: layer.excludeTitle, excludable: !!layer.exclude && i === match.ranges.length - 1,
        });
      }
    }
    if (layer) this.ownerIndex.set(owner, index); else this.ownerIndex.delete(owner);
    batch(() => { for (const key of affected) {
      let owners = this.nodeOwners.get(key);
      if (!owners) this.nodeOwners.set(key, owners = new Map());
      // Retain empty/hidden owners for occurrence disposal as well.
      if (index.nodes.has(key)) owners.set(owner, next.get(key) ?? []);
      const value = [...owners.values()].flat().sort((a,b) => a.priority - b.priority || this.ownerOrder.get(a.owner)! - this.ownerOrder.get(b.owner)!);
      if (JSON.stringify(this.nodes[key] ?? []) !== JSON.stringify(value)) this.setNodes(key, value);
      if (!owners.size) this.nodeOwners.delete(key);
    } });
    if (!layer) this.ownerOrder.delete(owner);
  }
}
