import React from 'react';
import {Html5Audio,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Bookend,Caption,SeriesPlate} from '../../shared/SeriesPlate';
import {ease,hold} from '../../shared/motion';
import {ink} from '../../theme';
import {Geometry,Ontologies} from './geometry';
import {CorpusScene} from './corpus-scene';
import episode from './metadata.json';
import scenes from './scenes.json';

export function WhenAnnotationsBecomeQueries() {
  const {fps}=useVideoConfig(),t=useCurrentFrame()/fps;
  return <>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
    <SeriesPlate number={episode.number} seriesAttribution productBranding={false}>
      {t<2.8 && <Bookend lead={episode.title} emphasis="The geometry of meaning." leadSize={57} emphasisSize={63}
        volumeLabel="Volume II" spread={ease(t,0,1.9)} opacity={1-ease(t,1.95,2.7)}/>}
      {t>=2 && t<35.85 && <Geometry t={t}/>}
      {t>=34.75 && t<83.45 && <CorpusScene t={t}/>}
      {t>=82.8 && t<94.2 && <Ontologies t={t}/>}
      <path d="M76 904H1004" stroke={ink.rule} strokeWidth={1.5} opacity={hold(t,2.6,94,.5)}/>
      {scenes.slice(0,-1).filter(s=>s.caption).map(s=><Caption key={s.id}
        text={s.id==='relations'?['Spatial relationships become','computational tests.']:s.id==='results'?['Graph traversal. Textual geometry.','Graph traversal.']:s.id==='containment' && t>=65.8?'Find place mentions within it.':s.caption}
        opacity={hold(t,s.start || 2.8,s.start+s.duration,.4)}/>)}
      {t>=93.65 && <Bookend lead="The geometry of annotations" emphasis="becomes a language of inquiry."
        leadSize={65} emphasisSize={62} volumeLabel="Volume II" spread={1-ease(t,94,98.3)} opacity={ease(t,93.65,94.6)}/>}
    </SeriesPlate>
  </>;
}
