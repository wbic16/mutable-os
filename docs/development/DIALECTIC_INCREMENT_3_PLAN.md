# Dialectic Increment 3 — Native presentation assessment and revised plan

7 November 2026 · Architecture investigation only. Baseline: `f0b1f67`, accepted Increments 1–2. Revised following the user's native-fidelity clarification and approval in principle of the Sequence model. **No implementation, browser qualification or new test runs have been performed.**

## Recommendation

**Native read-only composition rendering is feasible for a bounded, explicitly supported set of existing Block views. It is not a one-property switch, and universal support would be a substantial project.** Reuse the native views over additional transient projections in the same editor/repository. Do not create editable Document sessions, lease source DOM, clone canonical content or build another renderer.

Proceed, after review, with a small occurrence-level presentation policy and qualified native views for text/standoff styling, containers, tables, ordinary tabs, reversible surfaces, images and selected media. Keep unsupported Blocks visibly represented in their original structural position with Open source. If that boundary proves too wide, deliver Sequence authoring/reference navigation and defer native presentation; do not establish flattened previews as the primary model.

The earlier semantic-preview recommendation is withdrawn. Semantic excerpts could be an explicit optional fallback, labelled as incomplete, never a silent substitute for the composition's form.

## What the existing code establishes

Source paths below are relative to `src/`.

| Question | Finding and consequence |
|---|---|
| Can native views be passive? | `ReactiveTreeView` and `ReactiveViewProvider` have no read-only policy. `BlockOutlet` mounts the registered view, selection handle and optional global Block-presentation wrapper; `ReactiveViewLayers` adds editing panels. These can be selectively omitted while retaining native content rendering. |
| Can references overlap? | `ReactiveEditor.createView(viewId, rootPlacementKey)` creates an independent `BlockTreeProjection` over the same canonical placement. Distinct view/occurrence keys isolate mounts and presentation state. A parent composition, its child and the same source again can therefore coexist without moving DOM. |
| Does this duplicate content? | No new canonical Blocks, Cells, placements or history records are required. It **does** allocate new derived projection records/payload copies and new DOM for each occurrence. Canonical identity is shared; DOM identity and geometry are occurrence-specific. |
| Must another editor/session own it? | No. Use the existing application editor, repository and retained source Document session. Existing `disposeView()` releases occurrence mounts, selections, decorations, overlays and view-child state. The source session remains the authoring owner. |
| Is that already qualified? | `application/flint-transient-proof.test.ts` contains existing cases for shared canonical content, distinct occurrence identities, source removal/Undo and independent disposal. These support projection reuse; they do **not** establish read-only enforcement. No new results are claimed here. |

`block-tree/projection.ts` builds only the selected subtree from `readState()`, without a repository snapshot. It projects all owned children, Cells and relations, including branches whose DOM is not currently visible. It also contains incremental inline updates that return immediately for unaffected content. These are useful foundations, not a claim of zero rendering cost.

## The missing boundary: rendering without authoring

Introduce an immutable mode for each mounted projection, conceptually `authoring | read-only-presentation`, defaulting to today's authoring behaviour. Expose it through the existing view context and mount/input admission. It belongs to the **occurrence**, not the canonical Block: another view must remain free to edit the same source.

The policy must cover three distinct paths:

1. **Rendering and controls.** Keep the same native JSX, styles, character DOM and annotation geometry. Omit selection handles, editing menus/panels, authoring controls and caret/composition services. Keep lightweight mount handles where geometry, navigation or media need them; these are not independent editor sessions. Read-only text permits ordinary browser selection and Copy, without becoming a Mutable authoring selection.
2. **Input and commands.** Exclude passive targets from authoring bindings, Undo/Redo, input reconciliation, paste/drop, Cut and cross-Block editing gestures. Preserve links, tab/face controls, scrolling, media controls and browser text selection. Do not use `inert` or blanket event suppression on the whole composition. Prevent fallback to a stale editable focus target when focus is inside a passive panel.
3. **Direct and asynchronous writes.** Audit the admitted views' callbacks, not just command dispatch. Disable canonical writes from controls and load effects, while retaining occurrence-local status. A command gate alone cannot stop direct calls to `TreeCommands` or the repository.

Relevant evidence:

- `input/gateway.ts` installs document-level input, selection, history and command listeners. `input/cross-block-input.ts` installs its listeners **before** the gateway. A wrapper's bubbling event handler is too late; both must recognise passive origins. Clipboard and selection-target helpers must agree.
- `block-tree/registry.ts` offers command admission, but `application/window-lifecycle.ts` already owns its `permit` hook. Add an independent view-policy check without replacing lifecycle protection. Start with explicit permitted presentation actions, not an assumption that every command is safe.
- `rendering/standoff-editor-view.tsx` makes text editable, registers provisional-input/selection methods and caret services, calls Gloss interactions, and writes inline-image status on load/error. Both its direct-DOM and Solid character paths need the same passive policy. SVG/style rendering and measurement caches should remain shared.
- `rendering/task-control.tsx` writes task state; list disclosure currently writes authored collapse metadata. `standoff-code-view.tsx` changes language metadata. These controls must be disabled, or use an explicitly local reading-state override where supported. Their appearance alone does not make them presentation-only.

This is a contract for **reviewed native views**, not a sandbox for arbitrary feature/plugin code holding the editor. Use an opt-in capability on the existing Block registration and validate relevant payload variants; unqualified views must not mount. Visual-effect contributors with interactive callbacks require the same care. Do not rewrite every command or proxy the entire repository to claim universal protection.

## Native behaviour by family

| Composition feature | Initial native support and boundary |
|---|---|
| Text and standoff styling | Reuse `StandoffEditorView`, direct/Solid Cells, style runs, visual effects and parent-relative SVG geometry. Disable caret/IME/provisional authoring and annotation-edit popups. Known visual-only effects remain available; unqualified effect behaviour must be disclosed, not silently dropped. Existing Gloss/range definitions resolve against the source Document. |
| Containers and nested layouts | Reuse `ContainerBlockView`, core layout views, `ChildBlocks` and `RelationBlocks`. Mode propagates through all descendants and reverse faces. Do not flatten an unsupported parent into its children. |
| Tables | Reuse `TableView`/row/cell geometry and scrolling; hide mutation menus. Guides can remain local presentation state. Nested layouts continue through the same outlets. |
| Ordinary horizontal/vertical tabs | `TabRowView` already stores selection in occurrence-keyed `viewChildren`. Retain switching but suppress its request to focus a child editor. Preserve orientation metadata and existing tab mount/unmount behaviour. Specialised Document-tab hosts can open sessions and are **not** included automatically. |
| Reverse faces | `ReversibleSurfaceView` already changes occurrence-local face selection and retains face DOM. Keep flipping, native relations and media; avoid restoring an authoring caret or invoking unrelated provisional-input completion. `ResourceInformationView` has an explicit-reference fallback that scans repository contents on mount; use known/indexed source ownership in passive mode. |
| Images and media | Reuse native images, asset bindings and qualified video views. Playback belongs to each mounted occurrence; opening the same source twice creates two players, not synchronised playback. Avoid automatic duplicate playback. Inline image load/error is local presentation status in passive views. Leaving a group disposes its players; source players remain intact. |
| Links | Ordinary navigation remains possible. Mutable source links resolve through the retained source owner and existing navigation services, not whichever passive occurrence happens to resolve first. Navigation does not implicitly pin context or create replies. |
| Specialised widgets / application hosts | Unreviewed widgets, arbitrary iframe/app embeddings, Document-session hosts and authoring-heavy source views initially show an explicit native-presentation-unavailable reference. Add support individually; do not start a universal adapter project. |

Native fidelity means the native renderer preserves the **referenced owned composition**. Panel width may change wrapping; Textual still applies its established presentation-specific typography. It does not mean a screenshot of Desktop. Carry source Document styling/definition context into the panel without mounting its toolbar/window/session host. A cell or child selected without its enclosing table/surface cannot reproduce unreferenced ancestor structure: offer selection of the enclosing composition when that context is part of the argument.

## Ownership, lifetime and performance

Use one transient projection per displayed member, rooted at the resolver's current source placement. Separate projections avoid same-key mount collisions for overlapping references; their canonical Block/Cell IDs remain unchanged. Keep source resolution tied to the original Document index. On deletion, remove the native occurrence and show the unresolved member; on Undo or an explicit replacement, resolve again. Cancel late asset/effect callbacks when the member, source or application disappears.

Maintain a small number of active panels and preflight their selected closures before constructing projections. Count both Blocks and Cells, including inactive tabs and reverse faces. An excessive composition gets an explicit Open source boundary, not silent flattening or a partial canonical copy. Exact budgets require the focused implementation measurements; do not promise arbitrary compositions at constant cost.

Live native views update when their sources change. Cost follows the affected text/annotations **times the number of displayed occurrences**, and large paragraphs still have existing paragraph-level projection/rendering work. Geometry cannot be shared between differently sized occurrences; reuse each occurrence's existing valid cache and invalidation mechanisms. No new document-wide geometry sweep or scroll redraw should be added.

There are two specific performance risks to qualify:

- Generic repository changes can reach the projection rebuild fallback. Shared structural cases are not all incremental. If unrelated changes rebuild passive trees, add a narrowly justified affected-record/dependency check or report the blocker; do not rebuild projection infrastructure.
- General linked-definition resolution and reverse-information lookup can use broad ownership discovery. Supply the known source owner/index for passive presentation where necessary; do not expand unrelated indexing work.

Dispose inactive groups rather than retaining the entire Sequence offscreen. Prefer ending presentation when Open source starts editing; do not maintain optional hidden renderers during typing. A still-visible source elsewhere may legitimately update a panel, so bounded-work checks remain necessary. No new repository snapshots, dirty revisions, canonical transactions or independent Document sessions should result from opening, navigating or interacting with passive compositions.

## Shared-code impact register

| Proposed boundary | Why / alternative rejected | Focused regression |
|---|---|---|
| `reactive-editor/editor.ts`, `reactive-editor/context.tsx`; `runtime/mounts.ts` | Occurrence mode, source context and lightweight mounts. A second editor or global canonical read lock gives the wrong ownership. | Same source editable elsewhere; disposal releases only passive state. |
| `rendering/{reactive-tree-view,block-outlet}.tsx`; Block registration capabilities | Reuse native renderer with opt-in admission and no authoring layers. CSS hiding alone still runs handlers/effects. Respect the existing global Block-presentation owner rather than borrowing it. | Nested supported/unsupported views; no app/session hosts mounted accidentally. |
| Input gateway, cross-Block input, selection/clipboard helpers; command admission | Stop authoring at actual entry points while retaining browser/presentation actions. Do not overwrite existing window-lifecycle permission hooks. | Trusted keyboard, Cut/paste/drop, IME attempt, selection/Copy and stale-focus cases; editable source still works. |
| Standoff view and shared small controls | Separate visual work from caret/provisional work and direct writes. No duplicate text-rendering implementation. | Both character paths, styling/SVG, image load failure, task/code controls. |
| Core table/tab views, reversible surface, qualified media | Preserve native forms and local interaction while suppressing authoring paths. | Nesting, overlapping references, independent tabs/faces, playback and cleanup. |
| Projection filtering / known-owner lookup, **only where demonstrated necessary** | Prevent additional unrelated work without redesigning transactions/indexing. | Unrelated Document edits produce no passive rebuild/measurement; source edits touch only affected occurrences. |
| Dialectic Desktop/Textual views and controller | Separate authoring/presentation UI; retain source session and explicit context commands. No changes to graphical Flint presentation. | Workspace round-trip, source editor identity, context/provenance unchanged. |

Estimated complexity: **medium cross-cutting work for the listed native families; high/open-ended for arbitrary registered Blocks**. The largest risks are input ownership and standoff side effects, not tables or parallel panel layout. No runtime performance numbers are available for this proposed mode yet.

## Revised Sequence plan and UI

The model approved in principle remains: Document-owned Sequence definitions; stable group/member IDs; contribution/Block references; ordered groups; parallel/stacked arrangement; together/cumulative in-order reveal; optional visual emphasis. No copied source text or native composition payload belongs in the Sequence definition. Authored metadata changes remain bounded, canonical, undoable and manually saved; cursor/reveal/local tab/media state remains session-only.

Keep initial membership within the same Document's committed contributions. Missing targets stay unresolved rather than being guessed or removed. Unknown definition versions are retained but not executed. Duplication within a Document requires new Sequence/group/member IDs with unchanged source references; existing unsupported wrapper-copy guards remain. Use the existing Dialectic feature flag and leave ordinary views in authoring mode.

**Authoring** is an explicit Sequence editor: name groups, add existing sources, reorder/remove memberships and choose arrangement/reveal options. It edits references and presentation instructions. It does not edit source compositions or contribution chronology. Sequence metadata admission remains the narrow Document-field change proposed previously.

**Presentation** is a reading/comparison surface: select any group directly, see parallel members together, expand a member, switch its tabs/faces, play media, and follow links. Previous/Next and Reveal next are conveniences. Show all and direct access to a member remain available; reveal order is not an access restriction. Source editing requires Open source. Reply to source and Include in context are separate explicit actions through the existing controller. Browsing/revealing never changes consumed-context manifests.

Desktop and Textual share source identities and Sequence/session semantics but retain independent chrome and layouts through existing `ApplicationPresentations`. No new application registry, window manager or animation system is needed. A presentation switch may recreate passive DOM and restart its media player; retain the Sequence cursor and local tab/face choices by member/source identity. This does not remount or reset the retained source editor or its players. Seamless passive-player transfer is not promised for this increment.

After review, implement in three bounded slices:

1. Qualify passive input/ownership and reuse native text plus container/table/tab/surface/media views on one representative composition. Do this before building out Sequence presentation UI.
2. Add canonical Sequence authoring and native group presentation, incremental source resolution, unresolved references and explicit unsupported boundaries.
3. Complete dedicated Desktop/Textual navigation and focused browser qualification. If the first slice exposes a broader architectural dependency, report it and defer that support rather than silently expanding scope.

Qualification should cover a parent/child overlap and a repeated source, a styled nested table/tab/surface with media, attempted authoring from passive panels, source edits/deletion/Undo, Sequence Save/reload, context isolation and Desktop/Textual/source round-trips. Instrument canonical writes, snapshots, new sessions, projection rebuilds, affected annotation/layout work and cleanup. Measure group-open-to-visible/usable content and source typing with/without visible passive occurrences, including unrelated annotated Documents. Reuse existing regressions; no new exhaustive Block inventory or test framework.

**Review decision:** approve this limited native read-only contract and explicit unsupported-content boundary before Increment 3 implementation. The investigation supports this direction; it does not yet qualify a production passive renderer.
