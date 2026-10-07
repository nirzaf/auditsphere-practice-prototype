// US-GAP-16 (P0) regression: the five-part bundle candidate job must prepare
// against the real D1 schema.
//
// At the reviewed commit the bundle candidate query selected
// `rr.template_file_id` while `representation_requests` is joined with the alias
// `rep`, so D1 rejected the whole job with
// "no such column: rr.template_file_id" and every five-part release failed at
// preparation. These tests extract the exact query text from the Worker source,
// run it against every repository migration, and fail if the alias regresses.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Extracts the first statement of the `bundleCandidate` job handler verbatim. */
function bundleCandidateSql(): string {
  const source = readFileSync(join(repositoryRoot, 'worker', 'businessReportingJobs.ts'), 'utf8');
  const body = source.split('async function bundleCandidate(', 2)[1];
  assert.ok(body, 'the bundleCandidate job handler was found in the Worker source');
  const afterPrepare = body.split('env.DB.prepare(`', 2)[1];
  assert.ok(afterPrepare, 'the bundle candidate query was found');
  const query = afterPrepare.split('`', 2)[0];
  assert.ok(query.includes('FROM bundle_candidates'), 'the extracted text is the bundle candidate query');
  return query;
}

function bundleDispatchSql(): string {
  const source = readFileSync(join(repositoryRoot, 'worker', 'businessReportingQuery.ts'), 'utf8');
  const marker = 'SELECT d.id,d.version,d.status,d.provider_message_id AS providerMessageId';
  const selectStart = source.indexOf(marker);
  assert.notEqual(selectStart, -1, 'the bundle dispatch query was found');
  const queryStart = source.lastIndexOf('env.DB.prepare(`', selectStart) + 'env.DB.prepare(`'.length;
  const queryEnd = source.indexOf('`)', queryStart);
  assert.ok(queryEnd > queryStart, 'the bundle dispatch query ended normally');
  return source.slice(queryStart, queryEnd);
}

describe('US-GAP-16 five-part bundle candidate SQL', () => {
  it('reads the representation template through the joined request alias', () => {
    const query = bundleCandidateSql();
    assert.match(query, /\brep\.template_file_id\b/, 'the template file must be read from the representation_requests alias');
    assert.doesNotMatch(query, /\brr\.template_file_id\b/, 'no statement may reference the undefined rr alias');
  });

  it('prepares and executes against the full migration history without an unknown alias', () => {
    const migrations = readdirSync(join(repositoryRoot, 'worker', 'migrations')).filter(name => name.endsWith('.sql'));
    assert.ok(migrations.length >= 28, `expected the full migration history, found ${migrations.length}`);

    const db = new SqliteD1(':memory:');
    try {
      db.migrate(repositoryRoot);
      const statement = db.prepare(bundleCandidateSql()); // must not throw "no such column: rr.template_file_id"
      const row = statement.bind('diagnostic-workspace', 'diagnostic-candidate').first<Record<string, unknown>>();
      assert.equal(row, null, 'an empty workspace returns no candidate instead of failing');
    } finally {
      db.close();
    }
  });

  it('keeps bootstrap actor and staff invariants in single-condition triggers', () => {
    const migration = readFileSync(join(repositoryRoot, 'worker', 'migrations', '0008_business_workspace_bootstrap.sql'), 'utf8');
    assert.doesNotMatch(migration, /\bSELECT\s+\(?CASE\b/i,
      'each trigger has one condition and one explicit RAISE action');
    for (const trigger of [
      'actor_profiles_active_staff_insert', 'actor_profiles_active_client_insert',
      'actor_profiles_approver_grade_insert', 'actor_profiles_reviewer_grade_insert',
      'actor_profiles_approver_grade_update', 'actor_profiles_reviewer_grade_update',
      'actor_profiles_active_staff_update', 'actor_profiles_active_client_update',
      'staff_active_approver_grade_update', 'staff_active_reviewer_grade_update',
      'staff_deactivate_profiles_guard'
    ]) assert.match(migration, new RegExp(`CREATE TRIGGER IF NOT EXISTS ${trigger}\\b`), `${trigger} remains a separate guard`);
    assert.equal((migration.match(/^WHEN\s+/gm) ?? []).length, 11, 'every explicit guard has exactly one trigger condition');
  });

  it('associates each bundle email dispatch with its own released report part', () => {
    const query = bundleDispatchSql();
    assert.match(query, /b\.id AS bundleId/);
    assert.match(query, /p\.primary_file_id=d\.file_version_id/);
    const db = new SqliteD1(':memory:');
    try {
      db.migrate(repositoryRoot);
      const result = db.prepare(query).bind('diagnostic-workspace', 'diagnostic-engagement').all<Record<string, unknown>>();
      assert.deepEqual(result.results, [], 'an engagement without bundle email history returns no rows');
    } finally {
      db.close();
    }
  });
});
