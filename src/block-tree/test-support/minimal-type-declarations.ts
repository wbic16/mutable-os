import type { BlockTypeDeclaration } from "../type-declarations";
import type { BlockPropertyDefinition } from "../../properties/block-property-definitions";
import type { StandoffPropertyDefinition } from "../../properties/standoff-property-definitions";

/** Test-only vocabulary. Pure declarations: no registration or UI activation. */
export const verseGroupDefinition: BlockTypeDeclaration = Object.freeze({
  type: "verse-group-block",
  capabilities: Object.freeze(["container", "selectable"]),
});
export const alignmentDefinition: BlockPropertyDefinition = Object.freeze({
  type: "block/alignment",
  interpretedBy: "blockAppearance",
});
export const editorialDeletionDefinition: StandoffPropertyDefinition = Object.freeze({
  type: "editorial-deletion",
});
export const pilotBlockDeclarations = Object.freeze([verseGroupDefinition]);
