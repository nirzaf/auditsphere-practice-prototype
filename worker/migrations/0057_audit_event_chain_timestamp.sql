-- Preserve the exact instant used by each event hash. Older rows stay NULL and
-- the restore verifier reconstructs their timestamp from created_at.
ALTER TABLE audit_events ADD COLUMN chain_timestamp TEXT;

UPDATE application_schema_version
SET version=57, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton=1;
