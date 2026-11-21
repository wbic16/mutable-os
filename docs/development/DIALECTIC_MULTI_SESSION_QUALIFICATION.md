# Dialectic independent conversations and background responses

Implemented 15 November 2026 from the supplied *Dialectic Multi-Session Architecture and Background Responses* brief. This extends the architecture documented in [the session investigation](DIALECTIC_SESSIONS_INVESTIGATION.md). The accepted inactive-panel CSS correction remains unconditional.

## Delivered behavior

- Several native Dialectic Documents can receive AI responses concurrently. Selecting another tab or changing Desktop/Textual presentation does not cancel a response.
- Each conversation retains its draft, context/reply/navigation choices, selected participant, model/provider preferences, vocabulary, response diagnostics, upload confirmation/failure state, title work and Sequence state.
- Existing Document tabs display Responding, Complete, Error, Cancelled and upload/title activity. Textual now has a visible accessible tab strip, selected state, dirty indication and close controls using the same native host.
- Cancel affects the selected conversation. Closing the final owning view asks before interrupting active operations, cancels them, and releases runtime resources. Closing one view while another owns the same Document allows receiving to continue, including across application-window closure.
- Responses, native semantic annotations and generated attachments are admitted to the originating Document. Unmounted rendering does not prevent native receiving. Background completion does not steal foreground focus or scroll another conversation.
- Manual Save/Save As and Cmd/Ctrl+S continue using the existing Document/file services. No new autosave, Markdown sidecar, conversation database or editor renderer was added.

The feature is controlled by `dialecticMultiSession` in `src/configuration.ts`, enabled by default. Disabling it selects the previous application-wide controller and switch-cancels-request behavior; authored Documents and stored preferences remain native data.

## Architecture and ownership

| Files | Responsibility |
| --- | --- |
| `src/features/dialectic/conversation-coordinator.ts` | Application coordinator, lazy runtime lookup by stable Document ID, application defaults, shared credential connection, cheap tab status and membership-driven cleanup. A stable forwarding interface lets existing chrome follow the selected runtime without remounting the document host. |
| `src/features/dialectic/controller.ts` | Document-bound runtime using a captured native session port. Owns response cancellation/generation, DCP receiving, uploads, titles, sequences, preferences and diagnostics. Foreground presentation work is gated separately from native admission. |
| `src/application/document-sessions.ts` | Operation leases on existing retained sessions. When a renderer unmounts, its DOM is released; a held native projection remains available until the operation/runtime releases it. The store retains sole final disposal authority. No additional editor or canonical Document is allocated. |
| `src/application/document-application-{ports.ts,capabilities.tsx}` | Identity-only tab membership, activity contributions, close guards and close-by-tab access. These extend the existing tab manager rather than add another one. |
| `src/features/dialectic/{view.tsx,provider-settings.tsx}` | Shared Desktop/Textual controls, conversation settings/default actions, accessible Textual tabs and source-specific cancellation. |
| `src/features/dialectic/preferences.ts`, `src/block-tree/dialectic-preferences-plan.ts` | Versioned nonsecret preferences and bounded native metadata admission. |
| `src/block-tree/{structural-plan.ts,projection.ts}`, `src/persistence/native-session.ts` | Preference changes update only the affected Document payload and its existing dirty state; no topology rebuild is required. |
| `src/block-tree/repository.ts` | Background receiving can permit Undo/Redo on disjoint records while retaining the existing admission guard over the in-flight group's records. Each completed AI response remains one undoable group. Legacy callers retain the original global history suspension. |
| `src/features/dialectic/{references.ts,sequence-controller.ts}` | Unrelated inline edits avoid inactive reference-index reads; deferred Sequence reveals check foreground/lifetime before moving focus. |
| `src/features/dialectic/dcp/{live.ts,vocabulary-contract.ts,vocabulary.ts}`, `server/dialectic/broker.ts` | Isolated child broker connections and shared authentication; pure vocabulary validation remains usable without importing editor/UI dependencies into the server. |

The runtime map is scoped to the application instance, as specified. It is operational state, not canonical Document ownership. Different application windows retain their own runtime/configuration coordinators; their ordinary native occurrences still share the same underlying Document. Persisted Document overrides therefore remain Document-wide.

Owning views are counted through existing application ports and identity-only tab membership, including inactive tabs. Hidden, unselected and Textual-transferred views still count. If an application closes while another application still owns the Document, its pending runtime can finish through the leased native projection; it is disposed when idle or when the final owner disappears. Workspace disposal is authoritative over all leases and connections.

Deleting a canonical source invalidates its pending runtime. The deletion regression uses the existing protection-disabled fixture to permit that removal; normal submitted-contribution protection remains enabled and unchanged.

## Broker concurrency and continuity

Each conversation gets a child broker session. A child references its application's existing credential map in server memory; credentials are not copied into the frontend runtime or persisted in the Document. The parent bearer token is used only to create an origin-checked child connection. Nested or unknown parents are rejected.

Each child retains the existing one-exchange constraint, its own provider/model settings, utility request, abort controller and exchange map. This is the smallest concurrency extension: the broker does not need a new multiplexed exchange protocol. Its existing limit of 32 local provider sessions also bounds concurrency; a parent uses one slot. Children are allocated lazily when network work starts, not simply because a tab opens.

An exchange captures settings, provider key and image-generation key at creation. Changes to that conversation's settings are refused while it is responding. Changing application defaults affects inherited preferences when a runtime becomes idle and applies to subsequent requests. Changing shared credentials does not rewrite the key captured by a running exchange. Forget keys explicitly cancels the application's runtimes and removes its credential connection and child sessions. Closing one child does not clear its siblings' credentials or exchanges.

The existing native-history projection and provider continuity store remain authoritative. Continuity bindings already include Cavern, Document, participant and provider connection. The store's atomic begin/version/phase check prevents simultaneous exchanges sharing a binding from corrupting history. Other bindings can run concurrently. Provider history, acknowledgements, generated artifacts and response IDs still travel through their originating child exchange.

## Preferences and restoration

Preferences live under `Document.metadata.dialectic.preferences`:

```json
{
  "version": 1,
  "provider": {
    "provider": "openai",
    "model": "a-provider-model-id",
    "maxOutputTokens": 4096,
    "repair": true,
    "cadence": "conversational"
  },
  "vocabulary": {"profile": "general", "enable": [], "disable": []},
  "participantId": "native-participant-id"
}
```

All fields other than `version` are optional. Missing provider/model and vocabulary overrides inherit application defaults. “Use conversation settings” writes an override; “Use application defaults” removes provider/vocabulary overrides; “Make current settings the defaults” updates application defaults. Application provider defaults retain the existing local preference storage, and vocabulary defaults use a small local preference entry. Neither contains credentials.

Explicit preference changes mark the Document dirty and participate in native Undo/Redo. They do not save automatically. Documents without preferences need no migration. Invalid recognized fields fall back to defaults when read. Unknown versions are preserved and cannot be silently rewritten through the settings control. Preferences are validated and stripped to nonsecret fields; no bearer token, API key, stream buffer, request controller or geometry is serialized.

Open-tab and presentation restoration continue to use existing workspace layout. Requests are not resumed or replayed after restart. Any partial authored native response remains Document content; the user can explicitly resend its local contribution. Durable background execution is deliberately deferred.

## Qualification

All provider traffic in this qualification used deterministic fixtures, not paid provider calls. User Vaults were not modified, and no development server is left running by the isolated runners.

### Automated coverage

`src/features/dialectic/conversation-sessions.test.tsx` covers simultaneous native XML streams, reverse completion, disjoint Undo during receiving, source-specific cancellation, close confirmation, multiple owning views, application-window closure, receiving without mounted DOM, source deletion, independent persisted settings, defaults/legacy preference handling, uploads, large-upload confirmation, automatic titles, Sequence drafts, generated PNG/PDF attachment attribution, native Entity/Claim/Gloss admission, twelve-tab bounded typing, and flag-off behavior.

`server/dialectic/broker.test.ts` additionally covers child credential sharing, independent models, cross-child exchange rejection, immutable active settings, isolated cancellation, parent cleanup, invalid/nested parents and session bounds. Existing continuity tests retain the binding/reconciliation checks.

Existing vocabulary tests now capture their “no partial admission” baseline after explicit preference edits, since those edits are intentionally native authored changes. The immutable-vocabulary test also checks that changes during a response are refused and can be applied once idle. These changes preserve the admission assertions rather than weaken them.

The final broad command covered the Dialectic frontend and broker directories, Flint lifecycle, Document sessions/transfers/presentations/saving, structural performance, text protection and commit capture, with two test workers: **518 passed, 9 failed, 527 tests across 40 files**. All **15 new conversation-session tests passed**. Server attachment tests passed when rerun with bounded worker concurrency; two initial parallel-run timeouts did not reproduce.

The nine remaining failures are:

| Suite | Failures | Baseline evidence |
| --- | --- | --- |
| `src/application/flint-lifecycle.test.tsx` | One immediate close-window projection-disposal assertion | Previously reproduced without the visibility fix in the session investigation. |
| `src/features/dialectic/dialectic.test.tsx` | Five: submitted-text protection; Stage 3A changed-source notice; Stage 3B image admission call count; Stage 3C PDF admission call count; Stage 3C changed-source notice | The same five previously recorded failures remain. All other 102 tests in this file pass. |
| `src/features/dialectic/dcp/capabilities.test.ts` | One shared schema reference-identity assertion | Reproduced in a separate untouched checkout of `65793a2`. |
| `src/features/dialectic/dcp/editorial.test.ts` | Two policy-order assertions, OpenAI and Anthropic | Reproduced in that same untouched checkout. |

The baseline checkout's capability/editorial run had 19 passes and those same three failures. No unrelated baseline repairs were included.

`npm run build:server`, `npm run typecheck` (frontend and server), and `git diff --check` pass. The final provider-recovery/broker run passes **22/22 tests**, including explicit reconnection after a shared credential parent expires; it does not replay an exchange.

### Real Chrome

- `node scripts/check-dialectic-concurrent-sessions-browser.mjs`: real application, native retained editors, real local broker and controlled provider SSE. Two responses stream concurrently, finish in reverse order, survive Desktop/Textual switching with the same retained session, and stay in their respective Documents. Cancelling A leaves B running. Manual Save targets B's native identity.
- `node scripts/check-dialectic-sessions-browser.mjs`: real native Open/Save client path with isolated file transport. Exactly one panel is visible; the prior unsaved draft and editor identity survive. Ten tab round trips do not change canonical revision, snapshot the repository or save.

Evidence is generated in `artifacts/dialectic-concurrent-sessions/` and `artifacts/dialectic-sessions/`. Each runner writes a screenshot and machine-readable qualification results. These are disposable proof artifacts; the scripts reproduce them.

### Performance

The concurrent browser proof measures twenty ordinary edits with 2 and 12 open conversations. Both record **zero repository snapshots, whole-content/placement inventory scans and network requests**. Automated typing checks additionally verify that unrelated runtime row derivations do not rebuild.

In the final browser run, CDP input round-trip median/p95 were **2.43/5.50 ms** with 2 conversations and **4.74/8.03 ms** with 12. These are one-run headless command/interaction timings, not guaranteed painted-frame latency. They show the observed costs without claiming identical performance at every tab count. No global scan, persistence operation or request was added to the keystroke path.

The real Flint benchmark used 250 paragraphs/25,000 character cells and 40 edits in an isolated Chrome profile:

| Measurement | Before | After |
| --- | ---: | ---: |
| Mean edit time | 2.00 ms | 2.14 ms |
| Median | 1.70 ms | 1.70 ms |
| p95 | 6.00 ms | 6.90 ms |
| Maximum | 6.80 ms | 7.80 ms |
| Repository snapshots | 0 | 0 |
| Unrelated character cells stable | Yes | Yes |

Both runs passed real Chrome InsertText, Backspace, Undo/Redo and Enter/split Undo, including start/end/empty-block boundary cases. These single-run samples do not establish a statistical latency guarantee; median editing cost was unchanged and the measured tails were somewhat higher. The isolated fixture logs an expected unavailable Cavern startup proxy because it does not run the user's API server; benchmark editing is entirely in memory.

## Limits and deliberate decisions

- No restart-time request resumption, background worker service, new persistence engine, automatic replay or background save was introduced.
- The broker's 32-session bound remains. A user can open more native Documents without creating a provider session, but excessive simultaneous provider connections return the existing limit error.
- Two windows can show one native Document. Their operational coordinators remain independent as specified; canonical edits/preferences are still shared. Exchanges sharing a continuity binding are serialized by the existing store, not merged.
- Live provider availability, billing, model access and production network failures were not exercised. The actual broker/protocol/native-admission path was exercised with simulated SSE.
- Pre-existing failures are reported separately below. They are not presented as passing and were not expanded into unrelated repair work.
