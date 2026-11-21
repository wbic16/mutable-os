# Native editor / DCP authoring parity

Current direction — 9 November 2026: Stage 3C.1 is accepted. Native editor infrastructure remains the shared architectural foundation; exhaustive DCP exposure is no longer the immediate objective. The current [agent-facing vocabulary](DCP_CURRENT_AUTHORING_VOCABULARY.md) and [curation recommendations](DCP_VOCABULARY_CURATION_RECOMMENDATIONS.md) guide the next review. Retained-family increments 3C.2–3C.5 are paused, with no 3C.2 implementation underway; cloning/acquisition 3D/3E are deferred. All qualified capabilities and defaults remain unchanged. The parity inventory below remains evidence, not a mandate to implement every registered type.

9 November 2026. Investigation and bounded implementation proposal; no architecture implementation in this change. Surface-backed Markdown fallback is deferred.

## Decision

### Stage 3C.1 implementation update — 9 November 2026

Stage 3B is accepted. Retained PDF binding now resolves a current committed native PDF source, verifies its canonical capture and original through native services, and admits a native resource Surface atomically. See [Stage 3C qualification](DCP_NATIVE_AUTHORING_STAGE3C_QUALIFICATION.md) for the exact `retained-pdf` construct, viewer guards, limits and remaining IIIF/web/academic/structured prerequisites. Those families are investigated, not yet advertised. Stage 3D has not begun.

### Stage 3B implementation update — 9 November 2026

Stage 3A is accepted. Stage 3B now supports external-image URLs, native YouTube/Vimeo references and sandboxed website embeds without existing native source authority. Ordinary PDF/IIIF/web hyperlinks remain available; specialised retained viewers await their capture operations. See [Stage 3B qualification](DCP_NATIVE_AUTHORING_STAGE3B_QUALIFICATION.md) for the three new constructs, preserved native policy differences, browser-network limitations and tests. Stage 3C has not begun. Existing-source authority remains necessary for managed binding and future native copying, not for introducing a new external URL.

### Stage 3A implementation update — 9 November 2026

Stage 3 planning is accepted. Existing managed images can now be bound through current same-Document source authority, shared native image preparation and bounded canonical fragment admission. See [Stage 3A qualification](DCP_NATIVE_AUTHORING_STAGE3A_QUALIFICATION.md) for the new `image` construct, resource/authority limits, diagnostic evidence and deterministic qualification. This does not imply external-reference, acquisition or cloning parity. Stage 3B has not begun; the historical inventory below remains the baseline.

### Stage 2 acceptance and Stage 3 planning — 9 November 2026

Stage 2A–2D is accepted and complete as planned. [Stage 3 plan](DCP_NATIVE_AUTHORING_STAGE3_PLAN.md) investigates native resource binding, external references, retained captures, copying and acquisition in small reviewable increments. It preserves purpose-driven projections and shared native services; the original generic-operation proposal below remains superseded. No Stage 3 implementation has begun. The live exercise partially succeeded (native structures and source anchor; requested source highlight absent), and 56 deterministic resource/clipboard/persistence tests passed. Remaining canonical-audit gaps are carried forward.

### Stage 2D implementation update — 9 November 2026

Stage 2C is accepted. Shared native preparations now expose sticky notes, timers, the supported coffee-cup 3D object and the existing Canvas demonstration preview. Submitted timer operations and 3D viewing use local state in their native views; authored configuration stays protected. See [Stage 2D qualification](DCP_NATIVE_AUTHORING_STAGE2D_QUALIFICATION.md) for operation coverage, tests and remaining host-context/canonical-audit gaps. Stage 3 has not begun. The original inventory remains the audit baseline.

### Stage 2C implementation update — 9 November 2026

Stage 2B is accepted. Shared compound preparations now cover new Surfaces/Sides, labelled tabs/orientation, document-tab PageBlocks and left/right named marginal relations. See [Stage 2C qualification](DCP_NATIVE_AUTHORING_STAGE2C_QUALIFICATION.md) for native equivalence, immutable-safe navigation, bounded discovery, source authority and persistence evidence. Existing-book fixed-size page insertion remains an explicit context-dependent parity gap; no host or retroactive-edit authority was added. The original inventory below remains the audit baseline. Stage 2D and Stage 3 have not begun.

### Stage 2B implementation update — 9 November 2026

Stage 2A is accepted. Shared list/task and layout preparations now cover numbering, initial checked state, native table headers and unequal-row grid composition. See [Stage 2B qualification](DCP_NATIVE_AUTHORING_STAGE2B_QUALIFICATION.md) for tested operation coverage, immutable controls and explicit width/span/collapse limitations. The original inventory remains the baseline; later composition families and resource stages have not begun.

### Stage 2A implementation update — 9 November 2026

Stage 1 is accepted. The first Stage 2 increment extends the same shared preparations with text appearance, literal standoff code and Markdown/HTML source, plus curated formatting/references. See [the reviewable Stage 2 plan](DCP_NATIVE_AUTHORING_STAGE2_PLAN.md) and [Stage 2A qualification](DCP_NATIVE_AUTHORING_STAGE2A_QUALIFICATION.md) for operation-level coverage and explicit remaining gaps. The original inventory below remains the baseline; it is not a claim that all Stage 2 operations are now supported. No new Block registry or general authoring framework was required.

### Stage 1 architecture amendment — 9 November 2026

This amendment supersedes the earlier proposal for a generic native-operation wire form. The native inventory remains the coverage reference; it is not DCP's authoring language. The three layers are the canonical native model, shared native preparation operations, and purpose-driven DCP reading/authoring projections. This fits the existing plan without a new registry or general authoring framework, so Stage 1 can proceed under the revised brief.

**Create.** Retain paragraph/group/list/table unchanged. Add `heading {id,kind,level,markup,ranges}`, `grid {id,kind,rows}` (the same nested row/cell/content shape as table), and `youtube {id,kind,url}`. Heading level is 1–6; its native effect is `block/font/size: hN` on a TextBlock. Grid preparation supplies rows/cells/ownership; the model never declares their internal IDs. YouTube accepts the existing native URL-or-ID validator. These are specific projections onto shared operations extracted from the style bar and creation menu, not per-type DCP constructors. The host counts generated descendants against existing budgets and commits through the existing atomic contribution transaction.

**Modify and standoff curation.** Keep the existing exact-source anchor plus `interpretations` envelope for adding annotations; this does not permit editing submitted text or replacing prior annotations. Existing bold/italics/underline and semantic routes remain. Stage 1 adds text colour as the representative parameterised native property. Its native descriptor supplies the value schema and preparation, reused by human range application, inline XML and explicit range attributes. Extend the current native style descriptor with authoring policy/schema/preparation, rather than introduce a parallel DCP registry. Inline `value="#336699"` and range `attributes:[{name:"value",value:"#336699"}]` converge on that one preparation path. Known experimental/decorative properties remain excluded unless explicitly curated; unknown semantics remain inert preservation. The broader suggested formatting groups are accounted for as later-stage work, not advertised prematurely.

**Inspect.** Preserve compact initial manifests and existing tools. An explicit `read_source` additionally returns a bounded logical inspection tree: native identities/current handles, revisions, child/owned-relation structure, selected persistent configuration, relevant property values and a safe external-resource description. Grid/table rows and cells and tab orientation/labels remain related in that tree. Unknown native types retain identity/children with explicit omitted-detail notices. Do not export arbitrary metadata, credentials, renderer state or trusted resource captures. Truncation is explicit and child handles permit continued reading within the unchanged exchange budget. This is a reading projection, never a lossless DTO; native clone/reference/transform operations remain the required future route for preserving complex originals.

**Catalogue and activation.** Retain compact summaries and bounded `describe_capabilities`. Add native-effect/preparation mappings, parameter schemas, context/prerequisite descriptions and compact examples for these projections. Distinguish route support from resource readiness and from disabled/experimental state. Feature `dcpNativeAuthoringStage1` gates the new wire nodes, annotation admission and inspection; initially disabled during qualification, enabled only after the Stage 1 checks pass. The broker negotiates the corresponding schema; disabled exchanges retain the old schema. Native UI routes retain their current availability and share the extracted preparations.

**Qualification and sequence.** Reuse the native editor and Dialectic fixtures to compare human/DCP results, including property validation, generated graph ownership, inline/range equivalence, immutable-source annotations, stale/foreign authority rejection, atomic rollback, Undo/Redo and native save/reload. Inspect a compound grid with heading/colour and an unfamiliar child without flattening it. Check generated-node bounds, no typing-triggered discovery/snapshots, and the existing provider schemas (including bounded Anthropic expansion). No model benchmark is needed. Preserve the accepted vocabulary audit as the pre-Stage-1 baseline; add a separate qualification report and operation-level coverage notes.

The four stages remain: (1) this representative pattern, (2) other composition/configuration and curated annotation families, (3) resource binding/import and native-copy parity, (4) host/context closure and activation of qualified routes. Each native human operation must map to a projection or an explicit deferral/exclusion; internal rows/cells need no independent DCP construct. Markdown fallback, activity/notices, task-expectation enforcement, broad acquisition/generation and retroactive content editing remain deferred. Do not proceed to Stage 2 automatically.

The editor must own the authoring vocabulary. DCP should consume a shared native authoring contract, rather than maintain its own list of constructors. The existing catalogue accurately describes today's DCP restrictions, but those restrictions must not define the target architecture. In particular, absence of media acquisition or generation does not make an existing image, external video reference or retained resource intrinsically unauthorable.

There is **part of a shared contract**, but no complete one to expose unchanged. Native factories, preparation services and canonical transactions already exist. Parameter schemas, creation eligibility and child requirements are scattered across UI handlers and services. Extracting these into native registrations is substantial enough to warrant the requested review before implementation.

## Inventory scope and interpretation

The inventory covers the current reactive application's creation menus, feature actions, commands, formatting/typing transformations, resource/file/clipboard insertion, Document formats and workspace launch paths. Legacy `universe-block.ts` implementations and `/pilot` or demonstration fixtures are not evidence of production authorability. Existing-content restoration is distinguished from fresh construction.

Rows group related native types; each type is named explicitly. **Partial** means DCP can create the basic native type but cannot express all editor-authorable configuration, child placements or states. **Missing** means the current DCP route is absent, not that the native type is intrinsically unauthorable. Native features, destination and input prerequisites apply throughout.

There is no complete existing per-type JSON Schema to quote. The parameter descriptions below come from actual factories, command inputs and validators. Where a factory emits no children, that describes its construction route; it does not assert an existing repository-wide prohibition on children. The shared contract must document these distinctions instead of inventing stricter DCP-only rules.

Current DCP also supports exact source anchors/classifications and, under its semantic profile, Document-scoped Entities, Glosses, Arguments and directed relationships. These existing semantic operations remain intact; they are not additional native Block constructors and should not be counted as closing the missing Block-creation routes.

### Document content and structural creation

| Native type / operation | Actual human route and accepted data | Children, prerequisites and constraints | Current DCP / missing shared piece |
| --- | --- | --- | --- |
| `standoff-editor-block` | Add Text; Enter/split; import; `textBlock` factories. Text, registered annotations and Block styles | Native Cell/range validation; host identities; optional owned relations are separate operations | **Partial**: paragraph markup/ranges; missing shared native Block configuration and relation-slot preparation |
| Headings on `standoff-editor-block` | Style bar H1–H4; Markdown input H1–H6; `block/font/size` with heading value | A native Block property, not a separate heading Block. Import has its own fidelity rules | **Missing heading configuration**; extract the existing style/property operation, not a heading-to-paragraph approximation |
| `container-block` | Group contiguous siblings, list-item construction, journal format, Surface back containers | Grouping checks common parent/contiguity; fresh groups need child composition. Pocket height UI accepts 1–10000 px | **Partial**: DCP group; missing shared grouping/configuration and declared slots |
| `indented-list-block` | Convert to list; list/Markdown commands; import | `htmlList` ordering/start/reversed state; item containers/text; nesting and split/exit operations | **Partial**: ordered/bullet lists, but fixed start=1/reversed=false and no full task/item configuration |
| `table-block`, `table-row-block`, `table-cell-block` | `TableOperations.prepare/execute`; columns command; row/column insertion; import | Native table ownership, cell transfer and nesting rules; current create command offers 2/3/4 columns. Rows/cells are structural children, not free-standing content. Import can retain header/alignment data | **Partial**: rectangular DCP table; missing shared creation/configuration contract. Keep existing bounded table operations |
| `grid-block`, `grid-row-block`, `grid-cell-block` | Add Grid: 1/2 rows × 1/2/3 columns; convert 1×2; add rows; cell movement/merge | Rows own cells; cells own content. UI merge and width state must not be confused with a guaranteed rectangular table | **Missing**: grid builder is a closure in `block-menu-actions.ts`; extract it and its constraints once for both callers |
| `surface-block`, `side-block` | Reverse create/flip; explicit grouping; imported resource wrapping | Front/back Side children (`surfaceRole`); ordinary owned source; existing wrapping checks references, shared occurrences, IME and live-media movement | **Missing**: shared fresh Surface/Side builder and prepared wrapping operation. Native Surface authoring is independent of Markdown fallback |
| `tab-row-block`, `tab-block` | Convert to tab; text-tab split; `/tabs create`; add/rename/reorder tabs | Named tabs with content; horizontal/vertical orientation; contiguous selected sources for conversion; hosted Document tabs use separate lifecycle | **Missing**: reuse tab operations; separate native structure preparation from focus/bookmarks and tab activation |
| `document-tab-row-block`, `document-tab-block`, `page-block` | Convert Document to page; Add page; notebook format | Page containers under document tabs, with page content/margins; conversion rejects existing/nested page arrangements | **Missing**: shared page/notebook builders and destination checks; no arbitrary host-tab/session creation |
| `sticky-tab-row-block`, `sticky-tab-block` | Tags menu adds row/tab where appropriate, with label/text/active metadata | Sticky tab row owns sticky tabs; tabs own content | **Missing**: extract menu builder/configuration |
| `fixed-size-page-block` | “Add blank pages” inside an existing `book-block` | Left/Right page metadata, text children; requires an existing book context | **Missing**: context-dependent page operation. No fresh production book-creation command was found; existing book copies/imports are a different route |
| `left-margin-block`, `right-margin-block` | Margin commands → `ensureMargin` | Named **owned relation** (`leftMargin`/`rightMargin`), not arbitrary child placement; text children; existing ownership retained | **Missing**: expose the existing relation operation through shared preparation; do not flatten margins into ordinary children |
| `checkbox-block`, task-bearing text/container | Task/list commands, Markdown task input, import; Enter continues existing checkbox containers | Boolean `checked`; compound content and list ownership; collapse/presentation distinct from authored completion | **Missing task configuration**; reuse task/list constructors. Preserve `checkbox-block` continuation and alternative native task representations |
| `horizontal-line-block` | Markdown input horizontal-rule transformation | Native leaf; insertion and prefix removal are one structural change | **Missing**: small native factory shared with the transformation |
| `code-mirror-block` | Add Code | Text payload; current renderer is a native textarea preview while CodeMirror migration is incomplete | **Missing**: extract menu factory; advertise the actual editor capability, not a complete CodeMirror implementation |
| `standoff-code-block` | Add Standoff Code → `standoffCodeDto` | Native text child; `markdownCode.language`; offered JS/TS/Markdown highlighting; other languages are literal/unhighlighted | **Missing**: parameterized shared factory and protected-view qualification |
| `mutable/markdown-source-block`, `mutable/html-source-block` | Add source; embed/link source file; source conversion | Exact source string and versioned `sourceFormat`; linked source requires admitted source/asset provenance. HTML source is not permission to execute HTML | **Missing**: reuse `sourcePayload/sourceFragment`, with binding requirements separate from empty-source creation |
| `sticky-note-block` | Insert Sticky Note Here; floating note | Text child; default yellow/paper/scroll/fontStep=0; note appearance and host window placement are distinct | **Missing**: use `stickyNoteDto`, shared validated settings; floating window remains host-context work |
| `canvas-block` | Add Canvas | Current `CanvasPreviewView` is a preview, not a general card/grid editor | **Missing** native route despite a real menu. Advertise the preview honestly; do not infer spatial-card authoring |
| `timer-block` | Timer feature command, toolbar and Add Block | `timerBlockDto`; duration 1–86400 seconds; idle/running/paused state; size/position; UI placement currently reads geometry | **Missing**: parameterized pure timer preparation plus native state validation; focus/geometry remain in the human adapter |
| `3d-object-block` | Add 3D Object — Coffee Cup | `objectDto/readObject`; registered coffee-cup scene, view angles, lighting, auto-rotation, steam/stain, size 160–640 | **Missing**: share the existing scene/configuration factory. This is not arbitrary model/mesh acquisition |
| `canvas-counter-block` | Canvas Create Counter inside a window; feature `create()` | Count default 0; widget lifecycle; workspace destination for the creation action | **Missing**: shared widget creation/destination contract; do not silently drop it because the current button is on Canvas |
| `phosphor-screen-block` | New Phosphor Document | `features/phosphor/model.ts::newDocument`, `validate`, `readSettings`; native text child; 40/80 columns, 24 rows, glyph encoding and screen settings | **Missing**: extract screen preparation from new-Document/host launch and declare supported owner context; retain Phosphor validation |
| Alternative readings of text | Text-superposition command | Creates owned text under `superposition:<id>` and a range property; checks overlap and source range | **Missing placement/configuration route**, not a new Block type. Reuse its native operation and current source authority |

Primary evidence: [creation menus](../../src/runtime/block-menu-actions.ts), [tables](../../src/runtime/tables.ts), [Surfaces](../../src/runtime/block-surfaces.ts), [tabs](../../src/runtime/tab-commands.ts), [tasks](../../src/runtime/tasks.ts), [Markdown input](../../src/runtime/markdown-input.ts), [style bar](../../src/rendering/document-style-bar.tsx), [code](../../src/runtime/standoff-code.ts), [source Blocks](../../src/interchange/source-block.ts), [formats](../../src/features/document-formats/model.ts), [feature factories](../../src/feature-api/index.ts), [Phosphor](../../src/features/phosphor/model.ts).

### Resource-backed authoring

All these creation routes are currently missing from DCP. They require native preparation/resource binding, not independent DCP constructors.

| Native type | Actual creation path and required input | Native structure / exact missing integration |
| --- | --- | --- |
| `image-block` | Add Image URL; Canvas image; explicit resource paste; existing native copy. Either validated external reference or managed PNG/JPEG manifest/reference, depending on route | Factory emits no children; alt/size/source metadata. Extract URL factory and reuse verified managed binding. Acquisition is only necessary when choosing the acquisition route |
| `image-cell` / inline image | Clipboard image/files/HTML and inline-image command | Host-owned inline object within native text, with alt/size and admitted asset; not a top-level Block. Reuse image admission rather than accepting forged `assetId`/`src` |
| `youtube-video-block` | Add YouTube URL or 11-character ID | `youtubeId` validation, metadata URL, native player. No media generation or download required |
| `youtube-player-block`, `vimeo-player-block` | Explicit resource URL paste → `resourceBlock` | Strict parsed provider/video reference; no children. Reuse URI parser and active-resource preparation |
| `mutable/video-block` | Inspect/import linked resource → `videoFragment` | `PassiveVideo` provider/id/URL validation; external player reference, not managed arbitrary video bytes |
| `iframe-block` | Explicit resource URL paste | Validated HTTP(S) reference, resource-embed/title/height metadata; current iframe lifecycle/security policies remain authoritative |
| `mutable/pdf-document-block` | PDF resource paste / linked-resource import → `pdfBlock` | Trusted retained PDF capture, managed original, snapshot/Entity identity; no free model-supplied capture object. Expose existing capture lookup/binding separately from `pdf.import` acquisition |
| `mutable/iiif-manifest-block`, `mutable/iiif-image-block` | IIIF resource paste → `iiifBlock` | Trusted captured manifest/image information; native snapshot metadata; later viewer activation fetches tiles. Reuse capture and URL checks; bind existing captures without reacquiring |
| `mutable/web-article-block` | Wikipedia resource paste → `webArticleBlock` | Retained article revision/assets and source identities. Separate existing-capture binding from `encyclopedia.import` |
| `mutable/citation-block` | Academic citation paste → `citationBlock` | Trusted scholarly citation, snapshot and retained resource reference; reuse native citation preparation |
| `mutable/academic-resource-block` | Academic identifier import; BibTeX/RIS/EPUB/OCR file or clipboard input | `academicBlock`, `academicCapture`, retained originals, parsed projections; original-resource ownership/integrity required. Read-only original representation is still an authorable Block |
| `mutable/web-resource-block` | Web capture; event/feed files; supported URL-only cards | `webBlock`, validated capture/projection; optional separately admitted thumbnail and user-controlled embeds. Bind captured data; do not fabricate evidence/capture provenance |
| `mutable/structured-resource-block` | File import for structured/code/data/diagram content | Original text, filename, MIME, versioned presentation descriptor; managed original when the native import path requires one. Reuse structured validation; rendering a diagram is distinct from acquiring media |
| `mutable/svg-text-composition-block` | Quill converts native TextBlocks after confirmation, or composes a selected range | Versioned Quill composition owns native text sources, source-role reference carriers and SVG layout. Use Quill's native conversion/clipboard operations; DCP has no composition authoring adapter. Text and annotations remain readable through owned children |
| `resource-information-block` | Native import's resource Surface wrapper | Generated provenance child from the native resource, not arbitrary authored evidence. Shared builder emits it as needed; no model-authored trusted-provenance payload |

Evidence: [resource URL construction](../../src/interchange/resource-url.ts), [resource URI validation](../../src/interchange/uri.ts), [clipboard resource paths](../../src/runtime/mutable-clipboard.ts), [file/resource insertion](../../src/runtime/document-interchange.ts), [managed assets](../../src/runtime/managed-assets.ts), [existing image admission](../../src/interchange/clipboard-images.ts), [PDF](../../src/pdf/block.ts), [IIIF](../../src/iiif/block.ts), [article](../../src/interchange/web-article-block.ts), [citation](../../src/interchange/citation-block.ts), [academic](../../src/academic/block.ts), [web](../../src/web-resources/block.ts), [structured](../../src/structured/model.ts).

### Hosts, compatibility types and existing-content routes

These must be accounted for without advertising render registrations as fresh content constructors:

| Types / category | Actual status and parity treatment |
| --- | --- |
| `document-block` (aliases `main-list-block`, `membrane-block`) | Human New/Open/Import creates a resource root with owner/session/save lifecycle. DCP currently adds contributions to an existing Document. Shared Document creation remains a target operation, requiring the same host/resource authority; a nested arbitrary Document DTO is not an equivalent route |
| `window-block`, `document-window-block` | Created by application launch, floating note, Canvas and Open. Presentation/host records with workspace placement and lifecycle prerequisites. Keep these inventoried as host-context operations, not contribution content |
| `image-background-block`, `video-background-block`, `youtube-video-background-block`, `canvas-background-block` | Background menu replacement/configuration; URL/provider checks, paused/muted state and existing workspace children. Shared workspace operation, not a paragraph child |
| `quill-application-block`, `flint-application-block`, `dialectic-application-block`, `cardex-application-block`, `thesis-application-block`, `desktop-application-placeholder-block` | Application/session shells generated by launch registrations. Parameters include application identity and, where applicable, Document/Entity context. Expose host lifecycle operations only in an authorized host context; do not fabricate sessions through Block JSON |
| `workspace-block`, `workspace-object-bank-block` | Workspace creation/ownership infrastructure. Object bank is generated and validated by host operations. No standalone content constructor |
| `plain-text-block` | Editable compatibility/pilot type; no fresh normal Add Block route found. Existing native copy/restoration is distinct from authoring a new plain-text type |
| `book-block` | Existing/imported container with a real Add blank pages operation. No fresh book menu found. Preserve qualified existing-content copying; expose child creation in the required book context |
| `html-block`, `html-editor-block`, `pdf-block`, `embed-document-block`, `entities-list-block`, `control-panel-block`, `monitor-block` | Compatibility registrations; no fresh production creation operation found in the audited paths. Native preservation/copy may apply where admitted. Do not invent blank creation from the renderer |
| `root-block`, `universe-block`, `context-menu-block`, `error-block`, `unknown-block`, `cyclic-reference`, `document-reference-block` | Root/legacy/diagnostic/reference or host-generated records. No unrestricted fresh content-authoring route. Real references must use native ownership/resolution rather than forged payloads |
| `mutable/opaque-block` | Preservation result for unsupported imports, not a route to instantiate the embedded original type |
| `text-cell`, inline-image representations and generated row/cell/Side shells | Host-created descendants, with their creation exposed through their owning text/composition operation, not arbitrary top-level insertion |

**Copy is a real authoring route:** where the human clipboard can create a fresh occurrence of existing native content, DCP needs an equivalent `clone existing` route using an issued source handle and the same capture/clone/admission checks. That includes compatible existing content without a fresh constructor. Copy eligibility, definition remapping limitations and inert import negotiation must remain identical; a renderer or successful decode alone is not proof that copy is admitted. See [Block selection](../../src/runtime/block-selection.ts), [native clipboard](../../src/block-tree/clipboard.ts), and [clipboard service](../../src/runtime/block-clipboard.ts).

This accounts for the core renderer vocabulary and feature-provided authoring types, including context-dependent children and host records. The missing machine-enforced closure between registrations and human entry points is itself the first architectural gap; it cannot honestly be presented as an existing complete schema catalogue.

## Existing shared foundations and gaps

1. `BlockTypeRegistration` already owns `type`, view, capabilities, optional `create()` and optional `slots`; `BlockApplicationDefinition` already forwards native factories into it. **Gap:** factories are parameterless, most core creation is outside registrations, and slots use predicates rather than discoverable parameter/child schemas.
2. `InsertionPlanner` consults slots, but falls back to permissive container children. `commands.insert` does not turn that into complete type-specific configuration validation. **Gap:** treating either registry lookup or DTO decoding as universal admission would bypass checks currently in menus/services.
3. `TableOperations` already separates prepare/execute; source, resource and widget factories are reusable. **Gap:** other commands combine preparation with selection, focus, dialogs, geometry and immediate mutation.
4. `insertFragment`, `boundedStructuralTransaction`, canonical repository admission, ownership/identity indexes and native protection provide the commit path. **Gap:** these enforce graph/native invariants; they do not replace domain checks for URLs, assets, timer settings, captures or Phosphor data.
5. Interchange has bounded parsers, asset admission and prepared fragments. Its passive import negotiation intentionally makes some active Blocks opaque. **Gap:** universal explicit authoring must call the trusted native creation operation, not remove that import boundary or turn arbitrary model DTOs into trusted fragments.

## Smallest shared contract

Extend the existing native registration boundary with an optional **authoring descriptor**, implemented beside the native operation. Do not add a DCP-owned Block registry or duplicate native factories.

The descriptor needs: operation identity and purpose; context/destination eligibility; a declarative parameter schema; child and owned-relation slot descriptions; native prerequisite/resource requirements; and a `prepare` entry point. Preparation returns a host-owned native fragment or bounded operation plan plus resource dependencies and cleanup—not raw model JSON promoted to a trusted DTO. Native validation remains authoritative.

Illustrative extension to the existing native registration, not an implemented API:

```ts
authoring: {
  operation: 'native.image.create',
  purpose: 'Place visual evidence or an illustration in native content',
  parameters: nativeImageInputSchema,
  slots: nativeImageCreationSlots,
  prerequisites: nativeImagePrerequisites,
  prepare: prepareNativeImage
}
```

Those schema/operation values would be owned by the native image service extracted from current creation paths. DCP only supplies validated inputs to it. Existing operations with several resource modes can use a discriminated input union; the catalogue reports each mode's readiness without marking the entire Block type unavailable.

Human commands collect selection, parameter values and consent, call this operation, then perform their existing focus/presentation effects. DCP validates declarations against the **same descriptor**, resolves current source/resource authority, and invokes the **same preparation** without UI gestures. Both use the existing canonical execution path. A family builder may emit rows, cells or Sides; those are not dozens of separate DCP constructors.

Use one generic native-operation form in DCP, with provider schemas derived from these descriptors. Preserve `new:b…` declarations and host-issued `src:…` references. Keep existing paragraph/group/list/table syntax compatible by delegating to the native operations as they migrate. Generated IDs remain provisional; host builders assign and map real identities. Never admit arbitrary `metadata`, `ownedRelations`, trusted captures, repository records or linked definitions merely because a model supplies them.

Nesting uses declared named slots and ordered children. Native builders enforce required children, parent/slot restrictions and configuration; whole-composition validation catches cross-child constraints. Global DCP limits still count every generated native descendant. Configuration schemas belong to native code and are used by the human path too; translating them for provider strict-schema limitations is transport work, not a second authoring system.

Preparation may be asynchronous for resource verification. Recheck context, ownership, revisions, feature availability, cancellation and deadline before a **single bounded native commit** containing the contribution and its semantic effects. Preserve existing source fences, immutable submitted content, manual saving and Undo/Redo. No discovery, schema-building or resource verification belongs on the typing path.

Interactive content needs explicit qualification: setting initial task/timer/3D state is authoring; playback, Surface flipping and viewing need not rewrite it. Existing canonical protection already rejects base payload edits inside submitted contributions. Controls that attempt such edits must respect that state rather than display mutable behavior or throw after interaction. This is a shared native presentation obligation, not a DCP-only replacement renderer.

## Resource binding and catalogue correction

Represent four separate routes:

| Route | Required evidence and behavior |
| --- | --- |
| Bind existing managed resource/capture | Resolve from an authorized existing source or supplied native resource context; verify active Cavern, asset/capture identity, integrity/type and availability through native services. No reacquisition merely because DCP lacks a generation adapter |
| Bind external reference | Run the native operation's URL/provider validation. Preserve native player/embed policies; do not claim a locally retained original. A valid reference does not guarantee future remote availability |
| Import/acquire resource | Invoke the existing acquisition service with its prerequisites, consent, cancellation and lease handling. Acquisition and Document insertion are separate effects; a retained capture can outlive a cancelled insertion, as today |
| Generate media | Separate producer capability. Not a prerequisite for binding or importing; no new generation framework proposed |

Existing `read_source` does not expose sufficient resource-binding information for all media. Add bounded native resource descriptors to the relevant current-source reads, backed by the host's source handle. Resolve managed records from host state/services; do not trust model-invented hashes, Cavern IDs or capture objects. Prefer existing Block handles and native references over introducing per-media identity schemes.

Some native URL policies currently differ: Add Image permits references that Canvas's portable-image route rejects, while explicit image-resource paste requires managed acquisition. These are **different operations**, not one interchangeable promise. Initially preserve and describe each route; any unification must update both human and DCP behavior and be reviewed explicitly.

The catalogue should enumerate native authoring descriptors, with separate fields for **native authorable**, **DCP route implemented**, **context/feature enabled**, and **resource/input readiness**. A resource-backed operation can be authorable while currently needing a resource. A missing shared operation is an explicit implementation gap, not intrinsic media unavailability. Detail schemas, examples, child rules and resource modes come from the native descriptor. Preserve compact initial discovery, bounded details and existing tool budgets; page/filter the larger vocabulary instead of sending every schema initially.

## Parity invariant and qualification

For each active human-authoring operation, supported owner/destination context and valid prerequisite set, the native contract must provide an equivalent DCP route using the same preparation and admission. Structural child types are covered by their owner operation; existing-only types by the qualified clone route; host-only records by explicit host operations. A Document-scoped exchange does not acquire workspace or other-Document authority merely to satisfy a count.

Enforce two independent coverage checks: every human creation action/command declares its native authoring operation; every such operation has a DCP route or a named, failing parity gap with its exact prerequisite/missing extraction. A test comparing a DCP list to another hand-written DCP list would not establish parity. Registration of a new human creation route must fail qualification if it lacks coverage.

Reuse existing fixtures to compare human and DCP prepared native results after normalizing newly assigned IDs and UI-only state. Test native types, configuration, required children, resource references and annotation identities—not just visible text. Negative cases should receive equivalent native rejection: malformed children, bad configuration, foreign/deleted resources, forged captures, missing consent/context, stale handles and cancellation. Qualify atomic rollback, Undo/Redo, save/reload, feature removal, submitted-content protection, retained media mounts and Desktop/Textual behavior. Use bounded-work counters for reads, scans, snapshots, network activity and unrelated typing updates.

## Bounded implementation sequence for review

| Stage | Work and gate |
| --- | --- |
| 1. Native contract and coverage closure | Add descriptor/preparation support to existing registrations. Catalogue all human entry points with context and explicit missing-operation records. Move a representative text/grid/external-reference path through the contract for both callers. Introduce the generic DCP adapter behind a disabled-until-qualified flag; no claim of universal completion |
| 2. Complete native composition families | Move existing code/source, lists/tasks, tables/grids, Surface/Side, tabs/pages/margins, sticky/widget and Phosphor preparation into the shared path. Reuse factories, extract UI closures, and qualify native immutable interaction. No per-type DCP builders |
| 3. Existing-resource and import parity | Share resource binders/capture preparation and native copy admission. Separate existing-resource readiness from acquisition. Preserve native asset validation and explicit active-resource preparation; qualify media lifecycle and atomic insertion |
| 4. Context closure and activation | Account for Document/resource roots and workspace/host operations through their native authority contracts. Document-scoped DCP keeps its boundary; any host-operation exposure requires explicit authorized host context. Close or explicitly review every remaining parity gap, then enable the qualified capability and update the catalogue |

Stage 1 is a foundation, not permission to stop at a permanently curated subset. Stages 2–4 must retain the complete inventory as the coverage target. Shared native operations should be delivered in small reviewable families; schemas and factories must not be copied into DCP. No general intention validator, new identity system or media-generation framework is required. Markdown fallback resumes only after this native approach is established, for interoperability or genuinely unsupported expression.

## Investigation validation and limits

Source audit plus nine existing native/resource test files: **84 passed, 3 failed (87 total)**. The failures are in `features/timer/timer.test.tsx`: disposal expects no fallback mount, toolbar ownership assumes timer is first, and action-count expectations assume one entry. They were observed on the current working tree; this investigation did not change runtime code or diagnose their historical introduction. Record and resolve them during native lifecycle qualification, rather than reporting timer parity as passed.

No live provider calls, application restart, new authoring implementation or Markdown-fallback implementation was performed. The earlier Increment A changes remain intact. Review requested: the native-registration extension, preservation of separate resource routes, context-aware parity coverage, and the four bounded stages above.
