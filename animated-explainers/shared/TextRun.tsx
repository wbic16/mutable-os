import React, {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {ink, type} from '../theme';

export type StandoffRange = Readonly<{id: string; start: number; end: number}>;
export type Span = Readonly<{left: number; right: number}>;

export function measureSpan(run: SVGTextElement, start: number, end: number): Span {
  return {left: run.getStartPositionOfChar(start).x, right: run.getEndPositionOfChar(end - 1).x};
}

export function namedRange(id: string, text: string, target: string): StandoffRange {
  const start = text.indexOf(target);
  if (!target || start < 0 || text.indexOf(target, start + 1) >= 0) {
    throw new Error('Expected a unique annotation target: ' + target);
  }
  return {id, start, end: start + target.length};
}

// Read the shaped SVG run itself. Its centered alignment, kerning and advance
// widths are already reflected in these positions, in viewBox coordinates.
export function TextRun({text, ranges, size, children}: {
  text: string; ranges: readonly StandoffRange[]; size: number;
  children: (bounds: Record<string, Span>) => ReactNode;
}) {
  const node = useRef<SVGTextElement>(null);
  const [bounds, setBounds] = useState<Record<string, Span> | null>(null);
  useLayoutEffect(() => {
    const run = node.current!;
    const positions: Record<string, Span> = {};
    for (const range of ranges) {
      positions[range.id] = measureSpan(run, range.start, range.end);
    }
    setBounds(positions);
  }, [text, ranges, size]);
  return <>
    {bounds && children(bounds)}
    <text ref={node} x={540} y={0} textAnchor="middle" fontFamily={type.serif}
      fontSize={size} fill={ink.cream}>{text}</text>
  </>;
}
