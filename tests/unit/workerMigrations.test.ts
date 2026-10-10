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

      if (migration === '0054_retire_dormant_auth_schema.sql') {
        const createGate = statements.find(statement => statement.includes('migration_0054_empty_auth_tables_gate'));
        const probeGate = statements.find(statement => /UPDATE application_schema_version SET version=version/.test(statement));
        assert.ok(createGate, 'auth retirement includes a zero-row preflight trigger');
        assert.ok(probeGate, 'auth retirement probes the zero-row preflight before dropping tables');

        database.exec('SAVEPOINT auth_retirement_preflight');
        database.prepare(`INSERT INTO auth_events(id,workspace_id,event,detail_json,created_at)
          VALUES ('auth-retirement-guard-test','active-test-workspace','LOGIN_FAILED','{}','2026-10-07T12:00:00.000Z')`).run();
        database.prepare(createGate).run();
        assert.throws(() => database.prepare(probeGate).run(), /US-SYS-001 blocked: legacy authentication records remain/,
          'the migration refuses to remove auth tables while any legacy auth record remains');
        assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='auth_events'").get(),
          'a rejected auth retirement preflight leaves its tables intact');
        database.exec('ROLLBACK TO auth_retirement_preflight; RELEASE auth_retirement_preflight');
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
    assert.equal(database.prepare('SELECT version FROM application_schema_version WHERE singleton=1').get()?.version, 57);
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='business_bootstrap_lock'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='business_bootstrap_lock_no_update'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='business_bootstrap_lock_no_delete'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dispatch_delivery_events'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='dispatch_delivery_events_no_update'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='dispatch_delivery_events_no_delete'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='manual_dispatch_records'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='manual_dispatch_records_no_update'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='manual_dispatch_records_no_delete'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='public_lead_submissions'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='public_lead_rate_limit_events'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='policy_activations'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='view' AND name='policy_activation_intervals'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='policy_activations_no_update'").get());
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='policy_activations_no_delete'").get());
    assert.ok(database.prepare("SELECT 1 FROM pragma_table_info('audit_events') WHERE name='chain_timestamp'").get());
    database.exec('PRAGMA foreign_keys=OFF; SAVEPOINT manual_dispatch_records_append_only');
    database.prepare(`INSERT INTO manual_dispatch_records(id,workspace_id,client_id,engagement_id,purpose,channel,proposal_version_id,
      contact_id,contact_name_snapshot,recipient_phone_snapshot,file_version_id,evidence_file_version_id,sent_at,note,recorded_by_actor_id,created_at)
      VALUES('manual-dispatch-test','verification-workspace','client','engagement','PROPOSAL','WHATSAPP','proposal','contact',
        'Synthetic contact',NULL,'proposal-file',NULL,'2026-10-09T12:00:00.000Z',NULL,'actor','2026-10-09T12:00:00.000Z')`).run();
    assert.throws(() => database.prepare("UPDATE manual_dispatch_records SET note='edited' WHERE id='manual-dispatch-test'").run(),
      /manual dispatch records are append-only/);
    assert.throws(() => database.prepare("DELETE FROM manual_dispatch_records WHERE id='manual-dispatch-test'").run(),
      /manual dispatch records are append-only/);
    database.exec('ROLLBACK TO manual_dispatch_records_append_only; RELEASE manual_dispatch_records_append_only; PRAGMA foreign_keys=ON');
    database.exec('PRAGMA foreign_keys=OFF; SAVEPOINT email_delivery_events_append_only');
    database.prepare(`INSERT INTO dispatch_delivery_events(workspace_id,provider_event_id,dispatch_id,status,occurred_at,received_at)
      VALUES('email-test-workspace','provider-event-test','dispatch-test','DELIVERED','2026-10-09T12:00:00.000Z','2026-10-09T12:00:00.000Z')`).run();
    assert.throws(() => database.prepare("UPDATE dispatch_delivery_events SET status='BOUNCED' WHERE provider_event_id='provider-event-test'").run(),
      /dispatch delivery events are append-only/);
    assert.throws(() => database.prepare("DELETE FROM dispatch_delivery_events WHERE provider_event_id='provider-event-test'").run(),
      /dispatch delivery events are append-only/);
    database.exec('ROLLBACK TO email_delivery_events_append_only; RELEASE email_delivery_events_append_only; PRAGMA foreign_keys=ON');
    database.exec('PRAGMA foreign_keys=OFF; SAVEPOINT policy_activations_append_only');
    database.prepare(`INSERT INTO policy_activations(id,workspace_id,policy_kind,workprogram_template_id,sampling_policy_id,charge_out_rate_id,
      action,effective_from,reason,approved_by_actor_id,approved_at)
      VALUES('policy-event-test','verification-workspace','SAMPLING_POLICY',NULL,'sampling-policy',NULL,'ACTIVATE','2026-10-09',
        'Synthetic activation rationale for immutable ledger verification.','actor','2026-10-09T12:00:00.000Z')`).run();
    assert.throws(() => database.prepare("UPDATE policy_activations SET reason='Changed rationale' WHERE id='policy-event-test'").run(),
      /policy activation history is append only/);
    assert.throws(() => database.prepare("DELETE FROM policy_activations WHERE id='policy-event-test'").run(),
      /policy activation history is append only/);
    database.exec('ROLLBACK TO policy_activations_append_only; RELEASE policy_activations_append_only; PRAGMA foreign_keys=ON');
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
    const now = '2026-10-07T12:00:00.000Z';
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='mapping_name_suggestion_insert_guard'").get(),
      'name similarity draft suggestions require a complete candidate and score');
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='mapping_name_suggestion_update_guard'").get(),
      'mapping edits cannot leave incomplete name similarity provenance');

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
    for (const table of ['user_accounts', 'user_profile_grants', 'auth_sessions', 'credential_tokens', 'auth_events', 'portal_credential_issues']) {
      assert.equal(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table), undefined,
        `${table} is absent from the no-auth product schema`);
    }
  } finally {
    database.close();
  }
});
