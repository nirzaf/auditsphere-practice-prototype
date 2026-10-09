CREATE TABLE IF NOT EXISTS client_import_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_file_version_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
  status TEXT NOT NULL CHECK (status IN ('VALIDATED','APPLIED','REJECTED')),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  error_count INTEGER NOT NULL CHECK (error_count >= 0),
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT,
  FOREIGN KEY (workspace_id, source_file_version_id) REFERENCES file_versions(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, created_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, source_sha256)
);
CREATE TABLE IF NOT EXISTS client_import_row_map (
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK (source_row >= 1),
  external_ref TEXT NOT NULL CHECK (length(external_ref) BETWEEN 1 AND 200),
  client_id TEXT,
  contact_id TEXT,
  PRIMARY KEY (workspace_id, run_id, source_row),
  FOREIGN KEY (workspace_id, run_id) REFERENCES client_import_runs(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts(workspace_id, id) ON DELETE RESTRICT
);

UPDATE application_schema_version SET version=53,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;
