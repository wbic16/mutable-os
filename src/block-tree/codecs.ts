import {logicalInline} from "./inline-sequence";
import { clone } from "./clone";
import { createContentKey, createPlacementKey } from "./ids";
import type {
  ContentRecord,
  ExistingBlockDto,
  ExportContext,
  PlacementKey,
  RepositoryState,
  WireCollectionState,
} from "./types";

const ownedRelationNames = new Set(["leftMargin", "rightMargin"]);
const isOwnedRelationName = (name: string) => ownedRelationNames.has(name) || name.startsWith("superposition:") || name.startsWith("inline-reading:");

function collectionState(value: unknown, present: boolean): WireCollectionState {
  if (!present) return "omitted";
  return value === null ? "null" : "present";
}

function isBlockDto(value: unknown): value is ExistingBlockDto {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function viewTypeFor(wireType: unknown): string {
  if (wireType === "main-list-block" || wireType === "membrane-block") {
    return "document-block";
  }
  return typeof wireType === "string" ? wireType : "unknown-block";
}

export interface DecodedSubtree {
  state: RepositoryState;
  rootPlacementKey: PlacementKey;
}

export class LegacyExportLossError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyExportLossError";
  }
}

export function decodeBlockTree(dto: ExistingBlockDto): DecodedSubtree {
  const contents: RepositoryState["contents"] = {};
  const placements: RepositoryState["placements"] = {};

  const decode = (input: ExistingBlockDto): PlacementKey => {
    const contentKey = createContentKey();
    const placementKey = createPlacementKey();
    const hasChildren = Object.prototype.hasOwnProperty.call(input, "children");
    const hasRelation = Object.prototype.hasOwnProperty.call(input, "relation");
    const rawChildren = input.children;
    const rawRelation = input.relation;
    const payload = clone(input) as Record<string, unknown>;
    delete payload.children;
    delete payload.relation;
    const isStandoff = input.type === "standoff-editor-block";
    const standoffText = isStandoff ? payload.text : undefined;
    if (isStandoff) { delete payload.text; delete payload.inlineAtoms; }
    if (input.inlineAtoms !== undefined && (!isStandoff || input.text !== undefined || !Array.isArray(input.inlineAtoms))) throw Error('Invalid DTO inline authority');

    const content: ContentRecord = {
      key: contentKey,
      viewType: viewTypeFor(input.type),
      payload,
      children: [],
      inlineContent: [],
      inlineRevision: 0,
      inlineKind: isStandoff ? "standoff" : undefined,
      ownedRelations: {},
      opaqueRelations: {},
      wireChildren: collectionState(rawChildren, hasChildren),
      wireRelation: collectionState(rawRelation, hasRelation),
      revision: 0,
    };
    contents[contentKey] = content;
    placements[placementKey] = { key: placementKey, contentKey, kind: "owned" };

    if (isStandoff && input.inlineAtoms !== undefined) content.compactInline = {version:1,spans:clone(input.inlineAtoms as import('./inline-sequence').InlineAtom[])};
    if (isStandoff && typeof standoffText === "string") {
      content.inlineContent = [...standoffText].map((text) => {
        const cellContentKey = createContentKey();
        const cellPlacementKey = createPlacementKey();
        contents[cellContentKey] = {
          key: cellContentKey,
          viewType: "text-cell",
          payload: { text },
          children: [],
          inlineContent: [],
          inlineRevision: 0,
          ownedRelations: {},
          opaqueRelations: {},
          wireChildren: "omitted",
          wireRelation: "omitted",
          revision: 0,
        };
        placements[cellPlacementKey] = {
          key: cellPlacementKey,
          contentKey: cellContentKey,
          kind: "inline",
        };
        return cellPlacementKey;
      });
    }

    if (Array.isArray(rawChildren)) {
      content.children = rawChildren.map((child) => decode(child));
    }

    if (rawRelation && typeof rawRelation === "object" && !Array.isArray(rawRelation)) {
      for (const [name, value] of Object.entries(rawRelation)) {
        if (isOwnedRelationName(name) && isBlockDto(value)) {
          content.ownedRelations[name] = decode(value);
        } else {
          content.opaqueRelations[name] = clone(value);
        }
      }
    }
    return placementKey;
  };

  const rootPlacementKey = decode(dto);
  return {
    rootPlacementKey,
    state: { rootPlacementKey, contents, placements, revision: 0 },
  };
}

export const decodeDocument = decodeBlockTree;
export const decodeWorkspace = decodeBlockTree;

function withoutClientOnlyProperties(payload: Record<string, unknown>): Record<string, unknown> {
  const result = clone(payload);
  if (Array.isArray(result.standoffProperties)) {
    result.standoffProperties = result.standoffProperties.filter((property) => {
      if (!property || typeof property !== "object") return true;
      return !(property as Record<string, unknown>).clientOnly;
    });
  }
  return result;
}

export function encodeBlock(
  state: RepositoryState,
  rootPlacementKey: PlacementKey,
  context: ExportContext = { kind: "document" },
): ExistingBlockDto {
  const active = new Set<string>();

  const encode = (placementKey: PlacementKey): ExistingBlockDto => {
    const placement = state.placements[placementKey];
    if (!placement) throw new Error(`Cannot encode missing placement ${placementKey}`);
    if (placement.resourceRegistration || placement.kind === "owned" && (placement.externalReference || placement.resolvedReference)) throw new LegacyExportLossError("Native resource retention/ownership cannot be written as a legacy tree");
    const content = state.contents[placement.contentKey];
    if (!content) throw new Error(`Cannot encode missing content ${placement.contentKey}`);
    if (active.has(content.key)) {
      throw new Error(`Cannot encode cyclic content ${content.key} into legacy JSON`);
    }
    active.add(content.key);

    const output = withoutClientOnlyProperties(content.payload) as ExistingBlockDto;
    const focusBookmark = context.focusBookmarks?.[content.key];
    if (focusBookmark && content.viewType === "document-block") {
      output.metadata = {
        ...((output.metadata as Record<string, unknown> | undefined) ?? {}),
        focus: clone(focusBookmark),
      };
    }
    if (content.inlineKind === "standoff") {
      output.text = logicalInline(state,content).map(atom=>{
        if(atom.kind==='text')return atom.text;
        if(atom.kind==='alternative')throw new LegacyExportLossError('Inline alternatives require native Save; legacy text export would discard readings');
        const message=`Inline image ${String(atom.properties.assetId??'')} cannot be represented in legacy text JSON`;
        if(!context.allowLossyInline)throw new LegacyExportLossError(message);
        context.losses?.push(message);return String(atom.properties.alt??'');
      }).join('');
    }
    const metadata = output.metadata as Record<string, unknown> | undefined;
    const externalWorkspaceDocument =
      context.kind === "workspace" && metadata?.loadFromExternal === true;

    if (content.wireChildren === "null" && !content.children.length) {
      output.children = null;
    } else if (
      content.wireChildren === "present" ||
      content.children.length > 0 ||
      externalWorkspaceDocument
    ) {
      output.children = externalWorkspaceDocument
        ? []
        : content.children.map((childKey) => encode(childKey));
    } else {
      delete output.children;
    }

    const relation: Record<string, unknown> = clone(content.opaqueRelations);
    for (const [name, relationKey] of Object.entries(content.ownedRelations)) {
      relation[name] = encode(relationKey);
    }
    if (content.wireRelation === "null" && !Object.keys(relation).length) {
      output.relation = null;
    } else if (content.wireRelation === "present" || Object.keys(relation).length) {
      output.relation = relation;
    } else {
      delete output.relation;
    }

    active.delete(content.key);
    return output;
  };

  return encode(rootPlacementKey);
}

export function encodeDocument(
  state: RepositoryState,
  rootPlacementKey: PlacementKey = state.rootPlacementKey,
  focusBookmarks?: ExportContext["focusBookmarks"],
): ExistingBlockDto {
  return encodeBlock(state, rootPlacementKey, { kind: "document", focusBookmarks });
}

export function encodeWorkspace(
  state: RepositoryState,
  rootPlacementKey: PlacementKey = state.rootPlacementKey,
  focusBookmarks?: ExportContext["focusBookmarks"],
): ExistingBlockDto {
  return encodeBlock(state, rootPlacementKey, { kind: "workspace", focusBookmarks });
}

export function encodeLegacyStandalone(
  state: RepositoryState,
  rootPlacementKey: PlacementKey = state.rootPlacementKey,
): { dto: ExistingBlockDto; losses: string[] } {
  const losses: string[] = [];
  const dto = encodeBlock(state, rootPlacementKey, {
    kind: "document",
    allowLossyInline: true,
    losses,
  });
  return { dto, losses };
}

export function decodeDetachedSubtree(dto: ExistingBlockDto): DecodedSubtree {
  return decodeBlockTree(dto);
}
