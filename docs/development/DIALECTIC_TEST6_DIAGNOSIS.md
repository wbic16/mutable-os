# Dialectic Test #6 — contribution #7

2026-11-08. Inspected the saved native file, local continuity journal, and existing OpenAI response/tool records through read-only API requests. No new model generation was requested.

## Finding

**The model used a newly discovered TextBlock handle without reading it, supplied an unissued revision, and could not recover because the running backend predated the approved repair fix.** The error does not establish that the native text changed.

Document: `6e507238-3af4-4683-90f8-f723276caa31`; failed exchange: `597bcf6d-730d-4813-afb6-cda271c07c76`.

Contribution #7 requested a substantive objection and a native discursive reference to the opening contribution. The model additionally attempted a `dialectic/objection` annotation on its opening sentence. That invalid extra annotation caused the entire response to be rejected atomically; no AI contribution #8 or annotation was committed.

## Actual exchange

1. The first provider response called `read_source` with historical handle `source-e2583f96-97d1-4837-9b1d-c2eec3679c3a`, previously issued in #6. The tool rejected it and supplied the existing bounded recovery inventory.
2. The inventory issued fresh Block handle `source-c649db6f-30ef-4031-aadc-b7ba4988d490` for TextBlock `bd3ee85e-cffb-4d43-b538-b404d1d7fcdf`. Its owning contribution is `476fbe5d-4c89-4267-8e81-6564812cbf20`, with fresh contribution handle `source-405e3860-68d0-4f1a-890d-23ed29179a1a`.
3. The model never read that fresh Block handle. It nevertheless returned an anchor with revision `a6f0cf3c-6c8e-4d5a-a3ef-3d6c6f0f3b7e`, which the inventory had not issued. The fresh Block was absent from the initial selected manifest, so no current revision was available there either.
4. The exact selector was the first TextBlock's complete sentence: “I'd like to begin a discussion about the relationship between maps and the territories they represent.” It exists contiguously in the saved native Block. `DcpSources.exact()` rejected the revision before selector matching, with `Exact anchor source unavailable or stale`.
5. The single repair received diagnostic `source` at `$.anchors[0]`, followed by the old server instruction **“Do not request more tools.”** It retained the same handle/revision and only changed the selector suffix from empty to a newline. The revision remained invalid; the saved Block also has no trailing newline.
6. The response used the Block handle in `replyTargets`, rather than the available owning-contribution handle requested by the user. This was a targeting discrepancy, not the validation failure.

Provider response IDs, in order: `resp_00577e64e8857e36006af006aafc788190a465b8906d7963df`, `resp_00577e64e8857e36006af006ad415c8190b010bf702e4f2c7e`, `resp_00577e64e8857e36006af006b0f4bc81909fd37efce46e8d5a`. Journal sequences 25–26 confirm one repair followed by abandonment without native commit.

## Deployment correction

Backend PID 90812 started at **09:00:52** and was running `dist/server/index.js`. Before rebuilding, compiled `providers.js` still prohibited tools during repair and compiled `broker.js` rejected every repair tool call. The saved request contained the new frontend instructions, confirming mixed frontend/backend versions. `npm run dev` compiles the backend once at startup; it does not watch server source changes.

Rebuilt successfully with `npx tsc --project tsconfig.server.json`. An isolated smoke check against the **compiled backend** confirmed that a `source` validation repair admits `read_source`. No further source-code change or validation relaxation was necessary for recovery admission. The existing running backend was left untouched to protect the user's session; **restart `npm run dev` to activate the correction**.

Save open Documents, stop the existing dev command with Ctrl-C, then run `npm run dev` again. The pending failed exchange cannot be resumed; issue a fresh Ask after restart. Recovery gives the model the means to correct its source capability, not a guarantee of perfect task compliance.

`test6.ink` remains unchanged: SHA-256 `6bcc5f51ae87009d36c31a9934465368bd1b31a2a055f1b1096d1b5eeb421b81`.
