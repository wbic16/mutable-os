# Dialectic — Increment 1 qualification

7 November 2026. **Increment 1 delivered; Increment 2 has not started.**

## Delivered behaviour

- Desktop launcher opens a functional Dialectic application. The `dialectic` feature flag defaults to `true`; disabling it removes the application command. Existing presentation-registry fallback remains usable.
- Each conversation is an ordinary native Document. Contribution metadata records authorship, submission order, time, reply targets and mock provenance on an ordinary container. Its children form the composition and may contain arbitrary nested registered Blocks. There is no fixed response-Block grammar or second editor.
- Submit commits the existing draft container and creates a new draft in one canonical structural transaction. Existing text/Block identities and editor mounts survive. Contributions remain editable without changing their chronological ordinal. Empty plain-text drafts and replies to uncommitted contributions are rejected.
- Users can inspect earlier contributions, navigate Back/Forward, reply to a contribution or the Block containing the caret, and return to the chronological present. Replies append at the frontier, independently of the target's age.
- Explicit context selections are separate from inspection and reply targeting. Returning to present preserves selected context. Switching conversations preserves each conversation's choices for the life of the application; these choices are session state, not authored Document changes.
- The deterministic mock captures the explicit target plus selected context, then asynchronously inserts a native composition containing text and a two-column table. Cancellation, changed context, missing targets and disposed/switched conversations prevent stale submission. It uses no AI provider or network request. Context is limited to 12 additional items, 512 traversed Blocks and 6,000 text characters.
- New/Open, Vault selection, manual Save/Save as, Cmd/Ctrl+S, dirty indicators and Undo/Redo use existing Document services. No background saves, migrations or Markdown sidecars were added.

## Presentation and architectural boundaries

Desktop and Textual participate in actual `ApplicationPresentations` resolution as `dialectic.desktop.editor` and `dialectic.textual.editor`. The Textual contribution is separately registered; both views share the same application controller and retained Document session. The existing owner retains disposal and Save authority. A session-identity memo prevents a presentation lease from retriggering itself when its host binding changes.

Desktop is the principal presentation. Textual provides functional navigation, editing, context selection, submission, mock responses and saving, using its existing measured font infrastructure. Extensive Textual menus, responsive visual polish and rich-layout qualification remain deferred as requested. The retained editor moves between hosts; its children are not reconstructed.

Contribution headers are presentation attributes on existing container mounts. They do not replace editable DOM or alter authored styling. No custom caret, geometry engine, editor mutation pipeline or window manager was introduced.

The approved Sequence clarification remains the direction for Increment 3: reference ordinary compositions and independently addressable Blocks across contributions, with optional declarative choreography. Increment 1 introduces **no separate Sequence content system or presentation-action language**.

## Changed modules / shared-code impact register

Paths are relative to the repository root. This includes the initial implementation checkpoint and subsequent qualification fixes.

| Modules | Purpose and shared impact |
|---|---|
| `src/features/dialectic/{model.ts,controller.ts,index.tsx,view.tsx,view.css}` | New native metadata/DTO helpers, session controller, application and presentation contributions, scoped chrome and layout. No graphical Flint layout changes. |
| `src/configuration.ts`, `src/application/features.ts`, `src/application/desktop-applications.tsx` | Default-enabled flag, feature activation and real launcher command. |
| `src/feature-api/document-application.ts`, `src/application/document-application-capabilities.tsx` | Optional `launch: false` allows another Document application to supply its own launch/content-creation command. Otherwise the existing host always registers `flint.open`. The default Flint path is unchanged; no controller extraction was needed. |
| `src/features/textual/flint.tsx` | Export the existing `TextualSavePrompt` for reuse; its implementation and Flint presentation are unchanged. |
| `src/features/dialectic/dialectic.test.tsx`, `scripts/check-dialectic-browser.mjs` | Focused integration/bounded-work coverage and isolated Chrome browser qualification. |

## Tests and browser evidence

| Check | Result |
|---|---|
| Dialectic integration tests | **7 passed**: registration/flag/fallback, native identity and history, separate chronology/context, mock lifecycle, per-conversation state, empty/self-reply guards, unrelated annotated Document isolation. |
| Existing presentation registry and Textual host tests | **7 passed**. Together with Dialectic: **14 passing focused tests**. |
| Reactive TypeScript check | Passed. |
| Existing Flint lifecycle suite | 23 passed; one close-window test fails its immediate projection-disposal assertion. Reproduced with Dialectic disabled; treated as a baseline failure, not changed in this increment. |
| Trusted Chrome interaction | Passed: text entry, Submit, Undo/Redo, mock table output, replying to contribution 1 after later content, context retention, Cmd+S, selection retention, Textual text/composition input and Undo, return to Desktop. |
| Native persistence | Save request used `conversation.ink` and native Mutable JSON. Encoding/decoding preserved contribution IDs. A fresh browser page admitted the saved bytes and reopened all three contributions with text and reply identity intact. Transport was isolated in memory; no user vault was changed. |
| Presentation lifecycle | Same retained session and editor mount restored to its Desktop parent; context retained; **0 new editor views, 0 repository snapshots, 0 projection rebuilds** during the measured round-trip, including Textual typing. |

Browser evidence: [JSON results](DIALECTIC_INCREMENT_1_BROWSER.json), [Desktop screenshot](DIALECTIC_INCREMENT_1_DESKTOP.png), [Textual screenshot](DIALECTIC_INCREMENT_1_TEXTUAL.png).

The final Chrome run observed approximately **43.6 ms** for a text insertion and **66.4 ms** for Submit through the automation harness. These measure command-to-observed-DOM completion, include CDP overhead, and are **not pixel-paint latency or production percentile benchmarks**. Both paths recorded zero repository snapshots and zero full projection rebuilds. The mock commit also recorded zero snapshots in the integration test.

The unrelated-content regression adds a separate 10,800-character annotated Document: ordinary typing does not republish contribution rows, and submission neither snapshots the repository nor changes the unrelated text record. Submission still updates its conversation's child list; no constant-time claim is made for arbitrarily large conversations. Context resolution traverses the current conversation's Block tree on explicit invocation, excluding inline Cell traversal until selected content is captured; it is not a typing subscription.

## Limitations and next step

- Range-specific reply anchors, cross-Document reply resolution, explicit orphan repair, incoming-reply exploration, authored Sequences and temporal maps remain subsequent increments. Current targets are contribution/Block GUIDs within the conversation. Missing references remain visible as references and are rejected as active mock context.
- Native text, formatting and Block commands remain available through the reused editor. Dedicated Dialectic menus do not yet reproduce Flint's full application chrome. Textual New/Open/Vault controls and visual refinement remain Desktop-first work.
- General copying/remapping of complete conversation metadata is not qualified; arbitrary edits to contribution wrappers can invalidate chronology. Submission detects duplicate/invalid ordinals rather than silently repairing them. Ordinary composition editing uses native Block semantics.
- Context/navigation selections persist across presentation and Document switches within the application, not across closing/reopening the application. Authored reply and mock-context provenance persist in the Document.
- Chrome composition input and Undo passed after ordinary text was present. A direct CDP composition probe into an entirely empty, programmatically focused editor did not commit; its cause is unresolved. This is not claimed as full operating-system IME qualification, and the shared editor was not modified to mask it.
- No live AI adapter is included. The mock exercises host-owned native composition and canonical validation; provider output validation and credentials remain future work.

Recommended next step, after review: Increment 2's precise same-Document range targeting, Gloss/context integration and explicit reference-copy/orphan semantics. Preserve the current contribution/composition distinction and presentation isolation. **No Increment 2 implementation has been undertaken.**
