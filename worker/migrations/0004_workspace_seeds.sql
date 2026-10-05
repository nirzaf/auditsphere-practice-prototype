-- Current seed storage for the workspace API.
--
-- The seeds used to live in `demo_seeds` (named by the retired snapshot Worker).
-- This migration creates the current `workspace_seeds` table and copies the
-- existing seed rows across, so the runtime reads current naming only. The old
-- tables are intentionally left untouched; dropping them is a separately
-- authorized destructive operation.

CREATE TABLE IF NOT EXISTS workspace_seeds (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO workspace_seeds (id, title, description, state_json, created_at, updated_at)
SELECT id, title, description, state_json,
       COALESCE((SELECT MIN(created_at) FROM workspaces), strftime('%s', 'now') * 1000),
       strftime('%s', 'now') * 1000
FROM demo_seeds
WHERE true
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  state_json = excluded.state_json,
  updated_at = excluded.updated_at;
