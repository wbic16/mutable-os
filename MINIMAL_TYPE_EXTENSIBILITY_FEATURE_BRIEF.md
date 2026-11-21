# Mutable OS — Minimal Type Extensibility Feature Brief

**Status:** architecture approved; implementation specification prepared for review. This task produces the brief only. No implementation or permanent demonstration types are authorised by the preparation of this document.

**Baseline:** repository `b6b2a43`; governing analysis: [Minimal Type Extensibility Qualification](MINIMAL_TYPE_EXTENSIBILITY_QUALIFICATION.md). This brief fixes the bounded M1–M6 contracts and supersedes the broader migration approach for this milestone.

## 1. Outcome

Make new, qualified native type declarations discoverable with minimal implementation work while preserving the existing runtime and persisted models:

1. Add read-only discovery to the existing `BlockRegistry`.
2. Add an independent Block Property definition index.
3. Add an independent Standoff Property definition index, with no connection to visual-effect execution.
4. Allow pure declarations to be consumed headlessly and reused by browser bindings.
5. Demonstrate a semantic container, existing alignment property and nonvisual editorial annotation in tests only.
6. Qualify compatibility, lifecycle and bounded-work behaviour with focused tests.

Blocks retain semantic identity in their type. Block Properties describe applied transformations; Standoff Properties describe supported textual targets and need not be visual. Existing records that use different historical conventions remain unchanged.

**The milestone does not implement semantic TextBlock specialisation.** A priority follow-up investigation is specified in §11. Its completion is not a dependency of M1–M6.

## 2. Scope boundaries and invariants

There are three category-appropriate discovery paths, not a universal registry. Do not introduce `extends`, `basedOn`, class migration, enum consolidation, a schema engine, generated historical catalogues or a plugin loader.

Keep these behaviours unchanged:

- Native envelopes, authored identifiers, codecs, content/placement ownership and retained definitions.
- Block Property array order, repeated instances and existing interpretation, including present handling of unknown/deleted properties.
- Standoff Cells, endpoints, rebasing, linked definitions, overlap handling and existing point limitations.
- Static styles, visual-effect membership, renderer precedence, feature flags and annotation UI/controller behaviour.
- Contextual factories, structural/input commands, Undo/Redo and typed reference remapping.
- Clipboard admission, opaque downgrade and SQL schemas/projection semantics.
- Legacy registration paths and existing document compatibility.
- Manual Document saving. Registry operations must not dirty documents, create history entries, save files or emit Markdown sidecars.

The new indexes are **partial declaration indexes**, initially empty in normal production editor construction. Missing membership means “not declared here”; it does not mean a saved property is invalid or that existing behaviour should stop. Native loading, rendering and editing must not consult these indexes as admission gates.

No demonstration registration, creation command, toolbar, menu item or feature activation is added to production assembly. `verse-group-block` and `editorial-deletion` remain test-only; `block/alignment` already exists in production, but its pilot declaration is also test-only in this milestone.

These are passive API additions with no new user-facing behaviour. No new feature flag is needed for the specified infrastructure or test fixtures; existing defaults remain unchanged. A later production feature using these APIs must follow the repository's feature-flag conventions on its own merits.

## 3. Concrete contracts

### M1 — Block registration discovery

Extend [BlockRegistry](src/block-tree/registry.ts) with exactly one new discovery operation:

```ts
list(): readonly BlockRegistrationInfo[];
```

Define the following pure types in **new** `src/block-tree/type-declarations.ts`:

```ts
export interface BlockTypeDeclaration {
  readonly type: string;
  readonly capabilities: readonly string[];
  readonly aliases?: readonly string[];
}

export interface BlockRegistrationInfo {
  readonly type: string;
  readonly capabilities: readonly string[];
  readonly aliases: readonly string[];
  readonly owner: string;
}
```

Required semantics:

| Concern | Contract |
| --- | --- |
| Membership | One entry per current primary registration. Aliases appear in its `aliases` array, not as separate rows. Disabled/unregistered definitions do not appear. |
| Ordering | Primary registration insertion order, using the existing Map order. Removal and re-registration place the new entry at the end. Do not sort capabilities or aliases. |
| Immutability | Return detached, frozen records, copied/frozen capability and alias arrays, and a frozen outer array. Mutating a result cannot mutate the registry. Previously returned snapshots remain unchanged after subsequent registration/disposal. |
| Content | Only type, capabilities, aliases and owner. Do not expose view/create callbacks, slot predicates, implementation objects or mutable registration references. Missing aliases produce an empty array. |
| Existing lookup | Retain `resolve`, `owner`, `hasCapability` and `typesWithCapability` unchanged. `resolve` remains the existing active runtime-binding lookup. No new `describe` method is needed. |
| Side effects | Listing does not notify subscribers, instantiate a view, call a factory, read document state or activate a feature. |
| Cost | O(number of active registrations plus returned arrays), only when explicitly requested. No caching/invalidation service or render-loop polling is needed. |

Do not freeze or otherwise alter existing stored `BlockTypeRegistration` inputs as part of this change. The new method's output isolation is sufficient. Existing registration collision, ownership and disposal semantics remain the authority.

The pure declaration type does not replace [BlockTypeRegistration](src/block-tree/types.ts), add a second Block registry or claim a structural grammar. It is a small shape that can supply the existing registration's metadata.

### M3 — Block Property definition index

Create **new** `src/properties/block-property-definitions.ts`, exporting:

```ts
export interface BlockPropertyDefinition {
  readonly type: string;
  readonly label?: string;
  readonly interpretedBy?: string;
  readonly validate?: (
    property: Readonly<Record<string, unknown>>
  ) => void;
}

export class BlockPropertyDefinitionIndex {
  register(definition: BlockPropertyDefinition, owner: string): () => void;
  get(type: string): Readonly<BlockPropertyDefinition> | undefined;
  owner(type: string): string | undefined;
  list(): readonly Readonly<BlockPropertyDefinition>[];
  dispose(): void;
}
```

`interpretedBy` is an optional reference naming the existing consumer, such as `blockAppearance`; it is descriptive information, not an interpreter resolver or loader. `validate` is an optional, explicitly callable validator reference. The index never invokes it. New transformations still require real implementation in an appropriate trusted consumer; declaring a name does not implement behaviour.

The index must not import [appearance.ts](src/rendering/appearance.ts), legacy schemas, DOM helpers, Solid or `ReactiveEditor`. Do not change those interpreters to consume it. It supports non-presentational transformations through declarations and optional explicit validators without requiring a renderer field.

### M4 — Standoff Property definition index

Create **new** `src/properties/standoff-property-definitions.ts`, exporting:

```ts
export interface StandoffPropertyDefinition {
  readonly type: string;
  readonly label?: string;
  readonly validate?: (
    property: Readonly<Record<string, unknown>>
  ) => void;
}

export class StandoffPropertyDefinitionIndex {
  register(definition: StandoffPropertyDefinition, owner: string): () => void;
  get(type: string): Readonly<StandoffPropertyDefinition> | undefined;
  owner(type: string): string | undefined;
  list(): readonly Readonly<StandoffPropertyDefinition>[];
  dispose(): void;
}
```

A definition containing only `type` is valid. Do not add mandatory renderers, handlers, authoring UI, range schemas or controller bindings. The index must not import or call [VisualEffectRegistry](src/runtime/visual-effect-registry.ts), static styles, passive effects or annotation UI contributions. Rendering and editing must not begin reading the index.

In particular, registering a definition must leave `editor.visualEffects.type(type)` unchanged. An empty VE renderer array is **not** the implementation of a metadata-only definition: current rendering treats VE membership as a precedence decision.

### Shared behavioural requirements for the two independent indexes

Use separate stores/classes; the same exact ID may be registered once in each category. No shared category-spanning singleton or generic plugin framework is required.

| Concern | Required behaviour |
| --- | --- |
| Identity validation | Require a string type and owner containing at least one non-whitespace character. Preserve exact supplied strings; do not trim, case-fold, normalise or add aliases. Optional label/interpreter fields, when supplied, must be strings; a supplied validator must be a function. |
| Duplicate handling | Reject an occupied type, including duplicate registration by the same owner. Fail before mutation. Diagnostic identifies the category, type, existing owner and attempted owner. No automatic replacement/merge. |
| Input isolation | Store a shallow copied/frozen definition. Fields are scalars and an optional function reference; do not freeze caller-owned objects or clone/execute the function. Later mutation of the caller's definition does not change the stored entry. |
| Lookup/discovery | `get` returns the frozen stored definition or undefined; `owner` returns the owner separately. `list` returns a frozen array in registration order. Reads do not execute validators. No subscriptions or reactive signals in this milestone. |
| Registration disposer | Idempotent; removes only its exact registration. A stale disposer must not remove a later replacement after the original was released. No document/property mutation. |
| Index disposal | Idempotently clear entries and close the instance. Reads then return undefined/empty; subsequent registration throws a category-specific disposed error. Outstanding registration disposers remain harmless. |
| Complexity | Map lookup/register/release O(1) apart from diagnostic/definition size; list O(entries); dispose O(entries). No document access or background work. |
| Interpretation | Declaration presence does not execute a transformation, grant an operation, validate existing data, render a mark or author a property. |

Do not add alias support, schema versions, async validator orchestration, automatic validation on edits, persistence hooks or universal migration checks. A validator must be a pure/headless reference for declarations intended for headless use; trusted callers own invocation and error handling.

### M2 — Pure declarations and headless consumption

Use ordinary exported constants, not a new manifest service. The production API modules above must be importable without `window`, `document`, Solid, JSX, renderer modules, application activation or a `ReactiveEditor` instance.

For the pilot, put the declarations in **new test-support-only** `src/block-tree/test-support/minimal-type-declarations.ts`. Export:

- `verseGroupDefinition: BlockTypeDeclaration`, with type `verse-group-block` and explicit `container`/`selectable` capabilities.
- `alignmentDefinition: BlockPropertyDefinition`, with type `block/alignment` and `interpretedBy: 'blockAppearance'`.
- `editorialDeletionDefinition: StandoffPropertyDefinition`, with type `editorial-deletion` and no visual binding.

The module may export a small read-only tuple of these Block declarations for headless enumeration. It must not import browser bindings or register anything at module evaluation. Test imports alone establish no active behaviour. Do not export this fixture from production barrels or import it in application/core assembly.

Browser tests consume the same constants. Copy readonly capability/alias arrays when supplying the current mutable-array `BlockTypeRegistration` interface; do not widen that existing interface merely to avoid a small adapter.

Pure declarations describe **declared** support; `BlockRegistry.list()` describes **active** registrations in a particular editor. Do not merge the meanings or make a negative lookup in this partial vocabulary reject historical documents.

### M5 — Minimum lifecycle integration

Add two fields to [ReactiveEditor](src/reactive-editor/editor.ts):

```ts
readonly blockPropertyTypes = new BlockPropertyDefinitionIndex();
readonly standoffPropertyTypes = new StandoffPropertyDefinitionIndex();
```

Both start empty. Each editor owns separate instances. Dispose both immediately after the existing `featureHost.dispose()` call, preserving the surrounding disposal order. This lets feature-owned registration disposers run before the indexes close; any remaining registrations are then released by index disposal.

Use the existing [FeatureScope](src/runtime/features.ts) ownership mechanism:

```ts
scope.own(editor.blockPropertyTypes.register(alignmentDefinition, scope.owner));
scope.own(editor.standoffPropertyTypes.register(editorialDeletionDefinition, scope.owner));
```

No new feature capability interface, public application service, automatic built-in seed, global singleton or event subscription is required. Application adapters with existing editor access are the integration boundary for future production features; a feature without editor access can receive a narrowly scoped registration function from its existing adapter when needed.

Headless callers instantiate either index directly. They do not construct an editor to use declarations or lookup.

## 4. Test-only demonstrations — M6

### A. Semantic container

In a test-owned FeatureScope, register the pure `verseGroupDefinition` with the existing [GenericContainerView](src/rendering/core-block-views.tsx). Select capabilities explicitly. An optional test factory returns a fresh empty `{type, children:[]}` DTO; it must not reuse or retag a contextual factory.

Create the group under a standard `document-block`, with two ordinary `standoff-editor-block` children and intrinsic payload metadata. Demonstrate:

1. Distinct registration and authored type, shared renderer, and no new class or enum entry.
2. Existing child editor mount/input path, ordinary typing/caret behaviour and property display. Verify a mounted input path, not only direct payload changes.
3. Existing insertion planner acceptance through `container`; child insertion/move and group move/remove with Undo/Redo. Preserve content/placement identity for moves and surviving content.
4. Native save/reload retains the distinct type, metadata and ordered child graph. Compare through the existing native codec, with stable authored/durable identities; do not substitute nested DTO serialization for native round-trip evidence.
5. Reload in a fresh editor without pilot registration preserves data and displays the existing unknown-type fallback with editable ordinary descendants.
6. `list()` does not invoke the optional factory. If the factory is present, an explicit caller can use it and ordinary commands allocate identities/placement.

Do not claim ContainerBlock-specific dissolve, fixed-height, list-item or arbitrary cross-container selection behaviour. Do not modify exact-name checks to make the demonstration appear more capable.

### B. Existing alignment property

Register `alignmentDefinition`; leave AP untouched. Apply an ordered array containing two `block/alignment` instances plus an unrelated retained property. Verify the existing last-assignment result and preservation of every instance, order, value and ID through native round trip and Undo/Redo.

Release the declaration and verify authored records and existing AP output remain unchanged. This demonstrates registration of an **existing interpreted type**, not implementation of a novel transformation. A separate unit fixture can exercise an optional validator reference without adding a production validator or automatic invocation.

### C. Nonvisual editorial annotation

Register `editorialDeletionDefinition` only in the new Standoff index. Apply it to a nonempty range in an ordinary TextBlock using [RangeAnnotations](src/runtime/range-annotations.ts). Include a Unicode code point outside the BMP so the test exercises Cell rather than UTF-16 addressing.

Verify discovery, generic [annotation monitor](src/rendering/annotation-monitor.tsx) inspection, native save/reload, range rebasing and Undo/Redo. Overlay an existing visual style so absence of precedence changes is observable. Run the presentation case with `standoffPropertyRendering` both enabled and disabled.

The text stays visible and unchanged by the semantic name. There is no new underline, strike, hiding, deletion, VE binding or annotation handler. Record arrays and existing range semantics supply the behaviour; the index supplies recognition/discovery only.

### D. Admission and unsupported cases

Exercise the real [serializer](src/interchange/serializer.ts) and [materializer](src/interchange/materialize.ts): the new container still becomes `mutable/opaque-block`, and the editorial annotation still becomes `mutable/opaque-property`. Check retained original data and relevant child/property structure. Do not assert active semantic clipboard parity or widen admission to make a test pass.

Retain a negative codec test for `verse-line-block`: a new text DTO produces no native Cells under that name, and native inline content retagged with it is rejected by the current codec. This is a documented support boundary, not a permanent requirement that semantic text types remain unsupported. The priority follow-up can replace this test when separately approved.

## 5. Exact implementation surface

Proposed new paths below are specification targets, not files created by this brief.

| File | Change |
| --- | --- |
| `src/block-tree/type-declarations.ts` — new | Pure `BlockTypeDeclaration` and `BlockRegistrationInfo` types only. |
| [src/block-tree/registry.ts](src/block-tree/registry.ts) | Add detached read-only `list()`; type-only import of the discovery shape. Existing methods retain behaviour. |
| `src/properties/block-property-definitions.ts` — new | Independent pure definition interface and index. |
| `src/properties/standoff-property-definitions.ts` — new | Independent pure definition interface and index; no VE dependency. |
| [src/reactive-editor/editor.ts](src/reactive-editor/editor.ts) | Two empty per-editor indexes, imports and disposal after feature host teardown. No editing/rendering call-site changes. |
| `src/block-tree/test-support/minimal-type-declarations.ts` — new | Pure test-only pilot declarations; no side effects. |
| `src/block-tree/registry-discovery.test.ts` — new | Block listing semantics, isolation and unchanged alias/capability/owner lookup. |
| `src/runtime/type-definition-indexes.test.ts` — new | Node-environment index contracts, pure declarations, ownership, validator nonexecution and category independence. |
| `src/block-tree/minimal-type-compatibility.test.ts` — new | Native/legacy preservation, real clipboard downgrade and explicit semantic-text codec limitation. |
| `src/rendering/minimal-type-extensibility.test.tsx` — new | Mounted pilots, editor lifetime, annotation inspection, rendering parity, command/Undo and bounded-work assertions. Reuse existing test helpers. |

The new tests live under paths already included by [tsconfig.reactive.json](tsconfig.reactive.json); property implementation modules are transitively included through imports. No new build system, test runner, registry generator or server dependency is required.

Do not change [core view registrations](src/rendering/register-core-views.ts), [application feature assembly](src/application/features.ts), [feature API](src/feature-api/index.ts), [appearance](src/rendering/appearance.ts), [static styles](src/rendering/standoff-styles.ts), [VE](src/runtime/visual-effect-registry.ts), [StandoffEditorView](src/rendering/standoff-editor-view.tsx), persistence, clipboard policy, SQL, structural/input implementations or legacy class/enum/schema tables. Tests may exercise these files without modifying them.

If an implementation discovers that passing the bounded pilot requires a change in one of these excluded behaviours, report the concrete blocker instead of broadening the milestone or weakening the assertion.

## 6. Acceptance and regression gates

| ID | Required evidence |
| --- | --- |
| A1 — Block snapshots | Empty and populated listing; alias grouping; registration order; correct owner; detached/frozen nested arrays; stale snapshots stable; no callbacks or subscription notification during reads; existing alias and capability queries unchanged. |
| A2 — independent indexes | Minimum definitions accepted; malformed identity/owner rejected without mutation; duplicate owner diagnostics; same ID valid across categories; shallow input isolation; frozen results; deterministic order. |
| A3 — lifecycle | Release twice; release then re-register then call stale disposer; partial FeatureHost activation failure rolls back all pilot registrations; two editors isolated; editor disposal closes both indexes; post-disposal reads empty and registration rejected. |
| A4 — headless | Node-environment imports of pure modules/fixtures with no `window` or `document`; instantiate and discover definitions without editor/renderer activation. Review the import graph for runtime UI dependencies; do not treat a jsdom test as proof of headless support. |
| A5 — container behaviour | Mounted shared view, normal child input, insertion/move/remove and Undo/Redo, native round trip and fresh-editor unknown fallback preserve semantic identity and structure. |
| A6 — property multiplicity | Repeated alignment instances retain ordering/IDs/values; current cascade output unchanged before/after declaration release and save/reload. |
| A7 — nonvisual semantics | Registered editorial annotation is inspectable and rebases normally; text unchanged; existing overlapping visuals and VE bindings unaffected under both rendering flag settings. |
| A8 — no authoring side effects | Register/get/list/release/index disposal produce zero repository-change notifications, unchanged repository revision and Undo/Redo availability, and no persistence/dirty-state activity. Set up call-through spies after editor initialization; do not disable canonical validation. |
| A9 — bounded editing work | During representative child typing and annotation editing, the new get/list/validator methods are not invoked automatically. Check existing full-snapshot/reference-rebuild/projection-rebuild spies where applicable; no new full-document/vault/indexing or geometry work. Use existing bounded-work test patterns. |
| A10 — compatibility boundaries | Native/legacy fixtures pass; unknown definitions remain loadable; real clipboard preserves its current opaque policy; no new target remapping or SQL schema changes. Run existing saved-projection regression coverage. |
| A11 — production isolation | No production module imports the pilot fixture or registers the new example IDs; both property indexes remain empty after normal application assembly. Existing `block/alignment` interpretation still works. No new UI, command or flag-default changes. |
| A12 — scope | Production diff is confined to the five implementation modules in §5. No data migration, native format change, interpreter rewrite or semantic TextBlock implementation. Any necessary deviation is explained before expansion. |

For performance checks, use [range-annotation bounded-work tests](src/runtime/range-annotations.test.ts) and [inline performance tests](src/block-tree/inline-performance.test.ts) as patterns. Capture any expensive expected save/round-trip evidence outside the measured typing window. Do not weaken invariants by mocking validation away. Real Flint before/after measurements are required if a later change affects a hot path or raises a performance concern; adding passive indexes is not authority to alter geometry or input scheduling.

### Validation run for implementation

Run the four new suites and the relevant existing checks:

- [runtime/features.test.ts](src/runtime/features.test.ts) and [application/feature-capabilities.test.tsx](src/application/feature-capabilities.test.tsx).
- [rendering/unknown-feature.test.tsx](src/rendering/unknown-feature.test.tsx), [runtime/range-annotations.test.ts](src/runtime/range-annotations.test.ts), and [rendering/annotation-monitor.test.tsx](src/rendering/annotation-monitor.test.tsx).
- [runtime/visual-effect-registry.test.tsx](src/runtime/visual-effect-registry.test.tsx) and [rendering/standoff-styles.test.ts](src/rendering/standoff-styles.test.ts).
- [persistence/native-resource.test.ts](src/persistence/native-resource.test.ts), [block-tree/compatibility-fixtures.test.ts](src/block-tree/compatibility-fixtures.test.ts), [rendering/mutable-clipboard.test.tsx](src/rendering/mutable-clipboard.test.tsx), and [knowledge-sqlite/saved-projection.test.tsx](src/knowledge-sqlite/saved-projection.test.tsx).
- [block-tree/inline-performance.test.ts](src/block-tree/inline-performance.test.ts) and the project's `npm run typecheck`.

Use the existing Vitest invocation (`node node_modules/vitest/vitest.mjs run ...`) with these explicit paths; no new runner is needed. If baseline checks fail for unrelated reasons, report the exact failure and baseline comparison instead of fixing unrelated subsystems. Broaden testing only for a demonstrated concern.

These are future acceptance requirements. No implementation tests are claimed as executed while preparing this brief.

## 7. Minimum integration points for future native types

| Future addition | Required integration | Not automatically supplied |
| --- | --- | --- |
| Semantic container reusing generic behaviour | One pure Block declaration; one browser binding using the existing view and explicit capabilities/owner; existing insertion path, with a context-free factory only if useful. | Exact-name container conveniences, specialised child grammar, clipboard admission or a text editor on the container itself. |
| Block with genuinely new behaviour | Same declaration/BR binding plus the implementation actually needed. Keep contextual creation in its appropriate factory/controller. | Class inheritance, broad default/factory inheritance and ownership permissions. |
| Block Property definition | One pure definition and owned registration in `blockPropertyTypes`; an explicit trusted consumer if new transformation behaviour is needed. | AP execution for arbitrary new IDs, automatic validation or an applied semantic identity for a Block. |
| Nonvisual Standoff Property | One pure definition and owned registration in `standoffPropertyTypes`; existing range commands for ordinary supported targets. | Rendering, new range kinds, point interoperability or arbitrary cross-Block selection. |
| Visual/interactive Standoff feature | The semantic declaration above plus deliberate existing VE/static/controller/UI bindings that the feature needs. Keep those lifetimes separately owned. | Renderer registration through the definition index or automatic precedence changes. |
| Headless consumer | Import pure definitions and the appropriate pure index; enumerate only its qualified vocabulary. | Full historical catalogue, active browser availability or automatic UI activation. |
| New externally admitted semantics | Separate explicit admission/validation and typed-target qualification in the existing interchange boundary. | Trust based on registration. No such policy change belongs in this milestone. |
| Genuine semantic TextBlock | Completion of the priority qualification in §11, followed by a separately approved bounded implementation. | Support from merely sharing `StandoffEditorView` or adding `inline-editor` capability. |

Adding a type should not require touching legacy enums, old builders, generic native codecs or unrelated application registration tables. The table also identifies the genuinely necessary integration when the new type adds behaviour rather than just identity. Do not hide those costs behind a declaration that has no consumer.

## 8. Delivery sequence

1. **M1/M2:** introduce the pure Block declaration/info shapes and snapshot listing, with unit/headless tests. No production type entries move.
2. **M3/M4:** implement the two independent indexes and their contract tests. Keep both dependency-free at runtime and independent of rendering.
3. **M5:** add per-editor ownership/disposal and test scoped activation, rollback and isolation. Production indexes remain empty.
4. **M6:** add test-only declarations and mounted/compatibility demonstrations. Exercise existing codecs and clipboard policy unchanged.
5. **Qualification:** complete acceptance gates, typecheck and focused existing suites; document actual support and retained limitations in the implementation handoff.

The Block discovery and each property-index unit can be reviewed independently. Mounted demonstrations depend on those units and editor lifetime integration. No legacy migration or semantic-text work is a dependency.

Rollback is removal of the new passive APIs and their editor fields after removing their callers/tests. It requires no authored data rewrite because no production demo types, automatic conversions or persistence changes are introduced.

## 9. Implementation handoff requirements

The eventual implementation report must state:

- Delivered APIs and exact source files, with any deviation from §5 explained.
- Which pilot behaviours were exercised through mounted input versus direct commands.
- Actual checks run and results, including lifecycle and bounded-work evidence.
- Native compatibility evidence and the unchanged clipboard downgrade.
- Confirmation that the demonstration declarations remain test-only and normal indexes are empty.
- Known limitations: no semantic TextBlock family, no new point support, no automatic interpreters, no complete historical catalogue, and no implied external-content admission.

Do not mark the milestone complete solely because arbitrary strings survive generic storage. The mounted container, unchanged alignment interpreter and renderer-independent annotation cases must satisfy their specified gates.

## 10. Work explicitly excluded

Do not migrate old Blocks or schemas, fix the legacy Embed builder collision, consolidate historical enums/factories, convert all static styles into VE renderers, introduce universal schema/default inheritance, broaden restoration/import allowlists, repair zero-width representations, or add TEI mappings/conversion/fallback code.

Those findings remain valid context, but they do not justify expanding this implementation. Source provenance or arbitrary intrinsic metadata in pilot fixtures is preservation evidence, not an XML losslessness claim.

## 11. Priority follow-up investigation: genuine semantic TextBlocks

**Priority: next architectural investigation. Status: flagged for separate investigation only; no implementation in M1–M6.**

**Question:** how can a type such as `verse-line-block` retain its semantic identity while being a genuine Cell-bearing, editable TextBlock using the existing editor? The target is a small, explicit text-host extension, not an editor rewrite, legacy-class port or universal inheritance framework.

### Required investigation areas

| Boundary | Evidence to investigate and decision required |
| --- | --- |
| Text construction | [decodeBlockTree](src/block-tree/codecs.ts) currently builds Cells only for the exact standoff type. Determine the smallest pure/headless text-host classification that works during construction and reload. |
| Native grammar and authored identity | [portable codec](src/history/stage-c-gates/portable.ts) restricts inline hosts; [native-resource](src/persistence/native-resource.ts) checks authored/canonical agreement. Retain the semantic ID, assess new-file support in older readers, and do not assume an alias solves it. |
| Range source and selection | [ReactiveEditor](src/reactive-editor/editor.ts) selects range coordinates by concrete type; [cross-block selection](src/runtime/cross-block-selection.ts) also checks exact names. Separate necessary text eligibility from legitimate structural/visibility barriers. |
| Enter, split and join | [commands.ts](src/block-tree/commands.ts) clones type on an interior split but hardcodes the base type for an empty sibling; joining retains the left payload. Specify same-kind and different-kind semantics, intrinsic attribute handling and what protects semantic identity from being discarded. |
| Input and commands | Inspect [gateway](src/input/gateway.ts), [cross-block input](src/input/cross-block-input.ts), [lists](src/runtime/text-lists.ts), [text tabs](src/runtime/text-tabs.ts) and menus. Identify guards to retain, generalise or deliberately leave unsupported; no global search-and-replace. |
| Performance | [inline planning](src/block-tree/inline-plan.ts), [split planning](src/block-tree/split-plan.ts) and repository fast paths must remain bounded. Determine whether widening a name check could silently trigger full planning. |
| Rendering and host features | Reuse StandoffEditorView; assess hardcoded DOM type labels, caret/IME, existing formatting, inline images, Gloss/Entity/Phosphor assumptions and temporary geometry. No parallel text renderer. |
| Transfer, reload and indexing | Assess clipboard/export, typed targets, SQL coordinate extraction, disabled implementations and unknown fallback. Keep native retention, active editing and untrusted admission as distinct support claims. |

Compare use of existing `inlineKind`, a bounded pure implementation-family predicate, and explicit operation capabilities. Prefer the smallest mechanism that reduces per-type edits; do not assume these alternatives are interchangeable or that a broad capability grants every semantic operation.

The investigation should produce a separate qualification document with an exact change map, proposed creation/split/join policies, compatibility assessment, performance risks, and a test-only `verse-line-block` proof-of-concept specification. It must identify which existing boundaries can be reused unchanged and which need targeted qualification.

Success means a credible route to distinct semantic identity, correct Cell/native round trips, ordinary input and Undo/Redo, bounded editing work and explicit mixed-type structural policies. Generic payload retention, alias-only view reuse or a container wrapping a normal TextBlock must not be presented as proof of genuine text-bearing specialisation.

M1–M6 should not add speculative hooks to anticipate this investigation. Its findings can build on the approved discovery APIs without making this milestone larger.
