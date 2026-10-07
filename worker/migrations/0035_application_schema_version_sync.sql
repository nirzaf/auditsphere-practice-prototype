-- Migration 0034 added persisted profitability snapshot metrics without advancing
-- the application schema marker. Version 35 records both that shape and the
-- trusted verification-ingestion contract introduced with this release.
UPDATE application_schema_version
SET version = 35,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
