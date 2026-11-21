# Mutable OS — Minimal Type Extensibility Qualification

Architectural investigation • 19 November 2026 • repository revision `b6b2a43` (production sources unchanged from `db3ed30`; the intervening commit adds the two earlier reports)

This report requalifies the earlier [consolidation plan](UNIFIED_TYPE_REGISTRY_CONSOLIDATION_PLAN.md) against the narrower objective. It recommends no comprehensive historical migration. No production code, permanent demonstration types, converter, data migration or new proof-of-concept implementation was added. The executable checks below used existing code and temporary in-memory data only.

## 1. Executive recommendation

**Change less than the previous plan proposed.** Retain the current Block registry, introduce two small independent property definition indexes, and demonstrate a semantic **container** using the existing generic view. Do not add `extends`, change rendering precedence, replace factories, or migrate legacy classes.

The important qualification is that **sharing a view is already sufficient for a basic semantic container, but is not sufficient for a semantic TextBlock**. A hypothetical `verse-line-block` encounters exact-type assumptions in decoding, native inline serialization, text-range access, input and commands. It should not be advertised as an ordinary TextBlock merely because it mounts `StandoffEditorView`.

| Immediate objective | Smallest useful approach | Qualification |
| --- | --- | --- |
| Distinct semantic container | Register its own type with `GenericContainerView` and explicitly chosen capabilities. | Existing native codec retains the type and child structure. Ordinary child editing remains available. Container-specific conveniences and clipboard admission are separate. |
| Block Property registration | A small `register/get/list` index with duplicate checks, optional validator and interpreter reference. Pilot with existing `block/alignment`. | Does not change `blockAppearance`, ordering, multiplicity or persistence. A new name alone does not implement a new transformation. |
| Nonvisual Standoff Property | A separate `register/get/list` definition index, completely independent of visual-effect lookup. | Existing records, native persistence, ordinary range editing and generic annotation inspection already accommodate arbitrary type strings. |
| Discovery without UI activation | Pure declarations for the new supported vocabulary; browser bindings consume those same declarations. Add a read-only Block registry listing. | Do not promise an exhaustive headless catalogue of every historical type in this milestone. |
| Semantic TextBlock subtype | Defer the optional `verse-line-block` demonstration; document the exact blockers and qualify a separate text-family change if needed. | No simple alias, view registration or class inheritance solves the current persistence/editing constraints. |

The smallest successful milestone is therefore the three required demonstrations—semantic container, registered existing Block Property, and nonvisual semantic annotation—with honest support boundaries. It does **not** establish arbitrary TextBlock specialisation, active round-trip clipboard support for new names, or lossless XML reconstruction.

The conceptual distinctions in the brief are sound for new vocabulary: semantic identity belongs in the Block type; intrinsic attributes can live in its payload; Block Properties supply composable transformations; Standoff Properties describe supported textual targets. Existing semantic Block Properties such as Entity references and resource annotations can remain as they are. This conceptual direction does not justify rewriting historical records.

## 2. What the implementation already provides

### 2.1 Distinct authored Blocks without classes

[BlockRegistry](src/block-tree/registry.ts) stores an open string `type`, a view, capability strings, optional aliases, optional default factory and slots. It already rejects duplicate names/aliases and tracks owners and disposers. [BlockTypeRegistration](src/block-tree/types.ts) does not require a TypeScript Block class. [Core registration](src/rendering/register-core-views.ts) already assigns the same view to several unrelated type identifiers, including generic containers, table/grid families and tab panels.

[BlockOutlet](src/rendering/block-outlet.tsx) resolves the projected `viewType` and mounts the registered view. [GenericContainerView](src/rendering/core-block-views.tsx) renders child and relation outlets and applies existing Block appearance. It does not require the parent to be literally `container-block` to display and edit its ordinary descendants.

The authored type is retained in the payload; canonical content, placements and occurrences remain separate. [Tree codecs](src/block-tree/codecs.ts) preserve an unfamiliar container's type and nested children. [Native persistence](src/persistence/native-resource.ts) preserves authored bags and explicit ownership without requiring a registered view. A new semantic container inside an ordinary Document therefore needs no dedicated codec or schema migration.

This is a claim about container-shaped content, **not every arbitrary type/structure combination**. Native persistence has specific inline-host restrictions, reserved fields and ownership validation. The Document resource root also has existing identity rules; a semantic child container should not be substituted for `document-block` as an experiment in document-root inheritance.

### 2.2 Property records already exist independently of registries

Block Properties are ordered authored records in `payload.blockProperties`. Standoff Properties are authored records in `payload.standoffProperties`, or local segments referring to shared definitions. Unknown type strings can survive native save/reload. Neither category needs a new instance model merely to make names discoverable.

[RangeAnnotations](src/runtime/range-annotations.ts) takes a type string and applies ordinary nonempty ranges through the existing command path. It does not require a visual effect registration. [Annotation commands](src/block-tree/annotation-commands.ts) and the [annotation monitor](src/rendering/annotation-monitor.tsx) provide generic range/value/metadata operations; specialised details are optional. [Range replacement](src/interchange/ranges.ts) rebases ordinary annotation records independently of their semantic type.

This means the missing Standoff facility is primarily **definition/discovery**, not storage, range representation or an inert rendering implementation. A nonvisual annotation can legitimately have no mark in the text. It is still available to generic annotation inspection when the ordinary range/monitor path applies.

### 2.3 Existing preservation does not imply every consumer supports a type

The distinctions below must remain explicit:

| Capability | Current authority |
| --- | --- |
| Active Block view, capability and ownership lookup | `BlockRegistry` |
| Native authored data retention | Native codecs and resource/ownership validators |
| Block Property appearance | [blockAppearance](src/rendering/appearance.ts) and specialised consumers |
| Standoff visual effects | [VisualEffectRegistry](src/runtime/visual-effect-registry.ts), [static styles](src/rendering/standoff-styles.ts), [passive effects](src/runtime/effect-contributions.ts) |
| Annotation UI | [AnnotationContributions](src/runtime/annotation-contributions.ts), monitor and controllers |
| Clipboard admission | [materializeFragment](src/interchange/materialize.ts), separate from registries |
| Typed reference remapping | [interchange serializer](src/interchange/serializer.ts), [canonical clipboard](src/block-tree/clipboard.ts) |
| SQL projection/indexing | [saved projection](src/knowledge-sqlite/saved-projection.ts), [facts collector](src/knowledge/collect-facts.ts) and extraction policy |

Do not make registration imply import permission, an executable callback, safe source content, a SQL relationship, or support for every structural operation.

## 3. Lightweight semantic Block specialisation

### 3.1 A semantic container needs no inheritance mechanism

The following uses the current registration shape. It is illustrative, not installed code:

```ts
// Pure declaration: readable without importing a renderer or creating an editor.
export const verseGroupDefinition = {
  type: 'verse-group-block',
  capabilities: ['container', 'selectable'],
};

// Browser binding: the implementation is deliberately shared.
scope.own(editor.registry.register({
  ...verseGroupDefinition,
  view: GenericContainerView,
  create: () => ({ type: verseGroupDefinition.type, children: [] }),
}, scope.owner));
```

The separate declaration and binding do not duplicate the identity. One supplies pure information; the other connects it to an existing implementation. The optional `create` function is sufficient for a context-free empty container. Existing insertion commands allocate/check identities and establish placement; the registry does not perform insertion itself.

For this limited shape, the semantic type remains `verse-group-block` in authored data and in canonical `viewType`. Its content can consist of ordinary TextBlocks and other children. There is no need to encode “verse group” as a Block Property, add an enum member, subclass `AbstractBlock`, or introduce a new native wire field.

### 3.2 The exact extent of reused behaviour

| Question | Verified answer for a generic semantic container |
| --- | --- |
| Same renderer, distinct saved ID? | Yes. Distinct BR entry with the same view; generic codecs retain the ID. |
| Editing without a new class? | Yes for ordinary tree operations and existing child editors. The container itself is not a text input. |
| Default construction? | A small explicit empty DTO factory works. `container-block` itself has no registered factory to inherit in CORE. |
| Shared capabilities? | Explicitly select `container`/`selectable`; do not blindly spread every base registration field. |
| Save/reload? | Yes as an owned child or properly retained definition in an ordinary native Document; common structural validation still applies. |
| Insertion? | [InsertionPlanner](src/block-tree/insertion-planner.ts) uses registered slots or a `container` fallback. The fallback accepts all child descriptors; it is not a semantic content grammar. |
| Move, remove, internal copy, Undo/Redo? | Existing [tree commands](src/block-tree/commands.ts) operate principally on records/placements. Internal canonical copy differs from external clipboard admission and has existing legacy-export limitations. Qualify representative operations in the proposed pilot. |
| Text selection? | Ordinary TextBlock descendants retain their behaviour. Cross-Block drag selection retains current sibling/visibility barriers; a new wrapper does not grant selection across arbitrary nested containers. |
| All ContainerBlock conveniences? | No. Height handling in GenericContainerView, dissolve/group paths in [block-surfaces](src/runtime/block-surfaces.ts), list-item checks and some menu ancestry checks use exact `container-block`. Do not generalise them unless requested behaviour requires it. |
| Clipboard round trip as the same active type? | No, not automatically. The materializer's passive Block allowlist does not include the new name; it becomes `mutable/opaque-block`. |
| SQL? | Saved projection records arbitrary Block typename/authoredType and traverses ordinary children. No new SQL table is required for a container. New reference semantics are not inferred from its payload. |
| Legacy class changes? | None for this reactive declaration. Old applications may use their unknown-type fallback; their class builders need not be migrated. |

Not inheriting “dissolve this generic grouping” can be desirable for a meaningful semantic object. Preserve that distinction rather than making every container-shaped semantic object interchangeable with an incidental grouping wrapper.

### 3.3 Default construction and capabilities must be selected, not inherited wholesale

Factories can capture resources, feature ownership, asset identity, relationships, children or host context. Retagging the result of an arbitrary `base.create()` is unsafe: its payload and children may still express the original type's invariants. Many current core registrations omit `create`; resource/menu/controller factories remain necessary.

Similarly, `opaque-widget` affects knowledge extraction, `container` affects insertion, and application bindings carry owner-specific runtime restrictions. Copying aliases can immediately collide; copying a feature-bound view can retain assumptions about the original owner. Prefer an explicitly imported shared implementation, explicit capabilities, and a fresh context-free factory where appropriate.

The [feature capability adapter](src/application/feature-capabilities.tsx) exposes a self-bound widget runtime rather than arbitrary child outlets. Do not force a generic container through that adapter solely to reuse its registration syntax. Existing application/core assembly can use the low-level owned registry registration, as other feature adapters already do. Use [FeatureScope](src/runtime/features.ts) to retain lifecycle ownership; no new plugin framework is needed.

### 3.4 Why aliases are not semantic specialisation

BR aliases resolve to the same registration and owner. They do not change the canonical decoder's classification or establish an independently discoverable semantic definition. The only built-in normalization in `viewTypeFor` is the older document aliases.

An alias can preserve its authored spelling in some native paths, but that does not establish separate semantics. In particular, aliasing `verse-line-block` to `standoff-editor-block` only supplies the view lookup: [decodeBlockTree](src/block-tree/codecs.ts) still sees the unfamiliar authored type and produces no Cells. Use aliases for synonymous compatibility spellings, not for meaningful new Block kinds.

### 3.5 A semantic TextBlock is not currently a registration-only extension

These are verified blockers, not hypothetical objections:

| Source | Exact assumption | Consequence for `verse-line-block` using StandoffEditorView |
| --- | --- | --- |
| [codecs.ts](src/block-tree/codecs.ts), `decodeBlockTree` | `input.type === "standoff-editor-block"` determines text-to-Cell decoding and `inlineKind`. | A DTO with new type and `text` retains a payload string but has no inline Cells. Sharing the view does not repair it. |
| [portable.ts](src/history/stage-c-gates/portable.ts), encode/decode | Encoder requires the canonical inline host to be `standoff-editor-block`; decoder permits `inline` only for that exact authored type. | Manually attaching inline content is not a valid native round trip for the new type. |
| [native-resource.ts](src/persistence/native-resource.ts), [portable.ts](src/history/stage-c-gates/portable.ts) | Authored type must agree with `viewTypeFor(authoredType)`. | Setting only runtime `viewType` to the old text type is not an adequate workaround. |
| [ReactiveEditor](src/reactive-editor/editor.ts), TextRanges source callback | Explicit list of text types; Cell coordinates selected by exact standoff name. | New text names cannot use ordinary text-range snapshots just by advertising `inline-editor`. |
| [cross-block-selection.ts](src/runtime/cross-block-selection.ts) | Endpoints, traversal and document selection test exact standoff type. | Selection rejects/skips the new type. |
| [input gateway](src/input/gateway.ts), [cross-block input](src/input/cross-block-input.ts) | Neighbour/boundary handling checks exact types; paragraph creation uses the standard name. | Keyboard navigation, merges and new paragraphs need qualification. |
| [commands.ts](src/block-tree/commands.ts) | List wrapping checks exact type; `insertEmptyStandoffSibling` explicitly emits `standoff-editor-block`. | Enter at a boundary can create a different semantic type. Mid-paragraph `splitStandoff` instead clones payload/type. This inconsistency needs an explicit policy. |
| [commands.ts](src/block-tree/commands.ts), `joinStandoff` | Both sides need `inlineKind:standoff`; left payload survives and right definition is consumed. | Simply broadening access can silently erase the right Block's different semantic identity. Cross-kind joining needs a rule. |
| [split-plan.ts](src/block-tree/split-plan.ts) | Empty paragraph fast path checks exact standoff type. | A functional port could fall back to broader planning and regress bounded-work performance. |
| [text-lists](src/runtime/text-lists.ts), [text-tabs](src/runtime/text-tabs.ts), [tab commands](src/runtime/tab-commands.ts), [Block menus](src/runtime/block-menu-actions.ts) | Eligibility and construction use concrete names. | Capabilities alone do not enable these operations. Some restrictions may be appropriate and should remain. |
| [StandoffEditorView](src/rendering/standoff-editor-view.tsx) | DOM `data-block-type` is hardcoded; rendering consumes pre-existing Cells. | Mounting the view is neither proof of correct identity reporting nor a way to construct text state. |
| [interchange](src/interchange/materialize.ts), [serializer](src/interchange/serializer.ts) | Admission is explicit; serializer uses canonical `viewType`. | A runtime alias workaround can lose semantic identity or become opaque during transfer. |

Some lower-level operations already use `inlineKind` and are reusable, including much inline replacement, splitting and saved SQL text projection. This narrows a future task, but does not remove the codec and boundary-command blockers above.

If direct text specialisation becomes required, the smallest credible direction is a **bounded, headless text-host classification** used by codecs and relevant text operations, preserving distinct authored/canonical types. It is not a recursive inheritance graph. Qualification must decide Enter/split/join semantics and review guards individually. A declaration must not broaden every `standoff-editor-block` comparison by search-and-replace.

That later work expands which new typed inline documents native readers accept. Existing files need no migration, but older binaries would not necessarily read the newly admitted shapes. Do not describe it as “the existing codec already supports the new text type.” The optional text demonstration should remain blocked until these decisions and tests are complete.

### 3.6 Alternatives compared

| Mechanism | Benefit | Cost/limitation | Recommendation |
| --- | --- | --- | --- |
| Distinct registration, shared view, explicit capabilities | Works now for generic containers; minimal code; preserves semantic ID. | Does not supply every exact-name operation or clipboard policy. | Use now. |
| Tiny helper that fills in GenericContainerView | Can reduce repeated view wiring after several real types exist. | Initially little more than syntax; must not imply full inherited behaviour. | Optional later, only if repetition warrants it. |
| `extends`/`basedOn` resolving another registration | Convenient view/default lookup in theory. | Must define merge rules, aliases, flags, owner lifetime, factory safety and cycles; still cannot solve text codecs. | Not justified for this milestone. |
| Existing class inheritance | Useful when extending behaviour in the old class host. | Current reactive runtime uses records/views; class inheritance does not affect its codecs/commands. | Keep where already used; no new dependency. |
| Alias to an existing type | Existing compatibility lookup. | Conflates semantic kinds and leaves exact-name checks unchanged. | Reject for semantic specialisation. |
| Primary semantic role stored as Block Property | Avoids a new type name. | Contradicts the clarified conceptual model and makes applied behaviour stand in for identity. | Reject. |

## 4. Minimum Block Property registration

### 4.1 The actual missing capability

The current [appearance switch](src/rendering/appearance.ts), [legacy schemas](src/properties/block-properties.ts) and specialised resource consumers already interpret properties. There is no general current definition/discovery authority. Storage does not need one; the benefit of adding it is a predictable place to declare **new supported names**, catch collisions and expose their documented interpreter/validator.

A minimal independent index is sufficient:

```ts
interface BlockPropertyDefinition {
  type: string;
  label?: string;
  // Optional reference to the existing consumer, not an execution instruction.
  interpretedBy?: string;
  validate?: (property: Readonly<Record<string, unknown>>) => void;
}

// Separate category-owned instance, with no dependency on Solid or the DOM.
blockPropertyTypes.register(definition, owner); // returns an idempotent disposer
blockPropertyTypes.get(type);
blockPropertyTypes.list();                     // read-only declaration snapshot
```

The validator, if present, must be safe to import headlessly and run only at a relevant explicit input boundary. `interpretedBy` is optional documentation/discovery, not a new string-to-plugin loader. It can identify the existing appearance function or a trusted domain controller; it does not require presentation. A future nonvisual transformation can use its own explicit command/controller without adding a renderer.

Only registration uniqueness concerns type names. Property **instances** remain ordered and may repeat a type. No uniqueness by property type, sorting, deduplication or default injection should occur during loading.

### 4.2 Be honest about what the pilot demonstrates

Register `block/alignment` with a reference to the existing appearance interpreter. The pilot should show that adding this declaration does not change its output, ordering or native representation. This is a **new registration of an existing type**, not a newly invented transformation.

Registering `{type:"some-new-effect"}` will not make AP execute it. A new effect still needs an actual implementation and an intentional consumer. The index can expose that implementation/validator; it should not pretend an unused callback has become behaviour. For a later genuinely new AP transformation, qualify a small interpreter hook or an explicit existing consumer change then. Rewriting AP or automatically executing every registered callback is unnecessary now.

The registry would initially repeat a type identifier already present in AP. That is acceptable only because lookup/discovery/collision handling is a real requirement; it is not a rendering refactor. If there were no discovery consumer or planned new vocabulary, a pure exported definition array with a startup duplicate check would be enough. The proposed Map-like index is the smallest useful step for the stated dynamic registration contract, not evidence that all old tables must migrate.

Historical properties not entered in the new index must continue to render and persist exactly as before. Return “not declared in this index,” not “invalid property,” for a missing definition. Do not change legacy DOM callbacks, tombstone handling or existing order-dependent style composition in this milestone.

## 5. Minimum Standoff Property registration

### 5.1 Prefer an independent definition index

An additive definition index is smaller and safer than expanding `VisualEffectRegistry` into the semantic authority for this milestone:

```ts
interface StandoffPropertyDefinition {
  type: string;
  label?: string;
  validate?: (property: Readonly<Record<string, unknown>>) => void;
}

standoffPropertyTypes.register({ type: 'editorial-deletion' }, owner);
standoffPropertyTypes.get('editorial-deletion');
standoffPropertyTypes.list();
```

No renderers, caret events, schema version, alias graph, range inheritance, UI component or class are mandatory. Keep this a separate category from Block Properties even if a few implementation helpers eventually prove reusable. Identical strings may exist in both property categories.

### 5.2 Why the existing mechanisms are not the right metadata-only API

[VisualEffectRegistry](src/runtime/visual-effect-registry.ts) accepts a type with an empty renderer array, but [StandoffEditorView](src/rendering/standoff-editor-view.tsx) uses **type membership** to suppress the legacy presentation path when registry rendering is enabled. Reusing this map for description-only entries would require changing precedence logic and qualifying existing effects. The earlier plan proposed doing that; the current narrower requirement can avoid it entirely.

[AnnotationContributions](src/runtime/annotation-contributions.ts) requires an authoring action and a details component; it is an optional UI contribution store. Making those optional and repurposing it for headless discovery would mix responsibilities for no benefit. Static styles are appearance declarations, not a complete semantic catalogue.

Therefore leave all three untouched. The new index must not be read by the renderer's binding selection, must not call `visualEffects.registerType`, and must not activate features or manufacture annotation UI.

### 5.3 Coexistence and inert presentation

| Existing mechanism | Minimum interaction with the new definition index |
| --- | --- |
| Static styles and aliases | None required. Their current lookup/cascade remains authoritative for appearance. |
| VE type bindings and passive effects | None required. Their precedence and flags remain unchanged. |
| Entity references | Existing VE, passive effect, UI and service registrations continue. An optional descriptive entry can be added later without taking over those responsibilities. |
| Glosses | Existing controller, linked definitions and conditional CSS-class VE binding remain. No migration required. |
| Phosphor/Cardex specialised fields | Keep host-specific type restrictions, bindings and persistence. No global activation through discovery. |
| New nonvisual semantics | Use ordinary property records and generic range commands; no effect binding means no automatic visual decoration. |

For `editorial-deletion`, the pilot preserves the characters and records the annotation. Its name alone must not hide, strike out, delete or revise text. That behaviour, if wanted later, needs an explicit specification and implementation.

There is generic annotation inspection but no universal “unknown annotation underline.” A native unknown property remains inert; an unsupported **clipboard** property can instead become `mutable/opaque-property`, which has a dotted presentation. Those are different paths. Do not convert every nonvisual native property into an opaque carrier merely to give it a visible mark.

The new definition index requires **no range representation changes**. Ordinary inclusive Cell ranges, shared definitions, rebasing, deletion and current point limitations remain the responsibility of existing code. A registered type does not thereby gain arbitrary cross-Block or zero-width authoring support.

## 6. Discovery and the minimum shared conventions

Maintain three distinct access paths. Use exact IDs, duplicate detection, deterministic enumeration, owner-aware disposal and concise diagnostics. Avoid a universal registry, universal schema engine, universal inheritance, mandatory descriptor versioning or a new plugin loader.

For Blocks, `resolve` already supplies per-type lookup. Add a simple read-only `list`/description snapshot to [BlockRegistry](src/block-tree/registry.ts) for current active registrations; do not change `typesWithCapability`, because its active results feed extraction policy. Snapshot only descriptive fields where a caller needs plain data, excluding view/factory functions. Existing aliases remain explicit compatibility aliases.

For headless discovery, export pure declarations for the new supported vocabulary and any specifically needed base/property definitions. Browser registration and headless consumers import the same declarations. A headless consumer does not instantiate `ReactiveEditor`, import `GenericContainerView`, or activate features. A second independently maintained map of the same Block definitions is unnecessary.

This gives two intentionally different questions:

- **Declared support:** the pure new-vocabulary declarations and independent property indexes describe what this milestone qualifies.
- **Active browser support:** BR and existing feature/runtime services report what this editor has activated.

Do not claim a negative answer from the partial pure catalogue proves a historical type never existed. Full historical headless discovery can remain later work. Likewise, a registered property may have no active interpreter; the presence of a definition and the presence of behaviour are different facts.

Pure declarations can include optional existing validator references, but do not need to validate every historical value. Basic registry checks should cover nonempty IDs and duplicates; preserve exact identifiers rather than silently trim/rename saved values. No mutation, serialization, index refresh, range revalidation or geometry work belongs in `get/list`.

## 7. Generic and opaque fallback qualification

The existing document model can retain substantial source information without a new Block class. It does not itself provide an XML information-set model or guarantee round-trip XML fidelity. The following describes storage capacity and limits, **not TEI element mappings or a fallback implementation**.

| Source shape | Existing representational capacity | Concrete limitations |
| --- | --- | --- |
| Unknown block-level object containing text | A generic/unknown parent can own normal TextBlocks; arbitrary source metadata can live in authored payload. An unfamiliar type with a `text` payload also survives native storage. | GenericContainerView does not display arbitrary payload text. UnknownBlockView normally displays a label and children, with a special preview only for known source types. New type plus `text` is not a native rich TextBlock. Clipboard serialization omits top-level `text` except recognised string-text families. |
| Unknown container with nested Blocks | Existing ordered children, owned relations, metadata and generic/unknown child outlets preserve and display ordinary descendants. | There is no intrinsic XML mixed-content grammar. Text before/between/after child elements, whitespace and source hierarchy must be represented deliberately. Arbitrary relation values are not automatically owned Blocks. |
| Unknown inline element spanning text | Ordinary standoff records can retain a type, range, value, metadata and source identifiers; linked segments can associate a logical annotation across TextBlocks where supported. | Equal/overlapping ranges do not uniquely determine XML nesting or sibling order. An annotation is not an inline nested Block. Split/join/replacement can change segments; linked definitions have explicit ownership. Clipboard may make unknown semantics opaque. |
| Empty element at a textual position | Point annotations exist in parts of the model; structured metadata can also retain source evidence. | Ordinary TextRanges/RangeAnnotations require a nonempty selection. Point conventions disagree between editing/interchange and saved indexing; no universal point-marker UI exists. A visible empty Block is not equivalent to a position inside text. |
| Data-only elements and attributes | Authored JSON-like structured payload/metadata and retained definitions can carry ordered structured data or raw source evidence; no dedicated renderer is required. | Data in payload is not automatically navigable, editable, indexed, owned, ID-remapped or round-trip exportable. Retained definitions need Document ownership; unowned disconnected records are not a saving strategy. |
| Inert imported Blocks/properties | Existing `mutable/opaque-block`, `mutable/opaque-block-property` and `mutable/opaque-property` retain original data/targets without activating original semantics. | Opaque Block view intentionally does **not** render its children or execute original markup. It is a retention carrier, not a transparent generic container editor. It also does not bypass native inline-host validation. |

Sources: [unknown view](src/rendering/unknown-block-view.tsx), [opaque view](src/rendering/opaque-clipboard-view.tsx), [tree codecs](src/block-tree/codecs.ts), [native resource](src/persistence/native-resource.ts), [fragment serializer](src/interchange/serializer.ts), [materializer](src/interchange/materialize.ts), [range model](src/runtime/text-ranges.ts), [linked annotations](src/block-tree/linked-annotations.ts), [retained ownership](src/block-tree/definition-ownership.ts).

### 7.1 Preservation levels must be stated explicitly

Retaining element names and an attributes object is insufficient for a general lossless claim. XML hierarchy/mixed-content order, expanded namespace names and bindings, whitespace significance, source IDs, reference targets, ordering of co-located empty nodes, and source-to-native correspondence need explicit representation. Attribute values or text may already have been normalised by parsing. Comments, processing instructions, entity spelling, CDATA boundaries and original lexical formatting require additional retained evidence if exact source reconstruction is a requirement.

An ordered source structure or original source bytes can be stored as authored data or an appropriate retained asset using existing facilities. Choosing that encoding, connecting it to editable content, and defining its behaviour after edits are later design decisions. This report neither prescribes that encoding nor claims it stays synchronised automatically. Flattening text into Cells can preserve readable text while losing source structure.

External-reference/typed-target remapping only handles known contracts. A source ID copied into metadata remains source data; it is not automatically a canonical Block or Entity identity. Preserve source identity separately from generated runtime/content/placement IDs. No generic recursive string replacement should be added.

### 7.2 Two specific boundary problems

**Points:** [range editing](src/interchange/ranges.ts) represents a point using `isZeroWidth:true` and equal start/end boundaries; [saved SQL projection](src/knowledge-sqlite/saved-projection.ts) expects `end === start - 1`. The native cached-excerpt path also distinguishes the latter. This does not block the ordinary nonempty `editorial-deletion` pilot, but does block a claim of fully interoperable positional fallback. Keep the inconsistency out of the registration milestone and record it as a later requirement if positional imports need indexing/editing parity.

**Interchange limits and policies:** [fragment limits](src/interchange/fragment.ts) include an 8 MiB payload limit, depth 64 and an opaque limit of 256 × 1024. The materializer checks opaque size using JSON string length. Native retention, fragment admission and exports are different boundaries. The serializer omits arbitrary top-level text for unfamiliar types; the opaque view hides descendants; raw executable/style fields and some identity metadata are sanitised during import. Existing opaque support is therefore useful but not a blanket lossless transfer guarantee.

No general-purpose fallback architecture change is proven necessary for ordinary containers, nonempty text annotations or structured source data. Direct unfamiliar inline hosts, interoperable point markers and source-faithful reconstruction have concrete additional requirements.

## 8. Proposed changes: necessity, exact scope and avoidance

Paths marked **new, proposed** do not exist as part of this investigation. These names are suggested locations, not an instruction to implement now.

| Change | Files/interfaces | Why needed / why existing mechanisms are insufficient | Can it be avoided? | Invariants and acceptance |
| --- | --- | --- | --- | --- |
| M1: active Block discovery | [registry.ts](src/block-tree/registry.ts); use existing `BlockTypeRegistration` in [types.ts](src/block-tree/types.ts) | `resolve` and capability lookup exist; no general listing. A small list/description operation makes new types discoverable. | Yes if all callers know exact IDs; worthwhile for the requested discovery contract. No inheritance fields needed. | Same registration/alias/owner/disposal semantics; no document scans or changes to capability enumeration. |
| M2: pure declarations for the qualified new vocabulary | A small caller-owned definition module or test fixture; existing [application assembly](src/application/features.ts) only when actual production types are approved | UI registration contains a view function. Headless consumers need the supported declaration without importing UI. | A separate manifest generator or Block definition registry is avoidable: export plain declarations and consume them directly. | One authored ID declaration; no feature activation; only explicitly qualified vocabulary claimed. |
| M3: Block Property index | **New, proposed:** `src/properties/block-property-definitions.ts`; optional fields on [ReactiveEditor](src/reactive-editor/editor.ts) for ownership/access | No current type/discovery authority; old schemas and AP are execution paths. | A static definition array plus duplicate validation suffices if registration never needs lifetimes. Prefer the tiny index for the requested API. | Independent ordered instance arrays unchanged; old unregistered properties continue working. Pure get/list/duplicate tests. |
| M4: Standoff definition index | **New, proposed:** `src/properties/standoff-property-definitions.ts`; optional editor-owned access | VE membership changes presentation; annotation UI requires components/actions. | Can be a pure definition collection, but cannot safely reuse VE membership for metadata. A tiny independent index avoids renderer changes. | Declaring a type changes neither VE membership nor style output/events. No range changes. |
| M5: narrow assembly/lifecycle bridge | [ReactiveEditor](src/reactive-editor/editor.ts), an existing feature/application composition point as needed | Browser callers need access and owned cleanup; headless callers instantiate pure indexes directly. | Keep indexes composition-owned and pass them to consumers if no editor access is needed. Do not add a broad feature-API redesign. | Registration is session state, not authored mutation. Disposal removes definitions only; it does not remove document properties. |
| M6: demonstration tests and documentation | Existing registry/codec/render/annotation tests plus a focused qualification test fixture; no permanent production pilot types | Need to distinguish declaration, active behaviour, persistence and admission. | Not avoidable before claiming the mechanism works end to end. | Acceptance in §9; no broad new test framework or complete historical registration audit. |

M3/M4 can share small low-level duplicate/disposal helpers later if that reduces code. Do not make a generic cross-category registry a prerequisite. Optional validator/interpreter references should reuse existing functions and remain nonexecuting unless an explicit trusted caller invokes them.

### 8.1 Files that should remain unchanged in the recommended milestone

Keep [appearance.ts](src/rendering/appearance.ts), [standoff-styles.ts](src/rendering/standoff-styles.ts), [visual-effect-registry.ts](src/runtime/visual-effect-registry.ts), [standoff-editor-view.tsx](src/rendering/standoff-editor-view.tsx), native codecs, structural/input commands, SQL schemas, clipboard admission/remapping, old enum and legacy class builders unchanged. These are negative acceptance boundaries, not files to refactor opportunistically.

### 8.2 Conditional extensions, only if additional behaviour is required

| Additional requirement | Minimum additional qualification | Why it is not in M1–M6 |
| --- | --- | --- |
| Clipboard preserves a new semantic kind as active content | Explicit trusted admission rule/validator in [materialize.ts](src/interchange/materialize.ts), with [serializer](src/interchange/serializer.ts)/target rules checked if new references are introduced. Reuse existing policy; do not derive admission from registration. | Current opaque downgrade preserves the trust boundary. Active support is a separate per-type product requirement. |
| A genuinely new Block Property transformation | A real interpreter/controller and its explicit integration; a narrow AP hook only if it actually needs common appearance. | An identity index is not an effect engine. No hypothetical new effect implementation is needed for the pilot. |
| Direct semantic TextBlock | Headless text-host classification plus the codec, range-source, input, command and performance guards in §3.5; explicit split/join/Enter policy. | Several modules encode text-host identity; shared views alone are demonstrably insufficient. |
| Full historical headless discovery | Extract descriptive data from additional current/legacy registrations in small batches. | Useful maintenance, not a prerequisite for declaring the new qualified vocabulary. |

## 9. Smallest useful proof of concept — proposed, not implemented

Keep example names in test fixtures or a disposable demonstration host. No permanent vocabulary decision is implied.

### A. Semantic container

Register `verse-group-block` with GenericContainerView and explicit `container`/`selectable` capabilities. Construct it inside a standard Document with two ordinary TextBlock children and intrinsic payload metadata.

Demonstrate:

- Registry resolution and discovery retain a distinct type; duplicate registration is rejected.
- The shared view displays descendants; typing in an existing child uses its normal text implementation.
- Insertion planning, ordered child insertion/move, container move/remove, internal copy where supported and Undo/Redo preserve type and ownership.
- Native save/reload retains exact type, properties, metadata, child order and identity; reload without the new view retains data and uses the unknown fallback.
- No enum, class, codec, renderer switch or application-specific factory rewrite is needed.
- External clipboard currently produces an opaque wrapper with descendants retained in data. Record this as a limitation, not a successful active semantic round trip.

The optional direct `verse-line-block` test should initially be a **negative qualification**: show why a shared view cannot make its DTO decode into Cells and why native inline decoding rejects it. Do not “pass” the test by asserting only that a payload string was saved, by changing its type to the base name, or by substituting a wrapper and calling it the same mechanism.

### B. Block Property

Declare existing `block/alignment` in the new index, referring to current AP interpretation. Apply two alignment properties in order and verify the current last-assignment result; retain unrelated properties and repeated instances. Verify get/list, duplicate detection, disposal, native round trip and Undo/Redo of authored edits. Removing the declaration must not remove saved properties or change the existing AP path.

This proves registration can be added without a property-model or renderer change. It does not claim arbitrary new property names become executable transformations.

### C. Nonvisual semantic annotation

Declare `editorial-deletion` in the Standoff definition index. Apply it to a nonempty ordinary TextBlock range using existing commands. Verify it is discoverable, persists/reloads unchanged, appears in generic annotation inspection, and rebases through normal edits/Undo/Redo.

Assert that `visualEffects.type('editorial-deletion')` remains absent, text remains visible, existing overlapping formatting remains unchanged, and no extra effect/caret handler is invoked. Native save does not require a specialised renderer. Clipboard admission continues to produce `mutable/opaque-property` until separately authorised support is added.

### D. Headless discovery and separation

Import the pure declarations and property indexes in a Node environment without `window`, DOM or `ReactiveEditor`. Look up the three pilot definitions by category. Verify identical IDs can exist in the two property categories, and undeclared historical types are reported as outside this catalogue rather than rejected from native data.

## 10. Compatibility, regression risks and tests

| Area | Required invariant | Focused acceptance |
| --- | --- | --- |
| Ink/native ownership | Existing envelope/encoding, IDs, placements, retained definitions and unknown payload preservation unchanged. | Native round-trip fixture with semantic container plus standard text descendants; existing ownership tests. |
| Block editing | Same canonical command paths, structural validation, focus and child editing. | Existing [tree tests](src/block-tree/block-tree.test.ts), [unknown-feature rendering](src/rendering/unknown-feature.test.tsx), pilot insertion/move/remove/undo. |
| Block Properties | Preserve order, multiplicity, existing parsing/defaults and tombstone behaviour. | Before/after AP output and native property-array equality; no type-based deduplication. |
| Standoff ranges | No endpoint, Cell, linked ownership, overlap or boundary-affinity changes. | [range tests](src/runtime/range-annotations.test.ts), [annotation monitor](src/rendering/annotation-monitor.test.tsx), [linked tests](src/runtime/linked-annotations.test.ts), ordinary Unicode range fixture. |
| Presentation | Definition registration does not add VE bindings or change static/fallback precedence. | [visual registry tests](src/runtime/visual-effect-registry.test.tsx), [style tests](src/rendering/standoff-styles.test.ts), nonvisual annotation overlapping bold/link decoration. |
| Feature ownership | Existing owners/flags/disposers remain authoritative; no automatic activation from known type names. | [feature tests](src/runtime/features.test.ts), [feature capability tests](src/application/feature-capabilities.test.tsx); dispose declarations without touching authored content. |
| Clipboard/references | Registration grants no admission; target remapping remains explicitly typed. | [clipboard tests](src/interchange/clipboard.test.ts); new names stay opaque by default; raw source IDs remain raw source IDs. |
| SQLite | No migration; arbitrary stored typename is not automatic domain semantics. Keep capability-derived extraction policy unchanged. | [saved projection tests](src/knowledge-sqlite/saved-projection.test.tsx); scalar-range nonvisual annotation and semantic container projection. No claim of point parity. |
| Legacy data | No enum/factory/class/schema migrations; unknown native records remain reloadable. | [compatibility fixtures](src/block-tree/compatibility-fixtures.test.ts), unknown-type round trips. |
| Performance | Discovery/registration adds no typing-time scans, serialization, SQL requests, layout measurements or broad reactive dependencies. | Bounded-work assertions on unchanged editing paths; [inline performance](src/block-tree/inline-performance.test.ts). Real Flint typing benchmark if later text-family work affects hot paths. |
| Saving | Registration is not a Document edit; native saves remain manual. | No dirty state, background document save or Markdown sidecar from declaration/get/list/disposal. |

Existing renderer/controller behaviour, feature defaults, source metadata, unknown legacy types and application policy should remain unchanged. Definition indexes need not subscribe to every document revision. Register at assembly, use direct lookup where needed, and validate only the affected newly authored value when a caller explicitly requests validation.

### 10.1 Evidence obtained in this investigation

Read-only source tracing established the exact-name constraints and registration boundaries above. Temporary in-memory probes called the existing codecs, appearance interpreter and clipboard functions; they created no production registrations or files. Results:

```text
Semantic container + nonvisual annotation native round trip: unchanged
Reloaded authored types: document-block, verse-group-block, standoff-editor-block
Ordered alignment properties: right (second assignment wins)
Reloaded nonvisual annotation type: editorial-deletion
Clipboard container: mutable/opaque-block
Clipboard annotation: mutable/opaque-property
verse-line-block DTO with text: inlineKind absent, zero Cells, payload text retained
Native inline content retagged verse-line-block: rejected
  G1 portable: unexpected inline content
```

These prove storage/admission distinctions. They do not prove mounted semantic-container editing, future definition-index integration or the complete proposed pilot.

The following existing suites were run during this requalification:

```text
node node_modules/vitest/vitest.mjs run \
  src/runtime/range-annotations.test.ts \
  src/rendering/annotation-monitor.test.tsx \
  src/block-tree/block-tree.test.ts

3 files passed; 40 tests passed.
```

All 88 local source/report links resolve. The earlier report records other baseline runs. They are not counted as newly executed here. No new production implementation, browser proof of concept, full build, complete suite or performance benchmark was performed.

## 11. Narrow implementation sequence for later approval

| Step | Deliverable | Dependencies and complexity | Exit criterion |
| --- | --- | --- | --- |
| 1. Confirm the supported minimum | Document container-sharing support and direct-text/clipboard limits; select only the three pilot cases. | No historical migration. Low complexity. | No claim that shared view means full TextBlock or import support. |
| 2. Add minimal definition/discovery APIs | M1, M3, M4; pure constructors/modules and simple duplicate/lifetime tests. | Independent category work. Low complexity; no rendering integration. | Lookups/listing work without DOM; duplicate handling and category separation pass. |
| 3. Assemble the temporary pilot | Pure declarations, a generic-container browser binding, alignment registration and inert annotation registration. | Existing feature ownership; no permanent demo types. Low to medium, principally verification. | Cases A–D pass within the stated limits; native data unchanged. |
| 4. Qualify regression boundaries | Relevant existing suites plus bounded-work checks and native/clipboard negative cases. | After pilot. Focused, not repository-wide type migration. | No renderer, persistence, trust-policy, dirty-state or typing regression. |
| 5. Review only demonstrated follow-up needs | Decide whether active clipboard support, direct text specialisation or a real new transformation is required next. | Separate scope/approval. | A concrete requirement and targeted change list, not automatic expansion into the previous consolidation programme. |

If a user-facing extension facility is subsequently judged a major new feature, follow the repository's feature-flag convention with the specified default. Do not change current feature defaults. Test-only demonstrations do not require a permanent production feature or vocabulary entry.

## 12. Reassessment of the previous consolidation proposal

This classification concerns the **current objective**, not whether the earlier work could ever be useful.

| Earlier recommendation/workstream | Requalification | Reason |
| --- | --- | --- |
| Separate authorities by category | Essential now | Preserves the clarified model; no universal registry needed. |
| Distinguish registration, execution, representation and rendering | Essential now | Prevents false claims about shared text views and nonvisual annotations. |
| Small Block discovery extension | Essential for requested discovery | Add listing; retain current BR. No replacement. |
| Missing Block Property authority | Essential only at minimal scale | Tiny index for new supported definitions; exhaustive historical migration unnecessary. |
| Standoff semantic discovery separate from active bindings | Essential now | Independent index achieves this without changing VE. |
| Extend/refactor VE property registration into a full authority | Useful later, not now | Could reduce future duplicate metadata, but current additive index avoids precedence work entirely. |
| Pure headless declarations | Essential for new qualified vocabulary | No browser/editor activation merely to discover types. |
| Full headless catalogue of all old/current types | Useful later | Valuable completeness, not needed to introduce the new minimum. |
| Exhaustive Block Property/Standoff registration migration | Unnecessary for this objective | Leave historical interpreters and styles working independently. |
| Legacy class/builder migration and old-host adapters | Unnecessary for this objective | New reactive container/annotation types do not depend on them. |
| Historical enum generation/consolidation | Unnecessary for this objective | Open string registrations already work. |
| Replace contextual factories or force `create` everywhere | Unnecessary and risky | Defaults are not instance reload or context-aware construction. |
| Renderer/static-style rewrite | Unnecessary for this objective | Existing view reuse and inert annotations suffice. |
| Broad schema/default/operation descriptor framework | Useful later only for concrete validation needs | Optional existing validators are enough now; avoid a new schema engine. |
| Universal inheritance or recursive basedOn | Unnecessary | Adds contracts without solving exact-name text constraints. |
| Duplicate/disposal checks for new declarations | Essential now | Small and directly related to predictable registration. |
| Coverage safeguards for every historical type | Useful later | Start with qualified declarations and bindings, not a prerequisite audit programme. |
| Legacy Embed builder, old bind-loss and fallback fixes | Unnecessary for this objective | Real defects, but unrelated to the pilot. Preserve as separately tracked findings. |
| Zero-width consistency fix | Conditional follow-up | Required if interoperable positional markers enter scope; not needed for ordinary-range pilot. |
| Clipboard widening and new target remapping | Conditional follow-up | Active transfer of new semantics requires intentional policy; registration must not imply it. |
| Direct text-host family support | Conditional follow-up | Necessary for a genuine `verse-line-block`, not for the required container demonstration. |
| Persistence/model/SQL migration | Unnecessary for recommended minimum | Existing native bags/ownership and generic typename storage suffice. |

The earlier Block recipe B0 shrinks to discovery and explicit shared-view binding. B1–B5 legacy/data-category consolidation is deferred except for documenting relevant limits. Block Property P1/P2 shrink to optional descriptors of the pilot's existing behaviour; P3 is deferred. Standoff S0–S4 migration is replaced by an independent additive index for the new vocabulary. No Phase D retirement programme is needed. Safeguards remain, but are proportional to the new APIs and demonstrated use cases.

## 13. Qualification decision

The recommended minimum can preserve current Ink representations, ownership, property arrays, range semantics, commands, feature lifetimes, SQL persistence and manual saving. It adds discovery and a supported way to declare new names without rearchitecting Mutable.

A semantic container is already a lightweight registration exercise. A registered existing Block Property needs no renderer change. A new nonvisual Standoff Property needs no effect binding or range-model change. These are suitable first demonstrations.

A direct semantic TextBlock and active clipboard transfer remain explicit limitations, with concrete blockers identified above. Solving either is a separate targeted task—not a reason to resume comprehensive historical consolidation. Future mapping work can use the qualified support descriptions deterministically, while treating these unqualified capabilities as unavailable until tested.
