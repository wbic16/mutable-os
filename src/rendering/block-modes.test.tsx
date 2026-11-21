// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { StandoffEditorView } from './standoff-editor-view';
import { captureNative, nativeText } from '../persistence/native-resource';
import type { ExistingBlockDto } from '../block-tree/types';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(f => f()); vi.restoreAllMocks(); document.body.replaceChildren(); });
const text = (id: string, mode: string | undefined = 'verse-line', value = 'A😀BC'): ExistingBlockDto => ({ id, type: 'standoff-editor-block', text: value, ...(mode === undefined ? {} : { mode }), standoffProperties: [{ id: id + '-bold', type: 'style/bold', start: 0, end: 3 }] });
function setup(children: ExistingBlockDto[] = [{ id: 'group', type: 'container-block', mode: 'verse-group', children: [text('p'), text('q')] }], enabled = true) {
  const editor = new ReactiveEditor({ id: 'doc', type: 'document-block', children }, { features: { blockModes: enabled } });
  registerCoreViews(editor); const projection = editor.createView(), host = document.body.appendChild(document.createElement('div'));
  const unmount = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanups.push(() => { unmount(); editor.dispose(); host.remove(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const select = (id: string, start: number, end = start) => {
    const n = node(id), mount = editor.mounts.get(n.key)!;
    mount.focus(); mount.restoreInlineSelection!({ anchor: start, head: end }); editor.selections.setPrimary(n.key, n.contentKey, n.viewId, start, end);
    return mount.focusElement;
  };
  const input = (id: string, start: number, inputType: string, data: string | null = null, end = start) => {
    const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true }); select(id, start, end).dispatchEvent(event); return event;
  };
  const value = (id: string) => node(id).inlineContent.map(k => projection.state.nodes[k].payload.text).join('');
  const save = () => nativeText(captureNative(editor.repository.readState(), 'doc'));
  return { editor, projection, host, node, select, input, value, save };
}

it('uses the existing mounted editor inside a moded container, without registry reads or unrelated work', async () => {
  const f = setup(), baseline = f.save(), p = f.node('p'), q = f.node('q');
  expect(f.editor.registry.resolve(p.viewType)?.view).toBe(StandoffEditorView);
  expect(f.host.querySelector('[data-block-id="group"] [data-block-id="p"]')).not.toBeNull();
  const originalCell = p.inlineContent[1], unaffected = f.editor.repository.readState().contents[q.contentKey];
  const spies = [vi.spyOn(f.editor.blockModes, 'get'), vi.spyOn(f.editor.blockModes, 'list'), vi.spyOn(f.editor.registry, 'list'),
    vi.spyOn(f.editor.repository, 'snapshot'), vi.spyOn(f.editor.repository as any, 'rebuildReferences'), vi.spyOn(f.projection as any, 'build'),
    vi.spyOn(f.editor.persistence, 'saveDocument'), vi.spyOn(f.editor, 'encodeDocument'), vi.spyOn(globalThis, 'fetch')];
  expect(f.input('p', 1, 'insertText', 'x').defaultPrevented).toBe(true); await Promise.resolve();
  const flow = f.editor.mounts.get(p.key)!.focusElement;
  flow.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'y', bubbles: true, cancelable: true })); await Promise.resolve();
  expect(f.value('p')).toBe('Axy😀BC'); expect(p.inlineContent[3]).toBe(originalCell);
  expect(f.editor.mounts.get(p.key)!.captureInlineSelection!()).toMatchObject({ anchor: 3, head: 3 });
  f.editor.rangeAnnotations.apply([f.editor.textRanges.snapshot(p.key, 3, 4)], 'editorial-deletion');
  expect(p.payload.mode).toBe('verse-line'); expect(f.node('group').payload.mode).toBe('verse-group');
  f.editor.repository.undo(); f.editor.repository.redo(); f.editor.repository.undo(); f.editor.repository.undo(); f.editor.repository.undo();
  spies.forEach(s => expect(s).not.toHaveBeenCalled()); expect(f.editor.repository.readState().contents[q.contentKey]).toBe(unaffected);
  expect(f.save()).toBe(baseline);
});

it.each([[0, 0], [2, 2], [4, 4], [0, 2], [2, 4], [1, 3]])('preserves mode on mounted Enter at %i..%i and undoes atomically', async (start, end) => {
  const f = setup([text('p')]), baseline = f.save();
  expect(f.input('p', start, 'insertParagraph', null, end).defaultPrevented).toBe(true); await Promise.resolve();
  const children = f.projection.state.nodes[f.projection.state.rootKey].children.map(k => f.projection.state.nodes[k]);
  expect(children).toHaveLength(2); expect(children.map(n => n.payload.mode)).toEqual(['verse-line', 'verse-line']);
  expect(new Set(children.map(n => n.payload.id)).size).toBe(2); expect(children.some(n => n.payload.id === 'p')).toBe(true);
  f.editor.repository.undo(); expect(f.save()).toBe(baseline); f.editor.repository.redo();
  expect(f.projection.state.nodes[f.projection.state.rootKey].children).toHaveLength(2);
});

it('refuses unsafe selected Enter before deleting text, keeping revision, history and source metadata intact', () => {
  const f = setup([{ ...text('p'), metadata: { sourceId: 'source-line-1' } }]), saved = f.save(), revision = f.editor.repository.state.revision;
  expect(f.input('p', 1, 'insertParagraph', null, 3).defaultPrevented).toBe(true);
  expect(f.save()).toBe(saved); expect(f.editor.repository.state.revision).toBe(revision); expect(f.editor.repository.canUndo()).toBe(false);
  expect(f.editor.crossText.message()).toContain('continuation policy');
});

it.each([true, false])('guards both deletion boundaries and empty mode-bearing Blocks even with authoring=%s', enabled => {
  const f = setup([text('p', 'verse-line', ''), { ...text('q'), mode: 'other' }], enabled), saved = f.save();
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  expect(f.input('q', 0, 'deleteContentBackward').defaultPrevented).toBe(true);
  expect(f.input('p', 0, 'deleteContentForward').defaultPrevented).toBe(true);
  expect(f.save()).toBe(saved); expect(snapshot).not.toHaveBeenCalled(); expect(f.editor.repository.canUndo()).toBe(false);
  expect(f.editor.crossText.message()).toContain('different modes');
});

it('keeps mode through the existing composition reconciliation and commits only at composition end', () => {
  const f = setup([text('p')]), saved = f.save(), flow = f.select('p', 0), mount = f.editor.mounts.get(f.node('p').key)!;
  flow.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); expect(mount.composing).toBe(true);
  flow.querySelector('[data-inline-index="0"]')!.firstChild!.textContent = '漢';
  flow.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: '漢' }));
  expect(f.save()).toBe(saved); expect(f.editor.repository.canUndo()).toBe(false);
  flow.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '漢' }));
  expect(f.value('p')).toBe('漢😀BC'); expect(f.node('p').payload.mode).toBe('verse-line');
  f.editor.repository.undo(); expect(f.save()).toBe(saved);
});
