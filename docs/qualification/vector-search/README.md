# Vector retrieval investigation evidence

**Current milestone status: A–C accepted; Milestone C formally accepted and closed on 14 November 2026.** See the [final acceptance record](../../development/NATIVE_VECTOR_SEARCH_RAG_MILESTONE_C_FINAL_ACCEPTANCE.md) for evidence and non-blocking future improvements. No further qualification or paid calls are required; subsequent work is deferred pending separate authorisation. The investigation and earlier experiment entries below are historical.


Local measurements on 13 November 2026. No hosted embeddings, local-model downloads, application integration, or writes to existing `.ink`/SQLite files.

- `exact-probe.json`: synthetic Float32 exact retrieval on temporary disk databases, source-ID lookup, rollback and reopening. This does not measure semantic relevance, ANN, native range resolution or browser latency.
- `exact-probe.mjs`: standalone probe using the repository's installed better-sqlite3. Requires a temporary extension directory containing `package/vec0.dylib` and `vec1.dylib`; macOS qualification only. Run from the repository root with the extension directory and output JSON path as arguments. It creates and removes its own temporary databases.
- `source-extraction.json`: three read-only calls to the existing `projectSaved()` for each specified saved fixture, with source hashes and timings. Token counts/chunking were not measured. Search characters/word counts are not provider tokens.

Runtime: Node v22.12.0, better-sqlite3 12.4.1, SQLite 3.50.4, Apple M1/macOS arm64. FTS5 and loadExtension available.

Extension acquisition was confined to a temporary directory. The sqlite-vec package was `sqlite-vec-darwin-arm64@0.1.9`, npm integrity `sha512-jSsZpE42OfBkGL/ItyJTVCUwl6o6Ka3U5rc4j+UBDIQzC1ulSSKMEhQLthsOnF/MdAf1MuAkYhkdKmmcjaIZQg==`.

Vec1 source came from `https://raw.githubusercontent.com/sqlite/sqlite/master/ext/vec1/vec1.c`; the exact downloaded SHA-256 is recorded in `exact-probe.json`. Master is mutable: verify the hash when reproducing these results, or label a new measurement with the new source hash. Compiled using:

```sh
cc -O3 -DNDEBUG -shared -fPIC -I node_modules/better-sqlite3/deps/sqlite3 TEMP/vec1.c -o TEMP/vec1.dylib
node docs/qualification/vector-search/exact-probe.mjs TEMP OUTPUT_JSON
```

Use the default `sqlite3_extension_init` entrypoint for this Vec1 source. The probe uses BigInt row-ID bindings: ordinary JavaScript Number bindings were rejected by vec0's integer validation. A separate constructor check accepted dimensions 384, 1536 and 8192, and rejected 8193.

The source extractor was bundled read-only to the temporary directory using esbuild, Node platform, ESM, Node22 target, exporting `projectSaved` from `src/knowledge-sqlite/saved-projection.ts`. It was given a synthetic Vault GUID; native Resource/Block IDs came from the saved files. No authoritative Vault establishment, migration or indexing operation was invoked.

Read-only inventory of `vaults/imported/.mutable/mutable.db`: Resource 2317; Block 9057; BlockTextRun 6138; AnnotationDefinition 513; StandoffProperty 47347; Entity 15311; Relationship 4185; Claim 1972. Text-bearing Blocks 6132, text characters 1217646. Resource coverage: complete 2314, incomplete 2, stale 1. Counts describe that index at inspection time, not complete live Cavern coverage.

## Controlled corpus experiment — Milestone A

Completed 14 November 2026 after explicit consent for the two fixtures. One hosted embedding request, 10,027 tokens, usage-derived cost US$0.00020054. See the [qualification report](../../development/NATIVE_VECTOR_SEARCH_RAG_MILESTONE_A_QUALIFICATION.md) and [reproducible experiment/evidence](milestone-a/README.md). This does not add application indexing or begin Milestone B.
