import { describe, expect, it } from "vitest";
import { unwrap } from "solid-js/store";
import { decodeDocument, encodeDocument, encodeLegacyStandalone, encodeWorkspace, LegacyExportLossError } from "./codecs";
import { TreeCommandError, TreeCommands } from "./commands";
import { OccurrenceIndex } from "./occurrences";
import { BlockTreeProjection } from "./projection";
import { CanonicalRepository } from "./repository";
import { decodeExtendedRepository, encodeExtendedRepository } from "./extended-codec";

function setup(dto: Record<string, unknown>) {
  const decoded = decodeDocument(dto);
  const repository = new CanonicalRepository(decoded.state);
  const occurrences = new OccurrenceIndex();
  const commands = new TreeCommands(repository, (key) => occurrences.resolve(key));
  const primary = new BlockTreeProjection(repository, "view:primary", occurrences);
  return { repository, occurrences, commands, primary };
}

describe("legacy JSON codecs", () => {
  it("round-trips unknown fields, omitted fields, and owned/opaque relations", () => {
    const dto = {
      id: "doc-1",
      type: "document-block",
      metadata: { focus: { blockId: "plain-1", caret: 2 }, extra: null },
      future: { nested: [1, 2, 3] },
      children: [
        {
          id: "plain-1",
          type: "plain-text-block",
          text: "A😀é",
          metadata: {},
          relation: {
            leftMargin: {
              id: "margin-1",
              type: "left-margin-block",
              children: [],
            },
            futureRelation: { untouched: true },
          },
        },
      ],
    };
    const decoded = decodeDocument(dto);
    expect(encodeDocument(decoded.state)).toEqual(dto);
  });

  it("preserves null collections and excludes client-only Standoff properties", () => {
    const dto = {
      id: "stand-1",
      type: "standoff-editor-block",
      text: "abc",
      children: null,
      relation: null,
      standoffProperties: [
        { id: "saved", type: "style/bold", start: 0, end: 1 },
        { id: "search", type: "codex/search/highlight", start: 0, end: 2, clientOnly: true },
      ],
    };
    const decoded = decodeDocument(dto);
    expect(encodeDocument(decoded.state)).toEqual({
      ...dto,
      standoffProperties: [dto.standoffProperties[0]],
    });
  });

  it("emits empty children for externally loaded documents in a workspace snapshot", () => {
    const dto = {
      type: "document-block",
      metadata: { loadFromExternal: true, folder: "docs", filename: "one.json" },
      children: [{ type: "plain-text-block", text: "hydrated" }],
    };
    const decoded = decodeDocument(dto);
    expect(encodeDocument(decoded.state).children).toHaveLength(1);
    expect(encodeWorkspace(decoded.state).children).toEqual([]);
  });
});

describe("tree commands", () => {
  it("inserts, reorders, removes, and restores one exact subtree", () => {
    const { repository, commands, primary } = setup({
      id: "root",
      type: "document-block",
      children: [
        { id: "a", type: "plain-text-block", text: "A", children: [] },
        { id: "b", type: "plain-text-block", text: "B", children: [] },
        { id: "c", type: "plain-text-block", text: "C", children: [] },
      ],
    });
    const root = () => primary.state.nodes[primary.state.rootKey];
    const ids = () => root().children.map((key) => primary.state.nodes[key].payload.id);

    const inserted = commands.insert(
      { id: "x", type: "plain-text-block", text: "X", children: [] },
      { kind: "before", anchorKey: root().children[1] },
    );
    expect(ids()).toEqual(["a", "x", "b", "c"]);

    commands.move(inserted, { kind: "after", anchorKey: root().children.at(-1)! });
    expect(ids()).toEqual(["a", "b", "c", "x"]);

    commands.remove(root().children[1]);
    expect(ids()).toEqual(["a", "c", "x"]);
    repository.undo();
    expect(ids()).toEqual(["a", "b", "c", "x"]);
    repository.redo();
    expect(ids()).toEqual(["a", "c", "x"]);
  });

  it("uses indexes after source removal and publishes a transaction once", () => {
    const { repository, commands, primary } = setup({
      type: "document-block",
      children: [
        { id: "a", type: "plain-text-block", text: "A" },
        { id: "b", type: "plain-text-block", text: "B" },
        { id: "c", type: "plain-text-block", text: "C" },
      ],
    });
    const root = () => primary.state.nodes[primary.state.rootKey];
    const blockB = root().children[1];
    commands.transaction("Two edits", () => {
      commands.move(root().children[0], { kind: "at", parentKey: root().key, index: 2 });
      commands.setPayloadField(blockB, "text", "B changed");
    });
    expect(repository.state.revision).toBe(1);
    expect(root().children.map((key) => primary.state.nodes[key].payload.id)).toEqual(["b", "c", "a"]);
    expect(root().children.map((key) => primary.state.nodes[key].payload.text)).toEqual([
      "B changed",
      "C",
      "A",
    ]);
    repository.undo();
    expect(repository.state.revision).toBe(2);
    expect(root().children.map((key) => primary.state.nodes[key].payload.id)).toEqual(["a", "b", "c"]);
  });

  it("rejects invalid moves without publishing partial state", () => {
    const { repository, commands, primary } = setup({
      type: "document-block",
      children: [
        {
          id: "parent",
          type: "container-block",
          children: [{ id: "child", type: "plain-text-block", text: "child" }],
        },
      ],
    });
    const root = primary.state.nodes[primary.state.rootKey];
    const parent = primary.state.nodes[root.children[0]];
    expect(() =>
      commands.move(parent.key, { kind: "at", parentKey: parent.children[0], index: 0 }),
    ).toThrow();
    expect(repository.state.revision).toBe(0);
    expect(encodeDocument(repository.snapshot()).children).toHaveLength(1);
  });

  it("shares content between projections while keeping occurrence keys distinct", () => {
    const { repository, occurrences, commands, primary } = setup({
      type: "document-block",
      children: [{ id: "plain", type: "plain-text-block", text: "Editable notes" }],
    });
    const linked = new BlockTreeProjection(repository, "view:linked", occurrences);
    const primaryText = primary.state.nodes[primary.state.nodes[primary.state.rootKey].children[0]];
    const linkedText = linked.state.nodes[linked.state.nodes[linked.state.rootKey].children[0]];
    expect(primaryText.key).not.toBe(linkedText.key);
    expect(primaryText.contentKey).toBe(linkedText.contentKey);

    commands.setPayloadField(primaryText.key, "text", "Editable notes!");
    expect(primary.state.nodes[primaryText.key].payload.text).toBe("Editable notes!");
    expect(linked.state.nodes[linkedText.key].payload.text).toBe("Editable notes!");
    expect((encodeDocument(repository.snapshot()).children as any[])[0].text).toBe("Editable notes!");
  });

  it("treats moving before or after itself as a no-op", () => {
    const { repository, commands, primary } = setup({
      type: "document-block",
      children: [{ id: "a", type: "plain-text-block", text: "A" }],
    });
    const key = primary.state.nodes[primary.state.rootKey].children[0];
    commands.move(key, { kind: "after", anchorKey: key });
    expect(repository.state.revision).toBe(0);
  });

  it("keeps leaf character payloads private across projections, including extended payloads", () => {
    const { repository, occurrences, commands, primary } = setup({ type: "standoff-editor-block", text: "😀" });
    const cell = primary.node(primary.state.rootKey)!.inlineContent[0];
    const linked = new BlockTreeProjection(repository, "view:leaf-copy", occurrences);
    const other = linked.node(linked.state.rootKey)!.inlineContent[0];
    const payload = () => unwrap(primary.node(cell)!.payload);
    const canonical = () => repository.readState().contents[primary.node(cell)!.contentKey].payload;
    expect(payload()).toEqual({ text: "😀" });
    expect(payload()).not.toBe(canonical());
    expect(payload()).not.toBe(unwrap(linked.node(other)!.payload));
    commands.setPayloadField(cell, "future", { nested: [1, 2] });
    expect(payload().future).toEqual({ nested: [1, 2] });
    expect(payload().future).not.toBe(canonical().future);
    expect(payload().future).not.toBe(unwrap(linked.node(other)!.payload).future);
    commands.setPayloadField(cell, "text", "Z");
    expect(linked.node(other)!.payload.text).toBe("Z");
    repository.undo(); expect(linked.node(other)!.payload.text).toBe("😀");
    primary.dispose(); linked.dispose();
  });

  it("rejects an out-of-range insertion index", () => {
    const { commands, primary } = setup({ type: "document-block", children: [] });
    expect(() =>
      commands.insert(
        { type: "plain-text-block", text: "X" },
        { kind: "at", parentKey: primary.state.rootKey, index: 1 },
      ),
    ).toThrow(TreeCommandError);
  });

  it("moves a subtree across parents without cloning its placement", () => {
    const { commands, primary } = setup({
      type: "document-block",
      children: [
        {
          id: "left",
          type: "container-block",
          children: [{ id: "moving", type: "plain-text-block", text: "move me" }],
        },
        { id: "right", type: "container-block", children: [] },
      ],
    });
    const root = primary.state.nodes[primary.state.rootKey];
    const left = primary.state.nodes[root.children[0]];
    const right = primary.state.nodes[root.children[1]];
    const movingNode = primary.state.nodes[left.children[0]];
    const placementKey = movingNode.placementKey;
    commands.move(movingNode.key, { kind: "at", parentKey: right.key, index: 0 });
    expect(primary.state.nodes[left.key].children).toEqual([]);
    const moved = primary.state.nodes[primary.state.nodes[right.key].children[0]];
    expect(moved.placementKey).toBe(placementKey);
    expect(moved.payload.id).toBe("moving");
  });

  it("unwraps children in order and restores the wrapper on undo", () => {
    const { repository, commands, primary } = setup({
      type: "document-block",
      children: [
        {
          id: "wrapper",
          type: "container-block",
          children: [
            { id: "one", type: "plain-text-block", text: "1" },
            { id: "two", type: "plain-text-block", text: "2" },
          ],
        },
      ],
    });
    const root = () => primary.state.nodes[primary.state.rootKey];
    commands.unwrap(root().children[0]);
    expect(root().children.map((key) => primary.state.nodes[key].payload.id)).toEqual(["one", "two"]);
    repository.undo();
    expect(root().children.map((key) => primary.state.nodes[key].payload.id)).toEqual(["wrapper"]);
  });

  it("replaces a view type while preserving children in one history entry", () => {
    const { repository, commands, primary } = setup({
      type: "document-block",
      children: [
        {
          id: "old",
          type: "container-block",
          children: [{ id: "kept", type: "plain-text-block", text: "kept" }],
        },
      ],
    });
    const root = () => primary.state.nodes[primary.state.rootKey];
    const placementKey = primary.state.nodes[root().children[0]].placementKey;
    commands.replace(
      root().children[0],
      { id: "replacement", type: "page-block", children: [] },
      "preserve",
    );
    const replacement = primary.state.nodes[root().children[0]];
    expect(replacement.placementKey).toBe(placementKey);
    expect(replacement.payload.id).toBe("replacement");
    expect(primary.state.nodes[replacement.children[0]].payload.id).toBe("kept");
    repository.undo();
    expect(primary.state.nodes[root().children[0]].payload.id).toBe("old");
  });

  it("sets and removes an owned relation without flattening it into children", () => {
    const { repository, commands, primary } = setup({
      id: "text",
      type: "plain-text-block",
      text: "source",
      children: [],
    });
    const relation = commands.setRelation(primary.state.rootKey, "leftMargin", {
      id: "margin",
      type: "left-margin-block",
      children: [],
    });
    const encoded = encodeDocument(repository.snapshot());
    expect(encoded.children).toEqual([]);
    expect((encoded.relation as any).leftMargin.id).toBe("margin");
    commands.removeRelation(primary.state.rootKey, "leftMargin");
    expect(encodeDocument(repository.snapshot()).relation).toEqual({});
    commands.remove(relation);
    expect(repository.state.revision).toBe(2);
  });

  it("transcludes shared content, unlinks without deleting the source, and undoes", () => {
    const { repository, commands, primary } = setup({
      type: "document-block",
      children: [
        {
          id: "source",
          type: "container-block",
          children: [{ id: "shared-text", type: "plain-text-block", text: "shared" }],
        },
        { id: "host", type: "container-block", children: [] },
      ],
    });
    const root = () => primary.state.nodes[primary.state.rootKey];
    const source = () => primary.state.nodes[root().children[0]];
    const host = () => primary.state.nodes[root().children[1]];
    const referencePlacement = commands.transclude(source().key, {
      kind: "at",
      parentKey: host().key,
      index: 0,
    });
    const reference = () => primary.nodeForPlacement(referencePlacement)!;
    expect(reference().contentKey).toBe(source().contentKey);
    expect(reference().key).not.toBe(source().key);
    expect(reference().children[0]).not.toBe(source().children[0]);

    commands.setPayloadField(reference().children[0], "text", "updated through reference");
    expect(primary.state.nodes[source().children[0]].payload.text).toBe("updated through reference");
    commands.unlink(reference().key);
    expect(primary.state.nodes[source().children[0]].payload.text).toBe("updated through reference");
    expect(host().children).toEqual([]);
    repository.undo();
    expect(host().children).toHaveLength(1);
  });

  it("detaches a reference into an independent content subtree", () => {
    const { commands, primary } = setup({
      type: "document-block",
      children: [
        { id: "source", type: "plain-text-block", text: "shared" },
        { id: "host", type: "container-block", children: [] },
      ],
    });
    const root = primary.state.nodes[primary.state.rootKey];
    const source = primary.state.nodes[root.children[0]];
    const host = primary.state.nodes[root.children[1]];
    const referencePlacement = commands.transclude(source.key, {
      kind: "at",
      parentKey: host.key,
      index: 0,
    });
    commands.detach(referencePlacement);
    const detached = primary.nodeForPlacement(referencePlacement)!;
    expect(detached.contentKey).not.toBe(source.contentKey);
    commands.setPayloadField(detached.key, "text", "detached");
    expect(primary.state.nodes[source.key].payload.text).toBe("shared");
    expect(primary.state.nodes[detached.key].payload.text).toBe("detached");
  });

  it("round-trips reference identities through the separate repository codec", () => {
    const { repository, commands, primary } = setup({
      type: "document-block",
      children: [
        { id: "source", type: "plain-text-block", text: "shared" },
        { id: "host", type: "container-block", children: [] },
      ],
    });
    const root = primary.state.nodes[primary.state.rootKey];
    commands.transclude(root.children[0], {
      kind: "at",
      parentKey: root.children[1],
      index: 0,
    });
    const encoded = encodeExtendedRepository(repository.snapshot());
    const restored = decodeExtendedRepository(encoded);
    const references = Object.values(restored.placements).filter((placement) => placement.kind === "reference");
    expect(references).toHaveLength(1);
    expect(restored.contents[references[0].contentKey].payload.id).toBe("source");
  });

  it("splits and joins Standoff Cells with annotation offsets and one-step undo", () => {
    const { repository, commands, primary } = setup({
      type: "document-block",
      children: [
        {
          id: "text",
          type: "standoff-editor-block",
          text: "abcd",
          standoffProperties: [{ id: "bold", type: "style/bold", start: 1, end: 3 }],
          children: [],
        },
      ],
    });
    const root = () => primary.state.nodes[primary.state.rootKey];
    const left = () => primary.state.nodes[root().children[0]];
    const rightPlacement = commands.splitStandoff(left().key, 2);
    expect((encodeDocument(repository.snapshot()).children as any[]).map((block) => block.text)).toEqual(["ab", "cd"]);
    const splitDto = encodeDocument(repository.snapshot()).children as any[];
    expect(splitDto[0].standoffProperties[0]).toMatchObject({ start: 1, end: 1 });
    expect(splitDto[1].standoffProperties[0]).toMatchObject({ start: 0, end: 1 });
    const right = primary.nodeForPlacement(rightPlacement)!;
    expect(commands.joinStandoff(left().key, right.key)).toBe(2);
    expect((encodeDocument(repository.snapshot()).children as any[])[0].text).toBe("abcd");
    repository.undo();
    expect((encodeDocument(repository.snapshot()).children as any[]).map((block) => block.text)).toEqual(["ab", "cd"]);
  });

  it("keeps inline images typed and refuses a silently lossy legacy export", () => {
    const { repository, commands, primary } = setup({
      type: "document-block",
      children: [{ id: "text", type: "standoff-editor-block", text: "AB", children: [] }],
    });
    const root = primary.state.nodes[primary.state.rootKey];
    const standoff = primary.state.nodes[root.children[0]];
    const imagePlacement = commands.insertInlineImage(standoff.key, 1, {
      assetId: "asset:one",
      src: "/image.png",
      alt: "[diagram]",
      width: 120,
      status: "ready",
    });
    expect(() => encodeDocument(repository.snapshot())).toThrow(LegacyExportLossError);
    const legacy = encodeLegacyStandalone(repository.snapshot());
    expect((legacy.dto.children as any[])[0].text).toBe("A[diagram]B");
    expect(legacy.losses).toHaveLength(1);
    const extended = decodeExtendedRepository(encodeExtendedRepository(repository.snapshot()));
    expect(extended.contents[extended.placements[imagePlacement as string].contentKey].viewType).toBe("image-cell");
    commands.moveInline(standoff.key, 1, 2);
    repository.undo();
    const restoredHost = repository.state.contents[repository.state.placements[standoff.placementKey].contentKey];
    expect(restoredHost.inlineContent[1]).toBe(imagePlacement);
  });
});
