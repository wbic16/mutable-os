# TEI P5 importer — Milestone 5: native inline alternative interoperability

Implemented against `f249c72` (accepted Milestone 4). The default-on `inlineAlternativeInteroperability` flag controls the new clipboard and structural command paths. `inlineAlternatives` remains the separate authoring/TEI conversion policy. Reading saved slots never depends on either creation flag. Original XML stays external and untouched; Save remains manual Mutable JSON with no Markdown sidecars.

## 1. Clipboard integration and format policy

The existing `MutableFragment`, serializer, materializer, transport, preparation worker, clipboard coordinator, input gateway and Block insertion commands are extended. There is no new MIME type, clipboard listener or TEI-specific clipboard format. The native atom uses the same one-position slot properties and ordered reading relation names. A clipboard-only `displayReading` hint produces the external projection and is discarded during native materialization.

Copy includes the selected host fragments and every owned reading, including inactive, empty and nested readings. It retains supported rich annotations, both point endpoint conventions, authored metadata, definitions, resource descriptors and reading order. Copy is read-only. Native cut uses the same payload and existing acknowledged asynchronous write/native-event failure semantics; removal follows successful payload construction and write. A denied write or failed structural plan leaves the source intact. The existing recovery copy remains available.

Normal paste prefers the native MIME, then the native HTML carrier, before existing external fallbacks. Explicit Paste as plain text remains an intentional lossy operation. A malformed/unsupported alternative payload or mismatched alternative carrier rejects visibly instead of silently selecting plain text. Plain text displays the occurrence's selected reading. Safe HTML uses that reading and supported bold, italic, underline, strike, superscript and subscript styling; the native carrier retains the full alternatives. No new Markdown clipboard format is introduced. Complete document Markdown/HTML export and publication containing slots remain explicitly unsupported rather than silently flattening them.

## 2. Closure transfer, identity and references

Materialization allocates fresh Block, placement, slot, reading-relation, annotation-occurrence and linked-definition identities. Internal references use the allocation maps; ordered reading relationships retain their meaning. Repeated paste never shares source-owned reading Blocks. Native slot materialization uses compact runs directly, including inline image objects, without creating canonical character Cells.

Known semantic pointers in TEI metadata are remapped separately from source XML identifiers, raw witness lists, responsibility strings and URLs. Required local definition dependencies are included from the selected closure. Local Entity/Gloss definitions use the existing Gloss identity and relationship remapper; relationships outside the copied closure retain explicit unresolved provenance. Out-of-closure native Block pointers become source-scoped unresolved observations, never guessed destination targets. Existing unsupported property types remain inert through the established clipboard policy. Source-file provenance is retained on copied slots when it is available on the originating Document.

Images inside inactive readings participate in the same asset inventory as visible images. Verified same-Cavern assets reuse their immutable originals. Foreign-Cavern images retain unresolved descriptors; automatic cross-Cavern binary transfer remains outside Clipboard Phase 3. Rich native text/readings can cross Caverns without binding foreign Entity IDs to destination Entities. No copy or paste performs speculative network resolution.

## 3. Transactions, joins and replacement

Compact text paste uses the existing insertion planner and affected-record draft. One paste/cut produces one canonical commit and Undo entry. Multi-caret edits retain the existing disjoint-group policy. Simple multi-paragraph inline slices are supported; identity-bearing roots and unsupported topology reject before publication. Whole-Block clipboard insertion retains its existing path, and direct copy of a slot-bearing TextBlock uses the same native fragment adapter. Direct tree copy with image embeds rejects with guidance to use the native clipboard, whose resource resolver can verify availability; it does not silently turn working images into unavailable ones. Containers with nested slot-bearing descendants retain the existing direct-tree-copy rejection; whole-Block native clipboard transfer is supported.

Adjacent joins support ordinary/slot, slot/ordinary, slot/slot and empty neighbours. Surviving slots keep their identities, source order and reading closures. Reading annotations remain in their independent coordinate domains; host annotations are rebased by the existing range helpers. Simple contiguous cross-paragraph text replacement distributes surviving prefix/suffix slots and relations to the output paragraphs, including multiline replacement. Consumed reading edges are removed in the same transaction, respecting retained-definition and independent-reference policy. Undo/Redo restores the complete structure.

Existing mode, adjacency, sharing and non-reading attachment restrictions remain. A join with colliding host-scoped slot/relation identities rejects instead of inventing a new identity. Structural paste requiring arbitrary Block topology or merging an identity-bearing referenced root remains unsupported. Whole-Block insertion is the alternative when its existing ownership rules permit it.

## 4. Compatibility and persistence

Native documents and native clipboard fragments containing slots declare `requiredCapabilities: ["mutable/inline-alternatives/v1"]`. The outer native envelope version is unchanged. The capability is independent of TEI and of creation flags. Unknown requirements reject during parsing before canonical admission; no readings are flattened. Older strict envelope readers reject the new reserved field rather than partially reading the resource.

Existing native documents without slots acquire no capability field and require no migration. Milestone 4 documents with slots but no declaration remain readable; their next explicit native capture/save deterministically emits the requirement. Disabling TEI inline creation preserves grouped-tab conversion and does not make saved slots unreadable. Legacy Cell admission of slots remains an explicit error.

Native Save/reopen retains all inactive readings, semantics and ownership. Canonical session Undo/Redo covers clipboard, joins and replacement. Persistent compact History enrollment retains its earlier unqualified status; this milestone does not reinterpret old Cell-keyed archives.

## 5. Bounded work and presentation

Clipboard preparation runs only on explicit user actions. Serialization uses the existing indexed ownership evidence when invoked by the live clipboard coordinator. Paste planning carries affected hosts, incoming closures and required definitions rather than taking a workspace snapshot. Removed reading traversal visits only the consumed ownership closure.

Full graph ownership validation remains in use for these structural transfers. Its validation/index cost can depend on the loaded repository; this report does not claim a fully local validator. Ordinary typing stays on the existing compact path. After full validation, eligible slot transfers reuse the existing affected-record projection updater, including owned reading relations. Unchanged document views are skipped; shared routes that cannot be updated unambiguously retain the conservative general projection fallback.

Native dirty-state membership updates follow changed edges and indexed ownership instead of capturing the document again. No document serialization, background Save or vault scan is added to typing, reading switches or dirty indicators. Explicit manual Save still performs full native capture, as expected.

## 6. Qualification

Final checks passed:

- Serial broad regression: **600 tests / 55 files** across interchange, Block tree, clipboard/rendering, native persistence and TEI navigation. The existing `portable-spike` experimental suite is excluded, as in the accepted M4 qualification.
- Follow-up rendering/native-session/clipboard run: **44 tests**. Final command/Workspace-menu run: **42 tests**. The final expanded interoperability suite passes **14 tests**, including retained nested reading definitions, boundary annotations, image-copy rejection, malformed carriers and safe HTML styling.
- `npm run typecheck`: client and server pass. Production qualification build passes; source maps were disabled to reduce build memory, with normal production minification retained. `git diff --check` passes.
- Real Chrome/Flint clipboard: copy is read-only; selected-reading external text is correct; native data wins over its lossy projection; same-host and cross-Document paste preserve inactive/nested/empty readings; cut and Undo/Redo restore exact native state and caret. One manual native Save returns the Document to clean state, and decoding the saved resource is byte-identical. There are no background saves or Markdown sidecars.
- Existing real-browser inline-editing checks pass: two-view reading switches, empty reading input, grapheme/boundary navigation, IME cancellation, replacement/split, Undo/Redo and milestone navigation.
- Two mounted occurrences update after paste/history without rebuilding either projection. Editing a freshly pasted reading dirties its owning Document after a manual Save. Workspace **Open TEI XML…** remains present and tested.

Browser fixtures use isolated Chrome profiles and in-memory save adapters. They do not overwrite user documents or source XML. Native session tests separately cover opening, closing and reopening through full Flint. Chrome/macOS input coverage does not imply other browser/platform coverage.

### Clipboard and structural measurements

Production Chrome, 1440×900, no CPU throttling. These are representative single operation samples, not latency guarantees or microsecond release targets. Planning includes validation; record publication excludes subsequent subscriber/render flush time. Columns must not be added together.

| Operation | Total | Planning | Validation subset | Record publication | Undo / Redo | Affected contents |
|---|---:|---:|---:|---:|---:|---:|
| one-slot | 6.6 | 1.2 | 0.8 | 0.4 | 4.1 / 4.2 | 4 |
| several-nested | 9.5 | 0.9 | 0.6 | 0.4 | 4.9 / 6.4 | 8 |
| cross-document | 7.7 | 0.9 | 0.6 | 0.2 | 4.5 / 4.7 | 8 |
| adjacent-join | 5.8 | 0.8 | 0.7 | 0.1 | 3.7 / 3.5 | 3 |
| cross-paragraph-replacement | 5.0 | 0.8 | 0.5 | 0.4 | 5.2 / 3.8 | 9 |

All durations are milliseconds. The several-slot fixture includes a nested slot and an empty inactive reading; the cross-Document operation transfers the same closure.

| Operation with 150 additional unrelated paragraphs | Total | Planning | Validation subset | Record publication | Undo / Redo | Affected contents |
|---|---:|---:|---:|---:|---:|---:|
| one-slot | 9.3 | 2.6 | 1.4 | 0.3 | 5.7 / 5.5 | 4 |
| several-nested | 9.3 | 1.5 | 1.1 | 0.3 | 6.3 / 6.6 | 8 |
| cross-document | 8.4 | 2.1 | 1.8 | 0.4 | 4.6 / 5.3 | 8 |
| adjacent-join | 11.6 | 1.4 | 1.1 | 0.3 | 6.3 / 7.4 | 3 |
| cross-paragraph-replacement | 19.3 | 1.3 | 1.0 | 1.0 | 9.0 / 8.3 | 9 |

Native clipboard serialization of one slot / several including nested readings measured **0.5 / 0.6 ms**, versus **0.5 / 0.7 ms** with 150 extra paragraphs. The transferred fragments contain 3 / 7 Blocks. Retained heap after explicit GC was **14.3 / 28.8 MiB** for the two fixture sizes, including the entire app, mounted occurrences and history—not isolated per-slot memory.

Affected-record counts remain identical at both sizes. Every sampled operation/history sequence records **zero repository snapshots, zero newly admitted canonical character Cells, zero unrelated DOM mutations and zero independent Document projection builds**. The harness asserts these properties. Full ownership validation, record-table preparation and index work still depend on repository size; the larger fixture's timing increase is not described as constant-time structural editing. General shared-route projection cases retain their conservative fallback.

### Existing WeGA targets

Three production Flint runs per fixture; medians in milliseconds. The recorded M4 reference is historical, not a newly paired same-session import run.

| Fixture | M4 usable | M5 usable | M4 Metadata | M5 Metadata | Release result |
|---|---:|---:|---:|---:|---|
| Small WeGA | 74.4 | 122.8 | 83.1 | 99.4 | pass |
| Large WeGA | 301.4 | 488.9 | 131.3 | 182.3 | pass |
| Derived anthology | 1093.4 | 1717.8 | 282.7 | 416.6 | informational |

Both letters satisfy usable-text targets (<500 / <1,000 ms) and Metadata activation (<250 ms). Timings are slower than the recorded M4 references; no import speedup is claimed. Anthology timing remains informational. All nine runs assert one Page, complete imports, zero canonical character Cells and zero admission/typing snapshots, with native Save/reload and Undo/Redo checks.

### Ordinary typing

The real Flint 499-character/eight-paragraph benchmark was run against read-only module overrides from accepted commit `f249c72`, then current source. The baseline measured handler median/p95 **5.0 / 10.6 ms** and settled **7.0 / 13.0 ms**; current source measured **5.5 / 11.5 ms** and settled **7.8 / 17.0 ms**. Both restore original text and record zero snapshots, aggregate status reads, service requests and worker starts. The initial current-source run was slower (**9.0 / 25.9 ms**, settled **12.9 / 32.3 ms**); it is retained rather than hidden. These variable headless timings are not user-visible latency guarantees or evidence of a speedup.

The affected-reading regression checks with one versus 300 unrelated Blocks also pass: zero unrelated payload reads, index rebuilds and snapshots during typing/Undo/Redo. Inspection confirms clipboard serialization, closure traversal, full validation and native capture are not added to ordinary typing or reading switches. No geometry renderer or per-keystroke service was introduced.

### Reproduction and evidence

Commands and harness notes are in `scripts/tei-performance/README.md`. Final local evidence:

- `artifacts/tei-m5/browser.json`: native clipboard, manual Save/decode, operation stage timings, counts and heap.
- `artifacts/tei-performance/m5-after.json` and `m5-after-stages.json`: nine WeGA/anthology samples.
- `artifacts/tei-m5/{typing-before,typing-after-first,typing-after}/results.json`: all typing comparisons; `typing-baseline-script.mjs` retains the exact read-only baseline harness.
- `artifacts/tei-m4/`: rerun inline-editing browser evidence from the current production build.

```sh
npx vitest run src/interchange src/block-tree src/rendering/mutable-clipboard.test.tsx src/rendering/compact-production.test.tsx src/persistence/native-session.test.ts src/persistence/native-vault-session.test.ts src/features/tei-import/navigation.test.tsx --exclude 'src/block-tree/portable-spike/**' --maxWorkers=1 --minWorkers=1
npx vitest run src/interchange/inline-alternatives.test.ts src/block-tree/inline-alternative.test.ts src/application/workspace-open.test.tsx --maxWorkers=1 --minWorkers=1
npm run typecheck
```

## 7. Remaining limits and recommendation

Keep the feature enabled by default within the qualified slice. General apparatus alignment, arbitrary structural paste, mode-policy expansion, automatic cross-Cavern image transfer, complete HTML/Markdown round-trip and persistent compact History remain outside this milestone. Unsupported operations fail explicitly. Chrome/macOS qualification does not claim Safari, Firefox or Ctrl-platform coverage.
