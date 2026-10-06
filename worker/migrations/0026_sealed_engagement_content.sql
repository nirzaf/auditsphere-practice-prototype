-- Once a release is sealed, engagement evidence and decisions are immutable in D1.
-- Audit/operational history, archive-run state, and payment collections remain writable.

CREATE TRIGGER sealed_engagements_insert BEFORE INSERT ON engagements
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagements_update BEFORE UPDATE ON engagements
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.id)
  OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagements_delete BEFORE DELETE ON engagements
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_analytical_reviews_insert BEFORE INSERT ON analytical_reviews
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_analytical_reviews_update BEFORE UPDATE ON analytical_reviews
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_analytical_reviews_delete BEFORE DELETE ON analytical_reviews
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_approval_decisions_insert BEFORE INSERT ON approval_decisions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_approval_decisions_update BEFORE UPDATE ON approval_decisions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_approval_decisions_delete BEFORE DELETE ON approval_decisions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_approval_dependencies_insert BEFORE INSERT ON approval_dependencies
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_approval_dependencies_update BEFORE UPDATE ON approval_dependencies
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_approval_dependencies_delete BEFORE DELETE ON approval_dependencies
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_archive_assembly_notes_insert BEFORE INSERT ON archive_assembly_notes
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_archive_assembly_notes_update BEFORE UPDATE ON archive_assembly_notes
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_archive_assembly_notes_delete BEFORE DELETE ON archive_assembly_notes
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_audit_adjustments_insert BEFORE INSERT ON audit_adjustments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_adjustments_update BEFORE UPDATE ON audit_adjustments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_adjustments_delete BEFORE DELETE ON audit_adjustments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_audit_differences_insert BEFORE INSERT ON audit_differences
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_differences_update BEFORE UPDATE ON audit_differences
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_differences_delete BEFORE DELETE ON audit_differences
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_bundle_candidates_insert BEFORE INSERT ON bundle_candidates
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_bundle_candidates_update BEFORE UPDATE ON bundle_candidates
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_bundle_candidates_delete BEFORE DELETE ON bundle_candidates
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_commercial_acceptances_insert BEFORE INSERT ON commercial_acceptances
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_commercial_acceptances_update BEFORE UPDATE ON commercial_acceptances
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_commercial_acceptances_delete BEFORE DELETE ON commercial_acceptances
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_confirmation_alternative_procedures_insert BEFORE INSERT ON confirmation_alternative_procedures
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_confirmation_alternative_procedures_update BEFORE UPDATE ON confirmation_alternative_procedures
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_confirmation_alternative_procedures_delete BEFORE DELETE ON confirmation_alternative_procedures
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_confirmation_followups_insert BEFORE INSERT ON confirmation_followups
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_confirmation_followups_update BEFORE UPDATE ON confirmation_followups
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_confirmation_followups_delete BEFORE DELETE ON confirmation_followups
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_confirmation_scope_reassessments_insert BEFORE INSERT ON confirmation_scope_reassessments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_confirmation_scope_reassessments_update BEFORE UPDATE ON confirmation_scope_reassessments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_confirmation_scope_reassessments_delete BEFORE DELETE ON confirmation_scope_reassessments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_confirmations_insert BEFORE INSERT ON confirmations
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_confirmations_update BEFORE UPDATE ON confirmations
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_confirmations_delete BEFORE DELETE ON confirmations
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_continuance_baselines_insert BEFORE INSERT ON continuance_baselines
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_baselines_update BEFORE UPDATE ON continuance_baselines
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_baselines_delete BEFORE DELETE ON continuance_baselines
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_continuance_delta_revisions_insert BEFORE INSERT ON continuance_delta_revisions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_delta_revisions_update BEFORE UPDATE ON continuance_delta_revisions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_delta_revisions_delete BEFORE DELETE ON continuance_delta_revisions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_continuance_reviews_insert BEFORE INSERT ON continuance_reviews
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_reviews_update BEFORE UPDATE ON continuance_reviews
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_reviews_delete BEFORE DELETE ON continuance_reviews
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_deliverable_bundles_insert BEFORE INSERT ON deliverable_bundles
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_deliverable_bundles_update BEFORE UPDATE ON deliverable_bundles
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_deliverable_bundles_delete BEFORE DELETE ON deliverable_bundles
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_engagement_assignments_insert BEFORE INSERT ON engagement_assignments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_assignments_update BEFORE UPDATE ON engagement_assignments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_assignments_delete BEFORE DELETE ON engagement_assignments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_engagement_folders_insert BEFORE INSERT ON engagement_folders
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_folders_update BEFORE UPDATE ON engagement_folders
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_folders_delete BEFORE DELETE ON engagement_folders
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_engagement_letter_drafts_insert BEFORE INSERT ON engagement_letter_drafts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_letter_drafts_update BEFORE UPDATE ON engagement_letter_drafts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_letter_drafts_delete BEFORE DELETE ON engagement_letter_drafts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_engagement_letters_insert BEFORE INSERT ON engagement_letters
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_letters_update BEFORE UPDATE ON engagement_letters
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_letters_delete BEFORE DELETE ON engagement_letters
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_evidence_links_insert BEFORE INSERT ON evidence_links
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_evidence_links_update BEFORE UPDATE ON evidence_links
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_evidence_links_delete BEFORE DELETE ON evidence_links
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_evidence_records_insert BEFORE INSERT ON evidence_records
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_evidence_records_update BEFORE UPDATE ON evidence_records
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_evidence_records_delete BEFORE DELETE ON evidence_records
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_fieldwork_change_feed_insert BEFORE INSERT ON fieldwork_change_feed
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_fieldwork_change_feed_update BEFORE UPDATE ON fieldwork_change_feed
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_fieldwork_change_feed_delete BEFORE DELETE ON fieldwork_change_feed
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_file_objects_insert BEFORE INSERT ON file_objects
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_file_objects_update BEFORE UPDATE ON file_objects
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_file_objects_delete BEFORE DELETE ON file_objects
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_financial_statement_approvals_insert BEFORE INSERT ON financial_statement_approvals
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_financial_statement_approvals_update BEFORE UPDATE ON financial_statement_approvals
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_financial_statement_approvals_delete BEFORE DELETE ON financial_statement_approvals
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_financial_statement_drafts_insert BEFORE INSERT ON financial_statement_drafts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_financial_statement_drafts_update BEFORE UPDATE ON financial_statement_drafts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_financial_statement_drafts_delete BEFORE DELETE ON financial_statement_drafts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_findings_insert BEFORE INSERT ON findings
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_findings_update BEFORE UPDATE ON findings
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_findings_delete BEFORE DELETE ON findings
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_fsli_risks_insert BEFORE INSERT ON fsli_risks
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_fsli_risks_update BEFORE UPDATE ON fsli_risks
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_fsli_risks_delete BEFORE DELETE ON fsli_risks
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_going_concern_assessments_insert BEFORE INSERT ON going_concern_assessments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_going_concern_assessments_update BEFORE UPDATE ON going_concern_assessments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_going_concern_assessments_delete BEFORE DELETE ON going_concern_assessments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_holding_letters_insert BEFORE INSERT ON holding_letters
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_holding_letters_update BEFORE UPDATE ON holding_letters
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_holding_letters_delete BEFORE DELETE ON holding_letters
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_management_letter_versions_insert BEFORE INSERT ON management_letter_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_management_letter_versions_update BEFORE UPDATE ON management_letter_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_management_letter_versions_delete BEFORE DELETE ON management_letter_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_mapping_drafts_insert BEFORE INSERT ON mapping_drafts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_mapping_drafts_update BEFORE UPDATE ON mapping_drafts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_mapping_drafts_delete BEFORE DELETE ON mapping_drafts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_mapping_versions_insert BEFORE INSERT ON mapping_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_mapping_versions_update BEFORE UPDATE ON mapping_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_mapping_versions_delete BEFORE DELETE ON mapping_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_materiality_versions_insert BEFORE INSERT ON materiality_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_materiality_versions_update BEFORE UPDATE ON materiality_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_materiality_versions_delete BEFORE DELETE ON materiality_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_milestones_insert BEFORE INSERT ON milestones
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_milestones_update BEFORE UPDATE ON milestones
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_milestones_delete BEFORE DELETE ON milestones
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_opinion_versions_insert BEFORE INSERT ON opinion_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_opinion_versions_update BEFORE UPDATE ON opinion_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_opinion_versions_delete BEFORE DELETE ON opinion_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_pbc_requests_insert BEFORE INSERT ON pbc_requests
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_pbc_requests_update BEFORE UPDATE ON pbc_requests
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_pbc_requests_delete BEFORE DELETE ON pbc_requests
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_planning_versions_insert BEFORE INSERT ON planning_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_planning_versions_update BEFORE UPDATE ON planning_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_planning_versions_delete BEFORE DELETE ON planning_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_portal_freezes_insert BEFORE INSERT ON portal_freezes
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_portal_freezes_update BEFORE UPDATE ON portal_freezes
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_portal_freezes_delete BEFORE DELETE ON portal_freezes
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_proposal_approvals_insert BEFORE INSERT ON proposal_approvals
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_proposal_approvals_update BEFORE UPDATE ON proposal_approvals
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_proposal_approvals_delete BEFORE DELETE ON proposal_approvals
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_proposal_artifacts_insert BEFORE INSERT ON proposal_artifacts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_proposal_artifacts_update BEFORE UPDATE ON proposal_artifacts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_proposal_artifacts_delete BEFORE DELETE ON proposal_artifacts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_proposal_versions_insert BEFORE INSERT ON proposal_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_proposal_versions_update BEFORE UPDATE ON proposal_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_proposal_versions_delete BEFORE DELETE ON proposal_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_proposals_insert BEFORE INSERT ON proposals
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_proposals_update BEFORE UPDATE ON proposals
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_proposals_delete BEFORE DELETE ON proposals
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_report_candidates_insert BEFORE INSERT ON report_candidates
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_report_candidates_update BEFORE UPDATE ON report_candidates
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_report_candidates_delete BEFORE DELETE ON report_candidates
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_report_signature_consents_insert BEFORE INSERT ON report_signature_consents
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_report_signature_consents_update BEFORE UPDATE ON report_signature_consents
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_report_signature_consents_delete BEFORE DELETE ON report_signature_consents
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_report_signatures_insert BEFORE INSERT ON report_signatures
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_report_signatures_update BEFORE UPDATE ON report_signatures
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_report_signatures_delete BEFORE DELETE ON report_signatures
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_representation_requests_insert BEFORE INSERT ON representation_requests
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_representation_requests_update BEFORE UPDATE ON representation_requests
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_representation_requests_delete BEFORE DELETE ON representation_requests
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_review_submissions_insert BEFORE INSERT ON review_submissions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_review_submissions_update BEFORE UPDATE ON review_submissions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_review_submissions_delete BEFORE DELETE ON review_submissions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_risk_assessment_versions_insert BEFORE INSERT ON risk_assessment_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_assessment_versions_update BEFORE UPDATE ON risk_assessment_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_assessment_versions_delete BEFORE DELETE ON risk_assessment_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_risk_assessments_insert BEFORE INSERT ON risk_assessments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_assessments_update BEFORE UPDATE ON risk_assessments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_assessments_delete BEFORE DELETE ON risk_assessments
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_risk_checks_insert BEFORE INSERT ON risk_checks
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_checks_update BEFORE UPDATE ON risk_checks
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_checks_delete BEFORE DELETE ON risk_checks
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_risk_clearances_insert BEFORE INSERT ON risk_clearances
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_clearances_update BEFORE UPDATE ON risk_clearances
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_clearances_delete BEFORE DELETE ON risk_clearances
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_risk_escalations_insert BEFORE INSERT ON risk_escalations
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_escalations_update BEFORE UPDATE ON risk_escalations
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_escalations_delete BEFORE DELETE ON risk_escalations
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_sample_populations_insert BEFORE INSERT ON sample_populations
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sample_populations_update BEFORE UPDATE ON sample_populations
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sample_populations_delete BEFORE DELETE ON sample_populations
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_srm_versions_insert BEFORE INSERT ON srm_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_srm_versions_update BEFORE UPDATE ON srm_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_srm_versions_delete BEFORE DELETE ON srm_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_state_transitions_insert BEFORE INSERT ON state_transitions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_state_transitions_update BEFORE UPDATE ON state_transitions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_state_transitions_delete BEFORE DELETE ON state_transitions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_statement_snapshots_insert BEFORE INSERT ON statement_snapshots
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_statement_snapshots_update BEFORE UPDATE ON statement_snapshots
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_statement_snapshots_delete BEFORE DELETE ON statement_snapshots
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_tb_imports_insert BEFORE INSERT ON tb_imports
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_imports_update BEFORE UPDATE ON tb_imports
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_imports_delete BEFORE DELETE ON tb_imports
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_tb_lines_insert BEFORE INSERT ON tb_lines
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_lines_update BEFORE UPDATE ON tb_lines
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_lines_delete BEFORE DELETE ON tb_lines
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_tb_versions_insert BEFORE INSERT ON tb_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_versions_update BEFORE UPDATE ON tb_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_versions_delete BEFORE DELETE ON tb_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_workprograms_insert BEFORE INSERT ON workprograms
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_workprograms_update BEFORE UPDATE ON workprograms
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_workprograms_delete BEFORE DELETE ON workprograms
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_workspace_entities_insert BEFORE INSERT ON workspace_entities
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_workspace_entities_update BEFORE UPDATE ON workspace_entities
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id) OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_workspace_entities_delete BEFORE DELETE ON workspace_entities
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_analytical_ratios_insert BEFORE INSERT ON analytical_ratios
WHEN (EXISTS(SELECT 1 FROM analytical_reviews p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.analytical_review_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_analytical_ratios_update BEFORE UPDATE ON analytical_ratios
WHEN (EXISTS(SELECT 1 FROM analytical_reviews p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.analytical_review_id)) OR (EXISTS(SELECT 1 FROM analytical_reviews p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.analytical_review_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_analytical_ratios_delete BEFORE DELETE ON analytical_ratios
WHEN (EXISTS(SELECT 1 FROM analytical_reviews p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.analytical_review_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_audit_adjustment_evidence_links_insert BEFORE INSERT ON audit_adjustment_evidence_links
WHEN (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.adjustment_id) OR EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.evidence_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_adjustment_evidence_links_update BEFORE UPDATE ON audit_adjustment_evidence_links
WHEN (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.adjustment_id) OR EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.evidence_id)) OR (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.adjustment_id) OR EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.evidence_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_adjustment_evidence_links_delete BEFORE DELETE ON audit_adjustment_evidence_links
WHEN (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.adjustment_id) OR EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.evidence_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_audit_adjustment_lines_insert BEFORE INSERT ON audit_adjustment_lines
WHEN (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.adjustment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_adjustment_lines_update BEFORE UPDATE ON audit_adjustment_lines
WHEN (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.adjustment_id)) OR (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.adjustment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_adjustment_lines_delete BEFORE DELETE ON audit_adjustment_lines
WHEN (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.adjustment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_audit_adjustment_revisions_insert BEFORE INSERT ON audit_adjustment_revisions
WHEN (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.adjustment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_adjustment_revisions_update BEFORE UPDATE ON audit_adjustment_revisions
WHEN (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.adjustment_id)) OR (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.adjustment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_audit_adjustment_revisions_delete BEFORE DELETE ON audit_adjustment_revisions
WHEN (EXISTS(SELECT 1 FROM audit_adjustments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.adjustment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_benchmark_adjustments_insert BEFORE INSERT ON benchmark_adjustments
WHEN (EXISTS(SELECT 1 FROM materiality_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.materiality_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_benchmark_adjustments_update BEFORE UPDATE ON benchmark_adjustments
WHEN (EXISTS(SELECT 1 FROM materiality_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.materiality_version_id)) OR (EXISTS(SELECT 1 FROM materiality_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.materiality_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_benchmark_adjustments_delete BEFORE DELETE ON benchmark_adjustments
WHEN (EXISTS(SELECT 1 FROM materiality_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.materiality_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_bundle_candidate_parts_insert BEFORE INSERT ON bundle_candidate_parts
WHEN (EXISTS(SELECT 1 FROM bundle_candidates p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.candidate_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_bundle_candidate_parts_update BEFORE UPDATE ON bundle_candidate_parts
WHEN (EXISTS(SELECT 1 FROM bundle_candidates p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.candidate_id)) OR (EXISTS(SELECT 1 FROM bundle_candidates p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.candidate_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_bundle_candidate_parts_delete BEFORE DELETE ON bundle_candidate_parts
WHEN (EXISTS(SELECT 1 FROM bundle_candidates p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.candidate_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_bundle_deliveries_insert BEFORE INSERT ON bundle_deliveries
WHEN (EXISTS(SELECT 1 FROM deliverable_bundles p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.bundle_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_bundle_deliveries_update BEFORE UPDATE ON bundle_deliveries
WHEN (EXISTS(SELECT 1 FROM deliverable_bundles p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.bundle_id)) OR (EXISTS(SELECT 1 FROM deliverable_bundles p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.bundle_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_bundle_deliveries_delete BEFORE DELETE ON bundle_deliveries
WHEN (EXISTS(SELECT 1 FROM deliverable_bundles p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.bundle_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_continuance_baseline_evidence_insert BEFORE INSERT ON continuance_baseline_evidence
WHEN (EXISTS(SELECT 1 FROM continuance_baselines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.baseline_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_baseline_evidence_update BEFORE UPDATE ON continuance_baseline_evidence
WHEN (EXISTS(SELECT 1 FROM continuance_baselines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.baseline_id)) OR (EXISTS(SELECT 1 FROM continuance_baselines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.baseline_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_baseline_evidence_delete BEFORE DELETE ON continuance_baseline_evidence
WHEN (EXISTS(SELECT 1 FROM continuance_baselines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.baseline_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_continuance_baseline_sources_insert BEFORE INSERT ON continuance_baseline_sources
WHEN (EXISTS(SELECT 1 FROM continuance_baselines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.baseline_id) OR EXISTS(SELECT 1 FROM continuance_delta_revisions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.delta_revision_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_baseline_sources_update BEFORE UPDATE ON continuance_baseline_sources
WHEN (EXISTS(SELECT 1 FROM continuance_baselines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.baseline_id) OR EXISTS(SELECT 1 FROM continuance_delta_revisions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.delta_revision_id)) OR (EXISTS(SELECT 1 FROM continuance_baselines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.baseline_id) OR EXISTS(SELECT 1 FROM continuance_delta_revisions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.delta_revision_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_baseline_sources_delete BEFORE DELETE ON continuance_baseline_sources
WHEN (EXISTS(SELECT 1 FROM continuance_baselines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.baseline_id) OR EXISTS(SELECT 1 FROM continuance_delta_revisions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.delta_revision_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_continuance_delta_evidence_insert BEFORE INSERT ON continuance_delta_evidence
WHEN (EXISTS(SELECT 1 FROM continuance_delta_revisions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.delta_revision_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_delta_evidence_update BEFORE UPDATE ON continuance_delta_evidence
WHEN (EXISTS(SELECT 1 FROM continuance_delta_revisions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.delta_revision_id)) OR (EXISTS(SELECT 1 FROM continuance_delta_revisions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.delta_revision_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_delta_evidence_delete BEFORE DELETE ON continuance_delta_evidence
WHEN (EXISTS(SELECT 1 FROM continuance_delta_revisions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.delta_revision_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_continuance_invoice_snapshots_insert BEFORE INSERT ON continuance_invoice_snapshots
WHEN (EXISTS(SELECT 1 FROM continuance_reviews p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.continuance_review_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_invoice_snapshots_update BEFORE UPDATE ON continuance_invoice_snapshots
WHEN (EXISTS(SELECT 1 FROM continuance_reviews p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.continuance_review_id)) OR (EXISTS(SELECT 1 FROM continuance_reviews p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.continuance_review_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_continuance_invoice_snapshots_delete BEFORE DELETE ON continuance_invoice_snapshots
WHEN (EXISTS(SELECT 1 FROM continuance_reviews p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.continuance_review_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_deliverable_attachments_insert BEFORE INSERT ON deliverable_attachments
WHEN (EXISTS(SELECT 1 FROM deliverable_parts p0 JOIN deliverable_bundles p1 ON p0.workspace_id=p1.workspace_id AND p0.bundle_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.part_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_deliverable_attachments_update BEFORE UPDATE ON deliverable_attachments
WHEN (EXISTS(SELECT 1 FROM deliverable_parts p0 JOIN deliverable_bundles p1 ON p0.workspace_id=p1.workspace_id AND p0.bundle_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.part_id)) OR (EXISTS(SELECT 1 FROM deliverable_parts p0 JOIN deliverable_bundles p1 ON p0.workspace_id=p1.workspace_id AND p0.bundle_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.part_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_deliverable_attachments_delete BEFORE DELETE ON deliverable_attachments
WHEN (EXISTS(SELECT 1 FROM deliverable_parts p0 JOIN deliverable_bundles p1 ON p0.workspace_id=p1.workspace_id AND p0.bundle_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.part_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_deliverable_parts_insert BEFORE INSERT ON deliverable_parts
WHEN (EXISTS(SELECT 1 FROM deliverable_bundles p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.bundle_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_deliverable_parts_update BEFORE UPDATE ON deliverable_parts
WHEN (EXISTS(SELECT 1 FROM deliverable_bundles p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.bundle_id)) OR (EXISTS(SELECT 1 FROM deliverable_bundles p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.bundle_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_deliverable_parts_delete BEFORE DELETE ON deliverable_parts
WHEN (EXISTS(SELECT 1 FROM deliverable_bundles p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.bundle_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_disclosure_notes_insert BEFORE INSERT ON disclosure_notes
WHEN (EXISTS(SELECT 1 FROM financial_statement_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.draft_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_disclosure_notes_update BEFORE UPDATE ON disclosure_notes
WHEN (EXISTS(SELECT 1 FROM financial_statement_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.draft_id)) OR (EXISTS(SELECT 1 FROM financial_statement_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.draft_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_disclosure_notes_delete BEFORE DELETE ON disclosure_notes
WHEN (EXISTS(SELECT 1 FROM financial_statement_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.draft_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_engagement_assignment_days_insert BEFORE INSERT ON engagement_assignment_days
WHEN (EXISTS(SELECT 1 FROM engagement_assignments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.assignment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_assignment_days_update BEFORE UPDATE ON engagement_assignment_days
WHEN (EXISTS(SELECT 1 FROM engagement_assignments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.assignment_id)) OR (EXISTS(SELECT 1 FROM engagement_assignments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.assignment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_engagement_assignment_days_delete BEFORE DELETE ON engagement_assignment_days
WHEN (EXISTS(SELECT 1 FROM engagement_assignments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.assignment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_evidence_adequacy_decisions_insert BEFORE INSERT ON evidence_adequacy_decisions
WHEN (EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.evidence_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_evidence_adequacy_decisions_update BEFORE UPDATE ON evidence_adequacy_decisions
WHEN (EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.evidence_id)) OR (EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.evidence_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_evidence_adequacy_decisions_delete BEFORE DELETE ON evidence_adequacy_decisions
WHEN (EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.evidence_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_evidence_unlinks_insert BEFORE INSERT ON evidence_unlinks
WHEN (EXISTS(SELECT 1 FROM evidence_links p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.evidence_link_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_evidence_unlinks_update BEFORE UPDATE ON evidence_unlinks
WHEN (EXISTS(SELECT 1 FROM evidence_links p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.evidence_link_id)) OR (EXISTS(SELECT 1 FROM evidence_links p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.evidence_link_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_evidence_unlinks_delete BEFORE DELETE ON evidence_unlinks
WHEN (EXISTS(SELECT 1 FROM evidence_links p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.evidence_link_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_mapping_draft_lines_insert BEFORE INSERT ON mapping_draft_lines
WHEN (EXISTS(SELECT 1 FROM mapping_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.draft_id) OR EXISTS(SELECT 1 FROM tb_lines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.tb_line_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_mapping_draft_lines_update BEFORE UPDATE ON mapping_draft_lines
WHEN (EXISTS(SELECT 1 FROM mapping_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.draft_id) OR EXISTS(SELECT 1 FROM tb_lines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.tb_line_id)) OR (EXISTS(SELECT 1 FROM mapping_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.draft_id) OR EXISTS(SELECT 1 FROM tb_lines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.tb_line_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_mapping_draft_lines_delete BEFORE DELETE ON mapping_draft_lines
WHEN (EXISTS(SELECT 1 FROM mapping_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.draft_id) OR EXISTS(SELECT 1 FROM tb_lines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.tb_line_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_mapping_memory_insert BEFORE INSERT ON mapping_memory
WHEN (EXISTS(SELECT 1 FROM mapping_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.source_mapping_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_mapping_memory_update BEFORE UPDATE ON mapping_memory
WHEN (EXISTS(SELECT 1 FROM mapping_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.source_mapping_version_id)) OR (EXISTS(SELECT 1 FROM mapping_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.source_mapping_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_mapping_memory_delete BEFORE DELETE ON mapping_memory
WHEN (EXISTS(SELECT 1 FROM mapping_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.source_mapping_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_opinion_affected_fslis_insert BEFORE INSERT ON opinion_affected_fslis
WHEN (EXISTS(SELECT 1 FROM opinion_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.opinion_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_opinion_affected_fslis_update BEFORE UPDATE ON opinion_affected_fslis
WHEN (EXISTS(SELECT 1 FROM opinion_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.opinion_version_id)) OR (EXISTS(SELECT 1 FROM opinion_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.opinion_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_opinion_affected_fslis_delete BEFORE DELETE ON opinion_affected_fslis
WHEN (EXISTS(SELECT 1 FROM opinion_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.opinion_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_partner_area_clearances_insert BEFORE INSERT ON partner_area_clearances
WHEN (EXISTS(SELECT 1 FROM workprograms p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.workprogram_id) OR EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.reviewed_submission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_partner_area_clearances_update BEFORE UPDATE ON partner_area_clearances
WHEN (EXISTS(SELECT 1 FROM workprograms p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.workprogram_id) OR EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.reviewed_submission_id)) OR (EXISTS(SELECT 1 FROM workprograms p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.workprogram_id) OR EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.reviewed_submission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_partner_area_clearances_delete BEFORE DELETE ON partner_area_clearances
WHEN (EXISTS(SELECT 1 FROM workprograms p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.workprogram_id) OR EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.reviewed_submission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_pbc_reviews_insert BEFORE INSERT ON pbc_reviews
WHEN (EXISTS(SELECT 1 FROM pbc_submissions p0 JOIN pbc_requests p1 ON p0.workspace_id=p1.workspace_id AND p0.request_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.submission_id) OR EXISTS(SELECT 1 FROM pbc_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_pbc_reviews_update BEFORE UPDATE ON pbc_reviews
WHEN (EXISTS(SELECT 1 FROM pbc_submissions p0 JOIN pbc_requests p1 ON p0.workspace_id=p1.workspace_id AND p0.request_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.submission_id) OR EXISTS(SELECT 1 FROM pbc_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id)) OR (EXISTS(SELECT 1 FROM pbc_submissions p0 JOIN pbc_requests p1 ON p0.workspace_id=p1.workspace_id AND p0.request_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.submission_id) OR EXISTS(SELECT 1 FROM pbc_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_pbc_reviews_delete BEFORE DELETE ON pbc_reviews
WHEN (EXISTS(SELECT 1 FROM pbc_submissions p0 JOIN pbc_requests p1 ON p0.workspace_id=p1.workspace_id AND p0.request_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.submission_id) OR EXISTS(SELECT 1 FROM pbc_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_pbc_submissions_insert BEFORE INSERT ON pbc_submissions
WHEN (EXISTS(SELECT 1 FROM pbc_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_pbc_submissions_update BEFORE UPDATE ON pbc_submissions
WHEN (EXISTS(SELECT 1 FROM pbc_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id)) OR (EXISTS(SELECT 1 FROM pbc_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_pbc_submissions_delete BEFORE DELETE ON pbc_submissions
WHEN (EXISTS(SELECT 1 FROM pbc_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_planning_signoffs_insert BEFORE INSERT ON planning_signoffs
WHEN (EXISTS(SELECT 1 FROM planning_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.planning_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_planning_signoffs_update BEFORE UPDATE ON planning_signoffs
WHEN (EXISTS(SELECT 1 FROM planning_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.planning_version_id)) OR (EXISTS(SELECT 1 FROM planning_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.planning_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_planning_signoffs_delete BEFORE DELETE ON planning_signoffs
WHEN (EXISTS(SELECT 1 FROM planning_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.planning_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_planning_stale_events_insert BEFORE INSERT ON planning_stale_events
WHEN (EXISTS(SELECT 1 FROM planning_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.planning_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_planning_stale_events_update BEFORE UPDATE ON planning_stale_events
WHEN (EXISTS(SELECT 1 FROM planning_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.planning_version_id)) OR (EXISTS(SELECT 1 FROM planning_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.planning_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_planning_stale_events_delete BEFORE DELETE ON planning_stale_events
WHEN (EXISTS(SELECT 1 FROM planning_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.planning_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_population_rows_insert BEFORE INSERT ON population_rows
WHEN (EXISTS(SELECT 1 FROM sample_populations p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_population_rows_update BEFORE UPDATE ON population_rows
WHEN (EXISTS(SELECT 1 FROM sample_populations p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_id)) OR (EXISTS(SELECT 1 FROM sample_populations p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_population_rows_delete BEFORE DELETE ON population_rows
WHEN (EXISTS(SELECT 1 FROM sample_populations p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_procedure_review_decisions_insert BEFORE INSERT ON procedure_review_decisions
WHEN (EXISTS(SELECT 1 FROM procedure_submissions p0 JOIN procedure_revisions p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.procedure_id AND p0.row_version=p1.row_version JOIN procedures p2 ON p1.workspace_id=p2.workspace_id AND p1.procedure_id=p2.id JOIN workprograms p3 ON p2.workspace_id=p3.workspace_id AND p2.workprogram_id=p3.id JOIN archive_seals s ON s.workspace_id=p3.workspace_id AND s.engagement_id=p3.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.submission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_procedure_review_decisions_update BEFORE UPDATE ON procedure_review_decisions
WHEN (EXISTS(SELECT 1 FROM procedure_submissions p0 JOIN procedure_revisions p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.procedure_id AND p0.row_version=p1.row_version JOIN procedures p2 ON p1.workspace_id=p2.workspace_id AND p1.procedure_id=p2.id JOIN workprograms p3 ON p2.workspace_id=p3.workspace_id AND p2.workprogram_id=p3.id JOIN archive_seals s ON s.workspace_id=p3.workspace_id AND s.engagement_id=p3.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.submission_id)) OR (EXISTS(SELECT 1 FROM procedure_submissions p0 JOIN procedure_revisions p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.procedure_id AND p0.row_version=p1.row_version JOIN procedures p2 ON p1.workspace_id=p2.workspace_id AND p1.procedure_id=p2.id JOIN workprograms p3 ON p2.workspace_id=p3.workspace_id AND p2.workprogram_id=p3.id JOIN archive_seals s ON s.workspace_id=p3.workspace_id AND s.engagement_id=p3.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.submission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_procedure_review_decisions_delete BEFORE DELETE ON procedure_review_decisions
WHEN (EXISTS(SELECT 1 FROM procedure_submissions p0 JOIN procedure_revisions p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.procedure_id AND p0.row_version=p1.row_version JOIN procedures p2 ON p1.workspace_id=p2.workspace_id AND p1.procedure_id=p2.id JOIN workprograms p3 ON p2.workspace_id=p3.workspace_id AND p2.workprogram_id=p3.id JOIN archive_seals s ON s.workspace_id=p3.workspace_id AND s.engagement_id=p3.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.submission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_procedure_revisions_insert BEFORE INSERT ON procedure_revisions
WHEN (EXISTS(SELECT 1 FROM procedures p0 JOIN workprograms p1 ON p0.workspace_id=p1.workspace_id AND p0.workprogram_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.procedure_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_procedure_revisions_update BEFORE UPDATE ON procedure_revisions
WHEN (EXISTS(SELECT 1 FROM procedures p0 JOIN workprograms p1 ON p0.workspace_id=p1.workspace_id AND p0.workprogram_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.procedure_id)) OR (EXISTS(SELECT 1 FROM procedures p0 JOIN workprograms p1 ON p0.workspace_id=p1.workspace_id AND p0.workprogram_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.procedure_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_procedure_revisions_delete BEFORE DELETE ON procedure_revisions
WHEN (EXISTS(SELECT 1 FROM procedures p0 JOIN workprograms p1 ON p0.workspace_id=p1.workspace_id AND p0.workprogram_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.procedure_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_procedure_submissions_insert BEFORE INSERT ON procedure_submissions
WHEN (EXISTS(SELECT 1 FROM procedure_revisions p0 JOIN procedures p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.id JOIN workprograms p2 ON p1.workspace_id=p2.workspace_id AND p1.workprogram_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.procedure_id=NEW.procedure_id AND p0.row_version=NEW.row_version))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_procedure_submissions_update BEFORE UPDATE ON procedure_submissions
WHEN (EXISTS(SELECT 1 FROM procedure_revisions p0 JOIN procedures p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.id JOIN workprograms p2 ON p1.workspace_id=p2.workspace_id AND p1.workprogram_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.procedure_id=OLD.procedure_id AND p0.row_version=OLD.row_version)) OR (EXISTS(SELECT 1 FROM procedure_revisions p0 JOIN procedures p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.id JOIN workprograms p2 ON p1.workspace_id=p2.workspace_id AND p1.workprogram_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.procedure_id=NEW.procedure_id AND p0.row_version=NEW.row_version))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_procedure_submissions_delete BEFORE DELETE ON procedure_submissions
WHEN (EXISTS(SELECT 1 FROM procedure_revisions p0 JOIN procedures p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.id JOIN workprograms p2 ON p1.workspace_id=p2.workspace_id AND p1.workprogram_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.procedure_id=OLD.procedure_id AND p0.row_version=OLD.row_version))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_procedures_insert BEFORE INSERT ON procedures
WHEN (EXISTS(SELECT 1 FROM workprograms p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.workprogram_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_procedures_update BEFORE UPDATE ON procedures
WHEN (EXISTS(SELECT 1 FROM workprograms p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.workprogram_id)) OR (EXISTS(SELECT 1 FROM workprograms p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.workprogram_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_procedures_delete BEFORE DELETE ON procedures
WHEN (EXISTS(SELECT 1 FROM workprograms p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.workprogram_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_representation_file_reservations_insert BEFORE INSERT ON representation_file_reservations
WHEN (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_representation_file_reservations_update BEFORE UPDATE ON representation_file_reservations
WHEN (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id)) OR (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_representation_file_reservations_delete BEFORE DELETE ON representation_file_reservations
WHEN (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_representation_returns_insert BEFORE INSERT ON representation_returns
WHEN (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_representation_returns_update BEFORE UPDATE ON representation_returns
WHEN (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id)) OR (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_representation_returns_delete BEFORE DELETE ON representation_returns
WHEN (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_representation_reviews_insert BEFORE INSERT ON representation_reviews
WHEN (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id) OR EXISTS(SELECT 1 FROM representation_returns p0 JOIN representation_requests p1 ON p0.workspace_id=p1.workspace_id AND p0.request_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.return_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_representation_reviews_update BEFORE UPDATE ON representation_reviews
WHEN (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id) OR EXISTS(SELECT 1 FROM representation_returns p0 JOIN representation_requests p1 ON p0.workspace_id=p1.workspace_id AND p0.request_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.return_id)) OR (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.request_id) OR EXISTS(SELECT 1 FROM representation_returns p0 JOIN representation_requests p1 ON p0.workspace_id=p1.workspace_id AND p0.request_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.return_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_representation_reviews_delete BEFORE DELETE ON representation_reviews
WHEN (EXISTS(SELECT 1 FROM representation_requests p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.request_id) OR EXISTS(SELECT 1 FROM representation_returns p0 JOIN representation_requests p1 ON p0.workspace_id=p1.workspace_id AND p0.request_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.return_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_review_decisions_insert BEFORE INSERT ON review_decisions
WHEN (EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.submission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_review_decisions_update BEFORE UPDATE ON review_decisions
WHEN (EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.submission_id)) OR (EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.submission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_review_decisions_delete BEFORE DELETE ON review_decisions
WHEN (EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.submission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_review_note_revisions_insert BEFORE INSERT ON review_note_revisions
WHEN (EXISTS(SELECT 1 FROM review_notes p0 JOIN review_submissions p1 ON p0.workspace_id=p1.workspace_id AND p0.submission_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.note_id) OR EXISTS(SELECT 1 FROM review_notes p0 JOIN procedures p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.id JOIN workprograms p2 ON p1.workspace_id=p2.workspace_id AND p1.workprogram_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.note_id) OR EXISTS(SELECT 1 FROM review_notes p0 JOIN review_submissions p1 ON p0.workspace_id=p1.workspace_id AND p0.resubmission_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.note_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_review_note_revisions_update BEFORE UPDATE ON review_note_revisions
WHEN (EXISTS(SELECT 1 FROM review_notes p0 JOIN review_submissions p1 ON p0.workspace_id=p1.workspace_id AND p0.submission_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.note_id) OR EXISTS(SELECT 1 FROM review_notes p0 JOIN procedures p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.id JOIN workprograms p2 ON p1.workspace_id=p2.workspace_id AND p1.workprogram_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.note_id) OR EXISTS(SELECT 1 FROM review_notes p0 JOIN review_submissions p1 ON p0.workspace_id=p1.workspace_id AND p0.resubmission_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.note_id)) OR (EXISTS(SELECT 1 FROM review_notes p0 JOIN review_submissions p1 ON p0.workspace_id=p1.workspace_id AND p0.submission_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.note_id) OR EXISTS(SELECT 1 FROM review_notes p0 JOIN procedures p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.id JOIN workprograms p2 ON p1.workspace_id=p2.workspace_id AND p1.workprogram_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.note_id) OR EXISTS(SELECT 1 FROM review_notes p0 JOIN review_submissions p1 ON p0.workspace_id=p1.workspace_id AND p0.resubmission_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.note_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_review_note_revisions_delete BEFORE DELETE ON review_note_revisions
WHEN (EXISTS(SELECT 1 FROM review_notes p0 JOIN review_submissions p1 ON p0.workspace_id=p1.workspace_id AND p0.submission_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.note_id) OR EXISTS(SELECT 1 FROM review_notes p0 JOIN procedures p1 ON p0.workspace_id=p1.workspace_id AND p0.procedure_id=p1.id JOIN workprograms p2 ON p1.workspace_id=p2.workspace_id AND p1.workprogram_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.note_id) OR EXISTS(SELECT 1 FROM review_notes p0 JOIN review_submissions p1 ON p0.workspace_id=p1.workspace_id AND p0.resubmission_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.note_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_review_notes_insert BEFORE INSERT ON review_notes
WHEN (EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.submission_id) OR EXISTS(SELECT 1 FROM procedures p0 JOIN workprograms p1 ON p0.workspace_id=p1.workspace_id AND p0.workprogram_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.procedure_id) OR EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.resubmission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_review_notes_update BEFORE UPDATE ON review_notes
WHEN (EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.submission_id) OR EXISTS(SELECT 1 FROM procedures p0 JOIN workprograms p1 ON p0.workspace_id=p1.workspace_id AND p0.workprogram_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.procedure_id) OR EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.resubmission_id)) OR (EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.submission_id) OR EXISTS(SELECT 1 FROM procedures p0 JOIN workprograms p1 ON p0.workspace_id=p1.workspace_id AND p0.workprogram_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.procedure_id) OR EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.resubmission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_review_notes_delete BEFORE DELETE ON review_notes
WHEN (EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.submission_id) OR EXISTS(SELECT 1 FROM procedures p0 JOIN workprograms p1 ON p0.workspace_id=p1.workspace_id AND p0.workprogram_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.procedure_id) OR EXISTS(SELECT 1 FROM review_submissions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.resubmission_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_risk_assessment_drafts_insert BEFORE INSERT ON risk_assessment_drafts
WHEN (EXISTS(SELECT 1 FROM risk_assessments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.assessment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_assessment_drafts_update BEFORE UPDATE ON risk_assessment_drafts
WHEN (EXISTS(SELECT 1 FROM risk_assessments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.assessment_id)) OR (EXISTS(SELECT 1 FROM risk_assessments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.assessment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_risk_assessment_drafts_delete BEFORE DELETE ON risk_assessment_drafts
WHEN (EXISTS(SELECT 1 FROM risk_assessments p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.assessment_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_sample_hits_insert BEFORE INSERT ON sample_hits
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_row_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sample_hits_update BEFORE UPDATE ON sample_hits
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_row_id)) OR (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_row_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sample_hits_delete BEFORE DELETE ON sample_hits
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_row_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_sample_tests_insert BEFORE INSERT ON sample_tests
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_row_id) OR EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.evidence_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sample_tests_update BEFORE UPDATE ON sample_tests
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_row_id) OR EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.evidence_id)) OR (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_row_id) OR EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.evidence_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sample_tests_delete BEFORE DELETE ON sample_tests
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_row_id) OR EXISTS(SELECT 1 FROM evidence_records p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.evidence_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_sampling_evaluations_insert BEFORE INSERT ON sampling_evaluations
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sampling_evaluations_update BEFORE UPDATE ON sampling_evaluations
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id)) OR (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sampling_evaluations_delete BEFORE DELETE ON sampling_evaluations
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_sampling_plans_insert BEFORE INSERT ON sampling_plans
WHEN (EXISTS(SELECT 1 FROM sample_populations p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sampling_plans_update BEFORE UPDATE ON sampling_plans
WHEN (EXISTS(SELECT 1 FROM sample_populations p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_id)) OR (EXISTS(SELECT 1 FROM sample_populations p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sampling_plans_delete BEFORE DELETE ON sampling_plans
WHEN (EXISTS(SELECT 1 FROM sample_populations p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_sampling_strata_insert BEFORE INSERT ON sampling_strata
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sampling_strata_update BEFORE UPDATE ON sampling_strata
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id)) OR (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_sampling_strata_delete BEFORE DELETE ON sampling_strata
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_srm_clearances_insert BEFORE INSERT ON srm_clearances
WHEN (EXISTS(SELECT 1 FROM srm_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.srm_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_srm_clearances_update BEFORE UPDATE ON srm_clearances
WHEN (EXISTS(SELECT 1 FROM srm_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.srm_version_id)) OR (EXISTS(SELECT 1 FROM srm_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.srm_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_srm_clearances_delete BEFORE DELETE ON srm_clearances
WHEN (EXISTS(SELECT 1 FROM srm_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.srm_version_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_statement_snapshot_lines_insert BEFORE INSERT ON statement_snapshot_lines
WHEN (EXISTS(SELECT 1 FROM statement_snapshots p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.snapshot_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_statement_snapshot_lines_update BEFORE UPDATE ON statement_snapshot_lines
WHEN (EXISTS(SELECT 1 FROM statement_snapshots p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.snapshot_id)) OR (EXISTS(SELECT 1 FROM statement_snapshots p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.snapshot_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_statement_snapshot_lines_delete BEFORE DELETE ON statement_snapshot_lines
WHEN (EXISTS(SELECT 1 FROM statement_snapshots p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.snapshot_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_statement_supplement_lines_insert BEFORE INSERT ON statement_supplement_lines
WHEN (EXISTS(SELECT 1 FROM financial_statement_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.draft_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_statement_supplement_lines_update BEFORE UPDATE ON statement_supplement_lines
WHEN (EXISTS(SELECT 1 FROM financial_statement_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.draft_id)) OR (EXISTS(SELECT 1 FROM financial_statement_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.draft_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_statement_supplement_lines_delete BEFORE DELETE ON statement_supplement_lines
WHEN (EXISTS(SELECT 1 FROM financial_statement_drafts p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.draft_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_stratum_evaluations_insert BEFORE INSERT ON stratum_evaluations
WHEN (EXISTS(SELECT 1 FROM sampling_evaluations p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.sampling_evaluation_id) OR EXISTS(SELECT 1 FROM sampling_strata p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.stratum_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_stratum_evaluations_update BEFORE UPDATE ON stratum_evaluations
WHEN (EXISTS(SELECT 1 FROM sampling_evaluations p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.sampling_evaluation_id) OR EXISTS(SELECT 1 FROM sampling_strata p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.stratum_id)) OR (EXISTS(SELECT 1 FROM sampling_evaluations p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.sampling_evaluation_id) OR EXISTS(SELECT 1 FROM sampling_strata p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.stratum_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_stratum_evaluations_delete BEFORE DELETE ON stratum_evaluations
WHEN (EXISTS(SELECT 1 FROM sampling_evaluations p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.sampling_evaluation_id) OR EXISTS(SELECT 1 FROM sampling_strata p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.stratum_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_stratum_memberships_insert BEFORE INSERT ON stratum_memberships
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_row_id) OR EXISTS(SELECT 1 FROM sampling_strata p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.stratum_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_stratum_memberships_update BEFORE UPDATE ON stratum_memberships
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_row_id) OR EXISTS(SELECT 1 FROM sampling_strata p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.stratum_id)) OR (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.population_row_id) OR EXISTS(SELECT 1 FROM sampling_strata p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.stratum_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_stratum_memberships_delete BEFORE DELETE ON stratum_memberships
WHEN (EXISTS(SELECT 1 FROM sampling_plans p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.plan_id) OR EXISTS(SELECT 1 FROM population_rows p0 JOIN sample_populations p1 ON p0.workspace_id=p1.workspace_id AND p0.population_id=p1.id JOIN archive_seals s ON s.workspace_id=p1.workspace_id AND s.engagement_id=p1.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.population_row_id) OR EXISTS(SELECT 1 FROM sampling_strata p0 JOIN sampling_plans p1 ON p0.workspace_id=p1.workspace_id AND p0.plan_id=p1.id JOIN sample_populations p2 ON p1.workspace_id=p2.workspace_id AND p1.population_id=p2.id JOIN archive_seals s ON s.workspace_id=p2.workspace_id AND s.engagement_id=p2.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.stratum_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_tb_mappings_insert BEFORE INSERT ON tb_mappings
WHEN (EXISTS(SELECT 1 FROM mapping_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.mapping_version_id) OR EXISTS(SELECT 1 FROM tb_lines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.tb_line_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_mappings_update BEFORE UPDATE ON tb_mappings
WHEN (EXISTS(SELECT 1 FROM mapping_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.mapping_version_id) OR EXISTS(SELECT 1 FROM tb_lines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.tb_line_id)) OR (EXISTS(SELECT 1 FROM mapping_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.mapping_version_id) OR EXISTS(SELECT 1 FROM tb_lines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.tb_line_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_mappings_delete BEFORE DELETE ON tb_mappings
WHEN (EXISTS(SELECT 1 FROM mapping_versions p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.mapping_version_id) OR EXISTS(SELECT 1 FROM tb_lines p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.tb_line_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_tb_staging_lines_insert BEFORE INSERT ON tb_staging_lines
WHEN (EXISTS(SELECT 1 FROM tb_imports p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.import_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_staging_lines_update BEFORE UPDATE ON tb_staging_lines
WHEN (EXISTS(SELECT 1 FROM tb_imports p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.import_id)) OR (EXISTS(SELECT 1 FROM tb_imports p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=NEW.workspace_id AND p0.id=NEW.import_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;
CREATE TRIGGER sealed_tb_staging_lines_delete BEFORE DELETE ON tb_staging_lines
WHEN (EXISTS(SELECT 1 FROM tb_imports p0 JOIN archive_seals s ON s.workspace_id=p0.workspace_id AND s.engagement_id=p0.engagement_id WHERE p0.workspace_id=OLD.workspace_id AND p0.id=OLD.import_id))
BEGIN SELECT RAISE(ABORT,'sealed engagement content is immutable'); END;

CREATE TRIGGER sealed_file_versions_insert BEFORE INSERT ON file_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN
  SELECT RAISE(ABORT,'sealed engagement file content is immutable')
  WHERE NOT (
    (NEW.purpose='EVIDENCE' AND NEW.payment_evidence_reservation_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM payment_evidence_reservations r WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.payment_evidence_reservation_id
        AND r.client_id=NEW.client_id AND r.engagement_id=NEW.engagement_id AND r.reserved_by_actor_id=NEW.created_by_actor_id AND r.payment_id IS NULL))
    OR (NEW.purpose='GENERATED' AND EXISTS(
      SELECT 1 FROM receipt_vouchers rv JOIN payments p ON p.workspace_id=rv.workspace_id AND p.id=rv.payment_id
      JOIN outbox_jobs o ON o.workspace_id=rv.workspace_id AND o.aggregate_id=rv.id AND o.kind='GENERATE_DOCUMENT' AND o.status='RUNNING'
      WHERE rv.workspace_id=NEW.workspace_id AND rv.client_id=NEW.client_id AND rv.engagement_id=NEW.engagement_id AND rv.status='PENDING'))
  );
END;

CREATE TRIGGER sealed_file_versions_update BEFORE UPDATE ON file_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
  OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN
  SELECT RAISE(ABORT,'sealed engagement file content is immutable')
  WHERE NOT (
    OLD.payment_evidence_reservation_id IS NOT NULL
    AND NEW.payment_evidence_reservation_id=OLD.payment_evidence_reservation_id
    AND NEW.id=OLD.id AND NEW.workspace_id=OLD.workspace_id AND NEW.client_id=OLD.client_id AND NEW.engagement_id=OLD.engagement_id
    AND NEW.purpose='EVIDENCE' AND OLD.purpose='EVIDENCE' AND NEW.original_name=OLD.original_name AND NEW.media_type=OLD.media_type
    AND NEW.created_by_actor_id=OLD.created_by_actor_id AND NEW.updated_by_actor_id=OLD.created_by_actor_id
    AND EXISTS(SELECT 1 FROM payment_evidence_reservations r WHERE r.workspace_id=OLD.workspace_id AND r.id=OLD.payment_evidence_reservation_id
      AND r.client_id=OLD.client_id AND r.engagement_id=OLD.engagement_id AND r.reserved_by_actor_id=OLD.created_by_actor_id AND r.payment_id IS NULL)
    AND (
      (OLD.state='INITIALIZED' AND NEW.state='STAGED' AND NEW.version=OLD.version+1 AND NEW.size_bytes=OLD.size_bytes
        AND OLD.sha256 IS NULL AND NEW.sha256 IS NOT NULL AND NEW.immutable=OLD.immutable AND OLD.immutable=0
        AND OLD.committed_at IS NULL AND NEW.committed_at IS NULL
        AND substr(NEW.object_key,1,length(OLD.object_key)+1)=OLD.object_key||'/')
      OR
      (OLD.state='STAGED' AND NEW.state='COMMITTED' AND NEW.version=OLD.version+1 AND NEW.size_bytes=OLD.size_bytes
        AND NEW.sha256=OLD.sha256 AND NEW.object_key=OLD.object_key AND NEW.immutable=1 AND NEW.committed_at IS NOT NULL
        AND OLD.immutable=0 AND OLD.committed_at IS NULL)
    )
  );
END;

CREATE TRIGGER sealed_file_versions_delete BEFORE DELETE ON file_versions
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement file content is immutable'); END;

CREATE TRIGGER sealed_generated_artifacts_insert BEFORE INSERT ON generated_artifacts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN
  SELECT RAISE(ABORT,'sealed engagement artifacts are immutable')
  WHERE NOT (NEW.artifact_kind='RECEIPT' AND NEW.source_entity_type='PAYMENT' AND EXISTS(
    SELECT 1 FROM payments p JOIN receipt_vouchers rv ON rv.workspace_id=p.workspace_id AND rv.payment_id=p.id
    WHERE p.workspace_id=NEW.workspace_id AND p.id=NEW.source_entity_id AND p.client_id=NEW.client_id AND p.engagement_id=NEW.engagement_id AND rv.status='PENDING'));
END;
CREATE TRIGGER sealed_generated_artifacts_update BEFORE UPDATE ON generated_artifacts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
  OR EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=NEW.workspace_id AND s.engagement_id=NEW.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement artifacts are immutable'); END;
CREATE TRIGGER sealed_generated_artifacts_delete BEFORE DELETE ON generated_artifacts
WHEN EXISTS(SELECT 1 FROM archive_seals s WHERE s.workspace_id=OLD.workspace_id AND s.engagement_id=OLD.engagement_id)
BEGIN SELECT RAISE(ABORT,'sealed engagement artifacts are immutable'); END;
