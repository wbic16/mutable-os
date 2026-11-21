# DCP Proactive Semantic Authoring — qualification

11 November 2026. Bounded implementation ready for review. Feature flag: `dcpProactiveSemanticAuthoring`, enabled by default. No new Claim, Trait, confidence or persistence model was introduced.

The implementation makes Entity grounding mandatory in newly negotiated exchanges and makes those mentions visible and inspectable. The small live exercise showed richer recognition, native relationships and cross-exchange reuse. It did **not** demonstrate all desired semantic behaviours: spontaneous Glosses, coarse confidence labels and links between Arguments remain inconsistent/absent in this sample.

## Native capability audit and approval boundaries

| Requirement | Existing native/DCP route | Finding |
| --- | --- | --- |
| Entity recognition/reuse | Document scoped Entities, current Semantic Workspace and read-only Vault discovery | Available; fresh handles and ownership retained. |
| Entity mentions | `mutable/entity-reference`, `<e>`, general annotation/ranges and source-directed interpretations | Available on generated and authorised human/earlier text; no targeting extension needed. |
| Binary Entity relationships | Shared `ScopedEntities.prepareRelation` | Available; direction, Document ownership and provenance retained. Native relationship type strings are validated, not an invented fixed ontology. |
| Passage Claims and qualifications | `dialectic/claim`, `dialectic/qualification`, other classifications | Available. These are interpretations of passages, **not** Vault n-ary Claim records. |
| Arguments and directed links | Native anchored Arguments and existing argument relation types | Available, including source and generated passages; no explicit premise/conclusion-role schema. |
| N-ary Claims, Traits, qualifiers and time | Native `ClaimInput`, participants, qualifiers, `TimeInput`, evidence services | Native Vault services exist; not exposed through DCP contribution admission. Trait is a native Claim kind. Temporal qualification has native type checks. |
| Claim–Argument links | No qualified DCP endpoint joining native Vault Claims to Document Arguments | Missing; do not substitute a passage classification for a Claim identity. |
| Structured semantic confidence | No qualified native representation for the three requested dimensions | `Time.certainty` describes temporal normalization; generic `attributes` is not a semantic confidence contract. |

Inspected sources include `src/feature-api/semantics.ts`, `src/knowledge-sqlite/semantics.mjs`, `src/application/semantic-services.ts`, `src/application/scoped-entities.ts`, DCP preparation/schema/workspace code and actual provider requests. The native Vault services have their own mutation/revision boundary; current DCP Entities and contributions are admitted atomically into the Document. Bridging them is substantive architecture, not a few extra JSON fields.

**Proposals requiring approval, not implemented:**

- Reuse the existing native Claim/Trait aggregate preparation with a concise DCP projection of issued participant identities, roles, qualifiers and source evidence. Host-generated native IDs only. First settle the Document/Vault ownership and atomic commit/Undo boundary, plus explicit Claim–Argument reference admission. Do not add a second Document Claim registry or perform an independent Vault write during contribution preparation.
- Define a small shared native semantic-assessment contract on the relevant authored annotation/interpretation/evidence, with optional *recognition*, *interpretation* and *truth/evidence* assessments, each `high | medium | low` and a short rationale. Recognition belongs to a mention, not to an Entity globally; truth belongs to a proposition/evidence assessment. Preserve interpreter identity and source revision. Validate and persist it natively before adding a negotiated DCP projection. This is a proposal, not an implemented schema.

Existing prose and Gloss text can already distinguish uncertainty without new metadata. Guidance uses that route; no structured confidence or numeric probability is claimed.

## Policy, vocabulary and examples

`server/dialectic/providers.ts` selects the revised high-priority policy from `src/features/dialectic/dcp/editorial-policy.ts` only for `authoring.proactiveSemantics: 1`. Older requests retain their original policy. The controller records the marker in the complete diagnostic request and applies the same version during admission. Unknown versions reject.

The revised policy:

- Recognises named/hypothetical objects, people, processes, events, properties and abstract referents without requiring recurrence or imposing quotas.
- Requires current workspace identity reuse while explicitly rejecting semantic saturation: established Entities do not exhaust the subject.
- Considers both participants' propositions, justifications, objections and qualifications; preserves original speaker and interpreting agent attribution.
- Separates propositions from justified Arguments and distinguishes supported binary relationships from qualified/n-ary propositions.
- Requires every new Entity to have a meaningful native mention; does not manufacture literal occurrences for implicit referents.
- Separates recognition, interpretation and evidential uncertainty in existing prose/Glosses; never invents confidence fields.

The prior recurrence-oriented editorial wording was too narrow. The workspace's existing example of leaving `entities` empty applies only to an already-established concept, not to every subsequent exchange; the new policy makes that distinction explicit. Existing workspace authority, retrieval instructions, rich-text and Gloss examples remain intact.

The General vocabulary now includes the existing qualified Argument, Argument-relation and Entity-relation operations when the feature is enabled. Explicit user disables still win. If Entity mentions are disabled, new Entity creation is also excluded rather than advertising an impossible mandatory-grounding combination. Reuse of already-issued Entity identities remains independent of permission to create new ones.

New compact teaching examples cover several Entities and `<e>` mentions, a directed part/whole relation, a human Claim interpretation, source-directed Entity grounding, an own Argument qualifying an earlier issued Argument, and an assessment Gloss. Unsupported n-ary/Traits are explicitly identified, not illustrated as fictional operations.

Provider request deduplication is preserved: `protocolKey.text` and `authoring.instructions` remain authoritative high-priority content, absent from the provider-facing user projection and retained in diagnostics. No semantic bucket, second language or history rewrite was added.

## Grounding admission and rendering

Exchange-local preparation records created Entity identities and identities actually used by the shared native mention path. At final verification, a new identity with no mention raises the typed `entity-mention` diagnostic at its declaration index. Relationship endpoints do not count as mentions. XML aliases, general annotations, explicit ranges and source interpretations all use the same path. Nonempty ranges, source revision, owner and current handle validation remain mandatory.

The existing single repair can recover source authority within its original budgets. The diagnostic tells the agent to ground the intended Entity, preserving valid work; the host never guesses a mention or silently drops an Entity. Failed preparation writes no definitions, annotations or contribution. Repair-disabled mode rejects visibly. Historical requests without the marker remain admissible; existing saved Entities are not retrospectively repaired or invalidated.

Entity references now bind to the existing native `css-class` cell renderer with `affectsLayout:false`. Dialectic supplies a pale violet background and underline, distinct from ordinary yellow highlighting. DCP cannot select colours. A delegated click resolves only the clicked occurrence's properties and ancestor ownership, then opens the existing Entity inspector. Entity inspection does not call passage reveal or move the caret. Selection drags and modified clicks are left alone. Document Entity identity/name, type, description and aliases use existing inspection; the existing limited Vault-detail fallback is unchanged. No Semantic Explorer was added.

The click qualification also found and fixed an existing inspector cleanup dereference when its Document closes. The new renderer introduces no geometry cache, SVG alternative, canonical mutation, scan or persistence hook. Bounded-work tests check that clicks do not transact/snapshot/rebuild or invoke scrolling, and that ordinary typing does not trigger reference-tree traversal, text-inventory reads, structural transactions, snapshots, projection rebuilding or extra network requests. This is native/jsdom integration qualification, not a browser latency benchmark or pixel-comparison claim.

## Small live GPT-6.1 Sol exercise

Synthetic Documents only; no changes to user Symposia and no retained provider conversation. B follows A in the same native Document, using fresh workspace authority. All use the General vocabulary. The baseline uses the prior policy/preset; after cases use the new policy/preset. This compares the bounded increment as a whole, not isolated causal effects of individual prompt sentences.

| Case | New Entities / native mentions | Arguments | Entity relations | Source classifications | Final output tokens | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Baseline A: Theseus | 3 / 3 | unavailable in prior General | unavailable | 0 | 609 | Three abstract continuity/identity concepts. |
| A: same Theseus prompt | 5 / 5 | 1 | 0 | 1 question | 1,050 | Adds maintained/reconstructed vessels; justifies numerical-identity distinction. |
| B: strong human proposition | 0 new / 5 reused | 1 | 0 | 2 Claims | 1,202 | Reuses all five identities; precisely annotates human propositions and qualifies its own reasoning. |
| C: invented diary | 10 / 10 | 0 | 4 | 0 | 1,352 | Person, institutions, places, object, transfer, planned repairs and conditional assessment; directed event relationships. |
| D: casual closing | 0 / 0 | 0 | 0 | 0 | 116 | Plain acknowledgement; no fabricated structure. |

All five admitted without repair or truncation. All 15 new Entities in the after cases have committed native mentions. B used supplied workspace identities without a discovery call. Nine provider turns total, including four bounded `search_entities` calls; aggregate usage: 118,114 input and 4,577 output tokens. Initial request input increased from 12,053 tokens in baseline A to 13,236 in A, including the expanded General schema and policy. This is the intentional teaching/capability cost, not reintroduced duplicate instructions.

Qualitative observations:

- A treats its preferred continuity criterion as a defensible philosophical position, not an established fact. It still omitted original/replacement planks as separate Entities and authored no Entity edges. Recognition improved but remains selective.
- B anchors the human's explicit “must be the original” and “Material continuity is irrelevant” claims to exact current text. Its own qualification identifies a missing sufficiency premise. Native provenance retains `sourceAuthor: human` and the AI interpreter. It does not create an Argument for the human justification or link its Argument to the prior one.
- C keeps the passage explicitly fictional. It distinguishes completed transfer from planned repairs and conditional assessment, avoids claiming ownership or completed repair, and preserves four binary event relationships without pretending to author a n-ary Claim.
- No live case authored a Gloss or explicit high/medium/low assessment. Uncertainty appears in prose, but the requested coarse confidence behaviour is **not demonstrated**. No repeated prompt tuning or extra benchmark was used to conceal these limitations.

Full requests, assembled policies, raw response text/receipts, native definitions, occurrence properties, identity maps and tool trails are retained in [the evidence directory](evidence/dcp-proactive-semantic-authoring/). No credentials or authorization headers are retained. Source handles in these records are expired diagnostics.

## Representative actual DCP excerpts

Before, the Theseus response marked only conceptual criteria:

```xml
<b><e ref="new:e1">Historical continuity</e>:</b> The maintained ship has the stronger claim ...
```

After, it also identifies the hypothetical vessel (excerpt from A):

```xml
<e ref="new:e1">Historical continuity</e> favours the <e ref="new:e2">maintained ship</e>
```

C grounds a named actor and the transport event separately, and relates their identities:

```xml
<e ref="new:e1">Marta</e>
<e ref="new:e7">transfer</e>
```

```json
{"id":"new:rel1","type":"participates-in","from":"new:e1","to":"new:e7","kind":"entity"}
```

B uses exact human-source anchors plus native classification, rather than rewriting the speaker:

```json
{"id":"new:m1","target":"new:r1","type":"dialectic/claim","ref":null,"attributes":[]}
```

`new:r1` selects the human's complete “I think the maintained ship must be the original because its use and history continued without interruption.” sentence. See [B.json](evidence/dcp-proactive-semantic-authoring/B.json) for its actual issued handle, revision and committed provenance. These excerpts are abbreviated illustrations, not complete contribution envelopes.

## Output budget

Production remains **2,048**, user-configurable from **512–8,192**. The adapter sends `max_output_tokens`; Sol receives no explicit reasoning override (the existing GPT-5.4 Mini exception is unchanged).

The exercise explicitly selected **4,096** for headroom. Observed completed final responses used 116–1,352 output tokens. Thus this sample provides no evidence that the 2,048 cap caused sparse semantic operations; it also does not establish that 2,048 will suffice for dense multi-source contributions or other models. Receipts here expose aggregate output usage, not a separate reasoning-token breakdown.

Recommendation: use the existing 4,096 setting for sustained substantive semantic conversations, retaining the current bounded controls. Do not automatically raise saved user settings or attribute omitted operations to truncation without a provider incomplete/limit receipt. Any production-default increase remains a review decision; no increase was made in this increment.

## Qualification and remaining review decisions

Focused deterministic and integration qualification covers policy negotiation/disabled mode, strict schemas and deduplication, aliases and legacy envelopes, new and reused Entity identities, exact source attribution/revision, unmentioned/empty/stale/foreign rejection, native atomic admission, single missing-mention repair, cancellation, Undo/Redo and native persistence, visible mention classes and in-place inspection, and bounded work during typing. Existing workspace persistence tests verify native identity reconstruction rather than a lossy reading projection.

**196 tests passed across eight focused files; client and server type checks passed.** The separate opt-in live test passed all five cases. Checks and final counts are recorded in [checks.txt](evidence/dcp-proactive-semantic-authoring/checks.txt); client/server type checking is recorded in [typecheck.txt](evidence/dcp-proactive-semantic-authoring/typecheck.txt). The opt-in live harness is [live.test.ts](evidence/dcp-proactive-semantic-authoring/live.test.ts).

Review the bounded increment and the two native-extension proposals above. No n-ary Claim/Traits integration, structured confidence, new persistence boundary, model benchmark, resource acquisition or Semantic Explorer phase has been started. Behavioural gaps remain visible for ordinary-use evaluation rather than being claimed as resolved.
