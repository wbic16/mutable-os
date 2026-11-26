# Finding things through words

Mutable OS / Concepts / 007 · Volume II — From Text to Knowledge  
80 seconds · 1080 × 1080 · 30 fps

Compare the picture at 22.8 seconds with the one at 45.5 seconds. The field contains the same description in both. James Bond’s stored name and designation yield no match. In the corpus, Document 04 contains those exact words and Mention 04 leads to Bond. At 70.1 seconds the return journey ends on that occurrence. [Narrated film](../../renders/007-finding-things-through-words.mp4) · [Stage sheet](../../renders/007-stages.png) · [Full-resolution screenshots](../../renders/007-stills/)

## Editable source

The [storyboard and script](storyboard.md) pairs each utterance with its picture. The [manifest](scenes.json) controls scene and voice timing. The [metadata](metadata.json), [corpus and search functions](corpus.ts), [passage drawing](passages.tsx) and [composition](scene.tsx) are in the same episode directory.

Six original passages contain eight individually identified mentions. Each mention references a document, a segment with inclusive boundary Cells, and an explicitly supplied entity. The exact-match predicate ignores case and operates on the complete stored property or complete annotated text. A mention search groups its hits by entity identity. Each group retains the matching records, their ranges and their source documents. The registered properties for Bond are “James Bond” and “007”.

The two occurrences of “Bond” produce one entity with two sources. The two occurrences of “He” lead to Bond and Felix Leiter respectively. The return demonstration uses the record retained by the earlier dinner-jacket search. The layout is composed for these six passages. Each illustrated mention fits on one display line, and the two-line passages retain their complete sentence text.

## Search choreography

The field, typography and first travelling pulse have the same position and pacing in the two comparison searches. One path reaches the entity’s stored properties. The other scans the annotated passages, pauses on the matching words, then follows the existing two-leg connection. Teal underlines and pins persist throughout. The warm fill appears only on a match. A returning pulse traces the same curves in reverse and ends on the original boundaries.

The film reuses Concept 006’s mention rectangles, entity ovals and lights on curved connections. Its document frame is now a shared component used by both episodes. The typesetter measures ranges from the actual shaped SVG text after the series fonts load. Document movement and scaling use those same local measurements. The opening uses the series typography, the episode number and the engraved title card. The only audio is the series narrator.

The cut runs to the upper end of the requested duration. It adds a short “Bond” query before “He” so viewers can see two matching mentions grouped under one person as well as two separate entity results. This uses occurrences already supplied in Documents 01 and 05.

## Preview and record

From the repository root or the unpacked delivery, use Node 22.12.0 and start Studio.

```sh
cd animated-explainers
npm ci
npm run preview
```

Select `007-finding-things-through-words` on the port Studio prints. Space plays the narrated film. Press G and enter frame 684 for the unsuccessful property search, 1365 for the successful mention search, 1808 for the two pronoun referents, or 2103 for the return to Document 04.

```sh
npm run typecheck
npm run render -- 007-finding-things-through-words renders/007-finding-things-through-words.mp4 --audio-bitrate=192k
```

For a worked variation, edit the dinner-jacket description in `corpus.ts`. The query, its passage and the annotated range share that string. Keep its wording out of the stored properties to preserve the comparison, check the line width, then update the spoken example and storyboard.

## Narration

The film uses the existing offline Kokoro v1.0 generator with the British English Emma voice at its native rate. Fourteen utterances are placed separately, including the opening line and its pause. The generator checks each utterance’s available window and normalizes the mix before encoding. Studio and the recorder use the same included audio asset. The [standalone 24-bit PCM WAV](../../renders/007-narration.wav) contains the soundtrack decoded from the delivery MP4.

The bundled audio suffices for rendering. To generate revised speech, use the [model and Python setup](../003-beyond-the-hierarchy/implementation.md) and run the following command from the animation workspace. Supply `--ffmpeg /path/to/ffmpeg` if necessary.

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/007-finding-things-through-words.m4a --episode-dir episodes/007-finding-things-through-words
```

## Verification

The final MP4 decoded through all 2,400 H.264 frames. Its default audio is 48 kHz AAC. The decoded mix measured −16.23 LUFS integrated and −4.95 dBTP. All fourteen cue envelopes aligned with the timed source. Local speech recognition recovered the script in all eight scene windows. The final spoken word ends at about 76.4 seconds.

Eighteen frames from the finished recording were inspected at a 360-pixel viewing width, including the corpus scan, record handoff, grouped results and reverse traversal. Studio checks measured both pins against their glyphs, checked text bounds and compared forward and backward seeks. The same Bond node and Mention 04 persisted through the compared views. Model checks covered mixed-case queries, whole-occurrence matching, grouping and the retained document and range. TypeScript passed and all seven Studio compositions opened.
