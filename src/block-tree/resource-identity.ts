import type { ContentRecord, RepositoryState } from "./types";
import type { ExternalTarget } from "./external-reference";

export type ResourceSource = Exclude<ExternalTarget["source"], { scope: "unknown" }>;
export function resourceSource(content: ContentRecord): ResourceSource | undefined {
  const scope = content.viewType === "document-block" ? "document" : content.viewType === "workspace-block" ? "workspace" : undefined;
  if (!scope) return;
  const metadata = content.payload.metadata as Record<string, unknown> | undefined;
  const resourceId = metadata?.[scope === "document" ? "documentId" : "workspaceId"] ?? content.payload.id;
  if (typeof resourceId !== "string" || !resourceId.trim()) throw new Error("Missing canonical resource identity");
  return { scope, resourceId };
}
export const sameResource = (a: ResourceSource, b: ResourceSource) => a.scope === b.scope && a.resourceId === b.resourceId;

/** Current loaded resources only. Never fetch, pick a first match, or adopt ownership. */
export function findResource(state: RepositoryState, source: ResourceSource): ContentRecord | undefined {
  const matches = Object.values(state.contents).filter(c => {
    if (c.viewType !== `${source.scope}-block`) return false;
    const metadata = c.payload.metadata as Record<string, unknown> | undefined;
    const id = metadata?.[source.scope === "document" ? "documentId" : "workspaceId"] ?? c.payload.id;
    return id === source.resourceId;
  });
  if (matches.length > 1) throw new Error("Ambiguous canonical resource identity");
  return matches[0];
}

/** Optional existing repository evidence; headless callers keep the scan path. */
export interface ResourceOwnershipLookup {
  parents(key: string): Iterable<string>;
  find(source: ResourceSource): ContentRecord | undefined;
}
/** Explicit consumers can reuse the repository's existing incoming-edge index. */
export function indexedResourceLookup(repository: Pick<import('./repository').CanonicalRepository,'readState'|'ownedPlacementKeys'|'locationOf'|'findDocumentResource'>):ResourceOwnershipLookup {
  return {parents:key=>[...repository.ownedPlacementKeys(key)].flatMap(pk=>{const at=repository.locationOf(pk);return at?[at.ownerContentKey]:[];}),find:source=>source.scope==='document'?repository.findDocumentResource(source.resourceId):findResource(repository.readState(),source)};
}
// Structural ownership only; reference occurrences never become parents.
// Cache is revision-bound and weakly held. No observer or input dispatch hook.
const cache = new WeakMap<RepositoryState, { revision: number; owners: Map<string, Set<string>>; resources: Map<string, ContentRecord[]> }>();
export function resourceOwner(state: RepositoryState, contentKey: string, lookup?: ResourceOwnershipLookup): ContentRecord | undefined {
  let index = cache.get(state);
  if (!lookup && (!index || index.revision !== state.revision)) {
    const owners = new Map<string, Set<string>>(), resources = new Map<string, ContentRecord[]>();
    for (const c of Object.values(state.contents)) {
      if (c.viewType === 'document-block' || c.viewType === 'workspace-block') {
        const scope = c.viewType === 'document-block' ? 'document' : 'workspace';
        const id = (c.payload.metadata as Record<string, unknown> | undefined)?.[scope === 'document' ? 'documentId' : 'workspaceId'] ?? c.payload.id;
        if (typeof id === 'string') { const key = JSON.stringify([scope, id]), matches = resources.get(key) ?? []; matches.push(c); resources.set(key, matches); }
      }
      for (const key of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) {
        const p = state.placements[key]; if (!p || p.kind === "reference") continue;
        const parents = owners.get(p.contentKey) ?? new Set<string>(); parents.add(c.key); owners.set(p.contentKey, parents);
      }
    }
    index = { revision: state.revision, owners, resources }; cache.set(state, index);
  }
  // The existing revision-bound ownership pass already visits resource roots.
  // Reuse that evidence instead of scanning every Cell for each annotation.
  const find = (source: ResourceSource) => {
    if (lookup) return lookup.find(source);
    const matches = index!.resources.get(JSON.stringify([source.scope, source.resourceId])) ?? [];
    if (matches.length > 1) throw Error('Ambiguous canonical resource identity');
    return matches[0];
  };
  const walk = (key: string, seen = new Set<string>()): ContentRecord | undefined => {
    if (seen.has(key)) throw new Error("Cyclic canonical ownership");
    seen.add(key);
    const c = state.contents[key]; if (!c) return;
    if (c.viewType === "document-block" || c.viewType === "workspace-block") {
      const metadata = c.payload.metadata as Record<string, unknown> | undefined;
      const id = metadata?.[c.viewType === "document-block" ? "documentId" : "workspaceId"] ?? c.payload.id;
      // Legacy identity-less roots still support local editing. Creating a
      // durable cross-resource descriptor requires resourceSource separately.
      if (typeof id === "string" && id.trim() && find(resourceSource(c)!)?.key !== key) throw new Error("Ambiguous canonical resource identity");
      return c;
    }
    const parents = lookup ? new Set(lookup.parents(key)) : index!.owners.get(key) ?? new Set<string>();
    if (parents.size > 1) throw new Error("Ambiguous canonical content ownership");
    const structural = parents.size ? walk([...parents][0], seen) : undefined;
    if (c.definitionOwnerKey) {
      const declared = state.contents[c.definitionOwnerKey];
      if (declared?.viewType !== "document-block" || structural && structural.key !== declared.key) throw new Error("Conflicting definition ownership");
      find(resourceSource(declared)!);
      return declared;
    }
    return structural;
  };
  return walk(contentKey);
}
