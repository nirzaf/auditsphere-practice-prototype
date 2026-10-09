CREATE UNIQUE INDEX IF NOT EXISTS contacts_workspace_client_contact_idx
  ON contacts(workspace_id,client_id,id);

CREATE TABLE IF NOT EXISTS manual_dispatch_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose='PROPOSAL'),
  channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP','HAND_DELIVERY')),
  proposal_version_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  contact_name_snapshot TEXT NOT NULL CHECK (length(trim(contact_name_snapshot)) BETWEEN 1 AND 200),
  recipient_phone_snapshot TEXT CHECK (recipient_phone_snapshot IS NULL OR length(recipient_phone_snapshot)<=40),
  file_version_id TEXT NOT NULL,
  evidence_file_version_id TEXT,
  sent_at TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note)<=2000),
  recorded_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,client_id,contact_id) REFERENCES contacts(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,recorded_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,proposal_version_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);

CREATE INDEX IF NOT EXISTS manual_dispatch_records_proposal_idx
  ON manual_dispatch_records(workspace_id,proposal_version_id,created_at,id);

CREATE TRIGGER IF NOT EXISTS manual_dispatch_records_no_update BEFORE UPDATE ON manual_dispatch_records
  BEGIN SELECT RAISE(ABORT, 'manual dispatch records are append-only'); END;
CREATE TRIGGER IF NOT EXISTS manual_dispatch_records_no_delete BEFORE DELETE ON manual_dispatch_records
  BEGIN SELECT RAISE(ABORT, 'manual dispatch records are append-only'); END;

UPDATE application_schema_version SET version=50, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;
