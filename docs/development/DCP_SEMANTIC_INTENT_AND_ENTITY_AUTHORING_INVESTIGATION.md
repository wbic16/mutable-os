# Entity-first and semantic-intent authoring in Dialectic

11 November 2026. **Historical investigation and approved architecture.** The findings below describe the pre-implementation system. The approved §13.11 sequence has now been implemented; see [Symposium Semantic Workspace qualification](DCP_SEMANTIC_WORKSPACE_QUALIFICATION.md) for the resulting behaviour, evidence and remaining limitations.

## 1. Executive finding

Semantic underuse is real, but it is not primarily a serialization or native-materialisation problem. In the actual authenticity Symposium, GPT-5.4 received the editorial policy, an unrestricted qualified vocabulary and Entity-capable strict schema. It authored fluent discussion and typography while leaving nearly all semantic operations empty. Those omissions are present in the retained provider contributions, not introduced by admission.

Three concrete implementation facts help explain the result:

1. **Entity creation is available; Entity resolution is not a first-class DCP workflow.** There is no name/alias lookup tool. Existing Entities become addressable mainly through source mentions or host-selected semantic targets. Creating an Entity always assigns a new UUID; it neither resolves nor deduplicates names.
2. **The guidance is asymmetric.** Typography has explicit ordinary-writing guidance and initial examples. Entity guidance largely describes ownership and valid references. The editorial policy discusses relationships between Entities but has no comparable recognition → resolution → reuse/create → mention instruction. No initial example demonstrates an Entity. The exact contribution schema is available, but that does not supply an editorial workflow.
3. **Targeting is more mechanical than necessary.** Generated Glosses and Arguments need passage aliases created by annotations/ranges, not composition Block IDs. There is no unstyled, generated passage-anchor declaration. Existing-source operations are easier than they first appear: exact quotation, unique matching and native Cell-range construction already exist; the model does not supply character offsets or native GUIDs.

**Recommendation:** adopt semantic generosity, prioritise Entity recognition and reuse, expose bounded Entity discovery through existing native services, and add declarative targets to the existing semantic authoring projection. Interpret those targets inside shared native preparation. Retain the current semantic records, validator and atomic transaction. Do not add a parallel `semanticIntent` operation list, automatic annotation agent or permanent intent store.

The missing lookup does not explain why the very first Entity was never created; recognition and editorial emphasis remain essential. The first two facts and the target restrictions are code findings. Their relative influence on model behaviour is a hypothesis: this investigation does not establish that a particular prompt sentence caused the omissions or that a proposed syntax will solve them.

## 2. Primary case study: the saved authenticity Symposium

Inspected [Conversation on November 11, 2026.ink](../../vaults/imported/Conversation%20on%20November%2011,%202026.ink), resource `1e567a77-495c-4a83-83d1-143a34a6b7f8`, SHA-256 `b1f60392e65bf912fc338355c6f7fc6ac0e8b3b04cc7a2a15fb0d1e0866166d3`. It contains nine committed human contributions, nine committed AI contributions and one human draft.

The [extracted evidence](evidence/dcp-semantic-intent/case-study.json) records contribution IDs, exchange IDs, vocabulary permissions and diagnostic line numbers. The diagnostic source is `vaults/imported/.mutable/dcp-test-phase/2026-11-10T23-47-31-060Z-9c87ef7d-fa00-4821-836e-98e88a9a652b.jsonl`.

All nine exchanges used GPT-5.4 (`gpt-5.4-2026-03-05` in receipts), `all-qualified`, Entity creation and `mutable/entity-reference` enabled, a 2,048-token output limit and hosted conversation continuity. All ten outgoing DCP Responses requests—including the one tool continuation—contained the editorial policy, the Entity schema and all four existing tools. There were no repair attempts. All final outputs completed, using 270–1,639 output tokens. There is no evidence of a token-limit failure suppressing semantic operations.

The saved native graph contains 34 bold annotations, 38 italics, three tables, one source Claim and its range-anchor infrastructure. It contains no Entity definitions/mentions, Glosses, Arguments or Argument relationships. This agrees with the retained response arrays.

The one retrieval was `search_symposium` in AI contribution **#10**, using the distinctive artistic-intention proposition. It returned the complete human TextBlock in **#7**, with a fresh handle and revision. The response anchored that exact proposition and classified it as a Claim. There was no separate `read_source` call; this is not missing source grounding, because the search result already supplied the complete source. The native source Block is `076dbef2-3d1c-4964-9d61-1cbfe67f890e`.

### Specific opportunities, rather than annotation targets

| Contributions | Semantic opportunity supported by the actual discussion |
|---|---|
| Human #1 / AI #2 | Establish an **Authenticity** concept and distinguish its material, historical and experiential senses. Mention the same identity in both contributions. A Gloss can explain the chosen umbrella meaning without asserting that the senses are equivalent. |
| Human #3 / AI #4 | Introduce **Restoration** and **Reconstruction** as distinct processes. The native comparison table already communicates well; its relevant terms could also link to those Entities. A note on conjectural digital additions would preserve uncertainty. |
| Human #5 / AI #6 | Establish **Provenance**; distinguish documentary evidence of history from **Historical continuity** itself. Reuse Authenticity. Preserve the qualification “important, but not always decisive” as a proposition, rather than putting a contested thesis into the Entity description. |
| Human #7 / AI #8 | Identify **Artistic intention** and its relationship to the competing authenticity criteria. Give the human's exclusive-intention proposition and the AI's narrower qualification independent Argument identities when preserving that disagreement. A directed `qualifies` or `challenges` edge can connect the AI's position to the human's. |
| Human #9 / AI #10 | The source Claim was genuinely authored. A contextual Gloss could distinguish evidence needed to infer intention from a definition of authenticity. Calling this a logical contradiction is disputable: epistemic dependence alone does not prove that two criteria contradict. Preserve that interpretation as the AI's, not as a fact. |
| Human #11 / AI #12 | Reuse the established concepts across the three professional perspectives. Supplementary notes about evidential limits are more useful than mechanically creating Entities for every occupational noun. |
| Human #13 / AI #14 | Preserve the distinction between competing dimensions and mutually exclusive theories. Relate this qualification to #7 and, where appropriate, to the AI's own stronger “contradiction” language in #10. Do not automatically label the two dimensions `contradicts`. |
| Human #15 / AI #16 | Reuse the conceptual vocabulary in the synthesis and connect the revised propositions to their earlier passages. The existing summary table is useful but carries no durable semantic connections. |
| Human #17 / AI #18 | The closing exchange needs no manufactured proposition or new Entity. Reusing an existing concept mention is possible; creating identities solely to increase counts is not a success criterion. |

These are reasoned opportunities, not a mandatory number of annotations. “Reconstruction,” “replica” and “restoration” should not automatically become aliases of one identity. “Material authenticity” and “visual authenticity” can be distinct concepts or scoped senses of Authenticity; their modelling should follow the discussion, not string similarity.

## 3. Current capability inventory

Evidence follows the actual code paths. The schema is in **`src/features/dialectic/dcp/provider-schema.ts`**, not the server path named in the brief.

| Behaviour | Current support and limitation | Evidence |
|---|---|---|
| Create Document-owned Entities with descriptions and aliases | Supported and exposed. Host assigns Entity and alias UUIDs. No duplicate resolution. | [semantics.ts:15](../../src/features/dialectic/dcp/semantics.ts), [scoped-entities.ts:12](../../src/application/scoped-entities.ts) |
| Mention new/existing Entities in new text | Inline `mutable/entity-reference` with `ref`, or explicit boundary ranges. Reuse does not require permission to create Entities. | [markup.ts:32](../../src/features/dialectic/dcp/markup.ts), [semantics.ts:19](../../src/features/dialectic/dcp/semantics.ts) |
| Mention Entities in earlier human/AI text | Fresh exact source anchor + `interpretations` entry of type `mutable/entity-reference`. Additive AI provenance. No author-kind exclusion among eligible committed sources. | [exchange.ts:193](../../src/features/dialectic/dcp/exchange.ts), [sources.ts:63](../../src/features/dialectic/dcp/sources.ts) |
| Discover an Entity by name/alias | Native lookup exists; **no DCP tool exposes it**. Unmentioned local Entity definitions have no general DCP inventory route. | [provider-contract.ts:9](../../src/features/dialectic/dcp/provider-contract.ts), [entity-service.ts:148](../../src/application/entity-service.ts) |
| Reuse a previously mentioned Entity | Source annotations expose `entityHandle`; `read_source` reads its record. Handles must be freshly issued each exchange. | [sources.ts:95](../../src/features/dialectic/dcp/sources.ts) |
| Reference a Vault Entity | Supported with scoped issued authority and current Vault identity/revision checks; legacy `codex/entity-reference` mentions can yield handles. DCP does not create or mutate global/Vault Entities. | [sources.ts:58](../../src/features/dialectic/dcp/sources.ts), [scoped-entities.ts:22](../../src/application/scoped-entities.ts) |
| Footnote-like Glosses | Already native. Independent definition, free validated type label and text; generated/existing passage targets. No dictionary-only constraint. | [semantics.ts:41](../../src/features/dialectic/dcp/semantics.ts), [gloss/model.ts](../../src/features/gloss/model.ts) |
| Classifications / Arguments / directed relationships | All supported. A classification does not create an Argument. Argument endpoints must be owned Arguments; Entity relations use scope-qualified Entity endpoints, with an owned endpoint. | [semantics.ts:23](../../src/features/dialectic/dcp/semantics.ts) |
| Whole-TextBlock semantic target | No direct DCP target form. Can wrap all nonempty generated text in a real classification/mention, or select the entire eligible existing text as an exact quote within limits. Block IDs alone are not passage aliases. | [exchange.ts:96](../../src/features/dialectic/dcp/exchange.ts), [sources.ts:171](../../src/features/dialectic/dcp/sources.ts) |
| Exact quote hints | Already supported for earlier TextBlocks through `anchors.selector`. Generated text currently needs inline/range syntax. | [sources.ts:171](../../src/features/dialectic/dcp/sources.ts), [markup.ts:55](../../src/features/dialectic/dcp/markup.ts) |
| High-level intent/target objects | Not accepted. Both strict provider schemas and native exact-field checks reject new shapes. | [provider-schema.ts:15](../../src/features/dialectic/dcp/provider-schema.ts), [exchange.ts:80](../../src/features/dialectic/dcp/exchange.ts) |

The distinction matters: much of the semantic model is already adequate; the gaps are discovery, editorial emphasis and authoring ergonomics.

### Vocabulary and schema effects

`all-qualified` permits the tested semantics. `core` excludes Entity creation/mentions, Glosses and Arguments; `general` adds Glosses but still excludes Entity creation/mentions and Arguments by default. `research` includes these operations. This is deliberate preset membership, not a cause of the observed all-qualified failure. The follow-up review approved enabling Entity creation and mentions in `general`; that production change is still pending. See [vocabulary.ts:9](../../src/features/dialectic/dcp/vocabulary.ts).

The negotiated instruction path truncates the legacy technical guidance before its semantic-identity section, then adds short gated guidance. Entities receive ownership/reference instructions, but no full resolve/create/mention example. Initial examples are rich text, comparison, Gloss and restraint; detailed Entity capability discovery supplies the schema but no complete Entity illustration. See [authoring.ts:115](../../src/features/dialectic/dcp/authoring.ts) and [capabilities.ts](../../src/features/dialectic/dcp/capabilities.ts).

Strict output accepts the required combinations. Disabled arrays are constrained to empty by [vocabulary-schema.ts:24](../../src/features/dialectic/dcp/vocabulary-schema.ts). The schema cannot infer concepts, equivalence, meaningful relation direction or exact XML spans. Conversely, requiring all arrays does not require the model to populate them. Ordinary valid prose bypasses repair by design. A new natural-language intention validator is unnecessary for this proposal.

## 4. Entity-first authoring analysis

### Recognise → resolve → reuse or create → mention

Recognition is a model responsibility: named people, objects, places, works, organisations and events, but also recurring concepts and technical terms. Prioritise the Symposium's working conceptual vocabulary. Explicitly encourage preservation of meaningful overlapping layers. Replace annotation-minimisation language with correctness, identity, anchoring and attribution criteria; retain restraint against invented content. Do not add desired counts or per-response quotas. Existing technical safety bounds are distinct from editorial quotas.

Resolution should reuse two existing native sources:

- **Document definitions:** `ScopedEntities.registry()` and scoped local records. Inspect canonical names, aliases, descriptions, types and deletion state. A bounded lookup adapter is needed; there is no local-name search method today.
- **Vault identities:** `EntityService.search/get`, read-only, followed by `ScopedEntities.resolve` / `DcpSources.verifyVaultEntity`. Prefer bounded name/alias lookup over expensive mention evidence when resolving an identity.

Do not mistake `EntityService.search({scope:'document'})` for the DCP local registry. Its SQL implementation filters Vault Entity matches by saved legacy mentions in a resource. It does not enumerate `mutable/entity` definitions owned by the live Document. The native Entity-list code also primarily handles `codex/entity-reference`. Reuse the services, but bridge the scope distinction explicitly rather than building a new registry. See [entity-lookup.mjs:27](../../src/knowledge-sqlite/entity-lookup.mjs) and [document-entities.ts:22](../../src/features/entity-references/document-entities.ts).

A proposed bounded `resolve_entities` read tool should return candidates with fresh typed handles, scope, canonical name, type, short description, alias/name match evidence, and explicit completeness/ambiguity. The tool name is illustrative and **not currently implemented**. A small relevant Entity summary can accompany explicit exchanges when already available; do not inject an unlimited registry or perform vault-wide discovery during typing.

Names and aliases identify candidates, not guaranteed semantic equivalence. The Vault matcher uses NFKC/case folding; that is a lookup rule, not authority to merge concepts. Duplicate aliases, homonyms, differing scopes or incompatible descriptions require a choice. Incomplete lookup does not establish absence. Never choose the first candidate silently.

If a candidate fits, the model uses its issued handle. If no suitable identity exists, the current `entities` declaration can prepare a new Document Entity. `new:e1` is already a provisional response-local identity; the host creates the persistent UUID. Multiple mentions can reuse that alias in the same response, and fresh handles can reuse the UUID in later exchanges.

For proposed host-assisted “resolve-or-create,” deterministic logic can retrieve candidates and check authority; it cannot decide whether two concepts mean the same thing merely because their names match. Prefer explicit candidate reuse or explicit creation. Flag likely duplicate creation with candidate evidence rather than silently merging. Whether a unique exact match may be automatically reused under an explicit resolve-or-create intention is an open design decision, not a current guarantee.

### Definitions are not propositions

Keep canonical name/identity, description, aliases, mention spans, contextual Glosses and Claims separate. An Authenticity description can identify the concept neutrally. “Authenticity resides only in artistic intention” is a participant's proposition, not its definition. A Gloss may explain that local use or question its assumptions. Aliases belong to an identity; they should not encode every related concept.

Document-scoped Entity creation remains atomic with the contribution. Global Entity mutation, automatic promotion and acquisition are unnecessary. Native Entity-relation type strings are currently free validated labels, whereas Argument relation types are enumerated. Syntactic admission of an Entity relation does not verify its factual or ontological meaning; never use a vague Entity edge as a substitute for an attributed contentious Claim.

## 5. Glosses as supplementary commentary

No new footnote system or native Gloss type is needed. `semanticPreparation.gloss()` accepts a nonempty type (without a colon) and text, creates an independent `mutable/gloss` definition, and attaches it to the target passage. Native starter types already include assumption, uncertainty, objection, evidence, note and qualification.

Expand guidance/examples to historical context, citations expressed as notes, interpretive alternatives, connections, assumptions and uncertainty. Existing `Gloss.text` is a plain string, not a rich-text composition or structured bibliography; a citation note must not pretend that a verified citation resource was created.

For “intended appearance,” a useful note is: “This assumes that the artist's intentions can be reconstructed with reasonable confidence, which may itself be disputed.” That note can coexist with an Entity mention and a Claim. It adds an interpretive layer rather than redefining Artistic intention.

The friction is targeting. A generated Gloss can attach to an alias on an Entity mention or meaningful classification. But when no such annotation is otherwise warranted, the model currently needs a style/classification span to obtain the alias: bare boundary markers do not create a passage anchor. A shared declarative target can remove this requirement without manufacturing formatting or semantic classifications.

## 6. Anchoring analysis

| Mode | Current behaviour | Recommended convenience and safeguards |
|---|---|---|
| Whole TextBlock | No direct semantic target. Existing whole-text exact quote can work for nonempty text within the 8,192-character selector limit; full source reads have a different 12,000-Cell bound. Generated whole-span markup works when a genuine annotation is appropriate. | Explicit whole-text target resolves to the full current text interval in native Cells. A nonempty immutable TextBlock makes this a meaningful snapshot range, not an artificial anchor. Reject empty text, inline objects and non-TextBlock containers; do not flatten tables, contributions or compound structures. |
| Quote-hinted | Existing-source `selector:{exact,prefix,suffix}` already resolves a literal quote to a unique Cell range with current source/revision authority. | Reuse the same rules for generated text and direct semantic targets. Preserve exact matching; report missing/ambiguous matches explicitly. Context hints may disambiguate. No implicit whole-block fallback. |
| Exact range | Generated boundary IDs/ranges support overlapping spans; earlier text uses exact selectors and issued range handles for permitted operations. No arbitrary model-supplied offsets are necessary. | Retain all existing forms. Convenience targets resolve to the same native spans and definitions, preserving independent overlapping annotations. |

Current matching is case-sensitive and literal: no whitespace collapse, Unicode normalization or approximate matching. UTF-16 string-match locations are mapped through native Cell boundaries; a match splitting a Cell is rejected. XML text decoding preserves CR by explicit escaping. See [sources.ts:171](../../src/features/dialectic/dcp/sources.ts), [canonical-search-source.ts](../../src/runtime/canonical-search-source.ts) and [markup.ts:32](../../src/features/dialectic/dcp/markup.ts).

A future normalized/approximate matcher could offer candidate suggestions with a mapping back to original Cells, but must not silently create annotations. It is unnecessary for the first increment. Prefer prefix/suffix hints to occurrence ordinals initially; ordinal hints would need explicit numbering, revision pinning and complete coverage, and still must never mean “choose any occurrence.”

For old content, a convenient target must still use an issued **Block** handle and revision from a complete eligible current source. Existing handles already identify Blocks: inventing a second handle family is unnecessary. `list_text_blocks` intentionally returns previews and `readRequired:true`; a preview cannot authorize exact annotation. `search_symposium` or the initial manifest can already provide complete text and revision, eliminating a redundant read when sufficient. Do not trade cheap paginated previews for unconditional full-text inventory.

Whole-block targeting should describe the selected passage, not automatically treat every Entity-related observation as a mention covering the entire paragraph. Mention extent must still identify what refers to the Entity.

## 7. Provenance and immutability

Existing operations append properties/definitions; they do not rewrite submitted text. The controller prepares everything, checks source fences and commits definitions, source marks and new composition in one bounded canonical transaction. Competing interpretations can coexist. See [controller.ts:280](../../src/features/dialectic/controller.ts).

| Provenance question | What the implementation currently preserves |
|---|---|
| Original author | Source discovery exposes the contribution's participant, author category, ordinal and time. Source marks retain `sourceAuthor` as `human`/`ai` and point to the native source through the range definition. |
| Annotation author | DCP metadata retains actor, participant ID, exchange ID, protocol, owner and generated/existing-source distinction. |
| Time | The originating committed AI contribution has `createdUtc`; the exchange ID links the annotation to that contribution. Individual DCP annotation provenance has no direct creation timestamp. |
| Source revision | Fresh revision tokens are validated and retained in the contribution's DCP request/tool/response provenance. The standalone range definition stores source Block identity and excerpt, not a revision token or durable content-version certificate. |
| Disputability | Classifications and Glosses are separate additive records; no explicit `disputable` flag or endorsement model is imposed. Their author is not the original speaker by default. |

**Concrete attribution limitation to address before claiming full multi-agent provenance:** [exchange.ts:84](../../src/features/dialectic/dcp/exchange.ts) sets annotation `participantId` to `defaultParticipant(resourceId,'ai').id`. The controller captures the selected AI participant, but does not pass that identity into `prepareDcp`. A non-default AI contribution can therefore have a correctly attributed wrapper but default-AI annotation metadata. The test Symposium uses the default identity; this does not explain its omissions. A future change should pass the host-selected participant through existing preparation, and consider retaining source participant and annotation time directly in existing provenance metadata. No fix was made in this investigation.

An Entity mention identifies a referent; it does not assert that provenance determines authenticity. Classifications, Glosses and relationships carry stronger interpretations and must retain attribution. No retroactive text edit or automatic global Entity mutation is warranted by semantic generosity.

## 8. Semantic-intent feasibility and recommended architecture

Use **the existing semantic operation arrays as the intentions**, with a shared declarative target union. Entity declarations, `interpretations`, `glosses`, `arguments` and `relations` already express semantic purpose. Their biggest avoidable mechanical cost is reference discovery and passage wiring, not GUID construction.

Three representations must remain distinct:

1. **Model output:** the negotiated DCP authoring projection, containing composition and semantic operations together.
2. **Validated authoring input:** current fields plus explicitly negotiated convenience forms, checked for capabilities, endpoint kinds, source authority and target resolution.
3. **Persisted native result:** existing Entity, mention, range-anchor, Gloss, Argument and relation records, with canonical ownership/provenance. No second semantic graph. Original intent syntax may remain in the existing diagnostic response provenance; it is not a second authoritative state.

### Small internal preparation sequence

1. Resolve declared Entity bindings from fresh issued handles and explicit new declarations, using bounded native candidate lookup and current-snapshot checks. Report ambiguous identity or likely duplicate creation; never silently substitute a different concept.
2. Parse generated composition with the existing markup grammar. Keep a temporary map from response-local Block IDs to their prepared TextBlocks. This is a preparation symbol table, not a document model or permanent index.
3. Resolve target objects: generated whole/quote targets against decoded prepared text; source whole/quote targets against the complete authorized source and its current revision. Existing passage-handle targets remain supported.
4. Reuse/extract the existing range-anchor preparation helper and shared inline/range annotation admission. Host code assigns native IDs and constructs valid Cell spans. Reuse a resolved anchor where appropriate, while keeping distinct semantic annotations/provenance.
5. Prepare Glosses, Arguments and typed directed relationships through the existing services. The model must still choose meaningful relationships and their direction; the host should not infer a proposition from a name match.
6. Validate the complete result and commit once through the existing transaction. No partial semantic success, silent dropping, fallback to another occurrence, or background job. A structured missing/ambiguous/stale/unsupported result should use bounded host-owned diagnostic codes and the existing repair opportunity. No extra retry loop.

A pure compiler into the **unchanged old wire format** is insufficient for every convenience: an unstyled generated passage anchor has no standalone old-wire representation. Do not manufacture an italic span or dummy Claim just to encode it. Extract/reuse the internal anchor helper after markup preparation and admit the resulting ordinary native records.

### Does this require a protocol change?

Prompt/example improvements and richer tool descriptions require no response-shape change. An Entity discovery tool extends the advertised tool contract but does not require a new contribution representation.

Whole/quote objects in semantic target fields, generated interpretations via those objects, or an added `semanticIntent` field **do require a negotiated schema/admission extension**: current schemas use strings and closed objects; `keys()` rejects extra fields. Reusing `dcp/1.0` as the envelope is possible only with an explicit authoring-profile/capability revision and compatible old-schema mode. Do not describe an undeclared optional field as “wire compatible.”

Prefer target unions within the existing fields over a separate `semanticIntent` section. A separate section would duplicate Entity/Gloss/Argument operations and require precedence rules when both routes address the same passage. Higher-level *mutating* tools would split composition and semantics across calls and complicate rollback. A bounded read-only resolver plus one final combined contribution is the smaller design.

“One response” is achievable when the required sources and Entity candidates are already available. Discovery of unknown earlier text or ambiguous Entities may still require existing-style tool continuations, and unresolved intent may use the single repair. No deterministic resolver can safely invent inaccessible source text or guarantee disambiguation without information. No second annotation model or planning pass is needed.

## 9. Approach comparison

| Criterion | A — prompt/examples only | B — simpler native DCP targets + Entity discovery | C — separate semantic-intent operation language |
|---|---|---|---|
| Entity creation/reuse | Creation easy; lookup gap and duplicates remain | Fresh candidate handles and explicit reuse; duplicate diagnostics possible | Can bundle resolution, but semantic equivalence still needs evidence/choice |
| Semantic richness | May increase recognition; not guaranteed | Reduces mechanics for meaningful layers | Expressive, but duplicates existing semantic verbs |
| Model complexity | Same low-level passage wiring | Fewer aliases/boundaries; known operations retained | Fewer low-level details, additional operation language to learn |
| Smaller models | Behavioural benefit unproven | Plausible ergonomic benefit; needs small qualification | Also unproven; ambiguity/action ordering remain difficult |
| Tokens | More guidance/examples; old output wiring | Concise targets can reduce wiring; Entity summaries/tool results add tokens | Depends on representation; repeated natural-language intents can be larger |
| Additional model calls | None inherently; current discovery still needed | None when authority/candidates supplied; bounded lookup otherwise | None inherently, unless implemented as separate authoring tools/agent |
| Implementation | Small | Bounded preparation/schema/tool changes | Larger compiler, compatibility and conflict-handling surface |
| Validation | Existing unchanged | Same native invariants plus strict target resolution | Can preserve invariants, but must specify every action and partial-failure rule |
| Source grounding | Prompt encourages it; cannot guarantee it | Explicit source handles/revisions remain mandatory | Name/quote-only intent risks weakening authority unless carefully constrained |
| Maintainability | Simple, leaves ergonomic debt | Shared native helpers and one semantic vocabulary | Risk of parallel authoring APIs for identical native records |
| DCP compatibility | Existing schemas | Negotiated extension with legacy forms retained | Larger negotiated extension; separate operation precedence required |

**Approved direction: A + B, incorporating C's useful principle inside B.** The model declares semantic meaning and desired targets; the host handles IDs, exact ranges and native materialisation. This is semantic-intent authoring without a second language for operations DCP already has. It is a recommendation based on code feasibility, not a measured model-performance claim.

## 10. Illustrative before/after

### Current DCP: create a concept, mention it and add a contextual Gloss

The following is a complete all-qualified contribution illustration. Replace `EXAMPLE_EXCHANGE` with the actual exchange. It uses no external source authority. `textStyle` and `margins` are included for the current enabled stages; older schemas omit them. The feasibility check exercises this same mechanism.

```json
{
  "protocol": "dcp/1.0",
  "kind": "contribution",
  "exchange": "EXAMPLE_EXCHANGE",
  "intent": "reply",
  "replyTargets": [],
  "composition": [{
    "id": "new:b1", "kind": "paragraph",
    "markup": "<annotation type=\"mutable/entity-reference\" id=\"new:s1\" ref=\"new:e1\">Authenticity</annotation> depends on the criterion being used.",
    "ranges": [], "textStyle": null, "margins": null
  }],
  "entities": [{
    "id": "new:e1", "name": "Authenticity", "typename": "Concept",
    "description": "The criteria under which an object is regarded as genuine.",
    "aliases": []
  }],
  "anchors": [], "interpretations": [], "arguments": [],
  "glosses": [{
    "id": "new:g1", "target": "new:s1", "type": "qualification",
    "text": "A criterion of genuineness can be disputed even when the object's identity is agreed."
  }],
  "relations": [], "suggestions": [], "promotionRecommendations": []
}
```

Reusing an existing Entity needs no new Entity declaration: use its fresh issued Entity handle in `ref`. To attach a mention to an earlier human or AI passage today, add a current `anchors` entry with exact quote/revision and an `interpretations` entry `{id, target: anchorAlias, type:"mutable/entity-reference", ref: entityHandleOrNewAlias, attributes:[]}`. Do not use a remembered UUID or a contribution handle as that text source.

### Proposed convenience: existing operations with declarative targets

**Not implemented or valid under today's schema.** These are illustrative replacement fields in the preceding envelope; they are not a second protocol. The proposed target kinds and selectors require negotiation and review.

```json
{
  "composition": [{
    "id": "new:b1", "kind": "paragraph",
    "markup": "Authenticity depends on the criterion being used.",
    "ranges": [], "textStyle": null, "margins": null
  }],
  "interpretations": [{
    "id": "new:m1", "type": "mutable/entity-reference", "ref": "new:e1",
    "target": {
      "kind": "generated-text", "block": "new:b1",
      "selector": {"kind": "quote", "exact": "Authenticity", "prefix": "", "suffix": ""}
    },
    "attributes": []
  }],
  "glosses": [{
    "id": "new:g1", "type": "qualification",
    "target": {"kind": "generated-text", "block": "new:b1", "selector": {"kind": "whole-text"}},
    "text": "Different criteria need not imply that every judgment is equally defensible."
  }]
}
```

For a proposed source target, replace `generated-text/block` with `source-text/source/revision`, using a complete current issued Block handle and revision. Use the same exact quote selector or explicit whole-text selector. A direct target in `arguments[].anchor` could similarly remove passage-alias ceremony while preserving distinct `new:arg…` identities for relationships. This example is clearer, not necessarily smaller in bytes; concise schema naming and shared target aliases can be evaluated before finalising it.

## 11. Implementation boundaries and reviewable sequence

The architectural direction is approved, but production implementation is not yet authorized. The original three-step sequence is refined by **§13.11**, which brings committed semantic continuity into the Entity-first increment before declarative-target qualification. The earlier feasibility checks below remain evidence from the first investigation; no additional suite was run for the workspace follow-up.

The native Entity/Gloss/Argument model, canonical ownership, transaction/Undo machinery, persistence format, submitted text protection, source authority, provider transport and conversation continuity remain in place. No document-wide scan per keystroke, new index or automatic resource/global-Entity mutation. The previously deferred broker instruction-trust issue remains deferred; this investigation does not reopen that implementation.

### Focused feasibility checks completed

- Seven existing Stage 4B tests passed (`dialectic.test.tsx -t '4B'`): native semantic composition, scoped local/Vault relations, authority/cancellation, reuse, native persistence and Undo-related checks already in those fixtures.
- Three small [investigation checks](evidence/dcp-semantic-intent/feasibility.test.ts) passed: one Entity shared by generated and earlier-human mentions with a contextual Gloss and later issued-handle reuse; duplicate names receive different IDs and generated Block IDs fail as Gloss targets; exact matching rejects repeated/case/normalization guesses while allowing disambiguation, Unicode and whole nonempty text. Extra `semanticIntent` fields are rejected by the current contract.
- No new provider calls, production modifications, user-Document edits or large automated suite. These checks demonstrate existing mechanics, not improved model behaviour.

### Focused qualification plan after approval

Use a copy of the authenticity Symposium and a few short synthetic variations:

1. Introduce Authenticity and Provenance, then reuse them across two contributions and annotate both human and AI mentions. Inspect stable native identities and correct attribution, not just counts.
2. Present two homonyms, an alias match, distinct restoration/reconstruction concepts, and an incomplete or stale lookup. Require explicit ambiguity/unavailability; no silent merging or duplicate fallback.
3. Combine an Entity mention, contextual Gloss and Claim on overlapping text. Exercise generated whole/quote targets and current source targets; reject empty/nontext/ambiguous/stale/foreign targets, including repeated quotes and Unicode boundaries.
4. Preserve competing intentions/continuity Arguments with a justified directed relation and a later qualification of the AI's own position. Do not reward an unsupported `contradicts` edge.
5. Verify one atomic commit, rollback on unresolved intents, Undo/Redo, save/reload, restricted vocabulary and legacy provider schemas. Check selected-agent provenance and source text unchanged.
6. Run a small GPT-5.4/Mini sample using existing settings: conceptual introduction, later reuse/disagreement and casual closing. Review grounding, correct identities, useful supplementary notes and conversational quality separately from native validity. Measure calls, input/output tokens and latency; no count quotas or broad benchmark.

## 12. Approved design decisions

The follow-up review settles the earlier architectural questions:

1. Hybrid A+B: Entity-first authoring, bounded discovery and declarative targets inside the existing semantic operations; no parallel intent language.
2. Semantic generosity: preserve meaningful structure; correctness and provenance take priority over annotation minimisation.
3. Entity recognition, resolution, reuse/creation and mention annotation are normal authoring practices.
4. Discovery includes live Document Entities and read-only Vault candidates; no automatic Vault mutation.
5. Enable Entity creation and mentions in the `general` vocabulary when implementing the approved changes.
6. Never silently merge semantically distinct Entities solely because names match.
7. Whole nonempty TextBlock and exact quote targets coexist with current exact-range forms.
8. Unresolved semantic targets reject the contribution and use the existing bounded repair mechanism.
9. Correct selected-agent attribution and assess timestamp/revision provenance.
10. Preserve DCP identities, native records, source authority, immutability, validation and persistence.

These decisions are carried forward. Remaining workspace-specific choices appear in §13.12.

## 13. Symposium Semantic Workspace — follow-up investigation

### 13.1 Finding and existing continuity mechanisms

**A useful committed working set can be derived from the current native Document without another persistent registry.** Its semantic contents persist because the native records persist; its small request projection and fresh handles are reconstructed for each exchange. Cache identity membership and selection within the retained Document session, not copied semantic truth. A separate persistent scratchpad is not necessary to solve Entity reuse and has not yet demonstrated enough additional value to implement.

The authenticity Symposium itself still contains no Entities, Arguments or Glosses. A workspace would truthfully expose its one source classification, not manufacture the conceptual graph suggested in §2. Entity-first authoring creates the missing records; the workspace then makes their reuse routine.

| Existing mechanism | What can be reused / what is missing |
|---|---|
| Document `linkedAnnotations` and `ScopedEntities` | Authoritative local Entity records, aliases, revisions, Glosses, range anchors, Arguments and relationships. Read by stable scoped identity; no provider memory required. |
| `DialecticReferences` | One retained-session derived index, initially traversing owned Block structure, then reading affected records/subtrees. Already maps Blocks, anchors, Arguments and incident Argument relationships. Its update pass is the appropriate place to add compact Entity-mention, classification and Entity-relation membership indexes. It is not yet a complete semantic working-set selector. |
| Contribution `dcp.identityMap`, `annotationRefs`, participant, ordinal and `discursiveReferences` | Immediately identify newly created/referenced objects after admission; provide provenance and chronological selection seeds. They are historical candidates, not proof that those objects are still active. Always resolve against current native records. |
| Contribution activity | Already separates created identities, references, unavailable effects and range infrastructure. Reuse its provenance rules and native checks. Do not drive workspace authority from display counts: activity is feature-gated and its local activity checks deliberately cannot verify Vault endpoints. |
| `ConversationHistory` | Cached native contribution projection with dependency-based invalidation. Useful conversational replay, but not a live semantic registry: later annotation strata are intentionally excluded from history fingerprints, and the projection does not carry the Document definition registry or complete scoped Entity metadata. |
| `DcpSources` | Fresh typed handle issuance, owner checks, native/source resolution, selected-record fences, Vault identity/revision validation and bounded manifests. This already supplies the required authority mechanism. |
| Existing Entity service and native indexes | Reuse read-only lookup/get for Vault candidates and live Document definitions for local candidates. Existing legacy Entity listings do not cover the complete scoped DCP graph; do not build the workspace by repeatedly calling a broad Document/Vault mention search. |

Code: [references.ts:17](../../src/features/dialectic/references.ts), [activity.ts:30](../../src/features/dialectic/activity.ts), [continuity.ts:8](../../src/features/dialectic/continuity.ts), [sources.ts:21](../../src/features/dialectic/dcp/sources.ts), [scoped-entities.ts](../../src/application/scoped-entities.ts). `references.ts` currently indexes Argument edges but needs Entity incidence/selection support; this is a bounded extension of an existing index, not an already implemented capability. Semantic indexing must work independently of the contribution-activity UI flag.

### 13.2 Three different forms of memory

**Provider memory:** today only OpenAI has persistent provider conversation binding. The controller enables it for OpenAI when the continuity feature is on. The broker associates a provider Conversation with Cavern, Document, participant and a hash of the API connection; the model name is *not* part of that binding. A model change on the same connection/participant can therefore retain the same provider Conversation. Other providers/stateless mode receive the current request and within-exchange tool results, not an equivalent persistent native-history replay.

OpenAI requests send `conversation`, `store:true` and `truncation:'disabled'`. The application fails explicitly at provider context limits; it does not silently truncate or compact. Native replay is also bounded at 128 contributions, 128,000 characters and 1 MiB. Missing remote history, failed exchanges, repair and divergent native history have explicit recovery/rebuild paths. A repaired exchange triggers a subsequent rebuild because rejected candidates may remain remotely. See [providers.ts:94](../../server/dialectic/providers.ts), [conversations.ts:12](../../server/dialectic/conversations.ts), [broker.ts:70](../../server/dialectic/broker.ts), [continuity-contract.ts:8](../../src/features/dialectic/dcp/continuity-contract.ts).

The `.mutable/dialectic-continuity` journal stores provider coordination metadata, accepted history stamps and receipts—not the semantic graph. `historyBaseJson` deliberately removes `annotations` from history hashes; `ConversationHistory` does not refresh base replay merely because a linked definition or annotation changed. Provider memory can therefore remember obsolete names, annotations or rejected semantic candidates. These are reasons to supply a current workspace, not to make provider history authoritative.

**Application committed working set:** a current, bounded view of shared native records, with fresh authority. Provider-independent. Every exchange receives the selected current snapshot even if a remote Conversation already contains older snapshots. It survives provider resets through the Document, not through the remote cache.

**Agent provisional notes:** mutable, attributed hypotheses or reminders, separate from committed semantic records. Nothing equivalent currently exists. Conversation content already carries many uncertainties, and native Glosses can preserve public qualifications. Whether private-to-agent context notes add enough value beyond those and the committed working set remains unproven. Neither a workspace summary nor a provisional note grants authoring authority.

The workspace does not remove current replay/context limits or provide full cross-provider conversational-history parity. Those remain separate constraints; do not promise an indefinitely long Symposium merely by adding semantic context.

### 13.3 Derived committed working set and selection

Use one shared native identity-resolution path for both workspace projection and bounded discovery. Candidate selection differs; existence, scope, revision and authorability checks do not.

Proposed construction on explicit Ask:

1. Capture the current Document, selected participant, current request/focus and native source session. Use the existing session generation and cancellation checks.
2. Select stable scoped identities from the retained native index and committed contribution metadata. Store IDs/references in the selection cache, never previous exchange handles.
3. Read current Entity fields and current semantic records. Resolve active attachments and endpoints; mark deleted, unanchored or unavailable objects as such when they are relevant to the current request. Do not advertise stale reuse authority.
4. Issue fresh handles through this exchange's `DcpSources`; fence the selected native definitions/source records and verify selected Vault references. Only then publish a compact, immutable request projection.
5. Check fences/session again after asynchronous work and before admission. The workspace is current at preparation time; mid-exchange changes must still cancel/reject stale work.

**Selection policy:** use ordered relevance tiers, not a new scoring engine:

- Explicit focus/selected semantic objects and identities actually mentioned in the current committed contribution.
- Objects created/referenced by the latest successful contribution, including another agent's, so Entity creation in N is immediately useful in N+1.
- A small active set containing repeatedly mentioned concepts and currently discussed Arguments; retain older central concepts across quiet turns.
- Additional recent/referenced identities from the selected participant and other participants, plus important attached Glosses and incident relationships when their endpoints fit.

An “actual mention” means a native reference. Do not silently Entity-link unannotated prose by lexical matching during context assembly; use the approved resolver when identity is uncertain. Creation alone need not keep a one-off Entity permanently active. Frequency should count surviving canonical mentions/distinct contributions, not DOM occurrences, rebase events or the number of times the workspace itself was sent. Repeatedly supplying an Entity must not increase its relevance.

Maintain a small session active-ID set and simple mention/recency membership in the existing derived index. Reconstruct it from native records after reload. A separate saved active-set preference is unnecessary initially; add persistent pins only if ordinary use demonstrates a selection problem. This satisfies semantic persistence without another persistent database. Objects outside the projection remain in the authoritative registry and discoverable; absence from the workspace never means nonexistence.

Work must be bounded twice: candidate traversal/definition reads and serialized output. Fill the projection in priority order up to a byte budget, with explicit omitted/truncated coverage. Do not sort or scan thousands of objects on every Ask just to send ten. Build initial membership during the existing session-index initialization, then update affected definitions/mentions; cache the small ordered active set. Reuse existing change publications and `definitionChanges` IDs. No full Document snapshot, source-text sweep, Vault search or provider request during typing. Resolve current excerpts only for selected passages, on Ask.

### 13.4 Identity, Claims and source authority

`DcpSources.issue()` deduplicates scoped targets within an exchange and uses a newly generated scope for the next exchange. It checks owner scope but **does not by itself prove existence or freshness**. The workspace publisher must use native resolution/verification before issuing reusable authority. Local Entity reads use the current definition owner and root fence; Vault reads use current Vault identity and recorded Entity revision, with admission-time verification. Selected Vault objects may require host-side ID reads each exchange even though the model makes no name-search tool call. Caching cannot remove a freshness check the service cannot otherwise guarantee.

The types must remain distinct:

- Entity rows carry canonical name/type, bounded description/aliases, the existing stable scoped identity/revision for orientation, and a fresh Entity handle. Stable identity lets the agent recognise a rename across changing handles; it is never accepted in place of an authoring handle. Use existing native IDs for other semantic objects too, not a second workspace-ID namespace.
- Arguments carry their independent Argument handle, source location and a bounded *excerpt*, not an unlabelled generated summary.
- Relationships carry native type, author and endpoint handles. Prefer including their endpoints in the same projection; do not emit misleading dangling edges to save space.
- A Claim classification is a property on a passage, **not an independent DCP Claim object or Argument**. Represent its native property locator, type, interpreting participant, source location and any existing Argument/range association. Do not invent `src:…:claim` handles or create an Argument implicitly.
- Glosses carry their independent handle, type, author, bounded note text and known attachment locations. `read_source(gloss)` alone is not a complete reverse attachment index; obtain locations from existing property/reference metadata.

“Committed” means admitted to the current canonical graph, not necessarily saved to disk, true, endorsed or undisputed. Existing Entities have no general `provisional` flag. Show competing attributed interpretations and native challenge/qualification edges; do not turn a deterministic selection heuristic into a new truth-status system. Descriptions and excerpts may be truncated and must say so.

A fresh Entity or Argument handle can support reuse without a source-text search. A source Block handle plus preview cannot authorize a guessed quote. If the existing structural manifest already contains complete eligible text and revision, reuse it. Otherwise provide a location marked `readRequired:true` and use `read_source` when exact/whole-text annotation is needed. Existing issued range handles retain their existing permitted uses. This preserves the approved declarative-target design and the separation between identity reuse and passage annotation.

### 13.5 Exchange N → N+1 and lifecycle

**Concrete sequence:** exchange N declares `new:e1` for Authenticity and adds mentions. Native preparation allocates Entity UUID E; the controller commits E, mentions and the contribution atomically and retains the alias→scoped-identity map. After publication, the shared index sees E in committed state. On N+1, the recent-created tier selects E, reads its current record, and the new `DcpSources` issues a fresh `src:<new-scope>:e…` handle. The request includes that handle/name/description. The model can use it directly in `ref`, with no Entity declaration, name search or extra generation round. The N handle is never reused. Newly generated TextBlocks similarly become native source locations on the next exchange; their old `new:b…` aliases are not persistent source authority.

The post-admission refresh updates ID membership and invalidates affected projections; it need not serialize the next workspace, read the whole graph or call the provider. N+1 materializes the current selection. Native state, not provider acknowledgement, determines which objects exist.

| Event | Required behaviour |
|---|---|
| Failed validation, cancelled response or transaction rollback | No proposed Entity/relationship enters the committed set. Do not seed from streamed output or the prepared result before native publication. Withhold any future note edits too. |
| Native commit succeeds; provider acknowledgement fails | Native records remain authoritative and available next time. Provider continuity may rebuild. Do not erase real semantics to match uncertain remote memory. |
| Rename/alias/description edit | Affected record invalidates its projection. N+1 uses the same scoped identity with current fields. Old names remembered remotely do not create a new Entity. |
| Soft deletion or missing endpoint | Remove reusable authority; retain a bounded unavailable locator if needed to explain the current focus. Relationships may remain historical records; do not silently delete them or imply their source passage is active. |
| Undo/Redo | Derive membership from the canonical change, removing/reinstating identities and mentions. Historical `identityMap` entries alone do not resurrect removed definitions. |
| Another participant/agent commits | Update the same shared index and include relevant objects. An in-flight exchange whose fenced records changed rejects stale preparation under existing rules. |
| Reload/host transfer | Dispose/rebuild or reattach the existing retained-session index through current lifecycle paths. Reconstruct selection from native records, then mint fresh handles. No persisted handle cache. |
| Vault/session change or selected Vault Entity revision change | Drop cached authority and revalidate under the new scope. Unavailable Vault records are labelled/omitted; never redirect their IDs into the Document scope. |
| Provider reset or new API connection | Build the same workspace from native state. OpenAI may replay native history into a new Conversation; semantic reuse does not depend on successful recollection of the old one. |
| Model/provider change with same logical participant | Keep shared native state and participant identity. Mint fresh exchange handles regardless of whether OpenAI reuses its binding or the new provider is stateless. Check that the chosen provider supports the negotiated schema; report unsupported transport/schema rather than dropping semantics silently. |

The existing root-definition fence is conservative: unrelated changes to that fenced root can invalidate an exchange. Preserve that behaviour initially. Narrowing concurrency fences would be separate work, not a reason to weaken source authority for cached workspace entries.

### 13.6 Shared state, participant identity and provisional notes

Committed semantic state is shared at Symposium scope. Selection can favour the current agent's relevant work without excluding other authors. Key any agent-specific preferences/notes by stable **Document + participant ID**, not model name, provider conversation ID or API key. Model changes need not create a different participant. Other agents' Claims and Glosses remain attributed interpretations, not accepted beliefs.

The selected-AI-participant defect in §7 must be corrected before workspace “authored by this agent” selection is qualified. For older records with uncertain annotation attribution, use verified contribution/exchange provenance where available and label uncertainty; do not rewrite their historical metadata silently. Preserve source participant versus interpreting participant, creation time and revision linkage through host-supplied provenance.

**Challenge to provisional notes:** all four examples in the brief can already be expressed as ordinary tentative prose or public attributed Glosses. The committed workspace solves persistent identity reuse and exposes those notes' native handles. There is no behavioural evidence yet that an additional agent-only scratchpad is necessary. Recommend **committed workspace first; no persistent provisional notes in that increment**.

If later use demonstrates loss of concise unresolved hypotheses across resets, the smallest optional extension would be:

- Short, human-inspectable notes with host-assigned ID, owner participant, revision, created/updated times, plain text and optional stable scoped subject references. No copied Entity definitions, executable instructions or hidden authority. Treat notes as data, not high-priority prompt text.
- Incremental add/update/remove operations with expected note revisions; untouched notes need not be rewritten. Old source handles must never be saved in notes. Revalidate referenced subjects on each use and label stale/unavailable notes; do not silently rewrite their meaning.
- Store a bounded participant-keyed note collection in the existing Document's mutable metadata through a narrow native operation, if approved—not inside immutable submitted contributions and not in the provider continuity journal. This is a candidate location, **not an existing admitted note service**; native metadata validation, Undo/Redo, save/reload and export would need focused qualification.
- Stage note edits with the contribution and apply them only in the same successful canonical admission. Failed admission leaves both prior notes and semantic state unchanged. Promotion requires an explicit normal Entity/Gloss/Argument operation; a note mentioning a concept does not create one.
- Default injection only into the owning agent's context; humans can inspect/edit/discard it. This is application visibility, not encrypted secrecy: the Document/export and previously sent provider requests may retain the content. Deleting a local note does not erase historical provider memory or diagnostics.
- A total note-text/storage/context budget, explicit full/stale outcomes and user-controlled pruning; no invisible endless growth or silent eviction of unresolved hypotheses. Choose numeric limits only if this feature is approved. Notes would require a negotiated response/edit extension and a host write path; do not overload `entities` or `glosses` with uncommitted scratch state.

This optional design survives model changes under the same participant and keeps another agent's hypotheses out of automatic context. It remains deferred; no scratchpad schema or storage has been implemented.

### 13.7 Illustrative incoming request

The [complete illustrative request fragment](evidence/dcp-semantic-intent/workspace-request.illustrative.json) shows six Entities, two Arguments, one relationship, one classification, one Gloss and two source locations. It depicts a **future enriched Symposium**, not records found in the actual fixture. All handles are placeholders and have no issued authority. The names of these request fields are proposed, not current DCP tooling.

A compact excerpt:

```json
{
  "exchange": "EXAMPLE_EXCHANGE_N_PLUS_1",
  "semanticWorkspace": {
    "version": 1,
    "scope": "current-document",
    "forParticipant": "agent-A",
    "authority": "current-exchange-only",
    "coverage": {"status": "selected", "completeRegistry": false},
    "entities": [{
      "handle": "src:AAAAAAAAAAAAAAAAAAAAAA:e1",
      "identity": {"scope": "document", "resourceId": "EXAMPLE_DOCUMENT", "entityId": "EXAMPLE_ENTITY_1"},
      "revision": 0, "name": "Authenticity", "typename": "Concept",
      "description": "Criteria under which an object is regarded as genuine.",
      "aliases": []
    }],
    "arguments": [{
      "handle": "src:AAAAAAAAAAAAAAAAAAAAAA:arg7",
      "excerpt": "Authenticity depends on historical continuity.",
      "textRole": "preview", "source": "src:AAAAAAAAAAAAAAAAAAAAAA:b10",
      "author": "human-A"
    }],
    "sourceLocations": [{
      "handle": "src:AAAAAAAAAAAAAAAAAAAAAA:b10",
      "contributionOrdinal": 7, "readRequired": true
    }],
    "workingNotes": {"status": "not-enabled", "items": []}
  }
}
```

This is a host-built **context** extension alongside `structuralContext`, not a new response operation language. The existing request forwarding carries structured context, but typed projection, ownership checks, budgeting and guidance still need implementation. Put descriptive workspace data in the request payload, not the system prompt. Explain that only the current exchange's workspace/manifest carries current authority and that older copies in provider memory are historical. Existing contribution operations and approved declarative targets consume the supplied handles; discovery uses the same native resolver.

### 13.8 Token and retrieval costs

The complete illustrative fragment serializes to **3,608 UTF-8 bytes** in minified JSON. A rough planning range is **about 720–1,440 tokens** using 2.5–5 bytes/token; this is not a tokenizer measurement, especially for handles/Unicode. Supplying these identities can avoid repeated discovery and generation rounds; it is not necessarily cheaper than reading one short source passage. Actual qualification should record provider usage, latency, host definition reads and Vault requests.

Use a provisional **8 KiB workspace sub-budget inside existing context limits**, not an increased total retrieval allowance. Include workspace projection work in the source/context accounting; avoid an invisible unbounded side channel around current budgets. This is a request-size planning recommendation, not a cap on how many Entities may exist or be authored. Essential focus and endpoint closure take priority; report omitted coverage instead of pretending the selection is complete. No numeric annotation quotas are proposed.

Refresh native selection incrementally but send a complete small selected snapshot with fresh handles each exchange. Provider-relative deltas alone would reintroduce dependence on fragile model memory and break resets/provider changes. Reuse cached descriptions only when their native revision/dependencies are still valid; regenerate authority every time. No name lookup is needed for an included Entity, although current Vault ID verification may require host IO. Missing or ambiguous identities still use bounded discovery.

There is an accumulation cost: existing OpenAI Conversation requests are stored, so older workspace snapshots also remain in provider history. Ten similarly sized snapshots could occupy roughly 7.2–14.4k tokens before other context; a delta-only optimisation is not assumed. Existing request provenance also retains the workspace in saved DCP diagnostics. Keep the projection small and avoid full definitions/passages. Do not add remote-history rewriting or automatic compaction to this increment. If history limits are reached, report the existing limitation; semantic context does not silently bypass it.

### 13.9 Workspace versus discovery and declarative targets

The workspace answers “which relevant committed identities can I use now?” Discovery answers “what else might exist in this Document or Vault?” They share scope-qualified lookup, freshness checks and handle issuance; there are not two competing Entity stores.

- **Reuse directly:** a current workspace candidate matches the intended concept and supplies a valid handle.
- **Discover:** the needed concept is absent, aliases are unclear, scope matters or the workspace is partial. Search Document definitions and read-only Vault candidates through the approved resolver.
- **Create:** no suitable identity has been established, with explicit handling of incomplete/ambiguous results. Names alone never merge identities.
- **Clarify:** candidate descriptions/context still cannot distinguish the intended concept. Ask a semantic question, not for a source handle the application can issue.
- **Keep provisional:** express a tentative public observation in ordinary composition/Gloss if appropriate. An optional private-to-agent note remains unavailable until separately justified and approved; the application must not invent a provisional Entity to stand in for it.

Recently generated and relevant older TextBlocks can be included as current source locations without full passage replay. Existing Arguments/ranges enable direct reuse where supported. Claims stay classifications. For whole-text and exact-quote authoring, a preview is insufficient: acquire complete source text/revision through the manifest or existing reader and use the approved deterministic target resolver. This is precisely where identity continuity can save Entity lookup calls while source grounding remains explicit.

### 13.10 Recommended architecture

Adopt **shared committed semantic context, per-agent selection, fresh per-exchange authority**. Its persistent source of truth is the native Document plus referenced Vault identities. Its implementation is a small projection over existing registries/indexes and a bounded addition to request assembly. Persistent provisional notes are optional future work, not a prerequisite.

This refines approved hybrid A+B: Entity-first authorship creates the graph; a reusable committed working set makes subsequent semantic participation cheap; the shared discovery service fills omissions; declarative targets remove range-wiring overhead. No separate database, worker, framework, automatic annotation pass or new semantic truth model is needed.

### 13.11 Revised implementation sequence — for review, not execution

1. **Shared semantic context foundation and provenance.** Correct selected-participant propagation; assess direct timestamp/revision fields. Extend `DialecticReferences`' existing affected-record index with Entity/claim/Gloss-location membership and scoped incident edges as needed. Define the compact read projection and current/unavailable statuses. Reuse native definitions; avoid UI-feature dependencies and per-keystroke broad work.
2. **Entity-first discovery + committed workspace together.** Use `ScopedEntities` and `EntityService` behind the bounded resolver and workspace publisher in/alongside `DcpSources`. Assemble the selected context in `controller.ts` after source-session creation and before sending the request. Seed newly admitted identities only after canonical publication. Update guidance/examples/catalogue and implement the approved `general` Entity permissions. Preserve old request behaviour behind a feature gate during qualification; follow project default-on conventions for the qualified new feature unless specified otherwise.
3. **Declarative semantic targets.** Extend the existing projection/schema and shared preparation as approved in §§8–12. Reuse workspace authority; retain existing forms, strict source checks, current atomic failure behaviour and one repair. No provisional-notes field in the response.
4. **Focused integrated qualification.** A short N→N+1→N+2 fixture should create, reuse without lookup, and then reuse another agent's Entity. Check rename/deletion/alias changes, Undo/Redo, reload, stale/foreign handles, failed admission, unavailable Vault scope and model/provider reset. Check that old central concepts survive intervening turns without sending the whole registry. Measure affected-record reads, preparation bytes and zero typing-triggered scans/IO. Reuse existing native persistence, authority and provider fixtures; add only a small GPT-5.4/Mini exercise after deterministic qualification.
5. **Optional notes decision later.** Evaluate ordinary use for lost unresolved hypotheses after committed semantic continuity works. Implement nothing unless a specific benefit and visibility/storage policy are approved.

Likely changes: `references.ts`, `controller.ts`, the existing `dcp` request/source/schema/guidance modules, scoped Entity adapters and catalogue/vocabulary files. A small workspace projection module may keep request assembly readable; it must consume existing native services rather than become a second lifecycle or registry. `ConversationHistory`, provider transport, continuity-store format, canonical persistence and native semantic record types should remain unchanged for committed workspace support. The separately deferred broker instruction-trust work remains deferred.

No new tests, live provider calls or working prototype were needed for this follow-up. The measured payload is illustrative JSON only; code inspection and the prior feasibility evidence establish the architectural path, not its future behavioural effectiveness.

### 13.12 Remaining workspace-specific decisions

The approved decisions in §12 are settled. Remaining review choices are:

1. Approve **committed workspace first**, with persistent agent notes deferred until benefit is demonstrated?
2. Approve an initially reconstructible session active set, with no saved selection preferences or pin-management feature?
3. Approve a tentative 8 KiB context sub-budget and explicit partial coverage, to be adjusted only from focused measurements within existing total limits?
4. If optional notes are later justified, confirm human visibility, owner-agent-only automatic injection, same-transaction edits, retention/pruning policy and native metadata storage before designing that extension.

The default result should be straightforward: an Entity created in N is available by fresh handle in N+1 because it exists in Mutable, not because a model happened to remember it. A provider reset changes conversational transport state, not the Symposium's semantic identities.
