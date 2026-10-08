-- Historical suggestions must remain attached to the client, framework,
-- account and FSLI from the approved mapping version that created them.
CREATE TRIGGER IF NOT EXISTS mapping_memory_source_scope_insert
BEFORE INSERT ON mapping_memory
WHEN NOT EXISTS (
  SELECT 1
  FROM mapping_versions mv
  JOIN engagements e
    ON e.workspace_id=mv.workspace_id AND e.id=mv.engagement_id
  JOIN tb_mappings tm
    ON tm.workspace_id=mv.workspace_id AND tm.mapping_version_id=mv.id
  JOIN tb_lines tl
    ON tl.workspace_id=tm.workspace_id AND tl.id=tm.tb_line_id
      AND tl.tb_version_id=mv.tb_version_id
  WHERE mv.workspace_id=NEW.workspace_id
    AND mv.id=NEW.source_mapping_version_id
    AND mv.client_id=NEW.client_id
    AND e.client_id=NEW.client_id
    AND mv.reporting_framework=NEW.reporting_framework
    AND tl.account_code=NEW.account_code
    AND tm.fsli_id=NEW.fsli_id
)
BEGIN
  SELECT RAISE(ABORT, 'historical mapping source scope mismatch');
END;

UPDATE application_schema_version
SET version=38, updated_at=CURRENT_TIMESTAMP
WHERE singleton=1;
