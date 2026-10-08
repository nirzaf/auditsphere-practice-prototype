import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { it } from 'node:test';
import { unstable_splitSqlQuery } from 'wrangler';

it('applies each migration using Wrangler statement splitting to an isolated SQLite database', () => {
  const directory = resolve(process.cwd(), 'worker', 'migrations');
  const migrations = readdirSync(directory).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
  assert.ok(migrations.length > 0, 'the canonical migration directory contains versioned SQL migrations');

  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys=ON');
    for (const migration of migrations) {
      const source = readFileSync(join(directory, migration), 'utf8');
      const statements = unstable_splitSqlQuery(source);
      assert.ok(statements.length > 0, `${migration} contains SQL statements`);
      if (/^0039_|^0040_|^0041_|^0042_|^0043_|^0044_|^0045_/.test(migration)) {
        for (const trigger of statements.filter(statement => /^CREATE TRIGGER/i.test(statement.trimStart()))) {
          const guardedLines = trigger.split(/\r?\n/).filter(line => line.includes('THEN RAISE(ABORT,'));
          assert.ok(guardedLines.every(line => line.trimEnd().endsWith('END);')),
            `${migration} parenthesizes trigger CASE expressions so Cloudflare D1 does not split at CASE END`);
        }
      }
      if (migration === '0045_drop_legacy_snapshot_tables.sql') {
        database.prepare(`INSERT INTO workspaces(id,seed_id,name,schema_version,revision,status,created_at,updated_at,data_mode)
          VALUES ('active-test-workspace',NULL,'Legacy TEST fixture',10,1,'active',1,1,'TEST')`).run();
        assert.throws(() => {
          for (const statement of statements) database.prepare(statement).run();
        }, /E01-S05 blocked: active TEST workspaces remain/,
        'the migration refuses to drop legacy tables while an active TEST workspace remains');
        assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workspace_entities'").get(),
          'a rejected preflight leaves legacy tables intact');
        assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='demo_workspaces'").get(),
          'a rejected preflight leaves demo workspaces intact');
        database.prepare("UPDATE workspaces SET status='deleted' WHERE id='active-test-workspace'").run();
      }

      for (let index = 0; index < statements.length; index += 1) {
        try {
          database.prepare(statements[index]).run();
        } catch (error) {
          throw new Error(`${migration} statement ${index + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [], 'the migrated schema has no foreign-key violations');
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='report_signatures'").get(),
      'the latest reporting migrations are present');
    assert.equal(database.prepare('SELECT version FROM application_schema_version WHERE singleton=1').get()?.version, 46);
    for (const table of [
      'workspace_entities', 'workspace_root_documents', 'workspace_sessions', 'workspace_seeds',
      'test_workspace_expiry', 'demo_workspaces', 'demo_creation_limits'
    ]) {
      assert.equal(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table), undefined,
        `${table} is removed from the latest schema`);
    }
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='demo_seeds'").get(),
      'demo seeds remain because workspaces retains its nullable seed foreign key');
    assert.throws(() => database.prepare(`INSERT INTO demo_seeds(id,title,description,state_json)
      VALUES ('retired-seed','Retired','', '{}')`).run(), /legacy demo seeds are retired/);
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='archive_download_tickets'").get(),
      'short-lived archive download tickets are present');
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='archive_download_ticket_uses'").get(),
      'archive download ticket consumption is recorded');
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='verification_runs'").get(),
      'verification runs have a dedicated relational table');
    for (const table of ['user_accounts', 'user_profile_grants', 'auth_sessions', 'credential_tokens', 'auth_events']) {
      assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table), `${table} exists`);
    }
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='auth_events_no_update'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='auth_events_no_delete'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='credential_tokens_consume_once'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='user_profile_grants_revoke_only'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='mapping_name_suggestion_insert_guard'").get(),
      'name similarity draft suggestions require a complete candidate and score');
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='mapping_name_suggestion_update_guard'").get(),
      'mapping edits cannot leave incomplete name similarity provenance');

    const now = '2026-10-07T12:00:00.000Z';
    database.prepare(`INSERT INTO workspaces(id,seed_id,name,schema_version,revision,status,created_at,updated_at)
      VALUES ('verification-workspace',NULL,'Verification fixture',10,1,'active',1,1)`).run();
    database.prepare(`INSERT INTO verification_runs(id,workspace_id,source_commit,schema_version,environment,started_at,
      completed_at,status,created_at,updated_at)
      VALUES ('verification-run','verification-workspace',?,37,'CI',?,NULL,'NOT_RUN',?,?)`)
      .run('a'.repeat(40), now, now, now);
    database.prepare(`UPDATE verification_runs SET version=2,status='PASSED',completed_at=?,updated_at=?
      WHERE workspace_id='verification-workspace' AND id='verification-run'`).run('2026-10-07T12:01:00.000Z', '2026-10-07T12:01:00.000Z');
    assert.equal(database.prepare("SELECT status FROM verification_runs WHERE id='verification-run'").get()?.status, 'PASSED');
    assert.throws(() => database.prepare(`UPDATE verification_runs SET version=3,status='FAILED',completed_at=?,updated_at=?
      WHERE workspace_id='verification-workspace' AND id='verification-run'`).run('2026-10-07T12:02:00.000Z', '2026-10-07T12:02:00.000Z'),
    /verification run metadata is immutable/);
    assert.throws(() => database.prepare("DELETE FROM verification_runs WHERE id='verification-run'").run(),
      /verification runs cannot be deleted/);
    assert.throws(() => database.prepare(`INSERT INTO verification_runs(id,workspace_id,source_commit,schema_version,environment,
      started_at,completed_at,status,created_at,updated_at)
      VALUES ('invalid-run','verification-workspace',?,37,'CI',?,NULL,'SKIPPED',?,?)`)
      .run('b'.repeat(40), now, now, now), /CHECK constraint failed/);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [], 'verification rows preserve their workspace scope');
    database.prepare(`INSERT INTO auth_events(id,workspace_id,event,detail_json,created_at)
      VALUES ('auth-event-test','verification-workspace','LOGIN_FAILED','{}',?)`).run(now);
    assert.throws(() => database.prepare("UPDATE auth_events SET detail_json='{}' WHERE id='auth-event-test'").run(), /auth_events are append-only/);
    assert.throws(() => database.prepare("DELETE FROM auth_events WHERE id='auth-event-test'").run(), /auth_events are append-only/);
    database.prepare(`INSERT INTO staff_members(id,workspace_id,natural_person_key,display_name,grade,created_at,updated_at)
      VALUES('auth-staff','verification-workspace','auth-staff-key','Auth Staff','PARTNER',?,?)`).run(now, now);
    database.prepare(`INSERT INTO actor_profiles(id,workspace_id,persona,staff_member_id,created_at,updated_at)
      VALUES('auth-profile','verification-workspace','APPROVER','auth-staff',?,?)`).run(now, now);
    database.prepare(`INSERT INTO user_accounts(id,workspace_id,kind,email_normalized,display_name,staff_member_id,status,external_issuer,external_subject,created_at,updated_at)
      VALUES('auth-user','verification-workspace','STAFF','auth-staff@example.test','Auth Staff','auth-staff','ACTIVE','https://issuer.example.test','subject-1',?,?)`).run(now, now);
    database.prepare(`INSERT INTO user_profile_grants(id,workspace_id,user_account_id,actor_profile_id,granted_at)
      VALUES('auth-grant','verification-workspace','auth-user','auth-profile',?)`).run(now);
    database.prepare(`UPDATE user_profile_grants SET revoked_at=?,revoked_by_actor_id=NULL WHERE id='auth-grant'`).run(now);
    assert.throws(() => database.prepare(`UPDATE user_profile_grants SET revoked_at=?,revoked_by_actor_id=NULL WHERE id='auth-grant'`).run(now), /user_profile_grants may only be revoked once/);
    assert.throws(() => database.prepare("DELETE FROM user_profile_grants WHERE id='auth-grant'").run(), /user_profile_grants are append-only/);
    database.prepare(`INSERT INTO credential_tokens(id,workspace_id,user_account_id,purpose,token_sha256,expires_at,created_at)
      VALUES('auth-credential','verification-workspace','auth-user','STAFF_INVITE',?, ?,?)`).run('b'.repeat(64), '2026-10-09T12:00:00.000Z', now);
    database.prepare("UPDATE credential_tokens SET consumed_at=? WHERE id='auth-credential'").run(now);
    assert.throws(() => database.prepare("UPDATE credential_tokens SET consumed_at=? WHERE id='auth-credential'").run('2026-10-08T12:01:00.000Z'), /credential_tokens are single-use/);
    assert.throws(() => database.prepare("DELETE FROM credential_tokens WHERE id='auth-credential'").run(), /credential_tokens are retained for audit/);
    const invalidAccounts = [
      `INSERT INTO user_accounts(id,workspace_id,kind,email_normalized,display_name,staff_member_id,status,password_hash,created_at,updated_at)
       VALUES('bad-staff','verification-workspace','STAFF','staff@example.test','Staff','staff','ACTIVE','hash',?,?)`,
      `INSERT INTO user_accounts(id,workspace_id,kind,email_normalized,display_name,contact_id,status,external_subject,created_at,updated_at)
       VALUES('bad-client-sub','verification-workspace','CLIENT','client@example.test','Client','contact','ACTIVE','subject',?,?)`,
      `INSERT INTO user_accounts(id,workspace_id,kind,email_normalized,display_name,contact_id,status,is_firm_admin,created_at,updated_at)
       VALUES('bad-client-admin','verification-workspace','CLIENT','admin@example.test','Client','contact','ACTIVE',1,?,?)`,
      `INSERT INTO user_accounts(id,workspace_id,kind,email_normalized,display_name,staff_member_id,status,created_at,updated_at)
       VALUES('bad-email','verification-workspace','STAFF',' Staff@Example.test ','Staff','staff','ACTIVE',?,?)`
    ];
    for (const sql of invalidAccounts) assert.throws(() => database.prepare(sql).run(now, now), /CHECK constraint failed/);
  } finally {
    database.close();
  }
});
