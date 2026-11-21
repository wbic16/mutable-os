# TEI P5 → Mutable Ink Importer — Milestone 1 Feature Brief

**Status:** proposed implementation scope; approval required before implementation.  
**Qualification date:** 19 November 2026. **Repository inspected:** `3dd15ca`.  
**Basis:** the accepted [mapping catalogue](TEI_P5_MUTABLE_MAPPING_CATALOGUE.md), particularly R0–R4, and the attached Milestone 1 instructions. This document specifies work; it does not report an implemented converter.

## 1. Outcome and boundaries

Deliver a deterministic, offline TEI importer producing native, editable Ink. Preserve supported semantics, all recoverable readings, meaningful identifiers and metadata; recover imperfect input without requiring TEI schema validity or referential integrity. A useful import with warnings is a success.

Use existing `document-block`, `page-block`, `container-block`, `standoff-editor-block`, `tab-row-block` and `tab-block` implementations. Add descriptive TEI Modes and nonvisual property definitions, not Block subclasses. All new TEI-specific type identifiers start with `tei/`. Existing generic identifiers remain unchanged.

M1 includes full-document file import, a headless fragment conversion contract, native persistence qualification, and focused editor integration tests. Interactive insertion of TEI fragments into an existing document is **deferred**: moving Document-owned definitions into an existing resource needs an explicitly qualified admission operation. The fragment API must return content plus its required definitions, without manufacturing a Document or Page. It must not silently route through clipboard materialisation.

Excluded: semantic TextBlock specialisation, changes to Cell input or Mode editing policy, Block inheritance, clipboard admission changes, persistence-schema changes, legacy registry migration, canonical Entity creation, online resolution, general XML repair, XML archives or permanent XML bindings, TEI export, a critical-apparatus engine, and a correspondence editor. No implementation is authorised by this brief alone.

## 2. Verified capabilities and consequences

“Existing” below means inspected source, not an end-to-end TEI test result. The acceptance suite in §13 must qualify the composition.

| Capability | Evidence | M1 consequence |
| --- | --- | --- |
| Canonical document ownership and native admission | [codecs](src/block-tree/codecs.ts), [repository](src/block-tree/repository.ts), [native resource capture/admission](src/persistence/native-resource.ts) | Build a detached candidate, validate it, capture a native resource, then admit it atomically to the workspace object bank. Never mutate the active document while parsing. |
| Actual Page container | [core registration](src/rendering/register-core-views.ts), `PageView` in [core views](src/rendering/core-block-views.tsx) | Page renders ordinary child Blocks through `ChildBlocks`; no mandatory intermediate container was found. Use Document → Page → imported content. |
| Marginalia | [margin context](src/rendering/document-margins.ts), [indicators](src/rendering/document-margin-indicators.tsx), [Gloss presentation](src/features/gloss/presentation.tsx) | Reuse the existing page/margin integration. A Page supplies a layout host; annotations must still have compatible native relations/Gloss data. Do not promise every TEI annotation automatically becomes a margin note. |
| Existing full-document converters omit an actual Page | `documentFragment` in [document import](src/interchange/document-import.ts); `importMarkdown` in [native Markdown](src/persistence/markdown.ts) | These assembly points need a bounded Page-contract correction. “Page Document” in [document formats](src/features/document-formats/model.ts) is a format/template and is not evidence that a `page-block` exists. |
| Cell editor | [TextBlock view](src/rendering/standoff-editor-view.tsx), [text ranges](src/runtime/text-ranges.ts), [codecs](src/block-tree/codecs.ts) | Keep the exact implementation type `standoff-editor-block`. Emit inclusive code-point Cell ranges; do not use UTF-16 parser offsets as native ranges. |
| Modes | [registry](src/block-tree/block-mode-registry.ts), [editing guards](src/block-tree/mode-editing.ts) | Modes describe roles, not renderers. Rich Mode-bearing continuations and all Mode-bearing joins remain restricted; see §12. |
| Independent partial property indexes | [Block definitions](src/properties/block-property-definitions.ts), [Standoff definitions](src/properties/standoff-property-definitions.ts) | Register newly declared TEI types only. Historical types continue working without index membership. Registration does not provide validation, rendering or execution automatically. |
| Overlapping and shared annotations | [linked definitions](src/block-tree/linked-annotations.ts), [linked runtime](src/runtime/linked-annotations.ts), [annotation monitor](src/rendering/annotation-monitor.tsx) | One segment is local to one TextBlock. Multiple segments may share a Document-owned definition. The monitor already edits value, metadata and attributes, including resolved shared definitions. |
| Local Entities | [Gloss model](src/features/gloss/model.ts), [controller](src/features/gloss/controller.ts), [local inventory](src/features/gloss/session-index.ts) | A genuine source definition can become a Document-owned `mutable/gloss` Entity. This is not a canonical SQLite Entity ID or an automatic mapping to one. |
| Canonical knowledge | [Entity service](src/application/entity-service.ts), [semantic services](src/knowledge-sqlite/semantics.mjs) | Do not write SQL Entities, Claims or Relationships during M1 import. Their endpoint and service contracts are stronger than “the source mentions a target.” Preserve source assertions as native annotations/records instead. |
| Alternatives | [text tabs](src/runtime/text-tabs.ts), [superposition](src/runtime/text-superposition.ts), [configuration](src/configuration.ts) | Structural tabs work today. Superposition requires a nonempty range in one TextBlock, rejects overlaps and defaults off. It is not a general inline XML container. |
| Point annotations | [range transforms](src/interchange/ranges.ts), [split commands](src/block-tree/commands.ts), [saved projection](src/knowledge-sqlite/saved-projection.ts) | Equal endpoints are used in some zero-width paths; saved projection requires `end = start - 1`. Do not emit unqualified zero-width TEI properties. Use the explicit contextual fallback in §9. |
| Import lifecycle | [runtime interchange](src/runtime/document-interchange.ts), [worker](src/runtime/interchange-worker.ts), [status UI](src/rendering/interchange-status.tsx) | Reuse cancellation/stale-task checks, candidate tracking, document opening and manual saving. TEI recovery warnings must bypass the existing loss-confirmation gate. |
| External materialisation | [materialiser](src/interchange/materialize.ts) | Its allowlists can make new TEI annotations opaque. Compile internally to validated native data, outside that external/clipboard route. Do not expand clipboard admission. |
| XML parser dependency | [academic XML helper](src/academic/xml.ts), [package](package.json), installed `saxes` 6.0.0 README, “Error Handling” | Reuse `saxes`; do not reuse the strict academic helper unchanged. The parser explicitly warns that post-error events cannot be trusted. Recovery must not merely swallow its errors. |

## 3. Fixed native Page Root Contract

Every newly converted full document has this content hierarchy:

```text
workspace object bank
└─ canonical resource registration → document-block D
   └─ page-block P                       exactly one in the converted resource
      ├─ imported header/metadata Blocks, when present
      └─ imported text/front/body/back and all other content Blocks
```

The workspace/window occurrence that opens D is not another imported resource or page. Document-owned annotation definitions live in `D.payload.linkedAnnotations`; they are data, not sibling Blocks outside P. Every imported Block, including alternative readings, recovered prose and rich note bodies, is structurally below P. No source `pb`, page count, length threshold or input classification creates another Page. Empty but intelligible TEI still produces P with an empty editable TextBlock.

Enforce this in two existing full-document assembly paths as well as the new TEI assembler:

1. Change `documentFragment` to wrap its content roots in one native Page before wrapping the Document. This covers existing file conversions and the collection path that calls it: [collection content](src/interchange/collection/content.ts).
2. Change full-document `importMarkdown` in `src/persistence/markdown.ts` similarly. Its exporter currently treats unrecognised containers as a labelled fallback, so recognise `page-block` as a transparent structural wrapper there; otherwise the new invariant would add spurious Markdown content. Keep metadata-loss diagnostics where relevant.
3. TEI native assembly directly emits D → P. Assert exactly one Page across the owned imported tree before admission and after native reload.

These are converter assembly corrections, not migration of existing documents, native opens, document templates or clipboard fragments. Collection imports create one Page **per resulting Document**, not one Page for an entire collection. Do not double-wrap content already assembled as a full document: full-document assembly is called once, at the boundary. Fragment APIs do not call it. Existing native files retain their authored page arrangements.

The inspected renderer and codec support this hierarchy without a new page abstraction. Admission, marginalia and layout still require the tests below; source inspection alone does not certify the integrated result.

## 4. Deterministic pipeline

### 4.1 Entry and execution

Add an import-only `tei` format labelled “TEI P5 XML” in [formats](src/interchange/formats.ts). Auto-select it for `.tei`; select it explicitly for generic `.xml`, whose extension does not prove TEI rather than OCR/code/data. The TEI file picker must allow both extensions when TEI is explicitly selected. Do not redirect other XML consumers or infer document genre. Reject attempts to invoke an unavailable TEI insert/export operation as an application configuration/operation issue, not a defective source document.

Introduce `teiImport`, default **true**, in `src/configuration.ts`. It gates new TEI import commands and registration activation. Turning it off must not make saved TEI-derived Ink unreadable or erase its unknown Modes/annotations. Existing `textSuperposition: false` and other feature defaults remain unchanged. Native document import retains its existing native-persistence prerequisite.

Use one bounded worker request through [operations](src/interchange/operations.ts), [worker entry](src/interchange/operations.worker.ts) and `src/runtime/interchange-worker.ts`. Return a native candidate result with diagnostics through a narrowly discriminated TEI request/result, rather than changing every external adapter to a new framework. No DOM, renderer, network, Entity service or live repository is required by the converter.

### 4.2 Conversion stages

1. **Decode and bound input.** Accept UTF-8 and BOM-marked UTF-16 using established decoding facilities. An unsupported declared encoding gets a specific diagnostic/failure; do not silently interpret it as UTF-8. Local replacement characters can be retained with warnings when the remaining text is useful. Do not globally strip meaningful whitespace. Existing strict external-text decoding in [file input](src/interchange/file-input.ts) must not reject TEI before its recovery adapter runs; isolate that adjustment to the TEI branch.
2. **Parse with namespace awareness.** Match the TEI namespace `http://www.tei-c.org/ns/1.0`; allow unnamespaced TEI names with one warning. Other namespaces use generic recovery, even if their local names resemble TEI. Preserve expanded attribute names where needed to avoid collisions. Treat well-formed but schema-invalid nesting as translation input, not parse failure.
3. **Walk once in source order.** A compact table chooses container, text, inline semantic, editorial, alternative or metadata handlers. Mixed-content accumulation produces text and native spans together. Unknown wrappers recurse; they never swallow supported descendants. No intermediate universal semantic graph is required.
4. **Allocate native identities and record targets.** Give actual emitted Blocks, properties and real source definitions native IDs. Maintain a conversion-local multimap from source `xml:id` to actual emitted target descriptors. Preserve duplicate IDs as ambiguity, not last-write-wins. XML IDs are source values, not guaranteed unique native keys.
5. **Resolve reference tokens after the walk.** Resolve backward and forward local tokens against that multimap. Record unresolved and ambiguous tokens without dropping annotations. External targets remain unresolved unless an explicitly supplied, already verified mapping exists; M1's normal offline path supplies none.
6. **Assemble and validate a detached native candidate.** Emit the fixed Page hierarchy, Document-owned definitions and Cell ranges. Use existing codecs, repository validation and native capture. Validate the emitted TEI data explicitly; index registration alone does not do so. If one source construct cannot form a valid rich native representation, lower that construct to valid editable native content, keeping valid siblings. Do not disguise converter bugs or namespace conflicts as source warnings.
7. **Admit once, then open.** Capture/native-encode the candidate and use native admission to the workspace object bank. Preserve the task/cavern/revision checks around asynchronous work. Track the resource as an unsaved candidate and open it through the existing host, as `importNew` does today. No writes to the source file; no background save, sidecar, index fetch or canonical semantic write.

A fragment result consists of native root DTOs, the Document-owned definitions those DTOs require, and diagnostics. It contains neither `document-block` nor `page-block`. The caller must explicitly adopt its definitions before inserting it; M1 tests this result headlessly and does not expose an unqualified interactive fragment insertion action.

### 4.3 Stable behaviour and resource bounds

Native IDs may be fresh per import. Compare semantic determinism after alpha-renaming IDs and removing incidental session fields. Structure, text, branch order, source tokens, states and diagnostic counts must match. No timestamps decide semantics; no runtime AI, locale-dependent sorting or fuzzy name matching.

Proposed initial bounds: 8 MiB decoded source input, depth 64, 100,000 XML elements, 200,000 emitted text Cells, 10,000 native Blocks, 50,000 properties/reference tokens combined, 100 diagnostic examples total. Use the existing task cancellation and worker timeout; check budgets during traversal, not after a huge tree has been allocated. Keep alternatives linear in source size: never form a Cartesian product of readings. These are explicit implementation constants with tests, not schema constraints.

Oversize input can fail cleanly before admission. An output/depth budget reached after useful content may return a valid bounded prefix with an explicit omission warning and visible omission notice; never claim complete import. If even the fallback cannot fit, fail without mutation. Limit diagnostics and text retained in diagnostics so warning construction cannot exceed the content budget.

## 5. Declarations, ownership and native fields

Create pure declarations in proposed `src/interchange/tei/definitions.ts`; activate them with the existing feature lifecycle in proposed `src/features/tei-import/index.ts` and [application feature assembly](src/application/features.ts). Reuse `FeatureScope` ownership/disposal in [features runtime](src/runtime/features.ts); no new registry framework. Headless conversion imports declarations directly, without activating UI features.

| Category | New declarations / use |
| --- | --- |
| Container Modes | `tei/header`, `tei/text`, `tei/front`, `tei/body`, `tei/back`, `tei/section`, `tei/verse-group`, `tei/dramatic-speech`, `tei/opener`, `tei/closer`, `tei/correspondence`, `tei/correspAction`, `tei/alternatives`, `tei/generic`. Restrict `appliesTo` to `container-block`. |
| Text Modes | `tei/heading`, `tei/verse-line`, `tei/speaker`, `tei/stage-direction`, `tei/dateline`, `tei/salutation`, `tei/signature`, `tei/postscript`. Restrict `appliesTo` to `standoff-editor-block`. Plain paragraphs need no Mode. |
| Standoff definitions | `tei/semantic`, `tei/editorial`, `tei/milestone`, `tei/correspondence`, `tei/correspAction`. The last two describe shared semantic records using the existing linked-definition representation. No visual effect is registered. |
| Block Property definition | `tei/semantic`, for meaningful whole-container roles/attributes that do not have a text range. Same spelling across separate categories does not unify their registries. Use only when needed; do not duplicate each Mode as a property. |
| Existing generic properties | Reuse `style/italics`, `style/bold`, `block/alignment`, and qualified existing heading sizing. Do not register them a second time or create TEI aliases. Preserve Block Property order and multiplicity. |
| Source-defined local Entity | Existing `mutable/gloss`, `value: "entity: …"`, with existing `metadata.gloss` identity/links; additional small `metadata.tei` object has `type: "tei/entity"`, kind and source identifier. `tei/entity` is a record discriminator, not a new universal registry entry. |
| Reference record | Ordinary annotation/property metadata containing records with `type: "tei/reference"`. No new reference registry, endpoint service or persistence type. |

All authored TEI Modes and type discriminators must come from this finite declaration module. A development test checks the `tei/` prefix recursively in declared TEI vocabulary; generic implementation identifiers and source values are explicitly exempt. Conflicting ownership, invalid declarations and missing expected definitions are developer errors. They must not produce “your TEI is invalid.”

Use `metadata.role` for inline distinctions, a small `metadata.fields` object for meaningful values, and ordered `metadata.references` records for pointers. Preserve source `xml:id` as an ordinary field where applicable, separate from native `id`. Do not store every XML wrapper or attribute merely to reproduce syntax. Unknown attributes are not executed; retain useful scalar information on a native semantic record where its context is clear, and diagnose omissions proportionately.

A single authored Mode, repeated Block Properties and overlapping Standoff Properties remain distinct mechanisms. Definition indexes remain **partial indexes for declared types**, not admission gates for historical content. Existing style precedence is unchanged.

## 6. Compact M1 mapping

This is the implementation table, not a replacement for the full catalogue. Container rows retain ordered children and loose text; an inline row encountering Block-bearing children emits valid per-TextBlock segments sharing a definition when continuity matters. No cross-TextBlock integer range is emitted.

| Source | Native result and retained meaning |
| --- | --- |
| `TEI` | One canonical Document and one Page; its readable content is under Page. Source ID is metadata, not the Document's generated identity. |
| `teiHeader` | `container-block`, `tei/header`; meaningful header prose stays editable. Use targeted handlers for the letter metadata below; all other header children use the same native fallback rules. |
| `text`, `front`, `body`, `back` | Containers with corresponding `tei/*` Modes; preserve ordering, including unexpected extra occurrences. |
| `div` | Container, `tei/section`; retain meaningful `type`, `subtype`, `n` and source ID where present. Do not infer a missing section hierarchy. |
| `head` | TextBlock, `tei/heading`; deterministic native heading sizing bounded to existing supported sizes by section depth. Meaning does not depend on styling. |
| `p` | Ordinary TextBlock for text/inline runs; if compound content interrupts it, an ordinary grouping container owns the runs and compound children in order. |
| `lg`, `l` | `tei/verse-group` container and `tei/verse-line` TextBlocks. Do not manufacture metre or line numbers. |
| `sp`, `speaker`, `stage` | `tei/dramatic-speech` container; speaker/stage TextBlocks with corresponding Modes. Retain `who` tokens independently of speaker labels. |
| `opener`, `closer` | Corresponding containers with ordered editable children. |
| `dateline`, `salute`, `signed`, `postscript` | TextBlocks with `tei/dateline`, `tei/salutation`, `tei/signature`, `tei/postscript`. Compound cases use a container plus semantic text runs; signature does not establish authorship. |
| `hi` | Exact supported `rend` tokens produce existing formatting; otherwise preserve a semantic highlight span and meaningful rendition fields. No execution of arbitrary CSS or `rendition` URIs. |
| `emph` | Semantic emphasis span plus existing italic presentation. |
| `foreign` | `tei/semantic`, role `foreign`; retain declared/inherited language without language inference. |
| `name`, `persName`, `placeName`, `orgName` | Semantic name/person/place/organisation spans, source fields and ordered reference states. Add a linked local Entity segment only when a genuine compatible definition resolves. Missing targets retain the semantic span. |
| `date` | Semantic date span with lexical text and original `when`, `from`, `to`, `notBefore`, `notAfter`, calendar/type qualifiers as supplied. No unsupported calendar normalisation. Role comes only from explicit type or qualified containing action. |
| `title` | Semantic title span; in `titleStmt`, also an editable header field used to initialise the Document display title. Body work titles are not Document titles. |
| `add`, `del`, `unclear`, `supplied` | `tei/editorial` with explicit role and supplied reason/certainty/responsibility. Keep text and overlaps. `del` never sets `isDeleted`, removes Cells or invokes a deletion command. |
| `choice`, `orig`, `reg`, `sic`, `corr` | Alternative group and native tabs as §8; every branch remains editable, in source order. Standalone branch elements become editorial spans. |
| `abbr`, `expan`; basic `app`, `lem`, `rdg` | Same bounded branch handling; labels/role and witness references remain distinct. Empty/missing readings do not erase other readings. No collation engine. |
| `pb`, `lb`, `anchor` | Milestone policy in §9. Never another native Page. |
| `xml:id`; `ref`, `target`, `corresp`, `who`, `ana`, `wit` | Original identifiers and ordered token lists; late local resolution with explicit ambiguity. Attributes do not automatically become canonical edges. Apply this collector to generic fallback as well as specialised rows. |
| `titleStmt`, `author`, `correspDesc`, `correspAction` | Small additional metadata handlers needed for the representative letter; editable fields plus shared correspondence/action records in §10. |
| Explicit `listPerson/person`, `listOrg/org`, `listPlace/place` definitions | Small definition collector for genuinely declared local Entities; retain rich description as editable content. Duplicate source IDs remain distinct definitions and ambiguous targets. These helpers do not imply support for every personography schema. |
| Any other element | Recurse in order. Use generic inline semantic ranges for inline content, or an ordinary `tei/generic` container for Block-bearing content. Keep useful fields and supported descendants. Empty meaningful unsupported assertions may be unanchored records/context notes; do not fabricate a range over nonexistent text. |

Whitespace policy: normalize XML line endings, preserve text-node characters and `xml:space="preserve"`; discard indentation-only nodes between structural children only outside preserve scope. Do not trim individual mixed-content nodes, insert separators between adjacent inline spans, or Unicode-normalise text. Formatting indentation around block structure is not a paragraph. Measure native ranges after all intentional text transformations. Combining marks and astral characters need dedicated tests.

## 7. Recovery and references

### 7.1 R0–R4 applied, not a second engine

Prefer full native translation, then partial semantics, generic native representation, readable recovery with supported descendants, and finally local omission. Unknown elements and unexpected well-formed nesting remain traversable. Unsupported scholarly semantics lower locally; they do not flatten an otherwise rich document or suppress recognised descendants.

Use a bounded `saxes` adapter with no external resource access, DTD fetching or user-defined entity expansion. A DOCTYPE is not itself a reason to reject useful text: ignore its declarations with one warning. Built-in/numeric XML entities work normally. An undeclared entity is preserved literally in the affected recovery text, not replaced with invented meaning.

For genuinely malformed XML, stop trusting parser events at the first error. Maintain committed, complete emission units and the source offset at the start of the current uncommitted unit. Discard that unit's speculative annotations/structures, retain earlier committed native content, and emit the uncommitted source suffix as **literal, editable recovery text**, with a clear recovery notice. Retain open container context only where established before the error. Test checkpoint offsets against the parser's public positions; never drop or duplicate text at the hand-off. If the fault occurs before any safe unit, this can be the whole readable input as recovery text.

This is intentionally a lower-bound M1 recovery: syntax may remain visible in the recovered suffix, and semantic interpretation after the first malformed region is not promised. It is not a hidden XML archive, a normal well-formed import policy, or a claim that `saxes` repaired the document. A recovery buffer is transient. No general reparsing/repair search is authorised. Schema-invalid **well-formed** input still gets full descendant traversal throughout; it does not take this suffix fallback.

Fatal outcomes are limited to unreadable/unsupported encoding without useful recovery, explicit resource limits without a valid useful candidate, cancellation, host admission failure, or converter defects. All leave existing documents unchanged. A converter invariant failure is reported distinctly from an ordinary recovery warning.

### 7.2 Reference representation and resolution

For an attribute such as `wit="#w2 #missing #w2"`, preserve its original scalar and ordered tokens, including duplicates. Example metadata record:

```json
{
  "type": "tei/reference",
  "attribute": "ref",
  "raw": "#person123",
  "tokens": [
    { "raw": "#person123", "scope": "local", "state": "unresolved" }
  ]
}
```

A resolved token adds a descriptor of a **real** emitted target, e.g. `{ "kind": "definition", "id": "entity-alice" }` or `{ "kind": "block", "id": "section-1" }`; an inline target may name an actual native annotation rather than pretending to be a whole Block. An ambiguous token retains candidate descriptors in source order with `state: "ambiguous"`, and no chosen endpoint. These are small metadata records, not native relationship edges.

Keep local fragments, relative external URIs and absolute URIs distinguishable. Retain `xml:base` context where useful; computed effective URIs are additional fields and never replace raw tokens. When an external base changes the effective target of a lexical `#x`, retain its fragment spelling but mark its effective scope external; do not resolve it against the document's ID table. If the effective document identity is unknown, retain that uncertainty rather than guessing. Do not dereference targets, execute links, infer identity from a label, or rewrite an external URI ending in `#x` into a local `#x`.

The source-ID multimap exists only during conversion. Retained native source identifiers and reference fields allow later explicit resolution without the original file. Updating a reference annotation's metadata through the existing annotation command/monitor is already possible; automated reconciliation or canonical binding is follow-up work. A stored resolution is an import-time observation, not a live referential-integrity guarantee after arbitrary user edits.

Never put an unresolved identifier in `annotationId`, `codex/entity-reference.value`, a canonical Relationship endpoint, or a native ownership edge. Native capture requires actual linked definitions. `annotationId` is used only for definitions actually emitted in the owning Document. No placeholders, fabricated canonical GUIDs or missing-definition admission exceptions are required.

Aggregate unresolved/ambiguous diagnostics by attribute and issue, retaining bounded examples. Missing references never suppress text, semantic annotations, branches, dates or surrounding structure.

## 8. Alternatives and editorial content

M1 uses the existing structural tab representation:

```text
container-block mode=tei/alternatives
└─ tab-row-block
   ├─ tab-block metadata={name:"orig", active:true}
   │  └─ editable native branch content
   └─ tab-block metadata={name:"reg", active:false}
      └─ editable native branch content
```

The first source branch is initially active. This is a deterministic UI selection, not an assertion that it is the preferred or authoritative reading. Repeated branch names receive source-order suffixes for tab labels; semantic roles remain unchanged. Preserve IDs, editorial qualifiers and witness tokens on the appropriate branch's native data. An empty branch retains an empty editable TextBlock and its branch identity.

For alternatives embedded in a paragraph, split its **native content structure** into prefix TextBlock, alternative group and suffix TextBlock under one grouping container. Preserve prefix/suffix once and all branch contents; do not generate every whole-paragraph reading. This changes inline presentation and can divide spans into linked segments. Emit one aggregated “inline alternatives displayed as grouped tabs” diagnostic. Nested alternatives recurse structurally without multiplying combinations. Apparatus `lem`/`rdg` labels remain distinct; absent lemmas, missing witnesses and multiple lemmas are data, not rejection conditions.

The existing “text tabs” command wraps/copies Blocks; it does not make arbitrary inline atoms. Experimental `text/superposition` is a closer fit only for a nonempty single-host range with compatible, nonoverlapping alternatives. It introduces owned relation content and projected-reading/edit behaviour that needs separate qualification. M1 **does not emit it**, switch its flag on, or claim inline fidelity. Structural tabs are the bounded supported reuse; broader inline alternatives remain a precise follow-up limitation.

Editorial annotations are independent of alternative selection. Supplied text and source deletions remain real readable Cells. M1 adds no special visual-effect engine; existing italic/bold properties may coexist, and the annotation monitor exposes nonvisual semantics. Overlapping editorial/name/date spans are retained as independent records, not resolved by precedence or destructive simplification.

## 9. Positional markers without unqualified points

Do not claim end-to-end zero-width support until editing, split/join, clipping, reload and saved indexing agree on the same convention. Fixing that general inconsistency is outside this milestone. In particular, `start=end` without `isZeroWidth` is a one-Cell span, not a point.

Use the catalogue's contextual-location fallback as an explicit M1 policy:

| Construct | M1 output | Fidelity limit |
| --- | --- | --- |
| Ordinary `lb` | Emit a logical newline Cell and a normal one-Cell `tei/milestone` annotation on that actual character, role `line-break`; preserve `n`, source ID and relevant fields. | It is an annotated character, not a zero-width point or a new Block. Qualify the current renderer's newline/caret behaviour in tests. |
| `lb break="no"` | Preserve surrounding text without adding whitespace; retain a contextual milestone record, including the explicit no-word-break assertion. | Exact character boundary is not represented as a live point. |
| `pb`, `anchor` | Retain `tei/milestone` definition with role, ID/number/reference fields and `precision: "block-context"`; attach a normal context segment to the containing nonempty TextBlock, or the adjacent preceding text if between Blocks. | The range denotes context, **not** the exact milestone extent or offset. No imported character is mislabelled as the point itself. |
| No nonempty contextual text, including an empty document | Emit a small, explicitly labelled editable marker note under Page, annotated with that milestone definition. | The label is an importer-generated description, not recovered source prose. |

Preserve multiple milestones in source order in their contextual annotation records. Do not retain stale numeric source offsets as if they were live anchors. Point precision is not promised after editing. Existing range rebasing applies to the context segment; deleting its entire context may leave an unanchored definition, which remains valid data. An `xml:id` on a milestone resolves to that real definition/context, explicitly marked approximate, not to a fabricated precise caret position.

For `pb`, preserve source page labels and `facs` references as metadata, with external/unresolved states; no network image request, facsimile fabrication or additional Page. Emit aggregated `milestone-context` diagnostics so this loss of precision is visible. Do not build a second anchoring system to conceal the limitation.

## 10. Representative correspondence qualification

### 10.1 Concrete synthetic contract fixture

This fixture is deliberately invented to distinguish roles. It accompanies, rather than replaces, the real letter fixture in §13.

```xml
<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="letter-7">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>A letter concerning the proofs</title>
        <author><persName>Clara Author</persName></author>
      </titleStmt>
      <publicationStmt><p>Unpublished transcription.</p></publicationStmt>
      <sourceDesc><p>A manuscript letter.</p></sourceDesc>
    </fileDesc>
    <profileDesc>
      <correspDesc xml:id="correspondence-7">
        <correspAction type="sent">
          <persName ref="#alice">Alice Sender</persName>
          <placeName ref="#london">London</placeName>
          <date when="1842-05-03">3 May 1842</date>
        </correspAction>
        <correspAction type="received">
          <persName ref="#bob">Bob Recipient</persName>
          <date when="1842-05-05">5 May 1842</date>
        </correspAction>
      </correspDesc>
      <particDesc><listPerson>
        <person xml:id="alice"><persName>Alice Sender</persName></person>
      </listPerson></particDesc>
    </profileDesc>
  </teiHeader>
  <text><body>
    <opener>
      <dateline>London, <date type="writing" when="1842-05-02">2 May 1842</date></dateline>
      <salute>Dear Editor,</salute>
    </opener>
    <p>Please review the <del>old</del><add>revised</add> proofs.</p>
    <closer><salute>Yours sincerely,</salute><signed>A. Sender</signed></closer>
  </body></text>
</TEI>
```

### 10.2 Native Block tree

`T` means an actual `standoff-editor-block`; all shown native IDs are explanatory aliases for independently allocated IDs.

```text
document-block D
└─ page-block P
   ├─ container-block H [tei/header]
   │  ├─ T title: "A letter concerning the proofs"
   │  ├─ T author: "Clara Author"
   │  ├─ T publication: "Unpublished transcription."
   │  ├─ T source: "A manuscript letter."
   │  ├─ container-block C [tei/correspondence]
   │  │  ├─ container-block S [tei/correspAction]
   │  │  │  ├─ T sender: "Alice Sender"
   │  │  │  ├─ T sent-place: "London"
   │  │  │  └─ T sent-date: "3 May 1842"
   │  │  └─ container-block R [tei/correspAction]
   │  │     ├─ T recipient: "Bob Recipient"
   │  │     └─ T received-date: "5 May 1842"
   │  └─ T alice-definition: "Alice Sender"
   └─ container-block [tei/text]
      └─ container-block [tei/body]
         ├─ container-block [tei/opener]
         │  ├─ T [tei/dateline]: "London, 2 May 1842"
         │  └─ T [tei/salutation]: "Dear Editor,"
         ├─ T: "Please review the oldrevised proofs."
         └─ container-block [tei/closer]
            ├─ T [tei/salutation]: "Yours sincerely,"
            └─ T [tei/signature]: "A. Sender"
```

The adjacent `oldrevised` intentionally reflects adjacent source nodes; do not invent a separating space or destructively substitute one reading. Both spans have their editorial roles. Generic metadata wrappers can be elided when they contribute no meaning; header prose and field order survive.

### 10.3 Native metadata and shared records

Use the existing Document-owned **object map**, not a new table or an array named `linkedAnnotations`. A shortened DTO illustrates the actual storage slots; omitted ordinary IDs/children must be supplied by the implementation:

```json
{
  "id": "D",
  "type": "document-block",
  "metadata": {
    "documentId": "D",
    "title": "A letter concerning the proofs",
    "tei": {
      "version": 1,
      "sourceId": "letter-7",
      "header": {
        "titleBlockIds": ["title"],
        "authorBlockIds": ["author"],
        "correspondenceAnnotationIds": ["corresp-7"]
      }
    }
  },
  "linkedAnnotations": {
    "entity-alice": {
      "id": "entity-alice", "type": "mutable/gloss", "value": "entity: Alice Sender",
      "metadata": {
        "gloss": { "version": 1, "localId": "local-alice", "links": {} },
        "tei": { "type": "tei/entity", "kind": "person", "sourceId": "alice" }
      }
    },
    "corresp-7": {
      "id": "corresp-7", "type": "tei/correspondence",
      "metadata": { "sourceId": "correspondence-7", "actions": ["action-sent", "action-received"] }
    },
    "action-sent": {
      "id": "action-sent", "type": "tei/correspAction",
      "metadata": {
        "role": "sent",
        "participantPropertyIds": ["sender-name"],
        "placePropertyIds": ["sent-place-name"],
        "datePropertyIds": ["sent-date-value"]
      }
    },
    "action-received": {
      "id": "action-received", "type": "tei/correspAction",
      "metadata": {
        "role": "received",
        "participantPropertyIds": ["recipient-name"],
        "datePropertyIds": ["received-date-value"]
      }
    }
  }
}
```

These references describe actual native annotations; they are not foreign keys to SQL. Keep text and raw reference/date facts on the field annotations, rather than copying them into each action record. For example, `sender-name` is a normal `tei/semantic` span over `Alice Sender`, role `person-name`, with an ordered `ref` record resolving `#alice` to `entity-alice`. A separate real linked segment may connect the same text to that Entity Gloss. A shared action segment with `annotationId: "action-sent"` covers each sending field; shared correspondence segments link the action fields to `corresp-7`. Existing linked annotation resolution supplies the definition to the monitor.

`recipient-name` retains `#bob` with `unresolved`; `sent-place-name` retains `#london` with `unresolved`. No Bob or London definition is fabricated. `sent-date-value` has lexical text, `when: "1842-05-03"` and role `sending-date`; `received-date-value` has `when: "1842-05-05"`, role `receiving-date`. The dateline date is `writing-date` because the source explicitly says `type="writing"`. An unqualified dateline date stays `dateline-date`, not an inferred writing date.

Clara's author role comes from `titleStmt/author`, not Alice's sending action or the signature. Bob's recipient role does not make the salutation's “Editor” a resolved addressee. Publication and digitisation dates are absent here and remain absent. When explicitly present elsewhere, retain them as separately scoped dates; an edition publication date is not the letter's writing date, and a revision date is not automatically digitisation.

For missing or empty action fields, keep the action record without inventing participants/dates. If a completely empty meaningful action needs an inspectable surface, use a clearly generated editable label such as “Sending action — participant not recorded,” with a segment to the real action definition. This describes missing information rather than filling it in.

### 10.4 Inspection, editing and authority

| Information | Existing editing surface / limitation |
| --- | --- |
| Header title, author and letter body | Ordinary Cell editing of their TextBlocks. Document display title is initialised once and may subsequently be renamed independently through the normal document UI; no permanent title synchronization is promised. |
| Name/date/editorial roles, raw references and resolution states | Existing annotation monitor's value/metadata fields. Select the corresponding native span. No bespoke correspondence form is needed. |
| Sending/receiving action and correspondence records | Select their linked segments on header fields, then inspect/edit shared metadata through the same monitor. Lists of actual native property IDs are technical but valid M1 metadata, not a polished relationship browser. |
| Real source-defined Alice Entity | Existing Gloss facilities expose the local `entity:` definition. It is not automatically a member of canonical SQLite Entities. |
| Date lexical text versus `when` | Cell text is the current human-readable wording; imported structured fields are explicitly retained assertions. Editing text does not silently rewrite `when`. Editing the assertion uses the monitor. No automatic date parser is installed. |
| Header pointers and whole-container metadata | Retained native data; there is no verified generic end-user editor for every Block payload field. Essential correspondence facts are therefore on inspectable text annotations/shared definitions, not hidden only in container metadata. |

After arbitrary deletion, native metadata pointers may become stale. They are non-executing retained relationships, not permanent source bindings. Consumers must resolve actual IDs when opened and display missing targets rather than assert validity. M1 does not install document-wide watchers to keep all imported facts synchronized with every keystroke.

The genuine UI gap is friendly structured navigation/editing for arbitrary semantic records. M1 avoids requiring that extension by using the existing annotation monitor. A later focused UI could improve these records without changing their native storage. Verify the existing monitor works for the new nonvisual definitions; if its discovery menu filters them out, add only their annotation contribution/label integration, not a new inspector.

## 11. Diagnostics and user-facing import

Expose “Imported successfully with warnings” after admission, with counts for partial translation, generic fallback, unresolved/ambiguous references, local recovery and omitted content. Successful native translation contributes summary counts, not hundreds of notices. Group repeated warnings by code/element or attribute, keep bounded examples with source location where trustworthy, and offer details in the existing interchange status surface.

The current `confirm(diagnostics)` loss gate in `src/runtime/document-interchange.ts` must not make normal TEI recovery conditional on accepting an intimidating modal. TEI reports nonfatal details after success. Cancellation before admission remains available. Fatal failures use a separate status and do not open an empty replacement document. Configuration/namespace errors identify a converter defect.

Add only the status detail affordance needed for aggregated TEI diagnostics in `src/rendering/interchange-status.tsx`. No generic diagnostics framework is required. Suggested filename strips `.tei`/`.xml` for this format and uses the native save workflow. The original TEI is never overwritten by Command-S; the imported resource is an unsaved native candidate until the user chooses its native filename.

## 12. Editing compatibility and bounded work

The importer must preserve current Mode guards. A plain `tei/verse-line` with no intrinsic metadata/unsupported Block Properties can use the existing qualified continuation path. A Mode-bearing Block with source IDs or other nonempty metadata, or a heading with font-size properties, may refuse Enter/split with the current explanation. All Mode-bearing joins, including identical Modes, refuse today. Do not strip meaningful source IDs merely to bypass these safeguards or silently convert a verse line to a plain paragraph.

Ordinary character edits, range annotations, selection, IME and Undo/Redo must still work in these genuine TextBlocks. Cross-Block edits that consume protected identities retain existing refusal semantics. Native tab branch editing is existing Block editing, not editing a projected XML tree.

No importer work remains subscribed to typing. Parse, resolve, aggregate diagnostics and validate the detached import once. Later text edits must not rerun conversion, scan source IDs/document definitions, serialize the Document, refresh unrelated Explorer rows, contact services or redo import validation. Reuse existing native dirty tracking and annotation range rebasing. Import-time full candidate validation is appropriate; a full-document validation on every later keystroke is not.

Tests must count importer/validation/capture/network calls across ordinary text edits and provisional input, and check unrelated records remain untouched. If integration changes actual typing performance, run the real Flint browser typing benchmark before/after; do not substitute headless frame time as evidence. No new highlight/geometry renderer is needed.

## 13. Acceptance and fixtures

### 13.1 Concrete fixtures

Commit fixtures during implementation under proposed `src/interchange/tei/fixtures/`, with an attribution README, retrieval URL/date, checksum and licence. Runtime tests use local files and require no network. This brief does not add fixture files.

1. **Real correspondence:** [WeGA letter A040080, XML](https://weber-gesamtausgabe.de/A040080.xml). The retrieved XML inspected for this brief is 7,861 bytes, SHA-256 `068ada0a40d47e0f2fd9a97ff10b383b2b78d6e4cd42f9df6ad205573e6f75a6`; it has two `correspAction` elements, an opener, a closer, one choice and three line breaks. Verify and retain its actual licence statement when vendoring. WeGA documents its XML delivery in its [API documentation](https://weber-gesamtausgabe.de/de/Hilfe/API_Dokumentation.html). Use the complete small letter, not only an extracted synthetic sentence.
2. **Real pagination and editorial content:** [WeGA letter A041209, XML](https://weber-gesamtausgabe.de/A041209.xml). The retrieved XML is 28,829 bytes, SHA-256 `3c67fb0495f3bbb5ba47e6612a2507c605b2a7ff026a0a1a438e022959eb193e`; it contains two correspondence actions, an opener and closer, two page breaks, two line breaks and three deletions. Pin the complete letter with its actual attribution/licence. Together these two verified sources are the mandatory real-world fixtures.
3. **Additional long-form candidate:** [DTA, Goethe, *Die Leiden des jungen Werthers*, vol. 1, 1774](https://www.deutschestextarchiv.de/book/show/goethe_werther01_1774), using its [TEI P5 download](https://www.deutschestextarchiv.de/book/download_xml/goethe_werther01_1774). The primary edition page identifies TEI P5 and CC BY-SA 4.0 for the text. This session's attempted XML download did not yield parseable XML, so no checksum or inspected-content claim is made. Obtain and verify the actual XML before adding this fixture; do not vendor an HTML response as XML. If acquired, use the whole work for bounded conversion and an attributed excerpt for a fast rendered test. The two verified letters do not depend on this download becoming available.
4. **Synthetic contract fixtures:** the letter in §10; verse and drama; overlapping editorial/name spans; empty and nested alternatives; significant whitespace/astral characters; unknown wrappers; deliberately broken references; mutated XML; generated longer documents for explicit budget tests. Mutations of real fixtures retain provenance and record the exact defect introduced.

### 13.2 Required acceptance matrix

| ID | Input / operation | Required evidence |
| --- | --- | --- |
| A01 | Supported structure, verse, drama and letter fixtures | Correct native implementation types/Modes, child order, text and semantic fields. No per-element Block subclass. |
| A02 | Both pinned WeGA sources, plus DTA if acquired | Complete bounded conversion succeeds; expected representative structures/fields survive. Record actual diagnostics and explicitly reviewed losses. Open and edit both real letters in the existing UI; include the DTA excerpt if acquired. |
| A03 | Schema-invalid but well-formed nesting, missing optional fields | Import succeeds; recognised descendants and readable text survive in valid native placements. No schema fetch/validation gate. |
| A04 | Unknown parent around `p` and `persName`; foreign-namespace names; unknown attributes | Supported descendants remain native semantics. Foreign namespace is not silently TEI. Unknown wrappers/fields give bounded fallback diagnostics. |
| A05 | `persName ref="#missing"`, missing external URI, all supported reference attributes | Text and annotation remain, exact raw tokens/locality retained, state unresolved, zero network/SQL creation calls. No fake `annotationId` or relationship endpoint. |
| A06 | Forward reference, duplicate `xml:id`, repeated ordered targets, `xml:base` | Forward resolution succeeds; duplicates yield ambiguity with no chosen candidate; duplicates/order and local/external distinction persist through reload. |
| A07 | Complete and incomplete correspondence | Author/sender/recipient/salutation/signature remain distinct; date kinds do not collapse. Missing fields stay missing. Linked definitions are Document-owned and monitor-editable. |
| A08 | `add`, `del`, `unclear`, `supplied` overlapping names/styles | All text remains; no deletion command/tombstone; inclusive code-point ranges and independent metadata survive native reload. |
| A09 | `choice`, orig/reg, sic/corr, abbr/expan, basic app/lem/rdg; nested/empty/missing-witness cases | Every reading remains editable in source order; exactly one initially active tab per row; no Cartesian expansion, discarded branch or enabled superposition flag. Inline layout degradation is reported. |
| A10 | `pb`, `lb`, `lb break="no"`, `anchor`, repeated markers and empty hosts | Exactly one native Page; ordinary line breaks use real newline Cells; no-break preserves joined text; contextual records explicitly report approximate precision. No unqualified zero-width property reaches saved projection. |
| A11 | Mismatched closing tag, broken attribute quote, undeclared entity, truncated tail after valid paragraphs | Valid committed prefix retains semantics; uncommitted suffix remains editable literal recovery, without loss/duplication. No reliance on post-error parser structure. Useful input imports with warning; unreadable input fails atomically. |
| A12 | Significant whitespace, `xml:space`, adjacent inline nodes, CRLF, combining marks and emoji | Exact declared text policy; no accidental trimming/invented spaces; native offsets count emitted Cells rather than UTF-16 units. |
| A13 | Save/reload and saved knowledge projection | Native capture, serialization, decode/admit and save-time projection accept the document, definitions, overlaps, reference metadata and milestone fallbacks. No TEI source dependency. |
| A14 | Namespace, feature lifecycle and flag off | Every new TEI type uses `tei/`; separate indexes/owners dispose correctly; no effects registered. Flag-off saved Ink still renders and edits with generic native facilities. Namespace bugs fail as developer errors. |
| A15 | Each full-document assembly path: TEI, HTML, Markdown, plain text, image, structured, academic and collection | Exactly one Page per new Document, all content below it, no source-pagination Pages. Existing native open is untouched. Fragment paths emit neither Document nor Page. Verify native Markdown export has no extra page-wrapper label. |
| A16 | Actual editor interaction | Open candidate; type and select in title/body/verse; edit annotation metadata; change tabs; Undo/Redo; manual save/reload; exercise allowed Mode continuation and expected split/join refusal without data loss. Test IME/provisional input on imported TextBlocks. |
| A17 | Marginalia | Add/edit an ordinary compatible native Gloss in imported content, verify page-context margin presentation and scrolling use existing geometry. The Page exists in rendered DOM, not just JSON. |
| A18 | Corrupt/oversize/deep input, cancellation, stale task and admission failure | Budgets are enforced during work; bounded diagnostic examples; no partial live mutation, source overwrite, background save or orphan candidate on rejected admission. |
| A19 | Same source twice; headless import | Equivalent semantic tree/ranges/reference states/diagnostics after ID normalisation; consistent internal IDs; no browser globals, wall-clock semantic decisions or network dependency. |
| A20 | Ordinary typing after import; rich recovery fixture | Converter/resolve/native-capture counts remain zero during typing, no unrelated scans or network. Local recovery preserves known rich semantics elsewhere rather than flattening the whole document. |

Add focused unit suites beside the proposed parser, converter and declarations; a native integration suite; and a rendered suite at proposed `src/rendering/tei-import.test.tsx`. Extend existing converter and persistence tests for the Page change. At implementation completion run the focused tests, existing affected regression suites, then `npm run typecheck`.

Suggested existing regression targets: `src/block-tree/block-modes.test.ts`, `src/block-tree/block-mode-registry.test.ts`, `src/runtime/type-definition-indexes.test.ts`, `src/runtime/linked-annotations.test.ts`, `src/persistence/native-resource.test.ts`, `src/qualification/native-b2/markdown.test.tsx`, `src/interchange/document-interchange.test.ts`, `src/interchange/collection/collection.test.ts`, `src/runtime/collection-interchange.test.ts`, `src/rendering/document-interchange.test.tsx`, `src/rendering/block-modes.test.tsx`, `src/rendering/text-tabs.test.tsx`, and relevant saved-projection/Gloss tests selected from the current repository. Use existing `npm test -- <paths>` scripts so required pretest preparation runs. Report actual commands, pass/fail counts, timing/budget evidence and any baseline failures; do not describe planned tests as passed.

## 14. Bounded implementation sequence and source changes

| Step | Files / integration points | Completion condition |
| --- | --- | --- |
| 1. Native skeleton and Page invariant | `src/interchange/document-import.ts`, `src/persistence/markdown.ts`; tests for collection/import/rendering; proposed `src/interchange/tei/native.ts` | One-Page full-document assembly validated through native admission and rendering; fragment/native-open behaviour unchanged. Markdown page export compatibility addressed. |
| 2. Pure declarations and parser | Proposed `src/interchange/tei/definitions.ts`, `parse.ts`, `model.ts`; existing `saxes` dependency | Headless namespace-valid declarations, bounded safe parsing, explicit malformed-suffix recovery and diagnostics. No changes to strict academic parser. |
| 3. Core conversion and references | Proposed `src/interchange/tei/convert.ts`, `references.ts`; compact mapping data in the same directory | Required structure/inline/editorial mapping, mixed content, local Entity definitions, late references and valid generic recovery. Avoid a file/framework per element. |
| 4. Letter, alternatives and milestones | Small handlers alongside the converter; correspondence fixture; existing tab/linked-definition representations | All §8–10 policies implemented and tested, with explicit precision/layout limitations. No superposition/point-engine rewrite. |
| 5. Import activation and presentation | `src/configuration.ts`, proposed `src/features/tei-import/index.ts`, `src/application/features.ts`, `src/interchange/formats.ts`, `file-input.ts`, `operations.ts`; `src/runtime/document-interchange.ts`, `src/rendering/interchange-status.tsx` | Default-on TEI full-document import; worker/cancellation integration; direct validated native candidate admission; unsaved native document opened; aggregated warnings without loss-confirmation modal. Reuse generic worker dispatch where sufficient. |
| 6. Qualification and report | New fixture/test files, existing affected suites, implementation report | A01–A20 evidence, typecheck, compatibility assessment, concrete limitations and manual editor smoke evidence. No acceptance claim based solely on a DTO snapshot. |

Use the existing `admitNative`/resource-registration path rather than inventing direct repository insertion. Candidate resource IDs can be allocated in the worker; collision/admission errors remain atomic. Reuse the native session's `trackCandidate` and host opening sequence in `importNew`. If ownership/focus handling requires a small application adapter, keep it at this integration boundary; do not change portable native persistence.

## 15. Genuine limitations and decision gates

There is no identified blocker to a useful M1 under these explicit fallbacks. The following are acceptance gates for the implementation, not assumptions that the features already work together:

- **Page composition:** the code supports direct Page children, but actual import admission, margin behaviour and converter regressions must pass before release. The existing “Page Document” factory is insufficient by itself.
- **Direct native emission:** required to keep new semantic properties native; routing through the external allowlist would violate this brief. It must retain cancellation, atomicity, ownership and manual-save behaviour.
- **Malformed recovery:** M1 preserves a trusted semantic prefix and literal suffix; it does not promise semantic recovery beyond the first syntax error. Broader repair needs a separate demonstrated requirement.
- **Exact point anchors:** not end-to-end qualified. Contextual records and real newline ranges are the explicit M1 result, with diagnostics. A later consistency fix must address editing and saved projection together.
- **Inline alternatives:** structural tabs retain all readings but may change paragraph flow. No general inline apparatus or automatic superposition activation.
- **Metadata UI:** existing annotation metadata editing is adequate for this milestone, subject to new-type discovery tests; arbitrary Block metadata has no verified general editing surface. Do not claim a dedicated correspondence/relationship browser exists.
- **Mode editing:** imported source identity/metadata can limit split/continuation, and joins remain refused. Do not broaden this milestone into an inheritance/editor-policy change.
- **Canonical resolution:** local Gloss definitions and metadata references do not imply SQLite Entity mappings. Later explicit binding can reuse retained raw identifiers; automated reconciliation is not delivered here.

The only required new facilities are the bounded TEI compiler/definitions, its application import adapter, and proportionate diagnostics presentation. The Page assembly corrections are small changes to existing converters. Semantic TextBlock specialisation, a general point-annotation correction, richer inline alternatives and friendly structured-record editing remain separately scoped follow-ups.

## 16. Evidence produced for this brief

Reviewed the current source paths cited above, the accepted catalogue, project conventions and the attached instructions. Retrieved and parsed two real WeGA letters to verify fixture suitability; the primary DTA edition identifies an additional candidate whose XML download remains unverified. Checked that the brief's local source links and named existing regression files exist, and that its JSON/XML examples parse. These checks qualify a plan, not an implemented importer.

No production code, configuration, tests, fixtures or persistence format was changed. No converter tests or typecheck are reported as executed for this documentation-only task. Implementation and end-to-end qualification await review of this brief.
