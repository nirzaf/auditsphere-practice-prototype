ALTER TABLE firm_profiles ADD COLUMN credential_file_ids_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(credential_file_ids_json) AND length(credential_file_ids_json)<=10000);
ALTER TABLE firm_profiles ADD COLUMN portfolio_file_ids_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(portfolio_file_ids_json) AND length(portfolio_file_ids_json)<=10000);
ALTER TABLE proposal_versions ADD COLUMN firm_credential_file_ids_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(firm_credential_file_ids_json) AND length(firm_credential_file_ids_json)<=10000);
ALTER TABLE proposal_versions ADD COLUMN firm_portfolio_file_ids_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(firm_portfolio_file_ids_json) AND length(firm_portfolio_file_ids_json)<=10000);

UPDATE application_schema_version
SET version = 37,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
