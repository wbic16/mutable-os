# Native Vector Search / RAG — Milestone A qualification

14 November 2026, Australia/Brisbane. **Milestone A is complete as a controlled corpus experiment. No Milestone B or application integration has begun.**

The separate `retrieval.db` and sqlite-vec **0.1.9 exact search** are viable for this experiment. Structure-aware chunks improve some context retrieval, but are not uniformly better than fixed windows. The strongest measured context result came from structure-aware chunks with lexical/vector rank fusion. These results support retaining the proposed sidecar architecture; they do not qualify unattended RAG or general retrieval quality.

## Corpus, consent and cost

Two unchanged fixtures: Poe’s `masque-of-the-red-death-[1c48f303].ink`, including its separate commentary tab, and `Conversation on November 11, 2026 (3).ink`, a Ship of Theseus/object-identity Symposium. Native traversal produced 74 nonempty text runs, including 19 committed Contributions; the draft was excluded. SHA-256 identities and paths are in [preparation.json](../qualification/vector-search/milestone-a/preparation.json).

After the user explicitly approved both uploads, one `text-embedding-3-small` request embedded the deduplicated passage/query texts. No full `.ink`, diagnostic metadata, resource IDs or participant identities were uploaded. No generative LLM was used.

| Measurement | Result |
|---|---:|
| Unique embedding inputs, including 14 queries | 58 |
| Actual provider input/total usage | **10,027 tokens** |
| Authorized cap | 50,000 tokens |
| Cost calculated from usage | **US$0.00020054** |
| Embedding request duration | **3,378 ms** |
| Paid calls / retries | **1 / 0** |
| Dimensions / metric | 1,536 / cosine |

Cost uses the published [model rate](https://developers.openai.com/api/docs/models/text-embedding-3-small), US$0.02 per million tokens; this is a usage-derived cost, not an invoice. The [HTTP 200 receipt](../qualification/vector-search/milestone-a/provider-ledger.json) records request ID and actual usage. Its token count exactly matches local `cl100k_base` counting. Vectors are cached for all further local work.

## Comparison and evaluation

Fixed windows: 32 chunks, maximum 384 tokens, up to 64-token overlap. Structure-aware: 34 chunks, maximum 384 tokens, whole paragraphs where possible, sentence boundaries when splitting long paragraphs, no overlap. Both preserve Contribution, tab/side/page, cell, margin and inline-object boundaries. The comparison includes both boundary and overlap policy differences; it is not an isolated chunk-boundary ablation.

Twelve positive questions and two unanswerable negatives were labelled **before retrieval**. Labels identify required source excerpts and narrative/argumentative context facets. Vector search, independent per-variant FTS5 indexes, and reciprocal-rank fusion (constant 60, ten candidates per route) use the same passage plans. The final lexical comparison isolates each variant’s corpus statistics; an initial shared-FTS run was retained privately and superseded. No queries, evidence labels or chunk plans were tuned after results arrived.

**Precision measures evidence-bearing passages; contextual sufficiency is assessed separately.** Complete-facet coverage is a reproducible proxy for sufficient evidence, checked against representative returned contexts below. It is not proof of comprehension or a blinded human assessment.

| Chunker / retrieval | Evidence precision@5 | nDCG@5 | Gold-chunk recall@5 | All context facets, top 5 | All context facets, ≤768 tokens |
|---|---:|---:|---:|---:|---:|
| Fixed / vector | 31.7% | .801 | 92.4% | 11/12 | 8/12 |
| Fixed / FTS5 | 28.3% | .782 | 86.1% | 10/12 | 9/12 |
| Fixed / hybrid | 30.0% | .807 | 90.3% | 11/12 | 9/12 |
| Structure / vector | 26.7% | .869 | 93.1% | 10/12 | 9/12 |
| Structure / FTS5 | 26.7% | .838 | 91.7% | 10/12 | 8/12 |
| Structure / hybrid | 28.3% | .866 | 95.8% | 11/12 | **10/12** |

Precision is deliberately strict: a passage must overlap a prelabelled evidence excerpt. Related discussion and repeated questions do not count automatically. Many questions have only one evidence-bearing chunk, so even perfect retrieval then scores 20% at five results. The maximum possible mean precision under these labels is 36.7% fixed and 30.0% structure. Raw precision therefore must not be interpreted as general answer accuracy or as a fair standalone winner between chunkers. Labels are specific rather than exhaustive judgements of all topically relevant prose.

The 768-token condition takes the ranked prefix of whole chunks and stops before the next would exceed the budget; it does not truncate prose, deduplicate overlap or skip ahead. Citation metadata is not counted as source-text tokens. Structure/vector returns an average 1,093 source tokens in its full top five versus 1,227 for fixed/vector—10.9% less—but loses one full-context success. The six Symposium questions produce identical vector results across chunkers because their Contributions already fit the boundary/size policy. Most chunking differences here arise in Poe’s longer paragraphs.

## Successful and unsuccessful retrievals

- **Clock and mortality, P2:** structure/vector retrieves the complete recurring-clock paragraph first and the ending second. The former describes interruption, unease and renewed revelry; the latter connects the clock’s cessation to the last reveller’s death. This supports narrative significance within 486 tokens. Fixed/vector’s first two chunks start or end mid-word, include only a truncated clock introduction and a later midnight scene, and omit the final cessation. Its full top five recover the missing evidence, but its 768-token context does not. Source Blocks include `2949aabf-bf5f-4f0d-8edb-ba3c25fc5738` (Cells `[0,1411)`) and `a3e823e6-47cd-43d3-99e8-af223ba7f42a` (`[0,419)`).
- **Contested allegory, P4:** the structure/hybrid context supplies both the interpretation of futile resistance to mortality and the explicit disagreement over allegorical readings, within 476 tokens. It preserves the qualification instead of presenting one interpretation as consensus. Relevant commentary Block: `d056f623-641e-426c-848e-7994ef8f0ed1`.
- **Changing one’s mind, S1:** both vector-only variants retrieve the human’s categorical statement (Contribution 7) and subsequent doubt (11), plus the agent’s earlier objection (8), but miss the actual revised formulation (12). This is a genuine contextual failure despite retrieving correct, highly relevant passages. Hybrid finds Contribution 12 at rank four and includes all three required stages within 536 tokens. The human’s earlier statement is Block `1f6ceb47-fc95-4687-ba0a-48d4d9d35824`, Cells `[0,187)`; the revision begins in `007e0eb4-c22c-47a7-8400-1cc0e47410a6`. Participant and ordinal metadata distinguish statements and their chronology without merging Contributions.
- **Safety and irony, P1:** structure/vector finds the precautions and Prospero’s death but misses the final passage in which the guests die. This fails the predeclared complete-evidence rubric even at five results. Manual inspection is more nuanced: Prospero’s death already supports the irony, so the context is partially useful; it does not support a complete account of the guests’ fate. We retain the failed rubric result rather than relabel it after retrieval.
- **Stranger’s costume, P5:** both vector variants find the offending disguise and the empty costume within five results, but the 768-token prefix omits the discovery. Topical precision does not guarantee enough narrative context.
- **Unanswerable questions, N1/N2:** questions about an antibiotic dosage and a court judgement still return plausible-looking plague/ship passages. Neither answer exists in the corpus. Top cosine similarities are approximately .387 and .380 for structure/vector. No answerability threshold is qualified from two examples, and no generated answer is claimed.

[Representative returned contexts and full source spans](../qualification/vector-search/milestone-a/examples.json) and [all metrics/ranks/source references](../qualification/vector-search/milestone-a/results.json) retain both successes and failures.

## Performance and storage

Apple M1, macOS arm64, Node 22.12.0; existing better-sqlite3/SQLite runtime. Each warm route has 280 measurements, over the 14 cached query vectors. These times include the experiment’s synchronous query wrapper and candidate ranking. They **exclude network query embedding**, extraction and UI rendering.

| Local search | p50 / p95, ms |
|---|---:|
| Fixed vector | 2.36 / 3.00 |
| Structure vector | 2.40 / 4.79 |
| Fixed FTS5 | .096 / .131 |
| Structure FTS5 | .092 / .132 |
| Fixed hybrid | 2.61 / 3.50 |
| Structure hybrid | 2.50 / 3.07 |

Fresh connection, extension load and first fixed-vector query: median 4.18 ms, p95 5.35 ms over ten reopenings. This is **not an OS-cold-cache measurement**. Final-run maxima included 48.4 ms for structure/vector and 30.3 ms for structure/hybrid; the initial local run also had a 250 ms hybrid outlier. Causes were not profiled, so these figures are not a browser latency guarantee. No further timing loops were run to seek better numbers.

Native preparation measured 405 ms for Poe, 531 ms for the Symposium, and 711 ms for chunk/gold/manifest work; total preparation was 1.72 seconds. These are one-run command-line measurements. Building the derived DB from cached vectors took 140 ms. The single embedding batch took 3.38 seconds; it does not establish latency for a new individual query.

The checkpointed database is **13,012,992 bytes (13.01 MB)**. The post-build WAL snapshot was **13,188,152 bytes**; it was truncated after checks. This snapshot is not a continuously sampled peak. Most DB storage is the two `vec0` vector-chunk tables at 6,299,648 bytes each, despite just 405,504 raw Float32 vector bytes across the 66 passage rows. This is substantial small-corpus allocation overhead and must inform later configuration; it is not evidence that every passage consumes that much storage. The A/B experiment deliberately keeps two vector tables. Provider JSON vector caches and copied fixture/projection artifacts are additional experiment evidence, not included in the DB size.

## Source correctness, semantic scope and boundaries

All **164 source spans in 66 passages** round-trip exactly through native Cell/UTF-16 coordinates, including after SQLite reopening. Resource IDs, Block GUIDs, occurrence routes, source revision hashes and Contribution attribution are retained. Unicode/combining-Cell and inline-object checks pass; changed excerpts and stale/foreign Resources or occurrences are rejected. Exact nearest neighbours agree with an independent brute-force cosine check. Injected transaction interruption rolls back both vector and passage rows; reopened results match. [Checks](../qualification/vector-search/milestone-a/local-checks.json).

Document semantics remain distinct: this Symposium contains seven Document Entities, six Arguments, one argument relationship and twelve range anchors. No canonical Vault Entity/Claim mapping was invented, no second semantic registry was created, and embeddings were not made from trusted native metadata. A future retrieval result must still obtain fresh DCP authority; an experiment locator is not a source handle. The known-fixture scope does not qualify arbitrary private/fallback content filtering, cross-Vault authorization or semantic-model unification.

There are **no application hooks or source-code changes**: `mutable.db`, `.ink` formats, editor input, rendering, manual saving and autosave paths remain untouched. Application Undo/Redo, edit/split/merge lifecycle, asynchronous job cancellation and typing performance were not exercised: this command-line experiment is not installed in those paths. Hash-reuse and transaction checks must not be mistaken for integration qualification.

## Recommendation

Retain separate derived `retrieval.db`, exact sqlite-vec 0.1.9 and native source mapping as the architectural direction. Structure-aware chunks plus lexical/vector fusion are the most promising tested baseline for bounded context, but retain fixed-window results as a control: no universal quality advantage has been established. Preserve explicit partial-context and no-evidence handling, and account for small-index allocation overhead before integration.

**Stop here for review.** Milestone B, editor indexing, new resource/semantic registries and generative RAG remain unimplemented.
