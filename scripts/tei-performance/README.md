# TEI import performance qualification

## M2 and compact canonical text

The Flint command now passes the compact flag explicitly: `TEI_COMPACT=1`
(the benchmark default) verifies **zero canonical character Cells in the imported
resource** and zero worker canonical records. The workspace can already contain
legacy startup text; its total Cell count is not the imported resource count.
`TEI_COMPACT=0` retains historical legacy admission comparisons. In particular,
use `TEI_COMPACT=0` with `TEI_EXPECT_BASELINE=1` for the original remediation build.
The former script omitted the argument and thereby selected the harness's
legacy default despite the merged application's default being compact.

`TEI_CASES=semantic` additionally measures the invented M2 fixture. The Flint
harness includes native capture, the existing manual-save coordinator with an
in-memory sink, exact native reopening and Undo/Redo timings. It performs twenty
insert/delete events per case, including the anthology; `sync`, `settled` and
`display` distinguish handler, microtask and frame intervals. `metadataSyncMs`
separates synchronous tab switching (including retained-panel movement and focus) from the complete
Metadata interval. These fields supersede the earlier six-event probe description
below. No benchmark saves user files.

M2 evidence: `m2-merged-baseline.json` and `m2-final.json` in
`artifacts/tei-performance/`. The original remediation and native-admission
sections below describe their historical measurements, not the merged baseline.

An isolated production-build harness using the actual interchange worker, native
object-bank admission, application views, Cell editor, and native metadata tabs.
It never opens a user workspace or saves a document. No online reference lookup.

```sh
NODE_OPTIONS=--max-old-space-size=8192 node scripts/tei-performance/build.mjs
python3 -m http.server 3108 --bind 127.0.0.1 --directory artifacts/tei-performance/site
# In a separate shell, after the build and other test jobs have finished:
TEI_FLINT=1 TEI_RUNS=3 TEI_LABEL=after node scripts/benchmark-tei-browser.mjs
```

The build script is pinned to baseline `5e2f0f4` and can use the original implementations of the explicitly listed
remediation files while keeping identical profiling and harness code:

```sh
TEI_BASELINE_REF=5e2f0f4 NODE_OPTIONS=--max-old-space-size=8192 node scripts/tei-performance/build.mjs
TEI_FLINT=1 TEI_COMPACT=0 TEI_EXPECT_BASELINE=1 TEI_CASES=small,large TEI_RUNS=3 TEI_LABEL=before node scripts/benchmark-tei-browser.mjs
```

`TEI_CASES=small,large,anthology` selects cases; `TEI_CPU=1` saves main-thread CPU
profiles. `TEI_PREP=1 TEI_CPU=1` profiles the *same* worker preparation function on
the main thread to make its call stack available to CDP. Those CPU-profile runs
are diagnostic, not end-to-end latency results. `TEI_QUALIFICATION_URL` overrides
the local origin. Results and intermediate stage evidence go to the ignored
`artifacts/tei-performance/` directory. Runtime exceptions fail the command.

Small and large are the unmodified, attributed WeGA fixtures. Anthology is an
explicitly synthetic longer correspondence document derived from A041209: its
complete source is retained and 12 sections of 20 paragraphs are appended. Each
paragraph has a name with an unresolved reference, an addition and a deletion.
This is a scaling fixture, not a claimed historical edition. Its native semantic
conversion is complete. It is not rendered or converted lazily.

The timed interval starts after the editor's empty workspace/application services
exist, and includes file reading, fresh worker startup/delivery, native admission,
projection, initial rendering and two animation frames. Source fixture loading
and application bundle startup are outside the interval, as they are outside a
file import into an already-running application. Metadata timing includes click,
mounting and two frames. Typing uses three insertion/deletion pairs on each
letter, with frames between events so native caret restoration completes. The
anthology measures import and metadata without typing; the existing browser typing benchmark
provides a separate 40-edit regression sample using its default standalone host. All times are unthrottled headless
Chrome measurements, not universal latency guarantees.

`conversionTotal` includes the named decode/parse/traversal/reference/assembly/TEI
validation stages: do not add it to those component times. Traversal builds the
semantic DTOs in place; `canonicalConstruction` separately measures Block/Cell/
property materialisation into the canonical model. After remediation, `compactNativeEncodingAndWireValidation` replaces disposable
worker Cell construction/capture/serialization. Full canonical validation is
measured in `admissionTimings.nativeDecodeAndValidation`, followed by staging,
identity/binding checks and canonical commit. Worker `contents`/`placements`
counts are now zero; `cells` describes the complete authored text that admission
materialises. Counts describe records, not all JS heap allocations. Heap samples use Chrome's precise-memory-info option;
they are not peak RSS. `transferAndDispatchMs` includes structured cloning and
message dispatch after the worker stamps its result. The difference between
worker round trip and worker execution also includes worker startup.

The optional native decoder probes further split `nativeDecodeAndValidation`
into `nativeWireParsing`, `canonicalConstruction` (including local wire/field
checks), `canonicalGraphValidation`, `canonicalFreeze`, and
`nativeOwnershipValidation`. These are subsets, not additional pipeline stages.
Block and standoff DTO creation is integral to semantic traversal; main-thread
Cell creation occurs once in native decoding. The probes do not time each Cell
individually or add profiling fields to authored/native data.

For the complete Flint application lifecycle (including unsaved-candidate
registration, the existing workspace projection, and the actual open-tab host),
set `TEI_FLINT=1`. This is the acceptance metric; the default isolated document
view is a diagnostic lower bound. `projectionMs` is a subset of Flint's
`openAndRenderMs`, not an additional duration. `candidateMs` retains the complete
candidate capture/validation; it is not hidden in worker or rendering time.

For a baseline run set `TEI_EXPECT_BASELINE=1` as well: this asserts that the
worker actually used the old canonical construction path. The build overrides
both Vite plugin pipelines (main and worker), not only the main bundle.

The existing real Cell-editor browser typing benchmark can be reproduced without altering the
checkout's implementation:

```sh
npx vite --config scripts/tei-performance/typing-baseline.vite.mjs
BENCHMARK_URL=http://127.0.0.1:3109/src/interchange/tei/fixtures/README.md node scripts/benchmark-typing-browser.mjs
# Afterward, against the normal current-source Vite server:
BENCHMARK_URL=http://127.0.0.1:3107/src/interchange/tei/fixtures/README.md node scripts/benchmark-typing-browser.mjs
```

Run baseline, final, CPU profiles, builds and tests sequentially. Do not compare
samples collected while another qualification job is consuming CPU/memory.

## Shared native admission investigation

The native-admission follow-up uses baseline `a089fab`, retaining the previous
TEI remediation. Its instrumentation-only patch and completed five-sample
baseline are retained in `artifacts/tei-performance/`. The earlier
`TEI_BASELINE_REF=5e2f0f4` mode still means the original TEI baseline; do not use
it as the baseline for the native-admission follow-up.

```sh
TEI_FLINT=1 TEI_RUNS=5 TEI_CASES=small,large,anthology,populated TEI_LABEL=admission-final node scripts/benchmark-tei-browser.mjs
TEI_FLINT=1 TEI_RUNS=1 TEI_CASES=extended TEI_LABEL=admission-final-extended node scripts/benchmark-tei-browser.mjs
TEI_FLINT=1 TEI_TRACE=1 TEI_CPU=1 TEI_RUNS=1 TEI_CASES=large TEI_LABEL=admission-final-trace node scripts/benchmark-tei-browser.mjs
```

`populated` imports A041209 after creating three unrelated 8,000-Cell native
documents and opening two of their tabs. Flint mounts the active Document only.
Setup is excluded from the timed interval; actual repository/projection counts
are recorded. `extended` uses thirty synthetic sections instead of twelve:
120,624 Cells, with complete source semantics and the same native lifecycle.

The optional `commit.*` / `plan.*` intervals split canonical planning, full
destination validation, history, record publication, indexes, subscribers and
the batch flush. `count.*` are operation counts, not durations. `observer.*`
durations are subsets of `commit.changeObservers`. `work.*` records projection
build/registration/append calls and the distinct admission and Flint tab commits.
Nested timings must not be added together. Revision and change probes assert
one complete admission; the later tab-insertion commit is counted separately.
`admissionSnapshots` counts repository snapshots through opening. These probes
add small diagnostic overhead equally to the before/after harness.

`TEI_TRACE=1` writes Chrome timeline events; user-timing marks delimit admission,
candidate registration, synchronous opening and the final two frames.
Trace/CPU-profile samples are diagnostic and must not replace unprofiled
acceptance samples. Source maps belong to that exact build; extract any
source-mapped summary before rebuilding the site.

`scripts/native-admission-baseline.vite.mjs` provides read-only `a089fab` overrides
for reproducing the separately reported lifecycle-test failures. The final
qualification distinguishes the slower, reverted bulk-setter experiment
(`admission-after.json`) from the retained implementation (`admission-final.json`).

The follow-up findings and retained/rejected changes are documented in
[NATIVE_DOCUMENT_ADMISSION_ARCHITECTURAL_QUALIFICATION.md](../../NATIVE_DOCUMENT_ADMISSION_ARCHITECTURAL_QUALIFICATION.md)
and [NATIVE_DOCUMENT_ADMISSION_PERFORMANCE_REPORT.md](../../NATIVE_DOCUMENT_ADMISSION_PERFORMANCE_REPORT.md).
The final qualification is conditional; release-blocking targets remain open.

## Milestone 5 native alternative transfer

Build and serve the same production harness, then run:

```sh
# Source maps are optional when collecting timings rather than CPU profiles.
TEI_SOURCEMAP=0 node scripts/tei-performance/build.mjs
python3 -m http.server 3108 --bind 127.0.0.1 --directory artifacts/tei-performance/site
# In another terminal, sequentially:
node scripts/test-inline-interoperability-browser.mjs
INLINE_FUNCTIONAL_ONLY=1 node scripts/test-inline-alternatives-browser.mjs
TEI_FLINT=1 TEI_RUNS=3 TEI_LABEL=m5-after node scripts/benchmark-tei-browser.mjs
BENCHMARK_COMPACT=1 BENCHMARK_OUTPUT=artifacts/tei-m5/typing-after node scripts/benchmark-flint-typing-browser.mjs
```

The M5 script uses real Flint clipboard events, complete native closures, two
Documents and an independent mounted occurrence. It profiles paste, joins,
replacement and Undo/Redo with zero and 150 extra unrelated paragraphs, checking
affected-record counts, snapshots, canonical Cells and unrelated DOM/projection
work. Native Save uses an in-memory adapter. No source XML or user document is
written. Evidence is in `artifacts/tei-m5/browser.json`; the implementation report
records interpretation and remaining full-validation costs.

## Matched M4–M5 closure comparison

Run builds sequentially, then serve each directory in its own terminal:

```sh
TEI_M5_COMPARE=m4 TEI_SOURCEMAP=0 NODE_OPTIONS=--max-old-space-size=3072 node scripts/tei-performance/build.mjs
TEI_M5_COMPARE=m5 TEI_SOURCEMAP=0 NODE_OPTIONS=--max-old-space-size=3072 node scripts/tei-performance/build.mjs
python3 -m http.server 3108 --bind 127.0.0.1 --directory artifacts/tei-m5-closure/site-m4
python3 -m http.server 3109 --bind 127.0.0.1 --directory artifacts/tei-m5-closure/site-m5
# After both builds have completed, with no concurrent tests/builds:
node scripts/tei-performance/compare-m5.mjs
```

Both builds use the exact `f249c72` harness entry, excluding M5's unrelated
clipboard fixture setup. The M4 build restores every changed application module
from that commit in both main and worker pipelines, rejecting accidental use of
an M5-only module. M5 uses current application source. Build manifests record
refs, restored paths, source differences, harness and fixture hashes.

The runner reuses `benchmark-tei-browser.mjs` and its existing checks. It alternates
M4/M5, M5/M4, M4/M5 batches, each with a fresh Chrome profile and small/large/anthology
fixtures. Three samples per version/fixture are written to
`artifacts/tei-m5-closure/matched.json`, with original per-batch results/stages in
`artifacts/tei-performance/m5-closure-r*-m*.json`. Use the ordinary M5 production
build for clipboard qualification; the matched harness intentionally has no
`inlineInteropSetup`. Its browser script accepts `TEI_OUTPUT` to preserve separate
closure evidence. See `TEI_P5_MILESTONE_5_FINAL_QUALIFICATION.md` for results.
