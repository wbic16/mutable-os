# TEI importer — Milestones 1–5

Use **Workspace → Open TEI XML…** (also available in the Flint menu), or **Import external files as new Ink documents**. The dedicated Open action accepts `.xml` and `.tei` with TEI interpretation already selected. `.tei` selects this converter automatically; for `.xml`, choose **TEI P5 XML** explicitly. The result is an unsaved native document. Save manually to a native filename; the XML source is never overwritten.

The document always owns one Page. When a header exists, the existing native tab row opens on **Text**, with editable header content in **Metadata**. No new metadata renderer is installed. Semantic annotations and correspondence records are editable through the existing annotation monitor. Real source Entity definitions use document-local Glosses; import does not create canonical SQLite Entities or relationships.

`teiImport` is enabled by default. Disabling it removes TEI import availability and declaration activation; it does not prevent reading/editing already imported native data.

`teiSemanticSublimation` also defaults on. It selects M2 rules for **new** imports;
set it false to retain M1's contextual milestone conversion. Saved documents are
not migrated when either flag changes. New semantic roles use `tei/`; historical
unprefixed role values remain readable.

`teiOperationalSemantics` defaults on. New imports promote only unqualified,
explicitly directed binary relationships between uniquely resolved local person,
organisation or place definitions. Other assertions remain `tei/relationship`
records with diagnostics. Native Gloss relationships can be inspected and followed
in **Gloss Mode → Local References → References / Graph**.

Open **TEI milestones** in the References panel to inspect source labels/attributes
and navigate exact current positions, including inactive inline readings, hidden tabs and empty/EOF
boundaries. Local entity rows provide **Source definition**, **Imported source
details** and **Explicit mentions**; a mention's Gloss popup offers **Definition
and mentions**. These identities are document-local, not canonical Entity IDs.
Older imports without occurrence roles retain generic Passage navigation.

Set `operationalSemantics: false` in headless conversion (or disable the editor
flag) to disable operational graph promotion. For the complete M2 policy also
set `inlineAlternatives: false`. Flag changes do not migrate saved data.

`inlineAlternatives` defaults on. Eligible inline `choice` and `app` become native
one-position slots with independently editable owned readings. First authored
reading is selected separately in each viewing occurrence. Block-bearing,
cross-range or unsupported apparatus retains grouped source-order tabs. Disable
this flag (or compact admission) for grouped imports. Existing saved slots require
compact admission and remain readable when the creation flag is off. Native copy/cut/paste preserves complete reading closures, including inactive, nested
and empty readings. `inlineAlternativeInteroperability` defaults on and enables
qualified ordinary-paragraph joins and replacements. External clipboard text/HTML
uses the displayed reading; unsupported structured operations and legacy/Markdown
export reject explicitly. Saved slot documents declare
`mutable/inline-alternatives/v1`; existing M4 files remain readable. Use native Save
to preserve the whole reading closure. No XML archive or Source tab is created.
See the [M5 report](../../../TEI_P5_IMPORTER_MILESTONE_5_IMPLEMENTATION.md) for qualification and limits.

## Configuration and headless use

The limits are per import, independent of clipboard limits and native persistence:

```ts
new ReactiveEditor(workspace, {
  features: { teiImport: true },
  teiImportLimits: {
    bytes: 128 * 1024 * 1024,
    cells: 8_000_000,
    timeoutMs: 300_000,
  },
});

const result = convertTei(xml, { cells: 8_000_000 });
const fragment = convertTeiFragment(xml); // roots + owned definitions + diagnostics
// Explicit M1 conversion policy for headless callers:
const previous = convertTei(xml, {}, 'letter.xml', undefined, { semanticSublimation: false });
```

Defaults: 64 MiB input/decoded UTF-8 bytes, 5,000,000 source-content Cells, 1,000,000 XML elements, depth 128, 100,000 Blocks, 500,000 annotation records, 500,000 reference tokens, 100 diagnostic examples, 120 seconds of worker preparation. All values are configurable positive safe integers. The full-document file batch permits 1–20 files with an aggregate ceiling of four TEI byte budgets (at least the existing 40 MiB ordinary-file budget). Non-TEI file limits are unchanged.

A small fixed document/Page/tab/notice reserve is outside source-content budgets. Partial conversion sets `metadata.tei.truncated`, includes aggregated diagnostics and places **INCOMPLETE IMPORT** visibly before the reading tabs. Byte-limit failures admit nothing. Resource ceilings are not performance promises: the existing Cell representation can use substantial transient memory during native admission and rendering. A 300,100-Cell native persistence test is included; a 5-million-Cell rendered document is not qualified.

The pure converter uses no DOM, network, AI or live editor. Its internally generated candidate uses native admission, bypassing external clipboard materialisation without changing that allowlist. Fragment insertion UI is intentionally absent: callers must adopt the returned Document-owned definitions explicitly. XML-root targets have no fabricated Document target in fragment results.

The worker completes semantic conversion and producer/range validation, then writes
compact native text atoms with the existing authored-value encoding. It does not
construct disposable live Cells merely to serialize them back to text. The
ordinary native decoder, ownership checks and repository validator still run
before atomic admission; native Save and the persistence schema are unchanged.
The compact writer is deliberately restricted to this producer's six existing
Block implementations. Future producer expansions must qualify its encoding too.

Optional profiling (`profile: true` on a `tei-document` request) returns stage
measurements and allocation counts outside the native bytes. No profiling or
import work subscribes to ordinary typing. For the production browser benchmark,
see [the performance harness](../../../scripts/tei-performance/README.md).

## Recovery and limits of fidelity

- Unknown elements retain readable content and supported descendants. Unexpected fields are inert metadata.
- Broken, forward and ambiguous references retain original ordered tokens. Resolution is an import-time observation, not a permanent binding.
- Undefined entities can be retained literally with up to four fresh strict parser restarts. Other syntax errors retain a trusted prefix and an editable literal suffix. Never continue interpreting a parser's guessed post-error events. Even pre-error close events are checked because `saxes` emits a guessed close before signalling a mismatch.
- Unsupported apparatus uses structural native tabs; all readings survive, but paragraph flow can change. `choice`, `app` and nested `rdgGrp` retain their distinct group and branch roles, empty readings and attributes. The first authored branch is initially active; switching tabs is session presentation, not an editorial preference saved to the document. No superposition flag is enabled.
- Ordinary line breaks retain a logical newline. `pb`, `cb`, `anchor`, `milestone`, `space` and `lb break="no"` use exact zero-width code-point boundaries. `space` retains dimensions without inventing visible width. Source page breaks never create Pages. M1 opt-out retains its explicitly approximate context ranges.
- New points use `isZeroWidth: true, start: boundary, end: boundary`. Compact editing preserves both native endpoint forms, including `end = start - 1`; affinity follows the existing before/after policy. Deleting an annotated boundary can consume its segment while retaining the Document-owned definition. Empty elements need no placeholder character.
- Editorial roles include substitution, addition, deletion, supplied, surplus, unclear, gap, damage, restoration and hand shift. Nested operations retain a parent editorial-definition ID; multi-Block text shares the same definition. Certainty, attribution, reason, placement and hand references remain authored data, without inferred values or destructive deletion.
- Only explicit `ref` attributes on compatible name mentions create local Entity Gloss segments. Responsibility, witness and relationship references do not become mentions. `relation` retains ordered active/passive/mutual participant assertions as `tei/relationship` definitions, without publishing canonical edges. Pointer-valued apparatus `from/to` and date-valued `from/to` remain distinct.
- Existing Mode split/join restrictions remain. Source IDs and rich metadata can prevent continuation; joins involving Modes remain refused.
- No canonical entity creation, external dereferencing, critical-apparatus engine, source archive, permanent XML binding, automatic save or semantic TextBlock specialisation is provided.

Use the existing annotation monitor at the caret to inspect points and editorial
metadata. Points can be moved without turning them into one-character ranges;
their excerpt is empty. There is no document-wide milestone navigator or
specialised critical-apparatus UI. Filename and converter provenance live in
`metadata.interchange.provenance`; authored fields and reference spellings remain
on their semantic records. Conversion policy is recorded in `metadata.tei.conversion`.
These are import-time facts, not ongoing source synchronisation or an audit of
later user edits. Original XML files remain outside the native document.

## Qualification

Run `npm test -- src/interchange/tei src/rendering/tei-import.test.tsx src/rendering/tei-semantic-sublimation.test.tsx` and `npm run typecheck`. [The M2 report](../../../TEI_P5_IMPORTER_MILESTONE_2_IMPLEMENTATION.md) records the merged baseline, reconciliation, broader checks and performance results.

For a real browser check, start Vite and run `node scripts/qualify-tei-browser.mjs`. Set `TEI_QUALIFICATION_URL` if its origin differs from `http://127.0.0.1:3000`. This uses an isolated Chrome profile, the actual import worker and native bank admission, both pinned real letters and the synthetic M2 fixture, trusted CDP text input, Undo/Redo, reload, secondary metadata tabs, cancellation and timeout. It writes QA evidence to `artifacts/tei-m2/browser-smoke.json`; it never saves user documents. `TEI_COMPACT=0` selects legacy admission; `TEI_OUTPUT` selects a separate evidence directory. Fixture attribution and checksums are in `fixtures/README.md`.
