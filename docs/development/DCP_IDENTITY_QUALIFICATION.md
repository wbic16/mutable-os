# Typed DCP identities — qualification

9 November 2026. The bounded refinement recommended in the [identity audit](DCP_IDENTITY_AUDIT.md) is implemented. The accepted source-discovery/quotation correction is retained.

## Implementation

`dcp/identities.ts` defines a small vocabulary and formatting/role-check helpers. It contains no registry or resolver. `DcpSources.issue` still uses the original forward/reverse maps, now issuing `src:<22-character exchange tag>:<kind><counter>`. Repeated issuance of the same typed native target returns the same handle. The counter does not recycle; a fresh source scope receives a fresh random tag. Native revisions, GUIDs, ownership and exact-range checks are unchanged.

Generated declarations use `new:b1` for composition, `new:r1` for original-source anchors, `new:s1` for generated passages, and the other roles listed in the audit. Existing `claim` sites now check those roles; model declarations cannot use `src:`. The provider schema constrains each declared ID's role while retaining the same JSON object shape. Native target resolution still checks actual kinds, not just their spelling. Legacy unprefixed aliases remain accepted by host preparation; committed records are not migrated or rewritten. Historical `source-UUID` handles remain expired, as before.

Authoring examples use the convention, including the accepted quotation example with no unnecessary ID on quotation styling. Identity repair guidance now explicitly requires updating dependent references when renaming an ID. The single repair mechanism itself is unchanged.

This touches DCP exchange preparation, markup/semantic declaration checks and provider schema constraints. It adds no canonical operations, typing work, persistent identity system, new protocol, media implementation or task-expectation enforcement. The request/continuity/controller state machines, model settings and budgets are unchanged.

## Qualification matrix

| Requirement | Evidence/result |
| --- | --- |
| Discover earlier AI-authored source without supplied handle | Live fixture uses the exact accepted historical-objects prompt; source #26 is outside the initial structural manifest |
| Same local identity on repeated discovery | Integration test compares inventory, repeated inventory, search, read and direct reissuance; source revision and contribution handle remain stable |
| Three exact quotations and anchors | Live run materialises three exact original-source anchors and three native range references; all resolve to the quoted text |
| Existing/generated and source/composition separation | Reserved `src:` declarations and wrong `new:` declaration roles are rejected; generated Block IDs cannot serve as source handles or passage references |
| Dependent references through repair | Deterministic live-transport test rejects a composition/source alias collision, then uses the existing single repair; renamed anchor references, interpretation, Gloss, arguments and relationship all resolve, with no new source handle or extra tool calls |
| Previous exchange cannot reuse authority | Two real controller exchanges obtain different handles/revisions for the same native source; the old handle and revision are rejected |
| Unknown/wrong-type references | Tests reject unissued same-tag handles, unknown local aliases, contribution-as-TextBlock, Block-as-argument-anchor, and range-as-relationship-endpoint |
| Native authority remains authoritative | Native GUID alone is rejected as a handle; foreign ownership, wrong exact text, wrong revision and changed-source cases fail; native source IDs are unchanged |
| Undo/Redo and Save/reload | Live native transaction undo/redo succeeds; manual Save through isolated transport, browser reload and native admission preserve contribution/Block/anchor/property GUIDs, source text, alias map, range references and exact resolutions |
| Existing DCP behaviour | All **103 tests across seven Dialectic client/server files pass**, including continuity, bounded retrieval, repair, protection, diagnostics, ordinary conversation and source-change checks; `npm run typecheck` passes |

Submission/authoring in the live fixture retained the same source mount and recorded **zero repository snapshots and zero projection rebuilds**. Integration tests retain the same bounded-work assertions. Save and reload intentionally use the existing explicit persistence path outside typing; no background save was introduced.

## Actual live exchange

Command: `node --env-file-if-exists=.env.local scripts/check-dialectic-quotations-browser.mjs`.

One proposed-format live run was made, using the same GPT-5.4 Mini snapshot, low reasoning, 2,048-token output limit, six-call budget and synthetic chronology as the accepted baseline. The fixture contains the original 500-character passage as committed AI contribution #26; the original user request is #27. Normal provider continuity is enabled. No handle or retrieval recipe is added to the user request.

Observed sequence:

1. `list_text_blocks` from ordinal 1 without a participant filter. This first page did not reach #26.
2. `search_symposium` for `Historical objects acquire different meanings`.
3. `read_source` using `src:87fgcgyTXNuXoSsfAVuEUA:b53`.
4. A valid contribution with `new:b1`, anchors `new:r1`–`new:r3`, and reply targets referring to those anchors. No duplicate IDs, rejected output or repair occurred.

| Quotation | Native inclusive range |
| --- | --- |
| Historical objects acquire different meanings | 0–44 |
| the object’s material traces resist whatever story we would like to tell | 278–349 |
| how interpretation stays accountable to evidence | 408–455 |

The response reproduces each quotation in bold ordinary text, followed by commentary: historical responsiveness, material evidence as a constraint on invention, and evidential accountability as the passage's governing standard. Native anchors target the original AI source, not the reproduced paragraph or current instruction. Commentary quality was reviewed manually; no intention validator was added.

Evidence:

- [Report, including save/reload checks](../../artifacts/dcp-identity-quotation/2026-11-09T03-37-10.585Z/report.json)
- [Browser screenshot](../../artifacts/dcp-identity-quotation/2026-11-09T03-37-10.585Z/browser.png)
- Full redacted wire/tool/native diagnostics: that run's `.mutable/dcp-test-phase/` directory.
- Exchange `6c5e2a24-084d-4d12-a944-07f5d7693f13`; source native TextBlock `3ddef0c5-37e1-4601-9e29-95c682102d7b`.

## Comparison and limits

The accepted baseline from `2026-11-09T03-00-23.412Z` and this run use the same fixture and model, but are separate provider conversations with different synthetic native GUIDs and nondeterministic generations. This is a representative comparison, not a controlled reliability benchmark.

| Observed metric | Accepted baseline | Typed refinement |
| --- | ---: | ---: |
| Source handle length in these runs | 43 characters | 30 characters |
| Tool calls | 2: participant inventory, read | 3: inventory, phrase search, read |
| Provider turns | 3 | 4 |
| Validation failures / repairs | 0 / 0 | 0 / 0 |
| Initial provider input tokens | 14,872 | 15,381 |
| Initial instruction characters | 14,689 | 16,202 |
| Initial response-request wire bytes | 42,081 | 45,556 |

Shorter handles do **not** establish a net token saving here: role guidance/schema constraints add overhead, and this run used an extra discovery call. The evidence supports explicit role separation and successful native authoring, not a measured improvement in success rate or cost. Earlier baseline trial failures remain documented in the [accepted quotation report](DIALECTIC_QUOTATION_DISCOVERY_QUALIFICATION.md). No new failed live trial is omitted.

The model still has to reproduce the exchange tag and revision, choose the intended source and keep dependencies coherent. Native GUIDs remain visible for inspection, and contribution/participant filters still use their established IDs. Compactness could be increased only with additional request/reference scoping changes; bare recycled names would compromise stale-reference rejection. Broad typed-reference objects or removal of composition IDs remain outside this small refinement.

The existing provider conversation machinery is untouched; continuity tests verify reuse after reload and repaired-commit recovery. The live fixture creates its own isolated conversation and does not modify or restart the user's interactive Document or broker. The active broker must load the changed schema/instructions on its next restart.

Future native Surfaces can use the existing/new Block distinction. Future managed media resources need a distinct admitted resource kind through the same mapping, not a new GUID scheme. A media catalogue and Surface-backed Markdown fallback must still validate actual capabilities and durable assets. Task expectations, contribution notices and activity controls remain deferred.
