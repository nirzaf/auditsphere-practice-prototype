-- The product has no login surface or authentication routes. Remove the
-- dormant E03 identity tables after verifying that no account or auth data
-- was written. The preflight runs before any table is dropped and prevents
-- this migration from deleting records if that assumption ever changes.
CREATE TRIGGER migration_0054_empty_auth_tables_gate
BEFORE UPDATE OF version ON application_schema_version
WHEN EXISTS (SELECT 1 FROM portal_credential_issues)
  OR EXISTS (SELECT 1 FROM auth_sessions)
  OR EXISTS (SELECT 1 FROM credential_tokens)
  OR EXISTS (SELECT 1 FROM user_profile_grants)
  OR EXISTS (SELECT 1 FROM auth_events)
  OR EXISTS (SELECT 1 FROM user_accounts)
BEGIN
  SELECT RAISE(ABORT, 'US-SYS-001 blocked: legacy authentication records remain');
END;

UPDATE application_schema_version SET version=version WHERE singleton=1;
DROP TRIGGER migration_0054_empty_auth_tables_gate;

-- Drop dependents before the identities they reference.
DROP TABLE portal_credential_issues;
DROP TABLE auth_sessions;
DROP TABLE credential_tokens;
DROP TABLE user_profile_grants;
DROP TABLE auth_events;
DROP TABLE user_accounts;

UPDATE application_schema_version
SET version=54, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton=1;
