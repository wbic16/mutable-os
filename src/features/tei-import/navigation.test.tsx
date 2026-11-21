// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../../reactive-editor/editor';
import { registerCoreViews } from '../../rendering/register-core-views';
import { ReactiveTreeView } from '../../rendering/reactive-tree-view';
import { convertTei } from '../../interchange/tei/convert';
import { encodeTeiNative } from '../../interchange/tei/compact-native';
import { admitNative, captureNative, nativeText } from '../../persistence/native-resource';
import { GlossSessionIndex } from '../gloss/session-index';
import { milestoneIndex, navigateAnnotation } from './navigation';
import { TeiDefinitionDetails, TeiMilestones } from './presentation';

const xml = readFileSync('src/interchange/tei/fixtures/operational-semantics.xml', 'utf8');
const clean: (() => void)[] = [];
afterEach(() => { clean.splice(0).reverse().forEach(f => f()); vi.restoreAllMocks(); document.body.replaceChildren(); });
function setup(compact = true) {
  const d = convertTei(xml, {}, 'operational.xml', undefined, { inlineAlternatives: false }).document;
  const e = new ReactiveEditor({ type: 'workspace-block', children: [{ type: 'workspace-object-bank-block' }] }, { features: { compactCanonicalText: compact } });
  clean.push(() => e.dispose()); registerCoreViews(e);
  const bank = Object.values(e.repository.readState().contents).find(c => c.viewType === 'workspace-object-bank-block')!;
  const admission = admitNative(e.repository, encodeTeiNative(d).bytes, bank.key), v = e.createView('operational', admission.placementKey);
  const host = document.body.appendChild(document.createElement('div'));
  clean.push(render(() => <ReactiveTreeView editor={e} projection={v}/>, host));
  const milestones = milestoneIndex(e, v, v.state.rootKey), gloss = new GlossSessionIndex(e, v, v.state.rootKey);
  clean.push(() => milestones.dispose(), () => gloss.dispose());
  return { e, v, host, milestones, gloss, d };
}

it.each([true, false])('navigates live empty, EOF and nested inactive tab boundaries without canonical writes (compact=%s)', async compact => {
  const f = setup(compact), before = nativeText(captureNative(f.e.repository.readState(), f.d.id!));
  expect(f.milestones.rows[0]().map(r => r.data().type)).toEqual(['pb', 'anchor', 'anchor', 'cb']);
  for (const row of f.milestones.rows[0]()) {
    const anchor = row.occurrences()[0]; expect(anchor).toBeTruthy();
    expect(await navigateAnnotation(f.milestones, anchor)).toBe(true);
    const range = f.milestones.range(anchor)!;
    expect(f.e.mounts.get(anchor.nodeKey)?.captureInlineSelection?.()).toEqual({ anchor: range.start, head: range.start });
  }
  expect([...f.host.querySelectorAll('[role=tab][aria-selected=true]')].map(n => n.textContent)).toEqual(['Text', 'reg', 'abbr']);
  expect(nativeText(captureNative(f.e.repository.readState(), f.d.id!))).toBe(before);
});

it('rebases only affected segment offsets through edits and history without inventory, graph or snapshot work', () => {
  const f = setup(), row = f.milestones.rows[0]()[0], anchor = row.occurrences()[0], start = f.milestones.range(anchor)!.start;
  const rows = f.milestones.rows[0](), entries = f.gloss.rows[0](), before = { ...f.milestones.diagnostics }, graph = { ...f.gloss.relationships!.diagnostics };
  const snapshot = vi.spyOn(f.e.repository, 'snapshot'), build = vi.spyOn(f.v as any, 'build');
  const values = Object.values; let scans = 0;
  vi.spyOn(Object, 'values').mockImplementation((o: any) => { if (o === f.e.repository.readState().contents || o === f.v.state.nodes) scans++; return values(o); });
  f.e.commands.replaceInlineRange(anchor.nodeKey, 0, 0, 'X');
  expect(f.milestones.range(anchor)!.start).toBe(start + 1);
  f.e.repository.undo(); expect(f.milestones.range(anchor)!.start).toBe(start);
  f.e.repository.redo(); expect(f.milestones.range(anchor)!.start).toBe(start + 1);
  expect(f.milestones.rows[0]()).toBe(rows); expect(f.gloss.rows[0]()).toBe(entries);
  expect(f.milestones.diagnostics).toEqual({ ...before, segmentReads: before.segmentReads + 3 });
  expect(f.gloss.relationships!.diagnostics).toEqual(graph);
  expect(snapshot).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled(); expect(scans).toBe(0);
});

it('navigates from explicit mentions to their source definition and discovers related local Glosses', async () => {
  const f = setup(), ada = f.gloss.rows[0]().find(r => r.data().source?.sourceId === 'ada')!;
  expect(ada.occurrences().map(o => o.role)).toEqual(['tei/mention', 'tei/definition']);
  const definition = ada.occurrences().find(o => o.role === 'tei/definition')!;
  expect(await navigateAnnotation(f.gloss, definition)).toBe(true);
  expect(f.host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Metadata');
  const edges = f.gloss.relationships!.relations(ada.localId).activeOutgoing;
  expect(edges).toHaveLength(1);
  expect(f.gloss.rows[0]().find(r => r.localId === edges[0].targetGlossId)?.data().source?.sourceId).toBe('bea');
  const empty = f.gloss.rows[0]().find(r => r.data().source?.sourceId === 'empty')!;
  expect(await navigateAnnotation(f.gloss, empty.occurrences()[0])).toBe(true);
  expect(f.gloss.range(empty.occurrences()[0])).toEqual({ start: 0, end: 0 });
});

it('renders inert attributes and explicit navigation controls in the existing panel content', async () => {
  const f = setup(), panel = document.body.appendChild(document.createElement('aside'));
  const session = { projection: f.v, rootKey: f.v.state.rootKey, element: panel, current: () => true } as any;
  const ada = f.gloss.rows[0]().find(r => r.data().source?.sourceId === 'ada')!, navigate = vi.fn();
  clean.push(render(() => <><TeiMilestones editor={f.e} session={session}/><TeiDefinitionDetails entry={ada} index={f.gloss} navigate={navigate}/></>, panel));
  expect(panel.textContent).toContain('TEI milestones (4)'); expect(panel.textContent).toContain('https://example.invalid/page2');
  expect(panel.textContent).toContain('Explicit mentions (1)');
  const button = [...panel.querySelectorAll('button')].find(b => b.textContent === 'Source definition 1')!;
  button.click(); expect(navigate).toHaveBeenCalledWith(ada, expect.objectContaining({ role: 'tei/definition' }));
  expect(panel.querySelector('a')).toBeNull();
});

it('cancels stale navigation before focus and updates structural membership after split/Undo', async () => {
  const f = setup(), anchor = f.milestones.rows[0]()[0].occurrences()[0], mount = f.e.mounts.get(anchor.nodeKey)!;
  const focus = vi.spyOn(mount, 'focus'); let alive = true;
  const pending = navigateAnnotation(f.milestones, anchor, () => alive); alive = false;
  expect(await pending).toBe(false); expect(focus).not.toHaveBeenCalled();
  f.e.commands.splitStandoff(anchor.nodeKey, 2); await Promise.resolve();
  const changed = f.milestones.rows[0]()[0].occurrences()[0]; expect(changed.contentKey).not.toBe(anchor.contentKey);
  expect(await navigateAnnotation(f.milestones, changed)).toBe(true);
  f.e.repository.undo(); await Promise.resolve(); expect(f.milestones.rows[0]()[0].occurrences()[0].contentKey).toBe(anchor.contentKey);
});

it('updates milestone labels/order only on definition changes and retains an orphan after segment removal', () => {
 const f=setup(),row=f.milestones.rows[0]()[0],anchor=row.occurrences()[0];
 const node=f.e.node(anchor.nodeKey)!;
 f.e.commands.setPayloadField(node.key,'standoffProperties',(f.e.repository.readState().contents[node.contentKey].payload.standoffProperties as any[]).filter(p=>p.id!==anchor.segmentId),'Remove milestone anchor');
 expect(row.occurrences()).toHaveLength(0);expect(f.milestones.rows[0]()).toContain(row);
 f.e.repository.undo();expect(row.occurrences()).toHaveLength(1);
 const defs=structuredClone(f.e.repository.readState().contents[f.milestones.owner].payload.linkedAnnotations as any);
 defs[row.definitionId].metadata.fields.n='Changed';defs[row.definitionId].metadata.order=99;
 f.e.commands.setPayloadField(f.v.state.rootKey,'linkedAnnotations',defs,'Edit milestone source fields');
 expect(row.data().body).toBe('Changed');expect(f.milestones.rows[0]().at(-1)).toBe(row);
 f.e.repository.undo();expect(f.milestones.rows[0]()[0]).toBe(row);expect(row.data().body).toBe('2');
});
