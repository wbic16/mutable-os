import {letters, mix, prepareInsertion} from '../../shared/CellSequence';
import {ink} from '../../theme';
import {ease} from '../../shared/motion';

export const sentence = 'The fox jumps.';
const base = letters(sentence, 'base-');
export const beforeFox = prepareInsertion(base, 4, letters('red ', 'red-'));
export const insideFox = prepareInsertion(beforeFox.final, beforeFox.final.indexOf(base[6]), letters('x', 'extra-'));

function property(name: string, start: number, end: number, color: string) {
  return {name, color, start, end, startCell: base[start], endCell: base[end]};
}
export const properties = [property('A', 4, 6, ink.narrative), property('B', 4, 12, ink.grammar)];
export type Property = typeof properties[number];

export function insertionFrame(edit: typeof beforeFox, progress: number, sweepSlot: number) {
  const swept = Math.max(0, Math.min(edit.indexSteps.length - 1, Math.floor(sweepSlot) - edit.at + 1));
  const indices = edit.indexSteps[swept];
  const sequence = progress === 0 ? edit.original : edit.final;
  const landing = ease(progress, .43, 1);
  const glyphs = sequence.map((cell, slot) => {
    const old = edit.oldSlots.get(cell);
    // Incoming letters rise into the gap. The surviving suffix slides as one.
    return {cell, slot: mix(old ?? slot, slot, progress), index: indices.get(cell),
      opacity: old === undefined ? landing : 1, rise: old === undefined ? (1 - landing) * 53 : 0};
  });
  return {sequence, glyphs, indices};
}
