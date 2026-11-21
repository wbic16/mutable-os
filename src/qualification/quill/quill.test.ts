// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReactiveEditor } from '../../reactive-editor/editor';
import { admitNative, captureNative, nativeBytes, nativeText, decodeNative } from '../../persistence/native-resource';
import { composition, convert, copyInto, fixture, invoke, record, sourceOf, textOf, QUILL_TYPE, qualificationFlags } from './model';
import { clusters, FlowLayout } from './layout';
import { serializeSelection } from '../../interchange/serializer';
import { materializeFragment } from '../../interchange/materialize';

const editors: ReactiveEditor[] = [];
afterEach(() => { editors.splice(0).forEach(e => e.dispose()); vi.restoreAllMocks(); });
function setup(extra = 0, compact = true) {
  const editor = new ReactiveEditor({ id: 'workspace', type: 'workspace-block', children: [
    { id: 'bank', type: 'workspace-object-bank-block', children: [] },
  ] }, { features: { compactCanonicalText: compact } });
  editors.push(editor);
  const projection = editor.createView('native-editor');
  const bank = projection.node(projection.state.rootKey)!.children[0];
  // Admit through Ink so both current compact and legacy Cell representations are exercised.
  const temporary = new ReactiveEditor(fixture(extra)); editors.push(temporary);
  admitNative(editor.repository, nativeBytes(captureNative(temporary.repository.readState(), 'quill-document')), editor.node(bank)!.contentKey);
  const source = Object.values(projection.state.nodes).find(n => n.payload.id === 'quill-source')!;
  return { editor, projection, source, bank };
}
describe('Quill qualification — native boundaries', () => {
  it.each([true, false])('wraps the same native source with compact=%s, and undoes atomically', compact => {
    const { editor, source } = setup(0, compact), before = record(editor, source.placementKey);
    const cells = [...before.inlineContent], properties = JSON.stringify(before.payload.standoffProperties);
    const invocation = invoke(editor, source.key, 'flint', 'quill-document');
    const revision = editor.repository.state.revision;
    expect(invoke(editor, source.key, 'native-editor', 'quill-document').sourcePlacement).toBe(invocation.sourcePlacement);
    expect(editor.repository.state.revision).toBe(revision);
    const wrapper = convert(editor, invocation);
    expect(sourceOf(editor, wrapper)).toBe(source.placementKey);
    expect(record(editor, source.placementKey).key).toBe(before.key);
    expect(record(editor, source.placementKey).inlineContent).toEqual(cells);
    expect(JSON.stringify(record(editor, source.placementKey).payload.standoffProperties)).toBe(properties);
    editor.repository.undo(); expect(editor.repository.readState().placements[wrapper]).toBeUndefined();
    editor.repository.redo(); expect(sourceOf(editor, wrapper)).toBe(source.placementKey);
  });
  it('keeps overlapping annotations on native edits and preserves mixed Blocks through Ink', () => {
    const { editor, source, bank } = setup(), wrapper = convert(editor, invoke(editor, source.key, 'flint', 'quill-document'));
    editor.commands.replaceInlineRange(source.placementKey, 0, 0, 'Listen: ');
    const properties = record(editor, source.placementKey).payload.standoffProperties as any[];
    expect(properties.find(p => p.id === 'entity-raven')).toMatchObject({ start: 12, end: 16, value: 'raven-entity' });
    expect(properties.find(p => p.id === 'gloss-raven')).toMatchObject({ start: 12, end: 24 });
    const target = editor.commands.insert({ id: 'copy-document', type: 'document-block', children: [] }, { kind: 'at', parentKey: bank, index: 1 });
    const copied = copyInto(editor, wrapper, target), copiedSource = sourceOf(editor, copied);
    expect(record(editor, copied).viewType).toBe(QUILL_TYPE);
    expect(record(editor, copiedSource).payload.id).not.toBe(record(editor, source.placementKey).payload.id);
    expect(textOf(editor, copiedSource)).toBe(textOf(editor, source.placementKey));
    const copiedProperties = record(editor, copiedSource).payload.standoffProperties as any[];
    const semantics = (p: any) => ({ start: p.start, end: p.end, type: p.type, value: p.value });
    expect(copiedProperties.map(semantics)).toEqual(properties.map(semantics));
    const copiedGloss = copiedProperties.find(p => p.type === 'mutable/gloss');
    const definitions = record(editor, target).payload.linkedAnnotations as any;
    expect(copiedGloss.annotationId).not.toBe('raven-gloss-definition');
    expect(definitions[copiedGloss.annotationId].metadata.gloss.localId).not.toBe('quill-gloss-local');
    expect(definitions[copiedGloss.annotationId].value).toBe('note: A visitor at dusk');
    expect(copiedProperties.every((p, i) => p.id !== properties[i].id)).toBe(true);
    editor.commands.replaceInlineRange(copiedSource, 0, 0, 'Independent ');
    expect(textOf(editor, source.placementKey)).not.toContain('Independent');
    copyInto(editor, wrapper, editor.commands.childrenOf(bank)[0]);
    for (const id of ['quill-document', 'copy-document']) {
      const saved = captureNative(editor.repository.readState(), id), bytes = nativeBytes(saved);
      expect(nativeText(decodeNative(bytes))).toBe(nativeText(saved));
    }
    expect(Object.values(editor.repository.readState().contents).filter(c => c.viewType === QUILL_TYPE)).toHaveLength(3);
  });
  it('records the unqualified OS clipboard boundary: unknown Quill Blocks become opaque', () => {
    const { editor, source } = setup(), wrapper = convert(editor, invoke(editor, source.key, 'native-editor', 'quill-document'));
    const fragment = serializeSelection(editor.repository.readState(), [{ placementKey: wrapper }], { cavernId: 'fixture', resourceId: 'quill-document' });
    const imported = materializeFragment(fragment, { cavernId: 'fixture', resourceId: 'other-document' });
    expect(imported.state.contents[imported.state.placements[imported.roots[0]].contentKey].viewType).toBe('mutable/opaque-block');
  });
  it.each([0, 500])('typing touches no unrelated payloads or snapshots with %s extra Blocks', extra => {
    const { editor, source } = setup(extra), wrapper = convert(editor, invoke(editor, source.key, 'native-editor', 'quill-document'));
    const snapshots = vi.spyOn(editor.repository, 'snapshot').mockImplementation(() => { throw Error('Full snapshot on typing'); });
    const unrelated = Object.values(editor.repository.readState().contents).filter(c => String(c.payload.id).startsWith('unrelated-') || c.payload.id === 'native-note');
    let reads = 0; const restore: (() => void)[] = [];
    for (const c of unrelated) { const d = Object.getOwnPropertyDescriptor(c, 'payload')!; Object.defineProperty(c, 'payload', { configurable: true, get() { reads++; return d.value; } }); restore.push(() => Object.defineProperty(c, 'payload', d)); }
    const changes: { owner?: string; records: number }[] = [];
    const stop = editor.repository.subscribeChanges(c => changes.push({ owner: c.inlineOwner, records: c.previousContents.size }));
    try {
      editor.commands.replaceInlineRange(source.placementKey, 4, 4, 'silent ');
      editor.repository.undo(); editor.repository.redo();
      expect(reads).toBe(0); expect(snapshots).not.toHaveBeenCalled();
      expect(changes).toEqual(Array(3).fill({ owner: record(editor, source.placementKey).key, records: 1 }));
      expect(sourceOf(editor, wrapper)).toBe(source.placementKey);
    } finally { stop(); restore.forEach(f => f()); snapshots.mockRestore(); }
  });
  it('rejects stale invocation and respects the experiment flag', () => {
    const { editor, source } = setup(), invocation = invoke(editor, source.key, 'native-editor', 'quill-document');
    editor.commands.replaceInlineRange(source.placementKey, 0, 0, 'Changed ');
    expect(() => convert(editor, invocation)).toThrow('Source changed');
    qualificationFlags.quill = false;
    try { expect(() => invoke(editor, source.key, 'flint', 'quill-document')).toThrow('disabled'); }
    finally { qualificationFlags.quill = true; }
  });
});
describe('Quill qualification — derived path layout', () => {
  const engine = () => new FlowLayout(t => [...t].length * 55);
  const text = String(fixture().children![0].text);
  it('reflows all three paths on insert/delete, fits the swell and leaves visual opacity out of fitting', () => {
    const e = engine(), config = composition(), before = e.layout(text, config);
    expect(new Set(before.placements.map(p => p.pathId)).size).toBe(3);
    const after = e.layout('Listen to the distant wings. ' + text, config);
    expect(after.placements.filter(p => p.pathId === 'wave-1').map(p => p.text).join('')).not.toBe(before.placements.filter(p => p.pathId === 'wave-1').map(p => p.text).join(''));
    expect(e.layout(text, config)).toEqual(before);
    expect(e.layout(text, { ...config, swell: 0 }).placements.filter(p => p.pathId === 'wave-0').length).toBeGreaterThan(before.placements.filter(p => p.pathId === 'wave-0').length);
    expect(e.layout(text, { ...config, opacity: .2 })).toEqual(before);
  });
  it('reuses measurement and geometry; amplitude change only rebuilds the changed path', () => {
    const e = engine(), config = composition(); e.layout(text, config);
    const counts = { ...e.counts }; e.layout(text + ' raven', config);
    expect(e.counts.measurements).toBe(counts.measurements); expect(e.counts.geometryBuilds).toBe(3);
    e.layout(text, { ...config, paths: config.paths.map((p, i) => i ? p : { ...p, amplitude: 50 }) });
    expect(e.counts.geometryBuilds).toBe(4); expect(e.counts.measurements).toBe(counts.measurements);
  });
  it('maps combining marks and emoji to native code-point ranges and explicitly rejects unshaped scripts', () => {
    expect(clusters('Aé👩‍💻Z').map(c => [c.start, c.end])).toEqual([[0, 1], [1, 3], [3, 6], [6, 7]]);
    for (const text of ['مرحبا', 'אבג', 'नमस्ते', '👩‍💻']) {
      const result = engine().layout(text, composition());
      expect(result.placements).toEqual([]); expect(result.diagnostics[0]).toContain('Unsupported shaping');
      expect(result.overflow.map(c => c.text).join('')).toBe(text);
    }
    expect(engine().layout('office', composition()).diagnostics[0]).toContain('Ligature');
  });
});
