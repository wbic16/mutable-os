# Dialectic conversation updates — qualification

10 November 2026. Implemented and qualified: contribution autosave, the streamlined conversation interface, collapsed Contributions rail, paste/response feedback and isolated automatic titles. Existing native composition, source authority and provider conversation continuity remain in place.

## Saving and filenames

Successful human submissions and admitted AI/mock responses queue a serial native Document save. A new conversation uses `Conversation on November 10, 2026.ink` (the local date), with a collision suffix when needed. Existing opened or successfully chosen Save As destinations take precedence. A generated title changes Document metadata only: it never renames the file, including when title generation finishes before the first save.

The Save button is removed in the updated Dialectic interface. Save As remains under conversation options; Command-S/Control-S still uses native saving. Failures remain visible with Retry save. An unknown previous save outcome is recovered through the existing native session before another save is attempted; there are no automatic retry loops or overwrite shortcuts.

This is the explicitly requested Dialectic exception to manual Document saving. Ordinary typing, pasting, sidebar changes and scrolling do not initiate saves. Other applications retain manual saving. No Markdown sidecars are created. Applying a generated title also queues a save so the metadata persists.

**Known native storage limitation:** Save As to a second filename for the same managed Document in the same folder can be rejected with `Invalid pair receipt`. This predates these changes. A confirmed preflight rejection now restores the original binding, preventing later autosaves from targeting the rejected name. Successful Save As to another folder was qualified and subsequent autosaves follow that destination. Journal identity/receipt rules have not been weakened or redesigned. Saving still requires a valid native destination; unavailable storage produces an error rather than a false saved indication.

## Interface and feedback

- Neutral white/gray conversation layout, centered native content, compact header and existing actions under options. Formatting and Context & AI are available on demand.
- Contributions starts collapsed. Top icon buttons expand/collapse, compose and return to the present. Numbered markers occupy a separate scrollable lower section; expansion restores contribution details and existing history/sequence controls.
- Actual asynchronous native paste preparation drives an accessible spinner. Submission is protected until the draft paste finishes. Clipboard reads retain their existing user-activation timing.
- Animated `...` appears above the native draft while awaiting a response, with an accessible status and reduced-motion styling. Send becomes Cancel during the request.
- The retained native editor stays mounted during panel changes. No alternate editor, geometry renderer or document representation was introduced.

## Isolated automatic title

After the first human contribution, live-provider mode queues one bounded title task. It uses the configured provider/model and credentials, up to 4,000 source characters, 512 output tokens and a 20-second deadline. The host fixes the instructions and validates a single title field of at most 120 characters. No DCP tools or model-generated operations are accepted.

The utility route is independent of DCP exchanges and their continuity acknowledgements. OpenAI requests use `store:false` and omit both `conversation` and `previous_response_id`; this follows the API's explicit conversation-state controls. [OpenAI conversation-state documentation](https://developers.openai.com/api/docs/guides/conversation-state).

Neither utility prompt nor response becomes a Contribution or an entry in the user's provider history. Only the validated title reaches native metadata. A result waits for active response admission to finish and is discarded after a user title change, Document switch, first-contribution replacement/undo, feature disablement or disposal. Missing credentials delay the task; errors are nonfatal and do not trigger automatic retries. Mock mode does not contact a provider for titles. Existing optional server diagnostics may retain utility request evidence separately from conversation history.

## Qualification

`npm run typecheck` passed. **270 tests across 10 focused suites passed**, covering Dialectic compatibility, submission saves, utility coordination, native save/session behavior, clipboard behavior, provider adapters, broker isolation and durable conversation continuity.

Specific assertions include date-name collisions without overwrite, preservation of a custom filename despite a generated metadata title, successful Save As rebinding, recovery after `Failed to fetch`, no Markdown sidecars, unchanged contribution/history identities after title generation, rejected stale title results, utility input/output validation, no utility tools/continuity, and no snapshots/saves/unrelated row rebuilds during ordinary typing.

`node scripts/check-dialectic-conversation-browser.mjs` passed using an isolated Chrome profile, native editor and in-memory persistence fixture. It confirmed two saves for human/assistant submissions to the same dated filename; no save during typing or delayed paste; a visible spinner before paste completion; visible response dots; retained editor mounts after rail expansion/collapse; and 35 numbered markers scrolling without canonical revision changes. At the tested 1,440-pixel viewport, the collapsed rail measured 58 pixels. Screenshots are emitted to `/tmp/dialectic-conversation-{desktop,waiting,pasting}.png`. The refreshed desktop layout was visually inspected; a separate visual qualification of the Textual skin was not performed.

One synthetic live OpenAI title request passed using the existing configured `gpt-5.4-mini` model. It returned “Revising Historical Interpretations”; captured request settings confirmed `store:false`, zero tools and no conversation or previous-response identity. Reported usage: 121 input + 29 output = 150 tokens. No user Document content was sent and no broad benchmark was run.

Flags `dialecticConversationUpdates` and `dialecticAutomaticTitles` default to enabled. Disabling them retains manual Dialectic saving and suppresses automatic title work respectively. Prior feature defaults, including the user's virtualisation setting, are unchanged. Temporary qualification servers and Chrome were stopped; the development server remains stopped.

## Follow-up: first-submission save/request race

The first-use live path exposed an integration defect missed by the initial immediate-save/mock browser fixture. Submission starts autosave, then provider configuration yields. When configuration completes during that save, the conversation guard incorrectly calls the full presentation-transfer eligibility check. Its pending-save restriction prevents the AI exchange from starting, displaying “Finish the Document Save or recovery before switching presentation”, even though no presentation switch was requested. The same guard could reject response admission during a slower save.

The retained diagnostic log for 10 November at 16:00 Brisbane time contains `contribution.committed`, provider settings and the isolated title request, but no conversational `/exchange` request. A new deterministic first-use test reproduced the exact displayed error before the fix.

Shared interaction checks are now separate from the additional save/recovery check required for actual presentation transfer. Dialectic in-place operations use the former; actual presentation switches retain both. IME, gestures, current text operations, close/import guards, source authority and native save/recovery semantics remain intact. No request is delayed until saving finishes, and no autosave is suppressed.

Follow-up qualification: **131 tests passed** across conversation updates, prior Dialectic behavior, native save/session behavior and host presentations; typechecking passed. The regression uses a real pending native save and a deterministic provider response through the live controller path: the response starts and is admitted before the save resolves, actual presentation transfer is still blocked, and the queued second save persists the newer contribution to the same filename. The browser fixture now deliberately holds the first save until the assistant contribution appears; it passed with no presentation error. Existing typing/scrolling bounded-work checks remain green. No user Document was modified and no live provider request was needed for this fix.

## Follow-up: plain-text paste by default

Ordinary text paste into a human Dialectic draft now uses the existing plain-text import path. Rich HTML and native clipboard carriers contribute text rather than formatting or native structures; HTML-only clipboard data uses the existing safe text extraction. Paragraph breaks remain native text paragraphs. Explicit Paste as Markdown retains its existing behavior, and clipboard defaults outside conversation drafts are unchanged.

The policy checks only destination occurrence ancestry during paste. It introduces no typing subscription, Document scan or persistence work, and retains asynchronous preparation/progress, selection validation and native Undo/Redo. Qualification passed: 9 conversation-update tests and 73 clipboard tests, plus typechecking. Added cases cover rich HTML, native clipboard data, HTML-only text, paragraph breaks, Undo/Redo and zero repository snapshots, resource inventories, network requests or autosaves during these pastes.
