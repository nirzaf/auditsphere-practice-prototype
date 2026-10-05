-- Cloud full-stack v2 schema (additive).
-- Adds the hybrid entity/document model that lets D1 become the authoritative
-- store for structured workspace state without normalising every prototype
-- TypeScript interface into its own table.
--
-- Existing v1 tables (demo_seeds, demo_workspaces, demo_creation_limits) are
-- left untouched so the legacy snapshot API keeps working during migration.
-- Binary bytes never live here; they live in R2 and are referenced by file_objects.

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  seed_id TEXT REFERENCES demo_seeds(id),
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS workspaces_expiry_idx ON workspaces(expires_at);
CREATE INDEX IF NOT EXISTS workspaces_status_idx ON workspaces(status, expires_at);
CREATE INDEX IF NOT EXISTS workspaces_seed_idx ON workspaces(seed_id);

CREATE TABLE IF NOT EXISTS workspace_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'cloud' CHECK (mode IN ('cloud', 'demo')),
  actor_user_id TEXT,
  actor_role TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON workspace_sessions(token_hash);
CREATE INDEX IF NOT EXISTS sessions_workspace_idx ON workspace_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON workspace_sessions(expires_at);

CREATE TABLE IF NOT EXISTS workspace_root_documents (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, document_key)
);

CREATE TABLE IF NOT EXISTS workspace_entities (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  client_id TEXT,
  engagement_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY (workspace_id, entity_kind, entity_id)
);
CREATE INDEX IF NOT EXISTS entities_kind_idx ON workspace_entities(workspace_id, entity_kind);
CREATE INDEX IF NOT EXISTS entities_client_idx ON workspace_entities(workspace_id, client_id);
CREATE INDEX IF NOT EXISTS entities_engagement_idx ON workspace_entities(workspace_id, engagement_id);

CREATE TABLE IF NOT EXISTS file_objects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id TEXT,
  engagement_id TEXT,
  category TEXT NOT NULL,
  logical_record_type TEXT,
  logical_record_id TEXT,
  r2_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  state TEXT NOT NULL DEFAULT 'INITIALIZED'
    CHECK (state IN ('INITIALIZED', 'UPLOADING', 'STAGED', 'VERIFIED', 'COMMITTED')),
  immutable INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  committed_at INTEGER,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS files_r2_key_idx ON file_objects(r2_key);
CREATE INDEX IF NOT EXISTS files_workspace_idx ON file_objects(workspace_id, state);
CREATE INDEX IF NOT EXISTS files_logical_idx ON file_objects(workspace_id, logical_record_type, logical_record_id);
CREATE INDEX IF NOT EXISTS files_client_idx ON file_objects(workspace_id, client_id);
CREATE INDEX IF NOT EXISTS files_engagement_idx ON file_objects(workspace_id, engagement_id);
CREATE INDEX IF NOT EXISTS files_staged_idx ON file_objects(state, created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  actor_user_id TEXT,
  actor_role TEXT,
  command_type TEXT NOT NULL,
  entity_kind TEXT,
  entity_id TEXT,
  client_id TEXT,
  engagement_id TEXT,
  before_version INTEGER,
  after_version INTEGER,
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_sequence_idx ON audit_events(workspace_id, sequence);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events(workspace_id, entity_kind, entity_id);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idempotency_expiry_idx ON idempotency_keys(expires_at);
