import React from 'react';
import {interpolateColors, useCurrentFrame, useVideoConfig} from 'remotion';
import {Bookend, Caption, SeriesPlate} from '../../shared/SeriesPlate';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {CellLeaf, CellSequence, mix, type LetterCell} from '../../shared/CellSequence';
import {ease, hold} from '../../shared/motion';
import {ink, type} from '../../theme';
import {beforeFox, insideFox, insertionFrame, properties, type Property} from './model';
import type {Span} from '../../shared/TextRun';
import episode from './metadata.json';

const pitch = 48;
const column = (slot: number) => 110 + slot * pitch;
const proseSize = 86;
const cellBottom = 515;
const cellHeight = 101;
const captions = [
  [1.4, 5, ['What happens to an annotation', 'when its text changes?']],
  [5.25, 12, ['An annotation records where its text', 'begins and ends.']],
  [12, 14.45, 'The text has moved.'],
  [14.45, 16.75, 'The recorded positions have not.'],
  [16.75, 19.15, 'The annotation must be repaired.'],
  [20.3, 24, ['The same character can occupy', 'a different position.']],
  [24.15, 28, 'Give each character an identity of its own.'],
  [28, 32, ['Let annotations reference', 'the characters themselves.']],
  [32.2, 35.9, 'The Cells move.'],
  [35.9, 38.35, 'Their identities remain.'],
  [38.35, 41, ['The surviving Cells still carry', 'their old indices.']],
  [41, 43.6, 'Read each Cell’s current index.'],
  [43.6, 47, 'Update the Cells, not every property.'],
  [47, 50, 'Insert a character within a range.'],
  [50, 54, 'The range grows with the text.'],
] as const;

function Record({property, x, color, cellMode, selected, selectedOpacity, indices, reading, opacity}: {
  property: Property; x: number; color: string; cellMode: boolean; selected: string; selectedOpacity: number;
  indices: ReadonlyMap<LetterCell, number>; reading: number; opacity: number;
}) {
  const {name, start, end, startCell, endCell} = property;
  return <g transform={`translate(${x} 697)`} opacity={opacity}>
    <path d="M0 0H426" stroke={color} strokeWidth="2" />
    <text y="49" fontFamily={type.serif} fontSize="42" fill={color}>Property {name}</text>
    <text x="425" y="47" textAnchor="end" fontFamily={type.serif} fontStyle="italic"
      fontSize="35" fill={ink.cream} opacity={selectedOpacity}>“{selected}”</text>
    {[{label: 'start', cell: startCell, offset: start}, {label: 'end', cell: endCell, offset: end}].map((field, i) =>
      <g key={field.label} transform={`translate(0 ${94 + 45 * i})`}>
        <g opacity={1 - reading}>
          <text fontFamily={type.mono} fontSize="31" fill={ink.grey}>{field.label}{cellMode ? ' →' : ''}</text>
          {cellMode && <CellLeaf x={164} bottom={6} width={38} height={37} accent={color} />}
          <text x={cellMode ? 164 : 152} textAnchor="middle" fontFamily={cellMode ? type.serif : type.mono}
            fontSize="30" fill={ink.cream}>{cellMode ? field.cell.value : field.offset}</text>
        </g>
        <text opacity={reading} fontFamily={type.mono} fontSize="31" fill={ink.grey}>
          {field.label}Cell.index → <tspan fill={color}>{indices.get(field.cell)}</tspan>
        </text>
      </g>)}
  </g>;
}

function Diagram({time, spans}: {time: number; spans: Map<LetterCell, Span>}) {
  const cellMode = time >= 24;
  const proof = time >= 47;
  const edit = proof ? insideFox : beforeFox;
  const beat = proof ? 47.8 : cellMode ? 32.6 : 12.6;
  const progress = ease(time, beat, beat + 1.55);
  const sweepStart = proof ? 50.05 : 41.35;
  const sweepEnd = proof ? 51.65 : 44.8;
  const sweep = ease(time, sweepStart, sweepEnd);
  const sweepSlot = mix(edit.at - .6, edit.final.length - .4, sweep);
  const {sequence, glyphs, indices} = insertionFrame(edit, progress, sweepSlot);
  const grid = cellMode ? ease(time, 24.55, 26.15) : ease(time, 5, 6.3);
  const isolation = cellMode ? 0 : ease(time, 19, 20.2);
  const reveal = cellMode ? ease(time, 24, 24.55) : ease(time, .4, 1.35);
  const arrayOpacity = reveal * (cellMode ? 1 - ease(time, 56.9, 57.4) : 1 - ease(time, 23.55, 24));
  const ruler = grid * (1 - isolation);
  const refs = cellMode ? ease(time, 28, 29.2) : grid;
  const reading = cellMode ? ease(time, 41, 41.5) : 0;
  const stale = cellMode ? 0 : ease(time, 13.4, 14.25);
  const pinCell = properties[0].startCell;
  const coords = new Map(glyphs.map(glyph => {
    const span = spans.get(glyph.cell);
    const gridX = column(glyph.slot);
    const center = span ? (span.left + span.right) / 2 : gridX;
    const x = mix(mix(center, gridX, grid), 540, glyph.cell === pinCell ? isolation : 0);
    return [glyph.cell, {x, halfWidth: mix(span ? (span.right - span.left) / 2 : 0, 21, grid)}];
  }));
  const baseline = mix(498, 470, grid);
  const selectedOpacity = 1 - hold(time, beat, beat + 1.55, .28);
  const labelOpacity = 1 - ease(time, 54, 54.65);

  return <g opacity={arrayOpacity}>
    {!cellMode && <g opacity={ruler} textAnchor="middle" fontFamily={type.mono} fontSize="26">
      {edit.final.map((_, i) => <g key={i} opacity={i < edit.original.length ? 1 : progress}>
        <text x={column(i)} y="385" fill={ink.grey}>{i}</text>
        <path d={`M${column(i)} 398v6`} stroke={ink.rule} strokeWidth="2" />
      </g>)}
    </g>}
    {cellMode && <g opacity={grid}>
      {glyphs.map(({cell, opacity, rise, index, slot}) => {
        const x = coords.get(cell)!.x;
        const endpoint = properties.some(p => p.startCell === cell || p.endCell === cell);
        const fresh = proof && cell === insideFox.added[0];
        const passed = Math.max(0, 1 - Math.abs(sweepSlot - slot)) * hold(time, sweepStart, sweepEnd, .2);
        return <g key={cell.key} data-cell={cell.key} transform={`translate(0 ${-rise})`} opacity={opacity}>
          <CellLeaf x={x} bottom={cellBottom} width={42} height={cellHeight}
            accent={fresh ? ink.entity : endpoint ? ink.cream : undefined} />
          <g opacity={labelOpacity} textAnchor="middle">
            <text x={x} y="500" fontFamily={type.mono} fontSize="25"
              fill={passed > .1 ? ink.entity : ink.grey}>{index ?? '–'}</text>
          </g>
        </g>;
      })}
      <g opacity={hold(time, sweepStart - .2, sweepEnd + .2, .2)} transform={`translate(${column(sweepSlot)} 0)`}>
        <path d="M-13 395h26L0 407z" fill={ink.entity} />
      </g>
    </g>}
    <text textAnchor="middle" fontFamily={type.serif} xmlSpace="preserve" style={{whiteSpace: 'pre'}}>
      {glyphs.map(({cell, opacity, rise}) => {
        const isolated = cell === pinCell ? isolation : 0;
        const x = coords.get(cell)!.x;
        return <tspan key={cell.key} data-glyph={cell.key} x={x} y={mix(baseline - rise, 535, isolated)}
          opacity={opacity * (cell === pinCell ? 1 : 1 - isolation)}
          fontSize={mix(mix(proseSize, 49, grid), 148, isolated)}
          fill={proof && cell === insideFox.added[0] ? ink.entity : ink.cream}>
          {cell.value === ' ' && grid > .7 ? '·' : cell.value}
        </tspan>;
      })}
    </text>

    {properties.map((p, i) => {
      const start = coords.get(p.startCell)!, end = coords.get(p.endCell)!;
      const y = 550 + 57 * i;
      const startX = cellMode ? start.x + (i ? -9 : 9) : column(p.start) - (i ? 22 : 17);
      const endX = cellMode ? end.x : column(p.end) + 20;
      const color = interpolateColors(stale, [0, 1], [p.color, ink.invalid]);
      const layer = cellMode ? refs : ease(time, 1.0 + i * .32, 1.8 + i * .32);
      const left = mix(start.x - start.halfWidth, startX, grid);
      const right = mix(end.x + end.halfWidth, endX, grid);
      const top = cellMode ? cellBottom : 389;
      const first = cellMode ? sequence.indexOf(p.startCell) : p.start;
      const last = cellMode ? sequence.indexOf(p.endCell) : p.end;
      const selected = sequence.slice(first, last + 1).map(c => c.value).join('');
      return <g key={p.name} opacity={(1 - isolation) * layer}>
        <RangeUnderline span={{left, right}} y={y} draw={1} color={color} />
        <text x={left - (cellMode && !i ? 34 : 15)} y={y + 8} textAnchor="end" fontFamily={type.mono} fontSize="26" fill={color}>{p.name}</text>
        <g opacity={refs} stroke={color} fill={color} strokeWidth="2">
          {[startX, endX].map((x, side) => {
            const port = cellMode ? x : x + (x > column(side ? p.end : p.start) ? -8 : 8);
            return <g key={side}>
              <path d={`M${x} ${y}V${top + (cellMode ? 0 : 10)}L${port} ${top}`}
                fill="none" strokeDasharray={cellMode ? undefined : '5 5'} />
              <circle cx={port} cy={top} r="4" />
            </g>;
          })}
        </g>
        <Record property={p} x={i ? 578 : 76} color={color} cellMode={cellMode}
          selected={selected} selectedOpacity={selectedOpacity} indices={indices} reading={reading} opacity={refs * labelOpacity} />
      </g>;
    })}
    {!cellMode && <g textAnchor="middle" opacity={isolation} fontFamily={type.mono} fontSize="42">
      <text x="540" y="648" fill={ink.grey}>index 4<tspan fill={ink.entity}
        opacity={ease(time, 20.25, 21.15)}> → 8</tspan></text>
    </g>}
    {cellMode && proof && <g opacity={hold(time, 49.35, 53.95)} fontFamily={type.sans} fontSize="30">
      {[{cell: insideFox.added[0], label: 'new x', side: -1, color: ink.entity},
        {cell: properties[0].endCell, label: 'original x', side: 1, color: ink.cream}].map(({cell, label, side, color}) => {
        const x = coords.get(cell)?.x;
        return x === undefined ? null : <g key={label}>
          <path d={`M${x} 410v-19l${side * 16} -16`} stroke={color} fill="none" />
          <text x={x + side * 19} y="374" textAnchor={side < 0 ? 'end' : 'start'} fill={color}>{label}</text>
        </g>;
      })}
    </g>}
  </g>;
}

const headings = [
  [0, 5.1, 'When text changes'],
  [5, 19.35, 'Numerical boundaries'],
  [19.15, 24, 'Position ≠ Identity'],
  [24, 41.25, 'Character Cells'],
  [41, 47.2, 'Reading the indices'],
  [47, 54.2, 'Inside the range'],
] as const;

export function WhenTextChanges() {
  const time = useCurrentFrame() / useVideoConfig().fps;
  return <SeriesPlate number={episode.number}>
    {headings.map(([from, to, title]) => <text key={title} x="76" y="290"
      fontFamily={type.serif} fontSize="74" fill={from === 19.15 ? ink.entity : ink.cream}
      opacity={hold(time, from, to, .36)}>{title}</text>)}
    <CellSequence cells={beforeFox.original} size={proseSize}>{spans => <Diagram time={time} spans={spans} />}</CellSequence>
    <path d="M76 896H1004" stroke={ink.rule} strokeWidth="1.5" opacity={hold(time, .5, 54)} />
    {captions.map(([from, to, text]) => <Caption key={from} text={text} opacity={hold(time, from, to, .32)} />)}
    {['Characters have identities.', 'Positions can change.', 'Annotations follow their referenced characters.'].map((line, i) =>
      <text key={line} x="540" y={714 + i * 60} textAnchor="middle" fontFamily={type.serif} fontSize="44"
        fill={i === 2 ? ink.entity : ink.cream} opacity={hold(time, 54 + i * .69, 57.55, .33)}>{line}</text>)}
    {time >= 57.25 && <Bookend lead="Standoff Properties" emphasis="+ Mutable Text" imprintOpacity={ease(time, 58.15, 58.9)}
      spread={ease(time, 57.25, 58.8)} opacity={ease(time, 57.25, 57.95)} />}
  </SeriesPlate>;
}
