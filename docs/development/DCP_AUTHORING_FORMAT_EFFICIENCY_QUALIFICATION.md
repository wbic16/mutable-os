# DCP authoring efficiency — first increment qualification

11 November 2026. **Accepted and complete.** Deterministic qualification and the requested live GPT-6.1 Sol endpoint smoke test passed.

## Delivered

- **Request deduplication:** the provider-facing user message omits only `protocolKey.text` and `authoring.instructions`. Their high-priority copies remain. The original diagnostic request, examples, workspace, source authority and task are preserved. Applies to both provider adapters.
- **Inline aliases:** `<b>`, `<i>` and `<e ref="…">` pass through the existing SAX/native standoff preparation path. General `<annotation>` remains valid. Typed passage IDs, nested marks, crossing boundary ranges, Unicode Cell offsets and native Entity references retain their meaning.
- **Small negotiated omission:** new controller exchanges advertise `authoring.emptySemanticFields:1`. The strict schema removes `suggestions`, `promotionRecommendations`, and semantic collections disabled by the vocabulary. One admission helper restores only missing guaranteed-empty arrays before existing validation. Supplied values are never discarded; existing validators retain their diagnostics.

Absent negotiation retains the previous schema and admission requirements. Unknown negotiation versions reject. Full historical envelopes remain admissible under the new mode. The marker and exact raw response are retained in contribution diagnostics. Enabled collections, paragraph/heading fields, declarative targets and native persistence are unchanged.

No `semantics` buckets, simple-node variants, editorial-policy rewrite, shortened semantic examples, conversation-continuity changes or native record migration were introduced. This is a bounded transport/parser refinement; no new Block or semantic authoring language was added.

## Request measurements

The actual provider assembly was captured with an injected offline fetcher. The controlled baseline reconstructs the former complete user projection using the **same current system, schema and settings**. It is not a claim about historical billed usage. After includes the new alias guidance and omission marker/instructions.

| Retained context | OpenAI wire bytes, before → after | Anthropic wire bytes, before → after | User-text local tokens, before → after |
|---|---:|---:|---:|
| Editorial general | 82,627 → 66,430 | 146,480 → 130,283 | 7,563 → 4,428 |
| Editorial core | 47,281 → 35,873 | 52,454 → 41,046 | 3,862 → 1,707 |
| Workspace N+2 | 90,099 → 71,111 | 152,904 → 133,916 | 8,820 → 5,186 |

Isolated deduplication saves **3,140 / 2,160 / 3,639** user-text tokens respectively. Accounting for the new guidance and marker, the sum of locally tokenized system and user text falls by **2,984 / 2,009 / 3,483** tokens. Schema tokens are separate: OpenAI general shrinks from 4,311 to 4,277; core from 1,614 to 1,422. Every remaining object property is still required and objects remain closed.

The limited response-field omission saves **47 bytes / 8 local tokens** in each measured general/workspace response. In the retained core fixture, where all six semantic collections are disabled, it saves **138 bytes / 29 tokens**. Enabled-but-unused arrays and nullable node fields remain present.

Token measurements use `js-tiktoken` / `o200k_base`, not character estimates. They are local encoding counts, not provider billing, cache accounting, model-specific context counts or measured latency improvements. [Full measurements](evidence/dcp-authoring-efficiency/qualification-measurements.json) and [reproduction script](evidence/dcp-authoring-efficiency/qualify-measure.mjs) accompany the report.

## Representative syntax

These pairs now produce equivalent native annotations:

```xml
<annotation type="style/bold">Evidence</annotation>
<b>Evidence</b>

<annotation type="style/italics" id="new:s1">context</annotation>
<i id="new:s1">context</i>

<annotation type="mutable/entity-reference" ref="new:e1">Authenticity</annotation>
<e ref="new:e1">Authenticity</e>
```

`new:e1` must be declared in the response; an existing Entity requires a current issued handle. An alias's `id` can still target an independent Gloss. Alias names do not confer new permissions. Conflicting `type`, unexpected attributes, missing Entity refs, malformed nesting, duplicate IDs and empty spans reject. Literal XML-like text still requires escaping.

## Qualification

**115 distinct focused checks passed**, with targeted reruns after corrections, plus `npm run typecheck` and `git diff --check`:

- Provider assembly, continuation and repair: exactly one authoritative copy of each instruction string; original request unchanged; examples/workspace/source revisions preserved; unknown format versions rejected.
- Both providers and all vocabulary profiles: only eligible root fields removed; strict required/closed-object invariants and references valid; existing node/target schemas unchanged.
- SAX/native equivalence: nested aliases, mixed general tags, overlap boundaries, Unicode, passage aliases, Entity creation/mentions and independent Gloss targets.
- Current Entity handles accepted; historical and foreign handles rejected. Disabled annotations and nonempty disabled operations still reject.
- Real controller path: omitted fields admitted atomically, raw response/full request retained, Undo/Redo, native encode/decode round-trip, and invalid mixed content rejected without partial insertion.
- Existing editorial/workspace compatibility, broker checks and bounded-work regressions: no new snapshots, projection rebuilds or per-keystroke retrieval/workspace work.

The qualification uses existing native fixtures. No live model benchmark, browser performance experiment, user Document mutation or development-server restart was performed.

## Live endpoint smoke test — passed

After implementation acceptance, one explicitly requested GPT-6.1 Sol call exercised the revised strict schema in a synthetic Document. The endpoint returned **HTTP 200**, model `gpt-6.1-sol`, status `completed`, with no tool calls, retries or repair. Provider usage: **12,186 input / 164 output tokens**; provider interval **4.671 seconds**. No retained provider conversation was used (`store:false`).

The raw response contained:

```xml
<e ref="new:e1">Provenance</e> <b>supports</b> <i>careful</i> interpretation.
```

The response declared the `Provenance` Entity and omitted all four fields excluded by this request's negotiated vocabulary/schema: `suggestions`, `promotionRecommendations`, `arguments`, and `relations`. The first two are invariant-empty; the latter two were vocabulary-disabled. Enabled semantic collections and the normal paragraph fields remained present.

Existing native preparation and the canonical bounded transaction successfully committed the response. Inspection of the committed TextBlock confirmed:

| Native standoff type | Text | Inclusive Cell range |
|---|---|---:|
| `mutable/entity-reference` | Provenance | 0–9 |
| `style/bold` | supports | 11–18 |
| `style/italics` | careful | 20–26 |

The Entity-reference property points to the newly committed native Entity definition. The test checked repository content after admission, not merely the parsed provider JSON. Aliases were explicitly requested, so this establishes endpoint/native compatibility, not spontaneous semantic behaviour.

[Retained request, wire schema, raw response, provider receipt and native results](evidence/dcp-authoring-efficiency/live-smoke.json) · [Opt-in single-call test](evidence/dcp-authoring-efficiency/live-smoke.test.ts) · [Run log](evidence/dcp-authoring-efficiency/live-smoke-checks.txt).

The efficiency increment is now closed. DCP Proactive Semantic Authoring remains deferred pending its separate investigative brief.

## Remaining limitations

Live endpoint acceptance is confirmed for this GPT-6.1 Sol request; Anthropic remains deterministically qualified only. No behavioural comparison was run. More Entity mentions, spontaneous Glosses, lower repair frequency and latency/billing improvements remain unproven. Existing provider conversation history retains its earlier request copies; continuity was deliberately left intact.

Complete-envelope teaching examples remain unchanged. A short negotiation instruction explains which guaranteed-empty fields to omit when following the current schema. Larger output reductions from semantic buckets, simple paragraph/heading branches or arbitrary optional fields remain deferred for a later controlled comparison.
