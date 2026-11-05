# Universal Application Presentation Contract — Stage B

2026-11-05 · Implemented and qualified

## Resulting contract

The per-editor `ApplicationPresentations` registry connects existing application instances to independently contributed views. `applicationPresentations` is enabled by default; disabling it retains the previous Desktop/Textual integration.

- **Independent contributions:** `registerApplication(key, definition)` and `registerPresentation(key, presentation)` return owned disposers. Presentation features may register before the application, survive its removal as dormant contributions, and reactivate against a later live instance. Duplicate identifiers/defaults are rejected. Disposed instance references cannot resolve against replacement applications.
- **Resolution:** `resolve(key, workspace, instance, presentationId?)` returns `ready`, `unsupported` or `blocked`, with a reason. Explicit IDs never fall back to another workspace/view. Otherwise a compatible default or sole compatible view is selected; ambiguous alternatives require an explicit ID. Presentation availability and temporary admission are separate callbacks.
- **Implementation independence:** views use the existing Solid component boundary. Ordinary components mount/unmount without any DOM lease. An adapter can bridge another renderer inside that component. Retention is confined to Flint/Cardex adapters, not required by the universal contract.
- **Lifecycle:** admission is checked before activation; an active view is not destroyed when editing later creates a temporary barrier. Contribution removal unmounts its view. Component/instance identity remains stable across unrelated registry changes. Failed Textual attachment restores the previous application presentation. Feature cleanup does not transfer ownership of application services to the registry.
- **Ownership:** existing controllers own state, history, dirty indicators, pending operations and persistence. Existing document leases retain focus/selection/scroll handoff and final editor disposal. The Textual host owns only application navigation/activation; instance identities are qualified by application ID. Resize/zoom remain existing Textual mechanisms.

Interaction declarations are `exclusive-session`, `exclusive-instance` or `noninteractive`. Flint's existing document lease enforces session exclusivity; Cardex's Textual adapter rejects a second simultaneous attachment of the same Instrument. No simultaneous-editing engine was added. A future interactive adapter must enforce its declared constraint through its own ownership mechanism.

## Registered reference presentations

| Application | Presentation ID | Workspace | Actual integration |
| --- | --- | --- | --- |
| Flint | `flint.desktop.editor` | Desktop | Registry resolution invokes the existing configured graphical view under its existing owner. |
| Flint | `flint.textual.editor` | Textual | Existing `FlintHost`, typed document port and retained editor lease. |
| Cardex | `cardex.desktop.instrument` | Desktop | Registry resolution invokes the existing Entity Instrument markup; its enclosing graphical shell/controller survives. |
| Cardex | `cardex.textual.instrument` | Textual | Existing Instrument actions and retained search/field DOM. |

Textual contributions are installed by a separate feature **before** the application features, exercising independent registration in production. They do not require further changes to application registration to add another view. Flint's declarative entry priority preserves the existing initial Flint presentation; the host contains no Flint/Cardex ID branches. Cardex source-navigation knowledge stays in its adapter.

Example for another feature, using the exported typed key:

```tsx
scope.own(applicationPresentations(editor).registerPresentation(flintApplication, {
  id: 'my-feature.flint.textual',
  workspace: 'textual',
  interaction: 'noninteractive',
  view: props => <MyReadOnlyView application={props.instance.application} />,
}));
```

Choose that alternative by explicit ID through resolution/`RegisteredApplicationView`. This work adds no general view-picker UI. Application `open` adapters use existing launch commands and must publish their instance before their operation completes.

## Changed modules and shared-code impact

| Area | Changes |
| --- | --- |
| Contract/registry | New `feature-api/application-presentation.ts`, `runtime/application-presentations.ts`, `application/application-presentations.tsx`, and typed `application-presentation-keys.ts`. No service container or new application runtime. |
| Registration | New document/Cardex registration adapters and independent `textual-presentation-contributions.tsx`; `application/features.ts` installs the feature. `configuration.ts` adds the flag. |
| Existing owners | Document application capabilities, Flint registration and both typed port modules expose identity/the original Desktop view. Cardex's Instrument supplies its original markup through a presentation callback while retaining its controller. The document registration API gains an optional application ID. |
| Workspace boundary | `workspace-presentation-view.tsx` uses the generic Textual host and registry bookmark hook when enabled. `workspace-session.ts` replaces the qualified Cardex exception and document preparation loop with owner-scoped registry checks; the flag-off branches remain. Existing global composition, modal, close and experimental-host protections remain. |
| Textual | New small `applications.tsx` host. Existing `FlintHost` is exported for registration; Cardex retains its adapter and adds an exclusive attachment guard. Scry/Gloss retain their existing document-scoped presenter factories. |

One concrete pre-existing visual defect surfaced during qualification: the Textual footer's pressed-button transform moved Save **9.640625 px right and 20 px down**, outside the release point. `textual.css` now changes the pressed shadow without moving the hit target. The browser harness asserts identical pressed/released bounds and a successful Save. Graphical styles are unchanged.

## Qualification

**17 focused tests passed:** five registry tests, two ordinary-host lifecycle tests, three existing retained-document tests, four existing instrument tests and three selected workspace isolation/guard tests. Coverage includes contribution order/removal/replacement, duplicate/default resolution, initial blocked activation, active-view retention during barriers, same instance keys in different applications, mount-failure recovery, borrowed DOM restoration, and existing composition/opaque-widget safeguards.

`tsc --noEmit --project tsconfig.reactive.json` and `git diff --check` passed.

Browser checks used trusted Chromium input and isolated fixture services:

| Flow | Result |
| --- | --- |
| Existing Flint browser harness, registry enabled | Passed typing, selection, composition smoke check, formatting, Undo/Redo, manual Save/Save As, dialogs/slash input, document/application switching, shared-occurrence selection, scroll/zoom and Desktop restoration. Same retained editor, Cell and original Text node. |
| Same harness, flag disabled | Passed the legacy integration. |
| Focused Cardex harness | Passed search, field editing, dirty-draft Desktop/Textual round-trip, Save, document-source navigation and return to Flint. Same field DOM and original Instrument; one `context` service request across the flow. |
| Bounded work | Flint typing: **0 snapshots, new projections, projection rebuilds and reference-index rebuilds**. No snapshots outside intentional Save in the Flint flow. Cardex field typing: **0 workspace snapshots and canonical workspace changes**. |

The registry observes registration/instance-port changes, not text revisions. It adds no per-keystroke repository scans, serialization or geometry sweeps. Explicit-ID lookup uses the indexed map. These are bounded-work checks, not user-visible latency claims.

Evidence: [browser results](UNIVERSAL_APPLICATION_PRESENTATION_BROWSER.json). Reproduce with `scripts/check-textual-flint-browser.mjs` (set `MUTABLE_PRESENTATIONS=off` for legacy) and `scripts/check-application-presentations-browser.mjs`. The older Flint harness's viewport assertion was updated to the already-accepted condensed chrome's measured row count. The full Textual/Canvas qualification matrices were not rerun.

## Remaining limitations

Reference controllers still require their existing retained graphical origins; no headless extraction occurred. Cardex registration covers the existing Entity Instrument, not every future Cardex category. Alternative IDs are programmatically resolvable without a new chooser. Scry/Gloss remain embedded tools. No new Canvas/Spatial views or simultaneous editable presentations were implemented; unadapted applications retain existing guards and rendering paths.
