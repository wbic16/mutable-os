import {assertScopedSemanticCopy,assertSemanticFragmentDefinitions} from './scoped-semantic-copy';
import {copyGlossIdentities} from "../features/gloss/relationships";
import {glossDefinition} from "../features/gloss/model";
import {assertCopyableDialectic} from '../features/dialectic/anchors';
import { clone } from "./clone";
import { createBlockId, createContentKey, createPlacementKey } from "./ids";
import { isAuthoredBlock, readBlockId } from "./identity";
import type { BlockCommitSubject } from "./commit-capture";
import type { JsonObject, RepositoryState } from "./types";
import { linkedRegistry, linkedDefinitionOwner, type LinkedAnnotationRegistry } from "./linked-annotations";
import { externalDefinitionLink } from "./external-reference";

export interface BlockFragment {
  state: RepositoryState;
  roots: string[];
  linkedAnnotations?: LinkedAnnotationRegistry;
  originResourceId?: string;
  copyIdentities?: Array<{ source: BlockCommitSubject; copy: BlockCommitSubject }>;
}

/** Remap only known Block references; opaque relations and entity IDs are data. */
export function remapKnownBlockReferences(payload: JsonObject, ids: ReadonlyMap<string, string>): void {
  const anchor = (payload.metadata as { anchor?: { version?: number; blockId?: string } } | undefined)?.anchor;
  if (anchor?.version === 1 && typeof anchor.blockId === "string" && ids.has(anchor.blockId)) anchor.blockId = ids.get(anchor.blockId)!;
  const remap = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const property = value as JsonObject;
    if (property.type === "codex/block-reference" && typeof property.value === "string" && ids.has(property.value)) {
      property.value = ids.get(property.value);
    }
  };
  remap(payload);
  for (const field of ["standoffProperties", "blockProperties"]) {
    if (Array.isArray(payload[field])) payload[field].forEach(remap);
  }
  if (payload.linkedAnnotations && typeof payload.linkedAnnotations === "object") {
    Object.values(payload.linkedAnnotations).forEach(remap);
  }
}

/** Canonical capture avoids the legacy DTO format's lossy inline-image export. */
export function captureBlocks(source: RepositoryState, roots: string[]): BlockFragment {
  const state: RepositoryState = { rootPlacementKey: roots[0], contents: {}, placements: {}, revision: 0 };
  const visitContent = (contentKey: string) => {
    if (state.contents[contentKey]) return;
    const content = source.contents[contentKey];
    assertScopedSemanticCopy(source,contentKey);
    assertCopyableDialectic(content.payload); // also protects Cut before source removal
    state.contents[content.key] = clone(content);
    [...content.children, ...content.inlineContent, ...Object.values(content.ownedRelations)].forEach(visit);
  };
  const visit = (key: string) => {
    if (state.placements[key]) return;
    const placement = source.placements[key];
    if (!placement) throw new Error("The selected Block no longer exists.");
    state.placements[key] = clone(placement);
    if (placement.externalReference) return;
    visitContent(placement.contentKey);
  };
  roots.forEach(visit);
  const documents = new Set(roots.map(pk => source.placements[pk]?.contentKey).filter(ck => source.contents[ck]?.viewType === "document-block"));
  for (const content of Object.values(source.contents)) {
    if (content.definitionOwnerKey && documents.has(content.definitionOwnerKey)) visitContent(content.key);
  }
  const definitions: LinkedAnnotationRegistry = {};
  const origins=new Set<string>();
  for (const content of Object.values(state.contents)) {
    if(content.viewType!=="document-block")delete content.payload.linkedAnnotations;
    const properties = content.payload.standoffProperties;
    if (Array.isArray(properties)) for (const property of properties) {
      if (property?.annotationId && !externalDefinitionLink(property)) {
        const owner = linkedDefinitionOwner(source, property, content.key);
        if (owner) {
          if(state.contents[owner.key]?.viewType==="document-block")continue;
          if(typeof owner.payload.id==="string")origins.add(owner.payload.id);
          const definition = linkedRegistry(source, owner.key)[property.annotationId];
          if (definitions[property.annotationId] && JSON.stringify(definitions[property.annotationId]) !== JSON.stringify(definition)) throw new Error("Ambiguous linked definitions in clipboard selection");
          if (definition) definitions[property.annotationId] = clone(definition);
        }
      }
    }
  }
  return { state, roots: [...roots], linkedAnnotations: definitions, ...(origins.size===1?{originResourceId:[...origins][0]}:{}) };
}

export function cloneBlocks(fragment: BlockFragment, preserveIds = false): BlockFragment {
  for(const c of Object.values(fragment.state.contents))assertCopyableDialectic(c.payload);
  assertSemanticFragmentDefinitions(fragment.linkedAnnotations??{});
  for(const c of Object.values(fragment.state.contents))assertScopedSemanticCopy(fragment.state,c.key);
  const state = clone(fragment.state);
  const contentKeys = new Map(Object.keys(state.contents).map(key => [key, createContentKey()]));
  const placementKeys = new Map(Object.keys(state.placements).map(key => [key, createPlacementKey()]));
  const ids = new Map<string, string>();
  const authoredIds = new Map<string, string>();
  const seenIds = new Set<string>();
  const copyIdentities: NonNullable<BlockFragment["copyIdentities"]> = [];
  const annotationIds = new Map([...new Set([...Object.keys(fragment.linkedAnnotations ?? {}),...Object.values(state.contents).flatMap(c=>Object.keys(c.payload.linkedAnnotations??{}))])].map(id => [id, preserveIds ? id : crypto.randomUUID()]));
  for (const content of Object.values(state.contents)) {
    if (!isAuthoredBlock(content)) continue;
    const oldId = readBlockId(content);
    if (oldId && seenIds.has(oldId)) throw new Error("Ambiguous source Block identities; normalize before copying");
    if (content.payload.id != null && typeof content.payload.id !== "string") throw new Error("Invalid source Block identity");
    if (oldId) seenIds.add(oldId);
    const newId = preserveIds && oldId ? oldId : createBlockId();
    authoredIds.set(content.key, newId);
    if (oldId) ids.set(oldId, newId);
    if (!preserveIds) copyIdentities.push({
      source: { contentKey: content.key, blockId: oldId },
      copy: { contentKey: contentKeys.get(content.key)!, blockId: newId },
    });
  }
  const contents: RepositoryState["contents"] = {};
  for (const content of Object.values(state.contents)) {
    if(content.payload.linkedAnnotations){
      const registry=Object.fromEntries(Object.entries(content.payload.linkedAnnotations).map(([id,d])=>[annotationIds.get(id)!,{...(d as JsonObject),id:annotationIds.get(id)!}]));
      if(!preserveIds)copyGlossIdentities(Object.values(registry).filter(glossDefinition),typeof content.payload.id==='string'?content.payload.id:undefined);
      content.payload.linkedAnnotations=registry;
    }
    if (authoredIds.has(content.key)) content.payload.id = authoredIds.get(content.key)!;
    if (content.definitionOwnerKey !== undefined) {
      const owner = contentKeys.get(content.definitionOwnerKey);
      if (owner) content.definitionOwnerKey = owner;
      else delete content.definitionOwnerKey; // destination assigns copy ownership
    }
    content.key = contentKeys.get(content.key)!;
    content.children = content.children.map(key => placementKeys.get(key)!);
    content.inlineContent = content.inlineContent.map(key => placementKeys.get(key)!);
    content.ownedRelations = Object.fromEntries(Object.entries(content.ownedRelations).map(([name, key]) => [name, placementKeys.get(key)!]));
    if (Array.isArray(content.payload.standoffProperties)) for (const property of content.payload.standoffProperties) {
      if (property && annotationIds.has(property.annotationId)) property.annotationId = annotationIds.get(property.annotationId);
    }
    if (!preserveIds) {
      for (const field of ["standoffProperties", "blockProperties"]) {
        const properties = content.payload[field];
        if (Array.isArray(properties)) for (const property of properties) {
          if (!property || typeof property !== "object") continue;
          if (typeof property.id === "string") property.id = crypto.randomUUID();
        }
      }
      remapKnownBlockReferences(content.payload, ids);
    }
    contents[content.key] = content;
  }
  state.contents = contents;
  state.placements = Object.fromEntries(Object.values(state.placements).map(placement => {
    // A copied local body receives a new authored identity, not the source's
    // external binding. Terminal foreign references continue to stay terminal.
    delete placement.resolvedReference;
    if (placement.placementId !== undefined) placement.placementId = createBlockId();
    placement.key = placementKeys.get(placement.key)!;
    if (!placement.externalReference) placement.contentKey = contentKeys.get(placement.contentKey)!;
    return [placement.key, placement];
  }));
  state.rootPlacementKey = placementKeys.get(state.rootPlacementKey)!;
  const definitions = Object.fromEntries(Object.entries(fragment.linkedAnnotations ?? {}).map(([id, record]) => {
    const copied: JsonObject = { ...clone(record), id: annotationIds.get(id)! };
    if (!preserveIds) remapKnownBlockReferences(copied, ids);
    return [annotationIds.get(id)!, copied];
  }));
  if(!preserveIds)copyGlossIdentities(Object.values(definitions).filter(glossDefinition),fragment.originResourceId);
  return { state, roots: fragment.roots.map(key => placementKeys.get(key)!), linkedAnnotations: definitions,
    ...(!preserveIds ? { copyIdentities } : {}),
  };
}
