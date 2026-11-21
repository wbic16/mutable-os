# Quill consolidated programme

Authorised 21 November 2026. M0 and M1 accepted. Internal checkpoints are testing boundaries, not approval gates. The existing default-on `quill` flag covers the programme. Native Ink, manual Save, native text/annotations/history and bounded typing remain authoritative.

| Checkpoint | Status |
|---|---|
| One: bidirectional conversion, rich clipboard, studio appearance | Passed: 47 automated tests, 50 Chromium checks, client/server type checks. |
| Two: geometry, typography, layers, multiple sources, range conversion, Raven composition | Implemented; 86 Quill tests, 51 Chrome checks and 10 Firefox checks pass. Editable Raven Ink and publication samples retained. |
| Three: export, performance, compatibility, browser/accessibility qualification | SVG/PNG, security, compatibility and matched performance checks implemented. Safari automation is blocked by browser settings; manual screen-reader/input qualification remains open. PDF evaluated and not exposed. |

The user corrected the asset delivery with direct `01_quill_identity.png` and `02_raven_editor.png` attachments. These two authoritative references are retained in `reference-assets/` with checksums; other images from the withdrawn ZIP were removed. The primary identity and Raven mockup have been inspected; the launcher uses an original SVG adaptation of the Q-and-feather direction.

Native unwrapping preserves declared source order and native identities in one history entry; rich clipboard uses Mutable fragments and definitions, retains destination geometry, and joins paragraph boundaries as LF inside one owned source. Studio preferences use application-local storage, separate from native documents and artwork. Midnight is the Quill default; Parchment and Follow Mutable are available. Ten path primitives, editable nodes/handles/freehand, ordered typography effects, managed artwork, original ornaments and independent native text sources are integrated into the studio.

The matched three-occurrence stress run improves median handler time from 76.85 ms to 33.35 ms and trusted first-frame time from 113.85 ms to 58.50 ms. Broad planning, full validation, snapshots, unrelated updates and Quill layout reads remain zero during typing. These headless measurements are comparative diagnostics, not a claim of universally low input latency. The broader regression run reports 379 passes and the independently established Flint close-cleanup failure.

See [the consolidated implementation report](PROGRAMME_IMPLEMENTATION_REPORT.md) for evidence, publication limits and remaining qualification. M1 evidence remains in `experiments/quill/m1-evidence/`; programme evidence is separate.

## UI convergence

The supplied SolidJS-style wireframe and design notes are retained alongside the image references. They are design guidance, not production code. The shell now supplies native document tabs, a mixed-Block navigator, twelve tools, five inspector tabs and a collapsible five-tab dock, plus contextual path actions and selection/overflow status. These reuse existing presentation and native services; no architectural conflict or restart was required. Native tabs remain inside the existing document host, some toolbox actions select contextual controls, and the numeric/path controls are simpler than the reference's illustrated graphical controls. Further visual refinement can remain incremental.
