import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {StandoffProperties} from './episodes/001-standoff-properties/scene';
import episode from './episodes/001-standoff-properties/metadata.json';
import './theme/fonts.css';

function MutableConcepts() {
  return <Composition id={episode.id} component={StandoffProperties}
    width={episode.width} height={episode.height} fps={episode.fps}
    durationInFrames={episode.durationSeconds * episode.fps} />;
}

registerRoot(MutableConcepts);
