# When annotations become queries

Mutable OS / Concepts / 008 · Volume II — From Text to Knowledge  
100 seconds · 1080 × 1080 · 30 fps

The research question returns **Paris and Vienna**. In Document 04 the person mention reads “The Emperor”. Its reference to Napoleon Bonaparte makes it a candidate, and its position inside the same speech as Vienna makes the passage qualify. Document 05 provides the counterexample at 1:02. Napoleon occurs before the quotation that contains Brussels. [Narrated film](../../renders/008-when-annotations-become-queries.mp4) · [Stage sheet](../../renders/008-stages.png) · [Full-size frames](../../renders/008-stills/)

## Source and picture

The [storyboard, corpus and full script](storyboard.md), [timed scene manifest](scenes.json), [metadata](metadata.json), [data and predicates](model.ts), [interval animation](geometry.tsx), [corpus animation](corpus-scene.tsx) and [composition](scene.tsx) live in this episode directory.

The opening borrows Concept 003’s independent colour tracks. Shared text measurements put the pins at the edges of the shaped characters. The same strokes lift away from the sentence, retain their extents and acquire an axis. For the abstract exercise the ranges move to three configurations. A translucent band spans exactly their common extent. At adjacency only the shared boundary is marked. The record labels then connect to the ranges, and the containment badge reappears above the corpus during evaluation.

The production reuses the series plate, engraved bookends, captions, character measurement, range strokes and document frames. Concept 006’s mention cards, entity ovals and cubic traversal paths carry the query from Napoleon to his mentions and from the qualifying place mentions back to their entities. The returning lights use the same paths back to the sources, as in Concept 007. New episode components draw textual axes, intersection bands, containment guides, the predicate badge and the successive stages of the filter.

## Query semantics and evidence

Each annotation has an identity, an explicit type and one or more half-open segments anchored to a document, block and revision. A mention references an entity with its own identity and classification. Text coordinates come from locating the supplied annotated words in the original prose. These records are sufficient to run the query before a single SVG measurement is made.

Two compatible segments intersect when their shared extent has positive length. Equal endpoints give adjacency when one segment ends where the other starts. A multi-segment annotation intersects another if any compatible pair intersects. Containment checks the entire membership of each inner segment against the union of compatible outer segments, including any gaps. Positions in different documents, blocks or revisions cannot establish an intersection or containment.

The query first finds mentions referring to Napoleon’s entity ID. For each speech containing an entire such mention, it finds mentions inside that very speech whose referenced entity is a place. Results are grouped by place identity. Each evidence record retains the source document, person mention, speech and place mention. The animation uses those evaluations to highlight ranges, explain exclusions and connect results to sources.

| Document | Person associated with the query | Containing speech | Returned place or reason |
| --- | --- | --- | --- |
| 01 | Napoleon | Yes | Paris |
| 02 | Napoleon | None | “Lyons” refers to Lyon. No speech contains the person. |
| 03 | None | None for Napoleon | Wellington refers to Arthur Wellesley. Madrid is in Wellington’s passage. |
| 04 | The Emperor | Yes | Vienna |
| 05 | Napoleon | None for this mention | The speech contains Brussels. Napoleon falls outside its opening boundary. |

The final example evaluates independently supplied entity, direct-speech and irony annotations on another sentence. The speech contains both the person and the ironic expression. Two separate highlights show the corresponding intersections. The interpretation of irony is supplied by the annotator.

The cut includes the optional fifth document and a short spoken explanation of Brussels. This brings the running time to the upper end of the brief and leaves time to inspect the three negative cases. The five-row layout and the two-result close-up are composed for this illustrative corpus. The query model can be tested on other records; a different result set or substantially longer prose may require reframing.

## Preview, render and adapt

Use Node 22.12.0. Start in the repository root or the root of the unpacked delivery.

```sh
cd animated-explainers
npm ci
npm run preview
```

Choose `008-when-annotations-become-queries` on the port Studio prints. Space plays the narrated film. Press G and enter frame 765 to inspect adjacency, 1872 for the Brussels counterexample, 2361 for the returned places, or 2739 for the cross-ontology query.

```sh
npm run typecheck
npm run render -- 008-when-annotations-become-queries renders/008-when-annotations-become-queries.mp4 --audio-bitrate=192k
```

To inspect how an annotation changes the answer, change Document 04’s supplied person reference from Napoleon to Wellesley in `model.ts`. The text and speech boundaries stay the same, but Vienna loses its qualifying evidence. Restore the original reference before reproducing this edition. Update the spoken script, captions and framing when producing an edition with different results.

## Narration

Fifteen cues use local Kokoro v1.0 with British English Emma at speed 1.0. Individual utterances leave room to see the three interval configurations. The generator checks cue lengths, aligns speech to the manifest and normalizes the mix. Studio and the recorder use the same included 48 kHz AAC asset. The [standalone 24-bit PCM WAV](../../renders/008-narration.wav) contains the soundtrack decoded from the release MP4.

To regenerate speech after a script edit, follow the [model, Python and FFmpeg setup](../003-beyond-the-hierarchy/implementation.md) and run the following command from the animation workspace. The included audio is sufficient to render the existing film.

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/008-when-annotations-become-queries.m4a --episode-dir episodes/008-when-annotations-become-queries
```

## Verification

The predicate tests compared 1,444 interval pairs with explicit sets of character positions. They included adjacent covering segments, uncovered gaps and identical boundaries. Separate tests changed the document, block and revision, placed the two mentions in different speeches in the same document, and grouped repeated evidence for the same entity ID. The five corpus outcomes and the original supporting records matched the table above.

Studio checks measured mention pins against their glyphs, verified the absence of a shared band at adjacency, followed Paris and Vienna back to Documents 01 and 04, and checked forward and backward seeks. All eight episodes opened. Eighteen decoded frames from this recording were inspected at a phone viewing width of 360 pixels.

The final MP4 decoded through all 3,000 H.264 frames. Its default 48 kHz AAC track measured −16.25 LUFS integrated and −4.86 dBTP. All fifteen cue envelopes aligned with the timed source. Local speech recognition recovered the supplied narration across all ten scene windows. The final word ends at about 97.8 seconds, leaving the closing statement on screen.
