# DCP source capability recovery — qualification

2026-11-08. Focused correction to the accepted Test #5 diagnosis.

## Result

Source identity and exact-source validation failures can now use `list_text_blocks`, `read_source` and `search_symposium` during the existing single repair. Client and broker enforce the same eligibility. Other validation failures do not gain tool access. Repair shares the original six-call budget, eight-round limit, traversal limits, deadline and cancellation signal. A second invalid candidate remains terminal.

There is no historical-handle remapping. Native ownership, current revisions, exact selectors, source-text protection and atomic materialisation remain authoritative and unchanged.

## Instructions and conversation history

Instructions distinguish durable Block GUIDs, exchange-local source handles and revision tokens, and response-local aliases. A compact example demonstrates discovery by durable identity followed by `read_source` and an exact anchor. Recovery instructions preserve requested structural work rather than encouraging empty semantic arrays.

Persistent OpenAI history retains raw requests, responses and tool results as well as conversational content. These can contain expired capabilities. New requests and tool results now carry their exchange scope, and each provider request states the active exchange and the historical status of older capabilities. Existing native history projection, continuity checkpoints and historical records are retained; nothing is erased to hide expired handles. This matches the [OpenAI conversation-state model](https://developers.openai.com/api/docs/guides/conversation-state), which retains messages and tool interactions.

## Inspection

The existing **Last provider attempt (session only)** inspector opens on failure and displays the authoritative failure, diagnostic code/path, rejected responses, request and retrieval trail. Both rejected candidates are retained. Manual selection notices use their existing separate notice area and cannot replace the exchange diagnosis. Capturing the diagnostic safely unwraps reactive data.

Failed exchanges remain session-only, as before; this is not a new persistent error store. The next exchange replaces the last-attempt record.

## Qualification

| Check | Result |
| --- | --- |
| Ten-contribution synthetic conversation; handle genuinely issued by an earlier exchange | Old handle rejected at `$.anchors[0]`; bounded `source-identity` diagnostic supplied |
| Single repair | Discovery then source reading permitted; fresh handle and revision returned for the intended native TextBlock |
| First-sentence classification | Exactly one `dialectic/claim` and one range anchor, inclusive Cells **0–54**, **55 Cells**, rather than the 169-character passage |
| Source integrity | Original full text and mounted editor preserved; no source rewrite |
| Atomicity and history | Exactly one AI contribution committed; Undo removes it and its annotation; Redo restores it |
| Second invalid candidate | Terminal; no extra contribution or annotation; rejected response and diagnosis inspectable |
| UI regression | Real Dialectic view in DOM tests retains the exchange failure after “Reply to selection” produces a manual selection error |
| Budgets | Six calls across initial work and repair exhaust the same budget; a seventh is rejected; non-source repairs cannot use tools |
| Bounded work | Successful replay invokes zero repository snapshots and zero projection builds |
| Persistent conversations | Existing five continuity tests pass, including failed-exchange quarantine, reload/delta history and repaired-commit recovery |

**Tests:** 69 distinct tests passed across the Dialectic integration, provider, broker and continuity files, including focused reruns after fixes. Reactive and server TypeScript checks pass; `git diff --check` passes. Qualification used deterministic provider streams and DOM integration tests; no new paid live OpenAI request or trusted-browser session was required. This proves host recovery and materialisation, not a guarantee that a model will always choose the correct passage.

`vaults/imported/test5.ink` was not modified. Before/after SHA-256: `e45640010ea2e4f39952c9fced7008aef9b02a67748370686be21a57072be984`.

## Changed modules

- `src/features/dialectic/dcp/{diagnostics,live,provider-contract,authoring}.ts`: recovery eligibility, capability guidance and retained failure diagnostics.
- `server/dialectic/{broker,providers}.ts`: source-repair tool admission and exchange-scoped history labels.
- `src/features/dialectic/{controller.ts,view.tsx}`: independent, inspectable exchange failure in the existing inspector.
- `src/features/dialectic/dialectic.test.tsx`, `server/dialectic/broker.test.ts`: focused regressions.

Earlier Submit/default-assistant changes already in the working tree were preserved. No source-resolution framework, editor mutation pipeline, saved user document or dev-server lifecycle was changed by this correction.

## Test6 contribution #11 follow-up — 8 November 2026

Read the actual hosted response `resp_0324a65585e6d2d1006af00c3bf5bc8195b7c90a418012c8c2` and its conversation items without submitting a new user exchange. The restarted backend supplied all three tools and current discovery instructions. The model invoked none, returned the quoted apology with empty anchors/interpretations, and passed structural validation. No repair was triggered. The API receipt confirms `reasoning.effort: none`. This was a model omission, not unavailable native text or a materialisation failure.

The provider adapter now explicitly uses **low reasoning for GPT-5.4 Mini and its dated snapshots**, within the existing output-token limit. Other models are unchanged. [OpenAI documents Mini's default as none](https://developers.openai.com/api/docs/models/gpt-5.4-mini). The existing instructions also clarify retrieval before declaring a source unavailable, selecting the correct child TextBlock, and acknowledging an actual source annotation without copying its text into a new classified paragraph.

Two small synthetic browser exchanges compared the same ten-contribution setup, with the target sentence in the third TextBlock of the opening contribution. With the revised instructions but no reasoning, the model still skipped the relevant read and emitted a duplicate alias/invented revision; validation rejected it. With low reasoning, it called `list_text_blocks`, then `read_source`, returned one exact anchor and `dialectic/claim`, and committed successfully without repair. The anchor covered Cells 0–54 (55 Cells); the full 169-character source and its mounted editor were unchanged. Inspection displayed the native claim. Zero repository snapshots/projection builds; observed commit 44.2 ms in the isolated browser. Successful outgoing HTTP bodies totalled 96,738 bytes, including continuity setup and three model turns. This is a successful live reproduction, not a guarantee of future model compliance.

Artifacts: `artifacts/dcp-source-claim/report.json`, `browser.png`, and `.mutable/dcp-test-phase/*.jsonl` under that artifact directory. The failed comparison is retained too. The user's saved documents were not edited.

## DCP Test Phase Logging

`src/configuration.ts`: **`dcpTestPhaseLogging: true`**. Server wiring is in `server/index.ts`; capture is in `server/dialectic/test-log.ts` and `broker.ts`; committed native content and client-side validation/materialisation outcomes come from the existing controller/history projection and provider session.

- Append-only JSONL files under `<Cavern>/.mutable/dcp-test-phase/`, one file per broker run, with ordered events and session/Document/exchange/request identifiers. No Cavern falls back to the local application directory's `.mutable/dcp-test-phase/`.
- Captures committed local/remote contribution content, chronology and native identities; context manifests; raw provider HTTP bodies and consumed response streams; tool calls/results; validation, repair, cancellation and errors; materialised identities and annotation references.
- Credentials, bearer tokens and cookies are redacted. Files use mode 0600; the diagnostic directory uses 0700. Files remain local and git-ignored, outside native Documents. This is not document saving or extra context sent to a provider.
- Recording occurs at submission/exchange boundaries. Ordinary typing adds no logging network calls, history projection, snapshots or geometry scans. Existing bounded history projections are reused; native text and authoring validation are unchanged.
- A read-only phase-start baseline of saved `test6.ink`, the actual refusal response and its 13 hosted conversation items is already recorded in the imported Cavern. These are explicitly labelled retrospective evidence. Automatic capture on the user's running application requires restarting `npm run dev` and reloading after saving; server modules are compiled only at startup.
- Set the single flag false, restart and reload to stop future capture; existing evidence is retained. A process crash can leave an incomplete final JSONL line or a response without a completed body event. No automatic deletion/rotation was added.

Qualification: 44 Dialectic integration tests, nine broker tests and three logger tests passed before the UI follow-up. Eighteen provider tests pass, including reasoning selection and unchanged custom-model parameters. Focused logging tests cover disabled recording, full streamed/error capture and secret redaction across chunk boundaries. Client logging tests verify committed content and zero logging/projection work during typing. Both TypeScript projects pass.

## Contribution UI follow-up

- The existing retained native input is bottom-aligned using scoped CSS, including empty and long conversations. No second editor or DOM lease was introduced.
- Each contribution has a right-side hamburger menu with **Resend this text**. It creates fresh contribution/TextBlock identities and submits through the existing assistant path. The original and any unfinished draft remain intact. Resend is explicitly a text operation; it uses the existing 6,000-character/512-Block admission limit and rejects oversized input rather than truncating it. It does not copy annotations or claim ownership of existing argument identities. The draft menu invokes normal Submit.
- Removed “Your draft”; navigation uses “New contribution” and “Write”.

Focused resend regression passes: duplicate clicks produce only one resend, Undo restores the prior state, original identities/mounts are retained, and no repository snapshot occurs. Trusted browser menu interaction passes; input bottom equals the viewport bottom in the long conversation and is within one CSS pixel when empty. Desktop/Textual/Desktop preserves the editor mount and does not duplicate menus. Evidence: `artifacts/dcp-source-claim/ui.json` and `ui.png`. Reproduce the UI check without provider requests using `DIALECTIC_UI_ONLY=1 node scripts/check-dialectic-source-claim-browser.mjs`; the live annotation check uses the same script with the server environment key loaded.
