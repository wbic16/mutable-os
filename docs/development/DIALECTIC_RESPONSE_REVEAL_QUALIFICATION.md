# Dialectic response visibility investigation

2026-11-12. Status: reveal ordering and repeated save-time identity scans are corrected. A subsequent observed long wait is now traced from **Transient DCP response — not committed**: native publication waits for complete provider generation. Switching streaming off did not remove that wait in the bounded comparison below. This does not establish the cause of every earlier reported episode.

## Streaming-off experiment

At the user's request, the final two authorised inference calls compared actual OpenAI `stream:false` with `stream:true`. Both used GPT-6.1 Sol, the existing XML instructions and native admission, a 4,096-token ceiling, default reasoning, and the returned `default` service tier. Each used the same saved four-contribution fixture in an isolated headed browser. Different conceptual prompts requested seven substantive paragraphs, approximately 650 words: flood-defence risk versus scientific explanation. Tool calls were disabled in both requests to isolate one generation per case and remain within the paid-call ceiling. This does not qualify the normal tool continuation workflow.

| Measurement | Streaming off | Streamed control |
|---|---:|---:|
| Provider request to completed response | 36.83 s | 36.54 s |
| Submit to new native contribution's positive viewport intersection | 42.06 s | 40.31 s |
| Completed provider response to viewport intersection | 1.21 s | 0.95 s |
| Native admission | 859 ms | 710 ms |
| XML lowering + preparation | 18.9 ms | 11.0 ms |
| Paragraphs | 7 | 7 |
| XML UTF-8 bytes | 5,833 | 5,925 |
| Input tokens | 7,533 | 7,552 |
| Output tokens, including reasoning | 1,103 | 1,154 |
| Reasoning tokens | 124 | 131 |

Both responses passed validation and committed without repair. Each exchange recorded two commits (human and AI), zero repository snapshots and zero enumerations detected by the specific full-repository `Object.values` counters. The measured viewport event belongs to the newly mounted contribution, excluding visibility events from earlier contributions. Intersection is a display proxy, not a compositor paint receipt. Autosave and diagnostic logging remained disabled; active Vault indexing was not reproduced.

The non-streaming request genuinely returned a completed JSON HTTP response. A private harness adapter then supplied its completed envelope to the unchanged provider parser; it emitted no text deltas or partial preview. Production streaming defaults were not changed. This isolates the provider transport experiment without adding a production non-streaming implementation.

Conclusion: non-streaming did not fix the long wait in this comparison. Generation still took approximately 37 seconds, followed by approximately one second of local publication. One distinct prompt per mode cannot establish general throughput equivalence or a statistically significant difference. The longer non-streamed submit-to-display time also includes more conversation setup time. There is no evidence here supporting disabling streaming as a latency remedy.

Evidence: `artifacts/dcp-render-live/{flood-nonstream,theory-stream-control}.json`, wire receipts, CPU profiles, traces and final screenshots. `scripts/check-dialectic-render-live.mjs` supports `DCP_LIVE_STREAM=0` and `DCP_LIVE_NO_TOOLS=1` for this experiment. Exactly **18 inference calls total** have now used the three six-call authorisations; no allowance remains. No user Document was saved or modified by the isolated tests.

## Clarified transient-preview timing

After the earlier twelve-call follow-up below, the user identified **Transient DCP response — not committed** as the start of the perceived delay. A fresh complex Enlightenment/French Revolution question used four further calls (two Entity searches, capability discovery, final composition). The user observed the long delay during this run.

Relative to the first provider text: the final prose paragraph arrived at 30.79 s, complete XML at 33.23 s, complete XML in the transient preview at 33.26 s, provider completion at 33.84 s, broker result at 34.26 s, native admission at 34.30–35.29 s, and new native viewport intersection at 35.39 s. Thus the observed first-preview-to-native interval was **35.4 seconds**, but complete-XML-preview-to-native was **2.1 seconds**. The response contained seven paragraphs, two Entities, six range anchors, two Arguments, one relationship and one Gloss; 6,629 UTF-8 bytes and 1,327 output tokens including 100 reasoning tokens.

This establishes a long generation-to-publication wait in the observed case, not a 35-second XML conversion. The native Document waits for complete output and atomic validation, while the inspector exposes incomplete text earlier. It also corrects the earlier use of only end-of-stream-to-native timing, which understated the user's experience. Native admission still blocks the main thread for about one second and remains a material separate cost.

Evidence: `artifacts/dcp-render-live/enlightenment-depth.json` and `enlightenment-depth-timeline.json`. Chrome's trace screenshot buffer filled before response generation; those frames do not prove final paint timing. The final screenshot confirms the resulting native content only.

## Live semantic-rich follow-up, 12 November

Following the user's report of fourteen seconds, the initial short live examples were insufficient. Two subsequent, different questions explicitly requested in-depth discussion. Headed Chrome mounted WorkspaceDemo and the actual Dialectic controller, using an isolated copy of the latest saved conversation. Autosave, automatic titles and test-phase logging remained off. Native knowledge and SQLite feature flags were on, but service requests outside the private provider broker were blocked: these runs do **not** qualify an active Vault indexing session or reproduce the user's other open Documents.

| Live response | Printing press / Reformation | British industrialisation |
|---|---:|---:|
| Native paragraphs | 7 | 8 |
| Entities / Glosses / Arguments / relationships created | 3 / 3 / 5 / 1 | 5 / 1 / 4 / 0 |
| XML lowering + native preparation | 22.2 ms | 16.3 ms |
| Staging linked definitions + source properties | 4.6 ms | 2.4 ms |
| Staging Block insertion | 210.4 ms | 141.1 ms |
| Whole admission transaction, including publication | 1,243 ms | 889 ms |
| Complete provider stream to first positive viewport intersection | 1,843 ms | 1,112 ms |
| Viewport intersection relative to provider-panel publication | 54 ms before | 101 ms before |
| Repository snapshots during exchange | 0 | 0 |

Staging is only part of admission; its low cost does not exclude downstream semantic work. The transaction includes canonical validation, history recording, projection publication and reactive rendering. CPU samples in the printing-press admission-to-panel interval attribute approximately 251 ms to structural projection updates, 221 ms to cloning and 185 ms to Solid unwrapping (inclusive figures overlap), plus 199 ms of garbage collection. The long animation frame measured 1,390 ms. This is a material main-thread cost, but not a reproduction of the reported fourteen-second interval. Viewport intersection is not proof of compositor presentation; Chrome frame traces and screenshots are retained alongside it.

An `Object.values` counter detected no enumeration of the repository's complete contents or placements maps during either exchange. This is a specific counter, not proof that every possible traversal or background service is bounded. Code inspection found that an acquired `NativeKnowledgeHost` can re-observe multiple live resource slots after repository invalidation; that remains an unqualified candidate in a fuller workspace, not an established cause of this incident.

The earlier saved nostalgia reply was also replayed with fresh source authority: full admission 333 ms, without Gloss 280 ms, without Arguments 271 ms. These single-run differences cannot establish per-feature costs. Each replay committed once and captured zero repository snapshots. Further repeated-passage and ablation runs were stopped at the user's request; source-mark, formatting, relationship-added and explicitly active-knowledge variants were not qualified.

Paid usage: the initial authorisation permitted six inference calls; the user subsequently authorised six more. Exactly twelve were issued. Each successful long exchange used three calls: `search_entities`, `describe_capabilities`, then final composition. An earlier printing-press attempt exhausted the first six-call allowance during continuation and produced no contribution; the local guard prevented another paid request. A browser startup failure used no provider calls. Replies were newly generated; receipts report partial input caching, not cached answers. No further paid calls were made.

Evidence: `artifacts/dcp-render-live/{printing-depth,industrial-depth}.json`, matching CPU profiles, Chrome traces and screenshots; the persistent paid-call ledger is in the same ignored directory. The harness is `scripts/check-dialectic-render-live.mjs`. Saved replay evidence remains in `evidence/dcp-admission-delay/semantic-{full,no-gloss,no-arguments}.json`.

This follow-up changed diagnostic harnesses and corrected the misleading autosave status label in manual-save mode; its existing UI suite passes all 12 tests. It made no new production semantic-admission or rendering optimisation. The fourteen-second failure remains unresolved. The next decisive measurement must capture that delay in the affected browser/workspace, rather than extrapolate from these isolated successes.

## Follow-up: full browser rendering path

The user clarified that the six-to-seven-second gap starts when **Last provider attempt (session only)** is visible. That signal is published after native admission and acknowledgement. The earlier mounted-view/reveal replay did not adequately test this observation; native admission timing cannot rule out rendering delays.

New real-session evidence is in `2026-11-11T22-50-54-829Z-51ab92f4-967e-4758-b2fe-68373751489b.jsonl`. Three actual exchanges report lowering 3–6 ms, native preparation 4.5–32.7 ms and admission 177–290 ms. Initial provider setup serially creates/verifies the provider conversation and appends native history. On the first exchange, generation was requested about 3.99 seconds after the submitted-contribution log; response headers arrived at 5.16 seconds. Later generation requests began after roughly 2.1–2.4 seconds. The status includes this setup and waiting for initial provider output; it is not all local structured conversion. Provider setup remains a separate, unchanged issue.

A fuller Chrome replay used `Conversation on November 12, 2026 (2).ink`, six committed contributions, 5,376 Cells, a 2,804-character response, SHA-256 `9f5655fe8c24dad1d084dde7acc1f525fedfcfd174bfeeaf37c0897293867820`. It opened the Context & AI inspector and provider record, used the native Save coordinator with mocked server persistence, traced layout/paint/CPU activity and screenshots, and observed viewport intersection for eight seconds after exchange completion. Services and paid generation remained blocked. The isolated workspace still lacks the user's full live application state; the diagnostic panel is opened programmatically and is not necessarily scrolled to the same position as in the user's browser.

This uncovered repeated full-repository identity scans inside synchronous autosave capture: `captureNative → linkedDefinitionOwner → resourceOwner → findResource`. Each annotation could rediscover the same owning Document by scanning all loaded contents. These tasks block browser progress even though DCP admission has completed.

The correction memoizes resource identity lookup **within one synchronous capture only**. It retains every ambiguity, ownership and resource validation check and discards the memo after capture. It introduces no persistent registry and changes neither typing nor dirty tracking.

| Same response, with an unrelated unrendered 50,000-Cell Document | Before | After |
|---|---:|---:|
| Autosave coordinator work | 2,872 ms | 748 ms |
| CPU samples attributed to `findResource` | 1,762 ms | 115 ms |
| CPU samples attributed to native capture | 2,574 ms | 533 ms |
| Response viewport intersection observed, from request click | 3,551 ms | 1,062 ms |
| Last provider panel publication, from request click | 3,560 ms | 1,064 ms |
| Canonical commits / repository snapshots during exchange | 1 / 0 | 1 / 0 |

The unrendered Document changed the rendered DOM by only one element. In the smaller workspace, autosave took 723 ms; adding unrelated contents raised it to 2,872 ms before correction. CPU samples and ownership-scan regression tests support the identified cause. Single-run wall times include instrumentation and scheduling noise. Remaining capture and whole-graph validation passes are still synchronous.

**The table does not reproduce a six-to-seven-second delay after an already-visible provider panel.** It demonstrates a real main-thread scaling defect, not complete attribution of the reported episode. The new `exchange.presentation` diagnostic observes the actual user's browser for ten seconds after admission: panel-signal publication, viewport intersections, page visibility and long animation frames (or long tasks where supported), including forced-layout script durations. These are bounded passive observers, with at most 32 intersections/frames and eight scripts per frame. They make no DOM measurement loop, repository scans, screenshots or canonical edits; disposal and stale-session checks release them. They use the existing test-phase logging flag and emit at most one extra diagnostic event. Panel publication and intersection are not proof of compositor presentation.

Evidence: `render-current`, `render-unrelated-before` and `render-unrelated-after` JSON/CPU profiles in the adjacent evidence directory. `DCP_RENDER_TRACE=1` enables the fuller replay; `DCP_REPLAY_UNRELATED=500` adds the isolated unrendered workload. Raw Chrome traces/screenshots remain temporary local evidence, not conversation data added to the repository.

Qualification adds bounded ownership-scan and fresh-capture ambiguity checks, native persistence round-trips, passive-observer bounds/disposal checks, and native resource authority tests. Previously passing save recovery and generation tracking checks remain applicable. Across the focused follow-up suites, 61 tests pass. The real Flint typing check reports median handler 2.4 ms and p95 6.7 ms (previous run 1.6 / 6.2 ms), zero snapshots, stable unrelated Cells, correct focus and passing Undo/Redo. These single-run differences are not treated as a latency guarantee; no typing code was changed.

## Earlier findings

The original investigation's admission duration was not a measurement of when the contribution appeared on screen. The reported several-second delay must not be dismissed using that duration.

Read-only replay used the November 12 conversation's actual XML, semantic definitions and source annotations, with freshly issued source authority. The file changed during the investigation, so paired tests subsequently used a pinned four-contribution copy: SHA-256 `0cbb354d3ed58929a038609ea72776aa2face04513d7bacca319e175e405c1d3`, 2,709 Cells, 1,241-character final response. Earlier exploratory measurements used its two-contribution state and are not paired comparisons.

Parsing/lowering and native preparation took milliseconds. Earlier replay of the larger 3,220-character response measured approximately 1 ms lowering, 2 ms preparation and 299 ms mounted native admission. Those exploratory runs did not load the complete application stylesheet and are useful for CPU diagnosis, not screen-visibility claims. Profiles show record cloning, Solid projection updates and undo recording as material insertion costs; they do not establish a multi-second conversion bottleneck. Admission already uses the shared bounded structural transaction. It performed one canonical commit and zero repository snapshots in these examples. A second DCP-only insertion pipeline is not justified by this evidence.

There was a separate, concrete ordering defect in `controller.ts`: after native admission, automatic inspection/reveal waited for `exchange.materialised` logging and the committed-contribution history/log upload. Until those completed, a response could exist below the viewport while the user continued seeing the previous passage and transient output.

The retained diagnostics file is `vaults/imported/.mutable/dcp-test-phase/2026-11-11T13-36-38-713Z-14bd2227-55c1-4484-aa77-338a69302724.jsonl`. Its first exchange records the final provider body at 22:21:31.648 UTC, materialisation at 32.051, committed-contribution logging at 32.297 and outcome at 32.543. The next exchange spans 22:29:47.886 to 48.613. These are server events, not browser paint receipts. In particular, the server logging requests themselves completed promptly in this incident. The controlled slow-logging reproduction demonstrates a defect, **not proof that these specific requests took four seconds in the user's session**.

## Correction

After successful canonical admission, clear the transient preview and inspect/reveal the native contribution immediately, before diagnostic uploads. Keep the existing autosave paint yield, logging, provider acknowledgement, error reporting and atomic admission. Viewing does not imply that durable persistence has completed. No validator, ownership rule, undo path or persistence representation was bypassed.

The existing Last provider attempt and exchange-outcome diagnostics now include `localTimings`: validation-attempt count, cumulative lowering and preparation time, admission time, post-admission diagnostic time and provider acknowledgement time. These are browser phase durations, explicitly **not paint measurements**. They do not add instructions or schema content to the provider request. The immutable contribution captures the provenance available at admission; later timings belong to the session/outcome diagnostics, without rewriting submitted content.

## Controlled browser qualification

The final visibility replay mounts the actual modern Dialectic application in a WorkspaceSession with application CSS, actual controller, native rendering and commit-triggered autosave. Provider output is replayed locally; persistence uses an in-memory adapter. All service requests are blocked. No paid provider calls or writes to user Documents occurred.

| Same pinned response; two diagnostic uploads delayed 2 s each | Before | After |
|---|---:|---:|
| Click to native reveal/scroll request | 4,170 ms | 239 ms |
| Whole controller exchange, including logging | 4,156 ms | 4,236 ms |
| Validation callback | 2.0 ms | 4.6 ms |
| Canonical commits | 1 | 1 |
| Repository snapshots during exchange | 0 | 0 |

With no injected logging delay, the final replay requested reveal at 105 ms, completed the controller at 115 ms, and spent 2 ms in validation. Autosave took 125 ms; the subsequent two-frame wait was 327 ms, which includes other scheduled work and is not an isolated rendering cost.

The native response's final rectangle was within the 1440×900 viewport in both styled runs. The reveal measurement timestamps `scrollIntoView`, not a compositor-presented frame. Small CPU differences are normal single-run variation; the improvement being qualified is removal of the two network waits from reveal ordering. Diagnostic completion still takes its real duration, and the busy indicator still follows exchange completion.

Evidence and reusable replay: `evidence/dcp-admission-delay/`. Run against a fresh isolated Vite instance on port 3005; use `DCP_REPLAY_FIXTURE` for an immutable local copy, `DCP_REPLAY_LABEL` for output names and `DCP_DIAGNOSTIC_DELAY=2000` for the controlled wait. A fresh Vite instance avoids duplicate class modules from HMR invalidating prototype-based transport stubs.

## Correctness and limits

- 40 focused tests pass: conversation updates/reveal, bounded structural work and XML authoring. Deferred-log regression tests require the response to be selected and mounted before either upload resolves, with one commit and no snapshots.
- Structural tests include unrelated records, native/projection equivalence, ownership rejection, rollback, Undo/Redo and durable replay. Existing XML authority/admission tests remain unchanged.
- Client and server TypeScript checks pass.
- Real Chrome Flint typing benchmark, 250 paragraphs / 25,000 characters / 40 edits: median handler 4.2 ms before and 1.6 ms after; p95 15.5 ms and 6.2 ms. Both had zero snapshots, stable unrelated Cells, correct text/focus and passing Backspace, split, Undo/Redo checks. These are single-run timings under differing machine load, not evidence of a typing speed improvement or guaranteed display latency; this patch does not change typing code. Raw results are retained.
- No mutation of the saved conversation, provider setup change, new authoring framework or per-keystroke instrumentation.

This fixes one demonstrated cause of delayed visibility. It does not claim that the user's original several-second interval has been fully explained, nor that all native insertion is now inexpensive. The next actual incident should be assessed using the new local phase timings alongside a browser performance trace if the delay remains; server receipts alone cannot establish first visible paint.
