# Restricted XML authoring — bounded adapter qualification

11 November 2026

Implemented `xml/1` as an alternative agent-facing DCP dialect. **Enabled by default at the user's subsequent request.** Set `dcpXmlAuthoring: false` in the editor feature configuration to restore JSON. Existing editor instances need an application reload to pick up the new default.

No paid provider calls were made. Live model compatibility, reliability and latency remain unqualified; default activation follows the user's explicit decision, not a claim that those checks have passed.

## Delivered

- [Provider-independent restricted parser/lowering](../../src/features/dialectic/dcp/xml-authoring.ts): one response root, optional terminal definitions, strict attributes/structure, bounded input and exact decoded text. Rejects DTDs, processing instructions, unknown constructs, duplicate/unresolved names and malformed XML. No HTML error correction or semantic salvage.
- [Exchange alias adapter](../../src/features/dialectic/dcp/xml-context.ts): short aliases for authorized sources and semantic identities, hidden handle/revision bindings, tool argument/result translation, existing bounded discovery, and explicit complete-read authority. Aliases include a short exchange discriminator; remembered aliases cannot silently refer to another turn's objects. Raw native handles are not accepted as XML references. Expired read-tool aliases use existing native source-recovery inventory.
- Shared inline preparation now supports neutral spans and boundary-defined overlapping passages. Neither creates a fabricated formatting/classification property. Unicode Cell boundaries, literal code and CR preservation use the existing native preparation conventions.
- Lowering produces existing DCP preparation input. Canonical definitions, annotations, native builders, source fences, immutable source text, atomic contribution admission, Undo/Redo and native persistence remain authoritative. No new native model, persistence layer or semantic registry.
- [Server-owned compact contract](../../src/features/dialectic/dcp/xml-contract.ts), compact current context and plain response text. OpenAI and Anthropic adapters omit the DCP JSON response schema in XML mode. JSON code, instructions and schemas remain available for rollback, but are not included in XML provider requests. Tool argument schemas remain necessary and are counted separately.
- Full native diagnostics remain host-side. Contribution diagnostics retain raw XML, dialect, issued alias bindings and the existing prepared native identity map. Existing provider continuity initializes the new contract once and uses its digest to distinguish it from the JSON contract.

The normal controller enables XML for live provider exchanges. The local mock and explicitly selected JSON path keep their existing format. No migration work was added for test Documents.

## Actual payload measurements

[Captured mocked provider invocations and measurements](evidence/dcp-xml-authoring/measurements.json) use the real request assembler, with the same settings and native source/context. Tokenizer: local `o200k_base`. These are comparative estimates, **not endpoint/billed token counts**. They exclude retained history, provider framing and reasoning.

| Component | JSON path | XML path |
|---|---:|---:|
| Initial instructions | 8,709 | **1,250** |
| Current user-message content | 1,014 | **516** |
| Serialized DCP response-format definition | 3,570 | **0** |
| Serialized tool definitions | 612 | **516** |
| Local component subtotal | 13,905 | **2,282** |
| Actual serialized request body, bytes | 67,462 | **10,915** |

The local subtotal falls approximately **84%**. Schema/tool serialization is not identical to a provider's internal token accounting; the subtotal is a reproducible engineering comparison. In persistent conversation mode, the initial contract remains model context even when not retransmitted. No zero-cost retention claim is made.

Equivalent saved responses, rebound to fresh native authority and successfully prepared through both paths:

| Fixture | Minified JSON | XML with exchange-scoped aliases |
|---|---:|---:|
| Palimpsest | 327 | 188 |
| Leonardo/Sforza | 2,704 | 1,622 |
| Mercury ambiguity | 2,002 | 1,127 |

Counts vary slightly with generated authority strings. XML values include the exchange discriminator omitted from the investigation's shortest illustrative aliases. The Leonardo preparation preserves nine Entities, six Entity relationships, an Argument, a Gloss and twenty native passage anchors, including anchors generated for declarative targets. Range-anchor infrastructure is not counted as twenty scholarly annotations.

The investigation's compact-intent JSON specimens remain an offline comparison control; this increment does not introduce another compact JSON wire dialect.

## Qualification

**204 distinct tests passed across eight focused files**, including 17 XML-specific tests. Client/server TypeScript checks passed. A stale pre-existing assertion about the removed provider-facing `authoring` object was corrected to tolerate its already-implemented omission.

Checks cover:

- Three saved-response native comparisons: exact text, property types/ranges, semantic definitions, directed endpoints, Entity-mention identities, Argument passages and source annotations. Fresh cross-agent Entity/passage reuse is tested separately.
- Neutral and crossing Unicode ranges, literal code/escaping/CR, source provenance and mandatory new-Entity mentions.
- Invalid/unknown syntax, unsupported Claims, ambiguous quotes, foreign/expired aliases, stale revisions, cross-Block boundaries, malformed tables and generated-descendant budgets. Rejected preparations produce no repository writes.
- Bounded inventory/read/recovery, complete-read requirements, projected semantic handles, capability availability and omission of unqualified XML routes.
- Real controller admission with mocked broker traffic, native save/decode round-trip, Undo/Redo and existing native ownership/protection/rollback regression coverage.
- JSON/provider-schema and continuity regression checks; mocked plain-text request/response handling for both providers. Unknown dialects reject explicitly.
- Bounded typing work: after an XML contribution, typing adds no provider calls, source reads, full repository snapshots or projection rebuilds. Parsing/preparation adds no typing subscriptions or background saves.

All network paths in provider qualification are mocked. There is no live-model result hidden behind these assertions.

## Grammar boundaries and deviations

Core: paragraphs, headings, nested bullet/ordered lists, ordered-list start, simple tables, groups, bold/italics, Entity mentions, neutral spans and existing passage classifications. Definitions support Entities, passages, mentions, classifications, Arguments, Glosses, existing directed relationships and neutral overlap ranges. Universal targets support passage references, whole Blocks and exact quotations with prefix/suffix.

Code and grids have compact discovery descriptions and shared native lowering. Other advanced native operations remain outside this bounded XML grammar and are not advertised as XML-authorable. They retain their existing JSON routes; there is no automatic dialect fallback. Task-list/configuration extensions, Surfaces, media/resource binding and the remaining advanced syntax are not silently approximated.

Specific clarifications:

- Short aliases are exchange-scoped, not durable conversational labels. Their discriminator prevents stale label reuse. Native identity remains durable and is reissued through current authority.
- Neutral overlaps use inline boundaries and a terminal `range` declaration. Native offsets are host-generated; boundaries must belong to the same TextBlock.
- Existing single-segment passage aliases support mentions/classification as well as Arguments/Glosses. Multi-segment Glosses retain the native path; multi-segment mention/classification targets require explicit per-Block targets rather than flattening.
- XML tags stay on one line; encode attribute newlines as character references. Inline whitespace is preserved; structural whitespace is ignored.
- Claim classifications remain classifications. Native n-ary Claims/Traits, qualified assessments, threaded comments and a distinct quotation Block were not added.
- The current-context projection remains compact JSON data within the provider user message; **the generated contribution language is XML**. This avoids an unnecessary second request parser. It carries neither the old manual nor the JSON contribution schema.

## Remaining small live check

With separate paid-call approval, run one ordinary reply and one Leonardo/source-reuse exchange on GPT-6.1 Sol, using a fixed total spend/output budget and the existing bounded repair setting. Verify actual plain-text endpoint acceptance, complete XML, native semantic admission, tool alias discovery and authoritative source reuse. Record actual input/output/reasoning/cache tokens, provider/tool calls and end-to-end latency.

Use compact JSON as a controlled comparison only if needed to decide reliability; do not restore its instructions/schema to XML requests. No broad benchmark or new authoring phase is required to perform that check.
