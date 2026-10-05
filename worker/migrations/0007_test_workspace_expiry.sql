-- Keep the legacy seven-day lifecycle only for explicitly marked TEST workspaces.
-- BUSINESS workspaces have no expiry column or expiry-sidecar row.
CREATE TABLE IF NOT EXISTS test_workspace_expiry (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

INSERT INTO test_workspace_expiry(workspace_id, expires_at)
SELECT id, expires_at
FROM workspaces
WHERE data_mode = 'TEST';

DROP INDEX IF EXISTS workspaces_expiry_idx;
DROP INDEX IF EXISTS workspaces_status_idx;
ALTER TABLE workspaces DROP COLUMN expires_at;

CREATE INDEX IF NOT EXISTS test_workspace_expiry_due_idx
  ON test_workspace_expiry(expires_at, workspace_id);
CREATE INDEX IF NOT EXISTS workspaces_status_idx
  ON workspaces(status, data_mode);
