# Dialectic Test #5 — read-only diagnosis

2026-11-08. Sources: `vaults/imported/test5.ink`, the supplied uncommitted response, current implementation, and the two existing local continuity-journal slots for this exchange. No application code, native Document, journal or provider state was changed; no AI request was sent.

## Finding

**The exact quotation is valid and contiguous. The response instead reuses expired authoring handles and a revision token from the preceding exchange. The single repair ran. The displayed selection error belongs to a separate manual-selection path.**

The saved Document has committed contributions #1–#9 and a draft, but no committed Test #5 AI response. Consequently the complete failed request/attempt details are not in the native file. The journal supplies repair/lifecycle evidence; the pasted output supplies the failed response. These sources must not be mistaken for a saved successful exchange.

## Answers

1. **Native identity.** In contribution #8's successful exchange `c4897907-3f29-49c3-8342-dd1e4b33cb1d`, `source-130ec807-0c52-4aee-838a-67996007acf2` resolved to TextBlock **`7b18edb3-d484-47cc-bb79-a135d71e2c30`**, the third TextBlock in opening contribution **`d3050ead-a8e5-41a1-87bc-426236e38c32`**, Document `9393ebab-3471-405d-bb44-6148715fba0d`. That historical association does not authorise the same handle in Test #5 (`dd7f1337-ad4d-408c-b309-84a5356a2d3e`).

2. **Exact text.** The supplied 169-character selector equals the entire native TextBlock text, exactly once. The saved `read_source` result also contains that exact text with `status: complete` and `hasInlineObjects: false`.

3. **Boundaries.** It is one native text run in one `standoff-editor-block`, with no inline objects or cross-Block boundary. The preceding exchange already committed an anchor covering Cells **0–168 inclusive** (end-exclusive boundary 169): property `538cdbe4-8f1b-4034-a6eb-23325c14f9f6`, definition `30c5dbe2-f1be-4f32-b9c2-4b2df2f27efc`. Multiple ordinary Cells are supported; the annotation does not require a single Cell.

4. **Revision/capability validity.** `cab3099e-e07e-412c-81ba-8a10b2bf6e95` is exactly the token returned during #8. Test #5 copied both that token and the source handle. It also copied #8's contribution handle `source-f44814fd-94f6-4b69-8e53-095daef99f84` into `replyTargets`. Every exchange constructs a fresh `DcpSources` with new handle/revision maps. Unchanged source text does not make these old capabilities valid again.

5. **Error operation.** DCP preparation processes anchors through `DcpSources.exact()`. An unissued handle fails `target()` with **`Unauthorized source handle`**, before selector matching or revision comparison. Preparation attributes this to `$.anchors[0]`. By contrast, the quoted **`Select one nonempty range in one TextBlock.`** exists only in `controller.selectionRange()`, which reads the browser's current selection for **Reply to selection**, **Include selection**, or **Reattach to selection**. DCP exact anchoring does not call it. The available records cannot identify which control fired or when its shared notice replaced another message; attributing this message to the model's selector would be incorrect.

6. **Two sentences.** This is a task-compliance discrepancy, not an unsupported selector. Contribution #9 requested the sentence beginning “A map is useful precisely because”. The requested first sentence is **55 characters**, Cells **0–54 inclusive**. Both the 55-character sentence and the full 169-character passage are supported ranges when supplied with valid current authority.

7. **Repair.** It **was invoked once**. Journal sequence 31 is `prepared` with `repair: true`; sequence 32 is `uncertain`, also `repair: true`, after abandonment without native acknowledgement. Both identify Test #5 and two provider responses: `resp_0575e0adc91d282f006aeffdbae7dc81939f9b40cd68e1b035` and `resp_0575e0adc91d282f006aeffdbe3cb48193aca09c5bb5d6e924`. Here `prepared` means a final provider response was received, not that native validation succeeded. The repair prompt prohibits more tools, and both client and broker reject tool calls during repair. This prevents recovery through new discovery/source reads when the needed current authority was not supplied already.

## Smallest correction proposed for review

No range-expansion or selector-validation relaxation is needed. Resolve the intended native Block in the **current** exchange, read its fresh source/revision, and anchor the first sentence. Obtain a fresh contribution handle for the additional reference as well.

For robust recovery, permit the existing bounded read-only discovery/source tools during the **single repair** of source/identity failures, within the existing call/deadline limits. Keep a second validation failure terminal. Do not automatically accept, remap or trust a historical handle. A focused regression should replay these old handles, recover fresh ones, and assert the claim's exact 55-Cell span and unchanged source text.

Separately, keep the failed exchange's diagnostic inspectable when a manual selection action updates the general UI notice. This is an error-presentation concern, not a new annotation system.

Relevant implementation: `dcp/sources.ts:38,152`; `dcp/exchange.ts:70`; `controller.ts:169,216`; `dcp/live.ts:49–56`; `server/dialectic/providers.ts:14`; `server/dialectic/broker.ts:90–92`. All frontend paths are under `src/features/dialectic/`. No implementation changes have been made.
