// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerApplicationViews } from './features';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).reverse().forEach(d => d()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
function setup(enabled = true) {
  const docs = Array.from({length:12}, (_, i) => ({type:'document-block',id:`doc-${i}`,metadata:{documentId:`doc-${i}`,title:`Letter ${i}`},children:[{type:'standoff-editor-block',id:`text-${i}`,text:'Text'}]}));
  const editor = new ReactiveEditor(materializeLocalWorkspace({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:docs}]}), {features:{nativeDocumentPersistence:false,flintRecentDocuments:enabled,flintLogo:false,flintProbe:false}});
  registerApplicationViews(editor);const projection=editor.createView('recents');
  editor.commandRegistry.execute('flint.open',{targetKey:projection.state.rootKey,args:undefined});
  const host=document.body.appendChild(document.createElement('div'));
  disposers.push(()=>editor.dispose(),render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host));
  return {editor,host,projection,tabs:()=>[...host.querySelectorAll<HTMLButtonElement>('[role=tab]')],recent:()=>[...host.querySelectorAll<HTMLButtonElement>('.flint-recent-documents .flint-open-document')]};
}
it('lists ten recent tabs, reopens a closed document with edits intact, and does no work on typing', async () => {
  const f=setup();
  for (const button of f.host.querySelectorAll<HTMLButtonElement>('.flint-open-document:not([aria-label])')) button.click();
  expect(f.recent().map(b=>b.textContent)).toEqual(Array.from({length:10},(_,i)=>`Letter ${11-i}`));
  f.tabs()[5].click();expect(f.recent()[0].textContent).toBe('Letter 5');expect(f.recent()).toHaveLength(10);
  const view=[...f.editor.projections.values()].find(v=>v!==f.projection)!;
  const node=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;
  const writes=vi.spyOn(Storage.prototype,'setItem'),snapshot=vi.spyOn(f.editor.repository,'snapshot');
  const before=f.recent().map(b=>b.textContent);
  for(let i=0;i<20;i++){f.editor.commands.replaceInlineRange(node.key,0,0,'x');f.editor.commands.replaceInlineRange(node.key,0,1,'');}
  expect(writes).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(f.recent().map(b=>b.textContent)).toEqual(before);
  f.editor.commands.replaceInlineRange(node.key,0,0,'Unsaved ');
  f.host.querySelector<HTMLButtonElement>('[aria-label="Close Document: Letter 5"]')!.click();
  f.host.querySelector<HTMLButtonElement>('[aria-label="Reopen Letter 5"]')!.click();
  await vi.waitFor(()=>expect(f.host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Letter 5'));
  expect(f.host.querySelector('.reactive-standoff-flow')?.textContent).toBe('Unsaved Text');
});
it('does not show or persist the list when its feature flag is disabled', () => {
  const reads=vi.spyOn(Storage.prototype,'getItem'),writes=vi.spyOn(Storage.prototype,'setItem');
  const f=setup(false);f.tabs()[1].click();expect(f.host.querySelector('.flint-recent-documents')).toBeNull();
  expect([...reads.mock.calls,...writes.mock.calls].some(([key])=>String(key).includes('recent-documents'))).toBe(false);
});
it('preserves a recent button through a catalog refresh between mouse press and release', async () => {
  const f = setup();
  f.host.querySelector<HTMLButtonElement>('[aria-label="Close Document: Letter 0"]')!.click();
  const button = f.host.querySelector<HTMLButtonElement>('[aria-label="Reopen Letter 0"]')!;
  button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  button.focus();
  const other = Object.values(f.projection.state.nodes).find(n => n.payload.id === 'doc-1')!;
  f.editor.commands.setPayloadField(other.key, 'metadata', { ...(other.payload.metadata as Record<string, unknown>), title: 'Renamed letter' });
  // A browser cannot deliver the click to a button removed during the gesture.
  expect(f.host.querySelector('[aria-label="Reopen Letter 0"]') === button).toBe(true);
  expect(f.host.querySelector('[aria-label="Reopen Renamed letter"]')).not.toBeNull();
  button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  button.click();
  await vi.waitFor(() => expect(f.host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Letter 0'));
});
it('promotes a successful reopen even when that document is already active in another Flint window', () => {
  const f=setup();
  f.editor.commandRegistry.execute('flint.open',{targetKey:f.projection.state.rootKey,args:undefined});
  const windows=f.host.querySelectorAll('.flint-application');
  windows[1].querySelectorAll<HTMLButtonElement>('[role=tab]')[1].click();
  expect(windows[0].querySelector('.flint-recent-documents button')?.textContent).toBe('Letter 1');
  windows[0].querySelector<HTMLButtonElement>('[aria-label="Reopen Letter 0"]')!.click();
  expect(windows[0].querySelector('.flint-recent-documents button')?.textContent).toBe('Letter 0');
});
it('removes a recent entry across Flint windows without closing or editing the Document', () => {
  const f=setup();
  f.editor.commandRegistry.execute('flint.open',{targetKey:f.projection.state.rootKey,args:undefined});
  const windows=f.host.querySelectorAll('.flint-application');
  const tabs=f.tabs(),revision=f.editor.repository.state.revision;
  const snapshot=vi.spyOn(f.editor.repository,'snapshot');
  windows[0].querySelector<HTMLButtonElement>('[aria-label="Remove Letter 0 from recently opened documents"]')!.click();
  for(const window of windows)expect(window.querySelector('[aria-label="Reopen Letter 0"]')).toBeNull();
  expect(f.tabs()).toEqual(tabs);expect(f.editor.repository.state.revision).toBe(revision);expect(snapshot).not.toHaveBeenCalled();
  windows[0].querySelectorAll<HTMLButtonElement>('[role=tab]')[1].click();
  windows[0].querySelectorAll<HTMLButtonElement>('[role=tab]')[0].click();
  for(const window of windows)expect(window.querySelector('[aria-label="Reopen Letter 0"]')).not.toBeNull();
});
