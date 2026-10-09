import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { routeInventory } from '../../worker/index.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';
import { authSessionCookie } from '../helpers/authSession.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const env = {
  DB: db, FILES: { put: async () => { throw new Error('Not used by this test.'); } },
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) }, BUSINESS_SETUP_ENABLED: 'true'
} as any;
after(() => db.close());

it('requires a cookie session, rejects forged actors, isolates workspaces, and invalidates revoked grants', async () => {
  const bootstrap = async (name: string) => {
    const response = await worker.fetch(new Request('https://auth.auditsphere.test/api/workspaces', {
      method: 'POST', headers: { Origin: 'https://auth.auditsphere.test', 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ name, currency: 'QAR', timezone: 'Asia/Qatar', initialPartner: {
        displayName: `${name} Partner`, naturalPersonKey: `${name.toUpperCase()}-${crypto.randomUUID()}`, email: `${crypto.randomUUID()}@example.invalid`
      } })
    }), env, {} as any);
    assert.equal(response.status, 201, await response.clone().text());
    return await response.json() as { workspaceId: string; actorProfileId: string };
  };
  const request = async (workspaceId: string, cookie?: string, headers: Record<string, string> = {}, body?: unknown) => {
    const requestHeaders = new Headers({ Origin: 'https://auth.auditsphere.test', ...headers });
    if (cookie) requestHeaders.set('Cookie', cookie);
    if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
    return worker.fetch(new Request(`https://auth.auditsphere.test/api/workspaces/${workspaceId}/${body === undefined ? 'context' : 'commands'}`, {
      method: body === undefined ? 'GET' : 'POST', headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }), env, {} as any);
  };

  const first = await bootstrap('Session Auth Test');
  const second = await bootstrap('Session Auth Other');
  const partnerCookie = await authSessionCookie(db, first.workspaceId, first.actorProfileId);
  const partner = { actorId: first.actorProfileId, persona: 'APPROVER' };
  const command = async (cookie: string, actor: { actorId: string; persona: string }, type: string, payload: unknown) =>
    request(first.workspaceId, cookie, {
      'X-Actor-Id': actor.actorId,
      'X-Active-Persona': actor.persona,
      'Idempotency-Key': crypto.randomUUID()
    }, {
      actor: { actorId: actor.actorId, persona: actor.persona },
      context: {},
      expectedVersions: [],
      command: { type, payload }
    });
  const preparerStaff = await command(partnerCookie, partner, 'staff.create', {
    displayName: 'Auth Boundary Preparer',
    naturalPersonKey: `AUTH-PREPARER-${crypto.randomUUID()}`,
    email: `${crypto.randomUUID()}@example.invalid`,
    grade: 'ASSOCIATE'
  });
  assert.equal(preparerStaff.status, 200, await preparerStaff.clone().text());
  const preparerStaffId = (await preparerStaff.json() as any).result.staffMemberId as string;
  const preparerAssignment = await command(partnerCookie, partner, 'actor-profile.assign', {
    persona: 'PREPARER', staffMemberId: preparerStaffId
  });
  assert.equal(preparerAssignment.status, 200, await preparerAssignment.clone().text());
  const preparerActorProfileId = (await preparerAssignment.json() as any).result.actorProfileId as string;
  const preparerCookie = await authSessionCookie(db, first.workspaceId, preparerActorProfileId);
  const workspaceRoutes = routeInventory.filter(route => route.pattern.startsWith('/api/workspaces/:workspaceId'));
  assert.ok(workspaceRoutes.length > 0, 'The router must expose its registered workspace route inventory.');
  for (const route of workspaceRoutes) {
    const path = route.pattern.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_parameter, name: string) =>
      name === 'workspaceId' ? first.workspaceId : `test-${name}`);
    const response = await worker.fetch(new Request(`https://auth.auditsphere.test${path}`, {
      method: route.method,
      headers: { Origin: 'https://auth.auditsphere.test' }
    }), env, {} as any);
    assert.equal(response.status, 401, `Expected 401 for ${route.method} ${route.pattern} without a session.`);
    if (route.pattern === '/api/workspaces/:workspaceId/context') {
      assert.equal((await response.json() as any).code, 'UNAUTHENTICATED');
    }
  }
  const receiptsBefore = db.prepare('SELECT COUNT(*) AS count FROM command_receipts WHERE workspace_id=?').bind(first.workspaceId).first<any>()?.count;
  const auditBefore = db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?').bind(first.workspaceId).first<any>()?.count;

  const forgedHeader = await request(first.workspaceId, preparerCookie, {
    'X-Actor-Id': first.actorProfileId, 'X-Active-Persona': 'APPROVER', 'Idempotency-Key': crypto.randomUUID()
  }, {
    actor: { actorId: preparerActorProfileId, persona: 'PREPARER' }, context: {}, expectedVersions: [],
    command: { type: 'staff.create', payload: {
      displayName: 'Must not persist', naturalPersonKey: `NO-WRITE-${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@example.invalid`, grade: 'ASSOCIATE'
    } }
  });
  assert.equal(forgedHeader.status, 403);
  assert.equal((await forgedHeader.json() as any).code, 'PERSONA_ACTION_DENIED');

  const forgedEnvelope = await request(first.workspaceId, preparerCookie, {
    'X-Actor-Id': preparerActorProfileId, 'X-Active-Persona': 'PREPARER', 'Idempotency-Key': crypto.randomUUID()
  }, {
    actor: { actorId: first.actorProfileId, persona: 'APPROVER' }, context: {}, expectedVersions: [],
    command: { type: 'staff.create', payload: {
      displayName: 'Must not persist', naturalPersonKey: `NO-WRITE-${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@example.invalid`, grade: 'ASSOCIATE'
    } }
  });
  assert.equal(forgedEnvelope.status, 403);
  assert.equal((await forgedEnvelope.json() as any).code, 'PERSONA_ACTION_DENIED');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM command_receipts WHERE workspace_id=?').bind(first.workspaceId).first<any>()?.count, receiptsBefore);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?').bind(first.workspaceId).first<any>()?.count, auditBefore);

  const crossWorkspace = await request(second.workspaceId, preparerCookie);
  assert.equal(crossWorkspace.status, 404);
  assert.equal((await crossWorkspace.json() as any).code, 'NOT_FOUND');

  db.prepare(`UPDATE user_profile_grants SET revoked_at=?,revoked_by_actor_id=?
    WHERE workspace_id=? AND actor_profile_id=? AND revoked_at IS NULL`)
    .bind(new Date().toISOString(), first.actorProfileId, first.workspaceId, preparerActorProfileId).run();
  const revoked = await request(first.workspaceId, preparerCookie);
  assert.equal(revoked.status, 401);
  assert.equal((await revoked.json() as any).details.reason, 'GRANT_REVOKED');
});
