# Data Model Delta (remaining work only)

> **Historical proposal notice:** this delta includes auth/account tables for a superseded E03 design. Migrations 0046–0048 are preserved as applied-history compatibility; they do not mean the current no-auth epic requires account/session runtime behavior. Do not edit applied migration history or drop remote tables without a separately verified data-retirement plan.

**Executable source of truth:** `worker/migrations/*.sql` (52 files, last = `0052_policy_activations.sql`). This document specifies the **remaining** migrations the backlog requires. Agents copy the SQL into a new numbered migration file, adjust only what the story's acceptance criteria demand, and record any deviation in the story's report.

## Migration rules (existing conventions — follow exactly)

1. Forward-only, numbered `NNNN_snake_case.sql`, next free number is **0053**. Never edit an applied migration. E01-S05 used 0045, E03-S01 added auth tables in 0046, E03-S04 added portal credential issues in 0047, E03-S06 added the single-use first-Partner lock in 0048, E04-S01 added email delivery events in 0049, E04-S02 added manual dispatch records in 0050, E04-S03 added public lead submissions and their short-lived rate-limit events in 0051, and the approved PolicyActivation ledger is in 0052. Also bump `APPLICATION_SCHEMA_VERSION` in `worker/versions.ts` (currently `52`), which readiness compares against the DB (`handleHealthReady` → `SCHEMA_VERSION_MISMATCH`).
2. Every business table has `id TEXT PRIMARY KEY`, `workspace_id TEXT NOT NULL`, `UNIQUE (workspace_id, id)`, composite FKs `(workspace_id, x_id)` → `parent(workspace_id, id)`, `ON DELETE RESTRICT`.
3. Mutable rows carry `version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)`; updates use `WHERE version = ?` and `version = version + 1`.
4. Append-only tables get `BEFORE UPDATE` and `BEFORE DELETE` triggers that `RAISE(ABORT, '…')` (pattern: `worker/migrations/0006_business_foundation.sql` lines 301–304).
5. To change a CHECK constraint SQLite needs a table rebuild (`*_next` → copy → drop → rename; pattern: `0019_external_confirmations.sql` lines 8–34). Prefer a new table over rebuilding a hot table.
6. Bump `application_schema_version` in the same migration (pattern: `0027_application_schema_version.sql`, `0035_application_schema_version_sync.sql`), and update the expected version in `tests/unit/workerMigrations.test.ts`.
7. Timestamps `TEXT` ISO-8601 UTC; dates `TEXT` `YYYY-MM-DD` validated with `CHECK (date(x) IS NOT NULL AND date(x) = x)`.
8. Secrets are never stored in clear: tokens and passwords are stored only as hashes.

---

## 1. `0046_auth_accounts_sessions.sql` — E03-S01

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
```

**Invariants enforced in code (not expressible in SQL):** a grant's actor profile must match the account kind (STAFF account ↔ profile with `staff_member_id` equal to the account's; CLIENT account ↔ profile with `contact_id` equal to the account's); `active_actor_profile_id` must have an active grant for the session's user.

## 2. `0047_portal_credential_provisioning.sql` — E03-S04

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

> Verified by the isolated migration and BUSINESS workspace suites: all §2 foreign keys resolve against the schema through migration 0047. `outbox_jobs.kind` stays `EMAIL`; `PORTAL_CREDENTIALS` is a subtype in the job payload alongside `CONFIRMATION_REQUEST` and `HOLDING_LETTER`.

## 3. `0048_first_partner_bootstrap_lock.sql` — E03-S06

Creates `business_bootstrap_lock`, a single append-only row that the protected first-Partner bootstrap endpoint inserts in the same D1 batch as the first workspace. The singleton key rejects concurrent first-run requests with distinct idempotency keys; the route also refuses to start if any BUSINESS workspace pre-exists.

## 4. `0050_manual_dispatch_records.sql` — E04-S02

```sql
CREATE UNIQUE INDEX IF NOT EXISTS contacts_workspace_client_contact_idx
  ON contacts(workspace_id, client_id, id);
CREATE TABLE IF NOT EXISTS manual_dispatch_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('PROPOSAL')),
  channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP','HAND_DELIVERY')),
  proposal_version_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  contact_name_snapshot TEXT NOT NULL,
  recipient_phone_snapshot TEXT,
  file_version_id TEXT NOT NULL,           -- the exact PDF that was sent
  evidence_file_version_id TEXT,           -- optional screenshot/acknowledgement
  sent_at TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 2000),
  recorded_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, client_id, engagement_id) REFERENCES engagements(workspace_id, client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, client_id, contact_id) REFERENCES contacts(workspace_id, client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, file_version_id) REFERENCES file_versions(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, evidence_file_version_id) REFERENCES file_versions(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, recorded_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, proposal_version_id) REFERENCES proposal_versions(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE TRIGGER IF NOT EXISTS manual_dispatch_records_no_update BEFORE UPDATE ON manual_dispatch_records
  BEGIN SELECT RAISE(ABORT, 'manual dispatch records are append-only'); END;
CREATE TRIGGER IF NOT EXISTS manual_dispatch_records_no_delete BEFORE DELETE ON manual_dispatch_records
  BEGIN SELECT RAISE(ABORT, 'manual dispatch records are append-only'); END;
```


## 5. `0051_public_lead_submissions.sql` — E04-S03

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

-- E06-S02: short-lived HMAC-SHA256 IP hashes enforce the exact rolling-hour limit.
CREATE TABLE IF NOT EXISTS public_lead_rate_limit_events (
  id TEXT PRIMARY KEY,
  ip_sha256 TEXT NOT NULL CHECK (length(ip_sha256)=64),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS public_lead_rate_limit_events_window_idx
  ON public_lead_rate_limit_events(ip_sha256,created_at);
```

## 6. `0052_policy_activations.sql` — shared approved policy lifecycle

The migration adds the append-only `policy_activations` event ledger for workprogram templates, sampling policies, and charge-out rates. Every event names exactly one typed policy FK, an `ACTIVATE` or `RETIRE` action, an effective date, a Partner rationale, and the approving actor/time. `policy_activation_intervals` derives non-overlapping effective intervals by the policy's semantic scope (FSLI + standards profile, sampling method, or staff grade). Existing approved rows are backfilled using their stored approval date and actor; the backfill explicitly records that their original activation rationale was not retained. Approved template and sampling-policy rows become immutable; create a new row for changes.

## 7. `0053_client_import_runs.sql` — E05-S06 (after SP-03)

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

## 8. `0045_drop_legacy_snapshot_tables.sql` — E01-S05 (CONDITIONAL on decision D2)

The owner directed retirement of the legacy tables. The remote per-environment row count is still unverified because the configured Wrangler session has expired. Do not claim that no TEST records remain; before any manual migration outside the already-authorized deployment path, run the E01-S05 query against every environment. Runtime code, tests, and tooling must not reference the dropped tables; historical migrations are retained and the forward migration removes their dependent trigger objects.

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
--   add: CREATE TRIGGER demo_seeds_no_insert BEFORE INSERT ON demo_seeds BEGIN SELECT RAISE(ABORT,'legacy demo seeds are retired'); END;
-- DO NOT DROP idempotency_keys / file_objects until `rg` proves no remaining code path (scheduled() purges idempotency_keys).
-- Agent MUST grep every remaining migration for FKs/triggers referencing a dropped table before finalising this list.
```

> `migration_runs` and `migration_id_map` are retained to avoid an unrequested second data deletion. The US-SYS-002 tooling is retired, so migration 0045 removes its 0039–0041 guard triggers that depend on the legacy snapshot tables.

## 9. No schema change required

E05-S01 (milestone defaults), E05-S02 (workprogram gates), E05-S03 (going-concern UI), E05-S04 (client document centre) are code-only unless the verify step proves otherwise.
