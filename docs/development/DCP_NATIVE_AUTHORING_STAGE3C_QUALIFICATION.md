# DCP native authoring — Stage 3C qualification

9 November 2026. Stage 3B is accepted. **Stage 3C.1, retained PDF binding, is implemented and qualified.** The remaining retained families have been investigated below and require separate reviewable subincrements; this report does not claim that all of Stage 3C is complete. Stage 3D has not begun.

## Qualified vocabulary and native path

The only new DCP construct is:

```text
retained-pdf {id,kind:'retained-pdf',source,revision}
```

`source` and `revision` must come from reading an issued, current, committed native PDF Block in the same Document. The feature `dcpNativeAuthoringStage3RetainedPdf` depends on Stage 1, `crossResourceLoaders` and the native PDF renderer. It is enabled after qualification. Packaged/archive occurrences are explicitly unsupported by this active-Vault binding route; they retain their existing native local viewer.

The host resolves the actual source payload and calls the shared native `verifyRetainedPdf` operation. Its scoped `pdf.verify` service resolves the canonical snapshot, verifies the snapshot/ExternalIdentity/Entity/resource relationship, verifies the original through the existing managed store (Cavern, MIME, size and integrity), and rechecks the capture after asynchronous original access. Only the canonical capture and byte count return to the browser. No acquisition, original download to the browser, capture publication or new retained original occurs during binding. Opening the native viewer later explicitly reads the retained bytes as before.

The original snapshot, identity, resource, Entity, managed original and provenance remain unchanged. `pdfBlock` supplies fresh occurrence/property identities and the existing Entity-reference property. `resourceSurface` supplies the same front/back structure, information reference, source notes and initial empty reverse text as native import when reversible Blocks are enabled. Source annotations and user-authored reverse content are **not copied**. The DCP composition may place the result inside its existing native layouts and compound structures.

Host-private fragment assembly now admits the resource factory's owned descendants alongside existing prepared leaves. It rejects reference/definition dependencies and still enters the existing canonical `insertFragment` transaction; it is not a native-copy or generic-fragment wire capability. Native ownership, source fencing, atomic source annotations plus composition, Undo/Redo and manual persistence remain intact. Removing/undoing an occurrence does not delete its retained original.

Limits: **4 PDF occurrences per contribution; 50 MiB per original**. Duplicate use of the same verified capture within one preparation shares verification. Native resource-Surface descendants and generated text Cells count toward the existing **256 composition Block / 24,000 Cell** budgets (plus the existing contribution wrapper). Retrieval calls, schema depth, response size and capability discovery budgets are unchanged.

## Reading, authority and viewer controls

`media.retained-pdf` distinguishes intrinsic authorability from prerequisites. Bounded inspection exposes PDF type, label, page count, current source handle/revision, unverified availability and required active-session verification. It does not export trusted capture, snapshot, Entity/resource, Cavern or asset identifiers. Inspection is not reconstruction input and does not claim PDF text extraction or perception.

OpenAI and Anthropic schema modes negotiate this route independently of earlier media features. Ordinary external images, videos, websites and PDF/IIIF hyperlinks remain source-free Stage 3B operations. Disabled and prior schema modes remain supported. Each capability descriptor fits the existing 8,192-byte discovery limit.

The shared native PDF viewer retains open/close, paging, zoom, scrolling, selection and annotation display. Protected occurrences disable annotation add/delete and text extraction, with handler checks as well as disabled controls; pending extraction rechecks protection before insertion. The shared relationship inspector also blocks authored relationship-review writes from protected content. Draft PDF annotations remain editable. No DCP-specific viewer or operational state store was introduced.

Preparation checks source revision/ownership and active Cavern/session before and after I/O and immediately before atomic admission. Missing, corrupt, foreign, malformed, mismatched and expired authority fails without admitting a contribution. Verification is a bounded point-in-time check, not a distributed lock against later external deletion; a subsequent viewer read can still report a missing original.

## Qualification

Focused deterministic qualification covers:

- Native factory equivalence, resource identities/properties, generated Surface information relationships and nested mixed PDF/external composition.
- Real SQLite capture relationships and managed originals: missing/corrupt originals, identity mismatches, cancellation and a canonical snapshot changing during verification; no acquisition/publication calls and no original bytes in the verification response.
- Forged, foreign, stale and expired source authority; wire-level capture injection; foreign/malformed/archive occurrences; session changes during response parsing and immediately before commit.
- Binding and generated-descendant/Cell bounds, atomic insertion failure with source-annotation rollback, Undo/Redo and native serialization/admission round-trips.
- Protected viewer controls, draft annotation compatibility, late read cancellation, disposal and local page/zoom state; provider schema negotiation and bounded discovery.
- Prior Stage 1–3B deterministic compatibility. No live-model benchmark or user-Document edits were performed.

Ordinary typing performs no added DCP reads, resource requests, repository snapshots or projection rebuilds. Explicit binding admission likewise avoids snapshots/rebuilds. Native resource information now resolves its resource directly through its Surface when available, avoiding the previous repository enumeration at mount; a regression counts repository-content enumeration and requires zero on this path. The standalone information fallback remains unchanged. No typing subscriptions, geometry work, indexing, automatic saving or background resource maintenance were added.

**214 deterministic tests passed across 10 suites.** The final renderer-prerequisite refinement also passed its seven focused DCP/catalogue checks. Reactive and server TypeScript checks passed; `git diff --check` passed.

```sh
npx vitest run src/block-tree/prepared-leaves.test.ts src/runtime/retained-pdf.test.ts src/rendering/pdf-block-view.test.tsx src/rendering/reversible-surface.test.tsx src/features/dialectic/dialectic.test.tsx src/features/dialectic/dcp/dcp.test.ts src/features/dialectic/dcp/capabilities.test.ts server/dialectic/providers.test.ts scripts/audit-dcp-vocabulary.test.ts server/application-services/pdf.test.ts
npm run typecheck
```

## Other retained families: investigated, not advertised

These are native authoring prerequisites, not exclusions from the target architecture. Reuse each family's factory and verifier; do not accept model-supplied capture objects or introduce a universal capture registry.

| Reviewable subincrement | Existing native route | Exact remaining verification / interaction work |
| --- | --- | --- |
| **3C.2 — IIIF manifest and image** | `IIIFService.read` / `iiif.read` resolves the canonical capture, verifies the retained JSON original and normalizes it; `iiifBlock` materialises the resource. | Add a read-only binding wrapper with canonical identity/parent relationship and post-I/O session checks. Distinguish original manifest/image JSON from associated canvas information and retained tiles. Online `iiif.open` may acquire and publish missing canvas information; `iiif.retain` publishes tiles. Qualify offline viewing independently and guard annotation/retention/online acquisition paths for submitted occurrences. Reusing a retained manifest must not imply every image tile is retained. |
| **3C.3 — Captured articles and web resources** | Encyclopedia `wiki-snapshot` plus private `projection`/`result` already verifies all original response assets and reconstructs a bounded native projection. `webBlock` uses a different WebCapture/WebOriginal envelope retained through `WebService` jobs. | Extract a nonmutating encyclopedia capture read/verify endpoint with snapshot/resource proof. Web resources lack canonical snapshot lookup: verify the host receipt and original envelope without invoking import/resume or trusting the occurrence's projection. Some cards retain only a URL/failure envelope; report that accurately. Assess article conversion, enrichment/review and embed activation separately. |
| **3C.4 — Citation and academic resources** | Scholarly citation service has canonical DOI lookup/commit and retained metadata; deterministic academic service verifies a completed job's original and secondary assets and has separate review operations. `citationBlock` / `academicBlock` are existing factories. | Resolve the **pinned** citation snapshot, not merely the latest DOI lookup, and verify its resource/original relationships. Extract a nonmutating completed academic capture read with all original/discovery/secondary dependencies. Local-file academic captures need an authority route where no server job receipt exists. Protect review, annotation, conversion/extraction and configuration writes; keep local viewing. |
| **3C.5 — Structured resources with originals** | Native structured payload validation, original retention/import and existing read-only structured viewer. Presentation switches, wrapping and expansion are already local signals. | Verify any managed original against the stored text/presentation and its native provenance/ownership; establish an original-backed preparation route where one exists. A source-only payload without a retained original belongs to authored source/copy semantics, not a fabricated retained capture. Do not infer an original from the lossy reading projection. |

These subincrements need their own focused identity, original-closure, no-reacquisition, viewer, rollback and persistence gates. PDF completion does not authorize acquisition as an incidental binding effect. Native copying, acquisition/import, generation, Markdown fallback, notices, task-expectation enforcement and general retroactive editing remain deferred.
