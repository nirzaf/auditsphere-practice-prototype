import assert from 'node:assert/strict';
import { it } from 'node:test';
import { SqliteD1 } from '../helpers/sqliteD1.js';
import worker, { routeInventory } from '../../worker/index.js';
import { emailStatusWebhookSignature, handleEmailStatusWebhook } from '../../worker/emailStatusWebhook.js';
import type { Env } from '../../worker/env.js';

const secret = 'synthetic-email-status-webhook-secret-0123456789';
const nowMilliseconds = Date.parse('2026-10-09T12:00:00.000Z');
const timestamp = String(Math.floor(nowMilliseconds / 1000));

async function signedRequest(rawBody: string, sentAt = timestamp): Promise<Request> {
  return new Request('https://auditsphere.example.test/api/webhooks/email-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AuditSphere-Timestamp': sentAt,
      'X-AuditSphere-Signature': await emailStatusWebhookSignature(secret, sentAt, rawBody)
    },
    body: rawBody
  });
}

it('registers the public email-status callback route', () => {
  assert.ok(routeInventory.some(route => route.method === 'POST' && route.pattern === '/api/webhooks/email-status'));
  assert.equal(typeof worker.fetch, 'function');
});

it('authenticates, records, deduplicates and applies terminal email statuses without downgrades', async () => {
  const db = new SqliteD1();
  db.migrate(process.cwd());
  db.prepare('PRAGMA foreign_keys=OFF').run();
  const dispatchId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const providerMessageId = 'synthetic-provider-message-1';
  const occurredAt = '2026-10-09T11:59:00.000Z';
  db.prepare(`INSERT INTO dispatches(id,workspace_id,version,client_id,engagement_id,purpose,file_version_id,recipient_snapshot_json,
      status,provider_message_id,sent_at,deduplication_key,job_id,created_at,updated_at)
    VALUES(?,?,1,'synthetic-client','synthetic-engagement','PROPOSAL','synthetic-file','{}','ACCEPTED',?,?,?, 'synthetic-job',?,?)`)
    .bind(dispatchId, workspaceId, providerMessageId, occurredAt, 'synthetic-email-dedup', occurredAt, occurredAt).run();
  const env = { DB: db, EMAIL_STATUS_WEBHOOK_SECRET: secret } as unknown as Pick<Env, 'DB' | 'EMAIL_STATUS_WEBHOOK_SECRET'>;
  const call = (request: Request) => handleEmailStatusWebhook(request, env, 'synthetic-request', nowMilliseconds);
  const initialEvent = {
    eventId: 'provider-event-1', dispatchId, providerMessageId, status: 'DELIVERED', occurredAt
  };
  const initialBody = JSON.stringify(initialEvent);

  const invalidSignature = new Request('https://auditsphere.example.test/api/webhooks/email-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AuditSphere-Timestamp': timestamp, 'X-AuditSphere-Signature': `sha256=${'0'.repeat(64)}` },
    body: initialBody
  });
  assert.equal((await call(invalidSignature)).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM dispatch_delivery_events').first<{ count: number }>()?.count, 0,
    'invalid HMAC never records an event');

  const stale = await signedRequest(initialBody, String(Number(timestamp) - 301));
  assert.equal((await call(stale)).status, 401);

  const delivered = await call(await signedRequest(initialBody));
  assert.equal(delivered.status, 200);
  assert.deepEqual(await delivered.json(), { ok: true, duplicate: false, applied: true });
  const deliveredDispatch = db.prepare('SELECT status,version FROM dispatches WHERE id=?').bind(dispatchId).first<{ status: string; version: number }>();
  assert.equal(deliveredDispatch?.status, 'DELIVERED');
  assert.equal(deliveredDispatch?.version, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM dispatch_delivery_events WHERE workspace_id=? AND dispatch_id=?')
    .bind(workspaceId, dispatchId).first<{ count: number }>()?.count, 1);

  const replay = await call(await signedRequest(initialBody));
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { ok: true, duplicate: true, applied: false });
  assert.equal(db.prepare('SELECT version FROM dispatches WHERE id=?').bind(dispatchId).first<{ version: number }>()?.version, 2,
    'replaying an event does not bump the dispatch version');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM dispatch_delivery_events WHERE workspace_id=? AND dispatch_id=?')
    .bind(workspaceId, dispatchId).first<{ count: number }>()?.count, 1, 'replay creates no duplicate history');

  const conflictingReplay = await call(await signedRequest(JSON.stringify({ ...initialEvent, status: 'BOUNCED' })));
  assert.equal(conflictingReplay.status, 409, 'an event ID cannot be reused for a different status');
  const lateBounce = await call(await signedRequest(JSON.stringify({ ...initialEvent, eventId: 'provider-event-2', status: 'BOUNCED' })));
  assert.equal(lateBounce.status, 200);
  assert.deepEqual(await lateBounce.json(), { ok: true, duplicate: false, applied: false });
  assert.equal(db.prepare('SELECT status,version FROM dispatches WHERE id=?').bind(dispatchId).first<{ status: string; version: number }>()?.status, 'DELIVERED',
    'a later event cannot downgrade terminal delivery');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM dispatch_delivery_events WHERE workspace_id=? AND dispatch_id=?')
    .bind(workspaceId, dispatchId).first<{ count: number }>()?.count, 2);

  const unknownDispatch = await call(await signedRequest(JSON.stringify({ ...initialEvent, dispatchId: crypto.randomUUID(), eventId: 'provider-event-3' })));
  assert.equal(unknownDispatch.status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM dispatch_delivery_events WHERE workspace_id=? AND dispatch_id=?')
    .bind(workspaceId, dispatchId).first<{ count: number }>()?.count, 2, 'unknown dispatches do not create history');
  db.close();
});
