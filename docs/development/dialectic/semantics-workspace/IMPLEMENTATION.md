# Dialectic Semantics Workspace

Implemented 16 November 2026 against `d40d06e` (Scry navigation and Flint slash commands). The supplied feature brief is preserved in [FEATURE_BRIEF.md](FEATURE_BRIEF.md).

## Qualification and architecture

| Existing facility | Decision |
| --- | --- |
| Context & AI inspector | Move semantic collections into Semantics; retain provider/context controls, reply to Argument/Block/selection, source inspection, reattachment, and Gloss creation. Contribution activity and Contents links route to the workspace. |
| Retained conversation runtimes and native preferences | Store sub-tab configuration in versioned conversation preferences; retain per-Document selection/search and scroll state. Keep the native editor mounted. No duplicate Document or parallel editor. |
| Document Entities and Relationships | Use existing scoped `linkedAnnotations` identities, directed endpoints and provenance. Native transactions retain Undo/Redo and dirty tracking. |
| Arguments and Claims | Arguments retain range anchors and recorded argument relationships. Claims are `dialectic/claim` passage classifications, not standalone canonical facts. Diagrams include isolated objects and explicit argument replies; co-occurrence does not create an edge. |
| Shared authority/identity services | Extend existing Wikidata/GND lookup and reuse the identity review workstation and Cardex opening commands. Canonical identity acceptance retains existing review controls. |
| SQLite `ExternalIdentity` | Keep canonical mappings here, with its indexed identity and Entity foreign key. Read the current Entity on reuse; reject deleted targets. Do not store canonical Entities in the disposable Cache. |
| Existing caches | The browser authority cache was transient and small. Add shared, versioned SQLite Cache storage through the existing worker/client/host service. Cache-only access does not schedule vault discovery or indexing. |
| Existing Mermaid sandbox | Reuse its bounded, validated node navigation and SVG rendering. Selectable relationship labels identify stored relationship records. No new diagram runtime or text-highlight renderer. |

The implementation follows stages A–D. The visual reference refines Stage A into simultaneous list/detail/graph panels. The graph uses the existing directed diagram renderer, rather than the reference's circular portrait layout. Real thumbnails display when supplied locally or returned by an authority; missing images use initials.

## User behaviour

- Default sub-tabs are Conversation, Media, Attachments and Semantics. The `+` control creates named Media/Attachments/Semantics views and supports rename, reorder and removal. Exactly one Conversation view is required; up to 24 tabs are supported. These are views of the same Document, not arbitrary plugin tabs.
- Media presents native fetched/managed images and image attachments in a responsive tile gallery. Clicking an image opens a larger preview; Escape closes it, and source links return to the native contribution. Previews load near the viewport while the tab is active, retain large-image consent and saved replacements, and never initiate AI repair merely by opening the gallery. Attachment reads share the existing preview queue and release URLs on unmount. `scripts/check-dialectic-gallery-browser.mjs` checks real Chrome layout, preview, source navigation and unchanged Document state.
- Semantics counts come from native records. Entities support search and sorting by name, type or mentions. Details include available metadata, significant dates, named directed relationships, mentions, provenance, conflicting assertions and authority status.
- Arguments show source excerpts, source contribution/author, explicit relationship types and reply counts. Source controls return to Conversation using existing native navigation and temporary annotation decorations. Returning to Semantics retains the selected object.
- Context & AI remains available. The semantic collection dumps are removed when the new workspace is enabled.
- Tab configuration and verified local identity associations use native Undo and dirty tracking. **Saving remains manual**, using the existing Document save operation. No Markdown sidecars or background Document saves were added.

## Enrichment and authority identity

`dcpEntityEnrichment` extends compact XML and structured-provider schema authoring with optional subtypes, thumbnail, typed dates and external identifier candidates. `ref` reuses a current owned Document Entity handle. Enrichment retains its UUID, original provenance and existing assertions. Conflicting descriptions, dates, identifiers and images are retained for review rather than replacing existing values.

Dates reuse native `TimeInput` fields, preserving precision, uncertainty and ranges. External Wikidata times retain the original calendar/time payload. These remain attributed local or external metadata; this feature does not manufacture canonical Claim/Time records or promote Agent assertions into canonical facts.

Resolution runs asynchronously after semantic membership or definition changes and pauses during DCP admission. A candidate needs matching names/aliases, corroborating type, and meaningful description overlap or matching significant dates. Contradictory significant dates prevent automatic acceptance. QID syntax alone proves nothing. Multiple unresolved candidates remain ambiguous and can be reviewed through the existing identity workstation.

A verified association records the authority identity, Vault identity and verification signature alongside the local Entity. On reuse, the resolver checks the current Vault and live ExternalIdentity target, so canonical renames are reflected and deleted/retargeted mappings are not blindly reused. Cached external display metadata is optional; unavailable metadata does not prevent reuse of a still-valid canonical association. A changed local identity is reverified. Late asynchronous results are rejected after local edits, session changes, cancellation or admission suspension.

Existing explicit authority import/link controls create canonical identities. Background resolution never creates a canonical Entity, Claim or Relationship. The repository has no canonical Entity merge operation to extend; any future merge must retarget ExternalIdentity transactionally. Current reads already revalidate the live target rather than trusting a cached canonical snapshot.

## Cache policies

Migration `0011-shared-cache.sql` adds versioned JSON Cache rows with created/updated/expiry timestamps. Cache APIs expose get/set/invalidate through the existing service boundary. Defaults:

| Policy | Value |
| --- | --- |
| Authority metadata TTL | 7 days |
| Search TTL | 1 hour |
| Empty-result TTL | 5 minutes |
| Failed-request TTL / stale retry backoff | 1 minute |
| HTTP timeout / response budget | 12 seconds / 1.5 MB |
| Generic cache capacity | 4,096 rows; 2 MB per value at worker boundary |
| Simultaneous authority requests | 32 per service; identical requests deduplicated |
| Stale data | Returned immediately; refreshed in background; retained on failure |

The existing host HTTP body limit also applies to direct generic-cache requests. Authority HTTP requests accept only fixed Wikidata, Commons and GND API hosts/actions/parameters and reject redirects. Generic clients cannot write reserved authority-cache keys. Images retain source/attribution/license metadata where provided. Network errors do not block contribution admission or rendering.

## Feature flags

All three new flags default to enabled:

- `dialecticSemanticsWorkspace`: workspace UI and derived semantic membership.
- `dcpEntityEnrichment`: admission of the optional enrichment vocabulary.
- `authorityCache`: shared authority caching and asynchronous resolution.

No existing feature defaults were changed. With the workspace flag disabled, the old inspector presentation remains available.

## Validation and evidence

- TypeScript checks pass for the reactive client and server.
- SQLite suite: 133 tests passed, including additive migration, cache expiry/invalidation, absence of canonical/audit mutations, cache-only host isolation and canonical rename/delete/restore lifecycle.
- Final focused verification: 64 tests passed across eight suites, plus two updated Desktop/Textual activity-routing tests.
- New regression coverage includes XML enrichment of an existing local identity, conflicts, native save/reload and Undo/Redo; tab persistence and per-Document state; isolated graph nodes and explicit directed edges; live definition refresh after combined Document edits; conservative authority verification, deleted identities, offline reuse and stale asynchronous results.
- Real Chrome qualification checks graph node and relationship clicks, source navigation, selection retention, unchanged native revision during navigation, and retained editor mounts. [Desktop](evidence/workspace-desktop.png) and [narrow layout](evidence/workspace-narrow.png) screenshots use an in-memory fixture with no file writes or authority requests.
- Authority APIs are covered with deterministic fixtures, not a live-service availability claim.

Seven older failures were reproduced on an isolated clean checkout of `d40d06e`: five in `dialectic.test.tsx` (submitted-text protection, changed-source fencing in Stage 3A/3C, and Stage 3B/3C resource call counts), plus two editorial provider prompt-order assertions. They are not introduced by this change. Existing activity tests were updated to assert the new semantic destination, including Textual hosting.

### Reproduce

```sh
npm run typecheck
npm run test:sqlite
npx vitest run src/features/dialectic/semantics-workspace.test.tsx src/features/dialectic/conversation-sessions.test.tsx src/application/entity-authority-resolution.test.ts src/application/entity-authority-resolution.integration.test.ts server/authority-cache.test.ts
# With the Vite client running:
node scripts/qualify-semantics-browser.mjs
BENCHMARK_PRESENTATION=flint BENCHMARK_DIALECTIC=1 BENCHMARK_SEMANTICS=off node scripts/benchmark-typing-browser.mjs
BENCHMARK_PRESENTATION=flint BENCHMARK_DIALECTIC=1 node scripts/benchmark-typing-browser.mjs
```

The browser benchmark now binds DialecticReferences to the real Document owner within Flint, rather than the workspace root. Its before/after comparison is the same code with the new workspace flag off/on. Bounded-work regression tests explicitly require no semantic inventory rebuild, full-tree visit, snapshot or network request during ordinary typing and annotation offset rebasing. UI tab switches are presentation-only; explicit tab configuration and enrichment retain native validation, Undo and dirty tracking.

### Flint typing measurements

Sequential real-Chrome runs used 250 paragraphs / 25,000 characters and 40 edits. Values are individual-run observations, not a guaranteed latency improvement.

| Measurement | Workspace off | Workspace on |
| --- | ---: | ---: |
| Mean edit time | 4.03 ms | 2.48 ms |
| Median edit time | 3.20 ms | 1.90 ms |
| p95 edit time | 12.90 ms | 6.30 ms |
| Affected-record property reads | 40 | 40 |
| Full-tree visits / semantic inventory rebuilds / snapshots | 0 / 0 / 0 | 0 / 0 / 0 |

Both runs passed real insertText, Backspace, Undo/Redo, Enter/split Undo and boundary insertion checks, preserving unrelated cells. Headless animation-frame times are not treated as user-visible latency. Raw structured measurements: [off](evidence/typing-before.json), [on](evidence/typing-after.json).
