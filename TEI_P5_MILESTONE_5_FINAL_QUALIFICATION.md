# TEI P5 Milestone 5 — final qualification and closure

**Recommendation: close Milestone 5 and release the current importer for its qualified prose/correspondence use cases.** The matched comparison does not reproduce the historical import/rendering regression. No application-code correction is justified by these results. Retain `inlineAlternativeInteroperability` enabled by default and the accepted limitations.

## Matched performance

Compared accepted M4 **`f249c72`** with accepted M5 **`8843e6a`**, with no application-source changes. Same Apple M1 MacBook Air, 8 GiB RAM, macOS 15.5; Chrome **157.0.8103.80**; production Vite build, normal minification, source maps off, 1440×900, device scale 1, no CPU throttling. Builds/tests did not overlap the measurements.

Both builds use the exact M4 harness entry and identical pinned WeGA fixtures/derived anthology. The baseline restores every changed application module in both main and worker pipelines; an accidental M5-only module import fails the baseline build. Manifests record refs, source differences, restored paths and matching harness/fixture hashes. The existing benchmark and correctness checks are unchanged.

Three alternating batch pairs: **M4→M5, M5→M4, M4→M5**. Each batch opens a fresh isolated Chrome profile and runs small, large, anthology in that order. All **18 samples** are included. Timing boundaries match the existing benchmark: usable text includes worker round trip, admission, candidate registration and opening through two animation frames. Capture and manual Save are measured separately after typing/Metadata checks; Save uses an in-memory adapter, excluding disk I/O.

| Fixture | M4 usable median | M5 usable median | Difference | M4 / M5 Metadata medians |
|---|---:|---:|---:|---:|
| Small WeGA | 136.8 | 138.0 | +0.9% | 100.9 / 99.6 |
| Large WeGA | 475.1 | 471.7 | -0.7% | 166.4 / 165.8 |
| Derived anthology | 1706.7 | 1718.7 | +0.7% | 506.0 / 515.9 |

All values below are milliseconds, **median [minimum–maximum]**, n=3 per version/fixture. Stage medians do not necessarily sum to the median total. Worker conversion is the converter's `conversionTotal`; round trip also includes worker startup, encoding and dispatch. Full worker elapsed medians are recorded separately below.

### Small WeGA

| Stage | M4 | M5 |
|---|---:|---:|
| Worker conversion | 8.3 [8.2–9.4] | 8.5 [8.3–9.3] |
| Worker round trip | 45.4 [44.0–56.9] | 44.8 [44.0–45.7] |
| Native admission | 24.4 [24.3–25.1] | 25.8 [24.8–30.6] |
| Candidate registration | 3.4 [3.3–3.4] | 3.4 [3.3–4.1] |
| Flint open/render | 64.0 [63.6–72.0] | 64.2 [63.2–69.5] |
| Usable text | 136.8 [135.7–157.3] | 138.0 [137.2–148.2] |
| Metadata activation | 100.9 [99.6–101.4] | 99.6 [83.2–99.7] |
| Native capture + encoding | 7.1 [6.8–9.1] | 7.0 [6.8–7.2] |
| Manual Save coordination | 13.6 [13.2–19.3] | 14.4 [14.2–15.6] |

### Large WeGA

| Stage | M4 | M5 |
|---|---:|---:|
| Worker conversion | 13.3 [13.2–13.4] | 13.4 [13.3–13.4] |
| Worker round trip | 46.9 [46.9–47.3] | 47.3 [46.7–47.4] |
| Native admission | 28.4 [28.2–28.5] | 28.3 [27.9–28.4] |
| Candidate registration | 3.6 [3.6–3.6] | 3.5 [3.5–3.6] |
| Flint open/render | 396.4 [383.9–403.1] | 393.2 [385.7–395.4] |
| Usable text | 475.1 [463.2–482.1] | 471.7 [464.5–474.7] |
| Metadata activation | 166.4 [166.3–167.5] | 165.8 [165.3–166.2] |
| Native capture + encoding | 10.5 [10.4–10.7] | 11.7 [11.5–11.7] |
| Manual Save coordination | 24.1 [24.0–24.3] | 24.2 [23.8–24.4] |

### Derived anthology

| Stage | M4 | M5 |
|---|---:|---:|
| Worker conversion | 27.2 [27.1–27.9] | 27.3 [27.0–27.5] |
| Worker round trip | 83.7 [83.0–87.8] | 84.0 [83.1–84.7] |
| Native admission | 108.4 [108.0–108.4] | 108.1 [107.6–108.2] |
| Candidate registration | 13.1 [12.9–13.2] | 12.9 [12.8–13.1] |
| Flint open/render | 1498.6 [1497.3–1524.0] | 1514.9 [1506.1–1527.7] |
| Usable text | 1706.7 [1703.4–1728.3] | 1718.7 [1711.9–1732.6] |
| Metadata activation | 506.0 [502.0–519.3] | 515.9 [500.7–516.9] |
| Native capture + encoding | 39.5 [39.4–44.0] | 43.2 [41.4–44.5] |
| Manual Save coordination | 78.5 [78.2–78.8] | 79.5 [78.9–86.5] |

Full worker elapsed medians (M4→M5): small **13.9→14.2**, large **22.1→22.3**, anthology **58.0→58.2 ms**. Detailed encoding, admission, observer and projection timings remain in the raw evidence.

## Interpretation and correction decision

The historical **57–65%** usable-text increase is **not confirmed**. The unchanged M4 baseline now takes 136.8 / 475.1 / 1,706.7 ms itself, versus its historical 74.4 / 301.4 / 1,093.4 ms. Under matched conditions the versions are close, with overlapping usable-text ranges and mixed paired directions for the letters. This supports between-session measurement variation as the explanation for the historical discrepancy; it does not identify a particular CPU, memory, browser-cache or scheduling cause.

The anthology's three M5 usable samples are modestly higher in their pairs (8.5 / 12.0 / 4.3 ms), with overlapping ranges and a **0.7%** median increase. Small-letter admission and isolated capture also differ: large/anthology capture medians increase **1.2 / 3.7 ms**; corresponding Save medians increase **0.1 / 1.0 ms**. These are retained observations, not attributed to a particular code path. They do not establish the reported broad regression or justify extending this bounded exercise.

Every letter sample passes the original release targets. M5 maxima: small usable **148.2 < 500 ms**, large **474.7 < 1,000 ms**; Metadata **99.7 / 166.2 < 250 ms**. Anthology remains informational; opening/rendering still dominates its total.

Existing targeted counters show the same **15 change observers, one admission publication, one workspace projection build and one registration** in both versions, with zero unrelated Document builds. No new snapshot is taken. Source inspection confirms clipboard serialization/closure preparation is invoked by clipboard commands, not admission or Metadata activation. M5 adds capability detection at explicit encoding/parsing boundaries and affected-record projection eligibility checks; it adds no renderer subscription, focus/layout operation or background serialization to these workflows. The unchanged worker conversion and native admission timings provide no evidence for a new expensive validation path.

**No application correction or speculative optimization was made.** Changes in this closure are reproducible qualification scripts/documentation only. Three repetitions answered the specific historical-regression question; further runs are unnecessary for closure.

## Final regression qualification

- **239 tests / 13 files passed**: native clipboard fidelity, cut/paste/history, fresh slot and reading identities, local definitions/images, cross-Document transfer, malformed capability rejection, joins/boundary annotations, cross-paragraph replacement, retained nested definitions, TEI conversion/grouped fallback, compact admission, native Save/reopen and affected-occurrence/dirty-state checks.
- All **18 production import runs** retain one Page, complete imports, zero canonical character Cells, zero admission/typing snapshots, one coherent admission, native Save/reopen fidelity and restored text after typing. Projection probes reject unrelated Document rebuilding.
- Real Chrome/Flint clipboard qualification passed again: selected-reading external text, complete native payload precedence, nested/inactive readings, cut, same-host/cross-Document paste, caret, exact Undo/Redo and manual Save. Structural profiles with 0 versus 150 extra paragraphs retain identical affected-record counts and zero unrelated DOM mutations/projection builds/snapshots.
- The real Flint 499-character/eight-paragraph typing check passed: handler median/p95 **5.1 / 11.4 ms**, settled **7.1 / 16.3 ms**; original text restored, zero snapshots, aggregate status reads, service requests and worker starts. The matched import harness also records comparable typing p95s in both versions. Headless frame timing remains diagnostic, not an input-to-display guarantee.
- Both production builds, qualification-script syntax checks and `git diff --check` pass. No application TypeScript changed; the accepted M5 client/server typecheck and broader 600-test run remain applicable.

Persistent compact History, arbitrary structural paste, general apparatus alignment and full HTML/Markdown round-trip remain documented limitations, not closure blockers. Manual native Save, external untouched XML and the default-on feature remain unchanged.

## Focused TEI capability assessment

The [mapping catalogue](TEI_P5_MUTABLE_MAPPING_CATALOGUE.md) describes candidate native mappings, not implemented coverage percentages. Its earlier precise-point and inline-alternative gaps are substantially superseded by M2–M5. This assessment checks the current [converter](src/interchange/tei/convert.ts), [reference policy](src/interchange/tei/references.ts), [navigation](src/features/tei-import/navigation.ts), and accepted M2–M5 reports.

| Area | Semantic fidelity now | Native usability / reusable capability | Remaining work and relative effort |
|---|---|---|---|
| Apparatus and witnesses | Eligible inline readings are rich owned alternatives; other apparatus retains grouped editable readings and authored witness/reference observations. Cross-range alignment is not established. | Switching, editing and native transfer work. Witness-oriented discovery and explanation are missing. Reuse linked definitions, References inventories, `revealMatch` and occurrence-local reading selection. | **Medium:** witness/reading navigation over existing imports. **High:** collation or arbitrary apparatus alignment; distinct new functionality. |
| Facsimiles/source images | `facs`, source IDs and useful source geometry fields are retained where encountered. They do not establish verified image bindings or active alignment. | Exact page milestones already navigate text; IIIF/PDF viewers and captured-resource anchors exist independently. | **Medium:** explicit verified image/page association and bounded rectangular navigation. **High:** general polygons, transformations or automatic alignment. |
| Editorial hands/responsibility/provenance | Editorial definitions retain authored hand, responsibility, certainty, parent intervention and provenance facts; no inferred hand propagation. | Inspectable in existing annotations/Metadata, but no focused hand/responsibility inventory. | **Low–medium:** scoped filters and navigation using existing definitions. Temporal/genetic interpretation would require additional semantics. |
| Stand-off annotation/linking | Source tokens, order and resolution observations survive; arbitrary TEI selectors do not become live spans or graphs. | Mutable already supports linked multi-segment annotations and local relationships. | **Medium:** a qualified subset of uniquely resolved local anchor pairs. **High:** attribute selectors, virtual joins and arbitrary hypergraphs. |
| Tables, figures and complex structures | Generic recovery keeps readable descendants/useful attributes; table geometry and media display are not equivalent native mappings today. | Native tables, containers and image/resource Blocks can be reused, but their availability does not mean TEI conversion already uses them. | **Low–medium:** rectangular tables and figure/caption grouping. Merged cells, spatial layout and specialist notation need separate qualification. |
| Corpus navigation/relationships | Document-local people/places/organisations, explicit mentions and conservative binary relationships work. Cross-file identity resolution and corpus semantics are not automatically established. | Reuse document navigation, local Gloss references/graphs and existing resource links. | **Medium–high:** explicit cross-document bindings and collection workflow; no guessed canonical identities or automatic graph publication. |

## Next move

**Release the current importer with its documented scope.** It already imports authentic WeGA letters into editable native Documents with useful header, reference, editorial, milestone and alternative behavior. The two pinned real letters support an initial prose/correspondence release; they do not establish readiness for every facsimile, dictionary, table-heavy or critical-edition corpus. A small pilot using representative authentic documents from intended users is more valuable now than expanding the vocabulary matrix.

If a subsequent feature milestone is chosen, prioritize **witness and apparatus navigation**, driven by that pilot: list already imported apparatus/readings and authored witnesses, explain unresolved references, reveal the chosen reading in its current occurrence, and navigate live positions after edits. Reuse the References/Gloss inventory and existing reveal/switch behavior. Keep selection presentation-only, preserve every reading, and require no new canonical Entity type, collation engine, XML archive or XML synchronization. Qualify it against an authentic multi-witness edition before treating it as broadly useful.

No further feature milestone is required to close M5. Facsimile association or rectangular tables may take priority if the pilot's actual scholarly work requires them; they are not prerequisites invented for this release.

## Evidence and reproduction

[Harness instructions](scripts/tei-performance/README.md#matched-m4m5-closure-comparison) record the two production builds and alternating runner. Local evidence:

- `artifacts/tei-m5-closure/{build-m4,build-m5,matched,summary}.json`: source/harness/fixture proof, all samples and descriptive statistics.
- `artifacts/tei-performance/m5-closure-r{1,2,3}-{m4,m5}.json` and corresponding `-stages.json`: original benchmark output and stage checkpoints.
- `artifacts/tei-m5-closure/browser.json` and `typing/results.json`: final browser and ordinary typing checks.

Focused regression command:

```sh
npx vitest run src/interchange/inline-alternatives.test.ts src/block-tree/inline-alternative.test.ts src/rendering/compact-production.test.tsx src/rendering/mutable-clipboard.test.tsx src/interchange/tei src/persistence/native-session.test.ts src/persistence/native-vault-session.test.ts src/features/tei-import/navigation.test.tsx --maxWorkers=1 --minWorkers=1
```
