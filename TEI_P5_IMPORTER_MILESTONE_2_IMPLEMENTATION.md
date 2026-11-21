# TEI P5 importer — Milestone 2: semantic sublimation

**Date:** 20 November 2026. **Merged baseline:** `f164fda` (`Final integration`).

The selected semantic slice is implemented behind **`teiSemanticSublimation`, default on**. Rich alternatives remain editable native tabs; exact point annotations replace approximate milestone context; editorial operations retain distinct meanings; local Entity linking is constrained to compatible explicit mentions. The original WeGA letter performance targets pass in all final samples. This is not implementation of the complete TEI vocabulary or a general apparatus engine.

## 1. Instructions and merged-branch verification

The [M1 feature brief](TEI_P5_IMPORTER_MILESTONE_1_FEATURE_BRIEF.md), [mapping catalogue](TEI_P5_MUTABLE_MAPPING_CATALOGUE.md), [M1 implementation report](TEI_P5_IMPORTER_MILESTONE_1_IMPLEMENTATION_REPORT.md), [performance remediation](TEI_P5_IMPORTER_PERFORMANCE_REMEDIATION.md) and merged converter/native code were checked before extending conversion. The user's subsequent clarification confirms that original XML files remain available: **no XML archive or Source tab is added**. This also agrees with the earlier brief's exclusions and catalogue R0–R4/G1.

Preserved decisions:

- One initial native `page-block`; source pagination does not create Pages.
- Existing Text/Metadata tabs, with Text initially active.
- First authored alternative initially active, including apparatus entries. No preference for a lemma, correction or regularisation is inferred.
- Ordinary `lb` retains its logical newline. No-break markers do not insert separators.
- Six existing Block implementations, existing native persistence format, deterministic offline conversion and bounded recovery.
- Original external files remain untouched; native saving is manual. No sidecar, background save, canonical Entity creation, AI, external authority lookup or interactive fragment admission.
- Existing Mode continuation/join safeguards and feature defaults remain intact. New imports use namespaced semantic roles; old saved role values are not migrated.

All **57 existing TEI tests passed before implementation**, including both real letters, native capture/reload, rendered editing/history and the 300,100-character capacity case. That capacity test took 16.3 seconds on the legacy test path; it is not a rendered-book latency claim.

The merged worker already uses `prepareTeiDocument` → `convertTei` → `encodeTeiNative`. It writes complete native text atoms and semantic definitions before admission, with **zero disposable canonical content/placement records**. Native admission then selects compact text where eligible and retains normal ownership/reference/graph validation. Imported compact resources contain **zero canonical character Cell records**, including after rendering and capture. Legacy admission remains available.

The production harness previously called `teiFlintPerformance` without its compact argument, selecting that harness's legacy default. The runner now passes the flag explicitly and asserts the imported resource's Cell count. The workspace's 142 pre-existing startup Cells are not imported TEI Cells. The merged baseline below was collected before converter changes, using the corrected harness.

| Case | Merged usable text, median (range), ms | Metadata, median (range), ms | Imported canonical Cells |
| --- | ---: | ---: | ---: |
| WeGA A040080 | 102.9 (102.8–136.9) | 99.9 (99.4–100.3) | 0 |
| WeGA A041209 | 443.8 (441.4–456.6) | 165.1 (164.5–166.3) | 0 |
| Derived anthology | 1,648.8 (1,621.9–1,677.7) | 432.4 (417.1–571.6) | 0 |

For comparison, the earlier remediation reported usable-text ranges of **420.1–600.1 / 2,002.5–2,573.1 / 8,064.6–12,259.0 ms**. The merged lifecycle removes that earlier letter release blocker. These are historical comparisons across implementations and sessions, not controlled attribution of every timing difference to one change.

A later rendered semantic-edit test exposed a narrow merged regression: a structural projection rebuild attempted to `structuredClone` reactive editing-Cell proxies. Both edge-retention clone sites now unwrap those proxies. A non-TEI compact-renderer regression test covers metadata edits, stable mounted Cell identity and Undo. No projection architecture was replaced.

## 2. Mapping catalogue reconciliation

The catalogue describes intended mappings, not executed converter coverage. This table reconciles the relevant families with actual code and tests.

| Mapping | Merged M1 state | M2 result and qualification |
| --- | --- | --- |
| Document/Page, prose, sections, verse, drama, letter/header roles | Implemented in the M1 subset | Retained; existing native structures, Modes and Metadata tab. |
| `choice`, `orig/reg`, `sic/corr`, `abbr/expan`, basic `app/lem/rdg` | Partially implemented: grouped editable tabs; empty semantics could be unanchored; group kind absent without attributes | Implemented for grouped native presentation, including empty/nested branches, explicit group/branch roles and source order. Continuous inline presentation remains partial. |
| `rdgGrp` | Preservation only: generic wrapper, no selectable reading-group behavior | Nested native alternative group, preserving its own qualifiers and child order. |
| Apparatus `from/to`, witnesses, notes and missing lemmas | Partially implemented; pointers and alignment uneven | Ordered typed pointer records and resolved local targets where available. External/double-endpoint apparatus attachment and collation remain preservation only. |
| Ordinary `lb` | Implemented newline/range | Retained. |
| `pb`, `anchor`, `lb break="no"` | Partially implemented: approximate whole-Block context | Implemented exact live boundaries; labels/references remain distinct from visual pagination. |
| `cb`, `milestone`, `space` | Preservation only: generic fields, no exact live position | Exact points. `space` layout remains partial: dimensions are preserved, no visual width is fabricated. |
| `add`, `del`, `supplied`, `unclear` | Implemented nonvisual semantic ranges | Retained and qualified across nesting, Unicode, multiple Blocks and native editing. |
| `subst`, `surplus`, `gap`, `damage`, `restore`, `handShift` | Preservation only through generic semantic fields | Distinct editorial operations, nested intervention links and point semantics for empty content. No accept/reject engine or inferred hand propagation. |
| Person/place/organisation definitions and mentions | Partially implemented; any reference to a Gloss could mistakenly create a mention | Compatible explicit naming references create local Gloss mentions; attribution and arbitrary references no longer do. No canonical identity inference. |
| Correspondence roles and dates | Implemented M1 subset | Retained; pointer-valued apparatus endpoints are distinguished from date-valued `from/to`. |
| `relation` active/passive/mutual assertions | Preservation only as generic fields | Typed, inspectable `tei/relationship` records with ordered participant resolution. Still preservation only as an active relationship graph. |
| Unknown elements/fields and foreign namespaces | Generic content/metadata preservation | Retained with grouped diagnostics; empty assertions gain valid point segments where their location is known. No claim of understood specialised semantics. |
| Facsimile surfaces/zones, media rendering, arbitrary selectors, overlapping stand-off XML graphs | Unsupported native interpretation or preservation only | Outside this slice. Source fields, identifiers, readable content and recognised descendants remain recoverable; no fabricated native media/edges. |
| General compact inline alternative objects, arbitrary cross-Block apparatus alignment | Requires Mutable extension | Deferred. Existing superposition rejects compact text and has nonempty/single-host/nonoverlap constraints; its UI is not a general multi-reading apparatus. |

No substantial new Mutable capability is required for the selected grouped-tab slice. General inline apparatus remains a separate approval boundary; it was not implemented implicitly.

## 3. Implemented semantic mappings and identifiers

[Conversion](src/interchange/tei/convert.ts) remains a deterministic source-order traversal. New role identifiers use `tei/`, while native types such as `standoff-editor-block`, `style/italics` and `mutable/gloss` retain their native names. Authored source values remain unchanged in `metadata.fields` and ordered `metadata.references`.

`sourceElement` identifies the origin of a semantic assertion; `metadata.tei.conversion` records conversion policy; `metadata.interchange.provenance` records the filename, format and converter. These are import-time facts, not a live XML binding or an audit of subsequent enrichment. Later edits use ordinary native commands/history. No source XML is embedded.

The feature flag is passed through the actual worker request. Setting it false selects the prior M1 semantic policy for new imports; disabling it does not remove existing annotations or make saved M2 documents unreadable. Small correctness fixes for root identification and applying a relative `xml:base` exactly once also apply to the older conversion policy.

## 4. Alternative-content representation and behavior

`choice`, `app` and `rdgGrp` use a native `container-block` with `tei/alternatives`, owning a native tab row. Metadata records the specific group kind and `tei/source-order` selection policy. Each branch retains a distinct namespaced role and ordinal. Its own semantic definitions retain attributes, responsibility, witness tokens and source identifiers.

All authored branches remain in source order. Repeated labels receive existing numeric suffixes; empty branches contain an editable empty TextBlock and a semantic point. Rich and nested content remains native text, independent style/semantic ranges and nested groups. Prefix/suffix text is emitted once. Branches are never multiplied into whole-paragraph combinations.

Tab clicks select a session view without repository commits, snapshots, capture or index rebuilding. **The last viewed tab is not persisted as an editorial choice**: native reopening starts from the authored initial flags. Text edits within every branch are persisted. Unexpected child content is retained in a recovery tab with a diagnostic; significant `xml:space="preserve"` content is not discarded.

Paragraph flow can change around grouped alternatives. Experimental `text/superposition` remains unchanged and is not enabled by the importer. There is no collation, witness ranking, inferred preferred reading or complete apparatus UI.

## 5. Milestones and positional semantics

`pb`, `cb`, `anchor`, `milestone`, `space` and no-break `lb` emit `tei/milestone` definitions with exact point segments. Positions count Unicode code points, including combining marks separately. Native source order, `xml:id`, labels, units, facsimile links and other authored fields remain intact. Between structural children, an empty native text carrier can hold the exact ordered boundary without adding a visible placeholder character.

New points use `isZeroWidth: true, start: boundary, end: boundary`. Existing compact affinity determines insertion/replacement behavior: internal points default after insertion, end points default before it; explicit affinities remain authoritative. Tests cover both this form and `end = start - 1`, including edit, split/join, Undo/Redo and Save/reopen without normalising stored endpoints. Deleting a boundary may consume its segment under the existing policy; the shared semantic definition remains valid.

Ordinary `lb` retains the prior newline and normal one-character annotation. `space` retains its location and dimensions but does not synthesize width or spaces; a `space-layout` diagnostic states the presentation limitation. A source page/column break never becomes a native Page.

Saved indexing now accepts **both valid point forms**, including empty and EOF positions, while preserving raw authored attributes. Its derived SQL collapsed UTF-16 position is not written back into native annotations. Invalid point shapes and out-of-bounds positions still fail. This is a narrow adapter correction, not a new persistence format or a weakened ownership validator.

## 6. Editorial interventions

Distinct `tei/editorial` roles now cover addition, deletion, substitution, supplied, surplus, unclear, gap, damage, restoration and hand shift, alongside the existing alternative-reading roles. `parentEditorialId` retains the enclosing editorial operation for nested interventions, including substitution children and restored deletions. Multi-Block editorial content shares its definition across local segments.

Responsibility, certainty/confidence, reason/cause, placement, hand, witness and reference fields are retained only when authored. Pointer collection now understands `hand`, `handShift/@new`, `change`, `spanTo` and relevant linking attributes. Empty editorial elements use points. Deletions retain readable text and never set a native deletion tombstone; `restore` does not execute Undo. Visual styling remains independent of scholarly meaning.

## 7. Entities, references and correspondence

Only `ref` on `persName`, `placeName`, `orgName` or generic `name` can create a linked local Entity mention, and only when its resolved target is a compatible genuine source definition. A person-name reference to a Place is retained as a source assertion without fabricating a Person match. Editorial `resp`, witness `wit`, arbitrary `target` and `sameAs` assertions do not become Entity mentions.

`relation` preserves its name/qualifiers and ordered active, passive or mutual participants as a `tei/relationship` definition. Resolved, unresolved and ambiguous targets remain independent; repeated tokens are not deduplicated in source evidence. No relationship is coerced into a canonical binary edge.

Apparatus `from/to` are pointers; dates with the same attribute names remain lexical date fields. Relative XML bases are applied once at each structural boundary. Inline-only and empty TEI roots retain their source identifiers correctly. Reference resolution remains an import-time observation, not a promise of automatic relinking after arbitrary editing.

## 8. Native presentation and editing qualification

The implementation reuses native tabs, the existing annotation monitor and existing local Gloss behavior. The monitor now finds points at the exact caret boundary, including EOF and empty text. It shows an empty excerpt and zero length for a point, rather than highlighting the adjacent character. Point movement and metadata editing preserve the endpoint convention. Compact linked-range excerpts use the logical text reader rather than an empty canonical Cell list.

Rendered tests qualify nested/empty alternative switching and branch editing, editorial metadata, point metadata edits with Undo, manual dirty state, native reopen and Metadata access through both compact and legacy admission. Chrome qualification uses the actual worker and native bank admission for both WeGA letters and the invented semantic fixture. Trusted CDP input, Undo/Redo, native capture/reload, nested tab selection, cancellation and timeout pass in both admission modes.

Bounded-work checks establish that ordinary edits and history replay do not invoke conversion, network access, snapshots, native capture, saving, reference-index rebuilds or full projection rebuilds; unrelated DOM remains unchanged. A compact point-edit test observes only one affected content record per edit/Undo/Redo and zero unrelated payload reads. Tab selection performs no canonical commit. Existing repository-enumeration and annotation geometry regression checks pass. Explicit shared-definition edits retain their existing canonical validation/transaction path; no broad new work is added to typing.

Presentation limits are explicit: there is no document-wide milestone navigator, dedicated editorial form, canonical Entity reconciliation or inline apparatus alignment. Point inspection requires navigating to its native text boundary. Source filename/policy provenance is native metadata, not a dedicated source-file browser.

## 9. Semantic fidelity and regression tests

The authentic WeGA fixtures remain byte-for-byte unchanged. [semantic-sublimation.xml](src/interchange/tei/fixtures/semantic-sublimation.xml) is explicitly invented and covers nested and empty alternatives, witnesses, grouped readings, editorial operations, Unicode/whitespace, exact positions, local definitions, correspondence and unresolved relationship participants. Additional adversarial cases cover unusual alternative children, foreign/unknown content, malformed XML, budget exhaustion, relative bases and invalid points.

Relevant tests:

- [Semantic oracles](src/interchange/tei/semantic-sublimation.test.ts): exact text, ranges, attributes, group selection, identities, participants, both point forms, indexing and bounded edits.
- [Rendered M2 qualification](src/rendering/tei-semantic-sublimation.test.tsx): compact/legacy alternatives, empty/EOF points, metadata edits, native persistence and unrelated DOM stability.
- [Point commands](src/block-tree/annotation-commands.test.ts): movement, metadata, empty paragraphs, retained endpoint forms and invalid patches.
- Existing TEI converter/encoder/integration/rendering suites, native resource/session/compact persistence, saved SQL projection/facts, tabs, annotation monitor/range events, linked-annotation performance and superposition regression suites.

**217 tests across 19 suites are covered by the final broad run and focused reruns.** The broad run initially had two stale expectations for the old `person-name` spelling; these were updated to `tei/person-name`, and the entire seven-test bounded-work suite passed. The final point-rendering expansion passes eight tests. Client/server typechecking and the production harness build pass. Existing bundle-size/dynamic-import build warnings remain.

The 300,100-character legacy persistence case also passes (11.3 seconds in the broad run). It is retained as a capacity check, not an exceptional single-TextBlock milestone gate.

## 10. Full-Flint performance results

Three sequential unprofiled samples per case, production Vite build, Chrome **157.0.8103.80** headless, 1440×900, device scale 1, no CPU throttle. Build/test jobs were not run concurrently with timed browser work. The interval includes fresh worker startup, complete conversion, native admission, unsaved-candidate capture, the actual Flint open/render and two frames. Metadata includes native panel switching, focus, layout and frames. Fixture loading and initial empty application startup are outside the interval, matching the established harness.

| Case | Final usable text, median (range), ms | Final Metadata, median (range), ms | Release result |
| --- | ---: | ---: | --- |
| A040080 | **76.3 (69.2–101.2)** | **84.0 (83.6–84.2)** | All samples meet 500 ms / 250 ms |
| A041209 | **283.4 (277.9–296.5)** | **115.9 (115.7–132.8)** | All samples meet 1,000 ms / 250 ms |
| Derived anthology | 1,040.8 (1,036.5–1,049.2) | **283.1 (281.4–283.9)** | Scaling measured; Metadata remains above 250 ms |

| Median lifecycle stage, ms | Small | Large | Anthology |
| --- | ---: | ---: | ---: |
| Worker round trip | 29.3 | 30.7 | 52.3 |
| Native admission | 9.6 | 17.2 | 70.6 |
| Candidate registration | 1.5 | 2.2 | 8.1 |
| Open and render | 35.9 | 232.4 | 910.0 |
| Native capture | 4.2 | 7.6 | 35.7 |
| Manual-save coordinator, in-memory sink | 9.1 | 16.2 | 66.3 |
| Compact native reopen | 4.0 | 9.2 | 36.9 |

Each imported resource has **zero canonical character Cells**, one Page, complete semantic conversion and no truncation. Authored text counts remain 3,271 / 17,283 / 58,614. Final native sizes are 61,935 / 149,639 / 544,628 bytes; the added semantics increase bytes without materialising canonical Cells. Admission publishes once, uses no snapshot and does not rebuild unrelated Document projections. Manual-save bytes and reopened native bytes match exactly.

The established real Flint typing benchmark also passes before/after on the same native fixture, including trusted input and Undo. Handler median/p95 changes from **7.0/13.1 ms to 3.5/5.7 ms**; settled median/p95 changes from **9.7/16.9 ms to 5.0/7.1 ms**. Both runs have zero snapshots, status reads, service requests and worker starts, and restore the original text. These are measured samples, not proof that semantic conversion caused the improvement or a guarantee of visible keystroke latency. Headless frame measurements are retained in the raw evidence.

The twenty-event imported-document probes also restore text with zero snapshots. Their median handler times are approximately **3.5 / 1.4 / 1.0 ms**. These are separate from the trusted-input benchmark.

### Remaining anthology bottleneck

The final unprofiled Metadata switch spends about **180 ms synchronously** out of 283 ms total. A separate diagnostic trace measures 284.4 ms and identifies **native focus/layout during retained panel switching**, not worker conversion or canonical Cell construction: 131.0 ms sampled self-time in native `focus`, called through `core-block-views.tsx` → `FocusService`; 71.1 ms Layout and 58.7 ms style/layout-tree updates occur in the marked interval. Retained outlet `moveBefore`/removal work is also visible. These nested/sampled categories overlap and must not be added together.

The larger initial render likewise dominates admission: about 910 ms of the anthology's 1,041 ms lifecycle. This is a specific remaining presentation cost. No broad renderer or canonical architecture work was undertaken to chase it.

Evidence: [merged baseline](artifacts/tei-performance/m2-merged-baseline.json), [final samples](artifacts/tei-performance/m2-final.json), [semantic-fixture sample](artifacts/tei-performance/m2-semantic.json), [Metadata diagnosis](artifacts/tei-m2/metadata-analysis.json), [compact Chrome smoke](artifacts/tei-m2/browser-smoke.json), [legacy Chrome smoke](artifacts/tei-m2/legacy/browser-smoke.json), [typing before](artifacts/tei-m2/typing-before/results.json), [typing after](artifacts/tei-m2/typing-after/results.json). Artifacts are local qualification outputs, not user documents.

## 11. Unsupported and preservation-only boundaries

- Continuous inline rich/multiple/nested alternatives on compact text need further native qualification; grouped tabs are the implemented UI.
- Apparatus alignment, external/stand-off attachment, witness collation, automatic hand propagation, canonical identity enrichment and active source relationship graphs are not implemented.
- Significant spaces and source pagination retain semantics and exact locations, not facsimile layout.
- Unknown structures retain supported descendants/readable content and useful metadata with diagnostics; this is not lossless semantic equivalence. Unsupported XML selectors do not become guessed spans.
- General malformed-XML resynchronisation remains deferred. The trusted-prefix/literal-suffix policy and bounded fresh parsing for undefined entities remain as qualified in M1.
- Native mode restrictions, explicit truncation budgets and import-time reference-resolution limitations remain. No XML archive, round-trip export or permanent source synchronisation is supplied.

## 12. Recommended Milestone 3 and reproduction

Prioritise a narrow qualification for compact inline alternatives only if continuous paragraph flow is required: multiple/empty/nested readings, owned rich content, range affinity, edit/history behavior and presentation-only switching must be specified before substantial implementation. Keep grouped tabs as the supported fallback. Separately consider a native milestone inventory/navigation affordance and explicit local-definition binding. The measured retained-panel focus/layout cost is a bounded presentation investigation, not a reason to reopen canonical architecture.

Reproduce with the commands in [the harness README](scripts/tei-performance/README.md), plus:

```sh
npm test -- src/interchange/tei src/rendering/tei-import.test.tsx src/rendering/tei-semantic-sublimation.test.tsx --maxWorkers=1 --minWorkers=1
npm run typecheck
NODE_OPTIONS=--max-old-space-size=8192 node scripts/tei-performance/build.mjs
# Serve artifacts/tei-performance/site on 127.0.0.1:3108, then:
TEI_FLINT=1 TEI_RUNS=3 TEI_LABEL=m2-final node scripts/benchmark-tei-browser.mjs
# Against a current-source Vite server on 3107:
TEI_QUALIFICATION_URL=http://127.0.0.1:3107 node scripts/qualify-tei-browser.mjs
TEI_COMPACT=0 TEI_OUTPUT=artifacts/tei-m2/legacy TEI_QUALIFICATION_URL=http://127.0.0.1:3107 node scripts/qualify-tei-browser.mjs
BENCHMARK_COMPACT=1 BENCHMARK_OUTPUT=artifacts/tei-m2/typing-after node scripts/benchmark-flint-typing-browser.mjs
```

The broader regression command is retained in [the regression log](artifacts/tei-m2/regression.log), with [bounded-work rerun](artifacts/tei-m2/bounded-final.log), [point-rendering rerun](artifacts/tei-m2/endpoints-final.log) and [typecheck log](artifacts/tei-m2/typecheck.log).

TEI interpretation was cross-checked against the repository catalogue and official P5 reference entries for [choice](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-choice.html), [app](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-app.html), [space](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-space.html) and [relation](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-relation.html). These inform the deterministic mappings; the importer has no network dependency.
