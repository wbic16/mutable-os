# Textual Increment 1 — grid and shell

**Implemented:** a dedicated, scoped Textual shell with a measured font grid, font zoom, Borland/Paper preferences, Workspace presentation registration and a default-on `textualWorkspace` flag. Choose **Presentations → Textual**; its Workspace menu provides zoom, palette and Return to Desktop. Existing graphical views remain unchanged.

## Changed files

- New `src/features/textual/grid.ts`, `view.tsx`, `textual.css` and focused grid tests.
- Impact register **S1**: `src/configuration.ts`, `src/reactive-editor/workspace-presentation.ts`, `src/application/workspace-session.ts`. Textual uses the existing presentation envelope; preferences use local storage. Disabled Canvas mutation gates remain enforced independently of Textual availability.
- Impact register **S2**: `src/application/workspace-presentation-view.tsx`, `src/demo/workspace-presentations.tsx`, `src/rendering/window-manager.tsx`. The graphical root stays mounted during Desktop/Textual switching; a neutral plane-suspension option hides/inerts graphical windows. The Textual shell uses its own scoped portal so existing stacking contexts cannot cover its controls.
- Extended presentation/session integration coverage; added `scripts/check-textual-shell-browser.mjs`, using an isolated in-memory Document and Chrome profile.

No changes to graphical Flint components or CSS, canonical editing/history, serialization, selection or IME code. No new shortcuts or background saves.

## Results

- Focused grid, presentation-state, Workspace-session and presentation-view coverage: **43 passed; one existing Canvas failure**. The unchanged production baseline reproduces the same assertion: a Close window control remains present in Canvas (`workspace-presentation-view.test.tsx:80`). The new retained-DOM test also passes after the portal adjustment. No assertions were weakened.
- Reactive TypeScript check passed.
- Trusted Chrome interaction: enter Textual, zoom, resize to 480×320, open the menu, return to Desktop and type into the retained editor — passed.
- At 1920×1080: **199×54 measured cells** at 100%; **181×49** at 110% font zoom. These are runtime font measurements, not hardcoded 10×20 cells.
- The editor DOM remained identical; its graphical font was restored. Shell switching/zoom produced **zero repository snapshots and no content revision changes**. [Browser evidence](TEXTUAL_INCREMENT_1_BROWSER.json).

## Outstanding / next

This increment is the shell foundation, not the complete Textual application. Flint hosting and dedicated menus are next; Scry/LER, Gloss, References and Cardex follow in increment 3. Existing switching guards still reject open dialogs/drafts and unsupported opaque application/media states; their ownership must be handled at the relevant integration boundary rather than bypassed. The existing Canvas test failure is recorded, not attributed to Textual.

Next action: **Increment 2 — dedicated Textual Flint view over existing services and retained document hosts**, following the [four-increment plan and Shared-Code Impact Register](TEXTUAL_IMPLEMENTATION_PLAN.md). No further broad audit or inventory regeneration is needed.
