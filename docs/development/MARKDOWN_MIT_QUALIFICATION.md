# Markdown highlighting and Input Transformation — qualification

2026-11-06

## Implemented behaviour

- `standoff-code-block` supports **Markdown** (`markdown` / `md`) through Lezer + GFM. Highlighting spans its TextBlock children and embedded newlines, preserves source, and uses existing transient CSS range decorations. Desktop/Textual colours retain their respective font geometry. Syntax annotations are not persisted.
- **Markdown Input Transformation (MIT)** defaults on through `markdownInputTransformation`. The TextBlock context menu and Textual Tools menu expose its current state and toggle the same `markdown.toggleInput` command. This is an editor-session preference, not a Document edit. It does not disable Markdown highlighting, explicit Markdown paste, or existing list/task rules.
- Fresh typing supports `*italic*`, `**bold**`, `***both***`, `~~strike~~`, simple safe `[label](URL)` links, and initial `# ` through `###### ` heading prefixes. H5/H6 extend the existing `block/font/size` representation. Incomplete delimiter runs stay literal: `**bold*` does not become italic.
- Inline and heading conversions follow the list convention: the triggering character is accepted first, then one atomic conversion entry is authored. **One Undo restores the complete literal delimiters/prefix; another removes the triggering keystroke.** Redo restores formatting. Existing annotations rebase, and retained body Cells remain the same objects.
- Code/literal contexts, restricted standalone fields, IME, non-collapsed/multiple selections, pasted/programmatic text and history replay do not trigger MIT. Candidate provenance is cancelled by navigation, paste, incompatible edits and focus changes. Ordinary letters/spaces do not invoke Lezer.
- **Cmd/Ctrl-V** preserves native/rich formats; text-only Markdown remains literal. **Cmd/Ctrl-Shift-V** and **Paste as Markdown** explicitly use the conservative Lezer-to-native converter. It supports inline formatting, H1–H6, flat lists and tasks. Unsupported structures retain literal source. Code destinations retain literal text. Paste remains one undoable insertion.
- **Paste as plain text** remains available in the context menu. Clipboard-read denial does not silently change the meaning of ordinary Cmd/Ctrl-V.
- The broader Markdown importer remains unchanged and accessible through **Insert file**, **Convert to Mutable Ink → From Markdown**, and linked-resource import. Its tables, nested lists, code and image handling remain available. **Cmd/Ctrl-Shift-Enter** still processes a resource URI at the caret; the linked-resource dialog also accepts retained job identifiers. The obsolete resume-shortcut message was corrected.

## Changed modules

- Recognition/native mapping: new `interchange/markdown-native.ts`; existing `transport.ts` and `runtime/mutable-clipboard.ts` route explicit paste through it. General `markdown-import.ts` is unchanged.
- Typed authoring: new `runtime/markdown-input.ts`, with narrow integration into `input/gateway.ts`, `reactive-editor/editor.ts`, configuration and existing menus. Uses `structuralTransaction`, native property writes and delimiter deletion; no new Block/property types or mutation pipeline.
- Presentation: `runtime/standoff-code.ts`, its existing view/CSS, and `rendering/appearance.ts`. Added a direct dependency on the already-installed `@lezer/markdown` version.
- Focused tests and the existing CodeBlock/Flint browser fixture were extended. The existing typing benchmark accepts `BENCHMARK_MIT=off` for comparison.

## Qualification results

**142 tests passed across six focused files:** MIT input (26), CodeBlock rendering (8), native Markdown converter (11), broader Markdown import/transport (9), clipboard routing/lifecycle (73), and existing lists (15). Reactive TypeScript checking passed.

Checks include both Solid/direct-DOM paths, Unicode scalar offsets, existing annotation rebasing, retained Cell identities, caret placement, matching/partial/nested/adjacent delimiters, literal protection, H1–H6, flag-off behaviour, persistence round-trip, clipboard cancellation/stale destinations, and the broader importer's tables/code. Bounded-work assertions confirm no repository snapshots, full projection builds or reference-index rebuilds for typed MIT and its Undo/Redo. Unrelated Document content stays unchanged.

**Trusted Chrome input passed in retained Flint, Desktop and Textual:** typing, native selection, Undo/Redo chords, IME composition, ordinary/rich/explicit Markdown paste, toggle behaviour, Markdown syntax rendering, and Desktop/Textual/Desktop restoration. Textual code Cells measured **9.640625 px**, matching the measured grid; existing Cell DOM survived presentation switching. The fixture used an annotated imported Document plus another Document. No user files were saved.

| Measurement | Desktop | Textual |
|---|---:|---:|
| Mean MIT service invocation, including cheap rejected input | 0.46 ms | 0.23 ms |
| Maximum MIT service invocation | 7.8 ms | 4.5 ms |
| Typed MIT / history snapshots, projection builds, reference rebuilds | 0 / 0 / 0 | 0 / 0 / 0 |

The existing Desktop typing benchmark ran once with MIT off and once on (250 paragraphs, 25,000 characters, 40 insert/delete samples). Median handler time was **2.5 → 1.8 ms**, p95 **7.1 → 7.6 ms**. Both runs had zero snapshots and retained unrelated DOM; trusted typing, deletion, Enter and history checks passed. These small headless samples do not establish a speed improvement or user-visible paint latency.

## Limitations and deferred functionality

- **Inline code is deferred:** backticks and their contents stay literal; no new native property was introduced. Typed underscore emphasis, more permissive punctuation boundaries, complex/reference links and broader clipboard structures can be added later. Immediate completion necessarily treats fresh `*file*` like emphasis; escape it, disable MIT or Undo to keep it literal.
- Explicit paste retains the **existing general clipboard insertion cost**. The browser sequence of three pastes and two paste Undos recorded five snapshots, ten projection builds and five reference-index rebuilds per presentation. This work is separate from typing and MIT transformations; clipboard transaction refactoring was not added to this increment.
- CodeBlock highlighting retains its existing per-edited-TextBlock publication granularity. Fenced-language bodies are not recursively syntax-highlighted. No broader syntax-delta or rendering refactor was undertaken.
- Browser qualification used Chrome on this host; no separate cross-browser/platform campaign was run. Document saving remains manual.

## Follow-up: horizontal line pattern

Typing the third consecutive fresh hyphen at the start of a TextBlock creates a
`horizontal-line-block`, rendered as a native `<hr>`. The existing TextBlock becomes
the continuation below it: the caret remains at its start, and any following text,
Cells, annotations and owned relations are retained. One Undo removes the rule and
restores the complete `---` prefix. This uses the existing MIT toggle and literal,
code and provenance guards; paste does not trigger it.

Three focused tests passed, covering both rendering paths, suffix/annotation and
editor retention, typing after the rule, Undo/Redo, native save/reload, exclusions,
and zero snapshots, projection builds or reference-index rebuilds during conversion
and history. Reactive TypeScript checking passed. No broader qualification rerun.
