-- The operator-only first Partner endpoint must be one-time even under a race.
CREATE TABLE IF NOT EXISTS business_bootstrap_lock (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  workspace_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT
);
CREATE TRIGGER IF NOT EXISTS business_bootstrap_lock_no_update BEFORE UPDATE ON business_bootstrap_lock
  BEGIN SELECT RAISE(ABORT, 'business_bootstrap_lock is append-only'); END;
CREATE TRIGGER IF NOT EXISTS business_bootstrap_lock_no_delete BEFORE DELETE ON business_bootstrap_lock
  BEGIN SELECT RAISE(ABORT, 'business_bootstrap_lock is append-only'); END;

UPDATE application_schema_version SET version=48, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;
