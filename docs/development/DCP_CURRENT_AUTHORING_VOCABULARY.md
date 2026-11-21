# Current DCP authoring vocabulary

9 November 2026. Evidence baseline: commit `df09151` (`Stage 3C.1 complete`), inspected with the default feature configuration. **Stage 3C.1 is accepted.** This inventory describes the agent-facing contract, not Mutable's complete native registry. The revised direction is conversational usefulness and a deliberately selected vocabulary; exhaustive native parity is a long-term architectural reference, not the immediate implementation queue.

The default projection has **21 composition kinds**, **17 authorable standoff identifiers**, separate semantic response arrays, and **4 read/discovery tools**. The capability summary has **37 descriptors: 33 authorable, 1 readable, 1 presentation-only and 2 unavailable**. Descriptors are not one-to-one with composition kinds: configuration, semantics and unavailable future routes also have descriptors.

All qualified functionality and existing defaults remain unchanged. Stage 3C.2 has **not started**; there is no partial implementation to discard. 3C.2–3C.5 are paused; 3D cloning and 3E acquisition/import are deferred. See [curation recommendations](DCP_VOCABULARY_CURATION_RECOMMENDATIONS.md) for advisory groupings and future configuration implications.

## Evidence and interpretation

The executable authorities are [provider schemas](../../src/features/dialectic/dcp/provider-schema.ts), [host preparation/admission](../../src/features/dialectic/dcp/exchange.ts), [standoff admission and legend](../../src/features/dialectic/dcp/markup.ts), [native standoff descriptors](../../src/rendering/standoff-styles.ts), [semantic preparation](../../src/features/dialectic/dcp/semantics.ts), [capability catalogue](../../src/features/dialectic/dcp/capabilities.ts), [source reading](../../src/features/dialectic/dcp/sources.ts), and [feature defaults](../../src/configuration.ts). The [canonical native audit](DCP_CANONICAL_VOCABULARY.md) supplies native-type context; its baseline DCP coverage predates the later authoring increments and must not override the current code.

A temporary, removed inspection harness instantiated the default native registrations, extracted the fully enabled provider projection, registered DCP semantics and evaluated the legend/catalogue. Its counts were cross-checked against host validators and shared native factories. It used no provider, user Document or resource acquisition. No runtime, prompt, schema, feature-default or registry changes accompany this review. Coverage checks account for every extracted kind, standoff identifier and catalogue ID; all local evidence links resolve. The existing catalogue, provider-schema and canonical-audit suites passed **51 tests** (`capabilities.test.ts`, `providers.test.ts`, `audit-dcp-vocabulary.test.ts`).

“Enabled by default” means the route's flags are on in the repository configuration. It does not promise a required resource, active Vault, renderer, provider credential or browser capability. Provider schema acceptance alone does not establish native permission: native validation, destination rules, budgets and source authority still apply.

## A. Composition constructs

### Common contract and feature prerequisites

Every composition declaration has `id` and `kind`. Generated Block aliases use `new:b1`, `new:b2`, etc.; the host supplies durable native identities. Every field listed below is required by the fully negotiated strict provider schema, including nullable configuration fields. Native preparation retains some older forms with omitted configuration; agents should follow the negotiated schema rather than rely on compatibility admission.

| Gate shorthand | Actual feature(s), all default **on** |
| --- | --- |
| Base | `dialectic`, `dialecticDcp`; registered native views and canonical contribution destination |
| N | Base + `dcpNativeAuthoringStage1` |
| T | N + `dcpNativeAuthoringStage2Text` |
| L | N + `dcpNativeAuthoringStage2Layouts` |
| C | N + `dcpNativeAuthoringStage2Compounds` |
| W | N + `dcpNativeAuthoringStage2Widgets` |
| M | N + `dcpNativeAuthoringStage3ManagedImages` + `managedAssetClipboard` |
| E | N + `dcpNativeAuthoringStage3ExternalMedia` |
| P | N + `dcpNativeAuthoringStage3RetainedPdf` + `crossResourceLoaders` |

Additional native flags named in the tables are also default **on**. Capabilities are enabled only with applicable native renderers. N gates the later stages; disabling T does not intrinsically disable L/C/W/M/E/P. The four Base composition forms remain when N is off.

### Text and structural composition

Parameters below omit the common `id`/`kind`. `Node[]` means child DCP composition, with host-generated owned structural descendants.

| DCP kind | Purpose and native result | Parameters and child composition | Gates / default / significant limits |
| --- | --- | --- | --- |
| `paragraph` | Ordinary prose, quotations and annotated explanations → `standoff-editor-block` | `markup`, `ranges`; with T, `textStyle`; with C, `margins`. No ordinary children; margins contain composition. | Base; **on**. Restricted XML annotation text, not arbitrary HTML/Markdown. Empty text is possible; a contribution still requires composition. |
| `heading` | Section heading → `standoff-editor-block` with `block/font/size` value `h1`–`h6` | Paragraph fields plus integer `level:1..6`. Marginal composition as above. | N; **on**. Not a separate native heading Block. `textStyle.size` must be null; `level` determines heading size. |
| `group` | Group related passages → `container-block` | `children:Node[]` | Base; **on**. 1–64 children; no card positioning, raw metadata or arbitrary container properties. |
| `list` | Bullets, numbering or tasks → `indented-list-block` → generated `container-block` per item | `style`, `items:Node[][]`; with L, `configuration`. Each item holds 1–32 Nodes and may contain nested lists. | Base bullet/ordered; L adds task/configuration; **on**. 1–64 items. Any authored checked state requires `taskLists`. No standalone list-item/checkbox declaration. |
| `table` | Tabular comparison → `table-block` → `table-row-block` → `table-cell-block` | `rows:Node[][][]`; with L, `configuration` for cell headers. Each cell holds composition. | Base; **on**. Rectangular, nonempty rows/cells; ≤64 rows, ≤16 columns, ≤32 Nodes per cell. No authored row/column spans or rendered widths. |
| `grid` | Arrange native content in rows/cells → `grid-block` → `grid-row-block` → `grid-cell-block` | `rows:Node[][][]`; no DCP `configuration` field | N; **on**. Same nonempty row/cell bounds as table. With L, unequal row lengths are supported; N-only mode requires rectangular rows. No free positioning, spans, column weights or width controls. |
| `code` | Literal code → `standoff-code-block` with generated `standoff-editor-block` child | `language`, literal `text`; no child declarations or inline markup | T + `standoffCodeHighlighting`; **on**. Nonblank language ≤64 characters, no controls. Native syntax highlighting for JS/TS/Markdown; other language labels retain literal code without that highlighting. Not the legacy `code-mirror-block` route. |
| `source` | Exact Markdown/HTML as an authored source object → `mutable/markdown-source-block` or `mutable/html-source-block` | `format:"markdown"/"html"`, literal `text`; no child declarations | T + `documentInterchange`; **on**. Native isolated preview and immutable authored source. This is not Surface-backed Markdown fallback, import, or permission to execute HTML. |

Shared factories: [text/heading/grid](../../src/block-tree/native-authoring.ts), [lists/layouts](../../src/block-tree/layout-authoring.ts), [code](../../src/block-tree/literal-authoring.ts), [source](../../src/interchange/source-block.ts).

### Persistent text/list/layout configuration

| Field | Exact supported values / behaviour | Native effect |
| --- | --- | --- |
| `textStyle` | Null, or `{alignment,indent,size}`, all keys present and individually nullable. Alignment: `left`, `center`, `right`, `justify`; indent: nonnegative safe integer; size: `normal`, `half`, `three-quarters`. Heading size must be null. | Shared `prepareTextAppearance`: `block/alignment`, `block/indent`, `block/font/size`. Applies only to newly authored paragraph/heading text. |
| `list.style` | `bullet`, `ordered`; L additionally enables `task`. | Shared `prepareList`; ordered list metadata and generated item containers. |
| `list.configuration` | Null, or `{start,reversed,items}`. `start`: null or safe integer; `reversed`: boolean; `items`: null or an array matching the item count, each `{value,checked}`. `value`: null or safe integer; `checked`: null or boolean. | Numbering uses `metadata.htmlList` and `metadata.htmlListItem`. Start/reversed/item value require ordered style. Default start is 1, or item count for reversed ordering. `checked` may appear on any list style; task style defaults to unchecked. No initial collapse setting. |
| `table.configuration` | Null, or `{headers:boolean[][]}` matching the exact table dimensions. | `metadata.htmlTableCell`, header flag; spans stay 1. Existing imported span/column metadata may be readable without being DCP-authorable or visually implemented. |
| `margins` | Null, or `{left:Node[],right:Node[]}`; each side 0–64 Nodes. Empty sides produce no margin. No recursively nested margins or page collections inside margins. | `left-margin-block`/`right-margin-block` in named owned `leftMargin`/`rightMargin` relations. Native text defaults supply side alignment and three-quarter size unless explicitly supplied. These are not ordinary children of the owner. |

A list checkbox's initial state is authored content. Submitted state is protected; draft controls remain interactive. No separate persisted task-event system exists.

### Compound Documents and widgets

| DCP kind | Purpose and native result | Parameters and child composition | Gates / default / significant limits |
| --- | --- | --- | --- |
| `surface` | Reversible native content → `surface-block` → two `side-block`s, with native structural containers | `front:Node[]`, `back:Node[]`; 1–64 Nodes per face | C + `reversibleBlocks`; **on**. Both faces must contain composition; an empty paragraph can represent an intentionally empty face. Reverse always has a container; multi-Node front gets one too. Flipping is local navigation. No fallback provenance is implied. |
| `tabs` | Labelled alternatives → `tab-row-block` → `tab-block`s | `orientation:"horizontal"/"vertical"`, `tabs:[{label,content:Node[]}]`; 1–16 panels, 1–64 Nodes per panel | C; vertical additionally requires `verticalTabs`; **on**. Trimmed, nonblank, one-line labels ≤256 characters. First panel initially active; navigation does not rewrite submitted content. |
| `pages` | Page collection within the contribution → `document-tab-row-block` → `document-tab-block` → `page-block` | `orientation`, `pages:[{label,content:Node[]}]`; same label/panel bounds as tabs | C (+ `verticalTabs` for vertical); **on**. Only at top-level composition depth. No new Document, book, window, session or workspace authority. |
| `sticky-note` | Inline native note → `sticky-note-block` with owned content | `content:Node[]` (1–64); `size:null` or `{width,height}` (finite numbers, minimum 200×160) | W; **on**. Native default 280×280, fixed yellow/paper appearance and scrolling. No arbitrary colour/material/position. Submitted resizing/content edits protected. |
| `timer` | Native countdown → `timer-block` | `durationSeconds`: integer 1–86,400; `size:null` or `{width,height}` (finite, each ≥110). No children. | W + `timer`; **on**. Null size 130×130; initial idle state. No initial runtime timestamps, position or running mode. Protected Start/Pause/Reset stay local and reset on remount; authored settings remain immutable. |
| `object3d` | Native coffee-cup illustration → `3d-object-block` | `configuration:null` or complete object described below. No children. | W + `threeDObjects`; **on**. Only the existing coffee-cup scene, not arbitrary meshes. WebGL 2 needed for graphics; native fallback remains. Protected orbit/presets/rotation are local. |
| `canvas-preview` | Native demonstration of movable sample boxes → `canvas-block` | No fields beyond `id`,`kind`; no authored children | W; **on**. A local preview, not an authored spatial canvas. Sample movement is not persisted. No box data, canvas counter or host session. |

`object3d.configuration` is `{scene,view,lighting,autoRotate,steam,coffeeStain,size}`. `scene` is exactly `coffee-cup`; `view` is `{azimuth:0..360,elevation:10..70}`; lighting is `neutral`, `warm` or `dramatic`; the three switches are booleans; size is a number 160–640. Null uses native defaults: azimuth 45°, elevation 25°, neutral lighting, auto-rotation off, steam on, coffee stain off, size 280. No raw scene settings/resource identifiers.

Shared factories: [compound structures](../../src/block-tree/compound-authoring.ts), [notes](../../src/block-tree/note-authoring.ts), [timer](../../src/features/timer/model.ts), [3D object](../../src/features/three-d-object/model.ts).

### Media composition kinds

| DCP kind | Purpose and native result | Parameters / children | Gates / default / significant limits |
| --- | --- | --- | --- |
| `youtube` | Existing external YouTube video → `youtube-video-block` with `metadata.url` | `url`: supported URL or 11-character video ID; no children | N; **on**. ≤4,096 characters, native YouTube validation; no credentials/nonstandard ports. No acquisition or availability claim. Separate compatible route from `video`. |
| `external-image` | New conversational image URL → `image-block` | `url`, `alt` (≤1,024 characters); no children | E; **on**. No source Block needed. Browser loads URL; no managed original, perception or verified provenance. |
| `video` | YouTube/Vimeo reference → `mutable/video-block` | `url`; no children | E + `documentInterchange`; **on**. Supported provider URLs only; no generic video-file player. Native local playback lifecycle; no acquisition. |
| `embed` | Website alongside commentary → `iframe-block` | `url`; no children | E + `resourceUrlPaste`; **on**. Fixed native sandbox/no-referrer policy. No raw HTML, `srcdoc` or configurable permissions. Recognized image/provider-video resources must use their respective routes. Site/browser may refuse rendering. |
| `image` | Reuse an authorized managed image → `image-block` | `source`, `revision`, `alt`; no children | M; **on with resource prerequisites**. Current read committed image Block in this Document, managed PNG/JPEG and active Cavern/session verification. ≤8 bindings, ≤10 MiB each, alt ≤1,024. No model asset IDs, URL replacement, acquisition or cloning. |
| `retained-pdf` | Reuse a retained PDF → `mutable/pdf-document-block`; native resource Surface when enabled | `source`, `revision`; no caller-supplied children. Host supplies viewer/front, reverse information, source notes and initial text. | P; **on with resource prerequisites**. Current read committed PDF Block in this Document and verified canonical capture/original/session. ≤4 bindings, ≤50 MiB/original. Surface mode also requires its native shell/information/text renderers. Archived/package binding unsupported. Original identities preserved; occurrence annotations/reverse content are not copied. |

E's three routes share a maximum of **8 external-media declarations per contribution** and URL length **4,096**. They use absolute credential-free HTTP(S), standard ports and native syntax restrictions against local/private address literals. Preparation does not probe DNS, download originals or verify availability; browser DNS/redirect/loading is not native acquisition. These limits do not constitute a universal per-resource validator or imply the legacy `youtube` route shares E's aggregate count.

Shared routes: [external media](../../src/block-tree/media-authoring.ts), [managed binding](../../src/features/dialectic/dcp/managed-images.ts), [retained PDF binding](../../src/features/dialectic/dcp/retained-pdfs.ts). See [3B](DCP_NATIVE_AUTHORING_STAGE3B_QUALIFICATION.md) and [3C.1](DCP_NATIVE_AUTHORING_STAGE3C_QUALIFICATION.md) for qualified native policies and limitations.

### Common admission limits and omissions

The response is bounded to 262,144 bytes, 1–64 root Nodes, 256 generated composition Blocks, logical depth 12 and 24,000 output Cells. Generated list/layout/compound/resource descendants count; native resource wrappers also count generated text Cells. Paragraph markup has its own 32,768-character, 512-element and depth-32 limits. These are ceilings, not a promise that every independently maximal structure fits together.

Internal Sides, panels, rows, cells, list items, margins and PDF information records are host-generated, not raw Block DTOs. No independent `checkbox`, `heading-block`, horizontal-rule, legacy plain-code, generic widget, generic fragment, host Document/window or arbitrary Block-property construct exists. Native preparation and canonical atomic admission remain authoritative; submitted authored content is immutable, with explicitly qualified presentation/operational exceptions.

## B. Standoff properties

### Three authoring surfaces

**I — inline markup:** `<annotation type="TYPE" ...>text</annotation>` inside paragraph/heading `markup`. Only `annotation` and self-closing `boundary` elements are admitted. Literal `&`, `<`, `>` must be XML-escaped. Optional annotation `id:"new:s1"` declares a generated passage identity; it is not an existing-source handle.

**R — explicit generated ranges:** insert `<boundary id="new:pos1"/>` and `<boundary id="new:pos2"/>`; supply `{id:"new:s1",type,from:"new:pos1",to:"new:pos2",ref:null,attributes:[]}` in `ranges`. Boundaries support overlapping properties. `attributes` is an array of `{name,value}` strings; it is not native metadata. All spans must be nonempty.

**S — existing-source annotations:** create a fresh exact `anchors[]` entry, then an `interpretations[]` entry targeting that new anchor. This adds an annotation without rewriting source text. A remembered range handle cannot directly replace the fresh exact anchor required for an interpretation. No raw offsets are accepted.

| DCP identifier | Meaning / usual use; native standoff effect | Attributes / values | I / R / S and prerequisites |
| --- | --- | --- | --- |
| `style/bold` | Strong emphasis; same native type, weight 600 | None | I/R Base; S with N. Default on. |
| `style/italics` | Emphasis, titles or terminology; same native type | None | I/R Base; S with N. Default on. |
| `style/underline` | Underlined emphasis; same native type | None | I/R Base; S with N. Default on. |
| `text/colour` | Explicit foreground colour; same native type and `value` | Required `value`, native safe CSS colour ≤128 characters; no inherited/reset values | I/R/S with N. Default on. |
| `style/strikethrough` | Indicate revision/deletion rhetorically; same native type | None | I/R/S with T. Default on; does not delete source text. |
| `style/subscript` | Subscript notation; same native type | None | I/R/S with T. Default on. |
| `style/superscript` | Exponents/superscripts; same native type | None | I/R/S with T. Default on. |
| `style/highlight` | Fixed native highlight; same native type, pink background | None | I/R/S with T. Default on. |
| `text/background-colour` | Coloured background emphasis; same native type and `value` | Required `value`, same safe-colour restrictions | I/R/S with T. Default on. |
| `reference/url` | Link a passage to an external reference; same native type and `value` | Required `value` ≤4,096 characters; native safe URL, HTTP(S) or mailto, no credentials/control/executable scheme | I/R/S with T. Default on. No capture needed for PDF/IIIF/web hyperlinks. Not governed by E's media acquisition semantics. |
| `dialectic/claim` | Classify a passage as a claim; same native descriptive annotation | None | I/R/S Base. Default on. Does not create an independent Argument. |
| `dialectic/question` | Classify a question; same native descriptive annotation | None | I/R/S Base. Default on. |
| `dialectic/speculation` | Mark tentative speculation; same native descriptive annotation | None | I/R/S Base. Default on. |
| `dialectic/suggestion` | Mark a suggested course of action; same native descriptive annotation | None | I/R/S Base. Default on. Distinct from the disabled top-level `suggestions` array. |
| `dialectic/objection` | Mark an objection; same native descriptive annotation | None | I/R/S Base. Default on. Not a directed Argument edge. |
| `dialectic/qualification` | Mark a qualification/limitation; same native descriptive annotation | None | I/R/S Base. Default on. |
| `mutable/entity-reference` | Mention a scoped Entity; same native type, host-prepared scoped reference | Inline: only `ref`. R/S: `ref` is an issued Entity handle or newly declared Entity alias, `attributes:[]`. No raw Entity GUID/value/metadata. | I/R/S with `scopedSemantics` (default on). Existing Vault references verified read-only; new Entities remain Document-owned. |

For colour/URL R/S attributes, use e.g. `[{name:"value",value:"https://example.org/"}]`; `ref` stays null. Empty-attribute properties reject extra settings. Attribute arrays allow at most 16 distinct names, names ≤128 and values ≤4,096 characters, before type-specific validation. Markup and source-interpretation paths share native standoff preparation.

The current 17-type legend comprises **10 formatting/reference styles, 6 discursive classifications and 1 scoped Entity mention**. A registry can contribute authorable semantic definitions; this inventory records the current default registrations, not hypothetical extensions. Decorative shaders/effects, animation, arbitrary style DTOs and registered-but-unadvertised properties are not a default authoring vocabulary.

**Inert compatibility is not an active capability:** syntactically valid unknown annotation identifiers can be retained as `dialectic/unknown-semantic` with their original name/attributes in inert metadata. Known non-authorable styles are rejected; reserved structural types cannot be injected through markup. This retention path does not make arbitrary identifiers renderable or semantically operative. `dialectic/range-anchor`, `mutable/gloss`, `dialectic/argument`, `dialectic/argument-relation`, `mutable/entity` and `mutable/entity-relation` are created through their dedicated operations below, not ordinary formatting tags. Native `codex/entity-reference` may be read or generated by resource factories; the DCP mention spelling is `mutable/entity-reference`.

## C. Semantic operations and response envelope

The transport is `protocol:"dcp/1.0"`, `kind:"contribution"`, with the exact current `exchange`. Every response includes `intent`, `replyTargets`, `composition`, `anchors`, `entities`, `interpretations`, `arguments`, `glosses`, `relations`, `suggestions`, `promotionRecommendations`. Empty semantic arrays are legitimate; ordinary conversation does not require classification or formal argument structure.

| Operation / wire fields | Native effect, authority and restrictions |
| --- | --- |
| `anchors:[{id,source,revision,selector:{exact,prefix,suffix}}]` | Up to 32 fresh exact source anchors. Current issued Block handle/revision, complete `standoff-editor-block` text, no inline objects; unique exact match with immediate context. Exact ≤8,192 characters; prefix/suffix ≤2,048 each; no Cell splitting. Host creates owned `dialectic/range-anchor` definition and range property. Anchor alone applies no highlight, interpretation or Gloss. Base operation, default on. |
| Generated passage aliases | An optional `new:s…` inline annotation ID or explicit range ID creates a native range anchor in the new text. It can be addressed by semantic operations. A `new:b…` composition ID is not a passage. |
| `interpretations:[{id,target,type,ref,attributes}]` | Up to 64 appended properties on fresh proposed exact **existing-source** anchors. Classifications Base; N/T formatting as in B; Entity mentions with `scopedSemantics`. Additive annotation only, not replacement/removal or a text-bearing Gloss. |
| `entities:[{id,name,typename,description,aliases}]` | Up to 64 `mutable/entity` definitions owned by this Document. Nonblank name ≤1,000, typename ≤128; description ≤8,192 (may be empty); ≤32 nonblank alias strings each ≤1,000. Host generates scoped identity and curated alias records. Requires `scopedSemantics`, default on. No Vault/global Entity creation, arbitrary attributes or automatic merging. |
| `glosses:[{id,target,type,text}]` | Up to 32 independently owned `mutable/gloss` definitions and attached properties. Target: new generated/source passage alias or issued existing range handle. Type: nonblank ≤128, no colon; text: nonblank ≤8,192. Independent explanatory text/identity, not a classification or Argument. Requires `scopedSemantics`; default on; native Gloss renderer for catalogue authorability. |
| `arguments:[{id,anchor}]` | Up to 64 `dialectic/argument` definitions anchored to a current Document-owned passage handle/alias. A classification does not create one implicitly. Requires `scopedSemantics`, default on. |
| `relations:[{id,kind:"argument",type,from,to}]` | Directed `dialectic/argument-relation`, endpoints are current Document-owned Arguments, existing issued handles or new aliases. Types exactly: `supports`, `challenges`, `qualifies`, `contradicts`, `elaborates`, `answers`, `depends-on`, `provides-evidence-for`. `from` acts toward `to`; depends-on points to the prerequisite. Requires `scopedSemantics`, default on. |
| `relations:[{id,kind:"entity",type,from,to}]` | `mutable/entity-relation`; nonblank relation name ≤128, not a fixed enum. Endpoints are scoped Entities; at least one must be owned by this Document, no foreign Document endpoint. Existing Vault endpoint requires issued authority and verification. No Vault-only relationship write. Requires `scopedSemantics`, default on. Both relation kinds share a 64-entry array limit. |
| `replyTargets:[handleOrAlias,…]` | Up to 12 discursive references on the contribution as a whole. Issued contribution, Block, range, Entity, Gloss, Argument or relation handles, or admitted new semantic aliases. The host's primary structural reply remains fixed. No per-generated-Block reply addressing, reparenting or retroactive editing. Base operation, default on. |
| `intent` | Communicative metadata: `reply`, `acknowledge`, `share`, `create`, `propose`, `challenge`, `qualify`, `clarify`, `compare`, `elaborate`, `synthesise`, `ask`, `answer`, `other`. Does not grant authoring authority or enforce task completion. |
| `suggestions`, `promotionRecommendations` | Required schema arrays but **must be empty** in current native admission. Continuation suggestions and global promotion are not enabled operations. No profile silently promotes local Entities/Arguments. |

`scopedSemantics` selects the existing semantic profile (historically named 4B versus 4A), independently of the native-authoring Stage 1/2/3 roadmap. The provider JSON Schema still contains semantic arrays when semantics are disabled; the host rejects nonempty `entities`, `arguments`, `glosses`, `relations` then. Catalogue/schema/prompt are projections with different current granularity, not a single existing per-operation permission system.

Typed generated aliases: `new:b…` Block, `new:r…` source anchor, `new:s…` generated passage, `new:pos…` boundary, `new:m…` interpretation, `new:e…` Entity, `new:g…` Gloss, `new:arg…` Argument, `new:rel…` relationship. Positive numeric suffixes and unique declarations; native preparation also retains legacy unprefixed aliases for compatibility. Existing handles are `src:<exchange-tag>:<kind><number>` (c/b/r/e/g/arg/ar/er). Native GUIDs are durable orientation, never substitutes for issued authority. Historical handles/revisions are expired. Host-native provenance, scoped definitions and all composition/source effects enter one atomic transaction.

## D. Reading and discovery — separate from authoring

| Agent-facing facility | Inputs and actual coverage | Bounds / limitations |
| --- | --- | --- |
| Initial `structuralContext` manifest | Selected native roots with issued handles, child/semantic references, text/revisions, attribution and `exactAnchorEligible` | ≤64 sources, 12,000 characters, 64,000 bytes, depth 12. Not a full Document inventory or visibility boundary. |
| `list_text_blocks` | `{cursor,limit,contributionId,participantId,fromOrdinal}`. Start cursor/null filters as appropriate. Committed native TextBlocks in contribution chronology, including AI authorship; returns native GUID, participant, ordinal, position, preview and fresh handle. | 1–20 entries/page; ≤160 preview characters; 128 visits/page, 512/exchange; traversal depth 32. Cursor is exchange-local, with unchanged filters. Preview requires subsequent `read_source` for exact authority. Lists TextBlocks, not every media/Block type. |
| `read_source` | `{handle}`. Reads issued contribution, Block, range, Gloss, Entity, Argument or relation; source attribution, revisions/relationships as applicable. With N, adds bounded native inspection for Block/contribution targets. | Block text ≤12,000 inline Cells; literal source over 24,000 UTF-16 units is explicitly truncated. ≤64 child/relation handles, ≤128 annotations. Missing/ambiguous/unauthorized/unavailable/truncated statuses matter. Unauthorized historical handles may return a fresh bounded recovery inventory. No implicit old-handle renewal. |
| `search_symposium` | `{query,limit}`. Case-sensitive substring search of committed inline content in this Document; returns source handles and excerpts. | Query 1–512 characters, result limit 1–20; ≤512 visited Blocks and 100,000 searched characters across the exchange; depth 32. No drafts, other Documents, files, full PDF text, internet or general Vault search. No participant filter on this tool; use inventory for that. |
| `describe_capabilities` | `{ids:[…]}` from the initial capability summary. Returns purpose, current availability, parameters/schema references, prerequisites, constraints and examples. | `dcpCapabilityCatalogue` default on; 1–4 distinct IDs ≤64 characters; 8,192-byte result budget with explicit omissions. Does not read Document content. |

All tool calls share the existing **6-call** allowance. Recorded tool results share a 48,000-character serialized-result budget. Native inspection adds at most 24 nodes/depth 4/16,000 bytes, bounded strings (1,024), selected configuration, ≤32 properties/annotations and ≤12 named relations. It retains native identity and omissions and is explicitly **non-lossless**. It is neither a native DTO export nor a cloning format. Reading an existing Vault Entity is possible only through issued scoped references; there is no general Entity-search tool.

### Readable native structure without an independent creation declaration

| Native type/family | What the current reader exposes | Creation distinction |
| --- | --- | --- |
| `checkbox-block` | Complete supported Block adapter under L; checked state in inspection | No standalone DCP checkbox kind. DCP task lists put checked state on generated item containers. |
| `table-row-block`, `table-cell-block`, `grid-row-block`, `grid-cell-block` | Identities, children, selected header/span/layout metadata | Generated only through table/grid; no independent row/cell constructor or arbitrary reconfiguration. |
| `side-block`, `tab-block`, `document-tab-block`, `page-block`, `left-margin-block`, `right-margin-block`, `document-tab-row-block` | Roles, labels/orientation, pages, named owned marginal relationships, child handles | Only through logical Surface/tabs/pages/margins constructs. No raw structural hierarchy authoring. |
| `youtube-player-block`, `vimeo-player-block` | Existing provider-resource information under E, native identities/children | Current DCP `video` emits `mutable/video-block`; `youtube` emits `youtube-video-block`. No constructor selecting these legacy type names. |
| Native table column weights / retained spans, list collapse, unsupported property IDs | Selected persistent metadata or explicit omission notices | Being readable does not make these settings authorable or guarantee visual effects. |
| IIIF manifest/image, web article/resource, citation, academic capture types | Encountered issued Blocks can return bounded generic native identity/children/properties and retained-resource family information | Their source status remains `unavailable` for a full DCP adapter. No retained binding route; no trusted capture export or original-content read. Do not label this fully qualified reading. |
| `mutable/structured-resource-block`, `resource-information-block`, `horizontal-line-block`, `code-mirror-block`, compatibility and other unadapted native types | Encounter-only generic inspection/omissions when reachable by an authorized Block handle; type-specific completeness not promised | No independent current constructor. PDF factory can generate resource-information children, but cannot copy an existing one on request. No renderer-derived authoring permission. |

Complete native reading support currently shares authoring gates in `DcpSources.source().supported`. For example, turning off managed-image/PDF authoring can remove complete source status even though some generic inspection remains; several structural readers also require stage flags. **Reading-independent-of-creation is a future requirement, not a property already guaranteed by these flags.** A configurable vocabulary must address this explicitly. Host-only workspace/session types do not gain authority merely because generic native inspection exists.

## E. Resource operation status

| Category | Implemented and qualified now | Status / boundary |
| --- | --- | --- |
| External reference | `reference/url`; native `youtube` | Default on. New references need no existing source Block or retained capture. |
| External embeds | `external-image`, `video`, `embed` | Default on. Native browser loading, unknown availability; no server acquisition or trusted provenance claim. |
| Existing managed binding | `image` | Default on with same-Document issued source and active-session/resource prerequisites. Native managed verification; no unnecessary reacquisition. |
| Retained capture binding | `retained-pdf` only | Stage 3C.1 accepted and default on with prerequisites; native factory/Surface and protected viewer. |
| IIIF / captured web / citation / academic / structured retained binding | None beyond the PDF route | 3C.2–3C.5 **paused**, investigation only. No partially implemented family or hidden disabled authoring route. Native services remain intact. |
| New acquisition/import | None through DCP | 3E **deferred**. Native user services are not agent tools. External browser loading is not this operation. |
| Native copying/cloning/transclusion | None through DCP | 3D **deferred**. Binding makes a fresh resource occurrence, not a copy of source annotations, arbitrary structure or reverse content. Exact quotation in new prose is not transclusion. |
| Media generation | None through DCP | Unsupported/outside current scope; no generation adapter. |
| Surface-backed Markdown fallback | None | Deferred/unavailable, despite the literal `source` and native `surface` constructs being qualified independently. |

No qualified family is being disabled by this review. Capability descriptors for unavailable operations remain explanatory, not grants. General retroactive editing, annotation deletion/replacement, acquisition policy, contribution notices and task-expectation enforcement remain deferred.

## F. Catalogue vocabulary and projection caveats

Default authorable descriptor IDs, grouped by their actual purpose:

- Composition: `composition.paragraph`, `composition.heading`, `composition.group`, `composition.list`, `composition.tasks`, `composition.table`, `composition.card-grid`, `composition.code`, `composition.source`, `composition.surface`, `composition.tabs`, `composition.pages`, `composition.sticky-note`.
- Configuration: `configuration.text`, `configuration.margins`.
- Standoff/source: `formatting.colour`, `formatting.core`, `source.anchor`, `source.classification`.
- Independent semantics: `semantic.gloss`, `semantic.argument`, `semantic.argument-relation`, `semantic.entity`, `semantic.entity-relation`.
- Media: `media.image`, `media.external-image`, `media.video`, `media.youtube`, `media.embed`, `media.retained-pdf`.
- Widgets: `widget.timer`, `widget.object3d`, `widget.canvas-preview`.

`inspection.native` is readable; `presentation.workspace` is presentation-only. `composition.markdown-fallback` and `media.retained-viewers` are unavailable aggregate descriptions; the latter points separately to the qualified PDF route. `composition.card-grid` names the logical `grid` route, not free spatial cards. `composition.tasks` describes a list configuration, not a distinct schema kind. Bold/italics/underline and classifications also come from the initial legend rather than individual catalogue IDs.

The schemas use formal structures, but property type strings and markup strings are not finite per-property enums; the legend and native preparation constrain them. Schema modes currently add whole stage families, while some native prerequisites reject specific configurations only at admission. These are important integration facts for future curation, not reasons to remove accepted features or create a second registry.
