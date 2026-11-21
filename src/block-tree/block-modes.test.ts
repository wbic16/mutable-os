import { afterEach, expect, it, vi } from 'vitest';
import { ReactiveEditor } from '../reactive-editor/editor';
import { captureNative, decodeNative, nativeText } from '../persistence/native-resource';
import { resourceToRepository } from '../history/durable-core';
import { serializeSelection, plainFragment } from '../interchange/serializer';
import { materializeFragment } from '../interchange/materialize';
import { conversionSource } from '../interchange/conversion';
import { validateRepository } from './repository';
import { changeTextList } from '../runtime/text-lists';
import { createTextTab } from '../runtime/text-tabs';
import type { ExistingBlockDto } from './types';

const editors: ReactiveEditor[] = [];
afterEach(() => { editors.splice(0).forEach(e => e.dispose()); vi.restoreAllMocks(); });
const paragraph = (id: string, mode: string | undefined, extra: object = {}): ExistingBlockDto => ({
  id, type: 'standoff-editor-block', ...(mode === undefined ? {} : { mode }), text: 'A😀BCD',
  standoffProperties: [{ id: id + '-bold', type: 'style/bold', start: 0, end: 4 }], ...extra,
});
function setup(children: ExistingBlockDto[] = [paragraph('p', 'verse-line'), paragraph('q', 'verse-line')], enabled = true) {
  const editor = new ReactiveEditor({ id: 'doc', type: 'document-block', children }, { features: { blockModes: enabled } });
  editors.push(editor); const projection = editor.createView();
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const save = () => nativeText(captureNative(editor.repository.readState(), 'doc'));
  return { editor, projection, node, save };
}

it('authors, clears and undoes modes with explicit compatibility and no registration side effects', () => {
  const f = setup([paragraph('p', undefined), { id: 'group', type: 'container-block', children: [] }]);
  const baseline = f.save(), changed = vi.fn(); f.editor.repository.subscribeChanges(changed);
  const flags = f.editor.features, viewTypes = f.editor.registry.list(), effects = vi.spyOn(f.editor.visualEffects, 'registerType');
  const release = f.editor.blockModes.register({ mode: 'verse-line', appliesTo: ['standoff-editor-block'] }, 'test');
  f.editor.blockModes.get('verse-line'); f.editor.blockModes.list();
  expect(changed).not.toHaveBeenCalled(); expect(f.editor.repository.canUndo()).toBe(false);
  expect(f.editor.registry.list()).toEqual(viewTypes); expect(effects).not.toHaveBeenCalled(); expect(f.editor.features).toBe(flags);
  expect(() => f.editor.setBlockMode(f.node('group').key, 'verse-line')).toThrow('does not apply'); expect(f.save()).toBe(baseline);
  f.editor.setBlockMode(f.node('p').key, 'verse-line'); const authored = f.save();
  release(); expect(f.save()).toBe(authored);
  f.editor.setBlockMode(f.node('p').key, undefined); expect('mode' in f.node('p').payload).toBe(false);
  f.editor.repository.undo(); expect(f.save()).toBe(authored); f.editor.repository.undo(); expect(f.save()).toBe(baseline);
  f.editor.repository.redo(); expect(f.save()).toBe(authored);
});

it('preserves exact unknown modes, implementation types and Cells through native reload with authoring disabled', () => {
  const f = setup([paragraph('p', ' unknown/mode 😀 '), { id: 'group', type: 'container-block', mode: 'verse-group', children: [paragraph('child', 'verse-line')] }], false);
  const saved = f.save(), loaded = decodeNative(new TextEncoder().encode(saved));
  expect(nativeText(loaded)).toBe(saved);
  const state = resourceToRepository(loaded), p = Object.values(state.contents).find(c => c.payload.id === 'p')!;
  expect(p.payload.mode).toBe(' unknown/mode 😀 '); expect(p.viewType).toBe('standoff-editor-block'); expect(p.inlineKind).toBe('standoff'); expect(p.inlineContent).toHaveLength(5);
  expect(f.editor.blockModes.list()).toEqual([]);
  expect(() => f.editor.setBlockMode(f.node('p').key, undefined)).toThrow('disabled');
  f.editor.commands.replaceInlineRange(f.node('p').key, 1, 1, '!'); expect(f.node('p').payload.mode).toBe(p.payload.mode);
  f.editor.repository.undo(); expect(f.save()).toBe(saved);
});

it('keeps mode, surviving Cells and annotations on split, empty siblings and Undo/Redo with bounded work', () => {
  const f = setup([paragraph('p', 'verse-line'), ...Array.from({ length: 100 }, (_, i) => paragraph('other' + i, undefined))]);
  const baseline = f.save(), p = f.node('p'), cells = [...f.editor.repository.readState().contents[p.contentKey].inlineContent], other = f.node('other99');
  const unaffected = f.editor.repository.readState().contents[other.contentKey];
  const spies = [vi.spyOn(f.editor.repository, 'snapshot'), vi.spyOn(f.editor.repository as any, 'rebuildReferences'), vi.spyOn(f.projection as any, 'build'), vi.spyOn(f.editor.blockModes, 'get'), vi.spyOn(f.editor.blockModes, 'list')];
  const right = f.editor.commands.splitStandoff(p.key, 2), rightNode = f.projection.nodeForPlacement(right)!;
  expect(rightNode.payload.mode).toBe('verse-line'); expect(rightNode.payload.id).not.toBe('p');
  expect(f.editor.repository.readState().contents[rightNode.contentKey].inlineContent).toEqual(cells.slice(2));
  expect(f.editor.repository.readState().contents[p.contentKey].inlineContent).toEqual(cells.slice(0, 2));
  expect(rightNode.payload.standoffProperties).toEqual([expect.objectContaining({ type: 'style/bold', start: 0, end: 2 })]);
  f.editor.repository.undo(); f.editor.repository.redo(); f.editor.repository.undo();
  const empty = f.editor.commands.insertEmptyStandoffSibling(p.key, 'after');
  expect(f.projection.nodeForPlacement(empty)!.payload.mode).toBe('verse-line');
  f.editor.repository.undo(); f.editor.repository.redo(); f.editor.repository.undo();
  spies.forEach(s => expect(s).not.toHaveBeenCalled());
  expect(f.editor.repository.hasValidStructuralEvidence).toBe(true);
  expect(f.editor.repository.readState().contents[other.contentKey]).toBe(unaffected);
  expect(f.save()).toBe(baseline); validateRepository(f.editor.repository.readState());
});

it.each([{ metadata: { sourceId: 'line-01' } }, { sourceId: 'line-01' }, { linkedAnnotations: { a: { id: 'a', type: 'custom' } } }, { blockProperties: [{ type: 'codex/block-reference', value: 'other' }] }])('refuses unsafe continuation without history or snapshots: %j', extra => {
  const f = setup([paragraph('p', 'verse-line', extra)]), saved = f.save(), snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  expect(() => f.editor.commands.splitStandoff(f.node('p').key, 2)).toThrow('policy');
  expect(() => f.editor.commands.insertEmptyStandoffSibling(f.node('p').key, 'after')).toThrow('policy');
  expect(f.save()).toBe(saved); expect(f.editor.repository.canUndo()).toBe(false); expect(snapshot).not.toHaveBeenCalled();
});

it.each([['verse-line', 'stage-direction'], ['verse-line', undefined], [undefined, 'verse-line'], ['verse-line', 'verse-line']])('refuses unsupported joins (%s / %s) before snapshots or history', (left, right) => {
  const f = setup([paragraph('p', left), paragraph('q', right)]), saved = f.save(), snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  expect(() => f.editor.commands.joinStandoff(f.node('p').key, f.node('q').key)).toThrow(/mode|Mode/);
  expect(snapshot).not.toHaveBeenCalled(); expect(f.save()).toBe(saved); expect(f.editor.repository.canUndo()).toBe(false);
});

it('retains existing unmoded join behaviour and refuses moded cross-Block consumption', () => {
  const f = setup([paragraph('p', undefined), paragraph('q', undefined)]), baseline = f.save();
  f.editor.commands.joinStandoff(f.node('p').key, f.node('q').key); f.editor.repository.undo(); expect(f.save()).toBe(baseline);
  f.editor.setBlockMode(f.node('q').key, 'verse-line'); const saved = f.save(), revision = f.editor.repository.state.revision;
  expect(() => f.editor.commands.replaceAcrossBlocks([{ placementKey: f.node('p').placementKey, start: 1, end: 5 }, { placementKey: f.node('q').placementKey, start: 0, end: 2 }], '')).toThrow('mode-bearing');
  expect(f.save()).toBe(saved); expect(f.editor.repository.state.revision).toBe(revision);
});

it('preserves mode in moves, graph duplication, list wrapping and text-tab wrapping; refuses dissolution', () => {
  const f = setup([{ id: 'group', type: 'container-block', mode: 'verse-group', children: [paragraph('p', 'verse-line')] }, paragraph('q', undefined)]);
  const baseline = f.save(), identity = f.node('p').contentKey;
  f.editor.commands.move(f.node('p').key, { kind: 'after', anchorKey: f.node('q').key });
  expect(f.node('p').contentKey).toBe(identity); expect(f.node('p').payload.mode).toBe('verse-line');
  const copy = f.editor.commands.copy(f.node('p').key, { kind: 'after', anchorKey: f.node('p').key });
  expect(f.projection.nodeForPlacement(copy)!.payload.mode).toBe('verse-line'); expect(f.projection.nodeForPlacement(copy)!.payload.id).not.toBe('p');
  const beforeRefusal = f.save(); expect(() => f.editor.commands.unwrap(f.node('group').key)).toThrow('Block Mode'); expect(f.save()).toBe(beforeRefusal);
  changeTextList(f.editor, f.node('p').key, false); expect(f.node('p').payload.mode).toBe('verse-line');
  changeTextList(f.editor, f.node('p').key, true); expect(f.node('p').payload.mode).toBe('verse-line');
  expect(createTextTab(f.editor, f.node('p').key)).toBe(true); expect(f.node('p').payload.mode).toBe('verse-line');
  for (let i = 0; i < 5; i++) f.editor.repository.undo(); expect(f.save()).toBe(baseline);
});

it('retains unknown modes in real clipboard data without registry admission or silent inline merging', () => {
  const f = setup([paragraph('p', 'unknown'), paragraph('q', undefined)]);
  const wire = serializeSelection(f.editor.repository.readState(), [{ placementKey: f.node('p').placementKey }]);
  const fragment = materializeFragment(wire), incoming = fragment.state.contents[fragment.state.placements[fragment.roots[0]].contentKey];
  expect(incoming.viewType).toBe('standoff-editor-block'); expect(incoming.payload.mode).toBe('unknown');
  const pasted = f.editor.commands.insertFragment(fragment, { kind: 'after', anchorKey: f.node('q').key });
  expect(f.projection.nodeForPlacement(pasted[0])!.payload.mode).toBe('unknown');
  const text = plainFragment('literal'), slice = { placementKey: f.node('p').placementKey, start: 1, end: 2 };
  f.editor.commands.insertMutableText([{ segments: [slice], fragment: materializeFragment(text), slices: text.roots }]);
  expect(f.node('p').payload.mode).toBe('unknown');
  const saved = f.save();
  expect(() => f.editor.commands.insertMutableText([{ segments: [{ ...slice, end: 1 }], fragment: materializeFragment(wire), slices: wire.roots }])).toThrow('Structural paste');
  expect(() => conversionSource(f.editor.repository.readState(), [slice])).toThrow('semantic policy');
  expect(f.save()).toBe(saved); expect(nativeText(decodeNative(new TextEncoder().encode(saved)))).toBe(saved);
});

it('leaves unavailable mode lifetimes independent of authored data and other editors', () => {
  const a = setup(), b = setup();
  const before = a.save();
  a.editor.featureHost.activate({ id: 'mode-test', activate(scope) { scope.own(a.editor.blockModes.register({ mode: 'verse-line' }, scope.owner)); } });
  expect(b.editor.blockModes.list()).toEqual([]);
  a.editor.featureHost.dispose(); expect(a.editor.blockModes.list()).toEqual([]); expect(a.save()).toBe(before);
  a.editor.dispose(); editors.splice(editors.indexOf(a.editor), 1);
  expect(() => a.editor.blockModes.register({ mode: 'late' }, 'test')).toThrow('disposed');
  expect(() => b.editor.blockModes.register({ mode: 'still-live' }, 'test')).not.toThrow();
});

it('preserves a background mode on descriptor edits and refuses implicit type conversion', () => {
  const f = setup([{ id: 'background', type: 'image-background-block', mode: 'unknown-background', metadata: { url: '/before.png' } }]);
  const key = f.node('background').key, baseline = f.save();
  expect(() => f.editor.commands.setBackground(key, { type: 'video-background-block' })).toThrow('Block Mode');
  expect(() => f.editor.commands.setBackground(key, { type: 'image-background-block', mode: undefined })).toThrow('Block Mode');
  expect(f.save()).toBe(baseline); expect(f.editor.repository.canUndo()).toBe(false);
  f.editor.commands.setBackground(key, { type: 'image-background-block', metadata: { url: '/after.png' } });
  expect(f.node('background').payload.mode).toBe('unknown-background');
  f.editor.repository.undo(); expect(f.save()).toBe(baseline);
});

it('refuses implicit replacement and list/container shell destruction while preserving explicit deletion', () => {
  const f = setup([{ id: 'list', type: 'indented-list-block', mode: 'unknown-list', children: [paragraph('p', 'verse-line')] },
    { id: 'group', type: 'container-block', mode: 'verse-group', children: [] },
    { id: 'source', type: 'plain-text-block', mode: 'unknown-source', text: 'source' }]);
  const saved = f.save();
  expect(() => f.editor.commands.replace(f.node('p').key, { type: 'standoff-editor-block', text: 'replacement' }, 'preserve')).toThrow('Block Mode');
  expect(() => f.editor.commands.replaceSourceWithFragment(materializeFragment(plainFragment('replacement')), f.node('source').key)).toThrow('Block Mode');
  expect(changeTextList(f.editor, f.node('p').key, true)).toBe(true);
  expect(f.editor.crossText.message()).toContain('Block Mode');
  f.editor.surfaces.run('container.dissolve', f.node('group').key);
  expect(f.editor.blockSelection.state.message).toContain('Block Mode');
  expect(f.save()).toBe(saved); expect(f.editor.repository.canUndo()).toBe(false);
  f.editor.commands.remove(f.node('group').key); expect(f.node('group')).toBeUndefined();
  f.editor.repository.undo(); expect(f.save()).toBe(saved);
});
