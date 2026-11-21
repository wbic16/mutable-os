# Quill M1 implementation report

Date: 21 November 2026. Scope: the user's M1 authorisation, following accepted M0. M2–M5 were not started.

**Recommendation: accept M1's restricted Latin implementation and proceed to M2 after review.** Direct SVG input, geometry manipulation, native annotations and the native Document round-trip are implemented and qualified. This is completion of the bounded M1 experience, not full Unicode typography or production release qualification.

**Known performance limitation:** the large, three-occurrence stress case still takes tens of milliseconds in the input handler and more than a frame to present. It is comparable to the measured native Flint workload, and all unrelated-work counters remain zero. This is an open performance limitation of the delivered M1 experience, not a claim that M2 shaping will fix it. Keep it tracked before releasing large compositions. Measurements and their limits are below.

## Checkpoint 1 — direct SVG input

The registered native TextBlock renderer selects the SVG surface inside an admitted, single-source Quill composition. This works in Quill, Flint and the generic native Document editor; conversion preserves the original source/placement identity. The ordinary editor is no longer displayed underneath the artwork. **Native text** is an explicit, reversible presentation switch for unsupported text or existing editor capabilities; **Return to SVG** returns to the same canonical source without a Document edit or Save.

Supported direct input is printable ASCII Latin plus explicit line breaks. Clicking curved text maps to canonical boundaries; pointer dragging and Shift-arrow selection use the existing SelectionService. Arrow/Home/End navigation, basic word navigation, replacement, Backspace/Delete, plain-text clipboard, native Undo/Redo and line-break insertion operate on the visible composition. The unobtrusive contenteditable sink is empty: it receives browser events but is neither a text store nor the visible editor.

The existing input gateway permits an optional mounted text presentation to consume input before ordinary DOM editing and cross-Block selection handlers. This ordering prevents native Select All from escaping an unsupported SVG source; a mounted regression exercises Select All, Delete and typing against preserved Unicode content. Quill commits through native `replaceInlineRange`, native selection mapping and native history. It prevents paragraph splitting/joining from accidentally escaping the owned composition source. Command-S/Control-S still reaches the existing Document save route.

The shaping boundary carries canonical and UTF-16 spans, direction and explicit caret stops. M1's positioned draw items represent its restricted Latin clusters; they are not a universal glyph-to-Cell assertion. Complex shaping, bidi visual order and complete affinity handling require the M2 adapter. Unsupported Unicode, inline objects and IME input do not alter or flatten canonical content; a diagnostic offers native text editing. Unsupported-source selection/clipboard paths are also guarded in canonical coordinates.

Evidence: [checkpoint 1 unit/mounted tests](../../../experiments/quill/m1-evidence/checkpoint1-tests.txt), [13 checkpoint 1 browser checks](../../../experiments/quill/m1-evidence/checkpoint1-browser.json), and the final regression/browser runs. Trusted browser input covers curved caret placement, insertion, deletion, selection replacement and keyboard Undo/Redo.

## Checkpoint 2 — geometry and reflow

The canvas has Text/Paths tools, selected-path handles and a contextual inspector. It supports straight lines and sine waves; X/Y position, horizontal length, amplitude, frequency (cycles), phase (radians) and generated-path spacing are native geometry values. **Three linked waves** creates a useful starting sequence; **Add linked path** extends it. Existing version-1 data remains valid; optional `phase` and `pathSpacing` fields extend the geometry contract. Older strict readers can retain children rather than activate unfamiliar geometry.

Position, length and amplitude handles preview locally, coalesced into an animation frame. Numeric input also previews locally. Pointer release or numeric change commits one native undoable command. Escape, Cancel preview, pointer cancellation and disposal discard the draft. A canonical geometry change in another occurrence invalidates a pending gesture rather than being overwritten. No preview writes text, creates history, saves a file or scans a Document.

The fitter allocates canonical text across linked paths using measured advances and sampled arc length. It respects spaces and explicit newlines, splits overlong words only at supported cluster boundaries, and retains final-path overflow with a visible count. Layout never inserts/deletes canonical line breaks. Users can add paths to expose overflow; an overflow caret is explicitly identified. Editing an earlier path redistributes downstream words; unchanged fragments are retained and fitting stops once downstream boundaries converge. A regression test covers the subtle case where shortening a word lets it fit on the preceding line.

Evidence: [checkpoint 2 tests](../../../experiments/quill/m1-evidence/checkpoint2-tests.txt), [21 checkpoint 2 browser checks](../../../experiments/quill/m1-evidence/checkpoint2-browser.json), and final checks for Escape cancellation, scaling, scrolling and font invalidation. Trusted dragging proves no canonical edit during preview and exactly one commit on release, with native Undo/Redo.

## Checkpoint 3 — native semantics, round-trip and bounded work

Italic formatting affects measurement and SVG text. Entity references and Glosses use existing native properties/definitions and annotation operations. The toolbar delegates Entity to the existing search UI, Gloss to the existing Gloss controller, and Annotations to the native annotation panel. Overlapping ranges remain separate native annotations. Pointer selections and popup locations use canonical ranges and the same cached path geometry.

Temporary selection, Gloss previews and other transient ranges use `editor.temporaryRanges`/`editor.decorations` and the established `createRangeRendering`/`RangeEffectLayer`. The shared SVG renderers accept local affine fragments and combine curved regions into a single path per binding. There is no parallel highlight model or viewport-fixed highlight layer. Native horizontal range-rendering tests remain unchanged and pass. MeasurementService can obtain range/caret rectangles from an alternate native presentation, so Gloss popups reuse the same geometry. Scroll/scale conversion reads the SVG transform at the interaction boundary, not every glyph during typing.

A concrete native integration defect surfaced during browser qualification: the Gloss admission proof checked legacy Cell-array length, which is zero for compact text. It now uses the existing `contentLength` abstraction. Both legacy and compact SVG Gloss creation are tested, together with the existing Gloss suite. No unrelated window lifecycle changes were made.

The browser proves Flint → invoke → confirm → edit curved text → manipulate geometry → apply italic/Gloss and preserve entity ranges → return in place → reopen → continue editing → Undo/Redo. Mounted tests repeat invocation/edit/return from the generic native Document editor and preserve Textual handoff. The persistence test uses mounted SVG input against a real temporary native store: edits stay dirty and leave disk bytes unchanged until explicit Save; reopening in a fresh repository and rendering the SVG preserves text, three linked paths, geometry and annotations. It saves the same `.ink` filename with no Markdown sidecar. The isolated browser fixture deliberately disables file persistence; it does not write user Documents.

## Architecture and cache boundaries

| Responsibility | Implementation |
|---|---|
| Text measurement/shaping boundary | [measurement.ts](../../../src/features/quill/measurement.ts): explicit cluster spans, supported-input guard, font/style advance cache and font generation invalidation. |
| Geometry and arc length | [geometry.ts](../../../src/features/quill/geometry.ts): bounded sampled line/sine paths in local SVG coordinates, cached independently of text, scrolling and mounted occurrences. |
| Linked-path allocation and mapping | [layout.ts](../../../src/features/quill/layout.ts): word/newline fitting, overflow, convergence, canonical caret/hit mapping and retained range geometry. |
| Native input adapter | [input.ts](../../../src/features/quill/input.ts): native SelectionService and text operations; no private canonical selection or history. |
| Geometry gestures | [geometry-session.ts](../../../src/features/quill/geometry-session.ts): local drafts, stale checks, cancellation and a single native commit. |
| SVG presentation | [svg-glyphs.ts](../../../src/features/quill/svg-glyphs.ts): retained glyph nodes without a Solid owner per glyph, fragment-relative mapping, only changed line writes batched off-tree. The input/selection/viewport/annotation layer stay mounted. |
| Interaction UI | [surface.tsx](../../../src/features/quill/surface.tsx): native mount, tools/inspector, range-rendering adapter, font invalidation and occurrence cleanup. |

Canonical compact spans are read directly for the affected source. A source-local change subscription avoids recomputing text from every projected Cell and avoids duplicate canonical/projection update passes. Font style runs use a sweep instead of testing every annotation against every character. Shaping still walks the affected source; M1 does not claim edit-sized shaping for arbitrarily long paragraphs. Layout/path caches and downstream convergence avoid repeated fitting/geometry work. Range geometry caches preserve unchanged fragments. Caret-only movement does not write glyph DOM.

There are no asynchronous shaping results that can race newer text. The only queued geometry preview has cancellation/disposal guards; commits check the original geometry. Native text revisions validate temporary ranges. Fonts invalidate measurements; viewport resize/zoom/scroll preserve local geometry and use the current SVG coordinate transform for hit testing/popups. Removed occurrences release their input mounts, listeners, range collections and caches.

## Performance evidence

The runner reuses [the real Flint typing probes](../../../experiments/initialis-adapter/browser.js), with optional input-element and event-target adapters for the SVG sink; the default native benchmark is unchanged. This runner observes key events at Window capture, before the native presentation guard, for both native and SVG regimes. It asserts that all 20 insert/delete timing samples were recorded. Each regime includes 20 handler-driven events and 20 trusted CDP key events. The short before/after cases illustrate the workflow and are not identical typography/workload. The stress comparison switches the **same canonical text, annotations and three mounted source occurrences** between native Flint and SVG.

The stress fixture has **5,184 characters, 40 linked paths, 90 mixed/overlapping annotations, three other composition Blocks, 200 unrelated paragraphs and 1,200 decorative SVG paths**. It includes three mounted occurrences of the edited source. Decorative paths are restored when switching presentation for the comparison.

| Regime | Handler median ms | Handler P95 ms | Trusted first-frame median ms | Trusted first-frame P95 ms |
|---|---:|---:|---:|---:|
| Native Flint, short paragraph | 1.7 | 5.3 | 15.25 | 17 |
| SVG, short paragraph / two occurrences | 2.9 | 3.2 | 18.8 | 20 |
| Native Flint, stress source / three occurrences | 92.8 | 98.8 | 160.8 | 173.4 |
| SVG, stress source / three occurrences | 76.85 | 78.7 | 113.85 | 116.2 |

All four trusted regimes report **zero snapshots, broad planning, full validation, persistence/network requests, projection rebuilds, unrelated DOM mutations and unrelated geometry reads**. SVG typing uses zero native element/range rectangle reads. The mounted regression test independently instruments 0 and 500 unrelated Blocks: no unrelated payload reads or snapshots, and only the four inserted legacy Cells plus their source are changed per edit/undo/redo. Compact model tests retain the one-record bound.

These are short headless Chromium diagnostics, not a cross-browser or user-visible latency guarantee. The large SVG case remains over a frame; keep the latency issue open for large-composition release qualification. No general speedup claim is made. [Raw browser results](../../../experiments/quill/m1-evidence/browser-results.json), [performance summary](../../../experiments/quill/m1-evidence/performance-summary.json) and a [profiling trace from optimisation](../../../experiments/quill/m1-evidence/stress-profile.json) are supplied. The profiling trace is historical and is not the timing source for the final table.

## Validation and reproduction

Run from the repository root:

```sh
npm run typecheck
npx vitest run --maxWorkers=2 --minWorkers=1 src/features/quill src/application/quill.test.tsx src/application/flint-lifecycle.test.tsx src/application/flint-vault.test.tsx src/application/document-host-presentations.test.tsx src/application/desktop-applications.test.tsx src/interchange/clipboard.test.ts src/persistence/managed-desktop.test.ts src/qualification/quill src/rendering/range-rendering.test.tsx src/rendering/decorations.test.ts src/features/gloss/gloss.test.tsx src/input
node experiments/quill/run-m1.mjs
```

The browser runner uses an isolated Vite server and disposable Chrome profile. `CHROME_BIN` and `QUILL_OUTPUT` can override the browser/output location; `QUILL_PROFILE=1` additionally captures a CPU profile (do not compare profiled timings to the ordinary table). The checkpoint-specific runners remain available for narrower reproduction.

Final outcomes are recorded in the [validation index](../../../experiments/quill/m1-evidence/validation.json), [regression log](../../../experiments/quill/m1-evidence/regression-tests.txt), and [client/server type check](../../../experiments/quill/m1-evidence/typecheck.txt). The browser has **45 passing checks and no runtime errors**. All **42 Quill feature/application tests pass**. The broader run has **252 passing tests and one inherited failure (253 total, 21 files)**. Client and server type checks pass. The regression command exits 1 because of the inherited failure described below; it is not represented as an all-green suite.

The inherited failure remains `flint-lifecycle.test.tsx:142`: closing a Flint window leaves one transient projection where the test expects zero. M0 independently reproduced it with all tracked files at HEAD `7cabf8444f73cafd62a27cc062aba062460437f5` ([baseline evidence](../../../experiments/quill/m0-evidence/baseline-flint-close.txt)). M1 does not weaken that test or rewrite the unrelated close lifecycle.

## Screenshots

- [Direct curved editing](../../../experiments/quill/m1-evidence/direct-editing.png).
- [Selected path and geometry handles](../../../experiments/quill/m1-evidence/path-handles.png).
- [Three linked paths and reflow](../../../experiments/quill/m1-evidence/linked-reflow.png).
- [Native overlapping annotations](../../../experiments/quill/m1-evidence/native-annotations.png).
- [Large composition stress fixture](../../../experiments/quill/m1-evidence/stress-layout.png).

## Remaining issues and deliberately deferred work

**Delivered-M1 limitations:** heavy multi-occurrence input latency remains as quantified above; long source shaping still performs a source-length walk. The fixed-size system-font Latin presenter supports bold/italic and native semantic markers, not every existing visual text effect. Overflow remains canonical and explicitly reported but is not all visible until paths are added. A source with unsupported Unicode/inline objects uses the diagnostic/native-text route. The inherited Flint close-cleanup failure remains open separately.

**Deferred by the authorisation:** complex shaping, complete bidi/caret affinity, IME qualification, full keyboard/accessibility and cross-browser qualification; partial-range extraction; independently editable multiple-source SVG UI; advanced Bézier/transformation tools, ornament/background authoring and publication exporters. The multi-source schema is retained; compositions with multiple sources use native child editors in this increment. None of these features was silently approximated or represented as completed.

**Dependencies/licences:** [separate report](M1_DEPENDENCIES_AND_LICENCES.md). No third-party code or runtime dependency was adopted, and no fonts/assets were bundled. The earlier missing concept images remain unavailable; no pixel-fidelity claim is made.
