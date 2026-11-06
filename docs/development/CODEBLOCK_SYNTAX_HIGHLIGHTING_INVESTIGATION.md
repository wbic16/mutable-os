# CodeBlock syntax highlighting investigation

2026-11-06 · Investigation only; no production changes or dependency installation.

## 1. Executive assessment

**Lezer integration is small; the requested feature against the current named CodeBlock is medium.** Two concrete findings prevent treating it as just a tokenizer plus standoff registration:

1. The reactive `code-mirror-block` edits a string in a native textarea. It does **not** contain the editable standoff TextBlocks assumed by the brief. A textarea cannot display differently coloured substrings through Mutable's Cell renderer.
2. Existing transient ranges provide the correct ownership and persistence separation, but bulk publication is expensive: 700 syntax ranges took approximately **50 ms** to publish in the focused browser probe. Even an identical replacement took **38 ms**. Parsing and classification together took approximately **1.5 ms**.

Imported Markdown fenced code already uses standoff TextBlocks and is a useful smaller target. It is not equivalent to fixing the named CodeBlock, and it has a separate newline/context issue described below. Recommend deciding that host boundary, then proceeding directly to one bounded implementation increment with targeted publication improvements. Another broad investigation is unnecessary.

## 2. Existing architecture

| Area | Actual behaviour and source |
|---|---|
| Reactive CodeBlock | [`register-core-views.ts`](../../src/rendering/register-core-views.ts) registers `code-mirror-block` as a native-text/container/opaque-widget view. [`CodeBlockView`](../../src/rendering/core-block-views.tsx) renders `payload.text` in a textarea, with a notice that CodeMirror migration is pending. Its subsequent `ChildBlocks` are arbitrary children, not a code-line source assembly. |
| Legacy CodeBlock | [`code-mirror-block.ts`](../../src/blocks/code-mirror-block.ts) embeds CodeMirror `EditorView`, `basicSetup` and `javascript()`. Its string is serialized directly. This is an older implementation, not a parser-only integration to copy. |
| Model and language | [`codecs.ts`](../../src/block-tree/codecs.ts) creates inline Cells only for `standoff-editor-block`; the named CodeBlock retains `payload.text`. `ICodeMirrorBlockDto` in [`types.ts`](../../src/library/types.ts) adds a text string, with no typed language field. Legacy JavaScript is hardcoded. |
| Imported fenced code | [`html-import.ts`](../../src/interchange/html-import.ts) imports `<pre>` as standoff text with `metadata.htmlPreformatted`. [`markdown-import.ts`](../../src/interchange/markdown-import.ts) also preserves `metadata.markdownCode.language` and optional fence metadata. [`export-plan.ts`](../../src/interchange/export-plan.ts) uses these when exporting code. |
| Edit notifications | [`gateway.ts`](../../src/input/gateway.ts) commits native textarea input/composition through `setPayloadField(nodeKey, "text", ...)`; standoff editing uses the existing inline commands. Repository `subscribeChanges` exposes affected records. [`document-find.ts`](../../src/runtime/document-find.ts) demonstrates routing `inlineOwner` and `previousContents` changes to source invalidation. |

**Newlines:** textarea strings and standoff Cells can contain embedded LF characters, including imported/pasted multiline code. There is no established CodeBlock-level assembly contract for multiple line TextBlocks or mixed children. The ordinary standoff Enter path calls `insertStandoffParagraph`, creating/splitting sibling TextBlocks; it does not special-case preformatted code. Adjacent blocks with matching language metadata therefore cannot safely be assumed to belong to one code context—two separate fences may have the same language.

## 3. Lezer integration proposal

Use `@lezer/javascript` for the parser and `@lezer/highlight` for classification. These are already installed transitively: JavaScript **1.5.6**, highlight **1.2.5**, common **1.5.3**. The project already depends on `@codemirror/lang-javascript` and CodeMirror. An implementation should declare the packages it directly imports, without requiring an upgrade for this feature.

- JavaScript: `parser`; TypeScript: `parser.configure({dialect: "ts"})`.
- The JavaScript parser includes highlighting node properties. `highlightTree(tree, highlighter, callback)` emits UTF-16, half-open ranges and class strings.
- `tagHighlighter` supplies application class mappings; `classHighlighter` is a ready-made mapping suitable for a probe. No custom tokenizer is needed.
- Neither `EditorView`, `EditorState`, `LanguageSupport` nor `@codemirror/language` is needed for this route. Direct use of `@lezer/common` becomes useful for incremental fragments or a custom parser input, not essential for the first full parse.

These APIs and parser dialects are documented in the [Lezer reference](https://lezer.codemirror.net/docs/ref/), [highlighting example](https://lezer.codemirror.net/examples/highlight/) and [JavaScript parser repository](https://github.com/lezer-parser/javascript).

Start with full analysis of the **affected code context**, not the document. Incremental parsing would retain a previous tree and source revision, map edits through `TreeFragment.applyChanges`, and supply reusable fragments to parsing. It adds offset/change bookkeeping and language/structure reset cases. It does not eliminate classification, publication or multiline dependency work. Current measurements make publication the first optimisation target.

## 4. Transient standoff integration

[`SessionDecorations`](../../src/runtime/session-decorations.ts), exposed as both `editor.decorations` and `editor.temporaryRanges`, already supplies owner collections with `replace`, `upsert`, `remove` and `dispose`. Use a dedicated syntax owner per mounted occurrence/annotation unit; IDs should be stable where possible. Clearing syntax must dispose only those owners. These collections are outside canonical records, persistence and Undo/Redo.

Each temporary range carries a versioned [`TextRangeSnapshot`](../../src/runtime/text-ranges.ts): occurrence, content identity, coordinate system and exclusive start/end. **Transient ranges are invalidated, not automatically rebased**, when their source version changes. Edited TextBlocks require fresh snapshots even when their token categories are unchanged. Unchanged TextBlocks can retain valid ranges. Undo/Redo triggers regeneration from restored source; it must not record highlighting as an edit. Closing/removing an occurrence disposes its collection and pending work.

[`standoff-editor-view.tsx`](../../src/rendering/standoff-editor-view.tsx) already combines persistent and session ranges through [`range-rendering.tsx`](../../src/rendering/range-rendering.tsx). The existing `css-class` renderer in [`visual-effect-renderers.tsx`](../../src/rendering/visual-effect-renderers.tsx) can attach token classes directly to Cells. It supports the existing Solid and direct-DOM paths; no copied glyphs, SVG foreground overlay or new annotation model is required.

**Overlap policy:** classes merge across range boundaries; there is no general owner-based foreground priority. Use colour-only syntax classes initially and let authored inline foreground colours win. Preserve other annotation classes, link behaviour and selection styling. Check specificity against existing class-based foreground rules; do not introduce blanket `!important` declarations. Lexical class ordering is not CSS precedence.

**Precise limitations:** range admission currently excludes `code-mirror-block`, and the standoff renderer consumes Cell-coordinate ranges. Adding admission alone would not make the textarea render them. Separately, collection replacement validates/clones ranges, then rebuilds indexes and compares arrays across **all owners/nodes**. Reactive output is filtered to changed nodes, but the computation is not local. Replacing one collection per TextBlock repeatedly would multiply this cost. A narrowly scoped owner/affected-node update, with batched validation/publication, is justified; a new provider framework is not.

## 5. TextBlock mapping

Build a disposable source snapshot from canonical text, keyed by its source revisions. It is a derived cache, never another authoritative document.

For a single standoff TextBlock, concatenate actual Cell text and retain cumulative UTF-16 boundary offsets. Cells are initially produced with `[...text]`: generally Unicode code points, **not UTF-16 code units or grapheme clusters**. Use actual Cell strings rather than assuming one unit each. An emoji occupies two UTF-16 units but one ordinary Cell; combining marks can occupy separate Cells. Non-text inline objects need an explicit policy—initially leave such an unsupported code context unhighlighted rather than silently change parser input.

If a multi-TextBlock code host is approved, record each participating TextBlock's global source interval, insert one explicitly defined virtual LF between children, and retain any embedded newlines verbatim. Intersect each parser range with those intervals and convert its endpoints through the local boundary map. Virtual separators receive no annotation. A multiline comment/token can produce several block-local ranges. Map only exact Cell boundaries; do not silently expand a token through a partial Cell. Temporary ranges are half-open; persistent standoff end-index conventions must not be copied into them.

An edit may require reparsing the whole context for correctness, but publication should compare per-TextBlock results and versions. A changed multiline delimiter legitimately updates subsequent affected blocks; a normal token change should not refresh unrelated blocks. Structural membership/order changes invalidate the source map. Never concatenate the named CodeBlock's textarea string and arbitrary child content without an explicit source contract.

## 6. Performance assessment

Focused local probe: Chrome **156.0.8078.80**, headless, development build; existing mounted standoff view, one TextBlock containing embedded newlines, default renderer. Synthetic TypeScript lines included declarations, a typed parameter, an operator, a number and a comment. These deliberately exercise many short ranges. No feature prototype or dependency installation was needed.

Times in milliseconds:

| Lines / characters / ranges | Source + UTF-16 map¹ | Range snapshots¹ | Parse² | Classify² | Initial publication¹ | Identical replacement³ |
|---|---:|---:|---:|---:|---:|---:|
| 10 / 539 / 140 | 0.7 | 0.8 | 0.4 | 0.1 | 18.9 | 8.1 |
| 50 / 2,739 / 700 | 2.2 | 2.0 | 1.3 | 0.2 | 49.9 | 37.5 |
| 200 / 11,089 / 2,800 | 10.1 | 7.2 | 4.9 | 0.4 | 238.0 | 145.5 |

¹ Single samples. ² Median of ten measured runs after two warm-ups. ³ Median of five unchanged `replace` calls. ASCII fixtures allow direct parser-to-Cell indices; the snapshot column is not a benchmark of the proposed general Unicode mapper. Separate JS/TS API checks confirmed classifications across embedded newlines and the UTF-16/Cell-length difference around an emoji.

Publication timings include synchronous collection and reactive DOM work, **not completed paint or trusted typing responsiveness**. No syntax palette was installed. These are bottleneck measurements, not an end-to-end qualification or a performance guarantee. Repository revision remained unchanged, repository snapshot calls were zero during publication, and the first existing Cell element retained its identity in all three fixtures.

Source inspection also establishes these costs:

- Unchanged publication is still costly; skip it before calling `replace` when both source version and ranges remain valid and identical.
- Direct-DOM class updates traverse the affected TextBlock's Cells. Hundreds of lines in one TextBlock do not get the cheap per-line update assumed by the brief.
- Each range has reactive rendering bindings. Global decoration index rebuilding adds unrelated-owner work beyond the isolated probe.
- Changes to range classes can schedule existing geometry work. A zero cached-range-read counter in this probe does **not** establish that all layout work is absent. Colour-only syntax updates should avoid requesting unnecessary geometry refreshes, through a narrow presentation-neutral distinction.

Schedule/coalesce analysis after committed input, avoid publication during IME composition, and cancel obsolete tasks. Check source/language/occurrence versions before applying a result. Scheduling a 50–238 ms publication in an animation frame would still block editing. First remove unnecessary work; add neither workers nor incremental parsing until measurements of the corrected pipeline justify them. Large paste/load should remain editable while deferred highlighting catches up.

## 7. Implementation recommendation

One bounded increment after the host decision:

1. Establish the actual supported source context and language metadata. Reuse `markdownCode.language` for imported fenced code, recognising JavaScript/TypeScript aliases; unsupported languages remain plain. Do not treat all `<pre>` text as JavaScript. Retain the named CodeBlock's current storage/input behaviour unless a specific host adaptation is approved.
2. Add a small feature module, behind a default-enabled feature flag, subscribing only to relevant source/language/structure changes. Assemble/map source, run Lezer and publish owner-scoped `css-class` ranges. Reject stale results and dispose listeners/owners with the occurrence.
3. Make the demonstrated publication path bounded by affected owners/nodes, skip genuinely unchanged results, and prevent colour-only updates from causing unnecessary geometry work. Reuse existing range rendering and geometry caches rather than introducing another layout system.
4. Add semantic token CSS variables and scoped Desktop/Textual palettes. The same classifications work in both views. Colour-only styling leaves Textual's measured font, wrapping and Cell advances unchanged. Future monochrome bold/underline can map from the same classes, with geometry qualification if typography changes.

Expected modifications: a focused syntax feature module and feature registration; `session-decorations.ts`; narrowly necessary range/standoff invalidation logic; palette styles in the normal stylesheet and scoped Textual stylesheet. Only the chosen host adaptation should touch `CodeBlockView`, range admission or input behaviour. Do not change graphical application views or application presentation registration merely to colour tokens.

No database change is needed. Highlighting existing standoff text needs no canonical model change or persisted syntax properties. Making the current named CodeBlock own editable Cells is **not** a renderer-only adjustment: codecs currently leave its text in `payload.text`. Any such host change needs an explicit storage/compatibility decision and preservation of existing source, identities, selection and history; do not silently migrate it or mirror its text into independent editable children.

Focused qualification should cover JS/TS multiline constructs and Unicode mapping; typing/paste, IME, Undo/Redo and save/reload; overlapping authored annotations; Desktop/Textual and shared occurrences. Measure typing through the existing Flint benchmark, publication cost and unrelated-owner visits, with zero highlighting-triggered repository snapshots or history/dirty changes. Reuse existing renderer tests; no broad regression campaign is warranted.

## 8. Open questions or blockers

**The one scope decision:** must the first increment highlight the existing textarea-based named CodeBlock, or may it initially support imported fenced standoff code? The latter is smaller but still requires an explicit code-context/newline policy when Enter splits a TextBlock. It is not a substitute to be adopted silently.

**The demonstrated performance blocker:** naive per-token transient publication is not sufficiently cheap for real-time use at hundreds of ranges, and currently includes unrelated-owner processing. Address that narrow bottleneck before claiming low-latency highlighting. Incremental parsing alone will not fix it.

The remaining pieces—JS/TS classification, transient ownership, offset mapping and presentation-specific colours—have clear existing APIs. No further general architectural investigation is needed.
