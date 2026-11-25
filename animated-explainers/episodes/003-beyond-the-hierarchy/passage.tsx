import React from 'react';
import {letters, mix, type LetterCell} from '../../shared/CellSequence';
import {namedRange, type Span} from '../../shared/TextRun';
import {ink, type} from '../../theme';

export const verse = ['The moon rose slowly', 'above the sleeping sea.'] as const;
export const passage = verse.join('\n');
export const cells = letters(passage.replace('\n', ' '), 'poem-');
export const size = 68;
const breakAt = verse[0].length;
const range = (id: string, quote: string) => namedRange(id, passage, quote);
export const ranges = {
  first: range('first-line', verse[0]), second: range('second-line', verse[1]),
  subject: range('subject', 'The moon'), predicate: range('predicate', 'rose slowly\n' + verse[1]),
  preposition: range('prepositional-phrase', 'above the sleeping sea'),
  phrase: range('image', 'the sleeping sea'), predicateHead: range('predicate-head', 'rose slowly'),
};

export function layout(measured: Map<LetterCell, Span>, flat: number, catalogue: number) {
  const firstX = measured.get(cells[0])!.left;
  const secondX = measured.get(cells[breakAt + 1])!.left;
  const fullWidth = measured.get(cells[cells.length - 1])!.right - firstX;
  const scale = mix(1, 910 / fullWidth, flat);
  const firstY = mix(480, 353, catalogue);
  const secondY = mix(mix(671, 485, catalogue), firstY, flat);
  const glyphs = cells.map((cell, i) => {
    const {left, right} = measured.get(cell)!;
    const origin = i > breakAt ? secondX : firstX;
    const x = mix(153 + left - origin, 85 + (left - firstX) * 910 / fullWidth, flat);
    return {left: x, right: x + (right - left) * scale, y: i > breakAt ? secondY : firstY};
  });
  const span = ({start, end}: {start: number; end: number}) => ({
    left: glyphs[start].left, right: glyphs[end - 1].right,
  });
  return {glyphs, span, firstY, secondY, fontSize: size * scale};
}
export type Layout = ReturnType<typeof layout>;

export function Verse({page, focus}: {page: Layout; focus: number}) {
  const dim = 1 - .77 * focus;
  return <text data-verse="" fontFamily={type.serif} fontSize={page.fontSize} fill={ink.cream}
    xmlSpace="preserve" style={{whiteSpace: 'pre'}}>
    <tspan x={page.glyphs[0].left} y={page.firstY} opacity={dim}>{verse[0]}</tspan>
    {'\n'}<tspan x={page.glyphs[breakAt + 1].left} y={page.secondY}>
      <tspan opacity={dim}>{passage.slice(breakAt + 1, ranges.phrase.start)}</tspan>
      <tspan>{passage.slice(ranges.phrase.start, ranges.phrase.end)}</tspan>
      <tspan opacity={dim}>{passage.slice(ranges.phrase.end)}</tspan>
    </tspan>
  </text>;
}
