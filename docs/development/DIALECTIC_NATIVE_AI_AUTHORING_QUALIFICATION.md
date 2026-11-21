# Dialectic — Native AI Authoring qualification

7 November 2026. Recommendations 1–4 implemented as one increment under the existing enabled-by-default `dialecticDcp`, `scopedSemantics` and `dialecticProviders` features. Deferred editing/replacement, annotation revision and per-generated-Block addressing remain unimplemented.

## Delivered

- **Structural context:** explicit target/selected context now includes a bounded manifest of native identities, hierarchy, participant identity, chronology/time, revision tokens, annotations and relevant anchor/argument/relationship handles. It follows selected compositions and directly relevant definitions, not the whole conversation. Limits: 64 sources, 12,000 text characters, 64,000 UTF-8 bytes, depth 12 and a bounded pending queue. Omissions are explicit; existing source tools remain available. Initial excerpt capture retains its existing 6,000-character limit.
- **Executable contract:** a designated current participant request is distinguished from contextual/quoted material. Concise instructions and two valid examples explain ordinary multi-contribution addressing, native composition/markup, exact anchors, classifications, semantic identities and relationship direction. Plain social responses remain valid without arguments or annotations.
- **Repair:** existing validation and atomic materialisation are retained. The single repair receives an allowlisted diagnostic code, bounded structural path and host-owned explanation. Provider instructions preserve valid requested structures. Raw parser messages, secrets and arbitrary diagnostic text are not forwarded as repair instructions.
- **Inspection:** contribution-level addresses remain separate from argument relationships. An open “Authored structures” section lists native annotation references and relationships. Annotation inspection resolves the current native property, displays its passage and AI/source/exchange attribution, and uses the existing temporary SVG range-decoration collection. Directed relationship inspection navigates both endpoints. The new `dcp.annotationRefs` metadata is an inspection index of native Block/property IDs, not another annotation store or a per-Block authoring API.

## Changed modules and shared impact

| Area | Files | Impact |
| --- | --- | --- |
| Instructions/repair vocabulary | `dcp/authoring.ts`, `dcp/diagnostics.ts` | Compact request guidance/examples; sanitised repair diagnostics |
| Context/preparation/transport | `dcp/sources.ts`, `dcp/exchange.ts`, `dcp/live.ts` | Selected structural manifest, native reference indexing, scoped validation paths |
| Native controller/presentation | `controller.ts`, `model.ts`, `view.tsx`, `view.css` | Existing canonical commit and inspector extended; scoped Desktop/Textual presentation |
| Provider boundary | `server/dialectic/providers.ts`, `broker.ts` | Instructions and bounded diagnostic forwarded; existing streaming/cancellation/repair limits retained |
| Local credentials (follow-up request) | `package.json`, `provider-settings.tsx` | Node loads Git-ignored `.env.local`; UI distinguishes server credentials from session keys |
| Qualification | Dialectic/provider tests; `scripts/check-dialectic-native-authoring-browser.mjs` | Existing test and Chrome/CDP mechanisms reused |

No shared editor, Block renderer, persistence service, selection machinery or graphical Flint component changed. Annotation geometry uses the existing measured temporary-decoration path. No typing subscription builds manifests, performs retrieval or scans unrelated Documents.

## Focused evidence

- **63 focused tests passed** across the existing Dialectic integration, DCP, provider and broker files. The two new integration cases cover the selected structural manifest, native multi-source authoring/inspection, persistence, Undo and manifest bounds. Provider coverage includes sanitised repair instructions and server-environment credential fallback without returning credentials to the browser. After final refinements, those two integration cases passed again, additionally checking precise anchor diagnostic paths and discovery of already-authored arguments/relationships.
- Client TypeScript and server build passed. `git diff --check` passed.
- **Trusted browser fixture:** typed/submitted three contributions, selected two as context, invoked Ask, inspected annotations and relationship endpoints, used Undo/Redo and Save/reload, and switched Desktop → Textual → Desktop. Native IDs survived reload; the original editor mount/session remained unchanged.
- Fixture returned/validated/materialised **two discursive addresses, one exact source anchor, two annotations, two explicit arguments and one directed `supports` relationship**. Its native SVG range highlight was verified in the source editor. Source annotation attribution remained `actor: ai`, `sourceAuthor: human`.
- With three unrelated Documents containing 90 annotated paragraphs: **zero repository snapshots, zero projection rebuilds**, unrelated records unchanged. Final fixture native commit: **17.9 ms**. Driver-observed completion: **659 ms**, including transport/polling overhead; this is not a paint percentile or a live-model latency. Manifest: six sources, 599 text characters, 5,799 bytes. No retrieval calls were needed for this selected material.
- Save/reload used the real native serializer/admission and application Save action with an isolated in-memory transport, not the user's Cavern.

[Fixture measurements](DIALECTIC_NATIVE_AUTHORING_FIXTURE.json) · [Composition/inspector screenshot](DIALECTIC_NATIVE_AUTHORING_FIXTURE.png) · [Native range inspection](DIALECTIC_NATIVE_AUTHORING_FIXTURE_INSPECTION.png).

## Live OpenAI qualification

**Passed with OpenAI `gpt-5.4-mini-2026-03-17`.** The user supplied the credential through the local environment file; the driver neither inspected nor entered the secret. Only synthetic contributions were sent (“Rain is forecast.” and “We could meet at the library.”), followed by an explicit request to author structures.

| Requested structure | Returned, validated and materialised | Rendered/inspected |
| --- | --- | --- |
| Address both earlier contributions | Two native contribution references, independent of argument identity | Two discursive addresses in the inspector |
| Exactly classify the earlier forecast | One exact source anchor and `dialectic/claim` on the existing TextBlock | Current native passage highlight; AI actor, human source author and exchange provenance |
| Identify the forecast and a new indoor-meeting suggestion as arguments | Two argument definitions; generated `dialectic/suggestion` annotation | Both native annotations listed and inspectable |
| Directed supporting relationship | One `supports` relation, forecast argument → suggestion argument | Both endpoints navigable; direction explicit |

One provider request completed with **zero repairs and zero retrieval calls**. Receipt: 7,247 input tokens, 319 output tokens; monetary cost remains unknown. Provider duration **3.40 s**; driver-observed completion **3.58 s**; native commit **29.2 ms**. There were **zero repository snapshots or projection rebuilds**; source mount/session and unrelated Documents remained unchanged. Trusted browser checks passed for inspection, native SVG highlighting, Undo/Redo, Desktop/Textual/Desktop and native Save/reload through the isolated transport.

[Live measurements and provenance](DIALECTIC_NATIVE_AUTHORING_LIVE.json) · [Live result](DIALECTIC_NATIVE_AUTHORING_LIVE.png) · [Exact source annotation](DIALECTIC_NATIVE_AUTHORING_LIVE_INSPECTION.png).

## Local credential setup

At the user's request, `npm run dev`, `npm start` and `npm run dev:server` load `.env.local` through Node's environment-file support. The already-supported `OPENAI_API_KEY` broker fallback supplies credentials when no session override is entered. The file was already Git-ignored and is restricted to mode `0600`; no secret was read into tool output or written into reports. This is local plaintext configuration, not encrypted credential storage. Server restart is required after changing the file. Forget keys removes session overrides, not the server environment credential. The normal server was restarted with the saved environment and the imported Cavern successfully reopened. A user-facing encrypted credential facility remains deferred.

## Remaining boundaries

The manifest is deliberately selected and bounded, with detailed retrieval on demand. Structural correctness is validated; arbitrary natural-language task fulfilment is not a deterministic guarantee. Generic contribution edits, annotation replacement/revision, per-generated-Block targets, cross-Document authoring and multimodal content remain deferred. Earlier responses without the new inspection index retain their native content and exchange records; the UI does not falsely report their annotations as absent. Existing accepted linked-definition copying/scaling limits are unchanged. Semantic annotations remain selective and do not turn ordinary conversations into argument graphs.
