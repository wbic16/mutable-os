# Beyond the contiguous range

Concepts · Volume I — The Nature of Text · 005  
64 seconds · 1080 × 1080 · 30 fps

At 17.4 seconds, trace the two branches from A to “picked” and “up”. The intervening words “the book” sit outside both ranges. At 45.75 seconds, trace the branches from Q instead. Every word of the quotation still belongs to Q, including the first word of the second block. The same drawing convention lets a reader distinguish a linguistic gap from a structural division. [Narrated film](../../renders/005-beyond-the-contiguous-range.mp4) · [Stage sheet](../../renders/005-stages.png) · [Full-size frames](../../renders/005-stills/)

## Source and geometry

The [storyboard and full script](storyboard.md), [timed speech and captions](scenes.json), [delivery metadata](metadata.json), [model](model.ts) and [composition](scene.tsx) live in this directory. The existing Remotion Studio and renderer use the same composition, TypeScript installation, bundled fonts and embedded narration. The episode reuses the neutral series plate, engraved bookends, captions, frame easing, shaped Cell measurements, folded-corner endpoint Cells and range underlines.

The model gives each example one persistent annotation identity. A snapshot holds an ordered list of blocks and a list of segments for that identity. Each segment references its containing block and its inclusive first and last Cell. For the verb, both word orders reuse the same Cells. The particle follows an arc between its positions in the two measured text runs. The continuous underline withdraws before the words move. The two new underlines end exactly at the annotated words.

For the quotation, splitting partitions the ordered Cells at the inter-sentence space. The model sets that space aside, remembers whether the annotation covered it and finds the maximal covered runs in each block. The period ending “garden.” and the capital A beginning “And” become the new inner endpoints. The two outer quotation marks keep their original Cell references. On merge, the model restores the original space and recomputes the runs. A genuine gap still yields separate segments even when both are in one block.

The episode adds a branching connector and a restrained block outline. Each displayed line intersects the segment with its shaped glyphs. A side bracket joins wrapped extents, and folded corners identify logical endpoints. The lower lines, pins and outline travel together while the Q label stays fixed. The film uses four fixed display lines at the square delivery size. The worked split takes one interior sentence space in one block. These choices bound the model to the example.

The opening sentence uses the alternate word order “She picked up the book.” so a viewer can watch the particle move into its specified position. In the quotation, the upper edge of each block carries a structural label. An amber rule anticipates the split, and a brief reading-order trace crosses the resulting division. The closing sentences have separate entrances for a deliberate pause. All eight scenes retain their requested durations.

## Preview and record

With Node 22.12.0, start at the repository root or the root of the unpacked delivery.

```sh
cd animated-explainers
npm ci
npm run preview
```

Open `005-beyond-the-contiguous-range` in the Studio sidebar on the port it prints. Space plays the film with its narration. Press G and enter frame 522 for the phrasal verb, 1053 for the split in motion, 1373 for the two-block reading, or 1662 for the rejoined quotation. All five episodes have independent composition entries.

```sh
npm run typecheck
npm run render -- 005-beyond-the-contiguous-range renders/005-beyond-the-contiguous-range.mp4 --audio-bitrate=192k
```

For a second worked example, edit the word groups or quoted lines in the model and choose the new separator Cell. Update the matching picture cues, narration and storyboard. Check the outer pins at both ends of the transformation and verify that an unannotated gap still splits the target.

## Narration

The twelve cues use local Kokoro v1.0, British English Emma (`bf_emma`), at speed 1.0. Each utterance was synthesized separately, aligned to its manifest entrance and checked against the next cue. The generator normalizes the mix and encodes the 48 kHz AAC asset used by Studio and the recorder. The standalone 24-bit PCM WAV is the timed audio decoded from the release MP4. [Narration WAV](../../renders/005-narration.wav) · [Generator and model setup](../003-beyond-the-hierarchy/implementation.md)

The included audio is sufficient to render the film. To synthesize an edited script, use the Python environment and model files described in the linked setup. Run this command from the animation workspace with FFmpeg on the path, or append `--ffmpeg /path/to/ffmpeg`.

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/005-beyond-the-contiguous-range.m4a --episode-dir episodes/005-beyond-the-contiguous-range
```

## Verification

The final MP4 decoded through all 1,920 frames. Its default audio is 48 kHz AAC. The decoded mix measured −16.26 LUFS integrated and −4.92 dBTP. All twelve cue envelopes matched the timed narration asset. Speech recognition on the audio extracted from the MP4 recovered the spoken script across the eight scene windows, including both closing sentences. The last word finishes at about 61.6 seconds, leaving the end card on screen.

Eighteen frames decoded from the recording were inspected at 360 pixels wide, including the moving particle, the opening fork, the split in motion and the returning inner pins. Studio seeks in both directions reproduced the checked boundary positions. Q retained the same on-screen element through the split and merge, with two, four and finally two endpoints. TypeScript passed, all five compositions loaded, and the model preserved Cell identity and target membership across 25 split-and-rejoin trials, including the discontinuous verb.
