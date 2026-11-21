# Native Vector Search / RAG — Milestone C qualification

14 November 2026. **Milestone C is formally accepted and closed by the user.** The first user-facing retrieval integration and subsequent corrective implementation are accepted. The original implementation qualification below used no paid calls; the separately authorised live follow-up is recorded in the [final acceptance record](NATIVE_VECTOR_SEARCH_RAG_MILESTONE_C_FINAL_ACCEPTANCE.md). No broader semantic retrieval or knowledge-gardening work has begun. No further development, testing or paid API calls are required for this milestone.

## Scope and activation

The user-facing `semanticRetrieval` flag defaults on; external transmission defaults off. **Workspace → Index Cavern…** is available in graphical and Textual Workspaces. First use explains background indexing and OpenAI transmission. Document indexing and query embeddings have separate unchecked permissions. Refusal is retained, including when a provider or retrieval index is unavailable. The same command later reviews or changes permissions, shows coverage/errors, and refreshes or resumes indexing.

The user explicitly approved retaining the current topology after investigation: **one Vault per opened Cavern**, with separate preferences and databases when switching Caverns. Nested/multiple Vaults inside a single Cavern remain prohibited by the existing canonical storage contract. This increment does not broaden that topology or merge databases.

Approved indexing covers all eligible saved Documents in that Cavern, including future Documents and saved revisions. Preferences live in `.mutable/retrieval-preferences.json`; vectors, cache and usage remain in the existing `.mutable/retrieval.db`. Neither the authoritative schema nor the `.ink` format changed. Existing confirmed-save hooks drive automatic maintenance; there is no new Document autosave or per-keystroke indexing.

OpenAI `text-embedding-3-small` remains the installed hosted adapter, configured separately through the server's `OPENAI_API_KEY`. The UI identifies it as hosted and explicitly states that no local adapter is installed. There is no silent local-to-hosted fallback.

## Consent, maintenance and coverage

The small consent extension introduces versioned **saved-Vault maintenance** and **interactive-query** scope grants, preserving existing exact-revision grants. The server creates grants from explicit UI choices; browser requests cannot supply grants, resource identities, provider modules or paths. Scope grants remain bound to Vault identity, provider/model, index lifetime and a cumulative token allowance.

Default allowances are 50,000 Document tokens and 5,000 query tokens, configurable up to 50,000 per authorisation. They do not reset on restart or refresh. The explicit **Authorise another allowance** action approves a fresh allowance at the displayed limits; ordinary maintenance never renews consent. This also provides an explicit recovery path for unknown upload outcomes. Reservations remain durable and conservative. Revocation cancels pending work; it cannot undo an upload already transmitted. Rebuilding/removing an index invalidates the old lifetime-bound grant and requires renewed approval.

Maintenance reconciles one Document at a time, reuses unchanged vectors and reports processed/failed counts, indexed versus known saved Documents, waiting-for-confirmation states, missing credentials and incomplete coverage. A corrupt preference file disables automatic indexing and reports the problem without blocking ordinary Cavern opening. All-Cavern coverage is never inferred from a partial query. External filesystem changes still require the existing saved-scope reconciliation/Refresh; exact navigation re-verifies the selected native file.

## Scry and Dialectic

Scry's Block branch was previously a placeholder. It now supports passage search through **`/search`** and the **Scry: search passages** command, using the existing Scry interface. Entity resolution and other modes retain their existing paths.

Native `BlockSearch` FTS5 results do not depend on vector enrollment or upload consent. Following Scry's existing 150 ms query settling, lexical results publish first. A further 450 ms debounce precedes semantic retrieval. Semantic additions append without reordering the existing lexical selection; obsolete requests are cancelled and stale replies discarded. Permission/provider failures retain lexical results. Result status explains saved-only partial coverage and directs the user to indexing controls.

Saved hits retain Block identity, native coordinates, occurrence routes, source hashes and extraction profiles. Opening a passage delegates to the existing verified native Open/reveal path. Dirty live targets and superseded source evidence are rejected. Legacy-format results remain discoverable as previews but are labelled for manual opening; automatic verified passage navigation is qualified for native `.ink` Documents. Ambiguous occurrences and unsupported source mappings fail closed; this does not introduce transclusion or foreign-source navigation machinery.

DCP's existing `search_symposium` optionally supplements live lexical results with same-Symposium semantic candidates. The host fixes the resource scope; the model cannot choose another Document through this tool. Candidate Blocks must resolve in the current committed native contribution graph and match the current saved binding. Returned previews are bounded and carry freshly issued exchange-local handles. Existing `read_source` supplies the source for authoring. No vectors or entire Symposia enter the generative request, and retrieval grants no additional authoring permission.

An unbound, dirty or pending Symposium uses live native discovery without sending a semantic query. Semantic failures/timeouts also retain that path. Thus unsaved Contributions are not treated as absent knowledge.

## Foreground performance

Spacing jobs alone did **not** eliminate contention. A sustained synthetic saved-projection/indexing workload produced a 2,693 ms full mount versus 1,862 ms idle in the recorded pair. This prompted a small priority correction, rather than treating background execution as sufficient isolation.

Document opening and native Contribution admission now request a short foreground-priority pause, only when indexing is enabled. The existing canonical background scheduler respects it; the retrieval worker checks a shared deadline before planning, embedding batches and publication. Documents also retain a 750 ms inter-job gap. There is no keystroke subscription, foreground SQLite connection, new scheduler framework or Save dependency. An already-running bounded planning unit can finish; this is cooperative priority, not preemption.

Real Chrome/Flint, 250 paragraphs / 25,000 characters, native Dialectic annotations, 40 edits:

| Measurement | Idle | Background workload with foreground priority |
|---|---:|---:|
| Full mount | 1,862 ms | 1,747 ms |
| Median edit handler | 1.70 ms | 1.30 ms |
| p95 edit handler | 9.60 ms | 6.70 ms |
| Typing snapshots | 0 | 0 |
| Unrelated Dialectic tree/property/definition reads | 0 | 0 |

These are bounded headless Chrome samples, not a claimed speedup or a universal latency guarantee. The synthetic workload includes repeated saved-projection preparation as well as retrieval, and its foreground boundary exercises the real client priority notification and worker pause. Large Documents or sustained foreground use can delay indexing; CPU contention cannot be ruled out on other machines.

The existing deterministic native streaming fixture also passed with Entity/Gloss/Argument authoring, cancellation/retention and clipboard checks. First native display after received text measured **46.5 ms idle / 68.3 ms active**; final display after validation measured **49.6 / 66.1 ms**. The remaining roughly one-frame difference is reported, not hidden.

Six alternating warm native HTTP saves measured **78.9 ms median idle / 74.4 ms while cancelling an in-flight 250 ms test embedding operation**. Foreground storage wait was below 0.1 ms in that run. No material regression was observed in these fixtures; no user Document was modified for the measurements.

[Measured data](../qualification/vector-search/milestone-c/performance.json), [Scry browser result](../qualification/vector-search/milestone-c/browser.json), [Scry screenshot](../qualification/vector-search/milestone-c/scry.png).

## Qualification and limits

- Eleven worker/service tests cover native FTS without consent, Unicode coordinates, scoped filtering, persistent maintenance grants across revisions/restarts, separate query authority, caps, supersession, interruption, deletion/restoration, rollback, missing-index recovery and foreground pausing without uploads.
- Focused application tests cover acceptance/refusal, explicit allowance renewal, persistent preferences, automatic confirmed-save maintenance, hash reuse, revocation, separate Caverns, source navigation, dirty targets, progressive Scry results and fresh DCP handles. Existing knowledge-host and Cavern lifecycle tests pass. The existing 36 Scry tests also passed, including its no-snapshot/no-network ordinary typing check.
- Actual browser Scry qualification confirms lexical-first/semantic-later rendering with selected identity and focus preserved. Query responses were controlled local fixtures; this is not a new hosted relevance benchmark.
- Client/server TypeScript checks and the worker/server integration build pass. Temporary qualification servers were stopped.

The accepted Milestone B hosted endpoint baseline remains unchanged. Milestone C used local deterministic providers and synthetic/native fixtures; it does not claim a new production-Cavern relevance evaluation. Relevance signals remain neither truth nor confidence, and contextual sufficiency/answerability remain unassessed. Runtime/browser measurements are macOS arm64 only.

Implementation entry points: [Cavern controller](../../server/retrieval-host.ts), [controls](../../src/application/retrieval-controls.tsx), [worker contract](../../src/retrieval/README.md), [Scry session](../../src/features/autocomplete/session.ts), [DCP sources](../../src/features/dialectic/dcp/sources.ts).

Milestone C is accepted and closed; the following operational guidance is retained for ordinary use. The server build includes the partial-index correction; restart the application server, refresh Mutable, and choose the desired permissions in **Workspace → Index Cavern…**. Implementation itself has not authorised any uploads.


## Follow-up: Scry “Saved scope is not currently confirmed”

The first production-Cavern search exposed an overly broad gate missed by the small qualification fixtures. The running Cavern had 2,314 complete SQL resources, two incomplete and one stale, but an interrupted/pending canonical sweep disabled every retrieval operation. A `Notes.ink` resource-path collision also prevented complete coverage. Even native lexical search without embedding consent was blocked. Query-embedding consent was separately off; Document indexing consent does not grant it.

The correction opts the Cavern retrieval service into independent saved-file verification inside its existing worker. It reuses the native bounded read/path/hash and recovery guards, checks canonical projection stamps before/after asynchronous work, and excludes unverifiable candidates. Approved maintenance verifies before upload and publication. The all-Cavern coverage state remains partial; unrelated bad files do not grant authority or block verified files. Existing internal services without per-file verification retain the whole-scope gate. No canonical records or user files were repaired or rewritten.

The shared native lock adapter now loads its optional addon only when acquiring a lock. Eagerly importing that non-context-aware addon into the read-only verifier worker caused a native Node crash during qualification; read-only workers need no lock addon. The locking operation itself is unchanged. Scry's duplicate error paragraph and the API's redundant `Error:` prefix were removed.

Focused checks passed: four Cavern retrieval tests (including pending/incomplete scans, zero whole-scope discovery during query, changed/deleted/restored/symlink files, both pending-save journals, and no upload for stale projections), eleven worker/service tests, two Scry retrieval tests, five knowledge-host tests, seven recognized-save tests and eleven saved-scope tests. One concurrent host test exceeded its existing five-second timeout; its isolated rerun passed, including native save timings. Client/server type checks passed.

A read-only SQLite backup of the actual Cavern and exact original-file verification returned ten lexical candidates for the user's screenshot query in **135.4 ms**, reading **1,072,447 bytes** across ten files. This demonstrates availability and bounded source verification, not semantic relevance; no query embedding or hosted request was made. Temporary backup/index files were removed. No typing/rendering hooks were changed, and query tests assert zero whole-Vault discovery/fence scans.

The built application server must be restarted to load this correction. Query embeddings still require explicit approval in Workspace → Index Cavern. The unrelated `Notes.ink` indexing issue remains reported rather than being silently repaired.

## Manual acceptance instructions

The correction is included in commit `0a2f3d8` and the existing server build. Restart the server and reload Mutable. The embedding provider requires the server's `OPENAI_API_KEY`; a Dialectic session credential alone does not configure embeddings. Existing permissions survive the restart. This acceptance-preparation step did not restart the server, change permissions, or make provider calls.

1. Open **Workspace → Index Cavern…**. Review the two independent permissions: saved-Document indexing and query embeddings. Apply the intended permissions. Allow the test Documents to index; **Refresh / resume indexing** requests reconciliation if needed. Whole-Cavern completion is not required for verified partial results. Save source edits manually with Command-S/Control-S.
2. In Flint, use **Scry: search passages**, or choose `/search` from a text Block. Try a paraphrase of a known indexed passage, such as “Where do the wealthy hide from the suffering of the outside world?” for Poe's abbey. Lexical rows arrive first (`FTS5`); additional rows are labelled `Semantic`. Existing lexical duplicates keep their original row. Check both passage relevance and whether its context is sufficient. Open a native `.ink` result to check navigation. Missing results under partial coverage do not prove absent evidence.
3. For Dialectic, use a saved, indexed Symposium and an existing human question referring to earlier discussion. Select that contribution, open **Context & AI**, and choose **Ask AI**, without making a new edit first. Semantic search is restricted to that Symposium. Ordinary Submit makes the Document dirty; the current implementation deliberately retains live lexical discovery in that case. If preparing a new test question, save the conversation after its exchange, let indexing catch up, then select that saved human question and use Ask AI. The model chooses whether to call `search_symposium`; it may already have enough context to answer without retrieval. A search whose lexical results fill its requested limit also does not need semantic supplementation.
4. Select the completed AI contribution and open **Context & AI → DCP exchange record**. Inspect `tools` entries with `call.tool: "search_symposium"`. `result.semanticStatus` records whether semantic supplementation completed, was unavailable, or was skipped for an unsaved Symposium. An item with `retrieval: "saved-semantic"` proves a semantic hit was returned with a fresh native handle. A successful semantic status without such an item means the query completed without adding an eligible distinct hit. The generic retrieval-call count alone is not proof of vector retrieval. **Last provider attempt (session only)** shows `attempts[].toolCalls`, but successful native tool results are in the contribution's exchange record. These records do not require persistent diagnostic logging. Returned evidence alone does not prove that the model used it; inspect any subsequent `read_source` and the final response's anchors/text.
5. Reopen **Index Cavern…** to inspect indexed/known Document counts, processed/failed progress, errors and separate document/query token use. The open panel refreshes every 2.5 seconds. The controls now display remaining allowance explicitly: the applied cap minus reported usage, separately for each grant. Unavailable accounting is shown as unknown rather than zero. Usage conservatively includes reservations for uncertain outcomes. The cap fields are editable proposals until Apply; use the applied values for this calculation. Allowances are cumulative, not daily. **Authorise another allowance** explicitly renews the enabled grants; Refresh and restarting do not. Dialectic generation tokens are separate from these embedding totals.

## Deferred follow-up: persistent hosted embedding spending budget

Requested at provisional acceptance. **Recorded for investigation; not implemented.** Repeated 50,000-token indexing approvals are unsuitable for routine Cavern-wide use. Investigate replacing small repeated token grants with an explicit, persistent, user-configurable monetary budget for hosted embeddings.

The bounded proposal should retain separate document-upload and query-upload consent, per-Cavern scope, revocation and hard spending limits. Evaluate lifetime versus periodic budgets and an optional query sub-budget; do not select an amount or enable automatic renewal without user review. Reuse existing preferences and usage/reservation accounting where possible. Reserve estimated cost before dispatch, reconcile actual provider usage, retain conservative charges for unknown outcomes, and record the applicable provider/model price version. Verify current official pricing during that investigation rather than hard-coding an unverified rate. Distinguish locally estimated spend from provider billing.

Budget history must survive restarts, retries and replacement/rebuilding of the disposable retrieval index; rebuilding must neither replenish an allowance nor erase unknown reservations. Present spent, reserved and remaining amounts, progress, exhaustion and explicit top-up controls. Larger approval must not reset costs or imply permission for generative calls. Assess estimation/error margins and currency precision before implementation.

No allowance limits, permissions or runtime defaults changed at acceptance preparation. Broader RAG, semantic graph retrieval and knowledge-gardening remain deferred pending separate authorisation.


Final live acceptance and the subsequent result-navigation/status corrections are tracked in [Milestone C Final Acceptance Report](NATIVE_VECTOR_SEARCH_RAG_MILESTONE_C_FINAL_ACCEPTANCE.md). The subsequent authorised live exercise is recorded below; the user has now formally accepted and closed Milestone C.

### Live acceptance follow-up — 14 November 2026

The authorised hosted/browser exercise and selected-navigation corrections are recorded in [Milestone C Final Acceptance](NATIVE_VECTOR_SEARCH_RAG_MILESTONE_C_FINAL_ACCEPTANCE.md). Query embeddings are now enabled; the original 50,000-token Document grant is exhausted and was not renewed. Live semantic retrieval, actual DCP tool use/readback, native incremental reuse and navigation despite unrelated malformed files have evidence. Estimated test cost is US$0.03918. The six generative calls ended in further source reads, so a completed live answer is not claimed. The user has formally accepted and closed Milestone C. Partial production indexing, Document-opening latency, serial retrieval calls and incomplete end-to-end answer testing are acknowledged future improvement opportunities, not acceptance blockers. No subsequent milestone has begun, and no further qualification or paid calls will be initiated for this milestone.
