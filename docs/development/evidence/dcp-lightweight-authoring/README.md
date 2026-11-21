# Offline language specimens — 11 November 2026

These are investigation artifacts, not implemented DCP formats. No network or paid provider calls were made.

Run from the repository root:

```sh
TOKENIZER_MODULE=/absolute/path/to/js-tiktoken/dist/index.js node docs/development/evidence/dcp-lightweight-authoring/measure.mjs
```

The default tokenizer path is the pre-existing local installation under `/tmp/dcp-workspace-tokenizer-js`. No dependency was added to the application. Existing `saxes` and `yaml` packages are used for specimen checks. Tokenizer: `o200k_base`; these are local comparative estimates, not verified GPT-6.1 Sol billable counts.

Four complete, unrepaired, previously admitted responses are rendered in five candidate formats. `current-json` is the current response minified; `current-pretty-json` is a consistent two-space reserialization, not a claim about original provider whitespace. `compact-intent-json` is an additional control separating representation simplification from XML punctuation savings. YAML uses the same compact intent records and inline XML; S-expressions represent the XML element/text tree without embedded XML strings. The hybrid uses XML semantic elements and proposed `span-block` labels around Markdown structure. Those labels are not standard Markdown or implemented Mutable syntax.

Every candidate retains original prose, Entity descriptions/aliases, explicit mentions, classifications, passage selectors, Arguments, Glosses, directed relationships and reply targets. Empty/default fields and transport IDs are host-supplied in the proposal. Host binding files retain historical source handles and revisions for audit only. They confer no current authority. Semantics are carried by a common intent ledger; all list items and independently declared anchors remain distinct.

Checks cover baseline admission receipts, XML well-formedness and decoded prose, YAML ledger round-trip and historical selector bindings. These checks do **not** demonstrate a candidate native compiler, hybrid/S-expression parser, live model reliability, current source authority or native persistence round-trip. Native equivalence is a proposed mapping to already-qualified preparation, with explicit gaps in the report.

`tokensAboveProse` subtracts the token count of decoded contribution text joined with two newlines. This includes useful semantic content and quotations as well as syntax; it must not be called entirely wasted overhead. `semanticDefinitionTextTokens` separately counts Entity name/type/description/aliases and Gloss text, but is not an additive token partition because token boundaries change between serializations.

`contract-*.txt` contain the measured preferred draft; `request-proposal.xml` is a proposed compact projection of the saved palimpsest request, with authority and diagnostic details retained host-side. It is not an alternative serialization of the full diagnostic object. No existing native resource or advanced capability is removed by this proposal.
