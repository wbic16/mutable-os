# Dialectic attachments — implementation and qualification

14 November 2026. Implements [the investigation and plan](DIALECTIC_ATTACHMENTS_PLAN.md).

## What is available

Open a Vault and a Dialectic conversation. Drop files anywhere inside Dialectic, or choose **Attach files**. Files are prepared locally and attached to the current draft. The draft remains editable while preparation runs; Submit waits for preparation to finish. Remove a file before submitting, or cancel preparation. Selections over 10 MB require explicit confirmation before any upload. The composer shows ready filenames, sizes and an attachment count. A failed batch leaves existing attachment references intact and keeps the rejected filenames, sizes and reason visible. Submit stays blocked until the user replaces or removes the failed selection, preventing accidental text-only requests.

**Submit** sends the contribution and its attachments to the configured AI provider. Attachments belonging to explicitly selected context are also included. Resend copies the attachment references. PDF and image originals are sent as native provider inputs; text contents are supplied explicitly, separately from the ordinary 6,000-character excerpt budget.

Ask the agent to create a downloadable file, for example: “Read the attached evidence and create a PDF report and a CSV table.” The bounded `create_attachment` tool produces retained files and the response displays **Download** and **Preview** controls. Both OpenAI and Anthropic adapters offer this tool. A prose URL or invented `sandbox:` path is not accepted as an attachment.

Downloads use verified retained bytes. PDF preview uses the existing PDF.js viewer with page navigation and no embedded PDF actions. Images use local object URLs; text, including HTML source, is displayed as escaped text. Closing previews or the view releases viewers and URLs.

## Supported formats and limits

| Item | Initial support |
| --- | --- |
| Input PDFs | Original PDF, up to 100 MB local retention and 100 pages per file; selected-provider limits below apply before upload; encrypted/corrupt PDFs rejected |
| Input images | PNG/JPEG, up to 5 MiB and 8,000 pixels per dimension, subject to the existing decoder's pixel budget |
| Input text | UTF-8 TXT, MD/MARKDOWN, CSV/TSV, JSON, XML, HTML/HTM, YAML/YML, JS/TS/TSX/JSX, PY, CSS, SQL and LOG; up to 200,000 bytes per file and 400,000 selected text bytes per request |
| Selection | Up to eight attachments and 100 MB local total per contribution/request, further constrained by the selected provider |
| Generated files | TXT, MD, CSV, JSON, HTML and PDF; up to 60,000 source characters per tool call and the same retained-file/count budgets |
| Generated PDFs | Paginated plain text with an embedded Liberation Sans font; unsupported glyphs produce an explicit tool error so the agent can offer a UTF-8 file |

PDF input budgets follow the selected provider. OpenAI accepts **less than 50 MB** of PDF inputs per request. Claude's first-party request limit is **128 MB including base64 encoding**; this inline transport reserves 2 MB for other request content, allowing at most about 94.5 MB of binary originals. Both the composer and broker check the budget, including selected context at exchange time. A provider change also rechecks attached files before Submit. The complete serialized Claude request receives a final UTF-8 byte check before any provider network call. MB here means decimal bytes; the existing image limit remains 5 MiB. Text, image, page, model/context and token limits remain separate constraints. Files API transport is not implemented.

The dedicated attachment PDF worker/store profile accepts the provisional 100 MB local ceiling without raising ordinary PDF import limits. This ceiling does not override provider limits or imply that a 100 MB PDF can be submitted remotely.

DOCX, XLSX, archives, arbitrary binaries and provider-hosted code-interpreter files are not part of this initial implementation. Generated PDFs do not render HTML, Markdown, charts or arbitrary code. Provider model/context/request limits still apply and can be stricter than these local limits. Generation also shares Dialectic's existing output-token, tool-round and deadline budgets.

## Persistence and feature control

`dialecticAttachments`, `dialecticArtifacts` and `dialecticImageGeneration` are enabled by default in `src/configuration.ts`. Existing feature defaults are unchanged.

Original bytes use the existing Vault-managed immutable asset store and hashes. Contribution metadata records descriptors, not embedded base64 or temporary URLs. Adding/removing references uses affected-record canonical transactions, supports Undo/Redo and marks the Document dirty. Save remains manual with Command-S/Control-S. Published originals follow the existing store retention policy; removing a reference does not delete potentially shared bytes.

A saved native conversation reopens with attachments **in its original Vault**. A native file alone does not contain the binaries. Ink package export now reports that it does not bundle/rebind Dialectic attachments; download files separately for transfer. Cross-Vault attachment migration remains future work.

Continuity history retains attachment descriptors and explicitly states whether original contents are available. Current target/selected-context originals are supplied on an exchange. A rebuilt provider history does not silently re-upload every historical attachment: select its contribution as context when its contents are needed again. This avoids claiming that historical filenames alone give the model file access.

## Implementation boundaries

- `attachments-contract.ts` defines descriptors, supported extensions, budgets and the host tool schema.
- `attachments.ts` / `attachments-view.tsx` implement draft preparation, canonical reference updates and attachment controls. Dialectic's shared chrome owns native file-drop handling for Desktop and Textual presentations.
- Broker routes require the existing same-origin local session and the active Vault session. Reads verify immutable-store integrity and manifests; the client verifies downloaded size and SHA-256 again. Stale Vault/draft results cannot be committed.
- PDF admission/rendering uses the existing disposable preparation executor. Image admission reuses the existing disposable image validator. No parsing, hashing or transfers occur during typing.
- Artifact requests must match a real pending provider tool call. The broker records the authoritative result, ignores client-forged result metadata and makes repeated calls idempotent.
- Diagnostic request logs omit embedded PDF/image bytes and Vault-session tokens. Existing opt-in diagnostic logging can still contain conversation and text-file contents.

## Validation

Initial implementation validation: 125 focused tests passed across 11 suites (run in groups), including the existing 13-test PDF service suite. The large-upload/PDF-instruction follow-up passed 111 tests across the attachment UI, broker, provider, attachment storage, logging and PDF service suites, plus all 15 immutable-store tests. `npm run typecheck` and the client/server production build passed. The production build used `NODE_OPTIONS=--max-old-space-size=8192 npm run build` after the default Node heap was exhausted during source-map generation. Existing chunk-size/mixed-import build warnings remain.

Commands used for the focused suites:

```sh
npx vitest run server/dialectic/attachments.test.ts server/dialectic/test-log.test.ts server/dialectic/providers.test.ts server/dialectic/broker.test.ts src/features/dialectic/attachments.test.tsx src/features/dialectic/conversation-updates.test.tsx src/features/dialectic/clipboard.test.tsx
npx vitest run src/interchange/package/resources.test.ts src/rendering/pdf-block-view.test.tsx src/runtime/retained-pdf.test.ts server/application-services/pdf.test.ts
```

Run worker-dependent tests after the build completes: Vite clears `dist` during its build. One overlapping PDF test run encountered the temporarily absent worker; rerunning after the build passed all 13 tests.

The reproducible browser runner is `node scripts/check-dialectic-attachments-browser.mjs` after building the server and PDF assets. It starts an isolated Chrome profile, temporary Vault, real managed store, real broker and real preparation worker. The provider is a deterministic SSE fixture, so it makes no paid API calls.

The browser exercise covers an actual Chrome file drop over protected history of TXT/a 12 MB PDF, cancellation with zero uploads, explicit approval before upload, native file-picker selection, native provider PDF/text input, three agent tool calls producing PDF/CSV/PNG, rendered PDF preview, manual native save, reopening six attachment references, and downloading the exact CSV bytes. Local evidence is written to `artifacts/dialectic-attachments/qualification.json`, `pdf-preview.png` and `reopened.png`.

Focused tests cover real immutable storage/reopening/deduplication, PDF and image admission, native provider inputs, real PDF generation, authenticated upload/tool/download exchanges for both providers, forged tool-result rejection, stale sessions, feature flags, failure/cancellation, draft Undo/Redo, both streamed and atomic native responses, resend, log redaction and package boundary reporting. Existing provider, broker, clipboard, conversation-update and PDF regression suites are included.

The attachment regression checks count repository snapshots, whole-map enumerations, network requests and attachment-card and draft-status DOM mutations during ordinary typing: all remain zero. Attach/remove transactions also avoid repository snapshots and whole-map enumerations.

The real Flint Chrome typing benchmark ran before and after against 250 paragraphs / 25,000 characters with Dialectic ranges, 40 edits:

| Measure | Before | After |
| --- | ---: | ---: |
| Median edit handler | 3.8 ms | 3.3 ms |
| p95 edit handler | 18.8 ms | 13.8 ms |
| Full repository snapshots during typing | 0 | 0 |
| Dialectic tree/property/definition reads during typing | 0 | 0 |
| Unrelated cell identity / text restored | Preserved | Preserved |

Real Chrome insertText, Backspace, Undo/Redo, Enter and split-undo checks passed. These headless measurements are nonregression evidence, not a claim of improved or guaranteed user-visible latency. Raw local benchmark output is in `artifacts/dialectic-attachments/flint-before.log` and `flint-after.log`.

No paid OpenAI/Anthropic request has been run for this change. Provider request shapes and orchestration are fixture-tested; real model selection, tool use and account-specific limits remain live-provider qualification boundaries. The investigation also identified an existing unrelated `capabilities.test.ts:60` identity assertion failure; it was not changed.

## API references

Original PDF transport follows the official [OpenAI file-input contract](https://developers.openai.com/api/docs/guides/file-inputs) and [Anthropic PDF contract](https://platform.claude.com/docs/en/build-with-claude/pdf-support); Anthropic images follow its [vision contract](https://platform.claude.com/docs/en/build-with-claude/vision). The initial output route deliberately uses a local host tool rather than [OpenAI-hosted code interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter). PDF generation uses [PDFKit text rendering](https://pdfkit.org/docs/text.html).

## Protected-history drop regression

The original Chrome check dropped over application chrome, which missed the failure over submitted text. A file drag over protected conversation history showed the overlay, but its `pointer-events: none` let the eventual drop target the protected TextBlock. The native window-level protection guard correctly stopped that event before Dialectic could receive it, leaving the overlay visible and the draft unchanged.

The overlay now receives pointer events outside the protected contribution mounts. Drops still use the existing bounded draft-attachment transaction; native history protection is unchanged. Escape, drag end, window blur, leaving the app, and drops elsewhere clear the transient overlay without changing the Document. All listeners are released with the view.

The Chrome runner now seeds a committed contribution, confirms that its text is protected, and drops actual TXT/PDF files at coordinates over that text. It reproduced the stuck-overlay assertion before the fix and passes the complete attach/provider/preview/save/reopen/download flow after the fix. Seven additional UI cases cover protected history and cancellation; existing bounded-typing checks still report zero scans, snapshots, requests and attachment DOM mutations.

The development launcher builds its backend only at startup. An already-running server from before attachment implementation needs a restart after saving open Documents; Vite hot updates alone do not install the new backend routes.

## Large-file rejection and PDF-tool follow-up

The reported missing PDF was larger than the old 10 MiB per-file ceiling. Both the picker and drop flow shared that rejection; no attachment reference or provider input was produced. The old generic banner did not say which file or limit failed. The UI now reports that detail persistently alongside the ready attachment count, and uses the provider budgets above after the user's request to retain provider limits.

PDF generation remains agent-driven: the model authors content and invokes `create_attachment`; the host renders and retains actual PDF bytes and attaches them to its response. The tool was already advertised, but OpenAI's continuing-conversation path omitted its specific generation instructions. Those instructions now accompany every enabled turn and explicitly distinguish the host tool from the native-block capability catalogue. Tests check both provider tool schemas and instructions after continuity initialization. This is a verified instruction-path omission, not proof of the precise cause of the user's model refusal; that exchange's wire log was unavailable.

## Agent image generation

Ask for an image naturally, for example “Generate a watercolor garden scene and attach it.” The default-enabled `dialecticImageGeneration` feature advertises `generate_image` in the existing agent tool loop. The broker calls OpenAI’s [Images API](https://developers.openai.com/api/docs/guides/image-generation) with `gpt-image-2.5-flare` and retains the returned PNG as an agent attachment. It uses the OpenAI session key or server `OPENAI_API_KEY`. An Anthropic chat agent can also use this tool when an OpenAI credential has been configured; the broker never substitutes an Anthropic key. The tool is absent when the flag is off, artifacts are disabled, no Vault is open, or no OpenAI credential is available. Image-model access and billing belong to the OpenAI API account. AI settings explain this.

The model chooses a prompt, descriptive filename, orientation and quality. The initial integration generates new images from text, not edits of uploaded images. It is a host function tool backed by the Images API, not the Responses built-in image tool: this reuses the existing authenticated, idempotent artifact round trip for either chat provider and keeps binary payloads out of DCP streams/history. Generation instructions remain present on continuing conversations.

`image-generation-contract.ts` owns the tool schema and budgets; `server/dialectic/image-generation.ts` owns the provider request and validated retention. The broker checks the pending tool identity and returns authoritative success/error results. Successful results follow the existing `dcp/live.ts` → controller → contribution metadata path. No new document persistence mechanism is introduced.

The composer displays “Generating image…” and retains its Cancel response control. Image-enabled exchanges allow five minutes, including source fences and client/server deadlines. Generation failures produce an actionable tool error without a fictitious attachment or automatic paid retry. Repeated retrieval of one completed tool result does not generate again.

Generated PNGs can be up to 20 MB through a dedicated image validator/store profile; existing local-image upload limits remain unchanged. Original PNG bytes are preserved. Claude requests separately enforce its per-image input limit when reusing larger generated images as context. Visible generated images preview automatically; IntersectionObserver and a serialized preview queue avoid fetching all off-screen images or overloading the local download service. Closing the view cancels active reads and releases URLs. Downloading an already-previewed image reuses its verified bytes and keeps the preview open.

Generated images survive manual save/reopen within the original Vault and download independently of provider URLs. Diagnostic logging records image request/response metadata but does not duplicate the image payload or impose the smaller text-stream budget on it. Parsing, validation, network calls and file writes occur on explicit generation/attachment actions, never on keystrokes.

Qualification includes both chat adapters, correct credential routing, feature-off and missing-key behavior, provider errors, cancellation, stale Vault checks, malformed output, generation-result idempotency, exact PNG retention/download and a generated PNG above the ordinary import ceiling. The Chrome runner covers generation progress, automatic preview, manual save/reopen and exact image download alongside PDF/CSV generation. Provider responses are deterministic fixtures; no paid image request was made by these checks.

Image-generation validation: 141 focused tests across seven suites and all 15 immutable-store tests passed. The real Chrome runner passed, including visible generation progress, automatic image preview, save/reopen of six references, exact PNG download, and zero scans/snapshots/network requests during typing. Typecheck and the full production build passed (8 GB Node heap; existing chunk/mixed-import warnings). Provider responses in automated qualification are fixtures; live image-model account access was not exercised.
