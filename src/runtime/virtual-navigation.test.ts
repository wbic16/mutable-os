import { afterEach, expect, it, vi } from 'vitest';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from '../rendering/register-core-views';
import { presentationEligible, activeViewChild } from './presentation-eligibility';
import type { ExistingBlockDto } from '../block-tree/types';
import { createMemo, createRoot, mapArray } from 'solid-js';
import { eligibleTextFlow, plainTextItem } from '../rendering/virtual-text-flow';

const editors: ReactiveEditor[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.dispose()); localStorage.clear(); });
const p = (id: string): ExistingBlockDto => ({ id, type: 'standoff-editor-block', text: id });
function fixture(children: ExistingBlockDto[] = [p('alpha'), p('bravo'), p('charlie')], virtual = false) {
  const editor = new ReactiveEditor({ type: 'document-block', children }, { features: { virtualTextFlows: virtual, nativeKnowledge: false, sqliteKnowledge: false } });
  editors.push(editor); registerCoreViews(editor);
  const projection = editor.createView('navigation');
  const node = (id: string) => Object.values(projection.state.nodes).find(node => node.payload.id === id)!;
  return { editor, projection, node };
}

it('defaults off and qualifies only plain vertical text/heading flows', () => {
  const children = Array.from({ length: 100 }, (_, i) => p('text-' + i));
  const disabled = fixture(children), enabled = fixture(children, true);
  const qualifies = (f: ReturnType<typeof fixture>) => eligibleTextFlow(f.projection.state.rootKey, f.projection.state.nodes[f.projection.state.rootKey].children, f);
  expect(qualifies(disabled)).toBe(false); expect(qualifies(enabled)).toBe(true);
  enabled.editor.commands.setPayloadField(enabled.node('text-0').key, 'blockProperties', [{ type: 'block/font/size', value: 'h2' }]);
  expect(qualifies(enabled)).toBe(true);
  enabled.editor.commands.setPayloadField(enabled.node('text-0').key, 'blockProperties', [{ type: 'block/rotate', value: '20' }]);
  expect(qualifies(enabled)).toBe(false);
  const mixed = fixture([...children, { type: 'image-block' }], true);
  expect(qualifies(mixed)).toBe(false);
});

it('does not rescan flow eligibility or ancestors on ordinary typing', () => {
  const f = fixture(Array.from({ length: 100 }, (_, i) => p('text-' + i)), true);
  let checks = 0;
  const stop = createRoot(dispose => {
    const eligible = createMemo(() => { checks++; return eligibleTextFlow(f.projection.state.rootKey, f.projection.state.nodes[f.projection.state.rootKey].children, f); });
    expect(eligible()).toBe(true); return dispose;
  });
  const initial = checks, snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  for (let i = 0; i < 10; i++) f.editor.commands.replaceInlineRange(f.node('text-0').key, 0, 0, 'a');
  expect(checks).toBe(initial); expect(snapshot).not.toHaveBeenCalled(); stop();
});

it('checks changed text locally and excludes native inline media without scanning other text', () => {
  const f = fixture(Array.from({ length: 100 }, (_, i) => p('text-' + i)), true);
  const checked = new Map<string, number>();
  const stop = createRoot(dispose => {
    const items = mapArray(() => f.projection.state.nodes[f.projection.state.rootKey].children, key => createMemo(() => { checked.set(key, (checked.get(key) ?? 0) + 1); return plainTextItem(key, f); }));
    createMemo(() => items().every(item => item())); return dispose;
  });
  checked.clear();
  f.editor.commands.replaceInlineRange(f.node('text-0').key, 0, 0, 'a');
  expect([...checked.keys()]).toEqual([f.node('text-0').key]);
  f.editor.commands.insertInlineImage(f.node('text-0').key, 0, { assetId: 'fixture', src: 'image.png', alt: 'Fixture' });
  expect(plainTextItem(f.node('text-0').key, f)).toBe(false); stop();
});

it('navigates and copies eligible native text with no mounted views or repository work', () => {
  const { editor, node } = fixture();
  const snapshot = vi.spyOn(editor.repository, 'snapshot'), commit = vi.spyOn(editor.repository, 'commit');
  expect(editor.adjacentEditable(node('alpha').key, 1)?.key).toBe(node('bravo').key);
  expect(editor.adjacentEditable(node('charlie').key, -1)?.key).toBe(node('bravo').key);
  editor.crossText.enable(true);
  editor.crossText.set(editor.crossText.position(node('alpha').key, 1), editor.crossText.position(node('charlie').key, 3));
  editor.crossText.validate();
  expect(editor.crossText.selectedText()).toBe('lpha\nbravo\ncha');
  expect(snapshot).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});

it('keeps native sibling/media barriers and stale or foreign identities without DOM', () => {
  const { editor, node } = fixture([p('alpha'), { type: 'image-block' }, p('bravo'), { type: 'container-block', children: [p('nested')] }]);
  editor.crossText.enable(true);
  const point = (id: string) => editor.crossText.position(node(id).key, 0);
  expect(() => editor.crossText.set(point('alpha'), point('bravo'))).toThrow('barriers');
  expect(() => editor.crossText.set(point('bravo'), point('nested'))).toThrow('boundaries');
  expect(() => editor.crossText.set(point('bravo'), { ...point('bravo'), contentKey: 'forged' })).toThrow('stale');
  const second = editor.createView('other');
  const foreign = Object.values(second.state.nodes).find(n => n.payload.id === 'bravo')!;
  expect(() => editor.crossText.set(point('bravo'), editor.crossText.position(foreign.key, 0))).toThrow('different views');
});

it('excludes closed ancestors and inactive tabs and supports explicit sticky dismissal', () => {
  const { editor, node } = fixture([p('alpha'), { id: 'tabs', type: 'tab-row-block', children: [
    { id: 'one', type: 'tab-block', metadata: { active: true }, children: [p('bravo')] },
    { id: 'two', type: 'tab-block', children: [p('charlie')] },
  ] }, { id: 'sticky', type: 'sticky-tab-row-block', children: [{ id: 'sticky-one', type: 'sticky-tab-block', metadata: { active: true }, children: [p('note')] }] }]);
  expect(presentationEligible(editor, node('bravo').key)).toBe(true);
  expect(presentationEligible(editor, node('charlie').key)).toBe(false);
  expect(editor.adjacentEditable(node('alpha').key, 1)?.key).toBe(node('bravo').key);
  editor.setViewChild(node('tabs').key, node('two').key);
  expect(presentationEligible(editor, node('bravo').key)).toBe(false);
  expect(presentationEligible(editor, node('charlie').key)).toBe(true);
  editor.viewVisibility.set(node('tabs').placementKey, true);
  expect(presentationEligible(editor, node('charlie').key)).toBe(false);
  editor.setViewChild(node('sticky').key, '');
  expect(activeViewChild(editor, node('sticky'))).toBeUndefined();
  expect(presentationEligible(editor, node('note').key)).toBe(false);
});

it('keeps owned margins and repeated content occurrences in their native scopes', () => {
  const { editor, node } = fixture([{ ...p('alpha'), relation: { leftMargin: { type: 'left-margin-block', children: [p('note'), p('second-note')] } } }, p('bravo')]);
  expect(editor.adjacentEditable(node('alpha').key, 1)?.key).toBe(node('bravo').key);
  expect(editor.adjacentEditable(node('note').key, 1)?.key).toBe(node('second-note').key);
  expect(editor.adjacentEditable(node('second-note').key, 1)).toBeUndefined();
  // A normal child range cannot cross an independently projected Document either.
  const second = editor.createView('second');
  const sameContent = second.nodeForPlacement(node('alpha').placementKey)!;
  expect(sameContent.contentKey).toBe(node('alpha').contentKey);
  expect(sameContent.key).not.toBe(node('alpha').key);
  expect(editor.adjacentEditable(sameContent.key, 1)?.viewId).toBe('second');
});

it('cancels a late rendering request when focus moves to another occurrence', async () => {
  const { editor, node } = fixture();
  let finish!: () => void, current!: () => boolean;
  const release = editor.focus.registerRenderer((key, valid) => key === node('alpha').key ? new Promise(resolve => { current = valid; finish = () => resolve(true); }) : undefined);
  editor.focus.request(node('alpha').key, { caret: 'end' });
  expect(current()).toBe(true);
  editor.focus.request(node('bravo').key, { caret: 'start' });
  expect(current()).toBe(false); finish(); await Promise.resolve();
  expect(editor.focus.state.focusedKey).toBe(node('bravo').key); release();
});
