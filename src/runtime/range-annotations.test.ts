import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { RangeAnnotations } from "./range-annotations";
import { mergeTextRanges, TextRanges, type TextRangeSnapshot } from "./text-ranges";

const editors: ReactiveEditor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.dispose()));
function fixture() {
  const editor = new ReactiveEditor({ type: "document-block", children: [
    { id: "a", type: "standoff-editor-block", text: "a😀bcde" },
    { id: "b", type: "standoff-editor-block", text: "second" },
    { id: "plain", type: "plain-text-block", text: "a😀bc" },
  ] });
  editors.push(editor); const view = editor.createView("ranges");
  const node = (id: string) => Object.values(view.state.nodes).find(node => node.payload.id === id)!;
  return { editor, view, a: node("a"), b: node("b"), plain: node("plain") };
}
describe("neutral range and annotation boundary", () => {
  it("keeps cell and UTF-16 coordinates distinct and validates before writing any range", () => {
    const { editor, a, b, plain } = fixture();
    const cell = editor.textRanges.snapshot(a.key, 1, 2), utf16 = editor.textRanges.snapshot(plain.key, 1, 3);
    expect(cell.coordinate).toBe("cell"); expect(utf16.coordinate).toBe("utf16");
    const before = editor.encodeDocument();
    for (const invalid of [{ ...cell, start: -1 }, { ...cell, end: 99 }, { ...cell, start: 0.5 }, { ...cell, end: cell.start },
      { ...cell, version: -1 }, { ...cell, placementKey: "missing" }, { ...cell, contentKey: "missing" }, utf16]) {
      expect(() => editor.rangeAnnotations.apply([editor.textRanges.snapshot(b.key, 0, 2), invalid], "style/bold")).toThrow();
      expect(editor.encodeDocument()).toEqual(before);
    }
    const result = editor.rangeAnnotations.apply([cell], "style/bold", undefined, { start: 99, end: 99, type: "invalid" });
    expect(result.added).toBe(1); expect(a.payload.standoffProperties).toEqual([expect.objectContaining({ start: 1, end: 1, type: "style/bold" })]);
    editor.commands.replaceInlineRange(a.key, 0, 0, "x"); expect(() => editor.textRanges.validate([cell])).toThrow("stale");
  });
  it("deduplicates shared content, returns existing references and undoes a batch atomically", () => {
    const { editor, view, a, b } = fixture();
    const placement = editor.commands.transclude(a.key, { kind: "after", anchorKey: b.key });
    const alias = editor.nodeForPlacementInView(placement, view.viewId)!;
    const before = editor.encodeDocument();
    const ranges = [editor.textRanges.snapshot(a.key, 0, 2), editor.textRanges.snapshot(alias.key, 0, 2), editor.textRanges.snapshot(b.key, 1, 4)];
    const first = editor.rangeAnnotations.apply(ranges, "style/highlight");
    expect(first.added).toBe(2); expect(first.references).toHaveLength(2); expect(a.payload.standoffProperties).toHaveLength(1);
    const second = editor.rangeAnnotations.apply(ranges, "style/highlight"); expect(second.added).toBe(0); expect(second.references).toEqual(first.references);
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
    expect(mergeTextRanges([ranges[0], { ...ranges[1], start: 1, end: 4 }, { ...ranges[0], start: 4, end: 5 }])).toEqual([{ ...ranges[0], end: 5 }]);
  });
  it("ordinary annotation application works independently of Grouping and visibility response", () => {
    const { editor, a } = fixture();
    const ranges = [editor.textRanges.snapshot(a.key, 0, 2)];
    const annotations = new RangeAnnotations({ ranges: editor.textRanges, properties: () => [], write: () => {}, transaction: (_, apply) => apply() });
    const result = annotations.apply(ranges, "style/show-hide");
    expect(result.references).toHaveLength(1); expect(editor.showHide.selectionActive()).toBe(false);
    editor.rangeAnnotations.apply(ranges, "style/show-hide"); expect(editor.showHide.selectionActive()).toBe(true);
    expect(editor.currentTextOperation.active()).toBeUndefined();
  });
  it("queries structural ancestry and owned relations without importing a feature", () => {
    const { editor, view, a, b } = fixture();
    expect(editor.blockQueries.ancestorPath(a.key).map(node => node.key)).toEqual([view.state.rootKey, a.key]);
    expect(editor.blockQueries.ancestors(a.key).map(node => node.key)).toEqual([a.key, view.state.rootKey]);
    expect(editor.blockQueries.documentScope(a.key)).toBe(view.state.rootKey);
    expect(editor.blockQueries.contains(a.key, b.key)).toBe(false);
    expect(editor.blockQueries.contains(view.state.rootKey, a.key)).toBe(true);
    expect(editor.blockQueries.ancestorPath("missing")).toEqual([]);
  });
  it("rejects a missing occurrence even if identical content survives elsewhere", () => {
    let live = true;
    const range: TextRangeSnapshot = { nodeKey: "one", contentKey: "shared", placementKey: "first", version: 1, coordinate: "cell", start: 0, end: 2 };
    const ranges = new TextRanges(() => live ? { ...range, length: 3 } : undefined);
    ranges.validate([range]); live = false; expect(() => ranges.validate([range])).toThrow("stale");
  });
});

it.each([false,true])('keeps formatting batches bounded across one or several text owners (multiple=%s)',multiple=>{
 const {editor,view,a,b}=fixture();
 const snapshots=vi.spyOn(editor.repository,'snapshot'), rebuild=vi.spyOn(view as any,'build'),references=vi.spyOn(editor.repository as any,'rebuildReferences');
 const ranges=[editor.textRanges.snapshot(a.key,0,2),...(multiple?[editor.textRanges.snapshot(b.key,1,3)]:[])];
 editor.rangeAnnotations.apply(ranges,'style/bold');
 expect(a.payload.standoffProperties).toHaveLength(1);if(multiple)expect(b.payload.standoffProperties).toHaveLength(1);
 editor.repository.undo();expect(a.payload.standoffProperties??[]).toHaveLength(0);if(multiple)expect(b.payload.standoffProperties??[]).toHaveLength(0);
 editor.repository.redo();expect(a.payload.standoffProperties).toHaveLength(1);
 expect(snapshots).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();expect(references).not.toHaveBeenCalled();
});
