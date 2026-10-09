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
  FILES: { put: async () => { throw new Error('File storage is not part of this test.'); } } as any,
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as any,
  BUSINESS_SETUP_ENABLED: 'true'
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
    headers.set('X-Actor-Id', options.actor.actorId);
    headers.set('X-Active-Persona', options.actor.persona);
  }
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.payload !== undefined) headers.set('Content-Type', 'application/json');
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
      actor: { actorId: actor.actorId, persona: actor.persona },
      context: {},
      expectedVersions: [],
      command: { type, payload }
    }
  });
}

it('US-SYS-001 keeps historical authentication routes out of the no-auth product profile', async () => {
  const results = await Promise.all([
    call('/api/auth/staff/login'),
    call('/api/auth/me'),
    call('/api/auth/client/login', { method: 'POST', payload: {} }),
    call('/api/auth/active-profile', { method: 'POST', payload: {} }),
    call('/api/auth/logout', { method: 'POST', payload: {} }),
    call('/api/auth/password/reset', { method: 'POST', payload: {} })
  ]);
  assert.deepEqual(results.map(result => result.response.status), [404, 404, 404, 404, 404, 404]);
});

it('retries audit-head compare-and-swap races so 20 concurrent commands persist', async () => {
  const bootstrap = await call('/api/workspaces', {
    method: 'POST',
    idempotencyKey: crypto.randomUUID(),
    payload: {
      name: 'Concurrent command regression',
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: {
        displayName: 'Concurrency Test Partner',
        naturalPersonKey: `CONCURRENCY-${crypto.randomUUID()}`,
        email: 'concurrency.partner@example.invalid'
      }
    }
  });
  assert.equal(bootstrap.response.status, 201, JSON.stringify(bootstrap.body));
  const workspaceId = bootstrap.body.workspaceId as string;
  const approver = { actorId: bootstrap.body.actorProfileId as string, persona: 'APPROVER' };

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
  const auditRowsByCommand = db.prepare(`SELECT command_id,COUNT(*) AS count FROM audit_events
    WHERE workspace_id=? AND command_type='client.create' GROUP BY command_id ORDER BY command_id`)
    .bind(workspaceId).all<{ command_id: string; count: number }>().results ?? [];
  assert.equal(auditRowsByCommand.length, commandCount, 'every successful command has one audit group');
  assert.ok(auditRowsByCommand.every(row => row.count === 4),
    'every client.create command audits its client, primary contact and both contact routes');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM audit_events
    WHERE workspace_id=? AND command_type='client.create'`).bind(workspaceId).first<{ count: number }>()?.count,
  commandCount * 4, 'all successful commands append a complete entity-level workspace audit chain');
});
