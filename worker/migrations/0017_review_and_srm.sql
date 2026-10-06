-- Independent review, documented rework, audit adjustments and immutable SRM snapshots.

CREATE TABLE IF NOT EXISTS review_submissions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('PROCEDURE','WORKPROGRAM','ANALYTICAL_REVIEW','GOING_CONCERN','SRM')),
  procedure_id TEXT,
  workprogram_id TEXT,
  analytical_review_id TEXT,
  going_concern_id TEXT,
  srm_version_id TEXT,
  target_version INTEGER NOT NULL CHECK (target_version>0),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  submitted_by_actor_id TEXT NOT NULL,
  submitted_natural_person_key TEXT NOT NULL,
  contributor_natural_person_keys_json TEXT NOT NULL CHECK (json_valid(contributor_natural_person_keys_json)),
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,procedure_id) REFERENCES procedures(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,workprogram_id) REFERENCES workprograms(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,analytical_review_id) REFERENCES analytical_reviews(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,going_concern_id) REFERENCES going_concern_assessments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,srm_version_id) REFERENCES srm_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,submitted_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK (
    (target_kind='PROCEDURE' AND procedure_id IS NOT NULL AND workprogram_id IS NULL AND analytical_review_id IS NULL AND going_concern_id IS NULL AND srm_version_id IS NULL) OR
    (target_kind='WORKPROGRAM' AND procedure_id IS NULL AND workprogram_id IS NOT NULL AND analytical_review_id IS NULL AND going_concern_id IS NULL AND srm_version_id IS NULL) OR
    (target_kind='ANALYTICAL_REVIEW' AND procedure_id IS NULL AND workprogram_id IS NULL AND analytical_review_id IS NOT NULL AND going_concern_id IS NULL AND srm_version_id IS NULL) OR
    (target_kind='GOING_CONCERN' AND procedure_id IS NULL AND workprogram_id IS NULL AND analytical_review_id IS NULL AND going_concern_id IS NOT NULL AND srm_version_id IS NULL) OR
    (target_kind='SRM' AND procedure_id IS NULL AND workprogram_id IS NULL AND analytical_review_id IS NULL AND going_concern_id IS NULL AND srm_version_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS review_submissions_engagement_idx ON review_submissions(workspace_id,engagement_id,target_kind,submitted_at DESC);
CREATE INDEX IF NOT EXISTS review_submissions_procedure_idx ON review_submissions(workspace_id,procedure_id,target_version DESC);
CREATE TRIGGER IF NOT EXISTS review_submissions_no_update BEFORE UPDATE ON review_submissions
BEGIN SELECT RAISE(ABORT, 'review submission snapshots are append only'); END;
CREATE TRIGGER IF NOT EXISTS review_submissions_no_delete BEFORE DELETE ON review_submissions
BEGIN SELECT RAISE(ABORT, 'review submission snapshots are append only'); END;

CREATE TABLE IF NOT EXISTS review_decisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ACCEPT','RETURN')),
  reviewer_actor_id TEXT NOT NULL,
  reviewer_natural_person_key TEXT NOT NULL,
  comment TEXT,
  decided_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,submission_id) REFERENCES review_submissions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reviewer_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,submission_id),
  CHECK (decision='ACCEPT' OR length(trim(COALESCE(comment,'')))>=10)
);
CREATE TRIGGER IF NOT EXISTS review_decisions_no_update BEFORE UPDATE ON review_decisions
BEGIN SELECT RAISE(ABORT, 'review decisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS review_decisions_no_delete BEFORE DELETE ON review_decisions
BEGIN SELECT RAISE(ABORT, 'review decisions are append only'); END;

CREATE TABLE IF NOT EXISTS review_notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  submission_id TEXT NOT NULL,
  procedure_id TEXT,
  text TEXT NOT NULL CHECK (length(trim(text)) BETWEEN 10 AND 10000),
  assigned_preparer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','RESPONDED','CLOSED')),
  response_text TEXT,
  response_at TEXT,
  closed_by_actor_id TEXT,
  closed_at TEXT,
  closure_reason TEXT,
  resubmission_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,submission_id) REFERENCES review_submissions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,procedure_id) REFERENCES procedures(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assigned_preparer_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,closed_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,resubmission_id) REFERENCES review_submissions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((status='OPEN' AND response_text IS NULL AND response_at IS NULL AND closed_by_actor_id IS NULL AND closed_at IS NULL)
      OR (status='RESPONDED' AND length(trim(COALESCE(response_text,'')))>=10 AND response_at IS NOT NULL AND closed_by_actor_id IS NULL AND closed_at IS NULL)
      OR (status='CLOSED' AND length(trim(COALESCE(response_text,'')))>=10 AND response_at IS NOT NULL AND closed_by_actor_id IS NOT NULL AND closed_at IS NOT NULL AND length(trim(COALESCE(closure_reason,'')))>=10 AND resubmission_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS review_notes_assignee_idx ON review_notes(workspace_id,assigned_preparer_id,status,created_at);
CREATE TABLE IF NOT EXISTS review_note_revisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  status TEXT NOT NULL CHECK (status IN ('OPEN','RESPONDED','CLOSED')),
  response_text TEXT,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 10000),
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,note_id) REFERENCES review_notes(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,note_id,revision)
);
CREATE TRIGGER IF NOT EXISTS review_note_revisions_no_update BEFORE UPDATE ON review_note_revisions
BEGIN SELECT RAISE(ABORT, 'review-note history is append only'); END;
CREATE TRIGGER IF NOT EXISTS review_note_revisions_no_delete BEFORE DELETE ON review_note_revisions
BEGIN SELECT RAISE(ABORT, 'review-note history is append only'); END;

CREATE TABLE IF NOT EXISTS partner_area_clearances (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workprogram_id TEXT NOT NULL,
  reviewed_submission_id TEXT NOT NULL,
  partner_actor_id TEXT NOT NULL,
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  signed_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,workprogram_id) REFERENCES workprograms(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reviewed_submission_id) REFERENCES review_submissions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,partner_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,workprogram_id,dependency_hash)
);
CREATE TRIGGER IF NOT EXISTS partner_area_clearances_no_update BEFORE UPDATE ON partner_area_clearances
BEGIN SELECT RAISE(ABORT, 'Partner area clearances are append only'); END;
CREATE TRIGGER IF NOT EXISTS partner_area_clearances_no_delete BEFORE DELETE ON partner_area_clearances
BEGIN SELECT RAISE(ABORT, 'Partner area clearances are append only'); END;

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 20000),
  severity TEXT NOT NULL CHECK (severity IN ('LOW','MODERATE','HIGH','CRITICAL')),
  qualitative_significance INTEGER NOT NULL CHECK (qualitative_significance IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('OPEN','RESPONDED','RESOLVED')),
  client_response TEXT,
  resolution TEXT,
  created_by_actor_id TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE INDEX IF NOT EXISTS findings_engagement_idx ON findings(workspace_id,engagement_id,status,severity);

CREATE TABLE IF NOT EXISTS audit_adjustments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  number TEXT NOT NULL,
  tb_version_id TEXT NOT NULL,
  finding_id TEXT,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 10000),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','PROPOSED','CLIENT_ACCEPTED','CLIENT_DECLINED','REVIEW_APPROVED','REVERSED')),
  reflected_in_source INTEGER NOT NULL DEFAULT 0 CHECK (reflected_in_source IN (0,1)),
  reflected_in_source_reason TEXT,
  include_in_statements INTEGER NOT NULL DEFAULT 0 CHECK (include_in_statements IN (0,1)),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  created_by_actor_id TEXT NOT NULL,
  approved_by_actor_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_version_id) REFERENCES tb_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,finding_id) REFERENCES findings(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,number),
  CHECK ((reflected_in_source=0 AND reflected_in_source_reason IS NULL) OR (reflected_in_source=1 AND length(trim(COALESCE(reflected_in_source_reason,'')))>=10)),
  CHECK (status='REVIEW_APPROVED' OR include_in_statements=0),
  CHECK (status='REVIEW_APPROVED' OR approved_by_actor_id IS NULL)
);
CREATE INDEX IF NOT EXISTS audit_adjustments_engagement_idx ON audit_adjustments(workspace_id,engagement_id,status,number);
CREATE TABLE IF NOT EXISTS audit_adjustment_lines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  adjustment_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  account_code TEXT,
  debit_minor INTEGER NOT NULL CHECK (debit_minor>=0),
  credit_minor INTEGER NOT NULL CHECK (credit_minor>=0),
  FOREIGN KEY (workspace_id,adjustment_id) REFERENCES audit_adjustments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0))
);
CREATE TABLE IF NOT EXISTS audit_adjustment_revisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  adjustment_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  changed_by_actor_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,adjustment_id) REFERENCES audit_adjustments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,changed_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,adjustment_id,revision)
);
CREATE TRIGGER IF NOT EXISTS audit_adjustment_revisions_no_update BEFORE UPDATE ON audit_adjustment_revisions
BEGIN SELECT RAISE(ABORT, 'audit adjustment revisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS audit_adjustment_revisions_no_delete BEFORE DELETE ON audit_adjustment_revisions
BEGIN SELECT RAISE(ABORT, 'audit adjustment revisions are append only'); END;

CREATE TABLE IF NOT EXISTS audit_differences (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor<>0),
  nature TEXT NOT NULL CHECK (nature IN ('FACTUAL','JUDGMENTAL','PROJECTED')),
  qualitative_significance INTEGER NOT NULL CHECK (qualitative_significance IN (0,1)),
  disposition TEXT NOT NULL CHECK (disposition IN ('UNADJUSTED','ADJUSTED','CLEARLY_TRIVIAL')),
  disposition_reason TEXT NOT NULL CHECK (length(trim(disposition_reason)) BETWEEN 10 AND 10000),
  adjustment_id TEXT,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,finding_id) REFERENCES findings(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,adjustment_id) REFERENCES audit_adjustments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((disposition='ADJUSTED' AND adjustment_id IS NOT NULL) OR (disposition<>'ADJUSTED' AND adjustment_id IS NULL))
);

CREATE TABLE IF NOT EXISTS srm_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  planning_version_id TEXT NOT NULL,
  statement_snapshot_id TEXT NOT NULL,
  signed_unadjusted_minor INTEGER NOT NULL,
  gross_unadjusted_minor INTEGER NOT NULL CHECK (gross_unadjusted_minor>=0),
  materiality_snapshot_json TEXT NOT NULL CHECK (json_valid(materiality_snapshot_json)),
  findings_snapshot_json TEXT NOT NULL CHECK (json_valid(findings_snapshot_json)),
  adjustments_snapshot_json TEXT NOT NULL CHECK (json_valid(adjustments_snapshot_json)),
  review_snapshot_json TEXT NOT NULL CHECK (json_valid(review_snapshot_json)),
  estimates_text TEXT NOT NULL,
  going_concern_id TEXT NOT NULL,
  manager_recommendation TEXT NOT NULL CHECK (length(trim(manager_recommendation)) BETWEEN 10 AND 10000),
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  compiled_by_actor_id TEXT NOT NULL,
  compiled_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,planning_version_id) REFERENCES planning_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,statement_snapshot_id) REFERENCES statement_snapshots(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,going_concern_id) REFERENCES going_concern_assessments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,compiled_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision)
);
CREATE TRIGGER IF NOT EXISTS srm_versions_no_update BEFORE UPDATE ON srm_versions
BEGIN SELECT RAISE(ABORT, 'SRM versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS srm_versions_no_delete BEFORE DELETE ON srm_versions
BEGIN SELECT RAISE(ABORT, 'SRM versions are immutable'); END;
CREATE TABLE IF NOT EXISTS srm_clearances (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  srm_version_id TEXT NOT NULL,
  partner_actor_id TEXT NOT NULL,
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  signed_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,srm_version_id) REFERENCES srm_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,partner_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,srm_version_id,dependency_hash)
);
CREATE TRIGGER IF NOT EXISTS srm_clearances_no_update BEFORE UPDATE ON srm_clearances
BEGIN SELECT RAISE(ABORT, 'SRM clearances are append only'); END;
CREATE TRIGGER IF NOT EXISTS srm_clearances_no_delete BEFORE DELETE ON srm_clearances
BEGIN SELECT RAISE(ABORT, 'SRM clearances are append only'); END;
