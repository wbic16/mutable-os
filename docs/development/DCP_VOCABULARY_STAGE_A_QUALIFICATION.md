# DCP configurable vocabulary — Stage A qualification

9 November 2026. Stage A implements capability selection over the accepted native-backed authoring architecture. **All Qualified remains the default.** No graphical checklist or persistent Symposium settings are implemented; Stage B has not begun. Retained families 3C.2–3C.5 remain paused, and 3D/3E remain deferred.

## Selection contract

`VocabularySelection` contains `profile: 'all-qualified' | 'core' | 'general' | 'research'`, with optional `enable` and `disable` arrays of selection IDs. The host validates and copies configuration. Unknown IDs, conflicting/duplicate overrides and disabling the ordinary paragraph route are rejected. Each override array is bounded to 128 IDs.

At exchange creation, `resolveVocabulary` intersects that selection with qualified catalogue routes, current native features and renderer availability. Explicit dependencies then remove operations whose prerequisites are absent; they do not silently enable additional permissions. Existing resource possession and current source authority remain runtime prerequisites. Selecting an image/PDF route neither grants a resource identity nor starts acquisition.

The resulting versioned snapshot contains frozen capability IDs, composition kinds, schema names, standoff identifiers and stage flags. The same snapshot governs catalogue discovery, legend, relevant authoring instructions, provider-schema projection and native admission. Provider state retains its own frozen copy through retrieval and repair. Configuration changes apply to the next exchange; they cannot broaden or narrow an active exchange. Model response fields cannot grant capabilities.

The feature flag is `dcpVocabularySelection`, enabled by default. Disabling it preserves the previous stage-gated authoring/schema path and rejects the configuration API. The independent-reading correction still applies.

## Profiles and dependencies

| Profile | Included authoring capabilities with native prerequisites satisfied |
| --- | --- |
| All Qualified | All 21 existing composition kinds, 17 curated standoff identifiers, configuration and semantic operations. |
| Core | Paragraph, heading, group, bullet/ordered list, table, code; bold, italics, highlight, hyperlink; exact source anchors, enabled interpretations and discursive reply targets. |
| General | Core plus grid, tabs, Surface, sticky note, task style/state, text appearance, margins, list numbering, table headers, external image/video/YouTube/website references, additional curated formatting/classifications and Glosses. |
| Research | General plus pages, literal source, Entities, Entity mentions, Arguments, both relationship families, managed-image and retained-PDF binding. |

Timer, object3d and canvas-preview remain in All Qualified and individually selectable; the reduced presets do not include them. These are initial preset choices, not permanent classifications. Table headers and nondefault numbering are General configuration; ordinary Core tables and ordered lists remain available.

Selection metadata extends the existing catalogue and native standoff definitions, rather than introducing Block constructors or a second resource registry. Added discovery selectors for existing operations are `reference.reply`, `configuration.list-numbering` and `configuration.table-headers`. Individual standoff selection uses `standoff:<native identifier>`; the existing legend and formatting discovery descriptors describe their authoring parameters. No new DCP composition kind or active standoff property was added.

Dependencies are exposed as `requires` and, where applicable, `requiresAny`:

- Task state and numbering require list authoring; headers require table authoring.
- Source interpretations require exact-source anchoring and at least one selected annotation type supported by the current native stage.
- Entity mentions and formal relationships do **not** require permission to create their endpoints. Current issued identities and native ownership checks still apply.
- Generated list items, rows/cells, Sides, panels, margins and PDF information Blocks are owned descendants of their logical operation, not independently selectable authoring permissions. A retained PDF can therefore create its native wrapper Surface with general Surface authoring disabled.

## Projection and admission

The common schema is filtered before OpenAI recursive projection or Anthropic bounded expansion. Disabled kinds disappear recursively. Configuration fields are narrowed independently: task state, numbering, table headers, text appearance and margins. Disabled independent semantic arrays are constrained empty, relation alternatives are filtered, and explicit annotation types follow the selected legend. Projection copies shared native parameter objects, preventing one profile from narrowing subsequent exchanges or native editor configuration.

Native preparation independently enforces the snapshot for every nested node, configuration option, inline annotation, explicit range, source interpretation, Entity reference and independent semantic operation. Known disabled properties are rejected before unknown-semantic preservation. Unknown names retain the existing inert compatibility path and gain no active capability. Generated passage identities remain supporting infrastructure for selected annotations; exact anchoring of earlier sources is a separately controlled operation.

Established source-discovery, fresh-handle and identity guidance is retained. Vocabulary-specific instructions and examples are filtered; this is not a general prompt rewrite. Resource preparation, native ownership, immutable submitted content, descendant budgets, current authority and canonical atomic admission remain authoritative.

## Reading and authority

Qualified source readers no longer depend on creation-stage flags. Existing code, lists/tasks, compounds, widgets and qualified media remain readable when creating them is disabled. Existing semantic identities remain discoverable independently of permission to create more. Native inspection retains its bounds and `lossless: false`; unmapped resource families still report unavailable specialised reading and explicit omissions. This does not implement retained-family binding or native cloning.

The existing-Entity qualification exposed a reactive-reference cloning defect: issued handles retained a reactive Entity reference that could reach canonical materialisation. Handle issuance now copies the small unwrapped target value. It does not clone source content or broaden authority. Existing references and relationships now pass the native transaction with endpoint creation disabled.

## Qualification

Focused deterministic qualification covers:

- All Qualified compatibility; Core/General/Research selection; granular overrides, dependency pruning and native prerequisites.
- Recursive exclusion, strict object/reference consistency, both provider request bodies, continuations and repair; shared native schemas unchanged by projection.
- Disabled bold and Entity mentions through inline, range and existing-source routes; independent semantic-array permissions; inert unknown semantics.
- Existing Entity mentions and both relationship families without new endpoint creation.
- Retained PDF selection without Surface permission; native resource verification and no I/O for a disabled binding; forged/foreign/stale resources and session changes through existing Stage 3 regressions.
- Reading committed code, tasks and compounds with their creation stages disabled; bounded inspection and the historical canonical vocabulary audit.
- Changes during an exchange, response permission-injection rejection, reduced-profile mock exchanges and the selection-disabled legacy path.
- Atomic rollback, Undo/Redo, native persistence, immutable controls and previous Stage 1–3C.1 behaviour through the existing integration fixtures.
- Typing causes no new DCP discovery, repository snapshot, projection rebuild or network request. Selection resolution runs on explicit configuration/Ask, with fixed descriptor work; no typing subscription, background save or new repository-wide validation was added.

Validation: 171 tests across the seven files below, plus reactive/client and server TypeScript checks and `git diff --check`. No live-model benchmark was run; these results do not establish improved model reliability.

```sh
npx vitest run src/features/dialectic/dcp/vocabulary.test.ts \
  src/features/dialectic/dcp/capabilities.test.ts \
  src/features/dialectic/dcp/dcp.test.ts \
  src/features/dialectic/dcp/identities.test.ts \
  src/features/dialectic/dialectic.test.tsx \
  server/dialectic/providers.test.ts scripts/audit-dcp-vocabulary.test.ts
npm run typecheck
git diff --check
```

## Request-size measurement

UTF-8 bytes from the deterministic synthetic request in `vocabulary.test.ts`, with all native prerequisites enabled, fixed exchange/handle strings, empty supplied history/context and default provider settings. Provider envelopes are captured from the real request builder using fixture transports; no remote API call is made. The test writes reproducible measurements to `/tmp/dcp-vocabulary-stage-a-measurements.json`.

| Profile | System instructions | Capability summary | OpenAI schema | Anthropic schema | OpenAI request body | Anthropic request body |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| All Qualified | 14,461 | 6,888 | 15,725 | 79,762 | 62,265 | 126,089 |
| Core | 13,392 | 2,214 | 7,737 | 31,634 | 40,633 | 64,317 |
| General | 13,688 | 4,839 | 12,320 | 67,544 | 52,820 | 107,831 |

Components are not additive: the full body includes tools, examples, the host request, JSON escaping and other envelope fields; some guidance occurs in both system instructions and the host request. Anthropic expands bounded composition depth. These are byte measurements, not token counts, latency measurements or evidence of better model behaviour.

## Stage B configuration interface and remaining decisions

The controller exposes a small in-memory interface:

```ts
controller.vocabularySelection(); // copied, frozen requested configuration
controller.vocabularyDescriptors(); // IDs, purposes, availability, dependencies
controller.configureVocabulary({
  profile: 'core',
  enable: ['media.retained-pdf', 'standoff:mutable/entity-reference'],
  disable: []
});
```

`resolveVocabulary(editor, selection)` is also available to a future configuration consumer for effective-selection previews. Descriptor availability describes native prerequisites; resource possession is checked later. `DcpSources.vocabulary` records the active snapshot. Descriptors and projections are computed on demand, not from Document typing events.

Stage A stores the selection only in the current Dialectic controller. It currently applies across that controller's Documents and AI participant configuration, resets when the controller is recreated, and marks no Document dirty. This is temporary infrastructure, not an approved persistence policy.

Stage B still needs decisions on participant versus Symposium versus application scope; inheritance and defaults; persistence/versioning and copied/imported Documents; and presentation of requested versus effective permissions, dependencies and resource prerequisites. UI grouping may combine related choices without changing the underlying operation permissions. There is no graphical checklist, migration, saved Symposium property or automatic default reduction in this increment.
