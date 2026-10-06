ALTER TABLE firm_report_snapshots ADD COLUMN file_version_id TEXT REFERENCES file_versions(id) ON DELETE RESTRICT;
CREATE INDEX firm_report_snapshots_file_idx ON firm_report_snapshots(workspace_id,file_version_id);
