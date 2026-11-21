# Genuine Semantic TextBlock Specialisation — Architectural Qualification

**Status:** investigation and proposed qualification plan only. No feature implementation or production registration is included. M1–M6 remains accepted and unchanged.

**Source baseline:** `4b9b672e91bbcf4e9490602ae8f899e47ddf956f`. Scope follows [Section 11 of the approved Feature Brief](MINIMAL_TYPE_EXTENSIBILITY_FEATURE_BRIEF.md#11-priority-follow-up-investigation-genuine-semantic-textblocks). Line references below describe this baseline; symbols identify the intended change sites.

## 1. Recommendation and qualification boundary

**A genuine semantic TextBlock can reuse the existing Cell model and editor. It needs a small, explicit implementation-family classification at construction/codec boundaries, plus targeted eligibility and structural-edit policy changes. A new view registration alone is insufficient.**

Keep all three identities separate:

- **Authored identity:** `payload.type` and canonical `viewType` remain `verse-line-block`; never alias or retag them to `standoff-editor-block`.
- **Representation:** the existing `ContentRecord.inlineKind === 'standoff'` identifies a Cell sequence, with existing inline placements, revisions and standoff arrays.
- **Active behaviour:** an owned BlockRegistry binding supplies the existing `StandoffEditorView`; its mount supplies `inputPolicy: 'standoff'`. This does not authorize every operation available to ordinary paragraphs.

Recommend a bounded prototype with ordinary local typing, caret/IME, annotations, same-type Enter/split, native save/reload and Undo/Redo. Permit non-destructive selection/annotation across compatible visible hosts. **Initially refuse automatic boundary joins and destructive multi-Block replacement whenever a semantic text host would be consumed.** This includes same-type joins: equal type names do not establish a safe metadata/reference merge. This is a deliberate editing limit, not full paragraph-operation parity. Explicit Block removal remains available through the existing structural command.

No general Block inheritance, registry consolidation, per-type editor subclass, new Cell format, parallel renderer or blanket replacement of exact-type checks is warranted. The M1–M6 declaration indexes remain partial, passive and unrelated to text-host admission.

This is **qualified for a test-only prototype, not yet for production rollout**. Native grammar, fast-path evidence, input boundaries and disabled-binding behaviour must be proven together. The larger application adapters identified below must be qualified before claiming full Find, Entity, Gloss, transfer or export support.

## 2. What the current code establishes

| Boundary | Existing implementation and consequence |
| --- | --- |
| DTO construction | [codecs.ts](src/block-tree/codecs.ts), `decodeBlockTree`, L57–99: only the exact base type removes `payload.text`, sets `inlineKind`, and constructs one Cell per Unicode code point. A semantic DTO currently stores text as an ordinary payload field and has no Cells. `viewTypeFor` preserves unfamiliar type names. |
| Canonical model | [types.ts](src/block-tree/types.ts), `ContentRecord`, L23–38: `inlineKind` already separates representation from `viewType`. `BlockNode` does **not** carry `inlineKind`; occurrence-side code must obtain its canonical record or use the pure type classification. Do not add another reactive field merely for eligibility. |
| Native codec | [portable.ts](src/history/stage-c-gates/portable.ts), `encodeGateDocument` L78–100 and `decodeGateDocument` L149–165: encoder requires the exact base host; decoder accepts `inline` only under that type and requires it even for empty text. Both enforce a single inline authority. This module is used by native persistence and durable History despite its old introductory comment. |
| Native envelope | [native-resource.ts](src/persistence/native-resource.ts), `nativeEnvelope` L101–108 and `parseNativeEnvelope` L133 onward: authored/canonical type agreement, reserved fields and value encoding are independent checks. Existing wire Blocks already contain a type and inline atoms; no extra persisted family field is necessary for a bounded set of known types. |
| Ordinary editing | [commands.ts](src/block-tree/commands.ts), `inlineReplacementOperations` around L890: requires `inlineKind`, not the base type. Cells, annotations and revisions already supply local editing. [StandoffEditorView](src/rendering/standoff-editor-view.tsx), mount at L619: supplies the normal selection, composition and input policy. Its root DOM type is nevertheless hardcoded at L872. |
| Range access | [editor.ts](src/reactive-editor/editor.ts), TextRanges source at L197–204: eligibility and Cell coordinates use the exact base type. Until corrected, a new Cell host cannot obtain normal range snapshots. [text-ranges.ts](src/runtime/text-ranges.ts) itself is coordinate/version based and can remain unchanged. |
| Selection | [cross-block-selection.ts](src/runtime/cross-block-selection.ts), `position`, `resolveParagraphs`, `selectDocument` at L36, L54, L78: exact-name eligibility. Same-view, same-parent, visibility and structural barriers are separate conditions that must remain. [cross-block-input.ts](src/input/cross-block-input.ts) L287 also filters sibling extension. Even local double-click hit testing calls `crossText.position`; this is not only an optional cross-Block feature. |
| Enter | [gateway.ts](src/input/gateway.ts), `insertStandoffParagraph` L678–720: selected and collapsed paths differ; selected boundary insertion constructs a base-type DTO. [commands.ts](src/block-tree/commands.ts), `insertEmptyStandoffSibling` L1120 onward also hardcodes the base type. Interior `splitStandoff` already clones the source type. Fixing only interior split gives inconsistent Enter semantics. |
| Join and deletion | Gateway L216–274 removes empty Blocks and joins at boundaries. Backspace can remove the current empty Block **before** checking the preceding type. `joinStandoff` L1224 onward accepts any two Cell hosts, retains the left payload, transfers right Cells/annotations and deletes the right definition. It rejects right children/owned relations/shared content, but does not reconcile the right Block Properties, intrinsic metadata or opaque relations. |
| Cross-Block replacement | [cross-text-edit.ts](src/block-tree/cross-text-edit.ts), `planCrossTextEdit`: accepts any `inlineKind: standoff`, clones the first payload into output lines, consumes later definitions, moves selected margins and rejects some attachments/sharing. Widening selection eligibility would expose this policy to different semantic types without further checks. |
| Fast paths | [inline-plan.ts](src/block-tree/inline-plan.ts), `inlineOwnerFor`, and [split-plan.ts](src/block-tree/split-plan.ts), `splitChangeFor`, already use representation and graph proofs. `emptyParagraphChangeFor` L39 additionally requires the exact base type. [repository.ts](src/block-tree/repository.ts), `commit` L444 onward selects these proofs before full planning. |
| Ownership evidence | [resource-boundary.ts](src/block-tree/resource-boundary.ts), `preservesResourceOwnership` L192–212 has two exact-name exemptions. A new host creation/removal can invalidate ownership evidence even if the split recognizer succeeds. Repository `commitInline` L559–614 marks that evidence unavailable; later operations can then lose structural fast paths. This is distinct from an immediate full validation on every typed character. |
| Disabled view | [block-outlet.tsx](src/rendering/block-outlet.tsx) uses the existing UnknownBlockView when no binding exists. [unknown-block-view.tsx](src/rendering/unknown-block-view.tsx) shows a label, children and relations, but does not render the unknown Block's own inline Cells. The editable-descendant fallback proved for a semantic **container** does not prove a semantic text-host fallback. |

The accepted [negative compatibility test](src/block-tree/minimal-type-compatibility.test.ts) directly confirms the current construction/native boundary: a `verse-line-block` DTO produces no Cells, and retagging a native inline host with that name is rejected. This investigation does not change that test.

## 3. Smallest representation mechanism

### Compare the options

| Mechanism | Appropriate use | Why it is insufficient alone |
| --- | --- | --- |
| Existing `inlineKind` | Authoritative representation on a constructed canonical record; existing editing, SQL extraction and many graph proofs. | Does not exist before decoding a DTO or native Block. It is not a type registry or an operation policy. Opaque clipboard records can also carry it. |
| Small pure family predicate | Recognise explicitly qualified authored type IDs before construction, in native/history decoders and in workers. | Establishes Cell representation only; does not settle joins, list conversion, external admission or feature-specific semantics. |
| BlockRegistry capabilities | Discover active views and feature operations. | Registry activation occurs after some decoding and is editor/browser scoped; its availability must not determine saved data interpretation. `inline-editor` is not sufficient codec authority. |
| Accept every native Block with an `inline` array | Could make native self-description independent of a known type list. | Broadens grammar to arbitrary inline hosts, still leaves DTO construction unresolved, and changes unknown/opaque admission. Larger than the requested bounded extension. |
| Alias or normalise the authored type | Reuses base-type branches. | Loses or contradicts authored identity, including the native agreement check; does not provide genuine specialisation. |

### Proposed pure boundary

Introduce a single small pure module, proposed path `src/block-tree/cell-text-types.ts`, with a constant-time `isCellTextType(type)` predicate over an immutable, build-time list of qualified native type IDs. Initially the ordinary production list still contains only `standoff-editor-block`; the prototype supplies its extra ID in an isolated test build. Later approval of a native semantic type adds one explicit entry and one browser binding.

This is a **narrow implementation-family classification**, not a new mutable Block registration system. No lifecycle methods, subscribers, factories, inheritance, schema service or runtime plugin loader. It must be dependency-free and identical in main-thread, worker, server and headless codec builds. Do not consult a user document, active view registry, property index or arbitrary imported declaration to populate it.

Where a canonical record is already available, keep `inlineKind` as the representation test. Where an operation requires a qualified editable host rather than merely retained inline data, combine representation with the family predicate and, for mounted interactions, the existing mount policy. Use direct record lookups by content key, not scans or new per-keystroke discovery.

Codec changes use the same predicate in both directions. They retain authored type agreement, required inline arrays (including empty arrays), rejection of simultaneous payload text and inline authority, atom validation, owned definitions and placement validation. Unknown types remain unknown and do not acquire Cells from arbitrary payload text. Existing legacy DTO export already uses `inlineKind`; its text-encoding algorithm needs no new type branch.

Keep normal codec support independent of feature enablement. Disabling a semantic view must never change how the same file decodes. A later production authoring feature follows existing feature-flag conventions; no feature toggle should remove grammar needed to preserve previously authored documents.

## 4. Proposed editing semantics for the first prototype

The proposal deliberately separates editable text from operations that destroy or duplicate Block identity. Ordinary base paragraphs keep their existing behaviour.

| Operation | Proposed semantic-host behaviour |
| --- | --- |
| Creation | Fresh Block/placement identity; authored/canonical type unchanged; `inlineKind: standoff`; Cells from code points; no parallel `payload.text` authority. A test-owned factory supplies the DTO, then existing insertion/identity allocation performs creation. |
| Typing, replacement, deletion inside a host | Existing Cell edits, grapheme navigation/deletion, range rebasing, immediate feedback and Undo/Redo. Shared content typing remains shared, as it is today; focus and selection stay occurrence-specific. |
| IME and provisional input | Existing StandoffEditorView/gateway mechanisms. No new serialization, validation, annotation scan or dirty tracking on provisional characters. Only committed content changes enter canonical history. |
| Enter in the interior | Split into two Blocks with the same semantic type. Left retains Block/placement identity, prefix Cells and attachments; right gets fresh Block/placement identity and suffix Cells. Reuse existing annotation clipping/point-affinity logic, with tests; do not repair the existing point model in this work. |
| Enter at start/end/empty | Same semantic type on the fresh empty sibling. Preserve current focus convention: start inserts before and leaves the caret on the original; end inserts after and focuses the new sibling; an empty host follows the existing start case. |
| Enter with a local selection | Preflight the continuation policy **before** deleting selected text. Delete and split/insert atomically, preserving the same-type rule at both boundaries. One Undo restores the entire operation. No hardcoded base-type DTO in this path. |
| Shift-Enter / `insertLineBreak` | Match the current gateway: both paragraph and line-break input create a sibling. Do not introduce a special verse soft-break rule. Literal newline Cells already present in data remain preserved. |
| Backspace at start / Delete at end | If either affected text host is semantic, preserve both Blocks and their data. Consume the browser boundary edit and give an existing notice; moving focus to the neighbouring mounted host is permitted. No implicit join or empty-Block removal, including same-type and mixed-type pairs. A failed operation must not fall through to DOM editing. |
| Explicit join API | Reject pairs involving a semantic host before snapshotting or mutation. Existing base/base joins retain their current contract. Do not rely on UI gating alone. |
| Cross-Block selection | Allow qualified mounted Cell hosts through the same view, visibility and ordinary-sibling barriers; mixed types may be selected/copied/formatted. Keep hidden tabs, media, page/list boundaries and other structural restrictions. Document-wide selection retains its existing explicit traversal scope. |
| Cross-Block destructive replacement | Reject selections spanning multiple hosts if any is semantic. This applies to typing, Delete, cut, multiline replacement and structured paste, at the command/planner boundary. A notice keeps the selection intact. Formatting remains per-host annotations, not one cross-Block native range. |
| A selection inside one semantic host | Non-newline replacement uses the existing inline command; do not route it through the full cross-Block clone merely because the selection originated in the cross-selection controller. Structural multiline replacement requires the same continuation/preflight rules as Enter. For the first prototype it may be refused explicitly; no silent conversion to base paragraphs. |
| Lists, tasks, tabs and special containers | Editing a host already inside a compatible structural child slot is distinct from converting it. Keep automatic list/task conversion and create-text-tab operations unavailable for semantic hosts until separately qualified. Do not widen their exact-type gates. |
| Explicit removal/move | Existing structural commands remain the authority. Removal is a deliberate Block operation with Undo; refusing automatic boundary deletion does not make a Block undeletable. |

### Intrinsic metadata and continuation

The existing split copies nearly all payload fields to the right, and empty insertion copies the source payload. This is not a safe universal policy for source identifiers, numbering, anchors or imported provenance.

For the smallest prototype, specify a conservative continuation envelope rather than inventing an extensible metadata-inheritance framework:

1. The left/original Block keeps all authored metadata unchanged.
2. A newly generated right/empty sibling receives the same type, a new Block ID, an empty or clipped standoff array, and an ordered copy of qualified presentational Block Properties. Repeated properties remain repeated. New property instances receive fresh IDs when IDs are present; source instances remain unchanged. This policy applies only to the new semantic family, not existing base paragraphs.
3. Start with a plain semantic fixture with no intrinsic metadata. A second fixture with arbitrary metadata must round-trip and support local typing, but **structural continuation is refused** unless all of that payload has an explicit copy policy. Do not strip unknown metadata and proceed. The first proof can therefore establish genuine text hosting without claiming arbitrary imported-metadata splitting.
4. Qualify only existing alignment properties for continuation in the initial demonstration. Unknown/semantic Block Properties remain editable/persistable but block continuation until their duplication semantics are specified. This rule is operation-specific and does not use membership in the partial property indexes as a validity test.
5. Preserve existing standoff range behaviour and linked-definition ownership; do not clone a Document-local definition registry onto a new line. Local definition registries, identity-bearing payloads, source anchors, or unsupported authored fields require an explicit refusal in this first continuation policy.
6. For new semantic types, structural split requires an ordinary owned child occurrence with unambiguous ownership, not a root/relation/external boundary or shared source/ancestor. Use existing reference counts and parent/location evidence to check the affected ancestor path. Local text editing may still be shared. Existing base-type shared-split behaviour is unchanged.

A small pure helper in proposed `src/block-tree/cell-text-editing.ts` can house continuation eligibility/payload construction and the boundary-consumption rule, shared by commands and UI. It need not be a registered policy or callback framework. Return a reason for ineligible operations; command authority must recheck. The plain semantic family can later acquire carefully qualified metadata rules without changing the editor model.

### What would be needed to permit joins later

Same-type automatic join is a possible follow-up, not part of the smallest safe prototype. It must define compatibility of both ordered Block Property arrays and intrinsic metadata, ownership of retained attachments/opaque relations, incoming Block/placement/range references, annotations with colliding IDs and the fate of the absorbed identity. Mixed-type join additionally needs explicit conversion or a deliberate result-type policy. “Left wins” alone is insufficient.

Do not add vault scans to look for references on Backspace. Current incoming-owned-placement evidence is not a complete index of semantic references, and no local proof can establish absence of references in unopened external documents. A future join must state that limit or retain an explicit identity/provenance mechanism; this investigation does not invent one.

## 5. Precise proposed change map

These are proposed changes, not an implementation performed by this investigation. **Core** means required for the bounded text-host prototype; **qualification** means a dedicated safety/compatibility case; **adapter** means later application parity, not a dependency to prove basic Cell editing.

| Classification | File and precise change |
| --- | --- |
| Core | New `src/block-tree/cell-text-types.ts`: pure qualified-type predicate described above. No changes to M1–M6 APIs or registries. |
| Core | [src/block-tree/codecs.ts](src/block-tree/codecs.ts): replace only `decodeBlockTree`'s L57 text-host classification. Keep `viewTypeFor`, authored type and ordinary graph recursion unchanged. |
| Core | [src/history/stage-c-gates/portable.ts](src/history/stage-c-gates/portable.ts): replace encoder L79 and decoder L149 host-name checks with the pure classification; preserve the rest of inline/identity grammar for both native and History profiles. Correct the stale introductory comment when implementing. |
| Core | [src/reactive-editor/editor.ts](src/reactive-editor/editor.ts): TextRanges source L197–204 chooses Cell eligibility/coordinate/revision from qualified canonical `inlineKind`; retain the separate UTF-16 source/plain-text path. Do not rewrite TextRanges itself. |
| Core | [src/rendering/standoff-editor-view.tsx](src/rendering/standoff-editor-view.tsx): root `data-block-type` reflects actual authored type/view type. Reuse the existing class, CharacterFlow, mounts, provisional input, range layers and geometry pipeline unchanged. Test-only feature registers this existing view under the new ID. |
| Core | [src/runtime/cross-block-selection.ts](src/runtime/cross-block-selection.ts): update `position`, `resolveParagraphs`, `selectDocument` eligibility; preserve barriers. `replace` handles same-host inline replacement via the existing fast command and refuses unqualified multi-host consumption. |
| Core | [src/input/cross-block-input.ts](src/input/cross-block-input.ts): sibling-extension guard L287 uses qualified host eligibility. Keep selection gestures and mount hit-testing; ensure rejected replace/cut retains data/selection. |
| Core | New `src/block-tree/cell-text-editing.ts` and [src/block-tree/commands.ts](src/block-tree/commands.ts): shared conservative continuation policy; apply in `insertEmptyStandoffSibling` and `splitStandoff`; preflight semantic join/consumption before `this.state()` (which takes a snapshot outside transactions). Preserve existing base branches. |
| Core | [src/input/gateway.ts](src/input/gateway.ts): preflight boundary Backspace/Delete before **all** empty removal/join branches; Enter selected/collapsed paths use the same continuation policy/type. Refusals prevent default and use an existing notice channel, without throwing uncaught event-handler errors. No list/task default changes. |
| Core | [src/block-tree/cross-text-edit.ts](src/block-tree/cross-text-edit.ts): enforce the semantic multi-host consumption refusal at planner entry, before location/count scans or cloning. `commands.replaceAcrossBlocks` already reads `current()` without an initial snapshot; keep that behaviour and reject before entering expensive planning. Single-host structural multiline semantic replacement remains explicitly unsupported until its continuation path is qualified. |
| Core | [src/block-tree/split-plan.ts](src/block-tree/split-plan.ts): widen only `emptyParagraphChangeFor`'s type check to a qualified Cell host. Keep all adjacency, fresh-edge, reference-count, definition-owner and Cell-conservation guards. `splitChangeFor` needs tests, not an automatic rewrite. |
| Core | [src/block-tree/resource-boundary.ts](src/block-tree/resource-boundary.ts): extend both safe-host checks in `preservesResourceOwnership` to qualified non-resource Cell hosts, requiring the expected representation. Preserve resource-root exclusions, type/ID/source/owner invariants and external/resolved edge guards. Never replace the function with an unconditional family capability check. |
| Core | [src/rendering/document-style-bar.tsx](src/rendering/document-style-bar.tsx): focused target eligibility L67 must include qualified mounted Cell hosts, or the toolbar may retain an unrelated previous paragraph target. Keep scope and saved-selection rules. |
| Core | [src/runtime/markdown-input.ts](src/runtime/markdown-input.ts): explicitly keep new semantic hosts literal for automatic Markdown transformations in the first prototype, using the existing literal-context gate before candidate/conversion work. This service does not currently have an exact-type exclusion; merely leaving list guards alone is insufficient. Explicit formatting remains available. |
| Qualification | [src/rendering/unknown-block-view.tsx](src/rendering/unknown-block-view.tsx): add an inert own-Cell preview for a compiled-in qualified text host when its view binding is absent. Use escaped text and image alt/placeholders; no editable mount, VE/controller activation or second Cell editor. Preserve label, children and relations. This addresses data visibility, not older-reader compatibility. |
| Qualification | [src/runtime/mutable-clipboard.ts](src/runtime/mutable-clipboard.ts), [src/interchange/insertion.ts](src/interchange/insertion.ts) and the Mutable insertion entry points in [commands.ts](src/block-tree/commands.ts): preflight semantic destinations/consumption, including disjoint selections and suffix splitting; do not let direct commands or generic structural insertion bypass continuation policy. Allow explicitly selected plain-text inline paste only through existing text replacement. Reject unsupported structural cases before commit/cut consumption. Do not broaden materializer allowlists. See §7 for opaque inline-source risk. |

The core is more than two codec replacements, but consists of small eligibility/policy edits to existing routes. It introduces no alternative editing engine. Qualification guards are required before enabling the pilot in a normal application shell; disabling clipboard in a unit fixture is not a substitute for proving those guards.

### Reuse unchanged; verify with tests

- [ContentRecord/BlockNode](src/block-tree/types.ts), ordinary Cell storage, IDs, placement ownership, [projection updates](src/block-tree/projection.ts), local replacement/rebasing, existing range/annotation arrays, renderer precedence and VE registration.
- [inline-plan.ts](src/block-tree/inline-plan.ts), the interior split proof, repository commit/history/dirty-state infrastructure, and manual save orchestration. Preserve required canonical validation; do not weaken validators to make a new name pass.
- [native-resource.ts](src/persistence/native-resource.ts), [durable-core.ts](src/history/durable-core.ts) and the saved-reader/SQL extraction algorithms need compatibility tests but no new wire field/schema. They call the shared codec or use `inlineKind` already.
- [canonical-search-source.ts](src/runtime/canonical-search-source.ts), [document-counts.ts](src/runtime/document-counts.ts), [knowledge/collect-facts.ts](src/knowledge/collect-facts.ts), [knowledge/saved-reader.ts](src/knowledge/saved-reader.ts) and [saved-projection.ts](src/knowledge-sqlite/saved-projection.ts): existing Cell-coordinate extraction is reusable once construction and decoding are correct. Do not add a native semantic type to the UTF-16 `nativeTextTypes` list.
- [range-annotations.ts](src/runtime/range-annotations.ts), [text-ranges.ts](src/runtime/text-ranges.ts), [range-edits.ts](src/runtime/range-edits.ts), [annotation-monitor.tsx](src/rendering/annotation-monitor.tsx) and shared temporary decorations can remain representation/range driven. No new zero-width support is implied.

## 6. Application exact-type assumptions: classify, do not globally replace

| Area | Sources and recommendation |
| --- | --- |
| Find and annotation scope | [text-search.ts](src/runtime/text-search.ts) `scopeNodes` L43 excludes semantic Cell hosts; [annotation-capabilities.ts](src/application/annotation-capabilities.ts) `documentTexts` L82 and `documentAnnotations` L96 filter them again. Generalise these eligibility sites before claiming full document Find/annotation discovery. Preserve existing scope traversal and cancellation. |
| Generic text operations and Show/Hide | [text-operation-capabilities.tsx](src/application/text-operation-capabilities.tsx) `queries.text` L26; [show-hide-projection.ts](src/runtime/show-hide-projection.ts) L131/L156. Qualify Cell-host eligibility; retain operation leases and visibility rules. These affect workflows beyond bare RangeAnnotations. |
| Live Entity inventory/backlinks | [live-document-entities.ts](src/application/live-document-entities.ts) `properties`, `supported` and the range-vs-Block classification L139; [document-entity-changes.ts](src/application/document-entity-changes.ts) `snapshot` L18. All must agree that semantic hosts use standoff ranges, not Block Properties. Preserve local-reference signature comparisons that ignore ordinary offset rebasing; never turn typing into a full Entity inventory refresh. Saved SQL support alone does not prove live Entity UI parity. |
| Gloss | [features/gloss/controller.ts](src/features/gloss/controller.ts) command/open guards L17/L35; [session-index.ts](src/features/gloss/session-index.ts) occurrence filter L66. Existing linked definitions can persist/render as data, but creation and occurrence discovery remain base-only until these adapters are qualified. Keep Document ownership and relationship evidence unchanged. |
| Autocomplete / Initialis | [features/autocomplete/index.tsx](src/features/autocomplete/index.tsx) L33/L353; [features/initialis/controller.ts](src/features/initialis/controller.ts) L27/L34. Do not automatically enable provisional editing/authoring merely from family membership. Defer and report unavailable in the prototype. |
| Phosphor and restricted fields | [application/phosphor.tsx](src/application/phosphor.tsx) `textNode` L118 intentionally requires a particular Screen child and plain character Cells. Cardex name/description validation also intentionally restricts supported content. Keep these contracts; generic Cell hosting does not make a verse line a valid Screen/name field. |
| Lists/tasks | [text-lists.ts](src/runtime/text-lists.ts), [tasks.ts](src/runtime/tasks.ts), command `wrapTextBlockInList` L529, [list-wrap-plan.ts](src/block-tree/list-wrap-plan.ts) and [task-state-plan.ts](src/block-tree/task-state-plan.ts). Retain exact ordinary-paragraph gates. Generic input eligibility is not permission to reinterpret semantic identity as a list/task item. |
| Text tabs / tables | [text-tabs.ts](src/runtime/text-tabs.ts) L8 uses legacy encode/copy; [tab-commands.ts](src/runtime/tab-commands.ts), [tables.ts](src/runtime/tables.ts), [block-menu-actions.ts](src/runtime/block-menu-actions.ts) have invocation, focus and conversion gates. Keep conversion gates initially. A semantic host may be an ordinary child in a visible tab/table cell, but this does not prove tab cloning, inline-image export or table operations. |
| Menus / export targeting | [document-interchange.ts](src/runtime/document-interchange.ts) L92/L120/L128/L146 distinguishes selection vs structural destinations by name. Leave corresponding menu commands unavailable until their selection, conversion and suffix semantics are qualified together. Do not simply widen menu visibility. |
| History preview / restore | [history/preview.ts](src/history/preview.ts) L15 and [rendering/history-preview.tsx](src/rendering/history-preview.tsx) L6 omit text for new names; presentation can later use qualified Cell-host classification. [block-restore.ts](src/block-tree/block-restore.ts) deliberately restricts types, metadata and properties. Keep Restore this Block unavailable; durable history/Undo support does not authorize this separate restoration boundary. |
| Window host transfer | [document-host-transfers.ts](src/application/document-host-transfers.ts) L179 explicitly refuses non-base inline editors. Keep this conservative until retained mounts, overlays and composition are tested in the real host-transfer flow. Do not use sharing the component as proof. |
| Other knowledge adapters | [vault-knowledge.ts](src/application/vault-knowledge.ts) L76/L152, [facts-query-provider.ts](src/application/facts-query-provider.ts) L81 and [document-application-capabilities.tsx](src/application/document-application-capabilities.tsx) L441/L522 contain additional text filters. Classify each as read/discovery or authoring before widening; never alter SQL schemas to compensate for UI filtering. |

Older code under `src/library/original` and standalone experimental codecs are not migration targets. In particular, [portable-spike/codec.ts](src/block-tree/portable-spike/codec.ts) still has its own host restrictions; its JSON validator is imported by native code, but that does not make its experimental encode/decode functions the active native codec. Do not change unused codecs solely for search-result uniformity.

## 7. Compatibility risks and release gates

### Native/history compatibility

The proposed encoding uses the existing type plus inline-atom fields. Existing base documents must encode/decode identically. **Unchanged envelope shape is not backward-reader compatibility:** an older decoder rejects a new semantic host's inline array before rendering. A disabled binding in an upgraded build is a different case from an old build that does not recognise the family at all.

For the test-only proof, retain the current envelope version and document the expanded accepted type grammar; test old-reader rejection explicitly. Before any production type ships, decide the minimum supported reader/release policy and unsupported-type diagnostic. If older readers must retain arbitrary new inline hosts, that requires a broader native grammar/fallback design and is outside this minimal proposal. Do not promise that view fallback fixes decoding.

Claiming a previously arbitrary string as a Cell type also changes interpretation of older native records that stored `properties.text` under that name. The new decoder must not silently accept dual authorities or invent a migration. Audit real uses before production registration; keep payload-only old-native conversion as an explicit compatibility decision. A legacy DTO import is a separate, declared conversion path.

The shared predicate must be present in the durable History worker, native readers and server/knowledge builds as well as the UI. History stores/replay preserve canonical identity and `inlineKind`, but preview/restore have separate limits described above. Do not change native envelope versions or upgrade legacy data as a side effect of enabling the view.

### Clipboard and opaque inline records

[serializer.ts](src/interchange/serializer.ts) already serializes canonical Cells by `inlineKind`. [materialize.ts](src/interchange/materialize.ts) L75–100 uses a fixed supported-type set, then can attach inline Cells even when the resulting view type is `mutable/opaque-block`. Consequently, an unknown semantic text host can become an **opaque record with its own inline authority**. The current native encoder's host check rejects that combination.

This is a source-derived compatibility hazard, not a newly executed semantic-text round-trip proof. The accepted M1–M6 clipboard fixture used a semantic container with ordinary text descendants and therefore did not exercise it. **Do not claim opaque downgrade alone proves safe save/reload for a semantic text host.**

Keep admission allowlists unchanged. The prototype must test the real serializer/materializer and refuse insertion of an unsupported opaque-inline result before publishing a document mutation (including paste into an ordinary paragraph). A later durable opaque-inline representation would be separate work; adding `mutable/opaque-block` to the editable text family is not an acceptable shortcut.

Likewise, ordinary plain-text fragments are base-type paragraphs. [insertion.ts](src/interchange/insertion.ts) `inlineMergePredicate` requires exact destination type; without an explicit local-text route, pasting them into a semantic line can become structural insertion. Its suffix path clones payload and resets some IDs/anchors independently of Enter. Guard that route; do not globally loosen exact-type merge compatibility. Explicit plain-text, single-host paste may reuse `replaceInlineRange`, preserving the existing literal-newline behaviour of that command; multiline structural paste remains refused in the first proof. Structured cut must not consume the source after a refused destination operation.

### Export, indexing and references

- [interchange/export-plan.ts](src/interchange/export-plan.ts) has a labelled fallback that includes inline text for unfamiliar types. [persistence/markdown.ts](src/persistence/markdown.ts) has a different fallback: it includes payload text/children but not an unfamiliar host's own Cells. Test both; do not claim uniform export support. Keep Markdown projection explicitly unsupported or add a separately qualified inert Cell-text fallback before exposing it. Neither export establishes semantic round-trip fidelity.
- SQL extraction preserves the actual `typename`/`authoredType`, Cell coordinates, properties and image positions already. Prove full and incremental saved projection agree for the pilot; do not add a per-type SQL schema or convert Cell positions to UTF-16.
- Local standoff Entity/Block/Gloss references and linked definitions must survive native round trips unchanged. Future joins and cloning must use existing typed-target rules, not search-and-replace IDs in arbitrary metadata. This proposal does not add target kinds or cross-Block native ranges.
- Native private Cell keys can be regenerated on decode. Assert durable Block/placement identity and ordered equivalent Cell contents across reload; assert surviving Cell identity during edits and Undo where it is meaningful, not private-key equality across independent decoding.

## 8. Performance qualification

The extension must preserve existing bounded paths, not just produce correct text.

1. **Typing:** ordinary local edits already reach `inlineOwnerFor`. Require no full snapshot, full graph planning/validation, occurrence rebuild, vault scan, SQL refresh, save or new registry discovery. Cost may follow the affected host's text/annotations and dependent occurrences; do not claim constant cost independent of host length.
2. **Enter at boundaries:** extend the empty-leaf recognizer and preserve its dependency/reference proofs. A successful command followed by full planning because of the new name is a regression. Verify both insertion and Undo/Redo paths.
3. **Interior split:** existing recognizer already admits Cell hosts. Verify resource-ownership evidence stays valid after split/Undo/Redo; otherwise a later structural action may silently take a broader path. Exercise normal Document ownership and retained definitions.
4. **Refused joins/consumption:** refuse before `TreeCommands.state()` and expensive planner entry. UI preflight alone is insufficient. No full-document snapshot/reference scan just to determine that a semantic join is prohibited.
5. **Complex atoms/graphs:** the present split recognizer deliberately falls back for image Cells and complex structure. Preserve full validation where required; measure and report that limit rather than claiming every image split is snapshot-free. Do not widen the text-leaf proof without a separate graph argument.
6. **Selected Enter and structural paste:** existing generic transactions/cross-text plans can take snapshots or clone state. Treat these as explicit structural operations, measure them separately and do not label them equivalent to collapsed-caret typing. No new unbounded path may be introduced for ordinary semantic text input.
7. **Geometry and application observers:** retain the same frame/layout cache, invalidation, temporary SVG ranges, caret/IME handling and cleanup. New type checks must not add DOM measurement. Test Entity-summary/backlink observers with ordinary edits and offset rebasing if those adapters are enabled; no unrelated row or document update.

Use existing [inline-performance](src/block-tree/inline-performance.test.ts), [split-performance](src/block-tree/split-performance.test.ts), [resource-boundary](src/block-tree/resource-boundary.test.ts) and range-annotation bounded-work patterns. Add call-through counters for snapshots, planning, ownership evidence invalidation, reference/occurrence rebuilds, document scans, network/save calls and unrelated updates. Do not mock canonical validation away.

Because the future change touches input and structural fast paths, require real Flint before/after measurements using [benchmark-flint-typing-browser.mjs](scripts/benchmark-flint-typing-browser.mjs) and [benchmark-flint-empty-paragraph-browser.mjs](scripts/benchmark-flint-empty-paragraph-browser.mjs), with paired base/semantic fixtures and identical flags. Include many unrelated Blocks/open Documents and unopened vault entries. Record handler and deferred work separately; browser/IME correctness and headless frame timings are distinct evidence.

## 9. Test-only proof-of-concept plan

No prototype was implemented in this investigation. Proposed fixtures and tests must remain outside production assembly.

### Isolated vocabulary and build

- A pure test fixture declares `verse-line-block` and a test-owned FeatureScope binds it to `StandoffEditorView` with explicit capabilities. Use M1 discovery to assert authored identity and active binding. Do not modify M1–M6 definition index behaviour.
- Unit suites substitute the pure family catalogue module in isolated test module graphs **before** importing codecs/editor. The real predicate, codecs and commands still run; substitute only the immutable list. A dedicated browser proof build can supply the same list through its test Vite resolver, following the existing Flint harness's local plugin pattern. Include worker resolution in that build.
- No mutable global test registration hook, production environment switch or runtime setter is required. Test builds must demonstrate UI/headless/worker agreement. A normal-build test proves the pilot is absent, historical unknown handling unchanged and the M1 negative test still valid outside the substituted build.
- This seam is for qualification only. A separately approved production type would be a static pure entry and an owned runtime binding; no per-user schema activation or new registry service.

### Required proof cases

| Group | Required evidence |
| --- | --- |
| Construction | Empty and nonempty semantic DTOs produce genuine Cells, correct `inlineKind`, unchanged type and no parallel text authority. Include astral characters, combining sequences and literal newlines. A source/plain-text host remains UTF-16 based. |
| Native / History | Existing envelope/codec round trip of type, Block/placement IDs, metadata, Cell text/images, repeated Block Properties and overlapping/linked annotations; both native and durable History paths; empty `inline: []`. Reject dual authority, unknown inline hosts, invalid atoms and authored/canonical mismatch. Demonstrate old-reader rejection. |
| Mounted editing | Real beforeinput and consecutive caret restoration, grapheme deletion, selection gestures/double-click, multi-caret, canceled/noncancelable input, composition commit/cancel and Undo/Redo. Use the existing view and test both standoff rendering settings. Browser IME evidence is required in addition to jsdom events. |
| Enter | Interior/start/end/empty and local selected ranges; same type on each result, fresh Block identity where created, source identity preserved, expected caret, annotation clipping and single Undo. Assert refusal leaves everything unchanged for unqualified metadata/properties, references/shared ancestry and non-child slots. |
| Boundary safety | Same-type and mixed-type semantic/base joins, empty current/previous/next Blocks, both deletion directions, direct command calls and multi-host replacement. All unsupported consumptions refuse before mutation/snapshot; base/base regression behaviour remains unchanged. |
| Selection / annotations | Local Cell snapshots and stale-version rejection; mixed-host sibling copy/formatting; hidden tab/media/page/list barriers; document select-all; generic monitor, style/Entity/Block/Gloss data retention and point limitations. No new single range spanning Blocks. |
| Production missing binding | Upgraded test codec with pilot view unregistered: native re-save retains data; label and inert own-text preview appear; no editable mount or automatic feature/VE activation. Separately prove old-reader failure rather than conflating the cases. |
| Clipboard / export | Real structured serialization/materialization including opaque-inline case; unsafe insertion refused with source/destination intact; explicit plain-text inline paste retains host identity; no allowlist change. Exercise both export implementations and record their different fallback limits. |
| Knowledge | Headless saved-reader and SQL projection of Cell coordinates, actual semantic type, annotations and inline objects. Full/incremental equivalence. Adapter tests are required only if live Entity/Gloss/Find parity is included in the later implementation brief; otherwise state exclusions visibly. |
| Bounded work | Pair ordinary and semantic hosts in small/large fixtures. Typing, collapsed Enter and Undo/Redo preserve expected fast paths, ownership evidence, unaffected record/DOM identities and zero unrelated indexing/save work. Refused boundary edits do no full planning. Run real Flint comparisons. |
| Scope | No permanent semantic ID, new inheritance, legacy migration, property registry seed, clipboard admission expansion or format field. Existing manual save and feature defaults remain intact. |

Suggested new test paths are `src/block-tree/semantic-text-host.test.ts`, `src/block-tree/semantic-text-editing.test.ts`, `src/rendering/semantic-text-host.test.tsx`, and a dedicated test-support declaration/browser fixture. These are planned files only. Existing M1–M6 tests remain unchanged in the ordinary build; positive semantic tests live in the isolated prototype build.

For a future implementation, run the relevant existing native/History, inline/split/resource-boundary, standoff editor, cross-selection, range annotations, clipboard, Markdown input, saved-projection and feature-lifecycle suites plus `npm run typecheck` (reactive and server). Add feature-specific tests only for adapters actually changed. Expand testing for observed failures rather than attempting a legacy-wide migration.

### Proposed delivery boundary

1. Prove pure classification and native/History grammar in isolation.
2. Prove existing mounted Cell editing, range access and semantic DOM identity.
3. Add conservative continuation and boundary-consumption rules, with fast-path/evidence tests.
4. Qualify disabled binding, clipboard refusals and saved knowledge projection; then run paired Flint measurements.
5. Review the evidence and editing limits before authorising any permanent type or wider application adapter changes.

If the prototype requires a new native field, arbitrary inline-host admission, broad registry propagation, changed Cell invariants or a second text renderer, stop and requalify: those are departures from this smallest proposal.

## 10. Evidence actually gathered in this investigation

Read the approved brief, repository conventions, accepted negative test and the implementation paths cited above. Source inspection distinguishes current behaviour from proposed changes and unexecuted prototype expectations. No semantic type or test harness was added and no production/test implementation was modified.

Ran this focused baseline command against the existing code:

```sh
node node_modules/vitest/vitest.mjs run src/block-tree/minimal-type-compatibility.test.ts src/block-tree/split-performance.test.ts src/block-tree/cross-text-edit.test.ts src/block-tree/resource-boundary.test.ts src/persistence/native-resource.test.ts
```

**Result: 5 files passed, 50 tests passed, exit 0.** Counts: minimal-type compatibility 3; split performance 12; cross-text edit 7; resource boundary 13; native resource 15. These prove the current constraints and baseline regression state, not future semantic TextBlock support.

No new feature typecheck/build, semantic prototype, manual IME session or Flint performance run is claimed. Those are explicit acceptance requirements for the separately approved implementation. This deliverable is the qualification document alone.
