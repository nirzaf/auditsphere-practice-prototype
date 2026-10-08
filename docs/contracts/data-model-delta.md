# Data Model Delta (remaining work only)

**Executable source of truth:** `worker/migrations/*.sql` (44 files, last = `0044_mapping_name_suggestions.sql`). This document specifies the **new** migrations the backlog requires. Agents copy the SQL into a new numbered migration file, adjust only what the story's acceptance criteria demand, and record any deviation in the story's report.

## Migration rules (existing conventions — follow exactly)

1. Forward-only, numbered `NNNN_snake_case.sql`, next free number at time of writing is **0045**. Never edit an applied migration. **The numbers below (0045–0050) are labels for review only — at implementation time use the next free number in execution order** (e.g. if E01-S05 runs first, its drop migration becomes 0045 and the auth migration 0046). Also bump `APPLICATION_SCHEMA_VERSION` in `worker/versions.ts` (currently `44`), which readiness compares against the DB (`handleHealthReady` → `SCHEMA_VERSION_MISMATCH`).
2. Every business table has `id TEXT PRIMARY KEY`, `workspace_id TEXT NOT NULL`, `UNIQUE (workspace_id, id)`, composite FKs `(workspace_id, x_id)` → `parent(workspace_id, id)`, `ON DELETE RESTRICT`.
3. Mutable rows carry `version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)`; updates use `WHERE version = ?` and `version = version + 1`.
4. Append-only tables get `BEFORE UPDATE` and `BEFORE DELETE` triggers that `RAISE(ABORT, '…')` (pattern: `worker/migrations/0006_business_foundation.sql` lines 301–304).
5. To change a CHECK constraint SQLite needs a table rebuild (`*_next` → copy → drop → rename; pattern: `0019_external_confirmations.sql` lines 8–34). Prefer a new table over rebuilding a hot table.
6. Bump `application_schema_version` in the same migration (pattern: `0027_application_schema_version.sql`, `0035_application_schema_version_sync.sql`), and update the expected version in `tests/unit/workerMigrations.test.ts`.
7. Timestamps `TEXT` ISO-8601 UTC; dates `TEXT` `YYYY-MM-DD` validated with `CHECK (date(x) IS NOT NULL AND date(x) = x)`.
8. Secrets are never stored in clear: tokens and passwords are stored only as hashes.

---

## 1. `0045_auth_accounts_sessions.sql` — E03-S01

```sql
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
  -- CLIENT only: password hash in PHC-like string, e.g. 'pbkdf2-sha256$i=600000$<salt_b64>$<hash_b64>'
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
```

**Invariants enforced in code (not expressible in SQL):** a grant's actor profile must match the account kind (STAFF account ↔ profile with `staff_member_id` equal to the account's; CLIENT account ↔ profile with `contact_id` equal to the account's); `active_actor_profile_id` must have an active grant for the session's user.

## 2. `0046_portal_credential_provisioning.sql` — E03-S04

```sql
CREATE TABLE IF NOT EXISTS portal_credential_issues (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  contact_route_id TEXT NOT NULL,          -- purpose = 'PBC' (Audit Liaison)
  user_account_id TEXT NOT NULL,
  credential_token_id TEXT NOT NULL,
  outbox_job_id TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('ADVANCE_PAYMENT','MANUAL_REISSUE')),
  created_by_actor_id TEXT,                -- NULL when triggered by the outbox
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, client_id, engagement_id) REFERENCES engagements(workspace_id, client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, contact_route_id) REFERENCES contact_routes(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, user_account_id) REFERENCES user_accounts(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, credential_token_id) REFERENCES credential_tokens(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, outbox_job_id) REFERENCES outbox_jobs(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_credential_issues_auto_once
  ON portal_credential_issues(workspace_id, engagement_id, contact_route_id) WHERE trigger = 'ADVANCE_PAYMENT';
CREATE TRIGGER IF NOT EXISTS portal_credential_issues_no_update BEFORE UPDATE ON portal_credential_issues
  BEGIN SELECT RAISE(ABORT, 'portal_credential_issues are append-only'); END;
CREATE TRIGGER IF NOT EXISTS portal_credential_issues_no_delete BEFORE DELETE ON portal_credential_issues
  BEGIN SELECT RAISE(ABORT, 'portal_credential_issues are append-only'); END;
```

> Verified: `contact_routes` and `proposal_versions` have `UNIQUE (workspace_id, id)`; all FKs in §1–§5 resolve against the real schema (SQL applied on top of migrations 0001–0044 in SQLite 3.45 during authoring). **Check during implementation:** the `EMAIL` outbox job payload format — `outbox_jobs.kind` stays `EMAIL`; the new `PORTAL_CREDENTIALS` sub-type lives in the job payload like the existing `CONFIRMATION_REQUEST`/`HOLDING_LETTER` types.

## 3. `0047_manual_dispatch_records.sql` — E04-S02

```sql
CREATE TABLE IF NOT EXISTS manual_dispatch_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('PROPOSAL')),
  channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP','HAND_DELIVERY')),
  proposal_version_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  file_version_id TEXT NOT NULL,           -- the exact PDF that was sent
  evidence_file_version_id TEXT,           -- optional screenshot/acknowledgement
  sent_at TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 2000),
  recorded_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, client_id, engagement_id) REFERENCES engagements(workspace_id, client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, file_version_id) REFERENCES file_versions(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, evidence_file_version_id) REFERENCES file_versions(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, recorded_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, proposal_version_id) REFERENCES proposal_versions(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE TRIGGER IF NOT EXISTS manual_dispatch_records_no_update BEFORE UPDATE ON manual_dispatch_records
  BEGIN SELECT RAISE(ABORT, 'manual_dispatch_records are append-only'); END;
CREATE TRIGGER IF NOT EXISTS manual_dispatch_records_no_delete BEFORE DELETE ON manual_dispatch_records
  BEGIN SELECT RAISE(ABORT, 'manual_dispatch_records are append-only'); END;
```


## 4. `0048_public_lead_submissions.sql` — E04-S03

```sql
CREATE TABLE IF NOT EXISTS public_lead_submissions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED','ACCEPTED_AS_LEAD','REJECTED_SPAM','DUPLICATE')),
  company_name TEXT NOT NULL CHECK (length(trim(company_name)) BETWEEN 1 AND 200),
  contact_name TEXT NOT NULL CHECK (length(trim(contact_name)) BETWEEN 1 AND 200),
  email_normalized TEXT NOT NULL CHECK (length(email_normalized) BETWEEN 3 AND 320),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 40),
  service_interest TEXT CHECK (service_interest IS NULL OR service_interest IN ('STATUTORY_AUDIT','INTERNAL_AUDIT','AGREED_UPON_PROCEDURES','OTHER')),
  message TEXT CHECK (message IS NULL OR length(message) <= 4000),
  turnstile_verified INTEGER NOT NULL CHECK (turnstile_verified IN (0,1)),
  ip_sha256 TEXT NOT NULL,
  lead_id TEXT,
  triaged_by_actor_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, lead_id) REFERENCES leads(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, triaged_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS public_lead_submissions_status_idx ON public_lead_submissions(workspace_id, status, created_at);
```

## 5. `0049_client_import_runs.sql` — E05-S06 (after SP-03)

```sql
CREATE TABLE IF NOT EXISTS client_import_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_file_version_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
  status TEXT NOT NULL CHECK (status IN ('VALIDATED','APPLIED','REJECTED')),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  error_count INTEGER NOT NULL CHECK (error_count >= 0),
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT,
  FOREIGN KEY (workspace_id, source_file_version_id) REFERENCES file_versions(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, created_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, source_sha256)
);
CREATE TABLE IF NOT EXISTS client_import_row_map (
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK (source_row >= 1),
  external_ref TEXT NOT NULL CHECK (length(external_ref) BETWEEN 1 AND 200),
  client_id TEXT,
  contact_id TEXT,
  PRIMARY KEY (workspace_id, run_id, source_row),
  FOREIGN KEY (workspace_id, run_id) REFERENCES client_import_runs(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts(workspace_id, id) ON DELETE RESTRICT
);
```

## 6. `0050_drop_legacy_snapshot_tables.sql` — E01-S05 (CONDITIONAL on decision D2)

Only after: (a) the operator query in E01-S05 shows zero rows in `workspaces WHERE data_mode='TEST' AND status<>'deleted'` in **every** environment, and (b) no code references the tables (`rg -n "workspace_entities|workspace_root_documents|workspace_sessions|workspace_seeds|demo_workspaces|demo_seeds|demo_creation_limits|test_workspace_expiry"` returns only this migration).

```sql
DROP TABLE IF EXISTS workspace_entities;
DROP TABLE IF EXISTS workspace_root_documents;
DROP TABLE IF EXISTS workspace_sessions;
DROP TABLE IF EXISTS workspace_seeds;
DROP TABLE IF EXISTS test_workspace_expiry;
DROP TABLE IF EXISTS demo_workspaces;
DROP TABLE IF EXISTS demo_creation_limits;
-- DO NOT DROP demo_seeds: workspaces.seed_id REFERENCES demo_seeds(id) (0003_cloud_full_stack.sql:12).
--   Rebuilding `workspaces` is unsafe (every business table FKs to it). Leave demo_seeds empty and
--   add: CREATE TRIGGER demo_seeds_no_insert BEFORE INSERT ON demo_seeds BEGIN SELECT RAISE(ABORT,'retired'); END;
-- DO NOT DROP idempotency_keys / file_objects until `rg` proves no remaining code path (scheduled() purges idempotency_keys).
-- Agent MUST grep every remaining migration for FKs/triggers referencing a dropped table before finalising this list.
```

> `migration_runs`, `migration_id_map` and the guard triggers from 0039–0041 belong to the US-SYS-002 cutover tooling; drop them only if E01-S05 also retires that tooling.

## 7. No schema change required

E05-S01 (milestone defaults), E05-S02 (workprogram gates), E05-S03 (going-concern UI), E05-S04 (client document centre) are code-only unless the verify step proves otherwise.
