# Textual — supplementary asset review

**4 November 2026 · investigation only**

Reviewed every entry in `Textual_Astra_Brief.zip`: README, feature brief, two CSS files, layout TypeScript, wireframes and all three reference images. The feature brief is **byte-for-byte identical** to the previously supplied brief. The [README](reference-package/README.md) explicitly identifies the CSS/TypeScript as templates and the images as visual references, not layout specifications. This package supplies the previously missing references; it does not authorise implementation.

The original files are retained unchanged in [reference-package](reference-package/README.md), with [archive/file hashes](TEXTUAL_REFERENCE_MANIFEST.json). No template was installed in the application. This review updates the [main investigation](TEXTUAL_WORKSPACE_INVESTIGATION.md) and [parity matrix](TEXTUAL_FEATURE_PARITY.md).

## Visual direction now established

| Asset | Finding | Effect on the plan |
|---|---|---|
| [Palette CSS](reference-package/textual-palette.css) | Semantic Borland palette: deep blue background, brighter blue panels, grey menu surfaces, white body text, yellow headings/focus, cyan selections, black shadows. A muted Paper alternative is also supplied. | Use these semantic token names and colours as the reference baseline; Borland is the proposed initial preset. Palette selection stays a presentation preference. Do not substitute Phosphor's CRT aesthetic. |
| [Grid CSS](reference-package/textual-grid.css) | Integer cell rectangle inputs converted at a CSS boundary; disabled ligatures; separate half-size margin line boxes; native image/video containment; one-cell shadows. | Reuse the design pattern after qualification. Actual font advances/line boxes, origin, theme scoping and child control geometry still require implementation. |
| [Pure layout examples](reference-package/layouts/textual-layouts.ts) | Menu and tabs each consume one row; status consumes the final row. Left margin appears at 110 columns; right References at 155; Scry is capped at 80×27 cells. | Replace the report's earlier speculative wide-layout thresholds with these candidate values. Add minimum-content sizing and explicit subview fallbacks before accepting them. |
| [Wireframes](reference-package/layouts/WIREFRAMES.md) | Document-first Flint, left marginalia, right Gloss/References, Scry overlay, full-screen Cardex with previous-app return. Narrow grids use full-screen subviews and Back. | Confirms deterministic splits and retained source context. A hidden split means a different access presentation, never the loss of Gloss/References. |
| [Textual concept](reference-package/reference/Textual_Flint_Scry_Concept.png) | Grey hierarchical menu, visible selected Document, left margin, dominant document, right Local References, Scry results/preview, native illustrated image and adjacent caption. | Use as visual intent. Preserve selection distinction and labels/icons as well as colour. Do not infer measured cell counts, font metrics, exact half-size text, new commands or bindings from raster artwork. |
| [Existing Gloss screenshot](reference-package/reference/Flint_Gloss_Existing.png) | Dirty Document markers; Gloss/Initialis/formatting controls; source underlines; margin cards with Passage/More; References/Graph/Argument tabs; search/type filter/counts; Navigate/Edit/Delete; incoming/outgoing and Add Relationship. | Explicit parity checklist for menus and subviews. The concept's simpler References panel omits some of these controls visually; all remain required. |
| [Existing Graph screenshot](reference-package/reference/Flint_Gloss_Graph_Existing.png) | Large graph split with scope, direction, relationship filter, node limit, Include unanchored, Actual size (scroll), counts/status and graph navigation. | Graph cannot be constrained to the narrow References-list width. Supply a deterministic wider graph split or full-screen subview; keep every control and native graph behavior. |

## Template qualification findings

**Geometry.** `measureGrid()` divides by supplied `cw/ch`; despite its name it does not measure fonts. CSS defaults to a 10×20px cell, a 15px main font and 7.5px marginal font. Those dimensions are examples, not validated pitches. The stack `ui-monospace, 'Cascadia Mono', Consolas, monospace` supplies no bundled font and can resolve differently by platform. The earlier Menlo/Monaco/Courier probe does not qualify this stack or the example sizes.

`.cell-rect` has integer-coordinate inputs but no origin term or runtime integer validation. `.tui-margin` defines half-width/half-height variables and half-size typography; it does **not** wire a separate rectangle mapper to those variables. Implement an explicit subgrid transform whose origin lies on the main grid, and validate its text metrics. Avoid accumulating rounded widths. `subgrid()` merely halves two supplied numbers; it provides no measurement, origin or alignment validation.

The 1px borders and 2px focus strokes can be rendering details at shared grid boundaries; they must not introduce inconsistent inner text origins. Broad `overflow:hidden` rules need scrollable content regions so menus, controls, focus and media are not clipped. Image/video `contain` styles cover only direct image/video children; they do not qualify Mermaid, SVG, iframe/PDF, captions or interactive players. A one-cell CSS shadow has the intended offset but may be clipped by ancestor overflow; preserve room for it and verify hit testing.

**Small grids.** A bounded evaluation of the supplied functions found negative Scry dimensions at 10×3 and 3×5 cells; at 80×1, tabs/editor are outside the grid. Zero cell width yields infinite columns. These are missing production guards in an illustrative template, not bugs introduced into Mutable. Validate finite positive metrics, clamp all sizes and provide tiny-grid navigation. For fewer than 110/155 columns the template returns no margin/References rectangle; the caller must provide the wireframe's full-screen alternatives. The always-present tab row also needs the brief's optional compact/hidden-row policy, keeping Document switching accessible.

**Width and reflow.** At the References threshold, a 154-column grid with margin enabled allocates 134 columns to the editor; at 155 it allocates 100 after opening the References split. This sizeable wrap change calls for logical scroll anchoring and controlled invalidation. At very wide viewports, avoid forcing readers to scan 316-column lines: a cell-count reading-width preference can leave spare background within the document pane without changing authored text or page metadata. It must remain optional for deliberately wide tables/media.

**Palette.** Numerical sRGB contrast ratios were computed from the supplied tokens; this is not a browser accessibility certification. Body text on panel surface is about 12.3:1 in both presets. Paper accent on surface is 3.847:1, muted text 4.655:1 and disabled text 2.907:1. Avoid using the Paper accent as the sole small-text/focus indicator without review; disabled state still needs readable context and accessible explanations. Half-size text requires optical review even when colour contrast is high. Forced-colour and focus-state tests remain necessary.

## Bounded layout evidence

Evaluated the original pure TypeScript functions in isolation after transpilation, without editing them or mounting application UI. Twelve representative grid sizes covered the three target resolutions, both split boundaries, conventional narrow layouts and tiny edge cases. All three display examples below use the **illustrative**, unqualified 10×20px pitch:

| Viewport | Grid | Left margin | Editor | References | Scry `(col,row,width,height)` |
|---|---|---:|---:|---:|---|
| 1920×1080 | 192×54 | 24 | 124 | 44 | `(56,8,80,27)` |
| 2560×1440 | 256×72 | 24 | 188 | 44 | `(88,11,80,27)` |
| 3840×2160 | 384×108 | 24 | 316 | 44 | `(152,17,80,27)` |

The rectangles fit those grids. This does **not** establish native text fit, browser-painted alignment, real font zoom, popup usability or editing performance. [Raw evaluation and palette evidence](TEXTUAL_ASSET_REVIEW_EVIDENCE.json) records the inputs, outputs, source hash and failure cases. No full application regression suite was needed for this documentation review.

## Concept differences that must not become accidental requirements

- The concept advertises F1–F10 and Ctrl+E/K/R/I, plus extra Gloss-management chords. They are illustrative labels, not approved bindings. In particular, Initialis currently uses Ctrl+; then I; LER already has scoped Cmd/Ctrl+. The existing binding inventory remains authoritative. Resolve browser/OS conflicts before assigning anything new.
- `Enter Open` in the Scry sketch cannot replace LER's linking semantics. Labels must reflect the current target/action: linking an Entity occurrence differs from opening a Document or inspecting a result.
- A Claim result in the concept does not demonstrate implemented global Claim completion. A proposed mixed Entity/Document/Mention view must expose actual existing providers and their semantics; additional providers remain explicit scope.
- The extra Graph top-level menu and top identity strip are presentation suggestions. The brief's menu taxonomy can expose Graph under View and preserve a document-first layout without spending an unbudgeted extra row. Do not derive function-key assignments from the bottom status strip.
- The concept shows the menu and Scry together. Define focus ownership/stacking, Escape behavior and source-selection preservation for this combination; the image alone does not specify whether Scry remains interactive beneath a menu.
- The existing Graph screenshot uses proportional text inside the native diagram. The approved native-island exception allows its inner renderer to remain native; Mutable-owned graph controls/captions remain monospaced and grid aligned. This is already specified, not a new approval requirement.

## Effect on the recommendation

The architecture recommendation is unchanged: measured DOM/CSS chrome around retained application/editor DOM, plus native rich-content islands. The reference pack now supplies a concrete palette and split baseline, a useful visual parity checklist and small pure layout functions to adapt. It does not resolve Unicode advance, authored-style mapping, actual half-size legibility or retained-host lifecycle questions.

The missing-assets issue is closed. No additional clarification is required to incorporate these references into the investigation. Implementation remains subject to the feature brief's review gate.
