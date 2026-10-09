// US-GAP-05/06 regression: the email-provider Worker implements the EMAIL_PROVIDER
// contract and fails closed when no transport is configured.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configuredRecipientAllowlist, emailProviderTransport, handleProviderSend, isConfiguredSenderAddress, normalizeMessage } from '../../worker/emailProvider/handler.js';
import emailProvider from '../../worker/emailProvider/index.js';
import { emailRecipientSha256 } from '../../worker/emailProvider/recipientPolicy.js';
import type { EmailServiceMessage } from '../../worker/env.js';

type ProviderEnv = Parameters<typeof handleProviderSend>[1];

function sendRequest(fields: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request('https://email-provider.local/send', { method: 'POST', headers: { 'Idempotency-Key': 'idem-1' }, body: form });
}

describe('email-provider transport selection (US-GAP-05/06)', () => {
  it('prefers the transactional API only when both url and key are present', () => {
    assert.equal(emailProviderTransport({}), 'UNCONFIGURED');
    assert.equal(emailProviderTransport({ EMAIL_API_URL: 'https://api.test/send' }), 'UNCONFIGURED');
    assert.equal(emailProviderTransport({ EMAIL_API_URL: 'https://api.test/send', EMAIL_API_KEY: 'k' }), 'HTTP_API');
  });

  it('recognises both proposal and commercial message shapes', () => {
    const proposal = normalizeMessage({ recipient: { name: 'Sales Lead', email: 'ap@client.test' }, text: 'quote', proposalVersionId: 'p1' });
    assert.deepEqual(proposal.to, ['ap@client.test']);
    assert.match(proposal.subject, /Sales Lead/);
    const commercial = normalizeMessage({ to: 'cfo@client.test', recipientName: 'CFO', subject: 'Advance invoice', text: 'pay' });
    assert.deepEqual(commercial.to, ['cfo@client.test']);
    assert.equal(commercial.subject, 'Advance invoice');
  });

  it('accepts only a syntactically valid configured sender address', () => {
    assert.equal(isConfiguredSenderAddress('audit-dispatch@mail.steaudit.com'), true);
    assert.equal(isConfiguredSenderAddress(undefined), false);
    assert.equal(isConfiguredSenderAddress('no-reply@auditsphere.local'), false);
    assert.equal(isConfiguredSenderAddress('audit\r\nBcc: attacker@example.com'), false);
    assert.equal(isConfiguredSenderAddress('audit@example'), false);
  });

  it('requires a valid explicit recipient allowlist', () => {
    assert.equal(configuredRecipientAllowlist(undefined), null);
    assert.equal(configuredRecipientAllowlist('testing@mail.steauditing.com, invalid'), null);
    assert.deepEqual([...configuredRecipientAllowlist('Testing@mail.steauditing.com')!], ['testing@mail.steauditing.com']);
  });

  it('reports provider readiness only when both transport and sender are configured', async () => {
    const unavailable = await emailProvider.fetch(new Request('https://email-provider.local/health'), {} as ProviderEnv);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { ok: false, transport: 'UNCONFIGURED', senderConfigured: false, recipientPolicy: 'ALLOWLIST', recipientPolicyConfigured: false });
    const ready = await emailProvider.fetch(new Request('https://email-provider.local/health'), {
      SEND_EMAIL: { send: async () => ({}) }, EMAIL_FROM: 'audit-dispatch@mail.steaudit.com', EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com'
    } as ProviderEnv);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { ok: true, transport: 'CLOUDFLARE_EMAIL_SERVICE', senderConfigured: true, recipientPolicy: 'ALLOWLIST', recipientPolicyConfigured: true });
    const routed = await emailProvider.fetch(new Request('https://email-provider.local/health'), {
      SEND_EMAIL: { send: async () => ({}) }, EMAIL_FROM: 'audit-dispatch@mail.steaudit.com', EMAIL_RECIPIENT_POLICY: 'ROUTED'
    } as ProviderEnv);
    assert.deepEqual(await routed.json(), { ok: true, transport: 'CLOUDFLARE_EMAIL_SERVICE', senderConfigured: true, recipientPolicy: 'ROUTED', recipientPolicyConfigured: true });
  });

  it('returns a definite no-send rejection when no transport is configured', async () => {
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'testing@mail.steauditing.com', text: 'x' }) }), { EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com' } as ProviderEnv);
    assert.equal(response.status, 424);
    assert.equal((await response.json() as { error: string }).error, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  });

  it('rejects a request without a recipient', async () => {
    const env = { SEND_EMAIL: { send: async () => ({ messageId: 'unused' }) }, EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com' } as ProviderEnv;
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ text: 'no recipient' }) }), env);
    assert.equal(response.status, 400);
  });

  it('delivers through Cloudflare Email Service and returns the provider message id', async () => {
    const captured: EmailServiceMessage[] = [];
    const env = { SEND_EMAIL: { send: async (message: EmailServiceMessage) => { captured.push(message); return { messageId: 'email-service-42' }; } }, EMAIL_FROM: 'audit-dispatch@mail.steaudit.com', EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com' } as ProviderEnv;
    assert.equal(emailProviderTransport(env), 'CLOUDFLARE_EMAIL_SERVICE');
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'Testing@mail.steauditing.com', subject: 'Receipt', text: 'paid' }) }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { messageId: string }).messageId, 'email-service-42');
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].to, ['testing@mail.steauditing.com']);
    assert.deepEqual(captured[0].from, { email: 'audit-dispatch@mail.steaudit.com' });
    assert.equal(captured[0].subject, 'Receipt');
  });

  it('does not invent a traceable message id when Cloudflare accepts without returning one', async () => {
    const env = {
      SEND_EMAIL: { send: async () => ({}) },
      EMAIL_FROM: 'audit-dispatch@mail.steaudit.com',
      EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com'
    } as ProviderEnv;
    const response = await handleProviderSend(sendRequest({
      message: JSON.stringify({ to: 'testing@mail.steauditing.com', subject: 'Receipt', text: 'synthetic test' })
    }), env);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'EMAIL_PROVIDER_MESSAGE_ID_MISSING' });
  });

  it('requires the generic email API to return its real provider message id', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ accepted: true })) as typeof fetch;
    try {
      const env = {
        EMAIL_API_URL: 'https://api.example.org/send', EMAIL_API_KEY: 'test-key',
        EMAIL_FROM: 'audit-dispatch@mail.steaudit.com',
        EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com'
      } as ProviderEnv;
      const response = await handleProviderSend(sendRequest({
        message: JSON.stringify({ to: 'testing@mail.steauditing.com', subject: 'Receipt', text: 'synthetic test' })
      }), env);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'EMAIL_PROVIDER_MESSAGE_ID_MISSING' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('blocks unapproved recipients before either transport is called', async () => {
    let sendCount = 0;
    const env = {
      SEND_EMAIL: { send: async () => { sendCount++; return { messageId: 'must-not-send' }; } },
      EMAIL_FROM: 'audit-dispatch@mail.steaudit.com',
      EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com'
    } as ProviderEnv;
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'cfo@client.test', text: 'x' }) }), env);
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { error: string }).error, 'EMAIL_RECIPIENT_NOT_ALLOWED');
    assert.equal(sendCount, 0);
  });

  it('requires a matching route id and normalized recipient hash in ROUTED mode', async () => {
    let sendCount = 0;
    const recipient = 'Finance@client.example.com';
    const routeId = crypto.randomUUID();
    const recipientSha256 = await emailRecipientSha256(recipient);
    const env = {
      SEND_EMAIL: { send: async () => { sendCount++; return { messageId: 'routed-42' }; } },
      EMAIL_FROM: 'audit-dispatch@mail.steaudit.com', EMAIL_RECIPIENT_POLICY: 'ROUTED'
    } as ProviderEnv;
    const valid = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: recipient, routeId, recipientSha256, text: 'synthetic test' }) }), env);
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { messageId: 'routed-42', status: 'ACCEPTED' });
    const missingProof = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: recipient, text: 'synthetic test' }) }), env);
    assert.equal(missingProof.status, 403);
    const wrongHash = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: recipient, routeId, recipientSha256: '0'.repeat(64), text: 'synthetic test' }) }), env);
    assert.equal(wrongHash.status, 403);
    const blockedRole = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'no-reply@client.example.com', routeId, recipientSha256: await emailRecipientSha256('no-reply@client.example.com') }) }), env);
    assert.equal(blockedRole.status, 403);
    assert.equal(sendCount, 1, 'invalid route proof is rejected before transport');
  });

  it('sends through the Cloudflare Email Service REST API and returns recipient delivery status', async () => {
    const originalFetch = globalThis.fetch;
    let captured: { url: string; headers: Headers; body: Record<string, any> } | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      return Response.json({ success: true, result: { message_id: 'cloudflare-42', delivered: ['finance@client.example.com'], permanent_bounces: [], queued: [] } });
    }) as typeof fetch;
    try {
      const routeId = crypto.randomUUID();
      const recipient = 'finance@client.example.com';
      const form = new FormData();
      form.set('message', JSON.stringify({ to: recipient, routeId, recipientSha256: await emailRecipientSha256(recipient), subject: 'Invoice', text: 'Synthetic invoice' }));
      form.append('attachment', new Blob(['synthetic pdf bytes'], { type: 'application/pdf' }), 'invoice.pdf');
      const response = await handleProviderSend(new Request('https://email-provider.local/send', { method: 'POST', headers: { 'Idempotency-Key': 'cf-idem-42' }, body: form }), {
        EMAIL_API_URL: 'https://api.cloudflare.com/client/v4/accounts/test-account/email/sending/send',
        EMAIL_API_KEY: 'test-email-api-key', EMAIL_API_FORMAT: 'CLOUDFLARE_EMAIL_SERVICE_REST', EMAIL_RECIPIENT_POLICY: 'ROUTED',
        EMAIL_FROM: 'audit-dispatch@mail.steaudit.com', EMAIL_FROM_NAME: 'AuditSphere'
      } as ProviderEnv);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { messageId: 'cloudflare-42', status: 'DELIVERED' });
      assert.equal(captured?.url, 'https://api.cloudflare.com/client/v4/accounts/test-account/email/sending/send');
      assert.equal(captured?.headers.get('Authorization'), 'Bearer test-email-api-key');
      assert.equal(captured?.headers.get('Idempotency-Key'), 'cf-idem-42');
      assert.equal(captured?.body.to, recipient);
      assert.equal(captured?.body.from, 'audit-dispatch@mail.steaudit.com');
      assert.equal(captured?.body.attachments[0].filename, 'invoice.pdf');
      assert.equal(captured?.body.attachments[0].content, btoa('synthetic pdf bytes'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('maps Cloudflare REST queued, permanent-bounce and suppressed recipients to safe statuses', async () => {
    const originalFetch = globalThis.fetch;
    let responseResult: Record<string, unknown> = {};
    globalThis.fetch = (async () => Response.json({ success: true, result: responseResult })) as typeof fetch;
    try {
      const recipient = 'finance@client.example.com';
      const env = {
        EMAIL_API_URL: 'https://api.cloudflare.com/client/v4/accounts/test-account/email/sending/send',
        EMAIL_API_KEY: 'test-email-api-key', EMAIL_API_FORMAT: 'CLOUDFLARE_EMAIL_SERVICE_REST', EMAIL_RECIPIENT_POLICY: 'ROUTED',
        EMAIL_FROM: 'audit-dispatch@mail.steaudit.com'
      } as ProviderEnv;
      const sendForResult = async (result: Record<string, unknown>, messageId: string) => {
        responseResult = { message_id: messageId, delivered: [], permanent_bounces: [], queued: [], suppressed_recipients: [], ...result };
        const form = new FormData();
        form.set('message', JSON.stringify({ to: recipient, routeId: crypto.randomUUID(),
          recipientSha256: await emailRecipientSha256(recipient), subject: 'Synthetic', text: 'Synthetic test' }));
        return handleProviderSend(new Request('https://email-provider.local/send', { method: 'POST', body: form }), env);
      };

      const queued = await sendForResult({ queued: [recipient] }, 'cloudflare-queued');
      assert.deepEqual(await queued.json(), { messageId: 'cloudflare-queued', status: 'ACCEPTED' });
      const bounced = await sendForResult({ permanent_bounces: [recipient] }, 'cloudflare-bounced');
      assert.deepEqual(await bounced.json(), { messageId: 'cloudflare-bounced', status: 'BOUNCED' });
      const suppressed = await sendForResult({ suppressed_recipients: [recipient] }, 'cloudflare-suppressed');
      assert.deepEqual(await suppressed.json(), { messageId: 'cloudflare-suppressed', status: 'BOUNCED' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not use the HTTP API transport without an explicit recipient policy', async () => {
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'cfo@client.test', text: 'x' }) }), {
      EMAIL_API_URL: 'https://api.example.org/send', EMAIL_API_KEY: 'test-key', EMAIL_FROM: 'audit-dispatch@mail.steaudit.com'
    } as ProviderEnv);
    assert.equal(response.status, 424);
    assert.equal((await response.json() as { error: string }).error, 'EMAIL_RECIPIENT_POLICY_NOT_CONFIGURED');
  });

  it('blocks unapproved recipients before invoking the HTTP API transport', async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;
    globalThis.fetch = (async () => { requestCount++; return new Response('{}', { status: 200 }); }) as typeof fetch;
    try {
      const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'client@example.org', text: 'x' }) }), {
        EMAIL_API_URL: 'https://api.example.org/send', EMAIL_API_KEY: 'test-key', EMAIL_FROM: 'audit-dispatch@mail.steaudit.com',
        EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com'
      } as ProviderEnv);
      assert.equal(response.status, 403);
      assert.equal((await response.json() as { error: string }).error, 'EMAIL_RECIPIENT_NOT_ALLOWED');
      assert.equal(requestCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fails closed instead of using a synthetic sender address', async () => {
    const env = { SEND_EMAIL: { send: async () => ({ messageId: 'must-not-send' }) }, EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com' } as ProviderEnv;
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'testing@mail.steauditing.com', text: 'x' }) }), env);
    assert.equal(response.status, 424);
    assert.equal((await response.json() as { error: string }).error, 'EMAIL_SENDER_NOT_CONFIGURED');
  });

  it('reports a distinct failure when Cloudflare Email Service rejects the message', async () => {
    const env = { SEND_EMAIL: { send: async () => { throw new Error('Email Service unavailable'); } }, EMAIL_FROM: 'audit-dispatch@mail.steaudit.com', EMAIL_ALLOWED_RECIPIENTS: 'testing@mail.steauditing.com' } as ProviderEnv;
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'testing@mail.steauditing.com', text: 'x' }) }), env);
    assert.equal(response.status, 502);
    assert.equal((await response.json() as { error: string }).error, 'EMAIL_SERVICE_FAILED');
  });
});
