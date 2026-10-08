-- Short-lived, single-use capabilities allow the browser's native download
-- manager to stream sealed archives without materializing a JavaScript Blob.
CREATE TABLE IF NOT EXISTS archive_download_tickets (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  token_sha256 TEXT NOT NULL CHECK (length(token_sha256)=64),
  engagement_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_persona TEXT NOT NULL CHECK (actor_persona IN ('REVIEWER','APPROVER')),
  actor_staff_grade TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (token_sha256),
  FOREIGN KEY (workspace_id,engagement_id) REFERENCES engagements(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS archive_download_tickets_expiry_idx
  ON archive_download_tickets(expires_at);

CREATE TABLE IF NOT EXISTS archive_download_ticket_uses (
  workspace_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  used_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id,ticket_id),
  FOREIGN KEY (workspace_id,ticket_id) REFERENCES archive_download_tickets(workspace_id,id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS archive_download_tickets_no_update
BEFORE UPDATE ON archive_download_tickets
BEGIN SELECT RAISE(ABORT,'archive download tickets are append only'); END;
CREATE TRIGGER IF NOT EXISTS archive_download_tickets_no_delete
BEFORE DELETE ON archive_download_tickets
BEGIN SELECT RAISE(ABORT,'archive download tickets are append only'); END;
CREATE TRIGGER IF NOT EXISTS archive_download_ticket_uses_no_update
BEFORE UPDATE ON archive_download_ticket_uses
BEGIN SELECT RAISE(ABORT,'archive download ticket uses are append only'); END;
CREATE TRIGGER IF NOT EXISTS archive_download_ticket_uses_no_delete
BEFORE DELETE ON archive_download_ticket_uses
BEGIN SELECT RAISE(ABORT,'archive download ticket uses are append only'); END;

UPDATE application_schema_version
SET version=42, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton=1;
