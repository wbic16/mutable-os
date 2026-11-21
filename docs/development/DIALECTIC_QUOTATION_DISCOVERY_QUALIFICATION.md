# Phase 3 quotation discovery correction

9 November 2026. Focused instruction correction implemented and live-qualified. This is the historical-objects quotation scenario, distinct from the earlier stale-handle Test #5.

## Change

Only two production files changed for this correction: `src/features/dialectic/dcp/authoring.ts` and `server/dialectic/providers.ts`.

- Initial provider instructions now end with explicit source-operation requirements, after the ordinary conversational defaults. Missing initial context requires discovery and reading before a source-unavailable answer; asking for a handle obtainable through DCP is prohibited from the first turn.
- Prefer participant/chronology/contribution filters or a distinctive search phrase, instead of always starting with an unfiltered inventory.
- Explicitly requested quotations may appear in new composition. They remain ordinary text and require the requested native source anchoring.
- Keep source anchor identities distinct from quoted composition identities. A compact example demonstrates styled quoted text without a second declaration of the source alias.

Retrieval/output budgets, model settings, schemas, source validation, single-repair policy, canonical operations and feature defaults are unchanged. No authoring-intent contract was implemented.

## Live result

Run: `node --env-file-if-exists=.env.local scripts/check-dialectic-quotations-browser.mjs`.

The isolated Chrome fixture seeds 26 committed native contributions, alternating human and AI authorship. Contribution #26 contains the original 500-character historical-objects passage, attributed to the AI participant. The exact original quotation request is submitted as #27. It contains no injected source handle or retrieval recipe. The initial structural manifest excludes #26. Normal provider continuity is enabled; history remains available, as in the reported failure. This reproduces the relevant ownership/context conditions, not the original Document's entire Block layout or provider history.

The final run used `gpt-5.4-mini-2026-03-17`, existing low reasoning and the existing 2,048-token output limit:

1. `list_text_blocks` narrowed by the AI participant, starting at ordinal 1.
2. `read_source` on the discovered #26 TextBlock, returning `sourceAuthor: ai`, full text and a fresh revision.
3. A valid contribution #28 containing three exact quotations, three original-source anchors, three native range references and two substantive commentary paragraphs. No repair.

| Quotation | Native inclusive character range |
| --- | --- |
| Historical objects acquire different meanings | 0–44 |
| material traces resist | 291–312 |
| alive to the present | 479–498 |

The commentary distinguishes shifting generational meanings from constraints imposed by material evidence, then explains the tension between present relevance and evidential accountability. The quoted text and commentary are explicitly labelled. This is a manual quality assessment, not a natural-language validator.

All three aliases map to materialised native range identities; the native resolver returns each exact quotation. The source text and mounted editor remain unchanged. Undo removes the response and source anchors together; Redo restores them. Submission and response admission recorded zero repository snapshots and zero projection rebuilds. These are bounded-work observations, not user-visible latency benchmark claims.

Evidence:

- [Final report](../../artifacts/dcp-quotation-discovery/2026-11-09T03-00-23.412Z/report.json)
- [Browser screenshot](../../artifacts/dcp-quotation-discovery/2026-11-09T03-00-23.412Z/browser.png)
- Redacted provider requests, tool results and native commit diagnostics are in that run's `.mutable/dcp-test-phase/` directory.
- Exchange `406e2480-2726-400a-82a0-8b06383025ac`; original source TextBlock `186adbf7-b2e0-46fe-9777-98d0c7cec646`.

## Trial history and limits

The instruction change is a mitigation, not a guarantee of task fulfilment. All trials are retained under `artifacts/dcp-quotation-discovery/`:

- `02-54-56` and `02-55-51` UTC: browser harness connection failures before provider use; fixed an IPv4/localhost binding mismatch.
- `02-56-32`: discovery/read succeeded, but duplicate source/composition aliases failed validation; repair renamed source anchors without updating dependent targets and failed again.
- `02-57-53`: after adding alias guidance, the model successfully committed exact anchors and commentary without repair. The harness incorrectly demanded a per-quote reply reference or Gloss in addition to the requested anchors.
- `02-58-40`: a repeat model run retrieved the right source but still duplicated aliases, including during repair. This motivated the small wiring example.
- `02-59-52`: with the example, native authoring succeeded without repair. A remaining harness assertion incorrectly expected range anchors in `annotationRefs`, which deliberately excludes range-anchor properties. The harness now checks the alias map, native range definitions and native resolver directly.
- `03-00-23`: final instructions and corrected harness passed the full qualification, including native resolution and Undo/Redo.

No rejected model output was rewritten or committed, and no validator was relaxed. The earlier failed trials demonstrate why prompting alone is not a hard authoring guarantee.

## Automated checks

88 tests passed across `server/dialectic/providers.test.ts`, `server/dialectic/broker.test.ts`, `src/features/dialectic/dcp/dcp.test.ts` and `src/features/dialectic/dialectic.test.tsx`. Added coverage checks initial wire instructions for both providers and the native AI-source/three-quotation path, including attribution, exact ranges, references, Glosses, source preservation, Undo/Redo and zero snapshots/rebuilds. Typechecking passes.

Qualification used an isolated broker and synthetic Document. The existing interactive application server was not restarted; its broker must load the changed instructions on its next restart.

The separate [task-expectation investigation](DCP_TASK_EXPECTATIONS_INVESTIGATION.md) recommends an optional explicit expectation on the existing task, with ordinary conversation unrestricted and fallback handling made explicit. It remains a proposal.
