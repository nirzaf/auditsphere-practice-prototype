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
  } finally {
    database.close();
  }
});
