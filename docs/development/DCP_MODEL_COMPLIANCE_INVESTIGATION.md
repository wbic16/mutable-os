# DCP model compliance investigation

10 November 2026. **Investigation only: no production instructions, schemas, provider settings, persistence or admission behavior changed.** Evidence comprises implementation inspection, retained local diagnostics, 74 passing deterministic tests and six synthetic live scenarios. The opt-in experiment and synthetic results are linked below.

## 1. Executive summary

**The principal problem is native-authoring compliance inside an already schema-constrained DCP envelope—not absence of Structured Outputs.** The current integration uses the OpenAI Responses API with strict JSON Schema on every generation round. In the recent retained exchanges, displayed prose was carried by valid native paragraphs. A Markdown table was deliberately emitted inside a native code Block; it was not a host Markdown conversion. An apparent malformed DCP example was literal code content inside valid outer DCP JSON.

A subsequent real table failed a concrete native invariant: six content rows were accompanied by a header matrix covering only the first row. Its single repair repeated that defect. The model had enough schema information to construct a table, but important relational constraints were missing from the initial active instructions, and the repair diagnostic discarded the specific reason for rejection.

The controlled comparison supports both models' ability to produce DCP envelopes. GPT-5.4 completed all three native tasks. GPT-5.4 mini completed ordinary paragraphs, but failed table and complex native admission after repair. These are specific planning/markup/reference failures, not evidence that mini cannot support DCP. **The smallest useful correction is clearer existing-vocabulary guidance and actionable, typed repair diagnostics. A second protocol or intermediate document model is not justified.**

## 2. Current architecture

| Stage | Actual behavior and source |
|---|---|
| Request | `request()` builds the exchange, selected source manifest, legend, examples, budgets and vocabulary snapshot. `createDialecticController().askDcp()` adds the participant request and later performs atomic admission. [exchange.ts](../../src/features/dialectic/dcp/exchange.ts), [controller.ts](../../src/features/dialectic/controller.ts) |
| Instruction authority | `conversation()` combines the protocol key, authoring instructions, current-exchange identity rules and conversational cadence into Responses `instructions`. The request object is a JSON-encoded `role:user` input. There is no separate developer-message array. DCP is a mandatory output contract; “plain paragraphs” means paragraph content within that contract. [providers.ts](../../server/dialectic/providers.ts) |
| Constrained generation | `providerTurn()` calls `POST https://api.openai.com/v1/responses`, streaming, with `text.format.type:'json_schema'`, `strict:true`, `parallel_tool_calls:false`. Four strict tools are exposed when the catalogue is enabled: inventory, source reading, search and capability description. [provider-schema.ts](../../src/features/dialectic/dcp/provider-schema.ts), [provider-contract.ts](../../src/features/dialectic/dcp/provider-contract.ts) |
| Vocabulary | `resolveVocabulary()` intersects the chosen profile, feature gates and qualified native routes. `authoringSchema()` projects shared native parameters; `projectVocabulary()` filters this same schema. Recent requests used All Qualified: 21 composition kinds, including table/list/grid, headings/code/source, compounds, widgets and qualified media. Full formal shapes are supplied each round, while detailed purpose/configuration guidance is discovered through `describe_capabilities`. [vocabulary.ts](../../src/features/dialectic/dcp/vocabulary.ts), [vocabulary-schema.ts](../../src/features/dialectic/dcp/vocabulary-schema.ts), [capabilities.ts](../../src/features/dialectic/dcp/capabilities.ts) |
| History | Durable OpenAI Conversations receive attributed native-contribution JSON projections, plus provider exchange history. Instructions are resent on each generation. Historical handles are explicitly expired; fresh authority must come from current tools. History may contain earlier literal Markdown/code examples, which could influence content choice, but that causal effect was not measured. [continuity.ts](../../src/features/dialectic/continuity.ts), [conversations.ts](../../server/dialectic/conversations.ts) |
| Extraction | Streaming deltas are preview only. On completion, `providerTurn()` extracts `output_text` from completed message items, separately handles function calls, and rejects refusals, incomplete/truncated streams and unsupported output. It does not parse arbitrary prose into DCP. [providers.ts](../../server/dialectic/providers.ts) |
| Validation/admission | `prepare()` parses JSON, checks the envelope/exchange, vocabulary, unique typed declarations, restricted XML, source authority and native constraints. Shared native builders prepare owned structures. Only the complete successful result enters the canonical contribution transaction. No partial contribution or Markdown fallback is admitted. [exchange.ts](../../src/features/dialectic/dcp/exchange.ts), [markup.ts](../../src/features/dialectic/dcp/markup.ts), [sources.ts](../../src/features/dialectic/dcp/sources.ts) |
| Repair/errors | The client validates final output and permits one repair when enabled. Safe diagnostics cross the broker boundary; source-related repairs may retrieve fresh authority within existing budgets. A second rejection is terminal. Failures appear in the UI and retained diagnostic/provenance records. [live.ts](../../src/features/dialectic/dcp/live.ts), [diagnostics.ts](../../src/features/dialectic/dcp/diagnostics.ts), [broker.ts](../../server/dialectic/broker.ts) |

OpenAI documents that `instructions` takes priority over `input`; the current integration is not relying solely on a user-level protocol reminder. [Official text-generation guidance](https://developers.openai.com/api/docs/guides/text).

Production defaults are 2,048 output tokens, conversational cadence and one repair; the UI permits 512–8,192 tokens. GPT-5.4 mini receives explicit `reasoning.effort:'low'`; GPT-5.4 receives no reasoning override. Both currently document a default of `none`, so production configuration is **not equivalent** across these models. There is no model-specific vocabulary or alternative output mode. [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

Existing bounds include six tools, eight provider rounds, 120 seconds, 256 generated native Blocks and depth 12. Persistent conversation requests disable truncation and reject context-limit failures; there is no silent stateless retry. A small output ceiling can constrain complex work, but **the retained table failure completed well below 2,048 tokens**. Increasing its budget would not explain or repair the mismatched header matrix.

### Transmitted guidance versus available specification

The source contains richer legacy guidance than the active vocabulary path transmits. `request()` replaces the stage-specific instructions with `vocabularyInstructions()`. That function keeps extensive identity/discovery instructions but replaces the composition section with a short schema-oriented paragraph. It omits the concrete `<annotation type="style/bold">…</annotation>` and named-boundary examples, as well as Stage 2B's explicit header-matrix correspondence rule. The initial request has two semantic/addressing examples, neither a table or nested-layout example. [authoring.ts](../../src/features/dialectic/dcp/authoring.ts).

The capability catalogue correctly advertises a table's comparison purpose; its detailed descriptor states that headers must match and provides a 1×1 example. Models can obtain this through discovery, but neither the retained failing table exchange nor the synthetic mini table case called `describe_capabilities`. A 1×1 example also does little to illustrate non-header body rows.

There is guidance to use native operations for explicit structural work and to treat paragraph markup as restricted XML, not HTML/Markdown. However, “native composition is preferred” does not clearly prohibit substituting a Markdown/code illustration when the user requests an actual native structure. Unsupported operations should be explained within valid DCP; unknown semantics retained as inert compatibility data do not grant new capabilities.

## 3. Observed failures: evidence and limits

The retained run `2026-11-10T06-13-20-815Z-01720d38-f882-4b71-91d2-a4c8ba821ab4.jsonl`, under the active Cavern's `.mutable/dcp-test-phase`, records these exchanges at approximately 16:13–16:17 Brisbane time:

| Provider-turn sequence | Confirmed raw result | Classification |
|---|---|---|
| 26, 54, 82 | Valid DCP envelopes containing ordinary paragraphs; native admission succeeded. | Conversational prose is permitted. This is not unwrapped text bypassing DCP. |
| 110 | Valid DCP envelope with `kind:'code'`, `language:'text'`, containing a Markdown table. | Native-operation selection/instruction adherence failure; legal literal content, so no validation repair. |
| 138 | Valid envelope containing a paragraph and `language:'json'` code Block. The code text itself is invalid JSON, with an unescaped control character inside a string. | Malformed illustrative serialization inside literal code. It was never interpreted as the outer contribution. |
| 166, 171 | Initial 6×3 table, then repaired 6×2 table; each header matrix contains only one row. Both rejected. | Native configuration/structural-planning failure; repair lacked the actionable invariant. |

For all seven final outputs above, extracted `provider.turn.text` exactly matches the retained completed Responses message text. This rules out extraction corruption for these examples. Requests used strict `mutable_dcp` schemas; completion statuses were successful, not truncated. The retained request inventory contained only `gpt-5.4-mini`, including utility requests, so it does **not** establish the behavior of the user's earlier GPT-5.4 trials. GPT-5.4 was tested separately below.

The decisive table evidence, without conversation content:

```text
rows: six rows × three cells
configuration: {headers: [[true, true, true]]}
native error: Header configuration must match table cells
repair received: {code: "structure", path: "$.composition[0]",
  message: "Correct the invalid native structure while preserving valid requested structures."}
```

`prepareLayout()` requires either `configuration:null` or one Boolean per cell across **all** rows. The schema constrains Boolean arrays, but cannot express that cross-field length equality. `safeDiagnostic()` intentionally excludes arbitrary error text, yet currently loses the host-owned actionable reason too. [layout-authoring.ts](../../src/block-tree/layout-authoring.ts), [diagnostics.ts](../../src/features/dialectic/dcp/diagnostics.ts).

Transport/schema validity, native structural validity and task fulfillment are therefore separate. Valid DCP can contain irrelevant prose or literal code; the existing validator does not infer that a user intended a table and enforce that intent. No general natural-language intention validator is proposed here.

## 4. Controlled model comparison

One fresh synthetic Document per scenario/model, identical source content and prompts, All Qualified vocabulary, 2,048 output tokens, **low reasoning for both models**, strict existing schema, at most one repair. Provider memory was disabled (`store:false`) to isolate current instructions; the earlier AI-authored source remained discoverable through real DCP tools. The existing provider decoder, source service, native preparation and canonical transaction were used. This does not reproduce a long accumulated conversation or qualify every Block family.

| Scenario | GPT-5.4 | GPT-5.4 mini |
|---|---|---|
| A: ordinary question, three paragraphs, no DCP reminder | Three native paragraphs; admitted first attempt. | Three native paragraphs; admitted first attempt. |
| B: compare notes, spreadsheets and databases in a table | Native 4×3 table with matching full header matrix; admitted first attempt. | Native table chosen, but duplicate Block ID, HTML `<b>` markup and one-row header matrix. Repair fixed duplicate IDs, then failed unsupported markup; header defect also remained. No admission. |
| C: heading, grouped/nested list, bold text, highlight and Gloss on earlier AI source | Searched, read correct source, used exact anchor/current revision; heading/group/nested lists, bold range, original-source highlight and independent Gloss all admitted. | Inventoried and read correct source; produced relevant heading/group/nested lists and source anchor/Gloss declarations. Used numeric strings such as `from:"31",to:"43"` instead of declared boundary IDs, and initially HTML `<b>`. Repair still had missing boundaries; no admission. |

All eight final/repaired candidate responses were JSON DCP envelopes. There were **no unwrapped prose responses or outer-JSON serialization failures**. Mini's C failure was not an inability to retrieve the source: it selected the correct AI-authored TextBlock and copied its current handle/revision. Its first attempt highlighted reproduced text rather than the original source; the repair added an original-source interpretation but remained structurally invalid. Atomic rejection prevented partial source annotations.

GPT-5.4 showed coherent content, native selection, nesting, source reference and annotation execution in this sample. Mini showed coherent ordinary prose, useful structure selection and successful source retrieval, but unreliable authoring of markup/configuration dependencies under the current guidance. This **single sample per condition is diagnostic, not a reliability estimate or general model ranking**. Existing Core/General/Research profiles could be evaluated as opt-in model-facing choices later; this experiment does not justify automatically restricting mini or reducing DCP's underlying expressiveness.

Twelve provider rounds total, including four retrieval rounds and two repair rounds; 154,558 input and 6,425 output tokens reported. Approximate uncached standard-price total: **US$0.28**, not a billing receipt. No user conversation content or credentials appear in the report or synthetic evidence. [Model pricing: GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

[Synthetic results and exact candidate outputs](evidence/dcp-model-compliance/results.json) · [Opt-in reproducible probe](evidence/dcp-model-compliance/probe.test.ts). Run only when live testing is intended:

```sh
DCP_COMPLIANCE_LIVE=1 npx vitest run docs/development/evidence/dcp-model-compliance/probe.test.ts
```

It uses `OPENAI_API_KEY` from the environment or local `.env.local`, writes synthetic artifacts to `/tmp/dcp-model-compliance`, and performs no Document persistence or provider-conversation creation. Passing probe execution means results were collected—not that every model response complied. Separately, 74 existing provider, DCP validation, vocabulary and catalogue tests passed.

## 5. Structured Outputs feasibility

**Already implemented and working for the envelope and complete current curated vocabulary.** Both tested models officially support Structured Outputs. OpenAI supports recursive schemas, which the current `Node` union uses directly; no flattening of lists, tables or compounds is necessary. Required properties, closed objects, enums, nullable configuration and typed declaration patterns already constrain much of DCP. [Official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

The remaining limits are consequential: schema-valid strings can contain invalid restricted XML; IDs can repeat across distant objects; boundary references can name absent declarations; header dimensions can differ from rows; a source handle/revision can be stale or foreign; a perfectly valid code Block can fail the user's intended native operation. These require native/application checks or better model guidance. OpenAI explicitly notes that structured outputs can still contain mistakes. The existing canonical validation must remain authoritative.

There is no useful “unconstrained versus newly constrained” comparison to add here: the production baseline already has strict schemas. Disabling them would test a different, weaker integration. Narrowly tightening existing schema fields—for example, typed `new:pos…` patterns and descriptions for range endpoints—can rule out some demonstrated errors without reducing vocabulary, but cannot prove referential validity.

A typed intermediate representation already exists in substance: DCP's declarative JSON composition and semantic arrays are deterministically prepared into native operations. Adding another typed document representation would duplicate it. A structured replacement for free-form inline markup might eventually merit investigation if targeted guidance fails repeatedly, but is not the smallest correction and must preserve overlapping ranges and the full annotation vocabulary. No such protocol change is recommended now.

## 6. Prioritized recommendations

1. **Restore concise, selected-capability examples and invariant guidance in the active vocabulary path.** Show a small multirow table with `configuration:null` and a full header matrix; state that requested native structures must be authored, not demonstrated in Markdown/code unless the user requests literal examples. Restore valid `<annotation>` and named-boundary syntax; make clear that IDs are globally unique and range endpoints are names, not offsets. Reuse the existing schemas/catalogue and filter examples through the selected vocabulary. High expected benefit, small change.
2. **Make the existing single repair actionable.** Introduce allowlisted native diagnostic reasons for header-shape mismatch, duplicate declaration and invalid/missing boundary, including safe expected/actual counts where useful. Do not forward arbitrary provider/source text or increase retries. The generic error demonstrably wasted the table repair. High expected benefit, bounded change.
3. **Tighten existing schema descriptions/patterns where expressible.** In particular, range `from`/`to` fields should describe and constrain named generated boundaries. Preserve native validation and compatibility with existing stored contributions. This prevents some mistakes but cannot solve global uniqueness or cross-field dimensions.
4. **Make model settings and failure provenance easy to inspect.** Record requested and returned model, effective reasoning and token limit together; preserve raw candidate versus native rejection distinctions. Consider an explicit reasoning setting rather than a mini-only override. Do not raise budgets globally or introduce automatic model fallback based on this sample.

Do not add Structured Outputs a second time, flatten native content into Markdown, build a parallel protocol, relax validation, or implement broad task-expectation enforcement. Existing profiles remain available; their reliability should be demonstrated before assigning them automatically by model.

## 7. Proposed next step

Review one bounded **active authoring guidance and repair-diagnostic** increment covering table headers, valid inline markup/boundaries and declaration uniqueness. Keep the same vocabulary, native preparation/admission, source authority, persistence, immutability, retrieval limits and one-repair policy. Qualify with deterministic reproductions of these exact failures and at most a targeted repeat of B/C for the affected model. Schema endpoint tightening can accompany that increment if backward compatibility is explicit. No implementation of these recommendations has begun.
