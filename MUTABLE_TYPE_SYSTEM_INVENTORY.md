# Mutable OS — Block and Standoff Type System Inventory

Date: 19 November 2026. Repository revision inspected: `db3ed30`.

This is a source-based architectural inventory of the checked-out implementation. It introduces no production changes, TEI element mappings, or converter design. “Supported” is qualified below: retaining an authored value, registering a renderer, providing editing commands, accepting clipboard interchange, and indexing saved data are separate capabilities.

## 1. Scope, evidence, and principal findings

The current application uses the reactive editor, a canonical content/placement repository, and registered Solid views. The older `src/blocks` classes and `src/library/types.ts` remain valuable compatibility evidence, but neither their enum nor their schemas are a complete description of the current application. The still older JavaScript editor under `src/library/original` is a historical implementation, not the current type registry. Its additional annotation vocabulary must not be assumed to work in Ink.

The inventory covers all types registered by the current core/application assembly, native inline atoms, retained package records, the SQLite-only Proposition Block, and relevant declared or compatibility-only names. UI applications are distinguished from document content. Arbitrary unknown strings remain representable, so there cannot be a closed inventory of every *serializable* type name.

Key findings:

- A Block's authored `type` is an open string. Current behavior is selected through `BlockRegistry`; it does not require a corresponding TypeScript class or enum member.
- Block Properties and standoff properties are separate ordered arrays of extensible records. Most built-in Block Properties are presentational, but actual semantic and spatial Block Properties also exist.
- A TextBlock is normally `standoff-editor-block`. Its canonical content is an ordered sequence of Unicode code-point Cells and image Cells. `text-block` is not the registered name of this editor.
- Reverse content is an existing composition of `surface-block`, `side-block`, and ordinary content. There is no registered `reverse-block` or `ReverseBlock` class.
- Ordinary tabs are structural Block children. Experimental alternative readings use `text/superposition` plus owned relation TextBlocks; they are not arbitrary inline Block atoms.
- One standoff segment belongs to one TextBlock. Shared annotation definitions can associate segments in several Blocks. Interactive cross-Block selection has stricter structural limits than the storage model.
- Document-local `entity:` Glosses and canonical SQLite Entities are different systems. No implemented general mapping or promotion between their identities was found.
- Zero-width annotations exist, but two incompatible endpoint conventions are currently used. They are not uniformly supported across editing, rendering, and saved indexing.
- Generic native persistence is more permissive than clipboard import, HTML/Markdown export, and scoped history restoration. Adding a type to one registry does not enable it in all those paths.

Primary entry points: [type records](src/block-tree/types.ts), [registry](src/block-tree/registry.ts), [core registrations](src/rendering/register-core-views.ts), [application assembly](src/application/features.ts), [feature defaults](src/configuration.ts), [legacy enum and DTOs](src/library/types.ts), [native persistence](src/persistence/native-resource.ts).

Status labels used below:

| Label | Meaning |
| --- | --- |
| Current | A concrete implementation is wired into current core/application composition, subject to its feature flag. |
| Generic compatibility | The name is registered, but uses a generic container or shared fallback rather than its former specialized behavior. |
| Experimental | Implemented but explicitly opt-in or constrained as an experiment. |
| Retained/data-only | Persisted or consumed as data without an ordinary editable Block view. |
| Legacy/declaration | Found in older classes, declarations, or callers, without corresponding current specialized support. |

Classification uses **S** = structural, **P** = presentational, **M** = semantic. This is an architectural classification, not a stored enum.

## 2. Common Block model and persistence

### 2.1 Authored content, placement, and occurrence

The current model has three distinct identities:

1. `ContentRecord`: one canonical Block definition, with `viewType`, authored `payload`, child placements, inline placements, owned relations, opaque relations, and revisions.
2. `PlacementRecord`: a location or reference to content, with `kind: owned | reference | inline`, durable `placementId` where applicable, and optional external-reference provenance.
3. `BlockNode`: one projected occurrence in one view. `NodeKey`, runtime `ContentKey`, and runtime `PlacementKey` are not substitutes for authored Block IDs in persistent references.

Shared content can have multiple reference occurrences. Editing shared content affects its occurrences; caret, focus, scroll, active face, and other view state can remain occurrence-local. Canonical ownership and retained definitions determine persistence, not which occurrences happen to be mounted or visible. See [types](src/block-tree/types.ts), [projection](src/block-tree/projection.ts), [resource registration](src/block-tree/resource-registration.ts), and [definition ownership](src/block-tree/definition-ownership.ts).

Common authored data is an extensible payload containing `id`, `type`, `metadata`, `blockProperties`, and type-specific fields such as `checked`, `text`, `pdf`, or `object3D`. Structure is stored separately in canonical records. `children` is ordered; `ownedRelations` is a named collection of owned placements; `opaqueRelations` preserves uninterpreted relation data. `wireChildren` and `wireRelation` preserve omitted/null/present distinctions.

There is no universal enforced child grammar attached to all types. Most core registrations with `container` capability receive an unrestricted `children` insertion slot. `SlotSpec` can describe acceptance, cardinality, role, and persistence, but the generic planner does not replace validation by specialized operations. Tables, tab commands, native persistence, and resource ownership enforce additional constraints independently. A view may also ignore stored children or properties even though the repository preserves them. See [insertion planner](src/block-tree/insertion-planner.ts) and [Block outlet](src/rendering/block-outlet.tsx).

### 2.2 Three representations that must not be conflated

| Representation | Shape and important behavior | Sources |
| --- | --- | --- |
| Legacy nested JSON | `{id,type,metadata,blockProperties,children,relation,...}`; standoff text is a string plus `standoffProperties`. Decoder expands code points into Cells. Only `leftMargin`, `rightMargin`, and names beginning `superposition:` are recognized as owned relations by this decoder; other relation values remain opaque. | [codecs](src/block-tree/codecs.ts) |
| Native Mutable Document | `{format:"mutable-document",version:1,resourceId,valueEncoding,document,definitionOwnerBlockIds}`. Inner document uses `codex-portable-resource-gate`, version 1 or supported native version 2, with Block definitions and explicit edges. A Block has `id`, `type`, `properties`, optional `children`, `relations`, and `inline`. `properties` is the whole authored payload bag, **not** the Block Property array. Native inline atoms are text runs and images. | [native-resource](src/persistence/native-resource.ts), [portable codec](src/history/stage-c-gates/portable.ts) |
| Mutable interchange fragment | Local Block, placement, definition, embed, and typed-target tables; standoff ranges use half-open `startIndex/endIndex` and an explicit point flag. Materialization allocates identities and admits only supported active semantics; other values become opaque carriers. | [fragment](src/interchange/fragment.ts), [serializer](src/interchange/serializer.ts), [materializer](src/interchange/materialize.ts) |

Native authored bags use `codex-authored-value-v1`, which preserves distinctions that ordinary JSON would lose. Reserved envelope fields are validated separately from extensible authored bags. Native persistence accepts unknown authored types when structural and ownership invariants hold; a missing renderer is not a reason to discard data. The legacy tree exporter cannot faithfully represent all native inline or reference structures: inline images can raise `LegacyExportLossError`, or become alt text only through an explicitly lossy route.

The native codec currently imports modules whose paths/comments still say “spike” or “gate.” Those names do **not** mean these paths are unused: [native-resource.ts](src/persistence/native-resource.ts) directly imports them. File extensions and transport wrappers are also not the schema; inspect the envelope through [compatible-document.ts](src/persistence/compatible-document.ts).

Document Save is explicit. This inventory does not alter the project's manual-save contract or introduce sidecars. Saving and export may capture/validate a whole resource; typing must not do so.

## 3. Block type inventory

Unless a row states otherwise, common IDs, metadata, and property arrays are available as described above. “Children” describes implemented composition and interpretation, rather than promising every possible child is accepted by every editing command.

### 3.1 Documents, structural containers, text, and pages

All names in this table are registered in [register-core-views.ts](src/rendering/register-core-views.ts).

| Exact type | Purpose, children/content | Relevant properties and metadata | Current editing/rendering and classification | Implementation references |
| --- | --- | --- | --- | --- |
| `document-block` | Canonical document/resource container. Ordered content Blocks plus owned relations and retained definitions. | `metadata.documentId`, title, folder/filename, format metadata; root `linkedAnnotations`; common Block Properties. | Current. Document view, toolbar/presentation integration, manual save, dirty state and resource ownership. **S/M/P**. | [container view](src/rendering/container-block-view.tsx), [formatted view](src/features/document-formats/view.tsx), [legacy Document](src/blocks/document-block.ts), [save](src/application/document-save.tsx) |
| `main-list-block`, `membrane-block` | Legacy document names. | Authored alias can survive native encoding. | Current aliases resolve to `document-block`; not separate semantic classes. **S/M**. | [viewTypeFor](src/block-tree/codecs.ts), [native type preservation](src/history/stage-c-gates/portable.ts) |
| `container-block` | General grouping of arbitrary ordinary Blocks; used for compound list items, reverse notes, and grouped passages. | `metadata.structuralContainer`, optional height; `metadata.htmlListItem`; optional `checked`. | Current generic container plus grouping/dissolve and task behavior. No intrinsic section ontology. **S**, optionally **M/P**. | [GenericContainerView](src/rendering/core-block-views.tsx), [surface/group commands](src/runtime/block-surfaces.ts), [class](src/blocks/container-block.ts) |
| `standoff-editor-block` | Main rich TextBlock: inline text/image Cells, independent standoff annotations, optional child Blocks such as nested lists, owned marginalia and alternative readings. | `standoffProperties`, `blockProperties`, `checked`, imported heading/code/list metadata. Legacy DTO has `text`; native content uses inline atoms instead. | Current native editing, selections, IME, split/join, formatting, annotation SVG, Undo/Redo. **S/M/P**. | [view](src/rendering/standoff-editor-view.tsx), [commands](src/block-tree/commands.ts), [legacy class](src/blocks/standoff-editor-block.ts) |
| `plain-text-block` | String-based text, with child/relation Block outlets. | `text`; common properties. | Current native text control; UTF-16 text selection, not a Cell-based standoff host. **S/P**. | [view](src/rendering/plain-text-block-view.tsx), [class](src/blocks/plain-text-block.ts) |
| `standoff-code-block` | Code container whose direct children are ordinary TextBlocks. | `metadata.markdownCode.language`. | Current. Editable child text; syntax is derived into temporary ranges, not persisted formatting. JavaScript, TypeScript, Markdown parsers; unsupported language/content falls back to plain presentation. **S/P/M**. | [runtime](src/runtime/standoff-code.ts), [view](src/rendering/standoff-code-view.tsx) |
| `code-mirror-block` | Legacy code-string editor with children. | `text`. | Partial compatibility: current `CodeBlockView` is a textarea and explicitly says CodeMirror integration is being migrated. **P/S**. | [CodeBlockView](src/rendering/core-block-views.tsx), [legacy class](src/blocks/code-mirror-block.ts) |
| `horizontal-line-block` | Separator with optional child/relation content. | No required specialized fields. | Current `<hr>` presentation; produced by Markdown input transformation. **P/S**. | [HorizontalLineView](src/rendering/core-block-views.tsx), [Markdown input](src/runtime/markdown-input.ts) |
| `page-block` | Page-shaped container of content Blocks and margin relations. | Common appearance; margin/minimap presentation supplied by host. | Current article/page view, margin indicators and optional minimap. It is not a facsimile canvas or automatic pagination model. **S/P**. | [PageView](src/rendering/core-block-views.tsx), [page layout](src/rendering/page-layout.ts), [class](src/blocks/page-block.ts) |
| `book-block` | Legacy book of page Blocks, particularly fixed-size pages. | Common properties, page state in legacy children. | Generic compatibility. Older class has two-page navigation; current registry renders ordinary children without that specialized book interaction. **S/P**. | [legacy book](src/blocks/book-block.ts), [GenericContainerView](src/rendering/core-block-views.tsx) |
| `fixed-size-page-block` | Legacy fixed-size book page, containing ordinary Blocks. | Legacy size/active metadata and Block Properties. | Generic compatibility; no distinct current fixed-page view. **S/P**. | [FixedSizePageBlock in book file](src/blocks/book-block.ts), [core registration](src/rendering/register-core-views.ts) |
| `left-margin-block`, `right-margin-block` | Containers conventionally attached through `relation.leftMargin/rightMargin`. | Common properties; old marginalia style properties. | Generic content view, with special placement supplied by relation/margin infrastructure. Independent editable descendants. **S/P**. | [relation outlets](src/rendering/block-outlet.tsx), [margins](src/rendering/document-margins.ts), [legacy margin construction](src/blocks/document-block.ts) |
| `embed-document-block` | Legacy external-document embedding container. | Legacy `filename`; children when materialized. | Generic compatibility in the current registry. A `filename` alone is not a current native external-reference binding. **S/M**. | [legacy class](src/blocks/embed-document-block.ts), [core registration](src/rendering/register-core-views.ts) |
| `sticky-note-block` | Note-shaped container with arbitrary child content. | `metadata.colour`, `material`, `fontStep`, `size.{width,height}`. | Current editable descendants and resize/material presentation. Floating notes can instead be ordinary Documents hosted in windows; these are separate mechanisms. **S/P**. | [sticky view](src/rendering/sticky-note.tsx), [sticky lifecycle](src/runtime/sticky-notes.ts) |

### 3.2 Lists, tasks, and tables

| Exact type | Purpose and child structure | Properties/metadata | Editing/rendering and classification | Sources |
| --- | --- | --- | --- | --- |
| `indented-list-block` | Ordered or unordered list. Children can be direct TextBlock items, compound `container-block` items, task/checkbox items, and legacy adjacent nested lists. An item's children can contain another list. | `metadata.htmlList.{ordered,start,reversed}`; item `metadata.htmlListItem.value`; item `metadata.listCollapsed`. | Current markers and collapse controls; prefix conversion, indent/outdent, empty-item exit. No separate ordered-list/unordered-list/list-item type is required by this implementation. **S/M/P**. | [ListView](src/rendering/core-block-views.tsx), [text lists](src/runtime/text-lists.ts), [list plan](src/block-tree/list-wrap-plan.ts), [class](src/blocks/indented-list-block.ts) |
| `checkbox-block` | Legacy standalone or list task wrapper containing ordinary Blocks. | Top-level `checked`. | Current checkbox and editable descendants. Native tasks also use `checked` directly on TextBlocks or Containers; CheckboxBlock is not required for every task. **S/M/P**. | [tasks](src/runtime/tasks.ts), [CheckboxView](src/rendering/core-block-views.tsx), [class](src/blocks/checkbox-block.ts) |
| `table-block` | Table of `table-row-block` children. | Optional `metadata.tableColumns:{version:1,weights}`. | Current tabular layout and explicit operations; rectangular structure required by commands. Weights are maintained as data but not yet a column-resize/rendering feature. **S/P/M**. | [table operations](src/runtime/tables.ts), [TableView](src/rendering/core-block-views.tsx), [legacy tables](src/blocks/tables-blocks.ts) |
| `table-row-block` | Row of `table-cell-block` children. | Common payload. | Current row rendering and row operations. **S**. | [TableRowView](src/rendering/core-block-views.tsx), [table operations](src/runtime/tables.ts) |
| `table-cell-block` | Cell owning an independent flow of Blocks; can contain text, lists, media, nested tables or other compound content. | `metadata.htmlTableCell.{header,colSpan,rowSpan}`. | Current content outlet; header role recognized. Non-unit spans are retained but unsupported by structural commands; HTML import flattens merged cells with diagnostics. **S/M/P**. | [TableCellView](src/rendering/core-block-views.tsx), [HTML import](src/interchange/html-import.ts), [table operations](src/runtime/tables.ts) |
| `grid-block` | Parallel legacy table family, with grid rows. | Same operational width metadata as tables. | Current shared `TableView`; not an unrelated spatial grid engine. **S/P**. | [grid classes](src/blocks/grid-block.ts), [table families](src/runtime/tables.ts) |
| `grid-row-block` | Grid row containing grid cells. | Common payload. | Current shared row renderer. **S**. | [grid classes](src/blocks/grid-block.ts), [core registration](src/rendering/register-core-views.ts) |
| `grid-cell-block` | Grid cell containing a Block flow. | Common payload; shared cell metadata interpretation. | Current shared cell renderer/operations. **S/P**. | [grid classes](src/blocks/grid-block.ts), [core registration](src/rendering/register-core-views.ts) |

Table operations reject incompatible family shapes, spans, unsafe shared ownership, and removal of shells with retained authored information or known references. Renderability alone does not establish editability. A table with preserved span metadata is not evidence of a working merged-cell editor.

### 3.3 Tabs, alternatives, and reversible surfaces

| Exact type | Purpose and child structure | Properties/metadata | Editing/rendering and classification | Sources |
| --- | --- | --- | --- | --- |
| `tab-row-block` | In-document tab set of `tab-block` children. | Row orientation; panel name/text and active metadata seed. | Current tabs; current selection is view-local. Text-tab command wraps a TextBlock, or copies one into a new tab when already inside a tab. **S/P**. | [TabRowView](src/rendering/core-block-views.tsx), [text-tabs](src/runtime/text-tabs.ts), [tab commands](src/runtime/tab-commands.ts), [classes](src/blocks/tabs-block.ts) |
| `tab-block` | One tab panel containing arbitrary Blocks. | `metadata.name`, `text`, `active`; can participate in document-tab targeting conventions. | Current panel and descendants. **S/P**. | [TabPanelView](src/rendering/core-block-views.tsx), [tab classes](src/blocks/tabs-block.ts) |
| `document-tab-row-block` | Document-oriented tab set. | Row orientation, panel metadata. | Current shared tab-row view; application document sessions can supply title/target behavior. **S/P**. | [document tab plan](src/block-tree/document-tab-plan.ts), [document tab classes](src/blocks/document-tabs-block.ts), [tab orientation](src/block-tree/tab-orientation.ts) |
| `document-tab-block` | Panel containing document content or a document-view target. | Panel naming/active data and target descriptor understood by tab plan. | Current shared panel view; canonical Document and host/presentation identity remain distinct. **S/P/M**. | [TabPanelView](src/rendering/core-block-views.tsx), [document tab plan](src/block-tree/document-tab-plan.ts) |
| `sticky-tab-row-block` | Colored edge-label tab set. | Child label/color metadata. | Current specialized sticky labels and active panel selection. **S/P**. | [StickyTabRowView](src/rendering/core-block-views.tsx), [classes](src/blocks/sticky-tab-block.ts) |
| `sticky-tab-block` | One sticky-tab content panel. | Legacy metadata includes text/html, color/backgroundColor, side and x/y. Current view uses plain label text and colors; it does not reproduce every old HTML/placement behavior. | Current shared panel with sticky-row presentation. **S/P**. | [sticky classes](src/blocks/sticky-tab-block.ts), [current views](src/rendering/core-block-views.tsx) |
| `surface-block` | Reversible owner, normally front and back `side-block` children. Legacy multi-face data can also be retained. | `metadata.reversible`; child roles. | Current retained front/back rendering behind `reversibleBlocks`. Create/group/unwrap/delete are structural edits; flipping is occurrence-local presentation. **S/P**. | [surface runtime](src/runtime/block-surfaces.ts), [reversible view](src/rendering/reversible-surface.tsx), [legacy classes](src/blocks/surface-block.ts) |
| `side-block` | One surface face; contains original Block or Container on front and ordinary notes/content on back. | `metadata.surfaceRole: front | back`; legacy active flag. | Current generic container within surface. Reverse is a role of a face, not a new type. **S/P**. | [surface composition](src/runtime/block-surfaces.ts), [resource wrapper](src/interchange/resource-surface.ts) |
| `resource-information-block` | Supporting resource attributes/source controls on reverse. Normally created with no children. | `blockProperties` contains `codex/block-reference` pointing to resource Block. | Current read-only source/attribute inspector and portal target for viewer controls. It does not own a second authoritative resource record or provide a generic child editor. **M/P**. | [ResourceInformationView](src/rendering/reversible-surface.tsx), [factory](src/interchange/resource-surface.ts) |

There is **no registered inline-tab Block type**. The ordinary tab system places tab rows in Block structure. The source-range alternative mechanism is catalogued under `text/superposition` in §5. It stores an alternative in `ownedRelations["superposition:<id>"]`, rather than inserting a TabBlock among character Cells. The native codec explicitly allows only text/image atoms in a TextBlock.

The default-enabled reverse feature retains both mounted faces, making the inactive face inert. It preserves selection/focus/scroll memories without writing an active-face flag on every flip. With that feature disabled, the older `FlippableSurfaceView` path differs and can author `metadata.active`. Legacy load conversion is documented in [legacy-surfaces.ts](src/interchange/legacy-surfaces.ts); it is an in-memory compatibility conversion, with disk persistence deferred to explicit Save.

### 3.4 Media, source, and resource Blocks

Resource capture fields and assets are authored data. Viewer activation, page/zoom position, network handles, and loaded rendering objects generally belong to the mounted occurrence. Most specialized resource views are opaque widgets, not native child-Block editors. Newly acquired resources can be wrapped in an ordinary reversible surface.

| Exact type | Purpose/content and children | Important authored data | Rendering/editing status and classification | Sources |
| --- | --- | --- | --- | --- |
| `image-block` | Block image with child content supported by the shared view. | Managed `asset`, or legacy `metadata.url`/`filename`; `metadata.alt`; Block size/position. | Current image rendering; image bytes are not a text range. **P/M**. | [ImageView](src/rendering/core-block-views.tsx), [class](src/blocks/image-block.ts), [managed assets](src/interchange/managed-asset.ts) |
| `iframe-block` | External embedded resource, no ordinary child editor in its view. | `metadata.url` or `url`, title, height, `resourceEmbed`. | Current iframe view; resource embedding policy is distinct from authored HTML text. **P/M**. | [IframeView](src/rendering/core-block-views.tsx), [embed policy](src/web-resources/embed.ts), [class](src/blocks/iframe-block.ts) |
| `html-editor-block`, `html-block`, `pdf-block` | Legacy aliases sharing iframe behavior, rather than three native rich editors. | URL metadata interpreted by IframeView. | Partial compatibility. In particular, `pdf-block` is not the managed PDF model below. **P/M**. | [registrations](src/rendering/register-core-views.ts), [IframeView](src/rendering/core-block-views.tsx) |
| `youtube-video-block` | Legacy YouTube embed. | `metadata.url`. | Current specialized URL-derived YouTube iframe. **P/M**. | [YouTubeView](src/rendering/core-block-views.tsx), [class](src/blocks/youtube-video-block.ts) |
| `mutable/video-block` | Provider video descriptor. | `video` parsed by `passiveVideo`; provider, ID, title/start information where supplied. | Current behind `documentInterchange`; valid descriptor loads provider player in current view. **P/M**. | [video view](src/rendering/video-block-view.tsx), [URI model](src/interchange/uri.ts) |
| `youtube-player-block`, `vimeo-player-block` | Compatibility names using the descriptor-based video view. | Same `video` contract, not merely a legacy URL. | Current behind `resourceUrlPaste`; unsupported descriptor is retained and reported without loading a player. **P/M**. | [registration](src/rendering/register-core-views.ts), [video view](src/rendering/video-block-view.tsx) |
| `mutable/markdown-source-block` | Exact Markdown source string, source editor and preview/conversion actions. | `text`, `sourceFormat:{version:1,format:"markdown",profile:"mutable-markdown-source-v1"}`, metadata/source links. | Current behind interchange flag. Native string editing; annotations on source are not automatically native rich-text annotations. **M/P**. | [source schema](src/interchange/source-block.ts), [source view](src/rendering/source-block-view.tsx) |
| `mutable/html-source-block` | Exact HTML source, analogous source/preview/conversion workflow. | HTML variant of `sourceFormat`, original string and metadata. | Current. Preview/conversion sanitization is independent of retained source. **M/P**. | [source schema](src/interchange/source-block.ts), [source preview](src/interchange/html-source-preview.ts), [view](src/rendering/source-block-view.tsx) |
| `mutable/pdf-document-block` | Managed immutable PDF capture and PDF.js viewer. No editable native child flow. | `pdf`: version, snapshot/identity/entity/resource IDs, sourceUrl/endpoint/retrievedAt, asset, inspection; Block Entity references and resource annotations. | Current registered view; page/text extraction and region-note controls. **M/P**. | [PDF model](src/pdf/model.ts), [factory](src/pdf/block.ts), [view](src/rendering/pdf-block-view.tsx) |
| `mutable/iiif-manifest-block` | Captured IIIF manifest, canvases/images presented in viewer. | `iiif` capture, source URL, asset, identities, rights/attribution, canvas IDs; resource annotations. | Current; viewer availability controlled by IIIF flag. **M/P**. | [IIIF model](src/iiif/model.ts), [factory](src/iiif/block.ts), [view](src/rendering/iiif-block-view.tsx) |
| `mutable/iiif-image-block` | Captured IIIF image/service representation. | Same capture family with image kind/dimensions; managed asset and IDs. | Current companion to manifest view; region authoring uses supported canvas context rather than arbitrary pixel semantics on every ImageBlock. **M/P**. | [IIIF model](src/iiif/model.ts), [view](src/rendering/iiif-block-view.tsx) |
| `mutable/web-article-block` | Captured encyclopedia article projection. | `article` snapshot, HTML in `text`, source URL, provenance/license/permalink, diagnostics, links, Entity references. | Current read-only resource presentation; explicit derivative import is separate from source capture. **M/P**. | [factory](src/interchange/web-article-block.ts), [view](src/rendering/web-article-block-view.tsx), [capture](src/interchange/encyclopedia.ts) |
| `mutable/citation-block` | Scholarly citation and source record. | `citation` capture/metadata and asset; source URL; Block Entity reference. | Current citation presentation/actions; not a specialized TextBlock. **M/P**. | [factory](src/interchange/citation-block.ts), [scholarly model](src/interchange/scholarly.ts), [view](src/rendering/citation-block-view.tsx) |
| `mutable/web-resource-block` | Shared captured web resource: ordinary sites, Maps, social and everyday providers. Provider is data, not another Block type. | `web:{version,snapshotId,source,capturedAt,asset,projection}`; status/diagnostics, metadata/social/location/everyday projection. | Current behind `webResourceViewers`; provider-specific presentation and activation. **M/P**. | [model](src/web-resources/model.ts), [registry](src/web-resources/registry.ts), [everyday providers](src/web-resources/everyday.ts), [view](src/rendering/web-resource-view.tsx) |
| `mutable/academic-resource-block` | Deterministic scholarly/OCR/EPUB capture. | `academic` capture and projection: ORCID, arXiv, PMID, PMCID, ISBN, BibTeX, RIS, ALTO, PAGE, EPUB; citations, metadata, OCR regions/lines/words, chapters/navigation, assets. | Current behind `deterministicAcademicResources`; source inspection, exports/derivatives, annotation controls. Format variants are not separate Blocks. **M/P**. | [model](src/academic/model.ts), [factory](src/academic/block.ts), [view](src/rendering/academic-resource-view.tsx) |
| `mutable/structured-resource-block` | Stored structured/source text with bounded projection. | `text`, `structured:{version:1,filename,presentation}`; presentations JSON, YAML, CSV, TSV, source, Mermaid. | Current behind `structuredResources`; trees/tables/code/diagram view. XML here is source text, not a dedicated document-structure type. **M/P**. | [model](src/structured/model.ts), [parser](src/structured/parse.ts), [view](src/rendering/structured-resource-view.tsx) |

There is no separately registered `audio-block`, facsimile page Block, music Block, or provider-specific Block for every supported web service. Audio/podcast or similar content can be handled inside the web-resource provider mechanism. That does not establish a general editable audio/transcript alignment type.

### 3.5 Workspace, hosts, applications, and widgets

These names are part of Mutable OS's Block vocabulary but should not be mistaken for ordinary textual document structure.

| Exact type | Children/content, data, and purpose | Current behavior and classification | Sources |
| --- | --- | --- | --- |
| `universe-block` | Legacy top-level manager/container; arbitrary children. | Generic compatibility in reactive view; original Universe class had orchestration responsibilities now distributed across services. **S**. | [Universe class](src/universe-block.ts), [registration](src/rendering/register-core-views.ts) |
| `workspace-block` | Workspace roots, hosts, backgrounds, and object bank. | Generic container plus workspace persistence/presentation infrastructure. **S/P**. | [workspace session](src/application/workspace-session.ts), [legacy class](src/blocks/workspace-block.ts) |
| `root-block` | Legacy abstract/root container designation. | Generic compatibility. **S**. | [enum](src/library/types.ts), [abstract class](src/blocks/abstract-block.ts), [registration](src/rendering/register-core-views.ts) |
| `workspace-object-bank-block` | Retains canonical resources/objects independently of visible host occurrences. | Current specialized non-reading-order bank; resource-registration references are private retention, not semantic ownership. **S**. | [view](src/rendering/workspace-object-bank.tsx), [resource registration](src/block-tree/resource-registration.ts) |
| `window-block` | Generic floating host containing content/application Blocks. Metadata includes title, position, size, state, icon, zIndex and pinning. | Current window management, resize, maximize/minimize; session manager can own live geometry. **S/P**. | [WindowView](src/rendering/core-block-views.tsx), [window manager](src/application/window-manager.ts), [class](src/blocks/window-block.ts) |
| `document-window-block` | Document-oriented window host with child Document or document-view integration. | Current shared window renderer plus document chrome/presentation; host identity is not resource identity. **S/P**. | [WindowView](src/rendering/core-block-views.tsx), [document sessions](src/application/document-sessions.ts), [class](src/blocks/document-window-block.ts) |
| `document-reference-block` | Placeholder for unavailable workspace Document; `metadata.documentId`. | Current retry/relink/remove-window recovery UI. Distinct from an ordinary authored standoff Block reference and from a native reference placement. **M/P**. | [view](src/rendering/document-reference-view.tsx), [workspace persistence](src/reactive-editor/workspace-manifest.ts) |
| `canvas-block` | Legacy/content canvas holding Blocks. | Current `CanvasPreviewView`; not the same as the whole-workspace Infinite Canvas presentation. **S/P**. | [CanvasPreviewView](src/rendering/core-block-views.tsx), [class](src/blocks/canvas-block.ts) |
| `image-background-block` | Background media layer and child content, URL metadata. | Current stable background wrapper with image media. **P/S**. | [background renderer](src/rendering/background-media.tsx), [class](src/blocks/image-background-block.ts) |
| `video-background-block` | Video background and children. | Current stable media layer. **P/S**. | [background renderer](src/rendering/background-media.tsx), [class](src/blocks/video-background-block.ts) |
| `youtube-video-background-block` | YouTube background and children. | Current stable media layer. **P/S**. | [background renderer](src/rendering/background-media.tsx), [class](src/blocks/youtube-video-background-block.ts) |
| `canvas-background-block` | Background surface with children and appearance metadata. | Current stable surface, with behavior chosen by background renderer. **P/S**. | [background renderer](src/rendering/background-media.tsx), [class](src/blocks/canvas-background-block.ts) |
| `timer-block` | Opaque timer widget. `timer` contains duration, idle/running/paused mode, deadline or remaining milliseconds; Block size/position. | Current feature; authored actions use Undo, clock ticks remain local. No child editor. **P/M**. | [feature](src/features/timer/index.tsx), [model](src/features/timer/model.ts) |
| `3d-object-block` | Opaque object; `object3D:{version,scene,view,autoRotate,lighting,settings}` and Block size. Current scene is coffee cup. | Current feature with WebGL and companion surface effects. No general arbitrary-scene import contract or child flow. **P**. | [feature](src/features/three-d-object/index.tsx), [model](src/features/three-d-object/model.ts), [content definition](src/features/three-d-object/definition.ts) |
| `canvas-counter-block` | Small control with authored `count`. | Current qualification/pilot feature activated with Canvas workspace; opaque widget, not a text structure. **P/M**. | [feature](src/features/canvas-counter/index.tsx) |
| `flint-application-block` | Composite document application with session-managed document views/tabs and panels. | Current feature application. Its live UI composition is not a sequence of textual child Blocks. **S/P**. | [feature](src/features/flint/index.tsx), [application capability adapter](src/application/document-application-capabilities.tsx) |
| `phosphor-screen-block` | Screen containing one plain-character `standoff-editor-block`; screen settings constrain columns/rows, glyph encoding, layout/tab/scroll. | Current specialized character-screen editing. Child annotations include `phosphor/*`, tags and Entity references. **S/P/M**. | [model](src/features/phosphor/model.ts), [application](src/application/phosphor.tsx) |
| `thesis-application-block` | Host for canonical Proposition authoring/search, usually inside WindowBlock. | Current SQLite-backed application UI; not itself a proposition's textual content. **P/M**. | [application](src/application/thesis.tsx), [feature model](src/features/thesis/model.ts) |
| `cardex-application-block` | Host for Entity cards; metadata may include independent mode, Entity ID and vault. | Current canonical Entity editing application, not a document-local Entity Block. **P/M**. | [application](src/application/cardex.tsx), [Cardex feature](src/features/cardex/view.tsx) |
| `desktop-application-placeholder-block` | Placeholder panel identified by `metadata.application`. | Current registered placeholder retained for saved compatibility even when shortcuts are off. **P**. | [desktop applications](src/application/desktop-applications.tsx) |

### 3.6 Compatibility UI names, inert data, and non-types

| Exact name | Actual status and content behavior | Sources |
| --- | --- | --- |
| `entities-list-block` | Registered generic container; legacy Entity-list class exists. Current Entity Reference list is feature-owned UI rather than restoration of this class's behavior. **S/P**, generic compatibility. | [legacy class](src/blocks/entities-list-block.tsx), [Entity feature](src/features/entity-references/index.tsx), [registration](src/rendering/register-core-views.ts) |
| `context-menu-block`, `control-panel-block`, `monitor-block` | Each registered as a generic container with children/relations. Legacy menu/control/annotation-monitor behavior is not supplied by these registrations; current UI has separate components/services. **P/S**, generic compatibility. | [legacy context menu](src/blocks/context-menu-block.tsx), [control panel](src/components/control-panel.tsx), [legacy monitor](src/blocks/monitor-block.tsx), [registrations](src/rendering/register-core-views.ts) |
| `error-block`, `unknown-block` | Explicitly registered names use generic container rendering. Separately, an *unregistered* type uses `UnknownBlockView`, showing its type and descendant content. Unknown payload is retained, but not all of it is displayed. **P/S**, compatibility. | [registrations](src/rendering/register-core-views.ts), [unknown view](src/rendering/unknown-block-view.tsx), [outlet](src/rendering/block-outlet.tsx), [legacy error](src/blocks/error-block.ts) |
| `cyclic-reference` | Projection placeholder rendered by UnknownBlockView; not a content class that legitimizes native owned cycles. **P**, runtime placeholder. | [projection](src/block-tree/projection.ts), [registrations](src/rendering/register-core-views.ts) |
| `mutable/opaque-block` | Inert interchange carrier, `original:{type,data,target?}` plus optional preview and preserved structure. Explicit current view; no automatic execution of original type. **M/P**, retained data. | [materializer](src/interchange/materialize.ts), [opaque view](src/rendering/opaque-clipboard-view.tsx) |
| `mutable/package-data-block` | Retained document-owned frozen package/SQLite context: version/readOnly/packageContext. Usually has no reading-order placement. No ordinary core view registration. **M**, retained data. | [document context](src/interchange/package/document-context.ts), [native package handling](src/interchange/package/native.ts), [package data](src/interchange/package/data.ts) |
| `mutable/proposition-block` | Actual SQLite Block typename for independently authored Proposition text, associated with a separate Entity of typename `Proposition`; `resourceGuid` is null. Direct standoff properties stored in SQLite. Not a registered native document Block view. **M**, specialized canonical storage. | [proposition service](src/knowledge-sqlite/propositions.mjs), [migration](src/knowledge-sqlite/migrations/mutable/0008-propositions.sql), [Thesis model](src/features/thesis/model.ts) |
| `text-cell` | Canonical inline atom with exactly one Unicode code point in `payload.text`; no children/relations. Text runs coalesce on native wire. **S**. | [codecs](src/block-tree/codecs.ts), [native atoms](src/history/stage-c-gates/portable.ts) |
| `image-cell` | Canonical inline image atom, one position in the Cell sequence; asset/source/alt/dimensions/status as appropriate. Not a top-level ordinary Block registration. **S/P/M**. | [inline descriptor](src/block-tree/types.ts), [materializer](src/interchange/materialize.ts), [standoff view](src/rendering/standoff-editor-view.tsx) |
| `block-menu` | Old enum member; current menus are UI. No core Block registration by this name. | [enum](src/library/types.ts), [block menu](src/components/block-menu.tsx) |
| `style-bar-block`, `sticky-tab-label-block`, `abstract-block`, `client-block` | Primarily CSS/legacy UI identifiers found in implementation; not additional registered current content types. | [style bar](src/components/style-bar.tsx), [sticky classes](src/blocks/sticky-tab-block.ts), [abstract class](src/blocks/abstract-block.ts) |
| `portal-block`, `text-block` | Names appear in compatibility/eligibility checks but have no current core/application registration. Do not count those checks as an implementation. | [spatial actions](src/application/spatial-actions.ts), [document capabilities](src/application/document-application-capabilities.tsx), [registrations](src/rendering/register-core-views.ts) |
| `ReverseBlock`, `TextBlock`, `SourceBlock`, `PackageDataBlock` | Human-facing conceptual names, not exact additional registered type strings. Use the corresponding concrete strings above when inspecting saved data. | Sources in the corresponding inventory rows. |

### 3.7 Feature availability

At the inspected revision, the relevant defaults are enabled for reversible Blocks, task lists, tables, vertical tabs, resource viewers/import, document formats, Entity references, Gloss authoring/presentation/relationships/graph/argument/navigation, inline character surfaces, Timer, 3D objects, Flint, Phosphor, Thesis and Cardex. `textSuperposition` defaults **false**. `canvasWorkspace` and `spatialWorkspace` default false in the shared configuration, with hosts able to opt in. `blockHistory` and `nativeKnowledgeSaved` also default false; they must not be confused with ordinary Undo/Redo or with the separately enabled SQLite lifecycle.

Registration and viewer availability can differ: PDF and IIIF types are registered by core, while their operational controls can check separate feature flags. These are build/session configuration decisions, not serialized type inheritance. See [configuration](src/configuration.ts), [application assembly](src/application/features.ts), and each resource view.

## 4. Block Property system

### 4.1 Definition, storage, interpretation, and serialization

The old DTO defines `BlockPropertyDto` with optional `id`/`blockGuid`, a string `type`, optional string `value`, and extensible `metadata`. The legacy `BlockProperty` class also serializes `isDeleted`. `IBlockPropertySchema` supplies CSS decoration, initialization/destruction events, rendering, animation, and library helpers. These executable schemas are application code, not serialized instances.

The current repository stores `payload.blockProperties` as authored records. Native serialization preserves the array inside the Block's authored `properties` bag; the legacy codec preserves it in the nested DTO. The reactive renderer does not instantiate the old schema class for every property: [blockAppearance](src/rendering/appearance.ts) handles a known presentation subset, while specific views interpret semantic/spatial types. Mutation uses ordinary canonical commands. SQLite's derived `BlockProperty` rows retain ordinal, authored/derived identity, typename, scalar/raw value, tombstone and attributes.

Sources: [DTO/schema interfaces](src/library/types.ts), [legacy instance](src/library/block-property.ts), [shared old schemas](src/properties/block-properties.ts), [appearance interpreter](src/rendering/appearance.ts), [saved projection](src/knowledge-sqlite/saved-projection.ts), [SQLite schema](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql).

There is no single current registry providing validation, editing, rendering, persistence, querying and reference remapping for every Block Property type. The runtime's `PropertyTypeDefinition` registry is chiefly a **range-rendering** mechanism and should not be mistaken for such a universal Block Property system.

### 4.2 Inventory of defined and recognized Block Property types

| Exact type(s) | Meaning and data | Current interpretation/status |
| --- | --- | --- |
| `block/alignment` | `value`: left/right/center/justify. | Current `blockAppearance` text alignment; toolbar writes this form. |
| `block/alignment/left`, `block/alignment/center`, `block/alignment/right` | Older fixed alignment types. | Current compatibility cases in appearance interpreter. |
| `block/alignment/justify` | Older fixed justified alignment. | Legacy schema and restore allowlist exist; **no matching case in current blockAppearance**. Prefer not to infer parity with `block/alignment` value `justify`. |
| `block/font/size` | Size token `h1`–`h6`, normal, half, three-quarters, or CSS-like value. | Current font-size/line-height interpretation; heading tokens are visual and do not themselves create a section tree. |
| `block/font/size/h1`, `block/font/size/h2`, `block/font/size/h3`, `block/font/size/h4` | Old heading-sized text classes. | Current compatibility cases. No separately defined `/h5` or `/h6` property type in this schema set. |
| `block/font/size/half`, `block/font/size/three-quarters` | Small-size class tokens. | Current appearance/class handling; old schemas also exist. |
| `block/indent` | Numeric string in 20-pixel steps. | Current margin-left styling. Separate from actual nested list structure. |
| `block/rotate` | Degrees in `value`. | Current transform; potential composition with other positioning transforms depends on the host. |
| `block/size` | `metadata.width`, height, min-width. | Current common appearance and specific widget size consumers. Different widgets can clamp/interpret sizes. |
| `block/position` | `metadata.x`, y, position. | Current appearance/positioning consumers. Not a semantic parent relation. |
| `block/margin` | `metadata.top/right/bottom/left`. | Current appearance handles all four; old shared implementation only applied top. |
| `block/margin/top/20px`, `block/margin/top/40px` | Fixed top margin. | Current compatibility cases. |
| `block/theme/glass`, `block/theme/paper` | Container/window theme classes. | Current appearance classes; old window/menu schemas. |
| `block/draggable` | Old initialization hook; stores position and dragger in metadata. | Legacy executable behavior. Current window/positioned dragging is separately implemented; no general reactive dispatch for this property. Runtime dragger objects are not an appropriate portable authored value. |
| `block/vines` | Old decorative vines plugin. | Legacy Block schema/plugin only; no equivalent current appearance case. |
| `block/animation/sine-wave` | Old animated paragraph effect. | Legacy schema invokes Universe animation; not current generic Block Property rendering. |
| `block/blue-and-white` | Old color theme class. | Legacy schema; not current blockAppearance case. |
| `block/background/image` | Image URL in value. | Legacy initialization sets CSS background; not the same as ImageBackgroundBlock or current resource image. No current general appearance case. |
| `block/background/colour`, `block/font/colour` | Color in value. | Legacy schemas; no current common appearance cases. |
| `block/marginalia/left`, `block/marginalia/right` | Old alignment classes for margin content. | Legacy schema. Current marginalia placement uses owned relation names and margin infrastructure. |
| `codex/entity-reference` | Block-level semantic Entity association; string Entity GUID, often metadata with entityName/sourceSnapshotId. | Current resource factories use it on PDF, IIIF, citation/article and derivative Blocks. Multiple instances may describe different associated Entities. Consumer coverage is not identical to textual mentions. |
| `codex/block-reference` | Block-level target Block ID. | Current `resource-information-block` uses it to locate its resource; typed copy/remapping code recognizes it. This is a reference, not ownership. |
| `mutable/resource-annotation` | Resource-space note: `id`, `anchor`, `value`, metadata origin/createdAt. | Current PDF/IIIF views store these in **blockProperties**, not standoffProperties. Anchors are snapshot-bound and coordinate-versioned. |
| `mutable/academic-annotation` | Academic resource note with OCR polygon or EPUB-fragment anchor. | Current academic view stores/interprets it in blockProperties; fragment materializer explicitly recognizes validated anchors. |
| `mutable/opaque-block-property` | Inert imported property retaining original type/data/typed target. | Current interchange preservation carrier. Not reactivated merely by registering original type later. |
| `block/font-size`, `block/alignment/left ` (trailing space) | Compatibility values explicitly retained by scoped restore; trailing-space spelling is a known template typo. | Restore recognition does not imply rendering. Current appearance ignores these exact names. |

Inventory sources: [appearance](src/rendering/appearance.ts), [legacy StandoffEditor Block schemas](src/blocks/standoff-editor-block.ts), [Document schemas](src/blocks/document-block.ts), [Window schemas](src/blocks/window-block.ts), [restore allowlists](src/block-tree/restore-properties.ts), [PDF factory](src/pdf/block.ts), [IIIF factory](src/iiif/block.ts), [resource information](src/interchange/resource-surface.ts), [academic annotations](src/rendering/academic-resource-view.tsx), [materializer](src/interchange/materialize.ts).

### 4.3 Semantic capacity and limits

**Can properties express structural roles independently of Block classes?** They can carry such an assertion, because type/value/metadata are open and survive native persistence. Existing semantic references demonstrate this capacity. However, no generic section/paragraph/verse-role property interpreter or structural-role ontology was found. Actual tree structure remains children/owned relations; a property does not automatically alter containment, validation, selection or navigation. Existing structural-role conventions also live in metadata (`htmlListItem`, `htmlTableCell`, `surfaceRole`) and top-level fields (`checked`), not only in Block Properties.

**Can independent properties coexist?** Yes. It is an ordered array without a universal one-property-per-type restriction. Several independent semantic assertions can coexist on a Block. Convenience formatting commands commonly replace a chosen style type; that UI behavior is not a storage restriction. Conflicting visual properties are interpreted in source order by `blockAppearance`, with later assignments winning. Unlike standoff style filtering, that function does not universally skip `isDeleted` properties, which is a compatibility inconsistency.

**Can they reference Entities, Blocks, or external resources?** Yes, but reference semantics are consumer-specific. Entity and Block references above are implemented. Resource annotations point into captured resources. Managed assets use `{kind:"managed",cavernId,assetId:"sha256:…"}` elsewhere in payloads. Ordinary string URLs can be retained, but arbitrary fields do not gain identity resolution or copy remapping automatically. The interchange format has typed URL/local/external targets; native external Block/definition/asset descriptors are a separate model. Native save preserves unknown data, whereas untrusted fragment import can deliberately make an otherwise familiar property opaque.

## 5. Standoff Property system

### 5.1 Data model and coordinates

A direct native annotation conventionally has:

```json
{"id":"property-id","type":"style/bold","start":0,"end":3,"value":"","metadata":{}}
```

`start/end` are **inclusive Cell indices** for an ordinary range. Optional data includes cached `text`, `attributes`, top-level effect parameters, `isDeleted`, and older `clientOnly`. The current generic record representation is broader than the legacy `StandoffPropertyDto` TypeScript interface. Unknown authored fields are preserved by native storage.

The Cell sequence, not UTF-16 offsets or DOM nodes, addresses a TextBlock. One text Cell is one Unicode code point; a combining grapheme can span Cells and an image occupies one Cell. Interactive range APIs validate coordinate systems and grapheme boundaries where required. `TextRangeSnapshot` and replacement APIs use half-open boundaries, converting to inclusive stored endpoints. Plain/source-string controls have UTF-16 ranges and do not thereby become Cell-based standoff hosts.

See [TextRanges](src/runtime/text-ranges.ts), [range application](src/runtime/range-annotations.ts), [native atoms](src/history/stage-c-gates/portable.ts), [search coordinate mapping](src/runtime/canonical-search-source.ts), and [legacy instance serialization](src/library/standoff-property.ts).

A linked segment adds `annotationId`. Shared `{id,type,value,metadata,attributes,...}` lives in its owning Document's `linkedAnnotations` map; segment identity and local start/end remain on the TextBlock. Resolution overlays the shared definition while retaining the segment's ID/range and combining deletion status. Explicit `externalDefinition` provenance can identify another resource's definition. Missing/ambiguous definitions must not be guessed. See [linked model](src/block-tree/linked-annotations.ts) and [linked runtime](src/runtime/linked-annotations.ts).

Native serialization retains annotations in the Block authored bag; the native serializer can refresh an existing cached `text` excerpt at Save/export. Legacy tree export filters `clientOnly`; temporary editor decorations have their own session stores and are not document annotations. Do not assume every serializer treats `clientOnly` identically: the native bag encoder does not apply the legacy filter as a universal property rule.

### 5.2 Complete current/compatibility standoff vocabulary

The following tables enumerate active schemas, feature-specific annotations, and meaningful legacy-only spellings/callers found outside the archived original JavaScript implementation. A namespace prefix alone does not register behavior.

| Exact type(s) | Meaning and parameters | Current behavior |
| --- | --- | --- |
| `style/bold` | Bold emphasis. | Cell font weight. |
| `style/italics` | Italic emphasis. | Cell font style. |
| `style/underline` | Ordinary text underline. | Cell text decoration, distinct from semantic SVG underlines. |
| `style/strikethrough`, alias `style/strike` | Deletion/strike presentation. | Shared line-through style. Presentation alone does not encode an editorial deletion event. |
| `style/superscript`, `style/subscript` | Raised/lowered smaller text. | Current Cell style. |
| `style/uppercase` | Uppercase presentation. | CSS transformation; stored characters are not rewritten. |
| `style/highlight` | Pink background emphasis. | Current Cell background. |
| `text/colour`, alias `style/color` | Explicit foreground color in value. | Current value style. |
| `text/background-colour` | Explicit background color in value. | Current value style, overriding class-style highlight color. |
| `style/highlighter` | SVG region highlighting. | Current range geometry overlay. |
| `style/rainbow` | Multicolored underline. | Current SVG; allocates wider underline lane. |
| `style/rectangle` | Range outline. | Current SVG region outline. |
| `style/spiky` | Spiky range decoration. | Current SVG. |
| `style/blur` | Blur amount. | Current region effect; differs from old wrapper-class implementation. |
| `style/glow` | Radius/intensity. | Current Cell shadows. |
| `style/chromatic-aberration` | Offset/intensity, supported direction configuration. | Current colored shadow effect. |
| `style/motion-blur` | x/y parameters. | Current region effect. |
| `style/ghost` | OffsetX/offsetY/blur/opacity. | Current shadow effect. |
| `style/grayscale`, `style/sepia`, `style/invert` | Amount. | Current region filters. |
| `style/contrast-brightness` | Contrast/brightness. | Current region filter. |
| `style/grain`, `style/turbulence` | Frequency/octaves/opacity/seed. | Current noise effects. |
| `style/ink-bleed` | Spread/intensity/roughness. | Current Cell shadow and noise combination. |
| `amber-crt` | Bloom/halo/scanlines/noise/smear. | Current amber screen effect; exact name has no `style/` prefix. |
| `style/show-hide` | Concealed/revealed presentation of retained source ranges. | Current projected visibility mechanism. Grouping/session selection is a separate transient mechanism. |
| `style/character-surface` | One-Cell visual replacement, metadata renderer/dimensions/settings. | Current static-capital or bundled Initialis bitmap rendering; retains underlying text identity. Invalid/unsupported settings retain text fallback. |
| `style/flip`, `style/mirror` | Legacy range-wrapper transformations. | Declared `deferred: "range-wrapper"` in current style schema; do not claim full current wrapper behavior from old implementation or toolbar presence. |

Formatting sources: [style schemas and composition](src/rendering/standoff-styles.ts), [effect geometry](src/rendering/decorations.ts), [standoff view](src/rendering/standoff-editor-view.tsx), [shared renderer registration](src/rendering/visual-effect-renderers.tsx), [character surfaces](src/rendering/static-character-surface.ts), [Initialis controller](src/features/initialis/controller.ts), [show/hide projection](src/runtime/show-hide-projection.ts), [effect parameter contracts](src/block-tree/restore-properties.ts).

| Exact type | Semantics/data | Current support and limits |
| --- | --- | --- |
| `codex/entity-reference` | Textual mention whose value is canonical Entity GUID; direct or linked. Metadata may carry display/source evidence. | Current Entity search/create/reference UI, purple underline, caret emphasis, lists/backlinks and SQLite integration. Does not create an Entity merely by storing a GUID. Also used separately as a Block Property. |
| `codex/block-reference` | Value is authored Block ID; optional `metadata.documentId` identifies resource context. | Current visual underline, typed clipboard/reference handling and knowledge/backlink consumers. Not a new owned edge. |
| `reference/url` | URL in value. | Current link style and explicit source/export handling; interchange admits supported safe URL schemes. No extra ownership or fetched-document semantics. |
| `codex/claim-reference` | Value identifies Claim. | Current red underline, generic annotation data, export/package Claim discovery. SQLite Claim services exist; no full specialized Claim annotation authoring workflow is supplied by this style entry alone. |
| `codex/time-reference` | Temporal-reference ID/value. | Current cyan underline and package/export recognition; structured Time data lives separately in SQLite. |
| `codex/trait-reference` | Older trait/assertion reference. | Current blue underline and legacy schema; no separate current canonical Trait table or end-to-end trait UI established by this type. |
| `codex/meta-relation-reference` | Older meta-relation reference. | Current orange underline and legacy schema; not interchangeable with SQLite Relationship or Gloss link. |
| `mutable/gloss` | Document-local logical Gloss definition and one or more text anchors; raw `type: body` in shared value. | Current authoring, marginalia/Register, local graph and Argument views. Reserved metadata described in §6. |
| `text/superposition` | Source range plus `alternatives`, `active`, `visible`; relation names point to alternative TextBlocks. | Implemented experimental feature, default off. Cannot overlap another superposition on the same source selection. |
| `mutable/opaque-property` | Inert imported original type/data/target, possibly retained linked-definition data. | Current carrier with dotted gray underline when applicable; original semantics deliberately inactive. |
| `codex/search/highlight` | Older persisted/client-only search highlighting. | Current pink style compatibility; normal search/previews should use session decorations. |
| `cell/micro-document` | Old embedded mini-document annotation. | Current schema marks `deferred: "embedded-document"`; old DOM implementation exists. Not a current general inline nested-document capability. |
| `animation/clock` | Old range animation/plugin. | Current schema marks `deferred: "animation-plugin"`; not an active reactive plugin port. |

Semantic/special sources: [Entity feature](src/features/entity-references/index.tsx), [linked annotations](src/runtime/linked-annotations.ts), [style schemas](src/rendering/standoff-styles.ts), [superposition](src/runtime/text-superposition.ts), [Gloss model](src/features/gloss/model.ts), [materializer](src/interchange/materialize.ts), [legacy annotation schemas](src/blocks/standoff-editor-block.ts), [package inventory](src/interchange/package/format.ts).

| Additional exact name(s) | Scope and status |
| --- | --- |
| `phosphor/inverse`, `phosphor/blink`, `phosphor/underline` | Implemented Phosphor screen annotations on its child TextBlock; specialized screen renderer interprets them. Not standard Flint formatting styles. [Model](src/features/phosphor/model.ts), [view](src/features/phosphor/view.tsx). |
| `codex/tag` | Phosphor's free tag annotation type. Data and screen UI support; not a universal semantic taxonomy engine. [Model](src/features/phosphor/model.ts). |
| `codex/document-reference` | Recognized during package-context dependency inventory; no registered general current standoff renderer/authoring feature found. Distinct from `document-reference-block`. [Context inventory](src/interchange/package/document-context.ts). |
| `codex/reference` | Generic fallback name used by the toolbar's linked-annotation prompt; the user can supply other semantic type strings. No specialized resolver attached merely by choosing this spelling. [Toolbar](src/rendering/document-style-bar.tsx). |
| `style/font/size/large`, `style/font/size/small` | Older text-processor replacement rules request these names, but no matching current style schema was found. [Text processor](src/library/text-processor.ts). |
| `animation/spinner` | Legacy workspace caller/sample, without current registered schema. [Legacy workspace](src/components/workspace.tsx). |

`mutable/resource-annotation` and `mutable/academic-annotation` are deliberately **not** listed as ordinary text standoff types: their implemented hosts put them in Block Properties and use resource-space anchors. Temporary `editor/*` labels, syntax ranges, selection highlights, reading/pointer spotlights and caret effects are session presentation sources, not additional persistent standoff types.

### 5.3 Range editing and boundaries

For ordinary annotations, [mapStandoffPropertiesForReplacement](src/interchange/ranges.ts) implements these rules:

- Insertion at the start boundary shifts the annotation right, keeping inserted text outside it.
- Insertion at the end boundary (`end + 1`) stays outside it.
- Insertion strictly inside expands the annotation.
- Replacement/deletion rebases surviving parts; fully consumed annotations are removed from the array.
- Split distributes/clips annotations to the relevant TextBlocks; join/merge rebases local segments. Segment identity, shared definition identity and Block identity are separate concerns.

The annotation editor exposes shift, word shift, expand, contract, delete, and explicit patches. It validates nonempty inclusive ranges within one paragraph. A single-character annotation (`start === end`, without point semantics) is a **one-Cell range**, not zero width. See [annotation commands](src/block-tree/annotation-commands.ts), [split handling](src/block-tree/commands.ts), and [cross-text edits](src/block-tree/cross-text-edit.ts).

### 5.4 Can ranges cross TextBlocks?

One stored segment cannot have its start in one TextBlock and its end in another. A shared logical annotation can instead have one segment per Block, linked by `annotationId`. Generic semantic creation accepts this arrangement; ordinary style application produces independent local ranges. The linked creator explicitly excludes `style/*` and `text/*` types from shared semantic creation.

The interactive cross-Block range path normally requires visible, sibling `standoff-editor-block` occurrences in the same view. It rejects crossing list/page/tab boundaries, media or hidden structural barriers. Explicit Document selection has a separate visible-text traversal. A programmatically assembled linked group is therefore not evidence that an arbitrary drag selection across the whole compound tree is supported. Cross-resource shared definitions require explicit owner/provenance rules; Gloss authoring is more restrictive still.

Sources: [cross-Block selection](src/runtime/cross-block-selection.ts), [linked creation](src/runtime/linked-annotations.ts), [range annotation application](src/runtime/range-annotations.ts), [Gloss target checks](src/features/gloss/controller.ts).

### 5.5 Zero-width annotations: partial support and a concrete inconsistency

Point annotations are implemented in interchange, point-affinity editing, clipping, range events and HTML export. However, their native representation is inconsistent across subsystems:

| Consumer | Expected/produced native point representation |
| --- | --- |
| Fragment serializer/materializer, point replacement/clipping, split handling | `isZeroWidth:true`, `start === end === insertion boundary`, optional `affinity:before|after`. Fragment wire has equal half-open startIndex/endIndex. |
| SQLite saved projection and native knowledge fact collector | `isZeroWidth:true`, `end === start - 1`; rejects the equal-endpoints representation as an invalid point. |
| Native portable cached-excerpt refresh | Special-cases `end === start - 1` to set cached text to empty. |
| SQLite Proposition service | Accepts equal native start/end with `isZeroWidth:true`, translating it to equal UTF-16 SQL endpoints. |
| Ordinary annotation editor and most style predicates | Designed around inclusive nonempty ranges. No general dedicated point-marker UI; equal endpoints can satisfy ordinary range predicates, while end-before-start fails them. |

Sources: [ranges](src/interchange/ranges.ts), [serializer](src/interchange/serializer.ts), [materializer](src/interchange/materialize.ts), [saved projection](src/knowledge-sqlite/saved-projection.ts), [fact collector](src/knowledge/facts-annotations.ts), [portable codec](src/history/stage-c-gates/portable.ts), [Propositions](src/knowledge-sqlite/propositions.mjs), [range events](src/runtime/annotation-range-events.ts), [HTML export](src/interchange/export-plan.ts).

This is a source-demonstrable compatibility gap, not just a missing toolbar button. The report does not normalize or repair it. It would be inaccurate either to say points are unsupported everywhere or to promise reliable point behavior through the entire persistence/index/export pipeline.

### 5.6 Whole-Block targets and overlap

There is no universal standoff `target=whole-block` selector. A range can cover all existing Cells, but edge insertion rules mean it is not a durable whole-Block role. Empty Blocks have no ordinary nonempty range. Use of `blockProperties` is the existing whole-Block attachment mechanism; resource annotations demonstrate nontext targets. A `codex/block-reference` standoff property targets another Block semantically while remaining anchored to a local text range.

Ordinary ranges can overlap, cross and nest independently; no XML-style nesting constraint is imposed. Cell styles merge in annotation order, decoration lines are combined, shadow effects concatenate, and explicit foreground/background colors override class-style colors. SVG underlines allocate lanes for overlapping underline-producing ranges. A new visual effect must decide its own conflict/composition behavior. Superposition is an explicit exception: creation rejects overlapping alternative-reading ranges.

See [style composition/lane allocation](src/rendering/standoff-styles.ts), [range rendering](src/rendering/range-rendering.tsx), [superposition creation](src/runtime/text-superposition.ts), and [renderer contracts](src/runtime/visual-effect-registry.ts).

### 5.7 Compound content interaction

- Tabs contain separate Blocks, with their own text and annotation coordinates. Switching tabs does not flatten their text into one Cell stream. Hidden panels are selection barriers.
- Surface faces likewise contain independent Block trees. Their annotations persist on their respective TextBlocks. Flipping is a presentation change, not an annotation migration.
- Superposition's source annotation addresses the original TextBlock only. Alternative TextBlocks have independent Cells and annotations. The alternative reading is projected visually; source offsets are not rewritten into one combined stream. The generic relation outlet suppresses `superposition:` attachments because the specialized standoff view renders them.
- A table cell, list item, margin, or code child remains a distinct TextBlock when it contains text. Graph traversal for copy/persistence and interactive reading/selection order are not identical.
- Shared Block occurrences share authored annotations but have distinct measured geometry and focus state. Transient effects must attach to the mounted occurrence.

Sources: [tab views](src/rendering/core-block-views.tsx), [reverse view](src/rendering/reversible-surface.tsx), [superposition view](src/rendering/standoff-editor-view.tsx), [relation outlet](src/rendering/block-outlet.tsx), [occurrences](src/block-tree/occurrences.ts).

## 6. Existing compound and semantic mechanisms

### 6.1 Alternative content

Three separate mechanisms already exist:

1. Structural tabs: ordinary Block subtrees in tab panels; copy/new-tab operations support alternative passages without a specialized reading ontology.
2. Reversible surfaces: original content and reverse notes as ordinary Block trees, with explicit grouping/unwrap/delete operations.
3. `text/superposition`: experimental range-level alternatives, with an array of relation names but a current authoring helper that initially creates one empty alternative TextBlock. Source/alternative selection and visibility are authored property fields; this differs from occurrence-local surface flipping.

None of these by itself defines witness identity, an apparatus ontology, endorsement, or semantic equivalence. Those meanings are not implied by visual alternation.

### 6.2 Document-local Entities versus canonical SQLite Entities

The phrase “Document Entities” has two meanings in this implementation:

| Mechanism | Identity and storage | Actual behavior |
| --- | --- | --- |
| Document inventory of canonical Entity references | `codex/entity-reference.value` contains the canonical Entity GUID; inventory derives from mentions and certain Block references. | Local filtering/counting/navigation over references to vault Entities. This is not a document-owned Entity definition table. |
| `entity:` Gloss | Shared `mutable/gloss` definition in Document `linkedAnnotations`; separate `metadata.gloss.localId`. Raw value such as `entity: Leonardo`. | A document-local semantic node. Existing local entity Glosses can be reused on more passages, with independent anchors and local Gloss relationships. No SQLite Entity is created by typing that label. |

Gloss definition shape:

```json
{
  "id":"definition-id",
  "type":"mutable/gloss",
  "value":"entity: Leonardo",
  "metadata":{"gloss":{"version":1,"localId":"logical-gloss-id","links":{}}}
}
```

The `definition-id`, logical Gloss `localId`, segment IDs, Block IDs, and canonical Entity GUIDs are distinct. The Gloss controller reuses a local entity definition without renaming it or copying its relationships. No implemented general Document-Gloss-to-SQLite-Entity mapping table, automatic promotion, or synchronization was found. The Gloss planning document explicitly leaves global identity promotion for later; current source does not add it.

Canonical Entities live in vault SQLite, with unique GUID, extensible typename, name, description, attributes, revisions, attribution and aliases. Names are not unique identities. Entity aliases have curated/observed/recovered/imported origins. Authority identity acquisition (e.g. Wikidata/GND) is implemented at the canonical service boundary, and is separate from local Gloss reuse.

Sources: [document reference inventory](src/features/entity-references/document-entities.ts), [live inventory](src/application/live-document-entities.ts), [Entity API](src/feature-api/entities.ts), [canonical Entity service](src/knowledge-sqlite/entities.mjs), [authority identities](src/knowledge-sqlite/authority-identities.mjs), [Gloss model/controller](src/features/gloss/controller.ts), [Gloss planning](docs/development/glosses/GLOSS_MODE_STAGE_C_INVESTIGATION_AND_IMPLEMENTATION_PLAN.md).

### 6.3 Claims, Relationships, Propositions, and structured observations

| Mechanism | Implemented meaning | Boundary/limitations |
| --- | --- | --- |
| SQLite `Relationship` | Directed Entity-to-Entity edge with GUID, extensible typename, attributes, revision and attribution. Parallel edges/self-loops are supported by canonical semantics. | Not a Block child relation, not a Gloss edge, and not a general n-ary Claim. |
| SQLite `Claim` | Identified n-ary assertion with nullable expression/kind; ordered Entity participants, typed Entity-valued qualifiers, evidence locators. | Claim kinds such as Trait/Event/Opinion/Intention are data, not dedicated Blocks. No automatic promotion from Gloss labels. |
| `ClaimEvidence` | Resource/Block/property identity, source hash, half-open cell/UTF-16 range, excerpt and evidence kind. | Generation-specific locator with stale/missing/unresolved diagnostics; no automatic reanchoring guarantee after source edits. |
| SQLite `Time` | One-to-one extension of Entity identity with raw expression, temporal components, precision/certainty/approximation/extent and optional normalized bounds/profile. | Not the same as a `codex/time-reference` underline. |
| SQLite `DataSet`, `DataPoint`, dimensions and memberships | Structured observations, raw authored values, Entity-valued dimensions, many-to-many DataSet membership. | Services/storage implemented; not new document Block types or a general chart/table authoring UI. |
| Proposition | Independently stored textual Block plus distinct Entity(Proposition), direct annotations, explicit save/archive/restore and optional source provenance through Thesis. | Different from Claim aggregate. `mutable/proposition-block` is not registered as a normal document renderer. |
| Gloss relationship | Directed local Gloss-to-Gloss edge in `metadata.gloss.links`. | Document-local; not copied into canonical Relationship/Claim tables. |

The semantic persistence brief is marked implemented. Actual migrations/services confirm Time, Claim/participants/qualifiers/evidence, DataSet/DataPoint/dimensions/membership, and canonical Entity/Relationship support. Proposition and Cardex migrations further extend the earlier base schema; the original `Block.resourceGuid NOT NULL` declaration alone is therefore an incomplete account of current SQLite Blocks.

Sources: [semantic API](src/feature-api/semantics.ts), [semantic services](src/knowledge-sqlite/semantics.mjs), [semantic migration](src/knowledge-sqlite/migrations/mutable/0002-semantic-knowledge.sql), [Proposition migration](src/knowledge-sqlite/migrations/mutable/0008-propositions.sql), [Proposition implementation](src/knowledge-sqlite/propositions.mjs), [implementation brief](docs/development/MUTABLE_SEMANTIC_PERSISTENCE_PHASE_1_BRIEF.md).

### 6.4 Notes, Glosses, and local argument structure

Notes can be ordinary TextBlocks/Containers, reverse-side content, sticky notes, owned marginalia, resource-space annotations, or Glosses. There is no universal NoteBlock class, footnote numbering model, or one note/reference contract encompassing all these mechanisms.

Gloss labels are parsed at the first colon. The starter vocabulary is:

`entity`, `thesis`, `claim`, `counter-argument`, `evidence`, `premise`, `assumption`, `definition`, `distinction`, `analogy`, `inference`, `question`, `uncertainty`, `objection`, `note`, `for-ai`, `for-reader`.

These are suggestions, not separate standoff types or a closed enum. The actual standoff type stays `mutable/gloss`. Creation currently accepts one nonempty range in one owning TextBlock; a caret can resolve to a word. Borrowed foreign content is rejected. Definitions can have repeated local anchors and survive losing their final anchor; orphan definitions can be edited through the Register.

Gloss relationships are maps keyed by stable edge IDs. Each value contains version, `type`, `toGlossId`, optional metadata, and optional unresolved-target provenance. Suggested predicates are `supports`, `opposes`, `qualifies`, `elaborates`, `references`, `depends-on`, `answers`; custom validated predicates are allowed. Fresh authoring rejects self-links and exact duplicate source/type/target edges, while permitting multiple predicates between a pair. Deleted/missing/ambiguous targets are retained diagnostically. Copy creates new local identities and preserves outside-copy links as explicitly unresolved instead of guessing targets.

Implemented stages include authoring, margin/Register presentation, relationship authoring/repair, Mermaid graph, Argument Explorer and graph navigation. Earlier plan text saying “Stage C unimplemented” is superseded by current implementation and C1–C5 qualification reports. Predicate grouping and cross-Document relationships remain deferred. No graph synchronization to SQLite is present.

Sources: [Gloss model](src/features/gloss/model.ts), [controller](src/features/gloss/controller.ts), [relationship model](src/features/gloss/relationships.ts), [relationship controller](src/features/gloss/relationship-controller.ts), [session index](src/features/gloss/session-index.ts), [Argument model](src/features/gloss/argument.ts), [C1](docs/development/glosses/GLOSS_MODE_STAGE_C1_QUALIFICATION.md), [C2](docs/development/glosses/GLOSS_MODE_STAGE_C2_QUALIFICATION.md), [C3](docs/development/glosses/GLOSS_MODE_STAGE_C3_MERMAID_QUALIFICATION.md), [C4](docs/development/glosses/GLOSS_MODE_STAGE_C4_ARGUMENT_EXPLORER_QUALIFICATION.md), [C5](docs/development/glosses/GLOSS_MODE_STAGE_C5_NAVIGATION_QUALIFICATION.md).

### 6.5 Document structure and hierarchy

Ordered containment already supports nested containers, pages, lists, table cells and tab panels. The tree is meaningful independently of visual styles. There is no current dedicated SectionBlock, paragraph-subtype hierarchy, or generic outline role system beyond these compositions and metadata conventions.

Heading presentation uses `block/font/size` tokens. HTML import additionally retains `metadata.htmlHeadingLevel`; some Markdown paths primarily retain the font-size token. HTML block containers such as section/article/blockquote are processed by a bounded flow importer, not generally preserved as a typed semantic hierarchy. Quotation text can be retained as paragraphs with a diagnostic.

Document formats (`page`, `simple`, `sticky-note`, `journal`, `diary`, `letter`, `card`, `notebook`, `framed`) are ordinary `document-block` arrangements with `metadata.documentFormat:{version,format,template,theme}`. They are not nine extra Block classes. See [format model](src/features/document-formats/model.ts), [HTML import](src/interchange/html-import.ts), [Markdown import](src/interchange/markdown-import.ts), and [native Markdown](src/interchange/markdown-native.ts).

### 6.6 Anchors and cross-Block references

Existing mechanisms must be kept distinct:

- **Structural ownership/reference placement:** explicit graph edges, preserving identity and ownership. External targets carry source resource, target ID, optional placement/route, and unpinned or history-revision provenance.
- **Owned named relations:** marginalia and superposition are established conventions. Native relations can retain arbitrary owned names; legacy nested decoding only recognizes its explicit subset.
- **Standoff/Block `codex/block-reference`:** semantic pointer carried by a property; does not change tree ownership.
- **`metadata.anchor`:** presentation relationship `{version:1,blockId,offset:{x,y}}`. Current authoring resolves a unique target within the same Document; rejects chains, self-targets and ancestor/descendant loops. Missing/ambiguous targets fall back to ordinary flow. This is Block-relative positioning, not a textual point anchor.
- **Shared annotation definition:** `annotationId` and optional external-definition provenance bind local segments to one logical annotation.
- **Resource/evidence anchors:** PDF/IIIF/OCR/EPUB and ClaimEvidence address their own source coordinate systems.

Typed clipboard/reference bookkeeping remaps known IDs. Arbitrary strings in metadata are not recursively replaced on copy. Unknown relation data is preserved without being interpreted as a live link. Sources: [external descriptors](src/block-tree/external-reference.ts), [reference bookkeeping](src/block-tree/reference-bookkeeping.ts), [clipboard](src/block-tree/clipboard.ts), [anchor model](src/features/anchor-relationships/model.ts), [anchor API](src/feature-api/anchors.ts), [saved relation projection](src/knowledge-sqlite/saved-projection.ts).

### 6.7 Facsimiles, image regions, and spatial annotation

Spatial/resource support is implemented, but is specialized by source family:

| Anchor | Coordinates and identity | Storage/behavior |
| --- | --- | --- |
| IIIF canvas | `version:1`, `kind:"iiif-canvas"`, `coordinateVersion:1`, manifest/canvas/snapshot IDs, canvas dimensions, bounded x/y/width/height rectangle. | `mutable/resource-annotation` Block Property; overlapping notes independent; view checks matching snapshot/canvas/dimensions. |
| PDF page | Snapshot/asset, zero-based pageIndex, viewBox, rectangle, coordinateVersion. | Same Block Property type with `kind:"pdf-page"`; PDF-space overlay/extraction, not document Cell indices. |
| OCR page | Snapshot/page IDs, source width/height, polygon points. | `mutable/academic-annotation` with `kind:"ocr-page"`; parsed ALTO/PAGE also retains regions, line/word polygons, confidence and reading order. |
| EPUB fragment | Snapshot, path, fragment. | `mutable/academic-annotation` with `kind:"epub-fragment"`. |
| Block-relative layout | Target Block ID and offset. | `metadata.anchor`; presentation only, independent of image pixel coordinates. |

Sources: [IIIF anchors](src/iiif/resource-anchor.ts), [PDF anchors](src/pdf/model.ts), [shared union](src/resources/resource-anchor.ts), [academic anchors](src/academic/anchors.ts), [OCR projection](src/academic/model.ts), [academic derivatives](src/academic/derivative.ts).

The resource viewers and retained originals provide facsimile-like presentation and source-region notes. A universal arbitrary-ImageBlock polygon model, unified text-to-image alignment graph, or general manuscript facsimile hierarchy was not found. Preserved OCR-derived offsets/polygons should not be assumed to remain synchronized after independently editing imported derivative text.

### 6.8 Provenance and imported metadata

There is broad authored-data capacity and several concrete provenance contracts:

- Generic Block/property metadata and unknown payload fields survive native storage.
- Captured resources retain immutable managed assets, snapshot/source/endpoint/retrieval identity and diagnostics; scholarly/citation/article models add identifiers, license, attribution and revision information.
- Academic citation records retain raw fields/identifiers; OCR retains source coordinates/order/confidence; EPUB retains chapter paths/anchors/navigation.
- Interchange fragments carry provenance and typed local/external references; opaque carriers retain unsupported originals with diagnostics instead of activating guessed semantics.
- Frozen `mutable/package-data-block` context retains selected SQLite data, schema/provenance, exclusions and unresolved references. Import does not reconcile those GUIDs into the destination knowledge database.
- Proposition source provenance records vault/resource/Block identity, source revision/hash, Cell range, captured text and time. ClaimEvidence similarly retains source-generation evidence rather than silently moving its anchor.
- Source Blocks preserve source strings; conversion to editable content is explicit and uses a separate derivative representation.

These are implemented contracts, not one universal provenance ontology. A generic metadata field can preserve an identifier without making it queryable, navigable, remappable or canonical. See [managed assets](src/interchange/managed-asset.ts), [article factory](src/interchange/web-article-block.ts), [academic model](src/academic/model.ts), [fragment](src/interchange/fragment.ts), [package context](src/interchange/package/document-context.ts), [Propositions](src/knowledge-sqlite/propositions.mjs), and [semantic API](src/feature-api/semantics.ts).

## 7. Extensibility assessment

### 7.1 Introducing a Block type

For a normal opaque widget, the implemented first-party extension path is:

1. Define a stable type string and authored payload/default factory, including versioned fields where interpretation may evolve.
2. Implement a Solid view using `BlockRuntime` to read its own authored fields, mutate via core commands, mount its input surface and own cleanup.
3. Register a `BlockApplicationDefinition` through a feature's capability adapter: type, aliases, capabilities, create factory and view. Register commands, bindings and menu actions separately.
4. Activate the feature in application composition and add the appropriate feature switch. Project conventions require substantial new features behind a flag, normally enabled by default.
5. Establish structural, persistence, copy/remapping, history, indexing and export behavior for any new semantics. Generic native storage needs no new per-type serializer for ordinary payload data, but specialized wire structures do.

The public widget runtime is deliberately narrow. It is not a general compound editor API for arbitrary child traversal, relations, text selection or repository access. Compound Blocks may need a justified capability addition or a current internal `BlockTypeRegistration` view. Registrations support slots internally, but registration alone does not establish a globally enforced schema.

Unknown type fallback preserves data if the module is absent. Untrusted interchange, scoped restore, publication and knowledge extraction have separate supported-type policies. A type string present in the renderer registry is not automatically safe or semantically complete in those systems.

Sources: [feature API](src/feature-api/index.ts), [registry](src/block-tree/registry.ts), [feature adapter](src/application/feature-capabilities.tsx), [Timer example](src/features/timer/index.tsx), [feature architecture](docs/architecture/FEATURE_MODULES_AND_BLOCK_APPLICATIONS.md), [Block tutorial](docs/development/CREATING_BLOCK_TYPES.md).

### 7.2 Introducing a Block Property type

Persistence can already retain an unfamiliar type/value/metadata record. To make it operational, define its owner/target meaning, value schema, cardinality and editing lifecycle; add the appropriate consumer and command/UI. A visual property may require an appearance interpreter or a specialized renderer. A semantic reference requires explicit resolution, copy/remap and query behavior. A resource-space property must specify coordinate and source-generation validity.

There is no single registration call that accomplishes all of this. The older `IBlockPropertySchema` hook system is not automatically executed by the current reactive renderer. Extending that old schema object alone does not implement the property in current Ink. Export/materialization/history allowlists and SQLite consumers may need explicit support depending on the promised behavior.

### 7.3 Introducing a Standoff Property type

The data layer can store an arbitrary annotation type on an existing TextBlock. Current extension mechanisms include:

- `RangeAnnotations.apply`: independent, validated local Cell-range creation, with deduplication of exact shared-content ranges.
- `LinkedAnnotations`: shared semantic definitions and per-Block segments; explicit owner/provenance and cross-resource restrictions.
- `AnnotationContribution`: label/action/details UI registration.
- `EffectDefinition`: passive measured geometry contributions.
- `VisualEffectRegistry.registerType`: declarative renderer bindings, parameters, interaction state and named caret-enter/leave handlers. Renderer targets include range overlay, Cell style and character surface; text/viewport presentation effects have separate hosts and are not ordinary property bindings.

Use existing measured fragments and temporary-range infrastructure for transient effects. New annotation types do not need a new character editor. Define whether they are ordinary ranges, points, linked semantics or nontext anchors; the point inconsistency in §5.5 must be accounted for before claiming end-to-end support. Define overlap, split/join/delete, copy, import/export, unresolved target and disabled-feature behavior explicitly.

Sources: [annotation UI](src/runtime/annotation-contributions.ts), [effect contributions](src/runtime/effect-contributions.ts), [visual registry](src/runtime/visual-effect-registry.ts), [range renderer](src/rendering/range-rendering.tsx), [annotation capability adapter](src/application/annotation-capabilities.ts), [effect tutorial](docs/development/CREATING_STANDOFF_EFFECTS.md).

### 7.4 Introducing a semantic role using an existing type

Several existing mechanisms support meaning without a new Block class:

| Existing mechanism | What can vary without a new Block class | What is not automatic |
| --- | --- | --- |
| Ordinary Container/TextBlock plus metadata or Block Properties | Whole-Block assertions, source identity, role labels, structural-container conventions. | Role-aware navigation, validation, export and indexes. |
| `mutable/gloss` | Open `type: body` labels, local semantic nodes and custom relationship predicates. | Global Entity/Claim identity, cross-Document graph or canonical knowledge synchronization. |
| `codex/entity-reference` | References to differently typed canonical Entities. | Creating/resolving an Entity solely from a label. |
| Canonical Entity/Relationship/Claim services | Entity typename, relationship predicate, Claim kind, participant/qualifier role and authored attributes. | Native document rendering and source annotation UI for every semantic kind. |
| Existing tab/surface/list/table composition | Alternative subtrees, reverse notes, grouped content, compound items and cell flows. | Specialized semantics inferred from visual placement. |
| Existing resource Blocks | Provider/format variants and source-specific metadata within their supported schemas. | Acceptance of arbitrary new coordinate systems or formats. |

A class is most relevant when content behavior, containment, interaction or rendering differs materially. A property or role can express an independent assertion without replacing the existing content representation. This is an assessment of current extension boundaries, not a recommendation for any particular TEI construct.

### 7.5 Architectural constraints on all extension paths

- Keep authored IDs distinct from runtime keys and from placement/view identities.
- Preserve one canonical owner and explicit retention/provenance; do not treat references as ownership or mounted visibility as persistence membership.
- Keep text coordinates explicit: Cell, UTF-16, and resource-space geometry are different contracts.
- Preserve unknown authored data while distinguishing it from active executable interpretations.
- Maintain canonical validation, Undo/Redo and per-Document dirty tracking on committed edits. Provisional input and presentation mode changes remain local session work.
- Keep saving, full validation/capture, vault discovery and indexing outside ordinary typing. Bounded work must be demonstrated for changed edit paths, not inferred from use of a transaction API.
- Reuse shared DOM geometry caches, frame-batched reads and existing SVG range decorations; do not introduce a parallel viewport-fixed highlight system.
- Trigger Entity inventories, backlinks and local semantic graph work from actual semantic-source changes, not generic text revisions or offset rebasing.

These constraints follow [AGENTS.md](AGENTS.md), the [range rendering architecture](docs/development/STANDOFF_PROPERTY_RENDERING_ARCHITECTURE.md), and the existing canonical model. They apply equally to an apparently small semantic property and to a new compound Block.

## 8. Known gaps and inconsistencies

| Finding | Evidence and practical consequence |
| --- | --- |
| No authoritative single type catalog | Old enum, core registry, application features, property schemas, native codec, materializer and SQL services each contain part of the vocabulary. This inventory reconciles them; none alone is sufficient. |
| Stored type does not imply specialized renderer | Book/fixed-page/embed-document and old UI names have generic compatibility views. CodeMirror is currently a textarea fallback. Unknown payload is retained without full display. |
| No `ReverseBlock` class or arbitrary inline tabs | Reverse is Surface/Side composition; native inline atom grammar is text/image only. Superposition is a separate experimental range projection. |
| Zero-width endpoint mismatch | Equal endpoints in editing/fragment/Proposition paths versus end=start−1 in saved facts/projection. See §5.5. |
| Nonuniform property consumers | Shared appearance does not implement every legacy schema; fixed justify, background/font colors, animations and some compatibility tokens are examples. Appearance's tombstone filtering is not equivalent to standoff style filtering. |
| Native save versus safe fragment import | Native bags preserve unknown types/fields. Materializer activates a narrower set, strips executable/layout metadata and scopes semantic references; unsupported values become opaque. Even familiar Block-level semantic references can require a trusted resource factory rather than arbitrary pasted data. |
| Restore support is narrower than save support | `restore-properties.ts` has explicit local style allowlists and rejects linked/reference/plugin semantics. A value surviving Save does not establish support for “Restore this Block.” |
| No generic role/section ontology | Containers, heading style tokens and import metadata exist; a general structural-role validator and semantic outline are absent. |
| Local Gloss identity is not canonical Entity identity | No implemented general mapping/promotion/synchronization layer was found. Document Entity inventory is mostly a view of canonical mentions, not local Entity definitions. |
| Cross-Block annotations are segmented | Shared identity exists, but ordinary interactive selection cannot freely cross every compound boundary; Gloss creation is single-range/single-owning-TextBlock. |
| Spatial support is source-specific | PDF/IIIF rectangles, OCR polygons and EPUB fragments exist; they are not a universal image/text alignment model. |
| Tables preserve more than commands support | Header/span metadata can survive; merged cells are flattened on HTML import and excluded from current structural operations. Width weights are not a completed resize presentation. |
| Semantic style names overstate some workflows | Trait/meta-relation/time/claim underlines do not establish full corresponding annotation editors. Canonical semantic services and display schemas are separate. |
| Documentation contains superseded status | Gloss Stage C plan's pending wording is superseded by source and C1–C5 reports. “Gate/spike” codec comments also conflict with current production imports. |
| Graph authoring still has local registry-scale costs | Gloss relationship indexes are incremental and typing avoids graph work, but explicit Gloss definition/edge writes can copy/compare the owning Document registry. C1/C2 reports document this cost; it is not O(1) merely because UI updates are narrow. |
| No universal provenance or external-target interpretation | Metadata preserves data, but typed resolution, remapping and query behavior require implemented consumers. Frozen package context is deliberately not merged into destination SQLite. |

## 9. Concise extension summary

Mutable already provides reusable structural composition, independently attached Block Properties, overlapping local standoff ranges, linked semantic definitions, document-local Gloss graphs, canonical SQLite knowledge, and source-specific spatial annotations. These mechanisms can coexist without introducing a new specialized Block class for each semantic distinction.

The extension boundary is behavior: a new type/property needs explicit consumers only for the capabilities it promises. Generic native preservation is available broadly; editing, semantic resolution, import activation, export, indexing and restoration remain separately defined. The main unresolved compatibility issues for future design review are point ranges, differences among those support paths, and the absence of a general local-to-canonical semantic identity mapping.

## 10. Review method and validation limits

This report was prepared by inspecting registration sites, feature defaults, Block/annotation schemas and their actual consumers, native and legacy codecs, interchange policies, semantic services/migrations, relevant tests, feature briefs and later qualification reports. Repository-wide literal-name searches were used to check for types outside the old enum and central registry; CSS names, MIME types, test-only fixtures and archived original-editor schemas were not mislabeled as current production types.

No production code, settings, database, document corpus or feature flags were changed. The only intended repository addition is this report. No application test suite or browser benchmark was rerun for this documentation-only inventory; statements about prior qualification are attributed to repository reports rather than presented as fresh test results. Current source takes precedence over older planning prose. The zero-width discrepancy and unsupported/deferred cases are static findings, not repaired implementations.
