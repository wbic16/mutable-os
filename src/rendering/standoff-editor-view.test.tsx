// @vitest-environment jsdom
import { characterIndex } from './character-address';
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
});

function renderEditor(
  text: string,
  standoffProperties: Array<Record<string, unknown>> = [],
) {
  return renderBlocks([
    {
      id: "standoff",
      type: "standoff-editor-block",
      text,
      metadata: {},
      blockProperties: [],
      standoffProperties,
      children: [],
    },
  ]);
}

function renderBlocks(children: Array<Record<string, unknown>>) {
  const editor = new ReactiveEditor({
    type: "document-block",
    children,
  });
  registerCoreViews(editor);
  const projection = editor.createView("standoff-test-view");
  const host = document.body.appendChild(document.createElement("div"));
  const disposeRender = render(
    () => <ReactiveTreeView editor={editor} projection={projection} />,
    host,
  );
  const disposeGateway = editor.installGateway(document);
  disposers.push(disposeGateway, disposeRender, () => editor.dispose());
  return { editor, projection, host };
}

function setCaret(flow: HTMLElement, cellIndex: number, offset: number) {
  const cell = flow.querySelectorAll<HTMLElement>("[data-inline-key]")[cellIndex];
  const range = document.createRange();
  range.setStart(cell.firstChild!, offset);
  range.collapse(true);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function setRange(
  flow: HTMLElement,
  startCellIndex: number,
  startOffset: number,
  endCellIndex: number,
  endOffset: number,
) {
  const cells = flow.querySelectorAll<HTMLElement>("[data-inline-key]");
  const range = document.createRange();
  range.setStart(cells[startCellIndex].firstChild!, startOffset);
  range.setEnd(cells[endCellIndex].firstChild!, endOffset);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe("StandoffEditorView", () => {
  it.each(["left", "right"])("creates and reuses the current block's %s margin and focuses its text", async (side) => {
    const { editor, projection, host } = renderBlocks([
      { id: "one", type: "standoff-editor-block", text: "First" },
      { id: "two", type: "standoff-editor-block", text: "Second" },
    ]);
    const flow = host.querySelectorAll<HTMLElement>(".reactive-standoff-flow")[1];
    const owner = projection.node(projection.node(projection.state.rootKey)!.children[1])!;
    flow.focus(); setRange(flow, 0, 0, 2, 1);
    editor.selections.setPrimary(owner.key, owner.contentKey, owner.viewId, 0, 3);
    editor.selections.addCaret(owner.key, owner.contentKey, owner.viewId, 4);
    const press = () => {
      const event = new KeyboardEvent("keydown", { key: side === "left" ? "l" : "r", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
      flow.dispatchEvent(event); return event;
    };
    expect(press().defaultPrevented).toBe(true); await Promise.resolve();
    const margin = host.querySelector<HTMLElement>(`[data-block-id="two"] > [data-relation-name="${side}Margin"]`)!;
    const text = margin.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    expect(document.activeElement).toBe(text);
    expect(document.getSelection()!.anchorOffset).toBe(0);
    expect(editor.selections.sets[owner.key].items).toHaveLength(1);
    const item = editor.selections.sets[owner.key].items[0];
    expect(item.anchor.boundary.index).toBe(item.head.boundary.index);
    expect(host.querySelector('[data-block-id="one"] [data-relation-name]')).toBeNull();
    const revision = editor.repository.state.revision;
    flow.focus(); press(); await Promise.resolve();
    expect(document.activeElement).toBe(text);
    expect(editor.repository.state.revision).toBe(revision);
    editor.repository.undo(); expect(host.querySelector(`[data-relation-name="${side}Margin"]`)).toBeNull();
    editor.repository.redo(); expect(host.querySelector(`[data-relation-name="${side}Margin"]`)).not.toBeNull();
  });

  it("does not steal native, composition, modified or repeated margin shortcuts", () => {
    const { editor, host } = renderBlocks([{ type: "standoff-editor-block", text: "Text" }, { type: "plain-text-block", text: "Native" }]);
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    for (const extra of [{ isComposing: true }, { altKey: true }, { metaKey: true }, { ctrlKey: false }, { shiftKey: false }]) {
      const event = new KeyboardEvent("keydown", { key: "l", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, ...extra });
      flow.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
    }
    const native = new KeyboardEvent("keydown", { key: "l", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    host.querySelector("textarea")!.dispatchEvent(native); expect(native.defaultPrevented).toBe(false);
    flow.dispatchEvent(new KeyboardEvent("keydown", { key: "l", ctrlKey: true, shiftKey: true, repeat: true, bubbles: true, cancelable: true }));
    expect(editor.repository.state.revision).toBe(0);
  });

  it("focuses the margin in the originating shared occurrence", async () => {
    const { editor, projection, host } = renderEditor("Shared");
    const first = projection.node(projection.state.rootKey)!.children[0];
    editor.commands.transclude(first, { kind: "at", parentKey: projection.state.rootKey, index: 1 });
    const source = host.querySelectorAll<HTMLElement>('[data-block-type="standoff-editor-block"]')[1];
    const flow = source.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    flow.focus();
    flow.dispatchEvent(new KeyboardEvent("keydown", { key: "r", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(document.activeElement).toBe(source.querySelector('[data-relation-name="rightMargin"] .reactive-standoff-flow'));
    expect(host.querySelectorAll('[data-relation-name="rightMargin"]')).toHaveLength(2);
  });

  it.each(["start", "end", "empty"])("creates a paragraph at %s without snapshots and preserves focus/history", async (position) => {
    const { editor, host } = renderEditor(position === "empty" ? "" : "ABCD", [{ type: "style/bold", start: 0, end: 1 }]);
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    flow.focus();
    const range = document.createRange();
    range.setStart(flow, position === "end" ? flow.childNodes.length : 0);
    range.collapse(true);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    flow.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await Promise.resolve();
    const flows = [...host.querySelectorAll(".reactive-standoff-flow")];
    expect(flows.map(node => node.textContent)).toEqual(position === "end" ? ["ABCD", ""] : ["", position === "empty" ? "" : "ABCD"]);
    expect(document.activeElement).toBe(position === "end" ? flows[1] : flow);
    editor.repository.undo();
    expect(host.querySelectorAll(".reactive-standoff-flow")).toHaveLength(1);
    expect(host.querySelector(".reactive-standoff-flow")).toBe(flow);
    editor.repository.redo();
    expect(host.querySelectorAll(".reactive-standoff-flow")).toHaveLength(2);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it("handles collapsed-caret Enter as a snapshot-free split and focuses the right paragraph", async () => {
    const { editor, host } = renderEditor("ABCD");
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    flow.focus();
    setCaret(flow, 1, 1);
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    flow.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect([...host.querySelectorAll(".reactive-standoff-flow")].map(flow => flow.textContent)).toEqual(["AB", "CD"]);
    expect(document.activeElement?.textContent).toBe("CD");
    editor.repository.undo();
    expect(flow.textContent).toBe("ABCD");
    expect(snapshot).not.toHaveBeenCalled();
  });

  it("updates and removes Cell styles in place, restores them on undo, and preserves saved text/types", () => {
    const initial = [
      { id: "colour", type: "text/colour", start: 0, end: 2, value: "red" },
      { id: "upper", type: "style/uppercase", start: 0, end: 2 },
      { id: "strike", type: "style/strikethrough", start: 1, end: 2 },
      { id: "deleted", type: "style/bold", start: 0, end: 2, isDeleted: true },
      { id: "unknown", type: "future/annotation", start: 0, end: 2, metadata: { retained: true } },
    ];
    const { editor, projection, host } = renderEditor("abc", initial);
    const key = projection.state.nodes[projection.state.rootKey].children[0];
    const cell = host.querySelectorAll<HTMLElement>("[data-inline-key]")[1];
    expect(cell.style.color).toBe("red"); expect(cell.style.textTransform).toBe("uppercase");
    expect(cell.style.textDecorationLine).toBe("line-through"); expect(cell.style.fontWeight).toBe("");
    editor.commands.setPayloadField(key, "standoffProperties", [{ ...initial[0], value: "blue", start: 1, end: 1 }]);
    expect(host.querySelectorAll("[data-inline-key]")[1]).toBe(cell);
    expect(cell.style.color).toBe("blue"); expect(cell.style.textTransform).toBe(""); expect(cell.style.textDecorationLine).toBe("");
    expect(host.querySelector<HTMLElement>('[data-inline-key]:nth-child(1)')?.style.color).toBe("");
    editor.commands.setPayloadField(key, "standoffProperties", []);
    expect(cell.style.color).toBe("");
    editor.repository.undo(); expect(cell.style.color).toBe("blue");
    editor.repository.undo(); expect(cell.style.color).toBe("red");
    expect(host.querySelectorAll("[data-inline-key]")[1]).toBe(cell);
    const saved = editor.encodeDocument().children![0];
    expect(saved.text).toBe("abc"); expect(saved.standoffProperties).toEqual(initial);
  });

  it("restores static range highlights across Blocks when Show/Hide reveals text", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [{ left: 10, top: 10, width: 40, height: 16 }, { left: 0, top: 30, width: 20, height: 16 }],
    });
    disposers.push(() => descriptor
      ? Object.defineProperty(Range.prototype, "getClientRects", descriptor)
      : Reflect.deleteProperty(Range.prototype, "getClientRects"));
    const { editor, projection, host } = renderBlocks([
      { id: "one", type: "standoff-editor-block", text: "First passage", standoffProperties: [
        { id: "hidden-one", type: "style/show-hide", start: 0, end: 4 },
        { id: "deleted", type: "style/show-hide", start: 6, end: 8, isDeleted: true },
      ] },
      { id: "two", type: "standoff-editor-block", text: "Second passage", standoffProperties: [
        { id: "hidden-two", type: "style/show-hide", start: 0, end: 5 },
      ] },
    ]);
    const settle = () => new Promise(resolve => setTimeout(resolve, 25));
    const paths = () => [...host.querySelectorAll('.reactive-selection-layer [data-property-type="editor/show-hide-selection"]')];
    const before = editor.encodeDocument(), revision = editor.repository.state.revision;
    await settle();
    expect(paths()).toHaveLength(0);
    for (let cycle = 0; cycle < 2; cycle++) {
      editor.showHide.toggle(projection.state.rootKey);
      await settle();
      expect(host.querySelectorAll(".reactive-standoff-cell--concealed")).toHaveLength(0);
      expect(paths()).toHaveLength(4); // Two highlighted fragments in each Block.
      expect(paths().filter(path => path.hasAttribute("stroke-dasharray"))).toHaveLength(0);
      expect(paths().some(path => path.getAttribute("data-decoration-key")?.includes("deleted"))).toBe(false);
      expect(editor.currentTextOperation.annotationOperation()).toBeUndefined();
      editor.showHide.toggle(projection.state.rootKey);
      await settle();
      expect(paths()).toHaveLength(0);
      expect(host.querySelectorAll(".reactive-standoff-cell--concealed")).toHaveLength(11);
    }
    expect(editor.repository.state.revision).toBe(revision);
    expect(editor.encodeDocument()).toEqual(before);
  });

  it("renders passive single- and multi-line blur regions outside the text flow and remeasures them after edits", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: function (this: Range) {
        const index = (node: Node) => characterIndex(node.parentElement) ?? -1;
        const start = index(this.startContainer), end = index(this.endContainer);
        const rect = (left: number, top: number, width: number, height = 16) => ({ left, top, width, height });
        if (start === 2 && end === 5) return [rect(10, 20, 40), rect(5, 42, 55)];
        if (start === 3 && end === 6) return [rect(14, 20, 42), rect(5, 42, 58)];
        if (start === 3 && end === 7) return [rect(14, 20, 50), rect(5, 42, 62)];
        return [rect(start * 4, 4, Math.max(8, (end - start + 1) * 8))];
      },
    });
    disposers.push(() => descriptor
      ? Object.defineProperty(Range.prototype, "getClientRects", descriptor)
      : Reflect.deleteProperty(Range.prototype, "getClientRects"));

    const { editor, host } = renderEditor("abcdefghij", [
      { id: "single", type: "style/blur", start: 0, end: 0 },
      { id: "multi", type: "style/blur", start: 2, end: 5, amount: 5 },
      { id: "rainbow", type: "style/rainbow", start: 7, end: 8 },
    ]);
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    const regions = () => [...host.querySelectorAll<HTMLElement>('.reactive-standoff-blur[data-property-type="style/blur"]')];
    await vi.waitFor(() => expect(regions()).toHaveLength(3));
    expect(regions().filter(region => region.style.getPropertyValue("--standoff-region-filter") === "blur(5px)")).toHaveLength(2);
    expect(regions().filter(region => region.style.getPropertyValue("--standoff-region-filter") === "blur(3px)")).toHaveLength(1);
    expect(flow.querySelector(".reactive-standoff-blur")).toBeNull();
    expect(flow.children).toHaveLength(10);
    expect(flow.textContent).toBe("abcdefghij");
    expect(host.querySelector('[data-property-type="style/rainbow"]')).not.toBeNull();
    expect(host.querySelector(".reactive-standoff-blur-layer")?.getAttribute("aria-hidden")).toBe("true");

    flow.focus(); setCaret(flow, 0, 0);
    flow.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "X" }));
    await vi.waitFor(() => expect(regions().find(region => region.style.getPropertyValue("--standoff-region-filter") === "blur(5px)")?.style.left).toBe("14px"));
    expect((editor.encodeDocument().children![0].standoffProperties as any[]).find(p => p.id === "multi")).toMatchObject({ start: 3, end: 6, amount: 5 });

    setCaret(flow, 4, 1);
    flow.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "Y" }));
    await vi.waitFor(() => expect(regions().find(region => region.style.getPropertyValue("--standoff-region-filter") === "blur(5px)")?.style.width).toBe("50px"));
    expect((editor.encodeDocument().children![0].standoffProperties as any[]).find(p => p.id === "multi")).toMatchObject({ start: 3, end: 7, amount: 5 });
    expect(document.activeElement).toBe(flow);
    expect(document.getSelection()?.anchorNode && flow.contains(document.getSelection()!.anchorNode)).toBe(true);
  });

  it("moves colour styling with mapped annotation ranges during typing and undo", async () => {
    const { editor, host } = renderEditor("ABCD", [{ id: "colour", type: "text/colour", start: 1, end: 2, value: "purple" }]);
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    const originalB = flow.querySelectorAll<HTMLElement>("[data-inline-key]")[1];
    setCaret(flow, 0, 0);
    flow.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "X" }));
    await Promise.resolve();
    expect(editor.encodeDocument().children![0].text).toBe("XABCD");
    expect(flow.querySelectorAll("[data-inline-key]")[2]).toBe(originalB);
    expect(originalB.style.color).toBe("purple");
    expect(flow.querySelector<HTMLElement>('[data-inline-key]:nth-child(2)')?.style.color).toBe("");
    editor.repository.undo();
    expect(flow.querySelectorAll("[data-inline-key]")[1]).toBe(originalB);
    expect(originalB.style.color).toBe("purple");
  });

  it("edits the canonical Cell sequence and keeps surviving Cell identities", () => {
    const { editor, projection, host } = renderEditor("AB");
    const root = projection.state.nodes[projection.state.rootKey];
    const standoff = projection.state.nodes[root.children[0]];
    const survivingB = projection.state.nodes[standoff.inlineContent[1]].placementKey;
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    setCaret(flow, 0, 1);
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "x",
    });
    flow.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect((editor.encodeDocument().children as any[])[0].text).toBe("AxB");
    const updated = projection.state.nodes[root.children[0]];
    expect(projection.state.nodes[updated.inlineContent[2]].placementKey).toBe(survivingB);
    editor.repository.undo();
    expect((editor.encodeDocument().children as any[])[0].text).toBe("AB");
  });

  it("keeps consecutive typing at the caret restored between Cell spans", async () => {
    const { editor, host } = renderEditor("ABCD");
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    setCaret(flow, 1, 1);

    flow.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "x",
      }),
    );
    await Promise.resolve();
    flow.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "y",
      }),
    );
    await Promise.resolve();

    expect((editor.encodeDocument().children as any[])[0].text).toBe("ABxyCD");
  });

  it("deletes a complete grapheme rather than one combining code point", () => {
    const { editor, host } = renderEditor("éx");
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    setCaret(flow, 1, 1);
    flow.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
      }),
    );
    expect((editor.encodeDocument().children as any[])[0].text).toBe("x");
  });

  it.each(["empty", "previous", "next"])("removes an %s empty paragraph through input without repository scans", async mode => {
    const { editor, projection } = renderBlocks([
      { id: "left", type: "standoff-editor-block", text: "AB" },
      { id: "empty", type: "standoff-editor-block", text: "" },
      { id: "right", type: "standoff-editor-block", text: "CD" },
      { id: "unrelated", type: "standoff-editor-block", text: "x".repeat(1000) },
    ]);
    const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
    const original = editor.encodeDocument();
    const untouched = editor.mounts.get(node("unrelated").key)!.root.firstChild;
    const active = node(mode === "empty" ? "empty" : mode === "previous" ? "right" : "left");
    const handle = editor.mounts.get(active.key)!;
    editor.focus.request(active.key);
    handle.restoreInlineSelection!({ anchor: mode === "next" ? 2 : 0, head: mode === "next" ? 2 : 0 });
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    const prune = vi.spyOn(editor.commands as any, "pruneUnreachable");
    const diff = vi.spyOn(editor.commands as any, "diff");
    handle.focusElement.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true, cancelable: true, inputType: mode === "next" ? "deleteContentForward" : "deleteContentBackward",
    }));
    await Promise.resolve();
    expect(node("empty")).toBeUndefined();
    const focused = editor.mounts.get(node(mode === "previous" ? "right" : "left").key)!;
    expect(focused.captureInlineSelection!()).toEqual({ anchor: mode === "previous" ? 0 : 2, head: mode === "previous" ? 0 : 2 });
    editor.repository.undo();
    expect(node("empty")).toBeDefined();
    editor.repository.redo();
    expect(node("empty")).toBeUndefined();
    editor.repository.undo();
    expect(snapshot).not.toHaveBeenCalled();
    expect(prune).not.toHaveBeenCalled();
    expect(diff).not.toHaveBeenCalled();
    snapshot.mockRestore(); prune.mockRestore(); diff.mockRestore();
    expect(editor.encodeDocument().children).toEqual(original.children);
    expect(editor.mounts.get(node("unrelated").key)!.root.firstChild).toBe(untouched);
  });

  it("Backspace at a Block start joins it to the previous Standoff Block", async () => {
    const { editor, host } = renderBlocks([
      {
        id: "left",
        type: "standoff-editor-block",
        text: "AB",
        standoffProperties: [{ id: "left-bold", type: "style/bold", start: 0, end: 1 }],
        children: [],
      },
      {
        id: "right",
        type: "standoff-editor-block",
        text: "CD",
        standoffProperties: [{ id: "right-highlight", type: "style/highlighter", start: 0, end: 1 }],
        children: [],
      },
    ]);
    const flows = host.querySelectorAll<HTMLElement>(".reactive-standoff-flow");
    setCaret(flows[1], 0, 0);
    flows[1].dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
      }),
    );
    await Promise.resolve();

    const blocks = editor.encodeDocument().children as any[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("ABCD");
    expect(blocks[0].standoffProperties).toEqual([
      { id: "left-bold", type: "style/bold", start: 0, end: 1 },
      { id: "right-highlight", type: "style/highlighter", start: 2, end: 3 },
    ]);

    const joinedFlow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    joinedFlow.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "x",
      }),
    );
    expect((editor.encodeDocument().children as any[])[0].text).toBe("ABxCD");
  });

  it("Delete at a Block end joins the next Standoff Block", async () => {
    const { editor, host } = renderBlocks([
      { id: "left", type: "standoff-editor-block", text: "AB", children: [] },
      { id: "right", type: "standoff-editor-block", text: "CD", children: [] },
    ]);
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    setCaret(flow, 1, 1);
    flow.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentForward",
      }),
    );
    await Promise.resolve();
    flow.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "x",
      }),
    );

    const blocks = editor.encodeDocument().children as any[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("ABxCD");
  });

  it("contracts annotations around deleted text and removes only fully deleted ranges", async () => {
    const { editor, host } = renderEditor("abcdef", [
      { id: "highlight", type: "style/highlighter", start: 1, end: 4 },
    ]);
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    setRange(flow, 2, 0, 3, 1);
    flow.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
      }),
    );
    await Promise.resolve();

    let block = (editor.encodeDocument().children as any[])[0];
    expect(block.text).toBe("abef");
    expect(block.standoffProperties).toEqual([
      { id: "highlight", type: "style/highlighter", start: 1, end: 2 },
    ]);

    setRange(flow, 1, 0, 2, 1);
    flow.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentForward",
      }),
    );
    block = (editor.encodeDocument().children as any[])[0];
    expect(block.text).toBe("af");
    expect(block.standoffProperties).toEqual([]);
  });

  it("reconciles an uncancelled DOM text edit without replacing its annotations", async () => {
    const { editor, host } = renderEditor("abcdef", [
      { id: "highlight", type: "style/highlighter", start: 1, end: 4 },
    ]);
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    const cell = flow.querySelectorAll<HTMLElement>("[data-inline-key]")[2];
    cell.firstChild!.textContent = "cX";
    setCaret(flow, 2, 2);
    flow.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: "X",
      }),
    );
    await Promise.resolve();

    const block = (editor.encodeDocument().children as any[])[0];
    expect(block.text).toBe("abcXdef");
    expect(block.standoffProperties).toEqual([
      { id: "highlight", type: "style/highlighter", start: 1, end: 5 },
    ]);
  });

  it("splits a Standoff Block on a middle paragraph break", () => {
    const { editor, host } = renderEditor("abcd");
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    setCaret(flow, 1, 1);
    flow.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertParagraph",
      }),
    );
    expect((editor.encodeDocument().children as any[]).map((block) => block.text)).toEqual(["ab", "cd"]);
    expect(editor.repository.state.revision).toBe(1);
  });

  it("creates an empty preceding Block when Enter is pressed at the start", async () => {
    const { editor, host } = renderEditor("abcd", [
      { id: "bold", type: "style/bold", start: 0, end: 1 },
    ]);
    const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    setCaret(flow, 0, 0);
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    flow.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    const blocks = editor.encodeDocument().children as any[];
    expect(blocks.map((block) => block.text)).toEqual(["", "abcd"]);
    expect(blocks[0].standoffProperties).toEqual([]);
    expect(blocks[1].standoffProperties).toEqual([
      { id: "bold", type: "style/bold", start: 0, end: 1 },
    ]);
  });

  it("uses all four arrow keys to cross Block boundaries", async () => {
    const { editor, projection, host } = renderBlocks([
      { id: "first", type: "standoff-editor-block", text: "AB", children: [] },
      { id: "second", type: "standoff-editor-block", text: "CD", children: [] },
    ]);
    const root = projection.state.nodes[projection.state.rootKey];
    const firstKey = root.children[0];
    const secondKey = root.children[1];
    const flows = host.querySelectorAll<HTMLElement>(".reactive-standoff-flow");

    setCaret(flows[0], 1, 1);
    flows[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(editor.focus.state.focusedKey).toBe(secondKey);

    setCaret(flows[1], 0, 0);
    flows[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(editor.focus.state.focusedKey).toBe(firstKey);

    setCaret(flows[0], 1, 1);
    flows[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(editor.focus.state.focusedKey).toBe(secondKey);

    setCaret(flows[1], 0, 0);
    flows[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(editor.focus.state.focusedKey).toBe(firstKey);
  });

  it("edits two model-owned carets in one transaction and one undo", () => {
    const { editor, projection } = renderEditor("abcd");
    const root = projection.state.nodes[projection.state.rootKey];
    const standoff = projection.state.nodes[root.children[0]];
    editor.selections.setPrimary(standoff.key, standoff.contentKey, standoff.viewId, 1);
    editor.selections.addCaret(standoff.key, standoff.contentKey, standoff.viewId, 3);
    const set = editor.selections.sets[standoff.key];
    editor.multiSelections.replace(
      standoff.key,
      set.items.map((item) => ({
        item,
        start: item.head.boundary.index,
        end: item.head.boundary.index,
        text: "X",
      })),
    );
    expect((editor.encodeDocument().children as any[])[0].text).toBe("aXbcXd");
    expect(editor.repository.state.revision).toBe(1);
    editor.repository.undo();
    expect((editor.encodeDocument().children as any[])[0].text).toBe("abcd");
  });
});
