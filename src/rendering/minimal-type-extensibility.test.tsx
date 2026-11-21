// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerApplicationViews } from "../application/features";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { GenericContainerView } from "./core-block-views";
import { blockAppearance } from "./appearance";
import { InsertionPlanner } from "../block-tree/insertion-planner";
import { captureNative, decodeNative, nativeText } from "../persistence/native-resource";
import { resourceToRepository } from "../history/durable-core";
import { alignmentDefinition, editorialDeletionDefinition, verseGroupDefinition } from "../block-tree/test-support/minimal-type-declarations";
import type { ExistingBlockDto } from "../block-tree/types";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).reverse().forEach(dispose => dispose());
  vi.restoreAllMocks(); document.body.replaceChildren();
});
const documentDto = (): ExistingBlockDto => ({ id: "doc", type: "document-block", children: [
  { id: "group", type: verseGroupDefinition.type, metadata: { intrinsic: { n: "01" } }, children: [
    { id: "p", type: "standoff-editor-block", text: "A😀BCD", standoffProperties: [{ id: "bold", type: "style/bold", start: 0, end: 4 }] },
    { id: "q", type: "standoff-editor-block", text: "Second" },
  ] },
  { id: "outside", type: "standoff-editor-block", text: "Outside" },
] });

function ownEditor(editor: ReactiveEditor) {
  let alive = true;
  const dispose = () => { if (alive) { alive = false; editor.dispose(); } };
  cleanups.push(dispose); return dispose;
}

function registerPilot(editor: ReactiveEditor) {
  const create = vi.fn(() => ({ type: verseGroupDefinition.type, children: [] }));
  let releaseAlignment!: () => void;
  const release = editor.featureHost.activate({ id: "test-only-type-pilot", activate(scope) {
    scope.own(editor.registry.register({ ...verseGroupDefinition, capabilities: [...verseGroupDefinition.capabilities],
      aliases: verseGroupDefinition.aliases ? [...verseGroupDefinition.aliases] : undefined,
      view: GenericContainerView, create }, scope.owner));
    releaseAlignment = scope.own(editor.blockPropertyTypes.register(alignmentDefinition, scope.owner));
    scope.own(editor.standoffPropertyTypes.register(editorialDeletionDefinition, scope.owner));
  } });
  return { create, release, releaseAlignment };
}

function setup(rendering = true, dto: ConstructorParameters<typeof ReactiveEditor>[0] = documentDto(), pilot = true) {
  const editor = new ReactiveEditor(dto, { features: { standoffPropertyRendering: rendering } });
  ownEditor(editor); registerCoreViews(editor);
  const registration = pilot ? registerPilot(editor) : undefined;
  const projection = editor.createView("minimal-types"), host = document.body.appendChild(document.createElement("div"));
  const unmount = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
  editor.installGateway(document);
  cleanups.push(() => { unmount(); host.remove(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const flow = (id: string) => editor.mounts.get(node(id).key)!.focusElement;
  const select = (id: string, start: number, end = start) => {
    const n = node(id), mount = editor.mounts.get(n.key)!;
    mount.focus(); mount.restoreInlineSelection!({ anchor: start, head: end });
    editor.selections.setPrimary(n.key, n.contentKey, n.viewId, start, end);
    return mount.focusElement;
  };
  const text = (id: string) => node(id).inlineContent.map(key => projection.state.nodes[key].payload.text).join("");
  const save = () => nativeText(captureNative(editor.repository.readState(), "doc"));
  return { editor, projection, host, node, flow, select, text, save, registration };
}

describe("test-only minimal native type extension", () => {
  it("uses the existing container and mounted text input, preserving caret and native identity on reload without the feature", async () => {
    const f = setup(), registration = f.registration!;
    expect(f.editor.registry.resolve(verseGroupDefinition.type)?.view).toBe(GenericContainerView);
    expect(f.host.querySelector('[data-block-id="group"]')?.getAttribute("data-block-type")).toBe(verseGroupDefinition.type);
    expect(f.editor.registry.list().find(d => d.type === verseGroupDefinition.type)?.owner).toBe("test-only-type-pilot");
    expect(registration.create).not.toHaveBeenCalled();
    const surviving = f.node("p").inlineContent[1];
    const flow = f.select("p", 1);
    const input = (data: string) => {
      const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data });
      flow.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    };
    input("x"); await Promise.resolve(); input("y"); await Promise.resolve();
    expect(f.text("p")).toBe("Axy😀BCD");
    expect(f.node("p").inlineContent[3]).toBe(surviving);
    expect(f.editor.mounts.get(f.node("p").key)!.captureInlineSelection?.()).toMatchObject({ anchor: 3, head: 3 });
    const saved = f.save();
    const reopened = setup(true, { state: resourceToRepository(decodeNative(new TextEncoder().encode(saved))), references: [], issues: [], legacy: false }, false);
    expect(reopened.save()).toBe(saved);
    expect(reopened.node("group").viewType).toBe(verseGroupDefinition.type);
    expect(reopened.node("group").payload.metadata).toEqual({ intrinsic: { n: "01" } });
    expect(reopened.host.querySelector(".reactive-unknown-block__label")?.textContent).toBe(verseGroupDefinition.type);
    expect(reopened.text("p")).toBe("Axy😀BCD");
    reopened.select("p", 0).dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "!" }));
    expect(reopened.text("p")).toBe("!Axy😀BCD");
    reopened.editor.repository.undo(); expect(reopened.save()).toBe(saved);
  });

  it("uses ordinary insertion, move, removal and Undo/Redo without changing the semantic container's identity", () => {
    const f = setup(), { editor, projection, node } = f;
    const identity = { key: node("group").contentKey, placement: node("group").placementKey, child: node("p").contentKey };
    const plan = new InsertionPlanner(editor.registry, projection).plan({ targetKey: node("group").key,
      source: { type: "standoff-editor-block", capabilities: ["inline-editor"] } });
    expect(plan.accepted).toBe(true); expect(plan.slot).toBe("children");
    const baseline = f.save();
    editor.commands.insert({ id: "new-child", type: "standoff-editor-block", text: "Third" }, plan.destination!);
    const children = () => node("group").children.map(key => projection.state.nodes[key].payload.id);
    expect(children()).toEqual(["p", "q", "new-child"]);
    editor.commands.move(node("new-child").key, { kind: "before", anchorKey: node("p").key });
    expect(children()).toEqual(["new-child", "p", "q"]);
    editor.commands.move(node("group").key, { kind: "after", anchorKey: node("outside").key });
    expect(projection.state.nodes[projection.state.rootKey].children.map(key => projection.state.nodes[key].payload.id)).toEqual(["outside", "group"]);
    expect({ key: node("group").contentKey, placement: node("group").placementKey, child: node("p").contentKey }).toEqual(identity);
    const beforeRemoval = f.save();
    editor.commands.remove(node("group").key); expect(node("group")).toBeUndefined();
    editor.repository.undo(); expect(f.save()).toBe(beforeRemoval);
    editor.repository.redo(); expect(node("group")).toBeUndefined();
    editor.repository.undo(); editor.repository.undo(); editor.repository.undo(); editor.repository.undo();
    expect(f.save()).toBe(baseline);
    // Explicit construction is separate from read-only discovery.
    const dto = f.registration!.create();
    const placement = editor.commands.insert(dto, { kind: "at", parentKey: projection.state.rootKey, index: 0 });
    const created = editor.repository.state.contents[editor.repository.state.placements[placement].contentKey];
    expect(created.payload.type).toBe(verseGroupDefinition.type); expect(created.payload.id).toBeTruthy();
  });

  it("preserves repeated alignment properties and the historical interpreter independently of membership", () => {
    const f = setup(), before = f.save();
    const properties = [
      { id: "left", type: alignmentDefinition.type, value: "left" },
      { id: "unknown", type: "historical/retained", metadata: { n: 7 } },
      { id: "right", type: alignmentDefinition.type, value: "right" },
    ];
    f.editor.commands.setPayloadField(f.node("p").key, "blockProperties", properties);
    const saved = f.save();
    expect(blockAppearance(f.node("p")).style["text-align"]).toBe("right");
    const decoded = decodeNative(new TextEncoder().encode(saved));
    expect(Object.values(decoded.contents).find(c => c.payload.id === "p")!.payload.blockProperties).toEqual(properties);
    f.registration!.releaseAlignment();
    expect(f.editor.blockPropertyTypes.get(alignmentDefinition.type)).toBeUndefined();
    expect(f.node("p").payload.blockProperties).toEqual(properties);
    expect(blockAppearance(f.node("p")).style["text-align"]).toBe("right"); expect(f.save()).toBe(saved);
    f.editor.repository.undo(); expect(f.save()).toBe(before);
    f.editor.repository.redo(); expect(f.save()).toBe(saved);
  });

  it.each([false, true])("inspects nonvisual annotations without changing overlapping styles or VE precedence (rendering=%s)", async rendering => {
    const f = setup(rendering), { editor } = f;
    const beforeText = f.text("p"), boldStyle = f.flow("p").children[1].getAttribute("style");
    const registerEffect = vi.spyOn(editor.visualEffects, "registerType"), invoke = vi.spyOn(editor.visualEffects, "invoke");
    const range = editor.textRanges.snapshot(f.node("p").key, 1, 2);
    const result = editor.rangeAnnotations.apply([range], editorialDeletionDefinition.type);
    expect(result.added).toBe(1);
    const properties = () => f.node("p").payload.standoffProperties as Record<string, unknown>[];
    expect(properties()[1]).toMatchObject({ type: editorialDeletionDefinition.type, start: 1, end: 1 });
    expect(editor.standoffPropertyTypes.get(editorialDeletionDefinition.type)).toEqual(editorialDeletionDefinition);
    expect(editor.visualEffects.type(editorialDeletionDefinition.type)).toBeUndefined();
    expect(f.text("p")).toBe(beforeText);
    expect(f.flow("p").children[1].getAttribute("style")).toBe(boldStyle);
    expect(f.host.querySelector(`[data-property-type="${editorialDeletionDefinition.type}"]`)).toBeNull();
    expect(registerEffect).not.toHaveBeenCalled();
    const saved = f.save();
    expect(nativeText(decodeNative(new TextEncoder().encode(saved)))).toBe(saved);
    f.select("p", 2).dispatchEvent(new KeyboardEvent("keydown", { key: ".", ctrlKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve();
    const panel = document.querySelector<HTMLElement>(".reactive-annotation-monitor")!;
    expect(panel).not.toBeNull(); expect(panel.textContent).toContain(editorialDeletionDefinition.type);
    panel.querySelector<HTMLButtonElement>('[aria-label="Close annotation monitor"]')!.click();
    editor.commands.replaceInlineRange(f.node("p").key, 0, 0, "!");
    expect(properties()[1]).toMatchObject({ start: 2, end: 2 });
    editor.repository.undo(); expect(f.save()).toBe(saved);
    editor.repository.redo(); expect(properties()[1]).toMatchObject({ start: 2, end: 2 });
    // The marker never contributes a visual source or a caret handler.
    expect(invoke.mock.calls.some(([, context]) => context.source.data.type === editorialDeletionDefinition.type)).toBe(false);
  });

  it("keeps definition discovery and validators outside the typing/annotation hot path", async () => {
    const f = setup(), { editor, projection } = f;
    const validate = vi.fn();
    editor.standoffPropertyTypes.register({ type: "test/nonvisual", validate }, "test");
    const reads = [vi.spyOn(editor.registry, "list"), vi.spyOn(editor.blockPropertyTypes, "get"), vi.spyOn(editor.blockPropertyTypes, "list"),
      vi.spyOn(editor.standoffPropertyTypes, "get"), vi.spyOn(editor.standoffPropertyTypes, "list")];
    const snapshots = vi.spyOn(editor.repository, "snapshot"), rebuild = vi.spyOn(projection as any, "build");
    const references = vi.spyOn(editor.repository as any, "rebuildReferences");
    const fetch = vi.spyOn(globalThis, "fetch"), encode = vi.spyOn(editor, "encodeDocument");
    const unaffected = editor.repository.readState().contents[f.node("q").contentKey];
    const flow = f.select("p", 1);
    flow.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "x", bubbles: true, cancelable: true }));
    await Promise.resolve(); expect(f.text("p")).toBe("Ax😀BCD");
    editor.rangeAnnotations.apply([editor.textRanges.snapshot(f.node("p").key, 2, 3)], "test/nonvisual");
    editor.repository.undo(); editor.repository.redo();
    for (const spy of [...reads, snapshots, rebuild, references, fetch, encode, validate]) expect(spy).not.toHaveBeenCalled();
    expect(editor.repository.readState().contents[f.node("q").contentKey]).toBe(unaffected);
  });

  it("keeps registration/read/release/disposal out of document changes and persistence", () => {
    const editor = new ReactiveEditor(documentDto()); ownEditor(editor);
    const changed = vi.fn(), releaseChanges = editor.repository.subscribeChanges(changed); cleanups.push(releaseChanges);
    const revision = editor.repository.state.revision, undo = editor.repository.canUndo(), redo = editor.repository.canRedo();
    const status = { ...editor.persistence.state };
    const snapshots = vi.spyOn(editor.repository, "snapshot"), capture = vi.spyOn(editor.persistence, "captureWorkspace");
    const save = vi.spyOn(editor.persistence, "saveDocument"), fetch = vi.spyOn(globalThis, "fetch");
    const pilot = registerPilot(editor);
    editor.registry.list(); editor.blockPropertyTypes.get(alignmentDefinition.type); editor.blockPropertyTypes.list();
    editor.standoffPropertyTypes.get(editorialDeletionDefinition.type); editor.standoffPropertyTypes.list();
    pilot.release(); pilot.release();
    editor.blockPropertyTypes.dispose(); editor.standoffPropertyTypes.dispose();
    expect(changed).not.toHaveBeenCalled();
    expect(editor.repository.state.revision).toBe(revision);
    expect(editor.repository.canUndo()).toBe(undo); expect(editor.repository.canRedo()).toBe(redo);
    expect({ ...editor.persistence.state }).toEqual(status);
    for (const spy of [snapshots, capture, save, fetch, pilot.create]) expect(spy).not.toHaveBeenCalled();
  });

  it("rolls back failed activation, isolates editors and disposes features before closing indexes", () => {
    const one = new ReactiveEditor(documentDto()), two = new ReactiveEditor(documentDto());
    const disposeOne = ownEditor(one); ownEditor(two);
    expect(() => one.featureHost.activate({ id: "fails", activate(scope) {
      scope.own(one.registry.register({ type: verseGroupDefinition.type, capabilities: [], view: GenericContainerView }, scope.owner));
      scope.own(one.blockPropertyTypes.register(alignmentDefinition, scope.owner));
      scope.own(one.standoffPropertyTypes.register(editorialDeletionDefinition, scope.owner));
      throw Error("injected activation failure");
    } })).toThrow("Feature fails activation failed");
    expect(one.registry.resolve(verseGroupDefinition.type)).toBeUndefined();
    expect(one.blockPropertyTypes.list()).toEqual([]); expect(one.standoffPropertyTypes.list()).toEqual([]);
    const pilot = registerPilot(one), sequence: string[] = [];
    one.featureHost.activate({ id: "lifetime-probe", activate(scope) {
      scope.own(() => {
        const release = one.blockPropertyTypes.register({ type: "teardown-probe" }, scope.owner);
        release(); sequence.push("features released");
      });
    } });
    const close = one.blockPropertyTypes.dispose.bind(one.blockPropertyTypes);
    vi.spyOn(one.blockPropertyTypes, "dispose").mockImplementation(() => { sequence.push("index closed"); close(); });
    expect(two.blockPropertyTypes.list()).toEqual([]); expect(two.standoffPropertyTypes.list()).toEqual([]);
    disposeOne(); pilot.release();
    expect(sequence).toEqual(["features released", "index closed"]);
    expect(one.blockPropertyTypes.list()).toEqual([]); expect(one.standoffPropertyTypes.list()).toEqual([]);
    expect(() => one.blockPropertyTypes.register(alignmentDefinition, "late")).toThrow("disposed");
    expect(() => one.standoffPropertyTypes.register(editorialDeletionDefinition, "late")).toThrow("disposed");
    const release = two.standoffPropertyTypes.register(editorialDeletionDefinition, "still-live"); release();
  });

  it("leaves normal application assembly empty and historical types working without definitions", () => {
    const editor = new ReactiveEditor(documentDto()); ownEditor(editor);
    registerApplicationViews(editor);
    expect(editor.blockPropertyTypes.list()).toEqual([]); expect(editor.standoffPropertyTypes.list()).toEqual([]);
    expect(editor.registry.resolve(verseGroupDefinition.type)).toBeUndefined();
    expect(editor.visualEffects.type(editorialDeletionDefinition.type)).toBeUndefined();
    expect(editor.featureHost.list()).not.toContain("test-only-type-pilot");
    const view = editor.createView();
    const p = Object.values(view.state.nodes).find(n => n.payload.id === "p")!;
    editor.commands.setPayloadField(p.key, "blockProperties", [{ type: alignmentDefinition.type, value: "center" }]);
    expect(blockAppearance(p).style["text-align"]).toBe("center");
    expect(editor.standoffPropertyTypes.get("style/bold")).toBeUndefined();
    expect(p.payload.standoffProperties).toEqual([{ id: "bold", type: "style/bold", start: 0, end: 4 }]);
  });
});
