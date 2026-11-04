# Mutable OS — Textual Workspace
## Investigative Feature Brief for Astra
**Status:** Investigation and planning only. No implementation without approval.  
**Flagship:** Flint. **Date:** 4 November 2026.

> **Core requirement:** Build a real character-cell Workspace shell, not a pixel-positioned retro theme. Reuse the existing Flint/editor implementation. Preserve **all** current functionality, editing semantics and document data.

## 1. Product definition
Textual joins Desktop, Canvas and Spatial as a first-class Workspace. It is inspired by Turbo Pascal, Borland C++ and Turbo Vision: one full-screen application, hierarchical menus, keyboard-first and mouse-accessible controls, restrained flat colour, precise cell-aligned dividers, optional hard black menu/dialog shadows, and a compact status/function-key line. The experience should be authentically grid-based rather than a modern UI painted blue. It is **not** a CRT simulation, terminal emulator or ASCII-only editor.

## 2. Approved architectural decisions
1. **True character-cell geometry:** all Workspace chrome, menus, borders, windows, dialogs, panels and overlays use integer row/column coordinates. Pixel dimensions are computed only at the rendering boundary. Box-drawing Unicode, SVG or CSS borders may draw the grid-aligned chrome; arbitrary absolute-pixel mockups are forbidden.
2. **Monospaced everywhere:** Flint document prose and UI text are monospaced. Retain bold, italic, colours, underlines and all standoff styling without changing cell advances. No proportional text as an escape hatch.
3. **Native rich-content islands:** images, video, Mermaid, SVG, graphs and other complex Blocks render natively inside rectangles whose *outer edges* align to the cell grid. Preserve native aspect ratio, playback, interaction, editing and data model.
4. **Half-size marginalia subgrid:** margin text can use 50% font size and a mathematically aligned grid of half-width and half-height cells (2×2 subcells per main cell). Verify actual font metrics and optical legibility; if exact alignment fails, propose measured compensation or a regular-grid fallback, not approximate CSS scaling.
5. **Fluid viewport and zoom:** measure monospace cell width/height and derive integer available columns/rows from actual viewport. +/- zoom changes cell/font size and triggers cell-count responsive reflow. No fixed 80×25 assumption. Persist settings only after investigating existing preferences.
6. **Full-screen apps:** one foreground app, Textual Desktop launcher, app switcher and previous-app return. No freely dragged overlapping application windows. Menus/dialogs/Scry may overlay, and application-defined deterministic splits are permitted.
7. **Parity is mandatory:** no editor, Flint, Block, annotation, Scry or Gloss capability may be silently removed because it lacks a permanent toolbar or panel. All must be discoverable and accessible.

## 3. Application and command model
Textual Desktop handles launching, open sessions, recent documents, switching and Workspace settings. Flint is the flagship full-screen app. Cardex is a separate full-screen app with contextual deep links to Entity/Claim/Relationship and predictable return to the exact Flint document, selection and scroll state.

Flint default is document-first: one menu row, optional compact document switcher, dominant document, bottom contextual status/function-key row. Suggested menu taxonomy: **File, Edit, View, Insert, Format, Annotate, Navigate, Tools, Window, Help**. No permanent formatting toolbar. Reuse existing command handlers; menu/shortcut/Scry should be alternative presentations of the same operations. Do not invent shortcuts conflicting with existing OS/browser/editor bindings.

**Transient:** Scry/LER, hierarchical menus, pickers, property dialogs, confirmations. They have grid-aligned bounds and predictable Escape/focus restoration. Scry remains Query Mode by default with planned Cmd+. toggle to Command Mode; preserve `*`, `@`, `/`, current-document entities, recent entities, search, selection, pipelines and command routing as actually supported. Distinguish planned features from implemented ones.

**Flint subviews:** Gloss Explorer, Local References, Outline, Graph/Mermaid and Argument Explorer use app-defined full-screen or split views, not arbitrary floating app windows. Gloss Mode must retain inline markers, marginalia, create/edit actions, types, relationships, navigation, filters and graph/argument presentation. Cardex should be directly invocable from relevant content.

## 4. Geometry and typography contract
Grid owns `{columns,rows,cellWidthPx,cellHeightPx,originPx,zoom}`; rectangles are `{col,row,widthCells,heightCells}`. Conceptually `columns=floor(usableWidth/cellWidth)`, `rows=floor(usableHeight/cellHeight)`. Calculate pixel positions from shared geometry only. Address fractional CSS pixels, devicePixelRatio, browser zoom, display changes, font loading, text metrics, snapping, edge remainders and accumulated drift. Do **not** use CSS `ch` alone as authoritative measurement.

A Unicode code point is not necessarily one cell. Investigate grapheme clusters, combining marks, East Asian wide glyphs, emoji, tabs, bidi text, soft wrapping and IME/composition. Validate selection and caret mapping against existing Flint editing. Half-size subgrid must share origin and exact 2:1 dimensions. Establish minimum usable grid sizes, narrow-screen fallbacks and cell-count breakpoints; never make commands unreachable. Zoom must preserve cursor, selection, scroll anchor, focus and application context. Avoid recomputing entire layout per keystroke.

Media islands are cell-aligned externally but native internally. Investigate resize in cell increments, aspect ratio/letterboxing, captions, embedded controls, focus, scroll anchoring and interactions between media selection and adjacent text. SVG chrome must be derived from grid geometry. Optional hard shadows use integer-cell offsets and do not affect hit-testing.

## 5. Mandatory feature-parity audit
Astra must inspect the repository and produce a table with columns **feature | actual source location | Desktop access | Textual access | status (implemented/planned) | risk | verification**. Include *every existing action*, not just this minimum inventory:

- Document tabs, lifecycle, save, file/resource URI import, export, publish, navigation, search, history and clipboard HTML/Markdown.
- Caret/selection, keyboard and mouse editing, IME, undo/redo, structural transactions, headings, styling, lists/task lists, tables/columns, tab rows, outliner and initialis.
- Every registered Block type, Surface/Reverse Blocks, media players, images, video, captions, metadata and editing controls.
- Standoff properties/strata, overlapping ranges, Entity mentions, inline decorations, underlines, hover/focus and editing.
- Scry/LER modes, queries, entity/mention lists, saved/unsaved document references, selection commands, pipelines, shortcuts and command bar.
- Gloss Mode, marginal glosses, Gloss Explorer, types, relations, Graph/Mermaid, Argument Explorer, filtering, incoming/outgoing and navigation.
- Local References/backlinks, indexing, counts, filters, Graph/Argument views and document outline.
- Cardex invocation, entity/claim/relationship deep links, return context.
- Accessibility, shortcuts, performance-critical editor paths, and all present toolbar/menu actions.

**No feature is allowed to disappear merely because a toolbar or sidebar is removed.** Investigate before proposing any new editor renderer; default to reusing the same document DOM, Block renderer registry, transaction pipeline and serialization.

## 6. Astra investigation questions
**Workspace architecture:** Where are Workspaces registered/persisted? How are Instruments hosted and windows managed? How can a fourth Workspace host a single full-screen foreground app with session persistence and context-preserving switching?

**Phosphor precedent:** What grid, font measurement, scaling, cursor and palette machinery is reusable? What is tied to CRT/ASCII-art simulation? Compare reuse, extraction of primitives and a minimal separate grid engine; recommend based on inspected code.

**Editor integration:** Locate Flint editor, selection/caret geometry, standoff rendering, Block registry, IME, keyboard dispatch, media, structural transactions and undo/redo. Can the existing editor DOM run in a monospaced grid container without a rewrite? Which parts need adapters? What are the hard cases for wrapping, Unicode, mixed media and nested Blocks?

**Commands:** Is there a shared command registry? Map all actions to menus, contextual commands and Scry. How will shortcut conflicts and keyboard focus be handled?

**Views:** How will Scry, LER, Gloss Explorer, References, Outline, graphs and Cardex behave in full-screen/split/overlay presentations? Define focus, return and scroll/selection restoration.

**Responsive geometry:** How are font metrics measured? What happens on zoom, display scale changes and small viewports? How do 2:1 marginalia cells maintain alignment? How will geometry performance be measured?

**Accessibility:** Screen readers, focus order, high contrast, keyboard-only use, native media controls, Unicode and user zoom.

## 7. Required investigation deliverables (NO CODE YET)
1. Architecture map with real paths, functions and component boundaries.
2. Feasibility verdict and explicit blockers/unknowns for every approved decision.
3. Exhaustive feature-parity matrix and action/shortcut inventory.
4. Proposed interfaces and dataflow: grid measurement, cell rectangles, app lifecycle, commands, focus and native media islands.
5. Tradeoff analysis: DOM/CSS vs canvas vs hybrid, and Phosphor reuse vs extraction; preserve native editor semantics.
6. Responsive layout rules, half-size subgrid qualification, Unicode strategy, font metrics and zoom behaviour.
7. Bounded incremental plan with independently testable stages, rollback points and performance budgets.
8. Tests and evidence required before claiming parity; open questions for product approval.

Do not undertake speculative migrations, broad refactors or implementation until approval.

## 8. Fidelity and acceptance gates
- Grid-aligned chrome at 1920×1080, 2560×1440, 3840×2160, smaller browser windows, browser zoom and varied DPR; no cumulative pixel drift.
- Consistent monospace advances for UI and document, including styling/underlines; exact aligned half-size margin grid or documented fallback.
- Native media controls and rendering within cell-aligned outer rectangles.
- Existing editor selection, caret, IME, undo, paste, lists, tables, Blocks, strata and transactions behave equivalently to Desktop.
- All Flint functionality discoverable via menus, shortcuts, commands or subviews; Scry/LER, Gloss, References and Cardex reachable and reversible.
- No regressions to other Workspaces, Phosphor, persistence, document data or editor performance.

## 9. Candidate stages (planning only)
0. Investigation and qualification; 1. shared grid/font/zoom/palette; 2. Textual Desktop, menus and app shell; 3. Flint hosting and parity baseline; 4. Scry/LER and focus; 5. marginalia/Gloss/References/graphs; 6. rich media/Cardex; 7. full parity/accessibility/performance/regression qualification. These are *not* permission to defer or omit functionality.

## 10. Assets
`textual-palette.css`, `textual-grid.css`, `layouts/textual-layouts.ts`, `layouts/WIREFRAMES.md`, and `reference/` (existing Flint screenshots and latest TUI mockup). Reference images illustrate visual intent only, **not** implementation geometry.

**Final instruction to Astra: investigate, qualify and propose a plan. Do not implement yet.**
