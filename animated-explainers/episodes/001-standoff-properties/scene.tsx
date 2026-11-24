import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {AnchorConnectors, AnnotationLayer} from '../../shared/AnnotationLayer';
import {Bookend, Caption, SeriesPlate} from '../../shared/SeriesPlate';
import {namedRange, TextRun} from '../../shared/TextRun';
import {ease, hold} from '../../shared/motion';
import {ink, type} from '../../theme';
import episode from './metadata.json';

const sentence = 'Alice met the White Rabbit.';
const alice = namedRange('alice', sentence, 'Alice');
const rabbit = namedRange('rabbit', sentence, 'White Rabbit');
const predicate = namedRange('predicate', sentence, 'met the White Rabbit');
const action = namedRange('action', sentence, 'Alice met');
const ranges = [alice, rabbit, predicate, action];

const captions = [
  [3, 7, 'Begin with ordinary text.'],
  [7, 12, 'Add information about the text.'],
  [12, 18, 'Stored separately. Still connected.'],
  [18, 24, 'One text. Many interpretations.'],
  [24, 30, 'Annotations can overlap freely.'],
] as const;

function Diagram({time}: {time: number}) {
  const entityLift = ease(time, 12.2, 14.9) * (1 - ease(time, 24.2, 26.4));
  const grammarLift = ease(time, 18.0, 19.8) * (1 - ease(time, 24.7, 27));
  const narrativeLift = ease(time, 19.8, 21.7) * (1 - ease(time, 25.2, 27.5));
  const term = ease(time, 14.1, 15.0);
  const baseline = 551 + 91 * ease(time, 10.8, 12);
  const overlap = ease(time, 27.25, 27.9);
  const stage = hold(time, 2.6, 30.65, 0.65);
  return <g opacity={stage}>
    <text x="540" y="228" textAnchor="middle" fontFamily={type.serif} fontSize="66"
      fill={ink.cream} opacity={term}>Standoff <tspan fontStyle="italic">properties</tspan></text>
    <g transform={`translate(0 ${baseline})`}>
      <rect x="76" y="-310" width="928" height="504" fill="url(#points)" opacity={0.55} />
      <TextRun text={sentence} ranges={ranges} size={67}>{bounds => {
        const mark = (range: typeof alice, draw = 1) => ({range, span: bounds[range.id], draw});
        const layers = [
          {label: 'Characters', labelX: (bounds.alice.right + bounds.rabbit.left) / 2, color: ink.entity, marks: [
            mark(alice, ease(time, 7.1, 7.95)), mark(rabbit, ease(time, 8.0, 9.0)),
          ], lift: entityLift, raisedY: -116, restY: 24, opacity: 1},
          {label: 'Predicate', labelX: (100 + bounds.predicate.left) / 2, color: ink.grammar, marks: [mark(predicate)], lift: grammarLift,
            raisedY: -214, restY: 63, opacity: ease(time, 18.0, 18.9)},
          {label: 'Action', labelX: (bounds.action.right + bounds.rabbit.right) / 2, color: ink.narrative, marks: [mark(action)], lift: narrativeLift,
            raisedY: -312, restY: 102, opacity: ease(time, 19.8, 20.7)},
        ];
        return <>
          <path d="M141 23H1002L937 -54H76Z" fill={ink.grey} fillOpacity=".08"
            stroke={ink.grey} strokeWidth={1.5} opacity={entityLift * 0.85} />
          <rect x={bounds.predicate.left - 4} y="-52"
            width={bounds.action.right - bounds.predicate.left + 8} height="66" rx="4"
            fill={ink.cream} opacity={overlap * 0.105} />
          {layers.map(layer => <AnchorConnectors key={layer.label} {...layer} baseY={-54} />)}
          {layers.map(layer => <AnnotationLayer key={layer.label} {...layer} />)}
          {[alice, rabbit].map((range, i) => <text key={range.id}
            x={bounds[range.id].left} y={70} fill={ink.entity} fontFamily={type.mono}
            fontSize="34" opacity={hold(time, 7.65 + i * 0.95, 12.45)}>Character</text>)}
          <g opacity={overlap} fontFamily={type.mono} fontSize="34">
            <text x={bounds.action.right + 22} y={111} fill={ink.narrative}>Action</text>
            <text x={bounds.predicate.left - 20} y={72} textAnchor="end" fill={ink.grammar}>Predicate</text>
          </g>
        </>;
      }}</TextRun>
    </g>
    <text x="540" y="846" textAnchor="middle" fill={ink.grey} fontFamily={type.sans}
      fontSize="34" opacity={hold(time, 14.8, 18)}>Each mark points to the words it describes.</text>
    <text x="540" y="846" textAnchor="middle" fill={ink.grey} fontFamily={type.sans}
      fontSize="34" opacity={hold(time, 20.8, 24)}>The predicate tells us what Alice did.</text>
    <text x="540" y="846" textAnchor="middle" fill={ink.grey} fontFamily={type.sans}
      fontSize="34" opacity={overlap}>The action and predicate share “met”.</text>
    <path d="M76 894H1004" stroke={ink.rule} strokeWidth="1.5" />
    {captions.map(([start, end, text]) =>
      <Caption key={text} text={text} opacity={hold(time, start, end)} />)}
  </g>;
}

export function StandoffProperties() {
  const time = useCurrentFrame() / useVideoConfig().fps;
  return <SeriesPlate number={episode.number}>
    {time < 3.05 && <Bookend lead="What is a" emphasis="standoff property?" spread={ease(time, 0, 1.35)} opacity={1 - ease(time, 2.55, 3.05)} />}
    {time >= 2.6 && time < 30.65 && <Diagram time={time} />}
    {time >= 30 && <Bookend lead="One text." emphasis="Many layers of meaning." emphasisSize={75} spread={ease(time, 30.1, 31.65)} opacity={ease(time, 30, 30.85)} />}
  </SeriesPlate>;
}
