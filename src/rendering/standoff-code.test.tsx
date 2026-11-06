// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { analyseCode, codeSyntaxDiagnostics, STANDOFF_CODE } from '../runtime/standoff-code';
import { blockMenuItems } from '../runtime/block-menu-actions';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(stop => stop()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const line = (text: string, id: string) => ({ type: 'standoff-editor-block', id, text });
function setup(direct = true, enabled = true) {
  const editor = new ReactiveEditor({ type: 'document-block', id: 'doc', children: [
    { type: STANDOFF_CODE, id: 'code', metadata: { markdownCode: { language: 'typescript' } }, children: [
      { ...line('const smile: string = "😀";', 'a'), standoffProperties: [{ type: 'style/bold', start: 0, end: 4 }] },
      line('/* multiline', 'b'), line('comment */ const n = 42;', 'c'),
    ] }, line('unrelated', 'other'),
  ] }, { features: { directDomCharacterCells: direct, standoffCodeHighlighting: enabled } });
  registerCoreViews(editor); const projection = editor.createView('code-test');
  const node = (id: string) => Object.values(projection.state.nodes).find(node => node.payload.id === id)!;
  const host = document.body.appendChild(document.createElement('div'));
  cleanups.push(() => editor.dispose());
  const unmount = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); cleanups.push(unmount);
  const metric = () => codeSyntaxDiagnostics.get(editor)?.get(node('code').key);
  return { editor, projection, node, host, metric, unmount };
}
it.each(['javascript', 'typescript'])('maps %s multiline tokens across blocks and embedded newlines without splitting Unicode Cells', language => {
  const blocks = ['const x = "😀"; /* a', 'b\nc */ const y = 4;'].map((text, i) => ({ key: String(i), version: 0, cells: [...text] }));
  const result = analyseCode(blocks, language);
  const strings = result.tokens[0].filter(token => token.classes.includes('syntax-string'));
  expect(strings).toHaveLength(1);
  expect(blocks[0].cells.slice(strings[0].start, strings[0].end).join('')).toBe('"😀"');
  expect(result.tokens[1][0]).toMatchObject({ start: 0, end: 6, classes: ['syntax-comment'] });
  expect(analyseCode(blocks, 'unavailable').tokens).toEqual([[], []]);
  const template = ['const text = `first', 'second`;'].map((text, i) => ({ key: String(i), version: 0, cells: [...text] }));
  expect(analyseCode(template, language).tokens[1].some(token => token.start === 0 && token.classes.some(name => name.startsWith('syntax-string')))).toBe(true);
});
it.each([false, true])('uses the existing renderer, retains Cells and annotations, and publishes only changed TextBlocks (direct=%s)', async direct => {
  const f = setup(direct), r = f.editor.repository;
  const revision = r.state.revision, snapshot = vi.spyOn(r, 'snapshot');
  const builds = vi.spyOn(f.projection as any, 'build'), references = vi.spyOn(r as any, 'rebuildReferences');
  await vi.waitFor(() => expect(f.metric()?.blocks).toBe(3));
  expect(f.host.querySelector('.syntax-keyword')?.textContent).toBe('c');
  expect(r.state.revision).toBe(revision); expect(snapshot).not.toHaveBeenCalled();
  const a = f.node('a'), c = f.node('c'), cell = f.host.querySelector('.syntax-keyword');
  const other = f.editor.temporaryRanges.createCollection('unrelated-owner');
  other.replace([{ id: 'other', range: f.editor.textRanges.snapshot(f.node('other').key, 0, 2), renderers: [] }]);
  const cRanges = f.editor.decorations.nodes[c.key], otherRanges = f.editor.decorations.nodes[f.node('other').key];
  const before = f.metric()!.analyses;
  f.editor.commands.replaceInlineRange(a.key, 6, 11, 'face');
  await vi.waitFor(() => expect(f.metric()!.analyses).toBeGreaterThan(before));
  expect(f.metric()!.blocks).toBe(1);
  expect(f.editor.decorations.nodes[c.key]).toBe(cRanges);
  expect(f.editor.decorations.nodes[f.node('other').key]).toBe(otherRanges);
  expect(f.host.querySelector('.syntax-keyword')).toBe(cell);
  expect(f.node('a').payload.standoffProperties).toHaveLength(1);
  expect(snapshot).not.toHaveBeenCalled();
  expect(builds).not.toHaveBeenCalled(); expect(references).not.toHaveBeenCalled();
  f.editor.repository.undo(); await vi.waitFor(() => expect(f.editor.decorations.nodes[a.key]?.length).toBeGreaterThan(0));
  expect(f.node('a').inlineContent.map(key => f.editor.node(key)!.payload.text).join('')).toContain('smile');
  const analyses = f.metric()!.analyses;
  f.editor.commands.replaceInlineRange(f.node('other').key, 0, 0, '!');
  await new Promise(resolve => setTimeout(resolve, 45)); expect(f.metric()!.analyses).toBe(analyses);
  f.unmount(); expect(f.editor.decorations.nodes[a.key]).toEqual([]); other.dispose();
});
it('clears unsupported language, restores on Undo, and offers creation through the existing menu', async () => {
  const f = setup(); await vi.waitFor(() => expect(f.metric()).toBeTruthy());
  const menu = blockMenuItems(f.editor, f.node('a').key).find(item => item.label === 'Add Block');
  expect(menu?.children?.find(item => item.label === 'Standoff code')?.children).toHaveLength(2);
  const select = f.host.querySelector('select')!; select.value = 'plain'; select.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(f.metric()!.ranges).toBe(0));
  f.editor.repository.undo(); await vi.waitFor(() => expect(f.metric()!.ranges).toBeGreaterThan(0));
});
it('updates subsequent TextBlocks when a multiline delimiter changes', async () => {
  const f = setup(); await vi.waitFor(() => expect(f.metric()).toBeTruthy());
  const before = f.metric()!.analyses, unchanged = f.editor.decorations.nodes[f.node('a').key];
  f.editor.commands.replaceInlineRange(f.node('b').key, 0, 2, '');
  await vi.waitFor(() => expect(f.metric()!.analyses).toBeGreaterThan(before));
  expect(f.metric()!.blocks).toBe(2); expect(f.editor.decorations.nodes[f.node('a').key]).toBe(unchanged);
  expect(f.editor.decorations.nodes[f.node('c').key][0].temporary?.renderers?.[0].params?.classes).not.toContain('syntax-comment');
});
it('keeps existing code editable with the feature disabled', async () => {
  const f = setup(true, false);
  expect(f.host.querySelectorAll('[contenteditable=true]')).toHaveLength(4);
  await new Promise(resolve => setTimeout(resolve, 40)); expect(f.metric()).toBeUndefined();
});
it('keeps shared occurrences independent and regenerates after save/reload without persisting syntax', async () => {
  const f = setup(); await vi.waitFor(() => expect(f.metric()).toBeTruthy());
  const placement = f.editor.commands.transclude(f.node('code').key, { kind: 'at', parentKey: f.node('doc').key, index: 1 });
  const shared = f.editor.nodeForPlacementInView(placement, f.node('doc').viewId)!;
  await vi.waitFor(() => expect(codeSyntaxDiagnostics.get(f.editor)?.size).toBe(2));
  const saved = f.editor.encodeDocument(); expect(JSON.stringify(saved)).not.toContain('syntax-keyword');
  const reloaded = new ReactiveEditor(saved); cleanups.push(() => reloaded.dispose());
  expect(reloaded.encodeDocument()).toEqual(saved);
  f.editor.commands.remove(shared.key);
  await vi.waitFor(() => expect(codeSyntaxDiagnostics.get(f.editor)?.size).toBe(1));
  expect(f.editor.decorations.nodes[f.node('a').key].length).toBeGreaterThan(0);
});
