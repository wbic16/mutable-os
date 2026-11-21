# Dialectic — actual exchange diagnosis

8 November 2026. Read-only inspection; no application or Document changes.

## Evidence and conclusion

Source: `vaults/imported/New conversation.ink`, saved 7 November at 22:35 Brisbane time. SHA-256: `a452ef0b5d9c36375a07c3cd9cdd937ae85b085e950e17f3d9d6f1e2ce19c03c`.

The latest persisted AI contribution is **#4**, `8910833b-c88b-474d-ab73-a987cd7cafc5`, exchange `4cd51242-36d2-4986-8039-a5006d5b4265`, completed at 22:26:35. A subsequent human contribution #5 is also saved; there is no later AI exchange in this file.

**The source annotation and three native Blocks exist. The requested relationship does not.** The model created two arguments on the same earlier passage, instead of one on that passage and one on its new thesis. It also addressed the source TextBlock rather than the requested containing contribution. The host faithfully materialised this structurally valid but incompletely fulfilled response.

## Request, context and retrieval

`request.task.participantRequest.text` contains the complete four-task request, beginning “Let's conduct a practical test of Dialectic's native authoring capabilities.” It asks for three substantive Blocks, the exact source annotation, a **new-thesis → qualifies → earlier-claim** relationship, and a reference to the earlier contribution.

`selectedContext` is empty. The initial manifest contains **only contribution #3 and its descendants**: 23 sources, 1,654 text characters, 22,673 bytes, complete within its limits. It supplies identities, participant/timestamp metadata, exchange-local handles and revision tokens. The quoted phrase appears there in the request, but the original source is not initially included.

The model then calls **`search_symposium` once**, with query `negotiated boundary between attention and interpretation` and limit 5. No `read_source` call occurs. Search returns three complete TextBlocks: the original in #1, the earlier AI quotation in #2, and the request quotation in #3. The original result supplies:

- TextBlock: `586c2b14-0776-407b-b882-76a9cd55092e`.
- Source handle: `source-9bdeab7c-876e-4bc8-ae85-280b0df72818`.
- Revision token: `dd844ed9-de54-4346-8e74-f90331f46cd5`.
- Containing contribution #1: `b1f87949-76dd-48ee-8d8b-20df7f046213`, with its own issued handle.
- Complete text, no inline objects, existing annotations and semantic handles.

Thus **discoverability worked**. The model selected the original source rather than the quotation in its prompt. To include it upfront, select #1 and **Include in context**, or place the caret in the passage and choose **Include caret Block**, then submit the new request. This was not necessary for this exchange because retrieval succeeded. Remembering a phrase is distinct from holding its current authoring handle.

## Returned versus persisted

| Requirement | Raw DCP response | Saved native state |
| --- | --- | --- |
| Three content Blocks | Three `paragraph` nodes, `p1`–`p3` | Three separate `standoff-editor-block`s: `390905c1…`, `c5278daa…`, `f4922fcb…` |
| Exact earlier claim | Anchor `a1`, correct source/revision/quote; interpretation `i1`, `dialectic/claim` | Anchor `f958d1c5…`; claim property `25bb985b…`, Cell range **44–101 inclusive**, exactly the 58 quoted characters |
| Earlier claim plus new thesis arguments | `arg1.anchor = a1`, **`arg2.anchor = a1`** | Two argument definitions (`937a8e36…`, `79022c01…`) both point to the earlier passage; none identifies the new thesis |
| Directed `qualifies` edge | **`relations: []`** | No relationship authored by this exchange |
| Earlier-contribution address | `replyTargets` contains the source **Block** handle | One native Block reference in `discursiveReferences`; primary reply remains contribution #3 |

The generated paragraphs have bold title annotations, but no generated passage alias for the thesis. `entities`, `glosses`, `suggestions` and `promotionRecommendations` are empty. A Gloss now present on the objection is not in this exchange's response or authoring references and should not be credited to it.

Two provider rounds occurred: search, then final response. **No validation repair occurred.** The final output used 515 output tokens and completed normally; it did not exhaust the 2,048-token output limit. No requested structure was stripped by repair or materialisation. The validator checks references, capabilities and structural integrity; it does not prove that prose instructions were fulfilled. Two arguments sharing an anchor are structurally permissible, so this mistake passed.

An older `qualifies` relation exists from exchange #2, between two earlier passages. It is **not** the requested new-thesis relationship.

## Instructions, fixture comparison and visibility

The saved request contains both authoring examples; its instructions exactly match the implemented instructions and occur in the saved provider system prompt. Profile is `4b-1`. Actual model is `gpt-5.4-mini-2026-03-17`, the same as the successful fixture. No stale-client or disconnected-instructions explanation is supported.

The fixture supplied two selected earlier contributions upfront and obtained a generated passage alias, distinct argument anchors and a directed edge. This real case required retrieval and returned a weaker result. The fixture established capability, **not reliable fulfilment across tasks**. The cause of the model's particular choice cannot be proven from its output; repeated “optional/minimal” guidance is a prompting concern, not evidence of a hidden validator deletion.

Select **AI contribution #4 in the left chronology**, then inspect the right sidebar:

- **Discursive references:** the existing Block address.
- **Authored structures:** expected count is **1 address, 4 annotations, 0 relationships**. Three annotations are bold titles; the fourth is the source claim. Click the `dialectic/claim` entry to navigate and highlight the source with the existing temporary SVG decoration.
- **Semantic identities:** both argument buttons currently resolve to the same passage.
- **DCP exchange record:** complete request, search result, response, aliases and receipts.

`dialectic/*` classifications are registered with `renderers: []` in [markup.ts](../../src/features/dialectic/dcp/markup.ts). There is no permanent source highlight or incoming-reference badge. [view.tsx](../../src/features/dialectic/view.tsx) exposes structures from the selected AI contribution; [controller.ts](../../src/features/dialectic/controller.ts) supplies the temporary inspection highlight. These statements follow the saved data and code, not a new observation of the user's browser.

## Smallest correction for review

1. Tighten explicit structural-task guidance: create a distinct generated thesis passage alias, use it for the thesis argument, emit the requested directed relation, and use the containing contribution handle when that level was requested. Keep ordinary conversation unclassified.
2. Add advisory checks for suspicious duplicate argument anchors and show actual argument endpoints alongside relationship counts. Do not globally prohibit shared anchors or claim a generic validator can infer all natural-language obligations.
3. Make source annotations and incoming addresses discoverable through the existing inspector and temporary decorations; distinguish semantic annotations from styling counts. No parallel annotation system.
4. Qualify the observed retrieval-based case and inspect exact endpoints/direction, not just argument counts. If omission continues, report it; do not silently fabricate a relation or broaden automatic retries.

Persistent provider memory addresses a separate continuity gap. It does not by itself fix these authoring and discoverability defects. The Save error remains separately undiagnosed; the file's presence proves that this version was eventually saved, not that the Save UI blockage has been fixed.
