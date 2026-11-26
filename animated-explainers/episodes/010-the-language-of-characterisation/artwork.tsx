import React,{useLayoutEffect,useRef,useState} from 'react';
import {ink,type} from '../../theme';
import {StatementPlate} from '../../shared/StatementPlate';
import {DocumentFrame} from '../../shared/DocumentFrame';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {measureSpan,type Span} from '../../shared/TextRun';
import {Link,between,point,type Point} from '../006-where-text-meets-the-graph/graph';
import {concepts,entities,type ConceptId,type TraitStatement} from './model';

export function TraitNode({record}:{record:TraitStatement}) {
  return <g data-trait={record.id}>
    <StatementPlate width={266} label={'TRAIT STATEMENT · '+record.id} title="Characterisation" titleSize={31}/>
  </g>;
}
export function ConceptNode({id,focus=0}:{id:ConceptId;focus?:number}) {
  const cut='M-124 -48 H124 L140 -32 V32 L124 48 H-124 L-140 32 V-32Z';
  return <g data-concept={id}>
    <path d={cut} fill="#383128" stroke={ink.grammar} strokeWidth={2.8}/>
    <path d={cut} transform="scale(.953 .86)" fill="none" stroke={ink.grammar} opacity={.35+.45*focus}/>
    <text y={-10} textAnchor="middle" fill={ink.grammar} fontFamily={type.mono} fontSize={17} letterSpacing={.6}>
      {id==='dimension'?'CONCEPT':'TRAIT TYPE / CONCEPT'}
    </text>
    <text y={26} textAnchor="middle" fill={ink.cream} fontFamily={type.serif} fontSize={33}>{concepts[id]}</text>
  </g>;
}

export function RoleLink({a,b,color,opacity,label,pulse,draw=1}:{a:Point;b:Point;color:string;opacity:number;
  label?:{at:Point;text:string};pulse?:number;draw?:number}) {
  return <g opacity={opacity}>
    <Link curve={[a,between(a,b,.34),between(a,b,.66),b]} color={color} pulse={pulse} draw={draw}/>
    {label && <text x={label.at.x} y={label.at.y} textAnchor="middle" fill={ink.cream} stroke={ink.paper}
      strokeWidth={8} paintOrder="stroke" fontFamily={type.sans} fontSize={25}>{label.text}</text>}
  </g>;
}

export function SourcePassage({record,x,y,wide=false,subject=0,expression,guide=0,opacity}:{
  record:TraitStatement;x:number;y:number;wide?:boolean;subject?:number;expression:number;guide?:number;opacity:number;
}) {
  const source=record.source, w=wide?928:598,h=wide?207:144,size=wide?51:30;
  const baseline=wide?149:100, line=baseline+10;
  const ref=useRef<SVGTextElement>(null);
  const [spans,setSpans]=useState<{subject:Span;expression:Span}>();
  useLayoutEffect(()=>{
    const run=ref.current!;
    setSpans({subject:measureSpan(run,source.subject.start,source.subject.end),
      expression:measureSpan(run,source.expression.start,source.expression.end)});
  },[source,w,size]);
  const author=entities[record.observer].name[0];
  const title=source.diary?author+' — '+source.title:author;
  return <g opacity={opacity} data-document={source.document} transform={`translate(${x} ${y})`}>
    <DocumentFrame x={0} y={0} width={w} height={h} id={source.document}/>
    <text x={20} y={31} fill={ink.cream} fontFamily={type.sans} fontSize={wide?30:23}>{title}</text>
    <text x={20} y={wide?70:59} fill={ink.grey} fontFamily={type.sans} fontSize={wide?27:22}>{source.qualification}</text>
    <text ref={ref} data-source-run="" x={w/2} textAnchor="middle" y={baseline} fill={ink.cream} fontFamily={type.serif} fontSize={size}>{source.text}</text>
    {spans && <>
      <g data-expression=""><RangeUnderline span={spans.expression} y={line} color={ink.entity} draw={expression}/></g>
      {subject>0 && <RangeUnderline span={spans.subject} y={line} color={ink.grammar} draw={subject}/>}
      {wide?<path d={`M${w/2} ${h} V${line+21} H${spans.expression.left} V${line}`}
        stroke={ink.entity} strokeDasharray="6 6" fill="none" opacity={guide} strokeWidth={2}/>:
        <path d={`M0 ${line} H${spans.expression.left}`} stroke={ink.entity}
          strokeDasharray="6 6" fill="none" opacity={guide} strokeWidth={2}/>}
    </>}
  </g>;
}

export function port(from:Point,to:Point,key:string) {
  const dx=to.x-from.x,dy=to.y-from.y;
  const distance=key.startsWith('entity/')?Math.hypot(dx/113,dy/46):
    Math.max(Math.abs(dx)/(key.startsWith('concept/')?140:133),Math.abs(dy)/49);
  return point(from.x+dx/(distance||1),from.y+dy/(distance||1));
}
