# Cell materialisation investigation evidence

These are diagnostic tools and contract characterisations, not a compact-canonical
implementation. They do not modify production modules, open user workspaces,
change document formats or save user documents.

The architectural result is
[CELL_MATERIALISATION_ARCHITECTURAL_QUALIFICATION.md](../../CELL_MATERIALISATION_ARCHITECTURAL_QUALIFICATION.md).

## Production browser diagnostics

```sh
NODE_OPTIONS=--max-old-space-size=8192 node scripts/cell-materialisation/build.mjs
python3 -m http.server 3110 --bind 127.0.0.1 --directory artifacts/cell-materialisation/site
# Separate terminal, after building and while no tests/builds are consuming CPU:
node scripts/cell-materialisation/inspect-browser.mjs
CELL_FLINT=1 CELL_RUNS=1 node scripts/cell-materialisation/inspect-browser.mjs
```

The build injects a probe into its output bundle only. It times native inline
construction and counts/times private content/placement/node key allocation.
Source matching fails if those implementation sites have changed. No unchecked
new decoder, compact canonical schema or alternate editor is introduced.

The four fixtures are the two existing WeGA letters, the exact previous twelve-
section synthetic anthology, and its thirty-section/120,624-Cell extension.
The larger documents are synthetic, not authentic editions. All semantics are
converted before admission. The existing full-Flint worker/admission/candidate/
open/two-frame/Metadata lifecycle is reused.

The default run prepares native bytes outside timing and separately retains a
parsed envelope, a full immutable decoded resource, or existing lightweight
knowledge facts. Three sequential rounds cover all four fixtures and all three
modes. The browser performs explicit GC before/after and reports heap used with
the result retained minus the cleared baseline. This is sampled retained JS
memory, not peak process memory or a claim that these outputs are equivalent.
Parsing is not semantic admission validation; facts are not a full native graph.
The initial small-facts warm-up is excluded and not a measured sample.

`CELL_FLINT=1` uses the real existing production Flint harness. Post-GC heap and
DOM counts are sampled after Metadata activation. Opening-phase ID counters also
include tab insertion and the letters' short typing probe. Workspace `build`
excludes registration; `projectionMs` is a subset of opening. Per-ID clocks and
probe bookkeeping distort timing: use these samples for attribution/counts,
not release acceptance or an alleged speedup over the previous report.

`CELL_URL` overrides the origin (default port 3110). The runner uses installed
Chrome and its own temporary profile, removes that profile afterward, and writes
JSON to ignored `artifacts/cell-materialisation/`. Each completed sample is saved.
`CELL_RUNS` overrides three default rounds (the report used one full-Flint round).
No source/fixture files are rewritten.

## Contract and ordinary native-open tests

```sh
npx vitest run scripts/cell-materialisation/native-open.test.ts src/persistence/native-resource.test.ts src/knowledge-sqlite/saved-facts.test.tsx src/knowledge-sqlite/saved-projection.test.tsx src/block-tree/compact-changes.test.ts src/block-tree/undo-storage-parity.test.ts src/input/graphemes.test.ts src/runtime/range-annotations.test.ts src/rendering/cross-block-selection.test.tsx
npx vitest run scripts/cell-materialisation/boundary-characterisation.test.ts
# Isolate the existing native session/router measurement from other test suites:
npx vitest run scripts/cell-materialisation/native-open.test.ts
npm run typecheck
```

Native Open copies `data/Document.mutable.json` unchanged into a temporary
`ordinary.ink`, opens it through the actual HTTP router/session five times into
fresh editor repositories, verifies clean binding/71 Cells/no projections and
unchanged file bytes, then removes temporary storage. It never saves the Document.
The router may create its normal local vault bookkeeping inside that temporary
root. The fixture is small; these jsdom measurements are functional/load-path
evidence, not full-Flint browser acceptance. The isolated timing run is the
report's normal-open result; the earlier suite-concurrent sample is separately
retained as `native-open-suite-run.json`.

Boundary tests characterize the current pure range transforms, Unicode coordinate
distinctions, native round trips with fresh private Cell keys, and the existing
two point-annotation conventions. They intentionally record that inconsistency;
they neither repair it nor propose new native semantics.
