-- Preserve a direct immutable approval reference on confirmations whose relied-upon
-- scope was reassessed by a Partner.
ALTER TABLE confirmations
  ADD COLUMN scope_approval_id TEXT REFERENCES approval_decisions(id) ON DELETE RESTRICT;

CREATE INDEX confirmation_scope_approval_idx
  ON confirmations(workspace_id,scope_approval_id);

CREATE TRIGGER confirmation_scope_approval_insert
BEFORE INSERT ON confirmations
WHEN NEW.scope_approval_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM approval_decisions a
  WHERE a.workspace_id=NEW.workspace_id AND a.id=NEW.scope_approval_id
    AND a.subject_type='CONFIRMATION_SCOPE' AND a.subject_id=NEW.id
    AND a.subject_version=NEW.version AND a.decision='APPROVE'
)
BEGIN SELECT RAISE(ABORT,'confirmation scope approval must match its immutable Partner decision'); END;

CREATE TRIGGER confirmation_scope_approval_update
BEFORE UPDATE OF scope_approval_id ON confirmations
WHEN NEW.scope_approval_id IS NOT OLD.scope_approval_id AND NEW.scope_approval_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM approval_decisions a
  WHERE a.workspace_id=NEW.workspace_id AND a.id=NEW.scope_approval_id
    AND a.subject_type='CONFIRMATION_SCOPE' AND a.subject_id=NEW.id
    AND a.subject_version=NEW.version AND a.decision='APPROVE'
)
BEGIN SELECT RAISE(ABORT,'confirmation scope approval must match its immutable Partner decision'); END;

CREATE TRIGGER confirmation_scope_approval_immutable
BEFORE UPDATE OF scope_approval_id ON confirmations
WHEN OLD.scope_approval_id IS NOT NULL AND NEW.scope_approval_id IS NOT OLD.scope_approval_id
BEGIN SELECT RAISE(ABORT,'confirmation scope approval references are immutable'); END;

UPDATE application_schema_version
SET version = 31,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
