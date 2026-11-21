# Mutable DOM Editor Virtualisation Investigation

Date: 10 November 2026. Repository baseline: `a13ea3b`.

**Closure status: Recommendation A's bounded implementation is accepted and closed.** See the [qualification and closure report](MUTABLE_DOM_EDITOR_VIRTUALISATION_QUALIFICATION.md) for implementation results, retained limitations and the feature setting at closure. The investigation below is retained as the historical pre-implementation record; its statements about work not yet implemented refer to that stage.

Investigation only. No production implementation, dependency installation, feature-default change or user Document modification was performed. Temporary measurement harnesses used native Mutable rendering and disposable fixtures; they were removed from the repository after measurement.

Reassessed following the architectural clarification about editor-owned navigation. This revision replaces the separate preparation-phase recommendation and effort estimate; the original performance measurements are unchanged. The reassessment is source-based, not a claim that a virtualised implementation has been qualified.

## 1. Executive summary

**Revised recommendation A: a bounded TanStack integration, correcting existing DOM-dependent assumptions in the same increment.** Mutable already has the occurrence identities, selection positions, structural relationships and focus request machinery needed. Navigation semantics remain the existing editor's responsibility; viewport mounting supplies rendering and layout inputs. There is no demonstrated need for a new navigation subsystem, parallel Document representation or extensive preparatory infrastructure.

The earlier recommendation overstated the prerequisites by grouping text-flow integration with general media eviction and heterogeneous layout coverage. Simply wrapping `ChildBlocks` is still insufficient, but the concrete corrections are narrower: replace mountedness as an eligibility test, connect existing pending focus/reveal to rendering, and retain the active input region. Leave unqualified compound/media flows on the existing renderer initially.

The scaling concern is real. In headless Chrome, 1,000 native TextBlocks containing 100 characters each mounted all 100,000 character spans and 116,004 elements. Fixture construction, model/projection preparation and synchronous DOM mounting together took approximately 6.4 seconds in this development run. These measurements establish mounted-DOM growth, not the proportion of time recoverable through virtualisation.

**TanStack Virtual is the preferred candidate**, with Virtua a credible alternative. Both provide Solid integration, dynamic measurement and programmatic scrolling. Neither should determine Mutable's selection semantics or native ownership rules. The integration connects the library to those existing editor decisions.

Use a shared renderer for eligible vertical child sequences, keyed by native occurrence identity. Presentations supply their actual scrollport and coordinate conversion through existing host infrastructure. Retain native compound structures; do not flatten the Document into a replacement row model. A target of 30–100 mounted flow items is plausible for simple text, but cannot be promised for arbitrary nested Blocks, a single enormous paragraph or active media retained outside that window.

Evidence labels below distinguish **verified** source/measurement findings, **inferences** about integration, and **unqualified** expectations requiring a future experiment.

## 2. Existing rendering architecture

### View lifecycle — verified

[ReactiveTreeView](../../src/rendering/reactive-tree-view.tsx) establishes the editor/projection context and renders the root outlet and overlays. [BlockOutlet](../../src/rendering/block-outlet.tsx) resolves registered native views. `ChildBlocks` renders the complete child sequence; `RelationBlocks` renders the applicable owned relations. Existing visibility and passive-view conditions are not a general viewport mounting window.

The [retained outlet mechanism](../../src/rendering/retained-block-outlets.ts) preserves a keyed native subtree across structural reparenting. On release it parks the subtree, then disposes it after a microtask unless another slot has acquired it. This is a transfer mechanism, not an offscreen cache. Keeping every released subtree parked indefinitely would retain the DOM cost we want to remove.

[Direct character cells](../../src/rendering/direct-character-cells.ts) maintain keyed character spans and Text nodes without a Solid root per character. They update the affected text host rather than rebuilding unrelated paragraphs. Nevertheless, all characters in a mounted paragraph have DOM representation. Ordinary offscreen scrolling does not destroy that representation.

[StandoffEditorView](../../src/rendering/standoff-editor-view.tsx) registers mount/focus handles, annotation effects, observers and scroll handling. Intersection observation gates some caret/search presentation; it does not generally remove the view or all annotation measurement work. Cleanup releases mounted facilities. Temporary decoration records are removed only when the projection occurrence itself is gone, which is a useful distinction to preserve. Conversely, cleanup validates cross-Block selection, whose present visibility rules reject an unmounted occurrence.

### Complete model and incomplete DOM independence — verified

Canonical records, ownership, text cells and the projection exist independently of a mounted view. Native editing transactions, persistence, search sources and fragment copying operate on that complete representation. Virtualisation must retain it. It will not eliminate full-model/projection memory or initial canonical preparation costs.

[Selections](../../src/runtime/selections.ts) already represent positions using view, occurrence and content identity plus offsets/affinity. [Mounts](../../src/runtime/mounts.ts) have generations and can cache selection on unmount. [Focus](../../src/runtime/focus.ts) can wait for a matching mount using a request token and validity callback. These are good foundations, but a pending focus request does not itself cause the destination to mount; cached DOM selection is not a substitute for current, edit-mapped positions.

Do not call final editor `disposeView` when evicting a Block. That operation tears down projection/session state, including selection and decorations. A virtual unmount must only release the occurrence's rendering resources.

### Existing size-dependent work — verified

| Work | Current scaling and implication |
|---|---|
| Mounted text | Character spans for every rendered TextBlock, even offscreen |
| Mounted view facilities | Annotation bindings, observers and listeners accumulate with mounted Blocks |
| Canonical model/projection | Full Document, including cells; intentionally remains complete |
| Boundary navigation | `adjacentEditable` builds a parent map over projection nodes and gathers only mounted editable destinations |
| Cross-Block parent discovery | Searches projection nodes, with caching; reducing DOM does not remove this model traversal |
| Local hit testing | Can inspect character rectangles across the hit paragraph; a single very long paragraph remains costly |
| Rich views | Native component state and potentially browser/GPU resources remain live according to individual view policy |

The navigation findings are visible in [ReactiveEditor](../../src/reactive-editor/editor.ts) and [CrossBlockSelection](../../src/runtime/cross-block-selection.ts). These costs must be separated from DOM costs when evaluating improvements. Virtualisation does not automatically make all editing work proportional to the viewport.

## 3. Library comparison

Versions below were checked against published packages on the investigation date. Source inspection used TanStack commit `54a3f7d` and Virtua commit `21d7be6`; this is an assessment, not a dependency pin proposal.

| Candidate | Useful capabilities | Fit and remaining integration |
|---|---|---|
| **TanStack Virtual**, `@tanstack/solid-virtual` 3.13.53 / core 3.19.11, MIT | Headless Solid adapter; stable item keys; dynamic ResizeObserver measurement; custom range extraction; overscan; scroll-to-index/offset; measurement/scroll hooks | Best control over native outlet identity, active-item retention and host scrollports. Mutable must still supply semantic ordering, selection and lifecycle policy. |
| **Virtua** 0.54.2, MIT | Solid `Virtualizer`/`VList`; dynamic sizing and automatic estimates; pixel buffer; `keepMounted`; custom scroll reference; cache snapshots; programmatic scrolling | Attractive for a simpler vertical flow. More component-owned machinery; `shift` is for changes at the start, not arbitrary native reorder/Undo. Cache and host changes need explicit qualification. |
| **react-window** 2.5.3, MIT | Current API supports dynamic row heights as well as simpler lists/grids | React ownership adds an unnecessary bridge around Solid/native views. No compensating editor-specific capability. |
| **React Virtuoso** 4.18.21, MIT core | Dynamic lists, grouped lists and table-oriented integrations | Also React-oriented; built-in table semantics do not replace Mutable's native table structure. The separate commercial Message List should not be confused with the core library. |
| **CodeMirror 6** | Mature editor example: complete state, viewport rendering, height estimates and explicit visible-range APIs | Useful design reference and already used for relevant native editors. Not a generic virtualiser for Mutable's heterogeneous Block ownership graph. |

Primary references: [TanStack Solid adapter documentation](https://tanstack.com/virtual/latest/docs/framework/solid/solid-virtual), [virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer), [Virtua documentation and examples](https://github.com/inokawa/virtua/tree/21d7be6), [react-window](https://github.com/bvaughn/react-window), [React Virtuoso](https://virtuoso.dev/), and [CodeMirror's viewport API](https://codemirror.net/docs/ref/#view.EditorView.viewport).

Two TanStack details affect suitability:

- The [Solid adapter](https://github.com/TanStack/virtual/blob/54a3f7d/packages/solid-virtual/src/index.tsx) reconciles its virtual-item objects by index. Mutable must render native outlets by stable **occurrence key**, rather than accidentally retaining an outlet under a changing index. Insert, move and Undo tests are essential.
- The [core implementation](https://github.com/TanStack/virtual/blob/54a3f7d/packages/virtual-core/src/index.ts) retains size/offset metadata for the full list. A size change can recompute a suffix of that metadata. Bounded DOM is therefore not a guarantee of constant work when an early paragraph wraps. Instrument this at 10,000 items before accepting the integration.

Use the library's measurement and anchoring machinery rather than implementing a competing engine. `measureElement` and manual `resizeItem` must not both own the same item's size. TanStack's `shouldAdjustScrollPositionOnItemSizeChange` is currently an instance hook. Dynamic smooth scrolling needs qualification; initial reveal should use estimated positioning followed by measured correction, not promise an exact animated jump to an unmeasured target.

Virtua's [Solid implementation](https://github.com/inokawa/virtua/blob/21d7be6/src/solid/Virtualizer.tsx) supports retaining selected indices and stable data items, but it does not determine which native media or editing sessions are safe to evict. Neither library understands nested native ownership merely because it supports variable heights.

## 4. Recommended rendering and viewport boundary

**Inference:** virtualise an eligible vertical sequence of native occurrences, with each item owning a cohesive native subtree and its required relations. Preserve the canonical tree; this is a presentation index, not another Document model or serializer.

| Native structure | Appropriate initial treatment |
|---|---|
| Ordinary paragraphs and headings | Independently measurable flow items; active editing region retained |
| Long wrapped paragraph | One item initially; no claim to solve its internal character-DOM cost |
| Lists, tables and grids | Preserve host-generated hierarchy, widths and ownership. Initially cohesive items; inner-flow virtualisation requires separate qualification |
| Surface, tabs, pages | Preserve labels, roles, selected-face/page presentation and margins. Viewport omission is different from semantically hidden content |
| Horizontal arrangements | Do not feed their children into a vertical list; virtualise an enclosing suitable flow or retain existing rendering |
| Collapsible structure | Model/presentation visibility determines eligibility; measure after expansion, without interpreting viewport eviction as collapse |
| Images and embeds | Reserve validated/known dimensions where available; measure actual native output after loading |

Top-level-only virtualisation is insufficient for a Document containing one huge group, list or table. Conversely, flattening all descendants breaks table layout, relationships and selection barriers. Eligible inner flows can be added later through existing native registrations, but unsupported structures must retain correct native rendering with an explicit performance limitation.

The [Document host presentation infrastructure](../../src/application/document-host-presentations.ts) already supplies retained hosts, scrollports, scale and viewport bookmarks. Reuse that seam:

- **Desktop:** bind the actual document scroll element.
- **Textual:** retain its [Flint host lease](../../src/features/textual/flint.tsx) and [native-island cell alignment](../../src/features/textual/native-islands.ts). Keep CSS-pixel virtualisation beneath the presentation's cell rounding.
- **Spatial:** distinguish scrolling inside a Document from movement/zoom of its containing surface. Convert transformed client coordinates correctly; do not apply vertical document virtualisation to the workspace's spatial object layout.
- **Independent panes:** maintain separate viewport, measurement and active-occurrence state even when the same canonical content appears in both.

Host handoff should rebind the virtualiser to the new scrollport and validate width-dependent measurements, while retaining the editor and canonical anchor. Existing bookmark restoration attempts DOM-range correction only if the target is mounted; this needs the same mount-on-demand path as search.

Use one authority for scroll correction. The host's canonical occurrence-plus-offset bookmark, library size corrections and browser scroll anchoring must not independently fight each other. Height validity depends on occurrence, available width, font metrics, content/structure revisions and presentation scale. A hidden zero-width host must not poison the visible host's size cache. Estimate unmounted sizes; do not mount or measure the whole Document to make estimates exact.

Normal-flow spacers may fit text better than absolutely positioned/transformed rows, but this is unqualified. Wrappers can affect margin collapse, sticky controls, table semantics and overlay positioning. No universal wrapper should be imposed without checking the actual native layout.

## 5. Selection, input and standoff compatibility

### Targeted corrections within the first integration

| Interaction | Verified dependency | Required behavior before eviction is safe |
|---|---|---|
| Arrow navigation / caret transfer | `adjacentEditable` filters for mounted destinations | Keep its editor-owned scope/type/traversal rules; replace the mount filter with explicit presentation eligibility, then reveal/mount/focus the chosen destination |
| Shift-selection / select Document | `CrossBlockSelection.visible()` requires a connected, non-hidden mount | Replace this predicate, retaining its callers' existing endpoint, sibling and content checks; render only mounted selection fragments |
| Drag selection and autoscroll | [Cross-Block input](../../src/input/cross-block-input.ts) uses DOM hit testing, pointer capture and mutation validation | Retain the interaction anchor/input owner; extend model selection as newly mounted targets become available |
| Find / programmatic reveal | [Reveal](../../src/runtime/reveal-match.ts) changes native presentation then uses a zero-delay mount lookup | Await target mount readiness with cancellation/stale-result protection, not a timer guess |
| IME | [Input gateway](../../src/input/gateway.ts) relies on the active mounted editor and native selection | Pin the composing editor until composition ends or is explicitly cancelled; never move it merely to satisfy an overscan limit |
| Clipboard | Native fragment services use model data, but selection acquisition has visibility constraints | Resolve the selected canonical content, including offscreen portions, without serializing only visible DOM |
| Undo/Redo and focus restore | Native transaction history survives independently; restored focus still needs a mount | Map positions through the committed transaction, then ensure the current target is rendered |

Cross-Block drag is feature-gated, but explicit Document selection also exists outside that experimental drag mode. Disabling the experiment does not eliminate the selection problem. A global mutation observer also revalidates selection when DOM changes, so fixing cleanup alone is insufficient.

### Reassessment of the actual navigation code — verified

`adjacentEditable` already determines the containing Document or left/right margin scope, traverses native children, and checks registered `inline-editor`/`native-text` capabilities. The erroneous coupling is its requirement for a mount plus a DOM ancestor visibility query. Removing the requirement for a mount does **not** require replacing those navigation rules with a global canonical-order list. In particular, main-content traversal must not acquire margin relations merely because they exist in the graph, and table navigation must retain its existing command semantics rather than be inferred from virtual-row adjacency.

The projection already exposes [occurrence-aware `parentOf`](../../src/block-tree/projection.ts), backed by its route index. Use that for ancestor scope and presentation checks instead of constructing another full parent map. Native sibling/ancestor traversal can locate the next eligible occurrence without scanning inline Cells. This is a correction inside `adjacentEditable` and its existing helpers, not a new persistent navigation index. Transcluded occurrences must retain their own keys and ancestor paths even when their content keys match.

`CrossBlockSelection.resolveParagraphs` already checks current occurrence/content identity, same view, valid Cell offsets, shared sibling sequence and standoff-only contiguous segments. These checks are independent of DOM. Its `visible()` predicate is the narrow point preventing an otherwise valid range from surviving eviction. Replace it with eligibility determined from the existing projection and presentation state; apply the same correction to `resolve()` and `selectDocument()`. Model-backed `selectedText()` can then read unmounted text unchanged. Keep the existing invalidation on external structural/text changes; this task does not require inventing structural selection maps.

It would be incorrect to replace `visible()` with unconditional `true`, or to interpret every absent mount as selectable. The following **existing** presentation decisions must still be honored:

| Presentation decision | Existing authority and smallest correction |
|---|---|
| Closed occurrence or closed ancestor | `ViewVisibility.isClosed`, checked along the occurrence's parent route |
| Active tab / sticky tab | `viewChildren`, authored defaults and the tab view's current selection rules. Extract/share effective-child resolution with the view; sticky-tab dismissal needs an explicit distinction between a dismissed selection and no override |
| Reversible Surface | Current native `ReversibleSurfaceView` uses `viewChildren` with a first-side default. Preserve that rule; the legacy feature-disabled surface has a different authored-active fallback |
| Collapsed list/task descendants | Existing native collapse settings and owner helpers, rather than the resulting `hidden` attribute |
| Concertina-hidden branch | `deriveConcertinaPresentation` already computes `hiddenBranchRoots` without DOM. Its service's `presentation()` still queries the DOM; expose the existing derivation through an ancestor check instead |
| Host interaction restrictions | Preserve existing focus permits and host activation rules. A missing mount does not grant authority to another view or inactive host |

The tab case is a real small extraction: some effective active state currently lives in component signals, so merely reading `viewChildren` everywhere would not exactly reproduce authored-flag changes or sticky-tab dismissal. Share that resolution through the existing presentation state. Do not create a generic navigation registry. Unsupported external code that only sets arbitrary `hidden`/`inert` attributes cannot communicate an offscreen policy; known production decisions must use their actual native state. Mounted DOM checks may remain for hit-testing and interaction safety, but must not define whether an offscreen model range exists or is valid.

Existing hidden-content tests directly toggle DOM attributes. Preserve their genuine hidden-content intent using native presentation controls and add a separate eviction test. Do not weaken stale/foreign endpoint, media, sibling or list/page/tab barrier assertions to make eviction pass.

### Geometry is an input, not navigation authority

The [existing cross-Block input handler](../../src/input/cross-block-input.ts) already preserves `preferredX` and uses line/hit-test geometry for vertical selection extension. Keep this logic. When a permitted adjacent occurrence lacks geometry, ask the flow to render that occurrence, then use its measured first/last visual line and the preferred horizontal coordinate. Do not silently substitute start/end offsets for an intended vertical move because a rectangle is temporarily missing. Reuse the current gesture/focus token and recheck the occurrence and input state when measurement completes.

Ordinary gateway boundary commands currently act at text endpoints and request a start/end caret; local movement is partly browser-managed. Virtualisation need not redesign that behavior into a universal visual-navigation model. Keep the active editor and adjacent editing region mounted so current local wrapping and caret behavior continue. Where an existing command requires destination geometry, render/measure the chosen candidate before completing that command. Host coordinate conversion still applies to preferred-X and hit testing.

CodeMirror is the relevant precedent: its installed `@codemirror/view` declarations expose complete selection positions, `viewport`/`visibleRanges`, estimated layout information and `moveVertically` with a preserved `goalColumn`. Its DOM-position APIs explicitly limit what offscreen DOM can tell callers. This supports the distinction between document position, permitted movement and available geometry; it is not a reason to copy its height map or introduce CodeMirror's document model into Mutable. See the [vertical movement API](https://codemirror.net/docs/ref/#view.EditorView.moveVertically).

The smallest rendering connection is a flow-owned ensure-rendered callback used by the existing focus/reveal paths. `FocusService` already queues a request and applies it when a mount registers. Extend that path to request rendering; reuse its token/validity checks. Search reveal and cross-selection collapse/replacement should use that same route instead of direct mount lookup followed by a timeout or microtask retry. The callback must not choose a different semantic destination. No separate focus queue, selection store or offscreen navigation service is needed.

Pin the caret editor, IME/input owner and active drag anchor. Pinning every Block covered by a large selection would defeat virtualisation; selection endpoints and selected content must remain model-owned. A retained endpoint can be outside the ordinary viewport range. If required active content exceeds the preferred window, correctness takes precedence over a hard mounted-item cap.

Home/End, Page Up/Page Down and visual-line navigation need explicit tests against the real scrollport and mounted line geometry. Preserve current semantic barriers across media, lists and alternative faces; distinguishing viewport omission must not make genuinely hidden or structurally incompatible content selectable.

### Standoff and geometry

Persistent properties, entity references and linked annotations are canonical ranges. [Session decorations](../../src/runtime/session-decorations.ts) preserve temporary ranges by occurrence. Eviction must preserve these records while releasing DOM geometry; deletion remains a different operation.

[Measurements](../../src/runtime/measurements.ts) already retain range geometry with mount/revision/width/scale validity and font invalidation. [Range rendering](../../src/rendering/range-rendering.tsx) provides reusable annotation effects. Reuse these and the existing annotation-container SVGs. Remount creates a new geometry generation; stale rectangles cannot be reused merely because the Block ID matches. Ensure old generations are released rather than accumulated.

Necessary measurements should be coalesced, read before DOM/SVG writes and limited to mounted invalidated regions and their actual reflow dependencies. Scrolling should move local SVGs naturally. A library item-size observer does not justify another per-character measuring pass or a whole-document sweep on typing.

[Gloss presentation](../../src/features/gloss/presentation.tsx) has a canonical record index and shares measured Block rectangles. Underlaid gloss content can change the item's height. Margin-lane overlap and annotations whose related occurrences cross the window boundary require continuity/overscan policy. Do not duplicate canonical glosses to render continuation.

A specific constraint is [Document margin registration](../../src/rendering/document-margins.ts): relation outlets currently register entries when mounted. Evicting an owner could therefore remove its margin from discovery/drawers. The first eligible flow can keep its Page/Document shell mounted and exclude items that own marginal relations. This avoids requiring a margin-discovery refactor before ordinary text virtualisation. Before evicting such owners, separate canonical margin availability from mounted geometry. Decorations spanning several occurrences should retain one logical source and render only the relevant mounted fragments.

## 6. Rich-content lifecycle

**Verified:** native view cleanup is not uniformly a harmless paint optimization.

| Content | Eviction implications and proposed policy |
|---|---|
| Images | Native binding/cleanup can release and recreate the displayed resource reference. Usually recreatable; preserve intrinsic-size estimates and verify no reacquisition or canonical resource change |
| YouTube / other iframes | Removing the element destroys its browsing context. Cross-origin playback state is not generally recoverable without a supported provider API; retain active instances conservatively |
| Native video view | [Current view](../../src/rendering/video-block-view.tsx) explicitly retains its active browsing context until Stop or occurrence disposal. Offscreen eviction must respect that contract |
| HTML5 media | Playback position, tracks and paused/playing state are operational state. Retain active playback initially; suspend/recreate only after a native lifecycle contract is qualified |
| Timers | [Submitted-content operational state](../../src/features/timer/view.tsx) can live in component-local signals. Remount can reset it; retain or move that existing native runtime state to session lifetime before eviction |
| 3D objects | [Native view](../../src/features/three-d-object/view.tsx) lazily creates a scene and destroys it on cleanup. Camera/gesture state and GPU lifecycle need explicit retention/suspension decisions |
| Diagrams, PDF/IIIF and other interactive viewers | Audit individual native lifecycle, annotations, viewer grants and local navigation. Do not assume iframe, canvas and nested editor cleanup have equivalent semantics |

For the first integration, retain current rendering for flows containing unqualified stateful items; no general lifecycle capability system is a prerequisite. Later, add minimal lifecycle information to existing registrations only if required to extend eviction. Do not create a parallel DCP or virtualisation Block registry. Connected parking is suitable for some transfers, not an unlimited hidden-media warehouse. Retention costs and limits must remain visible in diagnostics.

Authored content stays immutable where currently protected. Preserving local playback, navigation or timer state must not write operational changes into submitted contributions or dirty a Document during scrolling.

## 7. Performance evidence and untested assumptions

### Actual browser measurements

Used the existing [Chrome typing harness](../../scripts/benchmark-typing-browser.mjs) against the running Vite server. It renders native `ReactiveEditor`/`ReactiveTreeView`, installs the real gateway and checks text restoration, trusted Chrome input and Undo/Redo. Fixtures were in memory and never saved. Chrome was headless with SwiftShader, at 1440 × 900; these were standalone editor mounts, **not complete Flint/Desktop/Textual/Spatial UI latency measurements**.

The unchanged 250-Block harness passed first. Temporary copies changed only fixture size and added mount timing/DOM counts for 100 and 1,000 Blocks. Each paragraph contained 100 characters and one bold range. One run per size; no statistical performance claim follows.

| Measured quantity | 100 Blocks | 250 Blocks, unchanged harness | 1,000 Blocks |
|---|---:|---:|---:|
| Mounted text flows | 100 | 250 | 1,000 |
| Character spans | 10,000 | Not separately instrumented | 100,000 |
| Descendant elements under fixture host | 11,604 | Not instrumented | 116,004 |
| Fixture/model/projection/synchronous DOM setup | 739.6 ms | Not instrumented | 6,379 ms |
| 40 input-handler samples: median | 2.5 ms | 1.8 ms | 2.5 ms |
| Harness-reported p95 | 6.1 ms | 8.0 ms | 22.9 ms |
| Maximum handler sample | 23.0 ms | 52.6 ms | 214.6 ms |
| Mid-paragraph split handler | 13.3 ms | 22.0 ms | 55.4 ms |
| Full snapshots during measured typing/split | 0 | 0 | 0 |

Counts are elements, not all DOM nodes or byte memory. Setup excludes imported-module startup and is not first meaningful paint. Typing samples measure synchronous synthetic `beforeinput` handling, not event-to-painted-character latency. The harness's separate trusted Chrome insertText, Backspace, Enter and Undo/Redo checks passed, including start/end/empty split boundaries. Unrelated character-node identity was preserved.

The similar medians and uneven tails warrant browser tracing, not a claim that 1,000 Blocks always make typing several times slower. No before/after virtualisation result exists.

### Actual structural baseline

A temporary Vitest/jsdom harness used the native core registry and renderer with 40-character, unannotated paragraphs:

| TextBlocks | Character spans | Elements | Canonical records | Projection nodes | Prepare / mount time |
|---:|---:|---:|---:|---:|---:|
| 100 | 4,000 | 5,604 | 4,101 | 4,101 | 193 / 395 ms |
| 1,000 | 40,000 | 56,004 | 41,001 | 41,001 | 1,479 / 3,043 ms |

These timings are jsdom JavaScript work, not browser layout or responsiveness. They separately demonstrate that both canonical/projection state and mounted DOM grow with content. Virtualisation addresses only part of that total.

**Estimate, not measurement:** repeating this exact 40-character fixture to 10,000 Blocks implies 400,000 character spans, approximately 560,004 elements and 410,001 canonical/projection records. No 10,000-Block browser timing, memory estimate or extrapolated latency is claimed.

### Gaps and interpretation

| Requested dimension | Evidence available / remaining uncertainty |
|---|---|
| Initial render and mounted counts | Measurements above; no decomposition of canonical preparation versus browser layout in Chrome |
| Memory | No heap/GPU/process-memory profile. Fewer mounted views should reduce DOM/view overhead, but complete canonical cells/projections remain |
| Scrolling and style/layout | No trace or frame-time distribution collected; offscreen layout/observer cost is a source-based concern, not a measured attribution |
| Geometry frequency | Source paths inspected; no comprehensive per-scroll/per-keystroke rectangle-read count collected |
| Opening/switching | Setup sample and existing retained-host tests; no whole-application opening/switch benchmark |
| Dense annotations / mixed media | Lifecycle and geometry source audit only. No representative dense-annotation or mixed-media performance run |
| 10,000–50,000 Blocks | Structural extrapolation only; no demonstrated usable performance |

This was sufficient to establish the problem and architectural blockers without a misleading scrolling demo that omits editing. No optional virtualised prototype was built. Existing focused suites passed **46 tests across five files**: cross-Block selection, direct character cells, decorations, caret measurements and Document host presentations. They validate the baseline, not virtualisation compatibility.

Scratch browser scripts, structural harness and logs were retained locally under `/tmp/mutable-dom-virtualisation/` for immediate inspection; that directory is not a durable repository artifact. Reproduction uses the checked-in browser harness, the documented fixture sizes and the two additional measurements described above.

### Expected benefit and lower-risk alternatives

**Inference:** limiting simple paragraph flows to the viewport plus retained active items should substantially reduce mounted character spans, view effects and geometry consumers. It cannot guarantee equivalent reductions in initial model construction, persistence, large canonical edits or inner content of one huge item.

Targeted improvements may help sooner: remove irrelevant annotation-measurement triggers, reuse valid geometry, avoid model-wide scans in boundary navigation, and qualify native media activation/lifecycle. Existing visibility gating reduces selected work while preserving DOM; it is not equivalent to bounded mounting. These measures complement virtualisation but do not solve its demonstrated element-count growth.

## 8. Risk, activation and effort

For the narrow first integration, the principal risks are inaccurate presentation eligibility, focus/IME eviction, delayed geometry and scroll correction. These are concrete integration and qualification concerns, not evidence that a new navigation architecture is necessary. Media teardown, owner-margin registration and table layout remain real constraints on expanding eligibility, but can be excluded from initial eviction. Browser find-in-page cannot be assumed to cover unmounted text; Mutable's canonical search must remain the reliable application path. Accessibility testing must assess keyboard and assistive-technology access to offscreen content rather than relying only on DOM counts.

For small Documents, retain current rendering. An eventual activation decision should use cheap cached structural complexity—text length/estimated span count, eligible flow count and known expensive views—rather than Block count alone or a full scan during typing. Pixel height requires layout and is not a sufficient starting metric. No numeric threshold is justified yet. Avoid changing rendering mode during composition or a drag, and preserve a per-Document fallback. A future major feature needs the repository's feature-flag convention; this investigation adds no flag or changes existing defaults.

**Revised planning estimate, low confidence: approximately 5–10 engineer-days for one bounded implementation and qualification**, comprising roughly 1–2 days for semantic/presentation corrections, 1–3 for the flow adapter and focus/reveal connection, and 3–5 for browser interaction, regression and performance checks. This replaces the previous 4–8 week combined estimate, which unnecessarily bundled broad lifecycle preparation with a narrow text-flow integration. The estimate is not measured implementation effort or a delivery commitment. Exact visual-line behavior, stale async navigation and wrapper/scroll geometry are the main uncertainties. Full compound/media eviction is outside this estimate; it should not be a prerequisite for the useful first increment.

## 9. Recommended next decision

The reassessment supports **one small implementation**, not a separate infrastructure program:

1. Correct `adjacentEditable`, cross-selection eligibility and closely related focus fallback paths using the existing occurrence/presentation state. Share existing active-child resolution where necessary, and reuse `parentOf` rather than adding a navigation index.
2. Integrate TanStack at an explicitly eligible vertical child-flow outlet, keeping the native parent shell and occurrence-keyed outlets. Begin with ordinary text/heading flows whose items have no unqualified interactive descendants or owned margins. Keep tables, compound owners and mixed stateful flows on their current renderer. This is an initial coverage limit, not a permanent rule against virtualising rich Documents.
3. Connect existing focus/reveal to the flow, pin the current input/composition/drag owner and necessary editing neighbors through the library range mechanism, and retain existing model selections. Reuse TanStack measurement/anchoring and the host scrollport; add no separate scheduler, height cache or presentation protocol.

That scope gives large eligible text flows bounded DOM now without making media/session refactoring a prerequisite. A Document dominated by one huge table or mixed unsupported flow will not yet receive the same benefit; state that limitation rather than claiming universal coverage.

The acceptance gate is bounded mounting **plus** ordinary boundary movement, wrapped vertical selection with preferred X, large offscreen selection/copy, IME retention, find/reveal, Undo/Redo and native save/reload. Test correct exclusion of inactive faces, collapsed branches and foreign occurrences, including repeated/transcluded content. Existing host transfer and unsupported rich-flow behavior must remain unchanged. Qualify layout inputs for each enabled host; use existing rendering for any host/flow that cannot yet be qualified rather than creating a second implementation.

Use the real Flint/browser workflow for before/after measurements. Instrument suffix measurement work, layout reads, snapshots, validation, network requests and unrelated updates; include large text and annotated flows and a mixed-media fallback regression. Selection validation must not rescan an entire large selected range after every virtual DOM mutation: invalidate from actual structural/presentation changes, retaining any necessary mounted interaction checks separately. This is a bounded-work correction to the existing observer, not a new selection model. Scrolling/mounting must cause no canonical transactions, dirty changes, persistence, Undo entries or vault scans.

No production implementation was started during this reassessment. The concrete unresolved items are effective presentation-state resolution, completion of offscreen focus/geometry requests, input retention and real browser layout qualification. None currently demonstrates a need for a new navigation subsystem or extensive preparatory state machinery.
