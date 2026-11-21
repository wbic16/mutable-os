# TEI P5 importer — Milestone 4: native inline alternatives

Implemented against `3c61245` (Milestone 3 complete). `inlineAlternatives` defaults on. It enables native authoring and TEI conversion; disabling it restores grouped-tab imports. Saved slots still render when this creation flag is off. Compact canonical text is required for slot admission.

## 1. Prior instructions and ownership

Checked the M1 feature brief, mapping catalogue, M2/M3 implementations and accepted M3 inline-alternatives qualification. This implements the approved compact-slot direction. Original XML remains external and untouched: no archive, Source tab, XML synchronisation or re-export was added. One Document/one Page, editable Metadata, source-order selection, exact milestones, local Gloss identity and the conservative M3 relationship policy remain intact. Saving is manual, to the opened Mutable JSON filename, with no background saves or Markdown sidecars.

A compact host has an `alternative` atom whose properties contain `version: 1`, stable host-scoped `id`, ordered `readings` relation names and optional authored `metadata`. Each `inline-reading:<identity>` relation owns a native compact Standoff TextBlock. Reading text and annotations belong only to that Block. Nested slots use the same representation. There is no second text authority, duplicate host or canonical character graph.

Admission validates the slot version and fields, relation coverage, unique slot identities, distinct reading ownership, local owned targets, compact reading authority, absence of unsupported structural children/attachments, and the existing graph/cycle invariants. Native bytes retain the existing envelope version with the new explicitly versioned atom. Old decoders reject the unknown atom; this is not a migration of old Cell identities.

## 2. Coordinates

Each slot consumes exactly one host logical position. Its displayed reading can contain zero, one or many code points; those positions are in the reading's independent coordinate space. Host text readers see U+FFFC at a slot. No placeholder is authored for an empty reading. Unicode and grapheme editing retain the existing editor conventions.

Host annotations before, after and across a slot use host coordinates. Reading spans and points use reading coordinates. Editing a reading does not rebase host or sibling-reading annotations. Both supported stored point endpoint conventions remain valid.

## 3. Editing, selection and composition

The existing Standoff editor, input gateway, mounted ephemeral Cells, selection/focus services and canonical commands are reused. Arrow Right before a slot enters the selected reading at its start; Arrow Left after it enters at its end. At a reading boundary, outward arrows or deletion keys return to the adjacent host boundary. Empty and nested readings use the same rules. Shift at an outward boundary selects the slot. A selection crossing reading/host coordinate spaces expands to whole slots in the nearest shared host before replacement.

Reading typing, grapheme deletion, selection replacement and annotations use the existing affected-record compact transaction path. Slot insertion is one native transaction, exposed as **Insert Inline Alternative** in the command registry. Slot deletion/replacement removes its reading relations and applies normal reachability/retained-definition policy; Undo restores the complete closure. Splitting immediately before or after a slot transfers its owned relations to the correct paragraph. Moving its host carries the closure.

Joining or replacing across paragraphs containing slots is explicitly rejected before mutation. Clipboard/legacy copy or export containing a slot is also rejected, including cut before deletion; these formats do not yet express native slots. Copying ordinary text within a reading remains supported. This is the approved safe rejection policy for unqualified structural operations.

Switching cancels active provisional composition through the existing composition owner, remembers the previous reading's caret and restores a meaningful caret on the new mount. Late composition events cannot commit through a disposed owner. No new IME/input engine was introduced.

## 4. Presentation and geometry

Selection is stored under the occurrence's host key plus slot identity in `viewChildren`. It is absent from canonical payloads, native bytes and history. Each new occurrence defaults to the first source-authored reading. Two occurrences can display different readings of shared content.

The existing Standoff renderer mounts inline inside the host's one-position Cell. Only the selected reading's character DOM is mounted. A keyboard-accessible reading selector is exposed on hover/focus. Empty readings have a presentation-only zero-width caret target. Reading lines wrap with the surrounding paragraph.

Annotation SVGs and temporary decorations remain in the existing local layers. Reading changes invalidate the containing paragraph and dependent mounted readings through their existing frame owners. For a wrapped inline containing block, the SVG origin is corrected from the first CSS fragment to the bounding origin used by shared range geometry. Unchanged origin offsets are retained. No viewport-fixed renderer or whole-document measurement sweep was added.

## 5. Persistence and history

Native capture walks owned Blocks, including inactive, empty and nested readings, without needing mounts. Save/reopen preserves their metadata, definitions, annotations and stable slot identities. Reading choice is irrelevant to capture. Normal Save uses the existing ResourcePair/native-session coordinator and writes only Mutable JSON.

Reading edits, insertion/deletion, split and move use existing canonical history and session Undo/Redo. Ordinary reading edits preserve the bounded single-record path; structural ownership changes use canonical graph validation. Persistent compact History enrollment remains explicitly unqualified, exactly as in M3. Existing Cell-keyed history readers and archives were not migrated or reinterpreted.

Legacy native admission of new slot data fails explicitly before constructing canonical Cells. Existing legacy documents continue to use their prior representation. Markdown export containing slots rejects explicitly. Lightweight saved inspection and SQL saved projection read slot positions as inline objects and independently inspect owned readings; the SQL extraction profile advances to v4 so old derived evidence is not silently reused.

## 6. TEI conversion policy

**Workspace → Open TEI XML…** opens the dedicated `.xml`/`.tei` picker with TEI interpretation fixed. The same action is available in Flint. It opens the imported native document in the current application/window workflow; original XML is never bound as the Save target. The option follows the existing TEI import flag.

Inline textual `choice` with `orig/reg`, `sic/corr`, `abbr/expan`, and inline `app` with `lem/rdg` convert to slots. Eligibility is checked before conversion. Rich inline markup, names/local entity mentions, dates, editorial semantics and milestones remain in each reading. Nested eligible alternatives use owned nested slots; the representation has no fixed nesting cap.

Block-level alternatives, block-bearing branches, cross-range apparatus (`from/to`), `rdgGrp`, unexpected branch content and significant inter-branch whitespace retain the grouped-tab fallback. Inherited `xml:space` is respected. Disabling compact admission also requests grouped conversion. No branch is ranked or inferred as preferred.

Slot/group and reading semantics retain source element/role, source IDs, raw fields and ordered witness/responsibility/reference observations, including duplicates and unresolved references. All source reading text remains editable native content. M3's milestone inventory discovers inactive reading points and reveals the appropriate occurrence before resolving the live range again.

## 7. Semantic and bounded-work tests

New tests cover rich/empty/adjacent/nested readings, one-position host length, local entities, witness order, zero-width conventions, source attributes, native byte fidelity, unmounted capture, legacy rejection, malformed slot versions/targets, reading edits, insertion/deletion, split ownership, move, Undo/Redo and safe clipboard/join rejection. Prior milestone grouped-conversion tests explicitly retain their old conversion policy; new tests exercise the default M4 policy.

Bounded-work checks compare one and 300 unrelated Blocks: typing and Undo/Redo read no unrelated payloads, rebuild no repository reference index and take no full snapshots. Host and sibling records remain unchanged. Structural slot replacement/split and their Undo use the existing native-session membership refresh (four full snapshots in the extended browser scenario); these do not run for ordinary reading typing or switching. Existing point rebasing may materialise an omitted default `before` affinity after an edit; benchmark semantic comparisons account only for that established equivalence. The browser checks also observe unrelated paragraph DOM during repeated reading edits.

Validation: **517 tests passed across 49 Vitest files**, followed by **30 focused tests** after the final structural-ownership and clipboard safeguards, including the existing compact/native, input, geometry/selection, history and saved-knowledge regressions. A further **43 tests across four files** pass for the Workspace menu, interchange and earlier TEI rendering contracts. The menu integration test imports a real XML payload into an initially empty workspace, checks the unsaved native candidate and inline rendering, and checks that disabling TEI hides the action. `npm run typecheck` passes for both client and server.

## 8. Browser qualification

`scripts/test-inline-alternatives-browser.mjs` uses real Chrome/CDP input against the production qualification bundle. It checks two independent occurrences; byte-identical and zero-commit switching; real character input from both occurrences; empty and nested reading input; grapheme deletion; Undo/Redo; caret entry/exit; whole-slot cross-domain replacement; host Enter/split and exact Undo; actual Chrome IME provisional text cancellation; M3 navigation into an inactive reading; and existing SVG annotation rendering across wrapping. Screenshots are inspected rather than relying only on DOM assertions.

The final production qualification build and functional Chrome rerun passed after the Workspace menu and shared reading-switch changes.

Focused performance fixtures include a single ordinary slot, a combined rich/multiple/empty/nested paragraph, and 200 additional ordinary paragraphs with alternatives, each in two viewing occurrences. They measure admission, activation, switching, typing, Undo/Redo, capture, manual Save/reopen, retained heap and mounted DOM. Native-session checks distinguish clean switching from dirty content edits and verify saving to the opened filename with no Markdown generation.

Focused production results (one run per fixture; two mounted occurrences in each):

| Fixture | Admission | Activation | Switch handler median | Typing handler median / p95 | Undo / Redo | Capture / Save / Reopen | Retained heap | Mounted Cells |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Single slot | 1.2 | 6.5 | 1.5 | 2.5 / 3.0 | 2.2 / 1.0 | 2.0 / 2.8 / 1.7 | 12.1 MiB | 96 |
| Rich/multiple/empty/nested | 2.9 | 13.2 | 2.0 | 1.8 / 2.5 | 0.7 / 0.4 | 0.9 / 2.0 / 1.5 | 13.2 MiB | 184 |
| 200 additional paragraphs with slots | 69.7 | 936.7 | 2.3 | 1.5 / 1.7 | 1.2 / 0.8 | 40.9 / 57.5 / 38.8 | 153.0 MiB | 51,564 |

All times are milliseconds. Switching including two diagnostic animation frames measured medians of 32.2, 32.7 and 40.9 ms respectively. Heap is measured after explicit Chrome GC and includes the browser application's retained state, not only the slot objects. DOM counts include the two visible occurrences, not inactive reading text. All fixtures retain **zero canonical character Cells**, zero typing/switching snapshots, zero unrelated-paragraph DOM mutations, and one explicit manual Save. Save/reopen is byte-identical and returns the document to clean state. No save runs while switching or typing.

## 9. Full-Flint performance

Production Vite bundle, real Chrome headless, 1440×900, no CPU throttling; three sequential samples per fixture. Baseline is M3 `3c61245`. Build/tests were kept out of the recorded browser benchmark runs. Times below are medians in milliseconds; these measurements are not a guarantee of user-visible input latency.

| Fixture | M3 usable | M4 usable | M3 Metadata | M4 Metadata | Release target |
|---|---:|---:|---:|---:|---|
| Small WeGA | 67.6 | 74.4 | 81.9 | 83.1 | <500 / <250 ms: pass |
| Large WeGA | 296.1 | 301.4 | 117.1 | 131.3 | <1000 / <250 ms: pass |
| Derived anthology | 1058.1 | 1093.4 | 280.5 | 282.7 | informational |

| M4 fixture | Admission | Open/render | Capture | Manual Save | Reopen | Undo / Redo |
|---|---:|---:|---:|---:|---:|---:|
| Small | 9.4 | 37.4 | 3.9 | 8.6 | 4.4 | 0.4 / 0.2 |
| Large | 17.4 | 250.6 | 7.6 | 15.1 | 10.2 | 0.3 / 0.1 |
| Anthology | 72.4 | 957.1 | 36.3 | 67.4 | 37.1 | 0.4 / 0.2 |

All admissions build zero canonical character Cells, publish once and take zero admission snapshots. Worker conversion constructs zero canonical contents/placements. Letter maxima remain below the release gates. Anthology Metadata remains informational; no pathological single-TextBlock gate was introduced.

The existing real Flint typing fixture (499 characters, eight paragraphs) measured handler median/p95 **5.6/11.8 ms before** and **3.4/6.7 ms after**; settled median/p95 **7.8/15.2 → 4.9/8.2 ms**. Both runs restored original text, took zero snapshots, read zero aggregate status values and made zero service requests/worker starts. Frame timings are diagnostic and noisy; the evidence supports no observed regression, not a claimed speedup.

Raw evidence is in `artifacts/tei-performance/m4-before.json`, `m4-after.json`, and `artifacts/tei-m4/{typing-before,typing-after}/results.json`. Focused browser evidence and screenshots are in `artifacts/tei-m4/`.

## 10. Remaining limits and recommendation

Enable the qualified feature by default, with the explicit grouped-import rollback. Unsupported cross-paragraph join/replacement and slot clipboard/legacy export reject atomically. Native Save is the supported complete interchange format for slots. Persistent compact History is still outside this milestone. Arbitrary Blocks inside readings, full apparatus collation and exceptional single-paragraph performance remain outside the qualified slice. Recursive representation is supported; the required browser nesting qualification is one level.

The isolated historical `portable-spike/codec.test.ts` has two pre-existing failures; both reproduce in a clean detached worktree at `3c61245`. They are unrelated to slot handling. Node `.test.mjs` suites require their own runner and are excluded from the Vitest selection.
