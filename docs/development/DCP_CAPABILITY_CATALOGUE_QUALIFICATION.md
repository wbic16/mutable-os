# DCP capability catalogue — Increment A qualification

9 November 2026. Increment A is implemented and qualified. `dcpCapabilityCatalogue` is enabled by default after qualification; an explicit false override omits both the summary and tool. Increments B and C have not started.

## Delivered

- Each exchange receives a compact summary of capability names, communicative purposes and authoring status. Detailed descriptors distinguish representation, registered rendering, admitted construction, provider support, resources and feature/profile prerequisites. They also describe reading limitations, parameters, child constraints, addressing guidance and representative examples.
- `describe_capabilities({ids:[...]})` accepts 1–4 distinct IDs. Details are capped at 8 KiB, share parameter definitions from the existing DCP schema, and use shared admission-limit constants. Unknown IDs return `unknown`; omitted details are explicit. No new authoring constructors were added.
- Discovery uses the existing provider tool transport, six-call allowance, cumulative retrieval-result budget and deadline. Both OpenAI and Anthropic expose the tool only when negotiated. Source-only repair permissions remain unchanged.
- Native tables, groups, lists, paragraphs, exact-source annotations and enabled semantic operations are distinguished from unavailable grid/card, image, video, YouTube, code, heading and Markdown-fallback authoring. Workspace presentation is explicitly presentation-only and host-controlled. A renderer alone never makes an operation authorable.
- The catalogue is captured once per Ask using a fixed set of registration lookups. It adds no Document enumeration, typing subscription, persistence operation or new identity mechanism. A subsequent exchange reflects changed feature/registration state.

## Qualification

**112 focused tests passed** across the existing Dialectic/DCP and provider/broker suites, including nine new cases. `npm run typecheck` passed for both client and server.

| Check | Evidence |
| --- | --- |
| Native capability discovery | Table, group, exact anchor and Gloss details share resolvable schema definitions and fit together within the detail budget |
| Actual authoring path | Existing synthetic Document/controller fixture queries the catalogue, then commits a native group/table, an exact anchor on earlier text and a separately identified Gloss |
| Availability truth | Profile-off, renderer-missing and Gloss-renderer-missing cases are unavailable; rendered images, video/YouTube, grid and fallback remain unauthorable; workspace presentation is not composition |
| Admission unchanged | Unsupported image, grid and fallback nodes are rejected without canonical changes |
| Flag and provider transport | Flag-off omits summary/tool; both provider wire fixtures accept and continue catalogue results when enabled and reject an unadvertised call |
| Bounds and authority | Argument bounds and 8 KiB results checked; six mixed source/catalogue calls exhaust the original allowance; catalogue is rejected during source-only repair |
| Bounded native work | Discovery leaves source traversal diagnostics, issued handles, source fences and repository revision unchanged; commit uses no repository snapshot/projection rebuild; ordinary typing does not trigger catalogue lookups |
| Existing behavior | Earlier AI-authored quotation discovery/anchoring, continuity, cancellation, stale-source handling and native lifecycle tests remain passing |

Qualification used deterministic provider wire fixtures and the existing native Document fixtures. No live model exchange, application restart or manual media rendering qualification was performed. This verifies catalogue integration and native admission, not a model's future choice to use a capability.

## Review boundary

Increment B remains a separate change: Surface-backed fallback is listed as unavailable and rejected by admission. No fallback conversion, provenance filtering, activity controls, asset acquisition or task-expectation enforcement is included here. Existing source/generated identities and manual Document saving remain unchanged.
