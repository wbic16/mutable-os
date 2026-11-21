# Dialectic Increment 4 — DCP investigation and implementation plan

**7 November 2026 · Revision 2: corrected Symposium argument model. Approved implementation direction; Stages 4A and 4B accepted. Stage 4C implemented; see its qualification for live-account verification status. Stage 4D has not begun.**

Source brief: `/Users/iianneill/.codex/attachments/7f67f593-ba6b-4228-a03f-805da8e6489f/Pasted text.txt`. Increment 3 remains the accepted baseline. This investigation changed documentation only; it did not rerun its qualification.

The user’s argument-model correction supersedes the earlier Gloss-backed proposal. The four separate identities below are now an architectural constraint, not an option awaiting reapproval.

## Recommendation

Implement DCP as a validated interchange boundary around the existing Dialectic controller and canonical operations. A Symposium remains its native Document. Contributions retain arbitrary native Block compositions; DCP exposes a negotiated subset of safe construction capabilities, not a fixed conversational response template. Existing content outside that subset stays intact and is described as unavailable to a particular exchange where necessary.

First qualify structured exchange, references, semantic authoring and retrieval with the deterministic mock. Then connect OpenAI and Anthropic to the same coordinator. Keep provider state, transient streaming and presentation outside canonical content until a complete response passes validation.

The largest new capability is **Document-owned Entities**. Current canonical Entities are Vault-owned SQLite records. A Gloss with an `entity:` prefix is still a Gloss. Neither mechanism already supplies the local Entity ownership required by this brief.

Companion design artefacts:

- [DCP v1 response schema](DCP_V1_RESPONSE_SCHEMA_PROPOSAL.json): closed, provider-neutral logical schema; not a runtime implementation or a promise that providers accept it verbatim.
- [Illustrative exchanges](DCP_V1_EXAMPLES.json): structured composition, local/global Entity references, exact anchoring, retrieval and an argument relationship. All IDs, text and records are fictional examples.

## Existing capabilities and gaps

Paths below are relative to the repository root.

| Requirement | Existing implementation | Increment 4 boundary |
|---|---|---|
| Native conversation, chronology, replies, selected/consumed context | `src/features/dialectic/{model,controller}.ts` | Reuse. Author currently permits `human`/`mock`; add provider attribution without making provider IDs content identities. Existing context capture is text-only, capped at 6,000 characters/512 nodes. |
| Durable same-Document passage references | `dialectic/{anchors,references}.ts`, `src/runtime/text-ranges.ts` | Reuse linked anchors, source ownership and incremental resolution. Add exact selectors, exchange-bound source fences and a typed handle dictionary. |
| Bounded canonical commits | `src/block-tree/{structural-plan,dialectic-range-plan,gloss-plan}.ts` | Current proofs do **not** establish admission for every combined Entity/argument/relation/optional Gloss/anchor/contribution batch. Extend only the necessary cases, including their inverse operations. |
| Canonical text and searchable coordinates | `src/runtime/{canonical-search-source,text-search}.ts` | Reuse Cell/text boundary mapping and cache epochs. Existing search can enumerate a whole Document before limiting results; DCP needs a bounded collector, not merely `limit` on output. |
| Standoff styling and type registration | `src/runtime/{visual-effect-registry,annotation-contributions}.ts`, `src/rendering/standoff-styles.ts` | Registration lacks a unified semantic purpose, attribute schema and AI-authoring policy. Add optional descriptors to actual registrations; absence means not AI-authorable. |
| Independent Gloss annotations | `src/features/gloss/{model,relationships}.ts` | Preserve their general-purpose meaning/intent annotations and existing links. Reuse only for explicit Gloss operations, never as argument storage or argument edges. |
| Symposium arguments and argument relationships | `src/block-tree/linked-annotations.ts`, `dialectic/{anchors,references}.ts` | The generic owned definition carrier and durable passage anchors are reusable. Add narrowly typed argument/edge records and resolver cases; neither the current resolver nor admission proof already recognises them. |
| Entities and Claims | `src/feature-api/{entities,semantics}.ts`, `src/application/entity-service.ts`, `src/knowledge-sqlite/migrations/mutable/{0001-foundation,0002-semantic-knowledge}.sql` | `Entity` has no Document owner field. `Relationship` connects Entity GUIDs; Claim participants/qualifiers connect Claims to Entities. These are not arbitrary passage/argument edges or a Document-local store. |
| Native linked definitions and portability | `src/block-tree/linked-annotations.ts`, `src/interchange/package/{document-context,resources}.ts` | Reuse owner-qualified definitions and packaging. Extend typed inventory/copy handling for new local Entity records; do not let them fall through to global SQL lookups. |
| Native presentation and Sequences | `dialectic/{sequences,sequence-controller,sequence-view}.ts*`, `src/rendering/passive-composition.tsx` | Preserve accepted occurrence isolation and independent presentations. Passive rendering support is not permission for AI to construct every supported Block. AI-authored Sequences can wait. |
| XML parsing | `src/academic/xml.ts`, installed `saxes` | Reuse parser machinery, not an academic text-extraction helper that may normalise/flatten content. A dedicated bounded markup-to-range adapter is necessary. |
| Managed files | `src/runtime/managed-assets.ts`, `src/interchange/managed-asset.ts`, package resources | Reuse staging, hashes, leases and packaged originals. The client original-reader currently supports bounded PNG/JPEG; PDF/provider upload needs a narrow extension. Native JSON alone does not embed binary originals. |
| Live AI and credentials | Existing Node/Express server in `server/index.ts` | No existing OpenAI/Anthropic exchange adapter or established desktop OS-vault bridge was found. Add a local server broker; do not put keys in browser storage or Documents. |

## Protocol, identity and semantics

### Exchange boundary

Every successful assistant contribution uses DCP, even a single paragraph. A request contains protocol/schema versions, a Protocol Key, the negotiated capability legend, cadence, selected context, a source dictionary and budgets. Provider refusals, malformed responses and incomplete generations are operational outcomes, not plain-text contributions bypassing DCP.

The host-selected primary structural reply is preserved in contribution `replies`. Additional passages addressed by the response are stored in `discursiveReferences`; the current wire field `replyTargets` supplies only those additional references.

The coordinator constructs this provider-neutral request; adapters translate it to provider messages/tools. The same Protocol Key accompanies every independent request, including tool continuations and repair attempts. Retrieved content is explicitly data and cannot grant tools, override policy or amend the legend. Provider-native structured output improves shape reliability; host validation remains authoritative.

Proposed cadence values are `terse`, `dialogic` (default), `expansive`. Conversational intent is separate from native layout. Continuation suggestions are bounded optional UI choices, never automatically submitted contributions. No hidden reasoning or chain-of-thought is requested or retained.

### Handles and references

Host-issued opaque handles resolve to typed native identities plus ownership: contribution, Block, linked passage anchor, Symposium argument, independent Gloss, scoped Entity or managed asset. Their underlying native identities remain durable across save/reload and provider switching. Exchange dictionaries also bind source versions and permissions; a guessed GUID is not authority. No identity is inferred from a name or excerpt.

Response IDs are provisional and unique across all declarations and inline IDs. The host allocates canonical IDs and records the mapping only on successful commit. An explicitly addressable inline annotation can acquire a linked passage anchor using the existing anchor mechanism; this does **not** create a conceptual Claim. Use distinct typed handles for anchors, arguments, classifications and Glosses. An inline annotation ID may explicitly request a passage-anchor alias; the annotation property ID and resulting anchor ID remain separate canonical identities. An argument is created only by an explicit `arguments` declaration. Existing copy infrastructure needs typed dependency/remapping support for the new records; it must not infer arguments from Gloss identities.

Copied local definitions receive remapped identities and internal edges; external references remain explicit. Unsupported wrapper interchange continues to be rejected by existing copy guards. Deletion produces unresolved references with historical excerpts, never retargeting by similar text. Structural edits must preserve/rebase native anchor segments or report unresolved. Cross-Document identity is represented by owner-qualified references, but cross-Document retrieval/authoring is not enabled initially.

### Types, annotations, arguments and Entities

Generate the legend from registered capabilities with purpose, allowed attributes, generation policy, validation and presentation information. Cache it by registration revision and send a compact core plus required extensions. Do not maintain a second hand-written DCP ontology. Existing appearance schemas and annotation UI contributions need a small shared descriptor contract to make this possible.

Keep these four native concepts distinct:

| Concept | Responsibility | Proposed representation |
|---|---|---|
| Passage anchor | Identify text as it moves/changes | Existing `dialectic/range-anchor` definition and range segments. |
| Discursive classification | Classify a passage, without creating an argument | Ordinary standoff property: `dialectic/claim`, `dialectic/question`, `dialectic/speculation`, `dialectic/suggestion`, `dialectic/objection`, `dialectic/qualification`. |
| Symposium argument | Independently identify a discursive object | New Symposium-owned `dialectic/argument` definition referencing a durable anchor. |
| Gloss | Independently clarify meaning or authorial intention for any reader | Existing `mutable/gloss` facility and its own semantics, available beyond Dialectic. |

The six classification types are **proposed new native standoff registrations** with shared descriptors, usable by human authoring as well as DCP. They create no argument, Gloss, Entity or SQL Claim implicitly. Multiple classifications may overlap an anchor; an argument may exist without a classification. AI interpretations of human passages retain AI/exchange provenance without changing the human text's authorship.

**Smallest native record design.** Reuse the Symposium Document's `payload.linkedAnnotations` carrier with two versioned, validated definition kinds:

- `dialectic/argument`: host-assigned `id`, `metadata.dialecticArgument = {version: 1, anchor: {resourceId, anchorId}, provenance}`. Its owner is the containing Symposium Document. Initially one anchor per argument; that existing anchor may acquire multiple segments through editing. No `glossType`, copied `expression`, alternate text field or independent composition is stored.
- `dialectic/argument-relation`: host-assigned `id`, `metadata.dialecticArgumentRelation = {version: 1, relation, from: {resourceId, argumentId}, to: {resourceId, argumentId}, provenance}`. Owner and both argument endpoints must belong to this Symposium initially. These are canonical definition records, not text annotations, Gloss links or SQL Claim edges.

These definition-only types are not offered as inline classification types in the AI legend; the inline validator rejects reserved argument/relationship/anchor definition names. The existing linked-property resolver merges definition fields over a property, including its type: therefore **do not set a classification's `annotationId` to an argument definition**. The existing range segment links to its range definition; the argument points to that anchor. Classification properties retain their own type and Cell ranges. Glosses may independently annotate the same passage, without becoming argument endpoints or owning its identity. Cross-references retain their distinct handle kinds wherever an admitted operation accepts them.

The response `arguments` record is just `{id, anchor}`. `read_source(argument)` resolves the owned definition through the existing passage resolver and exports current text and relevant standoff classifications separately, plus historical anchor/consumption excerpts where available. Do not regenerate argument text on each edit or treat an excerpt as another editable source. Store the request/actor provenance on the new records; source-text authorship stays independent.

Argument relations use a small Dialectic-owned descriptor list: `supports`, `challenges`, `qualifies`, `contradicts`, `elaborates`, `answers`, `depends-on`, `provides-evidence-for`. These are proposed capabilities, not claims about registered Gloss/SQL types. `from` performs the relation towards `to` (dependent → prerequisite for `depends-on`). Validate kind, ownership, source fences and admitted type. No synonym coercion, automatic reciprocal edges, graph inference or acyclicity requirement. Existing SQL Claims and Glosses remain separately typed references; neither is silently accepted as a Symposium argument.

**Narrow implementation boundaries.** Extend `DialecticReferences` with typed argument/edge resolution, anchor→argument and argument→edge dependency maps driven by changed definitions. Extend the typed reply/context reference contract in `dialectic/model.ts` for arguments; retain argument identity in stored targets/manifests while resolving its anchor for source navigation. Existing Gloss targets remain unchanged. Reuse the affected-record subscription and passage resolution rather than introducing a general graph service. The current owner-update path compares every linked definition with `JSON.stringify`; carry proven changed-definition IDs for these commits rather than claiming the existing path is already delta-only. Ordinary typing updates affected source/anchor dependencies, not the entire argument inventory.

Copy/export must capture the typed dependency closure and explicitly remap argument IDs, anchor references and included relation endpoints in both existing copy paths. Generic linked-definition copying alone does not rewrite these new nested references. Preserve omitted endpoints as owner-qualified unresolved references; if a destination/copy route cannot preserve the closure, reject before mutation. Do not create Symposium records in an ordinary destination Document by accident. Whole-Document save/reload preserves IDs. Deleting a classification or independent Gloss leaves the argument intact. Deleting source text/anchors leaves its argument identifiable but its passage unresolved; deleting an argument leaves incident relation endpoints unresolved. Retain historical excerpts, expose minimal explicit reattachment through the existing anchor workflow, and never retarget by text similarity. Resolution should distinguish an existing argument from an unavailable passage. These rules need new native record validators, not another text store, editor or general-purpose graph framework.

For local Entities, add a **shared Document-backed Entity service adapter**, using the existing Entity record/validation contract and typed Document-owned linked definitions. Scope-qualified Entity references distinguish `{document, entity}` from `{vault, entity}`. Extend the affected reference resolver, display, copy and package inventory paths; keep existing global service calls backward-compatible. This is one Entity contract with two ownership backends, not a Dialectic-only Entity dictionary. It is new shared work requiring approval. Broad Cardex redesign is unnecessary.

Local Entity relationships also need a scoped adapter: reuse the existing Entity-relationship record/validation semantics, with qualified endpoints and Document-owned typed records. These are distinct from Symposium argument relationships and independent Gloss links. Permit admitted local/local and local/global references without SQL writes; do not imply that existing SQLite relationship insertion can already do this. Document-local readers must resolve these records without making global graph queries scan open Documents. Both adapters belong to shared semantic services; their first UI integration can be scoped reference details rather than a new Cardex presentation.

The AI may reference supplied global Entities and create new local Entities; it cannot update global entities or promote/merge them. It may return a promotion recommendation for review. Promotion execution is deferred: a later user-approved workflow must acknowledge the separate SQLite/Document transactions, record an explicit mapping and retain recoverable local identity. Name equality never authorises merging.

Current standoff style lookup returns no schema for an unregistered type; generic property records can retain its data without installing a renderer. That is not an AI-authoring policy, and a subsequently registered renderer could interpret a raw type name. Unknown semantic declarations should therefore survive as **inert data** with original type/attributes/provenance. Proposed representation: a registered inert carrier, with the requested type preserved in metadata, requiring explicit conversion before activation. Known but non-authorable renderer types are rejected, not downgraded into executable properties. No model-supplied HTML, CSS, event handler or renderer registration is evaluated.

### Markup and selectors

Use only `<annotation type="…" id="…" ref="…">` and, when negotiated, `<boundary id="…"/>`. Nested annotations produce ordinary native standoff ranges; boundary pairs in the `ranges` field express crossing spans without numeric model offsets. `id` and `ref` are optional except where something must be addressed/referenced. Type-specific additional attributes come solely from the registered legend.

- Decode XML escaping; preserve decoded text and whitespace exactly. Do not trim, normalise Unicode or reuse an extractor that changes line endings. Raw-text handling must preserve CR/LF distinctions that a standard XML parser otherwise normalises; qualify this explicitly.
- Reject DTDs, external entities, processing instructions, unsupported elements, unsupported attributes on known types, duplicate IDs, malformed markup, invalid Unicode, empty annotation ranges and reversed/missing boundaries. Unknown-type attributes remain bounded inert scalar data. An empty paragraph is permitted.
- Measure output using the native Cell construction/boundary mapper. UTF-16 units, Unicode scalars and graphemes are not interchangeable. Reject selectors that split a Cell; do not round coordinates.
- `anchor(source, revision, exact, prefix, suffix)` searches only the authorised source Block. Require one exact occurrence with adjacent disambiguating context. Never trim, fuzzy-match or search another Block. Missing, ambiguous or stale sources produce explicit validation outcomes. Initial selectors do not cross Blocks/inline objects.
- Bind source fences to mounted session generation/cache epoch and captured content, not a numeric revision alone: Undo/reload must not revive stale authority. Recheck only referenced dependencies immediately before commit.

## Commit, retrieval and provenance

The flow is **capture → provider/mock and bounded tools → validate → prepare assets/operations → recheck dependencies → one canonical commit**. Streaming stays transient, escaped and cancellable. It never feeds partial markup into the native editor or appends provisional Blocks.

Prepare IDs, anchor definitions, standoff properties, local Entities, Symposium argument definitions and argument relationships, separately requested Gloss operations, contribution and provenance together. Extend the existing structural admission proof with the necessary typed definition/payload cases; do not bypass validation with a caller flag. Test admission and Undo/Redo inverses. If the bounded proof cannot establish safety, this DCP operation fails explicitly before mutation rather than silently taking a repository snapshot. Existing unrelated command fallbacks remain intact.

The linked-definition registry is currently a Document payload, not independently stored rows. Updating it can copy/diff that Document's definition map; do not claim constant-time Entity insertion from this storage choice. Carry changed definition IDs through preparation/index updates, avoid serialising all definitions, and measure registry-size sensitivity as well as unrelated-Document isolation. If acceptable admission requires broader storage or semantic-service redesign, report that dependency before expanding the slice.

Cancelled, stale, malformed or failed attempts create no authored anchors/definitions/contributions. Failed diagnostics remain inspectable session data; successful exchanges can retain their preceding repair attempts. Assets stage before content commit and are released/cleaned on failure; filesystem/provider effects are not falsely described as part of a distributed atomic transaction. Manual Save and per-Document dirty state remain unchanged.

Expose only `search_symposium(query, limit)` and `read_source(handle)` initially. Authorise committed owned content of this Symposium, excluding drafts, other Documents and arbitrary Vault traversal. Use deterministic ordering and explicit scan, byte, result, call-count and deadline budgets; cancellation must interrupt enumeration, not just final rendering. A Document-scoped search may do bounded on-demand scanning, but ordinary typing must not run it. Reuse canonical text caches and the existing incremental resolver; do not invent a vector index.

Tool results distinguish `complete`, `truncated`, `missing`, `ambiguous`, `unavailable`, `unauthorized`; include revisions, omissions and continuation/window handles where appropriate. Source export includes supported composition/annotations and explicit unsupported placeholders, not silently flattened text. No arbitrary SQL, file paths, shell tools or provider web search are granted.

Keep separate: reply targets; user-selected context; authorised retrieval scope; and the material actually supplied. A successful contribution's exchange record captures ordered provider requests/tool results, exact included content snapshots, source versions, exclusions/truncation, asset references, protocol/key/legend versions, provider/model/parameters, timestamps, usage and reported/estimated/unknown cost. It is evidence of supplied material, **not model attention**. Avoid double-storing large identical context bodies; reference content-addressed captured records. No whole-conversation capture is needed per turn.

## Providers, credentials and multimodal boundary

Use server-side OpenAI Responses and Anthropic Messages adapters behind the same coordinator. Both currently document JSON-schema structured output and client-side tool execution; their envelope/schema constraints differ. Compile the logical schema into the selected provider's supported subset and validate again locally. A model-list response alone does not establish tool/structured-output/media support.

Start with a **local Node broker**, server-environment or session-memory credentials, and explicit local-session/Origin/host protections. A remotely hosted deployment needs authenticated per-user secret storage and authorisation; existing general API routes do not prove that boundary. Defer an OS credential-vault adapter until an actual packaged-desktop integration exists. Keys never enter DCP, native Documents, logs or browser localStorage. Provider/model configuration remains separate from authored composition; provenance records the configuration actually used.

Use bounded output/tool/deadline budgets, at most one proposed validation-repair attempt, request-generation cancellation and commit idempotency. Surface timeout, rate limit, refusal, partial output and uncertain cost. Do not promise a hard currency cap from incomplete usage data or retry invisibly. Changing providers cannot require provider-hosted conversation history.

For images/PDFs, retain managed original assets locally, send only explicitly included bytes, and record unsupported or omitted inputs. Provider upload IDs are cache references. Generated/downloaded assets require host MIME/size/hash validation and durable local staging before a canonical reference can be committed; temporary provider URLs are never the only copy. Reuse the native package exporter to include originals: saving JSON alone cannot guarantee binary portability. Audio/video and AI-authored Sequences can remain deferred with explicit capability feedback.

The semantic registrations and materialisation validators should also be usable by human authoring and future SMT; they must not be AI-only definitions. Literal inline transformation and synthetic marker presentation remain SMT work. No SMT service, content system or scripting language is introduced here.

## Approved direction

1. **Local Entity ownership:** approve the shared scoped Entity/Entity-relationship adapters and typed Document linked-definition carriers, including reference/copy/package integration. This is the principal shared-model addition.
2. **Remaining semantic policy:** review inert unknown-type storage and the proposed bounded argument-relation vocabulary. The user has already settled `dialectic/*` passage classifications, separate Symposium-owned argument/relationship records and independent Gloss semantics.
3. **Broker deployment:** use a local broker with environment/session credentials first; defer remotely hosted credential management and OS-vault integration.
4. **Delivery order and initial capability profile:** qualify semantics/retrieval with the mock before live providers; initially admit paragraphs, generic groups, lists and tables, plus reference/annotation capabilities. Additional native construction adapters are negotiated extensions, not changes to what contributions can contain.

No additional question is necessary to complete this investigation. Revision 2 and these architectural directions were subsequently approved; implementation was subsequently authorised through Stage 4B. See [Stage 4A qualification](DIALECTIC_STAGE_4A_QUALIFICATION.md) and [Stage 4B qualification](DIALECTIC_STAGE_4B_QUALIFICATION.md).

Stage 4C incorporates the subsequently approved general-purpose communication clarification: ordinary replies need no semantic classification, argument or Gloss. See [Stage 4C qualification](DIALECTIC_STAGE_4C_QUALIFICATION.md).

## Bounded implementation and qualification

Planning ranges below are engineering effort estimates, not elapsed agent-run promises. The local Entity integration is the largest uncertainty. Each stage includes focused tests and a short report; no new test framework or broad editor audit.

| Stage | Smallest deliverable | Focused exit evidence | Estimate |
|---|---|---|---|
| **4A — DCP foundation** | Mock speaks DCP; registered legend/key; safe composition/markup parser; handles; exact anchors; bounded retrieval; coordinator and transient preview | Paragraph/nested composition; nested/crossing annotations and Unicode; malformed/unknown handling; exact/ambiguous/stale anchors; retrieval limits; atomic failure/cancel; no typing-triggered search | 4–6 days, medium |
| **4B — Scoped semantics** | Shared local Entity and Entity-relationship adapters; global read-only references; Symposium argument/relationship definitions and incremental resolution; independent explicit Gloss operations; full combined admission proof; captured context/provenance | Local creation/edges/global reference; earlier argument reference; classification/argument/Gloss independence; copy/deletion/Undo/Redo; no Gloss/SQL writes for argument creation; save/reload and current source vs historical excerpt | 6–9 days, higher |
| **4C — Live adapters** | OpenAI and Anthropic; local broker/settings; cadence; streaming/cancel/repair/error/usage | Same fixtures through both adapters; real trusted-browser flow with configured credentials; provider switch from native history; no partial canonical content, secrets or duplicate commits | 4–7 days, medium/higher |
| **4D — Multimodal** | Bounded image/PDF inputs and supported returned assets, durable originals and package portability | Provider capability rejection; upload/download failure cleanup; offline/package reload; no dependence on provider URLs. Further media and authored Sequences remain separate scoped extensions | 3–6 days, medium |

This deliberately moves the brief's semantic/retrieval work ahead of live integration. Total planning range: **17–28 engineering days**, subject to the scoped Entity decision and provider availability; do not infer that every deferred media capability is included. The revised 4B allowance covers new argument/edge validators, dependency resolution and copy remapping; it does not introduce another implementation stage.

Shared-code impact is limited to: registration descriptors; typed argument/relationship validation, definition-change notifications and copy/export adapters; scoped Entity resolution/storage and its affected reference UI/export/copy paths; the combined canonical admission proof; bounded source collection; managed-asset reading where needed; and server credential/exchange routes. Existing application owners, editor mounts, native input/IME/selection, Gloss tooling, passive occurrences and `ApplicationPresentations` remain the integration boundary. Use dedicated Desktop/Textual controls, not application-specific workspace branches. Put the new DCP capability behind a default-enabled feature flag with the accepted mock baseline available when disabled.

Focused performance checks count repository snapshots, unrelated projection changes, resolver visits, source reads and network calls. Measure 4A/4B commit latency against affected payload size with unrelated Documents present; typing must incur no retrieval or conversation scans. Targeted new assertions cover classification-only authoring (no argument/Gloss), argument creation without a Gloss or duplicated text, an independent Gloss overlapping an argument, wrong-kind/foreign relation endpoints, source deletion without argument identity loss, both copy paths and no argument inventory rebuild during typing. Browser qualification covers selection→request, streaming/cancel while editing, source navigation, Undo/Redo, save/reload, disposal and Desktop/Textual return using retained editor identity. Reuse accepted editor/Sequence coverage rather than rerunning it all. No performance measurements or live-provider results are claimed by this read-only investigation.

## Provider documentation checked

- OpenAI [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [function calling](https://developers.openai.com/api/docs/guides/function-calling), [authentication](https://developers.openai.com/api/reference/overview), [file inputs](https://developers.openai.com/api/docs/guides/file-inputs).
- Anthropic [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works), [PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support).

These establish adapter feasibility, not model-specific capability guarantees. Validate configured models at implementation time; provider schema constraints do not replace Mutable's ownership, reference or canonical admission checks.
