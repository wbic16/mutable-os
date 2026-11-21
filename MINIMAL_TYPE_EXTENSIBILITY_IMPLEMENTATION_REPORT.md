# Mutable OS — Minimal Type Extensibility Implementation and Qualification

**Scope:** approved M1–M6 in [the Feature Brief](MINIMAL_TYPE_EXTENSIBILITY_FEATURE_BRIEF.md), with the implementation clarifications that the indexes stay simple and explicitly partial. Baseline: `b6b2a43`. The approved brief and [qualification](MINIMAL_TYPE_EXTENSIBILITY_QUALIFICATION.md) are preserved.

**Status:** implemented and qualified for review. All 180 tests in the 16 specified suites pass; the reactive and server typechecks pass. No architectural scope deviation was required.

## Delivered implementation

The existing Block registry now exposes read-only discovery. Block Properties and Standoff Properties each have their own small, independent definition index. There is no generic registry framework, shared superclass, universal registry or new execution layer.

**The property indexes are initially partial registries for newly declared types, not exhaustive catalogues of properties supported by Mutable.** Both remain empty after normal application assembly. Missing membership means “not declared here”; historical properties continue to load, render and edit independently of membership. Registration is neither an admission rule nor a change to authored data.

Production changes are confined to the five modules approved in the brief:

| Milestone | Source | Delivered contract |
| --- | --- | --- |
| M1 | [registry.ts](src/block-tree/registry.ts) | `BlockRegistry.list()` returns frozen, detached metadata snapshots in primary registration order. Capabilities and aliases are copied/frozen; aliases remain grouped under their primary entry. Owner is included; views, factories and implementation objects are omitted. Existing lookup and registration methods are unchanged. |
| M2 | [type-declarations.ts](src/block-tree/type-declarations.ts) | Pure `BlockTypeDeclaration` and `BlockRegistrationInfo` interfaces. No runtime dependencies or activation. |
| M3 | [block-property-definitions.ts](src/properties/block-property-definitions.ts) | `BlockPropertyDefinitionIndex` with `register`, `get`, `owner`, `list`, `dispose`. `interpretedBy` names a consumer without resolving or invoking it. Optional validator references run only when an explicit caller invokes them. |
| M4 | [standoff-property-definitions.ts](src/properties/standoff-property-definitions.ts) | Independent `StandoffPropertyDefinitionIndex` with the same small lifecycle surface. Type-only definitions are valid. No dependency on visual effects, styles, annotation controllers or rendering. |
| M5 | [editor.ts](src/reactive-editor/editor.ts) | Empty per-editor `blockPropertyTypes` and `standoffPropertyTypes`; both disposed immediately after `featureHost.dispose()`. Existing FeatureScope ownership handles release and activation rollback. |

Each property index uses one Map and a disposed flag. Registration validates identity/owner and optional field shapes, preserves exact strings, rejects duplicates atomically with category/type/both-owner diagnostics, and stores a shallow copied/frozen definition. Reads never execute validators. Lists are frozen and ordered; releases are idempotent and cannot delete a later registration. Disposal closes the index and clears it; reads become empty and further registration fails. The two categories can independently register the same identifier.

The pure modules have no runtime imports. The [pilot declarations](src/block-tree/test-support/minimal-type-declarations.ts) have only type imports and no registration side effects. Source inspection found no production imports of that fixture and no production registration of the demonstration IDs. There are no automatic reads of the new indexes in editing, rendering or persistence.

## M6 demonstrations and qualification

All demonstration declarations and bindings remain test-only, including the pilot declaration of the already supported `block/alignment` property.

### Semantic container

`verse-group-block` binds to the existing `GenericContainerView` with explicit `container` and `selectable` capabilities. It contains ordinary `standoff-editor-block` children and intrinsic metadata; no class, enum or codec is added.

The mounted test dispatches real `beforeinput` events through the existing gateway, verifies immediate child text, caret position and surviving emoji Cell identity, saves through the native codec, and opens the saved resource in a fresh editor without the pilot. Native serialization remains identical after reload; the existing unknown-type label appears and the ordinary descendants remain editable through mounted input. Undo restores the saved resource.

Separate command tests exercise the real insertion planner, child insertion/reordering, group movement/removal and Undo/Redo. Moves retain content and placement identities. Discovery does not call the optional factory; explicit factory use followed by the ordinary insertion command allocates authored identity. These structural operations use commands, not simulated drag-and-drop.

### Existing alignment interpretation

The fixture applies left alignment, an unrelated retained property, then right alignment. Existing `blockAppearance` produces right alignment. Every instance, ID, value and ordering survives native encode/decode and Undo/Redo. Releasing the declaration changes neither the authored array nor the existing appearance result. The index does not implement or replace the interpreter.

### Nonvisual editorial annotation

`editorial-deletion` is declared only in the Standoff index and applied with existing RangeAnnotations to a nonempty emoji range. The fixture verifies Cell addressing (inclusive persisted endpoints `1..1` for that one code point), discovery, native encode/decode, generic annotation monitor inspection through the existing keyboard shortcut, prefix-edit rebasing and Undo/Redo.

With `standoffPropertyRendering` both enabled and disabled, the annotation leaves text and overlapping bold presentation unchanged. It has no VE registration or annotation handler. Its semantic name does not strike, hide or delete text. Range application and the rebasing edit use existing commands; monitor opening uses mounted keyboard input.

### Compatibility and admission

The compatibility suite compares the real native envelope and serialized resource across decode/re-encode, including semantic type, metadata, ordered children, Unicode Cells and repeated properties. Legacy nested DTO encode/decode is checked separately; it is not used as a substitute for native evidence.

The real clipboard serializer/materializer still downgrades the group to `mutable/opaque-block` and the editorial marker to `mutable/opaque-property`, retaining original semantics and descendants. Supported alignment instances remain admitted in their original order around an opaque historical property. No allowlist, remapping rule, persistence representation or SQL schema changes were made.

### Acceptance gates

| Gate | Evidence |
| --- | --- |
| A1: Block discovery | [registry-discovery.test.ts](src/block-tree/registry-discovery.test.ts): empty/populated results, alias grouping, ordering/owners, frozen nested snapshots, stable old snapshots, unchanged alias/capability queries, and zero factory/view/subscriber calls on listing. Caller-owned registration objects remain unfrozen. |
| A2: independent indexes | [type-definition-indexes.test.ts](src/runtime/type-definition-indexes.test.ts): identity and field validation, atomic duplicate errors, exact strings, category independence, immutable stored copies and ordered snapshots. |
| A3: lifecycle | Unit tests cover repeated/stale release and closed indexes; [mounted suite](src/rendering/minimal-type-extensibility.test.tsx) covers FeatureHost rollback, editor isolation and feature teardown before index closure. |
| A4: headless | Node-environment tests import and use declarations/indexes with no `window` or `document`; import inspection confirms no runtime UI dependencies. |
| A5: container | Mounted gateway typing/caret, native reload without registration and editable unknown fallback; command-driven insertion/move/remove and Undo/Redo. |
| A6: multiplicity | Repeated alignment plus a historical property retains ordering/IDs/values and last-assignment interpretation through native round trip, declaration release and Undo/Redo. |
| A7: nonvisual semantics | RangeAnnotations, monitor inspection, Unicode range/rebasing, native round trip and overlapping style checks with the rendering flag both ways. |
| A8: no authoring side effects | Registration, discovery, release and index disposal yield zero repository-change notifications, unchanged revision/history/persistence state, and no snapshot, workspace capture, save, network or factory calls. |
| A9: bounded work | Mounted typing and annotation apply/Undo/Redo invoke no new discovery/validator methods, full repository snapshot, reference rebuild, projection rebuild, document encode or network request. An unrelated child's canonical record retains identity. Spies are call-through; canonical validation is not disabled. Existing inline-performance and range-annotation suites also pass. |
| A10: compatibility | New native/legacy and real clipboard fixtures plus existing native-resource, compatibility-fixtures, mutable-clipboard and saved-projection suites. |
| A11: production isolation | Normal application assembly leaves both indexes empty, has no pilot registration/VE binding, and retains historical alignment interpretation and bold data. Source inspection confirms fixture isolation. |
| A12: bounded scope | Five production modules only; test fixture and four test suites match the approved paths. No excluded subsystem implementation changed. |

## Validation results

The four new suites passed **24 tests**:

| Suite | Tests |
| --- | ---: |
| `src/block-tree/registry-discovery.test.ts` | 2 |
| `src/runtime/type-definition-indexes.test.ts` | 10 |
| `src/block-tree/minimal-type-compatibility.test.ts` | 3 |
| `src/rendering/minimal-type-extensibility.test.tsx` | 9 |

The twelve specified existing suites passed **156 tests**:

| Suite | Tests |
| --- | ---: |
| `src/runtime/features.test.ts` | 2 |
| `src/application/feature-capabilities.test.tsx` | 2 |
| `src/rendering/unknown-feature.test.tsx` | 1 |
| `src/runtime/range-annotations.test.ts` | 7 |
| `src/rendering/annotation-monitor.test.tsx` | 14 |
| `src/runtime/visual-effect-registry.test.tsx` | 4 |
| `src/rendering/standoff-styles.test.ts` | 8 |
| `src/persistence/native-resource.test.ts` | 15 |
| `src/block-tree/compatibility-fixtures.test.ts` | 2 |
| `src/rendering/mutable-clipboard.test.tsx` | 73 |
| `src/knowledge-sqlite/saved-projection.test.tsx` | 14 |
| `src/block-tree/inline-performance.test.ts` | 14 |

The checks use the brief's runner and explicit paths:

```sh
node node_modules/vitest/vitest.mjs run src/block-tree/registry-discovery.test.ts src/runtime/type-definition-indexes.test.ts src/block-tree/minimal-type-compatibility.test.ts src/rendering/minimal-type-extensibility.test.tsx
node node_modules/vitest/vitest.mjs run src/runtime/features.test.ts src/application/feature-capabilities.test.tsx src/rendering/unknown-feature.test.tsx src/runtime/range-annotations.test.ts src/rendering/annotation-monitor.test.tsx src/runtime/visual-effect-registry.test.tsx src/rendering/standoff-styles.test.ts src/persistence/native-resource.test.ts src/block-tree/compatibility-fixtures.test.ts src/rendering/mutable-clipboard.test.tsx src/knowledge-sqlite/saved-projection.test.tsx src/block-tree/inline-performance.test.ts
npm run typecheck
git diff --check
```

Baseline and final post-change `npm run typecheck` both passed (exit 0), covering `tsconfig.reactive.json` and `tsconfig.server.json`. `git diff --check` passed. Final new-suite run: 24/24, exit 0; existing regression run: 156/156, exit 0. An intermediate check found that the test binding needed to copy the declaration's optional readonly aliases as well as capabilities into the existing mutable registration interface; the adapter was corrected without changing that interface, and the four new suites and typecheck were rerun successfully. An early unit assertion also used an unavailable Vitest matcher and was replaced with supported equivalent assertions.

No full-repository test run, production build or manual browser/IME session is claimed. Mounted input tests run in jsdom. The checks establish bounded operation counts and compatibility, not user-visible frame timing. No hot path or geometry implementation changed, so the real Flint benchmark was not run.

## Minimum integration points for future native implementations

| Addition | Minimum integration |
| --- | --- |
| Qualified generic semantic container | Export a pure `BlockTypeDeclaration`; bind it once through existing `editor.registry.register` with an appropriate existing view, explicit capabilities and owner. Copy readonly arrays at the runtime binding. Own its release with FeatureScope. Use ordinary insertion commands; supply a fresh context-free factory only if useful. |
| Block with new behaviour | The same declaration/binding plus the actual view/controller/creation behaviour required. Registration supplies no inherited implementation or contextual defaults. |
| Block Property | Export a pure definition and own `editor.blockPropertyTypes.register(definition, scope.owner)`. An existing consumer may already interpret it; a novel transformation requires an explicit trusted consumer. `interpretedBy` does not load one and `validate` is not called automatically. |
| Nonvisual Standoff Property | Export a pure definition and own `editor.standoffPropertyTypes.register(definition, scope.owner)`. Author on existing supported targets with range commands. No VE binding is needed. |
| Visual or interactive Standoff feature | Independently own the actual existing visual/controller/UI contributions it needs. Semantic declaration and VE execution retain separate lifetimes and responsibilities. |
| Headless consumer | Import pure declarations and instantiate either index directly; enumerate only the declared vocabulary. Active Block bindings remain discoverable separately through `BlockRegistry.list()`. |
| External admission | Separately qualify the existing interchange boundary; discovery never grants clipboard/import admission. |

Future features reuse current adapters with editor access, or receive a narrow registration function from those adapters. No new feature capability interface or application-wide service is introduced. Production activation, where later approved, should follow the existing feature-flag conventions.

## Retained limits, exclusions and follow-up

**Priority follow-up: genuine semantic TextBlock specialisation.** It remains unimplemented. The negative codec fixture demonstrates the current boundary: `verse-line-block` can retain a text payload but does not construct Cells or an inline host; retagging native inline content with that type is rejected as unexpected inline content. Sharing a view or adding an `inline-editor` capability alone cannot establish text-host support. This test records today's limitation and may be replaced by a separately approved implementation.

The next investigation remains the one specified in the brief: a small text-host extension preserving authored type, Cell construction/native grammar, selection/ranges, split/join policies, input/Undo, bounded fast paths and transfer/indexing behaviour while reusing the editor. No speculative hook for that work was added here.

Other retained limits:

- No complete historical property catalogue, automatic interpreter discovery or automatic validator invocation.
- No new zero-width/range kind, cross-Block target semantics or remapping support.
- Generic semantic containers do not gain exact-name ContainerBlock conveniences, specialised child grammar or arbitrary cross-container selections.
- Clipboard semantics remain opaque for the new examples; native retention does not imply untrusted admission.
- Frozen definition copies isolate the specified scalar fields and validator reference; they do not clone functions or enforce validator purity. Trusted consumers remain responsible for explicit invocation.

There are **no architectural or production-scope deviations** from the approved brief. No inheritance, renderer/interpreter rewrite, legacy migration, native persistence change, clipboard admission change, permanent demonstration/TEI type, new user UI, background save or feature-default change was introduced. The small duplicated Map implementations are intentional; they avoid an unnecessary shared framework. The only new document is this implementation report.
