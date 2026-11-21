# Persistent OpenAI conversations and native text protection

8 November 2026 — implemented and qualified. Both `nativeTextProtection` and `dialecticProviderContinuity` default to **true**. No branches, new editor, automatic Document saves or separate content store were introduced.

## Result and shared-code impact

The focused capability inspection found no existing enforceable text-versus-annotation permission: passive rendering blocks authoring wholesale; `contenteditable` and registered-command restrictions alone do not protect canonical records.

| Changed modules | Result |
| --- | --- |
| `block-tree/repository.ts`, new `text-protection.ts` | Generic pre-publication admission and indexed protection of canonical composition roots. Proposed record batches are checked before state, history, revision or dirty publication. Mixed forbidden/permitted operations reject atomically. |
| `block-tree/commands.ts`, `reactive-editor/editor.ts` | Early deletion/cross-Block rejection before legacy planning; retained input rejects typing, Cut, Paste, composition and provisional completion on protected text. Shared canonical occurrences are protected together. |
| Three existing text renderers | Existing standoff mounts become noneditable, textareas read-only; selection and annotation controls remain available. No replacement editor or geometry subsystem. |
| Dialectic feature/controller/view | Submitted compositions acquire protection; drafts remain editable. Annotation changes, semantic relationships and their history remain independent. Undo Submit releases that contribution; Undo AI removes its complete transaction. |
| New `continuity.ts` and `dcp/continuity-contract.ts` | Cached, bounded native history projection; stable checkpoints survive Save's JSON ordering and annotation-only changes. Recipients retain attributed history without copying other participants' private provider/tool records. |
| Provider transport, broker, adapter, new `conversations.ts` / `continuity-store.ts` | OpenAI Conversations plus Responses; durable metadata-only coordination, native commit receipt and subsequent acknowledgement. Existing stateless OpenAI and Anthropic paths remain available. |
| Configuration/settings/server wiring | Default-on flags, existing AI participant selection, and disclosure of provider retention. Credentials remain outside Documents and the coordination journal. |

One binding covers **Cavern + native Document + AI participant + provider connection**. Reply ancestry and selected context do not change it. A connection is identified by a SHA-256 credential fingerprint; changing a key creates a distinct binding. Model changes alone do not.

## Synchronisation and limits

Pending intent is journalled before any remote mutation. Initial/recovery history uses at most 20 items per append; subsequent exchanges append only unsynchronised native contributions. Responses automatically retain their own output, so tool continuations do not resend it. Current participant instructions, provider memory, fresh DCP context and source retrieval remain distinct; old handles are explicitly expired.

Validated native composition, annotations, relationships and the continuity receipt commit together through the existing bounded transaction. The broker is acknowledged afterward. Matching saved receipts reconcile lost acknowledgements. Missing/divergent history, Undo, cancellation, failed materialisation, expired pending work or repaired candidates require a fresh generation on the next explicit Ask. No charged request is automatically retried. Duplicate/stale requests are rejected.

The journal uses pinned Cavern IO, an OS lock and two alternating immutable publications, preserving the previous complete record during replacement. It contains IDs, hashes and coordination state—not text or credentials. It is not a Document autosave.

Provisional replay limits: **128 contributions, 128,000 text characters, 1 MiB encoded projection**. Provider context exhaustion is explicit; neither truncation nor silent stateless fallback occurs. OpenAI requests use `truncation: disabled`. Compaction is deferred. Unsupported providers retain their existing stateless route; a mismatched/older OpenAI server requires an explicit configuration change rather than silently abandoning continuity.

## Qualification

**59 distinct focused tests passed.** The 58-test integration set passed; the final affected provider run passed 17 tests, including the additional context-exhaustion test. Server TypeScript build passed. The broader frontend check remains affected by existing repository errors; no clean whole-project typecheck is claimed. No exhaustive suite was run.

Covered: direct Cell/text writes, shared aliases, mixed atomic batches, cross-Block replacement, structural deletion, Scry completion, annotation add/edit/delete and Undo/Redo, draft restoration, unchanged state/dirty notifications after rejection, ordinary unprotected editing, participant/connection isolation, service recreation, duplicate exchange rejection, uncertain recovery, lost ACK, repaired-response quarantine and sorted Save checkpoint stability.

Trusted Chrome interaction used an isolated synthetic Cavern and the existing application/native Save pipeline. Draft typing, Paste and IME passed. Submitted text rejected typing, Paste, Cut and IME; selection, actual clipboard copy/paste and toolbar annotations passed. The test waits for Mutable's asynchronous clipboard write before pasting. Retained editor use, native Undo/Redo and Desktop/Textual transitions passed.

### Live OpenAI evidence

The recorded run used **gpt-5.4-mini-2026-03-17**:

- Fifteen committed native contributions, with twelve already present at the recall request; no manually selected context.
- Correct recall of the first contribution's “cobalt cedar 42”.
- One provider conversation/generation across all three Ask operations, including native Save/reload.
- Fresh `search_symposium` retrieval of the original human TextBlock after reload.
- One native discursive reference, an exact existing-source `dialectic/claim`, two argument identities, and `supports` directed from the original forecast argument to the generated suggestion.
- Source annotation verified on the original first TextBlock; native inspector interaction and Undo/Redo passed. No validation repair.

An earlier exploratory live run recalled and annotated correctly but omitted the requested relationship. This is model variability, not a promise that every structurally valid response fulfils every requested operation. The recorded final run returned all requested structures; deterministic tests independently cover their native materialisation. Live calls used synthetic content only.

Artifacts: [live results](DIALECTIC_CONTINUITY_LIVE.json), [live screenshot](DIALECTIC_CONTINUITY_LIVE.png), [deterministic browser results](DIALECTIC_CONTINUITY_FIXTURE.json), [deterministic screenshot](DIALECTIC_CONTINUITY_FIXTURE.png). The live screenshot shows inspection of a generated claim; the earlier-source claim is independently verified in the native state and shown by the deterministic inspection flow.

## Bounded work and remaining considerations

- Recall commitment: **6.5 ms live**, **6.0 ms deterministic**, with **zero repository snapshots or projection rebuilds** in the measured Ask flow. End-to-end live recall took approximately **3.24 s**, including the provider; this is not a typing-latency claim.
- A 200-edit canonical microbenchmark measured **24.4 ms** without a protected source and **26.4 ms** with one, with zero snapshots or protection reindexing during typing. This is a unit benchmark, not guaranteed browser latency.
- Protection is indexed on policy activation/commit, then checks affected operation records. Initial policy registration reads existing records once. History projection is prepared on Ask, cached per Document/content and invalidated by relevant changes; ordinary typing does not project provider history or perform network work.
- Abandoned remote conversations/items are not deleted automatically. Forgetting credentials does not erase provider history. Recovery may replay native history and incur provider cost on the next explicit Ask.
- A crash can leave an unreferenced staging file containing only coordination metadata; automated housekeeping is deferred. An unfinished lease may briefly block another Ask until cancellation or expiry permits recovery.
- Manual Save remains authoritative. The user's original `New conversation.ink` is unchanged (SHA-256 `a452ef0b5d9c36375a07c3cd9cdd937ae85b085e950e17f3d9d6f1e2ce19c03c`).

The backend build is ready. The user's running backend/browser were not forcibly restarted or refreshed; save open work before restarting Mutable to load the updated broker.
