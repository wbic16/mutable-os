import { expect, it } from 'vitest';
import { convertTei } from './convert';
import { promoteTeiRelationships } from './relationships';
import { GlossGraphIndex } from '../../features/gloss/relationship-index';
import { encodeTeiNative } from './compact-native';
import { decodeNative, captureNative, nativeBytes } from '../../persistence/native-resource';
import { resourceToRepository } from '../../history/durable-core';
import { resolveFeatureFlags } from '../../configuration';

const source = (relation: string, extra = '') => `<TEI><teiHeader><listPerson><person xml:id="a"><persName>A</persName></person><person xml:id="b"><persName>B</persName></person>${extra}</listPerson>${relation}</teiHeader><text><p><persName ref="#a">A</persName> <name ref="#b">B</name> <placeName ref="#a">Wrong kind</placeName></p></text></TEI>`;
const compile = (relation: string, extra = '') => convertTei(source(relation, extra)).document;
const graph = (d: any) => new GlossGraphIndex(d.linkedAnnotations);
const definitions = (d: any): any[] => Object.values(d.linkedAnnotations);
const blocks = (d: any): any[] => [d, ...(d.children ?? []).flatMap(blocks)];

it('promotes an explicit directed binary assertion with its original predicate and provenance, idempotently', () => {
  const d = compile('<relation xml:id="r" name="knows" active="#a" passive="#b" resp="#missing"/>');
  const edges = graph(d).allEdges(); expect(edges).toHaveLength(1);
  expect(edges[0]).toMatchObject({ active: true, type: 'knows' });
  const raw: any = edges[0].raw;
  expect(raw.metadata.tei).toMatchObject({ sourceId: 'r', fields: { name: 'knows', 'xml:id': 'r' } });
  expect(raw.metadata.tei.references.map((r: any) => [r.attribute, r.tokens[0].state])).toEqual([['active', 'resolved'], ['passive', 'resolved'], ['resp', 'unresolved']]);
  expect(definitions(d).filter(x => x.type === 'tei/relationship')).toHaveLength(1);
  const before = JSON.stringify(d); promoteTeiRelationships(d.linkedAnnotations as any); expect(JSON.stringify(d)).toBe(before);
});

it.each([
  'name="knows" mutual="#a #b"',
  'name="knows" active="#a #a" passive="#b"',
  'name="knows" active="#a" passive="#b #a"',
  'name="knows" active="#missing" passive="#b"',
  'name="knows" active="https://example.invalid/a" passive="#b"',
  'name="knows" active="#a" passive="#b" cert="low"',
  'name="knows" active="#a" passive="#b" when="1900"',
  'active="#a" passive="#b"',
])('retains unsupported relationship semantics without inventing an active edge: %s', attrs => {
  const d = compile(`<relation ${attrs}/>`); expect(graph(d).allEdges()).toHaveLength(0);
  expect(definitions(d).filter(x => x.type === 'tei/relationship')).toHaveLength(1);
});

it('does not promote ambiguous participants or non-entity definitions', () => {
  const d = compile('<relation name="knows" active="#a" passive="#b"/>', '<person xml:id="a"><persName>Another</persName></person>');
  expect(graph(d).allEdges()).toHaveLength(0);
  const other = convertTei('<TEI><text><p xml:id="a">A</p><p xml:id="b">B</p><relation name="knows" active="#a" passive="#b"/></text></TEI>').document;
  expect(graph(other).allEdges()).toHaveLength(0);
});

it('keeps distinct assertions as distinct edges, source multiplicity and explicit compatible binding', () => {
  const d = compile('<relation name="knows" active="#a" passive="#b"/><relation name="knows" active="#a" passive="#b"/>');
  expect(graph(d).allEdges()).toHaveLength(2);
  const segments = blocks(d).flatMap(b => b.standoffProperties ?? []).filter(p => p.type === 'mutable/gloss');
  expect(segments.filter(p => p.metadata?.tei.role === 'tei/definition')).toHaveLength(2);
  expect(segments.filter(p => p.metadata?.tei.role === 'tei/mention')).toHaveLength(2);
  const repeat = compile('<relation name="knows" active="#a" passive="#b"/><relation name="knows" active="#a" passive="#b"/>');
  const meaning = (doc: any) => graph(doc).allEdges().map(e => ({ type: e.type, active: e.active, source: graph(doc).unique(e.sourceGlossId).raw, target: graph(doc).unique(e.targetGlossId!).raw }));
  expect(meaning(repeat)).toEqual(meaning(d));
});

it.each([true, false])('retains native graph and source roles through capture/reload (compact=%s)', compact => {
  const d = compile('<relation name="knows" active="#a" passive="#b"/>'), first = decodeNative(encodeTeiNative(d).bytes, undefined, compact);
  const captured = captureNative(resourceToRepository(first), d.id!), again = decodeNative(nativeBytes(captured), undefined, compact);
  const root = Object.values(again.contents).find(c => c.viewType === 'document-block')!;
  expect(new GlossGraphIndex(root.payload.linkedAnnotations as any).allEdges()).toHaveLength(1);
  expect(Object.values(again.contents).flatMap(c => c.payload.standoffProperties as any[] ?? []).filter(p => p.metadata?.tei?.role === 'tei/mention')).toHaveLength(2);
});

it('defaults the operational flag on and preserves the M2 rollback', () => {
  expect(resolveFeatureFlags().teiOperationalSemantics).toBe(true);
  const d = convertTei(source('<relation name="knows" active="#a" passive="#b"/>'), {}, 'source.xml', undefined, { operationalSemantics: false, inlineAlternatives: false }).document;
  expect(graph(d).allEdges()).toHaveLength(0);
  expect((d.metadata as any).tei.conversion.milestone).toBe(2);
});

it('does not activate assertions under unsupported inherited qualifiers or alternative readings', () => {
 for (const wrapper of ['<listRelation type="hypothetical">REL</listRelation>', '<choice><orig>REL</orig><reg/></choice>']) {
  const d = compile(wrapper.replace('REL', '<relation name="knows" active="#a" passive="#b"/>'));
  expect(graph(d).allEdges()).toHaveLength(0);
  expect(definitions(d).find(x => x.type === 'tei/relationship').metadata.unsupportedContext).toBe(true);
 }
});

it('keeps nonempty relation content as preservation rather than hiding unsupported qualifications on an active edge', () => {
 const d=compile('<relation name="knows" active="#a" passive="#b"><desc>Only reportedly</desc></relation>');
 expect(graph(d).allEdges()).toHaveLength(0);
 expect(blocks(d).some(b=>b.text==='Only reportedly')).toBe(true);
});
