# Textual menu refinement — qualification

Implemented 2026-11-05. This refines the existing Textual presentation; its existing feature flag and command owners remain in place.

## Cause and change

The previous Flint popup spread `cellStyle(..., 24 rows)` into a Solid style object alongside `height: auto`. The generated style updates left the fixed height in the browser: **480 px**, despite only **120 px** of menu content. The outline used the same grey as the panel background, making the frame invisible. Workspace menus also reserved a fixed number of rows.

The dedicated Textual renderer now derives width from the longest label, shortcut column, submenu column, padding and border cells. Height is the item count plus separators and two frame rows. The fixed-height wrapper is removed entirely. A viewport limit applies only when content cannot fit; long lists scroll and keyboard selection scrolls into view.

Workspace and Flint menus share this renderer. It provides:

- Single-line character-cell frames with connected separators.
- A hard black shadow offset by one measured cell and one row.
- Full-interior black/white selection, disabled states and highlighted menu-bar headings.
- Separate existing-shortcut and submenu-indicator columns.
- Cascading, lazily loaded submenus, leftward placement near the right edge, and viewport clamping.
- Pointer selection, click/Enter activation, arrow/Home/End navigation, Escape/Left to return, and outside-click dismissal. No new global shortcut registrations.
- The existing input forms and action callbacks, including selection-aware formatting and document services.

No accelerator bindings are invented where the existing models provide none. Existing shortcut text is reused; Save and history labels reflect their existing bindings.

## Checks and evidence

Four focused tests cover cell dimensions, separators, viewport placement, stable pointer-target DOM, disabled-item navigation, action dispatch, lazy children, Escape, input submission and dismissal. TypeScript passes.

Trusted Chrome mouse/key input with a real retained Flint fixture verified nested menus, shortcuts, font settings, zoom, typing/Undo, retained Cell/Text/projection identity and Desktop restoration. Menus preserved the selected text through the existing session/toolbar machinery. No user data was saved.

| Format menu | Width | Height | Cell dimensions |
|---|---:|---:|---|
| Previous default | 403.594 px | 480 px | 42 × 24 |
| Refined default | 192.188 px | 160 px | 20 × 8 |
| Font size 20 px | 240 px | 176 px | 20 × 8 |
| Font size 20 px, zoom 110% | 264.063 px | 193.5 px | 20 × 8 |

The eight rows comprise five items, one separator and two frame rows. Across menu interactions, font/zoom changes, typing/Undo and return to Desktop: **zero repository snapshots, new projections, projection rebuilds or reference-index rebuilds**. Menu layout reads the trigger and workspace rectangles when grid geometry changes; it does not measure editor Cells or scan Documents.

[Format screenshot](screenshots/menu-format.png) · [Nested menu screenshot](screenshots/menu-nested.png) · [Browser measurements](menu-browser-results.json)

## Files and boundaries

Implementation is confined to `src/features/textual/command-menu.tsx`, new `menu-layout.ts`, `flint.tsx`, `view.tsx` and scoped `textual.css`. Tests: `command-menu.test.tsx` and `scripts/check-textual-menu-browser.mjs`.

Shared-Code Impact Register: **no non-Textual implementation changes**. Graphical menus, application registrations, editor engines, persistence and command definitions are unchanged. The browser round-trip retained Desktop typography and its original document container.

Qualification used Chrome on macOS; no broader browser campaign was run. Very long labels are ellipsized only when constrained by the viewport, with their full text available in the title. Submenus open by click or Right arrow; automatic hover-to-open and new mnemonic bindings are not introduced.
