-- Explicit user-reviewed identity links. Native Document ownership is unchanged.
CREATE TABLE DocumentEntityAssociation (
 id INTEGER PRIMARY KEY,
 guid TEXT NOT NULL UNIQUE,
 sourceResourceGuid TEXT NOT NULL,
 sourceEntityGuid TEXT NOT NULL,
 entityGuid TEXT NOT NULL REFERENCES Entity(guid),
 sourceFingerprint TEXT NOT NULL,
 attributes TEXT NOT NULL CHECK(json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT,
 lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 UNIQUE(sourceResourceGuid,sourceEntityGuid)
) STRICT;
CREATE INDEX IX_DocumentEntityAssociation_Entity ON DocumentEntityAssociation(entityGuid);
