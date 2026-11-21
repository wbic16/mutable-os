# DCP native authoring — Stage 2B qualification

9 November 2026. Stage 2A is accepted. Stage 2B adds lists/tasks and layouts through shared native preparations. `dcpNativeAuthoringStage2Layouts` is enabled after qualification, depends on Stage 1, and can be negotiated independently of Stage 2A. Stage 2C, 2D and Stage 3 have not begun.

## Qualified scope

| DCP route | Parameters and native effect |
| --- | --- |
| Existing `list` | Retains `items:[[nodes]]` and ordered/bullet styles. Optional `configuration:{start:null\|integer,reversed:boolean,items:null\|[{value:null\|integer,checked:null\|boolean}]}` adds native start/reversed numbering and per-item values/task state. Configuration items must match content items exactly. |
| Task lists | `style:'task'` creates unchecked items by default. Explicit checked booleans set authored initial state, including tasks in ordered/bullet lists. Requires the native `taskLists` feature. Host-owned item containers carry the native checked state; no separate task/event system. |
| Existing `table` | Retains rectangular `rows:[[[nodes]]]`. Optional `configuration:{headers:[[boolean]]}` must match every row/cell. Native cell header metadata supplies header semantics; content formatting remains explicit in child text. |
| Existing `grid` | Retains the same row/cell/content shape. Supports unequal row lengths produced by native merging, with multiple child Blocks retained in a cell. Existing rectangular grids remain valid. |
| Reading | Native list/item identity, numbering, checked state, nesting, headers and row relationships are preserved. Existing collapse state and bounded column-weight metadata remain inspectable; non-rendered weights/spans are identified explicitly. |

Signed safe-integer starts and per-item values are retained. A reversed ordered list with no explicit start starts at its item count. Numbering parameters on bullet/task styles are rejected. Nested lists/layouts use ordinary child content; internal item containers and row/cell shells are always host generated.

The strict provider schema requires nullable `configuration` on lists/tables. Host admission also accepts the existing omitted-field forms. Disabled exchanges retain their previous schemas and behavior, including Stage 1's rectangular grid constraint. No raw native metadata, ownership DTOs, arbitrary properties or retrieval-budget changes were introduced.

## Shared operations and immutability

`layout-authoring.ts` supplies `prepareList`, `listShell`, `listMetadata`, `listItemPayload`, `taskChecked`, `prepareLayout` and `tableCellMetadata`. Native list conversion, HTML/Markdown import, task commands, human table creation and the existing grid preparation reuse these operations or payload validators. DCP no longer builds list/table shell hierarchies itself. Native move/merge/edit commands and the bounded automatic-prefix planners retain their existing ownership and history paths.

Draft checkboxes remain interactive. Submitted controls are disabled and event/command guards preserve authored checked state; canonical protection still rejects direct mutation. Undo/Redo restores both content and control eligibility. Persisted list-collapse controls also respect protection.

The capability catalogue advertises qualified list/table/grid configuration and a task capability with its native feature prerequisite. Every individual descriptor remains complete within the existing 8,192-byte detail limit. Initial summaries remain compact; no full vocabulary injection was added.

## Qualification

**344 focused tests passed across the suites below; reactive and server TypeScript checks passed.** The new integration fixture also serializes the contribution, admits it into a fresh native repository, and compares canonical native serialization. Private runtime keys may change on reload; authored identities, content and relationships are retained.

```sh
npx vitest run src/features/dialectic/dialectic.test.tsx src/features/dialectic/dcp/capabilities.test.ts server/dialectic/providers.test.ts src/block-tree/layout-authoring.test.ts src/features/dialectic/dcp/dcp.test.ts scripts/audit-dcp-vocabulary.test.ts
npx vitest run src/rendering/task-lists.test.tsx src/rendering/tables.test.tsx src/rendering/text-lists.test.tsx src/rendering/list-prefix.test.tsx src/block-tree/list-wrap.test.ts src/block-tree/task-state-plan.test.ts src/interchange/tasks.test.ts src/interchange/html-import.test.ts src/interchange/markdown-native.test.ts
npm run typecheck
```

Coverage includes human/DCP list/item/header equivalence; human table creation through the shared builder; nested and unequal-row layouts; initial checked/unchecked state; protected controls and direct mutation rejection; invalid fields, unsupported configurations and feature gates; generated item/row/cell descendant budgets; stale/foreign source authority; injected canonical insertion failure with complete rollback; Undo/Redo; native save/reload; and bounded inspection/provider schemas. Existing Stage 1 and 2A qualification tests remain passing.

Typing checks confirm no DCP retrieval/network calls, full snapshots or projection rebuilds. Existing list-prefix/list-wrap and table/task suites cover bounded Cell reads, no global scans or structural planning during ordinary typing, IME and native history. No background saves were added. Tests exercise native persistence and deterministic provider fixtures, not a live Cavern save or live model benchmark.

## Exact limits and remaining work

- **Widths/spans:** column weights are retained native metadata but have no resize UI or rendering. Imported spans are explicitly flattened by the native importer. These are readable preservation data, not qualified DCP authoring effects; width/span configuration is rejected.
- **Initial collapse:** not exposed. Native collapse writes persistent Document metadata, so an initially collapsed immutable contribution would have no working disclosure control. New DCP nested lists start expanded. An immutable-safe presentation mechanism would need separate review before this setting is authorable; no alternate state system was introduced here.
- **Existing-content edits:** row/column movement, merging, task toggling and other edits of already submitted content remain outside DCP authority. Creation can express the supported final owned structure without claiming permission to mutate a prior contribution.
- **Other native representations:** DCP tasks use the existing task-bearing item-container representation. The legacy standalone `checkbox-block` is inspected and its native controls are protected; a separate standalone creation projection is not claimed by this list increment.

Surface-backed Markdown fallback, contribution notices, task-expectation enforcement, resource acquisition/generation and general submitted-content editing remain deferred. This report stops at Stage 2B for review.
