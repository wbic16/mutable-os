# Increment C — Contribution notices and activity controls

Implemented 2026-11-10. Feature flag: `dialecticContributionActivity`, enabled by default.

## Delivered

Committed contributions now show compact, actionable activity controls beneath their native content in Desktop and Textual. Categories distinguish source annotations, generated formatting, references, and created Glosses, Arguments, Entities and relationships. Selecting a category opens a filtered section of the existing inspector; item actions reuse native inspection, source navigation and temporary SVG previews. Hidden Surface faces and tabs are revealed through existing local navigation.

Counts resolve recorded native identities against current ownership, provenance, deletion, attachments and endpoints. Range anchors, Gloss attachment properties and structural infrastructure do not inflate annotation counts. Referencing an existing Entity is distinct from creating one. Unavailable effects remain inspectable but are excluded from active counts. Empty categories disappear.

Historical notices are separate from current activity. Optional native contribution notices use typed `InterchangeDiagnostic` conventions. Successful validation repair produces a notice from actual retained repair provenance. The model cannot submit notification claims through DCP. Fallback/conversion codes are reserved for host outcomes; no fallback or task-expectation mechanism was implemented.

The existing contribution records and `DialecticReferences` index supply the activity data. Per-contribution caches use native membership and definition signals, excluding ordinary offset rebasing. There is no second semantic registry, background save, new renderer or Document scan per contribution render. Existing canonical transactions, immutable authored content and manual saving remain in place.

One related defect was corrected: native owned margins were omitted from generated annotation receipts and Gloss-target lookup. Both now traverse host-prepared named ownership as well as ordinary children; a focused marginal Highlight/Gloss test covers this path.

## Qualification

- All **102 Dialectic tests pass**, including nine new activity tests and updated native-inspection/repair assertions.
- DCP validation, capability catalogue, configurable vocabulary, provider and Textual application suites pass. The combined seven-file run passed **183 of 184 tests**. The workspace-presentation test at `workspace-presentation-view.test.tsx:80` expects no Close-window button in Canvas; the identical assertion fails in an isolated, unchanged `b6ec30b` checkout (7/8 pass there). It is a pre-existing failure, left unchanged.
- `npm run typecheck` passes for both reactive and server projects; `git diff --check` passes.
- Checks cover actual mounted controls, keyboard-accessible labels and focus, filtered inspection, creation versus reference, missing/deleted/forged effects, Undo/Redo, native persistence/reload, repair notices, human references, hidden-source navigation, disabled mode and Desktop/Textual switching without duplicate controls or remounts.
- Ten source-text rebases leave activity candidate/resolution counters and activity DOM unchanged. No passage-text reads, tree visits, snapshots, projection rebuilds, structural transactions or network requests are added by those summary checks. Explicit inspection resolves the current range afterward. Existing unrelated-Document bounded-work tests also pass.
- Textual hosting is tested with supplied font/viewport measurements in jsdom; this is functional qualification, not browser visual certification.

## Limits

Earlier contributions can expose their recorded effects immediately. Missing historical receipts are disclosed as incomplete rather than reconstructed from prose. Human-selected references are supported; historical human annotations without contribution attribution are not assigned retrospectively.

Vault-scoped identities/endpoints are conservatively shown as unavailable or requiring scoped inspection: this passive summary does not initiate background Vault lookups. Counts describe verified current native effects, not proof that every natural-language request was fulfilled.

The real Chrome typing benchmark was attempted with the Dialectic fixture, but isolated Chrome startup timed out with display-link errors (`CVDisplayLinkCreateWithCGDisplay`, `-6670`). No browser latency or visual-performance result is claimed. `BENCHMARK_ACTIVITY=off` now permits comparison with the feature disabled when Chrome is available.

Markdown fallback, media acquisition, contribution editing and task-expectation enforcement remain deferred.
