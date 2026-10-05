-- Additive foundation for the business-mode relational schema.
-- Existing seeded workspaces remain TEST data. New BUSINESS workspaces are
-- permanent and have no expiry gate; application code must not use expires_at
-- to authorize access or schedule their deletion.

ALTER TABLE workspaces ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'TEST'
  CHECK (data_mode IN ('BUSINESS', 'TEST'));
ALTER TABLE workspaces ADD COLUMN currency TEXT NOT NULL DEFAULT 'QAR'
  CHECK (currency = 'QAR');
ALTER TABLE workspaces ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Qatar'
  CHECK (timezone = 'Asia/Qatar');
ALTER TABLE workspaces ADD COLUMN retention_policy_id TEXT;

CREATE TABLE IF NOT EXISTS migration_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_schema_version INTEGER NOT NULL CHECK (source_schema_version >= 0),
  target_schema_version INTEGER NOT NULL CHECK (target_schema_version > source_schema_version),
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
  status TEXT NOT NULL CHECK (status IN ('DRY_RUN', 'VALIDATED', 'APPLIED', 'FAILED')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  target_count INTEGER NOT NULL DEFAULT 0 CHECK (target_count >= 0),
  reconciliation_json TEXT NOT NULL CHECK (json_valid(reconciliation_json)),
  error_code TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS migration_runs_workspace_status_idx
  ON migration_runs(workspace_id, status, started_at);

CREATE TABLE IF NOT EXISTS migration_id_map (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (length(source_kind) BETWEEN 1 AND 120),
  source_id TEXT NOT NULL CHECK (length(source_id) BETWEEN 1 AND 200),
  target_kind TEXT NOT NULL CHECK (length(target_kind) BETWEEN 1 AND 120),
  target_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id, run_id) REFERENCES migration_runs(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, source_kind, source_id, target_kind),
  UNIQUE (workspace_id, target_kind, target_id)
);
CREATE INDEX IF NOT EXISTS migration_id_map_run_idx ON migration_id_map(workspace_id, run_id);

CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  natural_person_key TEXT NOT NULL CHECK (length(trim(natural_person_key)) BETWEEN 1 AND 200),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  email TEXT,
  grade TEXT NOT NULL CHECK (grade IN ('PARTNER', 'MANAGER', 'SENIOR', 'ASSOCIATE')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT,
  updated_by_actor_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, natural_person_key)
);
CREATE INDEX IF NOT EXISTS staff_members_active_grade_idx ON staff_members(workspace_id, active, grade);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  code TEXT NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 200),
  legal_name TEXT NOT NULL CHECK (length(trim(legal_name)) BETWEEN 1 AND 250),
  trading_name TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('HOLDING', 'SUBSIDIARY', 'STANDALONE')),
  parent_client_id TEXT,
  commercial_registration TEXT,
  tax_id TEXT,
  industry TEXT NOT NULL CHECK (length(trim(industry)) BETWEEN 1 AND 200),
  address TEXT NOT NULL CHECK (length(trim(address)) BETWEEN 1 AND 1000),
  country_code TEXT NOT NULL CHECK (country_code GLOB '[A-Z][A-Z]'),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT,
  updated_by_actor_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, parent_client_id) REFERENCES clients(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, code),
  CHECK (parent_client_id IS NULL OR parent_client_id <> id)
);
CREATE INDEX IF NOT EXISTS clients_workspace_active_idx ON clients(workspace_id, active);
CREATE INDEX IF NOT EXISTS clients_parent_idx ON clients(workspace_id, parent_client_id);

CREATE TABLE IF NOT EXISTS client_affiliations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  related_client_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (length(trim(relationship)) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT,
  updated_by_actor_id TEXT,
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, related_client_id) REFERENCES clients(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, client_id, related_client_id, relationship),
  CHECK (client_id <> related_client_id)
);
CREATE INDEX IF NOT EXISTS client_affiliations_related_idx ON client_affiliations(workspace_id, related_client_id);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 200),
  email TEXT,
  phone TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  role TEXT NOT NULL CHECK (role IN ('MD_GM', 'CFO_FINANCE_DIRECTOR', 'CHIEF_ACCOUNTANT_LIAISON', 'OTHER')),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  is_signatory INTEGER NOT NULL DEFAULT 0 CHECK (is_signatory IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT,
  updated_by_actor_id TEXT,
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_one_active_primary_idx
  ON contacts(workspace_id, client_id) WHERE is_primary = 1 AND active = 1;
CREATE INDEX IF NOT EXISTS contacts_client_active_idx ON contacts(workspace_id, client_id, active);

CREATE TABLE IF NOT EXISTS contact_routes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('PROPOSAL', 'EL', 'FINAL_REPORT', 'INVOICE', 'RECEIPT', 'PBC', 'HOLDING_LETTER')),
  contact_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT,
  updated_by_actor_id TEXT,
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, client_id, purpose, contact_id)
);
CREATE INDEX IF NOT EXISTS contact_routes_primary_idx ON contact_routes(workspace_id, client_id, purpose, is_primary);

CREATE TABLE IF NOT EXISTS standards_profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  effective_period_start TEXT NOT NULL,
  effective_period_end TEXT,
  isa_220_edition TEXT NOT NULL,
  isa_570_edition TEXT NOT NULL,
  reporting_framework TEXT NOT NULL,
  presentation_edition TEXT NOT NULL CHECK (presentation_edition IN ('IAS1', 'IFRS18', 'OTHER_APPROVED')),
  early_adoption INTEGER NOT NULL DEFAULT 0 CHECK (early_adoption IN (0, 1)),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  CHECK (effective_period_end IS NULL OR effective_period_end >= effective_period_start)
);

CREATE TABLE IF NOT EXISTS engagements (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 200),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  engagement_type TEXT NOT NULL CHECK (engagement_type IN ('STATUTORY_AUDIT', 'INTERNAL_AUDIT', 'AGREED_UPON_PROCEDURES')),
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('LEAD_INGESTION', 'PROPOSAL_GENERATION', 'DUAL_KEY_PENDING', 'ADVANCE_BILLING', 'PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW', 'PARTNER_APPROVAL', 'DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN', 'ARCHIVED_READ_ONLY')),
  contract_fee_minor INTEGER NOT NULL CHECK (contract_fee_minor >= 0),
  active_proposal_version_id TEXT,
  active_tb_version_id TEXT,
  approved_planning_version_id TEXT,
  report_signed_at TEXT,
  report_date TEXT,
  released_at TEXT,
  archive_due_at TEXT,
  locked_at TEXT,
  portal_frozen_at TEXT,
  standards_profile_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT,
  updated_by_actor_id TEXT,
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, standards_profile_id) REFERENCES standards_profiles(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, code),
  UNIQUE (workspace_id, client_id, id),
  CHECK (period_start <= period_end)
);
CREATE INDEX IF NOT EXISTS engagements_workspace_state_idx ON engagements(workspace_id, lifecycle_state);
CREATE INDEX IF NOT EXISTS engagements_archive_due_idx ON engagements(lifecycle_state, archive_due_at);
CREATE INDEX IF NOT EXISTS engagements_client_period_idx ON engagements(workspace_id, client_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT,
  primary_contact_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('PHONE', 'WHATSAPP', 'EMAIL', 'WEB_FORM', 'REFERRAL')),
  received_at TEXT NOT NULL,
  requested_service TEXT NOT NULL CHECK (requested_service IN ('STATUTORY_AUDIT', 'INTERNAL_AUDIT', 'AGREED_UPON_PROCEDURES')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  estimated_fee_minor INTEGER CHECK (estimated_fee_minor IS NULL OR estimated_fee_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'QUALIFIED', 'CONVERTED', 'LOST')),
  loss_reason TEXT,
  converted_engagement_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT,
  updated_by_actor_id TEXT,
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, primary_contact_id) REFERENCES contacts(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, client_id, converted_engagement_id) REFERENCES engagements(workspace_id, client_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, converted_engagement_id),
  CHECK (period_start <= period_end),
  CHECK (status <> 'LOST' OR length(trim(COALESCE(loss_reason, ''))) >= 10)
);
CREATE INDEX IF NOT EXISTS leads_workspace_status_idx ON leads(workspace_id, status, received_at);
CREATE INDEX IF NOT EXISTS leads_client_idx ON leads(workspace_id, client_id);

CREATE TABLE IF NOT EXISTS state_transitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  from_state TEXT NOT NULL CHECK (from_state IN ('LEAD_INGESTION', 'PROPOSAL_GENERATION', 'DUAL_KEY_PENDING', 'ADVANCE_BILLING', 'PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW', 'PARTNER_APPROVAL', 'DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN', 'ARCHIVED_READ_ONLY')),
  to_state TEXT NOT NULL CHECK (to_state IN ('LEAD_INGESTION', 'PROPOSAL_GENERATION', 'DUAL_KEY_PENDING', 'ADVANCE_BILLING', 'PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW', 'PARTNER_APPROVAL', 'DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN', 'ARCHIVED_READ_ONLY')),
  command_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 10000),
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash) = 64),
  transitioned_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, client_id, engagement_id) REFERENCES engagements(workspace_id, client_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  CHECK (from_state <> to_state)
);
CREATE INDEX IF NOT EXISTS state_transitions_engagement_idx ON state_transitions(workspace_id, engagement_id, transitioned_at);
CREATE TRIGGER IF NOT EXISTS state_transitions_no_update BEFORE UPDATE ON state_transitions
BEGIN SELECT RAISE(ABORT, 'state transition rows are append only'); END;
CREATE TRIGGER IF NOT EXISTS state_transitions_no_delete BEFORE DELETE ON state_transitions
BEGIN SELECT RAISE(ABORT, 'state transition rows are append only'); END;

CREATE TABLE IF NOT EXISTS approval_decisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  engagement_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  subject_type TEXT NOT NULL CHECK (length(trim(subject_type)) BETWEEN 1 AND 120),
  subject_id TEXT NOT NULL,
  subject_version INTEGER NOT NULL CHECK (subject_version > 0),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REJECT', 'REVOKE')),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  actor_snapshot_json TEXT NOT NULL CHECK (json_valid(actor_snapshot_json)),
  decided_at TEXT NOT NULL,
  supersedes_decision_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, client_id, engagement_id) REFERENCES engagements(workspace_id, client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, supersedes_decision_id) REFERENCES approval_decisions(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  CHECK ((client_id IS NULL AND engagement_id IS NULL) OR (client_id IS NOT NULL AND engagement_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS approval_decisions_subject_idx ON approval_decisions(workspace_id, subject_type, subject_id, subject_version);
CREATE TRIGGER IF NOT EXISTS approval_decisions_no_update BEFORE UPDATE ON approval_decisions
BEGIN SELECT RAISE(ABORT, 'approval decisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS approval_decisions_no_delete BEFORE DELETE ON approval_decisions
BEGIN SELECT RAISE(ABORT, 'approval decisions are append only'); END;

CREATE TABLE IF NOT EXISTS approval_dependencies (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  approval_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (length(trim(entity_type)) BETWEEN 1 AND 120),
  entity_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL CHECK (entity_version > 0),
  content_sha256 TEXT CHECK (content_sha256 IS NULL OR length(content_sha256) = 64),
  FOREIGN KEY (workspace_id, client_id, engagement_id) REFERENCES engagements(workspace_id, client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, approval_id) REFERENCES approval_decisions(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, approval_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS approval_dependencies_entity_idx ON approval_dependencies(workspace_id, entity_type, entity_id, entity_version);
CREATE TRIGGER IF NOT EXISTS approval_dependencies_no_update BEFORE UPDATE ON approval_dependencies
BEGIN SELECT RAISE(ABORT, 'approval dependencies are append only'); END;
CREATE TRIGGER IF NOT EXISTS approval_dependencies_no_delete BEFORE DELETE ON approval_dependencies
BEGIN SELECT RAISE(ABORT, 'approval dependencies are append only'); END;

CREATE TABLE IF NOT EXISTS command_receipts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  actor_snapshot_json TEXT NOT NULL CHECK (json_valid(actor_snapshot_json)),
  command_type TEXT NOT NULL CHECK (length(trim(command_type)) BETWEEN 1 AND 120),
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS command_receipts_created_idx ON command_receipts(workspace_id, created_at);
CREATE TRIGGER IF NOT EXISTS command_receipts_no_update BEFORE UPDATE ON command_receipts
BEGIN SELECT RAISE(ABORT, 'command receipts are append only'); END;
CREATE TRIGGER IF NOT EXISTS command_receipts_no_delete BEFORE DELETE ON command_receipts
BEGIN SELECT RAISE(ABORT, 'command receipts are append only'); END;

CREATE TABLE IF NOT EXISTS audit_chain_heads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('WORKSPACE', 'ENGAGEMENT')),
  scope_id TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  last_event_hash TEXT CHECK (last_event_hash IS NULL OR length(last_event_hash) = 64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, scope_kind, scope_id)
);

CREATE TABLE IF NOT EXISTS outbox_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  kind TEXT NOT NULL CHECK (kind IN ('EMAIL', 'GENERATE_DOCUMENT', 'IMPORT_TB', 'SEAL_ARCHIVE', 'VERIFY_FILE')),
  aggregate_id TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  deduplication_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'RETRYABLE_FAILED', 'PERMANENT_FAILED', 'UNKNOWN')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  last_error_code TEXT,
  provider_reference TEXT,
  result_file_id TEXT,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, deduplication_key)
);
CREATE INDEX IF NOT EXISTS outbox_jobs_claim_idx ON outbox_jobs(status, next_attempt_at, lease_until);
CREATE INDEX IF NOT EXISTS outbox_jobs_aggregate_idx ON outbox_jobs(workspace_id, aggregate_id, aggregate_version);

CREATE TABLE IF NOT EXISTS file_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT,
  engagement_id TEXT,
  folder_id TEXT,
  original_name TEXT NOT NULL CHECK (length(trim(original_name)) BETWEEN 1 AND 200),
  media_type TEXT NOT NULL CHECK (media_type IN ('application/pdf', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'application/zip')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
  object_key TEXT NOT NULL UNIQUE,
  previous_version_id TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('PBC', 'TB', 'EVIDENCE', 'TEMPLATE', 'SIGNATURE', 'SEAL', 'GENERATED', 'RELEASE', 'ARCHIVE')),
  state TEXT NOT NULL CHECK (state IN ('INITIALIZED', 'STAGED', 'VERIFIED', 'COMMITTED', 'REJECTED')),
  committed_at TEXT,
  immutable INTEGER NOT NULL DEFAULT 0 CHECK (immutable IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT,
  updated_by_actor_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, previous_version_id) REFERENCES file_versions(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  CHECK (state <> 'COMMITTED' OR (sha256 IS NOT NULL AND committed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS file_versions_scope_idx ON file_versions(workspace_id, client_id, engagement_id, state);
CREATE INDEX IF NOT EXISTS file_versions_purpose_idx ON file_versions(workspace_id, engagement_id, purpose, state);
CREATE TRIGGER IF NOT EXISTS committed_files_no_metadata_update
BEFORE UPDATE ON file_versions
WHEN OLD.state = 'COMMITTED' AND (
  NEW.workspace_id <> OLD.workspace_id OR NEW.client_id IS NOT OLD.client_id OR
  NEW.engagement_id IS NOT OLD.engagement_id OR NEW.original_name <> OLD.original_name OR
  NEW.media_type <> OLD.media_type OR NEW.size_bytes <> OLD.size_bytes OR NEW.sha256 IS NOT OLD.sha256 OR
  NEW.object_key <> OLD.object_key OR NEW.previous_version_id IS NOT OLD.previous_version_id OR
  NEW.purpose <> OLD.purpose OR NEW.immutable <> OLD.immutable OR NEW.committed_at IS NOT OLD.committed_at
)
BEGIN SELECT RAISE(ABORT, 'committed file metadata is immutable'); END;
CREATE TRIGGER IF NOT EXISTS committed_files_no_delete
BEFORE DELETE ON file_versions WHEN OLD.state = 'COMMITTED'
BEGIN SELECT RAISE(ABORT, 'committed file versions cannot be deleted'); END;

-- Existing generic events become chain-capable without rewriting their original
-- content. Legacy rows are marked with explicit self-asserted provenance.
ALTER TABLE audit_events ADD COLUMN actor_assurance TEXT NOT NULL DEFAULT 'SELF_ASSERTED'
  CHECK (actor_assurance IN ('SELF_ASSERTED', 'SYSTEM'));
ALTER TABLE audit_events ADD COLUMN source TEXT NOT NULL DEFAULT 'USER'
  CHECK (source IN ('USER', 'JOB', 'MIGRATION'));
ALTER TABLE audit_events ADD COLUMN chain_scope_kind TEXT NOT NULL DEFAULT 'WORKSPACE'
  CHECK (chain_scope_kind IN ('WORKSPACE', 'ENGAGEMENT'));
ALTER TABLE audit_events ADD COLUMN chain_scope_id TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_events ADD COLUMN previous_hash TEXT;
ALTER TABLE audit_events ADD COLUMN event_hash TEXT;
UPDATE audit_events SET chain_scope_id = workspace_id WHERE chain_scope_id = '';
CREATE UNIQUE INDEX IF NOT EXISTS audit_events_scoped_sequence_idx
  ON audit_events(workspace_id, chain_scope_kind, chain_scope_id, sequence);
CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit events are append only'); END;
CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit events are append only'); END;
