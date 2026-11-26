// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerApplicationViews } from './features';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).reverse().forEach(d => d()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function setup() {
  const editor = new ReactiveEditor(materializeLocalWorkspace({ id: 'workspace', type: 'workspace-block', children: [] }), { features: { flint: true, flintLogo: false, flintMaterialChrome: true, flintSpatialGraph: true, flintSceneChrome: false, compactEditorChrome: false } });
  registerApplicationViews(editor); const projection = editor.createView('workspace');
  disposers.push(() => editor.dispose());
  editor.commandRegistry.execute('flint.open', { targetKey: projection.state.rootKey, args: undefined });
  const host = document.body.appendChild(document.createElement('div'));
  disposers.push(render(() => <ReactiveTreeView editor={editor} projection={projection} />, host));
  editor.installGateway(document);
  const views = () => [...editor.projections.values()].filter(p => p !== projection);
  const text = () => Object.values(views()[0].state.nodes).find(n => n.viewType === 'standoff-editor-block')!;
  return { editor, projection, host, views, text };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const fileDrag = (type: string) => {
  const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
  const event = new Event(type, { bubbles: true, cancelable: true });
  const dataTransfer = { items: [{ kind: 'file', type: file.type }], files: [file], dropEffect: 'none' };
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return { event, dataTransfer };
};
it('imports dropped files as new documents when the drop lands outside any block or the vault', async () => {
  const f = setup(); await tick();
  const shell = f.host.querySelector<HTMLElement>('.flint-application')!;
  expect(shell).toBeTruthy();
  const importNew = vi.spyOn(f.editor.interchange, 'importNew').mockResolvedValue(undefined as never);
  const dropFiles = vi.spyOn(f.editor.interchange, 'dropFiles').mockResolvedValue(undefined as never);
  shell.dispatchEvent(fileDrag('drop').event);
  expect(importNew).toHaveBeenCalledTimes(1);
  expect(importNew.mock.calls[0][0]).toMatchObject([{ name: 'note.txt' }]);
  expect(dropFiles).not.toHaveBeenCalled();
}, 15000);
it('prevents default and arms the application root with the import indicator on dragover outside any block', async () => {
  const f = setup(); await tick();
  const shell = f.host.querySelector<HTMLElement>('.flint-application')!;
  expect(shell).toBeTruthy();
  const { event, dataTransfer } = fileDrag('dragover');
  shell.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(dataTransfer.dropEffect).toBe('copy');
  expect(shell.dataset.interchangeDrop).toBe('Import as new Ink documents');
}, 15000);
it('still inserts files after a standoff editor block when the drop lands on one', async () => {
  const f = setup(); await tick();
  const node = f.text();
  const root = f.editor.mounts.get(node.key)!.root as HTMLElement;
  const importNew = vi.spyOn(f.editor.interchange, 'importNew').mockResolvedValue(undefined as never);
  const dropFiles = vi.spyOn(f.editor.interchange, 'dropFiles').mockResolvedValue(undefined as never);
  root.dispatchEvent(fileDrag('dragover').event);
  expect(root.dataset.interchangeDrop).toBe('Insert files after this Block');
  root.dispatchEvent(fileDrag('drop').event);
  expect(dropFiles).toHaveBeenCalledTimes(1);
  expect(dropFiles.mock.calls[0][1]).toBe(node.key);
  expect(importNew).not.toHaveBeenCalled();
}, 15000);
