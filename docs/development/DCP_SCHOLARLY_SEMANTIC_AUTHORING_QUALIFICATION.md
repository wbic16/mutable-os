# Dialectic scholarly semantic authoring — qualification

11 November 2026. Implemented as a focused refinement of the accepted proactive policy, under the existing enabled-by-default `dcpProactiveSemanticAuthoring` flag. **Only two production files changed: editorial instructions and workspace guidance.** No DCP schema, semantic model, renderer, persistence service, retrieval budget or output setting changed.

## Diagnosis from the actual conversation

Read-only investigation used `vaults/imported/Conversation on November 11, 2026 (5).ink` and its retained log, `.mutable/dcp-test-phase/2026-11-11T06-09-07-890Z-1c5a129e-4073-4989-961f-03091f2c1bae.jsonl`. The original Document's digest was checked again after investigation; it is unchanged. No connected document-control session was available, so the saved native Document and server diagnostics supplied the evidence.

**Confirmed:**

- The three completed raw provider responses exactly match their saved DCP responses. All **eight Entities, ten Entity mentions and seven relationships** were preserved. Requested inline properties match saved native types, ranges and Entity identities; relation types, direction and endpoint identities also match. Two native Arguments were retained. There is no evidence of silent annotation loss in these exchanges.
- The first response named Milan, Florence, Cecilia Gallerani, *The Last Supper*, Louis XII and other references without marking them. It declared only Ludovico, Leonardo and the 1499 conquest, with one `patron-of` relationship. Subsequent Leonardo/Ludovico occurrences were generally plain text. These omissions were already in the provider output.
- The Mercury response correctly separated three senses but left Hermes and subsequent references unannotated. The later response reused Leonardo/Ludovico, added two works, and created relationships, but again mostly annotated each identity once.
- No completed response supplied a human-source interpretation or Gloss. Native human text was not silently stripped of annotations that the model had supplied.
- All these requests used **2,048 output tokens**, despite the proactive policy being active. The first completed response used 1,962 tokens. A separate fourth exhibition request ended with the provider's `response.incomplete`, reason `max_output_tokens`, usage 2,048. Nothing from that incomplete response was admitted. This is a demonstrated budget failure, distinct from sparse annotation in completed responses.

**Instruction gaps and hypotheses:**

The accepted policy established a minimum of one mention per new Entity and preferred a first natural occurrence; it did not explicitly distinguish that admission minimum from comprehensive occurrence annotation. The workspace still spoke of “recurring concepts.” Relationship/Gloss guidance coexisted with “least elaborate composition” and several restraint reminders. These are plausible contributors to representative rather than comprehensive annotation, not proof of the model's internal reasoning. The observed one-mention pattern supports the diagnosis. DCP's explicit declaration, targeting and relation syntax also costs tokens; its causal contribution cannot be isolated from these observations.

[Reproducible audit and receipts](evidence/dcp-scholarly-authoring/case-audit.json) · [read-only audit script](evidence/dcp-scholarly-authoring/audit-case.py).

## Exact instruction changes

Application policy: [`src/features/dialectic/dcp/editorial-policy.ts`](../../src/features/dialectic/dcp/editorial-policy.ts). Workspace guidance: [`src/features/dialectic/dcp/workspace.ts`](../../src/features/dialectic/dcp/workspace.ts). The existing provider assembly in `server/dialectic/providers.ts` continues to select the proactive policy for `authoring.proactiveSemantics: 1`.

The complete, exact changes are in [instruction-changes.diff](evidence/dcp-scholarly-authoring/instruction-changes.diff). Plain-text copies are retained for direct review:

- [Previous policy](evidence/dcp-scholarly-authoring/baseline-policy.txt) → [current policy](evidence/dcp-scholarly-authoring/current-policy.txt).
- [Previous workspace instructions](evidence/dcp-scholarly-authoring/baseline-workspace.txt) → [current workspace instructions](evidence/dcp-scholarly-authoring/current-workspace.txt).

The refinement establishes:

1. Scholarly annotation and graph curation as an **authoring discipline, not an academic conversational persona**.
2. A presumption of annotating meaningful principal and incidental references, including familiar names, places, works, institutions, events and concepts.
3. Creation/resolution once, with separate native annotations for meaningful repeated occurrences, aliases and unambiguous anaphora. Existing source annotations should be inspected to avoid duplicate occurrence annotations; unresolved ambiguity must not be guessed away.
4. Routine directed relationships for supported connections. Existing equivalent edges should be reused; conditional or n-ary propositions must not be flattened into misleading unconditional edges. Source assertion, inference and endorsement remain distinct.
5. Additive enrichment of relevant human passages using current source authority, preserving speaker, text, interpreter provenance and timestamps.
6. Useful Glosses as marginalia, distinct from basic name recognition and from repetition of the source.
7. A private completeness check before finalisation: Entities, occurrences, reuse, relationships, Claims/interpretations, uncertainty and useful Glosses. No visible checklist, extra model pass, annotation quota or corpus-wide sweep.

The revised wording explicitly says **“This admission minimum is not an annotation ceiling.”** It separates concise prose from semantic coverage. The workspace removes the recurrence restriction and clarifies that omitting a duplicate declaration does not mean omitting later mentions.

The previous typography, Gloss and declarative-target examples remain. A short repeated-reference example demonstrates one identity for “Marta” and an unambiguous “she”; Mercury demonstrates distinct identities despite shared spelling. Native source-authority instructions and the warnings against invented Claims/Traits/confidence fields remain intact. Disabled/legacy policy paths retain their prior guidance. This is instruction refinement within the existing negotiation, not a new protocol version.

## Architecture and preservation

The existing mechanisms already support the brief:

- `<e>`, general annotations and explicit ranges share native standoff preparation. Multiple occurrences can point to one scoped Entity.
- Source-directed interpretations can attach Entity mentions or classifications to exact quote-hinted/whole-Block targets on immutable human or AI contributions. Fresh source handles/revisions and ownership remain required.
- Host-prepared annotations and definitions join the new response in the existing canonical atomic transaction. Original source text and contribution authorship are preserved; annotation metadata carries the interpreting participant, source author/revision and timestamp.
- Existing native binary relationships, anchored Arguments, passage classifications and Glosses suffice for this increment. Native n-ary Claims/Traits and typed semantic assessments remain separate deferred work.

No application-level defect was demonstrated, so no admission or persistence code was changed. Mandatory grounding, single bounded repair, strict schemas and legacy compatibility remain unchanged. System/user instruction deduplication is preserved. No new work runs during typing, scrolling or ordinary editing; the changed strings are used when an exchange is assembled.

Limits are still explicit: 262,144 response bytes, 24,000 generated Cells, 32 distinct target anchors, bounded semantic collections and a 128-property source-reading projection. These bounds were not reached in the completed case study or qualification, but very dense sources can still exceed them. Full semantic coverage is an aim, not a validator guarantee or permission to bypass budgets.

## Controlled live comparison

One GPT-6.1 Sol sequence before and one after, each covering A–E, using identical prompts, General vocabulary, mandatory grounding, **4,096 output tokens** and all other provider settings. Each sequence used an isolated synthetic Document; native history/workspace supplied multi-turn continuity, with provider conversation retention disabled. No historical facts were added to the fixture's supplied account as test requirements. This is ten exchanges, not a broad model benchmark or statistical estimate.

Every exchange admitted on its first candidate and passed native encode/decode comparison. All generated mentions were checked against their persisted native counterparts. No repair or truncation occurred. Evidence includes raw outputs, assembled policies/requests, tools, committed definitions, properties and persistence checks.

| Case | Before → after evidence | Qualitative assessment |
| --- | --- | --- |
| **A: historical patronage** | 4 → 9 Entities; 4 → 28 mentions, including 0 → 15 on human text; 1 → 6 Entity relations; 0 → 1 Gloss | Now covers Florence, Milan, Cecilia, French forces and Louis XII as well as principal subjects and *The Last Supper*. Employment, commission, portrayal, command and conquest connections are represented. A source Gloss distinguishes the supplied account from independent verification and retains the 1499 context. |
| **B: Mercury ambiguity** | 4 → 6 Entities; 4 → 21 mentions, including 11 human-source mentions; 3 Entity relations in both | Both versions distinguish god/planet/element and Hermes. After adds Alchemy and the fictional/example Alex, repeated references and clear anaphora. The genuinely ambiguous “Mercury fascinated Alex; it was dazzling” is explicitly unresolved, not incorrectly assigned to a sense. |
| **C: repeated references** | No new Entities in either version; 2 → 18 mentions, including all 9 named occurrences in the human follow-up | Fresh workspace handles reuse Leonardo, Ludovico and Milan after an intervening topic. The response also grounds an unambiguous “him.” No duplicate identities. One Argument in both versions, but the earlier-Argument link appears only in the baseline. |
| **D: competing interpretations** | 3 → 9 mentions; 1 → 4 passage classifications; 0 → 5 human-source mentions | The revised response distinguishes evidence of opportunity, technical achievement and causal attribution. Human assertions and qualifications are marked. It still produces no Gloss or Argument relationship. |
| **E: weekend planning** | 3 → 4 Entities; 3 → 7 mentions, including 4 on human text | Adds the incidental Brisbane reference; preserves Sam, Queensland Art Gallery and *Spirited Away*. Prose remains friendly and practical. No Claims/Arguments or factual edges falsely asserting that the tentative visit already happened. |

[Coverage audit](evidence/dcp-scholarly-authoring/coverage.json) contains each actual occurrence, range, identity and source author, plus named relationship endpoints and Gloss targets. The review evaluated omissions and ambiguity, not only counts. No obvious wrong referent assignment was found in these inspected spans; this is not exhaustive factual or historical verification. “Alex” is explicitly an example-sentence participant, not an inferred real person. Clear pronouns were linked; the ambiguous pronoun was not.

**Remaining omissions:** C leaves the human's “Ludovico lost Milan” relationship unrepresented, and its Argument is unlinked. D does not author an explanatory Gloss despite useful discussion of evidence. A's conquest is an edge with contextual date/provenance, not a structured n-ary event/Claim. No comprehensive temporal event model is claimed. Further increases in raw counts would not, by themselves, resolve these limitations.

### Representative before/after output

Before A marked only central concepts/names and a work, leaving the human source untouched. After A contains native Entity edges such as:

```json
{"id":"new:rel1","type":"employed-by","from":"new:e1","to":"new:e4","kind":"entity"}
```

Here `new:e1` is Leonardo and `new:e4` is Ludovico in that response. The source also receives exact occurrence annotations. C demonstrates why creation and mentions must be separate: `entities` is empty while all nine human occurrences are annotated with the existing identities.

One actual C target selects a repeated occurrence by context:

```json
{"quote":"Leonardo","prefix":"Returning to ","suffix":""}
```

The complete operation includes its current issued Block handle, exact revision, `type: "mutable/entity-reference"` and a fresh workspace Entity handle; subsequent Leonardo occurrences have their own disambiguating targets. See [after-C.json](evidence/dcp-scholarly-authoring/after-C.json). Handles in saved evidence are expired diagnostics, not reusable authority.

The spontaneous Gloss in A adds a useful epistemic boundary:

> The relationships recorded here represent the supplied account, not independent historical verification.

The full Gloss also distinguishes the dated conquest and the limited interpretation of disrupted patronage from a universal claim about patronage. It is attached to the human passage and persisted natively; see [after-A.json](evidence/dcp-scholarly-authoring/after-A.json).

## Budget, checks and remaining work

Final output tokens before → after were A **871 → 3,151**, B **976 → 2,217**, C **541 → 2,318**, D **635 → 1,412**, E **673 → 1,047**. Three richer responses exceeded the old 2,048 ceiling. Your chosen 4,096 setting is supported by these observations; saved user settings and the production default were not altered. More output is expected for individually grounded source occurrences, not necessarily more visible prose.

Initial A input increased from 13,344 to 13,924 tokens (**+580**) with the same schema and source. Aggregate usage across five exchanges was 200,100 input / 4,333 output before, versus 278,911 input / 10,748 output after, including tools. The richer retained workspace and 11 rather than 8 tool calls contribute to the increase. Do not interpret this as a fixed per-conversation cost or a performance benchmark.

**Validation:** 70 focused deterministic/provider tests passed, covering instruction gating and deduplication, repeated occurrence ranges, distinct Mercury identities, source provenance, unchanged human text, native persistence and Undo/Redo, prior aliases, grounding/repair, authority and atomic admission. The separate live comparison passed all ten exchanges. Client/server typechecking passed. [Checks](evidence/dcp-scholarly-authoring/checks.txt) · [typecheck](evidence/dcp-scholarly-authoring/typecheck.txt) · [live run](evidence/dcp-scholarly-authoring/live-checks.txt).

Recommendation: evaluate this refinement in ordinary Symposia at 4,096 tokens. Richer coverage and a spontaneous native Gloss are demonstrated, but comprehensive relationship/Argument mapping and consistent Gloss authorship remain behavioural objectives. Keep native n-ary Claims/Traits, typed confidence assessments and the Semantic Explorer under their separately reviewed architectural briefs. No larger extension or additional tuning phase was started.
