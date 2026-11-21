# DCP performance recovery — investigation and bounded fixes

**Status: not recovered sufficiently for everyday conversation.** The implementation removes confirmed defects and avoidable retrieval, but the live historical question still failed at 4,096 tokens. A smaller developer-contract candidate cuts measured initial input by 58%; it is a review artifact, not enabled production guidance. Further paid qualification stopped after two generations in response to the user's token-cost concern.

Evidence is in [dcp-performance-recovery](evidence/dcp-performance-recovery/). No user Document was changed. Existing scholarly-authoring work was preserved. These are bounded fixes to existing services, not a new authoring pipeline.

## Confirmed causes

- **2,048 was the actual configured limit.** The failed exchange `a87f3d67-cb32-4715-bfc5-0c193770d89b` sent four `/v1/responses` requests, each with `max_output_tokens:2048`. The retained settings log contains two accepted 2,048 configurations and no 16,000 submission. Both browser and broker capped settings at 8,192, so 16,000 could not take effect. Reload also forgot the prior nonsecret settings. Evidence does not establish exactly which UI interaction the user attempted.
- **The failure was output exhaustion, not credit exhaustion.** Its final raw SSE receipt says `incomplete_details.reason:max_output_tokens`, output 2,048, reasoning 0. Its preceding source-reading round used 239 reasoning tokens. Another earlier failure included 310 reasoning tokens. Reasoning can consume the output allowance; it was not the final-round cause in the attached failure.
- **Retained conversation was used, but retained too much protocol material.** Healthy continuations sent only new tool results, not the whole native transcript again. However, each large DCP user/control message became retained history alongside ordinary contributions. Reading the remote conversation items verified this directly. Top-level instructions were not stored as duplicate developer messages; they were supplied again on each request, with another continuation paragraph appended each time. The changing exchange identifier at the start of those instructions also disrupted the stable prefix. All four failed-request receipts reported zero cached input.
- **Three retrieval calls were unnecessary.** Two Entity searches queried an empty Document index. A source read fetched the same complete, current 311-character TextBlock already supplied with exact-anchor eligibility. Those calls made the exchange consume 63,245 input tokens in aggregate.
- **The default vocabulary remained All Qualified.** Its provider request included 21 composition kinds, including object3d, timer and canvas-preview, and 17 standoff types. This was the Stage A compatibility default, rather than the intended ordinary conversational selection.
- **Failure diagnostics hid useful evidence.** The adapter threw away incomplete-response usage and nested reasoning/cache counts. The new live exercise also hit the fixed 1 MiB SSE transport limit before receiving the final receipt. A read-only GET of the retained response established that this generation ultimately exhausted its 4,096-token allowance too.

## Implemented

1. Initialise one high-priority developer contract through the existing OpenAI conversation service. Static guidance, examples and compact capability descriptions no longer accumulate in every user/control message. Contract changes are fingerprinted and trigger the existing native-history reconstruction path. Stateless and older-client paths retain their instructions. Strict structured output remains active on every response.
2. Select General for ordinary Dialectic: 14 composition kinds and 13 curated standoff types. Specialist widgets, retained-resource constructors, pages and literal-source authoring are not in this default. Entity, Argument, relationship, Gloss and source-annotation operations remain available. All Qualified remains an explicit compatibility selection; reading richer native content remains independent.
3. Explain that complete current sources and supplied workspace identities need no duplicate retrieval. Report an empty Document definition index explicitly, without treating a nonempty partial workspace as complete.
4. Accept limits from 512–16,384; use 4,096 as the new-session default. Show the active model/budget and unapplied changes. Persist only accepted nonsecret preferences; credentials and session tokens remain session-only.
5. Preserve incomplete usage, reason, response ID, reasoning, cache-read and cache-write counts. Scale the bounded SSE transport allowance with the configured output budget while leaving native payload, retrieval and atomic-admission limits intact. Partial responses still commit nothing; there is no automatic paid retry.

## Actual live results

Same model: GPT-6.1 Sol. A and B used isolated synthetic native Documents, the real provider adapter and retained-conversation service, current source authority, canonical admission and native serialization. Timings include context assembly and continuity work, but are **not browser interaction measurements**. The older field failure and current synthetic exercise are not a controlled A/B benchmark; the current exercise also retains the expanded scholarly policy.

| Scenario | Provider calls / tools | Input tokens | Output tokens | Elapsed | Outcome |
|---|---:|---:|---:|---:|---|
| Earlier Leonardo/Sforza field failure | 4 / 3 | 63,245 | 2,388 across rounds | 48.7 s | Failed; final limit 2,048 |
| A: two-sentence palimpsest explanation | 1 / 0 | 12,929 | 548, including 208 reasoning | 16.6 s | Native contribution admitted |
| B: same Leonardo/Sforza question | 1 / 0 | 13,090 | 4,096, including 516 reasoning | 61.1 s to transport failure | Retained receipt confirms output-limit failure |
| C: ten-contribution Symposium | — | — | — | — | Not completed; stopped after B failed |

B removed the redundant retrieval calls and reduced aggregate input by 79.3%, but produced **no contribution**. Of its input, 11,636 tokens were cached. Caching benefits must not be confused with reducing total tokens or achieving a usable response.

A used 12.0 s in the provider adapter, 4.0 s in initial continuity setup, 77 ms assembling context, 69 ms preparing/admitting native content and 40 ms serializing/writing/decoding the isolated native file. The local native work is not the dominant bottleneck. A created one Entity, two generated mentions and a source-directed mention, with native bold text. B's incomplete text contains 13 Entity declarations and substantial prose; none was admitted. Its incomplete ranges also contain numeric strings where boundary identities are required, so completion alone would not establish native validity.

The two generations consumed **26,019 input + 4,644 output = 30,663 tokens**. Counting endpoints and read-only receipt retrieval generated no additional answers. No claim is made about the entire account's reported 8,420,344 tokens; this investigation examined the retained local exchanges.

## Gemini analysis and schema separation

The attached analysis is useful, but Structured Outputs is already implemented. [provider-schema.ts](../../src/features/dialectic/dcp/provider-schema.ts) builds the formal JSON Schema from shared native operations and the selected vocabulary; [providers.ts](../../server/dialectic/providers.ts) sends it using `text.format` with `strict:true`. `response_format` is the Chat Completions spelling. Schema enforcement does not prevent truncation or establish source authority, ownership, valid embedded XML or semantic correctness. Native validation must remain. See [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

The useful split is:

- **Developer contract:** concise behaviour, meaning, identity/source authority, immutability and the embedded markup rules that JSON Schema cannot express.
- **Response schema:** the formal envelope, fields, recursive structures, allowed configuration and declaration patterns. Do not repeat this schema in the developer prompt.
- **Current exchange input:** the participant request, fresh source authority and semantic workspace. No repeated protocol handbook.
- **Capability discovery:** detailed native purposes, parameters and examples when needed, using existing tools.

Being encoded in JSON does not remove token cost. Caching reuses a stable prefix and changes processing/billing, not total context size. Current pricing and caching behaviour are model-specific; Gemini's blanket percentage claims are not a qualification result. The revised live receipt demonstrates a cache hit. See [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching). Fine-tuning is not proposed: it would not remove native validation or automatically guarantee this contract.

The token-count endpoint gives these marginal component costs for A's assembled input:

| Component | Tokens |
|---|---:|
| Initial developer contract, including authoring reference | 8,764 |
| Of that contract: authoring reference/examples/descriptions | 1,971 |
| Strict response schema | 2,275 |
| Tool definitions | 468 |
| Native history item | 195 |
| Current exchange, short instruction and remaining message overhead | 1,149 |
| Total | **12,851** |

The endpoint count differs from the actual generation receipt's 12,929; use receipts for reported usage. No assumption is made that locally tokenizing schema JSON equals its model-visible cost.

[contract-candidate.txt](evidence/dcp-performance-recovery/contract-candidate.txt) is a concrete **unimplemented** replacement for repeated prose, together with a compact enabled-capability/standoff allowlist. Keeping A's actual strict schema, tools, current input and history unchanged, the token-count endpoint reports **5,343**, a **58.4% reduction** from 12,851. This is input-size evidence only: semantic equivalence, latency and completion are not yet qualified. It removes full-envelope examples and repeated structural explanations; that trade-off needs a short model check before adoption.

B also spent approximately 749 local-token equivalents on removable JSON layout whitespace: 3,570 versus 2,821 visible tokens for the incomplete response. This uses o200k_base, not claimed Sol billing. The candidate asks for compact JSON. Output minification alone cannot guarantee that a substantive semantic response will fit or meet the latency target.

## Qualification and recommendation

Focused adapter, broker, continuity, vocabulary, workspace, settings and scholarly tests pass. The integration suite also passes native admission, ownership, rollback, Undo/Redo, persistence and bounded typing checks; specialist-family fixtures now explicitly select All Qualified. Typechecking passes. No typing-path service, repository scan, snapshot or persistence work was added. The SSE correction was tested deterministically after the live failure; it was not followed by another paid generation.

**Do not accept this as conversational recovery yet.** A misses the 3–5 s target; B still fails. The next bounded step is to review and qualify the compact developer contract against the unchanged formal response schema, using one ordinary reply and the historical question. Only after those complete economically should the ten-contribution test resume. If roughly 5.3k initial input tokens remain unacceptable, reduce the everyday response-schema surface or negotiate a more compact authoring projection before further live testing. That is a separate, reviewable design decision; do not solve it by dropping scholarly semantics, weakening admission, adding a multi-stage pipeline, or escalating output budgets indefinitely.
