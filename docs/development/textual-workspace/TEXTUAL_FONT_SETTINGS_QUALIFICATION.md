# Textual Presentation Font Settings — qualification

Implemented 2026-11-05. Enabled by default under `textualFontSettings`; disabling it retains the previous Textual font stack and zoom sizing. ApplicationPresentations is unchanged.

## Use and persistence

Open **Workspace → Presentation Settings…** in Textual. Choose Bundled or System, adjust the base size (12–32 px) and line height, inspect the live preview, or Reset to Defaults. Close and Escape dismiss the panel. Numeric fields apply on change/commit; the system family updates while entered. Reset restores font defaults while preserving workspace zoom.

IBM Plex Mono is the new default, at 16 px with a 20 px line height. Regular and bold WOFF2 assets total **99,628 bytes**, bundled locally with the SIL OFL 1.1 and attribution. No runtime font CDN is used. The matching source font contains every tested Latin/digit/single- and double-box glyph with 600-unit advances in a 1000-unit em. The actual WOFF2 rendering also passes the browser compatibility check. See [IBM's source](https://github.com/IBM/plex) and the pinned revision in the asset README.

System fonts use manual family entry with suggestions. Browser enumeration is permission-gated and not consistently supported, so no native discovery service or font-access permission is introduced ([Chrome documentation](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts)). Local availability and regular/bold letter, punctuation and box advances are checked. Missing or incompatible choices show an explicit notice and use IBM Plex Mono; a bundled-load failure retains the legacy system-monospace fallback. The requested preference remains saved for later availability.

Preferences extend the existing `mutable.textual.preferences.v1` localStorage record. Older records acquire defaults. Nothing is written into Documents; manual Save and dirty tracking are unchanged. Additional bundled families require a registry entry and font-face assets, without application-view changes.

## Layout and preservation

One inherited Textual CSS variable supplies the family to the shell, menus, controls, Flint, marginalia and instruments. Effective size is **base size × existing zoom**. Row pitch is quantized to pairs of Chromium layout units so half-row marginalia remains representable before deriving grid multiples. After loading, the existing 256-fragment probe measures real cell advance and row height; the existing grid, reading width, rich-content and marginalia mechanisms reflow in animation frames.

Async results have stale-request and disposal guards. Font work depends on font/zoom settings, not text revisions. A compatibility probe measures a fixed sample, never Document contents.

A browser check exposed a specific cache defect: IBM Plex Mono → Courier New keeps the same cell advance, but native glyph rectangles change from 20 px high to 18 px high. ResizeObserver alone cannot detect that change. A small presentation-scoped font-layout notification now invalidates the existing range cache and schedules existing standoff and Gloss measurement owners. It is frame-coalesced, sent only after an effective font/size/line-height change, and does not replace the geometry machinery or notify unrelated graphical content. Native editor selection is retained through the existing session bookmark mechanism while settings inputs own focus.

## Qualification

- **34 tests passed:** font preferences/grid (7), scoped notification/disposal (1), existing standoff renderer regressions (26).
- `npx tsc --noEmit --project tsconfig.reactive.json`: passed. `git diff --check`: passed.
- Headless Chrome on macOS, 1754 × 1000 viewport: real retained Flint, eight Glosses, annotated text and a rich-content image, with isolated in-memory service fixtures. Buttons and text entry used trusted CDP input; the native source select used its DOM change event. Browser checks covered IBM and Courier New, missing/proportional fallback, preview/reset, size/line-height/zoom, same-advance range-cache refresh, marginalia alignment, retained Cell/Text/projection identity, selection restoration, typing/Undo, Desktop restoration and preferences after application reload.
- Font-only changes left the canonical repository revision unchanged. Across settings, typing/Undo and Desktop return: **0 repository snapshots, 0 new projections, 0 projection rebuilds, 0 reference-index rebuilds**. Ordinary typing caused **0 font loads/compatibility passes**. Scoped-notification testing confirms unrelated content is not invalidated.

| Browser state | Cell advance | Row pitch | Columns | Reading width |
|---|---:|---:|---:|---:|
| IBM Plex Mono, 16 px / 20 px | 9.609375 px | 20 px | 182 | 88 cells |
| Courier New, 16 px / 20 px | 9.609375 px | 20 px | 182 | 88 cells |
| IBM Plex Mono, base 18 / 24 at 110% | 11.875 px | 26.40625 px | 147 | 88 cells |

All eight visible marginalia cards remained on half-row slots, within CSS decimal rounding. Desktop restored the original owner/container and computed editor font.

Evidence: [browser results](font-settings-browser-results.json), [screenshot](screenshots/font-settings.png), and `scripts/check-textual-font-browser.mjs`.

## Changed modules and limits

- `src/assets/fonts/ibm-plex-mono/`: two fonts, licence and source attribution.
- `src/features/textual/{fonts.ts,font-settings.tsx,view.tsx,grid.ts,textual.css}`: loading/compatibility, settings, preferences and shared styling. `fonts.test.ts` and `grid.test.ts` cover preferences/metrics.
- `src/configuration.ts`, `src/application/workspace-presentation-view.tsx`: default-on flag and wiring.
- `src/rendering/{font-layout.ts,font-layout.test.ts,standoff-editor-view.tsx}`, `src/features/gloss/presentation.tsx`: scoped inherited-font geometry invalidation. See the [Shared-Code Impact Register](TEXTUAL_IMPLEMENTATION_PLAN.md#font-settings-boundaries--2026-11-05).
- Browser harness and this report/evidence.

Only regular and bold are bundled; italic is synthesized. Compatibility is a practical Latin/box-drawing check, not a complete Unicode certification. On this Mac, Menlo's bold box advances differed from its letters (9.609375 versus 9.640625 px), so it was correctly rejected. System font access can also be restricted by browser privacy settings. Browsers beyond Chrome were not qualified. If even the bundled font cannot load, the legacy fallback remains usable but is not certified for the same glyph coverage. Existing native rich-content islands retain their specialised rendering.
