# Dialectic native Document inventory — qualification

2026-11-08. Implemented within the existing DCP/provider feature flags. No new content store, editor, annotation system or Document query language.

## Saved evidence

Inspected `vaults/imported/test-dialectic.ink`, contributions **#1–#8**, as authorised. #9–#10 were not saved and are not claimed as inspected.

For #8, the current request was “This is just a test session. Try adding, "This is a test remark from OpenAI."”. The fresh manifest contained only contribution #7 (`e0b36140-108d-4d68-a1dd-2c2ecdf8e8bb`) and its TextBlock (`2b7e4e8a-df85-4a24-bf8f-e115ebb6f4f3`). There were **no tool calls or validation repairs**. The response classified #7 as a claim and supplied a new paragraph; it did not attach a Gloss to the first Block. The original first TextBlock is `eb3920a2-6571-44c0-a533-d381ccb0311a`.

The old interface exposed `read_source` for issued handles and `search_symposium` for a nonempty literal query. **Query-free native enumeration was missing.** Persistent memory did not supply fresh authoring authority for old sources. The failure was not a hidden deletion during materialisation.

The saved file remains unchanged: SHA-256 `7b90c3c21937046bf5410ca98402d6e2e8348b72334588e13cf88a4450d01420`. Live tests used isolated synthetic Documents, not the user's conversation.

## Implemented contract

`list_text_blocks({cursor, limit, contributionId, participantId, fromOrdinal})` enumerates committed native TextBlocks using the existing chronology and ownership resolver. Nullable filters support contribution identity, participant identity and inclusive contribution ordinal. Results include native Block GUID, containing contribution/participant, one-based position within the contribution, short preview and an exchange-local handle.

- At most **20 items/page**, **160 preview characters/Cell reads per item**, **128 traversal visits/page**, **512 visits/exchange**, and **32 layout levels**. Existing six-tool-call and retrieval-result budgets remain effective.
- Lazy, exchange-local, single-use cursors; bounded traversal includes missing/duplicate edges. Drafts, foreign Documents and ambiguous ownership are excluded. Partial coverage is explicit.
- Preview results carry no source revision or exact-anchor authority. `read_source` obtains current text/revision; existing validation and revision fencing remain authoritative.
- An unknown/expired handle remains unauthorised. Its error can include a five-item fresh inventory from the current Document, requiring an explicit new source read. This never silently remaps or accepts the expired handle.
- Instructions distinguish **memory → discovery → authoring**. Tool continuations explicitly allow further retrieval instead of prematurely ending after one tool result. Repair guidance prohibits substituting another passage merely to fix a handle error.

Nothing runs on ordinary typing. Inventory requests add no subscriptions, whole-Document text preparation, repository snapshots, saves or projection rebuilds. Canonical annotation creation uses the existing operation/history/dirty path.

## Live browser result

Trusted Chrome input through Dialectic's real Desktop UI, local broker, persistent OpenAI conversation and default `gpt-5.4-mini` (receipt: `gpt-5.4-mini-2026-03-17`):

| Request | Observed result |
| --- | --- |
| At contribution #12: “Tell me what text blocks you can see. List the starting few words and block GUID.” | Called `list_text_blocks`; listed all **12** native TextBlocks, including the **11 earlier** Blocks with their correct GUIDs. |
| At #14: attach the exact remark to the earlier garden Block, identified by GUID and opening words | Called `list_text_blocks`, then **`read_source`** using a fresh handle. Returned an exact anchor, a `remark` Gloss and a discursive reference. |
| Native result / inspection | Gloss value **`remark: This is a test remark from OpenAI.`** attached to source `7fb4c4d0-7b5b-479f-b0a9-c635706fdc48`. Source text unchanged and protected. Existing inspector navigated/highlighted it and showed AI authorship over human source text. |

Both exchanges used the same provider conversation. **No repair** in the passing run. The annotation exchange took **9.59 seconds including provider round trips**; measured canonical commit was **22.5 ms**. **Zero repository snapshots and zero projection builds** during that exchange. These are local headless-browser observations, not guaranteed interactive latency.

Passing run: **138,310 outbound request-body bytes** across nine HTTP requests (five Responses calls plus conversation/history operations), including schemas and instructions. Earlier small diagnostic runs also contacted OpenAI: seven scenarios / thirteen participant requests in total. A separate startup timeout occurred before any API request.

Live testing initially exposed omitted inventory calls, reuse of expired handles, and premature refusal after a source read. Merely adding the tool and static instructions was insufficient; the final continuation guidance completed the discovery/read/authoring chain. The passing follow-up deliberately named the GUID and opening words. Relative wording such as “my first Block” was unreliable in earlier runs and was **not requalified after the final correction**. Validation enforces native integrity, not arbitrary natural-language intent.

Evidence: [live exchange/metrics](DIALECTIC_INVENTORY_LIVE.json), [live screenshot](DIALECTIC_INVENTORY_LIVE.png), [earlier diagnostic outcomes](DIALECTIC_INVENTORY_LIVE_DIAGNOSTICS.json), [deterministic browser fixture](DIALECTIC_INVENTORY_FIXTURE.json).

## Focused checks and changed modules

- Dialectic **37**, broker **5**, provider **14** tests passed (56 distinct focused tests across the runs). Reran the two inventory checks after the final source-recovery change and the provider tests after continuation changes.
- Coverage: twelve contributions, paging, filters, bounded traversal, expired/foreign/reused cursors, foreign Documents, private drafts, stale source fences, preserved source Cells/editor mount, native Gloss, Undo/Redo, no snapshots/builds, and both provider adapters retaining tools across successive continuations.
- Frontend and server TypeScript checks passed; `git diff --check` passed. No broad regression suite or new testing framework.
- Added `src/features/dialectic/dcp/inventory.ts`; changed `sources.ts`, `authoring.ts`, `provider-contract.ts`, `exchange.ts`, `controller.ts`, and `server/dialectic/providers.ts`. Tests: `dialectic.test.tsx`, `providers.test.ts`, `scripts/check-dialectic-inventory-browser.mjs`.
- Controller changes reuse chronology and narrowly unwrap participant metadata before cloning on Submit; the participant-filter fixture exposed the previous Solid proxy cloning failure. No presentation or canonical editor refactor.

## Limits / activation

Inventory currently lists native `standoff-editor-block` text within committed compositions; it is not a complete inventory of every Block family. Large/deep Documents require filters/pages and may reach the disclosed exchange limit. Model compliance remains probabilistic; inspect actual structures rather than trusting “Done.” Live Anthropic testing and broader UI/persistence requalification were outside this focused increment; existing coverage was retained.

The user's running development server was left untouched. **Save open Documents, then restart `npm run dev`** so the backend loads the new tool and continuation handling. Refresh the application after restart.
