// Entry point for the standalone email-provider Worker.
//
// Deploy this Worker and bind it into the business Worker as EMAIL_PROVIDER (see
// docs/prototype/integration-configuration.md). It implements the provider contract
// consumed by worker/businessOutbox.ts (`POST /send` -> `{ messageId }`).

import { emailProviderTransport, handleProviderSend, type EmailProviderEnv } from './handler';

export default {
  async fetch(request: Request, env: EmailProviderEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, transport: emailProviderTransport(env) }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/send') return handleProviderSend(request, env);
    return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
      status: 404, headers: { 'Content-Type': 'application/json' }
    });
  }
};
