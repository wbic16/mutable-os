import {letters, type LetterCell} from '../../shared/CellSequence';

export type Block = {id: string; cells: LetterCell[]};
export type Segment = {block: Block; start: LetterCell; end: LetterCell};
type Identity = {key: string; label: string};
export type Reading = {blocks: Block[]; annotation: {identity: Identity; segments: Segment[]}};

export function members(segment: Segment) {
  const {block, start, end} = segment;
  return block.cells.slice(block.cells.indexOf(start), block.cells.indexOf(end) + 1);
}

// Convert membership into maximal inclusive ranges *within* each container.
function reading(blocks: Block[], identity: Identity, covered: Set<LetterCell>): Reading {
  const segments: Segment[] = [];
  for (const block of blocks) {
    let run: Segment | undefined;
    for (const cell of block.cells) {
      if (!covered.has(cell)) {
        run = undefined;
      } else if (run) {
        run.end = cell;
      } else {
        run = {block, start: cell, end: cell};
        segments.push(run);
      }
    }
  }
  return {blocks, annotation: {identity, segments}};
}

export const verbGroups = ['She ', 'picked', ' ', 'up', ' ', 'the book', '.']
  .map((text, index) => letters(text, 'verb-' + index + '-'));
const [she, picked, space, up, gap, book, stop] = verbGroups;
const verb = {key: 'A', label: 'Phrasal verb: pick up'};
export const ordinary = reading([{id:'01', cells:verbGroups.flat()}], verb, new Set([...picked, ...space, ...up]));
export const discontinuous = reading([{id:'01', cells:[...she, ...picked, ...space, ...book, ...gap, ...up, ...stop]}],
  verb, new Set([...picked, ...up]));

export function splitAtSpace(source: Reading, separator: LetterCell) {
  const block = source.blocks[0];
  const at = block.cells.indexOf(separator);
  if (source.blocks.length !== 1 || at <= 0 || at >= block.cells.length - 1 || separator.value !== ' ') {
    throw new Error('Expected an interior separator in one text block');
  }
  const covered = new Set(source.annotation.segments.flatMap(members));
  return {
    reading: reading([{id:block.id, cells:block.cells.slice(0, at)}, {id:'02', cells:block.cells.slice(at + 1)}],
      source.annotation.identity, covered),
    separator, coveredSeparator:covered.has(separator),
  };
}

export function rejoin(split: ReturnType<typeof splitAtSpace>) {
  const {blocks, annotation} = split.reading;
  const covered = new Set(annotation.segments.flatMap(members));
  if (split.coveredSeparator) covered.add(split.separator);
  return reading([{id:blocks[0].id, cells:[...blocks[0].cells, split.separator, ...blocks[1].cells]}],
    annotation.identity, covered);
}

const intro = letters('She began to read aloud: ', 'intro');
const first = letters('“There was once a garden.', 'first');
const [separator] = letters(' ', 'sentence-break');
const next = letters('And in that garden grew ', 'next');
const last = letters('a remarkable tree.”', 'last');
export const quoteLines = [intro, first, next, last];
const passage = [...first, separator, ...next, ...last];
export const quotation = reading([{id:'01', cells:[...intro, ...passage]}], {key:'Q', label:'Quotation'}, new Set(passage));
export const divided = splitAtSpace(quotation, separator);
export const reunited = rejoin(divided);
