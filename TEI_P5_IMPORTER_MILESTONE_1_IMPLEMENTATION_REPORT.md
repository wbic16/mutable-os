# TEI P5 importer — Milestone 1 implementation and qualification

**Date:** 19 November 2026. **Baseline:** `3dd15ca`.  
**Scope:** the approved [Feature Brief](TEI_P5_IMPORTER_MILESTONE_1_FEATURE_BRIEF.md), with the three implementation qualifications concerning header presentation, resource budgets and malformed XML recovery.

## 1. Result

Milestone 1 is implemented. TEI file import produces an unsaved, native editable document with exactly one initial Page. The importer preserves semantic Modes, overlapping annotations, correspondence records, genuine document-local Entity definitions, alternative readings and unresolved reference data. It uses the existing Cell editor, native admission and manual-save workflow.

The header opens in the existing inactive **Metadata** tab; **Text** is initially active. New TEI identifiers use `tei/`. Definition registration remains separate from interpretation/rendering, and both property definition indexes remain partial indexes. No clipboard admission or native persistence schema was changed.

**Qualification:** 216 tests passed across 19 suites (61.42 seconds), followed by two passing focused encoding/local-corruption checks after the final parser guard adjustment. Client and server typechecks passed. Both real fixtures passed actual Chrome/worker qualification, including trusted text input, Undo/Redo, native reload and secondary metadata presentation. Cancellation and worker timeout also passed. Two unrelated Page-command test failures were reproduced on the clean baseline and remain documented below.

## 2. Changes and integration points

| Area | Implementation |
| --- | --- |
| Pure conversion | [convert.ts](src/interchange/tei/convert.ts): deterministic mixed-content traversal, required structural/text Modes, semantic/editorial spans, correspondence, local Entity Glosses, alternatives, milestones, generic recovery and independent fragment results. |
| Parsing/recovery | [parse.ts](src/interchange/tei/parse.ts): `saxes`, namespace-aware attributes, safe encoding handling, bounded parser work, trusted-prefix recovery and limited fresh strict reparsing. No network/DTD expansion. |
| Limits and diagnostics | [model.ts](src/interchange/tei/model.ts): validated per-import configuration, bounded examples, grouped counts and explicit incomplete-import text. |
| References | [references.ts](src/interchange/tei/references.ts): source-ID multimap, late resolution, ordered raw tokens, duplicate-ID ambiguity, external/base context and real native target descriptors. |
| Producer validation | [validate.ts](src/interchange/tei/validate.ts): one-Page hierarchy, declared TEI properties/Modes, inclusive Cell ranges and actual Document-owned annotation definitions. These are converter assertions, not source grammar validation. |
| Pure declarations and lifecycle | [definitions.ts](src/interchange/tei/definitions.ts), [feature activation](src/features/tei-import/index.ts), [application assembly](src/application/features.ts). Existing independent registries and `FeatureScope.own` disposal; no generic registry framework or visual-effect registration. |
| Native candidate | [native.ts](src/interchange/tei/native.ts): codec decode, native capture and bytes prepared away from the live repository. No external clipboard materialisation. |
| Application import | [operations](src/interchange/operations.ts), [worker](src/runtime/interchange-worker.ts), [runtime interchange](src/runtime/document-interchange.ts): dedicated TEI request, stale-task/cancellation fences, atomic native admission, candidate tracking and document opening. |
| Availability/UX | [formats](src/interchange/formats.ts), [configuration](src/configuration.ts), [status UI](src/rendering/interchange-status.tsx): default-on `teiImport`, explicit `.xml` selection, `.tei` detection, full-document-only picker admission, grouped nonmodal warnings. |
| Full-document Page correction | [document import](src/interchange/document-import.ts), [native Markdown](src/persistence/markdown.ts): all callers of these full-document assembly paths receive one Page. Fragments and existing native files retain their contracts. |
| Page export compatibility | [export plan](src/interchange/export-plan.ts), [collection inspection](src/interchange/collection/operations.ts): Page is a structural export wrapper; source-only collection documents remain recognisable with or without the new Page. |
| Documentation/fixtures | [module guide](src/interchange/tei/README.md), [fixture attribution](src/interchange/tei/fixtures/README.md), and this report. |

The native hierarchy with a header is:

```text
canonical document-block
└─ page-block                         exactly one
   └─ tab-row-block                  existing native presentation
      ├─ tab-block “Text”            initially active
      │  └─ native primary content
      └─ tab-block “Metadata”        initially inactive
         └─ editable native header content
```

Without a header, content sits directly under Page. A truncation notice sits before the tabs/content, so it cannot be concealed by the inactive metadata panel. All imported Blocks remain below the Page; linked definitions remain data owned by the Document.

## 3. The three implementation qualifications

### 3.1 Header presentation

Existing text tabs were the smallest adequate secondary presentation. Existing list collapse is specifically list/task presentation; applying it would misrepresent the header as a list. Reversible surfaces would impose front/back semantics and another feature dependency. Ordinary native tabs already preserve editable child Blocks and mount the active panel.

No metadata renderer, correspondence editor or new property inspector was added. Header text uses normal Cell editing. Nonvisual field annotations and shared correspondence/action records use the existing annotation monitor's editable metadata fields. Local Entity definitions use existing Gloss facilities. Merely switching tabs remains existing presentation/session work.

The title used for the native document is initialised from the header where available. Textual wording and structured date/reference assertions remain separately editable; the importer does not install synchronisation watchers. Editing a date's displayed wording does not infer a replacement `when` value. Author, sender, recipient, salutation and signature are distinct. Publication, sending, receiving and explicitly typed dates retain their own roles; missing dates/participants are not invented.

### 3.2 Resource limits

The old generic external-text limit of 200,000 Cells does not govern TEI. TEI has independent, configurable limits:

| Budget | Default |
| --- | ---: |
| Input bytes / decoded UTF-8 byte check | 64 MiB |
| Source-content text Cells | 5,000,000 |
| XML elements | 1,000,000 |
| XML depth | 128 |
| Native content Blocks | 100,000 |
| Annotation records, including definitions/segments/presentation properties | 500,000 |
| Reference tokens | 500,000 |
| Retained diagnostic examples | 100 |
| Worker preparation timeout | 120 seconds |

Configure these through `ReactiveEditorConfiguration.teiImportLimits` or the options to the headless converter. Values must be positive safe integers. A small fixed assembly/notice reserve sits outside source-content budgets. Ordinary non-TEI file limits and clipboard admission remain unchanged. TEI token collection is incremental, and output budgets are checked during construction.

A partial output has `metadata.tei.truncated: true`, an **INCOMPLETE IMPORT** message in the native document itself, and an unmistakable import status/diagnostic. The notice survives native save/reload. A byte-limit failure admits nothing. Cancelled/stale/failed admission does not mutate the destination.

**Measured capacity, not a rendering guarantee:** the final suite converted, native-serialized and reloaded a synthetic **300,100-Cell** text, beyond the previous ceiling. It produced 357,989 native bytes in 28.8 seconds and observed 1,007 MiB JavaScript heap during the concurrent regression run. This measurement is native data preparation/reload, not a whole-book rendering benchmark, and observed heap is not peak RSS. The earlier isolated run took 24.5 seconds and observed 934 MiB heap.

The 5-million-Cell default is a configurable safety ceiling. That size has **not** been qualified as a rendered document. The existing eager Cell representation and canonical capture/admission can consume substantial transient memory; worker cancellation is available during preparation, while native admission remains an existing synchronous atomic operation. No lazy editor, streaming persistence or new rendering architecture was introduced to hide that constraint.

### 3.3 Malformed XML recovery

The safe minimum is implemented: retain complete trusted semantic content, discard the speculative current unit, and retain the affected suffix as editable literal recovery text. No parser events after an error are interpreted as trustworthy structure.

Investigation exposed an additional parser detail: `saxes` can emit a guessed `closetag` **before** signalling an unexpected close. The adapter therefore checks a nonempty close event against its actual lexical closing token before committing that unit. The mismatched-close tests verify that neither the affected opening/closing syntax nor later readable text disappears.

One narrow recovery beyond the minimum is implemented. For an undefined XML entity, preserve its spelling literally by escaping its ampersand and restart a **fresh strict parser**, at most four times. Subsequent well-formed names/paragraphs retain semantic translation. This works in text and parsed attribute contexts without trusting a damaged parser state; comments and CDATA are not treated as candidate XML fragments.

General structural resynchronisation is **not** implemented. Scanning a malformed suffix for a plausible `<p>` could find text inside an unfinished attribute, comment or CDATA section, with uncertain namespace/ancestor context. Establishing a reliable boundary would require substantially more lexical repair machinery. Mismatched nesting, broken quotes and unrecoverable tails therefore retain the documented literal-suffix fallback. The limitation is explicit rather than presented as recovered TEI structure.

## 4. Semantics and compatibility

- Required section, heading, verse, drama and letter structure uses existing Blocks with `tei/*` Modes. Compound text structures retain their role even when child Blocks require a grouping container.
- `tei/semantic` and `tei/editorial` preserve independent overlapping spans; a source deletion never deletes Cells or sets a native deletion tombstone. Existing generic formatting and alignment are reused. Block Property order/multiplicity and existing style precedence are unchanged.
- Source-ID resolution runs after target construction. Forward references resolve; duplicates remain ambiguous. Original local/external spelling, multiple tokens and token order survive. An external `xml:base` is not guessed to be local. A missing target does not discard surrounding text or annotations.
- Real source-defined people, organisations and places can become local Entity Glosses. A mere missing name reference cannot create an Entity, canonical GUID or relationship endpoint. No SQL Entity/Claim/Relationship service is called by conversion.
- `choice`, orig/reg, sic/corr, abbr/expan and basic app/lem/rdg use structural tabs. Empty/nested readings remain present; the first authored branch is initially active without claiming scholarly preference. Prefix/suffix content is not duplicated and readings are not multiplied combinatorially.
- Ordinary `lb` uses a real newline Cell and a normal range. `pb`, `anchor` and no-break line markers retain explicit contextual precision. No unqualified zero-width representation is sent to saved projection. Source pagination never creates another Page.
- Unknown elements/attributes and schema-invalid but well-formed nesting retain native content and supported descendants. Namespace distinctions remain explicit. Prototype-like XML names are also treated as source data, not inherited JavaScript mapping entries.
- Existing Mode safeguards remain: plain verse lines can continue through the qualified path; identity/rich metadata can refuse continuation; Mode-bearing joins remain refused. No semantic TextBlock subclass was introduced.
- Disabling `teiImport` prevents new TEI import/declaration activation, but existing native data still renders and edits through generic facilities. Historical properties do not require membership in the new partial definition indexes.
- Fragment conversion returns roots, definitions and diagnostics, without a Document/Page in its result. Interactive fragment insertion remains deferred. An XML-root reference in a fragment does not resolve to a discarded, fabricated Document target.

## 5. Actual qualification results

### 5.1 Automated acceptance and regression suite

The full focused command was:

```sh
npm test -- \
  src/interchange/tei src/rendering/tei-import.test.tsx \
  src/block-tree/block-modes.test.ts src/block-tree/block-mode-registry.test.ts \
  src/runtime/type-definition-indexes.test.ts src/runtime/linked-annotations.test.ts \
  src/persistence/native-resource.test.ts src/persistence/native-session.test.ts \
  src/qualification/native-b2/markdown.test.tsx \
  src/interchange/document-interchange.test.ts src/interchange/collection/collection.test.ts \
  src/runtime/collection-interchange.test.ts src/rendering/document-interchange.test.tsx \
  src/rendering/block-modes.test.tsx src/rendering/text-tabs.test.tsx \
  src/knowledge-sqlite/saved-projection.test.tsx src/features/gloss/stage-b.test.tsx \
  src/interchange/markdown-native.test.ts --maxWorkers=2 --minWorkers=1
npm run typecheck
```

| Check | Actual result |
| --- | --- |
| Full acceptance/regression command above | **216 passed**, 19 suites, 61.42 seconds. |
| Final local NUL corruption and encoding checks | **2 passed**, 39 unselected tests skipped, 3.06 seconds. This targeted run followed the final parser guard adjustment; it is not a claim that the full suite was rerun afterward. |
| Client and server typechecks | Passed, no TypeScript diagnostics. |
| Actual Chrome/worker qualification | Both real fixtures, trusted input, Undo/Redo, native reload, metadata tabs, cancellation and timeout passed. |
| Additional Page-command suite | 3 passed, 2 failed; both failures reproduced on the unchanged baseline (§5.3). |
| Whitespace/error-marker check | `git diff --check` passed. |

Final targeted command:

```sh
npm test -- src/interchange/tei/convert.test.ts src/interchange/tei/integration.test.ts \
  -t 'NUL corruption|decodes explicit encodings'
npm run typecheck
```

An isolated NUL corruption now follows ordinary malformed-input recovery rather than rejecting useful surrounding content. NUL/whitespace-only input remains unreadable. The regression retains the trusted semantic prefix and readable literal suffix through native capture.

The pretest worker preparation ran through the repository's normal `npm test` script. Typecheck includes both `tsconfig.reactive.json` and `tsconfig.server.json`. Supporting logs are in [artifacts/tei-m1](artifacts/tei-m1/acceptance-regressions.log); generated artifacts are subject to the repository's existing ignore rules.

| Acceptance area | Evidence |
| --- | --- |
| A01–A04: vocabulary, real documents, imperfect nesting, unsupported parents/fields | Converter tests, pinned source tests, native persistence/projection tests and rendered real-letter tests. |
| A05–A07: unresolved/forward/duplicate/ordered references and correspondence | Native annotation metadata/target assertions; separate author/sender/date assertions; missing-participant case; no network/Entity fabrication checks. |
| A08–A10: editorial, alternatives, pagination | Overlap/range checks, preserved deletion text, nested/empty branches, contextual milestones, one Page and saved projection. |
| A11–A12: malformed XML, whitespace and Unicode | Mismatch/quote/truncated-tail tests, bounded fresh entity reparsing, DTD/CDATA cases, significant/mixed whitespace, astral/combining Cell offsets. |
| A13–A15: native persistence, namespaces/flags, Page hierarchy | Capture/decode/projection, real native Save/open through the existing store, owned declarations/disposal, feature-off rendering, full-document wrapper/collection/Markdown regressions. |
| A16–A17: real editing and margins | Rendered text/metadata editing, annotation-monitor updates, IME, Undo/Redo, Mode guards, alternative tabs, real letters, native Gloss and page margin relations; existing Gloss geometry regressions also passed. |
| A18–A20: limits, atomic failure, determinism, bounded work | Byte/Cell/depth/element/Block/property/reference limits, visible persistent truncation, stale/cancelled/failed admission, ID-normalised determinism and typing spies. Chrome additionally exercises real worker cancellation/timeout. |

Typing and provisional-input checks assert that conversion, native capture, repository snapshots/rebuilds, projection rebuilds, persistence, network and type-discovery scans are not invoked. Unrelated content identity is retained. These establish bounded-work isolation, not a general user-visible typing-latency benchmark. The existing editor input/geometry implementation was not changed; the Flint timing benchmark was not rerun or claimed as evidence.

### 5.2 Actual browser and worker qualification

Command:

```sh
TEI_QUALIFICATION_URL=http://127.0.0.1:3107 node scripts/qualify-tei-browser.mjs
```

The [reproducible script](scripts/qualify-tei-browser.mjs) used an isolated headless Chrome profile against Vite, local fixtures, the actual browser worker and trusted CDP text input. It did not open a user workspace or save user documents. This is automated browser evidence, not a claimed manual visual review.

| Fixture | Emitted Cells | Native bytes | Worker preparation + mounting | Metadata activation/mounting |
| --- | ---: | ---: | ---: | ---: |
| A040080 | 3,271 | 102,141 | 1,194 ms | 396 ms |
| A041209 | 17,283 | 242,706 | 12,510 ms | 1,985 ms |

Both had one rendered Page, initially selected Text, successful insertion/Undo/Redo, one Page after native reload, and editable metadata available through the native tab. Both were complete imports with warnings. Real worker cancellation and a deliberately short timeout both rejected preparation correctly. Detailed evidence is [browser-smoke.json](artifacts/tei-m1/browser-smoke.json).

These are single-run headless measurements, not latency guarantees. The larger letter's preparation/mount and metadata activation costs are material. Its jsdom rendered regression also takes tens of seconds. The header is initially secondary, but activating substantial header content still incurs the existing editor's mounting work.

### 5.3 Baseline failures kept separate

The optional additional `src/rendering/page-creation.test.tsx` run had **3 passes and 2 failures**. Both failures reproduce on a clean detached `3dd15ca` worktree using the same Node 22.12.0 toolchain:

1. “wraps every document child when invoked inside a nested block, preserving order, annotations and margins”;
2. “offers document-wide Page conversion on the document itself”.

Their expected DTO omits a focus bookmark, while the actual DTO contains `metadata.focus.blockId` after the existing Page command/Undo sequence. They do not test the new converter assembly path. No Page-command, focus or Undo implementation was changed to make those unrelated assertions pass. The [baseline log](artifacts/tei-m1/baseline-page-tests.log) records the reproduction. The initial baseline attempt used an older Node executable selected outside the main checkout; it was rerun under Node 22 before drawing this conclusion.

## 6. Fixtures and departures from the brief

The two mandatory WeGA letters are vendored unmodified under [fixtures](src/interchange/tei/fixtures/README.md), with their original CC BY 4.0 licence statements, retrieval URLs and actual pinned checksums. The fetched checksums differ from the earlier investigation's reported downloads; this implementation's README identifies the exact copies tested. No assertion is made that their bytes match those earlier transient downloads. Runtime qualification requires no external access.

The optional DTA long-form candidate was not added; its XML acquisition had not been verified in the brief. The large native-capacity qualification uses explicitly synthetic scholarly-length text and is not described as a real edition.

Deliberate adjustments:

- Header placement uses existing native secondary tabs, as requested, instead of placing all header text before the body.
- Independent configurable TEI budgets replace the proposed 200,000-Cell ceiling.
- Limited fresh reparsing for literal undefined entities supplements the approved safe fallback; general structural resynchronisation is deferred.
- Automated real-browser interaction replaces a claimed manual editor smoke review; the browser evidence and its limits are explicit in §5.2.
- Correspondence action metadata points to `participantAnnotationIds`, `placeAnnotationIds` and `dateAnnotationIds` for the actual shared field definitions, rather than copying participant/date values or pointing at transient segment occurrences.
- New Page wrappers required small compatibility corrections in collection source-document recognition and generic/native Markdown export. This was found by regression tests; source export semantics now pass.
- The native Markdown regression expectations were updated for the additional Page level. Their text, property and export assertions remain in place.

## 7. Remaining limitations and follow-ups

1. **Large-document cost:** 300,100 Cells are qualified through native persistence; multi-million-Cell rendering is not. Preparation, canonical admission, projections and header mounting can be expensive. Limits are configurable and worker preparation is cancellable; this milestone does not solve the editor's large-document memory/rendering architecture.
2. **Structural malformed recovery:** after faults other than the qualified undefined-entity case, later text remains literal rather than semantically reparsed. No unsafe boundary guessing is used.
3. **Point precision:** milestones other than real newline Cells are explicitly contextual. A general zero-width consistency correction remains separate.
4. **Inline apparatus:** tabs retain readings but can change paragraph flow. No comprehensive apparatus or automatic superposition activation.
5. **Reference maintenance:** resolution states are import-time observations. References are inspectable/editable metadata; there is no automatic later resolver, canonical Entity mapping or relationship browser. Arbitrary edits may leave retained metadata pointers stale.
6. **Metadata usability:** native tabs and the existing JSON annotation monitor are functional, but not a dedicated scholarly metadata form. Date wording/structured assertions and document display title/header title do not synchronize automatically.
7. **Editing safeguards:** Mode identity/metadata restrictions remain. Semantic TextBlock specialisation is still a separate architectural follow-up.
8. **Fragment UI:** headless content/definition conversion is implemented; interactive adoption into an existing Document remains intentionally unavailable.
9. **Baseline test debt:** the two reproduced Page-command/focus expectations remain outstanding and separate from the passing converter suite.

No new Block hierarchy, universal registry, source archive, permanent XML binding, general annotation framework, persistence schema, clipboard policy, automatic document saving, or canonical semantic database migration was introduced.
