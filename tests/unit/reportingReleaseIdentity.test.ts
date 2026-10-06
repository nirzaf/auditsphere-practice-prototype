// US-GAP-16 (P0) regression: representation-return identity at final release.
//
// At the reviewed commit the release validation (a) compared a signed file's
// byte hash with the separate representation metadata hash (two different data
// identities, so the condition was always true) and (b) resolved the signed
// return by binding the signed *file* id to the return *primary key* `id`, so
// the lookup never returned the row. These tests pin the corrected identity.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const releaseSource = readFileSync(join(repositoryRoot, 'worker', 'businessReporting.ts'), 'utf8');

function releaseReturnLookupSql(): string {
  const after = releaseSource.split('const signedReturn=await env.DB.prepare(`', 2)[1];
  assert.ok(after, 'the release signed-return lookup was found');
  return after.split('`', 2)[0];
}

describe('release representation identity (US-GAP-16)', () => {
  it('never compares the signed file byte hash with the representation metadata hash', () => {
    assert.doesNotMatch(releaseSource, /candidate\.return_sha256!==candidate\.return_hash/,
      'byte-hash and metadata-hash domains are distinct and must not be compared');
  });

  it('resolves the signed return by its return id rather than the signed file id', () => {
    const sql = releaseReturnLookupSql();
    assert.match(sql, /FROM representation_returns/);
    assert.match(sql, /id=\?/);
    assert.match(releaseSource, /\.bind\(workspaceId,candidate\.current_return_id,candidate\.representation_request_id\)/,
      'the lookup must bind the current return id');

    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE representation_returns(id TEXT PRIMARY KEY, workspace_id TEXT, request_id TEXT, signed_file_id TEXT, file_sha256 TEXT, source_hash TEXT)');
      db.prepare('INSERT INTO representation_returns(id,workspace_id,request_id,signed_file_id,file_sha256,source_hash) VALUES(?,?,?,?,?,?)')
        .run('RETURN-1', 'WS-1', 'REQUEST-1', 'FILE-1', 'a'.repeat(64), 'b'.repeat(64));
      const statement = db.prepare(sql);
      assert.ok(statement.get('WS-1', 'RETURN-1', 'REQUEST-1'), 'binding the return id resolves the signed return');
      assert.equal(statement.get('WS-1', 'FILE-1', 'REQUEST-1'), undefined,
        'binding the signed file id to the primary key must not resolve a return');
    } finally {
      db.close();
    }
  });
});
