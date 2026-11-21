# Compact canonical text experiment

Test-only, removable qualification. No production entry point imports this folder. No feature registration, native schema change, migration, autosave, viewport virtualization or shadow canonical Cell repository is installed.

Read `../../COMPACT_CANONICAL_TEXT_MILESTONE_2_IMPLEMENTATION.md` for current evidence and `../../COMPACT_CANONICAL_TEXT_MILESTONE_2_ARCHITECTURAL_QUALIFICATION.md` for the production boundary. The accepted first proof remains in `../../COMPACT_CANONICAL_TEXT_PROOF_OF_CONCEPT.md`. This is **not** a production repository implementation or a claim of Flint parity.

- `model.ts`: compact immutable Block state, native structural witness, inline payload checks, affected-Block commits, indexed occurrence subscriptions, local history and restricted structural operations.
- `presentation.ts`: eager occurrence-local editing Cells using `DirectCharacterCells`; separate Cell-free styled runs using existing standoff style rules.
- `editor.ts`: actual `InputGateway`, mounts, focus, selections, measurements and provisional Cells through bounded test adapters. Nominal casts explicitly mark unqualified service interfaces. Unsupported commands throw.
- `cell-oracle.ts`: current `CanonicalRepository`/`TreeCommands` behind the same minimal presentation for controlled comparisons. It is not the full-Flint baseline.
- `fixture.ts`, `model.test.ts`: mixed objects, ownership, references, Unicode, overlapping properties and differential tests.
- `main.ts`, `build.mjs`, `browser.mjs`: isolated production bundle, forbidden-Cell construction probe, trusted browser editing checks and comparative measurements.

The user approved equivalent point rebasing with each serialized form retained. That is the default in this experiment. `pointPolicy: 'legacy'` is solely the differential baseline; production's current inconsistent rebasing remains unchanged. This option is not persisted.

## Reproduce

From the repository root:

```sh
npx vitest run scripts/compact-canonical
npx tsc --noEmit --project scripts/compact-canonical/tsconfig.json
npm run typecheck
node scripts/compact-canonical/build.mjs
python3 -m http.server 3112 --bind 127.0.0.1 --directory artifacts/compact-canonical-m2/site
```

In another terminal:

```sh
node scripts/compact-canonical/browser-m2.mjs
node scripts/compact-canonical/performance-m2.mjs
```

`COMPACT_CHECKS_ONLY=1` runs browser checks without the performance matrix. `COMPACT_RUNS` defaults to three. `COMPACT_CASES=long` selects the additional single 120,624-character paragraph stress case; it uses four dispatch samples per round. `COMPACT_OUTPUT` selects a separate evidence directory. `COMPACT_URL` selects another server URL. Chrome uses a temporary, isolated profile which is removed on completion. The runner uses the installed macOS Google Chrome executable.

The ordinary native fixture defaults to `vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink`; set `COMPACT_NATIVE_PATH` to another ordinary native file when reproducing outside this workspace. Input is read only, with path/size/SHA-256 recorded. No fixture content is copied into tracked evidence. The WeGA and anthology inputs are generated through existing preparation before timing admission; their preparation time is excluded.

M2 results go to ignored `artifacts/compact-canonical-m2/`: browser assertions, known-gap observations, screenshot and complete stage/memory/CPU metrics. The report retains the significant numerical results. Benchmarks run serially. Do not run tests/builds or another performance suite concurrently. The comparator uses the same minimal renderer as the experiment, not Flint. Only the separate existing Flint benchmarks can speak to production acceptance.

A build-only guard throws if the existing native decoder constructs any text/image Cell during compact admission or read-only rendering. Logical editing allocations are independently counted. Memory samples include post-GC retained JS heap and stage-boundary observations; they do not measure a true peak or isolate GC duration. No viewport virtualization is used.

## Deliberate boundaries

The compact workspace index tests new-resource/Block-ID collisions, but does not implement production admission's reuse, live foreign binding, Object Bank publication or index maintenance after structural changes. M2 qualifies browser split/join and exactly two adjacent Blocks for cross-replacement, including shared split references and selection history. Clipboard, multicaret, production annotation monitors, active alternatives and exact-history replay are not adapted. The flat read-only surface displays standoff definitions, not a full Document layout. It preserves all canonical data but does not render every Block class, themed Block property, linked-definition overlay, SVG effect, concealment or active alternative. Managed assets require the production asset binder.

M2 closes the first proof's mixed-object IME and noncollapsed Undo-selection gaps within the experimental adapter. Selection containing an image during composition is rejected with a retained draft; overlapping external mutations also retain a conflict draft. Production input semantics remain unchanged. OS-specific IME integration and production history remain unqualified.

## Separate production sentinels

Build `scripts/cell-materialisation/build.mjs` and serve its output on port 3113, then run `node scripts/compact-canonical/flint-sentinel.mjs`. This reuses the existing full-Flint runner for small/large WeGA, redirecting evidence into this experiment's artifact directory. It does not overwrite the earlier investigation's results. The diagnostic bundle includes probes, so its numbers are not interchangeable with the earlier uninstrumented acceptance series.

The ordinary native production typing sentinel uses the existing command:

```sh
BENCHMARK_OUTPUT=artifacts/compact-canonical/flint-typing node scripts/benchmark-flint-typing-browser.mjs
```

The additional recorded runs used:

```sh
COMPACT_CASES=long COMPACT_OUTPUT=artifacts/compact-canonical/long node scripts/compact-canonical/browser.mjs
COMPACT_CASES=native COMPACT_OUTPUT=artifacts/compact-canonical/native node scripts/compact-canonical/browser.mjs
```

The native follow-up waits for teardown frames before sampling its initial heap, avoiding delayed cleanup of the populated scenario in the earlier matrix. Per-stage timings still exclude those setup frames. Retained-definition ordering was subsequently aligned with the existing native writer and covered by a regression test; final browser checks/build/typecheck passed. The timing fixtures' retention arrays are empty, so no new timing claim is made for that serialization-order correction.

## M2 build boundary and measurements

Use Node 22 (the workstation also has an older `/usr/local/bin/node` that cannot start Vitest). `COMPACT_M2` defaults to enabled; `COMPACT_M2=0 COMPACT_SITE=artifacts/compact-canonical-m1-control/site node scripts/compact-canonical/build.mjs` loads the accepted experiment's model/editor/presentation from commit `f3ea056`. Use `browser.mjs` against that baseline, not the M2-specific correctness runner. `COMPACT_SITE` selects build output. Production never imports either mode.

`overlays.mjs` applies fail-closed **build-only** changes to the existing character renderer and grapheme access in InputGateway/CrossBlockInput. No production source is rewritten. These overlays prove proposed narrow ports; they are not shipped production APIs. `composition.ts` owns the experimental completion session; `editing-index.ts` supplies occurrence-local rank/grapheme access.

`performance-m2.mjs` measures beginning/middle/end insertion, deletion, combining-grapheme Backspace, Undo/Redo and selection with one/two live occurrences, retaining CPU samples, exclusive instrumented costs, layout counters and post-GC heaps. `COMPACT_MODES`, `COMPACT_ROUNDS` and `COMPACT_OUTPUT` select runs. These detail timings use dispatched beforeinput events; trusted CDP input is separately checked by `browser-m2.mjs`. Do not describe synthetic timings as physical keyboard latency. Existing M1 results retain their original input path and sampling.

Run benchmarks serially without concurrent builds/tests. The final report lists failures, superseded observations and incomplete production contracts. Raw evidence is ignored by git; the tracked report retains key results. No native input is saved or modified.

For fresh M2 production sentinels without overwriting the first proof's evidence:

```sh
BENCHMARK_OUTPUT=artifacts/compact-canonical-m2/flint-typing node scripts/benchmark-flint-typing-browser.mjs
COMPACT_OUTPUT=artifacts/compact-canonical-m2/flint-release node scripts/compact-canonical/flint-sentinel.mjs
node scripts/compact-canonical/summarize-m2.mjs
```

The detail runner releases the preceding profiler closure before teardown/baseline GC. Otherwise the previous model would contaminate post-edit heap deltas. Preserve superseded diagnostic runs separately; use the corrected results for memory interpretation.
