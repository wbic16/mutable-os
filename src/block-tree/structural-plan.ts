import {preferencesMetadataOwner} from './dialectic-preferences-plan';
import {sequenceMetadataOwner} from './dialectic-sequence-plan';
import { isReadingRelation } from './inline-alternative';
import { tabOrientationRecordChange, tabMetadataRecordChange } from './tab-orientation';
import {dialecticRangeRoot,dialecticRangePayloadOnly} from './dialectic-range-plan';
import { inlineOwnerFor } from './inline-plan';
import type { ContentRecord, Location, PlacementRecord, RepositoryOperation, RepositoryState } from './types';

export interface StructuralChange { preferencesMetadataOwner?:string; definitionChanges?:{owner:string;ids:string[]}; sequenceMetadataOwner?:string; rangePayloadOwners?:string[]; gloss?: import("./gloss-plan").GlossChange; tabOrientationOwner?: string; tabMetadata?: { owners: string[]; inlineOwner?: string }; membership?: { key:string; before?:string; after?:string }[]; contents: string[]; childrenOwners: string[]; inlineOwners: string[] }
export interface StructuralEvidence {
  locationOf(key: string): Location | undefined;
  referenceCount(key: string): number;
  ownedKeys(key: string): Iterable<string>;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ordinary = (p: PlacementRecord) => !p.externalReference && !p.resolvedReference && !p.resourceRegistration && p.kind !== 'reference';
const edges = (c: ContentRecord, visit: (key: string, location: Location) => boolean): boolean =>
  c.children.every((key, index) => visit(key, { ownerContentKey: c.key, slot: { kind: 'children' }, index })) &&
  c.inlineContent.every((key, index) => visit(key, { ownerContentKey: c.key, slot: { kind: 'inline-content' }, index })) &&
  Object.entries(c.ownedRelations).every(([name, key]) => visit(key, { ownerContentKey: c.key, slot: { kind: 'relation', name } }));

/** Conservative proof of a local, same-resource record batch. Unclassified edits
 * retain full validation. Nothing trusts the command name or a caller's hint.
 * Unique incoming ownership + indexed locations let us check changed edges and
 * ancestry without enumerating unrelated records or traversing unchanged text. */
export function structuralChangeFor(state: RepositoryState, operations: RepositoryOperation[], evidence: StructuralEvidence): StructuralChange | undefined {
  if (!operations.length) return;
  const preferencesOwner=preferencesMetadataOwner(state,operations);
  if(preferencesOwner)return {preferencesMetadataOwner:preferencesOwner,contents:[preferencesOwner],childrenOwners:[],inlineOwners:[]};
  const sequenceOwner=sequenceMetadataOwner(state,operations);
  if(sequenceOwner)return {sequenceMetadataOwner:sequenceOwner,contents:[sequenceOwner],childrenOwners:[],inlineOwners:[]};
  const definitionIds:string[]=[];
  const rangeRoot=dialecticRangeRoot(state,operations,evidence,definitionIds);
  const contents = new Map<string, ContentRecord | undefined>(), placements = new Map<string, PlacementRecord | undefined>();
  for (const op of operations) {
    if (op.kind === 'set-root' || op.kind === 'record-batch') return;
    const key = op.kind === 'put-content' || op.kind === 'put-placement' ? op.record.key : op.key;
    if (op.kind === 'put-content' || op.kind === 'remove-content') {
      if (contents.has(key)) return;
      const old = state.contents[key], next = op.kind === 'put-content' ? op.record : undefined;
      if (!old && !next) return;
      if (old && next && (old.viewType !== next.viewType || old.inlineKind !== next.inlineKind || old.definitionOwnerKey !== next.definitionOwnerKey || old.payload.id !== next.payload.id || !same(old.ownedRelations, next.ownedRelations))) return;
      if (['document-block', 'workspace-block'].includes((old ?? next)!.viewType)) {
        if (!old || !next) return;
        const rest = ({ children, wireChildren, revision, ...c }: ContentRecord) => c;
        const candidate=rangeRoot?.key===next.key?rangeRoot:next;
        // Absent fields must remain absent for the pre-existing structural proof.
        if(rangeRoot?.key===next.key&&old.payload.linkedAnnotations===undefined)delete candidate.payload.linkedAnnotations;
        if (!same(rest(old), rest(candidate))) return;
      }
      if (next?.definitionOwnerKey && ['text-cell', 'image-cell'].includes(next.viewType)) return;
      if (old && next && (next.children.length || Object.keys(next.opaqueRelations).length)) {
        // Reading shape is an invariant of its owning host, which may be absent
        // from this batch. Use the existing incoming-edge index, then let the
        // full graph validator reject unsupported structural reading edits.
        for (const pk of evidence.ownedKeys(key)) {
          const location = evidence.locationOf(pk);
          if (location?.slot.kind === 'relation' && isReadingRelation(location.slot.name)) return;
        }
      }
      contents.set(key, next);
    } else {
      if (placements.has(key) || key === state.rootPlacementKey) return;
      const old = state.placements[key], next = op.kind === 'put-placement' ? op.record : undefined;
      if (!old && !next || old && !ordinary(old) || next && !ordinary(next) || old && next && !same(old, next)) return;
      placements.set(key, next);
    }
  }
  const content = (key: string) => contents.has(key) ? contents.get(key) : state.contents[key];
  const placement = (key: string) => placements.has(key) ? placements.get(key) : state.placements[key];
  const locations = new Map<string, Location | undefined>(), affected = new Set<string>();
  for (const [key] of contents) {
    const old = state.contents[key];
    if (old) edges(old, pk => { locations.set(pk, undefined); affected.add(pk); return true; });
  }
  for (const next of contents.values()) if (next && !edges(next, (pk, location) => {
    const prior = locations.has(pk) ? locations.get(pk) : evidence.locationOf(pk);
    if (prior || !placement(pk)) return false;
    locations.set(pk, location); affected.add(pk); return true;
  })) return;
  const location = (pk: string) => locations.has(pk) ? locations.get(pk) : evidence.locationOf(pk);
  const deltas = new Map<string, number>(), addedOwners = new Map<string, Set<string>>();
  for (const [pk, next] of placements) {
    affected.add(pk);
    const old = state.placements[pk];
    if ([old && state.contents[old.contentKey], next && content(next.contentKey)].some(c => c && ['document-block', 'workspace-block'].includes(c.viewType))) return;
    if (old) {
      deltas.set(old.contentKey, (deltas.get(old.contentKey) ?? 0) - 1);
      const retained = content(old.contentKey);
      // Removing an incoming edge must not strand a legacy component. Native
      // definitions are explicit liveness roots; doubtful sharing uses full proof.
      if (!next && retained && !retained.definitionOwnerKey &&
        (retained.children.length || retained.inlineContent.length || Object.keys(retained.ownedRelations).length)) return;
    }
    if (next) {
      if (!content(next.contentKey)) return;
      deltas.set(next.contentKey, (deltas.get(next.contentKey) ?? 0) + 1);
      const set = addedOwners.get(next.contentKey) ?? new Set<string>(); set.add(pk); addedOwners.set(next.contentKey, set);
      // Fresh edges may reattach a retained definition, never introduce another
      // owner/reference to existing content. Ordinary moves keep their edge.
      if (!old && evidence.referenceCount(next.contentKey) + (deltas.get(next.contentKey) ?? 0) > 1) return;
    }
  }
  for (const [key, next] of contents) if (!next && evidence.referenceCount(key) + (deltas.get(key) ?? 0) !== 0) return;
  const resource = (key: string, final: boolean, seen = new Set<string>()): string | undefined => {
    if (seen.has(key)) throw Error('Ownership cycle'); seen.add(key);
    const c = final ? content(key) : state.contents[key]; if (!c) return;
    if (c.viewType === 'document-block' || c.viewType === 'workspace-block') return key;
    const incoming = new Set(evidence.ownedKeys(key));
    if (final) for (const pk of addedOwners.get(key) ?? []) incoming.add(pk);
    let parent: string | undefined;
    for (const pk of incoming) {
      const p = final ? placement(pk) : state.placements[pk]; if (!p || p.contentKey !== key) continue;
      if (!ordinary(p)) throw Error('Special ownership');
      const at = final ? location(pk) : evidence.locationOf(pk);
      if (!at || parent) throw Error('Ambiguous ownership'); parent = at.ownerContentKey;
    }
    const owner = parent ? resource(parent, final, seen) : c.definitionOwnerKey;
    if (c.definitionOwnerKey && (owner !== c.definitionOwnerKey || (final ? content(owner) : state.contents[owner])?.viewType !== 'document-block')) throw Error('Conflicting definition owner');
    return owner;
  };
  try {
    for (const pk of affected) {
      const p = placement(pk), at = location(pk), oldAt = evidence.locationOf(pk);
      if (pk === state.rootPlacementKey && at) return;
      if (!p) { if (at) return; continue; }
      if (!at || !content(p.contentKey)) return;
      if (at.slot.kind === 'inline-content' && p.kind !== 'inline') return;
      if (oldAt && oldAt.ownerContentKey === at.ownerContentKey && same(oldAt.slot, at.slot) && state.placements[pk] === p) continue;
      if (!ordinary(p) || ['document-block', 'workspace-block'].includes(content(p.contentKey)!.viewType)) return;
      const owner = resource(p.contentKey, true);
      if (!owner || state.contents[p.contentKey] && resource(p.contentKey, false) !== owner) return;
    }
    // New/unplaced definitions and removed definitions need ownership proof too.
    for (const [key, next] of contents) if (next && !state.contents[key]) {
      if (!resource(key, true)) return;
    }
  } catch { return; }
  // Reuse the same indexed ownership proof for native membership maintenance.
  // Character leaves are tracked through their inline owner, as during typing.
  let membership: StructuralChange['membership'] = [];
  try {
    for (const [key,next] of contents) {
      const before=state.contents[key];
      if ((next??before)?.viewType === 'text-cell') continue;
      const oldOwner=before && resource(key,false), newOwner=next && resource(key,true);
      if (before && !oldOwner || next && !newOwner) throw Error('Unknown resource membership');
      membership.push({key,before:oldOwner,after:newOwner});
    }
  } catch { membership=undefined; }
  const metadata = operations.filter(op => op.kind === 'put-content' && tabMetadataRecordChange(state.contents[op.record.key],op.record));
  const other = operations.filter(op => !metadata.includes(op));
  const inlineOwner = metadata.length && other.filter(op => op.kind === 'put-content' && state.contents[op.record.key]?.inlineKind === 'standoff').length === 1
    ? inlineOwnerFor(state,other,{get:key=>evidence.referenceCount(key)}) : undefined;
  return {
    definitionChanges:rangeRoot?{owner:rangeRoot.key,ids:definitionIds}:undefined,
    rangePayloadOwners: [...contents].filter(([key,next])=>next&&dialecticRangePayloadOnly(state.contents[key],next)).map(([key])=>key),
    membership,
    tabMetadata: metadata.length && (!other.length || inlineOwner) ? {
      owners: metadata.map(op => (op as Extract<RepositoryOperation,{kind:'put-content'}>).record.key),
      ...(inlineOwner ? { inlineOwner } : {}),
    } : undefined,
    // This hint is derived from the exact operation batch, never a command name.
    tabOrientationOwner: operations.length === 1 && operations[0].kind === 'put-content' &&
      tabOrientationRecordChange(state.contents[operations[0].record.key], operations[0].record) ? operations[0].record.key : undefined,
    contents: [...contents.keys()],
    childrenOwners: [...contents].filter(([key, next]) => !same(state.contents[key]?.children ?? [], next?.children ?? [])).map(([key]) => key),
    inlineOwners: [...contents].filter(([key, next]) => !same(state.contents[key]?.inlineContent ?? [], next?.inlineContent ?? [])).map(([key]) => key),
  };
}
