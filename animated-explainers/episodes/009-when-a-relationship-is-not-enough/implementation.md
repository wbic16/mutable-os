# Concept 009 · When a relationship is not enough

Volume III opens with a question a reader can answer from the first illustrative sending. Who received the money? The six separate associations admit either recipient. In the statement-centred view the reader can follow Money to Claim A, then follow Recipient to His brothers and check the sentence in Document 02.

[Watch the narrated film](../../renders/009-when-a-relationship-is-not-enough.mp4) · [Review nine stages](../../renders/009-stages.png) · [Full-resolution stills](../../renders/009-stills) · [Narration WAV](../../renders/009-narration.wav) · [Portable worked example](../../renders/009-when-a-relationship-is-not-enough.zip)

## What holds a sending together

| Identity | Type | Sender | Theme | Recipient | Origin | Illustrative passage |
| --- | --- | --- | --- | --- | --- | --- |
| A | Sending | Michelangelo | Money | His brothers | Rome | Document 02 |
| B | Sending | Michelangelo | A letter | A friend | Florence | Document 03 |

The episode’s [model](model.ts) stores each claim’s identity, type, role assignments and passage reference. Each mention occupies a character interval in the unmodified source. The passage reference covers the full sentence, including its punctuation. Both Sender references resolve to one entity. Florence also reuses the entity from the opening residence example.

In the [graph choreography](graph-scene.tsx), all seven entities are keyed by identity. As the second sentence enters, six independent associations converge on Michelangelo. The coral dashed arc asks whether the money went to the friend. During the first regrouping, three moving connectors transfer their ends to Claim A. A fourth connects the claim to its sender. Claim B then resolves the other three participants and shares that sender with Claim A. The layout is calculated from the current frame, so a seek lands on the same pose as playback.

The reusable [ClaimNode](statement.tsx) gives an assertion a lavender outline, an identity and a prominent type. The graph uses the existing entity ellipses, Bézier links and traversal pulses from Concept 006. An optional compact ellipse fits the six recipients, themes and origins into the two-claim view. The series plate, bookends, document frame, shaped-text measurement, range marks, captions, fonts and recording pipeline come from earlier episodes.

The [passage component](passage.tsx) keeps each sentence in one SVG text element. The two displayed lines retain their underlying character offsets. In the provenance scene, each dashed teal connector terminates at the first character’s underline. The second line continues the same source interval through the period. The four questions in the following shot address Claim A and leave its evidential status open.

## Preview, edit and record

1. From the repository or extracted archive, enter `animated-explainers`. Use the repository’s Node 22.12.0 environment and run `npm ci` if its locked dependencies are absent.
2. Run `npm run preview` and select `009-when-a-relationship-is-not-enough`. Press Space to play with narration. Press G and enter frame 1080 for the possible pairing, 1470 for Claim A, 1725 for both sendings, or 2160 for the two sources.
3. Compare the frames with the [storyboard and script](storyboard.md). To make another example, edit the source words and corresponding entity references in `model.ts`, keep each mention spelling identical to its passage, and update the narration in [scenes.json](scenes.json). For a longer sentence, adjust the line break and check the shaped result at phone size. The layout is composed for these two four-role assertions.
4. The included soundtrack is ready for preview or recording. To regenerate it after editing the script, use the [Concept 003 neural voice setup](../003-beyond-the-hierarchy/implementation.md) and run the first command below. Record the composition with the remaining commands.

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/009-when-a-relationship-is-not-enough.m4a --episode-dir episodes/009-when-a-relationship-is-not-enough
npm run typecheck
npm run render -- 009-when-a-relationship-is-not-enough renders/009-when-a-relationship-is-not-enough.mp4 --audio-bitrate=192k
```

The local Kokoro v1.0 British English Emma voice reads 13 timed cues at its native rate. The generator checks utterance length and places each cue at its manifest offset. The Studio composition includes the resulting 48 kHz track. The 24-bit standalone WAV contains the release soundtrack decoded from the MP4.

## Editorial choices

The 90-second cut gives the question about the friend and the subsequent reattachment of the role links separate holds. The narration says the two sendings share a sender, which is the precise overlap in these examples. It defines “n-ary statement” once the viewer has seen both groupings. A brief reprise of Claim A dissolves into the familiar engraved leaves on the closing card.

The examples are fictional. The passage identifiers let a reader inspect where each assertion came from. They carry no judgment about historical accuracy. The selected shots and layout are specific to this episode.

## Release checks

- The two structured claims produce the same six independent associations even if their recipients are exchanged. Their structured role assignments and source references distinguish the original from the exchanged reading.
- All nine compositions opened in Studio. Forward and backward seeks returned the same entity, role, claim and passage inventories. At the two-claim hold, both Sender links resolve to one visible Michelangelo. Source pins align with the shaped text. At the reviewed holds, role labels clear the node bounds and each other.
- The square H.264 film decoded through all 2,700 frames at 30 fps. Nineteen frames from the final encode were inspected, including the change in edge attachment, both provenance links and the closing transition. Ten full-size screenshots accompany the film.
- The release includes a 48 kHz AAC track measuring −16.17 LUFS integrated and −4.95 dBTP. All 13 cue envelopes align with the supplied narration to the 10 ms measurement interval. The final word ends around 89.24 seconds. Speech recognition recovered the narration across all nine scenes and transcribed the unfamiliar spoken term “n-ary” as “NRE”. The definition is visible on screen.
