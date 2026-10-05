import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const env = {
  DB: db,
  FILES: {} as any,
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as any,
  BUSINESS_SETUP_ENABLED: 'true'
} as any;

after(() => db.close());

async function call(path: string, options: {
  method?: string;
  payload?: unknown;
  headers?: Record<string, string>;
} = {}): Promise<{ response: Response; body: any }> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Origin: 'https://local.auditsphere.test', ...options.headers });
  if (options.payload !== undefined) headers.set('Content-Type', 'application/json');
  const request = new Request(`https://local.auditsphere.test${path}`, {
    method,
    headers,
    ...(options.payload === undefined ? {} : { body: JSON.stringify(options.payload) })
  });
  const response = await worker.fetch(request, env, {} as any);
  return { response, body: await response.json() };
}

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  call(path, { method: 'POST', payload, headers });

it('bootstraps a no-session BUSINESS workspace and maintains atomic directory profiles', async () => {
  const input = {
    name: 'AuditSphere local business test',
    currency: 'QAR',
    timezone: 'Asia/Qatar',
    initialPartner: {
      displayName: 'Local Partner',
      naturalPersonKey: `TEST-PERSON-${crypto.randomUUID()}`,
      email: 'local.partner@example.invalid'
    }
  };
  env.BUSINESS_SETUP_ENABLED = 'false';
  const disabled = await post('/api/workspaces', input, { 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(disabled.response.status, 503);
  env.BUSINESS_SETUP_ENABLED = 'true';

  const bootstrapKey = crypto.randomUUID();
  const created = await post('/api/workspaces', input, { 'Idempotency-Key': bootstrapKey });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.equal(created.response.headers.get('set-cookie'), null, 'BUSINESS setup must not create a session cookie');
  assert.match(created.body.workspaceId, /^[a-f0-9-]{36}$/);
  assert.match(created.body.staffMemberId, /^[a-f0-9-]{36}$/);
  assert.match(created.body.actorProfileId, /^[a-f0-9-]{36}$/);
  const workspaceId = created.body.workspaceId as string;

  const replay = await post('/api/workspaces', input, { 'Idempotency-Key': bootstrapKey });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.workspaceId, workspaceId);
  assert.equal(replay.body.replayed, true);
  const keyReuse = await post('/api/workspaces', { ...input, name: 'Different request' }, { 'Idempotency-Key': bootstrapKey });
  assert.equal(keyReuse.response.status, 409);
  assert.equal(keyReuse.body.code, 'IDEMPOTENCY_MISMATCH');

  const stored = db.prepare(`SELECT w.data_mode,w.seed_id,w.business_status,
      (SELECT COUNT(*) FROM workspace_entities WHERE workspace_id=w.id) AS generic_entities,
      (SELECT COUNT(*) FROM test_workspace_expiry WHERE workspace_id=w.id) AS test_expiries,
      (SELECT COUNT(*) FROM audit_events WHERE workspace_id=w.id) AS event_count,
      (SELECT actor_assurance FROM audit_events WHERE workspace_id=w.id) AS actor_assurance,
      (SELECT source FROM audit_events WHERE workspace_id=w.id) AS event_source,
      (SELECT event_type FROM audit_events WHERE workspace_id=w.id) AS event_type
    FROM workspaces w WHERE w.id=?`).bind(workspaceId).first<any>();
  assert.equal(stored.data_mode, 'BUSINESS');
  assert.equal(stored.seed_id, null);
  assert.equal(stored.business_status, 'ACTIVE');
  assert.equal(db.prepare('PRAGMA table_info(workspaces)').all<any>().results.some(column => column.name === 'expires_at'), false,
    'legacy expiry column was removed');
  assert.equal(stored.generic_entities, 0, 'bootstrap must not materialize generic PrototypeState records');
  assert.equal(stored.test_expiries, 0);
  assert.equal(stored.event_count, 1);
  assert.equal(stored.actor_assurance, 'SYSTEM');
  assert.equal(stored.event_source, 'JOB');
  assert.equal(stored.event_type, 'BOOTSTRAP');

  const profiles = await call(`/api/workspaces/${workspaceId}/actor-profiles`);
  assert.equal(profiles.response.status, 200, JSON.stringify(profiles.body));
  assert.deepEqual(profiles.body.items.map((profile: any) => profile.persona), ['APPROVER']);
  const approverHeaders = { 'X-Actor-Id': created.body.actorProfileId, 'X-Active-Persona': 'APPROVER' };
  const approverContext = await call(`/api/workspaces/${workspaceId}/context`, { headers: approverHeaders });
  assert.equal(approverContext.response.status, 200, JSON.stringify(approverContext.body));
  assert.deepEqual(approverContext.body.allowedActions, ['directory.manage']);

  const staffKey = crypto.randomUUID();
  const staffRequest = {
    idempotencyKey: staffKey,
    command: { type: 'staff.create', payload: {
      displayName: 'Local Reviewer',
      naturalPersonKey: `TEST-PERSON-${crypto.randomUUID()}`,
      email: 'local.reviewer@example.invalid',
      grade: 'MANAGER'
    } }
  };
  const staff = await post(`/api/workspaces/${workspaceId}/commands`, staffRequest, approverHeaders);
  assert.equal(staff.response.status, 200, JSON.stringify(staff.body));
  assert.equal(staff.body.replayed, false);
  const staffReplay = await post(`/api/workspaces/${workspaceId}/commands`, staffRequest, approverHeaders);
  assert.equal(staffReplay.response.status, 200);
  assert.equal(staffReplay.body.result.staffMemberId, staff.body.result.staffMemberId);
  assert.equal(staffReplay.body.replayed, true);

  const assigned = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'actor-profile.assign', payload: { persona: 'REVIEWER', staffMemberId: staff.body.result.staffMemberId } }
  }, approverHeaders);
  assert.equal(assigned.response.status, 200, JSON.stringify(assigned.body));
  const reviewerId = assigned.body.result.actorProfileId as string;
  const reviewerHeaders = { 'X-Actor-Id': reviewerId, 'X-Active-Persona': 'REVIEWER' };

  const reviewerContext = await call(`/api/workspaces/${workspaceId}/context`, { headers: reviewerHeaders });
  assert.equal(reviewerContext.response.status, 200, JSON.stringify(reviewerContext.body));
  assert.equal(reviewerContext.body.actor.persona, 'REVIEWER');
  const approverContextAgain = await call(`/api/workspaces/${workspaceId}/context`, { headers: approverHeaders });
  assert.equal(approverContextAgain.body.actor.persona, 'APPROVER', 'requests do not share mutable actor state');

  const forbiddenDirectoryEdit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'staff.create', payload: {
      displayName: 'Should Not Be Added', naturalPersonKey: `TEST-${crypto.randomUUID()}`, grade: 'ASSOCIATE'
    } }
  }, reviewerHeaders);
  assert.equal(forbiddenDirectoryEdit.response.status, 403);
  assert.equal(forbiddenDirectoryEdit.body.code, 'PERSONA_ACTION_DENIED');

  const wrongGrade = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'actor-profile.assign', payload: { persona: 'APPROVER', staffMemberId: staff.body.result.staffMemberId } }
  }, approverHeaders);
  assert.equal(wrongGrade.response.status, 403);
  assert.equal(wrongGrade.body.code, 'PERSONA_ACTION_DENIED');

  const staleUpdate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'staff.update', payload: { staffMemberId: staff.body.result.staffMemberId, expectedVersion: 1, displayName: 'Updated Reviewer' } }
  }, approverHeaders);
  assert.equal(staleUpdate.response.status, 200, JSON.stringify(staleUpdate.body));
  const auditCountBeforeStaleRetry = db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?')
    .bind(workspaceId).first<{ count: number }>()?.count;
  const staleRetry = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'staff.update', payload: { staffMemberId: staff.body.result.staffMemberId, expectedVersion: 1, displayName: 'Stale Reviewer' } }
  }, approverHeaders);
  assert.equal(staleRetry.response.status, 409);
  assert.equal(staleRetry.body.code, 'VERSION_CONFLICT');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?')
    .bind(workspaceId).first<{ count: number }>()?.count, auditCountBeforeStaleRetry, 'failed optimistic update writes no audit event');

  const cannotDeactivateLastApprover = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'actor-profile.deactivate', payload: { actorProfileId: created.body.actorProfileId, expectedVersion: 1 } }
  }, approverHeaders);
  assert.equal(cannotDeactivateLastApprover.response.status, 403);
  assert.equal(cannotDeactivateLastApprover.body.code, 'PERSONA_ACTION_DENIED');
});
