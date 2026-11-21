# Michelangelo conversation: diagnosis and fixes

16 November 2026, Australia/Brisbane. Inspected the native saved Document `vaults/imported/Key People and Places in Michelangelo’s Life.ink`, its stored DCP requests/responses/provider receipts, the shared authority cache and the provider's retained conversation. The original Document was not rewritten.

## Observed failures

1. **Relationships were generated but lost during processing.** Contribution 4 contains 30 `<relation>` declarations. A `<br/>` in its third content fragment was rejected by XML lowering. Native streaming then stopped processing all subsequent fragments, including those relationships. Only earlier content survived. The generic warning misleadingly mentioned two unresolved semantic operations; it did not describe the unprocessed tail.
2. **No Claims or Arguments were authored.** The three saved AI responses contain no `claim` classifications or Argument definitions. The Document contains 43 Entities and seven qualification classifications, but zero Relationships, Claims or Arguments. This was not a Semantics count/display error.
3. **Metadata was sparse.** All 43 Entities had empty descriptions; only Michelangelo had a candidate Wikidata ID (`Q5592`). The actual request did include enrichment instructions. Optional vocabulary alone did not reliably produce useful metadata. A further streaming bug held existing-Entity enrichment pending unless a new mention was present, despite existing identity already providing grounding.
4. **Authority retrieval had mixed results.** The cache contains successful Michelangelo metadata and Commons portrait metadata at 11:06:58–11:06:59, followed by numerous failed requests. It retained 32 failed entries from the period beginning 11:06, but older failure records discarded the underlying HTTP/network reason. Successful metadata did not establish verified identity automatically: empty local descriptions/dates provided no contextual corroboration, and the English Michelangelo label/aliases differed from the local full name. Candidate data must not silently become a canonical mapping.
5. **The image request took the wrong route.** For “portraits of these people” the agent called `generate_image` with an invented four-panel historical panorama, rather than sourcing existing portraits. The provider's stored tool result confirms `OpenAI image generation failed (HTTP 400, moderation_blocked)`. It does not identify the triggering part of the prompt. The local Document saved the call and the agent's paraphrase, but not the exact failed tool result. No image attachment or image Block was created. The agent had no authority/image sourcing tool, although the application had a separate shared authority service.

## Output size and chunking

The relationship response completed normally. Its final provider attempt reported 3,708 output tokens against a configured 16,000-token limit, and all 30 relationship definitions are in the received text. Token exhaustion did not cause this loss.

DCP supports consecutive, interleaved XML fragments. That is incremental parsing and admission within one response, not automatic follow-up generation after reaching a token limit. Existing continuation rounds service tool calls and bounded repair. Cumulative native budgets still apply across fragments. The authoring guidance now explicitly distinguishes these behaviours and encourages definitions near their related prose.

## Changes

- Accept `<br/>`, `<br />`, bare `<br>` and uppercase `<BR>` as native newline text. Support `strong`/`em` as bold/italic aliases, retaining native annotation offsets.
- Preserve the text inside unknown inline formatting and report that adjustment. Script/style/embedded executable structures remain unsupported. Isolate an unsupported content fragment before native admission, clean up only its tentative symbols/mentions/shapes, and continue later fragments. Canonical admission, stale-source checks and cumulative budget errors remain enforced.
- Allow enrichment of a current existing Entity without requiring another mention. New Entities still require grounding.
- Strengthen authoring guidance for principal Claims, reasoned Arguments, native relationship definitions and useful Entity descriptions, while preserving uncertainty and avoiding fabricated facts.
- Add `lookup_authority`, gated by the existing `authorityCache` feature. The agent can retrieve Wikidata/Commons metadata and existing representative images for up to three names/QIDs per call through the shared cache. Results include candidate identities, descriptions, dates, actual image URLs, source attribution and licensing. Lookup does not mutate the Document or create canonical identities; selected images use the existing native image authoring path.
- Distinguish sourcing existing portraits from generating new likenesses in provider instructions, including retained conversation turns.
- Retain artifact tool successes/failures in provider provenance and display exact failures as contribution warnings. New authority failure-cache entries also preserve bounded HTTP/timeout/network reasons rather than only a generic failure string.

## Verification

The replay fixture retains the actual failed relationship response and maps its original aliases to fresh current-exchange identities. It now admits all 30 Relationships, preserves the line break and reports no unresolved semantics, with no snapshots or network requests. Additional regression checks cover newline/annotation offsets under character-by-character streaming, unknown formatting, unsupported fragment isolation, subsequent semantic definitions and existing-Entity enrichment without a new mention.

Authority tests cover read-only lookup and embedding the returned image URL through native admission, failed/disabled/cancelled lookups and request budgets. Provider tests cover tool negotiation for both providers and retained-turn instructions. An artifact transport test preserves the exact `HTTP 400, moderation_blocked` error in provenance and a warning. Controller tests verify warning persistence through native serialization and Undo/Redo with streaming both enabled and disabled, without automatic saves.

Validation: 132 distinct focused tests passed across the parser, provider, cache and attachment suites. Type checking and the server build passed. The sourcing tests use fixture responses; no paid image request was retried.

Existing saved contributions are historical records. These fixes do not retroactively invent missing Claims/Arguments, re-run paid generation, or write the user's Document. New requests can source actual portraits through the new tool once the updated server is running.
