# Markdown highlighting and Markdown Input Transformation

2026-11-06 · Investigation and bounded implementation proposal

## Assessment and confirmed decisions

**Recommend one bounded implementation pass.** Markdown highlighting is a small extension; MIT plus clipboard provenance, atomic conversion and H5/H6 support make the combined work medium-sized. No new editor, persisted property family or general import framework is needed.

Confirmed during this investigation:

- MIT gets a **default-true feature flag and an on/off menu option**. Use an editor-wide session setting initialised from the flag, exposed through a shared command in graphical and Textual menus. Toggling must not edit Documents. No per-Block settings are needed.
- Convert when the **complete matching opening/closing delimiter runs** have been typed; do not wait for a timer or subsequent space.
- Ordinary Cmd/Ctrl-V preserves native Mutable and rich HTML formats. Plain-text or Markdown-only clipboard content remains literal.
- Markdown highlighting and explicit Paste as Markdown remain independent of the MIT typing toggle. Existing list/task rules retain their current enablement when MIT is off.

## 1. Markdown CodeBlock support

[`runtime/standoff-code.ts`](../../src/runtime/standoff-code.ts) currently selects JavaScript/TypeScript with a small conditional, not a general language registry. `analyseCode` concatenates **all direct TextBlock children in one CodeBlock**, separating them with LF and preserving embedded newlines. It parses that whole context, then maps UTF-16 classification ranges into block-local Cell ranges. Unchanged TextBlocks skip publication. Therefore Markdown fences, blockquotes and lists can be analysed across those child boundaries without changing the model; parsing is not currently per line.

Add Markdown/`md` to that selector and [`standoff-code-view.tsx`](../../src/rendering/standoff-code-view.tsx), using the already-installed **`@lezer/markdown` 1.7.2**. Declare it directly when implementing. Use `parser.configure(GFM)` for highlighting. Reuse the existing range mapper, collections and Desktop/Textual CSS; add colour mappings for Markdown's heading, emphasis, strong, link, URL and other emitted classes. Keep those styles colour-only so Textual font metrics do not change.

Markdown is not an LR-generated parser like JavaScript, but its full parse produces the compatible Lezer tree consumed by `highlightTree`. GFM bundles tables, task lists, strike and autolinks. Fenced JavaScript contents are not automatically JavaScript-highlighted by the base Markdown parser; mixed-language `parseCode` is optional and unnecessary for this increment. These distinctions are documented in the [official Markdown parser interface](https://github.com/lezer-parser/markdown#interface).

A local probe confirmed heading/emphasis/link/task/fence-marker classifications across embedded newlines. Fence contents need an explicit code-style range if visibly distinguishing the whole code body is desired; do not promise nested language colouring. Preserve every source character and exclude all code/literal contexts from MIT and Markdown-to-rich-text paste conversion.

The existing large-single-TextBlock publication limitation remains: adding Markdown does not solve within-TextBlock syntax-delta retention. Do not silently expand this task into that separate optimisation.

## 2. Verified parser API and trigger policy

Installed API: `MarkdownParser.parseInline(text, offset): Element[]`. Offsets are **UTF-16, end-exclusive**, and include the supplied base offset. `Element.type` is a numeric node ID resolved through `parser.nodeSet.types`. Its public declaration exposes `type`, `from`, `to`; runtime objects also have children, but that traversal is not part of the declared public interface.

For robust nested delimiter extraction, use `parser.parse(affectedText)` and the public tree/cursor interface, rather than depending on undocumented `Element.children`. Parsing one eligible TextBlock is still local. Verified shapes include:

| Source | Relevant tree nodes and offsets |
|---|---|
| `*italic*` | `Emphasis 0..8`; `EmphasisMark 0..1`, `7..8` |
| `**bold*` | **`Emphasis 1..7`**, leaving the first star outside it |
| `**bold**` | `StrongEmphasis 0..8`; marks `0..2`, `6..8` |
| `***both***` | Outer `Emphasis`, inner `StrongEmphasis`; combined opening and closing runs each contain three stars |
| `~~strike~~` | `Strikethrough`, with `StrikethroughMark` children |
| Inline backticks | `InlineCode`, with `CodeMark` children |
| `[label](https://example.com)` | `Link`, `LinkMark` and `URL` children |
| `## ` | `ATXHeading2` with `HeaderMark 0..2`, even without body text |

**Lezer recognition alone is insufficient.** Only accept a completed node/group covering the entire tracked opening run and its matching closing run. Never convert an inner parse that leaves unmatched stars from that opening run outside it.

Character-by-character commitment:

| Typing sequence | Behaviour |
|---|---|
| `*` → `*i` → … → `*italic` → `*italic*` | Literal while incomplete; final `*` converts to italic. |
| `*` → `**` → `**b` → … → `**bold` → `**bold*` → `**bold**` | First closing star does nothing; second converts to bold. |
| `*` → `**` → `***` → `***b` → … → `***both` → `***both*` → `***both**` → `***both***` | Partial closings do nothing; third creates bold and italic together. |

Opening-run eligibility is deliberately conservative: reject intraword openings such as multiplication `a*b*c`, escaped markers, empty spans, code/literal regions and incomplete backtick regions. Preserve unrelated pasted/existing markup. Reuse parser nesting rather than a second Markdown grammar; ambiguous nested cases remain literal. Adjacent freshly typed constructs must be tested explicitly, including when an earlier conversion has removed its markers.

Immediate conversion cannot distinguish every literal wildcard from Markdown: `*file*` is identical input whether emphasis or a glob is intended, and future `.txt` has not yet been typed. The agreed escape routes are a backslash, inline-code/literal context, the MIT toggle, or immediate Undo. Do not claim perfect intent inference. Initial typed emphasis can be limited to star delimiters; intraword underscores remain untouched.

Headings trigger on the typed space after one to six initial `#` Cells. This common input path needs only a tiny prefix check; the parser already recognises the resulting empty heading. Ordinary spaces must not parse a paragraph.

## 3. Native authoring and available formatting

The shared insertion point is [`InputGateway.onBeforeInput`](../../src/input/gateway.ts), beside the existing list-prefix handling, after selection/composition admission. Add a thin MIT adapter there—not a second DOM event listener or a repository-change observer. Restrict it to direct eligible typing with one collapsed selection. Paste, hydration, programmatic changes, replay, conversion itself and IME composition are not triggers.

Record candidate provenance using typed opening delimiter Cell identities and the relevant source revision. Paste, replay, navigation or an incompatible edit cancels that candidate. Parse only a possible fresh completion and convert only its eligible construct; never sweep a block converting all Markdown matches. Pre-existing/pasted delimiters must not become candidates merely because subsequent typing occurred nearby.

| Requested construct | Existing native representation / recommendation |
|---|---|
| Italic / bold | **`style/italics`** / `style/bold` in [`standoff-styles.ts`](../../src/rendering/standoff-styles.ts). Note the plural spelling. Required first slice. |
| Bold + italic / strike | Two existing properties / `style/strikethrough`; include when the same adapter safely handles the complete parsed span. |
| Link | `reference/url`, with URL retained as its structured target/value through existing materialisation and URI checks. Simple valid inline links are viable; malformed/unresolved reference links remain literal. |
| Inline code | No equivalent active native inline-code style was found in the shared style schema/materialiser. Retain the backticks and protect their contents from MIT; do not invent a property. |
| H1–H6 | Current toolbar uses `block/font/size` with `value: "h1"`…`"h4"`. [`appearance.ts`](../../src/rendering/appearance.ts) has no H5/H6 sizes. Extend this **existing** representation to `h5`/`h6`, retaining Textual's fixed-grid presentation. |
| Lists/tasks | Reuse [`text-lists.ts`](../../src/runtime/text-lists.ts): existing `- ` / `* ` / numbered starts, including numbering, and task continuation. No competing rules. |
| Blockquote | Current HTML importer flattens quotations to paragraphs with a notice; no corresponding native quotation representation was established. Leave `> ` literal initially. |

H5/H6 must not be approximated as H4: the general HTML importer currently does that while retaining `htmlHeadingLevel`. The new bounded converter should author true H5/H6 values directly. Update or clear stale imported heading metadata consistently, preserve unrelated block properties, and keep exporter heading detection correct. No new Block type is required.

Use `commands.structuralTransaction()` for conversion, with native property writes and `replaceInlineRange` deleting delimiter intervals from right to left. Stage new properties on their original body ranges before deletion so existing range rebasing adjusts both old and new annotations. For multiple styles, stage one combined property update; repeated calls reading the live projection inside an unpublished transaction must not overwrite earlier staged changes. [`RangeAnnotations`](../../src/runtime/range-annotations.ts) supplies validation/deduplication conventions and can apply a single style directly before deletion.

Avoid copying the old [`native-b2/input.ts`](../../src/qualification/native-b2/input.ts) experiment: it uses regex recognition, a separate listener and ordinary `transaction()`. Ordinary transactions, and `replaceAndAnnotate`, currently begin with a repository snapshot. The bounded path already exists and is the appropriate integration point.

Accept the final delimiter/space as ordinary input, then record the **conversion as one atomic history entry**, matching the existing list rule. One Undo restores the complete literal markers and previous block state; another Undo can remove the triggering keystroke. Undo must not retrigger MIT. Map selection through the deletions and restore the caret via the existing selection service/mount. UTF-16-to-Cell conversion must use actual Cell text; retained body Cells should not be reconstructed.

## 4. Clipboard integration and intentional changes

[`mutable-clipboard.ts`](../../src/runtime/mutable-clipboard.ts) already owns selection bookmarks, asynchronous validity checks and insertion. [`transport.ts`](../../src/interchange/transport.ts) negotiates native, HTML, Markdown and plain representations. An existing **Paste as Markdown** Block menu command is reusable.

| Action | Proposed behaviour |
|---|---|
| Cmd/Ctrl-V | Native/rich formats retain current precedence. Plain text remains literal. Markdown-only MIME becomes literal instead of today's automatic Markdown import. No typing MIT. |
| Cmd/Ctrl-Shift-V | Explicit bounded Markdown import from Markdown MIME, otherwise `text/plain`; never reinterpret raw `text/html` as Markdown. One undoable insertion. In a CodeBlock, preserve source literally. |
| Paste as Markdown menu | Same explicit converter and bookmark handling as the chord. If browser clipboard access fails, direct the user to Cmd/Ctrl-Shift-V; do not arm a hidden override of ordinary Cmd-V. |
| Paste as plain text | Keep the displaced action discoverable in a menu. |
| Resource URI processing | Keep the existing **Cmd/Ctrl-Shift-Enter** action and resource/import menus. |

The shortcut conflict is real: Cmd/Ctrl-Shift-V currently marks plain-paste intent and can dispatch recognised URLs to resource acquisition. The brief intentionally replaces that binding; macOS's usual Paste and Match Style expectation must be reflected in menu labels/help. Remove this old dispatch from the explicit Markdown route so an ordinary URL does not unexpectedly start resource import.

The existing broader Markdown importer uses mdast → an HTML tree → native fragments. It is unsuitable as the MIT semantic adapter because the brief explicitly excludes an HTML round-trip. Add a small Lezer-to-existing-`MutableFragment` converter shared with typed MIT's supported-format mapping. Reuse clipboard preparation/materialisation/insertion; leave general file/resource Markdown import intact.

The new explicit clipboard route should handle required emphasis/headings and safe flat native lists/tasks. Unsupported subtrees—tables, fences, images, quotation/nested structures beyond the supported subset—retain their **exact source slices**, including delimiters. Do not recursively consume recognised inline syntax inside an unsupported fence or quotation. This is a conservative change from the existing menu's broader conversion, not a claim of full CommonMark import. Links require valid native URI admission; unresolved reference links stay literal.

## 5. Small implementation pass and qualification

Implement the Markdown parser/style extension, MIT gate/menu command and provenance-aware input adapter, H5/H6 rendering extension, and explicit clipboard route together. Share recognition-to-native semantics while keeping transient CodeBlock highlighting, typed authoring and clipboard insertion separate. No database/schema migration or change to manual saving.

Focused checks: required star sequences and H1–H6; nested/adjacent and escaped/literal cases; emoji/combining marks with existing annotations; caret/IME/Undo; actual Cmd-V/Cmd-Shift-V format negotiation; unchanged JavaScript/TypeScript and list/task rules; graphical/Textual presentation. Reuse the existing Flint typing benchmark and assert no snapshots, whole-document scans or unrelated projection work from MIT. Do not repeat a broad editor qualification.

**Investigation evidence:** installed-parser probes verified the API/tree/classification cases above. One temporary authoring probe exercised bold delimiter removal over `😀é` with an existing italic property, and H6 property/prefix authoring. Both converted, undid and redid correctly with **zero repository snapshots**. This confirms command composition, not H6 visual support or a completed MIT feature. The temporary probe was removed. No production code or dependencies changed.

No further user decisions are required for the proposal; the toggle, paste precedence and immediate completion policy are confirmed. The main implementation risks are provenance/Undo correctness, the known missing H5/H6 rendering, and the deliberate clipboard-policy changes described above.
