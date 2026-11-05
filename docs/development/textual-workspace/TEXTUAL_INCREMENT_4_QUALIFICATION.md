# Textual Workspace — Increment 4 qualification

2026-11-05 · Existing default-on `textualWorkspace` flag retained

## Delivered

- Fixed, cell-aligned source, marginalia and secondary regions. References and Gloss share separate mounting slots; changing views does not remove the other view's portal or rebuild the editor. References stays open during occurrence navigation. Narrow grids use a full-width secondary view with Close to return to the retained source.
- Half-size marginalia over the **existing Gloss index, placement renderer, visibility tracking and retained range cache**. Card positions snap to half rows. Paired glyph slots share complete main-grid column boundaries, avoiding cumulative half-cell rounding drift. A **Half / Full** control provides full-size text; narrow layouts retain full-size Gloss Explorer access. Long notes have More/Less controls.
- Double-line pane frames, compact menus, cyan selection, grid-aligned controls and hard-edged shadows offset by one column and one row. Cardex has its own foreground caption; underlying Flint controls are inactive while Cardex is presented.
- Scoped table/list layout and native media containment. Image and video-frame heights reserve complete rows through resize notifications. Table column counts drive whole-cell widths. Native image, iframe, graph and field-editor internals remain intact.
- References includes **Show full Document**, releasing the existing occurrence-focus owner and its filter. Explicit source return also releases that owner, preventing later edits from reinstating a stale filter.

No new commands/keyboard bindings, Block types, canonical metadata, persistence paths or window manager were introduced. Document saving remains manual.

## Changed boundaries

Most work is confined to `src/features/textual/`: `layout.ts`, `native-islands.ts`, `marginalia.tsx`, the existing Flint/Gloss/References/Cardex/shell views, and scoped CSS.

The only shared implementation file changed is `src/features/gloss/presentation.tsx`: expose its existing margin renderer and accept optional row-pitch/gap metrics. Graphical rendering retains its existing card component and placement defaults. See the [Shared-Code Impact Register](TEXTUAL_IMPLEMENTATION_PLAN.md#increment-4-implementation-boundaries--2026-11-05).

Graphical stylesheets, canonical mutation, history, persistence, editor input and native media renderers are unchanged.

## Qualification

**Seven focused tests passed:** two new layout/bounded-work tests and five existing Gloss Stage B tests. The new adapter test covers ordinary Cell edits and SVG-decoration replacement: neither visits unrelated media. TypeScript compilation and whitespace checks passed.

The focused Chrome harness uses an in-memory copy of the existing letter fixture, supplemental image/list/table/video Blocks, and isolated Cardex responses. It does not save the user's documents or modify their database.

| Browser check | Result |
|---|---|
| Pane edges, table columns, media regions and menu buttons | Aligned to measured cells; normal and 110% font zoom |
| Marginalia | Half-row positions, paired column boundaries, full-size alternative and reflow |
| Repeated native scrolling | Zero additional range measurements; existing card offsets unchanged |
| Persistent References | Occurrence focus and full-Document return keep the secondary region available |
| Native graph | Existing sandboxed Mermaid renderer reaches “Graph ready” |
| Native input | Trusted text insertion and Undo; zero media-inventory visits during typing |
| Narrow layout | 720px viewport retains source DOM; Close returns to the source |
| Desktop restoration | Original Cell/Text node, image and video iframe identities preserved; graphical font restored and adapter styles removed |

The measured flow recorded **0 repository snapshots, 0 new projections, 0 projection rebuilds and 0 reference-index rebuilds**. These are work counters, not input-latency estimates. Native media sizing uses supplied resize dimensions; it does not measure Cells or scan the repository. Removed subtrees are handled locally, including when annotation SVGs change.

[Browser measurements](TEXTUAL_INCREMENT_4_BROWSER.json) · [Wide layout](screenshots/textual-layout-increment-4.png) · [Narrow layout](screenshots/textual-narrow-increment-4.png) · [Cardex](screenshots/textual-cardex-increment-4.png)

## Limits

Native graph/media internals and specialised authored layouts retain their own rendering geometry. The video check covers the original iframe and its containing region, not external streaming playback. This increment qualifies Chrome and representative Latin-text fixtures; it does not repeat the prior platform/IME matrices. Intrinsic control-width rounding uses CSS capability detection, with native sizing as the fallback.

No prior increment's full matrix, accepted toolbar failure, unrelated Canvas baseline or exhaustive Block inventory was revisited. Movable/overlapping windows and keyboard redesign remain outside scope.
