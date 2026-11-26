import React from 'react';
import {CellSequence,mix} from '../../shared/CellSequence';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {DocumentFrame} from '../../shared/DocumentFrame';
import {ease,hold} from '../../shared/motion';
import {EntityNode,Link,MentionNode,point,radius} from '../006-where-text-meets-the-graph/graph';
import {ink,type} from '../../theme';
import {contains,corpus,inquiry,napoleon,type Annotation,type Entity,type Evidence} from './model';
import {extent,Predicate} from './geometry';

const travel=(t:number,a:number,b:number)=> t<=a || t>=b ? undefined : (t-a)/(b-a);
const reverse=(v:number|undefined)=>v===undefined?undefined:1-v;
const resultGroups=Array.from(inquiry.results);
const origin=point(189,248);
const status=(e:(typeof inquiry.evaluations)[number])=>{
  if(!e.people.length) return 'Different person';
  if(!e.speeches.length) return 'No direct speech';
  if(!e.containing.length) return 'Person outside the speech';
  return 'Person within speech';
};

function ResultPath({t,entity,hit,rank,y,x,glyphY,visibility}:{
  t:number;entity:Entity;hit:Evidence;rank:number;y:number;x:number;glyphY:number;visibility:number;
}) {
  const node=point(866,y+135),record=point(525,y+207),start=74+rank*.65;
  const forward=travel(t,start,start+1.15)??reverse(travel(t,79.75+rank*.25,80.95+rank*.25));
  const outward=travel(t,start+1.37,start+2.67)??reverse(travel(t,78.3+rank*.25,79.55+rank*.25));
  return <g opacity={visibility} data-result={entity.id} data-source={hit.document.source.context.document}>
    <Link color={ink.entity} curve={[point(x,glyphY),point(x+65,glyphY),point(record.x,record.y-60),point(record.x,record.y-25)]}
      draw={1} pulse={forward}/>
    <Link color={ink.grammar} curve={[point(record.x+77,record.y),point(record.x+146,record.y),
      point(node.x-radius.x-50,node.y),point(node.x-radius.x,node.y)]} draw={1} pulse={outward}/>
    <MentionNode id={hit.place.id} center={record} opacity={1} light={hold(t,start+1,start+1.7,.15)}/>
    <EntityNode entity={entity} center={node} opacity={ease(t,start+1.65,start+2.6)} light={hold(t,start+2.4,80.3,.35)}/>
  </g>;
}

function DocumentRow({index,t,expand,verdict,returning}:{index:number;t:number;expand:number;verdict:number;returning:number}) {
  const e=inquiry.evaluations[index],doc=e.document,src=doc.source;
  const groupIndex=resultGroups.findIndex(([,hits])=>hits.some(h=>h.document===doc));
  const group=resultGroups[groupIndex];
  const hit=group?.[1].find(h=>h.document===doc);
  const rank=groupIndex<0?0:groupIndex;
  const baseY=324+index*107;
  const x=mix(mix(362,78,expand),76,returning);
  const y=mix(mix(baseY,265+index*120,expand),278+rank*282,returning);
  const width=mix(1004-x,620,returning),height=mix(mix(99,112,expand),168,returning);
  const baseline=mix(mix(72,74,expand),78,returning);
  const scale=mix(36,38,returning)/40;
  const placePhase=ease(t,65.6,67.35);
  const scanned=ease(t,55.75+index*.72,56.65+index*.72);
  const attention=doc.preview!==doc.firstLine?hold(t,59.7,65.6,.55):0;
  const fade=hit?1:(1-.3*scanned*(1-attention))*(1-ease(t,71.8,73.25));
  const person=doc.records.find(r=>r.entity?.kind==='person')!;
  const arrival=44.75+index*.66;
  const personY=y+baseline+8;
  return <g opacity={fade} data-document={src.context.document}>
    <DocumentFrame id={src.context.document} x={x} y={y} width={width} height={height}/>
    <CellSequence cells={src.cells} size={40}>{spans=>{
      const first=spans.get(src.cells[0])!.left;
      const textX=x+19;
      const boundary=(r:Annotation)=>{
        const range=extent(src,spans,r.segments[0]);
        return {left:textX+(range.left-first)*scale,right:textX+(range.right-first)*scale};
      };
      const preview=spans.get(src.cells[doc.preview.length-1])!.right;
      const full=spans.get(src.cells[doc.firstLine.length-1])!.right;
      const clipWidth=mix(preview-first,full-first,expand)+2;
      const rec=point(250,personY);
      const targetX=boundary(person).left;
      const angle=(91+index*12)*Math.PI/180;
      const port=point(origin.x+radius.x*Math.cos(angle),origin.y+radius.y*Math.sin(angle));
      const relationAlpha=scanned*expand;
      return <>
        <defs><clipPath id={'line-'+index}><rect x={-3} y={-45} width={clipWidth+3} height={59}/></clipPath></defs>
        <g opacity={1-expand}>
          {e.people.includes(person) && <Link color={ink.grammar} curve={[
            port,point(port.x-26,port.y+45),point(135-index*12,rec.y),point(rec.x-77,rec.y)
          ]} draw={1} pulse={travel(t,arrival,arrival+1.45)}/>}
          <Link color={ink.entity} curve={[point(rec.x+77,rec.y),point(rec.x+100,rec.y),point(targetX-19,personY),point(targetX,personY)]}
            draw={1} pulse={e.people.includes(person)?travel(t,arrival+1.62,arrival+2.6):undefined}/>
          <MentionNode id={person.id} center={rec} opacity={e.people.length?1:.5} light={e.people.length?hold(t,arrival+1.22,arrival+1.9,.14):0}/>
        </g>
        <text x={x+19} y={y+30} fill={e.containing.length?ink.grammar:ink.grey} fontFamily={type.sans}
          fontSize={25} opacity={relationAlpha}>{placePhase>.6 && hit?'Place within the same speech':status(e)}</text>
        {doc.records.map(r=>{
          const span=boundary(r),isSpeech=r.kind==='speech',isPerson=r.entity?.kind==='person';
          const onPreview=r.segments[0].end<=doc.preview.length;
          const visibility=isSpeech?verdict:onPreview?1:expand;
          const personLight=e.people.includes(r)?hold(t,arrival+2,55.55,.35):0;
          const qualified=isPerson?e.people.includes(r) && e.containing.some(s=>contains(s,r)):e.evidence.some(h=>h.place===r);
          const strength=isPerson?relationAlpha*(1-placePhase*.67):placePhase;
          return <g key={r.id} opacity={visibility} data-annotation={r.id}>
            {isSpeech?<>
              <rect x={span.left} y={y+baseline-34} width={span.right-span.left} height={57} fill={ink.grammar} opacity={.105}/>
              <path d={`M${span.left} ${personY-39} V${personY+15} H${span.right} V${personY-39}`}
                stroke={ink.grammar} strokeWidth={2.5} fill="none"/>
            </>:<>
              <rect x={span.left} y={y+baseline-32} width={span.right-span.left} height={40} rx={2}
                fill={ink.cream} opacity={.24*Math.max(personLight,qualified?strength:0,hit?.place===r?hold(t,80.7,82.85,.25):0)}/>
              <RangeUnderline span={span} y={personY} draw={1} color={ink.entity}/>
              {qualified && <path d={`M${span.left} ${personY+1}v14 M${span.right} ${personY+1}v14`}
                opacity={strength} stroke={ink.cream} strokeWidth={2} strokeDasharray="3 3"/>}
            </>}
          </g>;
        })}
        <g transform={`translate(${textX} ${y+baseline}) scale(${scale})`}>
          <g clipPath={`url(#line-${index})`}>
            <text fontSize={40} fontFamily={type.serif} fill={ink.cream} data-line={src.context.document}>{doc.firstLine}</text>
          </g>
          <text y={69} fontSize={40} fontFamily={type.serif} fill={ink.grey} opacity={returning}>{doc.remainder}</text>
        </g>
        {hit && group && <ResultPath t={t} rank={rank} entity={group[0]} hit={hit} y={y} x={boundary(hit.place).right}
          glyphY={personY} visibility={returning}/>}
      </>;
    }}</CellSequence>
  </g>;
}

export function CorpusScene({t}:{t:number}) {
  const unfold=ease(t,42.4,45.1),expand=ease(t,54.25,56.1),returning=ease(t,72.15,74.05);
  const verdict=ease(t,54.9,56.25);
  const scan=ease(t,55.75,59.55);
  return <g opacity={hold(t,34.75,83.45,.65)}>
    <g opacity={1-unfold} fill={ink.cream} fontFamily={type.serif} fontSize={55}>
      <text x={78} y={206} fill={ink.grey} fontFamily={type.mono} fontSize={24} letterSpacing={2}>RESEARCH QUESTION</text>
      <text x={76} y={275}>Which places are mentioned</text>
      <text x={76} y={338}>in passages of direct speech</text>
      <text x={76} y={401}>that also mention Napoleon?</text>
    </g>
    <g transform={`translate(${mix(174,0,unfold)} ${mix(363,0,unfold)}) scale(${mix(.58,1,unfold)})`} opacity={ease(t,36.8,39.35)}>
      <g opacity={1-expand}>
        <EntityNode entity={napoleon} center={origin} opacity={1} light={hold(t,44.2,48.9,.4)}/>
        <text x={362} y={246} fontFamily={type.serif} fontSize={47} fill={ink.cream}>One person, two expressions</text>
        <text x={364} y={290} fontFamily={type.sans} fontSize={29} fill={ink.grey}>Napoleon · The Emperor</text>
      </g>
      <g opacity={expand*(1-returning)}>
        <Predicate x={177} y={207} label="CONTAINS"/>
        <text x={318} y={221} fontFamily={type.serif} fontSize={43} fill={ink.cream}>
          {t<65.8?'Speech around a person':'Places in the same speech'}
        </text>
      </g>
      <text x={76} y={225} fontFamily={type.serif} fontSize={52} fill={ink.cream} opacity={returning}>Places and their source passages</text>
      {corpus.map((doc,i)=><DocumentRow key={doc.source.context.document} index={i} t={t} expand={expand} verdict={verdict} returning={returning}/>)}
      <path d={`M65 ${mix(291,771,scan)}v52`} stroke={ink.grammar} strokeWidth={5} opacity={hold(t,55.6,60.15,.4)}/>
    </g>
  </g>;
}
