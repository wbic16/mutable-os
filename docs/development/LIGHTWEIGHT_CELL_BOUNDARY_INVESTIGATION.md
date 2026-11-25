# Lightweight character Cells for standoff boundaries

25 November 2026 · Mutable / Flint · Architecture and performance investigation

## Integrated Flint implementation

The default-enabled `residentCellBoundaries` flag selects the new path for standalone edits to mounted compact, text-only TextBlocks. A view takes a lease on its content key. The first edit allocates one shared sequence of character Cells. Closing the last view releases the sequence and resolves the cold numeric representation. Opening another view, scrolling or saving does not create a text edit. The native file format still stores inclusive numeric offsets.

A Cell holds its Unicode code point, logical index, UTF-16 offset and an allocation serial. A selection replacement allocates the inserted Cells, looks up the owners of deleted endpoints, and moves the surviving suffix once. An equal-length replacement preserves surviving logical indexes. Zero-width points bind by affinity to a neighbouring Cell or a TextBlock-edge sentinel. Plain typing, one-block plain-text paste, selection deletion and committed IME input share the same splice command. Projected occurrences retain their own DOM and geometry. [Resident Cells](../../src/block-tree/resident-cells.ts) · [Command entry](../../src/block-tree/commands.ts) · [Renderer](../../src/rendering/standoff-editor-view.tsx)

The repository plans against a committed version, runs admission guards and publishes the splice, revisions, dirty notification and Undo record in one batch. A mounted renderer reads live endpoints. Numeric exports are detached and materialized when requested. History retains the annotation bindings and runs of allocation serials needed to reconstruct a particular revision after further edits or eviction. Annotation authoring with identical text can bind to the surviving Cells. [Repository](../../src/block-tree/repository.ts) · [Parity and bounded-work checks](../../src/block-tree/resident-cells.test.ts)

Mixed text/object hosts, unsupported historical range shapes, rich fragment insertion, cross-block edits and grouped transactions use their existing planners. Graph-changing operations invalidate the resident binding for the next text edit. A large single TextBlock still incurs whole-block allocation on its first edit and a potentially long suffix move near the start. Endpoint deletion can require rebuilding the ordered list of survivors. Fragmented editing histories retain more serial runs. Drawn annotations and explicit full-record subscribers can also add work to a keystroke.

### Real Flint measurements

Two fresh Chrome sessions per configuration ran 40 alternating insert/backspace events on the same 499-character native TextBlock. The numeric control used the same build with the flag off, including its linear inversion of annotation-origin hints. The table gives the range across the two runs. All 40 edits per resident run used the Cell commit path. Both configurations restored the original text and took zero repository snapshots. Heap growth is the change in process JavaScript heap after forced collection with the 40 Undo entries retained. Handler times measure synchronous input processing in headless Chrome on an Apple M1. Frame delivery and human typing speed have different measurement requirements. [Per-run measurements](../../experiments/lightweight-cells/resident-results.json)

| Annotations | Representation | Median handler (ms) | p95 handler (ms) | Heap growth (MiB) |
| ---: | --- | ---: | ---: | ---: |
| 18 | Numeric | 5.0–7.7 | 8.6–11.7 | 1.42 |
| 18 | Cells | 4.4–5.5 | 9.5–21.2 | 0.97 |
| 274 | Numeric | 12.7–15.2 | 27.6–28.2 | 3.17–3.18 |
| 274 | Cells | 7.5–8.7 | 11.0–13.2 | 0.40 |

Each bulk sample used one command and checked the resulting text and every range against the numeric mapper, then verified Undo. The table gives the median of 16 command timings per cell, in milliseconds. Paste inserted 192 characters, deletion removed a 190-character selection, and replacement exchanged that selection for 192 characters.

| Annotations | Representation | Paste | Delete selection | Replace selection |
| ---: | --- | ---: | ---: | ---: |
| 18 | Numeric | 6.9 | 12.3 | 17.6 |
| 18 | Cells | 6.1 | 7.8 | 12.4 |
| 274 | Numeric | 12.9 | 15.9 | 19.9 |
| 274 | Cells | 15.2 | 15.6 | 15.9 |

Dense typing showed the clearest improvement. The sparse Cell runs had lower median handler times and more variable tail latency, including a p95 of 21.2 ms. Dense paste took 15.2 ms with Cells and 12.9 ms with numeric ranges. The bulk command timings include mounted renderer work and hydration after Undo.

### Production model measurements

For a middle insertion into 1,000 characters followed by one annotation-bound lookup, the resident model took 0.027 ms with 18 properties and 0.028 ms with 1,000. The compact replacement planner took 0.110 and 3.567 ms. At 25,000 characters and 1,000 properties the resident median rose to 0.202 ms. Each figure is the median of 60 warmed Node samples. These timings isolate boundary maintenance and exclude repository publication, history recording and rendering.

With one million code points spread over 1,000 TextBlocks and ten ranges per block, retained model heap was 2.67 MiB with all blocks cold, 4.13 MiB with 20 resident blocks, and 73.65 MiB with all blocks resident. Each scenario ran in a fresh Node 22.12 process with garbage collection before and after construction. The active measurements include the actual resident model and a detached compact record view. Browser DOM, geometry and Undo storage are outside this experiment.

### Reproducing the integrated measurements

Run the compiler and benchmarks from the repository root. The browser comparison uses a fresh headless Chrome process for each invocation. The last argument labels the trial. The dense fixture adds 256 ranges to the same paragraph used in the native run.

```sh
mkdir -p artifacts/resident-cells
node_modules/.bin/esbuild experiments/lightweight-cells/model-bench.mjs \
  --bundle --platform=node --format=esm --outfile=artifacts/resident-cells/model.mjs
node --expose-gc artifacts/resident-cells/model.mjs production
BENCHMARK_CELL_MEASUREMENTS=1 node experiments/lightweight-cells/flint.mjs stock native 201
BENCHMARK_CELL_MEASUREMENTS=1 node experiments/lightweight-cells/flint.mjs resident native 201
BENCHMARK_CELL_MEASUREMENTS=1 node experiments/lightweight-cells/flint.mjs stock dense 201
BENCHMARK_CELL_MEASUREMENTS=1 node experiments/lightweight-cells/flint.mjs resident dense 201
```

The correctness suite checks clipping, point affinity, Unicode, historical reads, bulk suffix writes, admission vetoes, native capture after eviction, and simultaneous styling in two occurrences. The broader editor run had 1,222 passing tests and nine failures. All nine failures and the drag/drop event exception reproduced on the unchanged base commit `0a4128a`. The affected suites cover portable codec copies, block drag/drop, minimal type registration, window minimization, Page conversion, tab orientation and unknown-feature handling. [Model and repository tests](../../src/block-tree/resident-cells.test.ts) · [Mounted editor tests](../../src/rendering/compact-production.test.tsx)

## Original investigation

**A Cell can carry the cost of a position change once for every annotation that shares it.** The prototype implements that property for both single characters and bulk replacements. On a 1,000-character TextBlock with 1,000 ordinary annotations, inserting a character in the middle took 0.0030 ms in its resident Cell model. The current compact replacement function took 3.37 ms to prepare a complete content record. The two operations provide different publication and history guarantees. When the Cell implementation was made to supply the same numeric records to real Flint, the timing advantage largely disappeared.

**Recommendation.** Pursue a content-owned Cell sequence for actively edited TextBlocks as a bounded prototype. The next experiment should change the commit and read contracts together. Replacing the range-mapping loop alone leaves most of the dense-paragraph work in place. Keeping unopened text compact also matters: one million lightweight Cells were practical to allocate on this machine, but retaining them all cost about 52 MiB more JavaScript heap than keeping the same text and properties compact.

## What would change

The original editor gives each standoff property references to its first and last Cell, both inclusive. Reading either Cell’s current index gives the corresponding serialized position. Its insertion code knits new Cells into the sequence and reindexes the block; the array helper and its caller both invoke a full reindex. The proposed design preserves the reference semantics and uses one suffix pass per replacement. [Original property](../../src/library/standoff-property.ts#L243) · [Original insertion](../../src/blocks/standoff-editor-block.ts#L1127)

Current Flint stores code-point text spans and numeric property records on the canonical TextBlock. A replacement maps the properties, constructs new spans and sends a complete record with an inline splice and property-origin hints through the repository. The projection separately creates occurrence-local editing Cells. Those Cells are keyed for selection and DOM continuity; the same paragraph can appear in two views with different editing nodes. [Command entry](../../src/block-tree/commands.ts#L941) · [Compact replacement](../../src/block-tree/inline-sequence.ts#L46) · [Editing projection](../../src/block-tree/projection.ts#L26)

| Owner | Proposed responsibility |
| --- | --- |
| Repository, keyed by content | One resident Cell sequence per active TextBlock, shared by all occurrences. A plain text Cell needs its character value and current index. Its object identity suffices during residency. Keep image and alternative slots typed; each occupies one logical position. |
| Annotation store for that content | Preserve authored metadata and occurrence order. For each ordinary range, hold the first and last Cell. Index endpoint owners only at Cells that have endpoints. Use a distinct internal handle per property instance, including idless and duplicate-ID properties. |
| Each mounted occurrence | Own its DOM spans, selection, geometry cache and temporary SVG. Resolve the shared Cells to this occurrence. Removing one view must leave the other view and its annotations usable. |
| Cold TextBlock and native file | Keep compact spans and inclusive numeric endpoints. Hydrate once for the first editing occurrence. A cold read, search or Save can use the compact representation directly. |

**Index and identity have separate lifetimes.** A Cell’s index can change on any edit. Its object identity survives edits while resident. Across eviction or reload, the stable contract is the committed text, annotation instance and boundary meaning. If permanent JavaScript identity for *every* character until document close is desired, the all-Cells memory measurement below is the relevant comparison.

Storing a reference to the lightweight Cell on a mounted character span is compatible with this layout. A span can then serve hit-testing and drawing for its own occurrence. Using the span itself as the sole document boundary would couple the committed annotation to that view’s lifetime and leave two views with competing endpoints.

## One splice for typing, paste and deletion

Take a validated half-open replacement `[start, end)` in code-point slots. Retain inclusive first/last references for ordinary annotations. Convert browser UTF-16 offsets at the existing input boundary. Let `D = end − start`, `I` be the number of inserted slots, and `S = oldLength − end`.

1. Capture the removed slots and the two outside neighbours. Consult the reverse endpoint index for the deleted Cells only. Deduplicate affected annotation instances when both endpoints were deleted or many annotations share one endpoint.
2. If both endpoints were deleted, remove the ordinary annotation. If only its first endpoint was deleted, attach it to the first surviving suffix Cell. If only its last endpoint was deleted, attach it to the last surviving prefix Cell. An annotation that straddles the replacement retains both endpoints and includes the inserted content. Record changes to endpoint ownership and ordering for the inverse operation.
3. Allocate the inserted Cells once with final indices. If the length increases, shift the surviving suffix backwards through the array; if the length decreases, move it forwards. Assign each displaced Cell its new index during that move. Equal-length replacement writes zero surviving indices. Appending or deleting from the tail also writes zero surviving indices. Array capacity growth can still copy backing storage.
4. Publish one committed edit and one inverse. Announce inserted/removed slots, changed annotation membership and any boundary retargets. Ordinary shifted annotations continue to yield their positions through their two Cells. Reading one current range is constant work.

For a single replacement the model performs work proportional to inserted slots, deleted slots, endpoint ownership inspected on those deleted slots, and the surviving suffix **only when its positions change**. An insertion before ten thousand ranges can visit zero annotations. Deleting their shared boundary can legitimately touch all ten thousand. Rendering affected text still has separate costs. [Measured prototype](../../experiments/lightweight-cells/cells.mjs) · [Current range semantics](../../src/interchange/ranges.ts#L30)

**Edge behavior to preserve.** Inserting at a range’s start moves the first Cell and keeps the insertion outside. Inserting inside expands the visible range. Inserting immediately after the last Cell leaves it outside. A complete replacement of a range removes its annotation even when the replacement string has the same length or spelling. Code points include combining marks as separate logical slots; the input layer can still delete a grapheme as one multi-slot edit. No normalization is needed.

Zero-width annotations require a gap anchor with affinity. For explicit before-affinity, anchor after the preceding Cell; for after-affinity, anchor before the following Cell. Use start/end sentinels at the edges. On deletion, apply the current point-consumption rule; a consumed point can disappear. For omitted affinity, preserve the mapper’s length-dependent default, including at end-of-text, and preserve the stored `end=start` or `end=start−1` convention. Treat malformed/opaque imported properties using the existing reader’s behavior. The prototype qualifies ordinary valid ranges only. [Point rules](../../src/interchange/ranges.ts#L4) · [Existing compact point tests](../../src/persistence/compact-native.test.ts#L43)

## Measurements

Apple M1, 8 GiB RAM, arm64 macOS 27.2.1, Node 22.12.0, Chrome 158.0.8127.37; repository base `0a4128a`. No new package or production feature was installed. The checked-in [measurement data](../../experiments/lightweight-cells/results.json) contains per-case medians and p95s, per-browser-run summaries, bulk samples, work counters and individual heap trials.

### Range maintenance and model edit time

Medians below are **microseconds per single-character insertion**. Each cell of the table represents 32 timed samples after warm-up. Each trial starts from the same fixture, and the model execution order alternates. These are Node/V8 model timings. Creation of the initial state and result comparison are outside the timed section.

| Text length | Ranges | Edit position | Current compact replacement | Current range mapper alone | Simple numeric loop alone | Resident Cell edit | Export all Cell ranges |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 20 | middle | 104 | 33.2 | 1.33 | 2.21 | 0.79 |
| 1,000 | 1,000 | start | 3,350 | 1,514 | 4.79 | 4.00 | 32.38 |
| 1,000 | 1,000 | middle | 3,369 | 1,513 | 4.96 | 3.04 | 32.54 |
| 1,000 | 1,000 | end | 3,327 | 1,507 | 3.83 | 1.58 | 32.29 |
| 25,000 | 20 | start | 541 | 31.5 | 0.42 | 66.62 | 0.92 |
| 25,000 | 1,000 | middle | 3,877 | 1,498 | 4.21 | 36.25 | 37.21 |
| 120,624 | 1 | start | 2,265 | 2.96 | 0.75 | 326.63 | 0.54 |
| 120,624 | 1 | end | 3,353 | 3.58 | 0.96 | 5.17 | 0.62 |

**Interpretation.** The current compact function includes span assembly, payload/record cloning, range mapping and validation. The Cell column includes moving text and repairing endpoints in mutable memory. Export constructs numeric DTOs for every surviving range; it excludes deep history capture. The simple numeric control mutates ordinary numeric boundaries in place, without text movement, cloning, Undo or publication. Its 4.96 µs for 1,000 ranges shows how much the production mapper pays for work beyond index arithmetic. Conversely, at the start of a 120,624-character block, physically writing every surviving Cell index costs substantially more than updating one numeric range. The tested representation has no universal break-even annotation count.

| Bulk operation at slot 250 of 1,000, with 1,000 ranges | Current compact, µs | Cell edit, µs | Surviving index writes | Distinct ranges repaired or removed |
| --- | ---: | ---: | ---: | ---: |
| Backspace one slot | 3,317 | 26.9 | 749 | 2 |
| Paste 2,048 slots | 3,326 | 65.7 | 750 | 0 |
| Delete selection of 512 slots | 3,187 | 184.6 | 238 | 527 |
| Replace 512 with 1,536 | 3,214 | 233.8 | 238 | 527 |
| Replace 512 with 512 | 3,201 | 201.2 | 0 | 527 |
| Delete a selection containing all 1,000 coincident ranges | 3,056 | 207.6 | 238 | 1,000 |

Independent getter/setter probes on 500 unrelated endpoints observed **zero endpoint reads** for a paste, a deletion missing the endpoints, an equal-length replacement and an append. A paste of 2,048 characters at 250 caused exactly 750 writes to surviving character indices. Differential checks covered 3,286 edits against production `replaceCompact`, including all ranges and all replacement boundaries of a six-character block, duplicate IDs, successive seeded edits, Unicode and a 150,000-character paste. They checked text, bounds, property order, origins and identity of every surviving Cell. [Benchmark and correctness checks](../../experiments/lightweight-cells/model-bench.mjs)

### Typing in real Flint

Each timing below is in **milliseconds**. The main figure is the median of four independent Chrome-run statistics. Parentheses give their observed minimum and maximum. Each run timed 40 alternating insert/Backspace events at slot 100 of the same 499-character paragraph, with CPU sampling on. “Settled” includes the first microtask. The native fixture has 18 annotations; the dense fixture adds 256 valid unstyled ranges to the same paragraph. These are synthetic beforeinput dispatch timings in the real application; a separate CDP typing burst checks actual input and Undo. They do not measure physical keystroke-to-photon latency.

| Ranges | Implementation | Handler median | Handler p95 | Settled median |
| ---: | --- | ---: | ---: | ---: |
| 18 | Current compact | 6.0 (5.3–8.9) | 9.8 (8.3–12.6) | 8.7 (7.5–12.7) |
| 18 | Cell bridge | 6.0 (5.3–7.7) | 12.9 (9.5–18.0) | 8.5 (7.6–11.1) |
| 274 | Current compact | 16.3 (15.6–17.7) | 27.6 (22.8–36.9) | 19.1 (18.3–21.1) |
| 274 | Cell bridge | 15.9 (12.5–18.0) | 29.9 (25.6–38.7) | 18.7 (14.9–21.2) |

For bulk edits, the figures below are pooled median **synchronous command** times (32 samples per entry). Each trial restored the initial state with Undo and compared the resulting text and numeric annotation bounds, order and IDs against the production range oracle. These numbers include downstream work done before the command returns. They exclude OS clipboard parsing, the subsequent frame and Undo time. A revision mismatch after Undo may rebuild the experimental Cell sequence.

| Ranges | Implementation | Paste 192 slots | Delete 190 slots | Replace 190 with 192 |
| ---: | --- | ---: | ---: | ---: |
| 18 | Current compact | 6.5 | 24.8 | 30.5 |
| 18 | Cell bridge | 7.4 | 24.2 | 30.7 |
| 274 | Current compact | 12.9 | 31.9 | 14.1 |
| 274 | Cell bridge | 12.8 | 31.2 | 17.2 |

All 16 completed browser sessions restored the initial text, passed trusted-input Undo and bulk-edit assertions, and reported zero repository snapshots, service requests or worker starts during the timed typing loop. One additional stock browser launch timed out before sampling and was retried. The dense fixture made typing substantially more expensive in both modes. The observed distributions do not establish a repeatable overall improvement from the bridge. In the first dense runs, both CPU profiles still sampled cloning, Solid reconciliation and browser range/geometry work. That identifies remaining costs without assigning all the difference to a single subscriber.

A Vite-only adapter runs the same Flint benchmark in two modes. Stock invokes the production implementation. The Cell bridge uses the resident sequence to derive the endpoints and returns the complete numeric property list required by the existing commit API. Both retain production cloning, validation, history, Solid publication, mounted views, SVG decoration and caret work. The bridge is a single-repository sequential experiment; its optimistic revision cache is unsuitable for rejected transactions, eviction or concurrent planners. Browser checks verify the candidate handled every timed edit. [Flint adapter](../../experiments/lightweight-cells/flint.mjs) · [Main typing harness](../../scripts/benchmark-flint-typing-browser.mjs)

### Retained memory and materialisation

One million ASCII characters across 1,000 TextBlocks, with ten ordinary ranges per block. Each measurement builds its fixture in a fresh Node process. Medians of three processes per configuration are shown. Heap deltas are measured after forced collection. Build times include constructing the synthetic source. These are model allocations, excluding DOM, Solid projections, Undo history, native capture and peak allocation during a large edit.

| Representation | Retained JS heap delta | RSS delta | Build time |
| --- | ---: | ---: | ---: |
| All blocks compact | 2.70 MiB | 10.33 MiB | 10.6 ms |
| Compact records plus Cell sequences for 20 blocks | 3.80 MiB | 12.44 MiB | 12.5 ms |
| All blocks represented by lightweight Cells and endpoint owners | 55.09 MiB | 91.52 MiB | 97.7 ms |

The first and third rows hold comparable text and range payloads. The middle row deliberately retains both forms for the 20 active blocks. It is a residency scenario, not a measured browser memory saving. Actual residency depends on TextBlock sizes, repeated occurrences, editing pins and history retention. Existing eligible viewport flows mount whole TextBlocks; one million-character TextBlock would still be materialised as a unit. [Viewport qualification](MUTABLE_DOM_EDITOR_VIRTUALISATION_QUALIFICATION.md#measured-comparison)

## Integration plan

1. **Separate querying a boundary from enumerating all annotations.** Introduce a content-scoped range reader for one property instance, an ordered enumeration for explicit capture, and change notifications for definition, membership, retarget and text splice. Migrate callers that directly read `payload.standoffProperties`. Keep bulk numeric export for native interchange and cold data. Browser-local getters inside a JSON record are insufficient: cloning materialises their values, and old revisions cannot share a mutable index. [Mounted annotation identities](../../src/runtime/annotation-identities.ts) · [Current renderer reads](../../src/rendering/standoff-editor-view.tsx#L352)
2. **Give repository transactions ownership of the edit.** Add a validated inline splice operation carrying the expected content and inline revision, removed/inserted slots, affected endpoints, annotation origins where needed and an inverse. Plan from the committed version without mutating live Cells. Validate preimages, point policies, ownership and bounds before publication. Apply text, endpoint ownership, revision, dirty state and notifications atomically; discard a stale or failed plan. An inverse retains removed content and affected attachments or a compact reconstruction recipe, including ordering. Keep historical reads independent of mutable current Cell objects. Undo/Redo must restore both content and annotation topology across intervening mount/eviction. Deep-copying the entire record on this path reintroduces the cost measured above. Existing inverse construction also searches the origin array once per prior property, which can be quadratic. A linear inverse-origin index is a useful numeric control in the next comparison. [Commit validation](../../src/block-tree/repository.ts#L575) · [Inverse builder](../../src/block-tree/repository.ts#L92) · [History contracts](../../src/persistence/compact-native.test.ts#L17)
3. **Define hot and cold committed states.** Use the same range reader in both. A resident content handle owns the live sequence and its annotation attachments at a specific revision. Cold content owns compact spans and numeric ranges at its revision. A first mount hydrates; multiple views lease the same content handle and keep separate presentation nodes. When the last lease expires, prepare a revision-tagged compact representation and swap only if the revision and lease count still match; retain the valid resident state until then. Coalesce rapid viewport churn and measure eviction cost. An unmounted edit may use the cold mapper. Save/search/export must be able to read the current committed answer in either state. Manual Save serializes a pinned revision; scrolling or converting representations must never publish an edit, create Undo, set dirty or save. Exact history, if supported for the source format, must retain replayable preimages; preserve existing format-specific limits. [Projection lifecycle](../../src/block-tree/projection.ts#L26) · [Native capture](../../src/persistence/native-resource.ts#L27) · [Wire encoding](../../src/history/stage-c-gates/portable.ts#L58)
4. **Move the actual consumers onto deltas.** Avoid replacing every property object or deriving every annotation’s style when text moves. Apply splices to mounted occurrences, remeasure wrapping and affected annotation geometry using existing frame-batched caches, and preserve caret/selection and temporary SVG ownership. A range whose endpoints both survive may still cover the edited line; discover affected decoration work through an overlap query or the renderer’s invalidated region. The sparse endpoint-owner map alone cannot answer containment queries. Recompute backlinks only for genuine entity/reference membership changes. Resolve current ranges on navigation. Audit Save, search, indexing, Gloss and unmounted consumers before removing the numeric compatibility adapter. [Projection publication](../../src/block-tree/projection.ts#L38) · [Renderer derivations](../../src/rendering/standoff-editor-view.tsx#L358) · [Backlinks reader](../../src/application/canonical-backlinks.ts#L117)
5. **Use the shared operation at every edit entry point.** Keyboard input, selection delete, one-block paste, and committed IME use one replacement each. Copy reads the selected half-open range, clips annotations and emits fragment-relative positions. Pasting the fragment allocates fresh destination Cells and binds its ranges once. Rich and cross-block paste additionally own definitions, images, alternatives and occurrence IDs. Split/join/cross-block deletion clip or split crossing ranges with the current identity rules and atomically update affected owners and indices; retain the existing broader graph checks for ownership changes. Keep multi-caret source order and preimage conventions explicit. Coalesce disjoint edits whose positions share a preimage into one ordered rebuild per affected block where valid. A sequential Scry/IME edit log can contain overlapping, later-version coordinates and requires composition or ordered replay. Provisional IME/Scry presentation stays local until commit. [Clipboard planner](../../src/interchange/insertion.ts#L45) · [Cross-block edits](../../src/block-tree/cross-text-edit.ts#L20) · [Provisional commands](../../src/block-tree/commands.ts#L65) · [IME](../../src/rendering/compact-composition.ts)

## Decision for a production trial

The first production-shaped experiment should cover ordinary text plus session Undo/Redo, two views of the same content, cold/hot transitions, and a single atomic bulk replacement. Use a feature flag for an integrated trial; preserve the existing admission and native-file defaults during comparison. Keep a lean numeric-delta comparator so an improvement from removing full-record cloning is attributed correctly.

To justify adoption, require semantic parity with the current range oracle, including points, Unicode, image/alternative slots, cross-block edits, multi-caret paste, property ordering/identity and undo across eviction. Exercise failure before publication, stale asynchronous paste and interrupted IME. Verify save/reopen equivalence with no view mounted, including unknown authored metadata. Measure real Flint sparse/dense and long/short cases, first mount, scroll, heap with history retained, Save, and post-eviction reclamation. For ordinary insertions assert zero unrelated document/property inspection, snapshots, vault reads, backlink rebuilds and unchanged DOM writes; count suffix updates and layout reads separately. The isolated Cell model demonstrates the boundary algorithm. The remaining decision is whether removing eager downstream enumeration pays for its memory and lifecycle costs in the application.

## Reproduce the study

Run from the repository root with its installed dependencies and Node 22.12.0. The model benchmark generates all its fixtures. The browser harness reads the same local native letter as the existing Flint benchmark, and writes its dense derivative and evidence under the ignored artifacts directory. The original fixture SHA-256 was `d4d3546c61429a6ddef068a551670a65b1a0d73fb2592dee42a7711aede6ade8`. On a checkout without the local letter, set `BENCHMARK_DOCUMENT_PATH` to a native fixture with a mounted plain-text paragraph of at least 240 code points and ordinary ranges; timings will describe that fixture instead. The experiment does not open a user vault for writing.

```sh
mkdir -p artifacts/lightweight-cells
node_modules/.bin/esbuild experiments/lightweight-cells/model-bench.mjs \
  --bundle --platform=node --format=esm --outfile=artifacts/lightweight-cells/model-bench.mjs
node --expose-gc artifacts/lightweight-cells/model-bench.mjs > artifacts/lightweight-cells/model.json

node experiments/lightweight-cells/flint.mjs stock native 1
node experiments/lightweight-cells/flint.mjs cells native 1
node experiments/lightweight-cells/flint.mjs stock dense 1
node experiments/lightweight-cells/flint.mjs cells dense 1
```

The last argument labels the trial. Use a fresh browser per run, alternate order across trials and run timing jobs sequentially. Each browser run retains its CPU profile, screenshot, typing summary and bulk samples locally. None of those screenshots or native document text are included in the results file.
