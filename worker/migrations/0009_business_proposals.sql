-- Versioned commercial content and truthful document/provider outcomes.
-- Drafts and approvals are normalized; proposal revisions and decision history
-- are append-only and never reused after a commercial change.

CREATE TABLE IF NOT EXISTS firm_profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  legal_name TEXT NOT NULL CHECK (length(trim(legal_name)) BETWEEN 1 AND 250),
  registration_number TEXT NOT NULL CHECK (length(trim(registration_number)) BETWEEN 1 AND 200),
  address TEXT NOT NULL CHECK (length(trim(address)) BETWEEN 1 AND 1000),
  profile_text TEXT NOT NULL CHECK (length(trim(profile_text)) BETWEEN 10 AND 10000),
  methodology_text TEXT NOT NULL CHECK (length(trim(methodology_text)) BETWEEN 10 AND 20000),
  logo_file_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  updated_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,logo_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,updated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id)
);

CREATE TABLE IF NOT EXISTS team_cv_documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  staff_member_id TEXT NOT NULL,
  file_version_id TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
  approved_by_actor_id TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,staff_member_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,staff_member_id,file_version_id),
  CHECK ((approved=0 AND approved_by_actor_id IS NULL AND approved_at IS NULL)
      OR (approved=1 AND approved_by_actor_id IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS team_cv_staff_approved_idx ON team_cv_documents(workspace_id,staff_member_id,approved);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  current_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  updated_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,current_version_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,updated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id)
);

CREATE TABLE IF NOT EXISTS proposal_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  mode TEXT NOT NULL CHECK (mode IN ('QUOTE','FULL_PROPOSAL')),
  scope TEXT NOT NULL CHECK (length(trim(scope)) BETWEEN 10 AND 10000),
  fee_minor INTEGER NOT NULL CHECK (fee_minor BETWEEN 0 AND 9007199254740991),
  currency TEXT NOT NULL CHECK (currency='QAR'),
  advance_bps INTEGER NOT NULL DEFAULT 5000 CHECK (advance_bps=5000),
  final_bps INTEGER NOT NULL DEFAULT 5000 CHECK (final_bps=5000),
  valid_until TEXT NOT NULL,
  timeline_json TEXT NOT NULL CHECK (json_valid(timeline_json) AND length(timeline_json)<=20000),
  firm_profile_snapshot_json TEXT NOT NULL CHECK (json_valid(firm_profile_snapshot_json) AND length(firm_profile_snapshot_json)<=30000),
  team_cv_file_ids_json TEXT NOT NULL CHECK (json_valid(team_cv_file_ids_json) AND length(team_cv_file_ids_json)<=10000),
  methodology_version TEXT NOT NULL CHECK (length(trim(methodology_version)) BETWEEN 1 AND 200),
  firm_profile_version INTEGER NOT NULL CHECK (firm_profile_version > 0),
  created_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,proposal_id) REFERENCES proposals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,proposal_id,revision)
);
CREATE INDEX IF NOT EXISTS proposal_versions_engagement_idx ON proposal_versions(workspace_id,engagement_id,revision DESC);
CREATE TRIGGER IF NOT EXISTS proposal_versions_no_update BEFORE UPDATE ON proposal_versions
BEGIN SELECT RAISE(ABORT, 'proposal versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS proposal_versions_no_delete BEFORE DELETE ON proposal_versions
BEGIN SELECT RAISE(ABORT, 'proposal versions are append only'); END;

CREATE TABLE IF NOT EXISTS proposal_approvals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  proposal_version_id TEXT NOT NULL,
  approval_decision_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE','REJECT')),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  decided_by_actor_id TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,proposal_version_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approval_decision_id) REFERENCES approval_decisions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,decided_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,approval_decision_id)
);
CREATE INDEX IF NOT EXISTS proposal_approvals_current_idx ON proposal_approvals(workspace_id,proposal_version_id,decided_at DESC);
CREATE TRIGGER IF NOT EXISTS proposal_approvals_no_update BEFORE UPDATE ON proposal_approvals
BEGIN SELECT RAISE(ABORT, 'proposal approvals are append only'); END;
CREATE TRIGGER IF NOT EXISTS proposal_approvals_no_delete BEFORE DELETE ON proposal_approvals
BEGIN SELECT RAISE(ABORT, 'proposal approvals are append only'); END;

CREATE TABLE IF NOT EXISTS generated_artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('QUOTE','FULL_PROPOSAL','ENGAGEMENT_LETTER','INVOICE','RECEIPT','REPORT','MANAGEMENT_LETTER','REPRESENTATION','RELEASE_BUNDLE','ARCHIVE')),
  source_entity_type TEXT NOT NULL CHECK (length(trim(source_entity_type)) BETWEEN 1 AND 120),
  source_entity_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK (source_revision > 0),
  file_version_id TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 9007199254740991),
  generated_at TEXT NOT NULL,
  generated_by_job_id TEXT,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,generated_by_job_id) REFERENCES outbox_jobs(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,source_entity_type,source_entity_id,source_revision,artifact_kind)
);
CREATE TRIGGER IF NOT EXISTS generated_artifacts_require_committed_file
BEFORE INSERT ON generated_artifacts
WHEN NOT EXISTS (SELECT 1 FROM file_versions f WHERE f.workspace_id=NEW.workspace_id AND f.id=NEW.file_version_id
  AND f.state='COMMITTED' AND f.immutable=1 AND f.sha256=NEW.content_sha256 AND f.size_bytes=NEW.size_bytes)
BEGIN SELECT RAISE(ABORT, 'generated artifacts require an exact committed file version'); END;
CREATE TRIGGER IF NOT EXISTS generated_artifacts_no_update BEFORE UPDATE ON generated_artifacts
BEGIN SELECT RAISE(ABORT, 'generated artifacts are append only'); END;
CREATE TRIGGER IF NOT EXISTS generated_artifacts_no_delete BEFORE DELETE ON generated_artifacts
BEGIN SELECT RAISE(ABORT, 'generated artifacts are append only'); END;

CREATE TABLE IF NOT EXISTS proposal_artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  proposal_version_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,proposal_version_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,proposal_version_id,artifact_id)
);
CREATE TRIGGER IF NOT EXISTS proposal_artifacts_no_update BEFORE UPDATE ON proposal_artifacts
BEGIN SELECT RAISE(ABORT, 'proposal artifact links are append only'); END;
CREATE TRIGGER IF NOT EXISTS proposal_artifacts_no_delete BEFORE DELETE ON proposal_artifacts
BEGIN SELECT RAISE(ABORT, 'proposal artifact links are append only'); END;

CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('PROPOSAL','EL','INVOICE','RECEIPT','PBC','HOLDING_LETTER','BUNDLE')),
  file_version_id TEXT NOT NULL,
  recipient_snapshot_json TEXT NOT NULL CHECK (json_valid(recipient_snapshot_json) AND length(recipient_snapshot_json)<=10000),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','ACCEPTED','DELIVERED','BOUNCED','FAILED','UNKNOWN')),
  provider_message_id TEXT,
  sent_at TEXT,
  deduplication_key TEXT NOT NULL,
  job_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,job_id) REFERENCES outbox_jobs(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,deduplication_key)
);
CREATE INDEX IF NOT EXISTS dispatches_engagement_status_idx ON dispatches(workspace_id,engagement_id,purpose,status);
