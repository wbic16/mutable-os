# Quill M0 implementation report

Date: 21 November 2026. Scope: the user's revised milestones and M0 authorisation. The [revised implementation brief](IMPLEMENTATION_FEATURE_BRIEF.md) brings the real application host into M0, combines initial Latin SVG input and basic geometry in M1, and separates full shaping/input qualification from that first product milestone.

**Recommendation: the bounded M0 foundation is complete; M1 can be reviewed and begun next.** This is not completion of Quill's typography experience. The production foundation uses native text rendering. Direct SVG typing, curved caret/selection and geometry handles remain M1 work. The experimental Latin fitter was not promoted into production.

## Implemented boundaries

| Area | Implementation and evidence |
|---|---|
| Feature | `quill` defaults on in [configuration](../../../src/configuration.ts). Disabling it removes the application/commands and uses the existing unknown-Block child renderer. Native Ink content remains intact. |
| Native schema | [model.ts](../../../src/features/quill/model.ts) defines the versioned `mutable/svg-text-composition-block`: viewport, source roles, line/sine path data and ordered flow associations. Finite numeric bounds, unique roles/path/flow IDs, valid associations and array limits are checked. No duplicate text string, Cell store or history. |
| Ownership and conversion | [quill-operations.ts](../../../src/application/quill-operations.ts) captures a source occurrence and revision, rejects stale/partial/shared sources, checks current native ownership and Document identity, then inserts a wrapper and moves the existing TextBlock in one structural transaction. Native content/placement identity, legacy Cells where applicable, standoff segments and linked Gloss definitions are preserved. Opening/cancelling does not convert or alter the source Document. |
| Real application | [quill.tsx](../../../src/application/quill.tsx) registers `quill.open`, `quill.edit`, the application and the composition renderer. [QuillShell](../../../src/features/quill/shell.tsx) supplies native Document tabs, a library, new/open/save controls and a contextual confirmation/return panel. Ordinary native Blocks use existing rendering infrastructure. |
| Shared host | [document-application-capabilities.tsx](../../../src/application/document-application-capabilities.tsx) now derives launch IDs, labels and titles from registration instead of hardcoding `flint.open`. It accepts a requested Document, optional initial Documents and a presentation handoff. [Shared tab construction](../../../src/application/document-application-tabs.ts) preserves Flint's existing DTO shape. The host exposes native Document creation and an identity-only active-Document accessor; library highlights do not subscribe to dirty status. |
| Managed presentation | Quill uses the existing managed Window, retained Document sessions and application presentation registry. A small WorkspaceSession callback brings its Desktop presentation forward when invoked from another mode. Return restores the originating mode and occurrence; Textual's grid/retained-editor attachment is awaited with the existing window readiness guard. No source Document is converted merely to switch modes. Desktop and Textual are qualified; exhaustive Canvas/Spatial workflows remain follow-up coverage. |
| Contextual invocation | The same command is available from the generic Block context menu, Document actions and command registry in Flint and generic native Document windows. Return restores native selection and connected scroll containers, using the existing rebased selection when available. Missing/deleted origins or superseded navigation produce a message rather than guessing a new source. Return does not Save. |
| Clipboard | [clipboard admission](../../../src/features/quill/clipboard.ts) validates the composition and its local references to independently owned native TextBlock children before the existing [materializer](../../../src/interchange/materialize.ts) activates the type. The existing serializer/remapper allocates independent Block/property/definition identities. Forged carriers, external source references and unsupported versions remain opaque. Tests exercise both the transport model and mounted copy/paste event handlers. |
| Persistence | Native `NativeDocumentSession` and `createDocumentSave` remain authoritative. New Documents are marked as unsaved candidates. Toolbar Save and Command-S/Control-S use the active Document's native save route. The real-server test verifies unchanged bytes/no requests before Save, same opened `.ink` filename, dirty-to-clean transition, geometry/text/annotation preservation and reopen equality. No background Save or Markdown sidecar. |
| Compatibility | Flint keeps `flint`, `flint.open` and `flint-application-block`. Acetate remains the existing `acetate` placeholder; saved placeholders are not renamed or reinterpreted. Quill gets a separate desktop entry, `quill-application-block` and managed-desktop descriptor identity. Existing managed-desktop tests cover unchanged descriptor behavior. |

The application's own launch still creates an ordinary workspace Window/tab arrangement, as Flint does. That is workspace UI structure, not conversion or mutation of the source Ink Document. Context/return bookmarks are session-only and are not written into the application or composition payload.

Flint's existing Document detachment controls remain Flint-specific; they are not advertised as a Quill detachment feature. Quill still uses ordinary managed windows and native Document tabs.

## Source extension contract

The initial conversion creates the local role `body`. Its native `codex/block-reference` Block property has `metadata.quillRole: 'body'` and points to the existing owned TextBlock. Roles are local names, not global/property identities: native copying can regenerate property IDs and remap Block targets without breaking flow associations.

The schema already contains arrays of sources and flows. A second title source can own its own TextBlock, annotations, path and flow without concatenation; a two-source clipboard test proves this. Source order and native reading order are explicit. Per-source positioning, effects and layer order can be added through a reviewed composition schema revision. They must remain geometry/style data and must not become another text store. Native child Block formatting/standoff remains authoritative.

Whole-Block conversion is the only conversion UI in M0. A collapsed caret selects its paragraph; a nonempty partial selection is rejected with an explanation. Independent compose-from-selection and proper partial extraction remain M2, with split/overlap/affinity/undo qualification. References/transclusion remain separate deliberate operations, not a hidden copy mode.

The investigation's experimental `sourceRole: primary` payload is not a released native schema. It remains isolated in `src/qualification/quill`; its browser fixture explicitly disables the production Quill feature to avoid competing registrations. No automatic migration rewrites experimental or unknown payloads. Native unsupported data keeps its children; unsupported clipboard data is quarantined.

## Validation

Reproduction from the repository root:

```sh
npm run typecheck
npx vitest run --maxWorkers=2 --minWorkers=1 src/features/quill src/application/quill.test.tsx src/application/flint-lifecycle.test.tsx src/application/flint-vault.test.tsx src/application/document-host-presentations.test.tsx src/application/desktop-applications.test.tsx src/interchange/clipboard.test.ts src/persistence/managed-desktop.test.ts src/qualification/quill
node experiments/quill/run-m0.mjs
```

All **20 focused M0 tests** pass: schema/ownership/conversion, mounted application/clipboard/presentation and real-store persistence ([focused results](../../../experiments/quill/m0-evidence/m0-tests.txt)). The wider suite reports **137 passing tests and one inherited failure** ([regression results](../../../experiments/quill/m0-evidence/tests.txt)). Client and server [type checking](../../../experiments/quill/m0-evidence/typecheck.txt) pass; all **18 browser checks** pass with zero runtime errors ([checks/timings](../../../experiments/quill/m0-evidence/browser-results.json)). The [validation index](../../../experiments/quill/m0-evidence/validation.json) records commands and outcomes.

**Known baseline failure:** `flint-lifecycle.test.tsx`, “closes a Flint window without changing Documents or History and keeps it closed after saving”, expects zero remaining transient projections immediately after close and observes one. It reproduces with **all tracked changes restored to HEAD `7cabf8444f73cafd62a27cc062aba062460437f5`**, before reapplying this work. [Baseline log](../../../experiments/quill/m0-evidence/baseline-flint-close.txt). The broad regression suite is therefore not described as entirely green. No unrelated lifecycle rewrite is included in M0; resolve this inherited close-cleanup issue before a full product release.

Screenshots show actual production M0 components in an isolated fixture:

- [Conversion confirmation](../../../experiments/quill/m0-evidence/confirmation.png).
- [Native composition and mixed Document in Quill](../../../experiments/quill/m0-evidence/native-foundation.png).
- [Return to Textual](../../../experiments/quill/m0-evidence/textual-return.png).

The browser fixture deliberately disables file persistence, so its Save/Open controls are disabled. Persistence is exercised against an automatically removed temporary store in the server test. The fixture does not touch user files. The browser runner creates an isolated Chrome profile and removes it on exit; set `CHROME_BIN` or `QUILL_OUTPUT` to override those runner defaults.

## Bounded-work evidence

The model tests compare 0 and 500 unrelated Blocks, instrument their payload reads and repository snapshots, and exercise typing plus Undo/Redo. They observe zero unrelated payload reads, zero snapshots and one affected source record per compact-text operation. Conversion uses the existing affected-record structural transaction.

The browser runner reuses the real Flint typing benchmark (`experiments/initialis-adapter/browser.js`), including handler-driven and trusted CDP input, before/after conversion. There are 200 unrelated paragraphs. The probe explicitly observes their mounted roots and the Quill library, rather than leaving the unrelated-root counters empty. Trusted samples report zero broad planning, full validation, snapshots, requests, projection rebuilds, unrelated geometry reads and unrelated DOM mutations. Conversion is separately checked for zero broad planning/full validation.

Two mounted occurrences of the same affected text are visible after opening Quill. Accordingly the existing native geometry work doubles from 40 element/20 range reads to 80/40 per 20 trusted events; this is work for two affected occurrences, not unrelated Blocks. Quill M0 adds no glyph fitter, range-decoration renderer or geometry cache. It reuses native input and rendering. The native save test also checks zero persistence requests/snapshots during text, geometry and annotation edits.

Timings are short headless Chromium diagnostics, not a production latency guarantee. Full SVG layout, multiple active compositions, long text with mixed formatting, backgrounds/decorative layers, downstream convergence, font invalidation and cross-browser input performance remain M1/M2 release gates. The revised brief explicitly requires those richer benchmarks. No claim is made that M0 proves production typography performance.

## Assets and remaining work

No third-party typography/geometry code or new runtime dependency was adopted. The small [desktop icon](../../../src/assets/quill.svg) is original SVG under the repository's MIT licence; it is a functional launcher asset, not a claim to reproduce the approved illuminated identity. No fonts or ornaments were bundled.

The referenced images remain unavailable at their supplied locations: `01_quill_identity.png`, `02_raven_editor.png`, `03_quill_integration.png`, `04_raven_capabilities.png`, `05_flint_family.png`, `06_phosphor_family.png`, `07_mutable_os_family.png`. The written direction remains authoritative; pixel fidelity to those images has not been asserted.

Next work is M1: direct Latin caret/selection/editing on straight and curved SVG, linked-path reflow, visible line/sine geometry handles, native undo/standoff and realistic bounded-work measurements. Follow with full shaping/IME/RTL/accessibility/cross-browser qualification and partial-range extraction. Advanced Bézier tools, multi-source UI, layers, ornaments and publication remain later milestones.

M0's native text surface is a foundation, not the final direct-SVG interaction. No advanced typography, ornamental UI, external-editor adoption, parallel document format or automatic persistence was implemented in this pass.
