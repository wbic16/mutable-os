# Quill M1 — direct SVG editing

The production M1 surface is registered under the existing default-on `quill` flag. Open a native paragraph in Flint, choose **Edit in Quill**, confirm conversion, and edit the visible SVG. **Three linked waves**, **Paths**, the inspector and handles reshape/reflow the native text. **Native text** is an explicit presentation fallback; Save stays manual.

See the [M1 implementation report](../../docs/development/quill/M1_IMPLEMENTATION_REPORT.md), [dependency/licence report](../../docs/development/quill/M1_DEPENDENCIES_AND_LICENCES.md), and [evidence index](m1-evidence/validation.json).

```sh
node experiments/quill/run-m1.mjs
npx vitest run --maxWorkers=2 --minWorkers=1 src/features/quill src/application/quill.test.tsx
```

The browser fixture is `/src/features/quill/browser.html`. It uses production components with file persistence disabled; the mounted persistence test exercises the real native store separately. See the report for full regression commands, timing limits and the inherited Flint close-cleanup failure.

The following M0/investigation material is historical.

# Quill M0 foundation and investigation evidence

The authorised M0 implementation is described in the [M0 report](../../docs/development/quill/M0_IMPLEMENTATION_REPORT.md), with the [revised milestones](../../docs/development/quill/IMPLEMENTATION_FEATURE_BRIEF.md). In the real application, use the Quill desktop launcher or **Edit in Quill** from a native TextBlock. The `quill` flag defaults on.

```sh
npm run typecheck
npx vitest run --maxWorkers=2 --minWorkers=1 src/features/quill src/application/quill.test.tsx
node experiments/quill/run-m0.mjs
```

M0's browser fixture is `/src/features/quill/browser.html` on the existing Vite client. It renders the production application with isolated in-memory data; file persistence is disabled there. The real-store persistence test writes only to an automatically removed temporary directory. `m0-evidence/` contains actual managed-window screenshots, trusted Flint typing probes and validation results. The broad regression log includes a separately reproduced pre-existing Flint close-cleanup failure; see the report.

M0 provides native text editing, whole-paragraph conversion, standard native clipboard admission, multiple-source schema extensibility and the real Document/application host. Direct SVG typing and geometry handles remain M1; M0 is not the finished typography interaction.

## Historical investigation experiment

See the [qualification report](../../docs/development/quill/QUALIFICATION.md) and [proposed implementation brief](../../docs/development/quill/IMPLEMENTATION_FEATURE_BRIEF.md).

This is an isolated, default-enabled qualification fixture, not a shipped app. It uses the actual native Block model, Flint shell, generic native editor and native save coordinator in tests. No production modules import the experiment. Project dependencies were not changed.

```sh
npx vitest run src/qualification/quill
npx tsc --project experiments/quill/tsconfig.json
node experiments/quill/run.mjs
```

The runner starts Vite and an isolated headless Chrome profile and writes screenshots/results under `experiments/quill/evidence`. Set `CHROME_BIN` to choose Chrome and `QUILL_OUTPUT` to choose an evidence directory. It reuses the real Flint benchmark probes in `experiments/initialis-adapter/browser.js` and compares the same source before and after conversion. Timing is diagnostic, not a user-visible latency guarantee.

Interactive: run `npm run dev:client` and visit `http://localhost:3000/src/qualification/quill/browser.html`. Select **Edit in Quill**, then confirm paragraph conversion. Type in the temporary native editor beneath the canvas, change amplitude/swell/opacity, or use the insertion and Undo buttons. Return to Flint, switch the host to the native editor and reopen. `?quill=off` disables activation. No browser fixture file saves occur; **Capture Ink in memory** is explicitly a codec probe. The persistence test alone writes to an automatically removed temporary store through the real coordinator/router.

The separate editor beneath the composition is temporary. The intended product requires direct canvas typing, selection, IME and annotations over the same canonical native text. The experiment does not claim that work is complete.

The three-path renderer supports a limited Latin proof, maps grapheme spans to canonical code-point ranges and emits explicit diagnostics for unqualified shaping. It does not shape ligatures or complex scripts. A full renderer must supply shaped clusters and reverse mappings, shared caches and incremental downstream convergence.

Core native copying succeeds; standard clipboard import currently makes the unknown type opaque. This is an intentionally recorded qualification gap, not an alternative implementation of the system clipboard.

To reproduce published-package inspection:

```sh
node experiments/quill/audit-dependencies.mjs
```

This creates a temporary package project, resolves four pinned root versions, verifies archive integrity, inventories licence files/assets, and measures minified browser ESM whole-export bundles. Dependency lifecycle scripts are disabled. The directory is removed afterwards. Resolved transitive versions can change on a later audit; the checked-in lock and integrity values identify this run. Licence metadata is not full legal clearance, and the report identifies incomplete candidate/asset audits. No external source was adopted.
