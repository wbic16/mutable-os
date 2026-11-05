# Textual visual refinement qualification

2026-11-05 · Complete. This is the requested refinement of accepted Increments 1–4.

## Changes

- **Gloss Explorer:** one-cell master rows with selection, type, summary and occurrence count; existing search/type filters; one selected detail pane containing the original navigation, editing, deletion and relationship controls. Graph and Argument remain available. Up/Down operates only in the focused list; Enter focuses details; Escape returns to the list or closes the Explorer.
- **Reading width:** defaults to 88 measured cells, bounded by available space. Workspace → Reading width toggles full width. It uses existing presentation preferences; Document data and authored styles are unchanged. Spare columns enlarge the secondary pane and margin within bounds.
- **Hierarchy and marginalia:** semantic headings use intensified colour, inverse H1 styling and an H2 separator at the ordinary cell font size. Notes have readable full-size type labels, short summaries, selection/focus indication and More/Less. Clicking a summary opens its complete Explorer detail. Half/Full and the existing placement/range cache remain intact.
- **Chrome:** Flint identity and Document tabs share a row; contextual controls follow it; application status shares the bottom Workspace status bar.

Implementation changes are confined to `src/features/textual/{gloss,marginalia,flint,view}.tsx`, `grid.ts`, `layout.ts` and `textual.css`. The existing Textual feature flag still governs this presentation. No graphical views, canonical models, editor engines, geometry services or persistence services changed. The [Shared-Code Impact Register](TEXTUAL_IMPLEMENTATION_PLAN.md#visual-refinement-boundaries--2026-11-05) records the boundary.

## Qualification

| Check | Result |
| --- | --- |
| Focused grid/preferences and layout/bounded-media tests | **5 passed** across two existing test files; `grid.test.ts` adds the reading-width preference expectations |
| `tsc --noEmit --project tsconfig.reactive.json` | **Passed** |
| Focused Chrome browser flow | **Passed**: list selection, local keyboard focus, query/type filters, Edit, relationship creation, Delete/Undo, Graph/Argument tabs, marginal summary selection and Passage navigation |
| Source editing | Trusted input, character selection and Undo/Redo passed with constrained width; native-media inventory visits did not increase during typing |
| Presentation lifecycle | Width toggle, 110% zoom, narrow Explorer/return and Desktop restoration passed; retained editor, Cell and original Text node identities survived |
| Bounded work after fixture setup | **0** repository snapshots, new projections, projection rebuilds or repository reference-index rebuilds across the measured interaction flow |

Browser fixture: the imported Michelangelo letter with temporary in-memory headings, media and eight Glosses. No user document or database was saved. Pointer and keyboard interactions use trusted CDP input; the native type-select filter is checked through its DOM change event. This is representative Chromium coverage, not a new platform or full editor regression matrix.

Measured at 1754 × 1000:

| Metric | 100% | 110% |
| --- | ---: | ---: |
| Cell width × row height | 9.640625 × 20 px | 10.609375 × 22 px |
| Reading width | 88 cells | 88 cells |
| Gloss master-row height | 1 cell | 1 cell |
| Heading font size, matching body | 16 px | 17.6 px |

Master rows also have a one-cell vertical pitch. Marginal positions remain on the existing half-row grid after zoom. Source review confirms the new layout work depends on viewport/preferences or explicit selection; it adds no per-keystroke repository traversal or Cell measurement loop. These counters establish bounded work, not a wall-clock input latency claim.

Reproduce the focused flow with `node scripts/check-textual-refinement-browser.mjs`. [Browser results](TEXTUAL_VISUAL_REFINEMENT_BROWSER.json).

## Screenshots and limitations

- [Wide: Flint, marginalia and master-detail Explorer](screenshots/textual-refinement-wide.png)
- [Narrow: full secondary Explorer](screenshots/textual-refinement-narrow.png)

Long types and summaries truncate in the list; the selected detail shows the complete text. Half-size note bodies remain intentionally small; full detail and the existing Full option provide larger reading. At narrow widths the secondary view occupies the document area, with Close/Passage returning to the source. Native graph/media and relationship controls retain their existing implementations. No resizable panes, new windowing or further phase was introduced.
