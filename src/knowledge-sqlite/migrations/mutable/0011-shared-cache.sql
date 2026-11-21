-- Disposable external metadata, deliberately outside the canonical fact ledger.
CREATE TABLE Cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK(json_valid(value)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  expiresAt TEXT
) STRICT;
CREATE INDEX IX_Cache_ExpiresAt ON Cache(expiresAt);
