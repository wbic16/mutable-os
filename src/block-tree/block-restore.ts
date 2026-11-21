/** Authored-value boundary for the first Block restore. No historical graph keys,
 * counters, Block/Placement identities or executable/reference payloads. */
import { clone } from "./clone";
import { equal, freeze, type DeepReadonly, type CommandDescriptor } from "./commit-capture";
import { createBlockId, createContentKey, createPlacementKey } from "./ids";
import type { ContentRecord, PlacementRecord, RepositoryOperation, RepositoryState, JsonObject } from "./types";
import { restoreProperties } from "./restore-properties";

export interface LeafAuthoredState {
  viewType: "standoff-editor-block" | "plain-text-block";
  text: string;
  payload: JsonObject;
}
export interface BlockRestorePlan {
  expectedRevision: number;
  blockId: string;
  placementKey: string;
  operations: RepositoryOperation[];
  descriptor: CommandDescriptor;
}
const check = (ok: unknown, message: string): void => { if (!ok) throw Error(message); };
const keysOnly = (value: object, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

export function leafAuthoredState(content: DeepReadonly<ContentRecord>, graph: DeepReadonly<Pick<RepositoryState, "contents" | "placements">>): DeepReadonly<LeafAuthoredState> {
  check(!content.compactInline,"Historical Block restore is not yet qualified for compact text; nothing has been changed.");
  check(["standoff-editor-block", "plain-text-block"].includes(content.viewType), "This first restore supports text Blocks only.");
  check(!content.children.length && !Object.keys(content.ownedRelations).length && !Object.keys(content.opaqueRelations).length,
    "Descendants and relations require Restore subtree; nothing has been changed.");
  check(keysOnly(content.payload, ["id", "type", "text", "metadata", "standoffProperties", "blockProperties"]),
    "This Block has authored fields whose restoration semantics are not supported yet.");
  const payload = clone(content.payload) as JsonObject;
  delete payload.id; delete payload.type; delete payload.text;
  if (payload.metadata !== undefined) {
    check(payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) && keysOnly(payload.metadata as object, ["name", "title"]) &&
      Object.values(payload.metadata as object).every(v => typeof v === "string"), "This Block's metadata needs explicit restoration semantics.");
  }
  if (payload.blockProperties !== undefined) {
    payload.blockProperties = restoreProperties(payload.blockProperties, "Block property");
  }
  let text: string;
  if (content.viewType === "standoff-editor-block") {
    check(content.inlineKind === "standoff" && !Object.hasOwn(content.payload, "text"), "Unsupported text representation.");
    text = content.inlineContent.map(key => {
      const p = graph.placements[key], c = p && graph.contents[p.contentKey];
      check(p?.kind === "inline" && !p.externalReference && c?.viewType === "text-cell" && keysOnly(c.payload, ["text"]) &&
        typeof c.payload.text === "string" && [...c.payload.text].length === 1 && !c.children.length && !c.inlineContent.length &&
        !Object.keys(c.ownedRelations).length && !Object.keys(c.opaqueRelations).length && !c.definitionOwnerKey,
        "Inline images, shared definitions and structural Cells require a later restore operation.");
      return c.payload.text as string;
    }).join("");
  } else {
    check(!content.inlineContent.length && !content.inlineKind && typeof content.payload.text === "string", "Unsupported plain-text representation.");
    text = content.payload.text as string;
  }
  if (payload.standoffProperties !== undefined) {
    payload.standoffProperties = restoreProperties(payload.standoffProperties, "Annotation", [...text].length);
  }
  check(new TextEncoder().encode(JSON.stringify({ text, payload })).length <= 1024 * 1024, "Authored restore value exceeds its bounded transfer size.");
  return freeze({ viewType: content.viewType as LeafAuthoredState["viewType"], text, payload });
}

/** Only a unique owned path in the present may be replaced. This also rejects
 * apparent single placements underneath a transcluded/shared ancestor. */
export function assertRestoreTarget(state: DeepReadonly<RepositoryState>, placementKey: string, blockId: string): void {
  const target = state.placements[placementKey];
  check(target && state.contents[target.contentKey]?.payload.id === blockId, "The current Block was removed or replaced. Reopen History.");
  check(Object.values(state.contents).filter(c => c.payload.id === blockId).length === 1, "The current Block identity is ambiguous.");
  let key = placementKey; const seen = new Set<string>();
  while (true) {
    const p = state.placements[key];
    check(p && p.kind === "owned" && !p.externalReference && !seen.has(p.contentKey), "Shared content and references are not supported by Restore this Block.");
    seen.add(p.contentKey);
    check(Object.values(state.placements).filter(other => other.contentKey === p.contentKey).length === 1,
      "This Block or an ancestor is shared. Restore subtree/sharing semantics must be chosen explicitly.");
    if (key === state.rootPlacementKey) { check(state.contents[p.contentKey].viewType === "document-block", "Open the Document separately to restore a Block."); break; }
    const owners = Object.values(state.contents).filter(c => [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)].includes(key));
    check(owners.length === 1, "The current occurrence is missing or ambiguous.");
    const parents = Object.values(state.placements).filter(p => p.contentKey === owners[0].key);
    check(parents.length === 1, "This occurrence has a shared or missing ancestor."); key = parents[0].key;
  }
  const counts = new Map<string, number>();
  for (const p of Object.values(state.placements)) counts.set(p.contentKey, (counts.get(p.contentKey) ?? 0) + 1);
  const content = state.contents[target.contentKey];
  for (const pk of content.inlineContent) {
    const p = state.placements[pk];
    check(p && counts.get(p.contentKey) === 1,
      "Shared inline content is not supported by this restore.");
  }
}

export function planBlockRestore(state: DeepReadonly<RepositoryState>, placementKey: string, blockId: string, source: DeepReadonly<LeafAuthoredState>): DeepReadonly<BlockRestorePlan> {
  assertRestoreTarget(state, placementKey, blockId);
  const current = state.contents[state.placements[placementKey].contentKey], authored = leafAuthoredState(current, state);
  check(source.viewType === authored.viewType, "Restoring across Block types needs explicit conversion semantics.");
  // Validate the transfer again without trusting a preview or caller-owned object.
  check(keysOnly(source, ["viewType", "text", "payload"]) && typeof source.text === "string" && source.payload && keysOnly(source.payload, ["metadata", "standoffProperties", "blockProperties"]), "Invalid authored restore value.");
  check([...source.text].length <= 50_000 && new TextEncoder().encode(JSON.stringify(source)).length <= 1024 * 1024, "Restore value exceeds bounded text size.");
  const operations: RepositoryOperation[] = [];
  const descriptor = { commandId: "tree.restoreBlock", subjects: [{ contentKey: current.key, placementKey, blockId }] };
  const plan = () => freeze({ expectedRevision: state.revision, placementKey, blockId, operations, descriptor });
  if (equal(authored, source)) return plan();
  const next = clone(current) as ContentRecord;
  next.payload = { ...clone(source.payload), id: current.payload.id, ...(Object.hasOwn(current.payload, "type") ? { type: current.payload.type } : {}) };
  for (const field of ["standoffProperties", "blockProperties"]) if (Array.isArray(next.payload[field])) for (const p of next.payload[field]) p.id = createBlockId();
  const contents = { ...state.contents }, placements = { ...state.placements };
  if (next.inlineKind === "standoff") {
    const before = [...authored.text], after = [...source.text]; let prefix = 0, suffix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
    while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
    const inserted: string[] = [];
    for (const text of after.slice(prefix, after.length - suffix)) {
      const key = createContentKey(), pk = createPlacementKey();
      const record: ContentRecord = { key, viewType: "text-cell", payload: { text }, children: [], inlineContent: [], ownedRelations: {}, opaqueRelations: {}, inlineRevision: 0, revision: 0, wireChildren: "omitted", wireRelation: "omitted" };
      const placement: PlacementRecord = { key: pk, contentKey: key, kind: "inline" };
      operations.push({ kind: "put-content", record }, { kind: "put-placement", record: placement });
      contents[key] = record; placements[pk] = placement; inserted.push(pk);
    }
    for (const pk of current.inlineContent.slice(prefix, current.inlineContent.length - suffix)) {
      operations.push({ kind: "remove-placement", key: pk }, { kind: "remove-content", key: state.placements[pk].contentKey });
      delete contents[state.placements[pk].contentKey]; delete placements[pk];
    }
    next.inlineContent = [...current.inlineContent.slice(0, prefix), ...inserted, ...current.inlineContent.slice(current.inlineContent.length - suffix)];
    if (authored.text !== source.text) next.inlineRevision++;
  } else next.payload.text = source.text;
  // Reject unsupported transferred properties before anything is published.
  leafAuthoredState(next, { contents, placements });
  next.revision = current.revision + 1;
  operations.push({ kind: "put-content", record: next });
  return plan();
}
