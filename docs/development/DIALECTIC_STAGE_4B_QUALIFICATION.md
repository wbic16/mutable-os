# Dialectic Stage 4B — qualification

**7 November 2026 · Increment 4 Revision 2 · Stage 4B implemented. Stage 4C has not begun.**

## Delivered contract

The default-enabled `scopedSemantics` flag negotiates DCP profile `4b-1`. Disabling it retains the accepted `4a-1` mock capability profile; `dialecticDcp` retains its existing fallback.

- **Arguments:** Document-owned `dialectic/argument` definitions reference a durable `{resourceId, anchorId}`. They contain no copied passage text and remain identifiable when their passage is unresolved. Classifying text does not implicitly create an argument.
- **Argument relationships:** separate `dialectic/argument-relation` records admit `supports`, `challenges`, `qualifies`, `contradicts`, `elaborates`, `answers`, `depends-on` and `provides-evidence-for`. `from` performs the relation toward `to`; `depends-on` is dependent → prerequisite. The inspector shows this direction explicitly. One anchor per argument is this implementation's boundary, not a conceptual restriction.
- **Scoped Entities:** the shared `ScopedEntities` service prepares and resolves `mutable/entity` and `mutable/entity-relation` definitions owned by any native Document. It reuses `CanonicalEntity` fields and validation conventions. References distinguish `{scope: "document", resourceId, entityId}` from `{scope: "vault", vaultId, entityId}`. Vault identity is the persistent Vault GUID, not its directory. The existing Entity service supplies read-only lookup and an optional scope-identity capability; global creation, updates and promotion are not invoked.
- **Entity references:** `mutable/entity-reference` annotations carry qualified references separately from classification and argument identity. Local/local and local/Vault relationships are admitted; foreign Document endpoints and local relationships with no local endpoint are rejected. Source export issues handles for scoped mentions and eligible existing Vault Entity mentions. Missing Vault authority is explicit.
- **Gloss independence:** an explicit DCP Gloss operation creates an ordinary `mutable/gloss` definition and occurrence through the established prefix/value convention. It can overlap an argument passage without owning that argument or any argument relationship. Removing classifications or Gloss occurrences leaves argument identity intact.

DCP validates the complete response and prepares host-assigned identities before one bounded canonical commit of the contribution, anchors, annotations, arguments, relationships, Entities, independent Glosses and exchange record. Primary structural `replies` remain separate from additional `discursiveReferences`. Inspecting an Entity or relationship does not make it the implicit structural reply target; it can be explicitly included as additional context. Requests use short exchange-local opaque handles; tool results and committed records retain the qualified native identities. Provenance retains the mock/AI actor, exchange, protocol and participant identity, with explicit attribution when source text is human-authored. The human text and contribution authorship are unchanged.

Cancellation, malformed output, wrong-kind endpoints, unsupported ownership and stale dependencies leave no partial semantic records. Asynchronous Vault resolution is cancellable and deadline-bounded even if an adapter fails to settle; previously read Entity revisions and Vault identity are checked again. No live AI provider is involved.

## Resolution, history and portability

The retained per-Document resolver incrementally maintains anchor→argument and argument→relationship dependencies. Canonical admission supplies proven changed-definition IDs, avoiding a second full-registry comparison in the resolver. Ordinary source typing does not rebuild argument inventories or perform retrieval. Earlier arguments and directed relationships can be read through DCP tools and inspected independently of chronology.

Source edits preserve argument IDs and expose current versus historical passage text. Source deletion leaves the argument with an unresolved passage and historical anchor excerpt. Existing reattachment operates on the anchor. Argument deletion leaves incident edge descriptors intact and unresolved; Undo restores identity and resolution. Entity tombstones similarly leave qualified references intact.

Native JSON Save/export/reload preserves complete definitions, participants and references. Package-context inventory separates local Entities from global SQL seeds and reports external Vault references explicitly. **Partial clipboard copying of argument-linked passages or scoped Entities is currently rejected before Cut/paste in both copy paths**, because those routes cannot yet remap the complete semantic dependency closure. Ordinary unrelated composition copying remains supported. Contribution-wrapper copying remains deferred. This is the approved explicit-rejection boundary, not silent loss or retargeting; comprehensive package-import/clipboard remapping is not claimed.

## Human workflow and participant compatibility

| Operation | Observed before 4B | Result in 4B |
|---|---|---|
| Compose a multi-Block contribution | The draft container already accepts arbitrary nested native Blocks. | Retained; no new editor or response grammar. |
| Submit | Commits the entire draft, creates the next draft, makes no AI call. | Retained, with persistent participant attribution. |
| Submit selected existing Blocks | No separate selection-to-contribution operation. | Deferred; compose within the existing draft. |
| Ask | Reads committed content and selected context without submitting another human contribution. | Retained. Editing several old Blocks does not merge, duplicate or resubmit them. |
| Submit & Ask | Absent. | Added as a small control: Submit succeeds first, then Ask captures committed content/context with that contribution as its explicit target. If Ask fails, the human submission remains committed. |
| Ordinary editing | Does not invoke AI. | Unchanged. |

Each new contribution persists a participant `{id, kind, name}` independently of the exchange mechanism. The existing `author` field remains compatible with old human/mock documents and admits AI contributions; participant identity is the durable author identity. Current controls use the local author and deterministic mock participant. Participant selection/management and authentication remain future work.

There is no turn-alternation invariant. Browser qualification includes consecutive AI contributions and later human contributions; tests cover consecutive human submissions and replies to older material. Chronology, reply targets, inspection and selected context remain independent. Save/reload requires no provider-side conversation history. This supports temporal asynchrony; it does not implement distributed collaboration or durable background jobs.

## Qualification and performance

Focused tests cover the combined commit, independent records, source changes/deletion, directed and wrong-kind relationships, scoped reads without SQL mutations, both copy rejections, Undo/Redo, cancellation during asynchronous validation, workflow boundaries, persistence and bounded work. Existing Stage 4A tests and affected structural/clipboard/package boundaries are reused. **73 distinct focused tests passed:** 29 Dialectic integration tests, 13 DCP tests, 30 affected structural/clipboard/package tests, and one new SQLite-backed Vault-identity test. Subsequent narrow checks covered the final adapter and interaction corrections; unaffected suites were not repeated. TypeScript (`tsconfig.reactive.json`) and `git diff --check` passed.

The Chrome fixture uses trusted typing and controls for cancellation, Ask, Submit & Ask, argument navigation, Undo/Redo, source editing, Desktop→Textual→Desktop and manual Save followed by actual reload. It retains the source editor mount/session. It adds three unrelated Documents with 300 annotated paragraphs and grows the owning registry with 100 and 1,000 Entity/argument pairs.

| Browser observation | Canonical commit | Ask to observed completed contribution |
|---|---:|---:|
| Initial semantic exchange | 30.7 ms | 221.1 ms |
| With 3 unrelated Documents / 300 annotated paragraphs | 29.1 ms | 256.6 ms |
| Owning registry: 218 definitions | 40.2 ms | 228.0 ms |
| Owning registry: 2,024 definitions | 159.5 ms | 344.0 ms |

First trusted native interaction with the initial response succeeded at **238.3 ms**. Manual Save and an actual page reload retained seven contributions, five DCP exchanges and 2,030 definitions; argument navigation and directed relationship display also passed after reload.

All measured exchanges recorded **zero repository snapshots and zero projection rebuilds**, with unrelated records unchanged. At both registry sizes the resolver processed six changed definitions for the exchange, and ordinary typing processed zero definition changes. End-to-end observations include deliberate mock streaming delays and browser/automation scheduling; they are individual observations, not paint timings or percentile benchmarks.

**Measured limitation:** canonical preparation, validation/history and updating the existing Document definition map still scale with that map. Incremental resolver maintenance does not make the canonical registry update constant-time. No storage redesign was introduced. This cost is outside ordinary typing but can pause input during an explicit commit.

## Shared-code impact and remaining boundaries

| Modules | Purpose / regression protection |
|---|---|
| `feature-api/{entities,scoped-entities}.ts`, `application/{entity-service,scoped-entities}.ts` | Shared scoped Entity contract/adapter and read-only durable Vault identity; existing Entity callers remain compatible. |
| `features/dialectic/{arguments,model,references,controller,view}.ts[x]`, `dcp/*`, feature registration | Owned semantic records, incremental resolution, typed tool reads, atomic preparation, participant attribution and small workflow/inspector additions. Desktop/Textual retain their existing owners and presentation registrations. |
| `block-tree/{dialectic-range-plan,structural-plan}.ts` | Narrow combined-definition admission and proven definition deltas; ordinary fallback behaviour remains intact. |
| `block-tree/{clipboard,scoped-semantic-copy}.ts`, `interchange/{serializer,materialize}.ts`, package inventory | Explicit copy rejection when closure cannot be preserved; native export keeps records and local Entity IDs are not treated as global SQL seeds. |
| Configuration, focused tests and existing browser script | Default-enabled capability flag and qualification; no additional test framework. |

Deferred: full semantic clipboard/package-import remapping, selected-Block submission, broad participant or semantic-authoring UI, global promotion/merging, full Vault Entity inspector/Cardex expansion, providers, multimodal exchange, remote collaboration and durable AI jobs. Next step is Stage 4B review; Stage 4C awaits acceptance.

Evidence: [browser measurements](DIALECTIC_STAGE_4B_BROWSER.json), [Desktop screenshot](DIALECTIC_STAGE_4B_DESKTOP.png). Reproduce with `node scripts/check-dialectic-dcp-browser.mjs --stage4b`.
