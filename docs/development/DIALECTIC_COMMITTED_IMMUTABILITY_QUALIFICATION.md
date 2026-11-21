# Dialectic — committed-contribution immutability boundary

8 November 2026. Historical pre-implementation boundary inspection. The user subsequently approved reusable native text protection; it is now implemented. See [the final qualification](DIALECTIC_PERSISTENT_CONVERSATIONS_QUALIFICATION.md). The original findings below explain the boundary that required approval.

## Result

**The current Dialectic application boundary cannot completely enforce immutable submitted contributions.** It can suppress ordinary input and its own controls, but shared text and structural commands can mutate the same canonical records without going through the application controller. Existing read-only policies also disable the annotation operations this feature must preserve.

The revised instructions explicitly say: “If a shared admission-policy change is unavoidable, explain why and pause for approval.” This is that boundary. The [continuity plan](DIALECTIC_PERSISTENT_OPENAI_CONVERSATIONS_PLAN.md) has been updated to remove provider branches/context IDs and all branch UI. No provider implementation or shared-editor changes have begun.

## Concrete evidence

| Existing path | Consequence |
| --- | --- |
| [Dialectic view](../../src/features/dialectic/view.tsx), `DialecticDesktop` / `DialecticTextual` | Hosts the retained native application tabs/editor. `decorate` adds labels only; submitted text remains in normal native mounts. The controller is not their mutation gateway. |
| [ReactiveEditor](../../src/reactive-editor/editor.ts), constructor | Creates one shared `TreeCommands`; its occurrence resolver blocks passive occurrences only. Dialectic has no per-contribution text-versus-annotation admission callback. |
| [CommandRegistry](../../src/block-tree/registry.ts), `authoringAllowed` | Can veto registered commands, but direct `editor.commands` calls bypass it. It cannot guarantee immutability. |
| [Cross-Block selection](../../src/runtime/cross-block-selection.ts), `replace` | Calls `commands.replaceAcrossBlocks` directly. A range can involve draft and committed content; checking only the event target would be insufficient. |
| [Scry completion](../../src/features/autocomplete/index.tsx), `finishDraft` | Calls `commands.completeProvisionalText` directly. Completion can combine text replacement and annotation; blocking all annotations would be wrong. |
| [TreeCommands](../../src/block-tree/commands.ts), `publish` and transactions | Ultimately commit operation batches directly to the repository, independent of the Dialectic controller. This includes structural operations and changes targeted by canonical placement rather than a DOM occurrence. |
| [Repository](../../src/block-tree/repository.ts), `subscribeBeforeChanges` / `subscribeBefore` | The cheap hook receives only label and history cause, not target records or operations. The other captures a repository snapshot. Neither provides a safe bounded write-admission interface. |

Reused the existing test **“keeps chronology, inspection, reply target and selected context separate”** in [dialectic.test.tsx](../../src/features/dialectic/dialectic.test.tsx). It mounts Dialectic, submits three contributions and successfully calls `replaceInlineRange` on the first submitted contribution. **1 passed, 33 skipped**; command completed in 9.94 seconds. This establishes the current permissive boundary; it is not qualification of a new lock.

## Why application-only alternatives are insufficient

- `contenteditable=false`, capture listeners and disabled buttons can improve presentation, but do not intercept direct commands, multi-target edits or deferred completion.
- Reusing Sequence passive occurrences would disable all authoring, including source annotations. Its bounded native family support cannot replace arbitrary retained contribution compositions without changing the accepted renderer/lifecycle design.
- Wrapping or replacing `editor.commands`/`repository.commit` from the feature would be runtime monkey-patching of a shared boundary, not an existing supported application hook. It would make disposal and multiple application owners unsafe.
- Restoring text after a change would already have published mutation/history/dirty events and could disrupt caret and annotation state. It is not immutability.
- Checking only before Ask detects divergence but does not prevent rewriting the submitted record.

## Smallest change proposed for approval

1. **One shared pre-commit admission hook** in `CanonicalRepository`, before any operation is published, covering both bounded and broad routes. Supply the existing operation batch, read-only current records and commit cause; do not create a snapshot, serialise a Document or plan a second transaction. The hook must also cover direct repository calls and history replay.
2. **Dialectic-owned policy**, in a small feature module, identifies committed contribution ownership using existing indexed placement/ownership information. Reject changes to their text, composition membership and record identity; permit additions to the Document chronology and non-destructive standoff/linked semantic authoring. Evaluate all touched targets, not only the focused Block. Drafts and unrelated Documents remain unaffected. Register with feature lifetime, not only the currently visible app view.
3. **Narrow native input integration** exposes the same text-edit permission to the retained standoff input path. Prevent forbidden typing/paste/composition before provisional DOM changes; retain selectable source text, Copy, annotation selection and passive presentation interactions. Do not reuse the all-authoring passive flag. Other mutation controls receive a useful rejection from canonical admission.
4. **Keep existing history semantics:** legal annotation Undo/Redo works; undoing Submit can return that contribution to draft, and undoing an AI commit can remove its complete contribution. Do not treat every history operation as an unrestricted bypass. Provider checkpoints recover from such native history changes. No new version-history system.

Generic shared code carries no Dialectic schema rules. The policy must remain cheap when no protected contribution is involved. Inline changes should use their owner and touched records; structural commands may inspect affected ownership dependencies. External/shared sources must not be silently rewritten or globally relabelled read-only: a write that would alter protected canonical content must be rejected, while other ordinary Documents remain editable. Resource loading is not a content rewrite and must retain its normal admission path.

**Expected shared modules:** `src/block-tree/repository.ts` for admission; a minimal permission bridge in `src/reactive-editor/editor.ts` and the retained standoff input/rendering path. Exact helper placement can follow the existing text-input ownership boundary; no renderer duplication or broad command rewrites. Policy and submitted/draft state belong in `src/features/dialectic/`.

## Focused acceptance checks

- Draft typing/IME remains normal; submitted typing, Cut/Paste, cross-draft/committed replacement, Scry text completion and structural deletion are rejected before canonical mutation.
- Native source annotations, Glosses and directed relationships still work; no collapsed selection, remount or duplicate source editor.
- Undo/Redo of Submit, AI commitment and annotations remains coherent; ordinary graphical Flint editing is unchanged.
- Rejection leaves canonical revision, history and dirty state unchanged. Ordinary typing in drafts/unrelated Documents performs no repository snapshot, full-Document scan or projection rebuild.

Reuse current tests and one focused browser flow; no broad regression campaign. After approval of this shared boundary, continue the approved provider-continuity slices. The user Document and credentials were not changed or sent to a provider during this qualification.
