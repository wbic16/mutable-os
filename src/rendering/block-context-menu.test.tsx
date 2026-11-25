// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import type { ExistingBlockDto } from "../block-tree/types";
import { registerCoreViews } from "./register-core-views";
import { registerApplicationViews } from "../application/features";
import { ReactiveTreeView } from "./reactive-tree-view";
import { blockMenuItems, type BlockMenuItem } from "../runtime/block-menu-actions";
import { decodeNative } from '../persistence/native-resource';
import { resourceToRepository } from '../history/durable-core';
import { encodeDocument } from '../block-tree/codecs';
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const text = (id: string): ExistingBlockDto => ({ id, type: "standoff-editor-block", text: id, children: [] });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function mount(children: ExistingBlockDto[] = [text("first"), text("second")], application = false) {
  const editor = new ReactiveEditor({ id: "doc", type: "document-block", children });
  (application ? registerApplicationViews : registerCoreViews)(editor);
  const view = editor.createView("menu-test"); const host = document.body.appendChild(document.createElement("div"));
  cleanup.push(() => editor.dispose(), render(() => <ReactiveTreeView editor={editor} projection={view} />, host)); editor.installGateway(document);
  const key = (id: string) => Object.values(view.state.nodes).find(node => node.payload.id === id)!.key;
  const element = (id: string) => host.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
  return { editor, view, host, key, element };
}
function menuButton(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>(".reactive-block-menu button")].find(button => button.textContent?.replace(/[›‹]/g, "").trim() === label);
  if (!button) throw new Error(`Missing menu item ${label}: ${document.querySelector(".reactive-block-menu")?.textContent}`);
  return button;
}
function action(items: BlockMenuItem[], ...path: string[]): BlockMenuItem {
  const item = items.find(item => item.label === path[0]); if (!item) throw new Error(`Missing action ${path.join("/")}`);
  return path.length === 1 ? item : action(item.children!, ...path.slice(1));
}
describe("Block context menu", () => {
  it('exports full native JSON through the menu, preserving hidden content and unsaved edits without saving', async () => {
    const { editor, key, element } = mount([
      { ...text('first'), standoffProperties: [{ id: 'annotation', type: 'codex/entity-reference', start: 0, end: 4, value: 'entity-id' }], metadata: { future: { keep: true } } },
      { id: 'tabs', type: 'tab-row-block', children: [
        { id: 'visible', type: 'tab-block', metadata: { active: true }, children: [text('second')] },
        { id: 'hidden', type: 'tab-block', metadata: { active: false }, children: [text('hidden-text')] },
      ] },
    ]);
    editor.commands.setPayloadField(key('doc'), 'metadata', { title: 'Export test.ink' });
    editor.commands.replaceInlineRange(key('first'), 5, 5, ' unsaved');
    const before = editor.encodeDocument(), revision = editor.repository.state.revision, canUndo = editor.repository.canUndo();
    const commit = vi.spyOn(editor.repository, 'commit'), snapshot = vi.spyOn(editor.repository, 'snapshot');
    const create = vi.fn((_blob: Blob) => 'blob:export');
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = vi.fn(); });
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    element('first').dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true })); await tick();
    menuButton('Export Document').click(); await tick();
    expect(filename).toBe('Export test.mutable.json'); expect(create).toHaveBeenCalledTimes(1);
    const blob = create.mock.calls[0][0]; expect(blob.type).toBe('application/json;charset=utf-8');
    const json = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob); });
    const resource = decodeNative(new TextEncoder().encode(json));
    expect(resource.resourceId).toBe('doc'); expect(encodeDocument(resourceToRepository(resource))).toEqual(before);
    expect(commit).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
    expect(editor.repository.state.revision).toBe(revision); expect(editor.repository.canUndo()).toBe(canUndo);
    expect(document.querySelector('.reactive-block-menu')).toBeNull();
  });
  it('shows a recoverable menu error when Scry blocks export', async () => {
    const { editor, element } = mount();
    editor.completionInput = { beforeSave: () => false } as typeof editor.completionInput;
    const snapshot = vi.spyOn(editor.repository, 'snapshot');
    element('first').dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true })); await tick();
    menuButton('Export Document').click(); await tick();
    expect(document.querySelector('.reactive-block-menu [role=alert]')?.textContent).toContain('Finish or cancel Scry');
    expect(snapshot).not.toHaveBeenCalled();
  });
  it.each(["click", "early native menu", "secondary native menu"])("opens with Grouping enabled for %s and exposes inline StickyNote insertion", async sequence => {
    const { element, editor, key } = mount(undefined, true);
    const target = element("second").querySelector("[data-inline-key]")!;
    const send = (type: string, button = 0) => target.dispatchEvent(new MouseEvent(type, { ctrlKey: true, button, bubbles: true, cancelable: true }));
    send("pointerdown", sequence === "secondary native menu" ? 2 : 0);
    if (sequence === "early native menu") send("contextmenu", 2);
    if (sequence === "secondary native menu") send("contextmenu", 2);
    send("pointerup", sequence === "secondary native menu" ? 2 : 0); await tick();
    if (sequence === "click") send("click");
    await tick();
    expect(document.querySelectorAll(".reactive-block-menu")).toHaveLength(1);
    expect(editor.overlays.overlays[0].ownerKey).toBe(key("second"));
    menuButton("Add Block").click(); await tick();
    menuButton("Insert Sticky Note Here").click(); await tick();
    expect(editor.encodeDocument().children!.some(child => child.type === "sticky-note-block")).toBe(true);
  });
  it("opens once for Control-click plus native contextmenu, targets the clicked Block, and restores selection on Escape", async () => {
    const { editor, element, key } = mount(); editor.focus.request(key("first"), { caret: "start" });
    editor.mounts.get(key("first"))!.restoreInlineSelection!({ anchor: 1, head: 3 });
    const down = new MouseEvent("pointerdown", { ctrlKey: true, button: 0, bubbles: true, cancelable: true }); element("second").dispatchEvent(down); expect(down.defaultPrevented).toBe(true);
    const click = new MouseEvent("click", { ctrlKey: true, bubbles: true, cancelable: true }); element("second").dispatchEvent(click);
    element("second").dispatchEvent(new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true })); await tick();
    expect(click.defaultPrevented).toBe(true); expect(document.querySelectorAll(".reactive-block-menu")).toHaveLength(1); expect(editor.overlays.overlays[0].ownerKey).toBe(key("second"));
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await tick();
    expect(document.querySelector(".reactive-block-menu")).toBeNull(); expect(editor.focus.state.focusedKey).toBe(key("first")); expect(editor.mounts.get(key("first"))!.captureInlineSelection!()).toEqual({ anchor: 1, head: 3 });
  });
  it("preserves native input menus, dismisses outside, and supports keyboard submenu navigation and URL validation", async () => {
    const { editor, element, host, key } = mount([{ id: "plain", type: "plain-text-block", text: "native" }, text("first")]);
    const native = new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true }); host.querySelector("textarea")!.dispatchEvent(native); expect(native.defaultPrevented).toBe(false);
    editor.focus.request(key("first")); element("first").dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true })); await tick();
    // Interchange actions can precede Add Block; navigate to the intended submenu.
    for (let i=0;i<20&&document.activeElement!==menuButton("Add Block");i++)document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowDown",bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe(menuButton("Add Block"));
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); await tick();
    menuButton("Image URL…").click(); await tick(); const input = document.querySelector<HTMLInputElement>(".reactive-block-menu input")!;
    expect(document.activeElement).toBe(input); input.value = "javascript:alert(1)"; input.dispatchEvent(new Event("input", { bubbles: true })); menuButton("Apply").click(); expect(document.querySelector(".reactive-block-menu [role=alert]")?.textContent).toContain("valid");
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); expect(document.querySelector(".reactive-block-menu")).toBeNull();
  });
  it("deletes the clicked Block rather than stale focus and undoes the operation", async () => {
    const { editor, element, key } = mount(); editor.focus.request(key("first"));
    element("second").dispatchEvent(new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true })); await tick();
    menuButton("Delete Block").focus(); menuButton("Delete Block").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); expect(element("second")).not.toBeNull();
    menuButton("Delete Block").click(); await tick();
    expect(element("second")).toBeNull(); expect(element("first")).not.toBeNull(); expect(document.querySelector(".reactive-block-menu")).toBeNull();
    editor.repository.undo(); expect(element("second")).not.toBeNull();
  });
  it("converts a Block through transaction-aware wrappers and reverses each conversion in one undo", () => {
    const { editor, key } = mount();
    for (const label of ["Convert to grid (1 × 2)", "Convert to tab", "Convert to page", "Convert to list"]) {
      action(blockMenuItems(editor, key("first")), label).run!();
      expect(editor.encodeDocument().children?.[0].id).not.toBe("first");
      editor.repository.undo(); expect(editor.encodeDocument().children?.map(child => child.id)).toEqual(["first", "second"]);
    }
  });
  it("adds, activates, renames, reorders and deletes tabs using their label targets", async () => {
    const { editor, key, host } = mount([{ id: "row", type: "tab-row-block", children: [{ id: "tab", type: "tab-block", metadata: { name: "First", active: true }, children: [text("first")] }] }]);
    action(blockMenuItems(editor, key("first")), "Tabs", "Add tab").run!();
    const second = editor.encodeDocument().children![0].children![1]; expect(host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe("Tab 2");
    const secondKey = key(second.id!); action(blockMenuItems(editor, secondKey), "Tabs", "Rename…").input!.submit("Renamed");
    action(blockMenuItems(editor, secondKey), "Tabs", "Move left").run!(); expect(editor.encodeDocument().children![0].children![0].id).toBe(second.id);
    const label = [...host.querySelectorAll<HTMLElement>("[role=tab]")].find(item => item.textContent === "First")!;
    label.dispatchEvent(new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true })); await tick(); expect(editor.overlays.overlays[0].ownerKey).toBe(key("tab"));
    editor.overlays.close(editor.overlays.overlays[0].key, false);
    action(blockMenuItems(editor, secondKey), "Tabs", "Delete").run!(); expect(host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe("First"); editor.repository.undo(); expect(editor.encodeDocument().children![0].children).toHaveLength(2);
  });
  it("preserves grid child order during merge/flatten and can add a row and move a cell vertically", () => {
    const cell = (id: string, children: ExistingBlockDto[]) => ({ id, type: "grid-cell-block", children });
    const { editor, key } = mount([{ id: "grid", type: "grid-block", children: [{ id: "row1", type: "grid-row-block", children: [cell("a", [text("a1")]), cell("b", [text("b1"), text("b2")])] }, { id: "row2", type: "grid-row-block", children: [cell("c", [text("c1")]), cell("d", [text("d1")])] }] }]);
    action(blockMenuItems(editor, key("b1")), "Grids", "Merge cell left").run!(); expect(editor.encodeDocument().children![0].children![0].children![0].children!.map(child => child.id)).toEqual(["a1", "b1", "b2"]); editor.repository.undo();
    action(blockMenuItems(editor, key("a1")), "Grids", "Move cell down").run!(); expect(editor.encodeDocument().children![0].children![1].children![0].id).toBe("a"); editor.repository.undo();
    action(blockMenuItems(editor, key("a1")), "Grids", "Add row").run!(); expect(editor.encodeDocument().children![0].children).toHaveLength(3); editor.repository.undo();
    action(blockMenuItems(editor, key("b1")), "Grids", "Destructure grid").run!(); expect(editor.encodeDocument().children!.map(child => child.id)).toEqual(["a1", "b1", "b2", "c1", "d1"]); editor.repository.undo(); expect(editor.encodeDocument().children![0].id).toBe("grid");
  });
  it("adds tags to the existing row and applies pocket height and theme without dropping unknown properties", () => {
    const { editor, key, host } = mount([{ id: "pocket", type: "container-block", children: [text("first")] }]);
    action(blockMenuItems(editor, key("first")), "Tags", "Add tag").run!(); action(blockMenuItems(editor, key("first")), "Tags", "Add tag").run!();
    const tags = editor.encodeDocument().children!.filter(child => child.type === "sticky-tab-row-block"); expect(tags).toHaveLength(1); expect(tags[0].children).toHaveLength(2);
    action(blockMenuItems(editor, key("first")), "Pockets", "Height (px)…").input!.submit("321"); expect(host.querySelector<HTMLElement>('[data-block-id=pocket]')?.style.height).toBe("321px");
    editor.commands.setPayloadField(key("doc"), "blockProperties", [{ type: "future/property" }]); action(blockMenuItems(editor, key("first")), "Themes", "Glass").run!();
    expect(editor.encodeDocument().blockProperties).toEqual([{ type: "future/property" }, { type: "block/theme/glass" }]); expect(action(blockMenuItems(editor, key("doc")), "File", "Rename document").disabled).toBe(true);
  });
});
