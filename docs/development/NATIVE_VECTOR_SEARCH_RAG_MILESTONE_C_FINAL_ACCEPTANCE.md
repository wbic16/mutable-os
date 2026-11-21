# Milestone C Final Acceptance Report

14 November 2026. **Milestone C is formally accepted and closed by the user.** The demonstrated hosted retrieval, hybrid Scry search, native navigation, incremental indexing, Dialectic retrieval/source reading, allowance controls and partial-coverage reporting are sufficient for acceptance. The observations below remain classified as automated browser and live-provider evidence; closure does not imply that an unperformed manual test passed. No further development, testing or paid API calls are required for this milestone.

## Application and indexing status

The corrected application is running at **http://localhost:3000/**, with the server on port 3002. The final HTTP checks passed. The client includes the new selected-result correction; server recovery/accounting corrections were built and restarted earlier in this acceptance pass.

The `imported` Cavern has **347 indexed / 2,314 known saved Documents**. Its existing **50,000-token Document allowance is exhausted**. Query embeddings are now enabled with the authorised **5,000-token allowance**; the production query counter remains zero because the hosted acceptance exercises used an isolated corpus. No production Document grant was renewed. The status API still says `indexing` while maintenance walks the remaining inventory and records failures; this does **not** mean more embedding allowance remains. Workspace → Index Cavern displays used/remaining allowances and partial coverage. Provider credentials are available.

The original Poe and Ship of Theseus resources had not reached the production vector index. The live exercises therefore used copies of their actual files and native SQL mappings, with a separate 20,000-token test grant under the user’s US$10 approval. File hashes confirm that both originals remain unchanged. `Notes.ink` was not investigated or modified.

Before this pass, a stopped retrieval worker caused misleading zero accounting and continued maintenance failures. The corrections retain its terminal error, stop maintenance on worker loss, report unavailable accounting as unknown, and allow explicit refresh/resume without renewing grants. The original failure’s cause remains unknown; its error had been discarded.

## Scry and navigation

| Check | Observed result |
|---|---|
| Lexical search with partial production coverage | Poe `Prospero`: five results, 512 ms cold; Theseus `composition`: three results, 45 ms warm. Exact saved-file verification passed. |
| Lexical before semantic, distinguishable labels | Actual Chrome UI: `Prospero` initially showed six FTS5 rows, then 18 combined rows with explicit `Semantic` labels. No simulated embedding response. |
| Paraphrase relevance | “Where do the wealthy hide from the suffering of the outside world?” retrieved the abbey/provisions/isolation passage first in the scoped hybrid service query. It contains enough context to explain the refuge and its relationship to outside suffering. |
| Earlier position/change of mind | Theseus query ranked human Contribution 11 (explicit doubt) first, Contribution 7 (categorical original claim) second, and the agent’s revised formulation in Contribution 12 fourth. The first result alone is insufficient for the complete comparison; the returned set supplies the earlier position and qualification. |
| Click → native Document → selected passage | Passed in Chrome for unopened Poe, then another passage in the loaded Document. Exact native TextBlock and Cell ranges became visible and selected. |
| Unrelated malformed Document | Initially blocked navigation with “Resolve incomplete vault discovery”. After the focused correction, both navigation checks passed with the malformed file still present and its warning still visible. |
| Superseded queries and stale sources | Existing focused Scry tests verify obsolete response rejection and stable lexical selection. Native activation regression tests reject changed/duplicate sources and concurrent edits. This pass did not add another paid supersession exercise. |

Selected activation now requires **fresh successful discovery of the selected file**, a unique inspected identity, acceptable file state and no conflicting pending operation. It then retains exact byte/hash verification, current native passage validation and canonical admission. Unrelated discovery diagnostics no longer blanket-block that exact file. Cached listings or a failed discovery refresh cannot authorise it. Generic file/relocation guards remain unchanged.

Earlier navigation corrections also prevent a refresh from invalidating its own discovery fence and allow saved extraction vocabulary differences when the actual passage passes current native validation. The UI shows “Opening selected passage…” while opening.

## Live Dialectic evidence

A new test question was committed and manually saved **in the isolated Symposium copy**, then its confirmed projection was indexed. The real Dialectic controller and broker used GPT-6.1 Sol. Automatic titles, autosave and provider continuity were disabled in this test context; production defaults were unchanged. Continuity was disabled to keep retained input and cost bounded.

The actual API record demonstrates all four retrieval distinctions:

1. The model called `search_symposium` with `{"query":"physical composition identity","limit":12}`.
2. The native tool completed hosted semantic retrieval: **169 ms embedding + 43 ms local retrieval/verification**.
3. Its response reported `Partial saved semantic coverage; native handles reissued in this exchange`, with **12 `saved-semantic` items**, including human Contributions 7 and 11 and agent Contribution 8.
4. The model called `read_source` on returned contribution handles and on the retrieved Contribution 11 TextBlock. The tool returned its complete text beginning “I'm beginning to doubt my earlier claim…”. It also read the agent’s distinction between original matter and continuity through material change.

This was an explicit retrieval acceptance question, **not a demonstration of spontaneous retrieval**. The six-call allowance was consumed by one search and five serial source-read requests. The test guard blocked a seventh provider invocation. **No completed answer or successful native AI-contribution admission is claimed.** The six calls took approximately 12.4 seconds in total at the provider boundary, excluding tool and local setup time. Serial reads are a remaining usability concern, not a semantic-search failure.

The post-exchange browser summary expression also failed in the harness. Evidence therefore comes from retained actual API invocations, tool-result payloads, retrieval receipts and provider receipts—not a purported final contribution record. The harness expression is corrected; no further paid call was made.

## Incremental indexing and native persistence

The disposable exercise added a distinctive transport passage, saved/projected it, retrieved it semantically, changed it, rejected the old source stamp, and removed it. With independently chunked passages, the first changed revision **embedded one changed chunk and reused one unchanged chunk**. Removal eliminated obsolete FTS hits and obsolete vector-passages. An unchanged save/index request required **zero embeddings and zero projection reads**.

An initial fixture was too short to split into independent chunks; that failed reuse assertion was a test-design error and its calls remain included in the cost ledger. The first fixture also used a compatible legacy DTO rather than native persistence bytes. A subsequent native-envelope round-trip repeated add/change/removal, stale-reference rejection and hosted semantic queries. It correctly reused the already-paid vectors by text hash while refreshing native source mappings. No reference Document was edited. These are service/native-format tests; the real browser save was separately exercised when preparing the Dialectic question.

## Performance, cost and future improvement opportunities

Hosted service queries measured **143–593 ms for embeddings** and **9–12 ms for local search/verification** on the two reference queries. The DCP query measured 169/43 ms respectively. Returned relevance scores remain retrieval signals, not truth or confidence estimates.

Document opening remains perceptible: actual Chrome samples measured **6.25 seconds cold / 3.15 seconds loaded** in the hosted Scry run, and **7.11 / 2.64 seconds** in the malformed-file regression. These measure native Open/admission/render/reveal, not query embedding. They do not establish that indexing caused the delay. No broad rendering or persistence optimisation was undertaken, and no new user-observed typing/indexing comparison is claimed.

**Spend:** 11 embedding queries, eight Document-embedding requests, six paid GPT-6.1 Sol calls. Embeddings total **8,001 tokens**. Generative receipts total **44,659 input tokens** (31,000 cached, 13,641 cache-write, 18 ordinary) and **178 output tokens**, including 16 reasoning tokens. Estimated total **US$0.03918** using published standard/cache-write rates; a conservative calculation ignoring cache discounts is **US$0.11359**. These are receipt-based estimates, not an account invoice. Failed fixture attempts are included; pre-existing Cavern maintenance is excluded. Sources: [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [embedding price](https://openai.com/index/new-embedding-models-and-api-updates/).

Type checking passes. Ten focused Document-vault tests and ten selected native activation tests pass, including duplicate-during-Open, unrelated-edit and selected-only admission checks. The preceding host/status, worker-loss, Scry and DCP tests also passed. No new work was added to typing: the additional discovery decision runs only during explicit selected navigation and uses the existing discovery snapshot; persistence/indexing remain outside the input path.

**Final disposition: accepted and closed.** The user explicitly accepted partial production indexing, Document-opening latency, serial retrieval calls and incomplete end-to-end Dialectic answer testing as non-blocking limitations. Retain these as future improvement opportunities, together with the exhausted production indexing allowance and incomplete fixture coverage. Production semantic retrieval of the specifically chosen Poe/Theseus files still depends on their being indexed; closure does not change their coverage. No further qualification, development, testing or paid API calls will be initiated for Milestone C. Subsequent work requires separate authorisation.

Manual inspection: use Scry’s saved-passages search and compare `FTS5`/`Semantic` rows, then click a result. Inspect allowance/coverage in Workspace → Index Cavern. In Dialectic’s DCP exchange record, inspect `tools` for `search_symposium`, `semanticStatus`, `retrieval: saved-semantic`, and later `read_source` calls. A newly unsaved Contribution deliberately uses live lexical discovery rather than claiming saved semantic currency.

Persistent monetary budgets, local embeddings, broader retrieval, graph traversal and knowledge gardening remain deferred.

## Evidence

[Paid ledger](../qualification/vector-search/milestone-c-final/paid-ledger.json) · [production status](../qualification/vector-search/milestone-c-final/production-final.json) · [hosted retrieval](../qualification/vector-search/milestone-c-final/hosted-retrieval.json) · [Scry browser](../qualification/vector-search/milestone-c-final/scry-live.json) · [partial-discovery navigation](../qualification/vector-search/milestone-c-final/navigation-partial.json) · [navigation screenshot](../qualification/vector-search/milestone-c-final/navigation-partial.png) · [live DCP tool evidence](../qualification/vector-search/milestone-c-final/dialectic-live.json) · [incremental hosted](../qualification/vector-search/milestone-c-final/incremental-hosted.json) · [native round-trip](../qualification/vector-search/milestone-c-final/incremental-native.json).
