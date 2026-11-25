import React from 'react';
import {ink, type} from '../theme';
import {measureSpan, type Span} from './TextRun';

export type LetterCell = Readonly<{key: string; value: string}>;

export function letters(text: string, group: string): LetterCell[] {
  return Array.from(text, (value, index) => ({key: group + index, value}));
}

// Every intermediate array shares the surviving objects. Precompute the index
// table at each sweep stop so Studio can seek backwards without undoing edits.
export function prepareInsertion(original: LetterCell[], at: number, added: LetterCell[]) {
  const final = [...original.slice(0, at), ...added, ...original.slice(at)];
  const oldSlots = new Map(original.map((cell, index) => [cell, index]));
  const indexSteps = [oldSlots];
  for (let slot = at; slot < final.length; slot++) {
    const next = new Map(indexSteps[indexSteps.length - 1]);
    next.set(final[slot], slot);
    indexSteps.push(next);
  }
  return {original, at, added, final, oldSlots, indexSteps};
}

export const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function CellLeaf({x, bottom, width, height, accent}: {
  x: number; bottom: number; width: number; height: number; accent?: string;
}) {
  const left = x - width / 2;
  return <path d={`M${left} ${bottom - height + 7} l7 -7 h${width - 7} v${height} h${-width} z`}
    fill={accent ?? ink.grey} fillOpacity={accent ? .12 : .045}
    stroke={accent ?? ink.rule} strokeWidth={accent ? 2.5 : 1.5} />;
}

// Measure the opening as one shaped line after SeriesPlate has loaded its fonts.
export function CellSequence({cells, size, children}: {
  cells: LetterCell[]; size: number; children: (spans: Map<LetterCell, Span>) => React.ReactNode;
}) {
  const run = React.useRef<SVGTextElement>(null);
  const [spans, setSpans] = React.useState<Map<LetterCell, Span>>();
  React.useLayoutEffect(() => {
    let offset = 0;
    setSpans(new Map(cells.map(cell => {
      const start = offset;
      offset += cell.value.length;
      return [cell, measureSpan(run.current!, start, offset)];
    })));
  }, [cells, size]);
  return <>
    <text ref={run} visibility="hidden" xmlSpace="preserve" style={{whiteSpace: 'pre'}}
      x={540} textAnchor="middle" fontFamily={type.serif} fontSize={size}>
      {cells.map(cell => cell.value).join('')}
    </text>
    {spans && children(spans)}
  </>;
}
