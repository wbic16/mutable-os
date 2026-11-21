# Compact Canonical Text — Milestone 2 implementation and qualification

20 November 2026. This report continues the accepted `COMPACT_CANONICAL_TEXT_PROOF_OF_CONCEPT.md`. Work is confined to `scripts/compact-canonical` and qualification reports. Production repository, native wire format, history readers and application defaults are unchanged.

## Decision

The experiment now demonstrates mixed-object composition, selection bookmarks, browser structural editing and incremental presentation updates within a deliberately bounded scope. This establishes a more concrete integration boundary, **not production parity or release readiness**. Long-Block synchronous presentation work is substantially reduced; browser layout/selection, eager activation, canonical string processing and Cell-control costs still require separate interpretation. The existing production admission blocker remains open.

The separate [architectural qualification](COMPACT_CANONICAL_TEXT_MILESTONE_2_ARCHITECTURAL_QUALIFICATION.md) specifies the required repository, command, history, projection, input and persistence contracts before any production integration decision.

## Implemented changes

- `model.ts`: compound transactions accumulate affected Block states and deltas, validate structural results before publishing once, reject failed transactions without history/publication, and attach stable change identities to local Undo/Redo. Split/empty-sibling/join commands accept the invoked structural placement, including a shared reference. Existing mode, adjacency, attachment and shared-right restrictions remain.
- `editor.ts`: uses production `InputGateway`, `CrossBlockInput`, `CrossBlockSelection`, mounts, focus, selection and measurement services. It routes Enter, boundary deletion and exactly two adjacent Blocks for cross-replacement into the compact model. Structural reconciliation mounts/removes affected occurrences and preserves surviving Cell identities. Structural discovery still scans the experimental structural graph; ordinary typing does not. Annotation/object validation is separate from structural invalidation, so validating a payload does not rebuild structural routes.
- Selection history captures before/after bookmarks keyed by change identity, containing occurrence, content, placement, captured version, directional selection set and endpoint affinity. Historical restoration checks surviving identity and restores through mounted boundaries, without retaining DOM nodes or Cell identities. Synchronous consecutive programmatic commits finalize the preceding bookmark before it can be overwritten. Gateway-owned text edits perform one queued caret restoration rather than a redundant synchronous restoration as well.
- `composition.ts`: a session-owned bridge through the existing completion composition hook. Provisional browser DOM is observed only for dirty Cell keys/loose nodes; canonical text remains unchanged until commit. A committed composition produces one typed range replacement, preserving images and rebasing annotations. Cancellation restores canonical DOM and the original selected range. Disjoint external replacements rebase the draft range; overlapping/structural changes retain a conflict draft and record a notice through the adapter notice port. Composition spanning a selected image is conservatively rejected and retained, not silently converted into text.
- `editing-index.ts`: occurrence-local groups of up to 256 Cells map keys to current offsets without rewriting every suffix Cell. Insert/delete reindexes boundary groups and inserted Cells; suffix **group heads** still shift. ASCII grapheme neighbors read bounded context. Complex Unicode expands to safe context and uses the existing segmenter; images are explicit atomic boundaries, including a following combining mark.
- `presentation.ts`: splices changed editing Cells, reuses unaffected identities and paints inserted/changed style intervals. It compares old/new style runs in mapped coordinates; a changed annotation may legitimately repaint its affected range. No per-edit full presentation traversal or new renderer is introduced.
- `overlays.mjs`: fail-closed build-only proposals for incremental updates/key lookup in `DirectCharacterCells`, and optional mounted grapheme lookup in the existing gateway/cross-block service. Production source files are not rewritten. `COMPACT_M2` is enabled by default; setting it to `0` loads the accepted M1 experiment from `f3ea056` for comparison.

The build overlays are interface experiments, not production API changes. The adapter still uses explicit nominal casts at unqualified service boundaries. Each isolated editor mount owns service instances/document listeners; two-occurrence and populated-fixture results do not qualify arbitrary open-document scaling. Production integration must reuse workspace services rather than replicate those listeners. Unsupported clipboard/multicaret/application operations throw rather than constructing a shadow canonical Cell repository.

## Correctness and compatibility

Mixed-object composition is tested before, after and away from the image, plus cancellation, original selection restoration, a disjoint external insertion and an overlapping external insertion. Both live occurrences receive the committed result; the canonical image descriptor survives. CDP composition drives actual Chromium composition/input events, but is not coverage of every OS IME, candidate window or platform-specific event sequence.

Browser structural cases cover Enter at beginning/middle/end, selected Enter as one commit, Backspace/Delete joins, Shift-arrow cross-Block selection and replacement, Undo native/selection restoration, shared-reference split, unrelated identity retention, disposal/reopen, different-mode join rejection, and split next to an inline image with overlapping annotations. Cross-replacement intentionally supports exactly two adjacent ordinary Blocks. Managed assets, clipboard, multicaret, drag selection, vertical layout navigation, active alternative editing and general multi-Block topology remain outside this adapter.

Native differential tests use the real canonical Cell repository and commands. Existing semantic/ownership/definition/reference/Unicode tests are retained. Both zero-width endpoint forms retain their stored difference through replacement, structural edits, Undo/Redo and native round trips; no persisted policy flag is added. Invalid inserted objects and rejected compound edits publish nothing. Stale versioned model replacements are rejected.

Production image insertion still differs from text insertion: `TreeCommands.insertInlineImage` does not rebase host standoff offsets. Five new boundary tests compare experimental typed-image insertion with production one-character insertion, verify payload retention, native round trip and exact local Undo/Redo. The proposed consistent logical insertion policy, affected commands and old-history compatibility consequences are documented in the architectural qualification. A production semantic change is not silently included here.

The retained Cell-free read-only proof and tests are unchanged in scope. It remains suitable for a future preview experiment, not a full Flint layout/annotation renderer.

## Performance method and limits

The original M1 single-Block fixture remains 120,624 repeated `x` characters with one bold annotation, under the same eager character DOM and `white-space: pre-wrap` styling. It is an intentionally extreme unbroken-text stress case. Its reported compact admission/activation/typing median/p95/Undo were 1.0 / 810.2 / 292.3 / 495.1 / 510.5 ms, with 482,498 presentation visits for four dispatches. That baseline is retained in the accepted report and local `artifacts/compact-canonical/long/performance.json`.

Measurements were taken on this Apple M1 workstation (Darwin 24.5.0), Chrome 157.0.8103.80, with Node 22.12.0 runners. M2 detail runs use six rounds at beginning/middle/end, giving 18 samples per operation per model/occurrence count. They record insertion, Backspace, forward deletion, combining-grapheme insertion/deletion, Undo/Redo and selection. A second independently mounted editor shares the same canonical model. `performance-m2.mjs` records synchronous dispatch and two-frame settled duration, post-GC JS/embedder heaps, CDP layout/task metrics, instrumented exclusive costs and sampled CPU names. `summarize-m2.mjs` computes median, nearest-rank p95 and maximum. With 18 samples, nearest-rank p95 equals the maximum; the earlier proof’s workload/sample count differs, so its timing ratio is not a paired experimental estimate.

These timing events are dispatched `beforeinput`; trusted CDP input is separately covered by browser checks. Frame timings are not a guarantee of physical input-to-display latency. Instrumentation itself adds overhead. Post-GC retained heaps are not true peak/RSS measurements, and the profile does not establish exclusive paint/GC time. The Cell comparator uses the same minimal presentation adapter and reconstructs compact reads from real Cell records; it is not full Flint. The independent real Flint typing sentinel is the production evidence.

The initial M2 profile found duplicate caret restoration after gateway edits. A later audit also found that the profiler retained the preceding model through its stop closure, contaminating post-edit heap deltas; the runner now drops that closure before teardown and baseline GC, and the detailed run was repeated. Its pre-correction evidence is retained separately; final tables use the corrected adapter. The Unicode-image and selected-cancellation fixes also received final correctness checks.

### Detailed long-Block results

Synchronous milliseconds, **median / p95 / maximum**, 18 samples per operation. The first proof’s mixed insertion/Backspace dispatch median was 292.3 ms; its workload and quantile method differ, so the retained baseline establishes context rather than a paired speedup ratio.

| Model / occurrences | Insert | Backspace | Forward delete | Grapheme Backspace | Undo | Redo | Selection |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact / 1 | 7.4 / 18.5 / 18.5 | 8.2 / 15.7 / 15.7 | 8.6 / 19.6 / 19.6 | 8.8 / 16.8 / 16.8 | 0.8 / 1.4 / 1.4 | 0.6 / 33.2 / 33.2 | 0.3 / 0.9 / 0.9 |
| compact / 2 | 8.1 / 24.9 / 24.9 | 8.7 / 17.3 / 17.3 | 10.4 / 28.3 / 28.3 | 8.9 / 34.4 / 34.4 | 1.1 / 14.2 / 14.2 | 0.9 / 9.4 / 9.4 | 0.3 / 1.5 / 1.5 |
| cells / 1 | 282.4 / 432.1 / 432.1 | 298.5 / 436.4 / 436.4 | 300.3 / 762.1 / 762.1 | 288.5 / 619.7 / 619.7 | 262.5 / 413.0 / 413.0 | 239.8 / 309.6 / 309.6 | 0.1 / 0.2 / 0.2 |
| cells / 2 | 413.9 / 1385.0 / 1385.0 | 332.7 / 1044.6 / 1044.6 | 314.8 / 901.0 / 901.0 | 317.7 / 801.4 / 801.4 | 314.9 / 698.1 / 698.1 | 349.3 / 795.0 / 795.0 | 0.1 / 2.1 / 2.1 |

Two-frame settled durations for the same operations (ms, median / p95 / maximum):

| Model / occurrences | Insert | Forward delete | Grapheme Backspace |
|---|---:|---:|---:|
| compact / 1 | 311.2 / 454.6 / 454.6 | 302.4 / 500.4 / 500.4 | 306.0 / 554.7 / 554.7 |
| compact / 2 | 455.5 / 2242.3 / 2242.3 | 512.6 / 1100.4 / 1100.4 | 377.2 / 1675.0 / 1675.0 |
| cells / 1 | 595.1 / 804.8 / 804.8 | 625.7 / 1178.3 / 1178.3 | 521.4 / 1092.1 / 1092.1 |
| cells / 2 | 910.8 / 2112.9 / 2112.9 | 751.2 / 1712.7 / 1712.7 | 864.6 / 1781.0 / 1781.0 |

**The settled timings remain unacceptable for production long-Block editing.** Moving the remaining caret restoration to the gateway’s existing microtask removes duplicate work, but the browser still pays for selection and layout. A small synchronous number is not proof of responsive display.

Beginning / middle / end insertion medians (ms): compact / 1: 7.2 / 7.2 / 8.2; compact / 2: 10.4 / 8.5 / 7.6; cells / 1: 287.0 / 289.9 / 271.8; cells / 2: 430.2 / 388.3 / 368.8. All round sequences restored canonical text and every shared presentation.

Long-Block stages and post-GC memory. Each row is one detail scenario, not a repeated admission median; activation is the **first occurrence** only. Active memory includes the requested one/two occurrences. Additional post-edit JS includes history, measurement and session state, not history alone.

| Model / occurrences | Admission ms | First activation ms | Capture ms | Active JS + embedder MiB | Additional post-edit JS MiB |
|---|---:|---:|---:|---:|---:|
| compact / 1 | 2.9 | 760.9 | 5.4 | 24.12 + 157.30 | 16.70 |
| compact / 2 | 1.5 | 1264.1 | 1.8 | 52.80 + 301.68 | 16.06 |
| cells / 1 | 4244.4 | 738.5 | 2439.6 | 105.38 + 154.16 | 23.06 |
| cells / 2 | 4120.5 | 742.3 | 2723.5 | 129.26 + 302.62 | 22.46 |

Across 144 compact commits, one occurrence visited **108 presentations**, and two visited **216**; both produced **zero full validations, captures or projection allocations** during measured editing. Work follows changed Cells/style intervals instead of sweeping 120,624 presentations. The original proof visited 482,498 presentations across four simpler dispatches. Array suffix shifts and canonical string traversal still occur; these counters do not claim otherwise.

Instrumented compact costs across all operations (ms, exclusive among nested wrappers; native browser work can occur inside these calls):

| Category | One occurrence | Two occurrences |
|---|---:|---:|
| Canonical replacement outside nested callbacks | 702.5 | 668.1 |
| Standoff transformation | 3.5 | 5.9 |
| History construction | 33.5 | 75.2 |
| Presentation intervals | 2.7 | 3.8 |
| Keyed DOM update | 60.0 | 112.5 |
| Occurrence position index | 16.2 | 71.6 |
| Grapheme access | 12.8 | 3.6 |
| Selection DOM calls | 5614.0 | 10994.8 |
| Selection mapping | 26.0 | 27.8 |
| Geometry invalidation | 0.3 | 0.5 |
| Publication outside nested callbacks | 79.5 | 213.9 |

Chrome separately recorded layout/style durations of compact / 1: 18841.2 / 311.9 ms; compact / 2: 43246.1 / 742.7 ms; cells / 1: 16324.1 / 340.4 ms; cells / 2: 44325.1 / 1196.0 ms. These browser categories overlap wrapped wall time and must not be added as exclusive phases. The minimal renderer has no reactive computation per Cell. The CPU profiles retain sampled GC activity; no exclusive paint or exact GC pause claim is made.

The canonical replacement cost includes code-point scans, slicing and immutable string construction. It is a measured residual cost, not grounds to introduce a rope speculatively. A subsequent length-scaling and layout/selection investigation should retain this fixture and the real Flint benchmark.

Final evidence: `long-detail.json`, `long-summary.json`, `long-detail.log`. Superseded diagnostics: `long-detail-before-caret-fix.*` and `long-profile-retention-diagnostic.*`; their post-edit heap deltas are not used in the table above.


### Preserved fixture matrix

Three repetitions per fixture/model; admission/activation/capture are medians in ms. Typing pools 60 dispatches per row (median / nearest-rank p95 / maximum). Active post-GC memory includes canonical content and eager presentation; populated rows include background documents/surfaces. These are minimal-harness measurements, not production lifecycle timings.

| Fixture | Model | Admission | Activation | Capture | Typing median / p95 / max | Active JS + embedder MiB |
|---|---|---:|---:|---:|---:|---:|
| small | compact | 8.6 | 22.8 | 9.0 | 0.9 / 1.4 / 1.7 | 1.01 + 3.85 |
| small | cells | 117.1 | 24.2 | 68.9 | 2.1 / 3.3 / 4.6 | 3.28 + 3.85 |
| large | compact | 18.0 | 98.9 | 17.9 | 0.5 / 1.2 / 1.3 | 4.44 + 20.32 |
| large | cells | 530.1 | 132.4 | 406.8 | 0.8 / 1.3 / 1.6 | 16.57 + 20.32 |
| anthology | compact | 93.1 | 356.6 | 65.1 | 0.5 / 0.8 / 0.9 | 13.86 + 68.42 |
| anthology | cells | 2012.5 | 391.7 | 1437.6 | 0.8 / 1.3 / 1.4 | 54.10 + 68.44 |
| extended | compact | 144.8 | 632.3 | 217.9 | 0.5 / 0.9 / 1.6 | 28.76 + 140.52 |
| extended | cells | 4536.9 | 835.4 | 3331.0 | 1.1 / 1.8 / 21.3 | 111.13 + 140.52 |
| populated | compact | 20.6 | 115.9 | 18.4 | 0.5 / 0.6 / 0.8 | 8.12 + 39.00 |
| populated | cells | 497.8 | 121.3 | 391.0 | 0.8 / 1.0 / 1.0 | 35.96 + 39.00 |
| native | compact | 2.2 | 22.5 | 2.7 | 0.9 / 1.3 / 1.7 | 0.22 + 0.77 |
| native | cells | 24.1 | 19.2 | 14.5 | 1.5 / 2.3 / 2.4 | 0.72 + 0.78 |

Compact read-only display medians (including frame waits), ms: small 21.7, large 21.9, anthology 16.8, extended 17.3, populated 7.8, native 21.9. Forbidden-Cell probes passed for compact admission/read-only stages; native input bytes were read only. Every typing loop restored text.

### Real production Flint sentinels

The existing real-Flint typing runner passed trusted character input and Undo on the ordinary native 499-character paragraph: synchronous **10.7 / 25.0 / 29.3 ms**, settled **14.2 / 29.2 / 35.7 ms** (median / p95 / maximum), with **zero snapshots, save-status reads, worker starts and service requests**. Its separate two-frame measure was 28.8 / 142.4 / 179.9 ms. The previous accepted sentinel was 6.0 / 13.0 ms synchronous and 8.0 / 15.1 ms settled; this run is slower and is not evidence of a production optimization or a controlled regression estimate. Production source is unchanged, and a single-machine diagnostic sample does not establish a latency distribution across machines.

The existing instrumented full-Flint admission bundle was reused for one small/large WeGA sentinel each (ms):

| Fixture | Worker round trip | Native admission | Candidate tracking | Open/render | Usable end to end | Metadata |
|---|---:|---:|---:|---:|---:|---:|
| small | 59.9 | 322.5 | 78 | 126 | 586.4 | 66.7 |
| large | 76.4 | 1037.7 | 298.5 | 633 | 2045.6 | 133.2 |

Both retained one Page, were untruncated, published admission once and took zero admission snapshots. The large letter remains above two seconds usable end to end; the small sample is also above 500 ms. **The production release blocker is unresolved.** These single diagnostic samples do not supersede the earlier repeated acceptance series in `NATIVE_DOCUMENT_ADMISSION_PERFORMANCE_REPORT.md`.

Evidence: `performance.json`, `matrix-summary.json`, `flint-typing/results.json`, `flint-typing/typing.cpuprofile`, and `flint-release/flint.json` under `artifacts/compact-canonical-m2/`.


## Bounded-work evidence

The 120,624-position regression forbids `model.all()` and `capture()` during local replacement, measures render visits across two live occurrences and asserts that unrelated occurrence updates and full validation counts remain unchanged. The rank regression applies 250 deterministic splices and verifies positions/removal while limiting reindexed Cells to boundary groups plus insertion. Unicode tests compare with complete segmentation, including regional-indicator sequences and ZWJ clusters; ASCII lookup is bounded independently of paragraph length. Browser trusted input also forbids scans/capture, checks full validation and counts caret restorations.

The existing `SelectionService.mapContentEdit` and experimental history capture still enumerate this editor’s retained selection sets; they do not enumerate unrelated documents or every Cell. A production content-to-selection index and history-bookmark lifecycle/branch pruning remain necessary, and no large-selection-set scaling claim is made.

This is **not constant-time editing**. Canonical code-point length/slicing and immutable span replacement still traverse/copy the affected string. Arrays shift suffix references, the occurrence index shifts group heads, styles depend on affected annotation runs, and browser reflow/selection can depend on the long paragraph. No rope or piece table is introduced without evidence. Structural/annotation mutations still use the experimental full native structural witness for ownership/definition validation; production would require affected-dependency validation, as specified separately.

No vault discovery, persistence, network indexing, dirty-status serialization or unrelated document snapshot is added to the input path. The experiment has no native saving service; canonical changes are immediate and production manual-save semantics are unchanged.

## Regression evidence and failures

- **157 distinct focused tests passed across 12 suites:** the broad run passed 155, followed by a final 66-test experimental run containing two added regressions. The 91 production tests cover native resources/admission, durable and local history, inline bounded work, character rendering, graphemes, provisional input and TEI compact-native fidelity. This is focused regression coverage, not the entire repository test suite.
- **67 browser assertions passed** on the final experimental bundle, with no browser exceptions in the qualified routes. Read-only screenshot/assertions are retained.
- Application/client and server `npm run typecheck` passed; the final isolated experiment TypeScript check also passed. Final experimental Vite build passed (114 modules).
- `git diff --check` passed. No production source file is changed.
- Logs: `regressions.log`, `model-tests-final.log`, `browser.log`, `browser-checks.json`, `typecheck.log`, `experiment-typecheck.log`, `build.log`. The matrix runner repeats correctness assertions before measurements.
- Incomplete: OS/platform IME coverage; selected-image composition replacement; durable compact history; general clipboard/multicaret; production feature/rendering parity; true peak/RSS and exclusive paint timing; sustained history soak; length-scaling curves beyond the preserved short-paragraph/120,624-position fixtures. These remain qualification gaps.

The first resumed test invocation failed before collecting tests because the shell selected an old Node binary whose crypto API is unsupported by Vite. Subsequent tests use the installed Node 22.12.0. The expanded browser run initially failed the shared-reference split assertion because the fixture had not mounted its reference occurrence; that fixture was corrected. Review additionally found the synchronous history bookmark race, object/combining-mark boundary and cancellation-selection gaps; each received a targeted regression. A final reopening-order correction preserves a non-final occurrence’s DOM placement and is covered by the 67th browser assertion. It does not change the measured edit/admission paths; the fixture matrix was not repeated for that lifecycle-only correction. The `COMPACT_M2=0` build also passed and reproduced all 18 M1 browser assertions, with its original mixed-object IME and selected-range Undo gaps still reported separately. No historical failed or superseded measurement is presented as a final pass.

## Remaining gaps and next milestone

1. Exact production history and old Cell-keyed archive replay remain on their existing engine. Experimental local Undo/Redo is not proof of durable history, selective undo, branch/checkpoint/export compatibility or a persisted compact operation format.
2. The production composition dependency is precisely isolated at `InputGateway.reconcileStandoffText` and its completion ownership hook. The prototype supports its qualified mixed-object cases, but selected-object replacement and OS IME breadth require further qualification.
3. Projection still requires a real separation between canonical structural records and editing occurrences. Clipboard, multicaret, linked annotation identity/monitors, managed assets, alternatives and application consumers must be audited before deleting production Cell projections.
4. Compact workspace collision tests do not implement Object Bank admission, foreign binding reuse, lifecycle indexes or native recovery. No document/history migration or persistence change is implemented.
5. Presentation traversal is bounded, but eager activation, full-paragraph reflow/selection and canonical string work remain measurable costs. Prototype results cannot clear the production admission or long-Block responsiveness gates.

**Recommendation:** continue with the detached repository/write-set and history contract spike described in the architectural qualification, plus targeted layout/selection profiling on the existing renderer. Do not migrate the production repository. A bounded integration decision should require the explicit contracts and remaining feature gates, not treat the prototype as a drop-in replacement.

Reproduction commands and limitations are in [`scripts/compact-canonical/README.md`](scripts/compact-canonical/README.md). Local raw evidence is under ignored `artifacts/compact-canonical-m2/`; the principal findings are retained here for review without those files.
