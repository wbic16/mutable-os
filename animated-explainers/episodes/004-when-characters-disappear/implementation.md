# When characters disappear · production report

Concepts · Volume I — The Nature of Text · 004 · 56 seconds

The [narrated film](../../renders/004-when-characters-disappear.mp4) follows one typographic annotation. At 26.85 seconds its start connector is travelling between two different **b** Cells. At 28.65 seconds it has reached the second **b**, still at index 20. By 31.6 seconds that same Cell has slid to index 9. Annotation A and its end connector stay in view throughout.

## Source and picture

The [storyboard and full voice script](storyboard.md), [timed scene manifest](scenes.json), [metadata](metadata.json), [worked example](model.ts) and [composition](scene.tsx) live together in this episode directory. The composition uses the existing font gate, measured text run, folded-corner Cells, range strokes, captions, frame easing and engraved cards. Its registry entry supplies the same square 1080-pixel format and 30 fps recording configuration as the earlier films.

The new shared [deletion operation](../../shared/deletion.ts) takes an ordered sequence, a range and the Cells selected for deletion. It preserves the sequence order and surviving Cell objects. When a boundary is lost, it finds the first or last survivor in the old inclusive range. The range snapshot carries the same annotation object. Removing the last target produces a null range. The before and after snapshots supply the diagram with the two sets of coordinates needed for a seekable transfer and contraction.

The nine scenes follow the brief’s timings. The detailed view crops to the affected characters while the complete sentence stays visible above. For the one-character limit, two successive deletions reduce “bright” to “ght” and then “g”. Two pins land at separate points on the same container. Preserving the adjacent spaces after the final deletion makes it possible to see which Cells were outside the range. The relative ordering of transfer, fade and slide is teaching choreography.

[Review sheet](../../renders/004-stages.png) · [Full-resolution stills](../../renders/004-stills/) · [Start transfer](../../renders/004-stills/04-start-transfer.png) · [Convergence](../../renders/004-stills/07-single-cell.png) · [Loss of target](../../renders/004-stills/08-no-target.png)

## Preview, record and adapt

From the repository root, run the following commands with Node 22.12.0.

```sh
cd animated-explainers
npm ci
npm run preview
```

Choose `004-when-characters-disappear` in Studio. Space plays the film. G followed by frame 806, 1364 or 1499 inspects the start transfer, convergence or empty target. The bundled narration plays in preview and recording.

```sh
npm run typecheck
npm run render -- 004-when-characters-disappear renders/004-when-characters-disappear.mp4 --audio-bitrate=192k
```

To adapt an example, change a quoted deletion in `model.ts`. The range and its endpoints follow the surviving Cells. Keep the corresponding headings, selection cues, voice and storyboard aligned with the new example.

The approved nine spoken lines were synthesized directly on the production Mac with Kokoro v1.0, the British English Emma voice and speed 1.0. The established generator now accepts an episode directory and retains its Concept 003 default. Each cue has its own entrance and a checked window for the entire utterance. The final-deletion cue starts 0.15 seconds into its scene to leave room for the last word. The AAC mix is supplied with the source. The [standalone WAV](../../renders/004-narration.wav) is decoded from the finished MP4.

To regenerate speech after a script edit, use the Python environment, model files and FFmpeg configuration documented for [Concept 003](../003-beyond-the-hierarchy/implementation.md). From the animation workspace, run:

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/004-when-characters-disappear.m4a --episode-dir episodes/004-when-characters-disappear
```

The teaching-by-example workflow pairs each editable cue with an observable outcome. Here that outcome can be checked by following a specific Cell and comparing its connector before, during and after a deletion.

## Editorial direction and verification

The [workspace instructions](../../AGENTS.md) now set the editorial direction for future concept films. The series plate can suppress product branding in both the masthead and the shared bookend. Concept 004 uses the neutral treatment with the abstract mark, episode number, volume and discreet website credit. The legacy setting remains the default for existing compositions.

The model was checked against all 741 possible contiguous deletions in the 38-character sentence, including selections wholly after the range. Studio checks covered the unchanged annotation element, a stationary opposite connector during each transfer, both ports on index 9 at convergence, and the disappearance of the annotation element after the last deletion. Forward and backward seeks reproduced the checked states. TypeScript passed and the Studio registry loaded all four compositions.

The MP4 decoded through all 1,680 frames. It contains H.264 picture and 48 kHz AAC audio. The decoded mix measured −16.28 LUFS integrated with a true peak of −4.96 dBTP. Local speech recognition recovered the approved wording in all nine scene windows. Representative frames from the encoded film were inspected at a 360-pixel viewing width, including the two handoffs, single Cell and end card. The model is deliberately limited to one ordinary contiguous, non-empty range. It makes no judgement about whether the edited sentence reads well.
