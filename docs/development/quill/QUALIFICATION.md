# Quill architecture qualification

Historical investigation record. The accepted architecture has since received a bounded [M0 implementation](M0_IMPLEMENTATION_REPORT.md); consult that report for current production status.

Date: 21 November 2026. Scope: the supplied `QUILL_ASTRA_INVESTIGATION_FEATURE_BRIEF.md` and `QUILL_ASSET_SHEET.md`. This is an investigation with isolated executable prototypes, not a production feature release.

**Recommendation: proceed to a reviewed, staged implementation using native owned TextBlocks; do not approve a full Quill release or adopt a complete external editor yet.** Native conversion, editing, standoff rebasing, independent core copying and manual Ink persistence are demonstrated. Direct editing on the SVG composition, complete shaping, standard clipboard admission and the dedicated application host are still release gates.

The intended product lets the user place the caret, type, delete, select and annotate **on the composition itself**. The native editor displayed beneath the artwork in this experiment is temporary test scaffolding. It is not the proposed finished interaction. Native TextBlocks remain canonical behind that direct editing experience; they do not need to be displayed as a second editor. This records the user's clarification during the investigation.

Status vocabulary: **Verified** means inspected code or a passing named experiment supports the statement. **Proposed** is a design recommendation. **Not demonstrated** means the relevant acceptance criterion remains open; it is not inferred from a screenshot, upstream README or another passing test.

## Delivered evidence and reproduction

- [Prototype source](../../../src/qualification/quill/): a native adapter, original limited layout engine, browser fixture and tests. No production entry point imports it. Its local `qualificationFlags.quill` defaults on; `?quill=off` disables activation in the fixture. No existing feature defaults were changed.
- [Browser runner](../../../experiments/quill/run.mjs), [15 browser checks and raw timings](../../../experiments/quill/evidence/browser-results.json), [11 passing tests](../../../experiments/quill/evidence/tests.txt).
- Screenshots: [Flint composition](../../../experiments/quill/evidence/flint-composition.png), [insert/reflow](../../../experiments/quill/evidence/reflow.png), [native editor/light canvas](../../../experiments/quill/evidence/native-light.png). These are actual prototype captures, not product mockups.
- [Dependency artifact audit](../../../experiments/quill/evidence/dependency-audit.json), [resolved dependency lock](../../../experiments/quill/evidence/dependency-lock.json), [exact upstream source revisions](../../../experiments/quill/evidence/source-revisions.json).
- [Phased implementation brief](IMPLEMENTATION_FEATURE_BRIEF.md) and [experiment instructions](../../../experiments/quill/README.md).

Run from the repository root:

```sh
npx vitest run src/qualification/quill
npx tsc --project experiments/quill/tsconfig.json
node experiments/quill/run.mjs
node experiments/quill/audit-dependencies.mjs
```

For interactive use, run the existing Vite client and open `/src/qualification/quill/browser.html`. The browser runner starts its own local Vite server and temporary Chrome profile. The persistence test starts the real native-store router against a temporary directory and removes it afterwards. No user documents or vaults are saved. The dependency audit installs packages only in a temporary inspection directory, disables lifecycle scripts, and removes the directory afterwards. Project package manifests and the application dependency lock are unchanged.

## Existing-code findings

| Area | Verified evidence | Consequence for Quill |
|---|---|---|
| Canonical model | [`ContentRecord`, `PlacementRecord`, `BlockTypeRegistration`](../../../src/block-tree/types.ts), [`CanonicalRepository`](../../../src/block-tree/repository.ts) | A composition can be an ordinary authored container with owned native children, payload and native history. It does not need its own document format. |
| Current text representation | [`CompactInline`, `logicalInline`, `inlineLength`, `replaceCompact`](../../../src/block-tree/inline-sequence.ts), [`BlockTreeProjection.acquireCompactInline`](../../../src/block-tree/projection.ts) | Native positions count Unicode code points or inline objects. Compact text has no permanent canonical Cell per character; mounted editing Cells are projections. Do not promise Cell UUID anchors where none exist. |
| Legacy compatibility | [`decodeBlockTree`, `decodeDetachedSubtree`, `encodeDocument`](../../../src/block-tree/codecs.ts) | Legacy Cell-backed text and current compact text need the same logical source adapter. The prototype tests both. Arbitrary new relation names are not decoded as owned relations by the legacy codec; `children` is the established safe container route. |
| Editing/history | [`TreeCommands.replaceInlineRange`, `setPayloadField`, `structuralTransaction`, `move`](../../../src/block-tree/commands.ts); [`structuralChangeFor`](../../../src/block-tree/structural-plan.ts) | Use native operations, one atomic conversion, and affected-record admission. Do not create a Quill undo stack or assume every generic transaction is cheap. |
| Standoff | [`mapStandoffPropertiesForReplacement`](../../../src/interchange/ranges.ts), [`linkedAnnotations`](../../../src/block-tree/linked-annotations.ts), [`GLOSS`](../../../src/features/gloss/model.ts) | Ordinary ranges use inclusive `end`; layout spans use half-open ranges. Gloss content/identity belongs in the native Document's linked definition registry, with segment properties referencing it. |
| Selection | [`TextSelectionItem`, `ViewPosition`](../../../src/block-tree/types.ts), [`TextRanges`](../../../src/runtime/text-ranges.ts), [`graphemeBoundaries`](../../../src/input/graphemes.ts), [`CurrentTextOperation`](../../../src/runtime/current-text-operation.ts) | Carry source identity, occurrence, revision and coordinate convention. A range snapshot is a stale-checkable selection, not an automatically rebasing durable anchor. |
| Input | [`InputGateway`](../../../src/input/gateway.ts), [`standoff editor view`](../../../src/rendering/standoff-editor-view.tsx), [`direct character cells`](../../../src/rendering/direct-character-cells.ts) | Preserve native keyboard, selection, IME and undo semantics. Direct SVG input is a new presentation adapter to this path, not a textarea string synchronized to another store. |
| Geometry/decorations | [`MeasurementService`](../../../src/runtime/measurements.ts), [`SessionDecorations`](../../../src/runtime/session-decorations.ts), [`ReactiveEditor.temporaryRanges`](../../../src/reactive-editor/editor.ts) | Retained occurrence-local range geometry already accounts for generation, revision, width, scale and explicit invalidation. Extend the shared geometry/decorations path for curved ranges; do not build a second transient highlight renderer. |
| Design reference | [`editor-new-2.js`](../../../src/library/original/modules/speedy/editor-new-2.js) | Retained cell offsets and previous/current comparisons remain the design target. The current measurement service is not a complete equivalent per-cell cache. |
| Ink persistence | [`captureNative`, `nativeBytes`, `admitNative`](../../../src/persistence/native-resource.ts), [`NativeDocumentSession`](../../../src/persistence/native-session.ts), [`createDocumentSave`](../../../src/application/document-save.tsx) | Quill opens the same resource and uses the same manual save coordinator and opened filename. Geometry edits mark the same Document dirty. Return is not Save; no automatic Markdown output. |
| Clipboard | [`captureBlocks`, `cloneBlocks`, `remapKnownBlockReferences`](../../../src/block-tree/clipboard.ts), [`serializeSelection`](../../../src/interchange/serializer.ts), [`materializeFragment`](../../../src/interchange/materialize.ts) | Internal Block copy and system clipboard admission are different boundaries. Core copy reassigns Block, placement and property identities. The standard materializer currently wraps this new type as `mutable/opaque-block`. |
| Render registry/fallback | [`BlockRegistry`](../../../src/block-tree/registry.ts), [`BlockOutlet`, `ChildBlocks`](../../../src/rendering/block-outlet.tsx), [`UnknownBlockView`](../../../src/rendering/unknown-block-view.tsx) | A registered container can render in both hosts. Without its renderer, a native unknown Block exposes retained children; an opaque clipboard carrier is intentionally more restricted. |
| Mixed documents/pages | [`core Block views`](../../../src/rendering/core-block-views.tsx), [`page layout`](../../../src/rendering/page-layout.ts), [`Document formats`](../../../src/features/document-formats/model.ts) | Existing `document-block`, `page-block`, `fixed-size-page-block`, tables, media and other registered native types remain ordinary content. Quill must delegate those views instead of filtering them from its document. |
| Application host | [`DocumentApplicationCapabilities`](../../../src/feature-api/document-application.ts), [`documentApplicationCapabilities`](../../../src/application/document-application-capabilities.tsx), [`Flint feature`](../../../src/features/flint/index.tsx) | The public registration accepts an application ID, but the private implementation still registers **`flint.open`** and Flint-specific tab/UI behavior. Registering a second app unchanged would collide. This needs a small host generalization, not a copy of the whole Flint adapter. |
| Window/Instrument hosting | [`WorkspaceSession`](../../../src/application/workspace-session.ts), [`window manager`](../../../src/application/window-manager.ts), [`Cardex host`](../../../src/application/cardex.tsx), [`Instrument presentations`](../../../src/rendering/instrument-presentations.ts) | Existing managed windows, application presentations and contextual Instruments provide precedents. The brief's `mutableApps.open` is pseudocode, not a verified universal API. |
| Previous name | [`desktop-applications.tsx`](../../../src/application/desktop-applications.tsx) contains an **Acetate placeholder** | Quill supersedes that name in the proposed implementation. This investigation does not silently rename persisted application identifiers or ship a production launcher. |

### Initialis qualification

**Verified:** [`InitialisController`](../../../src/features/initialis/controller.ts) only accepts one supported uppercase Latin character, authors a `style/character-surface` property and delegates to [`InitialisService`](../../../src/features/initialis/service.ts). That service uses a worker, bitmap/blob leases, caching, visibility priorities and cancellation. The shipped adapter is a still-image decorative character surface; it does not provide paragraph shaping, linked-path flow or curved caret mapping.

The [vendored manifest and notices](../../../public/vendor/initialis/README.md) pin upstream `azlen/initialis` to `6cf93f7d3d2922efdbeb86cafa27f39758be9398`: 25-file, 194,592-byte subset, MIT code, and Cormorant Garamond uppercase outlines under OFL-1.1. Several decorative fonts were deliberately excluded. Reuse its lifecycle/resource patterns and optionally its qualified illuminated capitals. Do not make it Quill's text-layout engine or treat its bitmap output as canonical text.

## Architecture decision

| Option | Advantages | Cost and qualification outcome |
|---|---|---|
| A: adapt a headless vector/text engine | Existing shape/path editing or attributed text, sometimes hit testing and caches | Pixerate and xsvg have their own text/style/layout contracts; Textkit has glyph/run machinery. Every adapter still needs native selection, history, ownership, standoff and invalidation mapping. None of the inspected code establishes all required shaping and multi-path semantics. Importing an entire editor risks a second state/history system. **No-go for whole-editor adoption.** |
| B: native composition + narrowly selected modules | Preserves authoritative text and native commands; geometry and effects are derived resources; fits existing Solid views | Mutable must own incremental flow, canonical reverse mappings and direct canvas input. Shaping remains substantial work. **Recommended**, with a future shaping spike allowed to select a headless library if it proves the needed contract. |

The experiment deliberately uses original, limited Latin layout code with browser Canvas measurement. It demonstrates native ownership and fitting dependencies; it is not the proposed production shaper.

### Ownership alternatives

1. **Owned native TextBlock children — recommended default.** Move the source paragraph under the composition in one transaction. The TextBlock's authored ID, canonical content key, standoff segments and Gloss definitions stay intact. Copy clones the owned closure, while native definition transfer handles linked annotations. Deleting the wrapper follows ordinary native deletion/retention rules; unwrap can restore children subject to existing sharing guards. Native pages own compositions as they own other Blocks.
2. **References to external or sibling text — deliberate later mode.** Avoids moving content, but creates dependencies on another owner, source availability, deletion, versioning and cross-document provenance. Copy must either detach text explicitly or retain a deliberate reference; it must not silently become shared. Cross-document transclusion is not qualified by this prototype.
3. **Document-wide layout container over arbitrary native children — useful for a later studio.** Delegates mixed content and page views, with composition tools targeting selected composition Blocks. It must not become a second pagination/document representation.

**Proposed type:** `mutable/svg-text-composition-block`, a container rather than a new implementation of `standoff-editor-block`. The repository has mixed historical names and newer first-party `mutable/...` names such as structured-resource, PDF and Gloss types; there is no universal `quill/` naming requirement. The proposed name is used only in the experiment and remains subject to schema review. Use the existing Block registry, not a parallel Quill type registry.

### Qualified schema boundary

Canonical native children contain all text and annotations. The wrapper stores versioned viewport, paths, ordered flow, effects and layer data. Derived placement arrays, Canvas widths, caret geometry, zoom, active tools, selection and return context are not persisted.

The prototype uses one flow, with `quill.sourceRole = 'primary'`. A native `codex/block-reference` Block property points to the owned source and carries `metadata.quillRole = 'primary'`. That role is local to the wrapper and is not an identity. `cloneBlocks` remaps the referenced Block ID and independently regenerates property IDs; the local role still resolves correctly. This is tested with an independent copy and edit in another Ink document.

Do **not** persist arbitrary `textSources[].blockId` or property IDs and assume native clipboard remapping will discover them. Production should review whether this established reference property is the appropriate semantic carrier or whether to extend the existing known-reference contract narrowly. Both the type and its property schema need validated standard clipboard support. The current proof is not a license to bypass that admission boundary.

The prototype supports whole paragraphs and rejects changed/unavailable/shared sources. Selection-to-composition requires native split/extraction with explicit affinity and overlapping-range tests. `compose-from-selection` should create an independent native copy, retain the original and explain the difference from conversion. Neither behavior should copy text into a Quill-owned string field.

### Text, shaping and reverse mappings

**Proposed production contract:** a versioned canonical source slice plus styled runs, script/direction/language/font identity, flow geometry and effects produces derived line fragments, shaping clusters, caret stops, hit regions and overflow ranges. Each cluster maps to a half-open canonical range. Map UTF-16-based library offsets to native code-point/object offsets in a retained source index; never count every prefix on each hit test.

Graphemes and glyph clusters are different. `fi` may share one glyph; one grapheme may contain several code points; RTL visual order differs from logical order. Complex-script shaping must process sufficient run context before fitting. Split at valid break opportunities, never inside a cluster; support both caret affinities around reordered or ligated runs. Glyph IDs/outlines may be transient rendering or publication data, never the only saved text representation. Browser-shaped SVG text runs are an option, but their caret mapping and arbitrary per-cluster effects still require evidence.

Layout-affecting size, tracking and variable-font axes participate in shaping/advance measurement and line fitting. Opacity and other visual-only transforms must not change line allocation. For a position-dependent swell, evaluate size at positions within path arc length and fit consistently; production needs a defined convergence policy if shaping/optical-size changes feed back into fitting. Do not equate the experiment's linearly scaled Latin widths with that solution.

## Library and licensing audit

The named leads were inspected at the exact commits in [source-revisions.json](../../../experiments/quill/evidence/source-revisions.json). The table links directly to those revisions. No external implementation code was copied into the product or prototype, and no candidate is approved for production adoption.

| Candidate / exact source revision | Version and licence evidence | Implemented reuse boundary and decision |
|---|---|---|
| [Pretext](https://github.com/chenglou/pretext/tree/6ed1edd294698374ab2fb0d3eb36276527084879) | `@chenglou/pretext` **1.0.0**; [LICENSE](https://github.com/chenglou/pretext/blob/6ed1edd294698374ab2fb0d3eb36276527084879/LICENSE): MIT plus upstream BSD-3-Clause, BSD-2-Clause, Unicode-3.0 and ICU notices. Preserve the complete file, not only the MIT paragraph. | `src/layout.ts`, `prepare.ts`, `measurement.ts`, `line-break.ts`, `rich-inline.ts` implement measured/prepared text and line walking, including segmented cursors and rich inline layout. Zero declared runtime dependencies, no React/Svelte/Vue runtime. Useful line-fitting candidate; not a curved glyph-placement/caret engine. Current source pushed 19 Nov 2026. Shortlist for measurement/line breaking, pending shaping adapter and browser comparison. |
| [Folio Textkit](https://github.com/foliojs/textkit/tree/2f8963734a1e04d078cfea390192e130999387b6) | Root manifest **0.1.0**, MIT declaration. No root licence file was found in the inspected root listing. Root depends on `babel-runtime ^6.26.0` and `pdfkit ^0.8.0`. | Original multi-package text framework. Last reported push 21 Feb 2019. No redistribution clearance from a manifest alone; no runtime/bundle qualification performed. Do not select this historical source. Assess the maintained headless fork separately. |
| [React-PDF Textkit](https://github.com/diegomura/react-pdf/tree/f765c957902eb1f0d15b1571d6f61e5818e8bc50/packages/textkit) | `@react-pdf/textkit` **7.0.1**; repository [MIT LICENSE](https://github.com/diegomura/react-pdf/blob/f765c957902eb1f0d15b1571d6f61e5818e8bc50/LICENSE). Published Textkit/fns/hyphenate archives lack their own licence files in this audit: ship upstream notices if selected. | `layout/generateGlyphs.ts` calls supplied font objects' `layout`, retains positions and string/glyph mappings; `bidiReordering.ts` and `typesetter.ts` handle attributed paragraph layout. The audited runtime tree has **no React runtime**, despite the package name. Font shaping is supplied separately; fontkit is not magically bundled by this package. Repository pushed 16 Nov 2026. Shortlist for shaping/run-adapter experiment, not wholesale PDF rendering. |
| [SVG.js](https://github.com/svgdotjs/svg.js/tree/4b8809b1554c44a84f8992cdbda60480336cc040) | `@svgdotjs/svg.js` **3.2.8**; [LICENSE.txt](https://github.com/svgdotjs/svg.js/blob/4b8809b1554c44a84f8992cdbda60480336cc040/LICENSE.txt), MIT; zero runtime dependencies. | `src/types/PathArray.js`, `src/utils/pathParser.js`, element modules support SVG geometry/DOM manipulation. `PathArray.bbox()` uses a DOM parser path and `getBBox`; it is not inherently layout-free. No shaping/linked flow. Source pushed 4 Aug 2026. Avoid a second owner of Solid's SVG DOM; consider only narrowly extracted pure geometry if a demonstrated need remains. |
| [Charming Pretext](https://github.com/charming-art/charming/tree/91db8115a88d1e093fcfc045b9ba14afb4730406) | `charmingjs` **0.1.0**; [License](https://github.com/charming-art/charming/blob/91db8115a88d1e093fcfc045b9ba14afb4730406/License), MIT, plus dependency notices. | `src/util/text/layoutTextInPath.js` flattens a closed path, hachures it and calls Pretext `layoutNextLine`; this is **straight fragments inside a shape**, not glyphs following a curved baseline. Default `repeat=true` must not duplicate canonical content. Source pushed 19 Nov 2026. Candidate for region-fitting ideas, not a full engine. |
| [xsvg](https://github.com/visioncortex/xsvg/tree/48ec313160babbef86ff4352d3059f27b5eccfda) | `xsvg-core` **0.3.0**, [MIT LICENSE](https://github.com/visioncortex/xsvg/blob/48ec313160babbef86ff4352d3059f27b5eccfda/LICENSE). Pure Rust core, WASM host in the workspace. | `crates/xsvg-core/src/text/{measure,wrap,region,area,outline}.rs`, `spline.rs`, `warp.rs`: geometry, text fitting and a host-supplied `Measurer`. The measured/outline provider is a seam, not proof that a native complex-script shaper ships. Core manifest includes gradient/schema, i_overlay, i_shape, kurbo and optional compiler dependencies. Pushed 19 Nov 2026. Defer: Rust transitive licence closure, WASM size/startup and actual shaping adapter remain unqualified. Do not adopt its extended SVG document as native storage. |
| [Hector Vector](https://github.com/asuramaya/hector-vector/tree/42f0427f0122d38b51f16a6eae5fb6b9808200b0) | `VERSION` **1.3.0**; [MIT LICENSE](https://github.com/asuramaya/hector-vector/blob/42f0427f0122d38b51f16a6eae5fb6b9808200b0/LICENSE). Browser editor uses local ES modules; desktop Python/AI tool dependencies are a separate, unqualified closure. | `src/editor/tools/{text,node,pen}.js` contain real path/node editing and SVG text-on-path. Text tools use a temporary DOM editor and warn when complex-script outlining lacks shaping. Node tools depend on editor state, `app.js`, snapshots and stage queries. Source pushed 5 Sep 2026. Reference for interaction design; reject whole-editor/history adoption. Desktop fonts/models, bundle and performance are not qualified for reuse. |
| [Pixerate](https://github.com/Pixerate/editor/tree/21e6276362f37f27b9438bf2b532e4bb83515e5f/packages/core) | `@pixerate/editor` **0.343.0** source manifest; [MIT LICENSE](https://github.com/Pixerate/editor/blob/21e6276362f37f27b9438bf2b532e4bb83515e5f/LICENSE), plus [THIRD_PARTY_NOTICES](https://github.com/Pixerate/editor/blob/21e6276362f37f27b9438bf2b532e4bb83515e5f/packages/core/THIRD_PARTY_NOTICES.md) for ported ArtCraft algorithms. Preserve the applicable MIT notices and per-file provenance; do not discard them because source was translated. | `src/vector/{text,pathEdit,geometry}.ts`, `src/text/{layout,shapers,types}.ts` implement path measures, handle operations, text/caret geometry and Canvas/outline/metric providers. Core has no declared regular dependencies; listed Tiptap/Markdown/Three peers are optional. React/Svelte are separate packages. The text model uses UTF-16; isolated character operations in some spaced/outline paths still require cluster qualification. Pushed 21 Nov 2026. Most promising selective geometry donor, but neither the vector export closure nor full shaping/bundle/performance is cleared by this source audit. |

**Maintenance evidence is a source snapshot, not a promise of future support.** Push dates above come from GitHub metadata; they do not establish that every inspected module was recently changed.

### Resolved package closure and measured sizes

The audit resolved and integrity-checked **23 published package records** for four candidates. Exact nested versions, dependencies, peers, tarball URLs, integrity values, licence-file digests and assets are in the JSON and lock. Repository HEAD and published package artifacts are explicitly separate evidence.

```text
@chenglou/pretext@1.0.0 → no runtime dependencies
@svgdotjs/svg.js@3.2.8 → no runtime dependencies
@react-pdf/textkit@7.0.1
  → @react-pdf/fns@3.1.3
  → @react-pdf/hyphenate@0.1.0 → hyphen@1.6.6
  → bidi-js@1.1.0 → require-from-string@2.0.2
  → unicode-properties@1.4.1
      → base64-js@1.5.1
      → unicode-trie@2.0.0 → pako@0.2.9, tiny-inflate@1.0.3
charmingjs@0.1.0
  → @chenglou/pretext@0.0.4 (not 1.0.0)
  → d3-color@3.1.1, d3-path@3.1.1
  → figlet@1.12.0 → commander@14.0.3
  → hachure-fill@0.5.2
  → points-on-path@0.2.1 → path-data-parser@0.1.0, points-on-curve@0.2.0
```

All these manifests declare MIT or ISC; **that is not a complete asset/data licence clearance**. In particular, Pretext includes upstream data notices; Figlet ships 332 `.flf`/`.tlf` assets that were inventoried but not individually cleared; hyphenation/Unicode data also need their specific notices retained. No downloaded font or ornament is included in Quill. The prototype uses the machine's Georgia via the browser without redistributing it. A production bundled-font set requires a pinned, font-specific OFL/permissive licence inventory and fallback tests.

Measured with the repository's esbuild, browser target ES2022, minification, ESM, `export *` from the published entry, no application adapter:

| Package | Minified complete export bundle | Gzip | Performance evidence |
|---|---:|---:|---|
| Pretext 1.0.0 | 94,425 B | 39,936 B | Not run in the Quill fixture; upstream speed claims are not treated as measured evidence. |
| Textkit 7.0.1 | 95,424 B | 47,220 B | No font provider/adapter included; shaping and reflow timing not demonstrated. |
| SVG.js 3.2.8 | 92,986 B | 30,886 B | DOM geometry cost not benchmarked here. |
| Charming 0.1.0 | 198,572 B | 69,444 B | Region-fitting timing not benchmarked here. |

These sizes are reproducible whole-export comparisons, not incremental app bundle costs. Tree shaking a selected function may reduce them; a shaping engine, font and adapter may increase them. Folio, xsvg, Hector and Pixerate have **no measured production bundle or Quill performance result** in this investigation. Their source-level audit does not close the brief's full dependency/performance gate. No GPL/AGPL dependency was selected; any future LGPL/MPL finding requires a separate decision. A missing licence or incomplete closure means defer reuse, not presume permissive terms.

## Prototype results

| Hard scenario | Result and evidence |
|---|---|
| Flint paragraph becomes a composition and returns in place | **Verified in prototype** in the real Flint shell, with explicit conversion confirmation. Same native TextBlock content identity, and legacy Cell placements where applicable; one conversion undo restores the original structure. Quill's inspector is an isolated panel, not a finished managed app window. |
| Native editor uses the same invocation | **Verified in prototype.** The same `invoke`/`convert` adapter handles both host labels and the same native source. No production command/menu is registered. |
| Regular native Blocks plus several composition Blocks | **Verified at model/Ink level** with ordinary paragraphs and three independently owned composition instances across documents. Both registered browser hosts render a composition alongside ordinary content. Full multipage/media studio navigation is **not demonstrated**. |
| Insert/delete in first of three wave paths | **Verified for the Latin proof.** Native text edits reflow downstream placements; undo restores placement output. Overflow is explicit and retains source text. Direct SVG typing is **not demonstrated**. |
| Geometry changes without text mutation | **Verified for sine amplitude**, including native undoable payload edits and no broad planning/full validation in the browser probe. Bézier-handle authoring is **not demonstrated**. |
| Font envelope affects fitting; opacity does not | **Verified for the limited centre-swell fitter.** A visual-only opacity edit performs zero fitter calls. True variable-font/complex-script envelope shaping is **not demonstrated**. |
| Entity mentions, Glosses, overlaps | **Verified native rebasing and copy:** entity segment, linked `mutable/gloss` definition/segment and overlapping italics persist. Copy creates independent segment/definition identities. A new native annotation can be applied after conversion and saved/reopened. Full curved annotation overlays and multi-cluster visual selection are **not demonstrated**. |
| Copy/paste editable geometry and text | **Verified via native Block core** into another Ink document, with independent edits and remapped Block references. **Known gap:** standard clipboard serialization/materialization produces `mutable/opaque-block`; a test records this current behavior. OS clipboard active editing acceptance is not passed. |
| Mixed document persistence | **Verified:** real native coordinator/server writes only on explicit Save, to the opened `.ink` filename, retains geometry/text/annotations, and reopens equivalent native content. No sidecar or background request during edits. Browser fixture itself keeps persistence disabled. Keyboard routing is inherited but a Quill-specific Command-S route is not yet demonstrated. |
| Permissive framework-neutral runtime | **Prototype uses existing repository/browser primitives only.** Four dependency trees have no React/Svelte/Vue runtime; other leads have source-level evidence. No production engine has passed the entire adoption gate. |

The ten model/layout tests plus one real-store persistence test are in [quill.test.ts](../../../src/qualification/quill/quill.test.ts) and [persistence.test.ts](../../../src/qualification/quill/persistence.test.ts). The latter exercises edits, geometry, new annotation, dirty status, unchanged on-disk bytes before Save, explicit save, absence of Markdown sidecars and reopen equality.

### Unicode result matrix

| Case | Verified | Not demonstrated |
|---|---|---|
| Latin prose | Three linked paths, word displacement, overflow, centre swell | Kerning across placed graphemes and full styled shaping |
| `Aé👩‍💻Z` | Grapheme-to-native ranges `[0,1)`, `[1,3)`, `[3,6)`, `[6,7)` | Emoji placement/shaping; it is rejected visibly by the limited renderer |
| `office` | Explicit ligature warning | Ligated glyph-to-caret mapping |
| Arabic `مرحبا`, Hebrew `אבג`, Devanagari `नमस्ते` | Source remains intact; diagnostic and overflow returned instead of silently placing isolated characters | Shaping, bidi visual/logical mapping and direct editing |
| Overlapping entity/Gloss/italics | Native range rebasing, source identity and linked-definition copy semantics | Complete curved SVG decoration/caret geometry |

No one-Cell/one-glyph equivalence is asserted. Grapheme segmentation passing does not qualify shaping.

### Performance evidence and limits

Browser: **Chrome 157.0.8103.80**, headless macOS, 1× device scale, 1450×1000 viewport. The fixture has a 173-character source paragraph, three 710-unit wave paths, a second ordinary paragraph and native standoff content. See raw data for exact timings and browser revision.

The original fitter's 200 measured alternating base/inserted-source runs, after 20 warmups, yielded **p50 0.10 ms, p95 0.20 ms, maximum 1.00 ms**. This is JavaScript source-read/layout time with cached glyph advances; it excludes SVG paint and is not a text-input latency guarantee. Geometry uses a 512-segment arc-length approximation, not exact analytic arc length.

The runner reuses `experiments/initialis-adapter/browser.js`'s **real Flint typing benchmark probes**, without changing those files. Each before/after sample includes 20 handler-driven events and 20 trusted CDP `x`/Backspace events on the actual mounted native source. It checks final text and caret restoration.

| Metric | Before conversion | After conversion with Quill layout active |
|---|---:|---:|
| Handler p50 / p95 | 2.00 / 7.20 ms | 1.70 / 2.10 ms |
| Handler + queued caret p50 / p95 | 3.20 / 8.50 ms | 2.80 / 3.30 ms |
| First-frame p50 / p95 | 16.75 / 17.70 ms | 16.75 / 24.50 ms |
| Trusted input full validation / broad planning / snapshots / requests | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Trusted input projection rebuilds / paragraph DOM walks | 0 / 0 | 0 / 0 |
| Trusted input element rect reads / range rect reads | 40 / 20 | 40 / 20 |

This small sequential sample does **not** establish a speedup; warmup and scheduling confound that comparison. Headless frame timing is diagnostic, not human-visible latency. Long documents, many open compositions and low-end hardware remain unqualified.

Bounded-work tests compare 0 versus **500 unrelated Blocks**, install getters on unrelated payloads, reject full repository snapshots and inspect affected-record publications for typing/undo/redo. All report zero unrelated payload reads/snapshots and one affected source record per text operation. A mounted edit also reports zero network requests, broad planning and full validation. Geometry edits separately report zero broad planning/full validation. The real-store test verifies conversion, geometry, text and annotation edits do not snapshot or send persistence requests.

The prototype subscribes only to its source and wrapper changes, coalesces rendering into one animation frame, retains wave geometry and fixed-font advances, and skips opacity reflow. It still resegments/reflows the **entire affected source Block** and replaces its derived SVG output. Cache keys and font-load invalidation are explicit; screen scaling uses the SVG viewBox, so scrolling performs no curve measurement. There is no new viewport-fixed text-highlight layer. A production engine must add downstream line-fragment convergence, shared measured geometry across occurrences/consumers, stale async cancellation and unchanged-output reuse. The prototype's per-canvas metric cache is not the final shared-cache design.

## Proposed UI and integration map

| Product component | Existing host/reuse boundary | Required new work |
|---|---|---|
| Quill app/window and tabs | `WorkspaceSession`, managed window/application presentations, `DocumentApplicationInstance`, `TransientDocumentView` | Generalize the Flint-only launch registration, register Quill without duplicate command IDs, expose invocation/bookmark ports. |
| Full mixed-document navigator | Native document/page/container views and BlockOutlet | Select composition targets without filtering out other native Blocks; page/artboard inspector. |
| Direct editing canvas | Existing native text commands/input, canonical ranges, layout output | SVG hit mapping, caret movement/selection, IME adapter, accessibility text surface, drag selection and shaped runs. This is required before calling the editing experience complete. |
| Contextual instrument | Shared invocation service from TextBlock/block actions and command palette; Cardex Instrument precedent | Convert versus compose choice, stale-source guard, source window/bookmark return and standalone mode. |
| Toolbox | Existing Solid controls and feature action conventions | Select, Text, Path, Shape, Frame, Ornament, Annotation, Points, Transform, Arrange, Hand, Zoom; original accessible vector icons. |
| Inspector | Native style/annotation controls plus composition-scoped payload commands | Text, Path, Flow, Effects, Layout, Semantics and Assets tabs; controls derived only from selected source data. |
| Bottom dock | Existing native Block/resource semantics | Layer order/visibility/lock, local path and effect presets, user ornament library. |
| Save/status | `createDocumentSave` + `NativeDocumentSession.isDirty` | Active-document keyboard route in the Quill host; Return leaves dirty content intact and does not save automatically. An explicitly labelled Save and Return may invoke the same save route. |
| Inline composition elsewhere | Shared registered composition renderer | Readable native fallback and `Edit in Quill` action in Flint and other native editors. |
| Publication export | Existing export policy/resource retention concepts | SVG/PNG first; separate PDF fidelity decision. Export never replaces the native Block or clipboard representation. |

The seven PNG names in the asset sheet were not present at their referenced sibling paths in Downloads, and no images were attached to the conversation. Therefore no claim is made that their pixels were inspected or matched. The written direction was followed for the experiment's restrained chrome and light/dark canvas. The approved identity direction, Raven composition, path/effect thumbnails, original vector icons and ornament designs remain production design inputs. Do not embed the concept rasters as controls or claim that they are editable vectors. Reusable original vector assets should carry the repository's permissive licence and documented provenance; imported user ornaments retain their own attribution.

## Proposed invocation, Save, return and copy sequences

```mermaid
sequenceDiagram
  participant H as Flint / native editor
  participant Q as Quill invocation service
  participant N as Native commands / repository
  participant W as Window and Document host
  H->>Q: Source Document, placement, occurrence, versioned range, bookmark
  Q->>N: Resolve identities, ownership, range and revision
  Q->>W: Open transient Quill editing session
  Note over Q,N: Opening or cancelling does not convert source content
  H->>Q: Confirm convert (or independent compose)
  Q->>N: One native structural edit; own original TextBlock or copy closure
  N-->>H: Same Document changes; cheap dirty state
  N-->>Q: Affected source/geometry invalidation
  Q->>Q: Derived flow and caret geometry
```

```mermaid
sequenceDiagram
  participant U as User
  participant Q as Quill
  participant P as Native persistence coordinator
  participant H as Originating host
  U->>Q: Command-S / Control-S or Save
  Q->>P: Save active Document to opened binding
  P->>P: Explicit snapshot, validate and persist Mutable JSON
  P-->>Q: Saved generation or error; newer edits remain dirty
  U->>Q: Return to editor
  Q->>H: Reveal origin; resolve current bookmark and selection
  Note over Q,H: Return alone does not write a file
```

```mermaid
sequenceDiagram
  participant Q as Quill composition
  participant C as Native clipboard
  participant D as Destination Document
  Q->>C: Serialize owned Block closure and linked definitions
  C->>C: Validate version/type/resources; remap known references
  C->>D: Independent copied IDs, text, paths, annotations
  Note over C,D: Standard clipboard admission still needs Quill type qualification
  Q->>D: Separate explicit reference command (later milestone)
  Note over Q,D: References preserve declared native provenance, never implicit sharing
```

## Compatibility, security and accessibility

**Migration proposal:** version only the composition payload, preserving ordinary Ink resource identity and native child storage. Admit old versions with a pure, tested migrator; refuse unknown future active semantics while retaining the native subtree. Do not migrate every existing document or convert it to SVG. Disabling the feature must retain the unknown container/children and allow lossless Ink saving. Add explicit clipboard capability/schema admission rather than globally allowing arbitrary custom Blocks. Acetate workspace/application aliases require a separate compatibility decision; no existing files were renamed here.

**SVG/resource proposal:** import a parsed allowlisted SVG subset, not raw `innerHTML`. Reject scripts, event handlers, `foreignObject`, remote document loads and unapproved URL schemes; bound element/path/filter/image/font complexity. Rewrite local IDs/references within an imported resource; use managed asset identities with explicit local/external provenance. Validate finite geometry, bounded numeric controls and supported versions before authoring. User-provided SVG requires separate malicious-input tests. The prototype only generates numeric paths and text nodes; it is not an SVG import-security demonstration.

**Exports:** an SVG publication may use text/textPath with font references or deliberately outline glyphs when requested, but that loses native semantics unless a separate native file is retained. PNG is raster; PDF shaping, clipping, filters, transparency, gradients and font embedding vary by exporter. Font embedding rights must be checked per font. No SVG/PNG/PDF export is implemented by this experiment.

**Platforms:** Canvas/SVG font fallback, kerning, ligatures, hinting, `Intl.Segmenter`/Unicode version, font-load timing, zoom and transform math need Chrome/Firefox/Safari tests. This experiment only ran Chromium. Require deterministic canonical source/ranges even when visual metrics vary. Reflow after fonts become available must invalidate relevant metrics without changing source or history.

**Accessibility:** all future path handles need keyboard focus, coordinate entry, constrained arrow movement and undo. Sliders need labels, value feedback and commit/cancel semantics. Expose canonical reading order independently of visual path order, accessible text input and selection, overflow/shaping announcements, sufficient contrast and reduced motion. Canvas-only pointer editing is not sufficient. The prototype provides labelled keyboard-operable controls and native text input, but no screen-reader audit, focus-trapped managed Instrument or keyboard Bézier tool is claimed.

## Risks and decision gates

| Risk | Severity | Required evidence/mitigation |
|---|---|---|
| Direct canvas input loses IME, caret affinity, selection or undo | Critical | Native input adapter with trusted browser typing/composition tests, mapped curved caret and selection, no duplicate text state. |
| Complex shaping broken by one-grapheme placement/effects | Critical | Arabic/Indic/RTL, combining marks, ligatures and mixed-direction shaping corpus with reverse canonical mapping. Limited prototype diagnostics are not product support. |
| Generic document application adapter is actually Flint-specific | High | Minimal shared host generalization; both apps register simultaneously, same Document session/save behavior and window return tests. |
| Active standard clipboard support missing | High | Type/property schema validation, capability/fallback behavior, independent copy and explicit reference semantics through the real transport. |
| Geometry effects reflow too much or block typing | High | Downstream convergence, shared caches, cancellation; real Flint benchmark plus affected-record/layout-read counts at large source/open-document sizes. |
| Source selection becomes stale during contextual edit | High | Revision/ownership verification, rebasing bookmarks from native operations, reject ambiguous source, separate confirmable conversion from opening. |
| Imported SVG/font/ornament executes code or has unclear rights | High | Allowlisted parser, bounded resource work, pinned licence/asset closure and notices before any source reuse. |
| Saving or Return creates unintended files | High | Existing manual save route, same opened filename, no sidecar/background Save, per-document dirty tests. Basic native path is now verified. |
| Curved publication differs across browsers/exporters | Medium–high | Cross-browser font/geometry fixtures and explicit export limitations. |
| Prototype schema overcommitted too early | Medium | Review owned children, local source role and native reference carrier before adding production fields/migrations. |

**Go:** review the owned-child architecture and begin the bounded implementation milestones in the companion brief. **No-go:** a full Quill launch, replacement of Flint's editor, a parallel `.svgdoc`, adopting a heavyweight editor, claiming direct SVG editing/complex shaping complete, or declaring any candidate fully licensed/performance-qualified without closing its outstanding audit items.
