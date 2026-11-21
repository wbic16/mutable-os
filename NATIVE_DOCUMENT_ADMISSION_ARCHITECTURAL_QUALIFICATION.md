# Native Document Admission — Architectural Qualification

Baseline: `a089fab` (the preceding performance remediation, retained). This qualification was written **before remediation**, after five sequential production-browser samples per required case. Instrumentation is opt-in and does not alter transaction or persistence semantics. Evidence: [baseline results](artifacts/tei-performance/admission-before.json), [instrumentation-only patch](artifacts/tei-performance/admission-instrumentation.patch).

## Actual lifecycle and ownership boundaries

1. The worker produces a complete native envelope. [Native admission](src/persistence/native-resource.ts) parses it, constructs the immutable resource graph, validates intrinsic identities/slots/cycles and native ownership, then stages independent canonical records.
2. Admission checks destination identity collisions and resource provenance, binds eligible existing unresolved references, and prepares a single existing `record-batch` with the bank update.
3. [Repository commit](src/block-tree/repository.ts) validates placement identities; builds private changed records and inverse operations; validates the **combined destination graph**; publishes changed records inside one Solid batch; rebuilds structural evidence; isolates Undo history; and notifies subscribers.
4. The workspace projection appends the admitted resource. An unrelated Document projection receives the event but does not rebuild its subtree.
5. [Candidate registration](src/persistence/native-session.ts) calls `captureNative`, then records the unsaved binding and dirty flag. Capture verifies canonical membership/provenance and projects into an independently cloned, frozen, validated native graph. It currently clones and validates that projected graph again even when no provenance rewrite is needed.
6. Flint `openDocument` adds its ordinary tab through a **separate small layout commit**, then constructs the active Document projection and mounts the editor. It does not publish a partially admitted Document. The harness includes that second commit, mounting and two animation frames.

## Measured baseline

Chrome 157.0.8103.79, production Vite build, M1/8-GiB machine, 1440×900, no CPU throttling. Medians in milliseconds; n=5. No build or test jobs ran during these samples.

| Stage | Small, 3,271 Cells | Large, 17,283 Cells | Anthology, 58,614 Cells | Large into populated workspace |
| --- | ---: | ---: | ---: | ---: |
| Usable text | 478.6 | 2,036.4 | 7,666.9 | 2,899.3 |
| Admission | 234.5 | 994.9 | 3,652.2 | 1,446.0 |
| Candidate | 86.6 | 473.8 | 1,752.9 | 633.2 |
| Open/render including frames | 91.2 | 513.6 | 2,181.0 | 675.6 |
| Document projection, subset of open/render | 25.0 | 121.1 | 473.6 | 148.9 |
| Synchronous open, including projection | 71.6 | 372.0 | 1,635.2 | 509.8 |
| Remaining two-frame interval | 18.3 | 132.2 | 551.3 | 165.6 |

The populated case adds three complete native documents, each with 8,000 Cells in 80 paragraphs. Two unrelated tabs are open; Flint mounts only the active tab's Document projection, so there are two live projections including the workspace. Before measured import, canonical contents increase from 155 to 24,409. This uses actual Flint tab behaviour rather than pretending all open tabs are simultaneously mounted.

### Commit/publication decomposition

| Stage | Large, empty workspace | Same large, populated workspace |
| --- | ---: | ---: |
| Shallow destination table copying | 0.1 | 16.9 |
| Inverse construction and isolated operation application | 120.5 | 122.2 |
| Combined repository validation | 76.2 | 256.9 |
| Revision comparison | 7.2 | 13.6 |
| Change-event preparation | 19.0 | 17.1 |
| Solid store record publication | 107.1 | 104.4 |
| Structural/identity index maintenance | 13.8 | 39.8 |
| Independent history construction | 89.1 | 103.6 |
| Annotation-origin preparation | 8.3 | 9.1 |
| Repository change subscribers | 185.0 | 238.2 |
| Remaining Solid batch flush | 19.0 | 82.9 |

These component medians are not an additive decomposition of one particular sample. Diagnostic counts themselves cost approximately 4.6 ms / 14.6 ms; the production call does not request them. Exact-record/history event capture and snapshot subscribers are absent in this fixture, so their preparation/delivery costs are zero. Undo history **is** present and measured separately.

Every completed sample had one admission commit, one change notification to each registered subscriber, one revision-probe execution, and zero repository `snapshot()` calls through admission/candidate/open. Empty-workspace admission has fourteen change subscribers including the diagnostic observer; this is thirteen application subscribers plus the probe. This count is not a count of every internal Solid computation. The batch flush interval includes subsequent reactive execution.

Admission creates one workspace projection branch of 17,355 nodes; opening creates a distinct 17,355-node Document occurrence. This is repeated materialisation, but the projections have different node identities, occurrence routes, selection and mutable presentation payloads. Sharing them directly would violate current occurrence isolation. No unrelated Document subtree rebuild was observed. The populated penalty instead includes real combined-graph validation, table copying, index rebuilding and broader canonical capture checks.

## Validation facts are not interchangeable

| Fact | Established at | Reuse boundary |
| --- | --- | --- |
| Native envelope shape and authored values | Native parser/decoder | Exact immutable decoded source only |
| Resource-local identities, structural slots, cycles and retained definitions | `validateResource` | Exact unchanged native graph |
| Native ownership and legal external endpoints | Native decoder | Source graph before destination binding |
| Destination collisions and loaded reference bindings | Admission | Current destination state and incoming identities |
| Reachability/ownership after bank insertion and binding | Repository planner | Complete planned destination revision |
| Exportable canonical membership and linked-definition provenance | `captureNative` | Current canonical resource and destination context |
| Persistable immutable resource graph | `projectOwned` / capture | The returned immutable graph, until a transformation creates a different graph |

Candidate capture is **not** redundant simply because decoding succeeded: canonical ownership, provenance and the destination may differ, and synchronous observers can be involved. The existing revision-bound boundary evidence describes resource membership, not all capture/persistence guarantees. No generic admission certificate is justified at this stage.

There is, however, a local redundant pass: `projectOwned` already clones, validates and freezes its result. When capture finds no legacy cross-resource definition requiring added provenance, capture's subsequent whole-resource clone, validation and freeze operate on identical authored data. Returning the already-owned immutable result in that case preserves the exact proof and isolation boundary. The changed-provenance case must retain validation of its transformed graph.

## Ranked changes and contract decision

| Priority | Proposed change | Benefit hypothesis | Complexity / correctness risk |
| --- | --- | --- | --- |
| 1 | Return `projectOwned`'s immutable result when capture has no provenance rewrite | Remove a full graph clone and duplicate validation/freeze from candidate registration and ordinary capture | Small; retain all canonical provenance checks and the rewriting fallback; oracle and alias-isolation tests required |
| 2 | Publish fresh records with one store merge per table; keep existing-record reconciliation/removal paths | Reduce tens of thousands of setter/path calls inside the existing batch | Small; same planned records, history and observer boundary; verify reactive identity, atomicity, Undo/Redo, deletion and unusual-key compatibility |
| 3 | Stop validator descent at a leaf after existing target/cycle checks | Avoid ancestry-set and child-array allocation for every leaf Cell | Small; no validation predicate removed; test invalid graphs, retained definitions and reference cycles |
| Defer | Skip full candidate capture using a new admission certificate | Potentially larger candidate improvement | Needs a contract covering destination provenance, graph identity, intervening commits, observer mutations and invalidation; not equivalent to existing membership evidence |
| Defer | Admit fresh resources without combined repository validation/index rebuild | Potentially substantial populated-workspace improvement | Needs a qualified incremental admission proof, including identities, bindings, registration and ownership; do not replace it with a trusted flag |
| Defer | Reuse/eliminate workspace/document projection copies | Significant materialisation remains | Current occurrences deliberately own independent routes and mutable view data; requires a separately reviewed projection contract |

The first three are authorised local optimisations, not a new validation, publication or history architecture. **No transaction, publication, history or validation-rule change is proposed.** Only duplicate work on the same immutable graph and avoidable leaf/setter overhead will be removed. Full canonical/destination validation and ordinary Undo/Redo remain. Changes affecting those contracts would cross the brief's architectural review boundary and will be presented as options rather than implemented speculatively.

A timeline/CPU trace and a larger synthetic fixture are being collected separately from acceptance timing. Detailed rendering attribution and before/after qualification belong in the final performance report. Frame waiting is not labelled entirely as paint: it can include layout, scheduling and idle time.

### Trace addendum, before the Page-lookup change

The completed [source-mapped trace summary](artifacts/tei-performance/admission-before-render-summary.json) identifies `pageForNode` as another concrete hot path: approximately 29 ms self time, plus shared Solid store/proxy work, rebuilding a parent map across every projected Cell during opening. `BlockQueries.ancestorPath`, already exposed through the imported `ancestorPath` helper, traverses structural children/owned relations only and preserves this query's exclusion of inline Cells. Replacing this particular map-building lookup with that existing query is a fourth local remediation, not a minimap UI or rendering redesign. A bounded-work test will assert zero projection-table enumerations and preserve inline-Cell behaviour.

In this profiled sample, synchronous open took 450 ms; the subsequent 167-ms interval contained about 102 ms layout and 26 ms paint. Source-mapped exclusive CPU samples attribute about 176 ms to Solid store work, 55 ms to projection code, 42 ms to minimap queries, 25 ms to direct Cell construction, and 32 ms to GC. These are diagnostic samples with tracing/profiling overhead, not additional durations to add to the acceptance medians; DOM-native operations and reactive execution can nest within these intervals.

### Implementation disposition

The fresh-record bulk-setter experiment was tested and **reverted**: five-run median publication increased from 107.1 to 126.5 ms for the large letter and from 357.3 to 463.3 ms for the anthology. Reducing setter call count did not reduce actual work. The final implementation retains the original per-record publication inside its existing atomic batch. The capture reuse, leaf-validation allocation reduction and structural Page-query reuse remain, with compatibility tests. The final results and architectural review boundary are recorded in [the performance report](NATIVE_DOCUMENT_ADMISSION_PERFORMANCE_REPORT.md).

## Environmental exclusion

An initial diagnostic run exhausted disk space while writing its isolated Chrome profile. It also had a bad first assertion that treated Flint's later tab commit as another admission. Neither incomplete run is used as the baseline. Inactive `tei-smoke-*` profiles created by these qualification scripts were removed; user profiles/documents were not touched. The twenty complete baseline samples above were collected afterward, with several GiB available. Slow samples within that complete baseline were retained.
