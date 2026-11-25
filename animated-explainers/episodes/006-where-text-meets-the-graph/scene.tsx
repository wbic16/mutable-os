import React from 'react';
import {Html5Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Bookend, Caption, SeriesPlate} from '../../shared/SeriesPlate';
import {CellSequence, mix} from '../../shared/CellSequence';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {ease, hold} from '../../shared/motion';
import {ink, type} from '../../theme';
import {entities, mentions, type Mention} from './corpus';
import {between, EntityNode, Link, MentionNode, mentionHalfWidth, point, radius, type Point, type Curve} from './graph';
import episode from './metadata.json';
import scenes from './scenes.json';

const arrivals = [2,35.4,38.35,41.3,47.6];
const rowTops = [182,356,530,704,575];
const textSize = 39;
function passageLayout(index:number, grid:number, comparison:number) {
  const top = mix(rowTops[index],index===1?283:rowTops[index],comparison);
  const corpus = point(515,top);
  const doc = index===0 ? between(point(297,576),corpus,grid) : corpus;
  const width = index===0 ? mix(570,489,grid) : 489;
  const baseline = index===0 ? mix(92,96,grid) : 78;
  const row = point(422,doc.y+baseline+9);
  const record = index===0 ? between(point(347,495),row,grid) : row;
  return {doc,width,baseline,record};
}

function Neighbourhood({entity,reveal}: {entity:Point;reveal:number}) {
  const points = [point(157,302),point(411,267),point(736,249),point(908,389),point(134,497),point(747,450)];
  const edges = [[entity,points[0]],[entity,points[1]],[entity,points[2]],[entity,points[5]],
    [points[0],points[1]],[points[0],points[4]],[points[2],points[3]],[points[3],points[5]]];
  return <g opacity={reveal}>
    {edges.map(([a,b],i)=><path key={i} d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke={ink.grey}
      strokeWidth={2} strokeOpacity={.45} pathLength={1} strokeDasharray="1" strokeDashoffset={1-reveal}/>)}
    {points.map((p,i)=><g key={i} opacity={reveal} transform={`translate(${p.x} ${p.y})`}>
      <circle r={i%2===0?12:9} fill="#263336" stroke={ink.grey} strokeWidth={2}/>
      <circle r={3} fill={ink.grey}/>
    </g>)}
  </g>;
}

// Both directions traverse the same two curves. The pause between legs lets the
// eye find the mention record before the light exits its other port.
function traversal(t:number,index:number) {
  const inward = index===0;
  const returnAt = 62.5 + .19*index;
  const read = (start:number,length:number) => t>=start && t<start+length ? (t-start)/length : undefined;
  const reverse = (v:number|undefined) => v===undefined?undefined:1-v;
  return {
    target:(inward?read(58.35,1.25):undefined) ?? reverse(read(returnAt+1.68,1.3)),
    entity:(inward?read(59.83,1.4):undefined) ?? reverse(read(returnAt,1.45)),
    record:Math.max(inward?hold(t,59.4,60.05,.15):0,hold(t,returnAt+1.24,returnAt+1.9,.16)),
    text:Math.max(inward?hold(t,57.65,59.45,.35):0,hold(t,returnAt+2.7,67.25,.3)),
  };
}

function Association({mention,index,t,grid,comparison,entity}: {
  mention:Mention;index:number;t:number;grid:number;comparison:number;entity:Point;
}) {
  const {doc,width,baseline,record}=passageLayout(index,grid,comparison);
  const start=arrivals[index];
  const isPair = index===1 || index===4;
  const exit = index===4 ? ease(t,55,56.65) : isPair?0:comparison;
  const opacity=ease(t,start,start+.75)*(1-exit);
  if (t<start) return null;
  const amount = index===0?ease(t,2.65,3.65):ease(t,start+.32,start+1.05);
  const showMention = index===0?ease(t,16.25,17.6):ease(t,start+(index===4?2.3:.7),start+(index===4?3.2:1.25));
  const attach = index===0?ease(t,17.15,18.8):showMention;
  const refer = index===0?ease(t,19.25,21.3):index===4?ease(t,50.9,52.8):ease(t,start+1.25,start+2.28);
  const routeGrid=index===0?grid:1;
  const arrival=point(record.x+mentionHalfWidth*routeGrid,record.y+25*(1-routeGrid));
  const departure=point(record.x-mentionHalfWidth*routeGrid,record.y-25*(1-routeGrid));
  const angle=Math.atan2((record.y-entity.y)*.61,Math.max(1,record.x-entity.x));
  const port=between(point(entity.x,entity.y+radius.y),
    point(entity.x+radius.x*Math.cos(angle),entity.y+radius.y*Math.sin(angle)),routeGrid);
  const toEntity:Curve=[departure,point(departure.x-40*routeGrid,departure.y-55*(1-routeGrid)),
    point(port.x+28*routeGrid,port.y+42*(1-routeGrid)),port];
  const pulse = traversal(t,index);
  const {block,lines}=mention.document;
  return <g opacity={opacity} data-association={mention.id} data-referent={mention.entity.id}>
    <rect x={doc.x} y={doc.y} width={width} height={145} rx={6} fill="#202b2f" stroke={ink.grey} strokeOpacity={.58} strokeWidth={2}/>
    <text x={doc.x+width-18} textAnchor="end" y={doc.y+31} fontFamily={type.mono} fontSize={22} fill={ink.grey} letterSpacing={1.5}>DOCUMENT {mention.document.id}</text>
    <CellSequence cells={block.cells} size={textSize}>{spans=>{
      const x = doc.x+20;
      const origin = spans.get(block.cells[0])!.left;
      const span = {left:x+spans.get(mention.segment.start)!.left-origin,right:x+spans.get(mention.segment.end)!.right-origin};
      const underlineY=doc.y+baseline+9;
      const target=point(span.left,underlineY);
      const toMention:Curve=[target,point(target.x-mix(92,20,routeGrid),target.y),
        point(arrival.x+26*routeGrid,arrival.y+82*(1-routeGrid)),arrival];
      return <>
        <Link curve={toMention} color={ink.entity} draw={attach} pulse={pulse.target}/>
        <Link curve={toEntity} color={ink.grammar} draw={refer} pulse={pulse.entity}/>
        <g opacity={pulse.text*.22 + (isPair?.15*hold(t,48.35,54.8,.55):0)}>
          <rect x={span.left-2} y={underlineY-49} width={span.right-span.left+4} height={51} rx={3} fill={ink.entity}/>
        </g>
        <RangeUnderline span={span} y={underlineY} draw={amount} color={ink.entity}/>
        <text data-document={mention.document.id} x={x} y={doc.y+baseline} fontFamily={type.serif} fontSize={textSize} fill={ink.cream}
          xmlSpace="preserve">{lines.map((line,i)=><tspan key={i} x={x} dy={i===0?0:44}>{line}{i<lines.length-1?' ':''}</tspan>)}</text>
      </>;
    }}</CellSequence>
    <MentionNode id={mention.id} center={record} opacity={showMention} light={pulse.record}/>
  </g>;
}

function Tableau({t}:{t:number}) {
  const pull = ease(t,24.1,31.8);
  const grid = ease(t,32.2,35.85);
  const comparison = ease(t,45.75,47.7)*(1-ease(t,55.15,57.1));
  const collapse=ease(t,66.65,68.45);
  const zoom=mix(1.48,1,pull)*(1-.38*collapse);
  const focus=between(point(582,610-101*ease(t,7.65,10.6)),point(540,540),pull);
  const napoleon=between(point(497,357),point(189,mix(520,370,comparison)),grid);
  const centers = {napoleon, augustus:point(189,662)};
  return <g opacity={ease(t,1.85,2.55)*(1-ease(t,67.35,68.55))}>
    <defs><clipPath id="graph-field"><rect x={72} y={148} width={936} height={749}/></clipPath></defs>
    <g clipPath="url(#graph-field)"><g transform={`translate(540 540) scale(${zoom}) translate(${-focus.x} ${-focus.y})`}>
      <Neighbourhood entity={napoleon} reveal={ease(t,24.6,30.5)*(1-grid)}/>
      {mentions.map((mention,i)=><Association key={mention.id} mention={mention} index={i} t={t}
        grid={grid} comparison={comparison} entity={centers[mention.entity.id]}/>)}
      <EntityNode entity={entities.napoleon} center={napoleon} opacity={ease(t,10.4,12.25)}
        light={hold(t,60.9,63.5,.45)}/>
      <EntityNode entity={entities.augustus} center={centers.augustus} opacity={hold(t,50.1,56.7,.85)} light={0}/>
    </g></g>
    <text x={76} y={213} fontFamily={type.serif} fontStyle="italic" fontSize={39} fill={ink.grey}
      opacity={ease(t,27,29)*(1-grid)}>Knowledge graph</text>
    <text x={76} y={227} fill={ink.cream} fontFamily={type.serif} fontSize={54}
      opacity={hold(t,2.05,9.9,.65)}>A name in a document</text>
    <text x={342} y={532} fill={ink.grey} fontFamily={type.serif} fontSize={37} fontStyle="italic"
      opacity={hold(t,17.15,24,.7)}>A recorded association</text>
  </g>;
}

export function WhereTextMeetsTheGraph() {
  const {fps}=useVideoConfig(), t=useCurrentFrame()/fps;
  return <>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
    <SeriesPlate number={episode.number} seriesAttribution productBranding={false}>
      {t<2.5 && <Bookend lead={episode.title} emphasis="From text to knowledge." leadSize={66} emphasisSize={63}
        volumeLabel="Volume II" spread={ease(t,0,1.8)} opacity={1-ease(t,1.75,2.4)}/>}
      {t>=1.85 && t<68.55 && <Tableau t={t}/>}
      <path d="M76 905H1004" stroke={ink.rule} strokeWidth={1.5} opacity={hold(t,2.3,68)}/>
      {scenes.slice(0,-1).map(s=><Caption key={s.id}
        text={s.id==='traversal'?['From text to knowledge.','From knowledge to text.']:s.caption}
        opacity={hold(t,s.start || 2.65,s.start+s.duration,.4)}/>)}
      {t>=67.7 && <Bookend lead="Text need not become a graph." emphasis="It can be connected to one."
        volumeLabel="Volume II" leadSize={61} emphasisSize={65} spread={1-ease(t,68,73)} opacity={ease(t,67.7,68.75)}/>}
    </SeriesPlate>
  </>;
}
