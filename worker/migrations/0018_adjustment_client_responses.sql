-- Preserve the client's decision and the exact optional support file with each
-- proposed audit adjustment. Keep this additive so already-applied 0017 stays
-- immutable for existing databases.
ALTER TABLE audit_adjustments ADD COLUMN client_response_decision TEXT
  CHECK (client_response_decision IS NULL OR client_response_decision IN ('ACCEPTED','DECLINED'));
ALTER TABLE audit_adjustments ADD COLUMN client_response_file_id TEXT REFERENCES file_versions(id) ON DELETE RESTRICT;
ALTER TABLE audit_adjustments ADD COLUMN client_responded_by_actor_id TEXT REFERENCES actor_profiles(id) ON DELETE RESTRICT;
ALTER TABLE audit_adjustments ADD COLUMN client_responded_at TEXT;
ALTER TABLE findings ADD COLUMN client_responded_by_actor_id TEXT REFERENCES actor_profiles(id) ON DELETE RESTRICT;
ALTER TABLE findings ADD COLUMN client_responded_at TEXT;
ALTER TABLE findings ADD COLUMN tb_version_id TEXT REFERENCES tb_versions(id) ON DELETE RESTRICT;
ALTER TABLE findings ADD COLUMN mapping_version_id TEXT REFERENCES mapping_versions(id) ON DELETE RESTRICT;
ALTER TABLE findings ADD COLUMN materiality_version_id TEXT REFERENCES materiality_versions(id) ON DELETE RESTRICT;
ALTER TABLE audit_adjustments ADD COLUMN mapping_version_id TEXT REFERENCES mapping_versions(id) ON DELETE RESTRICT;
ALTER TABLE audit_adjustments ADD COLUMN materiality_version_id TEXT REFERENCES materiality_versions(id) ON DELETE RESTRICT;
ALTER TABLE audit_differences ADD COLUMN tb_version_id TEXT REFERENCES tb_versions(id) ON DELETE RESTRICT;
ALTER TABLE audit_differences ADD COLUMN mapping_version_id TEXT REFERENCES mapping_versions(id) ON DELETE RESTRICT;
ALTER TABLE audit_differences ADD COLUMN materiality_version_id TEXT REFERENCES materiality_versions(id) ON DELETE RESTRICT;

UPDATE findings SET tb_version_id=(SELECT active_tb_version_id FROM engagements e WHERE e.workspace_id=findings.workspace_id AND e.id=findings.engagement_id),
  mapping_version_id=(SELECT active_mapping_version_id FROM engagements e WHERE e.workspace_id=findings.workspace_id AND e.id=findings.engagement_id),
  materiality_version_id=(SELECT active_materiality_version_id FROM engagements e WHERE e.workspace_id=findings.workspace_id AND e.id=findings.engagement_id);
UPDATE audit_adjustments SET mapping_version_id=(SELECT active_mapping_version_id FROM engagements e WHERE e.workspace_id=audit_adjustments.workspace_id AND e.id=audit_adjustments.engagement_id),
  materiality_version_id=(SELECT active_materiality_version_id FROM engagements e WHERE e.workspace_id=audit_adjustments.workspace_id AND e.id=audit_adjustments.engagement_id);
UPDATE audit_differences SET tb_version_id=(SELECT active_tb_version_id FROM engagements e WHERE e.workspace_id=audit_differences.workspace_id AND e.id=audit_differences.engagement_id),
  mapping_version_id=(SELECT active_mapping_version_id FROM engagements e WHERE e.workspace_id=audit_differences.workspace_id AND e.id=audit_differences.engagement_id),
  materiality_version_id=(SELECT active_materiality_version_id FROM engagements e WHERE e.workspace_id=audit_differences.workspace_id AND e.id=audit_differences.engagement_id);

CREATE TRIGGER IF NOT EXISTS audit_adjustment_client_response_consistent
BEFORE UPDATE OF client_response,client_response_decision,client_response_file_id,client_responded_by_actor_id,client_responded_at ON audit_adjustments
WHEN NOT (
  (NEW.client_response IS NULL AND NEW.client_response_decision IS NULL AND NEW.client_response_file_id IS NULL AND NEW.client_responded_by_actor_id IS NULL AND NEW.client_responded_at IS NULL)
  OR
  (NEW.client_response_decision IS NOT NULL AND length(trim(COALESCE(NEW.client_response,''))) BETWEEN 10 AND 10000
    AND NEW.client_responded_by_actor_id IS NOT NULL AND NEW.client_responded_at IS NOT NULL
    AND (NEW.client_response_file_id IS NULL OR EXISTS (
      SELECT 1 FROM file_versions f WHERE f.workspace_id=NEW.workspace_id AND f.id=NEW.client_response_file_id
        AND f.client_id=NEW.client_id AND f.engagement_id=NEW.engagement_id AND f.state='COMMITTED' AND f.immutable=1 AND f.sha256 IS NOT NULL
    )))
)
BEGIN SELECT RAISE(ABORT, 'audit adjustment client response is incomplete or out of scope'); END;

CREATE TRIGGER IF NOT EXISTS audit_adjustment_client_response_append_only
BEFORE UPDATE OF client_response,client_response_decision,client_response_file_id,client_responded_by_actor_id,client_responded_at ON audit_adjustments
WHEN OLD.client_response_decision IS NOT NULL AND (
  NEW.client_response IS NOT OLD.client_response OR NEW.client_response_decision IS NOT OLD.client_response_decision
  OR NEW.client_response_file_id IS NOT OLD.client_response_file_id OR NEW.client_responded_by_actor_id IS NOT OLD.client_responded_by_actor_id
  OR NEW.client_responded_at IS NOT OLD.client_responded_at
)
BEGIN SELECT RAISE(ABORT, 'audit adjustment client response is append only'); END;

CREATE TRIGGER IF NOT EXISTS audit_adjustment_lines_no_update BEFORE UPDATE ON audit_adjustment_lines
BEGIN SELECT RAISE(ABORT, 'audit adjustment lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS audit_adjustment_lines_no_delete BEFORE DELETE ON audit_adjustment_lines
BEGIN SELECT RAISE(ABORT, 'audit adjustment lines are immutable'); END;

CREATE TRIGGER IF NOT EXISTS finding_client_response_consistent
BEFORE UPDATE OF client_response,client_responded_by_actor_id,client_responded_at ON findings
WHEN NOT (
  (NEW.client_response IS NULL AND NEW.client_responded_by_actor_id IS NULL AND NEW.client_responded_at IS NULL)
  OR
  (length(trim(COALESCE(NEW.client_response,''))) BETWEEN 10 AND 10000 AND NEW.client_responded_by_actor_id IS NOT NULL AND NEW.client_responded_at IS NOT NULL)
)
BEGIN SELECT RAISE(ABORT, 'finding client response is incomplete'); END;

CREATE TRIGGER IF NOT EXISTS finding_client_response_append_only
BEFORE UPDATE OF client_response,client_responded_by_actor_id,client_responded_at ON findings
WHEN OLD.client_response IS NOT NULL AND (
  NEW.client_response IS NOT OLD.client_response OR NEW.client_responded_by_actor_id IS NOT OLD.client_responded_by_actor_id
  OR NEW.client_responded_at IS NOT OLD.client_responded_at
)
BEGIN SELECT RAISE(ABORT, 'finding client response is append only'); END;

CREATE TABLE IF NOT EXISTS audit_adjustment_evidence_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  adjustment_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  evidence_version INTEGER NOT NULL CHECK (evidence_version>0),
  file_sha256 TEXT CHECK (file_sha256 IS NULL OR length(file_sha256)=64),
  source_snapshot_json TEXT NOT NULL CHECK (json_valid(source_snapshot_json)),
  linked_by_actor_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,adjustment_id) REFERENCES audit_adjustments(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_id) REFERENCES evidence_records(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,linked_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,adjustment_id,evidence_id)
);
CREATE TRIGGER IF NOT EXISTS audit_adjustment_evidence_no_update BEFORE UPDATE ON audit_adjustment_evidence_links
BEGIN SELECT RAISE(ABORT, 'audit adjustment evidence links are immutable'); END;
CREATE TRIGGER IF NOT EXISTS audit_adjustment_evidence_no_delete BEFORE DELETE ON audit_adjustment_evidence_links
BEGIN SELECT RAISE(ABORT, 'audit adjustment evidence links are immutable'); END;
