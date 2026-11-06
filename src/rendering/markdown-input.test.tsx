// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { markdownParser } from '../interchange/markdown-native';
import { blockMenuItems } from '../runtime/block-menu-actions';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(f => f()); document.body.replaceChildren(); vi.restoreAllMocks(); });
function setup(direct = true, initial = '', code = false, enabled = true) {
  const text = { id: 'text', type: 'standoff-editor-block', text: initial };
  const editor = new ReactiveEditor({ type: 'document-block', id: 'doc', children: [code ? { type: 'standoff-code-block', children: [text] } : text,
    { id: 'other-doc', type: 'document-block', children: [{ type: 'standoff-editor-block', text: 'unrelated'.repeat(1000) }] },
  ] }, { features: { directDomCharacterCells: direct, markdownInputTransformation: enabled } });
  registerCoreViews(editor); const projection = editor.createView('mit');
  const host = document.body.appendChild(document.createElement('div'));
  const stop = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
  editor.installGateway(document); cleanups.push(() => { stop(); editor.dispose(); });
  const node = () => Object.values(projection.state.nodes).find(n => n.payload.id === 'text')!;
  const mount = editor.mounts.get(node().key)!;
  const focus = (caret = node().inlineContent.length) => { mount.focus(); mount.restoreInlineSelection!({ anchor: caret, head: caret }); };
  focus();
  const type = async (text: string) => { for (const data of text) { mount.focusElement.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data, bubbles: true, cancelable: true })); await Promise.resolve(); } };
  const value = () => node().inlineContent.map(k => editor.node(k)!.payload.text).join('');
  const properties = () => (node().payload.standoffProperties ?? []) as any[];
  return { editor, projection, node, mount, focus, type, value, properties };
}
it.each([true, false])('converts complete runs, preserves Cells, rebases old annotations and bounds work (direct=%s)', async direct => {
  const f = setup(direct), snapshot = vi.spyOn(f.editor.repository, 'snapshot'), build = vi.spyOn(f.projection as any, 'build'), refs = vi.spyOn(f.editor.repository as any, 'rebuildReferences');
  const other = Object.values(f.projection.state.nodes).find(n => n.payload.id === 'other-doc')!;
  const unrelated = other.payload;
  await f.type('**😀é*'); expect(f.value()).toBe('**😀é*'); expect(f.properties()).toHaveLength(0);
  const cells = f.node().inlineContent.slice(2, 5);
  // Existing annotations can be authored during typing without replacing the body Cells.
  f.editor.commands.setPayloadField(f.node().key, 'standoffProperties', [{ id: 'old', type: 'style/italics', start: 2, end: 4 }]);
  // A property edit doesn't change inlineRevision, so the fresh delimiter provenance is retained.
  await f.type('*'); expect(f.value()).toBe('😀é'); expect(f.node().inlineContent).toEqual(cells);
  expect(f.properties()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'old', start: 0, end: 2 }), expect.objectContaining({ type: 'style/bold', start: 0, end: 2 })]));
  expect(f.mount.captureInlineSelection!()).toEqual({ anchor: 3, head: 3 });
  f.editor.repository.undo(); expect(f.value()).toBe('**😀é**'); expect(f.properties()).toHaveLength(1);
  f.editor.repository.redo(); expect(f.value()).toBe('😀é');
  expect(snapshot).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled(); expect(refs).not.toHaveBeenCalled(); expect(other.payload).toBe(unrelated);
});
it.each([1, 2, 3, 4, 5, 6])('creates H%s and restores complete prefix with one Undo', async level => {
  const f = setup(), snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  await f.type('#'.repeat(level) + ' '); expect(f.value()).toBe('');
  expect(f.node().payload.blockProperties).toContainEqual({ type: 'block/font/size', value: `h${level}` });
  expect(f.mount.captureInlineSelection!()).toEqual({ anchor: 0, head: 0 });
  f.editor.repository.undo(); expect(f.value()).toBe('#'.repeat(level) + ' ');
  f.editor.repository.undo(); expect(f.value()).toBe('#'.repeat(level));
  f.editor.repository.redo(); f.editor.repository.redo(); expect(f.value()).toBe(''); expect(snapshot).not.toHaveBeenCalled();
  const saved = f.editor.encodeDocument(), reload = new ReactiveEditor(saved); expect(reload.encodeDocument()).toEqual(saved); reload.dispose();
});
it.each([['*italic*', 'italic', ['style/italics']], ['***both***', 'both', ['style/italics', 'style/bold']], ['~~strike~~', 'strike', ['style/strikethrough']], ['[label](https://example.com)', 'label', ['reference/url']], ['**outer *inner* text**', 'outer inner text', ['style/bold', 'style/italics']], ['*a**b*', 'ab', ['style/italics', 'style/italics']]])('converts %s using native properties', async (input, output, styles) => {
  const f = setup(); await f.type(input as string); expect(f.value()).toBe(output); expect(f.properties().map(p => p.type).sort()).toEqual([...(styles as string[])].sort());
});
it.each(['a*b*c', '\\*literal*', '`*literal*`', '`unfinished *literal*', '******* ', '**bold*', '***both**', '[x](javascript:alert(1))'])('retains literal/incomplete %s', async source => {
  const f = setup(); await f.type(source); expect(f.value()).toBe(source); expect(f.properties()).toHaveLength(0);
});
it('ignores pre-existing and programmatically inserted delimiters, navigation, IME and CodeBlocks', async () => {
  for (const [initial, tail, code] of [['**old', '**', false], ['', '**code**', true]] as const) { const f = setup(true, initial, code); await f.type(tail); expect(f.value()).toBe(initial + tail); }
  const f = setup(); await f.type('**fresh');
  f.mount.focusElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await f.type('**'); expect(f.value()).toBe('**fresh**');
  f.editor.commands.replaceInlineRange(f.node().key, 0, f.node().inlineContent.length, '**program'); f.focus(); await f.type('**'); expect(f.value()).toBe('**program**');
  f.editor.commands.replaceInlineRange(f.node().key, 0, f.node().inlineContent.length, ''); f.focus();
  await f.type('*ime'); f.mount.focusElement.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertCompositionText', isComposing: true, data: '*', bubbles: true, cancelable: true }));
  expect(f.properties()).toHaveLength(0);
});
it('toggle is session-only, default-on, and ordinary typing never invokes the parser', async () => {
  const f = setup(), parse = vi.spyOn(markdownParser, 'parse'), snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  await f.type('ordinary words and spaces'); expect(parse).not.toHaveBeenCalled();
  const revision = f.editor.repository.state.revision;
  blockMenuItems(f.editor, f.node().key).find(i => i.label === 'Markdown Input Transformation: On')!.run!();
  expect(f.editor.repository.state.revision).toBe(revision); expect(f.editor.markdownInput.enabled()).toBe(false);
  await f.type(' **literal**'); expect(f.properties()).toHaveLength(0); expect(parse).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
  const off = setup(true, '', false, false); expect(off.editor.markdownInput.enabled()).toBe(false); await off.type('*literal*'); expect(off.value()).toBe('*literal*');
});
it.each([['##', ' '], ['**literal*', '*']])('protects literal annotations when completing %s', async (prefix, closing) => {
  const f = setup(); await f.type(prefix);
  f.editor.commands.setPayloadField(f.node().key, 'standoffProperties', [{ type: 'text/literal', start: 0, end: prefix.length - 1 }]);
  await f.type(closing); expect(f.value()).toBe(prefix + closing);
  expect(f.node().payload.blockProperties ?? []).toHaveLength(0);
  expect(f.properties()).toHaveLength(1);
});
it.each([true, false])('creates a horizontal line on the third hyphen with bounded Undo and retained continuation (direct=%s)', async direct => {
  const f = setup(direct, 'keep 😀'); f.focus(0);
  f.editor.commands.setPayloadField(f.node().key, 'standoffProperties', [{ id: 'kept', type: 'style/italics', start: 0, end: 5 }]);
  const cells = [...f.node().inlineContent], element = f.mount.focusElement;
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot'), build = vi.spyOn(f.projection as any, 'build'), refs = vi.spyOn(f.editor.repository as any, 'rebuildReferences');
  await f.type('--'); expect(document.querySelector('hr')).toBeNull(); expect(f.value()).toBe('--keep 😀');
  await f.type('-');
  expect(f.editor.node(f.projection.state.nodes[f.projection.state.rootKey].children[0])?.viewType).toBe('horizontal-line-block');
  expect(document.querySelector('[data-block-type="horizontal-line-block"] hr')).not.toBeNull();
  expect(f.value()).toBe('keep 😀'); expect(f.node().inlineContent).toEqual(cells);
  expect(f.properties()).toMatchObject([{ id: 'kept', start: 0, end: 5 }]);
  expect(f.editor.mounts.get(f.node().key)!.focusElement).toBe(element);
  expect(document.activeElement).toBe(element);
  expect(f.mount.captureInlineSelection!()).toEqual({ anchor: 0, head: 0 });
  f.editor.repository.undo(); expect(f.value()).toBe('---keep 😀'); expect(document.querySelector('hr')).toBeNull();
  f.editor.repository.redo(); expect(f.value()).toBe('keep 😀'); expect(document.querySelector('hr')).not.toBeNull();
  expect(snapshot).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled(); expect(refs).not.toHaveBeenCalled();
  const saved = f.editor.encodeDocument(), reload = new ReactiveEditor(saved); expect(reload.encodeDocument()).toEqual(saved); reload.dispose();
});
it('keeps horizontal-line literals in code, disabled MIT, existing prefixes and noninitial positions', async () => {
  for (const [initial, typed, code, enabled] of [['', '---', true, true], ['', '---', false, false], ['--', '-', false, true], ['x', '---', false, true]] as const) {
    const f = setup(true, initial, code, enabled); await f.type(typed);
    expect(f.value()).toBe(initial + typed);
    expect(f.editor.encodeDocument().children!.some(n => n.type === 'horizontal-line-block')).toBe(false);
  }
  const f = setup(); await f.type('---'); expect(f.value()).toBe('');
  await f.type('next'); expect(f.value()).toBe('next');
  expect(f.editor.node(f.projection.state.nodes[f.projection.state.rootKey].children[0])?.viewType).toBe('horizontal-line-block');
});
