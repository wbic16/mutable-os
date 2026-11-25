import React from 'react';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {CellLeaf, mix} from '../../shared/CellSequence';
import {ease, hold} from '../../shared/motion';
import type {Span} from '../../shared/TextRun';
import {ink, type} from '../../theme';
import {ranges, type Layout} from './passage';

export function Hierarchy({page, time}: {page: Layout; time: number}) {
  const first = page.span(ranges.first), second = page.span(ranges.second);
  const boxes = [
    {label: 'Stanza', x: first.left - 76, y: 295, right: Math.max(first.right, second.right) + 66, bottom: 714, color: ink.entity},
    {label: 'Line', x: first.left - 48, y: 355, right: first.right + 33, bottom: 526, color: ink.narrative},
    {label: 'Phrase', x: first.left - 17, y: 403, right: page.span(ranges.subject).right + 14, bottom: 498, color: ink.grammar},
  ];
  return <g opacity={1 - ease(time, 5.5, 6)}>
    {boxes.map(({label, x, y, right, bottom, color}, i) => {
      const enter = ease(time, .55 + i * .6, 1.45 + i * .6);
      return <g key={label} opacity={enter} transform={`translate(0 ${-28 * (1 - enter)})`}>
        <rect x={x} y={y} width={right - x} height={bottom - y} rx="4"
          fill={color} fillOpacity=".045" stroke={color} strokeWidth="2.2" />
        <text x={x + 11} y={y + 25} fontFamily={type.mono} fontSize="23" fill={color}>{label}</text>
      </g>;
    })}
  </g>;
}

export function TwoReadings({page, time}: {page: Layout; time: number}) {
  const poetic = ease(time, 6.2, 6.9) * (1 - ease(time, 8.7, 9.15) + ease(time, 12, 12.7));
  const grammar = ease(time, 9, 9.8);
  const phrase = page.span(ranges.preposition);
  return <g opacity={1 - ease(time, 14.8, 15.4)}>
    {[ranges.first, ranges.second].map((r, i) => {
      const span = page.span(r), y = page.glyphs[r.start].y;
      return <g key={r.id} opacity={poetic}>
        <path d={`M${span.left} ${y-66}v-10H${span.right}v10`} fill="none" stroke={ink.narrative} strokeWidth="3"/>
        <text x={span.left} y={y-89} fill={ink.narrative} fontSize="29" fontFamily={type.mono}>Line {i + 1}</text>
      </g>;
    })}
    {[{r: ranges.subject, label: 'Subject'}, {r: ranges.predicateHead, label: 'Predicate'},
      {r: ranges.second, label: 'Predicate continues'}].map(({r, label}) => {
      const span = page.span(r), y = page.glyphs[r.start].y + 18;
      return <g key={label} opacity={grammar}>
        <RangeUnderline span={span} y={y} color={ink.grammar} draw={1} />
        <text x={span.left} y={y + 36} fontFamily={type.mono} fontSize="27" fill={ink.grammar}>{label}</text>
      </g>;
    })}
    <g opacity={hold(time, 9.9, 14.75, .45)}>
      <path d={`M${phrase.left} ${page.secondY+71}v8H${phrase.right}v-8`}
        fill="none" stroke={ink.grammar} strokeWidth="2.3" />
      <text x={phrase.left} y={page.secondY+113} fontFamily={type.mono} fontSize="27"
        fill={ink.grammar}>Prepositional phrase</text>
    </g>
  </g>;
}

const arrangements = [
  [ranges.subject, ranges.phrase], [ranges.second, ranges.phrase],
  [ranges.phrase, ranges.phrase], [ranges.first, ranges.predicate],
];
const origins = [ranges.first, ranges.predicate];
function trackSpan(page: Layout, lane: number, arrangementTime: number): Span {
  let bound = page.span(origins[lane]);
  for (const [i, pair] of arrangements.entries()) {
    const next = page.span(pair[lane]);
    const amount = ease(arrangementTime, i * 2.25, i * 2.25 + .72);
    bound = {left: mix(bound.left, next.left, amount), right: mix(bound.right, next.right, amount)};
  }
  return bound;
}

export function Tracks({page, collision, foldTime, arrangementTime}: {
  page: Layout; collision: number; foldTime: number; arrangementTime: number;
}) {
  const fold = ease(foldTime, .65, 3.8);
  const fixedLabels = 1 - ease(arrangementTime, -.35, 0);
  return <g opacity={collision}>
    {origins.map((range, lane) => {
      const span = trackSpan(page, lane, arrangementTime);
      const color = lane === 0 ? ink.narrative : ink.grammar;
      const floor = mix(page.firstY + 18 + 17 * lane, 602 + lane * 95, fold);
      const roof = mix(page.firstY - 67 + lane * 16, floor, fold);
      return <g key={range.id} data-track={range.id}>
        <rect x={span.left} y={roof} width={span.right - span.left} height={floor - roof}
          fill={color} fillOpacity={.065 * (1-fold)} stroke={color} strokeWidth={2.6 * (1-fold)}/>
        <RangeUnderline span={span} y={floor} color={color} draw={1}/>
        <g opacity={fold}>
          {[span.left, span.right].map((x, i) => <path key={i} d={`M${x} ${page.firstY + 11} V${floor}`}
            fill="none" stroke={color} strokeOpacity=".72" strokeWidth="1.8" strokeDasharray="5 7"/>)}
          <text x={(span.left + span.right)/2} y={floor - 13} textAnchor="middle" fontFamily={type.mono}
            fontSize="29" fill={color} opacity={fixedLabels * ease(fold, .48, .9)}>{lane === 0 ? 'Poetic line' : 'Grammatical predicate'}</text>
        </g>
        <g opacity={fold * fixedLabels}>
          {[range.start, range.end - 1].map(i => {
            const g = page.glyphs[i];
            return <CellLeaf key={i} x={(g.left + g.right)/2} bottom={page.firstY + 11}
              width={Math.max(10, g.right - g.left)} height={page.fontSize + 7} accent={color}/>;
          })}
        </g>
      </g>;
    })}
    <g opacity={1 - ease(foldTime, -.55, .1)}>
      {[{i: ranges.first.start, right: false, name: 'Line', verb: 'starts'},
        {i: ranges.predicate.start, right: false, name: 'Predicate', verb: 'starts'},
        {i: ranges.first.end - 1, right: true, name: 'Line', verb: 'ends'},
        {i: ranges.predicate.end - 1, right: true, name: 'Predicate', verb: 'ends'}].map(({i,right,name,verb}, step) => {
        const x = right ? page.glyphs[i].right : page.glyphs[i].left;
        const color = name === 'Line' ? ink.narrative : ink.grammar;
        const align = step === 0 ? 'start' : step === 3 ? 'end' : 'middle';
        return <g key={i} opacity={ease(foldTime, -5.8 + step * .55, -5.05 + step * .55)}>
          <path d={`M${x} ${page.firstY + (name === 'Line' ? 18 : 35)}V600`} stroke={color} strokeDasharray="4 7" />
          <text x={x} y="648" textAnchor={align} fontSize="33" fontFamily={type.sans} fill={color}>
            {name}<tspan x={x} dy="39">{verb}</tspan>
          </text>
        </g>;
      })}
    </g>
  </g>;
}
