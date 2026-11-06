import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { matchSources } from "./search-matching";
import { resolveSearchScope, TextSearch } from "./text-search";
import { SessionDecorations } from "./session-decorations";
const cleanup: (() => void)[] = [];
it('publishes only affected decoration owners/nodes, preserving tie order and terminal invalidation', () => {
  const d=new SessionDecorations();
  const range=(nodeKey:string)=>({nodeKey,contentKey:nodeKey,placementKey:nodeKey,version:0,start:0,end:1,coordinate:'cell' as const});
  d.attachRanges('unrelated',[range('other')]);
  const layers=(d as any).owners as Map<string,any>, unrelated=layers.get('unrelated');
  const matches=unrelated.matches, reads=vi.fn(()=>matches);
  Object.defineProperty(unrelated,'matches',{configurable:true,get:reads});
  d.attachRanges('a',[range('text')]); d.attachRanges('b',[range('text')]);
  d.setActiveMatch('a','a'); expect(d.nodes.text.map(item=>item.owner)).toEqual(['a','b']);
  expect(reads).not.toHaveBeenCalled();
  d.setHighlightsVisible('a',false); d.invalidateContent('text'); d.setHighlightsVisible('a',true);
  expect(d.nodes.text).toEqual([]);
  d.removeOccurrence('text'); d.attachRanges('b',[range('text')]);
  expect(d.nodes.text.map(item=>item.owner)).toEqual(['b']);
  d.dispose();
});
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); });
function setup(size = 2) {
  const editor = new ReactiveEditor({ type: "document-block", children: [
    { id: "page", type: "page-block", children: [
      ...Array.from({ length: size }, (_, i) => ({ id: `p${i}`, type: "standoff-editor-block", text: "Hello 😀 world", ...(i === 0 ? { relation: { leftMargin: { id: "margin", type: "left-margin-block", children: [{ id: "note", type: "standoff-editor-block", text: "Hello note" }] } } } : {}) })),
      { type: "tab-row-block", children: [{ type: "tab-block", children: [] }, { id: "tab", type: "tab-block", children: [{ id: "hidden", type: "standoff-editor-block", text: "Hello hidden" }] }] },
      { type: "grid-block", children: [{ type: "grid-row-block", children: [{ id: "cell", type: "grid-cell-block", children: [{ id: "cellText", type: "plain-text-block", text: "Hello cell" }] }] }] },
    ] }, { id: "page2", type: "page-block", children: [{ id: "p2text", type: "standoff-editor-block", text: "Hello page two" }] },
  ] });
  const view = editor.createView("search-test"), node = (id: string) => Object.values(view.state.nodes).find(n => n.payload.id === id)!;
  const runner = vi.fn(async (sources: Parameters<typeof matchSources>[0], query: string, options: Parameters<typeof matchSources>[2]) => matchSources(sources, query, options));
  const search = new TextSearch(editor, runner);
  cleanup.push(() => { search.dispose(); editor.dispose(); });
  return { editor, node, search, runner };
}
const literal = (text: string, query: string, options = {}) => matchSources([{ contentKey: "x", coordinate: "utf16", version: 0, runs: [{ text }] }], query, options)[0];
describe("scoped text search", () => {
  it("matches literal punctuation, whitespace, case and nonoverlapping substrings", () => {
    expect(literal("A.b aXb a.b", "a.b").matches.map(m => m.start)).toEqual([0,8]);
    expect(literal("A a", "a", { matchCase: true }).matches).toHaveLength(1);
    expect(literal("  x  ", "  ").matches).toHaveLength(2);
    expect(literal("aaaa", "aa").matches).toHaveLength(2);
    expect(literal("abc", "").matches).toHaveLength(0);
  });
  it("uses Unicode word segmentation and preserves capture groups", () => {
    expect(literal("he the her HE", "he", { wholeWords: true }).matches.map(m => m.start)).toEqual([0,11]);
    expect(literal("can't can can-do", "can", { wholeWords: true }).matches).toHaveLength(2);
    expect(literal("你好 世界", "世界", { wholeWords: true }).matches).toHaveLength(1);
    const match = literal("Hello 42", "(?<word>\\w+) (\\d+)", { regex: true }).matches[0];
    expect(match.groups).toEqual({ word: "Hello" }); expect(match.captures).toEqual(["Hello", "42"]);
    expect(literal("e\u0301", "e").matches[0].actionable).toBe(false);
    expect(literal("😀", "(?=.)", { regex: true }).zeroWidth).toBe(1);
    expect(() => literal("abc", "[", { regex: true })).toThrow();
  });
  it("includes margins, cells and inactive tabs in Page, excludes margins from main Container", async () => {
    const { editor, node, search } = setup();
    const run = (id: string, kind: "page" | "container" | "document") => search.searchText({ query: "hello", scope: resolveSearchScope(editor, node(id).key, kind) });
    const page = await run("p0", "page"); expect(page.matches).toHaveLength(5);
    expect((await run("p0", "container")).matches).toHaveLength(4);
    expect((await run("p0", "document")).matches).toHaveLength(6);
    expect((await run("note", "container")).matches).toHaveLength(1);
    expect((await run("cellText", "container")).scope.rootKey).toBe(node("cell").key);
    expect((await run("hidden", "container")).scope.rootKey).toBe(node("tab").key);
    expect(page.matches.find(m => m.text && m.ranges[0].nodeKey === node("cellText").key)?.capabilities.highlight).toBe(false);
    expect(Object.isFrozen(page.matches[0].ranges[0])).toBe(true);
    expect(editor.repository.canUndo()).toBe(false);
  });
  it("maps emoji UTF-16 offsets into Cell boundaries", async () => {
    const { editor, node, search } = setup();
    const result = await search.searchText({ query: "😀 world", scope: resolveSearchScope(editor, node("p0").key) });
    expect(result.matches[0].ranges[0]).toMatchObject({ start: 6, end: 13, coordinate: "cell" });
  });
  it("does no search or snapshots synchronously on edit; only rematches dirty content", async () => {
    const { editor, node, search, runner } = setup(300), scope = resolveSearchScope(editor, node("p0").key);
    const initial = await search.searchText({ query: "Hello", scope });
    editor.decorations.attachMatches("find", initial);
    const snapshot = vi.spyOn(editor.repository, "snapshot"); runner.mockClear();
    editor.commands.replaceInlineRange(node("p0").key, 0, 0, "New ");
    expect(runner).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
    expect(editor.decorations.nodes[node("p0").key]).toEqual([]);
    expect(editor.decorations.nodes[node("p1").key]).toHaveLength(1);
    const updated = await search.searchText({ query: "Hello", scope });
    expect(runner).toHaveBeenCalledTimes(1); expect(runner.mock.calls[0][0]).toHaveLength(1);
    expect(updated.matches[0].ranges[0].start).toBe(4); expect(snapshot).not.toHaveBeenCalled();
    editor.repository.undo(); expect((await search.searchText({ query: "Hello", scope })).matches[0].ranges[0].start).toBe(0);
  });
  it("isolates owners and visibility and never serializes decorations", async () => {
    const { editor, node, search } = setup(), before = editor.encodeDocument();
    const result = await search.searchText({ query: "Hello", scope: resolveSearchScope(editor, node("p0").key) });
    const decorations = new SessionDecorations(), key = node("p0").key, id = result.matches[0].id;
    decorations.attachMatches("a", result); decorations.attachMatches("b", result);
    decorations.setHighlightsVisible("a", false); expect(decorations.nodes[key]).toHaveLength(1);
    decorations.setHighlightsVisible("a", true); decorations.setMatchVisible("a", id, false); expect(decorations.nodes[key]).toHaveLength(1);
    decorations.setMatchVisible("a", id, true); decorations.setActiveMatch("a", id); expect(decorations.nodes[key].some(d => d.active)).toBe(true);
    decorations.disposeSession("a"); expect(decorations.nodes[key][0].owner).toBe("b");
    decorations.setHighlightsVisible("b", false); decorations.invalidateContent(node("p0").contentKey); decorations.setHighlightsVisible("b", true); expect(decorations.nodes[key]).toHaveLength(0);
    expect(editor.encodeDocument()).toEqual(before); expect(editor.repository.canUndo()).toBe(false);
  });
  it("reports stale, cancelled and invalid results without highlights", async () => {
    const { editor, node, search } = setup(), scope = resolveSearchScope(editor, node("p0").key);
    expect((await search.searchText({ query: "[", options: { regex: true }, scope })).status).toBe("error");
    const controller = new AbortController(); controller.abort();
    expect((await search.searchText({ query: "Hello", scope, signal: controller.signal })).status).toBe("cancelled");
  });
  it("treats inline atoms as barriers and deduplicates targets without losing occurrences", async () => {
    const { editor, node, search } = setup();
    editor.commands.insertInlineImage(node("p0").key, 2, { assetId: "atom", src: "/test.png", alt: "not searchable" });
    const scope = resolveSearchScope(editor, node("p0").key);
    const result = await search.searchText({ query: "Hello", scope });
    expect(result.matches.some(m => m.ranges[0].nodeKey === node("p0").key)).toBe(false);
    editor.commands.transclude(node("p1").key, { kind: "at", parentKey: node("page").key, index: 1 });
    const repeated = await search.searchText({ query: "Hello", scope });
    const occurrences = repeated.matches.filter(m => m.ranges[0].contentKey === node("p1").contentKey);
    expect(occurrences).toHaveLength(2); expect(occurrences[0].ranges[0].nodeKey).not.toBe(occurrences[1].ranges[0].nodeKey);
    expect(Object.values(repeated.deduplication).some(ids => ids.length === 2)).toBe(true);
  });
  it("falls back explicitly without a Page and stops at nested documents and unsupported widgets", async () => {
    const editor = new ReactiveEditor({ type: "document-block", children: [
      { id: "text", type: "standoff-editor-block", text: "Hello" },
      { type: "document-block", children: [{ type: "standoff-editor-block", text: "Hello nested" }] },
      { type: "code-mirror-block", text: "Hello code" },
    ] });
    const view = editor.createView("fallback"), search = new TextSearch(editor, async (sources,query,options) => matchSources(sources,query,options));
    cleanup.push(() => editor.dispose());
    const scope = resolveSearchScope(editor, view.state.nodes[view.state.rootKey].children[0]);
    expect(scope.fallback).toContain("No enclosing Page");
    const result = await search.searchText({ scope, query: "Hello" });
    expect(result.matches).toHaveLength(1); expect(result.status).toBe("partial"); expect(result.diagnostics.join()).toContain("code-mirror-block");
  });
  it("caps results explicitly and rejects a response produced during an edit", async () => {
    expect(matchSources([{ contentKey: "x", coordinate: "utf16", version: 0, runs: [{ text: "a".repeat(10) }] }], "a", {}, 3)[0]).toMatchObject({ truncated: true, matches: expect.any(Array) });
    const { editor, node } = setup();
    let finish!: (results: ReturnType<typeof matchSources>) => void;
    const search = new TextSearch(editor, (sources, query, options) => new Promise(resolve => { finish = () => resolve(matchSources(sources,query,options)); }));
    const pending = search.searchText({ query: "Hello", scope: resolveSearchScope(editor,node("p0").key) });
    while (!finish) await Promise.resolve();
    editor.commands.replaceInlineRange(node("p0").key,0,0,"New "); finish([]);
    expect((await pending).status).toBe("cancelled"); search.dispose();
  });
  it("does not reuse a cached revision after undo and a different edit branch", async () => {
    const { editor, node, search } = setup(), scope = resolveSearchScope(editor, node("p0").key);
    editor.commands.replaceInlineRange(node("p0").key, 0, 5, "Wrong");
    await search.searchText({ query: "Wrong", scope });
    editor.repository.undo(); editor.commands.replaceInlineRange(node("p0").key, 0, 5, "Right");
    expect((await search.searchText({ query: "Wrong", scope })).matches).toHaveLength(0);
    expect((await search.searchText({ query: "Right", scope })).matches).toHaveLength(1);
  });
});
it('searches authored source once in UTF16 without activating source annotations or interpreting preview syntax',async()=>{
 const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'source',type:'mutable/html-source-block',text:'<b>Rome</b>\r\nRome',sourceFormat:{version:1,format:'html',profile:'mutable-html-source-v1'}}]}),view=editor.createView(),node=Object.values(view.state.nodes).find(n=>n.payload.id==='source')!;
 const search=new TextSearch(editor,async(s,q,o)=>matchSources(s,q,o));cleanup.push(()=>{search.dispose();editor.dispose();});
 const results=await search.searchText({query:'Rome',scope:resolveSearchScope(editor,node.key,'document')});expect(results.matches).toHaveLength(2);expect(results.matches.map(m=>m.ranges[0].start)).toEqual([3,13]);expect(results.matches.every(m=>!m.capabilities.annotate&&!m.capabilities.highlight&&m.ranges[0].coordinate==='utf16')).toBe(true);
 const markup=await search.searchText({query:'<b>',scope:resolveSearchScope(editor,node.key,'document')});expect(markup.matches).toHaveLength(1);expect(editor.repository.state.revision).toBe(0);
});
it('returns canonical annotation-range versions after edits while retaining independent cache epochs',async()=>{
 const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'he he'}]}),view=editor.createView(),node=Object.values(view.state.nodes).find(n=>n.payload.id==='text')!;
 editor.commands.replaceInlineRange(node.key,0,2,'she');
 const search=new TextSearch(editor,async(s,q,o)=>matchSources(s,q,o));
 try {
  const result=await search.searchText({query:'he',scope:resolveSearchScope(editor,node.key,'document')});
  expect(result.matches).toHaveLength(2);
  expect(()=>editor.textRanges.validate(result.matches.flatMap(m=>m.ranges),'cell')).not.toThrow();
  editor.linkedAnnotations.createBatch(result.matches.map(m=>m.ranges),'codex/entity-reference','entity',{},result.revision,'Reviewed matches');
  expect((node.payload.standoffProperties as unknown[]).length).toBe(2);
  editor.repository.undo();expect(node.payload.standoffProperties??[]).toHaveLength(0);
 }finally{search.dispose();editor.dispose();}
});
