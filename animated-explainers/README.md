# Mutable Motion

Mutable Concepts is a series of code-authored films for Mutable OS. Episode 001 follows four annotations as they lift off one sentence and return as overlapping underlines. Episode 002 repeats one edit to show the difference between fixed positions and references to character Cells.

## Preview and render

Use the repository’s Node 22.12.0 and run these commands from the repository root.

```sh
cd animated-explainers
npm ci
npm run preview
```

Open the episode in the Studio sidebar, or use its direct route on the port printed by Studio. Press Space to play. Drag the playhead or press G and enter a frame number to inspect a cue. [Episode 001 on the default Studio port](http://localhost:3000/001-standoff-properties)

```sh
npm run typecheck
npm run render -- 001-standoff-properties renders/001-standoff-properties.mp4
```

The Episode 001 render command produces 1,050 frames of silent H.264 video at 1080 × 1080 and 30 fps. Append `--scale=0.5` for a 540-square proof. The first render downloads the matching headless browser. The CLI includes its encoder. Each episode uses this installation, and Mutable’s application build uses its own package manifest and lockfile.

## Producing another episode

Copy the episode directory, edit its metadata and storyboard, and register its scene as a composition in `index.tsx`. Its composition ID selects it in Studio and on the render command line.

| Location | Contents |
| --- | --- |
| `episodes/001-standoff-properties/` | Storyboard, delivery metadata and the scene’s range definitions, captions and timing |
| `episodes/002-when-text-changes/` | Storyboard, metadata, character model and the nine scenes |
| `shared/CellSequence.tsx` | Stable character objects, shaped opening text, Cell outlines and suffix index tables |
| `shared/TextRun.tsx` | A shaped SVG sentence and half-open character ranges measured after fonts load |
| `shared/AnnotationLayer.tsx` | A translucent plane, keyed range strokes and endpoint guides shared between the raised and flat poses |
| `shared/SeriesPlate.tsx` | Font readiness, series masthead, caption and engraved title/end card |
| `shared/motion.ts` | Frame-derived easing and caption holds |
| `theme/` and `assets/branding/` | Colour, typography and the series mark |
| `renders/` | Local videos and review frames, ignored by Git |

## Choice of tools

| Candidate | Fit for this series |
| --- | --- |
| Motion Canvas | TypeScript/JSX scene graphs, precise generator timing and a scrubbable editor suit vector diagrams. Its documented FFmpeg export runs from the editor. The Vite plugin declares Vite 4/5 support. The latest stable core package evaluated was 3.17.2 (December 2024). [Editor](https://motioncanvas.io/docs/) · [FFmpeg exporter](https://motioncanvas.io/docs/rendering/video/) |
| Remotion | Selected for its existing Studio, indexed compositions and frame-addressable CLI for H.264 and stills on macOS. React/SVG gives the preview and renderer the same shaped glyphs and vector geometry. The workspace pins the engine and CLI to the same release, 4.0.546 (November 2026). Its free and company licenses have different eligibility requirements. [Studio](https://www.remotion.dev/docs/cli/studio) · [Rendering](https://www.remotion.dev/docs/render) · [License](https://www.remotion.dev/license) |
| Standalone browser SVG | Provides the same typography and range measurements with few dependencies. A separate frame capture, encoding and preview workflow would be needed. |

The series uses the repository’s IBM Plex Mono WOFF2 and its accompanying SIL Open Font License. Source Serif 4 and IBM Plex Sans come from pinned Fontsource packages with their OFL licenses. All fonts are bundled locally. The layered mark is a vector interpretation of the supplied sheet and the wordmark is typeset. The existing repository artwork located during production represented Solid, Codex and individual Mutable applications.

## Episode 001 delivery

The local delivery includes the [master MP4](renders/001-standoff-properties.mp4), [eight-frame review sheet](renders/001-stages.png) and [full-size review frames](renders/001-stills/). A fresh checkout can regenerate the movie with the command above. To export a single full-resolution still directly from the composition, run the following command from this workspace.

```sh
npx remotion still index.tsx 001-standoff-properties renders/exploded.png --frame=660
```

The encoded master contains one H.264 video stream, 1,050 frames and a duration of 35.000 seconds. The review sheet was decoded from the MP4 and inspected at a 360-pixel frame width. On macOS, Studio was scrubbed from the exploded pose to the final underlines, back to separation and forward again. All four pairs of endpoints matched the corresponding shaped characters. The sentence retained the same baseline at all three poses. The [storyboard](episodes/001-standoff-properties/storyboard.md) records the editorial choices.

## Episode 002 delivery

From this workspace, use the same Studio and render commands. Choose `002-when-text-changes` in the sidebar. [Episode 002 on the default Studio port](http://localhost:3000/002-when-text-changes)

```sh
npm run preview
npm run render -- 002-when-text-changes renders/002-when-text-changes.mp4
```

The revised master runs for 60 seconds (1,800 frames at 1080 × 1080 and 30 fps). Start at 12 seconds for the stale numerical boundaries, 32 seconds for the same insertion with Cell references, 41 seconds for the reindexing sweep, or 47 seconds for the insertion inside “fox”. [Master MP4](renders/002-when-text-changes.mp4) · [Review sheet](renders/002-stages.png) · [Storyboard and concept notes](episodes/002-when-text-changes/storyboard.md)

The episode uses the Concept 001 fonts, palette, range strokes, captions, series plate and engraved end card. Both illustrated properties share their starting Cell. Their quotes, connectors and numerical readouts follow the episode’s character model.

## Episode 003 delivery

*Beyond the Hierarchy* follows one two-line poem from nested enclosures to crossing tracks, independent ontologies and two readings of “the sleeping sea”. Open `003-beyond-the-hierarchy` in Studio. The 75-second narrated master plays with English speech in Studio. The silent picture master, standalone narration and three signature stills are in `renders/`.

```sh
npm run render -- 003-beyond-the-hierarchy renders/003-beyond-the-hierarchy.mp4
```

[Narrated film](renders/003-beyond-the-hierarchy.mp4) · [Narration WAV](renders/003-narration.wav) · [Silent film](renders/003-beyond-the-hierarchy-silent.mp4) · [Signature stills](renders/003-stills/) · [Timed storyboard](episodes/003-beyond-the-hierarchy/storyboard.md) · [Editable scene manifest](episodes/003-beyond-the-hierarchy/scenes.json) · [Implementation and reproduction](episodes/003-beyond-the-hierarchy/implementation.md)

## Episode 004 delivery

*When characters disappear* follows one typographic annotation as text is deleted around it, inside it and at each boundary. Open `004-when-characters-disappear` in Studio. The 56-second composition includes its English narration.

```sh
npm run render -- 004-when-characters-disappear renders/004-when-characters-disappear.mp4 --audio-bitrate=192k
```

[Film](renders/004-when-characters-disappear.mp4) · [Review sheet](renders/004-stages.png) · [Storyboard and script](episodes/004-when-characters-disappear/storyboard.md) · [Implementation report](episodes/004-when-characters-disappear/implementation.md)

## Episode 005 delivery

*Beyond the contiguous range* follows the two parts of “pick up”, then a quotation that crosses a block boundary. Open `005-beyond-the-contiguous-range` in Studio. The 64-second composition includes its narration.

```sh
npm run render -- 005-beyond-the-contiguous-range renders/005-beyond-the-contiguous-range.mp4 --audio-bitrate=192k
```

[Narrated film](renders/005-beyond-the-contiguous-range.mp4) · [Review sheet](renders/005-stages.png) · [Storyboard and script](episodes/005-beyond-the-contiguous-range/storyboard.md) · [Production report](episodes/005-beyond-the-contiguous-range/implementation.md)

## Episode 006 delivery

*Where text meets the graph* opens Volume II — From Text to Knowledge. The same words, “The Emperor”, lead to Napoleon Bonaparte in one document and Augustus in another. Select `006-where-text-meets-the-graph` in Studio for the 75-second narrated composition.

```sh
npm run render -- 006-where-text-meets-the-graph renders/006-where-text-meets-the-graph.mp4 --audio-bitrate=192k
```

[Narrated film](renders/006-where-text-meets-the-graph.mp4) · [Stage sheet](renders/006-stages.png) · [Storyboard and script](episodes/006-where-text-meets-the-graph/storyboard.md) · [Production report](episodes/006-where-text-meets-the-graph/implementation.md)
