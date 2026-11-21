// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { convertTei } from '../interchange/tei/convert';
import * as converter from '../interchange/tei/convert';
import { encodeTeiNative } from '../interchange/tei/compact-native';
import * as native from '../persistence/native-resource';
import { nativeDocumentSession } from '../persistence/native-session';
import { createTeiImportFeature } from '../features/tei-import';

const clean: (() => void)[] = [];
afterEach(() => { clean.splice(0).reverse().forEach(f => f()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const xml = '<TEI><teiHeader><titleStmt><title>Semantic edition</title></titleStmt></teiHeader><text><p>Before <choice><orig>olde <hi rend="italic">😀</hi></orig><reg>modern <choice><abbr/><expan>expanded</expan></choice></reg></choice> after.</p><p>A😀<pb n="2"/>BC<anchor xml:id="end"/></p><p><supplied reason="lost" cert="low">restored</supplied></p><p>Unrelated text.</p></text></TEI>';
function setup(compact = true, source = xml, endpointDelta = 0) {
  // Retain the M2 grouped-reading contract in both canonical representations.
  const d = convertTei(source, {}, 'TEI document', undefined, { inlineAlternatives: false }).document;
  const endpoints = (b: typeof d) => { for (const p of b.standoffProperties ?? []) if (p.isZeroWidth) p.end = Number(p.start) + endpointDelta; b.children?.forEach(child => endpoints(child as typeof d)); };
  endpoints(d);
  const editor = new ReactiveEditor({ type: 'workspace-block', children: [{ type: 'workspace-object-bank-block' }] }, { features: { compactCanonicalText: compact } });
  clean.push(() => editor.dispose()); registerCoreViews(editor); editor.featureHost.activate(createTeiImportFeature(editor));
  const bank = Object.values(editor.repository.readState().contents).find(c => c.viewType === 'workspace-object-bank-block')!;
  const admission = native.admitNative(editor.repository, encodeTeiNative(d).bytes, bank.key);
  const session = nativeDocumentSession(editor); session.trackCandidate(d.id!);
  const view = editor.createView('semantic', admission.placementKey), host = document.body.appendChild(document.createElement('div'));
  clean.push(render(() => <ReactiveTreeView editor={editor} projection={view} />, host), editor.installGateway(document));
  const text = (value: string) => Object.values(view.state.nodes).find(n => n.viewType === 'standoff-editor-block' && n.inlineContent.map(k => view.state.nodes[k].payload.text).join('') === value)!;
  const select = (key: string, index: number) => {
    const n = editor.node(key)!, mount = editor.mounts.get(key)!; mount.focus(); mount.restoreInlineSelection!({ anchor: index, head: index });
    editor.selections.setPrimary(key, n.contentKey, n.viewId, index, index); return mount.focusElement;
  };
  const tab = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b => b.textContent === name)!;
  return { editor, view, host, text, select, tab, session, d };
}

it.each([true, false])('switches nested and empty alternatives with local presentation work, then edits and reloads (compact=%s)', compact => {
  const f = setup(compact), beforeRevision = f.editor.repository.state.revision;
  expect(f.host.textContent).toContain('olde 😀'); expect(f.host.textContent).not.toContain('Semantic edition');
  const spies = [vi.spyOn(f.editor.repository, 'snapshot'), vi.spyOn(f.editor.repository, 'commit'), vi.spyOn(f.editor.repository as any, 'rebuildReferences'), vi.spyOn(f.view as any, 'build'), vi.spyOn(native, 'captureNative'), vi.spyOn(converter, 'convertTei'), vi.spyOn(f.editor.persistence, 'saveDocument'), vi.spyOn(globalThis, 'fetch')];
  f.tab('reg').click(); expect(f.host.textContent).toContain('modern '); expect(f.editor.mounts.get(f.text('').key)).toBeTruthy();
  f.tab('expan').click(); expect(f.host.textContent).toContain('expanded');
  expect(f.editor.repository.state.revision).toBe(beforeRevision); spies.forEach(s => { expect(s).not.toHaveBeenCalled(); s.mockRestore(); });
  const p = f.text('expanded');
  const input = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '!' }); f.select(p.key, 8).dispatchEvent(input);
  expect(input.defaultPrevented).toBe(true); expect(f.host.textContent).toContain('expanded!'); expect(f.session.isDirty(f.d.id!)).toBe(true);
  f.editor.repository.undo(); expect(f.host.textContent).toContain('expanded'); f.editor.repository.redo(); expect(f.host.textContent).toContain('expanded!');
  const saved = native.nativeBytes(native.captureNative(f.editor.repository.readState(), f.d.id!));
  expect(native.nativeBytes(native.decodeNative(saved, undefined, compact))).toEqual(saved);
  expect(Object.values(native.decodeNative(saved, undefined, compact).contents).filter(c => c.viewType === 'text-cell').length === 0).toBe(compact);
  f.tab('Metadata').click(); expect(f.host.textContent).toContain('Semantic edition');
});

it.each([{ text: '', delta: 0 }, { text: '😀', delta: 0 }, { text: '', delta: -1 }, { text: '😀', delta: -1 }])('inspects and edits a point at EOF without treating the adjacent character as its text: %j', ({ text, delta }) => {
  const f = setup(true, `<TEI><text><p>${text}<pb n="last"/></p></text></TEI>`, delta), p = f.text(text);
  f.select(p.key, [...text].length).dispatchEvent(new KeyboardEvent('keydown', { key: '.', ctrlKey: true, bubbles: true, cancelable: true }));
  const panel = document.querySelector('.reactive-annotation-monitor')!;
  expect(panel.textContent).toContain(`Point annotation at boundary ${[...text].length}`);
  expect([...panel.querySelectorAll('blockquote')].every(b => !b.textContent)).toBe(true);
  const field = [...panel.querySelectorAll('label')].find(l => l.textContent?.startsWith('Metadata'))!.querySelector('textarea')!;
  field.value = JSON.stringify({ ...JSON.parse(field.value), reviewed: true }); field.dispatchEvent(new InputEvent('input', { bubbles: true }));
  panel.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(document.querySelector('.reactive-annotation-monitor')).toBeNull();
  const def = () => Object.values(f.editor.node(f.view.state.rootKey)!.payload.linkedAnnotations as any).find((d: any) => d.type === 'tei/milestone') as any;
  expect(def().metadata.reviewed).toBe(true); f.editor.repository.undo(); expect(def().metadata.reviewed).toBeUndefined();
  expect((f.editor.node(p.key)!.payload.standoffProperties as any[])[0].end).toBe([...text].length + delta);
  expect(f.text(text)).toBeTruthy();
});

it.each([true, false])('inspects exact milestones and editorial assertions and keeps ordinary edits bounded (compact=%s)', compact => {
  const f = setup(compact), p = f.text('A😀BC'), unrelated = f.text('Unrelated text.');
  const flow = f.select(p.key, 2);
  flow.dispatchEvent(new KeyboardEvent('keydown', { key: '.', ctrlKey: true, bubbles: true, cancelable: true }));
  const panel = document.querySelector('.reactive-annotation-monitor')!;
  expect(panel).not.toBeNull();
  const metadata = [...panel.querySelectorAll('label')].find(l => l.textContent?.startsWith('Metadata'))!.querySelector('textarea')!;
  expect(JSON.parse(metadata.value)).toMatchObject({ role: 'tei/page-break', fields: { n: '2' }, precision: 'point' });
  for (const overlay of [...f.editor.overlays.overlays]) f.editor.overlays.close(overlay.key, false);
  const other = f.editor.mounts.get(unrelated.key)!.root, observer = new MutationObserver(() => {}); observer.observe(other, { childList: true, subtree: true, attributes: true, characterData: true });
  const spies = [vi.spyOn(f.editor.repository, 'snapshot'), vi.spyOn(f.editor.repository as any, 'rebuildReferences'), vi.spyOn(f.view as any, 'build'), vi.spyOn(native, 'captureNative'), vi.spyOn(f.editor.persistence, 'saveDocument'), vi.spyOn(globalThis, 'fetch')];
  f.select(p.key, 1).dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '漢' }));
  expect(f.text('A漢😀BC')).toBeTruthy();
  expect((f.editor.node(p.key)!.payload.standoffProperties as any[]).map(p => [p.start, p.end])).toEqual([[3, 3], [5, 5]]);
  f.editor.repository.undo(); f.editor.repository.redo();
  expect(observer.takeRecords()).toHaveLength(0); observer.disconnect(); spies.forEach(s => { expect(s).not.toHaveBeenCalled(); s.mockRestore(); });
  const supplied = f.text('restored'); f.select(supplied.key, 1).dispatchEvent(new KeyboardEvent('keydown', { key: '.', ctrlKey: true, bubbles: true, cancelable: true }));
  const field = [...document.querySelectorAll('.reactive-annotation-monitor label')].find(l => l.textContent?.startsWith('Metadata'))!.querySelector('textarea')!;
  expect(JSON.parse(field.value)).toMatchObject({ role: 'tei/supplied', fields: { reason: 'lost', cert: 'low' } });
  expect(document.querySelector('.annotation-segments blockquote')!.textContent).toBe('restored');
});
