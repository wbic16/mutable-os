/** History-independent native resource codec/admission. Reuses the accepted resource graph and preserves its guards. */
import { clone } from "../block-tree/clone";
import { INLINE_ALTERNATIVES_CAPABILITY, validateCapabilities, NATIVE_CAPABILITIES } from '../interchange/capabilities';
import { freeze, type DeepReadonly } from "../block-tree/commit-capture";
import { externalDefinitionLink } from "../block-tree/external-reference";
import { linkedDefinitionOwner, definitionProvenance } from "../block-tree/linked-annotations";
import { resourceOwner, resourceSource, sameResource, findResource, type ResourceOwnershipLookup } from "../block-tree/resource-identity";
import { documentRootPlacements, resourceOwnership } from "../block-tree/resource-registration";
import type { ExternalTarget } from "../block-tree/external-reference";
import { viewTypeFor } from "../block-tree/codecs";
import type { CanonicalRepository } from "../block-tree/repository";
import type { ContentRecord, RepositoryState } from "../block-tree/types";
import { assertPortableJson } from "../block-tree/portable-spike/codec";
import { durablePlacementId, resourceToRepository } from "../history/durable-core";
import { decodeGateDocument, encodeGateDocument, type GateDocument } from "../history/stage-c-gates/portable";
import { projectOwned, validateResource, type ResourceSnapshot } from "../history/stage-c-gates/resource";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Native B1: ${message}`);
}
const id = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const slots = (c: DeepReadonly<ContentRecord>) => [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)];
const identity = (c: DeepReadonly<ContentRecord>) => (c.payload.metadata as Record<string, unknown> | undefined)?.documentId ?? c.payload.id;

/** One immutable snapshot. Membership follows owned/inline edges and explicit
 * definition retention, NEVER references or visible occurrence traversal. */
export function captureNative(state: DeepReadonly<RepositoryState>, resourceId: string): DeepReadonly<ResourceSnapshot> {
  check(id(resourceId), "missing resource identity");
  const documents = Object.values(state.contents).filter(c => c.viewType === "document-block" && identity(c) === resourceId);
  check(documents.length === 1, "missing or ambiguous canonical Document identity");
  const root = documents[0];
  const owners = documentRootPlacements(state as RepositoryState, root.key);
  resourceOwnership(state as RepositoryState);
  check(owners.length === 1, "Document needs one canonical root or resource registration");
  const membership = new Map<string, string>(), visiting = new Set<string>();
  const externalTargets = new Map<string, ExternalTarget>();
  const visit = (key: string) => {
    check(!visiting.has(key), "owned cycle");
    if (membership.has(key)) return;
    const c = state.contents[key]; check(c, "missing owned content");
    check(c.definitionOwnerKey === undefined || c.definitionOwnerKey === root.key, "conflicting retained-definition owner");
    membership.set(key, resourceId); visiting.add(key);
    for (const slot of slots(c)) {
      const p = state.placements[slot]; check(p, "missing placement");
      if (p.externalReference) continue;
      const child = state.contents[p.contentKey];
      if (p.kind === "owned" && child?.viewType === "document-block" && child.key !== root.key) {
        check(id(child.payload.id), "nested resource root lacks authored identity");
        externalTargets.set(slot, { kind: "block", targetId: child.payload.id, source: resourceSource(child as ContentRecord)!, version: { kind: "unpinned" } });
      } else if (p.kind !== "reference") visit(p.contentKey);
    }
    visiting.delete(key);
  };
  visit(root.key);
  for (const c of Object.values(state.contents)) if (c.definitionOwnerKey === root.key) visit(c.key);
  const localSlots = new Set([...membership.keys()].flatMap(key => slots(state.contents[key])));
  localSlots.add(owners[0].key);
  const ownerCounts = new Map<string, number>();
  for (const p of Object.values(state.placements)) if (membership.has(p.contentKey) && p.kind !== "reference" && !p.resolvedReference) {
    check(localSlots.has(p.key), "content has an owner outside this resource");
    ownerCounts.set(p.contentKey, (ownerCounts.get(p.contentKey) ?? 0) + 1);
  }
  check([...ownerCounts.values()].every(count => count <= 1), "multiple canonical owners for one content record");
  // Implicit Workspace-root registries cannot silently become Document-owned.
  // Capture is synchronous over one consistent state. Resolve each resource
  // identity once, not once per annotation. Keep ambiguity/ownership checks;
  // discard this memo after capture so later captures always revalidate.
  const resources = new Map<string, ContentRecord | undefined>();
  const parents = new Map<string, Set<string>>();
  for (const content of Object.values(state.contents)) for (const key of slots(content)) {
    const placement = state.placements[key];
    if (!placement || placement.kind === 'reference') continue;
    const owners = parents.get(placement.contentKey) ?? new Set<string>();
    owners.add(content.key); parents.set(placement.contentKey, owners);
  }
  const lookup: ResourceOwnershipLookup = {
    parents: key => parents.get(key) ?? [],
    find: source => {
      const key = JSON.stringify([source.scope, source.resourceId]);
      if (!resources.has(key)) resources.set(key, findResource(state as RepositoryState, source));
      return resources.get(key);
    },
  };
  const dependencies = new Map<string, unknown[]>();
  for (const key of membership.keys()) {
    const c = state.contents[key];
    if (Array.isArray(c.payload.standoffProperties)) {
      let rewritten = false;
      const properties = c.payload.standoffProperties.map(property => {
        if (!id(property.annotationId) || externalDefinitionLink(property)) return property;
        const owner = linkedDefinitionOwner(state as RepositoryState, property, key, lookup);
        check(owner, `linked annotation ${property.annotationId} lacks Document ownership or explicit foreign provenance`);
        if (owner.key === root.key) return property;
        rewritten = true;
        return { ...property, externalDefinition: definitionProvenance(owner, property.annotationId) };
      });
      if (rewritten) dependencies.set(key, properties);
    }
    for (const slot of slots(c)) {
      const p = state.placements[slot];
      if (!p.resolvedReference) continue;
      const source = p.resolvedReference.source, owner = resourceOwner(state as RepositoryState, p.contentKey, lookup);
      check(source.scope !== "unknown" && owner && sameResource(resourceSource(owner)!, source) &&
        p.resolvedReference.targetId === state.contents[p.contentKey]?.payload.id, "stale or ambiguous foreign binding provenance");
    }
  }
  const parent = Object.values(state.contents).find(c => slots(c).includes(owners[0].key));
  const nestedRoot = parent && resourceOwner(state as RepositoryState, parent.key, lookup)?.viewType === "document-block";
  const rootPlacementId = nestedRoot ? `resource-root:${resourceId}` : durablePlacementId(owners[0], resourceId);
  const projected = projectOwned(state as RepositoryState, resourceId, {
    contents: membership,
    placementIds: new Map(Object.values(state.placements).map(p => [p.key, durablePlacementId(p, resourceId)])),
    externalTargets, // Only actual authored nested ownership; reference provenance is never guessed.
    root: { key: owners[0].key, contentKey: root.key, placementId: rootPlacementId },
  }, 0);
  // projectOwned already owns, validates and freezes this exact graph. No second
  // materialisation/proof is needed unless canonical provenance was transformed.
  if (!dependencies.size) return projected;
  const transformed = clone(projected) as ResourceSnapshot;
  for (const [key, properties] of dependencies) transformed.contents[key].payload.standoffProperties = clone(properties);
  validateResource(transformed);
  return freeze(transformed);
}

export interface NativeDocument {
  format: "mutable-document"; version: 1; resourceId: string;
  /** Absent in original B1 files, whose authored bags used plain JSON. */
  valueEncoding?: "codex-authored-value-v1";
  document: GateDocument;
  definitionOwnerBlockIds: string[];
  requiredCapabilities?: string[];
}
export function nativeEnvelope(resource: DeepReadonly<ResourceSnapshot>): NativeDocument {
  for (const c of Object.values(resource.contents)) if (!["text-cell", "image-cell"].includes(c.viewType)) {
    check(typeof c.payload.type === "string" && viewTypeFor(c.payload.type) === c.viewType, "missing/mismatched authored type");
  }
  return { format: "mutable-document", version: 1, resourceId: resource.resourceId, valueEncoding: "codex-authored-value-v1",
    ...(Object.values(resource.contents).some(c=>c.compactInline?.spans.some(a=>a.kind==='alternative'))?{requiredCapabilities:[INLINE_ALTERNATIVES_CAPABILITY]}:{}),
    document: encodeGateDocument(resource, "native"), definitionOwnerBlockIds: Object.values(resource.contents)
      .filter(c => c.definitionOwnerKey !== undefined).map(c => c.payload.id as string).sort() };
}

/** Stable map order for comparison; authored arrays/edges retain their order. */
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]));
  return value;
}
export function nativeText(resource: DeepReadonly<ResourceSnapshot>): string {
  const envelope = nativeEnvelope(resource);
  envelope.document.blocks.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(ordered(envelope), null, 2) + "\n";
}
export const nativeBytes = (resource: DeepReadonly<ResourceSnapshot>) => new TextEncoder().encode(nativeText(resource));

function fields(value: any, allowed: string[]) {
  check(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(k => allowed.includes(k)), "unknown reserved wire field or invalid record");
}
function target(value: any) {
  fields(value, ["kind", "targetId", "source", "version", "targetPlacementId", "targetRoute"]);
  fields(value.source, value.source?.scope === "unknown" ? ["scope"] : ["scope", "resourceId"]);
  fields(value.version, value.version?.kind === "unpinned" ? ["kind"] : ["kind", "memoirId", "segmentId", "revisionId"]);
}
/** Parse reserved wire shape only; callers still require semantic resource validation. */
export function parseNativeEnvelope(bytes: Uint8Array, supported: ReadonlySet<string> = NATIVE_CAPABILITIES): NativeDocument {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as NativeDocument;
  assertPortableJson(value);
  fields(value, ["format", "version", "resourceId", "document", "definitionOwnerBlockIds", "valueEncoding", "requiredCapabilities"]);
  validateCapabilities(value.requiredCapabilities,supported);
  check(value.valueEncoding === undefined || value.valueEncoding === "codex-authored-value-v1", "unsupported authored value encoding");
  check(value.format === "mutable-document" && value.version === 1 && id(value.resourceId), "unsupported native envelope/version");
  const doc = value.document;
  fields(doc, ["format", "version", "resourceId", "root", "blocks"]);
  check(doc.resourceId === value.resourceId && Array.isArray(doc.blocks), "resource identity or definitions mismatch");
  const edge = (e: any) => {
    fields(e, ["placementId", "kind", "target"]);
    fields(e.target, e.target?.kind === "local" ? ["kind", "blockId"] : ["kind", "reference"]);
    if (e.target.kind === "external") target(e.target.reference);
  };
  edge(doc.root);
  for (const b of doc.blocks) {
    fields(b, ["id", "type", "properties", "children", "relations", "inline"]);
    if (b.children != null) { check(Array.isArray(b.children), "invalid children"); b.children.forEach(edge); }
    if (b.relations != null) {
      fields(b.relations, ["owned", "opaque"]);
      check(b.relations.owned && typeof b.relations.owned === "object" && !Array.isArray(b.relations.owned), "invalid relations");
      Object.values(b.relations.owned).forEach(edge);
    }
    if (b.inline !== undefined) {
      check(Array.isArray(b.inline), "invalid inline content");
      for (const atom of b.inline) fields(atom, atom.kind === "text" ? ["kind", "text"] : ["kind", "properties"]);
    }
  }
  check(Array.isArray(value.definitionOwnerBlockIds) && value.definitionOwnerBlockIds.every(id) &&
    new Set(value.definitionOwnerBlockIds).size === value.definitionOwnerBlockIds.length, "invalid retention membership");
  return value;
}

export function decodeNative(bytes: Uint8Array, timings?: Record<string, number>, compact = false): DeepReadonly<ResourceSnapshot> {
  let last = timings ? performance.now() : 0;
  const value = parseNativeEnvelope(bytes), doc = value.document;
  if (timings) { timings.nativeWireParsing = performance.now() - last; }
  let resource = decodeGateDocument(doc, value.valueEncoding ? "native" : "legacy", timings, compact);
  if (timings) last = performance.now();
  const root = resource.placements[resource.rootPlacementKey]; check(root.target.kind === "local", "external root");
  const rootContent = resource.contents[root.target.contentKey];
  check(identity(rootContent) === value.resourceId, "root identity disagrees with resource identity");
  if (value.definitionOwnerBlockIds.length) {
    const retained = new Set(value.definitionOwnerBlockIds), contents = { ...resource.contents };
    for (const content of Object.values(contents)) if (retained.delete(content.payload.id as string)) {
      check(!["text-cell", "image-cell"].includes(content.viewType), "invalid retention membership");
      contents[content.key] = freeze({ ...content, definitionOwnerKey: root.target.contentKey });
    }
    check(!retained.size, "unknown retained definition");
    resource = freeze({ ...resource, contents });
  }
  validateNativeOwnership(resource, root.target.contentKey);
  if (timings) timings.nativeOwnershipValidation = performance.now() - last;
  return resource;
}

/** The portable decoder already validates every record, edge and cycle. Check
 * native ownership directly on that immutable graph instead of converting it
 * into a repository, cloning/re-projecting it and validating all Cells again. */
function validateNativeOwnership(resource: DeepReadonly<ResourceSnapshot>, rootKey: string): void {
  const owners = new Set<string>(), resources = new Set<string>();
  for (const p of Object.values(resource.placements)) {
    if (p.kind === "reference") continue;
    if (p.target.kind === "local") {
      check(!owners.has(p.target.contentKey), "multiple canonical owners for one content record");
      owners.add(p.target.contentKey);
    } else {
      // validateResource has already checked the owned-resource descriptor.
      const source = p.target.reference.source;
      check(source.scope === "document", "owned resource needs Document provenance");
      check(!resources.has(source.resourceId), "Resource has multiple semantic owners");
      resources.add(source.resourceId);
    }
  }
  const membership = new Set<string>();
  const visit = (key: string) => {
    if (membership.has(key)) return;
    membership.add(key);
    for (const slot of slots(resource.contents[key])) {
      const p = resource.placements[slot];
      if (p.kind !== "reference" && p.target.kind === "local") visit(p.target.contentKey);
    }
  };
  visit(rootKey);
  const registry = (resource.contents[rootKey].payload.linkedAnnotations ?? {}) as object;
  for (const c of Object.values(resource.contents)) {
    if (c.definitionOwnerKey === rootKey) visit(c.key);
    for(const properties of [c.payload.standoffProperties,...c.compactInline?.spans.flatMap(a=>a.kind==='image'?[a.properties.standoffProperties]:[])??[]]) if (Array.isArray(properties)) for (const property of properties) {
      if (!id(property.annotationId) || externalDefinitionLink(property)) continue;
      check(Object.hasOwn(registry, property.annotationId), `linked annotation ${property.annotationId} lacks Document ownership or explicit foreign provenance`);
    }
  }
  check(membership.size === Object.keys(resource.contents).length, "definition lacks canonical ownership/retention");
}

/** Admission into an EXISTING repository/object bank, never a new editor or DTO.
 * Detached decode + collision/ownership checks precede the one atomic commit. */
export function admitNative(repository: CanonicalRepository, bytes: Uint8Array, bankContentKey: string, timings?: Record<string, number>) {
  const {placementKey,reused}=admitNativeWithResource(repository,bytes,bankContentKey,undefined,timings);
  return {placementKey,reused};
}
/** Admission result also exposes the immutable validated source and exact membership. */
export function admitNativeWithResource(repository: CanonicalRepository, bytes: Uint8Array, bankContentKey: string, expectedResourceId?: string, timings?: Record<string, number>) {
  let last = timings ? performance.now() : 0;
  const stage = (name: string) => { if (timings) { const now = performance.now(); timings[name] = now - last; last = now; } };
  const resource = decodeNative(bytes, timings, repository.compactCanonicalText);
  stage('nativeDecodeAndValidation');
  check(expectedResourceId === undefined || resource.resourceId === expectedResourceId, 'Open response identity mismatch');
  const incoming = resourceToRepository(resource), before = repository.readState();
  stage('canonicalStaging');
  const bank = before.contents[bankContentKey];
  check(bank?.viewType === "workspace-object-bank-block", "native admission requires the existing object bank");
  const existing = Object.values(before.contents).filter(c => c.viewType === "document-block" && identity(c) === resource.resourceId);
  if (existing.length) {
    check(existing.length === 1, "ambiguous existing resource identity");
    const captured = captureNative(before, resource.resourceId);
    check(nativeText(captured) === nativeText(resource), "disk/live resource conflict; no overwrite or history reset");
    return { placementKey: captured.rootPlacementKey, reused: true, resource, members: Object.keys(captured.contents) };
  }
  const ids = new Set(Object.values(before.contents).map(c => c.payload.id).filter(id));
  const placements = new Set(Object.values(before.placements).map(p => p.placementId).filter(id));
  for (const c of Object.values(incoming.contents)) check(!before.contents[c.key] && (!id(c.payload.id) || !ids.has(c.payload.id)), "Block identity collision");
  for (const p of Object.values(incoming.placements)) check(!before.placements[p.key] && (!p.placementId || !placements.has(p.placementId)), "placement identity collision");
  // Private retention role: no semantic owner is assigned by native admission.
  incoming.placements[incoming.rootPlacementKey] = { ...incoming.placements[incoming.rootPlacementKey], kind: "reference", resourceRegistration: true };
  const updatedBank = { ...bank, children: [...bank.children, incoming.rootPlacementKey], wireChildren: "present" as const };
  // Bind only proven, already-loaded unpinned targets, at this explicit admission
  // boundary. No fetch, polling, observer, fallback identity or ownership transfer.
  const combined = { ...before, contents: { ...before.contents, ...incoming.contents, [bank.key]: updatedBank },
    placements: { ...before.placements, ...incoming.placements }, revision: before.revision + 1 };
  const bindings = [];
  for (const p of Object.values(combined.placements)) {
    const external = p.externalReference;
    if (!external || external.kind !== "block" || external.version.kind !== "unpinned" || external.source.scope === "unknown") continue;
    const owner = findResource(combined, external.source); if (!owner) continue;
    if (p.kind === "owned") check(owner.payload.id === external.targetId, "owned target is not the Document resource root");
    const candidates = Object.values(combined.contents).filter(c => c.payload.id === external.targetId);
    check(candidates.length <= 1, "ambiguous external target identity");
    const target = candidates[0]; if (!target) continue;
    check(resourceOwner(combined, target.key)?.key === owner.key, "external target owner mismatch");
    const { externalReference: _external, ...record } = p;
    bindings.push({ ...record, contentKey: target.key, resolvedReference: clone(external) });
  }
  stage('identityAndBindings');
  repository.commit("B1 admit native Document", [
    { kind: "record-batch", contents: { ...incoming.contents, [bank.key]: updatedBank },
      placements: { ...incoming.placements, ...Object.fromEntries(bindings.map(record => [record.key, record])) } },
  ], true, {}, timings);
  stage('repositoryCommit');
  return { placementKey: incoming.rootPlacementKey, reused: false, resource, members: Object.keys(incoming.contents) };
}
