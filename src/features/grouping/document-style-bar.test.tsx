import { createGroupingFeature } from "./index";
import { textOperationCapabilities } from "../../application/text-operation-capabilities";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { registerCoreViews } from "../../rendering/register-core-views";
import { ReactiveTreeView } from "../../rendering/reactive-tree-view";
import { annotationTools } from "../../rendering/document-style-bar";
import { toolbarControl } from "../../rendering/toolbar-test-helpers";
import { standoffStyleSchemas } from "../../rendering/standoff-styles";

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); document.body.replaceChildren(); localStorage.clear(); });
function fixture(compactEditorChrome: boolean) {
  const editor = new ReactiveEditor({ type: "document-window-block", children: [{ type: "document-block", children: [
    { id: "p", type: "standoff-editor-block", text: "one 😀 two", standoffProperties: [{ id: "entity", type: "codex/entity-reference", start: 0, end: 2, value: "entity-id" }], blockProperties: [{ type: "block/alignment", value: "right" }] },
    { id: "q", type: "standoff-editor-block", text: "Other paragraph" },
  ] }] }, { features: { compactEditorChrome } });
  const feature = createGroupingFeature(scope => textOperationCapabilities(editor, scope));
  editor.featureHost.activate(feature);
  const groupSelection = feature.selection!;
  registerCoreViews(editor); const projection = editor.createView("format-test");
  const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = () => Object.values(projection.state.nodes).find(n => n.payload.id === "p")!;
  const flowFor = (id = "p") => host.querySelector<HTMLElement>(`.reactive-standoff-block[data-block-id="${id}"] .reactive-standoff-flow`)!;
  const flow = flowFor();
  const select = (start = 0, end = 5, id = "p") => {
    const flow = flowFor(id);
    flow.focus(); const range = document.createRange(); range.setStart(flow, start); range.setEnd(flow, end);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return flow;
  };
  const click = (title: string) => {
    const button = toolbarControl(host, `button[title="${title}"]`);
    button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true })); button.click();
  };
  const pointer = (target: HTMLElement, type: string, ctrlKey: boolean, clientX = 0) => {
    const event = new MouseEvent(type, { button: 0, buttons: type === "pointerup" ? 0 : 1, ctrlKey, clientX, bubbles: true, cancelable: true });
    target.dispatchEvent(event); return event;
  };
  const group = async (start: number, end: number, id = "p") => {
    const target = select(start, start, id);
    pointer(target, "pointerdown", true);
    pointer(target, "pointermove", true, 10);
    select(start, end, id);
    pointer(target, "pointerup", true, 10);
    await Promise.resolve();
  };
  return { editor, groupSelection, host, node, flow, select, click, pointer, group };
}
describe.each([true, false])("DocumentWindow annotation toolbar (compact=%s)", compact => {
  const setup = () => fixture(compact);
  it("exposes every canonical style and both colours, creating inclusive Cell ranges with IDs", () => {
    const { groupSelection, host, node, select, click, editor } = setup();
    expect(annotationTools.map(t => t[0]).sort()).toEqual(Object.keys(standoffStyleSchemas).filter(type => type.startsWith("style/") || type === "amber-crt").sort());
    for (const [type, name] of annotationTools) {
      select(); click(name);
      const p = (node().payload.standoffProperties as any[]).find(p => p.type === type);
      expect(p).toMatchObject({ type, start: 0, end: 4 }); expect(p.id).toBeTruthy();
    }
    expect((node().payload.standoffProperties as any[]).find(p => p.type === "style/blur")).toMatchObject({ amount: 3 });
    if (compact) expect(toolbarControl(host, 'button[title="Blur"]', "Typography").dataset.toolId).toBe("style/blur");
    select(); click("Apply text colour"); select(); click("Apply background colour");
    expect(node().payload.standoffProperties).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text/colour", value: "#ff0000", start: 0, end: 4 }),
      expect.objectContaining({ type: "text/background-colour", value: "#ffff00", start: 0, end: 4 }),
      expect.objectContaining({ id: "entity", value: "entity-id" }),
    ]));
    if (!compact) expect(host.querySelectorAll("[data-annotation-type]")).toHaveLength(annotationTools.length + 2);
    else expect(host.querySelector(".document-status-bar .document-count-bar")).not.toBeNull();
    const saved = editor.encodeDocument(), reloaded = new ReactiveEditor(saved);
    expect(reloaded.encodeDocument()).toEqual(saved); reloaded.dispose();
  });
  it("preserves the range through colour-picker focus and leaves collapsed selections unchanged", () => {
    const { groupSelection, host, node, select, click, editor } = setup();
    select(4, 5);
    const colour = toolbarControl<HTMLInputElement>(host, 'input[aria-label="Text colour"]', 'Visual effects');
    colour.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); colour.focus();
    colour.value = "#123456"; colour.dispatchEvent(new InputEvent("input", { bubbles: true })); click("Apply text colour");
    expect(node().payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text/colour", start: 4, end: 4, value: "#123456" })]));
    select(2, 2); const revision = editor.repository.state.revision; click("Bold selection");
    expect(editor.repository.state.revision).toBe(revision); expect(host.textContent).toContain("Select a non-empty text range");
  });
  it("increments paragraph placement repeatedly, clamps outdent at zero, preserves tree and undoes", () => {
    const { groupSelection, host, node, select, click, editor } = setup(); select();
    const children = editor.encodeDocument().children;
    click("Increase indent"); click("Increase indent"); click("Increase indent");
    expect(node().payload.blockProperties).toEqual(expect.arrayContaining([{ type: "block/indent", value: "3" }, { type: "block/alignment", value: "right" }]));
    expect(host.querySelector<HTMLElement>(".reactive-standoff-block")!.style.marginLeft).toBe("60px");
    click("Decrease indent"); expect(host.querySelector<HTMLElement>(".reactive-standoff-block")!.style.marginLeft).toBe("40px");
    editor.repository.undo(); expect(host.querySelector<HTMLElement>(".reactive-standoff-block")!.style.marginLeft).toBe("60px");
    for (let i = 0; i < 5; i++) click("Decrease indent");
    expect(host.querySelector<HTMLElement>(".reactive-standoff-block")!.style.marginLeft).toBe("0px");
    expect(editor.encodeDocument().children?.map(p => p.children?.map(c => c.id))).toEqual(children?.map(p => p.children?.map(c => c.id)));
    expect(JSON.stringify(editor.encodeDocument())).not.toContain("indented-list-block");
  });
  it("does not toggle away annotations on repeat application and clear preserves semantic references", () => {
    const { groupSelection, node, select, click, editor } = setup(); select(); click("Bold selection");
    const revision = editor.repository.state.revision; click("Bold selection"); expect(editor.repository.state.revision).toBe(revision);
    click("Clear formatting"); expect(node().payload.standoffProperties).toEqual([{ id: "entity", type: "codex/entity-reference", start: 0, end: 2, value: "entity-id" }]);
    editor.repository.undo(); expect((node().payload.standoffProperties as any[]).some(p => p.type === "style/bold")).toBe(true);
  });
  it("collects only Control-held gestures, excludes early release, and keeps static highlights", async () => {
    const { groupSelection, editor, host, group, select, pointer, click } = setup();
    const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [{ left: 10, top: 10, width: 40, height: 16 }] });
    cleanup.push(() => descriptor ? Object.defineProperty(Range.prototype, "getClientRects", descriptor) : Reflect.deleteProperty(Range.prototype, "getClientRects"));
    const flow = select(0, 0);
    pointer(flow, "pointerdown", false); select(0, 2); pointer(flow, "pointerup", true);
    await Promise.resolve();
    expect(groupSelection.active()).toBe(false);
    pointer(flow, "pointerdown", true); select(0, 2);
    flow.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", bubbles: true }));
    pointer(flow, "pointerup", true); await Promise.resolve();
    expect(groupSelection.active()).toBe(false);
    await group(0, 2); await group(0, 3, "q");
    pointer(flow, "pointerdown", false); select(6, 9); pointer(flow, "pointerup", false);
    await Promise.resolve();
    expect(groupSelection.ranges()).toHaveLength(2);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(host.querySelectorAll('[data-property-type="editor/group-selection"]')).toHaveLength(2);
    expect(host.querySelector('[data-property-type="editor/group-selection"][stroke-dasharray]')).toBeNull();
    click("Show / hide"); click("Show / hide");
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(host.querySelectorAll('[data-property-type="editor/show-hide-selection"]')).toHaveLength(2);
    expect(host.querySelector('[data-property-type="editor/show-hide-selection"][stroke-dasharray]')).toBeNull();
    expect(document.querySelector('[aria-label="Group text ranges"], [aria-label="Clear group selection"]')).toBeNull();
  });

  it.each(["Shift", "Control"])("collects one keyboard range when %s is released, including across Blocks", release => {
    const { groupSelection, editor, select } = setup();
    editor.crossText.enable(true);
    const flow = select(7, 7);
    for (let i = 0; i < 5; i++) {
      (document.activeElement ?? flow).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, shiftKey: true, repeat: i > 0, bubbles: true, cancelable: true }));
      expect(groupSelection.active()).toBe(false);
    }
    expect(editor.crossText.range()).toBeDefined();
    document.activeElement!.dispatchEvent(new KeyboardEvent("keyup", { key: release, ctrlKey: release === "Shift", shiftKey: release === "Control", bubbles: true }));
    expect(groupSelection.ranges()).toHaveLength(2);
    expect(groupSelection.ranges().map(range => [range.start, range.end])).toEqual([[7, 9], [0, 2]]);
    expect(editor.crossText.range()).toBeUndefined();
    document.activeElement!.dispatchEvent(new KeyboardEvent("keyup", { key: release === "Shift" ? "Control" : "Shift", bubbles: true }));
    expect(groupSelection.ranges()).toHaveLength(2);
    expect(editor.encodeDocument().children?.[0].children?.[0].relation).toBeUndefined();
  });

  it("collects successive local keyboard gestures without enabling cross-Block selection", () => {
    const { groupSelection, editor, select } = setup();
    const flow = select(0, 0);
    expect(editor.crossText.enabled()).toBe(false);
    for (let gesture = 0; gesture < 2; gesture++) {
      for (let step = 0; step < 2; step++) flow.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowRight", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
      }));
      flow.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", ctrlKey: true, bubbles: true }));
    }
    expect(groupSelection.ranges().map(range => [range.start, range.end])).toEqual([[0, 2], [2, 4]]);
    expect(editor.crossText.enabled()).toBe(false);
  });

  it("does not capture a keyboard selection started without Control or abandoned on blur", () => {
    const { groupSelection, editor, select } = setup();
    const flow = select(0, 0);
    const extend = (ctrlKey: boolean) => flow.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, ctrlKey, bubbles: true }));
    extend(false); select(0, 1); extend(true); select(0, 2);
    flow.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", shiftKey: true, bubbles: true }));
    expect(groupSelection.active()).toBe(false);
    select(0, 0); extend(true); select(0, 2); window.dispatchEvent(new Event("blur"));
    flow.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", ctrlKey: true, bubbles: true }));
    expect(groupSelection.active()).toBe(false);
  });

  it("Control-click removes only its range, while dragging from a highlight adds a range", async () => {
    const { groupSelection, host, node, editor, group, pointer, select, click } = setup();
    await group(0, 2); await group(0, 3, "q");
    const cell = host.querySelector<HTMLElement>('[data-block-id="p"] [data-inline-key]:nth-child(2)')!;
    pointer(cell, "pointerdown", true);
    expect(groupSelection.ranges()).toHaveLength(2);
    pointer(cell, "pointerup", true); await Promise.resolve();
    const menu = new MouseEvent("contextmenu", { ctrlKey: true, button: 2, bubbles: true, cancelable: true }); cell.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(editor.overlays.overlays).toHaveLength(0);
    expect(groupSelection.ranges()).toHaveLength(1);
    await group(0, 2);
    pointer(cell, "pointerdown", true); pointer(cell, "pointermove", true, 12); select(1, 5); pointer(cell, "pointerup", true, 12);
    await Promise.resolve();
    expect(groupSelection.ranges()).toHaveLength(3);
    click("Show / hide"); click("Show / hide");
    pointer(cell, "pointerdown", true); pointer(cell, "pointerup", true); await Promise.resolve();
    const properties = node().payload.standoffProperties as { id: string; type: string; start: number }[];
    const removed = properties.find(p => p.type === "style/show-hide" && p.start === 1)!;
    expect(editor.showHide.selectionActive(node().key, removed.id)).toBe(false);
  });

  it("Escape restores hidden text and a subsequent group cannot affect cancelled ranges", async () => {
    const { groupSelection, editor, host, group, click, select } = setup();
    await group(0, 2); click("Show / hide");
    const escape = () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    escape();
    expect(editor.showHide.selectionActive()).toBe(false);
    expect(host.querySelectorAll('.reactive-standoff-cell--concealed')).toHaveLength(0);
    await group(0, 3, "q"); click("Show / hide");
    expect(host.querySelectorAll('[data-block-id="p"] .reactive-standoff-cell--concealed')).toHaveLength(0);
    expect(host.querySelectorAll('[data-block-id="q"] .reactive-standoff-cell--concealed')).toHaveLength(3);
    select(0, 0, "q"); escape();
    expect(groupSelection.ranges()).toHaveLength(0);
    expect(host.querySelectorAll('.reactive-standoff-cell--concealed')).toHaveLength(0);
  });

  it.each(["Delete", "Backspace"])("%s deletes only the group once and Undo restores its text", async key => {
    const { groupSelection, editor, group, select } = setup();
    const before = editor.encodeDocument();
    await group(0, 2); await group(0, 3, "q");
    const flow = select(0, 0);
    const press = (repeat = false) => {
      const event = new KeyboardEvent("keydown", { key, repeat, bubbles: true, cancelable: true }); flow.dispatchEvent(event); return event;
    };
    expect(press().defaultPrevented).toBe(true);
    const after = editor.encodeDocument();
    expect(after.children![0].children!.map(block => block.text)).toEqual(["e 😀 two", "er paragraph"]);
    expect(groupSelection.active()).toBe(false);
    expect(press(true).defaultPrevented).toBe(true);
    expect(editor.encodeDocument()).toEqual(after);
    flow.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    expect(press().defaultPrevented).toBe(false);
    editor.repository.undo(); expect(editor.encodeDocument().children![0].children).toEqual(before.children![0].children);
  });

  it("routes Escape and toolbar deletion only to their owning editor", async () => {
    const first = setup(), second = setup();
    await first.group(0, 2); await second.group(0, 3);
    second.flow.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(second.groupSelection.active()).toBe(false);
    expect(first.groupSelection.ranges()).toHaveLength(1);
    await second.group(0, 3);
    const toolbar = second.host.querySelector<HTMLElement>(".document-style-bar")!;
    toolbar.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    expect(second.groupSelection.active()).toBe(false);
    expect(first.groupSelection.ranges()).toHaveLength(1);
    expect(first.node().inlineContent).toHaveLength(9);
    expect(second.node().inlineContent).toHaveLength(6);
  });

  it("Find/entity highlights and dialog fields never invoke grouped deletion", async () => {
    const { groupSelection, editor, node, group, select, host } = setup();
    const n = node(), content = editor.repository.readState().contents[n.contentKey];
    const ranges = [0, 6].map(start => ({ nodeKey: n.key, contentKey: n.contentKey, placementKey: n.placementKey, version: content.inlineRevision, coordinate: "cell" as const, start, end: start + 2 }));
    editor.decorations.attachRanges("find-results", ranges, { type: "editor/search", fill: "yellow" });
    editor.decorations.attachRanges("entity-candidates", ranges, { type: "editor/entity-candidate", fill: "yellow" });
    const before = editor.encodeDocument();
    const flow = select(0, 0);
    for (const key of ["Delete", "Backspace"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }); flow.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(editor.encodeDocument().children![0].children).toEqual(before.children![0].children);
    }
    await group(0, 2);
    const dialog = host.appendChild(document.createElement("div")); dialog.setAttribute("role", "dialog");
    const input = dialog.appendChild(document.createElement("input")); input.value = "Find / Create Entity Relation"; input.focus();
    for (const key of ["Delete", "Backspace"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }); input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(groupSelection.ranges()).toHaveLength(1);
      expect(editor.encodeDocument().children![0].children).toEqual(before.children![0].children);
    }
  });
});
