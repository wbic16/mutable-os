import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertTei as convertCurrentTei } from './convert';
// Preserve the pre-M4 grouped-alternative compatibility oracle.
const convertTei: typeof convertCurrentTei = (source, limits, filename, timings, options) => convertCurrentTei(source, limits, filename, timings, { ...options, inlineAlternatives: false });
import { encodeTeiNative } from './compact-native';
import { validateTeiDocument } from './validate';
import { decodeBlockTree, encodeDocument } from '../../block-tree/codecs';
import { CanonicalRepository } from '../../block-tree/repository';
import { TreeCommands } from '../../block-tree/commands';
import { contentLength, inlineText, logicalInline } from '../../block-tree/inline-sequence';
import { admitNative, captureNative, decodeNative, nativeBytes, nativeText } from '../../persistence/native-resource';
import { resourceToRepository } from '../../history/durable-core';
import { projectSaved } from '../../knowledge-sqlite/saved-projection';
import { resolveFeatureFlags } from '../../configuration';
import type { ExistingBlockDto } from '../../block-tree/types';

const fixture = readFileSync('src/interchange/tei/fixtures/semantic-sublimation.xml', 'utf8');
const wrap = (xml: string) => `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>${xml}</body></text></TEI>`;
const blocks = (b: ExistingBlockDto): ExistingBlockDto[] => [b, ...(b.children?.flatMap(blocks) ?? [])];
const defs = (d: ExistingBlockDto): any[] => Object.values(d.linkedAnnotations as object);
const props = (d: ExistingBlockDto): any[] => blocks(d).flatMap(b => b.standoffProperties as any[] ?? []);
const bySource = (d: ExistingBlockDto, sourceId: string) => blocks(d).find(b => (b.metadata as any)?.sourceId === sourceId)!;
afterEach(() => vi.restoreAllMocks());

it('preserves rich alternatives, first-authored selection, witness order and empty branch semantics', () => {
  const { document: d, truncated } = convertTei(fixture);
  expect(truncated).toBe(false);
  const choices = blocks(d).filter(b => b.mode === 'tei/alternatives');
  expect(choices).toHaveLength(4); // outer choice, nested choice, app, rdgGrp: no Cartesian expansion
  const app = bySource(d, 'apparatus'), tabs = app.children![0].children!;
  expect(tabs.map(t => (t.metadata as any).name)).toEqual(['rdg', 'lem', 'rdgGrp']);
  expect(tabs.map(t => (t.metadata as any).active)).toEqual([true, false, false]);
  expect(app.metadata).toMatchObject({ tei: { kind: 'tei/app', selectionPolicy: 'tei/source-order' } });
  expect((app.blockProperties as any[])[0].metadata.references.map((r: any) => [r.attribute, r.tokens[0].state])).toEqual([['from', 'resolved'], ['to', 'resolved']]);
  const reading = defs(d).find(x => x.metadata.role === 'tei/reading' && x.metadata.references);
  expect(reading.metadata.references[0].tokens.map((t: any) => [t.raw, t.state])).toEqual([['#w2', 'resolved'], ['#missing', 'unresolved'], ['#w2', 'resolved']]);
  const original = defs(d).find(x => x.metadata.sourceId === 'original');
  const originalText = blocks(d).find(b => b.text === 'olde 😀é')!;
  expect(originalText.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({ annotationId: original.id, start: 0, end: 7 }), expect.objectContaining({ type: 'style/italics', start: 5, end: 7 })]));
  const empty = defs(d).find(x => x.metadata.role === 'tei/abbreviation');
  expect(props(d).find(p => p.annotationId === empty.id)).toMatchObject({ start: 0, end: 0, isZeroWidth: true });
  expect(blocks(d).filter(b => b.text === 'Before ')).toHaveLength(1);
  expect(blocks(d).filter(b => b.text === ' after ')).toHaveLength(1);
});

it('maps exact code-point boundaries without placeholders, while retaining ordinary line breaks', () => {
  const { document: d } = convertTei(fixture), p = bySource(d, 'positions');
  expect(p.text).toBe('A😀é B\nC');
  const milestones = (p.standoffProperties as any[]).map(p => ({ ...p, definition: defs(d).find(d => d.id === p.annotationId) }));
  expect(milestones.map(p => [p.definition.metadata.role, p.start, p.end, !!p.isZeroWidth])).toEqual([
    ['tei/anchor', 0, 0, true], ['tei/page-break', 2, 2, true], ['tei/line-break', 2, 2, true],
    ['tei/column-break', 4, 4, true], ['tei/milestone', 4, 4, true], ['tei/space', 6, 6, true],
    ['tei/anchor', 6, 6, true], ['tei/line-break', 6, 6, false],
  ]);
  expect(milestones[1].definition.metadata.references[0]).toMatchObject({ attribute: 'facs', raw: 'scan.jpg#zone' });
  expect(milestones[5].definition.metadata.fields).toEqual({ quantity: '2', unit: 'chars' });
  expect(blocks(d).filter(b => b.type === 'page-block')).toHaveLength(1);
  const empty = convertTei(wrap('<p><pb/><anchor/></p>')).document;
  expect(blocks(empty).filter(b => b.type === 'standoff-editor-block').map(b => b.text)).toEqual(['']);
  expect(props(empty)).toHaveLength(2);
});

it('retains distinct editorial operations, parent interventions, attribution and multi-Block spans', () => {
  const { document: d } = convertTei(fixture), editorial = defs(d).filter(d => d.type === 'tei/editorial');
  expect(editorial.map(d => d.metadata.role)).toEqual(expect.arrayContaining(['tei/substitution', 'tei/addition', 'tei/deletion', 'tei/supplied', 'tei/surplus', 'tei/unclear', 'tei/gap', 'tei/damage', 'tei/restoration', 'tei/hand-shift']));
  const subst = editorial.find(d => d.metadata.sourceId === 'substitution');
  expect(editorial.filter(d => d.metadata.parentEditorialId === subst.id).map(d => d.metadata.role)).toEqual(['tei/deletion', 'tei/addition']);
  const supplied = editorial.find(d => d.metadata.fields?.reason === 'lost');
  expect(supplied.metadata).toMatchObject({ fields: { reason: 'lost', cert: 'low' }, references: [{ attribute: 'resp', raw: '#editor', tokens: [{ state: 'resolved' }] }] });
  expect(editorial.find(d => d.metadata.role === 'tei/hand-shift').metadata.references[0]).toMatchObject({ attribute: 'new', raw: '#new-hand', tokens: [{ state: 'unresolved' }] });
  const structural = blocks(d).filter(b => b.text?.startsWith('Structural addition'));
  const first = (structural[0].standoffProperties as any[]).find(p => p.type === 'tei/editorial');
  expect(structural[1].standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({ annotationId: first.annotationId })]));
  expect(props(d).some(p => p.isDeleted)).toBe(false);
});

it('links only compatible explicit local Entity mentions, never attribution or arbitrary identity assertions', () => {
  const xml = '<TEI><teiHeader><listPerson><person xml:id="p"><persName>A</persName></person></listPerson><listPlace><place xml:id="q"><placeName>Q</placeName></place></listPlace></teiHeader><text><p><persName ref="#p">A</persName><persName ref="#q">Q</persName><add resp="#p">added</add><ref target="#p">link</ref><name sameAs="#p">same</name><name ref="#missing">missing</name></p></text></TEI>';
  const d = convertTei(xml).document, body = blocks(d).find(b => b.text === 'AQaddedlinksamemissing')!;
  expect((body.standoffProperties as any[]).filter(p => p.type === 'mutable/gloss')).toEqual([expect.objectContaining({ start: 0, end: 0 })]);
  expect(defs(d).filter(d => d.type === 'mutable/gloss')).toHaveLength(2);
  expect(props(d).some(p => p.type === 'codex/entity-reference')).toBe(false);
  const relations = defs(convertTei(fixture).document).filter(d => d.type === 'tei/relationship');
  expect(relations).toHaveLength(2);
  expect(relations[0].metadata.references[1].tokens.map((t: any) => t.state)).toEqual(['resolved', 'unresolved']);
  expect(relations[1].metadata.references[0].tokens.map((t: any) => t.raw)).toEqual(['#alice', '#editor', '#alice']);
  const date = defs(convertTei(fixture).document).find(d => d.metadata.role === 'tei/sending-date');
  expect(date.metadata.fields).toEqual({ from: '1842-01', to: '1842-02' });
  expect(date.metadata.references).toBeUndefined();
});

it('preserves significant whitespace, nested overlaps and invalid alternative children without silent omission', () => {
  const d = convertTei(fixture).document;
  expect(blocks(d).some(b => b.text === ' A 😀 é\n B ')).toBe(true);
  const unusual = convertTei(wrap('<p><choice xml:space="preserve"> <orig>A</orig> <reg>B</reg> </choice><app><weird>未知</weird><rdg/></app><space><desc>two lines</desc></space></p>'));
  const texts = blocks(unusual.document).filter(b => b.type === 'standoff-editor-block').map(b => b.text);
  expect(texts).toEqual([' ', 'A', ' ', 'B', ' ', '未知', '', 'two lines']);
  expect(unusual.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining(['alternative-content', 'generic-element', 'space-layout', 'milestone-content']));
  expect(() => decodeNative(encodeTeiNative(unusual.document).bytes)).not.toThrow();
});

it('defaults the new flag on and preserves the M1 conversion policy on explicit opt-out', () => {
  expect(resolveFeatureFlags({}).teiSemanticSublimation).toBe(true);
  const r = convertTei(wrap('<p>a<pb/>b<gap/></p>'), {}, 'old.xml', undefined, { semanticSublimation: false });
  expect(defs(r.document).find(d => d.type === 'tei/milestone').metadata).toMatchObject({ role: 'page-break', precision: 'block-context' });
  expect(props(r.document).every(p => !p.isZeroWidth)).toBe(true);
  expect((r.document.metadata as any).interchange).toBeUndefined();
});

it('applies inherited relative bases once and identifies inline-only or empty TEI roots correctly', () => {
  const d = convertTei('<TEI xml:id="root" xml:base="https://example.test/edition/"><text xml:base="letters/"><p xml:base="one/"><persName ref="people.xml#a">A</persName></p></text></TEI>').document;
  expect(defs(d).find(d => d.metadata.role === 'tei/person-name').metadata.references[0].tokens[0].effectiveUri).toBe('https://example.test/edition/letters/one/people.xml#a');
  const inline = convertTei('<TEI xml:id="root"><ref target="#root">self</ref></TEI>').document;
  expect(defs(inline).find(d => d.metadata.role === 'tei/reference').metadata.references[0].tokens[0].target).toEqual({ kind: 'block', id: inline.id });
  expect((convertTei('<TEI xml:id="empty"/>').document.metadata as any).tei.sourceId).toBe('empty');
});

it.each([true, false])('completes semantic conversion before native admission and preserves all authored data (compact=%s)', async compact => {
  const { document: d } = convertTei(fixture, {}, 'scholarly.xml'), prepared = encodeTeiNative(d);
  expect(prepared.counts).toMatchObject({ contents: 0, placements: 0 });
  const resource = decodeNative(prepared.bytes, undefined, compact);
  expect(Object.values(resource.contents).filter(c => c.viewType === 'text-cell').length === 0).toBe(compact);
  expect(encodeDocument(resourceToRepository(resource))).toEqual(encodeDocument(decodeBlockTree(d).state));
  const saved = nativeBytes(resource);
  for (const reopenCompact of [true, false]) {
    const reopened = decodeNative(saved, undefined, reopenCompact);
    expect(nativeText(reopened)).toBe(new TextDecoder().decode(saved));
  }
  const projection = await projectSaved(saved, '12345678-1234-1234-1234-123456789abc');
  expect(projection.blocks.flatMap(b => b.segments).some(p => p.startIndex === p.endIndex)).toBe(true);
  expect((d.metadata as any).interchange.provenance).toMatchObject({ filename: 'scholarly.xml', converter: 'tei/operational-semantics-v3' });
  expect(JSON.stringify(d)).not.toContain('<TEI');
});

it('keeps point edits, split/join and Undo/Redo bounded by affected records, with both stored endpoint forms intact', () => {
  const d = convertTei(wrap('<p>A😀<anchor xml:id="middle"/>BC<anchor xml:id="end"/></p>')).document;
  const p = blocks(d).find(b => b.text === 'A😀BC')!;
  (p.standoffProperties as any[]).push({ id: 'other-form', type: 'tei/milestone', isZeroWidth: true, start: 2, end: 1 });
  validateTeiDocument(d);
  const state = decodeBlockTree({ id: 'workspace', type: 'workspace-block', children: [{ id: 'bank', type: 'workspace-object-bank-block' }] }).state;
  const repo = new CanonicalRepository(state, { compactCanonicalText: true }), bank = Object.values(state.contents).find(c => c.payload.id === 'bank')!;
  admitNative(repo, encodeTeiNative(d).bytes, bank.key);
  const c = Object.values(repo.readState().contents).find(c => c.payload.id === p.id)!, pk = [...repo.ownedPlacementKeys(c.key)][0], commands = new TreeCommands(repo, k => k);
  const before = nativeText(captureNative(repo.readState(), d.id!));
  const snapshot = vi.spyOn(repo, 'snapshot'), rebuild = vi.spyOn(repo as any, 'rebuildReferences');
  const descriptor = Object.getOwnPropertyDescriptor(bank, 'payload')!; let unrelatedReads = 0;
  Object.defineProperty(bank, 'payload', { configurable: true, get() { unrelatedReads++; return descriptor.value; } });
  const affected: number[] = []; const stop = repo.subscribeChanges(change => affected.push(change.previousContents.size));
  commands.replaceInlineRange(pk, 2, 2, '漢'); repo.undo(); repo.redo();
  expect(unrelatedReads).toBe(0); expect(affected).toEqual([1, 1, 1]);
  expect(snapshot).not.toHaveBeenCalled(); expect(rebuild).not.toHaveBeenCalled();
  stop(); Object.defineProperty(bank, 'payload', descriptor);
  expect((repo.readState().contents[c.key].payload.standoffProperties as any[]).map(p => [p.start, p.end])).toEqual([[3, 3], [5, 5], [3, 2]]);
  const right = commands.splitStandoff(pk, 3); commands.joinStandoff(pk, right);
  expect((repo.readState().contents[c.key].payload.standoffProperties as any[]).map(p => [p.start, p.end])).toEqual([[3, 3], [5, 5], [3, 2]]);
  repo.undo(); repo.undo(); repo.undo();
  expect(nativeText(captureNative(repo.readState(), d.id!))).toBe(before);
  expect(contentLength(repo.readState().contents[c.key])).toBe(4);
  expect(inlineText(logicalInline(repo.readState(), repo.readState().contents[c.key]))).toBe('A😀BC');
});

it('projects either valid point endpoint form at empty, Unicode and EOF boundaries without rewriting native evidence', async () => {
  for (const text of ['', '😀B']) for (const start of [0, [...text].length]) for (const delta of [0, -1]) {
    const d = convertTei(wrap(`<p>${text}</p>`)).document, p = blocks(d).find(b => b.type === 'standoff-editor-block')!;
    p.standoffProperties = [{ id: 'point', type: 'tei/milestone', isZeroWidth: true, start, end: start + delta }];
    const encoded = encodeTeiNative(d), before = new TextDecoder().decode(encoded.bytes);
    const projected = await projectSaved(encoded.bytes, '12345678-1234-1234-1234-123456789abc');
    const segment = projected.blocks.find(b => b.block.guid === p.id)!.segments[0];
    expect(segment.startIndex).toBe(text ? start === 0 ? 0 : 3 : 0); expect(segment.endIndex).toBe(segment.startIndex);
    expect(new TextDecoder().decode(encoded.bytes)).toBe(before);
    expect(JSON.parse(segment.attributes).end).toBe(start + delta);
  }
});

it.each([{ start: -1, end: -1 }, { start: 4, end: 4 }, { start: 1, end: 2 }, { start: 2, end: 0 }, { start: 1.5, end: 1.5 }])('still rejects invalid point endpoints in producer and saved indexing: %j', async range => {
  const d = convertTei(wrap('<p>abc</p>')).document, p = blocks(d).find(b => b.type === 'standoff-editor-block')!;
  p.standoffProperties = [{ type: 'tei/milestone', isZeroWidth: true, ...range }];
  expect(() => validateTeiDocument(d)).toThrow(/invalid emitted/);
  await expect(projectSaved(encodeTeiNative(d).bytes, '12345678-1234-1234-1234-123456789abc')).rejects.toThrow();
});
