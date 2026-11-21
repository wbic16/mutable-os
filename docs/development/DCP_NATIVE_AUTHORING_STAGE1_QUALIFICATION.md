# Native-backed DCP authoring — Stage 1 qualification

9 November 2026. Stage 1 implemented and qualified; `dcpNativeAuthoringStage1` is enabled by default. No later stage is started. The [architecture amendment](DCP_NATIVE_AUTHORING_PARITY_INVESTIGATION.md#stage-1-architecture-amendment--9-november-2026) replaces the earlier generic native-operation wire proposal with concise projections onto shared native operations. The [canonical inventory](DCP_CANONICAL_VOCABULARY.md) and its JSON are retained as the accepted pre-Stage-1 baseline.

## Implemented contracts

The `dcp/1.0` contribution envelope, typed aliases, current-source handles/revisions, provider continuity and existing paragraph/group/list/table representations remain. Requests negotiate the additive extension with `nativeAuthoring: 1`. The broker supplies the corresponding strict provider schema; disabling the feature retains the baseline schema, legend and admission restrictions. Anthropic's schema is expanded to the same existing depth limit, including the new compound Grid and leaf Heading/YouTube forms.

| Human/native operation | DCP projection | Native effect / qualification |
| --- | --- | --- |
| Style-bar heading property | `{id:"new:b1",kind:"heading",level:2,markup:"Evidence",ranges:[]}` | Shared `headingProperty` / `prepareHeading`; TextBlock with `block/font/size: h2`; levels 1–6; no raw Block-property input |
| Add Grid / convert-to-grid builder | `{id:"new:b1",kind:"grid",rows:[[[{id:"new:b2",kind:"paragraph",markup:"Evidence",ranges:[]}]]]}` | Shared `prepareGrid`; native rows and cells, ordered owned children and host identities; rectangular, nonempty DCP cells. Existing native conversion can prepare an initially empty cell before moving content into it |
| Add YouTube URL or ID | `{id:"new:b1",kind:"youtube",url:"Zsqep7_9_mw"}` | Shared `prepareYouTube` and extracted existing `youtubeId` validator; `youtube-video-block` with `metadata.url`; external reference, no acquisition or generation |
| Human colour range application | `<annotation type="text/colour" value="#336699">Evidence</annotation>` | The native style descriptor's parameter schema/preparation is reused by `RangeAnnotations` and DCP |
| Explicit generated range | `ranges:[{id:"new:s1",type:"text/colour",from:"new:pos1",to:"new:pos2",ref:null,attributes:[{name:"value",value:"#336699"}]}]` | XML boundaries delimit a nonempty range; identical native preparation to inline colour, including attribute validation |
| Additional annotation of an immutable passage | Existing exact `anchors` plus `interpretations` targeting the new anchor alias | Adds admitted formatting or semantic properties using the same preparation; current revision, owner and provenance checks; no underlying text or structural edits, annotation replacement or general mutation channel |
| Inspect a compound native source | Existing `read_source {handle}` | Adds a related inspection tree; native identities, issued handles/revisions, selected Block properties/configuration, standoff values, child and owned-relation structure, and safe resource descriptions |

The shared preparations live in [native-authoring.ts](../../src/block-tree/native-authoring.ts). The colour descriptor lives beside its native style in [standoff-styles.ts](../../src/rendering/standoff-styles.ts). DCP's schema/catalogue are transport descriptions of these operations; there is no new registry. Known decorative/unfinished effects do not become authorable merely because they render. Both range and inline declarations consult the same admission path. Existing semantic Entity/Gloss/Argument routes keep their independent native identities.

## Catalogue, inspection and limits

The retained catalogue describes the heading, grid and YouTube routes, their native mappings and examples. `formatting.colour` exposes the actual native parameter descriptor; `inspection.native` is readable without being an authoring operation. Detailed and compact states distinguish authorable, authorable with prerequisites, readable, disabled and unsupported routes. A YouTube reference is `authorable-with-prerequisites` / `input-required`; missing media acquisition is not its blocker.

Inspection is explicit read work, not an initial full-document export or typing subscription. It is bounded to 24 expanded nodes, depth 4, 32 properties per category, 12 owned relations per node and 16,000 bytes. Individual strings are limited to 1,024 characters, with that policy and omissions declared. Existing direct `read_source.text` remains the authority for exact quotations. Omitted branches retain handles where space permits; otherwise the ordinary child handles support another read. The original six-call and 48,000-character aggregate retrieval budgets remain, so a rich inspection can consume available retrieval capacity sooner.

Grid/table structure and tab orientation/panel labels are preserved together. An unfamiliar native kind retains its native identity, children and explicit unsupported-detail notices. Internal metadata, renderer state and trusted captures are not exported. Inspection is explicitly `lossless:false`: it is not accepted as clone or authoring input. Reading a property does not grant permission to author it. Native copy/reference/transform operations remain deferred rather than asking a model to reconstruct rich originals and claim equivalence.

## Qualification evidence

Focused command:

```sh
npx vitest run src/features/dialectic/dialectic.test.tsx src/features/dialectic/dcp/capabilities.test.ts server/dialectic/providers.test.ts src/runtime/range-annotations.test.ts scripts/audit-dcp-vocabulary.test.ts
npm run typecheck
```

**91 tests passed; both reactive and server TypeScript checks passed.** Coverage includes:

- Shared human-menu/DCP grid structure and media configuration; heading property mapping; colour range preparation and inline/range equivalence.
- Canonical ownership/admission, protected original text and native source identities; source annotation provenance; foreign handles and stale revision rejection.
- Invalid heading levels, ragged grids, unsafe colour/URL values, duplicate attributes, wrong typed aliases and non-curated effects rejected without changes.
- Injected insertion failure after prepared source/definition writes rolls back the whole transaction; no partial annotations or definitions remain.
- Undo/Redo and native capture/encode/decode round-trip; dirty tracking remains manual-save based.
- Compound grid/heading/colour and tab inspection, unfamiliar-child preservation, metadata exclusion, bounded traversal/output and unchanged tool budget.
- Generated grid descendants counted against the existing native Block budget; ordinary typing triggers no additional retrieval/network calls, full snapshots or projection rebuilds.
- Existing DCP behavior and source-discovery tests, old wire contract with Stage 1 disabled, and negotiated OpenAI/Anthropic schemas with resolvable references and bounded recursion.

The broader style-bar suite reported **28 passed, 2 failed**. Both failures are `collects only Control-held gestures, excludes early release, and keeps static highlights` (compact true/false): the selector counts four decorated elements rather than two. Both were independently reproduced in a detached, unchanged `HEAD` worktree at `3464d02`; the temporary worktree was removed. They are pre-existing, not Stage 1 regressions, and were not changed here. The style-bar heading/colour tests passed.

Qualification uses deterministic host/provider fixtures, not live-model behavior or a browser playback test. No large model benchmark or user-visible typing-latency claim is made. Media rendering/network availability remains subject to the native external player's behavior. Existing source-text protection is unchanged; only permitted annotation writes are added.

## Operation coverage and remaining sequence

The canonical audit continues to account for every native type/property; operation parity is not inferred from type counts. Structural grid rows/cells are covered by the shared grid builder, not independent DCP constructors. Stage 1 covers the named entry points above; it does not claim all configuration/mutation routes for those native types.

| Remaining native operation family | State / reason |
| --- | --- |
| Existing paragraphs, groups, lists, tables and semantic identities | Existing DCP projections retained; complete native configuration and other human entry points remain Stage 2 work |
| Other heading-producing import/Markdown/Document-format paths; alignment/indent/size; list/task state; grid resizing/merging | Stage 2: share contextual preparation and faithful configuration projections; not arbitrary property JSON |
| Code/source, tabs/pages, Surface/Side, margins and widgets | Stage 2: family builders and destination/interaction constraints; no new wire nodes advertised yet |
| Other core formatting and curated semantic/presentation properties | Stage 2: explicit native descriptors and suitability policy. Experimental/decorative/compatibility effects remain inspection-only until qualified or explicitly excluded |
| Existing managed resources, retained captures, import/acquisition and native clone operations | Stage 3: authoritative resource/clone binding, preservation and lifecycle qualification. Existing YouTube external-reference route does not imply these are available |
| Document roots, application/workspace hosts and context-dependent operations | Stage 4: explicit host authority and lifecycle; no new cross-Document/workspace authority |
| Markdown fallback, notices/activity, task-expectation enforcement, generation and retroactive editing | Deferred by the brief; not implemented or advertised as authorable |

The four-stage sequence is retained. Stage 2 requires its own reviewable increment; this report does not advance it automatically.
