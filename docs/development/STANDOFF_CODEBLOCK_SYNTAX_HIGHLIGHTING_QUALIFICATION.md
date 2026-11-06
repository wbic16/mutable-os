# Standoff CodeBlock syntax highlighting — qualification

2026-11-06

## Delivered implementation

`standoff-code-block` is a lightweight code-context container holding ordinary `standoff-editor-block` children. Those children retain Mutable's existing Cells, renderer, input gateway, selection, clipboard, history and persistence. Enter uses the existing paragraph split; embedded newlines remain supported without conversion. The older textarea CodeBlock is unchanged.

Create one through **Add Block → Standoff code → JavaScript / TypeScript** in the existing Block menu. The host's language selector provides JavaScript, TypeScript and Plain text. Language is stored canonically in `metadata.markdownCode.language`; `js`/`ts` aliases are recognised and unsupported values stay editable without colouring. The default-enabled `standoffCodeHighlighting` flag hides creation and disables syntax analysis when off; saved code remains readable/editable. Shared standoff rendering must also be enabled.

The existing Lezer JavaScript parser and its TypeScript dialect supply classifications through `highlightTree`/`classHighlighter`. Already-installed Lezer packages are now declared as direct dependencies. No CodeMirror editor, migration, new editing engine or persisted syntax property was introduced.

Each mounted context assembles its direct TextBlock children with one virtual LF between them. Actual Cell strings determine UTF-16 boundaries; embedded LF and surrogate pairs are preserved. Classification ranges are intersected with each TextBlock and mapped to exclusive Cell boundaries. Non-text children or inline objects leave the context uncoloured instead of silently changing parser input.

Changes are routed from affected canonical records, coalesced for 25 ms, and deferred during composition. Parsing/publication runs synchronously within that deferred task, using current source; there is no asynchronous result that can overtake a newer edit. Source Cells are cached by TextBlock inline revision. Unchanged TextBlocks retain valid annotations. Language, membership and source changes trigger reanalysis; unrelated edits do not. Collections and pending work are disposed with each occurrence.

## Annotation publication and shared changes

Syntax uses independently owned `SessionDecorations` collections, `TextRangeSnapshot` and the existing `css-class` renderer. Colours are scoped CSS variables, with separate Desktop/Textual values. Syntax classes change foreground colour only; authored inline foreground colours and other formatting retain their existing precedence. No token rectangles or SVG glyph overlays are used.

The actual 50-TextBlock fixture demonstrated unnecessary global publication cost, so the existing decoration service was narrowed:

| Shared module | Change and preservation |
|---|---|
| `runtime/session-decorations.ts` | Updates only the changed owner's content indexes and affected nodes. Preserves owner ordering, overlapping contributions, visibility, terminal invalidation and occurrence cleanup. Unrelated owners are not read during publication. |
| `runtime/visual-effect-registry.ts`, `rendering/visual-effect-renderers.tsx` | Cell-style renderers can declare whether they affect layout. Existing CSS-class bindings default to the previous layout-affecting behaviour; syntax explicitly opts out. |
| `rendering/range-rendering.tsx`, `rendering/standoff-editor-view.tsx` | Separates layout-affecting classes from colour-only classes. Shared overlays still use existing measurement; temporary ranges without exclusion controls no longer get redundant legacy fragment measurement. |

Feature-specific files: `runtime/standoff-code.ts`, `rendering/standoff-code-view.tsx`, `rendering/standoff-code.css`. Integration files: `configuration.ts`, `rendering/register-core-views.ts`, `runtime/block-menu-actions.ts`, `package.json` and lockfile. Qualification changes: `rendering/standoff-code.test.tsx`, existing range-rendering/text-search tests, the existing typing benchmark's optional CodeBlock fixture, and `scripts/check-standoff-code-browser.mjs`.

## Functional and browser results

Focused coverage: **38 tests passed** across the new code tests and affected range-rendering/text-search tests. Reactive TypeScript checking passed.

- JavaScript/TypeScript, multiline comments/templates, multiple TextBlocks, embedded newlines and emoji offset mapping.
- Ordinary edits publish one TextBlock; changing a multiline comment delimiter updates the affected subsequent TextBlock too.
- Both direct-DOM and Solid rendering paths; unchanged Cells, authored annotations and unrelated decoration owners retained.
- Language changes, Undo, shared occurrences, disposal, disabled-feature fallback and JSON save/reload.
- Zero highlighting-authored repository revisions/history changes. Bounded-work checks found no repository snapshots, projection builds or reference-index rebuilds during the tested ordinary edit/publication path. An unrelated text edit did not trigger code analysis.
- Colour-only publication/removal performed no range-rectangle measurements in the focused renderer test. Owner-local publication did not read an unrelated owner's matches.

Trusted Chrome checks in a retained Flint fixture passed for selection replacement, typing, IME composition, clipboard paste, Undo/Redo, and Desktop → Textual → Desktop. The real typing benchmark also passed trusted Backspace and Enter/split/Undo checks. Native resource capture/serialization decoded successfully, retained the new Block type, excluded syntax properties and did not alter the repository revision. The fixture did not save user files.

Textual used the same classifications with yellow keywords/cyan strings. The measured ordinary Cell width was **9.640625 px**, exactly matching the Textual grid width; switching presentations retained the Cell element and restored the Desktop font. Screenshots were inspected at `/tmp/standoff-code-textual.png` and `/tmp/standoff-code-desktop.png`.

## Performance observations

Chrome 156.0.8078.80, headless development build, existing real Flint typing benchmark with a Desktop window and **250 additional annotated paragraphs**. These are local observations, not guaranteed user-visible latency. Typing figures are synchronous handler timings from 40 insert/delete operations; trusted-input checks separately verify behaviour. Deferred publication timings include synchronous reactive work, not completed browser paint. Initial values are individual cold-context samples, not medians.

| Structure | Syntax ranges | Initial publication | Ordinary refresh publication | TextBlocks republished | Typing median / p95 |
|---|---:|---:|---:|---:|---:|
| 5 TextBlocks | 40 | 26.8 ms | 3.6 ms | 1 | 2.9 / 10.7 ms |
| 50 TextBlocks | 400 | 69.6 ms | 1.9 ms | 1 | 1.6 / 4.1 ms |
| 200 TextBlocks | 1,600 | 188.4 ms | 1.5 ms | 1 | 1.5 / 6.0 ms |
| 200 embedded lines in one TextBlock, 18,379 characters | 1,600 | 248.9 ms | 162.1 ms | 1, containing all lines | 149.2 / 523.8 ms |

Before owner-local publication and removal of redundant geometry work, the **same actual 50-TextBlock fixture** took **1,300.9 ms initially** and **32.6 ms** for an ordinary refresh. The corresponding post-change observations were 69.6 ms and 1.9 ms. Parsing that context during ordinary editing took approximately 1.6 ms; the 200-TextBlock context took approximately 5.5 ms. Incremental Lezer parsing was not warranted by these results.

The unchanged 250-paragraph Flint baseline measured a 2.4 ms typing median and 13.6 ms p95. All benchmark configurations reported zero repository snapshots during typing and stable unrelated Cell DOM. Timing variation means these results should not be interpreted as speeding up unrelated editor typing.

## Important remaining limitation: within-TextBlock deltas

**The large embedded-lines case is functionally supported but is not qualified as responsive.** With highlighting disabled, that same 18,379-character TextBlock was already slow (190.2 ms median / 281.4 ms p95 in a separate run). Highlighting adds a substantial publication cost; the baseline does not excuse that overhead.

Current delta selection is **between TextBlocks**, not between syntax tokens inside an edited TextBlock. A source edit invalidates that TextBlock's versioned transient snapshots; all its syntax ranges are then republished. This limitation is explicit, rather than claiming token-delta rendering has been implemented.

As clarified during review, CSS colour belongs to the existing Cell element. Moving a Cell does not require repainting its colour. Numeric range positions may need bookkeeping updates, while unchanged Cell colour assignments and annotation lifetimes should be retainable. Full Lezer reanalysis can identify changed classifications without requiring wholesale replacement. Retaining those contributions across source-version changes is the remaining improvement for this case; it is not a CSS or Lezer requirement. No broad editor refactoring or second annotation model was undertaken to conceal this limitation.

Reproduce with `BENCHMARK_PRESENTATION=desktop BENCHMARK_CODE=50 node scripts/benchmark-typing-browser.mjs`; use `5`, `200`, or `embedded` for the other fixtures, and `BENCHMARK_CODE_HIGHLIGHT=off` for the embedded baseline. Browser integration: `node scripts/check-standoff-code-browser.mjs`.
