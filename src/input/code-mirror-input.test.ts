// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { ReactiveEditor } from '../reactive-editor/editor';
import { mountCodeMirrorInput } from './code-mirror-input';
import { chord, keyboard } from './bindings';
import { affiliateEditorInput, currentEditorInput } from '../runtime/editor-input';
import { dispatchEditorSave } from './editor-global-input';

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); document.body.replaceChildren(); vi.restoreAllMocks(); });
function fixture(extra = 0) {
  const editor = new ReactiveEditor({ type: 'document-block', children: [
    { type: 'plain-text-block', text: 'before' }, { type: 'input-code', text: 'abc' }, { type: 'plain-text-block', text: 'after' },
    ...Array.from({ length: extra }, () => ({ type: 'plain-text-block', text: 'unrelated' })),
  ] });
  cleanup.push(() => editor.dispose());
  editor.registry.register({ type: 'plain-text-block', view: () => null, capabilities: ['native-text'] });
  editor.registry.register({ type: 'input-code', view: () => null, capabilities: ['self-managed-editor'] });
  const projection = editor.createView('input-test'); const keys = projection.state.nodes[projection.state.rootKey].children;
  for (const index of [0, 2]) {
    const text = document.body.appendChild(document.createElement('textarea')); text.value = index ? 'after' : 'before';
    cleanup.push(editor.mounts.register(keys[index], { root: text, focusElement: text, inputPolicy: 'native-text', focus: () => text.focus(), restoreSelection: s => text.setSelectionRange(s.start, s.end) }));
  }
  cleanup.push(editor.installGateway(document));
  const run = vi.fn(), native = vi.fn(() => true);
  editor.bindings.register({ id: 'probe', name: 'Probe', description: '', category: '', tags: [], scope: 'editor', defaults: [keyboard('F8')], handler: context => context.run('probe') });
  editor.commandRegistry.register({ id: 'probe', label: 'Probe', canExecute: () => true, execute: run });
  const root = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({ parent: root, state: EditorState.create({ doc: 'abc', extensions: [EditorState.allowMultipleSelections.of(true), keymap.of([{ key: 'F8', run: native }, { key: 'F9', run: native }])] }) });
  cleanup.push(() => view.destroy());
  const input = mountCodeMirrorInput({ editor, nodeKey: keys[1], root, view, actions: ['probe'] }); cleanup.push(input.dispose);
  return { editor, projection, keys, root, view, input, run, native };
}
function press(view: EditorView, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }); view.contentDOM.dispatchEvent(event); return event;
}

it('dispatches a live remapped Mutable command exactly once and lets native keys fall through', () => {
  const f = fixture(); f.view.focus(); press(f.view, 'F8'); expect(f.run).toHaveBeenCalledTimes(1); expect(f.native).not.toHaveBeenCalled();
  f.editor.bindings.assign('probe', [keyboard('F9')]); press(f.view, 'F8'); press(f.view, 'F9');
  expect(f.run).toHaveBeenCalledTimes(2); expect(f.native).toHaveBeenCalledTimes(1);
});
it('filters unsupported prefixes before consumption and preserves supported chords', () => {
  const f = fixture(); f.view.focus();
  f.editor.bindings.register({ id: 'unsupported', name: 'Unsupported', description: '', category: '', tags: [], scope: 'editor', defaults: [chord(keyboard('q', 'Ctrl'), keyboard('u'))], handler: () => { throw Error('unsupported'); } });
  expect(press(f.view, 'q', { ctrlKey: true }).defaultPrevented).toBe(false);
  f.editor.bindings.assign('probe', [chord(keyboard('q', 'Ctrl'), keyboard('p'))]);
  expect(press(f.view, 'q', { ctrlKey: true }).defaultPrevented).toBe(true); press(f.view, 'p'); expect(f.run).toHaveBeenCalledOnce();
});
it('rechecks chord applicability and clears prefixes on focus transfer', () => {
  const f = fixture(); f.view.focus(); f.editor.bindings.assign('probe', [chord(keyboard('q', 'Ctrl'), keyboard('p'))]);
  press(f.view, 'q', { ctrlKey: true }); f.editor.mounts.get(f.keys[0])!.focus();
  expect(f.editor.bindings.hasPendingChord()).toBe(false); f.view.focus(); press(f.view, 'p'); expect(f.run).not.toHaveBeenCalled();
});
it('focuses native start/end and navigates to the existing adjacent blocks', () => {
  const f = fixture(); f.editor.focus.request(f.keys[1], { caret: 'end' }); expect(f.view.state.selection.main.head).toBe(3);
  press(f.view, 'ArrowRight'); expect(document.activeElement).toBe(f.editor.mounts.get(f.keys[2])!.focusElement); expect(currentEditorInput(document)).toBeUndefined();
  f.editor.focus.request(f.keys[1], { caret: 'start' }); expect(f.view.state.selection.main.head).toBe(0);
  press(f.view, 'ArrowLeft'); const before = f.editor.mounts.get(f.keys[0])!.focusElement as HTMLTextAreaElement;
  expect(document.activeElement).toBe(before); expect(before.selectionStart).toBe(before.value.length);
  before.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(f.view.contentDOM);
  expect(currentEditorInput(document)?.handle).toBe(f.input.handle);
});

it('releases ownership when the SDK view is destroyed directly', () => {
  const f = fixture(); f.view.focus(); f.view.destroy();
  expect(currentEditorInput(document)).toBeUndefined(); expect(f.editor.mounts.get(f.keys[1])).toBeUndefined();
});
it('does not exit for Shift, multiple cursors, composition or a refused destination', () => {
  const f = fixture(); f.view.focus();
  expect(press(f.view, 'ArrowLeft', { shiftKey: true }).defaultPrevented).toBe(false);
  f.view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(2)]) });
  expect(press(f.view, 'ArrowLeft').defaultPrevented).toBe(false);
  f.view.dispatch({ selection: { anchor: 0 } }); expect(press(f.view, 'ArrowLeft', { isComposing: true }).defaultPrevented).toBe(false);
  f.editor.focus.permit = key => key !== f.keys[0]; expect(press(f.view, 'ArrowLeft').defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(f.view.contentDOM);
});
it('keeps programmatic selection in an unfocused editor from acquiring ownership', () => {
  const f = fixture(); f.editor.mounts.get(f.keys[0])!.focus(); f.view.dispatch({ selection: { anchor: 2 } });
  expect(currentEditorInput(document)).toBeUndefined();
});
it('synchronises native read-only and preserves canonical text admission', () => {
  const f = fixture(); f.view.focus(); const release = f.editor.textProtection.protect(f.editor.node(f.keys[1])!.contentKey); cleanup.push(release);
  f.input.syncPermissions(); expect(f.view.state.readOnly).toBe(true);
  f.view.dispatch({ changes: { from: 0, insert: 'X' } }); expect(f.view.state.doc.toString()).toBe('abc');
  expect(() => f.editor.commands.setPayloadField(f.keys[1], 'text', 'X')).toThrow(/protected/);
  release(); f.input.syncPermissions(); expect(f.view.state.readOnly).toBe(false);
  f.view.dispatch({ changes: { from: 0, insert: 'X' } }); expect(f.view.state.doc.toString()).toBe('Xabc');
});
it('boundary routing and caret movement do no canonical work or Flint reconciliation with unrelated blocks', () => {
  const f = fixture(250); f.view.focus();
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot'), commit = vi.spyOn(f.editor.repository, 'commit');
  const encode = vi.spyOn(f.editor, 'encodeDocument'), payload = vi.spyOn(f.editor.commands, 'setPayloadField');
  const completion = vi.fn(() => false); f.editor.completionInput = { key: completion, input: completion, edited() {}, cancel() {} };
  for (let i = 0; i < 40; i++) {
    f.view.dispatch({ selection: { anchor: i % 3 } });
    f.view.contentDOM.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
    document.dispatchEvent(new Event('selectionchange'));
    press(f.view, 'F10');
  }
  expect(completion).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
  expect(payload).not.toHaveBeenCalled(); expect(encode).not.toHaveBeenCalled();
});
it('complete global reservations cannot compete with a local chord session', () => {
  const f = fixture(), save = vi.fn(() => true); f.view.focus();
  const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
  expect(f.editor.bindings.dispatchReserved(event, ['workspace'], save, a => a.id === 'document.save')).toBe(true);
  expect(f.editor.bindings.dispatchReserved(event, ['workspace'], save, a => a.id === 'document.save')).toBe(false); expect(save).toHaveBeenCalledOnce();
  f.editor.bindings.assign('probe', [chord(keyboard('q', 'Ctrl'), keyboard('p'))]); press(f.view, 'q', { ctrlKey: true });
  expect(f.editor.bindings.dispatchReserved(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }), ['workspace'], save, a => a.id === 'document.save')).toBe(false);
});

it('affiliated fields dispatch global chords without exposing local commands', () => {
  const f = fixture(), save = vi.fn(); f.view.focus();
  const field = document.body.appendChild(document.createElement('input'));
  const close = affiliateEditorInput(f.input.handle, field); cleanup.push(close);
  f.editor.bindings.assign('document.save', [chord(keyboard('q', 'Ctrl'), keyboard('7'))]);
  f.editor.bindings.assign('probe', [chord(keyboard('q', 'Ctrl'), keyboard('8'))]);
  field.addEventListener('keydown', event => dispatchEditorSave(event, f.editor.bindings, save));
  field.focus();
  for (const [key, ctrlKey] of [['q', true], ['7', false], ['q', true], ['8', false]] as const) field.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true }));
  expect(save).toHaveBeenCalledOnce(); expect(f.run).not.toHaveBeenCalled(); expect(currentEditorInput(document)).toBeUndefined();
});

it('ordinary demo payload commits stay bounded as unrelated content grows', () => {
  for (const size of [0, 250]) {
    const f = fixture(size), snapshot = vi.spyOn(f.editor.repository, 'snapshot');
    const rebuild = vi.spyOn(f.projection as unknown as { build(): void }, 'build'), references = vi.spyOn(f.editor.repository as unknown as { rebuildReferences(): void }, 'rebuildReferences');
    const commit = f.editor.repository.commit.bind(f.editor.repository);
    // Any fallback to repository-wide planning fails this regression check.
    vi.spyOn(f.editor.repository, 'commit').mockImplementation((label, operations, history, metadata) => commit(label, operations, history, { ...metadata, requireBounded: true }));
    const records: number[] = [];
    cleanup.push(f.editor.repository.subscribeChanges(change => records.push(change.previousContents.size)));
    for (let i = 0; i < 20; i++) f.editor.commands.setPayloadField(f.keys[1], 'text', 'abc' + i);
    expect(records).toEqual(Array(20).fill(1)); expect(snapshot).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled(); expect(references).not.toHaveBeenCalled();
  }
});
