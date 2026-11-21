# Mutable OS — Standardising Registration Within Each Type Category

Investigation and migration plan • 19 November 2026 • inspected revision `db3ed30`

The filename retains the original requested deliverable name. The user's subsequent clarification supersedes the original brief's references to a universal registry: **Blocks, Block Properties, and Standoff Properties remain distinct categories with separate authoritative registries.** This report proposes no universal registry, document-model rewrite, TEI mapping specification, or production changes.

## 1. Executive recommendation

Standardisation is justified, but its scope differs substantially by category:

| Category | Present authority | Recommended authority | Smallest useful change |
| --- | --- | --- | --- |
| Blocks | `BlockRegistry` governs active reactive view registration, aliases, capabilities and ownership. | Retain and extend `BlockRegistry`. | Add category-specific descriptive discovery; make duplicate legacy declarations consume the same Block definitions through host-specific bindings. Preserve classes, views, factories and structural commands. |
| Block Properties | No comprehensive registry. Appearance switches, old schema arrays and domain consumers identify types independently. | A small, dedicated Block Property definition registry. | Register the existing vocabulary, validators and interpreter references. Initially retain current appearance and domain dispatch unchanged. |
| Standoff Properties | `VisualEffectRegistry` has a partial property-type map; static styles, passive effects, annotation UI and specialised controllers provide other parts. | A dedicated Standoff Property definition authority, extracted/adapted from the existing property-type registration path; keep `VisualEffectRegistry` as the rendering execution service. | Extend the existing standoff registration API to own a descriptive definition and delegate optional bindings to the existing services. Do not register every known type as an executable visual effect. |

The third recommendation is a small separation of responsibilities within existing infrastructure, not replacement of working effect registries. A standoff definition can describe an existing static style, a controller-managed semantic annotation, a deferred legacy feature, or no presentation at all. It need not acquire a new renderer.

Block and Standoff Properties share enough vocabulary to reuse descriptor conventions and small duplicate/alias/diagnostic helpers. They do **not** currently share enough execution infrastructure to justify one property registry or one runtime interface. Keep independent registration APIs, stores, validation and lifecycle contracts. Reassess helper reuse after the two contracts are qualified; abstraction is not a prerequisite.

For each category, one authoritative definition should identify the type and its declared support. Factories, views, editing commands, codecs, security policies and indexes remain separate consumers with explicit responsibilities. Generic rendering is a legitimate declared implementation. Absence from the historical `BlockType` enum is not a defect in a modern registered type.

The first implementation increment should qualify these boundaries and add discovery/coverage tests. Registration-only changes should preserve all authored identifiers and wire representations. Several pre-existing inconsistencies need explicit decisions; they must not become silent fixes bundled into this refactoring.

## 2. Evidence, scope and terminology

This is a source audit of the current reactive application, its feature assembly, non-archived legacy TypeScript implementation and persistence/interchange consumers. The companion [type-system inventory](MUTABLE_TYPE_SYSTEM_INVENTORY.md) describes runtime structures and semantics in more detail. This report adds registration-specific findings, including the legacy EmbedDocument builder collision, additional legacy property callers, the Gloss visual binding and seven Cardex name-field annotation types omitted from that earlier inventory.

Arbitrary unknown type strings are preservable. “Complete” below therefore means the concrete registered, declared, dispatched and meaningful compatibility vocabulary found in these source paths, not every possible string that an old file or user prompt could contain. The archived JavaScript tree under `src/library/original` is not treated as an active registration catalogue. Session decorations, CSS class names and domain Entity typenames are not silently promoted to document types.

Four responsibilities must remain distinct:

1. **Registration:** identify a type, its aliases, support status and available bindings within its category.
2. **Implementation:** a class, function, view or service supplying behaviour. Its age does not establish obsolescence.
3. **Runtime representation:** canonical content/placement records and projected occurrences, property records, or the old DOM-owning class instances.
4. **Rendering/editing:** consumers interpreting records and issuing bounded canonical operations. Registration alone neither edits data nor grants insertion/import permission.

### 2.1 Source keys used in the matrices

These keys keep individual rows readable. A row's source keys, named files and migration recipe together specify declaration, runtime dispatch, dependencies and proposed validation. Paths are repository-relative links.

| Key | Source and responsibility |
| --- | --- |
| BR | [BlockRegistry](src/block-tree/registry.ts), [BlockTypeRegistration](src/block-tree/types.ts): active Block registrations. |
| CORE | [register-core-views](src/rendering/register-core-views.ts): core type/view/capability registrations. |
| APP | [application features](src/application/features.ts), [feature capability adapter](src/application/feature-capabilities.tsx), [feature API](src/feature-api/index.ts): feature activation, ownership and runtime bindings. |
| ENUM | [legacy types](src/library/types.ts): `BlockType`, DTOs and schema interfaces. An enum entry does not register a view. |
| OLD | [legacy workspace builder table](src/components/workspace.tsx), [Universe](src/universe-block.ts), [AbstractBlock](src/blocks/abstract-block.ts): old host assembly, factory selection, live instances. |
| VIEWS | [shared core views](src/rendering/core-block-views.tsx), [Block outlet](src/rendering/block-outlet.tsx), [unknown view](src/rendering/unknown-block-view.tsx). |
| AP | [appearance](src/rendering/appearance.ts): current Block Property interpretation. |
| BP | [old shared Block schemas](src/properties/block-properties.ts), [BlockProperty instance](src/library/block-property.ts). |
| TEXT | [old TextBlock](src/blocks/standoff-editor-block.ts): old Block/Standoff schema arrays and bind/serialization path. |
| DOC | [old Document](src/blocks/document-block.ts): document/margin builders and property schemas. |
| WIN | [old Window](src/blocks/window-block.ts): theme and host-specific schemas. |
| ST | [standoff styles](src/rendering/standoff-styles.ts): static appearance declarations, aliases and style dispatch. |
| VE | [visual-effect registry](src/runtime/visual-effect-registry.ts), [built-in bindings](src/rendering/visual-effect-renderers.tsx): renderer/handler/type-binding registration. |
| FX | [passive effect contributions](src/runtime/effect-contributions.ts), [annotation UI contributions](src/runtime/annotation-contributions.ts). |
| SV | [reactive standoff view](src/rendering/standoff-editor-view.tsx): rendering precedence, cell styles, geometry and interaction. |
| NATIVE | [native resource](src/persistence/native-resource.ts), [portable representation](src/history/stage-c-gates/portable.ts), [compatible loader](src/persistence/compatible-document.ts). |
| TREE | [legacy tree codecs](src/block-tree/codecs.ts): nested DTO decoding/encoding and document aliases. |
| IX | [fragment materializer](src/interchange/materialize.ts), [serializer](src/interchange/serializer.ts), [fragment model](src/interchange/fragment.ts): admission, opaque carriers and typed targets. |
| RESTORE | [scoped property restore](src/block-tree/restore-properties.ts): deliberately restricted restore vocabulary and validation. |
| SQL | [saved projection](src/knowledge-sqlite/saved-projection.ts), [knowledge policy](src/knowledge/policy.ts), [foundation schema](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql). |
| MENU | [Block menu actions](src/runtime/block-menu-actions.ts), [style toolbar](src/rendering/document-style-bar.tsx): constructors, command dispatch and property authoring. |

## 3. Current registration architecture — verified findings

### 3.1 Blocks

`BlockRegistry` is already the authority used by the reactive renderer. Registrations contain `type`, mandatory Solid `view`, optional `create`, capability strings, aliases and optional slots. The registry rejects duplicate type/alias names atomically, tracks ownership, supports disposal/subscriptions, resolves aliases and enumerates by capability. It lacks a general descriptive `list/describe` API and a complete authored schema contract. The default owner string is `legacy`; core registrations using that default do not thereby instantiate legacy classes.

`registerCoreViews` and feature activation populate this registry. `BlockApplicationDefinition` adds an application-facing runtime adapter; feature ownership restricts mutation and disposal. Its self-bound runtime is intentionally narrower than a general tree editor. Extending type discovery must not bypass those ownership checks.

Most core registrations omit `create`. Existing factories in resource modules, menu commands and structural operations remain necessary: loading existing data is not the same operation as constructing a default instance. Table, tab, surface and task commands enforce rules beyond the registry's capability strings. The insertion planner can use slots, but a generic container fallback accepts arbitrary children; registration does not establish a complete child grammar. See [insertion planner](src/block-tree/insertion-planner.ts), [tables](src/runtime/tables.ts), [tabs](src/runtime/tab-commands.ts), [surfaces](src/runtime/block-surfaces.ts).

The older path is materially different. `UniverseBlock.addBlockBuilders` appends an array; `getBlockBuilder` uses first-match lookup. The old Workspace explicitly lists builders. Classes own DOM, children, relations and schema objects. `registerBlock` tracks **live instances**, not types; it must not be removed as a supposedly redundant registry. Current [App](src/App.tsx) uses the reactive application; the old Workspace table remains a separate legacy host path, not the constructor for every current Block.

### 3.2 Block Properties

No current comprehensive Block Property registry exists. Instances are authored records in ordered `payload.blockProperties` arrays. AP interprets a presentation subset; resource views and factories interpret semantic/spatial properties. Old BP/TEXT/DOC/WIN schema arrays supply executable DOM callbacks and classes for the old host. Those callbacks are not automatically suitable for reactive views.

The native codec preserves Block Properties as part of the authored payload. SQL stores typename/value/attributes and ordering without requiring an entry in the old schema arrays. Convenience editing commands can replace a formatting property, but storage permits multiple independent properties, including multiple instances of the same type. A registry must not introduce universal singleton semantics.

### 3.3 Standoff Properties

There are several complementary mechanisms:

| Mechanism | What it actually governs | Why it is insufficient as the whole category authority |
| --- | --- | --- |
| `VisualEffectRegistry` property-type map | Renderer bindings, state overrides, caret handler names; duplicate checks and renderer-parameter validation. | Only a subset of authored types is registered; no complete semantic/value/range schema or aliases/discovery. Also hosts non-property session effects. |
| `standoffStyleSchemas` | Cell CSS, SVG styles, region/noise effects, projection and deferred markers. | An appearance table, not semantic identity, authoring or persistence validation. |
| `EffectContributions` | Feature-supplied passive geometry/SVG effects. | A renderer contribution mechanism; intentionally used as a fallback. |
| `AnnotationContributions` | Toolbar labels/actions/detail components; `get/list` discovery. | UI contributions can be absent for a valid authored annotation. |
| Gloss, superposition, Phosphor controllers | Category-specific semantics and specialised hosts. | They legitimately do more than range decoration. |
| Old `StandoffProperty` and TEXT schemas | Cell-object endpoints, DOM wrapping, plugins and old events. | Different host/runtime representation; not the reactive persistence authority. |

VE validates finite JSON **definitions and effect parameters**, not the entire authored-property data model. A missing named event handler can be diagnosed when invoked; registration does not prove a handler is installed. Text/viewport presentation renderers are explicitly excluded from ordinary property bindings. That boundary should survive consolidation.

The existing standoff registration API is the right integration point to extend. Its current visual-effect definition should become one optional binding associated with a standoff definition, rather than the test of whether a semantic type exists. A small category-specific definition index can be extracted from/adapted around the current type map while retaining its rendering APIs during transition.

### 3.4 Implicit dependencies that constrain the plan

- **Rendering precedence:** SV suppresses legacy annotations when `visualEffects.type(annotation.type)` exists and registry rendering is enabled. Adding an empty visual definition merely for discovery can remove an underline or other presentation. Cell-style and region/noise consumers have additional independent paths. Discovery and active executable bindings need distinct queries before broad registration.
- **Feature fallback:** Entity references register a visual property type, passive effect and annotation UI. These are different responsibilities; the passive effect is useful with the registry-rendering flag off. Removing it as duplicate “registration” can regress supported modes.
- **Knowledge policy:** `typesWithCapability('opaque-widget')` feeds SQL/search extraction policy via application services. Enumerating all known but disabled definitions as active registrations can change extraction without changing the document. Separate known, active, host-applicable and import-admitted states.
- **Native persistence:** NATIVE/TREE preserve unknown payloads without constructing a registered renderer. Do not require registry membership to reload existing Ink.
- **Trust policy:** IX admission allowlists and RESTORE allowlists deliberately support less than generic native retention. “Registered” must not become “safe to activate from clipboard.”
- **Headless use:** codecs, SQLite and import validation need plain data contracts. They must not import JSX views, create a browser editor or activate features merely to discover types.
- **Ownership:** content definitions, placements and mounted occurrences have different identities. Type aliases and default factories cannot rewrite IDs or create new ownership edges during reload.

## 4. Registration coverage matrices

### 4.1 Reading the audit

Classification is relative to **each category's own present registration infrastructure**, not a universal registry:

| Code | Classification |
| --- | --- |
| F | Fully consolidated at the present category registration boundary: an authoritative current entry and no separate competing type registration found. This does not claim complete schemas, every export format, or every historical feature. |
| P | Partially consolidated: current registration plus independently maintained legacy registration/declaration behaviour. The reactive host need not depend on the old host. |
| L | Legacy-only/outside-category-authority: absent from the existing category registry path. For Block Properties, no authority yet exists; **L does not mean obsolete**. Many L rows are actively implemented. |
| I | Inconsistent: concrete identifier or behaviour disagreement relevant to migration. |
| U | Uncertain: caller/declaration evidence without sufficient implementation/registration evidence. |

`E` means an ENUM member; `B` an old Workspace builder-table entry; `C` an old concrete class/schema or direct constructor. No `E` for modern strings is expected. `G` means deliberate generic/shared rendering, `D` dedicated behaviour, `Data` non-view data. Status `active` is subject to existing feature flags. “Compatibility” describes current shared/generic handling, not an approved deprecation policy; no blanket deprecation is inferred.

Persistence column:

- **N:** generic native read/write retains authored type/payload subject to native structure/ownership rules; no per-type codec is required. This is an architectural guarantee of the common path, not an individual end-to-end test of every row.
- **N/L?:** native path as above; an old builder/serializer exists, but lossless old class deserialization is not established. Many `deserialize` methods are stubs; old TextBlock binding demonstrably drops some fields.
- **N/C:** native carrier/retained record; interchange policy and semantics remain limited.
- **SQL:** a distinct SQL representation; not proven portable as an ordinary native Block.
- **Atom:** specialised inline codec, not normal Block creation.

Recipes in §5 apply to every non-F row; they specify files, adapters, impact, tests and independence. F rows need only the additive discovery/contract work in recipe B0, not a new implementation.

### 4.2 Blocks: core structural and text types

Every `CORE` row is currently in BR, including generic views. Additional source links identify the old class or specialised dispatcher.

| Exact identifier | Registration/declaration and dispatch | Implementation/status | Persistence | Class; route |
| --- | --- | --- | --- | --- |
| `document-block` | CORE; E/B; DOC; TREE document alias dispatch | D document view; active | N/L? | P; B1, B2 |
| `main-list-block` | CORE alias of document; TREE/OLD migration | G document alias; compatibility | N; alias retained on native wire | P; B2 |
| `membrane-block` | CORE alias of document; TREE/OLD migration | G document alias; compatibility | N; alias retained on native wire | P; B2 |
| `standoff-editor-block` | CORE; E/B; TEXT; SV; Cell codec/commands | D main text editor; active | N/L?; old bind field loss | I; B1, B3 |
| `plain-text-block` | CORE; E/B; [class](src/blocks/plain-text-block.ts), [view](src/rendering/plain-text-block-view.tsx) | D string editor; active | N/L? | P; B1 |
| `standoff-code-block` | CORE; [runtime](src/runtime/standoff-code.ts), [view](src/rendering/standoff-code-view.tsx) | D child-text code container; active | N | F; B0 |
| `code-mirror-block` | CORE; E/B; [class](src/blocks/code-mirror-block.ts); VIEWS | D current textarea; older CodeMirror implementation | N/L? | P; B1; preserve current editor |
| `horizontal-line-block` | CORE; VIEWS; [Markdown input](src/runtime/markdown-input.ts) | D separator; active | N | F; B0 |
| `checkbox-block` | CORE; E/B; [class](src/blocks/checkbox-block.ts); [tasks](src/runtime/tasks.ts) | D wrapper/task control; active | N/L? | P; B1 |
| `sticky-note-block` | CORE; [view](src/rendering/sticky-note.tsx), [runtime](src/runtime/sticky-notes.ts) | D note container; active | N | F; B0 |
| `universe-block` | CORE; E/C; OLD direct host construction | G current container; old manager implementation | N/L? | P; B1; live manager separate |
| `workspace-block` | CORE; E/B; [class](src/blocks/workspace-block.ts) | G current container; compatibility | N/L? | P; B1 |
| `root-block` | CORE; E (`AbstractBlock`); OLD inherited instance type | G current container; compatibility | N/L? | P; B1; no fabricated factory |
| `container-block` | CORE; E/B; [class](src/blocks/container-block.ts); MENU | G intentional grouping; active | N/L? | P; B1 |
| `book-block` | CORE; E/B; [book classes](src/blocks/book-block.ts) | G current; old two-page interaction separate | N/L? | P; B1 |
| `fixed-size-page-block` | CORE; E/B; [book classes](src/blocks/book-block.ts) | G current; compatibility | N/L? | P; B1 |
| `page-block` | CORE; E/B; [class](src/blocks/page-block.ts); VIEWS | D page/margin layout; active | N/L? | P; B1 |
| `left-margin-block` | CORE; E/B; DOC; relation outlets | G content, specialised relation placement; active | N/L? | P; B1 |
| `right-margin-block` | CORE; E/B; DOC; relation outlets | G content, specialised relation placement; active | N/L? | P; B1 |
| `embed-document-block` | CORE; E; [class builder](src/blocks/embed-document-block.ts) wrongly declares YouTube ID | G current; old factory collision | N; old deserialize throws | I; B3 |
| `indented-list-block` | CORE; E/B; [class](src/blocks/indented-list-block.ts); [list runtime](src/runtime/text-lists.ts) | D lists; active | N/L? | P; B1 |
| `surface-block` | CORE; E/B; [class](src/blocks/surface-block.ts); [reversible view](src/rendering/reversible-surface.tsx) | D reversible/fallback surface; active | N/L? | P; B1; retain flag fallback |
| `side-block` | CORE; E/B; [class](src/blocks/surface-block.ts); surface commands | G face content; active | N/L? | P; B1 |
| `canvas-block` | CORE; E/B; [class](src/blocks/canvas-block.ts); VIEWS | D canvas preview; active | N/L? | P; B1 |
| `table-block` | CORE; E/B; [classes](src/blocks/tables-blocks.ts); [table operations](src/runtime/tables.ts) | D shared table view; active | N/L? | P; B1, structural parity |
| `table-row-block` | CORE; E/B; table classes/operations | D shared row view; active | N/L? | P; B1 |
| `table-cell-block` | CORE; E/B; table classes/operations | D child-flow cell view; active | N/L? | P; B1 |
| `grid-block` | CORE; E/B; [classes](src/blocks/grid-block.ts); table operations | G shared table implementation; active | N/L? | P; B1 |
| `grid-row-block` | CORE; E/B; grid classes/table operations | G shared row implementation; active | N/L? | P; B1 |
| `grid-cell-block` | CORE; E/B; grid classes/table operations | G shared cell implementation; active | N/L? | P; B1 |
| `tab-row-block` | CORE; E/B; [class](src/blocks/tabs-block.ts); [tab runtime](src/runtime/text-tabs.ts) | D tab row; active | N/L? | P; B1 |
| `tab-block` | CORE; E/B; [class](src/blocks/tabs-block.ts); tab runtime | G shared panel; active | N/L? | P; B1 |
| `document-tab-row-block` | CORE; E/B; [class](src/blocks/document-tabs-block.ts); document-tab commands | G shared row; active | N/L? | P; B1 |
| `document-tab-block` | CORE; E/B; [class](src/blocks/document-tabs-block.ts) | G shared panel; active | N/L? | P; B1 |
| `sticky-tab-row-block` | CORE; E/B; [class](src/blocks/sticky-tab-block.ts) | D sticky row; active | N/L? | P; B1 |
| `sticky-tab-block` | CORE; E/B; [class](src/blocks/sticky-tab-block.ts) | G shared panel; active | N/L? | P; B1 |

### 4.3 Blocks: media, hosts and resources

| Exact identifier | Registration/declaration and dispatch | Implementation/status | Persistence | Class; route |
| --- | --- | --- | --- | --- |
| `image-block` | CORE; E/B; [class](src/blocks/image-block.ts); VIEWS | D image view; active | N/L? | P; B1 |
| `iframe-block` | CORE; E/B; [class](src/blocks/iframe-block.ts); VIEWS | G shared iframe view; active | N/L? | P; B1 |
| `html-editor-block` | CORE; E; VIEWS | G iframe compatibility; no old Workspace builder | N | F; B0; no inferred HTML editor |
| `html-block` | CORE; E; VIEWS | G iframe compatibility | N | F; B0 |
| `pdf-block` | CORE; E; VIEWS | G iframe compatibility; distinct from native PDF resource | N | F; B0 |
| `youtube-video-block` | CORE; E/B; [class](src/blocks/youtube-video-block.ts); Embed builder collision | D YouTube view; active | N/L? | I; B3 |
| `window-block` | CORE; E/B; WIN; window runtime | D shared window view; active | N/L? | P; B1 |
| `document-window-block` | CORE; E/B; [class](src/blocks/document-window-block.ts) | G shared window view; active | N/L? | P; B1 |
| `image-background-block` | CORE; E/B; [class](src/blocks/image-background-block.ts); VIEWS | G stable background host; active | N/L? | P; B1 |
| `video-background-block` | CORE; E/B; [class](src/blocks/video-background-block.ts); VIEWS | G stable background host; active | N/L? | P; B1 |
| `youtube-video-background-block` | CORE; E/B; [class](src/blocks/youtube-video-background-block.ts); VIEWS | G stable background host; active | N/L? | P; B1 |
| `canvas-background-block` | CORE; E/B; [class](src/blocks/canvas-background-block.ts); VIEWS | G stable background host; active | N/L? | P; B1 |
| `entities-list-block` | CORE; E/C; [class](src/blocks/entities-list-block.tsx) | G compatibility; old UI implementation | N; old UI round trip unqualified | P; B1/B3 |
| `context-menu-block` | CORE; E/B; [class](src/blocks/context-menu-block.tsx) | G compatibility; current menus separate UI | N/L? | P; B1 |
| `control-panel-block` | CORE; E/C; [class](src/components/control-panel.tsx) | G compatibility; old UI implementation | N; old UI round trip unqualified | P; B1/B3 |
| `monitor-block` | CORE; C; [class](src/blocks/monitor-block.tsx) | G compatibility; old annotation UI | N; old UI round trip unqualified | P; B1/B3 |
| `error-block` | CORE; old [ErrorBlock](src/blocks/error-block.ts) fallback has empty builder type | G named compatibility; old fallback is different | N; old fallback not equivalent | I; B3 |
| `unknown-block` | CORE; old [UnknownBlock](src/blocks/unknown-block.ts) fallback has empty builder type | G named compatibility; unregistered-type fallback separate | N; old fallback not equivalent | I; B3 |
| `cyclic-reference` | CORE; [projection](src/block-tree/projection.ts) | D runtime reference placeholder | N subject to no owned cycles | F; B0; not a cycle exemption |
| `document-reference-block` | CORE; [view](src/rendering/document-reference-view.tsx) | D reference placeholder; active | N | F; B0 |
| `workspace-object-bank-block` | CORE; [view](src/rendering/workspace-object-bank.tsx) | D object bank host; active | N | F; B0 |
| `mutable/opaque-block` | CORE; IX; [view](src/rendering/opaque-clipboard-view.tsx) | D inert carrier; active | N/C | F; B0 |
| `mutable/video-block` | CORE flag; IX; [view](src/rendering/video-block-view.tsx) | D shared video; active | N | F; B0 |
| `youtube-player-block` | CORE flag; [view](src/rendering/video-block-view.tsx) | D shared provider video; active | N | F; B0 |
| `vimeo-player-block` | CORE flag; [view](src/rendering/video-block-view.tsx) | D shared provider video; active | N | F; B0 |
| `mutable/markdown-source-block` | CORE flag; [source types/factory](src/interchange/source-block.ts), [view](src/rendering/source-block-view.tsx) | D source string editor; active | N | F; B0 |
| `mutable/html-source-block` | CORE flag; source types/factory/view | D source string editor; active | N | F; B0 |
| `mutable/pdf-document-block` | CORE; [factory](src/pdf/block.ts), [view](src/rendering/pdf-block-view.tsx) | D captured PDF resource; active | N | F; B0 |
| `mutable/iiif-manifest-block` | CORE; [factory](src/iiif/block.ts), [view](src/rendering/iiif-block-view.tsx) | D IIIF resource; active | N | F; B0 |
| `mutable/iiif-image-block` | CORE; IIIF factory/view | D IIIF image resource; active | N | F; B0 |
| `mutable/web-article-block` | CORE; [view](src/rendering/web-article-block-view.tsx) | D captured article; active | N | F; B0 |
| `mutable/citation-block` | CORE; [view](src/rendering/citation-block-view.tsx) | D citation; active | N | F; B0 |
| `resource-information-block` | CORE; [factory](src/interchange/resource-surface.ts), [view](src/rendering/reversible-surface.tsx) | D resource details; active; declared container capability | N | F; B0; do not infer child rendering |
| `mutable/web-resource-block` | CORE flag; `WEB_BLOCK` in [model](src/web-resources/model.ts); [view](src/rendering/web-resource-view.tsx) | D web resource; active | N | F; B0 |
| `mutable/academic-resource-block` | CORE flag; `ACADEMIC_BLOCK` in [model](src/academic/model.ts); [view](src/rendering/academic-resource-view.tsx) | D academic resource; active | N | F; B0 |
| `mutable/structured-resource-block` | CORE flag; `STRUCTURED_BLOCK` in [model](src/structured/model.ts); [view](src/rendering/structured-resource-view.tsx) | D structured resource; active | N | F; B0 |

### 4.4 Blocks: features and records outside normal view registration

| Exact identifier | Registration/declaration and dispatch | Implementation/status | Persistence | Class; route |
| --- | --- | --- | --- | --- |
| `timer-block` | APP; [feature](src/features/timer/index.tsx), [model](src/features/timer/model.ts) | D owned widget; active | N | F; B0 |
| `3d-object-block` | APP; [feature](src/features/three-d-object/index.tsx), [model](src/features/three-d-object/model.ts) | D owned widget; active | N | F; B0 |
| `canvas-counter-block` | APP; [feature](src/features/canvas-counter/index.tsx) | D demo widget; canvas feature opt-in | N | F; B0 |
| `flint-application-block` | APP; [feature](src/features/flint/index.tsx), [document capabilities](src/application/document-application-capabilities.tsx) | D document application; active | N | F; B0 |
| `phosphor-screen-block` | APP; [adapter](src/application/phosphor.tsx), [model](src/features/phosphor/model.ts) | D screen host; active | N | F; B0 |
| `thesis-application-block` | APP; [adapter](src/application/thesis.tsx) | D proposition application; active | N | F; B0 |
| `cardex-application-block` | APP; [adapter](src/application/cardex.tsx) | D Entity application; active | N | F; B0 |
| `desktop-application-placeholder-block` | APP; [desktop applications](src/application/desktop-applications.tsx) | D intentional unavailable-app placeholder | N | F; B0 |
| `mutable/package-data-block` | No BR; [package context](src/interchange/package/document-context.ts), [data](src/interchange/package/data.ts), [native package](src/interchange/package/native.ts) | Data retained package context; active | N/C; often unplaced definition | L; B4 |
| `mutable/proposition-block` | No BR; [SQL service](src/knowledge-sqlite/propositions.mjs), [migration](src/knowledge-sqlite/migrations/mutable/0008-propositions.sql), Thesis | Data independently authored SQL text; active | SQL | L; B4; storage scope decision |
| `text-cell` | No BR; TREE/NATIVE; [identity](src/block-tree/identity.ts) | Data inline code-point atom; active | Atom | L; B4; explicitly outside ordinary Blocks |
| `image-cell` | No BR; TREE/NATIVE/IX; SV | Data inline image atom; active | Atom | L; B4; explicitly outside ordinary Blocks |
| `block-menu` | ENUM only; [menu UI](src/components/block-menu.tsx) is not a matching content registration | Apparently declaration-only | N unknown retention only | U; B5 |
| `portal-block` | No BR; [spatial eligibility](src/application/spatial-actions.ts) | Compatibility check; implementation unestablished | N unknown retention only | U; B5 |
| `text-block` | No BR; SQL policy and [application capabilities](src/application/document-application-capabilities.tsx) | Compatibility text classification; no current editor view | N unknown retention only | U; B5 |

`ReverseBlock` is a composition of surface/side/content, not a missing registered ID. `style-bar-block`, `sticky-tab-label-block`, `abstract-block` and `client-block` are CSS/UI implementation labels, not additional proven content types. Dialectic is an application placeholder; Dossier is an unavailable Cardex detail panel, not an independently registered native Block. These exclusions should appear in coverage-test exceptions so a text search does not manufacture new types.

### 4.5 Block Properties

**Category registry membership: none for all rows today.** Current support is explicitly stated rather than inferred from L. All rows use generic native property retention (N), including unknown/ignored records. This does not establish old `BlockProperty` constructor/bind fidelity, active rendering, interchange admission or round-trip SQL reconstruction. Existing appearance is shared switch behaviour; semantic rows have dedicated consumers.

| Exact identifier | Declaration/dispatch sources | Implementation, activity and complication | Class; route |
| --- | --- | --- | --- |
| `block/alignment` | BP, AP, MENU, TEXT | Active shared alignment by value; old/current implementations | L; P1 |
| `block/alignment/left` | TEXT, AP, RESTORE | Active fixed compatibility style | L; P1 |
| `block/alignment/center` | TEXT, AP, RESTORE | Active fixed compatibility style | L; P1 |
| `block/alignment/right` | TEXT, AP, RESTORE | Active fixed compatibility style | L; P1 |
| `block/alignment/justify` | TEXT, RESTORE; absent AP case | Legacy fixed style; current dynamic `block/alignment` can justify | I; P3 |
| `block/font/size` | BP, AP, MENU | Active token/CSS size; keep current parsing and defaults | L; P1 |
| `block/font/size/h1` | TEXT, AP | Active fixed size compatibility | L; P1 |
| `block/font/size/h2` | TEXT, AP | Active fixed size compatibility | L; P1 |
| `block/font/size/h3` | TEXT, AP | Active fixed size compatibility | L; P1 |
| `block/font/size/h4` | TEXT, AP | Active fixed size compatibility | L; P1 |
| `block/font/size/half` | BP, AP | Active fixed size compatibility | L; P1 |
| `block/font/size/three-quarters` | BP, AP | Active fixed size compatibility | L; P1 |
| `block/indent` | BP, AP, MENU | Active visual indentation; not tree nesting | L; P1 |
| `block/rotate` | BP, AP | Active rotation; preserve transform composition | L; P1 |
| `block/size` | BP, AP, widget consumers | Active metadata dimensions; widget clamping differs | L; P1/P2 |
| `block/position` | BP, AP, positioned hosts | Active metadata position; placement distinct | L; P1/P2 |
| `block/margin` | BP, AP | Old callback uses top; current AP uses all sides | I; P3; preserve host behaviour |
| `block/margin/top/20px` | TEXT, AP | Active fixed margin compatibility | L; P1 |
| `block/margin/top/40px` | TEXT, AP | Active fixed margin compatibility | L; P1 |
| `block/theme/glass` | WIN, AP | Active shared theme class | L; P1 |
| `block/theme/paper` | WIN, AP | Active shared theme class | L; P1 |
| `block/draggable` | BP; old menu callers | Legacy DOM hook; metadata can contain runtime dragger | L; P3; do not execute on native load |
| `block/vines` | TEXT, DOC; old plugin | Legacy-only decoration; no current AP interpreter | L; P3 |
| `block/animation/sine-wave` | TEXT; OLD animation | Legacy-only animation | L; P3 |
| `block/blue-and-white` | TEXT, DOC | Legacy-only theme class | L; P3 |
| `block/background/image` | TEXT, DOC | Legacy URL/CSS callback; not ImageBackgroundBlock | L; P3 |
| `block/background/colour` | TEXT, DOC | Legacy color callback; no current AP case | L; P3 |
| `block/font/colour` | TEXT, DOC | Legacy color callback; no current AP case | L; P3 |
| `block/marginalia/left` | DOC/TEXT | Legacy class; current placement uses owned relations | L; P3 |
| `block/marginalia/right` | DOC/TEXT | Legacy class; current placement uses owned relations | L; P3 |
| `document/contiguous-standoff` | DOC schema, ENUM multi-range interface | Legacy metadata ranges; not current linked-annotation model | L; P3 |
| `codex/entity-reference` | [PDF](src/pdf/block.ts), [IIIF](src/iiif/block.ts), resource factories, IX/SQL | Active semantic Entity association; independent from standoff namesake | L; P2 |
| `codex/block-reference` | [resource surface](src/interchange/resource-surface.ts), IX | Active semantic target; typed copy remapping | L; P2 |
| `mutable/resource-annotation` | [PDF view](src/rendering/pdf-block-view.tsx), [IIIF view](src/rendering/iiif-block-view.tsx), IX | Active resource-space anchor; dedicated host | L; P2 |
| `mutable/academic-annotation` | [academic view](src/rendering/academic-resource-view.tsx), IX | Active OCR/EPUB anchor; dedicated host | L; P2 |
| `mutable/opaque-block-property` | IX | Active inert retention carrier; no automatic reactivation | L; P2 |
| `block/font-size` | RESTORE | Compatibility-only spelling; current AP ignores it | U; P3 |
| `block/alignment/left ` (trailing space) | RESTORE; template compatibility | Known malformed spelling preserved but not styled | I; P3 |

No standalone fixed `/h5` or `/h6` type was found in this schema set; those are values accepted by `block/font/size`. Do not generate identifiers from all possible values. AP's lack of a universal tombstone filter is another category-wide inconsistency: registration should initially document existing handling rather than silently change it.

### 4.6 Standoff Properties

Membership column is **the current VE property-type path**, not a claim that VE already governs the entire category. ST/FX/UI entries identify registration outside that path. Each row uses generic native authored annotation retention (N), with Cell-index or specialised host constraints; old TEXT schemas/classes do not establish faithful deserialization. Old bind field loss, point conventions and format-specific admission apply across rows. No row promises arbitrary cross-Block ranges.

| Exact identifier | VE membership; other declarations/dispatch | Behaviour/status | Class; route |
| --- | --- | --- | --- |
| `style/bold` | No; ST, TEXT, MENU | Active cell style | L; S1 |
| `style/italics` | No; ST, TEXT, MENU | Active cell style | L; S1 |
| `style/underline` | No; ST, TEXT, MENU | Active cell decoration | L; S1 |
| `style/strikethrough` | No; ST, TEXT, MENU | Active cell decoration | L; S1 |
| `style/strike` | No; ST alias → strikethrough | Active compatibility alias; preserve authored spelling | L; S1 |
| `style/superscript` | No; ST, TEXT | Active cell style | L; S1 |
| `style/subscript` | No; ST, TEXT | Active cell style | L; S1 |
| `style/uppercase` | No; ST, TEXT | Active presentation; source text unchanged | L; S1 |
| `style/highlight` | No; ST, TEXT | Active cell background | L; S1 |
| `text/colour` | No; ST, TEXT | Active explicit foreground value | L; S1 |
| `style/color` | No; ST alias → text/colour | Active compatibility alias | L; S1 |
| `text/background-colour` | No; ST, TEXT | Active explicit background value | L; S1 |
| `style/highlighter` | No; ST, TEXT, SV | Active SVG region decoration | L; S1 |
| `style/rainbow` | No; ST, TEXT, SV | Active SVG underline with lane allocation | L; S1 |
| `style/rectangle` | No; ST, TEXT, SV | Active SVG outline | L; S1 |
| `style/spiky` | No; ST, TEXT, SV | Active SVG decoration | L; S1 |
| `style/blur` | No; ST, TEXT, SV, RESTORE | Active region effect; old wrapper differs | L; S1 |
| `style/glow` | No; ST, SV, RESTORE | Active cell shadow | L; S1 |
| `style/chromatic-aberration` | No; ST, SV, RESTORE | Active shadow effect | L; S1 |
| `style/motion-blur` | No; ST, SV, RESTORE | Active region effect | L; S1 |
| `style/ghost` | No; ST, SV, RESTORE | Active cell shadow | L; S1 |
| `style/grayscale` | No; ST, SV, RESTORE | Active region filter | L; S1 |
| `style/sepia` | No; ST, SV, RESTORE | Active region filter | L; S1 |
| `style/invert` | No; ST, SV, RESTORE | Active region filter | L; S1 |
| `style/contrast-brightness` | No; ST, SV, RESTORE | Active region filter | L; S1 |
| `style/grain` | No; ST, SV, RESTORE | Active noise effect | L; S1 |
| `style/turbulence` | No; ST, SV, RESTORE | Active noise effect | L; S1 |
| `style/ink-bleed` | No; ST, SV, RESTORE | Active cell/noise combination | L; S1 |
| `amber-crt` | No; ST, SV, RESTORE | Active cell/noise combination; keep exact ID | L; S1 |
| `style/show-hide` | No; ST; [projection](src/runtime/show-hide-projection.ts) | Active specialised visibility projection | L; S3 |
| `style/character-surface` | Yes; [static surface](src/rendering/static-character-surface.ts), [Initialis](src/features/initialis/controller.ts) | Active one-Cell replacement presentation | F; S0 |
| `style/flip` | No; ST deferred; TEXT wrapper | Legacy/deferred range-wrapper behaviour | L; S4 |
| `style/mirror` | No; ST deferred; TEXT wrapper | Legacy/deferred range-wrapper behaviour | L; S4 |
| `codex/entity-reference` | Yes via [feature](src/features/entity-references/index.tsx); FX effect + annotation UI; TEXT; IX/SQL | Active semantic mention and caret effect | P; S2 |
| `codex/claim-reference` | Yes VE; ST, TEXT; package context | Active underline/data; limited specialised authoring | P; S2 |
| `codex/block-reference` | No; ST, TEXT; IX/SQL | Active underline/target consumers | L; S1/S3 |
| `codex/trait-reference` | No; ST, TEXT | Active underline; old semantic intent, no full Trait subsystem established | L; S1/S3 |
| `codex/meta-relation-reference` | No; ST, TEXT | Active underline; not a general Relationship implementation | L; S1/S3 |
| `codex/time-reference` | No; ST, TEXT; package context | Active underline/reference inventory | L; S1/S3 |
| `reference/url` | No; ST, TEXT; IX/export | Active link style and URL semantics | L; S1/S3 |
| `mutable/gloss` | Yes, controller registers a CSS-class binding under glossMode; [model](src/features/gloss/model.ts), [controller](src/features/gloss/controller.ts), linked definitions | Active document-local semantic annotation; dedicated controller remains necessary | F; S0/S3 |
| `text/superposition` | No; [runtime](src/runtime/text-superposition.ts); owned relation dispatch | Experimental, default off; alternatives/caret/overlap rules | L; S3 |
| `mutable/opaque-property` | Yes VE; IX | Active inert carrier, dotted underline | F; S0 |
| `codex/search/highlight` | No; ST, TEXT | Active compatibility style; normal search uses temporary decorations | L; S1; not new persistent search output |
| `cell/micro-document` | No; ST deferred; TEXT embedded DOM | Legacy/deferred embedded-document behaviour | L; S4 |
| `animation/clock` | No; ST deferred; TEXT/plugin | Legacy/deferred animation | L; S4 |
| `phosphor/inverse` | No; [Phosphor model](src/features/phosphor/model.ts), [view](src/features/phosphor/view.tsx) | Active screen-specific annotation | L; S3 |
| `phosphor/blink` | No; Phosphor model/view | Active screen-specific annotation | L; S3 |
| `phosphor/underline` | No; Phosphor model/view | Active screen-specific annotation | L; S3 |
| `codex/tag` | No; Phosphor model/view | Active screen tag data/UI | L; S3 |
| `codex/document-reference` | No; [package context](src/interchange/package/document-context.ts) | Dependency inventory only; general authoring unestablished | U; S4 |
| `codex/reference` | No; MENU prompt default | Generic authored semantic name; no specialised resolver | U; S4 |
| `style/font/size/large` | No; [old text processor](src/library/text-processor.ts) | Apparently orphaned caller | U; S4 |
| `style/font/size/small` | No; old text processor | Apparently orphaned caller | U; S4 |
| `font/family/arial` | No; old text processor | Apparently orphaned caller | U; S4 |
| `font/family/mono` | No; old text processor | Apparently orphaned caller | U; S4 |
| `font/color` | No; old text processor | Apparently orphaned caller; not established alias of text/colour | U; S4 |
| `animation/spinner` | No; OLD sample | Apparently orphaned sample | U; S4 |

The following additional types are registered in **Cardex's local name editor**, not the main document host. Their strings are defined once in `NAME_TYPES`, consumed by local registration, authoring and validation. They are F within that scoped registration path; the shared category description work must preserve the scope.

| Exact identifier | Registration/declaration and dispatch | Behaviour/status and persistence | Class; route |
| --- | --- | --- | --- |
| `given-name` | [NAME_TYPES/validation](src/features/cardex/validation.mjs), [local VE registration](src/features/cardex/local-editor.tsx) | Active name-part mark; Entity nameStrata JSON | F; S0/S3 |
| `family-name` | NAME_TYPES; local VE registration | Active name-part mark; Entity nameStrata JSON | F; S0/S3 |
| `patronymic` | NAME_TYPES; local VE registration | Active name-part mark; Entity nameStrata JSON | F; S0/S3 |
| `toponym` | NAME_TYPES; local VE registration | Active name-part mark; Entity nameStrata JSON | F; S0/S3 |
| `art-name` | NAME_TYPES; local VE registration | Active name-part mark; Entity nameStrata JSON | F; S0/S3 |
| `particle` | NAME_TYPES; local VE registration | Active name-part mark; Entity nameStrata JSON | F; S0/S3 |
| `honorific` | NAME_TYPES; local VE registration | Active name-part mark; Entity nameStrata JSON | F; S0/S3 |

Cardex persists these through [Entity Card service](src/knowledge-sqlite/cardex.mjs) as `{version:1, coordinates:"unicode-scalar-inclusive-v1", properties:[...]}` in `Entity.nameStrata`. Its local repository is intentionally disconnected from native document persistence and indexers. The validator requires inclusive nonempty scalar ranges, IDs and a restricted record shape; it limits annotations to 200 and excludes shared definitions/graph-reference metadata. Cardex Description uses a separate restricted subset of the formatting types above. Generic native preservation of arbitrary strings does not make these name annotations supported in the main document host. Do not move them into the global active VE assembly or widen Cardex validation during consolidation.

`mutable/resource-annotation` and `mutable/academic-annotation` belong to the Block Property table. Temporary `editor/*`, syntax, selection, spotlight and caret labels belong to session presentation. Renderer names, Entity typenames, Gloss raw-value categories and command IDs are not additional standoff type identifiers.

## 5. Concrete migration routes for stragglers

Every P/L/I/U matrix row selects one or more routes below. These are proposed changes, not completed work. Unless explicitly noted, **keep the implementation, IDs, authored values, ranges, placement model, serializers and feature defaults unchanged**. Rows sharing a renderer can be moved together for convenience, but do not require a whole-category cutover.

### 5.1 Block routes

| Route | Obstacle and exact proposed change | Compatibility/behaviour impact | Verification and independence |
| --- | --- | --- | --- |
| B0 — current registrations | Extend BR/types with descriptive discovery; expose existing CORE/APP definitions through a pure Block descriptor boundary. Keep view/create functions and existing capability/owner bindings. | Additive; distinguish known vs active to avoid changing SQL policy. Do not add factories where constructors need context. | T1/T2/T6; independent per module after Phase A. |
| B1 — dual legacy registrations | CORE/ENUM/OLD and row-linked class builders repeat identity. Give each Block one descriptor; legacy builder adapters and current view registrations reference it. Derive the old host's builder list from explicitly selected legacy bindings, not every reactive type. | Existing class implementation can remain unchanged. Never instantiate it as the reactive view. Preserve builder order, feature ownership, current generic views and structural dispatch. No wire/placement change. | T1/T2 plus T3 for tables/tabs/surfaces/lists; legacy host characterization required before retirement. Independent by family except collision rows. |
| B2 — document aliases | CORE, TREE and OLD independently normalize document aliases. Share a pure Block alias declaration/normalizer usable without a browser registry. | Preserve authored spelling in native payload; normalize runtime resolution only where existing code already does. Do not rewrite files on load/save. | T2 with main-list/membrane fixtures and native alias round trips; independent of other Block families. |
| B3 — inconsistent/incomplete legacy path | Characterize Embed/YouTube collision, TEXT bind loss, empty fallback builder IDs and old UI serialization in row-linked classes/OLD before adapting. Record compatibility exceptions. | Adapters suffice to preserve existing supported paths. Repairing defects or reviving missing old behaviour is a separate approved change. Do not use class `deserialize` for native loading. Current generic views remain intact. | T2 plus targeted first-match/fallback/bind-field tests. Each inconsistency can be decided separately; do not block B0 or properties work. |
| B4 — non-view records/atoms | Native package context, SQL Proposition and inline atoms do not fit mandatory BR `view`. Add a descriptive Block storage/support distinction for data-only records if approved; keep atom definitions in their existing inline codec contract, with explicit discovery exclusions. | No fake view/create capability. SQL Proposition registration cannot imply native portability. Headless description is sufficient; do not change SQL or inline format. | T2/T6 package/proposition/inline cases; storage-scope decision first. Can ship independently of UI types. |
| B5 — declaration/check-only names | Review ENUM and row-linked eligibility/policy callers. Record exact retained compatibility names and unknown status. Remove or derive obsolete declarations only after consumer evidence. | An allowlist reference is not authority to create a new renderer or rename existing data. No automatic alias text-block → standoff-editor-block. | T1/T6 policy characterization and unknown retention; independent cleanup after status decision. |

**Concrete collision:** `EmbedDocumentBlock.getBlockBuilder()` returns `BlockType.YouTubeVideoBlock`, while its constructor/serializer use `EmbedDocumentBlock`. OLD lists the real YouTube builder first; first-match lookup shadows the Embed builder. A duplicate-checking migration will correctly reject this table. Options are to preserve the old shadowed entry as a documented excluded compatibility adapter, or separately fix the builder ID and qualify the newly reachable behaviour. Do not silently choose the second option.

**Legacy fidelity:** TEXT `bind` constructs Standoff Properties without forwarding all IDs/metadata/client-only fields; Block Property reconstruction also forwards a restricted subset. Error/Unknown classes use an empty builder type and inherit a root-type instance rather than matching the modern named registrations. Their serializers are not interchangeable with NATIVE. These findings rule out “route every reload through the class factory” as a consolidation strategy.

### 5.2 Block Property routes

| Route | Obstacle and exact proposed change | Compatibility/behaviour impact | Verification and independence |
| --- | --- | --- | --- |
| P1 — common appearance | Introduce the dedicated category index; register descriptors for AP/BP/TEXT/WIN types. Initially associate the existing interpreter rather than rewrite the switch. Later derive dispatch entries from definitions where this removes genuine duplicated identity. | Same ordered cascade, parsing, defaults, transforms and deletion handling. Old DOM callbacks remain legacy host bindings; no new instances or layout passes. | T1/T4 appearance parity and bounded-work checks. Independent by style family; no Standoff migration dependency. |
| P2 — domain/semantic properties | Register row-linked resource/widget/IX types with value/metadata contracts and named host consumers. Reference existing resource validators and typed-target functions; do not move domain logic into the registry. | Preserve snapshot-bound anchors, multiple properties, IDs and typed copy remapping. A reference does not become an owned relation. No import permission implied. | T2/T5/T6; resource anchor and copy tests. Independent per domain after basic index exists. |
| P3 — legacy/inconsistent properties | Register explicit legacy-only/deferred/retained descriptors, scoped to supported hosts. RESTORE misspellings stay exact compatibility records. Document different AP/old callback behaviour instead of forcing equivalence. | No activation of draggable/plugins, no justification fix, typo normalization or contiguous-standoff → linked-annotation conversion. Dragger runtime objects require separate portability handling if ever revived. | T2/T4 unknown/ignored/legacy retention and AP output; follow-up behavioural fixes require decision. Independent of active styles. |

The new Block Property registry is a missing small authority, not a migration to VE. It should be usable by semantic properties that have no display effect at all.

### 5.3 Standoff Property routes

| Route | Obstacle and exact proposed change | Compatibility/behaviour impact | Verification and independence |
| --- | --- | --- | --- |
| S0 — existing VE-only identity | Move descriptive ownership into the category definition path and keep the existing VE binding as a delegated registration; adapt existing API calls. | Character-surface/opaque behaviour unchanged; retain renderer validation and cleanup. No conversion of values/ranges. | T1/T4, character-surface tests; independent after Phase A boundary. |
| S1 — static styles and aliases | Associate ST definitions and aliases with Standoff descriptors; keep current cell/SVG/region/noise implementations. Change SV to test active binding availability rather than mere known-type existence before broadening discovery. | Prevent loss or duplication of decorations; preserve source-order CSS cascade, underline lane allocation and exact alias wire spelling. Does not require reimplementing all effects as VE renderers. | T4 plus explicit old/new path parity under flags; each style family independent after dispatch qualification. |
| S2 — several bindings for one semantic type | Entity/Claim descriptors reference VE, ST/FX fallback and annotation UI as separate bindings with explicit precedence and host/flag conditions. Reuse feature registration/disposal. | Preserve feature-off readability and caret behaviour; do not delete useful fallback or UI contributions. No Entity/Claim data model change. | T1/T4/T6; activate/dispose/fallback combinations and Entity lifecycle. Independent per feature after precedence contract. |
| S3 — controller/host-specific semantics | Register descriptions for Gloss, superposition, visibility, typed references, Phosphor and Cardex name fields; point to current controllers/model validators. Add declared host/range/operation support, not a generic renderer requirement. | No default activation, cross-Block selection expansion, new overlap policy or linked-definition ownership change. Keep screen and local-field styles scoped; preserve Cardex Entity JSON storage. | T3/T4/T5/T6; linked, Gloss, superposition, screen, Cardex and typed-target tests. Independent by controller. |
| S4 — deferred/orphan/caller-only | Register only evidenced compatibility descriptors, or retain explicit unsupported-name exceptions for callers. Inspect TEXT/ST, package inventory, MENU and old processor. Keep status honest. | No plugin revival, font-name alias invention or automatic semantic resolution. Unknown native records remain preservable without membership. | T1/T2 inert/unknown preservation and no active handler tests. Independent; final status decision precedes deletion of old declarations. |

A registry audit can complete while deferred implementations remain deferred. Consolidation is about truthful, coherent registration, not implementing every historical feature.

## 6. Recommended target registration contracts

### 6.1 Separate authorities and shared conventions

Retain three explicit access paths: `blocks`, `blockProperties`, `standoffProperties`. Do not introduce a top-level map storing all categories. A headless caller knows which category it is asking about and can query the relevant API. If a tool wants to report matches across categories, it can call the three APIs; identical strings in two categories are valid.

Shared conventions should cover stable string IDs, optional documented aliases, support status, descriptor version, field schemas, provenance/owner diagnostics and deterministic read-only enumeration. Runtime APIs stay category-specific. `codex/entity-reference` and `codex/block-reference` already occur in both property categories: uniqueness must be checked **within the category**, never globally.

The following is illustrative pseudocode, not a proposed patch or a commitment to a schema library:

```ts
// A small shared vocabulary; no universal registry or runtime base class.
interface Description {
  id: string;
  aliases?: readonly string[];
  status: 'active' | 'compatibility' | 'experimental' | 'deferred';
  schemaVersion: number;         // descriptor contract, not an Ink format bump
  fields?: SchemaReference;     // pure data; open extension fields stay open
  support: readonly HostSupport[];
}

interface BlockDescription extends Description {
  storage: 'native-block' | 'retained-definition' | 'sql-only';
  capabilities: readonly string[];
  slots?: readonly SlotDescription[];
}
// Existing BlockRegistry keeps view/create/owner/dispose behaviour.
// describe/list expose pure descriptions separately from active resolution.
// Inline atoms retain their distinct codec contract.

interface BlockPropertyDescription extends Description {
  target: 'whole-block';
  valueSchema?: SchemaReference;
  metadataSchema?: SchemaReference;
  references?: readonly TypedReferenceContract[];
}
interface BlockPropertyRegistration {
  definition: BlockPropertyDescription;
  validateNew?: BlockPropertyValidator;
  interpret?: ExistingBlockPropertyInterpreter;
  legacyBinding?: ExistingLegacyBlockSchema;
}

interface StandoffPropertyDescription extends Description {
  target: 'text-segment';
  valueSchema?: SchemaReference;
  metadataSchema?: SchemaReference;
  rangeSupport: RangeSupportByHost; // range, point, linked segments, restrictions
  references?: readonly TypedReferenceContract[];
}
interface StandoffPropertyRegistration {
  definition: StandoffPropertyDescription;
  validateNew?: StandoffPropertyValidator;
  staticStyle?: ExistingStandoffStyleSchema;
  visualBinding?: ExistingPropertyTypeDefinition;
  passiveEffect?: ExistingEffectDefinition;
  annotationUI?: ExistingAnnotationContribution;
  controller?: ExistingControllerReference;
  // Existing services retain execution and lifetimes.
}

blocks.describe(id);                 // independent category APIs
blockProperties.describe(id);
standoffProperties.describe(id);
// resolveActive/hasVisualBinding are distinct from describe/known.
```

Avoid making every optional field mandatory on day one. Describe existing support honestly; unknown or unqualified schema details must remain explicit rather than guessed. Pure description modules can be imported by node/SQLite/import tools while UI bindings stay in browser/feature modules. A runtime binding references the authoritative descriptor instead of copying its type metadata. Generate a category-specific manifest only if a concrete headless consumer needs it; do not create a second hand-maintained catalogue.

### 6.2 What can and cannot be shared between property categories

| Concern | Evidence of sharing | Recommendation |
| --- | --- | --- |
| Type/value/metadata/identity bags | Both old DTO families and current authored records use these concepts. | Reuse descriptive conventions and existing authored-value preservation. |
| Semantic targets | Both have Entity/Block references; IX has explicit typed target handling. | Reuse target validators/remappers only where semantics agree; register independently. |
| Duplicate and alias checks | Both need deterministic lookup and disposal diagnostics. | Small shared utility is reasonable after separate contracts exist; no mandatory generic framework. |
| Validation | Both need input/value checks; standoff additionally needs Cells, endpoints, linking and point rules. | Separate validators and contexts; share scalar/schema helpers. |
| Interpretation | Block properties affect a whole Block/resource; standoff affects ranges, geometry and caret interaction. | Separate execution contracts. Do not pass Block Properties through VE. |
| Editing/lifecycle | Block mutations and spatial anchors differ from rebasing/splitting/linked ranges. | Retain existing commands/controllers and host lifetimes. |
| Rendering | AP/host consumers vs ST/SV/VE/FX. | No common rendering interface justified. |

The common ancestor `IPropertySchema` in legacy types is evidence of shared vocabulary, not proof of one suitable present-day runtime registration mechanism.

### 6.3 Validation, defaults and discovery semantics

- **Identifiers:** preserve exact existing strings, including compatibility spellings. Aliases are declared mappings, never inferred by casing, slashes or similarity. Validate collisions/cycles within one category. Modern IDs need not be backfilled into a closed historical enum to become valid.
- **Schemas:** distinguish an authored Block payload from the `blockProperties` array and from effect-renderer parameters. Reuse existing domain validators first. Record open metadata/attributes explicitly. Default values are construction/presentation choices, not fields to inject during reload.
- **Validation timing:** validate definitions at assembly and values at relevant creation/import/edit boundaries. Native load retains unknown or unsupported authored bags subject to existing structural safety rules. Do not run whole-document schema validation on every keystroke.
- **Support:** report known definition, host applicability, feature availability, active implementation, authoring support and import admission separately. A generic view and a data-only type are deliberate support modes; a missing renderer is not necessarily an error.
- **Operations:** expose supported operations by references to existing commands/capabilities. Never infer that a `container` is a valid table row or that a view grants structural editing.
- **Codecs:** keep generic native codecs authoritative. Per-type codecs should be exceptional and justified; metadata registration does not require one codec per type. Alias resolution must not canonicalise authored type strings during round trip.
- **Diagnostics:** include category, exact ID, owner, definition/binding source and support state. Distinguish unknown, disabled, deferred, deliberately generic and missing-required-handler. Avoid repeated diagnostics during typing/rendering.

### 6.4 Single source of truth within each category

One definition owns the category's identity, aliases and descriptive support. The same module or referenced implementation supplies optional bindings. Legacy enums can remain compatibility exports derived from an explicitly supported subset; factories and class names need not disappear. A type-sensitive switch is not automatically redundant: behaviour, trust policy, storage format and structural invariants often genuinely require dispatch.

Only replace a table when its sole job is repeating registration information. Keep structural algorithms, import-admission policy, typed reference remapping and renderer implementations explicit. Add coverage assertions ensuring those consumers refer to valid declared types or documented compatibility exceptions. A static name search is useful for auditing, but insufficient as the runtime definition of “supported.”

## 7. Compatibility and regression assessment

| Area | Required invariant and specific risk | Qualification |
| --- | --- | --- |
| Native `.ink` | Keep `mutable-document` envelope/version, authored-value encoding, IDs, original type strings, ordered arrays, retained definitions, children/relations/inline edges and unknown data. No load-time rewriting or registry-membership requirement. | NATIVE round trips including aliases, unknown/disabled features and authored extension fields. |
| Legacy nested JSON | TREE remains a codec; do not substitute class deserialization. Preserve known document alias and owned-relation interpretation. Inline images have explicit legacy export limitations. | Existing compatibility fixtures plus legacy adapter characterization. |
| SQLite | Typenames, Entity/Claim/Relationship identity and saved projection remain unchanged. Active opaque-widget discovery currently controls extraction policy. Proposition is SQL-specific. | Saved projection, policy, proposition and Phosphor tests; no SQL migration proposed. |
| Import/export | Native preservation exceeds HTML/Markdown/clipboard support. Registered types must not automatically enter admission allowlists. | Existing IX tests, opaque preservation, explicit diagnostics and typed-target remapping. |
| Creation/placement | Preserve existing contextual factories, ID allocation, owned/reference placements, slots, relation ownership and specialised operations. Registry defaults must not reconstruct existing records. | Structural and identity suites; representative menu insertion and undo. |
| Standoff ranges | Preserve inclusive ordinary Cell endpoints, Unicode code-point indexing, image Cells, linked segment identity, local rebasing and external definition provenance. | Range/split/join/cross-text/linked tests, Unicode and inline images. |
| Zero-width annotations | Current editing/interchange use `isZeroWidth:true, start=end`; saved knowledge paths expect `end=start-1`. A registry cannot truthfully promise universal point support yet. | Characterize both representations; any normalization/fix is separate, approved work with data consequences assessed. |
| Rendering | Preserve current generic views, active/fallback precedence, style cascade, lane allocation, region/noise effects, character surfaces, flags and feature cleanup. | Flag-combination and visual/runtime suites. |
| Editing and performance | No new full-resource snapshots, type-table scans, SQL/index refreshes, layout scans or broad reactive subscriptions during typing/caret motion. | Bounded-work tests on affected records; real Flint benchmark if execution paths change. |
| Clipboard | Copy/remapping requires explicit typed targets; registration must not remap arbitrary strings or reactivate opaque carriers. | IX package/clipboard tests with local/external targets and linked definitions. |
| Undo/Redo and reload | Same canonical transactions, ownership restoration and property data; feature registration/disposal is not an authored edit. | Repository/history/native-session tests and dirty-state checks. |
| Saving | Document save remains manual through current save commands. No autosave, background document serialization or Markdown sidecar is introduced. Worker/history persistence is not document autosave. | [save flow](src/application/document-save.tsx) and native-session qualification; no document write from registration/discovery. |
| Flint | Active document host must keep text feedback, selections, IME, annotations, feature lifecycle and unknown-type readability. | Flint/editor suites and benchmark when justified. |
| Phosphor, Thesis, Cardex | Screen standoff semantics, SQL Proposition records and Entity application policies must remain scoped. Cardex nameStrata/descriptionDocument remain Entity fields, not indexed document annotations. | Application/model/SQL tests, including [Cardex SQL](src/knowledge-sqlite/cardex.test.mjs) and [name editing](src/features/cardex/name.test.ts). |
| Dialectic and Dossier | [Dialectic](src/application/desktop-applications.tsx) is currently a placeholder; [Dossier](src/features/cardex/details.tsx) says associations are unavailable. No implemented independent native type contract found. | Preserve placeholders; future application qualification cannot be claimed from this audit. |

A Block Property tombstone currently can still influence AP. Old schema and current margin/font behaviour can differ. Some declared capabilities are broader than view behaviour, such as `resource-information-block` declaring container capability. These are compatibility facts to record; registration consolidation is not authority to “correct” them silently.

No proposed phase requires a persisted data migration. If a later decision changes aliases, point conventions, deprecated identifiers or legacy schema values, it leaves the registration-only scope and needs a separate compatibility proposal.

## 8. Incremental migration plan

Safeguards start in Phase A; Phase E makes them the permanent release gate. Block, Block Property and Standoff tracks can progress independently once their own contracts are qualified.

### Phase A — Qualify each category contract

**Changes:** add characterization/coverage tests around current BR/CORE/APP, AP/BP and ST/VE/FX behaviour. Specify independent discovery APIs and status semantics. Extend Block descriptors minimally; establish the missing Block Property index contract; qualify the separation between Standoff descriptions and executable VE bindings. Capture flags, aliases, owners, generic renderers, deferred exceptions and SQL capability-derived policy. Prototype contracts in tests or a separate investigation fixture before moving production call sites.

**Files/subsystems:** BR/types, feature API/adapters, runtime effect/annotation services, AP/ST/SV, knowledge policy and native compatibility fixtures. Pure descriptor locations should follow those category boundaries, not a new universal plugin package.

**Dependencies:** agreement on separate authorities and definition-versus-binding queries. No legacy cleanup required. **Complexity:** medium, concentrated in Standoff precedence and known/active discovery. **Risk:** accidental rendering or policy change from metadata registration.

**Acceptance:** T1/T2 baseline passes; unknown types still reload; registry descriptions can be read without DOM/feature activation; duplicate category IDs fail; the same ID in the two property categories succeeds; metadata-only standoff registration does not suppress existing presentation. Discovery alone makes no document dirty. Deliver independently as additive infrastructure.

### Phase B — Mechanical standardisation within categories

**Changes:** B0 current Block discovery, B2 pure alias declaration, P1 current appearance descriptors, P2 straightforward semantic descriptors, S0 existing visual registrations and S1 static-style descriptions with existing execution preserved. Feature flags and ownership remain where they are. Existing class implementations, factories and interpreters remain callable through bindings.

**Files/subsystems:** CORE/APP and row-linked feature modules; AP/BP declarations; ST/VE built-in bindings; resource property factories/views. Change only duplicate identity definitions and necessary lookup adapters.

**Dependencies:** that category's Phase A contract; S1 waits for proven active-binding dispatch semantics. **Complexity:** low per type/family; medium for the first Standoff family. **Risk:** mismatched alias or fallback, cascade change, unwanted capability-policy expansion.

**Acceptance:** T1–T5 as relevant; before/after output and native semantic round trips unchanged. Each Block family, Block Property family or standoff style family is independently reviewable and reversible. Do not combine all categories into one large cutover.

### Phase C — Compatibility adapters and specialised definitions

**Changes:** B1 adapters for the old host, B3 characterized exceptions, approved B4 descriptive data scopes, P3 legacy status records, S2 feature fallback composition and S3 controller-specific definitions. S4/B5 retain uncertain names as exceptions until resolved. Allow an old class to remain its host's implementation while taking identity from the category definition.

**Files/subsystems:** OLD/ENUM and affected class builders; TEXT/DOC/WIN legacy schemas; Entity/Gloss/Phosphor/superposition integrations; package and SQL description boundaries. Keep class runtime, Cell model and canonical placement runtime separate.

**Dependencies:** Phase B support for each family; explicit decision before repairing the Embed collision or any other behavioural inconsistency. **Complexity:** medium to high for a complete old-host qualification, medium per specialised feature. **Risk:** first-match semantics, dormant behaviour becoming active, missing cleanup or changes in range/ownership support.

**Acceptance:** T2–T6, old host builder-selection fixtures and existing current-host parity. Deferred features stay deferred; feature defaults do not change. Each adapter/feature can ship separately. Unresolved legacy defects can remain documented without blocking current-category consistency.

### Phase D — Retire redundant registration paths

**Changes:** remove hand-maintained builder/schema identity lists only after all their consumers resolve category definitions/adapters. Derive compatibility enum exports where practical; retain a named compatibility subset if that is safer than generation. Remove duplicate aliases and pure registration lookup tables, not behavioural switches, live instance registries, class implementations or security policy lists.

**Files/subsystems:** selected OLD/ENUM entries, old schema assembly and replaced AP/ST lookup scaffolding. A file need not be deleted just because its registration moved.

**Dependencies:** every affected consumer has a passing replacement and reachability has been checked. **Complexity:** low to medium, but evidence-intensive. **Risk:** rarely used legacy entry point or feature flag combination omitted.

**Acceptance:** no independent competing identity source remains for the retired path; current and retained legacy host fixtures pass; import/load fallback still preserves unknown records. Retire one table at a time, with straightforward rollback. Do not make retirement a prerequisite for receiving the benefits of earlier phases.

### Phase E — Permanent category-specific safeguards

**Changes:** promote Phase A coverage assertions into CI; add per-category declaration/alias/schema/binding checks, explicit unsupported/deferred exceptions and feature composition tests. Document one-entry workflows for each category. Validate pure descriptions in a headless environment. Require new type additions to state native retention, authoring, runtime and interchange support separately.

**Files/subsystems:** registry/feature tests, compatibility fixtures, category documentation and existing CI test selection. Avoid a global registry validation scan during editing.

**Dependencies:** extends safeguards already introduced in A; can accompany every B/C/D change. **Complexity:** low to medium. **Risk:** overbroad static checks mistaking runtime/UI labels for authored types, or assuming every registered type needs a dedicated renderer.

**Acceptance:** an undeclared supported type, duplicate category ID, conflicting alias or missing required binding fails a focused test; deliberate generic/deferred/data-only support passes. Runtime diagnostics remain bounded and actionable. No new background save/indexing or geometry work appears.

## 9. Test strategy and evidence

### 9.1 Test groups used by the migration routes

| Group | Existing evidence/tests | Additional acceptance checks for implementation |
| --- | --- | --- |
| T1 — definition/lifecycle | [feature registry tests](src/runtime/features.test.ts), [visual-effect registry](src/runtime/visual-effect-registry.test.tsx), [feature capabilities](src/application/feature-capabilities.test.tsx) | Separate category uniqueness, same ID across categories, alias collision/cycle handling, list/describe determinism, owner/disposer parity, no DOM dependency in descriptions, required-binding diagnostics. |
| T2 — persistence/unknowns | [native resource](src/persistence/native-resource.test.ts), [legacy fixtures](src/block-tree/compatibility-fixtures.test.ts), [unknown feature](src/rendering/unknown-feature.test.tsx), [native session](src/persistence/native-session.test.ts) | Per-family representative round trips; unknown fields and exact alias spelling; data-only definitions; old builder collision/fallback characterization; no false claims of class-deserializer fidelity. |
| T3 — structures and editing | [Block tree](src/block-tree/block-tree.test.ts), [identity](src/block-tree/identity.test.ts), [cross-text edits](src/block-tree/cross-text-edit.test.ts), [document tabs](src/block-tree/document-tab-plan.test.ts), [lists](src/block-tree/list-wrap.test.ts), [tables](src/rendering/tables.test.tsx), [reversible surfaces](src/rendering/reversible-surface.test.tsx) | Menu-created shapes, placement IDs/ownership, margins, tasks, reference occurrences, Undo/Redo, flag fallback, no invalid generalized child grammar. |
| T4 — property/render/range | [standoff styles](src/rendering/standoff-styles.test.ts), [optional annotations](src/rendering/optional-annotations.test.tsx), [passive effects](src/runtime/effect-contributions.test.tsx), [range annotations](src/runtime/range-annotations.test.ts), [linked annotations](src/runtime/linked-annotations.test.ts), [superposition](src/runtime/text-superposition.test.tsx), [character surfaces](src/rendering/character-surface.test.tsx) | AP exact cascade/ignored/tombstone characterization; discovery must not change rendering precedence; flag combinations; point representation limitations; overlap, lane allocation, linked identity and host-specific range constraints. |
| T5 — interchange | [clipboard](src/interchange/clipboard.test.ts), [HTML import](src/interchange/html-import.test.ts), [Markdown import](src/interchange/markdown-import.test.ts), [document interchange](src/interchange/document-interchange.test.ts), [package](src/interchange/package/package.test.ts), [package context](src/interchange/package/document-context.test.ts) | No automatic allowlist widening; typed ID remapping; opaque carrier inertness; imported metadata preservation; native/export capability distinctions. |
| T6 — semantic/apps/performance | [Entity lifecycle](src/features/entity-references/lifecycle.test.tsx), [Gloss](src/features/gloss/gloss.test.tsx), [Phosphor integration](src/application/phosphor-integration.test.tsx), [SQL saved projection](src/knowledge-sqlite/saved-projection.test.tsx), [SQL propositions](src/knowledge-sqlite/propositions.test.mjs), [inline performance](src/block-tree/inline-performance.test.ts), [structural performance](src/block-tree/structural-performance.test.ts) | Disabled-vs-known opaque policy parity; controller cleanup; definition registration performs no content writes; ordinary typing/caret movement adds no full scans/snapshots/SQL/geometry reads; use real Flint typing benchmark if hot paths change. |

Tests should assert meaningful invariants, not mirror table contents without checking consumers. A fixture-driven coverage audit should compare category definitions to actual registration/binding composition and explicit policy exceptions. Keep supported unknown-data retention separate from support for active semantics.

### 9.2 Checks actually performed during this investigation

Source inspection covered the current registries, core and application assembly, old builder table and enum, property dispatch, persistence, interchange, SQL policy and the relevant specialised features. A focused baseline run completed successfully:

```text
node node_modules/vitest/vitest.mjs run \
  src/runtime/features.test.ts \
  src/runtime/visual-effect-registry.test.tsx \
  src/application/feature-capabilities.test.tsx \
  src/rendering/unknown-feature.test.tsx \
  src/block-tree/compatibility-fixtures.test.ts \
  src/persistence/native-resource.test.ts

6 test files passed; 26 tests passed.
```

After identifying the Gloss binding and Cardex local registration scope, an additional focused run completed:

```text
node node_modules/vitest/vitest.mjs run \
  src/features/gloss/gloss.test.tsx \
  src/features/cardex/name.test.ts

2 test files passed; 31 tests passed.
```

Across these two runs, 8 files and 57 tests passed. All 193 local Markdown links in this report resolve. A literal-identifier cross-check found no omitted candidates from the core Block registrations, static standoff schema table, shared legacy Block Property definitions or historical BlockType enum; the matrices also include the feature/domain registrations inspected separately.

This establishes a focused baseline, not full qualification of every historical class or all proposed contracts. Suites listed above beyond these eight files are recommended validation for future implementation, not claimed as run here. No full build, complete test suite, browser walkthrough or Flint performance comparison was performed for this documentation-only task.

## 10. Future declarative importer readiness

The result should let a headless consumer query each category independently for exact identifiers/aliases, authored value and metadata schemas, capabilities, support restrictions and validation diagnostics. Category selection is explicit in a caller's request; no universal lookup service is needed. A type existing in two categories is unambiguous when the category is supplied.

The registry descriptions alone will not prove that an entire proposed document is valid. Existing structural ownership, child shape, range coordinate, linked-definition, resource anchor and reference rules still apply. An importer can compose type-level checks with those existing validators. Missing schemas or host-specific limitations must produce explicit “not qualified” results rather than false assurances.

This architecture supports future native vocabulary without expanding historical enums or requiring a class per type. It does not settle TEI mappings, a conversion specification, or an importer architecture. Those decisions remain outside this report.

## 11. Rejected alternatives

- **One universal registry for all three categories:** contrary to the clarified requirement and unnecessary for discovery. It would obscure target, lifecycle and validation differences.
- **One combined registry for both property categories by default:** shared DTO vocabulary is insufficient evidence. Whole-Block/spatial interpretation and text-range/caret execution are materially different.
- **Replace BlockRegistry with a new plugin framework:** the existing ownership, alias, capability and feature infrastructure already works. Extend it minimally.
- **Put every standoff name into VE immediately:** current membership changes rendering precedence; it also conflates semantic identity with an active visual binding.
- **Convert every static style into a new renderer:** not required for authoritative registration, and expands layout/performance risk.
- **Remove old classes because their registration is old:** class behaviour can remain behind legacy host adapters. Registration age says nothing about whether implementation is still needed.
- **Make the historical enum exhaustive:** modern types already work without it. A closed enum is not an appropriate native load admission rule.
- **Require dedicated views/default factories/per-type codecs:** generic views and generic persistence are legitimate. Contextual construction and data-only records need distinct support descriptions.
- **Treat every dispatch switch as duplication:** structural algorithms, import trust, extraction policy and reference remapping are separate authorities over behaviour.
- **Fix point endpoints, typos or legacy factory behaviour during migration:** these are compatibility changes needing separate characterization and approval.
- **Validate/re-enumerate all types or content during typing:** registration work belongs at assembly and bounded mutation boundaries; it must not add editor latency.

## 12. Decisions for review before implementation

No approval is needed to finish this investigation. The following choices should be resolved when authorising implementation:

1. **Standoff authority placement:** approve the proposed small category-definition index adapted from the existing property registration path, with VE retained as execution service. The critical contract is separate known-definition and active-binding queries; exact module/class naming is secondary.
2. **Legacy host support:** decide whether the old Workspace/Universe host must remain executable and tested, or only its saved representations supported. Until decided, preserve its classes and registration path; do not infer permission to delete it from the current App entry point.
3. **Legacy collision policy:** preserve the currently shadowed Embed builder as an explicit compatibility exclusion, or authorise a separate fix and qualification of the newly reachable builder. Similar old bind/fallback fidelity fixes are separate work.
4. **Descriptive scope for data-only records:** include retained package definitions and SQL-only Proposition descriptions with explicit storage support, or maintain a narrower native Block catalogue with linked domain documentation. Do not disguise inline atoms as ordinary editable Blocks.
5. **Uncertain names and deferred features:** choose retained unsupported descriptors versus explicit audit exceptions; deprecation/removal requires consumer evidence. No type renaming is recommended here.
6. **Behavioural inconsistencies:** schedule zero-width interoperability, tombstone presentation and old/current schema differences separately if desired. The registration plan can preserve and describe them without resolving them.

## 13. Assessment

Standardisation is worthwhile **within each category**. Blocks need a light extension and compatibility adapters; Block Properties need a small missing definition authority; Standoff Properties need a careful separation of type knowledge from their existing rendering and controller bindings. Shared conventions are useful, but a shared registry is unnecessary.

Begin with discovery, honest support descriptions and category-specific coverage/precedence tests. Keep wire formats and implementations stable, then move one registration family at a time. The result will provide a sound foundation for adding and validating native types during later TEI work, while leaving document-wide structural validation and conversion design to their proper stages.
