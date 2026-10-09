import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';
import { authSessionCookie, bootstrapBusinessFixture } from '../helpers/authSession.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const env = {
  DB: db,
  FILES: { put: async () => { throw new Error('File storage is not part of this test.'); } } as any,
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as any
} as any;

after(() => db.close());

async function call(path: string, options: {
  method?: string;
  payload?: unknown;
  actor?: { actorId: string; persona: string };
  idempotencyKey?: string;
} = {}) {
  const headers = new Headers({ Origin: 'https://local.auditsphere.test' });
  if (options.actor) {
    headers.set('X-Test-Session-Profile', options.actor.actorId);
  }
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.payload !== undefined) headers.set('Content-Type', 'application/json');
  const workspaceId = path.match(/^\/api\/workspaces\/([^/?]+)/)?.[1];
  if (workspaceId) headers.set('Cookie', await authSessionCookie(db, workspaceId, options.actor?.actorId));
  headers.delete('X-Test-Session-Profile');
  const response = await worker.fetch(new Request(`https://local.auditsphere.test${path}`, {
    method: options.method ?? 'GET', headers,
    ...(options.payload === undefined ? {} : { body: JSON.stringify(options.payload) })
  }), env, {} as any);
  return { response, body: await response.json() as any };
}

async function command(workspaceId: string, actor: { actorId: string; persona: string }, type: string, payload: unknown) {
  const idempotencyKey = crypto.randomUUID();
  return call(`/api/workspaces/${workspaceId}/commands`, {
    method: 'POST', actor, idempotencyKey,
    payload: {
      context: {},
      expectedVersions: [],
      command: { type, payload }
    }
  });
}

it('retries audit-head compare-and-swap races so 20 concurrent commands persist', async () => {
  const bootstrap = await bootstrapBusinessFixture(db, {
      name: 'Concurrent command regression',
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: {
        displayName: 'Concurrency Test Partner',
        naturalPersonKey: `CONCURRENCY-${crypto.randomUUID()}`,
        email: 'concurrency.partner@example.invalid'
      }
  });
  const workspaceId = bootstrap.workspaceId;
  const approver = { actorId: bootstrap.actorProfileId, persona: 'APPROVER' };

  const staff = await command(workspaceId, approver, 'staff.create', {
    displayName: 'Concurrency Test Preparer',
    naturalPersonKey: `CONCURRENCY-${crypto.randomUUID()}`,
    email: 'concurrency.preparer@example.invalid',
    grade: 'ASSOCIATE'
  });
  assert.equal(staff.response.status, 200, JSON.stringify(staff.body));
  const assignment = await command(workspaceId, approver, 'actor-profile.assign', {
    persona: 'PREPARER', staffMemberId: staff.body.result.staffMemberId
  });
  assert.equal(assignment.response.status, 200, JSON.stringify(assignment.body));
  const preparer = { actorId: assignment.body.result.actorProfileId as string, persona: 'PREPARER' };

  const commandCount = 20;
  const results = await Promise.all(Array.from({ length: commandCount }, (_, index) => {
    const code = `RACE${String(index + 1).padStart(4, '0')}`;
    return command(workspaceId, preparer, 'client.create', {
      code,
      legalName: `${code} Concurrency Test WLL`,
      entityType: 'STANDALONE',
      industry: 'Testing',
      address: 'Doha, Qatar',
      countryCode: 'QA',
      primaryContact: {
        fullName: `${code} Contact`,
        email: `${code.toLowerCase()}@example.invalid`,
        title: 'Finance Manager',
        role: 'CFO_FINANCE_DIRECTOR',
        effectiveFrom: '2026-01-01'
      }
    });
  }));

  for (const [index, result] of results.entries()) {
    assert.equal(result.response.status, 200, `Concurrent command ${index + 1}: ${JSON.stringify(result.body)}`);
  }
  assert.equal(new Set(results.map(result => result.body.result.clientId)).size, commandCount,
    'each idempotent command persists one distinct client');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM audit_events
    WHERE workspace_id=? AND command_type='client.create'`).bind(workspaceId).first<{ count: number }>()?.count,
  commandCount, 'all successful commands append one workspace audit event');
});
