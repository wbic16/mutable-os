# Textual Workspace — Increment 3 qualification

2026-11-05 · `textualWorkspace` remains enabled by default

## Delivered

The **Tools** menu now opens Scry/LER, Gloss authoring and Explorer, References/Search, and Cardex.

- **Scry/LER:** dedicated query/results chrome over the existing completion and Entity-resolution controllers. Textual enters query mode; graphical entry behavior remains unchanged. Linking, preparation, occurrence review, creation, inspection and the existing advanced commands retain their original operations and validation.
- **Gloss:** dedicated Explorer with filtering, occurrence counts, editing, passage navigation and relationship controls. Graph and Argument use the existing renderers as embedded surfaces. The existing compact authoring input now uses the presentation's portal parent. Highlights still use the original temporary SVG range decorations.
- **References:** dedicated native-reference, Entity-occurrence and vault-query view. It calls the existing application APIs for selection capture, freshness validation, linking/removal and navigation. Query typing does not initiate searches. Navigation returns to the source without restoring an obsolete selection bookmark.
- **Cardex:** dedicated application chrome and detail navigation around the original search, field-editor and semantic-detail DOM. These retained controls keep their controller state, local history, unsaved drafts and retry receipts. Source navigation returns to the appropriate Flint application, clears temporary occurrence filtering and restores native editor focus. Ordinary application switching retains the current view.

No parallel editor, instrument service, persistence pipeline, window manager or general-purpose TUI framework was added. Document saves remain manual.

## Shared changes

| Boundary | Changed files / reason |
|---|---|
| Optional presenters | `rendering/instrument-presentations.ts`, `application/workspace-presentation-view.tsx`; three concrete factories selected at Workspace composition. Existing graphical views remain the defaults. |
| Scry/LER | `features/autocomplete/view.tsx`, `features/entity-references/ler-view.tsx`; expose existing controller state/actions and retain graphical markup. Textual placement avoids graphical anchor measurements while keeping source-validity checks. |
| Gloss | `features/gloss/presentation.tsx`, `presentation-context.ts`, `controller.ts`; reuse the register/controller and expose mode controls. Only the popup parent changes for authoring. |
| Cardex | `application/cardex-presentation-ports.ts`, `features/cardex/view.tsx`, `details.tsx`; expose existing state/actions, retained DOM slots and successful source-navigation events. |
| Host admission | `application/workspace-session.ts`; a narrow exception for registered, idle Cardex instruments on Desktop↔Textual routes. Existing composition/modal/write barriers remain. Other opaque applications and presentation routes keep their previous restrictions. |
| Dedicated UI | `features/textual/{entity-tools,gloss,references,cardex}.tsx`, `flint.tsx`, `textual.css`. All new styling is scoped to Textual; Workspace menus and modal dialogs stay above the new instrument panels. |

The [Shared-Code Impact Register](TEXTUAL_IMPLEMENTATION_PLAN.md#increment-3-implementation-boundaries--2026-11-05) records these adaptations. Graphical Flint's shell and graphical stylesheets are unchanged. Canonical mutation, SQL, schemas and persistence implementations are unchanged.

## Qualification

**28 distinct focused tests passed:** existing LER interaction (15), Gloss Stage B (5), Cardex name/service checks (4), plus four new boundary checks covering stale query results, local query typing, retained field restoration/disposal, and the restricted Cardex presentation admission. TypeScript compilation passed.

The focused Chrome harness uses real retained Flint and instrument controllers, trusted mouse/keyboard input, a read-only letter fixture, and isolated in-memory Entity/Cardex service responses. It does not modify the user's database or documents.

| Browser flow | Result |
|---|---|
| Scry/LER search, link and cancel | Passed; linking preserves source text and existing Cell/Text-node identity. |
| Gloss create/edit, Explorer, passage return | Passed; native compact input and the same canonical authoring operation. |
| Graph / Argument routes | Existing surfaces open inside the Textual Explorer. Graph algorithms/rendering use their established coverage. |
| References inventory / source return | Passed for native references and the live Entity inventory. |
| Native reference authoring | Selected text linked to a loaded Document, listed, then removed successfully. |
| Cardex search, field editing, Claims entry, Save | Passed through existing field editors and service request paths. |
| Dirty Cardex Desktop round-trip | Unsaved text and the identical field-editor DOM survive both directions. |
| Cardex Document navigation / Flint return | Passed; the target application is presented and Flint input ownership restored. |

The Scry/Gloss/References flow, including authoring, recorded **0 workspace repository snapshots, 0 new projections, 0 full projection rebuilds and 0 reference-index rebuilds**. Cardex field typing recorded **0 workspace snapshots and 0 workspace canonical changes**; its field edits remain local until explicit Entity Save. Context/search/get requests were not repeated by presentation switching. These are work counters, not claims of input-to-display latency.

No full suite or Increment 2 matrix was repeated. The two accepted graphical-toolbar baseline failures were not investigated or rerun.

[Browser results](TEXTUAL_INCREMENT_3_BROWSER.json) · [Cardex screenshot](screenshots/textual-cardex-increment-3.png) · [Gloss screenshot](screenshots/textual-gloss-increment-3.png)

## Limits and next action

Cardex search/detail forms and the Gloss graph/argument internals use functional retained/embedded presentations. Comprehensive internal cell alignment, media sizing and marginalia remain Increment 4. Existing unimplemented Cardex categories/Dossier capabilities remain unimplemented. Native operating-system IME/clipboard matrices and every rare instrument command were not independently requalified.

The supplied reference image is the visual direction for subsequent polish: framed panes, denser menus, persistent References/marginalia and hard-edged cell-aligned shadows. Movable/overlapping Textual window behavior is not introduced in this increment. No new keyboard bindings were added.

Increment 4 has not begun.
