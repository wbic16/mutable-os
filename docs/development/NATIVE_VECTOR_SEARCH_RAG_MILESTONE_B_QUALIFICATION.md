# Native Vector Search / RAG — Milestone B qualification

14 November 2026. **The internal derived retrieval service is implemented. Milestone C and Scry/Dialectic UI integration have not begun.**

The service uses one per-Vault `.mutable/retrieval.db`, pinned sqlite-vec **0.1.9**, structure-aware passages and hybrid FTS5/vector rank fusion. It reuses the confirmed native SQL projection through a separate read-only connection. No authoritative `mutable.db` schema or `.ink` format changed. No generative LLM or new semantic registry was introduced.

## Implementation and activation

[Service/API contract](../../src/retrieval/README.md). The service is a dedicated Node worker with its own `retrieval.lock`, distinct from the canonical writer lease. The existing knowledge host has an internal attachment point: after saved projection is confirmed, it schedules derived reconciliation outside the publication/Save lock. Neither Save nor normal editing awaits embeddings. The `derivedRetrieval` feature flag defaults on under repository conventions; **no application installs the service or authorizes uploads automatically**, and no browser endpoint/UI was added.

An unchanged source stamp returns before reading the Document projection or planning passages. Changed sources are replanned, but unchanged text hashes reuse their vectors. Source paths, generations, coordinates, occurrence routes and Contribution attribution can change without re-embedding identical text. Active vectors are stored once; a bounded ordinary-BLOB cache retains at most 512 unused vectors for up to seven days, pruned during maintenance, for restoration/reuse. Cached unused vectors do not participate in nearest-neighbour ranking.

Each Resource’s passages, FTS and active vector references publish in one sidecar transaction. Saved-source stamps and cancellation epochs fence publication, query verification and delivery back to the host. Because two independent databases cannot share a canonical write transaction, a source change may leave an obsolete derived row temporarily; it is rejected at read time and removed on reconciliation. No such row is asserted to be current evidence.

The provider contract is separate from Dialectic configuration. OpenAI `text-embedding-3-small` is the hosted adapter; a trusted host can supply a local adapter later. Hosted grants name the Vault, index lifetime, model, exact approved Document revisions and/or query hashes, expiry and token cap. Document permission never implies query permission. Reservations persist before transmission; unknown outcomes cannot silently retry under the same grant. Returned Document vectors can be reused even if later native publication is cancelled. Missing/rebuilt indexes invalidate old lifetime-bound grants.

## Storage investigation and chosen defaults

The allocation cause is confirmed in the [pinned sqlite-vec implementation](https://raw.githubusercontent.com/asg017/sqlite-vec/v0.1.9/sqlite-vec.c) and local measurements: the default allocation is 1,024 vectors. At 1,536 Float32 dimensions, one allocation reserves **6,291,456 vector bytes**, before SQLite overhead. Milestone A kept two independent experimental vector tables, doubling this cost. It was not principally caused by the native source metadata or SQLite page size.

Measured bytes for a single isolated vector table, 4 KiB pages:

| Vectors | 32-vector allocation | **128-vector allocation** | Default 1,024-vector allocation |
|---:|---:|---:|---:|
| 0 | 32,768 | 32,768 | 32,768 |
| 1 | 229,376 | 819,200 | 6,336,512 |
| 34 | 425,984 | 819,200 | 6,336,512 |
| 128 | 819,200 | 819,200 | 6,336,512 |
| 1,024 | 6,365,184 | 6,356,992 | 6,348,800 |
| 10,000 | 61,952,000 | 62,459,904 | 63,250,432 |

Raw vector storage at 10,000 rows is 61,440,000 bytes. With 128-vector allocations, 8 KiB pages increased the empty table from 32,768 to 65,536 bytes and the 34-vector table from 819,200 to 851,968 bytes; they did not solve allocation overhead. Indicative synthetic 10,000-vector median queries were 34.6 / 30.7 / 36.0 ms for allocation sizes 32 / 128 / 1,024 respectively; these ten-sample timings are not a semantic benchmark.

**Production defaults: one active vector table, allocation 128, standard 4 KiB pages.** The final-schema two-fixture service database measured **1,167,360 bytes (1.17 MB)**, including FTS and native source maps, versus Milestone A’s 13,012,992-byte A/B database. The earlier live-query database measured 1,032,192 bytes before retry-ledger/cache hardening; these are separate recorded runs. Fixed-window planning remains internally selectable, requiring a deliberate plan rebuild rather than a duplicate active index; query strategy is independently configurable without rebuilding.

Profile/platform incompatibility fails closed unless explicit rebuild is requested. Rebuild preserves the inactive prior sidecar under a recovery filename; it is never queried as another production index. Corrupt/unrecognized files require explicit recovery, not automatic deletion. Reclaiming expired cache rows does not guarantee immediate physical file shrinkage; SQLite free pages and recovery archives need deliberate future maintenance.

[Storage measurements and reproduction script](../qualification/vector-search/milestone-b/storage.json).

## Live query qualification and cost

The user separately approved exactly two query uploads, capped at 1,000 tokens. The selected Documents were indexed using **cached Milestone A vectors**, with no new Document upload. Two real OpenAI embedding requests then exercised the service’s hybrid query and native-source verification paths.

| Query | Provider time | Local retrieval + proof | End-to-end |
|---|---:|---:|---:|
| Clock strikes and the ending | 2,531 ms | 4.69 ms | 2,539 ms |
| Human’s revised view of physical composition | 595 ms | 5.44 ms | 602 ms |

Actual provider usage: **41 tokens total**, two requests, no retries. Usage-derived cost: **US$0.00000082** at the published [US$0.02/million-token rate](https://developers.openai.com/api/docs/models/text-embedding-3-small). The first/second difference is observed, not attributed to a particular network or provider cause. Two samples do not establish a latency SLA.

The clock query returned the complete recurring-clock paragraph and the ending first and second. The revision query returned the human’s doubt, earlier categorical position, the agent’s objection, and the agent’s revised formulation in its first four results, with distinct native Contribution/source identities. The provider measurements cover the unchanged embedding request contract; subsequent retry-ledger hardening was qualified deterministically without additional paid calls. The [final-schema cached replay](../qualification/vector-search/milestone-b/cached-replay.json) indexed all 34 passages, verified seven source spans across five returned hits, and confirmed that both unchanged Documents require zero projection reads and zero new embeddings.

[Live results, source references, receipt IDs and usage](../qualification/vector-search/milestone-b/live.json). The production query response exposes RRF/BM25/cosine values as retrieval signals, never confidence or truth. It distinguishes retrieved evidence, incomplete evidence and no established evidence; answerability and contextual sufficiency remain `not-assessed`. There is no arbitrary similarity threshold. Candidate budgets and stale exclusions are explicit, and an empty result does not prove a question unanswerable.

## Correctness and lifecycle qualification

Seven focused service tests pass, covering:

- Initial indexing; unchanged sources skip projection reads; title-only changes reuse vectors while replacing source metadata.
- Native text edits/save projections invalidate old references; confirmed deletion removes results; restoration reuses cached vectors.
- Missing sidecar recreation and incompatible-profile/fixed-window rebuild preserve the canonical projection.
- Worker termination during embedding, durable unknown-outcome reservations, no implicit replay, superseded queries/jobs, and successful reopening.
- Fault injection during actual passage/vector publication restores the prior sidecar rows atomically.
- Exact Unicode/combining-character source maps; forged occurrence maps are excluded rather than returned as evidence.
- Foreign Vaults, disabled service, unsupported profiles, unapproved revisions/queries and reused approval IDs are rejected.

Five knowledge-host tests pass, including actual native Save routes and the new confirmed-projection attachment lifecycle. Twenty-four existing foundation tests also pass. Both server and client TypeScript checks pass, as does the server worker build. No test provider is shipped by the build.

Source references retain Vault/Resource/Block identity, revision, coordinates, occurrence routes and Contribution attribution. Query verification reads only returned source Blocks and their occurrence ancestors, rather than rescanning the whole repository. These are saved-source references, **not fresh DCP handles or permission to mutate content**. Live currency defaults to `unknown`; a consumer-provided dirty state is reported as `unsaved-changes`. Host invalidation makes retrieval unavailable during unconfirmed saves. Direct internal callers must wire the equivalent lifecycle and must not mistake SQL confirmation for detection of an unreconciled external filesystem edit.

Document Entities/Arguments remain distinct from canonical Vault Entities/Claims. No semantic-model unification, foreign-reference acquisition or graph expansion was added. The qualified passage planner follows local canonical owned occurrences; source authority for future transclusion/foreign scope expansion remains a later review boundary.

## Foreground performance

The existing **real Chrome/Flint** typing harness used 250 paragraphs / 25,000 characters, Dialectic range annotations and 40 edits. The controlled comparison ran idle versus continuous separate-worker projection/indexing of a synthetic 40-paragraph Document. The active run deliberately stresses repeated saved changes, exceeding ordinary single-save activity.

| Measurement | Idle | Continuous indexing |
|---|---:|---:|
| Median edit handler | 1.50 ms | 1.70 ms |
| p95 edit handler | 3.40 ms | 3.20 ms |
| Full initial mount | 2,197 ms | 2,410 ms |
| Typing snapshots | 0 | 0 |
| Unrelated Dialectic tree/property/definition reads | 0 | 0 |

Real insertion, Backspace, split, Undo/Redo, caret/focus and unrelated-cell stability checks pass in both runs. No typing/network/save hook was introduced. **No material typing regression was observed**, but full mounting was **212 ms (9.7%) slower** under the deliberately continuous workload. That resource-contention result remains a limitation; this experiment does not establish zero rendering impact or guaranteed user-visible latency. Scheduling during application mounting must be assessed before later UI integration. An earlier exploratory pair overlapped other qualification processes and is retained separately, not used for this comparison.

Six alternating warm native HTTP saves measured **90.65 ms median idle and 93.51 ms while cancelling an in-flight 250 ms local embedding request**. The host’s measured foreground wait was under 0.3 ms in the recorded comparison. Save receipts completed without waiting for the provider. Single cold/initial measurements varied more (roughly 55–85 ms) and are not used to claim a speedup. No material warm-save regression was observed in this bounded fixture.

[Performance data and harness output](../qualification/vector-search/milestone-b/performance.json). These are focused samples, not a broad browser benchmark. The temporary qualification server has been stopped.

## Review boundary

Milestone B delivers the derived service, confirmed-projection hook, consent-gated embedding adapter, bounded retrieval and source validation. It introduces no application auto-indexing enrollment, Scry/Dialectic UI, generative RAG, or Milestone C behavior. No substantial restructuring of canonical storage or editing was required.

Remaining limits for review: macOS arm64 runtime qualification only; external query latency still dominates uncached interactive queries; continuous background CPU work can slow full mounting; exact revision-scoped hosted grants require renewed approval for newly uploaded text; arbitrary corpus relevance/answerability remains unqualified. The service must not be presented as a complete or self-authorizing semantic knowledge source.
