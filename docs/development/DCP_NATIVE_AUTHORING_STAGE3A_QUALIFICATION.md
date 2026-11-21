# DCP native authoring — Stage 3A qualification

9 November 2026. Stage 3A implements existing managed-image binding and bounded mixed native-fragment admission. `dcpNativeAuthoringStage3ManagedImages` is enabled after qualification; it requires Stage 1, `managedAssetClipboard` and the native image renderer. Stage 3B has not begun.

## Highlight diagnostic

The original planning exercise retained a summary, but its temporary raw provider/admission logs were deleted. The summary proves an anchor was present and the requested source highlight absent; it cannot distinguish generation, interpretation or materialisation. **The historical cause remains unresolved.** Absence of a validation error is not treated as evidence of model omission.

One focused follow-up repeated the synthetic exercise with `gpt-5.4-mini`, existing instructions and the standard single repair. Its retained [diagnostic artifact](DCP_STAGE3A_HIGHLIGHT_DIAGNOSTIC.json) includes raw provider turns, tool results, final response, repair diagnostic and admitted native source annotations. Both composition attempts explicitly generated `style/highlight` targeting the exact “green patina” anchor. The first attempt reused a composition ID; normal repair corrected the identities. Native admission preserved both the range anchor and highlight. No interpretation/materialisation defect or specific highlight-guidance defect was demonstrated. No highlight prompt additions or task-expectation enforcement were introduced. No user Document was touched.

## New vocabulary inventory

| Construct / discovery | Qualified meaning and limits |
| --- | --- |
| `image {id,kind:'image',source,revision,alt}` | **One new composition kind.** `source` is a current issued Block handle, with its read revision, resolving to a committed managed image in this Document. `alt` is new alternative text, at most 1,024 UTF-16 code units. No URL, asset/Cavern ID, hash, capture, metadata, destination or native DTO fields. |
| `media.image` | Existing catalogue ID now describes managed binding, its purpose, parameters, shared native operation and prerequisites. Authorability is independent of whether a suitable source/session has been supplied. Acquisition, generation and external-image references remain unavailable. |
| `read_source` image inspection | Bounded resource kind, alternative text, verification requirement and capability ID alongside existing native handle/revision. No trusted resource identifiers, bytes or image perception. Discover image children through native contribution/compound inspection; the text-only inventory remains text-only. |

At most **8 image occurrences** per response, each referencing a native-verified PNG/JPEG original of at most **10 MiB**. Repeated references are verified once per preparation. Each generated image counts as one Block against the unchanged 256-Block budget; nested shells retain existing budgets. Retrieval, inspection, provider and capability-detail budgets are unchanged. Both provider schema modes and earlier disabled-feature contracts remain supported.

Binding creates a fresh image Block sharing the original managed reference. It does not copy source annotations, layout configuration, provenance or source URL. This is resource binding, not native cloning. Images can be nested in existing composition, including tabs and named margins.

## Native admission and lifecycle

`ManagedAssets.verifiedImage` reuses `/api/assets/verify`, whose native store verifies stored bytes against their hash and manifest. It rejects malformed/foreign references and mismatched type/size/identity, snapshots session identity, and checks cancellation, disposal and feature/session validity after response parsing and immediately before commit. No import lease, download, acquisition, publication or new binary is needed for preparation. Normal image rendering continues to use the existing shared runtime URL cache.

`managedImageBlock` is shared with the human explicit-resource image route. A host-private assembler combines its native leaf with prepared DCP composition, preserving ordinary and named owned placements. Neither fragments nor slots are exposed on the wire. `insertFragment` now supports bounded transactions for insertion without linked-definition merging; broader clipboard cases retain their existing path. The final canonical transaction still admits definitions, source annotations and composition atomically, with normal ownership and protection validation.

Undo removes the new Block and its contribution effects; Redo restores them. Neither operation deletes the pre-existing original. Native save/reload retains the same resource relationship. Saving remains manual. Submitted image configuration remains protected; the existing image view introduces no operational mutations.

## Qualification

**198 deterministic tests across 11 Vitest suites, plus 15 native asset-store tests, passed. Reactive and server TypeScript checks passed.** This includes prior Stage 1/2 integration and historical vocabulary checks.

- Shared human/native preparation equivalence; nested image ownership and fresh identities; protected content; native persistence into a fresh repository and Undo/Redo.
- Forged, expired and foreign handles; stale revisions and changed source content; unmanaged, missing, corrupt, foreign and mismatched resources; oversized resources and alternative text; cancellation/disposal and session changes during parsing or immediately before admission.
- Binding and generated-descendant limits; verification deduplication; no preparation-time reacquisition/content download; rollback of mixed fragments and source annotations after an injected post-insertion failure.
- Feature-disabled modes, OpenAI/Anthropic schema negotiation and bounded catalogue discovery without trusted resource IDs.
- Zero snapshots, global reference rebuilds, projection rebuilds or unrelated record reads during mixed insertion/Undo/Redo with 0 versus 300 unrelated paragraphs. Typing triggers no asset requests, DCP discovery, snapshots or projection rebuilds. No geometry, typing, indexing or automatic-save path was added.

Suites: `dialectic.test.tsx`, DCP `capabilities.test.ts` / `dcp.test.ts`, server `providers.test.ts`, `audit-dcp-vocabulary.test.ts`, `structural-performance.test.ts`, `managed-assets.test.ts`, `resource-url.test.ts`, `clipboard-images.test.ts`, `block-clipboard.test.ts`, `native-resource.test.ts`; separately `node --test server/managed-assets.test.mjs` and `npm run typecheck`.

Remaining scope is unchanged: standalone managed image Blocks only in 3A, not inline-image extraction or retained capture binding. Stage 3B–3E, media generation, fallback, notices, task expectations and retroactive editing remain deferred. The canonical audit's other outstanding operations remain outstanding.
