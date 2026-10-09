CREATE TABLE IF NOT EXISTS portal_credential_issues (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  contact_route_id TEXT NOT NULL,
  user_account_id TEXT NOT NULL,
  credential_token_id TEXT NOT NULL,
  outbox_job_id TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('ADVANCE_PAYMENT','MANUAL_REISSUE')),
  created_by_actor_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, client_id, engagement_id) REFERENCES engagements(workspace_id, client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, contact_route_id) REFERENCES contact_routes(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, user_account_id) REFERENCES user_accounts(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, credential_token_id) REFERENCES credential_tokens(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, outbox_job_id) REFERENCES outbox_jobs(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_credential_issues_auto_once
  ON portal_credential_issues(workspace_id, engagement_id, contact_route_id) WHERE trigger = 'ADVANCE_PAYMENT';
CREATE INDEX IF NOT EXISTS portal_credential_issues_engagement_idx
  ON portal_credential_issues(workspace_id, engagement_id, created_at, id);
CREATE TRIGGER IF NOT EXISTS portal_credential_issues_no_update BEFORE UPDATE ON portal_credential_issues
  BEGIN SELECT RAISE(ABORT, 'portal_credential_issues are append-only'); END;
CREATE TRIGGER IF NOT EXISTS portal_credential_issues_no_delete BEFORE DELETE ON portal_credential_issues
  BEGIN SELECT RAISE(ABORT, 'portal_credential_issues are append-only'); END;

UPDATE application_schema_version SET version=47, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;
