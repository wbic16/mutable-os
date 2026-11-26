import React, {useLayoutEffect,useRef,useState} from 'react';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {DocumentFrame} from '../../shared/DocumentFrame';
import {mix} from '../../shared/CellSequence';
import {ease,hold} from '../../shared/motion';
import {measureSpan,type Span} from '../../shared/TextRun';
import {ink,type} from '../../theme';
import {between,Link,MentionNode,mentionHalfWidth,point,radius,type Curve,type Point} from '../006-where-text-meets-the-graph/graph';
import {bond,bounds,corpus,description,searchMentions,type Mention} from './corpus';

export const dinnerResults=searchMentions(description);
export const bondResults=searchMentions('Bond');
export const pronounResults=searchMentions('He');
export const evidence=dinnerResults.get(bond)![0];
export const travel=(t:number,from:number,to:number)=> t<=from||t>=to ? undefined : (t-from)/(to-from);
const back=(p:number|undefined)=>p===undefined?undefined:1-p;

export function heroAmount(t:number) {
  return ease(t,38.85,41.05)*(1-ease(t,46.65,47.7))+ease(t,61.7,63.25);
}

function linksFor(t:number,m:Mention) {
  const reverse=t>=62;
  const group=t>=47 && t<52.5;
  const pronoun=t>=52.5 && t<62;
  const results=group?bondResults:pronoun?pronounResults:dinnerResults;
  const selected=results.get(m.entity)?.includes(m);
  if(!selected) return {highlight:0,record:0};
  if(reverse) return {entity:back(travel(t,63.8,65.3)),record:hold(t,65.05,66.05,.22),
    target:back(travel(t,65.65,67.15)),highlight:hold(t,66.98,71.95,.4)};
  const start=group?48.55:pronoun?56:41.15;
  const speed=group?.66:1;
  const offset=(group||pronoun) && m.document.id!=='05' ? .2 : 0;
  return {target:travel(t,start+offset,start+offset+1.28*speed),
    record:hold(t,start+offset+1.07*speed,start+offset+1.76*speed,.15),
    entity:travel(t,start+offset+1.52*speed,start+offset+3.08*speed),
    highlight:hold(t,group?48.05:pronoun?55.05:39.15,group?51.95:pronoun?61.65:46.8,.36)};
}

function visibility(t:number,index:number) {
  if(corpus[index].document===evidence.document) return hold(t,28.7,47.18,.65)+hold(t,61.9,72,.65);
  if(index===4) return hold(t,46.88,62.15,.65);
  if(index===5) return hold(t,52.05,62.15,.65);
  const entry=24.05+index*1.55;
  return hold(t,entry,39.9,.72)+(index===0?hold(t,46.9,52.65,.65):0);
}

export function Passage({index,t,centers}: {index:number;t:number;centers:ReadonlyMap<Mention['entity'],Point>}) {
  const {document,mentions}=corpus[index];
  const text=useRef<SVGTextElement>(null);
  const [spans,setSpans]=useState<Span[]>([]);
  useLayoutEffect(()=>{
    setSpans(mentions.map(m=>{
      const {start,end}=bounds(m);
      return measureSpan(text.current!,start,end);
    }));
  },[mentions]);
  const hero=document===evidence.document?heroAmount(t):0;
  const paired=index>=4 || (index===0 && t>=46.8);
  const gridTop=350+index*130;
  const y=paired?(index===4?380:625):mix(gridTop,389,hero);
  const x=mix(512,153,hero);
  const width=1004-x;
  const height=paired?181:mix(123,221,hero);
  const size=paired?35:mix(35,49,hero);
  const base=paired?82:mix(61,100,hero);
  const scale=size/40;
  const opacity=visibility(t,index);
  const rowGap=paired?69:52;
  // The SVG text is one shaped run. Its local coordinates stay fixed as the
  // document moves or scales, so each port follows its original glyph.
  return <g data-document-id={document.id} opacity={opacity}>
    <DocumentFrame id={document.id} x={x} y={y} width={width} height={height}/>
    {index<4 && <path d={`M${x+width-4} ${y+9} v${height-18}`} stroke={ink.cream} strokeWidth={5}
      opacity={hold(t,36.7+index*.63,37.6+index*.63,.21)}/>}
    {mentions.map((m,k)=>{
      if(!spans[k])return null;
      const entity=centers.get(m.entity)!;
      const line=m.segment.block.cells.indexOf(m.segment.start)>document.lines[0].length?1:0;
      const origin=point(x+21,y+base+line*rowGap*scale);
      const span={left:origin.x+spans[k].left*scale,right:origin.x+spans[k].right*scale};
      const target=point(span.left,origin.y+8);
      const record=between(point(412,target.y),point(369,754),hero);
      const toRecord=between(point(record.x+mentionHalfWidth,record.y),point(record.x-mentionHalfWidth,record.y),hero);
      const fromRecord=between(point(record.x-mentionHalfWidth,record.y),point(record.x+mentionHalfWidth,record.y),hero);
      const angle=Math.atan2(.55*(record.y-entity.y),Math.max(1,record.x-entity.x));
      const port=between(point(entity.x+radius.x*Math.cos(angle),entity.y+radius.y*Math.sin(angle)),point(entity.x-radius.x,entity.y),hero);
      const targetLink:Curve=[target,point(target.x-mix(20,135,hero),target.y),
        point(toRecord.x+mix(25,-115,hero),toRecord.y),toRecord];
      const entityLink:Curve=[fromRecord,point(fromRecord.x+mix(-44,110,hero),fromRecord.y),
        point(port.x+mix(25,-88,hero),port.y),port];
      const light=linksFor(t,m);
      const heHasFocus=t>=54 && t<62;
      const bondHasFocus=t>=47 && t<52.1;
      const focus=heHasFocus?pronounResults:bondHasFocus?bondResults:undefined;
      const strong=!focus || focus.get(m.entity)?.includes(m);
      return <g key={m.id} data-record={m.id} data-entity-ref={m.entity.id}>
        <g opacity={strong?1:.34}>
          <Link curve={targetLink} color={ink.entity} draw={1} pulse={light.target}/>
          <Link curve={entityLink} color={ink.grammar} draw={1} pulse={light.entity}/>
          <MentionNode id={m.id} center={record} opacity={1} light={light.record}/>
        </g>
        <rect data-match={m.id} x={span.left-3} y={origin.y-size*.85} width={span.right-span.left+6}
          height={size*1.08} rx={3} fill={ink.grammar} opacity={light.highlight*.35}/>
        <RangeUnderline span={span} y={target.y} color={ink.entity} draw={1}/>
      </g>;
    })}
    <g transform={`translate(${x+21} ${y+base}) scale(${scale})`}>
      <text ref={text} data-passage={document.id} fontFamily={type.serif} fontSize={40} fill={ink.cream}
        xmlSpace="preserve">{document.lines.map((line,i)=><tspan key={i} x={0} y={rowGap*i}>{line}{i===0?' ':''}</tspan>)}</text>
    </g>
  </g>;
}
