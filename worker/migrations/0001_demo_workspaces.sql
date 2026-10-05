CREATE TABLE IF NOT EXISTS demo_seeds (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  state_json TEXT NOT NULL CHECK(json_valid(state_json))
);
CREATE TABLE IF NOT EXISTS demo_workspaces (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  creator_hash TEXT NOT NULL,
  seed_id TEXT NOT NULL REFERENCES demo_seeds(id),
  revision INTEGER NOT NULL DEFAULT 1,
  state_json TEXT NOT NULL CHECK(json_valid(state_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS demo_workspace_expiry ON demo_workspaces(expires_at);
CREATE INDEX IF NOT EXISTS demo_workspace_creator ON demo_workspaces(creator_hash, created_at);
