-- A deployment migrator must create every mapped normalized record and its
-- provenance in the same D1 batch before a run can become APPLIED.
CREATE TRIGGER IF NOT EXISTS migration_runs_no_direct_applied_insert
BEFORE INSERT ON migration_runs
WHEN NEW.status = 'APPLIED'
BEGIN
  SELECT RAISE(ABORT, 'MIGRATION_APPLIED_REQUIRES_ATOMIC_CUTOVER');
END;

CREATE TRIGGER IF NOT EXISTS migration_id_map_validated_target_guard
BEFORE INSERT ON migration_id_map
WHEN (SELECT status FROM migration_runs WHERE workspace_id = NEW.workspace_id AND id = NEW.run_id) = 'VALIDATED'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM workspace_entities e
    WHERE e.workspace_id = NEW.workspace_id
      AND e.entity_kind = NEW.source_kind
      AND e.entity_id = NEW.source_id
      AND e.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'MIGRATION_SOURCE_ROW_CHANGED_OR_MISSING') END;
  SELECT CASE WHEN NOT (
    (NEW.target_kind = 'clients' AND NEW.source_kind = 'clients' AND NEW.target_id = NEW.source_id
      AND EXISTS (SELECT 1 FROM clients t WHERE t.workspace_id = NEW.workspace_id AND t.id = NEW.target_id))
    OR
    (NEW.target_kind = 'contacts' AND NEW.source_kind = 'contacts' AND NEW.target_id = NEW.source_id
      AND EXISTS (SELECT 1 FROM contacts t WHERE t.workspace_id = NEW.workspace_id AND t.id = NEW.target_id))
  ) THEN RAISE(ABORT, 'MIGRATION_TARGET_ROW_MISSING_OR_UNSUPPORTED') END;
END;

CREATE TRIGGER IF NOT EXISTS migration_runs_applied_cutover_guard
BEFORE UPDATE OF status ON migration_runs
WHEN NEW.status = 'APPLIED' AND OLD.status <> 'APPLIED'
BEGIN
  SELECT CASE WHEN NEW.source_count <> (
    SELECT COUNT(*) FROM workspace_entities e
    WHERE e.workspace_id = NEW.workspace_id AND e.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'MIGRATION_SOURCE_COUNT_CHANGED') END;
  SELECT CASE WHEN NEW.target_count <> NEW.source_count OR NEW.target_count <> (
    SELECT COUNT(*) FROM migration_id_map m WHERE m.workspace_id = NEW.workspace_id AND m.run_id = NEW.id
  ) THEN RAISE(ABORT, 'MIGRATION_MAPPING_COUNT_MISMATCH') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM workspace_entities e
    LEFT JOIN migration_id_map m
      ON m.workspace_id = e.workspace_id AND m.run_id = NEW.id
      AND m.source_kind = e.entity_kind AND m.source_id = e.entity_id
      AND m.target_kind = e.entity_kind AND m.target_id = e.entity_id
    WHERE e.workspace_id = NEW.workspace_id AND e.deleted_at IS NULL AND m.id IS NULL
  ) THEN RAISE(ABORT, 'MIGRATION_SOURCE_MAPPING_INCOMPLETE') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM migration_id_map m
    WHERE m.workspace_id = NEW.workspace_id AND m.run_id = NEW.id
      AND NOT (
        (m.target_kind = 'clients' AND EXISTS (SELECT 1 FROM clients t WHERE t.workspace_id = m.workspace_id AND t.id = m.target_id))
        OR (m.target_kind = 'contacts' AND EXISTS (SELECT 1 FROM contacts t WHERE t.workspace_id = m.workspace_id AND t.id = m.target_id))
      )
  ) THEN RAISE(ABORT, 'MIGRATION_TARGET_MAPPING_INCOMPLETE') END;
END;

UPDATE application_schema_version
SET version = 39,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
