-- Version-pinned fieldwork statements, procedures, statistical sampling and evidence.
-- These tables are engagement-scoped and never replace the accepted client ledger.

CREATE TABLE IF NOT EXISTS statement_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  tb_version_id TEXT NOT NULL,
  mapping_version_id TEXT NOT NULL,
  adjustment_set_hash TEXT NOT NULL CHECK (length(adjustment_set_hash)=64),
  standards_profile_id TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  generated_at TEXT NOT NULL,
  generated_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_version_id) REFERENCES tb_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,mapping_version_id) REFERENCES mapping_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,standards_profile_id) REFERENCES standards_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,generated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,source_hash)
);
CREATE TABLE IF NOT EXISTS statement_snapshot_lines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  current_base_minor INTEGER NOT NULL,
  current_adjustment_minor INTEGER NOT NULL DEFAULT 0,
  current_adjusted_minor INTEGER NOT NULL,
  prior_minor INTEGER,
  variance_numerator TEXT,
  variance_denominator TEXT,
  variance_reason TEXT NOT NULL CHECK (variance_reason IN ('CALCULATED','NEW_BALANCE','ZERO_BOTH','NO_COMPARATIVE')),
  risk_band TEXT NOT NULL CHECK (risk_band IN ('GREEN','AMBER','RED')),
  FOREIGN KEY (workspace_id,snapshot_id) REFERENCES statement_snapshots(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,snapshot_id,fsli_id)
);
CREATE TRIGGER IF NOT EXISTS statement_snapshots_no_update BEFORE UPDATE ON statement_snapshots
BEGIN SELECT RAISE(ABORT, 'statement snapshots are append only'); END;
CREATE TRIGGER IF NOT EXISTS statement_snapshots_no_delete BEFORE DELETE ON statement_snapshots
BEGIN SELECT RAISE(ABORT, 'statement snapshots are append only'); END;
CREATE TRIGGER IF NOT EXISTS statement_snapshot_lines_no_update BEFORE UPDATE ON statement_snapshot_lines
BEGIN SELECT RAISE(ABORT, 'statement snapshot lines are append only'); END;
CREATE TRIGGER IF NOT EXISTS statement_snapshot_lines_no_delete BEFORE DELETE ON statement_snapshot_lines
BEGIN SELECT RAISE(ABORT, 'statement snapshot lines are append only'); END;

CREATE TABLE IF NOT EXISTS analytical_reviews (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  statement_snapshot_id TEXT NOT NULL,
  expectation_text TEXT NOT NULL CHECK (length(trim(expectation_text)) BETWEEN 10 AND 10000),
  threshold_minor INTEGER,
  threshold_bps INTEGER CHECK (threshold_bps IS NULL OR threshold_bps BETWEEN 1 AND 100000),
  explanation TEXT,
  conclusion TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','READY','SUBMITTED','UNDER_REWORK','REVIEWED')),
  prepared_by_actor_id TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,statement_snapshot_id) REFERENCES statement_snapshots(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prepared_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE INDEX IF NOT EXISTS analytical_reviews_engagement_idx ON analytical_reviews(workspace_id,engagement_id,fsli_id,updated_at);
CREATE TABLE IF NOT EXISTS analytical_ratios (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  analytical_review_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  numerator_minor INTEGER NOT NULL,
  denominator_minor INTEGER NOT NULL,
  result_numerator TEXT,
  result_denominator TEXT,
  undefined_reason TEXT,
  numerator_source TEXT NOT NULL CHECK (length(trim(numerator_source)) BETWEEN 1 AND 1000),
  denominator_source TEXT NOT NULL CHECK (length(trim(denominator_source)) BETWEEN 1 AND 1000),
  FOREIGN KEY (workspace_id,analytical_review_id) REFERENCES analytical_reviews(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((denominator_minor=0 AND result_numerator IS NULL AND result_denominator IS NULL AND undefined_reason IS NOT NULL)
      OR (denominator_minor<>0 AND result_numerator IS NOT NULL AND result_denominator IS NOT NULL AND undefined_reason IS NULL))
);
CREATE TABLE IF NOT EXISTS going_concern_assessments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  standards_profile_id TEXT NOT NULL,
  isa_570_edition TEXT NOT NULL,
  assessment_start TEXT NOT NULL,
  assessment_end TEXT NOT NULL,
  management_assessment_file_id TEXT,
  evidence_file_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_file_ids_json)),
  checklist_json TEXT NOT NULL CHECK (json_valid(checklist_json)),
  events_text TEXT NOT NULL,
  mitigating_plans_text TEXT NOT NULL,
  conclusion TEXT NOT NULL CHECK (conclusion IN ('UNASSESSED','NO_MATERIAL_UNCERTAINTY','MATERIAL_UNCERTAINTY','INAPPROPRIATE_BASIS')),
  rationale TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REWORK','REVIEWED')),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  prepared_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,standards_profile_id) REFERENCES standards_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,management_assessment_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prepared_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision),
  CHECK (assessment_start<=assessment_end)
);
CREATE TRIGGER IF NOT EXISTS going_concern_assessments_no_delete BEFORE DELETE ON going_concern_assessments
BEGIN SELECT RAISE(ABORT, 'going-concern assessment history cannot be deleted'); END;

CREATE TABLE IF NOT EXISTS workprogram_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  fsli_code TEXT NOT NULL CHECK (length(trim(fsli_code)) BETWEEN 1 AND 120),
  revision INTEGER NOT NULL CHECK (revision>0),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  standards_profile_id TEXT NOT NULL,
  procedures_json TEXT NOT NULL CHECK (json_valid(procedures_json)),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  approved_by_actor_id TEXT,
  approved_at TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,standards_profile_id) REFERENCES standards_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,fsli_code,standards_profile_id,revision),
  CHECK ((status='APPROVED' AND approved_by_actor_id IS NOT NULL AND approved_at IS NOT NULL)
      OR (status<>'APPROVED' AND approved_at IS NULL))
);
CREATE TABLE IF NOT EXISTS workprograms (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  planning_version_id TEXT NOT NULL,
  risk_band TEXT NOT NULL CHECK (risk_band IN ('GREEN','AMBER','RED')),
  assigned_staff_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','IN_PROGRESS','SUBMITTED','UNDER_REWORK','REVIEWED','PARTNER_CLEARED')),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,template_id) REFERENCES workprogram_templates(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,planning_version_id) REFERENCES planning_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,assigned_staff_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,fsli_id)
);
CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  workprogram_id TEXT NOT NULL,
  template_step_id TEXT,
  ordinal INTEGER NOT NULL CHECK (ordinal>0),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  instructions TEXT NOT NULL CHECK (length(trim(instructions)) BETWEEN 1 AND 10000),
  assertion TEXT NOT NULL CHECK (assertion IN ('EXISTENCE','RIGHTS_OBLIGATIONS','COMPLETENESS','VALUATION','CUTOFF','PRESENTATION')),
  origin TEXT NOT NULL CHECK (origin IN ('STANDARD','AD_HOC')),
  mandatory INTEGER NOT NULL CHECK (mandatory IN (0,1)),
  scope_reason TEXT,
  work_performed TEXT,
  conclusion TEXT,
  applicable INTEGER NOT NULL DEFAULT 1 CHECK (applicable IN (0,1)),
  not_applicable_reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('NOT_STARTED','IN_PROGRESS','SUBMITTED','UNDER_REWORK','REVIEWED')),
  prepared_by_staff_id TEXT,
  executed_by_staff_id TEXT,
  evidence_set_hash TEXT NOT NULL CHECK (length(evidence_set_hash)=64),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,workprogram_id) REFERENCES workprograms(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,template_step_id) REFERENCES procedure_templates(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prepared_by_staff_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,executed_by_staff_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,workprogram_id,ordinal),
  CHECK ((origin='STANDARD' AND template_step_id IS NOT NULL) OR (origin='AD_HOC' AND template_step_id IS NULL AND length(trim(COALESCE(scope_reason,'')))>=10)),
  CHECK ((applicable=1 AND not_applicable_reason IS NULL) OR (applicable=0 AND length(trim(COALESCE(not_applicable_reason,'')))>=10))
);
CREATE TABLE IF NOT EXISTS procedure_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal>0),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  instructions TEXT NOT NULL CHECK (length(trim(instructions)) BETWEEN 1 AND 10000),
  assertion TEXT NOT NULL CHECK (assertion IN ('EXISTENCE','RIGHTS_OBLIGATIONS','COMPLETENESS','VALUATION','CUTOFF','PRESENTATION')),
  mandatory INTEGER NOT NULL CHECK (mandatory IN (0,1)),
  FOREIGN KEY (workspace_id,template_id) REFERENCES workprogram_templates(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,template_id,ordinal)
);
CREATE INDEX IF NOT EXISTS procedures_workprogram_idx ON procedures(workspace_id,workprogram_id,status,ordinal);
CREATE TABLE IF NOT EXISTS procedure_revisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  procedure_id TEXT NOT NULL,
  row_version INTEGER NOT NULL CHECK (row_version>0),
  content_snapshot_json TEXT NOT NULL CHECK (json_valid(content_snapshot_json)),
  evidence_set_hash TEXT NOT NULL CHECK (length(evidence_set_hash)=64),
  changed_by_actor_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  reason TEXT,
  FOREIGN KEY (workspace_id,procedure_id) REFERENCES procedures(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,changed_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,procedure_id,row_version)
);
CREATE TABLE IF NOT EXISTS procedure_submissions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  procedure_id TEXT NOT NULL,
  row_version INTEGER NOT NULL,
  content_version INTEGER NOT NULL CHECK (content_version>0),
  evidence_set_hash TEXT NOT NULL CHECK (length(evidence_set_hash)=64),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  submitted_by_actor_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUBMITTED','UNDER_REWORK','REVIEWED')),
  FOREIGN KEY (workspace_id,procedure_id,row_version) REFERENCES procedure_revisions(workspace_id,procedure_id,row_version) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,submitted_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TABLE IF NOT EXISTS procedure_review_decisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ACCEPT','REWORK','NOT_APPLICABLE_APPROVED')),
  comments TEXT NOT NULL CHECK (length(trim(comments)) BETWEEN 10 AND 10000),
  reviewer_actor_id TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,submission_id) REFERENCES procedure_submissions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reviewer_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER IF NOT EXISTS procedure_revisions_no_update BEFORE UPDATE ON procedure_revisions
BEGIN SELECT RAISE(ABORT, 'procedure revisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS procedure_revisions_no_delete BEFORE DELETE ON procedure_revisions
BEGIN SELECT RAISE(ABORT, 'procedure revisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS procedure_review_decisions_no_update BEFORE UPDATE ON procedure_review_decisions
BEGIN SELECT RAISE(ABORT, 'procedure review decisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS procedure_review_decisions_no_delete BEFORE DELETE ON procedure_review_decisions
BEGIN SELECT RAISE(ABORT, 'procedure review decisions are append only'); END;

CREATE TABLE IF NOT EXISTS sampling_policies (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 300),
  method TEXT NOT NULL CHECK (method IN ('MUS_BINOMIAL_PPS','SYSTEMATIC','STRATIFIED_ATTRIBUTE')),
  algorithm_version TEXT NOT NULL,
  assumptions TEXT NOT NULL CHECK (length(trim(assumptions)) BETWEEN 10 AND 10000),
  input_schema_json TEXT NOT NULL CHECK (json_valid(input_schema_json)),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  approved_by_actor_id TEXT,
  approved_at TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((status='APPROVED' AND approved_by_actor_id IS NOT NULL AND approved_at IS NOT NULL)
      OR (status<>'APPROVED' AND approved_at IS NULL))
);
CREATE TABLE IF NOT EXISTS sample_populations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 300),
  source_file_id TEXT NOT NULL,
  tb_version_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  order_hash TEXT NOT NULL CHECK (length(order_hash)=64),
  row_count INTEGER NOT NULL CHECK (row_count>0),
  positive_total_minor INTEGER NOT NULL CHECK (positive_total_minor>=0),
  excluded_count INTEGER NOT NULL CHECK (excluded_count>=0),
  exclusions_reason TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,source_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_version_id) REFERENCES tb_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TABLE IF NOT EXISTS population_rows (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  population_id TEXT NOT NULL,
  source_row_key TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal>0),
  book_value_minor INTEGER NOT NULL,
  eligible INTEGER NOT NULL CHECK (eligible IN (0,1)),
  exclusion_reason TEXT,
  stratum_key TEXT,
  source_data_json TEXT NOT NULL CHECK (json_valid(source_data_json)),
  FOREIGN KEY (workspace_id,population_id) REFERENCES sample_populations(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,population_id,source_row_key),
  UNIQUE (workspace_id,population_id,ordinal),
  CHECK ((eligible=1 AND exclusion_reason IS NULL) OR (eligible=0 AND length(trim(COALESCE(exclusion_reason,'')))>=10))
);
CREATE TABLE IF NOT EXISTS sampling_plans (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  population_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK (policy_version>0),
  revision INTEGER NOT NULL CHECK (revision>0),
  method TEXT NOT NULL CHECK (method IN ('MUS_BINOMIAL_PPS','SYSTEMATIC','STRATIFIED_ATTRIBUTE')),
  confidence_bps INTEGER CHECK (confidence_bps IS NULL OR confidence_bps BETWEEN 5000 AND 9999),
  tolerable_minor INTEGER,
  expected_tainted_bps INTEGER CHECK (expected_tainted_bps IS NULL OR expected_tainted_bps BETWEEN 0 AND 9999),
  requested_count INTEGER,
  seed_hex TEXT NOT NULL CHECK (length(seed_hex)=64),
  input_hash TEXT NOT NULL CHECK (length(input_hash)=64),
  calculated_count INTEGER NOT NULL CHECK (calculated_count>0),
  parameters_json TEXT NOT NULL CHECK (json_valid(parameters_json)),
  created_by_reviewer_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 10000),
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,population_id) REFERENCES sample_populations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,policy_id) REFERENCES sampling_policies(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_reviewer_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,population_id,revision),
  CHECK ((method='MUS_BINOMIAL_PPS' AND confidence_bps IS NOT NULL AND tolerable_minor>0 AND expected_tainted_bps IS NOT NULL AND requested_count IS NULL)
      OR (method='SYSTEMATIC' AND confidence_bps IS NULL AND tolerable_minor IS NULL AND expected_tainted_bps IS NULL AND requested_count=calculated_count)
      OR (method='STRATIFIED_ATTRIBUTE' AND confidence_bps IS NOT NULL AND tolerable_minor IS NULL AND expected_tainted_bps IS NULL AND requested_count IS NULL))
);
CREATE TABLE IF NOT EXISTS sample_hits (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  draw_number INTEGER NOT NULL CHECK (draw_number>0),
  population_row_id TEXT NOT NULL,
  monetary_unit_minor INTEGER,
  stratum_key TEXT,
  FOREIGN KEY (workspace_id,plan_id) REFERENCES sampling_plans(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,population_row_id) REFERENCES population_rows(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,plan_id,draw_number)
);
CREATE TABLE IF NOT EXISTS sample_tests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  plan_id TEXT NOT NULL,
  population_row_id TEXT NOT NULL,
  tested INTEGER NOT NULL CHECK (tested IN (0,1)),
  audited_value_minor INTEGER,
  misstated INTEGER CHECK (misstated IS NULL OR misstated IN (0,1)),
  deviation INTEGER CHECK (deviation IS NULL OR deviation IN (0,1)),
  conclusion TEXT,
  evidence_id TEXT,
  evidence_version INTEGER,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  updated_by_actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,plan_id) REFERENCES sampling_plans(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,population_row_id) REFERENCES population_rows(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_id) REFERENCES evidence_records(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,updated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,plan_id,population_row_id),
  CHECK ((tested=0 AND audited_value_minor IS NULL AND misstated IS NULL AND deviation IS NULL)
      OR (tested=1 AND length(trim(COALESCE(conclusion,'')))>=10 AND
        ((audited_value_minor IS NOT NULL AND misstated IS NOT NULL) OR (audited_value_minor IS NULL AND misstated IS NULL AND deviation IS NOT NULL))))
);
CREATE TABLE IF NOT EXISTS sampling_evaluations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  tested_hit_count INTEGER NOT NULL CHECK (tested_hit_count>=0),
  tainted_hit_count INTEGER NOT NULL CHECK (tainted_hit_count>=0),
  upper_bound_minor INTEGER,
  result TEXT NOT NULL CHECK (result IN ('WITHIN_TOLERANCE','EXCEEDS_TOLERANCE','INCOMPLETE','OUTSIDE_ASSUMPTIONS','COMPLETED_NONSTATISTICAL')),
  details_json TEXT NOT NULL CHECK (json_valid(details_json)),
  reviewed_by_actor_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,plan_id) REFERENCES sampling_plans(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reviewed_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,plan_id,revision)
);
CREATE TABLE IF NOT EXISTS sampling_strata (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  key TEXT NOT NULL,
  description TEXT NOT NULL,
  population_count INTEGER NOT NULL CHECK (population_count>0),
  expected_deviation_bps INTEGER NOT NULL CHECK (expected_deviation_bps BETWEEN 0 AND 9999),
  tolerable_deviation_bps INTEGER NOT NULL CHECK (tolerable_deviation_bps BETWEEN 1 AND 10000),
  alpha_numerator TEXT NOT NULL,
  alpha_denominator TEXT NOT NULL,
  sample_count INTEGER NOT NULL CHECK (sample_count>0),
  FOREIGN KEY (workspace_id,plan_id) REFERENCES sampling_plans(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,plan_id,key),
  CHECK (expected_deviation_bps<tolerable_deviation_bps)
);
CREATE TABLE IF NOT EXISTS stratum_memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  population_row_id TEXT NOT NULL,
  stratum_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,plan_id) REFERENCES sampling_plans(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,population_row_id) REFERENCES population_rows(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,stratum_id) REFERENCES sampling_strata(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,plan_id,population_row_id)
);
CREATE TABLE IF NOT EXISTS stratum_evaluations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  sampling_evaluation_id TEXT NOT NULL,
  stratum_id TEXT NOT NULL,
  tested_count INTEGER NOT NULL CHECK (tested_count>=0),
  deviation_count INTEGER NOT NULL CHECK (deviation_count>=0),
  upper_population_deviation_count INTEGER,
  upper_rate_numerator INTEGER,
  upper_rate_denominator INTEGER,
  result TEXT NOT NULL CHECK (result IN ('WITHIN_TOLERANCE','EXCEEDS_TOLERANCE','INCOMPLETE')),
  FOREIGN KEY (workspace_id,sampling_evaluation_id) REFERENCES sampling_evaluations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,stratum_id) REFERENCES sampling_strata(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,sampling_evaluation_id,stratum_id)
);
CREATE TRIGGER IF NOT EXISTS sample_populations_no_update BEFORE UPDATE ON sample_populations
BEGIN SELECT RAISE(ABORT, 'sample populations are append only'); END;
CREATE TRIGGER IF NOT EXISTS population_rows_no_update BEFORE UPDATE ON population_rows
BEGIN SELECT RAISE(ABORT, 'population rows are append only'); END;
CREATE TRIGGER IF NOT EXISTS sampling_plans_no_update BEFORE UPDATE ON sampling_plans
BEGIN SELECT RAISE(ABORT, 'sampling plans are append only'); END;
CREATE TRIGGER IF NOT EXISTS sampling_evaluations_no_update BEFORE UPDATE ON sampling_evaluations
BEGIN SELECT RAISE(ABORT, 'sampling evaluations are append only'); END;

CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('DIGITAL','PHYSICAL','HYBRID')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  file_version_id TEXT,
  physical_index TEXT,
  physical_description TEXT,
  binder TEXT,
  box TEXT,
  shelf TEXT,
  external_source_url TEXT,
  retrieved_at TEXT,
  supersedes_evidence_id TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,supersedes_evidence_id) REFERENCES evidence_records(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,family_id,version),
  CHECK ((mode='DIGITAL' AND file_version_id IS NOT NULL)
      OR (mode='PHYSICAL' AND length(trim(COALESCE(physical_index,'')))>0 AND length(trim(COALESCE(physical_description,'')))>=5 AND (binder IS NOT NULL OR box IS NOT NULL OR shelf IS NOT NULL))
      OR (mode='HYBRID' AND file_version_id IS NOT NULL AND length(trim(COALESCE(physical_index,'')))>0 AND length(trim(COALESCE(physical_description,'')))>=5 AND (binder IS NOT NULL OR box IS NOT NULL OR shelf IS NOT NULL)))
);
CREATE TABLE IF NOT EXISTS evidence_adequacy_decisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  evidence_version INTEGER NOT NULL,
  adequacy TEXT NOT NULL CHECK (adequacy IN ('PENDING_VERIFICATION','ADEQUATE','DEFICIENT')),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  reviewed_by_actor_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,evidence_id) REFERENCES evidence_records(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reviewed_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TABLE IF NOT EXISTS evidence_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  evidence_version INTEGER NOT NULL,
  target_version INTEGER NOT NULL CHECK (target_version>0),
  procedure_id TEXT,
  sample_test_id TEXT,
  analytical_review_id TEXT,
  finding_id TEXT,
  linked_by_actor_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_id) REFERENCES evidence_records(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,procedure_id) REFERENCES procedures(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,sample_test_id) REFERENCES sample_tests(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,analytical_review_id) REFERENCES analytical_reviews(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,finding_id) REFERENCES findings(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,linked_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((procedure_id IS NOT NULL)+(sample_test_id IS NOT NULL)+(analytical_review_id IS NOT NULL)+(finding_id IS NOT NULL)=1)
);
CREATE TABLE IF NOT EXISTS evidence_unlinks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  evidence_link_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 10000),
  actor_id TEXT NOT NULL,
  unlinked_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,evidence_link_id) REFERENCES evidence_links(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,evidence_link_id)
);
CREATE TABLE IF NOT EXISTS fieldwork_change_feed (
  workspace_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence>0),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  row_version INTEGER NOT NULL CHECK (row_version>0),
  engagement_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id,sequence),
  FOREIGN KEY (workspace_id,engagement_id) REFERENCES engagements(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS fieldwork_change_feed_engagement_idx ON fieldwork_change_feed(workspace_id,engagement_id,sequence);
CREATE TRIGGER IF NOT EXISTS evidence_records_no_update BEFORE UPDATE ON evidence_records
BEGIN SELECT RAISE(ABORT, 'evidence versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS evidence_records_no_delete BEFORE DELETE ON evidence_records
BEGIN SELECT RAISE(ABORT, 'evidence versions cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS evidence_links_no_update BEFORE UPDATE ON evidence_links
BEGIN SELECT RAISE(ABORT, 'evidence links are immutable'); END;
CREATE TRIGGER IF NOT EXISTS evidence_links_no_delete BEFORE DELETE ON evidence_links
BEGIN SELECT RAISE(ABORT, 'evidence links are unlinked by append only event'); END;
CREATE TRIGGER IF NOT EXISTS evidence_unlinks_no_update BEFORE UPDATE ON evidence_unlinks
BEGIN SELECT RAISE(ABORT, 'evidence unlink events are append only'); END;
CREATE TRIGGER IF NOT EXISTS evidence_unlinks_no_delete BEFORE DELETE ON evidence_unlinks
BEGIN SELECT RAISE(ABORT, 'evidence unlink events are append only'); END;
CREATE TRIGGER IF NOT EXISTS fieldwork_change_feed_no_update BEFORE UPDATE ON fieldwork_change_feed
BEGIN SELECT RAISE(ABORT, 'fieldwork change feed is append only'); END;
CREATE TRIGGER IF NOT EXISTS fieldwork_change_feed_no_delete BEFORE DELETE ON fieldwork_change_feed
BEGIN SELECT RAISE(ABORT, 'fieldwork change feed is append only'); END;
