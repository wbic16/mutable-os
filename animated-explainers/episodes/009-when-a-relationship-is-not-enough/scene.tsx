import React from 'react';
import {Html5Audio,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Bookend,Caption,SeriesPlate} from '../../shared/SeriesPlate';
import {ease,hold} from '../../shared/motion';
import {ink,type} from '../../theme';
import {GraphScene} from './graph-scene';
import {ClaimNode} from './statement';
import {claims,entities} from './model';
import {EntityNode,point} from '../006-where-text-meets-the-graph/graph';
import episode from './metadata.json';
import scenes from './scenes.json';

// A last look at Claim A dissolves into the series engraving.
function ClosingMark({opacity}:{opacity:number}) {
  const locations=[point(-280,0),point(280,-111),point(280,0),point(280,111)];
  return <g transform="translate(540 406) scale(.83)" opacity={opacity}>
    {claims[0].participants.map(({entity,role},i)=>{
      const left=role==='Sender',p=locations[i];
      return <g key={role}>
        <line x1={left?-117:117} y1={left?0:(i-2)*25} x2={p.x+(left?113:-113)} y2={p.y}
          stroke={ink.narrative} strokeWidth={2.8}/>
        <EntityNode entity={entities[entity]} center={p} opacity={1} light={0} compact={1}/>
      </g>;
    })}
    <ClaimNode claim={claims[0]} center={point(0,0)} opacity={1}/>
  </g>;
}

export function WhenARelationshipIsNotEnough() {
  const t=useCurrentFrame()/useVideoConfig().fps;
  const volume='Volume '+episode.volume;
  return <>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
    <SeriesPlate number={episode.number} seriesAttribution productBranding={false}>
      {t<2.8 && <Bookend lead={episode.title} emphasis={episode.subtitle} leadSize={56} emphasisSize={43}
        volumeLabel={volume} opacity={1-ease(t,2.05,2.67)} spread={ease(t,0,1.8)}/>}
      {t>=2.15 && t<83.4 && <GraphScene t={t}/>}
      <path d="M76 904H1004" stroke={ink.rule} strokeWidth={1.5} opacity={hold(t,2.6,83.2,.45)}/>
      {scenes.slice(0,-1).map(s=><Caption key={s.id} text={s.id==='ambiguity'?['The relationships survive.','Their grouping may not.']:s.caption}
        opacity={hold(t,s.start||2.7,s.start+s.duration,.42)}/>)}
      {t>=82.95 && <>
        <Bookend lead="A statement is more than" emphasis="the sum of its relationships." leadSize={67} emphasisSize={68}
          folioOpacity={ease(t,84.8,85.7)} volumeLabel={volume} opacity={ease(t,82.95,83.55)} spread={1-ease(t,83,87)}/>
        {t<85.7 && <ClosingMark opacity={hold(t,82.95,85.7,.8)}/>}
        <text x={540} y={864} textAnchor="middle" fontSize={42} fontFamily={type.serif} fill={ink.cream}
          opacity={ease(t,87.2,87.8)}>Meaning is not always binary.</text>
      </>}
    </SeriesPlate>
  </>;
}
