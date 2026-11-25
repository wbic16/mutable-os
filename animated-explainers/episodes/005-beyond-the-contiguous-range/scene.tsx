import React from 'react';
import {Html5Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Bookend, Caption, SeriesPlate} from '../../shared/SeriesPlate';
import {CellLeaf, CellSequence, mix, type LetterCell} from '../../shared/CellSequence';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {ease, hold} from '../../shared/motion';
import {ink, type} from '../../theme';
import {ordinary, discontinuous, verbGroups, quotation, divided, reunited, quoteLines, type Reading, type Segment} from './model';
import episode from './metadata.json';
import scenes from './scenes.json';

const teal = ink.entity;
function Annotation({identity, x, y, width}: {identity: Reading['annotation']['identity']; x:number; y:number; width:number}) {
  return <g transform={`translate(${x} ${y})`} data-annotation={identity.key}>
    <rect width={width} height={70} rx={4} fill="#203434" stroke={teal} strokeWidth={2}/>
    <path d="M59 0V70" stroke={teal} strokeOpacity={.55}/>
    <text x={30} y={46} textAnchor="middle" fill={teal} fontFamily={type.mono} fontSize={32}>{identity.key}</text>
    <text x={78} y={46} fill={ink.cream} fontFamily={type.sans} fontSize={35}>{identity.label}</text>
  </g>;
}

function Heading({children}: {children: React.ReactNode}) {
  return <text x={76} y={231} fontFamily={type.serif} fontSize={58} fill={ink.cream}>{children}</text>;
}

function VerbDiagram({t}: {t:number}) {
  const before = ordinary.blocks[0].cells, after = discontinuous.blocks[0].cells;
  const motion = ease(t,6.65,9.05);
  const arc = -72 * Math.sin(Math.PI * motion);
  const oldMark = ease(t,2.45,3.25) * (1-ease(t,6.02,6.62));
  const targets = [ease(t,9.05,10.05), ease(t,10.65,11.65)];
  const fork = ease(t,14.05,15.8);
  return <g opacity={hold(t,1.85,22,.55)}>
    <Heading>A separable verb</Heading>
    <CellSequence cells={before} size={72}>{original =>
      <CellSequence cells={after} size={72}>{changed => {
        function mark(segment: Segment, index:number, single:boolean) {
          const spans = single ? original : changed;
          const left = spans.get(segment.start)!, right = spans.get(segment.end)!;
          const span = {left:left.left, right:right.right};
          const center = (span.left + span.right) / 2;
          const draw = single ? oldMark : targets[index];
          const links = single ? oldMark : fork;
          return <g key={(single?'ordinary':'separate') + index} data-segment={index+1}>
            <g opacity={links}>
              <path d={`M540 399 V429 Q540 439 ${mix(540,center,.14)} 442 L${center} 470 V486`}
                fill="none" stroke={teal} strokeWidth={2.8} pathLength={1} strokeDasharray="1" strokeDashoffset={1-links}/>
              <text x={center} y={522} textAnchor="middle" fill={teal} fontFamily={type.mono} fontSize={29}>Segment {index+1}</text>
              {[left,right].map((bounds,k) => {
                const x = (bounds.left+bounds.right)/2;
                return <g key={k}>
                  <path d={`M${center} 537 Q${center} 547 ${mix(center,x,.22)} 550 L${x} 570 V587`}
                    fill="none" stroke={teal} strokeWidth={2.2} strokeDasharray="5 5"/>
                  <CellLeaf x={x} width={bounds.right-bounds.left+4} bottom={662} height={75} accent={teal}/>
                </g>;
              })}
            </g>
            <RangeUnderline y={674} color={teal} span={span} draw={draw}/>
          </g>;
        }
        return <>
          {ordinary.annotation.segments.map((segment,i)=>mark(segment,i,true))}
          {discontinuous.annotation.segments.map((segment,i)=>mark(segment,i,false))}
          <text fontFamily={type.serif} fontSize={72} fill={ink.cream} xmlSpace="preserve" style={{whiteSpace:'pre'}}>
            {verbGroups.map((group,i) => <tspan key={group[0].key} y={648 + (i===3 ? arc : 0)}
              x={mix(original.get(group[0])!.left,changed.get(group[0])!.left,motion)}>{group.map(c=>c.value).join('')}</tspan>)}
          </text>
        </>;
      }}</CellSequence>
    }</CellSequence>
    <g opacity={ease(t,2.2,2.85)*(1-.32*hold(t,6.05,14.8,.6))}>
      <Annotation identity={ordinary.annotation.identity} x={320} y={329} width={440}/>
    </g>
  </g>;
}

const baselines = [459,532,626,695];
const seam = 564;
const textX = 310;
const rail = 290;
function QuoteLine({cells, row, y, segments, split, read}: {
  cells:LetterCell[]; row:number; y:number; segments:Segment[]; split:number; read:number;
}) {
  const fontSize = 51;
  return <CellSequence cells={cells} size={fontSize}>{spans=>{
    const leftOffset = textX - spans.get(cells[0])!.left;
    const x1 = (c:LetterCell) => leftOffset + spans.get(c)!.left;
    const x2 = (c:LetterCell) => leftOffset + spans.get(c)!.right;
    return <g>
      {segments.map((segment,k)=>{
        const block = segment.block.cells;
        const from = block.indexOf(segment.start), to = block.indexOf(segment.end);
        const fragment = cells.filter(c=>{
          const at = block.indexOf(c);
          return at>=from && at<=to && c.value!==' ';
        });
        if (!fragment.length) return null;
        const left = x1(fragment[0]), right = x2(fragment[fragment.length-1]);
        return <g key={k}>
          <path d={`M${rail} ${y+14} H${left}`} fill="none" stroke={teal} strokeWidth={2.5}/>
          <path d={`M${left} ${y+14} H${right}`} stroke={teal} strokeWidth={4}/>
          <path d={`M${left} ${y+14} H${mix(left,right,read)}`} opacity={read>0?.78:0} stroke={ink.cream} strokeWidth={4}/>
          {[segment.start,segment.end].filter(c=>fragment.includes(c)).map(c=>{
            const outer = c===quotation.annotation.segments[0].start || c===quotation.annotation.segments[0].end;
            const x = c===segment.start ? x1(c) : x2(c);
            return <g key={c.key} opacity={outer?1:split} data-endpoint={c.key}>
              <CellLeaf x={(x1(c)+x2(c))/2} width={x2(c)-x1(c)+3} height={57} bottom={y+8} accent={teal}/>
              <circle cx={x} cy={y+14} r={5.3} fill={teal}/>
            </g>;
          })}
        </g>;
      })}
      <text x={textX} y={y} fontFamily={type.serif} fontSize={fontSize} fill={row===0?ink.grey:ink.cream}
        xmlSpace="preserve" style={{whiteSpace:'pre'}}>{cells.map(c=>c.value).join('')}</text>
    </g>;
  }}</CellSequence>;
}

function QuotationDiagram({t}:{t:number}) {
  const split = ease(t,32.9,37.7)*(1-ease(t,48.85,53.3));
  const drop = split*82;
  const reading = split>0 ? divided.reading : t<48 ? quotation : reunited;
  const reveal = ease(t,23.9,26.1);
  const accent = hold(t,29.45,37,.85);
  const upperY = baselines[1]+14, middleY = baselines[2]+14+drop, lowerY = baselines[3]+14+drop;
  const attach = mix((upperY+baselines[3]+14)/2,upperY,split);
  const lowerAttach = (middleY+lowerY)/2;
  function arm(index:number,y:number,opacity:number) {
    return <g opacity={opacity}>
      <path d={`M106 ${y} H${rail}`} stroke={teal} strokeWidth={2.6}/>
      <circle cx={106} cy={y} r={4} fill={teal}/>
      <text x={128} y={y-12} fontFamily={type.sans} fontSize={29} fill={teal}>Segment {index+1}</text>
    </g>;
  }
  return <g opacity={hold(t,22,57,.6)}>
    <Heading>A quotation in reading order</Heading>
    <g opacity={reveal} stroke={ink.grey} strokeWidth={2} strokeOpacity={.72} fill="none">
      <path d={`M268 ${seam} V375 Q268 368 275 368 H991 Q998 368 998 375 V${seam}`}/>
      <path transform={`translate(0 ${drop})`} d={`M268 ${seam} V734 Q268 741 275 741 H991 Q998 741 998 734 V${seam}`}/>
      <path d={`M268 ${seam} H998 M268 ${seam+drop} H998`} opacity={split}/>
    </g>
    <g fill={ink.grey} fontFamily={type.mono} fontSize={23} letterSpacing={2}>
      <text x={978} textAnchor="end" y={400} opacity={reveal}>BLOCK {quotation.blocks[0].id}</text>
      <text x={978} textAnchor="end" y={seam+drop+29} opacity={split}>BLOCK {divided.reading.blocks[1].id}</text>
    </g>
    <g stroke={teal} strokeWidth={2.6} fill="none">
      <path d={`M106 330 V${attach}`}/>
      <path d={`M106 ${attach} V${lowerAttach}`} opacity={split}/>
      <path d={`M${rail} ${upperY} V${mix(middleY,upperY,split)} M${rail} ${middleY} V${lowerY}`}/>
    </g>
    {arm(0,attach,1)}
    {arm(1,lowerAttach,split)}
    <g opacity={accent} stroke={ink.grammar} strokeWidth={3}>
      <path d={`M275 ${seam} H991`} strokeDasharray="10 8"/>
      <path d={`M998 ${seam-6} l-7 6 7 6`} fill="none"/>
    </g>
    {quoteLines.map((cells,row)=><QuoteLine key={cells[0].key} cells={cells} row={row}
      y={baselines[row]+(row>1?drop:0)} split={split} segments={reading.annotation.segments}
      read={ease(t,43+row*.78,43.8+row*.78)*(1-ease(t,47.3,48))}/>)}
    <Annotation identity={reading.annotation.identity} x={76} y={260} width={275}/>
    <text x={998} y={873} textAnchor="end" fontFamily={type.serif} fontSize={36} fontStyle="italic"
      fill={teal} opacity={hold(t,43.4,48,.65)}>No words are skipped.</text>
  </g>;
}

export function BeyondTheContiguousRange() {
  const frame = useCurrentFrame(), {fps} = useVideoConfig();
  const t = frame/fps;
  return <>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
    <SeriesPlate number={episode.number} productBranding={false}>
      {t<2.45 && <Bookend lead={episode.title} emphasis="One annotation. Many segments." leadSize={63} emphasisSize={55}
        opacity={1-ease(t,1.8,2.4)} spread={ease(t,0,1.6)}/>}
      {t<22 && <VerbDiagram t={t}/>}
      {t>=22 && t<57 && <QuotationDiagram t={t}/>}
      <path d="M76 905H1004" stroke={ink.rule} strokeWidth={1.5} opacity={hold(t,2.3,57)}/>
      {scenes.slice(0,-1).map(s=><Caption key={s.id} text={s.caption}
        opacity={hold(t,s.start || 2.6,s.start+s.duration,.4)}/>)}
      {t>=56.85 && <Bookend lead="Text has structure." emphasis="Meaning need not obey it." leadSize={82} emphasisSize={73}
        spread={1-ease(t,57,62)} opacity={ease(t,56.85,57.65)}/>}
    </SeriesPlate>
  </>;
}
