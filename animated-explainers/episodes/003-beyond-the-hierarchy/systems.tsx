import React from 'react';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {ease} from '../../shared/motion';
import type {Span} from '../../shared/TextRun';
import {ink, type} from '../../theme';
import {ranges, type Layout} from './passage';

const literaryInk = '#A8CBE1';
const systems = [
  {name: 'Poetics', color: ink.narrative, examples: [ranges.first, ranges.second], detail: 'A stanza contains two lines.'},
  {name: 'Grammar', color: ink.grammar, examples: [ranges.subject, ranges.predicateHead, ranges.second], detail: 'A subject pairs with a predicate.'},
  {name: 'Rhetoric', color: ink.entity, examples: [ranges.phrase], detail: 'Personification in “the sleeping sea”.'},
  {name: 'Literary imagery', color: literaryInk, examples: [ranges.phrase], detail: 'An image suggests an atmosphere.'},
] as const;
type System = typeof systems[number];

function Mark({system, span, y}: {system: System; span: Span; y: number}) {
  const {left, right} = span;
  const color = system.color;
  if (system.name === 'Grammar') return <RangeUnderline span={span} y={y} draw={1} color={color} />;
  if (system.name === 'Poetics') return <path d={`M${left} ${y-7}v7H${right}v-7`}
    fill="none" stroke={color} strokeWidth="3.6" />;
  if (system.name === 'Rhetoric') return <path d={`M${left} ${y}H${right}`}
    fill="none" stroke={color} strokeWidth="4" strokeDasharray="3 8" strokeLinecap="round" />;
  return <g fill={color} stroke={color}>
    <path d={`M${left} ${y}H${right}`} fill="none" strokeWidth="2.5"/>
    {[left,right].map((x, i) => <path key={i} d={`M${x} ${y-5}l5 5-5 5-5-5z`} />)}
  </g>;
}

export function Systems({page, sinceIntro, sinceArrival, opacity, synthesis}: {
  page: Layout; sinceIntro: number; sinceArrival: number; opacity: number; synthesis: number;
}) {
  return <g opacity={opacity}>
    {systems.map((system, i) => {
      const amount = i === 3 ? ease(sinceArrival, .45, 2.25) : ease(sinceIntro, 1.2 + i*1.8, 2 + i*1.8);
      const y = 640 + i * 66;
      return <g key={system.name} data-system={system.name} opacity={amount}>
        {system.examples.map(r => {
          const target = page.span(r);
          return <Mark key={r.id} system={system} span={{left: target.left, right: target.left + amount*(target.right-target.left)}}
            y={page.glyphs[r.start].y + 14 + i * 15} />;
        })}
        <g transform={`translate(0 ${i === 3 ? 18*(1-amount) : 0})`}>
          <Mark system={system} span={{left: 82, right: 126}} y={y - 9}/>
          <text x="149" y={y} fill={system.color} fontFamily={type.serif} fontSize="38">{system.name}</text>
          <text x="441" y={y} fill={ink.cream} fontFamily={type.sans} fontSize="32" opacity={i === 3 ? 1-synthesis : 1}>
            {system.detail}
          </text>
          {i === 3 && <text x="441" y={y} fill={ink.cream} fontFamily={type.sans} fontSize="32" opacity={synthesis}>
            Tranquillity · Latent power
          </text>}
        </g>
      </g>;
    })}
  </g>;
}

export function Interpretations({page, local, opacity}: {page: Layout; local: number; opacity: number}) {
  const span = page.span(ranges.phrase);
  return <g opacity={opacity}>
    {['An image of tranquillity.', 'A suggestion of latent power.'].map((line, i) => {
      const enter = ease(local, .55 + i*1.12, 1.4 + i*1.12);
      const y = 649 + i*122;
      return <g key={line} opacity={enter} data-reading={i}>
        {[span.left, span.right].map(x => <path key={x} d={`M${x} ${page.secondY+12}V${y}`}
          fill="none" stroke={literaryInk} strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="4 7"/>)}
        <Mark system={systems[3]} span={span} y={y}/>
        <text x="82" y={y-10} fontFamily={type.mono} fontSize="27" fill={literaryInk}>Reader {i ? 'B' : 'A'}</text>
        <text x={(span.left + span.right)/2} y={y+44} textAnchor="middle" fontFamily={type.serif} fontStyle="italic"
          fontSize="36" fill={ink.cream}>“{line}”</text>
      </g>;
    })}
  </g>;
}
