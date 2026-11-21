import { expect, it } from 'vitest';
import { decodeBlockTree } from './codecs';
import { editAnnotation } from './annotation-commands';

it.each([0, -1])('edits point metadata and moves boundaries without changing endpoint convention (%s)', delta => {
  const state = decodeBlockTree({ type: 'standoff-editor-block', text: 'one two' }).state;
  const content = state.contents[state.placements[state.rootPlacementKey].contentKey];
  const point = { type: 'tei/milestone', start: 0, end: delta, isZeroWidth: true };
  const edit = (p: any, action: Parameters<typeof editAnnotation>[1]) => editAnnotation(p, action, content, () => 'one two');
  expect(edit(point, 'left')).toEqual(point);
  const next = edit(point, 'next-word'); expect(next).toMatchObject({ start: 4, end: 4 + delta });
  expect(edit(next, 'previous-word')).toEqual(point);
  const end = { ...point, start: 7, end: 7 + delta };
  expect(edit(end, 'right')).toEqual(end);
  expect(edit(end, 'left')).toMatchObject({ start: 6, end: 6 + delta });
  expect(edit(end, 'expand')).toEqual(end); expect(edit(end, 'contract')).toEqual(end);
  expect(edit(end, { start: 7, end: 7 + delta, metadata: { reviewed: true } })).toMatchObject({ start: 7, end: 7 + delta, metadata: { reviewed: true } });
  expect(edit(end, 'delete')).toMatchObject({ isDeleted: true, start: 7, end: 7 + delta });
  expect(() => edit(end, { start: 7, end: 9 })).toThrow(/point boundary/);
  expect(() => edit(end, { start: 8, end: 8 + delta })).toThrow(/point boundary/);
});

it.each([0, -1])('supports empty paragraph point inspection/editing without fabricating a character (%s)', end => {
  const state = decodeBlockTree({ type: 'standoff-editor-block', text: '' }).state;
  const content = state.contents[state.placements[state.rootPlacementKey].contentKey];
  const point = { type: 'tei/milestone', start: 0, end, isZeroWidth: true };
  expect(editAnnotation(point, { start: 0, end, metadata: { label: 'first page' } }, content, () => '')).toMatchObject({ start: 0, end, metadata: { label: 'first page' } });
});
