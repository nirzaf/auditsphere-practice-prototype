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
      if (/^0039_|^0040_|^0041_|^0042_|^0043_|^0044_/.test(migration)) {
        for (const trigger of statements.filter(statement => /^CREATE TRIGGER/i.test(statement.trimStart()))) {
          const guardedLines = trigger.split(/\r?\n/).filter(line => line.includes('THEN RAISE(ABORT,'));
          assert.ok(guardedLines.every(line => line.trimEnd().endsWith('END);')),
            `${migration} parenthesizes trigger CASE expressions so Cloudflare D1 does not split at CASE END`);
        }
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
    assert.equal(database.prepare('SELECT version FROM application_schema_version WHERE singleton=1').get()?.version, 44);
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='archive_download_tickets'").get(),
      'short-lived archive download tickets are present');
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='archive_download_ticket_uses'").get(),
      'archive download ticket consumption is recorded');
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='verification_runs'").get(),
      'verification runs have a dedicated relational table');
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
  } finally {
    database.close();
  }
});
