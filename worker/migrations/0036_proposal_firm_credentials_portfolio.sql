ALTER TABLE firm_profiles ADD COLUMN credentials_text TEXT NOT NULL DEFAULT ''
  CHECK (length(credentials_text)<=10000);
ALTER TABLE firm_profiles ADD COLUMN industry_portfolio_text TEXT NOT NULL DEFAULT ''
  CHECK (length(industry_portfolio_text)<=10000);

UPDATE application_schema_version
SET version = 36,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
