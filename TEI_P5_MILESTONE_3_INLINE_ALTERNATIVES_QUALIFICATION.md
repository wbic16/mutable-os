# TEI P5 Milestone 3 — continuous inline alternatives qualification

Status: implementation boundary requiring approval under the supplied M3 brief, §A. Grouped native tabs remain the supported importer fallback. Independent M3 relationship and navigation work proceeds.

## Capability checked

- `src/runtime/text-tabs.ts` wraps or copies whole TextBlocks. Native tab selection in `core-block-views.tsx` is presentation state, but these are block layouts, not inline sequence members.
- `src/runtime/text-superposition.ts` requires a nonempty inclusive range in one legacy TextBlock, rejects overlap and stores the selected reading in authored properties. Its owned alternative TextBlocks reuse native editing, but do not qualify empty/nested arbitrary rich alternatives or presentation-only switching.
- `src/block-tree/inline-sequence.ts` admits text and image atoms. `compactPayloadReason` explicitly rejects superposition relations and alternative-bearing properties. Removing that guard would not supply missing selection, editing or persistence semantics.
- Native owned relations, occurrence identity, selection services, retained mounts, transactions, linked definitions and temporary SVG decorations are reusable. The TEI native writer deliberately admits only its qualified structural block types and text atoms; it does not yet encode owned inline alternatives.

## Smallest coherent extension proposed

Qualify a native inline alternative slot backed by owned reading contents, with one stable slot identity and ordered reading identities. Surrounding text occurs once. Reading contents retain their native rich text and annotation ownership; the slot is a typed member of the compact sequence, not a parallel flattened string or character graph. First source reading remains the initial display. The active reading belongs to each viewing session/occurrence, outside authored metadata and Undo history.

This requires an explicit native contract, not a converter-only change: define slot length and before/after boundaries; selection traversal into a reading; caret restoration when switching; edits confined to the selected owned reading; copy/transclusion identity remapping; deletion/split/join of a slot; nested ownership; annotation and milestone navigation through inactive readings. Empty readings need a focusable boundary without fabricated text. Initially admit inline-rich readings only; block-bearing/cross-Block apparatus retains grouped tabs.

## History, persistence and compact text

Reading edits and slot structure changes use canonical validation and bounded transactions with Undo/Redo. Display switching performs no canonical write, dirty transition or save. Native encoding/admission/capture must qualify the new atom and owned closure, including empty/nested readings and linked definitions; legacy admission must have an explicit equivalent or reject the capability without losing readings. No archive, source synchronisation or per-character canonical records are permitted. Geometry uses existing measured ranges and native scrolling.

## Alternatives considered

1. Styling grouped block tabs inline: insufficient; it does not establish paragraph selection/IME/split semantics and can duplicate or misplace context.
2. Removing compact exclusions from existing superposition: insufficient; nonempty legacy indices, authored switching and incomplete rich/nested rendering remain.
3. A separate rendered string overlay: rejected because it creates a second editing authority and breaks native selection/history.
4. Qualifying the typed inline slot above: recommended, as a separately approved native capability with converter integration afterward.

## Approval boundary and validation

M3 does not implement this extension without approval, as required by §A of the supplied brief. Approval should cover the native slot contract and qualification, not merely enabling experimental superposition. Required gates include rich/empty/multiple/nested readings, paragraph continuity, source-order selection, IME/caret/selection, bounded editing and Undo/Redo, save/reload in compact and legacy modes, copy ownership, and real Flint typing/navigation measurements. Grouped tabs preserve all readings until those gates pass.
