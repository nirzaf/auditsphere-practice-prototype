-- Keep account-name similarity as draft-only metadata. It never constitutes
-- approval and is not copied into an approved mapping unless a reviewer
-- explicitly confirms the selected FSLI through tb.mapping.set.
ALTER TABLE mapping_draft_lines ADD COLUMN suggestion_kind TEXT
  CHECK (suggestion_kind IS NULL OR suggestion_kind='NAME_SIMILARITY');
ALTER TABLE mapping_draft_lines ADD COLUMN suggestion_score INTEGER
  CHECK (suggestion_score IS NULL OR suggestion_score BETWEEN 0 AND 100);

CREATE TRIGGER mapping_name_suggestion_insert_guard
BEFORE INSERT ON mapping_draft_lines
WHEN (NEW.suggestion_kind IS NULL AND NEW.suggestion_score IS NOT NULL)
  OR (NEW.suggestion_kind='NAME_SIMILARITY' AND (NEW.suggestion_score IS NULL OR NEW.fsli_id IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'name similarity suggestion metadata is incomplete');
END;

CREATE TRIGGER mapping_name_suggestion_update_guard
BEFORE UPDATE OF fsli_id,suggestion_kind,suggestion_score ON mapping_draft_lines
WHEN (NEW.suggestion_kind IS NULL AND NEW.suggestion_score IS NOT NULL)
  OR (NEW.suggestion_kind='NAME_SIMILARITY' AND (NEW.suggestion_score IS NULL OR NEW.fsli_id IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'name similarity suggestion metadata is incomplete');
END;

UPDATE application_schema_version
SET version=44, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton=1;
