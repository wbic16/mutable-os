# Pipeline Manager implementation

17 November 2026 · Branch `dialectic-app` · Implements the [accepted architectural qualification](PIPELINE_MANAGER_ARCHITECTURAL_QUALIFICATION.md)

The five implementation phases are complete for the first Entity Identity Resolution workflow. The feature is enabled by default through `pipelineManager`; existing Scry/LER operations and other feature defaults are preserved. Launch it from **Dialectic → Semantics → Entity Details → Authentic identity → Resolve Entity Identity…**, with the source Document bound to its Mutable Cavern.

## Reusable infrastructure

| Component | Implemented responsibility |
| --- | --- |
| [Runtime](../../src/features/pipelines/runtime.ts) | Immutable, versioned Pipeline definitions; unique run identities; typed local input/output bindings; private run-scoped Data Bag; declarative outcome routes; dependency versions and output provenance; cancellation and disposal. |
| [Carousel](../../src/features/pipelines/carousel.tsx) | One horizontal host with retained Pipe panels, process labels, directional arrows, expansion, active-panel scrolling and inactive/stale presentation. The Manager renders and executes Back, domain actions, Cancel and Done. |
| Pipe interaction contract | Controllers expose `idle`, `busy`, `ready` or `error`, enabled domain actions, input updates and optional recovery guards. Controllers have no Pipeline navigation methods and need no window. |
| [Shared Scry read capability](../../src/features/entity-references/read-only-search.ts) | Read-only search and inspection with cancellation, current-result checks and unavailable/deleted-Entity rejection. Standalone LER and ESS use this boundary. LER retains its existing integrated editing and linking presentation. |
| [ESS](../../src/features/pipelines/entity-search.tsx) | Retained search query, field/match controls, results and selection. It consumes only a query and an injected read capability; it publishes a Cavern-qualified Entity reference or an explicit no-match outcome. Selection performs no persistent write. |
| [Identity recipe](../../src/features/pipelines/identity-workflow.tsx) | Window-independent comparison, reconciliation and import controllers; supported-field previews; transaction recovery. Document source validation, image binding and post-commit association are injected capabilities. |
| [Identity service adapter](../../src/features/pipelines/identity-service.ts) | Typed preview, commit and outcome calls over the existing selected-Cavern semantic service lease. No new transport, worker or service lifecycle framework. |

Typed keys carry runtime validators. Published values are detached and frozen; services, editors, windows and cancellation handles stay outside the Data Bag. Duplicate producers, conflicting keys, ambiguous routes, cycles and invalid outputs are rejected. The initial runtime bounds a definition to 32 Pipe occurrences and each snapshot to 256 × 1024 JSON string code units (not a byte-exact limit). Values must be JSON-safe; this is not a lossless store for arbitrary JavaScript objects.

Each occurrence retains its controller and component. Returning to a Pipe preserves its query, selection, local field choices and scroll position while its inputs remain valid. Expansion changes layout without replacing the component. Changing an upstream selection withdraws published outputs, marks downstream consumers stale and prevents stale content from authorizing a commit. Asynchronous publication checks the action generation and input versions. Search activity does not make its query input inert.

The same ESS definition is exercised in both the Document-Entity workflow and a test consumer carrying a versioned selected-text range. In the latter, ESS sees only the query; the subsequent Pipe receives the retained range and selected Entity independently. The selected-text consumer demonstrates composition; this milestone does not add a new Flint reference-creation UI.

## Final architectural qualification

The [final source-level qualification](PIPELINE_MANAGER_FINAL_QUALIFICATION.md) recommends **Accept with documented limitations** and closing this milestone. It inspected the current runtime and recipe, re-ran 17 existing tests and passed four temporary composition/scheduling probes. No production code changed in that review.

- **Data Bag:** storage is run-scoped, not edge-scoped. Later Pipes bind original context directly without intermediate forwarding. Availability still depends on execution and invalidation. Each key has one producer across the whole definition, including exclusive branches; repeated definitions require distinct occurrence IDs and output keys. Alternative routes may converge using shared inputs or distinct optional branch keys; there is no automatic alternate-producer binding. Required input availability is checked on entry, not statically proven for every route.
- **Invalidation:** input/output provenance records individual key versions, but withdrawal operates on whole Pipe occurrences plus transitive data consumers and all control descendants. Re-execution replaces all producer outputs, even unchanged ones. This is intentionally conservative and can later be refined without rewriting existing Pipes; selective draft-time invalidation would need an optional hint or smaller producers. Generation, abort and input-version checks protect managed output publication, while controllers/services retain responsibility for their own asynchronous work and external transactions.
- **Execution:** the scheduler structurally enforces one active path; this is not merely a UI option. Conditional alternatives and alternative-route convergence already work. Parallelism would require new scheduling, completion, guard and presentation policies, but the domain Pipe input/action/output contract does not require a path or window and can remain compatible. Retained inactive controllers are not automatically concurrency-qualified.

These limitations do not obstruct the accepted reference workflow. Multi-producer arbitration, static route analysis, finer invalidation and parallel execution remain deferred; they are not implied by the current implementation.

## Dialectic-specific integration

[The Dialectic adapter](../../src/features/dialectic/identity-pipeline.tsx) captures the source Document identity and Entity definition, acquires the originating Cavern's services, supplies source/semantic context and launches the host through the existing managed dialog surface. The dialog layer is required so the Pipeline paints above the inert owner window. Window lifecycle guards protect running actions and uncertain commits.

The normal route is **Scry → Entity Comparer → Entity Reconciler**. The successful no-match branch is **Scry → Entity Import**, available even when search results exist.

Comparison displays the two identities, available images, names, aliases, descriptions, dates, classifications, identifiers and canonical attributes. It distinguishes matching, missing and different supported values. Canonical managed images use the existing thumbnail binding; external source thumbnails remain previews. Claims and Relationships are explicitly identified as unsupported imports, with source Relationship descriptions, bounded Claim passage excerpts and bounded canonical records. Incomplete canonical query coverage is shown.

Reconciliation exposes separate choices for name, aliases, description, Entity type, classifications, significant dates and external identifiers. Names have one canonical display value; merging aliases can retain alternate source and canonical names. Descriptions support Keep, Import and Retain Both. Kept structured Cardex descriptions and name formatting are preserved. Classifications, dates and external identifiers merge only when individually selected, with exact deduplication; conflicting assertions remain visible and are not treated as external-authority verification. The preview shows the proposed supported values before final confirmation.

The adapter never promotes or replaces the local Entity. After a confirmed database outcome it adds a separate `metadata.scopedEntity.identityAssociation` descriptor using the existing bounded ScopedEntities transaction. Local Entity IDs, mention references and original provenance survive. The descriptor is explicitly `user-confirmed`, distinct from external-authority associations. The authority resolver respects it, including when external-authority lookup is disabled, and observes native Undo/Redo changes to the descriptor.

Ordinary typing does not re-read the captured source or rebuild the Pipeline's semantic context. Relevant source-definition changes invalidate the active workflow; final confirmation rechecks the source and Cavern. Switching away from the source Document or closing/changing it can invalidate the workflow and require restarting against the intended source.

## Database and recovery boundaries

[Migration 0012](../../src/knowledge-sqlite/migrations/mutable/0012-document-entity-associations.sql) adds an audited `DocumentEntityAssociation` table with a unique source Document/Entity pair, canonical target, reviewed source fingerprint, revision and provenance. It does not rewrite existing Entity identities.

[The canonical operation](../../src/knowledge-sqlite/entity-resolution.mjs) supports a read-only preview and one explicit final commit. It reuses Cardex/Entity mutation primitives inside one existing-ledger transaction. Entity changes, aliases and the source association either commit together or roll back together. Fresh target revisions, alias signatures and association revisions prevent stale confirmation. A unique source association prevents independent runs from creating duplicate authentic identities.

Only **Confirm Reconciliation** or **Confirm Import** dispatches a database mutation. Search, selection, comparison, field choices and cancellation before commit leave persistent Entities unchanged. Existing canonical images and unrelated attributes are retained; no arbitrary JSON merge is performed.

A dispatched operation retains its operation ID. A lost response exposes **Check commit outcome** and blocks leaving the run until its outcome is resolved. A committed receipt finishes the local association without another database commit. A confirmed non-commit releases the guard and requires a fresh preview and explicit confirmation. An unavailable outcome keeps the guard in place.

If the database committed but the source Document can no longer be updated, the UI offers retrying the Document association or explicitly finishing without that update. The durable database association remains discoverable in a later run, preventing duplicate creation. Reopen identity resolution and review the already-associated target to restore the local descriptor when appropriate.

Document metadata changes use native Undo and dirty tracking. Saving remains manual to the opened Mutable JSON file. There are no background Document saves or Markdown sidecars. Document Undo removes/restores its local descriptor; it does **not** undo a database transaction. No cross-system rollback is implied.

## Qualification

Validation uses synthetic records and temporary Caverns; it does not modify a user's canonical database.

| Check | Result |
| --- | --- |
| Runtime, workflow and Dialectic adapter | 21 tests passed: separate runs, immutable data, optional inputs, invalidation, retained DOM/scroll/choices, both routes, selected-text composition, previews, outcome recovery, malformed-source handling and native association Undo/Redo. |
| Existing Scry/LER | 15 interaction tests passed. |
| Authority resolution | 7 tests passed, including manual associations independent of authority lookup, stale scopes and Undo. |
| Dialectic retained conversations | 16 tests passed, including bounded typing with twelve open conversations. |
| Semantic HTTP/host/worker integration | 4 tests passed, including identity commit, exact retry, receipt recovery, duplicate prevention, read-only storage and feature disabling. |
| SQLite host | 5 tests passed on an isolated rerun. One existing retrieval/save test exceeded its 5-second timeout during the concurrent validation run; its unmodified isolated rerun passed. |
| Complete SQLite suite | 142 tests passed, including additive migration, rollback, audited retries and existing persistence/semantic operations. |
| Type checking | `npm run typecheck` passed for client and server. |
| Production build | `NODE_OPTIONS=--max-old-space-size=8192 npm run build` passed. The default 2 GiB Node heap exhausted during client bundling. Existing large-chunk/mixed-import build warnings remain. |
| Real Chrome | Both routes completed against an isolated real SQLite host, using physical pointer actions at 1440px and 760px widths. Checked managed layering, inactive panels, preferred widths, expansion/advance, retained DOM and scroll, canonical association and distinct imported/local IDs. |

The Pipeline-specific typing regression performs 30 real editor text edits with an open Pipeline and asserts **zero source-registry reads, full snapshots, full content/placement scans, semantic inventory rebuilds and added search/database requests**. The local association transaction also avoids a full repository snapshot. These are bounded-work checks, not a claim about measured interactive frame latency.

Useful commands:

```sh
npm run typecheck
NODE_OPTIONS=--max-old-space-size=8192 npm run build
node --test --test-concurrency=1 src/knowledge-sqlite/*.test.mjs
npx vitest run src/features/pipelines src/features/dialectic/identity-pipeline.test.tsx
node scripts/check-pipeline-browser.mjs
```

Run the production build before worker-backed tests, not concurrently: the client build clears `dist`. The browser script imports the built isolated host and writes comparison, reconciliation and import screenshots to `/tmp/mutable-pipeline-proof` (override with `PIPELINE_OUTPUT`).

## Remaining limits and deferred capabilities

- Claim/Relationship import, missing-endpoint resolution and passage-to-canonical semantic conversion are unsupported and shown as such. Dates remain Entity enrichment; this workflow does not create canonical Time records or external-authority identity mappings.
- Managed canonical images are preserved and displayed. External thumbnail acquisition/import and image conflict resolution are deferred.
- Pipelines are code-defined, session-only, acyclic and single-active-path. There is no graphical definition editor, connector scripting, parallel execution or durable run restoration. Independent Pipe windows and detached carousel topology are deferred.
- Search/selection reuses Scry's read capability, not its mutation controls. The selected-text workflow is a qualification consumer, not a new shipped linking workflow.
- Existing source associations cannot be retargeted to a different canonical Entity in this release. Deleted or incompatible targets require separate review. Large/unsupported source metadata can exceed the bounded review limits and must be handled separately.
- Semantic previews are bounded: up to 100 canonical Relationships in each direction, 50 canonical Claims and 20 source Claim passage excerpts. Unsupported records remain review context, not an executable import plan.
- Database outcomes are durable; the carousel session is not. Document saving and database persistence remain separate, explicit boundaries.
