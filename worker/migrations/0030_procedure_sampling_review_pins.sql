-- Pin sampling plans to the procedure whose submission depends on completed sample testing.
CREATE TABLE IF NOT EXISTS sampling_plan_procedure_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  procedure_id TEXT NOT NULL,
  linked_by_actor_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,plan_id) REFERENCES sampling_plans(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,procedure_id) REFERENCES procedures(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,linked_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,plan_id)
);
CREATE INDEX IF NOT EXISTS sampling_plan_procedure_idx
  ON sampling_plan_procedure_links(workspace_id,procedure_id,linked_at);

CREATE TRIGGER sampling_plan_procedure_scope_insert
BEFORE INSERT ON sampling_plan_procedure_links
WHEN NOT EXISTS (
  SELECT 1
  FROM sampling_plans sp
  JOIN sample_populations pop ON pop.workspace_id=sp.workspace_id AND pop.id=sp.population_id
  JOIN procedures p ON p.workspace_id=NEW.workspace_id AND p.id=NEW.procedure_id
  JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id
  WHERE sp.workspace_id=NEW.workspace_id AND sp.id=NEW.plan_id
    AND pop.engagement_id=w.engagement_id AND pop.fsli_id=w.fsli_id
)
BEGIN
  SELECT RAISE(ABORT,'sampling plan must match the procedure engagement and FSLI');
END;
CREATE TRIGGER sampling_plan_procedure_no_update BEFORE UPDATE ON sampling_plan_procedure_links
BEGIN SELECT RAISE(ABORT,'sampling plan procedure pins are append only'); END;
CREATE TRIGGER sampling_plan_procedure_no_delete BEFORE DELETE ON sampling_plan_procedure_links
BEGIN SELECT RAISE(ABORT,'sampling plan procedure pins are append only'); END;

CREATE TRIGGER sealed_sampling_plan_procedure_insert
BEFORE INSERT ON sampling_plan_procedure_links
WHEN EXISTS (
  SELECT 1 FROM sampling_plans sp JOIN sample_populations pop ON pop.workspace_id=sp.workspace_id AND pop.id=sp.population_id
  JOIN archive_seals seal ON seal.workspace_id=pop.workspace_id AND seal.engagement_id=pop.engagement_id
  WHERE sp.workspace_id=NEW.workspace_id AND sp.id=NEW.plan_id
) OR EXISTS (
  SELECT 1 FROM procedures p JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id
  JOIN archive_seals seal ON seal.workspace_id=w.workspace_id AND seal.engagement_id=w.engagement_id
  WHERE p.workspace_id=NEW.workspace_id AND p.id=NEW.procedure_id
)
BEGIN SELECT RAISE(ABORT,'archived engagement content is immutable'); END;

UPDATE application_schema_version
SET version = 30,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
