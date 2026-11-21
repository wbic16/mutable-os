# DCP task expectations — investigation only

9 November 2026. No contract, schema, validation, UI or media changes implemented.

## Finding

A small, optional, host-owned expectation on the existing DCP task could prevent valid prose from silently completing an explicitly structured authoring task. It cannot determine whether arbitrary prose requests were fulfilled. Keep ordinary conversation unrestricted and do not infer mandatory operations from keywords or from the model's response `intent`.

The current boundary explains the quotation failure:

- `controller.ts` supplies `task.action`, `focus` and `participantRequest`; these identify the request but specify no required native effects.
- `dcp/exchange.ts::prepare` validates the negotiated capabilities, references, exact source selectors and composition, then prepares native operations. Empty annotation arrays and plain paragraphs are valid.
- `dcp/live.ts` invokes the single repair only when validation throws. A well-formed answer saying the source is unavailable passes; it is neither an API refusal nor a structural validation failure.
- `responseIntents` are descriptive conversational acts. Changing `answer` to `create` would not prove that any native operation occurred.

## Smallest plausible mechanism

Extend the existing task envelope with optional expectations derived from an explicit host operation or user-selected authoring option. Absence means ordinary conversation. Reuse negotiated capability identifiers and the existing prepared native plan; do not introduce a second authoring language or ask the model to certify its own success.

For example, an explicit “three source quotations with anchors” operation could require three distinct exact source ranges, attached to the resolved target, with native addressing or Glosses. Check the prepared anchors, selectors and resolved ownership against that requirement before commit. DCP already verifies exact text and fresh source authority. The expectation adds required effects, not weaker source validation. Merely counting three anchors is insufficient: three anchors on the latest instruction would still be wrong. If the intended source has not been identified by the host operation, retain that uncertainty rather than claiming mechanical proof of target selection.

A missing required effect could enter the existing single repair with a concise expectation diagnostic, sharing the original budgets. If still unmet, expose an explicit incomplete-task outcome with the explanation available for inspection; do not mark it as successful native authoring. A model's claim of success, failure or fallback is information, not authority to clear an obligation. This would require a narrowly scoped diagnostic/outcome addition, not a new repair loop.

Do not mechanically grade “substantive commentary,” faithfulness of analysis, or the meaning of arbitrary natural-language instructions. Those remain model quality and review concerns. Free-form chat alone would not automatically acquire expectations; any broader coverage requires an explicit UX decision about how the user expresses the operation.

## Media catalogue and Markdown fallback

The current request advertises paragraphs, groups, lists and tables and defers assets. The Increment 4 plan proposes registered capability descriptors and later managed media staging; it does not establish a completed media catalogue or DCP Markdown fallback. Native rendering support is not proof of DCP authoring or provider support.

A proposed catalogue should distinguish native construction, provider input/output support, enabled host adapters, durable asset handling, and available presentation fallbacks. Expectations should refer to the capabilities actually negotiated for this exchange. An unavailable media operation should be reported before expensive generation where possible.

Keep required native results separate from an explicitly permitted fallback policy. If a user requires a native image with a durable original, a Markdown image URL or prose description does not satisfy that requirement. If a fallback was allowed, report that it was used and which native effect remains unavailable. Do not silently downgrade a native requirement after the model omits it.

Existing `interchange/markdown-import.ts` and `markdown-native.ts` already provide Markdown-to-native conversion paths with different scopes. A future DCP fallback should reuse an appropriate bounded conversion path and the same capability, ownership and asset validation; it should not feed unvalidated Markdown directly into the editor. A converted Markdown construct can satisfy an expectation only if it actually produces the required validated native operation. Ordinary Markdown links cannot manufacture source authority, exact native anchors or durable managed assets.

## Recommendation

Consider this as a separate, small change once the explicit authoring affordance and catalogue identifiers are agreed. Start with one mechanically checkable operation, preserve prose-only conversation as the default, and qualify ordinary conversation, missing effects, wrong targets, successful repair, unavailable capabilities and permitted fallback. Keep expectation checks at exchange preparation/commit, outside typing and document-wide scans.

The present instruction correction improves model behaviour; it deliberately does not implement this enforcement mechanism.
