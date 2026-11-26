import React,{useLayoutEffect,useRef,useState} from 'react';
import {DocumentFrame} from '../../shared/DocumentFrame';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {measureSpan,type Span} from '../../shared/TextRun';
import {ink,type} from '../../theme';
import {ease} from '../../shared/motion';
import type {Claim} from './model';

// Both visual lines belong to one shaped text element. Preserve the wrap space
// in the first tspan so character indices remain offsets into the source.
export function Passage({claim,x,y,width,opacity,time,evidence}:{
  claim:Claim;x:number;y:number;width:number;opacity:number;time:number;evidence?:number;
}) {
  const {source}=claim, ref=useRef<SVGTextElement>(null);
  const [marks,setMarks]=useState<{span:Span;line:number}[]>([]);
  const [lines,setLines]=useState<Span[]>([]);
  const size=evidence===undefined?42:37;
  useLayoutEffect(()=>{
    const run=ref.current!;
    setMarks(claim.participants.map(({mention})=>({
      span:measureSpan(run,mention.start,mention.end),line:Number(mention.start>=source.wrap)})));
    setLines([measureSpan(run,source.range.start,source.wrap-1),measureSpan(run,source.wrap,source.range.end)]);
  },[claim,source,size]);
  const baseline=82,leading=54, draw=evidence??0;
  return <g data-document={source.id} opacity={opacity} transform={`translate(${x} ${y})`}>
    <DocumentFrame id={source.id} x={0} y={0} width={width} height={164}/>
    <text x={24} y={31} fill={ink.grey} fontFamily={type.mono} fontSize={20} letterSpacing={1}>ILLUSTRATIVE PASSAGE</text>
    <text ref={ref} xmlSpace="preserve" style={{whiteSpace:'pre'}} fontFamily={type.serif} fontSize={size} fill={ink.cream}>
      <tspan x={24} y={baseline}>{source.text.slice(0,source.wrap)}</tspan><tspan x={24} y={baseline+leading}>{source.text.slice(source.wrap)}</tspan>
    </text>
    {evidence===undefined ? marks.map(({span,line},i)=><RangeUnderline key={i} span={span} y={baseline+line*leading+9}
      draw={ease(time,i*1.04,i*1.04+.6)} color={ink.entity}/>) :
      lines.map((span,i)=>{
        const progress=Math.min(1,Math.max(0,draw*2-i)), y=baseline+i*leading+9;
        const end=span.left+(span.right-span.left)*progress;
        return <g key={i} opacity={progress>0?1:0} stroke={ink.entity} fill={ink.entity}>
          <path d={`M${span.left} ${y}H${end}`} strokeWidth={4.5}/>
          {i===0 && <circle cx={span.left} cy={y} r={5}/>}
          {i===1 && <circle cx={end} cy={y} r={5}/>}
        </g>;
      })}
  </g>;
}
