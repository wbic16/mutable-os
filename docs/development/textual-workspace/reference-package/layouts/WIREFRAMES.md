# Cell-based layout sketches (not fixed-resolution specifications)

All boundaries are integer grid coordinates; rich media is a native island inside a cell-aligned frame. Responsive policies, exact widths and keyboard bindings require Astra qualification.

## A. Flint document-first
```text
┌ File Edit View Insert Format Annotate Navigate Tools Window Help ─────┐
│ [1] Notes   [2] Ideas   [3] Codex — Atlas of Relations               │
├─────────────┬─────────────────────────────────────────────────────────┤
│ MARGINALIA  │ Codex: An Atlas of Relations                           │
│ Thesis      │ 1. Introduction                                       │
│ Claim       │ Text with entity mentions and standoff underlines...  │
│ Evidence    │ [native image/video frame, snapped to cell edges]      │
│             │ Further document paragraphs...                        │
├─────────────┴─────────────────────────────────────────────────────────┤
│ F1 Help  F3 Scry  F4 Gloss  F5 Refs  F6 Cardex   Zoom - 100% +      │
└───────────────────────────────────────────────────────────────────────┘
```

## B. Scry overlay (on top of Flint, not a separate app)
```text
                   ┌ SCRY — Query Mode ────────────────┐
                   │ @michelangelo                     │
                   ├ Entities | Documents | Mentions ─┤
                   │ > Michelangelo Buonarroti         │
                   │   Michelangelo and the Dome       │
                   │   Claim: design of the dome       │
                   ├ Preview ──────────────────────────┤
                   │ Entity • mentions • documents     │
                   │ Enter Open  Cmd+. Mode  Esc Close │
                   └───────────────────────────────────┘
```
Focus and document caret/selection/scroll are restored when dismissed. Query and Command Mode share the existing LER semantics; actual key bindings must be audited.

## C. Gloss/References subview
```text
┌──────────── Document ────────────┬──── Gloss Explorer / References ──┐
│ highlighted text and marginalia │ types, filters, selected gloss    │
│                                 │ relationships / graph / argument │
└─────────────────────────────────┴───────────────────────────────────┘
```
On narrow grids, replace split with full-screen subview and an explicit Back command; do not silently drop features.

## D. Cardex app switch
`Flint (Entity selection) → Cardex (Entity Card full screen) → Previous App → Flint (same selection and scroll)`.

## Layout principles
- Primary cell geometry is authoritative, not fixed pixel positions or `ch` alone.
- The half-size margin grid has 2×2 cells per main cell and shared origin.
- Menus/dialogs may cast hard black shadows at exactly one cell offset.
- At each zoom level calculate full rows/columns, then apply cell-count breakpoints.
- Native media never needs to be reduced to ASCII art.
