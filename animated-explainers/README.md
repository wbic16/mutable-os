# Mutable Motion

Mutable Concepts is a series of silent, code-authored films for Mutable OS. Episode 001 follows four annotations as they lift off one sentence and return as overlapping underlines.

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

The render command produces 1,050 frames of silent H.264 video at 1080 × 1080 and 30 fps. Append `--scale=0.5` for a 540-square proof. The first render downloads the matching headless browser. The CLI includes its encoder. Each episode uses this installation, and Mutable’s application build uses its own package manifest and lockfile.

## Producing another episode

Copy the episode directory, edit its metadata and storyboard, and register its scene as a composition in `index.tsx`. Its composition ID selects it in Studio and on the render command line.

| Location | Contents |
| --- | --- |
| `episodes/001-standoff-properties/` | Storyboard, delivery metadata and the scene’s range definitions, captions and timing |
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
