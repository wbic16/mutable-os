# Dialectic Increment 3 — qualification

7 November 2026. The three approved slices are implemented under the existing default-enabled `dialectic` feature flag. No subsequent increment has begun.

## Delivered behaviour

**Authoring:** the Sequences section provides New, Edit, Duplicate and Delete. Select a committed contribution or place the caret in one of its Blocks, then add that source to a group. Groups and members can be named, reordered, removed and replaced. Choose parallel/stacked arrangement, together/cumulative reveal and optional member emphasis. Apply commits one undoable Document metadata edit; Document Save remains manual. Duplicate creates fresh Sequence/group/member identities while preserving source references.

**Presentation:** Present opens native composition occurrences. Any group can be selected directly; Previous/Next, Reveal next, Show all, Reset and individual perspective access are conveniences, not a slideshow restriction. Tabs, reverse faces, scrolling, browser text selection/Copy, supported URL links and native media remain interactive. Open source returns to the retained editor. Reply to source and Include source in context are separate explicit actions. Inspection, chronology, reply targets, selected context and consumed-context records remain distinct.

Definitions live in `Document.metadata.dialectic.sequences`. They contain identities, source references and declarative presentation settings, never copied source compositions. Cursor/reveal/tab/face choices are session state, keyed by Document and member identity. Missing sources retain their references; source deletion and Undo remove and restore the corresponding occurrences. Unknown definition versions are retained but not executed. Existing conversation/contribution wrapper-copy rejection remains in force.

## Native occurrence contract and boundaries

`ReactiveViewProvider.passive` is occurrence policy, not canonical Block state. Each visible member receives a transient projection over the existing repository and native Block views. It creates new display DOM and lightweight mount handles, but no Document session, canonical content or lease on the source DOM. Source edits propagate through existing incremental projection maintenance. The original editor remains mounted.

Admission requires the audited family allowlist and the registration's `native-passive` capability. Supported families are standoff text; ordinary containers/pages/margins; tables/grids; ordinary horizontal/vertical tabs; reversible surfaces/sides; images; qualified video views; and list/task displays. Authored task/disclosure changes are disabled. Native standoff styling, character surfaces and existing annotation geometry are reused. Textual uses its established typography with scoped panel/tab styling.

Input isolation combines a window capture boundary, opaque input policies, selection exclusions and command admission. Passive runtime targets cannot enter `TreeCommands`; stale-focus registry commands are rejected without replacing existing lifecycle permits. Explicit source operations still work. Inline-image callbacks do not author status changes in passive views. The boundary also covers empty/unresolved presentation groups. Ordinary application views retain their existing authoring policy.

Unsupported families, specialised Document hosts, unqualified text interaction variants, detached resource-information views and excessive compositions show an explicit unavailable/Open source boundary. Unsupported parents are not flattened into their children. Limits: 64 Sequences per Document, 32 groups per Sequence, four members per group, and 240 Blocks/30,000 Cells per member, including hidden faces/tabs and repeated occurrences.

## Shared-code impact

| Modules | Necessary change and qualification |
|---|---|
| `features/dialectic/sequences.ts`, `sequence-controller.ts`, `sequence-view.tsx`, existing controller/views/styles | Definitions, authoring, free navigation and member state. Retained host ownership determines which presentation mounts passive panels. Desktop/Textual round-trip verified. |
| `rendering/passive-composition.tsx`, `runtime/passive-presentation.ts` | Bounded projection admission, input boundary, local state and disposal. Repeated and parent/child overlapping sources tested. |
| `reactive-editor/context.tsx`, `editor.ts`, `block-tree/registry.ts`, input gateway/cross-Block/selection helpers | Occurrence policy and admission at existing entry points. Source editing, stale targets, native Copy and IME attempts checked. |
| Native outlet/registrations, container/core views, standoff view, reversible surfaces, task controls | Reuse native rendering while disabling authoring controls/callbacks; retain local tab/face/media interactions. Both direct-DOM and Solid Cells tested. Existing tab/surface regressions pass. |
| `block-tree/dialectic-sequence-plan.ts`, structural planner/projection, native persistence, Dialectic reference index | Prove a Sequence-only Document metadata change; update its payload and dirty state without rebuilding membership, projections or the reference index. Forward/inverse edits and file-bound Documents tested. |

Browser qualification exposed the persistence service's generic membership-refresh snapshot on a file-bound Sequence edit. The validated metadata-only change now uses its existing cheap dirty-state path. No broad transaction, renderer, application-runtime or presentation-registry refactor was introduced.

## Tests and browser evidence

- **75 focused tests pass:** Dialectic (17), passive composition (4), reversible surfaces (43), tab orientation (11). Coverage includes authoring/history, duplication identities, free group/reveal state, source deletion/Undo, overlapping occurrences, asynchronous image callbacks, passive input, disposal and bounded work. Follow-up assertions were rerun in their affected files.
- **TypeScript:** `npx tsc --noEmit --project tsconfig.reactive.json` passes.
- **Chrome:** `scripts/check-dialectic-sequences-browser.mjs` passes with trusted clicks/keyboard input: source typing/submission; Sequence creation/Undo/Redo; independent tabs/faces; rejected passive typing, Cut, Paste, Undo, deletion and IME; native selection/Copy; URL navigation; live source propagation; Desktop/Textual/Desktop; Open source editing; manual Save and actual page reload with preserved member IDs. Save transport is isolated in memory.
- Media playback was exercised with a real `HTMLMediaElement` in an isolated player document within the native iframe. Remote provider availability, authentication and playback are **not** qualified by this fixture. Screenshots use that controlled player document.

## Measured work

Latest recorded Chrome run, two references to a nested composition:

| Operation | Observation |
|---|---:|
| Apply Sequence, automation-observed completion | 55.4 ms |
| Present click → observed mounted native panels | 68.2 ms |
| Present click → first successful trusted native tab interaction | 94.5 ms |
| Per-occurrence mount work | 9.3 / 6.1 ms |
| Source insertion with both occurrences visible, synchronous mutation processing | 6.4 ms |
| Trusted source insertion after Open source, automation-observed completion | 33.1 ms |
| 20 edits with three unrelated annotated Documents/300 paragraphs | 25.9 ms total |

These are single-run observations, including automation/scheduling overhead where labelled; they are not isolated paint latency, percentile benchmarks or a comparison of equivalent typing workloads. Tests/typechecking were also running. A successful native interaction establishes usability; arbitrary two-frame settling is not presented as interaction latency.

Presentation opened **zero new sessions**, made **zero canonical writes**, and preserved the source session/mount. Authoring, presentation and source-typing checks recorded **zero repository snapshots and projection rebuilds**; initial construction of the two additional projections is expected. Unrelated edits recorded **zero passive inline updates, passive `getBoundingClientRect` calls, snapshots or rebuilds**. Native source capture occurs only on explicit Save.

## Remaining limits

Membership is same-Document committed contributions/Blocks, not cross-Document or range/Gloss membership. Annotation authoring and specialised internal annotation actions require Open source. Passive DOM/player instances may restart when changing groups or presentation; member tab/face/reveal state survives within the session, while source mounts remain retained. The capability is a contract for audited native views, not a sandbox for arbitrary plugins. Arbitrary registered Blocks and external media services require separate qualification.

[Browser measurements](DIALECTIC_INCREMENT_3_BROWSER.json) · [Desktop screenshot](DIALECTIC_INCREMENT_3_DESKTOP.png) · [Textual screenshot](DIALECTIC_INCREMENT_3_TEXTUAL.png)
