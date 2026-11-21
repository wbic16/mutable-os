# Block Modes — Implementation and Qualification Report

## Outcome and scope

Implemented the attached **Block Modes: Minimal Implementation** brief on top of commit `4b9b672e91bbcf4e9490602ae8f899e47ddf956f`. Modes are optional authored semantics on existing Blocks. They do not create implementation types, change Cell decoding, select renderers, or activate features.

The implementation preserves modes through ordinary text edits and qualified structural operations. Operations that could consume semantic identity without a qualified policy refuse explicitly. In particular, **all joins involving a mode-bearing Block are currently unsupported, including equal-mode joins**. Continuation of rich mode-bearing payloads is also deliberately restricted. These are integrity safeguards, not completed merge/inheritance policies.

The production registry starts empty. Illustrative semantic names appear only in tests and this documentation. M1–M6 registries remain intact. Semantic TextBlock specialisation, TEI import, a declarative conversion specification, and production TEI vocabulary were **not implemented**.

## Data representation

- Authoring DTO: `ExistingBlockDto.mode?: string`.
- Canonical record: `ContentRecord.payload.mode`.
- Native Ink: the existing authored property bag, `document.blocks[*].properties.mode`. No native version, grammar, codec, or admission change.
- Saved SQLite projection: retained within existing Block attributes. Implementation typename and Cell coordinate/count remain unchanged; no table or schema migration.

One optional scalar field supplies zero or one mode. Clearing through the authoring API removes the field. Explicit assignment rejects non-string, empty, or whitespace-only identifiers; accepted strings are retained exactly, without case folding or trimming. Native decoding does not run this assignment validator. Unknown authored modes remain data, independent of feature availability or registration. The structural guards also treat a defined malformed historical value as authored data rather than silently erasing it.

Modes are not inferred from text, styling, metadata, or Block Properties. No second semantic identity field or semantic Block subclass was added. Existing Block Property ordering/multiplicity and rendering precedence are untouched.

## Registry, authoring API and lifecycle

`BlockModeRegistry` in [block-mode-registry.ts](src/block-tree/block-mode-registry.ts) is a small independent, headless descriptive registry:

```ts
interface BlockModeDefinition {
  readonly mode: string;
  readonly label?: string;
  readonly appliesTo?: readonly string[];
}

// Per ReactiveEditor instance:
const release = editor.blockModes.register(definition, owner);
editor.blockModes.get(mode);
editor.blockModes.owner(mode);
editor.blockModes.list();
release();

// Explicit authored change, using existing canonical commands/history:
editor.setBlockMode(nodeKey, mode);
editor.setBlockMode(nodeKey, undefined); // clear
```

Definitions and applicability arrays are copied and frozen. Enumeration returns a frozen snapshot in registration order. Duplicate identifiers, including duplicates by the same owner, fail atomically with the mode and both owners in the diagnostic. Disposal callbacks are idempotent and cannot remove a later registration that reused an identifier. Registry disposal clears entries and closes registration.

Feature ownership uses the existing lifecycle pattern: `scope.own(editor.blockModes.register(definition, scope.owner))`. Failed feature activation rolls back owned registrations. The editor disposes features before closing the registry. Registration, lookup, enumeration, and release neither mutate authored documents nor register renderers, commands, or visual effects.

`appliesTo` uses exact implementation type identifiers. Omitted means unrestricted; an empty array accepts no types. `setBlockMode` checks recognised compatibility, rejects Cell nodes, and performs one existing payload-field command. Unknown nonempty modes can be explicitly assigned. The API does not require mode registration for loading or editing existing documents. Lower-level payload commands remain trusted primitives; this is not a universal payload-validation framework.

Per repository conventions, `FeatureFlags.blockModes` defaults to `true`. It gates explicit `setBlockMode` authoring. Data retention, loading, normal editing, and structural integrity guards remain active when authoring is disabled. The flag cannot make existing authored semantics disposable.

## Structural rules actually implemented

| Operation | Implemented behaviour |
| --- | --- |
| Typing, deletion within a Block, caret/selection, Standoff Property edits | Existing Cell editor and commands retain the mode. No registry lookup or mode-specific rendering. |
| IME composition | Existing mounted composition reconciliation retains mode; provisional DOM input remains uncommitted until composition end. |
| Interior split | Both results retain the mode, with a fresh Block ID for the continuation. Existing Cell movement and annotation splitting remain in use. |
| Enter at start/end; empty sibling | Fresh sibling retains the mode. Empty sibling has no inherited Standoff ranges. |
| Enter with a selection | Mode continuation preflight happens before deleting selected content. Supported deletion/insertion remains one undoable transaction. |
| Rich mode-bearing continuation | Refuses before mutation when additional intrinsic payload data or unqualified Block Properties would be copied. |
| Join: different modes or moded/unmoded | Refuses before snapshot, mutation, or history publication. |
| Join: equal modes | Also refuses. Equal mode does not establish safe consumption of the right Block's identity, metadata, references, or ownership. |
| Backspace/Delete at a Block boundary | Checks modes before existing empty-Block deletion shortcuts or join dispatch; refusal uses the existing notice channel. Ordinary explicit whole-Block deletion remains available. |
| Cross-Block text replacement/deletion | Refuses if any selected Block has a mode. Single-host replacement retains its mode; multiline continuation runs the intrinsic-data safeguard. |
| Movement | Moves the existing placement/content, retaining mode and identity. |
| Explicit duplication | Existing graph-copy path retains mode and allocates copied Block identity. No new provenance-remapping policy was introduced. |
| Whole-Block copy/paste | Existing clipboard format/materialisation retains modes on admitted base types. Mode-bearing incoming roots cannot be silently flattened into surrounding text. |
| Inline paste into moded text | A single unmoded open inline slice can merge while retaining the destination mode. Other structural insertion into a mode-bearing destination refuses. Whole Blocks can instead be inserted beside it. |
| Text list wrapping/outdent | Preserves the original mode-bearing text record. Operations on moded list shells or compound item owners refuse where the existing algorithm could clone or destroy those shells. |
| Task Enter | Mode-bearing source/owner bypasses task-specific continuation, allowing the ordinary path and its safeguards to decide. Rich direct-task payload continuation is unsupported. |
| Container/text-tab wrapping | Existing wrapping retains the semantic Block. No semantic mode is assigned to newly created wrappers. |
| Container unwrap/dissolve | Refuses if the removed container has a mode. Surface dissolution also checks surrounding shells being removed. |
| Reverse extraction | Refuses if flattening would discard a mode-bearing back side or container. Explicit deletion of reverse content remains an intentional deletion. |
| Replacement/conversion | Replacement cannot implicitly remove/change a mode or change its implementation type. Source-to-fragment and text conversion reject mode-bearing sources without an explicit policy. |
| Background descriptors | Same-type descriptor updates retain mode. Changing implementation type, or explicitly overriding an existing mode through the descriptor, refuses. |
| Undo/Redo | Existing history restores authored values and structural edits; refused operations produce no history entry. |

Continuation deliberately permits only the normal payload fields `id`, `type`, `mode`, `text`, `standoffProperties`, and `blockProperties`, plus empty object metadata and undefined extra fields. Block Properties must be `block/alignment` records containing only `id`, `type`, `value`, and/or `isDeleted`. Their existing order and multiplicity are preserved. Nonempty metadata, source IDs, annotation-definition registries, Block references, other properties, and other authored fields require a separately qualified continuation policy. Standoff ranges still use existing split/clipping semantics; no general metadata inheritance mechanism was added.

This is intentionally narrower than ordinary unmoded split behaviour. For example, assigning a mode to a heading with a font-size Block Property does not prevent typing, but Enter then refuses until continuation semantics are qualified or the mode is explicitly cleared.

## Compatibility and bounded-work evidence

Native tests retain exact unknown identifiers, including whitespace and Unicode, and preserve the existing `standoff-editor-block` implementation and Cell sequence. Native capture/decode/re-encode comparisons are exact for the tested fixtures. A moded generic container retains children and uses existing rendering. Saved SQL projection retains `payload.mode` in attributes with unchanged `typename`, `cell` coordinates, and Cell count.

Clipboard tests exercise real selection serialisation and materialisation with unknown modes. No clipboard admission table, codec family classifier, or native load validator was changed. Mode registration cannot admit an unsupported implementation type. The existing clipboard regression suites remain green.

Mounted input tests exercise actual `beforeinput`, caret restoration, annotation application, Enter at boundaries and inside selections, refused boundary joins, composition reconciliation, and Undo/Redo. These are jsdom integration tests, not a claim of end-to-end operating-system IME qualification.

Bounded-work tests assert no calls to repository snapshots, full reference rebuilding, full projection rebuilding, registry discovery, document encoding/saving, or fetch during the covered mounted typing/annotation/history sequence. They also retain unrelated content-record identity. Split/empty-sibling tests use 100 unrelated Blocks, assert unchanged unrelated records and surviving canonical Cell placements, no snapshot/reference/projection rebuild or registry lookup, and valid structural evidence. Refused joins and unsafe continuations assert no history or document changes. Existing inline/split performance suites pass.

No new geometry work, layout measurement, vault discovery, document saving, per-keystroke full validation, or general registry scan was added. Mode-specific ordinary typing work is absent. Unmoded structural checks are a field-presence check; continuation checks inspect only the affected payload/properties. Existing broad conversion/transaction paths were not rewritten or claimed to be universally cheap.

## Validation results

The following results are from executed commands, not planned checks. The entire repository test suite was not run.

| Validation | Result |
| --- | --- |
| Baseline `npm run typecheck` | Passed. |
| New mode tests, final contents | 33 added tests passed: registry 4, Block commands/persistence 17, mounted input 11, SQL projection 1. |
| Selected existing regression run | 26 files, 436 tests passed. |
| Reversible surface rerun after surrounding-shell guard | 43 tests passed. |
| Background regressions after descriptor guard | 5 existing tests passed, alongside 17 Block Mode tests. |
| Final `npm run typecheck` | Both reactive and server TypeScript projects passed. |
| `git diff --check` | Passed. |

There are **474 distinct passing tests across 31 files** in this qualification, counting reruns once. The final four-file mode/SQL run passed 46 tests before the additional background guard; the subsequent Block Mode/background run passed 22 tests. The SQL suite's pre-existing 14 tests are included in the 436-test regression count.

The 26-file regression command was:

```sh
node node_modules/vitest/vitest.mjs run \
  src/block-tree/block-tree.test.ts \
  src/block-tree/compatibility-fixtures.test.ts \
  src/block-tree/inline-performance.test.ts \
  src/block-tree/split-performance.test.ts \
  src/block-tree/resource-boundary.test.ts \
  src/block-tree/cross-text-edit.test.ts \
  src/block-tree/undo-storage.test.ts \
  src/block-tree/block-restore.test.ts \
  src/block-tree/list-wrap.test.ts \
  src/persistence/native-resource.test.ts \
  src/rendering/standoff-editor-view.test.tsx \
  src/rendering/cross-block-selection.test.tsx \
  src/rendering/mutable-clipboard.test.tsx \
  src/rendering/text-tabs.test.tsx \
  src/rendering/text-lists.test.tsx \
  src/rendering/task-lists.test.tsx \
  src/rendering/reversible-surface.test.tsx \
  src/rendering/markdown-input.test.tsx \
  src/runtime/features.test.ts \
  src/runtime/type-definition-indexes.test.ts \
  src/runtime/range-annotations.test.ts \
  src/interchange/clipboard.test.ts \
  src/interchange/tasks.test.ts \
  src/knowledge-sqlite/saved-projection.test.tsx \
  src/block-tree/minimal-type-compatibility.test.ts \
  src/rendering/minimal-type-extensibility.test.tsx
```

Focused suites: `src/block-tree/block-mode-registry.test.ts`, `src/block-tree/block-modes.test.ts`, `src/rendering/block-modes.test.tsx`, and `src/knowledge-sqlite/saved-projection.test.tsx`. Additional background suites: `src/rendering/background-media.test.tsx` and `src/rendering/stable-background.test.tsx`.

An initial SQL assertion imported the server projection into the reactive test tree and exposed an existing strict-type error at `saved-projection.ts:133`. The assertion was moved to the existing SQL projection suite, preserving its existing TypeScript project boundary. No unrelated SQL production fix or TypeScript configuration change was made. An initial split assertion also incorrectly expected projected occurrence keys to survive movement; it was corrected to assert surviving canonical Cell placements, the relevant storage identity.

### Real Flint browser checks and limitation

- Baseline `node scripts/benchmark-flint-typing-browser.mjs` failed to start Chrome within its 15-second timeout. No baseline timing result was obtained.
- Post-change `node scripts/benchmark-flint-empty-paragraph-browser.mjs` passed, including real Chrome character input and Undo, with its default 1,000 unopened vault entries. It asserted zero snapshot/prune/diff calls for the measured character and empty-paragraph deletion paths and no runtime exceptions.
- That run reported median synchronous handler times of 15.0 ms for character deletion and 32.9 ms for empty-paragraph deletion; maxima were 57.3 ms and 40.9 ms. These are diagnostic headless timings under that run's load, not display-latency guarantees or an improvement claim. The existing fixture is unmoded; moded behaviour is covered by mounted integration/counter tests.
- A successful matched before/after typing comparison remains unavailable. Browser performance qualification is therefore partial despite the passing bounded-work checks. Neither benchmark harness nor user fixture was changed.

Local execution logs are in `/tmp/block-modes-regressions.log`, `/tmp/block-modes-final-tests.log`, `/tmp/block-modes-background-tests.log`, `/tmp/block-modes-typecheck-final.log`, `/tmp/block-modes-flint-before.log`, and `/tmp/block-modes-flint-after.log`. The successful browser script wrote its usual artifacts under `/tmp/flint-empty-paragraph/`. These are local transient evidence, not repository deliverables.

## Exact files changed

| File | Change |
| --- | --- |
| [src/block-tree/block-mode-registry.ts](src/block-tree/block-mode-registry.ts) | New registry and explicit-assignment validation. |
| [src/block-tree/mode-editing.ts](src/block-tree/mode-editing.ts) | New small continuation/join safeguards. |
| [src/block-tree/types.ts](src/block-tree/types.ts) | Optional authored DTO mode field. |
| [src/configuration.ts](src/configuration.ts) | Default-on explicit-authoring flag. |
| [src/reactive-editor/editor.ts](src/reactive-editor/editor.ts) | Per-editor registry, assignment API, disposal, existing notice routing. |
| [src/block-tree/commands.ts](src/block-tree/commands.ts) | Clear-field handling and structural preflights. |
| [src/block-tree/cross-text-edit.ts](src/block-tree/cross-text-edit.ts) | Refuse unsafe semantic consumption/continuation. |
| [src/input/gateway.ts](src/input/gateway.ts) | Enter and boundary-deletion preflights. |
| [src/interchange/insertion.ts](src/interchange/insertion.ts) | Preserve semantic roots; reject unsupported structural paste. |
| [src/interchange/conversion.ts](src/interchange/conversion.ts) | Refuse conversion without semantic policy. |
| [src/runtime/text-lists.ts](src/runtime/text-lists.ts) | Protect semantic list/compound item shells. |
| [src/runtime/tasks.ts](src/runtime/tasks.ts) | Avoid task-specific semantic continuation loss. |
| [src/runtime/block-surfaces.ts](src/runtime/block-surfaces.ts) | Protect mode-bearing containers, sides and surrounding surfaces. |
| [src/block-tree/block-mode-registry.test.ts](src/block-tree/block-mode-registry.test.ts) | New headless registry/lifecycle tests. |
| [src/block-tree/block-modes.test.ts](src/block-tree/block-modes.test.ts) | New canonical, persistence, structural, clipboard and bounded-work tests. |
| [src/rendering/block-modes.test.tsx](src/rendering/block-modes.test.tsx) | New mounted editor/input tests. |
| [src/knowledge-sqlite/saved-projection.test.tsx](src/knowledge-sqlite/saved-projection.test.tsx) | Additional saved-attribute preservation test. |
| [BLOCK_MODES_IMPLEMENTATION_REPORT.md](BLOCK_MODES_IMPLEMENTATION_REPORT.md) | This report. |

The pre-existing untracked `SEMANTIC_TEXTBLOCK_SPECIALISATION_QUALIFICATION.md` was left intact. No commit was created.

## Remaining limits and exclusions

Equal-mode joins, rich metadata inheritance, cross-Block replacement involving modes, and structural paste into moded destinations need separately qualified policies before support can expand. Current refusals are deliberate and visible; registration itself grants none of these behaviours. A future implementation should not remove those guards merely because two mode strings match.

Explicit deletion and explicit mode clearing remain authored user actions. Raw repository/payload primitives can intentionally edit authored data; the registry is neither a security boundary nor a mandatory validator for every caller. No new UI exposes mode assignment in this milestone.

No general Block inheritance, semantic TextBlock implementation type, editor/renderer rewrite, Cell representation change, SQLite migration, native persistence change, legacy registry migration, clipboard admission expansion, importer, permanent TEI type, or production TEI vocabulary was introduced. No automatic document save or Markdown sidecar was added.
