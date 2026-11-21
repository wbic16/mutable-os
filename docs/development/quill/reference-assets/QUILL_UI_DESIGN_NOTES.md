# Quill — full application UI notes for Astra

## Status
JSX-style SolidJS **wireframe and functional pseudocode**, not a compile-ready replacement for Mutable's actual application. Use `QUILL_FULL_APPLICATION_WIREFRAME.tsx` as a design and wiring reference. The existing M0/M1 native document, selection, input, range, clipboard, and history services remain authoritative.

## Approved visual reference
`02_raven_editor.png` is the approved visual direction for **Midnight**. It shows one selected SVG composition, Text inspector active. It does not specify the inactive tabs. The wireframe now explicitly defines Text, Path, Layout, Effects, and Semantics inspector panels; Layers, Ornaments, Path Presets, Effect Presets, and Assets dock panels; the document navigator; and the contextual toolbar. It is an extension of the approved image, not a claim that every new panel was visually approved.

## Regions
1. Application titlebar: Quill identity, new/open/save, history, appearance, publication, return.
2. Document tabs: multiple ordinary Ink documents, dirty indicator.
3. Document navigator: page/Block tree; **mixed native Blocks**, not a Quill-only tree.
4. Vertical toolbox: Select, Text, Path, Shape, Frame, Ornament, Annotation, Edit Points, Transform, Arrange, Hand, Zoom; optional flyouts.
5. Main workspace: composition or page view; distinct from document artwork; zoom and view controls.
6. Contextual path strip: fast geometric presets and linked-path actions.
7. Right inspector: all five tabs mounted conceptually, one shown at a time, contents bound to selection.
8. Bottom dock: layers and reusable assets/presets, collapsible.
9. Status bar: active Ink, Block, flow, overflow, zoom, appearance.

## Inspector specification
- **Text:** native source, font/style, tracking, path assignment, baseline, offset, orientation, overflow.
- **Path:** primitive, anchors and Bézier handles, numeric geometry, freeform conversion, path family, linked flows.
- **Layout:** artboard, native page context, align/distribute, grid/guides, flow order, authored background.
- **Effects:** ordered stack, enable/reorder, parameter curves, size envelope, tracking, rotation, opacity, layout-affecting versus visual-only.
- **Semantics:** native Entity/Gloss/comment/format operations, canonical range and logical reading order.

## Interaction policy
- Selected object determines available controls. Tabs should not imply that a path is selected when only a native paragraph is selected.
- One native history transaction per completed geometry gesture; previews do not dirty Ink.
- Native text remains the sole authority; SVG glyph placement and caret geometry are derived.
- Application theme is distinct from canvas surround and from authored SVG background. Switching Midnight/Parchment/Follow Mutable never changes Ink.
- From Flint/native editor: Convert to Quill, Edit in Quill, Convert to Standoff Text. Quill's own app opens entire Ink documents.
- Rich text selection copy preserves native standoff; complete composition copy preserves geometry. They are distinct clipboard operations.
- Quill documents are ordinary Ink documents with arbitrary registered Blocks.
- No separate Quill history, format, text store, or annotation model.

## Suggested validation walkthrough
1. Launch Quill from Desktop; choose Midnight and Parchment; inspect every tab.
2. Open mixed Ink document; select ordinary paragraph, image, composition, page; verify selection-sensitive inspector.
3. Edit the Raven composition; change path amplitude, adjust centre-swell; see native reflow.
4. Open Layers and Assets; add a decorative vector and an authored background; verify document dirty only for authored changes.
5. Return to Flint; reopen same composition; confirm native text, annotations and geometry.

## Visual caveats
The JSX sample includes a deliberately simple SVG placeholder composition. The approved Raven PNG is the fidelity reference for styling and final composition, not the placeholder art. All iconography, fonts, images and ornaments need suitable provenance and permissive licensing before production bundling.
