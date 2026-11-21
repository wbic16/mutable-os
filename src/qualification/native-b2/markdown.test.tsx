// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { registerApplicationViews } from "../../application/features";
import { ReactiveTreeView } from "../../rendering/reactive-tree-view";
import { decodeBlockTree } from "../../block-tree/codecs";
import { captureNative, nativeText, decodeNative } from "../native-b1/resource";
import { exportMarkdown, importMarkdown, resolveWiki, admitMarkdown } from "./markdown";
import { installMarkdownExperiment, convertCompletion } from "./input";
const targets = [{ documentId: "poe", blockId: "poe-root", title: "Poe", path: "Poe" }];
const cleanup: (() => void)[] = []; afterEach(() => { cleanup.splice(0).reverse().forEach(f => f()); document.body.replaceChildren(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const capture = (dto: any) => captureNative(decodeBlockTree(dto).state, dto.id);
function host(text = "", extra: any = {}) {
  const editor = new ReactiveEditor({ id: "doc", type: "document-block", children: [{ id: "text", type: "standoff-editor-block", text, ...extra }] });
  registerApplicationViews(editor); const projection = editor.createView("view");
  const root = document.body.appendChild(document.createElement("div"));
  cleanup.push(() => editor.dispose(), render(() => <ReactiveTreeView editor={editor} projection={projection} />, root), editor.installGateway(document));
  cleanup.push(installMarkdownExperiment(editor, document, id => id === "doc", () => targets));
  const node = () => Object.values(projection.state.nodes).find(n => n.payload.id === "text")!;
  const mount = () => editor.mounts.get(node().key)!;
  const value = () => node().inlineContent.map(k => editor.node(k)!.payload.text).join("");
  const type = async (data: string) => {
    const caret = node().inlineContent.length; mount().focus(); mount().restoreInlineSelection!({ anchor: caret, head: caret });
    mount().focusElement.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data })); await tick();
  };
  return { editor, projection, root, node, mount, value, type };
}
describe("B2 consumed Markdown", () => {
  it("reports rich table cells instead of silently flattening their semantics", () => {
    const dto = importMarkdown("| A | B |\n| --- | --- |\n| x | y |").document;
    const paragraph = dto.children![0].children![0].children![0].children![0].children![0];
    paragraph.blockProperties = [{ id: "heading", type: "block/font/size", value: "h1" }];
    const resource = capture(dto), before = nativeText(resource), projection = exportMarkdown(resource);
    expect(projection.diagnostics.some(d => d.code === "table-fallback")).toBe(true);
    expect(projection.text).toContain("# A");
    expect(nativeText(resource)).toBe(before);
  });
  it("imports/exports the four constructs using native text, annotations, h1 and rectangular tables", () => {
    const source = "# Heading\n\nA **bold** word and [[Poe]].\n\n| Name | Value |\n| --- | --- |\n| x | y |\n";
    const imported = importMarkdown(source, targets), r = capture(imported.document), before = nativeText(r);
    expect(exportMarkdown(r, targets).text).toBe(source.replace("[[Poe]].", "[[Poe]]\\."));
    expect(nativeText(r)).toBe(before);
    expect(imported.document.children![0].children![1].text).toBe("A bold word and Poe.");
    expect((imported.document.children![0].children![1].standoffProperties as any[]).map(p => p.type)).toEqual(["style/bold", "codex/block-reference"]);
    expect(imported.document.children![0].children![2]).toMatchObject({ type: "table-block", metadata: { headerRows: 1 } });
    const again = importMarkdown(exportMarkdown(r, targets).text, targets);
    expect(exportMarkdown(capture(again.document), targets).text).toBe(source.replace("[[Poe]].", "[[Poe]]\\."));
  });
  it("ambiguous/unresolved wiki and unsupported tables/code remain literal", () => {
    expect(resolveWiki("Poe", [...targets, { ...targets[0], documentId: "other" }])).toBeUndefined();
    const imported = importMarkdown("[[Missing]]\n\n```\n**code**\n```\n\n| a | b |\n| --- | --- |\n| uneven |", targets);
    expect(imported.document.children![0].children!.some(c => c.type === "table-block")).toBe(false);
    expect(imported.document.children![0].children!.find(c => c.text === "**code**")!.standoffProperties).toBeUndefined();
    expect(imported.diagnostics.map(d => d.code)).toContain("literal-table");
    expect(importMarkdown("\\**literal**").document.children![0].children![0].text).toBe("**literal**");
  });
  it("projects real rich native fixtures with diagnostics without changing any native bytes", () => {
    const r = decodeNative(new Uint8Array(readFileSync("artifacts/flint-b1.2/rich.mutable.json"))), before = nativeText(r);
    const projected = exportMarkdown(r, targets);
    expect(projected.diagnostics.length).toBeGreaterThan(4); expect(projected.text).toContain("A");
    expect(nativeText(r)).toBe(before); expect(exportMarkdown(r, targets)).toEqual(projected);
    expect(projected.diagnostics.some(d => d.code === "repeat-reference")).toBe(true);
    const owned = decodeNative(new Uint8Array(readFileSync("artifacts/flint-b1.2/a.mutable.json")));
    expect(exportMarkdown(owned).diagnostics.some(d => d.code === "owned-resource-link")).toBe(true);
  });
  it("degrades overlaps and rich tables to readable native content", () => {
    const r = capture({ id: "d", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "abc", standoffProperties: [{ type: "style/bold", start: 0, end: 1 }, { type: "style/bold", start: 1, end: 2 }] }] });
    expect(exportMarkdown(r)).toMatchObject({ text: "abc\n", diagnostics: [expect.objectContaining({ code: "annotation-overlap" })] });
  });
  it.each([['**bold*','*','bold','style/bold'], ['[[Poe]',']','Poe','codex/block-reference']])("consumes %s with one conversion Undo/Redo", async (literal, trigger, expected, type) => {
    const f = host(literal); await tick(); await f.type(trigger);
    expect(f.value()).toBe(expected); expect((f.node().payload.standoffProperties as any[])[0].type).toBe(type);
    f.editor.repository.undo(); await tick(); expect(f.value()).toBe(literal + trigger);
    await tick(); expect(f.value()).toBe(literal + trigger); // no replay recognition
    f.editor.repository.redo(); expect(f.value()).toBe(expected);
  });
  it("maps Unicode Cells and existing annotations while removing only syntax", async () => {
    const f = host("X **😀é*", { standoffProperties: [{ id: "old", type: "style/italic", start: 4, end: 6 }] }); await tick(); await f.type("*");
    expect(f.value()).toBe("X 😀é");
    expect(f.node().payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({ id: "old", start: 2, end: 4 }), expect.objectContaining({ type: "style/bold", start: 2, end: 4 })]));
    f.editor.repository.undo(); expect(f.value()).toBe("X **😀é**");
  });
  it("consumes # space into native h1 and restores it on Undo", async () => {
    const f = host("#"); await tick(); await f.type(" "); expect(f.value()).toBe("");
    expect(f.node().payload.blockProperties).toEqual([expect.objectContaining({ type: "block/font/size", value: "h1" })]);
    f.editor.repository.undo(); expect(f.value()).toBe("# ");
    f.editor.repository.redo(); expect(f.value()).toBe("");
  });
  it("does not convert composition, native controls, escaped, incomplete or code input", async () => {
    for (const [text, extra] of [["\\**x*", {}], ["**x", {}], ["**x*", { metadata: { code: true } }]] as const) {
      const f = host(text, extra); await tick(); await f.type("*"); expect(f.node().payload.standoffProperties ?? []).toHaveLength(0);
    }
    const f = host("**IME**"); await tick(); f.mount().composing = true;
    expect(convertCompletion(f.editor, f.node().key, 7, targets)).toBe(false); f.mount().composing = false;
    const field = f.root.appendChild(document.createElement("input")); field.value = "**x*"; field.focus();
    field.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "*" })); await tick(); expect(f.value()).toBe("**IME**");
  });
  it("Markdown admission always creates a new candidate identity", () => {
    const editor = new ReactiveEditor({ id: "workspace", type: "workspace-block", children: [{ id: "bank", type: "workspace-object-bank-block", children: [] }] }); cleanup.push(() => editor.dispose());
    const bank = Object.values(editor.repository.state.contents).find(c => c.payload.id === "bank")!;
    const a = admitMarkdown(editor.repository, bank.key, "**Imported**"), before = nativeText(captureNative(editor.repository.snapshot(), a.resourceId));
    const b = admitMarkdown(editor.repository, bank.key, "**Imported**"); expect(a.resourceId).not.toBe(b.resourceId);
    expect(nativeText(captureNative(editor.repository.snapshot(), a.resourceId))).toBe(before);
  });
});
