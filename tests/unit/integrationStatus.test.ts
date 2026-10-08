import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emailTransportStatus } from '../../worker/integrations/status.js';
import type { Env } from '../../worker/env.js';

function envWithProvider(fetch: (input: RequestInfo | URL) => Promise<Response>): Env {
  return { EMAIL_PROVIDER: { fetch } } as unknown as Env;
}

describe('integration email provider readiness', () => {
  it('reports a service binding as configured only when its provider is ready', async () => {
    const ready = await emailTransportStatus(envWithProvider(async () => Response.json({ ok: true, senderConfigured: true })));
    assert.deepEqual(ready, { configured: true, transport: 'SERVICE_BINDING', providerReadiness: 'READY' });

    const missingSender = await emailTransportStatus(envWithProvider(async () => Response.json({ ok: false, senderConfigured: false })));
    assert.deepEqual(missingSender, { configured: false, transport: 'SERVICE_BINDING', providerReadiness: 'UNAVAILABLE' });
  });

  it('reports provider fetch failures as unavailable without exposing their details', async () => {
    const status = await emailTransportStatus(envWithProvider(async () => { throw new Error('private binding detail'); }));
    assert.deepEqual(status, { configured: false, transport: 'SERVICE_BINDING', providerReadiness: 'UNAVAILABLE' });
    assert.doesNotMatch(JSON.stringify(status), /private binding detail/);
  });

  it('marks a directly configured Cloudflare send binding as configured but unprobed', async () => {
    const status = await emailTransportStatus({ SEND_EMAIL: { send: async () => ({}) } } as unknown as Env);
    assert.deepEqual(status, { configured: true, transport: 'CLOUDFLARE_EMAIL_SERVICE', providerReadiness: 'NOT_PROBED' });
  });
});
