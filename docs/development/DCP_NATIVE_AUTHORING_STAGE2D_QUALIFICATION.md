# DCP native authoring — Stage 2D qualification

9 November 2026. Stage 2C is accepted. Stage 2D adds notes and qualified Document widgets through shared native factories. `dcpNativeAuthoringStage2Widgets` is enabled after focused qualification, depends on Stage 1, and is independently negotiated from 2A/2B/2C. Stage 3 has not begun.

## Qualified routes

| DCP projection | Native preparation and constraints |
| --- | --- |
| `sticky-note {id,kind,content:[nodes],size:null\|{width,height}}` | `prepareStickyNote` / `stickyNoteDto` create a native note with owned content. Nonempty content, at most 64 children; default 280×280, minimum 200×160. `noteDimensions` is shared with human resizing. This creates Document content, not a floating workspace window. |
| `timer {id,kind,durationSeconds,size:null\|{width,height}}` | `timerBlockDto`, `timerDuration`, `timerDimensions`; whole seconds 1–86400, initial idle state. Default 130×130, minimum 110×110. Existing native floating presentation. Geometry-dependent human placement remains in `timer/commands.ts`; DCP cannot specify positions, deadlines or running state. |
| `object3d {id,kind,configuration:null\|{scene,view,lighting,autoRotate,steam,coffeeStain,size}}` | `objectDto` / `objectConfiguration`; the existing `coffee-cup` scene only. Azimuth 0–360 (native wrap), elevation 10–70, lighting neutral/warm/dramatic, Boolean rotation/steam/stain, square size 160–640. Null uses native defaults. No meshes, resource identifiers or acquisition. |
| `canvas-preview {id,kind}` | `canvasPreviewDto`, shared with the actual Add Canvas menu. This is the native demonstration preview with locally draggable sample boxes. It does not author saved spatial cards, positions or a workspace Canvas. |

All sizes must be finite numbers; unknown configuration fields, malformed settings, unsupported destinations and fabricated resource fields are rejected. Native renderers/features are checked at admission. Timer requires `timer`; 3D requires `threeDObjects`. Internal ownership uses canonical native admission and generated descendants remain within existing composition budgets. No arbitrary widget DTO or metadata channel was added.

Sticky-note colour/material/overflow metadata is not exposed as selectable appearance: the current renderer uses fixed yellow paper and scrolling. Font-step metadata is readable but has no qualified native authoring control. Native size configuration and rich child content are exposed.

## State and protection

| Widget | Authored state | Presentation / operational behavior after submission |
| --- | --- | --- |
| Sticky note | Content and dimensions | Scrolling remains local. Resizing and content changes are protected, including a resize already in progress when protection begins. |
| Timer | Duration, initial native state and dimensions | Start/Pause/Resume/Reset and ticking use a local signal in the existing native Timer view. Operations do not change repository revision, history or saved content. Local state returns to authored state on remount; DCP timers therefore reopen idle. Duration, position, size and deletion remain protected. Close is disabled; the finished action resets the local timer. |
| 3D object | Scene, initial view, lighting, rotation setting, steam/stain and dimensions | Orbit, view presets, Fit and auto-rotation use local presentation in the existing native view. Lighting, scene settings, reset-object and resizing are protected. Local view state resets on remount/protection transition. Existing graphics lifecycle, cancellation and disposal remain in use. |
| Canvas preview | The native preview Block itself | Sample-box dragging stays local and is not saved. No additional operational or authored box model is introduced. |

Editable native timers retain their existing persisted controls; editable 3D objects retain authored view changes. These are shared native behaviors, not DCP-specific renderers. `BlockRuntime.authoredStateProtected()` exposes the existing canonical protection predicate without repository access. Views memoize that Boolean so unrelated protection-index updates do not reset local operations. Native enabled buttons retain Enter/Space activation, with the same authority as pointer clicks; text editing remains protected. Canonical mutation guards remain authoritative; stale menu actions cannot rewrite protected configuration.

## Reading and discovery

Inspection exposes widget kinds, native identities/current handles, owned note content, authored duration/mode, 3D scene/view/settings and dimensions, plus explicit state semantics and native-feature availability. It omits timer deadlines and unnecessary runtime internals. Reading remains bounded and non-lossless; exact note text and source annotations still use current `read_source` authority.

Catalogue entries are `composition.sticky-note`, `widget.timer`, `widget.object3d` and `widget.canvas-preview`. Their purposes, native mappings, parameter schemas and prerequisites are explicit. Every individual descriptor fits the unchanged 8,192-byte detail budget. As in 2C, recursive child definitions explicitly refer to the negotiated composition schema. Provider schemas remain complete, including acyclic bounded Anthropic expansion of note content. Earlier feature modes retain their schemas.

## Qualification

**149 focused tests passed across 12 suites; reactive/server TypeScript checks passed.** Existing Stage 1/2A/2B/2C integration cases remain passing. Qualification includes:

- Human Add Block command/shared-factory equivalence for all four routes; strict valid/invalid configuration; native prerequisites and rejection of host-only kinds/destinations.
- DCP ownership and source identity, generated note-descendant budgets, source annotation of note text, stale/foreign source rejection, and injected insertion failure with atomic rollback.
- Protected controls, local timer operations/ticking, local 3D presets/orbit/rotation, Canvas dragging, and unchanged repository revision/serialization. Unrelated protection changes preserve local operations.
- Undo/Redo and native serialization/admission into a fresh repository, with canonical serialization equality.
- Native widget cleanup, graphics scene disposal, feature removal/fallback, both provider schema fixtures and bounded catalogue discovery.
- Typing without DCP retrieval/network calls, full snapshots or projection rebuilds. The protection regression also confirms zero indexing and snapshots across 200 ordinary edits. Widget state updates add no repository planning, validation, vault discovery or persistence to the typing/ticking path.

```sh
npx vitest run src/features/dialectic/dialectic.test.tsx src/features/dialectic/dcp/capabilities.test.ts src/features/dialectic/dcp/dcp.test.ts server/dialectic/providers.test.ts scripts/audit-dcp-vocabulary.test.ts src/block-tree/widget-authoring.test.ts src/features/timer/timer.test.tsx src/features/three-d-object/model.test.ts src/features/three-d-object/view.test.tsx src/rendering/sticky-note.test.tsx src/application/feature-capabilities.test.tsx src/block-tree/text-protection.test.ts
npm run typecheck
```

The timer suite's three previously recorded failures were stale fixture assumptions: it expected timer to own the first/only toolbar action and expected no mount after feature removal, although the native unknown-type fallback remains. Assertions now target timer-owned actions, widget mounts, intervals/audio and preserved native data. No fallback or other feature was removed to make the tests pass.

Qualification uses deterministic provider fixtures and native persistence, not a live model benchmark or live Cavern save. The 3D interaction test uses the real native view and a controlled scene implementation; model/camera tests remain passing. It does not claim a new live GPU/browser qualification. WebGL 2 remains a rendering prerequisite with the existing fallback.

## Explicit remaining boundaries

- **Canvas counter:** the qualified human creation action belongs to the workspace Canvas/window context. Its shared feature factory alone does not grant a Document insertion operation. A qualified Document destination and protected operational-state contract remain missing; no DCP host window is created.
- **Phosphor:** the human route creates a Phosphor Document/application session. Ordinary contribution embedding requires a separately qualified context/preparation contract; that host authority is not added here.
- **Sticky tabs and legacy book pages:** existing-container insertion/copy contexts remain explicit gaps from the canonical inventory, outside new widget creation authority.
- **Other earlier inventory gaps:** standalone legacy checkbox representation, horizontal-rule creation and the legacy plain-code preview are not claimed by this widget increment. Existing list tasks and standoff code retain their qualified routes. Stage 2D is not a declaration of universal native parity.

Stage 3, resource acquisition/generation, native cloning, Surface-backed Markdown fallback, notices, task-expectation enforcement and retroactive editing remain deferred. This increment stops for review.
