import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { toolbarControl } from "./toolbar-test-helpers";
import { DocumentStyleBar, annotationTools } from "./document-style-bar";
import type { ExistingBlockDto, JsonObject } from "../block-tree/types";
import { CROSS_TEXT_PREFERENCE_KEY } from "../runtime/cross-block-selection";
import { captureBlocks, cloneBlocks } from "../block-tree/clipboard";

const cleanups: (() => void)[] = [];
beforeEach(() => localStorage.removeItem(CROSS_TEXT_PREFERENCE_KEY));
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); localStorage.removeItem(CROSS_TEXT_PREFERENCE_KEY); });
const paragraph = (id: string, text = "abc😀def"): ExistingBlockDto => ({ id, type: "standoff-editor-block", text });
function setup(children = [paragraph("a"), paragraph("b"), paragraph("c")]) {
  const editor = new ReactiveEditor({ type: "document-block", children }); registerCoreViews(editor);
  const projection = editor.createView("cross-test"), host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <><DocumentStyleBar editor={editor} /><ReactiveTreeView editor={editor} projection={projection} /></>, host); editor.installGateway(document);
  cleanups.push(() => { editor.dispose(); dispose(); host.remove(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const point = (id: string, index: number) => editor.crossText.position(node(id).key, index);
  const flow = (id: string) => editor.mounts.get(node(id).key)!.focusElement;
  return { editor, projection, host, node, point, flow };
}
describe("experimental cross-Block text selection", () => {
  it('does not replace a cross-Block selection with a newline for the resource shortcut', () => {
    const {editor, point, flow} = setup(); editor.crossText.enable(true);
    editor.crossText.set(point('a', 1), point('b', 3));
    const commit = vi.spyOn(editor.repository, 'commit'), snapshot = vi.spyOn(editor.repository, 'snapshot');
    const event = new KeyboardEvent('keydown', {key:'Enter',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true});
    flow('a').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(editor.crossText.range()).toBeDefined();
    expect(commit).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
  });
  it.each([false, true])('selects and drags whole words without document work (cross selection=%s)', enabled => {
    const f=setup([paragraph('a','Alpha bravo charlie delta'),paragraph('b','Echo foxtrot')]);f.editor.crossText.enable(enabled);
    let hit=f.flow('a').children[8];const previous=document.elementFromPoint;
    document.elementFromPoint=()=>hit;cleanups.push(()=>{document.elementFromPoint=previous;});
    const send=(type:string,index:number,block='a',detail=0)=>{
      hit=f.flow(block).children[index];const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1,detail});
      if(type==='pointerdown'){Object.defineProperty(event,'pointerType',{value:'mouse'});Object.defineProperty(event,'pointerId',{value:1});}
      hit.dispatchEvent(event);
    };
    const snapshot=vi.spyOn(f.editor.repository,'snapshot'),commit=vi.spyOn(f.editor.repository,'commit'),segments=vi.spyOn(Intl.Segmenter.prototype,'segment');
    const mount=f.editor.mounts.get(f.node('a').key)!,restore=vi.fn(mount.restoreInlineSelection!.bind(mount));mount.restoreInlineSelection=restore;
    send('pointerdown',8);send('mousedown',8,'a',2);
    expect(document.getSelection()?.toString()).toBe('bravo');const calls=restore.mock.calls.length;
    for(let i=0;i<10;i++)send('pointermove',9);
    expect(restore).toHaveBeenCalledTimes(calls);expect(segments).toHaveBeenCalledTimes(1);
    send('pointermove',20);expect(document.getSelection()?.toString()).toBe('bravo charlie delta');
    send('pointermove',1);expect(document.getSelection()?.toString()).toBe('Alpha bravo');
    send('pointermove',2,'b');
    if(enabled)expect(f.editor.crossText.selectedText()).toBe('bravo charlie delta\nEcho');
    else expect(document.getSelection()?.toString()).toBe('Alpha bravo');
    send('pointermove',14);send('pointerup',14);expect(document.getSelection()?.toString()).toBe('bravo charlie');
    expect(snapshot).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();
  });
  it("replaces via beforeinput and pastes plain multiline text atomically", () => {
    const { editor, point, flow } = setup(); editor.crossText.enable(true);
    const before = editor.encodeDocument();
    const select = () => editor.crossText.set(point("a", 2), point("b", 3));
    select();
    flow("a").dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "新", bubbles: true, cancelable: true }));
    expect(editor.encodeDocument().children!.map(b => b.text)).toEqual(["ab新😀def", "abc😀def"]);
    editor.repository.undo(); expect(editor.encodeDocument().children).toEqual(before.children);
    select();
    const paste = (text: string, types = ["text/plain"]) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { types, getData: () => text } }); flow("a").dispatchEvent(event);
    };
    paste(""); paste("image", ["image/png"]); expect(editor.encodeDocument().children).toEqual(before.children);
    paste("one\r\ntwo"); expect(editor.encodeDocument().children!.map(b => b.text)).toEqual(["abone", "two😀def", "abc😀def"]);
    editor.repository.undo(); expect(editor.encodeDocument().children).toEqual(before.children);
    select(); const data = new Map<string,string>(); const copy = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(copy, "clipboardData", { value: { setData: (type: string, text: string) => data.set(type,text) } });
    flow("a").dispatchEvent(copy); expect(data.get("text/plain")).toBe("c😀def\nabc"); expect(editor.encodeDocument().children).toEqual(before.children);
  });
  it("commits composition once and preserves selection on composition cancellation", () => {
    const { editor, node, flow } = setup(); editor.crossText.enable(true);
    const mount = editor.mounts.get(node("a").key)!; mount.focus(); mount.restoreInlineSelection!({ anchor: 2, head: 7 });
    flow("a").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
    const before = editor.encodeDocument();
    let input = document.querySelector<HTMLTextAreaElement>('[data-cross-text-input]')!;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertCompositionText", data: "中", isComposing: true, bubbles: true }));
    expect(editor.encodeDocument()).toEqual(before);
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "", bubbles: true })); expect(editor.crossText.range()).toBeDefined();
    input = document.querySelector<HTMLTextAreaElement>('[data-cross-text-input]')!;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "中文", bubbles: true }));
    expect(editor.encodeDocument().children![0].text).toBe("ab中文abc😀def");
    editor.repository.undo(); expect(editor.encodeDocument().children).toEqual(before.children);
  });
  it("persists linked annotations, shares settings, separates segment deletion, and rekeys Block copies", () => {
    const { editor, point, node } = setup(); editor.crossText.enable(true);
    editor.crossText.set(point("a", 2), point("b", 3));
    const id = editor.linkedAnnotations.create("codex/entity-reference", "entity-1");
    expect(editor.linkedAnnotations.segments(id)).toHaveLength(2);
    const property = (id: string) => (node(id).payload.standoffProperties as JsonObject[])[0];
    const raw = () => JSON.parse(JSON.stringify(property("a")));
    editor.linkedAnnotations.edit(node("a").key, 0, raw(), { start: 2, end: 6, value: "entity-2", metadata: { name: "Shared name" } });
    expect(editor.linkedAnnotations.resolve(property("b")).value).toBe("entity-2");
    const saved = editor.encodeDocument(), reopened = new ReactiveEditor(saved);
    expect(reopened.encodeDocument()).toEqual(saved); reopened.dispose();
    const fragment = cloneBlocks(captureBlocks(editor.repository.readState(), [node("a").placementKey, node("b").placementKey]));
    const freshId = Object.keys(fragment.linkedAnnotations!)[0]; expect(freshId).not.toBe(id);
    editor.commands.insertFragment(fragment, { kind: "after", anchorKey: node("c").key });
    expect(editor.linkedAnnotations.segments(freshId)).toHaveLength(2);
    expect(editor.linkedAnnotations.resolve(editor.linkedAnnotations.segments(freshId)[0].property).value).toBe("entity-2");
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(saved);
    editor.linkedAnnotations.edit(node("a").key, 0, raw(), "delete"); expect(editor.linkedAnnotations.segments(id)).toHaveLength(1);
    editor.linkedAnnotations.deleteAll(id); expect(editor.linkedAnnotations.resolve(property("b")).isDeleted).toBe(true);
    editor.repository.undo(); expect(editor.linkedAnnotations.resolve(property("b")).isDeleted).toBe(false);
  });
  it("remembers explicit opt-in and opt-out across editor recreation without saving selection or changing documents", () => {
    const { editor, point } = setup(); const before = editor.encodeDocument();
    expect(editor.crossText.enabled()).toBe(false);
    editor.crossText.enable(true); editor.crossText.set(point("a", 1), point("b", 3));
    expect(localStorage.getItem(CROSS_TEXT_PREFERENCE_KEY)).toBe("true");
    const reopened = new ReactiveEditor(before);
    expect(reopened.crossText.enabled()).toBe(true); expect(reopened.crossText.range()).toBeUndefined();
    expect(editor.encodeDocument()).toEqual(before); expect(editor.repository.state.revision).toBe(0);
    reopened.crossText.enable(false); reopened.dispose();
    const next = new ReactiveEditor(before); expect(next.crossText.enabled()).toBe(false); next.dispose();
  });
  it("defaults off for invalid preferences and still works when storage is blocked", () => {
    localStorage.setItem(CROSS_TEXT_PREFERENCE_KEY, "invalid"); const first = setup().editor;
    expect(first.crossText.enabled()).toBe(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const second = setup().editor; expect(second.crossText.enabled()).toBe(false);
    expect(() => second.crossText.enable(true)).not.toThrow(); expect(second.crossText.enabled()).toBe(true);
    expect(second.crossText.message()).toContain("storage is unavailable");
  });
  it("owns a held Shift+Left gesture from inside a Block through its first character into the previous Block", () => {
    const { editor, node, flow } = setup(); editor.crossText.enable(true);
    const mount = editor.mounts.get(node("b").key)!; mount.focus(); mount.restoreInlineSelection!({ anchor: 3, head: 3 });
    for (let i = 0; i < 6; i++) flow("b").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, repeat: i > 0, bubbles: true, cancelable: true }));
    expect(editor.crossText.range()!.anchor.occurrenceKey).toBe(node("b").key);
    expect(editor.crossText.range()!.anchor.boundary.index).toBe(3);
    expect(editor.crossText.range()!.head.occurrenceKey).toBe(node("a").key);
    expect(editor.crossText.range()!.head.boundary.index).toBe(5);
    expect(editor.repository.state.revision).toBe(0);
  });
  it("clears a previous local highlight on click-away but preserves it for toolbar controls", () => {
    const { editor, node, flow, host } = setup();
    editor.selections.setPrimary(node("a").key, node("a").contentKey, node("a").viewId, 1, 4);
    toolbarControl(host, 'button[data-annotation-type]').dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    expect(editor.selections.sets[node("a").key]).toBeDefined();
    flow("b").dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    expect(editor.selections.sets[node("a").key]).toBeUndefined();
    editor.crossText.enable(true);
    editor.crossText.set(editor.crossText.position(node("a").key, 1), editor.crossText.position(node("b").key, 4));
    flow("c").dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    expect(editor.crossText.range()).toBeUndefined();
  });
  it("is off by default; resolves reverse ranges and empty paragraphs without mutations", () => {
    const { editor, point, node } = setup([paragraph("a"), paragraph("b", ""), paragraph("c")]);
    expect(editor.crossText.set(point("a", 2), point("c", 4))).toBe(false);
    editor.crossText.enable(true);
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    editor.crossText.set(point("c", 4), point("a", 2));
    expect(editor.crossText.resolve(point("c", 4), point("a", 2)).map(s => [s.start, s.end])).toEqual([[2, 7], [0, 0], [0, 4]]);
    expect(editor.crossText.range()!.anchor.occurrenceKey).toBe(node("c").key);
    expect(snapshot).not.toHaveBeenCalled(); expect(editor.repository.state.revision).toBe(0);
  });
  it("rejects media, nested-list, hidden, stale and cross-view endpoints", () => {
    const { editor, node, point, flow } = setup([paragraph("a"), { id: "media", type: "image-block" }, paragraph("b"), { type: "indented-list-block", children: [paragraph("nested")] }]);
    editor.crossText.enable(true);
    expect(() => editor.crossText.set(point("a", 0), point("b", 1))).toThrow("barriers");
    expect(() => editor.crossText.set(point("b", 0), point("nested", 1))).toThrow("boundaries");
    editor.viewVisibility.set(node("b").placementKey, true);
    expect(() => editor.crossText.set(point("b", 0), point("b", 1))).toThrow("barriers"); editor.viewVisibility.set(node("b").placementKey, false);
    expect(() => editor.crossText.set({ ...point("b", 0), contentKey: "stale" }, point("b", 1))).toThrow("stale");
    const view = editor.createView("other"), other = Object.values(view.state.nodes).find(n => n.contentKey === node("b").contentKey)!;
    expect(() => editor.crossText.set(point("b", 0), editor.crossText.position(other.key, 1))).toThrow("different views");
  });
  it("applies all ordinary styles and colours locally with atomic history and persistence", () => {
    const { editor, point } = setup([paragraph("a"), paragraph("b", ""), paragraph("c")]);
    editor.crossText.enable(true); editor.crossText.set(point("a", 2), point("c", 3));
    for (const type of [...annotationTools.map(t => t[0]), "text/colour", "text/background-colour"]) editor.crossText.annotate(type, type.startsWith("text/") ? "#123456" : undefined);
    const saved = editor.encodeDocument(), [a, b, c] = saved.children!;
    expect((a.standoffProperties as any[])).toHaveLength(annotationTools.length + 2); expect(b.standoffProperties).toBeUndefined();
    expect((a.standoffProperties as any[])[0]).toMatchObject({ start: 2, end: 6 });
    expect((c.standoffProperties as any[])[0]).toMatchObject({ start: 0, end: 2 });
    const revision = editor.repository.state.revision; editor.crossText.annotate("style/bold"); expect(editor.repository.state.revision).toBe(revision);
    const restored = new ReactiveEditor(saved); expect(restored.encodeDocument()).toEqual(saved); restored.dispose();
    editor.repository.undo(); expect(editor.crossText.range()).toBeUndefined();
    expect((editor.encodeDocument().children![0].standoffProperties as any[])).toHaveLength(annotationTools.length + 1);
    editor.repository.redo(); expect(editor.encodeDocument()).toEqual(saved);
  });
  it("rolls back a failed style command without damaging original annotations", () => {
    const { editor, point } = setup(); editor.crossText.enable(true); editor.crossText.set(point("a", 1), point("b", 3));
    const before = editor.encodeDocument(), original = editor.commands.setPayloadField.bind(editor.commands); let count = 0;
    vi.spyOn(editor.commands, "setPayloadField").mockImplementation((...args) => { if (++count === 2) throw new Error("failure"); original(...args); });
    expect(() => editor.crossText.annotate("style/bold")).toThrow("failure"); expect(editor.encodeDocument()).toEqual(before);
  });
  it("supports keyboard boundary extension, guards unsupported events and collapses with Escape", () => {
    const { editor, node, flow } = setup(); editor.crossText.enable(true);
    const mount = editor.mounts.get(node("a").key)!; mount.focus(); mount.restoreInlineSelection!({ anchor: 5, head: 7 });
    flow("a").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
    expect(editor.crossText.range()!.head.occurrenceKey).toBe(node("b").key);
    expect(flow("a").getAttribute("contenteditable")).toBe("false");
    const before = editor.encodeDocument();
    for (const type of ["beforeinput", "input", "compositionstart", "compositionend", "copy", "cut", "paste", "drop", "contextmenu"]) {
      const event = new Event(type, { bubbles: true, cancelable: true }); flow("a").dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    }
    expect(editor.encodeDocument()).toEqual(before);
    flow("a").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(editor.crossText.range()).toBeUndefined(); expect(flow("a").getAttribute("contenteditable")).toBe("true");
    expect(document.activeElement).toBe(flow("b"));
  });
  it("retains cross selection for toolbar styles, protects clear/layout actions and preserves local capture", () => {
    const { editor, point, flow, host, node } = setup(); editor.crossText.enable(true); flow("a").focus();
    editor.crossText.set(point("a", 1), point("b", 3));
    toolbarControl(host, '[data-annotation-type="style/bold"]').click();
    expect(editor.crossText.range()).toBeDefined();
    const before = editor.encodeDocument();
    toolbarControl(host, '[title="Clear formatting"]').click();
    toolbarControl(host, '[title="Increase indent"]').click();
    expect(editor.encodeDocument()).toEqual(before);
    editor.crossText.clear();
    const a = editor.mounts.get(node("a").key)!.inlineBoundary!(1), b = editor.mounts.get(node("b").key)!.inlineBoundary!(2);
    document.getSelection()!.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
    expect(editor.mounts.get(node("a").key)!.captureInlineSelection!()).toBeUndefined();
  });
  it("invalidates before external text/structural changes and when a selected occurrence is closed", async () => {
    const { editor, point, node, flow } = setup(); editor.crossText.enable(true); editor.crossText.set(point("a", 1), point("b", 3));
    editor.commands.replaceInlineRange(node("a").key, 0, 1, "changed"); expect(editor.crossText.range()).toBeUndefined();
    editor.crossText.set(point("a", 1), point("b", 3)); editor.viewVisibility.set(node("b").placementKey, true);
    await Promise.resolve(); expect(editor.crossText.range()).toBeUndefined();
  });
  it("retains inline atoms and semantic data, and transfers ownership to whole-Block selection", () => {
    const { editor, node, point } = setup([
      { ...paragraph("a"), standoffProperties: [{ id: "semantic", type: "codex/entity-reference", start: 0, end: 1, value: "entity-1", metadata: { name: "Example" } }] }, paragraph("b"),
    ]);
    editor.commands.insertInlineImage(node("a").key, 2, { assetId: "asset", src: "image.png", alt: "image" });
    const before = structuredClone(editor.repository.readState().contents[node("a").contentKey].payload.standoffProperties);
    editor.crossText.enable(true); editor.crossText.set(point("a", 1), point("b", 3)); editor.crossText.annotate("style/rectangle");
    expect((node("a").payload.standoffProperties as unknown[])[0]).toEqual((before as unknown[])[0]);
    expect(node("a").inlineContent.map(key => editor.node(key)!.viewType)).toContain("image-cell");
    expect(() => editor.crossText.annotate("codex/entity-reference")).toThrow("ordinary styles");
    editor.blockSelection.select(node("b").key); expect(editor.crossText.range()).toBeUndefined(); expect(editor.blockSelection.ids).toEqual(["b"]);
  });
  it("applies formatting and undoes it through platform key bindings", () => {
    const { editor, point, flow } = setup(); editor.crossText.enable(true); flow("a").focus();
    editor.crossText.set(point("a", 1), point("b", 2));
    const primary = /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    flow("a").dispatchEvent(new KeyboardEvent("keydown", { key: "b", ...primary, bubbles: true, cancelable: true }));
    expect((editor.encodeDocument().children![0].standoffProperties as any[])[0]).toMatchObject({ type: "style/bold", start: 1, end: 6 });
    flow("a").dispatchEvent(new KeyboardEvent("keydown", { key: "z", ...primary, bubbles: true, cancelable: true }));
    expect(editor.encodeDocument().children![0].standoffProperties).toBeUndefined(); expect(editor.crossText.range()).toBeUndefined();
  });
});

describe('two-stage Document Select All',()=>{
  const press=(target:Element,key='a',extra:KeyboardEventInit={})=>{
    const event=new KeyboardEvent('keydown',{key,metaKey:key==='a',bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event;
  };
  it.each(['metaKey','ctrlKey'])('selects the Block then visible nested Document text with %s, without enabling experimental gestures or editing',modifier=>{
    const f=setup([paragraph('a','Alpha'),{type:'container-block',children:[paragraph('b','Bravo')]},paragraph('hidden','Hidden'),paragraph('c','Charlie')]);
    f.editor.viewVisibility.set(f.node('hidden').placementKey, true);
    const mount=f.editor.mounts.get(f.node('b').key)!;mount.focus();mount.restoreInlineSelection!({anchor:1,head:1});
    const snapshot=vi.spyOn(f.editor.repository,'snapshot'),commit=vi.spyOn(f.editor.repository,'commit'),all=vi.spyOn(f.editor.crossText,'selectDocument');
    const revision=f.editor.repository.state.revision;
    press(f.flow('b'),'a',{metaKey:false,[modifier]:true});
    expect(mount.captureInlineSelection?.()).toEqual({anchor:0,head:5});expect(f.editor.crossText.range()).toBeUndefined();expect(all).not.toHaveBeenCalled();
    press(f.flow('b'),'a',{metaKey:false,[modifier]:true});
    expect(f.editor.crossText.selectedText()).toBe('Alpha\nBravo\nCharlie');
    expect(f.editor.crossText.enabled()).toBe(false);expect(localStorage.getItem(CROSS_TEXT_PREFERENCE_KEY)).not.toBe('true');
    const input=document.querySelector<HTMLTextAreaElement>('[data-cross-text-input]')!;expect(document.activeElement).toBe(input);expect(input.value).toBe('Alpha\nBravo\nCharlie');
    press(input,'a',{metaKey:false,[modifier]:true});expect(all).toHaveBeenCalledTimes(1);
    expect(snapshot).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();expect(f.editor.repository.state.revision).toBe(revision);
    press(input,'Escape',{metaKey:false});expect(f.editor.crossText.range()).toBeUndefined();expect(document.activeElement).toBe(f.flow('c'));
  });
  it('supports copy, formatting, replacement and Undo for an ordinary paragraph Document',()=>{
    const f=setup([paragraph('a','Alpha'),paragraph('b','Bravo')]);const mount=f.editor.mounts.get(f.node('a').key)!;
    mount.focus();mount.restoreInlineSelection!({anchor:0,head:5});press(f.flow('a'));
    const input=document.querySelector<HTMLTextAreaElement>('[data-cross-text-input]')!;
    const data=new Map<string,string>(),copy=new Event('copy',{bubbles:true,cancelable:true});
    Object.defineProperty(copy,'clipboardData',{value:{setData:(type:string,text:string)=>data.set(type,text)}});input.dispatchEvent(copy);
    expect(data.get('text/plain')).toBe('Alpha\nBravo');
    f.editor.crossText.annotate('style/bold');expect(f.node('b').payload.standoffProperties).toEqual([expect.objectContaining({type:'style/bold',start:0,end:4})]);
    input.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'Replacement',bubbles:true,cancelable:true}));
    expect(f.editor.encodeDocument().children!.map(b=>b.text)).toEqual(['Replacement']);
    f.editor.repository.undo();expect(f.editor.encodeDocument().children!.map(b=>b.text)).toEqual(['Alpha','Bravo']);
  });
  it('preserves structural replacement guards while selecting text across containers and media',()=>{
    const f=setup([paragraph('a','Alpha'),{type:'container-block',children:[paragraph('b','Bravo')]},paragraph('c','Charlie')]);
    const mount=f.editor.mounts.get(f.node('a').key)!;mount.focus();mount.restoreInlineSelection!({anchor:0,head:5});press(f.flow('a'));
    const commit=vi.spyOn(f.editor.repository,'commit');press(document.activeElement!,'Backspace',{metaKey:false});
    expect(commit).not.toHaveBeenCalled();expect(f.editor.crossText.selectedText()).toBe('Alpha\nBravo\nCharlie');expect(f.editor.crossText.message()).toMatch(/structural boundaries/);
  });
  it('leaves fields and composition native; held-key repeat does not expand; empty Blocks require two presses',()=>{
    const f=setup([paragraph('a',''),paragraph('b','Bravo')]);const mount=f.editor.mounts.get(f.node('a').key)!;mount.focus();mount.restoreInlineSelection!({anchor:0,head:0});
    press(f.flow('a'));expect(f.editor.crossText.range()).toBeUndefined();press(f.flow('a'),'a',{repeat:true});expect(f.editor.crossText.range()).toBeUndefined();
    mount.composing=true;expect(press(f.flow('a')).defaultPrevented).toBe(false);mount.composing=false;
    press(f.flow('a'));expect(f.editor.crossText.selectedText()).toBe('\nBravo');
    const field=f.host.appendChild(document.createElement('input'));field.focus();expect(press(field).defaultPrevented).toBe(false);expect(f.editor.crossText.range()).toBeUndefined();
  });
  it('invalidates the selection when a selected Block becomes hidden',async()=>{
    const f=setup();f.editor.crossText.selectDocument(f.node('a').key);f.editor.viewVisibility.set(f.node('b').placementKey, true);
    await Promise.resolve();expect(f.editor.crossText.range()).toBeUndefined();
  });
  it('releases Document selection on pointer placement even with experimental drag selection disabled',()=>{
    const f=setup();f.editor.crossText.selectDocument(f.node('a').key);
    f.flow('b').dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));
    expect(f.editor.crossText.range()).toBeUndefined();
    expect(f.editor.crossText.enabled()).toBe(false);
  });
});
