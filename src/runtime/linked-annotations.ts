import { createSignal, untrack } from "solid-js";
import { findResource } from "../block-tree/resource-identity";
import { documentRootPlacements } from "../block-tree/resource-registration";
import { clone } from "../block-tree/clone";
import { linkedRegistry, resolveLinkedProperty, linkedDefinitionOwner, definitionProvenance } from "../block-tree/linked-annotations";
import type { TextRangeSnapshot } from "./text-ranges";
import type { JsonObject, RepositoryOperation } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { resourceOwner } from "../block-tree/resource-identity";
import type { AnnotationAction, AnnotationPatch } from "../block-tree/annotation-commands";
import {glossOwner} from '../block-tree/gloss-plan';
import {RANGE_ANCHOR,rangeDefinition} from '../features/dialectic/anchors';

export class LinkedAnnotations {
  constructor(private editor: ReactiveEditor) {}
  private topology = createSignal(0);
  private stop?: () => void;
  private lookup = {
    parents: (key: string) => {
      const parents = new Set<string>();
      for (const placement of untrack(() => [...this.editor.repository.ownedPlacementKeys(key)])) {
        // Keep dependencies on these specific edges: a valid placement-only
        // retarget can change ownership without changing any parent's arrays.
        const edge = this.editor.repository.state.placements[placement];
        const at = untrack(() => this.editor.repository.locationOf(placement));
        if (edge?.contentKey === key && edge.kind !== 'reference' && at) parents.add(at.ownerContentKey);
      }
      return parents;
    },
    find: (source: Parameters<typeof findResource>[1]) => untrack(() => source.scope === 'document'
      ? this.editor.repository.findDocumentResource(source.resourceId)
      : findResource(this.editor.repository.readState(), source)),
  };
  resolve(property: JsonObject, contentKey?: string) {
    if(property.type===RANGE_ANCHOR){
      const state=this.editor.repository.readState();
      const owner=contentKey&&!property.externalDefinition&&glossOwner(state,contentKey,{locationOf:k=>this.editor.repository.locationOf(k),ownedKeys:k=>this.editor.repository.ownedPlacementKeys(k)});
      const definition=owner&&(state.contents[owner].payload.linkedAnnotations as any)?.[String(property.annotationId)];
      return rangeDefinition(definition)?{...definition,...property,isDeleted:!!property.isDeleted||!!definition.isDeleted}:{...property,isDeleted:true};
    }
    if (property.type === 'mutable/gloss') return this.editor.gloss.resolveContent(property, contentKey);
    if (typeof property.annotationId !== 'string') return property;
    // Ordinary Cell edits cannot change canonical ancestry or resource identity.
    // Actual shared values below remain reactive; they are never cached copies.
    this.stop ??= this.editor.repository.subscribeChanges(change => {
      if (change.inlineOwner) return;
      const state = this.editor.repository.readState();
      for (const [key, before] of change.previousContents) {
        const after = state.contents[key];
        const identity = (c: typeof before) => c && [c.viewType, c.payload.id, (c.payload.metadata as JsonObject | undefined)?.documentId, (c.payload.metadata as JsonObject | undefined)?.workspaceId, c.definitionOwnerKey];
        if (!before || !after || JSON.stringify(identity(before)) !== JSON.stringify(identity(after)) ||
          JSON.stringify([before.children, before.inlineContent, before.ownedRelations]) !== JSON.stringify([after.children, after.inlineContent, after.ownedRelations])) {
          this.topology[1](n => n + 1); break;
        }
      }
    });
    this.topology[0]();
    return resolveLinkedProperty(this.editor.repository.state, property, contentKey,
      this.editor.repository.hasValidStructuralEvidence ? this.lookup : undefined);
  }
  dispose() { this.stop?.(); }

  private owner(id: string, property?: JsonObject, contentKey?: string) {
    const state = this.editor.repository.readState();
    if (property) return linkedDefinitionOwner(state, property, contentKey);
    const owners = Object.values(state.contents).filter(c => Object.hasOwn(linkedRegistry(state, c.key), id));
    if (owners.length !== 1) throw new Error("Missing or ambiguous linked definition identity");
    return owners[0];
  }
  segments(id: string, expected?: JsonObject, contentKey?: string) {
    const owner = this.owner(id, expected, contentKey);
    if (!owner) return [];
    this.editor.repository.state.revision;
    return Object.values(this.editor.repository.state.contents).flatMap(content => {
      const properties = content.payload.standoffProperties;
      if (!Array.isArray(properties)) return [];
      return properties.flatMap((property, index) => property.annotationId === id && !property.isDeleted && linkedDefinitionOwner(this.editor.repository.readState(), property, content.key)?.key === owner?.key ? [{ contentKey: content.key, blockId: content.payload.id, index, property: clone(JSON.parse(JSON.stringify(property))) as JsonObject }] : []);
    });
  }
  create(type: string, value = "") {
    const range = this.editor.crossText.range(); if (!range) throw new Error("Select text across Blocks first");
    if (!type.trim() || type.startsWith("style/") || type.startsWith("text/")) throw new Error("Choose a semantic annotation type; ordinary styles stay independent");
    const segments = this.editor.crossText.resolve(range.anchor, range.head).filter(s => s.end > s.start);
    return this.createForSegments(segments, type, value);
  }
  createForSegments(segments: Array<{ nodeKey: string; start: number; end: number }>, type: string, value = "", metadata: JsonObject = {}) {
    if (!type.trim() || type.trim().startsWith("style/") || type.trim().startsWith("text/")) throw new Error("Choose a semantic annotation type; ordinary styles stay independent");
    if (!segments.length || segments.some(s => s.end <= s.start)) throw new Error("Select a non-empty text range");
    return this.createBatch([segments.map(s => this.editor.textRanges.snapshot(s.nodeKey, s.start, s.end))], type.trim(), value, metadata,
      this.editor.repository.state.revision, "Create linked annotation", true)[0];
  }

  /** Atomic local or linked mentions; policy/eligibility belongs to the caller. */
  createBatch(groups: readonly (readonly TextRangeSnapshot[])[], type: string, value: string, metadata: JsonObject, revision: number, label: string, forceLinked = false): string[] {
    if (this.editor.repository.readState().revision !== revision) throw new Error("The document changed. Select the text again.");
    if (type.trim().startsWith("style/") || type.trim().startsWith("text/")) throw new Error("Choose a semantic annotation type; ordinary styles stay independent");
    type = type.trim();
    if (!type.trim() || !groups.length || groups.some(group => !group.length)) throw new Error("Select a non-empty annotation range");
    this.editor.textRanges.validate(groups.flat(), "cell");
    const state = this.editor.repository.readState(), registries = new Map<string, ReturnType<typeof linkedRegistry>>();
    const updates = new Map<string, JsonObject[]>(), ids: string[] = [];
    for (const ranges of groups) {
      const id = crypto.randomUUID(); ids.push(id);
      const shared = forceLinked || ranges.length > 1;
      const owners = new Map(ranges.map(r => { const owner = resourceOwner(state, r.contentKey); if (!owner) throw new Error("Missing annotation resource owner"); return [owner.key, owner]; }));
      const owner = owners.size === 1 ? [...owners.values()][0] : state.contents[state.placements[state.rootPlacementKey].contentKey];
      if (shared && owners.size > 1 && owner.viewType !== "workspace-block") throw new Error("Cross-resource definitions need a shared Workspace owner");
      if (shared) {
        const registry = registries.get(owner.key) ?? clone(linkedRegistry(state, owner.key));
        registry[id] = { id, type, value, metadata: clone(metadata), attributes: {} }; registries.set(owner.key, registry);
      }
      for (const range of ranges) {
        let properties = updates.get(range.contentKey);
        if (!properties) updates.set(range.contentKey, properties = clone(state.contents[range.contentKey].payload.standoffProperties as JsonObject[] ?? []));
        if (shared && properties.some(p => p.annotationId === id && p.start === range.start && p.end === range.end - 1)) continue;
        properties.push({ id: shared ? crypto.randomUUID() : id, type, start: range.start, end: range.end - 1,
          ...(shared ? { annotationId: id, ...(owners.size > 1 ? { externalDefinition: definitionProvenance(owner, id) } : {}) } : { value, metadata: clone(metadata) }) });
      }
    }
    const operations: RepositoryOperation[] = [];
    for (const key of new Set([...registries.keys(), ...updates.keys()])) {
      const content = state.contents[key];
      operations.push({ kind: "put-content", ...(updates.has(key) ? { annotationOrigins: updates.get(key)!.map((_,i)=> i < (Array.isArray(content.payload.standoffProperties)?content.payload.standoffProperties.length:0)?i:null) } : {}), record: { ...content, payload: { ...content.payload,
        ...(registries.has(key) ? { linkedAnnotations: registries.get(key)! } : {}),
        ...(updates.has(key) ? { standoffProperties: updates.get(key)! } : {}),
      } } });
    }
    if(!this.editor.commands.stageAnnotationBatch(label,operations,revision))this.editor.repository.commit(label, operations);
    return ids;
  }
  edit(nodeKey: string, index: number, expected: JsonObject, action: AnnotationAction | AnnotationPatch) {
    if (typeof expected.annotationId !== "string") return this.editor.commands.editStandoffProperty(nodeKey, index, expected, action);
    const id = expected.annotationId, state = this.editor.repository.readState(), owner = this.owner(id, expected, this.editor.node(nodeKey)?.contentKey), shared = owner && linkedRegistry(state, owner.key)[id];
    if (!owner || !shared || shared.isDeleted) throw new Error("The linked annotation no longer exists");
    let result = expected;
    this.editor.commands.transaction("Edit linked annotation", () => {
      // Range operations affect this segment only. Shared settings are stored once.
      result = this.editor.commands.editStandoffProperty(nodeKey, index, expected, typeof action === "string" ? action : { start: action.start, end: action.end });
      if (typeof action !== "string") {
        const next = clone(shared);
        for (const field of ["metadata", "attributes", "value"] as const) if (action[field] !== undefined) {
          if (field === "value" ? typeof action[field] !== "string" : !action[field] || typeof action[field] !== "object" || Array.isArray(action[field])) throw new Error("Invalid shared annotation settings");
          next[field] = clone(action[field]);
        }
        const placements = documentRootPlacements(state, owner.key);
        if (placements.length !== 1) throw new Error("Missing or ambiguous linked definition owner placement");
        this.editor.commands.setPayloadField(placements[0].key, "linkedAnnotations", { ...clone(linkedRegistry(state, owner.key)), [id]: next });
      }
    });
    return result;
  }
  deleteAll(id: string, property?: JsonObject, contentKey?: string) {
    const state = this.editor.repository.readState(), owner = this.owner(id, property, contentKey), shared = owner && linkedRegistry(state, owner.key)[id];
    if (!owner || !shared) throw new Error("The linked annotation no longer exists");
    this.editor.repository.commit("Delete whole linked annotation", [{ kind: "put-content", record: { ...owner,
      payload: { ...owner.payload, linkedAnnotations: { ...clone(linkedRegistry(state, owner.key)), [id]: { ...clone(shared), isDeleted: true } } } } }]);
  }
}
