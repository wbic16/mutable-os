# Dialectic Stage 4A — qualification

**7 November 2026 · Increment 4 Revision 2 · Stage 4A complete. Stage 4B has not begun.**

## Delivered

`dialecticDcp` is enabled by default. Ask mock now exercises the `dcp/1.0` protocol with the bounded `4a-1` capability profile; disabling the flag retains the accepted legacy mock flow.

- A versioned Protocol Key, registry-derived annotation legend, explicit primary reply and selected context accompany each request. Supported output is native paragraphs, groups, lists and tables, with bold/italics/underline and the six `dialectic/*` discursive classifications. Bounded unknown semantic types are stored inertly; reserved or non-authorable registered types are rejected.
- Restricted XML annotations support nested and crossing ranges. Decoded text, whitespace, CR/LF and Unicode survive materialisation. Invalid markup, selectors splitting Cells, ambiguous matches, unsupported capabilities and duplicate identifiers fail before authoring.
- `read_source` and `search_symposium` operate on issued handles to committed, owned Symposium content. They reuse canonical search text/boundaries and the existing resolver. Results expose native hierarchy, supported annotations, revisions and explicit omissions. Drafts, arbitrary Vault content and other Documents are excluded.
- Streaming is escaped, transient, coalesced and cancellable. Timeout, cancellation, session changes, stale dependencies and even edit→Undo changes invalidate the attempt. No partial contribution or provisional anchor is authored.
- Valid output, generated/source anchors, source interpretations and exchange provenance commit in one canonical Undo operation. The Document becomes dirty and persists through normal manual Save. The retained source editor remains editable.

The host-selected structural target remains in contribution `replies`. Additional DCP references are stored separately in `discursiveReferences`. Selected context, actual initial material and subsequent tool results remain distinguishable; the exchange record describes supplied material, not model attention. Context choices are captured at request start.

An interpretation of a human passage carries host-controlled `metadata.dcp` provenance: actor, exchange ID, protocol, source Document, `appliedTo: "existing-source"` and `sourceAuthor: "human"`. Source export retains this attribution and the inspector exposes the exchange record. Passage anchors, classifications, future Symposium arguments and independent Glosses remain separate. **No argument, argument-relation, Entity or Gloss authoring infrastructure was introduced.** The approved direction vocabulary and initial one-anchor-per-argument boundary remain Stage 4B design decisions.

## Changed modules and shared impact

| Area | Change and boundary |
|---|---|
| `features/dialectic/dcp/{markup,sources,exchange}.ts` | Protocol validation, restricted markup, authorised retrieval, deterministic mock and native materialisation. |
| Dialectic controller/model/views | Exchange lifecycle, separate references/provenance, preview and inspector; existing independent Desktop/Textual presentations retained. |
| Configuration / feature registration | Default-enabled DCP flag and feature-scoped semantic registrations. |
| Visual-effect registry / standoff styles | Optional semantic descriptors supply the actual authoring legend. Existing static style rendering is retained. |
| Block commands / commit capture / repository | Opt-in `boundedStructuralTransaction` rejects unsafe broad fallback before mutation. Ordinary commands retain their existing fallback behaviour. |
| Dialectic range admission | Narrow proof for generated anchors and classified existing-source payloads; incremental projection maintenance. No general transaction/projection redesign. |
| Tests, browser script and design documents | Focused qualification, reproducible fixture, and clarified primary versus discursive references. |

## Qualification

**48 distinct focused tests passed:** 13 protocol/markup tests, 23 Dialectic integration tests, 4 registry tests and 8 standoff-style tests. The final integration run exposed a test fixture passing a Solid proxy into the native clone boundary; after correcting the fixture, its test and the extended native composition test both passed. Unaffected cases were not rerun. TypeScript (`tsconfig.reactive.json`) and `git diff --check` passed.

Coverage includes nested/crossing markup, Unicode and line endings, inert unknown semantics, malformed/deferred capabilities, exact/ambiguous/stale selectors, cancellation and deadline with a non-settling transport, source provenance, atomic Undo/Redo, native nested group/list output, context capture, draft rejection, flag fallback and refusal of unproven bounded transactions. Bounded-work checks cover retrieval, typing and unrelated Documents.

The isolated Chrome fixture used trusted input for typing, Submit, Ask, Cancel, Undo/Redo, native response interaction, source editing and presentation switching. Manual Save followed by actual reload preserved two DCP exchanges and their anchors/tool records. Desktop→Textual→Desktop retained editor identity. No live provider or production document was used.

| Browser observation | Initial exchange | With 3 unrelated Documents / 300 annotated paragraphs |
|---|---:|---:|
| Ask to automation-observed completed contribution | 210.4 ms | 192.0 ms |
| Synchronous bounded canonical transaction | 31.7 ms | 22.8 ms |
| Repository snapshots / projection rebuilds | 0 / 0 | 0 / 0 |
| Source mount / session retained | Yes / yes | Unrelated records unchanged |

The first trusted native interaction with the initial response succeeded at **224.9 ms** after Ask. These are individual observations, not paint timestamps or percentile benchmarks. End-to-end values include deliberate mock delays (80 ms plus streamed chunk intervals), rendering and automation scheduling. Source typing also recorded zero snapshots and projection rebuilds. Cancellation created no contribution or anchors.

Evidence: [browser measurements](DIALECTIC_STAGE_4A_BROWSER.json), [Desktop screenshot](DIALECTIC_STAGE_4A_DESKTOP.png), and `scripts/check-dialectic-dcp-browser.mjs`.

## Limits and next step

- This profile admits a bounded subset of native construction. Unsupported output is explicit; existing contributions can still contain arbitrary native Blocks. Existing-source interpretations are classifications or inert semantics, not styling commands.
- Exact source selectors cover one owned standoff Block without inline objects. Ambiguous, missing or stale references require a fresh request. Some same-Document metadata changes conservatively invalidate captured range/Gloss context.
- Exchange budgets include six tool calls, 512 searched Blocks / 100,000 search characters, 12,000 Cells per source, bounded result sizes, 256 constructed Blocks, depth 12 and a 30-second deadline. Source annotation values/attributes outside this profile have explicit export omissions.
- Updating anchors can copy/diff the affected Document's linked-definition map. This is not constant-time in that map's size; the unrelated-Document measurements do not establish large-registry scaling. Ordinary typing does not run DCP retrieval or capture repository snapshots.
- Argument/relationship and shared Entity infrastructure, promotion workflows, continuation suggestions, assets, live provider adapters and provider credential handling remain deferred. No Stage 4B or 4C implementation is included.

Next: review Stage 4A, then proceed to the approved Stage 4B semantic work when instructed.
