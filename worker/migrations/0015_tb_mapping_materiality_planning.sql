-- Immutable imported trial balances, scoped FSLI mapping, materiality and planning approvals.
CREATE TABLE IF NOT EXISTS tb_imports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  file_version_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STAGED','VALIDATING','INVALID','READY','ACTIVATED')),
  worksheet TEXT,
  column_map_json TEXT NOT NULL CHECK (json_valid(column_map_json)),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256)=64),
  current_debits_minor INTEGER,
  current_credits_minor INTEGER,
  prior_debits_minor INTEGER,
  prior_credits_minor INTEGER,
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  errors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(errors_json)),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,file_version_id)
);
CREATE INDEX IF NOT EXISTS tb_imports_engagement_status_idx ON tb_imports(workspace_id,engagement_id,status,created_at);

CREATE TABLE IF NOT EXISTS tb_staging_lines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
  account_code TEXT,
  account_name TEXT,
  current_minor INTEGER,
  prior_minor INTEGER,
  source_text_json TEXT NOT NULL CHECK (json_valid(source_text_json)),
  errors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(errors_json)),
  FOREIGN KEY (workspace_id,import_id) REFERENCES tb_imports(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,import_id,source_row_number)
);
CREATE INDEX IF NOT EXISTS tb_staging_lines_import_idx ON tb_staging_lines(workspace_id,import_id,source_row_number);

CREATE TABLE IF NOT EXISTS tb_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  import_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency='QAR'),
  current_debits_minor INTEGER NOT NULL CHECK (current_debits_minor >= 0),
  current_credits_minor INTEGER NOT NULL CHECK (current_credits_minor >= 0),
  prior_debits_minor INTEGER,
  prior_credits_minor INTEGER,
  prior_present INTEGER NOT NULL CHECK (prior_present IN (0,1)),
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
  accepted_by_actor_id TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,import_id) REFERENCES tb_imports(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,accepted_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision),
  UNIQUE (workspace_id,engagement_id,content_sha256),
  CHECK (period_start <= period_end),
  CHECK (current_debits_minor=current_credits_minor),
  CHECK ((prior_present=0 AND prior_debits_minor IS NULL AND prior_credits_minor IS NULL)
    OR (prior_present=1 AND prior_debits_minor=prior_credits_minor))
);
CREATE INDEX IF NOT EXISTS tb_versions_engagement_idx ON tb_versions(workspace_id,engagement_id,revision DESC);

CREATE TABLE IF NOT EXISTS tb_lines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  tb_version_id TEXT NOT NULL,
  source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
  account_code TEXT NOT NULL CHECK (length(trim(account_code)) BETWEEN 1 AND 200),
  account_name TEXT NOT NULL CHECK (length(trim(account_name)) BETWEEN 1 AND 500),
  current_minor INTEGER NOT NULL,
  prior_minor INTEGER,
  source_text_json TEXT NOT NULL CHECK (json_valid(source_text_json)),
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_version_id) REFERENCES tb_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,tb_version_id,account_code),
  UNIQUE (workspace_id,tb_version_id,source_row_number)
);
CREATE INDEX IF NOT EXISTS tb_lines_account_idx ON tb_lines(workspace_id,client_id,account_code,tb_version_id);
CREATE TRIGGER IF NOT EXISTS tb_versions_no_update BEFORE UPDATE ON tb_versions
BEGIN SELECT RAISE(ABORT, 'accepted TB versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS tb_versions_no_delete BEFORE DELETE ON tb_versions
BEGIN SELECT RAISE(ABORT, 'accepted TB versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS tb_lines_no_update BEFORE UPDATE ON tb_lines
BEGIN SELECT RAISE(ABORT, 'accepted TB lines are append only'); END;
CREATE TRIGGER IF NOT EXISTS tb_lines_no_delete BEFORE DELETE ON tb_lines
BEGIN SELECT RAISE(ABORT, 'accepted TB lines are append only'); END;

CREATE TABLE IF NOT EXISTS fsli_catalog (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  reporting_framework TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  statement TEXT NOT NULL CHECK (statement IN ('PROFIT_LOSS','BALANCE_SHEET')),
  category TEXT NOT NULL CHECK (category IN ('REVENUE','EXPENSE','ASSET','LIABILITY','EQUITY')),
  normal_side TEXT NOT NULL CHECK (normal_side IN ('DEBIT','CREDIT')),
  display_sign INTEGER NOT NULL CHECK (display_sign IN (-1,1)),
  presentation_order INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,reporting_framework,code)
);
CREATE INDEX IF NOT EXISTS fsli_catalog_active_idx ON fsli_catalog(workspace_id,reporting_framework,active,presentation_order);

CREATE TABLE IF NOT EXISTS mapping_drafts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  tb_version_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED')),
  reporting_framework TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_version_id) REFERENCES tb_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,tb_version_id,revision)
);
CREATE TABLE IF NOT EXISTS mapping_draft_lines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  draft_id TEXT NOT NULL,
  tb_line_id TEXT NOT NULL,
  fsli_id TEXT,
  origin TEXT CHECK (origin IS NULL OR origin IN ('MANUAL','EXACT_HISTORY')),
  source_historical_mapping_id TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0,1)),
  reason TEXT,
  FOREIGN KEY (workspace_id,draft_id) REFERENCES mapping_drafts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_line_id) REFERENCES tb_lines(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,draft_id,tb_line_id),
  CHECK (confirmed=0 OR (fsli_id IS NOT NULL AND origin IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mapping_draft_lines_lookup_idx ON mapping_draft_lines(workspace_id,draft_id,confirmed,tb_line_id);

CREATE TABLE IF NOT EXISTS mapping_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  tb_version_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  reporting_framework TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_version_id) REFERENCES tb_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,draft_id) REFERENCES mapping_drafts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision)
);
CREATE TABLE IF NOT EXISTS tb_mappings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  mapping_version_id TEXT NOT NULL,
  tb_line_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('MANUAL','EXACT_HISTORY')),
  source_historical_mapping_id TEXT,
  rationale TEXT,
  FOREIGN KEY (workspace_id,mapping_version_id) REFERENCES mapping_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_line_id) REFERENCES tb_lines(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,mapping_version_id,tb_line_id)
);
CREATE TABLE IF NOT EXISTS mapping_memory (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  account_code TEXT NOT NULL,
  reporting_framework TEXT NOT NULL,
  source_mapping_version_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  effective_period_end TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id) REFERENCES clients(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,source_mapping_version_id) REFERENCES mapping_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE INDEX IF NOT EXISTS mapping_memory_exact_idx ON mapping_memory(workspace_id,client_id,reporting_framework,account_code,effective_period_end DESC);
CREATE TRIGGER IF NOT EXISTS mapping_versions_no_update BEFORE UPDATE ON mapping_versions
BEGIN SELECT RAISE(ABORT, 'approved mapping versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS mapping_versions_no_delete BEFORE DELETE ON mapping_versions
BEGIN SELECT RAISE(ABORT, 'approved mapping versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS tb_mappings_no_update BEFORE UPDATE ON tb_mappings
BEGIN SELECT RAISE(ABORT, 'approved TB mappings are append only'); END;
CREATE TRIGGER IF NOT EXISTS tb_mappings_no_delete BEFORE DELETE ON tb_mappings
BEGIN SELECT RAISE(ABORT, 'approved TB mappings are append only'); END;
CREATE TRIGGER IF NOT EXISTS mapping_memory_no_update BEFORE UPDATE ON mapping_memory
BEGIN SELECT RAISE(ABORT, 'historical mapping memory is append only'); END;
CREATE TRIGGER IF NOT EXISTS mapping_memory_no_delete BEFORE DELETE ON mapping_memory
BEGIN SELECT RAISE(ABORT, 'historical mapping memory is append only'); END;

CREATE TABLE IF NOT EXISTS materiality_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  tb_version_id TEXT NOT NULL,
  mapping_version_id TEXT NOT NULL,
  benchmark TEXT NOT NULL CHECK (benchmark IN ('PBT','REVENUE','TOTAL_ASSETS','EQUITY')),
  benchmark_minor INTEGER NOT NULL CHECK (benchmark_minor > 0),
  normalization_minor INTEGER NOT NULL DEFAULT 0,
  normalization_reason TEXT,
  benchmark_rate_bps INTEGER NOT NULL,
  performance_rate_bps INTEGER NOT NULL,
  sad_rate_bps INTEGER NOT NULL,
  pm_raw_numerator TEXT NOT NULL,
  pm_raw_denominator TEXT NOT NULL,
  te_raw_numerator TEXT NOT NULL,
  te_raw_denominator TEXT NOT NULL,
  sad_raw_numerator TEXT NOT NULL,
  sad_raw_denominator TEXT NOT NULL,
  planning_minor INTEGER NOT NULL CHECK (planning_minor > 0),
  performance_minor INTEGER NOT NULL CHECK (performance_minor > 0),
  sad_minor INTEGER NOT NULL CHECK (sad_minor > 0),
  rounding_reason TEXT,
  calculated_by_actor_id TEXT NOT NULL,
  calculated_at TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256)=64),
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_version_id) REFERENCES tb_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,mapping_version_id) REFERENCES mapping_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,calculated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision),
  CHECK (sad_minor < performance_minor AND performance_minor < planning_minor)
);
CREATE TABLE IF NOT EXISTS benchmark_adjustments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  materiality_version_id TEXT NOT NULL,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 5 AND 1000),
  amount_minor INTEGER NOT NULL,
  evidence_file_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,materiality_version_id) REFERENCES materiality_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TABLE IF NOT EXISTS fsli_risks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  fsli_id TEXT NOT NULL,
  materiality_version_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  balance_minor INTEGER NOT NULL,
  inherent_risk TEXT NOT NULL CHECK (inherent_risk IN ('LOW','MODERATE','HIGH')),
  critical_estimate INTEGER NOT NULL CHECK (critical_estimate IN (0,1)),
  band TEXT NOT NULL CHECK (band IN ('GREEN','AMBER','RED')),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 2000),
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256)=64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,materiality_version_id) REFERENCES materiality_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,fsli_id,revision)
);
CREATE TRIGGER IF NOT EXISTS materiality_versions_no_update BEFORE UPDATE ON materiality_versions
BEGIN SELECT RAISE(ABORT, 'materiality versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS materiality_versions_no_delete BEFORE DELETE ON materiality_versions
BEGIN SELECT RAISE(ABORT, 'materiality versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS benchmark_adjustments_no_update BEFORE UPDATE ON benchmark_adjustments
BEGIN SELECT RAISE(ABORT, 'benchmark adjustments are append only'); END;
CREATE TRIGGER IF NOT EXISTS benchmark_adjustments_no_delete BEFORE DELETE ON benchmark_adjustments
BEGIN SELECT RAISE(ABORT, 'benchmark adjustments are append only'); END;
CREATE TRIGGER IF NOT EXISTS fsli_risks_no_update BEFORE UPDATE ON fsli_risks
BEGIN SELECT RAISE(ABORT, 'FSLI risk decisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS fsli_risks_no_delete BEFORE DELETE ON fsli_risks
BEGIN SELECT RAISE(ABORT, 'FSLI risk decisions are append only'); END;

CREATE TABLE IF NOT EXISTS planning_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  tb_version_id TEXT NOT NULL,
  mapping_version_id TEXT NOT NULL,
  materiality_version_id TEXT NOT NULL,
  standards_profile_id TEXT NOT NULL,
  scope_text TEXT NOT NULL,
  strategy_text TEXT NOT NULL,
  staffing_snapshot_json TEXT NOT NULL CHECK (json_valid(staffing_snapshot_json)),
  milestone_snapshot_json TEXT NOT NULL CHECK (json_valid(milestone_snapshot_json)),
  risk_snapshot_json TEXT NOT NULL CHECK (json_valid(risk_snapshot_json)),
  pbc_dependency_snapshot_json TEXT NOT NULL CHECK (json_valid(pbc_dependency_snapshot_json)),
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256)=64),
  prepared_by_actor_id TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_version_id) REFERENCES tb_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,mapping_version_id) REFERENCES mapping_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,materiality_version_id) REFERENCES materiality_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,standards_profile_id) REFERENCES standards_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prepared_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision)
);
CREATE TABLE IF NOT EXISTS planning_signoffs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  planning_version_id TEXT NOT NULL,
  partner_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  dependency_sha256 TEXT NOT NULL CHECK (length(dependency_sha256)=64),
  FOREIGN KEY (workspace_id,planning_version_id) REFERENCES planning_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,partner_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,planning_version_id)
);
CREATE TABLE IF NOT EXISTS planning_stale_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  planning_version_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,planning_version_id) REFERENCES planning_versions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER IF NOT EXISTS planning_versions_no_update BEFORE UPDATE ON planning_versions
BEGIN SELECT RAISE(ABORT, 'compiled planning versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS planning_versions_no_delete BEFORE DELETE ON planning_versions
BEGIN SELECT RAISE(ABORT, 'compiled planning versions are append only'); END;
CREATE TRIGGER IF NOT EXISTS planning_signoffs_no_update BEFORE UPDATE ON planning_signoffs
BEGIN SELECT RAISE(ABORT, 'planning signoffs are append only'); END;
CREATE TRIGGER IF NOT EXISTS planning_signoffs_no_delete BEFORE DELETE ON planning_signoffs
BEGIN SELECT RAISE(ABORT, 'planning signoffs are append only'); END;
CREATE TRIGGER IF NOT EXISTS planning_stale_events_no_update BEFORE UPDATE ON planning_stale_events
BEGIN SELECT RAISE(ABORT, 'planning stale events are append only'); END;
CREATE TRIGGER IF NOT EXISTS planning_stale_events_no_delete BEFORE DELETE ON planning_stale_events
BEGIN SELECT RAISE(ABORT, 'planning stale events are append only'); END;
