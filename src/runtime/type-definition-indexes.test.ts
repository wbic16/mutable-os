// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BlockPropertyDefinitionIndex } from "../properties/block-property-definitions";
import { StandoffPropertyDefinitionIndex } from "../properties/standoff-property-definitions";
import { alignmentDefinition, editorialDeletionDefinition, pilotBlockDeclarations } from "../block-tree/test-support/minimal-type-declarations";

describe.each([
  { category: "Block Property", create: () => new BlockPropertyDefinitionIndex() },
  { category: "Standoff Property", create: () => new StandoffPropertyDefinitionIndex() },
])("$category definition index", ({ category, create }) => {
  it("keeps exact identities, isolates input and never invokes a validator implicitly", () => {
    const index = create(), validate = vi.fn();
    const input = { type: " example/type ", label: "Example", validate };
    const release = index.register(input, " owner ");
    const definition = index.get(input.type)!;
    expect(index.get("example/type")).toBeUndefined();
    expect(index.owner(input.type)).toBe(" owner ");
    expect(Object.isFrozen(input)).toBe(false);
    input.label = "Changed"; input.type = "another";
    expect(definition.label).toBe("Example");
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Reflect.set(definition, "label", "Mutation")).toBe(false);
    const snapshot = index.list();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).toEqual([definition]);
    index.register({ type: "next" }, "other");
    expect(index.list().map(d => d.type)).toEqual([" example/type ", "next"]);
    expect(snapshot).toEqual([definition]);
    expect(validate).not.toHaveBeenCalled();
    // An explicit caller may use the validator, but discovery does not call it.
    definition.validate?.({ type: definition.type });
    expect(validate).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledWith({ type: definition.type });
    release();
    expect(index.get(" example/type ")).toBeUndefined();
    expect(index.list().map(d => d.type)).toEqual(["next"]);
  });

  it("rejects duplicates atomically with category and both owners in diagnostics", () => {
    const index = create(); index.register({ type: "example" }, "original");
    for (const owner of ["original", "attempted"]) {
      expect(() => index.register({ type: "example", label: "replacement" }, owner))
        .toThrow(`${category} example already belongs to original; cannot register for ${owner}`);
    }
    expect(index.list()).toEqual([{ type: "example" }]);
    expect(index.owner("example")).toBe("original");
  });

  it("rejects malformed definitions and owners before changing entries", () => {
    const index = create(); index.register({ type: "kept" }, "owner");
    for (const input of [null, {}, { type: "" }, { type: " \n" }, { type: 7 },
      { type: "new", label: false }, { type: "new", validate: "callback" }]) {
      expect(() => index.register(input as never, "owner")).toThrow(`Invalid ${category}`);
    }
    for (const owner of [undefined, null, 7, "", " \n"]) {
      expect(() => index.register({ type: "new" }, owner as never)).toThrow(`Invalid ${category}`);
    }
    expect(index.list()).toEqual([{ type: "kept" }]);
  });

  it("makes stale disposers harmless and closes independently of outstanding releases", () => {
    const index = create();
    const first = index.register({ type: "first" }, "one");
    index.register({ type: "second" }, "two");
    first(); first();
    const replacement = index.register({ type: "first" }, "replacement");
    first();
    expect(index.list().map(d => d.type)).toEqual(["second", "first"]);
    expect(index.owner("first")).toBe("replacement");
    index.dispose(); index.dispose(); replacement(); first();
    expect(index.list()).toEqual([]);
    expect(Object.isFrozen(index.list())).toBe(true);
    expect(index.get("second")).toBeUndefined(); expect(index.owner("second")).toBeUndefined();
    expect(() => index.register({ type: "new" }, "owner")).toThrow(`${category} definition index is disposed`);
  });
});

it("imports pure declarations and discovers each category without a browser or editor", () => {
  expect(typeof window).toBe("undefined"); expect(typeof document).toBe("undefined");
  const blocks = new BlockPropertyDefinitionIndex(), standoff = new StandoffPropertyDefinitionIndex();
  expect(blocks.list()).toEqual([]); expect(standoff.list()).toEqual([]);
  blocks.register(alignmentDefinition, "pilot"); standoff.register(editorialDeletionDefinition, "pilot");
  expect(pilotBlockDeclarations.map(d => d.type)).toEqual(["verse-group-block"]);
  expect(pilotBlockDeclarations[0].capabilities).toEqual(["container", "selectable"]);
  expect(blocks.get("block/alignment")?.interpretedBy).toBe("blockAppearance");
  expect(standoff.get("editorial-deletion")).toEqual({ type: "editorial-deletion" });
  // Partial indexes deliberately omit historical supported names.
  expect(standoff.get("style/bold")).toBeUndefined();
  expect(blocks.get("block/indent")).toBeUndefined();
  blocks.register({ type: "same-name" }, "block-owner");
  standoff.register({ type: "same-name" }, "range-owner");
  blocks.dispose();
  expect(standoff.owner("same-name")).toBe("range-owner");
});

it("treats interpreter references as metadata and validates only their field shape", () => {
  const index = new BlockPropertyDefinitionIndex();
  expect(() => index.register({ type: "new", interpretedBy: {} } as never, "owner")).toThrow("Invalid Block Property");
  index.register({ type: "nonvisual", interpretedBy: "explicit-command-consumer" }, "owner");
  expect(index.get("nonvisual")?.interpretedBy).toBe("explicit-command-consumer");
});
