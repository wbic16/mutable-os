# Beyond the Hierarchy · production report

The 75-second film follows one original couplet through ten scenes. Its first demonstration asks the viewer to notice which structure ends first. Its last asks whether two readers who point to the same words must agree. The three signature pictures are decoded from the delivery MP4.

| Scene | Time in seconds | Visual decision |
| --- | --- | --- |
| The comfort of hierarchy | 0–6 | Stanza, line and phrase make containment visible in the poem itself. |
| Another way of reading | 6–15 | Read the lineation alone, then the subject, predicate and prepositional phrase. Superimpose the readings. |
| The collision | 15–22 | Set the poem on one baseline and trace the four boundary events from left to right. |
| Liberation from the tree | 22–30 | Collapse the same two enclosures onto their lower edges. Separate them vertically and retain four endpoint guides. |
| Freedom of arrangement | 30–41 | Use the same two tracks for four configurations. Name each once it settles. |
| Beyond a single ontology | 41–52 | Restore verse lineation. Introduce the poetic bracket, grammatical stroke and rhetorical dotted line beside examples of what each describes. |
| The arrival of a new ontology | 52–58 | Draw the literary diamond-ended range and its new entry in reserved space. |
| Beyond a single interpretation | 58–65 | Two equal tracks quote Reader A and Reader B on exactly the same phrase. Hold the question of agreement open. |
| Synthesis | 65–69 | Restore all four systems and keep both readings in the literary entry. |
| Closing sequence | 69–75 | Bring in the closing lines on the engraved card. Pause before “Many ways of knowing.” |

## Source and editorial choices

The composition uses the existing Studio registry, CLI encoder, locally bundled typefaces, series plate, font gate, captions, range strokes, engraved end card and frame-based easing. The shared Cell sequence measures the shaped passage once. Its geometry supplies the verse positions, endpoint Cells, enclosing rectangles and tracks. The visual change at 15 seconds straightens the line break. All four endpoints then stay on their original characters throughout the fold.

Episode-local components draw the poem and its two layouts in [passage.tsx](passage.tsx), the enclosures and track transitions in [structures.tsx](structures.tsx), and the systems and attributed readings in [systems.tsx](systems.tsx). [scene.tsx](scene.tsx) assembles them around the timed manifest. The only runtime change outside the episode is its Studio registration.

The opening uses the supplied poem for the familiar containment example. Three systems establish the catalogue before literary imagery arrives as a fourth. This leaves room to show each system's descriptive work and to give the two readers equal visual weight. A pale blue and diamond terminals distinguish the new literary layer. Violet brackets, gold endpoint dots and mint dotted strokes retain the earlier systems' identities.

## Reproduce or adapt the example

1. Start in the repository or extracted review bundle. Use Node 22.12.0 and the locked animation workspace. The first render needs the matching headless browser. From the root run the following commands.

   ```sh
   cd animated-explainers
   npm ci
   npm run typecheck
   npm run preview
   ```

2. Open `003-beyond-the-hierarchy` in the Studio sidebar. Press **G** and enter frame **840** for the independent tracks, **1671** for the fourth system, or **1881** for the two readings. Press **Space** to play.
3. The [storyboard](storyboard.md) pairs the recorded voice script with the picture. Edit [scenes.json](scenes.json) to change a scene’s heading, timed captions or narration. Caption and narration offsets are seconds from the scene start. Each speech window closes at the following spoken cue or scene boundary. For example, changing the caption at offset 4.95 in `interpretations` changes the closing thought in that scene. To change the specimen or its targets, update the passage and quoted range definitions together.
4. In the animation workspace, produce the film and an optional source still with the existing commands.

   ```sh
   npm run render -- 003-beyond-the-hierarchy renders/003-beyond-the-hierarchy.mp4
   npx remotion still index.tsx 003-beyond-the-hierarchy renders/003-tracks.png --frame=840
   ```

5. Check the encoded film at 28.0, 55.7 and 62.7 seconds. At the first cue the upper track ends at *slowly* while the predicate continues. At the second, only the literary layer has entered. At the third, both tracks begin at *the* and end at *sea*, before the full stop. The delivered stills use these times and the master’s 1080-pixel resolution.

## Teaching and narration

The teaching-by-example skill pairs a concrete input with a visible result and an editable cue. Here, the same phrase supplies both interpretations. Changing a reading changes what one reader says while the shared boundary remains inspectable. The skill’s worked introduction and production notes informed the timing windows, separate voice text, reproducible render commands and inspection of the encoded delivery.

The narrated edition uses Kokoro v1.0 and the British English Emma voice at its native speaking rate (1.0). Emma, Isabella and Heart each read the poem and a sentence about the two interpretations in a local audition. Local speech recognition recovered the words from all three. Emma had the lowest median voiced pitch in that sample, about 186 Hz, and was the voice used in the earlier series reference. This selection applies to Concept 003.

The manifest stores each spoken cue’s text and its offset from the scene start. The four arrangement names and the last line of the film have their own entrances. The voice was generated on the production Mac from public model weights. Studio reads the finished AAC asset from `public/003-beyond-the-hierarchy.m4a`.

To change the performance, use a separate Python 3.11 environment with `kokoro-onnx==0.6.1`, `numpy` and `soundfile`, plus FFmpeg with the loudnorm filter and AAC encoder. Download `kokoro-v1.0.onnx` and `voices-v1.0.bin` into one directory. The generator checks that every cue fits and writes a two-pass loudness-normalized Studio track. Run this from the animation workspace, then render the composition using step 4 above. [Model and voices](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/003-beyond-the-hierarchy.m4a
```

## Verification

The animation workspace passed its TypeScript check. Studio checks measured the poem’s glyph positions before, during and after the fold. The four endpoints stayed on the same glyph boundaries. The four settled arrangements satisfied their ordering relationships. The three existing system groups retained identical geometry and content through the fourth system’s arrival. Both reader tracks had identical horizontal endpoints. Backward and forward seeks reproduced the checked frames.

The silent picture master decoded through all 2,250 frames. It has one H.264 video stream, 1080 × 1080, 30 fps, YUV 4:2:0 and a duration of 75.000 seconds. Twenty-seven decoded frames, including intermediate poses, were inspected at a 360-pixel viewing width. Review led to more space between reading labels, clearing arrangement names during motion, and stable diamond terminals during the literary range’s entrance. The three delivered PNGs retain full resolution.

The extracted picture review bundle installed from its lockfile, passed typechecking and rendered frame 840 through the documented Remotion entry point using the installed headless browser. Its RGB channels differed from the decoded H.264 still by an average of 1.98 levels on a 0–255 scale. Archive membership and member contents were checked against the source and delivery files.

The narrated master carries a default English AAC track at 48 kHz. Its decoded loudness is −16.15 LUFS integrated and its true peak is −1.98 dBTP. A local speech recognizer transcribed the decoded audio in each of the ten scene windows. The quoted word “rose” was transcribed as the homophone “rows”. The H.264 packet stream had the same SHA-256 digest as the silent master. The 75-second PCM WAV was decoded from the master’s audio track. A separate render through the Studio composition produced speech in the opening five seconds.
