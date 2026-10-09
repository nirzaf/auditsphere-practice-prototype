import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import type { Env } from '../../worker/env.js';
import { processBusinessOutbox } from '../../worker/businessOutbox.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const apiOrigin = 'https://audit.example.test';
const limiterKeys: string[] = [];
const env = {
  DB: db,
  FILES: { put: async () => { throw new Error('Not used in this test.'); } },
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  BUSINESS_SETUP_ENABLED: 'true',
  TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
  PUBLIC_LEAD_TURNSTILE_HOSTNAMES: 'www.firm.example',
  PUBLIC_LEAD_IP_HASH_SECRET: 'test-public-ip-hash-secret-at-least-32-chars',
  PUBLIC_LEAD_DEFAULT_COUNTRY_CODE: 'QA',
  PUBLIC_LEAD_ALLOWED_ORIGINS: 'https://www.firm.example',
  RATE_LIMITER: { limit: async ({ key }: { key: string }) => { limiterKeys.push(key); return { success: true }; } }
} as unknown as Env;
const workspaceResponse = await worker.fetch(new Request(`${apiOrigin}/api/workspaces`, {
  method: 'POST',
  headers: { Origin: apiOrigin, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({
    name: 'Public Inquiry Acceptance', currency: 'QAR', timezone: 'Asia/Qatar',
    initialPartner: { displayName: 'Inquiry Partner', naturalPersonKey: `INQUIRY-PARTNER-${crypto.randomUUID()}`, email: 'inquiry.partner@example.invalid' }
  })
}), env, {} as ExecutionContext);
assert.equal(workspaceResponse.status, 201, await workspaceResponse.clone().text());
const workspace = await workspaceResponse.json() as { workspaceId: string; actorProfileId: string };
const partnerHeaders = { 'X-Actor-Id': workspace.actorProfileId, 'X-Active-Persona': 'APPROVER' };
after(() => db.close());

const validBody = (overrides: Record<string, unknown> = {}) => ({
  companyName: 'Northwind Assurance Prospect',
  contactName: 'Amina Example',
  email: 'Amina.Example@Example.invalid',
  phone: '+974 5555 1234',
  serviceInterest: 'STATUTORY_AUDIT',
  message: 'Please contact us about a statutory audit.',
  turnstileToken: 'test-valid-token',
  website: '',
  ...overrides
});

async function submit(body: unknown, options: { origin?: string; ip?: string } = {}) {
  return worker.fetch(new Request(`${apiOrigin}/api/public/leads`, {
    method: 'POST',
    headers: {
      Origin: options.origin ?? 'https://www.firm.example',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': options.ip ?? '203.0.113.77'
    },
    body: JSON.stringify(body)
  }), env, {} as ExecutionContext);
}

it('accepts an inquiry, redacts the IP, triages it into an audited lead, and detects duplicates', async () => {
  const originalFetch = globalThis.fetch;
  let siteverifyCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    if (String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      siteverifyCalls += 1;
      return Response.json({ success: true, hostname: 'www.firm.example' });
    }
    return originalFetch(input);
  };
  try {
    const accepted = await submit(validBody());
    assert.equal(accepted.status, 202, await accepted.clone().text());
    assert.equal(accepted.headers.get('Access-Control-Allow-Origin'), 'https://www.firm.example');
    assert.deepEqual(await accepted.json(), { accepted: true });
    assert.equal(siteverifyCalls, 1);

    const row = await db.prepare(`SELECT id,version,status,email_normalized,ip_sha256,lead_id,created_at FROM public_lead_submissions
      WHERE workspace_id=? ORDER BY created_at,id LIMIT 1`).bind(workspace.workspaceId)
      .first<{ id: string; version: number; status: string; email_normalized: string; ip_sha256: string; lead_id: string | null; created_at: string }>();
    assert.ok(row);
    assert.equal(row.status, 'RECEIVED');
    assert.equal(row.email_normalized, 'amina.example@example.invalid');
    assert.match(row.ip_sha256, /^[a-f0-9]{64}$/);
    assert.notEqual(row.ip_sha256, '203.0.113.77');
    const noticesByDefault = await db.prepare(`SELECT COUNT(*) AS count FROM outbox_jobs WHERE workspace_id=? AND aggregate_id=?
      AND kind='EMAIL' AND json_extract(payload_json,'$.documentType')='PUBLIC_LEAD_NOTIFICATION'`).bind(workspace.workspaceId, row.id)
      .first<{ count: number }>();
    assert.equal(noticesByDefault?.count, 0, 'notification email stays off until a firm inbox is configured');

    const list = await worker.fetch(new Request(`${apiOrigin}/api/workspaces/${workspace.workspaceId}/public-lead-submissions`, {
      headers: partnerHeaders
    }), env, {} as ExecutionContext);
    assert.equal(list.status, 200, await list.clone().text());
    const listed = await list.json() as { items: Array<{ id: string; status: string; email: string }> };
    assert.equal(listed.items[0].id, row.id);
    assert.equal(listed.items[0].email, 'amina.example@example.invalid');

    const triage = await worker.fetch(new Request(`${apiOrigin}/api/workspaces/${workspace.workspaceId}/commands`, {
      method: 'POST',
      headers: { Origin: apiOrigin, ...partnerHeaders, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ actor: { actorId: workspace.actorProfileId, persona: 'APPROVER' }, context: {}, expectedVersions: [{ entity: 'PublicLeadSubmission', id: row.id, version: row.version }], command: {
        type: 'publicLead.triage', payload: {
          submissionId: row.id, expectedVersion: row.version, decision: 'ACCEPT', requestedService: 'STATUTORY_AUDIT',
          periodStart: '2026-01-01', periodEnd: '2026-12-31'
        }
      } })
    }), env, {} as ExecutionContext);
    assert.equal(triage.status, 200, await triage.clone().text());
    const triaged = await triage.json() as { result: { leadId: string; clientId: string; status: string } };
    assert.equal(triaged.result.status, 'ACCEPTED_AS_LEAD');
    const lead = await db.prepare(`SELECT source,received_at,requested_service,period_start,period_end,client_id,primary_contact_id
      FROM leads WHERE workspace_id=? AND id=?`).bind(workspace.workspaceId, triaged.result.leadId)
      .first<{ source: string; received_at: string; requested_service: string; period_start: string; period_end: string; client_id: string; primary_contact_id: string }>();
    assert.equal(lead?.source, 'WEB_FORM');
    assert.equal(lead?.received_at, row.created_at);
    assert.equal(lead?.requested_service, 'STATUTORY_AUDIT');
    assert.equal(lead?.period_start, '2026-01-01');
    assert.equal(lead?.period_end, '2026-12-31');
    assert.ok(lead?.client_id && lead.primary_contact_id);

    const duplicate = await submit(validBody({ email: 'amina.example@example.invalid' }));
    assert.equal(duplicate.status, 202, await duplicate.clone().text());
    const duplicateRow = await db.prepare(`SELECT status,lead_id FROM public_lead_submissions WHERE workspace_id=?
      ORDER BY created_at DESC,id DESC LIMIT 1`).bind(workspace.workspaceId).first<{ status: string; lead_id: string | null }>();
    assert.equal(duplicateRow?.status, 'DUPLICATE');
    assert.equal(duplicateRow?.lead_id, triaged.result.leadId);
    assert.ok(limiterKeys.every(key => !key.includes('203.0.113.77') && !key.includes('amina.example@example.invalid')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it('queues an optional notification with only a submission reference when a firm inbox is configured', async () => {
  const originalFetch = globalThis.fetch;
  const originalNotification = env.PUBLIC_LEAD_NOTIFICATION_EMAIL;
  const originalEmailProvider = env.EMAIL_PROVIDER;
  env.PUBLIC_LEAD_NOTIFICATION_EMAIL = 'audit@firm.example';
  globalThis.fetch = async (input: RequestInfo | URL) => String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    ? Response.json({ success: true, hostname: 'www.firm.example' }) : originalFetch(input);
  try {
    const accepted = await submit(validBody({ email: 'notify@example.invalid' }));
    assert.equal(accepted.status, 202, await accepted.clone().text());
    const job = await db.prepare(`SELECT status,payload_json FROM outbox_jobs WHERE workspace_id=?
      AND deduplication_key LIKE 'public-lead-notification:%' ORDER BY created_at DESC,id DESC LIMIT 1`)
      .bind(workspace.workspaceId).first<{ status: string; payload_json: string }>();
    assert.equal(job?.status, 'PENDING');
    const payload = JSON.parse(job?.payload_json ?? '{}') as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ['documentType', 'submissionId']);
    assert.equal(payload.documentType, 'PUBLIC_LEAD_NOTIFICATION');

    const notificationMessages: Array<Record<string, unknown>> = [];
    env.EMAIL_PROVIDER = { fetch: async input => {
      const request = input instanceof Request ? input : new Request(input);
      const form = await request.formData();
      notificationMessages.push(JSON.parse(String(form.get('message')) as string) as Record<string, unknown>);
      return Response.json({ messageId: 'test-public-lead-email', status: 'ACCEPTED' });
    } } as unknown as NonNullable<Env['EMAIL_PROVIDER']>;
    await processBusinessOutbox(env);
    const completed = await db.prepare(`SELECT status,provider_reference FROM outbox_jobs WHERE workspace_id=?
      AND deduplication_key LIKE 'public-lead-notification:%' ORDER BY created_at DESC,id DESC LIMIT 1`)
      .bind(workspace.workspaceId).first<{ status: string; provider_reference: string | null }>();
    assert.equal(completed?.status, 'SUCCEEDED');
    assert.equal(completed?.provider_reference, 'test-public-lead-email');
    assert.equal(notificationMessages[0]?.to, 'audit@firm.example');
    assert.match(String(notificationMessages[0]?.text), /notify@example\.invalid/);
  } finally {
    env.PUBLIC_LEAD_NOTIFICATION_EMAIL = originalNotification;
    env.EMAIL_PROVIDER = originalEmailProvider;
    globalThis.fetch = originalFetch;
  }
});

it('denies inquiry triage to a reviewer persona', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    ? Response.json({ success: true, hostname: 'www.firm.example' }) : originalFetch(input);
  try {
    const accepted = await submit(validBody({ email: 'reviewer-check@example.invalid' }));
    assert.equal(accepted.status, 202);
    const submission = await db.prepare(`SELECT id,version FROM public_lead_submissions WHERE workspace_id=?
      AND email_normalized='reviewer-check@example.invalid'`).bind(workspace.workspaceId)
      .first<{ id: string; version: number }>();
    assert.ok(submission);

    async function partnerCommand(command: Record<string, unknown>) {
      const response = await worker.fetch(new Request(`${apiOrigin}/api/workspaces/${workspace.workspaceId}/commands`, {
        method: 'POST',
        headers: { Origin: apiOrigin, ...partnerHeaders, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ actor: { actorId: workspace.actorProfileId, persona: 'APPROVER' }, context: {}, expectedVersions: [], command })
      }), env, {} as ExecutionContext);
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json() as { result: Record<string, unknown> }).result;
    }
    const staff = await partnerCommand({ type: 'staff.create', payload: {
      displayName: 'Inquiry Reviewer', naturalPersonKey: `INQUIRY-REVIEWER-${crypto.randomUUID()}`, grade: 'MANAGER'
    } });
    const profile = await partnerCommand({ type: 'actor-profile.assign', payload: {
      persona: 'REVIEWER', staffMemberId: staff.staffMemberId
    } });
    const reviewerHeaders = { 'X-Actor-Id': String(profile.actorProfileId), 'X-Active-Persona': 'REVIEWER' };
    const denied = await worker.fetch(new Request(`${apiOrigin}/api/workspaces/${workspace.workspaceId}/commands`, {
      method: 'POST',
      headers: { Origin: apiOrigin, ...reviewerHeaders, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ actor: { actorId: String(profile.actorProfileId), persona: 'REVIEWER' }, context: {}, expectedVersions: [{ entity: 'PublicLeadSubmission', id: submission.id, version: submission.version }], command: {
        type: 'publicLead.triage', payload: { submissionId: submission.id, decision: 'SPAM', expectedVersion: submission.version }
      } })
    }), env, {} as ExecutionContext);
    assert.equal(denied.status, 403, await denied.clone().text());
    assert.equal((await denied.json() as { code: string }).code, 'PERSONA_ACTION_DENIED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it('limits valid public submissions to five per hashed IP in a rolling hour', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    ? Response.json({ success: true, hostname: 'www.firm.example' }) : originalFetch(input);
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await submit(validBody({ email: `hour-limit-${attempt}@example.invalid` }), { ip: '203.0.113.91' });
      assert.equal(response.status, 202, await response.clone().text());
    }
    const limited = await submit(validBody({ email: 'hour-limit-6@example.invalid' }), { ip: '203.0.113.91' });
    assert.equal(limited.status, 429, await limited.clone().text());
    assert.equal((await limited.json() as { code: string }).code, 'RATE_LIMITED');
    const persisted = await db.prepare(`SELECT COUNT(*) AS count FROM public_lead_submissions WHERE workspace_id=?
      AND email_normalized LIKE 'hour-limit-%@example.invalid'`).bind(workspace.workspaceId).first<{ count: number }>();
    assert.equal(persisted?.count, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it('stores honeypot submissions as spam without calling Turnstile and rejects invalid origins or tokens', async () => {
  const originalFetch = globalThis.fetch;
  let siteverifyCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    if (String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      siteverifyCalls += 1;
      return Response.json({ success: false });
    }
    return originalFetch(input);
  };
  try {
    const honeypot = await submit(validBody({ email: 'spam@example.invalid', website: 'automated content' }), { ip: '203.0.113.78' });
    assert.equal(honeypot.status, 202);
    assert.deepEqual(await honeypot.json(), { accepted: true });
    assert.equal(siteverifyCalls, 0);
    const spam = await db.prepare(`SELECT status,turnstile_verified FROM public_lead_submissions WHERE workspace_id=?
      AND email_normalized='spam@example.invalid'`).bind(workspace.workspaceId)
      .first<{ status: string; turnstile_verified: number }>();
    assert.deepEqual({ status: spam?.status, turnstileVerified: spam?.turnstile_verified }, { status: 'REJECTED_SPAM', turnstileVerified: 0 });

    const invalidOrigin = await submit(validBody({ email: 'origin@example.invalid' }), { origin: 'https://evil.example', ip: '203.0.113.79' });
    assert.equal(invalidOrigin.status, 403);
    const invalidToken = await submit(validBody({ email: 'challenge@example.invalid' }), { ip: '203.0.113.80' });
    assert.equal(invalidToken.status, 422);
    assert.equal((await invalidToken.json() as { code: string }).code, 'VALIDATION_FAILED');
    assert.equal(siteverifyCalls, 1);
    const preflight = await worker.fetch(new Request(`${apiOrigin}/api/public/leads`, {
      method: 'OPTIONS', headers: { Origin: 'https://www.firm.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
    }), env, {} as ExecutionContext);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://www.firm.example');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it('rejects a valid Turnstile response for a hostname outside the configured marketing host', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    ? Response.json({ success: true, hostname: 'attacker.example' }) : originalFetch(input);
  try {
    const response = await submit(validBody({ email: 'wrong-hostname@example.invalid' }));
    assert.equal(response.status, 422);
    assert.equal((await response.json() as { code: string }).code, 'VALIDATION_FAILED');
    const persisted = await db.prepare(`SELECT COUNT(*) AS count FROM public_lead_submissions WHERE workspace_id=?
      AND email_normalized='wrong-hostname@example.invalid'`).bind(workspace.workspaceId).first<{ count: number }>();
    assert.equal(persisted?.count, 0, 'a valid challenge for an unapproved hostname is not stored as an inquiry');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
