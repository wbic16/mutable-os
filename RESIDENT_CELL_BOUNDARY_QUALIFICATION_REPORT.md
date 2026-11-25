# Resident Cell boundary qualification

## Executive summary

The resident Cell path is qualified for correctness on eligible compact plain-text blocks. The 10,000-command differential preserved annotation topology and history, including eviction and transitions through the numeric planner. Stable character identities make insertion independent of annotation count at the boundary-maintenance step. The renderer and optional consumers still have density-dependent work.

On the 500-character fixture with 274 mixed annotations, headless handler medians fell from 19.2–19.8 ms with numeric boundaries to 7.6–9.7 ms resident. Before the CSS sweep the resident handler took 26.3–26.6 ms. With 18 annotations there was no consistent handler win across both runs. The richer 5,000-character fixture still exceeded 16.7 ms in the handler alone. On the headed Apple M1 GPU, the dense resident next-frame median was 17.4–17.5 ms and p95 was 21.9–22.5 ms. Headless software rendering produced p95s of 149.6 and 339.5 ms. The measured improvement is substantial, with frame delivery still dependent on workload and renderer.

At 2,500 fragmented edits, retained Node heap fell from 212.1 to 29.6 MiB. Closing the final lease now frees the sequence even when its disposed callback is retained. Chrome separately retained the last focused detached editor after session disposal. The two lifetime findings involve different objects and were verified independently.

## Scope and architecture

An eligible, mounted compact TextBlock has one lazily allocated sequence of Unicode code-point Cells per content record. Mounts acquire leases. An edit allocates the sequence on first use. All mounted occurrences share that sequence and keep independent DOM, caret, selection and range geometry. A replacement inserts and removes its entire selection in one splice. A length-changing splice updates surviving suffix indices once. An equal-code-point-length replacement can still update suffix UTF-16 offsets if the inserted text has a different UTF-16 width. The suffix-write counter measures logical index writes. Deletion consults owners of deleted endpoint Cells. Insertion inside a range can change its coverage and geometry while both endpoint identities survive. Authored metadata, membership, numerical position and visual coverage have distinct consumers.

The native format continues to store compact text and numeric ranges. Current native capture can materialise those ranges with the sequence still resident. Undo, structural and grouped commands can use the numeric planner. The next eligible edit binds the committed version again. Historical readers reconstruct positions using allocation serials. The default-on `residentCellBoundaries` flag selects the resident path and can be switched off for the numeric control. [Repository admission and publication](src/block-tree/repository.ts) · [Cells and historical versions](src/block-tree/resident-cells.ts) · [Configuration](src/configuration.ts)

Qualification exposed problems in history retention, release, rendering and two subscribers.

- A release function retained its closed lease entry and therefore its sequence. Last release now resolves the cold representation, retires the version and clears the sequence reference. Reentrant admission also checks that the exact model still owns the lease. A pending plan validates the liveness of its preimage before writing, including after an in-place rebind.
- With fragmented history, each revision retained a growing flat list of serial runs. The active model still uses flat arrays. Historical versions now share a checkpoint with up to 31 immutable splice descriptions. Replay cost is paid when a historical numeric reader needs an uncached version. Checkpoints and retired endpoint references still consume memory as history grows.
- The renderer performed repeated range-origin reads, replaced identical SVG shapes and repeatedly read CSS annotation offsets at each style boundary. It now shares one surface origin per geometry pass, reuses unchanged shapes by key and value, and compiles CSS with ordered enter/leave events. Active styles preserve authored cascade order. SVG-only properties skip CSS offset reads. Native selection restoration checks the current endpoints and can set anchor and focus together. Per-range fragment reads still refresh on reflow, including ranges containing an insertion. [Style compilation](src/rendering/standoff-styles.ts) · [Occurrence rendering and caret](src/rendering/standoff-editor-view.tsx)

- With live entity inventory open, a resident edit could rebuild a paragraph’s entity links from a complete numeric export even when the edit only shifted offsets. The subscriber now uses saved property ordinals and current endpoint UTF-16 positions to check the wording of tracked mentions near the splice. A changed spelling refreshes the affected entity. Membership changes, points requiring validation, invalid links and ambiguous duplicate reference IDs retain the established reconstruction path. The warm path still performs one cheap intersection check per tracked mention in that paragraph. [Live entity inventory](src/application/live-document-entities.ts)
- The 200-block viewport exposed a numeric property-list read on every edit solely to decide virtualisation eligibility. Plain compact spans already establish the text-only invariant. The viewport now caches eligibility for the stable resident property list and observes structural eligibility per row. Editing one paragraph can invalidate its own eligibility without rereading its siblings. [Virtual text flow](src/rendering/virtual-text-flow.tsx) · [Child outlets](src/rendering/block-outlet.tsx)

## Correctness and bounded work

The seeded differential runs two real repositories and command stacks with opposite flag settings. Seed `0x5a11ce` generated 10,000 commands. Each step compared the complete current record, including text, revision, ordered metadata and bounds, plus per-instance identity keys. An additional 205 retained preimages were compared with detached numeric oracle copies after the trace. The trace includes forward/backward deletion, unequal and equal replacement, paste, points and affinities, coincident annotations, duplicate and absent IDs, RTL text, astral code points, combining characters, transactions, history branching, double Undo/Redo and lease churn. Every one of the 16 operation buckets occurred at least 576 times. Text length is bounded in this test so it can check every record after every step. Fragmented long history and large-block costs are measured separately. [Stress test](src/block-tree/resident-qualification.test.ts) · [Exhaustive boundary and stale-plan cases](src/block-tree/resident-cells.test.ts)

Real mounted-editor integration exercises resident → cross-block planner → resident editing, compares native bytes at each Undo and Redo, and admits the result to a fresh cold repository. Two occurrences receive the same edit, with independent DOM and selection. A stale IME completion and a delayed clipboard result are discarded after the other occurrence commits. Gloss authoring, native capture, search, clipping, native package exports, knowledge facts and entity-range offsets use the committed version. Manual Save remains the project contract. Mount, scroll and eviction are representation work. None requests an automatic save. [Mounted integrations](src/rendering/compact-production.test.tsx) · [Manual Save and reopen](src/persistence/native-session.test.ts) · [Native persistence](src/persistence/compact-native.test.ts) · [Entity change subscription](src/application/document-entity-changes.ts)

The warm insertion regression asserts exactly the necessary suffix writes, zero unrelated endpoint visits, zero retargets and zero implicit numeric exports. With 400 opaque properties and one entity, an open inventory performs one mention lookup per splice and zero whole-inventory reads or numeric exports. A second regression uses 500 disjoint CSS ranges with getter counters and checks exactly 1,000 endpoint reads. An SVG property in the same list throws if its offset is inspected by CSS compilation. A geometry regression uses coincident annotations and checks shared range fragments, one surface origin per pass and DOM identity for an unaffected path while a containing shape changes. Additional checks cover invalid preflight and stale operations. [Diagnostic counters](src/block-tree/cell-diagnostics.ts) · [Style tests](src/rendering/standoff-styles.test.ts)

## Measurement method

Measurements used Node 22.12.0, Apple M1 and Chrome 158.0.8127.37. Each browser trial launches a fresh profile, Vite development build and the real Flint shell on an in-memory native document. The numeric column runs the same renderer with the resident flag disabled. The synthetic styled fixtures distribute bold, italic, rectangle, entity-reference and opaque ranges in equal proportions. Synthetic target length is ASCII code points. The original native letter is measured separately. Browser trials run sequentially. CPU profiling at a 200 µs requested interval is enabled in both modes except for the explicitly unprofiled 25,000-character comparison.

The typing loop alternates 40 insert/Backspace events (eight for the 25,000-character probe) at slot 100 and checks that text is restored. Its first event edits cold mounted content. Handler time ends when synthetic `beforeinput` dispatch returns. Settled time ends at the next promise microtask, which includes earlier queued caret work. Frame time ends in the next `requestAnimationFrame` callback. These nested intervals include variable scheduling delay. A browser can paint after that callback. The harness separately verifies trusted Chrome input and Undo. The instrumented stage probe runs afterwards, with no CPU sampling, and records command timings, method calls, repository stages, mutation records and work counters. Timings of nested methods overlap. Small durations can round to zero in the browser clock. The consecutive insertion probe uses 24 edits, or four in the largest browser block, and exercises growing text independently of the alternating loop.

The optional Chrome trace records available layout, style, GC, animation, paint and raster events with thread identity. One headed comparison retains SwiftShader. A second lets Chrome select its default GPU. Neither mode measures screen presentation or a user's physical keyboard. The browser stages and retained-memory series answer different questions and are kept separate below.

## Flint typing and frame delivery

Times are milliseconds. Each cell gives the minimum and maximum of independent trial statistics where a fixture was repeated. Handler, settled and next-frame columns show median / p95. Each run uses the upper order statistic at index `floor(n × p)`. The first-event column is a cold edit in the mounted browser. Special diagnostics are separate rows.

| Fixture | Mode | Cold first event | Handler | Settled | Next frame |
|---|---|---:|---:|---:|---:|
| letter-native | numeric | 13.5 | 6.8 / 9.3 | 8.3 / 12.3 | 17.2 / 105.2 |
| letter-native | resident | 10.1 | 4.0 / 6.0 | 5.4 / 6.2 | 16.6 / 75.3 |
| letter-dense | numeric | 17.4–17.5 | 9.9–12.8 / 14.5–18.1 | 11.2–14.3 / 15.3–21.0 | 16.6–21.2 / 100.5–103.0 |
| letter-dense | resident | 12.4–17.0 | 3.9–5.2 / 6.1–8.9 | 5.3–6.7 / 6.7–9.2 | 16.5–16.7 / 74.2–131.5 |
| 500-18 | numeric | 9.9–11.3 | 4.2–5.6 / 7.9–9.1 | 5.5–7.6 / 9.1–10.2 | 17.8–20.3 / 108.6–188.9 |
| 500-18 | resident | 9.9–10.1 | 3.4–5.0 / 6.7–10.1 | 4.7–6.7 / 6.8–10.6 | 16.5–16.8 / 106.5–185.2 |
| 500-274 | numeric | 23.4–40.9 | 19.2–19.8 / 23.4–35.9 | 20.3–21.0 / 26.8–36.1 | 39.4–41.1 / 194.7–320.6 |
| 500-274 | resident | 15.2–21.0 | 7.6–9.7 / 9.4–18.8 | 9.3–11.2 / 11.2–22.7 | 35.8–38.9 / 149.6–339.5 |
| 500-274 headed | numeric | 37.0 | 17.8 / 28.3 | 19.2 / 30.3 | 390.4 / 1001.9 |
| 500-274 headed | resident | 20.0 | 8.1 / 19.5 | 10.0 / 19.7 | 396.3 / 1050.3 |
| 500-274 hardware | numeric | 22.8 | 13.2–13.9 / 19.7–20.2 | 14.8 / 19.8–20.2 | 24.3–24.6 / 29.5–30.1 |
| 500-274 hardware | resident | 17.1–17.2 | 6.1–6.2 / 11.1–12.3 | 7.5–7.6 / 11.3–12.5 | 17.4–17.5 / 21.9–22.5 |
| 500-274 trace | numeric | 27.3 | 15.5 / 27.6 | 17.3 / 30.9 | 133.2 / 147.9 |
| 500-274 trace | resident | 17.0 | 7.1 / 14.6 | 8.6 / 14.9 | 36.0 / 123.5 |
| 500-274 inventory | numeric | 26.6 | 19.3 / 26.6 | 22.0 / 31.7 | 37.1 / 275.9 |
| 500-274 inventory | resident | 26.0 | 7.6 / 14.3 | 9.5 / 16.0 | 35.1 / 197.2 |
| 500-0-200 viewport | numeric | 9.1 | 3.0 / 5.5 | 4.9 / 7.2 | 16.6 / 17.6 |
| 500-0-200 viewport | resident | 9.1 | 3.8 / 6.9 | 5.8 / 12.3 | 16.8 / 18.0 |
| 500-274-200 viewport | numeric | 20.1 | 15.4 / 23.6 | 16.8 / 23.8 | 125.4 / 255.2 |
| 500-274-200 viewport | resident | 16.4 | 7.3 / 11.2 | 8.8 / 11.9 | 123.6 / 266.0 |
| 1000-20 | numeric | 14.6 | 9.1 / 11.5 | 10.9 / 15.0 | 30.5 / 233.3 |
| 1000-20 | resident | 12.3 | 6.6 / 12.3 | 8.3 / 15.3 | 32.7 / 194.9 |
| 1000-1000 | numeric | 57.0 | 53.2 / 61.5 | 54.4 / 65.7 | 199.5 / 248.4 |
| 1000-1000 | resident | 32.7 | 21.2 / 27.6 | 23.0 / 32.0 | 191.0 / 244.8 |
| 5000-500 | numeric | 79.4 | 46.2 / 79.4 | 51.1 / 86.9 | 270.9 / 328.8 |
| 5000-500 | resident | 45.8 | 34.8 / 51.1 | 39.2 / 65.5 | 268.2 / 426.0 |
| 25000-20 | numeric | 119.8–138.1 | 127.8–164.6 / 144.4–237.2 | 141.3–189.9 / 162.9–237.2 | 235.7–318.1 / 314.9–378.5 |
| 25000-20 | resident | 139.7–141.0 | 170.4–193.8 / 216.4–228.8 | 188.8–212.2 / 216.5–289.2 | 313.7–392.6 / 404.6–865.2 |
| 25000-20 unprofiled | numeric | 120.4 | 153.0 / 226.4 | 163.1 / 250.0 | 387.7 / 679.3 |
| 25000-20 unprofiled | resident | 125.2 | 146.6 / 186.8 | 170.0 / 219.8 | 321.5 / 527.6 |

**Work at the rendering boundary.** The table below uses the separately instrumented 24 consecutive insertions. The host contains 500 characters and 274 mixed annotations. “Earlier” is the pre-hardening resident capture. “Current” uses the final CSS sweep and geometry changes. Each entry is a per-event median from one trial.

| Per insertion | Earlier resident | Current resident | Current numeric |
|---|---:|---:|---:|
| Command, ms | 25.3 | 8.1 | 17.1 |
| Character DOM update, ms | 0.8 | 1 | 1 |
| Browser Ranges constructed | 111 | 110 | 110 |
| Range fragment reads | 110 | 110 | 110 |
| Element rectangle reads | 111 | 1 | 1 |
| Added / removed DOM nodes | 59 / 58 | 8 / 7 | 8 / 7 |
| Attribute / SVG-target mutations | 407 / 123 | 407 / 21 | 407 / 21 |

In the traced runs, these are main-thread events within the 40 measured input-to-callback intervals. Each timing entry is total milliseconds / milliseconds inside dispatch / milliseconds between dispatch return and the sampled microtask. Nested trace categories must be interpreted independently.

| Event | Numeric | Resident |
|---|---:|---:|
| Layout | 40 events, 71.2 / 0.0 / 23.6 | 40 events, 73.0 / 0.0 / 24.9 |
| UpdateLayoutTree | 80 events, 41.8 / 0.0 / 25.3 | 80 events, 43.0 / 0.0 / 25.2 |
| MinorGC | 31 events, 18.6 / 14.6 / 0.0 | 10 events, 9.2 / 0.0 / 0.0 |
| MajorGC | 2 events, 9.1 / 6.5 / 0.0 | 0 events, 0.0 / 0.0 / 0.0 |
| Paint | 156 events, 47.4 / 0.0 / 0.0 | 156 events, 49.1 / 0.0 / 0.0 |
| PrePaint | 39 events, 16.5 / 0.0 / 0.0 | 39 events, 17.1 / 0.0 / 0.0 |

In the pre-sweep styled resident CPU profile, sampled self time included 290 ms in Solid signal reads, 230 ms in the Cell position getter and 142 ms in range eligibility. Each style boundary had been filtering all CSS ranges. In the current 500/274 headless trial, signal reads accounted for 37 ms and the position getter fell outside the 35 hottest frames. These independent profiles differ in duration. The getter-count regression isolates the algorithmic change.

During the current sustained 500/274 resident probe, median command time was 8.1 ms. Preparing the history and publication cost 0.1 ms, applying the splice and canonical state cost 0.2 ms, synchronous notification cost 0.5 ms, and flushing the Solid batch cost 6.8 ms. The character DOM update took 1.0 ms inclusively. One queued selection restoration took 3.3 ms, including any layout the browser required. The 110 distinct range fragment reads took another 2.5 ms in the frame callback. These are medians of separately measured, sometimes nested intervals. Across the 40 typing operations there were 40 splices, one hydration, 16,000 suffix writes, zero endpoint-owner visits and zero numeric range exports on that fixture.

The 407 attribute mutations per sustained edit include the public `data-inline-index` values that move on every following DOM span. Multiple caret, hit-testing and selection consumers use those indices. Drawing still scales with visible affected shapes and distinct range geometry. Cell sharing removes repeated canonical writes across occurrences. Each mounted occurrence still pays its own layout and DOM costs.

The numeric trace covered 4.94 s, the resident trace 1.72 s. Chrome recorded 71–73 ms of main-thread layout across each whole run. Roughly 24–25 ms of that fell between handler return and the sampled microtask. Paint and pre-paint occurred outside dispatch. GC explains part of the numeric handler time and very little of the resident trace. Tracing also reported idle next-frame intervals as long as 117–134 ms in the separate probes with no editing. The size of a frame outlier therefore cannot be assigned to the splice from the callback timer alone. Raster activity and display presentation do not have a reliable per-keystroke attribution in this trace. Use the headed results as an independent observation of this machine and rendering configuration.

### Hardware, active inventories and long paragraphs

Chrome reported enabled GPU compositing through ANGLE Metal on the Apple M1. With the hardware renderer, the styled 500/274 resident next-frame median was 17.4–17.5 ms and p95 was 21.9–22.5 ms. Numeric was 24.3–24.6 and 29.5–30.1 ms. With the same headed shell using SwiftShader, medians approached 400 ms in both modes. Graphics configuration and browser scheduling materially influence these callback timings. Hardware results draw much closer to a 60 Hz interval. The reported p95s still exceed it.

Opening the entity inventory on 500/274 produced 40 full per-block inventory reads in the numeric run and zero resident. The latter did 2,200 cheap mention-surface checks across 40 edits, with zero numeric exports and zero inventory publications. Editing inside a mention is separately tested to update its displayed wording. In the 200-block styled document the canonical edit still touched only the active block. Browser viewport and raster overhead can change even when the canonical counters are identical.

In one 25,000-character probe, the last sustained insertion produced 24,901 attribute mutations in both modes. The resident model prepared and applied it in 0.5 ms, synchronous notification took 11.8 ms, and the Solid batch flush took 87.4 ms. The character DOM update cost 33.2 ms inside that work. Native caret restoration measured another 40.0 ms. The numeric trial also spent 35.5 ms updating the character DOM and 45.2 ms restoring selection on that insertion. The independent reversed-order pair is reported in the table. Eight-event large-block trials are sensitive to first-edit and browser variation. The model-only comparison below identifies how little of this cost is range maintenance.

| Resident mounted fixture | Cold shell mount, ms | Canonical Cells allocated at mount | First handler, ms |
|---|---:|---:|---:|
| 500-18 | 384.7 | 0 | 10.1 |
| 500-274 | 413.3 | 0 | 21.0 |
| 500-0-200 | 242.5 | 0 | 9.1 |
| 1000-1000 | 157.8 | 0 | 32.7 |
| 5000-500 | 200.7 | 0 | 45.8 |
| 25000-20 | 503.1 | 0 | 141.0 |

Shell mount measures the synchronous render and gateway installation after in-memory admission. Subsequent browser work can continue after that interval.

On the sparse 25,000-character target the resident handler was slower in both profiled orders (170.4 and 193.8 ms against 127.8 and 164.6 ms). With CPU sampling disabled, a fresh pair measured 146.6 ms resident and 153 ms numeric. The separately instrumented consecutive insertions were much closer at about 100–105 ms in both modes. Large sparse paragraphs therefore have no demonstrated resident typing advantage in Flint. The measured DOM, caret and reconciliation costs establish a common bottleneck. The precise cause of the *difference between representations* in the alternating loop remains unresolved. Changing the public per-span index or introducing intra-paragraph virtualisation would affect hit testing, selection, IME and decorations across the editor. This release preserves those contracts.

## Paste after Undo and sustained editing

The two native dense-letter trials alternate launch order. Each records four 192-character pastes into warmed content and four immediately following Undo. Figures give the median across four chronological samples for each trial, in milliseconds. Undo and the following settling frame complete before the paste timer starts.

| Dense letter | Warm paste | Post-Undo paste | Post-Undo hydrate | Post-Undo prepare / apply / notify / flush |
|---|---:|---:|---:|---|
| numeric-1 | 13.1 | 13.5 | 0.0 | Numeric planner |
| resident-1 | 7.1 | 9.5 | 0.7 | 0.8 / 0.1 / 1.9 / 6.5 |
| numeric-2 | 14.5 | 13.1 | 0.0 | Numeric planner |
| resident-2 | 6.9 | 8.7 | 0.7 | 0.8 / 0.1 / 1.7 / 6.2 |

Both resident trials allocated the inserted 192 Cells in one splice. After Undo the next paste also hydrated the 499-character source and rebound its properties. Median hydration took about 0.7 ms. Solid work after publication took 6.2–6.5 ms in the post-Undo cases. A forced rebuild explains a repeatable portion of the warm/cold difference. The earlier 9 versus 20 ms trials lacked stage traces, so the remainder of that historical gap cannot be attributed retrospectively. The old pooled 15.2 ms resident versus 12.9 ms numeric paste regression did not recur in these two crossover trials. These comparisons use the original letter with 256 extra opaque annotations. The synthetic styled fixture remains a separate, heavier rendering workload.

A 2,048-character paste in the current 500/274 resident probe took 53.4 ms synchronously, including 1.3 ms of preparation, 0.1 ms of application, 18.8 ms notifying subscribers and 33.1 ms of Solid flush. On that run, deleting a 190-character selection took 34.2 ms, equal replacement 24.3 ms, unequal replacement 15.6 ms, and Undo/Redo of the equal replacement 29.1/28.5 ms. These single observations include real DOM and subscriber work. Each qualifying replacement used one model splice. Ordinary and large pastes have materially different interactive costs.

The earlier isolated numeric-delta arithmetic control remains available in the original model study. Its cheap integer updates omit publication, history and rendering. These results support the integrated change as a whole. They do not isolate the portion attributable to stable Cell identities versus eliminating eager cloning and downstream enumeration.

## First edit, eviction and retained history

These are single-process Node repository readings, in milliseconds. Each includes synchronous command admission and history publication. The short block has 889 logical characters in 1,000 UTF-16 units. The large block has 106,667 in 120,000 units. The “export alone” measurement reads the lazy current numeric property list. Releasing after that read isolates the remaining lease teardown. Browser mount and renderer costs are reported separately.

| Logical characters / annotations | Acquire lease | First edit | Warm edit | Rehydrate and edit | Export alone | Last release including export | Last release after export |
|---|---:|---:|---:|---:|---:|---:|---:|
| 889 / 20 | 0.014 | 2.61 | 0.24 | 0.72 | 0.063 | 0.177 | 0.004 |
| 106,667 / 20 | 0.020 | 20.28 | 2.61 | 12.48 | 0.116 | 0.272 | 0.005 |
| 106,667 / 1,000 | 0.022 | 28.91 | 2.39 | 21.32 | 1.906 | 2.481 | 0.005 |

With 200 compact blocks, acquiring and releasing every lease allocated zero canonical Cells. Two leases on the same block hydrated only on edit. After last release, with the callback itself still reachable, collection cleared WeakRefs to the sequence and an interior non-endpoint Cell. The pre-fix experiment retained both. After the repository and history were released, WeakRefs to the repository and monitored content cleared in every final process. An additional forced-GC run deliberately retained four already-fired release callbacks after closing and confirmed collection of both objects. Historical ranges can intentionally retain endpoint Cells. An addressable historical version still needs its authored fields, endpoint serials, text and run reconstruction data.

| Retained edits | Fragmented before, MiB | Fragmented after, MiB | Sequential after, MiB | Fragmented live runs |
|---:|---:|---:|---:|---:|
| 100 | 7.27 | 6.69 | 6.64 | 187 |
| 250 | 10.28 | 7.50 | 7.36 | 444 |
| 1000 | 47.85 | 12.91 | 11.59 | 1371 |
| 2500 | 212.14 | 29.60 | 23.28 | 2909 |

The table shows total process JS heap after forced collection. It includes repository state and retained Undo history. At 2,500 edits the live run count was 2,909 for scattered insertions and four for sequential insertion. The checkpoint change reduced retained process heap by 86% in this fragmented workload. The final lifecycle adds an explicit export/release probe and one setup edit before the measured history series. The reduction was also reproduced with the original setup. In the final fragmented run, heap went from 5.37 MiB after opening to 5.38 after scanning leases, 5.89 after editing 20 blocks, 6.18 after 30 eviction cycles, and 4.78 after closing. Forced collection excludes short-lived allocations. It cannot attribute all live bytes to a class. [Lifecycle harness](experiments/lightweight-cells/qualification/lifecycle.mjs)


The supplementary 106,667-character comparison runs the real repository and history stack without DOM. Each cell below is milliseconds. Start, middle and append are medians of eight growing-text edits at each position.

| Ranges | Mode | First edit | Start | Middle | Append |
|---:|---|---:|---:|---:|---:|
| 20 | Numeric | 26.73 | 10.75 | 12.84 | 14.13 |
| 20 | Resident | 11.11 | 1.64 | 0.88 | 0.05 |
| 1000 | Resident | 9.10 | 1.59 | 0.84 | 0.04 |
| 1000 | Numeric | 23.30 | 18.48 | 20.20 | 21.57 |

## Browser residency and teardown

In the 200-block native document, Chromium initially mounted 26 text rows. The actual virtual scrollport moved 11,496 pixels, retained the focused window and mounted rows 187–199. Scrolling committed zero revisions and allocated zero canonical Cells. The retimed resident edit loop performed 40 splices without a numeric property-list export. The earlier viewport implementation performed 40 such reads on the same empty-annotation target.

| Collected browser JS heap | Numeric, MiB | Resident, MiB | Resident DOM nodes |
|---|---:|---:|---:|
| Open | 16.86 | 16.87 | — |
| Scroll and return | 20.23 | 20.25 | — |
| After typing, bulk probes and history | 23.76 | 23.81 | 5734 |
| Warm single occurrence | 23.72 | 23.80 | 5736 |
| Two occurrences | 49.44 | 49.59 | 19883 |
| After shared edit | 48.75 | 48.90 | 19887 |
| Close second occurrence | 24.56 | 24.66 | 5738 |
| Edit eight mounted blocks | 24.60 | 24.70 | 5754 |
| Dispose session | 16.87 | 16.91 | 2346 |

Opening the second projection allocated zero additional canonical Cells and changed zero revisions. A shared edit appeared in both independently mounted DOM flows. Closing the second projection left the first sequence resident. The second full view mounted substantially more DOM than the first virtualised occurrence. The table includes application, module and presentation state. Its heap figures cannot be allocated entirely to Cells or DOM.

The browser teardown probe found a separate retention issue. No editor flows remained mounted after disposal. After three seconds and forced GC, WeakRefs to the editor and the last focused detached flow were still live. A heap graph showed a shortest strong path from V8’s native-context FocusEvent cache through a getter closure to the event target. The detached surface’s delegated click closure reached the editor. This proves retention in this Chrome session after disposal; it does not establish unbounded growth per closed tab or a leak in the Cell sequence. Production code does not modify V8 caches or Solid event internals. The repository-specific collection experiment above independently establishes which Cell objects can be reclaimed. The raw retention trial includes the observed strong paths. [Chrome heap analysis](experiments/lightweight-cells/qualification/heap-roots.mjs)

## Regression results and release assessment

The focused renderer, resident model, entity inventory and virtual navigation gate passed all 88 tests. The mounted-editor and native-session gate passed all 42 tests, including a real temporary native file Save, a still-resident range read, clean last-lease release, and cold reopen. These gates overlap. TypeScript passed for both project configurations.

The final broad selection passed **1,312 tests** and failed **14**. Each failing test name also failed on the unchanged control at `0a4128a`. The original broad baseline had nine failures. Adding the Flint Backlinks UI suite exposed five more on both versions. The existing drag/drop event exception also reproduced. This comparison covers the selected editor, persistence, rendering, input, entity, search, Gloss and indexing suites. It does not imply that the entire repository is green.

| Unchanged failing suite | Tests | Observed area |
|---|---:|---|
| Portable spike codec | 2 | Historical structural-field / copy expectations |
| Block selection | 1 | Drag/drop test and emitted event exception |
| Minimal type extensibility | 1 | Default assembly expectation |
| Page creation | 2 | Document-to-Page conversion |
| Tab orientation | 1 | Existing stale-range assertion |
| Unknown feature fallback | 1 | Historical view expectation |
| Window icon | 1 | Selection after remount |
| Flint Backlinks UI | 5 | Missing expected panel elements in the test fixture |

Reproduce the broad comparison with the following selection. The compressed evidence includes the control and current failure names.

```sh
node_modules/.bin/vitest run --maxWorkers=4 --minWorkers=1 \
  src/block-tree src/persistence src/rendering src/input src/features/compact-document \
  src/application/document-entity-changes.test.ts src/application/live-document-entities.test.ts \
  src/application/canonical-backlinks.test.ts src/application/flint-backlinks.test.tsx \
  src/features/dialectic/compact-integration.test.ts src/interchange/tei/compact-native.test.ts \
  src/features/flint/compact-shell.test.tsx src/features/gloss/gloss.test.tsx \
  src/runtime/text-search.test.ts src/knowledge/live-observer.test.ts src/runtime/virtual-navigation.test.ts
```

**Release assessment.** Keep the resident path enabled for eligible compact text, with the numeric flag available for comparison and recovery. The correctness, admission, long-history and native round-trip evidence supports that decision. Density-independent boundary maintenance does not extend to the entire UI. Nested visual styles, overlapping geometry and a long paragraph’s mounted character spans can exceed the interaction budget. A viewport limits mounted blocks and has no intra-paragraph virtualisation. A 25,000-character sparse block still took 170.4–193.8 ms median in the profiled resident handler across two trials. On this 8 GiB machine the 106,667-character sparse and dense comparisons were run at the repository level. They do not qualify browser responsiveness at that size.

Mixed text/object, cross-block and rich/grouped operations retain their existing planners. Persistent compact-history enrollment remains subject to its existing admission limits. Very long editing histories still retain Undo data, and browser-session teardown has the retained focus-event path documented above. These limits are independent of native file compatibility.

## Reproducing the measurements

Run from the repository root with installed dependencies and Chrome. Set `CHROME_BIN` if Chrome is at a different location. The letter trials use the existing local Michelangelo letter. `BENCHMARK_DOCUMENT_PATH` can select an alternative native letter with a plain-text paragraph at least 240 characters long. The synthetic trials generate their native fixtures locally. Each trial uses an independent Chrome profile. Previously completed destinations under the ignored artifact directory are reused. Choose a fresh trial label for an independent repeat.

```sh
mkdir -p artifacts/cell-qualification
node_modules/.bin/esbuild experiments/lightweight-cells/qualification/lifecycle.mjs \
  --bundle --platform=node --format=esm --outfile=artifacts/cell-qualification/lifecycle.mjs
for mode in fragmented sequential large large-sparse large-control; do
  node --expose-gc artifacts/cell-qualification/lifecycle.mjs "$mode" \
    > "artifacts/cell-qualification/history-$mode.json"
done
sh experiments/lightweight-cells/qualification/matrix.sh
node experiments/lightweight-cells/qualification/collect.mjs
npm run typecheck
node_modules/.bin/vitest run src/block-tree/resident-cells.test.ts \
  src/block-tree/resident-qualification.test.ts src/rendering/compact-production.test.tsx \
  src/rendering/standoff-styles.test.ts src/rendering/standoff-editor-view.test.tsx
```

For one timed trial, run `BENCHMARK_SKIP_SCREENSHOT=1 node experiments/lightweight-cells/qualification/run.mjs 500-274 resident repeat`. Set `BENCHMARK_CELL_TRACE=1`, `BENCHMARK_CELL_MEMORY=1`, `BENCHMARK_CELL_INVENTORY=1` or `BENCHMARK_HEADED=1` for the respective diagnostic. For hardware graphics also set `BENCHMARK_NATIVE_GPU=1`. For the large unprofiled control use `BENCHMARK_SKIP_CPU_PROFILE=1`. Numeric runs accept the same options. The archive contains chronological timings, stages, counters, CPU call trees and available Chrome event traces and heap observations. Decoding it requires only gzip and a JSON reader. The archive identifies earlier renderer trials with the prefix `before-style/`. Trials under `combined-probes/` combined tracing with other diagnostics because shell environment flags carried between runs. The comparison tables use the repeated, isolated runs. The first 500/274 numeric launch also overlapped the tail of a test run during setup. Its independent repeat is included. Pre-hardening samples are historical evidence in the archive. A rerun on the current code reproduces the current comparison. [Portable raw evidence](experiments/lightweight-cells/qualification/results.json.gz) · [Trial summaries](experiments/lightweight-cells/qualification/summary.json) · [Previous milestone data](experiments/lightweight-cells/resident-results.json)
