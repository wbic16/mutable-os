import { expect, it } from 'vitest';
import { importNativeMarkdown } from './markdown-native';
import { fragmentText } from './serializer';
import { materializeFragment } from './materialize';
import { importMarkdown } from './markdown-import';
import { analyseCode } from '../runtime/standoff-code';

it('maps nested inline formatting and links to native scalar ranges', () => {
  const result = importNativeMarkdown('**😀*é*** ~~strike~~ [site](https://example.com) `*literal*`');
  expect(fragmentText(result.fragment)).toBe('😀é strike site `*literal*`');
  expect(result.fragment.blocks[0].inline!.properties.map(p => [p.type, p.startIndex, p.endIndex])).toEqual([
    ['style/bold', 0, 3], ['style/italics', 1, 3], ['style/strikethrough', 4, 10], ['reference/url', 11, 15],
  ]);
  expect(result.fragment.blocks[0].inline!.properties.at(-1)?.target).toEqual({ kind: 'url', url: 'https://example.com' });
});
it('materializes H1–H6 without clamping and flat ordered/task lists with native metadata', () => {
  const headings = importNativeMarkdown(Array.from({ length: 6 }, (_, i) => '#'.repeat(i + 1) + ' Heading').join('\n\n')).fragment;
  expect(headings.blocks.map(b => b.blockProperties[0].attributes.value)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  expect(Object.values(materializeFragment(headings, {}).state.contents).filter(c => c.viewType === 'standoff-editor-block').at(-1)?.payload.blockProperties).toMatchObject([{ type: 'block/font/size', value: 'h6' }]);
  const list = importNativeMarkdown('3. **three**\n4. four\n\n- [ ] Open\n- [x] Done').fragment;
  expect(list.blocks.filter(b => b.type === 'indented-list-block').map(b => b.data.metadata)).toEqual([{ htmlList: { ordered: true, start: 3, reversed: false } }, { htmlList: { ordered: false, start: 1, reversed: false } }]);
  expect(list.blocks.filter(b => b.data.checked !== undefined).map(b => b.data.checked)).toEqual([false, true]);
  expect(fragmentText(list)).not.toContain('[x]');
});
it.each(['```md\n**literal**\n```', '> **quoted**', '| A | B |\n| - | - |\n| **x** | y |', '- parent\n  - **nested**', '![alt](https://example.com/a.png)', '[name][id]', '<b>raw</b>'])('retains unsupported source exactly: %s', source => {
  const result = importNativeMarkdown(source);
  expect(fragmentText(result.fragment)).toBe(source);
  expect(result.fragment.blocks.flatMap(b => b.inline?.properties ?? [])).toHaveLength(0);
  expect(result.fragment.embeds).toHaveLength(0);
});
it('keeps the broader Markdown resource importer available for tables and code', () => {
  const result = importMarkdown('| A | B |\n| - | - |\n| x | y |\n\n```js\nconst n = 1;\n```');
  expect(result.fragment!.blocks.some(b => b.type === 'table-block')).toBe(true);
  expect(result.fragment!.blocks.some(b => (b.data.metadata as any)?.markdownCode?.language === 'js')).toBe(true);
});
it('highlights Markdown across TextBlocks and embedded newlines, leaving source intact', () => {
  const source = ['# Heading\n**bold** and *italic*', '> quote', '- [x] Task', '```js', 'const x = 1;', '```', '[link](https://example.com)'];
  const blocks = source.map((s, i) => ({ key: String(i), version: 0, cells: [...s] }));
  const result = analyseCode(blocks, 'markdown');
  expect(result.tokens[0].flatMap(t => t.classes)).toEqual(expect.arrayContaining(['syntax-heading', 'syntax-strong', 'syntax-emphasis']));
  expect(result.tokens[2].some(t => t.classes.includes('syntax-atom'))).toBe(true);
  expect(result.tokens[6].some(t => t.classes.includes('syntax-url'))).toBe(true);
  expect(analyseCode(blocks, 'md').tokens).toEqual(result.tokens);
  expect(blocks.map(b => b.cells.join(''))).toEqual(source);
});
