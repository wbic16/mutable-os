# DCP native authoring — Stage 2A qualification

9 November 2026. Stage 1 is accepted. The first bounded Stage 2 increment is implemented and qualified; `dcpNativeAuthoringStage2Text` is enabled by default and requires Stage 1. Later Stage 2 families and Stage 3 have not begun. The [Stage 2 plan](DCP_NATIVE_AUTHORING_STAGE2_PLAN.md) identifies the reviewable sequence.

## Qualified authoring routes

| Projection / operation | Native effect and shared preparation | Scope |
| --- | --- | --- |
| Paragraph/heading `textStyle` | `prepareTextAppearance` and `textAppearanceProperty`; style bar uses the same property validation | Alignment, nonnegative integer indentation, named normal/half/three-quarters sizing. Heading level owns heading size. Native indentation retains its existing string representation. New composition only. |
| `code {id,kind,language,text}` | Extracted `standoffCodeDto`, reused by the human Standoff code menu | `standoff-code-block` with an owned TextBlock and native language configuration. Literal content, including angle brackets, CR/LF and Unicode, is preserved. Native highlighting supports JS/TS/Markdown; other language labels retain literal code. |
| `source {id,kind,format,text}` | `sourceBlockDto` / existing `sourcePayload`, reused by human source menus | Native Markdown or HTML source with the existing versioned format payload. Exact source, isolated preview; no Markdown-to-composition fallback or resource acquisition. |
| Curated inline/range/existing-source formatting | Authoring descriptors beside `standoffStyleSchemas`, consumed by native range annotation and DCP admission | `style/strikethrough`, `style/subscript`, `style/superscript`, `style/highlight`, `text/background-colour`, `reference/url`. The first four are parameterless; background colour and hyperlink use validated `value`. Existing colour/bold/italics/underline and semantic routes remain. |

No raw native property DTOs, arbitrary metadata or independent per-type DCP constructors were introduced. Canonical admission, host-generated native identities, source authority, ownership, immutable contributions and atomic commitment remain authoritative. The feature adds nullable `textStyle` to the negotiated provider schema; host admission still accepts older paragraph/heading declarations with that field omitted. Examples follow the negotiated schema. Disabled Stage 2 and disabled Stage 1 retain their prior contracts.

## Inspection, catalogue and controls

Explicit native inspection now identifies CodeBlocks, their owned text and authored language, and source Blocks with their versioned format and literal text. Text appearance and annotation values retain native property identities. Inspection remains bounded and explicitly non-lossless; it is not accepted as reconstruction input.

The catalogue exposes `composition.code`, `composition.source`, `configuration.text` and `formatting.core` using shared parameters/effects. Native feature prerequisites remain separate from route support. Every individual detail response, including recursive composition schemas, fits the existing 8,192-byte limit. Catalogue snapshots and examples do not mutate the baseline adapters or later disabled exchanges.

Code language selection, whole-source conversion and linked-source refresh now respect the existing native protection mechanism. Source text was already read-only when protected. Draft controls remain editable and react correctly on submission/Undo; presentation controls remain available. No DCP-only state or widgets were added.

No retrieval budgets increased. Oversized literal source reads explicitly report truncation at the existing 24,000 UTF-16-unit bound, rather than throwing a generic search-budget error or implying complete text. Generated literal text counts against the existing 24,000 output-Cell budget; code's owned TextBlock counts against the native Block budget. Existing inspection node/depth/byte and tool-call limits remain.

## Qualification evidence

Focused validation used the existing fixtures:

```sh
npx vitest run src/features/dialectic/dialectic.test.tsx src/features/dialectic/dcp/capabilities.test.ts server/dialectic/providers.test.ts src/features/dialectic/dcp/dcp.test.ts src/features/dialectic/dcp/identities.test.ts
npx vitest run src/runtime/range-annotations.test.ts src/interchange/source-block.test.ts src/rendering/source-block-view.test.tsx src/rendering/standoff-code.test.tsx scripts/audit-dcp-vocabulary.test.ts
npx vitest run src/features/grouping/document-style-bar.test.tsx -t 'exposes every canonical style|increments paragraph placement|heading|alignment'
npm run typecheck
```

**145 focused tests passed across these suites; reactive and server TypeScript checks passed.** The focused suites cover:

- Native human-menu/DCP shape and configuration equivalence, source format identity, exact literal line endings/Unicode, heading/text appearance, new inline and overlapping range annotations, and annotations on protected earlier text.
- Wrong appearance fields/values, heading-size conflicts, invalid literal text/languages/formats, arbitrary metadata, unsafe hyperlinks/colours, forbidden formatting attributes and oversized output rejected without native changes.
- Stale/foreign source authority and invalid late annotation rejection; injected canonical insertion failure rolls back prepared source anchors, annotations and definitions.
- Feature prerequisites and prior-profile compatibility; OpenAI/Anthropic strict schemas with resolvable references, nullable appearance and bounded Anthropic expansion.
- Protected native language/conversion controls, programmatic change guards, and draft-to-submitted-to-Undo control state.
- Atomic Undo/Redo and native capture/encode/decode round-trip for code/source/formatting; cheap dirty tracking remains manual-save based. This is a native persistence round-trip, not a claim that a live Cavern filesystem save was exercised.
- No typing-triggered DCP retrieval/network calls, full snapshots or projection rebuilds. Existing code/source renderer tests also check bounded syntax updates, unrelated-block isolation, no preview/layout/snapshot work during source typing, and IME preservation. No user-visible latency claim or Flint timing benchmark is made: this increment adds no typing service.
- Historical vocabulary audit remains intact as the pre-Stage-1 baseline. New coverage is recorded below rather than rewriting the audit to imply universal parity.

No live provider exchange was run: the qualification environment had no configured provider credentials. Deterministic provider transport/schema and native commitment fixtures passed; they do not establish live model compliance. The two previously documented style-bar highlight-count failures were outside the targeted style/indent checks and were not changed.

## Operation-level coverage still outstanding

| Canonical family / operation | Remaining work |
| --- | --- |
| Legacy `code-mirror-block` / human Add Code | Extract the menu's plain-code preparation and qualify its textarea/control behavior before exposing an equivalent route. The standoff-code projection does not claim this distinct native operation. |
| Lists/task lists; table/grid configuration | Stage 2B: shared configuration, owned structure and initial task state; protected operational controls. Existing basic DCP lists/tables/grids remain partial coverage. |
| Surfaces/Sides, tabs/pages, marginal content | Stage 2C: logical compound builders, native relationships and destination/state constraints. Existing reading support is not authoring parity. |
| Sticky notes and other Document widgets | Stage 2D: shared settings, authored initial versus operational state, lifecycle and immutable contribution controls. |
| Other Block properties and curated standoff types | Continue operation-by-operation qualification; arbitrary native metadata and experimental/decorative styles are not advertised. Existing import/Markdown transformations and edits to existing content are not implied by creation parameters. |
| Managed media, resource binding/import and native copying | Stage 3 remains deferred. Literal source creation does not acquire resources, create trusted captures or grant copying authority. |
| Markdown fallback, notices/activity, task expectations, media generation, general submitted-content editing | Explicitly deferred by the brief. |

No significant architectural restructuring was needed. This increment stops at Stage 2A for review.
