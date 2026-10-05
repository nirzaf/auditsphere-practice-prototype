-- Revision-pinned onboarding, risk clearance and client commercial acceptance.
-- Decisions are append-only; readiness is derived from their current dependencies.

CREATE TABLE IF NOT EXISTS risk_assessments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('NEW_CLIENT','CONTINUANCE')),
  current_version_id TEXT,
  draft_version INTEGER NOT NULL DEFAULT 0 CHECK (draft_version >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  updated_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,current_version_id) REFERENCES risk_assessment_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,updated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id)
);

CREATE TABLE IF NOT EXISTS risk_assessment_drafts (
  workspace_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json) AND length(draft_json)<=200000),
  updated_at TEXT NOT NULL,
  updated_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,assessment_id) REFERENCES risk_assessments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,updated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  PRIMARY KEY (workspace_id,assessment_id)
);

CREATE TABLE IF NOT EXISTS risk_assessment_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  assessment_source_version INTEGER NOT NULL CHECK (assessment_source_version > 0),
  source_draft_version INTEGER NOT NULL CHECK (source_draft_version > 0),
  questionnaire_template_version TEXT NOT NULL CHECK (length(trim(questionnaire_template_version)) BETWEEN 1 AND 200),
  assessment_date TEXT NOT NULL,
  overall_risk TEXT NOT NULL CHECK (overall_risk IN ('LOW','MODERATE','HIGH')),
  management_integrity_conclusion TEXT NOT NULL CHECK (length(trim(management_integrity_conclusion)) BETWEEN 10 AND 10000),
  viability_conclusion TEXT NOT NULL CHECK (length(trim(viability_conclusion)) BETWEEN 10 AND 10000),
  independence_conclusion TEXT NOT NULL CHECK (length(trim(independence_conclusion)) BETWEEN 10 AND 10000),
  ownership_hash TEXT NOT NULL CHECK (length(ownership_hash)=64),
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  submitted_by_actor_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assessment_id) REFERENCES risk_assessments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,submitted_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,assessment_id,revision)
);
CREATE INDEX IF NOT EXISTS risk_assessment_versions_current_idx ON risk_assessment_versions(workspace_id,assessment_id,revision DESC);
CREATE TRIGGER IF NOT EXISTS risk_assessment_versions_no_update BEFORE UPDATE ON risk_assessment_versions
BEGIN SELECT RAISE(ABORT, 'risk assessment versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS risk_assessment_versions_no_delete BEFORE DELETE ON risk_assessment_versions
BEGIN SELECT RAISE(ABORT, 'risk assessment versions are append only'); END;

CREATE TABLE IF NOT EXISTS risk_checks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  assessment_version_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code IN ('UBO','KYC','AML','INTEGRITY','VIABILITY','INDEPENDENCE','CONFLICTS','PRIOR_FEES','MANAGEMENT_CHANGE','OWNERSHIP_CHANGE','NEW_BORROWING','LITIGATION','FRAUD_REGULATORY')),
  outcome TEXT NOT NULL CHECK (outcome IN ('CLEAR','ISSUE','NOT_APPLICABLE')),
  findings TEXT NOT NULL CHECK (length(trim(findings)) BETWEEN 10 AND 5000),
  source_reference TEXT NOT NULL CHECK (length(trim(source_reference)) BETWEEN 1 AND 1000),
  check_method TEXT NOT NULL DEFAULT 'MANUAL' CHECK (check_method IN ('MANUAL','EXTERNAL_SERVICE')),
  provider_name TEXT,
  external_reference TEXT,
  checked_on TEXT NOT NULL,
  evidence_file_id TEXT,
  resolution TEXT,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assessment_version_id) REFERENCES risk_assessment_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,assessment_version_id,code),
  CHECK (outcome<>'NOT_APPLICABLE' OR length(trim(COALESCE(resolution,'')))>=10),
  CHECK (resolution IS NULL OR length(trim(resolution)) BETWEEN 10 AND 5000),
  CHECK ((check_method='MANUAL' AND provider_name IS NULL AND external_reference IS NULL)
      OR (check_method='EXTERNAL_SERVICE' AND length(trim(COALESCE(provider_name,''))) BETWEEN 1 AND 200
          AND length(trim(COALESCE(external_reference,''))) BETWEEN 1 AND 500))
);
CREATE INDEX IF NOT EXISTS risk_checks_engagement_idx ON risk_checks(workspace_id,engagement_id,assessment_version_id);
CREATE TRIGGER IF NOT EXISTS risk_checks_no_update BEFORE UPDATE ON risk_checks
BEGIN SELECT RAISE(ABORT, 'risk checks are append only'); END;
CREATE TRIGGER IF NOT EXISTS risk_checks_no_delete BEFORE DELETE ON risk_checks
BEGIN SELECT RAISE(ABORT, 'risk checks are append only'); END;

CREATE TABLE IF NOT EXISTS risk_escalations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  assessment_version_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  check_code TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 5000),
  required_evidence TEXT NOT NULL CHECK (length(trim(required_evidence)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('OPEN','RESOLVED')),
  resolution TEXT,
  evidence_file_id TEXT,
  created_by_actor_id TEXT NOT NULL,
  resolved_by_actor_id TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assessment_id) REFERENCES risk_assessments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assessment_version_id) REFERENCES risk_assessment_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,check_id) REFERENCES risk_checks(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,resolved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((status='OPEN' AND resolution IS NULL AND evidence_file_id IS NULL AND resolved_by_actor_id IS NULL AND resolved_at IS NULL)
      OR (status='RESOLVED' AND length(trim(COALESCE(resolution,'')))>=10 AND evidence_file_id IS NOT NULL
          AND resolved_by_actor_id IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS risk_escalations_open_idx ON risk_escalations(workspace_id,assessment_version_id,status,check_code);
CREATE TRIGGER IF NOT EXISTS risk_escalations_resolve_once BEFORE UPDATE ON risk_escalations
WHEN OLD.status<>'OPEN' OR NEW.status<>'RESOLVED' OR NEW.version<>OLD.version+1
  OR NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.client_id<>OLD.client_id
  OR NEW.engagement_id<>OLD.engagement_id OR NEW.assessment_id<>OLD.assessment_id
  OR NEW.assessment_version_id<>OLD.assessment_version_id OR NEW.check_id<>OLD.check_id OR NEW.check_code<>OLD.check_code
  OR NEW.reason<>OLD.reason OR NEW.required_evidence<>OLD.required_evidence OR NEW.created_by_actor_id<>OLD.created_by_actor_id
  OR NEW.created_at<>OLD.created_at
BEGIN SELECT RAISE(ABORT, 'risk escalations can only be resolved once without changing their source'); END;
CREATE TRIGGER IF NOT EXISTS risk_escalations_no_delete BEFORE DELETE ON risk_escalations
BEGIN SELECT RAISE(ABORT, 'risk escalation history cannot be deleted'); END;

CREATE TABLE IF NOT EXISTS beneficial_owners (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  current_revision_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  updated_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id) REFERENCES clients(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,current_revision_id) REFERENCES beneficial_owner_revisions(workspace_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,updated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE INDEX IF NOT EXISTS beneficial_owners_client_active_idx ON beneficial_owners(workspace_id,client_id,active);

CREATE TABLE IF NOT EXISTS beneficial_owner_revisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  owner_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 250),
  ownership_bps INTEGER NOT NULL CHECK (ownership_bps BETWEEN 0 AND 10000),
  control_basis TEXT NOT NULL CHECK (length(trim(control_basis)) BETWEEN 1 AND 2000),
  identity_evidence_file_id TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  supersedes_revision_id TEXT,
  created_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,owner_id) REFERENCES beneficial_owners(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,client_id) REFERENCES clients(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,identity_evidence_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,supersedes_revision_id) REFERENCES beneficial_owner_revisions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,owner_id,revision),
  CHECK (effective_to IS NULL OR effective_to>=effective_from)
);
CREATE TRIGGER IF NOT EXISTS beneficial_owner_revisions_no_update BEFORE UPDATE ON beneficial_owner_revisions
BEGIN SELECT RAISE(ABORT, 'beneficial owner revisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS beneficial_owner_revisions_no_delete BEFORE DELETE ON beneficial_owner_revisions
BEGIN SELECT RAISE(ABORT, 'beneficial owner revisions are append only'); END;

CREATE TABLE IF NOT EXISTS risk_clearances (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  assessment_version_id TEXT NOT NULL,
  approval_decision_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('CLEAR','REJECT','REVOKE')),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  partner_actor_id TEXT NOT NULL,
  signature_asset_id TEXT,
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  supersedes_clearance_id TEXT,
  signed_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assessment_version_id) REFERENCES risk_assessment_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approval_decision_id) REFERENCES approval_decisions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,partner_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,signature_asset_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,supersedes_clearance_id) REFERENCES risk_clearances(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,sequence)
);
CREATE INDEX IF NOT EXISTS risk_clearances_current_idx ON risk_clearances(workspace_id,engagement_id,sequence DESC);
CREATE TRIGGER IF NOT EXISTS risk_clearances_no_update BEFORE UPDATE ON risk_clearances
BEGIN SELECT RAISE(ABORT, 'risk clearances are append only'); END;
CREATE TRIGGER IF NOT EXISTS risk_clearances_no_delete BEFORE DELETE ON risk_clearances
BEGIN SELECT RAISE(ABORT, 'risk clearances are append only'); END;

CREATE TABLE IF NOT EXISTS commercial_acceptances (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  proposal_version_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ACCEPT','REVOKE')),
  accepted_fee_minor INTEGER,
  confirmation_text TEXT NOT NULL CHECK (length(trim(confirmation_text)) BETWEEN 10 AND 5000),
  evidence_file_id TEXT,
  actor_id TEXT NOT NULL,
  revoked_acceptance_id TEXT,
  accepted_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,proposal_version_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,contact_id) REFERENCES contacts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,revoked_acceptance_id) REFERENCES commercial_acceptances(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,proposal_version_id,sequence),
  CHECK ((decision='ACCEPT' AND accepted_fee_minor BETWEEN 0 AND 9007199254740991 AND revoked_acceptance_id IS NULL)
      OR (decision='REVOKE' AND accepted_fee_minor IS NULL AND revoked_acceptance_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS commercial_acceptances_current_idx ON commercial_acceptances(workspace_id,proposal_version_id,sequence DESC);
CREATE TRIGGER IF NOT EXISTS commercial_acceptances_no_update BEFORE UPDATE ON commercial_acceptances
BEGIN SELECT RAISE(ABORT, 'commercial acceptances are append only'); END;
CREATE TRIGGER IF NOT EXISTS commercial_acceptances_no_delete BEFORE DELETE ON commercial_acceptances
BEGIN SELECT RAISE(ABORT, 'commercial acceptances are append only'); END;

CREATE TABLE IF NOT EXISTS continuance_baselines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  assessment_version_id TEXT NOT NULL,
  prior_engagement_id TEXT NOT NULL,
  prior_risk_version_id TEXT,
  prior_fee_outstanding_minor INTEGER NOT NULL CHECK (prior_fee_outstanding_minor>=0),
  as_of_date TEXT NOT NULL,
  management_changed INTEGER NOT NULL CHECK (management_changed IN (0,1)),
  ownership_changed INTEGER NOT NULL CHECK (ownership_changed IN (0,1)),
  new_borrowing INTEGER NOT NULL CHECK (new_borrowing IN (0,1)),
  litigation_changed INTEGER NOT NULL CHECK (litigation_changed IN (0,1)),
  fraud_or_regulatory_issue INTEGER NOT NULL CHECK (fraud_or_regulatory_issue IN (0,1)),
  change_summary TEXT NOT NULL CHECK (length(trim(change_summary)) BETWEEN 10 AND 5000),
  created_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assessment_version_id) REFERENCES risk_assessment_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prior_engagement_id) REFERENCES engagements(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prior_risk_version_id) REFERENCES risk_assessment_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,assessment_version_id)
);
CREATE TRIGGER IF NOT EXISTS continuance_baselines_no_update BEFORE UPDATE ON continuance_baselines
BEGIN SELECT RAISE(ABORT, 'continuance baselines are append only'); END;
CREATE TRIGGER IF NOT EXISTS continuance_baselines_no_delete BEFORE DELETE ON continuance_baselines
BEGIN SELECT RAISE(ABORT, 'continuance baselines are append only'); END;
