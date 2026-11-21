# DCP identity audit and bounded refinement

9 November 2026. Scope: existing text/semantic DCP profiles. Task expectations and media authoring remain deferred.

## Current inventory, before refinement

`DcpSources.handles` maps exchange handles to native `ReplyTarget`s; its reverse `issued` map already deduplicates repeated discovery. `prepare` uses a response-wide uniqueness set and a local alias map, then allocates native GUIDs. These are the two necessary scopes, not missing infrastructure.

| Category | Issuer, identity and lifetime | Wire locations and resolution | Does composition need the native GUID? |
| --- | --- | --- | --- |
| Document/owner | Mutable native resource GUID; durable | Source `owner`, `target.resourceId`, task focus, provenance; ownership checked by source/semantic services | No; retain for inspection and continuity |
| Contribution | Mutable native Block GUID; durable, plus host `source-UUID` exchange handle | Manifest, inventory `contribution`, source ancestry, reply targets; `ReplyTarget.kind=contribution` resolves owned committed content | No for addressing; `contributionId` inventory filter currently accepts the native GUID |
| Existing Block/TextBlock | Mutable Block GUID; durable, plus host exchange handle | Manifest `target`, inventory `blockId`, read/search results, children and `anchors.source`; native resolver, committed-state and source fences | No for authoring; GUID reporting/disambiguation remains useful |
| Existing exact range | Mutable linked range-definition GUID and standoff-property GUID; durable, plus host exchange handle | `anchorHandle`, semantic references, argument passage, reply targets; native range resolution and definition ownership | No |
| Source handle | Host `source-UUID`; one `DcpSources` lifetime | `primaryReply`, selected context, manifest roots, tool `handle`, `source`, semantic references and reply targets | Handle is the model's reference; native identity remains behind its mapping |
| Source revision | Host UUID; stable per handle within this exchange, not a native revision number | `read_source`/manifest/search `revision`, `anchors.revision`; equality plus captured content records, change subscription and exact selector checks | No; model must copy the issued revision, not invent one |
| New source anchor | Model response-local `anchors[].id`; host allocates native definition/property GUIDs | Source handle + revision + literal selector; aliases resolve to new native ranges for arguments, Glosses and reply targets | No |
| Composition element | Model response-local `id`; host allocates native Block GUID | Paragraph/group/list/table `id`; globally unique declaration, **not** an addressable passage alias | No; current grammar requires an ID although dependencies do not use it |
| Generated passage | Optional model XML `annotation id` or `ranges[].id`; response-local, then host native range/property GUIDs | `markup` collects a passage alias; argument/Gloss/reply references can target it | No; plain quotation styling needs no ID |
| XML boundary | Model response-local position label; no persistent identity | `<boundary id>` and `ranges[].from/to`; resolved only within the paragraph, also response-wide uniqueness checked | No |
| Interpretation/classification | Model response-local `interpretations[].id`; host native property GUID | `target` must name a newly proposed original-source anchor; `ref` is only an admitted Entity reference; classification ID itself is not an addressable range | No |
| Entity | Mutable Document or Vault Entity GUID with explicit native scope; durable, plus host exchange handle; new Entity uses model alias | Entity source `reference`/record, annotation `ref`, relations; `ScopedEntities` checks kind, scope, deletion and Vault revision | No; descriptive Entity `aliases[]` are names, not identity references |
| Gloss | Mutable definition GUID plus internal Gloss `localId` and property GUIDs; durable, host handle for existing, model alias for new | Source `glossHandle`, `glosses[].target`, semantic definitions; host checks owned passage and allocates native identifiers | No |
| Argument | Mutable independent definition GUID; durable, host handle for existing, model alias for new | `arguments[].anchor`, relations and reply targets; must resolve a native range, never infer an argument from classification | No |
| Relationship | Mutable argument/Entity relation GUID; durable, host handle for existing, model alias for new | `relations[].from/to`, source relation definitions; endpoints must resolve to the required Argument or Entity kinds and ownership | No |
| Inventory cursor | Host `inventory-UUID`; one consumable pagination position within an exchange | `cursor`/`nextCursor`; stored generator and unchanged filter tuple, not source authority | No |
| Participant | Native contribution metadata ID, commonly owner GUID + `:ai`/`:human`; durable attribution | Inventory filters, ancestry, history and provenance; not a source handle | Needed as the existing participant filter value, not for source authorisation |
| Exchange/tool/provider IDs | Host exchange GUID; provider call/response/conversation IDs; host trail IDs | Envelope equality, call/result correlation, receipts, continuity; never native source authority | Not native object GUIDs; keep existing contracts |
| Media/resources | Native Block/resource GUIDs and managed-asset identities exist outside current DCP constructors | Unsupported native views may be described with native type and omissions; assets are deferred. No DCP media reference authoring currently exists | Do not infer an authoring capability from a visible native identity |

The ambiguous vocabulary matters: `id` can declare a Block, source range, generated passage, position, classification or semantic object. `target` means a native `ReplyTarget` in source results but an alias/reference in generated Glosses and interpretations. `ref` names an Entity, not an arbitrary source. Relationship `from/to` names semantic endpoints, whereas range `from/to` names XML boundaries. In particular, `<annotation id>` creates a **generated passage anchor**, not a reference to an existing anchor. This explains the quotation trial's duplicate declarations.

## Alternatives and decision

| Approach | Reliability and overhead | Implementation/compatibility | Validation, repair and future media |
| --- | --- | --- | --- |
| A: instructions/examples only | Accepted quotation correction works, but repeated alias errors were observed. No structural help; repeated prose costs context. | Smallest; no wire changes | Existing rejection/repair stays intact; more types increase vocabulary pressure |
| B: typed local names in existing maps | Makes existing/generated roles visible and shortens repeated handles. Reliability benefit needs live qualification; prefixes alone cannot establish authority. | Small formatting/validation refinement; no new resolver or persistent identities | Existing maps, native checks and single repair remain authoritative; add a small prefix for an actually admitted future resource kind |
| C: typed reference objects/renamed fields | Could encode source/generated/endpoint distinctions more fully; increases JSON and schema overhead | Broad form would migrate every reference consumer, examples and provider schemas; outside this approval | Stronger structural discrimination, but still needs native ownership/revision checks; risks speculative media framework |

Proceed with B and selective C: typed generated-ID constraints in the existing provider schema, role checks for those prefixes in existing declaration validation, and a clearer identity repair diagnostic. No field renaming, reference objects, new repair loop or protocol/profile migration.

Existing handles will be `src:<exchange-tag>:b1` (Block), `c1` (contribution), `r1` (range), `e1` (Entity), `g1` (Gloss), `arg1` (argument), `ar1`/`er1` (argument/Entity relation). The tag is a compact encoding of 128 random bits per `DcpSources`; counters are monotonic within that instance. Use the existing reverse map to return the same handle repeatedly. A bare `b1` or ordinal-derived `c26` would be unsafe: remembered names could silently bind to a different object in a later exchange. The tag avoids that reuse with the same random-uniqueness assumption as the current UUID handles. It is a scope discriminator, not an authorisation token; only map membership and the existing native checks authorise use. Contributions retain their separate ordinal metadata.

Generated declarations use `new:b1` (composition Block), `new:r1` (original-source anchor), `new:s1` (generated passage), `new:pos1` (XML boundary), `new:m1` (interpretation), `new:e1`, `new:g1`, `new:arg1`, `new:rel1`. The model chooses positive-number suffixes; all declarations remain response-wide unique. Provider output schemas request these names. Host preparation retains legacy unprefixed aliases for existing callers, while reserving `src:` against model declaration and validating the role of every `new:` declaration. References still resolve through actual typed native targets, not through trusting prefixes. Historical committed native data and provenance are not rewritten.

Revision UUIDs, native GUIDs in inspection results, participant IDs and pagination cursors remain unchanged. Hiding all native identifiers or shortening every diagnostic ID is unnecessary for this correction and would expand the compatibility surface. Model authoring uses issued handles; native GUIDs remain available when the user asks to inspect them.

## Exact ranges and future composition

A straightforward quoted source needs one new source-range alias, reused by its dependent references. Its reproduced composition text is ordinary text; styling does not need another alias. The host already allocates the actual range definition and standoff-property identities. Keep the required composition ID for compatibility; removing it or nesting anonymous source selectors into every reference would be a schema redesign and could duplicate range definitions.

Existing and new Surfaces would use existing-Block and new-composition prefixes with explicit native type/capability metadata. They do not need a Surface-specific identity system. Managed image/video resources are different from their presenting Blocks; a future admitted resource reference should get its own host-issued kind through the same exchange mapping. Text range, Entity and relationship identities stay distinct. No asset adapter, Surface Markdown fallback, notices/activity controls or task-expectation implementation is included here.

Implementation and qualification results are recorded in the [identity qualification report](DCP_IDENTITY_QUALIFICATION.md), including comparison with the accepted baseline and the limits of this evidence.
