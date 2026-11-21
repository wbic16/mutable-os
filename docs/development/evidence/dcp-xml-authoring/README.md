# XML adapter evidence

All provider traffic in this directory was captured from mocked calls to the real request assembler. No provider key or live credentials are stored; no paid calls were made.

- `provider-requests.json`: JSON and XML request bodies for identical native context/settings.
- `palimpsest.json`, `leonardo.json`, `mercury.json`: saved-response specimens rebound to fresh source authority; both paths were prepared and their native text/ranges/definition counts compared.
- `measurements.json`: local tokenizer estimates and byte counts.

Regenerate captures from the repository root:

```sh
DCP_XML_EVIDENCE_DIR=docs/development/evidence/dcp-xml-authoring npx vitest run src/features/dialectic/dcp/xml-authoring.test.ts
TOKENIZER_MODULE=/absolute/path/to/js-tiktoken/dist/index.js node docs/development/evidence/dcp-xml-authoring/measure.mjs
```

The measurement script defaults to the pre-existing temporary local tokenizer installation. No application dependency was added. Fresh aliases/native identities change exact token counts slightly. `o200k_base` is a comparative local tokenizer, not a verified GPT-6.1 Sol billing tokenizer. Full response-schema/tool JSON serialization is not equivalent to provider-internal processing. History, reasoning, cache usage and latency require a separately approved live check.
