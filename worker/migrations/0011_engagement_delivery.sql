-- Version-pinned engagement letters, explicit billing policy and verified payment evidence.

CREATE TABLE IF NOT EXISTS document_template_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  service_type TEXT NOT NULL CHECK (service_type IN ('STATUTORY_AUDIT','INTERNAL_AUDIT','AGREED_UPON_PROCEDURES')),
  revision INTEGER NOT NULL CHECK (revision>0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  clauses TEXT NOT NULL CHECK (length(trim(clauses)) BETWEEN 20 AND 30000),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,service_type,revision)
);
CREATE TRIGGER IF NOT EXISTS document_template_versions_no_update BEFORE UPDATE ON document_template_versions
BEGIN SELECT RAISE(ABORT, 'approved document template versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS document_template_versions_no_delete BEFORE DELETE ON document_template_versions
BEGIN SELECT RAISE(ABORT, 'approved document template versions are append only'); END;

CREATE TABLE IF NOT EXISTS signature_asset_decisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence>0),
  file_version_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('CONSENT','REVOKE')),
  partner_actor_id TEXT NOT NULL,
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 2000),
  decided_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,partner_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,file_version_id,sequence)
);
CREATE INDEX IF NOT EXISTS signature_asset_decisions_current_idx ON signature_asset_decisions(workspace_id,file_version_id,sequence DESC);
CREATE TRIGGER IF NOT EXISTS signature_asset_decisions_no_update BEFORE UPDATE ON signature_asset_decisions
BEGIN SELECT RAISE(ABORT, 'signature asset consent history is append only'); END;
CREATE TRIGGER IF NOT EXISTS signature_asset_decisions_no_delete BEFORE DELETE ON signature_asset_decisions
BEGIN SELECT RAISE(ABORT, 'signature asset consent history is append only'); END;

CREATE TABLE IF NOT EXISTS seal_asset_approvals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence>0),
  file_version_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE','REVOKE')),
  partner_actor_id TEXT NOT NULL,
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 2000),
  decided_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,partner_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,file_version_id,sequence)
);
CREATE INDEX IF NOT EXISTS seal_asset_approvals_current_idx ON seal_asset_approvals(workspace_id,file_version_id,sequence DESC);
CREATE TRIGGER IF NOT EXISTS seal_asset_approvals_no_update BEFORE UPDATE ON seal_asset_approvals
BEGIN SELECT RAISE(ABORT, 'seal approval history is append only'); END;
CREATE TRIGGER IF NOT EXISTS seal_asset_approvals_no_delete BEFORE DELETE ON seal_asset_approvals
BEGIN SELECT RAISE(ABORT, 'seal approval history is append only'); END;

CREATE TABLE IF NOT EXISTS engagement_letter_drafts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  proposal_version_id TEXT NOT NULL,
  commercial_acceptance_id TEXT NOT NULL,
  risk_clearance_id TEXT NOT NULL,
  template_version_id TEXT NOT NULL,
  signature_file_version_id TEXT NOT NULL,
  signature_consent_id TEXT NOT NULL,
  seal_file_version_id TEXT NOT NULL,
  seal_approval_id TEXT NOT NULL,
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','RETRYABLE_FAILED','PERMANENT_FAILED','STALE','ISSUED')),
  job_id TEXT NOT NULL,
  artifact_id TEXT,
  file_version_id TEXT,
  error_code TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,proposal_version_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,commercial_acceptance_id) REFERENCES commercial_acceptances(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,risk_clearance_id) REFERENCES risk_clearances(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,template_version_id) REFERENCES document_template_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,signature_file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,signature_consent_id) REFERENCES signature_asset_decisions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,seal_file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,seal_approval_id) REFERENCES seal_asset_approvals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,job_id) REFERENCES outbox_jobs(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision),
  UNIQUE (workspace_id,job_id)
);
CREATE INDEX IF NOT EXISTS engagement_letter_drafts_engagement_idx ON engagement_letter_drafts(workspace_id,engagement_id,revision DESC);

CREATE TABLE IF NOT EXISTS engagement_letters (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  proposal_version_id TEXT NOT NULL,
  commercial_acceptance_id TEXT NOT NULL,
  risk_clearance_id TEXT NOT NULL,
  template_version_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  file_version_id TEXT NOT NULL,
  signature_file_version_id TEXT NOT NULL,
  signature_consent_id TEXT NOT NULL,
  seal_file_version_id TEXT NOT NULL,
  seal_approval_id TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
  fee_minor INTEGER NOT NULL CHECK (fee_minor BETWEEN 0 AND 9007199254740991),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  issued_by_actor_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,proposal_version_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,commercial_acceptance_id) REFERENCES commercial_acceptances(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,risk_clearance_id) REFERENCES risk_clearances(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,template_version_id) REFERENCES document_template_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,signature_file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,signature_consent_id) REFERENCES signature_asset_decisions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,seal_file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,seal_approval_id) REFERENCES seal_asset_approvals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,issued_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision)
);
CREATE TRIGGER IF NOT EXISTS engagement_letters_no_update BEFORE UPDATE ON engagement_letters
BEGIN SELECT RAISE(ABORT, 'issued engagement letters are append only'); END;
CREATE TRIGGER IF NOT EXISTS engagement_letters_no_delete BEFORE DELETE ON engagement_letters
BEGIN SELECT RAISE(ABORT, 'issued engagement letters are append only'); END;

CREATE TABLE IF NOT EXISTS billing_tax_policy_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  revision INTEGER NOT NULL CHECK (revision>0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  tax_basis_points INTEGER NOT NULL CHECK (tax_basis_points BETWEEN 0 AND 100000),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 2000),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,revision)
);
CREATE TRIGGER IF NOT EXISTS billing_tax_policy_versions_no_update BEFORE UPDATE ON billing_tax_policy_versions
BEGIN SELECT RAISE(ABORT, 'approved tax policy versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS billing_tax_policy_versions_no_delete BEFORE DELETE ON billing_tax_policy_versions
BEGIN SELECT RAISE(ABORT, 'approved tax policy versions are append only'); END;

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  engagement_letter_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ADVANCE','FINAL')),
  number TEXT NOT NULL,
  fee_revision_id TEXT NOT NULL,
  tax_policy_version_id TEXT,
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor BETWEEN 0 AND 9007199254740991),
  tax_minor INTEGER NOT NULL CHECK (tax_minor BETWEEN 0 AND 9007199254740991),
  total_minor INTEGER NOT NULL CHECK (total_minor BETWEEN 0 AND 9007199254740991 AND total_minor=subtotal_minor+tax_minor),
  currency TEXT NOT NULL DEFAULT 'QAR' CHECK (currency='QAR'),
  issue_date TEXT,
  due_date TEXT NOT NULL,
  contact_route_id TEXT,
  recipient_snapshot_json TEXT CHECK (recipient_snapshot_json IS NULL OR (json_valid(recipient_snapshot_json) AND length(recipient_snapshot_json)<=10000)),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','PENDING_DOCUMENT','ISSUED','VOID')),
  artifact_id TEXT,
  file_version_id TEXT,
  corrects_invoice_id TEXT,
  created_by_actor_id TEXT NOT NULL,
  issued_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,engagement_letter_id) REFERENCES engagement_letters(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fee_revision_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tax_policy_version_id) REFERENCES billing_tax_policy_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,corrects_invoice_id) REFERENCES invoices(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,contact_route_id) REFERENCES contact_routes(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,number),
  UNIQUE (workspace_id,engagement_letter_id,kind),
  CHECK ((status='DRAFT' AND issue_date IS NULL AND issued_at IS NULL AND tax_policy_version_id IS NULL)
      OR (status='PENDING_DOCUMENT' AND issue_date IS NULL AND issued_at IS NULL AND tax_policy_version_id IS NOT NULL)
      OR (status='ISSUED' AND issue_date IS NOT NULL AND issued_at IS NOT NULL AND tax_policy_version_id IS NOT NULL AND file_version_id IS NOT NULL AND artifact_id IS NOT NULL)
      OR status='VOID')
);
CREATE INDEX IF NOT EXISTS invoices_engagement_kind_idx ON invoices(workspace_id,engagement_id,kind,status);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  received_on TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('BANK_TRANSFER','CHEQUE','CASH')),
  reference TEXT NOT NULL CHECK (length(trim(reference)) BETWEEN 1 AND 200),
  evidence_file_id TEXT NOT NULL,
  verified_by_actor_id TEXT NOT NULL,
  reverses_payment_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,verified_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reverses_payment_id) REFERENCES payments(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,reverses_payment_id)
);
CREATE TRIGGER IF NOT EXISTS payments_no_update BEFORE UPDATE ON payments
BEGIN SELECT RAISE(ABORT, 'verified payment records are append only'); END;
CREATE TRIGGER IF NOT EXISTS payments_no_delete BEFORE DELETE ON payments
BEGIN SELECT RAISE(ABORT, 'verified payment records are append only'); END;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  allocated_on TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,payment_id) REFERENCES payments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,invoice_id) REFERENCES invoices(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,payment_id,invoice_id)
);
CREATE TRIGGER IF NOT EXISTS payment_allocations_no_update BEFORE UPDATE ON payment_allocations
BEGIN SELECT RAISE(ABORT, 'payment allocations are append only'); END;
CREATE TRIGGER IF NOT EXISTS payment_allocations_no_delete BEFORE DELETE ON payment_allocations
BEGIN SELECT RAISE(ABORT, 'payment allocations are append only'); END;
CREATE TRIGGER IF NOT EXISTS payment_allocations_scope_guard BEFORE INSERT ON payment_allocations
WHEN NOT EXISTS (SELECT 1 FROM payments p JOIN invoices i ON i.workspace_id=p.workspace_id AND i.client_id=p.client_id AND i.engagement_id=p.engagement_id
  WHERE p.workspace_id=NEW.workspace_id AND p.id=NEW.payment_id AND i.id=NEW.invoice_id AND i.status='ISSUED'
    AND (SELECT COALESCE(SUM(pa.amount_minor),0) FROM payment_allocations pa
      WHERE pa.workspace_id=NEW.workspace_id AND pa.payment_id=p.id)+NEW.amount_minor<=p.amount_minor
    AND (SELECT COALESCE(SUM(CASE WHEN allocated_payment.reverses_payment_id IS NULL THEN pa.amount_minor ELSE -pa.amount_minor END),0)
      FROM payment_allocations pa JOIN payments allocated_payment ON allocated_payment.workspace_id=pa.workspace_id AND allocated_payment.id=pa.payment_id
      WHERE pa.workspace_id=NEW.workspace_id AND pa.invoice_id=i.id)
      +CASE WHEN p.reverses_payment_id IS NULL THEN NEW.amount_minor ELSE -NEW.amount_minor END<=i.total_minor
    AND (p.reverses_payment_id IS NULL OR EXISTS(SELECT 1 FROM payment_allocations original
      WHERE original.workspace_id=NEW.workspace_id AND original.payment_id=p.reverses_payment_id
        AND original.invoice_id=i.id AND original.amount_minor=NEW.amount_minor))
    AND (p.reverses_payment_id IS NULL OR (SELECT COALESCE(SUM(CASE WHEN allocated_payment.reverses_payment_id IS NULL THEN pa.amount_minor ELSE -pa.amount_minor END),0)
      FROM payment_allocations pa JOIN payments allocated_payment ON allocated_payment.workspace_id=pa.workspace_id AND allocated_payment.id=pa.payment_id
      WHERE pa.workspace_id=NEW.workspace_id AND pa.invoice_id=i.id)>=NEW.amount_minor))
BEGIN SELECT RAISE(ABORT, 'payment allocation scope or amount is invalid'); END;

CREATE TABLE IF NOT EXISTS receipt_vouchers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version=1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  number TEXT NOT NULL,
  artifact_id TEXT,
  file_version_id TEXT,
  contact_route_id TEXT NOT NULL,
  recipient_snapshot_json TEXT NOT NULL CHECK (json_valid(recipient_snapshot_json) AND length(recipient_snapshot_json)<=10000),
  status TEXT NOT NULL CHECK (status IN ('PENDING','ISSUED')),
  issued_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,payment_id) REFERENCES payments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,contact_route_id) REFERENCES contact_routes(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,payment_id),
  UNIQUE (workspace_id,number),
  CHECK ((status='PENDING' AND artifact_id IS NULL AND file_version_id IS NULL AND issued_at IS NULL)
      OR (status='ISSUED' AND artifact_id IS NOT NULL AND file_version_id IS NOT NULL AND issued_at IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS receipt_vouchers_no_delete BEFORE DELETE ON receipt_vouchers
BEGIN SELECT RAISE(ABORT, 'receipt voucher history cannot be deleted'); END;
