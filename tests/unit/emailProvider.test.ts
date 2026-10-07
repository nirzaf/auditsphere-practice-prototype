// US-GAP-05/06 regression: the email-provider Worker implements the EMAIL_PROVIDER
// contract and fails closed when no transport is configured.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emailProviderTransport, handleProviderSend, normalizeMessage } from '../../worker/emailProvider/handler.js';
import type { EmailRoutingMessage } from '../../worker/env.js';

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

  it('fails closed with 503 when no transport is configured', async () => {
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'cfo@client.test', text: 'x' }) }), {} as ProviderEnv);
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { error: string }).error, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  });

  it('rejects a request without a recipient', async () => {
    const env = { SEND_EMAIL: { send: async () => ({ messageId: 'unused' }) } } as ProviderEnv;
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ text: 'no recipient' }) }), env);
    assert.equal(response.status, 400);
  });

  it('delivers through Email Routing and returns the provider message id', async () => {
    const captured: EmailRoutingMessage[] = [];
    const env = { SEND_EMAIL: { send: async (message: EmailRoutingMessage) => { captured.push(message); return { messageId: 'routing-42' }; } } } as ProviderEnv;
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'cfo@client.test', subject: 'Receipt', text: 'paid' }) }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { messageId: string }).messageId, 'routing-42');
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].to, ['cfo@client.test']);
    assert.equal(captured[0].subject, 'Receipt');
  });

  it('reports a distinct failure when Email Routing rejects the message', async () => {
    const env = { SEND_EMAIL: { send: async () => { throw new Error('routing down'); } } } as ProviderEnv;
    const response = await handleProviderSend(sendRequest({ message: JSON.stringify({ to: 'cfo@client.test', text: 'x' }) }), env);
    assert.equal(response.status, 502);
    assert.equal((await response.json() as { error: string }).error, 'EMAIL_ROUTING_FAILED');
  });
});
