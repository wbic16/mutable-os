# Concept 010 · The language of characterisation

The same historical example anchors three inquiries. The Venetians lead to characterisations by several observers. Luca Landucci leads back to the supplied diary passage. Untrustworthy leads to three acts of characterisation in which researchers have expressly identified that concept. Two passages use “untrustworthy” and one uses “not to be trusted”.

[Watch the film](../../renders/010-the-language-of-characterisation.mp4) · [Nine-stage review sheet](../../renders/010-stages.png) · [Ten full-resolution stills](../../renders/010-stills) · [Standalone narration](../../renders/010-narration.wav) · [Portable production package](../../renders/010-the-language-of-characterisation.zip)

## The evidence

| Statement | Observer | Characterised entity | Expression | Concept | Source status |
| --- | --- | --- | --- | --- | --- |
| A | Luca Landucci | Venetians | untrustworthy | Untrustworthy | *Florentine Diary*, supplied illustrative English rendering |
| B | Observer A | Venetians | resourceful | Resourceful | Hypothetical |
| C | Observer B | Venetians | ambitious | Ambitious | Hypothetical |
| D | Observer C | Merchants | untrustworthy | Untrustworthy | Hypothetical |
| E | Observer D | Ambassadors | not to be trusted | Untrustworthy | Hypothetical |
| F | Observer E | Courtiers | unreliable | Unreliable | Hypothetical |

A records Landucci’s perspective. The source qualification travels with the English wording, including when the viewer follows the statement back to the diary. The brief supplies the characterisation without a dated entry or Italian wording. A lexical history of Landucci’s own expression would require the Italian passage. The five supplementary records illustrate retrieval and classification. They do not support historical conclusions about the groups named.

## How the film works

- [model.ts](model.ts) contains six identified statements. Each links an observer, a subject, a concept and a document. Its two character ranges identify the subject words and the expression. The association between a range and a concept is an editorial decision stored in that statement.
- [layout.ts](layout.ts) selects records by the observer, subject or concept reference. The same statement and concept keys persist across all three selections. The motion is calculated from the absolute frame time. Persistent nodes move into position before the newly matching records reach full opacity.
- [inquiry.tsx](inquiry.tsx) draws the role links, result columns and passage connections. The first switch brings B and C alongside A. The second gathers the evidence for Landucci alone. The third pauses at A and follows its amber concept link in reverse. A, D and E remain individually identifiable when the statements move into the passage view.
- [artwork.tsx](artwork.tsx) renders the Trait Statement with the lavender statement outline shared with Concept 009. A faceted amber plaque distinguishes a concept from an ordinary entity. Solid connectors carry participants, dashed teal lines lead to measured glyph ranges and dotted amber lines show typed relationships between concepts. The broader, opposing and related concepts enter only after the evidence has been read. F stays outside the Untrustworthy result.
- The Remotion registry, recording command, series plate, title cards, fonts, entity nodes, links, timed traversal, captions, document frames and standoff range marks come from earlier episodes. The educational film is confined to the animation workspace.

## Preview, edit and reproduce

1. From the repository or unpacked ZIP, enter `animated-explainers`. Use Node 22.12.0 and run `npm ci` when the locked dependencies are absent.
2. Run `npm run preview`. Select `010-the-language-of-characterisation` and press Space. Press G and enter frame 1152 for the entity inquiry, 1485 for the observer, 1914 for the trait or 2355 for the passages.
3. Compare the [storyboard and complete narration](storyboard.md) with [scenes.json](scenes.json). The manifest holds each scene’s caption and each spoken cue’s onset. To test what classification contributes, change E’s concept reference from `distrust` to `unreliable` in the model. The ambassadors leave the exact-concept result, while Document 05 retains the same expression. Restore the supplied classification to reproduce the film.
4. The included audio is sufficient for preview and recording. To regenerate it after a script edit, follow the [local Kokoro model and FFmpeg setup](../003-beyond-the-hierarchy/implementation.md), then use the first command below. The two remaining commands check the TypeScript and encode the film.

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/010-the-language-of-characterisation.m4a --episode-dir episodes/010-the-language-of-characterisation
npm run typecheck
npm run render -- 010-the-language-of-characterisation renders/010-the-language-of-characterisation.mp4 --audio-bitrate=192k
```

The British English Emma neural voice reads 12 timed cues at its native speaking rate. Speech was generated locally with Kokoro v1.0. The generator checks cue lengths and normalises the mix. Studio and recording use the same included 48 kHz audio asset. The standalone 24-bit WAV is decoded from the release MP4.

## Timing and interpretation

The 103-second cut reserves 16 seconds for the reversal from statement to concept. The observer inquiry shows the single example attributed to Landucci in the brief. The narration explicitly says which language the evidence preserves. The wider network illustrates one researcher’s classification. Neither frequencies nor dates of semantic change can be inferred from this teaching corpus.

The composition is arranged for this small corpus. A new edition that adds many matches needs a new layout and corresponding narration.

## Release checks

The exact-role selections returned A/B/C for the Venetians, A for Landucci and A/D/E for Untrustworthy. Reclassifying E in a test copy removed it from the concept result and preserved its words. The Unreliable neighbour introduced no additional records. Browser checks followed the same statement and concept elements through the reorientations, compared the expression pins with their glyph positions, verified the three source documents and checked the results again after backward seeks. All ten episodes opened in Studio.

The final H.264 MP4 decoded through all 3,090 frames at 1080 × 1080 and 30 fps. Nineteen decoded frames were inspected at phone viewing sizes, including intermediate positions, the lexical evidence, the broader network and the closing reprise. All 12 cue envelopes matched the timed source at 10 ms resolution. The release soundtrack measured −16.19 LUFS integrated and −4.96 dBTP. Local speech recognition recovered the narration in all nine scene windows. The last spoken word ends around 100.74 seconds, leaving the three closing lines on screen.
