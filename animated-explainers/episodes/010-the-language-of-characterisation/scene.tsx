import React from 'react';
import {Html5Audio,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Bookend,Caption,SeriesPlate} from '../../shared/SeriesPlate';
import {ease,hold} from '../../shared/motion';
import {ink,type} from '../../theme';
import {Inquiry} from './inquiry';
import {EntityNode,point} from '../006-where-text-meets-the-graph/graph';
import {ConceptNode,TraitNode} from './artwork';
import {anchor,entities,usage} from './model';
import episode from './metadata.json';
import scenes from './scenes.json';

function ClosingFigure({opacity}:{opacity:number}) {
  return <g transform="translate(540 390) scale(.79)" opacity={opacity}>
    <path d="M-133 0H-217 M133 0H217 M0 49V109" fill="none" stroke={ink.narrative} strokeWidth={3}/>
    <path d="M0 -49V-99" fill="none" stroke={ink.entity} strokeWidth={2.5} strokeDasharray="6 6"/>
    <text x={0} y={-158} textAnchor="middle" fontFamily={type.sans} fontSize={26} fill={ink.grey}>Florentine Diary · Illustrative English rendering</text>
    <text x={0} y={-109} textAnchor="middle" fontFamily={type.serif} fontStyle="italic" fontSize={39} fill={ink.entity}>“{usage(anchor)}”</text>
    <TraitNode record={anchor}/>
    <EntityNode center={point(-330,0)} entity={entities[anchor.subject]} opacity={1} light={0} compact={1}/>
    <EntityNode center={point(330,0)} entity={entities[anchor.observer]} opacity={1} light={0} compact={1}/>
    <g transform="translate(0 157)"><ConceptNode id={anchor.trait}/></g>
  </g>;
}

export function TheLanguageOfCharacterisation() {
  const t=useCurrentFrame()/useVideoConfig().fps, volume='Volume '+episode.volume;
  return <>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
    <SeriesPlate number={episode.number} seriesAttribution productBranding={false}>
      {t<2.7 && <Bookend lead={episode.title} emphasis={episode.subtitle} leadSize={57} emphasisSize={43}
        volumeLabel={volume} opacity={1-ease(t,2,2.6)} spread={ease(t,0,1.8)}/>}
      {t>=2 && t<=92.65 && <Inquiry t={t}/>}
      <path d="M76 904H1004" stroke={ink.rule} strokeWidth={1.5} opacity={hold(t,2.6,92.3,.5)}/>
      {scenes.filter(s=>s.caption).map(s=><Caption key={s.id} text={s.caption} opacity={hold(t,s.start||2.6,s.start+s.duration,.5)}/>)}
      {t>=91.9 && <g opacity={ease(t,91.9,92.65)}>
        <Bookend lead="" emphasis="" volumeLabel={volume} spread={1-ease(t,92,98)} folioOpacity={ease(t,94.55,95.55)} opacity={1}/>
        {t<95.55 && <ClosingFigure opacity={1-ease(t,94.55,95.55)}/>}
        <g textAnchor="middle" fontFamily={type.serif}>
          <text x={540} y={635} fill={ink.cream} fontSize={54} opacity={ease(t,92.2,92.95)}>We can trace the history of things.</text>
          <text x={540} y={727} fill={ink.cream} fontSize={54} opacity={ease(t,95.2,95.95)}>We can trace the history of ideas.</text>
          <text x={540} y={825} fill={ink.entity} fontStyle="italic" fontSize={45} opacity={ease(t,98.5,99.35)}>And we can trace the history of their meeting.</text>
        </g>
      </g>}
    </SeriesPlate>
  </>;
}
