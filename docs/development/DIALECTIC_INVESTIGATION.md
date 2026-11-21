# Dialectic — investigation and implementation proposal

6 November 2026. **Investigation only; implementation awaits review.**

Reviewed the supplied investigative brief and all four images. Image 04 supplies the functional regions; the others demonstrate temporal excursions, comparisons and authored sequences. Their cards, counts and styling are illustrative, not a restricted response grammar.

**Confirmed decisions:** start with a deterministic mock assistant. Committed contributions remain editable in place, with their chronological position fixed. All app presentations must use the existing application presentation registration mechanism.

## 1. Architecture inventory

Paths below are relative to the repository root. “Reuse” means a concrete existing mechanism, not that the complete Dialectic integration has been qualified in a browser.

| Area | Existing implementation | Reuse and gap |
|---|---|---|
| Application registration | `src/application/desktop-applications.tsx`, `src/application/features.ts` | Dialectic currently has a launcher catalogue entry without a launch command. Supply a feature, app owner and `dialectic.open`; replace that placeholder. |
| Workspace presentations | `src/feature-api/application-presentation.ts`, `src/runtime/application-presentations.ts`, `src/application/application-presentations.tsx` | Reuse the per-editor `ApplicationPresentations` registry. Independent contributions, disposal, missing applications, default selection, unsupported/blocked resolution and ordinary mountable views already exist. |
| Document application/session hosting | `src/feature-api/document-application.ts`, `src/application/document-application-capabilities.tsx`, `src/application/document-presentation-registration.tsx`, `src/application/document-sessions.ts`, `src/application/document-host-presentations.ts` | Application registration accepts an application ID and dedicated view. Reuse native Document ownership, Save, retained editor sessions and presentation guards. A focused contribution view/composer needs a narrow Dialectic adapter; the existing composite Document port is not already a conversation controller. |
| Rich compositions | `src/rendering/register-core-views.ts`, `src/rendering/core-block-views.tsx`, `src/interchange/fragment.ts`, `src/interchange/materialize.ts` | Native text, containers, tables/grids, tabs, surfaces, images and other registered Blocks are reusable. No dedicated carousel implementation was found in the inspected production rendering/application/features paths. Start with native comparisons/tabs; a carousel would be a later presentation capability. |
| Range identity and decoration | `src/runtime/text-ranges.ts`, `src/interchange/ranges.ts`, `src/block-tree/linked-annotations.ts`, `src/block-tree/external-reference.ts`, `src/runtime/measurements.ts`, `src/runtime/session-decorations.ts` | Reuse selection capture/validation, standoff rebasing, durable Block/definition identities and temporary SVG decorations. Selection snapshots are revision-sensitive runtime objects, not durable anchors. Fully deleted ranges can lose their properties: orphan retention needs explicit domain records. |
| Glosses and instruments | `src/features/gloss/controller.ts`, `model.ts`, `session-index.ts`, `relationships.ts`, `relationship-index.ts`; `src/features/autocomplete/index.tsx`; `src/rendering/instrument-presentations.ts` | Reuse actual Gloss authoring, local definitions, occurrences and graph services. Scry/LER/Gloss supply instrument view overrides; these are distinct from whole-app `ApplicationPresentations`. Gloss relationships are local Gloss-to-Gloss edges, not a universal reply relation store. |
| Focus/navigation/windows | `src/application/window-lifecycle.ts`, `document-application-navigation.ts`, `document-host-presentations.ts`; `src/runtime/focus.ts`, `selections.ts` | Reuse window guards, document selection, focus and retained position restoration. No reusable three-cursor conversation navigation controller was identified. Add small app-local state; do not confuse autocomplete usage history or canonical Undo history with navigation history. |
| Canonical edits and persistence | `src/block-tree/commands.ts`, `repository.ts`; `src/persistence/native-resource.ts`, `native-session.ts`; `src/history/` | Reuse structural transactions, canonical history, native JSON and manual Save. The ordinary transaction path takes a repository snapshot; the local structural path uses a bounded draft. Native capture follows owned content and preserves nested Documents as external references, so separate Documents per contribution would complicate saving. |
| SQLite | `src/knowledge-sqlite/migrations/mutable/0001-foundation.sql` and subsequent migrations | Existing `Relationship` endpoints are Entity GUIDs, not arbitrary Blocks/ranges. Resource/Block indexes derive from saved files. No new canonical SQLite conversation store is needed for the proposed first slice. |
| AI/service boundary | `src/runtime/application-services.ts`, `src/application-services/contracts.ts`, `server/application-services/` | Existing service transport supports cancellation and stale-Cavern checks. No production AI provider/streaming adapter was found in the inspected source, server or package dependencies. A mock adapter and later live-provider protocol are new work. |
| Graphs | `src/features/gloss/graph-view.tsx`, `graph-frame.ts`, `mermaid.ts`; `src/features/flint/graph/document-graph-layout.ts`; `package.json` | Mermaid and X6 are installed; Gloss already limits graph scope and protects diagram frames. These are not chronological layout engines. Prefer a small deterministic SVG temporal projection; no new graph dependency is presently justified. |
| Copy/export | `src/block-tree/clipboard.ts`, `src/interchange/serializer.ts`, `materialize.ts`, `src/persistence/native-resource.ts` | Native persistence preserves authored metadata. Clipboard remapping handles known references and Gloss identities, not arbitrary new metadata IDs. Dialectic requires explicit remapping rules and native round-trip coverage. Portable Markdown/HTML cannot be assumed to preserve executable sequence semantics. |

## 2. Recommended minimal model

Use **one ordinary native Document per conversation**, with a versioned `metadata.dialectic` envelope. Its existing resource GUID identifies the conversation. Use ordinary owned container Blocks for contributions; their authored Block GUIDs identify contributions. Their children remain unrestricted ordinary Mutable content. No `response-block`, new text editor, or parallel persistence system.

Proposed metadata, not existing API:

```ts
Conversation = { version: 1, participants: Participant[], sequences: Sequence[] }
Contribution = {
  version: 1, state: 'draft' | 'committed', ordinal?: number,
  authorId: string, createdUtc?: string,
  replies: Array<{ id: string, targets: Target[] }>,
  generation?: { adapter: string, requestId: string }
}
Target =
  | { kind: 'contribution', resourceId: string, blockId: string }
  | { kind: 'block', resourceId: string, blockId: string }
  | { kind: 'range', resourceId: string, occurrenceId: string,
      segments: Array<{ blockId: string, propertyId: string }>, excerpt: string }
Sequence = { id: string, title: string, steps: Step[] }
Step = { id: string, action: string, targets: Target[], next?: string[] }
```

Participants use stable local IDs and descriptive human/mock provenance; an optional existing Actor/Entity reference can be added without inventing database records. Future target variants can address Gloss definitions, Documents and Entities. Unresolved gestures remain explicit pending targets, not guessed links.

**Chronology:** assign an ordinal when submitting a contribution, independently of its reply targets. Editing does not change that ordinal or creation timestamp. Inspection, comparison and sequences never reorder source children. Append submitted contributions at the frontier even when replying to an early contribution. Maintain an app-local maximum/index from contribution membership changes, not a root event array rewritten during every keystroke. An ordinal is an ordering value, not an identity. Canonical Undo/Redo remains available; this is not a tamper-proof append-only audit ledger.

**Drafts:** native draft Blocks can be edited and saved normally. Submission marks the same draft contribution committed and creates the next draft through one admitted structural operation; do not clone or move its existing content into a second editor. Generated output remains a non-authoring preview until validated and committed. Retrying a request must not submit twice.

**References:** store reply records with the new contribution, independently of source annotations. A range target uses durable standoff property IDs, resource/Block GUIDs and an explicit occurrence identity. Multiple independent selections of the same source are separate occurrences, not implicitly joined segments. Runtime Cell keys/node keys and raw offsets alone are not durable addresses. A newly authored range-anchor property needs a small registered schema and the existing rebase machinery.

Retain reference records and captured excerpts if source ranges/Blocks disappear. Resolve states such as available, deleted/missing, ambiguous and unavailable without guessing; permit explicit reattachment. Undo can restore the original target. Cross-Document targeting must not silently modify/save a foreign Document; initially support precise anchors within the conversation, and use explicit provenance/unresolved status for deferred external cases. This bounds the first range implementation without declaring cross-Document references impossible.

**Glosses:** use the conversation Document's existing Gloss definitions/occurrences. A Gloss interprets text; a reply is a chronological contribution. Neither substitutes for the other, and both can attach to the same passage.

**Sequences:** persist declarative, independently identified steps. Validate action vocabulary, targets and branch destinations. `show`, `focus`, `compare`, `reveal`, `annotate`, `navigate`, `branch` and `return` are presentation intentions, not arbitrary JavaScript. `annotate` displays existing annotations or temporary emphasis; playback must not silently author properties. Users can pause/leave and read all source content freely. Sequence cursor changes are session state, not canonical edits.

Native save/reload retains identities. Copying allocates fresh contribution/sequence/step/anchor IDs, rewrites targets inside the copied closure, and retains explicit provenance for outside targets. No SQL migration is proposed. Add version-aware validation and copy adaptation before exposing these new records to general copy workflows.

## 3. UI and presentation proposal

Register a typed Dialectic application adapter and actual default Desktop view. Contribute a separate Textual view through `ApplicationPresentations`, independently disposable and without workspace branches in the core app. Keep ownership/controllers/state below both views. Reuse the existing retained editor lease where appropriate; reconstructible inspectors and diagrams need no DOM lease. Canvas/Spatial remain unsupported until explicitly supplied.

| Wireframe region | Proposed behaviour |
|---|---|
| 1. Projection navigation | Focused conversation, chronological Document, sequence and temporal map; views of the same records. |
| 2. Sidebar | Collapsible contributions, participants, sequences, Glosses and unresolved items. Thread lists derive from reply relations. |
| 3. Contribution header | Author, time/ordinal and provenance; editing does not relabel an old contribution as newly created. |
| 4. Sequence controls | Present only while following a sequence; previous/next, branch choice, pause/exit. |
| 5. Composition canvas | Primary space for native Blocks, comparisons and authored media. Preserve source ownership; inspection excerpts are references/previews. |
| 6. Synthesis/transition | Optional authored content wherever the author places it; no mandatory summary panel. |
| 7. Composer | Native rich draft, explicit reply target(s), submit/cancel-generation state. Inspection never silently changes the reply target. |
| 8. Context inspector | Incoming/outgoing replies, source range, Glosses and provenance, with navigation back to sources. |
| 9. Temporal navigator | Collapsible ordered spine; show inspection position and frontier separately, with Return to present. |

Keep **frontier**, **inspection cursor**, **sequence cursor**, explicit composer target and ordinary Back/Forward history separate. Returning to present must not erase a draft, silently retarget it, or lose a useful inspection return location. Scope keyboard dispatch to the active editor/app using existing commands; this investigation proposes no new global shortcuts.

Desktop can use collapsible side panels and a compact lower navigator. Narrow layouts show one secondary panel at a time. Textual uses its measured grid, dedicated menus/status/inspectors and a compact ordered navigation list where a graphic is impractical. Native editing, selection and IME remain shared. Do not mount a second editable copy just to display a comparison.

For a later temporal map, ordinal determines the monotonic primary axis and references form secondary excursion lanes. Window/limit visible nodes, retain stable positions and update only changed relations. Do not run force layout or Mermaid rendering on every text edit. Reuse parent-relative temporary SVG range decorations and valid shared geometry for source highlighting; scrolling alone must not redraw them.

## 4. Mock/AI integration contract

Start with a deterministic mock that accepts the same bounded request/response interface intended for a later provider. It should return native text plus one representative rich composition, rather than a canned string-only chat response.

Request: request/conversation IDs, explicit target descriptors, verified target revisions, current draft, and a bounded context manifest. Assemble selected target and owning contribution first, then relevant ancestors, nearby Blocks, pertinent Glosses, explicitly selected branches and sources within a configured budget. Expose omissions. Do not serialize the entire workspace or send context while typing.

Preserve provenance categories: authored assertions, explicit accepted-fact status if present, uncertain interpretation, source quotation and generated proposal. Merely appearing in a contribution or Gloss does not make content an accepted fact. Referenced text is context, never permission for tool execution.

Response: a native fragment using request-local IDs, optional declarative sequence, explicit source references and provenance. Validate fragment structure, supported Block capabilities, ownership, resource references, size/depth, sequence actions and every local ID before canonical insertion. Host allocation maps local IDs to canonical GUIDs atomically. Missing targets become explicit diagnostics/unresolved references rather than fabricated links.

Streaming, when a real adapter is added, updates an ephemeral preview. Cancellation, window closure, conversation changes or stale target revisions invalidate the result. No incomplete references enter canonical state; successful completion yields one canonical authoring operation. A narrow capability policy is still needed for generated executable/embedded content—“native fragment” is not permission to create arbitrary active application Blocks.

Live-provider selection, credentials, disclosure of transmitted context and network streaming are deferred, consistent with the user's mock-first choice. Existing HTTP service cancellation is reusable; an AI provider adapter is not already implemented.

## 5. Risks, shared impact and qualification limits

| Priority | Risk / decision | Proposed handling |
|---|---|---|
| High | Retained Document port versus independently focused contribution/composer | Qualify a minimal native Document host first. Add only a typed active-session/target adapter if the existing port proves insufficient; do not extract/rewrite Flint's controller. |
| High | Range deletion, cross-Document persistence and copying | Separate durable reply records from anchor properties; explicit orphan states; same-Document anchors first; remap known Dialectic metadata. |
| High | Canonical operation can still be expensive | Use `structuralTransaction()` for eligible operations and retain established fallback when required. Instrument actual admission/commit; avoid generic snapshots and ancestor/tree scans during typing. Root child-list work on submit may still depend on that conversation's size and must be reported. |
| Medium | Generated fragment correctness and active content | Mock first; bounded validation/ID allocation, cancellation and explicit capability policy before live integration. |
| Medium | Large maps and retained editors | Bounded map projection, source-specific subscriptions, small visible preview sets; no speculative virtualization of native selections. |
| Medium | Free Document editing can remove contribution containers | Preserve unresolved references and show diagnostics; do not silently infer a replacement contribution. |

Shared-Code Impact Register for proposed implementation:

| Existing boundary | Necessary change / alternative | Focused regression |
|---|---|---|
| Feature/bootstrap and Desktop catalogue | Wire default-enabled `dialectic` flag and real launch command; existing placeholder alone cannot launch the app. | Flag off, launch/close/dispose, existing launchers unchanged. |
| Application presentations | Register new application and independent Desktop/Textual contributions; no registry redesign expected. | Missing/disposed view, temporary transition barrier, Desktop/Textual round-trip. |
| Document application port, only if required | Small presentation-neutral session capability; alternative is restricted whole-Document first slice. | Editor/Cell identity, selection/IME, Save binding and owner disposal. |
| Standoff registration and clipboard materialization | Recognize range anchor schema and remap declared Dialectic identities. Opaque metadata alone cannot safely support copy. | Existing Gloss/reference copy unchanged; outside-copy diagnostics. |

Most implementation belongs in new Dialectic feature/controller/view modules with scoped CSS. Reuse commands, renderer and session APIs without changing graphical Flint. No new runtime, window manager or general geometry framework is proposed.

**Evidence limit:** this is source and asset qualification. No Dialectic code, database changes, browser tests or performance measurements have been produced. Proposed timings and lifecycle behaviour are acceptance criteria, not measured results. The two questions raised during investigation are resolved above; provider choice is not a first-slice blocker.

## 6. Smallest practical implementation plan

Relative effort reflects integration risk, not a calendar commitment. Each increment ends in a usable demonstration and a short qualification note.

1. **Working conversation — medium.** Default-enabled feature, real app/window, Desktop and basic Textual registrations, one native conversation Document, rich editable draft/contributions, fixed submission chronology, contribution/Block reply targets, inspection Back/Forward and Return to present. Mock assistant returns a validated native fragment. Manual Save/reload and canonical Undo/Redo work. Demonstrate replying to contribution 1 after contribution 3: the reply becomes 4 and source IDs remain unchanged.
2. **Precise references and interpretation — medium/high.** Range anchors, independent occurrences, orphan handling, Gloss/Scry integration and context inspector; native comparison compositions. Explicit copy identity handling. Demonstrate source edits, full deletion, Undo restoration and two separate references to the same passage.
3. **Authored sequences — medium.** Persisted steps with stable IDs, show/focus/compare/reveal/navigation, explicit branches and return; free-reading escape. Qualify save/reload, reordered steps and missing targets. Add further presentation actions only through the validated declarative vocabulary.
4. **Temporal exploration and polish — medium.** Monotonic map, bounded excursions, multi-target authoring, responsive/Textual refinements and remaining representative media. Consider carousel presentation here. A live provider is a separately approved extension after selecting its service and context policy.

Focused checks: model ordering/target validation and identity remapping; one trusted browser path covering typing, selection, IME boundary, submit, early reply, edit, Undo/Redo, Save/reload, source navigation and Desktop/Textual/Desktop continuity. Add range/sequence checks only as introduced. Verify no extra snapshots, unrelated Document updates, request traffic or map/index rebuilds during ordinary typing. Measure real input-to-visible usable contribution and explicit submission separately from background mock completion, using small and larger conversations plus unrelated open Documents.

Reuse existing Block/Gloss/session regression coverage; do not requalify every Block family or run a broad test campaign. The first approval requested is for increment 1 above, followed by its concrete qualification—not the entire feature at once.
