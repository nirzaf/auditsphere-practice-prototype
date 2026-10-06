-- Dated prior-engagement ledger snapshots and evidence-backed continuance deltas.
-- The first start record is immutable; each submitted risk revision pins one
-- immutable delta baseline through continuance_baselines.

CREATE TABLE IF NOT EXISTS continuance_reviews (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  prior_engagement_id TEXT NOT NULL,
  prior_commercial_acceptance_id TEXT NOT NULL,
  prior_risk_version_id TEXT NOT NULL,
  prior_risk_clearance_id TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  prior_fee_outstanding_minor INTEGER NOT NULL CHECK (prior_fee_outstanding_minor BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assessment_id) REFERENCES risk_assessments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prior_engagement_id) REFERENCES engagements(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prior_commercial_acceptance_id) REFERENCES commercial_acceptances(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prior_risk_version_id) REFERENCES risk_assessment_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prior_risk_clearance_id) REFERENCES risk_clearances(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id),
  UNIQUE (workspace_id,assessment_id)
);
CREATE TRIGGER IF NOT EXISTS continuance_reviews_no_update BEFORE UPDATE ON continuance_reviews
BEGIN SELECT RAISE(ABORT, 'continuance start snapshots are append only'); END;
CREATE TRIGGER IF NOT EXISTS continuance_reviews_no_delete BEFORE DELETE ON continuance_reviews
BEGIN SELECT RAISE(ABORT, 'continuance start snapshots are append only'); END;

CREATE TABLE IF NOT EXISTS continuance_invoice_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  continuance_review_id TEXT NOT NULL,
  prior_invoice_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  issued_minor INTEGER NOT NULL CHECK (issued_minor BETWEEN 0 AND 9007199254740991),
  settled_minor INTEGER NOT NULL CHECK (settled_minor BETWEEN 0 AND issued_minor),
  outstanding_minor INTEGER NOT NULL CHECK (outstanding_minor BETWEEN 0 AND issued_minor AND outstanding_minor=issued_minor-settled_minor),
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,continuance_review_id) REFERENCES continuance_reviews(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prior_invoice_id) REFERENCES invoices(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,continuance_review_id,prior_invoice_id)
);
CREATE TRIGGER IF NOT EXISTS continuance_invoice_snapshots_no_update BEFORE UPDATE ON continuance_invoice_snapshots
BEGIN SELECT RAISE(ABORT, 'continuance invoice snapshots are append only'); END;
CREATE TRIGGER IF NOT EXISTS continuance_invoice_snapshots_no_delete BEFORE DELETE ON continuance_invoice_snapshots
BEGIN SELECT RAISE(ABORT, 'continuance invoice snapshots are append only'); END;

CREATE TABLE IF NOT EXISTS continuance_delta_revisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  management_changed INTEGER NOT NULL CHECK (management_changed IN (0,1)),
  ownership_changed INTEGER NOT NULL CHECK (ownership_changed IN (0,1)),
  new_borrowing INTEGER NOT NULL CHECK (new_borrowing IN (0,1)),
  litigation_changed INTEGER NOT NULL CHECK (litigation_changed IN (0,1)),
  fraud_or_regulatory_issue INTEGER NOT NULL CHECK (fraud_or_regulatory_issue IN (0,1)),
  change_summary TEXT NOT NULL CHECK (length(trim(change_summary)) BETWEEN 10 AND 5000),
  recorded_by_actor_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assessment_id) REFERENCES risk_assessments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,recorded_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,assessment_id,revision)
);
CREATE INDEX IF NOT EXISTS continuance_delta_current_idx ON continuance_delta_revisions(workspace_id,assessment_id,revision DESC);
CREATE TRIGGER IF NOT EXISTS continuance_delta_revisions_no_update BEFORE UPDATE ON continuance_delta_revisions
BEGIN SELECT RAISE(ABORT, 'continuance delta revisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS continuance_delta_revisions_no_delete BEFORE DELETE ON continuance_delta_revisions
BEGIN SELECT RAISE(ABORT, 'continuance delta revisions are append only'); END;

CREATE TABLE IF NOT EXISTS continuance_delta_evidence (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  delta_revision_id TEXT NOT NULL,
  topic TEXT NOT NULL CHECK (topic IN ('MANAGEMENT','OWNERSHIP','BORROWING','LITIGATION','FRAUD_REGULATORY')),
  file_version_id TEXT NOT NULL,
  file_sha256 TEXT NOT NULL CHECK (length(file_sha256)=64),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('CURRENT_SUPPORT','PRIOR_SOURCE')),
  applicability_confirmed INTEGER NOT NULL CHECK (applicability_confirmed=1),
  applicability_rationale TEXT NOT NULL CHECK (length(trim(applicability_rationale)) BETWEEN 10 AND 2000),
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,delta_revision_id) REFERENCES continuance_delta_revisions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,delta_revision_id,topic,file_version_id)
);
CREATE TRIGGER IF NOT EXISTS continuance_delta_evidence_scope_guard BEFORE INSERT ON continuance_delta_evidence
WHEN NOT EXISTS (
  SELECT 1 FROM continuance_delta_revisions dr
  JOIN continuance_reviews cr ON cr.workspace_id=dr.workspace_id AND cr.assessment_id=dr.assessment_id
  JOIN file_versions fv ON fv.workspace_id=NEW.workspace_id AND fv.id=NEW.file_version_id
  WHERE dr.workspace_id=NEW.workspace_id AND dr.id=NEW.delta_revision_id
    AND fv.client_id=dr.client_id AND fv.state='COMMITTED' AND fv.immutable=1
    AND fv.purpose IN ('PBC','EVIDENCE') AND fv.sha256=NEW.file_sha256
    AND ((NEW.evidence_kind='CURRENT_SUPPORT' AND (fv.engagement_id IS NULL OR fv.engagement_id=dr.engagement_id))
      OR (NEW.evidence_kind='PRIOR_SOURCE' AND fv.engagement_id=cr.prior_engagement_id AND NEW.applicability_confirmed=1))
)
BEGIN SELECT RAISE(ABORT, 'continuance evidence scope or current applicability is invalid'); END;
CREATE TRIGGER IF NOT EXISTS continuance_delta_evidence_no_update BEFORE UPDATE ON continuance_delta_evidence
BEGIN SELECT RAISE(ABORT, 'continuance delta evidence is append only'); END;
CREATE TRIGGER IF NOT EXISTS continuance_delta_evidence_no_delete BEFORE DELETE ON continuance_delta_evidence
BEGIN SELECT RAISE(ABORT, 'continuance delta evidence is append only'); END;

CREATE TABLE IF NOT EXISTS continuance_baseline_sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  baseline_id TEXT NOT NULL,
  delta_revision_id TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL CHECK (length(snapshot_sha256)=64),
  FOREIGN KEY (workspace_id,baseline_id) REFERENCES continuance_baselines(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,delta_revision_id) REFERENCES continuance_delta_revisions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,baseline_id),
  UNIQUE (workspace_id,delta_revision_id)
);
CREATE TRIGGER IF NOT EXISTS continuance_baseline_sources_no_update BEFORE UPDATE ON continuance_baseline_sources
BEGIN SELECT RAISE(ABORT, 'continuance baseline source links are append only'); END;
CREATE TRIGGER IF NOT EXISTS continuance_baseline_sources_no_delete BEFORE DELETE ON continuance_baseline_sources
BEGIN SELECT RAISE(ABORT, 'continuance baseline source links are append only'); END;

CREATE TABLE IF NOT EXISTS continuance_baseline_evidence (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  baseline_id TEXT NOT NULL,
  topic TEXT NOT NULL CHECK (topic IN ('MANAGEMENT','OWNERSHIP','BORROWING','LITIGATION','FRAUD_REGULATORY')),
  file_version_id TEXT NOT NULL,
  file_sha256 TEXT NOT NULL CHECK (length(file_sha256)=64),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('CURRENT_SUPPORT','PRIOR_SOURCE')),
  applicability_rationale TEXT NOT NULL CHECK (length(trim(applicability_rationale)) BETWEEN 10 AND 2000),
  FOREIGN KEY (workspace_id,baseline_id) REFERENCES continuance_baselines(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,baseline_id,topic,file_version_id)
);
CREATE TRIGGER IF NOT EXISTS continuance_baseline_evidence_no_update BEFORE UPDATE ON continuance_baseline_evidence
BEGIN SELECT RAISE(ABORT, 'continuance baseline evidence is append only'); END;
CREATE TRIGGER IF NOT EXISTS continuance_baseline_evidence_no_delete BEFORE DELETE ON continuance_baseline_evidence
BEGIN SELECT RAISE(ABORT, 'continuance baseline evidence is append only'); END;
