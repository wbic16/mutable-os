# TEI P5 Importer — Performance Remediation

## Qualification decision

The measured annotation-resolution and redundant worker-materialisation defects have been fixed. **The release-blocking performance requirement is not fully satisfied. Milestone 2 has not been started.**

In the production-build, complete Flint application test, the small WeGA letter improves from **1,454.9 ms to 490.0 ms** to usable text; the large letter improves from **21,343.8 ms to 2,355.4 ms**. Metadata activation improves from **333.0 / 2,049.8 ms** to **66.9 / 132.9 ms**. These are final three-run medians, including worker preparation, native admission, unsaved-candidate registration, actual Flint tab opening and rendering. The large letter still misses the one-second target. One small import took **600.1 ms**, and one large Metadata activation took **274.4 ms**, so those targets are not consistently satisfied either. Native admission, candidate capture/validation and mounting are now the material costs.

This is a bounded remediation of the existing importer and measured shared hot paths. It introduces no TEI vocabulary, new editor model, registry framework, clipboard policy, persistence format, automatic save, or semantic deferral. All semantic content is converted before admission. Metadata continues to use the existing secondary native tab.

## 1. Method and evidence

Baseline: repository commit **`5e2f0f4`**, the accepted M1 implementation. Environment: Apple M1, 8 GiB RAM; Node 22.12.0; Chrome **157.0.8103.79**, headless, 1440 × 900, scale 1, no CPU throttling. The import harness is a production Vite/Solid build, using the real interchange worker, existing object bank, application views, native session and actual Flint application host. An empty application exists before timing starts, as it does when importing into a running application. Source-fixture fetch and application bundle startup are excluded; file reading, worker startup, response delivery, admission, candidate registration, tab opening and two animation frames are included.

The main comparison uses three sequential samples per completed case. The final after sweep includes the placement-only ownership guard and finer native decoder probes. Builds, CPU profiles and test jobs were excluded from those benchmark intervals. These are measurements on one machine, not a guarantee for other devices or larger existing workspaces. Forced GC runs between fixtures, not during the measured import. Metadata timing includes the click, mounting and two frames.

| Fixture | XML bytes | Native Blocks, including fixed wrappers | Cells | Standoff segments | Document-local linked definitions | Converter property count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| WeGA A040080 | 7,861 | 64 | 3,271 | 100 | 89 | 209 |
| WeGA A041209 | 28,829 | 72 | 17,283 | 314 | 270 | 605 |
| Derived correspondence anthology | 86,122 | 336 | 58,614 | 1,034 | 990 | 2,069 |

The third case is explicitly **synthetic**: the complete A041209 source plus twelve sections of twenty correspondence paragraphs, containing unresolved names, additions and deletions. It exercises a larger scholarly-content shape and annotation density; it is not an authentic larger historical document. All three after cases complete without truncation and contain exactly one initial Page. The converter's `stats.blocks` excludes some fixed assembly wrappers; the table uses the complete encoded native count. Property-budget counts, standoff segments and linked definitions are distinct quantities and should not be added as though they were disjoint categories.

Reproducible source: [harness and instructions](scripts/tei-performance/README.md), [production build](scripts/tei-performance/build.mjs), [Flint lifecycle probe](scripts/tei-performance/main.tsx), [Chrome runner](scripts/benchmark-tei-browser.mjs). The baseline build replaces the listed changed implementation files in **both main and worker bundles**. `TEI_EXPECT_BASELINE=1` asserts that the old worker actually constructed canonical records.

Primary local evidence, retained under the ignored qualification-artifact directory:

- [Full Flint baseline](artifacts/tei-performance/flint-baseline.json).
- [Full Flint after, final reviewed source, three runs](artifacts/tei-performance/flint-reviewed.json).
- [Baseline larger-case timeout checkpoints](artifacts/tei-performance/flint-baseline-anthology-stages.json).
- [Detailed native decoder follow-up](artifacts/tei-performance/flint-detailed.json).

Early isolated-document measurements omitted candidate registration and the full Flint host. They are diagnostic lower bounds, **not acceptance results**. An early baseline build also overrode only the main bundle; that hybrid baseline was discarded and replaced with the verified main-plus-worker baseline above. The earlier M1 report's 12.5-second measurement used a different preparation/mounting path; it is not silently substituted for this matched baseline.

## 2. Before and after timings

All numbers below are milliseconds. Component medians need not sum exactly to the median total.

| Complete lifecycle stage | Small before | Small after | Large before | Large after | Anthology after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Worker execution | 228.5 | 13.3 | 1,844.3 | 20.4 | 88.9 |
| Worker round trip, including startup/delivery | 261.6 | 51.3 | 1,872.2 | 45.6 | 129.1 |
| Transfer and dispatch after worker completion | 4.2 | 1.0 | 4.3 | 1.0 | 1.3 |
| Native admission, including publication/observers | 206.0 | 216.9 | 983.2 | 1,241.1 | 5,233.6 |
| Unsaved-candidate capture/validation and registration | 190.2 | 87.6 | 1,785.6 | 485.7 | 2,078.6 |
| Flint open and render, including two frames | 792.6 | 90.9 | 16,696.6 | 516.2 | 2,653.8 |
| Document projection, **subset of open/render** | 24.8 | 24.6 | 163.9 | 125.8 | 534.3 |
| **End-to-end usable text** | 1,454.9 | 490.0 | 21,343.8 | 2,355.4 | 10,325.0 |
| Metadata activation, separate subsequent action | 333.0 | 66.9 | 2,049.8 | 132.9 | 412.4 |

Worker execution and transfer are subsets of the round trip, not additional costs to add to it. Projection is a subset of open/render. The admission commit interval includes synchronous observers and updates to the already-existing workspace projection; it is not solely the graph validator's time.

| Acceptance measurement | Before min–max | After min–max | Result |
| --- | ---: | ---: | ---: |
| Small usable text, target <500 ms | 1,450.5–1,572.8 | 420.1–600.1 | Median meets; **one of three samples misses** |
| Large usable text, target <1,000 ms | 21,096.0–21,434.2 | 2,002.5–2,573.1 | **Not met** |
| Small Metadata, target <250 ms | 316.1–350.0 | 66.1–67.4 | Met in all three samples |
| Large Metadata, target <250 ms | 1,949.1–2,066.3 | 132.4–274.4 | Median meets; **one of three samples misses** |
| Anthology usable text, scaling observation | Did not complete within 120 s | 8,064.6–12,259.0 | Still costly; no separate size-specific target was specified |
| Anthology Metadata, target <250 ms | Unavailable after timeout | 395.3–518.0 | **Not met** |

For the full-Flint anthology baseline, recorded checkpoints were **24,169.5 ms worker execution**, **24,202.8 ms worker round trip**, **3,950.0 ms admission**, and **27,139.8 ms candidate registration**. The complete invocation timed out at 120 seconds during the subsequent open/render work. There is no completed baseline render or Metadata measurement; the report does not invent one. Its worker breakdown was 228.3 ms canonical construction, 23,447.0 ms capture/validation, and 411.7 ms serialization, versus 24.6 ms semantic conversion.

### Worker breakdown

| Worker stage | Small before | Small after | Large before | Large after | Anthology after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Blob read | 0.4 | 0.7 | 0.4 | 0.4 | 0.4 |
| XML decoding and initial declaration/limit checks | 0.3 | 0.4 | 0.3 | 0.4 | 0.6 |
| XML parsing | 3.3 | 3.6 | 4.9 | 4.5 | 14.7 |
| Semantic traversal and Block/standoff DTO construction | 3.1 | 3.1 | 5.5 | 5.7 | 16.2 |
| Reference resolution | 0.2 | 0.3 | 0.3 | 0.3 | 1.2 |
| Fixed document assembly | 0.0 | 0.0 | 0.1 | 0.1 | 0.1 |
| TEI semantic/range validation | 1.0 | 0.9 | 0.9 | 1.0 | 4.1 |
| Disposable canonical Block/Cell construction | 14.5 | Removed | 61.6 | Removed | Removed |
| Disposable native capture and validation | 173.0 | Removed from worker | 1,602.7 | Removed from worker | Removed from worker |
| Old native serialization | 27.8 | Replaced | 144.4 | Replaced | Replaced |
| Compact native encoding, serialization and wire validation | — | 4.9 | — | 8.0 | 50.9 |

Semantic traversal constructs Block and standoff DTOs in place; these are not independent passes that can be timed separately without instrumenting every allocation. Reference resolution is separately timed. No semantic work is deferred until mounting. Live Cell materialisation now happens once, in the existing main-thread native decoder.

### Native admission breakdown

| After stage | Small | Large | Anthology |
| --- | ---: | ---: | ---: |
| Native decode, canonical construction, graph/ownership validation and freezing (total) | 48.6 | 264.9 | 805.3 |
| ↳ Native wire parsing | 1.8 | 3.2 | 17.8 |
| ↳ Canonical Block/Cell/property construction and local checks | 16.5 | 91.2 | 321.5 |
| ↳ Canonical graph validation | 20.3 | 113.1 | 292.8 |
| ↳ Freezing | 5.5 | 33.7 | 102.7 |
| ↳ Native ownership validation | 3.4 | 23.7 | 76.1 |
| Canonical staging into repository records | 20.7 | 92.0 | 269.5 |
| Identity/collision/reference binding work | 5.7 | 33.8 | 138.1 |
| Canonical commit, history/publication and synchronous observers | 141.1 | 751.1 | 3,710.1 |

The original implementation was measured as a whole at the admission boundary. The optional decoder probes separate wire parsing, canonical construction, graph validation, freezing and native ownership validation in the final after sweep. Their durations are subsets of `nativeDecodeAndValidation`. Construction includes required local field/shape checks; it is not a pure allocator microbenchmark. These hooks are opt-in and do not enter authored or persisted data.

Earlier after sweeps measured 422.2 / 2,015.4 ms medians for usable text; a separate finer-instrumentation sample measured 510.2 / 2,405.7 ms. The final reviewed-source three-run sweep above takes precedence. It includes a 600.1-ms small import and a 274.4-ms large Metadata activation. Worker-startup/delivery and admission variability are visible in the raw records. No sample was discarded merely for missing a target. All final imports were complete, dirty unsaved candidates with one Page and successful edit restoration; no snapshots occurred during their edit probes.

## 3. Root causes and implemented changes

### Repeated resource-identity scans during annotation resolution

`resourceOwner` checked resource identity through `findResource`, which enumerated the complete content table for each linked annotation. In the mounted renderer, those reads also subscribed annotation computations to unrelated reactive records. Rebased ranges and Cell edits could consequently trigger repeated resolution across unrelated annotations. CPU profiling of the original large-letter preparation attributed approximately **1.57 seconds** to `findResource` within a roughly 2.33-second capture sample. This diagnostic CPU sample is distinct from the unprofiled acceptance samples.

The fix reuses existing maintained evidence rather than adding another Entity/annotation index:

- [Resource ownership](src/block-tree/resource-identity.ts) accepts an optional lookup backed by repository structural evidence. Its existing revision-bound headless ownership pass now also records resource identities, avoiding a separate full scan per annotation.
- [Boundary bookkeeping](src/block-tree/resource-boundary.ts) exposes a read-only Document identity lookup; [repository](src/block-tree/repository.ts) exposes it alongside existing owned-placement and location evidence.
- [Linked annotation runtime](src/runtime/linked-annotations.ts) uses those lookups without tracking every canonical record. Shared definition values remain reactive. Dependencies on the specific owned edges also cover placement-only retargeting. Actual ownership/identity changes invalidate resolution; ordinary inline edits do not trigger the topology listener's scan. Only affected records are examined for structural changes. Disposal releases the listener.
- [Headless linked resolution](src/block-tree/linked-annotations.ts) accepts the same evidence. Missing/ambiguous targets still remain unresolved; cycle, ownership and duplicate-identity checks remain. Gloss resolution retains its existing path.

This addresses both initial mounting and Metadata activation, and removes the dramatic imported-letter typing slowdown. No geometry cache, range renderer, input dispatcher or editor model was replaced.

### Worker construction immediately discarded before admission

The original preparation path decoded the complete DTO into canonical Cells, captured/cloned/froze the resource and encoded it back into native text atoms. Main-thread native admission then expanded those same atoms back into Cells. The first live graph existed only to be serialized and discarded.

[The restricted TEI native encoder](src/interchange/tei/compact-native.ts) now writes the producer's already-validated, wholly owned tree using the **existing** native text-atom and authored-value grammar. It accepts only the six Block implementations already emitted by M1; unsupported structure, duplicate identities or unexpected relations fail explicitly. It preserves all text, branches, definitions, properties, reference records and metadata. Native wire-shape validation runs in the worker, and the ordinary canonical decoder, graph checks, native ownership checks and repository validation still run before admission. Candidate capture remains an additional check.

[Preparation](src/interchange/tei/native.ts) no longer creates a disposable worker Cell graph. This is an intentional change to where M1's validation is performed: complete canonical validation remains an admission requirement, without building a second canonical graph in the worker. The wire schema, public native Save implementation and external clipboard admission are unchanged. Fresh placement identities and compact JSON whitespace are permitted; byte-for-byte equality with the old worker envelope is not claimed. Exact authored-document equivalence is tested against the old codec/capture/decode path.

### Avoidable whole-workspace candidate snapshot

[Candidate registration](src/persistence/native-session.ts) formerly passed `repository.snapshot()` to synchronous `captureNative`. Capture already copies its owned resource. It now reads the current canonical state directly, preserving all capture validation while avoiding a redundant whole-workspace snapshot, including unrelated open Documents. Dirty/candidate registration and manual save behaviour are unchanged.

### Bulk native admission operation

[Native admission](src/persistence/native-resource.ts) now uses the existing `record-batch` operation instead of constructing one `put-content`/`put-placement` operation per incoming record. It retains collision checks, bindings, atomic commit, canonical validation and Undo/Redo. This removes an unnecessary operation array; **the matched measurements do not establish an admission latency improvement**. The large-letter median admission was 0.98 seconds before, 0.99 seconds in an earlier after sweep and 1.24 seconds in the final sweep. That variance and remaining cost are explicitly reported rather than hidden in preparation or rendering; an admission speedup is not claimed.

### Instrumentation

Opt-in timing hooks were added to [conversion](src/interchange/tei/convert.ts), [preparation](src/interchange/tei/native.ts), [worker delivery](src/interchange/operations.worker.ts), [native admission](src/persistence/native-resource.ts) and [native decoding](src/history/stage-c-gates/portable.ts). The harness measures real host boundaries, Metadata activation and memory samples. No telemetry is persisted, no network lookup is added, and ordinary production imports do not request profiling.

## 4. Allocation and memory observations

Before remediation the worker allocated content and placement tables of **3,335 / 17,355 / 58,950 records each** for the three cases, plus capture/serialization copies. After remediation it allocates **zero canonical content or placement records in the worker**. Complete semantic DTOs and native text atoms still exist there. Admission still materialises the full native Block/Cell graph; output counts in Section 1 are unchanged.

The old per-record admission operation array contained 6,671 / 34,711 / 117,901 entries for these no-binding-conflict fixtures, including the bank update. It is now one batch operation. This is an operation-count observation, not a claim that every downstream history or compatibility allocation disappeared. Existing consumers may still construct compatibility records.

| Observation | Small before → after | Large before → after | Anthology after |
| --- | ---: | ---: | ---: |
| Worker native envelope bytes | 102,141 → 57,860 | 242,706 → 137,707 | 512,460 |
| Main JS heap before import, MiB | 46.4 → 30.3 | 46.6 → 30.5 | 30.7 |
| Main JS heap after mounting/edit probe, MiB | 91.5 → 61.1 | 279.4 → 154.2 | 383.4 |
| Main JS heap after Metadata, MiB | 120.3 → 72.9 | 308.1 → 173.9 | 395.5 |

These are median `usedJSHeapSize` samples with Chrome's precise-memory option. They include the harness/application, are sensitive to GC, and are neither peak RSS nor a complete main-plus-worker allocation profile. In the full-Flint probe, the mounted sample is taken after its short edit probe; it is not an instantaneous first-paint heap sample. Different pre-import heaps mean the absolute after/before difference should not be attributed entirely to the imported document. The record-count reductions are exact; memory/latency attribution is more limited.

## 5. Regression qualification

The broad selection ran **294 tests across 28 suites: 293 passed, one failed**. All TEI tests passed, including both real letters, semantic definitions and references, alternatives, malformed-input recovery, explicit truncation, native reload/saved projection and the existing 300,100-Cell capacity case. After the final placement-only ownership guard, the affected focused selection passed **35/35 tests in five suites**. The new [compact-encoder oracle suite](src/interchange/tei/compact-native.test.ts) has eight passing cases. The new [bounded-work suite](src/runtime/linked-annotations-performance.test.tsx) has seven passing tests.

The failure is the existing `flint-lifecycle.test.tsx` assertion at line 142: closing a Flint window leaves one projection where the test expects zero. It reproduced in an isolated rerun and **on the unchanged baseline** using the baseline source override: 23 passed, one failed. It is not suppressed or changed by this remediation. The post-instrumentation native-resource and portable-codec suites passed all 19 tests in the isolated rerun. Client and server `npm run typecheck` passed with no diagnostics ([log](artifacts/tei-performance/typecheck.log)).

The bounded-work checks assert:

- Repeated semantic annotation resolution plus text edit/Undo/Redo performs **zero enumerations of the complete repository content/placement tables**, zero snapshots, zero reference-index rebuilds and zero projection rebuilds.
- Shared annotation edits still update resolved values and Undo restores them.
- Headless repeated ownership queries share one revision-bound scan; a new ambiguous identity remains an error/unresolved value.
- Runtime identity edits and Undo correctly invalidate ambiguity/resolution.
- Placement-only retargeting resolves the new owning Document's definition, including Undo/Redo, without requiring a changed parent child-list.
- Native admission uses one batch and preserves native capture and Undo/Redo.
- Unsaved-candidate registration performs no repository snapshot, remains dirty, and preserves native bytes when subsequently captured.

The ordinary existing browser typing benchmark uses 25,000 Cells in 250 paragraphs and 40 edits, followed by trusted CDP input, Backspace, Undo/Redo, Enter and split-boundary checks. The matched baseline/current runs passed, with zero snapshots and stable unrelated Cell DOM. Baseline → after: mean **5.05 → 1.92 ms**, median **3.2 → 1.2 ms**, p95 **14.6 → 6.2 ms**, maximum **52.8 → 24.2 ms**. This single matched pair shows no measured ordinary typing regression; it is not a statistical latency guarantee. The benchmark's default standalone host exercises the real Cell rendering/input path; the separate production acceptance harness measures the actual Flint host.

In the imported-letter full-Flint samples, the short six-event insert/delete probe also restored text and took no snapshots. Median handler duration across runs fell from **164.0 to 3.1 ms** for the small letter and **6,013.3 to 1.5 ms** for the large letter. These are synchronous handler timings; they are not presented as frame-to-screen latency or substituted for the trusted-input benchmark. The anthology intentionally has no typing probe.

The existing 300,100-Cell capacity test passed but observed **1,987.5 seconds elapsed and 965 MiB JS heap** in this broad test invocation. That long elapsed interval is retained as observed; it was not an isolated production-browser performance measurement and does not qualify book-sized interaction. It does underline that a configurable capacity limit is not a performance guarantee. An earlier concurrent test attempt also hit a five-second native-session timeout; its isolated rerun passed. Performance conclusions use the dedicated sequential browser runs, not test-run durations.

The existing Chrome/real-worker TEI smoke script passed for **both real letters**, including trusted insertion, Undo/Redo, native capture/reload, one Page, Text initially selected, Metadata activation, cancellation and timeout. Its preparation/mount figures (448 / 1,504 ms) use a different DTO round trip and standalone host; they are functional evidence, not the full-Flint acceptance metric. [Smoke evidence](artifacts/tei-performance/browser-smoke.json), [broad test log](artifacts/tei-performance/regression.log), [final focused tests](artifacts/tei-performance/final-focused-tests.log), [baseline lifecycle failure](artifacts/tei-performance/lifecycle-baseline.log), [typing before](artifacts/tei-performance/typing-before.log), [typing after](artifacts/tei-performance/typing-after.log).

## 6. Remaining constraints and next boundary

The large letter's current median has approximately **1,241 ms admission + 486 ms candidate capture + 516 ms open/render**, beyond the 46 ms worker round trip. Even eliminating worker preparation entirely cannot meet one second. The larger case magnifies canonical record/copy/validation/history/publication and projection costs, and its Metadata activation also misses 250 ms.

This is a measured constraint of the **current eager native lifecycle**, not proof that Mutable can never meet the target. The work has not weakened canonical validation, omitted history, hidden candidate capture, or deferred semantic conversion to make a first-paint number appear better. A further reduction would need a narrowly qualified change to the native admission/candidate validation handoff and/or actual projection/publication work. Such work must prove that evidence remains valid across staging and atomic commit, retain collision/ownership checks and Undo, and preserve bounded typing. No speculative replacement framework or new editor architecture was introduced here.

Other limits of this qualification: one machine/browser; no populated-vault or many-open-document performance matrix; a derived rather than authentic larger source; no peak worker-memory measurement; and no completed anthology baseline Metadata timing. The unchanged Flint close-window test remains separately outstanding. **The large-letter release target is still open.**

## 7. Reproduction

See the [harness README](scripts/tei-performance/README.md) for full baseline and typing commands. The production build was run with an 8-GiB Node heap allowance; an initial default-heap build exhausted Node's heap. This is build tooling, not a new importer runtime requirement. Builds completed with existing bundle-size/dynamic-import warnings.

```sh
NODE_OPTIONS=--max-old-space-size=8192 node scripts/tei-performance/build.mjs
python3 -m http.server 3108 --bind 127.0.0.1 --directory artifacts/tei-performance/site
# Separate shell, after builds/tests finish:
TEI_FLINT=1 TEI_RUNS=3 TEI_LABEL=after node scripts/benchmark-tei-browser.mjs

# Rebuild the same harness against original main AND worker implementations:
TEI_BASELINE_REF=5e2f0f4 NODE_OPTIONS=--max-old-space-size=8192 node scripts/tei-performance/build.mjs
TEI_FLINT=1 TEI_EXPECT_BASELINE=1 TEI_CASES=small,large TEI_RUNS=3 TEI_LABEL=before node scripts/benchmark-tei-browser.mjs
```

The broad regression command is retained verbatim in its linked log. The final affected selection and typecheck are reproducible with:

```sh
npm test -- src/runtime/linked-annotations-performance.test.tsx src/runtime/linked-annotations.test.ts src/interchange/tei/compact-native.test.ts src/persistence/native-resource.test.ts src/history/stage-c-gates/portable.test.ts --maxWorkers=1 --minWorkers=1
npm run typecheck
# Against a current-source Vite server on port 3107:
TEI_QUALIFICATION_URL=http://127.0.0.1:3107 node scripts/qualify-tei-browser.mjs
```

No production files were changed to run the baseline, and no user documents were saved or overwritten by qualification. The remediation remains in the working tree for review.
