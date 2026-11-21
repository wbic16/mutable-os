# Compact Canonical Text — Proof of Concept

**Decision: Continue experimental qualification.** The experiments demonstrate substantial Cell-free admission and memory benefits, atomic shared-text editing, native round trips and reuse of real browser input components. They do **not** establish full Flint editor parity. Mixed-object IME, selection history, structural input, feature integration and historical replay remain gates to a production decision.

This is the bounded experiment authorized after `CELL_MATERIALISATION_ARCHITECTURAL_QUALIFICATION.md`, on repository baseline `12f6631`. All new executable code is under [`scripts/compact-canonical`](scripts/compact-canonical/README.md). **No production source, registration, schema, clipboard admission, persistence path or feature default was changed.** No native documents were saved or migrated. The demonstration types/properties remain fixture data.

## 1. Experimental architecture

### One committed authority

[`model.ts`](scripts/compact-canonical/model.ts) stores immutable authored Blocks in a Map. A standoff Block owns an ordered sequence of text strings and typed image objects, its complete property bags and structural edges. Authored IDs, retained definitions, references, relation ownership, property order and multiplicity survive. Block revisions increase monotonically; document revision increases once per commit. There are **zero canonical character/image Cell records and zero canonical inline-Cell placement records**.

`replace` computes text/object splicing and annotation rebasing together, freezes the affected Block and publishes once. Only subscribers indexed to affected Blocks and explicit document consumers are notified. No editing occurrence must be open to edit, inspect or capture the document. Native capture reads canonical data directly; there is no editor flush on Save. Unmaterialized metadata, alternatives and annotations are already present, not deferred semantic work.

Undo/Redo retains before/after references to changed immutable Blocks and inverse text deltas. It does not snapshot the whole document for typing. Structural operations may validate the whole compact document; annotation replacement uses full validation because it can change definition dependencies. Ordinary text insertion/deletion uses the already-validated structural state and existing range transforms. This is an experimental local history implementation, **not** an implementation of Mutable's persistent/exact-history contracts.

Code-point slicing is linear in the affected spans, and updating a mounted paragraph is linear in that paragraph's editing Cells. This is affected-Block work, not constant-time typing. The long-paragraph measurement below exposes that distinction.

### Validation without a hidden Cell graph

`validateCompact` (model.ts:31) parses the native envelope with `parseNativeEnvelope`, validates text-atom grammar, then passes a **structural witness with all inline atoms removed** through the existing `decodeNative`. That reuses root, edge, cycle, ownership, retention, authored identity and structural external-reference checks without constructing any canonical Cells.

Image payloads are decoded through the existing authored-value grammar. The predicates that would otherwise run on image Cell payloads are applied explicitly: external definition/asset descriptors, prohibition on self-resource external definitions, and ownership of local linked annotation IDs. Invalid original inline kinds/bags/text are rejected before admission completes. The witness is discarded; the original complete inline sequences and semantic bags become canonical data.

The build-only probe in [`build.mjs`](scripts/compact-canonical/build.mjs) throws if the native decoder creates **any** text/image atom during compact admission or read-only rendering. Every measured compact admission constructed zero such atoms. Logical editing-Cell allocation is separately counted.

This is a reusable-validator feasibility proof, not permission to maintain two validators indefinitely. The copied image-payload predicates are a drift risk; a production design would need shared, directly tested native predicates. Negative tests compare native rejection for cycles, multiple owners, missing ownership/definitions, malformed images, bad atom kinds, duplicates and invalid inline hosts. Positive tests include retained definitions, reference cycles, explicit unresolved foreign definitions and native-v2 owned resources.

The tiny `CompactWorkspace` is **only a collision/admission test index**. It rejects resource and authored Block-ID collisions atomically. It does not reproduce production reuse, Object Bank publication, foreign binding, post-structural-edit index maintenance or resource-registration lifecycle. It must not replace `admitNativeWithResource`.

### Editing Cells are occurrence-local

[`presentation.ts`](scripts/compact-canonical/presentation.ts) eagerly creates a lightweight Cell presentation sequence for each mounted text occurrence. It retains text/image identity only for editing and DOM reconciliation. Unaffected prefix/suffix keys survive edits; inserted Cells receive local keys. Two occurrences have different editing keys but observe the same canonical Block immediately. Disposal drops the projection; reopening regenerates editing keys from committed canonical data without a revision or history entry.

There is no `CanonicalRepository` hidden behind the compact model. The browser adapter's Cell lookup indexes only mounted editing presentations; it neither stores canonical Cell records nor fabricates a complete placement graph. Native data never contains these local keys.

The real components reused are:

- `DirectCharacterCells`, existing standoff style compilation and `ReplacePositionMap`.
- `InputGateway`, `MountRegistry`, `FocusService`, `SelectionService`, input bindings and grapheme navigation.
- `MeasurementService` and existing `ProvisionalCells`.

[`editor.ts`](scripts/compact-canonical/editor.ts) supplies bounded node/command adapters. It does **not** mount `StandoffEditorView` or construct a `ReactiveEditor`. Nominal casts identify the service boundary rather than claiming structural equivalence to those production services. Unsupported structural input, overlays, clipboard and multicaret commands are deliberately not implemented. No parallel decoration renderer or global geometry cache was added.

## 2. Editing proof and compatibility

### What passed

The mixed fixture contains a Document/Page, two ordinary standoff Blocks, a second live occurrence, overlapping properties, duplicate IDs, idless and linked annotations, a typed image, an owned alternative relation, a plain-text neighbour and a mode-bearing neighbour. It preserves unresolved local/external TEI reference strings in semantic metadata without inventing targets.

The model tests cover:

- Deterministic differential replacements against the actual `CanonicalRepository`/`TreeCommands` and native codec, including Unicode, deletion across images and overlapping properties.
- Atomic text/range publication, two live occurrences, external/programmatic edits, stale-edit rejection and failed-mutation rollback.
- Annotation editing, array ordering/multiplicity, ownership failures and immutable input isolation.
- Undo/Redo native equivalence, unaffected editing identities and monotonic revisions.
- Restricted split, join and two-Block replacement. The left identity/alternative survives; consumed identities return on Undo. Split/cross-edit differential comparisons allow generated identity renaming, not semantic loss.
- Existing conservative mode restrictions, adjacency restrictions, and rejection of shared cross-Block content or an attached/shared right-hand Block. Multiline cross-Block insertion and margin-transfer variants are explicitly outside this proof.
- Capture/reload equivalence while mounted or unmounted; original native value encoding details, including explicit `undefined` on split idless annotations.
- No capture, full validation, whole-document enumeration or unrelated occurrence notifications during ordinary typing. A check installs **500 unrelated subscribers** and verifies none is invoked. One inserted character allocates one editing Cell per affected occurrence, not one per document character.
- ZWJ, combining sequences, non-BMP characters and CR/LF through commits and Undo/Redo. Existing grapheme navigation remains distinct from code-point range coordinates.

The **18 real-browser assertions** use trusted Chrome typing/keyboard/IME input where applicable. They check two-occurrence synchronization, caret movement after external edits, Undo/Redo shortcuts, provisional input/cancellation, annotation updates, grapheme Backspace beside an image, existing geometry-cache reuse, read-only CSS/images and unchanged canonical capture. Text-only IME leaves canonical state unchanged during composition and commits once on completion.

### Approved zero-width policy

The user explicitly selected **equivalent point behaviour, preserving each stored form** during this experiment.

| Stored representation | Experimental default | Legacy differential baseline |
|---|---|---|
| `start = end`, `isZeroWidth: true` | Existing point-affinity rebasing | Existing point-affinity rebasing |
| `end = start - 1`, `isZeroWidth: true` | Same point movement/deletion; keep `end = newStart - 1` | Existing replacement mapper leaves this form unmoved |

The implementation reuses `replacePoint` and `pointAffinity`. Both forms obey the same insertion/deletion affinity; the original endpoint form survives replacement and split/clipping. Undo restores the exact prior authored state. Unrecognized/malformed properties retain the existing fallback rules. No endpoint normalization is performed on admission or capture.

`pointPolicy: 'legacy'` exists only for differential characterization and is not persisted. Production behaviour and old history remain unchanged. Opening an export in the current Cell editor preserves its stored shape, but later edits there still use the legacy rebasing rules; no policy flag is written into the file. This intentional experimental difference must be an explicit compatibility choice in any later production proposal.

### Observed gaps, not completed capabilities

1. **Mixed-object IME:** the production gateway's `reconcileStandoffText` returns when any inline item is not a text Cell (`src/input/gateway.ts:736`). A real browser composition in the mixed fixture left canonical text unchanged while the DOM contained the committed character. Text-only IME success therefore does not establish mixed-object safety. This existing input-path constraint was not rewritten.
2. **Undo selection history:** replacing selection `{anchor:1, head:4}` and undoing restores canonical text, but the experimental adapter restores a collapsed `{anchor:4, head:4}`. Inverse position maps are insufficient to reproduce selection bookmarks. This is an experimental adapter gap; it is not a finding that production Undo has that defect.
3. **Structural browser input:** model-level split/join/cross-Block edits pass within the stated subset. Keyboard Enter/boundary joins, cross-Block selection, placement-based focus transfer and mounting newly created structural occurrences are **not** qualified. Adapting their full production services would exceed the small node/command adapter used here; work stops at this boundary.
4. **Typed-image insertion command:** generic compact replacement rebases annotations around an inserted object. Current `TreeCommands.insertInlineImage` inserts the image without that rebasing (`src/block-tree/commands.ts:1310`). A characterization test records `[1,4] → [2,5]` versus unchanged `[1,4]` for insertion at zero. Existing mixed sequences and text replacements across them round-trip correctly, but these two insertion APIs must not be called equivalent without another compatibility decision.
5. **Feature/history contracts:** annotation identity monitors, linked-definition rendering overlays, live foreign bindings, active alternatives, asset binding, clipboard, multicaret, document dirty indicators/manual-save commands and production persistent history are not wired into the experimental host. Canonical semantics are retained, but the full corresponding UI behaviours are not demonstrated.
6. **Composition under external mutation and asynchronous completion:** invalidation of a stale numeric edit is tested; a full concurrent IME/Scry lifecycle is not. Native browser composition must not be disturbed by a shared external edit without an explicit cancellation/reconciliation policy.

These are substantive reasons for the exit decision. The proof does not satisfy every editor-parity gate from Section 11 of the accepted qualification.

## 3. Cell-free read-only rendering

`readonlyRuns` divides text at relevant CSS-property and image boundaries. It uses the existing `compileCellStyleRuns`/`cellStyleAt` cascade, including source-order precedence and overlapping styles. It does not nest crossing ranges into a hierarchy. Unknown/nonvisual annotations remain canonical data without an invented visual effect.

Supported: direct text CSS styles, explicit foreground/background colours, overlapping style combinations and inline images with directly usable sources/alternative text. Model-level comparisons check the resulting style at every position against the existing style helper. Browser computed styles and the inspected screenshot verify the exercised combination. Capture is unchanged by rendering, and both canonical and editing Cell construction remain zero.

This is a **flat display of standoff definitions**, including metadata and owned alternative definitions, not Flint's Document/Tab/Page layout or an active-alternative selector. Complete data preservation must not be confused with full presentation coverage.

Explicitly unsupported presentation includes Block themes/alignment/layout, linked-definition overlays, managed-asset resolution, conceal/reveal projection, active alternative selection, zero-width markers, per-character/region/noise effects, SVG decoration and geometry-dependent interaction. Diagnostics identify these families where detected. Plain/source/media/container Block rendering and external-resource UI are not implemented. Font shaping/ligatures across run boundaries have not received full pixel-parity qualification. No read-only selection-to-editor promotion or editing virtualization was attempted.

## 4. Comparative performance

### Method and comparability

Production-built isolated browser bundle; Chrome 157.0.8103.80, Apple M1, eight logical CPUs, macOS/Darwin 24.5.0, 1280×900 headless viewport. Three serial repetitions per fixture/model; model order alternates between rounds. No tests or other benchmark suites were run concurrently with timed browser runs. Native bytes are prepared **before** admission timing. Input files are read only.

The Cell control uses the current native decoder, `CanonicalRepository` and `TreeCommands`, then the **same minimal presentation** as the compact experiment. It does not retain the decoded source graph as a second authority. It is a controlled representation comparison, **not** full Flint admission/application integration. The compact side also has less workspace/application lifecycle coverage, as disclosed above.

Every text-bearing definition is materialized on interactive activation, including hidden metadata/alternative definitions; there is no viewport virtualization or lazy semantic conversion. Subsequent activation disposes and recreates the editing projection. Read-only rendering never creates those Cells. The populated case retains three other 8,000-character documents, two with editing projections, before timing target admission. Populated memory includes that retained background.

Display columns include two animation frames; synchronous construction is also recorded in the raw artifact. Forced-GC sampling separates stages. Consequently these stage medians must **not** be added and presented as a measured end-to-end Open time. Headless frame timing is not a guarantee of physical input-to-display latency. Free disk space was limited on this workstation; these are single-machine experimental results, not controlled laboratory capacity bounds.

Medians in milliseconds (n = 3). The ordinary native row uses the separately repeated native run after adding a post-teardown frame before the memory baseline.

| Fixture | Model | Admission | First editor activation | Reopen editor | Read-only display | Native capture |
|---|---|---:|---:|---:|---:|---:|
| Small WeGA | Compact | 8.5 | 51.8 | 49.2 | 52.2 | 8.7 |
| Small WeGA | Current Cell control | 129.2 | 44.5 | 41.4 | — | 71.9 |
| Large WeGA | Compact | 18.7 | 104.4 | 102.1 | 47.8 | 18.5 |
| Large WeGA | Current Cell control | 580.4 | 127.4 | 126.3 | — | 382.3 |
| Anthology | Compact | 71.6 | 348.8 | 345.1 | 47.7 | 65.5 |
| Anthology | Current Cell control | 2,160.4 | 406.2 | 423.7 | — | 1,581.0 |
| Extended anthology | Compact | 152.2 | 729.7 | 693.2 | 45.8 | 146.4 |
| Extended anthology | Current Cell control | 4,950.4 | 853.1 | 883.9 | — | 3,405.0 |
| Populated workspace | Compact | 18.2 | 103.3 | 113.1 | 65.4 | 18.6 |
| Populated workspace | Current Cell control | 535.3 | 127.3 | 142.1 | — | 361.6 |
| Ordinary native letter | Compact | 2.2 | 53.7 | 47.4 | 50.0 | 3.5 |
| Ordinary native letter | Current Cell control | 24.9 | 48.9 | 50.1 | — | 17.6 |

Read-only synchronous DOM construction medians were **0.5, 1.1, 3.6, 6.9 and 1.1 ms** for small, large, anthology, extended and populated respectively; frame waits dominate the small read-only display measurements. Extended compact admission ranged **144.9–160.7 ms**, versus **4,512.9–5,549.8 ms** for the Cell control. Extended first activation ranged **706.1–802.5 ms** versus **848.3–864.7 ms**.

| Target fixture | Text/object positions | Authored Blocks | Editing occurrences | Read-only runs / DOM elements | Interactive DOM elements |
|---|---:|---:|---:|---:|---:|
| Small WeGA | 3,271 | 64 | 30 | 40 / 70 | 3,301 |
| Large WeGA | 17,283 | 72 | 44 | 152 / 196 | 17,327 |
| Anthology | 58,614 | 336 | 296 | 404 / 700 | 58,910 |
| Extended anthology | 120,624 | 732 | 674 | 782 / 1,456 | 121,298 |
| Populated workspace | 17,283 | 72 | 44 | 152 / 196 | 17,327 |
| Ordinary native letter | 660 | 9 | 8 | 10 / 18 | 668 |

Post-GC retained deltas, MiB. Interactive pairs are **JS heap + embedder heap**; columns include complete retained canonical data, not just presentation objects. Populated rows include the three background documents and two background editing surfaces.

| Fixture | Compact admitted JS | Cell admitted JS | Compact interactive JS + embedder | Cell interactive JS + embedder | Compact read-only JS + embedder |
|---|---:|---:|---:|---:|---:|
| Small WeGA | 0.10 | 2.43 | 0.83 + 3.85 | 3.07 + 3.85 | 0.12 + 0.15 |
| Large WeGA | 0.22 | 12.30 | 3.51 + 20.32 | 15.71 + 20.32 | 0.23 + 0.52 |
| Anthology | 0.84 | 41.00 | 11.16 + 68.44 | 51.55 + 68.44 | 0.79 + 1.80 |
| Extended anthology | 1.50 | 84.01 | 23.70 + 140.52 | 105.89 + 140.59 | 1.39 + 3.71 |
| Populated workspace | 3.24 | 30.79 | 6.69 + 38.99 | 34.10 + 38.99 | 3.24 + 19.19 |
| Ordinary native letter | 0.02 | 0.54 | 0.22 + 0.78 | 0.78 + 0.78 | 0.02 + 0.03 |

The extended case’s median **maximum stage-observed JS heap increase** was **37.43 MiB compact / 241.01 MiB Cell control**. This omits unsampled intra-stage peaks and must not be read as total process peak memory.

Short-paragraph input dispatch and local history, ms. Typing uses pooled median/p95 over 60 samples; Undo/Redo uses three repetitions.

| Fixture | Compact typing median / p95 | Cell typing median / p95 | Compact Undo / Redo | Cell Undo / Redo |
|---|---:|---:|---:|---:|
| Small WeGA | 1.20 / 3.20 | 3.35 / 5.60 | 0.9 / 0.3 | 1.9 / 0.8 |
| Large WeGA | 0.65 / 1.90 | 1.20 / 2.70 | 0.6 / 0.1 | 1.1 / 0.3 |
| Anthology | 1.10 / 2.30 | 1.55 / 2.70 | 0.8 / 0.2 | 1.4 / 0.5 |
| Extended anthology | 1.35 / 4.70 | 2.00 / 4.90 | 1.0 / 0.1 | 1.9 / 0.5 |
| Populated workspace | 1.25 / 2.10 | 1.50 / 3.10 | 0.5 / 0.2 | 1.1 / 0.3 |
| Ordinary native letter | 1.00 / 1.70 | 1.35 / 3.50 | 0.7 / 0.2 | 1.3 / 0.6 |

### Allocation and memory interpretation

All compact cases admitted zero canonical Cells/inline-Cell placements. The current control admitted one of each per text/object position. For the extended anthology that removes **120,624 canonical Cell records plus 120,624 placements**, while retaining 732 authored Blocks. The validator still allocates a temporary structural witness and authored bag copies; zero Cells does not mean zero admission allocations.

Interactive activation eagerly creates 120,624 **editing** Cells and 674 text occurrences in either presentation harness. Read-only rendering creates 782 runs instead. Its 1,456 measured DOM elements contrast with 121,298 interactive DOM elements. These counts are elements; Text nodes are additional. The input harness also retains an occurrence-local key lookup. No claim of eliminating interactive character DOM is made.

Memory tables distinguish post-GC JS heap from Chrome's reported embedder heap (including DOM-related allocations). Eager DOM remains expensive even when canonical text is compact. Stage-boundary JS observations are a **lower bound on peak**, not a sampled true peak; RSS/GPU memory and allocation dominators were not measured. Small deltas can be dominated by GC/background cleanup. The native case's first memory baseline followed populated-workspace teardown and was contaminated by delayed embedder cleanup; those original native deltas are not used as representation-size estimates.

On extended activation the compact harness spent a median 379.9 ms in synchronous construction, with CDP reporting about 161.0 ms layout and 105.1 ms style recalculation. The Cell control reported 511.9 ms synchronous construction, 155.4 ms layout and 103.4 ms style recalculation. These overlapping instrumentation categories are **not additive exclusive CPU phases**. CDP `ScriptDuration` does not account reliably for all work invoked through `Runtime.evaluate`; it is retained as raw evidence, not relabelled as total JavaScript CPU. GC and paint were not separately timed in the comparative matrix.

### Ordinary typing and the long-Block boundary

The matrix exercises short paragraphs: selected lengths are 172 positions for small WeGA, 25 for the large/anthology/populated cases and 38 for the ordinary native fixture. Each case has 60 dispatch samples across three runs. These results cannot establish long-paragraph latency or all-document typing parity.

A separate stress fixture has **one 120,624-character TextBlock**, three authored Blocks and one bold range. It is intentionally a counterexample to treating “bounded by the affected Block” as “fast enough.” Three rounds per model used four insert/delete dispatches each (12 samples), without virtualization.

| Single long TextBlock, ms | Compact | Current Cell control |
|---|---:|---:|
| Admission median | 1.0 | 4,463.4 |
| First interactive activation median | 810.2 | 946.4 |
| Read-only display median | 53.1 | — |
| Typing dispatch median / p95 / maximum | 292.3 / 495.1 / 515.6 | 760.2 / 920.0 / 1,292.2 |
| Undo / Redo median | 510.5 / 213.7 | 1,244.8 / 406.5 |
| Native capture median | 0.9 | 3,060.4 |

Four dispatches allocated only **two new editing Cells**, but visited **482,498 Cell presentations**. The retained per-paragraph presentation/update loops still do substantial work; Backspace also computes paragraph-wide grapheme information in the existing gateway. Admission is cheap because the compact fixture has very little structural/annotation metadata; editing still touches a very long paragraph. These typing delays are unacceptable for a production editor. No claim is made that compact storage alone solves them, and this milestone does not rewrite those editor paths.

### Production acceptance remains separate

The existing full-Flint harness was rerun on the unchanged production implementation, using the existing diagnostic production bundle with Cell/ID probes. One new sample per WeGA document is a diagnostic sentinel, not a replacement for the earlier repeated acceptance series.

| Production Flint stage, ms | Small WeGA | Large WeGA |
|---|---:|---:|
| Worker preparation | 14.1 | 27.2 |
| Worker round trip | 69.6 | 61.2 |
| Native admission | 233.7 | 1,214.1 |
| Candidate tracking | 51.0 | 398.0 |
| Open/render, including frames | 114.3 | 962.7 |
| Usable text, end to end | 468.6 | 2,636.0 |
| Metadata activation | 98.9 | 166.4 |

Both imports retained exactly one Page, were untruncated, published admission once and took no admission snapshots. Small WeGA was below 500 ms in this sample; large WeGA remained above one second. Metadata was below 250 ms. **The large-letter production release blocker is not resolved by this experimental work.** Earlier acceptance data in `NATIVE_DOCUMENT_ADMISSION_PERFORMANCE_REPORT.md` remain authoritative evidence of production behaviour; these instrumented single samples do not supersede their medians.

The real Flint typing benchmark also passed on the ordinary native letter's 499-character paragraph: synchronous median/p95 **6.0/13.0 ms**, settled **8.0/15.1 ms**, zero full snapshots, zero save-status reads and zero service requests; trusted character input and Undo restored text. Its CPU profile sampled about 10.8 ms in the garbage collector over the run. It is a production sentinel, not a statistical proof of no regression across machines. Production does not import this experiment, so the experiment supplies no production typing optimization or intentional behavioural change.

## 5. Minimum integration contracts still required

The small prototype does not justify replacing the repository via a universal adapter. The following concrete modules/contracts would need separate, bounded qualification before production work could be proposed:

| Existing module | Required contract/change |
|---|---|
| `src/persistence/native-resource.ts`; `src/history/stage-c-gates/portable.ts` | Cell-free canonical construction/capture with shared native validation predicates. Preserve the existing native envelope, authored-value grammar, excerpt refresh and ownership/reference semantics. Do not require a complete Cell graph as an intermediate. |
| `src/block-tree/repository.ts`; `record-batch.ts`; `compact-changes.ts` | Atomic compact text/annotation write sets, monotonic revisions, dependency/index updates and change notifications without character record operations. Keep identity/ownership enforcement and bounded work. The current compact experiment is not this repository contract. |
| `src/block-tree/commands.ts`; `cross-text-edit.ts` | Replace Cell placement manipulation in text/split/join/cross-edit paths with compact sequence operations; retain all existing structural, mode, ownership and attachment guards. Resolve the image-insertion rebasing discrepancy explicitly. |
| `src/block-tree/projection.ts` (notably inline projection around lines 176–208 and 287 onward) | Separate structural occurrences from mounted editing atom identities. Preserve shared occurrences, placement routes and feature discovery without projecting every canonical character. |
| `src/runtime/text-ranges.ts` and its source callbacks | Supply content/occurrence/placement identity, revision, length and coordinate domain directly from compact content. Keep stale-range rejection. The numeric `TextRanges` class itself is already independent of Cell storage. |
| `src/runtime/annotation-identities.ts`; linked-annotation services | Preserve origin/index tracking for duplicate/idless properties and linked-definition invalidation without requiring per-character records or unrelated index rebuilds. Raw numeric range parity alone does not prove monitor/feature parity. |
| `src/input/gateway.ts`; `multi-selection-editor.ts` | A bounded text/occurrence command port for structural input, cross-Block selection, clipboard and multicaret. Typed mixed-object composition reconciliation is a genuine existing constraint. The narrow proof only covers ordinary input/text-only composition. |
| `src/rendering/standoff-editor-view.tsx`; `direct-character-cells.ts` | Supply existing character presentations from session-local Cells while retaining annotation panels, linked styles, concealment, alternatives, managed assets and effects. Keep keyed DOM and composition ownership; qualify long-Block update cost. |
| `src/runtime/mounts.ts`, `selections.ts`, `focus.ts`, `measurements.ts` | Reuse these services; add correct transaction/history selection bookmarks and composition lifecycle coordination. Preserve generation/revision/layout invalidation and cleanup, not a second geometry system. |
| `src/block-tree/undo-storage.ts`; `src/history/*` | Define compact operation/history capture and dirty-state integration without reinterpreting old Cell-keyed exact changes. Test branch/replay/checkpoint compatibility separately. |
| `src/persistence/native-session.ts`; application/feature consumers | Preserve manual saves, cheap per-document dirty state, candidate tracking, Object Bank reuse, resource bindings and feature ownership. No Save-time synchronization from editing Cells. |

No semantic TextBlock specialization, new Block inheritance, TEI vocabulary or general framework is needed for this experiment, and none was introduced. A later investigation may reuse these text-access findings; it is not implemented here.

## 6. Migration and compatibility assessment

- **Ordinary native files:** promising boundary. They already store text spans and image objects without canonical Cell keys. Both value-encoded and original JSON-bag native forms are admitted by the proof. Capture matches the current native serializer for the qualified operations, except the explicitly approved point-edit semantics. A wire-format migration is not inherently required.
- **Native-v2 owned resources:** descriptor/ownership validation is retained and tested. Live binding/reuse across a workspace is not implemented by the compact index. Unresolved descriptors remain data and are not dereferenced or replaced by fabricated definitions.
- **Old extended repository snapshots:** retain their existing readers and meaning. They can contain Cell identities and structures that ordinary native spans cannot express. The compact constructor accepts ordinary native envelopes only; it does not coerce extended snapshots.
- **Exact-history archives:** retain the existing Cell-based replay engine and identity interpretation. The experiment neither reads nor rewrites these archives. Compact local Undo/Redo does not prove cross-model historical replay. Any later migration needs an explicit boundary/version policy and fixtures before implementation.
- **Read-only consumers:** complete compact content can exist, be inspected, captured or displayed in the qualified subset without materializing editor Cells. This is stronger than bounded facts extraction, but it is not a replacement for every indexing/package/SQL/application contract. Those integrations were not changed or newly certified.

## 7. Qualification evidence and deviations

- **229 focused regression tests passed across 21 suites**, including the first 40 experimental tests. They cover TEI conversion/recovery/native compatibility, native ownership/admission, exact/durable history, current Undo storage, inline/split bounded-work checks, styles, keyed character rendering, graphemes, geometry and provisional input.
- The experimental suite was subsequently extended to **43 tests** with complete Unicode Undo/Redo sequences, presentation-only lifecycle checks and retained-definition ordering. All 43 passed in the final run recorded in `model-tests-final.log`; three are additional to the 229-test run, for **232 distinct focused tests passed** in total.
- **18 browser assertions passed**, plus two separately recorded negative observations (mixed-object IME and Undo selection). All comparative typing loops restored their starting text.
- Application/client and server `npm run typecheck` passed. The isolated experiment's strict TypeScript check, including its test source, also passed (`experiment-typecheck.log`).
- The final production-built experimental bundle built successfully (109 modules, 346.99 kB JavaScript). No production module imports the experiment. The final retained-definition ordering correction was covered by the final tests/build/browser checks; the timing fixtures have empty retention arrays, so the performance matrix was not unnecessarily repeated for that ordering-only correction.
- The ordinary native input was 20,329 bytes, SHA-256 `d4d3546c61429a6ddef068a551670a65b1a0d73fb2592dee42a7711aede6ade8`; its input bytes were not written. Native fixtures are read only, with no background saves or sidecars.


Evidence and reproduction:

- [`scripts/compact-canonical/README.md`](scripts/compact-canonical/README.md): commands and adapter boundaries.
- [`model.test.ts`](scripts/compact-canonical/model.test.ts): differential, failure, ownership, point, Unicode, bounded-work and history tests.
- [`artifacts/compact-canonical/performance.json`](artifacts/compact-canonical/performance.json): 36 fixture/model samples, stages, logical allocations, DOM element counts, retained JS/embedder heap and CDP layout/task metrics.
- [`long/performance.json`](artifacts/compact-canonical/long/performance.json): six single-long-Block samples; [`native/performance.json`](artifacts/compact-canonical/native/performance.json): six ordinary-native follow-up samples with corrected teardown/baseline ordering.
- [`browser-checks.json`](artifacts/compact-canonical/browser-checks.json), [`readonly.png`](artifacts/compact-canonical/readonly.png): successful assertions plus separately recorded known failures and inspected visual evidence.
- [`flint-release/flint.json`](artifacts/compact-canonical/flint-release/flint.json): unchanged full-Flint import sentinels.
- [`flint-typing/results.json`](artifacts/compact-canonical/flint-typing/results.json), [`flint-typing/typing.cpuprofile`](artifacts/compact-canonical/flint-typing/typing.cpuprofile): real production typing check.
- Test/typecheck/build logs are under the same ignored artifact directory. Raw artifacts are local review evidence, not required production files; this report retains the principal findings independently.

The main deviations from full proposed parity are deliberate stop boundaries, not completed work hidden behind a success label: partial browser service integration, restricted structural command subset, no exact-history bridge, flat read-only presentation, limited native workspace admission, no true peak/RSS or complete GC/paint breakdown, and no sustained long-paragraph history/typing soak test. The earlier exploratory performance run was superseded after removing a retained decoded source graph from the Cell comparator and tightening occurrence subscription dispatch; it is not used in these tables.

## 8. Exit recommendation

**Continue experimental qualification of B.** There is now measured evidence that complete native text semantics can remain canonical without character records, and that real input/rendering components can edit that authority through narrow adapters. The memory benefit survives interactive activation, although eager DOM remains a substantial separate cost. Cell-free styled runs provide a useful independent read-only capability within their stated presentation limits.

Do not proceed to production B or C yet. The next proof must close selection/history and composition ownership first, then qualify structural input and feature integration without recreating a complete Cell repository behind an adapter. Long-Block latency and the actual Flint lifecycle must be measured after that integration. Keep A operational and preserve the existing release blocker until production performance is demonstrably fixed. No production migration has begun.
