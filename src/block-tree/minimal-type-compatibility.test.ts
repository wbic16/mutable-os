// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeBlockTree, encodeDocument } from "./codecs";
import { captureNative, decodeNative, nativeEnvelope, nativeText } from "../persistence/native-resource";
import { serializeSelection } from "../interchange/serializer";
import { materializeFragment } from "../interchange/materialize";
import { resourceToRepository } from "../history/durable-core";
import { alignmentDefinition, editorialDeletionDefinition, verseGroupDefinition } from "./test-support/minimal-type-declarations";

const fixture = () => ({ id: "doc", type: "document-block", children: [{
  id: "group", type: verseGroupDefinition.type, metadata: { intrinsic: { n: "01", attributes: [["language", "en"]] } },
  children: [{ id: "p", type: "standoff-editor-block", text: "A😀B", blockProperties: [
    { id: "left", type: alignmentDefinition.type, value: "left" },
    { id: "unknown", type: "historical/retained", metadata: { exact: [null, 1] } },
    { id: "right", type: alignmentDefinition.type, value: "right" },
  ], standoffProperties: [
    { id: "semantic", type: editorialDeletionDefinition.type, start: 1, end: 1, metadata: { sourceId: "source-1" } },
    { id: "format", type: "style/bold", start: 0, end: 2 },
  ] }, { id: "q", type: "standoff-editor-block", text: "Second" }],
}] });

describe("minimal type compatibility without registration dependencies", () => {
  it("preserves semantic identity, repeated properties, Unicode ranges and owned structure in native and legacy data", () => {
    const dto = fixture(), state = decodeBlockTree(dto).state;
    expect(encodeDocument(state)).toEqual(dto);
    const source = captureNative(state, "doc"), saved = nativeText(source);
    const loaded = decodeNative(new TextEncoder().encode(saved));
    expect(nativeText(loaded)).toBe(saved);
    expect(nativeEnvelope(loaded)).toEqual(nativeEnvelope(source));
    const legacy = encodeDocument(resourceToRepository(loaded));
    expect(legacy).toEqual(dto);
    const p = Object.values(loaded.contents).find(c => c.payload.id === "p")!;
    expect(p.inlineContent).toHaveLength(3);
    expect(p.payload.blockProperties).toEqual(dto.children[0].children[0].blockProperties);
    expect(p.payload.standoffProperties).toEqual(dto.children[0].children[0].standoffProperties);
  });

  it("keeps real clipboard admission opaque while retaining original semantics and descendants", () => {
    const dto = fixture(), state = decodeBlockTree(dto).state;
    const group = Object.values(state.placements).find(p => state.contents[p.contentKey].payload.id === "group")!;
    const fragment = serializeSelection(state, [{ placementKey: group.key }]);
    const pasted = materializeFragment(fragment);
    const root = pasted.state.contents[pasted.state.placements[pasted.roots[0]].contentKey];
    expect(root.viewType).toBe("mutable/opaque-block");
    expect(root.payload.original).toMatchObject({ type: verseGroupDefinition.type, data: { metadata: dto.children[0].metadata } });
    expect(root.children).toHaveLength(2);
    const p = pasted.state.contents[pasted.state.placements[root.children[0]].contentKey];
    expect(p.viewType).toBe("standoff-editor-block"); expect(p.inlineContent).toHaveLength(3);
    expect(p.payload.standoffProperties).toEqual([
      expect.objectContaining({ type: "mutable/opaque-property", start: 1, end: 1,
        original: expect.objectContaining({ type: editorialDeletionDefinition.type, data: { metadata: { sourceId: "source-1" } } }) }),
      expect.objectContaining({ type: "style/bold", start: 0, end: 2 }),
    ]);
    expect((p.payload.blockProperties as { type: string }[]).map(property => property.type))
      .toEqual([alignmentDefinition.type, "mutable/opaque-block-property", alignmentDefinition.type]);
  });

  it("documents the current direct semantic TextBlock limit rather than disguising payload storage as editing support", () => {
    const state = decodeBlockTree({ id: "line", type: "verse-line-block", text: "A😀B" }).state;
    const line = Object.values(state.contents)[0];
    expect(line.viewType).toBe("verse-line-block");
    expect(line.payload.text).toBe("A😀B");
    expect(line.inlineKind).toBeUndefined(); expect(line.inlineContent).toEqual([]);
    const wire = nativeEnvelope(captureNative(decodeBlockTree(fixture()).state, "doc"));
    wire.document.blocks.find(block => block.id === "p")!.type = "verse-line-block";
    expect(() => decodeNative(new TextEncoder().encode(JSON.stringify(wire)))).toThrow("unexpected inline content");
  });
});
