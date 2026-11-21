# DCP Authoring-Format Efficiency and Simplification

Investigation completed 11 November 2026. **For review; no production implementation.**

## 1. Executive finding

Yes: DCP can become appreciably more economical without changing its native semantic model. The useful changes are additive markup aliases, a bounded authoring projection for default-free responses, and removal of instructions duplicated in the provider's user-message payload.

The measured response redundancy is real, but **OpenAI strict output cannot simply make declared properties optional**. For the three retained Symposia, removing the candidate default fields and introducing `<b>`, `<i>` and `<e>` would reduce locally tokenized response size by **17.7–24.6%**. This is a counterfactual encoding measurement, not a demonstrated provider result. A feasible strict projection using existing semantic collection names and simple paragraph variants achieves **14.8–23.9%**, with some additional schema complexity.

The largest immediate input opportunity is exact duplication: `protocolKey.text` and `authoring.instructions` appear in both high-priority instructions and the serialized user request. Removing only their user-request copies saves **3,140 tokens** in the editorial general-vocabulary fixture and **3,639 tokens** in workspace-enabled requests. Keep the authoritative instruction copy and all semantic examples. This does not require a new semantic protocol or native admission path.

Long conversations amplify that duplication. Actual provider input usage grows from 15,806 to 87,946 tokens in authenticity, and from 17,289 to 114,950 in GPT-6.1 Sol's Theseus conversation. These are observed usage counts, not the size of the latest request alone. Historical request snapshots are retained as conversation messages. The workspace is useful context, not the principal cause of the initial 16,000-token input.

Recommendation: retain strict output; implement the small compatibility and duplication improvements first after review. Treat the compact strict response profile as a separate, bounded increment. Do not compress identities, remove semantic teaching examples, or redesign conversation memory.

## 2. Measured baseline

### Evidence and method

The measurement covers **41 admitted responses: 107,728 minified UTF-8 bytes and 25,309 local tokens**. Sources:

| Corpus | Retained source | Admitted responses |
|---|---|---:|
| GPT-5.4 authenticity | `vaults/imported/Conversation on November 11, 2026.ink` | 9 |
| GPT-5.4 Ship of Theseus | Same folder, `Conversation on November 11, 2026 (2).ink` | 8 |
| GPT-6.1 Sol Ship of Theseus | Same folder, `Conversation on November 11, 2026 (3).ink` | 9 |
| Semantic Workspace qualification | `evidence/dcp-semantic-workspace/exchange-{1,2,3}.json` | 3 |
| Editorial qualification | `/tmp/dcp-editorial-authoring/gpt-*.json`; durable summary in `evidence/dcp-editorial-authoring/results.json` | 8 |
| Provider compliance qualification | `/tmp/dcp-model-compliance/gpt-*.json`; durable summary in `evidence/dcp-model-compliance/results.json` | 4 |

The two rejected Mini compliance cases were inspected separately; they are not silently included as valid output. The retained admission errors are unsupported markup and missing/reversed/empty range boundaries. No requested Symposium is missing. No genuinely Gloss-rich, multiple-Gloss admitted response was found in these sets: the editorial A response supplies one meaningful Gloss. There are real Entity-rich, Argument-bearing and table-rich responses.

[Measurements and source hashes](evidence/dcp-authoring-efficiency/measurements.json) retain per-response breakdowns, provider usage and local request components. [The read-only measurement script](evidence/dcp-authoring-efficiency/measure.mjs) uses `js-tiktoken`'s **o200k_base** encoding. These are actual tokenizer computations, not character-count estimates. They remain local estimates for the particular provider/model; they are not an assertion that GPT-6.1 or Anthropic internally uses that encoding. The observed provider output counts are usually nine tokens above the visible final JSON's local count in this corpus; this is evidence to keep the two measures separate, not a universal correction factor.

Raw provider strings and minified JSON are measured separately. Component byte attribution uses ordered subtraction: empty semantic arrays, nested defaults, envelope, remaining semantic payloads, markup tags, composition text, remaining structure. Its byte totals exactly reconcile. Token subtraction in the same order also reconciles, but token boundaries make attribution order-dependent. Independently tokenized request components are **not additive billing categories**. Handles are an overlapping diagnostic, not another row to add to the partition.

### Output baseline and counterfactual savings

All token counts in this table are local. Defaults means empty semantic collections; empty `ranges`, `aliases`, `attributes`; absent-style/configuration nulls; optional reference nulls; and generated-target revision nulls. It does not mean indiscriminately deleting every null or false value. Envelope and identities are retained in the savings experiment.

| Corpus | Current bytes / tokens | Default removal: tokens saved | Aliases: tokens saved | Combined tokens saved | Combined share |
|---|---:|---:|---:|---:|---:|
| Authenticity | 33,088 / 7,653 | 1,481 | 399 | 1,880 | 24.6% |
| Theseus, GPT-5.4 | 23,912 / 5,669 | 975 | 349 | 1,324 | 23.4% |
| Theseus, GPT-6.1 Sol | 26,969 / 6,169 | 828 | 263 | 1,091 | 17.7% |
| Workspace qualification | 6,606 / 1,549 | 211 | 85 | 296 | 19.1% |
| Editorial qualification | 10,438 / 2,587 | 672 | 69 | 741 | 28.6% |
| Admitted compliance fixtures | 6,715 / 1,682 | 437 | 0 | 437 | 26.0% |

Total candidate savings: **25,882 bytes / 5,769 local tokens, 22.8% of response tokens**. These omission savings are not available under the unchanged OpenAI schema; §7 measures a strict alternative.

Representative responses:

| Actual response | Bytes / local tokens | Empty arrays / nulls | Defaults + aliases saved | Actual final provider input / output tokens |
|---|---:|---:|---:|---:|
| Editorial D, short social reply | 459 / 113 | 10 / 2 | 220 B / 47 tokens | 8,892 / 122 |
| Editorial A, one Gloss | 1,522 / 345 | 9 / 4 | 292 B / 62 tokens | 15,258 / 354 |
| Editorial B, comparison table | 2,735 / 694 | 21 / 26 | 862 B / 224 tokens | 15,259 / 703 |
| Workspace N+1, four Entities and three relations | 2,228 / 520 | 12 / 4 | 328 B / 68 tokens | 16,323 / 529 |
| Workspace N+2, five Entity mentions and an Argument | 3,368 / 799 | 13 / 14 | 842 B / 164 tokens | 17,090 / 808 |
| Theseus Sol contribution 18, Argument and relation | 3,420 / 809 | 10 / 11 | 604 B / 123 tokens | 114,950 / 818 |
| Authenticity contribution 16, extensive structure | 6,930 / 1,630 | 34 / 52 | 1,791 B / 447 tokens | 78,328 / 1,639 |

In workspace N+2, authored composition text occupies **1,679 B (49.9%)**; semantic payloads 73 B (2.2%); markup 671 B (19.9%); empty/default fields 424 B (12.6%); envelope 159 B (4.7%); remaining structure 362 B (10.7%). Thus 47.9% is markup, identity/structure, envelope and default ceremony, but only part of it is dispensable. Entity refs inside markup carry meaningful identity. The separate handle/alias inventory finds 15 occurrences, 244 B / 150 tokens as newline-joined strings; it overlaps these categories and includes separators. Never interpret that whole number as removable overhead.

### Component table

Output rows use workspace N+2 (3,368 B / 799 local tokens). Input rows use the **actual retained editorial A wire request** (82,039 B), with shares of the relevant visible component stated explicitly.

| Component | Current bytes | Local tokens | Share of relevant total | Potential saving |
|---|---:|---:|---|---|
| Empty semantic arrays | 123 | 26 | 3.7% response bytes | All in omission experiment; strict packaging has a replacement cost |
| Nested null/default fields | 301 | 86 | 8.9% response bytes | All measured candidate defaults; preserve meaningful nulls |
| Annotation markup | 671 | 206 | 19.9% response bytes | Aliases save 418 B / 52 tokens; refs and IDs remain |
| Envelope | 159 | 64 | 4.7% response bytes | Retain; not included in savings |
| Editorial policy | 6,020 | 1,078 | 24.0% of system bytes | Preserve semantic initiative; no measured rewrite proposed |
| Authoring instructions, user copy | 15,026 | 2,783 | 41.8% of request-object bytes before JSON escaping | Remove duplicate copy with protocol text: 16,572 B / 3,140 tokens |
| Capability summary + legend + vocabulary | 12,885 | 2,630 individually summed | 35.8% of request-object bytes | Already filtered; further savings unqualified |
| Examples | 3,262 | 787 | 9.1% of request-object bytes | Preserve teaching content; compact envelopes later |
| Structured-output schema | 15,725 | 4,311 | 19.2% of API wire bytes | Not equivalent to billed/context tokens |
| Semantic workspace, qualification N+2 | 2,767 | 906 | 6.8% of its 40,500 B request object | Preserve; no truncation change recommended |

### Request assembly and actual usage

Editorial A's actual serialized API body is **82,039 B / 17,778 locally tokenized JSON tokens**. It contains system instructions 25,067 B / 4,550 tokens; serialized `input` 38,395 B / 8,116; schema 15,725 B / 4,311; tools 2,183 B / 450; plus transport fields. The decoded DCP request string alone is 35,963 B / 7,563. System plus decoded user text is 12,113 local tokens. Actual provider usage is **15,258 input tokens**. Neither sum of JSON fields equals that number; JSON escaping, message framing and provider schema processing differ.

Workspace N+2 retained the DCP request and usage but not its full historical wire body. An explicitly labelled **offline reconstruction using today's assembly** produces a 90,100 B OpenAI body, 28,410 B / 5,157-token system text, 14,690 B / 4,038-token schema and 2,978 B / 612-token tools. Its user payload includes the server-added capability scope. This is not passed off as the historical request: editorial policy and schema code can change between qualification and reconstruction.

For the same current request, Anthropic's bounded expansion produces **77,695 schema bytes / 22,421 o200k tokens**, versus OpenAI's 14,690 / 4,038. The Anthropic token count is only a cross-format size proxy. No Anthropic usage receipt establishes its billing or latency.

## 3. Optional-field analysis

JSON has no `undefined`. The proposal concerns absent properties. Current host `keys()` validation generally requires exact fields; TypeScript optionality alone will not enable omission. Native preparation already tolerates omitted optional text style, margins and some layout configuration, but `ranges` and semantic collections still require normalization.

The table covers the current response field families, including fields not exercised in the measured corpus. **D** = safe default when deliberately omitted in a negotiated profile; **R** = required semantic/structural input; **C** = conditional; **N** = meaningful null. “Default” never permits silently deleting a malformed or unauthorized value that was supplied.

| Fields | Classification and normalization decision |
|---|---|
| `protocol`, top-level `kind` | Fixed discriminators; redundant with negotiated format but useful diagnosis/version checks. Retain initially. |
| `exchange` | R: exact active exchange binding. Never infer an old exchange or accept historical output under a new one. |
| `intent` | D: `reply` is the existing semantic fallback; currently schema/host field requirements still apply. Small saving; retain initially. |
| `replyTargets` | D: `[]` means no **additional** discursive references. Does not remove the host's primary reply. Keep independent of formal relation operations. |
| `composition` | R as envelope field. An intentionally empty array is different from inventing a default paragraph; preserve existing admission rules. |
| `anchors`, `entities`, `interpretations`, `arguments`, `glosses`, `relations` | D: missing collection can normalize to `[]`; each nonempty entry retains existing validation and vocabulary checks. Never drop an entry to make validation succeed. |
| `suggestions`, `promotionRecommendations` | Currently required but host requires them empty. Strongest removable root-field candidates in a new negotiated shape; normalize to `[]`, reject supplied unsupported operations. |
| Block `id`, `kind` | R: typed declaration and native route. Do not replace identities with positions or abbreviate `new:` roles. |
| Paragraph/heading `markup`; heading `level` | R. Heading level is authored content. No paragraph/heading conflation. |
| `ranges` | D: `[]`; only if no explicit overlapping spans. Preserve boundaries and nonempty span declarations. |
| `textStyle`, `margins` | D: absent means no override, as with null. Non-null objects must still pass capability checks even if all members are default-valued. |
| `textStyle.alignment/indent/size` | N: null means no override; zero indent and a chosen size are authored values. Default absent members to null only in a deliberately supported projection. Heading size retains its special null constraint. |
| `margins.left/right` | D: `[]` means no named owned margin on that side. Preserve nonempty children and ownership; do not turn them into ordinary child placements. |
| Group `children`; list `items/style`; table/grid `rows` | R: retain child ordering, list kind, dimensions and existing permitted empty-cell semantics. Empty child collections are not universally defaults. |
| List/table `configuration` | D: null invokes native defaults. Grid does not gain arbitrary configuration merely through normalization. |
| List `start/reversed/items`; per-item `value/checked` | N/C: start null derives native start (including reversed-list item count); null item configuration differs from an empty mismatched array. `checked:null` leaves a bullet/ordered item non-task; `false` makes an unchecked task. **Never coerce null to false**, or start null to 1 indiscriminately. Explicit numbering and checked state remain authored. |
| Table `headers` | R when configured: boolean matrix must match dimensions. An empty matrix is not an absent configuration. |
| Surface `front/back` | R structural roles; preserve allowed empty-side semantics. Do not synthesize or flatten faces. |
| Tabs/pages `orientation`, panels' `label/content` | R in current projection; orientation and labels persist. Native factory defaults exist, but removing these authored choices is not part of the measured simplification. |
| Code `language/text`; source `format/text` | R: preserve literal text, including whitespace, and actual language/format validation. |
| Sticky note `content/size`, timer `durationSeconds/size` | Content/duration R; null size can default only through the native route. Width/height required when size object supplied. No operational state is added. |
| Object3D `configuration` | D for absent→null native defaults if negotiated. Supplied scene/view/lighting/autoRotate/steam/coffeeStain/size remain fully validated; booleans are meaningful. Canvas preview has only its existing id/kind. |
| External media `url/alt`; YouTube `url` | URL R, validated by current route. Empty alt has accessibility meaning and is a string, not a reason to remove validation. Leave initially. |
| Managed image / retained PDF `source/revision`; image `alt` | R current source authority and resource verification. Never default these from provider memory or reconstruct trusted resource metadata. |
| Span `id/type/from/to` | R: typed alias and boundary identities, not numeric text offsets. |
| Span/interpretation `ref/attributes` | C/N: ordinary styling can default ref to null and attributes to `[]`; an Entity reference requires a valid ref. Do not discard supplied attributes or infer an Entity ref. Attribute `name/value` required when present. |
| Anchor `id/source/revision/selector.exact` | R. Selector `prefix/suffix` can default to `""`, while exact matching must still resolve uniquely. Do not remove nonempty disambiguators. |
| Entity `id/name/typename/description/aliases` | Identity and name R; typename/description retain native validation and meaningful supplied text. Empty aliases can default to `[]`. No name-based identity substitution. |
| Interpretation `id/target/type`; Argument `id/anchor` | R. Retain independent passage and Argument identities. |
| Gloss `id/target/type/text` | R: independent identity, target, qualified type and substantive text. Not a tooltip or inline string replacement. |
| Relation `id/kind/type/from/to` | R: family, direction, endpoint roles and ownership. No undirected shorthand. |
| Declarative `block/whole` or `block/quote` | R. Generated-target `revision:null` can be omitted and restored only when block resolves to a generated Block in this response. Existing sources require their current revision. Quote prefix/suffix can default to empty; ambiguous matches still reject. |

Required empty/null fields are often provider-shape ceremony, but **the underlying no-override/no-reference states remain meaningful**. Normalization must be field- and operation-specific, not recursive “delete falsy values.”

## 4. Strict-schema constraints

OpenAI documents that every declared field is required, objects are closed, and the root cannot be an `anyOf`. Nested `anyOf` branches can have different required properties. Therefore A works unchanged; B can use nested strict alternatives; arbitrary omission C does not preserve the present guarantee. A null union still requires the key. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

Anthropic supports optional properties and closed objects. Its current documentation lists limits of 24 optional parameters and 16 union-typed parameters across strict schemas; schema compilation can also fail on combined complexity. It documents grammar caching and an injected format prompt with input-token cost. Consequently, omission may be feasible for a small projection but is not automatically safe across DCP's expanded depth variants. Qualify the actual schema with the intended model before rollout. [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

| Approach | Reliability / expressiveness | Complexity / compatibility | Measured opportunity |
|---|---|---|---|
| A: current strict representation | Existing reliability; no native semantic loss | Lowest; historical shape unchanged | Aliases and input deduplication still possible |
| B: compact strict projection | Same native operations and strict JSON shape; normalization adds a validation boundary | Medium; explicit negotiation and repair-path mapping | Strict local experiment in §7 recovers most selected default savings |
| C: optional fields where supported | Anthropic can retain strictness within its limits; OpenAI would need another representation or relaxed generation | Provider divergence; bounded local validator still essential | Candidate omission savings in §2; no live acceptance evidence |

Do not switch OpenAI to JSON-only/free-form output for these savings. Native validation must remain necessary even with constrained decoding: it checks identity, current authority, exact text, ownership, capabilities and native graph rules that a schema cannot establish.

## 5. Markup alias analysis

The current SAX parser accepts `annotation` and self-closing `boundary`; it **does not already accept** `<b>`, `<i>` or `<e>`. Add only a small alias table at tag interpretation:

| Proposed tag | Existing type | Retained parameters |
|---|---|---|
| `b` | `style/bold` | optional typed annotation `id`; existing attribute validation |
| `i` | `style/italics` | optional typed annotation `id`; existing attribute validation |
| `e` | `mutable/entity-reference` | required valid `ref`; optional typed `id` |

Map into the existing `annotation()` / `semantic.mark()` paths, not into a browser HTML parser. Keep general `<annotation type="…">` for all other qualified types, including arbitrary admitted attributes. Explicitly reject conflicting `type` on an alias and unexpected attrs; preserve depth, count, Unicode and nonempty-range limits.

Nested aliases and general annotations can coexist. Overlaps still use `<boundary>` plus `ranges`; nested XML alone cannot express crossing intervals. Literal `<b>` text still needs `&lt;b&gt;`; `&`, `<`, `>` escaping and the ban on declarations/processing instructions remain. Alias names live only inside paragraph/heading markup, not in the Block `kind` namespace. Reserve three names now; do not create a general HTML vocabulary.

The local SAX experiment compares decoded text, canonicalized open/close property events and code-point Cell offsets across **255 actual markup occurrences in three transformation variants (765 comparisons)**. All matched. This establishes encoding equivalence for these inputs, not native admission or model reliability. Generated-text quote/whole targets and source quote matching see unchanged decoded text; IDs, exact selectors and revisions are not shortened.

Actual savings: workspace N+2's five Entity mentions plus typography save **418 B / 52 tokens**. Sol's final Theseus response saves 273 B / 34 tokens. The single-Gloss editorial response saves 79 B / 12 tokens and preserves the Gloss's target alias. Across the 41 admitted responses, aliases save **8,767 B / 1,165 tokens**. No case supports promising “hundreds of tokens per Entity-heavy reply” here.

There is specific behavioural evidence for syntactic familiarity: the earlier Mini table case emitted `<b>` in both attempts and ended with `Unsupported markup element`. Its first attempt also duplicated a Block ID and its header configuration was incomplete; aliases alone would not establish successful native admission. The range failure in Mini C would likewise survive aliases. Shorter syntax plausibly reduces authoring friction, but increased Entity mentions, Gloss initiative, correct references, source grounding, lower repair rate and smaller-model success remain **unproven**. Preserve guidance and assess meaningful semantic quality, not quotas.

## 6. Input-context analysis

### What is duplicated

`server/dialectic/providers.ts::conversation()` incorporates `request.protocolKey.text`, editorial policy, `request.authoring.instructions`, source guidance and a final cadence reminder into system instructions. It then serializes the entire request, including the first and third of those instruction components, as user content. The exact duplicate strings were confirmed in the retained system text, not inferred from similar wording.

Remove those two text fields **only from the provider-facing user projection after system construction**. Retain their versions, the full diagnostic request, examples, task, vocabulary, current authority, workspace and source context. The measured editorial A wire reduction is **16,784 B** because the outer JSON also escapes strings; the decoded user-context saving is 3,140 tokens. Workspace-enabled decoded saving is 19,334 B / 3,639 tokens. Do not confuse wire-tokenization savings with text-context savings.

This recommendation does not resolve or expand the separately deferred broker trust issue. Client-supplied high-priority text still needs a future server-derived/verified design; this investigation neither implements that design nor treats deduplication as its solution.

### Filtering and examples

Vocabulary filtering already works: `vocabularyInstructions()` gates operation sections; `vocabularyExample()` filters examples; `projectVocabulary()` removes unselected composition routes and constrains semantic arrays; the catalogue advertises selected qualified routes plus explicitly labelled inspection/presentation entries. General editorial policy still mentions broad native affordances conditionally. Those references are not authoring permission or a reason to replace the catalogue.

The actual core fixture's summary is 885 B / 168 tokens versus general's 6,888 B / 1,345. Core's schema is 6,033 B / 1,614 versus general's 15,725 B / 4,311. Examples shrink from 3,262 B / 787 tokens to 1,201 B / 281. **Do not propose capability filtering as if absent.**

There is a narrower cleanup: core retains unreachable `TextStyle`, `ListConfiguration` and `TableConfiguration` definitions, 1,216 B / 318 locally tokenized schema tokens. General's retained schema has no unreachable definitions under reference reachability. Pruning must follow `$ref` reachability and retain validation of zero-length collections. Removing every semantic definition merely because one collection is disabled is unsafe when another route references it.

Examples and guidance overlap in subject but have different teaching roles. Preserve Entity recognition/creation/reuse **and mentions**, meaningful Glosses, Claims versus independent Arguments, relation direction, source interpretation and declarative targeting. Compact their envelope/default ceremony only when the negotiated response profile changes. Do not delete them to improve a token score. Smaller paraphrases of editorial guidance have no measured benefit here.

### Workspace, source context and tools

The qualification workspace progresses from 514 B / 123 tokens to 2,767 B / 906. In the real Sol Symposium it reaches 7,901 B / 2,964 tokens, still within its byte sub-budget. That context supplies current usable identities. Preserve explicit partial coverage and fresh authority.

Sol contribution 18's current structural context is 2,082 B / 747 tokens; captured context is 259 B / 60 and task 327 B / 84. Some focus prose is repeated, but structural context also carries revision, occurrence and capability information. Removing it requires a separate equivalence check; do not flatten it into task text. Stored tool-result payloads for that exchange total 3,057 B / 999 local tokens, excluding provider framing and the appended capability scope. Full provider conversation item dumps and complete historical wire bodies were not retained with these Documents, so exact effective-history attribution is unavailable.

### Continuity, caching, latency and cost

The broker attaches a durable OpenAI conversation and adds native attributed history deltas via `conversations.ts`. Every exchange also sends its full DCP request as a user item. Provider turns with a conversation clear the local `state.input` after completion; this avoids local retransmission of the same turn, **not provider retention**. Tool outputs and assistant responses are also conversation items. A rebuild replays native history projections; it does not recreate an authoritative semantic registry from remembered request JSON. [OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state)

Across the complete saved Sol conversation, the latest-request objects alone total 93,067 locally tokenized tokens; duplicated guidance accounts for 32,751 of those, workspace snapshots 19,321. These are sums of retained application snapshots, not a complete provider-history token measurement. They explain why historical request duplication is a significant opportunity. Do not delete old conversation items or introduce memory compaction in this increment.

System instructions and schema are sent fresh on each request; this investigation does not establish that each copy becomes a separate persisted history item. The **user-message copy** of guidance and workspace/source snapshots does. Current scope/authority precedence must survive every optimization.

Schema and tools can affect prompt-cache matching; serialized schema tokens do not establish provider-side expansion or pricing. OpenAI exposes nested cached-token usage, but the current adapter only retains selected top-level numeric usage fields and drops those nested details. Receipts say cost unknown. Therefore exact historical cache benefit and dollar savings cannot be calculated. Do not change schema per prompt opportunistically to save a few fields; use a stable negotiated profile. [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)

Observed provider elapsed times include 9.700 s for editorial A, 13.373 s for workspace N+2, and 22.564 s across Sol's final exchange's two provider calls. These are retained request start-to-completion intervals, not first-token timing or controlled comparisons. **No latency improvement or monetary saving has been measured.** To establish those later needs matched runs with actual token/cache/reasoning usage, model pricing and latency instrumentation. No provider benchmark was run here.

## 7. Compact authoring projection

One normalization boundary is justified if the response savings are desired; a second semantic operation model is not.

The smallest first step is a negotiated strict schema that omits **always-unsupported or vocabulary-disabled fields entirely**, restoring their empty collections internally. This works with OpenAI's all-declared-fields-required rule. It does not remove enabled-but-unused collections, which are the main common case.

For the latter, the local strict experiment retains protocol/kind/exchange/intent/replyTargets/composition, and replaces the six enabled semantic array slots with one required collection:

```json
"semantics": [
  {"kind":"glosses","items":[{"id":"new:g1","target":"new:s1","type":"definition","text":"…"}]}
]
```

This is packaging of the **existing collection names and unchanged entry objects**, not new create/link/update commands. Empty means `semantics:[]`. Normalization expands buckets back to current arrays; source anchor and Entity preparation order stays canonical, independent of bucket order. Reject duplicate buckets, disabled families and unknown keys; never merge duplicates or allow new operation order to grant authority. Suggestions/promotions remain unrepresentable in this profile.

Add a strict simple paragraph/heading branch with id/kind/markup (and heading level) alongside the existing fully configured shape. `additionalProperties:false` distinguishes branches even with the same kind. Restore `ranges:[]`, `textStyle:null`, `margins:null` for the simple branch. Configured shapes remain unchanged. Do not create every possible combination of optional style members or one schema branch per omitted key.

Measured strict packaging plus aliases saves 1,827 tokens (23.9%) across authenticity, 1,251 (22.1%) in Theseus 5.4 and 911 (14.8%) in Theseus Sol. Workspace N+2 saves 147 rather than the unrestricted omission experiment's 164. It is less economical in semantic-heavy responses because populated buckets cost a wrapper.

The illustrative current OpenAI research schema grows from **14,690 B / 4,038 tokens to 15,952 B / 4,361 tokens**: +1,262 B / 323 local schema tokens. All 48 object schemas remain closed with all declared properties required. This is a local schema-shape check, **not provider acceptance or a complete production validator**. Anthropic's expanded grammar may make the trade-off worse. That input cost is why the full profile deserves its own review, rather than being smuggled in as harmless optionality.

Generated whole-target revision omission saves only a small field; a new/existing target split would add branches and duplicated parameters. Empty quote prefix/suffix are similarly optional in principle. Defer these isolated changes initially: strict authority remains clearer with the present target shape. Do not abbreviate source handles, `new:` aliases or operation names for cosmetic savings.

Proposed boundary: negotiate authoring format in the request/session contract; parse and validate that exact projection with raw byte/shape bounds; normalize once; then call the existing native preparation and canonical atomic admission. Default only known omitted fields. Check present unauthorized values before any normalization that could erase their meaning. Recheck normalized array/node/resource limits; preserve aggregate budgets across buckets. The normalized object remains private to admission, not another persisted Document representation.

## 8. Compatibility analysis

Native Document Blocks, semantic records, owned relations, managed resources and persisted identity remain unchanged. Old general annotation markup stays valid. No saved Document migration is needed.

Retain raw provider response, negotiated authoring-format version, full request and provider receipt in diagnostics/provenance. Record normalization information separately if required for debugging; do not overwrite original evidence with an expanded response. Historical `dcp/1.0` messages retain their old interpretation. Request format negotiation, rather than guessing from missing fields, selects the normalizer; unsupported versions reject clearly.

Vocabulary and feature flags continue to determine both schema and native permission. Disabled routes cannot be restored by a default or an alias. Alias parsing still invokes the same native property admission. Source handles expire per exchange, source revisions remain mandatory, Vault candidates remain read-only, and response-local identities keep their typed roles.

Validation and repair must refer to the author's original path. A normalizer should retain a simple path mapping from a bucket item to its canonical array entry, including markup errors. Repair requests use the same negotiated shape and still return a complete response; one failed normalization must not silently trigger legacy parsing or reduce the requested semantics. Atomic rollback and immutable submitted content remain unchanged.

## 9. Ranked recommendations

Ranked by practical return, with response-field reduction explicitly assessed rather than assumed possible:

| Rank / option | Output savings | Input savings | Complexity / risk | Strictness / compatibility | Behavioural evidence |
|---|---|---|---|---|---|
| 1. Remove exact user-copy instruction duplication | None directly | 3,140–3,639 local text tokens in measured general/workspace requests | Low / low; preserve authoritative copy | Strict shape and native semantics unchanged | Less distraction is a hypothesis; teaching remains |
| 2. Add b/i/e aliases | 1,165 tokens across 41 valid replies; 34–52 in representative mention-rich replies | Potential smaller examples, not separately credited | Low / low with existing validators | Additive, negotiated availability; legacy tags remain | Actual `<b>` rejection supports compatibility value; semantic initiative unproven |
| 3. Omit invariant-empty/disabled fields in negotiated strict profile | Small fixed per-response saving; subset of §2 | Smaller schema; exact rollout amount depends on vocabulary | Low–medium / low–medium | Strictness preserved; normalizer/version required | No demonstrated semantic change |
| 4. Simple paragraph branch + existing semantic collection buckets | Defaults alone: 4,135 tokens across corpus; aliases add separately | Example savings possible; +323 local schema tokens in research experiment | Medium / medium | Strict feasibility; provider acceptance and legacy repair compatibility need qualification | Easier authoring is a hypothesis |
| 5. Prune unreachable definitions | None | Core fixture 1,216 B / 318 schema tokens; general zero | Low / low with reachability check | Accepted language unchanged | None claimed |
| 6. Provider-specific optional fields | §2 candidate removal: 4,604 tokens across corpus | Unknown grammar/cache effect | Medium / medium; provider divergence | Anthropic potentially strict; unchanged OpenAI cannot | Unproven |
| Defer: target/ID abbreviations, editorial rewrite, history redesign | Small or unmeasured | History opportunity substantial but separate | Medium–high / disproportionate | More compatibility/authority surface | No evidence justifying this scope |

All recommended options preserve semantic expressiveness. Do not pursue option 6 by relaxing OpenAI strict output. The report recommends reviewable changes 1–3 before deciding whether option 4's additional format machinery is worthwhile.

## 10. Illustrative before/after messages

This complete **before** is the retained editorial D response. **After is proposed syntax, not currently accepted DCP**. Exchange identifiers and handles here are historical examples, not usable current authority. Measurements use minified UTF-8 JSON, not displayed indentation.

```json
{
  "protocol":"dcp/1.0","kind":"contribution","exchange":"EDITORIAL_D",
  "intent":"reply","replyTargets":[],
  "composition":[{
    "id":"new:b1","kind":"paragraph",
    "markup":"Sounds good — <annotation type=\"style/bold\">Saturday it is</annotation>. We can sort out the details then.",
    "ranges":[],"textStyle":null,"margins":null
  }],
  "anchors":[],"entities":[],"interpretations":[],"arguments":[],
  "glosses":[],"relations":[],"suggestions":[],"promotionRecommendations":[]
}
```

Proposed strict simple-node/bucket profile: **254 B / 70 local tokens**, versus 459 B / 113. It retains the same native text and bold range.

```json
{
  "protocol":"dcp/1.0","kind":"contribution","exchange":"EDITORIAL_D",
  "intent":"reply","replyTargets":[],
  "composition":[{
    "id":"new:b1","kind":"paragraph",
    "markup":"Sounds good — <b>Saturday it is</b>. We can sort out the details then."
  }],
  "semantics":[]
}
```

Real workspace N+2 Entity mention, before and proposed after:

```xml
<annotation type="mutable/entity-reference" ref="src:v_IZJhGeHf6k50xssxrMtA:e6">material authenticity</annotation>
<e ref="src:v_IZJhGeHf6k50xssxrMtA:e6">material authenticity</e>
```

Real editorial A's Gloss target remains independently addressable:

```xml
<annotation type="style/italics" id="new:s1">authentic</annotation>
<i id="new:s1">authentic</i>
```

Its unchanged native operation payload, packaged under the proposed collection form:

```json
"semantics":[{"kind":"glosses","items":[{
  "id":"new:g1","target":"new:s1","type":"definition",
  "text":"In museum work, authenticity is an evidence-based judgment about identity and history, not simply a claim that the object looks old or original."
}]}]
```

This preserves the supplied Gloss; it does not infer one from italic typography. A retained generated Argument target such as `{"block":"new:b4","revision":null,"whole":true}` stays unchanged in the recommended initial projection.

## 11. Minimal implementation boundaries

| Change | Smallest relevant surface |
|---|---|
| User-message instruction deduplication | `server/dialectic/providers.ts::conversation()` and provider assembly tests. Keep full diagnostic request; do not alter broker trust or history services. |
| Aliases | `dcp/markup.ts` tag dispatch; `authoring.ts` examples/guidance and relevant catalogue detail; focused parser/native equivalence checks. No new standoff renderer or native record type. |
| Compact shape negotiation | `provider-contract.ts` plus request construction in `exchange.ts`; `provider-schema.ts`, `vocabulary-schema.ts`; one small format-normalization module called before current preparation. |
| Repair/provenance | `diagnostics.ts` and existing controller/broker paths only as needed to retain format and map error paths. No new persistence subsystem. |
| Schema cleanup | Reachability pass after vocabulary projection/bounded expansion, with provider schema fixtures. |

`editorial-policy.ts` and `sources.ts` were inspected; neither needs a rewrite for the recommended first increment. `capabilities.ts` needs only truthful syntax/format detail updates when a format becomes qualified. Shared native factories, semantic workspace selection, canonical admission, resource services and editor input paths should remain untouched.

## 12. Focused qualification plan

Completed now: read-only corpus measurement; SAX event/Cell equivalence checks; one opt-in offline provider-assembly fixture capturing four current schema projections with a supplied fake fetch; closed/all-required shape inspection of the proposed OpenAI schema. **No network model calls, no native Document mutations, no production edits, no broad test programme.**

Reproduce from repository root, with `js-tiktoken` installed outside the application and the retained `/tmp` fixture files available:

```sh
DCP_EFFICIENCY_OFFLINE=1 npx vitest run docs/development/evidence/dcp-authoring-efficiency/capture.test.ts
DCP_TOKENIZER=/path/to/js-tiktoken/dist/index.js node docs/development/evidence/dcp-authoring-efficiency/measure.mjs
```

The reconstruction writes `/tmp/dcp-efficiency-reconstructed.json`; measurements write only this report's evidence directory. Temporary raw qualification wire files are an evidence retention limitation: their hashes and derived measurements are retained here, but full reruns require those files. The native Symposium files also need the recorded versions/hashes for identical results.

After implementation approval, qualify only the changed paths:

1. Same decoded text, Cell ranges, property types, refs and target aliases for general tags versus aliases, including nesting, overlap boundaries, XML literals and non-BMP characters. Reject malformed/extra attrs and disabled standoff types.
2. Legacy versus compact preparation equality for short prose, a table, Entity creation plus own-text mentions, a source Gloss, an Argument relation and a configured task. Preserve false versus null and explicit authored configuration.
3. Reject foreign/stale source handles, missing source revisions, unknown fields, duplicate buckets/aliases, disabled operations and exceeded aggregate budgets before atomic admission. One mixed-operation rollback, Undo/Redo and save/reload case reusing existing fixtures is enough.
4. Verify provider strict schema acceptance in supported modes, exact normalization selection, original-path repair diagnostics and retained raw evidence. Confirm deduplication leaves one authoritative instruction copy and all semantic examples/current workspace handles.
5. If behavioural evidence is wanted, propose a small paired exercise using existing prompts: GPT-5.4 and one smaller model, baseline versus aliases/compact shape, with the same vocabulary/context. Inspect useful mentions, correct targets, source grounding and substantive Gloss/Argument choices; record actual usage/cache details and latency. A few pairs can reveal regressions, not establish general success rates. No annotation quotas and no broad benchmark.

## 13. Open decisions

No clarification was needed to complete this investigation. Implementation remains unstarted pending review.

The decision for review is whether to approve **instruction deduplication plus b/i/e aliases and invariant-empty-field removal** first, retaining the remaining strict envelope, or also authorize the separate simple-node/semantic-bucket profile. The latter produces larger response savings but adds negotiation, normalization and schema complexity. Anthropic-specific optionality, conversation-history redesign and further editorial prompt restructuring are not recommended as part of that first increment.
