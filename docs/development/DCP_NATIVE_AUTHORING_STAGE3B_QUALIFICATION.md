# DCP native authoring — Stage 3B qualification

9 November 2026. Stage 3A is accepted. Stage 3B enables ordinary external media authoring under `dcpNativeAuthoringStage3ExternalMedia`, independently of managed-image binding and dependent on Stage 1. The flag is enabled after focused qualification. No existing source Block, active Cavern or per-resource approval is required for a new supported external reference. Stage 3C has not begun.

## Qualified vocabulary

| DCP construct | Shared native route and meaning |
| --- | --- |
| **New:** `external-image {id,kind:'external-image',url,alt}` | `prepareImage` extracted from human **Add Image URL**, also used by `prepareExternalImage`. Creates an ordinary `image-block` with URL and alternative text. No managed original or acquisition. |
| **New:** `video {id,kind:'video',url}` | Native `resourceUrl` provider parsing, `videoFragment` and materialisation create `mutable/video-block`. YouTube/Vimeo URLs, including supported share-URL normalization; no direct video-file player or download. |
| **New:** `embed {id,kind:'embed',url}` | Existing explicit-resource `resourceBlock` path creates a native `iframe-block`, with fixed resource-embed configuration, sandbox and no-referrer policy. No raw HTML, `srcdoc`, permission flags or capture data. |
| Existing `youtube {id,kind:'youtube',url}` | Continues to use `prepareYouTube` and the native YouTube URL/ID validator. Credential-bearing URLs and nonstandard ports are now rejected by that shared validator. |
| Existing `reference/url` standoff property | Native hyperlinks for websites, PDF documents and IIIF resources, including labelled links alongside commentary. No source handle or capture needed. Shared native formatting validation now also rejects URL credentials. No new standoff types were added. |
| Existing `image {id,kind:'image',source,revision,alt}` | Stage 3A managed binding remains distinct and still requires current native source authority and verified resource/session state. |

New external-media declarations are limited to **8 per contribution**, URLs to **4,096 characters**, and alternative text to **1,024 UTF-16 code units**. Existing composition/Cell/descendant and discovery budgets are unchanged. Internal video/iframe fragments remain host-private and join the same atomic contribution transaction as managed binding and ordinary composition.

Images in Grids and named margins, video in Tabs, and images/web embeds on either Surface face are qualified. Native ownership, submitted-content protection, Undo/Redo and manual native persistence are preserved. This adds no media-layout framework or DCP resource registry.

## Native policy boundaries

Human **Add Image** retains its existing local/relative/blob UI policy. DCP exposes its external HTTP(S) subset through the same Block preparation, with additional syntax restrictions: no credentials, nonstandard ports, local hostnames, private/reserved IP literals or executable/local schemes. This does **not** substitute managed-image acquisition for external-image authoring. Explicit resource-paste image acquisition retains its separate native policy and lease requirements.

Preparation performs **no downloads, availability probes, redirects or asset publication**. Browser rendering subsequently loads external images and frames using the existing native views. Provider frames retain native sandboxing, no autoplay and local lifecycle; website frames retain `allow-scripts allow-forms allow-presentation` without same-origin permission and use `no-referrer`. Authored URLs/configuration remain immutable; playback, browser load errors, visibility and disposal do not rewrite them.

**Network limitation:** syntax validation is not DNS validation. Direct browser embeds retain browser-managed DNS, redirects, content handling and network protections; this increment does not guarantee that a public-looking hostname or redirect cannot reach a private address. It also does not claim byte-size, MIME, integrity or remote-availability verification for an external embed. Those stronger guarantees belong to protected native acquisition, whose existing DNS pinning, redirect, type/size and authorization checks are unchanged. No new server fetch or permissive proxy was introduced.

## PDF, IIIF and captured web resources

New PDF/IIIF URLs are authorable as native hyperlinks today. The specialised `mutable/pdf-document-block`, IIIF viewers and captured web cards consume retained captures with native resource/snapshot/inspection relationships; a URL alone cannot produce those records. The legacy registered `pdf-block` iframe alias is not promoted into a specialised viewer authoring route. A generic website iframe remains a browser embed, including when a browser chooses to display a linked document; it is never reported as a retained PDF/IIIF capture.

Retained capture binding stays in **3C**, copying in **3D**, and new capture/import in **3E**. The [Stage 3 plan](DCP_NATIVE_AUTHORING_STAGE3_PLAN.md) now distinguishes ordinary reference/embed authority from acquisition authorization. Later routine acquisition may use qualified host/user-configured policy instead of per-item interactive consent. Stage 3B implements no such policy and preserves current native acquisition requirements; no model-supplied consent field exists.

## Reading, catalogue and qualification

Catalogue IDs: new `media.external-image` and `media.embed`; qualified existing `media.video`; unchanged separate `media.image` and `media.youtube`; `media.retained-viewers` explains the unavailable capture-dependent viewer routes and ordinary hyperlink alternative. Inspection distinguishes external images, embedded players/websites, managed images and retained captures, with **unknown remote availability** unless independently established. Trusted managed/capture identifiers are not exported. OpenAI recursion and bounded Anthropic schemas retain earlier feature modes; every individual descriptor fits the unchanged 8,192-byte limit.

**205 focused deterministic tests across 9 suites passed; reactive and server TypeScript checks passed.** The suites cover human/shared-native equivalence, valid/invalid URLs and provider IDs, source-free external image creation, mixed managed/external admission, nesting, native features, private literals/credentials/schemes, absence of preparation-time acquisition, immutable authored configuration, frame policies and lifecycle, atomic rollback, Undo/Redo, native reload, provider schemas, bounded catalogue discovery and Stage 1–3A compatibility. Typing and external contribution admission add no snapshots or projection rebuilds; ordinary typing causes no DCP retrieval or asset requests. No geometry, indexing, background saving or per-keystroke resource work was added.

The initial baseline exposed three stale native video tests that still selected removed Load/Stop buttons (actually hitting the drag handle). Their assertions now exercise the current native close-view/disposal lifecycle and visibility preservation. The player implementation and activation policy were not replaced.

Suites: `media-authoring.test.ts`, `dialectic.test.tsx`, DCP `dcp.test.ts` / `capabilities.test.ts`, server `providers.test.ts`, `uri-import.test.tsx`, `background-media.test.tsx`, `resource-url.test.ts`, and `audit-dcp-vocabulary.test.ts`. No model benchmark or user-Document edits were performed. Media generation, fallback, notices, task expectations and retroactive editing remain deferred.
