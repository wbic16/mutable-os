import { describe, expect, it, vi } from 'vitest';
import { importMarkdown } from './markdown-import';
import { exportClipboard, importClipboard } from './transport';
import { fragmentText, plainFragment } from './serializer';
import { preparePaste } from './prepare';
import { materializeFragment } from './materialize';
import { LIMITS, type MutableFragment } from './fragment';

const block = (f: MutableFragment, edge: string) => f.blocks.find(b => b.localId === (f.placements.find(p => p.localId === edge)!.target as { id: string }).id)!;
const roots = (f: MutableFragment) => f.roots.map(r => block(f, r.placement));
const inlineText = (b: MutableFragment['blocks'][number]) => b.inline?.atoms.map(a => a.kind === 'text' ? a.text : '\uFFFC').join('');

describe('explicit CommonMark and GFM table import', () => {
  it('decodes entities, escapes, nested marks and Unicode scalar ranges', () => {
    const f = importMarkdown('**A😀*é*Z** &amp; \\*literal\\*').fragment!, b = roots(f)[0];
    expect(inlineText(b)).toBe('A😀éZ & *literal*');
    expect(b.inline!.properties.map(p => [p.type, p.startIndex, p.endIndex])).toEqual([['style/bold', 0, 5], ['style/italics', 2, 4]]);
    expect(f.roots[0]).toMatchObject({ openStart: false, openEnd: false });
  });
  it('preserves headings, soft/hard breaks and code whitespace with inert language metadata', () => {
    const result = importMarkdown('Title\n=====\n\n## second\n\nsoft\nline  \nhard\n\n```js example\na  <b>\n  b\n```\n\n`a  b`'), f = result.fragment!;
    expect(roots(f).map(inlineText)).toEqual(['Title', 'second', 'soft line\nhard', 'a  <b>\n  b', 'a  b']);
    expect(roots(f)[0].blockProperties[0].type).toBe('block/font/size/h1');
    expect(roots(f)[1].blockProperties[0].type).toBe('block/font/size/h2');
    expect(roots(f)[3].data.metadata).toMatchObject({ markdownCode: { language: 'js', meta: 'example' } });
  });
  it('uses native nested lists and tables, with an ordered start and header cells', () => {
    const result = importMarkdown('3. three\n4. four\n   - nested\n\n| A | B |\n| :- | -: |\n| **x** | y |'), f = result.fragment!;
    const [list, table] = roots(f);
    expect(list.type).toBe('indented-list-block'); expect(list.data.metadata).toMatchObject({ htmlList: { ordered: true, start: 3 } });
    const second = block(f, list.children[1]); expect(block(f, second.children[1]).type).toBe('indented-list-block');
    expect(table.type).toBe('table-block'); expect(table.children).toHaveLength(2);
    const header = block(f, block(f, table.children[0]).children[0]);
    expect(header.data.metadata).toMatchObject({ htmlTableCell: { header: true } });
    expect(result.notice).toContain('Table alignment');
  });
  it('resolves reference definitions with first-definition semantics and rejects unsafe links', () => {
    const f = importMarkdown('[ok][ID] [bad](javascript:alert%281%29) <https://example.com>\n\n[id]: https://example.org "first"\n[id]: https://bad.invalid').fragment!;
    const properties = roots(f)[0].inline!.properties;
    expect(properties.map(p => p.target)).toEqual([{ kind: 'url', url: 'https://example.org' }, { kind: 'url', url: 'https://example.com' }]);
    expect(fragmentText(f)).toBe('ok bad https://example.com');
  });
  it('keeps image positions and metadata as inert descriptors, including reference images', () => {
    const f = importMarkdown('A![map][img]B ![local](../map.png) ![bad](data:image/png;base64,AA)\n\n[img]: https://clipboard-probe.invalid/map.png "Map"').fragment!;
    expect(inlineText(roots(f)[0])).toBe('A\uFFFCB \uFFFC \uFFFC');
    expect(f.embeds[0].data).toEqual({ src: 'https://clipboard-probe.invalid/map.png', alt: 'map', title: 'Map' });
    expect(f.embeds[1].data.relativeSource).toBe('../map.png'); expect(f.embeds[2].data.src).toBe('');
    const native = materializeFragment(f, { cavernId: 'local' });
    expect(Object.values(native.state.contents).filter(c => c.viewType === 'image-cell').every(c => c.payload.src === '' && c.payload.status === 'failed')).toBe(true);
  });
  it('never activates raw HTML, carrier attributes, network access or browser DOM parsing', () => {
    const fetch = vi.spyOn(globalThis, 'fetch'), dom = vi.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      const source = '<script>evil()</script>\n\n<img src="https://clipboard-probe.invalid/a" onerror="evil()">\n\n**safe**';
      const result = importMarkdown(source);
      expect(fragmentText(result.fragment!)).toContain('<script>evil()</script>');
      expect(result.fragment!.embeds).toHaveLength(0); expect(result.notice).toContain('literal text');
      expect(fetch).not.toHaveBeenCalled(); expect(dom).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); dom.mockRestore(); }
  });
  it('only interprets clipboard Markdown on explicit intent, retaining the broader importer', () => {
    const data = { 'text/plain': '**bold**', 'text/html': '<i>HTML</i>' };
    expect(fragmentText(importClipboard({ 'text/plain': '**bold**' }).fragment!)).toBe('**bold**');
    expect(fragmentText(importClipboard(data).fragment!)).toBe('HTML');
    expect(fragmentText(importClipboard(data, false, true, true, true).fragment!)).toBe('bold');
    for (const mime of ['text/markdown', 'text/x-markdown']) {
      expect(fragmentText(importClipboard({ ...data, [mime]: '# heading' }).fragment!)).toBe('HTML');
      expect(fragmentText(importClipboard({ 'text/plain': 'fallback', [mime]: '# heading' }).fragment!)).toBe('fallback');
      expect(fragmentText(importClipboard({ [mime]: '**literal**' }, true).fragment!)).toBe('**literal**');
      expect(fragmentText(importClipboard({ [mime]: '**literal**' }, false, true, false).fragment!)).toBe('**literal**');
    }
    const native = { ...exportClipboard(plainFragment('native')), 'text/markdown': '# heading' };
    expect(fragmentText(importClipboard(native).fragment!)).toBe('native');
    expect(fragmentText(importClipboard(native, false, true, true, true).fragment!)).toBe('heading');
    expect(importClipboard({ 'text/html': '<b>no Markdown source</b>' }, false, true, true, true).fragment).toBeUndefined();
  });
  it('shares preparation and fresh-identity materialization, including worker-safe data', () => {
    const input = { data: { 'text/plain': '# heading\n\n**bold**' }, plain: false, asMarkdown: true, scope: {}, assets: [], blocks: [], selections: 1 };
    const first = preparePaste(input), second = preparePaste(input);
    expect(roots(first.fragment!)[0].blockProperties[0]).toMatchObject({type:'block/font/size',attributes:{value:'h1'}});
    expect(first.natives![0].roots[0]).not.toBe(second.natives![0].roots[0]);
    expect(() => JSON.parse(JSON.stringify(first))).not.toThrow();
  });
  it('bounds input and nesting and leaves empty/definition-only input unchanged', () => {
    expect(() => importMarkdown('x'.repeat(LIMITS.cells + 1))).toThrow(/size limit/);
    expect(() => importMarkdown('> '.repeat(40) + 'deep')).toThrow(/deeply nested/);
    expect(importMarkdown('[id]: https://example.com').fragment).toBeUndefined();
    expect(importMarkdown('')).toMatchObject({ notice: expect.stringContaining('selection was left unchanged') });
    expect(importMarkdown('').fragment).toBeUndefined();
  });
});
