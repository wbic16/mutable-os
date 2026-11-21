# TEI P5 importer — Milestone 3: operational semantic sublimation

Implemented against `a7b5aaf` (Milestone 2 complete). Operational relationships, milestone navigation and source-definition navigation are enabled by default through **`teiOperationalSemantics`**. Continuous inline alternatives reach the architectural approval boundary specified in the M3 brief; their focused qualification is delivered separately. This is a supported semantic slice, not complete TEI P5 support.

## 1. Repository assessment and prior instructions

Checked the [M1 feature brief](TEI_P5_IMPORTER_MILESTONE_1_FEATURE_BRIEF.md), [mapping catalogue](TEI_P5_MUTABLE_MAPPING_CATALOGUE.md), [M2 implementation](TEI_P5_IMPORTER_MILESTONE_2_IMPLEMENTATION.md), existing converter, compact native codec, tabs/superposition, Gloss model/index/controllers, native relationship consumers, canonical Entity service and SQL Claim/Relationship contracts.

The catalogue's G2/G5 distinction remains important: a source-defined local Gloss identity can participate in the local graph; it is not a verified SQLite Entity GUID. SQL Relationships require canonical Entity endpoints; Claims also carry stronger participant/qualifier/evidence contracts. No such identities or service operations are fabricated during import.

Prior decisions remain intact:

- Original XML files stay external and untouched. There is no XML archive, Source tab, source synchronisation or XML re-export requirement.
- One Document owns exactly one Page. Header content stays editable under Metadata; Text opens first.
- Source-order alternative selection remains unchanged. No inferred preferred lemma, correction or regularisation.
- Ordinary `lb` remains a newline; no-break `lb` remains a point. Source page/column markers do not create native Pages.
- Saving stays manual. No Markdown sidecars, background saves, network enrichment or canonical knowledge writes were added.
- Compact conversion/admission remains free of canonical character Cells. No persistence format/version changed.

The new flag passes through the actual import request and worker. Setting it false retains M2 conversion and hides the new navigation affordances. It does not erase saved relationships, migrate existing documents or change other feature defaults. `teiSemanticSublimation: false` still selects M1 conversion.

## 2. Inline alternatives: explicit qualification boundary

[TEI_P5_MILESTONE_3_INLINE_ALTERNATIVES_QUALIFICATION.md](TEI_P5_MILESTONE_3_INLINE_ALTERNATIVES_QUALIFICATION.md) records the precise gap and proposed smallest coherent extension.

Structural tabs are whole-Block layouts. Existing superposition requires a nonempty legacy range, rejects overlap, stores reading switches as authored changes and is excluded from compact admission. Simply enabling it would violate the compact and presentation-only switching requirements. A continuous, rich, empty/nested inline alternative needs a qualified native sequence member backed by owned readings, with defined selection, editing, copy, history and native encoding behavior.

Per §A of the supplied M3 brief, that extension is **not implemented without approval**. The qualification is a concrete proposal for review. Grouped tabs preserve all readings, rich content, nested/empty branches and source order; their existing non-authoring switching remains supported. Independent M3 work below is implemented.

## 3. Native relationship promotion

[relationships.ts](src/interchange/tei/relationships.ts) promotes into existing `metadata.gloss.links`; there is no second graph authority. Existing Gloss incoming/outgoing groups, Graph and Argument consumers see the resulting edges.

The admitted subset is intentionally narrow:

- An explicit TEI `relation` with an exact, valid native relationship name (single-line, at most 128 characters).
- Exactly one `active` token and one `passive` token, both local, uniquely resolved to genuine person/organisation/place Gloss definitions.
- No `mutual`, repeated/multiple participants, unsupported qualifiers, unsupported enclosing semantic context, or nonempty relation content.
- `xml:id` is source identity; optional `resp`/`source` references are provenance, retaining their original resolution states. An unknown certainty/time/type qualifier is not hidden in opaque metadata while activating an unconditional edge.

The original predicate is used verbatim. Direction maps active → passive. Arbitrary names are accepted only because the existing local edge schema supports custom types; no predicate synonym or endpoint similarity is inferred. Attribute-bearing/contextual wrappers outside the conservative allowlist prevent promotion. Unsupported assertions remain independent `tei/relationship` definitions and receive `relationship-preserved` diagnostics.

Every promoted edge carries import-time source evidence: assertion identity, source ID, original fields and ordered references/token states. Its preservation record remains available independently. Editing a native edge later does not rewrite that source assertion or trigger XML reconciliation.

An assertion's native definition ID also keys its edge. Repeating the promotion pass on the same converted definitions adds no duplicate. Distinct source assertions remain distinct, even when their predicates/endpoints match. Re-import remains the existing new-document operation, with fresh native identities; no merge into an already edited document is introduced. Source IDs and semantic meaning are stable after alpha-renaming native IDs.

## 4. Milestone inventory and navigation

In **Gloss Mode → Local References → References**, expand **TEI milestones**. The list shows source marker type, label, source order, original attributes and reference states, including facsimile pointers. Each mounted occurrence has a **Go to** control. Missing anchors remain explicitly unavailable instead of pointing at adjacent text.

[navigation.ts](src/features/tei-import/navigation.ts) and [presentation.tsx](src/features/tei-import/presentation.tsx) reuse the existing Gloss session inventory, `revealMatch`, native view-child activation and mount selection APIs. The small inventory policy selects `tei/milestone` definitions; it does not introduce a new semantic store or positioning system.

Rows retain definition/segment/occurrence identities, not saved offsets. Navigation resolves the current segment before revealing the path and again afterward, activates Text/Metadata and any nested reading tabs, focuses the correct occurrence and restores the exact point or character range. Empty and EOF boundaries need no placeholder character. Both supported native point endpoint conventions yield a collapsed selection. Navigation is cancellable on disposal/stale requests and performs no canonical write.

The inventory is source-ordered, with order/label edits reflected through ordinary definition changes. Structural edits refresh scoped membership through the existing index path. Ordinary offset rebasing reads only affected annotation lists; it does not rebuild rows, parse source definitions or traverse the document. Deleted segments leave inspectable orphan records; Undo restores locations.

The short graphical References pane has one scrollable TEI content area, keeping milestone and mention controls reachable together. Textual presentation places the same controls inside its existing scrollable detail area. No new highlight renderer or geometry cache is introduced.

## 5. Explicit local definitions and mentions

New imports distinguish `tei/definition` and `tei/mention` on existing linked Gloss segments. Mention segments also retain the semantic source-annotation identity. Binding still requires an explicit compatible `ref`; attribution, `sameAs`, ambiguous/unresolved references and name similarity do not invent a binding. An explicitly empty source entity can retain an empty definition boundary.

Existing local entity rows now expose **Source definition**, **Imported source details** and **Explicit mentions**. A mention's existing Gloss popup offers **Definition and mentions**, opening the same local inventory. Definition navigation reveals the actual editable source-definition content, including Metadata. Mention buttons return to the actual text occurrence. Related local entities remain accessible through native relationship groups and graph consumers.

Source IDs, local Gloss IDs and external reference tokens remain distinct. No canonical Entity ID is fabricated. External references are displayed as inert source facts, with no automatic fetch. Older M2 imports lacking occurrence-role metadata retain generic Passage navigation and an explicit notice; their roles are not guessed or silently migrated.

## 6. Semantic fidelity and regression evidence

**336 selected tests pass across 29 suites**, combining the broad regression run and focused reruns after corrections. This is not a claim that the entire repository test suite was run. `npm run typecheck` passes both reactive and server projects; production harness compilation and `git diff --check` pass.

Coverage includes:

- TEI conversion, compact native writer, actual import/worker flag plumbing, semantic sublimation and new operational semantics.
- Exact predicate/provenance, unsupported mutual/n-ary/repeated/external/ambiguous participants, incompatible target kinds, qualifiers/enclosing context, nonempty relationship content, idempotence and semantic determinism.
- Real hidden-tab navigation, exact empty/EOF positions, empty source definitions, explicit binding, split/Undo, removed anchors, definition edits and source-order changes.
- Existing Gloss authoring, relationship/graph/argument consumers, linked annotations, tabs, annotation monitor/range commands, compact production rendering and native resource/session persistence.
- Existing saved projection/facts, including point conventions and native semantic metadata.

[operational-semantics.xml](src/interchange/tei/fixtures/operational-semantics.xml) is an explicitly invented fixture. The authentic WeGA fixtures remain unchanged.

Bounded-work assertions cover edit/Undo/Redo with the inventories active: stable row identities, unchanged definition/tree/publication counters, unchanged graph counters, exactly affected segment reads, no repository/node inventory scans, no snapshots or full projection rebuilds. Existing unrelated-document and native dirty/save regression suites also pass. No new persistence, vault discovery, network service or canonical validation work is attached to keystrokes.

## 7. Real browser qualification

[qualify-tei-operational-browser.mjs](scripts/qualify-tei-operational-browser.mjs) runs the actual retained Workspace/Flint host, real worker and native bank admission in Chrome, in both compact and legacy modes. It verifies that navigation controls are visible and hit-testable, dispatches trusted mouse events and trusted text input, and checks:

- The mention popup opens the local definition/mention inventory.
- Definition navigation activates Metadata; mention navigation returns to Text.
- All four fixture points restore exact caret boundaries: page marker 12, EOF 17, empty marker 0 and nested inactive column marker 0.
- Navigation preserves native bytes and leaves target text visible in its pane.
- Text insertion, Undo and Redo work with both inventories active, with zero snapshots and no inventory/graph rebuild.
- Explicit in-memory manual Save/reload preserves native bytes and relationships. Compact reload contains zero canonical character Cells; legacy reload contains the expected 110.

The stricter hit-test check exposed and verified the narrow-pane scrolling correction described above. Evidence: [operational browser results](artifacts/tei-m3/operational-browser.json), [compact screenshot](artifacts/tei-m3/operational-compact.png), [legacy screenshot](artifacts/tei-m3/operational-legacy.png).

The original browser qualification also passes both authentic letters and the M2 semantic fixture in compact and legacy modes, including metadata tabs, nested/empty readings, real typing/history, native reload, cancellation and timeout. Evidence: [compact](artifacts/tei-m3/compact/browser-smoke.json), [legacy](artifacts/tei-m3/legacy/browser-smoke.json). Browser Save tests use in-memory storage; no user document is written.

## 8. Persistence compatibility

No new wire type, file format, canonical Cell authority or XML archive is used. Existing native linked definitions, segment metadata and Gloss edges carry all new meaning. Compact and legacy decode/capture/reload preserve that authored data, including point conventions. Existing cross-mode persistence suites remain passing. Turning the new flag off affects new conversion/UI affordances, not the readability of saved native data.

## 9. Full-Flint performance

Final measurements are recorded below after the last production build. The comparable harness is the existing M2 production Flint benchmark: Chrome 157.0.8103.80, 1440×900, scale 1, no CPU throttling, real worker, bank admission, candidate registration, open and two frames. Three sequential runs per case, with no competing test/build workload. The separate operational browser qualification above uses the full retained WorkspaceSession/Flint host.

| Case | Before usable / Metadata median, ms | Final usable median (range), ms | Final Metadata median (range), ms |
| --- | ---: | ---: | ---: |
| small | 109.2 / 84.0 | 108.4 (105.1–141.8) | 83.5 (82.9–99.8) |
| large | 452.4 / 166.4 | 440.7 (439.3–455.6) | 166.1 (152.1–167.4) |
| anthology | 1650.4 / 415.8 | 1635.1 (1623.5–1641.5) | 516.5 (401.1–535.9) |

All final small-letter samples are below 500 ms, large-letter samples below 1,000 ms and both original Metadata samples below 250 ms. The anthology remains outside these gates; its Metadata median increased from 415.8 to 516.5 ms in this run (range 401.1–535.9 ms). This is a measured limitation, not a claimed improvement. Its initial open/render stage remains dominant at 1,431.7 ms. No causality or general renderer improvement is inferred from these timings.

| Final median stage, ms | Small | Large | Anthology |
| --- | ---: | ---: | ---: |
| Worker round trip | 39.2 | 47.1 | 81.3 |
| Native admission | 14.7 | 26.9 | 107.9 |
| Candidate registration | 2.1 | 3.4 | 11.6 |
| Open + render | 53.2 | 363.4 | 1431.7 |
| Native capture | 5.5 | 10.3 | 52.0 |
| Manual in-memory Save | 12.7 | 23.9 | 80.1 |
| Native reopen | 6.4 | 15.5 | 57.7 |
| Undo | 0.6 | 0.5 | 0.6 |
| Redo | 0.4 | 0.2 | 0.3 |

All imported compact resources retain zero canonical character Cells; worker canonical content/placement counts remain zero. Native authored text counts are 3,271 / 17,283 / 58,614; Block counts 64 / 72 / 336; definition counts 89 / 270 / 990. Native sizes are 61,936 / 149,640 / 544,629 bytes. Admission publishes once, performs no snapshot and does not rebuild unrelated Document projections. Manual-save bytes and reopened native bytes match.

The separate real Flint typing benchmark on the existing Michelangelo letter reports synchronous median/p95 **5.2/9.7 ms before** and **5.9/14.6 ms after**; settled median/p95 are 7.3/11.8 and 8.6/17.7 ms. Both restore the original text and report zero snapshots, status reads, service requests and worker starts. These headless measurements are evidence of bounded work, not guaranteed user-visible latency or a claimed speedup.

Evidence: [before](artifacts/tei-performance/m3-before.json), [final](artifacts/tei-performance/m3-final.json), [typing before](artifacts/tei-m3/typing-before/results.json), [typing after](artifacts/tei-m3/typing-after/results.json). The original small/large/Metadata gates are the acceptance gates; anthology measurements remain informational. No broad performance refactor was attempted.

## 10. Remaining limits and next step

- Continuous inline alternatives await approval of the focused native capability qualification. Grouped tabs remain the supported fallback.
- Relationship promotion covers only the conservative subset above. Mutuality, n-ary roles, uncertain/time-qualified/context-dependent assertions and arbitrary stand-off graphs remain preservation records, not misleading binary edges.
- No automatic external identity resolution, canonical Entity/Claim creation, XML synchronisation or merge into edited documents is added.
- Older imports without classified occurrence roles remain usable through existing generic Gloss navigation; they are not retroactively classified.
- Source facsimile references and significant-space dimensions remain facts, not a facsimile renderer or reconstructed source layout.
- The anthology presentation cost remains outside the original letter gates. M3 does not claim complete TEI P5 coverage or a general apparatus editor.

The next architectural decision is approval of the inline-alternative qualification. The operational slices delivered here do not depend on that decision.
