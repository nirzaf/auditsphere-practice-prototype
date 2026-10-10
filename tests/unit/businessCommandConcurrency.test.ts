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

async function command(workspaceId: string, actor: { actorId: string; persona: string }, type: string, payload: unknown,
  idempotencyKey = crypto.randomUUID()) {
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

  const failedClientCode = `ATOMIC${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const failedClientEmail = `${failedClientCode.toLowerCase()}@example.invalid`;
  const failedCommandKey = crypto.randomUUID();
  const failedPayload = {
    code: failedClientCode,
    legalName: `${failedClientCode} Atomicity Test WLL`,
    entityType: 'STANDALONE',
    industry: 'Testing',
    address: 'Doha, Qatar',
    countryCode: 'QA',
    primaryContact: {
      fullName: `${failedClientCode} Contact`,
      email: failedClientEmail,
      title: 'Finance Manager',
      role: 'CFO_FINANCE_DIRECTOR',
      effectiveFrom: '2026-01-01'
    }
  };
  const atomicityBefore = {
    clientCount: db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    contactCount: db.prepare('SELECT COUNT(*) AS count FROM contacts WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    routeCount: db.prepare('SELECT COUNT(*) AS count FROM contact_routes WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    auditCount: db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    receiptCount: db.prepare('SELECT COUNT(*) AS count FROM command_receipts WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    head: db.prepare(`SELECT last_sequence,last_event_hash FROM audit_chain_heads
      WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId)
      .first<{ last_sequence: number; last_event_hash: string | null }>(),
    revision: db.prepare('SELECT revision FROM workspaces WHERE id=?').bind(workspaceId).first<{ revision: number }>()?.revision
  };
  const originalBatch = db.batch.bind(db);
  let injectedFailure = false;
  let statementsAppliedBeforeFailure = 0;
  db.batch = ((statements: unknown[]) => {
    if (injectedFailure) return originalBatch(statements as any);
    injectedFailure = true;
    const prepared = statements as Array<{ run: () => unknown }>;
    const originalRuns = prepared.map(statement => statement.run.bind(statement));
    const failAt = 5; // command receipt, assertions, client and contact have run; the first route write must fail.
    prepared.forEach((statement, index) => {
      statement.run = () => {
        if (index === failAt) throw new Error('Injected command-batch interruption after the client and contact writes.');
        statementsAppliedBeforeFailure += 1;
        return originalRuns[index]();
      };
    });
    try {
      return originalBatch(prepared as any);
    } finally {
      prepared.forEach((statement, index) => { statement.run = originalRuns[index]; });
    }
  }) as any;
  let failedCommand: Awaited<ReturnType<typeof command>>;
  try {
    failedCommand = await command(workspaceId, preparer, 'client.create', failedPayload, failedCommandKey);
  } finally {
    db.batch = originalBatch as any;
  }
  assert.equal(injectedFailure, true, 'the real command batch reaches the injected mid-batch failure');
  assert.equal(statementsAppliedBeforeFailure, 5, 'the failure occurs after the command receipt, client and contact statements executed');
  assert.equal(failedCommand.response.status, 503, JSON.stringify(failedCommand.body));
  assert.equal(failedCommand.body.code, 'UNAVAILABLE');
  assert.deepEqual({
    clientCount: db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    contactCount: db.prepare('SELECT COUNT(*) AS count FROM contacts WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    routeCount: db.prepare('SELECT COUNT(*) AS count FROM contact_routes WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    auditCount: db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    receiptCount: db.prepare('SELECT COUNT(*) AS count FROM command_receipts WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>()?.count,
    head: db.prepare(`SELECT last_sequence,last_event_hash FROM audit_chain_heads
      WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId)
      .first<{ last_sequence: number; last_event_hash: string | null }>(),
    revision: db.prepare('SELECT revision FROM workspaces WHERE id=?').bind(workspaceId).first<{ revision: number }>()?.revision
  }, atomicityBefore, 'failure rolls back every statement in the command, including the early receipt, entities, audit head and revision');
  assert.equal(db.prepare('SELECT id FROM clients WHERE workspace_id=? AND code=?').bind(workspaceId, failedClientCode).first(), null);
  assert.equal(db.prepare('SELECT id FROM contacts WHERE workspace_id=? AND email=?').bind(workspaceId, failedClientEmail).first(), null);
  assert.equal(db.prepare('SELECT id FROM command_receipts WHERE workspace_id=? AND idempotency_key=?')
    .bind(workspaceId, failedCommandKey).first(), null, 'an aborted command cannot be replayed as if it committed');

  const retriedCommand = await command(workspaceId, preparer, 'client.create', failedPayload, failedCommandKey);
  assert.equal(retriedCommand.response.status, 200, JSON.stringify(retriedCommand.body));
  assert.equal(retriedCommand.body.replayed, false, 'the identical idempotency key remains available after an atomic rollback');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=? AND code=?')
    .bind(workspaceId, failedClientCode).first<{ count: number }>()?.count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM contacts WHERE workspace_id=? AND email=?')
    .bind(workspaceId, failedClientEmail).first<{ count: number }>()?.count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM command_receipts WHERE workspace_id=? AND idempotency_key=?')
    .bind(workspaceId, failedCommandKey).first<{ count: number }>()?.count, 1);
});
