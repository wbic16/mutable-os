# Rendering and reactivity

## From JSON to a visible DocumentWindow

The actual pipeline is:

```mermaid
flowchart LR
  DTO[ExistingBlockDto] -->|decodeBlockTree| N[normalized RepositoryState]
  N --> R[CanonicalRepository Solid store]
  R --> P[BlockTreeProjection for ViewId]
  P --> T[ReactiveTreeView]
  T --> O[BlockOutlet]
  O -->|BlockRegistry.resolve viewType| V[registered Solid view]
  V --> C[ChildBlocks / RelationBlocks]
  V --> M[MountRegistry]
  V --> D[DOM, local SVG, or Portal]
```

`ReactiveEditor` performs decoding in its constructor. `createView()` creates a `BlockTreeProjection`, normally rooted at the repository root placement. `ReactiveTreeView` supplies editor and projection context, renders the root `BlockOutlet`, then mounts global portal/layer UI such as overlays and Block-history panels.

A `document-window-block` resolves to `WindowView` in [`core-block-views.tsx`](../../src/rendering/core-block-views.tsx). It renders its projected children; the contained `document-block` resolves to `ContainerBlockView`. A Page uses `PageView`. “DocumentWindow” is therefore rendered composition, not a special canonical tree implementation.

## Decode and normalization

[`decodeBlockTree`](../../src/block-tree/codecs.ts) walks nested `ExistingBlockDto` data and produces one `ContentRecord` plus one owned `PlacementRecord` per nested Block. It:

- maps legacy root aliases `main-list-block` and `membrane-block` to `document-block`;
- moves `leftMargin`, `rightMargin` and recognized `superposition:` Block relations into `ownedRelations`;
- retains other relation values in `opaqueRelations`;
- records whether `children`/`relation` were omitted, null, or present;
- removes `text` from a `standoff-editor-block` payload and creates an inline `text-cell` content/placement for each Unicode code point.

The canonical repository validates record references, ownership, reachability, and cycles before publishing a commit.

## Projection and stable occurrence identity

[`BlockTreeProjection`](../../src/block-tree/projection.ts) recursively projects placements into `BlockNode`s. It owns a Solid store with `rootKey`, `nodes`, and `revision`. A node contains the data a renderer needs: `viewType`, payload, child occurrence keys, inline occurrence keys, and relation occurrence keys.

`NodeKey` identifies a route to a placement in one `ViewId`. The projection retains route-to-key mappings so a surviving occurrence normally keeps its key across edits and moves it can reconcile. The same canonical content can still have distinct node keys when rendered through multiple placements or views. Use:

- `payload.id` for authored/durable identity;
- `ContentKey` for shared canonical content;
- `PlacementKey` for the attachment edge;
- `NodeKey` for DOM, focus, selection, and view-local state.

The projection subscribes to repository changes. It has optimized inline, split, and child updates and otherwise rebuilds/reconciles the projection. Projection objects are derived and must never be edited directly.

## Renderer selection and traversal

[`registerApplicationViews`](../../src/application/features.ts) populates registries through legacy/core assembly and configured feature activation. `registerCoreViews` alone excludes optional Timer registration. `BlockOutlet` reads `projection.state.nodes[nodeKey].viewType`, resolves a `BlockTypeRegistration`, and uses Solid's `Dynamic` component. Missing registration falls back to `UnknownBlockView`.

Core/legacy container views traverse children with:

```tsx
<ChildBlocks parentKey={props.nodeKey} />
```

`ChildBlocks` reads the projected `children` array and renders a `BlockOutlet` for each key. `RelationBlocks` does the same for `ownedRelations`; document margins may move their live relation view to a drawer when collapsed. Inline Cells are deliberately different: `StandoffEditorView` renders `node.inlineContent` as text spans or inline images because they are part of one editing host.

## Hosted Block instances

A migrated module registers a `BlockApplicationDefinition`, including authored defaults and a component receiving `BlockRuntime`. The application adapter supplies a separate runtime for each mounted occurrence. Timer's view does not use `useReactiveView`: it reads detached fields through `runtime.field`, writes its own authored state through `runtime.setField`, and registers its widget mount through `runtime.mountWidget`.

The feature registration lifetime and the view's Solid lifetime are different. Removing one Timer cleans only that instance's interval, audio and mount; editor teardown unmounts all contributed views and removes module registrations. Authored data survives ordinary unmounting. The current public runtime does not expose child/relationship rendering or general overlays; those remain future capability decisions.

## What causes updates

A command publishes repository operations. `CanonicalRepository` applies them with Solid's `reconcile`, increments revisions, and notifies subscribers. Each projection updates its Solid store. A view reruns only computations that read changed reactive fields.

Typical dependencies are deliberately narrow:

- a checkbox reads `payload.checked`;
- a container reads its `children` array;
- `blockAppearance` reads `payload.blockProperties`;
- `StandoffEditorView` reads inline keys, annotation data, and selected session revisions;
- local UI state such as a timer tick uses component signals and does not commit every second.

Hosted `runtime.field` reads must occur inside reactive expressions or memos. The adapter traverses only that field through Solid proxies before returning a detached copy; unwrapping first would miss nested dependencies.

Do not force a rerender after a command. If the UI does not update, first check that the view reads the projected field reactively rather than a one-time copy.

## DOM ownership and mounts

Solid components own their DOM lifetime. Hosted widgets use `runtime.mountWidget` and `runtime.own`; the adapter binds cleanup to the instance owner, including later-acquired resources. A core/legacy view that participates in focus/input registers a `MountHandle` with [`MountRegistry`](../../src/runtime/mounts.ts) in `onMount` and disposes it in `onCleanup`. The handle describes its root, focus element, input policy, and optional text/selection adapters.

The model contains no `HTMLElement`, `Range`, observer, or cleanup callback. A `NodeKey` connects a disposable mount to its projected occurrence. When the component remounts, the registry generation prevents old cleanup from deleting the new handle.

Portal views, such as Timer Blocks and global overlays, remain canonically located in the Block graph even though their DOM is mounted elsewhere. Render placement is not ownership.

## Performance assumptions

- Payload and record values are JSON-shaped; avoid inserting class instances or DOM handles.
- Use one command/transaction for one user operation. Repeated direct commits multiply validation, projection, undo, and durable-history work.
- Standoff text is one inline Cell per code point. Use `replaceInlineRange`, which has an optimized repository/projection path; do not rebuild the whole document for each keystroke.
- CSS standoff styles are compiled into endpoint runs so SVG-only annotations do not become per-cell dependencies.
- Occurrence keys should be used as keyed identity. Array indexes are positions, not identity.
- A renderer must tolerate being disposed/recreated and the same content appearing in another occurrence.

See [SVG and overlays](SVG_AND_OVERLAYS.md) for geometry-derived rendering.

## Accepted Flint character architecture

The resident Cell boundary and identity-based DOM addressing programme was accepted and closed on 25 November 2026.

**Identity is stable; position is derived. Logical granularity need not dictate physical presentation granularity.**

- Eligible compact text stays cold through open, mount and scroll. On editing, each Unicode code point has one lightweight, content-owned resident Cell. Annotations derive their start and end indexes from their boundary Cells. A text splice reindexes the affected suffix once.
- Each mounted occurrence owns its DOM, caret, selection and geometry. It resolves a surviving character span to its current position on demand. Several occurrences can share a canonical Cell while retaining independent presentation.
- Both production flags are enabled by default. The independent switches preserve the numeric boundary planner, the previous DOM addressing path and diagnostic comparisons. [Feature defaults](../../src/configuration.ts)

The qualification reports retain the measurements, benchmark commands, raw archives and regression evidence. [Resident Cell boundaries](../../RESIDENT_CELL_BOUNDARY_QUALIFICATION_REPORT.md) · [Identity-based DOM addressing](../../IDENTITY_BASED_DOM_ADDRESSING_IMPLEMENTATION_REPORT.md)

## Architectural backlog

### Decoupling Logical and Physical Character Granularity

Deferred investigative opportunity. A future renderer could preserve one logical Cell per character while coalescing contiguous characters with compatible effective presentation into bounded DOM text runs. Possible strategies include fixed-size runs, effective-style runs and bounded effective-style runs. The existing addressing abstraction could map each character to a native Text node and UTF-16 offset for selection and Browser Range construction.

Intra-paragraph virtualisation is also deferred until a concrete product requirement justifies it.
