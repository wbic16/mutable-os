import {safeUrl} from './inline-values.mjs';
export {safeUrl} from './inline-values.mjs';
import type { JsonObject } from '../block-tree/types';
import { isReadingRelation, validateAlternativeSlot, type InlineAlternativeProperties } from '../block-tree/inline-alternative';
import { validateCapabilities } from './capabilities';
import { transferSemanticPointers } from './semantic-transfer';
import { clone } from '../block-tree/clone';

export type Reference = { kind: 'local'; object: 'block' | 'definition' | 'asset'; id: string }
  | { kind: 'external'; object: 'block' | 'definition' | 'entity' | 'asset'; id: string; source: { cavernId?: string; resourceId?: string } }
  | { kind: 'url'; url: string };
export interface Property {
  localId: string; type: string; startIndex: number; endIndex: number; isZeroWidth: boolean;
  affinity?: 'before' | 'after'; attributes: JsonObject; target?: Reference;
  pointEndOffset?: -1;
}
export interface FragmentBlock {
  localId: string; type: string; data: JsonObject;
  inline?: { atoms: Array<{ kind: 'text'; text: string } | { kind: 'embed'; embed: string } | { kind: 'alternative'; properties: InlineAlternativeProperties; displayReading?: number }>; properties: Property[] };
  blockProperties: Array<{ localId: string; type: string; attributes: JsonObject; target?: Reference }>;
  children: string[]; relations: Record<string, string>;
}
export interface MutableFragment {
  kind: 'mutable-fragment'; version: 1; coordinates: 'unicode-scalar-or-object-v1';
  roots: Array<{ placement: string; openStart: boolean; openEnd: boolean; clippedStart: boolean; clippedEnd: boolean; separatorAfter?: 'paragraph' | 'selection-gap' }>;
  blocks: FragmentBlock[];
  placements: Array<{ localId: string; kind: 'owned' | 'reference'; target: Reference }>;
  definitions: Array<{ localId: string; type: string; attributes: JsonObject; target?: Reference }>;
  links: Array<{ localId: string; type: string; from: { object: 'block' | 'property' | 'definition'; id: string }; to: Reference; attributes: JsonObject }>;
  embeds: Array<{ localId: string; type: string; asset?: Reference; data: JsonObject }>;
  assets: Array<{ localId: string; source: JsonObject; mediaType?: string }>;
  provenance?: { cavernId?: string; resourceId?: string; producer?: string };
  requiredCapabilities?: string[];
}
export interface InterchangeScope { cavernId?: string; resourceId?: string }
export const LIMITS = { bytes: 8 * 1024 * 1024, cells: 200000, blocks: 10000, properties: 20000, depth: 64, opaque: 256 * 1024 };
export const emptyFragment = (): MutableFragment => ({ kind: 'mutable-fragment', version: 1, coordinates: 'unicode-scalar-or-object-v1', roots: [], blocks: [], placements: [], definitions: [], links: [], embeds: [], assets: [] });
export const lengthOf = (b: FragmentBlock) => b.inline?.atoms.reduce((n, a) => n + (a.kind === 'text' ? [...a.text].length : 1), 0) ?? 0;

/** Extract disjoint groups without decoding into repository objects or reallocating IDs. */
export function fragmentGroup(f: MutableFragment, roots: MutableFragment['roots']): MutableFragment {
  const blocks = new Set<string>(), edges = new Set<string>(), definitions = new Set<string>(), embeds = new Set<string>(), assets = new Set<string>();
  const bm = new Map(f.blocks.map(b => [b.localId, b])), pm = new Map(f.placements.map(p => [p.localId, p]));
  const visit = (edge: string) => {
    if (edges.has(edge)) return; edges.add(edge);
    const p = pm.get(edge)!; if (p.target.kind !== 'local' || blocks.has(p.target.id)) return;
    const b = bm.get(p.target.id)!; blocks.add(b.localId);
    [...b.children, ...Object.values(b.relations)].forEach(visit);
    for (const a of b.inline?.atoms ?? []) if (a.kind === 'embed') embeds.add(a.embed);
  };
  roots.forEach(r => visit(r.placement));
  const target = (ref?: Reference) => {
    if (ref?.kind !== 'local') return;
    if (ref.object === 'block' && !blocks.has(ref.id)) throw Error('A disjoint clipboard group references another group. Paste into one selection to preserve that relationship.');
    if (ref.object === 'definition') definitions.add(ref.id);
    if (ref.object === 'asset') assets.add(ref.id);
  };
  for (const b of f.blocks) if (blocks.has(b.localId)) for (const p of [...b.blockProperties, ...b.inline?.properties ?? []]) target(p.target);
  const links = f.links.filter(l => l.from.object === 'block' && blocks.has(l.from.id)); links.forEach(l => target(l.to));
  for (const d of f.definitions) if (definitions.has(d.localId)) target(d.target);
  const scan=(value:unknown)=>transferSemanticPointers(clone(value),(kind,id)=>{
    if(kind==='definition')definitions.add(id);
    else if(!blocks.has(id))throw Error('A disjoint clipboard group references another group. Paste into one selection to preserve that relationship.');
    return id;
  },f.provenance??{});
  for(const b of f.blocks)if(blocks.has(b.localId)){scan(b.data);for(const p of [...b.blockProperties,...b.inline?.properties??[]])scan(p.attributes);for(const a of b.inline?.atoms??[])if(a.kind==='alternative'&&a.properties.metadata)scan(a.properties.metadata);}
  const dm=new Map(f.definitions.map(d=>[d.localId,d]));
  for(const id of definitions){const d=dm.get(id);if(d){scan(d.attributes);target(d.target);}}
  for (const e of f.embeds) if (embeds.has(e.localId)) target(e.asset);
  return validateFragment({ ...f, roots: roots.map((r, i) => ({ ...r, separatorAfter: i < roots.length - 1 ? r.separatorAfter : undefined })).map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined))), blocks: f.blocks.filter(b => blocks.has(b.localId)), placements: f.placements.filter(p => edges.has(p.localId)), definitions: f.definitions.filter(d => definitions.has(d.localId)), links, embeds: f.embeds.filter(e => embeds.has(e.localId)), assets: f.assets.filter(a => assets.has(a.localId)) });
}

/** Validate before allocating editor objects. No DOM, resolver, or repository access. */
export function validateFragment(input: unknown): MutableFragment {
  let nodes = 0;
  const data = (value: any, depth = 0): void => {
    if (depth > LIMITS.depth || ++nodes > 1000000) throw Error('Clipboard data is too complex.');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) { value.forEach(v => data(v, depth + 1)); return; }
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Invalid clipboard value.');
    for (const [key, v] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Unsafe clipboard key.');
      data(v, depth + 1);
    }
  };
  data(input);
  if (new TextEncoder().encode(JSON.stringify(input)).length > LIMITS.bytes) throw Error('Clipboard data exceeds the size limit.');
  const f = input as MutableFragment;
  validateCapabilities(f.requiredCapabilities);
  function assert(ok: unknown, message = 'Invalid Mutable clipboard fragment.'): asserts ok { if (!ok) throw Error(message); }
  const str = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 1024;
  const obj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  assert(f?.kind === 'mutable-fragment' && f.version === 1 && f.coordinates === 'unicode-scalar-or-object-v1', 'Unsupported Mutable clipboard version.');
  for (const name of ['roots', 'blocks', 'placements', 'definitions', 'links', 'embeds', 'assets'] as const) assert(Array.isArray(f[name]));
  assert(f.blocks.length <= LIMITS.blocks && f.placements.length <= LIMITS.blocks * 4 && f.roots.length > 0);
  const ids = new Map<string, string>();
  const add = (v: any, kind: string) => { assert(obj(v) && str(v.localId) && !ids.has(v.localId), 'Duplicate or invalid clipboard identity.'); ids.set(v.localId, kind); };
  for (const [table, kind] of [[f.blocks, 'block'], [f.placements, 'placement'], [f.definitions, 'definition'], [f.links, 'link'], [f.embeds, 'embed'], [f.assets, 'asset']] as const) for (const v of table) add(v, kind);
  let cells = 0, properties = 0;
  const references: Reference[] = [];
  for (const b of f.blocks) {
    assert(str(b.type) && obj(b.data) && Array.isArray(b.children) && obj(b.relations) && Array.isArray(b.blockProperties));
    if (b.inline) {
      assert(obj(b.inline) && Array.isArray(b.inline.atoms) && Array.isArray(b.inline.properties));
      for (const a of b.inline.atoms) {
        assert(obj(a));
        if(a.kind==='alternative') {
          validateAlternativeSlot(a.properties);
          assert(a.displayReading===undefined || Number.isInteger(a.displayReading)&&a.displayReading>=0&&a.displayReading<a.properties.readings.length);
        } else assert(a.kind === 'text' ? typeof a.text === 'string' : a.kind === 'embed' && ids.get(a.embed) === 'embed');
      }
      const length = lengthOf(b); cells += length;
      for (const p of b.inline.properties) {
        add(p, 'property'); properties++;
        assert(str(p.type) && obj(p.attributes) && Number.isInteger(p.startIndex) && Number.isInteger(p.endIndex) && p.startIndex >= 0 && p.endIndex <= length);
        assert(typeof p.isZeroWidth === 'boolean' && (p.isZeroWidth ? p.startIndex === p.endIndex : p.startIndex < p.endIndex));
        assert(p.affinity === undefined || p.affinity === 'before' || p.affinity === 'after');
        assert(p.pointEndOffset===undefined||p.isZeroWidth&&p.pointEndOffset===-1);
        if (p.target) references.push(p.target);
      }
    }
    for (const p of b.blockProperties) { add(p, 'property'); properties++; assert(str(p.type) && obj(p.attributes)); if (p.target) references.push(p.target); }
    for (const key of [...b.children, ...Object.values(b.relations)]) assert(ids.get(key) === 'placement');
  }
  assert(cells <= LIMITS.cells && properties <= LIMITS.properties, 'Clipboard content exceeds the import limits.');
  for (const d of f.definitions) { assert(str(d.type) && obj(d.attributes)); if (d.target) references.push(d.target); }
  for (const p of f.placements) { assert(p.kind === 'owned' || p.kind === 'reference'); references.push(p.target); assert(p.target.kind !== 'url' && p.target.object === 'block'); }
  for (const e of f.embeds) { assert(str(e.type) && obj(e.data)); if (e.asset) references.push(e.asset); }
  for (const a of f.assets) assert(obj(a.source) && ['managed', 'transfer', 'remote', 'unresolved'].includes(String(a.source.kind)));
  for (const l of f.links) { assert(str(l.type) && obj(l.attributes) && obj(l.from) && ids.get(l.from.id) === l.from.object); references.push(l.to); }
  for (const r of references) {
    assert(obj(r));
    if (r.kind === 'local') assert(['block', 'definition', 'asset'].includes(r.object) && ids.get(r.id) === r.object, 'Dangling clipboard reference.');
    else if (r.kind === 'external') assert(['block', 'definition', 'entity', 'asset'].includes(r.object) && str(r.id) && obj(r.source) && Object.entries(r.source).every(([k, v]) => ['cavernId', 'resourceId'].includes(k) && str(v)));
    else assert(r.kind === 'url' && typeof r.url === 'string'); // Unsafe URLs are quarantined, never opened.
  }
  const placements = new Map(f.placements.map(p => [p.localId, p]));
  const blocks = new Map(f.blocks.map(b => [b.localId, b]));
  const readingOwners = new Set<string>();
  for(const b of f.blocks) {
    const relations = new Set<string>(), slots = new Set<string>();
    for(const a of b.inline?.atoms??[]) if(a.kind==='alternative') {
      assert(!slots.has(a.properties.id),'Duplicate alternative slot identity.'); slots.add(a.properties.id);
      for(const name of a.properties.readings) {
        assert(!relations.has(name),'Shared inline reading relation.'); relations.add(name);
        const p=placements.get(b.relations[name]), reading=p?.target.kind==='local'?blocks.get(p.target.id):undefined;
        assert(p?.kind==='owned' && reading?.type==='standoff-editor-block' && reading.inline && !reading.children.length && Object.keys(reading.relations).every(isReadingRelation) && !reading.data.opaqueRelations,'Invalid native inline reading closure.');
        assert(!readingOwners.has(reading.localId),'Shared inline reading ownership.'); readingOwners.add(reading.localId);
      }
    }
    assert(Object.keys(b.relations).filter(isReadingRelation).every(name=>relations.has(name)),'Orphan inline reading relation.');
  }
  const ownerCounts=new Map<string,number>();
  for(const p of f.placements)if(p.kind==='owned'&&p.target.kind==='local')ownerCounts.set(p.target.id,(ownerCounts.get(p.target.id)??0)+1);
  for(const id of readingOwners) assert(ownerCounts.get(id)===1,'Inline reading has multiple owners.');
  const visiting = new Set<string>(), visited = new Set<string>(), edges = new Set<string>();
  const walk = (id: string, depth: number) => {
    assert(depth <= LIMITS.depth && !visiting.has(id), 'Cyclic clipboard ownership.');
    if (visited.has(id)) return;
    visiting.add(id); const b = blocks.get(id)!;
    for (const e of [...b.children, ...Object.values(b.relations)]) {
      assert(!edges.has(e), 'A placement has multiple owners.'); edges.add(e);
      const p = placements.get(e)!;
      if (p.target.kind === 'local' && !(p.kind==='reference' && visiting.has(p.target.id))) walk(p.target.id, depth + 1);
    }
    visiting.delete(id); visited.add(id);
  };
  for (const r of f.roots) {
    assert(obj(r) && ids.get(r.placement) === 'placement' && !edges.has(r.placement)); edges.add(r.placement);
    for (const k of ['openStart', 'openEnd', 'clippedStart', 'clippedEnd'] as const) assert(typeof r[k] === 'boolean');
    assert(!r.separatorAfter || ['paragraph', 'selection-gap'].includes(r.separatorAfter));
    const p = placements.get(r.placement)!; if (p.target.kind === 'local') walk(p.target.id, 0);
  }
  assert(visited.size === f.blocks.length && edges.size === f.placements.length, 'Unreachable clipboard objects.');
  return f;
}
