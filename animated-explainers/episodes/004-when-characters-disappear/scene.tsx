import React from 'react';
import {Html5Audio, interpolateColors, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Bookend, Caption, SeriesPlate} from '../../shared/SeriesPlate';
import {CellLeaf, CellSequence, mix, type LetterCell} from '../../shared/CellSequence';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import type {AnnotatedSequence} from '../../shared/deletion';
import type {Span} from '../../shared/TextRun';
import {ease, hold} from '../../shared/motion';
import {ink, type} from '../../theme';
import {annotated, cells, edits, type DeletionCue} from './model';
import episode from './metadata.json';
import scenes from './scenes.json';

const proseSize = 49;
const bottom = 588;
const rail = 650;
const first = cells.indexOf(annotated[0]);
const members = new Set(annotated);

function geometry(state: AnnotatedSequence, measured: Map<LetterCell, Span>, time: number) {
  const count = state.cells.filter(cell => members.has(cell)).length;
  const zoom = ease(time, 40, 40.6);
  const outside = time < 13;
  const pitch = outside ? 31.6 : mix(45, 72, zoom);
  const advances = state.cells.map(cell => {
    const span = measured.get(cell)!;
    return span.right - span.left;
  });
  let left = 540 - advances.reduce((sum, w) => sum + w, 0) / 2;
  const coords = new Map(state.cells.map((cell, slot) => {
    const width = advances[slot];
    const prose = left + width/2;
    left += width;
    const x = outside ? 82 + slot * pitch : 540 + (slot - first - (count-1)/2) * pitch;
    return [cell, {x, prose, width, slot}];
  }));
  return {coords, pitch, zoom};
}

function reading({cells: sequence, range}: AnnotatedSequence) {
  if (!range) return '';
  return sequence.slice(sequence.indexOf(range.startCell), sequence.indexOf(range.endCell)+1)
    .map(cell => cell.value).join('');
}

function Diagram({cue, time, measured}: {cue: DeletionCue; time: number; measured: Map<LetterCell, Span>}) {
  const {before, after, removed} = cue.edit;
  const source = geometry(before, measured, time);
  const target = geometry(after, measured, time);
  const grid = ease(time, 3.65, 5.45);
  const pitch = source.pitch;
  const selection = ease(time, cue.select, Math.min(cue.select+.55, cue.release));
  const transfer = ease(time, cue.release, cue.land);
  const dissolve = ease(time, cue.release+.06, cue.land);
  const contract = ease(time, cue.land, cue.settle);
  const alive = after.range ? 1 : 1 - dissolve;
  const position = (cell: LetterCell) => {
    const a = source.coords.get(cell)!;
    const b = target.coords.get(cell) ?? a;
    const prose = mix(a.prose, b.prose, contract);
    return {prose, width: a.width, x: mix(prose, mix(a.x,b.x,contract),grid),
      slot: contract < .55 ? a.slot : b.slot};
  };
  const old = before.range!;
  const ports = (['startCell','endCell'] as const).map((key,i) => {
    const from = old[key], to = after.range?.[key] ?? from;
    const a = position(from), b = position(to);
    const moved = from !== to;
    const amount = moved ? transfer : 0;
    const side = i ? 1 : -1;
    const offset = side * Math.min(10,pitch*.2);
    const x = mix(a.x,b.x,amount) + offset;
    const flight = moved ? Math.sin(Math.PI*amount) : 0;
    const amber = moved ? ease(time,cue.release-.12,cue.release+.26) * (1-ease(time,cue.land+.15,cue.land+.72)) : 0;
    return {x, fromX:a.x+offset, toX:b.x+offset, flight, y:bottom+flight*32, amber,
      color:interpolateColors(amber,[0,1],[ink.entity,ink.grammar]), label:i?'end':'start',
      slot:amount<.5?a.slot:b.slot, prose:mix(a.prose+side*a.width/2,b.prose+side*b.width/2,amount)};
  });
  const reset = [13,20,33].reduce((opacity,t) =>
    opacity * (1-hold(time,t-.36,t+.5,.35)),1);
  const detailVisibility = (cell: LetterCell) => {
    if (members.has(cell)) return 1;
    if (time < 13) return cells.indexOf(cell) < first ? 1 : 0;
    const i = cells.indexOf(cell);
    return (i >= first-2 && i < first+annotated.length+2) ? .53*source.zoom : 0;
  };
  const baseline = mix(485,352,grid);
  const pending = hold(time,20.65,24.6,.55);
  const stamp = old.annotation;
  const priorReading = reading(before), nextReading = reading(after);
  return <g opacity={reset}>
    <defs><clipPath id="detail-crop"><rect x="65" y="408" width="950" height="320"/></clipPath></defs>
    <g opacity={ease(time,2.05,2.65)}>
      <text data-specimen="" y={baseline} textAnchor="middle" fontFamily={type.serif} fontSize={proseSize}
        xmlSpace="preserve" style={{whiteSpace:'pre'}}>
        {before.cells.map(cell => <tspan key={cell.key} x={position(cell).prose}
          fill={removed.has(cell) && selection>.4 ? ink.invalid : ink.cream}
          opacity={removed.has(cell)?1-dissolve:1}>{cell.value}</tspan>)}
      </text>
      <g opacity={alive}><RangeUnderline span={{left:ports[0].prose,right:ports[1].prose}}
        color={ink.entity} draw={ease(time,2.72,3.5)} y={baseline+14}/></g>
    </g>
    <g clipPath="url(#detail-crop)" opacity={grid}>
      {before.cells.map(cell => {
        const pos = position(cell), selected = removed.has(cell);
        const opacity = detailVisibility(cell) * (selected ? 1-dissolve : 1);
        if (!opacity) return null;
        const endpoint = old.startCell===cell || old.endCell===cell;
        const nextEndpoint = after.range?.startCell===cell || after.range?.endCell===cell;
        const active = transfer < .65 ? endpoint : nextEndpoint;
        const question = cell===old.startCell ? pending : 0;
        const tint = active ? ink.entity : ink.grey;
        const accent = interpolateColors(Math.max(question,selected?selection:0),[0,1],[active?tint:ink.rule,ink.invalid]);
        return <g key={cell.key} data-cell={cell.key} opacity={opacity} transform={`translate(0 ${mix(baseline-bottom+16,0,grid)})`}>
          <CellLeaf x={pos.x} width={pitch-3} height={98} bottom={bottom}
            accent={active || (selected && selection>0) || question>0 ? accent : undefined}/>
          <text x={pos.x} y={bottom-40} textAnchor="middle" fontFamily={type.serif}
            fontSize={Math.min(47,pitch*.98)} fill={selected && selection>.5 ? ink.invalid : ink.cream}>
            {cell.value===' '?'·':cell.value}
          </text>
          <text x={pos.x} y={bottom-8} textAnchor="middle" fontFamily={type.mono} fontSize={Math.min(23,pitch*.59)}
            fill={active ? ink.entity : ink.grey}>{pos.slot}</text>
        </g>;
      })}
    </g>
    {alive > 0 && <g opacity={grid*alive} data-annotation={stamp.id}>
      <RangeUnderline span={{left:ports[0].x,right:ports[1].x}} y={rail} draw={1} color={ink.entity}/>
      {ports.map((p,i) => <g key={p.label} data-boundary={p.label}>
        {p.flight>.01 && <path d={`M${p.fromX} ${bottom} Q${(p.fromX+p.toX)/2} ${bottom+64} ${p.toX} ${bottom}`}
          stroke={ink.grammar} strokeWidth="2" strokeDasharray="4 7" opacity={p.flight*.7} fill="none"/>}
        <path d={`M${p.x} ${rail} V${p.y}`} stroke={p.color} strokeWidth="3"/>
        <circle cx={p.x} cy={p.y} r={5+p.flight*2} fill={p.color}/>
        <circle cx={p.x} cy={p.y} r={10+p.amber*3} fill="none" stroke={ink.grammar} opacity={p.amber}/>
        {i===0 && pending>0 && <circle cx={p.x} cy={p.y} r="13" fill="none" stroke={ink.entity} opacity={pending}/>}
        <text x={Math.max(139,Math.min(944,p.x+(i?49:-49)))} y={rail+43} textAnchor="middle"
          fontFamily={type.mono} fontSize="27" fill={p.color}>
          {p.label}{p.flight>.05?'':` ${p.slot}`}
        </text>
      </g>)}
      <g>
        <path d="M76 756H1004" stroke={ink.entity} strokeWidth="1.5"/>
        <text x="77" y="823" fontFamily={type.serif} fontSize="43" fill={ink.entity}>Annotation {stamp.id}</text>
        {(priorReading === nextReading ? [priorReading] : [priorReading,nextReading]).map((quote,i) => <text key={i} x="1000" y="823" textAnchor="end"
          fontFamily={type.serif} fontStyle="italic" fontSize="43" fill={ink.cream}
          opacity={priorReading===nextReading ? 1 : i ? ease(transfer,.5,.94) : 1-ease(transfer,.12,.55)}>{quote && `“${quote}”`}</text>)}
      </g>
    </g>}
    {time>=24 && time<30 && <g opacity={hold(time,24.65,29.5,.38)}>
      {[{cell:old.startCell,label:'bright'},{cell:after.range!.startCell,label:'beautiful'}].map(({cell,label})=>{
        const x=position(cell).x;
        return <g key={label}><path d={`M${x} 484v-16`} stroke={ink.grey}/>
          <text x={x} y="451" textAnchor="middle" fill={ink.grey} fontFamily={type.serif} fontSize="32">{label}</text></g>;
      })}
    </g>}
  </g>;
}

export function WhenCharactersDisappear() {
  const time = useCurrentFrame()/useVideoConfig().fps;
  const scene = scenes.find(s=>time<s.start+s.duration) ?? scenes[scenes.length-1];
  const cue = [...edits].reverse().find(c=>time>=c.at)!;
  return <>
    <SeriesPlate number={episode.number} productBranding={false}>
      {time<2.48 && <Bookend lead={episode.title} leadSize={74} emphasis="What happens to their annotations?"
        emphasisSize={49} spread={ease(time,0,1.35)} opacity={1-ease(time,1.85,2.48)}/>}
      {time>=2 && time<51 && <g opacity={1-ease(time,50.55,51)}>
        <text x="76" y="248" fontFamily={type.serif} fontSize="66" fill={ink.cream}
          opacity={hold(time,Math.max(2.2,scene.start)-.1,scene.start+scene.duration,.32)}>{scene.heading}</text>
        <CellSequence cells={cells} size={proseSize}>{measured=><Diagram cue={cue} time={time} measured={measured}/>}</CellSequence>
        {[13,20,33].map(t=><text key={t} x="540" y="456" textAnchor="middle" fontFamily={type.mono}
          fontSize="27" fill={ink.grey} opacity={hold(time,t-.32,t+.67,.24)}>Original sentence</text>)}
        <path d="M76 898H1004" stroke={ink.rule} strokeWidth="1.5"/>
        {scene.id==='one' && <Caption text="Keep the g in bright." opacity={hold(time,40.12,44.3,.3)}/>}
        {scene.id==='none' && <Caption text="Delete the last annotated Cell." opacity={hold(time,46.12,48.45,.3)}/>}
        <Caption text={scene.caption} opacity={hold(time,
          scene.id==='one' ? 44.3 : scene.id==='none' ? 48.45 : Math.max(2.3,scene.start+.12),
          scene.start+scene.duration,.3)}/>
      </g>}
      {time>=50.75 && <Bookend lead={scenes[8].heading} leadSize={64} emphasis={scenes[8].caption}
        emphasisSize={66} spread={ease(time,50.85,52.5)} opacity={ease(time,50.75,51.6)}/>}
    </SeriesPlate>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
  </>;
}
