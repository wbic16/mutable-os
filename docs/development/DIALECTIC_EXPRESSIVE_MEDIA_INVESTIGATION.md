# Dialectic expressive media — investigation and implementation plan

9 November 2026. **For review; no feature implementation started.** Recommended sequence: capability discovery; bounded Surface fallback with notice data; contribution activity controls. Preserve typed DCP identities, native GUIDs, source authority, continuity, canonical admission and the single repair.

## 1. Native capability versus DCP capability

The current DCP constructor admits four composition kinds. Native rendering is much broader. “Unavailable” below means unavailable for DCP authoring, not absent from Mutable. Native registration also depends on feature activation.

| Family | Actual native implementation | Current DCP status |
| --- | --- | --- |
| Paragraphs and inline formatting | `standoff-editor-block`; registered standoff styles | Authorable through `paragraph.markup` and bounded ranges; readable and exactly anchorable when eligible |
| Headings, quotations, code | Heading Block properties; quotation text; `standoff-code-block`, `code-mirror-block` | Ordinary text/styling possible; no heading, blockquote or code constructor. A bold paragraph is not a native heading |
| Hierarchy and lists | `container-block`, `indented-list-block`, list-item containers | `group` and ordered/bullet `list` authorable; arbitrary nesting stays within DCP limits |
| Tables | `table-block`, rows and cells | Rectangular `table` authorable, including a 2×2 table; no arbitrary layout/attribute bag |
| Spatial/grid/card layouts | Registered `grid-block`/row/cell use table views; sticky notes, positioned native content; `canvas-block` is a preview view | No grid/card/positioned-content constructor. A 2×2 table is a possible **tabular alternative**, not proof of card-grid authoring |
| Surfaces and reverse faces | `surface-block` with `side-block` children; `ReversibleSurfaceView` | Renderable but not constructible by DCP today. Front/back reading needs explicit adaptation |
| Source annotation | Native range definitions and standoff properties | Exact-source anchors and admitted classifications supported; styling/annotations on generated text supported. No generic editing or marginal-layout constructor |
| Glosses and arguments | `mutable/gloss`, `dialectic/argument`, Document-owned definitions | Authorable under profile `4b-1`; distinct identities, not inferred from prose or classification |
| Entities and relationships | `ScopedEntities`, `mutable/entity`, Entity relations and `dialectic/argument-relation` | Document Entity creation, admitted references and directed relationships under `4b-1`; no global Entity mutations. Legacy Claims/claim references are not interchangeable with DCP arguments |
| Images | `image-block`, image Cells, managed assets and native package support | No DCP image constructor or asset acquisition. Existing metadata/textual context is not image perception or a persisted image |
| Video/YouTube/Vimeo | `mutable/video-block`, `youtube-video-block`, resource-player registrations | No DCP constructor, binary input/output adapter or durable acquisition path |
| Other resources | PDF, IIIF, article/citation, web/academic/structured-resource views; iframe views | Native services exist; no corresponding DCP constructors. Unsupported-view diagnostics and child text do not establish full media readability |
| Interactive content | `checkbox-block`, task-list state, tabs, timer and 3D-object features | No dedicated DCP constructors; generated list text does not create an interactive checklist |
| Presentation | Desktop and Textual through `ApplicationPresentations`; retained Document session | Presentation capability, not a model-authored Block or a request to switch workspaces |

Authority comes from several existing places: [core registrations](../../src/rendering/register-core-views.ts), feature registrations, [BlockRegistry](../../src/block-tree/registry.ts), [DCP schema](../../src/features/dialectic/dcp/provider-schema.ts), [prepare/materialisation](../../src/features/dialectic/dcp/exchange.ts), the [semantic legend](../../src/features/dialectic/dcp/markup.ts), provider adapter and application presentation contracts. No single registry currently contains all authoring constraints. `BlockTypeRegistration` supplies a view, capabilities, optional constructor and slots, not a complete DCP schema.

## 2. Catalogue contract and discovery

Use small descriptors adjacent to the **admitted DCP adapters**, referencing the shared logical schema and shared constructor-limit constants. Combine these with current registrations, flags and provider-adapter support at exchange creation. Do not enumerate or duplicate the whole Block registry. Cache by relevant registration/configuration state; invalidate on capability changes, never typing.

Illustrative detailed descriptor, with parameters derived from the existing schema:

```json
{
  "id": "composition.table",
  "name": "Table",
  "purpose": "Compare material in rectangular rows and cells",
  "nativeTypes": ["table-block", "table-row-block", "table-cell-block"],
  "availability": {
    "representation": true, "renderer": true, "constructor": true,
    "providerAdapter": true, "resources": "none-required", "enabled": true
  },
  "read": "native-structure-and-text",
  "author": true,
  "schemaRef": "#/$defs/Table",
  "constraints": {"rectangular": true, "maxRows": 64, "maxColumns": 16},
  "addressing": "TextBlocks can be discovered and anchored after commit",
  "presentation": "Native table; width and wrapping depend on workspace",
  "example": {"id":"new:b1","kind":"table","rows":[[[
    {"id":"new:b2","kind":"paragraph","markup":"Cell","ranges":[]}
  ]]]}
}
```

The returned detail should include the referenced parameter-schema fragment and its required/optional fields; reuse existing definitions rather than retyping a competing schema. The small adapter supplies purpose, resources, presentation caveats and examples. Known unsupported capabilities such as `composition.grid`, `media.image` and `media.youtube` need explicit status/reasons; unknown capability IDs return `unknown`, never guessed support.

Send a compact initial summary of ID, purpose and authoring status. Proposed detailed tool: `describe_capabilities({ids:["composition.table","semantic.gloss"]})`, accepting 1–4 IDs and a bounded result, initially at most 8 KiB. Batching avoids spending the entire six-call allowance on discovery. Charge it to the **existing** call, retrieval-result and deadline budgets. Expand the existing tool union, dispatcher and provider allowlists; do not add a second tool transport or broaden repair permissions. Keep source recovery rules unchanged.

“Authorable” requires the entire path: native representation, current renderer/presentation availability, admitted constructor, configured provider adapter, resources and enabled feature. Today the adapters transmit structured text; a model name or native media renderer does not establish media generation support. Existing `src:<tag>:…` and `new:…` identities remain unchanged; catalogue IDs identify capabilities, not Document objects.

## 3. Surface fallback: feasible, with specific integration gaps

The current reactive implementation supports this shape; there is no separate current `reverse-block` constructor to reuse:

```text
Contribution container
  native introduction
  Surface [fallback conversion metadata]
    Side [surfaceRole: front]
      Container → converted native Blocks
    Side [surfaceRole: back, provenance role]
      StandoffCode [markdownCode.language: markdown]
        one TextBlock → exact original Markdown
  native conclusion
```

[BlockSurfaces](../../src/runtime/block-surfaces.ts) and [ReversibleSurfaceView](../../src/rendering/reversible-surface.tsx) already support multi-Block faces, retained mounts, flip/reveal, history and persistence. Flipping is presentation state. Construct the wrapper in the prepared DCP fragment, not by running wrapping commands after commit.

Use [markdown-import.ts](../../src/interchange/markdown-import.ts): its existing CommonMark/GFM-table parser and semantic importer support nested lists, tables, headings and formatted text. The Lezer [markdown-native.ts](../../src/interchange/markdown-native.ts) clipboard path is intentionally narrower; Markdown Input Transformation is a typing-time service, not a response importer. Reuse [runInterchange](../../src/runtime/interchange-worker.ts) for cancellable preparation, with a narrow fallback conversion policy through the existing worker/parser.

Preserve the original string **before** `convertSource`, which normalizes CR/CRLF. Store it once as reverse-side native text, without trimming, re-exporting or splitting it into line Blocks that synthesize separators. The existing DCP raw response remains ordinary provenance; do not add another Markdown store. Front content is authoritative conversational content; reverse source is inspectable provenance, with no two-way synchronization.

Proposed node, alongside ordinary composition:

```json
{"id":"new:b3","kind":"markdown-fallback",
 "reason":"unsupported-layout","requestedCapability":"composition.card-grid",
 "markdown":"## Four perspectives\n\n..."}
```

The host validates the reason/capability identifier, converts, and assigns native identities. The model does not supply the front DTO or declare conversion success. Surface metadata holds converter version, original-source Block reference, actual conversion outcome and typed diagnostics. The model's requested capability is context, not evidence that it was delivered.

Count wrappers, front and reverse together against existing DCP node/depth/text/response limits. The importer's much larger general limits are **not** DCP permission. Preflight a smaller per-segment input bound, convert in the worker, validate the entire prepared fragment and recheck source/session fences before the existing atomic commit. `standoff-code-block` is not in the interchange materializer's passive Block allowlist: build its trusted wrapper explicitly around admitted text, or qualify a narrowly scoped admission extension; do not silently produce an opaque wrapper.

### Conversion outcomes and fidelity

| Construct | Existing behaviour / proposed fallback policy |
| --- | --- |
| Headings, lists, tables, emphasis | Native conversion available. Preserve/import supported structure; report H5/H6 presentation and table-alignment losses |
| Blockquotes | Importer retains paragraphs and reports lost quotation layout. Preserve safe literal quote formatting if that is necessary to keep the distinction visible; classify as partial |
| Images | Importer creates inert image descriptors; materialisation without assets can yield failed image Cells. Instead preserve the literal reference/alt text visibly on the front with an unsupported-media diagnostic; no fetch or invented asset |
| Raw HTML | Existing importer retains literal text, not executable HTML; show it safely and report the limitation |
| Mermaid/code fences | Preserve code and language metadata as visible code/text. No diagram-generation claim; Mermaid rendering is not an admitted DCP capability |
| Video links/embeds | Safe links remain links; unsupported embeds remain visible source text. Neither is reported as a native player |
| Checklists | Importer preserves task state; submitted content must remain protected. Present read-only state and disclose that an interactive control was not delivered |
| Horizontal rules/unsupported layout | Importer can omit a rule and warn. For fallback, preserve a visible literal/native equivalent instead of relying on the reverse alone |

Return **complete**, **partial** with typed losses and visible preservation, or **rejected** for unsafe/oversized/unrepresentable input. Existing importer notices are mostly English strings wrapped as `semantic-loss`; introduce stable diagnostics at the conversion decision points, not by parsing warning text. Reject before commit if safe front preservation cannot be guaranteed. Do not mark the other native effects successful after an atomic rejection.

Default source traversal currently includes both faces. A small shared fallback-provenance policy must cover inventory, search, manifest/read child expansion, controller context capture/resend and provider-history projection. Exclude only fallback provenance from ordinary conversation; do not hide unrelated user-authored reverse notes. Surface inspection should explicitly expose its provenance Block through the existing source machinery. Converted front TextBlocks then support normal later discovery and exact anchoring. Same-response semantic aliases into anonymous converted Markdown spans are not promised in this first increment.

Existing submitted-contribution protection covers both faces and structural edits. Disable misleading editable controls such as the reverse code-language selector; flipping remains available. Require the protection/Surface dependencies before advertising fallback. Also qualify passive/Sequence presentation: `standoff-code-block` currently lacks passive admission. Do not advertise universal presentation simply because Desktop renders it.

Fallback is for representation, not a replacement for source retrieval, native annotations, Glosses, relationships or durable assets. Task expectations remain deferred: instructions and validation of actual requested structures do not prove fulfilment of arbitrary prose requests.

## 4. Notices, activity and inspection

Add optional `metadata.dialectic.notices`, valid for human and AI contributions. Reuse the shape/conventions of `InterchangeDiagnostic`, with stable codes and an optional native target. Example, with a host-assigned target placeholder:

```json
{"code":"markdown-fallback","severity":"info",
 "message":"Converted from supplied Markdown",
 "target":{"kind":"block","resourceId":"DOCUMENT_GUID","blockId":"SURFACE_GUID"}}
```

`partial-conversion` points to Surface diagnostics rather than duplicating them. `validation-repaired` is derived from actual repair provenance. Unsupported-media notices require an actual host capability/conversion result. Reserve `incomplete-operation` for an explicit known outcome; do not infer it from prose. A rejected exchange remains an operational failure, not a successful Contribution with invented activity.

Derive activity candidates from existing `discursiveReferences`, human-selected `replies`, `dcp.annotationRefs`, `dcp.identityMap` and effect provenance. Resolve candidates against current native state. These recorded IDs are pointers, not authoritative counts:

- Separate additional addresses from the automatic AI reply to its request; ordinary prose should not acquire an activity bar merely for replying.
- Count source classifications on earlier Blocks separately from generated formatting. Range-anchor infrastructure and Gloss properties must not inflate the annotation count.
- Count Glosses, Arguments, Entities and relations by their distinct native identities; distinguish creation from reference.
- Verify definition/property existence, deletion, ownership and endpoint availability. Retain unavailable authored targets in inspection, but never label them as currently active operations.

DCP attribution is already sufficient for the main cases. Human source references are also recorded. Historical human annotations without contribution provenance cannot reliably be assigned. Where future human authoring has an explicit contribution context, the smallest addition is an optional `authoredEffects` receipt containing native created/reference/property pointers, captured with the associated contribution—not mutable counts or a separate activity store. Do not retrofit attribution or choose an arbitrary current contribution for unrelated edits.

Reuse [DialecticReferences](../../src/features/dialectic/references.ts), `inspect`, `inspectAnnotation`, relationship/Entity details and Gloss inspection. Source navigation needs to reveal the containing Surface before scrolling to a hidden face. Keep previews in the existing temporary SVG decoration collection.

Proposed compact views:

```text
Desktop:  ↗ 2 refs   ✎ 3 annotations   ◇ 2 glosses   → 1 relation
          ⚠ Markdown fallback · 1 conversion limitation

Textual:  [R:2] [A:3] [G:2] [L:1]   [! Markdown:1]
```

Each control has an accessible full label, tooltip and keyboard action; empty categories disappear. Selection opens a filtered section in the existing inspector or the relevant Surface, not a permanent panel below every contribution. Reuse the contribution mount-decoration lifecycle in `view.tsx`, with shared activity selectors/actions and distinct Desktop/Textual controls through the presentation contract. Preserve retained sessions and cell-aligned TUI layout.

Use per-contribution candidate caches and affected-record/definition invalidation. Offset rebasing and ordinary typing must not rebuild counts or read passage text. Resolve current text/ranges when inspecting. Do not scan the Document per row, per render or on generic revision changes. Historical notices remain historical; active counts track native Undo/Redo and deletion independently.

## 5. Bounded increments and review decisions

| Increment | Deliverable and completion criteria |
| --- | --- |
| A — catalogue | Summary plus bounded detail tool, derived schemas/limits and accurate availability. Test table/group/exact-anchor/Gloss descriptions; correctly reject grid/image/video authoring; distinguish presentation. No constructors added merely because a renderer exists |
| B — fallback and notice data | One mixed native/fallback response; exact CR/LF/Unicode Markdown reverse; native front; visible partial conversion; no asset acquisition. Test cancellation/rejection, protection, explicit provenance access, exclusion from ordinary context/history, atomic Undo/Redo and save/reload. Qualify Desktop/Textual and passive limitations |
| C — activity controls | Current-state activities and notices, human references, accurate missing-target handling, accessible Desktop/Textual controls and existing inspector navigation. Test no attribution fabrication and bounded work with unrelated Documents/ordinary typing |

Proposed default-on flags: `dcpCapabilityCatalogue`, `dialecticMarkdownFallback`, `dialecticContributionActivity`, gated by existing prerequisites. Disabling new authoring must not erase already saved native content. Do not change existing feature defaults.

Final deterministic scenario: introduction, native table, fallback Surface, Gloss on earlier text, exact source classification, directed argument relationship and conclusion. Verify the actual committed structures, source navigation, notice/activity presentation and lifecycle. Then run one or two representative live exchanges with existing model settings/budgets, retaining failures and repair evidence. Add small unsupported-media/partial-conversion/prose-only checks; no benchmark framework. Use bounded-work counters and the real typing benchmark only if editor performance changes warrant it.

Recommended decisions for review: proceed A→B→C; make initial fallback text/structure-only with no automatic asset acquisition; retain literal unsupported constructs visibly; show human activity only when attribution exists; require explicit qualification for passive reverse-code presentation. The significant risks are provenance leakage into conversation, importer fidelity gaps, bypassing DCP limits through conversion, and stale/misattributed activity—not a lack of native Surface primitives.

Evidence gathered: source inspection plus **71 existing tests passed** across Markdown import/native conversion, reversible Surfaces and standoff code. These verify reusable components, not the proposed combined feature. Only this investigation document was added; no new provider calls, application restart or feature code changes were made.
