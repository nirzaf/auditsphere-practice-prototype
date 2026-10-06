-- Require an auditable reason whenever a recipient route is retained as an alternate.
-- Existing alternate rows remain NULL and are identified as legacy in the client UI.
ALTER TABLE contact_routes ADD COLUMN rationale TEXT
  CHECK (rationale IS NULL OR length(trim(rationale)) BETWEEN 10 AND 1000);

CREATE TRIGGER contact_routes_alternate_rationale_insert
BEFORE INSERT ON contact_routes
WHEN NEW.is_primary=0 AND length(trim(COALESCE(NEW.rationale,'')))<10
BEGIN
  SELECT RAISE(ABORT,'alternate contact routes require a documented rationale');
END;

CREATE TRIGGER contact_routes_alternate_rationale_update
BEFORE UPDATE OF is_primary,rationale ON contact_routes
WHEN NEW.is_primary=0 AND length(trim(COALESCE(NEW.rationale,'')))<10
BEGIN
  SELECT RAISE(ABORT,'alternate contact routes require a documented rationale');
END;

UPDATE application_schema_version
SET version = 29,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
