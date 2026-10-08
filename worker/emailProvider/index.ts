// Entry point for the standalone email-provider Worker.
//
// Deploy this Worker and bind it into the business Worker as EMAIL_PROVIDER (see
// docs/ops/integrations.md). It implements the provider contract
// consumed by worker/businessOutbox.ts (`POST /send` -> `{ messageId }`).

import { configuredRecipientAllowlist, emailProviderTransport, handleProviderSend, isConfiguredSenderAddress, type EmailProviderEnv } from './handler';

export default {
  async fetch(request: Request, env: EmailProviderEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      const transport = emailProviderTransport(env);
      const senderConfigured = isConfiguredSenderAddress(env.EMAIL_FROM);
      const recipientPolicyConfigured = configuredRecipientAllowlist(env.EMAIL_ALLOWED_RECIPIENTS) !== null;
      const ready = transport !== 'UNCONFIGURED' && senderConfigured && recipientPolicyConfigured;
      return new Response(JSON.stringify({ ok: ready, transport, senderConfigured, recipientPolicyConfigured }), {
        status: ready ? 200 : 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
    if (url.pathname === '/send') return handleProviderSend(request, env);
    return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
      status: 404, headers: { 'Content-Type': 'application/json' }
    });
  }
};
