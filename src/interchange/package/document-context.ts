import {LOCAL_ENTITY,LOCAL_ENTITY_RELATION,ENTITY_REFERENCE} from '../../feature-api/scoped-entities';
import type { DeepReadonly } from '../../block-tree/commit-capture';
import { clone } from '../../block-tree/clone';
import { createBlockId, createContentKey } from '../../block-tree/ids';
import { externalAssetLink, externalDefinitionLink } from '../../block-tree/external-reference';
import type { ResourceSnapshot } from '../../history/stage-c-gates/resource';
import { contentRecord } from '../materialize';
import { nativeInventory } from './format';
import { PackageDataReader, validatePackageData, type PackageData } from './data';

/** Explicit export-time collection, never a revision/typing subscriber. */
export function documentContextInventory(snapshot: DeepReadonly<ResourceSnapshot>) {
  const inventory = nativeInventory(snapshot), blockReferences = new Set<string>();
  const localIds = new Set(Object.values(snapshot.contents).map(c => c.payload.id));
  const unresolved: unknown[] = [...inventory.unresolvedAssets,
    ...inventory.assets.map(reference => ({ reference, reason: 'Original binary not embedded in JSON; use the existing archival package exporter to include originals.' }))];
  for (const p of Object.values(snapshot.placements)) if (p.target.kind === 'external') {
    unresolved.push({ reference: p.target.reference, ownership: p.kind, reason: 'External resource is not recursively included; authored reference preserved.' });
  }
  for (const c of Object.values(snapshot.contents)) {
    const properties = [...(Array.isArray(c.payload.standoffProperties) ? c.payload.standoffProperties : []),
      ...(Array.isArray(c.payload.blockProperties) ? c.payload.blockProperties : []),
      ...Object.values(c.payload.linkedAnnotations as Record<string, any> ?? {})];
    for (const p of properties) {
      if (p.isDeleted) continue;
      if(p.type===LOCAL_ENTITY_RELATION||p.type===ENTITY_REFERENCE){const r=p.metadata?.scopedEntityRelation;for(const reference of r?[r.from,r.to]:[p.metadata?.entityReference])if(reference?.scope==='vault')unresolved.push({reference,reason:'Scope-qualified Vault Entity retained; no automatic global lookup or mutation.'});}

      if (p.type === 'codex/block-reference' && typeof p.value === 'string' && !localIds.has(p.value)) blockReferences.add(p.value);
      if (p.type === 'codex/document-reference' && p.value !== snapshot.resourceId) unresolved.push({ reference: p.value, reason: 'Referenced Document is outside the export.' });
      for (const reference of [externalDefinitionLink(p), externalAssetLink(p)]) if (reference) unresolved.push({reference, reason: 'External annotation definition or asset is not embedded.'});
    }
  }
  const localEntities=Object.values(snapshot.contents).flatMap(c=>Object.values(c.payload.linkedAnnotations??{}).filter((d:any)=>d.type===LOCAL_ENTITY));
  return { ...inventory, localEntities, blockReferences: [...blockReferences], unresolved };
}
export function unavailableDocumentContext(snapshot: DeepReadonly<ResourceSnapshot>, reason: string) {
  const inventory = documentContextInventory(snapshot);
  const data: PackageData = { kind: 'mutable-package-data', version: 1, readOnly: true, encoding: 'sqlite-storage-class-v1',
    tables: [], provenance: { resourceId: snapshot.resourceId }, selection: { profile: 'document-context-v1', entitySeeds: inventory.entities, claimSeeds: inventory.claims },
    unresolved: [{ reason }, ...inventory.entities.map(value => ({ table: 'Entity', value, reason })), ...inventory.claims.map(value => ({table:'Claim',value,reason})), ...inventory.blockReferences.map(value=>({table:'Block',value,reason}))],
    excluded: [{ reason: 'Source-derived proposition discovery unavailable without the source Vault. No unrelated Vault is queried.' }] };
  return { data, schema: { kind: 'mutable-knowledge-schema', version: 1, tables: [] } };
}
/** Adds an existing retained Block convention; authored Blocks/edges are untouched. */
export function withDocumentContext(snapshot: DeepReadonly<ResourceSnapshot>, context: { data: PackageData; schema: unknown }, source: Record<string, unknown>) {
  validatePackageData(context.data);
  const result = clone(snapshot) as ResourceSnapshot, root = result.placements[result.rootPlacementKey];
  if (root.target.kind !== 'local') throw Error('Document root unavailable');
  const key = createContentKey();
  result.contents[key] = { ...contentRecord(key, 'mutable/package-data-block', {
    id: createBlockId(), type: 'mutable/package-data-block', version: 1, readOnly: true,
    packageContext: { ...context, data: { ...context.data, unresolved: [...context.data.unresolved, ...documentContextInventory(snapshot).unresolved] }, source },
  }), definitionOwnerKey: root.target.contentKey };
  return result;
}

/** Re-export frozen evidence without silently rebinding it to a different Vault. */
export function withFrozenDocumentContext(snapshot: DeepReadonly<ResourceSnapshot>) {
  const result = clone(snapshot) as ResourceSnapshot;
  const contexts = Object.values(result.contents).filter(c => c.viewType === 'mutable/package-data-block').map(c => c.payload.packageContext as {data: PackageData});
  const readers = contexts.map(context => new PackageDataReader(context.data));
  const inventory = documentContextInventory(snapshot);
  const missing = (table: string, ids: string[]) => ids.filter(id => !readers.some(reader => reader.tables.get(table)?.some(row => row.guid === id)))
    .map(value => ({table, value, reason: 'Absent from frozen package context; no lookup against the current Vault was attempted.'}));
  const diagnostics = [...missing('Entity', inventory.entities), ...missing('Claim', inventory.claims), ...missing('Block', inventory.blockReferences), ...inventory.unresolved];
  if (contexts.length) {
    const data = contexts[0].data, seen = new Set(data.unresolved.map(value => JSON.stringify(value)));
    data.unresolved.push(...diagnostics.filter(value => {const key=JSON.stringify(value); if(seen.has(key))return false; seen.add(key); return true;}));
    const reason = 'Frozen semantic context was retained without refresh; source-derived proposition discovery and canonical changes since capture are not verified.';
    if (!data.excluded.some(value => (value as {reason?:string})?.reason === reason)) data.excluded.push({reason});
  }
  return result;
}
