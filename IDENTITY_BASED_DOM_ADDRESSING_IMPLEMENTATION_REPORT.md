# Identity-based DOM character addressing in Flint

## Executive summary

In the production Flint bundle, a mounted paragraph of 25,000 characters with 20 annotations went from **112.6 to 2.7 ms median input-handler time**. Both configurations used resident Cell boundaries. A warm sustained insertion dropped from **24,900 numerical DOM mutations to zero**, preserved every surviving span, and produced one new character descriptor. The next-frame callback improved from **214.0 to 106.4 ms**. Chrome's remaining layout and paint cost is substantial.

The same headed development comparison, repeated in independent sessions with reverse trial order, produced handler medians of **133.2 and 138.7 ms** for the control and **3.7 and 3.4 ms** for identity addressing. The production trial used the same bundled program for both configurations. A final development confirmation measured 132.0 → 3.3 ms. The 35-trial matrix includes raw samples, stage timings, GC measurements and trace events in the [results archive](experiments/dom-addressing/results.json.gz) and [trial summary](experiments/dom-addressing/summary.json).

## Representative Flint fixtures

The table gives development-build medians in milliseconds. Each pair keeps resident boundaries, uses headed Metal, and changes the DOM feature. Short fixtures use 40 alternating input events per trial and long fixtures use eight. These are synthetic event-handler and clock measurements in the real application. Physical screen presentation was outside the instrumented interval.

| Characters / annotations | Handler, control → identity | Next-frame callback, control → identity |
|---|---:|---:|
| 500 / 0 | 2.8 → 0.7 | 16.7 → 16.7 |
| 500 / 18 | 3.1 → 1.1 | 16.7 → 16.6 |
| 500 / 274 | 5.8 → 3.4 | 16.9 → 16.8 |
| 1,000 / 1,000 | 15.6 → 10.9 | 48.7 → 42.5 |
| 5,000 / 500 | 32.2 → 6.1 | 65.7 → 36.1 |
| 25,000 / 20 | 133.2 → 3.7 | 236.8 → 108.8 |
| 25,000 / 500 | 135.4 → 8.4 | 243.6 → 118.7 |
| 100,000 / 20 | 556.1 → 9.0 | 904.9 → 358.5 |
| Michelangelo letter, 499 / 18 | 3.5 → 1.6 | 16.7 → 16.6 |
| 500 / 0, 200-block virtual document | 2.6 → 0.7 | 16.7 → 16.7 |
| 500 / 274, active entity inventory | 6.2 → 3.5 | 17.1 → 16.8 |

A second dense 500/274 trial gave 6.0 → 3.8 ms for the handler. As a secondary check, identity addressing with the numeric boundary planner took 10.5 ms on that fixture. The sparse 100,000-character pair completed on the same machine. Its 9.0 ms identity handler and 358.5 ms next-frame callback illustrate the widening gap between editor work and browser rendering at that size. All four aspirational median handler targets in the brief were met in these trials.

## Implementation

The default-enabled feature is `identityDomCharacterAddressing`. Its unit of ownership is a mounted character flow. Surviving spans keep their occurrence keys and Text nodes through an eligible splice. The renderer uses the projection's replacement interval to create the inserted spans, remove the deleted spans and compare old and new visual runs in survivor coordinates. A user can switch off DOM addressing independently of `residentCellBoundaries`.

The DOM index groups up to 128 element references with their displayed source widths. Element-to-page membership is weak. Forward lookup binary-searches page starts. Reverse lookup reads the containing page and searches at most 128 slots. UTF-16 conversion uses page totals and local widths. A splice repairs its boundary pages and any inserted pages, then updates subsequent **page** prefixes. The work is proportional to the insertion, deletion and number of subsequent pages. It still includes an affected-block projection key array copy and the canonical resident suffix reindex. The implementation claims bounded per-character *presentation* work for unchanged survivors.

A mounted direct renderer already owned a key-to-entry map. The additional storage is the occurrence index, page arrays and weak membership. A DOM index cannot author an edit or maintain an annotation endpoint. A caller needing the canonical identity asks the mount to resolve the current projected key and then uses the repository's read-only resident lookup. This acquires no lease and hydrates no text. The renderer can address cold content, composition and inline objects without canonical Cells. Two occurrences can resolve different spans to the same resident Cell. Undo, numeric fallback and eviction can retire that identity. The next lookup uses the current repository revision. Disposal clears the index and the callback to the editor.

For plain compact text the projection publishes the new occurrence-key array in the same Solid batch as its inserted nodes, payload and splice description. A weak reference to the predecessor lets the renderer apply a delta only against the exact presentation it observed. Missed or coalesced deltas, structural rebuilds, mixed inline content, concealment and provisional presentations can take the full keyed reconciliation path. Character descriptors on the compact splice path read immutable text by key without creating a reactive dependency per surviving character. Style and class runs retain their own dependencies. Changing coverage, selection state or styling can legitimately update a surviving span. The optional declarative Solid renderer uses its existing keyed index accessor on demand and retains its existing style dependencies.

## Addressing contracts

The old producer wrote `data-inline-index` on every indexed direct span. The Solid fallback bound the attribute to its reactive list index. Both now omit the attribute when the feature is enabled. Source searches covered production code, tests, browser fixtures and experimental tools. No published feature API, native format, Markdown/TEI codec or extension schema was found to promise numerical attributes on spans.

| Consumer | Required coordinates and lifecycle | Current source of position |
|---|---|---|
| Direct and Solid character renderers | Presentation order, cold or resident, including drafts | Stable occurrence key or provisional key. Direct spans use the paged index. A declarative span registers its keyed Solid index accessor. |
| Native caret, selection capture and restore | Directional logical boundaries in the current occurrence. Browser Text endpoints use UTF-16. | Resolve an owned ancestor or a root child boundary. Restore directly to the next surviving Text node where possible. Empty flows, hidden sources and noneditable objects retain element boundaries. Existing identical native endpoints skip the Selection API write. |
| Pointer input, cross-block drag, word selection and keyboard navigation | Logical positions for commands, visual placement from the browser | The gateway and double-click handling resolve the addressed cell. Cross-block input validates native caret hit tests against the occurrence under the pointer. Its geometric fallback remains available. |
| Grapheme deletion and horizontal selection extension | Adjacent Unicode grapheme boundary in code-point coordinates | On plain compact direct flows the addressed UTF-16 offset selects a segment of the existing compact string. Page widths convert the result back to a logical boundary. Other mounts use their existing segmentation fallback. |
| IME, clipboard and undo/redo | Browser composition and clipboard events refer to an occurrence. Commands use logical ranges. | The selection port serves clipboard and history. Compact IME finds dirty spans, including temporarily detached ones, through the occurrence index and repairs them before committing. |
| Geometry, SVG decorations and Browser Range | Current rendered endpoints and actual post-reflow rectangles | Resolve addressed elements, then construct a native Range. Preserve the shared origin, fragment cache, style-run compiler and SVG shape reuse. An identity lookup provides no evidence that line geometry survived an edit. |
| Context menus, passive links, Dialectic entity clicks, inline images and reading slots | Logical cell under the event, with source/end boundaries for projected readings | Stable key selectors and on-demand indices. Context menus still use the mounted occurrence. Atomic cells consume one logical position. Projected alternatives keep their explicit semantic end. |
| Caret focus CSS | Membership in a visual interval | A stable character selector and CSS child order. |
| Tests and browser probes | Inspect character identity, styling or native selection | Select stable keys, index a flow's children, or call its selection port. Numerical attributes remain readable in the disabled control and historical synthetic comparison harnesses. |

Absolute UTF-16 lookup is available on the direct occurrence index. Native Text offsets are UTF-16 in both renderers. Logical indexing counts code points, including combining marks. Grapheme-aware commands use the entire compact string as segmentation context, including regional indicators, combining marks and ZWJ sequences. Line layout and bidi movement remain browser responsibilities.

## Source and reproduction

- [DOM addressing](src/rendering/character-address.ts), [direct renderer](src/rendering/direct-character-cells.ts), [style-run comparison](src/rendering/character-style-changes.ts) and [selection and geometry](src/rendering/standoff-editor-view.tsx).
- [Projection](src/block-tree/projection.ts), [resident lookup](src/block-tree/repository.ts), [gateway](src/input/gateway.ts), [cross-block navigation](src/input/cross-block-input.ts) and [IME repair](src/rendering/compact-composition.ts).
- [Integration regressions](src/rendering/compact-production.test.tsx), [Flint browser benchmark](scripts/benchmark-flint-typing-browser.mjs), [stage instrumentation](experiments/lightweight-cells/qualification/browser.mjs), [production harness](experiments/dom-addressing/production.mjs) and [teardown experiment](experiments/dom-addressing/retention.mjs).

Run from the repository root with its installed npm dependencies and Chrome. Set `CHROME_BIN` to select a different Chrome executable. The matrix requests a headed browser, native GPU and independent profiles. Raw per-run output is written under `artifacts/cell-qualification`. The collector archives the measured results without the fixture files.

```sh
sh experiments/dom-addressing/matrix.sh
node experiments/dom-addressing/collect.mjs
npm run typecheck
node_modules/.bin/vitest run src/rendering/compact-production.test.tsx src/block-tree/resident-qualification.test.ts
```

## Measurement method

The primary comparison toggles presentation while keeping resident boundaries enabled. The two initial long-paragraph pairs ran identity/control and control/identity. The final confirmation ran control/identity, and the production pair ran identity/control with a fresh Chrome profile for each process. The matrix script records the remaining order. The final confirmation and production runs include the completed caret-affinity check. Earlier diagnostic runs have fewer individual operation probes. The synthetic fixtures use a native Flint document with a repeating sentence, a mixture of bold, italics, rectangles, entity references and opaque properties, and seven unrelated paragraphs unless a different block count is specified. The sparse native letter is measured as admitted. The browser selects the longest mounted paragraph and dispatches cancelable `beforeinput` events at slot 100 through the installed gateway. A separate CDP keyboard check types and undoes real Chrome input. The alternating trials include the first edit to cold content. The growing-text trials restore the same starting caret and insert without intervening deletion.

The archival results retain individual synchronous handler intervals, the subsequent microtask checkpoint, the next animation-frame callback, idle callback intervals, operation labels, diagnostics and DOM mutation records. The main timing trials disable CPU sampling. Stage trials wrap the real renderer, repository, Range and Selection APIs. Repository notification and Solid flush are nested inside the command. DOM reconciliation and native selection can in turn fall inside that flush. These intervals overlap. Stage observer counts cover the mounted subtree through the callback and do not include attribute initialization on detached nodes.

The compact projection publishes a complete array of occurrence keys once per edit. It still copies that array on a plain splice. Undo and complex content may need a wider reconstruction. The deterministic counts distinguish those costs from the number of presentation descriptors, span updates, address-page memberships and annotation endpoints visited.

## Lifecycle, memory and integration

On the headed 200-block virtual document, both configurations scrolled 11,496 CSS pixels and mounted a different set of rows with zero canonical Cell allocations and zero revision change. Opening a second occurrence left the canonical allocation count at 501. One more character in the shared block brought it to 502 and appeared in both occurrences. Closing the second left the first usable. With an active entity inventory, 40 alternating edits caused zero inventory reads and zero published form updates in either configuration.

| Collected JS heap in the 200-block run | Resident control | Identity addressing |
|---|---:|---:|
| Before opening the second view | 23.58 MiB | 20.42 MiB |
| Both views mounted | 49.41 MiB | 40.06 MiB |
| After closing the second view | 24.45 MiB | 21.28 MiB |

These are whole-renderer V8 heap observations in independent sessions. They include projected nodes, Solid computations, view state and heap wrappers. They exclude much of Chrome's native DOM and GPU storage. The archive also records DOM counters, cold and warm allocations, and collected heap growth over the timed typing workload.

## Browser frame costs

In a separate native-GPU trace of the 25,000/20 fixture, warm alternating dispatches were about 3–5 ms with identity addressing. Between successive dispatches, the renderer main thread spent a median 33.9 ms in Layout, 10.8 ms in PrePaint, 31.3 ms in Paint and 7.9 ms in Layerize, measured over six interior intervals. The corresponding control values were 34.0, 10.5, 31.3 and 7.9 ms. These are trace slices matched by start time, with possible nested work. Range construction in the sparse sustained-insertion probe typically created eight ranges, shared one origin read, and took a fraction of a millisecond in the wrapped Range rectangle calls.

The data locates the remaining long-paragraph frame cost in Chrome laying out and painting the mounted flow. Cutting synchronous JavaScript work alone cannot recover that time. Geometry continues to invalidate on text/layout changes, even when annotation identities survive. The pointer fallback measures a single addressed span when the point lies inside it. Paragraph padding and unavailable native hit tests can still need the existing geometric search. Selection and geometry for rich or provisional flows remain eligible for full reconciliation.

This milestone leaves intra-paragraph virtualisation deferred. A separate comparison of layout strategies would be justified for a product requirement of frame-rate typing in a single very long mounted paragraph. This experiment measures today's layout cost and does not establish a lower bound for every browser or representation.

## Headed production comparison

Chrome 158.0.8127.37 ran on an Apple M1 with 8 GiB of unified memory, ANGLE Metal 27.2.1, enabled GPU compositing and Node v22.12.0. Idle callbacks in the production pair were approximately 16.7 ms apart. The table covers eight alternating events per fresh long-paragraph session, including cold hydration. Timings are milliseconds. With eight samples, the reported p95 is the observed maximum.

| 25,000 characters / 20 annotations | Resident control | Identity addressing |
|---|---:|---:|
| First cold edit | 107.7 | 9.6 |
| Synchronous handler, median | 112.6 | 2.7 |
| Synchronous handler, p95 / max | 143.6 / 143.6 | 12.8 / 12.8 |
| Microtask checkpoint, median / p95 | 127.2 / 159.8 | 2.8 / 12.8 |
| Next-frame callback, median / p95 | 214.0 / 246.9 | 106.4 / 119.8 |
| Warm growing-text handler, median | 87.5 | 2.5 |

| Instrumented warm growing insertion, median | Resident control | Identity addressing |
|---|---:|---:|
| Canonical prepare / apply | 0.1 / 0.3 ms | 0.1 / 0.4 ms |
| Repository notification | 10.2 ms | 1.4 ms |
| Solid flush | 76.6 ms | 0.5 ms |
| Character DOM reconciliation | 32.9 ms | 0.1 ms |
| Native selection write | 39.9 ms | 0 writes |
| Numerical DOM attribute mutations | 24,900 | 0 |
| All observed attribute mutations | 24,901 | 1 |

During the second sustained insertion, the control built and visited 25,002 descriptors. Identity addressing built and visited one, repaired 66 address memberships in one page, and added one child with no removals. Both made 24,900 **canonical** Cell suffix updates, allocated one canonical Cell, and reported zero endpoint visits, retargets, numeric exports and unrelated inventory reads. Across 1,019 observed operation samples with identity addressing enabled, the observer saw zero numerical index mutations. All 35 typing trials reported zero full snapshots and zero canonical Cell allocations during mount. The numerical attribute count is specific to the observed subtree. The archive separates SVG mutations from character work. Solid invalidation was measured through renderer pass and descriptor counters and the flush interval. There is no engine-wide count of every Solid computation.

| Separate production operation probes, one observed handler per operation | Resident control | Identity addressing |
|---|---:|---:|
| Warm insertion near start / middle / append | 88.6 / 73.1 / 60.6 ms | 2.3 / 2.0 / 1.8 ms |
| Forward delete / Backspace via input | 228.2 / 115.8 ms | 3.9 / 4.0 ms |
| Replace 190 characters with 192 | 92.2 ms | 6.8 ms |
| Paste 2,048 characters | 116.4 ms | 21.7 ms |
| Undo / redo that paste | 96.5 / 118.5 ms | 13.3 / 21.2 ms |
| Move caret / restore backward selection | 0.9 / 1.0 ms | 0.3 / 0.6 ms |

Restoring the identical selection made zero Selection API writes in both configurations. Native affinity at equivalent boundaries, including a bidi transition, is retained. The archive includes forward selections, equal and unequal replacements and sustained typing. Per-operation samples illustrate work shape and should not be read as latency distributions.

## Repeated editor teardown

Each configuration opened, focused, edited and disposed **100 independent Flint sessions in the same Chrome realm**. The harness kept only weak references to their editors, flows, resident character arrays and, when enabled, addressing indexes. It yielded across animation frames and a timer before CDP garbage collection at cycles 1, 10, 25, 50, 75 and 100. A final heap snapshot supplied the shortest measured strong paths to the two tagged survivors.

At every checkpoint both configurations retained **one editor and one detached flow, both from cycle 1**. Every canonical character array and every enabled addressing index was reclaimed. There were zero mounted flows after each teardown. The strong path ran from Chrome's native context through its cached FocusEvent, event target and a delegated Solid click-handler closure to the editor. The cached target remained the first focused editor throughout the experiment. The application closure extended the graph behind that target, and the editor and flow counts stayed flat across the remaining 99 sessions.

Collected V8 heap grew from 12.65 to 16.53 MiB in the enabled run and from 13.02 to 16.89 MiB in the control. This experiment establishes bounded retention for the tagged application objects over 100 cycles. Aggregate heap also covers shared runtime caches and other objects outside that census. No changes to Chrome or Solid event handling were needed.

## Correctness and production assessment

Type checking passed. The final broad resident qualification selection ran **1,333 tests across 117 files**. It passed 1,319. All 14 failing test names exactly match the prior qualification baseline, including the previously recorded drag/drop exception. The 10,000-command seeded numeric/resident differential passed with checks against 205 historical records. A further 239-test consumer selection had seven failures across Dialectic and the grouping toolbar. At closeout all seven reproduced at the same source assertions with identical failure messages on the accepted implementation (`7adc6b6`) and its unmodified parent (`0a4128a`), each using its own production defaults. The [validation results](experiments/dom-addressing/validation.json) list the names and the real-browser checks.

The 27 compact renderer integration cases include seven new cases for survivor identity, bounded DOM work at 25,000 characters, logical and UTF-16 lookup, grapheme deletion, bidi affinity, hit testing, both direct and declarative rendering, shared canonical identity, numeric fallback, eviction and rehydration. Existing tests exercise composition, clipboard rejection and replacement, history, persistence, annotations, temporary decoration and independent occurrences. The native Chrome selection proof passed all 12 checks across eight blocks, including keyboard routing, two-stage Select All, returning to an ordinary caret after a click, native field selection and provisional input. The qualification uses automated composition events and Chromium. Platform-specific IMEs and other browser engines have not been independently timed here.

**Production assessment.** The results support keeping identity addressing enabled for Flint. The change meets the bounded-work targets for ordinary compact text, improves every measured handler median in the fixture matrix, and preserves the verified regression baseline. Mixed inline objects, projected readings and provisional drafts retain the broader keyed renderer. Long mounted paragraphs remain limited by browser layout and paint after the input handler returns. Manual saving, native encoding and history ownership continue through their existing paths.
