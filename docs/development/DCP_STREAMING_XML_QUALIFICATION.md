# Dialectic native streaming XML qualification

12 November 2026. Implemented and enabled by default through `dcpXmlStreaming`, alongside `dcpXmlAuthoring`. Provider transport remains streaming. No paid provider calls were made.

## Behaviour

Each complete XML Block is prepared through the existing native DCP preparation path and inserted into the actual Document. Incomplete XML waits for its closing element. The same native Block identity and mounted DOM element remain through completion: there is no separate preview renderer or final replacement.

Entities, Glosses, Arguments, relationships and source annotations are applied incrementally when their dependencies resolve. Forward references wait; mandatory Entity grounding remains enforced, so a new Entity and its anchored mention are admitted together. Native source authority, ownership, validation and cumulative response budgets remain enforced. Receiving content is protected against user editing.

Each native insertion is canonically validated, published and marked dirty. Its history operations accumulate in one Undo group. Completion, cancellation or failure closes that group. Already admitted valid content remains in the Document after interruption, with a notice; incomplete XML and unresolved semantic operations are not admitted. Undo removes the received contribution and its associated semantic changes together. Unrelated draft typing is not absorbed into this group. Automatic repair cannot replace content already inserted.

This supersedes the earlier provisional-preview implementation in response to the user's clarified requirements. Incremental native publication means there are multiple canonical transactions, with one grouped Undo operation; there is no claim of whole-response atomic rollback on interruption. Manual saving remains unchanged.

## Protocol and compatibility

The compact server-derived contract prefers consecutive rootless XML fragments. Legacy `<response>` and `<definitions>` wrappers remain accepted, with their closed children processed progressively. The shared SAX parser handles arbitrary transport splits and comments; DTDs, processing instructions, XML declarations and CDATA are rejected.

The existing XML vocabulary is unchanged: paragraphs, headings, lists, tables, grids, groups, code, inline formatting, Entity mentions/definitions, passages, classifications, Arguments, Glosses and relationships. Claim classification is not a new native n-ary Claim constructor. JSON compatibility remains available. Disabling `dcpXmlStreaming` restores the wrapped contract and whole-response admission route.

## Focused qualification

Two deterministic browser messages passed through the native Dialectic UI:

1. Completion: a paragraph appears before the provider finishes; later Entity and Gloss operations enrich that same native Block; a second paragraph and argumentative relationship follow. The first Block retains its ID and DOM element through finalization. One Undo/Redo covers the AI contribution, interleaved draft typing survives, and native persistence round-trips.
2. Cancellation: the received native paragraph remains with an interruption notice, and one Undo removes it.

Streaming instrumentation detected zero full-document snapshots and zero `Object.values` enumerations of the complete repository contents/placements maps. This is a bounded regression check, not instrumentation of every possible traversal or a full-workspace performance benchmark. Native preparation processes completed fragments; it does not reparse the whole prefix for each transport chunk. Final syntax validation parses the complete bounded response once without reconstructing native Blocks.

The parser and lowering qualification additionally covers chunk splits, Unicode, escaping, legacy envelopes, prohibited XML and shared native semantic preparation. Client/server TypeScript checks and whitespace validation were run after cleanup. No broad benchmark or additional paid inference was performed.

## Local measurements

From the native browser replay:

| Boundary | Elapsed |
|---|---:|
| Submit to first provider text | 191.4 ms |
| First provider text to checked first native display | 34.3 ms |
| Provider completion to validation completion | 0.8 ms |
| Provider completion to checked final native display | 66.4 ms |

The fixture deliberately delays provider start by 150 ms and pauses between fragment batches. These are deterministic local handling measurements, not live provider latency or exact compositor paint receipts.

Evidence: `artifacts/dcp-streaming/qualification.json`, `first-fragment.png`, `committed.png`. Reproduction: `node scripts/check-dialectic-streaming-browser.mjs`; service requests are intercepted and no paid provider is contacted.

## Remaining limits

An individual large paragraph or compound Block waits until its XML element closes. Unresolved semantic dependencies remain pending and are reported if the response ends before they resolve. Undo/Redo is suspended while the native group is open; draft typing remains available. The replay qualifies the small native streaming scenario, not live-model compliance or performance in a large user workspace.

## Follow-up: university response reference mismatch

The supplied university-history response contained `<gloss target="wissenschaft" whole="true">`, but `wissenschaft` was declared by `<entity>`. Whole-text targets require a Block identity, not an Entity identity. This is an agent-authored reference-kind error; the streaming resolver correctly rejected it, but its previous `Wrong XML reference kind` message concealed the useful details.

Complete and incremental lowering now share an explicit reference-kind diagnostic naming the reference, actual kind and expected kinds. Streaming/controller wrapping preserves that message without repeated `Error:` prefixes. Validation remains strict; no Entity is silently converted into a textual occurrence.

The corrected form gives the inline mention its own passage identity: `<e id="wissenschaftMention" ref="wissenschaft">Wissenschaft</e>`, then `<gloss target="wissenschaftMention" kind="scope">…</gloss>` without `whole`.

Focused regression: `native-stream.test.ts` uses the supplied response, with historical host aliases rebound to fresh handles for a minimal synthetic source containing its exact quoted phrases. This verifies local compilation/admission, not the original exchange's unavailable authority receipts. The initial diagnosis reproduced failure at the identified Gloss after retaining all 19 Blocks and 19 Entities. The subsequent warning recovery below supersedes that stop-on-error behaviour. The corrected response finishes with six Glosses, six Arguments, five argumentative relationships and three Entity relationships. The Wissenschaft Gloss's native range covers exactly that word. No source reads, Entity searches or full-document snapshots occur during the replay. No paid calls or user Document edits were made.


## Quiet semantic warnings

Malformed or unresolved semantic operations in the streaming XML path now produce a persisted contribution warning instead of a global exchange error. Valid Blocks and independent semantic operations continue. The original university response now retains 19 Blocks and 19 Entities, creates all six Arguments and eight relationships, and skips only the invalid Wissenschaft Gloss (five valid Glosses remain).

A warning triangle appears alongside the contribution activity summary. It is collapsed by default; activating it reveals a bounded explanation. Opening/closing it is local presentation state and performs no repository transaction or snapshot. Notices use the existing native contribution metadata and survive persistence and Undo/Redo. No new registry or persistence representation was introduced. Interrupted-stream notices now also use the existing valid notice shape.

Failed native semantic preparation restores exchange-local identities, definitions, ranges and grounding state before continuing. Attempt budgets remain spent; unresolved dependencies are skipped without inventing targets. Canonical admission failures, global source/session invalidation, budget violations and malformed XML framing still stop the stream. Recoverability applies to individually framed semantic operations; it does not guess how to repair broken XML or relax source authority. The strict whole-response JSON/legacy path remains unchanged.

Focused qualification includes the original/corrected university response, malformed Gloss settings and attributes, a missing quote, unresolved passage, and an Entity whose grounding fails. Valid operations and a later paragraph survive; failed preparation leaves no unadmitted definitions behind. The controller/UI case verifies no global error, the collapsed triangle and disclosure, native persistence and grouped Undo/Redo. Checks detect zero repository snapshots during streaming and no repository work on disclosure. No paid provider calls or user Document mutations were performed.
