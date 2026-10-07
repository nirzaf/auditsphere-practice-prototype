-- Real BUSINESS workspace bootstrap and the first canonical workspace fields.
-- Legacy TEST workspaces keep their existing prototype status/revision columns.
ALTER TABLE workspaces ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE workspaces ADD COLUMN business_status TEXT NOT NULL DEFAULT 'ACTIVE'
  CHECK (business_status IN ('ACTIVE', 'READ_ONLY'));
ALTER TABLE workspaces ADD COLUMN created_at_utc TEXT;
ALTER TABLE workspaces ADD COLUMN updated_at_utc TEXT;

UPDATE workspaces
SET created_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, 'unixepoch'),
    updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, 'unixepoch')
WHERE created_at_utc IS NULL OR updated_at_utc IS NULL;

-- Bootstrap retries are globally idempotent even though the workspace does not
-- exist until the same D1 batch creates it. Only the one-way hashes are stored.
CREATE TABLE IF NOT EXISTS business_bootstrap_receipts (
  idempotency_key_hash TEXT PRIMARY KEY CHECK (length(idempotency_key_hash) = 64),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  workspace_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  actor_profile_id TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, staff_member_id) REFERENCES staff_members(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, actor_profile_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS actor_profiles_one_active_staff_persona_idx
  ON actor_profiles(workspace_id, persona, staff_member_id)
  WHERE active = 1 AND staff_member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS actor_profiles_one_active_client_persona_idx
  ON actor_profiles(workspace_id, persona, contact_id)
  WHERE active = 1 AND contact_id IS NOT NULL;

-- Keep every invariant in a single-condition trigger with one RAISE statement.
-- This makes each guard explicit and keeps migration statements simple to apply.
CREATE TRIGGER IF NOT EXISTS actor_profiles_active_staff_insert
BEFORE INSERT ON actor_profiles
WHEN NEW.persona <> 'CLIENT' AND NOT EXISTS (
  SELECT 1 FROM staff_members s WHERE s.workspace_id=NEW.workspace_id AND s.id=NEW.staff_member_id AND s.active=1
)
BEGIN SELECT RAISE(ABORT, 'staff actor profile requires active staff'); END;

CREATE TRIGGER IF NOT EXISTS actor_profiles_active_client_insert
BEFORE INSERT ON actor_profiles
WHEN NEW.persona = 'CLIENT' AND NOT EXISTS (
  SELECT 1 FROM contacts c JOIN clients cl ON cl.workspace_id=c.workspace_id AND cl.id=c.client_id
  WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.contact_id AND c.active=1 AND cl.active=1
)
BEGIN SELECT RAISE(ABORT, 'client actor profile requires active contact and client'); END;

CREATE TRIGGER IF NOT EXISTS actor_profiles_approver_grade_insert
BEFORE INSERT ON actor_profiles
WHEN NEW.persona = 'APPROVER' AND NOT EXISTS (
  SELECT 1 FROM staff_members s WHERE s.workspace_id=NEW.workspace_id AND s.id=NEW.staff_member_id AND s.grade='PARTNER'
)
BEGIN SELECT RAISE(ABORT, 'APPROVER requires PARTNER grade'); END;

CREATE TRIGGER IF NOT EXISTS actor_profiles_reviewer_grade_insert
BEFORE INSERT ON actor_profiles
WHEN NEW.persona = 'REVIEWER' AND NOT EXISTS (
  SELECT 1 FROM staff_members s WHERE s.workspace_id=NEW.workspace_id AND s.id=NEW.staff_member_id AND s.grade IN ('MANAGER','SENIOR')
)
BEGIN SELECT RAISE(ABORT, 'REVIEWER requires MANAGER or SENIOR grade'); END;

CREATE TRIGGER IF NOT EXISTS actor_profiles_approver_grade_update
BEFORE UPDATE OF persona, staff_member_id, active ON actor_profiles
WHEN NEW.active=1 AND NEW.persona='APPROVER' AND NOT EXISTS (
  SELECT 1 FROM staff_members s WHERE s.workspace_id=NEW.workspace_id AND s.id=NEW.staff_member_id AND s.grade='PARTNER' AND s.active=1
)
BEGIN SELECT RAISE(ABORT, 'APPROVER requires active PARTNER grade'); END;

CREATE TRIGGER IF NOT EXISTS actor_profiles_reviewer_grade_update
BEFORE UPDATE OF persona, staff_member_id, active ON actor_profiles
WHEN NEW.active=1 AND NEW.persona='REVIEWER' AND NOT EXISTS (
  SELECT 1 FROM staff_members s WHERE s.workspace_id=NEW.workspace_id AND s.id=NEW.staff_member_id AND s.grade IN ('MANAGER','SENIOR') AND s.active=1
)
BEGIN SELECT RAISE(ABORT, 'REVIEWER requires active MANAGER or SENIOR grade'); END;

CREATE TRIGGER IF NOT EXISTS actor_profiles_active_staff_update
BEFORE UPDATE OF persona, staff_member_id, contact_id, active ON actor_profiles
WHEN NEW.active=1 AND NEW.persona<>'CLIENT' AND NOT EXISTS (
  SELECT 1 FROM staff_members s WHERE s.workspace_id=NEW.workspace_id AND s.id=NEW.staff_member_id AND s.active=1
)
BEGIN SELECT RAISE(ABORT, 'staff actor profile requires active staff'); END;

CREATE TRIGGER IF NOT EXISTS actor_profiles_active_client_update
BEFORE UPDATE OF persona, staff_member_id, contact_id, active ON actor_profiles
WHEN NEW.active=1 AND NEW.persona='CLIENT' AND NOT EXISTS (
  SELECT 1 FROM contacts c JOIN clients cl ON cl.workspace_id=c.workspace_id AND cl.id=c.client_id
  WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.contact_id AND c.active=1 AND cl.active=1
)
BEGIN SELECT RAISE(ABORT, 'client actor profile requires active contact and client'); END;

CREATE TRIGGER IF NOT EXISTS staff_active_approver_grade_update
BEFORE UPDATE OF grade, active ON staff_members
WHEN NEW.active=1 AND NEW.grade<>'PARTNER' AND EXISTS (
  SELECT 1 FROM actor_profiles ap WHERE ap.workspace_id=NEW.workspace_id AND ap.staff_member_id=NEW.id AND ap.active=1 AND ap.persona='APPROVER'
)
BEGIN SELECT RAISE(ABORT, 'active APPROVER profile requires PARTNER grade'); END;

CREATE TRIGGER IF NOT EXISTS staff_active_reviewer_grade_update
BEFORE UPDATE OF grade, active ON staff_members
WHEN NEW.active=1 AND NEW.grade NOT IN ('MANAGER','SENIOR') AND EXISTS (
  SELECT 1 FROM actor_profiles ap WHERE ap.workspace_id=NEW.workspace_id AND ap.staff_member_id=NEW.id AND ap.active=1 AND ap.persona='REVIEWER'
)
BEGIN SELECT RAISE(ABORT, 'active REVIEWER profile requires MANAGER or SENIOR grade'); END;

CREATE TRIGGER IF NOT EXISTS staff_deactivate_profiles_guard
BEFORE UPDATE OF active ON staff_members
WHEN NEW.active=0 AND OLD.active=1 AND EXISTS (
  SELECT 1 FROM actor_profiles ap WHERE ap.workspace_id=NEW.workspace_id AND ap.staff_member_id=NEW.id AND ap.active=1
)
BEGIN SELECT RAISE(ABORT, 'deactivate actor profiles before staff member'); END;
