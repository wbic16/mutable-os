# Feature Brief: Dialectic Semantics Workspace, Entity Enrichment & Shared Authority Cache

**Project:** Mutable OS — Dialectic  
**Audience:** Astra  
**Status:** Feature proposal for qualification and implementation  
**Scope:** Conversation UI, DCP semantic authoring, Document Entities, external authority resolution, shared SQLite cache

## 1. Objective

Replace Dialectic's rudimentary semantic inspection interface with a proper **Semantics Workspace** that enables users to explore and manage the Entities, Relationships, Arguments, and Claims produced during conversations.

Extend DCP so AI Agents can provide useful descriptive metadata for Entities, and introduce a reusable SQLite-backed cache for metadata obtained from external authorities such as Wikidata.

The intended result is a coherent workflow:

1. An Agent introduces an Entity in a Contribution.
2. Dialectic admits the Entity into the Document's semantic model.
3. The Entity appears in the Semantics Workspace with available descriptive information.
4. Mutable resolves the Entity against existing canonical Mutable Entities and, where necessary, external authorities.
5. Externally retrieved metadata is cached for reuse across Documents and applications.
6. Verified associations with canonical Mutable Entities are retained and reused in subsequent conversations.

**The Document remains the authoritative source for its local semantic objects. SQLite provides reusable external metadata and canonical identity associations.**

Do not create a competing Entity model or duplicate existing Cardex functionality unnecessarily.

---

## 2. Remove the existing semantic inspection column

The current Dialectic interface uses a right-hand column, accessible through the **Context & AI** control, to display information such as:

- Entities created by an Agent.
- Relationships represented by relationship names and raw UUIDs.
- Arguments and their source passages.
- Contextual inspection and reply controls.

This presentation is inadequate for navigating or managing substantial semantic output.

### Required changes

Remove the existing right-column presentation of Entity, Relationship, Argument, and Claim collections.

These collections will move into the new Semantics Workspace.

Do not indiscriminately remove the Context & AI functionality. Investigate its existing responsibilities and preserve unrelated context configuration, AI settings, and controls.

Also preserve contextual operations currently exposed through the inspector, including:

- Reply to Argument.
- Reply to selected Block or text range.
- Reattach an Argument to a selection.
- Inspect an Argument's source passage.
- Create a Gloss on a passage.

These operations should remain accessible through appropriate contextual menus, selection controls, or object-detail interfaces.

Avoid replacing the existing inspection column with another permanently visible semantic sidebar.

**Acceptance criterion:** The right-hand semantic dump is removed without losing existing interaction capabilities.

---

## 3. Conversation sub-tabs

Extend Dialectic's existing Conversation tab architecture to support user-manageable sub-tabs.

The initial default sub-tabs should be:

1. **Conversation** — the existing conversational Document and contribution composer.
2. **Media** — media associated with the conversation.
3. **Attachments** — attached resources and their management.
4. **Semantics** — the new semantic management workspace.

Users should be able to create, rename, reorder, and remove additional sub-tabs where supported by the underlying tab model.

Preserve the existing Conversation content and its behaviour. This feature is a workspace reorganisation, not a replacement of the editor.

### JSX layout guidance

The following templates are conceptual. Adapt them to Mutable's existing components, state management, tab infrastructure, and design system.

```jsx
function DialecticConversationWorkspace({ conversation }) {
  const tabs = useConversationSubTabs(conversation.id);

  return (
    <ConversationWorkspace>
      <SubTabBar
        tabs={tabs}
        defaultTabs={[
          "Conversation",
          "Media",
          "Attachments",
          "Semantics"
        ]}
        onAdd={tabs.add}
        onRename={tabs.rename}
        onReorder={tabs.reorder}
        onRemove={tabs.remove}
      />

      <SubTabContent>
        {tabs.active.type === "conversation" && (
          <ConversationEditor conversation={conversation} />
        )}

        {tabs.active.type === "media" && (
          <ConversationMedia conversation={conversation} />
        )}

        {tabs.active.type === "attachments" && (
          <ConversationAttachments conversation={conversation} />
        )}

        {tabs.active.type === "semantics" && (
          <SemanticsWorkspace document={conversation.document} />
        )}

        {tabs.active.type === "custom" && (
          <CustomConversationTab tab={tabs.active} />
        )}
      </SubTabContent>
    </ConversationWorkspace>
  );
}
```

### Behaviour

- Persist sub-tab configuration using the existing workspace/tab persistence mechanism where possible.
- Preserve scroll position and local UI state when switching tabs.
- Avoid unnecessarily remounting the Conversation editor.
- Do not duplicate the Conversation Document to implement sub-tabs.
- Preserve existing contribution immutability rules.
- Ensure semantic updates remain visible after admission, save, reload, and tab switching.

Astra should reconcile this feature with the existing multi-tab Conversation work rather than introduce a parallel tab system.

---

## 4. Semantics Workspace

The new **Semantics** sub-tab should contain two principal sections:

- **Entities**
- **Arguments**

Relationships belong under Entities. Claims belong under Arguments.

Glosses are already handled by Gloss Mode and should not receive a duplicate management interface here.

The workspace should default to showing semantic objects belonging to the current Document.

### Layout

```jsx
function SemanticsWorkspace({ document }) {
  const [section, setSection] = useState("entities");

  const summary = useDocumentSemanticSummary(document.id);

  return (
    <Workspace>
      <WorkspaceHeader
        title="Semantics"
        subtitle="Semantic objects in this conversation"
      />

      <SemanticSummary
        entities={summary.entityCount}
        relationships={summary.relationshipCount}
        arguments={summary.argumentCount}
        claims={summary.claimCount}
      />

      <SegmentedNavigation
        value={section}
        options={["entities", "arguments"]}
        onChange={setSection}
      />

      {section === "entities" && (
        <EntityWorkspace document={document} />
      )}

      {section === "arguments" && (
        <ArgumentWorkspace document={document} />
      )}
    </Workspace>
  );
}
```

Counts must be derived from actual Document records. Do not treat the Agent's reported counts as authoritative.

### 4.1 Entity Workspace

Provide three representations:

**List view**

A searchable, sortable list of Document Entities, with:

- Thumbnail.
- Canonical name.
- Primary type.
- Subtypes.
- Significant dates, where available.
- Number of mentions.
- Number of relationships.
- Canonical association status.

**Detail view**

Selecting an Entity should display:

- Name and aliases.
- Thumbnail or representative image.
- Description.
- Type and subtypes.
- Significant dates.
- Relationships with other Entities.
- Mentions within the Document.
- Associated Claims, where present.
- External authority identifiers.
- Canonical Mutable Entity association.
- Provenance and enrichment status.

**Graph view**

A navigable graph of Document Entities and their Relationships.

Nodes represent Entities. Edges represent typed Relationships.

Clicking a node selects an Entity; clicking an edge reveals the Relationship and its endpoints.

Use readable names rather than UUIDs.

#### JSX guidance

```jsx
function EntityWorkspace({ document }) {
  const entities = useDocumentEntities(document.id);
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);

  return (
    <EntityWorkspaceLayout>
      <Toolbar>
        <EntitySearch />
        <EntityFilters />
        <ViewSwitcher
          value={view}
          options={["list", "detail", "graph"]}
          onChange={setView}
        />
      </Toolbar>

      {view === "list" && (
        <EntityList
          entities={entities}
          onSelect={setSelectedId}
        />
      )}

      {view === "detail" && (
        <EntityDetail
          entity={entities.byId(selectedId)}
          onShowMentions={navigateToMentions}
          onOpenCardex={openCanonicalEntity}
          onResolve={resolveEntityIdentity}
        />
      )}

      {view === "graph" && (
        <EntityGraph
          nodes={entities}
          edges={useDocumentRelationships(document.id)}
          onNodeSelect={setSelectedId}
          onEdgeSelect={inspectRelationship}
        />
      )}
    </EntityWorkspaceLayout>
  );
}
```

The graph should be built from actual DCP Relationship records, not inferred merely from the co-occurrence of Entity mentions.

### 4.2 Relationships

Relationships should appear within Entity details and the graph.

Display relationships in human-readable form:

> Ludovico Sforza — patron of → Leonardo da Vinci

Never present raw UUIDs as the primary user-facing representation.

Preserve relationship direction, type, provenance, and references to the underlying semantic records.

Support navigation from either endpoint.

If existing Mutable relationship editing facilities can be reused, integrate them rather than building a separate editor.

### 4.3 Arguments Workspace

Provide:

**List view**

A navigable list of Arguments and associated Claims, displaying:

- Argument or Claim summary.
- Author or Agent.
- Source Contribution.
- Anchored text passage.
- Supporting or opposing relationships, where recorded.
- Number of replies or objections, where available.

**Diagram view**

A structured visualisation of argumentation.

Represent:

- Claims.
- Supporting evidence.
- Objections.
- Counterarguments.
- Replies.
- Other DCP-supported argumentative relationships.

The diagram must faithfully represent the existing DCP semantic model.

Do not manufacture argumentative connections from textual similarity.

An isolated Claim or Argument should remain visible even if it has no connected supporting or opposing records.

#### JSX guidance

```jsx
function ArgumentWorkspace({ document }) {
  const arguments = useDocumentArguments(document.id);
  const claims = useDocumentClaims(document.id);
  const [view, setView] = useState("list");

  return (
    <ArgumentWorkspaceLayout>
      <Toolbar>
        <ArgumentSearch />
        <ViewSwitcher
          value={view}
          options={["list", "diagram"]}
          onChange={setView}
        />
      </Toolbar>

      {view === "list" && (
        <ArgumentList
          arguments={arguments}
          claims={claims}
          onSelect={inspectArgument}
          onNavigate={navigateToArgumentSource}
        />
      )}

      {view === "diagram" && (
        <ArgumentDiagram
          arguments={arguments}
          claims={claims}
          connections={deriveExplicitArgumentConnections(
            document
          )}
        />
      )}
    </ArgumentWorkspaceLayout>
  );
}
```

Astra should inspect the existing Argument, Claim, and anchoring models before choosing a diagram library or representation.

### 4.4 Navigation

Semantic objects must remain connected to their source passages.

Provide:

- Show Entity mentions in Conversation.
- Navigate to an Argument's source.
- Highlight relevant text ranges.
- Return to the previous semantic selection.
- Preserve reading position where possible.

Avoid requiring users to repeatedly scroll through long conversations to locate referenced passages.

---

## 5. Enriched DCP Entity definitions

Extend DCP's Entity authoring capabilities so Agents can return richer descriptive information.

### Desired metadata

An Entity may include:

| Property | Description |
|---|---|
| Name | Canonical or preferred display name |
| Description | Concise explanatory description |
| Type | Primary Entity classification, e.g. Person |
| Subtypes | Multiple classifications, e.g. Artist, Engineer |
| Thumbnail | Representative image URL, where reliably known |
| Dates | Significant typed dates or periods |
| Aliases | Alternative names |
| External identifiers | Wikidata QID, GND ID, etc. |

All metadata beyond the Entity's required identity fields should remain optional.

The Agent should be encouraged to supply useful metadata without fabricating unknown facts.

### Illustrative DCP XML

This is conceptual XML, not a prescribed schema. Astra must adapt it to the existing DCP vocabulary and authoring pipeline.

```xml
<entity
  id="leonardo"
  name="Leonardo da Vinci"
  type="Person"
  subtypes="Artist, Engineer, Inventor"
  wikidata="Q762">

  <description>
    Italian Renaissance artist, engineer and inventor.
  </description>

  <date type="birth" value="1452-04-15"/>
  <date type="death" value="1519-05-02"/>

  <alias>Leonardo</alias>
</entity>
```

Do not require the Agent to produce every field.

Preserve Mutable's existing Time model, including precision, approximation, and temporal ranges.

Where appropriate, map factual metadata into existing Claim/Time structures instead of creating competing representations.

### Incremental enrichment

An Entity may initially be introduced with only a name and type.

Later Contributions may provide additional descriptions, dates, classifications, or identifiers.

These additions should enrich the existing Document Entity rather than creating duplicates.

Preserve provenance, and do not overwrite conflicting facts silently.

### Agent guidance

Update DCP instructions to encourage:

1. Proactive Entity identification and annotation.
2. Reuse of previously established Document Entities.
3. Concise descriptions and useful classifications.
4. Significant dates where known.
5. External authority identifiers when confidently known.
6. Avoidance of invented image URLs, identifiers, or dates.

Do not make DCP authoring substantially more verbose or expensive.

Prefer optional, compact metadata and reusable definitions.

---

## 6. Shared external Authority Cache

Introduce a reusable SQLite-backed cache for externally retrieved metadata.

This cache is intended for **all Mutable applications**, not exclusively Dialectic.

Its principal purpose is to avoid repeated requests to services such as Wikidata when multiple Documents or Agents encounter the same Entity.

### Important distinction

The cache is **not primarily intended to store metadata authored by the AI Agent**.

Agent-authored descriptions, classifications, and other semantic information belong to the Document's semantic records.

The shared cache stores:

- Metadata retrieved from external authorities.
- Authority identifiers and aliases.
- Representative images and relevant metadata.
- Lookup timestamps and freshness information.
- Verified associations between authority identities and canonical Mutable Entities.

### 6.1 Generic cache table

Investigate existing persistence infrastructure before introducing a new table.

If no suitable shared cache exists, a minimal starting point is:

```sql
CREATE TABLE Cache (
    Key TEXT PRIMARY KEY,
    Value TEXT NOT NULL,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL,
    ExpiresAt TEXT
);
```

The `Value` column contains versioned JSON.

Possible keys:

```text
authority/wikidata/Q762
authority/gnd/118613723
authority-search/wikidata/leonardo-da-vinci
```

The cache should not be limited to Wikidata or Entities.

Other Mutable services may eventually use it for external enrichment results.

Provide a shared cache service with operations conceptually equivalent to:

```ts
interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(
    key: string,
    value: T,
    options?: { ttl?: number }
  ): Promise<void>;
  invalidate(key: string): Promise<void>;
}
```

Use the existing backend/service architecture rather than exposing raw SQLite access directly to application components.

### 6.2 Example cached authority record

```json
{
  "schemaVersion": 1,
  "authority": "wikidata",
  "externalId": "Q762",
  "name": "Leonardo da Vinci",
  "description": "Italian polymath and artist",
  "type": "Person",
  "subtypes": [
    "Artist",
    "Engineer",
    "Inventor"
  ],
  "dates": {
    "birth": "1452-04-15",
    "death": "1519-05-02"
  },
  "thumbnail": {
    "url": null,
    "source": "Wikimedia Commons"
  },
  "fetchedAt": "2026-11-16T00:00:00Z"
}
```

The example is illustrative. The actual schema should preserve authority-specific data, temporal precision, and provenance where appropriate.

### 6.3 Cache-first authority resolution

Conceptual pseudocode:

```ts
async function resolveAuthorityEntity(candidate) {
  // An existing verified canonical association wins.
  const canonical = await findVerifiedCanonicalMapping(
    candidate
  );

  if (canonical) {
    return canonical;
  }

  // Prefer a previously verified external identity.
  const cached = await authorityCache.find(candidate);

  if (cached && cached.isUsable) {
    return cached;
  }

  // Only consult external services when necessary.
  const external = await authorityResolver.lookup(candidate);

  if (!external) {
    return unresolved(candidate);
  }

  const verified = await verifyIdentity(
    candidate,
    external
  );

  if (!verified.accepted) {
    return ambiguous(candidate, external);
  }

  await authorityCache.store(verified.entity);

  return verified.entity;
}
```

Do not treat a syntactically valid QID as proof of identity.

Verify that the external record refers to the intended Entity, using its label, aliases, description, type, and available context.

An Agent-supplied QID is a candidate, not an authoritative assertion.

### 6.4 Canonical Mutable Entity mappings

This is an especially important requirement.

Once an external identity has been confidently associated with a canonical Mutable Entity, subsequent Agents should be able to reuse that association automatically.

For example:

```text
authority/wikidata/Q762
        ↓
Mutable Entity: <canonical-entity-uuid>
```

The association should be reusable across Documents and applications.

However, do not bury the mapping inside an opaque JSON value without considering consistency.

A mapping must remain valid when a canonical Entity is renamed, merged, deleted, or otherwise changed.

Astra should evaluate whether mappings belong in:

1. Existing canonical Entity identifier fields or relationship tables.
2. A dedicated indexed mapping table.
3. A structured cache record, with appropriate validation and invalidation.

**Prefer the existing canonical Entity model if it already supports external authority identifiers.**

A separate mapping table may be preferable to a generic cache entry if referential integrity or efficient reverse lookup is required.

The generic Cache table can still hold the externally retrieved metadata.

### 6.5 Mapping lifecycle

Conceptual pseudocode:

```ts
async function admitDocumentEntity(document, agentEntity) {
  const local = await document.findOrCreateEntity(agentEntity);

  // Preserve Agent-authored metadata in the Document.
  await local.mergeAgentMetadata(agentEntity);

  const identity = await entityResolver.resolve({
    name: agentEntity.name,
    type: agentEntity.type,
    aliases: agentEntity.aliases,
    externalIds: agentEntity.externalIds,
    context: document.context
  });

  if (identity.canonicalEntityId) {
    await local.associateCanonicalEntity(
      identity.canonicalEntityId
    );
  }

  if (identity.authorityMetadata) {
    await local.attachAuthorityMetadataReference(
      identity.authorityMetadata.key
    );
  }

  return local;
}
```

These methods are illustrative. Adapt them to the actual Document and SQLite Entity models.

Avoid replacing a Document Entity with its canonical counterpart. The Document Entity may contain context-specific descriptions, classifications, and provenance.

### 6.6 Cache policies

Implement reasonable defaults for:

- Time-to-live and stale-data handling.
- Refreshing authority metadata.
- Negative caching of failed lookups.
- Deduplicating simultaneous requests.
- Offline operation.
- Authority API failures.
- Image attribution and licensing metadata.
- Cache schema versioning.
- Safe invalidation of canonical mappings.

A stale cached record should remain available for display when appropriate while a refresh is attempted.

Do not allow network failures to prevent a Contribution from being admitted or displayed.

External enrichment should be asynchronous and must not block the main conversational rendering path.

---

## 7. Integration with Cardex and other Mutable applications

The Semantics Workspace is Document-scoped.

Cardex remains the Cavern-wide Entity Management Studio.

Reuse shared components and services wherever practical:

- Entity cards.
- Entity identity resolution.
- Canonical Entity lookup.
- Authority metadata retrieval.
- Image handling.
- Entity classifications.
- Canonical association controls.

A Document Entity may be associated with a canonical Entity without losing its Document-specific identity or metadata.

Do not automatically promote every Agent-generated Entity into the canonical SQLite Entity table.

Do not automatically promote Agent-authored Claims or Relationships into Cavern-wide facts.

External identity resolution and acceptance of factual assertions are distinct operations.

---

## 8. Qualification requirements

Before implementation, Astra should inspect and report on:

1. The current Context & AI inspection-column implementation and the operations that must be preserved.
2. The existing Conversation tab/sub-tab architecture and its persistence.
3. DCP's Entity, Relationship, Claim, Argument, and metadata vocabulary.
4. Document Entity identity and persistence.
5. The existing SQLite Entity schema and any external identifier support.
6. Cardex components that can be reused.
7. Existing cache infrastructure, if any.
8. Existing graph or diagram components suitable for reuse.
9. Existing external authority lookup services, if any.

Do not introduce parallel infrastructure where Mutable already has a suitable abstraction.

### Implementation sequence

**Stage A — UI foundation**

- Remove the semantic inspection dump.
- Integrate Conversation sub-tabs.
- Introduce the Semantics Workspace.
- Implement Entity and Argument list/detail views.
- Preserve existing contextual actions.

**Stage B — Visualisation**

- Entity relationship graph.
- Argument/Claim diagram.
- Source navigation and mention highlighting.

**Stage C — DCP enrichment**

- Extend Entity metadata authoring.
- Admit enriched metadata into existing semantic structures.
- Display metadata in Entity cards and details.

**Stage D — Shared Authority Cache and resolution**

- Implement or reuse the generic cache.
- Integrate Wikidata resolution.
- Cache verified external metadata.
- Reuse verified canonical Mutable Entity associations.
- Handle ambiguous and unresolved identities.

Astra may adjust sequencing where dependencies require it, but should explain material deviations.

---

## 9. Acceptance criteria

The feature is acceptable when:

- [ ] Semantic Entity/Relationship/Argument dumps no longer occupy the current right-hand inspection column.
- [ ] Context & AI functionality unrelated to the dumps remains available.
- [ ] Conversation, Media, Attachments, and Semantics sub-tabs work and persist correctly.
- [ ] The Semantics tab displays actual Document Entities and Arguments.
- [ ] Entity details expose descriptions, classifications, dates, relationships, and provenance when available.
- [ ] Relationship endpoints are displayed by name rather than UUID.
- [ ] Entity graphs reflect actual stored Relationships.
- [ ] Argument diagrams reflect actual stored argumentative connections.
- [ ] Semantic objects can navigate back to their source passages.
- [ ] DCP supports optional enriched Entity metadata.
- [ ] Existing Documents and older DCP contributions remain compatible.
- [ ] Wikidata QIDs are verified rather than blindly trusted.
- [ ] External metadata is cached and reused across Documents.
- [ ] Repeated verified authority lookups avoid unnecessary network requests.
- [ ] Verified canonical Mutable Entity associations can be reused across conversations.
- [ ] Ambiguous matches are not silently merged.
- [ ] External lookup failures do not block conversation rendering.
- [ ] Existing Cardex and canonical Entity behaviour remains intact.

## 10. Design principle

The guiding principle is:

**Dialectic should make semantic information produced by an AI Agent immediately useful, navigable, and reusable—without requiring the user to manage the underlying protocol, identifiers, or database records.**

The Agent contributes semantic interpretation.

The Document preserves that interpretation in context.

The Semantics Workspace makes it accessible.

The Authority Cache avoids redundant external lookups.

The canonical Entity system provides continuity across the Cavern.

These responsibilities should remain distinct, but cooperate seamlessly.
