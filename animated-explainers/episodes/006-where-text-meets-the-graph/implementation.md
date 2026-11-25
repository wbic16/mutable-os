# Where text meets the graph

Mutable OS / Concepts / 006 · Volume II — From Text to Knowledge  
75 seconds · 1080 × 1080 · 30 fps

At 44.7 seconds, four passages lead through four mention records to Napoleon Bonaparte. At 53.8 seconds, the passages about the officers and Rome use exactly the same words, “The Emperor”. Following their respective records leads to two different people. [Narrated film](../../renders/006-where-text-meets-the-graph.mp4) · [Stage sheet](../../renders/006-stages.png) · [Full-resolution stills](../../renders/006-stills/)

## Source and visual decisions

The [timed storyboard and script](storyboard.md), [cue manifest](scenes.json), [metadata](metadata.json), [corpus](corpus.ts), [drawing primitives](graph.tsx) and [composition](scene.tsx) live together in this episode directory. The film uses the existing Remotion registry, recorder, font gate, engraved bookends, captions, measured character sequences, range pins, palette and easing. The restrained document outlines follow the block design from Concept 005.

Each illustrative document has its own block and ordered Cells. The model uses the preceding episode’s block and inclusive segment types. Each numbered mention explicitly references a segment and one of two persistent entity objects. Changing a record’s referent changes its graph destination independently of the words on the page. The endpoint pins follow the measured characters. Teal connects a range to a rectangular mention record. Amber connects the record to a named oval.

The camera first tilts away from the original sentence to make room for the person. The mention appears between them and the two links draw in succession. A continuous pullback reveals six subdued neighbours around the same entity. The original document, mention and entity move into the four-document layout. For the comparison, the two “Emperor” contexts stay in focus while the other branches recede. During traversal, a light follows the exact cubic paths already on screen, pauses at a mention, and emerges on the other side. The reverse journey reaches the four passages associated with Napoleon.

The new graph primitives cover mention and entity shapes, a drawable edge and a light that moves along it. The layout is composed for these five passages and the square frame. The unlabelled neighbours indicate a wider network without making historical claims. This is a fixed, explicitly resolved corpus with one segment per mention.

## Attribution and timing

The workspace’s [editorial instructions](../../AGENTS.md) now specify the discreet `Mutable OS / Concepts / NNN` header for future films. Concept 006 adds it to the shared series plate and identifies Volume II on the bookends. The explanatory captions and voice use product-independent language. Earlier episodes retain their original attribution settings.

The cut uses the upper end of the requested duration to accommodate natural speech and both directions of traversal. It uses the five required documents. The optional pronoun example is omitted so the two “Emperor” passages can be held side by side in the viewer’s attention.

## Preview, render and adapt

From the repository or the unpacked ZIP, use Node 22.12.0 and start Studio.

```sh
cd animated-explainers
npm ci
npm run preview
```

Open `006-where-text-meets-the-graph` on the port Studio displays. Space plays the narrated film. Press G and enter frame 951 for the wide graph, 1341 for the many-to-one view or 1614 for the two referents. To record the complete film, run these commands from the same directory.

```sh
npm run typecheck
npm run render -- 006-where-text-meets-the-graph renders/006-where-text-meets-the-graph.mp4 --audio-bitrate=192k
```

To adapt the example, edit a document’s text, select its occurrence and supply the intended entity in `corpus.ts`. Inspect the target pin positions and both legs of its connection. Align the narration and captions in `scenes.json` with the new reading. Long passages may require new line breaks or a new layout.

## Narration

The approved script was produced locally with Kokoro v1.0 and the established British English Emma voice at speed 1.0. Eleven separately timed utterances span the eight scenes. The generator checks each utterance against its available window and normalizes the mix before encoding. Both the Studio preview and the recording use the included AAC asset. The [standalone 24-bit WAV](../../renders/006-narration.wav) contains the 75-second soundtrack decoded from the finished MP4.

To regenerate speech after an edit, use the Python environment, model weights and FFmpeg setup in the [narration workflow](../003-beyond-the-hierarchy/implementation.md). Run the following from the animation workspace. An explicit FFmpeg executable can be supplied with `--ffmpeg`.

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/006-where-text-meets-the-graph.m4a --episode-dir episodes/006-where-text-meets-the-graph
```

## Verification

The delivery decoded through 2,250 H.264 frames. The 48 kHz AAC mix measured −16.20 LUFS integrated and −4.94 dBTP. All eleven cue envelopes aligned with the source track, and local speech recognition recovered the approved wording from the encoded audio in all eight scenes. The final word ends at about 72.5 seconds, leaving the closing statement visible.

Eighteen decoded frames were reviewed at 360 pixels wide across the camera move, four-document layout, comparison, traversal and close. Studio checks followed the original document, record and person through forward and backward seeks. The target pins aligned with the actual glyphs, every sentence fit its container, and all five records selected the expected person. TypeScript passed. All six Studio compositions opened with their intended headers.
