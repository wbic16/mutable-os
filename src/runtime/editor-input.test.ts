// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { MountRegistry } from './mounts';
import { affiliateEditorInput, currentEditorInput, editorInputBoundary } from './editor-input';

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); document.body.replaceChildren(); vi.restoreAllMocks(); });
function surface(mounts = new MountRegistry(), key = 'editor') {
  const root = document.body.appendChild(document.createElement('div'));
  const content = root.appendChild(document.createElement('textarea'));
  const activate = vi.fn(), deactivate = vi.fn();
  const descriptor = { root, focusElement: content, inputPolicy: 'opaque-widget' as const, focus: () => content.focus(), editorInput: {
    ownership: 'self-managed' as const, root,
    readContext: () => document.activeElement === content ? 'content' as const : 'outside' as const,
    onActivate: activate, onDeactivate: deactivate,
  } };
  const dispose = mounts.register(key, descriptor); cleanup.push(dispose);
  return { mounts, root, content, activate, deactivate, descriptor, dispose, handle: mounts.get(key)! };
}
const pointer = (target: Element) => target.dispatchEvent(new Event('pointerdown', { bubbles: true }));

it('acquires only on engagement, stays stable during selection, releases to Mutable', () => {
  const a = surface(); expect(currentEditorInput(document)).toBeUndefined();
  a.content.focus(); expect(currentEditorInput(document)?.handle).toBe(a.handle);
  for (let i = 0; i < 20; i++) document.dispatchEvent(new Event('selectionchange'));
  expect(a.activate).toHaveBeenCalledTimes(1);
  document.body.appendChild(document.createElement('input')).focus();
  expect(currentEditorInput(document)).toBeUndefined(); expect(a.deactivate).toHaveBeenCalledTimes(1);
});
it('transfers across registries without delayed focusout revoking the winner', async () => {
  const a = surface(), b = surface(); a.content.focus(); b.content.focus();
  await Promise.resolve(); expect(currentEditorInput(document)?.handle).toBe(b.handle);
  a.dispose(); expect(currentEditorInput(document)?.handle).toBe(b.handle);
});
it('releases on outside nonfocusable click, ignores passive selection, reacquires on a fresh key', () => {
  const a = surface(); a.content.focus(); pointer(document.body);
  document.dispatchEvent(new Event('selectionchange')); expect(currentEditorInput(document)).toBeUndefined();
  a.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
  expect(currentEditorInput(document)?.handle).toBe(a.handle);
});
it('keeps source classification after blur without retaining authority', () => {
  const a = surface(); a.content.focus(); window.dispatchEvent(new Event('blur'));
  expect(currentEditorInput(document)).toBeUndefined();
  let boundary: unknown;
  a.content.addEventListener('compositionend', event => boundary = editorInputBoundary(event));
  a.content.dispatchEvent(new Event('compositionend', { bubbles: true }));
  expect((boundary as any).handle).toBe(a.handle); expect(currentEditorInput(document)).toBeUndefined();
  window.dispatchEvent(new Event('focus')); expect(currentEditorInput(document)?.handle).toBe(a.handle);
});
it('uses live identity when generation is reused, including stale disposer and event aliases', () => {
  const a = surface(); a.content.focus(); a.mounts.releaseOccurrence('editor');
  const b = surface(a.mounts); expect(b.handle.generation).toBe(a.handle.generation);
  b.content.focus(); a.dispose(); expect(a.mounts.get('editor')).toBe(b.handle);
  expect(currentEditorInput(document)?.handle).toBe(b.handle);
  expect(a.mounts.resolveElement(a.root)).toBeUndefined();
});
it('removes old root aliases on ordinary replacement', () => {
  const a = surface(), b = surface(a.mounts); b.content.focus(); a.dispose();
  expect(a.mounts.resolveElement(a.root)).toBeUndefined(); expect(currentEditorInput(document)?.handle).toBe(b.handle);
});
it('affiliates portal fields without claiming editor keyboard input and restores a valid context', () => {
  const a = surface(); a.content.focus();
  const popup = document.body.appendChild(document.createElement('input'));
  const release = affiliateEditorInput(a.handle, popup); popup.focus();
  expect(currentEditorInput(document)).toBeUndefined();
  release(true); expect(document.activeElement).toBe(a.content); expect(currentEditorInput(document)?.handle).toBe(a.handle);
});
it('does not restore a popup after focus moved elsewhere or its mount was replaced', () => {
  const a = surface(), b = surface(); a.content.focus();
  const popup = document.body.appendChild(document.createElement('input'));
  const release = affiliateEditorInput(a.handle, popup); popup.focus(); b.content.focus(); release(true);
  expect(document.activeElement).toBe(b.content);
  const stale = affiliateEditorInput(a.handle, popup); a.dispose(); stale(true);
  expect(currentEditorInput(document)?.handle).toBe(b.handle);
});
it('classification walks the event path without enumerating unrelated mounts or measuring layout', () => {
  const a = surface();
  for (let i = 0; i < 300; i++) cleanup.push(a.mounts.register('unrelated-' + i, { root: document.createElement('div'), focusElement: document.createElement('input'), inputPolicy: 'control', focus() {} }));
  const read = vi.spyOn(a.mounts, 'get'), layout = vi.spyOn(Element.prototype, 'getBoundingClientRect');
  let calls = 0; a.content.addEventListener('input', event => { expect(editorInputBoundary(event)?.handle).toBe(a.handle); calls++; });
  for (let i = 0; i < 50; i++) a.content.dispatchEvent(new Event('input', { bubbles: true }));
  expect(calls).toBe(50); expect(read).not.toHaveBeenCalled(); expect(layout).not.toHaveBeenCalled();
});
it('registry destruction invalidates active ownership and detached boundary callbacks', () => {
  const a = surface(); a.content.focus(); a.mounts.dispose();
  expect(currentEditorInput(document)).toBeUndefined(); expect(a.deactivate).toHaveBeenCalledTimes(1);
});
