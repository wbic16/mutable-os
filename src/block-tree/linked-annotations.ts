import type { JsonObject, RepositoryState } from "./types";
import { externalDefinitionLink } from "./external-reference";
import { findResource, resourceOwner, resourceSource } from "./resource-identity";
import type { ResourceOwnershipLookup } from "./resource-identity";
import type { ContentRecord } from "./types";
import type { RepositoryOperation } from "./types";

export type LinkedAnnotationRegistry = Record<string, JsonObject>;
export function linkedRegistry(state: RepositoryState, ownerKey = state.placements[state.rootPlacementKey].contentKey): LinkedAnnotationRegistry {
  return state.contents[ownerKey]?.payload.linkedAnnotations as LinkedAnnotationRegistry ?? {};
}
/** Local definitions use canonical resource context; explicit provenance wins.
 * A legacy unqualified reference may use the old root registry only when no
 * local definition exists. Capture makes that legacy root dependency explicit. */
export function linkedDefinitionOwner(state: RepositoryState, property: JsonObject, contentKey?: string, lookup?: ResourceOwnershipLookup): ContentRecord | undefined {
  if (typeof property.annotationId !== "string") return;
  const external = externalDefinitionLink(property);
  if (external) {
    if (external.source.scope === "unknown" || external.version.kind !== "unpinned") return;
    return lookup ? lookup.find(external.source) : findResource(state, external.source);
  }
  const local = contentKey ? resourceOwner(state, contentKey, lookup) : undefined;
  if (local && Object.hasOwn(linkedRegistry(state, local.key), property.annotationId)) return local;
  const root = state.contents[state.placements[state.rootPlacementKey].contentKey];
  if (Object.hasOwn(linkedRegistry(state), property.annotationId)) return root;
}
export function definitionProvenance(owner: ContentRecord, annotationId: string) {
  const source = resourceSource(owner);
  if (!source) throw new Error("Linked definition needs a canonical resource owner");
  return { format: "codex-external-definition-gate" as const, version: 1 as const,
    target: { kind: "definition" as const, targetId: annotationId, source, version: { kind: "unpinned" as const } } };
}
export function resolveLinkedProperty(state: RepositoryState, property: JsonObject, contentKey?: string, lookup?: ResourceOwnershipLookup): JsonObject {
  let owner: ContentRecord | undefined;
  try { owner = linkedDefinitionOwner(state, property, contentKey, lookup); } catch { return property; } // unresolved/ambiguous is never a guessed value
  const shared = owner && linkedRegistry(state, owner.key)[property.annotationId as string];
  return shared ? { ...property, ...shared, id: property.id, annotationId: property.annotationId, start: property.start, end: property.end, isDeleted: !!property.isDeleted || !!shared.isDeleted } : property;
}

/** A structural move changes the consumer's resource, not the definition's
 * owner. Only known annotation links in the owned subtree need adjustment. */
export function linkedSourcesForMove(state: RepositoryState, placementKey: string, destinationKey: string): RepositoryOperation[] {
  if (state.placements[placementKey].kind !== "owned") return [];
  const destination = resourceOwner(state, destinationKey), operations: RepositoryOperation[] = [], seen = new Set<string>();
  const visit = (pk: string) => {
    const p = state.placements[pk]; if (p.kind !== "owned") return;
    const c = state.contents[p.contentKey];
    if (seen.has(c.key) || c.viewType === "document-block") return; // no nested-resource ownership policy
    seen.add(c.key);
    if (destination && Array.isArray(c.payload.standoffProperties) && resourceOwner(state, c.key)?.key !== destination.key) {
      const properties = c.payload.standoffProperties.map(property => {
        const owner = linkedDefinitionOwner(state, property, c.key);
        if (!owner) return property;
        const result = { ...property };
        if (owner.key === destination.key) delete result.externalDefinition;
        else result.externalDefinition = definitionProvenance(owner, property.annotationId);
        return result;
      });
      operations.push({ kind: "put-content", record: { ...c, payload: { ...c.payload, standoffProperties: properties } } });
    }
    for (const child of [...c.children, ...Object.values(c.ownedRelations)]) visit(child);
  };
  visit(placementKey); return operations;
}
