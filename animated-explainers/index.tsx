import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {StandoffProperties} from './episodes/001-standoff-properties/scene';
import episode from './episodes/001-standoff-properties/metadata.json';
import {WhenTextChanges} from './episodes/002-when-text-changes/scene';
import changes from './episodes/002-when-text-changes/metadata.json';
import {BeyondTheHierarchy} from './episodes/003-beyond-the-hierarchy/scene';
import hierarchy from './episodes/003-beyond-the-hierarchy/metadata.json';
import {WhenCharactersDisappear} from './episodes/004-when-characters-disappear/scene';
import deletion from './episodes/004-when-characters-disappear/metadata.json';
import {BeyondTheContiguousRange} from './episodes/005-beyond-the-contiguous-range/scene';
import segments from './episodes/005-beyond-the-contiguous-range/metadata.json';
import {WhereTextMeetsTheGraph} from './episodes/006-where-text-meets-the-graph/scene';
import graph from './episodes/006-where-text-meets-the-graph/metadata.json';
import './theme/fonts.css';

function MutableConcepts() {
  return <>
    <Composition id={episode.id} component={StandoffProperties}
      width={episode.width} height={episode.height} fps={episode.fps}
      durationInFrames={episode.durationSeconds * episode.fps} />
    <Composition id={changes.id} component={WhenTextChanges}
      width={changes.width} height={changes.height} fps={changes.fps}
      durationInFrames={changes.durationSeconds * changes.fps} />
    <Composition id={hierarchy.id} component={BeyondTheHierarchy}
      width={hierarchy.width} height={hierarchy.height} fps={hierarchy.fps}
      durationInFrames={hierarchy.durationSeconds * hierarchy.fps} />
    <Composition id={deletion.id} component={WhenCharactersDisappear}
      width={deletion.width} height={deletion.height} fps={deletion.fps}
      durationInFrames={deletion.durationSeconds * deletion.fps} />
    <Composition id={segments.id} component={BeyondTheContiguousRange}
      width={segments.width} height={segments.height} fps={segments.fps}
      durationInFrames={segments.durationSeconds * segments.fps} />
    <Composition id={graph.id} component={WhereTextMeetsTheGraph}
      width={graph.width} height={graph.height} fps={graph.fps}
      durationInFrames={graph.durationSeconds * graph.fps} />
  </>;
}

registerRoot(MutableConcepts);
