# Pipeline Manager — Final Architectural Qualification

17 November 2026 · Recommendation: **Accept with documented limitations**

## Executive assessment

The implemented Pipeline Manager satisfies the accepted architectural objectives for the Entity Identity Resolution milestone. Its run-scoped Data Bag permits downstream Pipes to consume original context without intermediate Pipes understanding or forwarding it. Definitions, occurrences, controllers and runs are distinct. The same ESS implementation works with Document-Entity context and with selected-text context.

Three qualifications matter: **each key has one producer across the definition; invalidation is conservative at occurrence and control-route level; single-active-path execution is embedded in the scheduler, though not in the domain Pipe contract**. These are suitable restrictions for this milestone. They do not establish a general parallel workflow engine, but they leave a reasonable route to one without rewriting existing Pipe domain logic.

No material correctness defect or incompatibility was found within the supported JSON-snapshot, single-writer, single-active-path model and the implemented recipe. **Recommend closing the milestone with the limitations below documented.** No production code was changed during this qualification.

## Inspection scope and evidence

This assessment inspected the implementation on branch `dialectic-app`, now recorded in commit `cc443c7` (Pipeline Manager implementation). It does not rely on the implementation report alone. The source references describe that implementation, not only the earlier partial baseline `d4e8819`.

| Area | Principal implementation evidence |
| --- | --- |
| Data contracts and ownership | [runtime.ts](../../src/features/pipelines/runtime.ts): `DataKey`, `Bindings`, `occurrence`, `Entry`, `PipelineRun.constructor`, `inputs`, `value`, `setInput`. |
| Invalidation and publication | [runtime.ts](../../src/features/pipelines/runtime.ts): `revoke`, `invalidate`, `execute`, `provenance`, `assertInputsMutable`. |
| Scheduling and retention | [runtime.ts](../../src/features/pipelines/runtime.ts): `Slot`, `ensure`, `activeState`, `path`, `navigate`, `guard`, `execute`, `dispose`; [carousel.tsx](../../src/features/pipelines/carousel.tsx): `PipelineCarousel`. |
| Actual composition | [identity-workflow.tsx](../../src/features/pipelines/identity-workflow.tsx): `createIdentityWorkflow`; [entity-search.tsx](../../src/features/pipelines/entity-search.tsx): `createEntitySearchPipe`, `EntitySearchController`. |
| Domain freshness and recovery | [identity-workflow.tsx](../../src/features/pipelines/identity-workflow.tsx): comparison/reconciliation `execute` methods and `ReconcileController.guard`; [identity-pipeline.tsx](../../src/features/dialectic/identity-pipeline.tsx): `localCheck`, source-change subscription and injected `check`. |

## 1. Data Bag independence and route composition

### Current behaviour

**Storage and input access are independent of traversing intermediate Pipes. Availability and validity are not independent of execution history.**

`PipelineRun.entries` is one private map for the run, indexed by typed key identity. It is not attached to Connector edges or copied between adjacent panels. `inputs(slot)` resolves every declared local input from that map. A Pipe receives only its declared inputs; it does not receive unrestricted access to the bag.

In `createIdentityWorkflow`:

- Initial entries include both the search query and source Document Entity.
- ESS binds only `query` and publishes `entity`.
- Comparer independently binds the original `source` and the published `entity`.
- Reconciler independently binds `source` and the confirmed `decision`.
- Import binds `source` directly on the no-match route.

Consequently, any appropriately typed, registered, currently available key can satisfy a local input, regardless of which intermediate Pipes did not consume it. Caller-owned context survives route changes unless explicitly replaced. Derived outputs can be withdrawn when their producer or control path is invalidated; the bag is not an archive of results from abandoned routes.

### Producers, repeated definitions and convergence

| Case | Implemented treatment |
| --- | --- |
| Several values of the same type | Use distinct `DataKey` objects/IDs. Type alone does not identify a value. |
| Two producers for one key | Rejected by the constructor, **including mutually exclusive branches**. There is no last-writer-wins or route-local ownership. |
| Caller value also declared as a Pipe output | Rejected as producer-owned initial data. Replacement remains with the declared owner. |
| Repeated Pipe definition | Supported through different occurrence IDs and bindings. `ensure` creates and retains a controller/root per occurrence. Output keys must remain distinct. Instance-local state belongs inside the factory, not in a shared closure. |
| Alternative routes converging on one occurrence | Supported if its required inputs are available on the selected route. Shared caller context or a common earlier producer can supply them. |
| Different branches produce equivalent typed results | Use distinct branch keys. A consumer may declare both as optional, or a separate ordinary normalization Pipe can publish one common key. There is **no built-in route-dependent alias, merge or “whichever producer ran” input binding**. |

The identity recipe demonstrates the ownership restriction by using separate reconciliation and import receipt keys. New compatible Pipelines can reuse existing Pipe definitions by supplying different keys, local bindings and Connectors. A new domain operation or branch-normalization operation may need a new Pipe; that does not require modifying the original producers or ESS.

### Constraints, risks and disposition

The constructor validates key conflicts, ownership and routing shape. `inputs` checks required availability when a Pipe is entered. It does **not** statically prove that every possible route will produce every required input. A new recipe needs route-level qualification; a required value missing on one branch produces an admission error, not an inferred alternative value.

Navigation checks the displayed path and available inputs; it is not a general predecessor-completion or business-authorization proof. Where a confirmation is semantically required, encode its result as a required input, as the current Reconciler does with `decision`.

Keys must use validators for JSON-safe snapshot values. `snapshot` performs JSON serialization/parsing, not a lossless clone of arbitrary JavaScript types. The generic type parameter does not enforce JSON safety, and unsupported types may be coerced rather than rejected; validators and recipe qualification must enforce this boundary. Dates should be explicit data, and Maps, class instances, functions, handles and other live values must not be published under the assumption their identity/type will survive. Services remain injected separately. This restriction should accompany future Pipe authoring.

**Decision:** no runtime change is necessary now. Single-producer ownership and fixed local bindings are deliberate restrictions. Automatic alternate-producer resolution and static route-availability analysis are deferred capabilities, not prerequisites for composition of the present workflows.

## 2. Dependency tracking and invalidation granularity

### Current behaviour

The implementation combines three levels of tracking:

1. **Typed-key versions:** each stored entry has a version and producer. Every published output records versions of all declared input bindings, including `0` for an absent optional value. This is declared-dependency tracking, not dynamic tracking of which fields the controller actually read.
2. **Occurrence-level withdrawal:** `invalidate(id)` revokes all outputs of that occurrence. The `changed()` callback has no key argument, so any relevant local draft change is treated as potentially affecting all its outputs.
3. **Transitive data and control invalidation:** `revoke` repeatedly includes consumers of affected output keys **and all Connector descendants**, including descendants that consume none of those keys. It follows the declared graph, not just the currently selected branch.

For every affected occurrence, `revoke` increments its generation, aborts its managed action, clears its outputs, outcome and completion, and marks a retained controller stale. It preserves the controller and panel instead of destroying local interaction state. Updated inputs are supplied when that occurrence is navigated to again.

This does not flush the entire bag. For example, changing shared source context can invalidate a consumer while preserving unrelated search outputs. `setInput` also skips invalidation when the caller's validated JSON snapshot is unchanged.

**Changing one output can invalidate consumers that depend exclusively on another unchanged output from the same producer.** Successful publication revokes the producer's entire prior output set and its descendants before publishing the returned values with fresh versions. There is no per-output equality comparison. Even re-executing a producer with equal output values causes fresh versions and downstream review/update. An omitted output is withdrawn, not retained as a partial patch.

### Asynchronous safety

`execute` captures input-key versions, starts an occurrence generation and passes an `AbortSignal` to the action. Before publishing, it rejects results from an ended run, aborted action or superseded generation and checks the input versions again. All returned outputs are parsed and snapshotted before any are published. Invalidation therefore prevents a late managed action from repopulating superseded values even if cancellation is not immediately honoured by its underlying work.

This protects **Data Bag publication**, not every asynchronous activity inside a retained controller and not external side effects. Search and preview loaders own their own cancellation/current-result checks. Database commits additionally require the identity workflow's domain checks, transaction revisions and outcome recovery. An abort is not proof that a remote transaction did not commit. Recovery guards block input mutation and navigation while an uncertain commit is being resolved.

### Constraints, risks and disposition

Conservative invalidation is appropriate for this small, human-reviewed workflow: an earlier identity decision can affect permission to proceed even where a later Pipe's scalar inputs appear unchanged. The cost is additional review/recomputation, including invalidation of previously visited alternative branches.

The data-key versions and provenance provide a usable basis for finer invalidation later. A compatible runtime refinement could compare returned values per key, preserve unchanged versions and distinguish changed control outcomes from changed data. Existing Pipes could keep returning the same `PipeResult` shape. However, selective invalidation **at draft-change time** cannot be inferred from today's argument-free `changed()` callback: it would remain conservative unless a backward-compatible optional hint were added or a producer were split into smaller Pipes.

**Decision:** retain the current model. Fine-grained invalidation is not required for this milestone. Future shared-context/branching recipes are supportable with this conservative behaviour, but high-throughput parallel workflows should revisit the control-descendant invalidation policy before adoption.

## 3. Single-active-path execution

### Current behaviour

Single-active-path execution is a deliberate policy **implemented structurally in the current `PipelineRun` scheduler and carousel**, not merely an external setting:

- `activeState` holds one occurrence ID; `execute` dispatches only that occurrence.
- `path` follows one outcome-selected edge, or a default/first edge for the prospective display path.
- The constructor rejects duplicate `(from, outcome)` routes, so one outcome cannot currently fan out to several targets. Reachable execution cycles are rejected.
- `guard` blocks navigation while a managed action is busy or a recovery guard is active.
- A terminal outcome completes the entire run; it does not wait for other branches.
- The carousel derives one active panel from `run.active()` and makes other bodies inert.

Conditional alternatives already work. Several incoming edges can converge on one occurrence, as verified by a diamond-shaped probe, but that is **alternative-path convergence**, not a barrier waiting for parallel predecessors.

### Extension boundary

The domain Pipe contract has no active-path, next/back, window or downstream-target parameter. It exposes typed inputs, local state, actions, `update`, `execute(action, signal)`, outputs/outcome and optional recovery/disposal. A future Manager could schedule distinct occurrences concurrently while continuing to invoke these interfaces serially per occurrence. A Pipe's existing outcome could activate several destinations under a new declarative routing policy without making the Pipe know those destinations.

That extension would require real runtime/presentation work: separate UI focus from execution eligibility; represent runnable/in-flight/completed occurrences; define fan-out and convergence semantics; revise terminal completion and global guards; and retain deterministic ownership, cancellation and mutation-recovery rules. **It is not a flag that can be turned on in the present scheduler.**

Retained inactive instances are a useful foundation: each occurrence already has its controller, root, generation and cancellation state. Retention does not guarantee universal concurrency safety. Inactive controllers can still finish their own read-only preview/search work; `inert` prevents UI interaction, not background execution. Shared service/resource conflicts, input-update timing and commit guards need qualification before parallel scheduling. The current Dialectic adapter also deliberately checks the originating active Document/Cavern; changing that domain policy is separate from reusing the Pipe interface.

### Constraints, risks and disposition

Existing correctly scoped Pipes need not be rewritten merely to permit multiple **different occurrences** to run. A future scheduler should preserve one action invocation at a time per occurrence; concurrent calls into the same stateful controller are not promised by the current contract. Domain-specific components may still need opt-in safety checks where they rely on exclusive resource access or current Document activity.

**Decision:** defer scheduler expansion. The current Data Bag and Pipe interfaces are a reasonable foundation, with the single-writer rule simplifying deterministic parallel reads and distinct-key writes. They do not yet define multi-producer arbitration, synchronization barriers or parallel recovery. Those require explicit design when a concrete workflow needs them.

## Verification performed for this qualification

- Re-ran [runtime.test.ts](../../src/features/pipelines/runtime.test.ts) and [identity-workflow.test.tsx](../../src/features/pipelines/identity-workflow.test.tsx): **17 tests passed**. They cover typed bindings, retained independent context, invalidation, optional input presence, stale asynchronous publication, recovery and unchanged ESS reuse for selected text.
- Ran **four temporary architectural probes; all passed**. They checked alternative-route convergence with shared context and optional branch outputs; repeated definitions with distinct retained controllers; rejection of a shared output producer across exclusive branches; preservation of unrelated values; fresh versions on equal republication; and serialization of managed actions while inactive controllers remain retained.
- Inspected `revoke` directly to establish that withdrawal covers every output of an affected producer and every control descendant. The probes are not a substitute for that code-level finding.
- Temporary probe files were removed from the repository after execution. This review changes only this qualification and the implementation report; it adds no runtime feature or permanent test surface.

Earlier database, browser and production-build results remain recorded in [the implementation report](PIPELINE_MANAGER_IMPLEMENTATION.md). They were not rerun for this documentation-only review.

## Final recommendation

**Accept with documented limitations. Close the Pipeline Manager milestone.**

Keep the following authoring/extension boundaries explicit: JSON-safe typed snapshots; one producer per key across all routes; fixed per-occurrence bindings; route availability qualified by the recipe; conservative occurrence/control invalidation; and one active execution path with terminal completion of the whole run. Defer parallel scheduling, multi-producer merging, static route analysis and finer invalidation until concrete workflows justify them. No corrective implementation or substantial refactoring is recommended now.
