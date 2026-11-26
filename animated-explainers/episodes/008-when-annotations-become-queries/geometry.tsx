import React from 'react';
import {CellSequence,mix,type LetterCell} from '../../shared/CellSequence';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {ease,hold} from '../../shared/motion';
import type {Span} from '../../shared/TextRun';
import {ink,type} from '../../theme';
import {contains,intersection,intersects,meets,opening,openingMarks,reading,readings,person,speech,irony,composed,
  type Source,type Interval,type Annotation} from './model';

export function extent(src:Source,spans:Map<LetterCell,Span>,s:Interval):Span {
  return {left:spans.get(src.cells[s.start])!.left,right:spans.get(src.cells[s.end-1])!.right};
}
function blend(a:Span,b:Span,n:number):Span {
  return {left:mix(a.left,b.left,n),right:mix(a.right,b.right,n)};
}
export function Predicate({x,y,label,opacity=1}:{x:number;y:number;label:string;opacity?:number}) {
  return <g transform={`translate(${x} ${y})`} opacity={opacity}>
    <rect x={-100} y={-26} width={200} height={52} rx={4} fill="#283630" stroke={ink.grammar} strokeWidth={2}/>
    <text y={9} textAnchor="middle" fill={ink.grammar} fontFamily={type.mono} fontSize={26} letterSpacing={2}>{label}</text>
  </g>;
}
function band(span:Span,upper:number,lower:number,alpha:number) {
  return <g opacity={alpha}>
    <rect x={span.left} y={upper} width={Math.max(0,span.right-span.left)} height={lower-upper}
      fill={ink.cream} fillOpacity={.13}/>
    {[span.left,span.right].map((x,i)=><path key={i} d={`M${x} ${upper}V${lower}`}
      stroke={ink.cream} strokeWidth={2} strokeDasharray="5 7"/>)}
  </g>;
}
const axisContext={document:'axis',block:'01',revision:1};
function axisRange(start:number,end:number):Annotation {
  return {id:'axis-range',kind:'event',segments:[{context:axisContext,start,end}]};
}

export function Geometry({t}:{t:number}) {
  const lift=ease(t,7.15,12.25), abstract=ease(t,15.6,17.1);
  const inside=ease(t,19.55,20.8), contact=ease(t,22.85,24.3), reset=ease(t,27.05,28.9);
  const x=(tick:number)=>148+tick*49;
  const a=axisRange(3,11);
  const b=axisRange(mix(mix(mix(8,6,inside),11,contact),6,reset),mix(mix(mix(14,9,inside),15,contact),9,reset));
  const ai=a.segments[0],bi=b.segments[0];
  const included=contains(a,b), common=intersects(a,b), adjacent=meets(ai,bi);
  const description=adjacent?'Meets':included?'Contains · Within':common?'Partial overlap':'Disjoint';
  const top=mix(491,482,lift),bottom=mix(506,641,lift);
  const exit=ease(t,34,35.85);
  return <g opacity={ease(t,2,2.8)*(1-exit)} transform={`translate(540 540) scale(${1-.24*exit}) translate(-540 -540)`}>
    <text x={76} y={230} fontFamily={type.serif} fontSize={56} fill={ink.cream}>
      {t<7?'One sentence, three layers':t<16?'One shared textual axis':t<27?'Compare two ranges':'Query the records'}
    </text>
    <text x={77} y={286} fontFamily={type.sans} fontSize={31} fill={ink.grey}
      opacity={hold(t,7.6,15.9,.6)}>Compare ranges from the same passage and version.</text>
    <CellSequence cells={opening.cells} size={49}>{spans=>{
      const [p,city,event,report]=openingMarks.map(r=>extent(opening,spans,r.segments[0]));
      const lower=blend(event,{left:x(ai.start),right:x(ai.end)},abstract);
      const upper=blend(report,{left:x(bi.start),right:x(bi.end)},abstract);
      const left=Math.max(lower.left,upper.left),right=Math.min(lower.right,upper.right);
      const lettersY=mix(452,367,lift);
      const axisY=mix(520,737,lift);
      return <>
        <text x={540} y={lettersY} fill={ink.cream} textAnchor="middle" fontFamily={type.serif} fontSize={49}
          opacity={1-ease(t,13.3,16.1)}>{opening.text}</text>
        <g opacity={(1-abstract)*ease(t,3,3.8)}>
          {[p,city].map((span,i)=><RangeUnderline key={i} span={span} y={lettersY+12} color={ink.entity} draw={1}/>)}
        </g>
        <g opacity={lift}>
          <path d={`M${mix(event.left,x(0),abstract)} ${axisY} H${mix(event.right,x(16),abstract)}`} stroke={ink.grey} strokeWidth={2}/>
          {Array.from({length:17},(_,i)=>{
            const cell=opening.cells[Math.round((opening.cells.length-2)*i/16)];
            const position=mix(i===16?event.right:spans.get(cell)!.left,x(i),abstract);
            return <path key={i} d={`M${position} ${axisY}v${i%4===0?15:8}`} stroke={ink.grey} strokeWidth={2}/>;
          })}
        </g>
        <g opacity={hold(t,8.2,11.35,.55)} stroke={ink.entity} strokeWidth={1.7} strokeDasharray="4 7">
          {[p.left,p.right,city.left,city.right].map((edge,i)=><path key={i} d={`M${edge} ${lettersY+16}V${bottom}`}/>)}
        </g>
        <text x={540} y={843} textAnchor="middle" fontFamily={type.sans} fontSize={31} fill={ink.grey}
          opacity={hold(t,8.2,12.3,.55)}>The event contains two disjoint mentions.</text>
        {right>left && band({left,right},top,bottom,ease(t,10.3,11.7)*(t>=27?ease(t,29.2,30.9):1))}
        {adjacent && <path d={`M${upper.left} ${top-11} V${bottom+11}`} stroke={ink.cream} strokeWidth={3} strokeDasharray="5 6"/>}
        <RangeUnderline span={upper} y={top} color={ink.grammar} draw={ease(t,3.5,4.55)}/>
        <RangeUnderline span={lower} y={bottom} color={ink.narrative} draw={ease(t,4.25,5.4)}/>
        <g fontFamily={type.sans} fontSize={28} opacity={lift*(1-abstract)}>
          <text x={upper.left} y={top-17} fill={ink.grammar}>Reported information</text>
          <text x={lower.left} y={bottom+43} fill={ink.narrative}>Arrival event</text>
        </g>
        <g opacity={hold(t,2.9,8,.55)} fontFamily={type.sans} fontSize={30}>
          <text x={97} y={780} fill={ink.entity}>Person and place</text>
          <text x={412} y={780} fill={ink.grammar}>Reported information</text>
          <text x={800} y={780} fill={ink.narrative}>Arrival event</text>
        </g>
        <g opacity={hold(t,16.25,27.15,.5)}>
          <text x={540} y={342} textAnchor="middle" fontFamily={type.serif} fontSize={52} fill={ink.cream}>{description}</text>
          <text x={540} y={847} textAnchor="middle" fontFamily={type.sans} fontSize={34} fill={ink.grey}>
            {adjacent?'A common boundary. No shared characters.':included?'The entire inner range is shared.':'Part of each range is shared.'}
          </text>
        </g>
        <g opacity={ease(t,27.3,29.25)}>
          {[{span:upper,y:top,color:ink.grammar,label:'Record B'},{span:lower,y:bottom,color:ink.narrative,label:'Record A'}].map(({span,y,color,label})=>
            <g key={label} transform={`translate(0 ${y})`}>
              <path d={`M254 0H${span.left}`} stroke={color} strokeWidth={2} strokeDasharray="5 6"/>
              <rect x={76} y={-25} width={178} height={50} rx={4} fill="#263236" stroke={color} strokeWidth={2}/>
              <text x={165} y={9} textAnchor="middle" fontFamily={type.mono} fontSize={27} fill={ink.cream}>{label}</text>
            </g>)}
          <Predicate x={540} y={326} label="CONTAINS" opacity={ease(t,28.8,29.8)}/>
          <text x={540} y={846} textAnchor="middle" fontFamily={type.sans} fontSize={34} fill={ink.cream}
            opacity={included?ease(t,30.25,31.4):0}>{t<32.1?'Both boundaries of B lie inside A.':'The records alone supply the answer.'}</text>
        </g>
      </>;
    }}</CellSequence>
  </g>;
}

export function Ontologies({t}:{t:number}) {
  const style=[{name:'Entities · Person',color:ink.entity},{name:'Narratology · Direct speech',color:ink.grammar},{name:'Rhetoric · Irony',color:ink.narrative}];
  return <g opacity={hold(t,82.8,94.2,.7)}>
    <g fill={ink.cream} fontFamily={type.serif} fontSize={44}>
      <text x={76} y={224}>Find direct speech containing a person</text>
      <text x={76} y={281}>mention and an expression of irony.</text>
    </g>
    <CellSequence cells={reading.cells} size={45}>{spans=>{
      const rows=[520,640,760];
      const extentOf=(r:Annotation)=>extent(reading,spans,r.segments[0]);
      return <>
        <text x={540} y={406} textAnchor="middle" fill={ink.cream} fontFamily={type.serif} fontSize={45}>{reading.text}</text>
        {[person,irony].map((r,i)=>{
          const shared=intersection(speech.segments[0],r.segments[0]);
          return shared && <g key={r.id}>{band(extent(reading,spans,shared),rows[i],rows[i+1],composed?ease(t,88.5+i*.6,90.25+i*.6):0)}</g>;
        })}
        {readings.map((r,i)=>{
          const s=extentOf(r),y=rows[i];
          return <g key={r.id} opacity={ease(t,84+i*.8,84.9+i*.8)}>
            <text x={s.left} y={y-15} fontFamily={type.sans} fontSize={30} fill={style[i].color}>{style[i].name}</text>
            <RangeUnderline span={s} y={y} draw={1} color={style[i].color}/>
          </g>;
        })}
      </>;
    }}</CellSequence>
  </g>;
}
