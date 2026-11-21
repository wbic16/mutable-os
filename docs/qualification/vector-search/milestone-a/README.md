# Milestone A: controlled corpus experiment

Status: Milestone A completed after explicit fixture-upload consent. One embedding request used 10,027 tokens; usage-derived cost US$0.00020054. See [qualification report](../../../development/NATIVE_VECTOR_SEARCH_RAG_MILESTONE_A_QUALIFICATION.md). This is an isolated command-line experiment, not an application feature or indexing service.

## Inputs and outputs

`preparation.json` fixes the two source hashes, embedding profile, planned usage and local source checks. `queries.json` contains twelve positive questions and two deliberately unanswerable questions, with evidence excerpts labelled before retrieval. `local-checks.json` records completed deterministic checks. `results.json` contains the measured results with source references, `examples.json` retains representative returned contexts, and `provider-ledger.json` records the single paid request.

Private corpus text, read-only fixture copies, exact source maps, upload manifest, future vector cache, receipts and `retrieval.db` reside under ignored `artifacts/vector-search-milestone-a/`. Nothing writes the originals or `mutable.db`. The experiment contains no application registration, editing callback, autosave callback, renderer or generative-model call.

## Reproduce local preparation

Run from the repository root with Node 22 and the existing `esbuild`/`better-sqlite3` dependencies. Additional dependencies live outside the repository: `sqlite-vec-darwin-arm64@0.1.9` provides `package/vec0.dylib`, and `js-tiktoken@1.0.21` is installed under `tokenizer/node_modules`. Set `MUTABLE_VECTOR_EXPERIMENT_DEPS` to their parent directory; the current local investigation directory is also recorded in `/tmp/mutable-vector-investigation-path`. Only macOS arm64 has been checked. The extension reports `v0.1.9` at runtime; no ANN is used.

```sh
node docs/qualification/vector-search/milestone-a/experiment.mjs prepare
node docs/qualification/vector-search/milestone-a/checks.mjs
```

The two originals must match the pinned hashes. Preparation refuses to overwrite evidence once a provider ledger exists. To preserve an experiment separately, set `MUTABLE_VECTOR_EXPERIMENT_OUT` to a new directory.

## Authorized embedding and local evaluation

Only after the user explicitly approves uploading these fixtures, record that approval in `artifacts/vector-search-milestone-a/consent.json`, with `approved: true`, the exact SHA-256 of `upload-manifest.json` in `manifestHash`, and the user's approval text/date. The script does not generate consent. Review the manifest first.

```sh
node docs/qualification/vector-search/milestone-a/embed.mjs
node docs/qualification/vector-search/milestone-a/evaluate.mjs
```

The embedding script reads `OPENAI_API_KEY` from the environment or `.env.local` without printing it. It makes one embedding request, reserves tokens before transmission, keeps usage/request-ID receipts, and refuses automatic retries or repeated paid runs. The reserved maximum is 50,000 tokens. Text-only inputs are deduplicated across both chunkers and the queries. No source IDs, file metadata, provider history or full `.ink` files are uploaded. Cached vectors support repeated local evaluation without more calls.

The evaluated database contains an ordinary passage/source-map table, profile metadata, independent per-variant FTS5 indexes, and two exact cosine `vec0` tables. Both chunkers use 384-token ceilings; fixed windows overlap up to 64 tokens, while structure-aware chunks preserve whole paragraphs where possible and split oversized paragraphs at sentence boundaries. This compares two practical policies, not an ablation isolating boundary awareness from overlap. Both obey the same Contribution/tab/side/page/cell/margin/run boundaries. Artificial separators have no native source coordinates.

## Evaluation definitions and limits

- Vector, FTS5 and reciprocal-rank fusion are compared over the same corpus. Fusion uses ranks, not incompatible raw scores. No result tuning occurs before the baseline.
- Precision@5 and binary nDCG@5 measure overlap with predeclared relevant evidence. At least 24 UTF-16 characters, or the full shorter excerpt, must overlap. Gold-chunk recall and complete evidence-facet recall are recorded separately.
- Context sufficiency has a separate rubric: all predeclared narrative/argumentative facets must be present. Report full top-five context and a common 768-token ceiling. These automated checks are evidence-coverage proxies, not proof of comprehension; manually inspect successful and unsuccessful contexts in the qualification report. Gold labels are author-assessed, not a blinded independent judgement.
- Relevance labels are intentionally specific, not exhaustive judgements of every vaguely related passage. Twelve positive questions cannot establish general retrieval quality. Negative questions are excluded from positive metric averages and used to show that nearest-neighbour retrieval does not establish answerability. No confidence threshold is calibrated on these two negatives.
- All 164 corpus source spans resolve exactly through existing native Cell/UTF-16 mappings. Citation records retain Resource, Block, occurrence route, source revision, Contribution ordinal/participant and exact bounds. They are durable experiment locators, not newly granted DCP authority.
- The test fixture covers Unicode multi-code-unit Cells and inline objects; oversized indivisible Cells are rejected. Stale revisions, wrong Resources, wrong occurrences and altered excerpts are rejected. SQLite rollback/reopen and exact search versus a separate brute-force calculation pass with clearly separate synthetic vectors.
- Application Undo/Redo, native edit/split/merge lifecycle, worker cancellation and profile migration remain integration gates. A pure hash-reuse assertion is not an Undo/Redo qualification. No typing/rendering benchmark is warranted for unregistered command-line code; no UI performance claim is made.

Document semantic definitions remain scoped to their Resource. The Symposium has seven `mutable/entity`, six `dialectic/argument`, one `dialectic/argument-relation` and twelve range-anchor definitions. They are inventoried, not converted to authoritative Vault Entities/Claims or indexed as a second semantic registry. The two known fixtures do not qualify arbitrary application privacy/fallback provenance policy or cross-Vault authority.
