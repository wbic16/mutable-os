// @vitest-environment node
import { expect, it } from 'vitest';
import { BlockModeRegistry, validateModeAssignment } from './block-mode-registry';
import { FeatureHost } from '../runtime/features';

it('is headless, descriptive and isolates immutable exact-identifier definitions', () => {
  expect(typeof window).toBe('undefined'); expect(typeof document).toBe('undefined');
  const registry = new BlockModeRegistry(), input = { mode: ' verse-line ', appliesTo: ['standoff-editor-block'], label: 'Line' };
  expect(registry.list()).toEqual([]);
  registry.register(input, ' owner ');
  const listed = registry.list();
  input.appliesTo.push('container-block'); input.label = 'changed'; input.mode = 'changed';
  expect(listed).toEqual([{ mode: ' verse-line ', appliesTo: ['standoff-editor-block'], label: 'Line' }]);
  expect(registry.get('verse-line')).toBeUndefined(); expect(registry.owner(' verse-line ')).toBe(' owner ');
  expect(Object.isFrozen(input)).toBe(false);
  expect(Object.isFrozen(listed)).toBe(true); expect(Object.isFrozen(listed[0])).toBe(true); expect(Object.isFrozen(listed[0].appliesTo)).toBe(true);
  expect(() => (listed[0].appliesTo as string[]).push('bad')).toThrow();
  registry.register({ mode: 'next' }, 'other'); expect(listed).toHaveLength(1);
});

it('checks recognised compatibility only on explicit authoring, allowing unknown declarations', () => {
  const r = new BlockModeRegistry();
  r.register({ mode: 'verse-line', appliesTo: ['standoff-editor-block'] }, 'test');
  r.register({ mode: 'any' }, 'test'); r.register({ mode: 'none', appliesTo: [] }, 'test');
  expect(() => validateModeAssignment(r, 'container-block', 'verse-line')).toThrow('does not apply');
  for (const mode of ['any', 'unknown', undefined]) expect(() => validateModeAssignment(r, 'container-block', mode)).not.toThrow();
  expect(() => validateModeAssignment(r, 'standoff-editor-block', 'verse-line')).not.toThrow();
  expect(() => validateModeAssignment(r, 'standoff-editor-block', 'none')).toThrow('does not apply');
  for (const mode of ['', ' \n', 1, null]) expect(() => validateModeAssignment(r, 'container-block', mode as never)).toThrow('nonempty string');
});

it('rejects duplicate and malformed registrations atomically with owners in diagnostics', () => {
  const r = new BlockModeRegistry(); r.register({ mode: 'kept' }, 'original');
  for (const owner of ['original', 'attempted']) expect(() => r.register({ mode: 'kept' }, owner)).toThrow(`Block Mode kept already belongs to original; cannot register for ${owner}`);
  for (const d of [null, {}, { mode: '' }, { mode: 7 }, { mode: 'new', label: 3 }, { mode: 'new', appliesTo: 'text' }, { mode: 'new', appliesTo: [''] }]) {
    expect(() => r.register(d as never, 'owner')).toThrow('Invalid Block Mode');
  }
  for (const owner of ['', ' ', undefined]) expect(() => r.register({ mode: 'new' }, owner as never)).toThrow('Invalid Block Mode');
  expect(r.list()).toEqual([{ mode: 'kept' }]);
});

it('owns scoped lifetimes, rolls back failed activation and makes stale releases harmless', () => {
  const r = new BlockModeRegistry(), host = new FeatureHost();
  const release = r.register({ mode: 'first' }, 'one'); r.register({ mode: 'second' }, 'two'); release(); release();
  const newer = r.register({ mode: 'first' }, 'new'); release();
  expect(r.owner('first')).toBe('new'); expect(r.list().map(d => d.mode)).toEqual(['second', 'first']);
  expect(() => host.activate({ id: 'fails', activate(scope) { scope.own(r.register({ mode: 'failed' }, scope.owner)); throw Error('injected'); } })).toThrow();
  expect(r.get('failed')).toBeUndefined();
  host.dispose(); r.dispose(); r.dispose(); newer();
  expect(r.list()).toEqual([]); expect(r.get('first')).toBeUndefined(); expect(r.owner('first')).toBeUndefined();
  expect(() => r.register({ mode: 'late' }, 'owner')).toThrow('disposed');
});
