-- Persist verification metadata without storing test output or business data.
CREATE TABLE verification_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  source_commit TEXT NOT NULL CHECK (length(source_commit) BETWEEN 7 AND 64 AND source_commit NOT GLOB '*[^a-fA-F0-9]*'),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  environment TEXT NOT NULL CHECK (length(trim(environment)) BETWEEN 1 AND 80),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('PASSED', 'FAILED', 'NOT_RUN')),
  results_file_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT,
  updated_by_actor_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, created_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, updated_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, results_file_id) REFERENCES file_versions(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  CHECK (
    (status = 'NOT_RUN' AND completed_at IS NULL)
    OR (status IN ('PASSED', 'FAILED') AND completed_at IS NOT NULL AND completed_at >= started_at)
  )
);

CREATE INDEX verification_runs_workspace_started_idx
  ON verification_runs(workspace_id, started_at DESC);
CREATE INDEX verification_runs_environment_started_idx
  ON verification_runs(environment, started_at DESC);

-- A started run can be finalized once; final verification metadata is immutable.
CREATE TRIGGER verification_runs_update_guard
BEFORE UPDATE ON verification_runs
WHEN OLD.status <> 'NOT_RUN'
  OR NEW.id IS NOT OLD.id
  OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.source_commit IS NOT OLD.source_commit
  OR NEW.schema_version IS NOT OLD.schema_version
  OR NEW.environment IS NOT OLD.environment
  OR NEW.started_at IS NOT OLD.started_at
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.created_by_actor_id IS NOT OLD.created_by_actor_id
  OR NEW.status NOT IN ('PASSED', 'FAILED')
  OR NEW.completed_at IS NULL
  OR NEW.completed_at < NEW.started_at
  OR (OLD.results_file_id IS NOT NULL AND NEW.results_file_id IS NOT OLD.results_file_id)
  OR NEW.version <> OLD.version + 1
BEGIN SELECT RAISE(ABORT, 'verification run metadata is immutable'); END;

CREATE TRIGGER verification_runs_no_delete
BEFORE DELETE ON verification_runs
BEGIN SELECT RAISE(ABORT, 'verification runs cannot be deleted'); END;

UPDATE application_schema_version
SET version = 33,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
