-- User accounts: a login identity that owns one or more actor_profiles.
CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  kind TEXT NOT NULL CHECK (kind IN ('STAFF','CLIENT')),
  email_normalized TEXT NOT NULL CHECK (length(email_normalized) BETWEEN 3 AND 320 AND email_normalized = lower(trim(email_normalized))),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  staff_member_id TEXT,
  contact_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('INVITED','ACTIVE','LOCKED','DISABLED')),
  -- STAFF: OIDC subject (Entra 'oid'); CLIENT: NULL
  external_issuer TEXT,
  external_subject TEXT,
  -- CLIENT only: Argon2id v=19,m=19456,t=2,p=1; 16-byte salt and 32-byte hash, base64url encoded.
  password_hash TEXT,
  password_must_change INTEGER NOT NULL DEFAULT 0 CHECK (password_must_change IN (0,1)),
  password_changed_at TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until TEXT,
  is_firm_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_firm_admin IN (0,1)),
  last_login_at TEXT,
  created_by_actor_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, staff_member_id) REFERENCES staff_members(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, created_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, email_normalized),
  UNIQUE (workspace_id, external_issuer, external_subject),
  CHECK ((kind = 'STAFF'  AND staff_member_id IS NOT NULL AND contact_id IS NULL AND password_hash IS NULL)
      OR (kind = 'CLIENT' AND contact_id IS NOT NULL AND staff_member_id IS NULL AND external_subject IS NULL)),
  CHECK (is_firm_admin = 0 OR kind = 'STAFF')
);
CREATE INDEX IF NOT EXISTS user_accounts_staff_idx ON user_accounts(workspace_id, staff_member_id);
CREATE INDEX IF NOT EXISTS user_accounts_contact_idx ON user_accounts(workspace_id, contact_id);

-- Which actor profiles a user may act as. Grants are revoked, never deleted.
CREATE TABLE IF NOT EXISTS user_profile_grants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_account_id TEXT NOT NULL,
  actor_profile_id TEXT NOT NULL,
  granted_by_actor_id TEXT,           -- NULL only for bootstrap CLI
  granted_at TEXT NOT NULL,
  revoked_by_actor_id TEXT,
  revoked_at TEXT,
  FOREIGN KEY (workspace_id, user_account_id) REFERENCES user_accounts(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, actor_profile_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  CHECK ((revoked_at IS NULL AND revoked_by_actor_id IS NULL) OR revoked_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_profile_grants_active_uq
  ON user_profile_grants(workspace_id, user_account_id, actor_profile_id) WHERE revoked_at IS NULL;
-- An actor profile belongs to exactly one active user.
CREATE UNIQUE INDEX IF NOT EXISTS user_profile_grants_profile_owner_uq
  ON user_profile_grants(workspace_id, actor_profile_id) WHERE revoked_at IS NULL;
CREATE TRIGGER IF NOT EXISTS user_profile_grants_no_delete BEFORE DELETE ON user_profile_grants
  BEGIN SELECT RAISE(ABORT, 'user_profile_grants are append-only'); END;
CREATE TRIGGER IF NOT EXISTS user_profile_grants_revoke_only BEFORE UPDATE ON user_profile_grants
  WHEN OLD.revoked_at IS NOT NULL OR NEW.user_account_id <> OLD.user_account_id OR NEW.actor_profile_id <> OLD.actor_profile_id
  BEGIN SELECT RAISE(ABORT, 'user_profile_grants may only be revoked once'); END;

-- Server-side sessions. Token stored only as SHA-256 hex.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_account_id TEXT NOT NULL,
  token_sha256 TEXT NOT NULL CHECK (length(token_sha256) = 64),
  active_actor_profile_id TEXT,
  auth_method TEXT NOT NULL CHECK (auth_method IN ('OIDC_ENTRA','PASSWORD')),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT CHECK (revoked_reason IS NULL OR revoked_reason IN ('LOGOUT','PASSWORD_CHANGED','ACCOUNT_DISABLED','ADMIN_REVOKED','EXPIRED','GRANT_REVOKED')),
  ip_sha256 TEXT,
  user_agent_sha256 TEXT,
  FOREIGN KEY (workspace_id, user_account_id) REFERENCES user_accounts(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, active_actor_profile_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (token_sha256)
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(workspace_id, user_account_id, revoked_at);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(absolute_expires_at);

-- Single-use tokens for invites, temporary passwords and resets.
CREATE TABLE IF NOT EXISTS credential_tokens (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_account_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('STAFF_INVITE','CLIENT_TEMP_PASSWORD','PASSWORD_RESET')),
  token_sha256 TEXT NOT NULL CHECK (length(token_sha256) = 64),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by_actor_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, user_account_id) REFERENCES user_accounts(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (token_sha256)
);
CREATE TRIGGER IF NOT EXISTS credential_tokens_consume_once BEFORE UPDATE ON credential_tokens
  WHEN OLD.consumed_at IS NOT NULL OR NEW.token_sha256 <> OLD.token_sha256 OR NEW.purpose <> OLD.purpose
  BEGIN SELECT RAISE(ABORT, 'credential_tokens are single-use'); END;
CREATE TRIGGER IF NOT EXISTS credential_tokens_no_delete BEFORE DELETE ON credential_tokens
  BEGIN SELECT RAISE(ABORT, 'credential_tokens are retained for audit'); END;

-- Append-only authentication log (separate from business audit_events chain).
CREATE TABLE IF NOT EXISTS auth_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_account_id TEXT,
  event TEXT NOT NULL CHECK (event IN ('LOGIN_SUCCEEDED','LOGIN_FAILED','LOCKED','UNLOCKED','LOGOUT','PASSWORD_CHANGED',
    'PASSWORD_RESET_REQUESTED','PASSWORD_RESET_COMPLETED','TEMP_PASSWORD_ISSUED','INVITE_ISSUED','INVITE_ACCEPTED',
    'PROFILE_SWITCHED','GRANT_ADDED','GRANT_REVOKED','ACCOUNT_DISABLED','ACCOUNT_ENABLED','SESSION_REVOKED')),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json) AND length(detail_json) <= 4000),
  ip_sha256 TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS auth_events_user_idx ON auth_events(workspace_id, user_account_id, created_at);
CREATE TRIGGER IF NOT EXISTS auth_events_no_update BEFORE UPDATE ON auth_events
  BEGIN SELECT RAISE(ABORT, 'auth_events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS auth_events_no_delete BEFORE DELETE ON auth_events
  BEGIN SELECT RAISE(ABORT, 'auth_events are append-only'); END;

UPDATE application_schema_version SET version=46, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;
