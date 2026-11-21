# Mutable OS Pipeline Manager Architectural Qualification

16 November 2026 · Architecture accepted by the user · Branch `dialectic-app`, originally inspected at `93067fd`

The proposed Pipeline Manager is viable. The recommended design uses a typed, run-scoped Data Bag, declarative Connectors, and a horizontal carousel hosted by the existing window infrastructure. The main work is extracting a read-only Scry selection component and introducing a safe reconciliation operation. Existing window and service frameworks remain responsible for their established functions.

The first consumer is Dialectic's Entity Identity Resolution workflow. In this workflow, an **authentic Entity** means a persistent Mutable Entity identity; external-authority verification is not required.

This qualification records the accepted architecture. The user subsequently authorized all five implementation phases, clarified retained Pipe interaction state and bounded reconciliation, and required Manager-owned status, actions and footers. See [the implementation report](PIPELINE_MANAGER_IMPLEMENTATION.md) for the implemented contracts, qualification results and remaining limits.

## Recommended architecture

| Component | Responsibility |
| --- | --- |
| Pipeline definition | Immutable, versioned description of Pipe occurrences, input bindings, process labels and outcome-based routes. Initially registered in code. |
| Pipeline run | Unique run identity, scoped values, active Pipe, completion state, dependency versions, cancellation and commit outcome. |
| Pipe definition | Typed input/output contract and domain controller, independent of the particular Pipeline and window. |
| Pipe presentation | Optional component presenting the controller's state, selections and validation. |
| Existing platform services | Window ownership and focus, Entity search, canonical reads, transactions, audit receipts and document edits. |

A Pipe definition can appear more than once in a Pipeline. Each occurrence gets its own identity, controller and output ownership. A run references the exact Pipeline definition version; changing a definition does not mutate an existing run.

The Manager owns navigation, routing, completion and cancellation. Pipes expose domain state and actions without implementing generic `next()`, `back()` or `cancelPipeline()` methods.

## Typed execution data

The Data Bag should be a private typed store rather than a public array of arbitrary entries. An accumulating context fits both reference workflows: requiring Entity Search & Select (ESS) to forward document or text context would unnecessarily couple it to those workflows.

The recommended hybrid has these rules:

- Typed keys identify values and carry runtime validators.
- A Pipeline binds those keys to a Pipe's local input/output names.
- The Manager supplies only declared inputs.
- Pipes return validated outputs; they cannot directly mutate the store.
- Services, cancellation handles and live session leases live outside the data values.

The following contracts illustrate the boundary; they are not implemented interfaces:

```typescript
interface DataKey<T> {
  id: string;
  version: number;
  parse(value: unknown): T;
}

interface PipeContract<I, O> {
  parseInput(value: unknown): I;
  parseOutput(value: unknown): O;
}

interface SearchInput {
  query: string;
}

type SearchOutput =
  | { outcome: "selected"; entity: VaultEntityReference }
  | { outcome: "no-match" };
```

`VaultEntityReference` denotes a scope-qualified canonical identity. A typed definition builder can derive inputs from key bindings and reject incompatible outputs at compile time. Runtime validation remains necessary at service, publication and commit boundaries. Existing domain validators should be reused; Mutable does not currently have a universal Pipe schema system to extend.

| Concern | Recommended rule |
| --- | --- |
| Duplicate keys | Reject duplicate declarations and competing producers in the initial implementation. |
| Multiple values of one type | Use distinct keys or an explicitly typed collection. |
| Replacement | Only the input owner or declared producer can replace a value through the Manager. |
| Provenance | Record producing Pipe occurrence, output generation and consumed key versions. |
| Optional inputs | Track presence as well as value version; becoming available can invalidate results. |
| Mutability | Publish detached, immutable values. Do not retain mutable repository objects in the store. |
| References | Store scoped identities and expected versions; resolve through injected services. |
| Scope | One store per run, with bounded values and explicit disposal. No application-global bag. |

This introduces orchestration without duplicating Application Services. Their existing [typed operation contract](../../src/application-services/contracts.ts) remains the boundary for window-independent operations.

## ESS reuse and Scry integration

| Workflow | Initial run values | ESS reads | Subsequent Pipe reads |
| --- | --- | --- | --- |
| Document identity resolution | `searchName`, `sourceDocumentEntity` | Query only | Source Entity and selected database Entity |
| Selected-text referencing | `searchName`, `sourceTextRange` | Query only | Text range and selected database Entity |

ESS receives the current Cavern's read-only search capability through its execution context. It does not receive a source Entity, text range, navigation controller or write capability. The Pipeline binds its selected output to the run's `selectedDatabaseEntity` key; the source context remains available independently.

This requires a deliberate Scry extraction. The current [LER implementation](../../src/features/entity-references/ler-view.tsx) combines search, selection, linking, creation, aliases and window controls. Merely embedding it would allow premature writes. Extract its shared search/inspection controller and presentation while preserving existing standalone behavior. Pipeline ESS uses a selection-only mode; selection enables the Manager-owned **Use Selected Identity** footer action.

The same ESS definition must pass automated qualification in both workflows, even if the selected-text workflow has only a test consumer in the first milestone.

## Routing and invalidation

Connectors remain declarative. The initial definition requires these routes:

```text
ESS —selected→ Comparer —confirmed→ Reconciler
  └─no-match→ Entity Import
```

No-match is a successful branch outcome, available even when search results exist. Rejecting a comparison returns to ESS and withdraws its selected identity. Connectors contain outcome labels and destination IDs, without mapping functions or executable expressions.

Start with acyclic, single-active-path execution. Navigating back is a Manager action rather than a graph execution loop.

Changing an earlier output withdraws that producer's old outputs, invalidates transitive data dependants and deselects incompatible route descendants. Pending work is aborted; every asynchronous publication checks its run and Pipe generation. Completed panels remain visible, but invalidated content is marked stale and cannot authorize a commit.

Unrelated typing must not invalidate the entire run. Track the source Entity definition and relevant semantic records narrowly. Text-range consumers reuse [versioned range validation](../../src/runtime/text-ranges.ts). Cavern changes, source closure and target deletion invalidate the appropriate capabilities. Final confirmation always performs fresh validation.

## Carousel and lifecycle

Use one managed Pipeline host containing retained, horizontally arranged window-like Pipe panels. This preserves the required carousel while avoiding independent desktop windows competing with normal layout and focus rules. Reuse Window Manager ownership, modal boundaries, close guards and geometry. The Pipeline owns horizontal scrolling and active-panel selection.

- Pipeline-defined process labels and directional arrows sit above the panels, separately from application titles.
- The active Pipe is fully opaque and interactive. Future panels remain visible but greyed out and inert.
- Completed panels remain visible and revisitable. Invalidated results cannot appear current.
- The selected branch determines the downstream panels.
- Scrolling keeps the active Pipe prominent, with adjacent panels visible where space permits. Preferred widths may vary by Pipe.
- Expansion changes presentation dimensions while retaining the same controller and component.
- The Manager renders action footers from each Pipe's available domain actions.
- Closing before commit cancels the run. A pending or uncertain commit uses a close/recovery guard.

The run belongs to the workspace/application session rather than a transient view component. Durable run resumption and detached carousel topology are deferred. This design requires neither a conventional single-panel wizard nor a node graph editor.

## Entity comparison and reconciliation

The three-Pipe workflow fits Mutable's domain model, but reconciliation cannot be a generic property merge.

| Data | Required treatment |
| --- | --- |
| Names and aliases | Keep one canonical display name; offer alternate names as aliases where appropriate. |
| Descriptions | Preserve Cardex's structured description representation. Plain Entity updates can clear that structure when replacing text. |
| Images | Preserve managed-asset identity. An external thumbnail URL is not automatically a canonical managed image. |
| Attributes | Reconcile supported fields individually; retain provenance and conflicts. Do not blindly merge arbitrary JSON. |
| Relationships | Resolve both endpoints to canonical identities before importing. Never silently create missing endpoint Entities. |
| Claims | Respect Claim, participant, qualifier and evidence records. A `dialectic/claim` passage annotation is not already a complete canonical Claim. |

The comparer displays available information, matching/missing/conflicting values, and incomplete query coverage. Unsupported or unresolved dependencies remain visible with an explanation; they must not silently disappear from the import preview. Comparison and identity confirmation do not mutate either Entity.

The reconciler offers Keep, Import and Retain Both where supported by each field's domain model, and produces a proposed change set. Existing [semantic batches](../../src/knowledge-sqlite/semantics.mjs) already combine Entity, alias, Relationship and semantic mutations under one canonical ledger. However, Cardex's structured fields use a [separate operation](../../src/knowledge-sqlite/cardex.mjs). A narrow reconciliation service should reuse those validations and mutation primitives within one existing-ledger transaction, rather than issuing several independent client writes.

## Creation and durable associations

Creation should retain the document Entity and create a separate canonical record with an explicit association. [Document and Vault identities are scope-qualified](../../src/feature-api/scoped-entities.ts); copying a UUID does not promote one scope into the other. Keeping the local Entity preserves existing document references and provenance. If an association already exists, creation must resolve or review it instead of creating another Entity.

A material schema change is recommended: an additive, audited source-to-canonical association store, with a unique source identity, canonical target, revision, reviewed source fingerprint and provenance. Supported semantic imports also need stable source mappings to prevent duplication across separate runs.

The current [canonical association implementation](../../src/application/entity-authority-resolution.ts) depends on external-authority verification. A user-confirmed Mutable identity must be represented distinctly and must not be overwritten by that resolver. It should not be forced into Wikidata or another external namespace.

The Pipeline definition and transient run do not require a durable pipeline schema in the first milestone. The proposed persistence additions serve identity association and import recovery.

## Commit and recovery boundaries

Persistent writes occur only after explicit final confirmation. Preparation and cancellation before commit leave persistent Entity records unchanged.

1. Final confirmation commits database changes and their associations atomically.
2. Any corresponding document metadata update uses native Undo and dirty tracking.
3. Document saving remains manual.
4. If the database succeeds but the document update fails, the durable association and operation receipt allow recovery without repeating creation.

The existing [canonical ledger](../../src/knowledge-sqlite/canonical-ledger.mjs) supplies exact-request retry and outcome recovery. An uncertain response must be resolved using the same operation ID before retrying. Document Undo must not claim to undo an already committed database operation. No universal cross-Pipe rollback system is proposed.

## Existing infrastructure to reuse

| Infrastructure | Intended reuse |
| --- | --- |
| [Application Services](../../src/application-services/contracts.ts) | Typed domain operation inputs/results and injected execution capabilities. |
| [Application presentation contracts](../../src/feature-api/application-presentation.ts) | Separate application instances from presentation adapters. |
| [Workspace Window Manager](../../src/application/window-manager.ts) and [Window Registry](../../src/runtime/window-manager.ts) | Host lifecycle, focus, ownership, geometry, modality and close guards. |
| [Entity service](../../src/feature-api/entities.ts) and Scry/LER | Existing search, record retrieval and inspection behavior, extracted behind a selection-only capability. |
| [Scoped Entities](../../src/application/scoped-entities.ts) | Document identity resolution and bounded native metadata updates. |
| [Semantic services](../../src/feature-api/semantics.ts), Cardex and canonical ledger | Revision checks, supported domain mutations, transactions, provenance and retry receipts. |
| Text ranges and existing decorations | Source validity, previews and selection behavior without a parallel highlight renderer. |

Retained document sessions and host transfer are useful lifecycle precedents; the carousel should not transfer an entire Document editor just to display a Pipe. Existing durable jobs can support domain work that needs them, but interactive Pipeline runs need not become durable jobs in the first milestone.

## Phased implementation and qualification

1. **Core contracts and qualification tests:** definitions versus runs, typed bindings, routes, cancellation, dependency invalidation, and the identical ESS contract in both reference workflows.
2. **Carousel and Scry extraction:** retained panels, controlled footers, keyboard/focus behavior, expansion and selection-only ESS.
3. **Comparison and preparation:** bounded reads, field differences, explicit dependency eligibility and reconciliation previews.
4. **Commit and recovery:** additive association migration, atomic canonical reconciliation/import, duplicate prevention, provenance and manual-save integration.
5. **Dialectic integration and verification:** Entity Details launch, both routes, cancellation, concurrent changes, lost acknowledgements, browser checks and bounded-work typing regressions.

The feature should use a default-enabled `pipelineManager` flag. Existing feature defaults remain unchanged.

Defer arbitrary graph editing, connector scripts, parallel execution, durable run restoration, external-authority acquisition and automatic promotion of ambiguous Claims. Unsupported semantic conversions remain explicit in comparison/import previews rather than being silently attempted or omitted.

## Accepted decisions

The user accepted the architectural qualification as a whole, including:

- One managed carousel host with retained window-like Pipe panels.
- A typed run-scoped Data Bag with local input/output bindings and declarative routes.
- An additive, audited association schema supporting durable identity links and import deduplication.
- Separate canonical identity creation while retaining document identity and references.
- Explicit deferral of unsupported semantic conversions, with visible eligibility and dependency information.

The user explicitly satisfied the brief’s implementation gate and authorized the phased implementation. Navigation must retain valid queries, selections, scroll and local drafts; unsupported Claim and Relationship conversions must remain visible without blocking the supported Entity workflow; the Manager owns navigation and action rendering/execution.
