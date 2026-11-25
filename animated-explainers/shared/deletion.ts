import type {LetterCell} from './CellSequence';

// A snapshot carries the annotation's identity separately from its two editable references.
export type AnnotatedSequence = {
  cells: readonly LetterCell[];
  range: {annotation: {id: string}; startCell: LetterCell; endCell: LetterCell} | null;
};

export function prepareDeletion(before: AnnotatedSequence, selected: readonly LetterCell[]) {
  const removed = new Set(selected);
  const cells = before.cells.filter(cell => !removed.has(cell));
  const old = before.range;
  let range = old;
  if (old && (removed.has(old.startCell) || removed.has(old.endCell))) {
    const first = before.cells.indexOf(old.startCell);
    const last = before.cells.indexOf(old.endCell);
    const survivors = before.cells.slice(first, last + 1).filter(cell => !removed.has(cell));
    range = survivors.length ? {
      annotation: old.annotation, startCell: survivors[0], endCell: survivors[survivors.length - 1],
    } : null;
  }
  return {before, after: {cells, range}, removed};
}
