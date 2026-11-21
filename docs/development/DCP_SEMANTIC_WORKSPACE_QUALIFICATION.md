# Symposium Semantic Workspace — implementation and qualification

11 November 2026. Implements the approved sequence in §13.11 of [the investigation](DCP_SEMANTIC_INTENT_AND_ENTITY_AUTHORING_INVESTIGATION.md). The `dcpSemanticWorkspace` feature is enabled by default. Persistent provisional notes remain deferred.

## Outcome

**Accepted by the user on 11 November 2026.** This increment is closed. Committed semantic identities can be supplied with fresh authority and reused across exchanges and agents without repeated discovery or reliance on provider conversation memory.

Two behavioural objectives remain unresolved and do not block architectural acceptance:

1. Consistently pair Entity creation with meaningful mention annotations: the live exercise created four Entities without marking their mentions in the same contribution.
2. Demonstrate spontaneous, meaningful Gloss authoring on both human and AI passages; native capability and declarative targeting alone have not established this behaviour.

Further evaluation will occur through ordinary, sustained Symposia, observing spontaneous Entity creation and reuse, meaningful Glosses and appropriate argumentative relationships. No additional implementation, prompt-engineering phase or expanded testing is authorized unless requested.

The live GPT-5.4 exercise demonstrated spontaneous semantic creation, cross-agent reuse without lookup, and further native graph authoring. It did **not** demonstrate uniformly semantic replies or spontaneous Gloss authoring. Deterministic qualification covers Glosses and the complete creation → reuse → cross-agent → reload lifecycle.

No user Document was modified. The actual authenticity Symposium was opened into an isolated native repository for read-only inspection; live contributions were admitted only to synthetic Documents. No development server was started, no provider Conversation was retained, and no dependency was added to the application.

## Implementation

- Extended retained `DialecticReferences` with identity-only definition, native mention, incident Entity-relation and bounded selection indexes. Native Document definitions and scoped Vault records remain authoritative. No second registry, persistence subsystem, worker, pins or saved preferences.
- Selection combines explicit focus/current native mentions, a small central set based on surviving distinct-Block mentions, recent semantic objects and relevant incident relationships. Centrality changes with native membership, not request count, offset rebasing or DOM occurrences. The active set is reconstructible; it is a heuristic, not an exhaustive ranking of the graph.
- On explicit Ask, resolve selected native records and issue fresh handles through `DcpSources`. The workspace includes Entities, Arguments, relationships, Glosses, classifications and source locations. Claims remain native classifications; no Claim identity system was introduced. Previews explicitly require source reading before passage annotation.
- Added `search_entities({cursor, query, scope, limit})`. Document search uses the retained Entity index, with up to 512 candidates per page and 12 returned records. Exchange-local cursors continue the same query. Vault search uses existing read-only `EntityService` lookup and verifies durable Vault identity and Entity revisions; native Vault search limits still apply. No name-based automatic merging or Vault mutation.
- Reserved an 8 KiB workspace sub-budget **inside** the existing 64,000-byte manifest allocation. Candidate selection is bounded to 48 entries; budget omissions and partial coverage are explicit. Existing six-call retrieval and response budgets remain unchanged.
- The exact projection is retained in `dcp.request.semanticWorkspace`, existing provider request/outcome diagnostics and native contribution provenance. Coverage records bytes, candidates, projected/unavailable counts, selection policy and indexed definitions. This separates “identity was not supplied” from “identity was supplied but ignored.”
- Corrected selected-participant propagation into Entity, Gloss, Argument, relation and annotation provenance. New provenance also records preparation time; source-directed annotations retain an available source revision. Existing historical attribution was not rewritten.
- Enabled Entity creation and native mentions in `general`. Updated editorial guidance with normal Entity recognition/reuse expectations and one compact creation/reuse example. Current workspace state and issued authority explicitly supersede remembered provider state.
- Added declarative targets inside existing operations, with the negotiated provider schema and catalogue using the same projection. Native range preparation, validation, bounded repair and atomic admission remain authoritative.

New target forms for `interpretations.target`, `glosses.target` and `arguments.anchor`:

```json
{"block":"new:b1","revision":null,"whole":true}
{"block":"new:b1","revision":null,"quote":"exact words","prefix":"","suffix":""}
```

For an existing TextBlock, `block` and `revision` must be current issued/read authority. Whole targets require nonempty complete text; quote targets use unique literal matching and native Cell boundaries. Empty, ambiguous, stale, foreign, compound and inline-object sources are rejected. Existing range aliases/handles remain supported according to each operation's rules. Host-created range anchors are internal native preparation, not model-authored DTOs.

## Live behaviour and actual payloads

Two small three-exchange exercises used ordinary authenticity/restoration/reconstruction questions, GPT-5.4, the research vocabulary and the existing 2,048 output-token setting. The prompts did not request Entities, annotations, relationships or a particular output structure.

The [initial exercise](evidence/dcp-semantic-workspace/initial-behaviour/summary.json) returned valid prose/typography with no semantic operations in all three replies. Those raw results are retained. The guidance was then made more explicit about establishing recurring concepts in substantive discussions, including concise answers; no admission rule was relaxed.

The [follow-up exercise](evidence/dcp-semantic-workspace/summary.json) showed:

| Exchange | Supplied semantic state | Native result | Retrieval |
|---|---|---|---|
| 1, agent A | Empty working set | Typography and prose; no semantic records | 0 calls |
| 2, agent A | Empty working set | 4 Entities and 3 directed Entity relationships | 0 calls |
| 3, agent B | All 4 Entities and 3 relationships from exchange 2, with fresh handles | 5 native mentions reusing all 4 Entities; a new Argument with a whole-TextBlock target | 0 calls |

The four Entities were authenticity, provenance, material authenticity and documentary authenticity. Relationships distinguished authenticity from provenance and linked authenticity to its two dimensions. Agent B used their supplied identities without redeclaring them or performing a name search, then added an independently addressable Argument. Every response passed native admission without repair.

The exact incoming workspace and raw/native results are in [exchange 3](evidence/dcp-semantic-workspace/exchange-3.json); [exchange 2](evidence/dcp-semantic-workspace/exchange-2.json) retains the actual Entity and relationship declarations. These are historical diagnostic handles, not authority for another exchange.

Representative verbatim DCP output from agent B:

```json
{
  "arguments": [
    {
      "id": "new:arg1",
      "anchor": {"block": "new:b7", "revision": null, "whole": true}
    }
  ]
}
```

An excerpt of its actual paragraph markup:

```xml
<annotation type="mutable/entity-reference" ref="src:v_IZJhGeHf6k50xssxrMtA:e3">Authenticity</annotation> is not exhausted by original fabric alone.
```

The model did not create Entities in exchange 1, did not attach mentions when it first declared them in exchange 2, and created no Glosses in this live exercise. Consequently, this is evidence of spontaneous graph maintenance and enrichment **when the working identities are supplied**, not a guarantee that every appropriate semantic opportunity will be taken. The deterministic N → N+1 → N+2 fixture demonstrates immediate availability after creation, cross-agent Gloss visibility and reuse independently of provider memory. No hidden semantic repair or automatic Entity annotation was added to make the live result appear successful.

## Measurements

[Measured results](evidence/dcp-semantic-workspace/measurements.json) refer to the exact archived provider requests. Workspace tokens are measured with `js-tiktoken`'s `o200k_base` encoding, installed only in a temporary directory; they are payload-only counts, separate from actual provider billing/usage records.

| Exchange | Workspace bytes | Workspace tokens | Provider input / output tokens | Observed exchange time |
|---|---:|---:|---:|---:|
| 1 | 514 | 123 | 16,346 / 239 | 5.8 s |
| 2 | 514 | 123 | 16,323 / 529 | 11.7 s |
| 3 | 2,767 | 906 | 17,090 / 808 | 13.5 s |

All three made zero discovery/source tool calls and zero Vault lookups. The schema and existing instructions dominate total input size. The exercise does not establish a latency or monetary saving against a controlled baseline. Later host-only coverage/source-location diagnostic fields and discovery pagination were qualified deterministically; the table preserves the exact earlier live payload measurements rather than substituting recalculated estimates.

The actual saved authenticity Symposium still had no Entity, Argument or Gloss records. Its derived workspace correctly exposed its existing Claim classification without inventing the proposed conceptual graph. [Read-only projection, source hash and diagnostics](evidence/dcp-semantic-workspace/authenticity-workspace.json) record that check.

## Focused qualification

- Native creation, fresh-handle reuse, cross-agent visibility and selected-controller participant attribution; general vocabulary Entity permissions.
- Whole and quoted generated targets, current source targets, strict stale authority rejection and disabled-feature behaviour; existing editorial operations and both provider schema modes.
- A failed semantic target publishes nothing. An injected native insertion failure rolls back definitions and annotations; the retained index sees no uncommitted Entity.
- Rename/revision updates, deletion, Undo/Redo, native `.ink` encode/decode/admission and reconstruction of the retained index after reload.
- Document alias discovery, pagination, read-only Vault candidates, changed revisions and foreign Vault rejection.
- An older repeatedly mentioned Entity survives eight intervening turns and 70 newer Entity records. An 80-Entity fixture stays inside the workspace byte/candidate limits with explicit omissions.
- Ordinary typing performs no workspace candidate selection, definition scan, tree traversal or network request; the existing affected TextBlock property pass remains bounded to that Block.
- Existing DCP provider, vocabulary, editorial and Stage 4B integration checks remain green. The actual authenticity file is unchanged.

Commands and retained results:

```sh
npm run typecheck
npx vitest run src/features/dialectic/dcp/workspace.test.ts src/features/dialectic/dcp/vocabulary.test.ts src/features/dialectic/dcp/editorial.test.ts server/dialectic/providers.test.ts
DCP_WORKSPACE_AUTHENTICITY=1 npx vitest run docs/development/evidence/dcp-semantic-workspace/authenticity.test.ts src/features/dialectic/dialectic.test.tsx -t 'semantic workspace|real committed|4B|vocabulary|provider|continuity'
```

The focused suites contain 65 checks plus 12 integration/case-study checks. Live fixtures are opt-in and are not part of ordinary test runs. [Raw test/typecheck output](evidence/dcp-semantic-workspace/checks.txt) is retained alongside the provider evidence.

## Limits and deferred work

The workspace is explicitly partial. A concept outside the selected set still requires discovery, and previews never authorize guessed passage ranges. Older remote provider requests retain older snapshots; current authority takes precedence, but this work does not add provider compaction or change history limits. Vault availability depends on the existing native service and current session.

The live model's semantic participation remains variable; spontaneous Gloss authoring was not established by this exercise. Ordinary conversation is the appropriate next evaluation, rather than expanding this into a benchmark or adding task-expectation enforcement.

Persistent provisional notes, native copying, acquisition/generation, general retroactive editing and the separately deferred broker instruction-trust correction remain outside this increment.
