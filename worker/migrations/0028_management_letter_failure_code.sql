-- Preserve the terminal background-job error on failed management-letter versions.
ALTER TABLE management_letter_versions ADD COLUMN failure_code TEXT;

UPDATE application_schema_version
SET version = 28,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
