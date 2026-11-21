import { expect, it } from 'vitest';
import { convertTei } from './convert';
import { encodeTeiNative } from './compact-native';
import { captureNative, decodeNative, nativeBytes, nativeText } from '../../persistence/native-resource';
import { resourceToRepository } from '../../history/durable-core';
import { inlineText, contentLength } from '../../block-tree/inline-sequence';
import { resolveFeatureFlags } from '../../configuration';
import { lightweightFacts } from '../../knowledge/saved-reader';
const wrap = (s: string) => `<TEI><teiHeader><listPerson><person xml:id="a"><persName>Alice</persName></person></listPerson></teiHeader><text><body>${s}</body></text></TEI>`;
const compile = (s: string) => decodeNative(encodeTeiNative(convertTei(wrap(s)).document).bytes, undefined, true);
it('imports rich, adjacent, empty and nested source-order readings as one-position native slots', async () => {
  const r = compile('<p xml:id="host"><hi rend="bold">Before <choice xml:id="c"><orig><hi rend="italic">😀é</hi><pb n="9"/></orig><reg><persName ref="#a">Alice</persName></reg></choice> after<app><lem/><rdg wit="#missing #missing" resp="#a"><choice><sic>x</sic><corr>y</corr></choice></rdg></app>.</hi></p>');
  const host = Object.values(r.contents).find(c => (c.payload.metadata as any)?.sourceId === 'host')!;
  expect(inlineText(host.compactInline!.spans)).toBe('Before \ufffc after\ufffc.'); expect(contentLength(host)).toBe(16);
  const slots = host.compactInline!.spans.filter(a => a.kind === 'alternative'); expect(slots).toHaveLength(2);
  const target = (name: string) => { const p = r.placements[host.ownedRelations[name]]; return p.target.kind === 'local' ? r.contents[p.target.contentKey] : undefined; };
  const first = target(slots[0].properties.readings[0])!, empty = target(slots[1].properties.readings[0])!;
  expect(inlineText(first.compactInline!.spans)).toBe('😀é'); expect(empty.compactInline!.spans).toEqual([]);
  expect(first.payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'style/italics', start: 0, end: 2 }), expect.objectContaining({ type: 'tei/milestone', start: 3, end: 3, isZeroWidth: true })]));
  expect(Object.values(r.contents).some(c => c.viewType === 'text-cell')).toBe(false);
  const root = Object.values(r.contents).find(c => c.viewType === 'document-block')!, defs = Object.values(root.payload.linkedAnnotations as any) as any[];
  expect(defs.find(d => d.metadata?.role === 'tei/reading').metadata.references[0].tokens.map((t: any) => t.raw)).toEqual(['#missing', '#missing']);
  expect(Object.values(r.contents).flatMap(c => c.payload.standoffProperties as any[] ?? []).some(p => p.metadata?.tei?.role === 'tei/mention')).toBe(true);
  const bytes = nativeBytes(r); expect(nativeText(captureNative(resourceToRepository(r), r.resourceId))).toBe(new TextDecoder().decode(bytes));
  expect(nativeText(decodeNative(bytes, undefined, true))).toBe(new TextDecoder().decode(bytes));
  await expect(lightweightFacts(bytes)).resolves.toBeDefined();
  expect(() => decodeNative(bytes)).toThrow(/require compact/);
});
it.each(['<choice><orig><p>block</p></orig><reg>r</reg></choice>', '<app from="#a"><lem>x</lem><rdg>y</rdg></app>', '<app><lem>x</lem><rdgGrp><rdg>y</rdg></rdgGrp></app>', '<choice>significant<orig>x</orig><reg>y</reg></choice>'])('keeps unsupported alternatives grouped: %s', source => {
  const r = compile(`<p>before${source}after</p>`); expect(Object.values(r.contents).some(c => c.payload.mode === 'tei/alternatives')).toBe(true);
});
it('defaults on and provides the explicit grouped import rollback', () => {
  expect(resolveFeatureFlags().inlineAlternatives).toBe(true);
  const d = convertTei(wrap('<p>A<choice><orig>x</orig><reg>y</reg></choice>Z</p>'), {}, 'test.xml', undefined, { inlineAlternatives: false }).document;
  expect(() => decodeNative(encodeTeiNative(d).bytes)).not.toThrow();
});

it('preserves inherited significant whitespace and block-level choices through grouped fallback', () => {
  const d = compile('<div xml:space="preserve"><choice><orig>A</orig><reg>B</reg></choice><p><choice> <orig>X</orig> <reg>Y</reg> </choice></p></div>');
  expect(Object.values(d.contents).filter(c => c.payload.mode === 'tei/alternatives')).toHaveLength(2);
  expect(Object.values(d.contents).filter(c => c.compactInline && inlineText(c.compactInline.spans) === ' ')).toHaveLength(3);
});
