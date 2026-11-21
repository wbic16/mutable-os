# Dialectic attachments — investigation and implementation plan

14 November 2026. Implementation authorised by the user after the investigation below.

## Baseline findings

Before this change, neither requested workflow was connected end to end.

| Capability | Finding before implementation |
| --- | --- |
| Drop local files into Dialectic | Flint wires `application.interchange.drag`; Dialectic's Desktop/Textual chrome does not. |
| Upload attachments to the Agent | Provider conversations contain text/structured context, not file bytes or provider file references. |
| Download Agent attachments | Provider results contain text, tool calls and receipts, without artifact retention or attachment cards. Ordinary hyperlinks are separate. |

Reusable foundations:

- `src/application/document-application-capabilities.tsx` and `src/runtime/document-interchange.ts`: file selection, import preparation, canonical insertion and Flint drops.
- `src/interchange/formats.ts`: text, Markdown, HTML, PNG/JPEG and selected structured/academic imports. Local PDF is not an ordinary import format.
- `server/managed-assets.mjs`, `server/managed-assets-router.mjs`, `src/runtime/managed-assets.ts`: scoped immutable originals, hashes, leases, publication, integrity verification and cancellation.
- `src/application-services/pdf-contracts.ts`: retained PDF import currently accepts a URL. `src/pdf/viewer.ts` provides local viewing and explicit text extraction.
- `src/features/dialectic/dcp/inspection.ts`: PDF inspection reports `textExtraction: false`; image inspection reports `perception: false`. Native display/binding does not supply file contents to the model.
- `server/dialectic/{broker,providers}.ts`, `src/features/dialectic/dcp/{live,provider-contract}.ts`: session credentials, streaming and bounded tool rounds, but no file transport or downloadable outputs.

Baseline checks: 59 passed, one failed across provider, capability and clipboard suites. `capabilities.test.ts:60` compares structurally equal schema objects by identity. No source changes or paid calls were made during the investigation. This was a source/test investigation, not live-provider/browser qualification.

## Agreed implementation direction

1. Reuse managed originals with a bounded attachment descriptor: identity, filename, media type, length, hash and provenance. Documents retain references rather than base64 data. Credentials and provider-only identifiers remain operational state.
2. Add a shared drop/picker workflow to the current Dialectic draft. Show progress, removal, cancellation and per-file errors. Stage locally; Submit sends selected attachments. PDFs/images have previews; other files have download cards. A validated local PDF admission path is needed.
3. Extend the broker/adapters with explicit attachment manifests and scoped byte resolution. Supply original PDF/image inputs or clearly labelled text contents. Preserve attachment identity in resend and continuity; reject unsupported formats rather than pretending the AI read them.
4. Retain verified Agent artifacts locally and render response cards with Download/Open actions. A model-written URL or `sandbox:` path alone is not a verified artifact. Local retained bytes remain downloadable independently of remote link expiry.
5. Provide real generation through bounded tools: TXT, Markdown, CSV, JSON and PDF. A host rendering service is an acceptable PDF route; arbitrary local code execution is not necessary. Other binary formats may be downloaded without claiming preview or model understanding.
6. Qualify byte fidelity, persistence, provider failures, cancellation, stale session/draft changes, resend, limits, duplicates, protection and Undo/Redo. Check bounded work and real browser interaction.

Major new capabilities use default-enabled feature flags. Existing defaults remain unchanged. Attachment edits use canonical affected-record transactions and mark the Document dirty. No new automatic Document saves or Markdown sidecars. Command-S/Control-S retains normal manual saving. Hashing, parsing, transfers and artifact rendering occur only on explicit attachment/exchange actions, outside typing; no vault scans or full-document snapshots are introduced.

## Implementation choices

The initial cross-provider artifact route will be a bounded `create_attachment` host tool. This can produce actual downloadable files with either configured provider without relying on provider-hosted code execution. PDF generation renders text into a real PDF; it does not execute generated code. Provider errors and unsupported input formats remain visible.

Use native contribution metadata for attachment descriptors, preserving the existing Document model and save/undo ownership. Attachments remain associated with their contribution, including on resend. File preparation is session work until descriptors are committed. Published originals follow the existing immutable-store retention policy; removing a reference does not destructively delete shared bytes.

Provider API contracts are verified against official documentation before implementation. Qualification results and exact supported formats/limits will be recorded separately after the change.

## Implemented outcome

The initial input and output workflows are implemented behind the two default-enabled flags. See [implementation and qualification](DIALECTIC_ATTACHMENTS_QUALIFICATION.md) for usage, exact formats and budgets, evidence, and remaining portability/live-provider boundaries.

## Follow-up: oversized uploads and generated PDFs

The reported PDF exceeded the initial 10 MiB limit. Replace the generic rejection banner with persistent filenames, sizes, ready counts and explicit failure reasons; block submission while preparation or a failed selection is unresolved. Ask for confirmation before uploading selections over 10 MB. The user initially requested a provisional 100 MB ceiling, then agreed to stay within provider limits: retain that local ceiling while enforcing OpenAI's PDF-input budget and Claude's encoded-request budget before upload and again before provider exchange. Keep image/text/page limits explicit and separate.

Strengthen the agent's PDF-generation instructions on every enabled provider turn, including OpenAI continuity, and verify that the actual tool is advertised. Retain real host-generated files on the agent contribution. Qualify large-file cancellation/approval, both drop and picker, exact-byte retention and download, continuation instructions, and bounded typing work. Image generation is a possible subsequent provider-tool integration, not a capability activated by prompting alone.

## Image generation implementation brief

User-authorised: generate images on request and attach them directly to the Dialectic response. Add default-enabled `dialecticImageGeneration`. Reuse the agent host-tool loop with `generate_image`, backed by OpenAI Images API (`gpt-image-2.5-flare`), rather than mixing large binary results into DCP text streams. Offer it to either chat adapter when an OpenAI credential is configured; never send an Anthropic key to OpenAI. Reuse immutable attachment storage, automatic image preview, verified downloads and manual document persistence. Keep generation progress/cancellation visible and allow five minutes for image-enabled exchanges. Retain up to 20 MB generated PNGs through a dedicated image admission profile. No new work on keystrokes. Initial scope is text-to-image; image editing and other media formats remain separate work.

Qualify the real tool-to-provider-to-store-to-contribution path with deterministic provider fixtures, including failures, cancellation, byte fidelity, flags, continued conversations, save/reopen, download and bounded typing.
