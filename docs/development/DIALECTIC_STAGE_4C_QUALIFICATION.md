# Dialectic Stage 4C — live provider integration

7 November 2026. Implementation and deterministic qualification complete. **Live-account verification remains pending**: the user is testing session credentials; fixture success does not establish account access or successful execution by an external model. Stage 4D has not begun.

## Delivered behaviour

- OpenAI Responses and Anthropic Messages adapters behind a local Node broker. Provider/model configuration, conversational/extended cadence, output-token limit, optional single validation repair, streaming, cancellation and explicit errors use the existing Dialectic coordinator.
- Model dropdowns default to **GPT-5.4 Mini** for OpenAI and **Claude Sonnet 5.5** for Anthropic. GPT-5.4 and Claude Haiku 5.5 are alternatives; Custom model accepts other compatible IDs. These are curated choices, not claims about account entitlement. The deterministic mock remains selectable.
- DCP now admits `reply`, `acknowledge`, `share` and `create`, with `reply` as the host default. Plain paragraphs and empty semantic arrays are normal. The Protocol Key requests minimal sufficient natural communication and explicitly discourages classifying every sentence. Existing argument, Entity, anchor and independent Gloss facilities remain optional.
- **Ask** uses committed native content. **Submit & Ask** commits the complete human draft first. Editing, typing, navigation and changing configuration never automatically invoke AI. Participant identity stays independent of provider/model; a provider switch does not create a new person or require alternating authors.
- Provider streams remain escaped, transient session output. Complete responses pass the existing markup, ownership, source-fence and semantic checks before one bounded canonical commit. No partial response enters the editor. Human-authored passages retain human authorship when AI classifications are added, with AI participant/exchange provenance.
- Successful native exchange records retain the Protocol Key/request, selected-context captures, ordered tool results, actual settings, adapter version, system instructions, returned model/response ID, timestamps, available token usage, and any rejected output followed by the enabled repair. Tool receipt IDs reference existing captured results instead of duplicating them. Failed-attempt details remain session data. Cost is explicitly **unknown**, including after interrupted requests; no currency cap is claimed.

## Broker and lifecycle boundary

Keys travel only to the same-origin local broker. They stay in server-session memory or may be supplied by `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` in the server environment. Password fields clear on submission. Keys are not put in DCP, Documents, browser storage, generated logs or upstream error messages.

The broker requires a loopback connection, loopback HTTP Origin matching Host, a custom request header and an origin-bound random session token. Sessions expire after 30 minutes idle / eight hours maximum. Forget keys, application disposal and normal page exit release the session; abandoned sessions expire. A remote multi-user credential service and OS credential-vault storage remain outside this implementation.

A real development-path defect was found during the user's trial: Vite's string proxy rewrites Host. A **Dialectic-only** object proxy now preserves Host in both Vite configs. The broker's origin check stays strict. Requests through both `localhost:3000` and `127.0.0.1:3000` were verified; a focused real-proxy regression rejects a foreign Origin.

During the diagnostic server restart, the previous process retained open event streams and its SQLite writer lock after closing its listener. That exact old process was stopped and the existing `imported` Cavern reopened successfully through the normal establish route. No database or lock files were removed; this was operational recovery, not a Cavern/schema change.

Each exchange has a 120-second deadline, at most six source tool calls, eight provider rounds, one optional validation repair, 262,144 response bytes and bounded stream/context bodies. Only `read_source` and `search_symposium` are available, using the existing authorised Symposium scope. Cancellation aborts the upstream fetch and prevents a late commit. Round numbers reject replay; busy/generation checks protect canonical commit. Network, rate-limit, refusal and incomplete-output failures do not trigger automatic retry. Repair is separately enabled and labelled as a possible additional charge.

OpenAI uses `store:false` and sends the locally retained request/tool continuation, including required reasoning items, without relying on hosted conversation history. Anthropic receives native Messages/tool-result envelopes. Its schema cannot be recursive, so the adapter expands references to the existing bounded composition depth; paragraphs, groups, lists and tables remain supported. Native validation remains authoritative for both schemas.

## Changed modules and shared impact

| Boundary | Modules | Effect / coverage |
|---|---|---|
| Local broker | `server/dialectic/{broker,providers}.ts`, `server/index.ts` | Protected session routes before general routing; adapter/security/abort/proxy tests. |
| Provider contract | `dcp/{provider-contract,provider-schema,live}.ts` | Bounded provider transport and schemas, session-only client token; provider and integration tests. |
| Dialectic integration | `controller.ts`, `model.ts`, `dcp/{exchange,markup,sources}.ts` | Existing capture/commit pipeline reused; live actor provenance and bounded longer deadline; source checks, history, typing isolation tested. |
| Settings/views | `provider-settings.tsx`, `model-presets.ts`, `view.tsx`, `view.css` | Compact settings in existing independent Desktop/Textual views; no new editor or application owner. |
| Canonical admission | `src/block-tree/dialectic-range-plan.ts` | Existing admitted classification provenance also accepts `ai`; focused existing-source annotation/Undo test. No broader planning/refactoring. |
| Flags / development proxy | `src/configuration.ts`, `vite.config.{ts,js}` | Default-enabled `dialecticProviders`; existing DCP/mock fallbacks preserved. Other proxy routes unchanged. |
| Qualification / contract examples | Provider tests/fixtures, `scripts/check-dialectic-providers-browser.mjs`, Increment 4 plan, DCP schema/examples | Adds ordinary conversation example and reproducible focused evidence. |

## Qualification

**57 focused tests passed** across the relevant runs: 32 Dialectic integration, 13 DCP parser/coordinator, eight provider adapter and four broker tests. Client and server TypeScript checks pass; server build succeeds. Existing accepted Stage 4B suites were not expanded into a whole-repository campaign.

Covered: both wire formats; strict schema compilation; tool-result continuation; plain unannotated replies; provider-independent participant identity; AI provenance on human text; one repair and refusal of further repairs; cancellation; source fencing; token limits; malformed/truncated output; arbitrary-tool rejection; rate-limit/no retry; protected origins/sessions; key removal; round admission; no secret in saved native content; Undo/Redo and zero typing-triggered network work.

Browser evidence: [results](DIALECTIC_STAGE_4C_BROWSER.json), [Desktop screenshot](DIALECTIC_STAGE_4C_DESKTOP.png). Run `node scripts/check-dialectic-providers-browser.mjs`. The script drives the real broker/adapters using deterministic SSE fixtures. Key/model typing, Apply, Ask, Submit & Ask, cancellation, native editing, Undo/Redo and Save use trusted browser input. Native select values are fixture setup because macOS select popups are outside CDP hit-testing; Desktop return uses the existing presentation command. Model defaults and provider-specific switching are checked.

| Fixture | Canonical commit | Ask → observed completed contribution |
|---|---:|---:|
| OpenAI format, source-tool continuation | 18.8 ms | 198.6 ms |
| Anthropic format, source-tool continuation | 14.6 ms | 109.3 ms |
| Submit & Ask; three unrelated Documents / 90 annotated paragraphs | 7.4 ms | 117.4 ms |

These are single browser fixture observations, **not external-provider latency or paint percentiles**. All measured commits had **zero repository snapshots and zero projection rebuilds**. Unrelated records were unchanged; original editor mount/session survived provider and Desktop/Textual switches. Typing during a pending request caused zero additional network calls, snapshots or rebuilds. Save/reload retained six contributions and four provider records, with keys absent and assistant mode reset to mock.

## Remaining boundaries

Live OpenAI/Anthropic account/model verification is pending. No success is claimed for a real external provider yet. The first live trial found the local proxy mismatch described above; that defect is fixed and regression-tested. A subsequent request reached an upstream credential/access rejection. Diagnostics now distinguish HTTP 401/403 and retain only the provider’s machine-readable code/type; a redaction regression confirms that echoed keys are not returned. The fresh request returned **OpenAI HTTP 401, `invalid_api_key`**. The key-entry → session storage → Bearer-header path was reviewed and the browser fixture already asserts exact credential forwarding; the real credential is not inspected or recorded. After credential replacement, the user reached **OpenAI HTTP 400, `invalid_json_schema`**. The provider schema required `LocalEntity.description` but omitted its property definition. Restored the string field from the logical DCP schema; new outbound-schema checks reproduce the defect for both providers before the fix and pass afterward. All 10 provider tests and the server build pass. The corrected server is running; a successful live contribution remains pending. The fixture coverage previously checked streaming but did not catch this schema inconsistency.

Model availability and provider schema constraints can change; unsupported models fail explicitly. Streaming currently shows transient DCP text, not an editable partial composition. Configuration is session-scoped; billing estimates and persistent credentials are not supplied. Custom Anthropic models emitting unsupported thinking/content blocks fail explicitly rather than being flattened.

The accepted Stage 4B semantic clipboard rejection and own-Document linked-definition scaling remain documented future considerations. This stage does not alter them. Multimodal exchange, remote collaboration, interpretation-dispute history and broad UI redesign remain deferred.

Official API references checked: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [function calling](https://developers.openai.com/api/docs/guides/function-calling), [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini); [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [Claude Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview).
