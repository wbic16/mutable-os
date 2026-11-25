import {letters} from '../../shared/CellSequence';
import {prepareDeletion, type AnnotatedSequence} from '../../shared/deletion';

export const sentence = 'It was a bright and beautiful morning.';
export const phrase = 'bright and beautiful';
export const cells = letters(sentence, 'c');
const first = sentence.indexOf(phrase);
export const annotated = cells.slice(first, first + phrase.length);
const original: AnnotatedSequence = {
  cells, range: {annotation: {id: 'A'}, startCell: annotated[0], endCell: annotated[annotated.length - 1]},
};
function excerpt(quote: string) {
  const at = sentence.indexOf(quote);
  if (at < 0) throw new Error('Missing deletion example: ' + quote);
  return cells.slice(at, at + quote.length);
}

const outside = prepareDeletion(original, excerpt('was '));
const inside = prepareDeletion(original, excerpt('and '));
const start = prepareDeletion(original, excerpt('bright and '));
const end = prepareDeletion(original, excerpt(' and beautiful'));
const left = prepareDeletion(end.after, excerpt('bri'));
const right = prepareDeletion(left.after, excerpt('ht'));
const last = prepareDeletion(right.after, [right.after.range!.startCell]);

// Absolute cues let Studio seek directly into a transfer or gap closure.
export const edits = [
  {at: 0, edit: outside, select: 6.55, release: 7.65, land: 8.85, settle: 10.45},
  {at: 13, edit: inside, select: 13.85, release: 15.0, land: 16.1, settle: 17.65},
  {at: 20, edit: start, select: 24.35, release: 25.75, land: 28.55, settle: 30.65},
  {at: 33, edit: end, select: 33.75, release: 34.9, land: 36.9, settle: 38.45},
  {at: 40, edit: left, select: 40.50, release: 41.05, land: 41.93, settle: 42.7},
  {at: 42.8, edit: right, select: 42.85, release: 43.35, land: 44.25, settle: 45.1},
  {at: 46, edit: last, select: 46.4, release: 47.35, land: 48.45, settle: 49.8},
];
export type DeletionCue = typeof edits[number];
