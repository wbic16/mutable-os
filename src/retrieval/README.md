# Internal derived retrieval service (Milestone B)

`openRetrievalService()` owns one worker and one `.mutable/retrieval.db` per existing Vault. Its source connection opens `mutable.db` read-only. It never decodes or writes Documents, modifies canonical SQL tables, opens a generative-provider session, or registers an HTTP/UI route.

`derivedRetrieval` defaults to true in configuration; the knowledge host checks it on internal attachment. Availability does not authorize external uploads. Milestone C attaches this service through `CavernRetrieval` after explicit Cavern opt-in, or on a local lexical search. The separate `semanticRetrieval` flag controls the user-facing integration. Document and query uploads remain separately consent-gated.

## Host contract

```js
const service = await openRetrievalService({
  vault: absoluteVaultDirectory, vaultGuid,
  enabled: featureFlags.derivedRetrieval,
});
const {indexId} = await service.status();
// Construct a grant only from actual explicit user approval; never from model output.
await knowledgeHost.attachRetrieval(lease, service, approvedDocumentGrant);
const result = await service.query(query, {
  key: 'consumer-search', signal,
  consent: approvedQueryGrant,
  liveState: resourceId => dirtyResources.has(resourceId) ? 'dirty' : 'unknown',
});
```

Attachment verifies Vault path/identity. The host schedules reconciliation after confirmed saved SQL coverage, using `setImmediate` outside source publication/foreground locks. Foreground storage invalidates the retrieval epoch and aborts pending work without awaiting it. During unconfirmed saved coverage the service rejects queries. Closing the last host lease closes the worker. `flushRetrieval()` is an explicit qualification/drain method, not part of Save.

Direct internal callers can use `index(resourceId, {contentHash, consent, signal})`, `reconcile()`, `query()`, `status()`, `invalidate()`, `setAvailable()`, `close()` and `terminate()`. Direct callers must supply their own saved-scope invalidation lifecycle. A direct result verifies the current **SQL saved projection**, not an external filesystem edit that has not yet been reconciled. `verify({vaultGuid, resourceId, stamp})` checks source currency at use time; it does not issue a DCP handle or authorize native operations.

Queries return exact source spans with Resource/Block identity, occurrence path, native Cell/UTF-16 coordinates, source hash, extraction profile, saved generation, Contribution participant/ordinal and text proof. `liveCurrency` defaults to `unknown`; supplied dirty state becomes `unsaved-changes`. Never interpret either as a clean live editor snapshot.

## Consent and providers

The embedding adapter interface is `createProvider(options) -> {identity, external, embed(texts, {signal, scope})}`. Provider modules are trusted internal host dependencies, not wire-format/plugin URLs supplied by models. The production adapter is independent of Dialectic settings and uses only OpenAI `/v1/embeddings`, `text-embedding-3-small`, 1,536 dimensions. It obtains the server credential from `OPENAI_API_KEY` or explicit host options. A later local provider can implement the same interface; no local model is required now.

A hosted grant is an internal record:

```js
{
  approved: true, id: 'unique-approval-id', indexId, vaultGuid,
  model: 'text-embedding-3-small', maxTokens: 1000, expiresAt: isoTime,
  documents: [{resourceId, contentHash}], // exact approved saved revisions
  queries: [sha256OfExactQueryText],
}
```

Document and query permissions are separate. Unchanged cached inputs need no upload; new text/revisions require matching permission. A grant is bound to this index lifetime. A missing/rebuilt index gets a new `indexId` and cannot reuse an old grant. Usage reservations are durably committed before transmission; interrupted/unknown requests retain their reservation and never replay automatically. Changing a grant under the same ID is rejected. Receipts contain timing, usage and request ID, not credentials or request text. Token counting and native work remain inside the worker.

## Index and retrieval contracts

- One active `vec0` exact cosine table and one FTS5 index. Default vector allocation `chunk_size=128`; standard 4 KiB SQLite pages. Native library pinned to `sqlite-vec@0.1.9`.
- Structure-aware passage planning is the default. `profile.chunking: 'fixed'` is a comparison option requiring explicit rebuild of the active plan; query `strategy: 'hybrid' | 'vector' | 'lexical'` is independent and does not rebuild persistence.
- An unchanged source stamp avoids projection reads and chunking entirely. Changed metadata rebuilds native source references while input hashes reuse vectors. Active vectors are stored once, not duplicated in a second cache index. At most 512 orphan vectors are retained as ordinary BLOBs for up to seven days, pruned during index maintenance; these are excluded from nearest-neighbour search. SQLite may retain free pages until an explicit future maintenance operation; expiration does not promise immediate physical file shrinkage.
- Publication atomically replaces a Resource's passage/FTS/vector records. Source stamps and host cancellation epochs are checked before/during/after publication and again before result delivery. A change in the separate source DB cannot participate in the sidecar transaction; read-side revision checks ensure an obsolete row is not returned as current evidence.
- Indexing uses only canonical owned local occurrences, preserving independent flow boundaries. Foreign/transcluded references and semantic graph expansion are not acquired by this milestone. Document Entities/Arguments are not promoted into Vault Entities/Claims.
- Default hybrid retrieval fuses ranks with reciprocal-rank constant 60. Results expose RRF, cosine distance and BM25 as **retrieval signals**, never confidence/truth. Candidate overfetch is bounded and partial coverage is explicit; it is not an exact top-k claim over an arbitrarily filtered scope.
- `evidence` distinguishes retrieved, incomplete and no established evidence. `answerability` and context sufficiency remain `not-assessed`. There is no similarity cutoff declaring an answer present or absent.

Bounds: 16 pending worker requests, 120-second request timeout, 30-second provider timeout, 10,000 Resources per explicit reconciliation; per Resource 100,000 owned occurrences, depth 128, 4 MiB extracted text, 20,000 passages; 384 tokens/passage, 512 spans and 256 KiB source-map data/passage. Queries: 4,096 characters/1,024 tokens, 1–20 results, ≤200 candidates per route, ≤200 occurrences per vector and 2 MiB assembled text/source-map data. Oversized source plans fail rather than silently dropping text. Query truncation is reported in coverage.

Missing sidecars initialize safely from confirmed projections. An incompatible profile/platform requires `rebuild:true`; the inactive old sidecar/WAL files are preserved under a `.replaced-…` name for recovery and are never queried. A corrupt/unrecognized sidecar fails closed rather than replacing files automatically. Review/remove recovery archives explicitly. These operations never replace `mutable.db` or `.ink`.

## Qualification

Build: `node scripts/build-sqlite-foundation.mjs`. Service checks: `node --test --test-concurrency=1 src/retrieval/service.test.mjs`. Save-hook checks: `vitest run server/sqlite-knowledge-host.test.ts`.

The test provider is not shipped by the server build. It performs no network requests and is selected only by qualification callers. [Qualification report](../../docs/development/NATIVE_VECTOR_SEARCH_RAG_MILESTONE_B_QUALIFICATION.md).

## Milestone C integration

**Accepted and closed by the user on 14 November 2026.** See the [final acceptance record](../../docs/development/NATIVE_VECTOR_SEARCH_RAG_MILESTONE_C_FINAL_ACCEPTANCE.md). Partial production coverage, native opening latency, serial retrieval calls and incomplete end-to-end answer testing remain non-blocking future improvements. No further milestone testing or paid calls are planned; subsequent development requires separate authorisation.

`server/retrieval-host.ts` owns `.mutable/retrieval-preferences.json` and its explicit server-derived grants. A scope grant adds `scope: {version:1, kind:'saved-vault-maintenance'|'interactive-queries', vaultGuid}`. It is still bound to the provider/model, Vault, index lifetime, expiry and cumulative token cap. Maintenance authorises future saved revisions within that Vault; it never authorises query uploads. Revocation cancels pending work. Renewal is an explicit UI action permitting another stated allowance, including retrying an unknown outcome; background work never renews a grant. Missing/rebuilt indexes require a new explicit grant.

The current storage topology is retained: one Vault per opened Cavern, independent consent/indexes on Cavern switching, no nested Vault enrollment. `Workspace → Index Cavern` provides first-use acceptance/refusal, permissions, caps, progress, errors and Refresh/resume. Refusal requires neither a provider nor a working retrieval sidecar. Hosted credentials use the server's `OPENAI_API_KEY`; no local provider is advertised as installed and there is no hosted fallback.

The Cavern service opts into worker-side exact-file verification (`verifySavedSources`). Each candidate must have a complete canonical SQL projection and matching saved file bytes, with native-pair/Document-save recovery, relocation and path guards intact. A pending or incomplete whole-Cavern sweep does not disable independently verified sources. Query verification is bounded to the returned candidates and 40 MiB of file bytes; omissions remain explicit partial coverage. Indexing checks before upload and before publication; no whole-Document decode or whole-Vault discovery is added. Internal callers without this verifier retain the original whole-scope gate. Maintenance runs in sequential Documents with a 750 ms gap. `pauseMaintenance()` uses a worker-shared deadline; foreground Document opens and streamed/native Contribution admission request a five-second pause, throttled and only when indexing is enabled. The existing canonical saved-index scheduler also respects this boundary. No keystroke hook was added, and no Save awaits retrieval. Already-running native planning may finish its bounded unit; this is cooperative priority, not CPU preemption.

Scry's `/search` command and `autocomplete.search` action use native `BlockSearch` FTS5 even without vector enrollment. Query embeddings follow a further 450 ms debounce and merge behind existing lexical rows. Same-Symposium DCP `search_symposium` can supplement live lexical results; dirty/unbound/pending sources stay on native live discovery. Returned semantic previews use newly issued local handles after native validation, not saved handles or additional permissions.

[Milestone C qualification](../../docs/development/NATIVE_VECTOR_SEARCH_RAG_MILESTONE_C_QUALIFICATION.md).
