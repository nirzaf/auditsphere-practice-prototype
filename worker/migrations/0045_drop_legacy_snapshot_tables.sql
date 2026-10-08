-- Retire the unreachable TEST snapshot schema after the D2 data review.
-- Keep demo_seeds because workspaces.seed_id still references it. Existing
-- seed rows remain readable, but new use of the legacy catalogue is blocked.
DROP TRIGGER IF EXISTS count_demo_creation;

-- The migration cutover tools are retired. These guards reference the legacy
-- snapshot tables and must not remain attached to retained migration records.
DROP TRIGGER IF EXISTS migration_runs_no_direct_applied_insert;
DROP TRIGGER IF EXISTS migration_id_map_validated_target_guard;
DROP TRIGGER IF EXISTS migration_runs_applied_cutover_guard;

DROP TABLE IF EXISTS workspace_entities;
DROP TABLE IF EXISTS workspace_root_documents;
DROP TABLE IF EXISTS workspace_sessions;
DROP TABLE IF EXISTS workspace_seeds;
DROP TABLE IF EXISTS test_workspace_expiry;
DROP TABLE IF EXISTS demo_workspaces;
DROP TABLE IF EXISTS demo_creation_limits;

CREATE TRIGGER demo_seeds_no_insert
BEFORE INSERT ON demo_seeds
BEGIN
  SELECT RAISE(ABORT, 'legacy demo seeds are retired');
END;

UPDATE application_schema_version
SET version=45, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton=1;
