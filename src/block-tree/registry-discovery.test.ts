// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BlockRegistry } from "./registry";

describe("Block registration discovery", () => {
  it("lists primary entries without executing bindings or changing lookup/notifications", () => {
    const registry = new BlockRegistry();
    expect(registry.list()).toEqual([]);
    const view = vi.fn(() => null), create = vi.fn(() => ({ type: "first" }));
    const changed = vi.fn(); registry.subscribe(changed);
    const registration = { type: "first", aliases: ["old-b", "old-a"], capabilities: ["selectable", "container"], view, create };
    registry.register(registration, "feature-one");
    registry.register({ type: "second", capabilities: [], view });
    changed.mockClear();

    expect(registry.list()).toEqual([
      { type: "first", aliases: ["old-b", "old-a"], capabilities: ["selectable", "container"], owner: "feature-one" },
      { type: "second", aliases: [], capabilities: [], owner: "legacy" },
    ]);
    expect(registry.resolve("old-a")).toBe(registration);
    expect(registry.owner("old-b")).toBe("feature-one");
    expect(registry.hasCapability("old-a", "container")).toBe(true);
    expect(registry.typesWithCapability("container")).toEqual(["first", "old-b", "old-a"]);
    expect(changed).not.toHaveBeenCalled();
    expect(view).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });

  it("isolates frozen snapshots while preserving existing mutable registration inputs", () => {
    const registry = new BlockRegistry();
    const registration = { type: "one", capabilities: ["container"], aliases: ["alias"], view: () => null };
    const release = registry.register(registration, "first-owner");
    const snapshot = registry.list();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
    expect(Object.isFrozen(snapshot[0].capabilities)).toBe(true);
    expect(Object.isFrozen(snapshot[0].aliases)).toBe(true);
    expect(Reflect.set(snapshot[0], "type", "changed")).toBe(false);
    expect(() => (snapshot[0].capabilities as string[]).push("opaque-widget")).toThrow();
    expect(registry.hasCapability("one", "opaque-widget")).toBe(false);
    expect(Object.isFrozen(registration)).toBe(false);
    registration.capabilities.push("selectable");
    expect(snapshot[0].capabilities).toEqual(["container"]);
    registry.register({ type: "two", view: () => null, capabilities: [] }, "second-owner");
    release(); release();
    registry.register(registration, "new-owner"); release();
    expect(registry.list().map(info => info.type)).toEqual(["two", "one"]);
    expect(registry.list()[1].owner).toBe("new-owner");
    expect(snapshot).toEqual([{ type: "one", capabilities: ["container"], aliases: ["alias"], owner: "first-owner" }]);
    expect(registry.owner("alias")).toBe("new-owner");
  });
});
