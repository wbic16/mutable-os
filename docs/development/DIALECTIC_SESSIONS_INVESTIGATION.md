# Dialectic Document switching and multiple sessions

Implementation follow-up, 15 November 2026: independent conversation runtimes and concurrent background responses are now implemented. See [the architecture and qualification report](DIALECTIC_MULTI_SESSION_QUALIFICATION.md) for the resulting behavior, lifecycle rules and validation. The investigation below records the earlier state and recommendations.

Investigated 14 November 2026. Scope: fix the previous conversation remaining visible after Open, and assess multiple sessions using Flint's existing Document architecture. Independent background AI sessions are proposed here, not implemented by this change.

## Finding and fix

The reported symptom is a presentation bug. Dialectic already opens multiple Documents through the same tab host as Flint. Open selects the destination tab and the host sets `hidden` and `inert` on the previous panel. Dialectic's composer layout rule nevertheless set `display:flex` on **every** panel, overriding the browser's default hidden styling.

In real Chrome, after opening the second Document, the first panel had `hidden=true`, `inert=true`, `display=flex` and a nonzero height. Both conversations were visible even though only the second was selected. The fix in `src/features/dialectic/view.css` applies the flex layout only to panels without `[hidden]`. It is scoped to the application's direct tab panels, so nested tabs authored inside a Document retain their existing behavior.

Opening a Document now shows only the selected conversation. The previous Document remains available in its tab, with its unsaved draft and retained editor intact, as in Flint. Open does not delete its content or automatically save it. Closing a tab remains an explicit action. No new feature flag is needed for this correction to existing behavior.

## What already exists

“Session” currently describes several different objects:

| Layer | Existing implementation | Consequence |
| --- | --- | --- |
| Native conversation Document | `src/features/dialectic/model.ts`: ordinary `document-block`, stable Document identity, native contributions and attachment metadata | No separate chat database or second persistence format is needed. |
| Open Document tabs | `src/application/document-application-capabilities.tsx`: `openDocument`, `files.open`, tab selection and close lifecycle; Dialectic registers through this service in `index.tsx` | New/Open can already retain several conversations. Reopening an existing Document selects its existing tab instead of duplicating it. |
| Retained editor occurrence | `src/application/document-sessions.ts` and `src/rendering/retained-document-view.tsx` | Each visited tab can retain its editor/projection and local state. Visibility and activity are distinct from disposal. Closing a view does not delete the canonical Document. |
| Desktop/Textual presentation | `src/features/dialectic/view.tsx`, application ports and Document presentation leases | Both presentations reuse the native editor. Switching presentation should not create a second conversation or duplicate its controller. |
| Dialectic application controller | `src/features/dialectic/index.tsx` caches one `createDialecticController` per application instance | Multiple tabs currently share one AI runtime, rather than each having an independent runtime. Separate application windows have separate controllers. |
| Provider conversation memory | `src/features/dialectic/continuity.ts`, `dcp/continuity-contract.ts`, `server/dialectic/conversations.ts` | Native history is projected on demand. OpenAI continuity bindings already distinguish Cavern, Document, participant and provider connection. Provider memory is not the canonical Document. |
| Saving and dirty state | Shared native file services and Document tab state | Save/Save as and Cmd/Ctrl+S already target the active Document. `dialecticAutosave` is currently false by default; this work leaves that unchanged. |

This follows the original Dialectic brief's requirement to reuse native Documents and Flint infrastructure, rather than introduce another editor or incompatible chat store. Relevant earlier reports are [the initial investigation](DIALECTIC_INVESTIGATION.md), [increment 1 qualification](DIALECTIC_INCREMENT_1_QUALIFICATION.md), and [Flint's implementation plan](flint/FLINT_APPLICATION_IMPLEMENTATION_PLAN.md).

## Limits of the current session model

- `controller.ts` preserves inspection, reply target, selected context and navigation trail in a map keyed by Document identity. These choices last for the application lifetime; they are not all persisted in the Document.
- On a Document switch, that controller stops the receiving stream, increments its generation, aborts its request, clears its preview and resets busy state. A response therefore does **not** continue independently in a background tab.
- Provider settings/connection, selected AI participant, vocabulary selection, response diagnostics and several transient signals are application-wide. They need an explicit ownership policy before sessions can be independent.
- `attachments.ts` captures the originating session and draft, and checks them before inserting attachments. This protects against inserting a delayed result into the wrong conversation. However, pending upload and large-upload confirmation signals are shared; switching does not immediately cancel or relocate them. The old operation can affect the new tab's controls or report a stale-operation error there.
- Automatic title work is tied to the current conversation and cancels when it changes. Other asynchronous operations, including sequences and generated artifacts, need the same ownership review.
- `server/dialectic/broker.ts` rejects a new exchange while its provider session already has an exchange. Splitting frontend state alone will not allow concurrent responses through that connection.
- Desktop exposes the shared tab host's selection and close controls. Textual has a simpler tab-button list and needs consistent active-tab accessibility, close actions and per-session progress/error indicators.
- Retained editors and saved workspace layout do not by themselves resume provider requests after an application/browser restart. Restoring open tabs and resuming an interrupted request are separate capabilities.

## Recommended implementation plan

### 1. Keep the existing multi-Document host

Use New/Open/select/close through `DocumentApplicationInstance`; keep one native conversation Document per chat. Finish tab UX parity between Desktop and Textual, including accessible active state, title, cheap dirty indication and close controls. Do not add another tab registry, canonical conversation store or editor renderer.

Opening should select the destination and hide the previous view, as now fixed. If a replace-current workflow is later wanted, expose it as an explicit action using existing close guards; do not silently discard a dirty conversation.

### 2. Separate application configuration from conversation runtime

Refactor `controller.ts` into an application coordinator plus a lazily created runtime per stable Document identity. Initially scope that runtime map to the application instance, preserving current window independence. Keep occurrence-local caret, selection and presentation ownership in `DocumentSessionStore`, not in the AI runtime.

Move reply/context/navigation choices, busy/status/preview, request cancellation, upload confirmation/failure, selected participant, diagnostics, and sequence/title operations into the appropriate runtime. Decide which provider/model and vocabulary options are application defaults and which are conversation overrides. Credentials stay in the existing provider connection machinery, never Document metadata.

Bind each operation to its originating Document, draft/contribution and lifecycle token. Its callback must not look up whichever tab happens to be active when it completes. Preserve the existing stale-state checks, scoped canonical commands, Undo/Redo and native validation. Background runtime subscriptions must avoid rebuilding inactive UI or scanning unrelated Documents on typing.

### 3. Choose and implement the request lifecycle

Recommended first stage: isolated per-conversation state with the current switch-cancels-response policy explicitly reflected in the UI. This delivers predictable multiple open conversations without changing server concurrency immediately.

For a subsequent background-response feature, switching tabs should only detach the visible presentation, while the originating runtime continues receiving into its own Document. Show progress/completion/error in that tab, and route Cancel to that runtime. Closing its last owning view should cancel its work and release resources; closing one of several views must not dispose work still owned elsewhere. Deleting the canonical source must invalidate pending results.

Support concurrent provider work either with a separate broker session per conversation runtime using the existing transport, or by extending the broker's connection to allow bounded, Document-scoped exchanges. The former is the smaller change but multiplies connection lifecycle/configuration work; the latter requires revising the one-exchange rule, immutable per-exchange settings, cancellation and cleanup. Retain serialization for exchanges sharing the same continuity binding. Provider connection/settings changes must have defined effects on active requests.

Background generation also needs source-bound native receiving and artifact insertion when its editor is hidden or disposed. Do not assume that removing the current switch-abort call is sufficient.

### 4. Preserve persistence and lifecycle boundaries

Keep authored conversation content and attachment references in native Mutable JSON, with manual Save to the active Document's opened filename. Do not add background saves or Markdown sidecars. Keep dirty indicators driven by existing per-Document state.

Use the existing workspace layout mechanism for open-tab restoration. If selected model or other conversation preferences should survive reopening, define a small versioned metadata contract and migration tests; do not serialize credentials, request controllers, live preview buffers or cached editor geometry. Restored in-flight requests should be represented as interrupted, with explicit retry, rather than silently replayed.

New independent-session/background-response capabilities should have a default-enabled feature flag, with disabling them retaining all authored Documents and the current sequential behavior. The CSS bug fix remains unconditional.

### 5. Qualify the behavior

- Open/New/switch/close/reopen several Documents: exactly one visible active panel, correct tab labels, retained drafts, focus/selection and Undo/Redo; no duplicate canonical ownership.
- Save and Cmd/Ctrl+S target the correct file; switching alone does not save, edit canonical records or add history. Verify multiple windows and Desktop/Textual transfer.
- Switch or close during an upload, confirmation, title request, sequence, generated image or streamed response; completion and errors must belong only to the source conversation.
- For background responses, complete two mocked exchanges out of order; cancel one without affecting the other; close/delete a source; change provider settings; verify continuity bindings do not cross.
- Measure bounded work as tab count grows: no repository snapshots, whole-workspace scans, network requests or unrelated UI rebuilds caused by ordinary typing. Use real Flint typing benchmarks if the runtime refactor affects performance; headless frame timing alone is not evidence of user-visible latency.

The visibility fix and tab UX polish are small changes. Runtime separation is the main architectural work; concurrent background generation adds a distinct broker/receiving/lifecycle increment. No new persistence engine is necessary.

## Qualification of this fix

`node scripts/check-dialectic-sessions-browser.mjs` runs an isolated Vite/Chrome fixture using the real application host, retained editor and native file Open/Save client paths. The server file response and Vault listing are in memory; no real provider request or user Vault write occurs.

The test creates two Documents, leaves an unsaved draft in the first, saves and closes the second, then reopens the saved second Document through `application.files.open`. Before the fix it fails because two panels are displayed. After the fix it passes: the inactive panel has `display:none` and zero height, and returning to the first Document reuses the same retained session with its draft intact.

Ten round trips between the Documents produce zero repository snapshots and no canonical revision change. Exactly one explicit save occurs. Twenty text edits produce zero repository snapshots, whole-content/placement inventory scans or network requests under the fixture's existing bounded-work instrumentation. The production change is CSS only: it adds no typing, geometry, snapshot, validation or dirty-tracking work.

Generated evidence is under `artifacts/dialectic-sessions/` (`opened.png`, `opened.json`, `qualification.json`); the failing reproduction is under `before/`. The runner can regenerate the passing evidence.

The broader command `npx vitest run src/features/dialectic/dialectic.test.tsx src/application/flint-lifecycle.test.tsx` reports **125 passed, 6 failed**. Running the same command with the CSS correction removed reproduces the same six failures: Flint's immediate close-window projection disposal assertion, Dialectic's submitted-text protection assertion, and four Stage 3A/B/C image/PDF source/admission assertions. These are baseline failures, not resolved by this presentation fix. The conversation-context switching tests pass. `node --check scripts/check-dialectic-sessions-browser.mjs` and `git diff --check` pass.
