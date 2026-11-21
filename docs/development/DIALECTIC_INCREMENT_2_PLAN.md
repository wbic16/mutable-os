# Dialectic Increment 2 — investigation and implementation plan

7 November 2026. **For review; no Increment 2 implementation has begun.** Increment 1 and its existing working-tree changes are preserved.

## Recommendation

Extend Dialectic's existing target descriptors with a range target backed by a **Document-owned linked standoff definition**. Reuse Mutable's selection capture, range rebasing, canonical operations, Gloss services, copy machinery and temporary SVG decorations. Add only a small Dialectic resolver/index and explicit copy adapters; no new content store, editor pipeline or general reference framework.

Initially author one nonempty selection in one owned TextBlock inside a committed contribution. That range must subsequently survive paragraph splitting/joining as multiple segments. Arbitrary nested compositions remain supported; the selected Block need not be a direct contribution child. Creation across multiple TextBlocks and discontinuous selections is deferred, not structurally prohibited.

## Existing infrastructure and concrete gaps

| Source, relative to repository root | Finding and implication |
|---|---|
| `src/features/dialectic/model.ts`, `controller.ts` | Contribution/Block targets already carry resource and Block GUIDs. Inspection, reply targeting and selected context are separate. Current resolution searches the active conversation; `targetKey()` must gain a range discriminant/anchor ID rather than treating all targets as resource/Block pairs. |
| `src/runtime/selection-snapshot.ts`, `text-ranges.ts` | Native and cross-Block selection capture already exists. Snapshots use half-open Cell boundaries and source revisions, rejecting stale selections. Runtime node/Cell keys and snapshots are not durable reference identities. |
| `src/interchange/ranges.ts`; `splitStandoff()` / `joinStandoff()` in `src/block-tree/commands.ts` | Standoff properties use inclusive Cell ranges. Edge insertions remain outside; interior insertions expand; full deletion removes a property. Splitting a crossing property gives the right segment a fresh property ID while preserving other fields, including `annotationId`. Joining shifts and concatenates properties. Therefore a fixed `{blockId, propertyId}` pair cannot represent the entire surviving range reliably. |
| `src/block-tree/linked-annotations.ts`, `definition-ownership.ts`, `external-reference.ts` | Existing definition/segment separation, ownership and external provenance are reusable. A cross-Document move can retain the original definition owner through explicit provenance. This does not make external targets automatically actionable in Increment 2. |
| `src/features/gloss/controller.ts`, `session-index.ts`, `relationship-index.ts`, `relationships.ts` | Reuse Gloss creation/editing, definition/occurrence lookup and relationship state. Gloss creation currently accepts one TextBlock range. Glosses are interpretations, not reply anchors; creating hidden Glosses to implement replies would conflate meanings. The Gloss inventory deliberately ignores pure offset changes when publishing rows. |
| `src/runtime/session-decorations.ts`, `measurements.ts` | Existing temporary range decorations and measurement validity support selection/target previews. Reuse them; no viewport-fixed highlights or scroll-triggered redraw system. |
| `src/block-tree/clipboard.ts`; `src/interchange/serializer.ts`, `materialize.ts` | There are two copy paths to cover. They allocate new Block/property/definition IDs and remap known references. Arbitrary Dialectic metadata is not remapped. The interchange materializer allowlists property types; a new anchor otherwise becomes opaque. Whole-Document serialization explicitly includes unanchored Gloss definitions, so anchor definitions need a similarly narrow inclusion rule. |
| `src/block-tree/gloss-plan.ts`, `structural-plan.ts`, `repository.ts` | Gloss admission accepts Gloss definitions specifically. General structural admission permits Document child-list changes but rejects arbitrary Document payload changes. Creating an anchor definition and submitting a reply together therefore needs a narrowly validated admission extension; wrapping it in `structuralTransaction()` alone is not proof of bounded execution. |

The existing join operation itself uses broader planning. Preserve that established fallback; this increment must not turn into a join/editor optimisation project. The new resolver must avoid adding unrelated work to it.

## Minimal identity and resolution model

Keep existing contribution and Block descriptors valid. Add the following **proposed** variant:

```ts
{ kind: 'range', resourceId: string, anchorId: string }
```

`anchorId` identifies one definition in the Document's existing `linkedAnnotations` registry. A narrowly registered passive property type, proposed as `dialectic/range-anchor`, supplies its schema. The definition holds version, captured excerpt and original source provenance. Normal standoff segments hold their own IDs, `annotationId: anchorId`, and inclusive Cell coordinates. No second range store is introduced.

An anchor represents one deliberately selected passage, not a Gloss entity or every occurrence of some text. Separate selections allocate separate anchors, even for identical text. Explicitly replying again to an existing anchor may reuse it. A split creates additional segments of that same anchor; copying creates a new anchor. Mounted occurrences of shared content do not multiply canonical segments.

Use a small per-Document index from durable Block/anchor identity to canonical records and current segments. Initialise from that Document once; update from affected records and membership changes. Resolve current offsets on demand. Keep offset rebasing out of membership/Gloss-list publication, and update preview text only for currently inspected or consumed sources. Do not poll or scan all Documents on typing.

Resolution returns structured outcomes for all target kinds:

| Outcome | Meaning / behaviour |
|---|---|
| Resolved | Unique canonical target; for ranges, the surviving segments and current text. Mounted occurrence choice is separate from target identity. |
| Unanchored / missing | Definition exists but no source segments survive, or the addressed Block is absent. Preserve the target and original excerpt; never select nearby text as a substitute. |
| Ambiguous / invalid | Duplicate identities, invalid provenance/ranges or unsupported schema. Show the reason and refuse authoring/context consumption. |
| Outside Document / unavailable | Resource or definition ownership is external to the current Document. Preserve identity/provenance; no automatic vault discovery or foreign write. |
| Outside copy / incomplete copy | An independent copy lacks the original target or complete range closure. Keep an explicit unresolved descriptor; do not guess based on matching text. |

Do not assert “deleted” from mere absence after reload. Use that label only when the observed operation supplies evidence. Cached excerpts are historical evidence, not live fallback context. If a range shrinks through editing, resolve its surviving text; retain the original excerpt separately and expose that the source changed. Undo/Redo restores canonical identities and may resolve an orphan again.

For shared content, references address the canonical target. Navigation prefers the invoking occurrence if it still exists; otherwise offer valid occurrences rather than guessing a semantic replacement. Borrowed content owned by another Document is excluded from new same-Document anchoring, matching Gloss ownership rules.

## Authoring, Gloss and context behaviour

Add **Reply to selection** and **Include selection in context** alongside the existing Block actions. Capture the selection before controls take focus. Show a temporary preview with the existing SVG range mechanism. No new keyboard shortcut is proposed.

**Recommended transaction boundary:** selection/pinning remains session work. A new anchor becomes canonical only when its first referencing contribution is committed. Human Submit creates its reply anchor/segments and commits the contribution atomically. A successful mock response can create needed context anchors in its own canonical commit. Cancellation creates no hidden annotations or dirty state. Before commitment, a source edit invalidates the revision-bound pending selection and requires reselection; it must not be silently truncated or rebound. Already committed anchors follow normal standoff edits.

The admission extension should verify only the new anchor definitions/segments, their same-Document ownership, and the existing bounded contribution operation. Validate inverse operations too. Preserve the normal fallback for edits that cannot prove local admission. Do not generalise the Gloss validator into arbitrary unchecked annotation writes.

Existing Gloss controls remain authoritative. The inspector can show Glosses overlapping the resolved passage, open a definition in the existing editor, or invoke `gloss.create` with the preserved range. A reply anchor and a Gloss may overlap independently: deleting either must not delete the other. Selecting an existing Gloss's passage as a reply target captures the passage, not the Gloss's lifetime.

Keep three records conceptually distinct:

1. **Reply target:** the source to which a contribution responds; no implied copying of all surrounding content.
2. **Selected context:** editable session choices, including sources and explicitly chosen existing Gloss definitions. Overlapping Glosses may be shown as suggestions, but are not automatically included or treated as facts.
3. **Consumed context:** a bounded, immutable manifest of what the mock actually read: target identity, source revision, captured text/Gloss value, origin (`reply-target` or `selected`), ordering and exclusions/limits. Store this with the generated contribution. Live context may later change without rewriting historical consumption.

Resolve and validate context at invocation, deduplicate deliberate overlaps without losing their selection provenance, and recheck revisions before committing asynchronous output. Missing/stale items require user action; never silently replace them with an old excerpt or omit them. Read Increment 1's existing `context` field as legacy selected-target provenance, **not** as proof of exact historical text consumption.

## Copy, deletion and structural-edit rules

| Operation | Recommended semantics |
|---|---|
| Native Save/reload or Undo/Redo | Preserve all authored identities. Rebuild only the derived index; do not create anchors during load. |
| Reorder/move inside the Document | Preserve identities and references. Range membership follows its segments rather than original offsets or the first Block's identity. |
| Split/join TextBlocks | Existing annotation operations carry `annotationId` across segments. Reindex changed Blocks only. A Block target to an absorbed Block remains missing; do not reinterpret it as a range or redirect it to the join survivor automatically. |
| Delete some/all text or a source Block | Surviving ranges rebase normally. Definition and reply records outlive lost segments. Excerpts remain available for inspection and explicit recovery. |
| Explicit repair | “Reattach to selection” deliberately replaces an anchor's segments in one undoable operation. Warn that every reference sharing that anchor will follow the repaired passage. No fuzzy matching. |
| Copy a complete target and its referring content | Allocate fresh Block, anchor, segment and copied contribution identities; remap internal targets using the actual copied closure, including destination resource identity. |
| Copy a referring contribution without its target, within the same Document | Preserve the explicit link to the original unique target. This is intentional reference reuse, not creation of another annotation segment. |
| Copy outside the source Document without the complete target | Preserve origin identity/excerpt as unresolved `outside-copy`; no live binding to a coincidentally matching ID. |
| Partial range copy | Allocate a separate clipped anchor for copied source text. A copied reply requiring the full original anchor must not silently bind to the clipped fragment: retain its same-Document original link, or mark it incomplete/outside-copy in a different Document. |
| Ordinary Cut/Paste | Honour the existing operation's identity policy. Do not assume “cut” proves identity-preserving movement: current text interchange records `preservedIds: false`. Apply copy semantics, then source deletion semantics where applicable. |

A copied contribution must not duplicate a committed chronological ordinal or violate Increment 1's **exactly one draft** invariant. Recommend allowing one copied contribution to replace an empty draft atomically, retaining original author/time/ordinal as provenance and assigning new chronology only on Submit. Reject contribution-wrapper insertion into a nonempty draft, or multiple-wrapper insertion, with guidance to copy the ordinary composition instead. Do not overwrite existing draft work or introduce multiple-draft management. Whole-Document independent copies may preserve internal chronological order while remapping identities. Existing non-conversation Blocks remain ordinary content.

Extend only explicit known-schema handling in both native Block clone and Mutable fragment paths. Do not recursively replace arbitrary matching strings. Preserve malformed/unknown versions as inert data with diagnostics. Include unanchored definitions when copying a whole conversation; never delete them through incidental cleanup.

## Approval decisions and implementation sequence

Approval is requested for these recommended boundaries:

1. **One initial contiguous TextBlock selection**, with split/join survival; multi-Block/discontinuous creation deferred.
2. **One passive range-anchor type in the existing linked registry**, plus narrow canonical admission and clipboard adapters. This is a new annotation schema, not a new annotation subsystem.
3. **Commit-on-use anchoring:** provisional selection/context does not dirty the Document; source edits before commitment require reselection.
4. **Copy policy:** same-Document links outside the copied closure retain original targets; foreign/incomplete copies stay explicit unresolved references; a copied contribution can replace the existing empty draft, with other wrapper pastes explicitly rejected.
5. **Explicit Gloss inclusion and captured consumption manifests**, without automatic context inference.

Within Increment 2, implement in three practical slices:

- **Range lifecycle (medium):** schema, local resolver/index, one-range commands, temporary preview, atomic anchor/reply authoring, Save/history and deletion/split/join resolution.
- **Copy and repair (medium/high):** both remapping paths, partial/outside closure rules, contribution chronology on paste and explicit reattachment. This is essential qualification, not an optional later cleanup.
- **Gloss/context integration (medium):** existing Gloss actions/lookup, selected-versus-consumed context, bounded stale-result checks, minimal Desktop/Textual action parity and a concise report.

Shared-code impact is confined to annotation registration/admission and the two interchange paths. Existing split/join algorithms, Gloss authoring UI, retained editor hosts and application presentation contract should remain unchanged unless a concrete integration defect requires a small correction. No SQL migration is proposed. Retain the existing default-enabled Dialectic flag.

Focused qualification: one trusted selection→reply→Submit→navigate flow; nested table/tab content; overlapping Gloss; selection retention and cancel; interior/edge insertion; full deletion and Undo restoration; split/join; same-Document move; representative internal/partial/external copy cases through both paths; Save/reopen; explicit context provenance and stale mock cancellation; shared occurrences; Desktop/Textual round-trip. Assert unchanged Block/Cell/editor identity and unrelated annotations.

Instrument anchor creation/submission and ordinary typing with unrelated annotated Documents present: no new repository snapshots on eligible local operations, no unrelated Document writes, no whole-conversation/Gloss inventory rebuilds on offset-only edits, and no highlight layout work on scrolling. Measure Document registry-copy and root child-list costs on explicit commits rather than claiming constant-time submission. Reuse established regression coverage; do not retest all Block types or expand into the existing empty-editor IME issue, Textual polish, live AI, Sequences or temporal maps.
