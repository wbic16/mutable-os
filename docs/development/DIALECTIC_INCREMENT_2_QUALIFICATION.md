# Dialectic Increment 2 — qualification

7 November 2026. The three implementation slices are complete. The existing default-enabled `dialectic` flag remains in use. No live provider, Sequences, temporal maps or Textual redesign was added.

## Functionality and reference integrity

- **Reply to selection / Include selection:** capture one nonempty range in an owned TextBlock inside a committed contribution, including nested table content. Selection and preview are session work. First successful use commits the linked range definition, segments and contribution atomically. Cancelled/stale requests do not leave hidden anchors. A pending selection invalidated by editing requires reselection.
- **Durable ranges:** `dialectic/range-anchor` uses the existing Document `linkedAnnotations` registry and ordinary standoff segments. Segment rebasing, splitting, joining, deletion and Undo/Redo use the native operations. Resolution distinguishes missing, unanchored, ambiguous, invalid and outside-Document targets. Shared mounted occurrences do not multiply canonical segments.
- **Minimal repair:** an unresolved passage retains its historical excerpt; explicit Reattach to selection changes its segments in one undoable edit. The UI warns that references sharing that anchor will follow the repair. A missing or explicitly deleted definition requires restoration through Undo; it is not recreated by guessing.
- **Historical versus current text:** the inspector displays current source text and the original anchor excerpt with a changed-source indication. Each range reply separately captures its own excerpt. Reattachment and later edits do not rewrite that reply history.
- **Gloss independence:** the inspector opens overlapping Glosses through the existing Gloss controller, creates a Gloss on a single resolved segment, or explicitly includes a Gloss in context. Reply anchors are not hidden Glosses. Existing annotation identity and content remain intact.
- **Context:** reply targets, session-selected context and the material supplied to the mock remain separate. Generated contributions retain exact supplied text/Gloss values, source revisions, target identities, selection origins and budget settings. These are input records, not claims about internal model attention. Exact duplicate descriptors are deduplicated; deliberately overlapping larger compositions remain separate supplied items.
- **Copying:** both native Block cloning and Mutable interchange allocate new definition/segment identities for ordinary anchored content, including clipped selections. Original anchor provenance remains historical. Conversation/contribution-wrapper interchange is explicitly rejected, including before Cut can remove its source. This is the proportionate alternative permitted by the implementation clarification; chronology-aware wrapper duplication remains deferred. Native JSON Save/Open is unaffected.

## Identity, lifecycle and shared-code impact

The retained Document owner, editor, Cells, sessions and independent Desktop/Textual registrations remain in place. Range authoring and history preserve existing editor mounts and Cell keys, including two occurrences of a source nested inside a table. Temporary highlighting uses `editor.decorations` and existing parent-relative SVG rendering; there is no new scroll listener or geometry subsystem.

| Changed modules | Purpose and scope |
|---|---|
| `features/dialectic/{anchors,references,model,controller,index,view}` | Range schema, incremental resolver, provisional selection, canonical authoring/repair, explicit Gloss context and supplied-input manifests; existing presentation ownership retained. |
| `block-tree/dialectic-range-plan.ts`, `structural-plan.ts` | Independently validate range-definition registry changes before the existing structural proof. Classify annotation-only range payload changes, including inverse operations. Unclassified structural edits retain their fallback. |
| `block-tree/projection.ts` | Expose its existing content-occurrence index; reuse inline projection updates for proven range-only changes across shared occurrences. No new renderer or child-tree representation. |
| `runtime/linked-annotations.ts` | Resolve range definitions through indexed ownership instead of the legacy broad owner lookup. The benchmark exposed this necessary integration boundary. |
| `application/{document-entity-changes,live-document-entities}.ts` | Exclude passive range anchors from Entity-reference discovery and refresh triggers. Other annotation semantics are unchanged. |
| `block-tree/clipboard.ts`, `interchange/{serializer,materialize}.ts`, `runtime/mutable-clipboard.ts` | Preserve/allowlist range definitions and reject unsupported wrappers before copy/paste/Cut mutation. Native persistence is unchanged. |
| Qualification scripts/tests | Focused range browser flow and an optional `BENCHMARK_DIALECTIC=1` fixture in the existing Flint typing benchmark. |

The index initially visits one Document's Block tree, never its Cells. Subsequent work follows changed records and inserted/removed subtrees. It does not rebuild the conversation inventory for ordinary typing. No application runtime, SQL migration, background save or generic reference framework was introduced.

## Qualification results

- **15 Dialectic cases:** application/flag compatibility, atomic authoring/history, range edits, nested/shared sources, split/join, orphan repair, stale/cancelled requests, Gloss input, consumed-context history, copy integrity and rejection, unrelated Documents, reactive-descriptor replay, and early context-budget rejection. The added watcher check verifies no broad `resourceOwner` calls or Entity inventory notification during anchored typing.
- **75 existing focused cases:** Gloss (28), structural performance/admission (10), native Block clipboard (3), Mutable clipboard (18), Document Entity changes (8), live Entity inventory (8). All passed. These were targeted runs, not an exhaustive suite; only affected cases were repeated after fixes.
- **Reactive TypeScript check:** passed. Diff whitespace check passed.
- **Trusted Chrome flow:** keyboard range selection, non-authoring targeting, submission, Undo/Redo, mock input manifest, manual native Save, fresh-page reopen and Desktop→Textual→Desktop passed. The Textual flow retained native selection and verified editing/composition plus Undo. Save transport was isolated in memory; no user files were overwritten.
- The browser exposed and qualified a fix for saved reactive target descriptors reaching `structuredClone`: controller entry points now take plain descriptor copies before canonical authoring.

See [browser measurements](DIALECTIC_INCREMENT_2_BROWSER.json), [typing measurements](DIALECTIC_INCREMENT_2_TYPING.json), [passage screenshot](DIALECTIC_INCREMENT_2_PASSAGE.png) and [Textual screenshot](DIALECTIC_INCREMENT_2_TEXTUAL.png).

## Performance

The existing real-Chrome Flint benchmark used 250 paragraphs / 25,000 characters, with 40 insertion/deletion handler samples. The enabled fixture had 250 linked anchors and the actual incremental resolver.

| Measurement | Without range anchors/index | With range anchors/index |
|---|---:|---:|
| Median synchronous handler time | 2.30 ms | 1.20 ms |
| p95 synchronous handler time | 7.50 ms | 2.60 ms |
| Repository snapshots | 0 | 0 |
| Unrelated Cell identity retained | Yes | Yes |

These local headless runs are noisy; the lower enabled timing is **not a claimed speedup** or a user-visible latency guarantee. The stronger bounded-work evidence is **zero index tree visits, 40 property reads and 40 record updates for 40 edits**. Trusted Chrome insertText, Backspace and history checks also passed. An unrelated 10,800-character annotated Document stayed unchanged in the application test.

The final application browser run observed a range reply committed and rendered in **12.8 ms** from the submission measurement point, including CDP overhead; this is an observed DOM completion measurement, not a paint percentile. Range submission used **zero snapshots and zero projection rebuilds**. Desktop/Textual switching retained the same session and mount, with **zero new views, snapshots or rebuilds**. Existing general join/copy fallbacks remain; this report does not claim all structural operations are constant-time.

## Remaining boundaries

Initial selection is one TextBlock; existing anchors can span multiple segments after splitting. Cross-Document activation, discontinuous selection and wrapper interchange remain unsupported explicitly. Shared-source navigation prefers the initiating occurrence while available, otherwise the first mounted occurrence; no occurrence chooser was added. No comprehensive orphan UI was added. Existing Increment 1 limitations, including the separately documented empty-editor composition issue, were not expanded into unrelated repairs. Increment 3 has not begun.
