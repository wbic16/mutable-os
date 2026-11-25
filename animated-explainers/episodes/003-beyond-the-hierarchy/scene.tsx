import React from 'react';
import {Html5Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Bookend, Caption, SeriesPlate} from '../../shared/SeriesPlate';
import {CellSequence} from '../../shared/CellSequence';
import {ease, hold} from '../../shared/motion';
import {ink, type} from '../../theme';
import {cells, layout, size, Verse} from './passage';
import {Hierarchy, Tracks, TwoReadings} from './structures';
import {Interpretations, Systems} from './systems';
import scenes from './scenes.json';
import episode from './metadata.json';

const starts = Object.fromEntries(scenes.map(s => [s.id, s.start]));
const closing = scenes[scenes.length - 1];

function Closing({local}: {local: number}) {
  const enter = ease(local, -.1, .65);
  return <g opacity={enter}>
    <Bookend lead="" emphasis="" spread={ease(local, 0, 1.65)} opacity={1} />
    {closing.captions.map(({at, text}, i) =>
      <text key={at} x="540" y={[580, 652, 724, 842, 980][i]} textAnchor="middle"
        fontFamily={i === 4 ? type.mono : type.serif} fontSize={[57,57,57,70,25][i]}
        fontStyle={i === 3 ? 'italic' : 'normal'} fill={i >= 3 ? ink.entity : ink.cream}
        opacity={ease(local, at, at + .45)}>{text}</text>)}
  </g>;
}

function Picture() {
  const time = useCurrentFrame() / useVideoConfig().fps;
  const scene = scenes.find(s => time < s.start+s.duration) ?? closing;
  const local = time - scene.start;
  const collision = time - starts['crossed-boundaries'];
  const fold = time - starts['independent-tracks'];
  const intro = time - starts.ontologies;
  const readers = time - starts.interpretations;
  const recap = time - starts.synthesis;
  const flat = ease(collision, 0, 1.4) * (1-ease(intro, -.1, 1.15));
  const focus = ease(readers, 0, .7) * (1-ease(recap, -.15, .65));
  const end = time - closing.start;
  return <SeriesPlate number={episode.number}>
    {end < .1 && <g opacity={1-ease(end, -.4, .1)}>
      <text x="76" y="245" fill={ink.cream} fontFamily={type.serif} fontSize="66"
        opacity={hold(local, -.1, scene.duration, .28)}>{scene.heading}</text>
      <CellSequence cells={cells} size={size}>{measured => {
        const page = layout(measured, flat, ease(intro, 0, 1.15));
        return <>
          {time < 6 && <Hierarchy page={page} time={time}/>}
          {time >= 6 && collision < .4 && <TwoReadings page={page} time={time}/>}
          {collision >= .75 && intro < .48 && <Tracks page={page} collision={ease(collision, .75, 1.55) * (1-ease(intro, -.22, .48))}
            foldTime={fold} arrangementTime={time - starts.arrangements}/>}
          {intro >= 0 && <Systems page={page} sinceIntro={intro} sinceArrival={time - starts['new-ontology']}
            opacity={1-ease(readers, 0, .5) + ease(recap, .25, .8)} synthesis={ease(recap, 0, .25)}/>}
          {readers >= 0 && recap < .65 && <Interpretations page={page} local={readers} opacity={ease(readers, .3, .75) * (1-ease(recap, -.15, .28))}/>}
          <g opacity={ease(time, -.1, .75)}><Verse page={page} focus={focus}/></g>
        </>;
      }}</CellSequence>
      <path d="M76 895H1004" stroke={ink.rule} strokeWidth="1.5"/>
      {scene !== closing && scene.captions.map(({at, text}, i) => {
        // Clear the topology name before the next pair of endpoints starts moving.
        const until = scene.id === 'arrangements' && i < 3
          ? (i + 1) * 2.25 : scene.captions[i+1]?.at ?? scene.duration;
        return <Caption key={at} text={text} opacity={hold(local, at, until, .23)} />;
      })}
    </g>}
    {end >= -.1 && <Closing local={end}/>}
  </SeriesPlate>;
}

export function BeyondTheHierarchy() {
  return <>
    <Picture />
    <Html5Audio src={staticFile('003-beyond-the-hierarchy.m4a')} />
  </>;
}
