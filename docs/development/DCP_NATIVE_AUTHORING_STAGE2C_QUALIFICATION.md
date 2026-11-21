# DCP native authoring — Stage 2C qualification

9 November 2026. Stage 2B is accepted. Stage 2C adds compound composition through shared native preparations. `dcpNativeAuthoringStage2Compounds` is enabled after focused qualification, depends on Stage 1, and is negotiated independently of Stage 2A/2B. Stage 2D and Stage 3 have not begun.

## Qualified operation coverage

| DCP projection | Native effect and constraints |
| --- | --- |
| `surface {id,kind,front:[nodes],back:[nodes]}` | Native Surface with front/back Sides. Both faces require content. Multiple front Blocks receive a structural container; the back uses the existing structural container convention. Requires native `reversibleBlocks`. |
| `tabs {id,kind,orientation,tabs:[{label,content:[nodes]}]}` | Native tab row/panels. Orientation is horizontal or vertical; vertical requires `verticalTabs`. Labels are trimmed, nonempty, single-line, at most 256 characters. At most 16 panels, each with content. |
| `pages {id,kind,orientation,pages:[{label,content:[nodes]}]}` | Native document-tab row → document tabs → PageBlocks. Same panel configuration as tabs. Allowed only at contribution-level composition roots; no nested page collections or host Document/session/window creation. |
| Paragraph/heading `margins:null` or `{left:[nodes],right:[nodes]}` | Native left/right margin Blocks attached through named **owned relations** `leftMargin`/`rightMargin`. Empty arrays omit the relation. Native marginal text defaults apply unless explicitly styled. No nested marginal relations or pages in margins. |

These cover the canonical inventory's Surface/Side, tab row/panel, document-tab/page and left/right margin families for new contribution creation. Internal shells and relations are host generated; the model never supplies native ownership metadata. Existing groups and other native content may be nested in supported content arrays. Empty text is represented by an empty paragraph. Generated shells and margin owners count against the existing 256-Block budget; depth, output and retrieval budgets are unchanged.

`compound-authoring.ts` supplies `prepareSurface`, `surfaceSide`, `prepareTabs`, `tabPanel`, `preparePage`, `prepareMargin`, `marginText` and `attachMargins`, with shared label/orientation validation. Human Surface commands, text-tab conversion, tab operations, page conversion/addition and margin creation reuse these preparations. DCP performs concise wire validation and canonical atomic contribution admission. No parallel constructor registry or replacement widgets were added.

## Authored state, reading and discovery

Labels, orientation, both faces, page content and marginal relations are authored and protected after submission. Existing native occurrence state handles tab/page switching and Surface flipping without changing repository revision or serialized content. Model-supplied active flags, destinations and raw metadata are rejected. Initial native tab activation is host generated.

Inspection retains native identities/current handles, front/back roles, tab labels/orientation, PageBlock structure and named marginal relationships. It identifies transient navigation on supported native views. Inspection remains bounded and explicitly non-lossless; omitted descendants can be read using issued child handles. Authored reverse-side and marginal text remain discoverable through the normal inventory.

The catalogue adds `composition.surface`, `composition.tabs`, `composition.pages` and `configuration.margins`, with native mappings, prerequisites and purpose. Every individual descriptor fits the existing 8,192-byte limit. Compound-mode detail is a **contextual schema fragment**: `parameters.externalDefinitions.Node` explicitly refers child composition to the already negotiated provider schema and lists capability IDs for detailed discovery. It does not repeat the entire recursive vocabulary inside each descriptor. All other referenced definitions are included. Provider schemas remain complete; OpenAI retains recursion and Anthropic receives bounded, acyclic expansion, including paragraph/heading margin recursion. Older feature modes retain their prior schema/detail behavior.

## Qualification

**201 focused tests passed; two existing page-conversion tests failed. Reactive and server TypeScript checks passed.** The failures were reproduced unchanged in a clean worktree at Stage 2B commit `08786e4`: `page-creation.test.tsx` expects Undo to remove `metadata.focus.blockId`, but it remains `p`. They are not introduced or repaired here. New DCP compound Undo/Redo and native persistence checks pass.

```sh
npx vitest run src/features/dialectic/dialectic.test.tsx src/features/dialectic/dcp/capabilities.test.ts server/dialectic/providers.test.ts src/block-tree/compound-authoring.test.ts src/features/dialectic/dcp/dcp.test.ts scripts/audit-dcp-vocabulary.test.ts src/rendering/reversible-surface.test.tsx src/rendering/tab-commands.test.tsx src/rendering/text-tabs.test.tsx src/block-tree/margin-commands.test.ts src/rendering/page-creation.test.tsx
npm run typecheck
```

Coverage includes:

- Human command/shared preparation equivalence for tabs, pages, Surfaces and both margins; generated ownership, structural descendants, configuration and native resource ownership.
- Submitted-content mutation rejection; native navigation without repository writes, snapshots or projection rebuilds; dirty tracking and Undo/Redo.
- Native capture/serialization followed by admission into a fresh repository and canonical serialization comparison.
- Current-handle reading and exact-source annotation of marginal text; stale/foreign authority rejection and injected insertion failure with complete rollback of anchors/definitions.
- Invalid nesting, labels/orientation, host destinations and raw shells; feature gates, independent Stage 2C negotiation, generated descendant budgets and prior authoring families inside compounds.
- Both provider schema fixtures, bounded capability discovery and existing Stage 1/2A/2B compatibility tests.

Typing checks retain zero DCP retrieval/network work, full snapshots and projection rebuilds. Existing tab/Surface suites exercise bounded structural work and preservation of native interactions. Shared factory extraction adds no per-keystroke planning, scanning, validation or persistence hook. Tests use native serialization and deterministic provider exchanges; no live Cavern save or model benchmark is claimed.

## Explicit limits and deferred operations

- **Legacy books/fixed-size pages:** native `Add blank pages` requires an existing `book-block`; there is no fresh production book-creation route. Editing an existing book is outside new-contribution authority, and native copy/resource binding remains deferred. This operation remains an explicit parity gap, not an intrinsically unsupported native type. This increment qualifies PageBlocks under document tabs, not legacy book reconstruction.
- **Existing-content transformations:** human conversion/movement commands retain their native authority. DCP composes new owned structure and adds authorized source annotations; it cannot convert a host Document, move prior content or rewrite submitted contributions.
- **Prior limits:** Stage 2B's width/span/initial-collapse limitations and other outstanding canonical-audit operations remain as documented. Reading is not a substitute for native cloning.

Stage 2D/3, Surface-backed Markdown fallback, media acquisition/generation, contribution notices, task-expectation enforcement and retroactive editing remain deferred. Stage 2C stops here for review.
