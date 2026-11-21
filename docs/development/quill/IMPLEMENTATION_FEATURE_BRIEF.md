# Quill implementation — revised milestones

Status: architecture accepted by the user on 21 November 2026. **M0 is accepted; M1 is authorised for implementation. M2–M5 require subsequent review.** This replaces the original proposed ordering; the qualification remains a historical evidence record.

Quill authors ordinary Mutable Ink Documents, including arbitrary supported native Blocks. Compositions own canonical native TextBlocks, native annotations and linked definitions. There is no separate file format, text store, history, or persistence route. The `quill` feature flag defaults on. Disabled readers retain the container and its children. Save stays manual and uses the opened filename; Return never saves.

Estimates assume one experienced engineer plus design review. They are planning ranges, not delivery commitments: roughly **14–25 engineer-weeks** overall, excluding separately commissioned artwork, legal review and broader publication fidelity.

## M0 — native foundation and real application (1–2 weeks; accepted)

Establish the versioned `mutable/svg-text-composition-block` contract, owned native sources and local source roles. Preserve whole-Block identity during confirmed conversion, using one native undoable structural operation. Opening and cancelling must not change the source Document. Reject stale, shared, ambiguous or partial-range conversion requests rather than silently expanding a selection.

Minimally generalise the existing document application adapter: distinct Flint/Quill launch commands, managed windows, application presentations, native Document tabs, existing-file opening, ordinary Document creation, mixed-Block rendering, Save and cheap dirty state. Add a shared contextual command from Flint and the generic native editor, explicit conversion confirmation and return to the originating occurrence. Restore focus/selection/scroll when still resolvable; report unavailable origins. Preserve Acetate placeholder identifiers and saved windows; add Quill separately rather than silently aliasing or rewriting persisted state.

Use native child rendering as an explicitly labelled M0 foundation. Do not port the experimental fitter or implement curved typing, path handles or ornamental chrome yet. Document the multi-source extension: independently identified local source roles, native remapped reference carriers, separate flow/path associations and later per-source transforms/order, without concatenating text.

Qualify standard clipboard admission for the new schema and owned references through the existing materializer. Independent copying is the default. Future schema versions and invalid/unresolved carriers must remain inert and retained, not activated by registration alone.

Exit: automated schema, ownership, stale/partial/shared rejection, identity, conversion undo/redo, linked definitions, real clipboard, native persistence, disabled fallback and simultaneous application registration tests. Mounted tests prove opening/return does not dirty the source, conversion does, manual Save uses the native coordinator, and local edits avoid unrelated payloads/snapshots/planning. Existing Flint tests pass. Deliver a foundation report and reproducible evidence. M0 does not claim the first major product acceptance test has passed.

## M1 — first direct editing and basic geometry (3–5 weeks; authorised)

Use the production composition contract and application. Place a caret on straight/curved SVG text; insert/delete Latin text, move/select, and reflow through linked paths. Route edits, undo/redo and annotation changes through native commands. Use existing decoration/measurement invalidation services; keep native text authoritative. The native editor beneath the qualification prototype is scaffolding and must not remain the finished workflow.

Deliver line and sine paths, amplitude/frequency/spacing controls and visible draggable geometry handles. Preview gestures locally; commit one native undoable edit. Evaluate selected Pixerate algorithms only after exact import/dependency/asset/notice clearance. Original simple geometry is acceptable where reuse adds no value. No whole third-party editor.

The layout boundary must already accommodate canonical code-point/object ↔ UTF-16 ↔ grapheme ↔ shaped-cluster maps, affinity and bidi. Initial Latin support is explicitly restricted; unsupported cases remain intact with diagnostics. Cache glyph/path geometry, invalidate affected text and downstream fragments until convergence, separate visual-only changes from fitting, and cancel stale work.

Exit — first major product acceptance: open Ink in Flint → invoke Quill for a paragraph → confirm → edit words directly on the curve → manipulate handles → observe reflow → preserve/apply native annotations → return in place → reopen and continue → undo/redo → Save/close/reopen without loss. Trusted browser input and real Flint before/after benchmarks, including long text, multiple compositions, mixed formatting/annotations and synthetic background/decorative layers, must accompany output correctness. No claims of full Unicode/accessibility qualification yet.

## M2 — complete input/shaping and range interoperability (3–5 weeks; depends on M1)

Qualify combining characters, ligatures, emoji, complex scripts, bidi/caret affinity, IME commit/cancel, clipboard text operations, accessibility, keyboard navigation, and Chrome/Firefox/Safari. Select a shaper only with measured adapter performance and complete permissive code/font/data notices. No React/Svelte/Vue runtime dependency.

Implement partial-range conversion with native splits/extraction, overlapping standoff/Gloss boundaries, selection affinity and atomic undo/redo. Distinguish convert (restructure), compose from selection (independent copy, original retained), and later explicit reference/transclusion. Opening must still be mutation-free for the source Document.

Exit: script/font corpus and trusted cross-browser editing pass; partial selections preserve semantics under copy, split, undo and Save. Real clipboard admission retains active editable compositions across Documents. Native text remains the sole authority. Accessibility is verified, not inferred from a hidden text input.

## M3 — full-document studio and multiple sources (2–4 weeks; depends on M2)

Extend the already operational native Document host with page/artboard navigation and composition targeting. Reuse existing pages and Block structure, preserving ordinary paragraphs, media, unknown Blocks and multiple compositions.

Expose multiple owned sources with independent flows, formatting, annotations, geometry, transforms and positioning/order: title, author, body and marginalia remain separate TextBlocks. Define deliberate reference semantics using existing native provenance, with deletion/missing-source behavior and independent-copy defaults.

Exit: author mixed multipage works in Quill, reopen in Flint, edit independent sources, copy/paste/save/restore without flattening or identity confusion. Test large mixed Documents and unrelated open Documents with bounded-work counters.

## M4 — advanced tools and original assets (3–5 weeks; depends on M3)

Add Bézier nodes/handles, advanced shape families, ornaments, backgrounds/images, layers/lock/hide/reorder, transformations, alignment and accessible numeric alternatives. Provide a spacious toolbox, contextual inspector and collapsible library/dock. Separate layout-affecting effects from visual-only effects.

Retain the approved workshop/Raven design direction. The seven PNG references listed in the supplied asset sheet were unavailable during qualification; obtain them before claiming pixel-level fidelity. Use original interface vectors and appropriately licensed fonts/ornaments with provenance. Do not embed concept-image controls.

Exit: expressive multi-source Raven-style composition uses editable native text and geometry, keyboard-accessible gestures, bounded invalidation, native undo and documented assets. No unsupported licence closure is presumed.

## M5 — publication and release qualification (2–4 weeks; depends on M4)

Add separate SVG/PNG exports; decide PDF scope from exporter/font-rights evidence. Qualify allowlisted SVG/resource imports, unsafe URLs, resource budgets and identity rewriting. Test schema migrations, disabled/future-version fallback, shared occurrences, font loading, wrapping, zoom/transforms and cleanup.

Exit: all original hard scenarios have reproducible evidence, cross-browser/accessibility and realistic performance gates pass, and every adopted dependency/font/asset has retained permissive notices. Native Ink remains canonical; publication exports never replace native clipboard or Save.

## Scope and next review

M0 is accepted. The subsequent M1 authorisation requires three tested checkpoints: direct SVG input; basic geometry and linked-path reflow; then native semantics, round-trip and performance. Full multi-source editing, partial extraction, complex shaping, advanced geometry, ornaments and publication remain outside the authorised pass. Stop for an actual document-model conflict; routine implementation choices within the accepted architecture do not require another broad investigation.
