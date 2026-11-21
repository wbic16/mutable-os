# Quill consolidated implementation and qualification

21 November 2026. M0/M1 foundations retained; continuous programme implemented behind the existing default-on `quill` flag. Core creative and publication workflows are working. Release qualification remains open for Safari, manual assistive-technology testing and the input capabilities explicitly delegated to native text.

## Working application

Quill uses ordinary Mutable Ink documents, native owned TextBlocks, selection, annotations, clipboard, history and manual Save. Text can be inserted, removed, replaced and annotated directly on the supported SVG surface. The ordinary editor is an explicit fallback for unsupported input, not a second text store. Geometry previews are local; completed gestures produce one native history entry. Application appearance, canvas surround and authored backgrounds are separate.

Implemented capabilities:

- Whole-Block conversion and inverse unwrapping, native source order/identities and undo restoration of geometry. Single-paragraph range extraction or independent annotated copy uses native split/clone/rebase operations.
- Rich native text clipboard, linked Entity/Gloss definitions, overlapping ranges, independent composition copying, destination geometry retention and managed asset admission before insertion.
- Ten primitives, editable Bézier nodes/handles, freeform conversion, freehand drawing, snapping, reversal, offsets, linked path families, wrapping, explicit breaks, alignment, justification, indentation and overflow diagnostics.
- Ordered, enabled typography effects: size envelopes, tracking and weight participate in fitting; rotation, baseline, opacity and colour can reuse fitted geometry. Each owned text source has its own typography and flow.
- Solid/gradient backgrounds, six original vector ornaments, managed raster/SVG imports and layer positioning, scale, rotation, colour, visibility, locking and order. Imported SVG is constrained and sanitised on both client and server; embedded artwork must match its managed SHA-256 identity.
- Standalone mixed-Block documents and contextual Flint return, source selection, new text/page/composition insertion, native file controls, Midnight/Parchment/Follow Mutable and an original gold Q-and-feather vector identity.
- Explicit SVG and PNG publication. Ink remains the editable semantic format. Export excludes editor guides and rejects unresolved or invalid artwork.

The [editable Raven document](../../../experiments/quill/programme-evidence/phase2/raven.ink) contains title, author and body TextBlocks, curved body paths, a font-size swell, native italic annotations, a gradient background and original ornaments. The [studio screenshot](../../../experiments/quill/programme-evidence/phase2/raven-studio.png), [SVG](../../../experiments/quill/programme-evidence/phase2/raven.svg) and [PNG](../../../experiments/quill/programme-evidence/phase2/raven.png) show the resulting composition. It can also be inserted with **Raven example** in Quill.

## Wireframe convergence

The corrected identity/Raven PNGs and later wireframe/design notes are retained in [reference-assets](reference-assets/README.md). The withdrawn ZIP is not the authority. No supplied pseudocode replaced the native application infrastructure.

| Intended region | Current integration and remaining difference |
|---|---|
| Titlebar and document tabs | Existing native new/open/save/history/return services, appearance and publication controls. Native tabs remain within their established host. |
| Document navigation | Mixed native Block/page tree, native documents and independent text sources; structure subscriptions do not observe typing or save status. |
| Twelve-tool toolbox | All tools lead to integrated editing modes, inspectors or dock controls. Some tools select a contextual panel rather than introducing another pointer mode. |
| Canvas and path strip | Shared source artboard, workspace zoom/pan, linked paths and native fallback. Native page infrastructure retained. |
| Text / Path / Layout / Effects / Semantics | Selection-bound native controls and ordered effects. Numeric and preset controls precede richer graphical envelope widgets. |
| Layers / Ornaments / Path Presets / Effect Presets / Assets | Collapsible dock with editable artwork, source selection, preset insertion and managed imports. |
| Status | Active Ink, selected source, path count, overflow, zoom and appearance. |

No significant architectural conflict was found. Typography and original ornaments follow the reference direction, but the composition is not a pixel reproduction of the Raven illustration. Further spacing, icon and graphical-control refinement can be incremental.

## Validation

| Check | Result and evidence |
|---|---|
| Quill units and mounted integration | **86 passed / 9 files**, including bounded unrelated-Block reads, preview/commit/undo, clipboard admission, graphemes, shared rendering, image identity and sanitisation. [Log](../../../experiments/quill/programme-evidence/quill-tests.txt) |
| Broader selected native regression suite | **379 passed; 1 inherited failure / 380 tests**. The Flint close test retains one transient projection at `flint-lifecycle.test.tsx:142`. [Current log](../../../experiments/quill/programme-evidence/regression-tests.txt); [independent M0 baseline](../../../experiments/quill/m0-evidence/baseline-flint-close.txt). This run preceded the final additional SVG identity test. |
| Managed asset server | **15 passed**, including unsafe SVG rejection, leases, feature gating and content-addressed retrieval. [Log](../../../experiments/quill/programme-evidence/managed-assets-tests.txt) |
| Chrome application | **51 passed**, no runtime errors; direct editing, transformed selection, native semantics/history, studio controls, freehand gesture/undo, actual zoom and SVG/PNG. [Results](../../../experiments/quill/programme-evidence/phase2/browser-results.json) |
| Firefox application | **10 passed**, no runtime errors; trusted ASCII typing/clicks, grapheme deletion, undo, explicit IME rejection, numeric geometry and Raven export. Unicode insertion in this runner is synthetic non-IME input and does not qualify Firefox IME. [Results](../../../experiments/quill/programme-evidence/firefox/results.json) |
| Type checking | Client and server project checks pass. [Log](../../../experiments/quill/programme-evidence/typecheck.txt) |
| Production build | Client Vite build and server/asset-worker builds pass. Client required a 4 GB Node heap; existing large-chunk warnings remain. Build preceded final cache/asset refinements, which have current type/unit/browser checks. [Client](../../../experiments/quill/programme-evidence/client-build.txt), [server](../../../experiments/quill/programme-evidence/server-build.txt) |
| Safari | WebDriver session refused because **Allow remote automation** is disabled. Global settings were not changed. [Exact result](../../../experiments/quill/programme-evidence/safari.txt) |

During validation, the client build removed generated server workers from `dist`; rebuilding those workers restored all Vault tests. This was a build-order issue, not a remaining Vault test failure.

## Measured performance

The real Flint typing harness drove 20 balanced trusted insert/backspace samples per regime. The M1 workload was matched: **5,184 characters, 40 paths, 90 annotations, three mounted occurrences, three other compositions, 200 unrelated paragraphs and 1,200 decorative paths**. Eight benchmark checks pass. [Current summary](../../../experiments/quill/programme-evidence/performance-summary.json), [raw results](../../../experiments/quill/programme-evidence/performance/browser-results.json), [M1 baseline](../../../experiments/quill/m1-evidence/performance-summary.json).

| Matched stress regime | Median handler | P95 handler | Median trusted first frame | P95 first frame |
|---|---:|---:|---:|---:|
| M1 Quill | 76.85 ms | 78.70 ms | 113.85 ms | 116.20 ms |
| Current Quill | **33.35 ms** | **38.00 ms** | **58.50 ms** | **90.30 ms** |
| Current native control | 93.95 ms | 128.30 ms | 167.85 ms | 190.00 ms |

Profiling identified SVG per-glyph DOM maintenance as a substantial cost. Equal-style ASCII runs now use positioned SVG coordinate lists, while complex graphemes retain separate spans. Unchanged lines retain DOM. Ref-counted source shaping and logical fitted layouts are shared by identical occurrences; typography/font/geometry changes invalidate their keys. Visual-only effects reuse fitting. Caret-only rendering makes no glyph writes.

The current Quill stress run records **zero** paragraph text walks, full validation, broad planning, repository snapshots, projection rebuilds, unrelated geometry/mutations, worker/network requests and DOM element/range layout reads during typing. Each committed edit remains a native compact transaction. Mounted regressions also compare zero versus 500 unrelated Blocks and exercise undo/redo.

The improvement is substantial, but 33 ms handler / 59 ms first-frame medians in this large workload still leave work to reach consistently low latency. These are headless comparative diagnostics, not guaranteed user-visible frame timings. Source shaping and changed-line work still depend on the affected source; the implementation does not claim constant-time typing.

## Limits and remaining qualification

- **Safari and accessibility:** Safari editing/export needs a runnable browser session. Keyboard/numeric geometry alternatives and logical text are present; manual VoiceOver/screen-reader, focus/navigation and reduced-motion qualification is not complete.
- **Unicode:** grapheme/scalar mapping covers admitted Latin, Greek, Cyrillic, CJK, combining marks and emoji. Bidi, unqualified complex scripts, full IME and cross-grapheme ligatures/kerning remain explicit native-fallback capabilities. The application preserves canonical content rather than silently accepting unsupported SVG input.
- **Range conversion:** currently a range within one ordinary paragraph. Cross-paragraph and unsupported attached structures are rejected explicitly. Deliberate transclusion is not introduced.
- **Fonts and publication:** installed/system fonts only; SVG preserves positioned text but does not embed font binaries. Another machine can substitute fonts. PNG captures local rendering. PDF was evaluated and is not exposed pending font permissions and fidelity qualification. Native semantics remain in Ink.
- **Security/resource limits:** imported SVG intentionally excludes scripts, events, external references, filters, animation and unsupported elements. Documents retain versioned schema validation and feature-disabled native fallback. PNG export is capped at 16 megapixels.
- **Inherited lifecycle:** Flint's independently reproduced close-cleanup failure remains separately tracked; it was not hidden or weakened.

No new application dependency or lockfile change was required. Original vectors/ornaments and reused parser licences, retained notices, font scope and the focused shaping/PDF decisions are recorded in [dependencies and licences](PROGRAMME_DEPENDENCIES_AND_LICENCES.md).
