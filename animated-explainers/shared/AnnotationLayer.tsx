import React from 'react';
import {type} from '../theme';
import type {Span, StandoffRange} from './TextRun';

export type RangeMark = {range: StandoffRange; span: Span; draw: number};

function RangeUnderline({span, y, draw, color}: {
  span: Span; y: number; draw: number; color: string;
}) {
  if (draw === 0) return null;
  const end = span.left + (span.right - span.left) * draw;
  return <g stroke={color} fill={color}>
    <path d={`M ${span.left} ${y} H ${end}`} fill="none" strokeWidth={5} />
    {[span.left, end].map((x, index) => <circle key={index} cx={x} cy={y} r={4.6} />)}
  </g>;
}

type LayerMotion = {
  color: string; marks: RangeMark[]; restY: number;
  raisedY: number; lift: number; opacity: number;
};

function planeHeight({restY, raisedY, lift}: LayerMotion) {
  return restY + (raisedY - restY) * lift;
}

// Paint all guides behind the leaves so a higher plane never rules through
// the label on a lower one. The base meets the top of the sentence.
export function AnchorConnectors(props: LayerMotion & {baseY: number}) {
  const y = planeHeight(props) + 5;
  if (y >= props.baseY) return null;
  return <g stroke={props.color} opacity={0.66 * props.lift * props.opacity}
    strokeWidth={2} strokeDasharray="6 7">
    {props.marks.map(({range, span, draw}) => <g key={range.id} opacity={draw}>
      {[span.left, span.right].map(x => <line key={x} x1={x} x2={x} y1={y} y2={props.baseY} />)}
    </g>)}
  </g>;
}

// The same keyed range stroke rides the front of its plane for the entire shot.
export function AnnotationLayer(props: LayerMotion & {label: string; labelX: number}) {
  const {label, labelX, color, marks, lift, opacity} = props;
  const y = planeHeight(props);
  const depth = 66 * lift;
  const slant = 65 * lift;
  return <g opacity={opacity}>
    <g opacity={lift}>
      <path d={`M 141 ${y + 14} H 1002 l ${-slant} ${-depth} H ${141 - slant} Z`}
        fill={color} fillOpacity={0.12} stroke={color} strokeOpacity={0.85} strokeWidth={1.7} />
      <text x={labelX} textAnchor="middle" y={y - 12} fontFamily={type.mono} fontSize={35} fill={color}
        stroke="#232C30" paintOrder="stroke" strokeWidth={5} strokeLinejoin="round"
        opacity={lift}>{label}</text>
    </g>
    {marks.map(({range, span, draw}) => <g key={range.id} data-range={range.id}>
      <RangeUnderline span={span} y={y} draw={draw} color={color} />
    </g>)}
  </g>;
}
