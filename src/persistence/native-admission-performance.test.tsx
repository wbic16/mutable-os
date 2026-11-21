// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createComputed, createRoot } from 'solid-js';
import { decodeBlockTree } from '../block-tree/codecs';
import { ReactiveEditor } from '../reactive-editor/editor';
import { convertTei } from '../interchange/tei/convert';
import { encodeTeiNative } from '../interchange/tei/compact-native';
import { admitNative, captureNative, decodeNative, nativeBytes } from './native-resource';
import { nativeDocumentSession } from './native-session';
import type { JsonObject } from '../block-tree/types';
import { validateResource, type ResourceSnapshot } from '../history/stage-c-gates/resource';
import { pageForNode } from '../runtime/minimap';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const source = () => convertTei('<TEI><text><p><persName ref="#missing">Alice</persName></p></text></TEI>').document;

it('finds the enclosing Page without enumerating the projected Cell table and retains inline-Cell exclusion', () => {
  const editor = new ReactiveEditor({ type: 'document-block', id: 'd', children: [{ type: 'page-block', id: 'page', children: [{ type: 'standoff-editor-block', id: 'text', text: 'x'.repeat(4000) }] }] });
  cleanup.push(() => editor.dispose()); const view = editor.createView();
  const nodes = Object.values(view.state.nodes), text = nodes.find(n => n.payload.id === 'text')!, page = nodes.find(n => n.payload.id === 'page')!;
  const values = Object.values; let scans = 0;
  vi.spyOn(Object, 'values').mockImplementation((table: any) => { if (table === view.state.nodes) scans++; return values(table); });
  for (let i = 0; i < 20; i++) expect(pageForNode(editor, text.key)).toBe(page.key);
  expect(pageForNode(editor, text.inlineContent[0])).toBeUndefined();
  expect(scans).toBe(0);
});

it('keeps the single-key store path for a fresh prototype-named record and isolates caller/history data', () => {
  const editor = new ReactiveEditor({ type: 'standoff-editor-block', id: 't', text: '' });
  cleanup.push(() => editor.dispose());
  const state = editor.repository.readState(), owner = state.contents[state.placements[state.rootPlacementKey].contentKey];
  const template = decodeBlockTree({ type: 'standoff-editor-block', id: 'sample', text: 'Z' }).state;
  const cell = { ...Object.values(template.contents).find(c => c.viewType === 'text-cell')!, key: 'prototype' };
  editor.repository.commit('Add unusual Cell key', [{ kind: 'record-batch', contents: {
    prototype: cell, [owner.key]: { ...owner, inlineContent: ['p:new'] },
  }, placements: { 'p:new': { key: 'p:new', kind: 'inline', contentKey: 'prototype' } } }]);
  cell.payload.text = 'caller mutation';
  expect(editor.repository.readState().contents.prototype.payload.text).toBe('Z');
  editor.repository.undo(); expect(Object.hasOwn(editor.repository.readState().contents, 'prototype')).toBe(false);
  editor.repository.redo(); expect(editor.repository.readState().contents.prototype.payload.text).toBe('Z');
});

it('validates all leaf targets without allocating ancestry Sets proportional to Cell count', () => {
  const resource = captureNative(decodeBlockTree({ type: 'document-block', id: 'd', children: [{ type: 'standoff-editor-block', id: 't', text: 'x'.repeat(500) }] }).state, 'd');
  const mutable = structuredClone(resource) as ResourceSnapshot, OriginalSet = Set;
  let allocations = 0;
  vi.stubGlobal('Set', class extends OriginalSet { constructor(values?: any) { super(values); allocations++; } });
  validateResource(mutable);
  expect(allocations).toBeLessThan(25);
  const last = Object.values(mutable.placements).filter(p => p.kind === 'inline').at(-1)!;
  last.target = { kind: 'local', contentKey: 'missing' };
  expect(() => validateResource(mutable)).toThrow(/missing owned target/);
});

it('reuses the owned validated capture without a second whole-resource clone, keeping immutable isolation', () => {
  const dto = source(), state = decodeBlockTree(dto).state;
  const copy = vi.spyOn(globalThis, 'structuredClone');
  const captured = captureNative(state, dto.id!);
  expect(copy.mock.calls.filter(([value]) => (value as any)?.format === 'codex-resource-gate')).toHaveLength(0);
  const cell = Object.values(state.contents).find(c => c.viewType === 'text-cell')!;
  const text = Object.values(state.contents).find(c => c.viewType === 'standoff-editor-block')!;
  const bytes = nativeBytes(captured);
  expect(Object.isFrozen(captured.contents[cell.key].payload)).toBe(true);
  expect(Object.isFrozen(cell.payload)).toBe(false);
  cell.payload.text = 'Z';
  (text.payload.standoffProperties as JsonObject[])[0].start = 1;
  expect(nativeBytes(captured)).toEqual(bytes);
  expect(() => decodeNative(bytes)).not.toThrow();
});

it('retains the transformed-graph validation path for implicit foreign definitions without aliasing canonical properties', () => {
  const state = decodeBlockTree({ type: 'workspace-block', id: 'w', linkedAnnotations: { shared: { type: 'tei/semantic', value: 'Alice' } }, children: [
    { type: 'document-block', id: 'd', children: [{ type: 'standoff-editor-block', id: 't', text: 'Alice', standoffProperties: [{ id: 'p', type: 'tei/semantic', annotationId: 'shared', start: 0, end: 4, metadata: { note: 'original' } }] }] },
  ] }).state;
  const copy = vi.spyOn(globalThis, 'structuredClone'), captured = captureNative(state, 'd');
  expect(copy.mock.calls.filter(([value]) => (value as any)?.format === 'codex-resource-gate')).toHaveLength(1);
  const text = Object.values(state.contents).find(c => c.viewType === 'standoff-editor-block')!;
  const properties = captured.contents[text.key].payload.standoffProperties as any[];
  expect(properties[0].externalDefinition.target.source).toEqual({ scope: 'workspace', resourceId: 'w' });
  const original = (text.payload.standoffProperties as JsonObject[])[0];
  expect(original.externalDefinition).toBeUndefined();
  (original.metadata as JsonObject).note = 'changed';
  expect(properties[0].metadata.note).toBe('original');
  expect(() => decodeNative(nativeBytes(captured))).not.toThrow();
});

it('still rejects missing canonical definition provenance before registering a candidate', () => {
  const editor = new ReactiveEditor({ type: 'document-block', id: 'd', children: [{ type: 'standoff-editor-block', text: 'x', standoffProperties: [{ type: 'tei/semantic', annotationId: 'missing', start: 0, end: 0 }] }] });
  cleanup.push(() => editor.dispose());
  const session = nativeDocumentSession(editor);
  expect(() => session.trackCandidate('d')).toThrow(/ownership|provenance/);
  expect(session.isCandidate('d')).toBe(false);
});

it('publishes a complete admission once without an unrelated projection rebuild, and preserves Undo/Redo', () => {
  const editor = new ReactiveEditor({ type: 'workspace-block', id: 'w', children: [
    { type: 'workspace-object-bank-block', id: 'bank', children: [] },
    { type: 'document-block', id: 'other', children: [{ type: 'standoff-editor-block', text: 'x'.repeat(4000) }] },
  ] });
  cleanup.push(() => editor.dispose());
  const state = editor.repository.readState(), bank = Object.values(state.contents).find(c => c.payload.id === 'bank')!;
  const other = Object.values(state.contents).find(c => c.payload.id === 'other')!;
  const placement = [...editor.repository.ownedPlacementKeys(other.key)][0];
  const workspace = editor.createView(), unrelated = editor.createView(undefined, placement);
  const build = vi.spyOn(unrelated as any, 'build'), snapshot = vi.spyOn(editor.repository, 'snapshot');
  let events = 0, reactive = 0, bankObservers = 0;
  const revision = state.revision;
  const assertComplete = () => {
    const current = editor.repository.readState();
    expect(current.contents[bank.key].children).toHaveLength(1);
    for (const p of Object.values(current.placements)) if (!p.externalReference) expect(current.contents[p.contentKey]).toBeDefined();
  };
  const stop = editor.repository.subscribeChanges(() => { events++; assertComplete(); });
  let stopReactive = () => {};
  createRoot(dispose => {
    stopReactive = dispose;
    createComputed(() => { if (editor.repository.state.revision > revision) { reactive++; assertComplete(); } });
    createComputed(() => { if (editor.repository.state.contents[bank.key].children.length) { bankObservers++; assertComplete(); } });
  });
  const dto = source(), timings: Record<string, number> = {};
  admitNative(editor.repository, encodeTeiNative(dto).bytes, bank.key, timings);
  stop(); stopReactive();
  expect(events).toBe(1); expect(reactive).toBe(1); expect(bankObservers).toBe(1);
  expect(build).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
  expect(workspace.state.revision).toBe(editor.repository.state.revision);
  const session = nativeDocumentSession(editor); session.trackCandidate(dto.id!);
  expect(session.isDirty(dto.id!)).toBe(true); expect(session.isCandidate(dto.id!)).toBe(true);
  const captured = nativeBytes(captureNative(editor.repository.readState(), dto.id!));
  editor.repository.undo(); expect(editor.repository.readState().contents[bank.key].children).toHaveLength(0);
  editor.repository.redo(); expect(nativeBytes(captureNative(editor.repository.readState(), dto.id!))).toEqual(captured);
});
