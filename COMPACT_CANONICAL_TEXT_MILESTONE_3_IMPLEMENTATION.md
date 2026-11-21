# Compact Canonical Text — Milestone 3 Implementation

## Decision and scope

Implemented a production path in the existing canonical repository, native persistence, Flint editor and application services. A real native `.ink` document can be admitted, opened in Flint, edited, undone/redone, manually saved, closed and reopened without canonical character Cells. The legacy native reader can reopen the saved file.

**`compactCanonicalText` is enabled by default following user acceptance on 2026-11-20.** Explicit opt-out retains legacy loading. This acceptance changes the rollout decision; the measured results and documented peripheral/history limitations below remain applicable. No separate architectural qualification is needed for this implementation.

## Production changes and repository contract

- `ContentRecord.compactInline = {version: 1, spans}` distinguishes compact standoff text from legacy `inlineContent` placements. Typed spans are text or inline images; an image occupies one logical position. Text positions count Unicode code points. Compact records have no authoritative `payload.text` and no canonical inline Cell placements.
- `block-tree/inline-sequence.ts` supplies logical sequences, streaming units, lengths, slices, replacement and range clipping. Canonical search, counts, knowledge facts, backlinks, live entities, spatial previews, interchange serialization and explicit Markdown export read this interface. Bounded preview readers stream rather than visiting the entire legacy sequence.
- Existing `CanonicalRepository.commit` remains the sole transaction and publication boundary. Ordinary compact replacement submits one affected `put-content` record containing both text and rebased annotations. The existing inline commit path captures inverse records, validates identity, publishes atomically and notifies the existing subscribers. It does not clone or validate the whole document.
- Optional `inlineSplice` is a validated projection-continuity hint, not another authority. The repository verifies it against the before and after canonical spans and derives its inverse. Unaffected editing Cell identities survive ordinary edits and Undo/Redo.
- Content and inline revisions remain monotonic through Undo/Redo. Existing standoff representation changes are rejected. Graph-edge changes and image-object changes use the existing structural/full planner, preserving its ownership and reference checks.
- Split/join and cross-Block replacement use affected records and indexed ownership/reference evidence. Unsupported mixed representations, shared paragraph structural edits and attachment-losing merges reject before publication. Shared-content ordinary edits publish to all mounted occurrences.
- The fast path is bounded by affected text, annotations and mounted occurrences. It is not a rope or a constant-time text engine: affected paragraph spans/ranges still require copying and validation. Explicit Save, admission and structural changes may perform broader validation.

## Flint editing and presentation

`BlockTreeProjection` creates structural compact projections without per-character nodes. The existing `StandoffEditorView` acquires eager occurrence-local editing Cells when mounted and releases them when unmounted. These derived nodes are excluded from canonical content/placement indexes. The existing renderer, DOM selection, geometry caches, measurement, focus and SVG annotation decorations remain in use.

The existing input gateway handles insertion, deletion, grapheme-aware Backspace/Delete and paragraph commands. Compact paragraph splitting, joining, cross-Block replacement, annotation edits and inline images use canonical commands. There is no replacement editor or second general-purpose input gateway.

`compact-composition.ts` attaches to the existing mount/gateway composition hooks. Browser provisional DOM remains local until one atomic replacement at composition end. Composition beside an image is supported. An image-overlapping selection or intervening canonical source revision rejects with a visible notice, restores affected DOM and retains the composed text in the notice. Empty/cancelled composition does not commit. Concurrent composition is conservatively rejected, not automatically rebased. Legacy composition semantics are unchanged.

`compact-selection-history.ts` retains small directional selection bookmarks alongside existing commit IDs. It preserves anchor/head direction, affinity, occurrence identity and valid selection restoration after the renderer/caret queue. It captures no document or editing Cell graph and stops queued restoration after disposal or a superseding revision.

### Compatibility decisions

| Feature | Compact behavior |
|---|---|
| Plain text typing/paste, selection, annotations, split/join, cross-Block replacement | Existing services with compact canonical commands |
| Two mounted occurrences | Independent presentation Cells observing the same committed content |
| Inline images | Typed canonical objects; existing image rendering and metadata commands |
| Image insertion range rebasing | Logical insertion semantics, as for text, **only in compact mode**; legacy behavior retained |
| Zero-width annotations | Both stored forms (`end=start` and `end=start-1`) retained; equivalent point behavior without normalizing stored endpoints |
| Image command result | Legacy placement key or explicit revision-checked `CompactInlineAddress`; no fictitious canonical image Cell |
| Rich clipboard insertion | Explicit rejection before mutation; reopen through legacy for this operation |
| Multicaret editing | Explicit rejection in gateway and programmatic service; legacy remains available |
| Alternatives/superpositions and unsupported Block modes | Whole-document legacy admission |
| TEI presentation modes | Allowed; existing mode continuation/split guards still apply |
| Phosphor screen/Thesis application structures | Legacy admission |
| Linked definitions/references and image asset metadata | Native preservation and existing ownership checks; no background asset migration |
| Provisional completion | Text and final entity annotation committed together through existing command history |
| Persistent compact history / historical compact Block restore | Explicit rejection; session Undo/Redo supported |

Managed-asset workflows, all clipboard variants, alternatives editing and all platform IME implementations are not claimed fully qualified. No unsupported operation silently converts a live document into canonical Cells. Use a legacy-opened session when those features are required.

## Native admission, manual Save and rollout

The flag is declared in `src/configuration.ts` and defaults to `true`. Opt out in a new `ReactiveEditor` or `WorkspaceSession` configuration with `{features:{compactCanonicalText:false}}`. The repository records the admission policy; the flag does not convert already-open content. Native admission performs compatibility checks before selecting compact or legacy representation for the document.

Native files already contain compact text spans. `decodeNative`/the semantic native codec now admit eligible spans directly, with no intermediate canonical character graph. The wire format, native filenames and authored unknown metadata remain unchanged. Image properties, references and structural ownership participate in native resource validation.

Capture serializes committed canonical spans directly and works with no editing occurrence mounted. The existing native session and `ResourcePair` perform manual Save, generation checking, collision handling and recovery. No Save-time flush from presentation Cells was added. Dirty state remains the existing cheap per-document state during editing. No automatic Save or Markdown sidecar was introduced.

Turning the flag off for the next session selects the existing native reader and preserves saved edits. Historical Cell-keyed files and operations are not reinterpreted or migrated.

## History boundary

Ordinary compact editing uses the repository's existing in-memory Undo/Redo stack and inverse `put-content` operations. Exact capture uses the existing **whole `record-content` before/after** fallback for compact records; compact spans are deliberately not added to the legacy field-patch/Cell-splice vocabulary. Replay checks its original preimage and rejects a mismatched replay.

Old Cell-keyed exact-history readers, snapshots and replay semantics remain intact. Persistent compact enrollment is explicitly rejected before starting its Worker, including enrollment before the first compact document is admitted. Historical Block restore of compact records is also rejected. A new persistent compact archive format and migration are outside this integration slice; no old operation is silently assigned compact semantics.

## Correctness and bounded-work evidence

New coverage includes:

- Native admission, one atomic publication, zero canonical Cells, unmounted capture and legacy byte-equivalent reopening.
- Affected-record text mutation and Undo/Redo with a throwing snapshot spy, zero reads of an unrelated payload and one-record change sets.
- Unicode/image logical slicing, monotonic revisions, exact-history preimages and refusal of live representation changes.
- Both zero-width endpoint forms across insert/split/join and invalid replacement rollback.
- Real renderer shared occurrences, retained unaffected DOM identity and zero unrelated DOM mutations.
- Split/join/cross-Block replacement with a throwing full-snapshot spy.
- Inline images, mixed-object composition, grapheme deletion and rejected composition DOM restoration.
- Backward selection, affinity and occurrence restoration through Undo/Redo.
- Atomic provisional text/entity completion.
- Native manual Save/reopen in both representations, dirty tracking, no background Save and no extra Markdown files.
- Full Flint application load → actual `beforeinput` edit → Undo/Redo → manual native Save → Document-tab close → fresh Flint session reopen.
- Lost Save acknowledgement recovery with newer edits retained dirty, plus stale-client collision rejection.

The final focused run passed **62/62 tests in six files**, including the full Flint workflow and compact recovery/collision test. [Focused results](artifacts/compact-canonical-m3/validation/focused-tests.log).

The broader repository/rendering/history run passed 390 of 394 tests. Two integration failures found in that run (selection-history disposal and the close-tab test target) were corrected and pass in the final focused run. The other two failures are pre-existing portable-spike copy tests rejecting `placementId` as an unsupported structural field; both reproduce on an isolated clean checkout of baseline `15211e9` (29 pass, two fail). They are not claimed fixed. [Broad run](artifacts/compact-canonical-m3/validation/broad-tests.log), [clean-baseline reproduction](artifacts/compact-canonical-m3/validation/baseline-portable-tests.log).

Both application and server TypeScript checks pass (`npm run typecheck`), the production harness build passes, and `git diff --check` is clean. [Typecheck log](artifacts/compact-canonical-m3/validation/typecheck.log).

Browser measurements use the production application harness, not the detached compact proof of concept.

## Performance methodology

Machine: Apple M1, macOS 15.5. The full lifecycle harness builds the production bundle and runs headless Chrome with fresh temporary profiles. Each lifecycle sample includes worker TEI preparation, native admission, candidate registration, Flint opening/rendering, typing, metadata activation when present, native capture, Save coordination, native decode/reopen and Undo/Redo. Compact and legacy runs use identical fixtures on the same machine, sequentially without simultaneous test/build workloads.

The populated fixture admits three additional 8,000-character documents and opens two before measuring the large WeGA letter. Lifecycle typing selects the first mounted TextBlock longer than ten logical units; these samples must not be interpreted as fixed-length paragraph benchmarks. The separate synthetic fixtures explicitly contain single paragraphs of 500, 1,500, 3,000 or 10,000 characters and determine the length-based typing gates. The separate single 120,624-character paragraph has a full-span bold annotation; restoration checks canonical text and annotation equality. It is a correctness/stress measurement, not a latency gate.

Typing samples alternate insert and Backspace. Synchronous timing covers event dispatch. The reported “settled” metric samples at the first awaited microtask boundary, including the existing queued caret work; it is not an all-background-work idle detector. Display timing waits for two animation frames. These headless frame measurements are diagnostic, not a guarantee of physical input-to-display latency. Heap deltas are retained JavaScript heap after collection, not total process memory or allocation totals. Cell allocation probes distinguish canonical Cells from mounted editing Cells and legacy workspace-shell labels.

Save timing exercises the production `ResourcePair` capture/serialization/generation coordinator with an in-memory transport; it excludes disk/network latency. Real temporary HTTP server persistence, collision and recovery are separately exercised by integration tests. Native reopening timing here measures decode/validation; the full Flint reopen workflow is tested separately.

## Full-Flint comparative results (2026-11-20)

Chrome 157.0.8103.80. Three completed lifecycle samples per fixture per mode. Tables show **legacy → compact**, milliseconds unless stated. Phase values are medians of the three runs. The legacy batch timed out during its third anthology sample; the seven missing samples were rerun in a fresh browser, and that retry is marked in the combined evidence. Failed/incomplete timing is not substituted with a zero or included in these medians.

[Compact raw results](artifacts/compact-canonical-m3/final-compact/flint.json), [legacy combined results with retry provenance](artifacts/compact-canonical-m3/legacy-combined.json), [legacy original batch](artifacts/compact-canonical-m3/final-legacy/flint.json), [legacy retry](artifacts/compact-canonical-m3/legacy-retry/flint.json).

### Complete lifecycle

| Fixture | Admission | Candidate | Flint open/render | End-to-end usable | Metadata |
|---|---:|---:|---:|---:|---:|
| Small WeGA | 229.8 → 14.6 | 40.7 → 2.0 | 82.2 → 51.7 | 390.1 → 105.3 | 66.6 → 82.9 |
| Large WeGA | 1,118.3 → 26.1 | 224.3 → 3.2 | 483.4 → 386.7 | 1,872.5 → 463.7 | 132.7 → 152.9 |
| Anthology 58,614 | 4,432.1 → 107.3 | 868.4 → 11.2 | 2,021.4 → 1,468.3 | 7,483.1 → 1,667.9 | 349.1 → 399.0 |
| Extended 120,624 | 9,961.1 → 223.9 | 2,259.6 → 23.4 | 4,477.2 → 3,243.3 | 16,649.7 → 3,613.6 | 753.0 → 781.6 |
| Populated workspace | 1,504.6 → 26.0 | 307.4 → 3.1 | 540.5 → 395.8 | 2,404.3 → 470.4 | 133.0 → 166.1 |
| Paragraph 500 | 43.9 → 2.5 | 6.3 → 0.3 | 27.3 → 21.4 | 115.7 → 53.7 | — → — |
| Paragraph 1,500 | 114.0 → 2.5 | 19.7 → 0.3 | 54.7 → 47.2 | 219.4 → 79.2 | — → — |
| Paragraph 3,000 | 219.6 → 3.1 | 34.8 → 0.4 | 92.1 → 88.5 | 404.5 → 121.6 | — → — |
| Paragraph 10,000 | 630.8 → 2.5 | 116.0 → 0.4 | 271.9 → 252.1 | 1,049.9 → 285.4 | — → — |

### Persistence, memory and canonical allocation

| Fixture | Capture | Save coordinator | Decode/reopen | Retained heap delta, MiB | Canonical text Cells |
|---|---:|---:|---:|---:|---:|
| Small WeGA | 60.7 → 5.4 | 147.7 → 11.6 | 36.1 → 6.4 | 20.6 → 7.9 | 3,271 → 0 |
| Large WeGA | 339.7 → 9.7 | 765.2 → 21.5 | 188.3 → 15.1 | 91.0 → 13.2 | 17,283 → 0 |
| Anthology 58,614 | 1,457.8 → 36.6 | 3,268.1 → 75.3 | 751.7 → 56.5 | 298.7 → 31.6 | 58,614 → 0 |
| Extended 120,624 | 3,956.4 → 80.9 | 8,075.6 → 170.6 | 1,827.9 → 107.6 | 609.1 → 58.9 | 120,624 → 0 |
| Populated workspace | 436.2 → 10.0 | 1,191.2 → 27.1 | 185.4 → 13.2 | 152.2 → 14.4 | 17,283 → 0 |
| Paragraph 500 | 10.7 → 0.8 | 25.2 → 3.3 | 5.1 → 0.6 | 3.9 → 2.1 | 500 → 0 |
| Paragraph 1,500 | 22.9 → 0.5 | 64.4 → 2.2 | 13.5 → 0.4 | 8.9 → 3.8 | 1,500 → 0 |
| Paragraph 3,000 | 46.7 → 0.5 | 124.0 → 2.1 | 27.3 → 0.4 | 16.6 → 6.4 | 3,000 → 0 |
| Paragraph 10,000 | 173.4 → 0.7 | 438.0 → 2.2 | 96.3 → 0.5 | 51.0 → 18.0 | 10,000 → 0 |

All compact samples allocated **zero canonical character Cells** during admission and diagnostic reopening. Legacy allocation probes count two copies of each fixture’s character Cells (admission plus measured reopen). Eager editing Cell/DOM allocation still occurs on mount; legacy shell labels are outside the imported document and are excluded from the document Cell counts. Retained heap is measured after the complete sample, including mounted metadata and session history.

### Input and Undo/Redo

Each run contains 20 alternating insert/delete events. Entries are **median of run medians / worst run p95**. These are not pooled percentiles. Each cell again reads legacy → compact.

| Fixture | Synchronous | Settled microtask boundary | Two-frame display diagnostic | Undo median | Redo median |
|---|---:|---:|---:|---:|---:|
| Small WeGA | 3.6 / 7.2 → 2.6 / 6.5 | 5.7 / 8.9 → 4.4 / 8.2 | 33.3 / 34.3 → 33.2 / 34.2 | 1.1 → 0.5 | 0.8 → 0.4 |
| Large WeGA | 1.2 / 2.9 → 1.1 / 2.1 | 4.7 / 11.5 → 4.6 / 6.8 | 33.3 / 34.4 → 33.3 / 34.3 | 0.7 → 0.4 | 0.2 → 0.2 |
| Anthology 58,614 | 1.2 / 6.4 → 1.0 / 1.2 | 17.7 / 23.6 → 17.6 / 18.0 | 33.5 / 133.7 → 33.3 / 50.6 | 2.3 → 0.5 | 0.4 → 0.2 |
| Extended 120,624 | 1.3 / 12.8 → 0.9 / 1.3 | 36.9 / 77.2 → 36.9 / 37.4 | 50.0 / 207.4 → 49.4 / 111.5 | 5.9 → 0.5 | 0.3 → 0.2 |
| Populated workspace | 1.2 / 3.8 → 1.1 / 1.7 | 4.7 / 8.2 → 4.8 / 7.0 | 33.3 / 52.8 → 33.3 / 34.4 | 0.8 → 0.4 | 0.3 → 0.2 |
| Paragraph 500 | 3.9 / 5.3 → 3.3 / 5.0 | 5.5 / 7.1 → 5.3 / 7.3 | 33.3 / 34.4 → 33.3 / 34.3 | 3.4 → 3.1 | 2.5 → 2.2 |
| Paragraph 1,500 | 9.6 / 17.2 → 6.1 / 11.0 | 12.8 / 22.6 → 9.3 / 14.2 | 33.4 / 50.7 → 33.3 / 34.4 | 8.3 → 4.4 | 7.4 → 4.0 |
| Paragraph 3,000 | 18.4 / 38.3 → 11.1 / 13.1 | 24.1 / 44.4 → 16.5 / 18.6 | 33.6 / 65.9 → 33.3 / 40.7 | 15.7 → 9.0 | 15.7 → 8.1 |
| Paragraph 10,000 | 61.0 / 97.2 → 38.2 / 63.1 | 77.8 / 117.5 → 54.1 / 80.2 | 105.1 / 150.9 → 83.0 / 107.9 | 50.8 → 29.2 | 51.0 → 29.5 |

Every completed sample restored its typed text, published admission once and reported **zero snapshots during admission and typing**. Dedicated paragraph fixtures satisfy every compact synchronous target in all three runs: 500 and 1,500 characters under 10/25 ms; 3,000 under 20/50 ms; 10,000 under 50/100 ms.

Repeated compact usable-text results are **105–146 ms for small WeGA** and **448–471 ms for large WeGA**: both letter release targets pass on this machine. Metadata activation for those letters is **83–100 ms** and **150–166 ms**, respectively. The anthology metadata medians are approximately **399 ms** and **782 ms**, so a universal under-250-ms metadata target is **not met**. Extended-document usable text remains about 3.6 seconds despite much cheaper admission; eager presentation and layout are still substantial.

### Single 120,624-character stress paragraph

One run per mode, two events per run (insert/delete), with a full-span bold annotation. Both modes passed canonical text/annotation restoration, native reopen, and zero typing-snapshot assertions without crashing. The input columns show the **larger observed event**, not a statistically meaningful p95. There is no latency gate for this fixture.

| Mode | Admission | Usable text | Sync maximum | Settled maximum | Two-frame maximum | Capture | Save coordinator | Undo | Redo | Retained MiB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| legacy | 9,258.5 | 15,349.0 | 2,139.5 | 2,480.0 | 2,792.4 | 2,980.6 | 7,486.0 | 1,124.7 | 922.6 | 602.0 |
| compact | 9.1 | 3,337.6 | 653.4 | 908.3 | 1,165.8 | 1.0 | 3.1 | 471.7 | 461.6 | 201.6 |

Compact retained zero canonical character Cells; legacy retained 120,624. Eager presentation/selection remains expensive for this exceptional paragraph. No virtualization or replacement layout engine was introduced. [Compact stress evidence](artifacts/compact-canonical-m3/stress-compact/flint.json), [legacy stress evidence](artifacts/compact-canonical-m3/stress-legacy/flint.json).

### Ordinary native `.ink` typing

The existing real Flint/Vite typing harness used an in-memory copy of `vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink`, with eight paragraphs and a 499-character measured paragraph. This is one matched pair of 40-event runs with CPU profiling, plus the harness’s actual CDP input/Undo checks. It is separate from the production-bundle lifecycle runs. No user vault was written.

| Mode | Sync median / p95 | Settled median / p95 | One-frame median / p95 |
|---|---:|---:|---:|
| legacy | 6.7 / 10.8 | 8.8 / 14.1 | 16.4 / 84.1 |
| compact | 6.5 / 15.3 | 9.1 / 18.4 | 18.0 / 112.7 |

Both runs restored the text and reported **zero snapshots, status reads, Worker starts and service requests during typing**. Both synchronous results meet the ordinary paragraph target; compact p95 was higher in this single native pair. Headless frame tails remain diagnostic and should not be treated as guaranteed visible latency. [Compact native results/profile](artifacts/compact-canonical-m3/native-compact/results.json), [legacy native results/profile](artifacts/compact-canonical-m3/native-legacy/results.json).

## Reproduction

Use Node 22 (the installed system Node is too old for this harness):

```sh
export PATH=/Users/iianneill/.nvm/versions/node/v22.12.0/bin:$PATH
NODE_OPTIONS=--max-old-space-size=12288 node scripts/cell-materialisation/build.mjs
python3 -m http.server 3110 --bind 127.0.0.1 --directory artifacts/cell-materialisation/site
```

In another shell, run each mode sequentially:

```sh
CELL_FLINT=1 CELL_COMPACT=1 CELL_RUNS=3 CELL_FIXTURES=small,large,anthology,extended,populated,ordinary,long,verylong,exceptional CELL_OUTPUT=artifacts/compact-canonical-m3/final-compact node scripts/cell-materialisation/inspect-browser.mjs
CELL_FLINT=1 CELL_COMPACT=0 CELL_RUNS=3 CELL_FIXTURES=small,large,anthology,extended,populated,ordinary,long,verylong,exceptional CELL_OUTPUT=artifacts/compact-canonical-m3/final-legacy node scripts/cell-materialisation/inspect-browser.mjs
CELL_FLINT=1 CELL_COMPACT=1 CELL_RUNS=1 CELL_FIXTURES=stress CELL_OUTPUT=artifacts/compact-canonical-m3/stress-compact node scripts/cell-materialisation/inspect-browser.mjs
CELL_FLINT=1 CELL_COMPACT=0 CELL_RUNS=1 CELL_FIXTURES=stress CELL_OUTPUT=artifacts/compact-canonical-m3/stress-legacy node scripts/cell-materialisation/inspect-browser.mjs
BENCHMARK_COMPACT=1 BENCHMARK_OUTPUT=artifacts/compact-canonical-m3/native-compact node scripts/benchmark-flint-typing-browser.mjs
BENCHMARK_COMPACT=0 BENCHMARK_OUTPUT=artifacts/compact-canonical-m3/native-legacy node scripts/benchmark-flint-typing-browser.mjs
```

## Default enablement and remaining work

The user accepted the changes and authorised default enablement on 2026-11-20. The flag is now **on**. Canonical authority and the ordinary native workflow are implemented and tested. Broader platform IME qualification and peripheral-operation coverage remain follow-up work; persistent compact history, rich clipboard insertion and multicaret editing retain their documented safe rejection behavior. Full-Flint timing results above determine which performance gates pass; exceptional single-paragraph latency is tracked separately.

Default-enablement validation passed 50 tests across native admission/session persistence, compact rendering, bounded inline editing and durable-history compatibility. The full Flint open/edit/Undo/Redo/Save/close/reopen test and compact rendering tests now use the application default without a compact feature override. Explicit opt-out and unsupported-document legacy fallback remain covered.

| Default-enable gate | Evidence and disposition |
|---|---|
| 1. Canonical authority | Passed for the integrated slice: existing repository, atomic text/ranges, shared occurrences, no canonical character graph or editing flush |
| 2. Ordinary editing | Covered by production integration tests; mixed-object composition qualified for the documented cases, with broader platform IME/peripheral coverage still pending |
| 3. History compatibility | Session Undo/Redo and exact-record semantics tested; old readers retained; persistent compact enrollment and historical compact Block restore safely unavailable |
| 4. Native fidelity | Real native open/Save/reopen, unmounted capture, legacy reopening, dirty tracking, collision and lost-acknowledgement recovery tested |
| 5. Performance | Full-Flint measurements recorded above; ordinary paragraph targets and letter lifecycle targets evaluated separately from larger-document metadata and exceptional layout |

Further work should remain bounded: qualify those compatibility boundaries, reduce remaining eager editor-opening/metadata costs where measured, and extend browser-level input testing across target platforms. No viewport virtualization, replacement renderer or new canonical authority is proposed.
