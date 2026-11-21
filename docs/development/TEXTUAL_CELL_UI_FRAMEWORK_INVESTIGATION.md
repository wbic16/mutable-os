# Textual cell UI framework investigation

Investigation date: 2026-11-10. Investigation only; no production implementation, dependency changes or migration.

## 1. Recommendation

**C — Retain the current Textual architecture.** No evaluated cell-buffer framework establishes a sufficiently economical replacement for Mutable's browser-based, media-capable document environment. The best terminal widget collection is JSVision, but its browser host is explicitly unsupported for consumer deployment. Unblessed has a public browser adapter, with alpha maturity and concrete lifecycle/input concerns. OpenTUI's Solid renderer targets native terminal output, not the browser. These findings are architectural, not a claim that DOM rendering is universally faster.

The lowest-risk way to inherit more UI behaviour is selective use of **browser-native Solid primitives within the existing cell layout**. Kobalte is already declared in Mutable's dependencies. It could supply menu/dialog/popover/tab behaviour without replacing Flint, the Window Manager or application ownership. This is an option for subsequent, individually justified UI work, not a recommendation to rewrite functioning controls. It does not provide a framebuffer or solve large-document virtualisation.

No candidate demonstrated the proposed “80% supplied, 20% adapter” outcome for the complete requirement. A terminal desktop can supply much of the chrome while leaving the more expensive browser editor, media and interaction integration to Mutable. No prototype was necessary: source and deployment boundaries resolve the adoption decision. Building a media compositor or missing widgets for a demonstration would conceal the principal cost.

Evidence labels below: **Verified** means inspected source, package metadata or primary documentation; **Inference** means an architectural/effort assessment; **Untested** means not exercised in a real Mutable browser workload. Library source presence is not production qualification.

## 2. Current Mutable architecture

| Boundary | Verified implementation | Implication |
| --- | --- | --- |
| Cell layout | [grid.ts](../../src/features/textual/grid.ts) derives rows/columns from font dimensions and calculates shared rectangle edges directly. [view.tsx](../../src/features/textual/view.tsx) measures a font probe, coalesces resize work and publishes CSS dimensions. | Already has a cell-layout abstraction; no two-dimensional glyph framebuffer. |
| Flint hosting | [flint.tsx](../../src/features/textual/flint.tsx), `FlintHost`, leases the retained editor element into a cell-sized DOM scrollport. | Native editing and rich Blocks are retained, not reconstructed as terminal text. |
| Presentation contract | [application-presentation.ts](../../src/feature-api/application-presentation.ts), [applications.tsx](../../src/features/textual/applications.tsx), [document-host-presentations.ts](../../src/application/document-host-presentations.ts). | Application identity, transition guards, activity, focus/selection bookmarks and session lifetime stay host-owned. A library is a presentation component, not a new application registry. |
| Window/focus ownership | Textual selects existing instances and reveals them through `editor.windowManager`; retained-host transitions guard composition, gestures and pending operations. | Library movement/stacking must be local presentation state or delegated to existing services; never a competing persisted Window Manager. |
| Fonts/zoom | [fonts.ts](../../src/features/textual/fonts.ts) loads bundled IBM Plex Mono, checks normal/bold advances, supports configured fonts with fallback. Grid preferences include zoom and palette. | A replacement must share effective metrics, font loading and zoom invalidation. Current checks are not proof of arbitrary Unicode cell-width equivalence. |
| Text/input | [direct-character-cells.ts](../../src/rendering/direct-character-cells.ts) retains keyed character spans without a Solid root per character. [gateway.ts](../../src/input/gateway.ts) handles `beforeinput`, IME, clipboard and commands. | There is per-character DOM in Flint, but it is purposeful native editor infrastructure. Replacing it is a new editor presentation adapter, not a renderer toggle. |
| Geometry/decorations | [standoff-editor-view.tsx](../../src/rendering/standoff-editor-view.tsx), [measurements.ts](../../src/runtime/measurements.ts), [decorations.ts](../../src/rendering/decorations.ts). | Existing SVG effects and temporary ranges use local range geometry. Retained-range caching accounts for occurrence generation, content revision, width, scale and explicit invalidation. This is not a claim of a complete shared per-cell geometry cache. |
| Native media | [core-block-views.tsx](../../src/rendering/core-block-views.tsx) creates browser images/video/iframes; [native-islands.ts](../../src/features/textual/native-islands.ts) rounds media flow height to whole rows using ResizeObserver. | Media remains in document flow and clips/scrolls with its DOM ancestors. Structural observation excludes standoff character mutations. No separate Canvas overlay compositor is required. |
| Large-document rendering | [reactive-tree-view.tsx](../../src/rendering/reactive-tree-view.tsx) hosts native Block views. Inspected Textual code has no generic variable-height, viewport-only Flint Block virtualiser; individual views use visibility optimisations. | Retaining Textual does **not** establish the 10,000-line requirement. Paint suppression is not bounded mount count or full layout virtualisation. |

Existing menu positioning, command services, tabs, status, native dialogs, document persistence and Undo/Redo are reusable. A browser primitive adapter could eventually retire selected handwritten focus/keyboard routines. A glyph-buffer migration would instead need new presentation/input/geometry machinery around the same canonical model. No canonical snapshots, validation, saves or scans should be introduced into typing or presentation changes.

## 3. Candidate evidence and deployment gates

### JSVision / BlendSDK

**Verified:** the public repository contains a retained widget tree, windows, menus, dialogs, split views, scrollbars, tabs, trees, inputs and a specialist data grid. The core `CellBuffer` contains glyph/style/width information, including wide-cell continuation handling. This is the closest aesthetic and widget match. [Widget catalogue](https://blendsdk.github.io/jsvision/components/), [buffer source](https://github.com/blendsdk/jsvision/blob/af912f4/packages/core/src/engine/render/buffer.ts).

The browser implementation **is public source**, but `@jsvision/web` is private/unpublished and explicitly unsupported for consumer deployment; registry lookup returned 404. Its host serialises frames to ANSI for xterm.js and decodes input back into the widget loop. `mountApp` does not expose arbitrary DOM content slots. “Private” here means package/release status, not inaccessible code. [Release boundary](https://blendsdk.github.io/jsvision/guide/install-and-packages.html), [mount implementation](https://github.com/blendsdk/jsvision/blob/af912f4/packages/web/src/mount.ts), [browser architecture](https://blendsdk.github.io/jsvision/guide/running-in-the-browser.html).

Its Scroller clips an oversized child using cell offsets and a content extent; this is useful UI scrolling, not automatic Mutable mixed-height document virtualisation. Unicode width support still needs agreement between core, terminal provider and font, especially grapheme clusters. **Inference:** vendoring the browser package plus custom media/focus/annotation composition defeats the maintenance objective. Gate: supported browser release and a documented DOM-island lifecycle, not another renderer benchmark. [Scroller source](https://github.com/blendsdk/jsvision/blob/af912f4/packages/ui/src/scroll/scroller.ts).

### OpenTUI

**Verified:** native Zig core, cell/framebuffer facilities, Yoga layout, ScrollBox/ScrollBar, inputs, selection and text-oriented renderables; a Solid integration exists and is published. Current runtime documentation supports Bun and Node with native FFI requirements. Solid support does not imply browser support; the repository's `packages/web` is its Astro documentation site. [Runtime support](https://opentui.com/docs/getting-started/runtime-support/), [Core package](https://github.com/anomalyco/opentui/blob/ed9f320/packages/core/package.json), [web package](https://github.com/anomalyco/opentui/blob/ed9f320/packages/web/package.json).

ScrollBox has genuine bounded child scrolling and paint/update culling, but Yoga still lays out culled children. Image/video or Three.js/WebGPU terminal integrations are not native HTML iframe hosts. **Inference:** a browser/WASM/DOM backend and editor bridge would be substantial porting. Hard deployment gate fails for Mutable's current browser target. Do not benchmark it as a drop-in replacement. [ScrollBox semantics](https://opentui.com/docs/components/scrollbox/), [Three.js runtime prerequisite](https://opentui.com/docs/getting-started/runtime-support/).

### Unblessed / Blessed ecosystem

**Verified:** public TypeScript browser package connects the inherited widget library to xterm.js. Boxes, forms, dialogs, lists, tables, scrollable regions and text inputs are real implementations. A draggable box/listbar is not automatically a complete desktop window manager, tab system or splitter. Tree functionality from other Blessed ecosystem packages must not be credited as built into this package. [Core widgets](https://github.com/vdeantoni/unblessed/tree/d68dcf6/packages/core/src/widgets), [browser package](https://github.com/vdeantoni/unblessed/blob/d68dcf6/packages/browser/package.json).

Source-level concerns: the adapter throttles wheel events at 50 ms and converts them to terminal directions; DOM mouse handlers and xterm subscription disposables are not retained for cleanup. `Screen.destroy()` removes adapter EventEmitter listeners, which does not remove those DOM/xterm registrations. This is an observed cleanup gap, not a measured leak rate. The browser runtime explicitly rejects its PNG/GIF image helpers; those helpers would not provide interactive media islands anyway. [Adapter](https://github.com/vdeantoni/unblessed/blob/d68dcf6/packages/browser/src/adapters/xterm-adapter.ts), [destroy path](https://github.com/vdeantoni/unblessed/blob/d68dcf6/packages/browser/src/screen.ts), [browser runtime](https://github.com/vdeantoni/unblessed/blob/d68dcf6/packages/browser/src/runtime/browser-runtime.ts).

The latest inspected package is still alpha and depends on legacy `xterm` rather than the newer scoped package. No supported native DOM-island contract was found in the browser adapter. **Inference:** useful for terminal dashboards, but insufficient maintenance savings for Flint. Original Blessed has a much older default-branch tip; its maturity does not establish browser-adapter maturity. [Unblessed limitations](https://github.com/vdeantoni/unblessed/blob/d68dcf6/README.md), [Blessed repository](https://github.com/chjj/blessed).

### TermUI

The name here means **Karanjot786/TermUI / `@termuijs/*`**, not similarly named Go/Rust projects. **Verified:** double-buffered cells, grapheme segmentation, flex layout, menus, modal controls, tabs, trees, SplitPane, ScrollView and VirtualList implementations. The terminal adapter uses Node input/output streams; no supported browser host was established. Its JSX/hooks are its own API, not a Solid DOM renderer. **Inference:** stream injection is a possible porting seam, not evidence that browser media and IME integration are supplied. Eliminate from immediate adoption. [Screen source](https://github.com/Karanjot786/TermUI/blob/52e4b27/packages/core/src/terminal/Screen.ts), [terminal adapter](https://github.com/Karanjot786/TermUI/blob/52e4b27/packages/core/src/terminal/Terminal.ts), [widget source](https://github.com/Karanjot786/TermUI/tree/52e4b27/packages/widgets/src), [UI source](https://github.com/Karanjot786/TermUI/tree/52e4b27/packages/ui/src).

### Browser rendering baselines

- **xterm.js:** mature browser terminal foundation with DOM and WebGL2 rendering, font options, input/selection and buffer APIs; not a desktop widget toolkit. Its modern releases removed the Canvas renderer addon. Grapheme support is an experimental addon. Terminal scrollback is not Flint's editable document viewport. [Official README](https://github.com/xtermjs/xterm.js/blob/f70764d/README.md), [release history](https://github.com/xtermjs/xterm.js/releases).
- **ROT.js:** actual browser display abstraction, Canvas text/tile backends, WebGL tile backend, dirty-cell updates and pointer-to-cell mapping. No application widget or rich-editor system. `drawText` uses UTF-16 character iteration and width heuristics, not a qualified grapheme editor pipeline. **Inference:** saves low-level display work while leaving most requested work custom. [Display source](https://github.com/ondras/rot.js/blob/46782e2/src/display/display.ts), [backends](https://github.com/ondras/rot.js/tree/46782e2/src/display).
- **unicodetiles.js:** Canvas/WebGL/DOM character-tile viewports and simple input; game-map scrolling and tile callbacks, not document editing or desktop widgets. Default-branch source dates to 2018. Reject as a new critical UI dependency. [Source and licence](https://github.com/tapio/unicodetiles.js/blob/9b5bd02/README.markdown).

### Additional browser/hybrid candidates

- **Kobalte:** unstyled Solid DOM primitives for menus, dialogs, popovers, tabs, inputs and related controls. Native DOM composition permits retained media/editor children. No framebuffer, desktop windows or general document virtualiser. Mutable declares `@kobalte/core:^0.13.9`; the inspected `src` tree has no direct imports, so being a dependency is not evidence of existing Textual integration. Best option for reducing specific future widget work. [Components and ownership model](https://kobalte.dev/docs/core/overview/introduction/), [Mutable package](../../package.json).
- **corvu Resizable:** a supplementary Solid splitter primitive with controlled sizes and keyboard resizing. Cell snapping and persistence must remain Mutable-owned. Possible small adapter if resizable panes become a demonstrated need; not another framework to adopt wholesale. [Resizable API](https://corvu.dev/docs/primitives/resizable/).
- **DomTerm:** browser DOM terminal with HTML/SVG output, Unicode handling, panes and tabs. This shows rich output can coexist with terminal semantics. It does not establish an embeddable Flint widget/editor contract or interactive iframe lifecycle. **Inference:** extracting its console/pane system would duplicate more than it replaces. [Features](https://domterm.org/Features.html), [source](https://github.com/PerBothner/DomTerm).
- **TuiCss:** browser text-mode styling and component examples; compatible with DOM media, but not a complete cell framebuffer/interaction engine. Much of its visual value is already present in Mutable. [Project](https://github.com/vinibiavatti1/TuiCss).
- **WinBox:** real browser windows with DOM mounting; not a cell UI toolkit. Adopting its window ownership would duplicate Mutable's central Window Manager. **Inference:** little net saving for this task despite good browser-content compatibility. [DOM mounting/window API](https://github.com/nextapps-de/winbox).

## 4. Maintenance, versions and licensing

Verified from source checkouts, default-branch commit metadata and npm registry on the investigation date. A recent push is not necessarily a recent source commit; versions below are published stable/latest tags where available, not a promise of future support.

| Candidate | Inspected source / latest package evidence | Licence and maintenance assessment |
| --- | --- | --- |
| JSVision | `af912f4`, 2026-09-08; UI 1.7.1; web package 404 | MIT; recently developed, extensive documentation; consumer browser release missing |
| OpenTUI | `ed9f320`, 2026-11-10; Core/Solid 0.8.3 published 2026-11-07 | MIT; active; native target mismatch |
| Unblessed | `d68dcf6`, 2025-12-09; browser 1.0.0-alpha.23, same date | MIT; alpha and no newer default-branch commit observed |
| TermUI | `52e4b27`, 2026-11-08; core 0.1.7 published 2026-06-29 | MIT; active source, young release line; no qualified browser target |
| xterm.js | `f70764d`, 2026-11-08; 6.0.0 stable, 6.1 beta stream | MIT; established browser project |
| ROT.js | `46782e2`, 2024-11-13; 2.2.1 | BSD-3-Clause; established toolkit, slower recent activity |
| unicodetiles.js | `9b5bd02`, 2018-12-02 | MIT code; bundled fonts have separate terms; stale core dependency risk |
| Kobalte | `675b4a1`, 2026-09-07; stable 0.13.14, separate 2.0 alpha | MIT; maintained Solid primitives |
| corvu Resizable | 0.2.5 published 2025-05-04 | MIT; focused documented primitive, current release evidence is older than Kobalte's |
| DomTerm | `b2889ad`, 2026-11-02 | Root COPYING has BSD three-clause terms; dependencies/components require separate review |
| TuiCss | default tip `6a021ec`, 2023-07-19 | MIT; older default-branch source, despite later repository push metadata |
| WinBox | default tip `bbb453a`, 2023-12-21; 0.2.82 published 2023-07-13 | Apache-2.0; focused older release line |

Package evidence: [JSVision](https://registry.npmjs.org/@jsvision%2fui/latest), [Unblessed](https://registry.npmjs.org/@unblessed%2fbrowser/latest), [OpenTUI](https://registry.npmjs.org/@opentui%2fcore/latest), [TermUI](https://registry.npmjs.org/@termuijs%2fcore/latest), [xterm](https://registry.npmjs.org/@xterm%2fxterm/latest), [ROT](https://registry.npmjs.org/rot-js/latest), [Kobalte](https://registry.npmjs.org/@kobalte%2fcore/latest), [corvu Resizable](https://registry.npmjs.org/@corvu%2fresizable/latest), [WinBox](https://registry.npmjs.org/winbox/latest). Source links in §3 identify the inspected implementations. [DomTerm COPYING](https://github.com/PerBothner/DomTerm/blob/b2889ad/COPYING), [Kobalte licence](https://github.com/kobaltedev/kobalte/blob/675b4a1/LICENSE).

No obvious top-level licence obstacle was identified for the shortlisted permissive projects. This is a licence inventory, not a transitive dependency or font licence audit. Deployment and integration blockers dominate the decision.

## 5. Widget coverage

**Y:** supplied implementation; **P:** partial/building blocks or needs composition; **—:** not established in the inspected core. Entries describe the library's own target, not qualified Mutable integration. A text input entry does not certify browser IME or Flint editing parity.

| Widget | JSVision | OpenTUI core | Unblessed | TermUI | xterm / ROT / UnicodeTiles | Kobalte |
| --- | --- | --- | --- | --- | --- | --- |
| Movable/resizable desktop windows | Y | — | P (boxes) | — | — | —; retain Mutable |
| Menu bar/dropdowns/accelerators | Y | P | P (listbar) | Y | — | Y; command adapter |
| Dialogs/forms | Y | P | Y | Y | — | Y |
| Status bars | Y | P | P | Y | — | P |
| Resizable split panes | Y | P | P | Y | — | —; corvu optional |
| Scrolling regions/scrollbars | Y | Y | Y | Y | terminal buffer / map viewport | browser CSS; not a document virtualiser |
| Tabs | Y | P (TabSelect) | P | Y | — | Y |
| Lists/tables | Y | Y | Y | Y | — | P; native table/selection composition |
| Trees | Y | — | — | Y | — | — |
| Text inputs | Y | Y | Y | Y | terminal input only / — / — | Y (native input) |
| Popovers/context menus | Y | P | P | Y | — | Y |
| Arbitrary native DOM children | — | — | — | — | decoration seam / custom / custom | Y |

Window titles, fonts, colours, reverse video and borders are straightforward in terminal libraries, but DOM islands and accurate multi-layer annotations are not implied by widget coverage. In Kobalte, classic aesthetics require CSS and cell-sized placement; its value is inherited interaction/accessibility behaviour rather than a ready-made Turbo Vision theme.

## 6. Weighted assessment

Scores are **inferences for this Mutable task**, 0–5; weights are exactly those in the brief. Total = sum(weight × score / 5). Rendering receives a neutral **3** throughout: no comparative workload measurement was performed. Scores measure fit/economy, not universal library quality. A hard deployment gate overrides the total.

| Approach | Widgets 25 | Media 20 | Integration 20 | Document 15 | Render 10 | Maintain 10 | /100 | Decision/gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Current Textual + selective Kobalte | 4 | 5 | 5 | 4 | 3 | 4 | **86** | Best prospective economy; adapters untested |
| Current Textual unchanged | 3 | 5 | 5 | 4 | 3 | 3 | **79** | Recommended baseline; large-document limits remain |
| TuiCss + retained editor | 2 | 5 | 4 | 3 | 3 | 2 | **65** | Mostly duplicates existing styling |
| WinBox + retained editor | 2 | 5 | 3 | 2 | 3 | 2 | **58** | Competing window ownership, no cell framework |
| JSVision + browser/media adapters | 5 | 1 | 2 | 2 | 3 | 3 | **55** | Unsupported consumer browser host |
| DomTerm integration | 2 | 3 | 2 | 2 | 3 | 3 | **48** | Console architecture, unqualified editor/embed contract |
| Unblessed + xterm | 4 | 1 | 2 | 2 | 3 | 1 | **46** | Alpha host; media and lifecycle work |
| xterm + custom chrome | 1 | 2 | 3 | 1 | 3 | 5 | **44** | Most widgets and editor bridge remain custom |
| TermUI port | 4 | 0 | 1 | 2 | 3 | 2 | **40** | No established browser host |
| OpenTUI port | 3 | 0 | 1 | 2 | 3 | 4 | **39** | Native FFI target; no supported browser backend |
| ROT.js + custom UI | 0 | 1 | 2 | 1 | 3 | 2 | **25** | Missing widget/editor/media infrastructure |
| UnicodeTiles + custom UI | 0 | 1 | 1 | 1 | 3 | 1 | **19** | Missing infrastructure and stale implementation |

The first two scores intentionally credit existing Mutable infrastructure. No standalone library scored as a complete replacement. Media scores for retained-DOM approaches express compatibility, not fresh certification of every iframe/overlay combination.

## 7. Rich content, vectors and screen-to-document mapping

**Verified xterm seam:** `registerDecoration` supports cell-sized rectangles associated with terminal line markers and exposes a DOM element through `onRender`. It is therefore inaccurate to say xterm can never host extra DOM. However, these are terminal decorations: they do not supply document-flow reservation, native Block identity, cross-pane clipping, arbitrary window occlusion or retained iframe lifecycle. Using this seam for media would be **untested custom integration**, not an off-the-shelf island widget. [Decoration API](https://github.com/xtermjs/xterm.js/blob/f70764d/typings/xterm.d.ts).

A Canvas terminal with DOM above it has a particular composition problem: a menu painted in the Canvas cannot automatically cover an iframe in a higher DOM layer. Reserving rectangles is insufficient. The host must reconcile clipping and z-order, keyboard ownership, pointer capture, focus return, media lifetime and asynchronous frame updates. Recreating an iframe on repaint is unacceptable. Terminal image protocols solve neither interactive iframe focus nor this layering problem.

The current DOM approach already lets image/video elements move with document flow. Native menus and modal layers can participate in browser stacking, although iframe focus and overlay cases still warrant real-browser qualification. Cell snapping belongs to the layout boundary, not per-character absolute positioning. Resize/font changes should invalidate the shared metrics; scroll should generally translate the common ancestor rather than trigger per-cell measurement.

For any future cell-rendered Flint adapter, the necessary mapping is:

```text
pointer in CSS pixels
  → active application/pane and clip rectangle
  → viewport-local coordinates plus scroll offset
  → laid-out visual row and display column
  → native Block occurrence and canonical inline boundary
```

**Inference:** a visible-row map would need wrapping, wide-cell continuations, combining sequences, tabs, bidi behaviour, inline objects and Block relationships. A display column, Unicode grapheme, UTF-16 offset and Mutable canonical Cell boundary are not interchangeable. Screen coordinates must never become stored source identities. Reverse mapping is also required for caret rectangles, IME candidate placement, selection and accessibility. Existing native commands, ownership and Undo/Redo remain authoritative.

Vector underlines could be drawn from those row fragments by SVG, Canvas paths or GPU geometry. Multiple overlapping standoff ranges still need lane allocation, clipping and hit-testing; terminal underline attributes describe a flattened cell style and do not preserve independent semantic layers. In retained Textual, continue using `editor.decorations`/`editor.temporaryRanges` and the existing local annotation container. Do not add viewport-fixed per-character highlights or a second decoration engine.

**Optional profiles:** Strict Text Mode and Enhanced Textual could share native document/selection semantics and the same layout. Strict mode could suppress decorative vectors and use explicit media placeholders without removing native content; Enhanced retains vectors and native islands. This is a possible presentation policy, not implemented or a reason to build two editors. Clipboard/source access must retain underlying content in either profile.

## 8. Scrolling and performance

Terminal scrollback stores output history. A Mutable viewport must support edits above the viewport, mixed-height Blocks, persistent source identity and anchor-preserving scroll. JSVision/Unblessed/TermUI supply region scrolling; OpenTUI additionally documents culling. None inspected supplies the complete native Mutable layout or a proved bounded-cost 10,000-line editor.

| Approach | Work it can reduce | Work it does not remove |
| --- | --- | --- |
| Retained DOM | Browser layout, smooth pixel scroll, native input/media, shared local SVG motion | Large mounted trees, wrapping/annotation measurement; generic Block virtualisation remains unqualified |
| Cell Canvas 2D | Glyph drawing and dirty-cell redraw; simple vector paths | Wrapping, native hit maps, text input bridge, widgets, DOM-island composition |
| Cell WebGL2 | Glyph atlas/batching; potentially lower paint cost | Same layout/input/media work plus atlas/font/context lifecycle |
| WebGPU | Potential specialised rendering gains | Browser/backend availability and integration; no qualified full stack found |
| ANSI library → xterm | Terminal widget rendering and browser terminal input | Two rendering representations, byte encoding/parsing, document mapping and DOM islands |

Canvas 2D and WebGL exist in the lower-level baselines; current xterm offers DOM/WebGL2. OpenTUI's WebGPU-related integrations are not a supported browser Textual renderer. There is no evidence here that selecting a GPU backend reduces total editing latency. A 120×45 viewport contains 5,400 display cells and 200×70 contains 14,000; bounded framebuffer size does not bound the cost of laying out or keeping 10,000 lines mounted.

**Measured in this investigation:** 18 existing tests pass across Textual grid, fonts, layout, command menus, application hosting and retained Document presentation. The retained-host test verifies same DOM/owner and no canonical/projection work on presentation transfer. This is deterministic correctness evidence, not frame-time evidence. Command:

```sh
npx vitest run src/features/textual/grid.test.ts src/features/textual/fonts.test.ts src/features/textual/layout.test.ts src/features/textual/command-menu.test.tsx src/features/textual/applications.test.tsx src/application/document-host-presentations.test.tsx
```

**Not measured:** first render, CPU, memory, p50/p95 input latency, dropped frames, continuous scrolling, two-pane/media workloads, resizing or high-DPI performance for any candidate. No candidate passed the adoption gates sufficiently to justify a comparative prototype benchmark. The previous Increment C Chrome run also failed at startup; it is not a Textual performance measurement. The existing [Flint browser benchmark](../../scripts/benchmark-typing-browser.mjs) currently offers Desktop/Spatial hosting options, not a complete Textual comparison harness.

If a future deployment/media gate is resolved, one bounded comparison should use the same in-memory native fixture at both requested display sizes, at least 10,000 wrapped visual lines, overlapping annotations, two scrollports and retained image/video/iframe islands. Separate native transaction time, layout/hit-map updates, buffer writes and paint; measure typing/caret movement, scrolling, menu/dialog occlusion, resize/font zoom and device-pixel ratios 1/2. Count mounts, geometry reads, dirty cells, snapshots and unrelated work as well as browser timings. Use the real Flint typing path; do not infer latency from synthetic glyph throughput or headless frame timing. This is a qualification gate, not a new benchmark project authorised here.

## 9. Estimated integration effort and actual savings

**Inference, low confidence:** rough engineering-person-week ranges for an engineer familiar with Mutable, including targeted interaction/lifecycle checks. These are order-of-magnitude comparisons, not commitments. A full native editor presentation has no credible small estimate before media/input feasibility; ranges below do not imply parity is achievable within them.

| Candidate/route | Configuration or small adapter | Substantial/custom work | Indicative effort / net saving |
| --- | --- | --- | --- |
| Retain Textual | Current fonts/palette/layout | No migration | No migration cost; preserves existing investment |
| Selective Kobalte | Styling, controlled state, native command hooks | Focus/selection and portal placement checks; cell-snap adapter | 1–3 weeks for a bounded menu/dialog family; may avoid a similar order of new interaction work, little saving from rewriting settled UI |
| Optional corvu splitter | Controlled sizes/orientation | Cell snapping, native scroll/focus restoration | Several days to 1 week for one pane; saves splitter mechanics only |
| JSVision | Most terminal chrome and theming | Browser release ownership, DOM compositor, Solid lifecycle bridge, Flint input/layout adapter | 4–8 weeks for host/chrome/media feasibility alone; full Flint likely multi-month; no demonstrated net saving |
| Unblessed | Existing terminal controls, browser bootstrap | Host cleanup/input corrections, media compositor, editor mapping, extra widgets | 4–8 weeks for feasibility/host hardening; full editor additional and uncertain |
| OpenTUI / TermUI | Native-target widgets and themes | Browser backend/host plus all retained-editor/media bridging | At least 6–12 weeks just to establish a credible browser/editor seam; highly uncertain, no net saving established |
| xterm alone | Terminal/font/input foundation | Almost all app widgets plus document layout/media/editor adapter | 6–12 weeks for a partial demonstrator stack; fails the avoid-custom-framework objective |
| ROT / UnicodeTiles | Basic character display | Nearly all UI, editing, accessibility and browser-media integration | Multi-month framework work; saves glyph engine only |
| DomTerm | Console HTML output/panes | Extract or reconcile console ownership, editor mapping, embed lifecycle | Several weeks before editor suitability is known; no demonstrated net saving |
| TuiCss / WinBox | Theme styles / DOM window mounting | Cell policy / competing window-state bridge | Days for cosmetics or a basic window demo; production integration adds weeks without solving the target editor problem |

The economic comparison is against Mutable's **existing** window/session/editor infrastructure, not a greenfield application. Terminal widgets retain genuine value, but much of that value duplicates work already done while introducing a harder media/editor boundary.

## 10. Next step and boundaries

Accept retention of the existing architecture; no production change is proposed by this investigation. For the next independently requested menu/dialog feature, consider a single Kobalte component behind the existing presentation boundary and verify cell alignment, selection restoration, IME, iframe occlusion and focus ownership before wider use. Do not replace all Textual chrome in advance of a demonstrated saving.

Reconsider JSVision only if its browser host becomes a supported consumer package and a small, upstream-supported DOM-island/occlusion contract is available. Mere publication would not settle Flint integration. Do not port OpenTUI or build an overlay/window framework solely to keep a cell-buffer migration alive.

Current large-document rendering remains a separate measurable concern. If profiling demonstrates a bottleneck, investigate bounded native viewport/layout work within the existing editor first, preserving shared geometry, manual saves, canonical validation, selection, Undo/Redo and retained application ownership. No general rewrite, prototype, new abstraction or staged implementation programme was added here.
