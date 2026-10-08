import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const workspaceId = 'verification-sandbox-workspace';
const token = 'sandbox-ingest-test-token-' + 'x'.repeat(40);
const dbSql = `INSERT INTO workspaces(id,seed_id,name,schema_version,revision,status,created_at,updated_at,data_mode)
  VALUES (?,NULL,'Verification Sandbox',10,1,'active',1,1,'BUSINESS')`;
await db.prepare(dbSql).bind(workspaceId).run();

const baseEnv = {
  DB: db,
  FILES: {} as any,
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as any,
  ENVIRONMENT: 'staging',
  VERIFICATION_INGEST_ENABLED: 'true',
  VERIFICATION_INGEST_TOKEN: token,
  VERIFICATION_INGEST_WORKSPACE_ID: workspaceId
} as any;

after(() => db.close());

async function request(payload: unknown, options: {
  env?: Record<string, unknown>;
  authorization?: string;
  contentType?: string;
} = {}): Promise<{ response: Response; body: any }> {
  const headers = new Headers();
  if (options.authorization !== undefined) headers.set('Authorization', options.authorization);
  if (options.contentType !== undefined) headers.set('Content-Type', options.contentType);
  else headers.set('Content-Type', 'application/json');
  const response = await worker.fetch(new Request('https://sandbox.auditsphere.test/api/internal/verification-runs', {
    method: 'POST', headers, body: JSON.stringify(payload)
  }), { ...baseEnv, ...options.env } as any, {} as any);
  return { response, body: await response.json() };
}

const validRun = (overrides: Record<string, unknown> = {}) => ({
  runId: 'GHA-731008-1',
  sourceCommit: 'a'.repeat(40),
  schemaVersion: 46,
  environment: 'CI',
  startedAt: '2026-10-07T12:00:00.000Z',
  completedAt: '2026-10-07T12:02:00.000Z',
  status: 'PASSED',
  ...overrides
});

it('keeps verification ingestion sandbox-only and requires a bearer credential', async () => {
  const production = await request(validRun(), {
    env: { ENVIRONMENT: 'production', VERIFICATION_INGEST_ENABLED: 'true' }, authorization: `Bearer ${token}`
  });
  assert.equal(production.response.status, 404);

  const disabled = await request(validRun(), {
    env: { VERIFICATION_INGEST_ENABLED: 'false' }, authorization: `Bearer ${token}`
  });
  assert.equal(disabled.response.status, 404);

  const missing = await request(validRun());
  assert.equal(missing.response.status, 401);
  assert.equal(missing.body.code, 'UNAUTHENTICATED');

  const invalid = await request(validRun(), { authorization: 'Bearer wrong-token' });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.body.code, 'UNAUTHENTICATED');
});

it('ingests only redacted CI metadata into the configured workspace idempotently', async () => {
  const created = await request(validRun(), { authorization: `Bearer ${token}` });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.deepEqual(created.body, { accepted: true, runId: 'GHA-731008-1', replayed: false });

  const replayed = await request(validRun(), { authorization: `Bearer ${token}` });
  assert.equal(replayed.response.status, 200);
  assert.equal(replayed.body.replayed, true);

  const mismatch = await request(validRun({ status: 'FAILED' }), { authorization: `Bearer ${token}` });
  assert.equal(mismatch.response.status, 409);
  assert.equal(mismatch.body.code, 'IDEMPOTENCY_MISMATCH');

  const stored = await db.prepare(`SELECT id,workspace_id,source_commit,schema_version,environment,
      started_at,completed_at,status FROM verification_runs WHERE id=?`).bind('GHA-731008-1').first<any>();
  assert.deepEqual({ ...stored }, {
    id: 'GHA-731008-1', workspace_id: workspaceId, source_commit: 'a'.repeat(40), schema_version: 46,
    environment: 'CI', started_at: '2026-10-07T12:00:00.000Z',
    completed_at: '2026-10-07T12:02:00.000Z', status: 'PASSED'
  });

  const unrun = await request(validRun({
    runId: 'GHA-731009-1', status: 'NOT_RUN', completedAt: null
  }), { authorization: `Bearer ${token}` });
  assert.equal(unrun.response.status, 201);

  const crossWorkspace = await request(validRun({
    runId: 'GHA-731010-1', workspaceId: 'caller-chosen-workspace'
  }), { authorization: `Bearer ${token}` });
  assert.equal(crossWorkspace.response.status, 400);
  const rejectedCount = await db.prepare('SELECT COUNT(*) AS count FROM verification_runs WHERE id=?')
    .bind('GHA-731010-1').first<{ count: number }>();
  assert.equal(rejectedCount?.count, 0);
});

it('rejects malformed, oversized-scope, and non-CI metadata before persistence', async () => {
  const cases: Array<[Record<string, unknown>, number]> = [
    [validRun({ sourceCommit: 'not-a-git-sha' }), 400],
    [validRun({ schemaVersion: 34 }), 400],
    [validRun({ environment: 'PRODUCTION' }), 400],
    [validRun({ startedAt: 'not-a-time' }), 400],
    [validRun({ status: 'SKIPPED' }), 400],
    [validRun({ startedAt: '2026-10-07T12:03:00.000Z' }), 400],
    [validRun({ extra: 'client-data-is-not-accepted' }), 400]
  ];
  for (const [payload, status] of cases) {
    const result = await request({ ...payload, runId: `GHA-${Math.floor(Math.random() * 1e9)}-1` }, {
      authorization: `Bearer ${token}`
    });
    assert.equal(result.response.status, status, JSON.stringify(result.body));
  }

  const unsupported = await request(validRun({ runId: 'GHA-731011-1' }), {
    authorization: `Bearer ${token}`, contentType: 'text/plain'
  });
  assert.equal(unsupported.response.status, 415);

  const oversized = await request({ ...validRun({ runId: 'GHA-731013-1' }), extra: 'x'.repeat(20_000) }, {
    authorization: `Bearer ${token}`
  });
  assert.equal(oversized.response.status, 413);
  assert.equal(oversized.body.code, 'PAYLOAD_TOO_LARGE');

  const missingWorkspace = await request(validRun({ runId: 'GHA-731012-1' }), {
    authorization: `Bearer ${token}`,
    env: { VERIFICATION_INGEST_WORKSPACE_ID: 'unconfigured-workspace' }
  });
  assert.equal(missingWorkspace.response.status, 503);
  const totalRuns = await db.prepare('SELECT COUNT(*) AS count FROM verification_runs').first<{ count: number }>();
  assert.equal(totalRuns?.count, 2, 'only the completed and NOT_RUN fixtures were inserted');
});
