-- Explicit installed-schema marker used by readiness and migration status.
CREATE TABLE IF NOT EXISTS application_schema_version (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TEXT NOT NULL
);

INSERT INTO application_schema_version(singleton, version, updated_at)
VALUES (1, 27, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(singleton) DO UPDATE SET
  version = excluded.version,
  updated_at = excluded.updated_at;
