# Dialectic Semantic Contents — qualification

12 November 2026. Implemented behind `dialecticSemanticContents`, enabled by default. No paid inference calls, backfill, background saving or user Document changes were made. Temporary browser/test servers were stopped.

## Contract and native persistence

```xml
<synopsis>Photography Between Science and Art</synopsis>
<p>...</p>
```

Synopsis is optional plain-text navigational metadata, not a composition Block, heading, Entity or Argument. It has no attributes or target. Default XML instructions ask for a meaningful 3–8-word title, preferably early, preserving purpose and uncertainty. The host accepts up to 160 characters, normalizes whitespace, and uses the last valid Synopsis. Missing or malformed Synopses do not invalidate content; malformed streamed ones use the existing quiet warning notice.

The controller supplies the Contribution identity. `metadata.dialectic.synopsis` stores version, text, AI authorship, participant ID and exchange ID on that native Contribution. Early Synopses wait for the first native content insertion; later Synopses update the same receiving Contribution through canonical admission and its existing Undo group. Completion and cancellation retain the last valid value. Finalized Contribution protection remains unchanged. Native save/reopen preserves metadata and provenance without a sidecar or new persistence representation.

Rootless and legacy root-wrapped XML are supported. The optional contract/grammar addition is negotiated by `synopsisAuthoring: 1`; disabling the feature removes its instructions and metadata admission. Existing JSON remains unchanged and uses fallback labels. No metadata field is added to the strict JSON response schema.

## Navigation and presentation

The existing numbered rail now expands into Semantic Contents. Collapse retains numbers, chronological order and active-entry indication. Expanded entries show a Synopsis or a short source excerpt, plus nonzero semantic counts; an empty footprint says “No semantic objects.” Human, older AI and receiving Contributions remain navigable.

Expansion is a local presentation preference (`mutable.dialectic.semantic-contents.v1`), using the existing local-storage/event convention. It transfers between Desktop and Textual and does not dirty a Document. Textual retains its existing character-cell column widths, inherited typography and keyboard controls. Arrow Up/Down and Home/End move focus among entries; activation uses the existing inspection/reveal path, including `ensureRendered`.

Counts open the existing semantic activity inspector in explicitly labelled **current coverage** mode. Entity, Argument, relationship and Gloss inspection uses existing targets and navigation. Historical activity on the Contribution itself remains separately available; its attribution is not inferred from current annotation location.

## Exact counting rules

Counts are **distinct current semantic coverage**, not counts of operations performed by the AI:

- **Entities:** distinct scoped native Entity references on active ranges in the Contribution's owned text. Repeated mentions count once. Retained Vault references preserve their scope; this panel does not fetch Vault data to reverify availability.
- **Arguments:** distinct native Arguments whose current passage anchors occur in that text.
- **Glosses:** distinct valid native Gloss definitions attached there, including Glosses added by later Contributions.
- **Relations:** distinct valid retained Entity/Argument relationships incident to those covered Entities or Arguments. A relationship can therefore occur in several Contributions' footprints, but only once within each footprint. This is association, not a creation claim.

Deleted/unavailable local definitions and invalid ranges are excluded. Range-anchor infrastructure and Gloss properties do not inflate object counts. Native named owned content, including margins, participates in the retained index. Objects created exclusively on another Contribution are represented there in current coverage and remain attributable to their authoring Contribution through historical activity.

The implementation extends `DialecticReferences`, reusing its affected-record property pass, native definition/anchor indexes and dependency signals. It adds no independent TOC or semantic registry. Membership changes update only affected Contribution aggregates; ordinary offset rebasing does not recount semantics. Submission eligibility is retained separately from mutable native record references so draft-to-submitted transitions are detected reliably.

## Qualification and measurements

Focused deterministic qualification passed across parsing, native admission and UI:

- Optional, early, late, duplicate, malformed and root-wrapped Synopses; enabled/disabled negotiation.
- Automatic receiving-Contribution association, no extra Blocks, same native Block/DOM identity through streaming, cancellation, grouped Undo/Redo and native persistence.
- Native reopening into a new editor; human fallback; Desktop/Textual transfer and retained expansion preference.
- The university fixture: 19 distinct generated-text Entities despite repeated mentions, six Arguments and eight incident relationships. Its human source receives three Entities and two Glosses. Invalid Gloss recovery and later independent semantic operations remain intact.
- A 1,000-Contribution UI fixture with an unrelated loaded Document: one Synopsis update recomputed one label, rebuilt zero row lists and recounted zero semantic summaries. Draft typing and unrelated-document typing did not recount coverage. Opening counts and warning disclosures reuse existing inspectors.
- Unmounted-target navigation resolves the canonical Contribution and delegates realization to `ensureRendered`; it does not require a mounted node to select the entry. The test verifies that handoff, not a new virtualization implementation. Compound Contribution flows retain the renderer's existing eligibility restrictions.

| Measurement | Result |
|---|---:|
| 1,000-entry initial expansion, jsdom fixture | 126.1 ms |
| Single Synopsis native metadata update, same fixture | 23.3 ms |
| Rows rebuilt / coverage recounts for that update | 0 / 0 |
| Synopsis labels recomputed | 1 |
| Real Chrome: provider first text → checked first native display | 40.0 ms |
| Real Chrome: provider completion → checked finalized display | 67.5 ms |
| Streaming snapshots / detected full repository-map enumerations | 0 / 0 |

The large fixture's native Document/DOM construction took about 5.3 seconds; that is initial fixture loading, not per-Synopsis work. Expansion still mounts one entry per Contribution: this increment does not virtualize the navigation rail. The jsdom timings are not compositor-paint guarantees.

The existing real Chrome **Flint typing benchmark**, with 250 paragraphs, linked Dialectic ranges and 40 edits, was run once with Contents disabled and once enabled:

| Edit handling | Disabled | Enabled |
|---|---:|---:|
| Mean | 1.51 ms | 1.47 ms |
| Median | 1.20 ms | 1.20 ms |
| p95 | 4.50 ms | 4.00 ms |

Both runs recorded zero snapshots and zero semantic-index updates during typing, preserved unrelated Cells, and passed trusted insertText, Backspace, Enter and Undo/Redo checks. These small runs show no material regression, not a statistically established speedup or a measurement of a populated Dialectic sidebar.

Client/server TypeScript and whitespace checks passed. Two older single-transaction diagnostic-upload tests were made explicit about using the nonstreaming compatibility route; production logging behaviour was not changed.

Evidence: `artifacts/dcp-streaming/qualification.json` and screenshots; `artifacts/dialectic-contents/typing-before.log` and `typing-after.log`. Reuse: `scripts/check-dialectic-streaming-browser.mjs`; the typing harness now accepts `BENCHMARK_CONTENTS=off` for comparison. Focused cases are in `dcp/synopsis.test.ts`, `dcp/native-stream.test.ts` and `conversation-updates.test.tsx`.

## Deliberate limits and next options

Human entries use bounded excerpts (up to eight words/96 characters from an early owned text Block; at most 32 candidate Blocks and 120 Cells per text read). No historical inference backfill occurs. A single existing AI response could supply a human Synopsis without another paid call, but would require explicit scope. The smallest proposed extension is `<synopsis for="request">…</synopsis>`, accepted only when the host has an unambiguous triggering human Contribution. Unqualified Synopsis would continue to mean the receiving AI Contribution. This extension is **not implemented**.

Manual Synopsis correction is not exposed in this increment. It should use a separately attributed correction/override rather than rewriting the immutable AI-authored Synopsis. No claims of live-model Synopsis quality are made: qualification used deterministic responses and no paid calls.
