# Lightweight semantic authoring for Dialectic

11 November 2026 · Investigation only · No paid provider calls · No production changes

## Decision

Recommend **restricted XML as the candidate authoring surface**, compiled into the existing DCP preparation/admission path. Keep compact JSON as the comparison control before choosing the provider transport. Do not build a second native model, registry or persistence system.

The offline evidence supports a substantial simplification, but does not establish model reliability or conversational latency. Most savings come from removing transport ceremony and exposing short, host-resolved references. XML contributes a smaller additional saving. Markdown/XML is only marginally smaller in these fixtures and requires more complicated parsing.

The proposed initial contract is **1,182 local tokens**, within the brief's target. Equivalent saved responses use **44.7–62.7% fewer tokens** in restricted XML than minified current DCP JSON. These are tokenizer comparisons, not predictions of billing or elapsed time.

The full ambition includes native Claims/Traits and qualified propositions. Those cannot truthfully be advertised as a syntax-only change: their current Vault services do not share DCP's Document transaction. Preserve this as an explicit dependency, not a reason to inflate the everyday language or silently downgrade Claims to binary relationships.

## A. What is actually expensive

DCP already separates model output from native construction. [`exchange.ts`](../../src/features/dialectic/dcp/exchange.ts) generates native IDs, dispatches shared Block preparation, resolves source authority and prepares annotations; [`markup.ts`](../../src/features/dialectic/dcp/markup.ts) calculates Cell ranges; [`controller.ts`](../../src/features/dialectic/controller.ts) admits the prepared result through a canonical bounded structural transaction. The model does **not** currently author arbitrary native DTOs or calculate ordinary inline offsets.

The unnecessary exposure is predominantly:

- Repeated exchange-local handle strings and revision UUIDs in exact selectors and mentions.
- Response protocol/exchange envelopes, generated identity prefixes and mechanically empty/null fields.
- Native standoff names, attribute arrays and a verbose object envelope around each semantic operation.
- A large instruction reference plus a large response schema describing much of the same language.
- Request-side diagnostic structure: repeated ownership/participant/Block identity, empty arrays, implementation feature switches and duplicated current text.

The recent recovery already stopped retransmitting the full contract on every tool round trip: [`providers.ts`](../../server/dialectic/providers.ts) uses a short response-scoped instruction after initialization; [`conversations.ts`](../../server/dialectic/conversations.ts) posts the stable developer message once. That reduces repeated insertion/transmission. It does not remove the retained contract from model context, and response schemas/tool definitions are still request parameters. A formal JSON schema already exists; absence of a schema was not the problem.

Previously measured initial input was 12,851 endpoint-counted tokens, including 8,764 developer-contract tokens and 2,275 response-schema tokens. The admitted two-sentence palimpsest response took 16.6 seconds; the recovery Leonardo attempt exhausted 4,096 output tokens and produced no admitted contribution. Its incomplete receipt includes 516 reasoning tokens. Those are historical measurements from the [recovery report](DCP_PERFORMANCE_RECOVERY_REPORT.md), not new tests. Removing visible syntax cannot guarantee the removal of reasoning tokens or provider latency.

## B. Equivalent format comparison

[Reproducible measurements and specimens](evidence/dcp-lightweight-authoring/README.md) use `js-tiktoken`'s `o200k_base` for every format. It is not a verified GPT-6.1 Sol billing tokenizer. The baseline is **minified current JSON**, so the comparison does not attribute pretty-print whitespace savings to XML.

| Saved response | Current JSON | Compact-intent JSON control | Restricted XML | Markdown/XML | YAML | S-expressions |
|---|---:|---:|---:|---:|---:|---:|
| Palimpsest, recovery A1 | 329 | 192 | **182** | 179 | 204 | 198 |
| Leonardo/Sforza, scholarly A | 2,703 | 1,567 | **1,489** | 1,480 | 1,769 | 1,760 |
| Mercury ambiguity, scholarly B | 1,975 | 1,123 | **1,062** | 1,047 | 1,260 | 1,225 |
| Leonardo identity reuse, scholarly C | 1,591 | 657 | **593** | 590 | 723 | 708 |

XML saves another **5.0–9.7%** over the compact JSON control. Markdown/XML saves only **3–15 tokens** over XML here. YAML and S-expressions remain viable, but offer no token advantage in these specimens. This is a four-case comparison, not a universal ranking or model benchmark. Different formatting choices change counts.

Every candidate retains the same prose and semantic payload. The Leonardo example keeps nine Entities, their descriptions and aliases, thirteen generated inline mentions, nineteen source interpretations/mentions, four explicit source anchors, an Argument, a Gloss and six directed Entity relationships. Reuse preserves existing identities rather than replacing them with new declarations. Mercury preserves ambiguous names and contextual pronouns exactly as authored; the comparison performs no automatic name expansion.

The failed recovery Leonardo output is excluded from complete-response comparisons. It is truncated and cannot be repaired into a supposedly equivalent valid baseline. The earlier scholarly Leonardo response has an admission and persistence receipt; palimpsest has admission evidence but no explicit save/reload flag in that artifact.

| Case | Plain contribution prose | XML tokens above prose | Current JSON tokens above prose |
|---|---:|---:|---:|
| Palimpsest | 56 | 126 | 273 |
| Leonardo | 139 | 1,350 | 2,564 |
| Mercury | 168 | 894 | 1,807 |
| Reuse | 111 | 482 | 1,480 |

“Above prose” includes useful semantic descriptions, repeated exact source quotations and Glosses, not just punctuation. Leonardo's Entity-definition/Gloss text alone measures 238 tokens separately. These isolated counts are not additive token accounting. Even after simplification, comprehensive semantic enrichment costs substantially more than an unannotated paragraph.

### Concrete examples and parser trade-offs

The [palimpsest specimens](evidence/dcp-lightweight-authoring/palimpsest.xml.txt) provide the smallest complete example; adjacent `current-json`, `markdown-xml`, `yaml` and `sexp` files contain exactly the same contribution. The [Leonardo XML](evidence/dcp-lightweight-authoring/leonardo.xml.txt) and [intent ledger](evidence/dcp-lightweight-authoring/leonardo.ledger.json) show the semantic-rich case.

| Format | Natural composition and structure | Validation, recovery and fidelity |
|---|---|---|
| Current JSON | Familiar structured output; prose/markup escaped inside strings. Existing schema carries substantial ceremony. | Existing strict provider schema, parser and repair. Native validation still necessary; truncation can invalidate everything. |
| Restricted XML | Familiar mixed content, typography and reference tags; explicit nested Blocks and separate definitions. | Reuse SAX infrastructure; enforce an allowlisted grammar and budgets. No implicit HTML repairs. Unclosed tags and unresolved names reject atomically. Native mapping is direct but not implemented. |
| Markdown/XML | Most familiar prose, lists/headings; same XML semantics. Labels and advanced structure need extensions. | Requires one precedence-aware parse, particularly around code, tables and XML islands. Existing Markdown import is not sufficient. Extra complexity is not justified by the measured small savings. |
| YAML | Concise named records; block scalars can preserve prose. The specimens retain inline XML for mixed annotations. | Existing YAML library; restrict tags, aliases, duplicate keys and implicit scalar coercion. Indentation and folded scalars can change text. It does not eliminate the inline parser. |
| S-expressions | Uniform nested structures; text must be quoted and interleaved with annotation forms. | Small deterministic data grammar, no evaluation. Escaping/parenthesis failures remain possible; no current DCP reader. Less familiar authoring is a hypothesis requiring a live test. |

For a hybrid, reuse the pure Lezer/GFM parser and `inlineMarkdownPlan`/`renderMarkdownPlan` in [`markdown-native.ts`](../../src/interchange/markdown-native.ts), including their offset mapping. Do **not** call [`markdown-input.ts`](../../src/runtime/markdown-input.ts): those are interactive editor commands that mutate content and selection. The separate [`markdown-import.ts`](../../src/interchange/markdown-import.ts) handles structural Markdown through an HTML-shaped tree but deliberately retains raw HTML as literal text; it will not interpret semantic XML correctly.

A sound hybrid would need an explicit grammar extension: fenced/inline code and escaped characters take precedence; XML semantic elements are recognized only in permitted inline positions; a terminal definitions block is recognized only outside code/literal contexts. Markdown inside an Entity span must preserve one exact decoded text/range mapping. Tables need escaped-pipe handling, and multiline XML cannot accidentally become a raw-HTML block. Nested structures, literal examples and crossing annotations cannot be resolved by splitting on `<definitions>` or regex substitution. The specimen generator's simple typography replacement is adequate for these fixed fixtures only, **not a proposed general hybrid parser**.

Do not salvage malformed semantics by dropping definitions or closing arbitrary tags. Preserve rejected raw output and return a compact typed repair diagnostic through the existing repair mechanism. No commit before a complete, valid response. No automatic schema fallback that changes meaning.

## C–D. Proposed language and measured contract

Use one `<response>` root as an explicit completeness boundary. Put content directly inside it; omit the redundant `<content>` wrapper. Optional `<definitions>` is last. Default intent is `reply`; nondefault intent and reply targets remain expressible. Empty definitions and unreferenced local IDs may be omitted. The measurements conservatively retain existing local object IDs.

The full proposed agent contract is in four short files:

| Component | Draft tokens | Target |
|---|---:|---:|
| [Authoring](evidence/dcp-lightweight-authoring/contract-authoring.txt) | 416 | 300–500 |
| [Grammar](evidence/dcp-lightweight-authoring/contract-grammar.txt) | 372 | 200–400 |
| [Example](evidence/dcp-lightweight-authoring/contract-examples.txt) | 232 | 150–300 |
| [Scholarly policy](evidence/dcp-lightweight-authoring/contract-scholarly.txt) | 162 | 100–200 |
| **Total** | **1,182** | **750–1,400** |

This is a new compact contract proposal, not a claim that all previous teaching examples remain verbatim. It preserves the scholarly requirements explicitly. Only the preferred format's complete instruction draft was measured; alternative-format instruction costs have not been qualified. Their response-token advantages must not be mistaken for proved total-request advantages.

Core construction:

```xml
<response>
<p><span id="p1"><e ref="@e1">Leonardo</e>'s <b>patronage</b> brought
<i>opportunity and dependence</i>.</span></p>
<definitions>
  <argument id="a1" target="p1"/>
  <gloss target="@b1" quote="Leonardo served Ludovico" kind="scope">Service alone does not establish every commission's terms.</gloss>
</definitions>
</response>
```

`@e1` and `@b1` must be issued in the current context. `p1` is a new passage identity; `a1` is an independent Argument. A passage is not an Entity or an Argument. Forward references to local definitions are allowed; duplicate, undefined or wrong-kind references are not.

### Normative rules behind the compact grammar

- Core structures are `p`, `h1`–`h6`, `ul`/`ol`/`li`, rectangular `table`/`tr`/`td` and `group`. Lists/cells contain Blocks; no implementation-specific native row/item DTOs. Reject invalid dimensions, children, starts or nesting using shared native preparation. Additional settings are capability-discovered.
- `b`, `i`, `e`, neutral `span`, and `mark` form mixed inline content. `mark` admits existing classifications: claim, question, speculation, suggestion, objection and qualification. There is no new `dialectic/interpretation` property; an explanatory interpretation can be an existing native Gloss with that label. A claim classification is not a native n-ary Claim.
- Definitions are Entity declarations, named passages, mentions, classifications, Arguments, Glosses and existing directed relationships. Entity description/aliases default empty; operation IDs are host-generated when unreferenced. Relationship kind distinguishes Entity from Argument endpoints; the current native endpoint/ownership rules and Argument relationship vocabulary remain authoritative.
- A universal target is either an existing/generated passage name, or a Block name with **one** of exact `quote` (optional immediate `prefix`/`suffix`) or `whole="true"`. Defaults are empty prefix/suffix. Earlier Block targets require complete current source authority. Contribution aliases can discover their constituent Blocks but cannot silently select the first matching Block.
- XML is case-sensitive; local IDs follow a bounded identifier grammar, e.g. `[A-Za-z][A-Za-z0-9_-]*`, and never start `@`. No namespaces, DTDs, custom entities, processing instructions, CDATA, comments or unknown attributes. Standard XML escapes/numeric references only; reject invalid Unicode and disallowed controls. Text decoding does not perform Unicode normalization.
- Ignore whitespace only between structural elements. Preserve every inline character, including whitespace and line breaks. Attribute selectors must encode tabs/newlines/CR as character references; preserve CR in text using the existing SAX preparation technique. Never pretty-indent mixed content after generation. Code is literal escaped text in its discovered native code construct, never parsed for annotations.
- No graph writes during parsing/resolution. Retain existing response, depth, node, annotation, definition and generated-descendant limits; count actual generated native descendants, not merely XML elements. No output-budget increase is assumed.

### Crossing annotations and literal content

Nested XML alone cannot express all standoff overlaps. A discovered extension should reuse existing boundary/range preparation. For example, boundaries `a,b,c,d` in `A | 😀é | Z` can define overlapping ranges `a→c` and `b→d`, then serve the same universal target operations. Each range stays inside one TextBlock. Scalar positions are respectively `[0,4)` and `[1,5)`; the combining accent remains its own Cell. Native inclusive ends are supplied by the host. No model offsets or silent Unicode normalization.

Neutral `<span>` needs a small extension to the current inline preparation: today anchors are associated with an annotation specification. Extract/extend that shared anchor emission so a neutral passage produces a range identity without fake bold/claim formatting. Boundary-defined neutral passages need the same hook. Do not add an independent annotation renderer or range model.

Literal `<e>`, Markdown asterisks, ampersands and quoted code must remain literal where authored as text. Unknown tags fail; they are never interpreted as HTML with browser error recovery.

### Actual capability gaps

| Intention | Existing native route / missing work |
|---|---|
| Entity, mention, classification, Argument, Gloss, Entity/Argument relationship | Existing DCP preparation and admission. Adapter can retain its semantics and strict authority. |
| Comment, question, suggestion, objection, qualification | Questions/etc use existing classifications; explanatory comments can explicitly be Glosses. No claim of threaded-comment support. |
| Native n-ary Claim/Trait, participant roles, qualifiers, evidence | [`feature-api/semantics.ts`](../../src/feature-api/semantics.ts) exposes canonical Vault services; [`application/semantic-services.ts`](../../src/application/semantic-services.ts) uses separate HTTP/SQLite transactions. DCP Document-owned Entities and admission lack a qualified bridge to those Vault identities and atomic writes. |
| Qualified or uncertain relationship | Current binary Entity relation projection has no general temporal/confidence/evidence contract. Do not drop qualifiers or promote uncertain prose to an unconditional edge. Preserve anchored prose/Gloss now; retain the native qualified-proposition objective as a separate dependency. |
| Distinct quotation structure | Markdown import currently retains blockquotes as paragraphs, with a warning. It is not a lossless native quotation factory. Ordinary quoted prose plus exact anchors works; a distinct quotation construct needs an explicitly agreed native mapping before advertisement. |
| Advanced existing composition/resources | Reuse qualified DCP preparation through discovered syntax; no new resource registry. Resource prerequisites and immutable-viewer rules remain unchanged. |

A future, **disabled** Claim syntax could use an independent claim ID, a universal evidence target, ordered participant elements (`ref`, `role`), and qualifier elements pointing to admitted Time/Concept identities. Claim expression, assessor/provenance, evidence and time scope must reach canonical fields. The language can accommodate this without enabling it prematurely. A confidence number or arbitrary XML attribute is not a substitute for the still-unqualified assessment contract. Stop for design review if transaction coordination requires substantial restructuring.

## E. Compilation and native fidelity

```mermaid
flowchart LR
    A[Bounded response text] --> B[Restricted parser and dialect validation]
    B --> C[Local symbols and current host authority]
    C --> D[Existing DCP preparation and shared native builders]
    D --> E[Canonical atomic admission]
```

The smallest adapter lowers the new surface into the **existing preparation input**, supplying the existing envelope, generated typed aliases, empty defaults and authorized handle/revision pairs internally. Native IDs remain host-generated. Do not persist the lowering representation as another document format. Introduce a negotiated dialect at the provider boundary; keep existing JSON for compatibility.

Reuse `markup.ts` for inline styles/entity references, `semantic-target.ts` for literal unique quote resolution and Unicode Cell boundaries, and `semantics.ts` for scoped definitions, mention grounding and ownership. Lists/tables/headings use current shared preparation; resource fragments remain host-private. Retain actor, selected participant, exchange, timestamps, source author and revision provenance. Validate aliases and resource/session/Vault revisions again before commit, including after asynchronous preparation.

Prepared semantics and Blocks enter the existing single contribution transaction. A failed reference, unsupported property or native invariant rejects the whole contribution. Undo/Redo, immutable submitted text, canonical definition ownership, persistence and resource rollback remain under current services. Source annotation enriches earlier content without rewriting its text.

**Fidelity evidence today:** saved baselines were admitted; three scholarly fixtures also have persistence receipts. Offline checks preserve decoded text, semantic record counts and selector bindings; XML parses with `saxes`, and YAML round-trips the intent ledger. No candidate compiler has been implemented or native-round-trip qualified. Hybrid and S-expression syntax have not been parsed back. This is a mapping investigation, not a completed protocol qualification.

## F. Compact current context and identity

The [proposed palimpsest request](evidence/dcp-lightweight-authoring/request-proposal.xml) is **167 local tokens**, compared with **1,091** for the saved provider user-message content (1,143 when the input array itself is JSON-serialized). It retains current text once, participant/chronology, text completeness/anchor eligibility, explicit partial workspace coverage, the empty-Document-Entity fact, capability profile and operational budgets. It omits host-private GUIDs/revisions, duplicate source text, empty object arrays and diagnostic coverage byte counters. Full diagnostics remain available locally.

This is a purposeful projection, not a lossless replacement for the diagnostic request. Empty Document Entities does not mean the Vault contains none. Partial workspace coverage never means unlisted identities do not exist.

Host-issued `@b1`, `@e1`, etc. are short labels. Keep their mapping with existing reference/context infrastructure, not a second semantic registry. The current exchange binding retains Document/session, native identity, occurrence/path, scope, revision, source completeness and the actual issued handle. A stable visible label is **not** lasting authority. Reissue/validate bindings each exchange; never reassign a label to a different object within a conversation generation. Reject foreign/stale bindings after Undo, import, source changes or session transfer. Reconstruction may issue a new label epoch and explicitly invalidate remembered labels.

A contribution ordinal alone is insufficient: one contribution can have multiple TextBlocks, repeated/transcluded occurrences, hidden Sides and different permitted sources. Use explicit Block/occurrence aliases. If several eligible passages match, ask the model for a narrower selector through existing repair/discovery rather than fuzzy matching.

Current tool arguments/results must use the same alias adapter; changing only response syntax would still expose long handles during discovery. Keep current bounded inventory/search/read operations. Do not reread complete authoritative text, or perform serial Entity name searches when the supplied workspace already identifies the Entity. Missing earlier content should trigger narrowed participant/chronology discovery.

For nonempty workspaces, project names/types/aliases/descriptions where meaningful; directed relationship endpoints, Argument targets, Gloss targets, source annotations and explicit coverage omissions remain visible. Preserve read-only Vault candidate scope and revision binding. Do not duplicate complete historical contributions each turn. This investigation measures only the small empty-workspace request projection; semantic-rich request savings remain unmeasured.

### Deterministic repeated mentions

The safe initial adapter should preserve explicit model-authored mentions. Mandatory new-Entity grounding remains enforced. A later explicit “annotate exact aliases in this scoped passage” intention could reuse existing matching/range preparation, but only with an authorized Entity, bounded eligible text, exact boundaries, no conflicting mention and no ambiguous alias assignment. A unique spelling in the workspace does not prove a unique referent in prose: “Mercury” and “May” are obvious counterexamples. Pronouns, possessives, metonymy and disputed identity stay model decisions. Never scan the whole vault or alter typing-path behaviour to save response tokens. No automatic repeated-mention savings are included in the measurements.

## G. Provider continuity and output transport

The retained A1 wire receipt shows successful creation of a provider conversation, a developer-message POST to its items endpoint, then a Responses call referencing that conversation with only the short top-level reminder. The admitted response demonstrates that the current endpoint accepted that arrangement. This is evidence of request handling, not proof of unlimited retention or instruction obedience. No fresh API call was made.

Current code uses `truncation: 'disabled'`; there is no demonstrated automatic compaction policy that guarantees contract retention. Preserve the contract digest/generation fence and reconstruct a conversation with one canonical contract when the protocol changes, the provider conversation disappears or native history diverges. After any future compaction, explicitly preserve/reinstall the contract and rebuild current authority from native records. Do not assume an old response-scoped `instructions` parameter becomes a retained developer message.

Append compact current-turn context, not another copy of the manual. Capability discovery may return a small, versioned syntax extension; its host allowlist and prerequisites must remain authoritative. Carry a compact active capability revision/delta so retained tool examples do not grant current authority. Never advertise 3D objects or the full Mutable vocabulary merely because renderers exist. Discovered instructions remain context and should not accumulate unbounded duplicate copies.

For XML, two provider transports merit a later small comparison:

1. Plain response text with strict host XML grammar/native validation. No JSON response schema, but provider-side JSON structural guarantees are lost.
2. A tiny strict JSON shell such as `{"dcp":"<response>…</response>"}`. It constrains the envelope, **not** the inner XML grammar, and introduces escaping overhead.

Do not claim that putting XML rules in a system message enforces them, or that moving a large schema into the prompt makes it free. Provider-specific grammar-constrained output, if considered, requires separate endpoint verification; it is not an assumed capability of the current adapter. A compact structured-JSON control remains valuable because it may retain more provider guarantees at a small response-token premium.

Caching and persistent conversations reduce transmission/reprocessing where supported; retained instructions, tool definitions, schema, history and reasoning still affect context/usage. Measure cache-read and reasoning receipt fields separately during any later live check. Existing measurements do not establish a new billed-cost or latency result.

## H–J. Performance limits, migration and bounded sequence

Local token accounting of the saved A1 request is: contract 8,760; serialized response-format object 3,536; tool definitions 612; user-message content 1,091 (serialized input array 1,143); response reminder 48. These local serialized counts differ from the historical endpoint breakdown and should not be mixed with it: provider schema processing and message framing are not equivalent to tokenizing local JSON.

A planning-only initial-input subtotal for the XML proposal is **2,009 local tokens**: 1,182 contract + 167 current request + 612 unchanged tools + 48 reminder. It excludes provider framing, retained history, capability extensions and any optional output wrapper. It is not an endpoint count. The 1,182-token contract remains in retained context on subsequent turns even when not retransmitted. The tools were not rewritten or qualified in this investigation.

At the output side, Leonardo's 1,489-token XML specimen leaves more room within a 4,096 budget than its current JSON representation. This does not guarantee that a model will generate that specimen, avoid extra commentary, or spend fewer reasoning tokens. The 3–5 second / 5–10 second usability targets remain unverified. Four compact specimens cannot establish everyday reliability.

Recommended reviewable sequence:

1. **Review the surface and boundaries.** Approve core XML plus short aliases, or retain compact JSON after considering its modest extra output cost. Explicitly defer unqualified Claim/assessment/quotation routes. Decide the output transport to compare; do not silently discard structured-output guarantees.
2. **One bounded adapter increment.** Add negotiated dialect selection, bounded parser, host alias resolver and lowering into existing preparation. Extend shared neutral range emission. Use existing capability catalogue, reference index and repair path. Keep legacy JSON provider mode and saved Symposia working; never rewrite historical contributions or retained raw diagnostics. Apply the project's feature-flag convention, with no existing default changed incidentally.
3. **Focused offline qualification.** Reuse these four saved cases plus one table/code/Unicode/overlap case. Assert native text/properties, distinct semantic identities, mention grounding, exact targets, ownership/provenance, rollback, Undo/Redo and save/reload. Exercise ambiguous/repeated quotations, stale/foreign handles, malformed tags, unknown capabilities and generated-descendant limits. Verify typing triggers no new scans/snapshots/persistence; compilation runs only on contribution preparation. No new test framework.
4. **Separately authorized small paid compatibility check.** After deterministic qualification, use GPT-6.1 Sol for one ordinary and one Leonardo/source-reuse exchange, with a capped total budget and one bounded repair if needed. Compare the chosen XML transport with compact JSON only if that decision remains open. Record actual provider input/output/reasoning/cache counts, tools, end-to-end latency and native semantic coverage. This is where authoring reliability and provider compatibility begin to be tested; a broad benchmark is unnecessary.
5. **Enable only after review of real outcomes.** Keep rollback to the existing JSON dialect. Expand existing advanced capability syntax as needed, not by teaching the entire native vocabulary in advance. Native Claims and assessments require their own shared authority/admission design; do not bundle that restructuring into the format recovery.

No paid calls are required to complete this investigation. They are required later to substantiate claims about the live model's compatibility, behaviour and speed. No new protocol, provider configuration or production behaviour was implemented here.
