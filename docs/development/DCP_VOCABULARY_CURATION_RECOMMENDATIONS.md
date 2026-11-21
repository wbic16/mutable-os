# DCP vocabulary curation recommendations

9 November 2026. Based on the [current agent-facing vocabulary inventory](DCP_CURRENT_AUTHORING_VOCABULARY.md), inspected at `df09151`, after acceptance of Stage 3C.1. **These groupings are advisory. No feature, default, schema, prompt, admission rule or UI has been changed.** All qualified Stages 1/2/3A/3B/3C.1 functionality remains available under its existing prerequisites.

## Revised priority and current work status

Optimise DCP for human–AI communication. Native editor infrastructure remains the source of preparation/validation truth, but numerical parity with every native Block is no longer the immediate product target. A capability should justify its conversational purpose before receiving implementation or default-vocabulary priority.

| Work | Current status / direction |
| --- | --- |
| Stages 1, 2A–2D, 3A, 3B | Accepted; preserve qualified behaviour and compatibility. |
| 3C.1 retained PDF binding | Accepted; preserve native verification, Surface construction, atomic admission and viewer guards. |
| 3C.2 retained IIIF binding | Not started. Investigation exists; no partial implementation to preserve or discard. **Paused.** |
| 3C.3 web, 3C.4 citation/academic, 3C.5 structured retained binding | Investigation only. **Paused**, with native services unchanged. |
| 3D native cloning | **Deferred** pending a concrete conversational need. No current DCP route. |
| 3E general resource acquisition/import | **Deferred** pending practical-value and authority review. No current DCP route. |
| Configurable vocabulary and UI | **Investigation only**; do not implement before review. |

The earlier plans remain architectural evidence, not an automatic implementation queue. Source-specific annotations, references and exact quotation commentary already cover many cases that would otherwise be mistaken for a need to clone content or ingest an entire resource family.

## Provisional groupings

“Core” means broadly useful to make available, not mandatory to use in every answer. “Extended” covers structured/specialised conversation. “Specialist” needs a domain/workflow reason. “Experimental/optional” covers demonstrations and rarely useful expression. These labels describe product utility, not implementation quality, source authority or availability of prerequisites.

### Composition and configuration

| Capability | Proposed group | Rationale and boundary |
| --- | --- | --- |
| `paragraph`, `heading` | **Core** | Natural prose, quotations and section structure. A reliable plain paragraph route should remain the minimum conversational path. |
| `group` | **Core** supporting structure | Useful grouping and nesting; may be an internal dependency rather than a prominent user checkbox. Does not imply a spatial card. |
| `list` bullet/ordered | **Core** | Steps, alternatives and structured explanations are frequent. Nested content remains useful without resource ingestion. |
| `list` task style / initial checked state | **Extended** | Useful for plans and checklists. Explain that submitted checked state is authored and immutable; do not imply a live task-management system. |
| List start/reversed/per-item numbering | **Extended** configuration | Useful for continuation, countdown or faithful quotations; should be discoverable without occupying the permanent prompt. |
| `table` and header configuration | **Core** | Compact factual comparisons. Existing native limits are sufficient; spans and extra layout knobs need evidence of demand. |
| `code` | **Core** | Frequent technical output. Preserve literal content/language rather than flattening to prose. Language colouring limitations should stay in detailed discovery. |
| `source` | **Extended** | Valuable when exact Markdown/HTML source is the requested object. It should not become the normal way to avoid native composition. HTML-source inspection may be Specialist for some audiences, but it is one current kind with a format parameter. |
| `grid` | **Extended** | Useful for parallel perspectives or visual arrangements. A distinct communicative layout, not a requirement for ordinary answers. |
| `tabs`, `surface` | **Extended** | Useful alternatives, progressive disclosure and front/back material. Avoid hiding necessary ordinary explanation merely to exercise a rich widget. |
| `pages` | **Specialist** | Useful for document-like presentations; less useful in routine turn-taking. Retain the contribution-level destination boundary. |
| `margins` | **Extended** | Useful for side commentary and scholarly/technical notes when requested. A configuration/owned relation, not a standalone Block kind. |
| `textStyle` alignment/indent/named size; tab orientation | **Extended** configuration | Meaningful presentation controls, best described on demand. Normal defaults remain useful in Core conversation. Heading level stays part of Core heading authoring. |
| `sticky-note` | **Extended** | An aside or reminder can improve a designed contribution. Dimensions and appearance are subordinate to its content. |
| `timer` | **Experimental/optional** | Potentially useful in guided exercises, but seldom needed in normal responses. Local runtime state and reset-on-remount limit task-management expectations. |
| `object3d` | **Experimental/optional** | The current coffee-cup scene is demonstrative, not a general 3D authoring capability. Keep it available to an intentional demonstration workflow. |
| `canvas-preview` | **Experimental/optional** | Demonstrates movable sample boxes; it does not author a durable canvas. Weak default conversational value. |

Generated list items, rows/cells, Sides, tab panels, page shells, marginal owners and PDF reverse information should never be presented as a second list of independent capabilities. Their admission follows their selected parent operation and native constraints.

### Standoff properties and semantic operations

| Capability / exact identifiers | Proposed group | Rationale |
| --- | --- | --- |
| `style/bold`, `style/italics` | **Core** | Familiar emphasis with little conceptual overhead. |
| `reference/url` | **Core** | Source attribution and ordinary links, including PDF/IIIF links, without ingestion. |
| `style/highlight` | **Core** | Particularly valuable for explicit source-annotation requests. An anchor alone must not be described as a highlight. |
| `style/underline`, `style/strikethrough` | **Extended** | Useful emphasis and revision notation; less universally needed than bold/italics. |
| `style/subscript`, `style/superscript` | **Extended** | Valuable in mathematical/scientific notation, with no reason to burden ordinary prose guidance. |
| `text/colour`, `text/background-colour` | **Extended** | Useful deliberate distinctions; arbitrary decorative styling should not become the conversational default. |
| `dialectic/claim`, `dialectic/question`, `dialectic/speculation`, `dialectic/suggestion`, `dialectic/objection`, `dialectic/qualification` | **Extended** | Useful for explicit analysis of discourse. Do not require tagging ordinary sentences; these remain classifications, not independent arguments. |
| Source anchors and generated passage identities | **Core** infrastructure | Necessary for exact source-directed references and requested annotation. Their identifiers are host/response authority, not user-facing decoration. |
| Interpretations | **Core** path, selected effects vary | The shared way to annotate an earlier passage. Allowed formatting/classification/Entity effects should follow their respective selections rather than turning every interpretation type on implicitly. |
| Discursive `replyTargets`, `intent` | **Core** | Natural addressing and communicative metadata should remain independent of formal argument structures. Intent is not a task-completion validator. |
| Glosses | **Extended** | Independent explanatory remarks are useful in close reading, teaching and review. They need not accompany ordinary replies. |
| Entities and `mutable/entity-reference` | **Specialist** | Valuable for knowledge-oriented conversation and disambiguation. Scope, current handles and native authority matter more than a broad default vocabulary. |
| Arguments and the eight directed Argument relations | **Specialist** | Valuable for deliberation/research workflows. Keep explicit rather than implicitly treating every claim as an Argument. |
| Entity relationships | **Specialist** | Useful structured knowledge, with an owned endpoint and no global write authority. |
| Unknown-semantic inert retention | **Compatibility mechanism**, not a curated active capability | It preserves unsupported meaning as inert data. It should not appear as a checkbox that promises arbitrary semantic execution. |

There is no recommendation to enable decorative styles, arbitrary native metadata, `suggestions` or promotion. Those are not missing Core features merely because native registrations or schema fields exist.

### Resource operations

| Capability | Proposed group / priority | Rationale |
| --- | --- | --- |
| External hyperlinks | **Core**, already implemented | Often enough to communicate a reference; native annotation remains available when source-specific work is requested. |
| `external-image` | **Extended**, preserve | Useful illustrations and visual evidence without capture ingestion. Availability and perception are not implied. |
| `video`, `youtube` | **Extended**, preserve both routes | Useful demonstrations. A future UI can group them under a video choice while preserving their different native outputs and compatible wire forms. Do not remove or consolidate them in this review. |
| `embed` | **Extended**, optional in a future profile | Useful when interacting with a website helps the conversation; an ordinary link is often sufficient. Existing sandbox policy remains fixed. |
| `image` managed binding | **Extended**, preserve | Reuses material already in the Document with native verification; valuable without new acquisition. |
| `retained-pdf` | **Specialist**, preserve | Useful in research/document review. Current default stays on; Specialist is an advisory future-profile choice, not a disable instruction. |
| Retained IIIF, captured web, citation/academic and structured-resource binding | **Specialist candidates**, paused | Demand should identify the actual resource/interaction need before more exposure. Existing native services remain reusable. |
| Native cloning | **Extended/Specialist candidate**, deferred | Useful only when genuine structural duplication is needed. Quoting, referencing and resource binding do not automatically require it. |
| General acquisition/import | **Specialist candidate**, deferred | Requires policy, lifecycle and original-resource verification; ordinary external-reference authoring already serves many conversational cases. |
| Media generation | **Outside current scope** | No DCP adapter; not something a vocabulary toggle can enable. |

A plausible future starting profile is Core plus selected Extended expression, with research semantics/resources and demonstrations opt-in. That is a recommendation for review, **not a new default**. Users should be able to inspect an existing timer, capture or formal argument even when they choose not to let the agent create more of that content.

## Technical implications of future configuration

A small shared selection projection is feasible. There is no need for another Block/resource registry, a parallel protocol or a natural-language intention validator. However, simply adding checkboxes over the existing stage flags would not meet the requested consistency/readability rules.

### Existing implementation to reuse

| Existing authority | How it supports configuration / limitation to account for |
| --- | --- |
| [Catalogue adapters](../../src/features/dialectic/dcp/capabilities.ts) | Already contain stable capability IDs, purposes, schema references, prerequisites, native mappings and examples. Extend this existing layer with selection/dependency metadata where needed; do not create a duplicate inventory as runtime truth. Current descriptors mix operations, configurations, reading and explanatory unavailable entries. |
| Shared native operation descriptors | `native-authoring`, `layout-authoring`, `compound-authoring`, code/source/note/timer/3D factories own parameters and validation. Reuse these; a user selection must never weaken native prerequisites. |
| [Standoff descriptors and legend](../../src/rendering/standoff-styles.ts) / [markup](../../src/features/dialectic/dcp/markup.ts) | Native styles already carry curated `authoring`/semantic descriptors. Keep selection close to these definitions. Scoped Entity references and independently authored semantic objects have their own preparation paths. |
| [Provider schema generation](../../src/features/dialectic/dcp/provider-schema.ts) | `authoringSchema` builds the common projection; `schemaFor` preserves recursive OpenAI and bounded Anthropic modes. Replace/augment coarse stage switches with the same resolved operation selection at this projection boundary. Preserve earlier schema compatibility. |
| [Request/prompt assembly](../../src/features/dialectic/dcp/exchange.ts) / [provider adapter](../../server/dialectic/providers.ts) | Initial summary, legend, examples, enabled-stage guidance and formal schema must describe the same effective selection. Today stage booleans and concatenated instruction strings serve this role; they are not per-capability configuration. |
| [Native admission](../../src/features/dialectic/dcp/exchange.ts) / [semantics](../../src/features/dialectic/dcp/semantics.ts) | Must independently enforce the resolved selection for composition, configuration, markup, explicit ranges, interpretations and semantic arrays. A filtered catalogue or schema by itself is insufficient. Retain typed source identities, current authority, budgets and canonical atomic commit. |
| [Source reading and inspection](../../src/features/dialectic/dcp/sources.ts) / [inspection](../../src/features/dialectic/dcp/inspection.ts) | Reading eligibility currently shares several creation flags. Split read support from authoring permission so disabling creation does not hide existing content or invalidate legitimate source annotation. Do not claim complete reading for current unadapted types. |

### Small explicit selection, with native dependencies preserved

The conceptual effective set should be **user selection intersected with qualified DCP routes and applicable host features**, with renderer and resource prerequisites still checked. Resource possession/readiness is separate: an image/PDF operation can be selected but await a current source/resource. Selection grants no foreign Document access, asset acquisition or global mutation.

Resolve that set host-side for the exchange. Project it consistently into schema, catalogue, legend/relevant guidance and native admission; do not accept a model-authored flag as permission. Preserve an exchange snapshot or reject/restart affected work if the user changes permissions during an exchange. The eventual persistence location and UI need a separate decision; no settings model is implemented here.

Dependencies require operation-level treatment:

- Task state, table headers, margins and text appearance are sub-capabilities, not independent Block kinds. The existing `composition.tasks` shares `List`; `configuration.margins` shares Paragraph/Heading. Filtering only `Node.anyOf` cannot govern them.
- Native generated descendants are permitted by their selected parent operation. A retained PDF's native resource Surface must not accidentally require permission to author arbitrary user-composed Surfaces. Do not expose checkboxes for every internal row/cell/Side.
- Interpretations need source anchors and a selected annotation type. Glosses and Arguments need passage authority; relationships need valid endpoint identities, which may be existing and readable even when creation of new Entities/Arguments is disabled. Avoid auto-enabling all endpoint creation just to reference an existing endpoint.
- `mutable/entity-reference` needs scoped reference admission; it does not inherently require permission to create new Entities. Reading/verified use of existing Entities and creation of new ones are distinct choices.
- Markup `type` strings and the semantic schema's free strings cannot enforce a checklist by themselves. Known-but-disabled properties must be checked in shared admission, including existing-source interpretations; they must not become a back door through unknown-semantic inert retention. Preserve the distinction between retained unknown data and permission to apply an active property.
- Catalogue status, provider schema and admission are not perfectly equivalent today. Some native feature prerequisites remain admission checks, and disabled semantics still leave arrays in the formal schema. Future configuration needs tests that exercise all projections together rather than treating the current catalogue as an authorization service.

Before implementing such configuration, qualify a small matrix: one disabled composition kind, one disabled formatting property across I/R/S, one semantic dependency, one resource operation, an existing disabled-type source that remains readable, both provider schema modes and a selection change during an exchange. Use focused deterministic tests; no new broad benchmark or task-expectation framework is implied.

## System prompt direction

Keep durable guidance focused on conversation, source discovery, current authority, identity roles, native expressive choices and honest limitations. The formal schema should communicate shapes; bounded catalogue detail should carry purposes, parameters, examples and prerequisites. Ordinary replies should remain free to use plain text with empty semantic arrays.

The current prompt is assembled from base authoring/source-recovery instructions plus enabled-stage strings; it already contains more detailed syntax and examples than this desired long-term split. Future curation should filter relevant guidance and may move repeated detail to the existing catalogue, preserving the discovery-before-refusal and fresh-handle requirements that addressed actual failures. This review adds no prompt text and performs no prompt refactor.

## Review stopping point

The requested inventory, provisional groupings and configuration implications are delivered. No remaining retained family, cloning, acquisition, configurable-vocabulary UI or prompt rewrite has begun. The next decision is which conversational capabilities deserve a future configurable default and which concrete workflows justify more authoring exposure; it is not automatic continuation of the old Stage 3 sequence.
