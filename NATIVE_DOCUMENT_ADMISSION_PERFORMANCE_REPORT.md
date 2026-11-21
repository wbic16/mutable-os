# Native Document Admission — Performance Remediation and Qualification

## Decision

**Conditionally accepted:** retain the bounded local fixes, subject to review. Correctness checks support them, but the release-blocking performance requirements remain open. This is **not release acceptance** and does not authorise TEI Milestone 2.

Five sequential samples per case show median usable-text improvements of 25.4% for the small letter, 16.6% for the large letter, 15.5% for the anthology and 26.8% for the populated workspace. The large letter still takes 1,698.4 ms at the median. Small-letter usable time and large-letter Metadata also fail the requirement that **every** sample meet its target. All completed slow samples are included.

The investigation and initial proposals were recorded before remediation in [the architectural qualification](NATIVE_DOCUMENT_ADMISSION_ARCHITECTURAL_QUALIFICATION.md). The preceding TEI remediation at baseline `a089fab` is retained. No TEI vocabulary, native format, admission policy, manual-save behaviour, editor model or transaction/history semantics were changed. No feature flag is introduced: these are local optimisations of existing behaviour, not a new feature.

## Measurement contract and evidence

Environment: Apple M1, 8 GiB RAM; Node 22.12.0; Chrome 157.0.8103.79; production Vite/Solid build; headless 1440×900, device scale 1, no CPU throttling. Before and final use the same instrumented real Flint application harness, interchange worker, native session and canonical repository. Builds, tests and diagnostic profiles were not run concurrently with acceptance samples. This is a shared developer machine, not a dedicated performance lab; background OS/application activity is not controlled.

The timer starts in an already-running empty Flint application and includes file reading, fresh worker startup, complete semantic conversion, worker delivery, native admission, dirty-candidate registration, Flint tab opening/mounting and two animation frames. Fixture retrieval and application bundle startup precede the timer. Metadata is a separate click/mount/two-frame action. No mandatory semantic work is deferred; all samples have one initial Page, complete native output and no truncation. The populated case's existing documents/tabs are prepared before timing.

[Before samples](artifacts/tei-performance/admission-before.json), [final samples](artifacts/tei-performance/admission-final.json) and the [instrumentation-only patch](artifacts/tei-performance/admission-instrumentation.patch) are retained locally. There are twenty complete samples in each primary series, ordered small/large/anthology/populated in each of five rounds. The final series slows sharply near its end; no cause was established for each sample, so none was excluded. Subsequent process inspection found substantial background system activity, but that is not proof explaining any particular earlier sample. No repeat was substituted to improve acceptance statistics.

Initial incomplete runs are excluded: disk exhaustion prevented Chrome profile/result writes, and an initial diagnostic assertion incorrectly counted Flint's later tab commit as another admission. Only inactive temporary profiles created by these QA scripts were removed to recover space; user profiles/documents were untouched. The completed baseline started afterward. Diagnostic CPU/timeline runs and the rejected implementation experiment are separately labelled and do not enter acceptance statistics.

The harness uses a controlled in-memory repository and application services, without a live vault backend. It exercises real native and Flint code, not actual vault discovery, disk saving or a populated filesystem. Expected unavailable local vault endpoints are common to both builds. Optional instrumentation records timings/counters outside native data; count scans occur only when a timing map is supplied. Ordinary typing does not request them.

## Release targets

All values below are milliseconds; ranges are minimum–maximum, n=5 per before/final case.

| Requirement | Before median (range) | Final median (range) | Final samples passing | Result |
| --- | ---: | ---: | ---: | --- |
| Small usable <500 | 478.6 (416.9–521.3) | 356.9 (356.6–719.2) | 4/5 | Open |
| Large usable <1,000 | 2,036.4 (1,950.3–2,242.0) | 1,698.4 (1,681.5–3,220.5) | 0/5 | Open |
| Small Metadata <250 | 66.6 (66.3–66.7) | 66.7 (66.1–110.4) | 5/5 | Met in this sample |
| Large Metadata <250 | 133.0 (118.9–133.4) | 149.4 (118.7–251.5) | 4/5 | Open |

Small usable times were 469.6, 356.9, 356.6, 356.8 and 719.2 ms. Large usable times were 1,993.9, 1,698.4, 1,681.5, 1,686.8 and 3,220.5 ms. Large Metadata's slowest sample, 251.5 ms, occurred in round 1; it is included even though it misses by only 1.5 ms. The populated scenario also had a 282.4-ms Metadata sample.

## Complete lifecycle timings

Each entry is **median (minimum–maximum)** in milliseconds, **n=5**. Projection is a subset of synchronous opening, which is a subset of open/render; none should be added again. Worker execution is a subset of worker round trip. Transfer/dispatch excludes worker startup; the remainder of round trip includes startup and scheduling. Component medians need not add to the median total.

### A040080 — small letter

| Stage | Before | Final |
| --- | ---: | ---: |
| Usable text | 478.6 (416.9–521.3) | 356.9 (356.6–719.2) |
| Worker execution | 14.7 (11.5–24.7) | 12.0 (11.6–27.1) |
| Worker round trip, including startup | 48.6 (36.2–74.3) | 38.3 (36.9–80.9) |
| Transfer/dispatch subset | 0.7 (0.5–1.6) | 1.0 (0.2–1.8) |
| Native admission | 234.5 (205.3–267.0) | 199.2 (197.4–414.5) |
| Candidate registration | 86.6 (83.8–96.3) | 42.6 (42.0–74.7) |
| Flint open/render, including two frames | 91.2 (87.0–121.6) | 78.6 (78.3–149.1) |
| Document projection subset | 25.0 (24.3–27.4) | 24.9 (24.7–43.7) |
| Synchronous opening subset | 71.6 (69.2–91.2) | 60.8 (60.7–115.5) |
| Post-synchronous two-frame interval | 18.3 (17.7–30.4) | 17.7 (17.4–33.4) |
| Metadata activation | 66.6 (66.3–66.7) | 66.7 (66.1–110.4) |

### A041209 — large letter

| Stage | Before | Final |
| --- | ---: | ---: |
| Usable text | 2,036.4 (1,950.3–2,242.0) | 1,698.4 (1,681.5–3,220.5) |
| Worker execution | 20.3 (19.8–21.8) | 20.4 (20.1–110.4) |
| Worker round trip, including startup | 46.0 (45.0–49.5) | 45.4 (44.8–169.7) |
| Transfer/dispatch subset | 0.7 (0.1–1.5) | 0.9 (0.4–2.1) |
| Native admission | 994.9 (971.6–1,048.1) | 956.9 (946.7–1,546.6) |
| Candidate registration | 473.8 (439.3–481.9) | 222.6 (203.0–357.2) |
| Flint open/render, including two frames | 513.6 (494.2–699.8) | 491.7 (467.5–1,147.0) |
| Document projection subset | 121.1 (117.4–158.5) | 149.6 (133.2–365.3) |
| Synchronous opening subset | 372.0 (364.1–529.1) | 354.4 (337.1–844.2) |
| Post-synchronous two-frame interval | 132.2 (129.5–170.4) | 137.1 (129.4–302.4) |
| Metadata activation | 133.0 (118.9–133.4) | 149.4 (118.7–251.5) |

### Synthetic anthology

| Stage | Before | Final |
| --- | ---: | ---: |
| Usable text | 7,666.9 (7,467.3–8,815.3) | 6,476.1 (6,302.3–12,056.6) |
| Worker execution | 54.1 (53.6–61.3) | 61.1 (53.6–135.7) |
| Worker round trip, including startup | 80.3 (78.4–89.8) | 88.9 (78.5–214.6) |
| Transfer/dispatch subset | 1.0 (0.3–1.7) | 1.1 (0.6–2.5) |
| Native admission | 3,652.2 (3,559.0–4,072.2) | 3,508.4 (3,473.8–6,819.2) |
| Candidate registration | 1,752.9 (1,729.2–2,298.0) | 866.1 (850.2–1,273.8) |
| Flint open/render, including two frames | 2,181.0 (2,100.7–2,364.8) | 1,960.8 (1,860.4–3,749.0) |
| Document projection subset | 473.6 (465.3–530.8) | 456.4 (455.0–637.3) |
| Synchronous opening subset | 1,635.2 (1,563.3–1,755.7) | 1,337.0 (1,280.1–3,135.6) |
| Post-synchronous two-frame interval | 551.3 (537.2–608.6) | 613.2 (523.2–680.6) |
| Metadata activation | 381.4 (363.1–403.9) | 353.0 (344.7–372.7) |

### A041209 — populated workspace

| Stage | Before | Final |
| --- | ---: | ---: |
| Usable text | 2,899.3 (2,495.5–3,513.5) | 2,122.4 (2,095.8–3,818.2) |
| Worker execution | 22.8 (20.2–23.7) | 20.1 (19.9–48.4) |
| Worker round trip, including startup | 50.6 (44.8–54.0) | 45.3 (44.3–91.1) |
| Transfer/dispatch subset | 1.1 (0.6–1.7) | 1.5 (0.5–2.6) |
| Native admission | 1,446.0 (1,281.5–1,610.3) | 1,269.3 (1,248.4–1,945.8) |
| Candidate registration | 633.2 (588.6–891.3) | 300.9 (282.8–383.3) |
| Flint open/render, including two frames | 675.6 (579.7–959.8) | 523.6 (514.7–1,398.0) |
| Document projection subset | 148.9 (122.7–223.2) | 132.8 (129.4–301.5) |
| Synchronous opening subset | 509.8 (441.4–755.5) | 384.6 (377.1–1,051.7) |
| Post-synchronous two-frame interval | 165.6 (138.1–272.2) | 146.3 (130.6–346.1) |
| Metadata activation | 134.3 (119.7–205.6) | 133.4 (118.3–282.4) |

The worker implementation is unchanged. Large-letter median execution is 20.3→20.4 ms, with 46.0→45.4 ms round trip. Its final 110.4-ms execution maximum and the anthology's 61.1-ms median versus 54.1 ms before demonstrate run variability; this evidence does not establish universally unchanged worker latency. Worker conversion is still a small part of end-to-end time and is not the target of these changes.

## Admission, commit and publication

The call path is [native decode/admission](src/persistence/native-resource.ts:176) → isolated `resourceToRepository` staging → destination identity/reference binding → one [canonical record-batch commit](src/block-tree/repository.ts:453) → [candidate capture](src/persistence/native-session.ts:148) → Flint `openDocument` and active projection/mounting. [The architectural qualification](NATIVE_DOCUMENT_ADMISSION_ARCHITECTURAL_QUALIFICATION.md) distinguishes the validation proofs at each boundary.

The following are medians in milliseconds, n=5. The machine-readable results contain each sample's full breakdown. Nested groups are labelled; do not sum parent rows with their children.

| Admission stage | Large before | Large final | Populated before | Populated final |
| --- | ---: | ---: | ---: | ---: |
| Decode/construction/validation, total | 214.5 | 187.6 | 199.7 | 163.5 |
| ↳ Wire parsing | 3.2 | 3.1 | 2.4 | 2.3 |
| ↳ Canonical construction/local field checks | 78.1 | 78.0 | 74.2 | 68.5 |
| ↳ Resource graph validation | 84.1 | 58.4 | 70.4 | 41.7 |
| ↳ Immutable resource freeze | 28.9 | 28.5 | 29.3 | 28.6 |
| ↳ Native ownership checks | 20.3 | 20.1 | 19.6 | 19.7 |
| Independent repository staging | 73.2 | 72.6 | 71.4 | 72.3 |
| Destination identities and bindings | 29.9 | 32.0 | 76.3 | 72.7 |
| Commit, total | 682.4 | 664.7 | 1,091.0 | 955.9 |
| ↳ Operation/placement classification | 11.8 | 9.9 | 10.8 | 11.2 |
| ↳ Planning: shallow destination table copies | 0.1 | 0.1 | 16.9 | 15.9 |
| ↳ Planning: inverses/isolated operation application | 120.5 | 116.8 | 122.2 | 116.2 |
| ↳ Planning: combined repository validation | 76.2 | 71.4 | 256.9 | 242.0 |
| ↳ Revision comparison | 7.2 | 7.1 | 13.6 | 13.6 |
| ↳ Change-event preparation | 19.0 | 18.9 | 17.1 | 20.0 |
| ↳ Optional diagnostic counts | 4.6 | 4.6 | 14.6 | 14.8 |
| ↳ Solid record publication | 107.1 | 108.4 | 104.4 | 104.5 |
| ↳ Structural/identity indexes | 13.8 | 13.9 | 39.8 | 34.2 |
| ↳ Isolated Undo history construction | 89.1 | 91.0 | 103.6 | 93.7 |
| ↳ Annotation origins | 8.3 | 8.2 | 9.1 | 8.2 |
| ↳ Change subscribers | 185.0 | 186.5 | 238.2 | 196.5 |
| ↳ Remaining reactive batch flush | 19.0 | 19.3 | 82.9 | 80.1 |

All forty primary before/final samples showed:

- One admission commit and one logical publication; no intermediate graph observed. The regression test also checks a bank-dependent reactive computation, complete target availability and revision-dependent observation.
- Fourteen change subscribers including one diagnostic observer: thirteen application subscribers. Each receives one admission event. This is not a count of every internal Solid computation; the remaining batch-flush interval includes reactive execution.
- One revision-probe run and zero repository `snapshot()` calls throughout admission, candidate registration and opening. Snapshot and exact-record capture subscribers are absent in this fixture; their timings are zero. Undo history is present and included.
- One workspace branch construction/registration during admission. Two `appendChildren` observer calls occur, but only the workspace call builds the imported branch. The unrelated active Document does not rebuild its subtree.
- A second, small canonical commit when Flint inserts the new tab, followed by a separate Document projection build. This is a normal layout operation after complete admission, not a second admission or publication of partial content.

For A041209 there are 34,711 content/placement store assignments, plus root/revision setters, in the existing single Solid batch. There is no evidence that these produce 34,711 application observer passes. Admission and opening each materialise 17,355 projection nodes; these are distinct occurrences with different IDs, routes and mutable presentation payloads. They cannot safely share node objects under the current contract. Repeated materialisation is real, but replacing it requires a reviewed ownership design.

Populated setup has three unrelated 8,000-Cell native Documents (80 paragraphs each), two open tabs, and two live projections including the workspace. Flint mounts the active Document rather than all open tabs. Pre-import canonical contents/placements increase from 155/155 to 24,409/24,409. Final median admission grows 956.9→1,269.3 ms and candidate registration 222.6→300.9 ms. Combined validation grows 71.4→242.0 ms, table copying 0.1→15.9 ms and indexes 13.9→34.2 ms. This is demonstrable destination-size dependence despite no unrelated Document rebuild. Full destination validation still establishes global invariants; this change does not claim that a `record-batch` bounds all work to incoming records.

## Retained changes and rejected attempt

1. **Reuse an already immutable capture result.** [captureNative](src/persistence/native-resource.ts:26) still determines membership, owners, reference provenance and linked-definition ownership. `projectOwned` independently clones, validates and freezes the exported graph. If no implicit foreign-definition provenance needs rewriting, that exact result is returned instead of cloning, validating and freezing it again. If provenance changes, the original transformed-graph validation/freeze path remains. Canonical mutable payloads are never returned by alias. This benefits all native capture callers, including manual save, without changing when saving occurs. Large candidate registration falls 473.8→222.6 ms; anthology 1,752.9→866.1 ms.
2. **Avoid ancestry allocations for leaves.** [Resource validation](src/history/stage-c-gates/resource.ts:38) and [repository validation](src/block-tree/repository.ts:160) return after the same placement/target/cycle predicates when a record has no descendants. Resource validation shares a read-only incoming ancestry seed among siblings. It still validates unplaced components and every required record/slot. The bounded test validates 500 Cells using fewer than 25 Set constructions and still rejects a missing final Cell target. Resource graph validation for the large letter falls 84.1→58.4 ms. No validation rule or admission permission was removed.
3. **Use the existing structural Page query.** Profiling identified the old [pageForNode](src/runtime/minimap.ts:197) building a parent map by enumerating every projected Cell. It now uses `BlockQueries.ancestorPath`, already available through the existing helper. That query traverses structural Blocks/owned relations, preserves inline-Cell exclusion, and creates no new persistent cache. It is still structural traversal, not an O(1) index. The regression checks twenty queries against a 4,000-Cell document with zero projection-table enumerations. Rendering/minimap UI and geometry policy are unchanged.

Instrumentation extends the existing optional timing-map convention into `commit` and planning. The additional optional fifth commit argument is diagnostic only. Non-profiled calls do not enumerate records for counters, read the clock at each stage, or change emitted events. The editor's specialised input paths remain in place. No general registry, caching or admission-evidence framework was added.

**Rejected experiment:** merging fresh records in a few bulk Solid setters reduced public setter calls but increased publication work. Five-run median publication was 20.5→25.5 ms small, 107.1→126.5 ms large, 357.3→463.3 ms anthology and 104.4→122.8 ms populated. The implementation was reverted before final qualification; the original per-record setters inside the existing atomic batch remain. [admission-after.json](artifacts/tei-performance/admission-after.json) is this rejected experiment, not the final result. Other `admission-after-*` artefacts also belong to that experiment. No publication/history semantic change survives it.

## Rendering attribution

CPU/timeline profiling was performed separately from acceptance runs. [Before summary](artifacts/tei-performance/admission-before-render-summary.json) and [final summary](artifacts/tei-performance/admission-final-render-summary.json) retain source-mapped evidence from their respective builds. Each is one diagnostic sample with tracing overhead; these are not matched statistical acceptance estimates.

| Diagnostic measurement | Before | Final |
| --- | ---: | ---: |
| Synchronous opening elapsed | 450.0 ms | 505.7 ms |
| Exclusive Solid store CPU samples | 175.9 ms | 160.8 ms |
| Exclusive projection CPU samples | 55.5 ms | 50.8 ms |
| Exclusive minimap CPU samples | 41.8 ms | 24.5 ms |
| Exclusive direct Cell construction samples | 25.1 ms | 43.9 ms |
| Exclusive Solid core samples | 17.5 ms | 23.4 ms |
| Exclusive GC samples during synchronous opening | 32.3 ms | 76.8 ms |
| Subsequent two-frame elapsed | 167.3 ms | 263.9 ms |
| Layout events in that interval | 101.9 ms | 165.8 ms |
| Paint events in that interval | 26.0 ms | 38.1 ms |
| PrePaint events in that interval | 14.5 ms | 13.9 ms |

Component subscriptions, reactive store access, DOM creation and mount operations interleave; exclusive CPU attribution does not give an independent elapsed interval for every component. Native DOM calls, UUID generation, resource identity, standoff views and linked-annotation services also appear in the profiles. Trace events can nest and frame intervals include scheduling/idle work; do not add the CPU table to elapsed time or label every frame millisecond as paint.

The original Page lookup had approximately 29 ms self time plus attributed store access. The bounded query fix eliminates that Cell-table walk; it does not eliminate all minimap queries. Opening remains sensitive to store/projection allocation, GC and layout. The final trace was slower overall despite the lower minimap sample count. Unprofiled median large opening changes only 513.6→491.7 ms; this is not evidence of a renderer-wide transformation. Metadata keeps its normal native tab mounting and complete annotation interpretation; no lazy semantics were introduced.

## Allocation, memory and scaling

Counts describe native records/semantic DTOs, not every JS allocation. Worker canonical content/placement allocations remain zero after the preceding compact-wire remediation. Main-thread decoding constructs the required canonical Cells; staging, inverse/history isolation, native projection and two UI occurrences still allocate substantial additional objects. The capture fast path removes one complete resource clone and validation/freeze pass, not the first independent owned projection.

| Fixture | XML bytes | Native bytes | Cells | Native Blocks | Standoff segments | Linked definitions | Converter property count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A040080 | 7,861 | 57,860 | 3,271 | 64 | 100 | 89 | 209 |
| A041209 | 28,829 | 137,707 | 17,283 | 72 | 314 | 270 | 605 |
| Synthetic anthology | 86,122 | 512,460 | 58,614 | 336 | 1,034 | 990 | 2,069 |
| Synthetic extended anthology | 172,090 | 1,074,618 | 120,624 | 732 | 2,114 | 2,070 | 4,265 |

Native Block counts use the compact encoder's complete representation, including generated structures; the converter's earlier `stats.blocks` metric is lower and must not be confused with them. Definition/segment/property counts describe different, overlapping aspects of annotations and should not be summed as unique objects.

Precise Chrome JS heap samples, **MiB median (minimum–maximum), n=5**. These are not peak RSS, retained-heap measurements or allocation totals. “Mounted” is sampled after the short typing probe for letters; it includes live history and projection state. GC can occur between samples, so Metadata can have a lower heap than the earlier mounted point.

| Fixture/build | Before timed import | Mounted | Metadata |
| --- | ---: | ---: | ---: |
| small / before | 31.6 (10.4–32.0) | 58.5 (30.7–65.3) | 61.4 (42.6–77.4) |
| small / final | 31.0 (10.3–31.2) | 53.7 (45.0–55.7) | 58.9 (46.5–65.8) |
| large / before | 31.5 (29.9–32.0) | 155.9 (152.9–161.4) | 175.7 (172.9–181.0) |
| large / final | 31.3 (29.3–31.3) | 138.2 (132.3–147.6) | 156.7 (139.3–167.7) |
| anthology / before | 31.5 (30.3–32.0) | 393.1 (381.9–398.1) | 404.7 (394.9–409.7) |
| anthology / final | 31.2 (29.5–31.4) | 371.4 (368.7–371.5) | 383.4 (381.7–384.3) |
| populated / before | 200.8 (197.5–213.5) | 261.9 (214.5–274.6) | 263.8 (234.2–294.3) |
| populated / final | 200.6 (183.1–212.4) | 249.7 (208.6–342.8) | 247.9 (228.4–340.0) |

Typical sampled heap falls, but the populated maximum grows and the larger fixture below has higher final mounted heap. No uniform memory improvement is claimed, and no complete allocation profile or peak-memory guarantee was obtained.

### Beyond 58,000 Cells

The extended fixture is explicitly **synthetic**, retaining A041209 and adding thirty sections of twenty annotated paragraphs, versus twelve sections for the existing anthology. It is not presented as an authentic scholarly edition. Both larger browser samples complete without truncation, with one Page and complete native semantics. Single-sample results are exploratory, not a reliable before/after speed estimate; minimum, maximum and median equal the single value.

| Stage, n=1 each | Before | Final |
| --- | ---: | ---: |
| Worker execution | 125.8 ms | 100.3 ms |
| Worker round trip | 185.3 ms | 140.9 ms |
| Admission | 9,805.6 ms | 10,761.7 ms |
| Candidate | 7,033.2 ms | 2,270.2 ms |
| Projection subset | 2,056.1 ms | 2,845.9 ms |
| Open/render | 6,153.8 ms | 9,694.2 ms |
| Usable text | 23,177.9 ms | 22,867.0 ms |
| Metadata | 808.9 ms | 1,586.9 ms |
| Mounted heap | 822.1 MiB | 1,081.9 MiB |

The extended case has 2.06× anthology Cells, 2.18× Blocks and 2.09× definitions, but final usable time is 3.53× the anthology median. Candidate capture improves markedly while admission and mounting worsen in these single samples. This shows an unfavourable scaling envelope and possible allocation/GC pressure, not proof that every underlying algorithm is quadratic or that these local fixes caused the entire difference. The final headless native-persistence capacity test also passes at 300,100 Cells (18.17 s, sampled heap 682 MiB); that is a capacity/correctness check, not an equivalent browser latency measurement.

**Proposed anthology engineering target: <4.7 s consistently to usable text.** The observed cost drivers are incoming Cell/record materialisation, structural Blocks, annotation definitions and rendered occurrences. Relative to the large letter, anthology growth is 3.39× Cells, 4.67× Blocks, 3.29× segments, 3.67× definitions and 3.42× properties; observed final median elapsed growth is 3.81×. A conservative non-superlinear allowance applies the largest of these work-size ratios (4.67) to the retained one-second large-letter target, rounded to 4.7 seconds. This allows higher structural density rather than extrapolating XML bytes or choosing a threshold just above today's result. It is a proposed target for review, not a newly approved release gate or a guarantee for arbitrary TEI. Current anthology results (minimum 6.30 s) miss it. Validate the envelope against additional authentic books/editions before adopting broader size-based targets.

## Regression and browser qualification

Final implementation: **247 passed, 2 failed, 249 selected tests across 25 suites**, run in three non-overlapping groups. Both failures also reproduce on unchanged `a089fab`; neither is suppressed or fixed here. This is not a claim that the entire repository test suite passes.

| Qualification | Actual result |
| --- | --- |
| Final native/session/resource/record-batch/compact-oracle/linked-annotation/minimap/find group | 82/82 passed, 10 suites, 18.58 s |
| Final TEI converter/integration/rendering group | 49/49 passed, 3 suites, 21.41 s |
| Final remaining lifecycle/boundary/history/interchange group | 116 passed, 2 failed, 12 suites, 14.93 s |
| Unchanged `a089fab` comparison of the two failing suites | 30 passed, same 2 failed, 15.79 s |
| `npm run typecheck` | Client and server passed |
| Production performance build, 8-GiB Node heap allowance | Passed, 46.89 s; existing bundle/dynamic-import warnings |
| Real Chrome/worker TEI smoke, both WeGA letters | Passed: trusted insertion, Undo/Redo, capture/reload, one Page, Text initially selected, Metadata, cancellation and timeout |
| Forty primary complete Flint measurements | Native completeness, no truncation, dirty candidate, one publication/probe run, no admission snapshots or unrelated Document builds verified |

The failures are [Flint close-window lifecycle](src/application/flint-lifecycle.test.tsx:142), where a projection remains after closure, and [window minimisation/remount lifecycle](src/rendering/window-icon.test.tsx:124), where an editor mount remains when the test expects its removal. The former was already documented in the previous milestone; the latter was additionally isolated and reproduced in this investigation using read-only baseline overrides. They remain regression requirements to resolve separately. The final failing assertions match the baseline; no connection to these retained optimisations was demonstrated.

The new [seven-test bounded-work suite](src/persistence/native-admission-performance.test.tsx) verifies Page lookup scope, leaf allocation/target validation, immutable capture isolation, the foreign-definition rewriting fallback, rejected missing canonical provenance, unusual record-key/caller/history isolation, and coherent admission with Undo/Redo/native equality. Existing suites cover ownership boundaries and placement-only changes, retained/unplaced definitions, linked-annotation invalidation, native identity/bindings, candidate/manual-save semantics, compact encoder equivalence, overlapping standoff annotations, unresolved references, alternatives and malformed-input recovery. Unresolved **TEI references** remain valid data; the missing-provenance rejection test concerns an invalid canonical linked-definition dependency, not a missing TEI target.

The earlier broad exploratory run had 246/248 passing (the same two baseline failures), before the bulk-setter experiment was reverted and the seventh new test was added. An initial new-test failure was a fixture missing an authored Block ID; the fixture was corrected, then the final groups above were run. Test failures and unsuccessful experiments were not silently discarded.

### Typing and bounded work

The existing Chrome typing benchmark exercised 25,000 Cells in 250 paragraphs, forty insertion/deletion edits, trusted CDP insertText/Backspace, Undo/Redo, Enter and start/end/empty splits. Both before/final-source runs passed with zero repository snapshots and stable unrelated Cell DOM. Mean handler time was 2.16→1.93 ms, median 1.2→1.2 ms, p95 7.2→4.6 ms and maximum 32.3→23.7 ms. This benchmark's default host is standalone and uses the real editor/input path; it is not substituted for Flint import acceptance or claimed to measure screen latency.

The actual full-Flint import harness separately ran six insert/delete events after each letter import. All restored text and took zero snapshots. Across runs, median handler estimates were small 3.1→3.0 ms, large 1.2→1.1 ms, populated 1.3→1.4 ms. There was a final large-letter 29.2-ms worst event in one short probe versus a 1.4-ms before maximum. Such a short, shared-machine probe cannot establish a tail-latency guarantee or attribute that event to a code change. The matched ordinary-typing benchmark and bounded-work tests show no sustained regression; full-Flint typing tail stability remains a qualification limitation.

No new work is scheduled on keystrokes: no vault enumeration, full snapshot, dirty-state serialization, global validation or unrelated projection rebuild was introduced. Tests retain the specialised input/history paths, local linked-annotation invalidation and unchanged unrelated Cell DOM. No geometry caches, highlight layers or deferred background jobs were added.

## Remaining constraints and architectural review boundary

The retained fixes remove proven duplicate work without changing what a valid commit or capture means. They do **not** establish that one second is impossible. They establish that the present eager lifecycle still spends roughly 957 ms in admission, 223 ms in candidate registration and 492 ms in opening at the large-letter medians, in addition to the worker round trip. Eliminating every worker millisecond would not meet the target.

The following are review options, **not implemented designs or permission to weaken validation**:

| Option for a separate qualification | Measured opportunity | Contract that needs proof |
| --- | --- | --- |
| Reuse admission facts for immediate candidate registration | Remaining ~223 ms capture | Bind evidence to exact graph/resource identity and relevant destination revision; cover linked-definition provenance, ownership, binding changes and invalidation; fall back to ordinary capture. Existing membership evidence alone is insufficient. |
| Reduce private staging/planning/history copies | ~73 ms staging, ~117 ms inverse/application and ~91 ms history | Define immutable record ownership and lifetime across canonical publication, history, Undo/Redo and later mutation. Do not alias mutable caller/canonical records or assume the decoded graph remains the destination graph. |
| Qualify affected-resource admission validation/index updates | ~71 ms combined validation in empty workspace, ~242 ms populated, plus global indexes | Prove unchanged destination facts remain valid while checking new identities, bank ownership, registered roots, bindings and cross-resource dependencies. Reuse existing structural/revision evidence where sufficient; do not add a generic trusted-admission bypass. |
| Avoid unnecessary workspace occurrence materialisation | Workspace builds the same incoming structural/Cell population that a distinct active Document view later materialises | Decide which occurrences the workspace must expose and which consumers rely on them. Preserve independent routes, selection, references, view payloads and cleanup; direct sharing of mutable projection nodes is unsafe. |

These changes would affect qualification/ownership boundaries beyond this brief's local remediation authority. Work stops here for architectural review. No speculative admission certificate, replacement repository, projection cache, lazy conversion or renderer rewrite has been introduced.

Remaining limits: one machine/browser, uncontrolled background host activity, only five primary samples per case, one extended sample per build, synthetic larger documents, no complete allocation/peak-memory study, no populated live-vault/backend matrix, and two baseline lifecycle failures. The 120,624-Cell result especially needs repeated, controlled measurements before attributing its scaling to a specific algorithm. The anthology target above is proposed for review. The release blocker remains open; TEI Milestone 2 has not begun.

## Reproduction and evidence index

[Harness instructions](scripts/tei-performance/README.md) document interval definitions and optional probes. Final acceptance commands, run sequentially after build completion, with the production HTTP server on port 3108:

```sh
NODE_OPTIONS=--max-old-space-size=8192 node scripts/tei-performance/build.mjs
TEI_FLINT=1 TEI_RUNS=5 TEI_CASES=small,large,anthology,populated TEI_LABEL=admission-final node scripts/benchmark-tei-browser.mjs
TEI_FLINT=1 TEI_RUNS=1 TEI_CASES=extended TEI_LABEL=admission-final-extended node scripts/benchmark-tei-browser.mjs
TEI_FLINT=1 TEI_TRACE=1 TEI_CPU=1 TEI_RUNS=1 TEI_CASES=large TEI_LABEL=admission-final-trace node scripts/benchmark-tei-browser.mjs
npm run typecheck
```

The before production run was collected at `a089fab` with only the retained instrumentation/harness patch applied. To reproduce, apply [that patch](artifacts/tei-performance/admission-instrumentation.patch) to an isolated checkout of `a089fab`, build and run the same baseline fixture list. Do not use `TEI_BASELINE_REF=5e2f0f4`: that older mode deliberately measures the original TEI implementation, not this follow-up's baseline. [The baseline Vite config](scripts/native-admission-baseline.vite.mjs) separately overrides the four changed production modules from `a089fab` for lifecycle failure reproduction without modifying the working tree.

Local QA artefacts are ignored by Git; the report contains the principal measured results independently of them. Retain/copy the artefacts with the review if it needs the complete sample-level evidence:

- [Before](artifacts/tei-performance/admission-before.json), [final](artifacts/tei-performance/admission-final.json), [rejected setter experiment](artifacts/tei-performance/admission-after.json).
- [Extended before](artifacts/tei-performance/admission-before-extended.json), [extended final](artifacts/tei-performance/admission-final-extended.json).
- [Before rendering attribution](artifacts/tei-performance/admission-before-render-summary.json), [final rendering attribution](artifacts/tei-performance/admission-final-render-summary.json). Matching CPU profiles/timeline JSON and stage checkpoints are in the same directory.
- [Final focused tests](artifacts/tei-performance/native-admission-final-tests.log), [final TEI tests](artifacts/tei-performance/native-admission-final-tei-tests.log), [final remaining tests and command](artifacts/tei-performance/native-admission-final-remaining-tests.log), [baseline failure reproduction](artifacts/tei-performance/native-admission-baseline-failures.log).
- [Typecheck](artifacts/tei-performance/native-admission-final-typecheck.log), [browser smoke](artifacts/tei-performance/native-admission-browser-smoke.json), [typing before](artifacts/tei-performance/native-typing-before.log), [typing final](artifacts/tei-performance/native-typing-after.log).
