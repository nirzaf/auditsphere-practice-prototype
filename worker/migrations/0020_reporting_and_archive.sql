-- Opinion, report evidence, release bundle and application archive records.

CREATE TABLE opinion_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  srm_version_id TEXT NOT NULL,
  standards_profile_id TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('ISA_AUDIT','ISRS_4400_AUP')),
  category TEXT CHECK (category IS NULL OR category IN ('UNMODIFIED','QUALIFIED','DISCLAIMER','ADVERSE')),
  aup_report_type TEXT,
  aup_procedure_summary TEXT,
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  materiality_assessment TEXT NOT NULL CHECK (length(trim(materiality_assessment)) BETWEEN 10 AND 10000),
  pervasiveness_assessment TEXT NOT NULL CHECK (length(trim(pervasiveness_assessment)) BETWEEN 10 AND 10000),
  basis_heading TEXT,
  basis_text TEXT,
  going_concern_reporting_text TEXT,
  additional_sections_json TEXT NOT NULL CHECK (json_valid(additional_sections_json)),
  selected_by_actor_id TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,srm_version_id) REFERENCES srm_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,standards_profile_id) REFERENCES standards_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,selected_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision),
  CHECK ((report_type='ISA_AUDIT' AND category IS NOT NULL AND aup_report_type IS NULL AND aup_procedure_summary IS NULL
      AND ((category='UNMODIFIED' AND basis_heading IS NULL AND basis_text IS NULL)
        OR (category<>'UNMODIFIED' AND length(trim(COALESCE(basis_heading,'')))>0 AND length(trim(COALESCE(basis_text,'')))>=20)))
      OR (report_type='ISRS_4400_AUP' AND category IS NULL AND length(trim(COALESCE(aup_report_type,''))) BETWEEN 1 AND 200
        AND length(trim(COALESCE(aup_procedure_summary,'')))>=20 AND basis_heading IS NULL AND basis_text IS NULL))
);
CREATE TABLE opinion_affected_fslis (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  opinion_version_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor BETWEEN -9007199254740991 AND 9007199254740991),
  explanation TEXT NOT NULL CHECK (length(trim(explanation)) BETWEEN 10 AND 10000),
  FOREIGN KEY (workspace_id,opinion_version_id) REFERENCES opinion_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,opinion_version_id,fsli_id)
);
CREATE TRIGGER opinion_versions_no_update BEFORE UPDATE ON opinion_versions BEGIN SELECT RAISE(ABORT,'opinion versions are append only'); END;
CREATE TRIGGER opinion_versions_no_delete BEFORE DELETE ON opinion_versions BEGIN SELECT RAISE(ABORT,'opinion versions are append only'); END;
CREATE TRIGGER opinion_affected_fslis_no_update BEFORE UPDATE ON opinion_affected_fslis BEGIN SELECT RAISE(ABORT,'opinion FSLI records are append only'); END;
CREATE TRIGGER opinion_affected_fslis_no_delete BEFORE DELETE ON opinion_affected_fslis BEGIN SELECT RAISE(ABORT,'opinion FSLI records are append only'); END;

CREATE TABLE report_signature_assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  signature_file_id TEXT NOT NULL,
  seal_file_id TEXT NOT NULL,
  signature_sha256 TEXT NOT NULL CHECK (length(signature_sha256)=64),
  seal_sha256 TEXT NOT NULL CHECK (length(seal_sha256)=64),
  signature_width INTEGER NOT NULL CHECK (signature_width BETWEEN 1 AND 4096),
  signature_height INTEGER NOT NULL CHECK (signature_height BETWEEN 1 AND 4096),
  seal_width INTEGER NOT NULL CHECK (seal_width BETWEEN 1 AND 4096),
  seal_height INTEGER NOT NULL CHECK (seal_height BETWEEN 1 AND 4096),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','RETIRED')),
  uploaded_at TEXT NOT NULL,
  uploaded_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,staff_member_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,signature_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,seal_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,uploaded_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER report_signature_assets_no_update BEFORE UPDATE ON report_signature_assets BEGIN SELECT RAISE(ABORT,'signature asset records are immutable'); END;
CREATE TRIGGER report_signature_assets_no_delete BEFORE DELETE ON report_signature_assets BEGIN SELECT RAISE(ABORT,'signature asset records are immutable'); END;

CREATE TABLE financial_statement_drafts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  statement_snapshot_id TEXT NOT NULL,
  standards_profile_id TEXT NOT NULL,
  accounting_policies TEXT NOT NULL CHECK (length(trim(accounting_policies))>=20),
  oci_applicable INTEGER NOT NULL CHECK (oci_applicable IN (0,1)),
  completeness_checklist_json TEXT NOT NULL CHECK (json_valid(completeness_checklist_json)),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED')),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,statement_snapshot_id) REFERENCES statement_snapshots(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,standards_profile_id) REFERENCES standards_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,statement_snapshot_id)
);
CREATE TABLE disclosure_notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  note_number TEXT NOT NULL CHECK (length(trim(note_number)) BETWEEN 1 AND 40),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 10 AND 30000),
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor BETWEEN -9007199254740991 AND 9007199254740991),
  supporting_file_id TEXT,
  sort_order INTEGER NOT NULL CHECK (sort_order>=0),
  FOREIGN KEY (workspace_id,draft_id) REFERENCES financial_statement_drafts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,supporting_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,draft_id,note_number)
);
CREATE TABLE statement_supplement_lines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('CASH_FLOW','EQUITY_CHANGE','OCI')),
  code TEXT NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 80),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 500),
  current_minor INTEGER NOT NULL CHECK (current_minor BETWEEN -9007199254740991 AND 9007199254740991),
  prior_minor INTEGER CHECK (prior_minor IS NULL OR prior_minor BETWEEN -9007199254740991 AND 9007199254740991),
  supporting_file_id TEXT,
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  FOREIGN KEY (workspace_id,draft_id) REFERENCES financial_statement_drafts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,supporting_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,draft_id,section,code)
);
CREATE TABLE financial_statement_approvals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  draft_version INTEGER NOT NULL,
  statement_snapshot_id TEXT NOT NULL,
  notes_hash TEXT NOT NULL CHECK (length(notes_hash)=64),
  supplement_hash TEXT NOT NULL CHECK (length(supplement_hash)=64),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,draft_id) REFERENCES financial_statement_drafts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,statement_snapshot_id) REFERENCES statement_snapshots(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,draft_id,draft_version)
);
CREATE TRIGGER financial_statement_approvals_no_update BEFORE UPDATE ON financial_statement_approvals BEGIN SELECT RAISE(ABORT,'financial statement approvals are append only'); END;
CREATE TRIGGER financial_statement_approvals_no_delete BEFORE DELETE ON financial_statement_approvals BEGIN SELECT RAISE(ABORT,'financial statement approvals are append only'); END;
CREATE TRIGGER financial_statement_drafts_approved_immutable BEFORE UPDATE ON financial_statement_drafts WHEN OLD.status='APPROVED'
BEGIN SELECT RAISE(ABORT,'approved financial statement drafts are immutable'); END;
CREATE TRIGGER financial_statement_drafts_no_delete BEFORE DELETE ON financial_statement_drafts
BEGIN SELECT RAISE(ABORT,'financial statement draft history is retained'); END;
CREATE TRIGGER disclosure_notes_frozen_after_approval BEFORE UPDATE ON disclosure_notes WHEN EXISTS(SELECT 1 FROM financial_statement_approvals a WHERE a.workspace_id=OLD.workspace_id AND a.draft_id=OLD.draft_id)
BEGIN SELECT RAISE(ABORT,'approved disclosure notes are frozen'); END;
CREATE TRIGGER disclosure_notes_no_delete_after_approval BEFORE DELETE ON disclosure_notes WHEN EXISTS(SELECT 1 FROM financial_statement_approvals a WHERE a.workspace_id=OLD.workspace_id AND a.draft_id=OLD.draft_id)
BEGIN SELECT RAISE(ABORT,'approved disclosure notes are frozen'); END;
CREATE TRIGGER supplements_frozen_after_approval BEFORE UPDATE ON statement_supplement_lines WHEN EXISTS(SELECT 1 FROM financial_statement_approvals a WHERE a.workspace_id=OLD.workspace_id AND a.draft_id=OLD.draft_id)
BEGIN SELECT RAISE(ABORT,'approved statement supplements are frozen'); END;
CREATE TRIGGER supplements_no_delete_after_approval BEFORE DELETE ON statement_supplement_lines WHEN EXISTS(SELECT 1 FROM financial_statement_approvals a WHERE a.workspace_id=OLD.workspace_id AND a.draft_id=OLD.draft_id)
BEGIN SELECT RAISE(ABORT,'approved statement supplements are frozen'); END;

CREATE TABLE report_candidates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  opinion_version_id TEXT NOT NULL,
  financial_statement_approval_id TEXT NOT NULL,
  report_artifact_id TEXT,
  proposed_report_date TEXT NOT NULL,
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  status TEXT NOT NULL CHECK (status IN ('PREPARING','READY','FAILED','SUPERSEDED')),
  failure_code TEXT,
  prepared_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,opinion_version_id) REFERENCES opinion_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,financial_statement_approval_id) REFERENCES financial_statement_approvals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,report_artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prepared_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
ALTER TABLE report_candidates ADD COLUMN signature_asset_id TEXT REFERENCES report_signature_assets(id) ON DELETE RESTRICT;

CREATE TABLE management_letter_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  items_snapshot_json TEXT NOT NULL CHECK (json_valid(items_snapshot_json)),
  no_reportable_deficiencies_reason TEXT,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  artifact_id TEXT,
  file_version_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('PREPARING','READY','FAILED')),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision),
  CHECK ((status='READY' AND artifact_id IS NOT NULL AND file_version_id IS NOT NULL) OR status<>'READY'),
  CHECK (length(trim(COALESCE(no_reportable_deficiencies_reason,'')))>=10 OR json_array_length(items_snapshot_json)>0)
);
CREATE TRIGGER management_letter_versions_no_update BEFORE UPDATE ON management_letter_versions WHEN OLD.status='READY'
BEGIN SELECT RAISE(ABORT,'ready management letter versions are immutable'); END;
CREATE TRIGGER management_letter_versions_no_delete BEFORE DELETE ON management_letter_versions BEGIN SELECT RAISE(ABORT,'management letter history is retained'); END;

CREATE TABLE representation_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  template_artifact_id TEXT,
  template_file_id TEXT,
  proposed_report_date TEXT NOT NULL,
  required_signatories_json TEXT NOT NULL CHECK (json_valid(required_signatories_json) AND json_array_length(required_signatories_json)>0),
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  status TEXT NOT NULL CHECK (status IN ('PREPARING','PREPARED','SENT','RECEIVED','REJECTED','ACCEPTED','FAILED')),
  dispatch_id TEXT,
  current_return_id TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,template_artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,template_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,dispatch_id) REFERENCES dispatches(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TABLE representation_returns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  signed_file_id TEXT NOT NULL,
  file_sha256 TEXT NOT NULL CHECK (length(file_sha256)=64),
  representation_date TEXT NOT NULL,
  signatory_names TEXT NOT NULL CHECK (length(trim(signatory_names)) BETWEEN 1 AND 2000),
  received_by_actor_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  FOREIGN KEY (workspace_id,request_id) REFERENCES representation_requests(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,signed_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,received_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,request_id,revision)
);
CREATE TABLE representation_reviews (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  return_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ACCEPT','REJECT')),
  review_reason TEXT NOT NULL CHECK (length(trim(review_reason)) BETWEEN 10 AND 10000),
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  reviewed_by_actor_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,request_id) REFERENCES representation_requests(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,return_id) REFERENCES representation_returns(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reviewed_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER representation_returns_no_update BEFORE UPDATE ON representation_returns BEGIN SELECT RAISE(ABORT,'signed representation returns are immutable'); END;
CREATE TRIGGER representation_returns_no_delete BEFORE DELETE ON representation_returns BEGIN SELECT RAISE(ABORT,'signed representation returns are immutable'); END;
CREATE TRIGGER representation_reviews_no_update BEFORE UPDATE ON representation_reviews BEGIN SELECT RAISE(ABORT,'representation reviews are immutable'); END;
CREATE TRIGGER representation_reviews_no_delete BEFORE DELETE ON representation_reviews BEGIN SELECT RAISE(ABORT,'representation reviews are immutable'); END;

CREATE TABLE report_signature_consents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  signature_asset_id TEXT NOT NULL,
  opinion_version_id TEXT NOT NULL,
  report_candidate_id TEXT NOT NULL,
  candidate_content_hash TEXT NOT NULL CHECK (length(candidate_content_hash)=64),
  proposed_report_date TEXT NOT NULL,
  consent_text TEXT NOT NULL CHECK (length(trim(consent_text)) BETWEEN 10 AND 10000),
  consented_at TEXT NOT NULL,
  attribution TEXT NOT NULL CHECK (attribution='SELF_ASSERTED_PERSONA'),
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,signature_asset_id) REFERENCES report_signature_assets(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,opinion_version_id) REFERENCES opinion_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,report_candidate_id) REFERENCES report_candidates(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TABLE report_signatures (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  consent_id TEXT NOT NULL,
  report_artifact_id TEXT NOT NULL,
  signature_file_sha256 TEXT NOT NULL CHECK (length(signature_file_sha256)=64),
  seal_file_sha256 TEXT NOT NULL CHECK (length(seal_file_sha256)=64),
  signed_at TEXT NOT NULL,
  report_date TEXT NOT NULL,
  final_file_sha256 TEXT NOT NULL CHECK (length(final_file_sha256)=64),
  signing_method TEXT NOT NULL CHECK (signing_method='IMAGE_WITH_AUDIT_PROVENANCE'),
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,consent_id) REFERENCES report_signature_consents(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,report_artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id)
);
CREATE TRIGGER report_signature_consents_no_update BEFORE UPDATE ON report_signature_consents BEGIN SELECT RAISE(ABORT,'report signature consents are immutable'); END;
CREATE TRIGGER report_signature_consents_no_delete BEFORE DELETE ON report_signature_consents BEGIN SELECT RAISE(ABORT,'report signature consents are immutable'); END;
CREATE TRIGGER report_signatures_no_update BEFORE UPDATE ON report_signatures BEGIN SELECT RAISE(ABORT,'report signature records are immutable'); END;
CREATE TRIGGER report_signatures_no_delete BEFORE DELETE ON report_signatures BEGIN SELECT RAISE(ABORT,'report signature records are immutable'); END;

ALTER TABLE representation_requests ADD COLUMN contact_route_id TEXT REFERENCES contact_routes(id) ON DELETE RESTRICT;

CREATE TABLE bundle_candidates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  report_candidate_id TEXT NOT NULL,
  management_letter_version_id TEXT NOT NULL,
  representation_request_id TEXT NOT NULL,
  final_invoice_id TEXT,
  staged_final_invoice_id TEXT NOT NULL,
  staged_invoice_number TEXT NOT NULL,
  final_fee_minor INTEGER NOT NULL CHECK (final_fee_minor BETWEEN 0 AND 9007199254740991),
  final_tax_minor INTEGER NOT NULL CHECK (final_tax_minor BETWEEN 0 AND 9007199254740991),
  tax_policy_version_id TEXT NOT NULL,
  fee_revision_id TEXT NOT NULL,
  engagement_letter_id TEXT NOT NULL,
  invoice_due_date TEXT NOT NULL,
  recipient_snapshot_json TEXT NOT NULL CHECK (json_valid(recipient_snapshot_json)),
  dependency_hash TEXT NOT NULL CHECK (length(dependency_hash)=64),
  content_hash TEXT CHECK (content_hash IS NULL OR length(content_hash)=64),
  status TEXT NOT NULL CHECK (status IN ('PREPARING','READY','FAILED','RELEASED','SUPERSEDED')),
  failure_code TEXT,
  prepared_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,report_candidate_id) REFERENCES report_candidates(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,management_letter_version_id) REFERENCES management_letter_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,representation_request_id) REFERENCES representation_requests(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,final_invoice_id) REFERENCES invoices(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tax_policy_version_id) REFERENCES billing_tax_policy_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fee_revision_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,engagement_letter_id) REFERENCES engagement_letters(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prepared_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision)
);
CREATE TABLE bundle_candidate_parts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('REPORT_AND_FS','MANAGEMENT_LETTER','REPRESENTATION','CORRESPONDENCE_TRAIL','FINAL_FEE_NOTE')),
  primary_file_id TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256)=64),
  size_bytes INTEGER NOT NULL CHECK (size_bytes>0),
  FOREIGN KEY (workspace_id,candidate_id) REFERENCES bundle_candidates(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,primary_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,candidate_id,kind)
);
CREATE TABLE deliverable_bundles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  candidate_id TEXT NOT NULL,
  opinion_version_id TEXT NOT NULL,
  srm_version_id TEXT NOT NULL,
  report_candidate_id TEXT NOT NULL,
  representation_request_id TEXT NOT NULL,
  final_invoice_id TEXT NOT NULL,
  report_signature_id TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash)=64),
  released_by_actor_id TEXT NOT NULL,
  released_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,candidate_id) REFERENCES bundle_candidates(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,opinion_version_id) REFERENCES opinion_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,srm_version_id) REFERENCES srm_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,report_candidate_id) REFERENCES report_candidates(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,representation_request_id) REFERENCES representation_requests(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,final_invoice_id) REFERENCES invoices(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,report_signature_id) REFERENCES report_signatures(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,released_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision),
  UNIQUE (workspace_id,candidate_id)
);
CREATE TABLE deliverable_parts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('REPORT_AND_FS','MANAGEMENT_LETTER','REPRESENTATION','CORRESPONDENCE_TRAIL','FINAL_FEE_NOTE')),
  primary_file_id TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256)=64),
  size_bytes INTEGER NOT NULL CHECK (size_bytes>0),
  FOREIGN KEY (workspace_id,bundle_id) REFERENCES deliverable_bundles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,primary_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,bundle_id,kind)
);
CREATE TABLE deliverable_attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  part_id TEXT NOT NULL,
  file_version_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (length(trim(purpose)) BETWEEN 1 AND 200),
  FOREIGN KEY (workspace_id,part_id) REFERENCES deliverable_parts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,part_id,file_version_id)
);
CREATE TABLE bundle_deliveries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  dispatch_id TEXT,
  method TEXT NOT NULL CHECK (method IN ('EMAIL','PORTAL_ACKNOWLEDGEMENT','RECORDED_HANDOVER')),
  delivered_at TEXT NOT NULL,
  evidence_file_id TEXT,
  recorded_by_actor_id TEXT,
  FOREIGN KEY (workspace_id,bundle_id) REFERENCES deliverable_bundles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,dispatch_id) REFERENCES dispatches(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,recorded_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TABLE portal_freezes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  frozen_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason='FINAL_REPORT_RELEASE'),
  actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,bundle_id) REFERENCES deliverable_bundles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id)
);
CREATE TRIGGER deliverable_bundles_no_update BEFORE UPDATE ON deliverable_bundles BEGIN SELECT RAISE(ABORT,'released bundle records are immutable'); END;
CREATE TRIGGER deliverable_bundles_no_delete BEFORE DELETE ON deliverable_bundles BEGIN SELECT RAISE(ABORT,'released bundle records are immutable'); END;
CREATE TRIGGER deliverable_parts_no_update BEFORE UPDATE ON deliverable_parts BEGIN SELECT RAISE(ABORT,'released deliverable parts are immutable'); END;
CREATE TRIGGER deliverable_parts_no_delete BEFORE DELETE ON deliverable_parts BEGIN SELECT RAISE(ABORT,'released deliverable parts are immutable'); END;
CREATE TRIGGER deliverable_attachments_no_update BEFORE UPDATE ON deliverable_attachments BEGIN SELECT RAISE(ABORT,'released bundle attachments are immutable'); END;
CREATE TRIGGER deliverable_attachments_no_delete BEFORE DELETE ON deliverable_attachments BEGIN SELECT RAISE(ABORT,'released bundle attachments are immutable'); END;
CREATE TRIGGER portal_freezes_no_update BEFORE UPDATE ON portal_freezes BEGIN SELECT RAISE(ABORT,'portal freezes are immutable'); END;
CREATE TRIGGER portal_freezes_no_delete BEFORE DELETE ON portal_freezes BEGIN SELECT RAISE(ABORT,'portal freezes are immutable'); END;

CREATE TABLE retention_policies (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  assembly_days INTEGER NOT NULL CHECK (assembly_days=60),
  retention_years INTEGER CHECK (retention_years IS NULL OR retention_years>0),
  retain_indefinitely INTEGER NOT NULL CHECK (retain_indefinitely IN (0,1)),
  legal_basis TEXT NOT NULL CHECK (length(trim(legal_basis)) BETWEEN 10 AND 10000),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,version),
  CHECK ((retention_years IS NOT NULL AND retain_indefinitely=0) OR (retention_years IS NULL AND retain_indefinitely=1))
);
CREATE TABLE archive_assembly_notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  text TEXT NOT NULL CHECK (length(trim(text)) BETWEEN 10 AND 10000),
  related_record_type TEXT NOT NULL CHECK (length(trim(related_record_type)) BETWEEN 1 AND 120),
  related_record_id TEXT NOT NULL,
  recorded_by_actor_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  administrative_only INTEGER NOT NULL CHECK (administrative_only=1),
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,recorded_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TABLE archive_seals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  sealed_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('DEADLINE','EARLY_PARTNER_LOCK')),
  manifest_file_id TEXT NOT NULL,
  archive_file_id TEXT NOT NULL,
  audit_chain_head TEXT NOT NULL CHECK (length(audit_chain_head)=64),
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256)=64),
  archive_sha256 TEXT NOT NULL CHECK (length(archive_sha256)=64),
  record_count INTEGER NOT NULL CHECK (record_count>=0),
  file_count INTEGER NOT NULL CHECK (file_count>=0),
  retention_policy_id TEXT NOT NULL,
  locked_by_actor_id TEXT,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,bundle_id) REFERENCES deliverable_bundles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,manifest_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,archive_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,retention_policy_id) REFERENCES retention_policies(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,locked_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id)
);
CREATE TABLE archive_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','FREEZING','ASSEMBLING','SEALED','FAILED')),
  frozen_snapshot_hash TEXT CHECK (frozen_snapshot_hash IS NULL OR length(frozen_snapshot_hash)=64),
  missing_files_json TEXT NOT NULL CHECK (json_valid(missing_files_json)),
  error_code TEXT,
  last_attempt_at TEXT,
  job_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,engagement_id) REFERENCES engagements(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,job_id) REFERENCES outbox_jobs(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id)
);
CREATE TABLE operational_access_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('READ','DOWNLOAD','EXPORT','DENIED_WRITE')),
  occurred_at TEXT NOT NULL,
  actor_id TEXT,
  FOREIGN KEY (workspace_id,engagement_id) REFERENCES engagements(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TABLE rejected_upload_attempts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  file_reservation_id TEXT,
  attempted_at TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  actor_id TEXT,
  FOREIGN KEY (workspace_id,engagement_id) REFERENCES engagements(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_reservation_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER archive_seals_no_update BEFORE UPDATE ON archive_seals BEGIN SELECT RAISE(ABORT,'archive seals are immutable'); END;
CREATE TRIGGER archive_seals_no_delete BEFORE DELETE ON archive_seals BEGIN SELECT RAISE(ABORT,'archive seals are immutable'); END;
CREATE TRIGGER archive_notes_no_update BEFORE UPDATE ON archive_assembly_notes BEGIN SELECT RAISE(ABORT,'archive assembly notes are immutable'); END;
CREATE TRIGGER archive_notes_no_delete BEFORE DELETE ON archive_assembly_notes BEGIN SELECT RAISE(ABORT,'archive assembly notes are immutable'); END;
