# DCP-native editorial authoring qualification

**Status: accepted by the user.** This implementation phase is closed. Further editorial evaluation will take place through ordinary Dialectic conversations; no additional prompt restructuring or expanded testing is requested.

Retained findings for future attention, with no immediate work authorized:

1. GPT-5.4 Mini failed to retrieve and ground its response in an earlier human contribution. This is a conversational-grounding issue, not a DCP serialization failure.
2. The broker accepts client-supplied high-priority instruction text. A future correction should use server-derived or server-verified canonical instructions.

Neither finding starts another implementation phase unless the user requests it.

11 November 2026 — focused instruction/example refinement implemented. GPT-5.4 remains the default. The principal model demonstrated the intended behaviour in a small synthetic exercise; Mini still missed source retrieval in one case. Structural validity is not evidence of editorial or grounding success.

## Changes and instruction order

- `src/features/dialectic/dcp/editorial-policy.ts`: exports the supplied policy verbatim, independent of vocabulary version. SHA-256 of the policy text: `413f20e88cd3120a798305c9b00c02156aa4107a2ee93e79ac18e27fcdcaa763`.
- `server/dialectic/providers.ts`: assembles **exchange authority → core protocol → editorial policy → negotiated authoring grammar/vocabulary → source discovery/recovery → final response requirements and cadence**. Both cadence replacements use the supplied text. The separate title utility remains separate.
- `src/features/dialectic/dcp/exchange.ts`: replaces the minimal-prose default with the supplied rich-medium contract; preserves protocol versions, profile restrictions, default reply intent and vocabulary negotiation. Projects example configuration fields through the existing stage gates.
- `src/features/dialectic/dcp/authoring.ts`: adds the supplied typography and capability-gated behavioural sections, retaining technical identity, source and relationship guidance. Adds six complete editorial examples using the existing envelope pattern: rich prose, comparison, Gloss, source objection, directed Arguments and restraint. Existing source examples remain available in the exported collection.
- `src/features/dialectic/dcp/capabilities.ts`: supplies complete source/Argument/Gloss illustrations on single-capability discovery. Optional illustrations are dropped before parameter information when space is insufficient. The four-ID/8,192-byte discovery limits are unchanged. Reuses the layout-default helper for initial and catalogue examples.

Initial requests contain at most four examples: rich prose, comparison, Gloss and restraint, filtered through the negotiated vocabulary. The source-objection and Argument examples are available on demand, rather than included in every request. Illustrative source handles/revisions are explicitly labelled and must be replaced by issued authority. Table examples use null configuration when that field is negotiated; header configuration, when used, must match the complete table.

This refines existing DCP behaviour; existing feature flags and defaults are unchanged. No editor typing hook, background annotation, extra planning call, registry, schema, wire version, budget or repair-loop change was introduced.

## Actual outgoing prompt

[Full assembled OpenAI instructions](evidence/dcp-editorial-authoring/system-prompt.txt) are the exact `instructions` value captured immediately before the real GPT-5.4 scenario A request at **2026-11-10T23:33:13.094Z** (11 November, 09:33 Brisbane), not a reconstructed source listing. Size: **25,067 UTF-8 bytes**. The supplied policy was compared verbatim against both its source constant and this outgoing value.

The prompt is exchange-specific. Complete example envelopes, the legend and capability summary also travel in the request input; the strict JSON Schema and tools travel in their existing separate fields. [Retained generated responses and receipts](evidence/dcp-editorial-authoring/results.json) show the actual DCP outputs. Source handles in these artifacts belong only to synthetic, expired exchanges.

Native `style/bold`, **`style/italics`** and `reference/url` were verified against registered types and native preparation. Styling needs no semantic identity. Negotiation remains authoritative: disabled operations are filtered from examples, detailed guidance and schema, then checked again during native admission.

## Qualification

**107 deterministic tests passed**, covering providers, broker, continuity, vocabulary, catalogue, identities, core DCP and the new editorial fixtures. The eight opt-in live cases correctly skip during ordinary test runs. `npm run typecheck` passed.

New checks cover required envelope/node fields, all six examples through real native preparation, bold/italics, hyperlinks, table descendants, Gloss aliases, directed Argument endpoints, and fresh discovery/read/anchor/classification of human text. The additive classification retains `actor: ai`, `sourceAuthor: human` and the AI participant identity. A canonical transaction test confirms the original human text is unchanged. Preparation emits no repository changes. Restricted vocabulary leaves only the plain acknowledgement example. Actual outgoing OpenAI and Anthropic request tests verify policy order and retention through continuation and repair, with fresh vocabulary on subsequent exchanges.

Existing strict schema and native validators support the requested combinations; **no schema defect requiring a change was found**. Markup strings, exact selectors, cross-field layout dimensions, endpoint ownership and semantic usefulness are not fully expressible in this JSON Schema. Native validation remains responsible for those structural/authority invariants; editorial judgment remains a model responsibility. A valid but ungrounded prose answer does not trigger repair.

### Small live exercise

[Opt-in probe](evidence/dcp-editorial-authoring/probe.test.ts), adapted from the existing compliance fixture, used synthetic Documents only. Four scenarios per model; production settings: 2,048 output tokens, conversational cadence, GPT-5.4 default reasoning and the existing Mini `low` override. No provider Conversations were created. Ten provider rounds total, including two retrieval rounds; **all eight final responses admitted without repair**. Usage: 141,581 input and 3,071 output tokens. This is a spot check, not a reliability estimate or controlled before/after benchmark.

| Scenario | GPT-5.4 | GPT-5.4 Mini |
|---|---|---|
| Substantive museum explanation; ambiguous “authentic” | Native bold/italics and an unsolicited, relevant Gloss. The Gloss adds a modest distinction between evidential identity and apparent age. | Native bold and a useful inline explanation; no Gloss. Inline clarification is a legitimate editorial choice. |
| Compare collection-recording approaches; no table instruction | Native table, correct complete header matrix, concise recommendation. | Native table with valid null configuration; useful concise comparison. |
| Revisit an earlier human assertion; no annotation instruction | Inventory narrowed from contribution ordinal 1, then `read_source`; exact source anchor, source-directed reply and additive AI claim classification. Substantive objection explains why colour cannot prove antiquity. | **Grounding failure:** no retrieval, anchor or interpretation. Guessed a tentative response from the current request, missing the actual earlier assertion's universal claim. Valid DCP did not make this a successful source response. |
| Casual Saturday planning; paragraph-only vocabulary | Brief acknowledgement with one bold phrase; no semantics or elaborate structure. The emphasis is optional rather than necessary. | Plain response without semantics, but largely echoes the user; restrained, with weak conversational added value. |

Directed Argument authoring and hyperlinks were qualified deterministically, not observed in these live responses. No broad benchmark or additional model tuning was performed. GPT-5.4 is the better supported default from this sample; Mini's source-grounding failure remains a limitation. Policy guidance cannot guarantee appropriate expressive choices on every response.

## Continuity and trust-boundary review

Initial requests reconstruct the system string from the current exchange and frozen vocabulary. Tool continuation appends guidance without replacing the policy. Repair adds a bounded user correction; it neither replaces the system instructions nor expands the single-repair limit. Broker continuity appends fresh-authority guidance. Persistent Responses transport and vocabulary-change tests pass; the live exercise was stateless, so it does not independently qualify live hosted-history behaviour.

**Separate concern:** `broker.ts` accepts client-supplied `protocolKey.text` and `authoring.instructions` into high-priority instructions. Existing session/origin and size checks do not establish that these strings are the canonical application contract. The new server-owned policy does not make arbitrary client instruction strings trustworthy. Minimal future correction: derive protocol and authoring text on the server from validated versions and vocabulary, or verify supplied text against those canonical derivations. No unrelated security refactor was made here. Native admission and source authority remain the final enforcement boundary.
