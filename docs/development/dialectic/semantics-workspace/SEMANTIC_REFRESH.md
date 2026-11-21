# Contribution semantic refresh

Implemented 16 November 2026. Default-on flag: `dialecticSemanticRefresh`.

## Behaviour

Each committed human or AI Contribution has a **Refresh semantics** control. It opens an optional additional-instructions textarea below the source text, with **Refresh** and **Cancel** actions. Both actions dismiss the input. Cancel performs no request or Document mutation. Refresh shows a small spinner and “Refreshing semantics…” in that location; Stop cancels an active request. Success displays additions, enrichment, skipped duplicates and any retained conflicts. Failure displays the error and allows another attempt.

The request can recover missing semantics or ask for richer interpretation. It includes the optional comment, current source authority and the Document's semantic workspace. It uses an isolated provider exchange so it does not invent an extra conversational turn in retained provider history. Existing source-reading, Entity search and authority lookup tools remain available; image/file generation is not negotiated.

The response may contain only semantic definitions and annotations. It cannot introduce paragraphs, images, media, or replacement prose. New Entities require grounded mentions; new annotations and Arguments belong to the selected Contribution. Entity relationships require endpoints mentioned there. Existing values survive enrichment; conflicts remain attached for review.

One native transaction adds the admitted semantics and a refresh provenance record to the original Contribution. The record retains the comment, request/response, provider receipt, semantic identities and annotation references. Activity summaries include refresh effects. Original text, ordinal, original response provenance and conversational chronology are preserved. Undo/Redo applies to the refresh as a unit. The Document becomes dirty and is saved manually; refresh never calls the submission-save service.

## Reconciliation

Host reconciliation uses the full live Document definition registry, independently of the bounded workspace supplied to the model:

- Existing Entity handles retain identity. Matching names/aliases and types can reuse a unique existing identity; conflicting descriptions or ambiguous names require an explicit current handle instead of creating a duplicate. Authority IDs remain candidates, not automatic canonical identity proofs.
- Passage identity uses the native source occurrence and exact range. Arguments reuse that anchor identity.
- Relationships compare their family, normalized label, directed endpoints and scoped identities. Opposite directions remain distinct. The agent is instructed to reuse established labels; arbitrary synonyms are not treated as a universal ontology.
- Claims, mentions and Glosses compare native type, source range and their semantic value/reference. Unused selector anchors are discarded.
- Repeated enrichment with no new values or conflicts is a no-op. Reconciliation also handles duplicate proposals inside a single response.

Source revisions remain fenced during provider work. Cancellation, changed sources, invalid selectors or failed validation prevent admission. Ordinary native validation and protected-content checks still apply. The only new protected-content exceptions are refresh provenance and explicitly registered host-owned transient input fields; neither grants permission to modify authored text.

## Bounds and validation

Refresh bypasses the ordinary 6,000-character conversational excerpt capture and uses the existing bounded source manifest: up to 24,000 aggregate characters, 64 projected sources, the existing byte budget and bounded follow-up tools. Individual source and DCP authoring limits still apply. Partial initial context is disclosed in the completion summary; a refresh does not guarantee that every possible interpretation was generated. Comments are limited to 4,000 characters and each Contribution retains up to 32 refresh records.

All discovery and reconciliation run only on explicit Refresh. Comment typing is transient state: regression checks assert no repository revision, snapshots, whole-repository enumeration or network requests. Existing typing/protection and multi-Document bounded-work tests remain passing.

Regression coverage includes repeated refreshes, enrichment conflicts, directed relationships, selected-source confinement, no-content responses, native serialization, Undo/Redo, immutable original text, stale-source rejection, cancellation, feature-off behaviour, optional comment forwarding, IME event handling and spinner transitions. Both provider adapters preserve the refresh contract and comment.

Validation completed: 126 distinct focused regression tests passed, along with TypeScript checking, the server build and the real-browser workflow below. Provider responses in qualification are fixtures, not paid live inference.

`scripts/qualify-semantic-refresh-browser.mjs` exercises native browser text entry, Cancel, comment forwarding and pending/completed UI against an in-memory Document with mocked provider responses. It performs no paid generation or file save. Screenshots: [comment panel](evidence/semantic-refresh-comment.png), [pending request](evidence/semantic-refresh-pending.png).
